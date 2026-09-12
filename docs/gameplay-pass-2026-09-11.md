# Gameplay pass — September 11, 2026

Implemented locally against baseline `614231f`. No deployment, database migration, authoritative reward change, new token payout, or multiplayer hosting change. The separate `coming-soon/` site was preserved. This is a completed frontend iteration, not a claim of finished endgame balance or proven retention.

## What changed

- The starter machine now leads directly to choosing a real job. Removed the forced first repair-kit recipe, which was unrelated to the fresh offers.
- Accepted-job guidance prepares that job's actual supplies. It checks the selected equipment, rack and batch before sending players to gather. Guidance still never accepts, crafts, builds, starts or claims work automatically.
- The job board uses repair jobs, parts orders and computing jobs. Accepted offers are no longer duplicated below active work. Explanations and the license checklist are expandable. Job cards and collection feedback explicitly include the earned report.
- Added optional shift goals: one job of each kind or three of a chosen kind. Only newly claimed jobs count. Finishing allows another shift without resetting inventory, upgrades, money or achievements. These are browser-local journal preferences, with no additional reward currency, countdown or attendance penalty.
- A pinned goal appears in the world and return recap. Goals remain available after all collections are completed. Explicit navigation now resets the requested panel view, fixing the case where Find a job stayed on My goals.
- Equipment and machine comparisons use the actual quote at the same quantity/time. Players can compare supplies, duration, payment, reputation, capacity and approximate paused passive production. Larger batches still earn one report, not one per unit. No payment is relabeled as profit.
- Occupied-machine recovery leads to the center, where client work, ready results, crew loans and bonus work have appropriate status and review actions. Fully upgraded machines offer useful work rather than only a disabled Max level button.
- Project preparation retains the source project, realm and neighborhood through nested crafting. Returning to an outdated project explains that its requirements changed. A successful matching contribution clears the preparation plan. Project stages and progress have readable labels; earned history is above new-project choices.
- Storage withdrawals respect free backpack space. Storage and the appearance Locker now have distinct wording.
- Machine fan motion reflects working/waiting states. Character limb and celebration motion honor reduced-motion preferences. Existing pooled action effects and original character assets remain in use.
- Improved the phone-width entry button and navigation layout while checking the new panels at 390px.

## Verification

Final checks passed: 343/343 default regression tests, TypeScript validation, production build, and whitespace validation. The build route list excludes the temporary gameplay-review fixture. The local preview was returned to a clean guest starting point; only the isolated audit origin was reset.

Automated checks cover journal progress/renewal, malformed saves, no invented rewards, first-job guidance, invalid machine/batch recovery and nested project preparation. Existing economy, save, navigation, contracts, trade, projects and multiplayer regression checks are retained.

Observed browser sessions used an isolated `localhost:3002` origin:

1. **Fresh guest:** name → appearance → illustrated instructions → Margo → explicit free-machine build → choose a shift goal → accept repair → gather actual missing scrap → return to worksite → inspect → choose the cooling repair from diagnostic clues → test → explicitly collect. Goal remained 0/3 until collection, then became 1/3; a new offer appeared.
2. **Established save:** a temporary, clearly labeled fixture loaded an accepted computing job. Returning resumed the job without replaying onboarding. Compared machines for the same one-unit batch, selected Fast, and verified 90s changed to 63s with one extra wire and +4 reputation. Started the job and observed its ready state. The center's Collect client results action opened the exact job, without silently claiming it.
3. **Fully upgraded save:** temporary fixture with all machine levels, speed upgrades, 36 stamps and 12 discoveries. My goals remained available. Play another shift changed the journal from 3/3 to 0/3 while the full collection stayed intact. Returning in the phone-width frame retained the restarted goal.
4. **390px viewport:** job and goal panels displayed readable single-column controls with internal scrolling. The check also exposed the old undersized landing button and wrapping navigation, which were adjusted.

Temporary fixture routes are removed before the final build. Production accounts and the user's saves on other origins were not changed. Fixture runs establish functionality; they are not human retention studies. Connected project actions were checked through existing regression tests and source review, not a new live multiplayer session.

## Resource and economy audit

| Resource | Recurring purpose | Remaining limitation |
| --- | --- | --- |
| Raw materials and crafted parts | Job inputs, alternative board recipe, pump/battery orders, project contributions | Coffee made entirely from purchased ingredients costs 21 Compute plus fabrication time; ready-made shop coffee costs 15. Crafting from gathered surplus can still be useful. |
| Reports | One per claimed job; family/equipment proof for project contributions | Larger batches do not grant extra reports or reputation. Show this tradeoff clearly. |
| Compute | Buy inputs, machines, modules, rooms, storage and cosmetics; player trades | Permanent purchases eventually finish. Projects award more Compute; player trades transfer currency rather than remove it. A journal cannot create durable veteran demand. |
| Machine capacity | Larger computing batches, passive production, faster crew commissioning | One offer per job family means one ordinary computing client at a time. Seven machines cannot all process separate ordinary client jobs under current rules. |

Sources: `lib/facility.ts`, `lib/contracts.ts`, `lib/production.ts`, `lib/projects.ts`, `lib/projects-server.ts`, `lib/server.ts`, `tests/batch-economy.test.mjs`.

Dormant legacy issue: power/cooling purchases still exist in rules but their budgets do not gate current machine construction. Do not promote them as necessary growth decisions without reconciling those rules.

## What still prevents calling this gameplay-complete

1. **Competing client jobs.** Design and validate multiple simultaneous computing offers, slot limits, reservations and replacement rules. This requires coordinated authoritative state/validation changes, excluded from this pass. Existing job batches and earned terms must survive.
2. **Veteran uses for earnings.** Choose a repeatable purpose with actual player value (for example, rotating optional center projects with meaningful cosmetic collection goals), then simulate input demand and payouts before implementing rules. Avoid arbitrary taxes, infinite price inflation and a second decorative counter.
3. **Balance and pacing evidence.** Existing tests demonstrate different module strategies under different assumptions; they do not prove long-term interest or that every recipe is competitive. Test stocked, supply-poor and report-focused sessions.
4. **Uncoached playtests.** Recruit roughly five target users for fresh, veteran and return sessions. Record stalls, actual choices, waiting/walking time, reasons for the next action, and voluntary return. The original acceptance checklist remains open until observed.
5. **Connected cooperation acceptance.** Real-player trading, joining, contribution and recovery require a later authorized operational pass. The current solo flow must remain useful without relying on that population.

The next work should resolve these decisions rather than add more menus or merely extend timers. The completion test remains: a fully upgraded player can explain two worthwhile actions, choose for a reason, finish useful work and name a next goal.
