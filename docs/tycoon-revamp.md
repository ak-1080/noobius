# Noobius clarity and playability revamp

Goal: an approachable, polished data-center tycoon, supported by a visual How to Play guide and deeper Docs. Character creation stays intact. This remains a browser game; console certification and an actual token settlement service are not implemented.

## Design evidence

Kintara's live `https://kintara.com/#how-to-play` uses a topic sidebar, a short introduction, and nine illustrated instructional cards. Its `#docs` view adds grouped navigation and denser reference material. The Noobius guide follows this reading pattern with original art and its own gameplay screenshots. It does not copy Kintara's art or promise its token mechanics.

The earlier Noobius first-rack path required four gathers, crafting, a timed pickup, three project claims, and building. The new required path is Margo → free machine → collect → speed upgrade → second machine → new room. Crafting, materials and technical maintenance remain optional and saved work is retained.

## Implemented rules

- One free first machine, attached to the account. No starter cash grant, sale, or deletion mechanism.
- 15-second production ticks; starter output is 24 Compute/min. First speed purchase costs 20 and raises this to 36/min.
- Purchases use only Compute. No parts, power or cooling gates in the build action.
- Later machines have higher output as well as higher prices. Build shows the exact gain before purchase.
- First expansion costs 100; later rooms cost 750, 2,000 and 6,000.
- Storage holds one hour of current output. Collection is not required every tick.
- Occasional bonus boosts recharge in 90 seconds. Outages are optional three-light bonus rounds and do not stop ordinary earnings.
- Collecting 100 Compute completes the daily goal. Claim 35 bonus; three nonconsecutive days unlock the gold outfit.
- The coach suggests useful affordable upgrades while saving for a more expensive expansion.
- Currency icon, collection coin particles, machine build bounce, bonus light animation and reduced-motion handling are present. Purchases settle completed ticks at the old rate and keep the next scheduled production tick.
- How to Play and Docs have separate routes; welcome, upgrade and bonus instructions include actual game captures. Images open at full size. Other cards use the existing Noobius illustrations.
- Exchange previews a request without debiting Compute or sending tokens. A real quote and settlement backend remain disconnected.

## Migration and security

`economyVersion` stays 2. A separate `tycoonVersion` settles old whole production ticks under the old rate, cap and incident cutoff. Its clock then starts at migration time; the partial old tick is deliberately reset once. D1 commits this transition with compare-and-swap before returning the new state. Existing balances, cosmetics, claims, inventory, crafts and batch reward snapshots are preserved.

All purchases and rewards retain server-side pricing, request IDs and optimistic concurrency. A two-request race cannot create two free starters. The local exchange preview never calls the rejected token-transfer action.

## Verification record

- [x] TypeScript check.
- [x] 38 unit/navigation/wallet tests, including full zero-balance tycoon route, overspending, idempotency, daily rewards, migration preservation and repair/purchase timer regressions.
- [x] Local D1 race test: exactly one free starter.
- [x] Local D1 migration test: persists once, keeps authoritative balance, preserves stored output and an old pending batch; new-rate collection succeeds.
- [x] Existing authentication/isolation/concurrent reward tests.
- [x] Existing marketplace escrow, competing-buyer and collection tests.
- [x] Two-player visits and cooperative job tests.
- [x] Name and combined appearance survive a fresh wallet login.
- [x] Desktop browser: customize, welcome, first machine, collect, speed upgrade, second machine, open Cooling room, bonus-game retry/success and daily reward.
- [ ] Remaining desktop browser: picture-guide routes/navigation, exchange preview, wheel zoom and final post-patch check. The Mac locked before these could run.
- [x] Phone browser at 390 × 844: Build, bonus game and HUD spacing after popup/focus fix.
- [ ] Remaining phone browser: guide readability and latest bonus-button positioning, after the Mac is unlocked.
- [x] Production build.
- [ ] Private deployment status and final browser review are recorded in the task handoff.

## Remaining launch work

A real payout service, economic/legal review for a real token launch, multi-device wallet testing, larger load tests, operations/backup/moderation runbooks, and public-access decisions remain separate from this UI/gameplay pass. Existing shared movement uses periodic updates rather than realtime sockets. No claim of console or AAA production readiness is made by these checks.
