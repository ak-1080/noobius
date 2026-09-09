import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomMotion } from '../lib/room-motion.ts';

const intent = 'a'.repeat(64);
function authority(overrides = {}) {
  const base = {
    player: {
      id: 'player',
      name: 'Noob',
      outfit: 'classic',
      accessory: 'none',
    },
    membership: {
      neighborhoodId: 'neighborhood',
      realm: 'commons',
      slot: 0,
      generation: 7,
      scene: 'commons',
      sequence: 0,
      x: 0,
      z: 17,
      leaseUntil: 60_000,
    },
    navigation: { unlocked: ['commons', 'salvage', 'workshop'] },
    serverNow: 0,
    authorizedUntil: 60_000,
    expiresAt: 60_000,
    writerUntil: 60_000,
    frozenUntil: 0,
    frozenCheckpoint: null,
  };
  return {
    ...base,
    ...overrides,
    membership: { ...base.membership, ...overrides.membership },
  };
}
const move = (motion, sequence, x, now, z = 17) =>
  motion.move({ inputSequence: sequence, x, z }, now);
function receipt(capture) {
  return {
    id: capture.id,
    inputSequence: capture.inputSequence,
    sequence: capture.baseSequence + 1,
    x: capture.x,
    z: capture.z,
  };
}
function committed(capture, now, overrides = {}) {
  return authority({
    serverNow: now,
    ...overrides,
    membership: {
      sequence: capture.baseSequence + 1,
      x: capture.x,
      z: capture.z,
      ...overrides.membership,
    },
  });
}

test('legal local hops can continue for more than ten seconds without a D1 write', () => {
  const motion = new RoomMotion(authority(), 0);
  let distance = 0;
  for (let i = 1; i <= 200; i++) {
    const x = Number((4 - Math.abs((i % 20) - 10) * 0.4).toFixed(2));
    const before = motion.position.x;
    const result = move(motion, i, x, i * 100);
    assert.equal(result.accepted, true, `legal hop ${i}: ${result.reason}`);
    distance += Math.abs(x - before);
  }
  assert.ok(distance > 48);
  assert.equal(motion.inputSequence, 200);
  assert.equal(motion.checkpointSequence, 0);
  assert.equal(motion.captureCheckpoint('end').inputSequence, 200);
});

test('initial time is zero and idle time is capped at one second per hop', () => {
  const motion = new RoomMotion(authority(), 10_000);
  assert.equal(move(motion, 1, 0.1, 10_000).accepted, false);
  assert.deepEqual(motion.position, { x: 0, z: 17 });
  assert.equal(move(motion, 2, 6, 20_000).reason, 'illegal-movement');
  // A rejected jump consumes its interval; it cannot be retried for free.
  assert.equal(move(motion, 3, 4, 20_000).accepted, false);
  assert.equal(move(motion, 4, 0.4, 20_100).accepted, true);
});

test('zero-time floods and out-and-back packets cannot multiply speed allowance', () => {
  const motion = new RoomMotion(authority(), 0);
  assert.equal(move(motion, 1, 0.48, 100).accepted, true);
  for (let sequence = 2; sequence <= 100; sequence++)
    assert.equal(move(motion, sequence, 0, 100).reason, 'rate-limited');
  assert.equal(motion.position.x, 0.48);
  assert.equal(motion.inputSequence, 100);
  assert.equal(move(motion, 100, 0, 200).reason, 'stale-input');
  assert.equal(move(motion, 101, 0, 200).accepted, true);
  assert.equal(move(motion, 102, 0.48, 200).accepted, false);
  assert.equal(move(motion, 103, 0.48, 300).accepted, true);
});

test('unused allowance is not banked and sub-100ms packets are bounded', () => {
  const motion = new RoomMotion(authority(), 0);
  assert.equal(move(motion, 1, 0.1, 100).accepted, true);
  assert.equal(move(motion, 2, 0.2, 199).reason, 'rate-limited');
  assert.equal(move(motion, 3, 0.9, 200).reason, 'illegal-movement');
  assert.equal(move(motion, 4, 0.5, 300).accepted, true);
});

test('locked rooms, machine footprints and plaza bounds use the actual floor rules', () => {
  const locked = new RoomMotion(
    authority({ membership: { scene: 'home-player', x: 0, z: -1.5 } }),
    0,
  );
  assert.equal(move(locked, 1, 0, 1000, -2.1).reason, 'illegal-movement');
  const obstacle = new RoomMotion(
    authority({ membership: { x: -4, z: 10 } }),
    0,
  );
  assert.equal(move(obstacle, 1, -4, 1000, 9).reason, 'illegal-movement');
  const boundary = new RoomMotion(authority({ membership: { x: 7.9 } }), 0);
  assert.equal(move(boundary, 1, 8.1, 100).reason, 'illegal-movement');
});

test('invalid coordinates, sequences and clock rollback never change position', () => {
  const motion = new RoomMotion(authority(), 0);
  assert.equal(move(motion, 0, 0, 100).reason, 'invalid-sequence');
  assert.equal(move(motion, 1.2, 0, 100).reason, 'invalid-sequence');
  assert.equal(
    move(motion, Number.MAX_SAFE_INTEGER + 1, 0, 100).reason,
    'invalid-sequence',
  );
  assert.equal(move(motion, 1, NaN, 100).reason, 'invalid-position');
  assert.equal(move(motion, 2, Infinity, 200).reason, 'invalid-position');
  assert.equal(move(motion, 3, 0.1, 199).reason, 'invalid-clock');
  assert.equal(move(motion, 4, 0.1, NaN).reason, 'invalid-clock');
  assert.deepEqual(motion.position, { x: 0, z: 17 });
});

test('expired authority, writer, session or membership lease rejects motion', () => {
  for (const field of [
    'authorizedUntil',
    'writerUntil',
    'expiresAt',
    'leaseUntil',
  ]) {
    const options =
      field === 'leaseUntil'
        ? { membership: { leaseUntil: 100 } }
        : { [field]: 100 };
    const motion = new RoomMotion(authority(options), 0);
    assert.equal(move(motion, 1, 0.1, 100).reason, 'authority-expired', field);
    assert.equal(
      motion.refreshAuthority(authority({ serverNow: 200 }), 200).accepted,
      true,
    );
    assert.equal(move(motion, 2, 0.1, 200).accepted, false);
    assert.equal(move(motion, 3, 0.4, 300).accepted, true);
  }
});

test('captures are immutable, unique while pending and use distinct input/commit sequences', () => {
  const initial = authority(),
    motion = new RoomMotion(initial, 0);
  initial.membership.x = 5;
  initial.navigation.unlocked.length = 0;
  assert.equal(move(motion, 1, 0.4, 100).accepted, true);
  const capture = motion.captureCheckpoint('capture');
  assert.deepEqual(capture, {
    id: 'capture',
    baseSequence: 0,
    inputSequence: 1,
    x: 0.4,
    z: 17,
  });
  assert.ok(Object.isFrozen(capture));
  assert.ok(Object.isFrozen(motion.position));
  assert.throws(() => {
    capture.x = 99;
  }, TypeError);
  assert.throws(() => motion.captureCheckpoint('second'), /pending/);
  assert.equal(motion.pendingCheckpoint, capture);
});

test('background ACK preserves newer validated movement and only advances commit sequence', () => {
  const motion = new RoomMotion(authority(), 0);
  assert.equal(move(motion, 1, 0.4, 100).accepted, true);
  const capture = motion.captureCheckpoint('background');
  assert.equal(move(motion, 2, 0.8, 200).accepted, true);
  const updated = committed(capture, 250);
  const ack = motion.applyCheckpointAck(receipt(capture), updated, 250);
  assert.equal(ack.accepted, true);
  assert.equal(ack.rebased, false);
  assert.equal(motion.position.x, 0.8);
  assert.equal(motion.inputSequence, 2);
  assert.equal(motion.checkpointSequence, 1);
  assert.equal(motion.pendingCheckpoint, null);
  assert.equal(
    motion.refreshAuthority({ ...updated, serverNow: 300 }, 300).rebased,
    false,
  );
  assert.equal(motion.position.x, 0.8);
  assert.equal(move(motion, 3, 1.2, 300).accepted, true);
});

test('receipt identity, input, sequence, coordinates and authority must match exactly', () => {
  for (const mutate of [
    (r) => {
      r.id = 'wrong';
    },
    (r) => {
      r.inputSequence++;
    },
    (r) => {
      r.sequence++;
    },
    (r) => {
      r.x += 0.01;
    },
    (r, a) => {
      a.membership.sequence++;
    },
    (r, a) => {
      a.membership.x += 0.01;
    },
  ]) {
    const motion = new RoomMotion(authority(), 0);
    move(motion, 1, 0.4, 100);
    const capture = motion.captureCheckpoint('pending'),
      ack = receipt(capture),
      next = committed(capture, 200);
    move(motion, 2, 0.8, 200);
    mutate(ack, next);
    const result = motion.applyCheckpointAck(ack, next, 250);
    assert.equal(result.accepted, false);
    assert.equal(result.rebased, true);
    assert.equal(result.corrected, true);
    assert.deepEqual(motion.position, {
      x: next.membership.x,
      z: next.membership.z,
    });
    assert.equal(motion.pendingCheckpoint, null);
    assert.equal(move(motion, 3, next.membership.x + 0.1, 250).accepted, false);
  }
});

test('travel refresh drops pending input and a late ACK cannot roll back travel', () => {
  const motion = new RoomMotion(authority(), 0);
  move(motion, 1, 0.4, 100);
  const capture = motion.captureCheckpoint('before-travel');
  const travel = authority({
    serverNow: 300,
    membership: { sequence: 5, x: 3 },
  });
  assert.equal(motion.refreshAuthority(travel, 300).rebased, true);
  assert.equal(motion.pendingCheckpoint, null);
  assert.equal(motion.inputSequence, 1);
  assert.equal(
    motion.applyCheckpointAck(receipt(capture), committed(capture, 200), 400)
      .rebased,
    true,
  );
  assert.equal(motion.position.x, 3);
  assert.equal(motion.checkpointSequence, 5);
  assert.equal(move(motion, 2, 3.1, 400).accepted, false);
  assert.equal(move(motion, 3, 3.4, 500).accepted, true);
});

test('scene or generation changes reset input ordering and elapsed credit', () => {
  for (const change of [
    { scene: 'home-player' },
    { generation: 8 },
    { neighborhoodId: 'next' },
  ]) {
    const motion = new RoomMotion(authority(), 0);
    move(motion, 8, 0.4, 100);
    const next = authority({ serverNow: 1000, membership: change });
    assert.equal(motion.refreshAuthority(next, 1000).rebased, true);
    assert.equal(motion.inputSequence, 0);
    assert.equal(move(motion, 1, 0.1, 1000).accepted, false);
    assert.equal(move(motion, 2, 0.4, 1100).accepted, true);
  }
});

test('action capture freezes immediately and needs ACK plus explicitly cleared refreshed authority', () => {
  const motion = new RoomMotion(authority(), 0);
  move(motion, 1, 0.4, 100);
  const capture = motion.captureCheckpoint('action', intent);
  assert.equal(capture.intent, intent);
  assert.equal(move(motion, 2, 0.8, 200).reason, 'action-frozen');
  // An unrelated pre-ACK refresh cannot clear the local action barrier.
  motion.refreshAuthority(authority({ serverNow: 250 }), 250);
  assert.equal(move(motion, 3, 0.8, 300).reason, 'action-frozen');
  const ackAuthority = committed(capture, 400, {
    frozenUntil: 500,
    frozenCheckpoint: 'action',
  });
  assert.equal(
    motion.applyCheckpointAck(receipt(capture), ackAuthority, 400).accepted,
    true,
  );
  assert.equal(move(motion, 4, 0.8, 600).reason, 'action-frozen');
  assert.throws(() => motion.captureCheckpoint('another'), /frozen/);
  const cleared = committed(capture, 700);
  assert.equal(motion.refreshAuthority(cleared, 700).accepted, true);
  assert.equal(move(motion, 5, 0.8, 700).accepted, false);
  assert.equal(move(motion, 6, 0.8, 800).accepted, true);
});

test('ACK alone cannot clear an action freeze, and terminal reset discards pending motion', () => {
  const motion = new RoomMotion(authority(), 0);
  move(motion, 1, 0.4, 100);
  const capture = motion.captureCheckpoint('action', intent);
  const updated = committed(capture, 200);
  motion.applyCheckpointAck(receipt(capture), updated, 200);
  assert.equal(move(motion, 2, 0.8, 300).reason, 'action-frozen');
  motion.refreshAuthority({ ...updated, serverNow: 400 }, 400);
  assert.equal(move(motion, 3, 0.8, 500).accepted, true);
  motion.captureCheckpoint('failed', intent);
  const result = motion.reset({ ...updated, serverNow: 600 }, 600);
  assert.equal(result.rebased, true);
  assert.equal(motion.pendingCheckpoint, null);
  assert.equal(motion.position.x, 0.4);
  assert.equal(move(motion, 4, 0.5, 600).accepted, false);
  assert.equal(move(motion, 5, 0.8, 700).accepted, true);
});

test('checkpoint intent must be a lowercase 64-character action hash', () => {
  const motion = new RoomMotion(authority(), 0);
  for (const bad of [
    '',
    'A'.repeat(64),
    'a'.repeat(63),
    { action: 'gather' },
    null,
  ])
    assert.throws(() => motion.captureCheckpoint('action', bad), /intent/);
  assert.equal(motion.pendingCheckpoint, null);
});

test('a durable action freeze survives coordinator restart until authority clears it', () => {
  const motion = new RoomMotion(
    authority({ frozenUntil: 100, frozenCheckpoint: 'previous-action' }),
    0,
  );
  assert.equal(move(motion, 1, 0.4, 200).reason, 'action-frozen');
  motion.refreshAuthority(authority({ serverNow: 300 }), 300);
  assert.equal(move(motion, 2, 0.1, 300).accepted, false);
  assert.equal(move(motion, 3, 0.4, 400).accepted, true);
});
