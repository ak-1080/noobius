import { newFacility, type Facility } from './facility.ts';
export type JobType = 'cooling' | 'boot' | 'network';
export type Upgrade = 'scanner' | 'visor' | 'tracer';
export type Equipment = Record<Upgrade, boolean>;
export type Profile = {
  wallet: string;
  name: string;
  credits: number;
  xp: number;
  shifts: number;
  bestScore: number;
  equipment: Equipment;
  facility?: Facility;
};
export type Puzzle = {
  type: JobType;
  targets?: number[];
  sequence?: number[];
  mapping?: number[];
  labels?: string[];
  tolerance?: number;
};
export type Job = {
  id: JobType;
  status: 'pending' | 'active' | 'repaired' | 'failed';
  attempts: number;
  startedAt: number | null;
  puzzle: Puzzle;
  score: number;
  requestIds: string[];
  hintUsed: boolean;
};
export type Shift = {
  id: string;
  jobs: Job[];
  startedAt: number;
  completedAt: number | null;
  equipment: Equipment;
  credits: number;
  xp: number;
  score: number;
  version: number;
};
export const JOBS = [
  {
    id: 'cooling',
    title: 'Cool your racks',
    department: 'THERMAL',
    description: 'Balance the cooling system.',
    incident: 'Three hot racks. One cooling budget. Absolutely no pressure.',
    location: [-4, 1] as [number, number],
  },
  {
    id: 'boot',
    title: 'Wake the GPUs',
    department: 'COMPUTE',
    description: 'Restore the boot sequence.',
    incident: 'Someone turned it off. Management would like it on again.',
    location: [0, -1.5] as [number, number],
  },
  {
    id: 'network',
    title: 'Patch things up',
    department: 'NETWORK',
    description: 'Reconnect the network.',
    incident: 'The cloud is down. Turns out the cloud has cables.',
    location: [4, 1] as [number, number],
  },
] as const;
export const UPGRADES: {
  id: Upgrade;
  name: string;
  price: number;
  description: string;
  effect: string;
}[] = [
  {
    id: 'scanner',
    name: 'Thermal scanner',
    price: 100,
    description: 'A second opinion on all that smoke.',
    effect: 'Widens each cooling target range by 2 units.',
  },
  {
    id: 'visor',
    name: 'Diagnostic visor',
    price: 150,
    description: 'Because remembering is hard work.',
    effect: 'Replays the GPU sequence once per job.',
  },
  {
    id: 'tracer',
    name: 'Cable tracer',
    price: 200,
    description: 'Follow the cable. Try not to trip.',
    effect: 'Reveals one correct network connection per job.',
  },
];
export const EMPTY_EQUIPMENT: Equipment = {
  scanner: false,
  visor: false,
  tracer: false,
};
export function titleFor(xp: number) {
  return xp >= 600
    ? 'Shift Lead'
    : xp >= 300
      ? 'Rack Technician'
      : xp >= 100
        ? 'Cable Wrangler'
        : 'New Hire';
}
export function nextRank(xp: number) {
  return [100, 300, 600].find((n) => n > xp) ?? null;
}
export function randomInt(max: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % max;
}
export function newPuzzle(type: JobType, equipment: Equipment): Puzzle {
  if (type === 'cooling') {
    const a = 20 + randomInt(16),
      b = 20 + randomInt(16);
    return {
      type,
      targets: [a, b, 100 - a - b],
      tolerance: equipment.scanner ? 5 : 3,
    };
  }
  if (type === 'boot')
    return { type, sequence: Array.from({ length: 4 }, () => randomInt(4)) };
  const mapping = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = randomInt(i + 1);
    [mapping[i], mapping[j]] = [mapping[j], mapping[i]];
  }
  return {
    type,
    mapping,
    labels: ['Inference', 'Storage', 'Training', 'Monitoring'],
  };
}
export function newShift(equipment: Equipment, now = Date.now()): Shift {
  return {
    id: crypto.randomUUID(),
    jobs: JOBS.map((j) => ({
      id: j.id,
      status: 'pending',
      attempts: 0,
      startedAt: null,
      puzzle: newPuzzle(j.id, equipment),
      score: 0,
      requestIds: [],
      hintUsed: false,
    })),
    startedAt: now,
    completedAt: null,
    equipment: { ...equipment },
    credits: 0,
    xp: 0,
    score: 0,
    version: 0,
  };
}
export function checkAnswer(puzzle: Puzzle, answer: unknown): boolean {
  if (!Array.isArray(answer) || !answer.every((x) => Number.isInteger(x)))
    return false;
  if (puzzle.type === 'cooling')
    return (
      answer.length === 3 &&
      answer.every((x) => x >= 0 && x <= 100) &&
      answer.reduce((a, b) => a + b, 0) === 100 &&
      answer.every(
        (x, i) => Math.abs(x - puzzle.targets![i]) <= puzzle.tolerance!,
      )
    );
  const expected = puzzle.type === 'boot' ? puzzle.sequence! : puzzle.mapping!;
  return (
    answer.length === expected.length &&
    answer.every((x, i) => x === expected[i])
  );
}
export function activateJob(
  shift: Shift,
  id: JobType,
  now = Date.now(),
): Shift {
  if (now - shift.startedAt > 86400000)
    throw new Error('This shift has expired. Start a new shift.');
  const next = structuredClone(shift),
    job = next.jobs.find((j) => j.id === id);
  if (!job || next.completedAt) throw new Error('This shift is closed.');
  if (job.status === 'pending') {
    job.status = 'active';
    job.startedAt = now;
    next.version++;
  }
  return next;
}
export function answerJob(
  shift: Shift,
  id: JobType,
  answer: unknown,
  requestId: string,
  now = Date.now(),
): { shift: Shift; correct: boolean; duplicate: boolean } {
  const next = structuredClone(shift),
    job = next.jobs.find((j) => j.id === id);
  if (!job) throw new Error('Unknown station.');
  if (job.requestIds.includes(requestId))
    return { shift: next, correct: job.status === 'repaired', duplicate: true };
  if (next.completedAt || job.status !== 'active' || !job.startedAt)
    throw new Error('Open this station before submitting a repair.');
  if (now - job.startedAt < 1000)
    throw new Error('Wait for the station diagnostics to finish.');
  if (now - next.startedAt > 86400000)
    throw new Error('This shift has expired. Start a new shift.');
  const correct = checkAnswer(job.puzzle, answer);
  job.attempts++;
  job.requestIds.push(requestId);
  if (correct) {
    job.status = 'repaired';
    const speed = Math.max(
      0,
      100 - Math.max(0, Math.floor((now - job.startedAt) / 1000) - 1) * 2,
    );
    job.score =
      300 + (job.attempts === 1 ? 50 : job.attempts === 2 ? 25 : 0) + speed;
  } else if (job.attempts >= 3) job.status = 'failed';
  if (next.jobs.every((j) => j.status === 'repaired' || j.status === 'failed'))
    next.completedAt = now;
  const repaired = next.jobs.filter((j) => j.status === 'repaired').length,
    full = repaired === 3;
  next.credits = repaired * 25 + (full ? 25 : 0);
  next.xp = repaired * 20 + (full ? 40 : 0);
  next.score =
    next.jobs.reduce((sum, j) => sum + j.score, 0) +
    (full && next.jobs.every((j) => j.attempts === 1) ? 150 : 0);
  next.version++;
  return { shift: next, correct, duplicate: false };
}
export function hintJob(shift: Shift, id: JobType, now = Date.now()): Shift {
  if (now - shift.startedAt > 86400000)
    throw new Error('This shift has expired. Start a new shift.');
  const next = structuredClone(shift);
  const job = next.jobs.find((j) => j.id === id);
  if (!job || job.status !== 'active' || job.hintUsed || next.completedAt)
    throw new Error('A hint is not available for this station.');
  if (
    (id === 'boot' && !next.equipment.visor) ||
    (id === 'network' && !next.equipment.tracer) ||
    id === 'cooling'
  )
    throw new Error('This equipment is not installed.');
  job.hintUsed = true;
  next.version++;
  return next;
}
export function guestProfile(): Profile {
  return {
    wallet: 'practice',
    name: 'Practice Noob',
    facility: newFacility(),
    credits: 0,
    xp: 0,
    shifts: 0,
    bestScore: 0,
    equipment: { ...EMPTY_EQUIPMENT },
  };
}
export function publicShift(shift: Shift): Shift {
  return structuredClone(shift);
}
