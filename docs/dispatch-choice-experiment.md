# Specialist project benefit — next experiment

Status: proposed, not implemented or published. Prepared after the version 32 choice/guidance release. This targets the open problem that specialist clusters have no continuing operating benefit for an equipped player. It adds control over existing work, not a token payout or production multiplier.

## Proposed rules

A matching specialist-family contribution earns one dispatch choice when that project is claimed, up to two stored choices per family. Launch night supplies workload choices, Steady overnight service choices, and Lean build supply choices. Generic-only contributions receive existing rewards. Choices do not expire, cannot be traded, and remain usable outside GPU District.

When accepting an unaccepted offer, the player may spend one named choice to select another currently eligible existing template of that family. Replace the template and accept it atomically, retaining the original offer ID and serial. Starting, materials, payment and job completion use existing rules. Cancellation keeps the replacement offer and does not refund the choice. Do not modify accepted/running jobs, their quotes or their production reimbursement.

## Conditional benefit to test

Both examples start with one service report, one supply report and two Fast workload reports, sufficient parts, and zero dispatch choices. The target is to complete one project and end with three unused workload reports. All future workloads use Fast. First light consumes one workload report, so needs two subsequent jobs; Launch night consumes two, so needs three jobs but grants two replacements.

| Existing workload sequence | First light | Launch night with choices |
| --- | --- | --- |
| Quiet inference → Wobbly training → Tiny model | 126 + 168 = 294 seconds | Replace first two with Tiny: 42 + 42 + 42 = 126 seconds |
| Tiny model → Render rush → Quiet inference | 42 + 63 = 105 seconds | Best possible three Tiny jobs: 126 seconds |

These calculations use current server work durations and exclude movement/interaction overhead. No unrelated claims advance the shared offer serial in the table. Even allowing those claims, the first First light case requires the current 126-second workload plus at least one 42-second workload, still longer than 126 seconds. Confirm through executable repeated-cycle simulations before implementation is considered accepted. This does not establish retention. The principal risk is always selecting the shortest eligible job once a choice is held; acquisition cost must remain a real tradeoff.

## Persistence and transaction boundaries

- New specialist projects snapshot a nullable, versioned dispatch policy in `cluster_projects.benefit_json`, including family and a two-choice stored limit. Existing projects retain null and their original terms. First light has no dispatch policy.
- Add optional per-family `Career.dispatchChoices` lists of named ticket IDs derived from the unique source project claim and ordinal. Missing means empty. Validate family, ID format, uniqueness and two-per-family limits. Preserve existing career version, offers, balance, reports and mastery; never backfill from old achievements.
- Project claim counts the claimant's persisted matching-family contributions and grants `min(contributions, 2 - stored)`. Save tickets in the same transaction as the unique claim and facility update. Preview the actual number, including zero when full.
- Acceptance checks the exact unspent ticket, offer availability, family and the same template eligibility predicate used by refill. Ticket removal, replacement and acceptance are one facility mutation. Failures spend nothing. Compare-and-swap handles concurrent facility changes; consumed named IDs cannot be reused after request-history eviction.

## Acceptance boundaries

Test duplicate claims, generic-only helpers, partial/full storage, concurrent grants/spends, expired request-history replay, cancellation without refund, unavailable templates, old project/save preservation, unchanged running-job quotes, and both conditional-benefit examples. Reuse existing templates and basic interface controls. Show exact effects before contribution, claim and acceptance. Actual independent-player enjoyment and public capacity remain separate acceptance work.
