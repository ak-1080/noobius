# Cloudflare launch operations

## Public checks

`npm run health:public` performs read-only probes of the game entry page, root coming-soon page, database health, anonymous Compute exchange privacy, and configured room router. It creates no accounts and needs no credentials. The GitHub `Public service health` workflow runs this every 15 minutes, offset from the top of the hour, and can be dispatched manually. GitHub scheduling can be delayed; this is an initial monitor, not a guaranteed paging service. Failure notifications depend on the repository owner's Actions notification preferences. A named incident owner and verified notification delivery remain required.

An intentional room-router 404 is expected at `/`; this proves the configured router responds, not that a multiplayer session can join. `npm run smoke:cloudflare` separately exercises real signed login, save/relogin, room membership, movement and privacy. Neither check proves a browser wallet extension, gameplay graphics on a phone, chain settlement, or every gameplay interaction.

## Capacity probe

`npm run smoke:capacity` is an explicit, bounded production probe. It creates fifty ordinary, unfunded Solana accounts through public sign-in, respects normal authentication throttles, distributes them across ten five-player neighborhoods and splits each neighborhood between two home visitors and three plaza players. It uses the production `RoomClient`, sends movement and reads profiles. It releases connections and logs out in cleanup. Generated zero-value profiles remain; no existing player's profile, token balance or SQL is edited.

Only run during a quiet launch/maintenance window: the probe occupies the configured 50-player admission cap while measuring. Do not run it automatically every 15 minutes. Results go to `/tmp/noobius-hosted-capacity-results.json`; a failed run must not be called a capacity pass. It is a single-origin synthetic connection test, not a global network or rendered-device benchmark. Keep the 50-player cap until longer mixed-workload tests justify an increase.

## Movement verification and evidence limits

Initial hosted movement probes found two independent problems: packet bunching triggered the 100 ms arrival limit, and full-speed walking lost earned travel time when network delay changed between packets. The client now paces after acknowledgments. The room authority keeps at most 250 ms of earned, unspent travel time between valid updates, charges actual walkable distance, and discards that remainder on invalid moves, freezes or rebases. There is still a one-second maximum hop budget and no client clock input. Unit tests cover aggregate distance, reversals, packet floods, credit caps, invalid jumps and reset/freeze behavior.

The capacity harness defaults to full-speed walking (`NOOBIUS_LOAD_WALK=small-steps` retains the original diagnostic). It walks at the renderer's 4.2 units/second between clear floor positions, updating at 16 ms intervals. Both modes require at least 99% accepted movement, per-client sustained updates, bounded peer recovery, acknowledged or explicitly interrupted packets, and saved final positions. Planned five-minute renewal is expected; the harness waits for recovery before final save attempts instead of requiring all sockets to be ready at an arbitrary instant.

Earlier 50-player runs completed their movement phase with zero corrections after client pacing, but failed overly strict end-of-run readiness/release checks during scheduled renewal. Those reports are failures, not complete capacity passes. A separate five-player full-speed run then exposed the travel-time issue (286 corrections in 1,141 packets), which prompted the server fix. The revised authority passed a five-player full-speed run on September 22 at 22:47 UTC: 1,163/1,163 movement updates accepted, no interruptions or corrections, all five final positions persisted, and p95 movement acknowledgment 100.7 ms. The subsequent 50-player full-speed test passed; see the result below.

## Hosted capacity result — September 22, 2026

[Committed result](verification/2026-09-22-cloudflare-capacity.json), source runtime `c7caeee`, game Worker `bf51cc74-e372-49b2-8b7e-ba8da338a2c0`, room Worker `94411a2a-53ac-4c7d-8bbf-c2d5f05b1fa0`:

- 50 real hosted RoomClients across ten neighborhoods, split between private homes and shared plazas; 234.8-second admission ramp and 94.5-second measurement.
- 26,145 of 26,190 movement attempts accepted (99.83%); 30 corrected and 15 interrupted packets accounted for during planned renewal. Corrections are not hidden or counted as successes.
- Movement acknowledgment p50 36.7 ms, p95 101.3 ms and p99 173.9 ms. HTTP p95 663.3 ms for the measured request mix.
- 16 scheduled grant renewals, zero unexpected interruptions, no detected foreign/private peer-data exposure, all 50 final accepted positions persisted, and no cleanup failures.
- The unchanged 50-player cap is supported by this **short single-network movement/profile-read probe**, not an all-day capacity, global latency, rendered-device performance or concurrent economic-workload guarantee. Longer jobs/trades/reconnect bursts and human/device acceptance remain required before widening launch access or capacity.

## Billing and limits

At 23:15 UTC on September 22, the live game Worker reported `D1_ERROR: Your account has exceeded D1's free tier daily row read limit`. That is direct evidence that the current D1 free allowance was exhausted; database-backed health and marketplace reads intermittently failed. Static pages could still load, and a `SELECT 1` probe could succeed because it reads no table rows. A five-surface public probe passed at 23:37 UTC, but one passing read does not establish sustained recovery. No plan upgrade or billing change has been made. A read of the account's subscription and a later D1 database-info request returned permission errors, so this project does not yet have authoritative billing totals or row-usage metrics.

For sustained public multiplayer, confirm **Workers Paid**, which starts at $5/month plus metered usage. This is separate from the domain's Free/Pro website plan. The minimum charge is not a complete game-hosting budget. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

The D1 free tier includes 5 million rows read and 100,000 rows written per day; the actual observed interruption was the **read** limit. Cloudflare says the daily free quota resets at midnight UTC. The current room coordinator also renews authority and writes checkpoints roughly every five seconds per connected player, plus request nonces and cleanup. Fifty continuously connected players could generate up to 864,000 upkeep cycles/day before counting multiple rows and indexes per cycle. This is a code-based upper-load illustration, not measured D1 writes or an invoice forecast. The paid allocation includes 25 billion rows read and 50 million rows written per month, with usage charges beyond those allowances. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

Durable Objects add active room duration, incoming messages and SQLite storage operations. Incoming WebSocket messages are billed at a 20:1 request ratio; outgoing messages have no request charge. Regular room alarms and checkpoint writes also matter, so do not estimate cost from the number of HTTP page views alone. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Before increasing the player cap, record actual D1 rows read/written, Worker CPU/request usage, Durable Object duration/messages/storage, and daily active player-hours. Review idle-room checkpoint costs and retained operational data. Set an owner-approved spending threshold and alert destination. Solana RPC service costs and wallet transaction fees are separate.

## Database recovery

On September 22, the production `wrangler d1 time-travel info DB --config deploy/cloudflare/game.json --json` request returned a recovery bookmark. This verifies that the recovery interface is available, not that a production restore has been performed or that a particular retention window is confirmed. The earlier full SQL export was restored into the separate staging database; see the launch record for its schema revision. The current 13-migration export was also restored independently into local SQLite with a successful integrity check, zero foreign-key violations, 26 tables and 308 profiles; Compute-market tables were present and empty. The export is ignored by Git and restricted to the local user. Never restore the live database as a monitoring test.

## Incident actions

- Game/database probe fails: inspect the game Worker errors and D1 availability/migration status. Do not redeploy blindly or restore over live payment records.
- Room probe or joins fail: inspect room authentication/configuration, Durable Object logs, service-binding failures, admission limits and recovery backlog. Existing authority fences must remain enforced.
- Payment ambiguity: retain the original reservation and signature. Do not issue a replacement transfer or release Compute just because a browser timed out.
- Unexpected load or cost: use existing admission/trading pause controls, inspect current metrics, and change quotas only with evidence. Do not disable authentication or economic checks to improve benchmark results.
- Source rollback does not reverse D1 writes or Solana transfers. Restore drills must use the separate staging database and reconcile any settled chain payments before recovery.
