'use client';
import { useState } from 'react';
import { MapPin, X, ChevronDown } from 'lucide-react';
import type { NextStep, Objective } from '@/lib/objectives';
import MargoPortrait from './MargoPortrait';

const destinations: Record<string, string> = {
  contracts: 'Clients → Repair & parts jobs',
  operations: 'Clients',
  facility: 'Center',
  crafting: 'Workshop',
  field: 'Crew → Fieldwork',
  world: 'Crew',
  map: 'Center → Rooms',
  appearance: 'Locker',
  inventory: 'Storage',
  project: 'Crew → Cluster project',
  compute: 'Center',
};
export default function ObjectiveCoach({
  objective,
  following,
  arrived,
  busy,
  highlighted = false,
  onFollow,
  onStop,
}: {
  objective: Objective;
  following: NextStep | null;
  arrived: NextStep | null;
  busy: boolean;
  highlighted?: boolean;
  onFollow: () => void;
  onStop: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const step = following ?? arrived ?? objective;
  const destination = destinations[step.panel ?? ''];
  return (
    <aside
      className={`objective-hud next-action margo-coach ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="Margo's guidance"
    >
      <button
        className="margo-portrait"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show Margo’s hint' : 'Hide Margo’s hint'}
      >
        <MargoPortrait />
      </button>
      {collapsed ? (
        <button className="margo-reopen" onClick={() => setCollapsed(false)}>
          Margo <ChevronDown size={14} />
        </button>
      ) : (
        <div className="margo-bubble">
          <div className="margo-heading">
            <span>
              MARGO <small>Shift supervisor</small>
            </span>
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Hide Margo’s hint"
            >
              <X size={14} />
            </button>
          </div>
          <strong>{step.title}</strong>
          {following ? (
            <p>Follow the path. Use the station when you arrive.</p>
          ) : arrived ? (
            <p>
              Use the station here. Press <kbd>E</kbd> or tap it.
            </p>
          ) : step.target ? (
            <p>
              Walk to the station. Press <kbd>E</kbd> or tap it.
            </p>
          ) : (
            <p>
              Choose your next move in <b>{destination ?? 'the game menu'}</b>.
            </p>
          )}
          {following || arrived ? (
            <button className="margo-location" onClick={onStop}>
              {following ? 'Stop walking' : 'Back to my goal'} <X size={13} />
            </button>
          ) : step.target ? (
            <button
              className="margo-location"
              onClick={onFollow}
              disabled={busy}
              aria-pressed={highlighted}
            >
              <MapPin size={14} />
              {highlighted ? 'Location marked' : 'Mark location'}
            </button>
          ) : null}
          <details className="margo-details">
            <summary>More help</summary>
            <p>{step.detail}</p>
          </details>
        </div>
      )}
    </aside>
  );
}
