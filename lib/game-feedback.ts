import {
  computePerTick,
  computeTankCapacity,
  dayKey,
  modules,
  storedComputeNow,
  ZONES,
  ITEMS,
  type Facility,
  type FacilityAction,
  type ItemId,
  type applyFacility,
} from './facility.ts';
import { contractFor } from './contracts.ts';
import type { GuideView } from './objectives.ts';
import type { NeighborhoodSnapshot } from './neighborhoods.ts';

export type ReturnWork = {
  id: string;
  title: string;
  detail: string;
  phase: 'ready' | 'waiting' | 'running';
  panel: 'contracts' | 'crafting' | 'project' | 'compute';
  view?: GuideView;
};
const timeLeft = (deadline: number, now: number) => {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return seconds < 60 ? `${seconds}s left` : `${Math.ceil(seconds / 60)}m left`;
};

// Tie readiness to the authenticated occupant of this membership's slot. An
// old wallet snapshot may still render once before the connection hook resets.
export function returnWorldReady(
  practice: boolean,
  canMove: boolean,
  snapshot: NeighborhoodSnapshot | null,
  playerId?: string,
) {
  return (
    practice ||
    !!(
      canMove &&
      playerId &&
      snapshot?.neighbors.some(
        (neighbor) =>
          neighbor.id === playerId &&
          neighbor.slot === snapshot.membership.slot,
      )
    )
  );
}

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
          ? 'More passive Compute!'
          : before.builds[action.id!] > 0
            ? 'Machine upgraded!'
            : 'New machine online!';
      detail = `${delta < 0 ? `${(-delta).toLocaleString()} Compute spent` : 'Free starter built'} · ${income}`;
      if (modules(after) === 21 && after.computeBoost === 5) {
        title = 'Every machine upgraded!';
        detail += ' · Ready for client work and crew projects.';
      }
      break;
    case 'contract-claim':
      title = 'Job complete!';
      detail = `${reward} · +${result.xp} reputation · +1 job report · A new offer is waiting.`;
      break;
    case 'module-build':
      title = 'New equipment built!';
      detail = 'Choose this module when starting your next job.';
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

// A read-only entry recap. Busy machines may have no idle Compute: completed
// client work and crafted parts are still useful reasons to return.
export function returnSummary(f: Facility, now: number, connected = false) {
  if (
    !f.seen.includes('intro:identity') ||
    !f.seen.includes('intro:welcome') ||
    !modules(f)
  )
    return null;
  const ready = storedComputeNow(f, now);
  const work: ReturnWork[] = [];
  for (const run of f.career?.active ?? []) {
    const template = contractFor(run);
    const complete =
      run.state === 'ready' ||
      (template.family !== 'service' &&
        run.readyAt !== null &&
        run.readyAt <= now);
    const phase = complete
      ? 'ready'
      : run.state === 'accepted' ||
          (template.family === 'service' && run.nextStepAt <= now)
        ? 'waiting'
        : 'running';
    work.push({
      id: 'job:' + run.id,
      title: template.name,
      detail: complete
        ? 'Payment ready · review your job'
        : run.state === 'accepted'
          ? 'Accepted · choose your setup and begin'
          : template.family === 'service'
            ? phase === 'waiting'
              ? 'Your repair needs its next step'
              : `Checking · ${timeLeft(run.nextStepAt, now)}`
            : timeLeft(run.readyAt ?? now, now),
      phase,
      panel: 'contracts',
      view: { jobsTab: 'board', jobId: run.id },
    });
  }
  if (f.craft) {
    const craft = f.craft,
      complete = craft.readyAt <= now;
    work.push({
      id: 'craft:' + (craft.id ?? craft.readyAt),
      title: `${craft.quantity ?? 1} × ${ITEMS[craft.recipe as ItemId]?.name ?? 'parts'}`,
      detail: complete
        ? 'Ready at the workbench · pick up your parts'
        : `At the workbench · ${timeLeft(craft.readyAt, now)}`,
      phase: complete ? 'ready' : 'running',
      panel: 'crafting',
      view: {
        recipe: craft.recipe as ItemId,
        quantity: craft.quantity ?? 1,
        ...(craft.variant ? { recipeVariant: craft.variant } : {}),
      },
    });
  }
  if (f.workload) {
    const complete = f.workload.readyAt <= now;
    work.push({
      id: 'bonus:' + f.workload.readyAt,
      title: 'Machine bonus',
      detail: complete
        ? 'Ready · review and collect'
        : timeLeft(f.workload.readyAt, now),
      phase: complete ? 'ready' : 'running',
      panel: 'compute',
    });
  }
  if (connected && f.projectReservations?.length) {
    const active = f.projectReservations.filter((loan) => loan.readyAt > now);
    work.push({
      id: 'crew-runs',
      title: 'Your crew assignment',
      detail: active.length
        ? `${active.length} machine${active.length === 1 ? '' : 's'} helping the cluster`
        : 'Machine time finished · check the crew build',
      phase: active.length ? 'running' : 'waiting',
      panel: 'project',
    });
  }
  work.sort(
    (a, b) =>
      ['ready', 'waiting', 'running'].indexOf(a.phase) -
      ['ready', 'waiting', 'running'].indexOf(b.phase),
  );
  const dailyReady = dailyRewardReady(f, now);
  if (ready < Math.max(1, computePerTick(f) * 4) && !work.length && !dailyReady)
    return null;
  return {
    ready,
    full: ready >= computeTankCapacity(f),
    rate: computePerTick(f) * 4,
    dailyReady,
    work,
  };
}
