// Changes made in the site's editor, applied on top of the text and photos built into each page.
//
// An editor signed in at /admin/ can click any text on the site and change it. Those edits are kept in
// the site's database as one small JSON object, { "<key>": "<html>" }, and applied here for every
// visitor. A key is a hash of the sentence as it is written in the page's own HTML, so:
//   - an edit follows that sentence wherever it appears (the footer line is edited once for all pages);
//   - if the sentence itself is later changed in the code, the edit no longer matches and is dropped.
// Keys also carry a generation number (see keyFor): edits from an earlier generation are ignored.
//
// Only simple inline markup survives (emphasis, links, line breaks). Everything else is stripped, when an
// edit is saved and again here before it is shown, so the stored text can never inject anything else.
//
// Photos work the same way: { "<which photo>": { "id": "<stored photo>", "v": "<its version>", "alt": "<description>",
// "gray": true } }. A photo is known by where its file lives, so one photo used on several pages is changed on
// all of them. An editor can put another photo in its place (id), show it in grayscale (gray), or both. A photo
// put in place is kept in the site's own database and is only ever read from there: a saved change names it,
// and never carries an address.
//
// The editor's own code (shared/admin/) is loaded only in a browser that has signed in.

const DB = 'https://firestore.googleapis.com/v1/projects/compassioncf-editor/databases/(default)/documents';   // the site's own database
export const TEXT_DOC = 'content/home';   // one document: anyone may read it, only editors may write it
export const TEXT_FIELD = 'siteText';     // one string field holding the JSON object of text edits
export const IMAGE_FIELD = 'siteImages';  // another, holding the JSON object of changed photos
export const DATES_FIELD = 'siteDatesOff'; // a third: a JSON list naming the dates written into a page that an editor has moved into the Events list
const CACHE = 'ccf-text';                 // last known changes, so returning visitors don't see the old page first
const IMAGE_CACHE = 'ccf-images';
const DATES_CACHE = 'ccf-dates';
const SESSION = 'ccf-editor';             // set by shared/admin/session.js while someone is signed in
const ROOT = new URL('../', import.meta.url);   // the site's own root, wherever it is being served from

/* ---------- which text can be edited ---------- */

// Left alone: navigation, forms, anything a script fills in, decorative or generated bits.
// That includes the globe (.g-wrap), whose place label keeps changing by itself, and any other
// status line a script writes to: text that changes on its own would look like an edit.
const SKIP = [
  'script', 'style', 'noscript', 'svg', 'nav', 'form', 'dialog', '.brand', '.skip', '.cms-note',
  '.g-wrap', '[role="status"]', '[role="alert"]', '[aria-live]',
  '[aria-hidden="true"]', '[data-count]', '[data-year]', '[data-no-edit]', '[data-admin-app]',
  '[data-posts]', '[data-events-note]',   // an event from the database carries data-no-edit; the dates written into a page can be edited
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
// A saved change is kept under "<generation>:<hash of the sentence>". When wording saved in the editor is
// written into the pages themselves, as it was on 16 November 2026 (generation 2) and 20 November 2026
// (generation 3), raise the generation: the changes saved before then are part of the pages now, so they are
// no longer laid over them (and a line that was blanked then cannot blank a new line that happens to read the
// same). They stay in the database, unused.
const TEXT_GENERATION = '3';
export const keyFor = (html) => `${TEXT_GENERATION}:${fnv(html, 2166136261)}${fnv(html, 0x9e3779b9)}`;
export const isCurrent = (key) => String(key).startsWith(`${TEXT_GENERATION}:`);

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
const IMAGE_SKIP = 'nav, form, dialog, .brand, .g-wrap, [data-admin-app], [data-no-edit], [data-posts], [data-post-body], [data-events-list]';

// Which photo this is: its path inside this site ("shared/img/hands.jpg"), or the full address of a file kept elsewhere.
export function imageKey(src) {
  const url = new URL(src, document.baseURI);
  url.hash = '';
  return url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname) ? url.pathname.slice(ROOT.pathname.length) : url.href;
}

// Every photo on this page that can be changed, with the file and description it has in the page's own HTML.
export const imageEntries = [...document.querySelectorAll('main img[src]')]
  .filter((el) => !el.closest(IMAGE_SKIP))
  .map((el) => ({ el, key: imageKey(el.getAttribute('src')), src: el.getAttribute('src'), alt: el.getAttribute('alt') || '', edited: false, want: '' }));

// A photo put in place of one of the site's own is a document named "photo-…" in the site's database, beside the
// page-text record. A saved change can only name such a document; it is never an address, so nothing from
// anywhere else can be shown.
const PHOTO_ID = /^photo-[a-z0-9]{10,40}$/;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const hasPhoto = (swap) => !!swap && typeof swap === 'object' && typeof swap.id === 'string' && PHOTO_ID.test(swap.id);
export const isGray = (swap) => !!swap && typeof swap === 'object' && swap.gray === true;
// A saved change counts if it names a stored photo, asks for grayscale, or both; anything else in the database is ignored.
export const isStored = (swap) => hasPhoto(swap) || isGray(swap);

// A photo with no description in the page is decoration there (its caption is beside it), and stays that way.
// A description saved with a change is used only when another photo stands in the original's place.
export const describe = (entry, swap, replaced = hasPhoto(swap)) => (entry.alt && replaced && swap && typeof swap.alt === 'string' && swap.alt.trim() ? swap.alt.trim() : entry.alt);

export function show(entry, src, alt) {
  if (entry.el.getAttribute('src') !== src) entry.el.setAttribute('src', src);
  if ((entry.el.getAttribute('alt') || '') !== alt) entry.el.setAttribute('alt', alt);
}

// Grayscale is laid over the picture as it is drawn: the file is not altered, so switching it off again
// shows the photo as it is. Anything the page's own style does to the picture stays in place.
export function setGray(el, on) {
  if ((el.dataset.gray === '1') === on) return;
  el.style.filter = '';
  delete el.dataset.gray;
  if (!on) return;
  const own = getComputedStyle(el).filter;
  if (!/grayscale/.test(own)) el.style.filter = `${own && own !== 'none' ? `${own} ` : ''}grayscale(1)`;
  el.dataset.gray = '1';
}

// A stored photo is fetched from the database once and then kept by the browser under its name and version,
// so it is read again only when an editor has changed it.
const photoUrls = new Map();   // "<photo>@<version>" -> a promise of an address this page can show
export const photoName = (swap) => `${swap.id}@${String(swap.v ?? '').replace(/[^\w-]/g, '').slice(0, 24)}`;
const keptAs = (name) => new URL(`shared/kept-photo/${name}`, ROOT).href;   // never requested: only the name the browser keeps it under
const photoShelf = async () => { try { return await caches.open('ccf-photos'); } catch { return null; } };   // not offered in every browser mode

async function loadPhoto(swap) {
  const name = photoName(swap);
  const shelf = await photoShelf();
  let kept = null;
  try { kept = shelf && await shelf.match(keptAs(name)); } catch { /* read it from the database instead */ }
  if (kept) return URL.createObjectURL(await kept.blob());
  const res = await fetch(`${DB}/content/${swap.id}?mask.fieldPaths=data&mask.fieldPaths=type`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await res.json();
  const type = doc.fields?.type?.stringValue;
  const data = doc.fields?.data?.bytesValue;
  if (!PHOTO_TYPES.includes(type) || typeof data !== 'string' || !data) throw new Error('not a photo');
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const blob = new Blob([bytes], { type });
  try { if (shelf) await shelf.put(keptAs(name), new Response(blob, { headers: { 'Content-Type': type } })); } catch { /* shown all the same */ }
  return URL.createObjectURL(blob);
}

export function photoUrl(swap) {
  const name = photoName(swap);
  if (!photoUrls.has(name)) photoUrls.set(name, loadPhoto(swap).catch((err) => { photoUrls.delete(name); throw err; }));
  return photoUrls.get(name);
}

// Used by the editor right after it has stored a photo: this browser has it already.
export async function keepPhoto(swap, blob) {
  const name = photoName(swap);
  photoUrls.set(name, Promise.resolve(URL.createObjectURL(blob)));
  const shelf = await photoShelf();
  try { if (shelf) await shelf.put(keptAs(name), new Response(blob, { headers: { 'Content-Type': blob.type } })); } catch { /* it will be fetched when needed */ }
}

// Forgets the photos this browser keeps that no saved change names any more.
async function tidyPhotos(swaps) {
  const shelf = await photoShelf();
  if (!shelf) return;
  const named = new Set(Object.values(swaps).filter(hasPhoto).map((swap) => keptAs(photoName(swap))));
  try { for (const req of await shelf.keys()) if (!named.has(req.url)) await shelf.delete(req); } catch { /* nothing depends on it */ }
}

// Shows one photo as a saved change (or the editor's choice, with its preview) says: which picture, in
// grayscale or not, and its description. `swap` is null for a photo left as the page was built.
export function paint(entry, swap, preview = '') {
  const stored = !preview && hasPhoto(swap);
  const want = preview || (stored ? photoName(swap) : '');
  entry.want = want;   // so a photo that arrives late can't replace a newer choice
  entry.edited = !!preview || isStored(swap);
  setGray(entry.el, isGray(swap));
  if (!stored) { show(entry, preview || entry.src, describe(entry, swap, !!preview)); return; }
  photoUrl(swap)
    .then((url) => { if (entry.want === want) show(entry, url, describe(entry, swap)); })
    .catch((err) => {
      console.warn('[content] photo not loaded:', err.message);
      if (entry.want === want) show(entry, entry.src, entry.alt);
    });
}

export function applyImages(swaps = {}) {
  for (const entry of imageEntries) paint(entry, isStored(swaps[entry.key]) ? swaps[entry.key] : null);
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

const parseList = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : [];
  } catch {
    return [];
  }
};

// The text edits, swapped photos and moved dates as they are in the database right now. Throws if they can't be read.
export async function fetchChanges() {
  const res = await fetch(`${DB}/${TEXT_DOC}?mask.fieldPaths=${TEXT_FIELD}&mask.fieldPaths=${IMAGE_FIELD}&mask.fieldPaths=${DATES_FIELD}`);
  if (res.status === 404) return { edits: {}, images: {}, datesOff: [] };   // nothing has been saved yet
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await res.json();
  return { edits: parseMap(doc.fields?.[TEXT_FIELD]?.stringValue), images: parseMap(doc.fields?.[IMAGE_FIELD]?.stringValue), datesOff: parseList(doc.fields?.[DATES_FIELD]?.stringValue) };
}
export const fetchEdits = async () => (await fetchChanges()).edits;

export let edits = readCache(CACHE);
export let images = readCache(IMAGE_CACHE);
// The names of the dates written into a page that are events in the database now (see shared/cms.js, which hides those copies).
export let datesOff = parseList(JSON.stringify(readCache(DATES_CACHE).names || []));
apply(edits);
applyImages(images);

/* ---------- wording a script puts on the page ---------- */

// The donation box (shared/donate.js) is built by its own script, outside <main>, so its words are not in the
// list of this page's text. A script marks each piece of wording that may be changed with
// data-editable="<what it is part of>" and announces it with a "ccf:editable" event. The pieces then join the
// list and behave like any other text: a saved change is laid over them, and the editor can click and change
// them. What a piece is part of goes into its key, so the donation box's "Donate" is a different line from the
// footer's "Donate": changing one never changes the other.
export function adopt(root = document) {
  const added = [];
  for (const el of root.querySelectorAll('[data-editable]')) {
    if (entries.some((entry) => entry.el === el)) continue;
    const original = el.innerHTML;
    added.push({ el, original, key: keyFor(`${el.dataset.editable}\n${normalize(original)}`), edited: false });
  }
  if (!added.length) return added;
  entries.push(...added);
  apply(edits);
  document.dispatchEvent(new CustomEvent('ccf:text-added', { detail: { entries: added } }));   // the editor, if it is open, makes them editable
  return added;
}
document.addEventListener('ccf:editable', (e) => adopt(e.target instanceof Element ? e.target : document));
adopt();

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
export function setDatesOff(next) {
  datesOff = next;
  remember(DATES_CACHE, { names: datesOff });
}

export const ready = fetchChanges()
  .then((now) => {
    const hadPhotos = Object.values(images).some(hasPhoto);
    setEdits(now.edits);
    setImages(now.images);
    setDatesOff(now.datesOff);
    if (hadPhotos || Object.values(now.images).some(hasPhoto)) tidyPhotos(now.images);
  })
  .catch((err) => console.warn('[content] changes not loaded:', err.message));

/* ---------- the editor, for a signed-in browser only ---------- */

let signedIn = false;
let framed = true;   // inside another page's frame the editor stays off: the page around it could disguise what is clicked
try { signedIn = !!localStorage.getItem(SESSION); } catch { /* private window */ }
try { framed = window.top !== window.self; } catch { /* a frame on another site */ }
if (signedIn && !framed && !document.querySelector('[data-admin-app]')) {
  ready.then(() => import('./admin/bar.js')).catch((err) => console.warn('[content] editor not loaded:', err.message));
}
