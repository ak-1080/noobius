# Cloudflare launch operations

## Public checks

`npm run health:public` performs read-only probes of the game entry page, root coming-soon page, database health, anonymous Compute exchange privacy, and configured room router. It creates no accounts and needs no credentials. The GitHub `Public service health` workflow runs this every 15 minutes, offset from the top of the hour, and can be dispatched manually. GitHub scheduling can be delayed; this is an initial monitor, not a guaranteed paging service. Failure notifications depend on the repository owner's Actions notification preferences. A named incident owner and verified notification delivery remain required.

An intentional room-router 404 is expected at `/`; this proves the configured router responds, not that a multiplayer session can join. `npm run smoke:cloudflare` separately exercises real signed login, save/relogin, room membership, movement and privacy. Neither check proves a browser wallet extension, gameplay graphics on a phone, chain settlement, or every gameplay interaction.

## Capacity probe

`npm run smoke:capacity` is an explicit, bounded production probe. It creates fifty ordinary, unfunded Solana accounts through public sign-in, respects normal authentication throttles, distributes them across ten five-player neighborhoods and splits each neighborhood between two home visitors and three plaza players. It uses the production `RoomClient`, sends movement and reads profiles. It releases connections and logs out in cleanup. Generated zero-value profiles remain; no existing player's profile, token balance or SQL is edited.

Only run during a quiet launch/maintenance window: the probe occupies the configured 50-player admission cap while measuring. Do not run it automatically every 15 minutes. Results go to `/tmp/noobius-hosted-capacity-results.json`; a failed run must not be called a capacity pass. It is a single-origin synthetic connection test, not a global network or rendered-device benchmark. Keep the 50-player cap until longer mixed-workload tests justify an increase.

## Billing and limits

Verified September 22, 2026: account and game Worker settings report `standard` usage model. This does **not** prove the account's subscription tier. Subscription read access was unavailable, and the browser dashboard required sign-in. No plan upgrade or billing change has been made.

For sustained public multiplayer, confirm **Workers Paid**, which starts at $5/month plus metered usage. This is separate from the domain's Free/Pro website plan. The minimum charge is not a complete game-hosting budget. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

The D1 free tier includes 100,000 written rows per day; exceeding its allowance can interrupt the game. The current room coordinator renews authority and writes checkpoints roughly every five seconds per connected player, plus request nonces and cleanup. Even fifty continuously connected players would generate 864,000 upkeep cycles/day before counting multiple rows and indexes per cycle. Therefore the free write allowance is unsuitable for sustained capacity at that level. The paid allocation includes 50 million written rows/month, then $1/million; index writes also contribute. These are billing rules and code-based workload estimates, not an invoice forecast. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

Durable Objects add active room duration, incoming messages and SQLite storage operations. Incoming WebSocket messages are billed at a 20:1 request ratio; outgoing messages have no request charge. Regular room alarms and checkpoint writes also matter, so do not estimate cost from the number of HTTP page views alone. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Before increasing the player cap, record actual D1 rows read/written, Worker CPU/request usage, Durable Object duration/messages/storage, and daily active player-hours. Review idle-room checkpoint costs and retained operational data. Set an owner-approved spending threshold and alert destination. Solana RPC service costs and wallet transaction fees are separate.

## Incident actions

- Game/database probe fails: inspect the game Worker errors and D1 availability/migration status. Do not redeploy blindly or restore over live payment records.
- Room probe or joins fail: inspect room authentication/configuration, Durable Object logs, service-binding failures, admission limits and recovery backlog. Existing authority fences must remain enforced.
- Payment ambiguity: retain the original reservation and signature. Do not issue a replacement transfer or release Compute just because a browser timed out.
- Unexpected load or cost: use existing admission/trading pause controls, inspect current metrics, and change quotas only with evidence. Do not disable authentication or economic checks to improve benchmark results.
- Source rollback does not reverse D1 writes or Solana transfers. Restore drills must use the separate staging database and reconcile any settled chain payments before recovery.
