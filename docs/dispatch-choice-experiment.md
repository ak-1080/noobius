# Specialist project choices

Status: implemented, validated and published privately as Site version 33 on September 9, 2026 at 07:03:40 UTC. This gives specialist clusters a continuing benefit for an equipped player: control over the next job offer. It does not change token payouts or passive production.

## Implemented rules

A matching specialist-family contribution earns one dispatch choice when that project is claimed, up to two stored choices per family. Launch night supplies workload choices, Steady overnight service choices, and Lean build supply choices. Generic-only contributions receive existing rewards. Choices do not expire, cannot be traded, and remain usable outside GPU District.

When accepting an unaccepted offer, the player may spend one named choice to select another currently eligible existing template of that family. Replace the template and accept it atomically, retaining the original offer ID and serial. Starting, materials, payment and job completion use existing rules. Cancellation keeps the replacement offer and does not refund the choice. Do not modify accepted/running jobs, their quotes or their production reimbursement.

## Conditional benefit to test

Both examples start with one service report, one supply report and two Fast workload reports, sufficient parts, and zero dispatch choices. The target is to complete one project and end with three unused workload reports. All future workloads use Fast. First light consumes one workload report, so needs two subsequent jobs; Launch night consumes two, so needs three jobs but grants two replacements.

| Existing workload sequence | First light | Launch night with choices |
| --- | --- | --- |
| Quiet inference → Wobbly training → Tiny model | 126 + 168 = 294 seconds | Replace first two with Tiny: 42 + 42 + 42 = 126 seconds |
| Tiny model → Render rush → Quiet inference | 42 + 63 = 105 seconds | Best possible three Tiny jobs: 126 seconds |

These calculations use current server work durations and exclude movement/interaction overhead. No unrelated claims advance the shared offer serial in the table. Even allowing those claims, the first First light case requires the current 126-second workload plus at least one 42-second workload, still longer than 126 seconds. Both cases now pass executable tests using actual project contributions, claims, job acceptance, execution clocks and report totals. A separate twelve-project seeded-claim test checks ticket conservation, full storage, reloads and replay; it is not a twelve-session retention test. This does not establish retention. The principal risk is always selecting the shortest eligible job once a choice is held; acquisition cost must remain a real tradeoff.

## Persistence and transaction boundaries

- New specialist projects snapshot a nullable, versioned dispatch policy in `cluster_projects.benefit_json`, including family and a two-choice stored limit. Existing projects retain null and their original terms. First light has no dispatch policy.
- Add optional per-family `Career.dispatchChoices` lists of named ticket IDs derived from the unique source project claim and ordinal. Missing means empty. Validate family, ID format, uniqueness and two-per-family limits. Preserve existing career version, offers, balance, reports and mastery; never backfill from old achievements.
- Project claim counts the claimant's persisted matching-family contributions and grants `min(contributions, 2 - stored)`. Save tickets in the same transaction as the unique claim and facility update. Preview the actual number, including zero when full.
- Acceptance checks the exact unspent ticket, offer availability, family and the same template eligibility predicate used by refill. Ticket removal, replacement and acceptance are one facility mutation. Failures spend nothing. Compare-and-swap handles concurrent facility changes; consumed named IDs cannot be reused after request-history eviction.

## Acceptance boundaries

Test duplicate claims, generic-only helpers, partial/full storage, concurrent grants/spends, expired request-history replay, cancellation without refund, unavailable templates, old project/save preservation, unchanged running-job quotes, and both conditional-benefit examples. Reuse existing templates and basic interface controls. Show exact effects before contribution, claim and acceptance. Actual independent-player enjoyment and public capacity remain separate acceptance work.


## Validation for this pass

- In-memory SQLite tests cover all three benefit families, personal matching contribution totals, generic-only helpers, null legacy policies, partial/full storage, duplicate claims with partially spent tickets, simultaneous claims, and a claim racing a spend. Running job terms survive the race.
- Facility tests cover atomic replacement/acceptance, stable offer IDs and serial, cancellation without refunds, expired request-cache replay, every existing eligibility gate, two-job limits, missing machines, malformed tickets and old optional data.
- The isolated local Worker HTTP test uses generated test wallets and seeded completed-project rows. It verifies login, wrong/absent identity, non-contributors, racing claims, home authority, successful spending and replay. It does not verify a real browser wallet extension. An initial local SQLite busy error was observed during fixture login; the final complete test passed without retries inside the test.
- Browser UI fixture: selecting Tiny Labs changed the displayed time, parts and reward without spending; accepting reduced two stored choices to one; cancellation retained the selected offer and one remaining choice. Browser console errors: none. The temporary fixture route/config were removed before the production build.
- New migration `0007_nappy_red_wolf.sql` only adds a nullable policy column. Populated pre-migration project terms remain unchanged and receive null. Existing local DB was backed up before applying this migration. Hosted preflight found zero account and project rows and no existing benefit column; it is not a hosted backup/restore drill.

## Running the isolated HTTP check

`tests/dispatch-api.test.mjs` refuses anything except loopback port 3003. Start a local Vite preview with Cloudflare `persistState.path` set to `.wrangler/qa-dispatch`, apply the canonical journal to that isolated database, and run `NOOBIUS_TEST_ORIGIN=http://localhost:3003 npm run test:dispatch-api`. Do not use its database fixtures against a hosted environment. Keep temporary preview configuration and fixture pages out of the production archive.


## Private release evidence

Deployed source `3733c5c5a6274b35b0c99df4702389d6d0221dae`, also pushed to GitHub main and the work branch. Version `appgprj_6a9ef8b4a03c8191a7e106551d030528~appgver_27638e9ba1408191bc0b248b42b7e65d`; deployment `appgdep_6aa104bfecb48191bc801b4462071fbc` succeeded at 07:03:40 UTC with environment revision zero. The live schema includes `benefit_json`. Owner-only access and runtime settings were preserved. Hosted guest save reopened with 880,287 spendable and 408,240 stored Compute unchanged; updated Jobs offers rendered correctly and the browser console contained no errors. This hosted smoke check did not exercise authenticated specialist rewards; those were covered by local SQL/HTTP and the temporary browser fixture described above.
