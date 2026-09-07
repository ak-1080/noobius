# Noobius — The Night Shift

An original browser data-center game with a minimal cinematic title and fullscreen 3D campus. Seven connected departments support salvage, a backpack and bank, five crafting recipes, seven persistent racks with three levels each, power/cooling expansion, nine story contracts, three daily contracts, five repeatable deliveries, three skills, and four outfits. The original three maintenance puzzles remain a repeatable subsystem that earns credits and supplies.

A contextual first-rack tutorial guides salvage, kit fabrication, credit claims, and construction. It shows the next action, reduces early recipe choices, and keeps the contract board focused on the next two steps. Wheel zoom, keyboard movement, click-to-walk/interact, camera rotation, department fast travel, and accessible menu alternatives work together. Wallet players save their facility and trade listed parts for game credits. Other connected players appear through periodic presence updates; a crew channel supports messages and session-local muting. This is a private playable alpha, not a completed MMO or a launched financial rewards program.

## Run locally

Requires Node 22.13 or newer. Use `npm install`, then `npm run db:local` **once on a fresh local database** to apply both migrations. Existing v1 local databases should apply only `drizzle/0001_calm_mister_fear.sql` with the same Wrangler configuration/persistence path. Start `npm run dev`. Local D1 state stays in `.wrangler/state`.

- `npm test`: 21 tests for game rules, inventory/progression, energy, pathfinding, and the wallet handshake.
- `npm run test:api`: real signatures, account isolation, CSRF, persistence, concurrent repairs, exact repair loot, and competing equipment purchases against a running local server.
- `npm run test:campus-api`: D1 crafting/claims, escrow, competing buyers, cancellation, bank persistence, and presence checks.
- `npm run typecheck` and `npm run build`: TypeScript and production Worker/browser build.

API suites create random test-wallet identities locally. Run suites separately with a minute between them if the shared local IP request limit is reached. Do not point these mutation tests at production.

## Game economy and persistence

Wallet accounts authenticate with an origin-bound, expiring, single-use SIWE message. No onchain transaction or token balance is required. Standard Ethereum accounts through EIP-6963/injected providers are supported. Contract-wallet validation and WalletConnect QR pairing are not implemented; mobile wallet login requires a compatible wallet browser.

D1 stores profiles, sessions, challenges, shifts, facility state, escrowed listings, messages, and recent presence. The server validates rewards, recipes, inventory, costs, cooldowns, and department gates. Optimistic versions protect facility updates. Marketplace purchases and cancellations use conditional D1 batches; a listing can settle once. The bank intentionally accepts overflow from repairs and cancelled listings; backpack space is limited. New players receive no resaleable starter grant.

Practice is temporary and cannot be uploaded as trusted wallet progress. It retains its facility between maintenance shifts until reload. A repaired job grants 25 credits/20 XP and two parts sent to the bank; three repairs add 25 credits/40 XP. Maintenance tools cost 100/150/200 credits and take effect next shift. Each station permits three attempts; unfinished shifts expire after 24 hours.

Racks remain built between shifts. Their compute capacity is a game statistic. Ordinary credits have no cash value and may buy other players’ listed parts, but cannot redeem for tokens or stocks. $NOOBIUS and NBIS rewards are not launched; current credits create no future payout claim.

## Current limits

This Site remains owner-private. Public deployment, launch staffing, moderation/reporting, telemetry, budgets, load tests, backups/restore drills, account-abuse controls, and real-wallet/device acceptance remain work in [the public-launch plan](docs/public-launch-plan.md). Presence uses five-second polling rather than authoritative shared-world simulation; each player owns their own rack progress. Shared incidents, combat, guilds, land placement, and financial payouts are not shipped. Browser puzzles and resource actions remain automatable, so this is not an anti-bot financial system.

The app does not handle private keys. Installed wallet extension UI and real mobile wallet browsers still need user testing; the shared handshake and server cryptographic verification are tested separately.

## Assets and research

The original portrait and cinematic are user-supplied. The playable Three.js model is an interpretation of the same broad pale-blue bean silhouette, worried unequal eyes, off-white shirt, and black headset, with moving arms and feet. See [asset notes](docs/art-assets.md). No Kintara or Touch Grass code or art is copied.

[Game research](docs/game-research.md) compares Kintara's depth with Valhalla, Pixels, Sunflower Land, and Axie using primary sources and explicit evidence limits. [Expansion verification](docs/expansion-verification.md) records this update's checks and remaining gaps.
