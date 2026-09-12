'use client';
import { ArrowRight, Check, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  SHIFT_GOALS,
  personalGoalProgress,
  personalGoalObjective,
} from '@/lib/personal-goals';
import type { Facility } from '@/lib/facility';
import type { NextStep } from '@/lib/objectives';
import type { PersonalGoalsController } from './usePersonalGoals';

const labels = {
  service: 'Repairs',
  supply: 'Parts orders',
  workload: 'Computing jobs',
};
export default function PersonalGoals({
  controller,
  facility,
  onPlan,
  compact = false,
}: {
  controller: PersonalGoalsController;
  facility: Facility;
  onPlan: (step: NextStep) => void;
  compact?: boolean;
}) {
  const { goal, ready, choose, clear, sessionOnly } = controller;
  const progress = goal ? personalGoalProgress(facility, goal) : null;
  const spec = SHIFT_GOALS.find((g) => g.id === goal?.id);
  if (compact)
    return goal && progress && spec ? (
      <button
        className={`shift-goal-mini ${progress.complete ? 'is-complete' : ''}`}
        onClick={() =>
          onPlan({
            ...personalGoalObjective(facility, goal),
            view: { jobsTab: 'progress' },
          })
        }
      >
        {progress.complete ? <Check size={16} /> : <Flag size={16} />}
        <span>
          {progress.reset
            ? 'Start a fresh shift goal'
            : progress.complete
              ? 'Shift goal complete!'
              : spec.title}
        </span>
        <strong>{progress.done}/3</strong>
        <ArrowRight size={15} />
      </button>
    ) : null;
  return (
    <section className="personal-goals">
      <div className="job-section-heading">
        <h3>Your shift, your goal</h3>
        <Flag size={20} />
      </div>
      <p>
        Pick a focus. Only jobs finished and collected after you start count. No
        timer. Change your mind anytime.
      </p>
      {goal && progress && spec && (
        <div
          className={`personal-goal-active ${progress.complete ? 'is-complete' : ''}`}
        >
          <strong>
            {progress.complete ? '✓ ' : ''}
            {spec.title}
          </strong>
          <p>
            {progress.reset
              ? 'Your saved progress changed. Restart this goal to use your current save.'
              : spec.detail}
          </p>
          <Progress
            value={(progress.done / 3) * 100}
            aria-label={`${spec.title}: ${progress.done} of 3 jobs collected`}
          />
          <div className="shift-goal-steps">
            {progress.steps.map((step) => (
              <span
                key={step.family}
                className={step.done === step.target ? 'done' : ''}
              >
                {step.done === step.target && <Check size={14} />}
                {labels[step.family]} {step.done}/{step.target}
              </span>
            ))}
          </div>
          <div className="job-actions">
            {progress.complete || progress.reset ? (
              <Button
                className="primary-action"
                onClick={() => choose(goal.id)}
              >
                {progress.reset ? 'Restart goal' : 'Play another shift'}
              </Button>
            ) : (
              <Button
                className="primary-action"
                onClick={() => onPlan(personalGoalObjective(facility, goal))}
              >
                Find a job <ArrowRight size={16} />
              </Button>
            )}
            <button className="text-action" onClick={clear}>
              Unpin goal
            </button>
          </div>
        </div>
      )}
      <div className="shift-goal-options">
        {SHIFT_GOALS.filter((g) => g.id !== goal?.id).map((g) => (
          <button key={g.id} disabled={!ready} onClick={() => choose(g.id)}>
            <strong>{g.title}</strong>
            <span>{g.detail}</span>
            <small>
              {goal ? 'Switch goal' : 'Start this goal'}{' '}
              <ArrowRight size={14} />
            </small>
          </button>
        ))}
      </div>
      <small className="muted-small">
        Job payments and reports are earned as usual. This journal adds no bonus
        currency.{' '}
        {sessionOnly
          ? 'Saved for this session only.'
          : 'Goal saved in this browser.'}
      </small>
    </section>
  );
}
