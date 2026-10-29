// Development preview only. /qa/deck seeds synthetic data and mocks network
// actions in the browser. No Twitch, Buffer, or Discord requests are sent.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);

function seedDeck() {
  const channels = [{ id: 'bsky', displayName: 'Ben on Bluesky', service: 'bluesky' }, { id: 'youtube', displayName: 'Ben on YouTube', service: 'youtube' }];
  const seed = { uplink_buffer_key: 'qa-only-no-access', uplink_org_id: 'qa-org', uplink_channels: JSON.stringify(channels), uplink_selected_channels: JSON.stringify(['bsky', 'youtube']), uplink_twitch_login: 'ben', uplink_stream_link: 'https://twitch.tv/ben', uplink_onboarding_complete: 'true', uplink_post_url_field: 'externalLink', uplink_v5_discord: JSON.stringify({ webhook: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456', roleId: '', copy: 'We’re live! {{title}}\n{{link}}', armed: true }) };
  for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  window.__qaRequests = [];
  const nativeFetch = window.fetch;
  window.fetch = async (input, options = {}) => {
    const url = String(input);
    if (!url.includes('/.netlify/functions/')) return nativeFetch(input, options);
    const data = options.body ? JSON.parse(options.body) : {};
    window.__qaRequests.push({ url, data });
    if (url.includes('twitch-auth')) return Response.json({ configured: true, connected: !url.includes('disconnect'), canDownload: true, maxVideoMB: 18, user: { id: '11', login: 'ben', name: 'Ben' } });
    if (url.includes('twitch-proxy')) return Response.json({ live: true, login: 'ben', title: 'One more game. Famous last words.', game: 'Overwatch', viewerCount: 42, startedAt: new Date(Date.now() - 3600000).toISOString(), thumbnailUrl: `${location.origin}/qa/thumb.svg` });
    if (url.includes('twitch-clips')) return Response.json({ clips: [
      { id: 'CommunityClutch', title: 'The comeback nobody ordered', creator_name: 'ViewerOne', creator_id: '22', broadcaster_id: '11', url: 'https://clips.twitch.tv/CommunityClutch', thumbnail_url: `${location.origin}/qa/thumb.svg?1`, duration: 25, view_count: 142, created_at: new Date(Date.now() - 120000).toISOString() },
      { id: 'StreamerMoment', title: 'That absolutely counted as a strategy', creator_name: 'Ben', creator_id: '11', broadcaster_id: '11', url: 'https://clips.twitch.tv/StreamerMoment', thumbnail_url: `${location.origin}/qa/thumb.svg?2`, duration: 19, view_count: 82, created_at: new Date(Date.now() - 240000).toISOString() },
      { id: 'OneMoreGame', title: 'One more game. Famous last words.', creator_name: 'ChatRegular', creator_id: '33', broadcaster_id: '11', url: 'https://clips.twitch.tv/OneMoreGame', thumbnail_url: `${location.origin}/qa/thumb.svg?3`, duration: 35, view_count: 36, created_at: new Date(Date.now() - 360000).toISOString() },
    ], channel: { id: '11', login: 'ben', name: 'Ben' }, fetchedAt: new Date().toISOString(), until: new Date().toISOString(), nextCursor: '' });
    if (url.includes('clip-import')) return Response.json({ url: `https://example.com/qa-${data.clipId}.mp4` });
    if (url.includes('discord-announcement')) return Response.json({ id: '234567890123456789', webhookId: '123456789012345678', channelId: '345678901234567890', url: 'https://discord.com/' });
    if (url.includes('buffer-proxy')) {
      if (data.query.includes('createIdea')) return Response.json({ data: { createIdea: { __typename: 'Idea', id: `qa-idea-${Date.now()}` } } });
      if (data.query.includes('createPost')) return Response.json({ data: { createPost: { __typename: 'PostActionSuccess', post: { id: `qa-post-${Date.now()}`, status: data.variables.input.saveToDraft ? 'draft' : 'buffer', externalLink: 'https://example.com/qa-post' } } } });
      return Response.json({ data: { __type: { fields: [{ name: 'externalLink' }] } } });
    }
    return Response.json({ error: 'Unsupported QA action.' }, { status: 400 });
  };
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#163c44"/><stop offset=".5" stop-color="#263b69"/><stop offset="1" stop-color="#502c59"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><path d="M0 290L150 170 240 240 360 120 640 260V360H0" fill="#080f20" opacity=".6"/><path d="M0 320H640M80 0V360M320 0V360M560 0V360" stroke="#74f6d4" opacity=".1"/><circle cx="320" cy="170" r="46" fill="#101927" stroke="#74f6d4" stroke-opacity=".4"/><path d="M309 149L341 170 309 191Z" fill="#74f6d4"/><text x="22" y="32" fill="#b4ccc8" font-family="monospace" font-size="12">UPLINK // PREVIEW FIXTURE</text></svg>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/.netlify/functions/')) {
    const result = url.pathname.endsWith('twitch-auth') ? { configured: false, connected: false } : { error: 'This is a static preview. Use /qa/deck for synthetic workflow QA, or Netlify Dev for real functions.' };
    res.writeHead(url.pathname.endsWith('twitch-auth') ? 200 : 501, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); return;
  }
  if (url.pathname === '/qa/mobile') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html><head><title>Uplink mobile QA</title></head><body style="margin:0;background:#05080d;display:grid;place-items:center;min-height:100vh"><iframe title="Mobile Uplink preview" src="/qa/deck#clips" style="width:390px;height:844px;border:1px solid #29364a;border-radius:15px"></iframe></body></html>'); return; }
  if (url.pathname === '/qa/thumb.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(svg); return; }
  if (url.pathname === '/qa/deck') {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<head>', '<head><base href="/">').replace('<script src="app.js">', `<script>(${seedDeck.toString()})();</script><script src="app.js">`);
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return;
  }
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { res.writeHead(400); res.end(); return; }
  if (!file.startsWith(root + path.sep) || /\/(?:\.git|node_modules|netlify|tests)\//.test(file.slice(root.length))) { res.writeHead(403); res.end(); return; }
  try {
    const content = fs.readFileSync(file);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '0.0.0.0', () => console.log(`Uplink development preview: http://localhost:${port}`));
