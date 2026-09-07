# Noobius gameplay audit — September 7, 2026

Scope: improve the existing private alpha for a first-time meme-coin audience, preserve one recognizable Noobius, make progression understandable, and add satisfying feedback and return goals. Three agents supplied independent research, art/navigation review, and gameplay/state review; the main agent implemented and integrated the changes. No public access or financial rewards were enabled.

## Findings and implemented changes

| Finding | Change | Player benefit |
|---|---|---|
| Every coworker reused the protagonist model | One Noobius; three distinct robots and remote-player drones | The player can identify themselves immediately |
| Entry and terminology added friction | Play now starts guest play; plain job, parts, locker, and credit language | A visitor can begin before choosing a wallet |
| Guidance stopped after the first rack | Shared objective resolver covers all nine projects, then daily work | There is always a clear next action |
| Missing parts or spent credits created dead ends | Guidance retrieves stored items, makes space, gathers prerequisites, and routes to repair income | Players can recover without reading a manual |
| Repairs were disconnected from the expanded campus | Job book has a direct repair shortcut; project guidance opens a repair when income or repair progress is needed | The original puzzles serve the larger progression loop |
| Catalog clicks did not feel like work | Guided actions walk to their stations; tool/spark, salvage depletion, fabrication and fan animations respond to game state | Building and collecting have visible causes and results |
| Return goals were unclear | Three-job daily card, permanent completion stamps, gold outfit after three completed days | A visible longer goal without losing a streak for taking a break |
| Clickable hidden descendants and excessive route dots | Ancestor visibility checks and evenly spaced path markers | Fewer misleading targets and less visual clutter |
| Stale session reads and queued work could outlive an account | Revision/generation guards, synchronous invalidation, cancellation on manual control/identity/exit, guarded repair panel | Account changes cannot restore old UI state or execute old queued work |
| Shared IP throttling and non-atomic chat cooldown | Separate read/action/presence limits and atomic chat insert | Less ordinary-play rate friction; concurrent chat cannot bypass its cooldown |
| Remote peers leaked geometry/material resources when leaving | Per-peer resource cleanup | Presence churn releases its allocated resources |

Daily jobs preserve existing claim IDs and rewards. The additional card bonus is 25 game credits and 25 XP once per UTC day after all three claims; three completed days unlock the cosmetic. Days need not be consecutive. New JSON save fields default safely and preserve the facility concurrency version. No database migration is required.

## Research translated into design

[Kintara's how-to-play guide](https://kintara.com/#how-to-play) and [documentation](https://kintara.com/#docs) connect gathering, crafting, inventory, skills, trade and progression. Noobius borrows those connections as a design principle: salvage feeds useful parts, parts build racks, repairs pay for expansion, and milestones unlock more interesting rooms. We did not copy its code or art.

[Stardew Valley](https://www.stardewvalley.net/) and [Sunflower Land's delivery guide](https://docs.sunflower-land.com/player-guides/deliveries) informed short readable jobs feeding longer goals and visible progress. This is inspiration, not a claim of comparable scale, retention, or commercial success. Noobius remains a compact alpha with seven departments, not a complete MMO.

For the owner's economy question: Kintara's mines produce inventory resources such as stone and coal. Gold is its in-game currency. Its separate Solana token is $KINS. The [marketplace documentation](https://kintara.com/#docs-market) describes eligible sellers listing gold for another player to buy with KINS, with 95% to the seller and 5% to the treasury. That is buyer-dependent trade, not each mining click minting KINS or a guaranteed cash-out. Public docs/configuration were inspected; no authenticated Kintara trade was executed.

## Verification

- 25 automated rules/navigation/wallet tests passed, including a complete nine-project objective route using actual recipes, rewards, and prerequisites; full-backpack and stored-part recovery; old-save defaults; nonconsecutive daily stamps; and duplicate reward rejection.
- Both local D1 API suites passed: signed login, identity isolation, CSRF, persistence, concurrent repairs/purchases, escrow competition, and reward idempotency. Eight simultaneous chat submissions produced one accepted message and seven rate rejections. Premature daily bonus and gold outfit claims were rejected.
- TypeScript and the production build passed. The build retains a large client-chunk warning. Scoped lint still reports existing strict React/compiler and style issues; a clean lint result is not claimed.
- Independent review generated 175 campus object paths. The shared objective resolver was reviewed across progression and depleted-resource cases. Final account/queued-action fixes received a separate source review.
- Browser walkthrough completed through Play now → guided salvage → kit fabrication/collection → first-rack construction → three project rewards, with 1 installed rack and 115 credits. The next objective immediately opened the cooling repair. The daily card showed the actual 18/30 gathered parts, 1/3 crafted parts and 0/3 repairs, with the stamp correctly disabled. The sole Noobius and distinct robots were visually inspected; the objective follows the station being used. The 390×844 job book and gameplay HUD were inspected, zoom controls exercised, and the temporary viewport reset. Actual wallet extension dialogs and real phones were not used in this walkthrough.

## Limits and next launch work

The current game uses non-redeemable credits and upgrades. It does not pay $NOOBIUS, NBIS, securities, or cash. Existing injected Ethereum-style wallet login, signed sessions and server saves work in local protocol/API tests; actual extension approval screens, mobile wallets, QR pairing and smart accounts need their own acceptance work. QR pairing and contract-wallet validation are not implemented.

Production load/cost measurements, backup and restore rehearsal, telemetry, abuse handling, moderation/reporting, support ownership, public access verification and real-device testing remain launch gates. Presence is periodic polling and private facility progress, not an authoritative shared MMO simulation. Reward-bearing actions remain automatable. New content and daily cards create reasons to return, but retention needs real player evidence.

The owner needs to choose the supported wallet ecosystem, audience and initial player cap, monthly budget, beta reset policy, and eventual reward asset/funding if desired. Domain/provider account access is needed only for chosen services; real-wallet testers and a community/support owner are required for launch. No seed phrase or private key is needed. See the [full public-launch checklist](public-launch-plan.md) for owners, dependencies and acceptance criteria.
