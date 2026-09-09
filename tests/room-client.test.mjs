import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomClient } from '../lib/room-client.ts';
import { roomActionIntent } from '../lib/room-protocol.ts';
const member = {
  neighborhoodId: 'a'.repeat(32),
  realm: 'commons',
  scene: 'commons',
  generation: 42,
  sequence: 1,
  slot: 0,
  x: 0,
  z: 17,
  leaseUntil: 45000,
};
class Socket {
  listeners = new Map();
  frames = [];
  closed = false;
  addEventListener(type, fn) {
    const entries = this.listeners.get(type) ?? [];
    entries.push(fn);
    this.listeners.set(type, entries);
  }
  emit(type, data) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data });
  }
  send(raw) {
    this.frames.push(JSON.parse(raw));
    this.handle?.(JSON.parse(raw));
  }
  frame(body) {
    this.emit('message', JSON.stringify(body));
  }
  close() {
    this.closed = true;
  }
}
async function fixture(t) {
  const socket = new Socket(),
    events = {
      membership: [],
      correction: [],
      ready: [],
      people: [],
      disconnected: 0,
      disconnectReasons: [],
    };
  let position = { x: 0, z: 17 },
    now = 1000,
    address;
  const client = new RoomClient({
    coordinatorOrigin: 'https://rooms.example',
    ticket: 'opaque-ticket',
    membership: member,
    now: () => now,
    readPosition: () => position,
    createSocket: (url) => {
      address = url;
      return socket;
    },
    onMembership: (...args) => events.membership.push(args),
    onCorrection: (p) => {
      position = { ...p };
      events.correction.push(p);
    },
    onReady: (ready) => events.ready.push(ready),
    onPeople: (p) => events.people.push(p),
    onDisconnect: (reason) => {
      events.disconnected++;
      events.disconnectReasons.push(reason);
    },
  });
  t.after(() => client.dispose());
  const connecting = client.connect();
  socket.emit('open');
  const frame = (type, data = {}) =>
    socket.frame({ type, connectionId: 'one', ...data });
  const authority = (data = {}) => ({
    membership: member,
    serverNow: 1000,
    authorizedUntil: 11000,
    workFrozen: false,
    ...data,
  });
  frame('joined', { ...authority(), inputSequence: 0 });
  await connecting;
  return {
    client,
    socket,
    events,
    address,
    frame,
    authority,
    move: (p) => {
      position = p;
      now += 200;
    },
    time: (t) => {
      now = t;
    },
  };
}

test('ticket stays out of URL; live movement uses its own sequence and server corrections', async (t) => {
  const f = await fixture(t);
  assert.equal(f.address, 'wss://rooms.example/rooms/' + member.neighborhoodId);
  assert.deepEqual(f.socket.frames[0], {
    type: 'join',
    ticket: 'opaque-ticket',
  });
  f.socket.handle = (body) => {
    if (body.type === 'move')
      f.frame('move-ack', {
        inputSequence: body.inputSequence,
        position: { x: 0, z: 16.8 },
        accepted: true,
        corrected: false,
      });
  };
  f.move({ x: 0, z: 16.8 });
  assert.equal(await f.client.syncPosition(), true);
  assert.equal(f.socket.frames.at(-1).inputSequence, 1);
  const corrections = f.events.correction.length;
  f.frame(
    'authority',
    f.authority({ membership: { ...member, sequence: 2, z: 16.8 } }),
  );
  assert.equal(
    f.events.correction.length,
    corrections,
    'Background save must not snap the walking actor',
  );
  f.socket.handle = (body) => {
    if (body.type === 'move')
      f.frame('move-ack', {
        inputSequence: body.inputSequence,
        position: { x: 0, z: 16.8 },
        accepted: false,
        corrected: true,
      });
  };
  f.move({ x: 30, z: -30 });
  assert.equal(await f.client.syncPosition(), false);
  assert.deepEqual(f.events.correction.at(-1), { x: 0, z: 16.8 });
});

test('exact final payload gets a frozen checkpoint before HTTP work, then explicit release', async (t) => {
  const f = await fixture(t),
    payload = {
      expectedWallet: 'wallet',
      clientId: 'tab',
      generation: 42,
      action: { type: 'craft', id: 'kit', requestId: 'durable-action' },
    };
  f.socket.handle = (body) => {
    if (body.type === 'checkpoint') {
      assert.equal(f.client.ready, false, 'Locomotion pauses before capture');
      f.frame('checkpoint', {
        ...f.authority({
          workFrozen: true,
          membership: { ...member, sequence: 2 },
        }),
        requestId: body.requestId,
        checkpoint: { id: body.requestId, inputSequence: 0 },
      });
    }
    if (body.type === 'action-complete')
      f.frame('action-complete', { id: body.id });
  };
  const lease = await f.client.prepare('facility', payload);
  const checkpoint = f.socket.frames.find((x) => x.type === 'checkpoint');
  assert.equal(checkpoint.intent, await roomActionIntent('facility', payload));
  assert.equal(lease.checkpoint, checkpoint.requestId);
  assert.equal(f.client.ready, false);
  await lease.complete();
  await lease.complete();
  assert.equal(f.client.ready, true);
  assert.equal(
    f.socket.frames.filter((x) => x.type === 'action-complete').length,
    1,
  );
  assert.equal(
    f.socket.frames.filter((x) => x.type === 'facility').length,
    0,
    'The transport never dispatches an economic action itself',
  );
});

test('authority renewals keep the client live; expired authority stops it', async (t) => {
  const f = await fixture(t);
  f.time(10500);
  f.frame(
    'authority',
    f.authority({
      serverNow: 10500,
      authorizedUntil: 20500,
      membership: { ...member, sequence: 2 },
    }),
  );
  f.time(15000);
  assert.equal(f.client.ready, true);
  f.time(20501);
  assert.equal(f.client.ready, false);
  await assert.rejects(f.client.prepare('facility', {}), /recovering/);
});

test('planned grant renewal reports its reason once and ignores stale connection frames', async (t) => {
  const f = await fixture(t);
  f.frame('renew', { connectionId: 'old-connection' });
  assert.equal(f.client.ready, true);
  assert.deepEqual(f.events.disconnectReasons, []);

  f.frame('renew');
  f.socket.emit('close');
  f.socket.emit('error');
  assert.equal(f.client.ready, false);
  assert.equal(f.socket.closed, true);
  assert.deepEqual(f.events.disconnectReasons, ['renew']);
  await assert.rejects(f.client.syncPosition(), /recovering/);
});

test('unexpected closure reports interruption instead of planned renewal', async (t) => {
  const f = await fixture(t);
  f.socket.emit('close');
  assert.equal(f.client.ready, false);
  assert.deepEqual(f.events.disconnectReasons, ['interrupted']);
});

test('rebase invalidates pending work and old connection frames without applying their receipt', async (t) => {
  const f = await fixture(t);
  const preparing = f.client.prepare('facility', { expectedWallet: 'old' });
  for (let i = 0; i < 100 && f.socket.frames.at(-1).type !== 'checkpoint'; i++)
    await new Promise((r) => setTimeout(r, 2));
  assert.equal(f.socket.frames.at(-1).type, 'checkpoint');
  const id = f.socket.frames.at(-1).requestId;
  f.frame('rebase', {
    ...f.authority({
      workFrozen: true,
      membership: { ...member, sequence: 2 },
    }),
    connectionId: 'replacement',
    inputSequence: 0,
  });
  await assert.rejects(preparing, /recovering/);
  f.frame('checkpoint', {
    ...f.authority(),
    requestId: id,
    checkpoint: { id, inputSequence: 0 },
  });
  assert.equal(f.client.ready, false);
  assert.equal(f.events.disconnected, 1);
});

test('dispose rejects uncertain checkpoints and ignores late acknowledgments', async (t) => {
  const f = await fixture(t);
  const preparing = f.client.prepare('facility', {});
  await new Promise((r) => setTimeout(r, 0));
  f.client.dispose();
  await assert.rejects(preparing, /recovering/);
  f.frame('joined', { ...f.authority(), inputSequence: 0 });
  assert.equal(f.client.ready, false);
  assert.equal(
    f.events.disconnected,
    0,
    'A deliberate wallet/scene teardown must not schedule reconnect',
  );
});

test('a durable server freeze survives rebase until cleared authority arrives', async (t) => {
  const f = await fixture(t);
  f.frame('rebase', {
    ...f.authority({ workFrozen: true }),
    connectionId: 'two',
    inputSequence: 0,
  });
  assert.equal(f.client.ready, false);
  f.frame('authority', { ...f.authority(), connectionId: 'two' });
  assert.equal(f.client.ready, true);
  f.frame('authority', {
    ...f.authority({ workFrozen: true }),
    connectionId: 'one',
  });
  assert.equal(
    f.client.ready,
    true,
    'Old connection authority must not overwrite the replacement',
  );
});

test('leaving waits for the latest position and release receipt before closing', async (t) => {
  const f = await fixture(t);
  f.move({ x: 0, z: 16.8 });
  f.socket.handle = (body) => {
    if (body.type === 'move')
      f.frame('move-ack', {
        inputSequence: body.inputSequence,
        position: { x: body.x, z: body.z },
        accepted: true,
      });
    if (body.type === 'leave') f.frame('released');
  };
  await f.client.release();
  assert.deepEqual(
    f.socket.frames.slice(1).map((b) => b.type),
    ['move', 'leave'],
  );
  assert.equal(f.socket.closed, true);
  assert.equal(f.events.disconnected, 0);
});
