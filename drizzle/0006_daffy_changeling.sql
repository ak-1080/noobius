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
