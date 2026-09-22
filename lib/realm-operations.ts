import {
  challengeKind,
  makeRealmChallenge,
  solveRealmChallenge,
  validRealmChallenge,
  type RealmChallenge,
} from './realm-challenges.ts';
import { fieldSite } from './realm-worlds.ts';
import type { Bag, Facility, FacilityAction, SkillId } from './facility.ts';
import {
  checkAnswer,
  newPuzzle,
  EMPTY_EQUIPMENT,
  type Puzzle,
} from './game.ts';
import {
  REALMS,
  realmExists,
  realmFor,
  realmRequirement,
  type RealmId,
} from './realm-catalog.ts';
import { careerFor, operatorLicense } from './contracts.ts';

export type FieldApproach = 'standard' | 'careful' | 'express';
export const FIELD_APPROACHES = [
  {
    id: 'standard',
    name: 'Balanced',
    detail: 'Regular supplies, time and recovery.',
  },
  {
    id: 'careful',
    name: 'Deep recovery',
    detail: 'More time and Compute; recover twice the parts.',
  },
  {
    id: 'express',
    name: 'Quick pass',
    detail: 'Spend extra wire to finish sooner. Regular parts.',
  },
] as const;
export type FieldRun = {
  challenge?: RealmChallenge;
  site?: string;
  version: 1;
  id: string;
  realm: RealmId;
  approach: FieldApproach;
  startedAt: number;
  checkAt: number;
  readyAt: number | null;
  state: 'diagnostics' | 'processing';
  attempts: number;
  puzzle: Puzzle;
  cost: Bag;
  computeCost: number;
  reward: Bag;
  xp: number;
  seconds: number;
};
export type FieldWork = {
  sites?: Record<string, number>;
  version: 1;
  active: FieldRun | null;
  completed: Partial<Record<RealmId, number>>;
  clean: Partial<Record<RealmId, number>>;
  last: {
    id: string;
    realm: RealmId;
    reward: Bag;
    xp: number;
    clean: boolean;
  } | null;
};
export type FieldContext = { xp: number; realm: RealmId; practice?: boolean };
export const newFieldWork = (): FieldWork => ({
  version: 1,
  active: null,
  completed: {},
  clean: {},
  last: null,
});
const TERMS: Record<
  RealmId,
  { compute: number; cost: Bag; reward: Bag; xp: number; seconds: number }
> = {
  commons: {
    compute: 0,
    cost: {},
    reward: { scrap: 4, copper: 2 },
    xp: 12,
    seconds: 35,
  },
  thermal: {
    compute: 20,
    cost: { scrap: 2 },
    reward: { coolant: 8 },
    xp: 20,
    seconds: 50,
  },
  gpu: {
    compute: 45,
    cost: { copper: 2 },
    reward: { silicon: 6, fiber: 2 },
    xp: 30,
    seconds: 65,
  },
  core: {
    compute: 80,
    cost: { silicon: 2, fiber: 2 },
    reward: { core: 2, board: 1 },
    xp: 40,
    seconds: 80,
  },
};
export function fieldQuote(
  realm: RealmId,
  approach: FieldApproach,
  siteIndex = 0,
) {
  const base = TERMS[realm];
  const variants: Record<RealmId, Bag[]> = {
    commons: [base.reward, { copper: 8 }, { kit: 1 }],
    thermal: [base.reward, { coolant: 14 }, { pump: 1 }],
    gpu: [base.reward, { fiber: 8 }, { silicon: 12 }],
    core: [base.reward, { board: 2 }, { core: 4 }],
  };
  const t = {
      ...base,
      compute: base.compute + (siteIndex === 2 ? 45 : siteIndex === 1 ? 20 : 0),
      reward: variants[realm][siteIndex] ?? base.reward,
      seconds: base.seconds + siteIndex * 15,
    },
    deep = approach === 'careful',
    fast = approach === 'express';
  return {
    compute: t.compute + (deep ? Math.max(10, Math.ceil(t.compute * 0.5)) : 0),
    cost: { ...t.cost, ...(fast ? { copper: (t.cost.copper ?? 0) + 2 } : {}) },
    reward: Object.fromEntries(
      Object.entries(t.reward).map(([k, v]) => [k, v! * (deep ? 2 : 1)]),
    ) as Bag,
    xp: t.xp,
    seconds: Math.ceil(t.seconds * (deep ? 1.65 : fast ? 0.65 : 1)),
  };
}
export class FieldError extends Error {}
export const isFieldAction = (type: string) => type.startsWith('field-');
export function applyFieldOperation(
  f: Facility,
  a: FacilityAction,
  now: number,
  context?: FieldContext,
) {
  function fail(message: string): never {
    throw new FieldError(message);
  }
  const work = (f.fieldWork ??= newFieldWork());
  // A completed run can be collected from home even if holder access expires.
  if (a.type === 'field-claim') {
    const run = work.active;
    if (!run || run.id !== a.id)
      fail('This recovery has already been collected or changed.');
    if (run.state !== 'processing' || run.readyAt === null || now < run.readyAt)
      fail('The recovery is still running.');
    // Bank delivery avoids stranding earned results behind a full backpack.
    for (const [item, amount] of Object.entries(run.reward))
      f.bank[item as keyof Bag] = (f.bank[item as keyof Bag] ?? 0) + amount!;
    const clean = run.attempts === 1;
    work.completed[run.realm] = (work.completed[run.realm] ?? 0) + 1;
    if (clean) work.clean[run.realm] = (work.clean[run.realm] ?? 0) + 1;
    f.skills[realmFor(run.realm).skill as SkillId] += run.xp;
    work.last = {
      id: run.id,
      realm: run.realm,
      reward: { ...run.reward },
      xp: run.xp,
      clean,
    };
    if (run.site) {
      work.sites ??= {};
      work.sites[run.site] = (work.sites[run.site] ?? 0) + 1;
    }
    work.active = null;
    return {
      xp: run.xp,
      message: `Recovery collected! Parts sent to Storage. +${run.xp} XP${clean ? ' · Clean run' : ''}.`,
    };
  }
  if (a.type === 'field-abandon') {
    if (!work.active || work.active.id !== a.id)
      fail('That recovery is no longer active.');
    if (work.active.state !== 'diagnostics')
      fail('Processing has begun. Collect your results when ready.');
    work.active = null;
    return {
      xp: 0,
      message: 'Recovery abandoned. Supplies already used are not refunded.',
    };
  }
  if (a.type === 'field-start') {
    if (!context || !realmExists(context.realm))
      fail('Visit a realm field station to begin.');
    const requirement = realmRequirement(
      context.realm,
      context.xp,
      context.practice || operatorLicense(careerFor(f)),
    );
    if (requirement) fail(requirement);
    if (work.active) fail('Finish or abandon your current recovery first.');
    if (a.realm !== context.realm)
      fail('This field station is in another realm.');
    const approach = a.direction as FieldApproach;
    if (!FIELD_APPROACHES.some((v) => v.id === approach))
      fail('Choose a recovery approach.');
    const site = fieldSite(a.id);
    if (!site || site.realm !== context.realm)
      fail('Choose a worksite in your current realm.');
    const quote = fieldQuote(context.realm, approach, site?.index ?? 0);
    if (f.compute < quote.compute)
      fail(`You need ${quote.compute} Compute for this recovery.`);
    if (
      Object.entries(quote.cost).some(
        ([k, v]) => (f.inventory[k as keyof Bag] ?? 0) < v!,
      )
    )
      fail('Bring the listed supplies in your backpack first.');
    for (const [k, v] of Object.entries(quote.cost))
      f.inventory[k as keyof Bag] = (f.inventory[k as keyof Bag] ?? 0) - v!;
    f.compute -= quote.compute;
    work.active = {
      version: 1,
      ...(site
        ? { site: site.id, challenge: makeRealmChallenge(context.realm) }
        : {}),
      id: crypto.randomUUID(),
      realm: context.realm,
      approach,
      startedAt: now,
      checkAt: now + 3000,
      readyAt: null,
      state: 'diagnostics',
      attempts: 0,
      puzzle: newPuzzle(realmFor(context.realm).puzzle, EMPTY_EQUIPMENT),
      cost: { ...quote.cost },
      computeCost: quote.compute,
      reward: { ...quote.reward },
      xp: quote.xp,
      seconds: quote.seconds,
    };
    return {
      xp: 0,
      message: 'Supplies committed. Read the station, then run the diagnostic.',
    };
  }
  const run = work.active;
  if (a.type !== 'field-answer' || !run || run.id !== a.id)
    fail('That recovery is no longer active.');
  // The paid diagnostic is carried on the player's terminal. Finishing owned
  // work never requires renewed holder access; only starting consumes access.
  if (run.state !== 'diagnostics') fail('The recovery is already processing.');
  if (now < run.checkAt)
    fail('Let the diagnostics settle before checking again.');
  if (
    !Array.isArray(a.answer) ||
    a.answer.length > 9 ||
    !a.answer.every(Number.isInteger)
  )
    fail('Choose a valid diagnostic answer.');
  run.attempts++;
  if (
    !(run.challenge
      ? solveRealmChallenge(run.challenge, a.answer)
      : checkAnswer(run.puzzle, a.answer))
  ) {
    run.checkAt = now + 4000;
    return {
      xp: 0,
      message:
        'Not quite. Review the readings and try again. No extra supplies used.',
    };
  }
  run.state = 'processing';
  run.readyAt = now + run.seconds * 1000;
  return {
    xp: 0,
    message:
      'Diagnostic passed. Recovery is running; you can work on another job.',
  };
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const bag = (v: unknown): v is Bag =>
  record(v) &&
  Object.entries(v).every(
    ([k, n]) =>
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
      ].includes(k) && count(n),
  );
const realmCounts = (v: unknown): v is Partial<Record<RealmId, number>> =>
  record(v) && Object.entries(v).every(([k, n]) => realmExists(k) && count(n));
export function validFieldWork(v: unknown): v is FieldWork {
  if (!record(v) || v.version !== 1) return false;
  if (
    v.sites !== undefined &&
    (!record(v.sites) ||
      !Object.entries(v.sites).every(([k, n]) => !!fieldSite(k) && count(n)))
  )
    return false;
  const { completed, clean } = v;
  if (!realmCounts(completed) || !realmCounts(clean)) return false;
  if (REALMS.some((r) => (clean[r.id] ?? 0) > (completed[r.id] ?? 0)))
    return false;
  if (
    v.last !== null &&
    (!record(v.last) ||
      typeof v.last.id !== 'string' ||
      !realmExists(v.last.realm) ||
      !bag(v.last.reward) ||
      !count(v.last.xp) ||
      typeof v.last.clean !== 'boolean')
  )
    return false;
  if (v.active === null) return true;
  const r = v.active;
  if (
    !record(r) ||
    r.version !== 1 ||
    typeof r.id !== 'string' ||
    !/^[a-zA-Z0-9-]{8,80}$/.test(r.id) ||
    !realmExists(r.realm) ||
    !FIELD_APPROACHES.some((a) => a.id === r.approach)
  )
    return false;
  if (
    !count(r.startedAt) ||
    !count(r.checkAt) ||
    !count(r.attempts) ||
    !count(r.computeCost) ||
    !count(r.xp) ||
    !count(r.seconds) ||
    r.seconds < 1 ||
    !bag(r.cost) ||
    !bag(r.reward) ||
    !record(r.puzzle)
  )
    return false;
  if (
    r.checkAt < r.startedAt + 3000 ||
    r.seconds > 86400 ||
    r.xp > 10000 ||
    r.computeCost > 1000000 ||
    Object.values(r.cost).some((n) => Number(n) > 1000000) ||
    Object.values(r.reward).some((n) => Number(n) > 1000000)
  )
    return false;
  if (
    r.state === 'diagnostics'
      ? r.readyAt !== null
      : r.state !== 'processing' ||
        !count(r.readyAt) ||
        r.attempts < 1 ||
        r.readyAt < r.checkAt + r.seconds * 1000
  )
    return false;
  if (
    r.site !== undefined &&
    (typeof r.site !== 'string' ||
      fieldSite(r.site)?.realm !== r.realm ||
      !validRealmChallenge(r.challenge))
  )
    return false;
  if (
    r.challenge !== undefined &&
    (!validRealmChallenge(r.challenge) ||
      r.challenge.kind !== challengeKind[r.realm as RealmId])
  )
    return false;
  if (r.puzzle.type !== realmFor(r.realm).puzzle) return false;
  const p = r.puzzle;
  if (p.type === 'cooling')
    return (
      Array.isArray(p.targets) &&
      p.targets.length === 3 &&
      p.targets.every((n: unknown) => count(n) && Number(n) <= 100) &&
      p.targets.reduce((s: number, n: number) => s + n, 0) === 100 &&
      p.tolerance === 3
    );
  if (
    p.type === 'network' &&
    (!Array.isArray(p.labels) ||
      p.labels.length !== 4 ||
      !p.labels.every(
        (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 40,
      ))
  )
    return false;
  const values = p.type === 'boot' ? p.sequence : p.mapping;
  return (
    Array.isArray(values) &&
    values.length === 4 &&
    values.every((n: unknown) => count(n) && Number(n) <= 3) &&
    (p.type === 'boot' || new Set(values).size === 4)
  );
}
