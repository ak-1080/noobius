import {
  availableRacks,
  careerFor,
  completedContracts,
  contractQuote,
  contractFor,
  MODULES,
  type ContractTemplate,
  type ModuleStyle,
} from './contracts.ts';
import { reportsAvailable } from './projects.ts';
import type { Facility, ItemId } from './facility.ts';
import type { Objective } from './objectives.ts';

export function jobSetup(
  f: Facility,
  template: ContractTemplate,
  style: ModuleStyle,
  rack?: string,
  now = Date.now(),
  quantity = 1,
  quoteVersion: 1 | 2 = 2,
) {
  const quote = contractQuote(
    f,
    template,
    style,
    rack,
    now,
    quantity,
    quoteVersion,
  );
  const standard = contractQuote(
    f,
    template,
    'standard',
    rack,
    now,
    quantity,
    quoteVersion,
  );
  const materials = [
    ...new Set([...Object.keys(standard.cost), ...Object.keys(quote.cost)]),
  ]
    .map((key) => {
      const item = key as ItemId;
      return {
        item,
        change: (quote.cost[item] ?? 0) - (standard.cost[item] ?? 0),
      };
    })
    .filter((entry) => entry.change !== 0);
  return {
    ...quote,
    reservedOutput: quote.reimbursed,
    secondsSaved: standard.duration - quote.duration,
    reputationBonus: quote.reputation - standard.reputation,
    materials,
    changesTerms:
      materials.length > 0 ||
      quote.duration !== standard.duration ||
      quote.reputation !== standard.reputation,
  };
}
export const usefulStyles = (f: Facility, template: ContractTemplate) =>
  MODULES.map((m) => m.id).filter(
    (style) => jobSetup(f, template, style, undefined, 0).changesTerms,
  );

export function jobSelection(
  f: Facility,
  chosenStyle: ModuleStyle,
  chosenRack: string,
) {
  const c = careerFor(f);
  return {
    style: chosenStyle,
    styleAvailable:
      chosenStyle === 'standard' || c.loadout.includes(chosenStyle),
    rack: availableRacks(f).includes(chosenRack) ? chosenRack : undefined,
  };
}

/** Suggestions only: never accept jobs, equip modules or spend from a guide. */
export function careerSuggestions(
  f: Facility,
  credits: number,
  connected = false,
): Objective[] {
  const c = careerFor(f),
    count = completedContracts(c);
  const result: Objective[] = [];
  const wrap = (value: Partial<Objective>): Objective => ({
    title: 'Choose a client job',
    detail: 'Earn Compute and a report for your next crew project.',
    cta: 'Open Jobs',
    panel: 'contracts',
    chapter: 'YOUR NEXT GOAL',
    progress: 0,
    speaker: 'MARGO',
    reward: 'Choose your own next step',
    ...value,
  });
  const nextModule = MODULES.find(
    (m) => !c.modules.includes(m.id) && count >= m.required,
  );
  if (nextModule)
    result.push(
      wrap({
        title: `Build your ${nextModule.name} module`,
        detail: `${nextModule.description} ${nextModule.price} Compute${credits < nextModule.price ? ` · ${nextModule.price - credits} more needed` : ''}.`,
        view: { jobsTab: 'equipment' },
        reward: 'Blueprint unlocked · build it when ready',
      }),
    );

  if (
    connected &&
    ['service', 'supply', 'workload'].every(
      (family) =>
        reportsAvailable(c, family as 'service' | 'supply' | 'workload') > 0,
    )
  )
    result.push(
      wrap({
        title: 'Put your reports to work',
        detail:
          'You have all three kinds. Bring reports and crafted parts to Margo for a neighborhood cluster.',
        panel: 'project',
        reward: 'Cooperate, commission and collect',
        progress: 100,
      }),
    );

  const offers = c.offers
    .filter((offer) => !c.active.some((run) => run.id === offer.id))
    .sort((a, b) => {
      const fa = contractFor(a).family,
        fb = contractFor(b).family;
      return (
        reportsAvailable(c, fa) - reportsAvailable(c, fb) ||
        c.completed[fa] - c.completed[fb]
      );
    });
  for (const offer of offers) {
    const t = contractFor(offer);
    const style = usefulStyles(f, t).find(
      (s) => c.modules.includes(s) && !c.mastery?.[t.id]?.[s],
    );
    const label = style ? MODULES.find((m) => m.id === style)!.name : undefined;
    result.push(
      wrap({
        title: style ? `Try ${label}: ${t.name}` : t.name,
        detail: style
          ? `Compare ${label} with Standard, then finish this job to earn a new setup stamp.`
          : `${t.goal} Earn a ${t.family} report${c.completed[t.family] < 2 ? ` · ${c.completed[t.family]}/2 toward your license` : ' for future projects'}.`,
        view: { jobsTab: 'board', family: t.family, style },
        progress: style
          ? 0
          : c.completed[t.family] < 2
            ? c.completed[t.family] * 50
            : 0,
        reward: style
          ? 'A different setup to master'
          : `${contractQuote(f, t, 'standard', undefined, 0).fee} Compute for one unit + one job report`,
      }),
    );
  }
  return result.slice(0, 3);
}
