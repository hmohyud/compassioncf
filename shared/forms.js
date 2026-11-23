// Real form submissions. A form opts in with data-form and needs a [data-form-msg] element for the reply:
//
//   <form data-form="newsletter"> … <p data-form-msg role="status"></p></form>
//
// Each submission is saved as a document in a Firestore database, in the shape the previous site wrote,
// so it shows up in the editor's Mailing list like any other:
//
//   newsletter  newsletterSubscriptions  { email, subscribedAt, isActive: true }, and, from the
//                                        "Join our Mailing List" box, { name, location } as well
//
// (The Contact page's form is not one of these. It is the foundation's Jotform, shown in a frame: see
// shared/contact.js.)
//
// The name and the town or country are newer than the list itself. If a database's rules only accept
// the three fields the list has always had, the address is still saved the old way, so the sign-up is
// kept. (Until 22 November 2026 the name and place were then sent to the editor's Inbox as a note; the
// editor no longer has an Inbox, and the site's own database accepts them with the address.)
//
// No API key is sent; whether a write is accepted is decided by the database's own rules.

// Where submissions go.
//
// HOME is the database this site answers to: a submission counts as sent only once HOME has it.
// ALSO lists databases that are sent the same submission as well, at the same moment. A copy never
// holds the visitor up and never costs them their thank-you: if it fails, that is only noted in the
// browser's console. (For moving from one database to another, so that whatever still reads the
// earlier one keeps receiving entries. If HOME fails, the visitor is asked to try again, and a
// copy may then arrive twice.)
//
// Since 17 November 2026 HOME is the site's own project, which the editor's Mailing list reads.
// Until 19 November 2026 a copy also went to the foundation's earlier project; nothing there
// used it, so ALSO is empty now and a submission goes to one place only.
import { t } from './i18n.js';   // replies in the visitor's language

const database = (project) => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const HOME = database('compassioncf-editor');
const ALSO = [];

const LIMITS = { name: 120, email: 200, location: 120 };

const COPY = {
  newsletter: () => t('Thank you. You’re on the list.'),
  failed: () => t('Sorry, that didn’t go through. Please try again in a moment.'),
};

function encode(value) {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  return { stringValue: String(value) };
}

// `background` marks a copy: the browser is asked to finish it even if the visitor leaves the page.
async function create(to, collection, data, background = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${to}/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }),
      signal: ctrl.signal,
      ...(background ? { keepalive: true } : {}),
    });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  } finally {
    clearTimeout(timer);
  }
}

// What each kind of form holds. Read from the form once, so every database is sent exactly the same.
const READ = {
  newsletter: (f) => ({
    entry: { email: f('email'), subscribedAt: new Date(), isActive: true },
    details: Object.fromEntries([['name', f('name')], ['location', f('location')]].filter(([, v]) => v)),
  }),
};

// How one database is sent it.
const WRITE = {
  newsletter: async (to, { entry, details }, background) => {
    if (!Object.keys(details).length) return create(to, 'newsletterSubscriptions', entry, background);
    try {
      await create(to, 'newsletterSubscriptions', { ...entry, ...details }, background);
    } catch (err) {
      if (err.status !== 403) throw err;
      // Refused by that database's rules: save the address the way the list always has.
      await create(to, 'newsletterSubscriptions', entry, background);
      console.warn('[forms] the mailing-list sign-up was saved without the name and place: the database refused them');
    }
  },
};

// Sends one submission everywhere it goes. The promise is HOME's alone.
function save(kind, field) {
  const data = READ[kind](field);
  const home = WRITE[kind](HOME, data, false);
  for (const to of ALSO) WRITE[kind](to, data, true).catch((e) => console.warn(`[forms] ${kind}: a copy was not saved:`, e.message));
  return home;
}

function mount(form) {
  const kind = form.dataset.form;
  const msg = form.querySelector('[data-form-msg]');
  const button = form.querySelector('button[type="submit"], button:not([type])');
  if (!READ[kind] || !msg || !button) return;

  // A field people never see. Scripts that fill in everything give themselves away by filling it. It is hidden
  // where it stands, not moved far off to one side: on a page written from right to left, something far off to
  // the left makes the whole page scroll sideways.
  const trap = Object.assign(document.createElement('input'), { type: 'text', name: 'website', tabIndex: -1, autocomplete: 'off' });
  trap.setAttribute('aria-hidden', 'true');
  trap.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);opacity:0;pointer-events:none';
  form.append(trap);

  const say = (text, state) => {
    msg.textContent = text;
    msg.classList.toggle('err', state === 'err');
    msg.classList.toggle('ok', state === 'ok');
  };
  const field = (name) => String(new FormData(form).get(name) || '').trim().slice(0, LIMITS[name] || 500);

  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const label = button.textContent;
    sending = true;
    button.disabled = true;
    button.textContent = t('Sending…');
    form.classList.add('sending');
    say('');
    try {
      if (!trap.value) await save(kind, field);
      form.reset();
      say(COPY[kind](), 'ok');
    } catch (err) {
      console.warn(`[forms] ${kind} not saved:`, err.message);
      say(COPY.failed(), 'err'); // the form keeps what was typed
    }
    sending = false;
    button.disabled = false;
    button.textContent = label;
    form.classList.remove('sending');
  });
}

document.querySelectorAll('form[data-form]').forEach(mount);
