# Machine capacity and batch economy

Implemented September 9, 2026, following the specialist dispatch release. This is an economic/gameplay foundation, not proof of long-term retention.

## Why change it

The prior fully upgraded center produced 6,804 Compute/minute. Most job fees were 28–340. Choosing a larger rack only increased reimbursement for paused idle output; it did not process more work. Passive purchases could finish the equipment path without using the other systems.

## Rules

- New and migrated centers produce `6 + 2 × (machine level − 1) + speed bonus` per built machine per 15-second tick. Speed bonuses are `[0,3,4,5,6,7]`. Starter remains 24/minute, its first speed upgrade remains 36/minute, and maximum idle production is 476/minute. Speed prices are now `[20,80,220,500,900]`; existing purchases remain owned, with no refund or new charge.
- Machine power becomes client batch capacity: level × machine power. Maximum Starter accepts three units; maximum Core machine accepts thirty. The player explicitly chooses the machine and batch size. Moving to a smaller machine cannot silently change the batch.
- New workloads consume ingredients and pay the unit fee multiplied by batch size. Duration stays constant because units run in parallel. Fixed booking fees are 24/36/72/96 for Tiny/Render/Quiet/Training. These protect early bought-input margins without reimbursing every larger machine's idle income.
- Fast workloads finish 30% sooner and use one extra copper per unit. Efficient saves 35% of raw inputs after aggregation and runs 20% longer. Stable saves 20% of crafted workload inputs after aggregation, retaining its favored reputation bonus. Training is currently the only workload with crafted components; batches below five do not save a board because requirements round up.
- Every completed batch earns one report, one completion and its normal single-job reputation/mastery proof. Thirty units never create thirty qualification proofs. New terms and quantity are frozen when the job starts.
- Bulk crafting supports 1–30 parts. All inputs are committed upfront, bench time remains the sum of individual fabrication times, and the player explicitly collects the whole batch. Crafting progress and XP remain per item. Full backpacks preserve the completed batch and show the exact space shortage with a parts-management link. Each new batch has a unique ID so stale collection cannot collect a later batch.

## Demonstrated choices

Maximum Core machine, thirty Training units, start aligned to a production tick. Boards valued at their recursive raw fabrication cost of 77 Compute; copper at 7, silicon at 12. All three pay 6,696.

| Setup | Ingredients | Seconds | Idle output forgone | Margin above idle, after replacing supplies |
| --- | --- | ---: | ---: | ---: |
| Fast | 30 boards, 90 chips, 30 wire | 168 | 187 | 2,909 |
| Efficient | 30 boards, 59 chips | 288 | 323 | 3,355 |
| Stable | 24 boards, 90 chips | 240 | 272 | 3,496 |

Fast wins immediate throughput when boards are stocked. If each batch first requires serial board fabrication, Stable yields about 486 net Compute/minute across fabrication plus processing versus Fast's 428; Fast finishes that combined cycle 24 seconds sooner. Efficient conserves chips and beats Fast's income rate on the separate Tiny workload. These examples exclude purchasing/movement overhead. Different start phases can add one idle tick to non-integral durations.

The existing deterministic passive purchase coach now completes all machine levels, speed upgrades and rooms in 177.25 simulated minutes, versus the prior audit's 42.5. This is one synthetic purchase route, not an optimal route, human session estimate, or retention result. The player-facing coach still only guides; it does not execute this simulation.

## Preservation and deployment

`productionVersion: 2` is separate from currency and tycoon versions. Completed old production ticks settle under old rates before the transition, preserving the partial tick. Previously stored output above the new cap remains collectible; additional output pauses until space is available. Credits, inventory, bank, equipment, outfits, reports, dispatch choices and pending jobs remain intact.

Authenticated profile reads persist migration with the existing version/state compare-and-swap. Guest saves force a revision-checked write even when the normalized snapshot has not changed; storage failure remains retryable. Unknown future production versions cannot silently become fresh guest saves.

New acceptance stamps `quoteVersion: 2`. Existing accepted jobs with no version retain their original one-unit quoting rules. Running receipts keep their promised payment, cost and timing; post-transition reservation deductions use the actual new machine output. Existing single pending crafts retain their quantity-one interpretation and original deadline.

No SQL migration, token configuration, access change or payout service is included. Do not roll back to pre-batch application code once new batches exist: older collection code would not preserve multi-part pickup. Use a compatible forward fix or a deliberately verified state-compatible rollback.

## Validation and remaining limits

163 default tests pass, including new capacity, equipment crossover, batch proof conservation, production phase/overflow migration, legacy quote, storage-failure and stale-craft tests. A real local Worker/D1 HTTP test passed against generated-wallet fixtures: concurrent profile migrations, harvest/start/claim races, invalid capacity, null quantity, full-backpack recovery and concurrent bulk pickup conserve state. Isolated fixture clocks were explicitly advanced for claim acceptance; this is not a real-extension or long-session test.

A temporary browser fixture verified explicit machine/batch/module selection, unchanged inventory during preview, the smaller-machine error, Stable thirty-unit start consuming 24 boards/90 chips, total crafting ingredients/time, and preserved finished parts when a backpack is full. No browser error-level messages were reported. That fixture and its isolated server configuration are removed before production packaging.

Larger batches remain the profitable money choice when supplies are abundant; small batches conserve stock while earning the same report. There is still one workload offer, so this is not simultaneous competing workload allocation. Machine purchases remain finite. Repeated jobs, reports, specialist projects and trading provide further activities, but real-player return sessions must demonstrate that they remain enjoyable. Actual token payouts and all outstanding wallet/device/hosted-load/operations gates remain separate.

TypeScript, scoped lint for the new production/contracts/choice logic and batch tests, and the final production build passed. Existing repository-wide lint debt remains outside this pass. The publishing record is maintained in the implementation checkpoint.
