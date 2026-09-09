import { careerFor, contractFor } from './contracts.ts';
import {
  OBJECTS,
  activeIncident,
  type Facility,
  type FacilityAction,
} from './facility.ts';

// Menus may be opened from anywhere. Only work at a physical site requires
// proximity; machines, inventory and job choices remain manageable at home.
export function actionWorksite(
  f: Facility,
  action: Pick<FacilityAction, 'type' | 'id'>,
) {
  if (action.type === 'gather') return OBJECTS.find((o) => o.id === action.id);
  if (action.type === 'craft' || action.type === 'collect')
    return OBJECTS.find((o) => o.id === 'workbench');
  if (action.type.startsWith('outage-'))
    return OBJECTS.find((o) => o.id === activeIncident(f)?.rack);
  if (action.type === 'contract-start' || action.type === 'contract-service') {
    const run = careerFor(f).active.find((r) => r.id === action.id);
    const template = run && contractFor(run);
    if (template && template.family !== 'workload')
      return OBJECTS.find((o) => o.id === template.target);
  }
  return undefined;
}
export function needsHome(action: Pick<FacilityAction, 'type'>) {
  return ![
    'buy',
    'sell',
    'intro',
    'intro-skip',
    'outfit',
    'accessory',
    'coffee',
    'daily',
    'daily-bonus',
    'tycoon-daily',
  ].includes(action.type);
}
