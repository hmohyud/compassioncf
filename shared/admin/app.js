// The editor at /admin/: sign in with Google, then write essays, add events, testimonials and staff members,
// read the mailing list, and see the wording changed on the pages. Everything is read from and saved to the
// site's own database as the signed-in person (see session.js); the page itself holds no content.
//
// Sections follow the address: #essays, #essays/new, #essays/<id>, #events…, #testimonials…, #staff…,
// #newsletter, #text, #people.
//
// (Until 22 November 2026 there was an Inbox too, for messages sent through the contact form the site had
// before the foundation's Jotform took its place. The messages it held are still in the database, in
// contactSubmissions; the tab and its code are in git history.)

import * as session from './session.js';
import { markdown, splitTitle, toDate, lastDay, inOrder, PUBLISHED_SITE } from '../cms.js';
import { fetchChanges, fetchEdits, setEdits, setImages, setDatesOff, isStored, hasPhoto, isGray, photoUrl, keepPhoto, isCurrent, sanitize, TEXT_DOC, TEXT_FIELD, IMAGE_FIELD, DATES_FIELD, STAFF_KEPT, QUOTE_KEPT } from '../content.js';
import { EARLIER, ORIGINALS, WRITTEN_IN } from './originals.js';
import { preparePhoto } from './photo.js';

const root = document.querySelector('[data-admin-app]');
const SITE = new URL('../../', import.meta.url).href;
document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./admin.css', import.meta.url).href }));

const TABS = [['essays', 'Essays'], ['events', 'Events'], ['testimonials', 'Testimonials'], ['staff', 'Staff'], ['newsletter', 'Mailing list'], ['text', 'Text and photos'], ['people', 'People']];
// The keepers of the list of editors: always editors themselves, and the ones who can add and remove others.
// The database's rules name them by their Google addresses, which are kept out of this repository; this is
// only how the editor refers to them, and has to be changed together with the rules.
const KEEPERS = ['Thom Bond', 'Debra Chew', 'Hyder Mohyuddin'];
const keepers = (last) => `${KEEPERS.slice(0, -1).join(', ')} ${last} ${KEEPERS[KEEPERS.length - 1]}`;

/* ---------- small helpers ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const longDate = (d) => (d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
const dateTime = (d) => (d ? `${longDate(d)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '');
const fromDay = (day, time = '12:00') => { const [y, m, d] = day.split('-').map(Number); const [hh, mm] = time.split(':').map(Number); return new Date(y, m - 1, d, hh, mm); };
const isDayOnly = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
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

const SIGN_IN = 'Sign in with Google';

function signInScreen(message = '') {
  root.innerHTML = `
    <div class="adm-card adm-sign">
      <h2>Sign in</h2>
      <p>Editors sign in with their Google account. A Google window opens, you choose your account there, and it closes again.</p>
      <div class="form" data-sign>
        <button class="btn btn-sun" type="button" data-act="google">${SIGN_IN}</button>
        <p class="adm-note" data-note role="status">${esc(message)}</p>
      </div>
    </div>`;
  session.prepare();   // fetch what the button needs now, so it can open Google's window the moment it is pressed
}

function notAnEditor(email) {
  root.innerHTML = `
    <div class="adm-card adm-sign">
      <h2>This account can’t edit the site</h2>
      <p><b>${esc(email)}</b> is signed in, but it isn’t on the list of people who may edit this site.</p>
      <p>If it should be, ask ${esc(keepers('or'))} to add this exact address in the editor, under “People”. If you have another Google account that is on the list, sign out and choose that one.</p>
      <p><button type="button" class="btn btn-ink" data-act="out">Sign out</button></p>
    </div>`;
}

async function onSignIn(button) {
  const note = button.closest('[data-sign]').querySelector('[data-note]');
  note.className = 'adm-note';
  note.textContent = '';
  button.disabled = true;
  button.textContent = 'Waiting for Google…';
  try {
    await session.signIn();   // on success the session change redraws the page
  } catch (err) {
    if (!button.isConnected) return;
    button.disabled = false;
    button.textContent = SIGN_IN;
    note.className = err.kind === 'cancelled' ? 'adm-note' : 'adm-note bad';
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
    ok = await session.mayEdit();
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
      <div><h2>Essays</h2><p>The newest three appear on the News and Updates page and under “Latest writing” on the home page. All of them are on the Essays page.</p></div>
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
      <div class="field"><label for="e-excerpt">Summary <small>(optional; if empty, the essay’s card shows its opening lines)</small></label><textarea id="e-excerpt" name="excerpt" maxlength="600" style="min-height:84px">${esc(post.excerpt || '')}</textarea></div>
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
const monthName = (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// The dates written into the News and Updates page itself (FIXED_EVENTS in tools/build_pages.py), read from the
// page as it is published, so nothing here has to be kept in step with it by hand.
async function datesInThePage() {
  try {
    const res = await fetch(`${SITE}news/`, { cache: 'no-store' });
    if (!res.ok) return [];
    const page = new DOMParser().parseFromString(await res.text(), 'text/html');
    return [...page.querySelectorAll('[data-events-list] [data-fixed]')].map((item) => ({
      name: item.dataset.fixed,
      title: (item.querySelector('h3')?.textContent || '').trim(),
      day: item.dataset.date,
      until: item.dataset.until || item.dataset.date,
      month: !!item.querySelector('.event-date.month'),
      shown: (item.querySelector('time')?.textContent || '').trim(),
    })).filter((d) => d.name && d.title && isDayOnly(d.day) && isDayOnly(d.until));
  } catch {
    return [];
  }
}
// Those of them that are still the page's own: not moved into the list of events yet, and not past.
async function datesStillInThePage() {
  const [{ datesOff }, dates] = await Promise.all([fetchChanges(), datesInThePage()]);
  return { datesOff, dates: dates.filter((d) => !datesOff.includes(d.name) && fromDay(d.until, '23:59') >= startOfToday()) };
}

async function events(id) {
  if (id) return eventForm(id);
  loading('Loading events…');
  const today = startOfToday();
  const [found, inPage] = await Promise.all([session.list('events'), datesStillInThePage().then((r) => r.dates).catch(() => [])]);
  const all = found.map((e) => ({ ...e, when: eventDate(e) })).map((e) => ({ ...e, ends: lastDay(e, e.when) }));
  const upcoming = all.filter((e) => e.when && e.ends >= today).sort((a, b) => a.ends - b.ends);
  const past = all.filter((e) => !e.when || e.ends < today).sort((a, b) => (b.ends || 0) - (a.ends || 0));
  const shown = (e) => (!e.when ? 'No date' : e.wholeMonth === true ? monthName(e.when) : isDayOnly(e.date) || !(e.when.getHours() || e.when.getMinutes()) ? longDate(e.when) : dateTime(e.when));
  const row = (e) => `<li><a class="adm-row" href="#events/${encodeURIComponent(e.id)}">
    <span><span class="adm-title">${esc(e.title || 'Untitled event')}</span><span class="adm-sub">${esc(e.location || '')}</span></span>
    <span class="adm-meta">${esc(shown(e))}</span></a></li>`;
  const one = inPage.length === 1;
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head">
      <div><h2>Events</h2><p>Upcoming events appear under “Events” on the News and Updates page, in date order. Past ones drop off it by themselves.</p></div>
      <a class="btn btn-sun sm" href="#events/new">Add an event</a>
    </div>
    ${inPage.length ? `<h3 class="adm-group">Written into the page</h3>
    <p class="adm-hint">${one ? 'This date is' : `These ${inPage.length} dates are`} part of the News and Updates page itself, so ${one ? 'it' : 'they'} can’t be changed or removed from here yet. Move ${one ? 'it' : 'them'} into this list and ${one ? 'it becomes an ordinary event' : 'they become ordinary events'}: the page looks the same, and ${one ? 'it' : 'each'} can then be changed or removed like any other.</p>
    <ul class="adm-list">${inPage.map((d) => `<li class="adm-mail"><span><span class="adm-title">${esc(d.title)}</span><span class="adm-sub">${esc(d.shown)}</span></span></li>`).join('')}</ul>
    <div class="adm-actions"><button type="button" class="btn btn-ink sm" data-act="take-dates">Move ${one ? 'it' : 'them'} into this list</button><span class="adm-note" data-note role="status"></span></div>` : ''}
    <h3 class="adm-group">Upcoming</h3>
    ${upcoming.length ? `<ul class="adm-list">${upcoming.map(row).join('')}</ul>` : `<p class="adm-empty">${inPage.length ? 'Nothing added here is coming up.' : 'Nothing is coming up. The page shows its “Nothing on the calendar just yet” card.'}</p>`}
    ${past.length ? `<h3 class="adm-group">Past</h3><ul class="adm-list">${past.map(row).join('')}</ul>` : ''}`;
}

// Turns the dates written into the page into events in the database, then records that they have moved, which
// takes the page's own copies away (shared/cms.js). The events are made first: if the second step failed, the
// worst that could happen is a date showing twice, never a date lost, and the page already drops its own copy
// of a date when an event has the same name. A date that is here already under the same name is not made again.
async function takeDates() {
  const [{ datesOff, dates: moving }, existing] = await Promise.all([datesStillInThePage(), session.list('events')]);
  const have = new Set(existing.map((e) => String(e.title || '').trim().toLowerCase()));
  for (const d of moving) {
    if (have.has(d.title.toLowerCase())) continue;
    const now = new Date();
    // The link is read by visitors of the published site, so it names that site, not wherever this editor is running.
    await session.create('events', {
      title: d.title, location: '', description: `[Donate](${PUBLISHED_SITE}donate/)`,
      date: d.month ? `${d.day.slice(0, 7)}-01` : d.day, wholeMonth: d.month, createdAt: now, updatedAt: now,
    });
  }
  const next = [...new Set([...datesOff, ...moving.map((d) => d.name)])];
  await session.setField(TEXT_DOC, DATES_FIELD, JSON.stringify(next));
  setDatesOff(next);
  flash = moving.length === 1 ? 'That date is an ordinary event now. Change or remove it like any other.' : 'Those dates are ordinary events now. Change or remove them like any other.';
  go('#events');
}

async function eventForm(id) {
  const isNew = id === 'new';
  let ev = { title: '', description: '', location: '', date: '' };
  if (!isNew) { loading('Opening the event…'); ev = await session.get('events', id); }
  const when = eventDate(ev);
  const month = ev.wholeMonth === true;
  const timed = when && !month && !isDayOnly(ev.date) && (when.getHours() || when.getMinutes());
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
      <label class="adm-check"><input type="checkbox" name="month" ${month ? 'checked' : ''}> No particular day <small>(the page shows the month only, and keeps the event until that month ends)</small></label>
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
  const month = f.month.checked;
  const data = {
    title: f.title.value.trim(),
    description: f.description.value.replace(/\r\n?/g, '\n').trim(),
    location: f.location.value.trim(),
    // A day on its own is kept as plain text so it is the same day everywhere; with a time it is an exact moment.
    // An event for a whole month keeps the first day of that month, and says so in wholeMonth.
    date: month ? `${f.day.value.slice(0, 7)}-01` : f.time.value ? fromDay(f.day.value, f.time.value) : f.day.value,
    wholeMonth: month,
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

/* ---------- lists in an order the editors choose: testimonials and staff ---------- */

// Each record carries a number, `order`; a list reads from the lowest to the highest (inOrder, which the pages
// use too). A new record goes last.
const nextPlace = (items) => items.reduce((max, item) => (Number.isFinite(item.order) ? Math.max(max, item.order) : max), 0) + 1;
const line = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const clipped = (text, n = 150) => { const s = line(text); return s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s; };

// The two arrows beside each row of such a list.
const moves = (collection, id, i, n) => `<span class="adm-moves">
        <button type="button" data-move="${collection}/${esc(encodeURIComponent(id))}/-1" aria-label="Move up" title="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" data-move="${collection}/${esc(encodeURIComponent(id))}/1" aria-label="Move down" title="Move down"${i === n - 1 ? ' disabled' : ''}>↓</button></span>`;

// Moves one record a place up (-1) or down (1). Usually that is one change: the record's number becomes one
// between its new neighbours' numbers. If the numbers can't say that (two the same, or one missing), the whole
// list is numbered afresh in its new order.
async function moveItem(collection, id, step) {
  const items = (await session.list(collection)).sort(inOrder);
  const from = items.findIndex((item) => item.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= items.length) return;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  const first = to === 0;
  const last = to === next.length - 1;
  const lo = first ? null : next[to - 1].order;
  const hi = last ? null : next[to + 1].order;
  const at = first ? hi - 1 : last ? lo + 1 : (lo + hi) / 2;
  const sound = items.every((item) => Number.isFinite(item.order)) && new Set(items.map((item) => item.order)).size === items.length;
  if (sound && Number.isFinite(at) && (first || at > lo) && (last || at < hi)) {
    await session.update(collection, id, { order: at });
  } else {
    for (const [n, item] of next.entries()) if (item.order !== n + 1) await session.update(collection, item.id, { order: n + 1 });
  }
}

/* ---------- a photo kept with a record: a staff member's portrait, the picture beside a testimonial ---------- */

// How each is cut, where this browser keeps it once it has been read, and what its stored record says it is.
//   PORTRAIT  the frame the Board page gives a portrait (.portrait img in style.css): three wide to four tall,
//             keeping the top of a picture that is too tall, and shown about 300 pixels wide
//   FACE      the small round picture beside the name under a testimonial (.said-face in style.css): a square,
//             keeping the top of a tall picture and the middle of a wide one. It is under 50 pixels across on
//             every screen, so 192 are kept: ample for the sharpest of them, and only a few kilobytes to read
const PORTRAIT = { cut: { shape: 3 / 4, ax: 0.5, ay: 0.22, shown: 300 }, kept: STAFF_KEPT, of: 'staff' };
const FACE = { cut: { shape: 1, ax: 0.5, ay: 0.22, most: 192 }, kept: QUOTE_KEPT, of: 'testimonial' };
// The photo in the open form: which of the two it is (kind), the photo the record has now (had), a new one that
// has been prepared (picked), and whether the photo it has was taken off (off). Nothing is stored until the
// form is saved.
let portrait = null;

function openPortrait(kind, photo) {
  if (portrait?.picked) URL.revokeObjectURL(portrait.picked.preview);
  portrait = { kind, had: hasPhoto(photo) ? photo : null, picked: null, off: false };
}

// The part of a form that shows the photo, and lets one be chosen, taken off, and shown in black and white.
const portraitField = ({ id, hint, gray, grayHint, round = false }) => `<div class="field">
        <label for="${id}">Photo <small>(${hint})</small></label>
        <div class="adm-portrait${round ? ' round' : ''}">
          <div class="adm-portrait-frame"><img data-portrait alt="" hidden><span data-portrait-none>No photo</span></div>
          <div class="adm-portrait-acts">
            <input id="${id}" class="adm-file" type="file" accept="image/*" data-portrait-file>
            <button type="button" class="adm-link" data-act="portrait-off" hidden>Remove the photo</button>
            <label class="adm-check"><input type="checkbox" name="gray"${gray ? ' checked' : ''}> Grayscale <small>(${grayHint})</small></label>
            <span class="adm-note" data-portrait-note role="status"></span>
          </div>
        </div>
      </div>`;

// Shows the photo the form holds now, and what can be done with it.
function showPortrait() {
  const img = view()?.querySelector('[data-portrait]');
  if (!img || !portrait) return;
  const none = view().querySelector('[data-portrait-none]');
  const has = !!portrait.picked || (!!portrait.had && !portrait.off);
  img.hidden = !has;
  none.hidden = has;
  none.textContent = 'No photo';
  view().querySelector('[data-act="portrait-off"]').hidden = !has;
  img.style.filter = view().querySelector('input[name="gray"]').checked ? 'grayscale(1)' : '';
  if (portrait.picked) { img.src = portrait.picked.preview; return; }
  if (!has) { img.removeAttribute('src'); return; }
  const wanted = portrait.had;
  photoUrl(wanted, portrait.kind.kept)
    .then((url) => { if (img.isConnected && portrait && portrait.had === wanted && !portrait.picked && !portrait.off) img.src = url; })
    .catch(() => { if (img.isConnected && portrait && portrait.had === wanted && !portrait.picked) { img.hidden = true; none.hidden = false; none.textContent = 'This photo couldn’t be loaded'; } });
}

// A photo chosen in the form is prepared at once (cut to its place's shape and made light), so the form shows
// it as the page will; it is stored only when the form is saved.
async function choosePortrait(input) {
  const file = input.files && input.files[0];
  const note = view().querySelector('[data-portrait-note]');
  if (!file || !portrait) return;
  const mine = portrait;
  note.className = 'adm-note';
  note.textContent = 'Preparing the photo…';
  try {
    const made = await preparePhoto(file, mine.kind.cut);
    if (portrait !== mine || !note.isConnected) return;   // the form was left meanwhile
    if (mine.picked) URL.revokeObjectURL(mine.picked.preview);
    mine.picked = { ...made, preview: URL.createObjectURL(made.blob) };
    mine.off = false;
    note.textContent = '';
    dirty = true;
    showPortrait();
  } catch (err) {
    if (portrait !== mine || !note.isConnected) return;
    input.value = '';
    note.className = 'adm-note bad';
    note.textContent = `The photo wasn’t changed. ${err.message}`;
  }
}

function dropPortrait() {
  if (!portrait) return;
  if (portrait.picked) URL.revokeObjectURL(portrait.picked.preview);
  portrait.picked = null;
  portrait.off = true;
  const input = view().querySelector('[data-portrait-file]');
  if (input) input.value = '';
  dirty = true;
  showPortrait();
}

// Saving a record that can have a photo takes three steps, so that the record never names a photo that isn't
// there. First the photo chosen in the form is stored, under a name of its own (photoToName, which says what
// the record should name). Then the record is saved. Then this browser keeps the new photo, the one the record
// named before is removed, and the form shows what the record now holds (photoNamed). If the record could not
// be saved, the new photo is taken away again (photoUnnamed).
async function photoToName(form, kind) {
  const state = portrait || { kind, had: null, picked: null, off: false };
  let photo = state.had && !state.off ? { id: state.had.id, v: String(state.had.v ?? '') } : null;
  let stored = null;
  if (state.picked) {
    stored = { id: session.newPhotoId(), v: Date.now().toString(36) };
    await session.savePhoto(stored.id, state.picked.blob, { key: state.kind.of, width: state.picked.width, height: state.picked.height });
    photo = { ...stored };
  }
  if (photo && form.elements.gray.checked) photo.gray = true;
  return { state, photo, stored };
}

const photoUnnamed = ({ stored }) => { if (stored) session.removePhoto(stored.id).catch(() => {}); };

async function photoNamed({ state, photo, stored }, form, stays) {
  if (stored) await keepPhoto(stored, state.picked.blob, state.kind.kept);
  if (state.had && (!photo || photo.id !== state.had.id)) {
    session.removePhoto(state.had.id).catch((err) => console.warn('[editor] an unused photo was not removed:', err.detail || err.message));
  }
  if (!stays) return;   // a new record: its form closes, and the list is shown
  if (state.picked) URL.revokeObjectURL(state.picked.preview);
  portrait = { kind: state.kind, had: photo, picked: null, off: false };
  const input = form.querySelector('[data-portrait-file]');
  if (input) input.value = '';
  showPortrait();
}

/* ---------- testimonials ---------- */

async function testimonials(id) {
  if (id) return testimonialForm(id);
  loading('Loading testimonials…');
  const items = (await session.list('testimonials')).sort(inOrder);
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head">
      <div><h2>Testimonials</h2><p>Shown on the <a href="${SITE}programs/scholarship-fund/" target="_blank" rel="noopener">Scholarship Fund page</a>, in a section of their own and in this order. With none here, the page has no such section.</p></div>
      <a class="btn btn-sun sm" href="#testimonials/new">Add a testimonial</a>
    </div>
    <p class="adm-note" data-note role="status"></p>
    ${items.length ? `<ul class="adm-list">${items.map((q, i) => `
      <li class="adm-ordered"><a class="adm-row" href="#testimonials/${encodeURIComponent(q.id)}">
        <span><span class="adm-title">${esc(clipped(q.quote) || '(empty)')}</span><span class="adm-sub">${esc([line(q.name), line(q.about)].filter(Boolean).join(' · '))}</span></span></a>
        ${moves('testimonials', q.id, i, items.length)}</li>`).join('')}</ul>` : '<p class="adm-empty">No testimonials yet. Press “Add a testimonial” to add the first one.</p>'}`;
}

async function testimonialForm(id) {
  const isNew = id === 'new';
  let q = { quote: '', name: '', about: '', photo: null };
  if (!isNew) { loading('Opening the testimonial…'); q = await session.get('testimonials', id); }
  openPortrait(FACE, q.photo);
  view().innerHTML = `
    <a class="adm-back" href="#testimonials">← All testimonials</a>
    ${takeFlash()}
    <form class="adm-edit form" data-form="testimonial" data-id="${esc(id)}">
      <div class="adm-head"><div><h2>${isNew ? 'Add a testimonial' : 'Edit testimonial'}</h2></div>
        ${isNew ? '' : `<a href="${SITE}programs/scholarship-fund/" target="_blank" rel="noopener">See it on the site →</a>`}</div>
      <div class="field"><label for="t-quote">What they said <small>(no quotation marks needed; leave an empty line between paragraphs)</small></label><textarea id="t-quote" name="quote" required maxlength="3000" style="min-height:180px">${esc(q.quote || '')}</textarea></div>
      <div class="form-row">
        <div class="field"><label for="t-name">Who said it <small>(optional: a name, or words such as “A scholarship recipient”)</small></label><input id="t-name" name="name" maxlength="120" value="${esc(q.name || '')}"></div>
        <div class="field"><label for="t-about">About them <small>(optional: for example a place, or a year)</small></label><input id="t-about" name="about" maxlength="160" value="${esc(q.about || '')}"></div>
      </div>
      ${portraitField({ id: 't-photo', hint: 'optional: shown small and round beside their name. It is cut to a square, keeping the top of a tall picture', gray: isGray(q.photo), grayHint: 'black and white', round: true })}
      <div class="adm-actions">
        <button class="btn btn-sun" type="submit">Save</button>
        <span class="adm-note" data-note role="status"></span>
        <span class="spacer"></span>
        ${isNew ? '' : `<button type="button" class="adm-danger" data-del="testimonials/${esc(encodeURIComponent(id))}" data-after="#testimonials" data-done="Testimonial deleted.">Delete testimonial</button>`}
      </div>
    </form>`;
  showPortrait();
}

async function saveTestimonial(form) {
  const f = form.elements;
  const id = form.dataset.id;
  const quote = f.quote.value.replace(/\r\n?/g, '\n').trim();
  if (!quote) throw new session.Fail('other', 'Type what they said first.');
  const picture = await photoToName(form, FACE);
  const data = { quote, name: line(f.name.value), about: line(f.about.value), photo: picture.photo, updatedAt: new Date() };
  try {
    if (id === 'new') {
      data.order = nextPlace(await session.list('testimonials'));
      data.createdAt = new Date();
      await session.create('testimonials', data);
    } else {
      await session.update('testimonials', id, data);
    }
  } catch (err) {
    photoUnnamed(picture);   // the record wasn't saved, so nothing names the new photo
    throw err;
  }
  await photoNamed(picture, form, id !== 'new');
  if (id === 'new') {
    flash = 'Testimonial added. It is on the Scholarship Fund page now.';
    return go('#testimonials');
  }
  return 'Saved. The change is live.';
}

/* ---------- staff ---------- */

async function staff(id) {
  if (id) return staffForm(id);
  loading('Loading the staff…');
  const items = (await session.list('staff')).sort(inOrder);
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head">
      <div><h2>Staff</h2><p>Shown on the <a href="${SITE}board/" target="_blank" rel="noopener">Board page</a>, after the board members, in a section of their own and in this order. With nobody here, the page has no such section. The board members are part of the page itself: change their words and photos there, with “Edit this page”.</p></div>
      <a class="btn btn-sun sm" href="#staff/new">Add a staff member</a>
    </div>
    <p class="adm-note" data-note role="status"></p>
    ${items.length ? `<ul class="adm-list">${items.map((p, i) => `
      <li class="adm-ordered"><a class="adm-row" href="#staff/${encodeURIComponent(p.id)}">
        <span><span class="adm-title">${esc(line(p.name) || '(no name)')}${hasPhoto(p.photo) ? '' : '<span class="adm-badge quiet">No photo</span>'}</span><span class="adm-sub">${esc(line(p.role))}</span></span></a>
        ${moves('staff', p.id, i, items.length)}</li>`).join('')}</ul>` : '<p class="adm-empty">Nobody yet. Press “Add a staff member” to add the first one.</p>'}`;
}

async function staffForm(id) {
  const isNew = id === 'new';
  let p = { name: '', role: '', bio: '', photo: null };
  if (!isNew) { loading('Opening the staff member…'); p = await session.get('staff', id); }
  openPortrait(PORTRAIT, p.photo);
  view().innerHTML = `
    <a class="adm-back" href="#staff">← All staff</a>
    ${takeFlash()}
    <form class="adm-edit form" data-form="staff" data-id="${esc(id)}">
      <div class="adm-head"><div><h2>${isNew ? 'Add a staff member' : 'Edit staff member'}</h2></div>
        ${isNew ? '' : `<a href="${SITE}board/" target="_blank" rel="noopener">See it on the site →</a>`}</div>
      <div class="form-row">
        <div class="field"><label for="s-name">Name</label><input id="s-name" name="name" required maxlength="120" value="${esc(p.name || '')}"></div>
        <div class="field"><label for="s-role">Role <small>(optional: shown above the name)</small></label><input id="s-role" name="role" maxlength="160" value="${esc(p.role || '')}"></div>
      </div>
      <div class="field"><label for="s-bio">About them <small>(leave an empty line between paragraphs)</small></label><textarea id="s-bio" name="bio" maxlength="6000" style="min-height:220px">${esc(p.bio || '')}</textarea></div>
      ${portraitField({ id: 's-photo', hint: 'optional: it is cut to the shape of the portraits on the Board page, keeping the top of the picture', gray: isGray(p.photo), grayHint: 'the board’s portraits are black and white' })}
      <div class="adm-actions">
        <button class="btn btn-sun" type="submit">Save</button>
        <span class="adm-note" data-note role="status"></span>
        <span class="spacer"></span>
        ${isNew ? '' : `<button type="button" class="adm-danger" data-del="staff/${esc(encodeURIComponent(id))}" data-after="#staff" data-done="Staff member deleted.">Delete staff member</button>`}
      </div>
    </form>`;
  showPortrait();
}

async function saveStaff(form) {
  const f = form.elements;
  const id = form.dataset.id;
  const name = line(f.name.value);
  if (!name) throw new session.Fail('other', 'Type their name first.');
  const picture = await photoToName(form, PORTRAIT);
  const data = { name, role: line(f.role.value), bio: f.bio.value.replace(/\r\n?/g, '\n').trim(), photo: picture.photo, updatedAt: new Date() };
  try {
    if (id === 'new') {
      data.order = nextPlace(await session.list('staff'));
      data.createdAt = new Date();
      await session.create('staff', data);
    } else {
      await session.update('staff', id, data);
    }
  } catch (err) {
    photoUnnamed(picture);   // the record wasn't saved, so nothing names the new photo
    throw err;
  }
  await photoNamed(picture, form, id !== 'new');
  if (id === 'new') {
    flash = 'Staff member added. They are on the Board page now.';
    return go('#staff');
  }
  return 'Saved. The change is live.';
}

/* ---------- the mailing list ---------- */

// Anyone can type anything into the sign-up box, so only what is plainly an email address is copied or
// downloaded. A spreadsheet program would run a cell beginning with = + - or @ as a formula, so a name or
// place that starts that way is written with an apostrophe in front, which spreadsheets read as plain text.
const isPlainAddress = (s) => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$/.test(s);
const words = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 200) : '');
const cell = (v) => { const t = words(v); return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`; };

let addresses = [];   // the addresses to copy
let people = [];      // the same sign-ups with the name and place each one gave, for the download
async function newsletter() {
  loading('Loading the list…');
  const items = (await session.list('newsletterSubscriptions'))
    .map((s) => ({ ...s, email: typeof s.email === 'string' ? s.email.trim() : String(s.email ?? ''), name: words(s.name), location: words(s.location) }))
    .sort((a, b) => (toDate(b.subscribedAt) || 0) - (toDate(a.subscribedAt) || 0));
  const usable = items.filter((s) => s.isActive !== false && isPlainAddress(s.email));
  addresses = [...new Set(usable.map((s) => s.email))];
  people = addresses.map((email) => usable.find((s) => s.email === email && (s.name || s.location)) || usable.find((s) => s.email === email));
  const odd = items.filter((s) => !isPlainAddress(s.email)).length;
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head">
      <div><h2>Mailing list</h2><p>People who signed up in the “Join our Mailing List” box on the News and Updates page, or in the newsletter box the site had before it. ${addresses.length} address${addresses.length === 1 ? '' : 'es'}.${odd ? ` ${odd} entr${odd === 1 ? 'y doesn’t' : 'ies don’t'} look like an ordinary email address and ${odd === 1 ? 'is' : 'are'} left out when you copy or download.` : ''}</p></div>
      <div class="adm-actions">${addresses.length ? '<button type="button" class="btn btn-ink sm" data-act="copy">Copy all addresses</button><button type="button" class="btn btn-line sm" data-act="csv">Download the list</button>' : ''}</div>
    </div>
    <p class="adm-note" data-note role="status"></p>
    ${items.length ? `<ul class="adm-list">${items.map((s) => `
      <li class="adm-mail"><span><b>${esc(s.email)}</b>${isPlainAddress(s.email) ? '' : '<span class="adm-badge quiet">Left out</span>'}<span class="adm-sub">${esc([s.name, s.location, longDate(toDate(s.subscribedAt))].filter(Boolean).join(' · '))}</span></span>
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
  const rows = people.map((s) => [cell(s.name), cell(s.location), s.email].join(','));   // the address is already known to be plain
  const url = URL.createObjectURL(new Blob([`﻿name,town or country,email\n${rows.join('\n')}\n`], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'mailing-list.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- wording and photos changed on the pages ---------- */

// Where a photo's original file is: inside this site, or at the outside address the page uses.
const originalPhoto = (key) => (/^https?:/i.test(key) ? key : SITE + key);

// Why a line that was reworded before 16 November 2026 has no button to put its first wording back.
const NO_BUTTON = {
  'by-place': 'These words now stand in several places that started from different wording. To change one, retype it on its page.',
  stale: 'Going back would no longer be true.',
  removed: 'Emptied in the editor, then taken out of the page. Putting it back is a change to the site’s code.',
  gone: 'The page it was on no longer exists.',
};

async function text() {
  loading('Loading the changes…');
  const { edits, images } = await fetchChanges();
  const keys = Object.keys(edits).filter((k) => isCurrent(k) && !WRITTEN_IN.has(k));   // wording that has since been written into the pages themselves is not listed: it is part of the pages now
  const photos = Object.keys(images).filter((k) => isStored(images[k]));
  const words = (html) => plainText(html).slice(0, 260) || '(empty)';
  // A saved change on a line that has an earlier wording either is that earlier wording (the line was put back) or is something newer still.
  const putBack = (k) => typeof ORIGINALS[k] === 'string' && plainText(edits[k]) === plainText(ORIGINALS[k]);
  const changed = (k) => `
      <li class="adm-mail"><span class="adm-sub" style="margin:0;font-size:15.5px;color:var(--text)">${esc(words(edits[k]))}${putBack(k) ? '<span class="adm-badge quiet">Original wording</span>' : ''}</span>
        ${putBack(k) ? `<button type="button" class="adm-danger sm" data-undo="${esc(k)}">Use the newer wording</button>`
    : `<button type="button" class="adm-danger sm" ${typeof ORIGINALS[k] === 'string' ? 'data-orig' : 'data-undo'}="${esc(k)}">Use the original wording</button>`}</li>`;
  // Lines reworded before 16 November 2026: the page itself carries the newer wording, and the first wording is kept in originals.js.
  const canGoBack = EARLIER.filter((line) => line.kind === 'kept' && !(line.key in edits));
  const reference = EARLIER.filter((line) => line.kind !== 'kept');
  const earlier = (line, button) => `
      <li class="adm-was"><span><span class="adm-now">${esc(words(line.now))}</span>
        <span class="adm-sub"><b>At first:</b> ${esc(words(line.was))}</span>
        <span class="adm-meta">${esc(line.where)}${button ? '' : ` · ${esc(NO_BUTTON[line.kind] || '')}`}</span></span>
        ${button ? `<button type="button" class="adm-danger sm" data-orig="${esc(line.key)}">Use the original wording</button>` : ''}</li>`;
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head"><div><h2>Text and photos</h2>
      <p>${session.PHOTO_SWAPS
    ? 'To change wording or a photo, open any page of the site and press <b>Edit this page</b> in the bar at the bottom. Click the text and type, or click a photo to put another in its place or to show it in grayscale, then press Save.'
    : 'To change wording, open any page of the site and press <b>Edit this page</b> in the bar at the bottom. Click the text and type, then press Save. Photos can’t be changed from here at the moment: send a new photo to the person who looks after the website.'}</p></div>
      <a class="btn btn-sun sm" href="${SITE}">Go to the site</a></div>
    <h3 class="adm-group">Wording changed</h3>
    ${keys.length ? `<ul class="adm-list">${keys.map(changed).join('')}</ul>` : '<p class="adm-empty">None since 16 November 2026. Every page shows its own wording.</p>'}
    <h3 class="adm-group">Reworded before 16 November 2026</h3>
    <p class="adm-hint">These lines were reworded in the editor, and the newer wording is now part of the pages. Each can go back to what it said at first, which is the previous website’s wording wherever the line came from there. A line changes everywhere it appears.</p>
    ${canGoBack.length ? `<ul class="adm-list">${canGoBack.map((line) => earlier(line, true)).join('')}</ul>` : '<p class="adm-empty">None left: each of these lines has been changed again or put back.</p>'}
    <details class="adm-more"><summary>${reference.length} more lines, kept for reference</summary>
      <ul class="adm-list">${reference.map((line) => earlier(line, false)).join('')}</ul>
    </details>
    ${photos.length || session.PHOTO_SWAPS ? '<h3 class="adm-group">Photos changed</h3>' : ''}
    ${!photos.length && !session.PHOTO_SWAPS ? '' : photos.length ? `<ul class="adm-list">${photos.map((k) => `
      <li class="adm-mail"><span class="adm-swap"><img${hasPhoto(images[k]) ? ' class="was"' : ''} src="${esc(originalPhoto(k))}" alt="The original photo" loading="lazy">
        ${hasPhoto(images[k]) ? `replaced by <img data-stored="${esc(k)}" alt="${esc(images[k].alt || 'The photo shown now')}">` : ''}
        ${isGray(images[k]) ? '<span class="adm-badge quiet">Shown in grayscale</span>' : ''}</span>
        <button type="button" class="adm-danger sm" data-undo-photo="${esc(k)}">${hasPhoto(images[k]) ? 'Use the original photo' : 'Show it as it is'}</button></li>`).join('')}</ul>` : '<p class="adm-empty">None. Every page shows the photos it was built with, as they are.</p>'}`;
  // A photo put in place is read from the database, so its small picture arrives a moment after the list.
  for (const img of view().querySelectorAll('img[data-stored]')) {
    photoUrl(images[img.dataset.stored]).then((url) => { if (img.isConnected) img.src = url; }).catch(() => { img.alt = 'This photo couldn’t be loaded'; });
  }
}

// Removes a saved change, so the line reads as the page itself is written.
async function undoEdit(key) {
  const next = { ...(await fetchEdits()) };
  delete next[key];
  await session.setField(TEXT_DOC, TEXT_FIELD, JSON.stringify(next));
  setEdits(next);
  flash = typeof ORIGINALS[key] === 'string' ? 'That line shows its newer wording again.' : 'That text is back to its original wording.';
  route();
}

// Puts back the wording a line had at first, for a line whose newer wording is part of the page: the first
// wording is saved as a change, like any other, and shows everywhere the line appears.
async function useOriginal(key) {
  if (typeof ORIGINALS[key] !== 'string') return;
  const next = { ...(await fetchEdits()), [key]: sanitize(ORIGINALS[key]) };
  await session.setField(TEXT_DOC, TEXT_FIELD, JSON.stringify(next));
  setEdits(next);
  flash = 'That line is back to its original wording.';
  route();
}

// Puts a photo back to the one the page was built with, as it is. The record visitors' pages read is changed
// first; the stored photo it named is removed after that.
async function undoPhoto(key) {
  const now = (await fetchChanges()).images;
  const was = now[key];
  const next = { ...now };
  delete next[key];
  await session.setField(TEXT_DOC, IMAGE_FIELD, JSON.stringify(next));
  setImages(next);
  if (hasPhoto(was) && !Object.values(next).some((swap) => hasPhoto(swap) && swap.id === was.id)) {
    await session.removePhoto(was.id).catch((err) => console.warn('[editor] an unused photo was not removed:', err.detail || err.message));
  }
  flash = hasPhoto(was) ? 'That photo is back to the original.' : 'That photo is shown as it is again.';
  route();
}

/* ---------- who can edit ---------- */

// The list the keepers look after: one record per person, named by their Google address in lower case.
async function whoCanEdit() {
  loading('Loading the list…');
  const [found, manage] = await Promise.all([session.list('editors'), session.mayManage()]);
  const added = found.map((p) => ({ ...p, email: words(p.email || p.id), name: words(p.name), addedBy: words(p.addedBy), when: toDate(p.addedAt) }))
    .sort((a, b) => (a.when || 0) - (b.when || 0));
  const row = (p) => `
      <li class="adm-mail"><span><b>${esc(p.email)}</b><span class="adm-sub">${esc([p.name, p.addedBy ? `Added by ${p.addedBy}` : '', longDate(p.when)].filter(Boolean).join(' · '))}</span></span>
        ${manage ? `<button type="button" class="adm-danger sm" data-del="editors/${esc(encodeURIComponent(p.id))}" data-after="#people" data-done="Removed. ${esc(p.email)} can no longer edit the site.">Remove</button>` : ''}</li>`;
  view().innerHTML = `
    ${takeFlash()}
    <div class="adm-head"><div><h2>People</h2>
      <p>Who can sign in here and edit the site. Everyone on the list can change the pages, essays, events, testimonials and staff, and can see the mailing list.</p></div></div>
    <h3 class="adm-group">Always on the list</h3>
    <p class="adm-hint">${esc(keepers('and'))}. They look after this list: only they can add someone to it or take someone off it.</p>
    <h3 class="adm-group">Added</h3>
    ${added.length ? `<ul class="adm-list">${added.map(row).join('')}</ul>` : '<p class="adm-empty">Nobody else yet.</p>'}
    ${manage ? `
    <form class="adm-edit form adm-add" data-form="person">
      <h3 class="adm-group">Add a person</h3>
      <div class="form-row">
        <div class="field"><label for="p-email">Their Google address <small>(the address they sign in to Google with, such as a Gmail address)</small></label><input id="p-email" name="email" type="email" required maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="field"><label for="p-name">Name <small>(optional)</small></label><input id="p-name" name="name" maxlength="120" autocomplete="off"></div>
      </div>
      <div class="adm-actions">
        <button class="btn btn-sun" type="submit">Add to the list</button>
        <span class="adm-note" data-note role="status"></span>
      </div>
    </form>` : `<p class="adm-hint">To add or remove someone, ask ${esc(keepers('or'))}.</p>`}`;
}

async function savePerson(form) {
  const email = form.elements.email.value.trim().toLowerCase();
  const name = form.elements.name.value.replace(/\s+/g, ' ').trim();
  if (!isPlainAddress(email)) throw new session.Fail('other', 'That doesn’t look like an email address. Type the whole address, like name@gmail.com.');
  try {
    await session.createNamed('editors', email, { email, ...(name ? { name } : {}), addedBy: (session.current()?.email || '').toLowerCase(), addedAt: new Date() });
  } catch (err) {
    if (err.kind === 'exists') throw new session.Fail('other', `${email} is already on the list.`);
    throw err;
  }
  flash = `Added. ${email} can now sign in here with that Google account and edit the site.`;
  return go('#people');
}

const SECTIONS = { essays, events, testimonials, staff, newsletter, text, people: whoCanEdit };

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
  const save = { essay: saveEssay, event: saveEvent, testimonial: saveTestimonial, staff: saveStaff, person: savePerson }[form.dataset.form];
  if (save) attempt(form.querySelector('button[type="submit"]'), async () => { const done = await save(form); dirty = false; return done; });
});

root.addEventListener('input', (e) => {
  if (e.target.closest('.adm-edit')) { dirty = true; leaving = false; const note = e.target.closest('form').querySelector('[data-note]'); if (note) note.textContent = ''; }
  if (e.target.id === 'e-content') preview();
});

root.addEventListener('change', (e) => {
  if (e.target.matches('[data-portrait-file]')) choosePortrait(e.target);
  if (e.target.matches('.adm-portrait input[name="gray"]')) showPortrait();
});

root.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'out') { dirty = false; session.signOut(); }
  if (act === 'google') onSignIn(e.target.closest('[data-act]'));
  if (act === 'retry') route();
  if (act === 'copy') copyAddresses();
  if (act === 'csv') downloadAddresses();
  if (act === 'take-dates') attempt(e.target.closest('[data-act]'), takeDates);
  if (act === 'portrait-off') dropPortrait();

  const md = e.target.closest('[data-md]');
  if (md) format(md.dataset.md);

  // An arrow beside a row: move that record, then draw the list again with the same arrow in hand if it can be
  // pressed again (for someone moving a row several places from the keyboard).
  const move = e.target.closest('[data-move]');
  if (move && !move.disabled) {
    const [collection, id, step] = move.dataset.move.split('/').map(decodeURIComponent);
    const again = move.dataset.move;
    attempt(move, async () => {
      await moveItem(collection, id, Number(step));
      await route();
      const same = [...root.querySelectorAll('[data-move]')].find((b) => b.dataset.move === again);
      (same && !same.disabled ? same : same?.parentElement.querySelector('button:not(:disabled)'))?.focus();
    });
  }

  const del = e.target.closest('[data-del]');
  if (del && confirmTwice(del)) {
    const [collection, id] = del.dataset.del.split('/').map(decodeURIComponent);
    // The photo of a staff member or a testimonial is a record of its own: it goes once nothing names it.
    const photo = (collection === 'staff' || collection === 'testimonials') && portrait?.had ? portrait.had.id : '';
    attempt(del, async () => {
      await session.remove(collection, id);
      if (photo) session.removePhoto(photo).catch((err) => console.warn('[editor] an unused photo was not removed:', err.detail || err.message));
      flash = del.dataset.done;
      go(del.dataset.after);
    });
  }

  const undo = e.target.closest('[data-undo]');
  if (undo && confirmTwice(undo)) attempt(undo, () => undoEdit(undo.dataset.undo));

  const orig = e.target.closest('[data-orig]');
  if (orig && confirmTwice(orig)) attempt(orig, () => useOriginal(orig.dataset.orig));

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
