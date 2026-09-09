import type { Facility } from './facility.ts';

export const MACHINE_POWER: Record<string, number> = {
  'rack-a': 1,
  'rack-b': 1,
  'rack-c': 2,
  'rack-d': 3,
  'rack-e': 4,
  'rack-f': 6,
  'rack-g': 10,
};
export const SPEED_BONUS = [0, 3, 4, 5, 6, 7] as const;
/** Parallel client units. Machine upgrades improve capacity, not just idle income. */
export const workloadCapacity = (f: Facility, rack?: string) =>
  rack ? (f.builds[rack] ?? 0) * (MACHINE_POWER[rack] ?? 1) : 0;
export function machinePerTick(f: Facility, rack: string): number {
  const level = f.builds[rack] ?? 0;
  if (!level) return 0;
  if (f.tycoonVersion !== 1) return level * (1 + f.computeBoost);
  return f.productionVersion === 2
    ? 6 + 2 * (level - 1) + SPEED_BONUS[f.computeBoost]
    : level * (MACHINE_POWER[rack] ?? 1) * (6 + f.computeBoost * 3);
}
