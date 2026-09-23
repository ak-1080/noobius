// Fixed schema: never spread request, error, identity, or authority objects into logs.
const names = [
  'room-outbox-attempt',
  'room-outbox-retry',
  'room-outbox-finished',
  'room-outbox-expired',
  'room-admission-blocked',
  'room-admission-timeout',
  'room-restore-start',
  'room-restore-failed',
  'room-restore-complete',
  'room-socket-closed',
  'room-socket-error',
  'room-service-failed',
  'room-service-slow',
  'room-release-deferred',
  'room-recovery-delayed',
  'room-connection-failed',
  'room-authority-retry',
  'holder-verification',
  'holder-storage-failed',
] as const;
const phases = [
  'checkpoint',
  'release',
  'storage',
  'scan',
  'verification',
  'restore',
  'close',
] as const;
const outcomes = [
  'confirmed',
  'terminal',
  'previously-reconciled',
  'eligible',
  'ineligible',
  'grace',
  'unavailable',
] as const;
const reasons = [
  'timeout',
  'network',
  'http',
  'json',
  'rpc',
  'invalid-result',
  'network-mismatch',
  'asset-mismatch',
  'block-unavailable',
  'storage',
  'unknown',
  'outbox-backlog',
] as const;
const operations = [
  'ticket-consume',
  'authority-refresh',
  'movement-checkpoint',
  'action-complete',
  'authority-release',
] as const;
export type OperationalEvent = {
  event: (typeof names)[number];
  recoveryId?: string;
  phase?: (typeof phases)[number];
  reason?: (typeof reasons)[number];
  checkpoint?: (typeof outcomes)[number];
  release?: (typeof outcomes)[number];
  outcome?: (typeof outcomes)[number];
  status?: number;
  attempt?: number;
  delayMs?: number;
  durationMs?: number;
  ageMs?: number;
  pendingAtLeast?: number;
  limit?: number;
  socketCount?: number;
  closeCode?: number;
  clean?: boolean;
  operation?: (typeof operations)[number];
};
export function operationalRecord(event: OperationalEvent) {
  const name = event.event;
  if (!names.includes(name)) return null;
  const record: Record<string, string | number> = { event: name };
  const recoveryId = event.recoveryId;
  if (
    typeof recoveryId === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      recoveryId,
    )
  )
    record.recoveryId = recoveryId;
  for (const [key, choices] of [
    ['phase', phases],
    ['reason', reasons],
    ['checkpoint', outcomes],
    ['release', outcomes],
    ['outcome', outcomes],
    ['operation', operations],
  ] as const) {
    const candidate = event[key];
    if (choices.includes(candidate as never)) record[key] = candidate!;
  }
  for (const [key, max] of [
    ['attempt', 1000],
    ['delayMs', 30000],
    ['durationMs', 600000],
    ['ageMs', 86400000],
    ['pendingAtLeast', 64],
    ['limit', 64],
    ['socketCount', 64],
  ] as const) {
    const value = event[key];
    if (typeof value === 'number' && Number.isFinite(value))
      record[key] = Math.max(0, Math.min(max, Math.floor(value)));
  }
  const status = event.status;
  if (Number.isInteger(status) && status! >= 100 && status! <= 599)
    record.status = status!;
  const closeCode = event.closeCode;
  if (Number.isInteger(closeCode) && closeCode! >= 1000 && closeCode! <= 4999)
    record.closeCode = closeCode!;
  if (typeof event.clean === 'boolean') record.clean = String(event.clean);
  return record;
}
export function emitOperationalEvent(event: OperationalEvent) {
  // A logger failure must never change an economy or recovery outcome.
  try {
    const record = operationalRecord(event);
    if (record) console.info(JSON.stringify(record));
  } catch {
    /* logging is best effort */
  }
}
