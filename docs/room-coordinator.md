# Neighborhood room coordinator

September 9, 2026. The source now includes a standalone authoritative room Worker, a browser transport adapter, durable movement checkpoints and physical-action fencing. They are exercised together against isolated local Worker/D1 servers. **The hosted game still uses HTTP polling:** the room flag is off, and an owned coordinator host plus supported access to the private economy service remain unconfigured. Local success is not deployed multiplayer acceptance.

## Player behavior

A player keeps their existing five-person neighborhood and personal center. The browser completes admission and the initial home entry before opening a socket. Other players see validated movement in the same scene. The public roster remains small; entering a center still reserves a neighborhood slot.

When enabled, the browser sends movement roughly every 160 ms. A server correction stops an invalid move. Background saves renew a short connection lease without snapping the character back to an older position. Jobs, shared outages, the project and neighbor roster refresh separately through a controller-checked metadata endpoint; live peer positions overlay that metadata.

Physical work pauses movement, saves the actual position, and binds that save to the complete intended action. It then submits the ordinary economy request and releases the pause. The room server never awards Compute or changes inventory itself. Existing request IDs remain unchanged after uncertain outcomes, so retrying a craft or claim cannot charge or reward twice.

Connection loss pauses walking and new physical work. Reconnect reads the saved position and requests a fresh ticket. It does not send competing HTTP movement while a socket writer is active. A server switch back to polling waits for the old writer to release or expire. Claims, cancellations, and other nonphysical management actions retain their ordinary HTTP paths.

Scene changes and facility travel serialize release, the change, and reconnect. Old socket events are ignored after wallet/scene replacement. If a visited owner leaves or blocks the visitor, metadata recovery returns that visitor to Commons while retaining their slot. The player is never left reconnecting to an inaccessible interior indefinitely.

## Authority and persistence

- One Durable Object per neighborhood; at most five admitted actors, including interiors. Pending sockets are bounded and must authenticate promptly. Admission consumption and actor installation share a queue, preventing a delayed older connection from displacing its replacement.
- D1 owns membership, the exact wallet login, inventory and all economic settlement. Single-use tickets and five-minute grants are described in [room authentication](room-authentication.md). Every authority refresh rechecks the controller, exact login, host permission, realm eligibility and expiry.
- Movement uses its own input sequence, separate from the durable checkpoint sequence. Legal floor, obstacles, unlocked rooms, elapsed movement time, speed and input rate are checked server-side. Empty-time packet floods earn no travel distance; idle allowance is capped.
- A checkpoint uses a UUID and immutable payload. The coordinator persists its outbox entry before contacting the economy service. D1 atomically compares the saved sequence, updates position, inserts one receipt and renews the writer lease. Repeating that exact UUID returns the same receipt; changing its payload fails.
- The ten-second writer cannot be renewed after it expires. SQL checks database wall time at commit, not only a timestamp captured before an asynchronous request. Acquiring a writer advances the saved sequence, fencing an older HTTP movement even if the writer is released before that HTTP request commits.
- A physical-action checkpoint freezes movement for up to three seconds and stores a SHA-256 hash of the finalized HTTP payload. It binds the endpoint, account, controller, request ID and action fields. The corresponding economic update must match the current freeze and worksite. Completion clears only that checkpoint's barrier.
- Pending receipts are reconciled before reconstructing actors after coordinator hibernation/restart. Socket attachments retain only the minimum server-side identity. A closing socket with an uncertain write leaves the outbox intact; a successful late save releases that socket's writer. A new connection ID fences queued frames from the old connection.

The service key, opaque grant, wallet session cookie, private inventory and balances never enter a public socket message. The browser receives only a short-lived join ticket, its own membership and public player appearance/position. The shared hash module contains no server configuration. Signed service requests never follow redirects.

## Local verification

The default test suite includes motion, checkpoint, browser-protocol, coordinator race and migration regressions. The coordinator race tests execute the actual Worker class with mocked platform I/O; motion rules and D1 commits are tested separately against their real implementations.

`tests/room-coordinator-api.test.mjs` runs against an actual economy Worker on `http://127.0.0.1:3003` and the standalone coordinator on `http://127.0.0.1:3004`. It uses generated wallet accounts and only the isolated `.wrangler/qa-dispatch` database. It verifies five actual sockets, sixth-player rejection, peer movement, invalid movement correction, exclusive HTTP/WS writers, private interiors, real physical-work proof, idle renewal, the browser adapter, repeat craft idempotency and clean release. It does not launch five rendered browsers or use real wallet extensions.

Apply canonical migrations 0000–0010 to that isolated database before starting QA. Generate a temporary random 32-byte service key in ignored configuration, with matching audience/coordinator origins on both servers. A temporary Vite config points D1 persistence to `.wrangler/qa-dispatch` and enables room auth. A temporary Wrangler config points to `services/room-coordinator/worker.ts`, declares the `ROOMS` binding/migration, uses the same auth JSON, and sets `LOCAL_ROOM_DEVELOPMENT=true`. Its state lives in `.wrangler/qa-rooms`. Never place these secrets in Git or use the normal player database for fixtures.

Run `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 npm run test:room-coordinator-api` and `npm run test:room-auth-api` with that same environment variable. Stop QA servers and remove the temporary configurations/keys before building the production archive. Fixture SQL uses a short-lived SQLite connection to the isolated file; launching a second Miniflare D1 process against the live QA persistence directory caused local `SQLITE_BUSY` failures and was removed from the test harness.

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
