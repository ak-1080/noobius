import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production hook with in-memory hook storage, effects, HTTP and
// transport boundaries. Deferred promises exercise its real queue/epoch logic;
// RoomClient's frame protocol is covered separately in room-client.test.mjs.
const output = ts.transpileModule(
  readFileSync(
    new URL('../components/noobius/useNeighborhood.ts', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const walletA = { wallet: 'wallet-A', id: 'a'.repeat(32) };
const walletB = { wallet: 'wallet-B', id: 'b'.repeat(32) };
const snapshot = (profile = walletA, overrides = {}) => ({
  membership: {
    neighborhoodId: 'c'.repeat(32),
    realm: 'commons',
    scene: 'home-' + profile.id,
    generation: profile === walletA ? 42 : 84,
    sequence: 1,
    slot: 0,
    x: 0,
    z: 17,
    leaseUntil: 45000,
    ...overrides,
  },
  roomTransport: 'socket',
  writerActive: false,
  people: [],
  neighbors: [],
  serverNow: 0,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
class ClientError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

function fixture(t, { request, connect } = {}) {
  const slots = [],
    calls = [],
    rooms = [],
    controllers = [],
    backoffs = [];
  const intervals = new Map(),
    listeners = new Map();
  let cursor = 0,
    effects = [],
    now = 0,
    timerId = 0,
    props;
  const hooks = {
    useRef(value) {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [
        slots[i],
        (next) => {
          slots[i] = typeof next === 'function' ? next(slots[i]) : next;
        },
      ];
    },
    useEffect(run, deps) {
      const i = cursor++,
        previous = slots[i];
      if (!previous || deps.some((v, k) => !Object.is(v, previous.deps[k])))
        effects.push(() => {
          previous?.cleanup?.();
          slots[i] = { effect: true, deps, cleanup: run() };
        });
    },
  };
  class RoomClient {
    ready = false;
    disposed = false;
    constructor(options) {
      this.options = options;
      rooms.push(this);
    }
    async connect() {
      await connect?.(this, rooms.length);
      this.ready = true;
      this.options.onReady(true);
    }
    dispose() {
      this.ready = false;
      this.disposed = true;
    }
    disconnect(reason) {
      this.ready = false;
      this.options.onReady(false);
      this.options.onDisconnect(reason);
    }
    async release() {
      this.ready = false;
    }
    async syncPosition() {
      return true;
    }
  }
  const api = async (action, body) => {
    calls.push({ action, body });
    const supplied = request?.(action, body, calls);
    if (supplied !== undefined) return supplied;
    if (action === 'room-ticket')
      return { ticket: 'opaque', coordinatorOrigin: 'https://rooms.example' };
    return snapshot(body.expectedWallet === walletB.wallet ? walletB : walletA);
  };
  const modules = {
    react: hooks,
    '@/lib/operations': {
      retryDelay(failures) {
        backoffs.push(failures);
        return 4000;
      },
    },
    '@/lib/room-client': { RoomClient },
    './useNoobius': { api, ClientError },
  };
  const exports = {};
  vm.runInNewContext(output, {
    require: (name) => {
      assert.ok(name in modules, 'Unexpected hook dependency: ' + name);
      return modules[name];
    },
    exports,
    setInterval: (fn, delay) => {
      const id = ++timerId;
      intervals.set(id, { fn, delay, next: now + delay });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    document: { hidden: false },
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => {
        if (listeners.get(name) === fn) listeners.delete(name);
      },
    },
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    crypto,
    Error,
    Promise,
  });
  const onController = (value) => controllers.push(value),
    onRoomWork = () => {};
  const render = (
    profile = props?.profile ?? walletA,
    playing = props?.playing ?? true,
  ) => {
    props = { profile, playing };
    cursor = 0;
    effects = [];
    const result = exports.useNeighborhood(
      profile,
      playing,
      () => ({ x: 0, z: 17 }),
      onController,
      onRoomWork,
    );
    effects.forEach((run) => run());
    return result;
  };
  t.after(() => {
    for (const slot of slots) if (slot?.effect) slot.cleanup?.();
  });
  return {
    render,
    calls,
    rooms,
    controllers,
    backoffs,
    focus: () => listeners.get('focus')?.(),
    async advance(ms) {
      now += ms;
      for (const timer of intervals.values())
        if (now >= timer.next) {
          timer.next = now + timer.delay;
          void timer.fn();
        }
      await settle();
    },
  };
}

test('an initial join finishing after play stops cannot rejoin or restore a controller', async (t) => {
  const pending = deferred();
  const f = fixture(t, {
    request: (action) =>
      action === 'neighborhood-join' ? pending.promise : undefined,
  });
  f.render();
  await settle();
  f.render(walletA, false);
  pending.resolve(snapshot());
  await settle();
  assert.deepEqual(
    f.calls.map((c) => c.action),
    ['neighborhood-join'],
  );
  assert.equal(f.controllers.at(-1), null);
  assert.equal(f.rooms.length, 0);
  const state = f.render();
  assert.equal(state.snapshot, null);
  assert.equal(state.canMove, false);
  assert.equal(state.status, 'Solo practice');
});

test('late metadata cannot reconnect a room after teardown', async (t) => {
  const pending = deferred();
  const f = fixture(t, {
    request: (action) =>
      action === 'neighborhood-state' ? pending.promise : undefined,
  });
  f.render();
  await settle();
  await f.advance(6000);
  const count = f.calls.length;
  assert.equal(f.calls.at(-1).action, 'neighborhood-state');
  f.render(walletA, false);
  pending.resolve(snapshot());
  await settle();
  assert.equal(f.calls.length, count);
  assert.equal(f.rooms.length, 1);
  assert.equal(f.rooms[0].disposed, true);
  assert.equal(f.controllers.at(-1), null);
});

test('a new wallet starts immediately and old work cannot clear its active refresh', async (t) => {
  const a = deferred(),
    b = deferred();
  const f = fixture(t, {
    request: (action, body) =>
      action === 'neighborhood-join'
        ? body.expectedWallet === walletA.wallet
          ? a.promise
          : b.promise
        : undefined,
  });
  const original = f.render();
  await settle();
  const oldSceneChange = original.enter('commons');
  f.render(walletB);
  await settle();
  assert.deepEqual(
    f.calls.map((c) => c.body.expectedWallet),
    [walletA.wallet, walletB.wallet],
  );
  a.resolve(snapshot(walletA));
  await settle();
  assert.equal(await oldSceneChange, false);
  f.focus();
  b.resolve(snapshot(walletB));
  await settle();
  assert.deepEqual(
    f.calls.map((c) => [c.action, c.body.expectedWallet]),
    [
      ['neighborhood-join', walletA.wallet],
      ['neighborhood-join', walletB.wallet],
      ['room-ticket', walletB.wallet],
    ],
  );
  assert.equal(f.rooms.length, 1);
  assert.equal(f.render().snapshot.membership.scene, 'home-' + walletB.id);
  assert.equal(f.controllers.at(-1).generation, 84);
});

test('wallet switch between release and travel prevents the old action', async (t) => {
  const f = fixture(t, {
    request: (action, body) =>
      action.startsWith('neighborhood-')
        ? {
            ...snapshot(
              body.expectedWallet === walletB.wallet ? walletB : walletA,
            ),
            roomTransport: 'poll',
          }
        : undefined,
  });
  f.render();
  await settle();
  let dispatched = 0;
  const traveling = f.render().travel(async () => {
    dispatched++;
  });
  queueMicrotask(() => f.render(walletB));
  await traveling;
  await settle();
  assert.equal(dispatched, 0);
  assert.equal(f.render().snapshot.membership.generation, 84);
});

test('planned grant renewal reconnects immediately and preserves the saved scene', async (t) => {
  const saved = snapshot(walletA, {
    scene: 'home-' + walletB.id,
    x: 2,
    z: 13,
    sequence: 9,
  });
  const f = fixture(t, {
    request: (action) =>
      action.startsWith('neighborhood-') ? saved : undefined,
  });
  f.render();
  await settle();
  f.rooms[0].disconnect('renew');
  await settle();
  assert.deepEqual(
    f.calls.map((c) => c.action),
    ['neighborhood-join', 'room-ticket', 'neighborhood-state', 'room-ticket'],
  );
  assert.deepEqual(f.backoffs, []);
  assert.equal(f.rooms.length, 2);
  const state = f.render();
  assert.deepEqual(state.snapshot.membership, saved.membership);
  assert.equal(state.canMove, true);
  assert.equal(state.status, 'Connected');
});

test('unexpected disconnect retains backoff before retrying', async (t) => {
  const f = fixture(t);
  f.render();
  await settle();
  f.rooms[0].disconnect('interrupted');
  f.focus();
  await f.advance(1500);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.backoffs, [1]);
  await f.advance(3000);
  assert.equal(f.rooms.length, 2);
  assert.equal(f.render().canMove, true);
});

for (const stage of ['ticket', 'connect'])
  test(
    stage + ' failure retries without repeating the scene change',
    async (t) => {
      let tickets = 0;
      const f = fixture(t, {
        request: (action) => {
          if (action === 'room-ticket' && ++tickets === 1 && stage === 'ticket')
            throw new ClientError('Temporarily unavailable', 503);
        },
        connect: (_, attempt) => {
          if (stage === 'connect' && attempt === 1)
            throw new Error('Connection interrupted');
        },
      });
      f.render();
      await settle();
      assert.equal(f.render().canMove, false);
      await f.advance(5000);
      assert.equal(f.render().canMove, true);
      assert.equal(
        f.calls.filter((c) => c.action === 'neighborhood-join').length,
        1,
      );
      assert.equal(f.calls.filter((c) => c.action === 'room-ticket').length, 2);
      assert.equal(
        f.calls.filter((c) => c.action === 'neighborhood-scene').length,
        0,
      );
    },
  );
