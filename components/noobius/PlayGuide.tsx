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
    text: 'Meet Margo, the little green robot. Tap “Next up” and Noobius walks over. Your first machine is free. Build it and watch the lights turn green.',
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
    text: 'Open Build. Buy another machine or choose Faster machines. The numbers show what you earn now and what you’ll earn after buying.',
    image: '/assets/guide/build.png',
    alt: 'Build after the first speed upgrade, showing 36 Compute per minute',
    tip: 'Your first speed upgrade costs 20 Compute. It raises starter income to 36 per minute.',
  },
  {
    id: 'expand',
    title: 'Open a new room',
    text: 'Fill your first room, then tap “Make room for more” in Build. Spend Compute to open a door. Later rooms have stronger machines.',
    image: '/assets/facility.png',
    alt: 'An expanding data center full of server machines',
    tip: 'The first new room costs 100 Compute. You choose when to buy it. Machine levels count toward opening doors.',
  },
  {
    id: 'bonuses',
    title: 'Play for a little extra',
    text: 'Try a boost in your machine panel. Or tap the gold Bonus button when it appears. Wake the sleepy server by tapping three glowing buttons.',
    image: '/assets/guide/bonus.png',
    alt: 'Bonus round: tap the glowing button to light up all three',
    tip: 'Bonuses are optional. Your machines keep earning while you play.',
  },
  {
    id: 'daily',
    title: 'A little win every day',
    text: 'Open Goals and collect 100 Compute that day. Claim 35 more as a bonus. Finish on three different days to unlock the gold outfit.',
    image: '/assets/compute-currency.png',
    alt: 'Compute collected toward your daily goal',
    tip: 'No streak to lose. Take a day off whenever you like.',
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
    text: 'Connect a wallet to save your data center. Travel lets you visit other players or enter a shared campus for team jobs.',
    image: '/assets/facility.png',
    alt: 'A data-center campus to explore with other players',
    tip: 'Your own data center belongs to you. Visitors can look around; they can’t spend your Compute.',
  },
  {
    id: 'controls',
    title: 'Getting around',
    text: 'Tap the floor to walk. Tap a machine to open it. “Next up” leads you to your next goal. Scroll to zoom in or out.',
    image: '/assets/tutorial/tutorial-toolbox.png',
    alt: 'Tools for your next game action',
    tip: 'Keyboard: WASD or arrows to move · E to use · R to turn the view · M for rooms · Esc for the menu.',
  },
] as const;

export function QuickGuide({ onFollow }: { onFollow: () => void }) {
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
        Show me my next step <ArrowRight size={19} />
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
          Guest play is a tryout. Reloading clears guest progress, and it cannot
          be moved into a wallet account. Connect before a long session if you
          want to keep what you build.
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
          cost, countdown, or location you need.
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
