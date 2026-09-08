import { ArrowRight, Hammer, Navigation, Sparkles, X } from 'lucide-react';
import type { NextStep, Objective } from '@/lib/objectives';
import ComputeIcon from './ComputeIcon';

export default function ObjectiveCoach({
  objective,
  following,
  busy,
  onFollow,
  onStop,
}: {
  objective: Objective;
  following: NextStep | null;
  busy: boolean;
  onFollow: () => void;
  onStop: () => void;
}) {
  const step = following ?? objective;
  const collecting = ['compute-harvest', 'compute-collect'].includes(
    step.action?.type ?? '',
  );
  const Icon = following
    ? Navigation
    : collecting
      ? ComputeIcon
      : step.action?.type === 'build' || step.panel === 'facility'
        ? Hammer
        : step.action?.type === 'compute-upgrade'
          ? Sparkles
          : Navigation;
  const action = busy ? 'Working…' : following ? 'Stop walking' : step.cta;

  return (
    <button
      className={`objective-hud next-action ${following ? 'is-guiding' : ''}`}
      onClick={following ? onStop : onFollow}
      disabled={busy}
      aria-label={`${step.title}. ${action}`}
    >
      <span className="next-action-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="next-action-copy">
        <small>{following ? 'On our way' : 'Next up'}</small>
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
        <i style={{ width: `${following ? 100 : objective.progress}%` }} />
      </i>
    </button>
  );
}
