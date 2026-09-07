'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';

// Add supplied clips here in the order they should play. The playlist repeats.
const CLIPS = [
  {
    src: '/assets/noobius-intro.mp4',
    position: '50% 50%',
    mobilePosition: '42% 50%',
  },
];
const POSTER = '/assets/intro-poster.jpg';

export default function TitleScene() {
  const video = useRef<HTMLVideoElement>(null);
  const failedClips = useRef(new Set<number>());
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(true);
  const [ready, setReady] = useState(false);
  const [fading, setFading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const clip = CLIPS[index];

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPaused(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element || unavailable) return;
    let active = true;
    const sync = () => {
      if (paused || document.hidden) element.pause();
      else {
        element.muted = true;
        void element.play().catch(() => {
          if (active) setPaused(true);
        });
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', sync);
      element.pause();
    };
  }, [paused, index, unavailable]);

  const nextClip = () => {
    for (let step = 1; step <= CLIPS.length; step++) {
      const next = (index + step) % CLIPS.length;
      if (!failedClips.current.has(next)) {
        setReady(false);
        setFading(false);
        setIndex(next);
        return;
      }
    }
    setUnavailable(true);
    setReady(false);
  };

  return (
    <>
      <div
        className="title-scene"
        aria-hidden="true"
        style={
          {
            '--clip-position': clip.position,
            '--clip-mobile-position': clip.mobilePosition,
          } as CSSProperties
        }
      >
        <img src={POSTER} alt="" />
        {!unavailable && (
          <video
            ref={video}
            src={clip.src}
            poster={POSTER}
            autoPlay={!paused}
            muted
            playsInline
            loop={CLIPS.length === 1}
            preload="metadata"
            tabIndex={-1}
            className={ready && !fading ? 'is-visible' : ''}
            onPlaying={() => setReady(true)}
            onTimeUpdate={(event) => {
              const element = event.currentTarget;
              setFading(
                element.duration > 1.5 &&
                  element.duration - element.currentTime < 0.35,
              );
            }}
            onEnded={nextClip}
            onError={() => {
              failedClips.current.add(index);
              nextClip();
            }}
          />
        )}
        <div className="title-shade" />
      </div>
      {!unavailable && (
        <button
          className="background-motion-toggle"
          aria-label={
            paused ? 'Play background video' : 'Pause background video'
          }
          title={paused ? 'Play background video' : 'Pause background video'}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
      )}
    </>
  );
}
