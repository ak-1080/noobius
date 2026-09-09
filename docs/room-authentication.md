# Room authentication foundation

September 9, 2026. This increment prepares the existing economy server to admit an independently hosted room coordinator. The game still uses its existing HTTP movement transport. No WebSocket server, movement checkpoint endpoint or browser transport switch is enabled by this change.

## Protocol

1. An authenticated browser joins a neighborhood through the existing API. `POST /api/noobius/room-ticket` requires the ordinary same-origin wallet session, `expectedWallet`, client ID and controller generation. It returns a random, opaque, 30-second ticket and the configured coordinator origin. D1 stores only its hash, bound to the exact originating session, neighborhood, controller and scene. The browser must send a future ticket in a socket message, never a URL.
2. The coordinator sends `POST /api/noobius-room` with `{operation: "ticket-consume", ticket}`. A signed request consumes the ticket once and replaces any previous wallet grant atomically. The returned random grant lasts at most five minutes and never beyond the originating session. Only public appearance, current membership/position, unlocked navigation areas and authority deadlines accompany it. No wallet session, wallet key, inventory, credits or private facility state is returned.
3. `{operation: "authority-refresh", grant}` rechecks that exact login, live membership, controller, scene, realm entitlement and host permission. It returns at most ten seconds of authority. Renewal changes the membership lease only; it does not invent a fresh position, advance its sequence, or update its movement timestamp. Current same-generation HTTP travel is read back after the final write fence.

The service endpoint accepts these two operations only. Ordinary player endpoints still require cookies and origin checks. A service signature cannot act as a player session. `movement-checkpoint` is explicitly rejected until coordinator validation and exclusive movement writers are implemented together.

## Request authentication and expiry

HMAC-SHA-256 covers a fixed protocol marker, key ID, exact configured economy origin, POST, exact endpoint, timestamp, random nonce and SHA-256 of the exact body bytes. The request origin must match the configured audience. Signatures are checked with Web Crypto before D1 replay storage is touched. Signed timestamps must be within 30 seconds both before and after reading/verifying the body. Bodies are limited to 4 KB and five seconds. Database authorization uses fresh server time after the body has been verified, so an expired ticket cannot succeed by delivering a delayed body.

Unique `(key_id, nonce)` records survive process restarts and expire after 120 seconds. A retry needs a fresh nonce. Failed operations may consume the nonce; a lost ticket-consume response requires a fresh browser ticket. Active grants are limited to one per wallet. Expired grant and nonce rows are cleaned up by authenticated service traffic; expired tickets are cleaned up by issuance or consumption.

Use one current and optionally one previous 32-byte random service key, configured only on the two servers. Add the new verification key before switching the signer. Remove the previous key after rollout; grants issued under a removed key are rejected and require reconnecting. Unknown/malformed configuration fails closed. Logout of the originating session invalidates its grant even if another login for the same wallet remains valid. Tab takeover, scene changes, membership expiry, host departure and blocks also invalidate authorization.

## Hosting boundary

`NOOBIUS_ROOM_AUTH_ENABLED` defaults off. No live coordinator origin, key or enable flag is being deployed in this increment. Without configuration, both room routes fail closed; ordinary gameplay remains available.

**Application signatures do not grant ingress through an owner-private Sites deployment.** An owned coordinator host and supported machine identity for that private ingress are still required. Do not reuse Sites dispatch/SIWC bypass tokens, publicize the game to work around ingress, or pass browser cookies to a coordinator. See [hosting evidence](transport-hosting-proof.md). The pending owner account connection is unchanged.

## Storage and preservation

Migration `0009_bouncy_lilith` adds only `room_tickets`, `room_grants`, `room_service_nonces` and their indexes. It does not update player rows, facility JSON, money, inventories, accepted/unaccepted job terms, craft timers, projects, listings or prior receipts. Credential tables deliberately have no session foreign key that would prevent normal logout/session cleanup; every use joins the exact still-valid session. Old application code may ignore the new tables while the transport flag stays off. Once transport writers change in a future increment, rollback compatibility must be reassessed.

The local database was copied to an ignored `.wrangler/backups/pre-room-auth-*` directory before its additive migration. Hosted preflight found zero players, projects and listings with no further pages, and confirmed the three new tables were absent. Those reads and a local copy are not a hosted backup/restore rehearsal.

## Verification

The default suite now includes 13 room-authentication tests and an additional migration preservation test. The real SQLite tests cover signature/body/origin binding, slow-body expiry, atomic consume, replay, exact-session revocation, key removal, ticket replacement during takeover, grant replacement during refresh, scene/host/block/realm revocation, unchanged position freshness and rejection of generic movement/identity operations. Migration coverage preserves every existing table and row across the additive update. The full suite passes 221 tests.

`tests/room-auth-api.test.mjs` also passes against an actual isolated local Worker/D1 server with generated wallet accounts. It verifies cookie-route protections, ticket issuance/consumption, signature and nonce rejection, refresh, forbidden checkpoints, and logout while a second valid wallet login remains. One test expectation was corrected to match the existing account-mismatch status (401); no player authentication behavior changed to accommodate the test.

Local API reproduction requires port 3003 and an isolated D1 persist directory with canonical migrations 0000–0009. Generate an ephemeral 32-byte key into ignored `.wrangler/room-auth-qa.json`, using audience `http://127.0.0.1:3003`, coordinator origin `http://127.0.0.1:8787`, `activeKey` and `keys`. A temporary copy of `vite.config.ts` supplies this JSON and `NOOBIUS_ROOM_AUTH_ENABLED=true` through the Cloudflare plugin's server `vars`, and sets `persistState.path` to `.wrangler/qa-dispatch`. Run `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 npm run test:room-auth-api`. Remove that temporary config and key before packaging. Never use a real server key or the normal player's database for this test.

These are protocol and local HTTP checks. They do not establish a deployed coordinator, hosted WebSocket admission, real-wallet browser acceptance, load/cost or five-human playability.

TypeScript, scoped lint for the new protocol/routes/tests and the production build pass. The ordinary local server returns HTTP 503 with “Room transport is not enabled” when configuration is absent. Temporary QA configuration and keys were removed before building; the client output contains neither room secret configuration nor service-signature code.

## Next integration

Implement server-validated movement hops in one room coordinator, with separate input and durable checkpoint sequences. Add a fenced service checkpoint operation and block concurrent HTTP movement writers. Reconcile authorized travel and controller changes, require persisted checkpoints before physical work, and reconnect without stale writes. Preserve claim/cancel paths after room loss. Only then wire browser sockets and prove the full path on the owned host, including five occupants, the sixth-player limit, independent clients, restarts and held-token revocation.
