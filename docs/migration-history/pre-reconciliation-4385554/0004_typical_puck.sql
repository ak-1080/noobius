CREATE TABLE `neighborhoods` (
	`id` text PRIMARY KEY NOT NULL,
	`realm` text NOT NULL,
	`preferred_band` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_neighborhoods_realm_band` ON `neighborhoods` (`realm`,`preferred_band`);--> statement-breakpoint
ALTER TABLE `crew_messages` ADD `neighborhood_id` text REFERENCES neighborhoods(id);--> statement-breakpoint
CREATE INDEX `idx_messages_neighborhood_time` ON `crew_messages` (`neighborhood_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `players` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_players_public_id` ON `players` (`public_id`);--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `neighborhood_id` text REFERENCES neighborhoods(id);
--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `slot` integer CONSTRAINT valid_neighborhood_slot CHECK(slot BETWEEN 0 AND 4);
--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `client_id` text;
--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `generation` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `sequence` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `crew_presence` ADD `lease_until` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_presence_neighborhood_slot` ON `crew_presence` (`neighborhood_id`,`slot`);
--> statement-breakpoint
CREATE INDEX `idx_presence_neighborhood_lease` ON `crew_presence` (`neighborhood_id`,`lease_until`);
