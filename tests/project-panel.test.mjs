import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as commissioning from '../lib/commissioning.ts';
import * as contracts from '../lib/contracts.ts';
import * as facility from '../lib/facility.ts';
import * as projects from '../lib/projects.ts';
import * as dispatch from '../lib/dispatch.ts';

// Exercise real panel handlers/effects through an in-memory JSX tree. The
// database tests establish pagination ordering; these cover navigation races.
const output = ts.transpileModule(
  readFileSync(
    new URL('../components/noobius/ProjectPanel.tsx', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const entry = (id, state = 'open') => ({
  id,
  neighborhoodId: id + '-room',
  realm: 'commons',
  variant: 'balanced',
  state,
  units: 1,
  claimed: false,
});
const page = (history, historyNextCursor = null) => ({
  project: null,
  contributions: [],
  history,
  historyNextCursor,
});
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean')
    return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return text(node.props?.children);
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree))
    return tree.flatMap((child) => nodes(child, predicate));
  return [
    ...(predicate(tree) ? [tree] : []),
    ...nodes(tree.props?.children, predicate),
  ];
}
function fixture(t, { request, action = async () => true }) {
  const slots = [],
    intervals = new Map(),
    calls = [],
    resumed = [];
  let cursor = 0,
    effects = [],
    timerId = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[i],
        (next) => {
          slots[i] = typeof next === 'function' ? next(slots[i]) : next;
        },
      ];
    },
    useEffect(run, dependencies) {
      const i = cursor++,
        old = slots[i];
      if (
        !old ||
        dependencies.some((v, j) => !Object.is(v, old.dependencies[j]))
      )
        effects.push(() => {
          old?.cleanup?.();
          slots[i] = { effect: true, dependencies, cleanup: run() };
        });
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': Object.fromEntries(
      ['ArrowRight', 'Check', 'Cpu', 'Package', 'Wrench'].map((name) => [
        name,
        name,
      ]),
    ),
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/progress': { Progress: 'progress' },
    '@/components/ui/native-select': {
      NativeSelect: 'select',
      NativeSelectOption: 'option',
    },
    '@/lib/commissioning': commissioning,
    '@/lib/contracts': contracts,
    '@/lib/facility': facility,
    '@/lib/projects': projects,
    '@/lib/dispatch': dispatch,
    './useNoobius': {
      api: async (url) => {
        calls.push(url);
        return request(url);
      },
    },
  };
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
    document: { hidden: false },
    setInterval: (fn, delay) => {
      const id = ++timerId;
      intervals.set(id, { fn, delay });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    Error,
  });
  let props = {
    facility: facility.newFacility(0),
    realm: 'commons',
    connected: true,
    neighborhoodId: 'current-room',
    busy: false,
    atMargo: false,
    onAction: action,
    onWalk() {},
    onJobs() {},
    onParts() {},
    onOutage() {},
    onResume: (...args) => resumed.push(args),
  };
  let tree;
  const render = (changes = {}) => {
    props = { ...props, ...changes };
    cursor = 0;
    effects = [];
    tree = exports.default(props);
    effects.forEach((run) => run());
    return tree;
  };
  t.after(() => {
    for (const slot of slots) if (slot?.effect) slot.cleanup?.();
  });
  return {
    calls,
    resumed,
    render,
    click(label) {
      const button = nodes(
        tree,
        (n) => n.type === 'button' && text(n).trim() === label,
      )[0];
      assert.ok(button, 'Missing button: ' + label);
      assert.ok(!button.props.disabled, 'Disabled button: ' + label);
      button.props.onClick();
      render();
    },
    has(label) {
      return (
        nodes(tree, (n) => n.type === 'button' && text(n).trim() === label)
          .length > 0
      );
    },
    async poll() {
      for (const timer of intervals.values())
        if (timer.delay === 4000) void timer.fn();
      await settle();
      render();
    },
  };
}

void test('history navigation preserves later pages during polling and can resume an older build', async (t) => {
  const cursor = '1:6000:00000000-0000-4000-8000-000000000001';
  const f = fixture(t, {
    request: (url) =>
      url.includes('?')
        ? page([entry('older')])
        : page([entry('latest')], cursor),
  });
  f.render();
  await settle();
  f.render();
  f.click('More builds');
  await settle();
  f.render();
  assert.equal(
    f.calls.at(-1),
    'projects?historyCursor=' + encodeURIComponent(cursor),
  );
  await f.poll();
  assert.equal(
    f.calls.at(-1),
    'projects?historyCursor=' + encodeURIComponent(cursor),
  );
  f.click('Resume project');
  assert.deepEqual(f.resumed, [['commons', 'older-room']]);
  f.click('Previous builds');
  await settle();
  f.render();
  assert.equal(f.calls.at(-1), 'projects');
  assert.equal(f.has('Latest rewards and active builds'), false);
});

void test('a deferred claim from a later page refreshes the latest rewards after settlement', async (t) => {
  const claim = deferred();
  const f = fixture(t, {
    request: (url) =>
      url.includes('?')
        ? page([entry('older', 'completed')])
        : page([entry('latest')], 'next-page'),
    action: () => claim.promise,
  });
  f.render();
  await settle();
  f.render();
  f.click('More builds');
  await settle();
  f.render();
  f.click('Collect');
  assert.equal(f.has('Latest rewards and active builds'), true);
  claim.resolve({ compute: 100 });
  await settle();
  f.render();
  await settle();
  f.render();
  assert.equal(f.calls.at(-1), 'projects');
  assert.equal(f.has('Latest rewards and active builds'), false);
});

void test('late page responses cannot restore history after the room changes', async (t) => {
  const pending = deferred();
  let moved = false;
  const f = fixture(t, {
    request: (url) =>
      url.includes('?') && !moved
        ? pending.promise
        : moved
          ? page([entry('new-room-build')])
          : page([entry('latest')], 'next-page'),
  });
  f.render();
  await settle();
  f.render();
  f.click('More builds');
  moved = true;
  f.render({ connected: false, neighborhoodId: 'replacement-room' });
  f.render({ connected: true });
  await settle();
  f.render();
  pending.resolve(page([entry('stale-build')]));
  await settle();
  f.render();
  f.click('Resume project');
  assert.deepEqual(f.resumed, [['commons', 'new-room-build-room']]);
});
