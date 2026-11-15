// The editor at /admin/: sign in, then write essays, add events, read what the forms collected,
// and see the wording and photos changed on the pages. Everything is read from and saved to the foundation's
// database as the signed-in person (see session.js); the page itself holds no content.
//
// Sections follow the address: #essays, #essays/new, #essays/<id>, #events…, #inbox, #newsletter, #text.

import * as session from './session.js';
import { markdown, splitTitle, toDate } from '../cms.js';
import { fetchChanges, fetchEdits, setEdits, setImages, isStored, sanitize, TEXT_DOC, TEXT_FIELD, IMAGE_FIELD } from '../content.js';

const root = document.querySelector('[data-admin-app]');
const SITE = new URL('../../', import.meta.url).href;
document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./admin.css', import.meta.url).href }));

const TABS = [['essays', 'Essays'], ['events', 'Events'], ['inbox', 'Inbox'], ['newsletter', 'Newsletter'], ['text', 'Text and photos']];
const VOLUNTEER = 'Volunteer sign-up';

/* ---------- small helpers ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const longDate = (d) => (d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
const dateTime = (d) => (d ? `${longDate(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '');
const fromDay = (day, time = '12:00') => { const [y, m, d] = day.split('-').map(Number); const [hh, mm] = time.split(':').map(Number); return new Date(y, m - 1, d, hh, mm); };
const isDayOnly = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isEmail = (s) => /^[^\s@<>"'?&]+@[^\s@<>"'?&]+\.[^\s@<>"'?&]+$/.test(s || '');
const plainText = (html) => { const t = document.createElement('template'); t.innerHTML = sanitize(html); return t.content.textContent.replace(/\s+/g, ' ').trim(); };

const view = () => root.querySelector('[data-view]');
const loading = (text) => { view().innerHTML = `<p class="adm-load">${esc(text)}</p>`; };
const failure = (err) => `<p class="adm-note bad" role="alert">${esc(err.message || 'Something went wrong.')}${err.detail ? `<small>${esc(err.detail)}</small>` : ''}</p>`;

let flash = '';       // a line to show once at the top of the next screen
let dirty = false;    // the open form has changes that aren't saved
let leaving = false;
let lastHash = location.hash;
const takeFlash = () => { const f = flash; flash = ''; return f ? `<p class="adm-note good" role="status">${esc(f)}</p>` : ''; };
const go = (hash) => { dirty = false; if (location.hash === hash) route(); else location.hash = hash; };

/* ---------- signing in ---------- */

function signInScreen(message = '') {
  root.innerHTML = `
    <div class="adm-card adm-sign">
      <h2>Sign in</h2>
      <p>Use the email and password of your Compassion Course Foundation admin account.</p>
      <form class="form" data-sign>
        <div class="field"><label for="adm-email">Email</label><input id="adm-email" name="email" type="email" required autocomplete="username"></div>
        <div class="field"><label for="adm-pass">Password</label><input id="adm-pass" name="password" type="password" required autocomplete="current-password"></div>
        <button class="btn btn-sun" type="submit">Sign in</button>
        <p class="adm-note" data-note role="status">${esc(message)}</p>
        <p><button type="button" class="adm-link" data-act="forgot">Forgot the password?</button></p>
      </form>
    </div>`;
}

function notAnEditor(email) {
  root.innerHTML = `
    <div class="adm-card adm-sign">
      <h2>This account can’t edit the site</h2>
      <p><b>${esc(email)}</b> is signed in, but it isn’t set up as an admin account.</p>
      <p>If it should be, sign in once at the <a href="${session.OLD_ADMIN}" target="_blank" rel="noopener">previous admin panel</a>, which registers the foundation’s admin addresses, then come back and sign in here again.</p>
      <p><button type="button" class="btn btn-ink" data-act="out">Sign out</button></p>
    </div>`;
}

async function onSignIn(form) {
  const note = form.querySelector('[data-note]');
  const button = form.querySelector('button[type="submit"]');
  note.className = 'adm-note';
  note.textContent = '';
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    await session.signIn(form.elements.email.value.trim(), form.elements.password.value);   // on success the session change redraws the page
  } catch (err) {
    form.elements.password.value = '';
    button.disabled = false;
    button.textContent = 'Sign in';
    note.className = 'adm-note bad';
    note.innerHTML = `${esc(err.message)}${err.detail ? `<small>${esc(err.detail)}</small>` : ''}`;
  }
}

async function onForgot() {
  const form = root.querySelector('[data-sign]');
  const note = form.querySelector('[data-note]');
  const email = form.elements.email.value.trim();
  if (!isEmail(email)) { note.className = 'adm-note bad'; note.textContent = 'Type your email address in the box above first.'; return; }
  note.className = 'adm-note';
  note.textContent = 'Sending…';
  try {
    await session.resetPassword(email);
    note.className = 'adm-note good';
    note.textContent = 'If that address has an admin account, an email with a link to set a new password is on its way.';
  } catch (err) {
    note.className = 'adm-note bad';
    note.innerHTML = `${esc(err.message)}${err.detail ? `<small>${esc(err.detail)}</small>` : ''}`;
  }
}

/* ---------- the frame around every section ---------- */

function frame(tab) {
  const who = session.current();
  root.innerHTML = `
    <div class="adm-top">
      <nav class="adm-tabs" aria-label="Editor sections">${TABS.map(([id, label]) => `<a href="#${id}"${id === tab ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <p class="adm-who"><b>${esc(who.email)}</b> · <button type="button" class="adm-link" data-act="out">Sign out</button></p>
    </div>
    <div class="adm-card" data-view></div>`;
}

async function route() {
  const who = session.current();
  if (!who) return signInScreen();
  let ok;
  try {
    ok = await session.isAdmin();
  } catch (err) {
    root.innerHTML = `<div class="adm-card adm-sign"><h2>Couldn’t check your account</h2>${failure(err)}<p><button type="button" class="btn btn-ink" data-act="retry">Try again</button></p></div>`;
    return;
  }
  if (!session.current()) return signInScreen('Your sign-in has ended. Please sign in again.');
  if (!ok) return notAnEditor(who.email);

  const [tab = 'essays', id] = (location.hash.replace(/^#/, '') || 'essays').split('/');
  const section = SECTIONS[tab] ? tab : 'essays';
  frame(section);
  try {
    await SECTIONS[section](id && decodeURIComponent(id));
  } catch (err) {
    if (err.kind === 'expired') return signInScreen(err.message);
    console.warn('[editor]', err.detail || err.message);
    view().innerHTML = `${failure(err)}<p><button type="button" class="btn btn-ink sm" data-act="retry">Try again</button></p>`;
  }
}

/* ---------- essays ---------- */

async function essays(id) {
  if (id) return essay(id);
  loading('Loading essays…');
  const posts = (await session.list('blogPosts')).sort((a, b) => (toDate(b.publishedAt) || 0) - (toDate(a.publishedAt) || 0));
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head">
      <div><h2>Essays</h2><p>These appear on the Blog page and under “Latest writing” on the home page.</p></div>
      <a class="btn btn-sun sm" href="#essays/new">New essay</a>
    </div>
    ${posts.length ? `<ul class="adm-list">${posts.map((p) => {
      const [title, sub] = splitTitle(p.title);
      return `<li><a class="adm-row" href="#essays/${encodeURIComponent(p.id)}">
        <span><span class="adm-title">${esc(title)}${p.isPublished === false ? '<span class="adm-badge quiet">Draft</span>' : ''}</span><span class="adm-sub">${esc(sub || p.author || '')}</span></span>
        <span class="adm-meta">${esc(longDate(toDate(p.publishedAt)))}</span></a></li>`;
    }).join('')}</ul>` : '<p class="adm-empty">No essays yet. Press “New essay” to write the first one.</p>'}`;
}

async function essay(id) {
  const isNew = id === 'new';
  let post = { title: '', content: '', excerpt: '', author: 'Thom Bond', isPublished: true, publishedAt: new Date() };
  if (!isNew) { loading('Opening the essay…'); post = await session.get('blogPosts', id); }
  const [title, sub] = post.title ? splitTitle(post.title) : ['', ''];
  const when = toDate(post.publishedAt) || new Date();
  view().innerHTML = `
    <a class="adm-back" href="#essays">← All essays</a>
    ${takeFlash()}
    <form class="adm-edit form" data-form="essay" data-id="${esc(id)}" data-day="${isoDay(when)}">
      <div class="adm-head"><div><h2>${isNew ? 'New essay' : 'Edit essay'}</h2></div>
        ${!isNew && post.isPublished !== false ? `<a href="${SITE}blog/post.html?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">See it on the site →</a>` : ''}</div>
      <div class="field"><label for="e-title">Title</label><input id="e-title" name="title" required maxlength="200" value="${esc(title)}"></div>
      <div class="field"><label for="e-sub">Subtitle <small>(optional, shown under the title)</small></label><input id="e-sub" name="sub" maxlength="200" value="${esc(sub)}"></div>
      <div class="form-row">
        <div class="field"><label for="e-author">Written by</label><input id="e-author" name="author" maxlength="120" value="${esc(post.author || '')}"></div>
        <div class="field"><label for="e-day">Date</label><input id="e-day" name="day" type="date" required value="${isoDay(when)}"></div>
      </div>
      <div class="field"><label for="e-excerpt">Summary <small>(optional; if empty, the blog list shows the opening lines)</small></label><textarea id="e-excerpt" name="excerpt" maxlength="600" style="min-height:84px">${esc(post.excerpt || '')}</textarea></div>
      <div class="field">
        <label for="e-content">Text</label>
        <div class="adm-tools" aria-label="Formatting">
          <button type="button" data-md="bold">Bold</button><button type="button" data-md="italic">Italic</button><button type="button" data-md="heading">Heading</button>
          <button type="button" data-md="quote">Quote</button><button type="button" data-md="list">List</button><button type="button" data-md="link">Link</button>
        </div>
        <div class="adm-split">
          <textarea id="e-content" class="adm-text" name="content" required>${esc(post.content || '')}</textarea>
          <div class="adm-preview" aria-label="Preview"><div class="read" data-preview></div></div>
        </div>
      </div>
      <label class="adm-check"><input type="checkbox" name="published" ${post.isPublished === false ? '' : 'checked'}> Published <small>(untick to keep it as a draft that only editors can see here)</small></label>
      <div class="adm-actions">
        <button class="btn btn-sun" type="submit">Save</button>
        <span class="adm-note" data-note role="status"></span>
        <span class="spacer"></span>
        ${isNew ? '' : `<button type="button" class="adm-danger" data-del="blogPosts/${esc(id)}" data-after="#essays" data-done="Essay deleted.">Delete essay</button>`}
      </div>
    </form>`;
  preview();
}

function preview() {
  const box = root.querySelector('[data-preview]');
  const text = root.querySelector('#e-content');
  if (box && text) box.innerHTML = text.value.trim() ? markdown(text.value) : '<p class="adm-empty" style="padding:0">The essay will appear here as you type.</p>';
}

async function saveEssay(form) {
  const f = form.elements;
  const id = form.dataset.id;
  const title = f.title.value.trim();
  const sub = f.sub.value.trim();
  const data = {
    title: sub ? `${title}\n${sub}` : title,
    content: f.content.value.replace(/\r\n?/g, '\n').trim(),
    excerpt: f.excerpt.value.trim(),
    author: f.author.value.trim(),
    isPublished: f.published.checked,
    updatedAt: new Date(),
  };
  if (id === 'new') {
    const now = new Date();
    data.publishedAt = f.day.value === isoDay(now) ? now : fromDay(f.day.value);
    data.createdAt = now;
    const made = await session.create('blogPosts', data);
    flash = data.isPublished ? 'Saved and published.' : 'Saved as a draft.';
    return go(`#essays/${encodeURIComponent(made.id)}`);
  }
  if (f.day.value !== form.dataset.day) data.publishedAt = fromDay(f.day.value);   // keep the original moment unless the day was changed
  await session.update('blogPosts', id, data);
  form.dataset.day = f.day.value;
  return data.isPublished ? 'Saved. The change is live.' : 'Saved as a draft.';
}

function format(kind) {
  const t = root.querySelector('#e-content');
  const { selectionStart: a, selectionEnd: b, value } = t;
  const sel = value.slice(a, b);
  const put = (text, from, to) => { t.setRangeText(text, a, b, 'end'); t.focus(); if (from !== undefined) t.setSelectionRange(a + from, a + to); t.dispatchEvent(new Event('input', { bubbles: true })); };
  const lines = (mark) => put((sel || 'Text').split('\n').map((l) => `${mark}${l}`).join('\n'));
  if (kind === 'bold') put(`**${sel || 'bold text'}**`, 2, 2 + (sel || 'bold text').length);
  if (kind === 'italic') put(`*${sel || 'italic text'}*`, 1, 1 + (sel || 'italic text').length);
  if (kind === 'heading') lines('## ');
  if (kind === 'quote') lines('> ');
  if (kind === 'list') lines('- ');
  if (kind === 'link') put(`[${sel || 'link text'}](https://)`, (sel || 'link text').length + 3, (sel || 'link text').length + 11);
}

/* ---------- events ---------- */

const eventDate = (e) => toDate(e.date);

async function events(id) {
  if (id) return eventForm(id);
  loading('Loading events…');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const all = (await session.list('events')).map((e) => ({ ...e, when: eventDate(e) }));
  const upcoming = all.filter((e) => e.when && e.when >= today).sort((a, b) => a.when - b.when);
  const past = all.filter((e) => !e.when || e.when < today).sort((a, b) => (b.when || 0) - (a.when || 0));
  const row = (e) => `<li><a class="adm-row" href="#events/${encodeURIComponent(e.id)}">
    <span><span class="adm-title">${esc(e.title || 'Untitled event')}</span><span class="adm-sub">${esc(e.location || '')}</span></span>
    <span class="adm-meta">${esc(e.when ? (isDayOnly(e.date) || !(e.when.getHours() || e.when.getMinutes()) ? longDate(e.when) : dateTime(e.when)) : 'No date')}</span></a></li>`;
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head">
      <div><h2>Events</h2><p>Upcoming events appear on the Events page. Past ones drop off it by themselves.</p></div>
      <a class="btn btn-sun sm" href="#events/new">Add an event</a>
    </div>
    <h3 class="adm-group">Upcoming</h3>
    ${upcoming.length ? `<ul class="adm-list">${upcoming.map(row).join('')}</ul>` : '<p class="adm-empty">Nothing coming up. The Events page shows its “Nothing on the calendar just yet” card.</p>'}
    ${past.length ? `<h3 class="adm-group">Past</h3><ul class="adm-list">${past.map(row).join('')}</ul>` : ''}`;
}

async function eventForm(id) {
  const isNew = id === 'new';
  let ev = { title: '', description: '', location: '', date: '' };
  if (!isNew) { loading('Opening the event…'); ev = await session.get('events', id); }
  const when = eventDate(ev);
  const timed = when && !isDayOnly(ev.date) && (when.getHours() || when.getMinutes());
  view().innerHTML = `
    <a class="adm-back" href="#events">← All events</a>
    ${takeFlash()}
    <form class="adm-edit form" data-form="event" data-id="${esc(id)}">
      <div class="adm-head"><div><h2>${isNew ? 'Add an event' : 'Edit event'}</h2></div></div>
      <div class="field"><label for="v-title">Name of the event</label><input id="v-title" name="title" required maxlength="200" value="${esc(ev.title || '')}"></div>
      <div class="form-row">
        <div class="field"><label for="v-day">Date</label><input id="v-day" name="day" type="date" required value="${when ? isoDay(when) : ''}"></div>
        <div class="field"><label for="v-time">Start time <small>(optional; shown in each visitor’s own time zone)</small></label><input id="v-time" name="time" type="time" value="${timed ? clock(when) : ''}"></div>
      </div>
      <div class="field"><label for="v-place">Place <small>(for example “Online” or a city)</small></label><input id="v-place" name="location" maxlength="200" value="${esc(ev.location || '')}"></div>
      <div class="field"><label for="v-desc">Details</label><textarea id="v-desc" name="description" maxlength="4000">${esc(ev.description || '')}</textarea></div>
      <div class="adm-actions">
        <button class="btn btn-sun" type="submit">Save</button>
        <span class="adm-note" data-note role="status"></span>
        <span class="spacer"></span>
        ${isNew ? '' : `<button type="button" class="adm-danger" data-del="events/${esc(id)}" data-after="#events" data-done="Event deleted.">Delete event</button>`}
      </div>
    </form>`;
}

async function saveEvent(form) {
  const f = form.elements;
  const id = form.dataset.id;
  const data = {
    title: f.title.value.trim(),
    description: f.description.value.replace(/\r\n?/g, '\n').trim(),
    location: f.location.value.trim(),
    // A day on its own is kept as plain text so it is the same day everywhere; with a time it is an exact moment.
    date: f.time.value ? fromDay(f.day.value, f.time.value) : f.day.value,
    updatedAt: new Date(),
  };
  if (id === 'new') {
    data.createdAt = new Date();
    await session.create('events', data);
    flash = 'Event added.';
    return go('#events');
  }
  await session.update('events', id, data);
  return 'Saved. The change is live.';
}

/* ---------- what the forms collected ---------- */

async function inbox() {
  loading('Loading messages…');
  const items = (await session.list('contactSubmissions')).sort((a, b) => (toDate(b.submittedAt) || 0) - (toDate(a.submittedAt) || 0));
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head"><div><h2>Inbox</h2><p>Messages sent through the Contact page, and notes from the Volunteer page.</p></div><p class="adm-meta">${items.length} message${items.length === 1 ? '' : 's'}</p></div>
    ${items.length ? `<ul class="adm-list">${items.map((m) => `
      <li class="adm-msg">
        <header><span class="adm-title">${esc(m.subject || '(no subject)')}${m.subject === VOLUNTEER ? '<span class="adm-badge">Volunteer</span>' : ''}</span><span class="adm-meta">${esc(dateTime(toDate(m.submittedAt)))}</span></header>
        <p class="adm-sub">From <b>${esc(m.name || 'someone')}</b>${isEmail(m.email) ? ` · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : m.email ? ` · ${esc(m.email)}` : ''}</p>
        <pre>${esc(m.message || '')}</pre>
        <div class="adm-actions">
          ${isEmail(m.email) ? `<a class="btn btn-ink sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject || 'your message'}`)}">Reply by email</a>` : ''}
          <span class="spacer"></span>
          <button type="button" class="adm-danger sm" data-del="contactSubmissions/${esc(m.id)}" data-after="#inbox" data-done="Message deleted.">Delete</button>
        </div>
      </li>`).join('')}</ul>` : '<p class="adm-empty">No messages yet.</p>'}`;
}

// Anyone can type anything into the sign-up box, so only what is plainly an email address is copied or
// downloaded. A spreadsheet program would run a line beginning with = + - or @ as a formula.
const isPlainAddress = (s) => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$/.test(s);

let addresses = [];
async function newsletter() {
  loading('Loading the list…');
  const items = (await session.list('newsletterSubscriptions'))
    .map((s) => ({ ...s, email: typeof s.email === 'string' ? s.email.trim() : String(s.email ?? '') }))
    .sort((a, b) => (toDate(b.subscribedAt) || 0) - (toDate(a.subscribedAt) || 0));
  addresses = [...new Set(items.filter((s) => s.isActive !== false && isPlainAddress(s.email)).map((s) => s.email))];
  const odd = items.filter((s) => !isPlainAddress(s.email)).length;
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head">
      <div><h2>Newsletter</h2><p>People who signed up in the “Letters from the dawn” box. ${addresses.length} address${addresses.length === 1 ? '' : 'es'}.${odd ? ` ${odd} entr${odd === 1 ? 'y doesn’t' : 'ies don’t'} look like an ordinary email address and ${odd === 1 ? 'is' : 'are'} left out when you copy or download.` : ''}</p></div>
      <div class="adm-actions">${addresses.length ? '<button type="button" class="btn btn-ink sm" data-act="copy">Copy all addresses</button><button type="button" class="btn btn-line sm" data-act="csv">Download the list</button>' : ''}</div>
    </div>
    <p class="adm-note" data-note role="status"></p>
    ${items.length ? `<ul class="adm-list">${items.map((s) => `
      <li class="adm-mail"><span><b>${esc(s.email)}</b>${isPlainAddress(s.email) ? '' : '<span class="adm-badge quiet">Left out</span>'}<span class="adm-sub">${esc(longDate(toDate(s.subscribedAt)))}</span></span>
        <button type="button" class="adm-danger sm" data-del="newsletterSubscriptions/${esc(s.id)}" data-after="#newsletter" data-done="Address removed.">Remove</button></li>`).join('')}</ul>` : '<p class="adm-empty">Nobody has signed up yet.</p>'}`;
}

async function copyAddresses() {
  const note = view().querySelector('[data-note]');
  try {
    await navigator.clipboard.writeText(addresses.join(', '));
    note.className = 'adm-note good';
    note.textContent = `Copied ${addresses.length} address${addresses.length === 1 ? '' : 'es'}. Paste them into the “Bcc” line of an email.`;
  } catch {
    note.className = 'adm-note bad';
    note.textContent = 'This browser wouldn’t copy them. Use “Download the list” instead.';
  }
}

function downloadAddresses() {
  const url = URL.createObjectURL(new Blob([`email\n${addresses.join('\n')}\n`], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'newsletter-addresses.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- wording and photos changed on the pages ---------- */

// Where a photo's original file is: inside this site, or at the outside address the page uses.
const originalPhoto = (key) => (/^https?:/i.test(key) ? key : SITE + key);

async function text() {
  loading('Loading the changes…');
  const { edits, images } = await fetchChanges();
  const keys = Object.keys(edits);
  const photos = Object.keys(images).filter((k) => isStored(images[k]));
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head"><div><h2>Text and photos</h2>
      <p>To change wording or a photo, open any page of the site and press <b>Edit this page</b> in the bar at the bottom. Click the text and type, or click a photo to choose another, then press Save.</p></div>
      <a class="btn btn-sun sm" href="${SITE}">Go to the site</a></div>
    <h3 class="adm-group">Wording changed</h3>
    ${keys.length ? `<ul class="adm-list">${keys.map((k) => `
      <li class="adm-mail"><span class="adm-sub" style="margin:0;font-size:15.5px;color:var(--text)">${esc(plainText(edits[k]).slice(0, 220) || '(empty)')}</span>
        <button type="button" class="adm-danger sm" data-undo="${esc(k)}">Use the original wording</button></li>`).join('')}</ul>` : '<p class="adm-empty">None. Every page shows the wording it was built with.</p>'}
    <h3 class="adm-group">Photos changed</h3>
    ${photos.length ? `<ul class="adm-list">${photos.map((k) => `
      <li class="adm-mail"><span class="adm-swap"><img class="was" src="${esc(originalPhoto(k))}" alt="The original photo" loading="lazy"> replaced by
        <img src="${esc(images[k].src)}" alt="${esc(images[k].alt || 'The photo shown now')}" loading="lazy"></span>
        <button type="button" class="adm-danger sm" data-undo-photo="${esc(k)}">Use the original photo</button></li>`).join('')}</ul>` : '<p class="adm-empty">None. Every page shows the photos it was built with.</p>'}`;
}

async function undoEdit(key) {
  const next = { ...(await fetchEdits()) };
  delete next[key];
  await session.setField(TEXT_DOC, TEXT_FIELD, JSON.stringify(next));
  setEdits(next);
  flash = 'That text is back to its original wording.';
  route();
}

async function undoPhoto(key) {
  const next = { ...(await fetchChanges()).images };
  delete next[key];
  await session.setField(TEXT_DOC, IMAGE_FIELD, JSON.stringify(next));
  setImages(next);
  flash = 'That photo is back to the original.';
  route();
}

const SECTIONS = { essays, events, inbox, newsletter, text };

/* ---------- wiring ---------- */

const armed = new WeakMap();   // delete buttons that have been pressed once
function confirmTwice(button) {
  if (armed.has(button)) { clearTimeout(armed.get(button)); armed.delete(button); return true; }
  const label = button.textContent;
  button.textContent = 'Press again to confirm';
  button.classList.add('armed');
  armed.set(button, setTimeout(() => { armed.delete(button); button.textContent = label; button.classList.remove('armed'); }, 5000));
  return false;
}

async function attempt(button, work) {
  const note = button.closest('form, [data-view]')?.querySelector('[data-note]');
  button.disabled = true;
  try {
    const message = await work();
    if (note && typeof message === 'string') { note.className = 'adm-note good'; note.textContent = message; }
  } catch (err) {
    if (err.kind === 'expired') return signInScreen(err.message);
    console.warn('[editor]', err.detail || err.message);
    const where = note || view();
    if (note) { note.className = 'adm-note bad'; note.innerHTML = `${esc(err.message)}${err.detail ? `<small>${esc(err.detail)}</small>` : ''}`; } else where.insertAdjacentHTML('afterbegin', failure(err));
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

root.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.matches('[data-sign]')) return onSignIn(form);
  const save = { essay: saveEssay, event: saveEvent }[form.dataset.form];
  if (save) attempt(form.querySelector('button[type="submit"]'), async () => { const done = await save(form); dirty = false; return done; });
});

root.addEventListener('input', (e) => {
  if (e.target.closest('.adm-edit')) { dirty = true; leaving = false; const note = e.target.closest('form').querySelector('[data-note]'); if (note) note.textContent = ''; }
  if (e.target.id === 'e-content') preview();
});

root.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'out') { dirty = false; session.signOut(); }
  if (act === 'forgot') onForgot();
  if (act === 'retry') route();
  if (act === 'copy') copyAddresses();
  if (act === 'csv') downloadAddresses();

  const md = e.target.closest('[data-md]');
  if (md) format(md.dataset.md);

  const del = e.target.closest('[data-del]');
  if (del && confirmTwice(del)) {
    const [collection, id] = del.dataset.del.split('/');
    attempt(del, async () => { await session.remove(collection, id); flash = del.dataset.done; go(del.dataset.after); });
  }

  const undo = e.target.closest('[data-undo]');
  if (undo && confirmTwice(undo)) attempt(undo, () => undoEdit(undo.dataset.undo));

  const back = e.target.closest('[data-undo-photo]');
  if (back && confirmTwice(back)) attempt(back, () => undoPhoto(back.dataset.undoPhoto));
});

window.addEventListener('hashchange', () => {
  if (dirty && !leaving) {   // first try to leave a form with changes: stay, and say why
    leaving = true;
    history.replaceState(null, '', lastHash || location.pathname);
    const note = root.querySelector('.adm-edit [data-note]');
    if (note) { note.className = 'adm-note bad'; note.textContent = 'Your changes aren’t saved yet. Press Save, or leave again to drop them.'; }
    return;
  }
  dirty = false;
  leaving = false;
  lastHash = location.hash;
  route();
});
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// The editor does not run inside another page's frame, where the page around it could disguise what is being clicked.
let framed = true;
try { framed = window.top !== window.self; } catch { /* a frame on another site */ }
if (framed) {
  root.innerHTML = `<div class="adm-card adm-sign"><h2>Open the editor in its own tab</h2><p>For safety, the editor doesn’t run inside another page.</p>
    <p><a class="btn btn-ink" href="${esc(location.href)}" target="_top">Open the editor</a></p></div>`;
} else {
  session.onChange(() => { dirty = false; route(); });
  route();
}
