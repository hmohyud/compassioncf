// The editor bar a signed-in editor sees at the bottom of every page, and "Edit this page":
// click any text and change it, click any photo and swap it, save. Loaded by shared/content.js only
// when this browser has signed in.

import {
  entries, sanitize, normalize, fetchChanges, setEdits, edits, TEXT_DOC, TEXT_FIELD,
  imageEntries, images, setImages, applyImages, isStored, describe, show, IMAGE_FIELD,
} from '../content.js';
import * as session from './session.js';
import { ORIGINALS } from './originals.js';

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

// The small panel that opens on a photo that has been swapped: describe it, pick another, or go back.
const photo = document.createElement('div');
photo.className = 'ed-photo';
photo.hidden = true;
photo.innerHTML = `
  <label for="ed-photo-alt">Describe this photo <small>read aloud to people who can’t see it</small></label>
  <input id="ed-photo-alt" type="text" maxlength="180" autocomplete="off" data-photo="alt">
  <div class="ed-photo-acts">
    <button type="button" data-photo="pick">Choose another photo</button>
    <button type="button" data-photo="orig">Use the original photo</button>
    <button type="button" class="ed-photo-done" data-photo="done">Done</button>
  </div>`;
document.body.append(photo);

const chooser = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
chooser.setAttribute('data-ed-file', '');
document.body.append(chooser);

let editing = false;
let round = 0;        // counts editing sessions, so a late upload can't land in a later one
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

const picked = new Map();   // which photo -> { src, alt, preview } chosen while editing, or null for "back to the original"
const sending = new Map();  // which photo -> a local preview, while its file is on the way to the storage
const tags = new Map();     // each photo on the page -> its "Change photo" label, while editing
let photoOf = null;         // the photo whose panel is open
let choosingFor = null;

const savedSwap = (key) => (isStored(images[key]) ? images[key] : null);            // what visitors see now
const currentSwap = (key) => (picked.has(key) ? picked.get(key) : savedSwap(key));  // what the editor sees now
const sameSwap = (a, b) => (!a || !b ? !a && !b : a.src === b.src && (a.alt || '') === (b.alt || ''));
const photoChanges = () => [...picked.keys()].filter((key) => !sameSwap(picked.get(key), savedSwap(key)));

function paintPhotos() {
  const changed = new Set(editing ? photoChanges() : []);
  for (const entry of imageEntries) {
    const swap = currentSwap(entry.key);
    show(entry, sending.get(entry.key) || (swap ? swap.preview || swap.src : entry.src), describe(entry, swap));
    entry.el.classList.toggle('ed-changed', changed.has(entry.key));
    entry.el.classList.toggle('ed-busy', sending.has(entry.key));
    const tag = tags.get(entry);
    if (tag) {
      tag.textContent = sending.has(entry.key) ? 'Uploading…' : changed.has(entry.key) ? 'Photo changed' : 'Change photo';
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
  return (essays ? `<a href="${ADMIN}#essays/new">New essay</a>` : '') + (events ? `<a href="${ADMIN}#events/new">Add an event</a>` : '');
}

function render() {
  const who = session.current();
  if (!who) { bar.remove(); pop.remove(); photo.remove(); return; }
  const n = editing ? changes().length + photoChanges().length : 0;
  const hint = imageEntries.length ? 'Click any text or photo on the page to change it.' : 'Click any text on the page to change it.';
  const status = note ? `<b class="${noteKind}">${esc(note)}</b>` : sending.size ? 'Uploading the photo…' : n ? `${n} change${n === 1 ? '' : 's'} not saved yet` : hint;
  bar.classList.toggle('editing', editing);
  bar.innerHTML = editing
    ? `<span class="edbar-msg">${status}</span>
       <button type="button" class="edbar-main" data-ed="save" ${!n || busy || sending.size ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save'}</button>
       <button type="button" data-ed="cancel" ${busy ? 'disabled' : ''}>Cancel</button>`
    : `<span class="edbar-msg">${note ? `<b class="${noteKind}">${esc(note)}</b>` : `Editor: <b>${esc(who.email)}</b>`}</span>
       <button type="button" class="edbar-main" data-ed="edit">Edit this page</button>
       ${pageLinks()}
       <a href="${ADMIN}#essays">Essays</a>
       <a href="${ADMIN}#events">Events</a>
       <a href="${ADMIN}#inbox">Inbox</a>
       <button type="button" data-ed="out">Sign out</button>`;
}

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

function stop() {
  editing = false;
  focused = null;
  pop.hidden = true;
  closePhoto();
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
  sending.clear();
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
  if (busy || sending.size) return;
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

    const nextImages = { ...now.images };
    const swapped = photoChanges();
    for (const key of swapped) {
      const swap = picked.get(key);
      if (swap) nextImages[key] = { src: swap.src, ...(swap.alt && swap.alt.trim() ? { alt: swap.alt.trim() } : {}) };
      else delete nextImages[key];
    }
    if (swapped.length) fields[IMAGE_FIELD] = JSON.stringify(nextImages);

    if (Object.keys(fields).length) await session.setFields(TEXT_DOC, fields);
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

const MAX_SIDE = 2000;   // pixels on the longer side: plenty for a full-width photo, and a fraction of a camera file

// Every photo is redrawn as a JPEG of a sensible size before it leaves the browser. That keeps pages
// fast, and drops what cameras write into the file (where and when it was taken).
async function shrink(file) {
  if (!file.type.startsWith('image/')) throw new Error('That file isn’t a picture. Choose a JPEG or PNG photo.');
  if (file.size > 40 * 1024 * 1024) throw new Error('That photo is over 40 MB. Choose a smaller file.');
  let picture;
  try {
    picture = await createImageBitmap(file);
  } catch {
    throw new Error('That file couldn’t be read as a photo. Try a JPEG or PNG.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(picture.width, picture.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(picture.width * scale));
  canvas.height = Math.max(1, Math.round(picture.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';   // behind a picture with see-through parts
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
  if (picture.close) picture.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('That photo couldn’t be prepared. Try a different file.');
  return blob;
}

const fileSlug = (name) => name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';

// Does this address show a picture to someone who isn't signed in? Asked before a swap is accepted,
// so a photo visitors couldn't see is never saved onto a page.
const opens = (src) => new Promise((resolve) => {
  const probe = new Image();
  probe.onload = () => resolve(probe.naturalWidth > 0);
  probe.onerror = () => resolve(false);
  probe.src = src;
});

function choose(entry) {
  choosingFor = entry;
  chooser.value = '';
  chooser.click();
}

chooser.addEventListener('change', async () => {
  const entry = choosingFor;
  const file = chooser.files && chooser.files[0];
  if (!entry || !file || !editing) return;
  closePhoto();
  let blob;
  try {
    blob = await shrink(file);
  } catch (err) {
    say(err.message, 'bad');
    return;
  }
  if (!editing) return;
  const mine = round;
  const preview = URL.createObjectURL(blob);
  sending.set(entry.key, preview);
  note = '';
  mark();
  try {
    const src = await session.upload(`${session.PHOTO_FOLDER}/site-${Date.now()}-${fileSlug(file.name)}.jpg`, blob);
    if (!(await opens(src))) throw new session.Fail('other', 'It was uploaded, but its address doesn’t open for visitors.', src);
    if (!editing || round !== mine) return;   // cancelled while the file was on its way
    const before = currentSwap(entry.key);
    sending.delete(entry.key);
    picked.set(entry.key, { src, alt: (before && before.alt) || entry.alt, preview });
    mark();
    openPhoto(entry, true);
  } catch (err) {
    URL.revokeObjectURL(preview);
    console.warn('[editor] photo not uploaded:', err.detail || err.message);
    if (!editing || round !== mine) return;
    sending.delete(entry.key);
    mark();
    say(`The photo wasn’t changed. ${err.message}`, 'bad');
  }
});

function openPhoto(entry, focus = false) {
  photoOf = entry;
  const swap = currentSwap(entry.key);
  const input = photo.querySelector('[data-photo="alt"]');
  input.value = (swap && swap.alt) || entry.alt;
  photo.hidden = false;
  placePhoto();
  if (focus) { input.focus({ preventScroll: true }); input.select(); }
}

function closePhoto() {
  photoOf = null;
  photo.hidden = true;
}

function placePhoto() {
  if (!editing || !photoOf) { photo.hidden = true; return; }
  const r = photoOf.el.getBoundingClientRect();
  // inside the photo's top left corner, kept on screen and below the site header
  const top = Math.min(Math.max(r.top, 72), Math.max(r.bottom - 60, r.top)) + 12;
  const left = Math.min(Math.max(r.left + 12, 8), document.documentElement.clientWidth - photo.offsetWidth - 8);
  photo.style.top = `${top + scrollY}px`;
  photo.style.left = `${Math.max(8, left) + scrollX}px`;
}

function onPhoto(entry) {
  if (!entry || sending.has(entry.key)) return;
  if (currentSwap(entry.key)) openPhoto(entry);   // already swapped: describe it, pick another, or go back
  else choose(entry);
}

photo.addEventListener('click', (e) => {
  const action = e.target.closest('[data-photo]')?.dataset.photo;
  if (!photoOf || !action) return;
  if (action === 'pick') choose(photoOf);
  if (action === 'orig') { picked.set(photoOf.key, null); closePhoto(); mark(); }
  if (action === 'done') closePhoto();
});
photo.addEventListener('input', (e) => {
  if (!photoOf || e.target.dataset.photo !== 'alt') return;
  const swap = currentSwap(photoOf.key);
  if (!swap) return;
  picked.set(photoOf.key, { ...swap, alt: e.target.value });
  mark();
});
photo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closePhoto(); } });

/* ---------- wiring ---------- */

bar.addEventListener('click', (e) => {
  const action = e.target.closest('[data-ed]')?.dataset.ed;
  if (action === 'edit') start();
  if (action === 'cancel') cancel();
  if (action === 'save') save();
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
document.addEventListener('click', (e) => {
  if (!editing || bar.contains(e.target) || pop.contains(e.target) || photo.contains(e.target) || e.target === chooser) return;
  const picture = photoAt(e.target);
  if (picture) { e.preventDefault(); e.stopPropagation(); onPhoto(picture); return; }
  if (photoOf) closePhoto();
  if (e.target.closest('a, button, [data-donate], summary')) { e.preventDefault(); e.stopPropagation(); }
}, true);
window.addEventListener('beforeunload', (e) => { if (editing && (changes().length || photoChanges().length || sending.size)) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('scroll', () => { placePop(); placePhoto(); }, { passive: true });
window.addEventListener('resize', () => { placePop(); placeTags(); placePhoto(); });
document.addEventListener('load', (e) => { if (editing && e.target.tagName === 'IMG') placeTags(); }, true);   // a photo arriving can move the ones below it

session.onChange(() => { if (!session.current() && editing) cancel(); render(); });

render();
session.isAdmin().then((ok) => {
  if (ok || !session.current()) return;
  bar.innerHTML = `<span class="edbar-msg"><b class="bad">${esc(session.current().email)} is signed in but isn’t set up as an editor.</b></span><button type="button" data-ed="out">Sign out</button>`;
}).catch((err) => console.warn('[editor] could not check the account:', err.detail || err.message));
