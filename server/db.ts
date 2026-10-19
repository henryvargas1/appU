import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  User,
  chatMessages,
  chatThreads,
  inboxEntries,
  notes,
  reminders,
  studySessions,
  subjects,
  taskSteps,
  tasks,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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

function assertDb<T>(db: T | null): T {
  if (!db) throw new Error("La base de datos no está disponible");
  return db;
}

export async function listSubjects(userId: number) {
  const db = assertDb(await getDb());
  return db.select().from(subjects).where(and(eq(subjects.userId, userId), eq(subjects.isArchived, 0))).orderBy(asc(subjects.name));
}

export async function createSubject(userId: number, name: string, color = "sage") {
  const db = assertDb(await getDb());
  const result = await db.insert(subjects).values({ userId, name, color });
  const id = Number(result[0].insertId);
  return (await db.select().from(subjects).where(eq(subjects.id, id)).limit(1))[0];
}

export async function listTasks(userId: number) {
  const db = assertDb(await getDb());
  return db.select().from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.status, ["pending", "in_progress", "overdue"]))).orderBy(asc(tasks.dueAt), desc(tasks.priority));
}

export async function listCompletedTasks(userId: number) {
  const db = assertDb(await getDb());
  return db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"))).orderBy(desc(tasks.completedAt)).limit(12);
}

export type NewTaskInput = {
  title: string;
  description?: string;
  subjectId?: number;
  dueAt?: Date;
  priority?: "low" | "medium" | "high" | "critical";
  complexity?: number;
  estimatedMinutes?: number;
  sourceEntryId?: number;
};

function reminderDates(dueAt: Date) {
  const now = Date.now();
  const due = dueAt.getTime();
  const result: Array<{ date: Date; stage: "weekly" | "reinforced" | "due" }> = [];
  const seen = new Set<number>();
  const add = (time: number, stage: "weekly" | "reinforced" | "due") => {
    if (time > now + 60_000 && time <= due && !seen.has(time)) {
      seen.add(time);
      result.push({ date: new Date(time), stage });
    }
  };

  for (let time = due - 7 * 24 * 60 * 60 * 1000; time > now && time < due; time -= 7 * 24 * 60 * 60 * 1000) {
    add(time, "weekly");
    if (result.length >= 8) break;
  }
  add(due - 3 * 24 * 60 * 60 * 1000, "reinforced");
  add(due - 24 * 60 * 60 * 1000, "reinforced");
  add(due, "due");

  // When a deadline is very close, guarantee three distinct reminders whenever possible.
  const candidates = [due - 6 * 60 * 60 * 1000, due - 2 * 60 * 60 * 1000, due - 30 * 60 * 1000];
  for (const time of candidates) {
    if (result.filter((item) => item.stage !== "due").length >= 3) break;
    add(time, "reinforced");
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function createTask(userId: number, input: NewTaskInput) {
  const db = assertDb(await getDb());
  const complexity = Math.min(5, Math.max(1, input.complexity ?? 2));
  const estimatedMinutes = Math.max(15, input.estimatedMinutes ?? complexity * 15);
  const result = await db.insert(tasks).values({
    userId,
    title: input.title,
    description: input.description,
    subjectId: input.subjectId,
    dueAt: input.dueAt,
    priority: input.priority ?? (complexity >= 4 ? "high" : "medium"),
    complexity,
    estimatedMinutes,
    sourceEntryId: input.sourceEntryId,
  });
  const id = Number(result[0].insertId);
  if (input.dueAt) {
    const schedule = reminderDates(input.dueAt);
    if (schedule.length) {
      await db.insert(reminders).values(schedule.map((item) => ({
        userId,
        taskId: id,
        title: input.title,
        scheduledFor: item.date,
        stage: item.stage,
      })));
    }
  }
  return (await db.select().from(tasks).where(eq(tasks.id, id)).limit(1))[0];
}

export async function completeTask(userId: number, taskId: number) {
  const db = assertDb(await getDb());
  const now = new Date();
  await db.update(tasks).set({ status: "completed", completedAt: now, updatedAt: now }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  await db.update(reminders).set({ status: "dismissed" }).where(and(eq(reminders.taskId, taskId), eq(reminders.userId, userId), eq(reminders.status, "scheduled")));
  return (await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1))[0];
}

export async function snoozeTask(userId: number, taskId: number, nextReminder: Date) {
  const db = assertDb(await getDb());
  await db.insert(reminders).values({ userId, taskId, title: "Recordatorio pospuesto", scheduledFor: nextReminder, stage: "reinforced" });
  return { ok: true };
}

export async function createInboxEntry(userId: number, input: { kind: "text" | "photo" | "audio" | "document"; title?: string; content?: string; subjectId?: number; sourceUrl?: string }) {
  const db = assertDb(await getDb());
  const result = await db.insert(inboxEntries).values({ userId, ...input, processingStatus: "needs_review" });
  const id = Number(result[0].insertId);
  return (await db.select().from(inboxEntries).where(eq(inboxEntries.id, id)).limit(1))[0];
}

export async function createNote(userId: number, input: { title: string; content: string; subjectId?: number; inboxEntryId?: number }) {
  const db = assertDb(await getDb());
  const result = await db.insert(notes).values({ userId, ...input });
  const id = Number(result[0].insertId);
  return (await db.select().from(notes).where(eq(notes.id, id)).limit(1))[0];
}

export async function listRecentNotes(userId: number) {
  const db = assertDb(await getDb());
  return db.select().from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.updatedAt)).limit(12);
}

export async function getPlannerSnapshot(userId: number) {
  const active = await listTasks(userId);
  const now = Date.now();
  const scored = active.map((task) => {
    const days = task.dueAt ? Math.max(0, (task.dueAt.getTime() - now) / 86_400_000) : 30;
    const urgency = days <= 1 ? 5 : days <= 3 ? 4 : days <= 7 ? 3 : days <= 14 ? 2 : 1;
    const priorityScore = task.priority === "critical" ? 5 : task.priority === "high" ? 4 : task.priority === "medium" ? 2 : 1;
    const score = task.complexity * 3 + urgency * 2 + priorityScore;
    return { ...task, score, urgency };
  }).sort((a, b) => b.score - a.score);

  const count = scored.length;
  const complexityMinutes = scored.reduce((sum, task) => sum + Math.max(15, Math.round(task.estimatedMinutes / Math.max(1, task.complexity))), 0);
  const recommendedMinutes = count === 0 ? 0 : count === 1 ? 15 : Math.min(90, Math.max(30, Math.round(complexityMinutes / Math.max(1, Math.ceil(complexityMinutes / 60)))));
  const next = scored[0];
  return {
    tasks: scored.slice(0, 8),
    totalActive: count,
    recommendedMinutes,
    nextAction: next ? `Avanza ${Math.min(30, Math.max(15, Math.round(next.estimatedMinutes / next.complexity)))} min en “${next.title}”.` : "No tienes tareas pendientes.",
  };
}

export async function listUpcomingReminders(userId: number) {
  const db = assertDb(await getDb());
  return db.select().from(reminders).where(and(eq(reminders.userId, userId), eq(reminders.status, "scheduled"), gte(reminders.scheduledFor, new Date()))).orderBy(asc(reminders.scheduledFor)).limit(12);
}

export async function getOrCreateThread(userId: number) {
  const db = assertDb(await getDb());
  const existing = await db.select().from(chatThreads).where(eq(chatThreads.userId, userId)).orderBy(desc(chatThreads.updatedAt)).limit(1);
  if (existing[0]) return existing[0];
  const result = await db.insert(chatThreads).values({ userId });
  const id = Number(result[0].insertId);
  return (await db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1))[0];
}

export async function addChatMessage(userId: number, threadId: number, role: "user" | "assistant", content: string) {
  const db = assertDb(await getDb());
  await db.insert(chatMessages).values({ userId, threadId, role, content });
  await db.update(chatThreads).set({ updatedAt: new Date() }).where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));
}

export async function listChatMessages(userId: number, threadId: number) {
  const db = assertDb(await getDb());
  return db.select().from(chatMessages).where(and(eq(chatMessages.userId, userId), eq(chatMessages.threadId, threadId))).orderBy(asc(chatMessages.createdAt)).limit(40);
}

export async function markDueRemindersExpired() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(reminders).set({ status: "expired" }).where(and(eq(reminders.status, "scheduled"), lte(reminders.scheduledFor, new Date())));
  return result[0]?.affectedRows ?? 0;
}
