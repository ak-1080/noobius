import test from 'node:test';
import assert from 'node:assert/strict';
import { createPickupGate, worldMovement } from '../lib/world-input.ts';

test('held movement stays frozen during authority work, then resumes without another keydown', () => {
  const keys = new Set(['w', 'd']);
  assert.deepEqual(worldMovement(keys, false, false), { x: 1, z: -1 });
  assert.deepEqual(worldMovement(keys, false, true), { x: 0, z: 0 });
  assert.deepEqual(worldMovement(keys, false, true), { x: 0, z: 0 });
  assert.deepEqual(worldMovement(keys, false, false), { x: 1, z: -1 });
  keys.delete('w');
  assert.deepEqual(worldMovement(keys, false, true), { x: 0, z: 0 });
  keys.delete('d');
  assert.deepEqual(worldMovement(keys, false, false), { x: 0, z: 0 });
});

test('opening an overlay clears movement even while a pickup is awaiting the server', () => {
  const keys = new Set(['w']);
  assert.deepEqual(worldMovement(keys, true, true), { x: 0, z: 0 });
  assert.equal(keys.size, 0);
  assert.deepEqual(worldMovement(keys, false, false), { x: 0, z: 0 });
});

test('rapid E/click pickup attempts dispatch once and award nothing before acceptance', async () => {
  const gate = createPickupGate();
  let finish,
    requests = 0,
    inventory = 0;
  const collect = gate.run('scrap-a', 0, 100, async () => {
    requests++;
    await new Promise((resolve) => {
      finish = resolve;
    });
    inventory++;
  });
  assert.equal(gate.pendingId, 'scrap-a');
  assert.equal(await gate.run('scrap-a', 0, 100, () => requests++), false);
  assert.equal(await gate.run('scrap-b', 0, 100, () => requests++), false);
  assert.equal(requests, 1);
  assert.equal(inventory, 0);
  finish();
  assert.equal(await collect, true);
  assert.equal(inventory, 1);
  assert.equal(gate.pendingId, null);
});

test('rejected and synchronously failed pickups clear pending state and allow a deliberate retry', async () => {
  const gate = createPickupGate();
  await assert.rejects(
    gate.run('scrap-a', 0, 100, async () => {
      throw new Error('Offline');
    }),
    /Offline/,
  );
  assert.equal(gate.pendingId, null);
  await assert.rejects(
    gate.run('scrap-a', 0, 100, () => {
      throw new Error('Unavailable');
    }),
    /Unavailable/,
  );
  assert.equal(gate.pendingId, null);
  assert.equal(await gate.run('scrap-a', 0, 100, () => {}), true);
});

test('known cooldowns do not issue another request and unlock at the actual deadline', async () => {
  const gate = createPickupGate();
  let requests = 0;
  assert.equal(await gate.run('scrap-a', 200, 199, () => requests++), false);
  assert.equal(gate.pendingId, null);
  assert.equal(requests, 0);
  assert.equal(await gate.run('scrap-a', 200, 200, () => requests++), true);
  assert.equal(requests, 1);
});

test('leaving a room disposes its pending presentation and cannot submit another pickup', async () => {
  const oldRoom = createPickupGate();
  let finish;
  const pending = oldRoom.run(
    'scrap-a',
    0,
    100,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  oldRoom.dispose();
  assert.equal(oldRoom.pendingId, null);
  assert.equal(
    await oldRoom.run('scrap-b', 0, 100, () =>
      assert.fail('Disposed room submitted work'),
    ),
    false,
  );
  const newRoom = createPickupGate();
  assert.equal(await newRoom.run('scrap-b', 0, 100, () => {}), true);
  finish();
  await pending;
  assert.equal(newRoom.pendingId, null);
});
