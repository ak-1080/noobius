import {
  ArrowRight,
  Gift,
  Hammer,
  Navigation,
  Sparkles,
  X,
} from 'lucide-react';
import type { NextStep, Objective } from '@/lib/objectives';
import { guidanceFor } from '@/lib/guidance';
import ComputeIcon from './ComputeIcon';

export default function ObjectiveCoach({
  objective,
  following,
  arrived,
  busy,
  onFollow,
  onStop,
}: {
  objective: Objective;
  following: NextStep | null;
  arrived: NextStep | null;
  busy: boolean;
  onFollow: () => void;
  onStop: () => void;
}) {
  const step = following ?? arrived ?? objective;
  const collecting = ['compute-harvest', 'compute-collect'].includes(
    step.action?.type ?? '',
  );
  const Icon = following
    ? Navigation
    : collecting
      ? ComputeIcon
      : step.panel === 'contracts'
        ? Gift
        : step.action?.type === 'build' || step.panel === 'facility'
          ? Hammer
          : step.action?.type === 'compute-upgrade'
            ? Sparkles
            : Navigation;
  const action = busy
    ? 'Working…'
    : following
      ? 'Stop walking'
      : arrived
        ? arrived.cta
        : guidanceFor(step).cta;

  return (
    <button
      className={`objective-hud next-action ${following ? 'is-guiding' : ''}`}
      onClick={following || arrived ? onStop : onFollow}
      disabled={busy}
      aria-label={`${step.title}. ${action}`}
    >
      <span className="next-action-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="next-action-copy">
        <small>
          {following
            ? 'On our way'
            : arrived
              ? 'You’re here'
              : 'Your next move'}
        </small>
        <strong>{step.title}</strong>
        <span className="next-action-detail">
          {following ? 'Noobius is following the glowing path.' : step.detail}
        </span>
        <span className="next-action-cta">
          {action}
          {following ? <X size={14} /> : <ArrowRight size={15} />}
        </span>
      </span>
      <i className="objective-meter" aria-hidden="true">
        <i
          style={{
            width: `${following || arrived ? 100 : objective.progress}%`,
          }}
        />
      </i>
    </button>
  );
}
