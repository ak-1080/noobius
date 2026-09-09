CREATE TABLE `room_grants` (
	`grant_hash` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`session_hash` text NOT NULL,
	`neighborhood_id` text NOT NULL,
	`client_id` text NOT NULL,
	`generation` integer NOT NULL,
	`scene` text NOT NULL,
	`audience` text NOT NULL,
	`key_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_room_grant_controller` ON `room_grants` (`wallet`);--> statement-breakpoint
CREATE INDEX `idx_room_grant_expiry` ON `room_grants` (`expires_at`);--> statement-breakpoint
CREATE TABLE `room_service_nonces` (
	`key_id` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_room_nonce_once` ON `room_service_nonces` (`key_id`,`nonce`);--> statement-breakpoint
CREATE INDEX `idx_room_nonce_expiry` ON `room_service_nonces` (`expires_at`);--> statement-breakpoint
CREATE TABLE `room_tickets` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`session_hash` text NOT NULL,
	`neighborhood_id` text NOT NULL,
	`client_id` text NOT NULL,
	`generation` integer NOT NULL,
	`scene` text NOT NULL,
	`audience` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_room_ticket_expiry` ON `room_tickets` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_room_ticket_wallet` ON `room_tickets` (`wallet`);