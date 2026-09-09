# Neighborhoods implementation checkpoint

Updated September 9, 2026. Branch: `codex/noobius-neighborhoods`.

The neighborhood game and Ethereum/EVM + Solana wallet entry were published as **Site version 30** on September 9, 2026 at 05:56 UTC. Source: `78de30b377462467ff604a0af212db8e22ba0b0d`, pushed to GitHub `main` and the Sites source branch without rewriting either history. The Site remains owner-private.

Deployment `appgdep_6aa0f50f0ce48191a9759fb9641eed1c` succeeded for saved version `appgprj_6a9ef8b4a03c8191a7e106551d030528~appgver_72ce5e492f1881919ddcef5f94911eb8`. The hosted database overview now lists all 18 expected game tables. The existing browser guest save reopened with its previous spendable Compute and stored production intact, and the new Jobs/Equipment/Milestones interface rendered on the hosted page. Hosted mouse-wheel zoom out/in and save reopening also passed after the final update. Browser console inspection returned no errors during that smoke check. This is a private playable release, not public multiplayer acceptance.

## Implemented

| Area | Current behavior |
| --- | --- |
| Jobs and progression | Twelve renewable job templates across service, supply and workload families. Players can accept two jobs of different kinds. Diagnosis, dispatch and capacity-reserving workloads require explicit actions. Three equipment styles, mastery stamps, center accents and a trophy provide progression. The Operator license also requires a commissioned cluster. |
| Guidance and onboarding | Locker customization, four illustrated introductory slides, Margo guidance, the free first machine and a Jobs menu. Directions walk to or open the relevant activity; they do not buy, craft, collect or claim on the player's behalf. |
| Personal centers | One saved center per account. Existing saves, production tick phase, inventory and uncollected output are retained. Visitors see a sanitized center and cannot spend or build for its owner. Leaving owners return visitors to the plaza. |
| Neighborhoods | Five-slot D1 admission with progression-band preference, entrance portals, membership leases, controller generations, movement sequence checks and authoritative worksite/home checks. The client queues commands, handles corrections, offers explicit tab takeover and recovers expired membership. |
| Shared work | Persistent cluster projects freeze their requirements when started, consume completed-job contributions and crafted parts, and award contribution-based rewards. Outstanding claims survive travel. Shared outage repairs retain controller/proximity checks and durable bonus claims. |
| Social | Neighborhood chat, quick pings, invite/join flow, recent neighbors, mute/block controls, name validation and persisted message reports. Blocking also restricts relevant visits, offers and social visibility. This is not a full friends/party system. The restricted `/moderation` queue supports reviewed removal/dismissal with retained notes and reviewer IDs; reviewer staffing and a real allowlist remain unconfigured. |
| Item market | Player listings, search/filtering, pagination, progression qualification and optional offers to a neighbor. Inventory is escrowed; cancellation returns it. Purchases debit Compute and transfer existing items through server transactions. Finished equipment comes from crafting or players, not an unlimited NPC equipment seller. |
| Wallets and saves | Wallet-first entry with a separate guest option. EVM injected/EIP-6963 and Solana Wallet Standard message signing use server-verified challenges and separate account keys. Guest saves remain on that browser/origin and are not imported into wallet accounts. |
| GPU District | Distinct scenery plus client-launch, stable-service and efficient-supply projects. Each advanced project requires completed work using its specified module; equipping a module alone does not qualify. The Operator license and EVM holder adapter guard admission, reads, writes and access-loss recovery. |
| Runtime controls | Configurable admission cap and separate pauses for new arrivals, new player trades and new cluster projects. Existing cancellation and earned-reward paths remain available within their normal authorization rules. See the [operations notes](neighborhoods-operations.md). |

Holder verification checks the configured EVM chain, exact token contract, decimals, confirmed block and balance threshold. It caches results for 60 seconds, grants only bounded grace after a prior eligible result, and rechecks authorization at writes so concurrent revocation wins. No actual token policy is configured. Solana holder verification is explicitly unsupported by this EVM adapter; a Solana account cannot borrow an EVM account's entitlement. Free gameplay remains separate from holder access.

The $NOOBIUS Exchange remains a preview. There is no live quote, payout request, settlement service, token transfer, funded reward program or Long.xyz/NBIS integration. WalletConnect QR transport, embedded email wallets and EVM contract-wallet authentication are absent.

## Validation recorded for the merged checkout

| Check | Evidence and scope |
| --- | --- |
| Unit and SQLite rules | All 131 tests passed in the default suite, covering gameplay, providers, saves, neighborhoods, projects, social/market rules, holder authorization, race/replay protections and migration reconciliation. |
| Migration reconciliation | Five of those tests exercise canonical fresh installation and preservation of deployed records, identities, saves and existing escrow. New GPU rules also test old-project completion, frozen equipment proof, report reuse prevention and concurrent claim/revocation failures. |
| TypeScript and production build | Both passed after reconciliation. This proves the source can compile and package, not that the hosted rollout succeeded. |
| Local HTTP integration | The new moderation HTTP acceptance test passed against an isolated Worker with an explicit fixture reviewer. The earlier three wallet API tests, one campus API test and one multiplayer API test passed. These use generated-key accounts and local Worker/D1 requests; they do not prove extension dialogs or real-device behavior. |
| Fresh browser journey | The rebuilt production preview demonstrated first play, locker, four slides, Margo, free build, Jobs menu and icons, manual actions and return after reload. The missing Solana-extension fallback was actionable. At a 390×844 viewport the job board fit without horizontal overflow; this is responsive-layout evidence, not a physical mobile-device test. No real wallet extension was available for acceptance; GPU District manual browser acceptance remains open. |
| Local load experiment | Before the wallet merge: 50 synthetic clients in ten neighborhoods, 2,000 sync requests over 60 seconds; p50 187 ms, p95 224 ms, p99 240 ms, maximum 252 ms, zero errors. This was local Miniflare, not hosted D1 or public capacity evidence. |

The transport is HTTP polling at a nominal 1.5-second interval, with hidden-tab suspension and bounded retry backoff. It is not WebSocket multiplayer. Five players per neighborhood and the default total admission cap are implemented limits, not measured guarantees about a public deployment.

The targeted Vite/ws/Undici patch reduced the audit from 13 to 10 affected packages (4 moderate, 6 high). Remaining parser and tooling updates require further remediation; see [the dependency review](dependency-review-2026-09-09.md). New moderation files pass scoped lint; repository-wide lint still has a backlog.

## Migration lineage

The canonical deployable history is `0000`–`0004_odd_blackheart`, followed by `0005_tired_jocasta` and the additive report-review migration `0006_handy_polaris`. The published wallet migration is retained, and the neighborhood schema is appended without adding `players.public_id` twice. Experimental neighborhood migrations are archived under [`migration-history/pre-reconciliation-4385554`](migration-history/pre-reconciliation-4385554) and must not be run against the hosted database.

Migration tests exercise local SQL and record preservation. They do not prove hosted migration bookkeeping, a backup, a restore or rollback compatibility. Existing experimental local databases need a deliberate reconciliation or a new isolated test database; applying the canonical files blindly is not a migration plan.

Before deployment, a bounded live database read confirmed `players.public_id` and returned zero player rows with no further page. After deployment, the live overview listed the expected neighborhood/project/social tables. Local preservation tests and this deployed schema check do not establish a hosted backup or restoration.

## Remaining work

1. Private publishing and basic hosted smoke checks are complete. Continue with real-wallet and independent-player acceptance below.
2. Accept actual EVM and Solana extensions, mobile devices, account changes, reload, reconnect and separate saves on HTTPS. Exercise visits and shared work with independent browsers and people.
3. Measure hosted request rate, latency, D1 use and cost; test reconnect/login bursts and longer sessions. Re-run meaningful load checks after integration. Set admission limits from that evidence.
4. Establish monitoring, alert ownership, dependency patching, report review/support and a rehearsed hosted backup/restore and compatible rollback path before public access.
5. Configure real holder verification only after the exact asset policy is confirmed, then accept the GPU project journey in actual browsers. Solana token verification requires a separate implementation.
6. Run longer human first-session and return-session playtests. Clarity, enjoyable cooperation and reasons to return are not established by passing tests or adding more rooms.

These are concrete alpha features and local checks. They do not establish console/AAA quality, proven retention, public capacity or a production-ready token economy.

## GPU equipment follow-up, included in version 30

New GPU projects ask for Fast workloads, Stable service jobs or Efficient supply jobs, alongside the other shared components. Jobs issue a record of the equipment actually used only on successful claim. Generic and specialized reports share the same budget, so one completed job cannot fund two projects. Commons consumes older/general reports first and previews any specialized report it will use. Existing open First light/Launch night/Quiet hours projects retain their original terms. These changes add no token reward multiplier or new migration.

The project board explains the required setup before starting and links to the matching job family and Equipment tab. Selecting a setup does not start work or spend materials. Existing equipped matching equipment may be preselected in the job draft; the player still confirms the job start.

## Report-review follow-up

The checkout now includes an explicitly authorized report queue with server-side wallet checks, saved review evidence, bounded pages and atomic dismiss/remove decisions. The console clears cached reports on tab hiding and revalidates on focus; requests time out after 20 seconds. Unit/SQLite tests and real local HTTP tests passed; the unauthenticated browser view displayed the correct access restriction. A real moderator wallet and full authenticated browser acceptance remain unconfigured. Before the additive migration, live bounded reads confirmed both `players` and `player_reports` are empty with no further page. This is a narrow preflight, not a hosted backup/restore rehearsal. See [moderation operations](moderation.md).
