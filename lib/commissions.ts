import type { Bag, Facility, FacilityAction, ItemId } from './facility.ts';
import { availableRacks, careerFor } from './contracts.ts';
import { machinePerTick, workloadCapacity } from './production.ts';
import type { RealmId } from './realm-catalog.ts';
export const SPECIALTIES = ['fast', 'efficient', 'stable'] as const;
export type Specialty = (typeof SPECIALTIES)[number];
export const specialtyName = {
  fast: 'Throughput',
  efficient: 'Resourceful',
  stable: 'Reliability',
};
export type CommissionRun = {
  id: string;
  offer: string;
  name: string;
  client: string;
  specialty: Specialty;
  rack: string;
  quantity: number;
  startedAt: number;
  readyAt: number;
  cost: Bag;
  fee: number;
  reward: number;
  xp: number;
  lostIdle: number;
};
export type Commissions = {
  version: 1;
  serial: number;
  active: CommissionRun[];
  completed: Record<Specialty, number>;
  certificates: Record<Specialty, number>;
  milestone: number;
  baseline: Record<Specialty, number>;
  fieldBaseline: Partial<Record<RealmId, number>>;
  last: { name: string; reward: number; xp: number } | null;
};
export const newCommissions = (): Commissions => ({
  version: 1,
  serial: 1,
  active: [],
  completed: { fast: 0, efficient: 0, stable: 0 },
  certificates: { fast: 0, efficient: 0, stable: 0 },
  milestone: 0,
  baseline: { fast: 0, efficient: 0, stable: 0 },
  fieldBaseline: {},
  last: null,
});
export const commissionsFor = (f: Facility) =>
  f.commissions ?? newCommissions();
const clients = [
  {
    client: 'Night Owl Studio',
    fast: 'The trailer dropped. Everyone clicked.',
    efficient: 'Render the quiet frames.',
    stable: 'Keep the live premiere online.',
  },
  {
    client: 'Small Model Club',
    fast: 'A thousand tiny assistants.',
    efficient: 'Fit more work into less power.',
    stable: 'The model cannot forget its progress.',
  },
  {
    client: 'Open Atlas Lab',
    fast: 'The map needs answers now.',
    efficient: 'Process satellite tiles overnight.',
    stable: 'Save the expedition checkpoint.',
  },
  {
    client: 'Meme Weather Bureau',
    fast: 'Sudden chance of viral traffic.',
    efficient: 'Archive yesterday’s internet.',
    stable: 'Keep the forecast from hallucinating.',
  },
  {
    client: 'Pocket Intelligence',
    fast: 'Voice replies before the awkward pause.',
    efficient: 'A smaller model for a smaller device.',
    stable: 'Sync the fleet without losing a byte.',
  },
  {
    client: 'Grid Neighbors',
    fast: 'Cover the evening demand spike.',
    efficient: 'Move flexible work into the quiet window.',
    stable: 'Protect essential services during maintenance.',
  },
];
export function commissionOffers(f: Facility) {
  const c = commissionsFor(f);
  return SPECIALTIES.map((kind, index) => {
    const client = clients[(c.serial - 1 + index * 2) % clients.length];
    return {
      id: `commission-${c.serial}-${index}`,
      kind,
      client: client.client,
      name: client[kind],
      detail: {
        fast: 'A short deadline: extra wire buys a quicker turnaround.',
        efficient: 'Flexible work: fewer supplies, longer occupation.',
        stable: 'A careful run: crafted components earn a larger payment.',
      }[kind],
    };
  });
}
export const demandedSpecialty = (f: Facility) =>
  SPECIALTIES[(commissionsFor(f).serial - 1) % 3];
export function commissionQuote(
  f: Facility,
  kind: Specialty,
  rack: string,
  quantity: number,
) {
  if (
    !SPECIALTIES.includes(kind) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 30
  )
    throw new CommissionError('Choose 1–30 client units.');
  const c = commissionsFor(f),
    tier = c.certificates[kind],
    scale = Math.min(4, 1 + Math.floor(c.milestone / 2));
  const raw =
    kind === 'efficient'
      ? Math.max(1, Math.ceil(quantity * (0.8 - tier * 0.1)))
      : quantity;
  const cost: Bag = {
    silicon: raw,
    copper: kind === 'fast' ? quantity * 2 : raw,
  };
  if (kind === 'stable') {
    cost.board = Math.ceil(quantity / 8);
    cost.coolant = Math.max(1, Math.ceil(quantity / (2 + tier)));
  }
  const seconds = Math.ceil(
    { fast: 90, efficient: 135, stable: 130 }[kind] *
      (kind === 'fast' ? 1 - tier * 0.1 : 1),
  );
  const fee =
    (kind === 'efficient' ? 4 : kind === 'stable' ? 8 : 6) * quantity * scale;
  const capacity =
    workloadCapacity(f, rack) +
    (kind === 'stable' ? f.cooling : kind === 'fast' ? f.power : tier * 3);
  const demand =
    kind === demandedSpecialty(f)
      ? { fast: 5, efficient: 20, stable: 18 }[kind]
      : 0;
  return {
    cost,
    fee,
    seconds,
    quantity,
    capacity,
    demand,
    reward:
      quantity * ({ fast: 55, efficient: 50, stable: 75 }[kind] + demand) +
      80 * scale,
    xp: 20 + Math.ceil(quantity / 2),
    lostIdle: f.productionVersion === 3 ? 0 : Math.ceil(seconds / 15) * machinePerTick(f, rack),
  };
}
export function milestoneProgress(f: Facility) {
  const c = commissionsFor(f),
    completed = SPECIALTIES.map((k) =>
      Math.max(0, c.completed[k] - c.baseline[k]),
    );
  const field = (r: RealmId) =>
    Math.max(0, (f.fieldWork?.completed[r] ?? 0) - (c.fieldBaseline[r] ?? 0));
  const needed = 3 + Math.min(5, c.milestone),
    jobs = completed.reduce((a, b) => a + b, 0),
    diversity = completed.filter((n) => n > 0).length;
  const visits = {
    reclaim: field('commons'),
    specialist: field('thermal') + field('gpu') + field('core'),
  };
  const cost: Bag = {
    kit: 2 + Math.min(8, c.milestone),
    board: 2 + Math.min(8, c.milestone),
    pump: 1,
  };
  return {
    chapter: c.milestone + 1,
    needed,
    jobs,
    diversity,
    visits,
    cost,
    compute: 1800 + c.milestone * 1200,
    ready:
      jobs >= needed &&
      diversity >= 2 &&
      visits.reclaim >= 1 &&
      visits.specialist >= 1,
  };
}
export class CommissionError extends Error {}
export function applyCommission(f: Facility, a: FacilityAction, now: number) {
  const c = (f.commissions ??= newCommissions());
  function fail(s: string): never {
    throw new CommissionError(s);
  }
  const spend = (cost: Bag, fee: number) => {
    if (f.compute < fee) fail(`You need ${fee} Compute.`);
    for (const [id, n] of Object.entries(cost))
      if ((f.inventory[id as ItemId] ?? 0) < n!)
        fail('Bring the displayed supplies in your backpack.');
    for (const [id, n] of Object.entries(cost))
      f.inventory[id as ItemId] = (f.inventory[id as ItemId] ?? 0) - n!;
    f.compute -= fee;
  };
  if (a.type === 'commission-start') {
    const offer = commissionOffers(f).find((o) => o.id === a.id);
    if (!offer) fail('That board has changed. Review the new offers.');
    if (c.active.length + careerFor(f).active.length >= 2)
      fail('Two client slots are occupied. Finish a client job first.');
    if (!a.rack || !availableRacks(f, now).includes(a.rack))
      fail('Choose an available machine.');
    const q = commissionQuote(f, offer.kind, a.rack, a.quantity ?? 1);
    if (q.quantity > q.capacity) fail('That machine cannot fit this batch.');
    spend(q.cost, q.fee);
    c.active.push({
      id: crypto.randomUUID(),
      offer: offer.id,
      name: offer.name,
      client: offer.client,
      specialty: offer.kind,
      rack: a.rack,
      quantity: q.quantity,
      startedAt: now,
      readyAt: now + q.seconds * 1000,
      cost: { ...q.cost },
      fee: q.fee,
      reward: q.reward,
      xp: q.xp,
      lostIdle: q.lostIdle,
    });
    c.serial++;
    return {
      xp: 0,
      message:
        'Client booked. Supplies and terms are locked. Your other machines remain available.',
    };
  }
  if (a.type === 'commission-claim') {
    const run = c.active.find((r) => r.id === a.id);
    if (!run) fail('This commission has already been collected.');
    if (now < run.readyAt) fail('The client run is still processing.');
    c.active = c.active.filter((r) => r.id !== run.id);
    c.completed[run.specialty]++;
    f.compute += run.reward;
    f.stats.computeEarned = (f.stats.computeEarned ?? 0) + run.reward;
    f.daily.computeEarned = (f.daily.computeEarned ?? 0) + run.reward;
    f.skills.operations += run.xp;
    c.last = { name: run.name, reward: run.reward, xp: run.xp };
    return {
      xp: run.xp,
      message: `${run.client} paid ${run.reward} Compute. +${run.xp} XP · ${specialtyName[run.specialty]} record earned.`,
    };
  }
  if (a.type === 'commission-certify') {
    const specialty = a.id as Specialty;
    if (!SPECIALTIES.includes(specialty)) fail('Choose a specialty.');
    const tier = c.certificates[specialty];
    if (tier >= 3) fail('This specialty is fully certified.');
    if (a.quantity !== tier + 1)
      fail('That certification has changed. Review the next tier.');
    const needed = [3, 8, 18][tier];
    if (c.completed[specialty] < needed)
      fail(`Finish ${needed} ${specialtyName[specialty]} commissions first.`);
    spend({ board: tier + 1, kit: tier + 1 }, [500, 2000, 6000][tier]);
    c.certificates[specialty]++;
    return {
      xp: 0,
      message: `${specialtyName[specialty]} certification ${tier + 1} earned. New bookings use the improved setup.`,
    };
  }
  if (a.type === 'commission-milestone') {
    const p = milestoneProgress(f);
    if (a.id !== `milestone-${p.chapter}`)
      fail('That milestone has already advanced.');
    if (!p.ready) fail('Finish the listed client and realm work first.');
    spend(p.cost, p.compute);
    c.milestone++;
    c.baseline = { ...c.completed };
    c.fieldBaseline = { ...f.fieldWork?.completed };
    return {
      xp: 60,
      message: `Facility distinction ${c.milestone} commissioned! Your center keeps every upgrade. A new portfolio is ready.`,
    };
  }
  fail('Choose a valid commission action.');
}
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const n = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= Number.MAX_SAFE_INTEGER;
const text = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length < 180;
const bag = (v: unknown) =>
  obj(v) &&
  Object.entries(v).every(
    ([id, q]) =>
      [
        'scrap',
        'copper',
        'coolant',
        'silicon',
        'fiber',
        'core',
        'kit',
        'board',
        'pump',
        'battery',
        'coffee',
      ].includes(id) &&
      n(q) &&
      q <= 1000000,
  );
const counts = (v: unknown): v is Record<Specialty, number> =>
  obj(v) && Object.keys(v).length === 3 && SPECIALTIES.every((k) => n(v[k]));
export function validCommissions(v: unknown): v is Commissions {
  if (
    !obj(v) ||
    v.version !== 1 ||
    !n(v.serial) ||
    v.serial < 1 ||
    !n(v.milestone) ||
    !counts(v.completed) ||
    !counts(v.baseline) ||
    !counts(v.certificates) ||
    !obj(v.fieldBaseline) ||
    !Object.entries(v.fieldBaseline).every(
      ([k, q]) => ['commons', 'thermal', 'gpu', 'core'].includes(k) && n(q),
    ) ||
    !Array.isArray(v.active) ||
    v.active.length > 2
  )
    return false;
  const { certificates, baseline, completed } = v;
  if (
    SPECIALTIES.some((k) => certificates[k] > 3 || baseline[k] > completed[k])
  )
    return false;
  if (
    v.last !== null &&
    (!obj(v.last) || !text(v.last.name) || !n(v.last.reward) || !n(v.last.xp))
  )
    return false;
  const ids = new Set(),
    racks = new Set();
  return v.active.every((r) => {
    if (
      !obj(r) ||
      !text(r.id) ||
      !text(r.offer) ||
      !text(r.name) ||
      !text(r.client) ||
      !SPECIALTIES.includes(r.specialty as Specialty) ||
      typeof r.rack !== 'string' ||
      !/^rack-[a-g]$/.test(r.rack) ||
      !n(r.startedAt) ||
      !n(r.readyAt) ||
      r.readyAt <= r.startedAt ||
      r.readyAt - r.startedAt > 86400000 ||
      !n(r.quantity) ||
      r.quantity < 1 ||
      r.quantity > 30 ||
      !bag(r.cost) ||
      !n(r.fee) ||
      !n(r.reward) ||
      !n(r.xp) ||
      !n(r.lostIdle) ||
      ids.has(r.id) ||
      racks.has(r.rack)
    )
      return false;
    ids.add(r.id);
    racks.add(r.rack);
    return true;
  });
}

/** Cross-ledger constraints are checked on load; old saves have no new ledger. */
export function validCommissionContext(f: Partial<Facility>): boolean {
  const c = f.commissions;
  if (!c) return true;
  if (!validCommissions(c)) return false;
  if (c.active.length + (f.career?.active.length ?? 0) > 2) return false;
  if (
    SPECIALTIES.some(
      (k) =>
        c.certificates[k] > 0 &&
        c.completed[k] < [3, 8, 18][c.certificates[k] - 1],
    )
  )
    return false;
  if (
    Object.entries(c.fieldBaseline).some(
      ([realm, n]) => (f.fieldWork?.completed[realm as RealmId] ?? 0) < n!,
    )
  )
    return false;
  for (const run of c.active) {
    if (!(f.builds?.[run.rack] ?? 0)) return false;
    const overlap = (other: {
      rack?: string;
      startedAt?: number | null;
      readyAt?: number | null;
    }) =>
      other.rack === run.rack &&
      other.startedAt != null &&
      other.readyAt != null &&
      other.startedAt < run.readyAt &&
      other.readyAt > run.startedAt;
    if (
      f.career?.active.some((other) => other.rack === run.rack) ||
      f.projectReservations?.some(overlap)
    )
      return false;
    if (f.workload && overlap(f.workload)) return false;
  }
  return true;
}
