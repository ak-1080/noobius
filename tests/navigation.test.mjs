import test from 'node:test';
import assert from 'node:assert/strict';
import { planPath } from '../lib/navigation.ts';
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
