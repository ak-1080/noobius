# Noobius — The Night Shift

A browser data-center tycoon with a cinematic title screen, a fullscreen 3D world, and a customizable Noobius. The playable alpha is hosted at https://play.noobius.io; https://noobius.io remains the separate coming-soon site. Player-to-player Compute checkout is implemented, but real-token trading is disabled pending token configuration and acceptance testing.

## Handoff for a new device or Codex session (September 25, 2026)

The last published source of truth is [`ak-1080/noobius` on `main`](https://github.com/ak-1080/noobius/tree/main). A later active-play and presentation pass is being verified locally on `codex/noobius-neighborhoods`; it is not live until a reviewed deployment. The game code, committed art and videos, coming-soon site, migrations, tests, and deployment configuration are on GitHub. Clone the desired revision, use Node 24 (`.nvmrc`), and run `npm ci`. To start a **new local** game database, follow [Run locally](#run-locally); do not initialize over an existing save. Pushing to GitHub does **not** automatically deploy either hosted site; the GitHub deployment workflows are manual.

The existing hosted services keep running independently of the development computer:

- **Production:** `https://play.noobius.io` hosts the free multiplayer game. `https://noobius.io` hosts the separate coming-soon page. Real-token Compute trading is **off** in production.
- **Staging:** `https://noobius-game-staging.rinkydooonso.workers.dev` has an isolated Cloudflare D1 database and Solana **devnet** checkout for valueless test tokens. On September 24, two human players completed a browser-wallet sale: the buyer paid one devnet test token, received 100 Compute, and the seller's offer was marked sold. This proves that one real two-player staging path worked; it is not a mainnet or broad wallet/device acceptance test. MetaMask's devnet payment prompt was misleadingly labeled Mainnet, so staging blocks MetaMask checkout; Phantom in Devnet mode completed the sale.
- **Data and credentials:** live player saves, sessions, and offers are in Cloudflare D1; live rooms use Cloudflare Durable Objects. The private RPC endpoint and payment-signing secret are configured in the hosted staging Workers. None of those live records or secrets belong in GitHub. A fresh clone can edit and test code, and the existing sites and trading setup continue to work. Changing a deployment requires authorized Cloudflare access; recreating the special devnet checkout deployment on a new machine also requires its private Helius RPC configuration and generated devnet test-key/proof files, which are intentionally ignored under `.wrangler/`. Never commit or paste those secrets into chat.

Do not use the ordinary `npm run deploy:staging` workflow to update the **payment-enabled** staging game: that workflow intentionally deploys with test-token trading disabled. The guarded `deploy:staging:devnet-payments` script is the path for that isolated configuration, subject to its private prerequisites and checks. Production deployment is separate and must not enable devnet or real-token trading by accident.

The local update adds an in-game completed-sale receipt for sellers; it has not been deployed. Remaining work includes real-browser/mobile and uncoached endgame playtests, sustained multiplayer capacity and operating costs, and a separate reviewed mainnet-token launch plan. The successful devnet trade does not establish funded real-value rewards or safe production token trading.

## Current game

On the hosted build, Margo introduces one free machine and machines still produce Compute every 15 seconds. **The local active-play update changes this:** after migration, machines process finite, supplied batches and stop when those batches finish. Players recover parts, choose a batch or client order, collect the result and decide what to build or trade next. Machine levels add client capacity; five existing speed upgrades shorten newly started machine batches. Old earned storage and already accepted jobs remain intact. This change is not deployed yet.

Jobs remain available after the center is upgraded. Choose service repairs, supply deliveries or client workloads; gather/craft their inputs, configure Fast/Efficient/Stable equipment, and complete the work explicitly. Workloads reserve machine capacity. Twelve job templates renew, with career reputation, an earned Operator license and mastery cosmetics. These are repeatable systems; long-term retention still needs human playtests.

In the local presentation pass, Margo’s collapsible hint marks a destination without walking, opening a menu, purchasing or claiming for the player. Explicit task-navigation tools can still guide travel. This pass is not deployed; see the owner review below. The main dock is Center, Clients, Crew and Locker. Clients includes the commission desk and hands-on repair and parts jobs. Character creation and the large Locker support names, outfits and accessories, followed by a five-slide introduction.

Connected accounts keep one personal center and join five-player neighborhoods. Visit neighbors, trade parts through escrow, invite friends and contribute completed-job reports and crafted parts to persistent shared cluster projects. The hosted game uses authenticated WebSockets and five-player Cloudflare Durable Object rooms, with server-validated movement and D1 checkpoints. Local deployments can retain the HTTP fallback. Earned player XP opens four realm destinations: Crew Commons at level 1, Cooling Works at 3, GPU District at 5 and Archive Depths at 8. The first two are free; the latter two also require an earned Operator license and verified holdings when a real token policy is configured. No live token configuration is supplied. Solo practice previews holder destinations after their level gates. The local update gives each realm its own architecture, industrial landmarks and floor treatment within the existing navigable footprint: a salvage yard, a cooling ring, accelerator lanes and archive islands. Each realm has three physical worksites. Four randomized activities cover sorting damaged hardware, routing coolant, scheduling GPU batches and restoring checkpoints. Balanced, Deep recovery and Quick pass exchange resources, time and output; paid work stays finishable after leaving a realm or losing access. Holding verification supports EVM and Solana policies; both account types can play the free game. Solana is the intended launch ecosystem.

Fully upgraded centers can choose between three competing client requests with changing demand. Bookings reserve machines and freeze their supply costs, time and payment. Three certification branches change speed, resource use and capacity. Repeatable facility distinctions require fresh client work, different specialties, two realm recoveries and crafted supplies; each lights a permanent monument without resetting the center. Compute remains game currency, with no connected real-token payouts. This supports ongoing play, while human retention testing remains outstanding.

- [September 25 owner review: font previews, visual polish, realm art and active-play economy plan](docs/design/2026-09-25/README.md).
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

The Solana marketplace includes Compute reservations, buyer-reviewed token payments, durable settlement recovery and a scheduled reconciliation Worker. New real-token sales are disabled: no production mint is configured. Generated-account and one human two-player devnet checkout have settled successfully on staging; broader wallet/device acceptance remains outstanding. Compute is a game balance, not a guaranteed payout claim. The original technical puzzles and other earning actions are still automatable; these checks do not make the game a secure financial rewards system.

## Release limits

The Cloudflare game URL is public; the older managed Site is a separate deployment. API/load harnesses, operational logs, admission/trade/project controls, persisted player reports and read-only GitHub health checks are implemented. A database export was restored into isolated staging, and hosted room reconnect/renewal was verified. Real-wallet/device acceptance, sustained mixed-workload capacity and cost, notification delivery, moderation staffing and multi-session human playtests remain release gates. See the current deployment record for the exact evidence and outstanding real-token requirements.

## Assets and research

The portrait and cinematics are user-supplied. The playable Three.js model interprets Noobius’s pale-blue silhouette, worried unequal eyes, shirt and black headset. Other illustration assets and notes are in [the art record](docs/art-assets.md). The guide uses Noobius artwork and local gameplay captures; no Kintara or Touch Grass assets were copied. [Game research](docs/game-research.md) records sources and evidence limits. Earlier iteration notes in `docs/` are historical where superseded by the revamp record.

Report-review setup and limitations are recorded in [the moderation guide](docs/moderation.md). Dependency patch status is recorded in [the release review](docs/dependency-review-2026-09-09.md).
