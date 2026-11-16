// Real form submissions. A form opts in with data-form and needs a [data-form-msg] element for the reply:
//
//   <form data-form="contact | newsletter"> … <p data-form-msg role="status"></p></form>
//
// Each submission is saved as a document in the foundation's database (the Firestore project
// compassioncf.com already uses; see cms.js), in the shape the previous site wrote, so it shows up
// in the editor and in the foundation's previous admin panel like any other:
//
//   contact     contactSubmissions       { name, email, subject, message, submittedAt }
//   newsletter  newsletterSubscriptions  { email, subscribedAt, isActive: true }, and, from the
//                                        "Join our Mailing List" box, { name, location } as well
//
// The name and the town or country are newer than the list itself. If the database's rules only accept
// the three fields the list has always had, the address is still saved the old way, and the name and
// place are sent to the inbox as a note with the subject "Mailing list sign-up". Either way the sign-up
// is kept and nothing the person typed is lost.
//
// No API key is sent; whether a write is accepted is decided by the database's own rules.

const DB = 'https://firestore.googleapis.com/v1/projects/compassioncf-web-site/databases/(default)/documents';

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

async function create(collection, data) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${DB}/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  } finally {
    clearTimeout(timer);
  }
}

// What each kind of form saves, and where.
const SAVE = {
  contact: (f) => create('contactSubmissions', {
    name: f('name'), email: f('email'), subject: f('subject'), message: f('message'), submittedAt: new Date(),
  }),
  newsletter: async (f) => {
    const entry = { email: f('email'), subscribedAt: new Date(), isActive: true };
    const details = Object.fromEntries([['name', f('name')], ['location', f('location')]].filter(([, v]) => v));
    if (!Object.keys(details).length) return create('newsletterSubscriptions', entry);
    try {
      await create('newsletterSubscriptions', { ...entry, ...details });
    } catch (err) {
      if (err.status !== 403) throw err;
      // Refused by the database's rules: save the address the way the list always has, and send the rest to the inbox.
      await create('newsletterSubscriptions', entry);
      const note = [details.name ? `Name: ${details.name}` : '', details.location ? `Town / country: ${details.location}` : ''].filter(Boolean).join('\n');
      await create('contactSubmissions', { name: details.name || 'Mailing list', email: entry.email, subject: MAILING_LIST, message: note, submittedAt: new Date() })
        .catch((e) => console.warn('[forms] mailing-list details not saved:', e.message));
    }
  },
};

function mount(form) {
  const kind = form.dataset.form;
  const save = SAVE[kind];
  const msg = form.querySelector('[data-form-msg]');
  const button = form.querySelector('button[type="submit"], button:not([type])');
  if (!save || !msg || !button) return;

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
      if (!trap.value) await save(field, form);
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
