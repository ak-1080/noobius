import { DurableObject } from 'cloudflare:workers';
import {
  emitOperationalEvent,
  type OperationalEvent,
} from '../../lib/operational-events.ts';
import {
  roomAuthConfig,
  roomServiceHeaders,
  ROOM_SERVICE_PATH,
  type RoomAuthConfig,
} from '../../lib/room-auth.ts';
import type {
  RoomAuthority,
  RoomCheckpointReceipt,
} from '../../lib/room-auth-server.ts';
import {
  RoomMotion,
  type RoomMotionCheckpoint,
} from '../../lib/room-motion.ts';

type Env = {
  ROOMS: DurableObjectNamespace<NeighborhoodRoom>;
  NOOBIUS_ROOM_AUTH_ENABLED?: string;
  NOOBIUS_ROOM_AUTH_CONFIG?: string;
  LOCAL_ROOM_DEVELOPMENT?: string;
};
type Attachment = {
  room: string;
  connectedAt: number;
  phase: 'joining' | 'authenticating' | 'ready';
  connectionId: string;
  grant?: string;
};
type Actor = {
  motion: RoomMotion;
  authority: RoomAuthority;
  grant: string;
  connectionId: string;
  offset: number;
  lastCheckpointAt: number;
};
type Outbox = {
  recoveryId?: string;
  queuedAt?: number;
  checkpointOutcome?: 'confirmed' | 'terminal';
  grant: string;
  checkpoint: RoomMotionCheckpoint;
  expiresAt: number;
  reconciled?: boolean;
  retryAt?: number;
  attempts?: number;
};
const RECOVERY_BATCH = 2;
const RECOVERY_SCAN = 32;
const OUTBOX_ADMISSION_LIMIT = 64;
class ServiceFailure extends Error {
  status: number;
  constructor(status: number) {
    super('Room authority unavailable');
    this.status = status;
  }
}
class ServiceTransportFailure extends Error {
  reason: 'timeout' | 'network' | 'json';
  constructor(reason: ServiceTransportFailure['reason']) {
    super('Room service unavailable');
    this.reason = reason;
  }
}
const timedOut = (error: unknown) =>
  error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
function configuration(env: Env) {
  const config = roomAuthConfig(env, env.LOCAL_ROOM_DEVELOPMENT === 'true');
  if (!config) throw new ServiceFailure(503);
  return config;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const send = (ws: WebSocket, body: unknown) => {
  try {
    ws.send(JSON.stringify(body));
  } catch {
    /* closed peer */
  }
};
const nowFor = (actor: Actor) => Date.now() + actor.offset;
const terminal = (error: unknown) =>
  error instanceof ServiceFailure &&
  [400, 401, 403, 404, 409, 410, 413, 415].includes(error.status);
const failureFields = (
  error: unknown,
): Pick<OperationalEvent, 'reason' | 'status'> =>
  error instanceof ServiceFailure
    ? { reason: 'http', status: error.status }
    : {
        reason:
          error instanceof ServiceTransportFailure ? error.reason : 'unknown',
      };
const recoveryFields = (value: Outbox) => ({
  recoveryId: value.recoveryId,
  attempt: value.attempts ?? 0,
  ...(value.queuedAt !== undefined
    ? { ageMs: Date.now() - value.queuedAt }
    : {}),
});
const updateClock = (actor: Actor, authority: RoomAuthority) => {
  actor.offset = Math.max(actor.offset, authority.serverNow - Date.now());
};
const allowed = (body: Record<string, unknown>, fields: string[]) =>
  Object.keys(body).every((key) => fields.includes(key));

const roomWorker = {
  async fetch(request: Request, env: Env) {
    let config: RoomAuthConfig;
    try {
      config = configuration(env);
    } catch {
      return json({ error: 'Room host is not configured.' }, 503);
    }
    const url = new URL(request.url),
      match = /^\/rooms\/([a-f0-9]{32})$/.exec(url.pathname);
    if (request.method !== 'GET' || !match || url.search)
      return json({ error: 'Unknown room.' }, 404);
    if (
      url.origin !== config.coordinatorOrigin ||
      request.headers.get('Origin') !== config.audience
    )
      return json({ error: 'Origin not allowed.' }, 403);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return json({ error: 'WebSocket required.' }, 426);
    return env.ROOMS.getByName(match[1]).fetch(request);
  },
};

/** One shared room; D1 remains the sole owner of membership and economy. */
export class NeighborhoodRoom extends DurableObject<Env> {
  private actors = new Map<WebSocket, Actor>();
  private queues = new Map<
    WebSocket,
    { tail: Promise<unknown>; count: number }
  >();
  private config: RoomAuthConfig;
  private closed = new WeakSet<WebSocket>();
  private draining = new WeakSet<WebSocket>();
  private maintaining = new WeakSet<WebSocket>();
  private recovery: Promise<void> | null = null;
  private rates = new Map<WebSocket, { at: number; count: number }>();
  private lastBroadcastAt = 0;
  private admission = Promise.resolve();
  private backlogWarningAt = -Infinity;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.config = configuration(env);
    void ctx.blockConcurrencyWhile(async () => {
      // Live sockets get priority and recover concurrently. A long orphan
      // backlog must not exhaust another player's ten-second writer lease.
      await Promise.all(
        ctx.getWebSockets().map(async (ws) => {
          const a = ws.deserializeAttachment() as Attachment;
          if (a.phase !== 'ready' || !a.grant) {
            ws.close(1012, 'Reconnect to recover your room.');
            return;
          }
          try {
            const key = 'checkpoint:' + a.grant;
            const pending = await ctx.storage.get<Outbox>(key);
            // Replay the same immutable checkpoint before reading its position.
            // An orphan already in the release phase must not become a writer.
            if (pending?.reconciled) throw new ServiceFailure(409);
            if (pending) {
              await this.service({
                operation: 'movement-checkpoint',
                grant: pending.grant,
                ...pending.checkpoint,
              });
              await ctx.storage.delete(key);
            }
            const authority = await this.service<RoomAuthority>({
              operation: 'authority-refresh',
              grant: a.grant,
            });
            a.connectionId = crypto.randomUUID();
            ws.serializeAttachment(a);
            this.actors.set(ws, this.actor(a.grant, a.connectionId, authority));
            this.joined(ws, 'rebase');
          } catch {
            ws.close(1012, 'Reconnect to recover your room.');
            if (!(await ctx.storage.get('checkpoint:' + a.grant))) {
              try {
                await this.service({
                  operation: 'authority-release',
                  grant: a.grant,
                });
              } catch (error) {
                emitOperationalEvent({
                  event: 'room-release-deferred',
                  phase: 'restore',
                  ...failureFields(error),
                });
                /* A failed restore still loses its writer lease within ten seconds. */
              }
            }
          }
        }),
      );
      // The same bounded recovery handles restart and ordinary disconnects.
      // Run it in the alarm, after initialization has released the input gate.
      if (
        ctx.getWebSockets().length ||
        (await ctx.storage.list({ prefix: 'checkpoint:', limit: 1 })).size
      )
        await ctx.storage.setAlarm(Date.now() + 1);
    });
  }
  private async service<T = Record<string, unknown>>(
    body: Record<string, unknown>,
  ): Promise<T> {
    const raw = JSON.stringify(body);
    const headers = await roomServiceHeaders(this.config, raw);
    let response: Response;
    try {
      response = await fetch(this.config.audience + ROOM_SERVICE_PATH, {
        method: 'POST',
        body: raw,
        redirect: 'manual',
        signal: AbortSignal.timeout(2500),
        headers,
      });
    } catch (error) {
      throw new ServiceTransportFailure(
        timedOut(error) ? 'timeout' : 'network',
      );
    }
    if (!response.ok)
      throw new ServiceFailure(response.status < 400 ? 503 : response.status);
    try {
      return await response.json<T>();
    } catch (error) {
      throw new ServiceTransportFailure(timedOut(error) ? 'timeout' : 'json');
    }
  }
  private actor(
    grant: string,
    connectionId: string,
    authority: RoomAuthority,
  ): Actor {
    return {
      grant,
      connectionId,
      authority,
      motion: new RoomMotion(authority, authority.serverNow),
      offset: authority.serverNow - Date.now(),
      lastCheckpointAt: Date.now(),
    };
  }
  private joined(ws: WebSocket, type = 'joined') {
    const a = this.actors.get(ws)!;
    // The grant and service signing key never enter a browser message.
    send(ws, {
      type,
      connectionId: a.connectionId,
      player: a.authority.player,
      membership: a.authority.membership,
      inputSequence: a.motion.inputSequence,
      authorizedUntil: a.authority.authorizedUntil,
      workFrozen: !!a.authority.frozenCheckpoint,
      serverNow: nowFor(a),
    });
  }
  private publishAuthority(ws: WebSocket, a: Actor) {
    if (this.closed.has(ws) || this.actors.get(ws) !== a) return;
    send(ws, {
      type: 'authority',
      connectionId: a.connectionId,
      membership: a.authority.membership,
      authorizedUntil: a.authority.authorizedUntil,
      workFrozen: !!a.authority.frozenCheckpoint,
      serverNow: nowFor(a),
    });
  }
  private broadcast(force = true) {
    if (!force && Date.now() - this.lastBroadcastAt < 100) return;
    this.lastBroadcastAt = Date.now();
    for (const [ws, a] of this.actors) {
      const people = [...this.actors.values()]
        .filter(
          (b) =>
            b.authority.membership.scene === a.authority.membership.scene &&
            nowFor(b) < b.authority.authorizedUntil,
        )
        .map((b) => ({ ...b.authority.player, ...b.motion.position }));
      send(ws, { type: 'players', connectionId: a.connectionId, people });
    }
  }
  async fetch(request: Request) {
    const url = new URL(request.url),
      room = /^\/rooms\/([a-f0-9]{32})$/.exec(url.pathname)?.[1];
    if (
      !room ||
      url.origin !== this.config.coordinatorOrigin ||
      request.headers.get('Origin') !== this.config.audience ||
      request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
    )
      return json({ error: 'Invalid room connection.' }, 403);
    // Bound unauthenticated sockets as well as the five D1-admitted occupants.
    if (this.ctx.getWebSockets().length >= 10)
      return json({ error: 'Room connections are busy. Retry shortly.' }, 429);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      room,
      connectedAt: Date.now(),
      phase: 'joining',
      connectionId: crypto.randomUUID(),
    } satisfies Attachment);
    await this.ctx.storage.setAlarm(Date.now() + 1000);
    return new Response(null, { status: 101, webSocket: client });
  }
  private enqueue(ws: WebSocket, job: () => Promise<void>) {
    const q = this.queues.get(ws) ?? { tail: Promise.resolve(), count: 0 };
    if (++q.count > 24) {
      ws.close(1008, 'Too many pending messages.');
      return Promise.resolve();
    }
    q.tail = q.tail
      .then(() => (this.closed.has(ws) ? undefined : job()))
      .catch((error) => {
        emitOperationalEvent({
          event: 'room-connection-failed',
          ...failureFields(error),
        });
        ws.close(1012, 'Reconnect to continue.');
        void this.webSocketClose(ws);
      })
      .finally(() => {
        q.count--;
      });
    this.queues.set(ws, q);
    return q.tail;
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const rate = this.rates.get(ws);
    const window =
      !rate || Date.now() - rate.at >= 1000
        ? { at: Date.now(), count: 0 }
        : rate;
    this.rates.set(ws, window);
    if (++window.count > 40) {
      ws.close(1008, 'Slow down room messages.');
      return;
    }
    if (typeof message !== 'string' || message.length > 2048) {
      ws.close(1008, 'Invalid room message.');
      return;
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(message);
      if (!body || Array.isArray(body) || typeof body !== 'object')
        throw new Error();
    } catch {
      ws.close(1008, 'Invalid room message.');
      return;
    }
    // Movement is synchronous and does not wait behind background D1 writes.
    // Action captures freeze RoomMotion before their first await instead.
    // A deliberate departure captures its final position before any await.
    if (this.draining.has(ws)) return;
    if (body.type === 'move') {
      const a = this.actors.get(ws);
      if (
        !a ||
        this.closed.has(ws) ||
        body.connectionId !== a.connectionId ||
        nowFor(a) >= a.authority.authorizedUntil ||
        !allowed(body, ['type', 'connectionId', 'inputSequence', 'x', 'z'])
      ) {
        ws.close(1008, 'Stale room movement.');
        return;
      }
      const before = a.motion.position;
      const result = a.motion.move(
        {
          inputSequence: body.inputSequence as number,
          x: body.x as number,
          z: body.z as number,
        },
        nowFor(a),
      );
      send(ws, { type: 'move-ack', connectionId: a.connectionId, ...result });
      if (
        result.accepted &&
        (before.x !== result.position.x || before.z !== result.position.z)
      )
        this.broadcast(false);
      return;
    }
    await this.enqueue(ws, async () => {
      if (this.draining.has(ws)) return;
      const attachment = ws.deserializeAttachment() as Attachment;
      if (attachment.phase === 'joining') {
        if (body.type !== 'join' || !allowed(body, ['type', 'ticket']))
          throw new ServiceFailure(400);
        attachment.phase = 'authenticating';
        ws.serializeAttachment(attachment);
        // Ticket replacement and actor installation must share one room-wide
        // queue. Responses from different sockets may otherwise arrive out of
        // order and let an older admission evict its replacement.
        const previous = this.admission;
        let finish!: () => void;
        this.admission = new Promise<void>((resolve) => {
          finish = resolve;
        });
        await previous;
        try {
          if (this.closed.has(ws) || ws.readyState !== WebSocket.OPEN) return;
          // Backpressure reconnect churn without deleting uncertain writes.
          // The existing five actors can still finish their own checkpoints.
          if (
            (
              await this.ctx.storage.list({
                prefix: 'checkpoint:',
                limit: OUTBOX_ADMISSION_LIMIT,
              })
            ).size >= OUTBOX_ADMISSION_LIMIT
          ) {
            if (Date.now() - this.backlogWarningAt >= 30000) {
              this.backlogWarningAt = Date.now();
              emitOperationalEvent({
                event: 'room-admission-blocked',
                reason: 'outbox-backlog',
                pendingAtLeast: OUTBOX_ADMISSION_LIMIT,
                limit: OUTBOX_ADMISSION_LIMIT,
              });
            }
            throw new ServiceFailure(503);
          }
          const result = await this.service<RoomAuthority & { grant: string }>({
            operation: 'ticket-consume',
            ticket: body.ticket,
          });
          if (this.closed.has(ws) || ws.readyState !== WebSocket.OPEN) {
            await this.service({
              operation: 'authority-release',
              grant: result.grant,
            });
            return;
          }
          if (result.membership.neighborhoodId !== attachment.room) {
            await this.service({
              operation: 'authority-release',
              grant: result.grant,
            });
            throw new ServiceFailure(403);
          }
          for (const [other, actor] of this.actors)
            if (actor.authority.player.id === result.player.id) {
              this.actors.delete(other);
              other.close(1000, 'Continued in another connection.');
            }
          if (
            this.actors.size >= 5 ||
            [...this.actors.values()].some(
              (a) => a.authority.membership.slot === result.membership.slot,
            )
          ) {
            await this.service({
              operation: 'authority-release',
              grant: result.grant,
            });
            throw new ServiceFailure(409);
          }
          attachment.phase = 'ready';
          attachment.grant = result.grant;
          ws.serializeAttachment(attachment);
          this.actors.set(
            ws,
            this.actor(result.grant, attachment.connectionId, result),
          );
          this.joined(ws);
          this.broadcast();
          return;
        } finally {
          finish();
        }
      }
      const a = this.actors.get(ws);
      if (
        !a ||
        body.connectionId !== a.connectionId ||
        nowFor(a) >= a.authority.authorizedUntil
      )
        throw new ServiceFailure(409);
      if (
        body.type === 'checkpoint' &&
        allowed(body, [
          'type',
          'connectionId',
          'requestId',
          'inputSequence',
          'intent',
        ])
      ) {
        if (
          typeof body.requestId !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(body.requestId) ||
          body.inputSequence !== a.motion.inputSequence ||
          (body.intent !== undefined &&
            (typeof body.intent !== 'string' ||
              !/^[a-f0-9]{64}$/.test(body.intent)))
        )
          throw new ServiceFailure(400);
        if (a.motion.pendingCheckpoint) await this.flush(ws);
        a.motion.captureCheckpoint(
          body.requestId,
          body.intent as string | undefined,
        );
        const saved = await this.flush(ws);
        send(ws, {
          type: 'checkpoint',
          connectionId: a.connectionId,
          requestId: body.requestId,
          ...saved,
        });
        return;
      }
      if (
        body.type === 'action-complete' &&
        allowed(body, ['type', 'connectionId', 'id']) &&
        typeof body.id === 'string'
      ) {
        const authority = await this.service<RoomAuthority>({
          operation: 'action-complete',
          grant: a.grant,
          id: body.id,
        });
        const update = a.motion.refreshAuthority(authority, nowFor(a));
        if (!update.accepted) throw new ServiceFailure(409);
        a.authority = authority;
        updateClock(a, authority);
        if (update.rebased) this.joined(ws, 'rebase');
        send(ws, {
          type: 'action-complete',
          connectionId: a.connectionId,
          id: body.id,
        });
        return;
      }
      if (body.type === 'leave' && allowed(body, ['type', 'connectionId'])) {
        await this.retire(ws, a, false);
        return;
      }
      throw new ServiceFailure(400);
    });
  }
  private async retire(ws: WebSocket, a: Actor, renew: boolean) {
    this.draining.add(ws);
    // A background checkpoint may predate the latest accepted input. Finish
    // it, then capture the final position with movement now stopped.
    if (a.motion.pendingCheckpoint) await this.flush(ws);
    if (this.closed.has(ws) || this.actors.get(ws) !== a) return;
    if (a.authority.frozenCheckpoint) {
      const authority = await this.service<RoomAuthority>({
        operation: 'authority-refresh',
        grant: a.grant,
      });
      const update = a.motion.refreshAuthority(authority, nowFor(a));
      if (!update.accepted || update.rebased) throw new ServiceFailure(409);
      a.authority = authority;
      updateClock(a, authority);
    }
    // A live work barrier already committed this position and must not be
    // overwritten. Releasing the grant also invalidates its remaining proof.
    if (!a.authority.frozenCheckpoint) {
      a.motion.captureCheckpoint(crypto.randomUUID());
      await this.flush(ws);
    }
    await this.service({ operation: 'authority-release', grant: a.grant });
    if (this.actors.get(ws) === a) this.actors.delete(ws);
    send(ws, {
      type: renew ? 'renew' : 'released',
      connectionId: a.connectionId,
    });
    ws.close(
      renew ? 1012 : 1000,
      renew ? 'Reconnect to renew room access.' : 'Left room.',
    );
    this.broadcast();
  }
  private async flush(ws: WebSocket) {
    const a = this.actors.get(ws)!;
    const checkpoint = a.motion.pendingCheckpoint!;
    const key = 'checkpoint:' + a.grant;
    // Durable before network. A new nonce is safe; a new checkpoint ID is not.
    const previous = await this.ctx.storage.get<Outbox>(key);
    const same =
      previous?.checkpoint.id === checkpoint.id ? previous : undefined;
    await this.ctx.storage.put(key, {
      recoveryId: same?.recoveryId ?? crypto.randomUUID(),
      queuedAt: same?.queuedAt ?? Date.now(),
      grant: a.grant,
      checkpoint,
      expiresAt: a.authority.expiresAt,
    } satisfies Outbox);
    const saved = await this.service<{
      checkpoint: RoomCheckpointReceipt;
      authority: RoomAuthority;
    }>({ operation: 'movement-checkpoint', grant: a.grant, ...checkpoint });
    const update = a.motion.applyCheckpointAck(
      saved.checkpoint,
      saved.authority,
      nowFor(a),
    );
    if (!update.accepted || update.rebased) throw new ServiceFailure(409);
    await this.ctx.storage.delete(key);
    a.authority = saved.authority;
    updateClock(a, saved.authority);
    a.lastCheckpointAt = Date.now();
    if (this.closed.has(ws) || this.actors.get(ws) !== a) {
      await this.service({ operation: 'authority-release', grant: a.grant });
    } else {
      this.publishAuthority(ws, a);
    }
    return {
      checkpoint: saved.checkpoint,
      membership: saved.authority.membership,
      authorizedUntil: saved.authority.authorizedUntil,
      workFrozen: !!saved.authority.frozenCheckpoint,
      serverNow: saved.authority.serverNow,
    };
  }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment;
      if (attachment.phase !== 'ready') {
        if (Date.now() - attachment.connectedAt > 5000)
          ws.close(1008, 'Join timed out.');
        continue;
      }
      const a = this.actors.get(ws);
      if (!a || this.maintaining.has(ws)) continue;
      this.maintaining.add(ws);
      this.ctx.waitUntil(
        this.enqueue(ws, async () => {
          if (this.actors.get(ws) !== a || this.draining.has(ws)) return;
          if (nowFor(a) >= a.authority.expiresAt - 15000) {
            // Allow the short work barrier to finish before planned renewal.
            if (nowFor(a) < a.authority.frozenUntil) return;
            await this.retire(ws, a, true);
            return;
          }
          if (a.motion.pendingCheckpoint) {
            await this.flush(ws);
            return;
          }
          if (Date.now() - a.lastCheckpointAt < 4500) return;
          if (nowFor(a) < a.authority.frozenUntil) return;
          const authority = await this.service<RoomAuthority>({
            operation: 'authority-refresh',
            grant: a.grant,
          });
          if (this.closed.has(ws) || this.actors.get(ws) !== a) return;
          const refreshed = a.motion.refreshAuthority(authority, nowFor(a));
          if (!refreshed.accepted || refreshed.rebased)
            throw new ServiceFailure(409);
          a.authority = authority;
          updateClock(a, authority);
          // The browser's lease must not wait for a second network round trip.
          this.publishAuthority(ws, a);
          a.motion.captureCheckpoint(crypto.randomUUID());
          await this.flush(ws);
        }).finally(() => this.maintaining.delete(ws)),
      );
    }
    // Do not await network queues in the alarm handler: a slow orphan or one
    // busy socket must not delay the next tick for every other player. Pending
    // I/O keeps the Durable Object active; each queue has at most one upkeep
    // job, and the recovery pass is bounded and never overlaps itself.
    if (!this.recovery) {
      this.recovery = this.recoverOrphans()
        .catch(() =>
          emitOperationalEvent({
            event: 'room-recovery-delayed',
            phase: 'storage',
            reason: 'storage',
          }),
        )
        .finally(() => {
          this.recovery = null;
        });
      this.ctx.waitUntil(this.recovery);
    }
    this.broadcast();
    if (
      this.ctx.getWebSockets().length ||
      (await this.ctx.storage.list({ prefix: 'checkpoint:', limit: 1 })).size
    )
      await this.ctx.storage.setAlarm(Date.now() + 1000);
  }
  private async recoverOrphans() {
    const cursor = await this.ctx.storage.get<string>('recovery-cursor');
    let pending = await this.ctx.storage.list<Outbox>({
      prefix: 'checkpoint:',
      limit: RECOVERY_SCAN,
      ...(cursor ? { startAfter: cursor } : {}),
    });
    if (!pending.size && cursor)
      pending = await this.ctx.storage.list<Outbox>({
        prefix: 'checkpoint:',
        limit: RECOVERY_SCAN,
      });
    const jobs: Promise<void>[] = [];
    let failed = false;
    const recordFailure = () => {
      failed = true;
    };
    try {
      for (const [key, value] of pending) {
        await this.ctx.storage.put('recovery-cursor', key);
        if ([...this.actors.values()].some((a) => a.grant === value.grant))
          continue;
        if (Date.now() > value.expiresAt + 60000) {
          await this.ctx.storage.delete(key);
          emitOperationalEvent({
            event: 'room-outbox-expired',
            ...recoveryFields(value),
            phase: value.reconciled ? 'release' : 'checkpoint',
          });
          continue;
        }
        if ((value.retryAt ?? 0) > Date.now()) continue;
        // Attach rejection handling immediately: scanning the next record can await storage.
        jobs.push(this.recoverOrphan(key, value).catch(recordFailure));
        if (jobs.length === RECOVERY_BATCH) break;
      }
    } catch {
      recordFailure();
    } finally {
      // Keep the gate until every launched request settles, even after a storage failure.
      await Promise.all(jobs);
    }
    if (failed) throw new Error('Recovery storage unavailable.');
  }
  private async recoverOrphan(key: string, value: Outbox) {
    let phase: 'checkpoint' | 'release' | 'storage' = 'storage';
    const started = Date.now();
    try {
      if (!value.recoveryId) {
        value.recoveryId = crypto.randomUUID();
        await this.ctx.storage.put(key, value);
      }
      emitOperationalEvent({
        event: 'room-outbox-attempt',
        ...recoveryFields(value),
        phase: value.reconciled ? 'release' : 'checkpoint',
      });
      if (!value.reconciled) {
        phase = 'checkpoint';
        try {
          await this.service({
            operation: 'movement-checkpoint',
            grant: value.grant,
            ...value.checkpoint,
          });
          value.checkpointOutcome = 'confirmed';
        } catch (error) {
          if (!terminal(error)) throw error;
          value.checkpointOutcome = 'terminal';
        }
        // Retain a durable release obligation even when checkpoint replay is
        // terminal or release itself fails after a successful reconciliation.
        value.reconciled = true;
        phase = 'storage';
        await this.ctx.storage.put(key, value);
      }
      phase = 'release';
      let release: 'confirmed' | 'terminal' = 'confirmed';
      try {
        await this.service({
          operation: 'authority-release',
          grant: value.grant,
        });
      } catch (error) {
        if (!terminal(error)) throw error;
        release = 'terminal';
      }
      phase = 'storage';
      await this.ctx.storage.delete(key);
      emitOperationalEvent({
        event: 'room-outbox-finished',
        ...recoveryFields(value),
        durationMs: Date.now() - started,
        checkpoint: value.checkpointOutcome ?? 'previously-reconciled',
        release,
      });
    } catch (error) {
      if (phase === 'storage') throw error;
      value.attempts = Math.min(6, (value.attempts ?? 0) + 1);
      value.retryAt = Date.now() + Math.min(30000, 1000 * 2 ** value.attempts);
      await this.ctx.storage.put(key, value);
      emitOperationalEvent({
        event: 'room-outbox-retry',
        ...recoveryFields(value),
        phase,
        delayMs: value.retryAt - Date.now(),
        durationMs: Date.now() - started,
        ...failureFields(error),
      });
    }
  }
  async webSocketClose(ws: WebSocket) {
    this.closed.add(ws);
    this.rates.delete(ws);
    const a = this.actors.get(ws);
    this.actors.delete(ws);
    this.queues.delete(ws);
    this.broadcast();
    // Drop uncommitted movement on a broken connection. An uncertain checkpoint
    // stays in the outbox for reconciliation before its grant is released.
    if (a && !(await this.ctx.storage.get('checkpoint:' + a.grant))) {
      try {
        await this.service({ operation: 'authority-release', grant: a.grant });
      } catch (error) {
        emitOperationalEvent({
          event: 'room-release-deferred',
          phase: 'close',
          ...failureFields(error),
        });
        /* ten-second writer expiry permits recovery */
      }
    }
  }
  async webSocketError(ws: WebSocket) {
    ws.close(1011, 'Room connection interrupted.');
    await this.webSocketClose(ws);
  }
}

export default roomWorker;
