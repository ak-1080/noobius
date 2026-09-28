# Bounded recurring client demand — September 28, 2026

The active-play update removed time-only machine issuance, but the first economy audit still found profitable, unlimited repeat client work. This change bounds **new NPC client payment promises**, while keeping meaningful equipment, batch-size and supply choices. Values are initial beta balance settings, not proof that the whole economy is ready for real-value rewards.

## Rules and player behavior

- One shared allowance per saved player center: **12 starts and 4,000 Compute in gross quoted client payments within a rolling 24 hours**. It covers service repairs, supply orders, computing jobs and specialized client-desk commissions together. Neither desk has an extra allowance.
- Demand is committed when work **starts**, in the same authoritative action as spending its inputs/fee and saving its terms. Accepting a job without starting it does not spend demand. Failed starts spend nothing. A batch is one booking but consumes its full payment allowance; larger machines cannot multiply the ceiling.
- Earlier starts leave the window individually after exactly 24 hours. Midnight, reconnecting, collecting late, changing modules, board rotation, dispatch choices and canceled unstarted work do not reset it. Idle days do not accumulate multiple allowances. Server time decides the boundary.
- A completed job pays its original frozen reward once, even if collected later or after this cap is introduced. The limit applies to newly booked promises, not a confiscation of saved money or a strict cap on payouts collected in a particular calendar day. Already-started jobs above the new budget are grandfathered. Their original start times count if still within the window.
- Both panels show remaining bookings, remaining Compute demand and the next rolling refresh. An oversized workload can explicitly reduce its units to fit. Exhausted bookings are blocked. Margo and career suggestions point to recovery/preparation instead of unavailable new client work; finishable and paid work retain priority.
- Gathering, finite supplied batches, realm recoveries, crafting, building and player trade remain available. These other reward sources need their own economy review; this change does not impose a global Compute-balance cap.

## Storage and authority

`lib/client-demand.ts` defines the limits and a small versioned booking ledger. `Facility.clientDemand` is saved inside the existing Cloudflare D1 facility JSON. No schema migration or additional database is required. Normalization seeds existing started client work without changing its payment terms. Invalid/duplicate ledger records fail closed.

Hosted starts use the server's `applyFacility` path and existing conditional D1 version/balance update. Booking, supplies, fee, rack reservation and ledger commit atomically. A stale concurrent result cannot overwrite another start; the losing request reloads current state before it can succeed. A client-provided ledger or clock is ignored. The ledger travels with subsequent inventory writes and wallet sign-ins. Guest practice keeps the same rules in local saved state; it is not a source of hosted balances.

The allowance is per game account. One person can create multiple wallets, and inputs/actions can still be scripted. This bounds recurring NPC issuance per account; it is **not** Sybil protection, a human-identity check or proof of bot resistance. It also does not fund a real token payout.

## Economy evidence

Run `npm run audit:economy`. [New report](2026-09-28-client-demand-economy.json); [uncapped historical baseline](2026-09-28-active-economy.md).

| Sequential strategy                | Before: net in one idealized hour | After: gross client payments | After: input spending | After: net | Bookings before stopping |
| ---------------------------------- | --------------------------------: | ---------------------------: | --------------------: | ---------: | -----------------------: |
| Starter rack, no modules           |                             2,351 |                        1,129 |                   402 |        727 |                       12 |
| Fully upgraded, all qualifications |                            32,022 |                        3,981 |                 1,481 |      2,500 |                        3 |

Both new scenarios stop at the shared demand boundary before the simulated hour finishes. Unattended time alone still issues zero Compute. These simulations use actual action rules, rotating offers, merchant purchases and sequential crafting. They seed buying capital/upgrades and exclude walking, network delays, service/supply/commission strategies and other earning routes. Individual route rates in the JSON are uncapped comparisons, not achievable hourly income under this policy. The 30-unit training quote exceeds a fresh allowance and must be reduced. Results are not typical player earnings or a full inflation audit.

## Verification

- All **475** game-rule tests passed. Twelve demand regressions cover shared families/desks, exact and oversized payment boundaries, retries, failed starts, cancellation, serial changes, two accepted jobs, serialized saves, rolling expiry, clock reversal, older work and guidance. TypeScript, standard and staging builds passed.
- A real local HTTP/D1 race passed: two different client starts competed for the last booking; one committed, the other failed, and inputs/fees balanced. Retries, a forged client ledger/clock, inventory writes and a fresh signed login could not reset demand. This uses only generated local QA accounts.
- Local browser inspection rendered the actual panels with fresh/partial/exhausted fixtures. Reducing a 30-unit training job to 2 units changed its quote from 6,696 to 536 Compute and exposed Start workload within 600 remaining demand. An exhausted desk disabled all three booking buttons. The card fit a 390-pixel viewport without horizontal overflow. The temporary review route was removed before deployment; no wallet was connected.
- A fresh ignored staging D1 export preceded the guarded devnet deployment. Game Worker: `5700ce69-3f56-4948-821a-2c4bf2a17524`. RPC/mint/proof, zero unsettled payments and page/database/login/market preflights passed. No blockchain transfer was made. Production is unchanged.
- [Hosted staging report](2026-09-28-client-demand-staging-gameplay.json): three generated players completed three repair rounds each. The ledger reserved each promised payment; duplicate claims, item trading, reconnection and new signed logins preserved it. Finite batch, visitor privacy and competing item-buyer checks also passed; all cleanup succeeded. This is a small gameplay acceptance session, not a load/capacity test or a new human wallet checkout.
- Targeted lint passed for the rule and interactive-panel changes. The existing guide markup still has its prior Next image/link findings; repository-wide lint is not clean.

## Repeat the local D1 boundary check

The fixture test refuses hosted origins. Prepare an **isolated** local database in `.wrangler/qa-dispatch` with the thirteen canonical Drizzle migrations if it does not yet exist. Do not apply a fresh schema over an existing QA or player database. It uses the placeholder D1 binding in `.openai/wrangler.local.json`; no Cloudflare account or wallet funds are needed.

Start `npx vite --config tests/client-demand.vite.ts` in one terminal, then run `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 node --test tests/client-demand-api.test.mjs` in another. Use Vite directly for this test: `vinext dev` does not accept the custom-config/host arguments used here. Stop the isolated server afterward. A deliberate fixture-match assertion aborts if the running server is bound to a different database.

## Remaining balance work

Playtest the initial ceiling with new and fully upgraded people. Check whether profitable choices and enough useful activities remain once client demand is used. Audit all other issuance routes and parallel strategies, then tune values, scarcity and recurring spending from evidence. Continue the human/mobile wallet, sustained multiplayer/cost and production migration/release checks in `PROJECT_HANDOFF.md` before promoting this staging build or introducing real-value trading.
