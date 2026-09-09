CREATE INDEX `idx_campus_work_wallet_completed` ON `campus_work` (`wallet`,`event`,`room`) WHERE "campus_work"."completed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_presence_lease` ON `crew_presence` (`lease_until`);--> statement-breakpoint
CREATE INDEX `idx_rate_limits_reset` ON `rate_limits` (`resets_at`);