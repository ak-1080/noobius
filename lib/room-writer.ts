// SQL fences shared by HTTP movement and reward-affecting work. A coordinator
// grant is not a second wallet session. Its short writer lease cannot revive.
export { roomActionIntent } from './room-protocol.ts';
export type RoomWorkProof = { id: string; intent: string };
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export const DB_CLOCK_SQL =
  "CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
function actor(alias: string, now: number) {
  if (!/^[a-z_]+$/.test(alias) || !Number.isSafeInteger(now))
    throw new Error('Invalid room fence');
  return `g.wallet=${alias}.wallet AND g.client_id=${alias}.client_id AND g.generation=${alias}.generation
    AND g.neighborhood_id=${alias}.neighborhood_id AND g.scene=${alias}.room
    AND g.writer_until>MAX(${now},${DB_CLOCK_SQL}) AND g.expires_at>MAX(${now},${DB_CLOCK_SQL}) AND s.expires_at>MAX(${now},${DB_CLOCK_SQL})`;
}
export function httpMovementGuard(alias: string, now: number) {
  return `NOT EXISTS(SELECT 1 FROM room_grants g JOIN sessions s ON s.token_hash=g.session_hash AND s.wallet=g.wallet WHERE ${actor(alias, now)})`;
}
export function roomWorkGuard(
  alias: string,
  now: number,
  proof?: RoomWorkProof,
) {
  const free = httpMovementGuard(alias, now);
  if (
    !proof ||
    !/^[a-f0-9]{64}$/.test(proof.intent) ||
    !/^[a-f0-9-]{36}$/.test(proof.id)
  )
    return free;
  return `(${free} OR EXISTS(SELECT 1 FROM room_grants g JOIN sessions s ON s.token_hash=g.session_hash AND s.wallet=g.wallet
    JOIN room_checkpoints checkpoint ON checkpoint.grant_hash=g.grant_hash AND checkpoint.id=g.frozen_checkpoint
    WHERE ${actor(alias, now)} AND g.frozen_until>MAX(${now},${DB_CLOCK_SQL}) AND g.frozen_checkpoint=${q(proof.id)} AND checkpoint.intent=${q(proof.intent)}))`;
}
