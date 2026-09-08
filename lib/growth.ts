import {
  BOOST_PRICES,
  OBJECTS,
  ZONES,
  computePerTick,
  type Facility,
} from './facility.ts';

// Progress is read from the player's machines and rooms. Opening Goals never
// claims a reward or changes the save, including on an older established save.
export function growthProgress(f: Facility) {
  const plots = OBJECTS.filter((o) => o.kind === 'build');
  const machines = plots.filter((o) => (f.builds[o.id] ?? 0) > 0).length;
  const levels = plots.reduce(
    (n, o) => n + Math.min(3, Math.max(0, f.builds[o.id] ?? 0)),
    0,
  );
  const rooms = ZONES.filter((z) => f.unlocked.includes(z.id)).length;
  const expanded = ZONES.some((z) => z.cost > 0 && f.unlocked.includes(z.id));
  const speed = Math.min(BOOST_PRICES.length, f.computeBoost);
  const milestones = [
    {
      id: 'first',
      title: 'Your first green light',
      detail: 'Build your free starter machine.',
      done: machines >= 1,
    },
    {
      id: 'speed',
      title: 'Pick up the pace',
      detail: 'Buy your first speed upgrade.',
      done: speed >= 1,
    },
    {
      id: 'second',
      title: 'Better together',
      detail: 'Have two machines earning Compute.',
      done: machines >= 2,
    },
    {
      id: 'expand',
      title: 'Room to grow',
      detail: 'Unlock your first new room.',
      done: expanded,
    },
    {
      id: 'rooms',
      title: 'The whole place is yours',
      detail: `Open all ${ZONES.length} rooms.`,
      done: rooms === ZONES.length,
    },
    {
      id: 'complete',
      title: 'All systems go',
      detail: 'Max every machine and reach top speed.',
      done:
        rooms === ZONES.length &&
        levels === plots.length * 3 &&
        speed === BOOST_PRICES.length,
    },
  ];
  return {
    milestones,
    machines,
    machineTotal: plots.length,
    rooms,
    roomTotal: ZONES.length,
    levels,
    levelTotal: plots.length * 3,
    speed,
    speedTotal: BOOST_PRICES.length,
    completed: milestones.filter((m) => m.done).length,
    current: milestones.find((m) => !m.done)?.id ?? null,
    complete: milestones.every((m) => m.done),
    rate: computePerTick(f) * 4,
  };
}
