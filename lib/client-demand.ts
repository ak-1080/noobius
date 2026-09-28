import type { Facility } from './facility.ts';

// One shared, persisted rolling allowance for all NPC client work. These are
// initial beta balance values, not a human-identity or real-token guarantee.
export const CLIENT_DEMAND = {
  version: 1,
  windowMs: 24 * 60 * 60 * 1000,
  bookings: 12,
  compute: 4000,
} as const;

export type ClientBooking = {
  kind: 'job' | 'commission';
  id: string;
  at: number;
  reward: number;
};
export type ClientDemand = { version: 1; bookings: ClientBooking[] };
const key = (entry: ClientBooking) => `${entry.kind}:${entry.id}`;

export function validClientDemand(value: unknown): value is ClientDemand {
  if (!value || typeof value !== 'object') return false;
  const ledger = value as ClientDemand;
  if (
    ledger.version !== 1 ||
    !Array.isArray(ledger.bookings) ||
    ledger.bookings.length > CLIENT_DEMAND.bookings + 2
  )
    return false;
  return (
    ledger.bookings.every(
      (entry) =>
        entry &&
        ['job', 'commission'].includes(entry.kind) &&
        typeof entry.id === 'string' &&
        /^[a-zA-Z0-9-]{8,80}$/.test(entry.id) &&
        Number.isSafeInteger(entry.at) &&
        entry.at >= 0 &&
        Number.isSafeInteger(entry.reward) &&
        entry.reward > 0,
    ) && new Set(ledger.bookings.map(key)).size === ledger.bookings.length
  );
}

export function newClientDemand(
  f: Pick<Facility, 'career' | 'commissions'>,
): ClientDemand {
  // Grandfather every already-started job. Count its original start if recent,
  // but never shrink, cancel, or reprice its promised payment on migration.
  return {
    version: 1,
    bookings: [
      ...(f.career?.active ?? [])
        .filter((run) => run.startedAt !== null)
        .map(
          (run): ClientBooking => ({
            kind: 'job',
            id: run.id,
            at: run.startedAt!,
            reward: run.reward,
          }),
        ),
      ...(f.commissions?.active ?? []).map(
        (run): ClientBooking => ({
          kind: 'commission',
          id: run.id,
          at: run.startedAt,
          reward: run.reward,
        }),
      ),
    ],
  };
}

function currentBookings(f: Facility, now: number) {
  return (f.clientDemand ?? newClientDemand(f)).bookings.filter(
    (entry) => entry.at > now - CLIENT_DEMAND.windowMs,
  );
}

export function clientDemandStatus(f: Facility, now: number) {
  if (f.productionVersion !== 3) return null;
  const entries = currentBookings(f, now);
  const usedCompute = entries.reduce((sum, entry) => sum + entry.reward, 0);
  return {
    usedBookings: entries.length,
    usedCompute,
    remainingBookings: Math.max(0, CLIENT_DEMAND.bookings - entries.length),
    remainingCompute: Math.max(0, CLIENT_DEMAND.compute - usedCompute),
    nextAt: entries.length
      ? Math.min(...entries.map((entry) => entry.at)) + CLIENT_DEMAND.windowMs
      : null,
  };
}

export function clientDemandQuote(f: Facility, reward: number, now: number) {
  const status = clientDemandStatus(f, now);
  if (!status) return { allowed: true, availableAt: null, message: null };
  if (!Number.isSafeInteger(reward) || reward < 1)
    throw new Error('Invalid client payment.');
  if (reward > CLIENT_DEMAND.compute)
    return {
      allowed: false,
      availableAt: null,
      message: `This job exceeds the ${CLIENT_DEMAND.compute.toLocaleString()} Compute client allowance. Choose a smaller batch.`,
    };
  if (status.remainingBookings > 0 && status.remainingCompute >= reward)
    return { allowed: true, availableAt: null, message: null };
  const entries = currentBookings(f, now);
  const deadlines = [
    ...new Set(entries.map((entry) => entry.at + CLIENT_DEMAND.windowMs)),
  ].sort((a, b) => a - b);
  const availableAt =
    deadlines.find((at) => {
      const remaining = entries.filter(
        (entry) => entry.at + CLIENT_DEMAND.windowMs > at,
      );
      return (
        remaining.length < CLIENT_DEMAND.bookings &&
        remaining.reduce((sum, entry) => sum + entry.reward, 0) + reward <=
          CLIENT_DEMAND.compute
      );
    }) ?? null;
  return {
    allowed: false,
    availableAt,
    message:
      status.remainingBookings === 0
        ? 'Client bookings are used for now. More demand opens as earlier bookings leave the last 24 hours.'
        : `This job needs ${reward.toLocaleString()} Compute of client demand; ${status.remainingCompute.toLocaleString()} remains. Choose a smaller batch or other work.`,
  };
}

export function bookClientDemand(
  f: Facility,
  booking: ClientBooking,
  now: number,
) {
  if (f.productionVersion !== 3) return;
  const ledger = (f.clientDemand ??= newClientDemand(f));
  // A duplicate booking is a rule error, not a free reservation. The outer
  // authoritative action layer handles request-id replay before reaching here.
  if (ledger.bookings.some((entry) => key(entry) === key(booking)))
    throw new Error('This client job is already booked.');
  const quote = clientDemandQuote(f, booking.reward, now);
  if (!quote.allowed) throw new Error(quote.message!);
  ledger.bookings = [...currentBookings(f, now), { ...booking, at: now }];
}
