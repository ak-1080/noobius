# Data-center tycoon iteration — September 7, 2026

This private alpha iteration implements a tycoon foundation, not a completed idle-game economy or financial payout system.

## Player loop

Meet Margo → salvage parts → craft a kit → build a rack → generate and collect compute → improve efficiency and expand. Active repair puzzles and timed batches add compute. Outages pause production and provide a short repair challenge and bonus. A capped store provides a return goal without deleting collected progress. Saved accounts keep their tutorial flags, racks, output clocks, batches, and balances. Practice remains temporary.

## Onboarding and clarity

Seven short briefings introduce controls, Margo, parts, kits, rack income, compute, and outage recovery. The first walk to Margo opens her briefing on arrival. Later briefings appear when the corresponding milestone is reached. Closing a tip acknowledges it; a skip-tips control preserves the objective guide. The guide directs players to their first batch after building, prioritizes an active outage, and then returns to existing story projects.

The HUD separates spendable compute from construction credits. A stored-output/outage button and Compute tool open a desk with storage, batches, efficiency upgrades, and a collapsed demo exchange. World rack lights turn red for the affected incident and the objective arrow points to it. Fault instructions explain each of three controls and allow mistakes without loss.

## Economy and integrity

Passive output settles using server time on mutations. Storage is capped; partial ticks persist during ordinary actions. Building or changing efficiency settles prior production before changing the rate. Outages stop generation at their scheduled time; fixing one resets the clock without backfilling downtime. Batch rewards are captured at start and cannot be collected early or twice. Replay IDs and the existing conditional facility-version update guard mutations. A late return preserves stored/collected output and built racks.

The demo exchange spends 100 compute and adds 10 demo $NOOBIUS. This is a game-state preview, with no chain transaction, withdrawal, funded conversion rate, or future claim. Its economy numbers need real player pacing tests before any launch decision.

## Verification

Thirty rule/navigation/wallet tests pass. New coverage includes capped storage, fractional ticks, outage cutoff, timed batch rewards, one-time collection, recovery without losing a queued batch, ordered outage steps, efficiency costs, demo conversion conservation/retries, onboarding progression, and old-save defaults. The signed API regression confirms three concurrent-safe repair rewards total 45 compute. The campus API suite verifies competing batch starts and collections, a single 35-compute award, stored-output retry idempotency, and premature exchange/outage rejection.

Browser checks verified the opening Dispatch → walk to Margo → salvage → Bit briefing, and the skip-tips path. A stable walkthrough built the first rack, displayed passive storage and the batch countdown at 390×844, collected a 35-compute batch, and then encountered an outage while a second batch was ready. A deliberately wrong repair control produced a correction without loss; completing the ordered repair paid 40 compute and restored collection of the waiting 35-compute batch. The resulting 115 balance exchanged to 15 compute plus 10 demo $NOOBIUS, with another exchange disabled. The viewport override was reset. TypeScript and the production build passed; the existing large-client-chunk build warning remains. Public load, real-device wallet testing, financial payouts, moderation and operational launch gates remain open in the public-launch checklist.
