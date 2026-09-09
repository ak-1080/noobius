# Kintara and the Noobius gameplay blueprint

Noobius should become an active social gathering-and-crafting game with a personal data center as its home base. The facility gives the player's activities a lasting purpose. Exploring, making useful items, developing skills and choosing jobs should drive advancement. The current automated sequence of machine purchases cannot provide that depth on its own.

This is a researched design proposal. It distinguishes current Kintara evidence, inspected Noobius behavior and proposed changes. The proposed systems below have not been implemented by this report.

## Kintara's connected activities

Kintara documents a shared world with gathering, five skills, quests, cooking, storage, construction, combat and player trade. Different destinations provide different uses for what players collect. Food supports dangerous trips; a bank protects supplies; skill advancement opens content. Those connections create decisions about preparation and what to do next. [Game documentation](https://kintara.com/#docs-loop)

The current tutorial gives a more concrete example: a chicken yields a feather, which can become bait, which enables fishing, which supplies cooking. Instructions adapt to missing materials and change the highlighted destination. The tutorial also has a way past its nearby-player lesson when nobody is available. These are examples of teaching through an activity and recovering from shortages. [Current tutorial definitions](https://kintara.com/src/game/tutorial/steps.js?v=20260907-mapbtn)

The short guide uses topic navigation, recognizable activity/item icons and large gameplay pictures beside brief instructions. The reference Docs offer greater detail separately. Its player actions are presented spatially: select a tool, approach a resource and use it. The sources do not establish the exact automatic-repeat behavior for every activity. [How to Play](https://kintara.com/#how-to-play)

The design inference is that depth comes from several activities sharing useful outputs. Repeating one action can progress a skill, fulfill a job, supply equipment and produce something another player wants. A larger map without these relationships would only add walking.

### Evidence that needs qualification

Public spectator mode rendered an inhabited isometric scene, but it does not expose an authenticated player's complete action loop. Neither the displayed population counters nor these sources establish audited retention, earnings or the causes of commercial success. Exact late-game XP curves, equipment-tier requirements and live market liquidity were not established.

Kintara's documentation is also not a consistent specification. Its current configuration enables free play and email-login infrastructure, while some explanatory copy still describes unconditional token ownership or wallet-only access. The tutorial says the former rotating cosmetic offer was retired, although the Docs still mention rotation. These conflicts matter when selecting which behavior to adapt. [Configuration](https://kintara.com/client-config.js), [tutorial definitions](https://kintara.com/src/game/tutorial/steps.js?v=20260907-mapbtn)

## Why Noobius currently plays itself

The current source confirms the reported behavior. `tycoonObjective()` selects the next machine, upgrade or room, sometimes recommending an efficient intermediate purchase. `Game.executeStep()` can immediately collect or unlock; other steps carry an action along an automatic path. Arrival invokes `interact()`, which executes that stored action before showing the ordinary station interaction.

That combines advice, travel and purchasing in one control. The player can repeatedly press the same card while the controller chooses the route through a finite ladder. The required ladder is only 21 machine purchases, five speed purchases and four room unlocks. Every investment improves the same production engine.

Maximum income reaches 6,804 Compute per minute, compared with the starter's 24. The daily reward remains 35. At the high end, that daily payout contributes almost nothing to the player's purchasing power. New prices alone would extend the elapsed time without adding a different decision.

There is a second, less visible problem. Gathering, crafting, skills, ingredient orders and trading reducers exist, but the tycoon route does not require them. The Workshop hides advanced recipes behind the old `first-light` story claim, while the current Goals screen no longer exposes the old story-claim interface. A fresh player can finish the tycoon without reaching the intended crafting chain. This is a concrete reachability defect, not merely a missing feature.

The NPC merchant also sells finished crafted items. If a new progression gate requires those items but the player can purchase all of them from that merchant, passive income can still bypass the intended activity. Availability and progression requirements must be designed together.

Inspected implementation: [guidance](../lib/tycoon.ts), [game action handling](../components/noobius/Game.tsx), [world arrival handling](../components/noobius/Campus.tsx), [crafting and Goals panels](../components/noobius/FacilityPanels.tsx), [game rules](../lib/facility.ts). Source checkpoint: `ca1b6a8`.

## Translating the elements

The right adaptation preserves the purpose of an element while giving it an original Noobius activity, presentation and place in the world.

| Element to adapt | Proposed Noobius version | Decision it creates |
|---|---|---|
| Shared home town | Crew Commons with Margo, a workbench, storage and a job board | Prepare, socialize or start a job |
| Resource gathering | Salvage scrap, strip wire and recover chips in distinct places | Choose the material and route worth pursuing |
| Skill progression | Salvaging, Building and Fieldwork | Develop abilities that unlock activities, rather than buying every unlock |
| Useful crafting | Turn a few clear materials into boards, kits and equipment | Install the item, deliver it or offer it for sale |
| Tools and equipment | Visible cutters, scanners and repair tools with simple functions | Select useful equipment for the trip |
| Consumables | Batteries or emergency coffee used in optional field activities | Prepare for a tougher job or stay in the safe area |
| Inventory and storage | Backpack for trips, accessible storage at the home base | Decide when to return and what to carry |
| Distinct destinations | Safe salvage yard, chip depot, cooling floor and abandoned wing | Travel because each area offers a different activity or output |
| Dangerous encounters | Malfunctioning drones and obvious environmental hazards | Dodge, time an action, cooperate or leave with what was gathered |
| Quests and dailies | Client orders, NPC story jobs and rotating field objectives | Choose a short session goal with several useful outcomes |
| Player commerce | Crafted parts and materials exchanged for Compute | Specialize and trade with people who chose other activities |
| Housing and collection | The existing personal center, decorations, equipment displays and Locker | Build an identity others can visit |
| Social coordination | Shared areas and cooperative outages with clear individual contributions | Join others without surrendering ownership of the personal center |
| Competitive play | Later, contained skill challenges with visible scores | Add mastery after the basic movement/action game works reliably |

The first release of this direction should keep safe activities rewarding and allow solo completion. Optional danger can lose some unbanked expedition loot or end the current attempt; it should not erase the player's established facility. Exact loss rules require playtesting. A combat-like activity needs readable attack cues, responsive movement and fair recovery before it becomes a progression requirement.

Paid chance games, compulsory token ownership and player-versus-player item loss are not prerequisites for this connected loop. They introduce different product and operating requirements and should be evaluated separately. Kintara's existence does not establish that each of its systems caused engagement.

## The main loop

**Choose a job → explore for parts → make something useful → install, deliver or trade it → earn Compute and skill XP → unlock another choice.**

The home center remains part of the game. Built equipment provides modest background earnings, holds crafted improvements and displays achievements. Active sessions should meaningfully advance goals beyond what simply waiting achieves at the same stage. The passive/active balance must be simulated across early and advanced saves before setting rates.

A material needs more than one purpose. A board might improve a personal machine, complete an NPC delivery or be sold to a player. That choice gives collection a reason to continue even when a particular machine is fully upgraded. Recurring orders consume delivered items; merely moving an item between two players does not consume it.

Start with scrap and wire. Introduce chips when a new area, recipe and job make them useful. Add further materials only alongside a distinct purpose. Display names can stay simple even where internal item IDs remain technical. The game should communicate through short verbs, silhouettes, progress bars and visible results.

### Example first session

1. Margo lends the player a starter tool and points to a nearby salvage pile.
2. The player chooses that pile and performs a short, animated collection action. The backpack shows recognizable scrap and wire icons.
3. At the workbench, the player spends those materials to make a starter component. A before/after picture explains the result.
4. The player installs it in the free starter body. The cabinet lights up; the player receives a visible first achievement.
5. Two jobs become available: make another component for a client, or keep it to improve the personal machine. The reward and required materials are visible before accepting.
6. Completing a chosen job opens the next activity and shows a preview of the new tool or destination.

This sequence is a proposed playtest slice, not a promise of a particular completion time. It should teach collection, crafting, installation and choice without a technical repair lecture. Missing materials should lead to a specific source, not an unexplained disabled button.

### Sessions after the introduction

The job board should offer a small choice of jobs with different outputs and destinations. A player can specialize in gathering, finish a crafted order, attempt an optional field challenge or improve the home center. Skills and collection goals provide progress across those sessions.

The first center can be assembled quickly if that reveals more interesting play. Completing its current machine ladder must not exhaust the meaningful progression. Later goals need new recipes, tool functions, challenge variants and visible collections. A daily reward should suit the stage of progression or offer a useful collectible; its purpose cannot depend on 35 Compute still mattering at maximum income.

Desired pacing should be tested, not asserted: a new player should experience a success within minutes, make a meaningful choice during the first session and still have a new activity or unlock to pursue on a return visit. Longer progression should contain changing decisions rather than repeated waits for a larger price.

## Guidance without automatic completion

The guidance control should show the tracked objective, progress, a destination and a short reason. Its primary action should be **Show on map** or **Track job**. Optional assistance can walk the character to a place, but it must not carry a purchase, craft, delivery or reward claim along that path.

Direct world actions can remain convenient. Choosing a resource may move the character into range and begin the explicitly selected gathering activity. A short repeating animation can be appropriate for that single activity if it is visible and cancellable. It must stop at meaningful boundaries such as an exhausted resource, full backpack, invalid range or player movement. Repetition must not advance through an entire crafting or purchase chain by itself.

At a workbench or upgrade station, the player chooses the item and sees its cost before confirming. A job is completed by delivering its actual requirements. Guidance explains how to do those things; it does not do them.

This requires a structural change: separate the data used for directions from the commands that mutate the economy. Renaming the button or hiding it would leave other action-bearing guidance paths intact.

## Compute and the token layer

Kintara separates ordinary gold trading from token payment. Eligible players can offer gold for another player to purchase with KINS. The seller receives 95%; a buyer is necessary. The Docs' fee-destination explanation differs from the current payment module, which supports multiple quoted fee legs. This is not guaranteed redemption, and no authenticated settlement was performed for this report. [Marketplace documentation](https://kintara.com/#docs-market), [current payment module](https://kintara.com/marketplace-token-wallet.mjs?v=20260905-pfee1)

For Noobius, Compute can remain the familiar game currency. If a player marketplace for Compute is chosen later, its interface should describe a listing, asking price, fee, availability and sale status. It should not imply that typing an amount guarantees a token payout. Exact network, asset, price source, custody and settlement behavior need an explicit implementation specification before that system becomes active.

The immediate game-design requirement is demand: players need reasons to use materials, crafted goods and Compute. New issuance, transfers between players and consumption must be tracked separately. A transfer does not remove inflation, and a larger token community does not automatically supply buyers for in-game output. The current Noobius Exchange remains a preview with no debit, payout request or token transfer.

## A build sequence with clear acceptance

| Stage | Concrete deliverable | Evidence required before moving on |
|---|---|---|
| 1. Player control | Direction-only guide; separate explicit activity and purchase controls; repaired recipe access | Repeated guide clicks cannot buy, craft, deliver, collect or claim; the intended recipes are reachable from a fresh save |
| 2. One connected session | Two starting materials, a workbench, one useful crafted component and two selectable jobs | A fresh player can gather, craft and choose install versus delivery; both choices produce meaningful progress |
| 3. Progression that stays useful | Three simple skill tracks, additional recipes and destinations, meaningful repeatable orders | Buying everything currently visible does not finish every goal; efficient strategies are simulated and actual completion times recorded |
| 4. Shared world | Resource activities and cooperative work in shared areas, with the personal center retained | Two actual clients see consistent outcomes; disconnects, simultaneous claims and visits do not duplicate rewards or expose ownership |
| 5. Mastery and collection | Optional field challenges, tool functions and visible trophies/cosmetics | Players can explain why they chose a challenge and what they want to unlock next |
| 6. External economy | Only the explicitly chosen token-market or funded-reward design | Real wallet/device tests, defined supply and fees, failure recovery, settlement verification and appropriate launch configuration |

The first implementation milestone should prove stages 1 and 2 together. Removing automatic completion without adding a connected activity would leave the same purchases with more friction. Expanding the world before the small loop works would multiply that problem.

Re-use the existing character, camera, Locker, models, art, save infrastructure, gathering/crafting rules and item market where they fit. Existing repair aids are not gathering tools, and dormant power/cooling budget helpers are not currently enforced systems. Each reused component needs reachable UI and consistent server validation.

### Existing player saves

Preserve earned balances, purchased machine levels, outfits, skills, inventory, bank contents, pending crafts and marketplace escrow. Established players should receive appropriate new jobs rather than being forced through the original onboarding again. Existing purchases can remain valid while new progression introduces additional activities.

If passive income changes, settle already accrued output under the previous rules before starting the new rate. Use a versioned progression migration separate from reward history. Do not manufacture old story claims to reveal recipes: those claims can award currency. Update guest-save validation and connected-player migrations deliberately, and test both starting and maximized facilities.

### Player acceptance

Automated checks should protect economy and save invariants. Human sessions must test comprehension, interest and pacing. Record the time to the first self-directed action, first useful craft and first meaningful choice; count stalls and unexplained errors; ask the player what they intend to do next. Test people who have not watched development and provide no coaching during the first attempt.

Completion of this design requires an engaging connected session, not just green regression tests, a large list of features or a longer wait until every upgrade is purchased.

## Sources and evidence scope

- Kintara, [How to Play](https://kintara.com/#how-to-play). Rendered official guide: activity presentation, player instructions and pictured examples.
- Kintara, [Game Documentation](https://kintara.com/#docs). Rendered official reference: documented resource, skill, inventory, world and market relationships; some copy conflicts with current client evidence.
- Kintara, [current tutorial definitions](https://kintara.com/src/game/tutorial/steps.js?v=20260907-mapbtn). Public client-loaded instructions: adaptive material shortages, the bait chain and changed cosmetic guidance. Asset version strings are identifiers, not independently verified publication dates.
- Kintara, [client configuration](https://kintara.com/client-config.js). Public configuration flags; flags do not prove every server-side rule.
- Kintara, [marketplace wallet module](https://kintara.com/marketplace-token-wallet.mjs?v=20260905-pfee1). Public payment construction and quote-dependent fee handling; no transaction executed.
- Kintara, [public spectator mode](https://kintara.com/play?spectate=1). Rendered world observation; not a substitute for a logged-in playthrough or retention analysis.
- Noobius, current source at `ca1b6a8`, particularly `lib/tycoon.ts`, `lib/facility.ts`, `lib/experience.ts`, `components/noobius/Game.tsx`, `Campus.tsx` and `FacilityPanels.tsx`.

External sources were inspected September 8, 2026. Authenticated Kintara gameplay, trading, precise live progression thresholds, retention and successful payment settlement remain unverified. Recommendations in this report are Noobius design proposals, not claims that Kintara implements every proposed mechanism.
