// Shared browser/server encoding. Never include credentials or environment
// configuration in this module.
function stable(value: unknown, depth = 0): unknown {
  if (depth > 24) throw new Error('Action payload too deep');
  if (Array.isArray(value)) return value.map((v) => stable(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          stable((value as Record<string, unknown>)[key], depth + 1),
        ]),
    );
  return value;
}
export async function roomActionIntent(
  action: string,
  body: Record<string, unknown>,
) {
  const { roomCheckpoint: _proof, ...payload } = body;
  const bytes = new TextEncoder().encode(
    JSON.stringify(stable({ action, body: payload })),
  );
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export type RoomWorkLease = {
  checkpoint?: string;
  complete: () => Promise<void>;
};
export type PrepareRoomWork = (
  action: string,
  body: Record<string, unknown>,
) => Promise<RoomWorkLease>;
