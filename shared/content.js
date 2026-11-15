// Changes made in the site's editor, applied on top of the text and photos built into each page.
//
// An editor signed in at /admin/ can click any text on the site and change it. Those edits are kept in
// the foundation's database as one small JSON object, { "<key>": "<html>" }, and applied here for every
// visitor. A key is a hash of the sentence as it is written in the page's own HTML, so:
//   - an edit follows that sentence wherever it appears (the footer line is edited once for all pages);
//   - if the sentence itself is later changed in the code, the edit no longer matches and is dropped.
//
// Only simple inline markup survives (emphasis, links, line breaks). Everything else is stripped, when an
// edit is saved and again here before it is shown, so the stored text can never inject anything else.
//
// Photos work the same way: { "<which photo>": { "src": "<address of the new file>", "alt": "<description>" } }.
// A photo is known by where its file lives, so one photo used on several pages is swapped on all of them.
// A new file is only ever shown if it is in the foundation's own file storage.
//
// The editor's own code (shared/admin/) is loaded only in a browser that has signed in.

const DB = 'https://firestore.googleapis.com/v1/projects/compassioncf-web-site/databases/(default)/documents';
export const TEXT_DOC = 'content/home';   // an existing document: public to read, writable by admin accounts
export const TEXT_FIELD = 'siteText';     // one string field holding the JSON object of text edits
export const IMAGE_FIELD = 'siteImages';  // another, holding the JSON object of swapped photos
export const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/compassioncf-web-site.firebasestorage.app/o/';
const CACHE = 'ccf-text';                 // last known changes, so returning visitors don't see the old page first
const IMAGE_CACHE = 'ccf-images';
const SESSION = 'ccf-admin';
const ROOT = new URL('../', import.meta.url);   // the site's own root, wherever it is being served from

/* ---------- which text can be edited ---------- */

// Left alone: navigation, forms, anything a script fills in, decorative or generated bits.
// That includes the globe (.g-wrap), whose place label keeps changing by itself, and any other
// status line a script writes to: text that changes on its own would look like an edit.
const SKIP = [
  'script', 'style', 'noscript', 'svg', 'nav', 'form', 'dialog', '.brand', '.skip', '.cms-note',
  '.g-wrap', '[role="status"]', '[role="alert"]', '[aria-live]',
  '[aria-hidden="true"]', '[data-count]', '[data-year]', '[data-no-edit]', '[data-admin-app]',
  '[data-posts]', '[data-events-list]', '[data-events-loading]', '[data-events-note]',
  '[data-post-title]', '[data-post-sub]', '[data-post-by]', '[data-post-body]',
].join(',');
const NOT_PLAIN_TEXT = 'img,svg,input,select,textarea,button,iframe,canvas,video,form,[data-count],[data-year]';

const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim());

// The outermost elements that directly contain text: a heading with an <em> inside is one piece of text.
function findText(root) {
  const found = [];
  const walk = (el) => {
    if (el.matches(SKIP)) return;
    if (hasOwnText(el)) {
      if (!el.querySelector(NOT_PLAIN_TEXT)) found.push(el);
      return;
    }
    for (const child of el.children) walk(child);
  };
  root.querySelectorAll('main, footer').forEach(walk);
  return found;
}

export const normalize = (html) => String(html).replace(/\s+/g, ' ').trim();

function fnv(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const keyFor = (html) => fnv(html, 2166136261) + fnv(html, 0x9e3779b9);

/* ---------- keeping stored text harmless ---------- */

const ALLOWED = new Set(['a', 'b', 'br', 'em', 'i', 'small', 'span', 'strong', 'sub', 'sup', 'u']);
const DROPPED = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'img', 'video', 'audio', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select']);
const BLOCKS = new Set(['div', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'tr']);

function safeHref(href) {
  const h = String(href || '').trim();
  if (!h) return '';
  try {
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(h, location.href).protocol) ? h : '';
  } catch {
    return '';
  }
}

export function sanitize(html) {
  const source = document.createElement('template');   // parsed but inert: nothing loads or runs
  source.innerHTML = String(html ?? '');
  const out = document.createElement('div');
  const copy = (from, to) => {
    for (const node of from.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) { to.append(node.nodeValue); continue; }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.localName;
      if (DROPPED.has(tag)) continue;
      if (!ALLOWED.has(tag)) {                 // a wrapper the editor's browser added (div, p, font…): keep its text
        if (BLOCKS.has(tag) && to.lastChild) to.append(document.createElement('br'));
        copy(node, to);
        continue;
      }
      const el = document.createElement(tag);
      const cls = node.getAttribute('class');
      if (cls) el.setAttribute('class', cls);
      if (tag === 'span' && node.getAttribute('aria-hidden') === 'true') el.setAttribute('aria-hidden', 'true');
      if (tag === 'a') {
        const href = safeHref(node.getAttribute('href'));
        if (href) el.setAttribute('href', href);
        if (node.getAttribute('target') === '_blank') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
      }
      copy(node, el);
      to.append(el);
    }
  };
  copy(source.content, out);
  while (out.lastChild && out.lastChild.nodeName === 'BR') out.lastChild.remove();   // browsers leave one behind while typing
  return out.innerHTML;
}

/* ---------- applying edits ---------- */

// Every editable piece of text on this page, with the key and wording it has in the page's own HTML.
export const entries = findText(document).map((el) => {
  const original = el.innerHTML;
  return { el, original, key: keyFor(normalize(original)), edited: false };
});

export function apply(edits = {}) {
  for (const entry of entries) {
    const html = edits[entry.key];
    if (typeof html === 'string') {
      entry.el.innerHTML = sanitize(html);
      entry.edited = true;
    } else if (entry.edited) {
      entry.el.innerHTML = entry.original;
      entry.edited = false;
    }
  }
}

/* ---------- photos ---------- */

// Photographs in the page body. Logos, and anything a script draws, are left alone.
const IMAGE_SKIP = 'nav, form, dialog, .brand, .news-in, .g-wrap, [data-admin-app], [data-no-edit], [data-posts], [data-post-body], [data-events-list]';

// Which photo this is: its path inside this site ("shared/img/hands.jpg"), or the full address of a file kept elsewhere.
export function imageKey(src) {
  const url = new URL(src, document.baseURI);
  url.hash = '';
  return url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname) ? url.pathname.slice(ROOT.pathname.length) : url.href;
}

// Every photo on this page that can be swapped, with the file and description it has in the page's own HTML.
export const imageEntries = [...document.querySelectorAll('main img[src]')]
  .filter((el) => !el.closest(IMAGE_SKIP))
  .map((el) => ({ el, key: imageKey(el.getAttribute('src')), src: el.getAttribute('src'), alt: el.getAttribute('alt') || '', edited: false }));

// A swap counts only if its file is in the foundation's storage; anything else in the database is ignored.
export const isStored = (swap) => !!swap && typeof swap.src === 'string' && swap.src.startsWith(STORAGE);

// A photo with no description in the page is decoration there (its caption is beside it), and stays that way.
export const describe = (entry, swap) => (entry.alt && swap && typeof swap.alt === 'string' && swap.alt.trim() ? swap.alt.trim() : entry.alt);

export function show(entry, src, alt) {
  if (entry.el.getAttribute('src') !== src) entry.el.setAttribute('src', src);
  if ((entry.el.getAttribute('alt') || '') !== alt) entry.el.setAttribute('alt', alt);
}

export function applyImages(swaps = {}) {
  for (const entry of imageEntries) {
    const swap = isStored(swaps[entry.key]) ? swaps[entry.key] : null;
    show(entry, swap ? swap.src : entry.src, describe(entry, swap));
    entry.edited = !!swap;
  }
}

/* ---------- reading what editors have saved ---------- */

const readCache = (name) => { try { return JSON.parse(localStorage.getItem(name)) || {}; } catch { return {}; } };
const remember = (name, value) => { try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* private window */ } };
const parseMap = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

// The text edits and swapped photos as they are in the database right now. Throws if they can't be read.
export async function fetchChanges() {
  const res = await fetch(`${DB}/${TEXT_DOC}?mask.fieldPaths=${TEXT_FIELD}&mask.fieldPaths=${IMAGE_FIELD}`);
  if (res.status === 404) return { edits: {}, images: {} };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await res.json();
  return { edits: parseMap(doc.fields?.[TEXT_FIELD]?.stringValue), images: parseMap(doc.fields?.[IMAGE_FIELD]?.stringValue) };
}
export const fetchEdits = async () => (await fetchChanges()).edits;

export let edits = readCache(CACHE);
export let images = readCache(IMAGE_CACHE);
apply(edits);
applyImages(images);

// Used by the editor after it saves: show the new set of changes and keep it for the next visit.
export function setEdits(next) {
  edits = next;
  apply(edits);
  remember(CACHE, edits);
}
export function setImages(next) {
  images = next;
  applyImages(images);
  remember(IMAGE_CACHE, images);
}

export const ready = fetchChanges()
  .then((now) => { setEdits(now.edits); setImages(now.images); })
  .catch((err) => console.warn('[content] changes not loaded:', err.message));

/* ---------- the editor, for a signed-in browser only ---------- */

let signedIn = false;
let framed = true;   // inside another page's frame the editor stays off: the page around it could disguise what is clicked
try { signedIn = !!localStorage.getItem(SESSION); } catch { /* private window */ }
try { framed = window.top !== window.self; } catch { /* a frame on another site */ }
if (signedIn && !framed && !document.querySelector('[data-admin-app]')) {
  ready.then(() => import('./admin/bar.js')).catch((err) => console.warn('[content] editor not loaded:', err.message));
}
