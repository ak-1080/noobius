'use client';
import { useEffect, useState } from 'react';
import {
  Cpu,
  Check,
  ArrowRight,
  Home,
  Users,
  Shirt,
  Radio,
} from 'lucide-react';
import { ACCESSORIES, OUTFITS, type Facility } from '@/lib/facility';
import {
  CAMPUS_ROOMS,
  EMERGENCY_STATIONS,
  type SharedWorld,
} from '@/lib/multiplayer';
import { api } from './useNoobius';
import { Button } from '@/components/ui/button';

export function LockerPanel({
  facility,
  name,
  balance,
  busy,
  onName,
  onWear,
}: {
  facility: Facility;
  name: string;
  balance: number;
  busy: boolean;
  onName: (name: string) => Promise<unknown>;
  onWear: (type: string, id: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <div className="tycoon-panel">
      <div className="locker-identity">
        <img
          src="/assets/noobius.jpeg"
          alt="Noobius"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onName(draft);
          }}
        >
          <label htmlFor="crew-name">Your name</label>
          <input
            id="crew-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            minLength={2}
            maxLength={20}
            required
          />
          <Button type="submit" disabled={busy || draft === name}>Save name</Button>
        </form>
      </div>
      <p className="tycoon-balance">
        <Cpu size={18} />
        {balance} Compute
      </p>
      <h3>Shirts</h3>
      <div className="tycoon-grid">
        {OUTFITS.map((o) => {
          const owned = facility.owned.includes(o.id),
            equipped = facility.outfit === o.id;
          return (
            <button
              key={o.id}
              disabled={
                busy ||
                equipped ||
                (!owned && balance < o.price) ||
                (!owned && o.id === 'afterhours')
              }
              onClick={() => onWear('outfit', o.id)}
            >
              <span className="shirt-swatch" style={{ background: o.color }}>
                <Shirt size={27} />
              </span>
              <strong>{o.name}</strong>
              <small>
                {equipped
                  ? 'Wearing'
                  : owned
                    ? 'Equip'
                    : o.id === 'afterhours'
                      ? 'Earn through daily jobs'
                      : `${o.price} Compute`}
              </small>
            </button>
          );
        })}
      </div>
      <h3>Accessories</h3>
      <div className="tycoon-grid">
        {ACCESSORIES.map((o) => {
          const equipped = (facility.accessory ?? 'none') === o.id,
            owned = facility.owned.includes(o.id) || o.price === 0;
          return (
            <button
              key={o.id}
              disabled={busy || equipped || (!owned && balance < o.price)}
              onClick={() => onWear('accessory', o.id)}
            >
              <strong>{o.name}</strong>
              <small>
                {equipped ? 'Wearing' : owned ? 'Equip' : `${o.price} Compute`}
              </small>
            </button>
          );
        })}
      </div>
      <p className="tycoon-note">
        Looks change your style. They don’t increase earnings.
      </p>
    </div>
  );
}
export function WorldPanel({
  room,
  practice,
  onGo,
  onVisit,
}: {
  room: string;
  practice: boolean;
  onGo: (r: string) => void;
  onVisit: (id: string) => void;
}) {
  const [facilities, setFacilities] = useState<
      { id: string; name: string; racks: number }[]
    >([]),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api<{ facilities: typeof facilities }>('directory')
      .then((d) => {
        if (alive) setFacilities(d.facilities);
      })
      .catch(() => {
        if (alive)
          setError('Could not load visits. Reopen this panel to retry.');
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="tycoon-panel">
      <button className="world-destination" onClick={() => onGo('home')}>
        <Home />
        <span>
          <strong>Your data center</strong>
          <small>Your racks, your upgrades, your progress.</small>
        </span>
        <ArrowRight />
      </button>
      <h3>Meet the crew</h3>
      {practice && (
        <p>
          Connect your wallet to join players and save your facility. Practice
          stays solo.
        </p>
      )}
      {CAMPUS_ROOMS.map((r, i) => (
        <button
          className="world-destination"
          key={r}
          disabled={practice || room === r}
          onClick={() => onGo(r)}
        >
          <Users />
          <span>
            <strong>Campus {i + 1}</strong>
            <small>
              {room === r
                ? 'You are here'
                : 'Shared jobs · crew chat · player market'}
            </small>
          </span>
          <ArrowRight />
        </button>
      ))}
      <h3>Visit a data center</h3>
      <p className="tycoon-note">
        Look around together. Only the owner can change equipment.
      </p>
      {error && <p role="alert">{error}</p>}
      {!facilities.length && !error && (
        <p>No crew facilities online yet. Yours can be the first.</p>
      )}
      {facilities.map((f) => (
        <button
          disabled={practice}
          className="world-destination"
          key={f.id}
          onClick={() => onVisit(f.id)}
        >
          <Home />
          <span>
            <strong>{f.name}’s facility</strong>
            <small>{f.racks} rack levels</small>
          </span>
          <ArrowRight />
        </button>
      ))}
    </div>
  );
}
export function CrewJobPanel({
  world,
  now,
  busy,
  onWalk,
  onWork,
  onClaim,
}: {
  world: SharedWorld | null;
  now: number;
  busy: boolean;
  onWalk: (id: string) => void;
  onWork: (station: string, finish: boolean) => void;
  onClaim: () => void;
}) {
  if (!world) return <p>Connecting to the campus…</p>;
  const done = world.work.filter((w) => w.completedAt).length;
  return (
    <div className="tycoon-panel">
      <div className="crew-job-banner">
        <Radio />
        <div>
          <strong>
            {done === 3
              ? 'The cluster is back online!'
              : 'Emergency: the cluster is down'}
          </strong>
          <p>
            {done}/3 stations restored · next job in{' '}
            {Math.max(0, Math.ceil((world.endsAt - now) / 60000))}m
          </p>
        </div>
      </div>
      <p>
        Split the stations with your crew, or tackle them one at a time. Each
        completed station earns 20 Compute.
      </p>
      {EMERGENCY_STATIONS.map((s) => {
        const w = world.work.find((w) => w.station === s.id),
          active = w && !w.completedAt && now - w.startedAt < 30000,
          ready = active && w.mine && now - w.startedAt >= 6000;
        return (
          <div className="crew-station" key={s.id}>
            <strong>
              {w?.completedAt ? <Check size={18} /> : <Cpu size={18} />}{' '}
              {s.name}
            </strong>
            <p>
              {w?.completedAt
                ? `Repaired by ${w.name}`
                : active
                  ? `${w.name} is working · ${Math.max(0, Math.ceil((6000 - now + w.startedAt) / 1000))}s`
                  : s.instruction}
            </p>
            {!w?.completedAt && (
              <div>
                <Button variant="outline" onClick={() => onWalk(s.object)}>
                  Show me
                </Button>
                <Button
                  disabled={
                    busy ||
                    !!(active && !w.mine) ||
                    !!(active && w.mine && !ready)
                  }
                  onClick={() => onWork(s.id, !!ready)}
                >
                  {ready
                    ? 'Finish repair'
                    : active
                      ? 'Working…'
                      : 'Start repair'}
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <Button
        disabled={
          busy ||
          done !== 3 ||
          world.claimed ||
          !world.work.some((w) => w.mine && w.completedAt)
        }
        onClick={onClaim}
      >
        {world.claimed ? 'Bonus collected' : 'Collect team bonus · 30 Compute'}
      </Button>
      <p className="tycoon-note">
        Repair at least one station to earn the team bonus. Each reward can be
        collected once.
      </p>
    </div>
  );
}
