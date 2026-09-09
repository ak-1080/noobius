# Cluster commissioning

September 9, 2026. This pass makes newly started neighborhood projects require service checks and actual machine time. Stockpiles alone no longer finish all three contribution families at one timestamp. This is one part of the ongoing Neighborhoods upgrade, not a claim of completed public-launch acceptance or proven retention.

## Player flow

1. Finish and claim a client job to earn its report. Matching GPU projects still require the equipment recorded on that completed job.
2. Bring the report and listed parts to Margo.
3. Supply delivers a Compute board immediately. Service runs diagnostics, asks for the matching repair, then requires a successful final test. Workload lends an available machine to process 20 commissioning packets.
4. The crew can contribute independently. Requirements are fixed at project creation, and one player can finish if everyone else leaves.
5. Timed runs complete from the server clock even after disconnect. Normal neighborhood polling updates the shared cluster when the last run finishes. Each completed project contribution still pays 100 Compute and 20 reputation, once claimed. Existing dispatch benefits are unchanged.

## Service and machines

Service has three stages: inspect after 3 seconds; select the repair after another 3 seconds; test after 6 seconds. The readings distinguish a disconnected cable, an open breaker and a blocked intake. An incorrect repair adds a 3-second retry delay and consumes no report or parts. Each player owns their attempt, so abandoning a diagnosis never holds the crew's last service slot. Only the final successful test debits the report and repair kit, with a version check against concurrent participants.

A machine loan lasts `15 × ceil(20 / capacity)` seconds. Examples: level-one starter = 300 seconds, level-three F = 30 seconds, level-three G = 15 seconds. The full selected rack is reserved and its ordinary output pauses for that recorded duration. Its report and supplies are consumed when assigned. The player sees the exact duration and paused output before committing. Other racks remain available for jobs and ordinary production. Larger machines finish sooner; using a smaller rack leaves larger capacity free for a client batch.

These are finite, automatic runs: no cancellation, manual pickup or continuing charge after the deadline. A rack cannot simultaneously serve a client batch and a crew loan. Running loans block upgrades that would alter their capacity or production rate. Client results that need collection are identified in the machine UI. The earnings strip derives its next payout from the same reservation accounting as storage settlement.

## Preservation and authority

- Additive migration `0008_foamy_sersi` introduces project work versions, pending contribution deadlines and personal service sessions. Existing projects default to work version zero and retain their original contribution rules. Old contributions default to complete; saved claims, balances, report proof and project benefits remain unchanged.
- New projects explicitly use version one. Server checks enforce membership, scene, Margo proximity, controller generation, lease, realm permission, report budget, parts and available rack before a contribution commits.
- Project progress, inventory/report debit and contribution ledger changes use an atomic batch and optimistic version checks. Due authorized work is finalized idempotently; it does not grant permission to start work.
- Stable client request IDs survive a lost response. Replaying a loan after its rack becomes free does not start a second loan or spend again.
- Reservation history remains until production settlement has accounted for its last affected tick. Late harvests and off-tick start times preserve output.
- Rolling application code back to a release that ignores project reservations could overpay ordinary output. Use a forward fix, or establish a deliberate settlement/compatibility migration first. A local SQLite backup was taken before applying 0008; this is not a hosted backup or restore drill.

## Validation

- Default suite: 187 passing tests, including 13 commissioning cases. Covers deadlines, wrong answers, final-test races, last workload slot races, controller/account conflicts, reconnect/retry, solo completion after departures, output conservation, earnings forecasts and migration of populated legacy records.
- Real local Worker/D1 API test: generated wallet sign-in, project creation, rejection of premature service, timed diagnosis/repair/test, one rack assignment, retry, normal neighborhood polling completing the cluster with the board closed, and two competing claims yielding one reward. Uses a generated account and seeded earned reports in isolated `.wrangler/qa-dispatch`, not a live extension or real player.
- Browser UI review: captured local API states rendered diagnosis choices, pending contribution copy and reduced earnings correctly. A separate selector fixture confirmed changing machines updates duration and paused-output quotes. Temporary QA route/data/configuration were removed before the production build.
- Live preflight: owner-private access verified; bounded reads returned zero rows/no further pages for players, projects and contributions. This does not prove backups or future capacity.

## Remaining work

Human playtests must evaluate whether these decisions remain worthwhile after upgrades. The 15–300 second loan range and the diagnostic pacing are tuning choices, not proven retention. The first starter loan takes five minutes, so the player should have other useful work available. This pass retains HTTP multiplayer polling and the existing two destinations. Real wallet/device acceptance, hosted load/cost measurement, monitoring, moderation staffing, backup/restore and the exact holder asset policy remain outstanding. No real token payouts or NBIS/Long integration were enabled.

## Publication

Published privately as Site version 36 at 08:17:09 UTC on September 9, 2026, from source `3b32158c38927f3bfd92fb1dd560a2715f4e54bf`. Hosted database inspection confirmed `cluster_service_sessions` and the added project work version. The existing guest game reopened with 880,287 spendable and 408,240 stored Compute; no economic action was taken. No error-level browser messages appeared after publication. This smoke check does not substitute for authenticated multiplayer acceptance.
