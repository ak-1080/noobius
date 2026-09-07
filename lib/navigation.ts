export function planPath(
  from: [number, number],
  to: [number, number],
  clear: (x: number, z: number) => boolean,
  cell = 0.25,
): [number, number][] {
  const snap = (p: [number, number]) =>
    [Math.round(p[0] / cell), Math.round(p[1] / cell)] as [number, number];
  const segmentClear = (a: [number, number], b: [number, number]) => {
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.04),
    );
    for (let i = 0; i <= steps; i++)
      if (
        !clear(
          a[0] + ((b[0] - a[0]) * i) / steps,
          a[1] + ((b[1] - a[1]) * i) / steps,
        )
      )
        return false;
    return true;
  };
  const anchor = (p: [number, number]) => {
    if (!clear(...p)) return undefined;
    const center = snap(p),
      candidates: [number, number][] = [];
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        candidates.push([center[0] + x, center[1] + z]);
    candidates.sort(
      (a, b) =>
        Math.hypot(a[0] * cell - p[0], a[1] * cell - p[1]) -
        Math.hypot(b[0] * cell - p[0], b[1] * cell - p[1]),
    );
    return candidates.find((a) => segmentClear(p, [a[0] * cell, a[1] * cell]));
  };
  const start = anchor(from),
    goal = anchor(to),
    key = (p: [number, number]) => p[0] + ',' + p[1];
  if (!start || !goal) return [];
  const open = [start],
    cost = new Map([[key(start), 0]]),
    previous = new Map<string, [number, number]>(),
    closed = new Set<string>();
  for (let count = 0; open.length && count < 5000; count++) {
    open.sort(
      (a, b) =>
        cost.get(key(a))! +
        Math.hypot(a[0] - goal[0], a[1] - goal[1]) -
        (cost.get(key(b))! + Math.hypot(b[0] - goal[0], b[1] - goal[1])),
    );
    const current = open.shift()!,
      ck = key(current);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (ck === key(goal)) {
      const path: [number, number][] = [];
      let cursor = current;
      while (key(cursor) !== key(start)) {
        path.unshift([cursor[0] * cell, cursor[1] * cell]);
        cursor = previous.get(key(cursor))!;
      }
      path.unshift([start[0] * cell, start[1] * cell]);
      path.push(to);
      return path;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const next: [number, number] = [current[0] + dx, current[1] + dz],
        nk = key(next);
      if (closed.has(nk) || !clear(next[0] * cell, next[1] * cell)) continue;
      if (
        dx &&
        dz &&
        (!clear((current[0] + dx) * cell, current[1] * cell) ||
          !clear(current[0] * cell, (current[1] + dz) * cell))
      )
        continue;
      const g = cost.get(ck)! + Math.hypot(dx, dz);
      if (g < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, g);
        previous.set(nk, current);
        open.push(next);
      }
    }
  }
  return [];
}
