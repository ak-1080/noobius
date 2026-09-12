'use client';
import { ArrowRight, Check, Gauge, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BOOST_PRICES,
  OBJECTS,
  ZONES,
  computePerTick,
  machineGain,
  workloadCapacity,
  MACHINE_POWER,
  boostGain,
  modules,
  rackPrice,
  type Facility,
  type FacilityAction,
} from '@/lib/facility';
import ComputeIcon from './ComputeIcon';
import ComputeCollection from './ComputeCollection';
import MachinePreview from './MachinePreview';

export default function TycoonBuildPanel({
  facility: f,
  balance,
  busy,
  now,
  selected,
  onAction,
  onExpand,
  onExtra,
  onJobs,
  onProject,
}: {
  facility: Facility;
  balance: number;
  busy: boolean;
  now: number;
  selected?: string;
  onAction: (a: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onExpand: () => void;
  onExtra: () => void;
  onJobs: (jobId?: string) => void;
  onProject?: () => void;
}) {
  const rate = computePerTick(f) * 4;
  const plots = OBJECTS.filter(
    (o) =>
      o.kind === 'build' &&
      f.unlocked.includes(o.zone) &&
      (modules(f) > 0 || o.id === 'rack-a'),
  );
  const boostCost = BOOST_PRICES[f.computeBoost];
  const loans = (f.projectReservations ?? []).filter((r) => r.readyAt > now);
  const runningClients = (f.career?.active ?? []).filter(
    (r) => r.rack && r.readyAt !== null && r.readyAt > now,
  );
  const machineCard = (o: (typeof plots)[number]) => {
    const level = f.builds[o.id] ?? 0;
    const cost = rackPrice(f, o.id);
    const gain = machineGain(f, o.id);
    const loan = loans.find((r) => r.rack === o.id);
    const client = f.career?.active.find((r) => r.rack === o.id);
    const bonus = f.workload?.rack === o.id ? f.workload : undefined;
    const bonusRunning = !!bonus && bonus.readyAt > now;
    const resultsReady =
      !!client &&
      (client.state === 'ready' ||
        (client.readyAt !== null && client.readyAt <= now));
    const status = !level
      ? 'Ready to build'
      : loan
        ? 'Helping the crew'
        : resultsReady
          ? 'Client results ready'
          : client
            ? 'Processing a job'
            : bonusRunning
              ? 'Running a bonus job'
              : bonus
                ? 'Bonus results ready'
                : 'Producing Compute';
    return (
      <section
        className={`tycoon-machine ${selected === o.id ? 'is-selected' : ''}`}
        key={o.id}
      >
        <div className="tycoon-machine-art">
          <MachinePreview level={level} />
          <span>
            {level
              ? `LEVEL ${level} / 3`
              : cost
                ? 'EMPTY SPOT'
                : 'YOUR FREE STARTER'}
          </span>
        </div>
        <div className="tycoon-machine-copy">
          <small>{ZONES.find((z) => z.id === o.zone)?.name}</small>
          <h3>{o.name.split(' · ')[0]}</h3>
          <span className={`machine-status ${resultsReady ? 'is-ready' : ''}`}>
            <i />
            {status}
          </span>
          <p>
            {level >= 3 ? (
              <>
                <Check size={16} /> Fully upgraded
              </>
            ) : (
              <>
                <Sparkles size={16} /> Adds {gain} Compute / min
              </>
            )}
          </p>
          <p className="muted-small">
            {level >= 3
              ? `Runs up to ${workloadCapacity(f, o.id)} client units together`
              : `Client capacity: ${workloadCapacity(f, o.id)} → ${(level + 1) * MACHINE_POWER[o.id]} units`}
          </p>
          {level < 3 && (
            <Button
              className={cost === 0 ? 'primary-action' : 'outline-button'}
              disabled={
                busy || !!loan || !!client || level >= 3 || balance < cost
              }
              aria-label={
                level >= 3
                  ? `${o.name} is fully upgraded`
                  : `${level ? 'Upgrade' : 'Build'} ${o.name} for ${cost} Compute`
              }
              onClick={() => void onAction({ type: 'build', id: o.id })}
            >
              {level >= 3 ? (
                'Max level'
              ) : cost === 0 ? (
                'Build for free'
              ) : (
                <>
                  <ComputeIcon size={24} />
                  {cost} · {level ? 'Upgrade' : 'Build'}
                </>
              )}
            </Button>
          )}
          {loan && (
            <p className="muted-small">
              Commissioning a crew cluster ·{' '}
              {Math.ceil((loan.readyAt - now) / 1000)}s left. Ordinary output
              resumes automatically.
            </p>
          )}
          {client && (
            <p className="muted-small">
              {client.readyAt! > now
                ? `Processing a client batch · ${Math.ceil((client.readyAt! - now) / 1000)}s left.`
                : 'Client results ready. Collect them in Jobs to free this machine.'}
            </p>
          )}
          {bonusRunning && (
            <p className="muted-small">
              Available for a client in{' '}
              {Math.ceil((bonus.readyAt - now) / 1000)}s. Passive production
              continues.
            </p>
          )}
          {level > 0 && (
            <Button
              className={resultsReady ? 'primary-action' : 'outline-button'}
              disabled={busy}
              onClick={() =>
                loan
                  ? onProject?.()
                  : client
                    ? onJobs(client.id)
                    : bonus
                      ? onExtra()
                      : onJobs()
              }
            >
              {loan
                ? 'Review crew project'
                : resultsReady
                  ? 'Collect client results'
                  : client
                    ? 'Review job'
                    : bonus
                      ? 'Review bonus job'
                      : 'Find work for this machine'}{' '}
              <ArrowRight size={16} />
            </Button>
          )}
          {resultsReady && (
            <small className="muted-small">
              Passive production has resumed. Collect the job payment to assign
              another client.
            </small>
          )}
          {level < 3 && balance < cost && (
            <small className="tycoon-short">
              Need {cost - balance} more. Collect above.
            </small>
          )}
        </div>
      </section>
    );
  };
  const focused = plots.find((o) => o.id === selected);
  return (
    <div className="tycoon-build">
      <div className="tycoon-wallet">
        <ComputeIcon size={40} />
        <strong>{balance.toLocaleString()}</strong>
        <span>Compute to spend</span>
      </div>
      <ComputeCollection
        facility={f}
        now={now}
        busy={busy}
        onAction={onAction}
      />
      {focused && (
        <div className="tycoon-machine-focus">{machineCard(focused)}</div>
      )}
      {modules(f) > 0 && (
        <section className="tycoon-speed">
          <Gauge size={26} />
          <div>
            <h3>More passive Compute</h3>
            <p>
              {f.computeBoost >= 5 ? (
                'Your whole data center is at top speed.'
              ) : (
                <>
                  {rate} <ArrowRight size={14} />{' '}
                  <strong>{rate + boostGain(f)} Compute / min</strong>
                </>
              )}
            </p>
          </div>
          <Button
            className="primary-action"
            disabled={
              busy ||
              loans.length > 0 ||
              runningClients.length > 0 ||
              f.computeBoost >= 5 ||
              balance < boostCost
            }
            onClick={() => void onAction({ type: 'compute-upgrade' })}
          >
            {f.computeBoost >= 5 ? (
              <>
                <Check size={17} /> Max speed
              </>
            ) : (
              <>
                <ComputeIcon size={24} />
                {boostCost} · Upgrade
              </>
            )}
          </Button>
          {(loans.length > 0 || runningClients.length > 0) && (
            <small>
              Speed upgrades resume when assigned machine runs finish.
            </small>
          )}
          <small>
            Improves idle production. Client processing time stays the same.
          </small>
        </section>
      )}
      <div className="tycoon-machine-grid">
        {plots.filter((o) => o.id !== focused?.id).map(machineCard)}
      </div>
      <button className="tycoon-expand-link" onClick={onExpand}>
        <Lock size={20} />
        <span>
          <strong>Make room for more</strong>
          <small>Open a new room with Compute.</small>
        </span>
        <ArrowRight size={22} />
      </button>
      {modules(f) > 0 && (
        <button className="tycoon-extra-link" onClick={onExtra}>
          <Sparkles size={20} /> A little extra <span>Try a bonus boost</span>
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
