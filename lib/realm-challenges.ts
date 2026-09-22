import type { RealmId } from './realm-catalog.ts';
export type RealmChallenge =
  | {
      kind: 'sorting';
      shipment: { name: string; heat: number; link: boolean }[];
    }
  | { kind: 'pipes'; tiles: ('straight' | 'corner')[]; rotations: number[] }
  | {
      kind: 'scheduler';
      jobs: { name: string; slots: number; latency: boolean }[];
      capacity: [number, number];
    }
  | {
      kind: 'restore';
      snapshots: {
        name: string;
        minute: number;
        complete: boolean;
        model: string;
      }[];
      model: string;
    };
export const challengeKind: Record<RealmId, RealmChallenge['kind']> = {
  commons: 'sorting',
  thermal: 'pipes',
  gpu: 'scheduler',
  core: 'restore',
};
const random = (n: number) => Math.floor(Math.random() * n);
const shuffle = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};
const neighbor = (cell: number, out: number) => {
  const row = Math.floor(cell / 3),
    col = cell % 3;
  if (
    (out === 0 && row === 0) ||
    (out === 1 && col === 2) ||
    (out === 2 && row === 2) ||
    (out === 3 && col === 0)
  )
    return -1;
  return cell + [-3, 1, 3, -1][out];
};
export function pipeSolution(
  tiles: ('straight' | 'corner')[],
): number[] | null {
  const visit = (
    cell: number,
    incoming: number,
    seen: Set<number>,
    answer: number[],
  ): number[] | null => {
    if (cell < 0 || seen.has(cell)) return null;
    const visited = new Set(seen).add(cell);
    for (let turns = 0; turns < 4; turns++) {
      const ports = (tiles[cell] === 'straight' ? [3, 1] : [0, 1]).map(
        (n) => (n + turns) % 4,
      );
      if (!ports.includes(incoming)) continue;
      const out = ports.find((p) => p !== incoming)!,
        next = [...answer];
      next[cell] = turns;
      if (cell === 8 && out === 1) return next;
      const found = visit(neighbor(cell, out), (out + 2) % 4, visited, next);
      if (found) return found;
    }
    return null;
  };
  return visit(0, 3, new Set(), Array(9).fill(0));
}
export function makeRealmChallenge(realm: RealmId): RealmChallenge {
  if (realm === 'commons')
    return {
      kind: 'sorting',
      shipment: shuffle([
        'GPU tray',
        'Network card',
        'Power module',
        'Memory board',
      ]).map((name) => ({
        name,
        heat: random(8) * 10 + 10,
        link: random(2) === 1,
      })),
    };
  if (realm === 'thermal') {
    // Grow a simple route first; derive tiles from it so every generated circuit works.
    const routes: number[][] = [];
    const walk = (route: number[]) => {
      const cell = route.at(-1)!;
      if (cell === 8) {
        routes.push(route);
        return;
      }
      for (let dir = 0; dir < 4; dir++) {
        const next = neighbor(cell, dir);
        if (next >= 0 && !route.includes(next)) walk([...route, next]);
      }
    };
    walk([0]);
    const route = routes[random(routes.length)];
    const tiles: ('straight' | 'corner')[] = Array.from({ length: 9 }, () =>
      random(2) ? 'straight' : 'corner',
    );
    route.forEach((cell, i) => {
      const previous = i ? route[i - 1] : -1,
        next = i < route.length - 1 ? route[i + 1] : -1;
      const incoming = i
        ? [0, 1, 2, 3].find((d) => neighbor(cell, d) === previous)!
        : 3;
      const outgoing =
        next < 0 ? 1 : [0, 1, 2, 3].find((d) => neighbor(cell, d) === next)!;
      tiles[cell] = (incoming + 2) % 4 === outgoing ? 'straight' : 'corner';
    });
    return {
      kind: 'pipes',
      tiles,
      rotations: Array.from({ length: 9 }, () => random(4)),
    };
  }
  if (realm === 'gpu') {
    const first = 1 + random(3),
      second = 1 + random(2),
      flex = 2 + random(3);
    return {
      kind: 'scheduler',
      jobs: shuffle([
        { name: 'Live voice', slots: first, latency: true },
        { name: 'Training batch', slots: flex, latency: false },
        { name: 'Document search', slots: second, latency: true },
        { name: 'Night render', slots: 6 - flex, latency: false },
      ]),
      capacity: [6, 6],
    };
  }
  const minute = 10 + random(30),
    model = `N-${6 + random(4)}`;
  return {
    kind: 'restore',
    model,
    snapshots: shuffle([
      { minute: minute + 3, complete: false, model },
      { minute, complete: true, model },
      { minute: minute + 5, complete: true, model: model + '-experimental' },
      { minute: minute - 3, complete: true, model },
    ]).map((s, i) => ({
      ...s,
      name: `Snapshot ${String.fromCharCode(65 + i)}`,
    })),
  };
}
export function pipePath(
  tiles: ('straight' | 'corner')[],
  rotations: number[],
) {
  const reached: number[] = [];
  let cell = 0,
    incoming = 3;
  for (let n = 0; n < 10; n++) {
    if (cell < 0 || cell >= 9 || reached.includes(cell))
      return { success: false, reached };
    const ports = (tiles[cell] === 'straight' ? [3, 1] : [0, 1]).map(
      (p) => (p + rotations[cell]) % 4,
    );
    if (!ports.includes(incoming)) return { success: false, reached };
    reached.push(cell);
    const out = ports.find((p) => p !== incoming)!;
    if (cell === 8 && out === 1) return { success: true, reached };
    cell = neighbor(cell, out);
    incoming = (out + 2) % 4;
  }
  return { success: false, reached };
}
export function solveRealmChallenge(
  c: RealmChallenge,
  answer: unknown,
): boolean {
  if (
    !Array.isArray(answer) ||
    !answer.every((n) => Number.isInteger(n) && n >= 0 && n <= 8)
  )
    return false;
  if (c.kind === 'sorting')
    return (
      answer.length === 4 &&
      c.shipment.every(
        (s, i) => answer[i] === (s.heat >= 70 ? 2 : s.link ? 0 : 1),
      )
    );
  if (c.kind === 'pipes')
    return (
      answer.length === 9 &&
      answer.every((n) => n < 4) &&
      pipePath(c.tiles, answer).success
    );
  if (c.kind === 'scheduler')
    return (
      answer.length === 4 &&
      answer.every((n) => n < 2) &&
      c.jobs.every((j, i) => !j.latency || answer[i] === 0) &&
      [0, 1].every(
        (lane) =>
          c.jobs.reduce(
            (sum, j, i) => sum + (answer[i] === lane ? j.slots : 0),
            0,
          ) <= c.capacity[lane],
      )
    );
  const latest = Math.max(
      ...c.snapshots
        .filter((s) => s.complete && s.model === c.model)
        .map((s) => s.minute),
    ),
    s = c.snapshots[answer[0]];
  return (
    answer.length === 1 &&
    !!s?.complete &&
    s.model === c.model &&
    s.minute === latest
  );
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function validRealmChallenge(v: unknown): v is RealmChallenge {
  if (!object(v)) return false;
  const text = (v: unknown) =>
    typeof v === 'string' && v.length > 0 && v.length < 80;
  if (v.kind === 'sorting')
    return (
      Array.isArray(v.shipment) &&
      v.shipment.length === 4 &&
      v.shipment.every(
        (s) =>
          object(s) &&
          text(s.name) &&
          Number.isSafeInteger(s.heat) &&
          Number(s.heat) >= 0 &&
          Number(s.heat) <= 100 &&
          typeof s.link === 'boolean',
      )
    );
  if (v.kind === 'pipes')
    return (
      Array.isArray(v.tiles) &&
      v.tiles.length === 9 &&
      v.tiles.every((t) => t === 'straight' || t === 'corner') &&
      Array.isArray(v.rotations) &&
      v.rotations.length === 9 &&
      v.rotations.every((n) => Number.isInteger(n) && n >= 0 && n < 4) &&
      !!pipeSolution(v.tiles)
    );
  if (v.kind === 'scheduler') {
    if (
      !(
        Array.isArray(v.jobs) &&
        v.jobs.length === 4 &&
        v.jobs.every(
          (j) =>
            object(j) &&
            text(j.name) &&
            Number.isInteger(j.slots) &&
            Number(j.slots) >= 1 &&
            Number(j.slots) <= 5 &&
            typeof j.latency === 'boolean',
        ) &&
        Array.isArray(v.capacity) &&
        v.capacity.length === 2 &&
        v.capacity.every((n) => Number.isInteger(n) && n >= 1 && n <= 20)
      )
    )
      return false;
    return Array.from({ length: 16 }, (_, n) => [
      n & 1,
      (n >> 1) & 1,
      (n >> 2) & 1,
      (n >> 3) & 1,
    ]).some((a) =>
      solveRealmChallenge(
        v as Extract<RealmChallenge, { kind: 'scheduler' }>,
        a,
      ),
    );
  }
  return (
    v.kind === 'restore' &&
    text(v.model) &&
    Array.isArray(v.snapshots) &&
    v.snapshots.length === 4 &&
    v.snapshots.every(
      (s) =>
        object(s) &&
        text(s.name) &&
        text(s.model) &&
        Number.isSafeInteger(s.minute) &&
        Number(s.minute) >= 0 &&
        Number(s.minute) < 60 &&
        typeof s.complete === 'boolean',
    ) &&
    v.snapshots.some((s) => s.complete && s.model === v.model)
  );
}
