'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';

// The edited reel includes its own transitions and circular return to the desk.
const CLIPS = [
  {
    src: '/assets/noobius-night-shift-reel.mp4',
    mobileSrc: '/assets/noobius-night-shift-reel-mobile.mp4',
    poster: '/assets/noobius-reel-poster.jpg',
    mobilePoster: '/assets/noobius-reel-poster-mobile.jpg',
    position: '50% 50%',
    mobilePosition: '50% 50%',
  },
];

export default function TitleScene() {
  const video = useRef<HTMLVideoElement>(null);
  const failedClips = useRef(new Set<number>());
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(true);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const clip = CLIPS[index];
  const source = isMobile ? clip.mobileSrc : clip.src;
  const poster = isMobile ? clip.mobilePoster : clip.poster;

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 640px)');
    const update = () => {
      setReady(false);
      setIsMobile(viewport.matches);
    };
    update();
    viewport.addEventListener('change', update);
    return () => viewport.removeEventListener('change', update);
  }, []);

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
  }, [paused, source, isMobile, unavailable]);

  const nextClip = () => {
    for (let step = 1; step <= CLIPS.length; step++) {
      const next = (index + step) % CLIPS.length;
      if (!failedClips.current.has(next)) {
        setReady(false);
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
        <img src={poster} alt="" />
        {!unavailable && isMobile !== null && (
          <video
            key={source}
            ref={video}
            src={source}
            poster={poster}
            autoPlay={!paused}
            muted
            playsInline
            loop={CLIPS.length === 1}
            preload="metadata"
            tabIndex={-1}
            className={ready ? 'is-visible' : ''}
            onPlaying={() => setReady(true)}
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
