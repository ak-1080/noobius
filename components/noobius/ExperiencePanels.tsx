'use client';
import ComputeIcon from './ComputeIcon';
import { useState } from 'react';
import { ArrowRight, Check, Cpu, Gauge, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  COMPUTE_JOBS,
  BOOST_PRICES,
  productionUnits,
  OUTAGE_NAMES,
  OUTAGE_STEPS,
  activeIncident,
  computePerTick,
  computeTankCapacity,
  modules,
  storedComputeNow,
  type Facility,
  type FacilityAction,
} from '@/lib/facility';
import MissionVisual from './MissionVisual';
import { type Briefing } from '@/lib/experience';

type Props = {
  facility: Facility;
  now: number;
  busy: boolean;
  onAction: (action: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
};

export function BriefingCard({
  briefing,
  busy,
  onContinue,
  onSkip,
}: {
  briefing: Briefing;
  busy: boolean;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="shift-briefing">
      <img
        className="welcome-machine"
        src="/assets/tutorial/tutorial-server.png"
        alt="Your free starter machine"
      />
      <p className="visual-briefing-line">
        “Your first machine is on me. Build it, collect Compute, then buy
        something bigger.”
      </p>
      <Button className="primary-action" disabled={busy} onClick={onContinue}>
        {briefing.cta}
        <ArrowRight size={18} />
      </Button>
      <button
        className="text-action briefing-skip"
        disabled={busy}
        onClick={onSkip}
      >
        Skip tips
      </button>
    </div>
  );
}

export function ComputeDesk({
  facility: f,
  now,
  busy,
  onAction,
  onStarted,
  onOutage,
}: Props & { onStarted: () => void; onOutage: () => void }) {
  const stored = storedComputeNow(f, now),
    cap = computeTankCapacity(f),
    job = f.workload;
  const cost = BOOST_PRICES[f.computeBoost],
    rate = computePerTick(f) * 4;
  const bonusWait = Math.max(
    0,
    Math.ceil(((f.cooldowns['compute-boost'] ?? 0) - now) / 1000),
  );
  const tickWait = Math.max(
    1,
    15 - (Math.floor((now - f.computeAt) / 1000) % 15),
  );
  return (
    <div className="compute-desk simple-compute">
      <div className="tycoon-wallet">
        <ComputeIcon size={44} />
        <strong>{f.compute.toLocaleString()}</strong>
        <span>Compute to spend</span>
      </div>
      <section className="compute-card production-card">
        <img
          src="/assets/tutorial/tutorial-server.png"
          alt="Your machines generate Compute automatically"
        />
        <h3>Your machines are working.</h3>
        <p>
          <strong>{rate} Compute / min</strong>
        </p>
        <div
          className="compute-tank"
          role="progressbar"
          aria-label="Compute storage"
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={stored}
        >
          <i style={{ width: `${(stored / cap) * 100}%` }} />
        </div>
        <small>
          {stored.toLocaleString()} ready · room for {cap.toLocaleString()}
        </small>
        <Button
          className="primary-action"
          disabled={busy || stored < 1}
          onClick={() => void onAction({ type: 'compute-harvest' })}
        >
          <ComputeIcon size={28} />
          {stored ? `Collect ${stored}` : `Next Compute in ${tickWait}s`}
        </Button>
        <p className="muted-small">
          Collect whenever you like. There’s room for an hour of earnings.
        </p>
      </section>
      <section className="compute-card">
        <h3>
          <Gauge size={21} /> Faster machines
        </h3>
        <p>
          {f.computeBoost >= 5
            ? 'Top speed reached!'
            : `${rate} → ${rate + productionUnits(f) * 12} Compute / min`}
        </p>
        <Button
          className="outline-button"
          disabled={
            busy || !modules(f) || f.computeBoost >= 5 || f.compute < cost
          }
          onClick={() => void onAction({ type: 'compute-upgrade' })}
        >
          {f.computeBoost >= 5 ? (
            'Max speed'
          ) : (
            <>
              <ComputeIcon size={24} />
              {cost} · Upgrade
            </>
          )}
        </Button>
      </section>
      <section className="compute-card">
        <h3>
          <Zap size={21} /> A little extra
        </h3>
        {job ? (
          <>
            <p>
              {now >= job.readyAt
                ? `Your bonus is ready: +${job.reward} Compute.`
                : `Bonus cooking… ${Math.ceil((job.readyAt - now) / 1000)}s`}
            </p>
            <div className="compute-tank">
              <i
                style={{
                  width: `${Math.min(100, ((now - job.startedAt) / (job.readyAt - job.startedAt)) * 100)}%`,
                }}
              />
            </div>
            <Button
              className="primary-action"
              disabled={busy || now < job.readyAt}
              onClick={() => void onAction({ type: 'compute-collect' })}
            >
              Collect bonus <ComputeIcon size={24} />
            </Button>
          </>
        ) : (
          <>
            <p>Tap a boost and let your machines do the rest.</p>
            <div className="compute-job-options">
              {COMPUTE_JOBS.map((j) => (
                <button
                  key={j.id}
                  disabled={busy || bonusWait > 0 || modules(f) < j.required}
                  onClick={async () => {
                    if (await onAction({ type: 'compute-start', id: j.id }))
                      onStarted();
                  }}
                >
                  <ComputeIcon size={36} />
                  <strong>{j.name}</strong>
                  <span>
                    +{j.base + modules(f) * j.perLevel} in {j.seconds}s
                  </span>
                  <small>
                    {modules(f) < j.required
                      ? `Needs ${j.required} machine levels`
                      : bonusWait
                        ? `Recharges in ${bonusWait}s`
                        : 'Start boost'}
                  </small>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      {activeIncident(f, now) && (
        <button className="compute-outage-link" onClick={onOutage}>
          <Zap size={19} /> Bonus round · wake a sleepy machine{' '}
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}

export function OutageRepair({
  facility: f,
  now,
  busy,
  onAction,
  onDone,
}: Props & { onDone: () => void }) {
  const incident = activeIncident(f, now);
  const [step, setStep] = useState(0),
    [hint, setHint] = useState('');
  if (!incident)
    return (
      <div className="empty-state">
        <Check size={32} />
        <p>All bright again.</p>
        <Button onClick={onDone}>Back to my machines</Button>
      </div>
    );
  const started = incident.startedAt !== null;
  const order = [1, 2, 0];
  return (
    <div className="spark-game">
      <div className="spark-game-reward">
        <ComputeIcon size={52} />
        <strong>+40 Compute</strong>
      </div>
      <h2>Wake up, sleepy server.</h2>
      <p>Tap the glowing button. Light up all three!</p>
      <div className="spark-score" aria-label={`${step} of 3 lights restored`}>
        {[0, 1, 2].map((i) => (
          <i className={i < step ? 'lit' : ''} key={i} />
        ))}
      </div>
      {!started ? (
        <Button
          className="primary-action"
          disabled={busy}
          onClick={() =>
            void onAction({ type: 'outage-start', id: String(incident.at) })
          }
        >
          Let’s play <ArrowRight size={18} />
        </Button>
      ) : (
        <>
          <div className="spark-buttons">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                aria-label={
                  order[step] === i
                    ? 'Glowing button — tap here'
                    : 'Unlit button'
                }
                className={order[step] === i ? 'glowing' : ''}
                disabled={busy || step === 3}
                onClick={() => {
                  if (order[step] === i) {
                    setStep(step + 1);
                    setHint('Nice!');
                  } else setHint('Look for the glowing one. Try again!');
                }}
              >
                <Zap size={34} />
              </button>
            ))}
          </div>
          <p className="spark-hint" role="status">
            {step === 3 ? 'You got them all!' : hint || 'Tap the glow.'}
          </p>
          {step === 3 && (
            <Button
              className="primary-action"
              disabled={busy || now - incident.startedAt! < 3000}
              onClick={async () => {
                if (
                  await onAction({
                    type: 'outage-fix',
                    id: String(incident.at),
                    direction: OUTAGE_STEPS[incident.kind].join('|'),
                  })
                )
                  onDone();
              }}
            >
              {now - incident.startedAt! < 3000
                ? 'Lighting up…'
                : 'Collect 40 Compute'}
              <ComputeIcon size={26} />
            </Button>
          )}
        </>
      )}
      <small>Just a bonus. Your machines keep earning while you play.</small>
    </div>
  );
}
