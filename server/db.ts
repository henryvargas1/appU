import { and, asc, desc, eq, gte, inArray, isNull, like, lt, lte, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  attachments,
  chatMessages,
  chatThreads,
  inboxEntries,
  notes,
  reminders,
  studySessions,
  subjects,
  taskSteps,
  tasks,
  transcripts,
  userPreferences,
  users,
  type Task,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  addDays,
  dailyStudyMinutes,
  escalatePriority,
  isAtRisk,
  planSessions,
  rankTasks,
  reminderSchedule,
  startOfDay,
  startOfWeek,
  suggestedBlockMinutes,
  type PlannableTask,
  type Priority,
} from "./planner";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch {
      console.warn("[Database] Failed to connect");
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} no existe o no te pertenece`);
    this.name = "NotFoundError";
  }
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error("La base de datos no está disponible");
  return db;
}

function insertedId(result: unknown) {
  return Number((result as Array<{ insertId: number | bigint }>)[0].insertId);
}

const ACTIVE_STATUSES = ["pending", "in_progress", "overdue"] as const;

// ---------------------------------------------------------------------------
// Preferencias
// ---------------------------------------------------------------------------

export type Preferences = { availability: number[]; studyStartHour: number; remindersEnabled: boolean };

function parseAvailability(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown;
    if (Array.isArray(value) && value.length === 7) return value.map((item) => Math.max(0, Math.min(600, Number(item) || 0)));
  } catch {
    // valor corrupto: se usan los valores por defecto
  }
  return [0, 0, 0, 0, 0, 0, 0];
}

export async function getPreferences(userId: number): Promise<Preferences> {
  const db = await database();
  const row = (await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1))[0];
  return {
    availability: parseAvailability(row?.availability ?? "[]"),
    studyStartHour: row?.studyStartHour ?? 17,
    remindersEnabled: (row?.remindersEnabled ?? 1) === 1,
  };
}

export async function updatePreferences(userId: number, input: Partial<Preferences>) {
  const db = await database();
  const current = await getPreferences(userId);
  const next = { ...current, ...input };
  const values = {
    userId,
    availability: JSON.stringify(next.availability.map((item) => Math.max(0, Math.min(600, Math.round(item))))),
    studyStartHour: Math.max(5, Math.min(22, Math.round(next.studyStartHour))),
    remindersEnabled: next.remindersEnabled ? 1 : 0,
  };
  await db.insert(userPreferences).values(values).onDuplicateKeyUpdate({ set: values });
  return getPreferences(userId);
}

// ---------------------------------------------------------------------------
// Materias
// ---------------------------------------------------------------------------

export async function listSubjects(userId: number, includeArchived = false) {
  const db = await database();
  const filter = includeArchived ? eq(subjects.userId, userId) : and(eq(subjects.userId, userId), eq(subjects.isArchived, 0));
  return db.select().from(subjects).where(filter).orderBy(asc(subjects.isArchived), asc(subjects.name));
}

async function getSubject(userId: number, subjectId: number) {
  const db = await database();
  const row = (await db.select().from(subjects).where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId))).limit(1))[0];
  if (!row) throw new NotFoundError("La materia");
  return row;
}

/** Garantiza que una referencia a materia pertenezca al usuario. */
async function ownedSubjectId(userId: number, subjectId: number | null | undefined) {
  if (subjectId == null) return subjectId ?? null;
  await getSubject(userId, subjectId);
  return subjectId;
}

export async function createSubject(userId: number, name: string, color = "sage") {
  const db = await database();
  const id = insertedId(await db.insert(subjects).values({ userId, name, color }));
  return getSubject(userId, id);
}

export async function updateSubject(userId: number, subjectId: number, input: { name?: string; color?: string; isArchived?: boolean }) {
  const db = await database();
  await getSubject(userId, subjectId);
  await db.update(subjects).set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.isArchived !== undefined ? { isArchived: input.isArchived ? 1 : 0 } : {}),
  }).where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId)));
  return getSubject(userId, subjectId);
}

export async function getSubjectDetail(userId: number, subjectId: number) {
  const db = await database();
  const subject = await getSubject(userId, subjectId);
  const [subjectNotes, subjectTasks, entries] = await Promise.all([
    db.select().from(notes).where(and(eq(notes.userId, userId), eq(notes.subjectId, subjectId), isNull(notes.deletedAt))).orderBy(desc(notes.createdAt)).limit(50),
    db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.subjectId, subjectId), isNull(tasks.deletedAt))).orderBy(asc(tasks.status), asc(tasks.dueAt)).limit(50),
    db.select().from(inboxEntries).where(and(eq(inboxEntries.userId, userId), eq(inboxEntries.subjectId, subjectId), isNull(inboxEntries.deletedAt))).orderBy(desc(inboxEntries.createdAt)).limit(50),
  ]);
  const entryIds = entries.map((entry) => entry.id);
  const files = entryIds.length
    ? await db.select().from(attachments).where(and(eq(attachments.userId, userId), inArray(attachments.inboxEntryId, entryIds), isNull(attachments.deletedAt))).orderBy(desc(attachments.createdAt))
    : [];
  const fileIds = files.map((file) => file.id);
  const subjectTranscripts = fileIds.length
    ? await db.select().from(transcripts).where(and(eq(transcripts.userId, userId), inArray(transcripts.attachmentId, fileIds)))
    : [];
  const dates = subjectTasks.filter((task) => task.dueAt && task.status !== "completed").map((task) => ({ id: task.id, title: task.title, kind: task.kind, dueAt: task.dueAt! }));
  return { subject, notes: subjectNotes, tasks: subjectTasks, attachments: files, transcripts: subjectTranscripts, dates };
}

// ---------------------------------------------------------------------------
// Tareas, pasos y recordatorios
// ---------------------------------------------------------------------------

export async function listTasks(userId: number) {
  const db = await database();
  return db.select().from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.status, [...ACTIVE_STATUSES]), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.dueAt), desc(tasks.priority));
}

export async function listCompletedTasks(userId: number) {
  const db = await database();
  return db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"), isNull(tasks.deletedAt))).orderBy(desc(tasks.completedAt)).limit(20);
}

async function getOwnedTask(userId: number, taskId: number) {
  const db = await database();
  const row = (await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt))).limit(1))[0];
  if (!row) throw new NotFoundError("La tarea");
  return row;
}

export async function getTaskDetail(userId: number, taskId: number) {
  const db = await database();
  const task = await getOwnedTask(userId, taskId);
  const [steps, sessions, taskReminders, subject] = await Promise.all([
    db.select().from(taskSteps).where(and(eq(taskSteps.userId, userId), eq(taskSteps.taskId, taskId))).orderBy(asc(taskSteps.position)),
    db.select().from(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.taskId, taskId))).orderBy(asc(studySessions.scheduledFor)),
    db.select().from(reminders).where(and(eq(reminders.userId, userId), eq(reminders.taskId, taskId))).orderBy(asc(reminders.scheduledFor)),
    task.subjectId ? db.select().from(subjects).where(and(eq(subjects.id, task.subjectId), eq(subjects.userId, userId))).limit(1) : Promise.resolve([]),
  ]);
  return { task, steps, sessions, reminders: taskReminders, subject: subject[0] ?? null };
}

export type NewTaskInput = {
  title: string;
  description?: string | null;
  kind?: "task" | "exam" | "delivery";
  subjectId?: number | null;
  dueAt?: Date | null;
  priority?: Priority;
  complexity?: number;
  estimatedMinutes?: number;
  sourceEntryId?: number;
  steps?: string[];
};

async function scheduleReminders(userId: number, task: Pick<Task, "id" | "title" | "dueAt">) {
  const db = await database();
  await db.update(reminders).set({ status: "dismissed" })
    .where(and(eq(reminders.userId, userId), eq(reminders.taskId, task.id), inArray(reminders.status, ["scheduled", "sent", "snoozed"])));
  if (!task.dueAt) return;
  const schedule = reminderSchedule(task.dueAt, new Date());
  if (schedule.length) {
    await db.insert(reminders).values(schedule.map((item) => ({ userId, taskId: task.id, title: task.title, scheduledFor: item.date, stage: item.stage })));
  }
}

export async function createTask(userId: number, input: NewTaskInput) {
  const db = await database();
  const complexity = Math.min(5, Math.max(1, input.complexity ?? 2));
  const estimatedMinutes = Math.max(15, input.estimatedMinutes ?? complexity * complexity * 15);
  const subjectId = await ownedSubjectId(userId, input.subjectId);
  const id = insertedId(await db.insert(tasks).values({
    userId,
    title: input.title,
    description: input.description ?? null,
    kind: input.kind ?? "task",
    subjectId,
    dueAt: input.dueAt ?? null,
    priority: input.priority ?? (complexity >= 4 ? "high" : "medium"),
    complexity,
    estimatedMinutes,
    sourceEntryId: input.sourceEntryId,
  }));
  if (input.steps?.length) await replaceSteps(userId, id, input.steps, estimatedMinutes);
  const task = await getOwnedTask(userId, id);
  await scheduleReminders(userId, task);
  return task;
}

export async function updateTask(userId: number, taskId: number, input: Partial<Omit<NewTaskInput, "steps" | "sourceEntryId">>) {
  const db = await database();
  const current = await getOwnedTask(userId, taskId);
  const subjectId = input.subjectId !== undefined ? await ownedSubjectId(userId, input.subjectId) : undefined;
  const dueChanged = input.dueAt !== undefined && (input.dueAt?.getTime() ?? null) !== (current.dueAt?.getTime() ?? null);
  const reopen = dueChanged && current.status === "overdue" && input.dueAt && input.dueAt.getTime() > Date.now();
  await db.update(tasks).set({
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(subjectId !== undefined ? { subjectId } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.complexity !== undefined ? { complexity: Math.min(5, Math.max(1, input.complexity)) } : {}),
    ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: Math.max(15, input.estimatedMinutes) } : {}),
    ...(reopen ? { status: "pending" as const } : {}),
  }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  const task = await getOwnedTask(userId, taskId);
  if ((dueChanged || input.title !== undefined) && task.status !== "completed") await scheduleReminders(userId, task);
  return task;
}

/** "Ya está hecho": completa la tarea y detiene sus recordatorios. */
export async function completeTask(userId: number, taskId: number) {
  const db = await database();
  await getOwnedTask(userId, taskId);
  const now = new Date();
  await db.update(tasks).set({ status: "completed", completedAt: now }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  await db.update(reminders).set({ status: "done", actedAt: now })
    .where(and(eq(reminders.taskId, taskId), eq(reminders.userId, userId), inArray(reminders.status, ["scheduled", "sent", "snoozed"])));
  await db.update(studySessions).set({ status: "skipped" })
    .where(and(eq(studySessions.taskId, taskId), eq(studySessions.userId, userId), eq(studySessions.status, "planned"), gte(studySessions.scheduledFor, now)));
  return getOwnedTask(userId, taskId);
}

export async function reopenTask(userId: number, taskId: number) {
  const db = await database();
  const current = await getOwnedTask(userId, taskId);
  const status = current.dueAt && current.dueAt.getTime() < Date.now() ? "overdue" : "pending";
  await db.update(tasks).set({ status, completedAt: null }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  const task = await getOwnedTask(userId, taskId);
  if (status === "pending") await scheduleReminders(userId, task);
  return task;
}

/** Eliminación lógica: la tarea se oculta pero se conserva para exportación e historial. */
export async function deleteTask(userId: number, taskId: number) {
  const db = await database();
  await getOwnedTask(userId, taskId);
  await db.update(tasks).set({ deletedAt: new Date() }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  await db.update(reminders).set({ status: "dismissed" }).where(and(eq(reminders.taskId, taskId), eq(reminders.userId, userId), inArray(reminders.status, ["scheduled", "sent", "snoozed"])));
  await db.update(studySessions).set({ status: "skipped" }).where(and(eq(studySessions.taskId, taskId), eq(studySessions.userId, userId), eq(studySessions.status, "planned")));
  return { ok: true as const };
}

export async function replaceSteps(userId: number, taskId: number, titles: string[], totalMinutes?: number) {
  const db = await database();
  const task = await getOwnedTask(userId, taskId);
  await db.delete(taskSteps).where(and(eq(taskSteps.userId, userId), eq(taskSteps.taskId, taskId), eq(taskSteps.status, "pending")));
  const kept = await db.select().from(taskSteps).where(and(eq(taskSteps.userId, userId), eq(taskSteps.taskId, taskId)));
  const clean = titles.map((title) => title.trim()).filter(Boolean).slice(0, 12);
  if (clean.length) {
    const minutes = Math.max(15, Math.round((totalMinutes ?? task.estimatedMinutes) / clean.length / 5) * 5);
    await db.insert(taskSteps).values(clean.map((title, index) => ({ userId, taskId, title: title.slice(0, 240), position: kept.length + index, estimatedMinutes: minutes })));
  }
  return db.select().from(taskSteps).where(and(eq(taskSteps.userId, userId), eq(taskSteps.taskId, taskId))).orderBy(asc(taskSteps.position));
}

export async function addStep(userId: number, taskId: number, title: string) {
  const db = await database();
  await getOwnedTask(userId, taskId);
  const existing = await db.select().from(taskSteps).where(and(eq(taskSteps.userId, userId), eq(taskSteps.taskId, taskId)));
  await db.insert(taskSteps).values({ userId, taskId, title, position: existing.length });
  return { ok: true as const };
}

export async function toggleStep(userId: number, stepId: number) {
  const db = await database();
  const step = (await db.select().from(taskSteps).where(and(eq(taskSteps.id, stepId), eq(taskSteps.userId, userId))).limit(1))[0];
  if (!step) throw new NotFoundError("El paso");
  const done = step.status !== "completed";
  await db.update(taskSteps).set({ status: done ? "completed" : "pending", completedAt: done ? new Date() : null }).where(and(eq(taskSteps.id, stepId), eq(taskSteps.userId, userId)));
  return { ok: true as const, completed: done };
}

export async function listUpcomingReminders(userId: number) {
  const db = await database();
  const now = new Date();
  return db.select().from(reminders)
    .where(and(
      eq(reminders.userId, userId),
      or(
        and(eq(reminders.status, "scheduled"), gte(reminders.scheduledFor, now)),
        // Avisos ya entregados que siguen esperando "Ya está hecho" o "Posponer".
        and(eq(reminders.status, "sent"), gte(reminders.scheduledFor, addDays(now, -2))),
      ),
    ))
    .orderBy(asc(reminders.scheduledFor))
    .limit(40);
}

async function getOwnedReminder(userId: number, reminderId: number) {
  const db = await database();
  const row = (await db.select().from(reminders).where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId))).limit(1))[0];
  if (!row) throw new NotFoundError("El recordatorio");
  return row;
}

export async function reminderDone(userId: number, reminderId: number) {
  const reminder = await getOwnedReminder(userId, reminderId);
  if (reminder.taskId) return { task: await completeTask(userId, reminder.taskId) };
  const db = await database();
  await db.update(reminders).set({ status: "done", actedAt: new Date() }).where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));
  return { task: null };
}

/** Pospone un aviso sin pasar de la fecha límite de la tarea. */
export async function snoozeReminder(userId: number, reminderId: number, minutes: number) {
  const db = await database();
  const reminder = await getOwnedReminder(userId, reminderId);
  const task = reminder.taskId ? await getOwnedTask(userId, reminder.taskId) : null;
  const now = new Date();
  let next = new Date(now.getTime() + minutes * 60_000);
  if (task?.dueAt && next.getTime() > task.dueAt.getTime()) next = task.dueAt;
  if (task?.dueAt && task.dueAt.getTime() <= now.getTime()) throw new Error("La fecha límite ya pasó; revisa la tarea manualmente.");
  await db.update(reminders).set({ status: "snoozed", actedAt: now }).where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));
  const id = insertedId(await db.insert(reminders).values({ userId, taskId: reminder.taskId, title: reminder.title, scheduledFor: next, stage: "reinforced" }));
  return getOwnedReminder(userId, id);
}

export async function snoozeTask(userId: number, taskId: number, nextReminder: Date) {
  const db = await database();
  const task = await getOwnedTask(userId, taskId);
  const when = task.dueAt && nextReminder > task.dueAt ? task.dueAt : nextReminder;
  await db.insert(reminders).values({ userId, taskId, title: task.title, scheduledFor: when, stage: "reinforced" });
  return { ok: true as const };
}

/**
 * Tarea programada en la nube: entrega los avisos que llegaron a su hora y, si una
 * fecha límite pasó sin confirmación, marca la tarea como vencida y detiene la insistencia.
 */
export async function processScheduledReminders(now = new Date()) {
  const db = await getDb();
  if (!db) return { delivered: 0, overdue: 0, expired: 0 };
  const delivered = await db.update(reminders).set({ status: "sent" })
    .where(and(eq(reminders.status, "scheduled"), lte(reminders.scheduledFor, now)));
  const late = await db.select({ id: tasks.id, userId: tasks.userId }).from(tasks)
    .where(and(inArray(tasks.status, ["pending", "in_progress"]), lt(tasks.dueAt, now), isNull(tasks.deletedAt)));
  let expired = 0;
  if (late.length) {
    const ids = late.map((task) => task.id);
    await db.update(tasks).set({ status: "overdue" }).where(inArray(tasks.id, ids));
    const result = await db.update(reminders).set({ status: "expired" })
      .where(and(inArray(reminders.taskId, ids), inArray(reminders.status, ["scheduled", "sent", "snoozed"])));
    expired = result[0]?.affectedRows ?? 0;
  }
  return { delivered: delivered[0]?.affectedRows ?? 0, overdue: late.length, expired };
}

// ---------------------------------------------------------------------------
// Sesiones de estudio y planificación
// ---------------------------------------------------------------------------

async function plannableTasks(userId: number) {
  const db = await database();
  const active = await listTasks(userId);
  if (!active.length) return [];
  const ids = active.map((task) => task.id);
  const [done, steps] = await Promise.all([
    db.select().from(studySessions).where(and(eq(studySessions.userId, userId), inArray(studySessions.taskId, ids), eq(studySessions.status, "completed"))),
    db.select().from(taskSteps).where(and(eq(taskSteps.userId, userId), inArray(taskSteps.taskId, ids), eq(taskSteps.status, "pending"))),
  ]);
  return active.map((task) => ({
    ...task,
    spentMinutes: done.filter((session) => session.taskId === task.id).reduce((sum, session) => sum + session.durationMinutes, 0),
    stepsRemaining: steps.filter((step) => step.taskId === task.id).length,
  }));
}

/** Recalcula las sesiones futuras planificadas. Las completadas, omitidas o reprogramadas se conservan. */
export async function replanSessions(userId: number) {
  const db = await database();
  const now = new Date();
  const [items, prefs] = await Promise.all([plannableTasks(userId), getPreferences(userId)]);
  await db.delete(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.status, "planned"), gte(studySessions.scheduledFor, now), isNull(studySessions.rescheduledFromId)));
  const kept = await db.select().from(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.status, "planned"), gte(studySessions.scheduledFor, now)));
  // Las sesiones reprogramadas por el usuario cuentan como tiempo ya asignado.
  const adjusted: PlannableTask[] = items.map((task) => ({
    ...task,
    spentMinutes: task.spentMinutes + kept.filter((session) => session.taskId === task.id).reduce((sum, session) => sum + session.durationMinutes, 0),
  }));
  const plan = planSessions(adjusted, { now, availability: prefs.availability, startHour: prefs.studyStartHour });
  if (plan.length) {
    await db.insert(studySessions).values(plan.map((session) => ({ userId, taskId: session.taskId, title: session.title, scheduledFor: session.scheduledFor, durationMinutes: session.durationMinutes })));
  }
  return { planned: plan.length };
}

export async function listSessions(userId: number, from: Date, to: Date) {
  const db = await database();
  return db.select().from(studySessions)
    .where(and(eq(studySessions.userId, userId), gte(studySessions.scheduledFor, from), lt(studySessions.scheduledFor, to)))
    .orderBy(asc(studySessions.scheduledFor));
}

async function getOwnedSession(userId: number, sessionId: number) {
  const db = await database();
  const row = (await db.select().from(studySessions).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId))).limit(1))[0];
  if (!row) throw new NotFoundError("La sesión");
  return row;
}

export async function completeSession(userId: number, sessionId: number) {
  const db = await database();
  await getOwnedSession(userId, sessionId);
  await db.update(studySessions).set({ status: "completed", completedAt: new Date() }).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)));
  return getOwnedSession(userId, sessionId);
}

/**
 * Reprograma una sesión incompleta: la original queda como "rescheduled" (historial)
 * y se crea una nueva. Si el retraso pone en riesgo la entrega, se eleva la prioridad.
 */
export async function rescheduleSession(userId: number, sessionId: number, to?: Date) {
  const db = await database();
  const session = await getOwnedSession(userId, sessionId);
  if (session.status === "completed") throw new Error("La sesión ya está completada.");
  const prefs = await getPreferences(userId);
  const now = new Date();
  let when = to;
  if (!when) {
    when = addDays(startOfDay(now), 1);
    when.setHours(prefs.studyStartHour, 0, 0, 0);
  }
  const task = session.taskId ? await getOwnedTask(userId, session.taskId).catch(() => null) : null;
  if (task?.dueAt && when.getTime() >= task.dueAt.getTime()) {
    when = new Date(Math.max(now.getTime() + 15 * 60_000, task.dueAt.getTime() - (session.durationMinutes + 30) * 60_000));
  }
  await db.update(studySessions).set({ status: "rescheduled" }).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)));
  const id = insertedId(await db.insert(studySessions).values({
    userId,
    taskId: session.taskId,
    title: session.title,
    scheduledFor: when,
    durationMinutes: session.durationMinutes,
    rescheduledFromId: session.id,
  }));

  let escalated = false;
  if (task) {
    const all = await plannableTasks(userId);
    const item = all.find((candidate) => candidate.id === task.id);
    const load = dailyStudyMinutes(all, now);
    if (item && isAtRisk(item, now, Math.max(load, 30)) && task.priority !== "critical") {
      await db.update(tasks).set({ priority: escalatePriority(task.priority) }).where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)));
      escalated = true;
    }
  }
  return { session: await getOwnedSession(userId, id), escalated };
}

export async function getPlannerSnapshot(userId: number) {
  const now = new Date();
  const items = await plannableTasks(userId);
  const ranked = rankTasks(items, now).map((task) => ({ ...task, atRisk: isAtRisk(task, now), blockMinutes: suggestedBlockMinutes(task, now) }));
  const recommendedMinutes = dailyStudyMinutes(items, now);
  const next = ranked[0];
  const todayStart = startOfDay(now);
  const [todaySessions, progress] = await Promise.all([listSessions(userId, todayStart, addDays(todayStart, 1)), getWeeklyProgress(userId)]);
  return {
    tasks: ranked.slice(0, 10),
    totalActive: items.length,
    overdue: items.filter((task) => task.status === "overdue").length,
    recommendedMinutes,
    todaySessions,
    progress,
    nextAction: next
      ? `Avanza ${next.blockMinutes || 15} min en “${next.title}”.`
      : "No tienes tareas pendientes. Captura algo nuevo cuando lo necesites.",
  };
}

export async function getWeeklyProgress(userId: number) {
  const db = await database();
  const from = startOfWeek(new Date());
  const to = addDays(from, 7);
  const [weekTasks, weekSessions] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), or(
      and(gte(tasks.dueAt, from), lt(tasks.dueAt, to)),
      and(gte(tasks.completedAt, from), lt(tasks.completedAt, to)),
    ))),
    listSessions(userId, from, to),
  ]);
  const doneTasks = weekTasks.filter((task) => task.status === "completed").length;
  const relevantSessions = weekSessions.filter((session) => session.status !== "rescheduled" && session.status !== "skipped");
  const doneMinutes = relevantSessions.filter((session) => session.status === "completed").reduce((sum, session) => sum + session.durationMinutes, 0);
  const plannedMinutes = relevantSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const units = weekTasks.length + relevantSessions.length;
  const doneUnits = doneTasks + relevantSessions.filter((session) => session.status === "completed").length;
  return {
    weekStart: from,
    tasksDone: doneTasks,
    tasksTotal: weekTasks.length,
    minutesDone: doneMinutes,
    minutesPlanned: plannedMinutes,
    percent: units ? Math.round((doneUnits / units) * 100) : 0,
  };
}

export async function getWeekView(userId: number, weekStart: Date) {
  const from = startOfWeek(weekStart);
  const to = addDays(from, 7);
  const db = await database();
  const [weekTasks, weekSessions] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), gte(tasks.dueAt, from), lt(tasks.dueAt, to))).orderBy(asc(tasks.dueAt)),
    listSessions(userId, from, to),
  ]);
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(from, index);
    const end = addDays(day, 1);
    const inDay = (date: Date | null) => !!date && date >= day && date < end;
    return {
      date: day,
      tasks: weekTasks.filter((task) => inDay(task.dueAt)),
      sessions: weekSessions.filter((session) => inDay(session.scheduledFor) && session.status !== "rescheduled"),
    };
  });
}

// ---------------------------------------------------------------------------
// Bandeja de entrada, adjuntos y notas
// ---------------------------------------------------------------------------

type CaptureKind = "text" | "photo" | "audio" | "document";

export async function createInboxEntry(userId: number, input: { kind: CaptureKind; title?: string; content?: string; subjectId?: number | null; sourceUrl?: string; attachmentId?: number; suggestion?: unknown }) {
  const db = await database();
  const subjectId = await ownedSubjectId(userId, input.subjectId);
  const id = insertedId(await db.insert(inboxEntries).values({
    userId,
    kind: input.kind,
    title: input.title,
    content: input.content,
    subjectId,
    sourceUrl: input.sourceUrl,
    attachmentId: input.attachmentId,
    suggestion: input.suggestion ? JSON.stringify(input.suggestion) : null,
    processingStatus: "needs_review",
  }));
  if (input.attachmentId) {
    await db.update(attachments).set({ inboxEntryId: id }).where(and(eq(attachments.id, input.attachmentId), eq(attachments.userId, userId)));
  }
  return getInboxEntry(userId, id);
}

export async function getInboxEntry(userId: number, entryId: number) {
  const db = await database();
  const row = (await db.select().from(inboxEntries).where(and(eq(inboxEntries.id, entryId), eq(inboxEntries.userId, userId), isNull(inboxEntries.deletedAt))).limit(1))[0];
  if (!row) throw new NotFoundError("La captura");
  return row;
}

export async function listInbox(userId: number) {
  const db = await database();
  return db.select().from(inboxEntries)
    .where(and(eq(inboxEntries.userId, userId), eq(inboxEntries.processingStatus, "needs_review"), isNull(inboxEntries.deletedAt)))
    .orderBy(desc(inboxEntries.createdAt))
    .limit(50);
}

export async function markInboxEntry(userId: number, entryId: number, status: "confirmed" | "discarded") {
  const db = await database();
  await getInboxEntry(userId, entryId);
  await db.update(inboxEntries).set({ processingStatus: status, ...(status === "discarded" ? { deletedAt: new Date() } : {}) })
    .where(and(eq(inboxEntries.id, entryId), eq(inboxEntries.userId, userId)));
}

export async function updateInboxEntry(userId: number, entryId: number, input: { title?: string; content?: string; subjectId?: number | null }) {
  const db = await database();
  await getInboxEntry(userId, entryId);
  const subjectId = input.subjectId !== undefined ? await ownedSubjectId(userId, input.subjectId) : undefined;
  await db.update(inboxEntries).set({
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(subjectId !== undefined ? { subjectId } : {}),
  }).where(and(eq(inboxEntries.id, entryId), eq(inboxEntries.userId, userId)));
}

export async function createAttachment(userId: number, input: { kind: "photo" | "audio" | "document"; storageKey: string; url: string; filename?: string; mimeType?: string; sizeBytes?: number }) {
  const db = await database();
  const id = insertedId(await db.insert(attachments).values({ userId, ...input }));
  return (await db.select().from(attachments).where(eq(attachments.id, id)).limit(1))[0];
}

/** Busca un adjunto por su clave de almacenamiento, solo si pertenece al usuario. */
export async function getAttachmentByKey(userId: number, storageKey: string) {
  const db = await database();
  const row = (await db.select().from(attachments).where(and(eq(attachments.storageKey, storageKey), eq(attachments.userId, userId), isNull(attachments.deletedAt))).limit(1))[0];
  if (!row) throw new NotFoundError("El archivo");
  return row;
}

export async function setAttachmentText(userId: number, attachmentId: number, extractedText: string) {
  const db = await database();
  await db.update(attachments).set({ extractedText }).where(and(eq(attachments.id, attachmentId), eq(attachments.userId, userId)));
}

export async function createTranscript(userId: number, input: { attachmentId: number; text: string; language: string; segments: unknown[]; durationSeconds: number | null }) {
  const db = await database();
  await db.insert(transcripts).values({ userId, attachmentId: input.attachmentId, text: input.text, language: input.language, segments: JSON.stringify(input.segments), durationSeconds: input.durationSeconds });
}

export async function createNote(userId: number, input: { title: string; content: string; subjectId?: number | null; inboxEntryId?: number }) {
  const db = await database();
  const subjectId = await ownedSubjectId(userId, input.subjectId);
  const id = insertedId(await db.insert(notes).values({ userId, ...input, subjectId }));
  return getNote(userId, id);
}

export async function getNote(userId: number, noteId: number) {
  const db = await database();
  const row = (await db.select().from(notes).where(and(eq(notes.id, noteId), eq(notes.userId, userId), isNull(notes.deletedAt))).limit(1))[0];
  if (!row) throw new NotFoundError("La nota");
  return row;
}

export async function getNoteDetail(userId: number, noteId: number) {
  const db = await database();
  const note = await getNote(userId, noteId);
  const entry = note.inboxEntryId
    ? (await db.select().from(inboxEntries).where(and(eq(inboxEntries.id, note.inboxEntryId), eq(inboxEntries.userId, userId))).limit(1))[0]
    : undefined;
  const attachment = entry?.attachmentId
    ? (await db.select().from(attachments).where(and(eq(attachments.id, entry.attachmentId), eq(attachments.userId, userId))).limit(1))[0]
    : undefined;
  const transcript = attachment
    ? (await db.select().from(transcripts).where(and(eq(transcripts.attachmentId, attachment.id), eq(transcripts.userId, userId))).limit(1))[0]
    : undefined;
  return { note, attachment: attachment ?? null, transcript: transcript ?? null };
}

export async function updateNote(userId: number, noteId: number, input: { title?: string; content?: string; subjectId?: number | null; summary?: string | null }) {
  const db = await database();
  await getNote(userId, noteId);
  const subjectId = input.subjectId !== undefined ? await ownedSubjectId(userId, input.subjectId) : undefined;
  await db.update(notes).set({
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(subjectId !== undefined ? { subjectId } : {}),
  }).where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
  return getNote(userId, noteId);
}

export async function deleteNote(userId: number, noteId: number) {
  const db = await database();
  await getNote(userId, noteId);
  await db.update(notes).set({ deletedAt: new Date() }).where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
  return { ok: true as const };
}

export async function listRecentNotes(userId: number, limit = 12) {
  const db = await database();
  return db.select().from(notes).where(and(eq(notes.userId, userId), isNull(notes.deletedAt))).orderBy(desc(notes.updatedAt)).limit(limit);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Búsqueda de texto en notas, tareas y transcripciones del usuario. */
export async function searchContent(userId: number, query: string, words: string[] = []) {
  const db = await database();
  const terms = [query, ...words].map((term) => term.trim()).filter((term) => term.length >= 2).slice(0, 6);
  if (!terms.length) return { notes: [], tasks: [], transcripts: [] };
  const patterns = terms.map((term) => `%${escapeLike(term)}%`);
  const [noteRows, taskRows, transcriptRows] = await Promise.all([
    db.select().from(notes).where(and(eq(notes.userId, userId), isNull(notes.deletedAt), or(...patterns.flatMap((pattern) => [like(notes.title, pattern), like(notes.content, pattern)])))).orderBy(desc(notes.updatedAt)).limit(20),
    db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), or(...patterns.flatMap((pattern) => [like(tasks.title, pattern), like(tasks.description, pattern)])))).orderBy(desc(tasks.updatedAt)).limit(20),
    db.select().from(transcripts).where(and(eq(transcripts.userId, userId), or(...patterns.map((pattern) => like(transcripts.text, pattern))))).orderBy(desc(transcripts.createdAt)).limit(10),
  ]);
  return { notes: noteRows, tasks: taskRows, transcripts: transcriptRows };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function listThreads(userId: number) {
  const db = await database();
  return db.select().from(chatThreads).where(eq(chatThreads.userId, userId)).orderBy(desc(chatThreads.updatedAt)).limit(30);
}

export async function createThread(userId: number, title?: string) {
  const db = await database();
  const id = insertedId(await db.insert(chatThreads).values({ userId, ...(title ? { title } : {}) }));
  return getThread(userId, id);
}

export async function getThread(userId: number, threadId: number) {
  const db = await database();
  const row = (await db.select().from(chatThreads).where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId))).limit(1))[0];
  if (!row) throw new NotFoundError("La conversación");
  return row;
}

export async function getOrCreateThread(userId: number) {
  const existing = await listThreads(userId);
  return existing[0] ?? createThread(userId);
}

export async function addChatMessage(userId: number, threadId: number, role: "user" | "assistant", content: string, actions?: unknown[]) {
  const db = await database();
  await getThread(userId, threadId);
  const id = insertedId(await db.insert(chatMessages).values({ userId, threadId, role, content, actions: actions?.length ? JSON.stringify(actions) : null }));
  await db.update(chatThreads).set({ updatedAt: new Date() }).where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));
  return id;
}

export async function renameThreadIfDefault(userId: number, threadId: number, firstMessage: string) {
  const db = await database();
  const thread = await getThread(userId, threadId);
  if (thread.title !== "Mi plan académico") return;
  await db.update(chatThreads).set({ title: firstMessage.slice(0, 60) }).where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));
}

export async function listChatMessages(userId: number, threadId: number) {
  const db = await database();
  const rows = await db.select().from(chatMessages).where(and(eq(chatMessages.userId, userId), eq(chatMessages.threadId, threadId))).orderBy(desc(chatMessages.createdAt), desc(chatMessages.id)).limit(60);
  return rows.reverse();
}

export async function getChatMessage(userId: number, messageId: number) {
  const db = await database();
  const row = (await db.select().from(chatMessages).where(and(eq(chatMessages.id, messageId), eq(chatMessages.userId, userId))).limit(1))[0];
  if (!row) throw new NotFoundError("El mensaje");
  return row;
}

export async function setChatMessageActions(userId: number, messageId: number, actions: unknown[]) {
  const db = await database();
  await db.update(chatMessages).set({ actions: JSON.stringify(actions) }).where(and(eq(chatMessages.id, messageId), eq(chatMessages.userId, userId)));
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

export async function exportUserData(userId: number) {
  const db = await database();
  const [userSubjects, userTasks, userNotes, userSteps, userSessions, userReminders, userEntries, userFiles, userTranscripts, prefs] = await Promise.all([
    listSubjects(userId, true),
    db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt))).orderBy(asc(tasks.dueAt)),
    db.select().from(notes).where(and(eq(notes.userId, userId), isNull(notes.deletedAt))).orderBy(desc(notes.createdAt)),
    db.select().from(taskSteps).where(eq(taskSteps.userId, userId)),
    db.select().from(studySessions).where(eq(studySessions.userId, userId)).orderBy(asc(studySessions.scheduledFor)),
    db.select().from(reminders).where(and(eq(reminders.userId, userId), ne(reminders.status, "dismissed"))).orderBy(asc(reminders.scheduledFor)),
    db.select().from(inboxEntries).where(and(eq(inboxEntries.userId, userId), isNull(inboxEntries.deletedAt))),
    db.select().from(attachments).where(and(eq(attachments.userId, userId), isNull(attachments.deletedAt))),
    db.select().from(transcripts).where(eq(transcripts.userId, userId)),
    getPreferences(userId),
  ]);
  return {
    subjects: userSubjects,
    tasks: userTasks,
    taskSteps: userSteps,
    studySessions: userSessions,
    reminders: userReminders,
    notes: userNotes,
    inboxEntries: userEntries,
    attachments: userFiles,
    transcripts: userTranscripts,
    preferences: prefs,
  };
}
