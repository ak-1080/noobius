# Neighborhoods operations notes

Updated September 9, 2026. These notes describe the current implementation and the remaining operator work. Version 29 is deployed owner-private; the [implementation checkpoint](neighborhoods-implementation-status.md) records the source and deployment. No hosted recovery drill or public launch is claimed.

## Hosting and identity

Noobius requires its server-backed Sites/Cloudflare Worker deployment and D1 database. Static files alone omit login, authoritative progression, marketplace escrow and shared neighborhoods. Keep the browser and API on the same HTTPS origin.

EVM and Solana login prove wallet ownership with a message. Server challenges expire after five minutes and are single use; app sessions use hashed tokens in D1 and HttpOnly cookies. EVM and Solana accounts have separate saved games, including when both accounts are in one wallet app. Guest progress is local to a browser/origin. Do not copy a guest balance into a wallet account or infer account links from similar names.

WalletConnect QR, embedded email access, contract-wallet authentication and token settlement are not configured integrations. Actual extension/mobile acceptance remains outstanding.

## Capacity and runtime switches

The behavior below comes from `lib/operations.ts`, `lib/neighborhoods-server.ts` and the server's action routing. Values are server-side configuration; `.env.example` is a template, not evidence that hosted variables have been set. Change hosted configuration through the supported hosting workflow and verify the resulting deployment. There is no in-game administrator switchboard.

| Variable | Default | Actual effect |
| --- | --- | --- |
| `NOOBIUS_MAX_PLAYERS` | `50` | Limits active neighborhood admission across rooms. Valid values are integers from 1 to 10,000; invalid configuration falls back to 50. Raising it does not establish capacity. Lowering it does not evict already active players. |
| `NOOBIUS_ADMISSION_PAUSED` | `false` | Exact string `true` pauses new neighborhood arrivals and moves requiring new admission. Existing valid membership can renew; an expired player may have to wait to rejoin. Saves are retained. |
| `NOOBIUS_TRADE_PAUSED` | `false` | Exact string `true` rejects new listings and listing purchases. Existing offers can still be cancelled to recover their escrowed items. This is not a pause of every shop or game action. |
| `NOOBIUS_PROJECTS_PAUSED` | `false` | Exact string `true` stops starting new cluster projects. Existing contributions and earned claims remain available under normal membership and realm rules. |

Each neighborhood has five slots. Membership leases last 45 seconds; visible presence expires after ten seconds. The client normally polls every 1.5 seconds, suspends while hidden and backs off transient failures up to roughly 30 seconds with jitter. Concurrent tabs use controller generations and explicit takeover; never work around a takeover error by dropping controller checks.

The recorded 50-client local experiment is a short synthetic baseline only. It used ten rooms, 2,000 sync requests in 60 seconds, zero errors and p95 224 ms before the final wallet merge. It does not measure public D1 latency, billing, browser rendering, realistic chat/market traffic or a long reconnect soak. The harness uses separate simulated edge IPs on loopback; it does not establish shared-IP login-burst capacity.

## Holder access

Live policy requires all of the actual EVM chain ID, token contract, decimals and HTTPS RPC URL. Threshold defaults to 888 tokens and confirmations to 12. These are application defaults, not a configured asset or launch promise. Keep RPC credentials server-side.

The adapter verifies the exact policy against a confirmed block. Eligible results have a 60-second refresh window; temporary RPC failure can use only the prior result's bounded five-minute grace. Confirmed denial, newer chain evidence and policy changes cannot be bypassed with stale success. Authorization is checked again inside protected writes, and lost access returns the player to Crew Commons without deleting the center or earned claims.

Solana login does not imply Solana holder verification: the current adapter returns unsupported and makes no EVM RPC call for a Solana account. Cached Solana entitlement rows cannot grant production GPU authority. No cross-account linking is performed.

`NOOBIUS_LOCAL_REALM_TEST=true` is a development-only exception requiring a loopback host and no valid live token policy. It is not a production unlock. Test it only in an isolated local environment and do not advertise a locally unlocked GPU District as a verified live entitlement.

## Migration and release sequence

1. Record the exact source commit, current hosted version, target version, deployment audience and existing database migration state.
2. Confirm the canonical history in `drizzle/meta/_journal.json`: `0000`–`0003`, `0004_odd_blackheart`, then `0005_tired_jocasta`. Retain the published wallet migration. Do not deploy the experimental SQL archived in `docs/migration-history/pre-reconciliation-4385554`.
3. Run the default rules suite, migration reconciliation tests, TypeScript, production build and relevant local API suites. Generated-key fixtures and test databases must remain separate from real saves.
4. Verify the actual hosted recovery capability and record a usable recovery point before applying a hosted migration. A local SQLite migration test is not a backup or restore drill.
5. Publish through the hosting workflow, wait for terminal deployment success and record the commit/version/migration mapping. Then check homepage/assets, login cancellation and success, returning saves, neighborhood entry, takeover, visits and existing claims on the deployed HTTPS origin.
6. Only widen access after the chosen wallet/device, operations and moderation gates have evidence. A private preview URL and a public audience are separate release states.

`npm run db:local` installs the canonical SQL into a fresh local database. It is not a general replay-safe command for an already populated or experimental database. Use a separate local state directory/database for migration and load fixtures; preserve any local saves that matter before changing their schema.

Rollback must preserve the account and schema formats now in use. An old EVM-only build is not a valid fallback for saved Solana players; an old campus build also lacks the neighborhood controller and claim rules. Prefer a verified compatible build or a forward correction. Do not restore an older database over current saves without an explicit recovery decision that accounts for lost writes, sessions, escrow and claims. No hosted restore or rollback rehearsal has been completed for this checkpoint.

## Incident handling and observability

- For admission pressure, pause new arrivals or reduce the admission cap; inspect existing room leases and request failures before reopening. These controls preserve saved progress and do not promise uninterrupted entry for expired sessions.
- For a player-market incident, pause new listings/purchases while retaining cancellation. Compare escrow, buyer/seller balances and listing state; never manually issue a refund without reconciling whether a transaction already committed.
- For a project incident, pause new starts while inspecting contribution and claim records. Existing claims are replay-protected; retries are preferable to duplicate manual payouts.
- For an RPC outage, use the implemented limited grace and safe-return behavior. Do not invent an eligible result or increase grace to conceal a persistent verification failure.
- For a failed hosted migration or data-integrity incident, preserve error and version evidence and use a verified recovery path. The three feature pauses are not a universal write freeze.

Before public access, assign an operator and verify dashboards/alerts for 5xx, 429, 409, action latency, active admissions, D1 reads/writes/storage, failed logins and costs. Distinguish expected stale-controller or insufficient-resource responses from outages. Generic server logging exists; dedicated alert delivery, retention policy, incident ownership and cost thresholds are not yet proven. Do not log raw signatures, login challenges, session tokens, seed phrases or RPC credentials.

## Social reports and public-release gates

Players can mute/block peers and report a message from their neighborhood. Reports persist the reported message and reason in `player_reports`; there is no moderator dashboard, notification pipeline or staffed response process. An operator must define who reviews reports, how action is taken, how users contact support and how records are retained. Existing controls are not proof that abuse handling is operational.

Open acceptance items are real wallet extensions, mobile devices, multi-person play/reconnect, longer return-session playtests, hosted load/cost measurements, dependency patch review, operational alerts and a hosted backup/restore rehearsal. Dependency review flagged 13 advisories with reviewed tooling paths and no confirmed request-path reachability; retain the patch follow-up rather than describing the build as vulnerability-free.

Real $NOOBIUS rewards require a separately specified and funded quote/settlement system. The current Exchange only previews an amount and creates no transfer or payout request. Keep release copy consistent with that behavior.
