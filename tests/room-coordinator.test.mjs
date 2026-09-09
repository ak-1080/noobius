import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

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
  }
  captureCheckpoint(id, intent) {
    this.pendingCheckpoint = {
      id,
      baseSequence: this.sequence,
      inputSequence: this.inputSequence,
      ...this.position,
      ...(intent ? { intent } : {}),
    };
    return this.pendingCheckpoint;
  }
  applyCheckpointAck(receipt) {
    this.pendingCheckpoint = null;
    this.sequence = receipt.sequence;
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
const sandbox = {
  exports: {},
  require(id) {
    if (!(id in modules))
      throw new Error('Unexpected import in coordinator mock: ' + id);
    return modules[id];
  },
  console,
  Date,
  crypto,
  structuredClone,
  WebSocket: WebSocketMock,
  Request,
  Response,
  URL,
  AbortSignal,
  fetch() {
    throw new Error('Unexpected network call in coordinator test');
  },
};
vm.runInNewContext(output, sandbox, { filename: sourcePath });
const NeighborhoodRoom = sandbox.exports.NeighborhoodRoom;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
function authority(sequence) {
  const now = Date.now();
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
async function fixture() {
  const values = new Map(),
    sockets = [],
    initialization = [],
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
      async list({ prefix = '', limit = Infinity } = {}) {
        return new Map(
          [...values].filter(([key]) => key.startsWith(prefix)).slice(0, limit),
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
    getWebSockets() {
      return sockets.filter((ws) => ws.readyState !== WebSocketMock.CLOSED);
    },
    acceptWebSocket(ws) {
      sockets.push(ws);
    },
  };
  const room = new NeighborhoodRoom(ctx, {});
  await Promise.all(initialization);
  const socket = () => {
    const ws = new WebSocketMock();
    sockets.push(ws);
    return ws;
  };
  return { room, ctx, values, sockets, socket, alarms };
}

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
