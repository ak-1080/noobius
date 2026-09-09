import type { RoomAuthority } from './room-auth-server.ts';
import { floorClear, legalMovement } from './world-navigation.ts';

export const ROOM_MOVE_INTERVAL_MS = 100;
export const ROOM_MOVE_ELAPSED_CAP_MS = 1000;

type Authority = RoomAuthority & {
  writerUntil?: number;
  frozenUntil?: number;
  frozenCheckpoint?: string | null;
};
export type RoomPosition = Readonly<{ x: number; z: number }>;
export type RoomMove = { inputSequence: number; x: number; z: number };
export type RoomMotionCheckpoint = Readonly<{
  id: string;
  baseSequence: number;
  inputSequence: number;
  x: number;
  z: number;
  intent?: string;
}>;
export type RoomCheckpointAck = {
  id: string;
  inputSequence: number;
  sequence: number;
  x: number;
  z: number;
};
export type RoomMotionResult = {
  accepted: boolean;
  corrected: boolean;
  rebased: boolean;
  reason?: string;
  position: RoomPosition;
  inputSequence: number;
  checkpointSequence: number;
};

const point = (x: number, z: number): RoomPosition => Object.freeze({ x, z });
const samePoint = (a: RoomPosition, b: RoomPosition) =>
  a.x === b.x && a.z === b.z;
const sameIdentity = (a: Authority, b: Authority) =>
  a.player.id === b.player.id &&
  a.membership.neighborhoodId === b.membership.neighborhoodId &&
  a.membership.realm === b.membership.realm &&
  a.membership.scene === b.membership.scene &&
  a.membership.generation === b.membership.generation;
const validSequence = (value: number) =>
  Number.isSafeInteger(value) && value >= 0;
const deadline = (a: Authority) =>
  Math.min(
    a.authorizedUntil,
    a.expiresAt,
    a.membership.leaseUntil,
    a.writerUntil ?? a.authorizedUntil,
  );
function copyAuthority(value: Authority): Authority {
  if (
    !value?.membership ||
    !value.player ||
    !value.navigation ||
    !Array.isArray(value.navigation.unlocked) ||
    !validSequence(value.membership.sequence) ||
    !validSequence(value.membership.generation) ||
    ![
      value.membership.x,
      value.membership.z,
      value.membership.leaseUntil,
      value.serverNow,
      value.authorizedUntil,
      value.expiresAt,
      value.writerUntil ?? value.authorizedUntil,
      value.frozenUntil ?? 0,
    ].every(Number.isFinite)
  )
    throw new Error('Invalid room motion authority.');
  return structuredClone(value);
}

/** One actor, one coordinator clock. This class never writes durable state. */
export class RoomMotion {
  private authority: Authority;
  private currentPosition: RoomPosition;
  private currentInputSequence = 0;
  private currentCheckpointSequence: number;
  private pending: RoomMotionCheckpoint | null = null;
  private observedAt: number;
  private evaluatedAt: number;
  private movedAt: number;
  private actionCheckpoint: string | null = null;
  private actionAcknowledged = false;

  constructor(authority: Authority, now: number) {
    if (!Number.isFinite(now) || now < 0)
      throw new Error('Invalid room motion clock.');
    this.authority = copyAuthority(authority);
    this.currentPosition = point(
      authority.membership.x,
      authority.membership.z,
    );
    this.currentCheckpointSequence = authority.membership.sequence;
    this.observedAt = this.evaluatedAt = this.movedAt = now;
    this.actionCheckpoint = authority.frozenCheckpoint ?? null;
    this.actionAcknowledged = this.actionCheckpoint !== null;
  }

  get position() {
    return this.currentPosition;
  }
  get inputSequence() {
    return this.currentInputSequence;
  }
  get checkpointSequence() {
    return this.currentCheckpointSequence;
  }
  get pendingCheckpoint() {
    return this.pending;
  }

  private result(
    accepted: boolean,
    reason?: string,
    rebased = false,
  ): RoomMotionResult {
    return {
      accepted,
      corrected: !accepted || rebased,
      rebased,
      ...(reason ? { reason } : {}),
      position: this.position,
      inputSequence: this.inputSequence,
      checkpointSequence: this.checkpointSequence,
    };
  }

  private observe(now: number) {
    if (!Number.isFinite(now) || now < this.observedAt) return false;
    this.observedAt = now;
    return true;
  }

  private frozen(now: number) {
    return (
      this.actionCheckpoint !== null || (this.authority.frozenUntil ?? 0) > now
    );
  }

  move(input: RoomMove, now: number): RoomMotionResult {
    if (!this.observe(now)) return this.result(false, 'invalid-clock');
    if (
      !input ||
      !validSequence(input.inputSequence) ||
      input.inputSequence < 1
    )
      return this.result(false, 'invalid-sequence');
    if (input.inputSequence <= this.currentInputSequence)
      return this.result(false, 'stale-input');
    // Even a rejected fresh packet is consumed. Replaying it cannot earn time.
    this.currentInputSequence = input.inputSequence;
    if (deadline(this.authority) <= now) {
      this.movedAt = this.evaluatedAt = now;
      return this.result(false, 'authority-expired');
    }
    if (this.frozen(now)) {
      this.movedAt = this.evaluatedAt = now;
      return this.result(false, 'action-frozen');
    }
    if (now - this.evaluatedAt < ROOM_MOVE_INTERVAL_MS)
      return this.result(false, 'rate-limited');
    const elapsed = Math.min(ROOM_MOVE_ELAPSED_CAP_MS, now - this.movedAt);
    this.movedAt = this.evaluatedAt = now;
    if (!Number.isFinite(input.x) || !Number.isFinite(input.z))
      return this.result(false, 'invalid-position');
    if (
      !legalMovement(
        this.authority.navigation,
        this.authority.membership.scene === 'commons',
        this.currentPosition,
        input,
        elapsed,
      )
    )
      return this.result(false, 'illegal-movement');
    this.currentPosition = point(input.x, input.z);
    return this.result(true);
  }

  captureCheckpoint(id: string, intent?: string): RoomMotionCheckpoint {
    if (typeof id !== 'string' || !id || id.length > 128)
      throw new Error('Invalid checkpoint id.');
    if (
      intent !== undefined &&
      (typeof intent !== 'string' || !/^[a-f0-9]{64}$/.test(intent))
    )
      throw new Error('Invalid checkpoint intent.');
    if (this.pending) throw new Error('A checkpoint is already pending.');
    if (this.frozen(this.observedAt))
      throw new Error('An action checkpoint is still frozen.');
    if (deadline(this.authority) <= this.observedAt)
      throw new Error('Room authority expired.');
    if (!validSequence(this.currentCheckpointSequence + 1))
      throw new Error('Checkpoint sequence exhausted.');
    this.pending = Object.freeze({
      id,
      baseSequence: this.checkpointSequence,
      inputSequence: this.inputSequence,
      ...this.position,
      ...(intent === undefined ? {} : { intent }),
    });
    // Freeze synchronously, before the caller can await its storage request.
    if (intent !== undefined) {
      this.actionCheckpoint = id;
      this.actionAcknowledged = false;
    }
    return this.pending;
  }

  private stale(authority: Authority) {
    return (
      authority.serverNow < this.authority.serverNow ||
      (sameIdentity(authority, this.authority) &&
        authority.membership.sequence < this.currentCheckpointSequence)
    );
  }

  private rebase(authority: Authority, now: number) {
    if (!sameIdentity(authority, this.authority)) this.currentInputSequence = 0;
    this.authority = authority;
    this.currentPosition = point(
      authority.membership.x,
      authority.membership.z,
    );
    this.currentCheckpointSequence = authority.membership.sequence;
    this.pending = null;
    // A durable action barrier survives coordinator restart/rebase. Its
    // cleared authority must be observed, rather than guessed from a timer.
    this.actionCheckpoint = authority.frozenCheckpoint ?? null;
    this.actionAcknowledged = this.actionCheckpoint !== null;
    this.observedAt = this.evaluatedAt = this.movedAt = now;
  }

  applyCheckpointAck(
    receipt: RoomCheckpointAck,
    authority: Authority,
    now: number,
  ): RoomMotionResult {
    if (!this.observe(now)) return this.result(false, 'invalid-clock');
    const next = copyAuthority(authority),
      pending = this.pending;
    const matches =
      pending &&
      receipt &&
      !this.stale(next) &&
      sameIdentity(next, this.authority) &&
      receipt.id === pending.id &&
      receipt.inputSequence === pending.inputSequence &&
      receipt.sequence === pending.baseSequence + 1 &&
      validSequence(receipt.sequence) &&
      samePoint(receipt, pending) &&
      next.membership.sequence === receipt.sequence &&
      samePoint(next.membership, receipt);
    if (!matches) {
      // A late receipt must never undo a newer travel/scene authority snapshot.
      this.rebase(this.stale(next) ? this.authority : next, now);
      return this.result(false, 'checkpoint-mismatch', true);
    }
    this.authority = next;
    this.currentCheckpointSequence = receipt.sequence;
    this.pending = null;
    if (pending.intent !== undefined) {
      this.actionAcknowledged = true;
      this.movedAt = this.evaluatedAt = now;
    }
    // A background ACK persists its capture, not later accepted movement.
    return this.result(true);
  }

  refreshAuthority(authority: Authority, now: number): RoomMotionResult {
    if (!this.observe(now)) return this.result(false, 'invalid-clock');
    const next = copyAuthority(authority);
    if (this.stale(next)) return this.result(false, 'stale-authority');
    if (
      !sameIdentity(next, this.authority) ||
      next.membership.sequence !== this.currentCheckpointSequence ||
      !samePoint(next.membership, this.authority.membership) ||
      !floorClear(
        next.navigation,
        next.membership.scene === 'commons',
        this.position.x,
        this.position.z,
      )
    ) {
      this.rebase(next, now);
      return this.result(true, 'authority-rebased', true);
    }
    const resetTime = this.frozen(now) || deadline(this.authority) <= now;
    this.authority = next;
    if (
      this.actionAcknowledged &&
      next.frozenCheckpoint == null &&
      (next.frozenUntil ?? 0) <= now
    ) {
      this.actionCheckpoint = null;
      this.actionAcknowledged = false;
    }
    if (resetTime || this.frozen(now)) this.movedAt = this.evaluatedAt = now;
    return this.result(true);
  }

  /** Terminal failure/restart only: discard in-flight motion and time credit. */
  reset(authority: Authority, now: number): RoomMotionResult {
    if (!this.observe(now)) return this.result(false, 'invalid-clock');
    const next = copyAuthority(authority);
    this.rebase(this.stale(next) ? this.authority : next, now);
    return this.result(true, 'motion-reset', true);
  }
}
