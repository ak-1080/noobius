import {
  activeIncident,
  introReady,
  modules,
  OBJECTS,
  type Facility,
} from './facility.ts';
import { resolveObjective, type Objective } from './objectives.ts';

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
    title: 'Let’s build your first rack.',
    text: 'Collect scrap. Make a kit. Power up.',
    tip: 'Tap your next step to get moving.',
    cta: 'Show me the scrap',
  },
  {
    id: 'salvage',
    who: 'Bit',
    role: 'Parts collector',
    title: 'Good find.',
    text: 'Keep collecting parts for your first rack.',
    tip: 'Your next step shows what’s missing.',
    cta: 'Keep building',
  },
  {
    id: 'craft',
    who: 'Patch',
    role: 'Campus mechanic',
    title: 'Ready to build.',
    text: 'Your kit is ready. Let’s install it.',
    tip: 'Need parts? Tap your next step.',
    cta: 'Keep going',
  },
  {
    id: 'rack',
    who: 'Margo',
    role: 'First rack online',
    title: 'You’re online.',
    text: 'Your rack makes Compute. Collect it. Upgrade. Repeat.',
    tip: 'Run a batch for a little extra.',
    cta: 'Run my first batch',
  },
  {
    id: 'compute',
    who: 'Margo',
    role: 'Compute earned',
    title: 'First payday.',
    text: 'Spend Compute to grow your facility.',
    tip: 'Travel → meet the crew. Locker → make it yours.',
    cta: 'Keep building',
  },
  {
    id: 'outage',
    who: 'Patch',
    role: 'Incident resolved',
    title: 'Crisis handled.',
    text: 'Production is back. Nothing lost.',
    tip: 'Red light? Time for a repair.',
    cta: 'Let’s go',
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
  const base = resolveObjective(f, credits, now);
  if (!f.seen.includes('intro:welcome'))
    return {
      ...base,
      title: 'Meet Margo',
      detail:
        'Your supervisor is waiting in Crew Commons. Follow the glowing arrow.',
      cta: 'Walk to Margo',
      target: 'margo',
      action: undefined,
      repair: false,
      panel: 'briefing',
      wait: false,
    };
  const incident = activeIncident(f, now);
  if (incident)
    return {
      ...base,
      title: 'Outage! Get this rack back online',
      detail: 'Compute is paused. Follow three repair steps for +40 compute.',
      cta: 'Show me the outage',
      target: incident.rack,
      action: undefined,
      repair: false,
      panel: 'outage',
      wait: false,
    };
  if (modules(f) && !(f.stats.computeJobs ?? 0)) {
    const rack =
      f.workload?.rack ?? OBJECTS.find((o) => (f.builds[o.id] ?? 0) > 0)?.id;
    return {
      ...base,
      title: f.workload
        ? f.workload.readyAt <= now
          ? 'Your first compute is ready!'
          : 'Your first batch is running'
        : 'Run your first compute batch',
      detail: f.workload
        ? f.workload.readyAt > now
          ? `${Math.ceil((f.workload.readyAt - now) / 1000)} seconds left. Keep exploring, or open your rack to watch.`
          : `Collect ${f.workload.reward} compute from your finished batch.`
        : 'Your new rack can now earn compute. Let’s put it to work.',
      cta: 'Open my rack',
      target: rack,
      action: undefined,
      repair: false,
      panel: 'compute',
      wait: false,
    };
  }
  return base;
}
