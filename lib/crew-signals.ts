import {
  SIGNAL_LIFETIME_MS,
  isCrewPing,
  type CrewSignal,
  type CrewSignalPacket,
} from './social.ts';

export type VisibleCrewSignal = CrewSignal & { expiresAt: number };
export type SignalState = {
  scope: string;
  observedAt: number;
  baselineAt: number;
  seen: Map<string, number>;
  active: VisibleCrewSignal[];
};

// A new play session/place establishes a baseline. History is still in chat;
// only signals arriving after this baseline get presented on the floor.
export function advanceCrewSignals(
  previous: SignalState | null,
  scope: string,
  packet: CrewSignalPacket,
  now: number,
): SignalState {
  if (!previous || previous.scope !== scope)
    return {
      scope,
      observedAt: packet.observedAt,
      baselineAt: packet.observedAt,
      seen: new Map(packet.items.map((s) => [s.id, s.createdAt])),
      active: [],
    };
  if (packet.observedAt <= previous.observedAt) return previous;
  const active: VisibleCrewSignal[] = [];
  const authors = new Set<string>();
  for (const signal of packet.items) {
    const age = packet.observedAt - signal.createdAt;
    if (
      !isCrewPing(signal.ping) ||
      age < 0 ||
      age >= SIGNAL_LIFETIME_MS ||
      authors.has(signal.author)
    )
      continue;
    const old = previous.active.find((s) => s.id === signal.id);
    // Already consumed/dismissed history cannot start again after an expiry.
    if (
      !old &&
      (previous.seen.has(signal.id) || signal.createdAt <= previous.baselineAt)
    )
      continue;
    const expiresAt = Math.min(
      old?.expiresAt ?? Infinity,
      (packet.requestStartedAt ?? now) + SIGNAL_LIFETIME_MS - age,
    );
    if (expiresAt <= now) continue;
    authors.add(signal.author);
    active.push({ ...signal, expiresAt });
    if (active.length === 5) break;
  }
  return {
    scope,
    observedAt: packet.observedAt,
    baselineAt: previous.baselineAt,
    // Retain suppressed IDs until expiry, even through empty packets. A send
    // may commit after an overlapping metadata read with an older creation time.
    seen: new Map(
      [
        ...previous.seen,
        ...packet.items.map((s): [string, number] => [s.id, s.createdAt]),
      ].filter(
        ([, createdAt]) => createdAt > packet.observedAt - SIGNAL_LIFETIME_MS,
      ),
    ),
    active,
  };
}
