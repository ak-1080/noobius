# Recurring material work

September 9, 2026. This increment connects late-game ingredients to work that can be repeated after equipment is upgraded. It does not establish retention, production readiness or funded token payouts.

## Playable changes

- Newly issued cooling calls use one coolant pump and pay 135 Compute. Newly issued field-stock orders use a pump, a board and a power cell and pay 380. Both require the Thermal room and Engineering 2 before they enter the eligible offer pool.
- The Compute board card offers Standard parts or Recovered parts. Standard still uses 4 scrap, 3 copper and 3 chips. Recovered uses 4 scrap, 2 fiber and 1 core, requires the Core room and Engineering 2, and produces the same board. Both take eight seconds per unit, in batches of 1–30.
- Ingredient help retains the selected route and originating client job, including smaller batches that fit the backpack. The workbench names the parent job. Actual gathering, fabrication, collection and job starts remain explicit player actions.
- A started batch shows its frozen quantity and route. Workbench and world work indicators reopen that recipe. Route controls cannot change an active batch.

## Compatibility and authority

Contract offers/runs have a separate optional termsVersion. Missing or 1 selects original templates; only new offers and explicit dispatch replacements get 2. quoteVersion continues to govern the prior workload/batch accounting. Keeping an old offer, canceling/reaccepting it, reloading, starting or collecting never substitutes current terms. Saved offer/run versions must agree. Unknown versions fail validation. Saved-offer cards show original costs and payments even when current catalog terms differ.

Craft output remains `board`, with an optional whitelisted variant. Existing pending batches have no variant and keep their original output, quantity and deadline. Only the server-resolved recipe determines costs, unlocks and duration. Batch UUIDs, request deduplication, physical worksite checks and atomic D1 settlement remain in place. No D1 schema change is required.

## Economic intent and limits

At the existing NPC raw-part prices, making a pump costs 91; the cooling fee leaves the original 44 replacement margin. Pump + board + cell cost 245 against a 380 field-stock fee, preserving the 135 margin. These are replacement-cost comparisons, not a claim of currency neutrality: self-gathered inputs and other income still need live measurement.

Ordinary board inputs cost 77 at NPC prices. Recovered board inputs cost 44 plus the player's acquisition cost of a core: break-even is 33 per core. Cores remain player-sourced, absent from the NPC shop. The alternate route adds a sourcing choice without increasing bench throughput or introducing a finished-equipment NPC shortcut. Workload capacity, durations and existing setup tradeoffs are unchanged.

## Verification

- 207 automated gameplay tests pass, including 15 added cases for the old/current offer lifecycle, independent quote versions, saved-term validation, dispatch replacement, recovered quantities 1 and 30, invalid variants, unlocks, old pending crafts, guest loading and nested ingredient plans.
- A separate Worker/D1 test on port 3003 verifies authenticated recipe selection, Core gate, malformed variant rejection, ignored client-supplied cost/time, eight-second production, early/duplicate collection rejection and original field-stock terms after acceptance. Only a generated test account in `.wrangler/qa-dispatch` is seeded.
- Browser test on that isolated origin: old cooling/field-stock offers showed 90/340 and original inputs; training job ingredient help opened the board card; recovered selection kept the job name and directed the player to fiber; E gathered fiber; guidance returned to Recovered parts; explicit Make froze the eight-second batch; Collect produced one board; the return action reopened the same unstarted training job with all ingredients ready. It still required a machine selection and explicit start.
- Temporary browser fixture route and QA configuration are removed before the release build. The user's normal and hosted guest saves were not used as test fixtures.

The hosted WebSocket coordinator, real multi-person sessions, return-session playtests and operational readiness remain separate open checkpoints in `next-upgrade-checkpoints.md`.

## Publication

Published owner-private as Site version 40 at 09:18:12 UTC on September 9, 2026, from source `58949e21f4663c71033cee70ca6ef0c60a212f97`. Build, TypeScript, all 207 default tests and the isolated authenticated Worker/D1 test passed. No migration or runtime environment change was made. Both GitHub main and the working branch contain the implementation.

Hosted smoke check reopened the existing guest save with 880,287 spendable and 408,240 stored Compute. Nothing was collected or spent. No error-level browser messages appeared. The primary browser tab was returned to the published game. These checks do not substitute for real wallet, multi-person or return-session acceptance.
