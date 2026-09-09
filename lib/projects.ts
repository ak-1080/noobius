import type { Bag } from './facility.ts';
import type { Career, ContractFamily, ModuleStyle } from './contracts.ts';
import type { DispatchBenefit } from './dispatch.ts';
import type { ServiceSession, CommissioningWork } from './commissioning.ts';
export const PROJECT_FAMILIES: ContractFamily[] = [
  'service',
  'supply',
  'workload',
];
export type ProjectVariant = {
  id: string;
  name: string;
  description: string;
  extra: ContractFamily | null;
  realms: readonly ('commons' | 'gpu')[];
  requirements: Partial<Record<ContractFamily, ModuleStyle>>;
};
export const PROJECT_VARIANTS: readonly ProjectVariant[] = [
  {
    id: 'balanced',
    name: 'First light',
    description: 'Build a reliable cluster, one useful job at a time.',
    extra: null,
    realms: ['commons', 'gpu'],
    requirements: {},
  },
  {
    id: 'rapid',
    name: 'Launch night',
    description: 'Prepare an extra workload for a client launch.',
    extra: 'workload',
    // Keep saved projects finishable without changing their original terms.
    realms: [],
    requirements: {},
  },
  {
    id: 'quiet',
    name: 'Quiet hours',
    description: 'Give this cluster extra care before its overnight shift.',
    extra: 'service',
    realms: [],
    requirements: {},
  },
  {
    id: 'gpu-launch',
    name: 'Launch night',
    description:
      'Finish client workloads using Fast equipment. Bring those reports to launch the cluster.',
    extra: 'workload',
    realms: ['gpu'],
    requirements: { workload: 'fast' },
  },
  {
    id: 'gpu-stability',
    name: 'Steady overnight',
    description:
      'Finish service jobs using Stable equipment. Bring those reports to prepare a reliable overnight cluster.',
    extra: 'service',
    realms: ['gpu'],
    requirements: { service: 'stable' },
  },
  {
    id: 'gpu-efficiency',
    name: 'Lean build',
    description:
      'Finish supply jobs using Efficient equipment. Bring those reports to assemble the next cluster.',
    extra: 'supply',
    realms: ['gpu'],
    requirements: { supply: 'efficient' },
  },
];
export const projectVariantsFor = (realm: 'commons' | 'gpu') =>
  PROJECT_VARIANTS.filter((v) => v.realms.includes(realm));
export function projectBenefitFor(variant: string): DispatchBenefit | null {
  const v = PROJECT_VARIANTS.find((v) => v.id === variant);
  return v?.extra && v.requirements[v.extra] && v.realms.includes('gpu')
    ? { version: 1, kind: 'dispatch', family: v.extra, storedLimit: 2 }
    : null;
}
export const projectReportStyle = (
  variant: string,
  family: ContractFamily,
): ModuleStyle | undefined =>
  PROJECT_VARIANTS.find((v) => v.id === variant)?.requirements[family];
export const PROJECT_INPUTS: Record<ContractFamily, Bag> = {
  service: { kit: 1 },
  supply: { board: 1 },
  workload: { copper: 3, silicon: 2 },
};
const REPORT_STYLES: ModuleStyle[] = [
  'standard',
  'efficient',
  'fast',
  'stable',
];
export function reportsAvailable(
  c: Career,
  family: ContractFamily,
  style?: ModuleStyle,
) {
  const total = Math.max(
    0,
    c.completed[family] - (c.projectUsed?.[family] ?? 0),
  );
  if (!style) return total;
  return Math.min(
    total,
    Math.max(
      0,
      (c.reportStyles?.[family]?.[style] ?? 0) -
        (c.projectUsedStyles?.[family]?.[style] ?? 0),
    ),
  );
}

/** Show which existing report will be spent before the player contributes. */
export function previewProjectReport(
  c: Career,
  family: ContractFamily,
  style?: ModuleStyle,
): 'legacy' | ModuleStyle | null {
  if (style) return reportsAvailable(c, family, style) > 0 ? style : null;
  const total = reportsAvailable(c, family);
  if (!total) return null;
  const typed = REPORT_STYLES.reduce(
    (sum, s) => sum + reportsAvailable(c, family, s),
    0,
  );
  if (total > typed) return 'legacy';
  return REPORT_STYLES.find((s) => reportsAvailable(c, family, s) > 0) ?? null;
}

/** Mutate a cloned career only. Aggregate and typed reports are one pool. */
export function consumeProjectReport(
  c: Career,
  family: ContractFamily,
  style?: ModuleStyle,
): boolean {
  const source = previewProjectReport(c, family, style);
  if (source === null) return false;
  c.projectUsed ??= { service: 0, supply: 0, workload: 0 };
  c.projectUsed[family]++;
  if (source !== 'legacy') {
    c.projectUsedStyles ??= {};
    const spent = (c.projectUsedStyles[family] ??= {});
    spent[source] = (spent[source] ?? 0) + 1;
  }
  return true;
}
export type Project = {
  workVersion?: number;
  pendingWorkload?: number;
  benefit?: DispatchBenefit | null;
  id: string;
  neighborhoodId: string;
  variant: string;
  state: 'open' | 'completed';
  scale: number;
  required: Record<ContractFamily, number>;
  progress: Record<ContractFamily, number>;
  version: number;
  createdAt: number;
  completedAt: number | null;
};
export type ProjectSnapshot = {
  historyNextCursor?: string | null;
  service?: ServiceSession | null;
  workloads?: (CommissioningWork & { name: string; mine: boolean })[];
  project: Project | null;
  contributions: {
    name: string;
    family: ContractFamily;
    units: number;
    mine: boolean;
    pending?: number;
  }[];
  history: {
    benefit?: DispatchBenefit | null;
    dispatchUnits?: number;
    id: string;
    neighborhoodId: string;
    realm: 'commons' | 'gpu';
    variant: string;
    state: string;
    units: number;
    claimed: boolean;
  }[];
};
