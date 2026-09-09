import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const output = ts.transpileModule(
  readFileSync(
    new URL('../components/noobius/useReturnBriefing.ts', import.meta.url),
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
    effects = [];
  let cursor = 0,
    presentations = 0;
  const exports = {};
  const react = {
    useRef(value) {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useEffect(run, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((v, n) => !Object.is(v, slots[i][n]))) {
        slots[i] = deps;
        effects.push(run);
      }
    },
  };
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      assert.equal(name, 'react');
      return react;
    },
  });
  let props = {
    account: 'a',
    playing: true,
    eligible: true,
    ready: false,
    blocked: false,
    onOpen: () => presentations++,
  };
  return {
    render(changes = {}) {
      props = { ...props, ...changes };
      cursor = 0;
      exports.useReturnBriefing(props);
      while (effects.length) effects.shift()();
      return presentations;
    },
  };
}
void test('initial connection and a blocking modal cannot present or consume the pending recap', () => {
  const f = fixture();
  assert.equal(f.render(), 0);
  assert.equal(f.render({ ready: true, blocked: true }), 0);
  assert.equal(f.render({ blocked: false }), 1);
  assert.equal(f.render({ blocked: true }), 1);
  assert.equal(f.render({ ready: false, blocked: false }), 1);
  assert.equal(f.render({ ready: true }), 1);
});
void test('first-time entry does not become a return popup after onboarding or an idle minute', () => {
  const f = fixture();
  assert.equal(f.render({ eligible: false }), 0);
  assert.equal(f.render({ ready: true, eligible: true }), 0);
});
void test('another wallet has independent entry eligibility and waits for its own world readiness', () => {
  const f = fixture();
  assert.equal(f.render({ ready: true }), 1);
  assert.equal(f.render({ account: 'b', ready: false }), 1);
  assert.equal(f.render({ ready: true }), 2);
});
void test('returning from title captures new work once; ordinary readiness changes do not', () => {
  const f = fixture();
  assert.equal(f.render({ ready: true }), 1);
  assert.equal(f.render({ playing: false }), 1);
  assert.equal(f.render({ playing: true, ready: false }), 1);
  assert.equal(f.render({ ready: true }), 2);
  assert.equal(f.render({ eligible: false }), 2);
  assert.equal(f.render({ eligible: true }), 2);
});
void test('work collected behind a blocking menu does not produce stale ready-work recap', () => {
  const f = fixture();
  assert.equal(f.render({ ready: true, blocked: true }), 0);
  assert.equal(f.render({ eligible: false, blocked: false }), 0);
  assert.equal(f.render({ eligible: true }), 0);
});
