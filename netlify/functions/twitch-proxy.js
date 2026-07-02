// netlify/functions/twitch-proxy.js
//
// Uses Twitch's "app access token" (client credentials grant) — ONE
// client_id/client_secret that YOU register at dev.twitch.tv, shared
// across every Uplink user. Nobody who uses Uplink needs their own
// Twitch OAuth — this only reads public stream data (live status,
// title, game, viewer count, thumbnail), which the client-credentials
// flow is allowed to access without a per-user login.
//
// Required Netlify environment variables (Site settings > Environment
// variables — never hardcode these):
//   TWITCH_CLIENT_ID
//   TWITCH_CLIENT_SECRET
//
// The app access token is cached in memory for the life of the
// function instance and refreshed automatically when it's close to
// expiring (Twitch tokens from this flow last ~58 days).

let cachedToken = null; // { token, expiresAt }

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

async function getAppAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
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
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function twitchGet(path, clientId, token) {
  const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Twitch request failed (${res.status})`);
  return data;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };

  const login = (event.queryStringParameters?.login || '').trim().toLowerCase();
  if (!login) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing ?login=<twitch username>' }) };
  }

  try {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const token = await getAppAccessToken();

    const streams = await twitchGet(`streams?user_login=${encodeURIComponent(login)}`, clientId, token);
    const stream = streams?.data?.[0] || null;

    if (!stream) {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ live: false }) };
    }

    const thumbnail = (stream.thumbnail_url || '')
      .replace('{width}', '1280')
      .replace('{height}', '720');

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        live: true,
        title: stream.title,
        game: stream.game_name,
        viewerCount: stream.viewer_count,
        startedAt: stream.started_at,
        thumbnailUrl: thumbnail,
      }),
    };
  } catch (err) {
    const status = err.code === 'NOT_CONFIGURED' ? 501 : 502;
    return { statusCode: status, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) };
  }
};
