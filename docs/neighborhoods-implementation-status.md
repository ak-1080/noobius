# Neighborhoods implementation checkpoint

Updated September 9, 2026. Branch: `codex/noobius-neighborhoods`.
This is work in progress. The public site remains on the preceding release.

## Implemented in the checkout

- Twelve renewable contract templates, three families, two accepted jobs of different kinds.
- Explicit service diagnosis, timed supply dispatch, capacity-reserving workloads, and three equipment styles.
- Guidance cannot buy, collect, craft or claim. An explicit resource interaction still walks and gathers.
- No NPC sales of finished equipment; the crafting/player market loop supplies those items.
- Preserved legacy saves and production tick phase, including full storage while a workload reserves a rack.
- Five-slot D1 neighborhood admission, level-band preference, opaque public center IDs, leases, controller generations and sequence-checked movement.
- One center per account; neighbors can visit a sanitized view. Leaving owners return visitors to the plaza.
- Client neighborhood queue, explicit tab takeover, automatic expired/stale-generation recovery, scene corrections and current-position sampling.
- Five entrance portals in the shared plaza; Crew panel lists occupants and realm destinations.
- Physical worksite/home checks are part of the authoritative facility mutation. Personal room travel updates presence with the facility in one transaction.
- Existing shared outage repairs use controller/reach guards and preserve earned bonuses across event changes and leaving a neighborhood.
- Persistent cluster projects with frozen requirements, completed-job contributions, crafted component consumption and contribution-proportional rewards.
- Project/account changes commit atomically; duplicate claims cannot pay again. Old outstanding rewards are surfaced before recent collected builds.
- Mastery stamps, earned center accent colors and a trophy. Operator license also requires a commissioned cluster.
- Local migrations `0004_typical_puck.sql`, `0005_careful_reavers.sql` and `0006_daffy_changeling.sql` applied. They are immutable now; append future changes.
- Holder-verification adapter added with exact EVM chain/contract/decimals, confirmed block, balance threshold, a 60-second cache and bounded RPC grace. Four initial adapter tests pass. The adapter is not yet wired into realm admission; GPU District still refuses entry. No live token configuration has been invented.

## Evidence so far

- 86 unit/SQLite tests passed, including membership races, save migration, reservation math, diagnosis, project overspend races and durable claims.
- Authenticated local API test passed with five neighborhood players and a sixth rejected targeted join; visits, ownership, movement checks, cooperative repairs, a duplicate reward race and tab takeover were exercised.
- Local browser QA completed a service job from the existing saved practice profile: guidance reached the worksite without spending; explicit inspection showed three fault readings; selecting cooling and testing required separate inputs; claiming paid 38 Compute and replaced the offer.
- The same in-progress service job survived hot reloads and resumed at its previous stage.
- Production build passed after the first integrated project implementation. Re-run after later source changes.
- Repository-wide lint currently fails, including pre-existing generated UI rules and new effect/ref findings. Do not report lint as passing; assess changed-code diagnostics before final delivery.
- Older facility/market API regression is being adapted to legitimate walking and controller membership; it now passes with valid server-observed walking, private centers and existing escrow balances.

SQLite simulations and API clients are not five independent human browser playtests. Do not claim proven retention, production readiness, stress capacity or Epic/AAA quality from these checks.

## Still required before the full upgrade is complete

1. Finish real authenticated browser QA and correct travel/project onboarding friction; test mobile, keyboard, zoom, reconnect and non-WebGL fallback.
2. Implement/configure holder eligibility and safe access loss. Exact live token chain/address remains unprovided; no fabricated live holdings. GPU District currently refuses entry.
3. Complete distinct GPU District activities, preview and environment. Current project variants are prepared but realm admission/content is unfinished.
4. Friend invitation/join UX, recent neighbors, useful pings, and required social protections.
5. Market pagination/filtering, progression qualification and optional neighbor-directed offers, retaining escrow behavior.
6. Improve project contribution recovery: clearly guide missing parts, relevant job family, Margo and prior projects. Complete commissioning visual feedback.
7. Finish migration/authority/API regression coverage and errors. Re-check production build, performance, reconnect bursts, visibility changes, rate budgets and durable operations under real D1.
8. Update guides/slides and deployment/recovery documentation for the final behavior; tune first-session and maxed-player decisions.
9. Save/push the completed version, deploy through Sites and verify deployment/production flows. No production migration or deployment has occurred for this branch yet.
10. Human repeat-session playtesting remains the basis for judging whether maxed players have useful work and reasons to interact. Real token payout funding/settlement remains a separate integration.
