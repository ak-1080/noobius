# Active economy acceptance audit — September 28, 2026

The idle-minting fix works, but the active economy is **not yet demonstrated to resist repeat scripts or sustain real-value trading**. This audit adds a reproducible diagnostic and save-conservation tests. It changes no payout, price, player balance, token policy, or production deployment.

Run `npm run audit:economy` from a fresh clone. The [JSON report](2026-09-28-active-economy.json) includes every measured route and its assumptions. The simulator uses the real `applyFacility` rules, server-time deadlines, purchase/craft actions, equipment capacity, input consumption, and automatically rotating client offers. Only isolated in-memory fixtures and a simulated clock are used; no hosted account or wallet is involved.

## Results

| Scenario | Observed result |
| --- | --- |
| Fully upgraded center left alone for seven days | 0 new stored Compute |
| Buy inputs for Reclaim / Cool / Model finite batches | Net loss of 2 / 4 / 6 Compute per batch |
| Starter rack, one hour of sequential NPC-supplied client workloads | +2,351 net Compute; 28 completed jobs, 1,358 spent on supplies |
| Fully upgraded center, one hour of sequential NPC-supplied client workloads | +32,022 net Compute; 19 completed jobs, 23,886 spent on supplies |
| Maximum 30-unit client quotes | Every tested workload/style combination has positive NPC-input margin |

The starter scenario begins with 1,000 synthetic buying capital, a starter rack, and no module; it earns qualifications during the simulation. The upgraded scenario begins with 100,000 buying capital, all machine levels and client qualifications. Neither is a fresh-player playthrough. Both finish without pending work or leftover materials, and all purchased inputs reconcile to actual spending.

These are **idealized strategy results**, not observed player earnings or a complete maximum issuance rate. Walking, hosted spatial checks, latency and request limits are excluded. Standard board crafting time is included sequentially. Gathering, service/supply jobs, competing commissions, outages, daily rewards, parallel strategies and player trades are excluded. The per-template hourly figures assume a repeatedly available template; the full strategy instead follows actual offer rotation. These results cannot establish token value, sustainability, or safe simultaneous-player capacity.

## What the evidence means

- Time alone no longer restarts income. Previously committed work can still finish while a player is away.
- Charging inputs for simple machine batches prevents that particular profitable NPC loop.
- Client workloads remain a repeatable source of newly issued Compute even when every input comes from the merchant. Buying materials and processing jobs can bypass gathering. The maximum-size rates remain large relative to finite one-time equipment/cosmetic sinks.
- Spatial checks, cooldowns and idempotency defend against impossible actions and duplicates. They do not establish that plausible actions come from humans.
- Profitable client work is an intended mechanic, not by itself a transaction bug. No arbitrary reward reduction was made in this audit. The next economy change should bound recurring NPC demand/issuance, preserve already-started quotes, and keep a zero-balance salvage path available. A market transfer changes ownership; it does not remove Compute from the system.

## Save checks added

The new regressions serialize and reload legacy saves before and after the production-version transition. They verify that a started client job keeps its inputs, deadline and promised payment, even across day rollover; retries pay once. A concurrent craft and machine batch retain their identities and rewards while old passive storage settles exactly once. Harvest, craft collection and batch collection remain independent and cannot duplicate the rewards.

All 463 repository tests and TypeScript checks passed after these additions. The complete test suite includes the existing Compute-market concurrency, payment settlement/recovery, room authority and replay tests. These are engineering checks; a new human wallet approval and real-phone acceptance still require people.

## Next evidence to collect

1. Expand issuance accounting to all parallel income routes, commissioning and renewable rewards, then select a bounded client-demand policy rather than hiding repeatability behind more clicks.
2. Use uncoached fresh and upgraded players to judge navigation, comprehension, enjoyment and useful resource sinks.
3. Repeat human devnet buying and seller receipt visibility on the current staging build. Wallet approval belongs to the player.
4. Measure full gameplay and pickup smoothness on physical phones and longer sessions before increasing operating limits.
