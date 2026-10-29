const crypto = require('node:crypto');
const { getStore } = require('@netlify/blobs');
const { requestJson } = require('./twitch');

const SESSION_COOKIE = 'uplink_twitch_session';
const STATE_COOKIE = 'uplink_twitch_state';
const SESSION_AGE = 30 * 86400;


function privateStore() { return getStore({ name: 'uplink-private', consistency: 'strong' }); }

function encryptionKey() {
  const secret = process.env.UPLINK_SESSION_SECRET || process.env.TWITCH_CLIENT_SECRET;
  if (!secret) throw Object.assign(new Error('Twitch video connections are not configured.'), { status: 501 });
  return crypto.createHash('sha256').update(secret).digest();
}

function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

function unseal(value) {
  const [iv, tag, ciphertext] = String(value).split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

function cookies(event) {
  const result = {};
  for (const entry of String(event.headers?.cookie || event.headers?.Cookie || '').split(';')) {
    const index = entry.indexOf('=');
    if (index < 0) continue;
    const name = entry.slice(0, index).trim();
    try { result[name] = decodeURIComponent(entry.slice(index + 1)); } catch { /* Ignore malformed cookies. */ }
  }
  return result;
}

function cookie(name, value, maxAge = SESSION_AGE) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/.netlify/functions; Max-Age=${maxAge}`;
}

async function saveSession(id, record) { await privateStore().set(`sessions/${id}`, seal(record)); }

async function getSession(event) {
  const id = cookies(event)[SESSION_COOKIE];
  if (!/^[a-f0-9]{64}$/.test(id || '')) throw Object.assign(new Error('Connect Twitch to import video clips.'), { status: 401 });
  const encrypted = await privateStore().get(`sessions/${id}`);
  if (!encrypted) throw Object.assign(new Error('Your Twitch connection expired. Connect again.'), { status: 401 });
  let record;
  try { record = unseal(encrypted); } catch { throw Object.assign(new Error('Your Twitch connection expired. Connect again.'), { status: 401 }); }
  if (record.validUntil < Date.now()) {
    await privateStore().delete(`sessions/${id}`);
    throw Object.assign(new Error('Your Twitch connection expired. Connect again.'), { status: 401 });
  }
  return { id, record };
}

async function refreshSession(session) {
  let tokens;
  try {
    tokens = await requestJson('https://id.twitch.tv/oauth2/token', {
      method: 'POST', body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: session.record.refreshToken }),
    });
  } catch {
    throw Object.assign(new Error('Twitch authorization expired. Disconnect and connect Twitch again.'), { status: 401 });
  }
  session.record.accessToken = tokens.access_token;
  session.record.refreshToken = tokens.refresh_token || session.record.refreshToken;
  session.record.expiresAt = Date.now() + tokens.expires_in * 1000;
  if (tokens.scope) session.record.scopes = tokens.scope;
  await saveSession(session.id, session.record);
}

async function userGet(session, path, retry = true) {
  try {
    return await requestJson(`https://api.twitch.tv/helix/${path}`, { headers: { Authorization: `Bearer ${session.record.accessToken}`, 'Client-Id': process.env.TWITCH_CLIENT_ID } });
  } catch (error) {
    if (retry && error.status === 401) { await refreshSession(session); return userGet(session, path, false); }
    if (error.status === 403) throw Object.assign(new Error('Connect the broadcaster or an authorized Twitch editor for this channel to import its clips.'), { status: 403 });
    throw error;
  }
}

async function validateSession(session, retry = true) {
  // Twitch requires token validation at session start and hourly thereafter.
  if (session.record.lastValidated > Date.now() - 3600000) return;
  try {
    const identity = await requestJson('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${session.record.accessToken}` } });
    if (identity.client_id !== process.env.TWITCH_CLIENT_ID || identity.user_id !== session.record.userId) throw Object.assign(new Error('Twitch identity changed. Connect again.'), { status: 401 });
    session.record.lastValidated = Date.now();
    session.record.scopes = identity.scopes || [];
    await saveSession(session.id, session.record);
  } catch (error) {
    if (retry && error.status === 401) { await refreshSession(session); return validateSession(session, false); }
    throw error;
  }
}

module.exports = { SESSION_COOKIE, STATE_COOKIE, SESSION_AGE, cookies, cookie, seal, unseal, privateStore, saveSession, getSession, refreshSession, userGet, validateSession };
