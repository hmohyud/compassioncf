// Hero video loader, built for efficiency:
// - The poster image paints first (preloaded); the video is attached only after page load.
// - Picks a source by viewport: 540x960 portrait (~1.1 MB) on phones; 1280x720 WebM VP9 (~1.6 MB)
//   or MP4 H.264 (~2.1 MB) elsewhere.
// - Skipped entirely for prefers-reduced-motion or Save-Data users (they keep the still poster).
// - Pauses while the hero is off-screen or the tab is hidden; resumes when visible.
// - Fades out just before each loop and back in after it, so the restart isn't a hard cut.
// - Visible pause/play control (WCAG 2.2.2).

const video = document.querySelector('.hero-video');
const toggle = document.querySelector('.vid-toggle');
const hero = document.querySelector('.hero');
const base = new URL('../shared/video/', import.meta.url).href;

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection && navigator.connection.saveData;

if (video && !reduce && !saveData) {
  const start = () => {
    const mobile = matchMedia('(max-width: 700px)').matches;
    const sources = mobile
      ? [['hero-mobile.mp4', 'video/mp4']]
      : [['hero-720.webm', 'video/webm'], ['hero-720.mp4', 'video/mp4']];
    for (const [file, type] of sources) {
      const s = document.createElement('source');
      s.src = base + file;
      s.type = type;
      video.appendChild(s);
    }
    video.preload = 'auto';
    video.load();
    run();
  };
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

function run() {
  let userPaused = false;
  let inView = true;

  const sync = () => {
    const shouldPlay = !userPaused && inView && !document.hidden;
    if (shouldPlay && video.paused) video.play().catch(() => {});
    else if (!shouldPlay && !video.paused) video.pause();
  };

  video.addEventListener('playing', () => {
    video.classList.add('on');
    toggle.hidden = false;
  }, { once: true });

  // Fade out just before the loop point and back in after it.
  video.addEventListener('timeupdate', () => {
    const d = video.duration;
    if (!d) return;
    const t = video.currentTime;
    video.classList.toggle('dip', t > d - 0.9 || t < 0.35);
  });

  new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { threshold: 0.05 }).observe(hero);
  document.addEventListener('visibilitychange', sync);

  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    toggle.setAttribute('aria-pressed', String(userPaused));
    toggle.querySelector('.vid-label').textContent = userPaused ? 'Play video' : 'Pause video';
    sync();
  });

  sync();
}
