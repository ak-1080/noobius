import type { Membership, NeighborhoodSnapshot } from './neighborhoods.ts';
import { roomActionIntent, type RoomWorkLease } from './room-protocol.ts';

type Point = { x: number; z: number };
type Frame = Record<string, unknown> & {
  type: string;
  connectionId: string;
  inputSequence: number;
  membership: Membership;
  serverNow: number;
  authorizedUntil: number;
  workFrozen: boolean;
  people: NeighborhoodSnapshot['people'];
  position: Point;
  accepted: boolean;
  corrected: boolean;
  requestId: string;
  checkpoint: { id: string; inputSequence: number };
  id: string;
};
type Pending = {
  resolve: (frame: Frame) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type Socket = Pick<WebSocket, 'send' | 'close' | 'addEventListener'>;
type Options = {
  coordinatorOrigin: string;
  ticket: string;
  membership: Membership;
  readPosition: () => Point;
  onMembership: (membership: Membership, reset: boolean) => void;
  onPeople: (people: NeighborhoodSnapshot['people']) => void;
  onCorrection: (point: Point) => void;
  onReady: (ready: boolean) => void;
  onDisconnect: () => void;
  createSocket?: (url: string) => Socket;
  now?: () => number;
};
const samePoint = (a: Point, b: Point) => a.x === b.x && a.z === b.z;
const interrupted = () =>
  new Error(
    'Your room connection is recovering. Please retry when you are back.',
  );
const validPoint = (p: unknown): p is Point =>
  !!p &&
  typeof p === 'object' &&
  'x' in p &&
  'z' in p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.z);

/** Browser transport only. All movement and rewards remain server validated. */
export class RoomClient {
  private socket: Socket | null = null;
  private connectionId = '';
  private sequence = 0;
  private membership: Membership;
  private point: Point;
  private deadline = 0;
  private lastMoveAt = 0;
  private connected = false;
  private ended = false;
  private barrier = false;
  private serverFrozen = false;
  private pending = new Map<string, Pending>();
  private moveTask: Promise<boolean> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private now: () => number;
  private options: Options;
  constructor(options: Options) {
    this.options = options;
    this.membership = { ...options.membership };
    this.point = { x: this.membership.x, z: this.membership.z };
    this.now = options.now ?? (() => performance.now());
  }
  get ready() {
    return (
      this.connected &&
      !this.ended &&
      !this.barrier &&
      !this.serverFrozen &&
      this.now() < this.deadline
    );
  }
  private notify() {
    this.options.onReady(this.ready);
  }
  private wait(key: string, timeout = 8000) {
    return new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(interrupted());
        this.stop(true);
      }, timeout);
      this.pending.set(key, { resolve, reject, timer });
    });
  }
  private settle(key: string, body: Frame) {
    const pending = this.pending.get(key);
    if (!pending) return;
    this.pending.delete(key);
    clearTimeout(pending.timer);
    pending.resolve(body);
  }
  private send(body: Record<string, unknown>) {
    if (this.ended || !this.socket) throw interrupted();
    this.socket.send(JSON.stringify(body));
  }
  private request(
    type: string,
    key: string,
    body: Record<string, unknown> = {},
  ) {
    if (!this.connected || this.ended || this.now() >= this.deadline)
      return Promise.reject(interrupted());
    const promise = this.wait(key);
    try {
      this.send({ type, connectionId: this.connectionId, ...body });
    } catch {
      this.stop(true);
    }
    return promise;
  }
  async connect() {
    if (this.socket || this.ended) throw interrupted();
    const url = new URL(this.options.coordinatorOrigin);
    if (
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      throw new Error('Invalid room host.');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/rooms/' + this.membership.neighborhoodId;
    const joined = this.wait('joined');
    try {
      this.socket = (
        this.options.createSocket ?? ((address) => new WebSocket(address))
      )(url.toString());
      this.socket.addEventListener('open', () => {
        try {
          this.send({ type: 'join', ticket: this.options.ticket });
        } catch {
          this.stop(true);
        }
      });
      this.socket.addEventListener('message', (event) =>
        this.message((event as MessageEvent).data),
      );
      this.socket.addEventListener('close', () => this.stop(true));
      this.socket.addEventListener('error', () => this.stop(true));
    } catch {
      this.stop(true);
    }
    await joined;
    this.timer = setInterval(() => {
      if (this.now() >= this.deadline) {
        this.stop(true);
        return;
      }
      if (this.ready && !this.moveTask)
        void this.syncPosition().catch(() => this.stop(true));
    }, 160);
  }
  private authority(body: Frame, reset = false) {
    const m = body.membership as Membership;
    if (
      !m ||
      m.neighborhoodId !== this.membership.neighborhoodId ||
      m.scene !== this.membership.scene ||
      m.generation !== this.membership.generation ||
      !Number.isSafeInteger(m.sequence) ||
      !validPoint(m) ||
      !Number.isFinite(body.authorizedUntil) ||
      !Number.isFinite(body.serverNow)
    )
      throw interrupted();
    if (!reset && m.sequence < this.membership.sequence) return;
    this.membership = { ...m };
    this.serverFrozen = body.workFrozen === true;
    this.deadline =
      this.now() +
      Math.max(0, Math.min(10000, body.authorizedUntil - body.serverNow));
    this.options.onMembership(this.membership, reset);
  }
  private message(raw: unknown) {
    if (this.ended || typeof raw !== 'string') return;
    try {
      const body = JSON.parse(raw) as Frame;
      if (!body || typeof body !== 'object') throw interrupted();
      if (body.type === 'joined' || body.type === 'rebase') {
        if (
          typeof body.connectionId !== 'string' ||
          !Number.isSafeInteger(body.inputSequence)
        )
          throw interrupted();
        if (body.type === 'rebase') {
          // Outstanding work belongs to the old connection and must be retried
          // explicitly. Never carry its checkpoint proof across a restart.
          for (const [key, p] of this.pending)
            if (key !== 'joined') {
              clearTimeout(p.timer);
              p.reject(interrupted());
              this.pending.delete(key);
            }
        }
        this.connectionId = body.connectionId;
        this.sequence = body.inputSequence;
        this.authority(body, true);
        this.point = { x: body.membership.x, z: body.membership.z };
        this.lastMoveAt = this.now();
        this.connected = true;
        this.barrier = false;
        this.options.onCorrection(this.point);
        this.notify();
        this.settle('joined', body);
        return;
      }
      if (body.connectionId !== this.connectionId || !this.connected) return;
      if (body.type === 'authority') {
        this.authority(body);
        this.notify();
        return;
      }
      if (body.type === 'players') {
        if (
          !Array.isArray(body.people) ||
          body.people.length > 5 ||
          body.people.some(
            (p) =>
              !validPoint(p) ||
              typeof p.id !== 'string' ||
              typeof p.name !== 'string' ||
              typeof p.outfit !== 'string' ||
              typeof p.accessory !== 'string',
          )
        )
          throw interrupted();
        this.options.onPeople(body.people);
        return;
      }
      if (body.type === 'move-ack') {
        if (!validPoint(body.position) || body.inputSequence !== this.sequence)
          return;
        this.point = { ...body.position };
        if (!body.accepted || body.corrected)
          this.options.onCorrection(this.point);
        this.settle('move:' + body.inputSequence, body);
        return;
      }
      if (body.type === 'checkpoint') {
        if (
          body.checkpoint?.id !== body.requestId ||
          body.checkpoint?.inputSequence !== this.sequence
        )
          throw interrupted();
        this.authority(body);
        this.settle('checkpoint:' + body.requestId, body);
        return;
      }
      if (body.type === 'action-complete') {
        this.serverFrozen = false;
        this.settle('complete:' + body.id, body);
        return;
      }
      if (body.type === 'released') {
        this.settle('released', body);
        return;
      }
      if (body.type === 'renew') this.stop(true);
    } catch {
      this.stop(true);
    }
  }
  async syncPosition(): Promise<boolean> {
    if (this.moveTask) return this.moveTask;
    if (!this.connected || this.ended || this.now() >= this.deadline)
      throw interrupted();
    const task = async () => {
      if (samePoint(this.options.readPosition(), this.point)) return true;
      const delay = 160 - (this.now() - this.lastMoveAt);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (this.ended || !this.connected) throw interrupted();
      const target = { ...this.options.readPosition() };
      if (samePoint(target, this.point)) return true;
      this.lastMoveAt = this.now();
      const seq = ++this.sequence;
      const ack = await this.request('move', 'move:' + seq, {
        inputSequence: seq,
        ...target,
      });
      return ack.accepted === true && !ack.corrected;
    };
    this.moveTask = task();
    try {
      return await this.moveTask;
    } finally {
      this.moveTask = null;
    }
  }
  async prepare(
    action: string,
    body: Record<string, unknown>,
  ): Promise<RoomWorkLease> {
    if (!this.ready) throw interrupted();
    this.barrier = true;
    this.notify();
    let captured = false;
    try {
      if (this.moveTask && !(await this.moveTask)) throw interrupted();
      if (!(await this.syncPosition()))
        throw new Error(
          'Your position was corrected. Walk to the worksite and try again.',
        );
      const id = crypto.randomUUID(),
        intent = await roomActionIntent(action, body);
      captured = true;
      await this.request('checkpoint', 'checkpoint:' + id, {
        requestId: id,
        inputSequence: this.sequence,
        intent,
      });
      let completed = false;
      return {
        checkpoint: id,
        complete: async () => {
          if (completed) return;
          completed = true;
          try {
            await this.request('action-complete', 'complete:' + id, { id });
          } catch {
            this.stop(true);
          } finally {
            this.barrier = false;
            this.notify();
          }
        },
      };
    } catch (error) {
      if (captured) this.stop(true);
      this.barrier = false;
      this.notify();
      throw error;
    }
  }
  async release() {
    if (!this.ready) {
      this.stop(false);
      throw interrupted();
    }
    this.barrier = true;
    this.notify();
    try {
      if (this.moveTask) await this.moveTask;
      await this.syncPosition();
      await this.request('leave', 'released');
    } finally {
      this.stop(false);
    }
  }
  dispose() {
    this.stop(false);
  }
  private stop(notify: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.connected = false;
    clearInterval(this.timer);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(interrupted());
    }
    this.pending.clear();
    try {
      this.socket?.close(1000, 'Room connection ended.');
    } catch {
      /* closed */
    }
    this.notify();
    if (notify) this.options.onDisconnect();
  }
}
