# Earning routes and linked-wallet safeguards — September 28, 2026

This update closes repeatable issuance and extraction routes outside the client-demand cap. The initial beta limits are **6,000 gross Compute commitments, 600 recovery-value points and four diagnostic shift starts per rolling 24 hours**, shared by a wallet and its enrolled browser pool. Existing balances, stored parts, accepted work and peer transfers remain available. This is a bounded earning policy, not proof of human identity or a funded P2E economy.

The code is intended for isolated staging. Production at `play.noobius.io` remains unchanged. No existing wallet, real funds, token signer or mainnet transaction was used for this audit.

## What the audit found and changed

| Route | Finding | Guard now applied |
| --- | --- | --- |
| NPC service/supply/workload jobs and specialist commissions | The previous per-account client cap covered these, but other routes remained outside it. | Keep 12 starts / 4,000 gross quoted Compute per account, inside the shared 6,000 allowance. Reserve the full payment when starting. |
| Legacy dispatch deliveries | Repeatable deliveries bypassed the newer client-demand ledger. | They now consume a client booking and quoted payment, plus the aggregate allowance. |
| Supplied machine batches | Finite inputs and no unattended restart; repeated batches were still unbounded if supplied repeatedly. | Reserve their full quoted reward at start. Collect once, without consuming quota again. |
| Eleven salvage nodes | Cooldowns and energy slow gathering but do not bound daily extraction. Gathered parts can be sold or processed into Compute. | Charge new material output against 600 recovery-value points before granting items. Uses actual skill-adjusted quantities. |
| Realm recovery: 4 realms × 3 sites × 3 approaches | Thirty-six variants have frozen supplies, outputs and timers, but free starter recovery could repeat indefinitely. | Reserve the full output bag's recovery value at start. Already-booked output remains collectible. |
| Original diagnostic shifts | Puzzles are automatable and new shifts could be repeated. Each perfect shift creates up to 145 Compute and 14 material points, including repair loot. | Reserve those maxima at start, and permit four new shifts per window. No repeated debit while answering. |
| Outage repairs | Repeated repairs create 40 Compute each. | Atomically count each successful reward in the aggregate allowance. |
| NPC item sales | Salvage-to-NPC resale creates Compute; peer-to-peer item sales transfer existing Compute. | Count positive NPC payouts. Existing peer escrow remains a conserved transfer. |
| Crew station work | Repeating event work pays 20 Compute per station. | Reserve 20 when the server accepts the start; completion pays the promise once. An expired abandoned start does not refund allowance. |
| Crew event bonus | Completed events can create another 30 Compute. | Charge inside the same transaction as the claim. Exhaustion leaves the bonus unclaimed. |
| Cluster project rewards | Completed projects pay 100 Compute per contribution unit. | Charge the actual reward in the claim transaction. Exhaustion preserves the completed project, reports, reputation and pending reward. |
| Story, daily cards and workday rewards | Fixed story progress and per-day checks already prevent immediate repeated claims. | Keep those checks and include their positive payouts in the aggregate allowance. A calendar-day reset does not reset the rolling allowance. |
| Legacy currency migration, frozen passive storage, old accepted jobs | These are existing liabilities, not new repeatable v3 output. | Preserve their once-only conversion/collection. No fresh passive v3 generation is added. |
| Banking, crafting, player item trades and Compute/token checkout | These move or transform existing inventory/balances. | Keep existing conservation, guarded versions, escrow and once-only settlement. Do not spend extraction quota merely for transferring or crafting owned parts. |

All positive ordinary facility payouts use the server's default issuance classifier, including unknown future reward action types. Exceptions are the explicit previously booked claim and legacy-storage paths. Reward routes outside `facility` are integrated separately. Pure offline/practice saves have no financial issuance authority; connecting a wallet loads its server save rather than importing guest credits.

## What the numbers mean

- **Compute:** gross new commitments, not profit, current balance or a withdrawal limit. Spending Compute does not replenish this allowance. The 4,000 client limit is per account; the 6,000 aggregate limit is shared across linked wallets.
- **Recovery:** sum of the NPC resale values of newly obtained items. Scrap costs 1 point; copper and coolant 2; silicon and fiber 3. Equipment uses its catalog resale value. Inputs purchased from NPCs/players, crafting transformations, banking and peer transfers do not create new extraction.
- **Shifts:** four starts for the original diagnostic puzzle system, not four of every repair/client action. Reserve 145 Compute and 14 recovery points per shift; unused potential is not refunded.
- **Time:** bookings leave the window 24 hours after their server-recorded start/credit time. Waiting does not bank unused allowance. Midnight, reload, a changed client clock, cancellation and moving between desks do not refill it.

Delayed collection can exceed 6,000 on a single calendar day when older promises are collected together. Pre-policy promises and frozen storage can also pay above the new reservation limit. That is deliberate preservation of earned value; do not describe this as a strict daily cash-collection ceiling. Already-started client work and machine/field output reserve at start; project and crew bonuses are budgeted when claimed and remain pending if temporarily blocked.

The compact disclosure in the earning/work/inventory/exchange panels shows the server's remaining allowances. Its explanation stays collapsed until requested. Desktop and a 390 × 844 viewport passed inspection with no horizontal overflow. The temporary review route was removed before either build/deployment.

## Multiple-wallet controls and their limits

The server issues a random, HttpOnly browser cookie and stores only its SHA-256 hash. It accepts an existing token only if present in the registry. The wallet's **first enrollment** pins its browser pool. Subsequent sign-ins do not rebind it, so clearing cookies, disconnecting or moving an already-linked wallet to another device cannot restore its allowance. Other wallet addresses in the pool are not returned to players.

New account creation is separately limited to **three new centers per browser and twenty per network per rolling day**. The network key is a privately salted hash of Cloudflare's edge-provided IPv4 address or normalized IPv6 /64, not a browser-supplied body field or raw stored IP. IPv4-mapped IPv6 formats normalize into the same bucket. Existing centers can still log in at either signup cap. A failed signup rolls back new player/session creation.

Network identity is used only for signup throttling. Independent browsers on the same Wi-Fi retain separate earning budgets. Shared networks such as campuses can still hit the twenty-new-centers throttle; that is a documented beta tradeoff, not a claim that shared IP means shared ownership. Cloudflare documents the NAT false-positive issue in its [rate-limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/) and its trusted edge headers in [HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/). The canonical edge IP takes priority: a secondary IPv6 header cannot replace an ordinary address. The preserved IPv6 header is used only for Cloudflare's Class E Pseudo IPv4 overwrite mode, and malformed/missing preserved addresses fail closed.

**Not solved:** fresh browsers plus new wallets can get separate pools, up to the network signup limit; other networks/VPNs can evade that throttle. Pre-existing wallets already enrolled in different pools are not merged simply because they later use one browser. Automation inside allowances, coordinated market manipulation and proof of one person remain open. The hosted test deliberately demonstrates the independent-browser limitation rather than concealing it. This is bounded abuse exposure and friction, not Sybil-proof launch certification.

Turnstile is **not configured or enabled** in this change. A later risk-based signup layer could help discourage automated account factories; it would require server-side, single-use validation and must not be treated as identity proof. See [Cloudflare Siteverify requirements](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). Before any real-value release, add measured abuse signals, review account-creation exceptions for legitimate groups, tune these beta limits through playtests, and independently assess payment/economy abuse.

## Persistence, privacy and rollback

Migration `0013_amazing_ozymandias.sql` adds four indexed tables and two triggers; it does not reset balances, inventories, offers, accepted jobs or existing accounts. The guarded devnet staging deployment now applies unapplied migrations before deploying the game. Never initialize the fresh migration chain over an existing database.

Each issuance event is appended **inside the same D1 batch as its guarded successful game write**. A concurrent loser or replay makes no event. A trigger abort rolls back inputs, currency, reward flags and quota together. Cloudflare documents transactional batch rollback in the [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/); [SQLite `RAISE(ABORT)`](https://www.sqlite.org/lang_createtrigger.html) supplies the trigger rejection. Local real-D1 API tests verify this behavior instead of relying only on a mocked transaction.

Existing housekeeping removes earning events older than 30 days, clears old network hashes after 30 days and deletes expired unreferenced browser registry entries. Minimal wallet-to-pool links remain while the account exists so clearing cookies cannot erase an established restriction. No raw IP, browser fingerprint, wallet secret or provider endpoint is stored in these records or audit artifacts. The additional allowance query and indexed trigger checks have functional/concurrency coverage; their sustained D1 cost at large scale has not been measured.

The pre-update staging export is private and ignored at `.wrangler/staging-backups/pre-earning-abuse-2026-09-28.sql`. To roll back code, the additive tables can remain; earlier code will not enforce the new limits. Do not drop them or restore an older database over newer paid obligations without a separate recovery decision.

## Reproducible evidence

- `npm run audit:earning-routes` produces [the rule/price report](2026-09-28-earning-routes.json): 20 catalog cycles, 18 fully purchasable from NPC inputs, all with negative margin. The best NPC-input margin is −2 Compute; the two unpriced variants require recovered/player-supplied parts. It also inventories eleven salvage nodes and all 36 field variants. Free starter recovery has a positive resale yield and is now extraction-bounded. This excludes player prices and is not a market-price forecast.
- `npm test`: **493 passed**, including 17 earning regressions and a real completed-project rollback/late-claim test. Coverage includes cross-wallet allowance races, forged clocks/metadata, rolling-window expiry, material rollback, the four-shift ceiling, reserved client/batch output, registry validation and network normalization/secondary-header spoofing.
- `npm run typecheck`, `npm run test:tooling` (3 tests) and the standard build passed. Targeted new-file lint passed; repository-wide historical lint findings remain.
- Isolated HTTP/D1: `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 node --test tests/earning-policy-api.test.mjs`: **6 passed**, covering the linked-wallet race, signup cap, independent budgets on one network, cookie clearing, booked-batch collection, four-shift ceiling and preserved pending crew bonus. The separate existing `client-demand-api.test.mjs` regression passed as well.
- API setup uses `tests/client-demand.vite.ts`, initialized isolated `.wrangler/qa-dispatch` D1 and only the unapplied migration. Fixture seed commands refuse any origin other than local port 3003. Never point fixture suites at hosted services.

## Hosted staging record

- Final game Worker: **`ba77ae6e-e6d3-4410-8eaa-0af4f11b45ab`**. The guarded script preserved devnet-only checkout and passed private RPC/mint/proof, payment drain, page/asset, D1, generated Solana sign-in/save and market preflights. No token transfer was made. Recovery Worker version is recorded with the deployment log on the original computer.
- Migration 0013 first failed remotely with `incomplete input` while succeeding locally. A read-only schema check confirmed the failed migration left no earning tables/triggers or migration entry. Conditional `SELECT RAISE(...) WHERE ...` replaced nested `CASE/END`; remote apply then executed all 12 commands successfully. This avoids the remote trigger-splitting incompatibility reported in [Cloudflare's issue tracker](https://github.com/cloudflare/workers-sdk/issues/4727). Uppercase trigger boundaries and LF checkouts are preserved in `.gitattributes`; see the related [remote parser report](https://github.com/cloudflare/workers-sdk/issues/15314). No existing game records were reset.
- [Hosted browser-linking/signup acceptance](2026-09-28-earning-abuse-staging.json) passed in 5.1 seconds with clean logout: three fresh Solana centers shared their pool, a fourth was rejected with 429, cookie clearing preserved the first account's link, and an independent browser on the same network retained its own allowance.
- The first hosted attempt timed out after confirming shared pools and had two logout cleanup failures. Staging health stayed 200; subsequent Worker observations had no exceptions and short execution times, while this machine's Node HTTP connections intermittently took seconds. The successful rerun preferred IPv4 DNS results and recorded request timings; this is a test-transport mitigation, not proof of global uptime. The initial generated, unfunded identities have no money; any unreleased sessions expire normally. Do not omit that failed attempt when interpreting the evidence.
- Production public health passed at **2026-09-28 19:14:27 UTC**. No production deployment occurred.

The normal-action multiplayer earning acceptance is recorded separately after completion. Neither test is a load/capacity test or human wallet-extension acceptance.
