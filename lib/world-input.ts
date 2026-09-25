export const WORLD_MOVEMENT_KEYS = [
  'w',
  'a',
  's',
  'd',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
] as const;

/** An authority checkpoint freezes position without forgetting held keys. */
export function worldMovement(
  keys: Set<string>,
  paused: boolean,
  locked: boolean,
) {
  if (paused) keys.clear();
  if (paused || locked) return { x: 0, z: 0 };
  return {
    x:
      Number(keys.has('d') || keys.has('arrowright')) -
      Number(keys.has('a') || keys.has('arrowleft')),
    z:
      Number(keys.has('s') || keys.has('arrowdown')) -
      Number(keys.has('w') || keys.has('arrowup')),
  };
}

/** Only represents a pending request. Inventory/rewards come from the server. */
export function createPickupGate() {
  let pendingId: string | null = null;
  let disposed = false;
  return {
    get pendingId() {
      return pendingId;
    },
    async run(
      id: string,
      cooldownUntil: number,
      now: number,
      action: () => unknown,
    ) {
      if (disposed || pendingId !== null || cooldownUntil > now) return false;
      pendingId = id;
      try {
        await action();
        return true;
      } finally {
        pendingId = null;
      }
    },
    dispose() {
      disposed = true;
      pendingId = null;
    },
  };
}
