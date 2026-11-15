// Sign-in and database access for the site's editors.
//
// Editors use the foundation's existing admin accounts: Firebase Authentication, email and password,
// in the project compassioncf-web-site. Nothing here decides who may change what; the database's own
// rules do that. This file signs a person in, keeps them signed in on this browser, and sends their
// requests with proof of who they are.
//
// The project's public web settings are not written into this repository. They are read, when someone
// signs in, from the settings script Firebase Hosting publishes for the project.

const PROJECT = 'compassioncf-web-site';
const SETTINGS_SCRIPT = `https://${PROJECT}.web.app/__/firebase/init.js`;
const AUTH = 'https://identitytoolkit.googleapis.com/v1';
const TOKENS = 'https://securetoken.googleapis.com/v1/token';
export const DB = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
export const OLD_ADMIN = `https://${PROJECT}.web.app/admin`;

const STORE = 'ccf-admin';      // the signed-in session (shared/content.js looks for this to load the editor)
const KEY_STORE = 'ccf-key';
const ADMIN_STORE = 'ccf-admin-ok';

// kind: 'credentials' | 'network' | 'denied' | 'missing' | 'expired' | 'settings' | 'other'
export class Fail extends Error {
  constructor(kind, message, detail = '') {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

const NETWORK = 'Couldn’t reach the service. Check the connection and try again.';

/* ---------- the project's web settings ---------- */

let keyPromise = null;
function apiKey() {
  if (keyPromise) return keyPromise;
  let cached = null;
  try { cached = sessionStorage.getItem(KEY_STORE); } catch { /* private window */ }
  if (cached) return (keyPromise = Promise.resolve(cached));

  keyPromise = new Promise((resolve, reject) => {
    // The settings script calls firebase.initializeApp({...}); stand in for it just long enough to read them.
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
      initializeApp: (settings) => {
        if (!settings || !settings.apiKey) return failed();
        try { sessionStorage.setItem(KEY_STORE, settings.apiKey); } catch { /* private window */ }
        finish(resolve, settings.apiKey);
      },
    };
    script.src = SETTINGS_SCRIPT;
    script.onerror = failed;
    script.onload = () => setTimeout(failed, 0);   // no effect if the settings were already read
    document.head.append(script);
  });
  keyPromise.catch(() => { keyPromise = null; });   // let the next attempt try again
  return keyPromise;
}

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
  try { localStorage.removeItem(STORE); sessionStorage.removeItem(ADMIN_STORE); } catch { /* private window */ }
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

const signInProblem = (status, code) => {
  if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|MISSING_PASSWORD|MISSING_EMAIL/.test(code)) return new Fail('credentials', 'That email and password don’t match an account.');
  if (/TOO_MANY_ATTEMPTS/.test(code)) return new Fail('credentials', 'Too many tries. Wait a few minutes, then try again.');
  if (/USER_DISABLED/.test(code)) return new Fail('credentials', 'This account has been switched off.');
  if (status === 403 || /API key|API_KEY|referer|blocked/i.test(code)) return new Fail('settings', 'The sign-in service refused a request from this site.', code);
  return new Fail('other', 'Sign-in didn’t work. Try again in a moment.', code || `HTTP ${status}`);
};

export async function signIn(email, password) {
  const key = await apiKey();
  const { res, body } = await request(`${AUTH}/accounts:signInWithPassword?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok || !body?.idToken) throw signInProblem(res.status, body?.error?.message || '');
  try { sessionStorage.removeItem(ADMIN_STORE); } catch { /* private window */ }
  save({ email: body.email, uid: body.localId, idToken: body.idToken, refreshToken: body.refreshToken, exp: Date.now() + (Number(body.expiresIn) - 60) * 1000 });
  changed();
  return session();
}

// Always answers the same way, so it can't be used to find out which addresses have accounts.
export async function resetPassword(email) {
  const key = await apiKey();
  const { res, body } = await request(`${AUTH}/accounts:sendOobCode?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
  });
  const code = body?.error?.message || '';
  if (!res.ok && !/EMAIL_NOT_FOUND|INVALID_EMAIL/.test(code)) throw signInProblem(res.status, code);
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

// The same two tests the foundation's previous admin panel used: an "admin" claim on the account,
// or a document admins/<user id> with role "admin". The database rules have the final say either way.
export async function isAdmin() {
  const s = session();
  if (!s) return false;
  try { if (sessionStorage.getItem(ADMIN_STORE) === s.uid) return true; } catch { /* private window */ }
  let ok = claims(await token()).admin === true;
  if (!ok) {
    try {
      ok = (await get('admins', s.uid)).role === 'admin';
    } catch (err) {
      if (err.kind !== 'denied' && err.kind !== 'missing') throw err;
    }
  }
  if (ok) { try { sessionStorage.setItem(ADMIN_STORE, s.uid); } catch { /* private window */ } }
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

/* ---------- files, as the signed-in person ---------- */

const FILES = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(`${PROJECT}.firebasestorage.app`)}/o`;

// The one folder the foundation's storage is known to accept pictures in from an admin account:
// the previous admin panel uploads board members' photos there.
export const PHOTO_FOLDER = 'board-photos';

const fileProblem = (status, answer) => {
  const detail = `${answer?.error?.message || `HTTP ${status}`}`;
  if (status === 403) return new Fail('denied', 'The file storage refused that upload. This account may not have permission for it.', detail);
  if (status === 402) return new Fail('other', 'The foundation’s file storage is full or over its limit.', detail);
  if (status === 413) return new Fail('other', 'That file is too large to upload.', detail);
  return new Fail('other', 'The upload didn’t work. Try again in a moment.', detail);
};

// Uploads one file to the foundation's storage and returns its public address. The request has the same
// form Firebase's own code sends for a simple upload: the file's details and its bytes in one message.
export async function upload(path, blob, retried = false) {
  const idToken = await token();
  const type = blob.type || 'application/octet-stream';
  const boundary = `${Math.random().toString().slice(2)}${Math.random().toString().slice(2)}`;
  const details = JSON.stringify({ name: path, contentType: type, cacheControl: 'public, max-age=31536000' });   // the name is new each time, so it can be kept for a year
  const body = await new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${details}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]).arrayBuffer();
  const auth = { Authorization: `Firebase ${idToken}` };
  const { res, body: answer } = await request(`${FILES}?name=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { ...auth, 'X-Goog-Upload-Protocol': 'multipart', 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (res.status === 401 && !retried) {
    await token(true);
    return upload(path, blob, true);
  }
  if (res.status === 401) { signOut(); throw new Fail('expired', 'Your sign-in has ended. Please sign in again.'); }
  if (!res.ok) throw fileProblem(res.status, answer);

  // The address visitors can load the file from carries a token that the storage issues with the file.
  let tokens = answer?.downloadTokens;
  if (!tokens) {
    const about = await request(`${FILES}/${encodeURIComponent(path)}`, { headers: auth });
    tokens = about.body?.downloadTokens;
  }
  if (!tokens) throw new Fail('other', 'The photo was uploaded, but its address couldn’t be read. Try again in a moment.');
  return `${FILES}/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(String(tokens).split(',')[0])}`;
}
