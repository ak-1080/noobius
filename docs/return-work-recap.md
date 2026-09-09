# Returning to useful work

September 9, 2026. This increment implements the upgrade plan's short return-session recap: stored production, current work and one useful next suggestion. It adds no currency source, payout rule, migration or new activity.

## Behavior

The previous summary required at least one minute of passive output. A machine assigned to client work could therefore finish a paid job while producing no idle Compute, leaving the returning player with no recap. The new summary includes ready and accepted client jobs, service steps, crafted batches, machine bonuses and recorded crew assignments. Ready items appear first. The first three updates are visible; additional updates are expandable.

Each row opens the existing review screen with the exact job ID or recipe, quantity and recipe variant. It cannot accept, finish or collect that work. The separate Collect Compute and Collect daily bonus buttons remain explicit economic actions. When away from the player's own center, the Compute button instead returns home and opens Production; collection still waits for another click. No payment is promised for a crew assignment until its shared project is complete and the reward can be claimed.

A next suggestion is drawn from the existing career goals. It opens job choices, equipment or a project; it cannot spend, equip or accept automatically. The ordinary tracked-job objective now also carries its exact job ID so the relevant accepted card appears first.

The recap captures eligibility once per entry from the title screen and waits for identity, the player's own neighborhood membership and a clear interface. The membership-slot check rejects a previous wallet's snapshot even when both players are neighbors. A first-time player does not receive a return popup merely because onboarding or a minute of production finished during play. Reconnects do not reopen a dismissed recap, while a new entry from the title screen can summarize newly completed work.

## Verification

All 303 default tests passed. New coverage includes real game actions that finish a client workload and craft with zero idle Compute; service steps that never auto-complete from elapsed time; recovered-batch navigation; crew-assignment status; previous-wallet readiness; initial join, other open menus, first-time onboarding, reconnect and repeated title-screen entry. Read-only recap checks leave original saves and unclaimed work unchanged.

The production build, TypeScript and scoped lint for the new recap component, hook and core logic passed. Repository-wide lint still has existing issues. Hook tests execute the production hook in an in-memory effect harness; they do not establish full multiplayer-browser acceptance.

The existing local guest recap retained 20,267 spendable and 206,640 stored Compute. Its next-goal button opened the expected supply job with zero jobs accepted. A temporary isolated UI fixture rendered the real recap with a ready client job and repair kit, verified exact review destinations and a 350px-wide card, and reported no browser errors. That narrow layout check is not physical-phone acceptance. The fixture was removed before production packaging. No real guest collection, purchase or craft was performed during these checks.

Hosted coordinator activation, actual multi-browser cooperation, human return-session playtests and the public release gates remain open. A clearer recap is not evidence of retention by itself.

## Private release

Site version 45 deployed successfully at `2026-09-09T11:31:38Z`, source `ce942fbcfbfcd280775c1672d978f29bca07ba0a`. Saved version: `appgprj_6a9ef8b4a03c8191a7e106551d030528~appgver_4578ccff4920819184a7083714f8942f`; deployment: `appgdep_6aa1438e94b48191ace5c7e69ef27a0e`. Archive hash: `sha256:3c8e24a9cf9fdb5fc933e868bc77ade684d884dfa199c63f5638df220176568d` (165 files, 33,484,800 uncompressed bytes). Owner-private access and environment revision zero remained unchanged; no database migration ran. The temporary UI fixture was verified absent from source and packaged JavaScript/JSON.

Hosted verification showed the new recap and next-goal link, retaining 880,287 spendable and 408,240 stored Compute. No collection or spending was performed. There were no browser error entries after this deployment; the earlier local fixture-removal HMR warning was excluded by timestamp.
