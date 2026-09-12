import { careerFor, type ContractFamily } from './contracts.ts';
import type { Facility } from './facility.ts';
import type { Objective } from './objectives.ts';

export const SHIFT_GOALS = [
  {
    id: 'mixed',
    title: 'The all-rounder',
    detail: 'Finish one repair, one parts order and one computing job.',
    family: undefined,
  },
  {
    id: 'service',
    title: 'Fix the floor',
    detail: 'Diagnose and finish three repair jobs.',
    family: 'service',
  },
  {
    id: 'supply',
    title: 'Keep it stocked',
    detail: 'Craft and deliver three parts orders.',
    family: 'supply',
  },
  {
    id: 'workload',
    title: 'Put your machines to work',
    detail: 'Choose machines and finish three computing jobs.',
    family: 'workload',
  },
] as const;
export type ShiftGoalId = (typeof SHIFT_GOALS)[number]['id'];
type Counts = Record<ContractFamily, number>;
export type PersonalGoal = { version: 1; id: ShiftGoalId; baseline: Counts };
const families = ['service', 'supply', 'workload'] as const;
export function startPersonalGoal(f: Facility, id: ShiftGoalId): PersonalGoal {
  return { version: 1, id, baseline: { ...careerFor(f).completed } };
}
export function readPersonalGoal(value: string | null): PersonalGoal | null {
  if (!value) return null;
  try {
    const goal = JSON.parse(value);
    if (
      goal?.version !== 1 ||
      !SHIFT_GOALS.some((g) => g.id === goal.id) ||
      !families.every(
        (family) =>
          Number.isSafeInteger(goal.baseline?.[family]) &&
          goal.baseline[family] >= 0,
      )
    )
      return null;
    return {
      version: 1,
      id: goal.id,
      baseline: {
        service: goal.baseline.service,
        supply: goal.baseline.supply,
        workload: goal.baseline.workload,
      },
    };
  } catch {
    return null;
  }
}
export function personalGoalProgress(f: Facility, goal: PersonalGoal) {
  const counts = careerFor(f).completed;
  const reset = families.some(
    (family) => counts[family] < goal.baseline[family],
  );
  const steps = (goal.id === 'mixed' ? families : [goal.id]).map((family) => ({
    family,
    target: goal.id === 'mixed' ? 1 : 3,
    done: Math.min(
      goal.id === 'mixed' ? 1 : 3,
      Math.max(0, counts[family] - goal.baseline[family]),
    ),
  }));
  const done = steps.reduce((n, step) => n + step.done, 0);
  return { steps, done, total: 3, complete: !reset && done === 3, reset };
}
export function personalGoalObjective(
  f: Facility,
  goal: PersonalGoal,
): Objective {
  const progress = personalGoalProgress(f, goal);
  const spec = SHIFT_GOALS.find((g) => g.id === goal.id)!;
  const family = progress.steps.find((s) => s.done < s.target)?.family;
  return {
    title: progress.complete ? 'Shift goal complete!' : spec.title,
    detail: progress.reset
      ? 'Your save has changed. Start a fresh goal when ready.'
      : progress.complete
        ? 'Your work is counted. Pick another goal whenever you like.'
        : spec.detail,
    cta:
      progress.complete || progress.reset
        ? 'Choose your next goal'
        : 'Find a job',
    panel: 'contracts',
    view:
      progress.complete || progress.reset
        ? { jobsTab: 'progress' }
        : { jobsTab: 'board', family },
    chapter: 'YOUR SHIFT GOAL',
    progress: (progress.done / 3) * 100,
    reward: 'Normal job payments · no time limit',
    speaker: 'MARGO',
  };
}
