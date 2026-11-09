// Donate dialog: compassioncf.com's donation options (currency, preset or custom amount) on the page itself.
//
// Any element with [data-donate] opens it. Keep those links' href pointing at compassioncf.com/donate,
// so they still work if this script doesn't load. "Donate" calls the same Firebase function the live
// donate page uses (createCheckoutSession, project compassioncf-web-site, amount in whole currency units)
// and sends the donor to the Stripe checkout page it returns. Card details are only ever entered there.
//
// Themed per page through CSS variables (--dn-bg, --dn-ink, --dn-muted, --dn-line, --dn-accent, --dn-sans,
// --dn-title-font, --dn-radius, --dn-chip-radius, --dn-btn-bg, --dn-btn-ink, --dn-btn-font, --dn-btn-track,
// --dn-btn-case, --dn-btn-radius, --dn-scrim).

const CHECKOUT_FN = 'https://us-central1-compassioncf-web-site.cloudfunctions.net/createCheckoutSession';
const LIVE_PAGE = 'https://compassioncf.com/donate';
const CURRENCIES = [
  { code: 'USD', symbol: '$', stripe: 'usd', min: 0.5 },
  { code: 'EUR', symbol: '€', stripe: 'eur', min: 0.5 },
  { code: 'GBP', symbol: '£', stripe: 'gbp', min: 0.3 },
  { code: 'CAD', symbol: 'C$', stripe: 'cad', min: 0.5 },
  { code: 'AUD', symbol: 'A$', stripe: 'aud', min: 0.5 },
];
const PRESETS = [25, 50, 100, 250, 500];
const DEFAULT_PRESET = 50;

const css = `
.dn { border: 0; padding: 0; margin: auto; width: min(480px, calc(100% - 24px)); max-width: none; max-height: calc(100dvh - 24px); background: transparent; color: var(--dn-ink, #1d1a17); overflow: visible; }
.dn::backdrop { background: var(--dn-scrim, rgba(10, 10, 20, .55)); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.dn[open] { animation: dn-in .4s cubic-bezier(.2, .8, .2, 1); }
.dn[open]::backdrop { animation: dn-fade .4s ease; }
@keyframes dn-in { from { opacity: 0; transform: translateY(18px) scale(.98); } }
@keyframes dn-fade { from { opacity: 0; } }
html:has(.dn[open]) { overflow: hidden; }
.dn-card { position: relative; max-height: calc(100dvh - 24px); overflow: auto; padding: 36px 32px 26px; background: var(--dn-bg, #fff); border-radius: var(--dn-radius, 20px); font: 400 15px/1.5 var(--dn-sans, system-ui, sans-serif); box-shadow: 0 50px 90px -40px rgba(0, 0, 0, .55); }
.dn-x { position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; font: 300 28px/1 var(--dn-sans, system-ui); cursor: pointer; opacity: .55; transition: opacity .2s, background .2s; }
.dn-x:hover { opacity: 1; background: var(--dn-line, rgba(0, 0, 0, .08)); }
.dn-k { font: 600 11.5px var(--dn-sans, system-ui); letter-spacing: .2em; text-transform: uppercase; color: var(--dn-accent, #c8282d); }
.dn-title { margin: 10px 0 8px; font: var(--dn-title-font, 500 34px/1.08 Georgia, serif); letter-spacing: -.01em; }
.dn-sub { color: var(--dn-muted, #6b6b6b); }
.dn-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 26px 0 10px; }
.dn-label { font-weight: 600; font-size: 13.5px; }
.dn-cur { position: relative; }
.dn-cur select { appearance: none; -webkit-appearance: none; padding: 7px 30px 7px 12px; border: 1px solid var(--dn-line, rgba(0, 0, 0, .15)); border-radius: var(--dn-chip-radius, 12px); background: transparent; color: inherit; font: 600 13.5px var(--dn-sans, system-ui); cursor: pointer; }
.dn-cur::after { content: ''; position: absolute; right: 12px; top: 50%; width: 6px; height: 6px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: translateY(-70%) rotate(45deg); pointer-events: none; opacity: .7; }
.dn-cur select option { color: #1d1a17; }
.dn-amts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.dn-amt { min-height: 50px; padding: 0 4px; border: 1px solid var(--dn-line, rgba(0, 0, 0, .15)); border-radius: var(--dn-chip-radius, 12px); background: transparent; color: inherit; font: 600 16px var(--dn-sans, system-ui); cursor: pointer; transition: border-color .2s, background .2s, color .2s; }
.dn-amt:hover { border-color: currentColor; }
.dn-amt[aria-pressed="true"] { background: var(--dn-ink, #1d1a17); border-color: var(--dn-ink, #1d1a17); color: var(--dn-bg, #fff); }
.dn-other { display: block; margin-top: 16px; }
.dn-in { display: flex; align-items: center; min-height: 50px; margin-top: 8px; padding: 0 14px; border: 1px solid var(--dn-line, rgba(0, 0, 0, .15)); border-radius: var(--dn-chip-radius, 12px); transition: border-color .2s; }
.dn-in:focus-within { border-color: currentColor; }
.dn-in i { margin-right: 6px; font-style: normal; color: var(--dn-muted, #6b6b6b); }
.dn-in input { flex: 1; min-width: 0; height: 48px; border: 0; outline: 0; background: transparent; color: inherit; font: 600 16px var(--dn-sans, system-ui); -moz-appearance: textfield; }
.dn-in input::-webkit-outer-spin-button, .dn-in input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.dn-err { margin-top: 14px; color: var(--dn-err, #b42318); font-size: 14px; }
.dn-err a { color: inherit; font-weight: 600; }
.dn-go { display: block; width: 100%; min-height: 56px; margin-top: 22px; border: 0; border-radius: var(--dn-btn-radius, 999px); background: var(--dn-btn-bg, var(--dn-ink, #1d1a17)); color: var(--dn-btn-ink, #fff); font: var(--dn-btn-font, 600 16px system-ui); letter-spacing: var(--dn-btn-track, 0); text-transform: var(--dn-btn-case, none); cursor: pointer; transition: transform .2s, filter .2s, opacity .2s; }
.dn-go:hover { transform: translateY(-1px); filter: brightness(1.06); }
.dn-go:disabled { opacity: .55; cursor: not-allowed; transform: none; filter: none; }
.dn-go[aria-busy="true"] { cursor: progress; }
.dn-fine { display: flex; justify-content: center; align-items: center; gap: 7px; margin-top: 14px; font-size: 12.5px; text-align: center; color: var(--dn-muted, #6b6b6b); }
.dn-fine svg { flex: none; width: 13px; height: 13px; }
.dn-done { text-align: center; padding: 10px 0 4px; }
.dn-done .dn-title { margin-top: 6px; }
.dn-done .dn-go { margin-top: 26px; }
@media (max-width: 480px) {
  .dn-card { padding: 32px 20px 22px; }
  .dn-amts { grid-template-columns: repeat(3, 1fr); }
}
@media (prefers-reduced-motion: reduce) { .dn[open], .dn[open]::backdrop { animation: none; } }
`;

const lock = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

let dlg, ui, cur = CURRENCIES[0], preset = DEFAULT_PRESET, busy = false;

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function build() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  dlg = document.createElement('dialog');
  dlg.className = 'dn';
  dlg.setAttribute('aria-labelledby', 'dn-title');
  dlg.innerHTML = `
    <div class="dn-card">
      <button class="dn-x" type="button" aria-label="Close">×</button>
      <div class="dn-form">
        <p class="dn-k">Donate</p>
        <h2 class="dn-title" id="dn-title">Make a gift</h2>
        <p class="dn-sub">Your gift funds scholarships and community programs, so more people can learn compassion.</p>
        <div class="dn-head">
          <span class="dn-label" id="dn-amt-label">Choose an amount</span>
          <span class="dn-cur"><select aria-label="Currency">${CURRENCIES.map((c) => `<option value="${c.code}">${c.code} ${c.symbol}</option>`).join('')}</select></span>
        </div>
        <div class="dn-amts" role="group" aria-labelledby="dn-amt-label">
          ${PRESETS.map((v) => `<button class="dn-amt" type="button" data-v="${v}" aria-pressed="false"></button>`).join('')}
        </div>
        <label class="dn-other"><span class="dn-label">Or enter an amount</span>
          <span class="dn-in"><i></i><input type="number" inputmode="decimal" step="0.01" min="0.5" placeholder="0.00"></span>
        </label>
        <p class="dn-err" role="alert" hidden></p>
        <button class="dn-go" type="button"></button>
        <p class="dn-fine">${lock}<span>Secure checkout by Stripe: card, Apple Pay or Google Pay. Add your email there for a receipt.</span></p>
      </div>
      <div class="dn-done" hidden>
        <p class="dn-k">Thank you</p>
        <h2 class="dn-title">Your gift is on its way.</h2>
        <p class="dn-sub">Your donation was successful. We appreciate your support!</p>
        <button class="dn-go dn-close" type="button">Close</button>
      </div>
    </div>`;
  document.body.append(dlg);

  ui = {
    form: dlg.querySelector('.dn-form'),
    done: dlg.querySelector('.dn-done'),
    select: dlg.querySelector('select'),
    chips: [...dlg.querySelectorAll('.dn-amt')],
    sym: dlg.querySelector('.dn-in i'),
    input: dlg.querySelector('.dn-in input'),
    err: dlg.querySelector('.dn-err'),
    go: dlg.querySelector('.dn-form .dn-go'),
  };

  dlg.querySelector('.dn-x').addEventListener('click', () => dlg.close());
  dlg.querySelector('.dn-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  ui.select.addEventListener('change', () => { cur = CURRENCIES.find((c) => c.code === ui.select.value) || CURRENCIES[0]; render(); });
  ui.chips.forEach((b) => b.addEventListener('click', () => { preset = +b.dataset.v; ui.input.value = ''; error(); render(); }));
  ui.input.addEventListener('input', () => { preset = null; error(); render(); });
  ui.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); donate(); } });
  ui.go.addEventListener('click', donate);
  render();
}

function amount() {
  if (preset) return preset;
  const v = parseFloat(ui.input.value);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function render() {
  ui.chips.forEach((b) => {
    b.textContent = cur.symbol + b.dataset.v;
    b.setAttribute('aria-pressed', String(+b.dataset.v === preset));
  });
  ui.sym.textContent = cur.symbol;
  ui.input.min = cur.min;
  const a = amount();
  if (!busy) ui.go.textContent = a ? `Donate ${cur.symbol}${fmt(a)}` : 'Donate';
  ui.go.disabled = busy || !a;
}

function error(msg, withLink) {
  ui.err.hidden = !msg;
  ui.err.textContent = msg || '';
  if (msg && withLink) {
    const a = Object.assign(document.createElement('a'), { href: LIVE_PAGE, target: '_blank', rel: 'noopener', textContent: 'donate on compassioncf.com' });
    ui.err.append(' You can also ', a, '.');
  }
}

function setBusy(on) {
  busy = on;
  ui.go.setAttribute('aria-busy', String(on));
  if (on) ui.go.textContent = 'Opening secure checkout…';
  render();
}

async function donate() {
  const a = amount();
  if (!a || a < cur.min) return error(`Please choose or enter at least ${cur.symbol}${fmt(cur.min)}.`);
  error();
  setBusy(true);
  try {
    const res = await fetch(CHECKOUT_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { amount: a, currency: cur.stripe } }),
    });
    const body = await res.json().catch(() => ({}));
    const url = body?.result?.url;
    if (res.ok && url) { window.location.href = url; return; }
    const status = body?.error?.status || '';
    const message = body?.error?.message || '';
    if (status === 'UNAVAILABLE') error('The payment service is temporarily unavailable. Please try again in a moment.', true);
    else if (status === 'PERMISSION_DENIED') error('Online payments aren’t set up for this page yet.', true);
    else if (message && !/internal/i.test(message)) error(message, true);
    else error('We couldn’t start the payment. Please try again.', true);
  } catch {
    error('We couldn’t reach the payment service from this page.', true);
  }
  setBusy(false);
}

function open(view = 'form') {
  if (!dlg) build();
  ui.form.hidden = view !== 'form';
  ui.done.hidden = view !== 'done';
  if (!dlg.open) dlg.showModal();
  (view === 'form' ? (ui.chips.find((b) => b.getAttribute('aria-pressed') === 'true') || ui.input) : dlg.querySelector('.dn-close')).focus();
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-donate]');
  if (!trigger || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open();
});

// Coming back from Stripe: the browser may restore this page with the button still busy.
window.addEventListener('pageshow', () => { if (busy) setBusy(false); });

// Stripe's return links (if they land on this page) carry ?success=true or ?canceled=true.
const params = new URLSearchParams(location.search);
if (params.get('success') === 'true' || params.get('canceled') === 'true') {
  const ok = params.get('success') === 'true';
  history.replaceState({}, '', location.pathname + location.hash);
  open(ok ? 'done' : 'form');
  if (!ok) error('Payment was canceled. You can try again anytime.');
}
if (location.hash === '#donate') open();
