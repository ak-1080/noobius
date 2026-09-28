CREATE TABLE `earning_accounts` (
	`wallet` text PRIMARY KEY NOT NULL,
	`browser_key` text NOT NULL,
	`network_key` text,
	`new_account` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_earning_accounts_browser` ON `earning_accounts` (`browser_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_earning_accounts_network` ON `earning_accounts` (`network_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `earning_browsers` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `earning_events` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`browser_key` text,
	`source` text NOT NULL,
	`compute` integer NOT NULL,
	`materials` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "earning_event_values" CHECK("earning_events"."compute" >= 0 AND "earning_events"."materials" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_earning_events_wallet` ON `earning_events` (`wallet`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_earning_events_browser` ON `earning_events` (`browser_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_earning_events_expiry` ON `earning_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `earning_secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
-- These guards run inside the same batch as the guarded game write. RAISE
-- aborts that entire batch: an exhausted budget cannot eat inputs or mark a
-- reward as collected. The clock/amount come exclusively from server code.
-- Keep uppercase BEGIN/END and conditional RAISE without nested CASE/END:
-- remote D1's /query migration parser is stricter than local SQLite.
CREATE TRIGGER earning_budget_guard BEFORE INSERT ON earning_events
BEGIN
  SELECT RAISE(ABORT,'earning-budget-compute') WHERE NEW.compute + COALESCE((SELECT SUM(e.compute) FROM earning_events e
    WHERE e.created_at > NEW.created_at - 86400000
    AND (e.wallet=NEW.wallet OR (NEW.browser_key IS NOT NULL AND e.browser_key=NEW.browser_key))),0) > 6000
    ;
  SELECT RAISE(ABORT,'earning-budget-materials') WHERE NEW.materials + COALESCE((SELECT SUM(e.materials) FROM earning_events e
    WHERE e.created_at > NEW.created_at - 86400000
    AND (e.wallet=NEW.wallet OR (NEW.browser_key IS NOT NULL AND e.browser_key=NEW.browser_key))),0) > 600
    ;
  SELECT RAISE(ABORT,'earning-budget-shifts') WHERE NEW.source='shift-start' AND (SELECT COUNT(*) FROM earning_events e
    WHERE e.source='shift-start' AND e.created_at > NEW.created_at - 86400000
    AND (e.wallet=NEW.wallet OR (NEW.browser_key IS NOT NULL AND e.browser_key=NEW.browser_key))) >= 4
    ;
END;
--> statement-breakpoint
CREATE TRIGGER earning_signup_guard BEFORE INSERT ON earning_accounts
WHEN NEW.new_account=1 AND NOT EXISTS(SELECT 1 FROM earning_accounts a WHERE a.wallet=NEW.wallet)
BEGIN
  SELECT RAISE(ABORT,'earning-signup-browser') WHERE (SELECT COUNT(*) FROM earning_accounts a WHERE a.browser_key=NEW.browser_key
    AND a.new_account=1 AND a.created_at > NEW.created_at - 86400000) >= 3
    ;
  SELECT RAISE(ABORT,'earning-signup-network') WHERE NEW.network_key IS NOT NULL AND (SELECT COUNT(*) FROM earning_accounts a
    WHERE a.network_key=NEW.network_key AND a.new_account=1 AND a.created_at > NEW.created_at - 86400000) >= 20
    ;
END;
