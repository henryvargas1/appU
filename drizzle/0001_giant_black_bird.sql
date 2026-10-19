CREATE TABLE `calendarEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` int,
	`title` varchar(240) NOT NULL,
	`eventType` enum('exam','delivery','class','other') NOT NULL DEFAULT 'other',
	`startsAt` timestamp,
	`endsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calendarEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`threadId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatThreads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(240) NOT NULL DEFAULT 'Mi plan académico',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chatThreads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inboxEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('text','photo','audio','document') NOT NULL DEFAULT 'text',
	`title` varchar(240),
	`content` text,
	`subjectId` int,
	`sourceUrl` text,
	`processingStatus` enum('inbox','processing','processed','needs_review') NOT NULL DEFAULT 'inbox',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inboxEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`subjectId` int,
	`inboxEntryId` int,
	`title` varchar(240) NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` int,
	`title` varchar(240) NOT NULL,
	`scheduledFor` timestamp NOT NULL,
	`stage` enum('weekly','reinforced','due') NOT NULL DEFAULT 'reinforced',
	`status` enum('scheduled','sent','dismissed','expired') NOT NULL DEFAULT 'scheduled',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `studySessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` int,
	`title` varchar(240) NOT NULL,
	`scheduledFor` timestamp NOT NULL,
	`durationMinutes` int NOT NULL DEFAULT 30,
	`status` enum('planned','completed','skipped') NOT NULL DEFAULT 'planned',
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studySessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT 'sage',
	`isArchived` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taskSteps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`status` enum('pending','completed') NOT NULL DEFAULT 'pending',
	`estimatedMinutes` int NOT NULL DEFAULT 20,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `taskSteps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`subjectId` int,
	`sourceEntryId` int,
	`title` varchar(240) NOT NULL,
	`description` text,
	`dueAt` timestamp,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`complexity` int NOT NULL DEFAULT 2,
	`estimatedMinutes` int NOT NULL DEFAULT 30,
	`status` enum('pending','in_progress','completed','overdue') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `calendar_events_user_idx` ON `calendarEvents` (`userId`);--> statement-breakpoint
CREATE INDEX `chat_messages_thread_idx` ON `chatMessages` (`threadId`);--> statement-breakpoint
CREATE INDEX `chat_threads_user_idx` ON `chatThreads` (`userId`);--> statement-breakpoint
CREATE INDEX `inbox_user_idx` ON `inboxEntries` (`userId`);--> statement-breakpoint
CREATE INDEX `notes_user_idx` ON `notes` (`userId`);--> statement-breakpoint
CREATE INDEX `reminders_user_idx` ON `reminders` (`userId`);--> statement-breakpoint
CREATE INDEX `reminders_schedule_idx` ON `reminders` (`scheduledFor`);--> statement-breakpoint
CREATE INDEX `study_sessions_user_idx` ON `studySessions` (`userId`);--> statement-breakpoint
CREATE INDEX `subjects_user_idx` ON `subjects` (`userId`);--> statement-breakpoint
CREATE INDEX `task_steps_task_idx` ON `taskSteps` (`taskId`);--> statement-breakpoint
CREATE INDEX `tasks_user_idx` ON `tasks` (`userId`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`dueAt`);