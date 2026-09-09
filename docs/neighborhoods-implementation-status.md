# Neighborhoods implementation checkpoint

Updated September 9, 2026. Branch: `codex/noobius-neighborhoods`.

The neighborhood game and Ethereum/EVM + Solana wallet entry, with the job-choice and guidance follow-up below, were published as **Site version 32** on September 9, 2026 at 06:41 UTC. Source: `fcdf5714386f2f650ee80284071abc3890e1ee8c`, pushed to GitHub `main` and the Sites source branch without rewriting either history. The Site remains owner-private.

Deployment `appgdep_6aa0ff86552081918a5e191c7e106a6d` succeeded for saved version `appgprj_6a9ef8b4a03c8191a7e106551d030528~appgver_05006b65654081918f70f08d05097f77`. It uses the same database schema and environment revision zero. The previous release's database overview listed all 18 expected game tables; its hosted save reopening, Jobs/Equipment/Milestones rendering, mouse-wheel zoom and console smoke checks passed. This remains a private playable release, not public multiplayer acceptance.

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
| Unit and SQLite rules | All 136 tests passed in the default suite, covering gameplay, guidance/choice comparisons, providers, saves, neighborhoods, projects, social/market rules, holder authorization, race/replay protections and migration reconciliation. |
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
7. Strengthen post-upgrade choices using the actual economy. The choice audit found a fully upgraded center produces 6,804 Compute/minute, dwarfing ordinary job fees. GPU specialist projects now grant limited job choices for matching contributions, giving a conditional benefit demonstrated in executable scenarios. Passive output still dwarfs job fees; this experiment does not establish a balanced economy or long-term retention.

These are concrete alpha features and local checks. They do not establish console/AAA quality, proven retention, public capacity or a production-ready token economy.

## GPU equipment follow-up, included in version 30

New GPU projects ask for Fast workloads, Stable service jobs or Efficient supply jobs, alongside the other shared components. Jobs issue a record of the equipment actually used only on successful claim. Generic and specialized reports share the same budget, so one completed job cannot fund two projects. Commons consumes older/general reports first and previews any specialized report it will use. Existing open First light/Launch night/Quiet hours projects retain their original terms. These changes add no token reward multiplier or new migration.

The project board explains the required setup before starting and links to the matching job family and Equipment tab. Selecting a setup does not start work or spend materials. Existing equipped matching equipment may be preselected in the job draft; the player still confirms the job start.

## Report-review follow-up

The checkout now includes an explicitly authorized report queue with server-side wallet checks, saved review evidence, bounded pages and atomic dismiss/remove decisions. The console clears cached reports on tab hiding and revalidates on focus; requests time out after 20 seconds. Unit/SQLite tests and real local HTTP tests passed; the unauthenticated browser view displayed the correct access restriction. A real moderator wallet and full authenticated browser acceptance remain unconfigured. Before the additive migration, live bounded reads confirmed both `players` and `player_reports` are empty with no further page. This is a narrow preflight, not a hosted backup/restore rehearsal. See [moderation operations](moderation.md).

Version 31 deployment succeeded at 06:14:46 UTC. A live schema read confirmed all three new review fields, with no report records. Hosted environment revision remains zero: no fixture or real moderator allowlist was enabled. Local state was snapshotted before its additive migration; this does not constitute a hosted recovery drill.

## Job-choice and guidance follow-up

This pass repairs a connected set of guidance defects without changing contract prices, timers, saved equipment, report budgets or token settlement:

- All accepted jobs remain visible when a goal filters the offers. A full two-slot board explains which existing jobs need finishing or cancellation.
- Missing-parts directions still work during replenishment. Arrival keeps a readable instruction and live refill countdown on the coach; clicking that coach only dismisses guidance. Gathering, crafting, purchases and claims remain explicit actions.
- Storage guidance opens the correct tab and highlights the requested item. The guide carries display context, never an executable bank transaction.
- Jobs show the client's favored equipment, exact differences from Standard, and the job fee separately from reimbursement for reserved machine output. An unavailable draft cannot silently switch to another machine or module. Unstarted drafts are retained across menus within the session, not promised across reloads.
- Equipment offers missing-parts directions and identifies Compute shortages. Explicit equipment goals clear old project filters; ordinary returns from a worksite retain the player's context.
- After the first gather/craft, the coach recommends unlocked equipment, needed reports or unearned setups from current offers. Shared-cluster suggestions are limited to connected accounts. The board avoids duplicating ordinary offers as extra goal cards.
- The primary mastery grid highlights the 18 combinations that change actual job terms. All 36 collection stamps and existing cosmetic qualifications remain intact; mechanically neutral combinations are described as optional collection entries.

Automated coverage now includes 136 passing default-suite tests. New checks cover storage/waiting directions without commands, refill-to-ready instructions, fee/output comparisons, unavailable selections, adaptive recommendations and preservation of all earned stamps. These are correctness checks, not retention evidence. Earlier moderation/wallet HTTP checks were not rerun for this presentation-only pass. Repository-wide lint and the public acceptance items above remain open.

The local browser check verified a goal only filtered offers (zero jobs accepted until the player clicked Accept); a workload required an explicit machine choice and separated its 65 Compute fee from reserved output; the Backup machine selection survived a trip for parts. Guided arrival left the inventory untouched and kept “You’re here” visible; pressing E then awarded two chips. Storing those chips and following the shortage opened Storage with the Chips row highlighted, still awaiting manual withdrawal. The test job was canceled unstarted afterward. Existing spendable and stored Compute were left unchanged. TypeScript, the final production build and scoped lint for the new choice/coach logic passed.

Version 32 deployed successfully at 06:41:23 UTC. Hosted smoke testing reopened the existing guest game, rendered the 18 distinct setups and retained 36-stamp collection explanation, and confirmed the original 880,287 spendable Compute and 408,240 stored Compute remained unchanged. No console errors were reported in this hosted check. The site is still owner-private; no runtime token or moderator configuration changed.


## Specialist dispatch choices follow-up

Implemented after version 32: each new specialist project snapshots one benefit family. Matching personal contributions grant up to two saved job choices per family on collection. Players can spend an exact choice when accepting an alternative unlocked job; old offers retain their ID/serial, cancellation never refunds the choice, and running work remains unchanged. Generic-only helpers and existing null-policy projects keep normal rewards. Saved choices work outside GPU District; no token, balance threshold, timer or passive-production change is included.

The project board previews matching contributions and storage before collection; a full-storage warning links directly to that family's Jobs menu. The offer menu previews parts, time and payment before the player spends a choice. A durable unique project claim and facility version guard protect grants; exact named tickets protect spending after request-history eviction.

All 147 default tests passed. TypeScript and production build passed. Scoped lint for the new core logic, Jobs panel and new project/API tests passed; broader touched-file lint still reports pre-existing issues in the server, ProjectPanel and older tests. The new local wallet HTTP test passed against an isolated database; no test wallet or fixture route ships. A temporary browser UI fixture confirmed preview → accept → cancel and no console errors. The full human gameplay/wallet/device acceptance remains open. Detailed experiment and validation scope: [specialist job choices](dispatch-choice-experiment.md).

New migration 0007 only adds nullable `cluster_projects.benefit_json`. The local DB was backed up before applying it. Hosted preflight confirmed zero players/projects with no further pages and absence of this column. A populated pre-migration regression test preserves old terms with null benefits. Private publishing and hosted schema confirmation for this follow-up are pending below.
