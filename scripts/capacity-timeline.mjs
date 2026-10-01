// Correlate transport transitions and observer gaps without storing wallet,
// ticket, session, socket URL or raw protocol data in a capacity report.
import assert from 'node:assert/strict';

const events = new Set([
  'ticket-request',
  'ticket',
  'open',
  'join-sent',
  'joined',
  'rebase',
  'renew',
  'close',
  'disconnect',
  'recovered',
  'handshake-rejected',
  'socket-error',
]);
const reasons = new Set(['renew', 'interrupted', 'transition', 'shutdown']);
const numbers = ['socket', 'status', 'code', 'durationMs', 'authorityAgeMs'];

export class CapacityTimeline {
  constructor({ now = Date.now, beganAt = now(), maxEvents = 20000 } = {}) {
    assert.ok(Number.isFinite(beganAt));
    assert.ok(
      Number.isInteger(maxEvents) && maxEvents >= 1 && maxEvents <= 100000,
    );
    this.now = now;
    this.beganAt = beganAt;
    this.maxEvents = maxEvents;
    this.events = [];
    this.droppedEvents = 0;
    this.gaps = new Map();
    this.maxPeerGapMs = 0;
    this.frozenPeers = null;
  }

  append(event) {
    if (this.events.length < this.maxEvents) this.events.push(event);
    else this.droppedEvents++;
  }

  offset() {
    return Math.max(0, this.now() - this.beganAt);
  }

  record(actor, event, detail = {}) {
    assert.ok(Number.isInteger(actor) && actor >= 0 && actor < 100);
    assert.ok(events.has(event));
    const safe = { atMs: this.offset(), actor, event };
    for (const key of numbers)
      if (Number.isFinite(detail[key]) && detail[key] >= 0)
        safe[key] = detail[key];
    if (reasons.has(detail.reason)) safe.reason = detail.reason;
    // Unknown reason text may include a socket URL or token. Omit it rather
    // than copying free-form remote content into committed evidence.
    this.append(safe);
  }

  peers(observer, expectedActors, observedActors) {
    if (this.frozenPeers) return;
    assert.ok(Number.isInteger(observer) && observer >= 0 && observer < 100);
    const valid = (xs) =>
      Array.isArray(xs) &&
      xs.every((x) => Number.isInteger(x) && x >= 0 && x < 100);
    assert.ok(valid(expectedActors) && valid(observedActors));
    const atMs = this.offset();
    const missing = [...new Set(expectedActors)]
      .filter((actor) => !observedActors.includes(actor))
      .sort((a, b) => a - b);
    const prior = this.gaps.get(observer);
    if (prior) {
      this.maxPeerGapMs = Math.max(this.maxPeerGapMs, atMs - prior.atMs);
      if (JSON.stringify(missing) === JSON.stringify(prior.missing)) return;
      if (missing.length) {
        this.append({
          atMs,
          observer,
          event: 'peer-gap-change',
          missing,
          priorMissing: prior.missing,
          durationMs: atMs - prior.atMs,
        });
        this.gaps.set(observer, { atMs: prior.atMs, missing });
        return;
      }
      this.append({
        atMs,
        observer,
        event: 'peer-gap-end',
        missing: prior.missing,
        durationMs: atMs - prior.atMs,
      });
      this.gaps.delete(observer);
    }
    if (missing.length) {
      this.gaps.set(observer, { atMs, missing });
      this.append({ atMs, observer, event: 'peer-gap-start', missing });
    }
  }

  peerSnapshot(atMs = this.offset()) {
    const unresolvedPeerGaps = [...this.gaps].map(([observer, gap]) => ({
      observer,
      missing: [...gap.missing],
      beganAtMs: gap.atMs,
      durationMs: Math.max(0, atMs - gap.atMs),
    }));
    return {
      maxPeerGapMs: Math.max(
        this.maxPeerGapMs,
        0,
        ...unresolvedPeerGaps.map((gap) => gap.durationMs),
      ),
      unresolvedPeerGaps,
    };
  }

  freezePeers() {
    if (!this.frozenPeers) {
      const frozenAtMs = this.offset();
      this.frozenPeers = {
        ...this.peerSnapshot(frozenAtMs),
        peerMetricsFrozenAtMs: frozenAtMs,
      };
    }
  }

  snapshot() {
    return {
      events: structuredClone(this.events),
      droppedEvents: this.droppedEvents,
      ...(this.frozenPeers
        ? structuredClone(this.frozenPeers)
        : this.peerSnapshot()),
    };
  }
}
