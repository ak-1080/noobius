# Multiplayer gameplay acceptance

`scripts/smoke-gameplay.mjs` exercises three newly generated, unfunded Solana identities through normal sign-in, game APIs and the browser's actual `RoomClient` WebSocket transport. It does not seed SQL, edit clocks, import balances, touch existing player accounts or perform blockchain transactions.

## What it checks

- Three players join one neighborhood and each enter their own center.
- Each builds the free starter machine, accepts a repair, walks to resources and gathers them through proximity-checked requests.
- Each inspects, diagnoses and tests the machine after the actual server-enforced delays. The harness uses the shared diagnostic model to choose the repair; this is automated functional acceptance, not an uncoached usability test.
- Replaying a completed claim with the same request ID pays once. A new job is offered afterward.
- Set `NOOBIUS_GAMEPLAY_ROUNDS` from 1 to 5 to repeat the ordinary gather/repair/claim route per player before the trade checks. The default is one cycle.
- A visitor can enter another center but receives no private inventory/balance and cannot harvest the host's production.
- Two qualified players race to buy the same one-unit scrap listing for one earned Compute. Exactly one purchase succeeds. Seller payment, buyer debit and item quantities are reconciled from fresh profiles.
- An intentionally dropped socket reconnects. Fresh signed logins retain the three players' identities, earned balances and traded inventories.
- Open test listings are cancelled when possible, neighborhood memberships released, and sessions logged out. Cleanup failures fail the report. Generated profiles and their ordinary earned progress remain.

## Run

Only these exact origins are allowed:

```sh
NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 npm run smoke:gameplay
NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 NOOBIUS_TEST_RESTART_ROOM=1 npm run smoke:gameplay
NOOBIUS_TEST_ORIGIN=https://play.noobius.io npm run smoke:gameplay
NOOBIUS_TEST_ORIGIN=https://play.noobius.io NOOBIUS_GAMEPLAY_ROUNDS=5 npm run smoke:gameplay
```

The local run requires the economy service on port 3003, room coordinator on port 3004, all canonical migrations in an isolated D1 directory, and matching **fresh local-only** room-auth keys/origins. The September 22 run used ignored configuration under `.wrangler/mixed-gameplay-qa/`; never copy production keys into local test configuration. The game runs in Vite development mode so localhost room origins are permitted; the coordinator uses `LOCAL_ROOM_DEVELOPMENT=true`. Do not point these services at the normal player's local database.

For the restart variant, start only the game service on port 3003. Leave port 3004 free: the harness owns a separate local coordinator there and deliberately kills and restarts it after all three players complete the first repair step. It then checks each socket reported interruption, reconnects through fresh room tickets, and verifies the unfinished job, inventory, Compute, and last confirmed worksite position before continuing. The same run then checks the rewards, visit privacy, competing purchase, and fresh login. Restart mode is refused for the hosted origin. The coordinator writes its log to `/tmp/noobius-local-room-restart.log` and uses the ignored QA state directory.

The hosted run first checks database health and does not create accounts if that fails. It still creates three real profiles and a briefly visible ordinary item listing; run only with owner authorization and available quotas. Do not run during D1 quota exhaustion. The item purchase uses in-game Compute, not $NOOBIUS or SOL.

The report is written to `/tmp/noobius-gameplay-acceptance.json`. Console output identifies each completed check. Requests have a 20-second timeout; the harness also has a ten-minute work deadline. Failure is a nonzero exit, including cleanup failures.

## Evidence and limits

The local September 22 run passed using the real Worker/D1/room processes and current production game logic. See the committed report in `verification/2026-09-22-local-gameplay.json`. This extends coverage beyond movement-only testing but does **not** prove the hosted path, physical phones, rendered browser concurrency, real wallet extensions, mainnet settlement, sustained capacity or uncoached retention. Those remain separate launch gates.

The local restart variant also passed on September 22. Its evidence is `verification/2026-09-22-local-room-restart.json`. This checks a complete local coordinator process restart during three ordinary unfinished repairs, not a Cloudflare deployment/restart or a database outage.

The hosted flow passed September 23, immediately after the free D1 daily quota reset. See `verification/2026-09-23-hosted-gameplay.json`. All four gameplay checks and cleanup passed in 67.6 seconds, and the five-surface public health check still passed afterward. This proves the tested online flow at that moment, not sustained quota headroom or a rendered three-browser/real-wallet experience.

The same hosted flow passed again after Workers Paid activation at 00:35 UTC on September 23. See `verification/2026-09-23-hosted-gameplay-paid.json`. All four checks and cleanup passed in 67.6 seconds. This is ordinary Compute item trading, not a live token transfer.

The five-cycle hosted variant passed later on September 23 after the client learned to retry transient room cadence rejections. Three players completed five repairs apiece; new offers appeared after each claim, duplicate claims paid once, and the visitor, contested item trade, reconnect, relogin and cleanup checks all passed. See `verification/2026-09-23-five-round-hosted-gameplay.json`. It is still an automated functional test rather than an uncoached endgame playtest.
