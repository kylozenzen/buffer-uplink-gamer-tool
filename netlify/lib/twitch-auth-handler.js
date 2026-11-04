const crypto = require('node:crypto');
const { json, siteOrigin, requireOrigin, failure } = require('./http');
const { requestJson } = require('./twitch');
const { cloudinaryConfigured } = require('./video-storage');
const { SESSION_COOKIE, STATE_COOKIE, SESSION_AGE, cookies, cookie, seal, unseal, privateStore, saveSession, getSession, validateSession } = require('./twitch-session');

function redirect(location, setCookies = []) {
  return { statusCode: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }, multiValueHeaders: { 'Set-Cookie': setCookies }, body: '' };
}

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const configured = Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
    const action = params.action || (params.code || params.error ? 'callback' : 'status');
    if (action === 'status' && event.httpMethod === 'GET') {
      if (!configured) return json(200, { configured: false, connected: false });
      let session;
      try { session = await getSession(event); } catch (error) { if (error.status === 401) return json(200, { configured: true, connected: false }); throw error; }
      try { await validateSession(session); } catch (error) { if (error.status === 401) return json(200, { configured: true, connected: false, error: 'Reconnect Twitch to import videos.' }); throw error; }
      return json(200, { configured: true, connected: true, maxVideoMB: cloudinaryConfigured() ? 100 : 18, user: { id: session.record.userId, login: session.record.login, name: session.record.name }, canDownload: session.record.scopes.some(scope => ['channel:manage:clips', 'editor:manage:clips'].includes(scope)) });
    }
    if (action === 'disconnect' && event.httpMethod === 'POST') {
      requireOrigin(event);
      let session;
      try { session = await getSession(event); } catch (error) { if (error.status !== 401) throw error; }
      if (session) {
        // Best-effort revoke, always remove our stored access and refresh tokens.
        await fetch('https://id.twitch.tv/oauth2/revoke', { method: 'POST', body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, token: session.record.accessToken }), signal: AbortSignal.timeout(8000) }).catch(() => {});
        await privateStore().delete(`sessions/${session.id}`);
      }
      return { ...json(200, { connected: false }), multiValueHeaders: { 'Set-Cookie': [cookie(SESSION_COOKIE, '', 0)] } };
    }
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });
    if (!configured) return json(501, { error: 'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET on this deployment first.' });
    const origin = siteOrigin();
    const callbackUrl = `${origin}/.netlify/functions/twitch-auth`;
    if (action === 'start') {
      const nonce = crypto.randomBytes(32).toString('hex');
      const state = seal({ nonce, expiresAt: Date.now() + 600000 });
      const query = new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, redirect_uri: callbackUrl, response_type: 'code', scope: 'channel:manage:clips editor:manage:clips', state: nonce, force_verify: 'true' });
      return redirect(`https://id.twitch.tv/oauth2/authorize?${query}`, [cookie(STATE_COOKIE, state, 600)]);
    }
    if (action !== 'callback') return json(400, { error: 'Unknown Twitch connection action.' });
    let saved;
    try { saved = unseal(cookies(event)[STATE_COOKIE]); } catch { saved = null; }
    if (!saved || saved.expiresAt < Date.now() || !/^[a-f0-9]{64}$/.test(params.state || '') || !crypto.timingSafeEqual(Buffer.from(params.state), Buffer.from(saved.nonce))) {
      return json(403, { error: 'Twitch connection expired or could not be verified. Return to Uplink and connect again.' });
    }
    if (params.error) return redirect(`${origin}/?twitch=cancelled#clips`, [cookie(STATE_COOKIE, '', 0)]);
    try {
      const tokens = await requestJson('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, code: params.code, grant_type: 'authorization_code', redirect_uri: callbackUrl }) });
      const identity = await requestJson('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${tokens.access_token}` } });
      if (identity.client_id !== process.env.TWITCH_CLIENT_ID || !identity.user_id) throw new Error('Twitch could not verify this connection.');
      const userData = await requestJson('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${tokens.access_token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID } });
      const user = userData.data?.[0];
      if (!user || user.id !== identity.user_id) throw new Error('Twitch could not verify your account.');
      const id = crypto.randomBytes(32).toString('hex');
      await saveSession(id, { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000, validUntil: Date.now() + SESSION_AGE * 1000, lastValidated: Date.now(), userId: user.id, login: user.login, name: user.display_name, scopes: identity.scopes || [] });
      const oldId = cookies(event)[SESSION_COOKIE];
      if (/^[a-f0-9]{64}$/.test(oldId || '')) await privateStore().delete(`sessions/${oldId}`);
      return redirect(`${origin}/?twitch=connected#clips`, [cookie(SESSION_COOKIE, id), cookie(STATE_COOKIE, '', 0)]);
    } catch {
      return redirect(`${origin}/?twitch=failed#clips`, [cookie(STATE_COOKIE, '', 0)]);
    }
  } catch (error) { return failure(error); }
};
