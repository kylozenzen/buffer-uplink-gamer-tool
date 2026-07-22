// netlify/functions/twitch-proxy.js
//
// Uses Twitch's app access token (client credentials grant) to read public
// channel and stream data. Required Netlify environment variables:
//   TWITCH_CLIENT_ID
//   TWITCH_CLIENT_SECRET

let cachedToken = null; // { token, expiresAt }

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

function normalizeTwitchLogin(value) {
  let login = String(value || '').trim();
  if (!login) return '';

  login = login.replace(/^@+/, '');

  try {
    const looksLikeTwitchUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\//i.test(login);
    if (looksLikeTwitchUrl) {
      const url = new URL(/^https?:\/\//i.test(login) ? login : `https://${login}`);
      if (!/(^|\.)twitch\.tv$/i.test(url.hostname)) return '';
      login = url.pathname.split('/').filter(Boolean)[0] || '';
    } else {
      login = login.split(/[/?#]/)[0];
    }
  } catch {
    return '';
  }

  return login.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

async function getAppAccessToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('Twitch is not configured on this server yet'), { code: 'NOT_CONFIGURED' });
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
  });

  if (!res.ok) throw new Error(`Twitch auth failed (${res.status})`);

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function twitchGet(path, clientId, token, allowAuthRetry = true) {
  const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': clientId,
    },
  });

  if (res.status === 401 && allowAuthRetry) {
    cachedToken = null;
    const refreshedToken = await getAppAccessToken(true);
    return twitchGet(path, clientId, refreshedToken, false);
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Twitch request failed (${res.status})`);
  return data;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({ ...body, fetchedAt: new Date().toISOString() }),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const rawLogin = event.queryStringParameters?.login || '';
  const login = normalizeTwitchLogin(rawLogin);
  if (!login) {
    return jsonResponse(400, {
      error: 'Enter a valid Twitch username or channel URL',
      code: 'INVALID_LOGIN',
    });
  }

  try {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const token = await getAppAccessToken();

    // Resolve the channel first so a typo is not silently reported as "offline."
    const users = await twitchGet(`users?login=${encodeURIComponent(login)}`, clientId, token);
    const user = users?.data?.[0] || null;

    if (!user) {
      return jsonResponse(404, {
        live: false,
        error: `No Twitch channel found for @${login}`,
        code: 'CHANNEL_NOT_FOUND',
        login,
      });
    }

    const streams = await twitchGet(`streams?user_id=${encodeURIComponent(user.id)}`, clientId, token);
    const stream = streams?.data?.[0] || null;

    if (!stream) {
      return jsonResponse(200, {
        live: false,
        login: user.login,
        displayName: user.display_name,
      });
    }

    const thumbnail = (stream.thumbnail_url || '')
      .replace('{width}', '1280')
      .replace('{height}', '720');

    return jsonResponse(200, {
      live: true,
      login: user.login,
      displayName: user.display_name,
      title: stream.title,
      game: stream.game_name,
      viewerCount: stream.viewer_count,
      startedAt: stream.started_at,
      thumbnailUrl: thumbnail,
    });
  } catch (err) {
    const status = err.code === 'NOT_CONFIGURED' ? 501 : 502;
    return jsonResponse(status, {
      error: err.message,
      code: err.code || 'TWITCH_REQUEST_FAILED',
    });
  }
};
