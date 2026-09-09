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
import { EMERGENCY_STATIONS, type SharedWorld } from '@/lib/multiplayer';
import {
  REALMS,
  type NeighborhoodSnapshot,
  type RealmId,
} from '@/lib/neighborhoods';
import { Button } from '@/components/ui/button';
import AvatarPreview from './AvatarPreview';
import ComputeIcon from './ComputeIcon';

export function LockerPanel({
  facility,
  initialOutfit,
  name,
  balance,
  busy,
  onName,
  onWear,
}: {
  facility: Facility;
  initialOutfit?: string;
  name: string;
  balance: number;
  busy: boolean;
  onName: (name: string) => Promise<unknown>;
  onWear: (type: string, id: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(name),
    [outfit, setOutfit] = useState(
      OUTFITS.some((o) => o.id === initialOutfit)
        ? initialOutfit!
        : facility.outfit,
    ),
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
                ? 'Earn with 3 daily goals'
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
  snapshot,
  ownId,
  error,
  needsTakeover,
  onTakeover,
  onRealm,
}: {
  room: string;
  practice: boolean;
  onGo: (r: string) => void;
  onVisit: (id: string) => void;
  onConnect: () => void;
  snapshot: NeighborhoodSnapshot | null;
  ownId?: string;
  error: string;
  needsTakeover: boolean;
  onTakeover: () => void;
  onRealm: (id: RealmId) => void;
}) {
  const neighbors = snapshot?.neighbors ?? [];
  return (
    <div className="tycoon-panel neighborhood-panel">
      <button
        className="world-destination"
        onClick={() => onGo('home')}
        disabled={room === 'home'}
      >
        <Home />
        <span>
          <strong>Your data center</strong>
          <small>Your machines, your layout, your progress.</small>
        </span>
        <ArrowRight />
      </button>
      {practice ? (
        <div className="neighborhood-invite">
          <Users />
          <h3>A shift is better with neighbors.</h3>
          <p>
            Join a neighborhood of up to five players. Everyone keeps their own
            center.
          </p>
          <Button className="primary-action" onClick={onConnect}>
            Connect to play together <Wallet size={18} />
          </Button>
        </div>
      ) : (
        <>
          <div className="neighborhood-heading">
            <h3>Your neighborhood</h3>
            <span>{neighbors.length}/5 places</span>
          </div>
          <button
            className="world-destination"
            onClick={() => onGo('commons')}
            disabled={!snapshot || room === 'commons'}
          >
            <Users />
            <span>
              <strong>Meet in the plaza</strong>
              <small>Shared repairs, neighbors and trading.</small>
            </span>
            <ArrowRight />
          </button>
          <div className="neighbor-slots">
            {Array.from({ length: 5 }, (_, slot) => {
              const neighbor = neighbors.find((n) => n.slot === slot),
                mine = neighbor?.id === ownId;
              return (
                <button
                  className={`neighbor-slot ${neighbor ? 'occupied' : ''}`}
                  key={slot}
                  disabled={!neighbor || mine || room === 'home-' + neighbor.id}
                  onClick={() => neighbor && onVisit(neighbor.id)}
                >
                  <span className="neighbor-number">0{slot + 1}</span>
                  <Home size={25} />
                  <strong>
                    {neighbor
                      ? mine
                        ? 'Your center'
                        : neighbor.name
                      : 'Open place'}
                  </strong>
                  <small>
                    {neighbor
                      ? `Level ${neighbor.level} · ${neighbor.online ? (neighbor.scene === 'commons' ? 'In the plaza' : 'Inside a center') : 'Away briefly'}`
                      : 'A neighbor can join here'}
                  </small>
                  <span>
                    {neighbor
                      ? mine
                        ? 'Home'
                        : 'Visit →'
                      : 'Waiting for a neighbor'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="tycoon-note">
            Visit and look around. Only a center’s owner can change its machines
            or spend its resources.
          </p>
          <h3>Realms</h3>
          {REALMS.map((realm) => (
            <button
              className="world-destination"
              key={realm.id}
              disabled={snapshot?.membership.realm === realm.id}
              onClick={() => onRealm(realm.id)}
            >
              <Radio />
              <span>
                <strong>{realm.name}</strong>
                <small>
                  {snapshot?.membership.realm === realm.id
                    ? 'Your current realm'
                    : realm.holderOnly
                      ? 'Operator license + holder access'
                      : 'Free to play'}
                </small>
              </span>
              <ArrowRight />
            </button>
          ))}
          {error && <p role="alert">{error}</p>}
          {needsTakeover && (
            <Button className="primary-action" onClick={onTakeover}>
              Continue here
            </Button>
          )}
        </>
      )}
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
  onClaim: (bonus?: { room: string; event: number }) => void;
}) {
  if (!world) return <p>Connecting to the campus…</p>;
  const done = world.work.filter((w) => w.completedAt).length;
  return (
    <div className="tycoon-panel">
      {world.pending
        ?.filter((b) => b.room !== world.room || b.event !== world.event)
        .map((b) => (
          <div className="crew-station" key={b.room + b.event}>
            <strong>A crew bonus is waiting</strong>
            <p>Your completed repair earned 30 Compute.</p>
            <Button disabled={busy} onClick={() => onClaim(b)}>
              Collect 30 Compute
            </Button>
          </div>
        ))}
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
        onClick={() => onClaim()}
      >
        {world.claimed ? 'Bonus collected' : 'Collect bonus · 30'}
      </Button>
      <p className="tycoon-note">Finish one station to qualify.</p>
    </div>
  );
}
