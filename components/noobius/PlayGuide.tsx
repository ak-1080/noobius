import {
  ArrowRight,
  Gamepad2,
  Hammer,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react';
import ComputeIcon from './ComputeIcon';

export const GUIDE_TOPICS = [
  {
    id: 'first-machine',
    title: 'Your first machine',
    text: 'Meet Margo, the little green robot. Tap “Your next move” and Noobius walks over. Your first machine is free. Build it and watch the lights turn green.',
    image: '/assets/guide/welcome.png',
    alt: 'Margo’s welcome: build your first machine for free',
    tip: 'You don’t need parts, a wallet, or tokens to try the game.',
  },
  {
    id: 'compute',
    title: 'Collect your Compute',
    text: 'Compute is your game money. Machines make it every 15 seconds. Tap the green Collect button to move it into your balance.',
    image: '/assets/compute-currency.png',
    alt: 'The lime microchip coin that represents Compute',
    tip: 'Your starter makes 24 Compute per minute. Storage holds an hour of earnings.',
  },
  {
    id: 'upgrade',
    title: 'Make more, faster',
    text: 'Open Center. Collect what your machines have made, then choose an upgrade. Tap a machine in the world to see its own upgrade first.',
    image: '/assets/guide/build-and-collect.png',
    alt: 'Build menu: collect machine earnings, then choose an upgrade with its price and income change',
    tip: 'The “Faster machines” upgrade speeds up every machine at once. Each machine also has three levels of its own.',
  },
  {
    id: 'expand',
    title: 'Open a new room',
    text: 'In Center, tap “Make room for more.” Choose a room to see its machine spots, prices, and requirements. Unlock it, then tap “Go to room.”',
    image: '/assets/facility.png',
    alt: 'An expanding data center full of server machines',
    tip: 'Cooling costs 100 Compute to open. Its machine costs another 180. Unlocking the room gives you space; building the machine makes it earn.',
  },
  {
    id: 'growth',
    title: 'Keep finding useful work',
    text: 'A fully built center is ready for bigger choices. Repair a fault, craft an order or reserve a machine for a client workload. Completing a job reveals a new offer.',
    image: '/assets/tutorial/tutorial-server.png',
    alt: 'A server machine ready for another shift',
    tip: 'Try Fast, Efficient and Stable modules. Different setups earn mastery stamps and change the time, parts or reputation a job offers.',
  },
  {
    id: 'bonuses',
    title: 'Play for a little extra',
    text: 'Open Center and choose “A little extra” for a bonus boost. Or tap the gold Bonus button when it appears. Light up three buttons to wake a sleepy server.',
    image: '/assets/guide/bonus.png',
    alt: 'Bonus round: tap the glowing button to light up all three',
    tip: 'Bonuses are optional. Your machines keep earning while you play.',
  },
  {
    id: 'daily',
    title: 'A little win every day',
    text: 'Collect 100 Compute that day. In Jobs → Milestones, open “Daily bonus” and claim 35 more. Finish on three different days to unlock the gold outfit.',
    image: '/assets/guide/daily-goal.png',
    alt: 'Completed daily goal beside progress toward the three-day gold outfit reward',
    tip: 'Preview the gold outfit right from Jobs → Milestones. No streak to lose. Take a day off whenever you like.',
  },
  {
    id: 'locker',
    title: 'Make Noobius yours',
    text: 'Open Locker. Try colors, outfits, and accessories on a big live preview. Drag to turn him around, then Save look when you’re happy.',
    image: '/assets/noobius.jpeg',
    alt: 'Noobius wearing his headset',
    tip: 'You can change your name too. New looks do not change your income.',
  },
  {
    id: 'friends',
    title: 'Visit the crew',
    text: 'Open Crew to meet up to four neighbors. Each player keeps their own center. Copy an invitation, visit a center or meet Margo in the plaza to build a cluster together.',
    image: '/assets/facility.png',
    alt: 'A data-center campus to explore with other players',
    tip: 'Projects use completed jobs and crafted parts. They have no time limit, can be finished alone, and keep your earned reward after you leave.',
  },
  {
    id: 'parts-and-trade',
    title: 'Make parts or trade for them',
    text: 'Supply jobs and cluster projects need real parts. Find them in your center, craft them at the workshop or buy from a player. Missing-parts help shows a route; it does not spend for you.',
    image: '/assets/tutorial/tutorial-toolbox.png',
    alt: 'Parts and tools for your next job',
    tip: 'A first completed client job or equipment upgrade unlocks player trade. Search all offers, send one to a neighbor, or cancel yours to recover goods in parts storage.',
  },
  {
    id: 'realms',
    title: 'Explore GPU District',
    text: 'Earn an Operator license with two jobs of each kind, a built module and a completed neighborhood cluster. GPU District adds projects needing Fast workloads, Stable repairs or Efficient deliveries. Select the required equipment before starting the job.',
    image: '/assets/facility.png',
    alt: 'A larger computing facility',
    tip: 'Holder access is checked separately when available. Your free center keeps working, and losing realm access never deletes your equipment or earned rewards.',
  },
  {
    id: 'controls',
    title: 'Getting around',
    text: 'Tap the floor to walk. Tap a machine to open it. “Your next move” leads you to your next goal. Scroll to zoom in or out.',
    image: '/assets/tutorial/tutorial-toolbox.png',
    alt: 'Tools for your next game action',
    tip: 'Keyboard: WASD or arrows to move · E to use · R to turn the view · M for rooms · Esc for the menu.',
  },
] as const;

export function QuickGuide({
  onFollow,
  atHome = true,
}: {
  onFollow: () => void;
  atHome?: boolean;
}) {
  return (
    <div className="quick-guide">
      <div className="quick-guide-grid">
        {[
          {
            title: 'Build',
            text: 'Your first machine is free.',
            icon: Hammer,
            image: '/assets/tutorial/tutorial-server.png',
          },
          {
            title: 'Collect',
            text: 'Tap the green button for Compute.',
            icon: Wallet,
            image: '/assets/compute-currency.png',
          },
          {
            title: 'Upgrade',
            text: 'Spend Compute to earn faster.',
            icon: Sparkles,
            image: '/assets/tutorial/tutorial-server.png',
          },
          {
            title: 'Expand',
            text: 'New rooms. Stronger machines.',
            icon: Trophy,
            image: '/assets/tutorial/tutorial-server.png',
          },
        ].map((s, i) => (
          <div key={s.title}>
            <img src={s.image} alt="" />
            <span>{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </div>
      <button className="primary-action" onClick={onFollow}>
        {atHome ? 'Show me my next step' : 'Return to my data center'}{' '}
        <ArrowRight size={19} />
      </button>
      <a
        className="text-action"
        href="/how-to-play"
        target="_blank"
        rel="noreferrer"
      >
        Open the picture guide <ArrowRight size={17} />
      </a>
      <p className="muted-small">Tap to move · Scroll to zoom · E to use</p>
    </div>
  );
}

export default function PlayGuide({ docs = false }: { docs?: boolean }) {
  const topics = docs
    ? [
        { id: 'game-loop', title: 'The game loop' },
        { id: 'prices', title: 'Machines & prices' },
        { id: 'saving', title: 'Saving your game' },
        { id: 'currencies', title: 'Compute & $NOOBIUS' },
        { id: 'multiplayer', title: 'Playing together' },
        { id: 'help', title: 'When you’re stuck' },
      ]
    : GUIDE_TOPICS;
  return (
    <main className="play-guide-page">
      <header className="play-guide-header">
        <a className="wordmark" href="/">
          noobius<span>•</span>
        </a>
        <nav aria-label="Guide navigation">
          <a href="/how-to-play" aria-current={!docs ? 'page' : undefined}>
            How to play
          </a>
          <a href="/docs" aria-current={docs ? 'page' : undefined}>
            Docs
          </a>
        </nav>
        <a className="guide-play-button" href="/">
          Play now <ArrowRight size={17} />
        </a>
      </header>
      <div className="play-guide-layout">
        <aside aria-label="On this page">
          <p>{docs ? 'THE DETAILS' : 'HOW TO PLAY'}</p>
          {topics.map((t, i) => (
            <a key={t.id} href={'#' + t.id}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {t.title}
            </a>
          ))}
          <a className="guide-switch" href={docs ? '/how-to-play' : '/docs'}>
            {docs ? 'Back to the picture guide' : 'Want the details? Read Docs'}{' '}
            <ArrowRight size={15} />
          </a>
        </aside>
        <article className="play-guide-article">
          <section className="guide-intro">
            <span className="story-eyebrow">THE NOOB’S GUIDE</span>
            <h1>{docs ? 'A few more details.' : 'Small noob. Big plans.'}</h1>
            <p>
              {docs
                ? 'The rules behind your machines, money, and progress.'
                : 'Build machines. Collect Compute. Grow your own data center.'}
            </p>
            <div className="guide-loop-icons">
              <Hammer />
              <ArrowRight />
              <ComputeIcon size={42} />
              <ArrowRight />
              <Sparkles />
              <ArrowRight />
              <Gamepad2 />
            </div>
          </section>
          {!docs ? (
            GUIDE_TOPICS.map((t, i) => (
              <section className="guide-topic" id={t.id} key={t.id}>
                <h2>
                  <span>{i + 1}</span>
                  {t.title}
                </h2>
                <p>{t.text}</p>
                <figure className={`guide-topic-image guide-image-${t.id}`}>
                  <a
                    href={t.image}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open larger image: ${t.title}`}
                  >
                    <img src={t.image} alt={t.alt} loading="lazy" />
                  </a>
                </figure>
                <p className="guide-tip">{t.tip}</p>
              </section>
            ))
          ) : (
            <GuideDetails />
          )}
          <a className="guide-bottom-play" href="/">
            Ready for your first machine?{' '}
            <strong>
              Let’s play <ArrowRight size={20} />
            </strong>
          </a>
        </article>
      </div>
    </main>
  );
}

function GuideDetails() {
  return (
    <div className="guide-details">
      <section id="game-loop">
        <h2>The game loop</h2>
        <p>
          Every player has their own data center. Start with one free machine.
          It makes 6 Compute every 15 seconds. Collect your earnings, then buy
          stronger machines, faster output, and more rooms.
        </p>
        <p>
          Each machine has three levels. Every level adds that machine’s
          starting output again. Speed upgrades improve every machine at once.
          The Build panel shows the exact cost and income change before you buy.
        </p>
        <p>
          Machines store up to one hour of current output. They keep earning
          while you’re away until storage is full. Collect to make space.
          Spending your balance never removes a machine you already own.
        </p>
      </section>
      <section id="prices">
        <h2>Machines & prices</h2>
        <p>
          Your first machine is free. New machines after that have different
          prices because later rooms contain stronger equipment. These are
          starting prices and income before speed upgrades.
        </p>
        <div className="guide-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Machine</th>
                <th>Build cost</th>
                <th>Compute / min</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Starter', 'Free', 24],
                ['Second machine', 75, 24],
                ['Chiller', 180, 48],
                ['Inference', 450, 72],
                ['Training', 800, 96],
                ['Exchange', 1800, 144],
                ['The big one', 4500, 240],
              ].map(([name, cost, rate]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{cost}</td>
                  <td>{rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Each speed upgrade adds half of the original income again to every
          machine level. The five speed upgrades cost 20, 200, 900, 3,500, and
          12,000 Compute. Room prices are 100, 750, 2,000, and 6,000 Compute;
          each door shows its machine-level requirement.
        </p>
      </section>
      <section id="saving">
        <h2>Saving your game</h2>
        <p>
          Connect a supported browser wallet and sign the login message to save.
          Signing in costs no gas. Your machines, money, name, and outfits
          belong to that account.
        </p>
        <p>
          Practice saves automatically in this browser. Come back and choose
          Continue my game. Clearing browser data removes that save. Practice
          progress stays separate from wallet accounts, tokens, and ranked
          scores. Check the pause menu to see whether browser saving is working.
        </p>
      </section>
      <section id="currencies">
        <h2>Compute & $NOOBIUS</h2>
        <p>
          <strong>Compute</strong> is the game balance. Machines, optional jobs,
          and daily rewards earn it. Spend it on buildings, upgrades, rooms,
          cosmetics, and items in the player market. If you run out, your
          machines still earn more.
        </p>
        <p>
          <strong>$NOOBIUS</strong> is the project’s token. The exchange screen
          previews a token request; blockchain transfers and cash-out are not
          connected yet. Compute and the token are separate balances. A preview
          does not spend Compute or send tokens.
        </p>
        <p>
          Other collected items are optional materials for workshop activities
          and player trading. You do not need a crafting recipe or a power
          budget to build your data center.
        </p>
      </section>
      <section id="multiplayer">
        <h2>Playing together</h2>
        <p>
          Your home is your own. Visitors cannot build, take your earnings, or
          change your look. Travel opens visits and shared campuses for
          connected accounts. Shared jobs pay their stated game rewards when
          completed.
        </p>
        <p>
          Other players’ movement updates regularly, so a slow connection may
          make movement look delayed. If the connection drops, reopen Travel
          once it returns. Your saved purchases remain attached to your account.
        </p>
      </section>
      <section id="help">
        <h2>When you’re stuck</h2>
        <p>
          <strong>Not sure what to do?</strong> Tap “Next up.” It shows the
          action, cost, or countdown you need. While Noobius is walking, tap
          “Stop walking” to take control.
        </p>
        <p>
          <strong>Can’t afford something?</strong> Collect your machines’
          output. Optional boosts and team jobs give you more ways to earn.
        </p>
        <p>
          <strong>A red machine?</strong> Tap the gold Bonus button for a short
          light-up game. Ordinary earnings keep running.
        </p>
        <p>
          <strong>A purchase failed?</strong> Check your balance and connection,
          then try again. The game checks purchases before changing your
          balance.
        </p>
        <p>
          <strong>A part is still being made?</strong> Open Workshop from the
          menu and collect it when ready. Older inventory and unfinished work
          are kept.
        </p>
      </section>
    </div>
  );
}
