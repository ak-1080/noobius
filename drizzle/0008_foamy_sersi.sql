CREATE TABLE `cluster_service_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`wallet` text NOT NULL,
	`stage` text NOT NULL,
	`fault` integer NOT NULL,
	`next_at` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `cluster_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_active` ON `cluster_service_sessions` (`project_id`,`wallet`) WHERE "cluster_service_sessions"."stage" != 'complete';--> statement-breakpoint
ALTER TABLE `cluster_contributions` ADD `state` text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE `cluster_contributions` ADD `ready_at` integer;--> statement-breakpoint
ALTER TABLE `cluster_contributions` ADD `work_json` text;--> statement-breakpoint
ALTER TABLE `cluster_projects` ADD `work_version` integer DEFAULT 0 NOT NULL;