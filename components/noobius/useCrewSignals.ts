'use client';
import { useState, useSyncExternalStore } from 'react';
import { advanceCrewSignals, type SignalState } from '@/lib/crew-signals';
import type { CrewSignalPacket } from '@/lib/social';
const subscribeVisibility = (notify: () => void) => {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
};
const isVisible = () => !document.hidden;
const serverVisible = () => true;

export function useCrewSignals(
  scope: string | null,
  packet: CrewSignalPacket | undefined,
  now: number,
) {
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isVisible,
    serverVisible,
  );
  const [frame, setFrame] = useState<{
    scope: string | null;
    packet?: CrewSignalPacket;
    visible: boolean;
    state: SignalState | null;
  }>({ scope: null, visible: true, state: null });
  // Adjust derived state before children render. On foreground return, wait for
  // a new packet before establishing a baseline; cached history stays in chat.
  if (
    frame.scope !== scope ||
    frame.packet !== packet ||
    frame.visible !== visible
  ) {
    const fresh =
      visible && scope && packet && (frame.visible || frame.packet !== packet);
    setFrame({
      scope,
      packet,
      visible,
      state: fresh
        ? advanceCrewSignals(
            frame.visible && frame.scope === scope ? frame.state : null,
            scope,
            packet,
            now,
          )
        : null,
    });
    return [];
  }
  return scope && visible && frame.state?.scope === scope
    ? frame.state.active.filter((signal) => signal.expiresAt > now)
    : [];
}
