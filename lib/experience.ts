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
    title: 'You’re Noobius. Let’s clock in.',
    text: 'This data center starts small. Your job is to turn it into a compute empire, one rack at a time.',
    tip: 'Tap “Meet Margo” and Noobius will follow the glowing path. You can also click the floor or use WASD to walk.',
    cta: 'Meet Margo',
    target: 'margo',
  },
  {
    id: 'welcome',
    who: 'Margo',
    role: 'Shift supervisor',
    title: 'Big future. Tiny starting budget.',
    text: 'First, collect scrap from the Salvage Yard. We’ll turn it into a repair kit and use that to build your first rack.',
    tip: 'The job card always tells you what to do next. Tap it to walk to the right place and get to work.',
    cta: 'Show me the scrap',
  },
  {
    id: 'salvage',
    who: 'Bit',
    role: 'Parts collector',
    title: 'That junk is your first upgrade.',
    text: 'Scrap and copper go in your backpack. Make them into a kit at the workbench. Collect your job reward whenever Margo has one ready.',
    tip: 'Parts build things. Credits buy things. Built racks generate compute.',
    cta: 'Keep building',
  },
  {
    id: 'craft',
    who: 'Patch',
    role: 'Campus mechanic',
    title: 'One kit. One step closer.',
    text: 'Your repair kit is ready. Add copper and a few credits, and you can bring your first rack online.',
    tip: 'Missing something? Follow the job card. It finds the parts, locker items, or repair income you need.',
    cta: 'Build my first rack',
  },
  {
    id: 'rack',
    who: 'Margo',
    role: 'First rack online',
    title: 'Now you own a little piece of the floor.',
    text: 'That rack generates stored compute every 15 seconds, even between visits. Collect it before storage fills. More racks and efficiency upgrades mean more output.',
    tip: 'Run a quick batch for an extra compute payout while your rack keeps working.',
    cta: 'Run my first batch',
  },
  {
    id: 'compute',
    who: 'Margo',
    role: 'Compute earned',
    title: 'That’s your first compute payout.',
    text: 'Reinvest compute in efficiency, expand your campus with parts and credits, or try the demo token exchange.',
    tip: 'The exchange is a preview: 100 compute becomes 10 demo $NOOBIUS. It does not send real tokens.',
    cta: 'Keep the campus growing',
  },
  {
    id: 'outage',
    who: 'Patch',
    role: 'Incident resolved',
    title: 'Back online. Nice recovery.',
    text: 'Outages pause new compute, but never take away your built racks or collected balance. Your waiting batch is safe too.',
    tip: 'The next fault might be cooling, power, or networking. Follow the repair steps for bonus compute.',
    cta: 'Back to the floor',
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
