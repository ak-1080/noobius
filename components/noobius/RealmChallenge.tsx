'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
    <section className="realm-challenge">
      <h3>
        {
          {
            sorting: 'Nothing useful goes to waste.',
            pipes: 'Build a path for the coolant.',
            scheduler: 'Two queues. One limited budget.',
            restore: 'Newer is not always safer.',
          }[c.kind]
        }
      </h3>
      <p>
        {
          {
            sorting:
              'Working link + under 70° → Reuse. No link + under 70° → Strip. Anything 70° or hotter → Quarantine.',
            pipes:
              'Tap a tile to rotate it. Connect the inlet on the left to the outlet on the bottom right. Cyan shows how far coolant reaches.',
            scheduler:
              'Live requests must use the instant lane. Fit every job without exceeding either lane’s capacity.',
            restore: `Restore the newest complete snapshot for model ${c.kind === 'restore' ? c.model : ''}. Incomplete and different-model snapshots cannot be used.`,
          }[c.kind]
        }
      </p>
      {c.kind === 'sorting' && (
        <div className="challenge-cards">
          {c.shipment.map((part, i) => (
            <article key={i}>
              <strong>{part.name}</strong>
              <span>
                {part.heat}° · {part.link ? 'Link OK' : 'No link'}
              </span>
              <div>
                {['Reuse', 'Strip', 'Quarantine'].map((name, n) => (
                  <button
                    key={name}
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
                <strong key={lane} className={used > cap ? 'over' : ''}>
                  {lane === 0 ? 'Instant' : 'Flexible'} · {used}/{cap}
                </strong>
              );
            })}
          </div>
          <div className="challenge-cards">
            {c.jobs.map((j, i) => (
              <article key={i}>
                <strong>{j.name}</strong>
                <span>
                  {j.slots} slots · {j.latency ? 'Live request' : 'Can wait'}
                </span>
                <div>
                  {['Instant', 'Flexible'].map((name, n) => (
                    <button
                      key={name}
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
              aria-pressed={answer[0] === i}
              onClick={() => choose(0, i)}
            >
              <strong>{s.name}</strong>
              <span>
                00:{s.minute} · {s.model}
              </span>
              <small>
                {s.complete ? 'Complete copy' : 'Upload interrupted'}
              </small>
            </button>
          ))}
        </div>
      )}
      {checked && (
        <output>
          Check the rule above and adjust your plan. Retrying uses no extra
          supplies.
        </output>
      )}
      <Button
        className="primary-action"
        disabled={busy || answer.some((n) => n < 0)}
        onClick={async () => {
          const applied = await onAnswer(answer);
          setChecked(!!applied && !solveRealmChallenge(c, answer));
        }}
      >
        Run the plan
      </Button>
    </section>
  );
}
