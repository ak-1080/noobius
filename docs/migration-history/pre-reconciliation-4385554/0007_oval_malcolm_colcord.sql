CREATE TABLE `player_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`target_wallet` text NOT NULL,
	`message_id` text NOT NULL,
	`message` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_report_message_once` ON `player_reports` (`wallet`,`message_id`);--> statement-breakpoint
CREATE TABLE `recent_neighbors` (
	`wallet` text NOT NULL,
	`target_wallet` text NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recent_neighbor_pair` ON `recent_neighbors` (`wallet`,`target_wallet`);--> statement-breakpoint
CREATE INDEX `idx_recent_neighbor_time` ON `recent_neighbors` (`wallet`,`last_seen`);--> statement-breakpoint
CREATE TABLE `social_preferences` (
	`wallet` text NOT NULL,
	`target_wallet` text NOT NULL,
	`muted` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_social_preference_pair` ON `social_preferences` (`wallet`,`target_wallet`);