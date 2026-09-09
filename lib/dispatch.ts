import type { Career, ContractFamily } from './contracts.ts';

export const DISPATCH_LIMIT = 2;
const FAMILIES: ContractFamily[] = ['service', 'supply', 'workload'];
const TICKET =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[01]$/;
export type DispatchChoices = Partial<Record<ContractFamily, string[]>>;
export type DispatchBenefit = {
  version: 1;
  kind: 'dispatch';
  family: ContractFamily;
  storedLimit: 2;
};

export function decodeDispatchBenefit(
  json: string | null | undefined,
): DispatchBenefit | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v &&
      v.version === 1 &&
      v.kind === 'dispatch' &&
      FAMILIES.includes(v.family) &&
      v.storedLimit === DISPATCH_LIMIT
      ? { version: 1, kind: 'dispatch', family: v.family, storedLimit: 2 }
      : null;
  } catch {
    return null;
  }
}

export function validDispatchChoices(value: unknown): value is DispatchChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const seen = new Set<string>();
  return Object.entries(value).every(
    ([family, tickets]) =>
      FAMILIES.includes(family as ContractFamily) &&
      Array.isArray(tickets) &&
      tickets.length <= DISPATCH_LIMIT &&
      tickets.every((id) => {
        if (typeof id !== 'string' || !TICKET.test(id) || seen.has(id))
          return false;
        seen.add(id);
        return true;
      }),
  );
}

export function dispatchCount(c: Career, family: ContractFamily) {
  return c.dispatchChoices?.[family]?.length ?? 0;
}

export function dispatchGrantCount(
  c: Career,
  benefit: DispatchBenefit | null | undefined,
  contributed: number,
) {
  if (!benefit || !Number.isSafeInteger(contributed) || contributed < 1)
    return 0;
  return Math.max(
    0,
    Math.min(
      contributed,
      benefit.storedLimit - dispatchCount(c, benefit.family),
    ),
  );
}

/** Mutate a cloned career only, committed with the unique source project claim. */
export function grantDispatchChoices(
  c: Career,
  benefit: DispatchBenefit | null,
  projectId: string,
  contributed: number,
) {
  const count = dispatchGrantCount(c, benefit, contributed);
  if (!benefit || !count) return 0;
  if (!TICKET.test(`${projectId}:0`))
    throw new Error('Invalid dispatch source project.');
  const tickets = Array.from(
    { length: count },
    (_, index) => `${projectId}:${index}`,
  );
  const existing = Object.values(c.dispatchChoices ?? {}).flat();
  if (tickets.some((id) => existing.includes(id)))
    throw new Error('Dispatch choices already granted.');
  c.dispatchChoices ??= {};
  c.dispatchChoices[benefit.family] = [
    ...(c.dispatchChoices[benefit.family] ?? []),
    ...tickets,
  ];
  return count;
}
