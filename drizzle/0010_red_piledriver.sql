CREATE TABLE `room_checkpoints` (
	`grant_hash` text NOT NULL,
	`id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`receipt` text NOT NULL,
	`intent` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_room_checkpoint_once` ON `room_checkpoints` (`grant_hash`,`id`);--> statement-breakpoint
CREATE INDEX `idx_room_checkpoint_expiry` ON `room_checkpoints` (`expires_at`);--> statement-breakpoint
ALTER TABLE `room_grants` ADD `writer_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `room_grants` ADD `frozen_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `room_grants` ADD `frozen_checkpoint` text;