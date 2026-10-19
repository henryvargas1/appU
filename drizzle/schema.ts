import {
  index,
  int,
  primaryKey,
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
    attachmentId: int("attachmentId"),
    /** Clasificación sugerida (JSON) pendiente de revisión por el usuario. */
    suggestion: text("suggestion"),
    processingStatus: mysqlEnum("processingStatus", ["inbox", "processing", "processed", "needs_review", "confirmed", "discarded"]).default("inbox").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({ userIdx: index("inbox_user_idx").on(table.userId) }),
);

export const attachments = mysqlTable(
  "attachments",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    inboxEntryId: int("inboxEntryId"),
    kind: mysqlEnum("kind", ["photo", "audio", "document"]).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    url: text("url").notNull(),
    filename: varchar("filename", { length: 240 }),
    mimeType: varchar("mimeType", { length: 120 }),
    sizeBytes: int("sizeBytes"),
    extractedText: text("extractedText"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({ userIdx: index("attachments_user_idx").on(table.userId) }),
);

export const transcripts = mysqlTable(
  "transcripts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    attachmentId: int("attachmentId").notNull(),
    language: varchar("language", { length: 16 }).default("es").notNull(),
    text: text("text").notNull(),
    /** Segmentos con tiempos (JSON). */
    segments: text("segments"),
    durationSeconds: int("durationSeconds"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ attachmentIdx: index("transcripts_attachment_idx").on(table.attachmentId) }),
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
    summary: text("summary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
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
    kind: mysqlEnum("kind", ["task", "exam", "delivery"]).default("task").notNull(),
    dueAt: timestamp("dueAt"),
    priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
    complexity: int("complexity").default(2).notNull(),
    estimatedMinutes: int("estimatedMinutes").default(30).notNull(),
    status: mysqlEnum("status", ["pending", "in_progress", "completed", "overdue"]).default("pending").notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deletedAt"),
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
    completedAt: timestamp("completedAt"),
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
    status: mysqlEnum("status", ["planned", "completed", "skipped", "rescheduled"]).default("planned").notNull(),
    /** Sesión original cuando esta es una reprogramación (conserva el historial). */
    rescheduledFromId: int("rescheduledFromId"),
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
    status: mysqlEnum("status", ["scheduled", "sent", "done", "snoozed", "dismissed", "expired"]).default("scheduled").notNull(),
    actedAt: timestamp("actedAt"),
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
    /** Acciones estructuradas ejecutadas por el asistente (JSON). */
    actions: text("actions"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ threadIdx: index("chat_messages_thread_idx").on(table.threadId) }),
);

export const userPreferences = mysqlTable(
  "userPreferences",
  {
    userId: int("userId").notNull(),
    /** Minutos máximos por día de la semana (domingo = 0), JSON de 7 números; 0 = sin límite. */
    availability: varchar("availability", { length: 120 }).default("[0,0,0,0,0,0,0]").notNull(),
    studyStartHour: int("studyStartHour").default(17).notNull(),
    /** Zona horaria IANA del estudiante: las fechas relativas y el plan diario se calculan en ella. */
    timeZone: varchar("timeZone", { length: 64 }).default("America/Bogota").notNull(),
    remindersEnabled: int("remindersEnabled").default(1).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.userId] }) }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type InboxEntry = typeof inboxEntries.$inferSelect;
export type StudySession = typeof studySessions.$inferSelect;
export type TaskStep = typeof taskSteps.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
