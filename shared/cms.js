// Live content from the foundation's own database: the public Firestore collections
// compassioncf.com reads (blogPosts, events), fetched over Firestore's REST API, so new
// essays and events published from the foundation's admin show up here too.
//
// Pages opt in with a data-cms attribute:
//   [data-cms="blog-list"]  cards into [data-posts]; data-href (link prefix, default "post.html?id="),
//                           data-limit, data-exclude-current (skip the ?id= post). A container with
//                           the hidden attribute is revealed only once posts load.
//   [data-cms="blog-post"]  reads ?id= and fills the [data-post-*] slots
//   [data-cms="events"]     upcoming events into [data-events-list], else shows [data-events-empty]
//
// No API key is sent: these collections are publicly readable, as they are for the live site.

const DB = 'https://firestore.googleapis.com/v1/projects/compassioncf-web-site/databases/(default)/documents';
const LIVE = 'https://compassioncf.com';

/* ---------- Firestore REST ---------- */

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
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
const longDate = (d) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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
    return /^(https?:|mailto:)/i.test(u) ? stash(`<a href="${esc(u)}" target="_blank" rel="noopener">`) + text + stash('</a>') : text;
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
    <h3><a href="${url}">${esc(title)}</a></h3>
    ${sub ? `<p class="post-sub">${esc(sub)}</p>` : ''}
    <p class="post-ex">${esc(excerpt(p))}</p>
    <span class="more" aria-hidden="true">Read the essay <span>→</span></span>
  </div>
</article>`;
}

export async function publishedPosts() {
  const posts = (await list('blogPosts')).filter((p) => p.isPublished !== false);
  return posts.sort((a, b) => (toDate(b.publishedAt) || 0) - (toDate(a.publishedAt) || 0));
}

async function blogList(el) {
  const slot = el.querySelector('[data-posts]') || el;
  const href = el.dataset.href || 'post.html?id=';
  const skip = el.hasAttribute('data-exclude-current') ? new URLSearchParams(location.search).get('id') : null;
  const show = (sel) => { const n = el.querySelector(sel); if (n) n.hidden = false; };
  try {
    const posts = (await publishedPosts()).filter((p) => p.id !== skip).slice(0, +el.dataset.limit || Infinity);
    if (!posts.length) {
      slot.innerHTML = '';
      show('[data-cms-empty]');
      return;
    }
    slot.innerHTML = posts.map((p, i) => postCard(p, i, href)).join('');
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
      p.author ? `<span>By <b>${esc(p.author)}</b></span>` : '',
      d ? `<time datetime="${isoDay(d)}">${longDate(d)}</time>` : '',
      `<span>${Math.max(1, Math.round(words / 230))} min read</span>`,
    ].join('');
    slot('body').innerHTML = markdown(p.content);
    const author = slot('author');
    if (author && /thom bond/i.test(p.author || '')) author.hidden = false;
  } catch (err) {
    console.warn('[cms] post unavailable:', err.message);
    slot('title').textContent = 'This essay couldn’t be loaded';
    slot('sub').hidden = true;
    slot('by').textContent = '';
    slot('body').innerHTML = `<p class="cms-note">It may have moved, or the connection dropped. You can <a href="${esc(id ? `${LIVE}/blog/${encodeURIComponent(id)}` : `${LIVE}/blog`)}">read it on compassioncf.com</a> or return to <a href="./">all essays</a>.</p>`;
  }
}

/* ---------- events ---------- */

function eventItem(e, i) {
  const d = e.when;
  const timed = d.getHours() || d.getMinutes();
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const time = timed ? ` · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
  return `<li class="event" style="--i:${i}">
  <div class="event-date" aria-hidden="true"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-US', { month: 'short' })}</span><small>${d.getFullYear()}</small></div>
  <div>
    <h3>${esc(e.title || 'Event')}</h3>
    <p class="event-meta"><time datetime="${timed ? d.toISOString() : isoDay(d)}">${day}${time}</time>${e.location ? ` · ${esc(e.location)}` : ''}</p>
    ${e.description ? `<div class="event-desc">${markdown(e.description)}</div>` : ''}
  </div>
</li>`;
}

async function events(el) {
  const part = (k) => el.querySelector(`[data-events-${k}]`);
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = (await list('events'))
      .filter((e) => e.isActive !== false)
      .map((e) => ({ ...e, when: toDate(e.date) }))
      .filter((e) => e.when && e.when >= today)
      .sort((a, b) => a.when - b.when);
    part('loading').hidden = true;
    if (!upcoming.length) { part('empty').hidden = false; return; }
    part('list').innerHTML = upcoming.map(eventItem).join('');
    part('list').hidden = false;
  } catch (err) {
    console.warn('[cms] events unavailable:', err.message);
    part('loading').hidden = true;
    part('empty').hidden = false;
    const note = part('note');
    if (note) note.textContent = 'We couldn’t load the calendar just now. New gatherings are always shared in our newsletter first.';
  }
}

const mounts = { 'blog-list': blogList, 'blog-post': blogPost, events };
document.querySelectorAll('[data-cms]').forEach((el) => mounts[el.dataset.cms]?.(el));
