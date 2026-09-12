const video = document.querySelector('#background-video');
const toggle = document.querySelector('#motion-toggle');
const mobile = window.matchMedia('(max-width: 640px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
let failed = false;
let revision = 0;

function updateControl() {
  const label = paused ? 'Play background video' : 'Pause background video';
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  toggle.classList.toggle('is-playing', !paused);
}

async function syncPlayback() {
  const current = ++revision;
  updateControl();
  if (paused || document.hidden || failed) {
    video.pause();
    return;
  }
  video.muted = true;
  try {
    await video.play();
  } catch {
    if (current === revision) {
      paused = true;
      updateControl();
    }
  }
}

function selectSource() {
  failed = false;
  video.classList.remove('is-visible');
  video.poster = mobile.matches
    ? '/assets/noobius-reel-poster-mobile.jpg'
    : '/assets/noobius-reel-poster.jpg';
  video.src = mobile.matches
    ? '/assets/noobius-night-shift-reel-mobile.mp4'
    : '/assets/noobius-night-shift-reel.mp4';
  toggle.hidden = false;
  void syncPlayback();
}

video.addEventListener('playing', () => video.classList.add('is-visible'));
video.addEventListener('error', () => {
  failed = true;
  video.classList.remove('is-visible');
  toggle.hidden = true;
});
toggle.addEventListener('click', () => {
  paused = !paused;
  void syncPlayback();
});
mobile.addEventListener('change', selectSource);
reducedMotion.addEventListener('change', () => {
  paused = reducedMotion.matches;
  void syncPlayback();
});
document.addEventListener('visibilitychange', () => void syncPlayback());
selectSource();
