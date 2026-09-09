# Supply trips keep their purpose

The workbench now keeps the selected recipe and quantity when players close it, walk to the bench or leave for supplies. These presentation drafts are scoped to the current account during the game session. They do not change inventory, balances, job terms or saved progression, and are not persisted across a hard reload.

“Find missing parts” starts a separate supply plan. The coach recalculates the next missing ingredient from the current backpack and storage, then returns to the originating client job or equipment recipe. Client preparation preserves its machine, equipment and quantity; the returned job appears first. Preparing another job does not replace the saved tracked contract. A visible Cancel control restores ordinary guidance; stopping a walk only stops that route.

Crafting a missing component keeps the parent client or module plan. A large component requirement suggests an explicit bench batch whose ingredients fit, without reducing the client's requested quantity. Finished crafts retain their real pickup ID and quantity. When the final job or explicit recipe inputs exceed the backpack's total capacity, guidance returns to configuration and explains that the player must reduce the batch or expand storage. When storage is needed, surplus parts are preferred over already-required ingredients.

Source jobs that start or disappear and modules that are already built invalidate their preparation plans. A late successful action only clears its own still-current plan. Every economic action still requires a player click and passes through the existing authoritative action handler; walking and opening a menu cannot complete work.

## Validation

- 174 default tests pass, including 11 new supply-plan cases: full quantities and time, capacity splits, banked components, sequential pickups, source-job return, unchanged tracking, stale sources, finished-craft pickup, oversized final quotes, completed modules and surplus storage.
- TypeScript and production build pass. Scoped changed-logic lint is checked separately; repository-wide lint debt remains.
- Browser check on the existing local guest: select 12 Compute boards, follow Find missing parts, reopen Workshop. It retains 12 parts, puts Compute board first, highlights it and shows the full 48 scrap / 36 wire / 36 chips / 96-second quote. The world displays the named supply goal and Cancel control. No currency or supplies were added for this check.

## Remaining audit findings

This pass improves continuity; it does not establish long-term retention. The current shared-project system still permits a player with legitimate banked reports and parts to complete repeated projects without fresh project-linked service or machine work. Commissioning needs actual linked activity and voluntary capacity allocation, while preserving existing earned reports and in-progress project promises.

The coolant pump's legacy utility-budget description is also misleading because those budgets do not constrain current machines. A subsequent material-economy change should give the pump a recurring, visible job use with versioned terms for new contracts, preserving old accepted jobs. Fiber/core currently lack recurring crafting or project use beyond sale. Workload progress and finished fabrication also need clearer in-world machine feedback.

Five-human multiplayer sessions, real wallet extensions, device testing, hosted load/operating costs, backup restoration and return-player evidence remain acceptance work. Real token redemptions and the actual holder asset policy remain separate from repeatable gameplay.
