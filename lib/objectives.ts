import {
  DAILY_TASKS,
  ITEMS,
  OBJECTS,
  RECIPES,
  recipeFor,
  STORY,
  ZONES,
  rackPrice,
  machineGain,
  itemCount,
  modules,
  normalizeFacility,
  skillLevel,
  storyValue,
  type Bag,
  type CraftVariant,
  type Facility,
  type FacilityAction,
  type ItemId,
  type ZoneId,
} from './facility.ts';

export type GuideView = {
  inventoryTab?: 'bag' | 'bank';
  item?: ItemId;
  jobsTab?: 'board' | 'equipment' | 'progress';
  family?: import('./contracts.ts').ContractFamily;
  style?: import('./contracts.ts').ModuleStyle;
  jobId?: string;
  moduleId?: import('./contracts.ts').ModuleStyle;
  recipe?: ItemId;
  recipeVariant?: CraftVariant;
  quantity?: number;
};
export type PartsRequest = {
  boardVariant?: CraftVariant;
  items?: Bag;
  build?: string;
  recipe?: ItemId;
  quantity?: number;
  source?: { label: string; panel: 'contracts' | 'crafting'; view: GuideView };
};
export type NextStep = {
  title: string;
  detail: string;
  cta: string;
  target?: string;
  action?: Omit<FacilityAction, 'requestId'>;
  panel?: string;
  repair?: boolean;
  wait?: boolean;
  view?: GuideView;
};
export type Objective = NextStep & {
  chapter: string;
  progress: number;
  reward: string;
  speaker: string;
};

// One resolver serves the HUD, job book and missing-part buttons. It plans
// actions from actual saved resources; it never grants items or awards.
export function resolveObjective(
  previous: Facility,
  credits: number,
  now = Date.now(),
  request?: PartsRequest,
): Objective {
  const f = normalizeFacility(previous, now);
  let neededParts: Bag = request?.items ?? {};
  const story = STORY.find((c) => !f.claims.includes(c.id));
  const repair = (): NextStep => ({
    title: 'Fix a broken system',
    detail: 'Pick a quick repair. Each fix earns 40 Compute and spare parts.',
    cta: 'Start a repair',
    target: 'repair',
    repair: true,
  });
  const cash = (need: number): NextStep | null =>
    credits < need
      ? {
          ...repair(),
          detail: `You need ${need - credits} more Compute. Repairs pay 40 each.`,
        }
      : null;
  const bench = (): NextStep => ({
    title:
      f.craft && now >= f.craft.readyAt
        ? `Collect your ${ITEMS[f.craft.recipe as ItemId].name.toLowerCase()}`
        : 'Your part is being made',
    detail:
      f.craft && now < f.craft.readyAt
        ? `Ready in ${Math.ceil((f.craft.readyAt - now) / 1000)} seconds. You can keep exploring.`
        : 'Ready! Pick it up and put it to work.',
    cta: f.craft && now < f.craft.readyAt ? 'Making…' : 'Collect part',
    target: 'workbench',
    action: { type: 'collect', id: f.craft?.id },
    view: f.craft
      ? {
          recipe: f.craft.recipe as ItemId,
          quantity: f.craft.quantity ?? 1,
          ...(f.craft.variant ? { recipeVariant: f.craft.variant } : {}),
        }
      : undefined,
    wait: !!f.craft && now < f.craft.readyAt,
  });
  const gather = (id: ItemId): NextStep => {
    const all = OBJECTS.filter((o) => o.kind === 'node' && o.item === id);
    const open = all
      .filter((o) => f.unlocked.includes(o.zone))
      .sort((a, b) => (f.cooldowns[a.id] ?? 0) - (f.cooldowns[b.id] ?? 0));
    const node = open[0];
    if (!node)
      return all[0]
        ? unlock(all[0].zone)
        : {
            title: `Get ${ITEMS[id].name.toLowerCase()}`,
            detail: 'Bit can help with spare parts.',
            cta: 'Visit Bit',
            target: 'bit',
            panel: 'market',
          };
    const seconds = Math.ceil(((f.cooldowns[node.id] ?? 0) - now) / 1000);
    if (
      node.hazard &&
      f.energy + Math.floor((now - f.energyAt) / 5000) < node.hazard
    ) {
      if (f.inventory.coffee)
        return {
          title: 'Take a coffee break',
          detail: 'Recharge your suit before entering the hot racks.',
          cta: 'Drink coffee',
          action: { type: 'coffee' },
        };
      return make('coffee');
    }
    return {
      title: `Collect ${ITEMS[id].name.toLowerCase()}`,
      detail:
        seconds > 0
          ? `This pile refills in ${seconds}s. Other jobs are still available.`
          : `${node.name} · ${ZONES.find((z) => z.id === node.zone)!.name}`,
      cta: seconds > 0 ? `Ready in ${seconds}s` : 'Show me where',
      target: node.id,
      action: { type: 'gather', id: node.id },
      wait: seconds > 0,
    };
  };
  const parts = (cost: Bag): NextStep | null => {
    neededParts = cost;
    for (const [key, needed] of Object.entries(cost)) {
      const id = key as ItemId,
        missing = needed! - (f.inventory[id] ?? 0);
      if (missing <= 0) continue;
      if ((f.bank[id] ?? 0) > 0)
        return {
          title: `Take ${ITEMS[id].name.toLowerCase()} from storage`,
          detail:
            'You already own some. Move them to your backpack to use them.',
          cta: 'Take stored parts',
          target: 'bank',
          action: {
            type: 'bank',
            item: id,
            quantity: Math.min(missing, f.bank[id]!),
            direction: 'withdraw',
          },
        };
      if (RECIPES.some((r) => r.id === id)) return make(id, missing);
      const step = gather(id);
      if (!step.wait)
        step.detail = `Need ${missing} more ${ITEMS[id].name.toLowerCase()}. ${step.detail}`;
      return step;
    }
    return null;
  };
  const make = (id: ItemId, requested = 1): NextStep => {
    if (f.craft) return bench();
    const variant = id === 'board' ? request?.boardVariant : undefined;
    const r = recipeFor(id, variant);
    if (!f.unlocked.includes(r.zone)) return unlock(r.zone);
    if (skillLevel(f.skills.engineering) < r.skill) return make('kit');
    // A large component goal may need several explicit bench visits. Keep
    // the goal intact, while suggesting a batch whose inputs fit the bag.
    const perPart = itemCount(r.cost);
    const unrelated = Object.entries(f.inventory).reduce(
      (sum, [key, n]) => sum + (r.cost[key as ItemId] ? 0 : (n ?? 0)),
      0,
    );
    const quantity = Math.max(
      1,
      Math.min(
        30,
        requested,
        Math.floor((120 + f.storage * 40 - unrelated) / perPart),
      ),
    );
    const cost = Object.fromEntries(
      Object.entries(r.cost).map(([key, n]) => [key, n! * quantity]),
    ) as Bag;
    const batchNote =
      quantity < requested
        ? `Make ${quantity} now toward ${requested} missing parts; this batch fits your backpack. `
        : '';
    return (
      parts(cost) ?? {
        title: `Make ${quantity} × ${r.name.toLowerCase()}`,
        detail: `${batchNote}${variant === 'recovered' ? 'Recovered parts. ' : ''}Your parts are ready. Takes ${r.seconds * quantity} seconds at the workbench.`,
        cta: 'Make this part',
        target: 'workbench',
        action: {
          type: 'craft',
          id,
          quantity,
          ...(variant ? { variant } : {}),
        },
        view: {
          recipe: id,
          quantity,
          ...(variant ? { recipeVariant: variant } : {}),
        },
      }
    );
  };
  const build = (id?: string): NextStep => {
    const racks = OBJECTS.filter(
      (o) =>
        o.kind === 'build' &&
        f.unlocked.includes(o.zone) &&
        (f.builds[o.id] ?? 0) < 3,
    ).sort((a, b) => (f.builds[a.id] ?? 0) - (f.builds[b.id] ?? 0));
    const rack = (id && racks.find((o) => o.id === id)) || racks[0];
    if (!rack)
      return {
        title: 'Every rack is fully upgraded',
        detail: 'Keep the campus running with daily jobs and deliveries.',
        cta: 'Open job book',
        panel: 'contracts',
      };
    const level = f.builds[rack.id] ?? 0,
      cost = rackPrice(f, rack.id);
    return (
      cash(cost) ?? {
        title: level
          ? `Upgrade ${rack.name.split(' · ')[0]}`
          : 'Build a machine',
        detail: `${cost ? cost + ' Compute' : 'Free'} · adds ${machineGain(f, rack.id)} Compute/min.`,
        cta: level ? 'Upgrade' : 'Build',
        target: rack.id,
        action: { type: 'build', id: rack.id },
      }
    );
  };
  const unlock = (id: ZoneId): NextStep => {
    const z = ZONES.find((z) => z.id === id)!;
    if (id === 'core' && !f.unlocked.includes('compute'))
      return unlock('compute');
    if (modules(f) < z.modules) return build();
    return (
      cash(z.cost) ?? {
        title: `Open ${z.name}`,
        detail: `${z.cost} Compute unlock a new place to explore.`,
        cta: 'Open department',
        target: 'gate-' + id,
        action: { type: 'unlock', id },
      }
    );
  };
  let step: NextStep;
  let chapter = story
    ? `PROJECT ${STORY.indexOf(story) + 1} / ${STORY.length} · ${story.name}`
    : 'YOUR NEXT SHIFT';
  let progress = story
    ? Math.min(100, (storyValue(f, story.stat) / story.target) * 100)
    : 100;
  let reward = story
    ? `Project reward: ${story.credits} Compute + ${story.xp} XP`
    : 'Keep building. Daily jobs refresh at midnight UTC.';
  if (request) {
    step = request.build
      ? build(request.build)
      : request.recipe
        ? make(request.recipe, request.quantity ?? 1)
        : (parts(request.items ?? {}) ?? {
            title: 'All parts ready',
            detail: 'Your backpack has everything you need.',
            cta: 'Back to your project',
            panel: 'facility',
          });
    chapter = 'PARTS ASSISTANT';
  } else if (f.craft) step = bench();
  else if (story && storyValue(f, story.stat) >= story.target)
    step = {
      title: 'Nice work. Collect your reward!',
      detail: 'Margo has your next job ready.',
      cta: `Collect ${story.credits} credits`,
      target: 'margo',
      action: { type: 'claim', id: story.id },
    };
  else if (story) {
    switch (story.id) {
      case 'welcome':
        step = gather('scrap');
        break;
      case 'maker':
        step = make('kit');
        break;
      case 'first-light':
        step = build('rack-a');
        break;
      case 'technician':
        step = repair();
        break;
      case 'expansion':
        step = unlock(!f.unlocked.includes('thermal') ? 'thermal' : 'compute');
        break;
      case 'capacity':
        step = build();
        break;
      case 'networked':
        step = f.unlocked.includes('network')
          ? gather('fiber')
          : unlock('network');
        break;
      case 'ghosts':
        step = f.unlocked.includes('core') ? gather('core') : unlock('core');
        break;
      default:
        step = build();
    }
  } else {
    const daily = DAILY_TASKS.find((t) => !f.dailyClaims.includes(t.id));
    if (daily) {
      chapter = `TODAY’S JOB · ${daily.name}`;
      progress = Math.min(
        100,
        ((f.daily[daily.stat] ?? 0) / daily.target) * 100,
      );
      reward = `${daily.cr} Compute + 15 XP`;
      step =
        (f.daily[daily.stat] ?? 0) >= daily.target
          ? {
              title: 'Daily job complete!',
              detail: daily.name,
              cta: `Collect ${daily.cr} credits`,
              action: { type: 'daily', id: daily.id },
              target: 'margo',
            }
          : daily.id === 'repair'
            ? repair()
            : daily.id === 'craft'
              ? make('kit')
              : gather('scrap');
    } else if (f.lastWorkday !== f.day)
      step = {
        title: 'Stamp your daily card',
        detail: 'All three jobs done. Another day closer to your gold shirt.',
        cta: 'Collect daily bonus',
        target: 'margo',
        action: { type: 'daily-bonus' },
      };
    else step = build();
  }
  const pickup =
    step.action?.type === 'collect'
      ? (f.craft?.quantity ?? 1)
      : step.action?.type === 'bank' && step.action.direction === 'withdraw'
        ? (step.action.quantity ?? 0)
        : step.action?.type === 'gather'
          ? (OBJECTS.find((o) => o.id === step.action?.id)?.amount ?? 0) +
            Math.min(2, Math.floor(skillLevel(f.skills.salvaging) / 3))
          : 0;
  if (pickup && itemCount(f.inventory) + pickup > 120 + f.storage * 40) {
    // Store surplus first, so the next step does not immediately request
    // the same required stack back from storage.
    const surplus = Object.entries(f.inventory)
      .map(
        ([id, count]) =>
          [id, count! - (neededParts[id as ItemId] ?? 0)] as const,
      )
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
    const stack =
      surplus[0] ??
      Object.entries(f.inventory).sort((a, b) => b[1]! - a[1]!)[0];
    step = {
      title: 'Make space for your next pickup',
      detail:
        'Store a stack in your locker. You can take it back whenever you need it.',
      cta: 'Store a stack',
      target: 'bank',
      action: {
        type: 'bank',
        direction: 'deposit',
        item: stack[0] as ItemId,
        quantity: Math.min(500, stack[1]!),
      },
    };
  }
  return { ...step, chapter, progress, reward, speaker: 'MARGO / DISPATCH' };
}
