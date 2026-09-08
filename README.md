# Noobius — The Night Shift

A browser data-center tycoon with a cinematic title screen, a fullscreen 3D world, and a customizable Noobius. This is a private playable alpha. The token exchange previews requests; it does not spend Compute or send tokens.

## Current game

Margo introduces one free machine. Machines produce Compute every 15 seconds; the starter earns 24 per minute. Collect it, buy a first speed upgrade for 20, build more machines, then open new rooms. All core building purchases use Compute alone. Each machine has three levels, later rooms have stronger equipment, and five speed upgrades improve the whole facility. Storage holds one hour of current production.

The next-action card gives one goal, cost or countdown at a time and can guide Noobius to its location. The main dock is Build, Goals, Travel and Locker. Optional outages are three-button bonus games that do not stop normal income. Collecting 100 Compute completes the daily goal for a 35 bonus; three different completed days unlock the gold outfit without a streak requirement. Parts, crafting, trading and the original three repair puzzles remain optional activities through the menu and world.

Character creation and the large Locker preview support names, outfits and accessories. Connected players own separate saved facilities, can visit one another, and can enter shared campuses for cooperative jobs. Movement uses periodic presence updates. Guest progress saves on the same browser and origin and survives reloading. Clearing browser data removes it; it cannot be transferred into a wallet account.

- `/how-to-play`: illustrated instructions and actual game captures.
- `/docs`: prices, saving, currencies, multiplayer and help.
- [Revamp decisions and verification](docs/tycoon-revamp.md).
- [Shared-campus implementation](docs/multiplayer-alpha.md).
- [Public-launch checklist](docs/public-launch-plan.md).

## Run locally

Requires Node 22.13 or newer. Run `npm install`, then `npm run db:local` **once on a fresh local database**. This applies all four SQL migrations in order. Existing databases must apply only their unapplied migrations; do not rerun the fresh setup over saved data. Start `npm run dev`. Local D1 data lives in `.wrangler/state`.

- `npm test`: game rules, wallet handshake, navigation, progression, migration preservation, purchase clocks, daily rewards and retry protection.
- `npm run typecheck` and `npm run build`: TypeScript and the production Worker/browser build.
- `npm run test:api`: authentication, account isolation and concurrent rewards.
- `npm run test:campus-api`: D1 crafting, escrow, competing buyers, cosmetics, presence and chat.
- `npm run test:multiplayer-api`: visits and cooperative jobs.
- `node --test tests/tycoon-api.test.mjs`: one-free-starter race and durable old-save migration.
- `node --test tests/onboarding-api.test.mjs`: saved name and combined appearance after a fresh login.

API suites create random test-wallet identities on the local server. Do not point mutation tests at production. Authentication rate limits apply; run API suites sequentially.

## Persistence and economy

Wallet login uses an origin-bound, expiring, single-use SIWE message. It costs no gas. Standard Ethereum accounts through EIP-6963/injected providers are supported. Contract-wallet validation and WalletConnect QR pairing are not implemented; mobile login needs a compatible wallet browser. The app never handles private keys.

D1 stores accounts, sessions, facility state, shifts, listings, messages and presence. The server validates prices, rewards, recipes, cooldowns and gates. Version checks and conditional D1 updates protect purchases and marketplace settlement from duplicate requests and concurrent updates. Compute is the authoritative spendable balance; a separate migration flag settles legacy production at the old rate before the new clock starts. Existing money, cosmetics, inventory and unfinished work are preserved.

Real $NOOBIUS transfers, live quotes and a settlement service are not connected. Compute is a game balance, and the current preview creates no payout claim. The original technical puzzles and other earning actions are still automatable; these checks do not make the game a secure financial rewards system.

## Release limits

The Site remains owner-private. Public access, payout economics, real-wallet/device acceptance, load tests, telemetry, backups and restore drills, operations and moderation remain release gates in the launch checklist. Shared movement is periodically updated rather than a realtime authoritative world simulation. This is not a console-ready or AAA game.

## Assets and research

The portrait and cinematics are user-supplied. The playable Three.js model interprets Noobius’s pale-blue silhouette, worried unequal eyes, shirt and black headset. Other illustration assets and notes are in [the art record](docs/art-assets.md). The guide uses Noobius artwork and local gameplay captures; no Kintara or Touch Grass assets were copied. [Game research](docs/game-research.md) records sources and evidence limits. Earlier iteration notes in `docs/` are historical where superseded by the revamp record.
