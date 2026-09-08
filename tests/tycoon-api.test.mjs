import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { Client } from './api-client.mjs';
import { newFacility } from '../lib/facility.ts';

const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const act = (c, type, extras = {}) =>
  c.request(
    'facility',
    c.body({ action: { type, requestId: crypto.randomUUID(), ...extras } }),
  );
test('concurrent starter purchases create only one free machine in D1', async () => {
  const c = new Client();
  ok(await c.login());
  const results = await Promise.all([
    act(c, 'build', { id: 'rack-a' }),
    act(c, 'build', { id: 'rack-b' }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.every((r) => [200, 400, 409].includes(r.status)));
  const p = ok(await c.request('profile')).profile;
  assert.equal(p.credits, 0);
  assert.equal(
    Object.values(p.facility.builds).reduce((a, b) => a + b, 0),
    1,
  );
  const next = Object.hasOwn(p.facility.builds, 'rack-a') ? 'rack-b' : 'rack-a';
  assert.equal((await act(c, 'build', { id: next })).status, 400);
});
test('D1 persists the legacy rate transition once before exposing new earnings', async () => {
  assert.match(
    process.env.NOOBIUS_TEST_ORIGIN ?? 'http://localhost:3000',
    /^http:\/\/localhost:3000\/?$/,
    'Legacy fixture only runs against local D1',
  );
  const c = new Client();
  ok(await c.login());
  const now = Date.now(),
    f = newFacility(now - 60000);
  delete f.tycoonVersion;
  Object.assign(f, {
    compute: 999,
    storedCompute: 7,
    builds: { 'rack-a': 1 },
    inventory: { kit: 2 },
    outfit: 'mint',
    owned: ['classic', 'mint'],
    craft: { recipe: 'kit', readyAt: now - 1 },
    incident: {
      at: now - 15000,
      rack: 'rack-a',
      kind: 'heat',
      startedAt: null,
    },
    workload: {
      id: 'legacy-job',
      rack: 'rack-a',
      label: 'Old bonus',
      startedAt: now - 60000,
      readyAt: now - 1,
      reward: 35,
    },
  });
  const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
  const files = readdirSync(dir).filter(
    (s) => s.endsWith('.sqlite') && s !== 'metadata.sqlite',
  );
  assert.equal(files.length, 1, 'Expected exactly one local D1 database');
  execFileSync(
    'python3',
    [
      '-c',
      `import sqlite3,json,sys
p=json.load(sys.stdin)
c=sqlite3.connect(p['path'])
r=c.execute('UPDATE players SET facility_state=?,facility_version=17,credits=123 WHERE wallet=?',(json.dumps(p['facility']),p['wallet']))
assert r.rowcount==1
c.commit()
`,
    ],
    {
      input: JSON.stringify({
        path: dir + '/' + files[0],
        facility: f,
        wallet: c.account.address.toLowerCase(),
      }),
    },
  );
  const a = ok(await c.request('profile')).profile;
  assert.equal(a.credits, 123); // stale mirror 999 must never be added
  assert.equal(a.facility.version, 18);
  assert.equal(a.facility.tycoonVersion, 1);
  assert.equal(a.facility.storedCompute, 10); // seven saved + three old ticks
  assert.deepEqual(a.facility.inventory, { kit: 2 });
  assert.deepEqual(a.facility.craft, f.craft);
  assert.equal(a.facility.outfit, 'mint');
  const b = ok(await c.request('profile')).profile;
  assert.equal(b.facility.version, 18);
  assert.equal(b.facility.computeAt, a.facility.computeAt);
  const collected = ok(await act(c, 'compute-collect')).profile;
  assert.equal(collected.credits, 158);
  await new Promise((r) => setTimeout(r, 15100));
  const harvest = ok(await act(c, 'compute-harvest')).profile;
  assert.ok(harvest.credits >= 174); // preserved 10 plus at least one new-rate tick
  assert.equal(harvest.facility.storedCompute, 0);
});
