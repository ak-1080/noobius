import {
  BOOST_PRICES,
  OBJECTS,
  ZONES,
  computePerTick,
  machineGain,
  boostGain,
  modules,
  rackCount,
  rackPrice,
  storedComputeNow,
  dayKey,
  type Facility,
} from './facility.ts';
import type { Objective, NextStep } from './objectives.ts';

// The same next step powers the coach, path and help panel. Costs come from
// the authoritative game rules, so the instructions cannot promise free items.
export function tycoonObjective(
  f: Facility,
  balance: number,
  now: number,
): Objective {
  const first = OBJECTS.find((o) => (f.builds[o.id] ?? 0) > 0)?.id ?? 'rack-a';
  const stored = storedComputeNow(f, now);
  const count = rackCount(f);
  const rate = computePerTick(f) * 4;
  const chapter = !count
    ? '01 · YOUR FIRST MACHINE'
    : !f.computeBoost
      ? '02 · FIRST PAYDAY'
      : count < 2
        ? '03 · GROW YOUR ROOM'
        : f.unlocked.length < 4
          ? '04 · MORE ROOM TO GROW'
          : 'YOUR COMPUTE EMPIRE';
  const wrap = (step: NextStep, progress = 0): Objective => ({
    ...step,
    chapter,
    progress,
    speaker: 'MARGO',
    reward: 'Build → collect → upgrade → expand',
  });
  const collect = (cost: number, next: string): Objective => {
    // A cheap income gain is more useful than a ten-minute instruction to wait.
    // Leave the first room within reach; later, compare each upgrade's payback.
    if (count >= 2) {
      const choices = OBJECTS.filter(
        (o) =>
          o.kind === 'build' &&
          f.unlocked.includes(o.zone) &&
          (f.builds[o.id] ?? 0) > 0 &&
          f.builds[o.id] < 3,
      ).map((o) => ({
        cost: rackPrice(f, o.id),
        gain: machineGain(f, o.id),
        target: o.id,
        action: { type: 'build', id: o.id },
      }));
      if (f.computeBoost < BOOST_PRICES.length)
        choices.push({
          cost: BOOST_PRICES[f.computeBoost],
          gain: boostGain(f),
          target: first,
          action: { type: 'compute-upgrade', id: '' },
        });
      const better = choices
        .filter((u) => u.cost <= balance && u.cost <= cost / 2)
        .sort((a, b) => a.cost / a.gain - b.cost / b.gain)[0];
      if (better)
        return wrap(
          {
            title: 'Grow faster while you save',
            detail: `${better.cost} Compute adds ${better.gain}/min. ${next} comes next.`,
            cta: 'Upgrade',
            target: better.target,
            action: better.action,
          },
          100,
        );
    }
    const seconds = Math.max(
      1,
      15 - (Math.floor((now - f.computeAt) / 1000) % 15),
    );
    return stored > 0
      ? wrap(
          {
            title: next,
            detail:
              balance + stored >= cost
                ? `${stored} Compute ready. Collect, then spend ${cost}.`
                : `${balance + stored} / ${cost} Compute · ${stored} ready to collect.`,
            cta: 'Collect',
            target: first,
            action: { type: 'compute-harvest' },
          },
          Math.min(100, ((balance + stored) / cost) * 100),
        )
      : wrap(
          {
            title: next,
            detail: `${balance} / ${cost} Compute · next +${computePerTick(f)} in ${seconds}s.`,
            cta: 'Open Build',
            panel: 'facility',
          },
          Math.min(100, (balance / cost) * 100),
        );
  };
  if (!f.seen.includes('intro:welcome'))
    return wrap({
      title: 'Meet Margo',
      detail: 'The little green robot has your first machine ready.',
      cta: 'Show me Margo',
      target: 'margo',
      panel: 'briefing',
    });
  if (!count)
    return wrap({
      title: 'Build your free machine',
      detail: 'Tap here. Follow the glowing path. No parts needed.',
      cta: 'Build my machine',
      target: 'rack-a',
      action: { type: 'build', id: 'rack-a' },
    });
  if (!f.computeBoost)
    return balance < BOOST_PRICES[0]
      ? collect(BOOST_PRICES[0], 'Faster machines')
      : wrap(
          {
            title: 'Make your machine faster',
            detail: `Spend ${BOOST_PRICES[0]} Compute · ${rate} → ${rate + boostGain(f)}/min.`,
            cta: 'Upgrade output',
            target: first,
            action: { type: 'compute-upgrade' },
          },
          100,
        );
  const today = dayKey(now);
  const done = f.lastWorkday === today;
  const earned = f.day === today ? (f.daily.computeEarned ?? 0) : 0;
  if (!done && earned >= 100)
    return wrap(
      {
        title: 'You earned a daily bonus!',
        detail: 'You collected 100 Compute today. Pick up 35 extra.',
        cta: 'Claim 35 Compute',
        panel: 'contracts',
      },
      100,
    );
  const available = OBJECTS.filter(
    (o) =>
      o.kind === 'build' &&
      f.unlocked.includes(o.zone) &&
      !(f.builds[o.id] ?? 0),
  ).sort((a, b) => rackPrice(f, a.id) - rackPrice(f, b.id));
  const nextRoom = ZONES.find((z) => !f.unlocked.includes(z.id));
  if (available.length) {
    const plot = available[0],
      cost = rackPrice(f, plot.id);
    return balance < cost
      ? collect(cost, 'Your next machine')
      : wrap(
          {
            title: 'Build another machine',
            detail: `${cost} Compute · ${rate} → ${rate + machineGain(f, plot.id)}/min.`,
            cta: 'Build',
            target: plot.id,
            action: { type: 'build', id: plot.id },
          },
          100,
        );
  }
  if (nextRoom && modules(f) >= nextRoom.modules)
    return balance < nextRoom.cost
      ? collect(nextRoom.cost, nextRoom.name)
      : wrap(
          {
            title: `Open the ${nextRoom.name.toLowerCase()}`,
            detail: `${nextRoom.cost} Compute. More space. More machines.`,
            cta: 'Open room',
            target: 'gate-' + nextRoom.id,
            action: { type: 'unlock', id: nextRoom.id },
          },
          100,
        );
  const upgrade = OBJECTS.filter(
    (o) =>
      o.kind === 'build' &&
      f.unlocked.includes(o.zone) &&
      (f.builds[o.id] ?? 0) < 3,
  ).sort((a, b) => rackPrice(f, a.id) - rackPrice(f, b.id))[0];
  if (upgrade) {
    const cost = rackPrice(f, upgrade.id);
    return balance < cost
      ? collect(cost, 'A bigger machine')
      : wrap(
          {
            title: 'Upgrade a machine',
            detail: `${cost} Compute adds another ${machineGain(f, upgrade.id)}/min.`,
            cta: 'Upgrade',
            target: upgrade.id,
            action: { type: 'build', id: upgrade.id },
          },
          100,
        );
  }
  if (f.computeBoost < BOOST_PRICES.length) {
    const cost = BOOST_PRICES[f.computeBoost];
    return balance < cost
      ? collect(cost, 'Faster machines')
      : wrap(
          {
            title: 'Speed up your whole data center',
            detail: `${cost} Compute adds ${boostGain(f)}/min.`,
            cta: 'Upgrade',
            action: { type: 'compute-upgrade' },
            target: first,
          },
          100,
        );
  }
  if (!done && stored > 0)
    return wrap(
      {
        title: 'Collect for today’s goal',
        detail: `${Math.min(100, earned + stored)} / 100 after collecting. Your whole data center is fully upgraded.`,
        cta: 'Collect',
        target: first,
        action: { type: 'compute-harvest' },
      },
      Math.min(100, earned + stored),
    );
  return wrap(
    {
      title: 'Your empire is humming',
      detail: done
        ? `${rate} Compute/min. Every machine is maxed. Next daily goal tomorrow.`
        : `${rate} Compute/min. Every machine is maxed. Try a new look while your machines earn.`,
      cta: 'Customize Noobius',
      panel: 'appearance',
    },
    100,
  );
}
