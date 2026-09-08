import {
  ACCESSORIES,
  ITEMS,
  OBJECTS,
  OUTFITS,
  RECIPES,
  ZONES,
  normalizeFacility,
  type Facility,
} from './facility.ts';
import type { Profile, Shift } from './game.ts';

export const GUEST_SAVE_KEY = 'noobius-guest-v1';
type Snapshot = { profile: Profile; shift: Shift | null };
type Envelope = Snapshot & {
  schemaVersion: 1;
  revision: string;
  savedAt: number;
};
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type LoadResult = {
  snapshot: Snapshot | null;
  issue?: 'unavailable' | 'invalid' | 'newer';
};
type WriteResult =
  | { kind: 'saved' | 'ignored' | 'unavailable' }
  | { kind: 'conflict'; snapshot: Snapshot | null };
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0;
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 256;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 10000 && v.every(text);
const numbers = (v: unknown) =>
  record(v) &&
  Object.entries(v).every(
    ([k, n]) =>
      !['__proto__', 'constructor', 'prototype'].includes(k) && number(n),
  );
const equipment = (v: unknown) =>
  record(v) &&
  ['scanner', 'visor', 'tracer'].every((k) => typeof v[k] === 'boolean');
const zone = (v: unknown) => ZONES.some((z) => z.id === v);
const machine = (v: unknown) =>
  OBJECTS.some((o) => o.kind === 'build' && o.id === v);
const date = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function facility(v: unknown): v is Facility {
  if (
    !record(v) ||
    !zone(v.zone) ||
    !strings(v.unlocked) ||
    !v.unlocked.every(zone) ||
    !v.unlocked.includes(v.zone)
  )
    return false;
  if (
    ![
      'version',
      'power',
      'cooling',
      'energy',
      'energyAt',
      'storage',
      'workdays',
      'compute',
      'demoNoobius',
      'computeAt',
      'storedCompute',
      'computeBoost',
    ].every((k) => number(v[k]))
  )
    return false;
  if (v.energy > 100 || v.storage > 5 || v.computeBoost > 5) return false;
  if (
    ![
      'inventory',
      'bank',
      'builds',
      'skills',
      'stats',
      'cooldowns',
      'daily',
    ].every((k) => numbers(v[k]))
  )
    return false;
  if (
    !['salvaging', 'engineering', 'operations'].every((k) =>
      number(v.skills[k]),
    )
  )
    return false;
  if (
    ![...Object.keys(v.inventory), ...Object.keys(v.bank)].every((k) =>
      Object.hasOwn(ITEMS, k),
    )
  )
    return false;
  if (
    !Object.entries(v.builds).every(
      ([k, n]) => machine(k) && (n as number) <= 3,
    )
  )
    return false;
  if (
    !['claims', 'owned', 'dailyClaims', 'requests', 'seen'].every((k) =>
      strings(v[k]),
    )
  )
    return false;
  if (
    !OUTFITS.some((o) => o.id === v.outfit) ||
    !v.owned.every((id: string) =>
      [...OUTFITS, ...ACCESSORIES].some((o) => o.id === id),
    )
  )
    return false;
  if (
    v.accessory !== undefined &&
    !ACCESSORIES.some((a) => a.id === v.accessory)
  )
    return false;
  if (!date(v.day) || !(v.lastWorkday === '' || date(v.lastWorkday)))
    return false;
  if (v.economyVersion !== 2 || v.tycoonVersion !== 1 || v.visiting)
    return false;
  if (
    v.craft !== null &&
    !(
      record(v.craft) &&
      RECIPES.some((r) => r.id === v.craft.recipe) &&
      number(v.craft.readyAt)
    )
  )
    return false;
  if (
    v.workload !== null &&
    !(
      record(v.workload) &&
      text(v.workload.id) &&
      text(v.workload.label) &&
      machine(v.workload.rack) &&
      ['startedAt', 'readyAt', 'reward'].every((k) => number(v.workload[k]))
    )
  )
    return false;
  if (
    v.incident !== null &&
    !(
      record(v.incident) &&
      machine(v.incident.rack) &&
      ['heat', 'power', 'network'].includes(v.incident.kind) &&
      number(v.incident.at) &&
      (v.incident.startedAt === null || number(v.incident.startedAt))
    )
  )
    return false;
  return true;
}

function profile(v: unknown): v is Profile {
  return (
    record(v) &&
    v.wallet === 'practice' &&
    typeof v.name === 'string' &&
    /^[A-Za-z0-9 _-]{2,20}$/.test(v.name) &&
    ['credits', 'xp', 'shifts', 'bestScore'].every((k) => number(v[k])) &&
    equipment(v.equipment) &&
    facility(v.facility)
  );
}

function shift(v: unknown, now: number): v is Shift {
  if (
    !record(v) ||
    !text(v.id) ||
    !equipment(v.equipment) ||
    !['startedAt', 'credits', 'xp', 'score', 'version'].every((k) =>
      number(v[k]),
    ) ||
    v.startedAt > now ||
    now - v.startedAt >= 86400000 ||
    (v.completedAt !== null && !number(v.completedAt))
  )
    return false;
  if (
    !Array.isArray(v.jobs) ||
    v.jobs.length !== 3 ||
    new Set(v.jobs.map((j) => j?.id)).size !== 3
  )
    return false;
  return v.jobs.every((j) => {
    if (
      !record(j) ||
      !['cooling', 'boot', 'network'].includes(j.id) ||
      !['pending', 'active', 'repaired', 'failed'].includes(j.status) ||
      !number(j.attempts) ||
      j.attempts > 3 ||
      !number(j.score) ||
      !strings(j.requestIds) ||
      typeof j.hintUsed !== 'boolean' ||
      !(j.startedAt === null || number(j.startedAt)) ||
      (j.status !== 'pending' &&
        (!number(j.startedAt) ||
          j.startedAt < v.startedAt ||
          j.startedAt > now)) ||
      !record(j.puzzle) ||
      j.puzzle.type !== j.id
    )
      return false;
    const p = j.puzzle;
    if (j.id === 'cooling')
      return (
        Array.isArray(p.targets) &&
        p.targets.length === 3 &&
        p.targets.every((n: unknown) => number(n) && n <= 100) &&
        p.targets.reduce((sum: number, n: number) => sum + n, 0) === 100 &&
        number(p.tolerance)
      );
    if (j.id === 'boot')
      return (
        Array.isArray(p.sequence) &&
        p.sequence.length === 4 &&
        p.sequence.every((n: unknown) => number(n) && n < 4)
      );
    return (
      Array.isArray(p.mapping) &&
      p.mapping.length === 4 &&
      new Set(p.mapping).size === 4 &&
      p.mapping.every((n: unknown) => number(n) && n < 4) &&
      strings(p.labels) &&
      p.labels.length === 4
    );
  });
}

function decode(raw: string | null, now: number): Envelope | null {
  if (!raw || raw.length > 1_000_000) return null;
  const value = JSON.parse(raw);
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !text(value.revision) ||
    !number(value.savedAt) ||
    !profile(value.profile)
  )
    return null;
  const f = normalizeFacility(value.profile.facility!, now);
  // Device saves never become account data. Credits are the balance; compute
  // is only the facility mirror, just as in an authenticated profile.
  f.compute = value.profile.credits;
  return {
    ...value,
    profile: { ...value.profile, wallet: 'practice', facility: f },
    shift: shift(value.shift, now) ? value.shift : null,
  } as Envelope;
}

// Optimistic revision checks prevent an idle tab overwriting newer progress.
// This storage boundary is exclusively for local practice, never token rewards.
export class GuestSaveStore {
  private revision: string | null = null;
  private fingerprint = '';
  private readOnly = false;
  private storage: () => StoragePort;
  private now: () => number;
  constructor(storage: () => StoragePort, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
  }

  read(): LoadResult {
    try {
      const raw = this.storage().getItem(GUEST_SAVE_KEY);
      this.readOnly = false;
      if (raw && raw.length <= 1_000_000) {
        try {
          const envelope = JSON.parse(raw);
          if (
            record(envelope) &&
            number(envelope.schemaVersion) &&
            envelope.schemaVersion > 1
          ) {
            this.readOnly = true;
            return { snapshot: null, issue: 'newer' };
          }
        } catch {
          /* Invalid local saves fall back to a fresh practice game. */
        }
      }
      const saved = raw ? decode(raw, this.now()) : null;
      this.revision = saved?.revision ?? null;
      const snapshot = saved
        ? { profile: saved.profile, shift: saved.shift }
        : null;
      this.fingerprint = snapshot ? JSON.stringify(snapshot) : '';
      return {
        snapshot,
        ...(raw && !saved ? { issue: 'invalid' as const } : {}),
      };
    } catch (e) {
      this.revision = null;
      this.fingerprint = '';
      return {
        snapshot: null,
        issue: e instanceof SyntaxError ? 'invalid' : 'unavailable',
      };
    }
  }

  write(p: Profile | null, s: Shift | null): WriteResult {
    if (!p || p.wallet !== 'practice') return { kind: 'ignored' };
    if (this.readOnly) return { kind: 'unavailable' };
    const snapshot = { profile: p, shift: s };
    const fingerprint = JSON.stringify(snapshot);
    if (fingerprint === this.fingerprint) return { kind: 'saved' };
    try {
      const storage = this.storage();
      const raw = storage.getItem(GUEST_SAVE_KEY);
      let current: Envelope | null = null;
      if (raw) {
        try {
          const candidate = JSON.parse(raw);
          if (record(candidate) && candidate.schemaVersion > 1)
            return { kind: 'unavailable' };
          current = decode(raw, this.now());
        } catch {
          /* A new valid game can replace unreadable local data. */
        }
      }
      if ((current?.revision ?? null) !== this.revision) {
        const result = this.read();
        return { kind: 'conflict', snapshot: result.snapshot };
      }
      if (!profile(p)) return { kind: 'unavailable' };
      const revision = crypto.randomUUID();
      storage.setItem(
        GUEST_SAVE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          revision,
          savedAt: this.now(),
          ...snapshot,
        }),
      );
      this.revision = revision;
      this.fingerprint = fingerprint;
      return { kind: 'saved' };
    } catch {
      return { kind: 'unavailable' };
    }
  }
}

// Serialize writers across tabs when Web Locks are available. The guard runs
// inside the lock: a queued save must not outlive an account switch or a newer
// render. Older browsers retain revision conflict detection as a fallback.
export async function persistGuestSave(
  store: GuestSaveStore,
  p: Profile | null,
  s: Shift | null,
  isCurrent: () => boolean,
  locks?: Pick<LockManager, 'request'>,
): Promise<WriteResult> {
  const write = (): WriteResult =>
    isCurrent() ? store.write(p, s) : { kind: 'ignored' };
  try {
    return locks ? await locks.request(GUEST_SAVE_KEY, write) : write();
  } catch {
    return { kind: 'unavailable' };
  }
}
