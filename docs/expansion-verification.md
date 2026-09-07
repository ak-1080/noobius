# Campus expansion verification — September 7, 2026

Private preview iteration following the three-job v1. This is development evidence, not approval of the public-launch checklist.

## Completed checks

- 21 automated rule/handshake/navigation tests pass. New coverage includes empty starter inventory, the first gather→craft→build chain, timed crafting, one-time story/daily claims, UTC daily reset, locked departments, utility budgets, malformed quantities, backpack capacity, overflow bank behavior, merchant spread, and fractional energy regeneration during frequent actions.
- Local D1 campus API test passes: three independently signed accounts, single escrow removal under duplicate listing creation, two competing buyers (one winner), foreign cancellation rejection, purchase versus cancellation (one winner), crafting/claim retry idempotency, bank persistence after reconnect, fractional-coordinate presence, and invalid input rejection.
- Original real API regression passes: nonce/signature/authentication/CSRF/account isolation, 20 simultaneous submissions per repair, exactly one 100-credit/100-XP full-shift award, exactly one set of repair supplies, and concurrent equipment purchase limits.
- Read-only progression review reached all seven departments and 21 rack levels using gatherable/craftable ingredients, with maintenance credits assumed available. Opening the Hot Zone now explicitly requires GPU Foundry, matching the physical route.
- All 175 spawn-to-object paths were generated. The heap-based planner measured median 1.03ms, p95 4.02ms, maximum 17.32ms in a local simulation. Exact waypoint snapping resolves a floating-point boundary stall; the same simulation with that fix reached all targets at both 60fps and 20fps (350 checks). These are desktop simulation measurements, not a mobile frame-rate claim.

## Browser checks

The new guided first session was completed through its actual controls: guided movement to salvage, credit claims, gathering the kit ingredients, five-second fabrication, collection, first-rack installation, and the 115-credit total after the three introductory contracts. Thermal Gardens unlocked for 100 credits and department travel worked. Wheel zoom visibly changes the camera. The new reference-inspired avatar was inspected close-up. The 390×844 map, gameplay HUD, and travel controls were inspected; the temporary viewport override was reset. No browser console errors were present after these checks.

## Remaining launch evidence

No production load test, audited economic ledger, adversarial bot resistance, real extension UI/device matrix, real-time authoritative multiplayer, moderation backend, or financial payout validation is claimed. API tests ran against local D1 with generated accounts and no chain transactions. Detailed owners, dependencies, acceptance tests, and launch gates are in `public-launch-plan.md`.
