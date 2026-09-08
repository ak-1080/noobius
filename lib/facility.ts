export type ItemId =
  | 'scrap'
  | 'copper'
  | 'coolant'
  | 'silicon'
  | 'fiber'
  | 'core'
  | 'kit'
  | 'board'
  | 'pump'
  | 'battery'
  | 'coffee';
export type ZoneId =
  | 'commons'
  | 'salvage'
  | 'workshop'
  | 'thermal'
  | 'compute'
  | 'network'
  | 'core';
export type SkillId = 'salvaging' | 'engineering' | 'operations';
export type Bag = Partial<Record<ItemId, number>>;
export type Facility = {
  economyVersion?: number;
  tycoonVersion?: number;
  accessory?: string;
  visiting?: boolean;
  version: number;
  zone: ZoneId;
  inventory: Bag;
  bank: Bag;
  unlocked: ZoneId[];
  builds: Record<string, number>;
  power: number;
  cooling: number;
  skills: Record<SkillId, number>;
  stats: Record<string, number>;
  claims: string[];
  cooldowns: Record<string, number>;
  craft: { recipe: string; readyAt: number } | null;
  energy: number;
  energyAt: number;
  storage: number;
  outfit: string;
  owned: string[];
  day: string;
  daily: Record<string, number>;
  dailyClaims: string[];
  workdays: number;
  lastWorkday: string;
  requests: string[];
  seen: string[];
  compute: number;
  demoNoobius: number;
  computeAt: number;
  storedCompute: number;
  computeBoost: number;
  workload: {
    id: string;
    rack: string;
    label: string;
    startedAt: number;
    readyAt: number;
    reward: number;
  } | null;
  incident: {
    at: number;
    rack: string;
    kind: 'heat' | 'power' | 'network';
    startedAt: number | null;
  } | null;
};
export const ITEMS: Record<
  ItemId,
  { name: string; short: string; color: string; buy: number; sell: number }
> = {
  scrap: {
    name: 'Scrap',
    short: 'AL',
    color: '#a7bcc6',
    buy: 5,
    sell: 1,
  },
  copper: {
    name: 'Copper wire',
    short: 'CU',
    color: '#f8ad70',
    buy: 7,
    sell: 2,
  },
  coolant: { name: 'Coolant', short: 'H₂O', color: '#7bdedb', buy: 8, sell: 2 },
  silicon: {
    name: 'Chips',
    short: 'SI',
    color: '#d1a9ef',
    buy: 12,
    sell: 3,
  },
  fiber: {
    name: 'Fiber',
    short: 'FX',
    color: '#9cddbc',
    buy: 12,
    sell: 3,
  },
  core: { name: 'Data core', short: 'DC', color: '#ffca83', buy: 45, sell: 10 },
  kit: {
    name: 'Repair kit',
    short: 'KIT',
    color: '#efd694',
    buy: 65,
    sell: 12,
  },
  board: {
    name: 'Compute board',
    short: 'PCB',
    color: '#9ecd92',
    buy: 80,
    sell: 18,
  },
  pump: {
    name: 'Coolant pump',
    short: 'PMP',
    color: '#8bd9dc',
    buy: 100,
    sell: 22,
  },
  battery: {
    name: 'Power cell',
    short: 'PWR',
    color: '#ebdb80',
    buy: 100,
    sell: 22,
  },
  coffee: {
    name: 'Emergency coffee',
    short: 'CAF',
    color: '#c79367',
    buy: 15,
    sell: 3,
  },
};
export const ZONES: {
  id: ZoneId;
  name: string;
  label: string;
  x: number;
  z: number;
  color: string;
  cost: number;
  modules: number;
  description: string;
}[] = [
  {
    id: 'commons',
    name: 'Crew Commons',
    label: '01 / CREW COMMONS',
    x: 0,
    z: 12,
    color: '#badf93',
    cost: 0,
    modules: 0,
    description:
      'Your home floor. Restore the first racks and meet the night crew.',
  },
  {
    id: 'salvage',
    name: 'Salvage Yard',
    label: '02 / SALVAGE YARD',
    x: -22,
    z: 12,
    color: '#eda76e',
    cost: 0,
    modules: 0,
    description: 'Yesterday’s hardware. Tomorrow’s questionable upgrade.',
  },
  {
    id: 'workshop',
    name: 'Workshop',
    label: '03 / WORKSHOP',
    x: 22,
    z: 12,
    color: '#d4b2ea',
    cost: 0,
    modules: 0,
    description:
      'Turn rescued parts into equipment that almost certainly works.',
  },
  {
    id: 'thermal',
    name: 'Cooling room',
    label: '04 / COOLING',
    x: -22,
    z: -10,
    color: '#7be0d5',
    cost: 100,
    modules: 1,
    description:
      'Harvest coolant, build pumps, and keep the future below boiling.',
  },
  {
    id: 'compute',
    name: 'GPU room',
    label: '05 / GPU ROOM',
    x: 0,
    z: -10,
    color: '#96b9f3',
    cost: 750,
    modules: 2,
    description:
      'Better silicon, bigger racks, and more requests from management.',
  },
  {
    id: 'network',
    name: 'Network room',
    label: '06 / NETWORK',
    x: 22,
    z: -10,
    color: '#efca7a',
    cost: 2000,
    modules: 4,
    description: 'Recover fiber and get your growing cluster talking.',
  },
  {
    id: 'core',
    name: 'Core room',
    label: '07 / CORE ROOM',
    x: 0,
    z: -32,
    color: '#f69081',
    cost: 6000,
    modules: 6,
    description:
      'Recover rare data cores from the abandoned cluster. Pack coffee.',
  },
];
export type WorldObject = {
  id: string;
  kind: 'node' | 'npc' | 'build' | 'terminal' | 'gate';
  zone: ZoneId;
  x: number;
  z: number;
  name: string;
  item?: ItemId;
  amount?: number;
  panel?: string;
  hazard?: number;
};
export const OBJECTS: WorldObject[] = [
  {
    id: 'margo',
    kind: 'npc',
    zone: 'commons',
    x: -4,
    z: 9,
    name: 'Margo · Your guide',
    panel: 'contracts',
  },
  {
    id: 'bank',
    kind: 'terminal',
    zone: 'commons',
    x: 5,
    z: 9,
    name: 'Employee lockers',
    panel: 'inventory',
  },
  {
    id: 'repair',
    kind: 'terminal',
    zone: 'commons',
    x: 0,
    z: 7,
    name: 'Maintenance dispatch',
    panel: 'jobs',
  },
  {
    id: 'rack-a',
    kind: 'build',
    zone: 'commons',
    x: -4,
    z: 15,
    name: 'Starter machine',
  },
  {
    id: 'rack-b',
    kind: 'build',
    zone: 'commons',
    x: 4,
    z: 15,
    name: 'Backup machine',
  },
  {
    id: 'scrap-a',
    kind: 'node',
    zone: 'salvage',
    x: -27,
    z: 8,
    name: 'Retired chassis',
    item: 'scrap',
    amount: 5,
  },
  {
    id: 'scrap-b',
    kind: 'node',
    zone: 'salvage',
    x: -18,
    z: 9,
    name: 'Mystery motherboard',
    item: 'silicon',
    amount: 2,
  },
  {
    id: 'copper-a',
    kind: 'node',
    zone: 'salvage',
    x: -26,
    z: 16,
    name: 'Cable mountain',
    item: 'copper',
    amount: 4,
  },
  {
    id: 'scrap-c',
    kind: 'node',
    zone: 'salvage',
    x: -18,
    z: 16,
    name: 'Warranty expired',
    item: 'scrap',
    amount: 5,
  },
  {
    id: 'bit',
    kind: 'npc',
    zone: 'salvage',
    x: -22,
    z: 11,
    name: 'Bit · Spare parts',
    panel: 'market',
  },
  {
    id: 'workbench',
    kind: 'terminal',
    zone: 'workshop',
    x: 19,
    z: 9,
    name: 'Fabrication bench',
    panel: 'crafting',
  },
  {
    id: 'utilities',
    kind: 'terminal',
    zone: 'workshop',
    x: 26,
    z: 9,
    name: 'Power & cooling',
    panel: 'facility',
  },
  {
    id: 'outfitter',
    kind: 'npc',
    zone: 'workshop',
    x: 23,
    z: 16,
    name: 'Patch · Crew outfitter',
    panel: 'skills',
  },
  {
    id: 'coolant-a',
    kind: 'node',
    zone: 'thermal',
    x: -26,
    z: -13,
    name: 'Condensation tank',
    item: 'coolant',
    amount: 5,
  },
  {
    id: 'coolant-b',
    kind: 'node',
    zone: 'thermal',
    x: -18,
    z: -8,
    name: 'Chilled return line',
    item: 'coolant',
    amount: 5,
  },
  {
    id: 'rack-c',
    kind: 'build',
    zone: 'thermal',
    x: -26,
    z: -7,
    name: 'Chiller rack',
  },
  {
    id: 'silicon-a',
    kind: 'node',
    zone: 'compute',
    x: -5,
    z: -14,
    name: 'GPU recovery bin',
    item: 'silicon',
    amount: 4,
  },
  {
    id: 'rack-d',
    kind: 'build',
    zone: 'compute',
    x: 1,
    z: -13,
    name: 'Inference rack',
  },
  {
    id: 'rack-e',
    kind: 'build',
    zone: 'compute',
    x: 5,
    z: -6,
    name: 'Training rack',
  },
  {
    id: 'fiber-a',
    kind: 'node',
    zone: 'network',
    x: 18,
    z: -13,
    name: 'Optical spools',
    item: 'fiber',
    amount: 4,
  },
  {
    id: 'fiber-b',
    kind: 'node',
    zone: 'network',
    x: 27,
    z: -6,
    name: 'Switch graveyard',
    item: 'copper',
    amount: 5,
  },
  {
    id: 'rack-f',
    kind: 'build',
    zone: 'network',
    x: 25,
    z: -13,
    name: 'Exchange rack',
  },
  {
    id: 'core-a',
    kind: 'node',
    zone: 'core',
    x: -5,
    z: -35,
    name: 'Ghost cluster',
    item: 'core',
    amount: 1,
    hazard: 18,
  },
  {
    id: 'core-b',
    kind: 'node',
    zone: 'core',
    x: 5,
    z: -29,
    name: 'Forgotten checkpoint',
    item: 'core',
    amount: 1,
    hazard: 18,
  },
  {
    id: 'rack-g',
    kind: 'build',
    zone: 'core',
    x: 5,
    z: -35,
    name: 'The big one',
  },
  ...(['thermal', 'compute', 'network', 'core'] as ZoneId[]).map((zone) => {
    const d = ZONES.find((z) => z.id === zone)!;
    return {
      id: 'gate-' + zone,
      kind: 'gate' as const,
      zone,
      x: d.x,
      z: d.z + 8,
      name: d.name + ' access',
    };
  }),
];
export const RECIPES: {
  id: ItemId;
  name: string;
  cost: Bag;
  seconds: number;
  skill: number;
  zone: ZoneId;
  description: string;
}[] = [
  {
    id: 'kit',
    name: 'Repair kit',
    cost: { scrap: 6, copper: 3 },
    seconds: 5,
    skill: 1,
    zone: 'workshop',
    description: 'The essential ingredient for restoring every rack.',
  },
  {
    id: 'board',
    name: 'Compute board',
    cost: { scrap: 4, copper: 3, silicon: 3 },
    seconds: 8,
    skill: 1,
    zone: 'workshop',
    description: 'Upgrade rack capacity and deliver engineering contracts.',
  },
  {
    id: 'pump',
    name: 'Coolant pump',
    cost: { scrap: 6, copper: 3, coolant: 5 },
    seconds: 10,
    skill: 2,
    zone: 'thermal',
    description: 'Expand the cooling budget for a bigger cluster.',
  },
  {
    id: 'battery',
    name: 'Power cell',
    cost: { scrap: 5, copper: 4, silicon: 2 },
    seconds: 10,
    skill: 2,
    zone: 'workshop',
    description: 'Expand the power budget. Please keep it dry.',
  },
  {
    id: 'coffee',
    name: 'Emergency coffee',
    cost: { coolant: 2, scrap: 1 },
    seconds: 4,
    skill: 1,
    zone: 'thermal',
    description: 'Restores 35 suit energy on Hot Zone expeditions.',
  },
];
export const STORY = [
  {
    id: 'welcome',
    name: 'Welcome to the night shift',
    text: 'Margo needs 5 recovered parts. Salvage retired hardware in the yard.',
    stat: 'gathered',
    target: 5,
    credits: 25,
    xp: 20,
  },
  {
    id: 'maker',
    name: 'Some assembly required',
    text: 'Craft your first component at Engineering.',
    stat: 'crafted',
    target: 1,
    credits: 35,
    xp: 25,
  },
  {
    id: 'first-light',
    name: 'Let there be blinking lights',
    text: 'Restore a rack in Crew Commons. Your facility will keep it online.',
    stat: 'modules',
    target: 1,
    credits: 70,
    xp: 40,
  },
  {
    id: 'technician',
    name: 'Please close the ticket',
    text: 'Complete three maintenance repairs through the dispatch terminal.',
    stat: 'repairs',
    target: 3,
    credits: 60,
    xp: 40,
  },
  {
    id: 'expansion',
    name: 'Management found another room',
    text: 'Open Cooling room and the GPU room.',
    stat: 'departments',
    target: 5,
    credits: 100,
    xp: 60,
  },
  {
    id: 'capacity',
    name: 'We need more compute',
    text: 'Install four rack modules across your facility.',
    stat: 'modules',
    target: 4,
    credits: 120,
    xp: 70,
  },
  {
    id: 'networked',
    name: 'The cloud has cables',
    text: 'Gather 12 optical fibers in Network room.',
    stat: 'fiber',
    target: 12,
    credits: 150,
    xp: 80,
  },
  {
    id: 'ghosts',
    name: 'Who left this cluster running?',
    text: 'Recover three data cores from the Hot Zone.',
    stat: 'core',
    target: 3,
    credits: 180,
    xp: 100,
  },
  {
    id: 'lead',
    name: 'Head of questionable infrastructure',
    text: 'Install ten permanent rack modules.',
    stat: 'modules',
    target: 10,
    credits: 250,
    xp: 150,
  },
];
export const ORDERS = [
  {
    id: 'cables',
    name: 'Untangle the internet',
    cost: { copper: 12 } as Bag,
    reward: 30,
    zone: 'commons' as ZoneId,
  },
  {
    id: 'boards',
    name: 'Startup needs GPUs yesterday',
    cost: { board: 2 } as Bag,
    reward: 90,
    zone: 'compute' as ZoneId,
  },
  {
    id: 'cooling',
    name: 'The hot aisle is too hot',
    cost: { pump: 1, coolant: 5 } as Bag,
    reward: 80,
    zone: 'thermal' as ZoneId,
  },
  {
    id: 'optics',
    name: 'A very long network cable',
    cost: { fiber: 12, kit: 1 } as Bag,
    reward: 100,
    zone: 'network' as ZoneId,
  },
  {
    id: 'archive',
    name: 'Recover the forgotten model',
    cost: { core: 3, board: 1 } as Bag,
    reward: 180,
    zone: 'core' as ZoneId,
  },
];
export const OUTFITS = [
  { id: 'starter-blue', name: 'Cloud blue', price: 0, color: '#6baecb' },
  { id: 'starter-coral', name: 'Coral crew', price: 0, color: '#dc8e7c' },
  { id: 'classic', name: 'Original issue', price: 0, color: '#d1d8c8' },
  { id: 'hazmat', name: 'Hazard pay', price: 180, color: '#f1ae52' },
  { id: 'night', name: 'Night supervisor', price: 250, color: '#485d83' },
  { id: 'mint', name: 'Green lights only', price: 350, color: '#8dba74' },
  { id: 'afterhours', name: 'After-hours gold', price: 0, color: '#f4cc65' },
];
export const DAILY_TASKS = [
  {
    id: 'gather',
    name: 'Collect 30 parts',
    stat: 'gathered',
    target: 30,
    cr: 35,
  },
  {
    id: 'craft',
    name: 'Make 3 useful parts',
    stat: 'crafted',
    target: 3,
    cr: 35,
  },
  { id: 'repair', name: 'Fix 3 systems', stat: 'repairs', target: 3, cr: 50 },
];
export function newFacility(now = Date.now()): Facility {
  return {
    economyVersion: 2,
    tycoonVersion: 1,
    accessory: 'none',
    version: 0,
    zone: 'commons',
    inventory: {},
    bank: {},
    unlocked: ['commons', 'salvage', 'workshop'],
    builds: {},
    power: 0,
    cooling: 0,
    skills: { salvaging: 0, engineering: 0, operations: 0 },
    stats: {},
    claims: [],
    cooldowns: {},
    craft: null,
    energy: 100,
    energyAt: now,
    storage: 0,
    outfit: 'classic',
    owned: ['classic'],
    day: dayKey(now),
    daily: {},
    dailyClaims: [],
    workdays: 0,
    lastWorkday: '',
    requests: [],
    seen: ['commons'],
    compute: 0,
    demoNoobius: 0,
    computeAt: now,
    storedCompute: 0,
    computeBoost: 0,
    workload: null,
    incident: null,
  };
}
export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);
// Saved facility versions are concurrency counters. Read-time defaults and
// day rollover must preserve that counter and every existing earned item.
export function normalizeFacility(
  saved: Partial<Facility>,
  now = Date.now(),
): Facility {
  const fresh = newFacility(now);
  const f = {
    ...fresh,
    ...saved,
    skills: { ...fresh.skills, ...saved.skills },
  };
  if (f.day !== dayKey(now)) {
    f.day = dayKey(now);
    f.daily = {};
    f.dailyClaims = [];
  }
  // Settle the old rate once before enabling the tycoon economy. Keep every
  // earned item, pending job, claim and the separate currency migration flag.
  if (saved.tycoonVersion !== 1) {
    f.storedCompute = storedComputeNow({ ...f, tycoonVersion: undefined }, now);
    f.computeAt = now;
    f.tycoonVersion = 1;
  }
  return f;
}
export const itemCount = (bag: Bag) =>
  Object.values(bag).reduce((a, b) => a + (b ?? 0), 0);
export const skillLevel = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 20));
export const modules = (f: Facility) =>
  Object.values(f.builds).reduce((a, b) => a + b, 0);
export const capacity = (f: Facility) => modules(f) * 4;
export const COMPUTE_JOBS = [
  {
    id: 'quick',
    name: 'Quick boost',
    seconds: 15,
    base: 8,
    perLevel: 2,
    required: 1,
  },
  {
    id: 'heavy',
    name: 'Big boost',
    seconds: 35,
    base: 20,
    perLevel: 3,
    required: 3,
  },
] as const;
export const OUTAGE_STEPS = {
  heat: ['Stop the job', 'Open cooling', 'Restart the rack'],
  power: ['Disconnect power', 'Reset the breaker', 'Reconnect power'],
  network: ['Pause traffic', 'Reseat the cable', 'Restore the link'],
} as const;
export const OUTAGE_NAMES = {
  heat: 'Rack overheating',
  power: 'Power trip',
  network: 'Network dropout',
};
export const activeIncident = (f: Facility, now = Date.now()) =>
  f.incident && now >= f.incident.at ? f.incident : null;
export const computeTankCapacity = (f: Facility) =>
  f.tycoonVersion === 1
    ? Math.max(240, computePerTick(f) * 4 * 60)
    : 120 + modules(f) * 30 + f.computeBoost * 50;
export const computePerTick = (f: Facility) =>
  f.tycoonVersion === 1
    ? productionUnits(f) * (6 + f.computeBoost * 3)
    : modules(f) * (1 + f.computeBoost);
export const MACHINE_POWER: Record<string, number> = {
  'rack-a': 1,
  'rack-b': 1,
  'rack-c': 2,
  'rack-d': 3,
  'rack-e': 4,
  'rack-f': 6,
  'rack-g': 10,
};
export const productionUnits = (f: Facility) =>
  Object.entries(f.builds).reduce(
    (sum, [id, level]) => sum + level * (MACHINE_POWER[id] ?? 1),
    0,
  );
export const machineGain = (f: Facility, id: string) =>
  (MACHINE_POWER[id] ?? 1) * (6 + f.computeBoost * 3) * 4;
export const BOOST_PRICES = [20, 200, 900, 3500, 12000] as const;
const RACK_PRICES: Record<string, number> = {
  'rack-a': 45,
  'rack-b': 75,
  'rack-c': 180,
  'rack-d': 450,
  'rack-e': 800,
  'rack-f': 1800,
  'rack-g': 4500,
};
export const rackPrice = (f: Facility, id: string) =>
  modules(f) === 0 ? 0 : (RACK_PRICES[id] ?? 75) * 2 ** (f.builds[id] ?? 0);
export const rackCount = (f: Facility) =>
  Object.values(f.builds).filter((n) => n > 0).length;
export function storedComputeNow(f: Facility, now = Date.now()) {
  const until = Math.max(
    f.computeAt,
    f.tycoonVersion === 1 ? now : Math.min(now, f.incident?.at ?? now),
  );
  return Math.min(
    computeTankCapacity(f),
    f.storedCompute +
      Math.max(0, Math.floor((until - f.computeAt) / 15000)) *
        computePerTick(f),
  );
}
export const INTRO_IDS = [
  'identity',
  'arrival',
  'welcome',
  'salvage',
  'craft',
  'rack',
  'compute',
  'outage',
] as const;
export function introReady(f: Facility, id: string): boolean {
  return (
    id === 'identity' ||
    id === 'arrival' ||
    id === 'welcome' ||
    (id === 'salvage' && (f.stats.gathered ?? 0) > 0) ||
    (id === 'craft' && (f.stats.crafted ?? 0) > 0) ||
    (id === 'rack' && modules(f) > 0) ||
    (id === 'compute' && (f.stats.computeJobs ?? 0) > 0) ||
    (id === 'outage' && (f.stats.outages ?? 0) > 0)
  );
}
function scheduleIncident(f: Facility, now: number, first = false) {
  const racks = Object.keys(f.builds)
    .filter((id) => f.builds[id] > 0)
    .sort();
  if (!racks.length) return;
  const kinds = ['heat', 'power', 'network'] as const;
  f.incident = {
    at: now + (first ? 300000 : 300000 + Math.floor(Math.random() * 300000)),
    rack: racks[Math.floor(Math.random() * racks.length)],
    kind: first ? 'heat' : kinds[Math.floor(Math.random() * kinds.length)],
    startedAt: null,
  };
}
export const powerBudget = (f: Facility) => 6 + f.power * 6;
export const coolingBudget = (f: Facility) => 4 + f.cooling * 4;
export const energyNow = (f: Facility, now = Date.now()) =>
  Math.min(100, f.energy + Math.floor((now - f.energyAt) / 5000));
export const canPay = (bag: Bag, cost: Bag) =>
  Object.entries(cost).every(([id, n]) => (bag[id as ItemId] ?? 0) >= (n ?? 0));
export const storyValue = (f: Facility, stat: string) =>
  stat === 'modules'
    ? modules(f)
    : stat === 'departments'
      ? f.unlocked.length
      : (f.stats[stat] ?? 0);
export function buildCost(level: number): { items: Bag; credits: number } {
  return level === 0
    ? { items: { kit: 1, copper: 4 }, credits: 15 }
    : level === 1
      ? { items: { kit: 1, board: 1 }, credits: 55 }
      : { items: { board: 2, fiber: 6, core: 1 }, credits: 120 };
}
export type FacilityAction = {
  type: string;
  id?: string;
  item?: ItemId;
  quantity?: number;
  direction?: string;
  requestId: string;
};
export class FacilityError extends Error {}
export function applyFacility(
  previous: Facility,
  action: FacilityAction,
  credits: number,
  now = Date.now(),
): { facility: Facility; credits: number; xp: number; message: string } {
  const f = normalizeFacility(structuredClone(previous), now);
  f.compute = credits;
  if (f.requests.includes(action.requestId))
    return { facility: f, credits: 0, xp: 0, message: 'Already recorded.' };
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(action.requestId))
    throw new FacilityError('Missing action identifier.');
  const ticks = Math.floor((now - f.energyAt) / 5000);
  f.storedCompute = storedComputeNow(f, now);
  const computeUntil = Math.max(f.computeAt, now);
  f.computeAt =
    f.storedCompute >= computeTankCapacity(f) || !modules(f)
      ? now
      : f.computeAt +
        Math.max(0, Math.floor((computeUntil - f.computeAt) / 15000)) * 15000;
  f.energy = energyNow(f, now);
  f.energyAt = f.energy >= 100 ? now : f.energyAt + ticks * 5000;
  let delta = 0,
    xp = 0,
    message = 'Done.';
  const add = (id: ItemId, n: number, bag = f.inventory) => {
    bag[id] = (bag[id] ?? 0) + n;
  };
  const spend = (cost: Bag, cr = 0) => {
    if (!canPay(f.inventory, cost))
      throw new FacilityError('You need more parts in your backpack.');
    if (credits + delta < cr) throw new FacilityError('You need more Compute.');
    for (const [id, n] of Object.entries(cost)) add(id as ItemId, -n!);
    delta -= cr;
  };
  const count = (stat: string, n = 1) => {
    f.stats[stat] = (f.stats[stat] ?? 0) + n;
    f.daily[stat] = (f.daily[stat] ?? 0) + n;
  };
  const space = (n: number, bag = f.inventory) => {
    if (
      itemCount(bag) + n >
      (bag === f.inventory ? 120 + f.storage * 40 : Number.MAX_SAFE_INTEGER)
    )
      throw new FacilityError(
        'Storage is full. Bank or sell some parts first.',
      );
  };
  switch (action.type) {
    case 'intro-skip': {
      f.seen = [
        ...new Set([...f.seen, ...INTRO_IDS.map((id) => 'intro:' + id)]),
      ];
      message = 'Tips skipped. Your next job stays on screen.';
      break;
    }
    case 'compute-harvest': {
      if (f.storedCompute < 1)
        throw new FacilityError(
          'Your racks are warming up. Compute arrives every 15 seconds.',
        );
      const reward = f.storedCompute;
      f.compute += reward;
      f.storedCompute = 0;
      count('computeEarned', reward);
      count('collections');
      if (!f.incident) scheduleIncident(f, now, true);
      message = `+${reward} Compute. Your machines keep earning.`;
      break;
    }
    case 'compute-upgrade': {
      if (!modules(f))
        throw new FacilityError(
          'Build your first rack before upgrading output.',
        );
      if (f.computeBoost >= 5)
        throw new FacilityError('Compute efficiency is fully upgraded.');
      const cost = BOOST_PRICES[f.computeBoost];
      if (f.compute < cost)
        throw new FacilityError(`You need ${cost} compute for this upgrade.`);
      f.compute -= cost;
      f.computeBoost++;
      message = 'Faster machines! Every machine now makes more Compute.';
      break;
    }
    case 'tycoon-daily': {
      if (f.lastWorkday === f.day || (f.daily.computeEarned ?? 0) < 100)
        throw new FacilityError(
          'Collect 100 Compute today to earn this reward.',
        );
      f.lastWorkday = f.day;
      f.workdays++;
      delta += 35;
      xp = 25;
      if (f.workdays >= 3 && !f.owned.includes('afterhours'))
        f.owned.push('afterhours');
      message =
        f.workdays === 3
          ? 'Gold outfit unlocked! Try it in your Locker.'
          : 'Daily goal complete! +35 Compute.';
      break;
    }
    case 'intro': {
      if (
        !INTRO_IDS.includes(action.id as (typeof INTRO_IDS)[number]) ||
        !introReady(f, action.id!)
      )
        throw new FacilityError('That introduction is not ready yet.');
      if (!f.seen.includes('intro:' + action.id))
        f.seen.push('intro:' + action.id);
      message = 'Let’s get to work.';
      break;
    }
    case 'compute-start': {
      const job = COMPUTE_JOBS.find((j) => j.id === action.id);
      if (!job || modules(f) < job.required)
        throw new FacilityError('Build more rack levels to run this job.');
      if (f.workload)
        throw new FacilityError('Collect your current compute job first.');
      if ((f.cooldowns['compute-boost'] ?? 0) > now)
        throw new FacilityError('Your next bonus boost is still charging.');
      const rack = Object.keys(f.builds).find((id) => f.builds[id] > 0)!;
      f.workload = {
        id: action.requestId,
        rack,
        label: job.name,
        startedAt: now,
        readyAt: now + job.seconds * 1000,
        reward: job.base + modules(f) * job.perLevel,
      };
      f.cooldowns['compute-boost'] = now + 90000;
      message = `${job.name} running. Explore while the rack works.`;
      break;
    }
    case 'compute-collect': {
      if (!f.workload || f.workload.readyAt > now)
        throw new FacilityError('The compute job is still running.');
      const reward = f.workload.reward;
      f.compute += reward;
      count('computeJobs');
      count('computeEarned', reward);
      f.workload = null;
      xp = 10;
      if (!f.incident) scheduleIncident(f, now, true);
      message = `+${reward} compute. Batch complete!`;
      break;
    }
    case 'outage-start': {
      const incident = activeIncident(f, now);
      if (!incident || action.id !== String(incident.at))
        throw new FacilityError('That outage is no longer active.');
      if (incident.startedAt === null) incident.startedAt = now;
      message = 'Fault located. Follow the three repair steps.';
      break;
    }
    case 'outage-fix': {
      const incident = activeIncident(f, now);
      if (!incident || action.id !== String(incident.at))
        throw new FacilityError('That outage is no longer active.');
      if (incident.startedAt === null || now - incident.startedAt < 3000)
        throw new FacilityError('Give the system a moment to reset.');
      if (action.direction !== OUTAGE_STEPS[incident.kind].join('|'))
        throw new FacilityError('Follow the repair steps in order.');
      f.compute += 40;
      count('outages');
      count('computeEarned', 40);
      xp = 20;
      scheduleIncident(f, now);
      message = 'Back online! +40 compute · +20 XP. Your waiting job is safe.';
      break;
    }
    case 'compute-exchange': {
      throw new FacilityError(
        'Token trading is not open. Compute buys equipment and player-listed items.',
      );
    }
    case 'accessory': {
      const accessory = ACCESSORIES.find((a) => a.id === action.id);
      if (!accessory)
        throw new FacilityError('Choose an accessory from your locker.');
      if (!f.owned.includes(accessory.id)) {
        spend({}, accessory.price);
        f.owned.push(accessory.id);
      }
      f.accessory = accessory.id;
      message = 'Look saved. Your crew will see the new you.';
      break;
    }
    case 'travel': {
      const zone = ZONES.find((z) => z.id === action.id);
      if (!zone || !f.unlocked.includes(zone.id))
        throw new FacilityError('Unlock that department first.');
      f.zone = zone.id;
      if (!f.seen.includes(zone.id)) f.seen.push(zone.id);
      message = zone.name;
      break;
    }
    case 'gather': {
      const node = OBJECTS.find((n) => n.id === action.id && n.kind === 'node');
      if (!node?.item || !f.unlocked.includes(node.zone))
        throw new FacilityError('That salvage point is not available.');
      if ((f.cooldowns[node.id] ?? 0) > now)
        throw new FacilityError(
          'This salvage point is replenishing. Try another one.',
        );
      const use = node.hazard ?? 0;
      if (f.energy < use)
        throw new FacilityError(
          'Your suit needs energy. Use coffee or wait for it to recharge.',
        );
      const amount =
        node.amount! +
        Math.min(2, Math.floor(skillLevel(f.skills.salvaging) / 3));
      space(amount);
      add(node.item, amount);
      f.energy -= use;
      f.cooldowns[node.id] = now + (use ? 45000 : 15000);
      f.skills.salvaging += 5;
      count('gathered', amount);
      count(node.item, amount);
      xp = 2;
      message = `+${amount} ${ITEMS[node.item].name}`;
      break;
    }
    case 'craft': {
      const recipe = RECIPES.find((r) => r.id === action.id);
      if (!recipe || !f.unlocked.includes(recipe.zone))
        throw new FacilityError('Unlock the recipe’s department first.');
      if (f.craft)
        throw new FacilityError('Collect your finished craft first.');
      if (skillLevel(f.skills.engineering) < recipe.skill)
        throw new FacilityError('Raise your engineering skill first.');
      spend(recipe.cost);
      f.craft = { recipe: recipe.id, readyAt: now + recipe.seconds * 1000 };
      message = `Making ${recipe.name.toLowerCase()} · ${recipe.seconds} seconds`;
      break;
    }
    case 'collect': {
      if (!f.craft || f.craft.readyAt > now)
        throw new FacilityError('The bench is still working.');
      const recipe = RECIPES.find((r) => r.id === f.craft!.recipe)!;
      space(1);
      add(recipe.id, 1);
      f.craft = null;
      f.skills.engineering += 10;
      count('crafted');
      xp = 5;
      message = recipe.name + ' ready.';
      break;
    }
    case 'build': {
      const plot = OBJECTS.find(
        (o) => o.id === action.id && o.kind === 'build',
      );
      if (!plot || !f.unlocked.includes(plot.zone))
        throw new FacilityError('That rack is in a locked department.');
      const level = f.builds[plot.id] ?? 0;
      if (level >= 3) throw new FacilityError('This rack is fully upgraded.');
      spend({}, rackPrice(f, plot.id));
      f.builds[plot.id] = level + 1;
      f.skills.engineering += 15;
      count('built');
      xp = 15;
      message = level
        ? `Machine upgraded! Now earning ${computePerTick(f) * 4} Compute/min.`
        : `Machine online! Now earning ${computePerTick(f) * 4} Compute/min.`;
      break;
    }
    case 'utility': {
      if (action.id !== 'power' && action.id !== 'cooling')
        throw new FacilityError('Choose a utility.');
      if (f[action.id] >= 8)
        throw new FacilityError('This utility is fully expanded.');
      spend(
        action.id === 'power' ? { battery: 1 } : { pump: 1 },
        40 + f[action.id] * 20,
      );
      f[action.id]++;
      xp = 10;
      message =
        action.id === 'power'
          ? 'More power. Room for 3 more rack levels.'
          : 'More cooling. Room for 4 more rack levels.';
      break;
    }
    case 'unlock': {
      const zone = ZONES.find((z) => z.id === action.id);
      if (!zone || f.unlocked.includes(zone.id))
        throw new FacilityError('That department is already open.');
      if (zone.id === 'core' && !f.unlocked.includes('compute'))
        throw new FacilityError('Open GPU room before entering the Hot Zone.');
      if (modules(f) < zone.modules)
        throw new FacilityError(`Install ${zone.modules} rack modules first.`);
      spend({}, zone.cost);
      f.unlocked.push(zone.id);
      xp = 25;
      message = zone.name + ' is open.';
      break;
    }
    case 'claim': {
      const index = STORY.findIndex((c) => c.id === action.id),
        c = STORY[index];
      if (!c || f.claims.includes(c.id))
        throw new FacilityError('That contract was already claimed.');
      if (index > 0 && !f.claims.includes(STORY[index - 1].id))
        throw new FacilityError('Finish the previous story contract first.');
      if (storyValue(f, c.stat) < c.target)
        throw new FacilityError('The contract is not complete yet.');
      f.claims.push(c.id);
      delta += c.credits;
      xp = c.xp;
      message = `+${c.credits} Compute · +${c.xp} XP. Margo is briefly impressed.`;
      break;
    }
    case 'daily': {
      const c = DAILY_TASKS.find((t) => t.id === action.id);
      if (
        !c ||
        f.dailyClaims.includes(c.id) ||
        (f.daily[c.stat] ?? 0) < c.target
      )
        throw new FacilityError('That daily contract is not ready.');
      f.dailyClaims.push(c.id);
      delta += c.cr;
      xp = 15;
      message = `Daily job complete · +${c.cr} Compute · +15 XP`;
      break;
    }
    case 'daily-bonus': {
      if (
        f.lastWorkday === f.day ||
        !DAILY_TASKS.every((t) => f.dailyClaims.includes(t.id))
      )
        throw new FacilityError(
          'Finish and collect all three daily jobs first.',
        );
      f.lastWorkday = f.day;
      f.workdays++;
      delta += 25;
      xp = 25;
      if (f.workdays >= 3 && !f.owned.includes('afterhours'))
        f.owned.push('afterhours');
      message =
        f.workdays === 3
          ? 'After-hours gold unlocked! Try it on at Patch’s.'
          : `Day ${f.workdays} stamped! +25 Compute. No streak to lose.`;
      break;
    }
    case 'order': {
      const order = ORDERS.find((o) => o.id === action.id);
      if (!order || !f.unlocked.includes(order.zone))
        throw new FacilityError('That order is not available.');
      if ((f.cooldowns['order-' + order.id] ?? 0) > now)
        throw new FacilityError('Dispatch is processing the last delivery.');
      spend(order.cost);
      delta += order.reward;
      xp = 10;
      count('orders');
      f.skills.operations += 10;
      f.cooldowns['order-' + order.id] = now + 30000;
      message = 'Delivery accepted. Compute received.';
      break;
    }
    case 'bank': {
      const id = action.item,
        n = action.quantity;
      if (
        !id ||
        !Object.hasOwn(ITEMS, id) ||
        !Number.isSafeInteger(n) ||
        n! < 1 ||
        n! > 500
      )
        throw new FacilityError('Choose a valid item quantity.');
      const source = action.direction === 'deposit' ? f.inventory : f.bank,
        target = action.direction === 'deposit' ? f.bank : f.inventory;
      if ((source[id] ?? 0) < n!)
        throw new FacilityError('You do not have that many.');
      space(n!, target);
      add(id, -n!, source);
      add(id, n!, target);
      message = 'Storage updated.';
      break;
    }
    case 'buy':
    case 'sell': {
      const id = action.item,
        n = action.quantity;
      if (
        !id ||
        !Object.hasOwn(ITEMS, id) ||
        !Number.isSafeInteger(n) ||
        n! < 1 ||
        n! > 50
      )
        throw new FacilityError('Choose a valid item quantity.');
      if (action.type === 'buy') {
        space(n!);
        spend({}, ITEMS[id].buy * n!);
        add(id, n!);
      } else {
        spend({ [id]: n! });
        delta += ITEMS[id].sell * n!;
      }
      message = 'Trade complete.';
      break;
    }
    case 'coffee': {
      if (f.energy >= 100)
        throw new FacilityError('Your suit is already charged.');
      spend({ coffee: 1 });
      f.energy = Math.min(100, f.energy + 35);
      message = 'Caffeinated. Probably fine.';
      break;
    }
    case 'storage': {
      if (f.storage >= 5)
        throw new FacilityError('Your backpack is fully expanded.');
      spend({ kit: 1 }, 80 + f.storage * 60);
      f.storage++;
      message = '40 more backpack spaces.';
      break;
    }
    case 'outfit': {
      const outfit = OUTFITS.find((o) => o.id === action.id);
      if (!outfit) throw new FacilityError('Unknown outfit.');
      if (outfit.id === 'afterhours' && !f.owned.includes(outfit.id))
        throw new FacilityError(
          'Finish the daily card on 3 different days to earn this shirt.',
        );
      if (!f.owned.includes(outfit.id)) {
        spend({}, outfit.price);
        f.owned.push(outfit.id);
      }
      f.outfit = outfit.id;
      message = 'New shift. New look.';
      break;
    }
    default:
      throw new FacilityError('Unknown facility action.');
  }
  delta += f.compute - credits;
  f.compute = credits + delta;
  f.requests = [...f.requests.slice(-99), action.requestId];
  f.version++;
  return { facility: f, credits: delta, xp, message };
}
export function repairLoot(
  previous: Facility,
  job: string,
  now = Date.now(),
): Facility {
  const f = normalizeFacility(structuredClone(previous), now);
  const item: ItemId =
    job === 'cooling' ? 'coolant' : job === 'boot' ? 'silicon' : 'copper';
  f.bank[item] = (f.bank[item] ?? 0) + 2;
  f.stats.repairs = (f.stats.repairs ?? 0) + 1;
  f.daily.repairs = (f.daily.repairs ?? 0) + 1;
  f.skills.operations += 10;
  f.compute += 15;
  f.stats.computeEarned = (f.stats.computeEarned ?? 0) + 15;
  f.version++;
  return f;
}

export const ACCESSORIES = [
  { id: 'none', name: 'Just the headset', price: 0 },
  { id: 'cap', name: 'Night-shift cap', price: 0 },
  { id: 'pack', name: 'Repair backpack', price: 60 },
  { id: 'beacon', name: 'Emergency beacon', price: 120 },
] as const;
