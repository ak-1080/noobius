ALTER TABLE `players` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_players_public_id` ON `players` (`public_id`);