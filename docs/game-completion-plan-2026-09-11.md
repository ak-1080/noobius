# Noobius gameplay completion plan

Status: accepted for execution, September 11, 2026. The first frontend gameplay pass is implemented; see `gameplay-pass-2026-09-11.md` for changes, evidence, and remaining work. Backend rules, hosting changes and deployment remain outside this pass. The full gameplay-completion checklist below is not yet satisfied.

Baseline: game commit `614231f43b3373df3f07e6c73904e768bc835738`, also GitHub main at review time. The separate noobius.io coming-soon site is outside this work. Preserve the game, existing characters/art, saves, purchases, inventories, pending work, and earned rewards.

## What complete means

Build an understandable data-center tycoon with hands-on activities and a repeatable career. A player can finish the tutorial and eventually own every machine, but still has useful jobs, competing uses for supplies/capacity, personal challenges, and reasons to return. New sessions should not require the developer to write a new quest each day.

Completion test: a fully upgraded player can explain at least two worthwhile next actions, choose between them for a reason, complete useful work, and identify another goal afterward. The solo game must satisfy this test with nobody else online. Social cooperation and trading should add choices when other people are available.

This is gameplay sustainability. It is separate from funding real token payouts. Renewable systems do not create infinitely varied authored content or prove retention. Ongoing tuning and occasional content releases will still be necessary.

## Evidence and current gaps

This pass reviewed source and existing verification notes, plus current publicly served Kintara documentation/tutorial definitions. It did not conduct a new authenticated Kintara session or a fresh Noobius browser playthrough. Listed usability/pacing concerns are hypotheses until the audit sessions below establish them. Older September 8 plans describe flaws that subsequent releases already fixed; they must not become a duplicate implementation checklist.

| Area | Existing foundation | Improvement to investigate |
| --- | --- | --- |
| Player control | Guidance points to activities; economic actions require explicit player input. | Verify every guide path still teaches rather than makes decisions for the player. Do not rebuild this separation. |
| Onboarding | Naming, Locker, illustrated slides, Margo and starter machine. | Check whether the first independent job and reason for doing it are clear after the slides. |
| Work | Twelve renewable templates in repair, supply and computing families. | Identify which templates feel different in play, not only in their descriptions. |
| Capacity | Batch size, machine selection and three module styles change costs/time. | The board maintains one offer per family, including one computing offer. Multiple computing jobs cannot currently compete for capacity. Large stocked batches remain the obvious money choice in some conditions. |
| Progression | Machines, speed upgrades, operating qualifications, mastery stamps, center colors and trophy. | Purchases and collections are finite. Show a useful post-completion career, and check whether rewards change player behavior. |
| Shared projects | Repeatable commissioning, material/report contributions and specialist variants. | Make requirements, stages and outcomes understandable. Ensure solo completion and availability are adequate; do not depend on a populated market. |
| Economy | Materials are used in crafts, jobs and projects; Compute buys useful things. | Map items/currency that become irrelevant after upgrades, repeated best-profit routes, and shortage recovery. |
| Return experience | Saved output and a work-aware return recap. | Verify the recap offers a specific desirable decision rather than merely reporting a larger balance. |
| Presentation | Original character, fullscreen world, zoom, NPCs, effects and large Locker. | Audit interaction feedback, world readability, empty walking, animation transitions and competing panels. |

Source anchors: `lib/contracts.ts` (templates, offers, modules, qualification and mastery), `lib/job-choices.ts` (suggested goals), `components/noobius/JobsPanel.tsx` (job presentation), and `docs/batch-economy-upgrade.md` (existing capacity analysis).

The prior batch-economy simulation stretched one passive purchase route to about 177 minutes. It is neither an optimal-player estimate nor proof that those minutes are enjoyable. Extending prices and timers is not the completion criterion.

## What to learn from Kintara

The current official documentation describes gathering, skill development, preparation, construction, distinct destinations, storage and trade sharing a persistent character. Its tutorial teaches a concrete chain: get a feather, exchange it for bait, fish, and visit the cooking station. When the player lacks a required item, guidance returns them to the source of that item.

Design inference for Noobius: activities should have outputs the player wants for several purposes. For example, salvaged materials become a board; that board can improve a machine, fill a customer order, or contribute to a cluster. Gathering remains useful after the first craft because later activities still consume the result.

Use Kintara's connected activities and staged teaching as references. Its combat, death losses, gambling, exact token gates and map structure are not requirements for a data-center game. Public documentation alone does not establish that Kintara has unlimited retention or a sustainably funded token economy.

Sources checked September 11:

- [Kintara official documentation](https://kintara.com/#docs), also its [public documentation module](https://kintara.com/site/js/components/docs.js).
- [Kintara tutorial definitions](https://kintara.com/src/game/tutorial/steps.js?v=20260907-mapbtn). The query string is an asset identifier, not proof of publication date.
- Existing Noobius research: `docs/kintara-gameplay-blueprint.md`. Use its historical observations with the current source checkpoint above.

## The intended player experience

**Choose a goal → gather or acquire supplies → repair, craft or run a job → collect a visible result → choose how to use it.**

The data center is the home base, and Compute is the only money term players need to learn. Parts and job reports are items/proof of work, not more currencies to introduce on the first screen.

| Session | Desired experience | Evidence to collect |
| --- | --- | --- |
| First 5–10 minutes | Customize, meet Margo, perform a visible useful action, and understand Compute. | Time to first independent action; unexplained terms; requests for help. |
| First 20–30 minutes | Choose between useful work and an investment; see the effect of one choice. | What options the player considered and why; time spent waiting or walking. |
| Established player | Choose a project or specialization, plan inputs and use available machines. | Whether preparation changes their plan; whether more than one route feels worthwhile. |
| All upgrades owned | Work toward a challenge, project, mastery goal or cosmetic while making capacity/material decisions. | Two useful next actions; a reason to choose one; no mandatory reset. |
| Return after a break | Recognize saved progress and decide what to do next quickly. | Time to resume a self-chosen goal; whether they understand what finished while away. |

These session durations are design targets to test, not artificial waiting requirements.

## Prioritized improvements

### P0 — Make one complete, clear session

1. Audit the existing journey before changing it. Mark moments of confusion, excess clicks, empty movement, blocked inventory, unclear rewards and dead ends with a reproduction and screenshot when conducting the later browser audit.
2. Teach only the current action. The highlighted destination, interaction prompt and objective text must agree. Opening a menu should not dismiss useful guidance before the player understands the next step.
3. Make the first choice tangible: use a crafted part for your own center or deliver it for another reward. Show both outcomes and let the player choose.
4. Give every job the same readable summary: **Do this / Need this / Takes this long / Get this**. Put detailed terms behind inspection. Keep descriptive character dialogue short.
5. Give missing requirements a recovery action: find parts, clear storage, switch machine, finish existing work, or choose another achievable job. A stalled optional goal must not lock the whole game.

Acceptance: a fresh uncoached player can finish a job, describe what they earned, and choose the next goal. Repeated clicks on guidance cannot spend, craft, collect, or claim for them.

### P0 — Give the established center real choices

1. Keep Fast/Efficient/Stable and make their trade-offs visible before confirmation. Show time and supply differences in player language.
2. Prototype competing computing offers for established players. Preserve the small board and current work limits initially; test allowing two computing jobs to occupy separate machines instead of forcing one active computing family. This is a proposed rule change, not already implemented behavior.
3. Use readable job conditions such as short turnaround, limited supplied chips, or stability requirements to make different loadouts useful. Prefer authored combinations with known achievable inputs.
4. Preview the cost of allocating a machine to one task. A player should be able to explain why they used a smaller batch or reserved their best machine.
5. Keep all accepted ordinary work safe to resume after a break. Optional challenges can have clearly disclosed time limits; ordinary progress should not be confiscated while offline.

Acceptance: at least three realistic resource/capacity situations produce different sensible choices. Buying the maximum quantity is not always the best answer. A newcomer and an established player each have achievable work.

### P0 — Make the career continue after purchases

1. Reuse repeatable cluster projects as longer goals with visible stages: **Supply → Repair → Run → Finish**. A project should show its current stage and the player's contribution.
2. Surface a small menu of goals: make money, master a setup, finish a project, or earn a specific appearance reward. Allow one pinned goal and retain it across sessions.
3. Make qualification and mastery rewards legible: show what a new stamp/license actually unlocks. Give demonstrated proficiency a role beyond a larger counter.
4. Add optional replayable challenge records using the existing jobs: fewer parts, a different permitted module, or completing a sequence within an active-session target. Specify rewards that do not depend on being the richest player.
5. Maintain a finite, clearly visible collection of outfits, center decorations and trophies. When that collection is complete, projects and challenges still function; do not claim endless cosmetics.

Acceptance: test both an all-machines-owned save and an all-upgrades-and-current-collections-owned save. Both can perform useful work and identify a next goal without resetting progress. A solo player can complete the core career.

### P1 — Make the work feel satisfying

1. Repairs show the full action: approach, tool animation, fault changing, successful test, rack online. Ensure the reward appears after the successful action.
2. Gathering shows the resource entering inventory; crafting has clear start/running/ready/collected states. Cancellation and full-storage states should remain understandable.
3. Give each NPC a consistent job: Margo guides work, Bit handles supplies, Patch handles engineering. Use their existing identities instead of adding more explanatory characters.
4. Improve existing areas with recognizable activity landmarks, useful nearby stations, purposeful props and less empty travel. Preserve fullscreen play and scroll zoom.
5. Add restrained ambient life and optional outage jobs using existing systems: warning lights, fans, sparks or a worker reaction. Completed incidents visibly resolve. They do not randomly destroy personal equipment or take offline earnings.
6. Celebrate the important milestones and let routine actions stay quick. Sound remains optional, with reduced-motion alternatives.

Acceptance: a tester can tell what happened and whether it succeeded before reading a long explanation. No overlapping coach/dialog/reward panels obstruct the next action; movement and interaction state changes feel consistent.

### P1 — Make resources and return sessions stay useful

1. Build a simple source/use map for every material, crafted item, report and Compute. Check early, middle and fully upgraded play separately.
2. Prefer several recurring uses for common materials in jobs/projects. Do not add currencies or mandatory repair taxes just to drain balances.
3. Compare active-job returns, input costs, idle production, fabrication time and capacity. Tune dominant or pointless routes using evidence; preserve already-earned balances and accepted job terms.
4. Keep predictable starter supplies available with no other players online. Player trade adds a time-saving option; it must not be required to escape a beginner dead end.
5. Return recap should identify completed work, current project progress and the pinned goal. Offer a useful action immediately without auto-collecting.
6. Optional daily/weekly job mixes can suggest variety. Do not erase progress for missing a day, require a streak, or hide the only worthwhile activity behind a timer.

Acceptance: returning after hours or days leaves a clear next decision. A full wallet, backpack or machine collection does not make all activities irrelevant. Simulations can explain sources/uses; real sessions determine whether the resulting play is enjoyable.

## Example veteran session

You return to a completed batch and an unfinished cluster. The cluster needs a board and an engineering report. Margo also has a quick render order. You could use your large rack with Fast to finish the order sooner, or run a smaller Efficient batch and keep chips for the cluster. You choose the smaller batch, gather materials and craft the board while it runs, then complete the cluster stage. The work advances a visible center decoration goal. Your next choice is a different setup challenge or another project.

With neighbors online, you might buy the board from one or contribute alongside another. With nobody online, supplies and the project remain attainable. Multiplayer changes the options; it does not supply the entire reason to play.

## Build order after this plan is accepted

| Pass | Deliverable | Exit condition |
| --- | --- | --- |
| 1. Playthrough audit | Fresh, mid-career and fully upgraded session notes; ranked issues tied to actual screens/actions. | A short reproducible list separating bugs, clarity, pacing and missing decisions. |
| 2. Complete first session | Fix P0 instruction/recovery issues; improve the first real choice and reward feedback. | Uncoached first-session acceptance. |
| 3. Complete established play | Competing jobs/capacity prototype, understandable project stages, pinned goals and mastery presentation. | Different viable decisions under different circumstances; useful play after all purchases. |
| 4. Presentation and economy | World/action polish, item-use audit, balance changes and return flow. | No empty essential activity; no required population to progress; satisfying action feedback. |
| 5. Playtest and trim | Longer sessions with the intended audience; fix, simplify or remove weak additions. | The gameplay acceptance checklist below passes in observed sessions. |

Reuse the current game instead of starting again. Every proposed addition must identify the decision, useful outcome or clarity problem it improves. If it only adds another menu, counter or wait, defer it. Do not count a feature as complete merely because its controls render.

Backend hosting, deployment, WebSocket rollout, wallet transport expansion, token payouts and token access configuration remain outside these passes. If a proposed gameplay implementation needs a persistent rule/schema change, identify that dependency before building it; this plan does not authorize backend changes. Use clearly labeled isolated development fixtures for design evaluation, never fake public players or live payouts.

## Gameplay acceptance checklist

- [ ] Fresh players can explain the loop and finish the first job without verbal coaching.
- [ ] Every important action has a clear cost, result, feedback state and recovery from missing requirements.
- [ ] The guide never completes economic decisions for the player.
- [ ] New, mid-career and veteran players each have at least two worthwhile goals available.
- [ ] Fully upgraded players make a resource/capacity decision and have useful follow-up work.
- [ ] The same setup/job is not the best choice in every tested situation.
- [ ] Completed collections do not stop renewable jobs, projects or optional challenges.
- [ ] Solo sessions are viable without player listings or another person being online.
- [ ] The social design adds an understandable benefit; final real-player acceptance remains deferred until hosting work is authorized.
- [ ] Existing saves and accepted work retain their earned/promised value.
- [ ] Returning players can resume a self-chosen goal without replaying onboarding.
- [ ] Required gameplay remains interesting when external token payouts are unavailable.
- [ ] Ordinary sessions have no unresolved flow, camera, interaction or obstructive UI defects.

Run an initial formative study with roughly five people unfamiliar with development, including meme-coin traders who do not normally play management games. Test fresh and established saves, a 20–30-minute first session, a longer veteran session, and a return session. Record stalls, time spent doing/waiting/walking, the choices made, and the player's stated next goal. Ask what they would do next and why, rather than only whether they liked it.

Initial targets: four of five can explain the loop and finish a first job within about ten minutes without coaching; each veteran tester identifies two useful next actions; returning testers can resume a goal within about a minute. Observe voluntary return where possible. These small-sample targets guide iteration, not claims of statistically proven retention or a 100/100 game.

Call this version gameplay-complete when the checklist is supported by actual play sessions and remaining issues are minor polish. Then separately revisit multiplayer deployment, public operations and real P2E settlement.
