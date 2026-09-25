# Active play, guidance and the Compute economy

**Status: research and proposed design, September 25, 2026.** This document does not change production, player balances, job terms or marketplace behavior. Source was inspected from repository checkpoint `582ed1d`; the accompanying presentation work may change UI references later. No authenticated Kintara session, wallet action, hosted mutation or load test was performed for this audit.

**Implementation update, September 25:** The prototype now starts finite supplied machine batches, migrates old passive output once, and leaves accepted work intact. It is deployed to isolated staging, where a generated-account multiplayer gameplay smoke passed. The observations and quantities below document the audited baseline. Spatial timed gathering, economy tuning, human wallet checkout and uncoached playtests remain open; production is unchanged.

## Recommendation

Make Noobius an active data-center game whose machines process **finite, deliberately selected work**. Players recover supplies, choose clients, configure machines and use the result to develop their center, fulfill another order or trade. Processing can finish while a player explores or is offline, but an unstaffed center should not start new income-producing work indefinitely.

Keep timers where they create useful parallel activity. Do not replace every timer with repeated clicking: that increases friction without establishing human play. The strongest existing foundation is the resource-consuming client system, including competing commissions and machine reservations. Expand its choices and presentation before adding another production subsystem.

The economy redesign needs a separate reviewed implementation and migration. The immediate UI pass can make guidance optional, shorten repeated instructions, improve action feedback and remove redundant pop-ups without changing anyone's money.

## What is verified in the current game

| Area | Observed behavior | Source |
| --- | --- | --- |
| Machine production | A built machine earns `6 + 2 × (level − 1) + speed bonus` per 15-second tick; speed bonuses are `[0,3,4,5,6,7]`. | [production.ts](../../lib/production.ts) |
| Storage | Normal tycoon storage holds 60 minutes of the facility's current nominal production. Accrual stops at capacity; previously earned above-cap output is preserved. | `computeTankCapacity` and `storedComputeNow` in [facility.ts](../../lib/facility.ts) |
| Reservations | Running career workloads, project reservations and commissions suppress the reserved rack's passive production. | `reservedProduction` in [contracts.ts](../../lib/contracts.ts) |
| Collection | Harvest transfers stored output into the same spendable Compute balance used elsewhere. It creates space for more passive output. | `compute-harvest` in [facility.ts](../../lib/facility.ts) |
| Gathering | Selecting an available node immediately awards items, then sets a 15-second or hazardous 45-second cooldown. Inventory capacity, energy and room unlocks apply. | `gather` in [facility.ts](../../lib/facility.ts) |
| Worksite authority | Connected physical actions require an authorized room controller, the proper scene, recent proximity and guarded state commits. These rules are useful integrity checks, not human verification. | [action-authority.ts](../../lib/action-authority.ts), facility handler in [server.ts](../../lib/server.ts) |
| Client work | Service, supply and workload contracts renew. Workloads select equipment, a rack and batch quantity. Commissions expose three specialties and share a two-client limit with career work. | [contracts.ts](../../lib/contracts.ts), [commissions.ts](../../lib/commissions.ts) |
| Recurring goals | Distinctions consume Compute and crafted goods and require fresh client and realm work. Specialties improve speed, resources or capacity. | `milestoneProgress`, `commission-certify` and `commission-milestone` in [commissions.ts](../../lib/commissions.ts) |
| Token-market listing | The listing transaction reserves ordinary `players.credits`. It does not distinguish the balance's passive or active origin. Initial repair/client qualification exists; that is a first-use gate. | [compute-market.ts](../../lib/compute-market.ts), [compute-market-api.ts](../../lib/compute-market-api.ts) |

### Quantified passive issuance

These figures describe the inspected rules, not measured human earnings, token value or an expected return. They exclude reserved-rack pauses, collection delays, purchases and other spending.

| Facility | Passive output/minute | Normal storage cap | Output over 24 hours if continuously harvested |
| --- | ---: | ---: | ---: |
| One level-1 starter, no speed upgrades | 24 | 1,440 | 34,560 |
| Seven level-3 machines, speed level 5 | 476 | 28,560 | 685,440 |

The maximum follows directly from seven machines producing 17 each per tick, with four ticks per minute. An untouched account stops at its storage cap. An account that collects roughly hourly can continue accruing, and more accounts multiply that opportunity. Reducing the cap changes collection frequency; it does not remove this incentive.

There is also a repeatable, no-input `compute-start` / `compute-collect` bonus with a 90-second start cooldown. Audit or retire that path when redesigning production so an older side activity does not remain an unrestricted alternative source. Existing started bonuses must still receive their promised result.

### Guidance: separate today's behavior from the old bug

The older [gameplay blueprint](../kintara-gameplay-blueprint.md) records an earlier guide that executed economy commands. That finding is historical. Today's `guidanceFor()` strips `action` and `repair`; `runGuidance()` walks or opens the relevant panel. Following guidance cannot directly buy, craft, gather or claim. See [guidance.ts](../../lib/guidance.ts) and [Game.tsx](../../components/noobius/Game.tsx).

The complete purchase ladder remains in `tycoonObjective()`, but current `shiftObjective()` calls it only before Margo's welcome and the first machine. Later it tracks chosen client work, recoveries and commissions. Do not claim the current top-left card executes the historical whole ladder. See [experience.ts](../../lib/experience.ts).

The remaining product issue is that a large, repeated route button can still make the player feel they are following a checklist instead of choosing useful work. Replace it with a compact Margo hint, a tracked goal and explicit location help. After a short first job, guidance should follow the player's selected goal rather than continually select their strategy.

At audit time, the small production HUD showed `computePerTick` for its next amount even when reservations reduced actual output. `computeForecast()` already accounts for reservations and capacity. UI should use that forecast to avoid misleading promises. This is a display correction, not an economy rebalance.

## Kintara: the useful comparison and its limits

Fresh public sources were inspected September 25:

- The [official game guide](https://kintara.com/#docs-resources), available in its [published guide component](https://kintara.com/site/js/components/docs.js), teaches equipping the appropriate tool, approaching a resource and selecting it. Gathered goods connect to crafting or cooking, selling, banking and more demanding destinations.
- [Current public gathering constants](https://kintara.com/src/constants.js) describe approximately 2.8 seconds of rock mining and 3.2 seconds of chopping, per-swing timing and shared partial resource wear. These are shipped client definitions; exact timings can change.
- The [current public client](https://kintara.com/game.js) sends harvest-hit messages with an action proof. This supports a client/server activity protocol; it does not expose or establish the effectiveness of all server checks.

**Inference for Noobius:** give work a visible place, a deliberate start, a finite completion and several useful destinations for its output. Kintara also uses time. The evidence does not justify saying it has no timers, that every swing needs a fresh click, or that its economy cannot be botted. Backend implementation, bot-detection effectiveness, retention and economic sustainability remain unverified. Earlier dated research is in [the September 20 architecture review](game-architecture-2026-09-20.md); its historic thresholds should not be treated as freshly verified policies.

## Proposed active loop

**Choose a client → recover or buy supplies → prepare a component → assign a machine → do another useful activity while it runs → collect or deliver → choose what to fund next.**

### Finite production

- A machine produces saleable game output because a player deliberately loaded a specific job. It stops when that committed batch finishes. No automatic restart, infinite queue or passive timer resets merely because the browser stays open.
- Keep short parallel processing: a player can gather for a second order while a first job occupies a rack. Offline time may complete already committed work without starting more work.
- Use current rack capacity, Fast/Efficient/Stable modules, client slots and frozen quotes. A higher machine level should unlock batch choices or new work, not only multiply an unlimited faucet.
- Keep an accessible way out of being broke: a free starter repair or low-risk salvage route that produces useful supplies. Do not require paid consumables, token ownership or passive waiting to escape a zero-resource state.
- Any introductory free run should have a durable one-time identifier. Do not create an endlessly repeatable tutorial grant.
- Exact processing duration, payouts, caps and costs are balancing decisions to test. This document approves no new numeric rate or real-token payout promise.

### Gathering with immediate feedback

An explicit selection starts one short tool action at one node. A nearby progress cue and animation explain what is happening. Movement, invalid proximity or a scene change cancels the action. Completion grants once; it does not automatically select another node or restart after replenishment.

If this becomes a timed server action, store a run identity and earliest completion time, with input and reward rules fixed at start. Complete it through an idempotent authoritative command. Animate swings locally; do not turn every animation frame into a database write. Account for interrupted connections and avoid charging twice on retry.

Repeated gathering should have meaningful route/tool/output choices. Do not add a reaction puzzle to every scrap pickup merely to make automation harder; that can punish ordinary players and still be scripted.

### Recurring reasons to spend

| Existing foundation | Proposed refinement | Meaningful choice |
| --- | --- | --- |
| Competing commissions | Distinguishable client needs, visible inputs/payment/occupation, changed demand | Commit scarce rack time now or save it for a better-fitting order |
| Realm recoveries | Different practical materials and optional higher-cost preparations | Cheap familiar route, longer recovery or cooperative preparation |
| Crafting and modules | Multiple real uses for the same component | Install a board, deliver it, preserve it for a job or list it |
| Specialty certificates | Functional route differences rather than a universal best upgrade | Faster turnaround, fewer supplies or dependable complex work |
| Facility distinctions | Visible collections funded by fresh work and supplies | Reinvest surplus in a permanent personal goal |
| Optional maintenance preparation | Only add if understandable and fun in playtests | Pay for a measured benefit; do not silently add upkeep to owned machines |

NPC-purchased inputs must be included in balance calculations. If the merchant supplies every needed item cheaply, a scripted buy/start/claim loop can bypass exploration. Item transfers between players are not resource destruction. Fees, consumed ingredients and cosmetic/project purchases are different sinks and should be counted separately.

## Four starter-card concepts using existing contracts

These are proposed short labels and visual treatments, **not new implemented offers or a promise that all four currently appear together**. Existing eligibility and offer rotation still apply. Actual quantities, durations and rewards must come from the current selected quote and remain fixed after acceptance.

| Existing template | Proposed card title | One-line objective | Main picture and input strip | Explicit action |
| --- | --- | --- | --- | --- |
| `loose-link` — service | Fix the uplink | Repair the network terminal. | Disconnected cable → connected cable; copper icon and required count | Track terminal; start at the worksite |
| `dust-patrol` — service | Clear the cooling path | Service the retired machine. | Dust-covered vent → clear fan; scrap icon and required count | Track machine; inspect and repair |
| `kit-order` — supply | Pack a repair kit | Craft one kit for Dispatch. | Loose parts → assembled repair kit; recipe input icons followed by kit quantity | Track bench; craft, then deliver |
| `tiny-model` — workload | Run a small model | Give Tiny Labs a machine. | Chip → selected rack → finished batch; chip count, rack slot, duration | Choose rack and batch; start run |

Each card should show a large distinct activity picture, one verb-led objective, a compact input strip, time and quoted payment. Reveal equipment details and optional strategy explanations on demand. Margo can say “Pick a job. I'll mark the way.” The player should still choose the job and perform its steps.

## Bot risks and control boundaries

| Risk | What helps | What it does not establish |
| --- | --- | --- |
| AFK collection | Finite committed batches; no automatic new work | That the original job was chosen by a human |
| Rapid/replayed commands | Server time, idempotent run IDs, proximity, per-action limits and guarded balance updates | That plausible-rate commands are manual |
| Automated puzzle solving | Avoid unnecessary answer disclosure; validate actual challenge transitions | That a randomized puzzle is bot-proof |
| Many wallets or feeder accounts | Measure issuance and commercial behavior; proportionate eligibility/velocity controls and review | One wallet equals one person, or token holding proves identity |
| Circular trade and market manipulation | Separate completed sales, asks, transfers and minted output in reporting | A listed price demonstrates liquidity or demand |
| False-positive restrictions | Reviewable reasons, limited commercial holds and recovery/support process | That every unusual player is malicious |

Maintain committed economy events with rule version, cause and idempotency identity. Use telemetry to explain anomalies, not as a second balance authority. Do not automatically punish shared networks, accessibility input or very skilled players merely for similar timing. Commercial eligibility is a distinct layer from ordinary access to play.

## Save and marketplace migration rules

1. Introduce a dedicated production rules version. Settle completed old production exactly once before applying new behavior; retain already earned stored output even if it exceeds a new cap. Define the transition timestamp so reconnecting cannot manufacture extra old-rate output.
2. Preserve balances, machines, speed purchases, cosmetics, skills, inventory, storage and all committed work. If machine speed changes meaning, define a fair durable replacement benefit rather than silently deleting the upgrade's purpose.
3. Running workloads, bonuses, commissions, crafts and paid recoveries keep their accepted costs, deadlines, output and rewards. Rebalancing changes newly quoted work, not existing obligations.
4. Preserve all marketplace listings, reserved Compute, buyer quotes, signatures and recovery records. Never recalculate a reservation from the player's current balance or apply gameplay tuning to an already accepted blockchain payment.
5. Do not split existing Compute into spendable/sellable categories as a shortcut. A provenance model, if chosen, requires an explicit policy for old balances and all transfer paths, including item sales and refunds. Apply reviewed eligibility rules to future activity without confiscating valid existing reservations.
6. Keep guest and account migrations separate. Guest saves do not become server-verified tradeable value. Migration retries must be safe under concurrent tabs and storage errors.
7. Test old/new client compatibility, version rejection and rollback limits before deployment. Restoring a database does not reverse blockchain transfers. A rollback must preserve payment reconciliation obligations.

Relevant existing mechanisms: `normalizeFacility` and request replay checks in [facility.ts](../../lib/facility.ts), guarded persistence in [server.ts](../../lib/server.ts), reservation/settlement in [compute-market.ts](../../lib/compute-market.ts), and durable recovery in [compute-payment-recovery.ts](../../lib/compute-payment-recovery.ts).

## Delivery and acceptance gates

| Phase | Deliverable | Required evidence |
| --- | --- | --- |
| 1 — Presentation | Compact optional Margo hint; distinct activity images; concise jobs; quiet routine feedback | Guide-only interactions spend/grant nothing; a new player can identify the job, input, destination and result without a paragraph |
| 2 — Isolated prototype | One salvage-to-client loop using finite batches | A fresh player can progress from no resources; a disconnected player finishes only committed work; returning does not start another batch |
| 3 — Economy simulation | Fresh, intermediate and maximum-equipment source/sink comparisons | Compare passive collection, active play and scripted repeated actions; include merchant purchases, fees, cancelled work, ordinary play time and finite storage |
| 4 — Migration and failure testing | Versioned transition preserving property and accepted terms | Old saves, pending work, concurrent harvest/start/claim, full storage, retries, scene changes, eligibility loss and marketplace reservations conserve state |
| 5 — Uncoached sessions | New, mature and returning players choose useful work | Record first independent action, unclear screens, forced idle, chosen tradeoffs, abandoned jobs and the player's stated next goal |
| 6 — Commercial acceptance | Issuance accounting, reviewed abuse controls and settlement compatibility | Gameplay tuning cannot alter a signed quote, duplicate a reward or lose a recovery obligation; real-value release remains a separate decision |

For human acceptance, test at least one fresh player and one fully upgraded player across an initial session and a return session before claiming improvement. A fully upgraded player should independently name two worthwhile actions, choose one for a reason, complete it and identify another useful goal. Record failures honestly; one scripted success or a longer purchase ladder is not retention evidence.

This plan recommends no immediate hosted economic change. The next decision is the bounded active-production prototype and its migration specification, after the visual/interface review.
