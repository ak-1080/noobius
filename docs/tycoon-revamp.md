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
- [x] Desktop browser: picture-guide routes and topic navigation; Docs price table; wheel zoom, keyboard rotation after closing Build, and Escape opening/closing the menu.
- [x] Phone browser at 390 × 844: Build, bonus game and HUD spacing after popup/focus fix.
- [x] Phone browser at 390 × 844: picture-guide text and first-upgrade screenshot, Docs price table, collapsed/expanded menu, and exchange amount validation/Max/confirmation.
- [x] Phone bonus prompt moved above the help button; all HUD controls remain unobstructed at 390 × 844.
- [x] Production build.
- [x] Private deployment v18 succeeded.
- [x] Follow-up browser review: character name/look → four slides → automatic Margo welcome → first free machine. Guest title screen → Connect → Back to game resumes the existing machine without resetting progress.
- [ ] Connected-wallet browser check of visiting another world and returning home from guidance. Local API tests cover account/visit isolation, but the current in-app browser has no wallet provider.

## Remaining launch work

A real payout service, economic/legal review for a real token launch, multi-device wallet testing, larger load tests, operations/backup/moderation runbooks, and public-access decisions remain separate from this UI/gameplay pass. Existing shared movement uses periodic updates rather than realtime sockets. No claim of console or AAA production readiness is made by these checks.

## Controls integration follow-up

A read-only flow review found four mismatches between advertised behavior and handlers. Movement keys were ignored after a dialog returned focus to a dock button; Escape did not open the menu; home guidance could run inside a visited world; and guest sign-in wording implied guest progress would transfer. The follow-up allows gameplay keys from ordinary buttons while preserving editing and browser shortcuts, adds the world Escape menu action, returns home before following home guidance, and explains account loading at the wallet connection step. Keyboard/menu behavior is now browser-verified; connected visit behavior still needs a browser wallet.

## Menu, guide, and rendering follow-up

The pause menu puts Build, Goals, How to play, and Exchange first. Workshop, materials, skills, and other optional activities sit inside “More activities.” The first-upgrade guide image now shows the actual 20-Compute purchase described by the text. Dark scrollbars fit the guide on desktop and phone.

The exchange preview fits its main controls and confirmation at 390 × 844. It rejects fractional, nonpositive, and over-balance amounts; invalid input has a plain-language explanation. Browser checks covered a zero balance, an over-balance amount, Max recovery, and a valid preview. The displayed balance did not change. No token-transfer backend was added.

Character setup mounts only its own avatar preview, then mounts the campus on entry. Campus replays an already-present guide command on initialization, throttles covered/paused rendering, releases shadow resources on teardown, and stops animation when WebGL is lost. The setup-to-Margo handoff was tested in the browser. WebGL-loss fallback was source-reviewed but not induced during browser QA.

The final local browser error log was empty for the reviewed guide, onboarding, menu, wallet-return, and exchange paths. These checks establish this pass’s behavior; they are not a substitute for cross-device acceptance or a public launch test.

## Guest return-play follow-up

Practice games now save a versioned profile and optional minigame shift on the same browser and origin. Reloading offers “Continue my game” after character setup. Names, outfits/accessories, machines, speed upgrades, balances, daily stamps, and production timestamps are preserved. Clearing browser data removes the device save. Guest saves never load into wallet accounts, rankings, or the token economy.

An existing authenticated session takes priority on startup. Starting practice after logout reads the separate device save. Save validation rejects malformed facility state while retaining a valid facility when only its minigame is invalid or expired. Newer save formats are preserved without overwriting them. Unavailable browser storage leaves the game playable in memory and the menu reports that saving is unavailable.

Writes use Web Locks where supported plus revision conflict checks. Queued writes check the current account/state before writing and before applying their result. Other tabs load the latest snapshot and return to the title screen with a Continue prompt. Browsers without Web Locks use weaker revision-only conflict detection; simultaneous writes there are not guaranteed atomic.

The coach now says when collecting will afford the next purchase. Fully upgraded facilities point toward an available daily bonus, more collection for today's goal, or the Locker after the goal is complete. The last machine/speed purchase triggers a completion celebration. Daily goal text recognizes a claimed reward and an already-unlocked gold outfit.

- [x] 48 unit tests, including save/reload, next-day stamps, capped offline output, double-collection rejection, account exclusion, corrupt/newer saves, storage failure, stale-tab conflicts, queued-write invalidation, and endgame objective states.
- [x] Read-only audit exercised 197 round trips from actual game actions, including accessories, full machine progression, outfits, repairs, inventory, and minigame results.
- [x] Browser: create SaveNoob with blue shirt/cap → build starter → collect 36 → buy the 20-Compute upgrade → reload → Continue. Balance remained 16, output remained 36/min, and name/outfit/cap persisted.
- [x] Browser: second tab changed the name to SaveNoobTwo. The original tab detected the newer save, returned to title, and Continue loaded that name with the same 16 Compute.
- [x] Phone at 390 × 844: save status and pause-menu controls remain readable and usable. Browser error log empty for these paths.
- [ ] Endgame objectives and next-day goal state passed logic tests. Visual acceptance of the last-upgrade celebration and the endgame screens remains outstanding.
- [ ] Same-page wallet login/logout with a real browser wallet still needs device testing; account isolation and stale-save guards have unit/source evidence.


## Reward visibility and returning-player follow-up

Build, speed, collection, expansion, daily and outage successes now use an action-specific receipt. Wallet receipts are derived from the committed mutation after the compare-and-swap succeeds, before unrelated later profile activity can contaminate a reward amount. The guest path uses the same receipt helper. Replayed requests refresh the state without a second celebration; stale account/generation responses cannot set success feedback.

An open gameplay panel retains its receipt, including the exact Compute cost and before/after income. A sticky receipt remains visible while scrolling; the menu title and close button stay outside the scrolling body. Returning to the world starts the dismissal timer. Opening another menu clears old feedback. Text remains available with reduced motion.

Once per wallet per page session, an established player's Continue flow shows a short summary if at least a minute of output is ready. It says “Compute ready,” does not attribute all uncollected output to time away, and never collects automatically. Players can collect explicitly or look around first. Full storage explains that collection makes room for more earnings. Goals has a ready indicator until the daily bonus is claimed; gold-unlock messaging distinguishes a new unlock from later daily rewards.

- [x] TypeScript and production build.
- [x] 53 unit tests, including collection across a production tick, replay suppression versus a free first build, capped/nonmutating return summaries, UTC daily states, and either final purchase's completion receipt.
- [x] Local D1 receipt test: committed free build, repeated request without another receipt, and an actual timed collection with a matching reward amount.
- [x] Phone 390 × 844 and desktop: welcome-back summary; explicit 702-Compute collection changed 16 to 718; speed purchase showed 200 spent and 36 → 48/min; new machine showed 75 spent and 48 → 96/min.
- [x] Receipts stayed visible beyond their former expiration and while purchasing/scrolled near the bottom of Build. Fixed header and close button stayed visible.
- [x] Daily claim showed +35 Compute/+25 XP and 1 of 3 days; Goals' ready dot cleared after claiming. Later machine upgrades showed their exact cost and income change.
- [x] Phone help and Locker layouts reviewed after the scroll-container adjustment. Optional bonus prompt no longer overlaps help. Fresh reload → Continue → Look around first kept the 238-Compute balance unchanged; browser error log was empty.
- [ ] Full-storage and final-upgrade receipt contents passed logic tests; those exact visual states still need acceptance on a fully progressed game.
