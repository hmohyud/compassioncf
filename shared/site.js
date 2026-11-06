// Small shared behaviours for all three design directions.
// - .reveal elements fade/slide in when scrolled into view
// - [data-count] numbers count up once visible
// - header gets .scrolled after leaving the top
// - [data-nav-toggle] opens/closes the mobile menu
// - forms with [data-demo-form] show an inline thank-you (no backend in this prototype)

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

function countUp(el) {
  const end = Number(el.dataset.count);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  if (reduced) { el.textContent = fmt(end); return; }
  const dur = 1800, t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(end * (1 - Math.pow(1 - p, 4)));
    if (p < 1) requestAnimationFrame(step);
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
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  });
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    btn.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
  }));
});

document.querySelectorAll('[data-demo-form]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = form.querySelector('[data-form-msg]');
    form.classList.add('sent');
    if (msg) msg.textContent = 'Thank you — you’re on the list. (Demo form: nothing was sent yet.)';
    form.reset();
  });
});

document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
