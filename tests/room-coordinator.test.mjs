import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { operationalRecord } from '../lib/operational-events.ts';

// All mocks and test state live in memory. No site files or database are changed.
// Override either path to run against a saved earlier version of worker.ts.
const project = fileURLToPath(new URL('..', import.meta.url));
const sourcePath =
  process.env.NOOBIUS_COORDINATOR_SOURCE ??
  path.join(project, 'services/room-coordinator/worker.ts');
const requireFromProject = createRequire(path.join(project, 'package.json'));
const ts = requireFromProject('typescript');
const source = readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const ROOM_ID = 'a'.repeat(32);
const config = {
  audience: 'http://127.0.0.1:3003',
  coordinatorOrigin: 'http://127.0.0.1:3004',
};

class DurableObjectMock {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
class WebSocketMock {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = WebSocketMock.OPEN;
  sent = [];
  closes = [];
  constructor() {
    this.attachment = {
      room: ROOM_ID,
      connectedAt: Date.now(),
      phase: 'joining',
      connectionId: crypto.randomUUID(),
    };
  }
  serializeAttachment(value) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
  send(value) {
    if (this.readyState !== WebSocketMock.OPEN)
      throw new Error('Socket is closing');
    this.sent.push(JSON.parse(value));
  }
  close(code, reason) {
    this.closes.push({ code, reason });
    this.readyState = WebSocketMock.CLOSING;
    // Like the platform, close() alone does not synchronously deliver a peer
    // close event. The test explicitly invokes webSocketClose when needed.
  }
}
// Movement legality has separate tests. These tests concern only coordinator
// admission ordering and durable-checkpoint cleanup, so motion is a small stub.
class RoomMotionMock {
  inputSequence = 0;
  pendingCheckpoint = null;
  constructor(authority) {
    this.position = { x: authority.membership.x, z: authority.membership.z };
    this.sequence = authority.membership.sequence;
    this.authority = authority;
  }
  move(input) {
    this.inputSequence = input.inputSequence;
    this.position = { x: input.x, z: input.z };
    return { accepted: true, corrected: false, position: this.position };
  }
  captureCheckpoint(id, intent) {
    assert.equal(
      this.pendingCheckpoint,
      null,
      'Do not replace an uncertain checkpoint',
    );
    assert.equal(
      this.authority.frozenCheckpoint,
      null,
      'Refresh a frozen authority before capturing',
    );
    this.pendingCheckpoint = {
      id,
      baseSequence: this.sequence,
      inputSequence: this.inputSequence,
      ...this.position,
      ...(intent ? { intent } : {}),
    };
    return this.pendingCheckpoint;
  }
  applyCheckpointAck(receipt, authority) {
    this.pendingCheckpoint = null;
    this.sequence = receipt.sequence;
    this.authority = authority;
    return { accepted: true, rebased: false };
  }
  refreshAuthority(authority) {
    this.authority = authority;
    return { accepted: true, rebased: false };
  }
}
const modules = {
  'cloudflare:workers': { DurableObject: DurableObjectMock },
  '../../lib/room-auth.ts': {
    roomAuthConfig: () => config,
    roomServiceHeaders: async () => ({}),
    ROOM_SERVICE_PATH: '/api/noobius-room',
  },
  '../../lib/room-motion.ts': { RoomMotion: RoomMotionMock },
};
function roomClass(clock, events, fetcher) {
  class VirtualDate extends Date {
    static now() {
      return clock.now;
    }
  }
  const sandbox = {
    exports: {},
    require(id) {
      if (id === '../../lib/operational-events.ts')
        return {
          emitOperationalEvent: (event) =>
            events.push(operationalRecord(event)),
        };
      if (!(id in modules))
        throw new Error('Unexpected import in coordinator mock: ' + id);
      return modules[id];
    },
    console,
    Date: VirtualDate,
    crypto,
    structuredClone,
    WebSocket: WebSocketMock,
    Request,
    Response,
    Error,
    URL,
    AbortSignal,
    fetch:
      fetcher ??
      (() => {
        throw new Error('Unexpected network call in coordinator test');
      }),
  };
  vm.runInNewContext(output, sandbox, { filename: sourcePath });
  return sandbox.exports.NeighborhoodRoom;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
function authority(sequence, now = Date.now()) {
  return {
    player: {
      id: 'same-player',
      name: 'Player',
      outfit: 'starter',
      accessory: 'none',
    },
    membership: {
      neighborhoodId: ROOM_ID,
      realm: 'commons',
      slot: 1,
      generation: 44,
      scene: 'commons',
      sequence,
      x: 0,
      z: 17,
      leaseUntil: now + 45_000,
    },
    navigation: { unlocked: ['commons'] },
    serverNow: now,
    authorizedUntil: now + 10_000,
    expiresAt: now + 60_000,
    writerUntil: now + 10_000,
    frozenUntil: 0,
    frozenCheckpoint: null,
  };
}
async function fixture(options = {}) {
  const clock = { now: options.now ?? Date.now() };
  const values = new Map(options.values),
    sockets = [...(options.sockets ?? [])],
    initialization = [],
    backgroundJobs = [],
    alarms = [];
  const ctx = {
    storage: {
      async put(key, value) {
        values.set(key, structuredClone(value));
      },
      async get(key) {
        return values.has(key) ? structuredClone(values.get(key)) : undefined;
      },
      async delete(key) {
        return values.delete(key);
      },
      async list({ prefix = '', limit = Infinity, startAfter = '' } = {}) {
        return new Map(
          [...values]
            .filter(([key]) => key.startsWith(prefix) && key > startAfter)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, limit),
        );
      },
      async setAlarm(at) {
        alarms.push(at);
      },
    },
    blockConcurrencyWhile(job) {
      const result = job();
      initialization.push(result);
      return result;
    },
    waitUntil(job) {
      backgroundJobs.push(job);
    },
    getWebSockets() {
      return sockets.filter((ws) => ws.readyState !== WebSocketMock.CLOSED);
    },
    acceptWebSocket(ws) {
      sockets.push(ws);
    },
  };
  const events = [];
  const NeighborhoodRoom = roomClass(clock, events, options.fetch);
  if (options.service) NeighborhoodRoom.prototype.service = options.service;
  const room = new NeighborhoodRoom(ctx, {});
  const rawAlarm = room.alarm.bind(room);
  // Most assertions inspect completed work. Keep a separate raw handler for
  // tests that verify alarms keep dispatching while network jobs are pending.
  room.alarm = async () => {
    const start = backgroundJobs.length;
    await rawAlarm();
    await Promise.all(backgroundJobs.slice(start));
  };
  const initialized = Promise.all(initialization);
  if (options.waitForInitialization !== false) await initialized;
  const socket = () => {
    const ws = new WebSocketMock();
    sockets.push(ws);
    return ws;
  };
  return {
    room,
    ctx,
    values,
    sockets,
    socket,
    alarms,
    clock,
    initialized,
    rawAlarm,
    backgroundJobs,
    events,
  };
}

function installActor(f, grant, initial = authority(1, f.clock.now)) {
  const ws = f.socket();
  ws.serializeAttachment({ ...ws.attachment, phase: 'ready', grant });
  const actor = f.room.actor(grant, ws.attachment.connectionId, initial);
  f.room.actors.set(ws, actor);
  return { ws, actor };
}

function outbox(grant, now, overrides = {}) {
  return {
    grant,
    checkpoint: {
      id: crypto.randomUUID(),
      baseSequence: 1,
      inputSequence: 2,
      x: 0.5,
      z: 17,
      ...overrides,
    },
    expiresAt: now + 300_000,
  };
}

function savedCheckpoint(body, initial, now) {
  const next = {
    ...initial,
    serverNow: now,
    authorizedUntil: Math.min(now + 10_000, initial.expiresAt),
    writerUntil: Math.min(now + 10_000, initial.expiresAt),
    frozenUntil: body.intent ? now + 3000 : 0,
    frozenCheckpoint: body.intent ? body.id : null,
    membership: {
      ...initial.membership,
      sequence: body.baseSequence + 1,
      x: body.x,
      z: body.z,
    },
  };
  return {
    checkpoint: {
      id: body.id,
      inputSequence: body.inputSequence,
      sequence: body.baseSequence + 1,
      x: body.x,
      z: body.z,
      committedAt: now,
      frozenUntil: next.frozenUntil,
    },
    authority: next,
  };
}

const checkpointCount = (f) =>
  [...f.values.keys()].filter((key) => key.startsWith('checkpoint:')).length;

test(
  'an older delayed admission cannot evict the latest reconnect',
  { timeout: 3000 },
  async (t) => {
    const { room, socket } = await fixture();
    const older = socket(),
      newer = socket();
    const olderResponse = deferred(),
      newerResponse = deferred(),
      newerStarted = deferred();
    const calls = [];
    room.service = async (body) => {
      calls.push(body);
      if (body.operation === 'ticket-consume') {
        if (body.ticket === 'older-ticket') return olderResponse.promise;
        if (body.ticket === 'newer-ticket') {
          newerStarted.resolve();
          return newerResponse.promise;
        }
      }
      if (body.operation === 'authority-release') return { released: true };
      throw new Error('Unexpected service request: ' + JSON.stringify(body));
    };
    const olderJob = room.webSocketMessage(
      older,
      JSON.stringify({ type: 'join', ticket: 'older-ticket' }),
    );
    await nextTurn();
    assert.equal(calls[0]?.ticket, 'older-ticket');
    const newerJob = room.webSocketMessage(
      newer,
      JSON.stringify({ type: 'join', ticket: 'newer-ticket' }),
    );
    await nextTurn();

    // A concurrent implementation allows B to finish while A's older committed
    // response is delayed. A corrected admission queue must finish A first.
    const overlapped = calls.some((body) => body.ticket === 'newer-ticket');
    if (overlapped) {
      newerResponse.resolve({ grant: 'newer-grant', ...authority(2) });
      await newerJob;
      olderResponse.resolve({ grant: 'older-grant', ...authority(1) });
      await olderJob;
    } else {
      olderResponse.resolve({ grant: 'older-grant', ...authority(1) });
      await olderJob;
      await newerStarted.promise;
      newerResponse.resolve({ grant: 'newer-grant', ...authority(2) });
      await newerJob;
    }
    const activeGrants = [...room.actors.values()].map((actor) => actor.grant);
    t.diagnostic(
      JSON.stringify({ overlapped, activeGrants, newerCloses: newer.closes }),
    );
    assert.deepEqual(
      activeGrants,
      ['newer-grant'],
      'An older response replaced the newer D1 grant',
    );
    assert.equal(
      newer.readyState,
      WebSocketMock.OPEN,
      'The latest valid connection was closed',
    );
  },
);

test(
  'a checkpoint that succeeds after close releases the orphaned writer',
  { timeout: 3000 },
  async (t) => {
    const { room, socket, values } = await fixture();
    const ws = socket(),
      initial = authority(1),
      grant = 'closing-grant';
    ws.serializeAttachment({ ...ws.attachment, phase: 'ready', grant });
    const actor = room.actor(grant, ws.attachment.connectionId, initial);
    room.actors.set(ws, actor);
    const pending = actor.motion.captureCheckpoint(crypto.randomUUID());
    const response = deferred(),
      started = deferred(),
      calls = [];
    room.service = async (body) => {
      calls.push(body);
      if (body.operation === 'movement-checkpoint') {
        started.resolve();
        return response.promise;
      }
      if (body.operation === 'authority-release') return { released: true };
      throw new Error('Unexpected service request: ' + JSON.stringify(body));
    };
    const flushing = room.flush(ws);
    await started.promise;
    assert.equal(
      values.has('checkpoint:' + grant),
      true,
      'The checkpoint must be durable before network I/O',
    );
    ws.readyState = WebSocketMock.CLOSED;
    await room.webSocketClose(ws);
    assert.equal(room.actors.size, 0);
    assert.equal(
      calls.some((body) => body.operation === 'authority-release'),
      false,
      'An uncertain checkpoint must not be released before reconciliation',
    );

    response.resolve({
      checkpoint: {
        ...pending,
        sequence: 2,
        committedAt: Date.now(),
        frozenUntil: 0,
      },
      authority: authority(2),
    });
    await flushing;
    await nextTurn();
    const releases = calls.filter(
      (body) => body.operation === 'authority-release',
    );
    t.diagnostic(
      JSON.stringify({
        actors: room.actors.size,
        pendingOutbox: values.size,
        serviceCalls: calls.map((body) => body.operation),
      }),
    );
    assert.equal(
      values.has('checkpoint:' + grant),
      false,
      'A successful checkpoint should leave no uncertain outbox entry',
    );
    assert.deepEqual(
      releases.map((body) => body.grant),
      [grant],
      'The orphaned writer lease was left active after successful reconciliation',
    );
  },
);

test(
  'renewal saves the final position and releases before reconnecting',
  { timeout: 3000 },
  async () => {
    const f = await fixture();
    const initial = authority(1, f.clock.now);
    initial.expiresAt = f.clock.now + 15_000;
    const { ws, actor } = installActor(f, 'renewing-grant', initial);
    actor.motion.position = { x: 0.5, z: 17 };
    actor.motion.inputSequence = 3;
    const response = deferred(),
      calls = [],
      events = [];
    const originalSend = ws.send.bind(ws);
    ws.send = (raw) => {
      events.push(JSON.parse(raw).type);
      originalSend(raw);
    };
    f.room.service = async (body) => {
      calls.push(body);
      events.push(body.operation);
      if (body.operation === 'authority-refresh') return initial;
      if (body.operation === 'movement-checkpoint') return response.promise;
      if (body.operation === 'authority-release') return { released: true };
      throw new Error('Unexpected renewal operation');
    };
    const renewal = f.room.alarm();
    await nextTurn();
    const captured = calls.find(
      (body) => body.operation === 'movement-checkpoint',
    );
    assert.ok(
      captured,
      'Begin saving the final position fifteen seconds before expiry',
    );
    assert.deepEqual({ x: captured.x, z: captured.z }, { x: 0.5, z: 17 });
    assert.equal(captured.inputSequence, 3);
    assert.equal(
      events.includes('renew'),
      false,
      'Do not reconnect before durable save',
    );

    await f.room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'move',
        connectionId: actor.connectionId,
        inputSequence: 4,
        x: 0.6,
        z: 17,
      }),
    );
    assert.deepEqual(
      actor.motion.position,
      { x: 0.5, z: 17 },
      'Renewal must freeze further movement',
    );
    assert.equal(
      ws.readyState,
      WebSocketMock.OPEN,
      'A queued move must not interrupt the final save',
    );
    response.resolve(savedCheckpoint(captured, initial, f.clock.now));
    await renewal;
    assert.equal(checkpointCount(f), 0);
    assert.equal(f.room.actors.size, 0);
    assert.equal(ws.closes.at(-1)?.code, 1012);
    assert.ok(
      events.indexOf('authority-release') >
        events.indexOf('movement-checkpoint'),
    );
    assert.ok(events.indexOf('renew') > events.indexOf('authority-release'));
  },
);

test(
  'renewal retains the original uncertain checkpoint after a transient failure',
  { timeout: 3000 },
  async () => {
    const f = await fixture();
    const initial = authority(1, f.clock.now);
    initial.expiresAt = f.clock.now + 15_000;
    const { actor } = installActor(f, 'uncertain-renewal', initial);
    const pending = actor.motion.captureCheckpoint(crypto.randomUUID());
    const calls = [];
    f.room.service = async (body) => {
      calls.push(body);
      if (body.operation === 'authority-refresh') return initial;
      if (body.operation === 'movement-checkpoint')
        throw new TypeError('Response lost');
      if (body.operation === 'authority-release') return { released: true };
      throw new Error('Unexpected renewal operation');
    };
    await f.room.alarm();
    const retained = f.values.get('checkpoint:uncertain-renewal');
    assert.ok(
      retained,
      'A transient failure must leave a recoverable outbox record',
    );
    assert.deepEqual(retained.checkpoint, pending);
    assert.equal(
      calls.some((body) => body.operation === 'authority-release'),
      false,
    );
    assert.ok(
      calls
        .filter((body) => body.operation === 'movement-checkpoint')
        .every((body) => body.id === pending.id),
      'Retries must keep the same checkpoint identity',
    );
  },
);

test(
  'renewal clears an expired action freeze before its final checkpoint',
  { timeout: 3000 },
  async () => {
    const f = await fixture();
    const initial = authority(1, f.clock.now);
    initial.expiresAt = f.clock.now + 15_000;
    initial.frozenUntil = f.clock.now;
    initial.frozenCheckpoint = crypto.randomUUID();
    const { ws } = installActor(f, 'frozen-renewal', initial);
    const cleared = { ...initial, frozenUntil: 0, frozenCheckpoint: null };
    const calls = [];
    f.room.service = async (body) => {
      calls.push(body);
      if (body.operation === 'authority-refresh') return cleared;
      if (body.operation === 'movement-checkpoint')
        return savedCheckpoint(body, cleared, f.clock.now);
      if (body.operation === 'authority-release') return { released: true };
      throw new Error('Unexpected renewal operation');
    };
    await f.room.alarm();
    const operations = calls.map((body) => body.operation);
    assert.ok(
      operations.indexOf('authority-refresh') >= 0,
      'Observe the cleared durable action barrier',
    );
    assert.ok(
      operations.indexOf('movement-checkpoint') >
        operations.indexOf('authority-refresh'),
    );
    assert.equal(
      operations.filter((op) => op === 'movement-checkpoint').length,
      1,
    );
    assert.equal(operations.at(-1), 'authority-release');
    assert.ok(ws.sent.some((body) => body.type === 'renew'));
  },
);

test(
  'planned renewal lets a live work freeze finish before releasing its grant',
  { timeout: 3000 },
  async () => {
    const f = await fixture();
    const initial = authority(1, f.clock.now);
    initial.expiresAt = f.clock.now + 15_000;
    initial.frozenUntil = f.clock.now + 3000;
    initial.frozenCheckpoint = crypto.randomUUID();
    const { ws, actor } = installActor(f, 'working-at-renewal', initial);
    const calls = [];
    f.room.service = async (body) => {
      calls.push(body.operation);
      const fresh = {
        ...initial,
        serverNow: f.clock.now,
        authorizedUntil: Math.min(initial.expiresAt, f.clock.now + 10_000),
        writerUntil: Math.min(initial.expiresAt, f.clock.now + 10_000),
        ...(f.clock.now >= initial.frozenUntil
          ? { frozenUntil: 0, frozenCheckpoint: null }
          : {}),
      };
      if (body.operation === 'authority-refresh') return fresh;
      if (body.operation === 'movement-checkpoint')
        return savedCheckpoint(body, fresh, f.clock.now);
      if (body.operation === 'authority-release') return { released: true };
      throw new Error('Unexpected renewal operation');
    };

    await f.room.alarm();
    assert.equal(calls.includes('authority-release'), false);
    assert.equal(calls.includes('movement-checkpoint'), false);
    assert.equal(
      ws.sent.some((body) => body.type === 'renew'),
      false,
    );
    assert.equal(ws.readyState, WebSocketMock.OPEN);
    assert.equal(f.room.actors.get(ws), actor);

    f.clock.now = initial.frozenUntil;
    await f.room.alarm();
    assert.deepEqual(calls, [
      'authority-refresh',
      'movement-checkpoint',
      'authority-release',
    ]);
    assert.equal(checkpointCount(f), 0);
    assert.equal(f.room.actors.size, 0);
    assert.ok(ws.sent.some((body) => body.type === 'renew'));
    assert.equal(ws.closes.at(-1)?.code, 1012);
  },
);

test(
  'orphan recovery is bounded, concurrent, and fair while actors renew',
  { timeout: 3000 },
  async () => {
    const f = await fixture();
    const { ws, actor } = installActor(f, 'healthy-grant');
    for (let i = 0; i < 5; i++) {
      const value = outbox('orphan-' + i, f.clock.now);
      f.values.set('checkpoint:' + value.grant, value);
    }
    const attempted = [],
      firstBatch = [],
      releases = [];
    let active = 0,
      peak = 0;
    f.room.service = async (body) => {
      if (body.grant === actor.grant) {
        if (body.operation === 'authority-refresh')
          return {
            ...actor.authority,
            serverNow: f.clock.now,
            authorizedUntil: f.clock.now + 10_000,
            writerUntil: f.clock.now + 10_000,
          };
        if (body.operation === 'movement-checkpoint')
          return savedCheckpoint(body, actor.authority, f.clock.now);
      }
      if (body.operation === 'movement-checkpoint') {
        attempted.push(body.grant);
        active++;
        peak = Math.max(peak, active);
        if (firstBatch.length < 2) {
          const gate = deferred();
          firstBatch.push(gate);
          await gate.promise;
        }
        active--;
        throw new TypeError('Transient recovery timeout');
      }
      if (body.operation === 'authority-release') {
        releases.push(body.grant);
        return { released: true };
      }
      throw new Error('Unexpected recovery operation');
    };
    const firstAlarm = f.room.alarm();
    await nextTurn();
    assert.equal(
      active,
      2,
      'Two orphan retries should run together instead of serially',
    );
    f.clock.now += 2500;
    for (const gate of firstBatch) gate.resolve();
    await firstAlarm;
    assert.equal(
      attempted.length,
      2,
      'Limit each alarm to two orphan attempts',
    );
    assert.equal(peak, 2);
    assert.equal(
      checkpointCount(f),
      5,
      'Transient failures retain every checkpoint',
    );
    assert.equal(releases.length, 0);
    assert.ok(f.alarms.at(-1) < actor.authority.authorizedUntil);

    for (let i = 0; i < 4 && new Set(attempted).size < 5; i++) {
      f.clock.now += 1000;
      const before = attempted.length;
      await f.room.alarm();
      assert.ok(
        attempted.length - before <= 2,
        'Keep later alarm batches bounded',
      );
    }
    assert.equal(
      new Set(attempted).size,
      5,
      'Earlier transient failures must not starve later orphans',
    );
    assert.equal(ws.readyState, WebSocketMock.OPEN);
    assert.equal(f.room.actors.get(ws), actor);
    assert.ok(actor.authority.authorizedUntil > f.clock.now);
  },
);

test(
  'slow orphan success does not postpone live renewal or duplicate network jobs',
  { timeout: 3000 },
  async () => {
    const f = await fixture(),
      base = f.clock.now;
    const { ws, actor } = installActor(f, 'healthy-during-recovery');
    const initial = actor.authority,
      originalDeadline = initial.authorizedUntil;
    const value = outbox('slow-orphan', base);
    f.values.set('checkpoint:' + value.grant, value);
    const orphanSave = deferred(),
      orphanRelease = deferred();
    const liveRefresh = deferred(),
      liveSave = deferred(),
      calls = [];
    let refreshStarted, saveStarted, captured, firstAuthorityAt;
    const originalSend = ws.send.bind(ws);
    ws.send = (raw) => {
      if (
        JSON.parse(raw).type === 'authority' &&
        firstAuthorityAt === undefined
      )
        firstAuthorityAt = f.clock.now;
      originalSend(raw);
    };
    f.room.service = async (body) => {
      calls.push(body);
      if (body.grant === value.grant)
        return body.operation === 'movement-checkpoint'
          ? orphanSave.promise
          : orphanRelease.promise;
      if (body.operation === 'authority-refresh') {
        refreshStarted = f.clock.now;
        return liveRefresh.promise;
      }
      if (body.operation === 'movement-checkpoint') {
        saveStarted = f.clock.now;
        captured = body;
        return liveSave.promise;
      }
      throw new Error('Unexpected operation during slow recovery');
    };
    const tick = async (elapsed) => {
      f.clock.now = base + elapsed;
      let returned = false;
      const dispatched = f.rawAlarm().then(() => {
        returned = true;
      });
      await nextTurn();
      assert.equal(
        returned,
        true,
        'The alarm must return while network work is pending',
      );
      await dispatched;
      assert.equal(f.alarms.at(-1), f.clock.now + 1000);
    };

    await tick(1000);
    await tick(2000);
    await tick(3000);
    f.clock.now = base + 3400;
    orphanSave.resolve({});
    await nextTurn();
    await tick(4000);
    await tick(5000);
    assert.equal(
      refreshStarted,
      base + 5000,
      'Live renewal must start while the orphan release is still waiting',
    );

    f.clock.now = base + 5800;
    orphanRelease.resolve({ released: true });
    await nextTurn();
    await tick(6000);
    await tick(7000);
    f.clock.now = base + 7400;
    liveRefresh.resolve({
      ...initial,
      serverNow: refreshStarted,
      authorizedUntil: refreshStarted + 10_000,
      writerUntil: refreshStarted + 10_000,
    });
    await nextTurn();
    assert.ok(
      firstAuthorityAt !== undefined && firstAuthorityAt <= base + 7500,
      'Publish refreshed authority before waiting for the movement checkpoint',
    );
    await tick(8000);
    await tick(9000);
    f.clock.now = base + 9800;
    liveSave.resolve(savedCheckpoint(captured, actor.authority, saveStarted));
    await Promise.all(f.backgroundJobs);

    assert.ok(firstAuthorityAt <= base + 7500);
    assert.ok(
      firstAuthorityAt < originalDeadline,
      'Renew the browser deadline before its existing authority expires',
    );
    assert.equal(
      calls.filter(
        (body) =>
          body.grant === value.grant &&
          body.operation === 'movement-checkpoint',
      ).length,
      1,
    );
    assert.equal(
      calls.filter(
        (body) =>
          body.grant === value.grant && body.operation === 'authority-release',
      ).length,
      1,
    );
    assert.equal(
      calls.filter(
        (body) =>
          body.grant === actor.grant && body.operation === 'authority-refresh',
      ).length,
      1,
    );
    assert.equal(
      calls.filter(
        (body) =>
          body.grant === actor.grant &&
          body.operation === 'movement-checkpoint',
      ).length,
      1,
    );
    assert.equal(ws.readyState, WebSocketMock.OPEN);
    assert.equal(checkpointCount(f), 0);
  },
);

test(
  'restart restores live sockets concurrently before unrelated orphan work',
  { timeout: 3000 },
  async () => {
    const now = Date.now(),
      calls = [],
      sockets = [],
      responses = new Map();
    for (let i = 0; i < 5; i++) {
      const ws = new WebSocketMock(),
        grant = 'live-' + i;
      ws.serializeAttachment({ ...ws.attachment, phase: 'ready', grant });
      sockets.push(ws);
      responses.set(grant, deferred());
    }
    const values = Array.from({ length: 20 }, (_, i) => {
      const value = outbox('orphan-' + i.toString().padStart(2, '0'), now);
      return ['checkpoint:' + value.grant, value];
    });
    const f = await fixture({
      now,
      sockets,
      values,
      waitForInitialization: false,
      service: async (body) => {
        calls.push(body);
        if (body.operation === 'authority-refresh' && responses.has(body.grant))
          return responses.get(body.grant).promise;
        throw new TypeError('Orphan authority unavailable');
      },
    });
    await nextTurn();
    assert.deepEqual(
      calls.map((body) => body.grant).sort((a, b) => a.localeCompare(b)),
      [...responses.keys()],
      'All live refreshes must start before unrelated recovery',
    );
    for (let i = 0; i < 5; i++) {
      const initial = authority(1, now);
      initial.player.id = 'restored-' + i;
      initial.membership.slot = i + 1;
      responses.get('live-' + i).resolve(initial);
    }
    await f.initialized;
    assert.equal(f.room.actors.size, 5);
    assert.ok(
      sockets.every((ws) => ws.sent.some((body) => body.type === 'rebase')),
    );
    assert.equal(
      calls.filter((body) => body.operation === 'movement-checkpoint').length,
      0,
      'Startup defers unrelated recovery until its initialization gate opens',
    );
    assert.equal(checkpointCount(f), 20);
    assert.ok(f.alarms.length > 0, 'Continue orphan recovery in later alarms');
  },
);

test(
  'startup orphan reconciliation releases its writer after saving',
  { timeout: 3000 },
  async () => {
    const now = Date.now(),
      value = outbox('startup-orphan', now),
      calls = [];
    const f = await fixture({
      now,
      values: [['checkpoint:' + value.grant, value]],
      service: async (body) => {
        calls.push(body.operation);
        if (body.operation === 'movement-checkpoint') return {};
        if (body.operation === 'authority-release') return { released: true };
        throw new Error('Unexpected startup operation');
      },
    });
    assert.deepEqual(
      calls,
      [],
      'Startup must defer orphan network work to its alarm',
    );
    await f.room.alarm();
    assert.deepEqual(calls, ['movement-checkpoint', 'authority-release']);
    assert.equal(checkpointCount(f), 0);
  },
);

test(
  'restart resolves an attached checkpoint before restoring its socket',
  { timeout: 3000 },
  async (t) => {
    for (const fails of [false, true]) {
      await t.test(
        fails
          ? 'transient response stays recoverable'
          : 'committed position is restored',
        async () => {
          const now = Date.now(),
            ws = new WebSocketMock(),
            grant = 'attached-checkpoint';
          const value = outbox(grant, now),
            calls = [];
          ws.serializeAttachment({ ...ws.attachment, phase: 'ready', grant });
          const recovered = savedCheckpoint(
            value.checkpoint,
            authority(1, now),
            now,
          ).authority;
          const f = await fixture({
            now,
            sockets: [ws],
            values: [['checkpoint:' + grant, value]],
            service: async (body) => {
              calls.push(body);
              if (body.operation === 'movement-checkpoint') {
                assert.deepEqual(
                  { ...body, operation: undefined, grant: undefined },
                  {
                    ...value.checkpoint,
                    operation: undefined,
                    grant: undefined,
                  },
                );
                if (fails) throw new TypeError('Recovery response lost');
                return {};
              }
              if (body.operation === 'authority-refresh') return recovered;
              throw new Error(
                'A surviving attached writer must not be released',
              );
            },
          });
          if (fails) {
            assert.deepEqual(
              calls.map((body) => body.operation),
              ['movement-checkpoint'],
            );
            assert.deepEqual(
              f.values.get('checkpoint:' + grant).checkpoint,
              value.checkpoint,
            );
            assert.equal(f.room.actors.size, 0);
            assert.equal(ws.closes.at(-1)?.code, 1012);
          } else {
            assert.deepEqual(
              calls.map((body) => body.operation),
              ['movement-checkpoint', 'authority-refresh'],
            );
            assert.equal(checkpointCount(f), 0);
            assert.deepEqual(f.room.actors.get(ws).motion.position, {
              x: value.checkpoint.x,
              z: value.checkpoint.z,
            });
            assert.equal(ws.readyState, WebSocketMock.OPEN);
            assert.equal(ws.sent.at(-1)?.type, 'rebase');
          }
        },
      );
    }
  },
);

test(
  'an orphan release failure remains durable without replaying its saved checkpoint',
  { timeout: 3000 },
  async () => {
    const now = Date.now(),
      value = outbox('release-retry', now),
      calls = [];
    let failed = false;
    const f = await fixture({
      now,
      values: [['checkpoint:' + value.grant, value]],
      service: async (body) => {
        calls.push(body.operation);
        if (body.operation === 'movement-checkpoint') return {};
        if (body.operation === 'authority-release') {
          if (!failed) {
            failed = true;
            throw new TypeError('Release response lost');
          }
          return { released: true };
        }
        throw new Error('Unexpected recovery operation');
      },
    });
    await f.room.alarm();
    assert.equal(
      checkpointCount(f),
      1,
      'Retain the release obligation after its transient failure',
    );
    f.clock.now += 60_000;
    await f.room.alarm();
    assert.deepEqual(calls, [
      'movement-checkpoint',
      'authority-release',
      'authority-release',
    ]);
    assert.equal(checkpointCount(f), 0);
  },
);

test('orphan retry and release completion share a redacted correlation and preserve actual phase outcomes', async () => {
  const now = Date.now(),
    value = outbox('secret-grant-do-not-log', now);
  value.queuedAt = now - 8000;
  let attempts = 0;
  const f = await fixture({
    now,
    values: [['checkpoint:' + value.grant, value]],
    service: async (body) => {
      if (body.operation === 'movement-checkpoint' && ++attempts === 1) {
        const error = new Error('secret-message');
        error.name = 'secret-name';
        throw error;
      }
      return {};
    },
  });
  await f.room.alarm();
  const retry = f.events.find((e) => e.event === 'room-outbox-retry');
  assert.equal(retry.phase, 'checkpoint');
  assert.equal(retry.delayMs, 2000);
  assert.equal(retry.ageMs, 8000);
  assert.match(retry.recoveryId, /^[a-f0-9-]{36}$/);
  assert.equal(f.values.get('checkpoint:' + value.grant).retryAt, now + 2000);
  f.clock.now += 2000;
  await f.room.alarm();
  const finished = f.events.find((e) => e.event === 'room-outbox-finished');
  assert.equal(finished.recoveryId, retry.recoveryId);
  assert.equal(finished.checkpoint, 'confirmed');
  assert.equal(finished.release, 'confirmed');
  assert.equal(checkpointCount(f), 0);
  assert.doesNotMatch(JSON.stringify(f.events), /secret-|checkpoint:/);
});
test('release retry does not claim that an uncertain release completed or replay the confirmed checkpoint', async () => {
  const now = Date.now(),
    value = outbox('release-secret', now),
    calls = [];
  let release = 0;
  const f = await fixture({
    now,
    values: [['checkpoint:' + value.grant, value]],
    service: async (body) => {
      calls.push(body.operation);
      if (body.operation === 'authority-release' && ++release === 1)
        throw new Error('private failure');
      return {};
    },
  });
  await f.room.alarm();
  assert.equal(
    f.events.find((e) => e.event === 'room-outbox-retry').phase,
    'release',
  );
  assert.equal(
    f.events.some((e) => e.event === 'room-outbox-finished'),
    false,
  );
  f.clock.now += 2000;
  await f.room.alarm();
  assert.deepEqual(calls, [
    'movement-checkpoint',
    'authority-release',
    'authority-release',
  ]);
  assert.equal(
    f.events.find((e) => e.event === 'room-outbox-finished').checkpoint,
    'confirmed',
  );
});
test('terminal rejection and expiry are distinguished from confirmed recovery', async () => {
  const now = Date.now(),
    value = outbox('terminal-secret', now);
  const f = await fixture({
    now,
    values: [['checkpoint:' + value.grant, value]],
    fetch: async () => new Response(null, { status: 409 }),
  });
  await f.room.alarm();
  const finished = f.events.find((e) => e.event === 'room-outbox-finished');
  assert.equal(finished.checkpoint, 'terminal');
  assert.equal(finished.release, 'terminal');
  const expired = outbox('expired-secret', now);
  expired.expiresAt = now - 60001;
  f.values.set('checkpoint:' + expired.grant, expired);
  await f.room.alarm();
  assert.equal(
    f.events.filter((e) => e.event === 'room-outbox-expired').length,
    1,
  );
  assert.equal(
    f.events.filter((e) => e.event === 'room-outbox-finished').length,
    1,
  );
});
test('storage failure never reports a retry as durably scheduled', async () => {
  const now = Date.now(),
    value = outbox('storage-secret', now);
  const f = await fixture({
    now,
    values: [['checkpoint:' + value.grant, value]],
    service: async () => {
      throw new Error('provider failed');
    },
  });
  const put = f.ctx.storage.put;
  f.ctx.storage.put = async (key, value) => {
    if (value?.retryAt) throw new Error('storage private data');
    return put(key, value);
  };
  await f.room.alarm();
  assert.equal(
    f.events.some((e) => e.event === 'room-outbox-retry'),
    false,
  );
  assert.equal(
    f.events.find((e) => e.event === 'room-recovery-delayed').reason,
    'storage',
  );
  assert.equal(checkpointCount(f), 1);
});
test('backlog admission warning is bounded and happens before consuming a ticket', async () => {
  const now = Date.now(),
    values = Array.from({ length: 64 }, (_, i) => {
      const v = outbox('backlog-' + i, now);
      return ['checkpoint:' + v.grant, v];
    });
  let calls = 0;
  const f = await fixture({
    now,
    values,
    service: async () => {
      calls++;
      return {};
    },
  });
  for (let i = 0; i < 3; i++) {
    const ws = f.socket();
    await f.room.webSocketMessage(
      ws,
      JSON.stringify({ type: 'join', ticket: 'secret-ticket' }),
    );
  }
  assert.equal(calls, 0);
  const warnings = f.events.filter((e) => e.event === 'room-admission-blocked');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].pendingAtLeast, 64);
  assert.equal(warnings[0].limit, 64);
  assert.doesNotMatch(JSON.stringify(f.events), /secret-ticket|backlog-0/);
});

test('recovery storage failures keep the batch gate until pending siblings settle', async () => {
  for (const stage of ['checkpoint', 'cursor']) {
    const now = Date.now(),
      a = outbox('a-pending', now),
      b = outbox('b-storage', now),
      gate = deferred();
    let pendingCalls = 0,
      failed = false;
    const f = await fixture({
      now,
      values: [
        ['checkpoint:' + a.grant, a],
        ['checkpoint:' + b.grant, b],
      ],
      service: async (body) => {
        if (
          body.operation === 'movement-checkpoint' &&
          body.grant === a.grant
        ) {
          pendingCalls++;
          await gate.promise;
        }
        return {};
      },
    });
    const put = f.ctx.storage.put;
    f.ctx.storage.put = async (key, value) => {
      if (
        !failed &&
        ((stage === 'checkpoint' &&
          key === 'checkpoint:' + b.grant &&
          value.reconciled) ||
          (stage === 'cursor' &&
            key === 'recovery-cursor' &&
            value === 'checkpoint:' + b.grant))
      ) {
        failed = true;
        throw new Error('storage failed');
      }
      return put(key, value);
    };
    try {
      await f.rawAlarm();
      await nextTurn();
      assert.equal(failed, true);
      f.clock.now += 1000;
      await f.rawAlarm();
      await nextTurn();
      assert.equal(pendingCalls, 1, stage);
      assert.equal(
        f.events.some((e) => e.event === 'room-recovery-delayed'),
        false,
        'Do not release the batch before draining',
      );
    } finally {
      gate.resolve();
      await Promise.allSettled(f.backgroundJobs);
    }
    assert.equal(
      f.events.filter((e) => e.event === 'room-recovery-delayed').length,
      1,
    );
  }
});

test('room service classifies only proven transport failures and redacts provider payloads', async () => {
  const marker = 'private-room-provider-sentinel';
  for (const [reason, fetcher] of [
    [
      'network',
      async () => {
        const error = new Error(marker);
        error.name = marker;
        throw error;
      },
    ],
    [
      'timeout',
      async () => {
        throw new DOMException(marker, 'TimeoutError');
      },
    ],
    ['json', async () => new Response(marker)],
    [
      'timeout',
      async () => ({
        ok: true,
        async json() {
          throw new DOMException(marker, 'AbortError');
        },
      }),
    ],
  ]) {
    const now = Date.now(),
      value = outbox('private-room-grant', now);
    const f = await fixture({
      now,
      values: [['checkpoint:' + value.grant, value]],
      fetch: fetcher,
    });
    await f.room.alarm();
    const retry = f.events.find((e) => e.event === 'room-outbox-retry');
    assert.ok(retry, reason);
    assert.equal(retry.reason, reason);
    for (const secret of [marker, value.grant, value.checkpoint.id])
      assert.equal(JSON.stringify(f.events).includes(secret), false);
  }
});
