'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
const slides = [
  {
    image: '/assets/noobius.jpeg',
    alt: 'Noobius ready for his first shift',
    title: 'Find your way around.',
    text: 'Tap or click the floor to move. Use the + and − buttons to zoom, or your mouse wheel on desktop. “Your next move” shows a glowing path; tap the object when you arrive to do the work.',
  },
  {
    image: '/assets/tutorial/tutorial-server.png',
    alt: 'Your first server machine',
    title: 'Your first machine is free.',
    text: 'Meet Margo, then open Center and build your free machine. Its green lights mean it is working.',
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
    title: 'Choose a job. Make it yours.',
    text: 'Open Clients: book a computing job, or choose Repair & parts jobs. “Find missing parts” guides you to supplies. Finish, collect your payment, then upgrade or choose another job.',
  },
  {
    image: '/assets/facility.png',
    alt: 'The Noobius data-center world',
    title: 'Level up. Explore further.',
    text: 'Completed work earns XP. Tap your level beside Compute to see new worlds. Level 3 opens Cooling Works: bring supplies, connect the coolant pipes and recover parts for your next job.',
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
                <small>Your next move</small>
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
