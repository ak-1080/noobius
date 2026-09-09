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
CREATE INDEX `idx_cluster_neighborhood_time` ON `cluster_projects` (`neighborhood_id`,`created_at`);