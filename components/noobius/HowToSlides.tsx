'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
const slides = [
  {
    image: '/assets/noobius.jpeg',
    alt: 'Noobius ready for his first shift',
    title: 'Find your way around.',
    text: 'Tap the floor to walk. Margo’s hint can mark your next stop. Walk there and tap the object, or press E nearby.',
  },
  {
    image: '/assets/guide/build.svg',
    alt: 'Illustration: placing your first server on its building pad',
    title: 'Your first machine is free.',
    text: 'Open Center and build your free starter. Green lights mean it is working.',
  },
  {
    image: '/assets/compute-currency.png',
    alt: 'A Compute coin',
    title: 'Put your machine to work.',
    text: 'Recover parts, load a batch, then collect Compute when it finishes. Choose the next job yourself.',
  },
  {
    image: '/assets/guide/repair.svg',
    alt: 'Illustration: a glowing circuit button marks the next repair step',
    title: 'Choose a job. Make it yours.',
    text: 'Open Clients. Choose computing work or Repair & parts jobs. Complete the job, collect payment and choose what to upgrade.',
  },
  {
    image: '/assets/guide/expand.svg',
    alt: 'Illustration: opening a new room for more machines',
    title: 'Level up. Explore further.',
    text: 'Completed work earns XP. Tap your level to see new worlds and their requirements. Cooling Works begins at level 3.',
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
                <small>Margo’s hint</small>
                <strong>Meet Margo</strong>
                <span className="howto-example-action">Mark location →</span>
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
