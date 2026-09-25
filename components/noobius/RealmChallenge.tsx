'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  Database,
  Link2,
  RotateCw,
  ShieldAlert,
  Thermometer,
  Unplug,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import styles from './WorkPanels.module.css';
import {
  pipePath,
  solveRealmChallenge,
  type RealmChallenge as Challenge,
} from '@/lib/realm-challenges';
export default function RealmChallenge({
  challenge: c,
  busy,
  onAnswer,
}: {
  challenge: Challenge;
  busy: boolean;
  onAnswer: (answer: number[]) => Promise<unknown>;
}) {
  const [answer, setAnswer] = useState<number[]>(
    c.kind === 'pipes'
      ? c.rotations
      : Array(c.kind === 'restore' ? 1 : 4).fill(-1),
  );
  const [checked, setChecked] = useState(false);
  const choose = (index: number, value: number) => {
    setChecked(false);
    setAnswer((a) => a.map((n, i) => (i === index ? value : n)));
  };
  const flow = c.kind === 'pipes' ? pipePath(c.tiles, answer) : null;
  return (
    <section className={`realm-challenge ${styles.challenge}`}>
      <h3>
        {
          {
            sorting: 'Sort the shipment',
            pipes: 'Connect the coolant',
            scheduler: 'Assign the jobs',
            restore: 'Choose a safe snapshot',
          }[c.kind]
        }
      </h3>
      <ul className={styles.rules} aria-label="Task rules">
        {c.kind === 'sorting' && (
          <>
            <li>
              <Link2 aria-hidden="true" />
              <span>
                <strong>Reuse</strong>
                <small>Link OK · under 70°</small>
              </span>
            </li>
            <li>
              <Unplug aria-hidden="true" />
              <span>
                <strong>Strip</strong>
                <small>No link · under 70°</small>
              </span>
            </li>
            <li>
              <ShieldAlert aria-hidden="true" />
              <span>
                <strong>Quarantine</strong>
                <small>70° or hotter · any link</small>
              </span>
            </li>
          </>
        )}
        {c.kind === 'pipes' && (
          <>
            <li>
              <RotateCw aria-hidden="true" />
              <span>
                <strong>Tap to rotate</strong>
                <small>One quarter-turn per tap</small>
              </span>
            </li>
            <li>
              <ArrowRight aria-hidden="true" />
              <span>
                <strong>Inlet → outlet</strong>
                <small>Left edge → lower-right tile’s right edge</small>
              </span>
            </li>
            <li>
              <Check aria-hidden="true" />
              <span>
                <strong>Follow the flow</strong>
                <small>Cyan pipes carry coolant</small>
              </span>
            </li>
          </>
        )}
        {c.kind === 'scheduler' && (
          <>
            <li>
              <Zap aria-hidden="true" />
              <span>
                <strong>Live → Instant</strong>
                <small>Live jobs cannot wait</small>
              </span>
            </li>
            <li>
              <Clock3 aria-hidden="true" />
              <span>
                <strong>Can wait → either lane</strong>
                <small>Use spare capacity</small>
              </span>
            </li>
            <li>
              <Check aria-hidden="true" />
              <span>
                <strong>Fit every job</strong>
                <small>Stay within both lane limits</small>
              </span>
            </li>
          </>
        )}
        {c.kind === 'restore' && (
          <>
            <li>
              <Database aria-hidden="true" />
              <span>
                <strong>Model {c.model}</strong>
                <small>Exact match required</small>
              </span>
            </li>
            <li>
              <Check aria-hidden="true" />
              <span>
                <strong>Complete copy</strong>
                <small>Skip interrupted uploads</small>
              </span>
            </li>
            <li>
              <Clock3 aria-hidden="true" />
              <span>
                <strong>Newest valid time</strong>
                <small>Choose the latest safe copy</small>
              </span>
            </li>
          </>
        )}
      </ul>
      {c.kind === 'sorting' && (
        <div className="challenge-cards">
          {c.shipment.map((part, i) => (
            <article key={i}>
              <strong>{part.name}</strong>
              <span>
                <Thermometer size={15} aria-hidden="true" /> {part.heat}°
                {part.link ? (
                  <Link2 size={15} aria-hidden="true" />
                ) : (
                  <Unplug size={15} aria-hidden="true" />
                )}
                {part.link ? 'Link OK' : 'No link'}
              </span>
              <div>
                {['Reuse', 'Strip', 'Quarantine'].map((name, n) => (
                  <button
                    key={name}
                    type="button"
                    disabled={busy}
                    aria-pressed={answer[i] === n}
                    onClick={() => choose(i, n)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {c.kind === 'pipes' && (
        <div className="pipe-board" aria-label="Cooling circuit">
          <span>IN →</span>
          <div>
            {c.tiles.map((tile, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                aria-label={`Pipe ${i + 1}, rotation ${answer[i]}. Rotate clockwise`}
                className={flow?.reached.includes(i) ? 'flowing' : ''}
                onClick={() => choose(i, (answer[i] + 1) % 4)}
              >
                <svg
                  viewBox="0 0 100 100"
                  style={{ transform: `rotate(${answer[i] * 90}deg)` }}
                  aria-hidden="true"
                >
                  <path
                    d={tile === 'straight' ? 'M0 50 H100' : 'M50 0 V50 H100'}
                  />
                </svg>
              </button>
            ))}
          </div>
          <span>→ OUT</span>
        </div>
      )}
      {c.kind === 'scheduler' && (
        <>
          <div className="scheduler-capacity">
            {c.capacity.map((cap, lane) => {
              const used = c.jobs.reduce(
                (sum, j, i) => sum + (answer[i] === lane ? j.slots : 0),
                0,
              );
              return (
                <div key={lane} className={styles.lane} data-over={used > cap}>
                  <strong>
                    {lane === 0 ? 'Instant' : 'Flexible'}{' '}
                    <span>
                      {used}/{cap} slots
                    </span>
                  </strong>
                  <progress
                    value={Math.min(used, cap)}
                    max={cap}
                    aria-label={`${lane === 0 ? 'Instant' : 'Flexible'} capacity: ${used} of ${cap} slots`}
                  />
                  {used > cap && <small>{used - cap} over capacity</small>}
                </div>
              );
            })}
          </div>
          <div className="challenge-cards">
            {c.jobs.map((j, i) => (
              <article key={i}>
                <strong>{j.name}</strong>
                <span>
                  {j.latency ? (
                    <Zap size={15} aria-hidden="true" />
                  ) : (
                    <Clock3 size={15} aria-hidden="true" />
                  )}
                  {j.slots} {j.slots === 1 ? 'slot' : 'slots'} ·{' '}
                  {j.latency ? 'Live → Instant' : 'Can wait'}
                </span>
                <div>
                  {['Instant', 'Flexible'].map((name, n) => (
                    <button
                      key={name}
                      type="button"
                      disabled={busy}
                      aria-pressed={answer[i] === n}
                      onClick={() => choose(i, n)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {c.kind === 'restore' && (
        <div className="snapshot-cards">
          {c.snapshots.map((s, i) => (
            <button
              key={i}
              type="button"
              disabled={busy}
              aria-pressed={answer[0] === i}
              onClick={() => choose(0, i)}
            >
              <strong>{s.name}</strong>
              <span>
                <Clock3 size={15} aria-hidden="true" /> 00:
                {String(s.minute).padStart(2, '0')}
              </span>
              <span>
                <Database size={15} aria-hidden="true" /> {s.model}
              </span>
              <small
                className={s.complete ? styles.complete : styles.incomplete}
              >
                {s.complete ? (
                  <Check size={15} aria-hidden="true" />
                ) : (
                  <ShieldAlert size={15} aria-hidden="true" />
                )}
                {s.complete ? 'Complete copy' : 'Upload interrupted'}
              </small>
            </button>
          ))}
        </div>
      )}
      {checked && (
        <output>
          Adjust your choices and try again. No extra supplies used.
        </output>
      )}
      <div className={styles.taskStatus}>
        <span>
          {c.kind === 'pipes'
            ? flow?.success
              ? 'Outlet reached'
              : 'Connect the inlet to the outlet'
            : c.kind === 'restore'
              ? answer[0] < 0
                ? 'Choose one snapshot'
                : 'Snapshot selected'
              : `${answer.filter((n) => n >= 0).length}/${answer.length} ${c.kind === 'sorting' ? 'parts sorted' : 'jobs assigned'}`}
        </span>
        <small>Retries use no extra supplies</small>
      </div>
      <Button
        className="primary-action"
        disabled={busy || answer.some((n) => n < 0)}
        onClick={async () => {
          const applied = await onAnswer(answer);
          setChecked(!!applied && !solveRealmChallenge(c, answer));
        }}
      >
        {busy ? 'Checking…' : 'Check my plan'}
      </Button>
    </section>
  );
}
