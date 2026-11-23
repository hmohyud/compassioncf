// The editor bar a signed-in editor sees at the bottom of every page, and "Edit this page":
// click any text and change it, click any photo to put another in its place or show it in
// grayscale, save. Loaded by shared/content.js only when this browser has signed in.

import {
  entries, sanitize, normalize, fetchChanges, setEdits, edits, TEXT_DOC, TEXT_FIELD,
  imageEntries as photosOnThePage, images, setImages, applyImages, isStored, hasPhoto, isGray, paint, keepPhoto, IMAGE_FIELD,
} from '../content.js';
import * as session from './session.js';
import { ORIGINALS } from './originals.js';
import { preparePhoto } from './photo.js';
import { lang } from '../i18n.js';

// The photos an editor may change (see PHOTO_SWAPS in session.js).
const imageEntries = session.PHOTO_SWAPS ? photosOnThePage : [];

const ADMIN = new URL('../../admin/', import.meta.url).href;
const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./admin.css', import.meta.url).href });
document.head.append(css);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const bar = document.createElement('div');
bar.className = 'edbar';
bar.setAttribute('role', 'region');
bar.setAttribute('aria-label', 'Site editor');
document.body.append(bar);

// "Use the original wording", shown beside the text being edited when it differs from the line's first
// wording. On a line that has been put back to its first wording it offers the newer one again.
const pop = document.createElement('button');
pop.type = 'button';
pop.className = 'ed-pop';
pop.textContent = 'Use the original wording';
pop.hidden = true;
document.body.append(pop);

// The small panel that opens on a photo: put another in its place, show it in grayscale (a switch that is
// off unless turned on), describe a photo that was put in place, or go back to the page's own.
const photo = document.createElement('div');
photo.className = 'ed-photo';
photo.hidden = true;
photo.innerHTML = `
  <div class="ed-photo-gray">
    <span id="ed-photo-gray-h">Grayscale <small>black and white</small></span>
    <button type="button" class="ed-switch" role="switch" aria-checked="false" aria-labelledby="ed-photo-gray-h" data-photo="gray"><span></span></button>
  </div>
  <div class="ed-photo-desc" data-photo-desc>
    <label for="ed-photo-alt">Describe this photo <small>read aloud to people who can’t see it</small></label>
    <input id="ed-photo-alt" type="text" maxlength="180" autocomplete="off" data-photo="alt">
  </div>
  <div class="ed-photo-acts">
    <button type="button" data-photo="pick">Choose a photo</button>
    <button type="button" data-photo="orig">Use the original photo</button>
    <button type="button" class="ed-photo-done" data-photo="done">Done</button>
  </div>`;
document.body.append(photo);

const chooser = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
chooser.setAttribute('data-ed-file', '');
document.body.append(chooser);

let editing = false;
let round = 0;        // counts editing sessions, so a photo that takes a while to prepare can't land in a later one
let busy = false;
let note = '';        // one line of feedback shown in the bar
let noteKind = '';
let focused = null;   // the text entry being typed in

/* ---------- what has changed ---------- */

const clean = (html) => normalize(sanitize(html));
const shown = (entry) => (typeof edits[entry.key] === 'string' ? sanitize(edits[entry.key]) : entry.original);   // what visitors see now
const isChanged = (entry) => clean(entry.el.innerHTML) !== clean(shown(entry));
const isBuiltIn = (entry) => clean(entry.el.innerHTML) === clean(entry.original);   // reads as the page itself is written: nothing needs saving for it
// A line's first wording. For most lines that is how the page itself is written. For the lines the foundation
// reworded before that wording was written into the pages, it is the earlier wording kept in originals.js.
const hasEarlier = (entry) => typeof ORIGINALS[entry.key] === 'string';
const first = (entry) => (hasEarlier(entry) ? sanitize(ORIGINALS[entry.key]) : entry.original);
const isOriginal = (entry) => clean(entry.el.innerHTML) === clean(first(entry));
const changes = () => entries.filter(isChanged);

// What the editor has chosen for a photo while editing, by which photo it is:
//   { blob, preview, width, height, alt, gray }   a new photo, prepared and waiting for Save
//   { id, v, alt, gray }                            the stored photo already in its place, perhaps redescribed or switched to grayscale
//   { gray: true }                                  the page's own photo, shown in grayscale
//   null                                            back to the page's own photo, as it is
const picked = new Map();
const preparing = new Set();  // photos whose new file is being read and shrunk
const tags = new Map();       // each photo on the page -> its "Change photo" label, while editing
let photoOf = null;           // the photo whose panel is open
let choosingFor = null;

const replaced = (swap) => !!swap && (!!swap.blob || hasPhoto(swap));   // another photo stands in the original's place
const plain = (swap) => !replaced(swap) && !isGray(swap);                // the page's own photo, as it is
const savedSwap = (key) => (isStored(images[key]) ? images[key] : null);            // what visitors see now
const currentSwap = (key) => (picked.has(key) ? picked.get(key) : savedSwap(key));  // what the editor sees now
const sameSwap = (a, b) => (plain(a) || plain(b) ? plain(a) && plain(b)
  : !a.blob && !b.blob && (a.id || '') === (b.id || '') && String(a.v ?? '') === String(b.v ?? '') && isGray(a) === isGray(b)
    && (!replaced(a) || (a.alt || '').trim() === (b.alt || '').trim()));
const photoChanges = () => [...picked.keys()].filter((key) => !sameSwap(picked.get(key), savedSwap(key)));

function paintPhotos() {
  const changed = new Set(editing ? photoChanges() : []);
  for (const entry of imageEntries) {
    const swap = currentSwap(entry.key);
    paint(entry, plain(swap) ? null : swap, (swap && swap.preview) || '');
    entry.el.classList.toggle('ed-changed', changed.has(entry.key));
    entry.el.classList.toggle('ed-busy', preparing.has(entry.key));
    const tag = tags.get(entry);
    if (tag) {
      tag.textContent = preparing.has(entry.key) ? 'Preparing…' : changed.has(entry.key) ? 'Photo changed' : 'Change photo';
      tag.classList.toggle('changed', changed.has(entry.key));
    }
  }
}

// The labels sit on the page (not the window), at each photo's top left corner.
function placeTags() {
  for (const [entry, tag] of tags) {
    const r = entry.el.getBoundingClientRect();
    tag.hidden = r.width < 40 || r.height < 40;
    tag.style.top = `${r.top + scrollY + Math.min(12, r.height / 8)}px`;
    tag.style.left = `${r.left + scrollX + Math.min(12, r.width / 8)}px`;
  }
}

function forgetPicked() {
  const previews = [...picked.values()].map((p) => p && p.preview).filter(Boolean);
  picked.clear();
  setTimeout(() => previews.forEach((url) => URL.revokeObjectURL(url)), 30000);   // after the page has stopped showing them
}

/* ---------- the bar ---------- */

function pageLinks() {
  const post = new URLSearchParams(location.search).get('id');
  if (document.querySelector('[data-cms="blog-post"]') && post) return `<a href="${ADMIN}#essays/${encodeURIComponent(post)}">Edit this essay</a>`;
  // The pages that list essays or events: the Essays page, and News and Updates, which lists both.
  const events = document.querySelector('[data-cms="events"]');
  const essays = document.querySelector('[data-cms="blog-list"][data-href^="post.html"]') || (events && document.querySelector('[data-cms="blog-list"]'));
  // The pages that show a list kept in the editor: the Scholarship Fund page (testimonials) and the Board page (staff).
  const said = document.querySelector('[data-cms="testimonials"]');
  const staff = document.querySelector('[data-cms="staff"]');
  return (essays ? `<a href="${ADMIN}#essays/new">New essay</a>` : '') + (events ? `<a href="${ADMIN}#events/new">Add an event</a>` : '')
    + (said ? `<a href="${ADMIN}#testimonials">Edit testimonials</a>` : '') + (staff ? `<a href="${ADMIN}#staff">Edit staff</a>` : '');
}

function render() {
  const who = session.current();
  if (!who) { bar.remove(); pop.remove(); photo.remove(); return; }
  const n = editing ? changes().length + photoChanges().length : 0;
  const hint = imageEntries.length ? 'Click any text or photo on the page to change it.' : 'Click any text on the page to change it.';
  const status = note ? `<b class="${noteKind}">${esc(note)}</b>` : preparing.size ? 'Preparing the photo…' : n ? `${n} change${n === 1 ? '' : 's'} not saved yet` : hint;
  bar.classList.toggle('editing', editing);
  bar.innerHTML = editing
    ? `<span class="edbar-msg">${status}</span>
       <button type="button" class="edbar-main" data-ed="save" ${!n || busy || preparing.size ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save'}</button>
       <button type="button" data-ed="cancel" ${busy ? 'disabled' : ''}>Cancel</button>
       ${hasBox() ? `<button type="button" data-ed="box" aria-pressed="${boxOpen()}">${boxOpen() ? 'Close the donation box' : 'Donation box'}</button>` : ''}`
    : `<span class="edbar-msg">${note ? `<b class="${noteKind}">${esc(note)}</b>` : `Editor: <b>${esc(who.email)}</b>`}</span>
       <button type="button" class="edbar-main" data-ed="edit">Edit this page</button>
       ${pageLinks()}
       <a href="${ADMIN}#essays">Essays</a>
       <a href="${ADMIN}#events">Events</a>
       <button type="button" data-ed="out">Sign out</button>`;
  document.documentElement.style.setProperty('--ed-bar', `${Math.round(bar.offsetHeight)}px`);   // the donation box, opened for editing, stays clear of the bar
}

/* ---------- the donation box ---------- */

// The donation box is built by its own script (shared/donate.js) and opens as a window over the page, which
// puts everything else, this bar included, out of reach. Asked from here it opens above the page instead, with
// the bar still usable under it, and its wording is part of the text that can be clicked and changed.
const hasBox = () => !!document.querySelector('[data-donate]');
const boxOpen = () => !!document.querySelector('dialog.dn.dn-edit[open]');
function showBox(open) {
  if (open !== boxOpen()) document.dispatchEvent(new CustomEvent('ccf:donation-box', { detail: { open } }));
  document.documentElement.classList.toggle('ed-box', boxOpen());
  render();
}
// The box's wording joins the page's text when the box is first built, which may be after editing has begun.
document.addEventListener('ccf:text-added', (e) => {
  if (!editing) return;
  for (const entry of e.detail.entries) {
    entry.el.setAttribute('contenteditable', 'true');
    entry.el.setAttribute('spellcheck', 'true');
  }
});

function say(text, kind = '') {
  note = text;
  noteKind = kind;
  render();
}

/* ---------- editing ---------- */

function start() {
  editing = true;
  round += 1;
  note = '';
  document.documentElement.classList.add('ed-on');
  for (const entry of entries) {
    entry.el.setAttribute('contenteditable', 'true');
    entry.el.setAttribute('spellcheck', 'true');
  }
  for (const entry of imageEntries) {
    entry.el.classList.add('ed-img');
    entry.el.setAttribute('title', 'Change this photo');
    const tag = Object.assign(document.createElement('button'), { type: 'button', className: 'ed-photo-tag', textContent: 'Change photo' });
    tags.set(entry, tag);
    document.body.append(tag);
  }
  placeTags();
  setTimeout(placeTags, 900);   // again once the page's reveal animations have settled
  render();
}

// The site's wording is written in English, so that is the language it is edited in. Asked for on a page being
// read in another language, editing opens the same page in English and starts there.
const EDIT_NEXT = 'ccf-edit-next';
function startInEnglish() {
  if (lang === 'en') return start();
  try { sessionStorage.setItem(EDIT_NEXT, '1'); } catch { /* private window: the page still opens in English */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', 'en');
  location.assign(url);
}

function stop() {
  editing = false;
  focused = null;
  pop.hidden = true;
  closePhoto();
  if (boxOpen()) document.dispatchEvent(new CustomEvent('ccf:donation-box', { detail: { open: false } }));
  document.documentElement.classList.remove('ed-box');
  document.documentElement.classList.remove('ed-on');
  for (const entry of entries) {
    entry.el.removeAttribute('contenteditable');
    entry.el.removeAttribute('spellcheck');
    entry.el.classList.remove('ed-changed');
  }
  for (const entry of imageEntries) {
    entry.el.classList.remove('ed-img', 'ed-changed', 'ed-busy');
    entry.el.removeAttribute('title');
  }
  for (const tag of tags.values()) tag.remove();
  tags.clear();
}

function cancel() {
  for (const entry of entries) if (isChanged(entry)) entry.el.innerHTML = shown(entry);
  stop();
  preparing.clear();
  forgetPicked();
  applyImages(images);   // back to what visitors see
  note = '';
  render();
}

function mark() {
  for (const entry of entries) entry.el.classList.toggle('ed-changed', isChanged(entry));
  paintPhotos();
  if (note && noteKind !== 'bad') note = '';
  render();
  placePop();
  placeTags();
  placePhoto();
}

function placePop() {
  // Nothing to offer on a line that reads as it first did, unless the page carries a newer wording to go forward to.
  const back = !!focused && !isOriginal(focused);
  const forward = !!focused && !back && hasEarlier(focused) && !isBuiltIn(focused);
  if (!editing || !(back || forward)) { pop.hidden = true; return; }
  pop.textContent = back ? 'Use the original wording' : 'Use the newer wording';
  pop.dataset.to = back ? 'original' : 'newer';
  const r = focused.el.getBoundingClientRect();
  pop.hidden = false;
  // above the text's top right corner, where it is least likely to cover the line before
  pop.style.top = `${Math.max(8, r.top + scrollY - 36)}px`;
  pop.style.left = `${Math.max(8, r.right + scrollX - pop.offsetWidth)}px`;
}

async function save() {
  if (busy || preparing.size) return;
  busy = true;
  note = '';
  render();
  try {
    const now = await fetchChanges();   // start from what is in the database now, in case someone else saved meanwhile
    const fields = {};
    const nextEdits = { ...now.edits };
    const textChanges = changes();
    for (const entry of textChanges) {
      if (isBuiltIn(entry)) delete nextEdits[entry.key];   // back to how the page is written: no saved change is needed
      else nextEdits[entry.key] = sanitize(entry.el.innerHTML);
    }
    if (textChanges.length) fields[TEXT_FIELD] = JSON.stringify(nextEdits);

    // Photos. A new photo is stored first, under a name of its own, and only then named in the record
    // visitors' pages read, so that record never names a photo that isn't there.
    const nextImages = { ...now.images };
    const swapped = photoChanges();
    const stored = [];   // new photos, to keep in this browser once everything is saved
    for (const key of swapped) {
      const choice = picked.get(key);
      if (plain(choice)) { delete nextImages[key]; continue; }
      let named = hasPhoto(choice) ? { id: choice.id, v: String(choice.v ?? '') } : null;
      if (choice.blob) {
        named = { id: session.newPhotoId(), v: Date.now().toString(36) };
        await session.savePhoto(named.id, choice.blob, { key, width: choice.width, height: choice.height });
        stored.push([named, choice.blob]);
      }
      const alt = (choice.alt || '').trim();
      nextImages[key] = { ...(named || {}), ...(named && alt ? { alt } : {}), ...(isGray(choice) ? { gray: true } : {}) };
    }
    if (swapped.length) fields[IMAGE_FIELD] = JSON.stringify(nextImages);

    if (Object.keys(fields).length) await session.setFields(TEXT_DOC, fields);
    for (const [named, blob] of stored) await keepPhoto(named, blob);
    // Stored photos that no saved change names any more are removed, once the record no longer points at them.
    const still = new Set(Object.values(nextImages).filter(hasPhoto).map((swap) => swap.id));
    for (const swap of Object.values(now.images)) {
      if (hasPhoto(swap) && !still.has(swap.id)) session.removePhoto(swap.id).catch((err) => console.warn('[editor] an unused photo was not removed:', err.detail || err.message));
    }
    stop();
    setEdits(nextEdits);
    setImages(nextImages);
    forgetPicked();
    busy = false;
    say(swapped.length ? 'Saved. Visitors see the changes straight away.' : 'Saved. Visitors see the new text straight away.', 'good');
  } catch (err) {
    busy = false;
    console.warn('[editor] changes not saved:', err.detail || err.message);
    say(err.kind ? `Not saved. ${err.message}` : 'Not saved. The current page couldn’t be read from the database; try again in a moment.', 'bad');
  }
}

/* ---------- photos ---------- */

// The shape of the photo in a place (width over height): that of the file the page was built with.
const shapeOf = (entry) => new Promise((resolve) => {
  if (entry.shape) { resolve(entry.shape); return; }
  const probe = new Image();
  probe.onload = () => {
    entry.shape = probe.naturalWidth && probe.naturalHeight ? probe.naturalWidth / probe.naturalHeight : 0;
    resolve(entry.shape);
  };
  probe.onerror = () => resolve(0);
  probe.src = new URL(entry.src, document.baseURI).href;
});

// Every new photo is redrawn before it is kept (photo.js): cut to the shape of the photo it replaces, so
// nothing around it moves, and placed the way the page places a photo that is too wide or too tall for its
// frame (a portrait keeps its top).
function prepare(file, entry) {
  const place = getComputedStyle(entry.el).objectPosition.split(' ').map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : 0.5));
  return preparePhoto(file, {
    shape: () => shapeOf(entry),
    ax: Number.isFinite(place[0]) ? place[0] : 0.5,
    ay: Number.isFinite(place[1]) ? place[1] : 0.5,
    shown: entry.el.getBoundingClientRect().width || 0,
  });
}

function choose(entry) {
  choosingFor = entry;
  chooser.value = '';
  chooser.click();
}

chooser.addEventListener('change', async () => {
  const entry = choosingFor;
  const file = chooser.files && chooser.files[0];
  if (!entry || !file || !editing) return;
  const mine = round;
  preparing.add(entry.key);
  note = '';
  mark();
  try {
    const made = await prepare(file, entry);
    if (!editing || round !== mine) return;   // cancelled while the photo was being prepared
    const before = currentSwap(entry.key);
    if (before && before.preview) setTimeout(() => URL.revokeObjectURL(before.preview), 30000);
    preparing.delete(entry.key);
    // A new photo starts as it is: grayscale is something to switch on, never carried over.
    picked.set(entry.key, { ...made, preview: URL.createObjectURL(made.blob), alt: (replaced(before) && before.alt) || entry.alt, gray: false });
    mark();
    openPhoto(entry, true);
  } catch (err) {
    console.warn('[editor] photo not prepared:', err.message);
    if (!editing || round !== mine) return;
    preparing.delete(entry.key);
    mark();
    say(`The photo wasn’t changed. ${err.message}`, 'bad');
  }
});

// Sets the panel's switches and buttons to match the photo it is open on.
function syncPhoto() {
  if (!photoOf) return;
  const swap = currentSwap(photoOf.key);
  photo.querySelector('[data-photo="gray"]').setAttribute('aria-checked', String(isGray(swap)));
  // A description goes with a photo put in the original's place, and only where the original has one.
  photo.querySelector('[data-photo-desc]').hidden = !(replaced(swap) && photoOf.alt);
  photo.querySelector('[data-photo="pick"]').textContent = replaced(swap) ? 'Choose another photo' : 'Choose a photo';
  photo.querySelector('[data-photo="orig"]').hidden = !replaced(swap);   // grayscale alone is undone with its own switch
}

function openPhoto(entry, focus = false) {
  photoOf = entry;
  const swap = currentSwap(entry.key);
  const input = photo.querySelector('[data-photo="alt"]');
  input.value = (replaced(swap) && swap.alt) || entry.alt;
  syncPhoto();
  photo.hidden = false;
  placePhoto();
  if (focus && !photo.querySelector('[data-photo-desc]').hidden) { input.focus({ preventScroll: true }); input.select(); }
}

function closePhoto() {
  photoOf = null;
  photo.hidden = true;
}

// The panel goes where it does not cover the photo it changes, so the photo can be seen while Grayscale is
// switched: beside the photo if the window has room, else under it. Only a photo too large for either
// gets the panel over one of its lower corners.
function placePhoto() {
  if (!editing || !photoOf) { photo.hidden = true; return; }
  const r = photoOf.el.getBoundingClientRect();
  const w = photo.offsetWidth;
  const h = photo.offsetHeight;
  const wide = document.documentElement.clientWidth;
  const tall = window.innerHeight;
  const gap = 12;
  const edge = 8;
  const below = 72;      // the site's header
  const above = 84;      // the editor's bar at the bottom of the window
  const beside = Math.min(Math.max(r.top, below), Math.max(below, tall - above - h));
  let left;
  let top;
  if (r.right + gap + w <= wide - edge) { left = r.right + gap; top = beside; }
  else if (r.left - gap - w >= edge) { left = r.left - gap - w; top = beside; }
  else if (r.bottom + gap + h <= tall - above || r.height < tall / 2) { left = Math.min(Math.max(r.left, edge), wide - w - edge); top = r.bottom + gap; }
  else { left = Math.min(Math.max(r.left + gap, edge), wide - w - edge); top = Math.max(below, Math.min(r.bottom, tall - above) - h - gap); }
  photo.style.top = `${top + scrollY}px`;
  photo.style.left = `${Math.max(edge, left) + scrollX}px`;
}

function onPhoto(entry) {
  if (!entry || preparing.has(entry.key)) return;
  openPhoto(entry);
}

photo.addEventListener('click', (e) => {
  if (!photoOf) return;
  const action = e.target.closest('[data-photo]')?.dataset.photo;
  if (action === 'gray') {
    const swap = currentSwap(photoOf.key);
    picked.set(photoOf.key, { ...(swap || {}), gray: !isGray(swap) });
    mark();
    syncPhoto();
    return;
  }
  if (action === 'pick') choose(photoOf);
  if (action === 'orig') { picked.set(photoOf.key, null); closePhoto(); mark(); }
  if (action === 'done') closePhoto();
});
photo.addEventListener('input', (e) => {
  if (!photoOf || e.target.dataset.photo !== 'alt') return;
  const swap = currentSwap(photoOf.key);
  if (!replaced(swap)) return;
  picked.set(photoOf.key, { ...swap, alt: e.target.value });
  mark();
});
photo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closePhoto(); } });

/* ---------- wiring ---------- */

bar.addEventListener('click', (e) => {
  const action = e.target.closest('[data-ed]')?.dataset.ed;
  if (action === 'edit') startInEnglish();
  if (action === 'cancel') cancel();
  if (action === 'save') save();
  if (action === 'box' && editing) showBox(!boxOpen());
  if (action === 'out') { if (editing) cancel(); session.signOut(); }
});

pop.addEventListener('mousedown', (e) => e.preventDefault());   // keep the cursor in the text
pop.addEventListener('click', () => {
  if (!focused) return;
  focused.el.innerHTML = pop.dataset.to === 'newer' ? focused.original : first(focused);
  mark();
});

const entryOf = (node) => {
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const host = el?.closest('[contenteditable="true"]');
  return host ? entries.find((entry) => entry.el === host) : null;
};
// The photo a click landed on: the picture itself, or its "Change photo" label.
const photoAt = (node) => {
  if (node?.nodeType !== Node.ELEMENT_NODE) return null;
  const img = node.closest('img.ed-img');
  if (img) return imageEntries.find((entry) => entry.el === img) || null;
  const tag = node.closest('.ed-photo-tag');
  return tag ? [...tags].find(([, t]) => t === tag)?.[0] || null : null;
};

document.addEventListener('input', (e) => {
  const entry = editing && entryOf(e.target);
  if (entry) { focused = entry; mark(); }
});
// Follow the text cursor, so "Use the original wording" always refers to the text being worked on.
document.addEventListener('selectionchange', () => {
  const entry = editing && entryOf(getSelection().anchorNode);
  if (entry) { focused = entry; placePop(); }
});
document.addEventListener('keydown', (e) => {
  if (!editing || !entryOf(e.target)) return;
  if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }   // a new line, never a new paragraph block
  if (e.key === 'Escape') e.target.blur();
});
document.addEventListener('paste', (e) => {
  if (!editing || !entryOf(e.target)) return;
  e.preventDefault();
  document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
});
// While editing, a photo is something to swap, and links and buttons are text to change, not things to follow.
// (A label is in the list because a click on its words would otherwise move the cursor into the field it names:
// the donation box has one.)
document.addEventListener('click', (e) => {
  if (!editing || bar.contains(e.target) || pop.contains(e.target) || photo.contains(e.target) || e.target === chooser) return;
  const picture = photoAt(e.target);
  if (picture) { e.preventDefault(); e.stopPropagation(); onPhoto(picture); return; }
  if (photoOf) closePhoto();
  if (e.target.closest('a, button, label, [data-donate], summary')) { e.preventDefault(); e.stopPropagation(); }
}, true);
window.addEventListener('beforeunload', (e) => { if (editing && (changes().length || photoChanges().length || preparing.size)) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('scroll', () => { placePop(); placePhoto(); }, { passive: true });
window.addEventListener('resize', () => { placePop(); placeTags(); placePhoto(); });
document.addEventListener('load', (e) => { if (editing && e.target.tagName === 'IMG') placeTags(); }, true);   // a photo arriving can move the ones below it

session.onChange(() => { if (!session.current() && editing) cancel(); render(); });

render();
try {
  if (sessionStorage.getItem(EDIT_NEXT)) { sessionStorage.removeItem(EDIT_NEXT); if (lang === 'en') start(); }   // asked for on this page in another language
} catch { /* private window */ }
session.mayEdit().then((ok) => {
  if (ok || !session.current()) return;
  bar.innerHTML = `<span class="edbar-msg"><b class="bad">${esc(session.current().email)} is signed in but isn’t on the list of editors.</b></span><button type="button" data-ed="out">Sign out</button>`;
}).catch((err) => console.warn('[editor] could not check the account:', err.detail || err.message));
