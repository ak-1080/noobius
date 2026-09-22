CREATE TABLE `compute_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`seller` text NOT NULL,
	`compute` integer NOT NULL,
	`token_amount` text NOT NULL,
	`policy` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`quote_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`seller`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "compute_listing_amount" CHECK("compute_listings"."compute" BETWEEN 1 AND 1000000000),
	CONSTRAINT "compute_listing_status" CHECK("compute_listings"."status" IN ('open','reserved','sold','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_compute_listings_status` ON `compute_listings` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_compute_listings_seller` ON `compute_listings` (`seller`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_compute_listing_quote` ON `compute_listings` (`quote_id`);--> statement-breakpoint
CREATE TABLE `compute_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`buyer` text NOT NULL,
	`quote_json` text NOT NULL,
	`status` text DEFAULT 'quoted' NOT NULL,
	`buyer_signature` text,
	`buyer_transaction` text,
	`authorized_transaction` text,
	`expires_at` integer NOT NULL,
	`last_valid_block_height` integer NOT NULL,
	`finalized_slot` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `compute_listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "compute_payment_status" CHECK("compute_payments"."status" IN ('quoted','recorded','submitted','settled','expired','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_compute_payment_signature` ON `compute_payments` (`buyer_signature`);--> statement-breakpoint
CREATE INDEX `idx_compute_payment_buyer` ON `compute_payments` (`buyer`,`status`);--> statement-breakpoint
CREATE INDEX `idx_compute_payment_recovery` ON `compute_payments` (`status`,`updated_at`);