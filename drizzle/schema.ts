import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const subjects = mysqlTable(
  "subjects",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 16 }).default("sage").notNull(),
    isArchived: int("isArchived").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ userIdx: index("subjects_user_idx").on(table.userId) }),
);

export const inboxEntries = mysqlTable(
  "inboxEntries",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    kind: mysqlEnum("kind", ["text", "photo", "audio", "document"]).default("text").notNull(),
    title: varchar("title", { length: 240 }),
    content: text("content"),
    subjectId: int("subjectId"),
    sourceUrl: text("sourceUrl"),
    processingStatus: mysqlEnum("processingStatus", ["inbox", "processing", "processed", "needs_review"]).default("inbox").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ userIdx: index("inbox_user_idx").on(table.userId) }),
);

export const notes = mysqlTable(
  "notes",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    subjectId: int("subjectId"),
    inboxEntryId: int("inboxEntryId"),
    title: varchar("title", { length: 240 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ userIdx: index("notes_user_idx").on(table.userId) }),
);

export const tasks = mysqlTable(
  "tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    subjectId: int("subjectId"),
    sourceEntryId: int("sourceEntryId"),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    dueAt: timestamp("dueAt"),
    priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
    complexity: int("complexity").default(2).notNull(),
    estimatedMinutes: int("estimatedMinutes").default(30).notNull(),
    status: mysqlEnum("status", ["pending", "in_progress", "completed", "overdue"]).default("pending").notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ userIdx: index("tasks_user_idx").on(table.userId), dueIdx: index("tasks_due_idx").on(table.dueAt) }),
);

export const taskSteps = mysqlTable(
  "taskSteps",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    taskId: int("taskId").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    position: int("position").default(0).notNull(),
    status: mysqlEnum("status", ["pending", "completed"]).default("pending").notNull(),
    estimatedMinutes: int("estimatedMinutes").default(20).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ taskIdx: index("task_steps_task_idx").on(table.taskId) }),
);

export const studySessions = mysqlTable(
  "studySessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    taskId: int("taskId"),
    title: varchar("title", { length: 240 }).notNull(),
    scheduledFor: timestamp("scheduledFor").notNull(),
    durationMinutes: int("durationMinutes").default(30).notNull(),
    status: mysqlEnum("status", ["planned", "completed", "skipped"]).default("planned").notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ userIdx: index("study_sessions_user_idx").on(table.userId) }),
);

export const reminders = mysqlTable(
  "reminders",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    taskId: int("taskId"),
    title: varchar("title", { length: 240 }).notNull(),
    scheduledFor: timestamp("scheduledFor").notNull(),
    stage: mysqlEnum("stage", ["weekly", "reinforced", "due"]).default("reinforced").notNull(),
    status: mysqlEnum("status", ["scheduled", "sent", "dismissed", "expired"]).default("scheduled").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ userIdx: index("reminders_user_idx").on(table.userId), scheduleIdx: index("reminders_schedule_idx").on(table.scheduledFor) }),
);

export const calendarEvents = mysqlTable(
  "calendarEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    taskId: int("taskId"),
    title: varchar("title", { length: 240 }).notNull(),
    eventType: mysqlEnum("eventType", ["exam", "delivery", "class", "other"]).default("other").notNull(),
    startsAt: timestamp("startsAt"),
    endsAt: timestamp("endsAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ userIdx: index("calendar_events_user_idx").on(table.userId) }),
);

export const chatThreads = mysqlTable(
  "chatThreads",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 240 }).default("Mi plan académico").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ userIdx: index("chat_threads_user_idx").on(table.userId) }),
);

export const chatMessages = mysqlTable(
  "chatMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    threadId: int("threadId").notNull(),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ threadIdx: index("chat_messages_thread_idx").on(table.threadId) }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
