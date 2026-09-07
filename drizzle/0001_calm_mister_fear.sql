CREATE TABLE `market_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`item` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`buyer` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_listings_status_time` ON `market_listings` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `crew_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_time` ON `crew_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `crew_presence` (
	`wallet` text PRIMARY KEY NOT NULL,
	`x` integer NOT NULL,
	`z` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `players` ADD `facility_state` text;--> statement-breakpoint
ALTER TABLE `players` ADD `facility_version` integer DEFAULT 0 NOT NULL;