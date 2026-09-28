import assert from 'node:assert/strict';
import test from 'node:test';
import { CapacityTimeline } from '../scripts/capacity-timeline.mjs';

void test('observer gap and renewal share one clock and retain actual missing actors', () => {
  let time = 1000;
  const trace = new CapacityTimeline({ now: () => time });
  trace.record(1, 'renew', { socket: 2 });
  time = 1100;
  trace.peers(0, [0, 1, 2], [0, 2]);
  time = 1200;
  trace.record(1, 'close', { socket: 2, code: 1012 });
  time = 3300;
  trace.record(1, 'recovered', { socket: 3, durationMs: 2300 });
  trace.peers(0, [0, 1, 2], [0, 1, 2]);
  const report = trace.snapshot();
  assert.equal(report.maxPeerGapMs, 2200);
  assert.deepEqual(report.unresolvedPeerGaps, []);
  assert.deepEqual(
    report.events.map((e) => [e.event, e.atMs]),
    [
      ['renew', 0],
      ['peer-gap-start', 100],
      ['close', 200],
      ['recovered', 2300],
      ['peer-gap-end', 2300],
    ],
  );
  assert.deepEqual(report.events[1].missing, [1]);
  assert.equal(report.events[4].durationMs, 2200);
});

void test('unchanged frames do not flood the trace and unfinished gaps remain visible', () => {
  let time = 0;
  const trace = new CapacityTimeline({ now: () => time });
  trace.peers(3, [3, 4], [3]);
  for (time = 1; time < 5500; time++) trace.peers(3, [3, 4], [3]);
  const report = trace.snapshot();
  assert.equal(report.events.length, 1);
  assert.equal(report.maxPeerGapMs, 5500);
  assert.deepEqual(report.unresolvedPeerGaps, [
    { observer: 3, missing: [4], beganAtMs: 0, durationMs: 5500 },
  ]);
});

void test('changing missing actors retains the full continuous observer gap', () => {
  let time = 0;
  const trace = new CapacityTimeline({ now: () => time });
  trace.peers(0, [0, 1, 2], [0]);
  time = 1500;
  trace.peers(0, [0, 1, 2], [0, 1]);
  time = 2000;
  const report = trace.snapshot();
  assert.equal(report.maxPeerGapMs, 2000);
  assert.deepEqual(report.unresolvedPeerGaps[0].missing, [2]);
  assert.equal(report.unresolvedPeerGaps[0].beganAtMs, 0);
  assert.equal(report.events[1].event, 'peer-gap-change');
  assert.equal(report.events[1].durationMs, 1500);
});

void test('capacity trace omits arbitrary remote data and reports bounded overflow', () => {
  const trace = new CapacityTimeline({ now: () => 10, maxEvents: 2 });
  trace.record(0, 'close', {
    code: 1012,
    reason: 'wss://private/?ticket=secret',
    ticket: 'secret',
    wallet: 'secret',
    status: -1,
    authorityAgeMs: NaN,
  });
  trace.record(0, 'disconnect', { reason: 'renew' });
  trace.record(0, 'recovered');
  const report = trace.snapshot();
  assert.equal(report.droppedEvents, 1);
  assert.equal(report.events.length, 2);
  assert.equal(JSON.stringify(report).includes('secret'), false);
  assert.deepEqual(report.events[0], {
    atMs: 0,
    actor: 0,
    event: 'close',
    code: 1012,
  });
  assert.equal(report.events[1].reason, 'renew');
  report.events[1].reason = 'edited';
  assert.equal(trace.snapshot().events[1].reason, 'renew');
  assert.throws(() => trace.record(-1, 'open'));
  assert.throws(() => trace.record(0, 'raw-protocol'));
  assert.throws(() => trace.peers(0, ['wallet'], []));
});

void test('freezing observer evidence preserves unfinished measured gaps while later releases retain separate transport events', () => {
  let time = 0;
  const trace = new CapacityTimeline({ now: () => time });
  time = 100;
  trace.peers(0, [0, 1, 2], [0, 2]);
  time = 600;
  trace.freezePeers();
  const measured = trace.snapshot();
  assert.equal(measured.peerMetricsFrozenAtMs, 600);
  assert.equal(measured.maxPeerGapMs, 500);
  assert.deepEqual(measured.unresolvedPeerGaps, [
    { observer: 0, missing: [1], beganAtMs: 100, durationMs: 500 },
  ]);
  time = 10000;
  trace.peers(0, [0, 1, 2], []); // Intentional teardown cannot extend or replace the measured gap.
  trace.record(1, 'close', { code: 1000, reason: 'transition' });
  trace.freezePeers(); // Repeated freezing cannot move the measurement boundary.
  const afterRelease = trace.snapshot();
  assert.equal(afterRelease.maxPeerGapMs, measured.maxPeerGapMs);
  assert.equal(
    afterRelease.peerMetricsFrozenAtMs,
    measured.peerMetricsFrozenAtMs,
  );
  assert.deepEqual(
    afterRelease.unresolvedPeerGaps,
    measured.unresolvedPeerGaps,
  );
  assert.equal(afterRelease.events.length, measured.events.length + 1);
  assert.equal(afterRelease.events.at(-1).event, 'close');
  afterRelease.unresolvedPeerGaps[0].durationMs = 999999;
  assert.equal(trace.snapshot().unresolvedPeerGaps[0].durationMs, 500);
});
