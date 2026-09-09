# Noobius Neighborhoods — proposed major upgrade

Status: design for review; not implemented. Prepared September 8, 2026. Baseline inspected: `a732ec1`. This plan supersedes the adventure/combat emphasis in the earlier Kintara gameplay blueprint. No gameplay implementation, deployment, token launch or migration is authorized by this document itself.

## Product decision

Build a persistent, social data-center tycoon. Up to five players share a small neighborhood, each with a personally owned center. Gathering, useful crafting, configurable production, renewable contracts and cooperative work form one connected game. A free campus remains playable indefinitely. Holding a configurable amount of $NOOBIUS grants access to additional destinations; earned gameplay qualifications determine readiness for each one.

The test is whether a fully upgraded player still has worthwhile decisions, useful work and reasons to interact with others. More maps, bigger prices, a token gate or an endless counter cannot establish that on their own. Ongoing gameplay and real-token payout funding are separate requirements.

## Reference findings and limits

Kintara distinguishes realm maps from server instances; its documented servers share account inventory and gold. Published rules and current free-play configuration describe free access with a level cap, 1,000-KINS access to further realms, and a 24-hour holding condition for trading. These are documented rules, not a verification of every live endpoint. No four-to-five-player cap or level-based matchmaking was established. Its own sources contain inconsistent free-play wording. Small level-matched neighborhoods are our proposal. [World documentation](https://kintara.com/#docs-world), [access documentation](https://kintara.com/#docs-account), [published configuration](https://kintara.com/client-config.js)

Egg, Inc.'s developer description includes personal production, research, cooperative Contracts and artifact collection/crafting. We can adapt that relationship between private production and shared goals without copying its progression or assuming its mechanics guarantee retention. [Developer listing](https://apps.apple.com/us/app/egg-inc/id993492744)

## 1. World organization

| Concept | Meaning | Persistence |
| --- | --- | --- |
| Realm | A themed destination with its own activities and entry requirements | Content definition |
| Neighborhood | A live instance of a realm, capped at five participants | Session membership; shared projects persisted separately |
| Personal center | An account-owned facility, equipment, appearance and production state | Permanent account save |

The player sees a compact campus plaza with a job board, shared worksite, resource stations and five entrance pads. Each occupied entrance displays its owner's character name and a small facility preview. Entering loads that interior rather than rendering five large factories simultaneously. The interior owner can build and configure equipment; visitors can tour, emote and participate in specifically designated cooperative work. Visiting never grants spending or building rights.

The five-player cap covers the neighborhood and its interiors together. Entering a door does not free a slot for a sixth participant. A single authenticated session owns one membership. Disconnected players get a proposed 60-second reconnect reservation; after that the slot can be reused. Saved centers do not disappear or reset when a neighborhood empties.

Players can change neighborhoods without moving or repurchasing their center. Realm-specific supplies come back to the same center. We do not create a second independent factory grind in every realm for this upgrade. Additional owned centers are a later option only if the first center remains enjoyable.

### Matchmaking and friends

- Prefer a compatible occupied neighborhood, similar progression and low latency before opening another.
- Use soft experience bands within eligible destinations, not one rigid population pool for every level. Provisional bands can be novice, established and advanced; tune from actual concurrency.
- A Join friend option works if the destination has a slot and everyone meets entry rules. Otherwise offer another compatible neighborhood or the common free campus.
- Experienced players can return to help beginners. Tutorial rewards remain account-once; returning does not reissue starter grants.
- Preserve recent neighbors and a simple invite link/code. Elaborate guild administration and permanent neighborhood ownership are later work.
- No fake player counts or NPC copies of Noobius to disguise empty instances. NPCs such as Margo and Patch have distinct designs.
- Empty servers remain playable. No activity required for progression needs four other people online.

## 2. Free game and holder access

The free campus includes the complete basic loop: a useful personal center, renewable work, common materials, crafting, research, visits, shared projects and basic trading after onboarding. It does not stop awarding normal progress after a tutorial or impose a hard account-level cap. Newcomers must experience a good game before deciding whether the additional content interests them.

Recommended advanced access rule:

**Verified qualifying holdings + earned operating license = permission to enter an advanced realm.**

Use **888 $NOOBIUS as a draft parameter**, not a confirmed launch requirement. The chain, contract or mint, decimals, actual availability and access cost must be established first. A fixed token count has a changing acquisition cost. Start with one membership threshold for all holder realms; later realms require higher gameplay qualifications, not 8,888 and then 88,888 tokens. Holding more does not multiply XP, Compute output, group voting power or reward allocation.

The access gate is proof of ownership, not payment or staking. The player retains their tokens; the game must not request an allowance or token transfer merely to check access. Wallet sign-in and a balance query are distinct operations. For an EVM deployment, SIWE establishes wallet ownership and an exact-contract ERC-20 balance query supplies the balance; a different chain requires its corresponding verified adapter. [SIWE standard](https://eips.ethereum.org/EIPS/eip-4361), [ERC-20 standard](https://eips.ethereum.org/EIPS/eip-20)

### Gate experience

Show an actual destination preview: environment, activities, example equipment and both entry conditions. Example launch copy, once the real asset is configured: “GPU District — Operator license + hold 888 $NOOBIUS.” Explain that holding is checked without spending. Users can inspect what interests them before choosing to acquire anything. Do not imply a Nebius partnership, automatic profits or a guaranteed redemption rate.

When the chain/token is unavailable, stage the feature using explicit test entitlements; do not pretend a live gate exists. Long.xyz pairing support and any tokenized NBIS instrument remain separate integration checks, not assumptions built into access control.

### Continued access and changing balances

- Check server-side at entry and before new restricted activities. Authenticate all restricted joins, snapshots and commands; a hidden menu is insufficient.
- Proposed policy: periodic balance recheck around every 60 seconds, with a bounded entitlement cache up to five minutes. Specify supported-chain finality and exact timings before release.
- Below threshold: stop accepting new restricted jobs, notify the player and offer a safe return. Permit one already accepted bounded job to settle under its recorded rules; maximum protected completion window is a tuning decision, not indefinite continued access.
- Never delete the center, earned equipment, outfits, balances or settled rewards. Earned ordinary recipes/equipment remain usable at home; continuing exclusive exploration requires eligibility. Market escrow remains reclaimable.
- RPC failure means verification is unavailable. Give previously verified sessions a bounded grace period and retry; do not falsely label the user as having sold. New unverified premium entry waits for a successful check.
- Record the checked block, amount, policy version and expiry. Reject stale or user-supplied eligibility assertions.
- One wallet/account cannot duplicate an advanced session by opening tabs. Sequentially sharing qualifying tokens between different wallets is possible with a noncustodial holding rule; short rechecks limit overlap but do not prove unique humans.
- Avoid repeatable entry gifts and per-wallet token payout bonuses that make this sharing profitable. A 24-hour holding requirement is not part of the initial proposal.

## 3. Destinations and scope

| Destination | Entry | Distinct play | Delivery |
| --- | --- | --- | --- |
| Crew Commons | Free; no token holdings | Salvage, ordinary client work, first crafting, center development, local cooperation and market | Complete in next upgrade |
| GPU District | Holder access plus an earned Operator license | Configure equipment for different workloads; build useful modules; contribute to client surges | Complete in next upgrade |
| Cooling Gardens | Same holder access plus later qualification | Efficiency, stability and cooling challenges with distinct modules and scenery | Later expansion after two-realm playtest |
| Relay Heights | Same holder access plus later qualification | Networking and coordinated delivery chains | Later expansion |

Two complete destinations are the initial content target. They must differ in decisions and activities, not only floor color and reward size. Later ideas should not be presented as available content. All players retain a private center regardless of which destination they can currently enter.

An Operator license should involve demonstrated play: several contracts across all three job families, one completed module and one commissioning task that can be done solo. Exact counts and XP are balance hypotheses. No raw wallet balance or huge stockpile of Compute substitutes for those activities.

## 4. A session and renewable job board

**Choose a job → source supplies → configure or use the center → finish useful work → collect a recorded reward → choose the next investment or goal.**

Launch with three visible offers and at most two accepted personal contracts. Offers are persistent server records; refreshing a browser or changing a neighborhood cannot freely reroll them. Completing a contract reveals another offer. Unaccepted offers can refresh on a published schedule; all three must include an achievable route for the player's present equipment and access.

| Family | Player activity | Main decision |
| --- | --- | --- |
| Service job | Visit a worksite, diagnose an obvious fault and perform a short repair interaction | Quick income or progress toward a maintenance qualification |
| Supply order | Gather/craft specified components or acquire them through trade | Spend time making goods or spend Compute buying them |
| Client workload | Allocate facility slots and choose a module/loadout to process a job | Fast completion, material efficiency or stability |

Start with approximately 12 authored templates across the three families, with verified variations in ingredients, workload properties and optional challenges. Generating a larger number of identical quantities is not sufficient variety. All offers show expected active effort, production time, inputs and rewards. Ordinary accepted jobs do not expire while a player is asleep. Clearly labeled optional timed challenges can exist later.

Examples: repair a failed switch at a neighboring worksite; craft replacement boards for a client; run a burst workload quickly using a high-power module; choose an efficient configuration for a slower job that consumes fewer supplies. Engineering progress, blueprint fragments and cosmetic goals can make different jobs worthwhile even when Compute rates differ.

Ordinary background production remains a convenient foundation, with a clearly displayed storage limit. Higher-value client work competes for available capacity, so a player cannot assign the same rack to every contract while also claiming all its full baseline output. The UI must show that opportunity cost before accepting/assigning work. No recurring manual collect-every-few-seconds obligation.

## 5. Facility choices and mastery

Start with three module styles: **Fast**, **Efficient**, and **Stable**. Use two module slots and clear bars/icons rather than a technical engineering dashboard. Explain effects in plain language: finishes sooner, uses fewer parts, handles unstable jobs. Power and cooling constraints should be introduced only when they create a visible decision; they should not become unexplained blockers.

The equipment platform stays recognizable. Upgrades add capability, but a maxed machine does not perform every specialization simultaneously. Switching loadout is affordable, reversible and previewed before confirmation. Single-slot jobs cannot use the same machine concurrently. Modules do not permanently punish experimentation.

Skills/research open recipes, tools and specializations through relevant activity. Keep the initial three families understandable: Salvaging, Building and Operations. Use server-confirmed activity progress, not client-reported XP. Large old balances may help purchase inputs, but cannot instantly award mastery or completed qualifications.

At maximum equipment levels, players can still fill contracts, optimize different workloads, complete cooperative projects, collect blueprints, decorate their center and specialize in supplying others. Collections provide finite milestones inside an ongoing loop; they are not falsely described as infinite authored content. New authored templates remain part of ongoing game operations.

No required prestige resets, destructive offline breakdowns, upkeep debt or daily streak loss in this upgrade. Optional later challenge facilities would preserve the main center and explain exactly what resets.

## 6. Materials, Compute and trading

Begin with three existing-compatible raw materials, such as scrap, wire and chips, plus three components mapped onto existing item IDs where practical. Every new component needs at least two meaningful uses among contracts, modules and shared projects. Introduce one material first; do not teach six inventory types before the first win.

| Creates currency/items | Removes currency/items | Transfers only |
| --- | --- | --- |
| Gather yields, client rewards, background production, bounded project rewards | Fabrication fees, NPC supply purchases, module fabrication, delivered components, optional tuning/decor purchases | Player item sales for Compute |

Track sources and sinks by progression level. Trading does not remove inflation merely because ownership changes. Do not force losses to claim that the economy supports unlimited token withdrawals. Real Compute-to-$NOOBIUS conversion remains a distinct future system with funding, eligibility, settlement and abuse requirements.

Give common material gathering an account-scoped cooldown/yield budget across neighborhoods, with personal claimable yields or ample replenishment. A veteran must not monopolize all starter resources, and server hopping must not reset a player's resource allowance or offers.

NPC merchants provide predictable basic fallback supplies so a quiet market never blocks the tutorial. They should not sell every finished advanced component and thereby bypass all crafting. Avoid unlimited NPC resale loops. Offers must allow self-sourcing within accessible destinations.

### Market scope

Use one searchable, paginated item market across neighborhoods, with optional filtering by item and accessible use. A nearby player can create an offer addressed to a neighbor, but it goes through the same escrow and settlement rules. Start with Compute-for-items; arbitrary item-for-item barter and real-token exchange are deferred.

Players see exact quantity, price and total before acceptance. Items are escrowed when listed; buyer debit, seller credit and item transfer settle once. Updating an offer invalidates any previous acceptance. Cancellation returns goods once. No trading secrets or signatures through chat. Free authenticated accounts can trade after completing a small server-validated onboarding qualification; token holding is not required for ordinary item trade in this proposal.

Trade supplies across progression stages: advanced recipes can consume common components, and an established player can buy them to save time. Free players also have their own satisfying projects; their only role must not become harvesting supplies for holders. Purchased gear remains subject to earned use qualifications where appropriate.

## 7. Cooperation in a small population

Deliver one full shared-project family first: commission or restore a neighborhood cluster. It combines component delivery, a short service interaction and voluntarily assigned workload capacity. Add client surges and cooling-event variants only after the common contribution/reward system works.

The project scales its required work for one to five participants at a defined start point. It remains solo-completable. Do not multiply the reward pool just because an idle alt joins. Track useful contributions with limits per task, and make the reward rules visible before participation. Joining at the end without work does not earn a full payout.

Persist project IDs, contributions and reward claims independently of the live room process. A disconnect, neighborhood closure or service restart cannot discard delivered items or duplicate compensation. If a participant leaves, remaining players can finish; any accepted contributor reward remains claimable under the stated completion rule. Failed optional challenges need explicit consumption/refund rules before launch.

Incidents are optional contracts or shared challenges. They do not randomly destroy a player's investment or confiscate overnight earnings. Show advance warning, a clear repair action and an observable result: alarm stops, fans start, racks turn green and a durable reward receipt appears.

Start social communication with contextual pings, emotes and short neighborhood-scoped messages. Provide mute, block, report, spam limits and name filtering. Full global chat and voice are outside this upgrade.

## 8. Onboarding and interface

Preserve the cinematic landing page, original Noobius identity, fullscreen world, scroll zoom and large dynamic Locker. Preserve readable names and distinct NPCs. Show the few current neighbors in a compact expandable panel rather than covering the scene with cards.

Flow: customize → short picture slides → meet Margo → claim center/free starter → gather one material → craft one component → choose between two jobs → finish and collect → choose the next goal. Introduce an optional neighbor visit or joint project afterward. Each step must work with no other players online. First activity target: about two minutes; first meaningful choice: five to eight minutes; first complete contract session: ten to fifteen minutes. These are hypotheses for playtesting, not finished balancing.

“Next up” becomes a tracked objective containing a destination, missing items and an explanation. It must have no embedded economy command. Navigation may move the character, but arrival opens an interaction rather than purchasing or claiming. Clicking a resource can still move there and start that explicitly chosen gathering action. Explicit build/craft/claim actions remain clear and economical in clicks.

Use a small primary dock: Jobs, Center, Crew, Locker; put the market near Jobs or at a clear world station. Show Compute and the current objective, with other materials only when relevant. Return summaries should be brief and dismissible, with production ready, current work and one useful suggestion. Wallet eligibility language appears when relevant to saving, social identity or an advanced gate, not at every step.

For initial multiplayer, a free account can mean a signed-in wallet with zero required token holdings. Existing guest practice remains an immediate solo option. Guest-to-account onboarding must explain the current save behavior and cannot import untrusted client currency. Email/passkey onboarding would be a separate auth implementation if later chosen.

## 9. Existing foundations and technical gaps

The present code has wallet-owned facilities, server sessions, guarded economy updates, three fixed shared campuses, polling-based presence, sanitized visits, cooperative station leases and an escrow item market. These are reusable foundations, not evidence that the proposed design is complete.

| Current area | Required work |
| --- | --- |
| `lib/multiplayer.ts`, `Game.tsx` | Replace fixed three-room routing and 30-person cap with five-player admission, realm catalog, matchmaking and reconnect membership |
| `lib/server.ts` | Keep authoritative ownership/economy; add eligibility, permanent contract records and durable reward ledger |
| `Campus.tsx`, navigation helpers | Separate navigation from mutations; enforce plausible movement and interaction reach server-side |
| `lib/facility.ts`, `FacilityPanels.tsx` | Repair advanced recipe reachability; replace obsolete story gating with new progression without awarding duplicate old claims |
| `lib/tycoon.ts`, objectives | Introduce workloads, capacity allocation, specialization and player-selected objectives |
| Market endpoints/UI | Preserve atomic escrow; add pagination, useful filters, progression rules and neighbor-addressed offers |
| Wallet/session code | Add exact-token entitlement adapter; verify real supported wallet flows before launch |

Current position reports are bounded but not sufficient proof of travel, and personal gathering does not establish server-verified proximity. These matter when activities produce shared-economy rewards. The existing last-100-request replay cache also cannot be the sole protection for permanent contract settlements.

### Proposed hosting architecture

Use a lightweight authoritative neighborhood coordinator with WebSockets for membership, movement and shared activity. Keep persistent ownership, inventory, Compute, offers and settlements in the durable economy service. One possible implementation is a Cloudflare Durable Object per neighborhood plus D1 for durable economy records. Cloudflare documents multiplayer-style WebSocket coordination and hibernation; this does not establish that the current Sites deployment exposes the necessary bindings. [Official WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

The first technical milestone must prove deployment support. If current hosting cannot provide the coordinator, configure a separate compatible service with short-lived server-issued join tickets. Keep a single economy authority and explicit service authentication; do not create two independent balances. Do not assume changing the existing `.openai/hosting.json` will provision unsupported services.

Five players per neighborhood does not mean renting a physical server for every five people. It also does not make total traffic free. Avoid persisting every animation/position frame to D1; keep ephemeral movement in the coordinator, save durable actions, and calculate production from authoritative elapsed timestamps. Measure active instance time, messages, DB operations and video bandwidth before choosing a launch concurrency cap or estimating hosting cost.

New record concepts: stable player/center IDs, realm catalog/version, neighborhood membership and resume ticket, persisted contract offer/run, workload slot reservation, shared-project contribution, reward settlement, balance entitlement snapshot and market receipt. Opaque IDs replace truncated-wallet home identifiers. All secret/RPC credentials remain server-side.

Completion is durable: coordinator produces an idempotent reward intent, the economy service settles it once, then clients receive the committed receipt. Retry after a restart must recover the same result. Movement intent, item costs, work duration and success conditions are validated server-side rather than trusting a browser success flag.

## 10. Save and economy migration

Do not wipe existing centers, bought upgrades, inventory, outfits, banked items, skill progress or market escrow. Add a separate progression schema/version and stable identity mapping. Previously bought rooms remain owned space, not retroactive token-gated purchases.

Before changing production, settle accrued output under the previous rules. Then apply documented new rates/capacity behavior. Preserve existing Compute balances; openly recognize that veteran savings create an advantage in purchases. New activity qualifications and specialized capacity choices must prevent those savings from completing the new progression instantly.

Current maximum passive output is 6,804 Compute/minute, so contract pricing cannot be designed in isolation. Simulate fresh, middle, maxed and unusually wealthy accounts; test actual source/sink ratios, workload opportunity costs and material availability. Do not silently hide legacy money in an unusable balance to claim preservation. If a fair competitive seasonal economy is later desired, make it an explicitly separate opt-in mode rather than resetting personal ownership.

Update strict guest-save parsing deliberately. A guest practice balance is not authoritative multiplayer money. Preserve valid saved practice progress, but do not introduce a client-controlled import exploit. Version migrations and reward claims separately, and test a migration twice to prove it does not mint rewards again.

## 11. Build sequence and completion gates

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| A. Infrastructure proof | Five authenticated players, one neighborhood, durable centers, reconnect and one persisted shared action | Deployed staging transport works; sixth join handled atomically; restart/retry preserves one settlement |
| B. Connected free loop | Direction-only guide, reachable crafting, three contract families, renewable offers, capacity choice | Fresh and maxed saves both complete useful 20-minute sessions without auto-play or a terminal purchase checklist |
| C. Social economy | Center visits, one cooperative family, cross-neighborhood item market, friend join and basic moderation | Two-client ownership/escrow tests and five-person activity run; solo fallback works |
| D. Advanced destination | GPU District with distinct workload/module decisions and earned license | Clearly different decisions and useful return travel, not only higher prices |
| E. Holder verification | Configurable access policy, real supported wallet/chain adapter, safe expiration/retry | Boundary balances and account changes tested; no forged access; test entitlements isolated from production |
| F. Public-readiness review | Migration rehearsal, backups/restore, monitoring, admin controls, performance and user testing | Agreed technical and gameplay acceptance passes; deliberate public rollout decision |

GitHub branches/PRs should correspond to these coherent stages. Check cloud setup work before making incompatible infrastructure changes. Do not have cloud and desktop tasks edit the same branch simultaneously. This planning task makes no game changes and does not start the prior proposed cloud migration.

### Technical acceptance

- Five participants admitted; six simultaneous requests cannot overbook. Interiors still count toward the same cap.
- One account's repeated tabs/reconnects never duplicate its avatar, grants or active job slots.
- A modified client cannot teleport to claim work, ignore material costs, replay old settlement IDs or bypass a holder gate with a direct request.
- Two buyers competing for one listing yield exactly one trade. Disconnect/cancel/retry returns the correct item/currency state.
- Visitors cannot build in another person's center or read private balances/inventory through a tour response.
- Shared contributions, pending crafts and settled rewards survive server restart and resume correctly.
- Holdings below/equal/above threshold, token decimals, wrong chain, wrong contract, wallet switch, RPC failure and entitlement expiry produce the defined outcome.
- Existing guest and wallet saves migrate once and retain the promised possessions. Old room ownership is retained.
- Run five real browser sessions for 45–60 minutes, including visits, trade, a joint job and disconnects. Also load-test multiple full neighborhoods; single-room success is not a concurrency result.
- Provisional staging load target: ten populated neighborhoods / 50 concurrent clients, then test above the intended initial cap. Set actual public capacity from measured results, not this draft number.
- Desktop and phone acceptance covers readable instructions, wheel/touch controls, Locker, empty/error/loading states, reduced motion and the full first contract. Budget mobile scene work for a stable playable frame rate on a declared test device.

### Gameplay acceptance and tuning

- At least eight of ten new testers can explain their goal and finish the first contract without verbal coaching; treat this small sample as an early usability gate, not statistical proof.
- At twenty minutes, each tested account has at least three achievable useful next goals with different benefits.
- A fully upgraded player can explain two sensible loadout/contract strategies and play for twenty minutes without merely repeating the same automatic purchase.
- Solo and two-player sessions progress at quiet hours. Five-player cooperation adds convenience or interesting division of work without punishing absences.
- Look for one dominant contract/loadout, unused materials, NPC arbitrage, long idle stalls and a free realm made obsolete by holder rewards.
- Observe multiple sessions over at least a week. Ask why people returned, what they planned next and whether they returned only because they expected token payment. Record voluntary returns; do not manufacture a retention claim from automated tests.

## 12. Launch dependencies, operations and deferred scope

Before live token gating: exact supported chain, token identifier, decimals, confirmed holding threshold, RPC access and actual wallet coverage. No seed phrase or custody is required. Before broader public multiplayer: verified hosting capability, owner-controlled credentials/budget, staging/production separation, backup restore, abuse reporting, incident controls and an initial supported-device/concurrency scope.

Operators need feature switches to pause new shared jobs, trading or new advanced admission independently without losing player possessions. Record error rates, failed saves, repeated claims, entitlement outages, market settlement failures and concurrency. Preview video delivery and static assets need caching as well as game-server monitoring.

Preserve the established UI and character; put effort into cause-and-effect feedback: player working animation, machine loading/progress, repaired rack lighting, visitor arrival, contributions visible at the shared build and rewards shown after durable save. Fancy animation is not a substitute for those actions working.

Deferred: additional full realms, multiple owned centers, forced prestige, combat/PvP, gambling, guild banks, voice chat, arbitrary barter, automated cross-wallet reward farming and live Compute-to-token payouts. These are not necessary for the next coherent upgrade. Optional future seasons should add challenges and cosmetics while preserving the permanent center.

Recommended decision package: **five-player neighborhoods; account-owned centers; soft level matching; global item market; a complete repeatable free campus; one additional campus; one provisional holding threshold plus earned qualifications; no live token settlement in this gameplay upgrade.** Evaluate the quality through actual repeat sessions and multiplayer behavior before describing the game as complete.
