// Small behaviours every page shares.
// - .reveal elements fade/slide in when scrolled into view
// - [data-count] numbers count up once visible
// - header gets .scrolled after leaving the top
// - [data-nav-toggle] opens/closes the mobile menu

import { locale, translated, shown } from './i18n.js';   // numbers are written the way the visitor's language writes them

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('in');
    if (e.target.hasAttribute('data-count')) countUp(e.target);
    io.unobserve(e.target);
  }
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal, [data-count]').forEach((el) => io.observe(el));

// Counting numbers keep the final value's footprint, so the words around them stay still:
// digits are tabular (equal width), and while counting the number sits in a box fixed at
// its final width, filling in from the right like an odometer. The stylesheet can override the
// alignment with a more specific rule, e.g. `.facts b.counting { text-align: center }`.
const countCss = document.createElement('style');
countCss.textContent = '[data-count]{font-variant-numeric:tabular-nums}.counting{display:inline-block;white-space:nowrap;text-align:right}';
document.head.append(countCss);

async function countUp(el) {
  const end = Number(el.dataset.count);
  const fmt = (n) => Math.round(n).toLocaleString(locale);
  el.textContent = fmt(end);
  if (reduced) return;
  await document.fonts.ready; // measure in the real font, not the fallback
  el.classList.add('counting');
  el.style.width = `${el.getBoundingClientRect().width}px`;
  const dur = 1800, t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(end * (1 - Math.pow(1 - p, 4)));
    if (p < 1) return requestAnimationFrame(step);
    el.classList.remove('counting');
    el.style.width = '';
  };
  requestAnimationFrame(step);
}

const header = document.querySelector('[data-header]');
if (header) {
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

document.querySelectorAll('[data-nav-toggle]').forEach((btn) => {
  const nav = document.getElementById(btn.getAttribute('aria-controls'));
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  // Any link in the header closes it: the page is about to change, or (the name, on the home page) scroll to the top.
  (btn.closest('header') || nav).querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); btn.focus(); }
  });
  // A phone turned sideways, or a window widened past the phone layout: the links are an ordinary row again.
  window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) set(false); });
});

document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

// In another language the menu's words can be longer than the bar is wide, on a screen just wider than a tablet.
// When they are, the page is marked "nav-tight" and the stylesheet gives it the menu a phone has. English always
// fits, so this is not done in English.
if (translated && header) {
  const bar = header.querySelector('.hdr-in'), brand = bar && bar.querySelector('.brand'), nav = bar && bar.querySelector('.nav');
  const wide = window.matchMedia('(min-width: 961px)');
  let needed = 0;   // the room the name and the menu take side by side, measured while they are side by side
  const measure = () => {
    if (!wide.matches || document.documentElement.classList.contains('nav-tight')) return;
    const copy = nav.cloneNode(true);   // measured on a copy laid out on one line, whatever room the real one has
    copy.removeAttribute('id');
    copy.setAttribute('aria-hidden', 'true');
    copy.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;flex:none;width:max-content;white-space:nowrap';
    bar.append(copy);
    needed = brand.offsetWidth + copy.offsetWidth + 28;
    copy.remove();
  };
  const fit = () => {
    if (!needed) measure();
    const edges = getComputedStyle(bar);
    const room = bar.clientWidth - parseFloat(edges.paddingLeft) - parseFloat(edges.paddingRight);
    document.documentElement.classList.toggle('nav-tight', wide.matches && needed > 0 && needed > room);
  };
  if (bar && brand && nav) {
    shown.then(() => { fit(); document.fonts.ready.then(() => { if (!document.documentElement.classList.contains('nav-tight')) { needed = 0; fit(); } }); });
    window.addEventListener('resize', fit, { passive: true });
  }
}
