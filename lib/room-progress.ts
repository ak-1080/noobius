import {
  modules,
  rackPrice,
  RACK_PRICES,
  type Facility,
  type ZONES,
} from './facility.ts';

// Future-room prices apply after the free starter has been installed.
export function roomMachinePrice(f: Facility, id: string) {
  return modules(f) === 0 && id !== 'rack-a'
    ? RACK_PRICES[id]
    : rackPrice(f, id);
}

// Display the same requirements that the authoritative unlock action checks.
// Stored production is deliberately excluded from the spendable balance.
export function roomUnlockState(
  f: Facility,
  balance: number,
  room: (typeof ZONES)[number],
) {
  const open = f.unlocked.includes(room.id);
  const levels = modules(f);
  const needsGpu = room.id === 'core' && !f.unlocked.includes('compute');
  const missingLevels = Math.max(0, room.modules - levels);
  const missingCompute = Math.max(0, room.cost - balance);
  return {
    open,
    levels,
    needsGpu,
    missingLevels,
    missingCompute,
    canUnlock: !open && !needsGpu && !missingLevels && !missingCompute,
  };
}
