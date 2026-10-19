import { z } from "zod";
import { askAcademicAssistant } from "./ai";
import {
  addChatMessage,
  completeTask,
  createInboxEntry,
  createNote,
  createSubject,
  createTask,
  getOrCreateThread,
  getPlannerSnapshot,
  listChatMessages,
  listCompletedTasks,
  listRecentNotes,
  listSubjects,
  listTasks,
  listUpcomingReminders,
  snoozeTask,
} from "./db";
import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const taskInput = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(4000).optional(),
  subjectId: z.number().int().positive().optional(),
  dueAt: z.date().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  complexity: z.number().int().min(1).max(5).optional(),
  estimatedMinutes: z.number().int().min(15).max(600).optional(),
});

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
    list: protectedProcedure.query(({ ctx }) => listSubjects(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(120), color: z.string().max(16).optional() })).mutation(({ ctx, input }) => createSubject(ctx.user.id, input.name, input.color)),
  }),

  task: router({
    list: protectedProcedure.query(({ ctx }) => listTasks(ctx.user.id)),
    completed: protectedProcedure.query(({ ctx }) => listCompletedTasks(ctx.user.id)),
    create: protectedProcedure.input(taskInput).mutation(({ ctx, input }) => createTask(ctx.user.id, input)),
    complete: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(({ ctx, input }) => completeTask(ctx.user.id, input.taskId)),
    snooze: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), nextReminder: z.date() })).mutation(({ ctx, input }) => snoozeTask(ctx.user.id, input.taskId, input.nextReminder)),
  }),

  capture: router({
    create: protectedProcedure.input(z.object({
      kind: z.enum(["text", "photo", "audio", "document"]),
      title: z.string().max(240).optional(),
      content: z.string().max(20_000).optional(),
      subjectId: z.number().int().positive().optional(),
      sourceUrl: z.string().max(2_000).optional(),
      asTask: z.boolean().optional(),
      dueAt: z.date().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      complexity: z.number().int().min(1).max(5).optional(),
      estimatedMinutes: z.number().int().min(15).max(600).optional(),
    })).mutation(async ({ ctx, input }) => {
      const entry = await createInboxEntry(ctx.user.id, input);
      let task = null;
      let note = null;
      if (input.asTask && input.title) {
        task = await createTask(ctx.user.id, {
          title: input.title,
          description: input.content,
          subjectId: input.subjectId,
          dueAt: input.dueAt,
          priority: input.priority,
          complexity: input.complexity,
          estimatedMinutes: input.estimatedMinutes,
          sourceEntryId: entry.id,
        });
      } else if (input.content) {
        note = await createNote(ctx.user.id, {
          title: input.title || "Captura de clase",
          content: input.content,
          subjectId: input.subjectId,
          inboxEntryId: entry.id,
        });
      }
      return { entry, task, note };
    }),
  }),

  planner: router({
    snapshot: protectedProcedure.query(({ ctx }) => getPlannerSnapshot(ctx.user.id)),
    reminders: protectedProcedure.query(({ ctx }) => listUpcomingReminders(ctx.user.id)),
  }),

  chat: router({
    history: protectedProcedure.query(async ({ ctx }) => {
      const thread = await getOrCreateThread(ctx.user.id);
      return { thread, messages: await listChatMessages(ctx.user.id, thread.id) };
    }),
    send: protectedProcedure.input(z.object({ message: z.string().min(1).max(4_000) })).mutation(async ({ ctx, input }) => {
      const thread = await getOrCreateThread(ctx.user.id);
      await addChatMessage(ctx.user.id, thread.id, "user", input.message);
      const [tasks, notes] = await Promise.all([listTasks(ctx.user.id), listRecentNotes(ctx.user.id)]);
      const answer = await askAcademicAssistant({ message: input.message, tasks, notes });
      await addChatMessage(ctx.user.id, thread.id, "assistant", answer);
      return { thread, answer };
    }),
  }),
});

export type AppRouter = typeof appRouter;
