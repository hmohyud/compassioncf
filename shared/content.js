// Text edits made in the site's editor, applied on top of the text built into each page.
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
// The editor's own code (shared/admin/) is loaded only in a browser that has signed in.

const DB = 'https://firestore.googleapis.com/v1/projects/compassioncf-web-site/databases/(default)/documents';
export const TEXT_DOC = 'content/home';   // an existing document: public to read, writable by admin accounts
export const TEXT_FIELD = 'siteText';     // one string field holding the JSON object
const CACHE = 'ccf-text';                 // last known edits, so returning visitors don't see the old text first
const SESSION = 'ccf-admin';

/* ---------- which text can be edited ---------- */

// Left alone: navigation, forms, anything a script fills in, decorative or generated bits.
const SKIP = [
  'script', 'style', 'noscript', 'svg', 'nav', 'form', 'dialog', '.brand', '.skip', '.cms-note',
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

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)) || {}; } catch { return {}; } };
export function remember(edits) { try { localStorage.setItem(CACHE, JSON.stringify(edits)); } catch { /* private window */ } }

// The edits as they are in the database right now. Throws if they can't be read.
export async function fetchEdits() {
  const res = await fetch(`${DB}/${TEXT_DOC}?mask.fieldPaths=${TEXT_FIELD}`);
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await res.json();
  const raw = doc.fields?.[TEXT_FIELD]?.stringValue;
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export let edits = readCache();
apply(edits);

// Used by the editor after it saves: show the new set of edits and keep it for the next visit.
export function setEdits(next) {
  edits = next;
  apply(edits);
  remember(edits);
}

export const ready = fetchEdits()
  .then(setEdits)
  .catch((err) => console.warn('[content] edits not loaded:', err.message));

/* ---------- the editor, for a signed-in browser only ---------- */

let signedIn = false;
try { signedIn = !!localStorage.getItem(SESSION); } catch { /* private window */ }
if (signedIn && !document.querySelector('[data-admin-app]')) {
  ready.then(() => import('./admin/bar.js')).catch((err) => console.warn('[content] editor not loaded:', err.message));
}
