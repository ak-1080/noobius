# Owner-account Cloudflare launch

## Scope and destinations

The requested destination is the user's Cloudflare account, not Sites managed hosting. The source remains `ak-1080/noobius`. The existing `noobius.io` coming-soon Worker is unchanged. The complete game is deployed separately at **https://play.noobius.io**; WebSocket rooms are at **https://rooms.noobius.io**. Solana is the token ecosystem. No mainnet token address, token payment or cash-out is enabled.

Resources created in account `818bac5a5a12b327928ded9344c453bb`:

| Resource                 | Identity                               | Role                                                        |
| ------------------------ | -------------------------------------- | ----------------------------------------------------------- |
| Game Worker              | `noobius-game`                         | Browser assets, authenticated game APIs, saves              |
| Payment recovery Worker  | `noobius-payment-recovery`             | Scheduled reconciliation; no public endpoint                |
| Room Worker              | `noobius-rooms`                        | Five-player Durable Object rooms                            |
| Production D1            | `b9466163-a44d-446d-8616-ca5003f5d24f` | `noobius-game-production`                                   |
| Restore/staging D1       | `c996298e-b0ee-4edb-9684-33e44c22d5d8` | `noobius-game-staging`                                      |
| Internal service binding | `noobius-rooms.GAME → noobius-game`    | Signed room authority requests without public-network fetch |

The public frontend assets fit Workers Static Assets; a separate R2 bucket is unnecessary for this release. All thirteen canonical SQL migrations were applied to the new production database. This is a fresh online database: localhost/practice and the earlier managed-host saves were not imported or turned into transferable balances.

## Implemented and verified

- Dedicated owner deployment mode in Vite; the existing local/Sites path is preserved.
- New production configurations under `deploy/cloudflare/`. No credentials are tracked.
- Room authentication secrets installed in both Workers, with exact game/room HTTPS origins. The private signing key is not shipped to the browser. Worker service binding is used for backend room calls; HMAC authentication remains enforced.
- Solana signature login, saved profile name, reauthentication and profile identity passed against the real hosted APIs using generated, unfunded test accounts.
- Five real hosted WebSocket clients saw each other's positions. A sixth targeted admission was rejected. Valid movement replicated; a teleport was rejected. Public socket messages omitted tested private economy fields. Unsigned room-service access was rejected.
- The actual browser RoomClient passed a hosted interruption/reconnect check and a full five-minute grant renewal, preserving the player position through both transitions (`scripts/smoke-room-recovery.mjs`).
- Payment ledger and recovery: immutable Compute reservations, competing checkout exclusion, exact buyer signing, durable pre-broadcast authorization, finalized delivery once, and conservative failed/expired transaction recovery. The authenticated endpoints are installed but new token trading is explicitly disabled.
- 415 automated tests, TypeScript checks, production build and 3 tooling checks passed for this release.
- Real browser check: landing video, guest character setup, five-slide tutorial, 3D scene and first-machine tutorial render at the custom game domain. This does not prove a real Phantom/Solflare extension or mobile-wallet flow.
- Solana holder verifier added: network genesis, exact mint/program/decimals, finalized account balances, owned-account aggregation, duplicate account rejection, and write-time entitlement guards. A read against public devnet with a fresh empty address passed. The configured launch mint is still missing, so production holder gates remain closed.
- Production database SQL export restored into separate staging D1. The restore contained the six original generated test profiles, twelve migrations and 26 tables. The ignored local export remains under `.wrangler/production-backups/`; do not commit it. A restore into the live database has not been performed.
- `GET /api/health` checks database access/migration readiness and exposes no player data. The public read-only health workflow now checks five surfaces every 15 minutes; its first GitHub run passed. Notification delivery to an incident owner is not yet verified.
- A repeatable release command validates tests/types, builds the owner bundle, checks its database destination, applies additive migrations, deploys all three services and checks health.
- Solana is the default wallet tab. The game story no longer advertises the superseded Long.xyz destination. The separate coming-soon page has not been edited.

- Compute checkout UI: explicit review, Wallet Standard sign-only approval, interrupted-send retry, pending recovery, receipts, cancellation and paused-market controls. Desktop/mobile-width rendering used a labeled local fixture, which was removed before release; real extension/phone acceptance remains outstanding.

## Reproduction

Run `npm run deploy:cloudflare` with an authenticated Wrangler account or appropriately scoped `CLOUDFLARE_API_TOKEN`. It deploys only the game, rooms and scheduled payment recovery. Existing Cloudflare custom-domain mappings are account-managed and preserved; the command does not modify the root coming-soon site. Both room-auth secrets must already be provisioned before enabling room auth on a new account.

Run `npm run smoke:cloudflare` for generated-Solana-account API/WebSocket tests. It creates ordinary zero-value profiles via public APIs, not fixture SQL. It disconnects/logs out in cleanup but leaves the generated test profiles. The auth rate limit remains in force; the harness waits for its normal window if necessary. `NOOBIUS_TEST_LONG_ROOMS=1 npm run smoke:cloudflare` additionally waits through actual five-minute grant renewal.

Health: `https://play.noobius.io/api/health`.

`node scripts/smoke-room-recovery.mjs` with `NOOBIUS_TEST_ORIGIN=https://play.noobius.io` runs the actual RoomClient interruption/renewal check. It takes roughly six minutes.

## Recovery and controls

- Preserve existing credentials and the ignored production room-auth configuration. Rotate both services together with the existing two-key protocol if needed; never place it in GitHub source or client variables.
- `NOOBIUS_ADMISSION_PAUSED` stops new admission. `NOOBIUS_TRADE_PAUSED` stops new item listings/purchases while preserving cancellation. `NOOBIUS_PROJECTS_PAUSED` stops new projects while allowing existing obligations to finish.
- Do not roll back to code without writer fences while live rooms are running. Stop admission, release rooms and wait for leases to expire first. Application rollback does not roll back SQL or blockchain activity.
- Test restore exports on the separate database first. Database restore and redeployment need explicit reconciliation of any future real-token settlement; a chain transfer cannot be rolled back by SQL recovery.
- Both game and room Workers have Cloudflare observability enabled. Read-only GitHub health monitoring is active; no verified paging destination or staffed incident owner is configured yet.

## Still required for the full requested launch

1. Real wallet-extension and phone checks; rendered multi-browser visits, physical jobs, trades and reconnection. Automated signed requests are not a substitute for these UI checks.
2. Hosted worker restart/load evidence, measured quotas and cost. Interruption and five-minute renewal are verified. Five sockets do not establish 50-player capacity. Current admission cap is 50, not a demonstrated performance figure.
3. Confirm Workers billing/quotas. Account deployment and D1 permissions work; subscription read returned 403, so no billing-plan claim or paid upgrade was made.
4. Wallet transaction adapter and checkout UI are implemented and covered by automated and mock-browser checks. Exercise the reservation/signing/settlement/recovery APIs against actual devnet transfers; the current test payer still needs free devnet SOL. Token APIs and the scheduled recovery service are disabled for new real-token sales until configuration and acceptance checks are complete. Existing item-for-Compute trading remains available.
5. Obtain exact Solana mint, network, decimals, holder threshold, launchpad link, RPC provision and marketplace fee policy. The mainnet mint has been requested; do not guess it or treat placeholder text as an address.
6. Test the new marketplace with a test token, including crashes/retries/expiry and competing purchases, before enabling real payments. The user authorized building/hosting; no user funds, token issuance or mainnet transaction was performed.
7. Finish release-specific operational checks: monitoring delivery, support ownership, abuse controls, wallet/mobile behavior, budget thresholds, clean release metadata and a GitHub deployment credential if CI deployment is wanted. GitHub source access is independent from Cloudflare authentication.

This document is a deployment checkpoint, not a claim that the entire game or real-money economy is production complete.
