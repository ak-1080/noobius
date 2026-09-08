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
  type Facility,
  type FacilityAction,
} from '@/lib/facility';
import ComputeIcon from './ComputeIcon';

export default function TycoonBuildPanel({
  facility: f,
  balance,
  busy,
  selected,
  onAction,
  onExpand,
}: {
  facility: Facility;
  balance: number;
  busy: boolean;
  selected?: string;
  onAction: (a: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onExpand: () => void;
}) {
  const rate = computePerTick(f) * 4;
  const plots = OBJECTS.filter(
    (o) =>
      o.kind === 'build' &&
      f.unlocked.includes(o.zone) &&
      (modules(f) > 0 || o.id === 'rack-a'),
  );
  const boostCost = BOOST_PRICES[f.computeBoost];
  return (
    <div className="tycoon-build">
      <div className="tycoon-wallet">
        <ComputeIcon size={40} />
        <strong>{balance.toLocaleString()}</strong>
        <span>Compute to spend</span>
      </div>
      <div className="tycoon-income">
        <span>Your machines earn</span>
        <strong>
          <ComputeIcon size={26} />
          {rate}
          <small>/ min</small>
        </strong>
      </div>
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
        {plots
          .sort((a, b) => Number(b.id === selected) - Number(a.id === selected))
          .map((o) => {
            const level = f.builds[o.id] ?? 0,
              cost = rackPrice(f, o.id),
              gain = machineGain(f, o.id);
            return (
              <section
                className={`tycoon-machine ${selected === o.id ? 'is-selected' : ''}`}
                key={o.id}
              >
                <div className="tycoon-machine-art">
                  <img
                    src="/assets/tutorial/tutorial-server.png"
                    alt="Server machine with glowing green lights"
                  />
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
                      Collect {cost - balance} more Compute.
                    </small>
                  )}
                </div>
              </section>
            );
          })}
      </div>
      <button className="tycoon-expand-link" onClick={onExpand}>
        <Lock size={20} />
        <span>
          <strong>Make room for more</strong>
          <small>Open a new room with Compute.</small>
        </span>
        <ArrowRight size={22} />
      </button>
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
  const earned = f.daily.computeEarned ?? 0,
    done = f.lastWorkday === f.day;
  return (
    <div className="tycoon-goals">
      <img
        className="tycoon-goal-art"
        src="/assets/compute-currency.png"
        alt="Compute coin"
      />
      <span className="story-eyebrow">TODAY’S LITTLE WIN</span>
      <h2>Collect 100 Compute.</h2>
      <p>Your machines make it. You pick it up.</p>
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
        Complete the goal on 3 different days to unlock the gold outfit. Your
        days don’t need to be in a row.
      </p>
      <button className="text-action" onClick={onFollow}>
        Back to my next step <ArrowRight size={17} />
      </button>
    </div>
  );
}
