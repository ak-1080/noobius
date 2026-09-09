import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { planPath } from '../lib/navigation.ts';
import { floorClear } from '../lib/world-navigation.ts';
import { OBJECTS } from '../lib/facility.ts';
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function isolatedNeighborhood() {
  const host = new URL(
    process.env.NOOBIUS_TEST_ORIGIN ?? 'http://localhost:3000',
  ).hostname;
  if (!['localhost', '127.0.0.1'].includes(host))
    throw new Error('Local-only world fixtures');
  const id = crypto.randomUUID().replaceAll('-', '');
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      '.openai/wrangler.local.json',
      '--persist-to',
      '.wrangler/state',
      '--command',
      `INSERT INTO neighborhoods(id,realm,preferred_band,created_at) VALUES ('${id}','commons',0,${Date.now()})`,
    ],
    { stdio: 'pipe' },
  );
  return id;
}
export async function attachWorld(c, target) {
  c.world ??= { clientId: crypto.randomUUID(), generation: 0 };
  c.moveQueue = Promise.resolve();
  const profile = ok(await c.request('profile')).profile;
  let data = ok(
    await c.request(
      'neighborhood-join',
      c.body({ ...c.world, realm: 'commons', target }),
    ),
  );
  c.world.generation = data.membership.generation;
  data = ok(
    await c.request(
      'neighborhood-scene',
      c.body({ ...c.world, scene: 'home-' + profile.id }),
    ),
  );
  c.world.generation = data.membership.generation;
  c.membership = data.membership;
}
export function walkTo(c, id) {
  const work = async () => {
    const f = ok(await c.request('profile')).profile.facility,
      node = OBJECTS.find((o) => o.id === id);
    if (!node || !f.unlocked.includes(node.zone)) return;
    const sync = async (position) => {
      const d = ok(
        await c.request(
          'neighborhood-sync',
          c.body({ ...c.world, sequence: c.membership.sequence + 1, position }),
        ),
      );
      assert.equal(d.corrected, false, 'Normal test walk must be accepted');
      c.membership = d.membership;
    };
    if (Math.hypot(c.membership.x - node.x, c.membership.z - node.z) < 3.5) {
      await sync({ x: c.membership.x, z: c.membership.z });
      return;
    }
    const clear = (x, z) => floorClear(f, false, x, z),
      start = [c.membership.x, c.membership.z];
    const paths = [
      [node.x, node.z + 1.65],
      [node.x + 1.65, node.z],
      [node.x - 1.65, node.z],
      [node.x, node.z - 1.65],
    ]
      .filter(([x, z]) => clear(x, z))
      .map((end) => planPath(start, end, clear, 0.5))
      .filter((p) => p.length)
      .sort((a, b) => a.length - b.length);
    assert.ok(paths.length, 'Worksite must be reachable: ' + id);
    let distance = 0,
      point = start;
    for (const next of paths[0]) {
      distance += Math.hypot(next[0] - point[0], next[1] - point[1]);
      point = next;
      if (distance >= 4 || next === paths[0].at(-1)) {
        await wait((distance / 4.1) * 1000 + 50);
        await sync({ x: point[0], z: point[1] });
        distance = 0;
      }
    }
  };
  const operation = c.moveQueue.then(work);
  c.moveQueue = operation.catch(() => {});
  return operation;
}
