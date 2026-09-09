'use client';
import { useState } from 'react';
import {
  ChevronDown,
  MessageCircle,
  Users,
  Hand,
  Wrench,
  Package,
  Sparkles,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { NEIGHBORHOOD_CAPACITY, type Neighbor } from '@/lib/neighborhoods';
import { PING_LABELS, type CrewPing } from '@/lib/social';
import type { VisibleCrewSignal } from '@/lib/crew-signals';

const ICONS = { wave: Hand, project: Wrench, parts: Package, thanks: Sparkles };
export default function CrewWidget({
  neighbors,
  self,
  scene,
  signals,
  ready,
  busy,
  guest,
  now,
  onPing,
  onChat,
  onCrew,
  onProject,
  onTrade,
}: {
  neighbors: Neighbor[];
  self: string;
  scene: string;
  signals: VisibleCrewSignal[];
  ready: boolean;
  busy: boolean;
  guest: boolean;
  now: number;
  onPing: (ping: CrewPing) => Promise<unknown>;
  onChat: () => void;
  onCrew: () => void;
  onProject: () => void;
  onTrade: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const newest = signals.find(
    (s) =>
      s.author !== self && neighbors.some((n) => n.id === s.author && n.online),
  );
  const send = async (ping: CrewPing) => {
    if (!ready || busy || sending || now - sentAt < 5000) return;
    setSending(true);
    try {
      if (await onPing(ping)) setSentAt(Date.now());
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="crew-widget">
      {newest && (
        <button
          className="crew-signal-notice"
          onClick={() => setOpen(true)}
          aria-label={`Crew signal from ${newest.name}: ${PING_LABELS[newest.ping]}`}
        >
          <span>{newest.name}</span>
          <strong>{PING_LABELS[newest.ping]}</strong>
        </button>
      )}
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="crew-widget-toggle">
          <Users size={17} />
          <span>
            {guest
              ? 'Play with a crew'
              : `Crew · ${neighbors.length}/${NEIGHBORHOOD_CAPACITY}`}
          </span>
          <ChevronDown size={16} />
        </CollapsibleTrigger>
        <CollapsibleContent className="crew-widget-body">
          <div className="crew-widget-heading">
            <strong>Your neighborhood</strong>
            <button onClick={onCrew}>{guest ? 'Connect' : 'Find crew'}</button>
          </div>
          {guest ? (
            <p>Connect a wallet to join a crew. Your own center stays yours.</p>
          ) : (
            <>
              {!ready && <output>Reconnecting to your crew…</output>}
              <ul aria-label="Neighborhood players">
                {neighbors.map((n) => {
                  const signal = signals.find((s) => s.author === n.id);
                  const location = !n.online
                    ? 'Reconnecting'
                    : n.scene === scene
                      ? 'Here with you'
                      : n.scene === 'commons'
                        ? 'In the plaza'
                        : n.scene === 'home-' + n.id
                          ? 'At their center'
                          : 'Visiting a center';
                  return (
                    <li key={n.id}>
                      <span
                        className={`crew-status-dot ${n.online ? 'online' : ''}`}
                      />
                      <div>
                        <strong>
                          {n.name}
                          {n.id === self ? ' (you)' : ''}
                        </strong>
                        <small>
                          {n.id === self ? 'Your shift' : location} · Lv{' '}
                          {n.level}
                        </small>
                        {signal && n.online && (
                          <span className="crew-inline-signal">
                            {PING_LABELS[signal.ping]}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {neighbors.length <= 1 && (
                <p>
                  Quiet shift? Keep building, or use Find crew to join a friend.
                </p>
              )}
              <div
                className="crew-widget-pings"
                aria-label="Send a crew signal"
              >
                {(Object.keys(ICONS) as CrewPing[]).map((ping) => {
                  const Icon = ICONS[ping];
                  return (
                    <Button
                      key={ping}
                      variant="outline"
                      disabled={
                        !ready || busy || sending || now - sentAt < 5000
                      }
                      onClick={() => void send(ping)}
                    >
                      <Icon size={16} />
                      {PING_LABELS[ping]}
                    </Button>
                  );
                })}
              </div>
              {newest?.ping === 'project' && (
                <Button className="crew-request-action" onClick={onProject}>
                  Open crew project
                </Button>
              )}
              {newest?.ping === 'parts' && (
                <Button className="crew-request-action" onClick={onTrade}>
                  Open parts market
                </Button>
              )}
            </>
          )}
          <button className="crew-widget-chat" onClick={onChat}>
            <MessageCircle size={16} />
            Chat & player controls
          </button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
