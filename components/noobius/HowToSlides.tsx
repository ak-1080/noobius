'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
const slides = [
  {
    image: '/assets/noobius.jpeg',
    alt: 'Noobius ready for his first shift',
    title: 'Never wonder what’s next.',
    text: '“Next up” tells you what to do. Tap its action to collect, build, or follow the glowing path.',
  },
  {
    image: '/assets/tutorial/tutorial-server.png',
    alt: 'Your first server machine',
    title: 'Your first machine is free.',
    text: 'Margo has a machine ready for you. Tap your next step to build it. No parts needed.',
  },
  {
    image: '/assets/compute-currency.png',
    alt: 'A Compute coin',
    title: 'Green lights make Compute.',
    text: 'Machines earn game money every 15 seconds. Tap Collect to pick it up.',
  },
  {
    image: '/assets/tutorial/tutorial-server.png',
    alt: 'Server rack with green lights',
    title: 'Small machine. Big plans.',
    text: 'Spend Compute in Build. Buy faster machines, open new rooms, and make your data center bigger.',
  },
];
export default function HowToSlides({
  busy,
  error,
  onBack,
  onStart,
}: {
  busy: boolean;
  error: string;
  onBack: () => void;
  onStart: () => void;
}) {
  const [index, setIndex] = useState(0),
    slide = slides[index];
  return (
    <div className="howto-slides" aria-label="How to play walkthrough">
      <div className="howto-slide" key={index} aria-live="polite">
        <div className="howto-picture">
          <img src={slide.image} alt={slide.alt} />
          {index === 0 && (
            <div className="howto-next-example">
              <Navigation size={23} />
              <span>
                <small>Next up</small>
                <strong>Meet Margo</strong>
                <span className="howto-example-action">Show me Margo →</span>
              </span>
              <ArrowRight size={20} />
            </div>
          )}
        </div>
        <div className="howto-caption">
          <span className="howto-count">
            {index + 1} / {slides.length}
          </span>
          <h1>{slide.title}</h1>
          <p>{slide.text}</p>
        </div>
      </div>
      <div className="howto-navigation">
        <button
          className="howto-back"
          onClick={() => (index ? setIndex(index - 1) : onBack())}
          disabled={busy}
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <div className="howto-dots" aria-label="Walkthrough slides">
          {slides.map((s, i) => (
            <button
              key={s.title}
              aria-label={`Slide ${i + 1}: ${s.title}`}
              aria-current={i === index ? 'step' : undefined}
              disabled={busy}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <Button
          className="primary-action"
          disabled={busy}
          onClick={() =>
            index === slides.length - 1 ? onStart() : setIndex(index + 1)
          }
        >
          {busy
            ? 'Starting…'
            : index === slides.length - 1
              ? 'Start playing'
              : 'Next'}
          <ArrowRight size={18} />
        </Button>
      </div>
      {error && (
        <p className="onboarding-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
