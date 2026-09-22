'use client';
import { useState } from 'react';
import {
  Clock3,
  Cpu,
  Leaf,
  ShieldCheck,
  Trophy,
  ArrowRight,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ITEMS,
  type Bag,
  type Facility,
  type FacilityAction,
} from '@/lib/facility';
import { availableRacks } from '@/lib/contracts';
import {
  commissionOffers,
  commissionQuote,
  commissionsFor,
  milestoneProgress,
  SPECIALTIES,
  specialtyName,
} from '@/lib/commissions';
import ItemIcon from './ItemIcon';
const icons = { fast: Cpu, efficient: Leaf, stable: ShieldCheck };
function Parts({ items }: { items: Bag }) {
  return (
    <div className="commission-parts">
      {Object.entries(items).map(([id, n]) => (
        <span key={id}>
          <ItemIcon item={id as keyof Bag} size={19} />
          {n} {ITEMS[id as keyof Bag].name}
        </span>
      ))}
    </div>
  );
}
export default function CommissionDesk({
  facility: f,
  now,
  busy,
  onAction,
  onParts,
  onWorlds,
  onJobs,
  onBuild,
  onDaily,
  dailyReady,
}: {
  facility: Facility;
  now: number;
  busy: boolean;
  onAction: (a: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onParts: (b: Bag) => void;
  onWorlds: () => void;
  onJobs: () => void;
  onBuild: () => void;
  onDaily: () => void;
  dailyReady: boolean;
}) {
  const [tab, setTab] = useState(() =>
      milestoneProgress(f).ready &&
      !commissionsFor(f).active.some((run) => run.readyAt <= now)
        ? 'distinctions'
        : 'clients',
    ),
    [rack, setRack] = useState(''),
    [units, setUnits] = useState(1);
  const c = commissionsFor(f),
    racks = availableRacks(f, now),
    chosen = racks.includes(rack) ? rack : (racks[0] ?? ''),
    p = milestoneProgress(f);
  const afford = (bag: Bag, fee: number) =>
    f.compute >= fee &&
    Object.entries(bag).every(
      ([id, n]) => (f.inventory[id as keyof Bag] ?? 0) >= n!,
    );
  return (
    <div className="commission-desk">
      <div className="commission-banner">
        <span>
          DISPATCH /{' '}
          {c.milestone ? 'DISTINCTION ' + c.milestone : 'YOUR NEXT CHAPTER'}
        </span>
        <h3>Your racks. Your call.</h3>
        <p>
          Choose the client that fits your supplies and machines. Explore while
          the work runs.
        </p>
      </div>
      <div className="commission-tabs" aria-label="Client desk views">
        {[
          ['clients', 'Clients'],
          ['specialties', 'Specialties'],
          ['distinctions', 'Distinctions'],
        ].map(([id, name]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      {tab === 'clients' && (
        <>
          {dailyReady && (
            <Button variant="outline" onClick={onDaily}>
              View your daily bonus · ready
            </Button>
          )}
          {c.active.length > 0 && (
            <section className="commission-running">
              <h3>Your bookings</h3>
              {c.active.map((r) => (
                <article key={r.id}>
                  <div>
                    <small>
                      {r.client} · {r.quantity} units ·{' '}
                      {r.rack.replace('rack-', 'Machine ').toUpperCase()}
                    </small>
                    <strong>{r.name}</strong>
                    <progress
                      max={100}
                      value={Math.min(
                        100,
                        ((now - r.startedAt) / (r.readyAt - r.startedAt)) * 100,
                      )}
                    />
                    <span>
                      {now >= r.readyAt
                        ? 'Delivery complete'
                        : `${Math.ceil((r.readyAt - now) / 1000)}s remaining`}{' '}
                      · {r.reward} Compute + {r.xp} XP
                    </span>
                  </div>
                  <Button
                    disabled={busy || now < r.readyAt}
                    onClick={() =>
                      void onAction({ type: 'commission-claim', id: r.id })
                    }
                  >
                    {now >= r.readyAt ? 'Collect payment' : 'Processing'}
                  </Button>
                </article>
              ))}
            </section>
          )}
          <div className="commission-setup">
            <label>
              Machine
              <select
                value={chosen}
                onChange={(e) => setRack(e.target.value)}
                disabled={!racks.length}
              >
                {!racks.length && (
                  <option value="">No available machine</option>
                )}
                {racks.map((id) => (
                  <option key={id} value={id}>
                    Machine {id.slice(-1).toUpperCase()} · level {f.builds[id]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Batch size
              <input
                type="number"
                min={1}
                max={30}
                value={units}
                onChange={(e) =>
                  setUnits(
                    Math.max(
                      1,
                      Math.min(30, Math.floor(Number(e.target.value)) || 1),
                    ),
                  )
                }
              />
            </label>
            <span>
              2 shared client slots. A booked machine pauses its idle output.
            </span>
          </div>
          <div className="commission-offers">
            {commissionOffers(f).map((o) => {
              const q = commissionQuote(f, o.kind, chosen, units),
                Icon = icons[o.kind],
                can = !!chosen && units <= q.capacity && afford(q.cost, q.fee);
              return (
                <article key={o.id} className={`commission-offer ${o.kind}`}>
                  <div className="commission-type">
                    <Icon size={22} />
                    {specialtyName[o.kind]}
                  </div>
                  <small>
                    {o.client}
                    {q.demand > 0 && (
                      <span className="demand-badge">
                        HIGH DEMAND · +{q.demand}/unit
                      </span>
                    )}
                  </small>
                  <h3>{o.name}</h3>
                  <p>{o.detail}</p>
                  <div className="commission-quote">
                    <strong>
                      {q.reward} <small>Compute payment</small>
                    </strong>
                    <span>
                      <Clock3 size={16} />
                      {q.seconds}s · +{q.xp} XP
                    </span>
                    <span>{q.fee} Compute operating cost</span>
                    <span>{q.lostIdle} estimated idle Compute forgone</span>
                    <span>{q.capacity} batch slots on this setup</span>
                  </div>
                  <Parts items={q.cost} />
                  {!afford(q.cost, q.fee) && (
                    <button
                      className="text-action"
                      onClick={() => onParts(q.cost)}
                    >
                      Find supplies
                      <ArrowRight size={14} />
                    </button>
                  )}
                  <Button
                    className="primary-action"
                    disabled={
                      busy ||
                      !can ||
                      c.active.length + (f.career?.active.length ?? 0) >= 2
                    }
                    onClick={() =>
                      void onAction({
                        type: 'commission-start',
                        id: o.id,
                        rack: chosen,
                        quantity: units,
                      })
                    }
                  >
                    {units > q.capacity
                      ? 'Choose a smaller batch'
                      : 'Book this client'}
                  </Button>
                </article>
              );
            })}
          </div>
          <p className="muted-small">
            Choosing a client opens a fresh board. Started jobs keep their
            quoted terms and never expire while you are away.
          </p>
          <div className="commission-links">
            <Button variant="outline" onClick={onJobs}>
              Repair & parts jobs
            </Button>
            <Button variant="outline" onClick={onBuild}>
              {racks.length ? 'View machines' : 'Build or free a machine'}
            </Button>
            <Button variant="outline" onClick={onWorlds}>
              Explore for supplies
            </Button>
          </div>
        </>
      )}
      {tab === 'specialties' && (
        <>
          <p>
            Earn records through work. Invest in the setup you enjoy. Every
            specialty keeps its own progress.
          </p>
          <div className="commission-offers">
            {SPECIALTIES.map((k) => {
              const level = c.certificates[k],
                need = [3, 8, 18][level],
                price = [500, 2000, 6000][level],
                cost = { board: level + 1, kit: level + 1 },
                Icon = icons[k];
              return (
                <article key={k} className={`commission-offer ${k}`}>
                  <div className="commission-type">
                    <Icon />
                    {specialtyName[k]}
                  </div>
                  <h3>Certification {level} / 3</h3>
                  <p>
                    {
                      {
                        fast: 'Each certification cuts another 10% from your client processing time. Throughput still uses extra wire.',
                        efficient:
                          'Each certification uses fewer chips and wire and fits 3 extra units. Flexible work still occupies your machine longer.',
                        stable:
                          'Each certification reduces coolant use. Reliability still needs crafted boards.',
                      }[k]
                    }
                  </p>
                  <strong>{c.completed[k]} completed commissions</strong>
                  {level < 3 ? (
                    <>
                      <progress
                        value={Math.min(c.completed[k], need)}
                        max={need}
                      />
                      <p>
                        {need} records · {price} Compute
                      </p>
                      <Parts items={cost} />
                      <Button
                        disabled={
                          busy || c.completed[k] < need || !afford(cost, price)
                        }
                        onClick={() =>
                          void onAction({
                            type: 'commission-certify',
                            id: k,
                            quantity: level + 1,
                          })
                        }
                      >
                        Earn certification {level + 1}
                      </Button>
                    </>
                  ) : (
                    <p>
                      <Check size={16} />
                      Fully certified. Your expertise stays.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
      {tab === 'distinctions' && (
        <div className="distinction-panel">
          <Trophy size={44} />
          <small>FACILITY DISTINCTION {p.chapter}</small>
          <h3>
            {
              [
                'A center worth trusting.',
                'The neighborhood backbone.',
                'The future has a night shift.',
              ][c.milestone % 3]
            }
          </h3>
          <p>
            Finish a fresh portfolio, supply the build, and add a permanent
            illuminated monument to your center. Every new distinction starts
            another portfolio. Your machines and progress stay.
          </p>
          <ul>
            <li>
              {Math.min(p.needed, p.jobs)}/{p.needed} client commissions
            </li>
            <li>{Math.min(2, p.diversity)}/2 different specialties</li>
            <li>{Math.min(1, p.visits.reclaim)}/1 Crew Commons recovery</li>
            <li>
              {Math.min(1, p.visits.specialist)}/1 Cooling Works, GPU or Archive
              recovery
            </li>
          </ul>
          <Parts items={p.cost} />
          <strong>{p.compute.toLocaleString()} Compute · +60 XP</strong>
          <Button
            className="primary-action"
            disabled={busy || !p.ready || !afford(p.cost, p.compute)}
            onClick={() =>
              void onAction({
                type: 'commission-milestone',
                id: `milestone-${p.chapter}`,
              })
            }
          >
            Commission distinction {p.chapter}
          </Button>
          <div className="commission-links">
            <Button variant="outline" onClick={() => setTab('clients')}>
              Find client work
            </Button>
            <Button variant="outline" onClick={onWorlds}>
              Visit the realms
            </Button>
            <Button variant="outline" onClick={() => onParts(p.cost)}>
              Prepare materials
            </Button>
          </div>
          <p className="muted-small">
            The free route uses Crew Commons and Cooling Works. No token or
            teammate is required.
          </p>
        </div>
      )}
    </div>
  );
}
