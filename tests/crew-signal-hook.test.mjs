import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { advanceCrewSignals } from '../lib/crew-signals.ts';
const code = ts.transpileModule(
  readFileSync(
    new URL('../components/noobius/useCrewSignals.ts', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
function fixture() {
  const slots = [],
    effects = [],
    listeners = new Map();
  let cursor = 0,
    dirty = false,
    now = 1000;
  const document = {
    hidden: false,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const react = {
    useSyncExternalStore(subscribe, getSnapshot) {
      react.useEffect(
        () =>
          subscribe(() => {
            dirty = true;
          }),
        [],
      );
      return getSnapshot();
    },
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: initial };
      return [
        slots[i].value,
        (next) => {
          const value =
            typeof next === 'function' ? next(slots[i].value) : next;
          if (!Object.is(value, slots[i].value)) {
            slots[i].value = value;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useEffect(run, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((x, j) => !Object.is(x, slots[i].deps[j]))) {
        const cleanup = slots[i]?.cleanup;
        slots[i] = { deps };
        effects.push(() => {
          cleanup?.();
          slots[i].cleanup = run();
        });
      }
    },
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    document,
    Date: { now: () => now },
    require: (name) => (name === 'react' ? react : { advanceCrewSignals }),
  });
  let scope = 'a:room:1:commons',
    packet = { observedAt: 1000, requestStartedAt: 1000, items: [] };
  const render = (changes = {}) => {
    if ('scope' in changes) scope = changes.scope;
    if (changes.packet) packet = changes.packet;
    if (changes.now) now = changes.now;
    let result;
    for (let i = 0; i < 12; i++) {
      cursor = 0;
      dirty = false;
      result = exports.useCrewSignals(scope, packet, now);
      while (effects.length) effects.shift()();
      if (!dirty) return result;
    }
    throw new Error('Render loop');
  };
  return {
    render,
    hide(value) {
      document.hidden = value;
      listeners.get('visibilitychange')?.();
    },
  };
}
const packet = (time, id) => ({
  observedAt: time,
  requestStartedAt: time,
  items: id
    ? [
        {
          id,
          author: 'crew',
          name: 'Tech',
          ping: 'wave',
          scene: 'commons',
          createdAt: time - 1,
        },
      ]
    : [],
});
test('signal hook resets on loss of authority, account/scene replacement and foreground return', () => {
  const f = fixture();
  assert.equal(f.render().length, 0);
  assert.equal(f.render({ packet: packet(2000, 'live'), now: 2000 }).length, 1);
  assert.equal(f.render({ packet: packet(3000, 'new'), now: 3000 }).length, 1);
  assert.equal(f.render({ scope: null }).length, 0);
  assert.equal(f.render({ scope: 'a:room:2:commons' }).length, 0);
  assert.equal(
    f.render({ packet: packet(4000, 'resumed'), now: 4000 }).length,
    1,
  );
  assert.equal(f.render({ scope: 'b:room:1:commons' }).length, 0);
  assert.equal(
    f.render({ packet: packet(5000, 'b-new'), now: 5000 }).length,
    1,
  );
  f.hide(true);
  assert.equal(f.render().length, 0);
  f.hide(false);
  assert.equal(f.render().length, 0);
  assert.equal(
    f.render({ packet: packet(6000, 'while-hidden'), now: 6000 }).length,
    0,
  );
  assert.equal(
    f.render({ packet: packet(7000, 'after-return'), now: 7000 }).length,
    1,
  );
});
test('render clock hides expired signals even without a new network packet', () => {
  const f = fixture();
  f.render();
  f.render({ packet: packet(2000), now: 2000 });
  assert.equal(
    f.render({ packet: packet(3000, 'hello'), now: 3000 }).length,
    1,
  );
  assert.equal(f.render({ now: 23000 }).length, 0);
});
