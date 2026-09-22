import { pipeSolution, solveRealmChallenge } from '../lib/realm-challenges.ts';
export function realmAnswer(run) {
  const c = run.challenge;
  if (!c) {
    const p = run.puzzle;
    return p.type === 'boot'
      ? p.sequence
      : p.type === 'cooling'
        ? p.targets
        : p.mapping;
  }
  if (c.kind === 'sorting')
    return c.shipment.map((s) => (s.heat >= 70 ? 2 : s.link ? 0 : 1));
  if (c.kind === 'pipes') return pipeSolution(c.tiles);
  if (c.kind === 'scheduler')
    return Array.from({ length: 16 }, (_, n) => [
      n & 1,
      (n >> 1) & 1,
      (n >> 2) & 1,
      (n >> 3) & 1,
    ]).find((a) => solveRealmChallenge(c, a));
  const minute = Math.max(
    ...c.snapshots
      .filter((s) => s.complete && s.model === c.model)
      .map((s) => s.minute),
  );
  return [
    c.snapshots.findIndex(
      (s) => s.complete && s.model === c.model && s.minute === minute,
    ),
  ];
}
