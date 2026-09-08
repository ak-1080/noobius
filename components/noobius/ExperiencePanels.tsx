'use client';
import { useState } from 'react';
import { ArrowRight, Check, Cpu, Gauge, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  COMPUTE_JOBS,
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
      <div className="briefing-speaker">
        <span>{briefing.who[0]}</span>
        <div>
          <strong>{briefing.who}</strong>
          <small>{briefing.role}</small>
        </div>
      </div>
      <p>{briefing.text}</p>
      <div className="briefing-tip">
        <ArrowRight size={20} />
        <span>{briefing.tip}</span>
      </div>
      <Button className="primary-action" disabled={busy} onClick={onContinue}>
        {briefing.cta}
        <ArrowRight size={18} />
      </Button>
      <button
        className="text-action briefing-skip"
        disabled={busy}
        onClick={onSkip}
      >
        I know my way around · skip tips
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
    incident = activeIncident(f, now),
    job = f.workload;
  const progress = job
    ? Math.min(
        100,
        Math.max(
          0,
          ((now - job.startedAt) / (job.readyAt - job.startedAt)) * 100,
        ),
      )
    : 0;
  return (
    <div className="compute-desk">
      <div className="compute-balance">
        <Cpu size={28} />
        <strong>{f.compute.toLocaleString()}</strong>
        <span>compute available</span>
      </div>
      <section className="compute-card">
        <div className="compute-card-title">
          <strong>Your racks are working</strong>
          <span>{modules(f)} rack levels</span>
        </div>
        <p>
          {modules(f)
            ? `${computePerTick(f) * 4} compute / minute · storage fills between visits`
            : 'Build your first rack to start generating compute.'}
        </p>
        <div
          className="compute-tank"
          role="progressbar"
          aria-label="Stored compute"
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={stored}
        >
          <i style={{ width: `${(stored / cap) * 100}%` }} />
        </div>
        <div className="compute-card-title">
          <span>
            {stored} / {cap} stored
          </span>
          <span>
            {incident
              ? 'Output paused · outage'
              : stored >= cap
                ? 'Storage full'
                : 'New output every 15 seconds'}
          </span>
        </div>
        <Button
          className="primary-action"
          disabled={busy || stored < 1}
          onClick={() => void onAction({ type: 'compute-harvest' })}
        >
          Collect {stored} compute
          <ArrowRight size={17} />
        </Button>
        <p className="muted-small">
          Your collected balance is safe. Outages pause new output until
          repaired.
        </p>
      </section>
      {incident && (
        <button className="compute-outage-link" onClick={onOutage}>
          <Zap size={18} />
          {OUTAGE_NAMES[incident.kind]} · fix it for +40 compute
          <ArrowRight size={17} />
        </button>
      )}
      <section className="compute-card">
        <div className="compute-card-title">
          <strong>Run an extra batch</strong>
          <span>Active-play bonus</span>
        </div>
        {job ? (
          <>
            <p>
              {job.label} · +{job.reward} compute
            </p>
            <div
              className="compute-tank"
              role="progressbar"
              aria-label="Compute batch progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.floor(progress)}
            >
              <i style={{ width: `${progress}%` }} />
            </div>
            <p>
              {incident
                ? 'Fix the outage to collect. Your batch is safe.'
                : now >= job.readyAt
                  ? 'Batch finished. Ready to collect!'
                  : `${Math.max(0, Math.ceil((job.readyAt - now) / 1000))} seconds left. You can keep exploring.`}
            </p>
            <Button
              className="primary-action"
              disabled={busy || !!incident || now < job.readyAt}
              onClick={() => void onAction({ type: 'compute-collect' })}
            >
              Collect batch · +{job.reward} compute
            </Button>
          </>
        ) : (
          <div className="compute-job-options">
            {COMPUTE_JOBS.map((j) => (
              <button
                key={j.id}
                disabled={busy || !!incident || modules(f) < j.required}
                onClick={async () => {
                  if (await onAction({ type: 'compute-start', id: j.id }))
                    onStarted();
                }}
              >
                <Cpu size={20} />
                <strong>{j.name}</strong>
                <span>
                  {j.seconds}s · +{j.base + modules(f) * j.perLevel} compute
                </span>
                <small>
                  {modules(f) < j.required
                    ? `Needs ${j.required} rack levels`
                    : 'Start batch →'}
                </small>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="compute-card">
        <div className="compute-card-title">
          <strong>
            <Gauge size={17} /> Upgrade efficiency
          </strong>
          <span>Level {f.computeBoost} / 5</span>
        </div>
        <p>
          Every upgrade adds 4 compute per minute to each rack level and 50
          storage. Build more racks to grow faster.
        </p>
        <Button
          className="primary-action"
          disabled={
            busy ||
            !modules(f) ||
            f.computeBoost >= 5 ||
            f.compute < 80 * (f.computeBoost + 1)
          }
          onClick={() => void onAction({ type: 'compute-upgrade' })}
        >
          {f.computeBoost >= 5
            ? 'Efficiency maxed'
            : `Upgrade · ${80 * (f.computeBoost + 1)} compute`}
        </Button>
      </section>
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
        <p>Everything is back online.</p>
        <Button onClick={onDone}>Back to the floor</Button>
      </div>
    );
  const steps = OUTAGE_STEPS[incident.kind],
    started = incident.startedAt !== null;
  return (
    <div className="outage-repair">
      <div className="outage-icon">
        <Zap size={34} />
      </div>
      <p className="outage-reward">Restore service · +40 compute +20 XP</p>
      <p>
        Patch: “We’ve found the problem. Three steps, in order. Your racks and
        collected compute are safe.”
      </p>
      {!started ? (
        <Button
          className="primary-action"
          disabled={busy}
          onClick={() =>
            void onAction({ type: 'outage-start', id: String(incident.at) })
          }
        >
          Inspect the fault
          <ArrowRight size={18} />
        </Button>
      ) : (
        <>
          <ol className="outage-steps">
            {steps.map((label, i) => (
              <li
                key={label}
                className={i < step ? 'done' : i === step ? 'current' : ''}
              >
                <span>{i < step ? '✓' : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {step < 3 && (
            <>
              <p className="outage-instruction">
                Step {step + 1}: {steps[step]}
              </p>
              <div className="outage-controls">
                {[2, 0, 1].map((i) => (
                  <button
                    key={i}
                    disabled={busy || i < step}
                    onClick={() => {
                      if (i === step) {
                        setStep(step + 1);
                        setHint('');
                      } else
                        setHint(
                          `First: ${steps[step].toLowerCase()}. No damage done—try again.`,
                        );
                    }}
                  >
                    {steps[i]}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="outage-hint" role="status">
            {hint ||
              (step === 3
                ? 'All checks passed. Bring it back online.'
                : 'Choose the matching control below.')}
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
                    direction: steps.join('|'),
                  })
                )
                  onDone();
              }}
            >
              {now - incident.startedAt! < 3000
                ? 'System resetting…'
                : 'Restore service · collect bonus'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
