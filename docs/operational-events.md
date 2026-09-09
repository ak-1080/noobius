# Room recovery, holder verification and admission controls

September 9, 2026. This pass supplies operational evidence and closes two recovery/admission loopholes. It does not activate the standalone coordinator, configure a live token asset, establish alert delivery or pass public multiplayer acceptance.

## Admission semantics

`NOOBIUS_GPU_ADMISSION_PAUSED=true` independently stops new GPU entries and GPU neighborhood changes. It does not stop free entry, GPU-to-Commons return, existing work, already earned project claims or marketplace cancellation. Existing holding and membership rules still apply.

A live paused membership may resume only in its reserved neighborhood and slot. Same-controller resume preserves scene, position, sequence and generation. Explicit takeover rotates generation and resets movement in that same slot. There is no route from a paused resume to general matchmaking. The write checks the observed neighborhood, slot, client and generation, a lease live against both request time and database wall time, and the current holding guard. Missing, expired or concurrently replaced memberships cannot be recreated by the pause exemption. A reduced player cap does not prevent an existing in-place resume that adds no occupant.

The same repair applies to the global admission pause. Previously, a targetless takeover could pass its existing-membership exemption and be matched into a different neighborhood. The new path closes that bypass. Runtime settings are deployment/request snapshots; changing a flag does not cancel requests already executing with older settings.

## Event contract

`lib/operational-events.ts` constructs a fresh allowlisted JSON object before logging. Unknown names/labels and arbitrary extra properties are discarded. It does not traverse request/error objects or call their serializers. Each candidate is read once and validated before use. Logging failure cannot alter gameplay or recovery.

Correlations are generated UUIDv4 values for a single recovery obligation or verification attempt. They are not player, session, room, grant or checkpoint identifiers. Outbox correlation metadata is persisted before recovery networking; legacy records gain a correlation on their first attempt without changing the checkpoint identity. A legacy record without a known queue time omits age.

| Event                    | Meaning                                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room-outbox-attempt`    | One orphan checkpoint or release attempt has started.                                                                                                                                                                                                             |
| `room-outbox-retry`      | A transient failure has a retry persisted; reports checkpoint/release phase and delay. A failed persistence write must not claim a scheduled retry.                                                                                                               |
| `room-outbox-finished`   | The obligation was deleted after checkpoint reconciliation and release. Separate `checkpoint` and `release` values distinguish confirmed responses from terminal rejection. Legacy reconciled state is `previously-reconciled`, not retroactively proven success. |
| `room-outbox-expired`    | Recovery TTL elapsed and the remaining obligation was deleted. This is abandoned recovery, not confirmed completion.                                                                                                                                              |
| `room-admission-blocked` | The admission scan found at least 64 outbox records before consuming a ticket. `pendingAtLeast:64` is a lower bound, not total backlog. Warning is limited to once per 30 seconds per active object instance.                                                     |
| `room-release-deferred`  | A close/restore release failed with no queued checkpoint; writer expiry is the fallback. This does not promise durable retry.                                                                                                                                     |
| `room-recovery-delayed`  | Scan or persistence failure interrupted recovery. All launched sibling requests settle before the batch gate releases.                                                                                                                                            |
| `room-connection-failed` | The connection queue failed. An unclassified error is `unknown`, not automatically a network outage.                                                                                                                                                              |
| `holder-verification`    | An actual provider attempt, including the winning returned eligible/ineligible/grace/unavailable outcome when available. Cached, unsupported and unconfigured paths do not fabricate provider attempts.                                                           |
| `holder-storage-failed`  | Initial entitlement read, result write or winning-decision read failed. It is separate from provider availability.                                                                                                                                                |

Failures are bounded categories: HTTP, timeout, network, invalid JSON/result, RPC error, chain/asset mismatch, unavailable block, storage or unknown. HTTP status is an integer from 100 through 599. A response-body abort is a timeout. Only errors caught at the service fetch/body boundary receive transport categories; arbitrary queue errors remain unknown.

Durations, delays and ages have bounded numeric output. `attempt` currently represents the existing capped retry/backoff counter (0–6), not a lifetime retry total. Delay is capped at 30 seconds, duration at 10 minutes, age at 24 hours. No raw wallet, balance, token, grant, ticket, checkpoint/intent, RPC URL/body, credential, name, coordinates, error message/name/stack or arbitrary authority data is included.

Provider failure reports the winning stored decision: a concurrent confirmed denial can override older grace. If the provider fails and storing that outcome also fails, report the provider failure without claiming a returned access outcome, followed by the correlated storage failure. Successful provider evidence followed by D1 failure emits a storage event and propagates the error; it is not disguised as RPC downtime.

## Recovery concurrency

Recovery dispatches at most two orphan jobs per batch. Storage can fail after one sibling starts or while a later cursor advances. Each job has immediate rejection handling, and the batch drains all launched jobs before resetting its in-flight gate. Another alarm can renew healthy actors without duplicating the still-pending orphan. Network operations retain their existing timeout, checkpoint identity and release rules.

## Validation and limits

- All 337 default tests, TypeScript, the three tooling checks, the production build and the standalone Worker dry-run bundle passed. Focused new-file lint passed; broader holder-verification lint retains four pre-existing configuration string-coercion warnings.
- Default tests include serializer privacy/bounds, holder HTTP/JSON/RPC/body timeout and database-failure classification, grace/cache/concurrent denial, durable retry/terminal/expiry outcomes, backlog before ticket consumption, and storage failures while sibling recovery is pending.
- Real in-memory SQLite tests cover paused resume/takeover, missing and expired membership, changed/deleted membership at commit, revoked real-policy entitlement and a reduced cap.
- `npm run test:admission-pause-api`, with `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003`, exercises real authenticated routes against the isolated `.wrangler/qa-dispatch` database. The temporary QA server must enable local holder testing and GPU admission pause and disable room authority. Generated accounts and explicitly seeded preexisting GPU membership/earned claims/escrow isolate pause behavior; this test does not earn a license or verify real holdings.
- The API scenario verified fresh GPU denial, free entry, same-slot resume/takeover, other-room denial, exactly-once project reward and escrow return, and safe return. The first run encountered a Miniflare internal D1 error on a session read during final return; the unchanged scenario passed on rerun. This is recorded as an observed local D1 transient with its underlying cause unestablished, not hidden behind request retries or a zero-error claim.
- Coordinator tests use a virtual clock, in-memory Durable Object storage and mocked movement. They establish recovery ordering and event semantics; they do not demonstrate hosted WebSocket behavior. A separate dry-run bundle verifies the Worker package without provisioning/deploying it.
- No database migration, saved-player rewrite, balance reset, public-audience change or live token-policy change is required by this pass.

## Operator follow-through

Configure collection, retention, an accountable operator and alert destinations before public opening. Investigate growing retry age, expirations, repeated backlog rejection and storage failure; correlate eligible/grace/denial outcomes with provider availability without exposing account identifiers. Confirm recovery in a hosted restart/backup drill. No alert threshold, staffing arrangement or successful hosted drill is implied by emitting these events. Source changes to `services/room-coordinator` need a separate authorized service deployment after the existing host/private-ingress prerequisites are resolved.

## Private release record

Site version 47 (`appgprj_6a9ef8b4a03c8191a7e106551d030528~appgver_f9b200bc23e0819193f67ef49ae6973c`) deployed successfully at 14:35:26 UTC on September 9, 2026. Application source: `21aa49661ae9e848578b56ba7c2d2ac2f6b172ec`. Deployment: `appgdep_6aa16e9c15488191b7150160169062fd`. Exact validated source was pushed to GitHub main/work branch and Sites main. The normalized archive hash was `sha256:0c2e1e555e4fe74896076d883d466a54f53cd52df294a48e9465c0e1fcf12692` (167 files, 33,556,480 bytes); no temporary QA config or environment file was packaged.

The push-triggered [GitHub checks](https://github.com/ak-1080/noobius/actions/runs/34364404133) passed on both Node 22 and 24. The Site remains owner-private with environment revision zero and canonical migrations 0000–0011 unchanged. GPU pause remains off by default; no live holder asset, reviewer or coordinator host was enabled. This release changes the deployed application and the stored coordinator source, not a separately running room service. No player save was reset or collected for this pass. Broader hosted/human acceptance remains open.
