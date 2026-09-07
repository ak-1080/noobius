# Noobius — The Night Shift

A small, complete browser game: fullscreen cinematic title screen, wallet login, an edge-to-edge 3D data-center room with a following camera and compact pause menu, three repair puzzles, nontransferable credits, three equipment upgrades, ranks, and a persistent best-shift leaderboard.

## Run locally

Requires Node 22.13 or newer. Use `npm install`, then `npm run db:local` once to apply the initial database migration. Start with `npm run dev` and use its printed URL. Local D1 state stays in `.wrangler/state`.

- `npm test`: game rules, walking routes, and the wallet handshake.
- `npm run test:api`: integration tests against the running local server. Creates isolated, randomly generated test-wallet identities in the local database. Exercises real signature verification, cross-account access, CSRF, persistence, simultaneous duplicate repairs, and concurrent purchases.
- `npm run typecheck`: TypeScript verification.
- `npm run build`: Cloudflare Worker and browser assets.

## First release

Wallet accounts authenticate with an origin-bound, expiring, single-use SIWE message. No onchain transaction or token balance is required. This release supports standard Ethereum accounts through EIP-6963/injected providers, including MetaMask; contract-wallet signature validation and WalletConnect QR pairing are not implemented. Mobile users can open the site in their wallet's browser.

D1 stores profiles, hashed sessions, challenges, shifts, equipment and scores. All authenticated changes bind to the wallet displayed by the client. The server validates answers and owns credit/XP/score updates. Optimistic version checks and transaction-scoped mutation identifiers prevent duplicate awards. No private keys are handled by the app. Browser puzzles are inspectable and automatable; this is not a bot-proof financial rewards system.

Practice is explicitly temporary. Its credits cannot be uploaded as trusted wallet progress. A repaired job grants 25 credits/20 XP; three repairs add 25 credits/40 XP. Equipment costs 100/150/200 credits and takes effect on the next shift. There are three attempts per station and no overall shift countdown; an unfinished shift expires after 24 hours.

The initial published Site is private to its owner. Public audience access is a separate publishing decision. Hosting metadata is in `.openai/hosting.json`; it does not contain credentials.

## Assets and narrative

The portrait and cinematic are user-supplied originals. The background poster is extracted from the supplied video; the original video is available through “Meet Noobius.” The 3D avatar is a game-ready interpretation of the pale-blue body, anxious eyes, headset and oversized shirt. The original character image is also used on employee badges.

`public/assets/facility.png` is one original image generated using the built-in ImageGen tool, used as a non-WebGL room fallback. Asset details are in `docs/art-assets.md`. No Kintara or Touch Grass assets or code were copied.

$NOOBIUS and NBIS rewards are not launched. Credits have no cash value. The site states the project's independent status. Research and the deliberately bounded build plan are in `docs/research-and-scope.md`.

## Verification

The September 7 first-release checks cover all three repair puzzles in the browser, the 100-credit/100-XP completion report, equipment purchases, desktop and mobile layouts, clickable station badges, obstacle-aware walking, guide and token-status panels, and the no-injected-wallet entry path. Automated game, pathfinding, shared wallet-handshake, TypeScript, production-build and real local API concurrency/persistence checks pass. An installed browser wallet signing through its own extension UI still requires user testing; the shared handshake and real cryptographic verification were exercised separately.

P2E remains the intended product direction. This first playable release deliberately ships game credits and upgrades only, as agreed. A funded reward pool, eligibility, payout asset, redemption, and financial-reward anti-abuse controls remain future scope; current credits create no claim on future rewards.
