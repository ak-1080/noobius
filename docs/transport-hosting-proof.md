# Transport hosting proof

September 9, 2026. Temporary owner-private capability experiment for Stage A. It does not replace game multiplayer or claim production readiness.

The custom Worker delegates normal routes to the unchanged Vinext handler. A separate transport-probe route tests a bounded WebSocket exchange, exact Origin rejection and a Durable Object receipt counter shared across connections. It has no player, inventory, balance or game database access. Each accepted probe socket closes after one message or five seconds. The current Site must stay owner-private for this experiment. Remove this route before broader rollout.

The Cloudflare Vite configuration uses its documented Durable Object binding and SQLite class migration. No unsupported field is added to `.openai/hosting.json`. Local testing established that the binding exists, raw and room WebSocket upgrades return a pong, and sequential room exchanges increment persisted receipts. A real managed deployment still has to demonstrate namespace provisioning and private-proxy upgrade support. The fallback plan requires a separately authorized host; the current direct Cloudflare CLI login is unavailable.

The check script prints capability/status receipts only. The optional Site dispatch bearer is supplied through the process environment and must never be committed or logged. This proof does not exercise game authorization, controller takeover or D1 economic settlement; those are the next integration work after hosting capability is established.
