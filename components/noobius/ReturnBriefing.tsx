'use client';
import { ArrowRight, Check, Clock3, Hammer, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ComputeIcon from './ComputeIcon';
import type { ReturnWork, returnSummary } from '@/lib/game-feedback';
import type { Objective } from '@/lib/objectives';

export default function ReturnBriefing({
  summary,
  stored,
  busy,
  suggestion,
  onReview,
  onSuggest,
  onCollect,
  onDaily,
  onDismiss,
  atHome,
}: {
  summary: ReturnType<typeof returnSummary>;
  stored: number;
  busy: boolean;
  suggestion?: Objective;
  onReview: (work: ReturnWork) => void;
  onSuggest: (suggestion: Objective) => void;
  onCollect: () => void;
  onDaily: () => void;
  onDismiss: () => void;
  atHome: boolean;
}) {
  const work = summary?.work ?? [];
  const row = (item: ReturnWork) => (
    <button
      className="return-work-row"
      key={item.id}
      disabled={busy}
      onClick={() => onReview(item)}
    >
      <span className={`return-work-icon is-${item.phase}`} aria-hidden="true">
        {item.phase === 'ready' ? (
          <Check size={20} />
        ) : item.phase === 'running' ? (
          <Clock3 size={20} />
        ) : (
          <Hammer size={20} />
        )}
      </span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.detail}</small>
      </span>
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
  return (
    <div className="return-briefing">
      <p className="return-intro">Here’s where you left off.</p>
      {work.length > 0 && (
        <div className="return-work" aria-label="Your saved work">
          {work.slice(0, 3).map(row)}
          {work.length > 3 && (
            <details className="return-more">
              <summary>
                {work.length - 3} more update{work.length - 3 === 1 ? '' : 's'}
              </summary>
              {work.slice(3).map(row)}
            </details>
          )}
        </div>
      )}
      {stored > 0 && (
        <div className="return-production">
          <ComputeIcon size={42} />
          <div>
            <strong>{stored.toLocaleString()} Compute</strong>
            <span>
              {summary?.full
                ? 'Storage full · collect to make room'
                : 'Stored by your machines'}
            </span>
          </div>
          <Button disabled={busy} onClick={onCollect}>
            {atHome ? 'Collect Compute' : 'Go home to collect'}
          </Button>
        </div>
      )}
      {summary?.dailyReady && (
        <button className="text-action" disabled={busy} onClick={onDaily}>
          Collect daily bonus <Trophy size={18} />
        </button>
      )}
      {suggestion && (
        <div className="return-next">
          <small>{work.length ? 'AFTER THAT' : 'YOUR NEXT MOVE'}</small>
          <strong>{suggestion.title}</strong>
          <p>{suggestion.detail}</p>
          <button
            className="text-action"
            disabled={busy}
            onClick={() => onSuggest(suggestion)}
          >
            {suggestion.cta} <ArrowRight size={18} />
          </button>
        </div>
      )}
      <Button className="primary-action" onClick={onDismiss}>
        Back to the floor <ArrowRight size={20} />
      </Button>
    </div>
  );
}
