import { BOOST_PRICES, RACK_PRICES } from '@/lib/facility';
import { MACHINE_POWER } from '@/lib/production';
import { ArrowRight, Gamepad2, Hammer, ArrowUp } from 'lucide-react';
import ComputeIcon from './ComputeIcon';

export const GUIDE_TOPICS = [
  {
    id: 'first-machine',
    title: 'Your first machine',
    text: 'Meet Margo, then build your free starter in Center. It is ready for a machine batch or client job.',
    image: '/assets/guide/build.svg',
    alt: 'Illustration: a server rack is placed on an empty building pad',
    tip: 'You don’t need parts, a wallet, or tokens to try the game.',
  },
  {
    id: 'compute',
    title: 'Load a machine batch',
    text: 'Recover parts, then load a short machine batch. Collect its Compute when it finishes.',
    image: '/assets/guide/batch.svg',
    alt: 'Illustration: recovered parts enter a server, a batch completes, and one Compute chip comes out',
    tip: 'A completed batch stops. Pick the next batch or a client job when you are ready.',
  },
  {
    id: 'upgrade',
    title: 'Build capacity and speed',
    text: 'Tap a machine to compare its upgrade cost and client capacity. Speed upgrades shorten new machine batches.',
    image: '/assets/guide/upgrade.svg',
    alt: 'Illustration: two extra modules increase a server rack’s capacity',
    tip: 'Each machine has three levels. Larger client batches and spare machine slots give you more choices.',
  },
  {
    id: 'expand',
    title: 'Open a new room',
    text: 'Open Center → Make room for more. Choose a room, check its price, then unlock space for new machines.',
    image: '/assets/guide/expand.svg',
    alt: 'Illustration: an existing server room connects to new machine spaces',
    tip: 'Cooling costs 100 Compute to open. Its machine costs another 180. Unlocking gives you space; a new machine can take more work.',
  },
  {
    id: 'growth',
    title: 'Keep finding useful work',
    text: 'Open Clients. Compare three customers, reserve a machine and supply the job. For hands-on work, choose Repair & parts jobs.',
    image: '/assets/tutorial/tutorial-server.png',
    alt: 'A server machine ready for another shift',
    tip: 'Demand changes after each booking. Commissions build your Throughput, Resourceful or Reliability specialization. Distinctions combine client work, realm recoveries and crafted supplies into a permanent monument; then you can start another portfolio.',
  },
  {
    id: 'bonuses',
    title: 'Restore a server',
    text: 'When a machine needs attention, tap the glowing circuit buttons to restore it and collect 40 Compute.',
    image: '/assets/guide/repair.svg',
    alt: 'Illustration: the middle of three circuit buttons glows, showing which one to tap first',
    tip: 'Repair is optional. Any batch already running keeps its promised finish time.',
  },
  {
    id: 'daily',
    title: 'A little win every day',
    text: 'Earn 100 Compute in a day from batches and jobs. Claim 35 extra from Daily bonus.',
    image: '/assets/guide/daily-goal.png',
    alt: 'Completed daily goal beside progress toward the three-day gold outfit reward',
    tip: 'Find it in Clients → Repair & parts jobs → Milestones. Complete the goal on three different days to unlock the gold outfit. The days do not need to be consecutive.',
  },
  {
    id: 'locker',
    title: 'Make Noobius yours',
    text: 'Open Locker. Try outfits and accessories, drag to turn Noobius, then Save look.',
    image: '/assets/noobius.jpeg',
    alt: 'Noobius wearing his headset',
    tip: 'You can change your name too. New looks do not change job rewards.',
  },
  {
    id: 'friends',
    title: 'Visit the crew',
    text: 'Open Crew to invite friends and visit up to four neighbors. Meet Margo in the plaza for a shared cluster project.',
    image: '/assets/facility.png',
    alt: 'A data-center campus to explore with other players',
    tip: 'Everyone owns a separate center. Projects use completed jobs and crafted parts. They have no time limit, can be finished alone, and keep your earned reward after you leave.',
  },
  {
    id: 'parts-and-trade',
    title: 'Make parts or trade for them',
    text: 'Collect materials, craft parts in Workshop or buy them from a player. Use them to supply jobs and shared projects.',
    image: '/assets/tutorial/tutorial-toolbox.png',
    alt: 'Parts and tools for your next job',
    tip: 'A completed client job or equipment upgrade unlocks player trade. Missing-parts help marks where to find supplies. You still choose what to collect, craft or buy.',
  },
  {
    id: 'realms',
    title: 'Earn levels. Explore new worlds.',
    text: 'Tap your level beside Compute. Explore Cooling Works at level 3, GPU District at 5 and Archive Depths at 8.',
    image: '/assets/guide/realms.svg',
    alt: 'Illustration: salvage, cooling, GPU and archive destinations have different industrial shapes',
    tip: 'Crew Commons starts at level 1. Each world has three workstations: sort salvage, route coolant, schedule GPUs or recover archives. Live holder realms also need verified holdings and an Operator license: two jobs of each kind, a built module and a completed cluster. Solo practice keeps level gates. Paid recoveries can be finished from anywhere.',
  },
  {
    id: 'controls',
    title: 'Getting around',
    text: 'Tap the floor to walk. Tap an object or press E nearby to use it. Margo’s hint can mark your next location.',
    image: '/assets/tutorial/tutorial-toolbox.png',
    alt: 'Tools for your next game action',
    tip: 'Marking a location does not move Noobius or complete work. WASD or arrows move; E interacts; R turns the view; M opens rooms; Esc opens the menu. Use + / − or the mouse wheel to zoom.',
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
            image: '/assets/guide/build.svg',
          },
          {
            title: 'Collect',
            text: 'Tap the green button for Compute.',
            image: '/assets/compute-currency.png',
          },
          {
            title: 'Upgrade',
            text: 'Spend Compute to earn faster.',
            image: '/assets/guide/upgrade.svg',
          },
          {
            title: 'Expand',
            text: 'New rooms. Stronger machines.',
            image: '/assets/guide/expand.svg',
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
        {atHome ? 'Back to my data center' : 'Return to my data center'}{' '}
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
      <p className="muted-small">Tap to move · + / − to zoom · E on desktop</p>
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
              <ArrowUp />
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
                <figure
                  className={`guide-topic-image guide-image-${t.id}${t.image.endsWith('.svg') ? ' guide-vector-image' : ''}`}
                >
                  <a
                    href={t.image}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open larger image: ${t.title}`}
                  >
                    <img src={t.image} alt={t.alt} loading="lazy" />
                  </a>
                  {t.image.endsWith('.svg') && (
                    <figcaption>Illustration · {t.title}</figcaption>
                  )}
                </figure>
                <details className="guide-tip-details">
                  <summary>More detail</summary>
                  <p>{t.tip}</p>
                </details>
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
          Recover parts and choose a machine batch or client order. A committed
          run can finish while you explore. Collect its payment, then choose
          what to build, trade or save for next.
        </p>
        <p>
          Each machine has three levels. Upgrades add client-batch capacity.
          Speed upgrades shorten new machine batches. The Build panel shows
          the cost and capacity before you buy.
        </p>
        <p>
          Machines stop when a batch ends. They do not start another run on
          their own while you are away. Any Compute earned before this update
          remains yours to collect. Spending your balance never removes a
          machine you already own.
        </p>
      </section>
      <section id="prices">
        <h2>Machines & prices</h2>
        <p>
          Your first machine is free. New machines after that have different
          prices because later rooms contain stronger equipment. These are
          starting prices and client-batch capacity.
        </p>
        <div className="guide-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Machine</th>
                <th>Build cost</th>
                <th>Starting batch capacity</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(RACK_PRICES).map(([id, cost], index) => (
                <tr key={id}>
                  <td>
                    {
                      [
                        'Starter',
                        'Second machine',
                        'Chiller',
                        'Inference',
                        'Training',
                        'Exchange',
                        'The big one',
                      ][index]
                    }
                  </td>
                  <td>{cost || 'Free'}</td>
                  <td>{MACHINE_POWER[id]} units</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Larger machines hold bigger client batches; they do not process the
          same client batch faster. Speed upgrades cost {BOOST_PRICES.join(', ')}
          Compute and shorten newly started machine batches. Room prices and
          requirements appear on each door before you spend.
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
          <strong>$NOOBIUS</strong> is the project’s token. When token trading
          opens, players can list earned Compute at their own price, and other
          players can buy it with $NOOBIUS. There is no fixed exchange rate or
          guaranteed buyer. Compute and tokens are separate balances. Practice
          Compute cannot be sold. The exchange shows whether trading is
          available.
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
          <strong>Not sure what to do?</strong> Read Margo’s hint and mark its
          location. Walk there, then tap the object or press E to interact.
        </p>
        <p>
          <strong>Can’t afford something?</strong> Collect your machines’
          output. Optional boosts and team jobs give you more ways to earn.
        </p>
        <p>
          <strong>A red machine?</strong> Open Center → A little extra and
          follow the glowing circuit buttons. Ordinary earnings keep running.
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
