import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUEST_SAVE_KEY,
  GuestSaveStore,
  persistGuestSave,
} from '../lib/guest-save.ts';
import { guestProfile, newShift } from '../lib/game.ts';
import {
  applyFacility,
  newFacility,
  storedComputeNow,
  computeTankCapacity,
  dayKey,
} from '../lib/facility.ts';

function setup() {
  let now = Date.UTC(2026, 8, 8, 12);
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const makeStore = () =>
    new GuestSaveStore(
      () => storage,
      () => now,
    );
  const profile = guestProfile();
  profile.facility = newFacility(now);
  profile.facility.builds['rack-a'] = 1;
  return {
    data,
    storage,
    makeStore,
    profile,
    get now() {
      return now;
    },
    advance: (ms) => {
      now += ms;
    },
  };
}

test('guest reload preserves name, combined appearance, purchases, money, and production clock', () => {
  const t = setup(),
    p = t.profile;
  p.name = 'ReturnNoob';
  p.credits = 42;
  p.xp = 100;
  p.equipment.visor = true;
  p.facility.computeBoost = 1;
  p.facility.outfit = 'starter-blue';
  p.facility.owned.push('starter-blue');
  p.facility.accessory = 'cap';
  const dressed = applyFacility(
    p.facility,
    { type: 'accessory', id: 'cap', requestId: crypto.randomUUID() },
    p.credits,
    t.now,
  );
  p.facility = dressed.facility;
  p.facility.seen.push('intro:identity', 'intro:welcome');
  const s = newShift(p.equipment, t.now),
    store = t.makeStore();
  assert.equal(store.read().snapshot, null);
  assert.equal(store.write(p, s).kind, 'saved');
  const before = t.data.get(GUEST_SAVE_KEY);
  assert.equal(store.write(p, s).kind, 'saved');
  assert.equal(
    t.data.get(GUEST_SAVE_KEY),
    before,
    'idle renders must not rewrite saves',
  );
  t.advance(60000);
  const restored = t.makeStore().read().snapshot;
  assert.equal(restored.profile.name, p.name);
  assert.equal(restored.profile.credits, 42);
  assert.equal(restored.profile.facility.compute, 42);
  assert.equal(restored.profile.facility.computeAt, p.facility.computeAt);
  assert.equal(restored.profile.facility.outfit, 'starter-blue');
  assert.equal(restored.profile.facility.accessory, 'cap');
  assert.equal(restored.profile.equipment.visor, true);
  assert.equal(restored.shift.id, s.id);
  assert.equal(storedComputeNow(restored.profile.facility, t.now), 36);
});

test('next-day return keeps stamps, caps offline income, and cannot collect the same output twice', () => {
  const t = setup(),
    p = t.profile;
  p.facility.daily.computeEarned = 100;
  const reward = applyFacility(
    p.facility,
    { type: 'tycoon-daily', requestId: crypto.randomUUID() },
    0,
    t.now,
  );
  p.facility = reward.facility;
  p.credits += reward.credits;
  const store = t.makeStore();
  store.read();
  store.write(p, newShift(p.equipment, t.now));
  t.advance(86400000 + 60000);
  const returning = t.makeStore(),
    restored = returning.read().snapshot;
  assert.equal(
    restored.shift,
    null,
    'expired minigames do not erase the tycoon',
  );
  assert.equal(restored.profile.facility.workdays, 1);
  assert.equal(restored.profile.facility.day, dayKey(t.now));
  assert.deepEqual(restored.profile.facility.daily, {});
  assert.equal(
    storedComputeNow(restored.profile.facility, t.now),
    computeTankCapacity(restored.profile.facility),
  );
  const collected = applyFacility(
    restored.profile.facility,
    { type: 'compute-harvest', requestId: crypto.randomUUID() },
    restored.profile.credits,
    t.now,
  );
  const current = {
    ...restored.profile,
    facility: collected.facility,
    credits: restored.profile.credits + collected.credits,
  };
  returning.write(current, null);
  const again = t.makeStore().read().snapshot;
  assert.equal(again.profile.credits, current.credits);
  assert.equal(storedComputeNow(again.profile.facility, t.now), 0);
  assert.throws(
    () =>
      applyFacility(
        again.profile.facility,
        { type: 'compute-harvest', requestId: crypto.randomUUID() },
        again.profile.credits,
        t.now,
      ),
    /warming/,
  );
});

test('account state cannot overwrite or be restored from the guest slot', () => {
  const t = setup(),
    store = t.makeStore();
  store.read();
  store.write(t.profile, null);
  const original = t.data.get(GUEST_SAVE_KEY);
  assert.equal(
    store.write({ ...t.profile, wallet: '0x123' }, null).kind,
    'ignored',
  );
  assert.equal(store.write(null, null).kind, 'ignored');
  assert.equal(t.data.get(GUEST_SAVE_KEY), original);
  const forged = JSON.parse(original);
  forged.profile.wallet = '0x123';
  t.data.set(GUEST_SAVE_KEY, JSON.stringify(forged));
  assert.equal(t.makeStore().read().snapshot, null);
});

test('stale tab changes recover the latest save instead of overwriting it', () => {
  const t = setup(),
    a = t.makeStore(),
    b = t.makeStore();
  a.read();
  b.read();
  a.write({ ...t.profile, credits: 7 }, null);
  const result = b.write({ ...t.profile, credits: 99 }, null);
  assert.equal(result.kind, 'conflict');
  assert.equal(result.snapshot.profile.credits, 7);
  assert.equal(t.makeStore().read().snapshot.profile.credits, 7);
  b.write({ ...result.snapshot.profile, name: 'NewName' }, null);
  const conflict = a.write({ ...t.profile, credits: 8 }, null);
  assert.equal(conflict.kind, 'conflict');
  assert.equal(conflict.snapshot.profile.name, 'NewName');
});

test('corrupt facilities are rejected; corrupt or expired minigames keep the valid facility', () => {
  const t = setup(),
    store = t.makeStore();
  store.read();
  store.write(t.profile, newShift(t.profile.equipment, t.now));
  const original = JSON.parse(t.data.get(GUEST_SAVE_KEY));
  for (const field of [
    'builds',
    'seen',
    'skills',
    'incident',
    'workload',
    'inventory',
  ]) {
    const broken = structuredClone(original);
    broken.profile.facility[field] = 'broken';
    t.data.set(GUEST_SAVE_KEY, JSON.stringify(broken));
    assert.equal(t.makeStore().read().issue, 'invalid', field);
  }
  const broken = structuredClone(original);
  broken.shift.jobs[0].puzzle.targets = null;
  t.data.set(GUEST_SAVE_KEY, JSON.stringify(broken));
  const restored = t.makeStore().read().snapshot;
  assert.equal(restored.shift, null);
  assert.equal(restored.profile.facility.builds['rack-a'], 1);
  t.data.set(GUEST_SAVE_KEY, '{broken');
  const recovery = t.makeStore();
  assert.equal(recovery.read().issue, 'invalid');
  assert.equal(recovery.write(t.profile, null).kind, 'saved');
});

test('newer save versions and unavailable storage are nonfatal and never report success', () => {
  const t = setup();
  const future = JSON.stringify({ schemaVersion: 2, important: 'future save' });
  t.data.set(GUEST_SAVE_KEY, future);
  const old = t.makeStore();
  assert.equal(old.read().issue, 'newer');
  assert.equal(old.write(t.profile, null).kind, 'unavailable');
  assert.equal(t.data.get(GUEST_SAVE_KEY), future);
  const denied = new GuestSaveStore(() => {
    throw new Error('denied');
  });
  assert.equal(denied.read().issue, 'unavailable');
  assert.equal(denied.write(t.profile, null).kind, 'unavailable');
  const full = new GuestSaveStore(() => ({
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  }));
  full.read();
  assert.equal(full.write(t.profile, null).kind, 'unavailable');
});

test('shared lock serializes simultaneous writers and discards a queued save after identity changes', async () => {
  const t = setup(),
    a = t.makeStore(),
    b = t.makeStore();
  a.read();
  b.read();
  let tail = Promise.resolve();
  const locks = {
    request: (_name, callback) => {
      const result = tail.then(callback);
      tail = result.then(() => {});
      return result;
    },
  };
  const results = await Promise.all([
    persistGuestSave(a, { ...t.profile, credits: 11 }, null, () => true, locks),
    persistGuestSave(b, { ...t.profile, credits: 22 }, null, () => true, locks),
  ]);
  assert.deepEqual(
    results.map((r) => r.kind),
    ['saved', 'conflict'],
  );
  assert.equal(t.makeStore().read().snapshot.profile.credits, 11);
  let current = true;
  const queued = persistGuestSave(
    a,
    { ...t.profile, credits: 33 },
    null,
    () => current,
    locks,
  );
  current = false;
  assert.equal((await queued).kind, 'ignored');
  assert.equal(t.makeStore().read().snapshot.profile.credits, 11);
});

test('invalid active-job timestamps and impossible cooling puzzles cannot strand a returning player', () => {
  const t = setup(),
    writer = t.makeStore();
  writer.read();
  writer.write(t.profile, newShift(t.profile.equipment, t.now));
  const original = JSON.parse(t.data.get(GUEST_SAVE_KEY));
  for (const corrupt of [
    (s) => {
      s.jobs[0].status = 'active';
      s.jobs[0].startedAt = null;
    },
    (s) => {
      s.jobs[0].puzzle.targets = [1, 1, 1];
    },
  ]) {
    const broken = structuredClone(original);
    corrupt(broken.shift);
    t.data.set(GUEST_SAVE_KEY, JSON.stringify(broken));
    const saved = t.makeStore().read().snapshot;
    assert.equal(saved.shift, null);
    assert.equal(saved.profile.facility.builds['rack-a'], 1);
  }
});

test('reading and saving an unchanged legacy guest persists the production migration exactly once', () => {
  const t = setup(), p = t.profile;
  delete p.facility.productionVersion;
  p.facility.builds = { 'rack-g': 3 };
  p.facility.computeBoost = 5;
  const first = t.makeStore(); first.read(); first.write(p, null);
  t.advance(30001);
  const store = t.makeStore(), loaded = store.read().snapshot;
  assert.equal(loaded.profile.facility.storedCompute, 1260);
  assert.equal(loaded.profile.facility.productionVersion, 2);
  const before = JSON.parse(t.data.get(GUEST_SAVE_KEY)).revision;
  assert.equal(store.write(loaded.profile, loaded.shift).kind, 'saved');
  const saved = JSON.parse(t.data.get(GUEST_SAVE_KEY));
  assert.notEqual(saved.revision, before);
  assert.equal(saved.profile.facility.productionVersion, 2);
  t.advance(15000);
  const later = t.makeStore().read().snapshot;
  assert.equal(later.profile.facility.storedCompute, 1260);
  assert.equal(storedComputeNow(later.profile.facility, t.now), 1277);
});

test('guest migration handles a concurrent tab and retries failed storage without false success', () => {
  const t = setup(), p = t.profile;
  delete p.facility.productionVersion;
  const initial = t.makeStore(); initial.read(); initial.write(p, null);
  t.advance(30000);
  const a = t.makeStore(), b = t.makeStore();
  const av = a.read().snapshot, bv = b.read().snapshot;
  assert.equal(a.write({ ...av.profile, name: 'NewestName' }, null).kind, 'saved');
  const conflict = b.write(bv.profile, bv.shift);
  assert.equal(conflict.kind, 'conflict');
  assert.equal(conflict.snapshot.profile.name, 'NewestName');
  assert.equal(conflict.snapshot.profile.facility.productionVersion, 2);
  assert.equal(b.write(conflict.snapshot.profile, null).kind, 'saved');

  const raw = JSON.parse(t.data.get(GUEST_SAVE_KEY));
  delete raw.profile.facility.productionVersion;
  t.data.set(GUEST_SAVE_KEY, JSON.stringify(raw));
  const retry = t.makeStore(), v = retry.read().snapshot;
  const originalSet = t.storage.setItem;
  t.storage.setItem = () => { throw new Error('quota'); };
  assert.equal(retry.write(v.profile, v.shift).kind, 'unavailable');
  assert.equal(JSON.parse(t.data.get(GUEST_SAVE_KEY)).profile.facility.productionVersion, undefined);
  t.storage.setItem = originalSet;
  assert.equal(retry.write(v.profile, v.shift).kind, 'saved');
  assert.equal(JSON.parse(t.data.get(GUEST_SAVE_KEY)).profile.facility.productionVersion, 2);
});

test('future production versions cannot be replaced by a fresh guest fallback', () => {
  const t = setup(), a = t.makeStore(); a.read(); a.write(t.profile, null);
  const newer = JSON.parse(t.data.get(GUEST_SAVE_KEY));
  newer.profile.facility.productionVersion = 3;
  const raw = JSON.stringify(newer); t.data.set(GUEST_SAVE_KEY, raw);
  const b = t.makeStore();
  assert.equal(b.read().issue, 'newer');
  assert.equal(b.write(t.profile, null).kind, 'unavailable');
  assert.equal(t.data.get(GUEST_SAVE_KEY), raw);
});
