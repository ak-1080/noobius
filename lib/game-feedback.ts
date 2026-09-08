import {
  computePerTick,
  computeTankCapacity,
  dayKey,
  modules,
  storedComputeNow,
  ZONES,
  type Facility,
  type FacilityAction,
  type applyFacility,
} from './facility.ts';

export type FacilityReceipt = {
  requestId: string;
  kind: string;
  title: string;
  detail: string;
};

// Use this operation's committed result, never a later profile read or the
// amount shown before the request crossed a production tick.
export function facilityReceipt(
  before: Facility,
  action: FacilityAction,
  result: ReturnType<typeof applyFacility>,
): FacilityReceipt | null {
  if (before.requests.includes(action.requestId)) return null;
  const after = result.facility;
  const delta = result.credits;
  const reward = `+${delta.toLocaleString()} Compute`;
  const income = `${(computePerTick(before) * 4).toLocaleString()} → ${(computePerTick(after) * 4).toLocaleString()} Compute / min`;
  let title: string, detail: string;
  switch (action.type) {
    case 'build':
    case 'compute-upgrade':
      title =
        action.type === 'compute-upgrade'
          ? 'Faster machines!'
          : before.builds[action.id!] > 0
            ? 'Machine upgraded!'
            : 'New machine online!';
      detail = `${delta < 0 ? `${(-delta).toLocaleString()} Compute spent` : 'Free starter built'} · ${income}`;
      if (modules(after) === 21 && after.computeBoost === 5) {
        title = 'Data center complete!';
        detail += ' · Every machine. Every upgrade. You did it.';
      }
      break;
    case 'compute-harvest':
    case 'compute-collect':
      title =
        action.type === 'compute-harvest'
          ? 'Compute collected!'
          : 'Bonus collected!';
      detail = `${reward} · Ready to spend on your next upgrade.`;
      break;
    case 'outage-fix':
      title = 'You woke it up!';
      detail = `${reward} · +${result.xp} XP`;
      break;
    case 'unlock':
      title = `${ZONES.find((zone) => zone.id === action.id)?.name ?? 'New room'} unlocked!`;
      detail = `${(-delta).toLocaleString()} Compute spent · Room for more machines.`;
      break;
    case 'daily-bonus':
    case 'tycoon-daily': {
      const unlocked =
        !before.owned.includes('afterhours') &&
        after.owned.includes('afterhours');
      title = unlocked ? 'Gold outfit unlocked!' : 'Daily goal complete!';
      detail = `${reward} · +${result.xp} XP · ${unlocked ? 'Try it in your Locker.' : after.owned.includes('afterhours') ? 'Come back tomorrow for another bonus.' : `${after.workdays} of 3 days toward the gold outfit.`}`;
      break;
    }
    default:
      return null;
  }
  return { requestId: action.requestId, kind: action.type, title, detail };
}

export function dailyRewardReady(f: Facility, now: number) {
  const today = dayKey(now);
  return (
    f.day === today &&
    f.lastWorkday !== today &&
    (f.daily.computeEarned ?? 0) >= 100
  );
}

// A short entry summary, only for established players with at least a minute
// of output waiting. Reading this does not collect or change any game state.
export function returnSummary(f: Facility, now: number) {
  if (
    !f.seen.includes('intro:identity') ||
    !f.seen.includes('intro:welcome') ||
    !modules(f)
  )
    return null;
  const ready = storedComputeNow(f, now);
  if (ready < computePerTick(f) * 4) return null;
  return {
    ready,
    full: ready >= computeTankCapacity(f),
    rate: computePerTick(f) * 4,
    dailyReady: dailyRewardReady(f, now),
  };
}
