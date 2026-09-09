import {
  canPay,
  itemCount,
  type Facility,
  type CraftVariant,
} from './facility.ts';
import {
  resolveObjective,
  type Objective,
  type PartsRequest,
} from './objectives.ts';

// Preparing supplies is client guidance, separate from the saved tracked job.
// Every gather, craft, pickup and job start remains an explicit action.
export function withBoardVariant(
  plan: PartsRequest,
  variant: CraftVariant,
): PartsRequest {
  return { ...plan, boardVariant: variant };
}
export function nestedPartsPlan(
  parent: PartsRequest | undefined,
  request: PartsRequest,
): PartsRequest {
  if (
    parent?.source?.panel !== 'contracts' ||
    request.source?.panel !== 'crafting'
  )
    return request;
  return request.boardVariant === undefined
    ? parent
    : withBoardVariant(parent, request.boardVariant);
}
export function partsPlanObjective(
  f: Facility,
  credits: number,
  now: number,
  plan?: PartsRequest,
): Objective | null {
  if (!plan) return null;
  const jobId = plan.source?.view.jobId;
  if (
    jobId &&
    !f.career?.active.some(
      (run) => run.id === jobId && run.state === 'accepted',
    )
  )
    return null;
  const moduleId = plan.source?.view.moduleId;
  if (moduleId && f.career?.modules.includes(moduleId)) return null;
  const step = resolveObjective(f, credits, now, plan);
  const source = plan.source;
  if (!source || !plan.items) return step;
  if (canPay(f.inventory, plan.items))
    return {
      ...step,
      title: `Ready for ${source.label}`,
      detail:
        'Your supplies are ready. Review your setup and start when you choose.',
      cta: 'Return to your work',
      target: source.panel === 'crafting' ? 'workbench' : undefined,
      panel: source.panel,
      view: source.view,
      action: undefined,
    };
  // The user-selected craft batch itself cannot fit, as distinct from a
  // larger job's component goal which the resolver splits into bench batches.
  if (itemCount(plan.items) > 120 + f.storage * 40)
    return {
      ...step,
      title: 'This batch needs a bigger backpack',
      detail: `These supplies need ${itemCount(plan.items)} spaces. Your backpack holds ${120 + f.storage * 40}. Reduce the batch or expand your backpack.`,
      cta: 'Adjust batch',
      target: source.panel === 'crafting' ? 'workbench' : undefined,
      panel: source.panel,
      view: source.view,
      action: undefined,
    };
  return { ...step, chapter: `SUPPLIES FOR ${source.label.toUpperCase()}` };
}
