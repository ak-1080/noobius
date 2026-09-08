'use client';
import { useState, useRef, type CSSProperties } from 'react';
import {
  ArrowRight,
  Check,
  Cpu,
  DoorOpen,
  Fan,
  Hammer,
  Lock,
  Network,
  Package,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  OBJECTS,
  ZONES,
  machineGain,
  modules,
  type Facility,
  type FacilityAction,
  type ZoneId,
  type WorldObject,
} from '@/lib/facility';
import { roomUnlockState, roomMachinePrice } from '@/lib/room-progress';
import ComputeIcon from './ComputeIcon';
import ComputeCollection from './ComputeCollection';
import RoomPreview from './RoomPreview';

const ROOM_COPY: Record<ZoneId, { icon: typeof Fan; text: string }> = {
  commons: {
    icon: DoorOpen,
    text: 'Your first two machines. Margo is here to help.',
  },
  salvage: {
    icon: Package,
    text: 'Pick up spare parts and visit Bit’s shop. An optional stop between builds.',
  },
  workshop: {
    icon: Hammer,
    text: 'Make parts at the workbench and learn skills from Patch. Your machines keep earning.',
  },
  thermal: {
    icon: Fan,
    text: 'Big fans. Cool lights. A home for your first bigger machine.',
  },
  compute: {
    icon: Cpu,
    text: 'Two new machine spots. Give your growing empire a serious boost.',
  },
  network: {
    icon: Network,
    text: 'A bigger room for a stronger machine. Keep the Compute coming.',
  },
  core: {
    icon: Sparkles,
    text: 'The final room. Build your biggest machine yet.',
  },
};

export default function RoomProgressPanel({
  facility: f,
  balance,
  busy,
  now,
  initialRoom,
  onAction,
  onTravel,
  onBuild,
}: {
  facility: Facility;
  balance: number;
  busy: boolean;
  now: number;
  initialRoom?: ZoneId;
  onAction: (action: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onTravel: () => void;
  onBuild: (plot?: WorldObject) => void;
}) {
  const [selected, setSelected] = useState<ZoneId>(
    () =>
      initialRoom ??
      ZONES.find((z) => !f.unlocked.includes(z.id))?.id ??
      'commons',
  );
  const details = useRef<HTMLElement>(null);
  const selectRoom = (id: ZoneId) => {
    setSelected(id);
    if (window.matchMedia('(max-width: 759px)').matches) {
      requestAnimationFrame(() =>
        details.current?.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
        }),
      );
    }
  };
  const room = ZONES.find((z) => z.id === selected)!;
  const state = roomUnlockState(f, balance, room);
  const plots = OBJECTS.filter((o) => o.kind === 'build' && o.zone === room.id);
  const nextPlot =
    plots.find((plot) => !f.builds[plot.id]) ??
    plots.find((plot) => f.builds[plot.id] < 3) ??
    plots[0];
  const built = plots.filter((o) => f.builds[o.id] > 0).length;
  return (
    <div className="room-progress">
      <div className="room-picker-heading">
        <p>Choose a room to see what’s inside.</p>
        <span>
          {f.unlocked.length} / {ZONES.length} open
        </span>
      </div>
      <div className="room-picker" role="group" aria-label="Choose a room">
        {ZONES.map((zone) => {
          const Icon = ROOM_COPY[zone.id].icon;
          const open = f.unlocked.includes(zone.id);
          return (
            <button
              key={zone.id}
              style={
                {
                  gridArea: zone.id,
                  '--room-color': zone.color,
                } as CSSProperties
              }
              className={`room-picker-button ${selected === zone.id ? 'is-selected' : ''}`}
              aria-pressed={selected === zone.id}
              disabled={busy}
              onClick={() => selectRoom(zone.id)}
            >
              <Icon size={21} aria-hidden="true" />
              <strong>{zone.name}</strong>
              <small>
                {open ? (
                  <>
                    <Check size={11} />
                    Open
                  </>
                ) : (
                  <>
                    <Lock size={10} />
                    Locked
                  </>
                )}
              </small>
            </button>
          );
        })}
      </div>
      <section
        className="room-details"
        ref={details}
        style={{ '--room-color': room.color } as CSSProperties}
        aria-label={`${room.name} details`}
      >
        <div className="room-detail-header">
          <div>
            <small>{state.open ? 'ROOM OPEN' : 'GROW YOUR DATA CENTER'}</small>
            <h3>{room.name}</h3>
          </div>
          <span>
            {plots.length
              ? `${state.open ? `${built} / ` : ''}${plots.length} machine ${plots.length === 1 ? 'spot' : 'spots'}`
              : 'Side activities'}
          </span>
        </div>
        <RoomPreview room={room.id} facility={f} />
        <p className="room-description">{ROOM_COPY[room.id].text}</p>
        {plots.length > 0 && (
          <div className="room-machine-list">
            {plots.map((plot) => {
              const level = f.builds[plot.id] ?? 0;
              return (
                <div key={plot.id}>
                  <span>
                    <strong>{plot.name}</strong>
                    <small>
                      {level
                        ? `Level ${level} / 3`
                        : `Build for ${roomMachinePrice(f, plot.id).toLocaleString()} Compute`}
                    </small>
                  </span>
                  <span>
                    {level
                      ? `+${(machineGain(f, plot.id) * level).toLocaleString()}/min`
                      : `+${machineGain(f, plot.id).toLocaleString()}/min`}
                    <small>{level ? 'Earning Compute' : 'Once built'}</small>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {plots.length > 0 && modules(f) === 0 && (
          <p className="room-purchase-note">
            Your starter is free. Other machine prices apply after that.
          </p>
        )}
        {!state.open && (
          <>
            <p className="room-purchase-note">
              Unlocking gives you space. Build machines separately to earn more.
            </p>
            <div className="room-requirements" aria-label="Unlock requirements">
              <div className={!state.missingLevels ? 'is-met' : ''}>
                {!state.missingLevels ? (
                  <Check size={18} />
                ) : (
                  <Hammer size={18} />
                )}
                <span>
                  {Math.min(state.levels, room.modules)} / {room.modules} total
                  machine {room.modules === 1 ? 'level' : 'levels'}
                </span>
              </div>
              {room.id === 'core' && (
                <div className={!state.needsGpu ? 'is-met' : ''}>
                  {!state.needsGpu ? <Check size={18} /> : <Lock size={18} />}
                  <span>GPU room open</span>
                </div>
              )}
              <div className={!state.missingCompute ? 'is-met' : ''}>
                {!state.missingCompute ? (
                  <Check size={18} />
                ) : (
                  <ComputeIcon size={20} />
                )}
                <span>
                  {Math.min(balance, room.cost).toLocaleString()} /{' '}
                  {room.cost.toLocaleString()} Compute to spend
                </span>
              </div>
            </div>
            <p className="muted-small">
              Every build or machine upgrade adds 1 level. Two level-2 machines
              = 4 levels.
            </p>
            {state.missingLevels > 0 && (
              <button className="room-help-link" onClick={() => onBuild()}>
                Build or upgrade {state.missingLevels} more{' '}
                {state.missingLevels === 1 ? 'time' : 'times'}{' '}
                <ArrowRight size={15} />
              </button>
            )}
            {state.needsGpu && (
              <button
                className="room-help-link"
                onClick={() => selectRoom('compute')}
              >
                See the GPU room <ArrowRight size={15} />
              </button>
            )}
          </>
        )}
        <div className="room-detail-actions">
          {state.open ? (
            <Button
              className="primary-action"
              disabled={busy}
              onClick={async () => {
                if (await onAction({ type: 'travel', id: room.id })) onTravel();
              }}
            >
              <DoorOpen size={18} />
              Go to room <ArrowRight size={18} />
            </Button>
          ) : (
            <Button
              className="primary-action"
              disabled={busy || !state.canUnlock}
              onClick={() => void onAction({ type: 'unlock', id: room.id })}
            >
              <ComputeIcon size={24} />
              {room.cost.toLocaleString()} · Unlock room
            </Button>
          )}
          {state.open && plots.length > 0 && (
            <Button
              className="outline-button"
              onClick={() => onBuild(nextPlot)}
            >
              Build machines
            </Button>
          )}
        </div>
        {!state.open && state.missingCompute > 0 && (
          <p className="room-shortage">
            Need {state.missingCompute.toLocaleString()} more Compute. Collect
            your earnings below.
          </p>
        )}
      </section>
      <ComputeCollection
        facility={f}
        now={now}
        busy={busy}
        onAction={onAction}
      />
    </div>
  );
}
