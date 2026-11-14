// The editor bar a signed-in editor sees at the bottom of every page, and "Edit this page":
// click any text, change it, save. Loaded by shared/content.js only when this browser has signed in.

import { entries, sanitize, normalize, fetchEdits, setEdits, edits, TEXT_DOC, TEXT_FIELD } from '../content.js';
import * as session from './session.js';

const ADMIN = new URL('../../admin/', import.meta.url).href;
const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./admin.css', import.meta.url).href });
document.head.append(css);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const bar = document.createElement('div');
bar.className = 'edbar';
bar.setAttribute('role', 'region');
bar.setAttribute('aria-label', 'Site editor');
document.body.append(bar);

// "Use the original wording", shown beside the text being edited when it differs from the page's own.
const pop = document.createElement('button');
pop.type = 'button';
pop.className = 'ed-pop';
pop.textContent = 'Use the original wording';
pop.hidden = true;
document.body.append(pop);

let editing = false;
let busy = false;
let note = '';        // one line of feedback shown in the bar
let noteKind = '';
let focused = null;   // the entry being typed in

const clean = (html) => normalize(sanitize(html));
const shown = (entry) => (typeof edits[entry.key] === 'string' ? sanitize(edits[entry.key]) : entry.original);   // what visitors see now
const isChanged = (entry) => clean(entry.el.innerHTML) !== clean(shown(entry));
const isOriginal = (entry) => clean(entry.el.innerHTML) === clean(entry.original);
const changes = () => entries.filter(isChanged);

/* ---------- the bar ---------- */

function pageLinks() {
  const post = new URLSearchParams(location.search).get('id');
  if (document.querySelector('[data-cms="blog-post"]') && post) return `<a href="${ADMIN}#essays/${encodeURIComponent(post)}">Edit this essay</a>`;
  if (document.querySelector('[data-cms="events"]')) return `<a href="${ADMIN}#events/new">Add an event</a>`;
  if (document.querySelector('[data-cms="blog-list"][data-href^="post.html"]')) return `<a href="${ADMIN}#essays/new">New essay</a>`;
  return '';
}

function render() {
  const who = session.current();
  if (!who) { bar.remove(); pop.remove(); return; }
  const n = editing ? changes().length : 0;
  bar.classList.toggle('editing', editing);
  bar.innerHTML = editing
    ? `<span class="edbar-msg">${note ? `<b class="${noteKind}">${esc(note)}</b>` : n ? `${n} change${n === 1 ? '' : 's'} not saved yet` : 'Click any text on the page to change it.'}</span>
       <button type="button" class="edbar-main" data-ed="save" ${!n || busy ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save'}</button>
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
  note = '';
  document.documentElement.classList.add('ed-on');
  for (const entry of entries) {
    entry.el.setAttribute('contenteditable', 'true');
    entry.el.setAttribute('spellcheck', 'true');
  }
  render();
}

function stop() {
  editing = false;
  focused = null;
  pop.hidden = true;
  document.documentElement.classList.remove('ed-on');
  for (const entry of entries) {
    entry.el.removeAttribute('contenteditable');
    entry.el.removeAttribute('spellcheck');
    entry.el.classList.remove('ed-changed');
  }
}

function cancel() {
  for (const entry of entries) if (isChanged(entry)) entry.el.innerHTML = shown(entry);
  stop();
  note = '';
  render();
}

function mark() {
  for (const entry of entries) entry.el.classList.toggle('ed-changed', isChanged(entry));
  if (note && noteKind !== 'bad') note = '';
  render();
  placePop();
}

function placePop() {
  if (!editing || !focused || isOriginal(focused)) { pop.hidden = true; return; }
  const r = focused.el.getBoundingClientRect();
  pop.hidden = false;
  // above the text's top right corner, where it is least likely to cover the line before
  pop.style.top = `${Math.max(8, r.top + scrollY - 36)}px`;
  pop.style.left = `${Math.max(8, r.right + scrollX - pop.offsetWidth)}px`;
}

async function save() {
  if (busy) return;
  busy = true;
  note = '';
  render();
  try {
    const next = { ...(await fetchEdits()) };   // start from what is in the database now, in case someone else saved meanwhile
    for (const entry of changes()) {
      if (isOriginal(entry)) delete next[entry.key];
      else next[entry.key] = sanitize(entry.el.innerHTML);
    }
    await session.setField(TEXT_DOC, TEXT_FIELD, JSON.stringify(next));
    stop();
    setEdits(next);
    busy = false;
    say('Saved. Visitors see the new text straight away.', 'good');
  } catch (err) {
    busy = false;
    console.warn('[editor] text not saved:', err.detail || err.message);
    say(err.kind ? `Not saved. ${err.message}` : 'Not saved. The current text couldn’t be read from the database; try again in a moment.', 'bad');
  }
}

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
  focused.el.innerHTML = focused.original;
  mark();
});

const entryOf = (node) => {
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const host = el?.closest('[contenteditable="true"]');
  return host ? entries.find((entry) => entry.el === host) : null;
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
// While editing, links and buttons on the page are text to change, not things to follow.
document.addEventListener('click', (e) => {
  if (!editing || bar.contains(e.target) || pop.contains(e.target)) return;
  if (e.target.closest('a, button, [data-donate], summary')) { e.preventDefault(); e.stopPropagation(); }
}, true);
window.addEventListener('beforeunload', (e) => { if (editing && changes().length) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('scroll', placePop, { passive: true });
window.addEventListener('resize', placePop);

session.onChange(() => { if (!session.current() && editing) cancel(); render(); });

render();
session.isAdmin().then((ok) => {
  if (ok || !session.current()) return;
  bar.innerHTML = `<span class="edbar-msg"><b class="bad">${esc(session.current().email)} is signed in but isn’t set up as an editor.</b></span><button type="button" data-ed="out">Sign out</button>`;
}).catch((err) => console.warn('[editor] could not check the account:', err.detail || err.message));
