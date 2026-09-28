// Fixture writes target isolated local D1 only. No hosted accounts or wallets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client } from './api-client.mjs';
import { ACTIVE_COMPUTE_JOBS } from '../lib/facility.ts';
const origin = process.env.NOOBIUS_TEST_ORIGIN;
if (origin !== 'http://127.0.0.1:3003')
  throw Error('Earning fixtures require isolated local port 3003.');
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const sql = (command) =>
  execFileSync(
    './node_modules/.bin/wrangler',
    [
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      '.openai/wrangler.local.json',
      '--persist-to',
      '.wrangler/qa-dispatch',
      '--command',
      command,
      '--json',
    ],
    { stdio: 'pipe' },
  );
const rows = (command) => JSON.parse(sql(command).toString())[0].results;
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
function client(ip, cookies) {
  const c = new Client();
  if (cookies) c.cookies = new Map(cookies);
  const request = c.request.bind(c);
  c.request = (action, body, extra) =>
    request(action, body, { 'cf-connecting-ip': ip, ...extra });
  return c;
}
async function signIn(c) {
  const nonce = ok(
    await c.request('nonce', { address: c.account.address, chainId: 1 }),
  );
  return c.request('verify', {
    signature: await c.account.signMessage({ message: nonce.message }),
  });
}
const wallet = (c) => c.account.address.toLowerCase();
const profile = async (c) => ok(await c.request('profile')).profile;
async function seed(c) {
  const p = await profile(c),
    f = p.facility;
  f.inventory = { copper: 50, scrap: 20, silicon: 20 };
  f.builds = { 'rack-a': 1 };
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(f))},credits=9000 WHERE wallet=${quote(wallet(c))}`,
  );
  assert.equal(
    (await profile(c)).credits,
    9000,
    'Server must use the isolated QA database',
  );
}
function fill(c, amount, source = 'fixture') {
  sql(
    `INSERT INTO earning_events(id,wallet,browser_key,source,compute,materials,created_at) SELECT ${quote(crypto.randomUUID())},wallet,browser_key,${quote(source)},${amount},0,${Date.now()} FROM earning_accounts WHERE wallet=${quote(wallet(c))}`,
  );
}
const action = (c, type, fields = {}) =>
  c.request(
    'facility',
    c.body({ action: { type, requestId: crypto.randomUUID(), ...fields } }),
  );

void test('two wallets in one browser race for the last earning allowance and cannot shed it through logout, new devices or forged request fields', async () => {
  const a = client('192.0.2.51');
  ok(await signIn(a));
  const b = client('192.0.2.51', a.cookies);
  ok(await signIn(b));
  await seed(a);
  await seed(b);
  fill(a, 5900);
  const race = await Promise.all([
    action(a, 'sell', { item: 'copper', quantity: 50 }),
    action(b, 'sell', { item: 'copper', quantity: 50 }),
  ]);
  assert.equal(
    race.filter((r) => r.status === 200).length,
    1,
    JSON.stringify(race),
  );
  assert.equal(
    race.filter((r) => r.status === 429).length,
    1,
    JSON.stringify(race),
  );
  const pa = await profile(a),
    pb = await profile(b);
  assert.equal(pa.credits + pb.credits, 18100);
  assert.equal(pa.facility.inventory.copper + pb.facility.inventory.copper, 50);
  assert.equal(pa.earningAllowance.compute, 0);
  assert.equal(pb.earningAllowance.compute, 0);
  assert.equal(pa.earningAllowance.shared, true);
  const denied = await action(a, 'sell', {
    item: 'scrap',
    quantity: 1,
    now: Date.now() + 86400000,
    earningAllowance: { compute: 6000 },
    browserKey: 'pretend-new-device',
  });
  assert.equal(denied.status, 429, JSON.stringify(denied));
  ok(await a.request('logout', a.body()));
  assert.ok(
    a.cookies.get('noobius_earning_browser'),
    'Logout preserves the browser allowance cookie',
  );
  a.cookies.clear();
  ok(await signIn(a));
  assert.equal(
    (await profile(a)).earningAllowance.compute,
    0,
    'A new cookie cannot detach the wallet from its existing pool',
  );
  ok(await a.request('logout', a.body()));
  ok(await b.request('logout', b.body()));
});

void test('different browsers on the same network keep separate budgets and can both earn', async () => {
  const a = client('192.0.2.52'),
    b = client('192.0.2.52');
  ok(await signIn(a));
  ok(await signIn(b));
  await seed(a);
  await seed(b);
  fill(a, 5900);
  fill(b, 5900);
  ok(await action(a, 'sell', { item: 'copper', quantity: 50 }));
  ok(await action(b, 'sell', { item: 'copper', quantity: 50 }));
  assert.equal((await profile(a)).earningAllowance.shared, false);
  assert.equal((await profile(b)).credits, 9100);
  ok(await a.request('logout', a.body()));
  ok(await b.request('logout', b.body()));
});

void test('a fourth new wallet in one browser is denied atomically, but its returning wallets can sign in', async () => {
  const first = client('192.0.2.53');
  ok(await signIn(first));
  const second = client('192.0.2.53', first.cookies);
  ok(await signIn(second));
  const third = client('192.0.2.53', second.cookies);
  ok(await signIn(third));
  const fourth = client('192.0.2.53', third.cookies);
  const denied = await signIn(fourth);
  assert.equal(denied.status, 429, JSON.stringify(denied));
  assert.match(denied.data.error, /three new centers/);
  // Verify the rejected signup didn't leave a player behind that could bypass
  // the new-account throttle on its next login.
  const again = await signIn(fourth);
  assert.equal(again.status, 429);
  ok(await first.request('logout', first.body()));
  ok(await signIn(first));
  assert.equal((await profile(first)).wallet, wallet(first));
  for (const c of [first, second, third])
    ok(await c.request('logout', c.body()));
});

void test('finite machine work reserves gross payment exactly once and stays collectible with exhausted allowance', async () => {
  const c = client('192.0.2.54');
  ok(await signIn(c));
  await seed(c);
  const original = await profile(c),
    world = { clientId: crypto.randomUUID(), generation: 0 };
  world.generation = ok(
    await c.request(
      'neighborhood-join',
      c.body({ ...world, realm: 'commons' }),
    ),
  ).membership.generation;
  world.generation = ok(
    await c.request(
      'neighborhood-scene',
      c.body({ ...world, scene: 'home-' + original.id }),
    ),
  ).membership.generation;
  const requestId = crypto.randomUUID();
  const start = () =>
    c.request(
      'facility',
      c.body({
        ...world,
        action: {
          type: 'compute-start',
          id: ACTIVE_COMPUTE_JOBS[0].id,
          requestId,
        },
      }),
    );
  ok(await start());
  const p = await profile(c),
    run = p.facility.workload;
  assert.equal(p.earningAllowance.compute, 6000 - run.reward);
  ok(await start());
  assert.equal((await profile(c)).earningAllowance.compute, 6000 - run.reward);
  fill(c, 6000 - run.reward);
  p.facility.workload.readyAt = Date.now() - 1;
  sql(
    `UPDATE players SET facility_state=${quote(JSON.stringify(p.facility))} WHERE wallet=${quote(wallet(c))}`,
  );
  ok(
    await c.request(
      'facility',
      c.body({
        ...world,
        action: { type: 'compute-collect', requestId: crypto.randomUUID() },
      }),
    ),
  );
  assert.equal((await profile(c)).credits, 9000 + run.reward);
  assert.equal((await profile(c)).earningAllowance.compute, 0);
  const unavailable = await c.request(
    'facility',
    c.body({
      ...world,
      action: {
        type: 'compute-start',
        id: ACTIVE_COMPUTE_JOBS[0].id,
        requestId: crypto.randomUUID(),
      },
    }),
  );
  assert.equal(unavailable.status, 429, JSON.stringify(unavailable));
  ok(await c.request('neighborhood-leave', c.body(world)));
  ok(await c.request('logout', c.body()));
});

void test('the diagnostic API books four shifts and refuses a fifth without creating or charging another shift', async () => {
  const c = client('192.0.2.55');
  ok(await signIn(c));
  for (let i = 0; i < 4; i++) {
    const started = ok(await c.request('start', c.body()));
    assert.equal(started.profile.earningAllowance.shifts, 3 - i);
    const replay = ok(await c.request('start', c.body()));
    assert.equal(replay.shift.id, started.shift.id);
    assert.equal(replay.profile.earningAllowance.compute, 6000 - 145 * (i + 1));
    sql(
      `UPDATE shifts SET state=json_set(state,'$.completedAt',${Date.now()}),completed_at=${Date.now()} WHERE id=${quote(started.shift.id)} AND wallet=${quote(wallet(c))}`,
    );
  }
  const fifth = await c.request('start', c.body());
  assert.equal(fifth.status, 429, JSON.stringify(fifth));
  assert.match(fifth.data.error, /Four repair shifts/);
  assert.equal(
    rows(`SELECT COUNT(*) n FROM shifts WHERE wallet=${quote(wallet(c))}`)[0].n,
    4,
  );
  assert.equal((await profile(c)).earningAllowance.compute, 5420);
  assert.equal((await profile(c)).earningAllowance.materials, 544);
  ok(await c.request('logout', c.body()));
});

void test('the crew bonus API retains a pending earned bonus when issuance is full, then claims it only once', async () => {
  const c = client('192.0.2.56');
  ok(await signIn(c));
  await seed(c);
  const room = crypto.randomUUID().replaceAll('-', ''),
    event = Math.floor(Date.now() / 600000) - 1;
  for (const station of ['power', 'cooling', 'network'])
    sql(
      `INSERT INTO campus_work(id,room,event,station,wallet,started_at,completed_at) VALUES (${quote(`${room}:${event}:${station}`)},${quote(room)},${event},${quote(station)},${quote(wallet(c))},${Date.now() - 10000},${Date.now() - 4000})`,
    );
  fill(c, 6000);
  const claim = () => c.request('crew-claim', c.body({ room, event }));
  const denied = await claim();
  assert.equal(denied.status, 429, JSON.stringify(denied));
  assert.equal((await profile(c)).credits, 9000);
  assert.equal(
    rows(
      `SELECT COUNT(*) n FROM campus_rewards WHERE wallet=${quote(wallet(c))}`,
    )[0].n,
    0,
  );
  sql(
    `DELETE FROM earning_events WHERE wallet=${quote(wallet(c))} AND source='fixture'`,
  );
  ok(await claim());
  assert.equal((await profile(c)).credits, 9030);
  assert.equal((await profile(c)).earningAllowance.compute, 5970);
  assert.equal((await claim()).status, 409);
  assert.equal((await profile(c)).credits, 9030);
  ok(await c.request('logout', c.body()));
});
