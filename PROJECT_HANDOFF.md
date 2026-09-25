# Noobius handoff for a new Codex session

**Updated September 25, 2026.** Start here on another computer. The GitHub repository is [`ak-1080/noobius`](https://github.com/ak-1080/noobius); `main` is the source branch after this handoff is merged. Read this file and `README.md` before changing the game. The current production site is **not** automatically redeployed when GitHub changes.

## What the owner is building

Noobius is an original browser data-center tycoon with ongoing, repeatable play and small multiplayer neighborhoods. Each player owns a center; up to five players share a neighborhood, visit, trade and help with cluster projects. XP opens Crew Commons, Cooling Works, GPU District and Archive Depths. The latter realms have additional earned/verified-access rules when a token policy is configured. Kintara is a structural reference for connected gathering, production, specialization, trading and reasons to return, not art or code to copy.

The owner wants a game that remains worthwhile after every machine is upgraded. A real player should still have choices, useful work and reasons to interact with others. Working devnet trade is only a test; repeatable gameplay and funding real `$NOOBIUS` rewards are separate problems. The intended token ecosystem is Solana and the possible launchpad is Stonk.fun. There is **no production token mint configured**, no live token payouts, and no guarantee that earning Compute will produce a real-world return.

The owner explicitly deferred global font changes. The checked-in font lab is a visual study only; the playable interface keeps its existing fonts.

## Current code and hosted state

| Place | State |
| --- | --- |
| GitHub `main` | Latest committed game, promotional images, design/research notes, tests, deployment configuration and this handoff. GitHub Actions tests/builds on code changes; they do not deploy. |
| `https://play.noobius.io/` | Public production game. Still uses the prior 15-second machine accrual until a separately reviewed production release. Real-token trading disabled. |
| `https://noobius.io/` | Separate coming-soon site. |
| `https://noobius-game-staging.rinkydooonso.workers.dev/` | Isolated staging game with the September 25 active-play and presentation update. Its separate D1 database and devnet test-token checkout remain configured. Only valueless devnet tokens are involved. The two final how-to-play SVG replacements in this main commit may still need a staging redeploy. |
| `https://noobius-rooms-staging.rinkydooonso.workers.dev/` | Staging room service. Production rooms are at `https://rooms.noobius.io/`. |

Player saves, sessions and offers live in Cloudflare D1. Room state uses Cloudflare Durable Objects. They are **not GitHub files**. The existing hosted services keep running if this laptop is off. A new laptop can clone, edit, build and test the project immediately; it needs its own GitHub/Cloudflare login for pushes or deployments. The private Helius RPC URL, staging payment signer/test keys and local database/backup files are intentionally ignored under `.wrangler/` or held in Cloudflare secrets. Do not commit, paste or recreate them casually. The staging D1 export taken before this update exists only on the original computer under ignored `.wrangler/staging-backups/`; it is not portable through GitHub.

## Most recent implementation

1. **Active earning loop.** New centers run production rules v3. Existing centers migrate once: completed old passive output is frozen into their saved storage, while balances, machines, accepted work and marketplace obligations remain. Machines now process explicitly chosen, finite batches using salvage inputs and stop until the next batch is chosen. Speed upgrades shorten newly started batches; machine levels still add client capacity. Buying every batch input from the NPC shop costs more than the resulting Compute, so a pure shop loop cannot profit. Existing service, supply and client-work systems remain.
2. **Interface pass.** Margo has a compact collapsible hint. Its **Mark location** control highlights a destination without walking or doing the action. Job, challenge and project panels use shorter, more visual rules and clearer requirements. Routine sparkle/pop-up noise was reduced. Repeated E pickup input is guarded so it does not queue duplicate interactions. The four realms have different floor plans, industrial silhouettes and landmarks inside their existing navigable boundaries. The how-to-play guide has distinct scalable illustrations. Fonts did not change.
3. **Trade visibility.** Exchange now shows the seller's completed sales from the existing settled payment record, including a Solana Explorer link where available. This display does not make a new payment.
4. **Owner review and art.** See `docs/design/2026-09-25/README.md` and its realm/screens images. Promotional images, source cutouts and the preview generator are archived under `output/`. They are not game runtime requirements.

## Verification already performed

- `npm test`: 460 game-rule tests passed. TypeScript, the standard build and staging-targeted build passed. GitHub Actions on Node 22 and 24 passed for the draft PR before its final handoff commit; confirm the final main run.
- Local D1 API tests passed onboarding, one-free-starter concurrency, old-save migration, and a new player's salvage-to-finite-batch path.
- The guarded staging deployment checked the private devnet RPC, finalized test-token mint, zero unsettled payments, and page/database/login/market smoke. It did **not** make a token transfer.
- A three-generated-player hosted staging smoke passed repeat repairs, a finite batch that paid once and did not automatically restart, visitor privacy, competing item buyers, reconnection and saved balances. Its first extended attempt spent the test seller's scrap before the later item-trade check; the test was fixed to gather replacement scrap and the full rerun passed.
- A separate earlier **human** Phantom devnet purchase settled between two players on September 24, before this active-play build. A new human checkout on the current staging build remains to be done. Production public health passed after staging deployment.
- Repository-wide lint still has existing findings, including generated preview code. Do not claim a clean lint run; compare relevant changes to baseline.

## What remains, in priority order

1. **Human staging acceptance.** Have a fresh player and a fully upgraded returning player play without coaching. Check the salvage → batch → client → reinvest/trade loop, Margo's hint, comprehension of each realm, and reasons to keep playing. Repeat on real mobile devices. Verify that a seller sees a completed sale after a new human devnet test-token checkout. Use test tokens only; do not touch real funds.
2. **Economy and bot resistance.** Finite batches remove idle minting, but salvage interactions and other rewards can still be scripted. Measure Compute created, spent and traded; compare active play with repeat scripts and merchant-input strategies. Consider short server-validated spatial salvage actions only if playtests show they improve the game. Do not mistake extra clicks for proof of human play. Tune output, material scarcity, recurring sinks and advanced-player choices from evidence.
3. **Performance and operating limits.** Check the full realm art on lower-end phones, pickup smoothness on real devices, longer multiplayer repair/trade sessions and sustained capacity/cost. The current four realms have distinct architecture inside the existing footprint; they are not yet four enlarged worlds with entirely separate navigation systems.
4. **Release decision.** Keep `play.noobius.io` unchanged until the new-build migration, real-browser/wallet testing, payment recovery and economy results are reviewed. A main push does not deploy. Treat real-value token trading, Solana mainnet setup, payout funding, safeguards and legal review as a separate release track.

## How to pick up work on another computer

1. Clone `https://github.com/ak-1080/noobius.git`, check out `main`, use the Node version in `.nvmrc`, and run `npm ci`.
2. Read this file, `README.md`, `docs/design/2026-09-25/README.md`, `docs/research/2026-09-25-active-play-economy.md`, and `docs/cloudflare-operations.md`.
3. Run `npm test`, `npm run typecheck`, and `npm run build`. For a **fresh local-only** database, `npm run db:local` applies the migrations once, then `npm run dev` starts a preview. Never run the fresh migration chain over an existing save.
4. Use a `codex/` branch and a PR for new work. Before changing hosting, check the target Worker, D1 database, backup and current payment obligations. The ordinary `npm run deploy:staging` disables devnet trading; the guarded payment-enabled staging script requires private local prerequisites and must not be used from a clean clone without them. Production deployment is a separate explicit step.

Suggested first instruction for the next Codex: **“Read `PROJECT_HANDOFF.md` and `README.md` in `ak-1080/noobius` on `main`, inspect the current staging/production distinction, then continue the remaining human playtest and economy work. Keep fonts deferred and do not deploy production or use real funds.”**
