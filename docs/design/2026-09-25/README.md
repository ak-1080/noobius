# Noobius — clearer play, stronger identity

**Owner review · September 25, 2026.** This folder contains the local presentation pass and the active-production prototype. The global font has not been selected or changed. This pass has not been deployed. Existing earnings, balances, accepted jobs, listings and payment obligations are preserved by the migration; new production rules apply only after migration.

Open the [visual review](review.html) for the realm studies, updated interface captures and font choices together.

## What changed in the local first pass

| Area | Before | Local change |
| --- | --- | --- |
| Margo's guidance | A large next-action card made the game feel like a sequence of instructions to click through. | Compact, collapsible Margo portrait and speech bubble. **Mark location** highlights a destination; that control does not walk, open a station or perform work. Extra explanation lives in **More help**. |
| Repeated notifications | Sparkle bonuses and collection celebrations competed with the world. | Routine Compute/bonus/repair collection no longer creates the same large milestone pop-up. Important results remain available in the relevant panel; useful unlocks can still be celebrated. |
| Picture guide | Repeated machine art and some blurry embedded captures made different steps look alike. | Distinct scalable vector artwork for build, upgrade, expansion and repair, with clearer instructional cards. This improves the replaced illustrations; it is not a claim that every historic screenshot has been recreated. |
| Picking up resources | Repeated E presses and an in-flight pickup could make movement or interaction feel jittery. | A synchronous pending-pickup guard prevents repeated/queued E actions during the request, with immediate collecting feedback and movement handling coordinated around the pickup. Final device/network smoothness still needs playtesting. |
| Realm activities | Rules appeared as paragraphs above the task. | Short visual rule strips, recognizable observations, lane-capacity bars and compact progress. Required puzzle rules remain visible. |
| Client jobs | Payment, costs, capacity and longer descriptions were mixed together. | Payment, upfront Compute cost, time and XP are visible together. Material rows show **have / need**. Blocked actions explain the missing machine, slot, capacity, funds or supplies. Detailed terms use expandable sections. |
| Specialties and distinctions | The benefit or next requirement took more reading. | Progress and costs lead; longer benefit explanations open on demand. Existing qualifications, supplies and rewards are preserved. |
| Realm identity | The destinations relied too heavily on a similar visual treatment. | Different industrial structures, floor treatments, landmarks and silhouettes now distinguish the four destinations described below. |

Existing guidance already required purchases and rewards to be confirmed separately before this pass. The new Margo control goes further by making its location help marker-only. Other deliberate navigation tools and direct world-object selection can still assist movement. Neither claim should be confused with changing the economy.

## The four realm directions

| Realm | Visual character | What should be understandable at a glance |
| --- | --- | --- |
| Crew Commons | Cargo yards, loading roads, reclaimed steel and salvage bays | This is where discarded hardware arrives and useful materials are recovered. |
| Cooling Works | Reservoirs, a pipe circuit and pump infrastructure | Follow the cooling system; the activity belongs to a fluid-handling facility. |
| GPU District | Accelerator structures, cable lanes and dense powered equipment | This is a processing campus organized around capacity and connections. |
| Archive Depths | Separated archive islands, vaults and bridge seams | Explore distinct storage structures and restore dependable data. |

**Scope:** this is a new architectural treatment inside the existing navigable footprint. Worksite positions and authoritative collision/navigation boundaries are preserved. These are not four newly enlarged maps. Large new routes, extra activities and changed map geometry require their own design and movement-authority verification.

## Typography study (deferred)

Open the [interactive font lab](font-lab.html) to switch packages in the same Noobius scene. Use the [four-way comparison image](font-comparison.png) for a quick side-by-side view. The preview uses actual font files, rather than an image model's approximation of lettering. It is a nonfunctional design study with sample content.

| Pack | Heading + interface | Character | Best reason to choose it |
| --- | --- | --- | --- |
| **A — Bold Arcade** | Anton + Barlow | Tall, forceful title lettering; clear smaller text | Strongest title-screen presence and a more overt game identity |
| **B — Character Crew** | Lilita One + Nunito Sans | Rounded, friendly and playful | Makes the Noobius character feel central and approachable |
| **C — Control Room** | Chakra Petch + Barlow | Angular, technical lettering | Emphasizes the data-center and equipment theme |
| **D — Night Shift** | Barlow Condensed + Barlow | Compact industrial headings; clean interface text | Strong hierarchy in busy job, inventory and equipment panels |

**Recommended shortlist: A or D.** A gives the homepage more personality; D is the calmer choice across a dense game interface. Keep a readable body face for instructions and prices whichever heading style wins. A custom wordmark can follow the type decision; it should still read as Noobius without relying on a familiar template treatment.

Fortnite is a useful reference for bold hierarchy and character-first presentation. Epic lists Burbank among its available [Creative billboard fonts](https://dev.epicgames.com/documentation/fortnite/using-billboard-devices-in-fortnite-creative); that is not permission to extract Fortnite's font assets. The packages here use locally included open fonts with their licenses, sourced from [Google Fonts](https://github.com/google/fonts). Commercial font use follows its actual license; see [House Industries licensing](https://houseindustries.com/faq).

No package has been applied globally. After selection, review the homepage, Locker, guide, job cards, wallet picker, prices and small-screen text together before adopting it.

## Active-production prototype (implemented locally, not deployed)

The central problem is not that machines take time. It is that continuously collecting automatically generated currency can become a substitute for playing.

The old passive system could accumulate up to roughly one hour of production. A fully upgraded facility produced 476 Compute/minute while repeatedly harvested. Those were previous game rules, not a token value or earnings promise. The local prototype migrates existing centers to finite supplied machine batches and stops new passive accrual. See the [active-play and economy audit](../../research/2026-09-25-active-play-economy.md) for the original baseline and remaining risks.

The recommended loop is:

**Choose a client → gather or buy supplies → make a useful part → assign a machine → explore while it runs → collect/deliver → choose what to fund next.**

1. **Finite supplied jobs — implemented locally.** A machine processes an explicitly selected batch and stops when it is done. Work already committed can finish offline. New work needs another choice and its actual inputs; keeping a tab open cannot automatically start the next batch. A one-time migration preserves previously earned storage and pending rewards.
2. **Spatial gathering — partial.** A resource is still gathered through the existing proximity-validated interaction with cooldown. Short timed tool actions and richer route choices remain future work.
3. **Useful machine choices — partial.** Three machine batch recipes with different supplies, outputs and level requirements now sit beside the existing client work and reservations. Speed upgrades shorten these batches. Further specialization needs real playtests.
4. **Recurring resource use — partial.** Machine batches now consume recovered parts. Existing client inputs, crafted components, realm preparation and facility projects also compete for materials and Compute. Test whether advanced players still want the outputs after buying their machines. Player-to-player transfers alone do not consume resources.
5. **A way forward from zero — implemented locally.** A new or broke player can recover basic inputs through salvage without token ownership or passive waiting. One-time tutorial benefits remain one-time.
6. **Quiet, useful guidance.** Margo tracks what the player chose, with a destination and one clear instruction. After the introduction, offer a few meaningful alternatives instead of selecting the player's entire strategy.

Four existing contracts provide a practical first slice: **Fix the uplink** (`loose-link`), **Clear the cooling path** (`dust-patrol`), **Pack a repair kit** (`kit-order`) and **Run a small model** (`tiny-model`). These are proposed short card treatments for existing templates, not four newly shipped offers. Cards must read actual requirements, duration and payment from the selected quote.

## What the Kintara research supports

Kintara's [official guide](https://kintara.com/#docs-resources) describes equipping a tool, approaching a resource and using its output in connected activities. Its [published guide source](https://kintara.com/site/js/components/docs.js) connects gathering, crafting/cooking, banking, selling and exploration. Its [current gathering constants](https://kintara.com/src/constants.js) include timed mining/chopping and shared resource wear.

The useful adaptation is deliberate work, finite resources and interdependent activities. **Kintara also uses timers.** Public client code does not prove its complete server implementation, bot resistance, retention or economic sustainability. We should copy the useful structural lesson while building original Noobius activities and verifying our own results.

## Protect progress and trading during the change

- Version the production transition and settle already accrued output once. Preserve earned balances, machines, speed purchases, materials, outfits and skills.
- Existing accepted jobs, crafting, recoveries and bonuses retain their promised terms. Rebalancing affects newly offered work.
- Preserve listings, reserved Compute, buyer quotes and payment-recovery obligations. A gameplay migration must not change a signed checkout or duplicate fulfillment.
- Keep guest practice separate from server-owned account value. Test concurrent tabs, reconnects and migration retries.
- Use server time, validated worksite proximity, command identities, guarded balance changes and proportionate rate/eligibility controls. These protect integrity; more clicks and more wallets do not prove more human players.
- Measure currency created, consumed and transferred separately. Review suspicious commercial activity with evidence rather than treating ordinary shared networks or unusual play styles as automatic abuse.

## Completion gates for the next stage

| Stage | Required result before calling it finished |
| --- | --- |
| Local presentation review | Inspect the guide, Margo, each realm, every challenge family and client states. Prices and instructions remain readable; no unnecessary overlay blocks action. Typography selection is deferred. |
| Final code verification | Run the combined branch's relevant tests, typecheck, scoped lint and production build. Record actual results; individual component checks do not substitute for the integrated pass. |
| Active-loop prototype | A fresh player can go from no supplies to useful work without a trap. Leaving only completes already committed jobs. Guide-only clicks cannot spend or earn. |
| Economy/migration validation | Compare fresh and maxed accounts, merchant-input strategies, repeat scripts and realistic active play. Verify old saves, pending work and marketplace reservations survive. |
| Staging acceptance | Exercise the tested build with separate accounts, simultaneous activity, reconnects, recovery and test-token checkout. Production payment settings remain a separate release decision. |
| Phone/browser review | Confirm readable controls, touch movement, pickup feedback, performance and supported wallet handoff on real devices. Avoid claiming smoothness from desktop-only testing. |
| Uncoached return sessions | New and fully upgraded players choose worthwhile work without developer directions, explain the tradeoff and identify a reason to return. Record confusion and idle periods, not only successful completion. |

The finish line remains: **a fully upgraded player has worthwhile decisions, useful work and reasons to interact with others.** An implemented feature list, a longer wait or a working devnet payment alone does not establish that outcome.

## Verification record for this local pass

- The combined local pass passed all 460 game-rule tests, including active-production migration, seller-sale visibility, pickup guarding and movement locking.
- TypeScript and the production build passed. Scoped lint was compared against the same files at HEAD: both report the same 45 pre-existing findings; this pass adds none. New components/helpers are clean.
- Isolated browser guest fixtures verified Margo marking without purchasing/building or opening a panel, collapsible help, four distinct quick-guide images, and guide/client layouts at desktop and 390px widths. See [browser checks](screens/checks.json).
- All four realm challenge families were rendered and inspected at desktop and 390px, including scroll-to-controls checks; no browser errors or horizontal overflow were observed. See [challenge checks](screens/challenge-checks.json).
- Each realm environment was rendered separately to inspect its silhouette and placement. These are artwork checks, not a live multiplayer or phone frame-rate test.
- Hosting, production/staging databases, wallets and token-payment configuration were not changed by this pass.
