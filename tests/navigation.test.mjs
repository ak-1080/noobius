import test from 'node:test';
import assert from 'node:assert/strict';
import { planPath } from '../lib/navigation.ts';
import {
  closedGateExit,
  floorClear,
  legalMovement,
} from '../lib/world-navigation.ts';
import { ZONES } from '../lib/facility.ts';
test('Noobius walks around the trolley to reach the cooling machine', () => {
  const obstacles = [
    { x: -1.8, z: 2.55, w: 0.7, d: 0.5 },
    { x: -4, z: 1, w: 1, d: 0.65 },
  ];
  const clear = (x, z) =>
    Math.abs(x) < 5.9 &&
    z > -4.4 &&
    z < 4.5 &&
    !obstacles.some((o) => Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d);
  const path = planPath([0.2, 2.4], [-4, 2.05], clear);
  assert.ok(path.length > 5);
  assert.deepEqual(path.at(-1), [-4, 2.05]);
  for (let i = 0; i < path.length; i++) {
    assert.ok(clear(...path[i]));
    if (i) {
      const a = path[i - 1],
        b = path[i];
      for (let t = 0; t <= 1; t += 0.1)
        assert.ok(clear(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
  }
});
test('an inaccessible target is never used as a walking route', () => {
  assert.deepEqual(
    planPath([0, 0], [4, 4], (x, z) => Math.abs(x) < 2 && Math.abs(z) < 2),
    [],
  );
});
test('a clear floor click beside the cart survives grid rounding', () => {
  const clear = (x, z) =>
    Math.abs(x) < 5.9 &&
    z > -4.4 &&
    z < 4.5 &&
    !(Math.abs(x + 1.8) < 0.7 && Math.abs(z - 2.55) < 0.5);
  const from = [0.2, 2.4],
    to = [-1.8, 3.06];
  const path = planPath(from, to, clear);
  assert.deepEqual(path.at(-1), to);
  let a = from;
  for (const b of path) {
    for (let i = 0; i <= 20; i++)
      assert.ok(
        clear(a[0] + ((b[0] - a[0]) * i) / 20, a[1] + ((b[1] - a[1]) * i) / 20),
      );
    a = b;
  }
});

test('closed room gates stop the whole avatar before the barrier', () => {
  const unlocked = ['commons', 'salvage', 'workshop'];
  for (const zone of ZONES.filter((zone) => !unlocked.includes(zone.id))) {
    const locked = { unlocked };
    const open = { unlocked: [...unlocked, zone.id] };
    const gateZ = zone.z + 8;
    assert.equal(floorClear(locked, false, zone.x, gateZ + 0.8), true);
    assert.equal(floorClear(locked, false, zone.x, gateZ + 0.45), false);
    assert.equal(floorClear(locked, false, zone.x + 1.7, gateZ + 0.45), false);
    assert.equal(floorClear(open, false, zone.x, gateZ + 0.45), true);
    assert.equal(floorClear(open, false, zone.x, gateZ - 0.45), true);
  }
});

test('an unlocked doorway keeps a continuous walking route', () => {
  const facility = { unlocked: ZONES.map((zone) => zone.id) };
  const from = [-22, 1];
  const to = [-22, -10];
  const clear = (x, z) => floorClear(facility, false, x, z);
  const path = planPath(from, to, clear, 0.5);
  assert.ok(path.length);
  let previous = from;
  for (const next of path) {
    for (let step = 0; step <= 20; step++)
      assert.ok(
        clear(
          previous[0] + ((next[0] - previous[0]) * step) / 20,
          previous[1] + ((next[1] - previous[1]) * step) / 20,
        ),
      );
    previous = next;
  }
});

test('a saved position inside an old closed gate can leave safely', () => {
  const locked = { unlocked: ['commons', 'salvage', 'workshop'] };
  const oldPosition = { x: -22, z: -1.7 };
  const exit = closedGateExit(locked, oldPosition.x, oldPosition.z);
  assert.equal(floorClear(locked, false, oldPosition.x, oldPosition.z), false);
  assert.ok(exit);
  assert.equal(floorClear(locked, false, exit.x, exit.z), true);
  assert.equal(
    legalMovement(locked, false, exit, { x: -22, z: -1.0 }, 200),
    true,
  );
  assert.equal(
    legalMovement(locked, false, oldPosition, { x: -22, z: -2.4 }, 200),
    false,
  );
});
