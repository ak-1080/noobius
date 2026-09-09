import type { NextStep } from './objectives.ts';

// Guidance has no command payload. Following a route can never purchase,
// craft, gather or settle a reward on the player's behalf.
export type Guidance = Omit<NextStep, 'action' | 'repair'>;
export function arrivalGuidance(
  step: Guidance,
  name: string,
  readyAt: number,
  now: number,
): Guidance {
  const seconds = Math.max(0, Math.ceil((readyAt - now) / 1000));
  return {
    ...step,
    detail:
      seconds > 0
        ? `${name} refills in ${seconds}s. Wait here or choose another job.`
        : `Click ${name} or press E to interact.`,
    cta: 'Back to my goal',
  };
}
export function guidanceFor(step: NextStep): Guidance {
  const { action, repair, ...guide } = step;
  const panels: Record<string, string> = {
    build: 'facility',
    'compute-upgrade': 'facility',
    'compute-harvest': 'facility',
    'compute-collect': 'compute',
    'compute-start': 'compute',
    craft: 'crafting',
    collect: 'crafting',
    unlock: 'map',
    claim: 'contracts',
    daily: 'contracts',
    'daily-bonus': 'contracts',
    bank: 'inventory',
    coffee: 'inventory',
    utility: 'facility',
  };
  return {
    ...guide,
    view:
      action?.type === 'bank'
        ? {
            ...guide.view,
            inventoryTab: action.direction === 'withdraw' ? 'bank' : 'bag',
            item: action.item,
          }
        : guide.view,
    panel:
      guide.panel ??
      (repair ? 'jobs' : action ? panels[action.type] : undefined),
    cta: guide.target ? 'Show me where' : 'Take a look',
  };
}
