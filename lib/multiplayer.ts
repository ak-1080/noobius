import { newFacility, type Facility } from './facility';
export const CAMPUS_ROOMS = ['campus-1', 'campus-2', 'campus-3'] as const;
export const EMERGENCY_STATIONS = [
  {
    id: 'power',
    name: 'Restore power',
    object: 'rack-a',
    x: -4,
    z: 15,
    instruction: 'Stabilize the power.',
  },
  {
    id: 'cooling',
    name: 'Flush cooling',
    object: 'rack-b',
    x: 4,
    z: 15,
    instruction: 'Flush the cooling line.',
  },
  {
    id: 'network',
    name: 'Restart the network',
    object: 'repair',
    x: 0,
    z: 7,
    instruction: 'Reconnect the uplink.',
  },
] as const;
export type WorldVisit = { owner: string; name: string; facility: Facility };
export type CrewWork = {
  station: string;
  name: string;
  mine: boolean;
  startedAt: number;
  completedAt: number | null;
};
export type SharedWorld = {
  room: string;
  event: number;
  endsAt: number;
  serverNow: number;
  work: CrewWork[];
  claimed: boolean;
  pending?: { room: string; event: number }[];
};
export function publicCampus() {
  const f = newFacility();
  f.unlocked = ['commons'];
  f.seen = ['commons'];
  return f;
}
export const eventAt = (now: number) => Math.floor(now / 600000);
export const ownRoom = (wallet: string) => 'home-' + wallet.slice(2, 18);
export const validRoom = (room: unknown): room is string =>
  typeof room === 'string' &&
  /^(campus-[1-3]|home-[a-fA-F0-9]{16})$/.test(room);
