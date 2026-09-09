# Neighborhoods implementation checkpoint

Updated September 9, 2026. Branch: `codex/noobius-neighborhoods`.

The merged checkout contains the neighborhood game and the newer Ethereum/EVM + Solana wallet entry. This checkpoint has not yet been deployed. Record the final commit, saved Site version, migration result and successful deployment here after publishing; a passing local build is not that evidence.

## Implemented

| Area | Current behavior |
| --- | --- |
| Jobs and progression | Twelve renewable job templates across service, supply and workload families. Players can accept two jobs of different kinds. Diagnosis, dispatch and capacity-reserving workloads require explicit actions. Three equipment styles, mastery stamps, center accents and a trophy provide progression. The Operator license also requires a commissioned cluster. |
| Guidance and onboarding | Locker customization, four illustrated introductory slides, Margo guidance, the free first machine and a Jobs menu. Directions walk to or open the relevant activity; they do not buy, craft, collect or claim on the player's behalf. |
| Personal centers | One saved center per account. Existing saves, production tick phase, inventory and uncollected output are retained. Visitors see a sanitized center and cannot spend or build for its owner. Leaving owners return visitors to the plaza. |
| Neighborhoods | Five-slot D1 admission with progression-band preference, entrance portals, membership leases, controller generations, movement sequence checks and authoritative worksite/home checks. The client queues commands, handles corrections, offers explicit tab takeover and recovers expired membership. |
| Shared work | Persistent cluster projects freeze their requirements when started, consume completed-job contributions and crafted parts, and award contribution-based rewards. Outstanding claims survive travel. Shared outage repairs retain controller/proximity checks and durable bonus claims. |
| Social | Neighborhood chat, quick pings, invite/join flow, recent neighbors, mute/block controls, name validation and persisted message reports. Blocking also restricts relevant visits, offers and social visibility. This is not a full friends/party system. Reports have no moderator dashboard or staffed review workflow yet. |
| Item market | Player listings, search/filtering, pagination, progression qualification and optional offers to a neighbor. Inventory is escrowed; cancellation returns it. Purchases debit Compute and transfer existing items through server transactions. Finished equipment comes from crafting or players, not an unlimited NPC equipment seller. |
| Wallets and saves | Wallet-first entry with a separate guest option. EVM injected/EIP-6963 and Solana Wallet Standard message signing use server-verified challenges and separate account keys. Guest saves remain on that browser/origin and are not imported into wallet accounts. |
| GPU District | Distinct scenery and project variants. Operator progression and the EVM holder adapter are wired into admission, reads, writes and safe access-loss recovery. This is not a complete second suite of unique activities. |
| Runtime controls | Configurable admission cap and separate pauses for new arrivals, new player trades and new cluster projects. Existing cancellation and earned-reward paths remain available within their normal authorization rules. See the [operations notes](neighborhoods-operations.md). |

Holder verification checks the configured EVM chain, exact token contract, decimals, confirmed block and balance threshold. It caches results for 60 seconds, grants only bounded grace after a prior eligible result, and rechecks authorization at writes so concurrent revocation wins. No actual token policy is configured. Solana holder verification is explicitly unsupported by this EVM adapter; a Solana account cannot borrow an EVM account's entitlement. Free gameplay remains separate from holder access.

The $NOOBIUS Exchange remains a preview. There is no live quote, payout request, settlement service, token transfer, funded reward program or Long.xyz/NBIS integration. WalletConnect QR transport, embedded email wallets and EVM contract-wallet authentication are absent.

## Validation recorded for the merged checkout

| Check | Evidence and scope |
| --- | --- |
| Unit and SQLite rules | All 110 tests passed in the default suite, covering gameplay, providers, saves, neighborhoods, projects, social/market rules, holder authorization, race/replay protections and migration reconciliation. |
| Migration reconciliation | Five of those tests exercise canonical fresh installation and preservation of deployed records, identities, saves and existing escrow. |
| TypeScript and production build | Both passed after reconciliation. This proves the source can compile and package, not that the hosted rollout succeeded. |
| Local HTTP integration | Three wallet API tests, one campus API test and one multiplayer API test passed. These use generated-key accounts and local Worker/D1 requests; they do not prove extension dialogs or real-device behavior. |
| Fresh browser journey | The rebuilt production preview demonstrated first play, locker, four slides, Margo, free build, Jobs menu and icons, manual actions and return after reload. The missing Solana-extension fallback was actionable. No real wallet extension was available for acceptance; GPU District manual browser acceptance remains open. |
| Local load experiment | Before the wallet merge: 50 synthetic clients in ten neighborhoods, 2,000 sync requests over 60 seconds; p50 187 ms, p95 224 ms, p99 240 ms, maximum 252 ms, zero errors. This was local Miniflare, not hosted D1 or public capacity evidence. |

The transport is HTTP polling at a nominal 1.5-second interval, with hidden-tab suspension and bounded retry backoff. It is not WebSocket multiplayer. Five players per neighborhood and the default total admission cap are implemented limits, not measured guarantees about a public deployment.

Dependency review flagged 13 advisories. The reviewed paths were tooling-related, with no confirmed request-path reachability established in that review. This is neither a clean dependency audit nor a reason to skip the public-release patch follow-up. Repository-wide lint has an existing backlog; no clean full-lint result is claimed here.

## Migration lineage

The canonical deployable history is `0000`–`0004_odd_blackheart`, followed by `0005_tired_jocasta`. The published wallet migration is retained, and the neighborhood schema is appended without adding `players.public_id` twice. Experimental neighborhood migrations are archived under [`migration-history/pre-reconciliation-4385554`](migration-history/pre-reconciliation-4385554) and must not be run against the hosted database.

Migration tests exercise local SQL and record preservation. They do not prove hosted migration bookkeeping, a backup, a restore or rollback compatibility. Existing experimental local databases need a deliberate reconciliation or a new isolated test database; applying the canonical files blindly is not a migration plan.

A bounded live database read confirmed that `players.public_id` already exists and returned zero player rows with no further page. This verifies the inspected schema and data state only; it does not demonstrate a hosted migration or restore.

## Remaining work

1. Publish the validated checkpoint and verify the hosted migration, assets, authentication endpoint and saved-game flow against the exact deployed source.
2. Accept actual EVM and Solana extensions, mobile devices, account changes, reload, reconnect and separate saves on HTTPS. Exercise visits and shared work with independent browsers and people.
3. Measure hosted request rate, latency, D1 use and cost; test reconnect/login bursts and longer sessions. Re-run meaningful load checks after integration. Set admission limits from that evidence.
4. Establish monitoring, alert ownership, dependency patching, report review/support and a rehearsed hosted backup/restore and compatible rollback path before public access.
5. Finish distinct GPU gameplay if it is advertised as a substantial new district, and configure real holder verification only after the exact asset policy is confirmed. Solana token verification requires a separate implementation.
6. Run longer human first-session and return-session playtests. Clarity, enjoyable cooperation and reasons to return are not established by passing tests or adding more rooms.

These are concrete alpha features and local checks. They do not establish console/AAA quality, proven retention, public capacity or a production-ready token economy.
