CREATE TABLE `challenges` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`message` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_challenges_expiry` ON `challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `players` (
	`wallet` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`shifts` integer DEFAULT 0 NOT NULL,
	`best_score` integer DEFAULT 0 NOT NULL,
	`scanner` integer DEFAULT 0 NOT NULL,
	`visor` integer DEFAULT 0 NOT NULL,
	`tracer` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_players_best_score` ON `players` (`best_score`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`resets_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`mutation` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`wallet`) REFERENCES `players`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shifts_active_wallet` ON `shifts` (`wallet`) WHERE "shifts"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_shifts_wallet_started` ON `shifts` (`wallet`,`started_at`);