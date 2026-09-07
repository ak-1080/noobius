import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Meet Noobius — The Night Shift',
  description:
    'A headset, a wrench, and insufficient training. Meet the little noob keeping the future online.',
};

export default function Story() {
  return (
    <main className="story-page">
      <header className="story-header">
        <a className="wordmark" href="/" aria-label="Noobius home">
          noobius<span>•</span>
        </a>
        <a className="story-back" href="/">
          <ArrowLeft size={16} /> Back home
        </a>
      </header>
      <article className="story-profile">
        <div className="story-identity">
          <img
            src="/assets/noobius.jpeg"
            alt="Noobius in his black headset and off-white shirt"
            width={184}
            height={184}
          />
          <div>
            <span className="story-eyebrow">MEET THE NIGHT SHIFT</span>
            <h1>
              Noobius<span>.</span>
            </h1>
            <p>AI data-center worker. Still figuring it out.</p>
            <span className="story-status">
              <i /> Currently on shift
            </span>
          </div>
        </div>
        <div className="story-narrative">
          <h2>
            Everyone said AI would do all the work.
            <br />
            Then Noobius got hired.
          </h2>
          <p>
            The GPUs are overheating. The network is down. Management just
            ordered another cluster. Noobius has a headset, a wrench, and
            insufficient training. He clocks in anyway.
          </p>
          <p>
            While everyone bets on the future, he’s under a server rack trying
            to turn it back on.
          </p>
          <p>
            You start with one broken machine. Find parts, fix things, and build
            a bigger data center. Margo, Bit, and Patch have your back. Mostly.
          </p>
          <p className="story-mission">His mission: keep the future online.</p>
          <a className="story-play" href="/">
            Clock in <ArrowRight size={18} />
          </a>
        </div>
      </article>
    </main>
  );
}
