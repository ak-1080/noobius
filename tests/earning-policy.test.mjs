import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-d1.mjs';
import {
  applyFacility,
  newActiveFacility,
  ITEMS,
  OBJECTS,
  ACTIVE_COMPUTE_JOBS,
  ORDERS,
} from '../lib/facility.ts';
import {
  EARNING_POLICY,
  facilityEarningCharge,
  materialValue,
} from '../lib/earning-policy.ts';
import {
  earningBatch,
  earningAllowance,
  earningBrowser,
  earningNetwork,
  networkPrefix,
  signupNetworkIp,
} from '../lib/earning-server.ts';
import { newCareer, contractFor } from '../lib/contracts.ts';
import { commissionOffers } from '../lib/commissions.ts';
import {
  newShift,
  answerJob,
  activateJob,
  EMPTY_EQUIPMENT,
} from '../lib/game.ts';
import { auditEarningRoutes } from '../scripts/audit-earning-routes.mjs';

void test('the actual NPC catalogs contain no profitable unlimited buy, craft, batch or delivery loop', () => {
  const audit = auditEarningRoutes();
  assert.ok(audit.npcCycles.filter((r) => r.net !== null).length >= 18);
  assert.ok(audit.npcCycles.every((r) => r.net === null || r.net < 0));
  assert.equal(
    audit.field.length,
    36,
    'Every realm, approach and site is audited',
  );
});

void test('a forged secondary IPv6 header cannot replace a normal edge IP; Pseudo IPv4 requires its valid preserved IPv6', () => {
  assert.equal(
    signupNetworkIp(
      new Headers({
        'cf-connecting-ip': '192.0.2.8',
        'cf-connecting-ipv6': '2001:db8:abcd:12::2',
      }),
    ),
    '192.0.2.8',
  );
  assert.equal(
    signupNetworkIp(new Headers({ 'cf-connecting-ipv6': '2001:db8::2' })),
    null,
  );
  assert.equal(
    signupNetworkIp(
      new Headers({
        'cf-connecting-ip': '240.1.2.3',
        'cf-connecting-ipv6': '2001:db8:abcd:12::2',
      }),
    ),
    '2001:db8:abcd:12::2',
  );
  assert.throws(
    () =>
      signupNetworkIp(
        new Headers({
          'cf-connecting-ip': '240.1.2.3',
          'cf-connecting-ipv6': '192.0.2.9',
        }),
      ),
    /temporarily unavailable/,
  );
  assert.throws(
    () => signupNetworkIp(new Headers({ 'cf-connecting-ip': '240.1.2.3' })),
    /temporarily unavailable/,
  );
});

const now = Date.UTC(2026, 8, 28, 23, 59);
function account(db, wallet = 'alice', browser = null, at = now) {
  const f = newActiveFacility(at);
  f.builds = { 'rack-a': 3, 'rack-b': 3 };
  f.inventory = { scrap: 10, copper: 20, silicon: 20 };
  db.sqlite
    .prepare(
      'INSERT INTO players(wallet,name,created_at,facility_state,credits) VALUES (?,?,?,?,?)',
    )
    .run(wallet, wallet, at, JSON.stringify(f), 10000);
  if (browser)
    db.sqlite
      .prepare(
        'INSERT INTO earning_accounts(wallet,browser_key,created_at) VALUES (?,?,?)',
      )
      .run(wallet, browser, at);
  return wallet;
}
function saved(db, wallet) {
  const row = db.sqlite
    .prepare('SELECT * FROM players WHERE wallet=?')
    .get(wallet);
  return {
    ...JSON.parse(row.facility_state),
    compute: row.credits,
    version: row.facility_version,
  };
}
async function act(db, wallet, type, extra = {}, at = now) {
  const before = saved(db, wallet),
    action = { type, requestId: crypto.randomUUID(), ...extra };
  const result = applyFacility(
    before,
    action,
    before.compute,
    at,
    extra.context,
  );
  await earningBatch(
    db,
    wallet,
    facilityEarningCharge(before, result.facility, action, result.credits),
    [
      db
        .prepare(
          'UPDATE players SET facility_state=?,facility_version=?,credits=credits+? WHERE wallet=? AND facility_version=?',
        )
        .bind(
          JSON.stringify(result.facility),
          result.facility.version,
          result.credits,
          wallet,
          before.version,
        ),
    ],
    at,
  );
  return { action, result };
}
async function credit(db, wallet, amount, source = 'test-reward', at = now) {
  return earningBatch(
    db,
    wallet,
    { source, compute: amount, materials: 0 },
    [
      db
        .prepare('UPDATE players SET credits=credits+? WHERE wallet=?')
        .bind(amount, wallet),
    ],
    at,
  );
}

void test('all issuance shares an exact rolling ceiling, survives midnight/reload, and does not bank idle days', async () => {
  const db = database(),
    wallet = account(db);
  await credit(db, wallet, EARNING_POLICY.compute);
  await assert.rejects(
    credit(db, wallet, 1, 'outage-fix', now + 60000),
    /earning allowance/,
  );
  assert.equal(saved(db, wallet).compute, 16000);
  assert.equal(
    (await earningAllowance(db, wallet, now + EARNING_POLICY.windowMs - 1))
      .compute,
    0,
  );
  await credit(db, wallet, 1, 'daily', now + EARNING_POLICY.windowMs);
  assert.equal(
    (await earningAllowance(db, wallet, now + EARNING_POLICY.windowMs)).compute,
    5999,
  );
  assert.equal(
    (await earningAllowance(db, wallet, now + 7 * EARNING_POLICY.windowMs))
      .compute,
    6000,
  );
});

void test('quota failure rolls back the entire game mutation, inputs, flags and balance; no-op writes consume nothing', async () => {
  const db = database(),
    wallet = account(db);
  await credit(db, wallet, 6000);
  const before = saved(db, wallet);
  await assert.rejects(
    earningBatch(
      db,
      wallet,
      { source: 'order', compute: 30, materials: 0 },
      [
        db
          .prepare(
            "UPDATE players SET facility_state='{}',facility_version=99,credits=credits+30 WHERE wallet=?",
          )
          .bind(wallet),
      ],
      now,
    ),
    /earning allowance/,
  );
  assert.deepEqual(saved(db, wallet), before);
  await earningBatch(
    db,
    wallet,
    { source: 'order', compute: 30, materials: 0 },
    [
      db
        .prepare(
          'UPDATE players SET credits=credits+30 WHERE wallet=? AND facility_version=999',
        )
        .bind(wallet),
    ],
    now,
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM earning_events').get().n,
    1,
  );
});

void test('two linked wallets compete for one pool atomically, while independent players stay separate', async () => {
  const db = database(),
    a = account(db, 'a', 'one-browser'),
    b = account(db, 'b', 'one-browser'),
    c = account(db, 'c', 'other-browser');
  await credit(db, a, 5900);
  const results = await Promise.allSettled([
    credit(db, a, 100),
    credit(db, b, 100),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await earningAllowance(db, b, now)).compute, 0);
  assert.equal((await earningAllowance(db, b, now)).shared, true);
  await credit(db, c, 6000);
  assert.equal((await earningAllowance(db, c, now)).shared, false);
});

void test('relogin on another browser cannot move an enrolled wallet out of its original earning pool', async () => {
  const db = database(),
    a = account(db, 'a', 'original'),
    b = account(db, 'b', 'original');
  await credit(db, a, 6000);
  db.sqlite
    .prepare(
      'INSERT OR IGNORE INTO earning_accounts(wallet,browser_key,created_at) VALUES (?,?,?)',
    )
    .run(b, 'cleared-cookies', now);
  assert.equal(
    db.sqlite
      .prepare('SELECT browser_key FROM earning_accounts WHERE wallet=?')
      .get(b).browser_key,
    'original',
  );
  await assert.rejects(credit(db, b, 1), /earning allowance/);
});

void test('account budget still applies to receipts made before a wallet was linked to a browser', async () => {
  const db = database(),
    a = account(db);
  await credit(db, a, 6000);
  db.sqlite
    .prepare(
      'INSERT INTO earning_accounts(wallet,browser_key,created_at) VALUES (?,?,?)',
    )
    .run(a, 'new-browser', now);
  await assert.rejects(credit(db, a, 1), /earning allowance/);
});

void test('a finite machine batch reserves its full payment at start and can be collected even after the pool fills', async () => {
  const db = database(),
    wallet = account(db);
  const start = await act(db, wallet, 'compute-start', {
    id: ACTIVE_COMPUTE_JOBS[0].id,
  });
  const run = start.result.facility.workload;
  assert.ok(run);
  assert.equal(
    (await earningAllowance(db, wallet, now)).compute,
    6000 - run.reward,
  );
  await credit(db, wallet, 6000 - run.reward);
  await act(db, wallet, 'compute-collect', {}, run.readyAt);
  assert.equal(saved(db, wallet).workload, null);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM earning_events').get().n,
    2,
  );
});

void test('all client families and commissions reserve gross rewards at start, not net after fees or at claim', async () => {
  const db = database(),
    wallet = account(db);
  let f = saved(db, wallet);
  f.career = newCareer(f);
  const offer = f.career.offers.find(
    (o) => contractFor(o).family === 'workload',
  );
  offer.template = 'tiny-model';
  db.sqlite
    .prepare('UPDATE players SET facility_state=? WHERE wallet=?')
    .run(JSON.stringify(f), wallet);
  await act(db, wallet, 'contract-accept', { id: offer.id });
  await act(db, wallet, 'contract-start', { id: offer.id, rack: 'rack-a' });
  f = saved(db, wallet);
  const reward = f.career.active[0].reward;
  await act(db, wallet, 'commission-start', {
    id: commissionOffers(f)[0].id,
    rack: 'rack-b',
  });
  f = saved(db, wallet);
  assert.equal(
    (await earningAllowance(db, wallet, now)).compute,
    6000 - reward - f.commissions.active[0].reward,
  );
  const job = f.career.active[0];
  await act(db, wallet, 'contract-claim', { id: job.id }, job.readyAt);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM earning_events').get().n,
    2,
  );
});

void test('legacy orders share client demand and cannot provide a second uncapped client desk', async () => {
  const db = database(),
    wallet = account(db);
  let f = saved(db, wallet);
  f.inventory.copper = 144;
  f.clientDemand = {
    version: 1,
    bookings: Array.from({ length: 11 }, (_, i) => ({
      kind: 'job',
      id: `prior-job-${i}`,
      at: now,
      reward: 1,
    })),
  };
  db.sqlite
    .prepare('UPDATE players SET facility_state=? WHERE wallet=?')
    .run(JSON.stringify(f), wallet);
  await act(db, wallet, 'order', { id: ORDERS[0].id });
  f = saved(db, wallet);
  assert.equal(f.clientDemand.bookings.length, 12);
  await assert.rejects(
    act(db, wallet, 'order', { id: ORDERS[0].id }, now + 30000),
    /bookings/,
  );
});

void test('salvage extraction is bounded before granting items; linked accounts cannot double recovered supplies', async () => {
  const db = database(),
    a = account(db, 'a', 'same'),
    b = account(db, 'b', 'same');
  const node = OBJECTS.find((n) => n.kind === 'node' && n.item === 'scrap');
  assert.ok(node);
  await earningBatch(
    db,
    a,
    { source: 'field-start', compute: 0, materials: 600 },
    [db.prepare('UPDATE players SET xp=xp+1 WHERE wallet=?').bind(a)],
    now,
  );
  const before = saved(db, b);
  await assert.rejects(
    act(db, b, 'gather', { id: node.id }),
    /Recovered supplies/,
  );
  assert.deepEqual(saved(db, b), before);
  assert.equal((await earningAllowance(db, b, now)).materials, 0);
  await act(db, b, 'gather', { id: node.id }, now + EARNING_POLICY.windowMs);
});

void test('every recovery reserves the full returned parts value and a claim only delivers its already reserved parts', () => {
  const before = newActiveFacility(now),
    after = structuredClone(before);
  after.version++;
  after.fieldWork = { active: { reward: { core: 4, board: 2 } } };
  assert.equal(
    facilityEarningCharge(before, after, { type: 'field-start' }, -80)
      .materials,
    76,
  );
  assert.equal(
    facilityEarningCharge(before, after, { type: 'field-claim' }, 0),
    null,
  );
  assert.equal(
    materialValue({ scrap: 1, copper: 1, coolant: 1, silicon: 1, fiber: 1 }),
    11,
  );
});

void test('NPC sales and every immediate reward enter the same Compute budget, while transfers, crafting and legacy earned output do not', () => {
  const before = newActiveFacility(now),
    after = { ...before, version: 1 };
  for (const type of [
    'sell',
    'claim',
    'daily',
    'daily-bonus',
    'tycoon-daily',
    'order',
    'outage-fix',
    'future-positive-route',
  ])
    assert.equal(
      facilityEarningCharge(before, after, { type }, 40).compute,
      40,
      type,
    );
  for (const type of ['buy', 'bank', 'craft', 'collect', 'coffee'])
    assert.equal(
      facilityEarningCharge(before, after, { type }, -10),
      null,
      type,
    );
  assert.equal(
    facilityEarningCharge(before, after, { type: 'compute-harvest' }, 999999),
    null,
  );
  assert.equal(
    facilityEarningCharge(before, before, { type: 'daily' }, 40),
    null,
  );
});

void test('legacy diagnostic shifts reserve at most four full repair payments and loot allocations for linked wallets', async () => {
  const db = database(),
    a = account(db, 'a', 'same'),
    b = account(db, 'b', 'same');
  for (let i = 0; i < 4; i++) {
    const shift = newShift(EMPTY_EQUIPMENT, now);
    await earningBatch(
      db,
      i % 2 ? a : b,
      { source: 'shift-start', compute: 145, materials: 14 },
      [
        db
          .prepare(
            'INSERT INTO shifts(id,wallet,state,version,mutation,started_at,completed_at) VALUES (?,?,?,0,?,?,?)',
          )
          .bind(
            shift.id,
            i % 2 ? a : b,
            JSON.stringify(shift),
            'test',
            now,
            now + 10000,
          ),
      ],
      now,
    );
  }
  const shift = newShift(EMPTY_EQUIPMENT, now);
  await assert.rejects(
    earningBatch(
      db,
      a,
      { source: 'shift-start', compute: 145, materials: 14 },
      [
        db
          .prepare(
            'INSERT INTO shifts(id,wallet,state,version,mutation,started_at) VALUES (?,?,?,0,?,?)',
          )
          .bind(shift.id, a, JSON.stringify(shift), 'test', now),
      ],
      now,
    ),
    /Four repair shifts/,
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM shifts').get().n,
    4,
  );
  let completed = newShift(EMPTY_EQUIPMENT, now);
  for (const job of completed.jobs) {
    completed = activateJob(completed, job.id, now);
    const puzzle = job.puzzle,
      answer = puzzle.targets ?? puzzle.sequence ?? puzzle.mapping;
    completed = answerJob(
      completed,
      job.id,
      answer,
      crypto.randomUUID(),
      now + 1000,
    ).shift;
  }
  assert.equal(
    completed.credits + 3 * 15,
    145,
    'reserve covers actual full-shift payout',
  );
  assert.equal(
    2 * (ITEMS.coolant.sell + ITEMS.silicon.sell + ITEMS.copper.sell),
    14,
  );
});

void test('signup limits roll back new players, do not ban returning accounts, and expire exactly after 24 hours', async () => {
  const db = database();
  const enroll = async (wallet, browser, network, fresh = 1, at = now) =>
    db.batch([
      db
        .prepare(
          'INSERT OR IGNORE INTO players(wallet,name,created_at) VALUES (?,?,?)',
        )
        .bind(wallet, wallet, at),
      db
        .prepare(
          'INSERT OR IGNORE INTO earning_accounts(wallet,browser_key,network_key,new_account,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(wallet, browser, network, fresh, at),
    ]);
  for (let i = 0; i < 3; i++) await enroll(`same-${i}`, 'one', 'network');
  await assert.rejects(
    enroll('fourth', 'one', 'network'),
    /earning-signup-browser/,
  );
  assert.equal(
    db.sqlite
      .prepare("SELECT COUNT(*) AS n FROM players WHERE wallet='fourth'")
      .get().n,
    0,
  );
  await enroll('same-0', 'one', 'network');
  await enroll('old-returning', 'one', 'network', 0);
  for (let i = 3; i < 20; i++)
    await enroll(`distinct-${i}`, `browser-${i}`, 'network');
  await assert.rejects(
    enroll('network-overflow', 'new-browser', 'network'),
    /earning-signup-network/,
  );
  await enroll(
    'network-overflow',
    'new-browser',
    'network',
    1,
    now + EARNING_POLICY.windowMs,
  );
});

void test('server browser tokens are validated against their registry and a forged value does not choose a known group', async () => {
  const db = database(),
    first = await earningBrowser(db, undefined, now);
  assert.equal((await earningBrowser(db, first.token, now + 1)).key, first.key);
  assert.notEqual(
    (await earningBrowser(db, 'a'.repeat(64), now)).key,
    first.key,
  );
  assert.equal(
    db.sqlite
      .prepare('SELECT key FROM earning_browsers WHERE key=?')
      .get(first.token),
    undefined,
  );
});

void test('network throttle uses salted pseudonyms and IPv6 /64 normalization, without storing raw addresses', async () => {
  const db = database();
  assert.equal(
    networkPrefix('2001:0db8:0000:0001::abcd'),
    networkPrefix('2001:db8:0:1::dead'),
  );
  assert.notEqual(
    networkPrefix('2001:db8:0:1::1'),
    networkPrefix('2001:db8:0:2::1'),
  );
  assert.equal(networkPrefix('999.1.2.3'), null);
  assert.equal(networkPrefix('1:2:3'), null);
  assert.equal(networkPrefix(':::bad'), null);
  assert.equal(networkPrefix('::ffff:192.0.2.4'), '192.0.2.4');
  assert.equal(networkPrefix('::ffff:c000:204'), '192.0.2.4');
  const key = await earningNetwork(db, '192.0.2.4');
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(await earningNetwork(db, '192.0.2.4'), key);
  assert.notEqual(await earningNetwork(db, '192.0.2.5'), key);
  assert.equal(await earningNetwork(db, null), null);
});
