// Mounts the participant globe only once its host nears the viewport, so pages that
// show it below the fold don't download three.js and the earth textures up front.
//
// Usage:
//   import { lazyGlobe } from '../shared/globe-lazy.js';
//   lazyGlobe(document.getElementById('globe'), { marker: '200,40,45', maxSize: 560 });
//
// Give the host a size before it mounts (e.g. aspect-ratio: 1) so nothing jumps.

export function lazyGlobe(host, opts = {}, rootMargin = '600px 0px') {
  if (!host) return;
  const io = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    const { mountGlobe } = await import('./globe.js');
    mountGlobe(host, opts);
  }, { rootMargin });
  io.observe(host);
}
