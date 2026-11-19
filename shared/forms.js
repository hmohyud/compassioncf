// Real form submissions. A form opts in with data-form and needs a [data-form-msg] element for the reply:
//
//   <form data-form="contact | newsletter"> … <p data-form-msg role="status"></p></form>
//
// Each submission is saved as a document in a Firestore database, in the shape the previous site wrote,
// so it shows up in the editor's Inbox and Mailing list like any other:
//
//   contact     contactSubmissions       { name, email, subject, message, submittedAt }
//   newsletter  newsletterSubscriptions  { email, subscribedAt, isActive: true }, and, from the
//                                        "Join our Mailing List" box, { name, location } as well
//
// The name and the town or country are newer than the list itself. If a database's rules only accept
// the three fields the list has always had, the address is still saved the old way, and the name and
// place are sent to the inbox as a note with the subject "Mailing list sign-up". Either way the sign-up
// is kept and nothing the person typed is lost.
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
// Since 17 November 2026 HOME is the site's own project, which the editor's Inbox and Mailing list
// read. Until 19 November 2026 a copy also went to the foundation's earlier project; nothing there
// used it, so ALSO is empty now and a submission goes to one place only.
const database = (project) => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const HOME = database('compassioncf-editor');
const ALSO = [];

const LIMITS = { name: 120, email: 200, location: 120, subject: 200, message: 5000 };
const MAILING_LIST = 'Mailing list sign-up';   // shared/admin/app.js labels these notes in the inbox

const COPY = {
  contact: 'Thank you. Your message is on its way, and we’ll reply as soon as we can.',
  newsletter: 'Thank you. You’re on the list.',
  failed: 'Sorry, that didn’t go through. Please try again in a moment.',
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
  contact: (f) => ({ name: f('name'), email: f('email'), subject: f('subject'), message: f('message'), submittedAt: new Date() }),
  newsletter: (f) => ({
    entry: { email: f('email'), subscribedAt: new Date(), isActive: true },
    details: Object.fromEntries([['name', f('name')], ['location', f('location')]].filter(([, v]) => v)),
  }),
};

// How one database is sent it.
const WRITE = {
  contact: (to, doc, background) => create(to, 'contactSubmissions', doc, background),
  newsletter: async (to, { entry, details }, background) => {
    if (!Object.keys(details).length) return create(to, 'newsletterSubscriptions', entry, background);
    try {
      await create(to, 'newsletterSubscriptions', { ...entry, ...details }, background);
    } catch (err) {
      if (err.status !== 403) throw err;
      // Refused by that database's rules: save the address the way the list always has, and send the rest to the inbox.
      await create(to, 'newsletterSubscriptions', entry, background);
      const note = [details.name ? `Name: ${details.name}` : '', details.location ? `Town / country: ${details.location}` : ''].filter(Boolean).join('\n');
      await create(to, 'contactSubmissions', { name: details.name || 'Mailing list', email: entry.email, subject: MAILING_LIST, message: note, submittedAt: entry.subscribedAt }, background)
        .catch((e) => console.warn('[forms] mailing-list details not saved:', e.message));
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

  // A field people never see. Scripts that fill in everything give themselves away by filling it.
  const trap = Object.assign(document.createElement('input'), { type: 'text', name: 'website', tabIndex: -1, autocomplete: 'off' });
  trap.setAttribute('aria-hidden', 'true');
  trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
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
    button.textContent = 'Sending…';
    form.classList.add('sending');
    say('');
    try {
      if (!trap.value) await save(kind, field);
      form.reset();
      say(COPY[kind], 'ok');
    } catch (err) {
      console.warn(`[forms] ${kind} not saved:`, err.message);
      say(COPY.failed, 'err'); // the form keeps what was typed
    }
    sending = false;
    button.disabled = false;
    button.textContent = label;
    form.classList.remove('sending');
  });
}

document.querySelectorAll('form[data-form]').forEach(mount);
