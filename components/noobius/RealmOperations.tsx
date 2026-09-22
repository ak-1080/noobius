'use client';
import { useState } from 'react';
import { ArrowRight, Check, Clock, Package, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ITEMS,
  type Facility,
  type FacilityAction,
  type Bag,
} from '@/lib/facility';
import { realmFor, type RealmId } from '@/lib/realm-catalog';
import {
  FIELD_APPROACHES,
  fieldQuote,
  type FieldApproach,
} from '@/lib/realm-operations';
import { checkAnswer, EMPTY_EQUIPMENT } from '@/lib/game';
import Puzzle from './Puzzle';
import RealmChallenge from './RealmChallenge';
import { realmSites, fieldSite } from '@/lib/realm-worlds';
import ItemIcon from './ItemIcon';

function Parts({ items }: { items: Bag }) {
  return (
    <span className="parts-cost">
      {Object.entries(items).map(([id, n]) => (
        <span key={id}>
          <ItemIcon item={id as keyof Bag} size={18} />
          {n} {ITEMS[id as keyof Bag].name}
        </span>
      ))}
    </span>
  );
}
export default function RealmOperations({
  realm,
  facility,
  busy,
  now,
  onAction,
  onStorage,
  onParts,
  atStation,
  onWalk,
  initialSite,
}: {
  realm: RealmId;
  facility: Facility;
  busy: boolean;
  now: number;
  onAction: (action: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onStorage: () => void;
  onParts: (items: Bag) => void;
  atStation: (id: string) => boolean;
  onWalk: (id: string) => void;
  initialSite?: string;
}) {
  const [siteIndex, setSiteIndex] = useState(
    fieldSite(initialSite)?.index ?? 0,
  );
  const sites = realmSites(realm),
    site = sites[siteIndex];
  const [approach, setApproach] = useState<FieldApproach>('standard');
  const [abandon, setAbandon] = useState(false);
  const work = facility.fieldWork,
    run = work?.active,
    destination = realmFor(run?.realm ?? realm);
  const quote = fieldQuote(realm, approach, siteIndex),
    missing = Object.entries(quote.cost).some(
      ([k, n]) => (facility.inventory[k as keyof Bag] ?? 0) < n!,
    );
  const enough = facility.compute >= quote.compute;
  const ready =
    run?.readyAt !== null && run?.readyAt !== undefined && now >= run.readyAt;
  return (
    <div className="realm-operation-panel">
      <div
        className="realm-operation-heading"
        style={{ '--realm-color': destination.color } as React.CSSProperties}
      >
        <Radio size={26} />
        <div>
          <small>
            {destination.name} · {destination.specialist}
          </small>
          <h3>{destination.activity}</h3>
          <p>{destination.purpose}</p>
        </div>
      </div>
      {run ? (
        <>
          <ol className="field-steps" aria-label="Recovery progress">
            <li className="done">
              <Check size={16} />
              Prepare
            </li>
            <li className={run.state === 'diagnostics' ? 'current' : 'done'}>
              Diagnose
            </li>
            <li className={run.state === 'processing' ? 'current' : ''}>
              {ready ? 'Collect' : 'Recover'}
            </li>
          </ol>
          <div className="field-manifest">
            <strong>Already committed</strong>
            <span>
              {run.computeCost} Compute ·{' '}
              {FIELD_APPROACHES.find((a) => a.id === run.approach)?.name}
            </span>
            <Parts items={run.cost} />
            <strong>Recovery to Storage</strong>
            <Parts items={run.reward} />
            <span>
              +{run.xp} player XP · +{run.xp} {destination.skill} XP
            </span>
          </div>
          {run.state === 'processing' ? (
            <div className="field-result">
              {ready ? <Check size={30} /> : <Clock size={30} />}
              <h3>{ready ? 'Recovery is ready.' : 'Recovery is running.'}</h3>
              <p>
                {ready
                  ? 'Collect the parts into Storage. Your backpack can be full.'
                  : `${Math.max(1, Math.ceil((run.readyAt! - now) / 1000))} seconds left. You can return home and do another job.`}
              </p>
              <Button
                className="primary-action"
                disabled={busy || !ready}
                onClick={() =>
                  void onAction({ type: 'field-claim', id: run.id })
                }
              >
                {ready ? 'Collect recovery' : 'Processing…'}
                <Package size={18} />
              </Button>
            </div>
          ) : run.challenge ? (
            <RealmChallenge
              key={run.id}
              challenge={run.challenge}
              busy={busy || now < run.checkAt}
              onAnswer={(answer) =>
                onAction({ type: 'field-answer', id: run.id, answer })
              }
            />
          ) : (
            <Puzzle
              key={run.id}
              stationLabel={destination.destination}
              repeatable
              initialReveal
              job={{
                id: run.puzzle.type,
                puzzle: run.puzzle,
                status: 'active',
                attempts: run.attempts,
                startedAt: run.startedAt,
                score: 0,
                requestIds: [],
                hintUsed: false,
              }}
              equipment={{ ...EMPTY_EQUIPMENT, visor: true }}
              busy={busy || now < run.checkAt}
              onAnswer={async (answer) => {
                const applied = await onAction({
                  type: 'field-answer',
                  id: run.id,
                  realm: run.realm,
                  answer,
                });
                return applied ? checkAnswer(run.puzzle, answer) : undefined;
              }}
              onHint={async () => true}
              onClose={() => {}}
            />
          )}
          {run.state === 'diagnostics' && (
            <p className="field-terminal-note">
              Your terminal has the readings. You can finish this paid recovery
              from anywhere, even if realm access changes.
            </p>
          )}
          {run.state === 'diagnostics' && (
            <details className="field-abandon">
              <summary>Leave this recovery</summary>
              <p>
                Abandoning frees your field slot. The committed supplies and
                Compute are not refunded.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={abandon}
                  onChange={(e) => setAbandon(e.target.checked)}
                />{' '}
                I understand
              </label>
              <Button
                variant="outline"
                disabled={busy || !abandon}
                onClick={() =>
                  void onAction({ type: 'field-abandon', id: run.id })
                }
              >
                Abandon recovery
              </Button>
            </details>
          )}
        </>
      ) : (
        <>
          <p>
            Prepare supplies, solve the station, then collect useful parts. You
            can repeat a recovery or visit another realm.
          </p>
          <div className="realm-site-list">
            {sites.map((s) => (
              <button
                key={s.id}
                aria-pressed={siteIndex === s.index}
                onClick={() => setSiteIndex(s.index)}
              >
                <strong>{s.name}</strong>
                <span>{s.detail}</span>
                <small>{work?.sites?.[s.id] ?? 0} completed</small>
              </button>
            ))}
          </div>
          <fieldset className="field-approaches" aria-label="Recovery approach">
            {FIELD_APPROACHES.map((a) => {
              const q = fieldQuote(realm, a.id, siteIndex);
              return (
                <button
                  key={a.id}
                  aria-pressed={approach === a.id}
                  onClick={() => setApproach(a.id)}
                >
                  <strong>{a.name}</strong>
                  <span>
                    {q.compute} Compute · {q.seconds}s
                  </span>
                  <small>{a.detail}</small>
                </button>
              );
            })}
          </fieldset>
          <div className="field-manifest">
            <strong>You use</strong>
            <span>{quote.compute} Compute</span>
            <Parts items={quote.cost} />
            <strong>You recover</strong>
            <Parts items={quote.reward} />
            <span>
              +{quote.xp} player XP · +{quote.xp} {destination.skill} XP
            </span>
          </div>
          {!enough && (
            <output>
              You need {quote.compute - facility.compute} more Compute. Collect
              machine output or finish a job first.
            </output>
          )}
          {missing && (
            <Button variant="outline" onClick={() => onParts(quote.cost)}>
              Find the missing supplies
              <ArrowRight size={18} />
            </Button>
          )}
          {!atStation(site.id) ? (
            <Button className="primary-action" onClick={() => onWalk(site.id)}>
              Walk to {site.name}
              <ArrowRight size={18} />
            </Button>
          ) : (
            <Button
              className="primary-action"
              disabled={busy || missing || !enough}
              onClick={() =>
                void onAction({
                  type: 'field-start',
                  id: site.id,
                  realm,
                  direction: approach,
                })
              }
            >
              Start recovery · {quote.compute} Compute
              <ArrowRight size={18} />
            </Button>
          )}
          {(work?.completed[realm] ?? 0) > 0 && (
            <div className="field-record">
              <Check size={18} />
              <span>
                {work!.completed[realm]} recoveries · {work?.clean[realm] ?? 0}{' '}
                clean runs in {destination.name}
              </span>
            </div>
          )}
        </>
      )}
      {work?.last && !run && (
        <div className="field-last">
          <strong>Last recovery · {realmFor(work.last.realm).name}</strong>
          <Parts items={work.last.reward} />
          <Button variant="outline" onClick={onStorage}>
            Open Storage
            <Package size={18} />
          </Button>
        </div>
      )}
    </div>
  );
}
