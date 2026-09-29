# Reusable generated capacity QA cohorts

The capacity harness can retain its own generated signing identities and reuse their existing staging saves. This avoids making forty-five new accounts from one network for every test. It preserves normal signup, authentication, admission and earning limits; it does not create an operator bypass.

These are operating instructions, **not evidence that a returning-cohort hosted run has passed**. Current results and remaining release gates belong in the [production-readiness audit](verification/2026-09-28-production-readiness.md).

## Scope and private files

Run these commands from the repository root after `npm ci`. Persisted cohorts accept only this exact destination:

`https://noobius-game-staging.rinkydooonso.workers.dev`

The room destination is independently checked against `https://noobius-rooms-staging.rinkydooonso.workers.dev`. Persisted cohorts require the `devnet` network and the generated-capacity-QA schema/provenance markers. They are refused on production. Do not use `npm run smoke:capacity` for these commands: that script selects production; the commands below invoke the harness directly with explicit staging settings.

The helper creates fresh Ed25519 identities solely for QA sign-in. It does not import a browser wallet, request an airdrop, sign a transaction or transfer a token. Never put owner, friend, payment-fixture or other wallet keys into this file. Generated provenance markers are an accidental-import fence, not proof that an address has no assets; these identities must remain dedicated to QA and must never receive real assets.

Files must be directly inside `.wrangler/capacity-cohorts/`, with names such as `staging-five-a.json`. The directory must be owned by the current user with **0700** permissions; each bounded JSON file must be a single-link, current-user-owned regular file with **0600** permissions. Symlinks, wrong permissions, unknown fields, malformed keys, key/address mismatches, duplicate identities and duplicate saved-profile IDs are rejected before network requests. This uses POSIX ownership and no-follow checks; unsupported hosts fail closed.

The whole `.wrangler/` directory is ignored by Git. **The JSON contains private signing keys: do not print it, paste it into chat, commit it, or attach it to a report.** A new clone on another computer does not contain this private cohort. An authorized private copy is needed to reuse it there, with the same required ownership and permissions. The game and deployed saves do not depend on copying the QA file.

Only one process may own a cohort file at a time. An exclusive `.lock` file prevents overlapping runs; registration writes verify the original file before atomically replacing it. Normal exit releases the owned lock. If a process crashes, first verify that it has ended before investigating its stale lock. Never remove a live run's lock or modify a cohort while it is open.

## First create five normal staging accounts

This creates **one five-player neighborhood**, measures movement for thirty seconds, and records each successful login's exact saved profile ID. The file must not already exist. The helper creates the private directory/file when absent, so no hand-written key file is needed.

```sh
NOOBIUS_TEST_ORIGIN=https://noobius-game-staging.rinkydooonso.workers.dev \
NOOBIUS_LOAD_ROOMS=1 \
NOOBIUS_LOAD_SECONDS=30 \
NOOBIUS_LOAD_WALK=full-speed \
NOOBIUS_CAPACITY_COHORT_MODE=create \
NOOBIUS_CAPACITY_COHORT_FILE=.wrangler/capacity-cohorts/staging-five-a.json \
node scripts/smoke-cloudflare-capacity.mjs
```

Create mode uses the ordinary signed-login path and its ordinary first-browser earning enrollment. It permits at most **twenty fresh accounts per invocation**, matching the normal **twenty new centers per network per rolling twenty-four hours** limit. Other signups on that network may have already consumed some of the allowance. This is a rolling window, not a midnight reset and not twenty accounts per cohort file.

Only the recognized minute authentication throttle is retryable, for at most three attempts. Each retry obtains and signs a fresh challenge. A daily signup limit, an unknown throttle or another authentication error stops the run. Do not immediately retry with another filename or loop fresh-account creation after a daily rejection. Wait for the normal allowance, or use a previously complete returning cohort.

The file is created before hosted authentication and updated after each successful registration. An interrupted run can therefore leave a **partial cohort** containing both registered saves and unused generated keys. Returning mode rejects the entire file if any actor lacks a valid registered saved-profile ID, even if the first five entries are complete. Create mode refuses to overwrite or adopt an existing file; there is currently no resume-provisioning command. Keep partial files private for diagnosis. Do not invent saved-profile IDs, prune records to bypass the check, or treat partial provisioning as a passed capacity test.

After a successful or failed run, the harness leaves neighborhoods and logs out generated sessions. It retains the generated accounts and their saves for future runs; logout is not account deletion.

## Reuse the same five players beyond renewal

This measures the same five existing actors for **330 seconds**, beyond the ordinary five-minute renewal interval. Use `NOOBIUS_LOAD_SECONDS=360` instead for a six-minute measurement; 360 is the harness maximum.

```sh
NOOBIUS_TEST_ORIGIN=https://noobius-game-staging.rinkydooonso.workers.dev \
NOOBIUS_LOAD_ROOMS=1 \
NOOBIUS_LOAD_SECONDS=330 \
NOOBIUS_LOAD_WALK=full-speed \
NOOBIUS_CAPACITY_COHORT_MODE=returning \
NOOBIUS_CAPACITY_COHORT_FILE=.wrangler/capacity-cohorts/staging-five-a.json \
node scripts/smoke-cloudflare-capacity.mjs
```

Before authentication, returning mode requires public `/api/health` to report `status: "ok"`, `service: "noobius-game"`, and **`returningLoginVersion: 1`**. An older Worker that might ignore the optional guard is rejected before any authentication. A recognized endpoint alone is not sufficient.

Each actor still obtains and signs a fresh server challenge. The verification request supplies the exact recorded `returningProfileId`. After validating the signature, the server requires that wallet's existing save and persistent earning enrollment to match before creating a session. Missing, replaced or unenrolled saves are refused without creating a player, enrolling a signup or creating a session. A deleted QA save must not silently turn a returning test into fresh signup. The harness also checks the returned profile ID against the file.

This guarded path reuses the original account enrollment. It does not reset earning allowances, grant player capacity, create test credits or relax realm access. The harness changes the generated actors' display names and uses their normal neighborhood controls, scene transitions, movement and profile reads.

## Build a larger cohort through normal provisioning

Larger returning runs require enough **complete, distinct generated cohorts** accumulated within ordinary rolling signup allowances. Offline merging makes no requests and creates no accounts. It validates every input's full schema, keys, staging/devnet scope and registered save IDs; it refuses partial inputs, duplicates and an existing output file. Every input/output must use the private ignored directory above.

For example, after nine independently completed five-actor cohorts have legitimately been registered, merge them into forty-five actors:

```sh
node scripts/capacity-cohort.mjs merge \
  .wrangler/capacity-cohorts/staging-forty-five.json \
  .wrangler/capacity-cohorts/staging-five-a.json \
  .wrangler/capacity-cohorts/staging-five-b.json \
  .wrangler/capacity-cohorts/staging-five-c.json \
  .wrangler/capacity-cohorts/staging-five-d.json \
  .wrangler/capacity-cohorts/staging-five-e.json \
  .wrangler/capacity-cohorts/staging-five-f.json \
  .wrangler/capacity-cohorts/staging-five-g.json \
  .wrangler/capacity-cohorts/staging-five-h.json \
  .wrangler/capacity-cohorts/staging-five-i.json
```

Only after that complete file exists, a bounded forty-five-actor returning measurement would use:

```sh
NOOBIUS_TEST_ORIGIN=https://noobius-game-staging.rinkydooonso.workers.dev \
NOOBIUS_LOAD_ROOMS=9 \
NOOBIUS_LOAD_SECONDS=360 \
NOOBIUS_LOAD_WALK=full-speed \
NOOBIUS_CAPACITY_COHORT_MODE=returning \
NOOBIUS_CAPACITY_COHORT_FILE=.wrangler/capacity-cohorts/staging-forty-five.json \
node scripts/smoke-cloudflare-capacity.mjs
```

The harness uses five actors per neighborhood. Staging accepts a requested plan of one to twenty neighborhoods, while the helper bounds a cohort at one hundred actors; actual hosted admission limits still apply. Returning mode uses the first requested number of actors from a complete file and rejects an insufficient file. These bounds are tooling safeguards, **not a statement that any of those concurrency levels works**. A five-player pass, a larger merged file, or a historical near-fifty-player report is not near-fifty capacity certification and cannot justify raising production's fifty-player ceiling.

## Read the report and correlated timeline

Staging writes `/tmp/noobius-hosted-capacity-staging-results.json` and prints the report. A subsequent run overwrites that path; preserve reviewed evidence under a distinct name when needed. Reports identify the mode, cohort ID, measured duration, accepted movement, latency, recovery, final positions and cleanup. Review/redact a full report before committing it; the private cohort file must never accompany it.

Every neighborhood is split into **two home visitors and three plaza players**. The harness verifies scene-specific rosters, then moves actors while periodically reading saved profiles. It uses the real `RoomClient`, public sign-in/admission and hosted game/room endpoints. It does not render graphics, perform repair jobs, trade items or execute blockchain payments. Mixed gameplay/trading and real-device tests remain separate acceptance work in the readiness audit.

The `timeline` is recorded whether or not `NOOBIUS_DIAGNOSE_SOCKET=1` is set. It correlates elapsed offsets, numeric actor IDs and socket ordinals with ticket/open/join/renew/rebase/close/recovery events, handshake status, close codes and authority/recovery ages. Known profile IDs are converted to numeric actor indices before observer-gap events are recorded. The timeline excludes wallet addresses, keys, tickets, sessions, socket URLs and raw protocol frames.

Observer events record when an expected actor disappears, how the missing set changes, when it recovers, and any unresolved gap. This makes it possible to compare a scheduled renewal or code `1012` close with what other players actually saw, instead of assuming every close caused the same outage. A close event by itself is not a failure or proof of recovery.

Peer metrics update only during the measured window and freeze at its end, or at the failure catch. `maxPeerGapMs`, `unresolvedPeerGaps` and `peerMetricsFrozenAtMs` preserve evidence at that instant. Intentional final scene release/logout must not inflate a gameplay gap; transport events outside the window remain separately visible. An unresolved gap stays at its measured duration instead of continuing to grow during teardown.

## Actual harness acceptance gates

The requested measurement is thirty to 360 seconds; the whole run is bounded at fifteen minutes. A report is accepted only if the harness assertions and cleanup succeed. Relevant gates are:

| Check | Current assertion or reported limit |
| --- | --- |
| Authentication and admission | Exact returning capability/save checks; normal throttles/caps. Recoverable initial connection attempts are bounded at sixty seconds. All final admitted actors must converge to their exact scene peers within fifteen seconds after setup. |
| Room and scene isolation | Exact actor/room counts, distinct neighborhood groups, no foreign/duplicate peers and no exposed private peer fields during measurement. |
| Measured roster continuity | Each sampled incomplete scene roster must recover in **less than 5,000 ms**. The frozen maximum and unresolved gaps remain in the report for review; do not mistake setup/intentional teardown for measured disappearance. |
| Movement per actor | At least `durationSeconds × 2` accepted updates for every actor. |
| Movement acceptance | `accepted / sent` must be **greater than 0.99**. The displayed assertion calls this “at least 99%,” but the comparison is strict. |
| Unexpected interruption recovery | The longest unexpected room reconnection must be **at most 3,000 ms**. Planned lease renewals are reported separately. This gate was added after a 15-player run eventually recovered from a 22.9-second group-wide outage yet received the old `passed` label. |
| Movement accounting | Every sent measured move must have an acknowledgement or be explicitly counted as unacknowledged during a disconnect. Zero unacknowledged moves is not a separate assertion; inspect that count and acceptance ratio. |
| Movement latency | Measured send-to-ack p95 must be **below 1,200 ms** from this runner. HTTP latency is reported, with no separate HTTP-p95 threshold. |
| Final recovery and save | All clients must recover before the final save check within its fifteen-second wait. Released writers must be inactive, and each durable position must exactly equal that actor's last accepted position. |
| Evidence completeness | No accumulated harness issues; **zero dropped timeline events**. The timeline retains up to twenty thousand events, then counts drops and fails evidence acceptance. |
| Cleanup | All generated signed-in sessions must leave and log out. Idempotent cleanup can retry at most three times; any remaining cleanup error marks the report failed and makes the command fail. |

Recovery/release retry counts, maximum planned-renewal recovery duration, traffic bytes and HTTP request counts are diagnostic fields. The unexpected recovery duration has the independent limit above. Connection recovery attempts are bounded; a reconnect that exhausts sixty seconds records a failure. A failed report must be diagnosed rather than relabeled a pass because it admitted many players. Historical reports produced before the three-second gate must be reviewed for slow unexpected recovery even if their saved `status` says `passed`.

One successful synthetic run from one network only demonstrates its recorded workload, duration and host versions. It does not establish worldwide latency, mobile rendering, thousands of players, provider costs, a production launch or a sustainable token economy.
