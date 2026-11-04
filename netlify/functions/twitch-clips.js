const { normalizeLogin, publicGet, channelForLogin } = require('../lib/twitch');
const { json, failure } = require('../lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });
  try {
    const params = event.queryStringParameters || {};
    const login = normalizeLogin(params.login);
    if (!login) return json(400, { error: 'Link a valid Twitch channel in Systems first.' });
    const days = Number(params.days || 7);
    if (![1, 7, 30].includes(days)) return json(400, { error: 'Choose a 1, 7, or 30 day window.' });
    const now = Date.now();
    const cutoff = now - days * 86400000;
    const since = params.since ? Date.parse(params.since) : cutoff;
    const until = params.until ? Date.parse(params.until) : now;
    if (!Number.isFinite(since) || !Number.isFinite(until) || since > until || until > now + 60000) return json(400, { error: 'Invalid clip date window.' });
    const user = await channelForLogin(login);
    const query = new URLSearchParams({ broadcaster_id: user.id, first: '100', started_at: new Date(Math.max(cutoff, since)).toISOString(), ended_at: new Date(until).toISOString() });
    if (params.after) query.set('after', String(params.after).slice(0, 2048));
    const result = await publicGet(`clips?${query}`);
    const fields = ['id', 'title', 'url', 'thumbnail_url', 'creator_name', 'creator_id', 'broadcaster_id', 'broadcaster_name', 'created_at', 'duration', 'view_count', 'game_id', 'video_id', 'vod_offset', 'is_featured'];
    const clips = (result.data || []).map(clip => Object.fromEntries(fields.map(key => [key, clip[key]])));
    return json(200, { clips, channel: { id: user.id, login: user.login, name: user.display_name }, nextCursor: result.pagination?.cursor || '', until: new Date(until).toISOString(), fetchedAt: new Date(now).toISOString() });
  } catch (error) { return failure(error); }
};
