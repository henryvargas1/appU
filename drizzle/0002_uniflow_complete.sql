CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`inboxEntryId` int,
	`kind` enum('photo','audio','document') NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`filename` varchar(240),
	`mimeType` varchar(120),
	`sizeBytes` int,
	`extractedText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` timestamp,
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`attachmentId` int NOT NULL,
	`language` varchar(16) NOT NULL DEFAULT 'es',
	`text` text NOT NULL,
	`segments` text,
	`durationSeconds` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transcripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userPreferences` (
	`userId` int NOT NULL,
	`availability` varchar(120) NOT NULL DEFAULT '[0,0,0,0,0,0,0]',
	`studyStartHour` int NOT NULL DEFAULT 17,
	`remindersEnabled` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPreferences_userId_pk` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `inboxEntries` MODIFY COLUMN `processingStatus` enum('inbox','processing','processed','needs_review','confirmed','discarded') NOT NULL DEFAULT 'inbox';--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `status` enum('scheduled','sent','done','snoozed','dismissed','expired') NOT NULL DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE `studySessions` MODIFY COLUMN `status` enum('planned','completed','skipped','rescheduled') NOT NULL DEFAULT 'planned';--> statement-breakpoint
ALTER TABLE `chatMessages` ADD `actions` text;--> statement-breakpoint
ALTER TABLE `inboxEntries` ADD `attachmentId` int;--> statement-breakpoint
ALTER TABLE `inboxEntries` ADD `suggestion` text;--> statement-breakpoint
ALTER TABLE `inboxEntries` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `notes` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `reminders` ADD `actedAt` timestamp;--> statement-breakpoint
ALTER TABLE `studySessions` ADD `rescheduledFromId` int;--> statement-breakpoint
ALTER TABLE `taskSteps` ADD `completedAt` timestamp;--> statement-breakpoint
ALTER TABLE `tasks` ADD `kind` enum('task','exam','delivery') DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `deletedAt` timestamp;--> statement-breakpoint
CREATE INDEX `attachments_user_idx` ON `attachments` (`userId`);--> statement-breakpoint
CREATE INDEX `transcripts_attachment_idx` ON `transcripts` (`attachmentId`);