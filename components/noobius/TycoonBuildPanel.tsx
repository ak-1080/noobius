'use client';
import { ArrowRight, Check, Gauge, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BOOST_PRICES,
  OBJECTS,
  ZONES,
  computePerTick,
  machineGain,
  productionUnits,
  modules,
  rackPrice,
  dayKey,
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
}: {
  facility: Facility;
  balance: number;
  busy: boolean;
  now: number;
  selected?: string;
  onAction: (a: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onExpand: () => void;
  onExtra: () => void;
}) {
  const rate = computePerTick(f) * 4;
  const plots = OBJECTS.filter(
    (o) =>
      o.kind === 'build' &&
      f.unlocked.includes(o.zone) &&
      (modules(f) > 0 || o.id === 'rack-a'),
  );
  const boostCost = BOOST_PRICES[f.computeBoost];
  const machineCard = (o: (typeof plots)[number]) => {
    const level = f.builds[o.id] ?? 0;
    const cost = rackPrice(f, o.id);
    const gain = machineGain(f, o.id);
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
          <Button
            className={cost === 0 ? 'primary-action' : 'outline-button'}
            disabled={busy || level >= 3 || balance < cost}
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
            <h3>Faster machines</h3>
            <p>
              {f.computeBoost >= 5 ? (
                'Your whole data center is at top speed.'
              ) : (
                <>
                  {rate} <ArrowRight size={14} />{' '}
                  <strong>
                    {rate + productionUnits(f) * 12} Compute / min
                  </strong>
                </>
              )}
            </p>
          </div>
          <Button
            className="primary-action"
            disabled={busy || f.computeBoost >= 5 || balance < boostCost}
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

export function TycoonGoals({
  facility: f,
  busy,
  onAction,
  onFollow,
}: {
  facility: Facility;
  busy: boolean;
  onAction: (a: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onFollow: () => void;
}) {
  const today = dayKey(Date.now());
  const earned = f.day === today ? (f.daily.computeEarned ?? 0) : 0,
    done = f.lastWorkday === today;
  return (
    <div className="tycoon-goals">
      <img
        className="tycoon-goal-art"
        src="/assets/compute-currency.png"
        alt="Compute coin"
      />
      <span className="story-eyebrow">TODAY’S LITTLE WIN</span>
      <h2>{done ? 'Today’s goal is done.' : 'Collect 100 Compute.'}</h2>
      <p>
        {done
          ? 'Your next daily goal arrives tomorrow.'
          : 'Your machines make it. You pick it up.'}
      </p>
      <div
        className="tycoon-goal-progress"
        role="progressbar"
        aria-label="Compute collected today"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, earned)}
      >
        <i style={{ width: `${Math.min(100, earned)}%` }} />
      </div>
      <strong>{Math.min(100, earned)} / 100</strong>
      <Button
        className="primary-action"
        disabled={busy || done || earned < 100}
        onClick={() => void onAction({ type: 'tycoon-daily' })}
      >
        {done ? (
          <>
            <Check size={18} /> Reward collected
          </>
        ) : (
          <>
            <ComputeIcon size={28} /> Collect your 35 bonus
          </>
        )}
      </Button>
      <div className="tycoon-stamps">
        {[1, 2, 3].map((i) => (
          <span key={i} className={f.workdays >= i ? 'done' : ''}>
            {f.workdays >= i ? <Check size={18} /> : i}
          </span>
        ))}
      </div>
      <p>
        {f.workdays >= 3
          ? 'Gold outfit unlocked! Find it in your Locker. Your daily Compute bonus keeps coming.'
          : 'Complete the goal on 3 different days to unlock the gold outfit. Your days don’t need to be in a row.'}
      </p>
      <button className="text-action" onClick={onFollow}>
        Back to my next step <ArrowRight size={17} />
      </button>
    </div>
  );
}
