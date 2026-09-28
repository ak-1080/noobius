import {
  ITEMS,
  type Bag,
  type Facility,
  type FacilityAction,
} from './facility.ts';

// Beta issuance budgets, not identity checks or a promise of financial returns.
// Payments are reserved before starting paid work; claims do not pay twice.
export const EARNING_POLICY = {
  windowMs: 24 * 60 * 60 * 1000,
  compute: 6000,
  materials: 600,
  shifts: 4,
  newBrowserAccounts: 3,
  newNetworkAccounts: 20,
  retentionMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export type EarningCharge = {
  source: string;
  compute: number;
  materials: number;
};
export type EarningAllowance = {
  compute: number;
  materials: number;
  shifts: number;
  nextAt: number | null;
  shared: boolean;
};
export const materialValue = (bag: Bag) =>
  Object.entries(bag).reduce(
    (sum, [item, n]) => sum + ITEMS[item as keyof Bag].sell * (n ?? 0),
    0,
  );

/** Only server-created state is passed here. Count gross creation, not net profit.
 * Purchases, crafting, banking and player transfers are not new extraction. */
export function facilityEarningCharge(
  before: Facility,
  after: Facility,
  action: FacilityAction,
  credits: number,
): EarningCharge | null {
  if (before.version === after.version) return null;
  let compute = 0,
    materials = 0;
  if (action.type === 'contract-start') {
    const run = after.career?.active.find((r) => r.id === action.id);
    if (
      run?.startedAt !== null &&
      run?.startedAt !== undefined &&
      before.career?.active.find((r) => r.id === action.id)?.startedAt === null
    )
      compute = run.reward;
  } else if (action.type === 'commission-start') {
    const run = after.commissions?.active.find(
      (r) => !before.commissions?.active.some((old) => old.id === r.id),
    );
    compute = run?.reward ?? 0;
  } else if (action.type === 'compute-start') {
    compute = after.workload?.reward ?? 0;
  } else if (action.type === 'field-start') {
    materials = materialValue(after.fieldWork?.active?.reward ?? {});
  } else if (action.type === 'gather') {
    materials = materialValue(
      Object.fromEntries(
        Object.entries(after.inventory).map(([item, n]) => [
          item,
          Math.max(0, (n ?? 0) - (before.inventory[item as keyof Bag] ?? 0)),
        ]),
      ),
    );
  } else if (
    ![
      'contract-claim',
      'commission-claim',
      'compute-collect',
      'field-claim',
      'compute-harvest',
    ].includes(action.type)
  ) {
    compute = Math.max(0, credits);
  }
  return compute || materials
    ? { source: action.type, compute, materials }
    : null;
}
