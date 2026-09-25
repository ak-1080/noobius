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
  Layers,
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
import ComputeIcon from './ComputeIcon';
import styles from './WorkPanels.module.css';
const icons = { fast: Cpu, efficient: Leaf, stable: ShieldCheck };
function Parts({ items, inventory }: { items: Bag; inventory: Bag }) {
  return (
    <div className={styles.parts}>
      <span className={styles.label}>Supplies consumed · have / need</span>
      <div className="commission-parts">
        {Object.entries(items).map(([id, n]) => (
          <span key={id}>
            <span>
              <ItemIcon item={id as keyof Bag} size={19} />
              {ITEMS[id as keyof Bag].name}
            </span>
            <b data-missing={(inventory[id as keyof Bag] ?? 0) < n!}>
              {inventory[id as keyof Bag] ?? 0} / {n}
            </b>
          </span>
        ))}
      </div>
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
    p = milestoneProgress(f),
    occupied = c.active.length + (f.career?.active.length ?? 0);
  const afford = (bag: Bag, fee: number) =>
    f.compute >= fee &&
    Object.entries(bag).every(
      ([id, n]) => (f.inventory[id as keyof Bag] ?? 0) >= n!,
    );
  return (
    <div className={`commission-desk ${styles.desk}`}>
      <div className="commission-banner">
        <span>
          DISPATCH /{' '}
          {c.milestone ? 'DISTINCTION ' + c.milestone : 'YOUR NEXT CHAPTER'}
        </span>
        <h3>Your racks. Your call.</h3>
        <p>Pick a client. Load a batch. Explore while it runs.</p>
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
                      aria-label={`${r.client} processing progress`}
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
            <div className={styles.chips}>
              <span>
                <Layers size={14} aria-hidden="true" />
                {occupied}/2 client slots occupied
              </span>
              <span>Booked racks pause idle output</span>
            </div>
          </div>
          <div className="commission-offers">
            {commissionOffers(f).map((o) => {
              const q = commissionQuote(f, o.kind, chosen, units),
                Icon = icons[o.kind],
                can = !!chosen && units <= q.capacity && afford(q.cost, q.fee),
                missingParts = Object.entries(q.cost).some(
                  ([id, n]) => (f.inventory[id as keyof Bag] ?? 0) < n!,
                ),
                blocked = !chosen
                  ? 'No free machine. Build one or finish a running job.'
                  : occupied >= 2
                    ? 'Both client slots are occupied. Finish a job first.'
                    : units > q.capacity
                      ? `This setup fits ${q.capacity} units. Reduce your batch.`
                      : f.compute < q.fee
                        ? `Need ${(q.fee - f.compute).toLocaleString()} more Compute for the operating cost.`
                        : missingParts
                          ? 'Bring the missing supplies in your backpack.'
                          : null;
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
                  <dl className={styles.metrics}>
                    <div>
                      <dt>COMPUTE PAYMENT</dt>
                      <dd>
                        <ComputeIcon size={20} />
                        {q.reward.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt>COMPUTE COST · UPFRONT</dt>
                      <dd>
                        <ComputeIcon size={18} />
                        {q.fee.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt>PROCESSING TIME</dt>
                      <dd>
                        <Clock3 size={17} aria-hidden="true" />
                        {q.seconds}
                        <small>sec</small>
                      </dd>
                    </div>
                    <div>
                      <dt>EXPERIENCE</dt>
                      <dd>
                        +{q.xp}
                        <small>XP</small>
                      </dd>
                    </div>
                  </dl>
                  <div className={styles.chips}>
                    <span>
                      <Layers size={14} aria-hidden="true" />
                      {units}/{q.capacity} batch slots
                    </span>
                  </div>
                  <Parts items={q.cost} inventory={f.inventory} />
                  <details className={styles.terms}>
                    <summary>Booking details</summary>
                    <p>{o.detail}</p>
                    <dl>
                      <div>
                        <dt>Estimated idle output forgone</dt>
                        <dd>{q.lostIdle} Compute</dd>
                      </div>
                    </dl>
                    <p>
                      Supplies and operating cost are spent when booked. The
                      payment shown is before those costs. Accepted terms stay
                      fixed; started work does not expire while you are away.
                    </p>
                  </details>
                  {blocked && <p className={styles.notice}>{blocked}</p>}
                  {missingParts && (
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
                    disabled={busy || !can || occupied >= 2}
                    onClick={() =>
                      void onAction({
                        type: 'commission-start',
                        id: o.id,
                        rack: chosen,
                        quantity: units,
                      })
                    }
                  >
                    {!chosen
                      ? 'Machine needed'
                      : occupied >= 2
                        ? 'Client slots full'
                        : units > q.capacity
                          ? 'Choose a smaller batch'
                          : 'Book this client'}
                  </Button>
                </article>
              );
            })}
          </div>
          <details className={styles.terms}>
            <summary>How bookings work</summary>
            <p>
              Booking opens a fresh board. Two slots are shared with repair and
              parts jobs. A reserved machine pauses its idle output. Started
              jobs keep their quoted terms and never expire while you are away.
            </p>
          </details>
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
          <p className="muted-small">
            Finish client work to certify your favorite specialty.
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
                  <div className={styles.chips}>
                    <span>
                      {
                        {
                          fast: '−10% base processing time / tier',
                          efficient: 'Fewer chips & wire',
                          stable: 'Less coolant',
                        }[k]
                      }
                    </span>
                    {k === 'efficient' && <span>+3 batch slots / tier</span>}
                  </div>
                  <details className={styles.terms}>
                    <summary>Specialty benefits</summary>
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
                  </details>
                  <strong>{c.completed[k]} client records</strong>
                  {level < 3 ? (
                    <>
                      <progress
                        value={Math.min(c.completed[k], need)}
                        max={need}
                        aria-label={`${Math.min(c.completed[k], need)} of ${need} required client records`}
                      />
                      <dl className={styles.metrics}>
                        <div>
                          <dt>RECORDS REQUIRED</dt>
                          <dd>{need}</dd>
                        </div>
                        <div>
                          <dt>COMPUTE COST</dt>
                          <dd>
                            <ComputeIcon size={18} />
                            {price.toLocaleString()}
                          </dd>
                        </div>
                      </dl>
                      <Parts items={cost} inventory={f.inventory} />
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
          <p>Complete this portfolio to light a permanent monument.</p>
          <ul className={styles.requirements}>
            <li data-complete={p.jobs >= p.needed}>
              <strong>
                {Math.min(p.needed, p.jobs)}/{p.needed}
              </strong>
              <span>Client commissions</span>
            </li>
            <li data-complete={p.diversity >= 2}>
              <strong>{Math.min(2, p.diversity)}/2</strong>
              <span>Different specialties</span>
            </li>
            <li data-complete={p.visits.reclaim >= 1}>
              <strong>{Math.min(1, p.visits.reclaim)}/1</strong>
              <span>Crew Commons recovery</span>
            </li>
            <li data-complete={p.visits.specialist >= 1}>
              <strong>{Math.min(1, p.visits.specialist)}/1</strong>
              <span>Cooling Works, GPU or Archive recovery</span>
            </li>
          </ul>
          <Parts items={p.cost} inventory={f.inventory} />
          <dl className={styles.metrics}>
            <div>
              <dt>COMPUTE BUILD COST</dt>
              <dd>
                <ComputeIcon size={20} />
                {p.compute.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>EXPERIENCE</dt>
              <dd>
                +60<small>XP</small>
              </dd>
            </div>
          </dl>
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
            Free route: Crew Commons + Cooling Works. No token or teammate
            needed.
          </p>
          <details className={styles.terms}>
            <summary>After this distinction</summary>
            <p>
              A new portfolio begins. Your monument, machines, certifications
              and existing progress stay. The next distinction requires fresh
              work and new build supplies.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
