// Sign-in and database access for the site's editors.
//
// Editors sign in with Google. The sign-in service is Firebase Authentication in the site's own
// project, compassioncf-editor. Who may edit is not decided here: the project's database rules hold
// the list of Google addresses that may, and refuse everyone else. This file signs a person in,
// keeps them signed in on this browser, and sends their requests with proof of who they are.
//
// The project's public web settings are not written into this repository. They are read, when the
// sign-in screen opens, from a small settings file the project publishes at its own address.

const PROJECT = 'compassioncf-editor';
const SETTINGS_SCRIPT = `https://${PROJECT}.web.app/editor-settings.js`;
const GOOGLE_SIGN_IN = 'https://www.gstatic.com/firebasejs/12.4.0';   // Google's own sign-in code, loaded only on the sign-in screen
const TOKENS = 'https://securetoken.googleapis.com/v1/token';
export const DB = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const STORE = 'ccf-editor';      // the signed-in session (shared/content.js looks for this to load the editor)
const SETTINGS_STORE = 'ccf-editor-settings';
const EDITOR_STORE = 'ccf-editor-ok';

// Swapping photos needs somewhere to keep the new files. The site's own project has no file storage
// (its plan does not include any), so the editor does not offer it for now.
export const PHOTO_SWAPS = false;

// kind: 'cancelled' | 'blocked' | 'network' | 'denied' | 'missing' | 'expired' | 'settings' | 'other'
export class Fail extends Error {
  constructor(kind, message, detail = '') {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

const NETWORK = 'Couldn’t reach the service. Check the connection and try again.';

/* ---------- the project's web settings ---------- */

let settingsPromise = null;
function settings() {
  if (settingsPromise) return settingsPromise;
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(SETTINGS_STORE)); } catch { /* private window, or nothing kept */ }
  if (cached && cached.apiKey) return (settingsPromise = Promise.resolve(cached));

  settingsPromise = new Promise((resolve, reject) => {
    // The settings file calls firebase.initializeApp({...}); stand in for it just long enough to read them.
    const had = Object.prototype.hasOwnProperty.call(window, 'firebase');
    const before = window.firebase;
    const script = document.createElement('script');
    const finish = (settle, value) => {
      if (had) window.firebase = before; else delete window.firebase;
      script.remove();
      settle(value);
    };
    const failed = () => finish(reject, new Fail('settings', 'The sign-in settings couldn’t be loaded. Try again in a moment.', SETTINGS_SCRIPT));
    window.firebase = {
      initializeApp: (found) => {
        if (!found || !found.apiKey) return failed();
        const kept = { apiKey: found.apiKey, authDomain: found.authDomain, projectId: found.projectId, appId: found.appId };
        try { sessionStorage.setItem(SETTINGS_STORE, JSON.stringify(kept)); } catch { /* private window */ }
        finish(resolve, kept);
      },
    };
    script.src = SETTINGS_SCRIPT;
    script.onerror = failed;
    script.onload = () => setTimeout(failed, 0);   // no effect if the settings were already read
    document.head.append(script);
  });
  settingsPromise.catch(() => { settingsPromise = null; });   // let the next attempt try again
  return settingsPromise;
}
const apiKey = async () => (await settings()).apiKey;

/* ---------- the session ---------- */

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => listeners.forEach((fn) => fn(current()));

export function current() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    return s && s.refreshToken ? s : null;
  } catch {
    return null;
  }
}

function save(session) {
  try { localStorage.setItem(STORE, JSON.stringify(session)); } catch { /* private window: signed in for this page only */ }
  memory = session;
}
let memory = null;
const session = () => current() || memory;

export function signOut() {
  memory = null;
  try { localStorage.removeItem(STORE); sessionStorage.removeItem(EDITOR_STORE); } catch { /* private window */ }
  changed();
}
window.addEventListener('storage', (e) => { if (e.key === STORE) changed(); });

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Fail('network', NETWORK);
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { res, body };
}

/* ---------- signing in with Google ---------- */

// Google's sign-in code and this project's settings, fetched together. The session itself is kept by
// this file (above), so Google's code is told to keep nothing of its own.
let googlePromise = null;
function google() {
  googlePromise ||= Promise.all([settings(), import(`${GOOGLE_SIGN_IN}/firebase-app.js`), import(`${GOOGLE_SIGN_IN}/firebase-auth.js`)])
    .then(([found, appCode, authCode]) => {
      const app = appCode.getApps().find((a) => a.name === STORE) || appCode.initializeApp(found, STORE);
      let auth;
      try {
        auth = authCode.initializeAuth(app, { persistence: authCode.inMemoryPersistence, popupRedirectResolver: authCode.browserPopupRedirectResolver });
      } catch {
        auth = authCode.getAuth(app);   // already set up on this page
      }
      return { authCode, auth };
    });
  googlePromise.catch(() => { googlePromise = null; });   // let the next attempt try again
  return googlePromise;
}

// Called when the sign-in screen is shown. A browser only lets a page open a new window while it is
// still handling the click, so everything the button needs is fetched before it is pressed.
export const prepare = () => google().then(() => true, () => false);

const signInProblem = (err) => {
  const code = String(err?.code || '');
  if (err instanceof Fail) return err;
  if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(code)) return new Fail('cancelled', 'The Google window was closed before sign-in finished.');
  if (/popup-blocked/.test(code)) return new Fail('blocked', 'This browser stopped the Google window from opening. Allow pop-ups for this site, then press the button again.');
  if (/unauthorized-domain/.test(code)) return new Fail('settings', 'Google sign-in isn’t switched on for this address.', location.hostname);
  if (/operation-not-allowed/.test(code)) return new Fail('settings', 'Google sign-in isn’t switched on for this site.', code);
  if (/network-request-failed/.test(code)) return new Fail('network', NETWORK);
  if (/user-disabled/.test(code)) return new Fail('other', 'This account has been switched off.');
  return new Fail('other', 'Sign-in didn’t work. Try again in a moment.', code || String(err?.message || ''));
};

export async function signIn() {
  let ready;
  try {
    ready = await google();
  } catch (err) {
    // A browser may not fetch a failed piece of code a second time on the same page, hence "reload".
    throw err instanceof Fail ? err : new Fail('settings', 'Google’s sign-in couldn’t be loaded. Check the connection, then reload this page and try again.', String(err?.message || err));
  }
  const { authCode, auth } = ready;
  const provider = new authCode.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });   // always ask which Google account, so a shared computer doesn't pick one silently
  let user;
  let idToken;
  try {
    ({ user } = await authCode.signInWithPopup(auth, provider));
    idToken = await user.getIdToken();
  } catch (err) {
    throw signInProblem(err);
  }
  const exp = Number(claims(idToken).exp) * 1000 || Date.now() + 3600 * 1000;
  try { sessionStorage.removeItem(EDITOR_STORE); } catch { /* private window */ }
  save({ email: user.email || '', uid: user.uid, idToken, refreshToken: user.refreshToken, exp: exp - 60 * 1000 });
  authCode.signOut(auth).catch(() => {});   // Google's code lets go of its copy; the session above is the one in use
  changed();
  return session();
}

let refreshing = null;
async function token(force = false) {
  const s = session();
  if (!s) throw new Fail('expired', 'Please sign in again.');
  if (!force && s.exp > Date.now()) return s.idToken;
  refreshing ||= (async () => {
    const key = await apiKey();
    const { res, body } = await request(`${TOKENS}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken }),
    });
    if (!res.ok || !body?.id_token) {
      signOut();
      throw new Fail('expired', 'Your sign-in has ended. Please sign in again.', body?.error?.message || `HTTP ${res.status}`);
    }
    save({ ...s, idToken: body.id_token, refreshToken: body.refresh_token || s.refreshToken, exp: Date.now() + (Number(body.expires_in) - 60) * 1000 });
    return body.id_token;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

function claims(idToken) {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

// Whether the signed-in person is on the list of editors. The database's rules hold that list, so the
// question is put to the database itself: only an editor is allowed to look at the inbox.
export async function mayEdit() {
  const s = session();
  if (!s) return false;
  try { if (sessionStorage.getItem(EDITOR_STORE) === s.uid) return true; } catch { /* private window */ }
  let ok = false;
  try {
    await call('contactSubmissions', { query: 'pageSize=1' });
    ok = true;
  } catch (err) {
    if (err.kind !== 'denied') throw err;
  }
  if (ok) { try { sessionStorage.setItem(EDITOR_STORE, s.uid); } catch { /* private window */ } }
  return ok;
}

/* ---------- the database, as the signed-in person ---------- */

async function call(path, { method = 'GET', query = '', body } = {}, retried = false) {
  const idToken = await token();
  const { res, body: answer } = await request(`${DB}/${path}${query ? `?${query}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${idToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !retried) {
    await token(true);
    return call(path, { method, query, body }, true);
  }
  if (res.ok) return answer;
  const detail = `${answer?.error?.status || `HTTP ${res.status}`}${answer?.error?.message ? `: ${answer.error.message}` : ''}`;
  if (res.status === 401) { signOut(); throw new Fail('expired', 'Your sign-in has ended. Please sign in again.', detail); }
  if (res.status === 403) throw new Fail('denied', 'The database refused that. This account may not have permission for it.', detail);
  if (res.status === 404) throw new Fail('missing', 'That item no longer exists.', detail);
  throw new Fail('other', 'The database couldn’t do that. Try again in a moment.', detail);
}

export function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}
const encodeFields = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));

export function decode(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  return null;
}
const decodeFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
const toDoc = (d) => ({ id: d.name.split('/').pop(), ...decodeFields(d.fields) });

export async function list(collection) {
  const out = [];
  let pageToken = '';
  do {
    const page = await call(collection, { query: `pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}` });
    (page?.documents || []).forEach((d) => out.push(toDoc(d)));
    pageToken = page?.nextPageToken || '';
  } while (pageToken && out.length < 3000);
  return out;
}

export async function get(collection, id) {
  return toDoc(await call(`${collection}/${encodeURIComponent(id)}`));
}

export async function create(collection, data) {
  return toDoc(await call(collection, { method: 'POST', body: { fields: encodeFields(data) } }));
}

// A change request that names no fields would replace the whole document with nothing. Never send one.
const fieldList = (values) => {
  const keys = Object.keys(values || {});
  if (!keys.length) throw new Fail('other', 'There was nothing to save.');
  return keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
};

// Changes only the fields given; the rest of the document is left as it is.
export async function update(collection, id, data) {
  const mask = fieldList(data);
  return toDoc(await call(`${collection}/${encodeURIComponent(id)}`, { method: 'PATCH', query: `${mask}&currentDocument.exists=true`, body: { fields: encodeFields(data) } }));
}

export async function remove(collection, id) {
  await call(`${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Sets the given fields of a document and leaves its other fields alone (creating the document if it isn't there yet).
export async function setFields(docPath, values) {
  await call(docPath, { method: 'PATCH', query: fieldList(values), body: { fields: encodeFields(values) } });
}
export const setField = (docPath, field, value) => setFields(docPath, { [field]: value });

// Writes a document under a chosen name, field for field as given in the database's own notation.
// Used once, to bring the essays and events over from the previous database with their addresses unchanged.
export async function copyIn(collection, id, fields) {
  const names = Object.keys(fields || {});
  if (!names.length) throw new Fail('other', 'There was nothing to copy.');
  const mask = names.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  await call(`${collection}/${encodeURIComponent(id)}`, { method: 'PATCH', query: mask, body: { fields } });
}

/* ---------- files ---------- */

export const PHOTO_FOLDER = 'site-photos';

// See PHOTO_SWAPS above: there is nowhere to put a new photo yet.
export async function upload() {
  throw new Fail('other', 'Photos can’t be changed from the editor at the moment.');
}
