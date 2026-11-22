// The site in other languages.
//
// The pages are written in English. A visitor can choose any of the languages below, which are the languages
// the Compassion Course is taught in. The choice is kept in this browser; "?lang=es" in an address chooses it
// too. For each language the site carries one file, shared/i18n/<code>.json: a table from a piece of English
// wording to the same wording in that language.
//
// A piece of wording shows in the visitor's language when the table holds exactly that English wording, and in
// English otherwise. So when the foundation rewords a line in the editor, that line shows in English on the
// translated pages until the tables are brought up to date: never a translation of what the line used to say.
//
// Three kinds of wording are translated:
//   - the text of the pages: shared/content.js asks translationOf() for each piece, after any saved change;
//   - words around it: the menu, form labels, and descriptions kept in attributes (translateTree);
//   - what scripts write: they call t().
// Essays and events are shown as the foundation wrote them, and the editor works in English.

// code, the language's own name, and the line that offers it to a visitor whose browser asks for it
export const LANGUAGES = [
  ['en', 'English', ''],
  ['de', 'Deutsch', 'Diese Website auf Deutsch lesen'],
  ['es', 'Español', 'Leer este sitio en español'],
  ['fr', 'Français', 'Lire ce site en français'],
  ['it', 'Italiano', 'Leggi questo sito in italiano'],
  ['nl', 'Nederlands', 'Lees deze site in het Nederlands'],
  ['pl', 'Polski', 'Czytaj tę stronę po polsku'],
  ['pt', 'Português', 'Ler este site em português'],
  ['ro', 'Română', 'Citește acest site în română'],
  ['fi', 'Suomi', 'Lue tämä sivusto suomeksi'],
  ['sv', 'Svenska', 'Läs den här webbplatsen på svenska'],
  ['tr', 'Türkçe', 'Bu siteyi Türkçe okuyun'],
  ['el', 'Ελληνικά', 'Διαβάστε αυτόν τον ιστότοπο στα ελληνικά'],
  ['ru', 'Русский', 'Читать этот сайт на русском'],
  ['he', 'עברית', 'לקריאת האתר בעברית'],
  ['ar', 'العربية', 'اقرأ هذا الموقع بالعربية'],
  ['hi', 'हिन्दी', 'इस साइट को हिन्दी में पढ़ें'],
  ['zh', '中文', '用中文阅读本网站'],
  ['ja', '日本語', 'このサイトを日本語で読む'],
  ['ko', '한국어', '이 사이트를 한국어로 읽기'],
];
const RIGHT_TO_LEFT = new Set(['ar', 'he']);
// How dates and numbers are written. Digits stay 0-9 everywhere, as they are in the translated wording.
const LOCALES = { en: 'en-US', pt: 'pt-BR', zh: 'zh-Hans', ar: 'ar-u-nu-latn', hi: 'hi-u-nu-latn' };
const PAGE_LANG = { pt: 'pt-BR', zh: 'zh-Hans' };   // what the page says its language is

const STORE = 'ccf-lang';            // the visitor's choice
const TABLE_STORE = 'ccf-lang-table';   // the last table read, so the next page needn't wait for it
const html = document.documentElement;

const known = (code) => LANGUAGES.some(([c]) => c === code);
const tidy = (code) => String(code || '').toLowerCase().split(/[-_]/)[0];
const kept = () => { try { return tidy(localStorage.getItem(STORE)); } catch { return ''; } };
const keep = (code) => { try { localStorage.setItem(STORE, code); } catch { /* private window: this page only */ } };

function chosen() {
  if (document.querySelector('[data-admin-app]')) return 'en';   // the editor is in English
  const asked = tidy(new URLSearchParams(location.search).get('lang'));
  if (known(asked)) { keep(asked); return asked; }
  const before = kept();
  return known(before) ? before : 'en';
}

export const lang = chosen();
export const locale = LOCALES[lang] || lang;
export const rtl = RIGHT_TO_LEFT.has(lang);
export const translated = lang !== 'en';

/* ---------- the table ---------- */

export const normalize = (text) => String(text).replace(/\s+/g, ' ').trim();
function fnv(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
// What a piece of English wording is filed under: the wording itself, whitespace aside.
export const keyOf = (english) => { const s = normalize(english); return `${fnv(s, 2166136261)}${fnv(s, 0x9e3779b9)}`; };

let table = {};
const usable = (found) => (found && typeof found === 'object' && found.lang === lang && found.strings && typeof found.strings === 'object' ? found.strings : null);
const tableUrl = new URL(`./i18n/${lang}.json`, import.meta.url);

function remembered() {
  try { return usable(JSON.parse(localStorage.getItem(TABLE_STORE))); } catch { return null; }
}
async function fetched() {
  const res = await fetch(tableUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const strings = usable(JSON.parse(text));
  if (!strings) throw new Error('not a table for this language');
  try { localStorage.setItem(TABLE_STORE, text); } catch { /* too large for this browser, or a private window */ }
  return strings;
}

const listeners = new Set();
// Called once the table is in hand, and again if a newer one arrives.
export const onTable = (fn) => { listeners.add(fn); };
const announce = () => listeners.forEach((fn) => { try { fn(); } catch (err) { console.warn('[i18n]', err.message); } });

// Resolves when wording can be shown: at once in English, otherwise when the table has been read. A table kept
// from an earlier page is used straight away, and the site's current one is fetched behind it.
export const ready = (async () => {
  if (!translated) return;
  const before = remembered();
  const fresh = fetched();
  if (before) {
    table = before;
    fresh.then((now) => { if (JSON.stringify(now) !== JSON.stringify(table)) { table = now; announce(); } })
      .catch((err) => console.warn('[i18n] table not refreshed:', err.message));
    return;
  }
  try {
    table = await fresh;
  } catch (err) {
    console.warn('[i18n] table not loaded, showing English:', err.message);
  }
})();

// A piece of the pages' text as it is filed and translated: its words and its tags, without the tags'
// attributes. (A link's address differs from page to page, and no address belongs in a table of wording.)
// A tag that has attributes is numbered, i="1", i="2" and so on, so that a translation can move it along with
// the words it holds and still be given the right attributes back.
export function plainForm(markup) {
  const from = document.createElement('template');   // parsed but inert: nothing loads or runs
  from.innerHTML = String(markup ?? '');
  const tags = [];
  const copy = (source, into) => {
    for (const node of source.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) { into.append(node.nodeValue); continue; }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = document.createElement(node.localName);
      if (node.attributes.length) { tags.push(node); el.setAttribute('i', String(tags.length)); }
      copy(node, el);
      into.append(el);
    }
  };
  const out = document.createElement('div');
  copy(from.content, out);
  return { words: out.innerHTML, tags };
}

// A translation with each numbered tag given back the attributes it has in the English. Nothing else in a
// translation's tags is kept, so a table can add words and move tags, and nothing more.
function dressed(translation, tags) {
  const made = document.createElement('template');
  made.innerHTML = translation;
  for (const el of made.content.querySelectorAll('*')) {
    const source = tags[Number(el.getAttribute('i')) - 1];
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (source && source.localName === el.localName) for (const a of source.attributes) el.setAttribute(a.name, a.value);
  }
  const out = document.createElement('div');
  out.append(made.content);
  return out.innerHTML;
}

const lookUp = (words) => { const found = table[keyOf(words)]; return typeof found === 'string' && found ? found : null; };

// A piece of the pages' text (markup) in the visitor's language, or null when the table has none for exactly
// this English. shared/content.js passes the result through the same filter as any saved change before showing it.
export function translationOf(markup) {
  if (!translated) return null;
  const { words, tags } = plainForm(markup);
  const found = lookUp(words);
  return found === null ? null : dressed(found, tags);
}

// Plain words (a label, a description, what a script says) in the visitor's language, or null.
export const wordsFor = (english) => (translated ? lookUp(english) : null);

// For scripts that write markup (a sentence with a link in it): th(markup) gives it in the visitor's language
// with the link as it is in the English, or the English itself when there is no translation.
export const th = (markup) => translationOf(markup) ?? markup;

// For scripts: t(words) or, with a blank to fill, t("Donate {amount}", { amount }). English comes back when there
// is no translation. (The words must be written out in the call, in single quotes: that is how they are found
// when the site's wording is collected for translating.)
export function t(english, values) {
  let out = wordsFor(english) ?? english;
  if (values) for (const [name, value] of Object.entries(values)) out = out.split(`{${name}}`).join(String(value));
  return out;
}

/* ---------- words outside the pages' own text ---------- */

// Left as they are: names, what the foundation writes in the editor (essays, events), what a script keeps
// changing, and the editor itself.
const LEAVE = [
  'script', 'style', 'noscript', 'svg', 'canvas', '.brand', '.g-wrap', '[data-no-translate]', '[data-admin-app]',
  '[data-posts]', '[data-post-title]', '[data-post-sub]', '[data-post-by]', '[data-post-body]', '[data-events-list] > [data-no-edit]',
  '[data-count]', '[data-year]', '.edbar', '.ed-pop', '.ed-photo', '.ed-photo-tag', '[contenteditable="true"]',
].join(',');
const ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder', 'data-say'];

// Visits every piece of text under root that is not part of the pages' own text (those are `owned`), and every
// attribute that holds words. `text(node, words)` and `attr(el, name, words)` decide what to do with each.
export function walk(root, owned, text, attr) {
  const visit = (el) => {
    if (el.matches(LEAVE)) return;
    for (const name of ATTRIBUTES) { const value = el.getAttribute(name); if (value && value.trim()) attr(el, name, value); }
    if (owned(el) || el.matches('select, textarea')) return;   // a list's choices and what is typed in a box are not wording
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue.trim()) text(node, node.nodeValue); } else if (node.nodeType === Node.ELEMENT_NODE) visit(node);
    }
  };
  if (root.nodeType === Node.ELEMENT_NODE) visit(root); else for (const el of root.children) visit(el);
}

const done = new WeakSet();   // text already put into the visitor's language
let ownedBy = () => false;    // given by shared/content.js: whether an element is one of the pages' own pieces of text
let pieces = () => {};        // given by shared/content.js: puts the pages' own text into the visitor's language
export const hasTable = () => Object.keys(table).length > 0;

export function translateTree(root = document.body) {
  if (!translated || !root) return;
  walk(root, ownedBy, (node, words) => {
    if (done.has(node)) return;
    const found = wordsFor(words);
    if (!found) return;
    // the spaces around the words are kept: they separate them from what stands beside them
    node.nodeValue = words.replace(/^(\s*)[\s\S]*?(\s*)$/, (m, a, b) => a + found + b);
    done.add(node);
  }, (el, name, words) => {
    const mark = `data-i18n-${name}`;
    if (el.hasAttribute(mark)) return;
    const found = wordsFor(words);
    if (found) { el.setAttribute(name, found); el.setAttribute(mark, ''); }
  });
}

/* ---------- the page as a whole ---------- */

const SITE_NAME = 'Compassion Course Foundation';
function translateHead() {
  // "About — Compassion Course Foundation": each part is looked up; the foundation's name stays as it is
  const parts = document.title.split(' — ');
  const now = parts.map((part) => (part === SITE_NAME ? part : wordsFor(part) || part)).join(' — ');
  if (now !== document.title) document.title = now;
  const about = document.querySelector('meta[name="description"]');
  const said = about && wordsFor(about.getAttribute('content') || '');
  if (said) about.setAttribute('content', said);
}

function address(code) {
  const url = new URL(location.href);
  url.searchParams.set('lang', code);
  return url.pathname + url.search + url.hash;
}

// A line in the footer of a translated page: how the translation was made, and the way back to English.
function addNote() {
  const base = document.querySelector('.ftr-base');
  if (!base || base.querySelector('.ftr-lang')) return;
  const note = document.createElement('p');
  note.className = 'ftr-lang';
  note.setAttribute('data-no-edit', '');
  const link = Object.assign(document.createElement('a'), { href: address('en'), textContent: t('Read it in English') });
  link.lang = 'en';
  note.append(t('This page was translated automatically from English.'), ' ', link);
  base.append(note);
}

/* ---------- the language menu ---------- */

// The menu is written into each page's header: a native list of languages, laid invisibly over a label that
// shows the current one, so it opens as the device's own picker and needs no code to be used with a keyboard.
function menus() {
  for (const box of document.querySelectorAll('[data-lang-menu]')) {
    const select = box.querySelector('select');
    const label = box.querySelector('[data-lang-now]');
    if (!select) continue;
    select.replaceChildren(...LANGUAGES.map(([code, name]) => {
      const option = new Option(name, code, false, code === lang);
      option.lang = PAGE_LANG[code] || code;
      return option;
    }));
    if (label) { label.textContent = LANGUAGES.find(([code]) => code === lang)[1]; label.lang = PAGE_LANG[lang] || lang; }
    select.addEventListener('change', () => { if (known(select.value)) { keep(select.value); location.assign(address(select.value)); } });
  }
}

// A visitor whose browser asks for one of the site's languages, and who has not chosen here yet, is offered it
// once, in that language. Either answer is remembered.
function offer() {
  if (translated || kept() || document.querySelector('[data-admin-app]')) return;
  let framed = true;
  try { framed = window.top !== window.self; } catch { /* a frame on another site */ }
  if (framed) return;
  const wanted = (navigator.languages || [navigator.language]).map(tidy).find((code) => code && known(code));
  if (!wanted || wanted === 'en') return;   // English comes first, or nothing the site has
  const [code, , words] = LANGUAGES.find(([c]) => c === wanted);
  const box = document.createElement('div');
  box.className = 'lang-offer';
  box.setAttribute('data-no-edit', '');
  box.lang = PAGE_LANG[code] || code;
  if (RIGHT_TO_LEFT.has(code)) box.dir = 'rtl';
  const go = Object.assign(document.createElement('a'), { href: address(code), textContent: words });
  go.addEventListener('click', () => keep(code));
  const no = Object.assign(document.createElement('button'), { type: 'button', textContent: '×' });
  no.setAttribute('aria-label', 'Stay in English');
  no.lang = 'en';
  no.addEventListener('click', () => { keep('en'); box.remove(); });
  box.append(go, no);
  document.body.append(box);
}

/* ---------- start ---------- */

html.lang = PAGE_LANG[lang] || lang;
if (rtl) html.dir = 'rtl'; else html.removeAttribute('dir');
menus();

// shared/content.js calls this once it has listed the page's own pieces of text (which must be read from the
// page as it was written, before any word on it changes). The page is held back until then (see .i18n-wait in
// style.css) so a visitor reading in another language never sees it in English first.
let started = null;
let wordsShown;
// Resolves once the page's words are in the visitor's language (or straight away, in English).
export const shown = new Promise((resolve) => { wordsShown = resolve; });
export function start({ owned, translate }) {
  if (started) return started;
  ownedBy = owned;
  pieces = translate;
  const all = () => { pieces(); translateHead(); translateTree(); };
  started = ready.then(() => {
    if (translated && hasTable()) {
      all();
      addNote();
      html.classList.add('i18n-on');
    } else if (translated) {   // the table could not be read: the page is in English after all
      html.lang = 'en';
      html.removeAttribute('dir');
    }
    html.classList.remove('i18n-wait');
    wordsShown();
    offer();
  });
  onTable(all);
  return started;
}
