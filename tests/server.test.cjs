const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Stub the storage boundary, not Twitch/Discord's authorization decisions.
const stores = new Map();
function store(name) {
  if (typeof name === 'object') name = name.name;
  if (!stores.has(name)) stores.set(name, new Map());
  const data = stores.get(name);
  return {
    get: async (key, options) => { const value = data.get(key)?.value; return value == null ? null : options?.type === 'json' ? JSON.parse(value) : value; },
    set: async (key, value, options) => { data.set(key, { value, metadata: options?.metadata }); },
    setJSON: async (key, value) => { data.set(key, { value: JSON.stringify(value) }); },
    delete: async key => data.delete(key),
  };
}
const blobsPath = require.resolve('@netlify/blobs');
require(blobsPath);
require.cache[blobsPath].exports = { getStore: store };
process.env.TWITCH_CLIENT_ID = 'test-client';
process.env.TWITCH_CLIENT_SECRET = 'test-secret-not-a-real-credential';
process.env.UPLINK_PUBLIC_URL = 'https://uplink.example';

const discord = require('../netlify/functions/discord-announcement');
const clips = require('../netlify/functions/twitch-clips');
const auth = require('../netlify/lib/twitch-auth-handler');
const session = require('../netlify/lib/twitch-session');
const importer = require('../netlify/lib/clip-import-handler');
const { normalizeLogin } = require('../netlify/lib/twitch');
const event = (body, extra = {}) => ({ httpMethod: 'POST', headers: { origin: 'https://uplink.example' }, body: JSON.stringify(body), ...extra });
const parsed = result => JSON.parse(result.body);
const webhook = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456';

async function connectedSession() {
  const id = crypto.randomBytes(32).toString('hex');
  const record = { accessToken: 'test-access', refreshToken: 'test-refresh', userId: '11', login: 'ben', name: 'Ben', scopes: ['channel:manage:clips'], lastValidated: Date.now(), validUntil: Date.now() + 86400000 };
  await session.saveSession(id, record);
  return { id, record, headers: { origin: 'https://uplink.example', cookie: `${session.SESSION_COOKIE}=${id}` } };
}

test('webhook validation cannot turn the proxy into an arbitrary URL fetcher', async t => {
  const fetch = t.mock.method(global, 'fetch', async () => { throw new Error('Network must not be used'); });
  for (const value of ['http://127.0.0.1/private', 'https://discord.com.evil.example/api/webhooks/123/token', 'https://discord.com@evil.example/api/webhooks/123/token', 'https://discord.com:444/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456']) {
    assert.equal((await discord.handler(event({ webhook: value, content: 'Hello' }))).statusCode, 400);
  }
  assert.equal((await discord.handler(event({ webhook, content: 'Hello' }, { headers: { origin: 'https://evil.example' } }))).statusCode, 403);
  assert.equal(fetch.mock.callCount(), 0);
});

test('Discord explicitly permits only the chosen role; end-stream edits cannot ping roles', async t => {
  let payload;
  t.mock.method(global, 'fetch', async (url, options) => {
    payload = JSON.parse(options.body);
    assert.match(String(url), /^https:\/\/discord.com\/api\/v10\/webhooks\//);
    return Response.json({ id: '234567890123456789', channel_id: '345678901234567890', guild_id: '456789012345678901' });
  });
  const result = await discord.handler(event({ webhook, content: '@everyone We’re live!', roleId: '567890123456789012' }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(payload.allowed_mentions, { parse: [], roles: ['567890123456789012'] });
  assert.match(parsed(result).url, /456789012345678901\/345678901234567890\/234567890123456789$/);
  await discord.handler(event({ webhook, content: 'Stream ended', roleId: '567890123456789012', messageId: '234567890123456789' }));
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.content, 'Stream ended');
});

test('public clip lookup returns community clips without a streamer session', async t => {
  const requests = [];
  t.mock.method(global, 'fetch', async url => {
    requests.push(String(url));
    if (String(url).includes('/oauth2/token')) return Response.json({ access_token: 'app-token', expires_in: 3600 });
    if (String(url).includes('/users?')) return Response.json({ data: [{ id: '11', login: 'ben', display_name: 'Ben' }] });
    return Response.json({ data: [{ id: 'CommunityClip', broadcaster_id: '11', creator_id: '22', creator_name: 'ViewerOne', title: 'Nice play', privateField: 'omit' }], pagination: { cursor: 'next-page' } });
  });
  const result = await clips.handler({ httpMethod: 'GET', queryStringParameters: { login: 'https://twitch.tv/Ben', days: '7' } });
  assert.equal(result.statusCode, 200);
  assert.equal(parsed(result).clips[0].creator_name, 'ViewerOne');
  assert.equal(parsed(result).clips[0].privateField, undefined);
  assert.equal(parsed(result).nextCursor, 'next-page');
  assert.match(requests.at(-1), /broadcaster_id=11/);
  assert.equal(normalizeLogin('https://twitch.tv.evil.example/ben'), '');
});

test('OAuth validates state and keeps access/refresh tokens off the browser', async t => {
  const start = await auth.handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { action: 'start' } });
  const authorize = new URL(start.headers.Location);
  assert.equal(authorize.searchParams.get('redirect_uri'), 'https://uplink.example/.netlify/functions/twitch-auth');
  const stateCookie = start.multiValueHeaders['Set-Cookie'][0].split(';')[0];
  const invalid = await auth.handler({ httpMethod: 'GET', headers: { cookie: stateCookie }, queryStringParameters: { code: 'test-code', state: '0'.repeat(64) } });
  assert.equal(invalid.statusCode, 403);
  t.mock.method(global, 'fetch', async url => {
    if (String(url).includes('/oauth2/token')) return Response.json({ access_token: 'private-access-token', refresh_token: 'private-refresh-token', expires_in: 3600 });
    if (String(url).includes('/oauth2/validate')) return Response.json({ client_id: 'test-client', user_id: '11', scopes: ['channel:manage:clips'] });
    return Response.json({ data: [{ id: '11', login: 'ben', display_name: 'Ben' }] });
  });
  const callback = await auth.handler({ httpMethod: 'GET', headers: { cookie: stateCookie }, queryStringParameters: { code: 'test-code', state: authorize.searchParams.get('state') } });
  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.Location, 'https://uplink.example/?twitch=connected#clips');
  const cookie = callback.multiValueHeaders['Set-Cookie'][0];
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(JSON.stringify(callback), /private-(access|refresh)-token/);
  const status = await auth.handler({ httpMethod: 'GET', headers: { cookie: cookie.split(';')[0] }, queryStringParameters: { action: 'status' } });
  assert.equal(parsed(status).connected, true);
  assert.doesNotMatch(status.body, /private-(access|refresh)-token/);
  for (const { value } of stores.get('uplink-private').values()) assert.doesNotMatch(String(value), /private-(access|refresh)-token/);
});

test('native import rehosts the video and rechecks permission before reusing a copy', async t => {
  const owner = await connectedSession();
  let videoDownloads = 0; let allowed = true;
  const mp4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
  t.mock.method(global, 'fetch', async url => {
    if (String(url).includes('clips/downloads')) return allowed ? Response.json({ data: [{ landscape_download_url: 'https://production.assets.clips.twitchcdn.net/test.mp4' }] }) : Response.json({ message: 'Forbidden' }, { status: 403 });
    if (String(url).includes('/helix/clips?')) return Response.json({ data: [{ id: 'ImportClip', broadcaster_id: '11' }] });
    videoDownloads++; return new Response(mp4, { headers: { 'Content-Type': 'video/mp4' } });
  });
  const request = event({ clipId: 'ImportClip', orientation: 'landscape' }, { headers: owner.headers });
  const first = await importer.handler(request);
  assert.equal(first.statusCode, 200);
  assert.match(parsed(first).url, /^https:\/\/uplink.example\/\.netlify\/functions\/clip-media\?key=[a-f0-9-]+\.mp4$/);
  assert.equal(stores.get('uplink-videos').size, 1);
  const second = await importer.handler(request);
  assert.equal(parsed(second).url, parsed(first).url);
  assert.equal(videoDownloads, 1);
  allowed = false;
  assert.equal((await importer.handler(request)).statusCode, 403);
});

test('missing portrait files, oversized videos, and untrusted URLs produce actionable failures', async t => {
  const owner = await connectedSession();
  t.mock.method(global, 'fetch', async url => String(url).includes('clips/downloads') ? Response.json({ data: [{ portrait_download_url: null }] }) : Response.json({ data: [{ id: 'PortraitClip', broadcaster_id: '11' }] }));
  const result = await importer.handler(event({ clipId: 'PortraitClip', orientation: 'portrait' }, { headers: owner.headers }));
  assert.equal(result.statusCode, 409);
  assert.match(parsed(result).error, /no portrait version/);
  await assert.rejects(importer.readVideo(new Response('tiny', { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(19 * 1024 * 1024) } })), /18 MB/);
  assert.throws(() => importer.trustedDownloadUrl('https://twitchcdn.net.evil.example/video.mp4'), /unsupported/);
  assert.throws(() => importer.trustedDownloadUrl('http://127.0.0.1/video.mp4'), /unsupported/);
});

test('expired Twitch access tokens refresh once and retry the failed API call', async t => {
  const owner = await connectedSession(); let calls = 0;
  t.mock.method(global, 'fetch', async url => {
    if (String(url).includes('/oauth2/token')) return Response.json({ access_token: 'refreshed-access', refresh_token: 'rotated-refresh', expires_in: 3600 });
    calls++; return calls === 1 ? Response.json({ message: 'Expired' }, { status: 401 }) : Response.json({ data: [] });
  });
  await session.userGet(owner, 'clips?id=OneClip');
  assert.equal(calls, 2);
  assert.equal(owner.record.accessToken, 'refreshed-access');
  assert.equal(owner.record.refreshToken, 'rotated-refresh');
});

test('modern adapter preserves separate HttpOnly cookies', async () => {
  const { handle } = await import('../netlify/lib/modern-handler.mjs');
  const response = await handle(new Request('https://uplink.example/callback'), async () => ({ statusCode: 302, headers: { Location: '/' }, multiValueHeaders: { 'Set-Cookie': ['one=a; HttpOnly', 'two=b; HttpOnly'] }, body: '' }));
  assert.deepEqual(response.headers.getSetCookie(), ['one=a; HttpOnly', 'two=b; HttpOnly']);
});

test('optional Cloudinary hosting uses a signed server-side import and returns a stable file URL', async t => {
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'; process.env.CLOUDINARY_API_KEY = 'test-api-key'; process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
  t.after(() => { delete process.env.CLOUDINARY_CLOUD_NAME; delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET; });
  const { uploadRemoteVideo } = require('../netlify/lib/video-storage');
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://api.cloudinary.com/v1_1/test-cloud/video/upload');
    assert.match(options.body.get('file'), /^https:\/\/production.assets.clips.twitchcdn.net\//);
    assert.equal(options.body.get('api_secret'), null);
    const expected = crypto.createHash('sha256').update(`public_id=${options.body.get('public_id')}&timestamp=${options.body.get('timestamp')}test-api-secret`).digest('hex');
    assert.equal(options.body.get('signature'), expected);
    return Response.json({ resource_type: 'video', secure_url: 'https://res.cloudinary.com/test-cloud/video/upload/v1/clip.mp4', public_id: 'uplink/test' });
  });
  const result = await uploadRemoteVideo('https://production.assets.clips.twitchcdn.net/clip.mp4');
  assert.equal(result.url, 'https://res.cloudinary.com/test-cloud/video/upload/v1/clip.mp4');
});
