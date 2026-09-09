import type { NextStep } from './objectives.ts';

// Guidance has no command payload. Following a route can never purchase,
// craft, gather or settle a reward on the player's behalf.
export type Guidance = Omit<NextStep, 'action' | 'repair'>;
export function guidanceFor(step: NextStep): Guidance {
  const { action, repair, ...guide } = step;
  const panels: Record<string, string> = {
    build: 'facility', 'compute-upgrade': 'facility', 'compute-harvest': 'facility',
    'compute-collect': 'compute', 'compute-start': 'compute',
    craft: 'crafting', collect: 'crafting', unlock: 'map',
    claim: 'contracts', daily: 'contracts', 'daily-bonus': 'contracts',
    bank: 'inventory', coffee: 'inventory', utility: 'facility',
  };
  return {
    ...guide,
    panel: guide.panel ?? (repair ? 'jobs' : action ? panels[action.type] : undefined),
    cta: guide.target ? 'Show me where' : 'Take a look',
  };
}
