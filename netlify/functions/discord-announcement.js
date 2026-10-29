const { json, bodyJson, requireOrigin, failure } = require('../lib/http');

function webhookParts(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw Object.assign(new Error('Enter a valid Discord webhook URL.'), { status: 400 }); }
  const match = /^\/api(?:\/v\d+)?\/webhooks\/(\d{15,22})\/([A-Za-z0-9_-]{20,200})\/?$/.exec(url.pathname);
  if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname) || url.port || url.username || url.password || !match) {
    throw Object.assign(new Error('Use an HTTPS webhook URL from Discord’s channel integrations.'), { status: 400 });
  }
  return { id: match[1], token: match[2] };
}

function announcementPayload(data) {
  const content = String(data.content || '').trim();
  const roleId = String(data.roleId || '');
  if (!content || content.length > 1900) throw Object.assign(new Error('Discord copy must contain 1–1900 characters.'), { status: 400 });
  if (roleId && !/^\d{15,22}$/.test(roleId)) throw Object.assign(new Error('Use a numeric Discord role ID, or leave it blank.'), { status: 400 });
  const editing = Boolean(data.messageId);
  const payload = { content: !editing && roleId ? `<@&${roleId}> ${content}` : content, allowed_mentions: !editing && roleId ? { parse: [], roles: [roleId] } : { parse: [] } };
  if (data.thumbnail && !editing) {
    try {
      const image = new URL(data.thumbnail);
      if (image.protocol === 'https:' && /(^|\.)jtvnw\.net$/.test(image.hostname)) payload.embeds = [{ image: { url: image.href } }];
    } catch { /* Image is optional. */ }
  }
  if (editing) payload.embeds = [];
  return payload;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    requireOrigin(event);
    const data = bodyJson(event);
    const webhook = webhookParts(data.webhook);
    if (data.messageId && !/^\d{15,22}$/.test(data.messageId)) return json(400, { error: 'Invalid Discord message.' });
    const payload = announcementPayload(data);
    const endpoint = `https://discord.com/api/v10/webhooks/${webhook.id}/${webhook.token}${data.messageId ? `/messages/${data.messageId}` : '?wait=true'}`;
    const response = await fetch(endpoint, { method: data.messageId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), redirect: 'error' });
    let result;
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) {
      if (response.status === 429) return json(429, { error: 'Discord is rate limiting this webhook. Wait before retrying.', retryAfter: result.retry_after });
      return json(response.status === 404 ? 404 : 502, { error: response.status === 404 ? 'That webhook or announcement no longer exists. Check Discord settings.' : 'Discord could not save the announcement. Check the webhook and channel permissions.' });
    }
    if (!result.id) return json(502, { error: 'Discord did not confirm the announcement. Check the channel before retrying.' });
    let guildId = result.guild_id;
    if (!guildId) {
      try {
        const info = await fetch(`https://discord.com/api/v10/webhooks/${webhook.id}/${webhook.token}`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
        if (info.ok) guildId = (await info.json()).guild_id;
      } catch { /* The announcement succeeded; its direct link is optional. */ }
    }
    const url = /^\d{15,22}$/.test(guildId || '') ? `https://discord.com/channels/${guildId}/${result.channel_id}/${result.id}` : '';
    return json(200, { id: result.id, webhookId: webhook.id, channelId: result.channel_id, url });
  } catch (error) { return failure(error); }
};

exports.webhookParts = webhookParts;
exports.announcementPayload = announcementPayload;
