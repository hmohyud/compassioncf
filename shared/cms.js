// Live content from the site's own database: the essays, events, testimonials and staff members its editor
// keeps (the Firestore collections blogPosts, events, testimonials and staff), fetched over Firestore's REST
// API, so a new essay, event, testimonial or staff member shows up here without editing this site.
//
// Pages opt in with a data-cms attribute:
//   [data-cms="blog-list"]  cards into [data-posts]; data-href (link prefix, default "post.html?id="),
//                           data-limit, data-exclude-current (skip the ?id= post). A container with
//                           the hidden attribute is revealed only once posts load. A [data-cms-more]
//                           link inside it is shown when there are more essays than the limit.
//   [data-cms="blog-post"]  reads ?id= and fills the [data-post-*] slots
//   [data-cms="events"]     upcoming events into [data-events-list], beside any dates written into
//                           the page there; shows [data-events-empty] when the list ends up empty
//   [data-cms="testimonials"]  the testimonials into [data-testimonials-list]; the container, which
//                           carries the hidden attribute, is revealed only if there is at least one,
//                           and its heading's words (data-heading) are written out only then
//   [data-cms="staff"]      the staff members into [data-staff-list], revealed the same way
//
// No API key is sent. Events, testimonials and staff members can be read by anyone; of the essays, only
// published ones can, and the database refuses a request for essays that does not itself ask for
// published ones only.

import * as content from './content.js';   // for the dates written into a page that have since become events (content.datesOff)
import { t, th, ready as wordsReady, locale, translated, rtl } from './i18n.js';   // labels and dates in the visitor's language

const DB = 'https://firestore.googleapis.com/v1/projects/compassioncf-editor/databases/(default)/documents';
const DONATE_PAGE = new URL('../donate/', import.meta.url).href;   // this site's donate page, wherever the site is served from
// The published site. What is kept in the database is read by its visitors, so a link the editor saves there
// names this address, even when the editor was running on a copy of the site on someone's own computer.
export const PUBLISHED_SITE = 'https://compassioncf.com/';
const DONATE_PAGES = [DONATE_PAGE, `${PUBLISHED_SITE}donate/`];

/* ---------- Firestore REST ---------- */

async function getJSON(url, send) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, send
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(send), signal: ctrl.signal }
      : { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function value(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('mapValue' in v) return fields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(value);
  return null;
}
const fields = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, value(v)]));
const toDoc = (d) => ({ id: d.name.split('/').pop(), ...fields(d.fields) });

export async function list(collection) {
  const out = [];
  let token = '';
  do {
    const page = await getJSON(`${DB}/${collection}?pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
    (page.documents || []).forEach((d) => out.push(toDoc(d)));
    token = page.nextPageToken;
  } while (token && out.length < 500);
  return out;
}

export async function get(collection, id) {
  return toDoc(await getJSON(`${DB}/${collection}/${encodeURIComponent(id)}`));
}

// The published essays. Asked for as a query that names "published" itself, which is the only kind of
// request for essays the database answers for someone who is not signed in.
async function published() {
  const found = await getJSON(`${DB}:runQuery`, { structuredQuery: {
    from: [{ collectionId: 'blogPosts' }],
    where: { fieldFilter: { field: { fieldPath: 'isPublished' }, op: 'EQUAL', value: { booleanValue: true } } },
    limit: 500,
  } });
  return (Array.isArray(found) ? found : []).filter((row) => row.document).map((row) => toDoc(row.document));
}

/* ---------- text helpers ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
  const m = typeof v === 'string' && v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  return isNaN(d) ? null : d;
}
const longDate = (d) => d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
// Essays and events are shown as the foundation wrote them. On a page being read in another language they are
// marked as English, for screen readers and so that they are set from left to right.
const AS_WRITTEN = translated ? ` lang="en"${rtl ? ' dir="ltr"' : ''}` : '';
const asWritten = (el) => { if (el && translated) { el.lang = 'en'; if (rtl) el.dir = 'ltr'; } };
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Titles on the live site may carry a subtitle on a second line.
export function splitTitle(t) {
  const [title = 'Untitled', ...rest] = String(t || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return [title, rest.join(' ')];
}

export function plain(md = '') {
  return String(md)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#{1,6}|>|[-*+•]|\d+[.)])\s+/gm, '')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text, n = 240) {
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}

const excerpt = (p) => clip(plain(p.excerpt || p.content || ''));

// A small, safe Markdown renderer for what the foundation's admin produces: paragraphs,
// headings, lists, quotes, rules, bold/italic, code and links. Everything is escaped first.
function inline(src) {
  const keep = [];
  const stash = (html) => `\u0000${keep.push(html) - 1}\u0000`;
  let s = esc(src);
  s = s.replace(/`([^`]+)`/g, (m, c) => stash(`<code>${c}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const u = url.replace(/&amp;/g, '&');
    if (!/^(https?:|mailto:)/i.test(u)) return text;
    // A link to this site's own donate page opens the donate window in place, like every other Donate link here.
    const open = DONATE_PAGES.includes(u.replace(/\/?$/, '/')) ? `<a href="${esc(u)}" data-donate>` : `<a href="${esc(u)}" target="_blank" rel="noopener">`;
    return stash(open) + text + stash('</a>');
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (m, pre, url) => pre + stash(`<a href="${url}" target="_blank" rel="noopener">${url}</a>`));
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]+?)\1/g, (m, d, t) => `<strong>${t.trim()}</strong>`);
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_(?=\S)([^_]+?)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[i]);
}

export function markdown(src = '') {
  const out = [];
  let para = [], quote = [], list = null;
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  const flushQuote = () => { if (quote.length) out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`); quote = []; };
  const flushList = () => { if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`); list = null; };
  const flush = () => { flushPara(); flushQuote(); flushList(); };
  const item = (type, text) => {
    flushPara(); flushQuote();
    if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
    list.items.push(text);
  };
  for (const raw of String(src).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*$/))) {
      flush();
      const h = m[1].length <= 2 ? 2 : m[1].length === 3 ? 3 : 4;
      out.push(`<h${h}>${inline(m[2])}</h${h}>`);
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    if ((m = line.match(/^\s{0,3}>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }
    if ((m = line.match(/^\s{0,3}[-*+•]\s+(.*)$/))) { item('ul', m[1]); continue; }
    if ((m = line.match(/^\s{0,3}\d+[.)]\s+(.*)$/))) { item('ol', m[1]); continue; }
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    flushQuote(); flushList();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

/* ---------- blog ---------- */

// Each card's art is a different moment of the same sunrise.
const SKIES = [['30%', '-30%', '0deg'], ['70%', '-18%', '-14deg'], ['48%', '-40%', '10deg'], ['22%', '-14%', '-6deg'], ['78%', '-36%', '16deg']];

function postCard(p, i, href) {
  const [title, sub] = splitTitle(p.title);
  const url = esc(href + encodeURIComponent(p.id));
  const d = toDate(p.publishedAt);
  const [x, y, h] = SKIES[i % SKIES.length];
  return `<article class="post-card" style="--i:${i};--x:${x};--y:${y};--h:${h}">
  <div class="post-art" aria-hidden="true"></div>
  <div class="post-text">
    ${d ? `<p class="post-date"><time datetime="${isoDay(d)}">${longDate(d)}</time></p>` : ''}
    <h3${AS_WRITTEN}><a href="${url}">${esc(title)}</a></h3>
    ${sub ? `<p class="post-sub"${AS_WRITTEN}>${esc(sub)}</p>` : ''}
    <p class="post-ex"${AS_WRITTEN}>${esc(excerpt(p))}</p>
    <span class="more" aria-hidden="true">${esc(t('Read the essay'))} <span>→</span></span>
  </div>
</article>`;
}

export async function publishedPosts() {
  const posts = (await published()).filter((p) => p.isPublished !== false);
  return posts.sort((a, b) => (toDate(b.publishedAt) || 0) - (toDate(a.publishedAt) || 0));
}

// A message for an empty or failed list is kept in its data-say attribute, not as text, and written out only
// when it is shown. Otherwise a reader that does not run scripts (a search engine, or a tool that reads a
// page for someone) is shown every message at once: no essays, couldn't load them, nothing on the calendar.
function reveal(node) {
  if (!node) return;
  for (const n of [node, ...node.querySelectorAll('[data-say]')]) if (n.dataset.say && !n.textContent.trim()) n.textContent = n.dataset.say;
  node.hidden = false;
}

async function blogList(el) {
  const slot = el.querySelector('[data-posts]') || el;
  const href = el.dataset.href || 'post.html?id=';
  const skip = el.hasAttribute('data-exclude-current') ? new URLSearchParams(location.search).get('id') : null;
  const show = (sel) => reveal(el.querySelector(sel));
  try {
    const all = (await publishedPosts()).filter((p) => p.id !== skip);
    const posts = all.slice(0, +el.dataset.limit || Infinity);
    if (!posts.length) {
      slot.innerHTML = '';
      show('[data-cms-empty]');
      return;
    }
    slot.innerHTML = posts.map((p, i) => postCard(p, i, href)).join('');
    if (all.length > posts.length) show('[data-cms-more]');
    el.hidden = false;
  } catch (err) {
    console.warn('[cms] blog list unavailable:', err.message);
    slot.innerHTML = '';
    show('[data-cms-error]');
  }
}

async function blogPost(el) {
  const id = new URLSearchParams(location.search).get('id');
  const slot = (k) => document.querySelector(`[data-post-${k}]`);
  try {
    if (!id) throw new Error('no post id');
    const p = await get('blogPosts', id);
    if (p.isPublished === false) throw new Error('not published');
    const [title, sub] = splitTitle(p.title);
    const d = toDate(p.publishedAt);
    const words = plain(p.content).split(' ').length;
    document.title = `${title} — Compassion Course Foundation`;
    slot('title').textContent = title;
    slot('sub').textContent = sub;
    slot('sub').hidden = !sub;
    slot('by').innerHTML = [
      p.author ? `<span>${esc(t('By {author}')).replace('{author}', `<b${AS_WRITTEN}>${esc(p.author)}</b>`)}</span>` : '',
      d ? `<time datetime="${isoDay(d)}">${longDate(d)}</time>` : '',
      `<span>${esc(t('{n} min read', { n: Math.max(1, Math.round(words / 230)) }))}</span>`,
    ].join('');
    slot('body').innerHTML = markdown(p.content);
    for (const k of ['title', 'sub', 'body']) asWritten(slot(k));
    const author = slot('author');
    if (author && /thom bond/i.test(p.author || '')) author.hidden = false;
  } catch (err) {
    console.warn('[cms] post unavailable:', err.message);
    slot('title').textContent = t('This essay couldn’t be loaded');
    slot('sub').hidden = true;
    slot('by').textContent = '';
    slot('body').innerHTML = `<p class="cms-note">${th('It may have moved, or the connection dropped. Please try again in a moment, or return to <a href="./">all essays</a>.')}</p>`;
  }
}

/* ---------- events ---------- */

// An event can be for a whole month with no particular day (wholeMonth: true, its date any day of that month).
// It shows the month only, and counts as upcoming until the month's last day.
export const monthEnd = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const lastDay = (e, when = toDate(e.date)) => (when && e.wholeMonth === true ? monthEnd(when) : when);

function eventItem(e, i) {
  const d = e.when;
  const month = e.wholeMonth === true;
  const timed = !month && (d.getHours() || d.getMinutes());
  const day = d.toLocaleDateString(locale, month ? { month: 'long', year: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const time = timed ? ` · ${d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}` : '';
  const stamp = month ? isoDay(d).slice(0, 7) : timed ? d.toISOString() : isoDay(d);
  const badge = month
    ? `<b>${d.toLocaleDateString(locale, { month: 'short' })}</b><small>${d.getFullYear()}</small>`
    : `<b>${d.getDate()}</b><span>${d.toLocaleDateString(locale, { month: 'short' })}</span><small>${d.getFullYear()}</small>`;
  return `<li class="event" style="--i:${i}" data-date="${isoDay(e.ends)}" data-no-edit>
  <div class="event-date${month ? ' month' : ''}" aria-hidden="true">${badge}</div>
  <div>
    <h3${AS_WRITTEN}>${esc(e.title || t('Event'))}</h3>
    <p class="event-meta"><time datetime="${stamp}">${day}${time}</time>${e.location ? ` · ${esc(e.location)}` : ''}</p>
    ${e.description ? `<div class="event-desc"${AS_WRITTEN}>${markdown(e.description)}</div>` : ''}
  </div>
</li>`;
}

// The list may already hold dates written into the page itself. Each of those says when it ends
// (data-until, its last day) and leaves the page by itself once that day has passed. It also leaves
// once an editor has moved it into the Events list (its data-fixed name is then in content.datesOff),
// because from then on it is an event in the database like any other. Events from the database join
// the same list in date order (data-date is where an item sorts).
async function events(el) {
  const part = (k) => el.querySelector(`[data-events-${k}]`);
  const listEl = part('list');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tidy = () => listEl.querySelectorAll('[data-until], [data-fixed]').forEach((item) => {
    const until = toDate(item.dataset.until);
    if ((until && until < today) || content.datesOff.includes(item.dataset.fixed)) item.remove();
  });
  const settle = () => {
    const any = listEl.children.length > 0;
    listEl.hidden = !any;
    if (any) part('empty').hidden = true;
    else reveal(part('empty'));
    if (part('loading')) part('loading').hidden = true;
  };
  tidy();   // what is known already: a date that has passed, or one remembered as moved from an earlier visit
  // Both answers are waited for before the list changes, so a moved date is swapped for its event in one step.
  const [, found] = await Promise.allSettled([content.ready, list('events')]);
  tidy();
  if (found.status === 'fulfilled') {
    const upcoming = found.value
      .filter((e) => e.isActive !== false)
      .map((e) => ({ ...e, when: toDate(e.date) }))
      .map((e) => ({ ...e, ends: lastDay(e, e.when) }))
      .filter((e) => e.when && e.ends >= today)
      // by date; on the same day a dated event comes before a whole-month one, then by name, so the order never jumps about
      .sort((a, b) => (a.ends - b.ends) || ((a.wholeMonth === true) - (b.wholeMonth === true)) || String(a.title || '').localeCompare(String(b.title || '')));
    const named = (text) => String(text || '').trim().toLowerCase();
    const holder = document.createElement('template');
    upcoming.forEach((e, i) => {
      // An event with the same name as a date still written into the page replaces that copy, even if this
      // browser couldn't learn that the date had been moved.
      listEl.querySelectorAll('[data-fixed]').forEach((fixed) => { if (named(fixed.querySelector('h3')?.textContent) === named(e.title)) fixed.remove(); });
      holder.innerHTML = eventItem(e, i);
      const item = holder.content.firstElementChild;
      const later = [...listEl.children].find((other) => (other.dataset.date || '') > item.dataset.date);
      listEl.insertBefore(item, later || null);
    });
  } else {
    console.warn('[cms] events unavailable:', found.reason?.message);
    const note = part('note');
    if (note) note.textContent = t('We couldn’t load the calendar just now. New dates are always shared with our mailing list first.');
  }
  settle();
}

/* ---------- testimonials and staff ---------- */

// Two lists the editor keeps in an order of the editors' choosing: testimonials, shown on the Scholarship Fund
// page, and staff members, shown on the Board page after the board. Each record carries a number, `order`;
// a list reads from the lowest to the highest, and two records with the same number read older first.
// Each has a section in its page that stays hidden until its list has something in it, so a page with an empty
// list, or one whose list could not be read, simply has no such section.
const placeOf = (item) => (typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : Number.MAX_SAFE_INTEGER);
export const inOrder = (a, b) => (placeOf(a) - placeOf(b)) || ((toDate(a.createdAt) || 0) - (toDate(b.createdAt) || 0));
const said = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// The section's heading is kept in an attribute, out of the page's text, until the section has something to
// show: a reader that does not run scripts (a search engine, or a tool that reads a page for someone) is then
// not shown a heading with nothing under it. Once written out it is a piece of the page's text like any other:
// the editor can reword it, and it is put into the visitor's language (content.adopt).
function showSection(el) {
  const heading = el.querySelector('[data-heading]');
  if (heading && !heading.dataset.editable) {
    heading.textContent = heading.dataset.heading;
    heading.dataset.editable = `${el.dataset.cms} heading`;
    content.adopt(el);
  }
  el.hidden = false;
}

// What an editor typed into a box: an empty line starts a new paragraph, and a line break stays a line break.
// `rich` reads links, bold and italics the way an essay does; otherwise every character is shown as typed.
const paragraphs = (text, rich, attrs = '') => String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p${attrs}>${p.split('\n').map((line) => (rich ? inline(line.trim()) : esc(line.trim()))).join('<br>')}</p>`).join('\n    ');

function quoteCard(q) {
  const name = said(q.name);
  const about = said(q.about);
  return `<figure class="said-item" data-no-edit${AS_WRITTEN}>
  <blockquote>
    ${paragraphs(q.quote, false)}
  </blockquote>
  ${name || about ? `<figcaption>${name ? `<b>${esc(name)}</b>` : ''}${about ? `<span>${esc(about)}</span>` : ''}</figcaption>` : ''}
</figure>`;
}

async function testimonials(el) {
  const slot = el.querySelector('[data-testimonials-list]');
  try {
    const found = (await list('testimonials')).filter((q) => typeof q.quote === 'string' && q.quote.trim()).sort(inOrder);
    if (!slot || !found.length) return;
    slot.innerHTML = found.map(quoteCard).join('\n');
    showSection(el);
  } catch (err) {
    console.warn('[cms] testimonials unavailable:', err.message);
  }
}

// A portrait is a photo kept in the site's database (see "photos" in shared/content.js). Until it has been
// read, its frame is empty; a person with no photo, or whose photo can't be read, is shown by their initials.
const NO_PICTURE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const initials = (name) => {
  const parts = name.split(/\s+/).map((w) => [...w].find((c) => /\p{L}/u.test(c)) || '').filter(Boolean);
  return (parts.length > 1 ? parts[0] + parts[parts.length - 1] : parts[0] || '').toUpperCase();
};
const noPortrait = (name) => `<div class="portrait blank" aria-hidden="true"><span>${esc(initials(name))}</span></div>`;

function memberCard(p, i, taken) {
  const name = said(p.name);
  const role = said(p.role);
  // An address of its own on the page ("/board/#jane-doe"), unless something there has that name already.
  let id = name.toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  if (!id || taken.has(id) || document.getElementById(id)) id = `staff-${i + 1}`;
  taken.add(id);
  const photo = content.hasPhoto(p.photo)
    ? `<div class="portrait"><img src="${NO_PICTURE}" alt="${esc(name)}" data-staff-photo="${i}"${content.isGray(p.photo) ? ' style="filter:grayscale(1)"' : ''}></div>`
    : noPortrait(name);
  return `<article class="member${role ? '' : ' no-role'}" id="${esc(id)}" data-no-edit>
  ${photo}
  <div>
    ${role ? `<p class="kicker"${AS_WRITTEN}>${esc(role)}</p>` : ''}
    <h3${AS_WRITTEN}>${esc(name)}</h3>
    ${paragraphs(p.bio, true, AS_WRITTEN)}
  </div>
</article>`;
}

async function staff(el) {
  const slot = el.querySelector('[data-staff-list]');
  try {
    const found = (await list('staff')).filter((p) => said(p.name)).sort(inOrder);
    if (!slot || !found.length) return;
    const taken = new Set();
    slot.innerHTML = found.map((p, i) => memberCard(p, i, taken)).join('\n');
    showSection(el);
    found.forEach((p, i) => {
      const img = slot.querySelector(`[data-staff-photo="${i}"]`);
      if (!img) return;
      content.photoUrl(p.photo, content.STAFF_KEPT)
        .then((url) => { img.src = url; })
        .catch((err) => {
          console.warn('[cms] a portrait was not loaded:', err.message);
          img.parentElement.outerHTML = noPortrait(said(p.name));
        });
    });
    content.tidyPhotos(found.map((p) => p.photo), content.STAFF_KEPT);
  } catch (err) {
    console.warn('[cms] staff unavailable:', err.message);
  }
}

const mounts = { 'blog-list': blogList, 'blog-post': blogPost, events, testimonials, staff };
// Once the visitor's language has been read (at once, in English), so that what is written here is written in it.
wordsReady.then(() => document.querySelectorAll('[data-cms]').forEach((el) => mounts[el.dataset.cms]?.(el)));
