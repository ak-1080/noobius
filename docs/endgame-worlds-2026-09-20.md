# Noobius: distinct worlds and a continuing endgame

This pass adds four spatially different realm maps, four different activity systems, competing client commissions, certifications and repeatable facility distinctions. It changes the game checkout, not the separate `coming-soon/` website. No production deployment, token launch or funded payout system is included.

## What players do

Build a center, earn levels, explore for supplies, choose a customer and reserve a machine. While a client batch runs, explore a realm, solve its station problem or prepare crafted materials. Collect the payment, develop a specialty and complete a facility distinction. The next distinction needs a fresh portfolio of work; the machines, outfits, certifications and past distinctions remain.

### Four worlds

| World                             | Layout and landmarks                                                           | Player activity                                                                           | Stations and useful rewards                                                        |
| --------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Crew Commons / Reclaim Yards      | Branching salvage docks, shipping containers and cranes                        | Read heat and connection condition; reuse, strip or quarantine each part                  | Scrap wharf → scrap/wire; Wire exchange → wire; Component line → repair kit        |
| Cooling Works / Cooling Circuit   | A wide industrial ring with side platforms, cooling tanks and fans             | Rotate pipe segments to connect inlet to outlet; visible coolant flow helps diagnose gaps | Intake gardens → coolant; Heat exchanger → larger coolant yield; Pump house → pump |
| GPU District / Accelerator Campus | Three accelerator lanes linked by cross-aisles, rack towers and chip landmarks | Assign live and flexible jobs to two limited-capacity queues                              | Inference hall → chips/fiber; Batch foundry → fiber; Chip laboratory → chips       |
| Archive Depths / Memory Islands   | Separate archive platforms connected by narrow bridges, orbital vaults         | Select the newest complete checkpoint for the requested model                             | Snapshot vault → cores/board; Mirror chamber → boards; Cold archive → cores        |

Each map has three physical workstations, a shared arrival area and the existing five private-center entrances. A district minimap shows the player and numbered stations. Selecting a station opens its costs and walking route. The renderer and both movement authorities use the same floor manifest. Private-center maps remain separate.

These are four distinct compact game worlds, not four enormous content-rich MMOs. The activity generators vary parts, pipe layouts, job order/capacity and snapshot candidates. Random generation begins with a valid solution; saved activity validation rejects unsolvable or mismatched challenges. Repeated play remains constrained by these four activity families and the available content pool.

New recoveries require physical proximity to a current-realm station and verified earned-level/access requirements. The player chooses balanced, deep or quick recovery. Inputs and rewards freeze on commitment; wrong answers cost no extra supplies. Already-paid work can be solved and collected after leaving the realm. Claims go to Storage, including with a full backpack. Existing paid recoveries from the earlier diagnostic system remain finishable.

### Competing clients

The Clients desk presents three different fictional customers with Throughput, Resourceful and Reliability requests. Six customer themes rotate: a video studio, small-model collective, mapping lab, meme-traffic forecaster, on-device assistant service and grid-demand coordinator. A board advances only after a paid booking; refreshing the page does not reroll it.

There are two client slots shared with the existing Repair & parts jobs. A player selects a machine and batch size. The desk shows payment, inputs, operating cost, processing time, capacity and estimated idle output forgone. Reserved machines cannot also process another client, bonus or crew-project run. Their paused output is accounted for, while other machines keep earning. Terms remain frozen even if demand, certifications, utilities or balance rules later change. Payments never expire offline.

One specialty has high demand on each board. Its per-unit premium is visible and frozen at booking. Demand rotates across all three specialties. This creates a reason to prepare different supplies rather than always use one setup. The premiums only affect simulated Compute.

### Specialization

Three certifications per specialty require 3, 8 and 18 delivered commissions respectively, plus crafted parts and 500 / 2,000 / 6,000 Compute. Each branch keeps its own earned records.

- Throughput: 90-second base runs; each certification reduces duration by another 10%. Extra copper supports the speed. Power upgrades add capacity.
- Resourceful: 135-second runs, fewer raw materials, and three extra batch slots per certification. Useful for conserving stock or making a smaller rack useful.
- Reliability: 130-second runs with boards and coolant, premium payments, reduced coolant use as certifications improve. Cooling upgrades add capacity.

Quoted payment includes demand and is stored per run. Requests identify the expected certification tier so an old replay cannot silently purchase a later, more expensive tier.

### Recurring facility distinctions

A distinction needs all of the following:

- 3 fresh commissions initially, increasing to a maximum of 8 per distinction.
- At least two different specialties.
- One new Commons recovery and one new Cooling/GPU/Archive recovery.
- Repair kits, compute boards, a pump and a Compute contribution starting at 1,800 and increasing by 1,200 per distinction.

The Commons + Cooling route is fully free to access once earned levels unlock Cooling Works. Holder-only destinations are alternatives, not a requirement for this loop.

Commissioning a distinction pays 60 XP, lights a permanent monument in the private center and advances its visible number. Up to three halo rings accumulate around the monument; its number continues beyond those visual tiers. Visitors receive only the public distinction count, not private client records. Each new distinction records new baselines, so accumulated money or old completions cannot instantly complete the next portfolio. Nothing is reset or taken away for absence.

This is a repeatable progression structure, not proof of infinite novelty or retention. Human sessions must establish whether its choices remain fun after repetition.

## Reliability and compatibility

- Existing facility schema/concurrency versions retain their meanings. New optional ledgers are independently versioned.
- Accepted commission IDs are separate from network request IDs; accepted quote data survives reloads.
- Claim IDs and expected certification/milestone stages prevent replay after request-history eviction.
- Facility compare-and-swap still arbitrates simultaneous actions. Authenticated actions retain existing ownership and realm guards.
- Old saves load without new ledgers. New corrupt ledgers, impossible puzzles and conflicting reservations fail closed rather than silently granting rewards.
- A completed, uncollected machine bonus may share its rack with a later commission; only overlapping processing intervals conflict.
- Ready payments and recoveries appear in the return summary and guidance. Active client bookings have machine labels, progress and ready status.
- Commission income counts toward daily Compute earnings. The client desk links to the daily bonus and the older hands-on job system.

## Verification recorded for this pass

Automated checks cover:

- Every station approach from each realm spawn, valid floor connectivity and authority-approved movement.
- 100 generated challenges per realm, solution validity and varied inputs.
- Frozen prices, stale offers, overlapping machines, capacity, malformed quantities, two shared client slots, early/double claims and resource costs.
- Certifications, specialization tradeoffs, milestones and two complete free-world endgame portfolios from a fully upgraded save.
- All 48 equal-certification/demand/fee-scale combinations on the largest rack: the favored specialty has the strongest modeled net Compute/minute after purchased inputs, operating costs and quoted idle loss.
- Guest serialization, old paid diagnostics, completed bonus coexistence, return summaries and machine indicators.
- Real local HTTP sessions: exact worksite/access enforcement, malformed input, concurrent field starts/claims and competing commission starts/claims.

An initial local HTTP run encountered an SQLite lock in the development request-rate ledger. A repeat passed. This is local test evidence, not evidence of production load capacity.

Browser verification and final check totals are recorded at the end of this document. Browser sessions use an isolated IPv6 development origin and disposable test saves, not the user's localhost progress.

## Real-world inspiration, used as fiction

The game uses recognizable operational tradeoffs, without claiming to operate real compute or represent real partner services:

- Separating latency-sensitive requests from batch work: [NVIDIA Dynamo disaggregated serving](https://docs.dynamo.nvidia.com/dynamo/v1.4.1/kubernetes/disaggregated-serving/overview).
- Liquid-cooling loops and heat recovery: [NVIDIA on liquid cooling for AI factories](https://blogs.nvidia.com/blog/liquid-cooling-ai-factories/).
- Flexible computing windows: [Google on data-center demand flexibility](https://blog.google/innovation-and-ai/infrastructure-and-cloud/global-network/how-were-making-data-centers-more-flexible-to-benefit-power-grids/).
- Complete checkpoints and durable recovery: [PyTorch asynchronous distributed checkpoint recipe](https://docs.pytorch.org/tutorials/recipes/distributed_async_checkpoint_recipe.html).
- Efficient on-device inference: [Google Research on Gemini Nano acceleration](https://research.google/blog/accelerating-gemini-nano-models-on-pixel-with-frozen-multi-token-prediction/).

See `research/game-architecture-2026-09-20.md` for earlier Kintara, multiplayer, hosting, storage and trading research. This pass does not change the distinction between gameplay Compute and real $NOOBIUS trades.

## Uncoached human playtest — required before claiming retention

These sessions have **not** been performed by humans in this pass. Automated agents and the developer's own browser checks cannot substitute for them.

Recruit five people unfamiliar with this build, including at least two casual/meme-coin players and one phone user. Use practice mode only. Do not explain solutions or point to buttons. Record the screen with each participant's permission; alternatively take timestamped notes. Explain only: “You run this data center. Explore and decide what to do next.”

### Session A: fresh player, 15–20 minutes

Use an empty practice save. Observe whether the player can name the currency, build and collect, find their first job and identify a next goal. Record first independent action, time to first payment, every abandoned panel and any request for explanation. Do not hand over an upgraded fixture until this session is recorded.

### Session B: mature player, 35–45 minutes

Provide a maxed center with enough supplies to begin, but no pre-earned client certification or distinction records. Let the player choose a first customer, then ask “What else can you do while that runs?” Observe discovery of the worlds and station map. Ask them to try two realm activities, deliberately retry once, reload during a run, and collect payment/recovery. Ask “What would you spend these resources on next?”

### Session C: actual return, next day

Use the same save. Observe the return summary, collection and next booking without explanation. Ask the player to complete their distinction and identify how the next portfolio differs. Then offer ten minutes of entirely free play. Record what they choose, and whether the next specialty/realm/material goal is understood.

### Acceptance gates

- At least 4/5 can explain Compute, client payment and the next personal goal without prompting.
- At least 4/5 complete a client booking and two different activity types without a coached solution.
- At least 4/5 correctly explain why they chose a client/setup, rather than just clicking the first option.
- No progress loss, duplicate payout, unrecoverable reservation or unreachable required station.
- Every fully upgraded player can identify at least two worthwhile next actions.
- At least 3/5 voluntarily continue the free-play segment and can name a concrete reason to return.

Log failures as comprehension, mechanics, navigation, pacing, economy or reliability. Fix the top blockers and rerun the relevant session with new participants. These small-sample gates guide iteration; they do not establish long-term retention or economic sustainability.

## Final verification results

- Default rules/persistence/navigation suite: **369 passed, 0 failed**. The new endgame suite contributes 15 tests, including all realm approach routes, 400 solvable generated activities, 48 economy comparisons, two successive maxed-center portfolios, and new-client trading qualification.
- TypeScript: passed. Focused lint on the new economy, realms, activities, navigation, guidance and integration tests: passed.
- Real local HTTP realm and client suites: passed; the transient development SQLite lock noted above remains a production concurrency follow-up.
- Browser: fresh name/look/slides → first objective; mature client booking → reload → one-time payment; physical travel to Cooling and GPU stations; incorrect pipe retry without repeat cost → correct plan → reload → Storage claim; valid live/flexible GPU scheduling; permanent distinction earned → fresh next portfolio → reload retained. Existing player saves were not reset.
- Desktop and 390 × 844 layouts checked. GPU landmarks, minimap and permanent home monument inspected visually. Fan/chip/vault effects and the distinct world geometry also received code and route checks; this is not a claim of a human playtest in every world.
- Returning-player guidance now follows the current endgame objective. Processing fieldwork no longer hides a ready legacy payment. A ready distinction opens its checklist unless an existing client payment needs collection first.
- The temporary fixture/setup route was removed. No development-only save controls ship with the game.
- Production Worker/browser build: passed using the prescribed Sites build script. Vite still reports a browser chunk above 500 kB; mobile startup/performance remains a release check. No public deployment, token transaction or production hosting change was performed.
