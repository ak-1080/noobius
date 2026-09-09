# Build history and room load verification

September 9, 2026. This increment preserves existing economy state and adds no database migration.

## Long-term project access

Previously, a fixed 30-build history could hide unfinished projects and older rewards behind already collected builds. The board now puts completed, unclaimed work first, open builds second and collected history last. Thirty-entry pages retain deterministic ordering, even when creation timestamps match. Players can browse older builds, return to the latest page, resume unfinished work and claim earned rewards.

Background polling keeps the selected page. A successful action returns to the latest results. Responses from a previous neighborhood cannot replace the current board. Cursors are validated and bound as SQL parameters; history remains limited to the authenticated player's contributions. Existing project requirements, contributions, claims and rewards are retained.

Snapshot finalization now examines only supported projects with pending work that is actually due. A regression scenario with 91 unfinished builds verifies that future or legacy work adds no per-project reads while nothing can settle. Due work on an older history page still settles and its reward becomes visible.

## Validation

- 294 default tests passed, plus a final 26-test project/panel rerun after test-registration formatting.
- TypeScript, the production build and scoped changed-logic lint passed. Repository-wide lint has existing issues.
- Actual isolated Worker/D1 project reads accepted valid cursors and rejected malformed cursors with HTTP 400.
- Three tooling compatibility tests passed: legacy TypeScript loader transforms, real-schema Drizzle generation/repeat in a temporary directory, and Miniflare Images through native sharp WebP/AVIF transforms.
- Two actual economy/coordinator API scenarios passed after the scoped dependency overrides. The opt-in five-minute renewal scenario was not repeated for this increment; its prior release evidence remains in the room-coordinator record.

The panel tests exercise the production component with a hook renderer, not independent browser users. These checks establish correctness in their scope, not long-term enjoyment or retention.

## Fifty-client WebSocket experiment

Run `4526b220-921f-43c7-a76b-99bb94530b16` completed at `2026-09-09T11:07:09.454Z`. It ran real RoomClient instances against local Workers/Miniflare, with ten neighborhoods of five generated-key accounts. Each neighborhood had an owner and visitor in one private center, with three other players in Commons. Each client had to receive fresh, exact scene-specific peer sets, accepted movement and durable checkpoints. Graceful release was verified through API and database final positions.

| Measurement                                        | Result                      |
| -------------------------------------------------- | --------------------------- |
| Measured duration                                  | 60.139 seconds              |
| Accepted / sent movement                           | 18,446 / 18,446             |
| Corrections / detected issues                      | 0 / 0                       |
| Peer frames                                        | 20,100                      |
| Authority frames                                   | 1,170                       |
| Metadata reads                                     | 600                         |
| Durable checkpoints during interval                | 585                         |
| Durable final positions                            | 50 / 50                     |
| Lowest per-client accepted movements / checkpoints | 356 / 11                    |
| Movement send-to-ack p50 / p95 / p99               | 2.29 / 7.54 / 27.14 ms      |
| Metadata p50 / p95 / p99                           | 163.29 / 829.46 / 905.96 ms |
| Inbound WebSocket payload bytes                    | 12,652,846                  |

These are loopback measurements from a development machine, not a controlled production benchmark. Socket byte counts exclude setup, HTTP bytes, outgoing messages and coordinator service traffic. Send-to-ack latency does not measure rendered peer movement. The run used separate simulated edge IPs; it does not prove shared-IP login-burst capacity. No hosted billing, public latency, actual browser rendering or extended soak was measured.

The load fixture requires the exact isolated QA origin `http://127.0.0.1:3003`, coordinator port 3004 and `.wrangler/qa-dispatch` database. Both load harnesses use the guarded QA database helper. Temporary server configuration and service keys are removed before packaging. Player databases are not load fixtures.

## Remaining release gates

The hosted game still uses HTTP transport. Activating the standalone coordinator requires an owner-controlled host and supported machine authentication to the private economy service. Hosted multi-browser acceptance, longer load/reconnect testing, cost measurements, real wallet/mobile checks, operational alerts, staffed moderation, and a recovery rehearsal remain open. Human first-session and return-session tests remain necessary.

The scoped dependency overrides reduce npm's report to two high affected packages, image-size and vinext; the underlying parser vulnerabilities remain unresolved. See the dependency review. No live holder asset policy, token payout or NBIS settlement is configured.
