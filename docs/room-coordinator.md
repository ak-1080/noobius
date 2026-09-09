# Neighborhood room coordinator

September 9, 2026. The source now includes a standalone authoritative room Worker, a browser transport adapter, durable movement checkpoints and physical-action fencing. They are exercised together against isolated local Worker/D1 servers. **The hosted game still uses HTTP polling:** the room flag is off, and an owned coordinator host plus supported access to the private economy service remain unconfigured. Local success is not deployed multiplayer acceptance.

## Player behavior

A player keeps their existing five-person neighborhood and personal center. The browser completes admission and the initial home entry before opening a socket. Other players see validated movement in the same scene. The public roster remains small; entering a center still reserves a neighborhood slot.

When enabled, the browser sends movement roughly every 160 ms. A server correction stops an invalid move. Background saves renew a short connection lease without snapping the character back to an older position. Jobs, shared outages, the project and neighbor roster refresh separately through a controller-checked metadata endpoint; live peer positions overlay that metadata.

Physical work pauses movement, saves the actual position, and binds that save to the complete intended action. It then submits the ordinary economy request and releases the pause. The room server never awards Compute or changes inventory itself. Existing request IDs remain unchanged after uncertain outcomes, so retrying a craft or claim cannot charge or reward twice.

Connection loss pauses walking and new physical work. Reconnect reads the saved position and requests a fresh ticket. It does not send competing HTTP movement while a socket writer is active. A server switch back to polling waits for the old writer to release or expire. Claims, cancellations, and other nonphysical management actions retain their ordinary HTTP paths.

Scene changes and facility travel serialize release, the change, and reconnect. Old socket events are ignored after wallet/scene replacement. If a visited owner leaves or blocks the visitor, metadata recovery returns that visitor to Commons while retaining their slot. The player is never left reconnecting to an inaccessible interior indefinitely.

Planned five-minute grant renewal starts fifteen seconds early. It lets a live work barrier finish, stops new movement, persists the final accepted position, releases the old grant and then tells the browser to reconnect. This planned renewal skips ordinary failure backoff and preserves the visited scene and controller generation. Leaving play discards late HTTP continuations; switching wallets gives the new wallet an independent queue instead of waiting for the old request's timeout.

## Authority and persistence

- One Durable Object per neighborhood; at most five admitted actors, including interiors. Pending sockets are bounded and must authenticate promptly. Admission consumption and actor installation share a queue, preventing a delayed older connection from displacing its replacement.
- D1 owns membership, the exact wallet login, inventory and all economic settlement. Single-use tickets and five-minute grants are described in [room authentication](room-authentication.md). Every authority refresh rechecks the controller, exact login, host permission, realm eligibility and expiry.
- Movement uses its own input sequence, separate from the durable checkpoint sequence. Legal floor, obstacles, unlocked rooms, elapsed movement time, speed and input rate are checked server-side. Empty-time packet floods earn no travel distance; idle allowance is capped.
- A checkpoint uses a UUID and immutable payload. The coordinator persists its outbox entry before contacting the economy service. D1 atomically compares the saved sequence, updates position, inserts one receipt and renews the writer lease. Repeating that exact UUID returns the same receipt; changing its payload fails.
- The ten-second writer cannot be renewed after it expires. SQL checks database wall time at commit, not only a timestamp captured before an asynchronous request. Acquiring a writer advances the saved sequence, fencing an older HTTP movement even if the writer is released before that HTTP request commits.
- A physical-action checkpoint freezes movement for up to three seconds and stores a SHA-256 hash of the finalized HTTP payload. It binds the endpoint, account, controller, request ID and action fields. The corresponding economic update must match the current freeze and worksite. Completion clears only that checkpoint's barrier.
- Pending receipts are reconciled before reconstructing actors after coordinator hibernation/restart. Socket attachments retain only the minimum server-side identity. A closing socket with an uncertain write leaves the outbox intact; a successful late save releases that socket's writer. A new connection ID fences queued frames from the old connection.
- Restart restores live sockets concurrently, resolving each socket's own pending checkpoint before reading its position. Orphan recovery runs outside constructor initialization, scans at most 32 entries and processes at most two concurrently. A durable cursor and backoff keep retries fair. A saved checkpoint retains a durable release obligation until release succeeds or the authority is terminal. At 64 pending entries, new admission waits; existing actors may still finish their own writes.
- Alarm ticks dispatch maintenance independently of slow network queues. Each socket has at most one queued maintenance job, and only one bounded orphan pass runs at a time. A slow orphan or busy player cannot hold the next tick for the rest of the room. Platform behavior is documented in [Durable Object state](https://developers.cloudflare.com/durable-objects/api/state/) and [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/); pending I/O keeps an object active, so this implementation makes no hibernation-cost claim.

The service key, opaque grant, wallet session cookie, private inventory and balances never enter a public socket message. The browser receives only a short-lived join ticket, its own membership and public player appearance/position. The shared hash module contains no server configuration. Signed service requests never follow redirects.

## Local verification

The default test suite includes motion, checkpoint, browser-protocol, coordinator race and migration regressions. The coordinator race tests execute the actual Worker class with mocked platform I/O; motion rules and D1 commits are tested separately against their real implementations.

`tests/room-coordinator-api.test.mjs` runs against an actual economy Worker on `http://127.0.0.1:3003` and the standalone coordinator on `http://127.0.0.1:3004`. It uses generated wallet accounts and only the isolated `.wrangler/qa-dispatch` database. It verifies five actual sockets, sixth-player rejection, peer movement, invalid movement correction, exclusive HTTP/WS writers, private interiors, real physical-work proof, idle renewal, the browser adapter, repeat craft idempotency and clean release. It does not launch five rendered browsers or use real wallet extensions.

Apply canonical migrations 0000–0010 to that isolated database before starting QA. Generate a temporary random 32-byte service key in ignored configuration, with matching audience/coordinator origins on both servers. A temporary Vite config points D1 persistence to `.wrangler/qa-dispatch` and enables room auth. A temporary Wrangler config points to `services/room-coordinator/worker.ts`, declares the `ROOMS` binding/migration, uses the same auth JSON, and sets `LOCAL_ROOM_DEVELOPMENT=true`. Its state lives in `.wrangler/qa-rooms`. Never place these secrets in Git or use the normal player database for fixtures.

Run `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 npm run test:room-coordinator-api` and `npm run test:room-auth-api` with that same environment variable. Stop QA servers and remove the temporary configurations/keys before building the production archive. Fixture SQL uses a short-lived SQLite connection to the isolated file; launching a second Miniflare D1 process against the live QA persistence directory caused local `SQLITE_BUSY` failures and was removed from the test harness.

The optional full-length renewal check is `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 NOOBIUS_TEST_LONG_ROOMS=1 node --test --test-name-pattern='full grant renewal' tests/room-coordinator-api.test.mjs`. It uses two actual RoomClient instances over real WebSockets, waits approximately five minutes, and checks a visitor's scene/generation/final position plus craft idempotency across renewal. It does not render two browser windows. Hook lifecycle regressions use in-memory React hooks and deferred requests; actual React/browser lifecycle acceptance remains a separate check.

## Hosting and rollout

`services/room-coordinator/wrangler.jsonc` is a separate, disabled-by-default Worker configuration. It is not a Sites manifest change and does not provision a hosted namespace by existing on disk. Cloudflare documents the [WebSocket hibernation lifecycle](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) and [Durable Object state](https://developers.cloudflare.com/durable-objects/api/state/).

Before enabling either runtime:

1. Connect the owner-controlled hosting account, choose its deployment environment and budget, and provision the room Worker/namespace.
2. Establish a supported authenticated machine path from that Worker to the owner-private economy service. Application HMAC cannot bypass Sites' outer access boundary. Do not send browser cookies, reuse Sites dispatch bypass credentials, or change the audience to work around this requirement.
3. Set the same private authentication configuration on both servers. Verify the exact HTTPS game/coordinator origins, key rotation, denied wrong origins and denied unsigned requests.
4. Apply migration 0010 before enabling writers. Publish the matching browser/economy/coordinator versions, then test five rendered browser sessions, reconnects, a coordinator restart, trade and shared work on staging.
5. Measure ten neighborhoods/50 clients, message/DB costs, disconnect frequency and input latency. Complete actual wallet/mobile checks, monitoring, moderation ownership, backup/restore and rollout controls before public admission.

Do not roll the economy service back to code without writer fences while an external writer is active. Disable socket admission, stop/release coordinators, wait for writer expiry and confirm no active grants before any such rollback. Keep the additive tables and all player data. Restart the compatible polling code only after this transition.

No exact holder-token policy or real Compute-to-$NOOBIUS/NBIS payout is activated by this increment. Human usability and repeat-session retention remain separate acceptance gates.

## Private checkpoint release

Version 42 published successfully on September 9, 2026 at 10:30:12 UTC from `c5cef8608008d08bead65c138cb5254ce472282b`. Deployment `appgdep_6aa1352536b8819190e6ab10f5288a8c` kept owner-private access and environment revision zero. The archive contains 165 files, 33,464,320 bytes, hash `sha256:2e9bdb2355d48705b7c1e18c83bb8e3d62e62d771ab357a38ef0abf723ca3d6e`.

All 264 default tests, TypeScript, scoped lint for the new protocol/coordinator/tests, and the production build passed. The two real coordinator API scenarios and the exact-login/authentication API scenario passed locally. Broader touched-file lint still reports the established React/compiler/server backlog; this release does not claim repository-wide lint is clean. No temporary QA configuration or service key was included in the source or production archive; scanning the client output found no room secret configuration or service signing code.

Migration 0010 was applied to the isolated QA and normal local databases, then by private publishing. Hosted preflight showed zero players, projects, listings and grants with no further pages. Post-publish inspection confirmed `room_checkpoints` and the three new writer/freeze fields on `room_grants`; grants remain empty. These inspections and a local backup do not constitute a hosted backup/restore rehearsal.

The existing hosted guest game reopened with 880,287 spendable and 408,240 stored Compute. Neither balance was collected or spent, and the browser reported no error-level logs. Local guest preview also reopened successfully. The standalone coordinator has not been deployed; socket activation, five rendered browser sessions, full five-minute grant rollover, real wallet/mobile coverage, hosted restart/recovery and load/cost acceptance remain open.

## Renewal and recovery follow-up

The next stability pass corrected stale hook continuations after leaving play, queues retained across wallet switches, planned-renewal backoff, lost final movement during renewal, unbounded constructor/orphan recovery and delayed browser lease updates. Slow-network regression checks now require the refreshed lease to reach the browser before waiting for the following movement checkpoint. Uncertain checkpoint and release obligations remain durable. No economic rules or database schema changed.

The final default suite passes 286 tests. TypeScript and scoped protocol/coordinator/test lint pass; the hook's six existing React/compiler diagnostics remain. The real full-grant test passed in 285.9 seconds with two RoomClient instances: the visitor kept the host's interior, generation and last accepted position, both connections renewed once, and the existing craft remained idempotent. The final short API rerun covers the last lease-notification refinement separately. These are real Worker/WebSocket tests with generated accounts, not rendered multi-browser or human playtests.

An initial cold local API run returned an internal Miniflare/D1 error during login. Subsequent focused and full short API runs passed without adding production retry behavior; the original failure log is retained at `/tmp/noobius-room-recovery-api.txt`. This is not evidence that cold-start reliability or hosted operation has been certified. Detailed successful logs are `/tmp/noobius-room-long-renewal.txt`, `/tmp/noobius-room-recovery-final-tests.txt` and `/tmp/noobius-room-recovery-final-api.txt`.

Local guest progress reopened at 20,267 spendable and 206,640 stored Compute without collecting or spending. The hosted transport remains disabled pending owner-controlled hosting and supported private machine ingress. Hosted restart, load/cost, real wallet/mobile and human return-session acceptance are still required.

Private version **43** deployed successfully on September 9, 2026 at 10:52:43 UTC from `6037cbca686cc2d3a374a66b31166040e82f7ff8`; deployment `appgdep_6aa13a6de8248191812f59ab85fd1fc2`, environment revision zero. The validated production archive contains 165 files and 33,474,560 bytes, hash `sha256:67ab5f58067e4526769501a33ec092a875bc1591c94966c1dbd7ef3cd3971828`. Temporary QA configuration and its service key were removed before the successful build; the client bundle excludes room service configuration. The hosted guest save reopened with 880,287 spendable and 408,240 stored Compute, with neither collected nor spent and no browser error-level logs. GitHub main and the implementation branch contain the implementation. This is a private stability release, not activation of the hosted coordinator.
