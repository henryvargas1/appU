import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  analyzeCapture,
  askAcademicAssistant,
  extractAssetText,
  generateSteps,
  isAiAvailable,
  keywords,
  summarizeNote,
  transcribeAudio,
  type ChatAction,
} from "./ai";
import {
  NotFoundError,
  addChatMessage,
  addStep,
  completeSession,
  completeTask,
  createInboxEntry,
  createNote,
  createSubject,
  createTask,
  createThread,
  createTranscript,
  deleteNote,
  deleteTask,
  exportUserData,
  getAttachmentByKey,
  getChatMessage,
  getInboxEntry,
  getNoteDetail,
  getOrCreateThread,
  getPlannerSnapshot,
  getPreferences,
  getSubjectDetail,
  getTaskDetail,
  getThread,
  getWeekView,
  listChatMessages,
  listCompletedTasks,
  listInbox,
  listRecentNotes,
  listSessions,
  listSubjects,
  listTasks,
  listThreads,
  listUpcomingReminders,
  markInboxEntry,
  reminderDone,
  renameThreadIfDefault,
  reopenTask,
  replaceSteps,
  replanSessions,
  rescheduleSession,
  searchContent,
  setAttachmentText,
  setChatMessageActions,
  snoozeReminder,
  snoozeTask,
  toggleStep,
  updateInboxEntry,
  updateNote,
  updatePreferences,
  updateSubject,
  updateTask,
} from "./db";
import { buildICalendar, buildMarkdownExport } from "./export";
import { addDays, startOfDay } from "./planner";
import { storageGetSignedUrl } from "./storage";
import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const id = z.number().int().positive();
const priority = z.enum(["low", "medium", "high", "critical"]);
const taskKind = z.enum(["task", "exam", "delivery"]);

const taskInput = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(4000).nullish(),
  kind: taskKind.optional(),
  subjectId: id.nullish(),
  dueAt: z.date().nullish(),
  priority: priority.optional(),
  complexity: z.number().int().min(1).max(5).optional(),
  estimatedMinutes: z.number().int().min(15).max(600).optional(),
  steps: z.array(z.string().max(240)).max(12).optional(),
});

/** Traduce errores de pertenencia a NOT_FOUND para no revelar datos ajenos. */
async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: error.message });
    if (error instanceof TRPCError) throw error;
    if (error instanceof Error && !/database|ECONN|ER_/i.test(error.message)) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw error;
  }
}

/** Mantiene el plan de sesiones al día sin bloquear la respuesta si falla. */
async function replan(userId: number) {
  await replanSessions(userId).catch((error) => console.warn("[Planner] replan failed", error instanceof Error ? error.message : "unknown"));
}

type StoredAction = ChatAction & { status: "proposed" | "applied" | "dismissed" | "done"; result?: string };

function parseActions(raw: string | null): StoredAction[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? (value as StoredAction[]) : [];
  } catch {
    return [];
  }
}

function formatSession(session: { title: string; scheduledFor: Date; durationMinutes: number }) {
  const day = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(session.scheduledFor);
  return `• ${day}: ${session.durationMinutes} min — ${session.title}`;
}

async function planSummary(userId: number) {
  const now = new Date();
  const [snapshot, sessions] = await Promise.all([getPlannerSnapshot(userId), listSessions(userId, now, addDays(startOfDay(now), 4))]);
  const planned = sessions.filter((session) => session.status === "planned").slice(0, 6);
  return [
    `Carga sugerida hoy: ${snapshot.recommendedMinutes} min. ${snapshot.nextAction}`,
    planned.length ? `Próximas sesiones:\n${planned.map(formatSession).join("\n")}` : "No hay sesiones planificadas.",
  ].join("\n");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(getSessionCookieName(ctx.req), { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  subject: router({
    list: protectedProcedure.input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(({ ctx, input }) => listSubjects(ctx.user.id, input?.includeArchived)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), color: z.string().max(16).optional() }))
      .mutation(({ ctx, input }) => createSubject(ctx.user.id, input.name, input.color)),
    update: protectedProcedure.input(z.object({ subjectId: id, name: z.string().trim().min(2).max(120).optional(), color: z.string().max(16).optional() }))
      .mutation(({ ctx, input }) => guard(() => updateSubject(ctx.user.id, input.subjectId, input))),
    archive: protectedProcedure.input(z.object({ subjectId: id, archived: z.boolean() }))
      .mutation(({ ctx, input }) => guard(() => updateSubject(ctx.user.id, input.subjectId, { isArchived: input.archived }))),
    detail: protectedProcedure.input(z.object({ subjectId: id }))
      .query(({ ctx, input }) => guard(() => getSubjectDetail(ctx.user.id, input.subjectId))),
  }),

  inbox: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const entries = await listInbox(ctx.user.id);
      return entries.map((entry) => ({ ...entry, suggestion: entry.suggestion ? (JSON.parse(entry.suggestion) as Record<string, unknown>) : null }));
    }),
    get: protectedProcedure.input(z.object({ entryId: id })).query(({ ctx, input }) => guard(async () => {
      const entry = await getInboxEntry(ctx.user.id, input.entryId);
      return { ...entry, suggestion: entry.suggestion ? (JSON.parse(entry.suggestion) as Record<string, unknown>) : null };
    })),
    /** Procesa una captura en la nube y la deja en la bandeja con una clasificación sugerida. */
    analyze: protectedProcedure.input(z.object({
      kind: z.enum(["text", "photo", "audio", "document"]),
      title: z.string().max(240).optional(),
      content: z.string().max(20_000).optional(),
      subjectId: id.nullish(),
      attachmentKey: z.string().max(512).optional(),
    })).mutation(({ ctx, input }) => guard(async () => {
      const userId = ctx.user.id;
      let text = input.content?.trim() ?? "";
      let attachment = null;
      let transcript: string | null = null;
      if (input.attachmentKey) {
        if (input.kind === "text") throw new TRPCError({ code: "BAD_REQUEST", message: "Una captura de texto no lleva archivo." });
        attachment = await getAttachmentByKey(userId, input.attachmentKey);
        const signedUrl = await storageGetSignedUrl(attachment.storageKey);
        if (input.kind === "audio") {
          const result = await transcribeAudio({ audioUrl: signedUrl });
          if (result.ok) {
            await createTranscript(userId, { attachmentId: attachment.id, text: result.text, language: result.language, segments: result.segments, durationSeconds: result.durationSeconds });
            transcript = result.text;
          }
          text = [text, result.text].filter(Boolean).join("\n\n");
        } else {
          const extracted = await extractAssetText({ url: signedUrl, kind: input.kind, mimeType: attachment.mimeType ?? "application/octet-stream" });
          await setAttachmentText(userId, attachment.id, extracted);
          text = [text, extracted].filter(Boolean).join("\n\n");
        }
      }
      const subjects = await listSubjects(userId);
      const suggestion = await analyzeCapture({ text: [input.title, text].filter(Boolean).join("\n"), kind: input.kind, subjects, now: new Date() });
      if (input.title?.trim()) suggestion.title = input.title.trim();
      if (input.subjectId) {
        const chosen = subjects.find((subject) => subject.id === input.subjectId);
        if (chosen) Object.assign(suggestion, { subjectId: chosen.id, subjectName: chosen.name });
      }
      const entry = await createInboxEntry(userId, {
        kind: input.kind,
        title: suggestion.title,
        content: text || undefined,
        subjectId: suggestion.subjectId,
        sourceUrl: attachment?.url,
        attachmentId: attachment?.id,
        suggestion,
      });
      return { entry, suggestion, transcript, aiAvailable: isAiAvailable() };
    })),
    /** El usuario confirma (y corrige) la clasificación: solo aquí se crean tareas o notas. */
    confirm: protectedProcedure.input(z.object({
      entryId: id,
      type: z.enum(["task", "exam", "delivery", "reminder", "note"]),
      title: z.string().trim().min(1).max(240),
      content: z.string().max(20_000).optional(),
      subjectId: id.nullish(),
      dueAt: z.date().nullish(),
      priority: priority.optional(),
      complexity: z.number().int().min(1).max(5).optional(),
      estimatedMinutes: z.number().int().min(15).max(600).optional(),
      steps: z.array(z.string().max(240)).max(12).optional(),
    })).mutation(({ ctx, input }) => guard(async () => {
      const userId = ctx.user.id;
      const entry = await getInboxEntry(userId, input.entryId);
      if (entry.processingStatus === "confirmed") throw new TRPCError({ code: "CONFLICT", message: "Esta captura ya fue confirmada." });
      const content = input.content ?? entry.content ?? "";
      let task = null;
      let note = null;
      if (input.type === "note") {
        note = await createNote(userId, { title: input.title, content: content || input.title, subjectId: input.subjectId, inboxEntryId: entry.id });
      } else {
        task = await createTask(userId, {
          title: input.title,
          description: content.length <= 4000 ? content || null : content.slice(0, 3990) + "…",
          kind: input.type === "exam" || input.type === "delivery" ? input.type : "task",
          subjectId: input.subjectId,
          dueAt: input.dueAt ?? null,
          priority: input.priority,
          complexity: input.complexity,
          estimatedMinutes: input.estimatedMinutes,
          sourceEntryId: entry.id,
          steps: input.steps,
        });
        // El material de clase (foto, audio, documento) se conserva también como nota consultable.
        if (entry.kind !== "text" && content.trim()) {
          note = await createNote(userId, { title: input.title, content, subjectId: input.subjectId, inboxEntryId: entry.id });
        }
        await replan(userId);
      }
      await updateInboxEntry(userId, entry.id, { title: input.title, subjectId: input.subjectId ?? null });
      await markInboxEntry(userId, entry.id, "confirmed");
      return { task, note };
    })),
    discard: protectedProcedure.input(z.object({ entryId: id }))
      .mutation(({ ctx, input }) => guard(async () => { await markInboxEntry(ctx.user.id, input.entryId, "discarded"); return { ok: true as const }; })),
  }),

  task: router({
    list: protectedProcedure.query(({ ctx }) => listTasks(ctx.user.id)),
    completed: protectedProcedure.query(({ ctx }) => listCompletedTasks(ctx.user.id)),
    get: protectedProcedure.input(z.object({ taskId: id })).query(({ ctx, input }) => guard(() => getTaskDetail(ctx.user.id, input.taskId))),
    create: protectedProcedure.input(taskInput).mutation(({ ctx, input }) => guard(async () => {
      const task = await createTask(ctx.user.id, input);
      await replan(ctx.user.id);
      return task;
    })),
    update: protectedProcedure.input(taskInput.partial().extend({ taskId: id })).mutation(({ ctx, input }) => guard(async () => {
      const { taskId, steps: _steps, ...patch } = input;
      const task = await updateTask(ctx.user.id, taskId, patch);
      await replan(ctx.user.id);
      return task;
    })),
    complete: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => guard(async () => {
      const task = await completeTask(ctx.user.id, input.taskId);
      await replan(ctx.user.id);
      return task;
    })),
    reopen: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => guard(async () => {
      const task = await reopenTask(ctx.user.id, input.taskId);
      await replan(ctx.user.id);
      return task;
    })),
    delete: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => guard(async () => {
      const result = await deleteTask(ctx.user.id, input.taskId);
      await replan(ctx.user.id);
      return result;
    })),
    snooze: protectedProcedure.input(z.object({ taskId: id, nextReminder: z.date() }))
      .mutation(({ ctx, input }) => guard(() => snoozeTask(ctx.user.id, input.taskId, input.nextReminder))),
    addStep: protectedProcedure.input(z.object({ taskId: id, title: z.string().trim().min(1).max(240) }))
      .mutation(({ ctx, input }) => guard(() => addStep(ctx.user.id, input.taskId, input.title))),
    toggleStep: protectedProcedure.input(z.object({ stepId: id })).mutation(({ ctx, input }) => guard(async () => {
      const result = await toggleStep(ctx.user.id, input.stepId);
      await replan(ctx.user.id);
      return result;
    })),
    generateSteps: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => guard(async () => {
      const { task } = await getTaskDetail(ctx.user.id, input.taskId);
      const steps = await generateSteps(task);
      const result = await replaceSteps(ctx.user.id, task.id, steps);
      await replan(ctx.user.id);
      return result;
    })),
  }),

  planner: router({
    snapshot: protectedProcedure.query(({ ctx }) => getPlannerSnapshot(ctx.user.id)),
    reminders: protectedProcedure.query(({ ctx }) => listUpcomingReminders(ctx.user.id)),
    week: protectedProcedure.input(z.object({ weekStart: z.date() })).query(({ ctx, input }) => getWeekView(ctx.user.id, input.weekStart)),
    replan: protectedProcedure.mutation(({ ctx }) => replanSessions(ctx.user.id)),
    completeSession: protectedProcedure.input(z.object({ sessionId: id }))
      .mutation(({ ctx, input }) => guard(() => completeSession(ctx.user.id, input.sessionId))),
    rescheduleSession: protectedProcedure.input(z.object({ sessionId: id, to: z.date().optional() }))
      .mutation(({ ctx, input }) => guard(() => rescheduleSession(ctx.user.id, input.sessionId, input.to))),
  }),

  reminder: router({
    done: protectedProcedure.input(z.object({ reminderId: id })).mutation(({ ctx, input }) => guard(async () => {
      const result = await reminderDone(ctx.user.id, input.reminderId);
      await replan(ctx.user.id);
      return result;
    })),
    snooze: protectedProcedure.input(z.object({ reminderId: id, minutes: z.number().int().min(5).max(7 * 24 * 60) }))
      .mutation(({ ctx, input }) => guard(() => snoozeReminder(ctx.user.id, input.reminderId, input.minutes))),
  }),

  note: router({
    list: protectedProcedure.query(({ ctx }) => listRecentNotes(ctx.user.id, 50)),
    get: protectedProcedure.input(z.object({ noteId: id })).query(({ ctx, input }) => guard(() => getNoteDetail(ctx.user.id, input.noteId))),
    update: protectedProcedure.input(z.object({ noteId: id, title: z.string().trim().min(1).max(240).optional(), content: z.string().max(20_000).optional(), subjectId: id.nullish() }))
      .mutation(({ ctx, input }) => guard(() => updateNote(ctx.user.id, input.noteId, input))),
    delete: protectedProcedure.input(z.object({ noteId: id })).mutation(({ ctx, input }) => guard(() => deleteNote(ctx.user.id, input.noteId))),
    summarize: protectedProcedure.input(z.object({ noteId: id })).mutation(({ ctx, input }) => guard(async () => {
      const { note } = await getNoteDetail(ctx.user.id, input.noteId);
      const summary = await summarizeNote(note);
      return updateNote(ctx.user.id, note.id, { summary });
    })),
    search: protectedProcedure.input(z.object({ query: z.string().trim().min(2).max(120) }))
      .query(({ ctx, input }) => searchContent(ctx.user.id, input.query, keywords(input.query))),
  }),

  chat: router({
    threads: protectedProcedure.query(({ ctx }) => listThreads(ctx.user.id)),
    newThread: protectedProcedure.mutation(({ ctx }) => createThread(ctx.user.id)),
    history: protectedProcedure.input(z.object({ threadId: id.optional() }).optional()).query(({ ctx, input }) => guard(async () => {
      const thread = input?.threadId ? await getThread(ctx.user.id, input.threadId) : await getOrCreateThread(ctx.user.id);
      const messages = await listChatMessages(ctx.user.id, thread.id);
      return { thread, messages: messages.map((message) => ({ ...message, actions: parseActions(message.actions) })) };
    })),
    send: protectedProcedure.input(z.object({ threadId: id.optional(), message: z.string().trim().min(1).max(4_000) })).mutation(({ ctx, input }) => guard(async () => {
      const userId = ctx.user.id;
      const now = new Date();
      const thread = input.threadId ? await getThread(userId, input.threadId) : await getOrCreateThread(userId);
      const history = await listChatMessages(userId, thread.id);
      await addChatMessage(userId, thread.id, "user", input.message);
      if (!history.length) await renameThreadIfDefault(userId, thread.id, input.message);

      const [activeTasks, subjects, found, recent, summary] = await Promise.all([
        listTasks(userId),
        listSubjects(userId, true),
        searchContent(userId, "", keywords(input.message)),
        listRecentNotes(userId, 8),
        planSummary(userId),
      ]);
      const subjectName = (subjectId: number | null) => subjects.find((subject) => subject.id === subjectId)?.name ?? null;
      const seen = new Set<number>();
      const contextNotes = [...found.notes, ...recent].filter((note) => (seen.has(note.id) ? false : (seen.add(note.id), true))).slice(0, 12);

      const reply = await askAcademicAssistant({
        message: input.message,
        now,
        history: history.map((message) => ({ role: message.role, content: message.content })),
        tasks: activeTasks.map((task) => ({ ...task, subjectName: subjectName(task.subjectId) })),
        notes: [
          ...contextNotes.map((note) => ({ ...note, subjectName: subjectName(note.subjectId) })),
          ...found.transcripts.slice(0, 3).map((item) => ({ id: -item.id, title: "Transcripción de audio", content: item.text, subjectName: null, createdAt: item.createdAt })),
        ],
        subjects: subjects.filter((subject) => !subject.isArchived),
        planSummary: summary,
      });

      // Acciones de solo lectura se ejecutan de inmediato; las que cambian datos quedan propuestas.
      const extra: string[] = [];
      const actions: StoredAction[] = [];
      for (const action of reply.actions) {
        if (action.type === "summarize_note") {
          if (action.noteId <= 0) continue;
          const { note } = await getNoteDetail(userId, action.noteId);
          const noteSummary = await summarizeNote(note);
          await updateNote(userId, note.id, { summary: noteSummary });
          extra.push(`Resumen de “${note.title}”:\n${noteSummary}`);
          actions.push({ ...action, status: "done" });
        } else if (action.type === "generate_plan") {
          await replanSessions(userId);
          extra.push(await planSummary(userId));
          actions.push({ ...action, status: "done" });
        } else {
          actions.push({ ...action, status: "proposed" });
        }
      }
      const answer = [reply.answer, ...extra].join("\n\n");
      await addChatMessage(userId, thread.id, "assistant", answer, actions);
      return { thread, answer, actions };
    })),
    /** Aplica una acción propuesta por el asistente tras la confirmación del usuario. */
    resolveAction: protectedProcedure.input(z.object({ messageId: id, index: z.number().int().min(0).max(10), accept: z.boolean() }))
      .mutation(({ ctx, input }) => guard(async () => {
        const userId = ctx.user.id;
        const message = await getChatMessage(userId, input.messageId);
        const actions = parseActions(message.actions);
        const action = actions[input.index];
        if (!action || action.status !== "proposed") throw new TRPCError({ code: "CONFLICT", message: "Esta acción ya fue resuelta." });
        if (!input.accept) {
          action.status = "dismissed";
        } else if (action.type === "create_task") {
          const task = await createTask(userId, {
            title: action.title,
            kind: action.kind,
            dueAt: action.dueAt ? new Date(action.dueAt) : null,
            priority: action.priority,
            complexity: action.complexity,
            subjectId: action.subjectId,
          });
          action.status = "applied";
          action.result = `Tarea creada (#${task.id})`;
          await replan(userId);
        } else if (action.type === "change_due_date") {
          const task = await updateTask(userId, action.taskId, { dueAt: new Date(action.dueAt) });
          action.status = "applied";
          action.result = `Fecha de “${task.title}” actualizada`;
          await replan(userId);
        }
        await setChatMessageActions(userId, message.id, actions);
        return { actions };
      })),
  }),

  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => ({ ...(await getPreferences(ctx.user.id)), aiAvailable: isAiAvailable() })),
    update: protectedProcedure.input(z.object({
      availability: z.array(z.number().int().min(0).max(600)).length(7).optional(),
      studyStartHour: z.number().int().min(5).max(22).optional(),
      remindersEnabled: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const prefs = await updatePreferences(ctx.user.id, input);
      await replan(ctx.user.id);
      return prefs;
    }),
  }),

  export: router({
    json: protectedProcedure.mutation(async ({ ctx }) => ({
      filename: `uniflow-${new Date().toISOString().slice(0, 10)}.json`,
      mimeType: "application/json",
      content: JSON.stringify({ exportedAt: new Date().toISOString(), user: { name: ctx.user.name, email: ctx.user.email }, ...(await exportUserData(ctx.user.id)) }, null, 2),
    })),
    markdown: protectedProcedure.mutation(async ({ ctx }) => {
      const data = await exportUserData(ctx.user.id);
      return {
        filename: `uniflow-notas-${new Date().toISOString().slice(0, 10)}.md`,
        mimeType: "text/markdown",
        content: buildMarkdownExport({ generatedAt: new Date(), subjects: data.subjects, tasks: data.tasks, notes: data.notes }),
      };
    }),
    calendar: protectedProcedure.mutation(async ({ ctx }) => {
      const data = await exportUserData(ctx.user.id);
      const now = new Date();
      const label = { task: "Tarea", exam: "Examen", delivery: "Entrega" } as const;
      const items = [
        ...data.tasks.filter((task) => task.dueAt && task.status !== "completed").map((task) => ({
          uid: `task-${task.id}@uniflow`,
          title: `${label[task.kind]}: ${task.title}`,
          start: task.dueAt!,
          durationMinutes: task.kind === "exam" ? 120 : 30,
          description: task.description ?? undefined,
          alarmsMinutesBefore: [24 * 60, 60],
        })),
        ...data.studySessions.filter((session) => session.status === "planned" && session.scheduledFor >= now).map((session) => ({
          uid: `session-${session.id}@uniflow`,
          title: `Estudio: ${session.title}`,
          start: session.scheduledFor,
          durationMinutes: session.durationMinutes,
          alarmsMinutesBefore: [10],
        })),
      ];
      return { filename: "uniflow.ics", mimeType: "text/calendar", content: buildICalendar(items, { name: "UniFlow", now }) };
    }),
  }),
});

export type AppRouter = typeof appRouter;
