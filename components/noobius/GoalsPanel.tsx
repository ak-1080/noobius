'use client';
import {
  ArrowRight,
  Check,
  DoorOpen,
  Gauge,
  Gift,
  Hammer,
  Map,
  Server,
  Shirt,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dayKey, type Facility, type FacilityAction } from '@/lib/facility';
import { growthProgress } from '@/lib/growth';
import { dailyRewardReady } from '@/lib/game-feedback';
import ComputeIcon from './ComputeIcon';
import ComputeCollection from './ComputeCollection';

const milestoneIcons = [Hammer, Gauge, Server, DoorOpen, Map, Trophy];
export default function GoalsPanel({
  facility: f,
  now,
  busy,
  onAction,
  onBuild,
  onGold,
  onLocker,
}: {
  facility: Facility;
  now: number;
  busy: boolean;
  onAction: (a: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onBuild: () => void;
  onGold: () => void;
  onLocker: () => void;
}) {
  const progress = growthProgress(f);
  const today = dayKey(now);
  const earned = f.day === today ? (f.daily.computeEarned ?? 0) : 0;
  const done = f.lastWorkday === today;
  const ready = dailyRewardReady(f, now);
  const goldOwned = f.owned.includes('afterhours');
  return (
    <Tabs className="goals-panel" defaultValue={ready ? 'daily' : 'growth'}>
      <TabsList className="goals-tabs" aria-label="Choose goals view">
        <TabsTrigger value="growth">
          <Trophy size={17} />
          Your progress
        </TabsTrigger>
        <TabsTrigger value="daily">
          <Gift size={17} />
          Daily bonus
          {ready && (
            <span className="goal-ready-dot" aria-label="Reward ready" />
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="growth" className="growth-content">
        <div
          className={`growth-hero ${progress.complete ? 'is-complete' : ''}`}
        >
          <span className="growth-hero-icon" aria-hidden="true">
            {progress.complete ? <Trophy size={39} /> : <Server size={37} />}
          </span>
          <div>
            <small>
              {progress.complete
                ? 'YOU BUILT THIS'
                : 'ONE LITTLE NOOB. BIG PLANS.'}
            </small>
            <h2>
              {progress.complete
                ? 'All systems go.'
                : 'Look how far you’ve come.'}
            </h2>
            <p>
              {progress.complete
                ? 'Every room. Every upgrade. Your data center is complete.'
                : `${progress.completed} of ${progress.milestones.length} milestones complete.`}
            </p>
          </div>
        </div>
        <div className="growth-stats">
          <span>
            <Server size={19} />
            <strong>
              {progress.machines}/{progress.machineTotal}
            </strong>{' '}
            machines
          </span>
          <span>
            <DoorOpen size={19} />
            <strong>
              {progress.rooms}/{progress.roomTotal}
            </strong>{' '}
            rooms
          </span>
          <span>
            <ComputeIcon size={23} />
            <strong>{progress.rate.toLocaleString()}</strong> / min
          </span>
        </div>
        <ol className="growth-trail" aria-label="Data center milestones">
          {progress.milestones.map((m, i) => {
            if (m.done) return null;
            const Icon = milestoneIcons[i];
            return (
              <li
                key={m.id}
                className={`${m.done ? 'is-done' : ''} ${progress.current === m.id ? 'is-current' : ''}`}
                aria-current={progress.current === m.id ? 'step' : undefined}
              >
                <span className="growth-step-icon" aria-hidden="true">
                  {m.done ? <Check size={21} /> : <Icon size={21} />}
                </span>
                <div>
                  <h3>
                    {m.title}
                    {m.done && <span className="sr-only"> · Complete</span>}
                  </h3>
                  <p>{m.detail}</p>
                  {m.id === 'complete' && !m.done && (
                    <small>
                      {progress.levels}/{progress.levelTotal} machine levels ·{' '}
                      {progress.speed}/{progress.speedTotal} speed upgrades
                    </small>
                  )}
                </div>
                {progress.current === m.id && (
                  <small className="growth-next-label">NEXT</small>
                )}
              </li>
            );
          })}
        </ol>
        <Button
          className="primary-action growth-continue"
          disabled={busy}
          onClick={progress.complete ? onLocker : onBuild}
        >
          {progress.complete ? 'Make Noobius yours' : 'Keep building'}
          <ArrowRight size={18} />
        </Button>
        {progress.completed > 0 && (
          <details className="growth-completed">
            <summary>
              <Check size={16} />
              {progress.completed} completed milestones
            </summary>
            <ul>
              {progress.milestones
                .filter((m) => m.done)
                .map((m) => (
                  <li key={m.id}>
                    <Check size={17} />
                    {m.title}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </TabsContent>
      <TabsContent value="daily" className="daily-content">
        <section className="daily-goal-card">
          <img src="/assets/compute-currency.png" alt="Compute coin" />
          <span className="story-eyebrow">TODAY’S LITTLE WIN</span>
          <h2>
            {done
              ? 'Nice work, noob.'
              : ready
                ? 'Your bonus is ready!'
                : 'Collect 100 Compute.'}
          </h2>
          <p>
            {done
              ? 'Another 35 Compute bonus tomorrow.'
              : ready
                ? 'You earned it. Pick up 35 extra Compute.'
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
          {(ready || done) && (
            <Button
              className="primary-action"
              disabled={busy || done}
              onClick={() => void onAction({ type: 'tycoon-daily' })}
            >
              {done ? (
                <>
                  <Check size={18} />
                  Reward collected
                </>
              ) : (
                <>
                  <ComputeIcon size={27} />
                  Collect your 35 bonus
                </>
              )}
            </Button>
          )}
          {!done &&
            !ready &&
            (progress.machines > 0 ? (
              <ComputeCollection
                facility={f}
                now={now}
                busy={busy}
                onAction={onAction}
              />
            ) : (
              <Button
                className="primary-action"
                disabled={busy}
                onClick={onBuild}
              >
                Build your free machine
                <ArrowRight size={18} />
              </Button>
            ))}
        </section>
        <section className={`gold-reward ${goldOwned ? 'is-owned' : ''}`}>
          <div className="gold-reward-art" aria-hidden="true">
            <Shirt size={69} strokeWidth={1.25} />
            <span>3 DAYS</span>
          </div>
          <div>
            <small>YOUR DAILY REWARD</small>
            <h3>After-hours gold</h3>
            <p>
              {goldOwned
                ? 'Yours to wear. Your daily Compute bonus keeps coming.'
                : `Finish on ${Math.max(0, 3 - f.workdays)} more ${3 - f.workdays === 1 ? 'day' : 'days'} to earn this outfit.`}
            </p>
          </div>
          <div
            className="tycoon-stamps"
            aria-label={`${Math.min(f.workdays, 3)} of 3 days completed`}
          >
            {[1, 2, 3].map((i) => (
              <span key={i} className={f.workdays >= i ? 'done' : ''}>
                {f.workdays >= i ? <Check size={18} /> : i}
              </span>
            ))}
          </div>
          <button className="outline-button" disabled={busy} onClick={onGold}>
            {goldOwned ? 'Try on your gold outfit' : 'Preview gold outfit'}
            <ArrowRight size={17} />
          </button>
          {!goldOwned && (
            <p className="gold-no-streak">
              No streak to lose. Your days don’t need to be in a row.
            </p>
          )}
        </section>
      </TabsContent>
    </Tabs>
  );
}
