# Earned levels and repeatable realm work

> Historical first-pass record. The shared-layout limitation below is superseded by [the distinct-worlds and endgame upgrade](endgame-worlds-2026-09-20.md).

Implementation date: 20 September 2026. Companion to the [research and production plan](research/game-architecture-2026-09-20.md). This pass changes the local game. It does not publish a build, alter the public coming-soon site, launch a token or enable real-token settlement.

## Player experience

The HUD shows a single earned player level and opens Worlds. Worlds shows XP toward the next level, each destination's activity and its entry requirements. Player level is `1 + floor(sqrt(XP / 50))`; total XP needed for level L is `50 × (L − 1)²`. Existing account XP is preserved and determines the displayed level. There is no new XP reset or maximum level. Career reputation remains its own progression, labeled **Reputation tier** rather than another player level.

| Realm          | Entry                                                        | Repeatable work             | Balanced recovery                                                    |
| -------------- | ------------------------------------------------------------ | --------------------------- | -------------------------------------------------------------------- |
| Crew Commons   | Level 1; free                                                | Reconnect retired circuits  | 35 seconds, 4 scrap + 2 wire, 12 XP                                  |
| Cooling Works  | Level 3 (200 XP); free                                       | Balance cooling supply      | 20 Compute + 2 scrap; 50 seconds, 8 coolant, 20 XP                   |
| GPU District   | Level 5 (800 XP), Operator license, verified holder access   | Reproduce a boot sequence   | 45 Compute + 2 wire; 65 seconds, 6 chips + 2 fiber, 30 XP            |
| Archive Depths | Level 8 (2,450 XP), Operator license, verified holder access | Reconnect isolated archives | 80 Compute + 2 chips + 2 fiber; 80 seconds, 2 cores + 1 board, 40 XP |

All displayed times begin after a successful diagnostic. A short initial read/check delay precedes it. Parts go to Storage, so a full backpack cannot block earned results. Each run awards both player XP and its catalogued specialist-skill XP. The in-world destinations have different visual accents, descriptive workstations, resource outputs and associated shared-project options. They retain the same bounded neighborhood layout and existing three diagnostic families.

At the field station, the player selects an approach:

- **Balanced:** regular supplies, time and output.
- **Deep recovery:** extra Compute, 1.65× processing time and twice the recovered parts.
- **Quick pass:** two extra wire and 0.65× processing time, rounded up; regular parts.

The XP award is identical between approaches. These choices affect time and supplies; they do not buy extra XP per completed run. Faster processing can still raise XP per unit of time, so balance must be evaluated with the rest of the economy.

The explicit loop is **visit a realm → walk to its station → commit supplies → solve a diagnostic → work elsewhere while it processes → collect → use, craft or trade the parts**. The UI shows costs and results before committing. A failed diagnostic permits a retry after four seconds without another charge. Paid diagnostics are available on the player's terminal anywhere. An unfinished diagnostic can be explicitly abandoned without a refund; a processing recovery must be collected. One recovery can be active per player. The panel tracks completed recoveries and first-attempt clean runs in each realm.

The five-slide introduction now includes earned levels and Worlds. The guide uses current machine, capacity and boost constants. The next-action guide remains a navigation aid; it does not execute the recovery or claim rewards for the player.

## Access and save rules

`lib/realm-catalog.ts` is the shared source for realm names, earned-level gates, specialties and access requirements. Holdings grant an entitlement; they never create XP. This pass does not configure a token address, chain or approved holding threshold. The user's example of 10,000 tokens is not hardcoded. Live holder destinations stay closed without valid configured proof. The present holdings adapter is EVM-only; Solana play/login already exists, but Solana holder verification is separate work if that is the selected token chain.

Solo practice keeps earned-level gates and clearly identifies its holder-world preview. It bypasses holder/license requirements to allow exploration without a live token. Guest saves are browser-local and cannot be imported as transferable account value.

Existing licensed GPU memberships predate the new level gate. Their current room session can continue until departure; new admission or rejoining requires level 5. This compatibility rule preserves ongoing membership/project access without granting account XP. Old centers, balances, inventory, cosmetics and projects are retained.

Facility JSON gains an optional versioned `fieldWork` record. Old saves without it remain valid; no SQL migration is required. Active-run terms are frozen when work starts: realm, approach, input bags, Compute cost, output bags, XP, duration and puzzle. Reloading or a later tuning change does not rewrite an accepted run. Unknown versions, malformed puzzles and impossible processing clocks fail validation rather than silently replacing saved work.

Realm access is required to **start** protected work. An owned, already-paid diagnostic or processing result remains finishable/claimable after leaving the realm, leaving the neighborhood, changing scenes or losing holder access. This keeps rewards reachable without weakening new-work admission.

## Authority and replay protection

The server reads account XP and current membership; request JSON cannot supply a higher level or another realm. Earned-level checks guard the actual SQL admission write as well as the preflight response. Shared-realm write authority enumerates valid free and holder realm IDs, so an unknown ID is not a free-access escape.

Starting work requires the authoritative shared field-station location, current control and applicable worksite proof. Paid terminal answers and claims operate against the authenticated player's owned facility with the existing conditional state/version update. They do not require renewed realm eligibility or active neighborhood membership.

Each run receives a server-generated UUID independent of the command's retry ID. Old answers and claims cannot target a new run when the bounded command history expires. Existing request receipts and facility compare-and-swap updates protect simultaneous starts/claims. Inventory deduction, Compute spending, active-run state, bank delivery and account XP commit through the existing authoritative action path. A button disabling itself is not the protection.

These checks are correctness controls. Puzzles are visible to the browser and automatable. This is not proof of bot resistance, financial-grade issuance or readiness to pay real tokens.

## Verification

- Default rules/persistence/navigation/room regression suite: **354 tests passed**, including **11 new realm progression tests**.
- TypeScript and focused lint of the new source/test files: passed.
- Production build: passed. The existing large-JavaScript-chunk warning remains performance work; the temporary fixture route is absent from the build.
- New local HTTP API suite: passed against randomly generated test-wallet identities. It checks spoofed levels/realms, malformed payloads, required physical location, concurrent start requests, real processing time, answering from home, leaving membership, simultaneous claim requests and exactly-once XP/material delivery.
- Browser: completed Cooling Works and Archive Depths recoveries with actual UI diagnostic input. Verified quoted costs, processing, Storage delivery, XP changes and records. Reloaded during an active recovery, returned to home and collected it. A full backpack did not block bank rewards.
- Responsive browser check: desktop and a 390-pixel-wide embedded viewport; Worlds and recovery cards remained readable, stacked appropriately and had no horizontal overflow. This is viewport evidence, not a physical-phone or wallet-extension acceptance test.
- Test saves used a separate browser origin; the user's normal localhost save was not reset. The temporary development-only fixture route was removed.

Commands:

```sh
npm test
npm run typecheck
NOOBIUS_TEST_ORIGIN=http://localhost:3002 npm run test:realms-api
npm run build
```

API tests mutate only local generated identities and are not production probes. They need a running local server with the existing migrations applied. The real-time processing test takes approximately 42 seconds. Repository-wide lint debt is tracked separately; a successful build or the focused new-file lint check does not clear it.

## Remaining game and production work

This is a repeatable realm foundation, not a completed MMO or a claim of infinite unique content. Current realm unlocks end at level 8 while earned levels continue. The realm activities reuse existing diagnostic types. Their costs, rates and output quantities are initial tuning values, not playtest-proven balance. Field records are progress feedback, not a full prestige/season system.

The next gameplay pass should prioritize competing client orders that consume different mixes of machine capacity and materials, explicit reservation/expiry rules, and useful recurring Compute spending for mature centers. Simulate both fastest progression and ordinary player behavior. Resolve exposed utility benefits that no longer affect production. Test whether the new recovery supply overwhelms gathering/crafting or makes one approach strictly best. Then test fresh, fully upgraded and returning players without coaching; measure voluntary choices and repeat sessions.

The existing five-player neighborhood, visits, internal material escrow and shared-project systems remain. This pass expands realm admission and activity integration; it does not turn the hosted HTTP polling path into proven live WebSocket multiplayer. The local Durable Object room coordinator needs owner-controlled staging, private service ingress, hosted wallet/device tests, load measurements and recovery drills before release. The research report specifies the proposed storage/runtime architecture and delivery sequence.

Real Compute-for-$NOOBIUS sales require another player willing to buy, an authoritative Compute reservation and a separately verified token payment/delivery/refund ledger. No real-token transfer, custody, quote, withdrawal or guaranteed exchange rate is implemented here. Free-world multiplayer staging can happen before a token launch; holder access and token trading have their own later gates.
