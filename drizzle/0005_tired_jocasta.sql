CREATE TABLE `cluster_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`wallet` text NOT NULL,
	`compute` integer NOT NULL,
	`reputation` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `cluster_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cluster_claim_once` ON `cluster_claims` (`project_id`,`wallet`);--> statement-breakpoint
CREATE TABLE `cluster_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`wallet` text NOT NULL,
	`family` text NOT NULL,
	`units` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `cluster_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cluster_contributions_project` ON `cluster_contributions` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_cluster_contributions_wallet` ON `cluster_contributions` (`wallet`);--> statement-breakpoint
CREATE TABLE `cluster_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`neighborhood_id` text NOT NULL,
	`variant` text NOT NULL,
	`state` text NOT NULL,
	`scale` integer NOT NULL,
	`required_json` text NOT NULL,
	`progress_json` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`neighborhood_id`) REFERENCES `neighborhoods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cluster_open` ON `cluster_projects` (`neighborhood_id`) WHERE "cluster_projects"."state" = 'open';--> statement-breakpoint
CREATE INDEX `idx_cluster_neighborhood_time` ON `cluster_projects` (`neighborhood_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `neighborhoods` (
	`id` text PRIMARY KEY NOT NULL,
	`realm` text NOT NULL,
	`preferred_band` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_neighborhoods_realm_band` ON `neighborhoods` (`realm`,`preferred_band`);--> statement-breakpoint
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
CREATE TABLE `realm_entitlements` (
	`wallet` text PRIMARY KEY NOT NULL,
	`policy` text NOT NULL,
	`amount` text NOT NULL,
	`block` text NOT NULL,
	`status` text NOT NULL,
	`checked_at` integer NOT NULL,
	`next_check_at` integer NOT NULL,
	`grace_until` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `idx_social_preference_pair` ON `social_preferences` (`wallet`,`target_wallet`);--> statement-breakpoint
ALTER TABLE `market_listings` ADD `recipient_wallet` text REFERENCES players(wallet);--> statement-breakpoint
ALTER TABLE `crew_messages` ADD `neighborhood_id` text REFERENCES neighborhoods(id);--> statement-breakpoint
CREATE INDEX `idx_messages_neighborhood_time` ON `crew_messages` (`neighborhood_id`,`created_at`);--> statement-breakpoint
-- Preserve existing presence rows; new memberships are assigned on reconnect.
ALTER TABLE `crew_presence` ADD `neighborhood_id` text REFERENCES neighborhoods(id);--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `slot` integer CHECK (`slot` BETWEEN 0 AND 4);--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `client_id` text;--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `sequence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `lease_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_presence_neighborhood_slot` ON `crew_presence` (`neighborhood_id`,`slot`);--> statement-breakpoint
CREATE INDEX `idx_presence_neighborhood_lease` ON `crew_presence` (`neighborhood_id`,`lease_until`);--> statement-breakpoint
CREATE INDEX `idx_presence_lease` ON `crew_presence` (`lease_until`);--> statement-breakpoint
CREATE INDEX `idx_campus_work_wallet_completed` ON `campus_work` (`wallet`,`event`,`room`) WHERE "campus_work"."completed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_rate_limits_reset` ON `rate_limits` (`resets_at`);