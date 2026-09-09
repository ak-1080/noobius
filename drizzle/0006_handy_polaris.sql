ALTER TABLE `player_reports` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `player_reports` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `player_reports` ADD `review_note` text;--> statement-breakpoint
CREATE INDEX `idx_report_status_time` ON `player_reports` (`status`,`created_at`,`id`);