# Noobius — The Night Shift

A browser data-center tycoon with a cinematic title screen, a fullscreen 3D world, and a customizable Noobius. The playable alpha is hosted at https://play.noobius.io; https://noobius.io remains the separate coming-soon site. Player-to-player Compute checkout is implemented, but real-token trading is disabled pending token configuration and acceptance testing.

## Current game

Margo introduces one free machine. Machines produce Compute every 15 seconds; the starter earns 24 per minute. Collect it, buy a first speed upgrade for 20, build more machines, then open new rooms. All core building purchases use Compute alone. Each machine has three levels, later rooms add equipment with more workload capacity, and five speed upgrades improve the whole facility. Storage holds one hour of current production.

Jobs remain available after the center is upgraded. Choose service repairs, supply deliveries or client workloads; gather/craft their inputs, configure Fast/Efficient/Stable equipment, and complete the work explicitly. Workloads reserve machine capacity. Twelve job templates renew, with career reputation, an earned Operator license and mastery cosmetics. These are repeatable systems; long-term retention still needs human playtests.

The next-action card guides travel and opens the relevant menu; it cannot purchase, repair or claim for you. The main dock is Center, Clients, Crew and Locker. Clients includes the new commission desk and access to hands-on repair and parts jobs. Character creation and the large Locker support names, outfits and accessories, followed by a five-slide introduction.

Connected accounts keep one personal center and join five-player neighborhoods. Visit neighbors, trade parts through escrow, invite friends and contribute completed-job reports and crafted parts to persistent shared cluster projects. The hosted game uses authenticated WebSockets and five-player Cloudflare Durable Object rooms, with server-validated movement and D1 checkpoints. Local deployments can retain the HTTP fallback. Earned player XP opens four realm destinations: Crew Commons at level 1, Cooling Works at 3, GPU District at 5 and Archive Depths at 8. The first two are free; the latter two also require an earned Operator license and verified holdings when a real token policy is configured. No live token configuration is supplied. Solo practice previews holder destinations after their level gates. Each realm now has its own navigable layout, industrial landmarks and three physical worksites: a salvage yard, a cooling ring, accelerator lanes and archive islands. Four randomized activities cover sorting damaged hardware, routing coolant, scheduling GPU batches and restoring checkpoints. Balanced, Deep recovery and Quick pass exchange resources, time and output; paid work stays finishable after leaving a realm or losing access. Holding verification supports EVM and Solana policies; both account types can play the free game. Solana is the intended launch ecosystem.

Fully upgraded centers can choose between three competing client requests with changing demand. Bookings reserve machines and freeze their supply costs, time and payment. Three certification branches change speed, resource use and capacity. Repeatable facility distinctions require fresh client work, different specialties, two realm recoveries and crafted supplies; each lights a permanent monument without resetting the center. Compute remains game currency, with no connected real-token payouts. This supports ongoing play, while human retention testing remains outstanding.

- `/how-to-play`: illustrated instructions and game captures.
- `/docs`: saving, currencies, multiplayer and help.
- [Current Cloudflare deployment and remaining launch gates](docs/cloudflare-launch-2026-09-22.md).
- [Public monitoring, capacity probes and operating procedures](docs/cloudflare-operations.md).
- [Distinct worlds, client economy, endgame verification and human playtest protocol](docs/endgame-worlds-2026-09-20.md).
- [Earlier realm progression implementation and verification](docs/realms-implementation-2026-09-20.md).
- [Kintara, comparable games, architecture and production research](docs/research/game-architecture-2026-09-20.md).
- [Earlier neighborhood implementation and verification](docs/neighborhoods-implementation-status.md).
- [Neighborhood design](docs/neighborhoods-upgrade-plan.md).
- [Operations and remaining release gates](docs/neighborhoods-operations.md).
- [Public-launch checklist](docs/public-launch-plan.md).

## Run locally

Requires Node 22.18 or newer (the `.nvmrc` selects Node 24). Run `npm ci`, then `npm run db:local` **once on a fresh local database**. This applies the thirteen canonical migrations in journal order. Existing databases must apply only their unapplied migrations; do not rerun the fresh setup over saved data. Start `npm run dev`. Local D1 data lives in `.wrangler/state`.

- `npm test`: game rules, wallet handshake, navigation, progression, migration preservation, purchase clocks, daily rewards and retry protection.
- `npm run typecheck` and `npm run build`: TypeScript and the production Worker/browser build.
- `npm run test:api`: authentication, account isolation and concurrent rewards.
- `npm run test:campus-api`: D1 crafting, escrow, competing buyers, cosmetics, presence and chat.
- `npm run test:multiplayer-api`: five-player admission, visits, movement, cooperative jobs, social controls and tab takeover.
- `npm run test:realms-api`: local HTTP level/worksite authority, malformed commands, frozen recovery and concurrent start/claim protection.
- `npm run test:clients-api`: local HTTP ownership, input validation, competing bookings and one-time client payment.
- `npm run test:wallet-api`: separate EVM/Solana saves, signed challenges, replay and account isolation.
- `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 node tests/neighborhood-load.mjs`: HTTP load probe using the isolated QA database, not ordinary player saves.
- `NOOBIUS_TEST_ORIGIN=http://127.0.0.1:3003 npm run test:room-load-api`: ten-neighborhood WebSocket load check against isolated economy/coordinator servers on ports 3003/3004. Local results do not certify hosted capacity.
- `npm run test:tooling`: isolated migration-loader and local image-binding compatibility checks for the scoped dependency patches.
- `node --test tests/tycoon-api.test.mjs`: one-free-starter race and durable old-save migration.
- `node --test tests/onboarding-api.test.mjs`: saved name and combined appearance after a fresh login.

API suites create random test-wallet identities on the local server. Do not point mutation tests at production. Authentication rate limits apply; run API suites sequentially.

## GitHub checks

[Noobius checks](https://github.com/ak-1080/noobius/actions/workflows/checks.yml) installs the committed lockfile on clean Ubuntu runners with Node 22 and 24. It runs game/persistence tests, TypeScript, tooling compatibility and the production build on main pushes and pull requests; it can also be started manually. Documentation-only main pushes are skipped.

These checks have read-only repository permissions and no deployment or production database credentials. They do not start the mutation/API/load suites or deploy the game. A passing run is build/rules evidence, not hosted multiplayer, wallet-extension or human playtest acceptance. Repository-wide lint is separate from these checks. Release-specific dependency and lint evidence must be checked against the current deployment record.

Node 22.18 is the minimum because the test suite imports TypeScript directly using [Node’s default type stripping](https://nodejs.org/en/blog/release/v22.18.0). Earlier Node 22 versions require additional flags that these scripts do not supply.

## Persistence and economy

Wallet login supports Ethereum/EVM accounts through EIP-6963/injected providers and Solana accounts through Wallet Standard. The server verifies an origin-bound, expiring, single-use message (SIWE for EVM, Ed25519 for Solana). Login costs no gas and needs no token balance. Each ecosystem/account has its own save; existing Ethereum saves retain their identifiers. Contract-wallet validation and WalletConnect QR pairing are not implemented; mobile login needs a compatible wallet browser and separate acceptance testing. The app never handles private keys. Run `npm run test:wallet-api` against an isolated local server for multichain authentication and persistence coverage.

D1 stores accounts, sessions, facility state, shifts, listings, messages and presence. The server validates prices, rewards, recipes, cooldowns and gates. Version checks and conditional D1 updates protect purchases and marketplace settlement from duplicate requests and concurrent updates. Compute is the authoritative spendable balance; a separate migration flag settles legacy production at the old rate before the new clock starts. Existing money, cosmetics, inventory and unfinished work are preserved.

The Solana marketplace includes Compute reservations, buyer-reviewed token payments, durable settlement recovery and a scheduled reconciliation Worker. New real-token sales are disabled: no production mint is configured, and real devnet transfers plus wallet/device acceptance remain outstanding. Compute is a game balance, not a guaranteed payout claim. The original technical puzzles and other earning actions are still automatable; these checks do not make the game a secure financial rewards system.

## Release limits

The Cloudflare game URL is public; the older managed Site is a separate deployment. API/load harnesses, operational logs, admission/trade/project controls, persisted player reports and read-only GitHub health checks are implemented. A database export was restored into isolated staging, and hosted room reconnect/renewal was verified. Real-wallet/device acceptance, sustained mixed-workload capacity and cost, notification delivery, moderation staffing and multi-session human playtests remain release gates. See the current deployment record for the exact evidence and outstanding real-token requirements.

## Assets and research

The portrait and cinematics are user-supplied. The playable Three.js model interprets Noobius’s pale-blue silhouette, worried unequal eyes, shirt and black headset. Other illustration assets and notes are in [the art record](docs/art-assets.md). The guide uses Noobius artwork and local gameplay captures; no Kintara or Touch Grass assets were copied. [Game research](docs/game-research.md) records sources and evidence limits. Earlier iteration notes in `docs/` are historical where superseded by the revamp record.

Report-review setup and limitations are recorded in [the moderation guide](docs/moderation.md). Dependency patch status is recorded in [the release review](docs/dependency-review-2026-09-09.md).
