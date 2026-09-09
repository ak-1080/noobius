'use client';
import { useEffect, useRef } from 'react';

/** One recap per entry, after the scene's own reset effects have settled. */
export function useReturnBriefing({
  account,
  playing,
  eligible,
  ready,
  blocked,
  onOpen,
}: {
  account?: string;
  playing: boolean;
  eligible: boolean;
  ready: boolean;
  blocked: boolean;
  onOpen: () => void;
}) {
  const entry = useRef<{
    account: string;
    eligible: boolean;
    shown: boolean;
  } | null>(null);
  useEffect(() => {
    if (!playing || !account) {
      entry.current = null;
      return;
    }
    if (entry.current?.account !== account)
      entry.current = { account, eligible, shown: false };
    const current = entry.current;
    if (!current.eligible || current.shown || !ready || blocked) return;
    current.shown = true;
    // Work may have been collected while another menu blocked this recap.
    if (eligible) onOpen();
  }, [account, playing, eligible, ready, blocked, onOpen]);
}
