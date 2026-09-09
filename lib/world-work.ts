import { contractTemplate, type ContractRun } from './contracts.ts';
import {
  ITEMS,
  OBJECTS,
  type Facility,
  type FacilityAction,
  type ItemId,
} from './facility.ts';
import type { GuideView } from './objectives.ts';

export type WorldWork = {
  key: string;
  objectId: string;
  kind: 'client' | 'commission' | 'craft' | 'bonus';
  phase: 'waiting' | 'running' | 'ready';
  caption: string;
  progress: number | null;
  panel: 'contracts' | 'facility' | 'crafting' | 'compute';
  view?: GuideView;
};
const remaining = (deadline: number, now: number) => {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    : `${seconds}s`;
};
const progress = (
  start: number | null | undefined,
  end: number,
  now: number,
) =>
  start == null || end <= start
    ? null
    : Math.min(1, Math.max(0, (now - start) / (end - start)));
export const contractWorksite = (run: ContractRun) =>
  run.rack ?? contractTemplate(run.template).target;

/** Read-only presentation. Visitors never receive the owner's private work. */
export function worldWork(
  f: Facility,
  now: number,
  visible = true,
): WorldWork[] {
  if (!visible) return [];
  const signals: WorldWork[] = [];
  for (const run of f.career?.active ?? []) {
    const template = contractTemplate(run.template),
      service = template.family === 'service';
    if (template.family === 'workload' && !run.rack) continue;
    const ready =
      run.state === 'ready' ||
      (!service && run.readyAt !== null && now >= run.readyAt);
    let phase: WorldWork['phase'] = ready
      ? 'ready'
      : run.state === 'accepted'
        ? 'waiting'
        : 'running';
    let caption = ready
      ? 'Job ready · open'
      : run.state === 'accepted'
        ? 'Job · begin'
        : `Client job · ${remaining(run.readyAt ?? run.nextStepAt, now)}`;
    if (service && !ready && run.state !== 'accepted') {
      if (now < run.nextStepAt)
        caption = `Checking · ${remaining(run.nextStepAt, now)}`;
      else {
        phase = 'waiting';
        caption =
          run.steps === 0
            ? 'Job · inspect'
            : run.steps === 1
              ? 'Job · choose repair'
              : 'Job · run test';
      }
    }
    signals.push({
      key: 'job:' + run.id,
      objectId: contractWorksite(run),
      kind: 'client',
      phase,
      caption,
      progress: ready
        ? 1
        : service
          ? Math.min(0.85, run.steps / 3)
          : run.readyAt === null
            ? null
            : progress(run.startedAt, run.readyAt, now),
      panel: 'contracts',
      view: { jobsTab: 'board', jobId: run.id },
    });
  }
  for (const loan of f.projectReservations ?? []) {
    // Its machine is free at the deadline, even before the ledger is reconciled.
    if (loan.readyAt <= now) continue;
    signals.push({
      key: 'commission:' + loan.id,
      objectId: loan.rack,
      kind: 'commission',
      phase: 'running',
      caption: `Crew run · ${remaining(loan.readyAt, now)}`,
      progress: progress(loan.startedAt, loan.readyAt, now),
      panel: 'facility',
    });
  }
  if (f.craft) {
    const craft = f.craft,
      ready = craft.readyAt <= now,
      name = ITEMS[craft.recipe as ItemId]?.name ?? 'parts';
    signals.push({
      key: 'craft:' + (craft.id ?? craft.readyAt),
      objectId: 'workbench',
      kind: 'craft',
      phase: ready ? 'ready' : 'running',
      caption: `${craft.quantity ?? 1} × ${name} · ${ready ? 'ready' : remaining(craft.readyAt, now)}`,
      progress: ready ? 1 : progress(craft.startedAt, craft.readyAt, now),
      panel: 'crafting',
      view: { recipe: craft.recipe as ItemId, quantity: craft.quantity ?? 1 },
    });
  }
  if (f.workload) {
    const run = f.workload,
      ready = run.readyAt <= now;
    signals.push({
      key: 'bonus:' + run.readyAt,
      objectId: run.rack,
      kind: 'bonus',
      phase: ready ? 'ready' : 'running',
      caption: ready
        ? 'Bonus ready · open'
        : `Bonus · ${remaining(run.readyAt, now)}`,
      progress: ready ? 1 : null,
      panel: 'compute',
    });
  }
  return signals;
}

/** Resolve before committing: a claimed job is removed from the next snapshot. */
export function workEffectTarget(
  f: Facility,
  action: Pick<FacilityAction, 'type' | 'id' | 'rack'>,
): string | undefined {
  if (!action.type.startsWith('contract-')) return undefined;
  const run = f.career?.active.find((r) => r.id === action.id);
  if (!run) return undefined;
  const target =
    action.type === 'contract-start' && action.rack
      ? action.rack
      : contractWorksite(run);
  return OBJECTS.some((o) => o.id === target) ? target : undefined;
}
