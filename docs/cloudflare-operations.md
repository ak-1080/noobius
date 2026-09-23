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

## Hosted capacity result — September 23, 2026, Workers Paid

[Committed result](verification/2026-09-23-cloudflare-capacity-paid.json): 50 generated clients in ten neighborhoods, 287.4-second admission ramp and 95.2-second movement/profile-read measurement. Of 25,716 movement attempts, 25,687 were accepted (99.89%); 14 were corrected and 15 packets were accounted for during scheduled renewal. Movement acknowledgment p95 was 129.4 ms, HTTP p95 was 912.7 ms, 17 scheduled renewals occurred, no unexpected interruptions were recorded, and all 50 final positions persisted. All generated sessions left and logged out without cleanup errors. This verifies the same bounded 50-player test on Paid; it does not justify raising the cap or project a thousands-player bill.

## Billing and limits

### Room-query pressure — September 23, 2026

Wrangler D1 insights showed that the previous private-host lookup read an average of 192 rows per call and accounted for about 8.2 million rows over the rolling day. The currently deployed indexed lookup read an average of 7 rows per call across 9,791 calls in the last-hour window; the old form had no calls in that window. These are sampled Cloudflare query-insight windows, not an isolated capacity-test bill. Keep checking as player counts and interior visits grow.

The game Worker now claims a fresh signed service nonce for every room operation but runs expired-nonce/grant/checkpoint cleanup on about one in 64 requests, selected by the signed random nonce. Expired authority remains rejected by the timestamp checks between cleanup passes; the existing nonce uniqueness constraint still rejects replay. This removes three routine expiry scans from most requests. The September 23 deploy passed 419 unit tests, the public health check, the six-login hosted room smoke, and a three-player hosted gameplay smoke with repairs, a contested item trade, reconnect and saved progress. This reduces avoidable D1 work; it does not prove a higher player cap or a lower monthly bill.

The room coordinator previously refreshed authority **and** wrote an unchanged position checkpoint at every five-second upkeep for an idle player. It now still renews the authority and membership lease on schedule, but only writes a background position checkpoint when accepted movement has not yet been saved. An explicit work action still captures its own checkpoint, and departure/renewal still saves the final position. A captured input sequence is tracked separately so movement that arrives during an in-flight save is not mistaken for persisted movement. This room Worker change passed 421 unit tests, a hosted five-player room smoke, the hosted three-player gameplay flow, and the full-length browser-transport interruption/renewal test. Room Worker version `7e7f6fe8-e31a-4b0c-ae65-55aaed65dcef` was deployed. These checks verify behavior, not a measured monthly cost reduction; collect isolated D1/DO usage before widening the 50-player cap.

The longer three-player repeat-play test exposed an occasional `rate-limited` movement ACK that the browser client treated as a hard position correction. The client now waits and retries that specific transient response once; illegal movement still snaps back. The game Worker version `0a27e8ab-477a-46e6-9b3b-b5ca80f01f1a` passed 422 unit tests, typecheck, production build, public health, and a hosted run of five complete repair cycles per player. That run also verified fresh jobs after every claim, duplicate claims paying once, visitor privacy, a contested item trade, socket recovery, signed relogin, and saved balances; cleanup completed. See [hosted evidence](verification/2026-09-23-five-round-hosted-gameplay.json). This is repeatability evidence for the tested service loop, not proof that every endgame path or real-token settlement is finished.

At 23:15 UTC on September 22, the live game Worker reported `D1_ERROR: Your account has exceeded D1's free tier daily row read limit`. Database-backed health and marketplace reads intermittently failed. Static pages could still load, and a `SELECT 1` probe could succeed because it reads no table rows. Cloudflare subsequently showed **Workers Paid as the current plan** on September 23. Wrangler then returned production D1 usage: about 7.92 million rows read and 290,316 rows written over the preceding 24 hours at 00:43 UTC. These rolling totals include earlier tests and other traffic; they are not the cost of the 50-player probe alone. The account dashboard showed $0.00 billable usage so far in the new period, which is not an estimate of future spend.

Workers Paid starts at $5/month plus metered usage. This is separate from the domain's Free/Pro website plan. The minimum charge is not a complete game-hosting budget. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

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
