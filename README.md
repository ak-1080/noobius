# Noobius — The Night Shift

A browser data-center tycoon with a cinematic title screen, a fullscreen 3D world, and a customizable Noobius. This is a private playable alpha. The token exchange previews requests; it does not spend Compute or send tokens.

## Current game

Margo introduces one free machine. Machines produce Compute every 15 seconds; the starter earns 24 per minute. Collect it, buy a first speed upgrade for 20, build more machines, then open new rooms. All core building purchases use Compute alone. Each machine has three levels, later rooms have stronger equipment, and five speed upgrades improve the whole facility. Storage holds one hour of current production.

Jobs remain available after the center is upgraded. Choose service repairs, supply deliveries or client workloads; gather/craft their inputs, configure Fast/Efficient/Stable equipment, and complete the work explicitly. Workloads reserve machine capacity. Twelve job templates renew, with career reputation, an earned Operator license and mastery cosmetics. These are repeatable systems; long-term retention still needs human playtests.

The next-action card guides travel and opens the relevant menu; it cannot purchase, repair or claim for you. The main dock is Center, Jobs, Crew and Locker. Character creation and the large Locker support names, outfits and accessories, followed by a four-slide introduction.

Connected accounts keep one personal center and join five-player neighborhoods. Visit neighbors, trade parts through escrow, invite friends and contribute completed-job reports and crafted parts to persistent shared cluster projects. Movement and authority are checked by the server through 1.5-second HTTP polling. Free Crew Commons includes the core loop. GPU District requires an earned license and verified holdings when a real token policy is configured; no live token configuration is supplied. Its present verification adapter supports EVM holdings only, while both EVM and Solana accounts can play the free game.

- `/how-to-play`: illustrated instructions and game captures.
- `/docs`: saving, currencies, multiplayer and help.
- [Current implementation and verification](docs/neighborhoods-implementation-status.md).
- [Neighborhood design](docs/neighborhoods-upgrade-plan.md).
- [Operations and remaining release gates](docs/neighborhoods-operations.md).
- [Public-launch checklist](docs/public-launch-plan.md).

## Run locally

Requires Node 22.13 or newer. Run `npm install`, then `npm run db:local` **once on a fresh local database**. This applies the six canonical migrations in journal order. Existing databases must apply only their unapplied migrations; do not rerun the fresh setup over saved data. Start `npm run dev`. Local D1 data lives in `.wrangler/state`.

- `npm test`: game rules, wallet handshake, navigation, progression, migration preservation, purchase clocks, daily rewards and retry protection.
- `npm run typecheck` and `npm run build`: TypeScript and the production Worker/browser build.
- `npm run test:api`: authentication, account isolation and concurrent rewards.
- `npm run test:campus-api`: D1 crafting, escrow, competing buyers, cosmetics, presence and chat.
- `npm run test:multiplayer-api`: five-player admission, visits, movement, cooperative jobs, social controls and tab takeover.
- `npm run test:wallet-api`: separate EVM/Solana saves, signed challenges, replay and account isolation.
- `node tests/neighborhood-load.mjs`: loopback-only synthetic load probe, not a public-capacity certification.
- `node --test tests/tycoon-api.test.mjs`: one-free-starter race and durable old-save migration.
- `node --test tests/onboarding-api.test.mjs`: saved name and combined appearance after a fresh login.

API suites create random test-wallet identities on the local server. Do not point mutation tests at production. Authentication rate limits apply; run API suites sequentially.

## Persistence and economy

Wallet login supports Ethereum/EVM accounts through EIP-6963/injected providers and Solana accounts through Wallet Standard. The server verifies an origin-bound, expiring, single-use message (SIWE for EVM, Ed25519 for Solana). Login costs no gas and needs no token balance. Each ecosystem/account has its own save; existing Ethereum saves retain their identifiers. Contract-wallet validation and WalletConnect QR pairing are not implemented; mobile login needs a compatible wallet browser and separate acceptance testing. The app never handles private keys. Run `npm run test:wallet-api` against an isolated local server for multichain authentication and persistence coverage.

D1 stores accounts, sessions, facility state, shifts, listings, messages and presence. The server validates prices, rewards, recipes, cooldowns and gates. Version checks and conditional D1 updates protect purchases and marketplace settlement from duplicate requests and concurrent updates. Compute is the authoritative spendable balance; a separate migration flag settles legacy production at the old rate before the new clock starts. Existing money, cosmetics, inventory and unfinished work are preserved.

Real $NOOBIUS transfers, live quotes and a settlement service are not connected. Compute is a game balance, and the current preview creates no payout claim. The original technical puzzles and other earning actions are still automatable; these checks do not make the game a secure financial rewards system.

## Release limits

The Site remains owner-private. Local automated API/load tests, request logs, admission/trade/project controls and persisted player reports are implemented. Real-wallet/device acceptance, hosted load/cost measurements, verified backup restoration, moderation staffing and multi-session human playtests remain release gates. Real token redemption remains separate. Shared movement uses periodic updates; this is not a console-ready or AAA game.

## Assets and research

The portrait and cinematics are user-supplied. The playable Three.js model interprets Noobius’s pale-blue silhouette, worried unequal eyes, shirt and black headset. Other illustration assets and notes are in [the art record](docs/art-assets.md). The guide uses Noobius artwork and local gameplay captures; no Kintara or Touch Grass assets were copied. [Game research](docs/game-research.md) records sources and evidence limits. Earlier iteration notes in `docs/` are historical where superseded by the revamp record.
