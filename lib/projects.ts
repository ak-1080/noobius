import type { Bag } from './facility.ts';
import type { Career, ContractFamily } from './contracts.ts';
export const PROJECT_FAMILIES: ContractFamily[] = [
  'service',
  'supply',
  'workload',
];
export const PROJECT_VARIANTS = [
  {
    id: 'balanced',
    name: 'First light',
    description: 'Build a reliable cluster, one useful job at a time.',
    extra: null,
  },
  {
    id: 'rapid',
    name: 'Launch night',
    description: 'Prepare an extra workload for a client launch.',
    extra: 'workload',
  },
  {
    id: 'quiet',
    name: 'Quiet hours',
    description: 'Give this cluster extra care before its overnight shift.',
    extra: 'service',
  },
] as const;
export const PROJECT_INPUTS: Record<ContractFamily, Bag> = {
  service: { kit: 1 },
  supply: { board: 1 },
  workload: { copper: 3, silicon: 2 },
};
export const reportsAvailable = (c: Career, family: ContractFamily) =>
  Math.max(0, c.completed[family] - (c.projectUsed?.[family] ?? 0));
export type Project = {
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
  project: Project | null;
  contributions: {
    name: string;
    family: ContractFamily;
    units: number;
    mine: boolean;
  }[];
  history: {
    id: string;
    variant: string;
    state: string;
    units: number;
    claimed: boolean;
  }[];
};
