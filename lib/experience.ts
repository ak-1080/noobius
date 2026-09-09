import { introReady, modules, type Facility } from './facility.ts';
import { careerFor, contractTemplate } from './contracts.ts';
import { resolveObjective } from './objectives.ts';
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
    tip: 'Directions show you where. You choose what to build.',
    cta: 'Show me the machine',
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
  if (!f.seen.includes('intro:welcome') || !modules(f)) return tycoonObjective(f, credits, now);
  const career = careerFor(f);
  const wrap = (step: Partial<Objective>): Objective => ({ title: 'Choose your next job', detail: 'Three kinds of work. Pick the one that fits your plans.', cta: 'Open Jobs', panel: 'contracts', chapter: 'YOUR SHIFT · YOUR CHOICE', progress: 0, speaker: 'MARGO', reward: 'Compute · reputation · new equipment', ...step });
  const current = career.active.find(r => r.id === career.selected) ?? career.active[0];
  if (current) {
    const template = contractTemplate(current.template);
    const ready = current.state === 'ready' || (current.readyAt !== null && current.readyAt <= now);
    return wrap({ title: ready ? 'Your work paid off' : template.name, detail: ready ? 'Review the completed job and collect your payment.' : current.state === 'accepted' ? template.goal : template.family !== 'service' ? 'Your client is processing the work. Take another job or explore.' : 'Return to the worksite and finish the repair.', target: ready || template.family === 'workload' || (current.state === 'running' && template.family === 'supply') ? undefined : template.target, progress: ready ? 100 : current.readyAt && current.startedAt !== null ? Math.min(100, (now - current.startedAt) / (current.readyAt - current.startedAt) * 100) : current.steps * 25 });
  }
  if (!(f.stats.gathered ?? 0)) return wrap({ title: 'Find your first spare parts', detail: 'Visit the salvage pile. Click it to recover useful parts.', target: 'scrap-a', panel: undefined });
  if (!(f.stats.crafted ?? 0)) return { ...resolveObjective(f, credits, now, { recipe: 'kit' }), chapter: 'MAKE SOMETHING USEFUL', reward: 'Craft a kit, then choose a client job' };
  return wrap({ progress: career.reputation ? 20 : 0 });
}
