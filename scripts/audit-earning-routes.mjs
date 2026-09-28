// Deterministic local rule/price audit. No hosted calls or mutations.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_COMPUTE_JOBS,
  ITEMS,
  SHOP_ITEMS,
  RECIPES,
  ORDERS,
  STORY,
  DAILY_TASKS,
  OBJECTS,
  recipeFor,
} from '../lib/facility.ts';
import { FIELD_APPROACHES, fieldQuote } from '../lib/realm-operations.ts';
import { EARNING_POLICY } from '../lib/earning-policy.ts';
import { CLIENT_DEMAND } from '../lib/client-demand.ts';
const raw = new Set(SHOP_ITEMS);
function purchaseCost(bag) {
  let total = 0;
  for (const [item, n] of Object.entries(bag)) {
    if (raw.has(item)) total += ITEMS[item].buy * n;
    else {
      const recipe = RECIPES.find((r) => r.id === item);
      if (!recipe) return null; // Requires recovery or a player seller.
      const cost = purchaseCost(recipe.cost);
      if (cost === null) return null;
      total += cost * n;
    }
  }
  return total;
}
export function auditEarningRoutes() {
  const npcCycles = [
    ...SHOP_ITEMS.map((id) => ({
      route: 'buy/sell ' + id,
      input: ITEMS[id].buy,
      output: ITEMS[id].sell,
    })),
    ...RECIPES.map((recipe) => ({
      route: 'buy/craft/sell ' + recipe.id,
      input: purchaseCost(recipe.cost),
      output: ITEMS[recipe.id].sell,
    })),
    ...ACTIVE_COMPUTE_JOBS.map((batch) => ({
      route: 'buy/batch ' + batch.id,
      input: purchaseCost(batch.cost),
      output: batch.reward,
    })),
    ...ORDERS.map((order) => ({
      route: 'buy/deliver ' + order.id,
      input: purchaseCost(order.cost),
      output: order.reward,
    })),
    {
      route: 'buy/recovered-board/sell',
      input: purchaseCost(recipeFor('board', 'recovered').cost),
      output: ITEMS.board.sell,
    },
  ].map((cycle) => ({
    ...cycle,
    net: cycle.input === null ? null : cycle.output - cycle.input,
  }));
  assert.ok(
    npcCycles.every((cycle) => cycle.net === null || cycle.net < 0),
    'An unlimited buy/craft/NPC-sell route must never profit',
  );
  const field = ['commons', 'thermal', 'gpu', 'core'].flatMap((realm) =>
    FIELD_APPROACHES.flatMap(({ id: approach }) =>
      Array.from({ length: 3 }, (_, site) => {
        const quote = fieldQuote(realm, approach, site);
        const recoveredValue = Object.entries(quote.reward).reduce(
          (sum, [item, n]) => sum + ITEMS[item].sell * n,
          0,
        );
        return {
          realm,
          approach,
          site,
          seconds: quote.seconds,
          computeCost: quote.compute,
          inputs: quote.cost,
          output: quote.reward,
          recoveryPoints: recoveredValue,
          directNpcNet:
            recoveredValue - quote.compute - (purchaseCost(quote.cost) ?? 0),
        };
      }),
    ),
  );
  return {
    version: 1,
    policy: EARNING_POLICY,
    clientDemand: CLIENT_DEMAND,
    note: 'Budgets govern new commitments and extraction in a rolling window, not a maximum existing balance or daily collection amount. Delayed and grandfathered promises remain payable. This is not a financial forecast or evidence of human identity.',
    routes: [
      {
        route: 'NPC jobs / specialist commissions / legacy deliveries',
        guard:
          'per-account 12-start/4,000 client demand plus linked-pool 6,000 aggregate issuance; payments reserved at start',
      },
      {
        route: 'supplied machine batches',
        guard:
          'finite inputs and 6,000 issuance; full reward reserved at start',
      },
      {
        route: 'salvage nodes / realm recoveries',
        guard:
          '600 recovery-value points; nodes charged before item grant, field returns reserved at start',
      },
      {
        route: 'legacy repair shifts',
        guard:
          'four starts; reserve 145 Compute and 14 recovery points per shift',
      },
      {
        route: 'outage repair / NPC item sales',
        guard: '6,000 shared issuance before credit',
      },
      {
        route: 'crew station / crew completion / project claims',
        guard:
          'station payment reserved at start; other rewards atomically budgeted before collection, pending entitlement preserved',
      },
      {
        route: 'story / daily tasks / workday bonus',
        guard:
          'existing once-only checks plus shared issuance; no reset through midnight',
      },
      {
        route: 'item marketplace / Compute-token settlement / listing refunds',
        guard:
          'existing escrow conservation and once-only settlement; these transfers do not create new Compute or recovery',
      },
      {
        route:
          'old currency migration / frozen passive output / already-started promises',
        guard:
          'one-time migration and existing claim state; preserve earned value, no fresh v3 passive accrual',
      },
    ],
    npcCycles,
    salvage: OBJECTS.filter((n) => n.kind === 'node').map((node) => ({
      id: node.id,
      item: node.item,
      baseAmount: node.amount,
      maxSkillAmount: node.amount + 2,
      cooldownMs: node.hazard ? 45000 : 15000,
      recoveryPointsAtMaxSkill: (node.amount + 2) * ITEMS[node.item].sell,
    })),
    field,
    fixedRewards: {
      storyTotal: STORY.reduce((sum, s) => sum + s.credits, 0),
      dailyTasksTotal: DAILY_TASKS.reduce((sum, d) => sum + d.cr, 0),
      diagnosticShiftMax: 145,
      diagnosticShiftsPerWindow: 4,
      diagnosticShiftMaxComputePerPool: 580,
    },
    abuseControls: {
      browser:
        'Server-issued opaque cookie; first wallet enrollment persists its pool. Linked wallets share every earning/extraction/shift counter. New device does not detach an enrolled wallet.',
      network:
        'Salted IPv4 or IPv6 /64 signup throttle only; independent browser budgets stay separate. Twenty new accounts per network and three per browser per rolling day.',
      limits:
        'Fresh browsers plus other networks, pre-existing independent wallets, automated play inside limits, coordinated market abuse and human identity remain unresolved. Turnstile is documented as a later layer and is not enabled by this change.',
    },
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  console.log(JSON.stringify(auditEarningRoutes(), null, 2));
