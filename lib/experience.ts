import {
  canPay,
  introReady,
  modules,
  workloadCapacity,
  type Facility,
} from './facility.ts';
import { careerFor, contractFor, type ModuleStyle } from './contracts.ts';
import { resolveObjective } from './objectives.ts';
import type { Objective } from './objectives.ts';
import { commissionsFor, milestoneProgress } from './commissions.ts';
import { tycoonObjective } from './tycoon.ts';
import { careerSuggestions, jobSetup, jobSelection } from './job-choices.ts';

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
  connected = false,
  drafts: Record<
    string,
    { style: ModuleStyle; rack: string; quantity?: number }
  > = {},
): Objective {
  if (!f.seen.includes('intro:welcome') || !modules(f))
    return tycoonObjective(f, credits, now);
  const career = careerFor(f);
  const wrap = (step: Partial<Objective>): Objective => ({
    title: 'Choose your next job',
    detail: 'Three kinds of work. Pick the one that fits your plans.',
    cta: 'Open Jobs',
    panel: 'contracts',
    chapter: 'YOUR SHIFT · YOUR CHOICE',
    progress: 0,
    speaker: 'MARGO',
    reward: 'Compute · reputation · new equipment',
    ...step,
  });
  const commissions = commissionsFor(f),
    readyClient = commissions.active.find((r) => r.readyAt <= now),
    field = f.fieldWork?.active;
  if (readyClient)
    return wrap({
      title: 'Your client has paid',
      detail: `${readyClient.client} · ${readyClient.reward} Compute ready to collect.`,
      cta: 'Review payment',
      panel: 'operations',
      progress: 100,
    });
  if (field && (field.readyAt === null || field.readyAt <= now))
    return wrap({
      title:
        field.readyAt !== null && field.readyAt <= now
          ? 'Your recovery is ready'
          : 'Finish your realm recovery',
      detail:
        field.readyAt === null
          ? 'Open your station plan. Supplies are already committed.'
          : 'Collect into Storage when processing finishes, or explore while you wait.',
      cta: 'Open recovery',
      panel: 'field',
    });
  const current =
    career.active.find((r) => r.id === career.selected) ?? career.active[0];
  if (current) {
    const template = contractFor(current);
    if (current.state === 'accepted') {
      const draft = drafts[current.id];
      const selection = jobSelection(
        f,
        draft?.style ?? 'standard',
        draft?.rack ?? '',
        now,
      );
      const quote = jobSetup(
        f,
        template,
        selection.style,
        selection.rack,
        now,
        current.quoteVersion === 2 ? (draft?.quantity ?? 1) : 1,
        current.quoteVersion ?? 1,
      );
      if (
        !selection.styleAvailable ||
        (template.family === 'workload' &&
          (!selection.rack ||
            (current.quoteVersion === 2 &&
              (draft?.quantity ?? 1) > workloadCapacity(f, selection.rack))))
      )
        return wrap({
          title: `Set up ${template.name}`,
          detail:
            'Choose available equipment and a machine that fits your batch. Then prepare only the parts you need.',
          view: { jobsTab: 'board', jobId: current.id },
        });
      if (selection.styleAvailable && !canPay(f.inventory, quote.cost))
        return {
          ...resolveObjective(f, credits, now, { items: quote.cost }),
          chapter: `SUPPLIES FOR ${template.name.toUpperCase()}`,
          reward: 'Prepare your parts, then return to Jobs',
        };
    }
    const ready =
      current.state === 'ready' ||
      (current.readyAt !== null && current.readyAt <= now);
    return wrap({
      view: { jobsTab: 'board', jobId: current.id },
      title: ready ? 'Your work paid off' : template.name,
      detail: ready
        ? 'Review the completed job and collect your payment.'
        : current.state === 'accepted'
          ? template.goal
          : template.family !== 'service'
            ? 'Your client is processing the work. Take another job or explore.'
            : 'Return to the worksite and finish the repair.',
      target:
        ready ||
        template.family === 'workload' ||
        (current.state === 'running' && template.family === 'supply')
          ? undefined
          : template.target,
      progress: ready
        ? 100
        : current.readyAt && current.startedAt !== null
          ? Math.min(
              100,
              ((now - current.startedAt) /
                (current.readyAt - current.startedAt)) *
                100,
            )
          : current.steps * 25,
    });
  }
  if (
    !Object.values(career.completed).some((n) => n > 0) &&
    commissions.serial === 1 &&
    modules(f) < 9
  )
    return wrap({
      title: 'Pick your first job',
      detail:
        'Fix a fault, deliver parts, or run a computing job. Accept one to see exactly what you need.',
      view: { jobsTab: 'board' },
    });
  if (modules(f) >= 9 || commissions.active.length || commissions.serial > 1) {
    const p = milestoneProgress(f);
    return wrap({
      title: p.ready
        ? `Build distinction ${p.chapter}`
        : 'Choose your next client',
      detail: p.ready
        ? 'Your portfolio is complete. Prepare the build materials and commission your monument.'
        : `${p.jobs}/${p.needed} client jobs toward distinction ${p.chapter}. Mix specialties and bring supplies from the realms.`,
      cta: 'Open client desk',
      panel: 'operations',
      reward: 'Specialty records · permanent distinctions',
    });
  }
  return careerSuggestions(f, credits, connected)[0] ?? wrap({});
}
