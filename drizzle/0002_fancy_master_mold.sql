CREATE TABLE `campus_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campus_work` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`event` integer NOT NULL,
	`station` text NOT NULL,
	`wallet` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_campus_work_room_event` ON `campus_work` (`room`,`event`);--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `room` text DEFAULT 'campus-1' NOT NULL;