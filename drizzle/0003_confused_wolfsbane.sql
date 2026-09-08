CREATE INDEX `idx_presence_room_time` ON `crew_presence` (`room`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_presence_time` ON `crew_presence` (`updated_at`);