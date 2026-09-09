import type { SharedWorld } from './multiplayer';
import { careerFor, careerLevel } from './contracts.ts';
import type { Facility } from './facility.ts';

export const REALMS = [
  {
    id: 'commons',
    name: 'Crew Commons',
    description: 'Your first center. A whole shift of possibilities.',
    holderOnly: false,
    color: '#bddf8b',
  },
  {
    id: 'gpu',
    name: 'GPU District',
    description: 'Commission bigger workloads with a licensed crew.',
    holderOnly: true,
    color: '#aebaff',
  },
] as const;
export type RealmId = (typeof REALMS)[number]['id'];
export const realmExists = (value: unknown): value is RealmId =>
  REALMS.some((r) => r.id === value);
export const NEIGHBORHOOD_CAPACITY = 5;
export const CENTER_ENTRANCES = [
  { x: -7, z: 5.5 },
  { x: 0, z: 4.5 },
  { x: 7, z: 5.5 },
  { x: -7, z: 19 },
  { x: 7, z: 19 },
];
export const MEMBERSHIP_LEASE_MS = 45000;
export const VISIBLE_FOR_MS = 10000;
export const levelBand = (f: Facility) =>
  Math.min(2, Math.floor((careerLevel(careerFor(f)) - 1) / 5));
export const centerScene = (id: string) => 'home-' + id;
export type Membership = {
  neighborhoodId: string;
  realm: RealmId;
  slot: number;
  generation: number;
  scene: string;
  sequence: number;
  x: number;
  z: number;
  leaseUntil: number;
};
export type Neighbor = {
  id: string;
  name: string;
  slot: number;
  scene: string;
  online: boolean;
  level: number;
  racks: number;
  outfit: string;
  accessory: string;
};
export type NeighborhoodSnapshot = {
  cluster?: {
    id: string;
    variant: string;
    online: boolean;
    progress: number;
    total: number;
    running?: number;
  } | null;
  world?: SharedWorld;
  corrected?: boolean;
  notice?: string;
  membership: Membership;
  neighbors: Neighbor[];
  serverNow: number;
  people: {
    id: string;
    name: string;
    x: number;
    z: number;
    outfit: string;
    accessory: string;
  }[];
};
