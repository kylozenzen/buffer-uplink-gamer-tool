// Shared public Twitch client. App credentials never leave the server.
let cachedToken;

function normalizeLogin(value) {
  let login = String(value || '').trim().replace(/^@+/, '');
  if (/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\//i.test(login)) {
    try {
      const url = new URL(/^https?:\/\//i.test(login) ? login : `https://${login}`);
      if (!/(^|\.)twitch\.tv$/i.test(url.hostname)) return '';
      login = url.pathname.split('/').filter(Boolean)[0] || '';
    } catch { return ''; }
  }
  return /^[a-z0-9_]{1,25}$/i.test(login) ? login.toLowerCase() : '';
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    throw Object.assign(new Error(data.message || `Twitch request failed (${response.status})`), { status: response.status });
  }
  return data;
}

async function appToken(force = false) {
  if (!force && cachedToken?.expiresAt > Date.now() + 60000) return cachedToken.token;
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw Object.assign(new Error('Twitch is not configured on this deployment.'), { status: 501 });
  const data = await requestJson('https://id.twitch.tv/oauth2/token', {
    method: 'POST', body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function publicGet(path, retry = true) {
  const token = await appToken();
  try {
    return await requestJson(`https://api.twitch.tv/helix/${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID },
    });
  } catch (error) {
    if (retry && error.status === 401) { await appToken(true); return publicGet(path, false); }
    throw error;
  }
}

async function channelForLogin(login) {
  const data = await publicGet(`users?login=${encodeURIComponent(login)}`);
  const user = data.data?.[0];
  if (!user) throw Object.assign(new Error(`No Twitch channel found for @${login}.`), { status: 404 });
  return user;
}

module.exports = { normalizeLogin, requestJson, publicGet, channelForLogin };
