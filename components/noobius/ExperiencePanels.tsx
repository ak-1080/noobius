'use client';
import ComputeIcon from './ComputeIcon';
import ComputeCollection from './ComputeCollection';
import { useState } from 'react';
import { ArrowRight, Check, Cpu, Gauge, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  COMPUTE_JOBS,
  ACTIVE_COMPUTE_JOBS,
  BOOST_PRICES,
  ITEMS,
  activeBatchSeconds,
  boostGain,
  OUTAGE_STEPS,
  activeIncident,
  computePerTick,
  modules,
  type ItemId,
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
      <img
        className="welcome-machine"
        src="/assets/tutorial/tutorial-server.png"
        alt="Your free starter machine"
      />
      <p className="visual-briefing-line">
        “Your first machine is on me. Get it running, then choose a job.
        I’ll show you around. You make the decisions.”
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
  onFindParts,
}: Props & { onStarted: () => void; onOutage: () => void; onFindParts?: (item: ItemId) => void }) {
  const job = f.workload;
  const cost = BOOST_PRICES[f.computeBoost],
    rate = computePerTick(f) * 4;
  const bonusWait = Math.max(
    0,
    Math.ceil(((f.cooldowns['compute-boost'] ?? 0) - now) / 1000),
  );
  if (f.productionVersion === 3) {
    return (
      <div className="compute-desk simple-compute">
        <div className="tycoon-wallet">
          <ComputeIcon size={44} />
          <strong>{f.compute.toLocaleString()}</strong>
          <span>Compute to spend</span>
        </div>
        <ComputeCollection facility={f} now={now} busy={busy} onAction={onAction} />
        <section className="compute-card">
          <h3><Cpu size={21} /> Machine batches</h3>
          {job ? (
            <>
              <p>{now >= job.readyAt ? `${job.label} ready · +${job.reward} Compute` : `${job.label} · ${Math.ceil((job.readyAt - now) / 1000)}s left`}</p>
              <div className="compute-tank"><i style={{ width: `${Math.min(100, ((now - job.startedAt) / (job.readyAt - job.startedAt)) * 100)}%` }} /></div>
              <Button className="primary-action" disabled={busy || now < job.readyAt} onClick={() => void onAction({ type: 'compute-collect' })}>
                Collect batch <ComputeIcon size={24} />
              </Button>
            </>
          ) : (
            <>
              <p>Load recovered parts. A finished batch stops until you start another.</p>
              <div className="compute-job-options">
                {ACTIVE_COMPUTE_JOBS.map((batch) => {
                  const missing = Object.entries(batch.cost)
                    .filter(([id, count]) => (f.inventory[id as keyof typeof f.inventory] ?? 0) < count)
                    .map(([id, count]) => `${count} ${ITEMS[id as keyof typeof ITEMS].name}`);
                  const locked = modules(f) < batch.required;
                  return (
                    <button key={batch.id} disabled={busy || locked || missing.length > 0} onClick={async () => {
                      if (await onAction({ type: 'compute-start', id: batch.id })) onStarted();
                    }}>
                      <ComputeIcon size={36} />
                      <strong>{batch.name}</strong>
                      <span>+{batch.reward} Compute · {activeBatchSeconds(f, batch.seconds)}s</span>
                      <small>{locked ? `Needs ${batch.required} machine levels` : missing.length ? `Bring ${missing.join(' + ')}` : Object.entries(batch.cost).map(([id, count]) => `${count} ${ITEMS[id as keyof typeof ITEMS].name}`).join(' + ')}</small>
                    </button>
                  );
                })}
              </div>
              {!f.inventory.scrap || f.inventory.scrap < 2 ? (
                <button className="text-action" onClick={() => onFindParts?.('scrap')}>Go to a salvage pile <ArrowRight size={16} /></button>
              ) : null}
            </>
          )}
        </section>
        <section className="compute-card">
          <h3><Gauge size={21} /> Faster batches</h3>
          <p>{f.computeBoost >= 5 ? 'Top speed reached!' : `New batches finish ${6 * (f.computeBoost + 1)}% faster at the next speed level.`}</p>
          <Button className="outline-button" disabled={busy || !modules(f) || f.computeBoost >= 5 || f.compute < cost} onClick={() => void onAction({ type: 'compute-upgrade' })}>
            {f.computeBoost >= 5 ? 'Max speed' : <><ComputeIcon size={24} />{cost} · Upgrade</>}
          </Button>
        </section>
        {activeIncident(f, now) && <button className="compute-outage-link" onClick={onOutage}><Zap size={19} /> Wake a sleepy machine <ArrowRight size={18} /></button>}
      </div>
    );
  }
  return (
    <div className="compute-desk simple-compute">
      <div className="tycoon-wallet">
        <ComputeIcon size={44} />
        <strong>{f.compute.toLocaleString()}</strong>
        <span>Compute to spend</span>
      </div>
      <ComputeCollection
        facility={f}
        now={now}
        busy={busy}
        onAction={onAction}
      />
      <section className="compute-card">
        <h3>
          <Gauge size={21} /> Faster machines
        </h3>
        <p>
          {f.computeBoost >= 5
            ? 'Top speed reached!'
            : `${rate} → ${rate + boostGain(f)} Compute / min`}
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
      <small>Just a bonus. Any running jobs keep their progress.</small>
    </div>
  );
}
