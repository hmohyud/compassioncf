// Real form submissions. A form opts in with data-form and needs a [data-form-msg] element for the reply:
//
//   <form data-form="contact | volunteer | newsletter"> … <p data-form-msg role="status"></p></form>
//
// Each submission is saved as a document in the foundation's database (the Firestore project
// compassioncf.com already uses; see cms.js), in the same shape the current site writes, so it
// shows up in the foundation's admin panel like any other:
//
//   contact     contactSubmissions       { name, email, subject, message, submittedAt }
//   volunteer   contactSubmissions       the same, with the subject "Volunteer sign-up" and the phone
//                                        number and chosen interests written into the message
//   newsletter  newsletterSubscriptions  { email, subscribedAt, isActive: true }
//
// Volunteer notes go to the contact inbox because the current site has no working place for them:
// its own volunteer form writes to "applications/volunteer", which is not a valid collection path.
//
// No API key is sent; whether a write is accepted is decided by the database's own rules.

const DB = 'https://firestore.googleapis.com/v1/projects/compassioncf-web-site/databases/(default)/documents';

const LIMITS = { name: 120, email: 200, phone: 40, subject: 200, message: 5000 };

const COPY = {
  contact: 'Thank you. Your message is on its way, and we’ll reply as soon as we can.',
  volunteer: 'Thank you. We’ve received your note and will be in touch.',
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

// What each kind of form saves, and where.
const BUILD = {
  contact: (f) => ['contactSubmissions', {
    name: f('name'), email: f('email'), subject: f('subject'), message: f('message'), submittedAt: new Date(),
  }],
  volunteer: (f, form) => {
    const interests = [...form.querySelectorAll('input[name="interest"]:checked')].map((i) => i.parentElement.textContent.trim());
    const message = [
      interests.length ? `Would like to help with: ${interests.join(', ')}` : '',
      f('phone') ? `Phone: ${f('phone')}` : '',
      f('message'),
    ].filter(Boolean).join('\n\n');
    return ['contactSubmissions', {
      name: f('name'), email: f('email'), subject: 'Volunteer sign-up', message: message.slice(0, LIMITS.message), submittedAt: new Date(),
    }];
  },
  newsletter: (f) => ['newsletterSubscriptions', { email: f('email'), subscribedAt: new Date(), isActive: true }],
};

function mount(form) {
  const kind = form.dataset.form;
  const build = BUILD[kind];
  const msg = form.querySelector('[data-form-msg]');
  const button = form.querySelector('button[type="submit"], button:not([type])');
  if (!build || !msg || !button) return;

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
      if (!trap.value) await create(...build(field, form));
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
