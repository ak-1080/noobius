// Local, deterministic economy diagnostics. No network, saves, or wallets.
// Idealized timing deliberately excludes walking, API latency and other work.
import { pathToFileURL } from 'node:url';
import {
  ACTIVE_COMPUTE_JOBS,
  ITEMS,
  SHOP_ITEMS,
  RECIPES,
  applyFacility,
  activeBatchSeconds,
  newActiveFacility,
  normalizeFacility,
  storedComputeNow,
  workloadCapacity,
} from '../lib/facility.ts';
import {
  CONTRACT_TEMPLATES,
  contractQuote,
  contractFor,
  newCareer,
} from '../lib/contracts.ts';

const start = Date.UTC(2026, 8, 28);
const hour = 3600000;
const styles = ['standard', 'fast', 'efficient', 'stable'];
const raw = new Set(SHOP_ITEMS);

function fixture(advanced) {
  const f = newActiveFacility(start);
  f.builds = advanced
    ? Object.fromEntries(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => [`rack-${id}`, 3]),
      )
    : { 'rack-a': 1 };
  f.storage = advanced ? 5 : 0;
  f.computeBoost = advanced ? 5 : 0;
  if (advanced) {
    f.unlocked = [
      'commons',
      'salvage',
      'workshop',
      'thermal',
      'compute',
      'network',
      'core',
    ];
    f.skills.engineering = 10000;
  }
  f.career = newCareer(f);
  if (advanced) {
    f.career.completed = { service: 100, supply: 100, workload: 100 };
    f.career.modules = ['fast', 'efficient', 'stable'];
    f.career.loadout = ['fast', 'efficient'];
  }
  return f;
}

function inputCost(cost) {
  let compute = 0,
    craftingSeconds = 0;
  for (const [item, count] of Object.entries(cost)) {
    if (raw.has(item)) compute += ITEMS[item].buy * count;
    else {
      const recipe = RECIPES.find((r) => r.id === item);
      if (!recipe) throw Error(`No NPC route for ${item}`);
      const inputs = inputCost(recipe.cost);
      compute += inputs.compute * count;
      craftingSeconds += (recipe.seconds + inputs.craftingSeconds) * count;
    }
  }
  return { compute, craftingSeconds };
}

function runner(advanced) {
  let facility = fixture(advanced),
    now = start,
    sequence = 0;
  const initialCompute = advanced ? 100000 : 1000;
  let credits = initialCompute,
    actions = 0,
    spent = 0,
    earned = 0;
  const purchased = {},
    completed = {};
  function act(type, extra = {}) {
    const result = applyFacility(
      facility,
      {
        type,
        requestId: `economy-audit-${++sequence}`,
        ...extra,
      },
      credits,
      now,
    );
    facility = result.facility;
    credits += result.credits;
    spent += Math.max(0, -result.credits);
    earned += Math.max(0, result.credits);
    actions++;
    return result;
  }
  function procure(item, count) {
    const needed = count - (facility.inventory[item] ?? 0);
    if (needed <= 0) return;
    if (raw.has(item)) {
      for (let left = needed; left > 0; left -= 50) {
        const quantity = Math.min(50, left);
        act('buy', { item, quantity });
        purchased[item] = (purchased[item] ?? 0) + quantity;
      }
    } else {
      const recipe = RECIPES.find((r) => r.id === item);
      for (const [input, n] of Object.entries(recipe.cost))
        procure(input, n * needed);
      act('craft', { id: item, quantity: needed });
      now = facility.craft.readyAt;
      act('collect', { id: facility.craft.id });
    }
  }
  function repeatWorkloads() {
    while (now < start + hour) {
      const offer = facility.career.offers.find(
        (o) => contractFor(o).family === 'workload',
      );
      const template = contractFor(offer);
      const rack = advanced ? 'rack-g' : 'rack-a';
      const quantity = Math.min(30, workloadCapacity(facility, rack));
      const choices = (advanced ? styles : ['standard'])
        .map((style) => {
          const quote = contractQuote(
            facility,
            template,
            style,
            rack,
            now,
            quantity,
            2,
          );
          const inputs = inputCost(quote.cost);
          return {
            style,
            quote,
            ...inputs,
            rate:
              (quote.reward - inputs.compute) /
              (quote.duration + inputs.craftingSeconds),
          };
        })
        .sort((a, b) => b.rate - a.rate);
      const best = choices[0];
      if (
        now + (best.quote.duration + best.craftingSeconds) * 1000 >
        start + hour
      )
        break;
      if (best.compute > credits)
        throw Error('Scenario ran out of buying capital');
      // Craft parts first so raw job inputs do not occupy the crafting backpack.
      for (const [item, count] of Object.entries(best.quote.cost).sort(
        ([a], [b]) => Number(raw.has(a)) - Number(raw.has(b)),
      ))
        procure(item, count);
      if (
        best.style !== 'standard' &&
        !facility.career.loadout.includes(best.style)
      )
        act('module-equip', { id: best.style });
      act('contract-accept', { id: offer.id });
      act('contract-start', {
        id: offer.id,
        rack,
        quantity,
        direction: best.style,
      });
      now = facility.career.active.find((r) => r.id === offer.id).readyAt;
      act('contract-claim', { id: offer.id });
      completed[template.id] = (completed[template.id] ?? 0) + 1;
    }
    return {
      tier: advanced
        ? 'fully upgraded, all client qualifications'
        : 'starter rack, no modules',
      initialCompute,
      finalCompute: credits,
      netCompute: credits - initialCompute,
      earnedCompute: earned,
      spentCompute: spent,
      actions,
      completedJobs: Object.values(completed).reduce((a, b) => a + b, 0),
      completed,
      purchased,
      elapsedSeconds: (now - start) / 1000,
      pendingWork: facility.career.active.length,
      remainingInventory: facility.inventory,
    };
  }
  return { repeatWorkloads };
}

export function auditActiveEconomy() {
  const maxed = fixture(true);
  const idle = normalizeFacility(maxed, start + 7 * 86400000, 3);
  const batchRoutes = ACTIVE_COMPUTE_JOBS.map((job) => {
    const input = inputCost(job.cost);
    return {
      id: job.id,
      reward: job.reward,
      npcInputCompute: input.compute,
      netCompute: job.reward - input.compute,
      baseSeconds: activeBatchSeconds(maxed, job.seconds),
      freshBaseSeconds: job.seconds,
    };
  });
  const workloadRoutes = CONTRACT_TEMPLATES.filter(
    (t) => t.family === 'workload',
  ).flatMap((t) =>
    styles.map((style) => {
      const quote = contractQuote(maxed, t, style, 'rack-g', start, 30, 2);
      const inputs = inputCost(quote.cost);
      const net = quote.reward - inputs.compute;
      return {
        id: t.id,
        style,
        quantity: 30,
        reward: quote.reward,
        npcInputCompute: inputs.compute,
        netCompute: net,
        jobSeconds: quote.duration,
        craftingSeconds: inputs.craftingSeconds,
        idealizedNetPerHour: Math.floor(
          (net * 3600) / (quote.duration + inputs.craftingSeconds),
        ),
      };
    }),
  );
  return {
    version: 1,
    rules: 'productionVersion 3, client quoteVersion 2',
    assumptions: [
      'One simulated hour; real applyFacility actions and rotating client offers.',
      'Synthetic starter/endgame facilities; seed buying capital and upgrades are not earned in these scenarios.',
      'No player trades, free inventory, daily claims, outages, commissions, or service/supply jobs included.',
      'Walking, server spatial checks, latency and request limits excluded: repeat results are an idealized throughput ceiling.',
      'Crafted inputs use standard recipes, sequential craft time and NPC raw-material prices.',
      'This measures repeatability, not enjoyment, human behavior, token value or safe player capacity.',
    ],
    idleComputeAfterSevenDays: storedComputeNow(idle, start + 7 * 86400000),
    batchRoutes,
    workloadRoutes,
    repeatStrategies: [
      runner(false).repeatWorkloads(),
      runner(true).repeatWorkloads(),
    ],
    conclusions: {
      passiveMintRemoved: storedComputeNow(idle, start + 7 * 86400000) === 0,
      npcSuppliedBatchLoopProfitable: batchRoutes.some((r) => r.netCompute > 0),
      npcClientWorkProfitable: workloadRoutes.some((r) => r.netCompute > 0),
      botResistanceProven: false,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(auditActiveEconomy(), null, 2));
