# Transport hosting proof

September 9, 2026. Temporary owner-private capability experiment for Stage A. It does not replace game multiplayer or claim production readiness.

The custom Worker delegates normal routes to the unchanged Vinext handler. A separate transport-probe route tests a bounded WebSocket exchange, exact Origin rejection and a Durable Object receipt counter shared across connections. It has no player, inventory, balance or game database access. Each accepted probe socket closes after one message or five seconds. The current Site must stay owner-private for this experiment. Remove this route before broader rollout.

The Cloudflare Vite configuration uses its documented Durable Object binding and SQLite class migration. No unsupported field is added to `.openai/hosting.json`. Local testing established that the binding exists, raw and room WebSocket upgrades return a pong, and sequential room exchanges increment persisted receipts. A real managed deployment still has to demonstrate namespace provisioning and private-proxy upgrade support. The fallback plan requires a separately authorized host; the current direct Cloudflare CLI login is unavailable.

The check script prints capability/status receipts only. The optional Site dispatch bearer is supplied through the process environment and must never be committed or logged. This proof does not exercise game authorization, controller takeover or D1 economic settlement; those are the next integration work after hosting capability is established.

## Managed-host result

Private Site version 38 deployed successfully at 08:50:11 UTC from `1337ceaa52cc38fd3a7e87baec28b6235087fca3`. Its build manifest included the DO binding and class migration, and its Worker exported the class. A request through the authenticated Sites dispatch returned `{probe:1,roomBinding:false}`. A raw WebSocket handshake returned HTTP 500. The error-only Worker-log query returned no events; the exact reason for the failed upgrade is not established. Ordinary HTTP access to the probe succeeded, so this was not an absent deployment.

This demonstrates that the tested managed deployment did not provision the room namespace and did not pass the tested authenticated upgrade. It does not prove no future Sites configuration could ever support either capability. The available Sites tooling exposes no namespace-provisioning operation. Direct `wrangler whoami` returned Not logged in after an auth-token refresh failed. The next supported path needs an owner-controlled compatible host and explicit service authentication back to the game.

The temporary route and custom app Worker entry are removed after this check. Reproduction code lives outside the app in `experiments/transport-probe`; its Wrangler configuration has no D1/game binding. Run `npx wrangler dev --config experiments/transport-probe/wrangler.jsonc` and `node scripts/check-transport-probe.mjs http://localhost:3004` to reproduce the local capability proof. This is a five-exchange transport experiment, not a five-player game or an external deployment. Do not deploy it as the production game coordinator.
