import { introReady, type Facility } from './facility.ts';
import type { Objective } from './objectives.ts';
import { tycoonObjective } from './tycoon.ts';

export const BRIEFINGS = [
  {
    id: 'arrival',
    who: 'Dispatch',
    role: 'Your first shift',
    title: 'Your first data center.',
    text: 'One rack. Then an empire.',
    tip: 'Follow the glowing path.',
    cta: 'Meet Margo',
    target: 'margo',
  },
  {
    id: 'welcome',
    who: 'Margo',
    role: 'Shift supervisor',
    title: 'Let’s build your first machine.',
    text: 'Your first machine is on me. Let’s give it a home.',
    tip: 'Tap your next step to get moving.',
    cta: 'Build my free machine',
  },
] as const;
export type Briefing = (typeof BRIEFINGS)[number];
export function nextBriefing(f: Facility): Briefing | undefined {
  return BRIEFINGS.find(
    (b) => !f.seen.includes('intro:' + b.id) && introReady(f, b.id),
  );
}
export function shiftObjective(
  f: Facility,
  credits: number,
  now: number,
): Objective {
  return tycoonObjective(f, credits, now);
}
