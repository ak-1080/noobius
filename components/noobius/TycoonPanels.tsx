'use client';
import { useEffect, useState } from 'react';
import {
  Check,
  ArrowRight,
  Home,
  Users,
  Shirt,
  Radio,
  Headphones,
  HardHat,
  Backpack,
  Zap,
  Fan,
  Cable,
  Wallet,
} from 'lucide-react';
import { ACCESSORIES, OUTFITS, type Facility } from '@/lib/facility';
import {
  CAMPUS_ROOMS,
  EMERGENCY_STATIONS,
  type SharedWorld,
} from '@/lib/multiplayer';
import { api } from './useNoobius';
import { Button } from '@/components/ui/button';
import AvatarPreview from './AvatarPreview';
import ComputeIcon from './ComputeIcon';

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
  onWear: (type: string, id: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(name),
    [outfit, setOutfit] = useState(facility.outfit),
    [accessory, setAccessory] = useState(facility.accessory ?? 'none'),
    [tab, setTab] = useState<'shirts' | 'accessories'>('shirts'),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState('');
  const shirt = OUTFITS.find((o) => o.id === outfit)!,
    item = ACCESSORIES.find((o) => o.id === accessory)!;
  const cost =
    (facility.owned.includes(outfit) ? 0 : shirt.price) +
    (facility.owned.includes(accessory) ? 0 : item.price);
  const earned = outfit === 'afterhours' && !facility.owned.includes(outfit);
  const changed =
    name !== draft.trim() ||
    outfit !== facility.outfit ||
    accessory !== (facility.accessory ?? 'none');
  const icons = {
    none: Headphones,
    cap: HardHat,
    pack: Backpack,
    beacon: Radio,
  };
  async function save() {
    if (busy || saving) return;
    setSaving(true);
    setMessage('');
    try {
      if (draft.trim() !== name && !(await onName(draft))) return;
      if (outfit !== facility.outfit && !(await onWear('outfit', outfit)))
        return;
      if (
        accessory !== (facility.accessory ?? 'none') &&
        !(await onWear('accessory', accessory))
      )
        return;
      setMessage('Look saved.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="visual-locker">
      <div className="locker-stage">
        <AvatarPreview color={shirt.color} accessory={accessory} />
        <small>Drag to turn</small>
        <label htmlFor="crew-name">Username</label>
        <input
          id="crew-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={20}
          disabled={busy || saving}
        />
      </div>
      <div className="locker-choices">
        <div className="locker-tabs">
          <button
            onClick={() => setTab('shirts')}
            aria-pressed={tab === 'shirts'}
          >
            <Shirt size={20} />
            Outfits
          </button>
          <button
            onClick={() => setTab('accessories')}
            aria-pressed={tab === 'accessories'}
          >
            <Headphones size={20} />
            Accessories
          </button>
        </div>
        <div className="locker-item-grid">
          {tab === 'shirts'
            ? OUTFITS.map((o) => (
                <button
                  key={o.id}
                  aria-pressed={outfit === o.id}
                  onClick={() => {
                    setOutfit(o.id);
                    setMessage('');
                  }}
                  disabled={busy || saving}
                >
                  <span
                    className="shirt-swatch"
                    style={{ background: o.color }}
                  >
                    <Shirt size={35} />
                  </span>
                  <strong>{o.name}</strong>
                  <small>
                    {facility.owned.includes(o.id)
                      ? 'Owned'
                      : o.id === 'afterhours'
                        ? 'Daily reward'
                        : o.price
                          ? `${o.price} Compute`
                          : 'Free'}
                  </small>
                  {outfit === o.id && (
                    <Check className="locker-selected" size={18} />
                  )}
                </button>
              ))
            : ACCESSORIES.map((o) => {
                const Icon = icons[o.id];
                return (
                  <button
                    key={o.id}
                    aria-pressed={accessory === o.id}
                    onClick={() => {
                      setAccessory(o.id);
                      setMessage('');
                    }}
                    disabled={busy || saving}
                  >
                    <span className="accessory-symbol">
                      <Icon size={35} />
                    </span>
                    <strong>{o.name}</strong>
                    <small>
                      {facility.owned.includes(o.id)
                        ? 'Owned'
                        : o.price
                          ? `${o.price} Compute`
                          : 'Free'}
                    </small>
                    {accessory === o.id && (
                      <Check className="locker-selected" size={18} />
                    )}
                  </button>
                );
              })}
        </div>
        <div className="locker-save">
          <span>
            <ComputeIcon size={24} />
            {balance} Compute
          </span>
          <Button
            className="primary-action"
            disabled={busy || saving || !changed || earned || cost > balance}
            onClick={() => void save()}
          >
            {saving
              ? 'Saving…'
              : earned
                ? 'Earn through daily jobs'
                : cost > balance
                  ? `Need ${cost - balance} more Compute`
                  : cost
                    ? `Save look · ${cost} Compute`
                    : 'Save look'}
            <Check size={18} />
          </Button>
          {message && <p role="status">{message}</p>}
        </div>
      </div>
    </div>
  );
}
export function WorldPanel({
  onConnect,
  room,
  practice,
  onGo,
  onVisit,
}: {
  room: string;
  practice: boolean;
  onGo: (r: string) => void;
  onVisit: (id: string) => void;
  onConnect: () => void;
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
          <small>Build & upgrade</small>
        </span>
        <ArrowRight />
      </button>
      <h3>Campuses</h3>
      {practice && (
        <Button className="primary-action" onClick={onConnect}>
          <Wallet size={18} /> Connect to play together <ArrowRight size={18} />
        </Button>
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
              {room === r ? 'You are here' : 'Jobs · chat · market'}
            </small>
          </span>
          <ArrowRight />
        </button>
      ))}
      <h3>Visit</h3>
      <p className="tycoon-note">Visits are read-only.</p>
      {error && <p role="alert">{error}</p>}
      {!facilities.length && !error && <p>No facilities online.</p>}
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
            {done === 3 ? 'The cluster is back online!' : 'Restore the cluster'}
          </strong>
          <p>
            {done}/3 stations restored · next job in{' '}
            {Math.max(0, Math.ceil((world.endsAt - now) / 60000))}m
          </p>
        </div>
      </div>
      <p>Repair a station. Earn 20 Compute.</p>
      {EMERGENCY_STATIONS.map((s) => {
        const w = world.work.find((w) => w.station === s.id),
          active = w && !w.completedAt && now - w.startedAt < 30000,
          ready = active && w.mine && now - w.startedAt >= 6000;
        return (
          <div
            className={`crew-station ${w?.completedAt ? 'is-done' : active ? 'is-working' : ''}`}
            key={s.id}
          >
            <strong>
              {w?.completedAt ? (
                <Check size={18} />
              ) : s.id === 'power' ? (
                <Zap size={18} />
              ) : s.id === 'cooling' ? (
                <Fan size={18} />
              ) : (
                <Cable size={18} />
              )}{' '}
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
                  Go
                </Button>
                <Button
                  disabled={
                    busy ||
                    !!(active && !w.mine) ||
                    !!(active && w.mine && !ready)
                  }
                  onClick={() => onWork(s.id, !!ready)}
                >
                  {ready ? 'Finish' : active ? 'Working…' : 'Repair'}
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
        {world.claimed ? 'Bonus collected' : 'Collect bonus · 30'}
      </Button>
      <p className="tycoon-note">Finish one station to qualify.</p>
    </div>
  );
}
