import { playerLevel } from './progression.ts';

/** Stable IDs; server admission and UI both read this catalog. */
export const REALMS = [
  {
    id: 'commons',
    name: 'Crew Commons',
    subtitle: 'Learn the shift',
    description: 'Salvage working parts, build your center and find your crew.',
    holderOnly: false,
    minimumLevel: 1,
    license: false,
    color: '#bddf8b',
    specialist: 'Patch',
    activity: 'Circuit salvage',
    puzzle: 'network',
    purpose:
      'Sort reusable hardware from damaged parts and recover useful supplies.',
    destination: 'Recovery bench',
    skill: 'salvaging',
  },
  {
    id: 'thermal',
    name: 'Cooling Works',
    subtitle: 'Keep your cool',
    description:
      'Rebalance industrial cooling lines and recover clean coolant.',
    holderOnly: false,
    minimumLevel: 3,
    license: false,
    color: '#71dfdc',
    specialist: 'Margo',
    activity: 'Coolant recovery',
    puzzle: 'cooling',
    purpose: 'Rotate pipe sections to connect the coolant inlet and outlet.',
    destination: 'Cooling controls',
    skill: 'engineering',
  },
  {
    id: 'gpu',
    name: 'GPU District',
    subtitle: 'Wake the machines',
    description: 'Qualify recovered chips and commission specialist clusters.',
    holderOnly: true,
    minimumLevel: 5,
    license: true,
    color: '#aebaff',
    specialist: 'Bit',
    activity: 'Chip qualification',
    puzzle: 'boot',
    purpose:
      'Schedule live requests and flexible batches without overloading either lane.',
    destination: 'Qualification terminal',
    skill: 'operations',
  },
  {
    id: 'core',
    name: 'Archive Depths',
    subtitle: 'Recover what matters',
    description:
      'Reconnect isolated archives and rescue boards and data cores.',
    holderOnly: true,
    minimumLevel: 8,
    license: true,
    color: '#efb075',
    specialist: 'Patch',
    activity: 'Archive recovery',
    puzzle: 'network',
    purpose: 'Find the newest complete checkpoint for the correct model.',
    destination: 'Archive switchboard',
    skill: 'operations',
  },
] as const;
export type RealmId = (typeof REALMS)[number]['id'];
export const realmExists = (value: unknown): value is RealmId =>
  REALMS.some((r) => r.id === value);
export const realmFor = (id: RealmId) => REALMS.find((r) => r.id === id)!;
export function realmRequirement(id: RealmId, xp: number, licensed: boolean) {
  const realm = realmFor(id);
  if (playerLevel(xp) < realm.minimumLevel)
    return `Reach player level ${realm.minimumLevel}.`;
  if (realm.license && !licensed)
    return 'Earn your Operator license in Crew Commons first.';
  return null;
}
// Reuses an existing, authoritative collision footprint in the shared plaza.
export const REALM_WORKSITE = {
  id: 'bank',
  x: 5,
  z: 9,
  name: 'Realm field station',
};
