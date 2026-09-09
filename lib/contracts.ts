import {
  MACHINE_POWER,
  machinePerTick,
  workloadCapacity,
} from './production.ts';
import type { Bag, Facility, FacilityAction, ItemId } from './facility.ts';
import { PROJECT_VARIANTS } from './projects.ts';
import { validDispatchChoices, type DispatchChoices } from './dispatch.ts';

export type ContractFamily = 'service' | 'supply' | 'workload';
export type ModuleStyle = 'standard' | 'fast' | 'efficient' | 'stable';
export type ContractTemplate = {
  id: string;
  family: ContractFamily;
  name: string;
  client: string;
  description: string;
  goal: string;
  cost: Bag;
  seconds: number;
  reward: number;
  reputation: number;
  qualification: number;
  target: string;
  favored: ModuleStyle;
  requiredZone?: string;
};

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id: 'loose-link',
    family: 'service',
    name: 'A very loose connection',
    client: 'Margo · Dispatch',
    description: 'The status light is blinking for all the wrong reasons.',
    goal: 'Inspect and restore the network terminal.',
    cost: { copper: 2 },
    seconds: 12,
    reward: 28,
    reputation: 12,
    qualification: 0,
    target: 'repair',
    favored: 'stable',
  },
  {
    id: 'dust-patrol',
    family: 'service',
    name: 'Dust is not a cooling strategy',
    client: 'Patch · Engineering',
    description: 'Clear a retired machine and put it back to work.',
    goal: 'Clean, replace and test the salvage machine.',
    cost: { scrap: 3 },
    seconds: 18,
    reward: 38,
    reputation: 15,
    qualification: 0,
    target: 'scrap-c',
    favored: 'efficient',
  },
  {
    id: 'board-rescue',
    family: 'service',
    name: 'One board short',
    client: 'Dot · Quality control',
    description: 'A replacement board will rescue this stubborn terminal.',
    goal: 'Replace the board and verify the uplink.',
    cost: { board: 1 },
    seconds: 24,
    reward: 120,
    reputation: 24,
    qualification: 5,
    target: 'repair',
    favored: 'stable',
  },
  {
    id: 'cooling-call',
    family: 'service',
    name: 'Please stop the beeping',
    client: 'Patch · Engineering',
    description: 'An optional cooling call. Your own equipment is safe.',
    goal: 'Flush and restart the cooling station.',
    cost: { coolant: 4, copper: 2 },
    seconds: 24,
    reward: 90,
    reputation: 24,
    qualification: 8,
    target: 'utilities',
    favored: 'stable',
    requiredZone: 'thermal',
  },
  {
    id: 'wire-order',
    family: 'supply',
    name: 'Send wires. Lots of wires.',
    client: 'Bit · Supply desk',
    description: 'The next crew forgot the most important part.',
    goal: 'Deliver recovered scrap and copper wire.',
    cost: { scrap: 4, copper: 3 },
    seconds: 45,
    reward: 46,
    reputation: 12,
    qualification: 0,
    target: 'workbench',
    favored: 'efficient',
  },
  {
    id: 'kit-order',
    family: 'supply',
    name: 'The first-aid kit for servers',
    client: 'Margo · Dispatch',
    description: 'Make a repair kit. Somebody will definitely need it.',
    goal: 'Deliver one repair kit.',
    cost: { kit: 1 },
    seconds: 45,
    reward: 80,
    reputation: 20,
    qualification: 0,
    target: 'workbench',
    favored: 'efficient',
  },
  {
    id: 'board-order',
    family: 'supply',
    name: 'Boards before breakfast',
    client: 'Dot · Quality control',
    description: 'A little assembly keeps the whole shift moving.',
    goal: 'Deliver two compute boards.',
    cost: { board: 2 },
    seconds: 60,
    reward: 210,
    reputation: 30,
    qualification: 4,
    target: 'workbench',
    favored: 'efficient',
  },
  {
    id: 'field-stock',
    family: 'supply',
    name: 'Ready for absolutely anything',
    client: 'Patch · Engineering',
    description: 'Prepare the components for a bigger commissioning job.',
    goal: 'Deliver a repair kit, board and power cell.',
    cost: { kit: 1, board: 1, battery: 1 },
    seconds: 90,
    reward: 340,
    reputation: 42,
    qualification: 12,
    target: 'workbench',
    favored: 'efficient',
  },
  {
    id: 'tiny-model',
    family: 'workload',
    name: 'A model with modest ambitions',
    client: 'Tiny Labs',
    description: 'Give this small workload a rack of its own.',
    goal: 'Assign a machine and finish the batch.',
    cost: { silicon: 1 },
    seconds: 60,
    reward: 32,
    reputation: 14,
    qualification: 0,
    target: 'rack-a',
    favored: 'efficient',
  },
  {
    id: 'render-rush',
    family: 'workload',
    name: 'It was due yesterday',
    client: 'Pixel Department',
    description: 'A burst of rendering work. Fast equipment saves time.',
    goal: 'Reserve a rack for the render batch.',
    cost: { copper: 2, silicon: 2 },
    seconds: 90,
    reward: 65,
    reputation: 20,
    qualification: 0,
    target: 'rack-a',
    favored: 'fast',
  },
  {
    id: 'quiet-inference',
    family: 'workload',
    name: 'The quiet shift',
    client: 'After Hours AI',
    description: 'A longer run rewards careful use of supplies.',
    goal: 'Process an efficient inference batch.',
    cost: { silicon: 4, copper: 4 },
    seconds: 180,
    reward: 100,
    reputation: 32,
    qualification: 6,
    target: 'rack-a',
    favored: 'efficient',
  },
  {
    id: 'wobbly-training',
    family: 'workload',
    name: 'Keep it together',
    client: 'Probably Fine Research',
    description: 'A demanding model needs a stable setup.',
    goal: 'Commission a stable training batch.',
    cost: { board: 1, silicon: 3 },
    seconds: 240,
    reward: 220,
    reputation: 44,
    qualification: 12,
    target: 'rack-a',
    favored: 'stable',
  },
];

export const MODULES = [
  {
    id: 'fast',
    name: 'Fast',
    description: 'Workloads finish 30% sooner. Uses one extra wire per unit.',
    cost: { kit: 1, copper: 4 },
    price: 90,
    required: 2,
  },
  {
    id: 'efficient',
    name: 'Efficient',
    description:
      'Raw material inputs reduced by 35%. Workloads take 20% longer.',
    cost: { board: 1, scrap: 4 },
    price: 110,
    required: 3,
  },
  {
    id: 'stable',
    name: 'Stable',
    description:
      'Workload batches use 20% fewer crafted parts. Favored stability work earns 50% extra reputation.',
    cost: { board: 1, kit: 1 },
    price: 150,
    required: 5,
  },
] as const;

export type ContractOffer = { id: string; template: string };
export type ContractRun = ContractOffer & {
  quoteVersion?: 1 | 2;
  quantity?: number;
  acceptedAt: number;
  state: 'accepted' | 'running' | 'ready';
  style: ModuleStyle;
  rack: string | null;
  startedAt: number | null;
  readyAt: number | null;
  reward: number;
  reputation: number;
  cost: Bag;
  steps: number;
  nextStepAt: number;
  duration: number;
};
export type ReportStyleCounts = Partial<
  Record<ContractFamily, Partial<Record<ModuleStyle, number>>>
>;
export type Career = {
  dispatchChoices?: DispatchChoices;
  projectUsed?: Record<ContractFamily, number>;
  // Only new claims mint typed proof. Old completed totals remain legacy reports.
  reportStyles?: ReportStyleCounts;
  projectUsedStyles?: ReportStyleCounts;
  commissioned?: number;
  mastery?: Record<string, Partial<Record<ModuleStyle, number>>>;
  projectDiscoveries?: string[];
  accent?: 'original' | 'mint' | 'violet';
  trophy?: boolean;
  version: 1;
  serial: number;
  offers: ContractOffer[];
  active: ContractRun[];
  completed: Record<ContractFamily, number>;
  reputation: number;
  modules: ModuleStyle[];
  loadout: ModuleStyle[];
  selected: string | null;
  discoveries: string[];
  lastReceipt: {
    id: string;
    name: string;
    reward: number;
    reputation: number;
  } | null;
};
const FAMILIES: ContractFamily[] = ['service', 'supply', 'workload'];
export const SERVICE_STEPS = ['Inspect', 'Isolate', 'Repair', 'Test'] as const;
export const SERVICE_REPAIRS = [
  'Reseat the cable',
  'Reset the breaker',
  'Flush the cooling line',
] as const;
const FAULTS = [
  {
    fault: 'network',
    readings: ['Network: no link', 'Power: normal', 'Temperature: normal'],
    answer: SERVICE_REPAIRS[0],
    hint: 'No network link? Check the cable before touching the power.',
  },
  {
    fault: 'power',
    readings: [
      'Network: waiting',
      'Power: breaker tripped',
      'Temperature: normal',
    ],
    answer: SERVICE_REPAIRS[1],
    hint: 'The breaker has tripped. Restore power before checking the connection.',
  },
  {
    fault: 'heat',
    readings: ['Network: connected', 'Power: normal', 'Temperature: too hot'],
    answer: SERVICE_REPAIRS[2],
    hint: 'The machine has power and a connection. Help it cool down.',
  },
] as const;
export function serviceChallenge(run: Pick<ContractRun, 'id' | 'template'>) {
  const seed = `${run.id}:${run.template}`
    .split('')
    .reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 0);
  return FAULTS[seed % FAULTS.length];
}
export const contractTemplate = (id: string) =>
  CONTRACT_TEMPLATES.find((t) => t.id === id)!;
export const completedContracts = (c: Career) =>
  FAMILIES.reduce((sum, family) => sum + c.completed[family], 0);
export const operatorLicense = (c: Career) =>
  FAMILIES.every((f) => c.completed[f] >= 2) &&
  c.modules.length > 0 &&
  (c.commissioned ?? 0) > 0;
export const masteryStamps = (c: Career) =>
  Object.values(c.mastery ?? {}).reduce(
    (sum, styles) =>
      sum +
      ['fast', 'efficient', 'stable'].filter(
        (s) => (styles[s as ModuleStyle] ?? 0) > 0,
      ).length,
    0,
  );
export const careerLevel = (c: Career) =>
  1 + Math.floor(Math.sqrt(c.reputation / 30));

export function eligibleContracts(
  c: Career,
  f: Pick<Facility, 'unlocked' | 'skills'>,
  family: ContractFamily,
) {
  return CONTRACT_TEMPLATES.filter(
    (t) =>
      t.family === family &&
      t.qualification <= completedContracts(c) &&
      (!t.requiredZone || f.unlocked.includes(t.requiredZone as never)) &&
      (!t.cost.battery || f.skills.engineering >= 20),
  );
}
function refill(c: Career, f: Pick<Facility, 'unlocked' | 'skills'>) {
  for (const family of FAMILIES) {
    if (c.offers.some((o) => contractTemplate(o.template)?.family === family))
      continue;
    const eligible = eligibleContracts(c, f, family);
    const template = eligible[c.serial % eligible.length];
    c.offers.push({ id: `contract-${c.serial++}`, template: template.id });
  }
}

export function newCareer(f: Pick<Facility, 'unlocked' | 'skills'>): Career {
  const c: Career = {
    version: 1,
    serial: 1,
    offers: [],
    active: [],
    completed: { service: 0, supply: 0, workload: 0 },
    reputation: 0,
    modules: [],
    loadout: [],
    selected: null,
    discoveries: [],
    lastReceipt: null,
  };
  refill(c, f);
  return c;
}

export function careerFor(f: Facility): Career {
  return f.career ?? newCareer(f);
}
export function availableRacks(f: Facility): string[] {
  const reserved = careerFor(f)
    .active.filter((r) => r.rack !== null)
    .map((r) => r.rack);
  return Object.keys(f.builds).filter(
    (id) => f.builds[id] > 0 && !reserved.includes(id),
  );
}

export function contractQuote(
  f: Facility,
  template: ContractTemplate,
  style: ModuleStyle,
  rack?: string,
  now = Date.now(),
  quantity = 1,
  quoteVersion: 1 | 2 = 2,
) {
  if (quoteVersion !== 1 && quoteVersion !== 2)
    throw new ContractError('Unsupported job terms.');
  const limit = quoteVersion === 2 && template.family === 'workload' ? 30 : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > limit)
    throw new ContractError(`Choose between 1 and ${limit} units.`);
  const cost = Object.fromEntries(
    Object.entries(template.cost).map(([key, n]) => [key, n! * quantity]),
  ) as Bag;
  const raw = new Set(['scrap', 'copper', 'silicon', 'coolant', 'fiber']);
  if (style === 'efficient')
    for (const key of Object.keys(cost) as ItemId[])
      if (raw.has(key)) cost[key] = Math.max(1, Math.ceil(cost[key]! * 0.65));
  if (
    style === 'stable' &&
    quoteVersion === 2 &&
    template.family === 'workload'
  )
    for (const key of Object.keys(cost) as ItemId[])
      if (!raw.has(key)) cost[key] = Math.max(1, Math.ceil(cost[key]! * 0.8));
  if (style === 'fast' && template.family === 'workload')
    cost.copper = (cost.copper ?? 0) + quantity;
  const duration = Math.ceil(
    template.seconds *
      (template.family === 'workload'
        ? style === 'fast'
          ? 0.7
          : style === 'efficient'
            ? 1.2
            : 1
        : 1),
  );
  const firstTick =
    f.computeAt + Math.max(0, Math.floor((now - f.computeAt) / 15000)) * 15000;
  const reservedTicks = Math.max(
    0,
    Math.floor((now + duration * 1000 - firstTick) / 15000),
  );
  const lostIdle =
    template.family === 'workload' && rack
      ? machinePerTick(f, rack) * reservedTicks
      : 0;
  // Version 1 accepted jobs retain their original one-unit reimbursement rules.
  const reimbursed =
    quoteVersion === 1 && template.family === 'workload' && rack
      ? (f.builds[rack] ?? 0) *
        (MACHINE_POWER[rack] ?? 1) *
        (6 + f.computeBoost * 3) *
        reservedTicks
      : 0;
  const booking =
    quoteVersion === 2 && template.family === 'workload'
      ? ({
          'tiny-model': 24,
          'render-rush': 36,
          'quiet-inference': 72,
          'wobbly-training': 96,
        }[template.id] ?? 0)
      : 0;
  return {
    cost,
    duration,
    quantity,
    lostIdle,
    reimbursed,
    booking,
    fee: template.reward * quantity + booking,
    reward: template.reward * quantity + booking + reimbursed,
    reputation:
      template.reputation +
      (style === template.favored
        ? Math.ceil(template.reputation * (style === 'stable' ? 0.5 : 0.2))
        : 0),
  };
}

/** Amount already occupied by workloads at the same 15-second production ticks. */
export function reservedProduction(f: Facility, until: number): number {
  return (f.career?.active ?? []).reduce((sum, r) => {
    if (!r.rack || r.startedAt === null || r.readyAt === null) return sum;
    const end = Math.floor(
      Math.max(0, Math.min(until, r.readyAt) - f.computeAt) / 15000,
    );
    const start = Math.floor(Math.max(0, r.startedAt - f.computeAt) / 15000);
    return sum + Math.max(0, end - start) * machinePerTick(f, r.rack);
  }, 0);
}

export class ContractError extends Error {}
/** Mutates a cloned facility only. The caller commits its balance/version atomically. */
export function applyContract(
  f: Facility,
  a: FacilityAction,
  now: number,
): { message: string; xp: number } {
  const c = (f.career ??= newCareer(f));
  function fail(message: string): never {
    throw new ContractError(message);
  }
  const spend = (cost: Bag, price = 0) => {
    if (f.compute < price) fail(`You need ${price} Compute.`);
    for (const [key, value] of Object.entries(cost))
      if ((f.inventory[key as ItemId] ?? 0) < value!)
        fail('Gather or craft the missing parts first.');
    for (const [key, value] of Object.entries(cost))
      f.inventory[key as ItemId] = (f.inventory[key as ItemId] ?? 0) - value!;
    f.compute -= price;
  };
  if (a.type === 'module-decor') {
    if (a.id === 'trophy') {
      if (masteryStamps(c) < 18 || (c.commissioned ?? 0) < 3)
        fail('Earn 18 mastery stamps and commission three clusters.');
      c.trophy = !c.trophy;
    } else {
      if (!['original', 'mint', 'violet'].includes(a.id ?? ''))
        fail('Choose a center accent.');
      if (a.id !== 'original' && masteryStamps(c) < 6)
        fail('Earn six mastery stamps to unlock center colors.');
      c.accent = a.id as 'original' | 'mint' | 'violet';
    }
    return { message: 'Your center display is updated.', xp: 0 };
  }
  if (a.type === 'module-build') {
    const m = MODULES.find((m) => m.id === a.id);
    if (!m || c.modules.includes(m.id))
      fail('Choose a module you have not built.');
    if (completedContracts(c) < m.required)
      fail(`Complete ${m.required} contracts to learn this module.`);
    spend(m.cost, m.price);
    c.modules.push(m.id);
    if (c.loadout.length < 2) c.loadout.push(m.id);
    return {
      message: `${m.name} module built. Try it on your next job.`,
      xp: 15,
    };
  }
  if (a.type === 'module-equip') {
    const style = a.id as ModuleStyle;
    if (!c.modules.includes(style)) fail('Build this module first.');
    c.loadout = c.loadout.includes(style)
      ? c.loadout.filter((s) => s !== style)
      : [...c.loadout.slice(-1), style];
    return {
      message: 'Loadout saved. Running jobs keep their original configuration.',
      xp: 0,
    };
  }
  if (a.type === 'contract-accept') {
    if (c.active.length >= 2)
      fail('Finish or cancel a job before accepting another.');
    const offer = c.offers.find(
      (o) => o.id === a.id && !c.active.some((r) => r.id === o.id),
    );
    if (!offer) fail('That offer has already been taken.');
    const t = contractTemplate(offer.template);
    if (t.family === 'workload' && !Object.values(f.builds).some((v) => v > 0))
      fail('Build your free starter machine first.');
    let acceptedTemplate = t;
    if (a.template !== undefined || a.dispatchTicket !== undefined) {
      if (
        typeof a.template !== 'string' ||
        typeof a.dispatchTicket !== 'string'
      )
        fail('Choose a job and an available job choice together.');
      const tickets = c.dispatchChoices?.[t.family] ?? [];
      if (!tickets.includes(a.dispatchTicket))
        fail(
          'That job choice has already been used or belongs to another kind of work.',
        );
      const replacement = eligibleContracts(c, f, t.family).find(
        (job) => job.id === a.template && job.id !== t.id,
      );
      if (!replacement)
        fail('Choose a different job you have unlocked in this family.');
      acceptedTemplate = replacement;
      c.dispatchChoices![t.family] = tickets.filter(
        (id) => id !== a.dispatchTicket,
      );
      offer.template = replacement.id;
    }
    c.active.push({
      ...offer,
      quoteVersion: 2,
      acceptedAt: now,
      state: 'accepted',
      style: 'standard',
      rack: null,
      startedAt: null,
      readyAt: null,
      reward: 0,
      reputation: acceptedTemplate.reputation,
      cost: {},
      steps: 0,
      nextStepAt: 0,
      duration: acceptedTemplate.seconds,
    });
    c.selected = offer.id;
    return {
      message: `${acceptedTemplate.name} accepted.${a.dispatchTicket ? ' One job choice used.' : ''} Choose how to tackle it.`,
      xp: 0,
    };
  }
  const run = c.active.find((r) => r.id === a.id);
  if (!run)
    fail('This job is no longer active. Its reward cannot be claimed again.');
  const t = contractTemplate(run.template);
  if (a.type === 'contract-track') {
    c.selected = run.id;
    return { message: 'Directions are on your screen.', xp: 0 };
  }
  if (a.type === 'contract-cancel') {
    if (run.state !== 'accepted')
      fail(
        'This job has already started. Finish it to keep the materials useful.',
      );
    c.active = c.active.filter((r) => r.id !== run.id);
    if (c.selected === run.id) c.selected = c.active[0]?.id ?? null;
    return {
      message: 'Unstarted job canceled. Your items are unchanged.',
      xp: 0,
    };
  }
  if (a.type === 'contract-start') {
    if (run.state !== 'accepted') fail('This job has already started.');
    const style = (a.direction ?? 'standard') as ModuleStyle;
    if (style !== 'standard' && !c.loadout.includes(style))
      fail('Equip that module before using it.');
    const rack = t.family === 'workload' ? a.rack : undefined;
    if (t.family === 'workload' && (!rack || !availableRacks(f).includes(rack)))
      fail('Choose an available machine.');
    const quantity = a.quantity === undefined ? 1 : a.quantity;
    if (t.family === 'workload' && quantity > workloadCapacity(f, rack))
      fail(
        'This batch is too large for that machine. Choose fewer units or a bigger machine.',
      );
    const quote = contractQuote(
      f,
      t,
      style,
      rack,
      now,
      quantity,
      run.quoteVersion ?? 1,
    );
    spend(quote.cost);
    Object.assign(run, {
      cost: quote.cost,
      duration: quote.duration,
      reward: quote.reward,
      reputation: quote.reputation,
      ...(run.quoteVersion === 2 ? { quantity } : {}),
      style,
      rack: rack ?? null,
      startedAt: now,
      readyAt: t.family !== 'service' ? now + quote.duration * 1000 : null,
      nextStepAt: now + 3000,
      state: 'running',
    });
    return {
      message:
        t.family === 'supply'
          ? 'Parts dispatched. The client is checking the delivery.'
          : t.family === 'workload'
            ? 'Rack reserved. Your other machines keep working.'
            : 'Fault located. Follow the repair sequence.',
      xp: 0,
    };
  }
  if (a.type === 'contract-service') {
    if (
      t.family !== 'service' ||
      run.state !== 'running' ||
      now < run.nextStepAt
    )
      fail('Let this repair step finish first.');
    if (run.steps === 0) {
      if (a.direction !== 'Inspect') fail('Inspect the readings first.');
      run.steps = 1;
      run.nextStepAt = now + 3000;
      return {
        message: 'Read the three indicators. Which part needs attention?',
        xp: 0,
      };
    }
    if (run.steps === 1) {
      if (
        !SERVICE_REPAIRS.includes(
          a.direction as (typeof SERVICE_REPAIRS)[number],
        )
      )
        fail('Choose one of the three repairs.');
      if (a.direction !== serviceChallenge(run).answer) {
        run.nextStepAt = now + 4000;
        return {
          message:
            'Still offline. Check the readings and try a different repair. No extra parts used.',
          xp: 0,
        };
      }
      run.steps = 2;
      run.nextStepAt = now + Math.max(6000, t.seconds * 1000 - 6000);
      return {
        message:
          'That fixed the fault. Let the system settle, then run the test.',
        xp: 0,
      };
    }
    if (run.steps !== 2 || a.direction !== 'Test')
      fail('Run the final system test.');
    run.steps = 4;
    run.state = 'ready';
    return { message: 'All indicators green. Collect your payment!', xp: 0 };
  }
  if (a.type === 'contract-claim') {
    if (
      run.state !== 'ready' &&
      !(
        run.state === 'running' &&
        t.family !== 'service' &&
        run.readyAt !== null &&
        now >= run.readyAt
      )
    )
      fail('Finish the work before collecting payment.');
    f.compute += run.reward;
    c.reputation += run.reputation;
    c.completed[t.family]++;
    c.reportStyles ??= {};
    const reports = (c.reportStyles[t.family] ??= {});
    reports[run.style] = (reports[run.style] ?? 0) + 1;
    const skill = t.family === 'supply' ? 'engineering' : 'operations';
    f.skills[skill] += run.reputation;
    f.stats.contracts = (f.stats.contracts ?? 0) + 1;
    f.stats.computeEarned = (f.stats.computeEarned ?? 0) + run.reward;
    f.daily.computeEarned = (f.daily.computeEarned ?? 0) + run.reward;
    if (!c.discoveries.includes(t.id)) c.discoveries.push(t.id);
    c.mastery ??= {};
    c.mastery[t.id] ??= {};
    c.mastery[t.id][run.style] = (c.mastery[t.id][run.style] ?? 0) + 1;
    c.lastReceipt = {
      id: run.id,
      name: t.name,
      reward: run.reward,
      reputation: run.reputation,
    };
    c.active = c.active.filter((r) => r.id !== run.id);
    if (c.selected === run.id) c.selected = c.active[0]?.id ?? null;
    c.offers = c.offers.filter((o) => o.id !== run.id);
    refill(c, f);
    return {
      message: `Job complete! +${run.reward} Compute · +${run.reputation} reputation.`,
      xp: run.reputation,
    };
  }
  fail('Unknown job action.');
}

export function validCareer(value: unknown): value is Career {
  if (!value || typeof value !== 'object') return false;
  const c = value as Career;
  const nat = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
  if (
    c.projectUsed !== undefined &&
    (!c.projectUsed ||
      !FAMILIES.every(
        (f) => nat(c.projectUsed![f]) && c.projectUsed![f] <= c.completed?.[f],
      ))
  )
    return false;
  if (c.commissioned !== undefined && !nat(c.commissioned)) return false;
  if (
    c.dispatchChoices !== undefined &&
    !validDispatchChoices(c.dispatchChoices)
  )
    return false;
  if (
    c.mastery !== undefined &&
    (!c.mastery ||
      typeof c.mastery !== 'object' ||
      !Object.entries(c.mastery).every(
        ([id, styles]) =>
          CONTRACT_TEMPLATES.some((t) => t.id === id) &&
          styles &&
          Object.entries(styles).every(
            ([style, n]) =>
              ['standard', 'fast', 'efficient', 'stable'].includes(style) &&
              nat(n),
          ),
      ))
  )
    return false;
  if (
    c.projectDiscoveries !== undefined &&
    (!Array.isArray(c.projectDiscoveries) ||
      !c.projectDiscoveries.every((id) =>
        PROJECT_VARIANTS.some((v) => v.id === id),
      ))
  )
    return false;
  if (
    c.accent !== undefined &&
    !['original', 'mint', 'violet'].includes(c.accent)
  )
    return false;
  if (c.trophy !== undefined && typeof c.trophy !== 'boolean') return false;
  if (
    c.version !== 1 ||
    !nat(c.serial) ||
    !nat(c.reputation) ||
    !c.completed ||
    !FAMILIES.every((f) => nat(c.completed[f]))
  )
    return false;
  const styles: ModuleStyle[] = ['standard', 'fast', 'efficient', 'stable'];
  const validReportCounts = (counts: unknown): counts is ReportStyleCounts =>
    !!counts &&
    typeof counts === 'object' &&
    !Array.isArray(counts) &&
    Object.entries(counts).every(
      ([family, byStyle]) =>
        FAMILIES.includes(family as ContractFamily) &&
        byStyle &&
        typeof byStyle === 'object' &&
        !Array.isArray(byStyle) &&
        Object.entries(byStyle).every(
          ([style, n]) => styles.includes(style as ModuleStyle) && nat(n),
        ),
    );
  if (
    (c.reportStyles !== undefined && !validReportCounts(c.reportStyles)) ||
    (c.projectUsedStyles !== undefined &&
      !validReportCounts(c.projectUsedStyles))
  )
    return false;
  for (const family of FAMILIES) {
    let minted = 0,
      spent = 0;
    for (const style of styles) {
      const amount = c.reportStyles?.[family]?.[style] ?? 0;
      const used = c.projectUsedStyles?.[family]?.[style] ?? 0;
      if (used > amount) return false;
      minted += amount;
      spent += used;
    }
    const aggregateSpent = c.projectUsed?.[family] ?? 0;
    if (
      !nat(minted) ||
      !nat(spent) ||
      minted > c.completed[family] ||
      spent > aggregateSpent ||
      aggregateSpent - spent > c.completed[family] - minted
    )
      return false;
  }
  if (
    !Array.isArray(c.offers) ||
    c.offers.length !== 3 ||
    !Array.isArray(c.active) ||
    c.active.length > 2
  )
    return false;
  const entries = [...c.offers, ...c.active];
  if (
    !entries.every(
      (o) =>
        o &&
        /^contract-[1-9]\d*$/.test(o.id) &&
        Number.isSafeInteger(Number(o.id.slice(9))) &&
        Number(o.id.slice(9)) < c.serial &&
        CONTRACT_TEMPLATES.some((t) => t.id === o.template),
    )
  )
    return false;
  if (
    new Set(c.offers.map((o) => o.id)).size !== c.offers.length ||
    new Set(c.active.map((o) => o.id)).size !== c.active.length
  )
    return false;
  if (
    !c.active.every((r) =>
      c.offers.some((o) => o.id === r.id && o.template === r.template),
    )
  )
    return false;
  if (
    !FAMILIES.every(
      (family) =>
        c.offers.filter((o) => contractTemplate(o.template).family === family)
          .length === 1,
    )
  )
    return false;
  if (
    !Array.isArray(c.modules) ||
    !c.modules.every((s) => MODULES.some((m) => m.id === s)) ||
    !Array.isArray(c.loadout) ||
    c.loadout.length > 2 ||
    !c.loadout.every((s) => c.modules.includes(s))
  )
    return false;
  if (
    new Set(c.modules).size !== c.modules.length ||
    new Set(c.loadout).size !== c.loadout.length
  )
    return false;
  if (
    !Array.isArray(c.discoveries) ||
    new Set(c.discoveries).size !== c.discoveries.length ||
    !c.discoveries.every((id) => CONTRACT_TEMPLATES.some((t) => t.id === id))
  )
    return false;
  if (!(c.selected === null || c.active.some((r) => r.id === c.selected)))
    return false;
  if (
    c.lastReceipt !== null &&
    (!c.lastReceipt ||
      typeof c.lastReceipt.id !== 'string' ||
      typeof c.lastReceipt.name !== 'string' ||
      !nat(c.lastReceipt.reward) ||
      !nat(c.lastReceipt.reputation))
  )
    return false;
  const reserved = c.active.filter((r) => r.rack !== null).map((r) => r.rack);
  if (new Set(reserved).size !== reserved.length) return false;
  return c.active.every(
    (r) =>
      ['accepted', 'running', 'ready'].includes(r.state) &&
      (r.quoteVersion === undefined ||
        r.quoteVersion === 1 ||
        r.quoteVersion === 2) &&
      (r.quantity === undefined
        ? r.quoteVersion !== 2 || r.state === 'accepted'
        : r.quoteVersion === 2 &&
          r.state !== 'accepted' &&
          nat(r.quantity) &&
          r.quantity >= 1 &&
          r.quantity <=
            (contractTemplate(r.template).family === 'workload' ? 30 : 1)) &&
      ['standard', ...c.modules].includes(r.style) &&
      [
        'acceptedAt',
        'reward',
        'reputation',
        'steps',
        'nextStepAt',
        'duration',
      ].every((k) => nat(r[k as keyof ContractRun])) &&
      (r.startedAt === null || nat(r.startedAt)) &&
      (r.readyAt === null || nat(r.readyAt)) &&
      (r.rack === null || Object.hasOwn(MACHINE_POWER, r.rack)) &&
      r.steps <= 4 &&
      r.cost &&
      typeof r.cost === 'object' &&
      Object.entries(r.cost).every(
        ([id, n]) =>
          [
            'scrap',
            'copper',
            'silicon',
            'coolant',
            'fiber',
            'kit',
            'board',
            'battery',
            'pump',
            'coffee',
            'core',
          ].includes(id) && nat(n),
      ) &&
      (r.state === 'accepted'
        ? r.startedAt === null &&
          r.readyAt === null &&
          r.rack === null &&
          r.steps === 0 &&
          r.reward === 0 &&
          Object.keys(r.cost).length === 0
        : r.startedAt !== null &&
          r.startedAt >= r.acceptedAt &&
          r.reward > 0 &&
          (contractTemplate(r.template).family === 'service'
            ? r.rack === null &&
              r.readyAt === null &&
              (r.state === 'ready' ? r.steps === 4 : r.steps <= 2)
            : r.state === 'running' &&
              r.readyAt === r.startedAt + r.duration * 1000 &&
              r.duration > 0 &&
              r.steps === 0 &&
              (contractTemplate(r.template).family === 'workload'
                ? r.rack !== null
                : r.rack === null))),
  );
}
