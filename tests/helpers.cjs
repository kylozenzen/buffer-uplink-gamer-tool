const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const root = path.resolve(__dirname, '..');
const channels = [
  { id: 'bsky', displayName: 'Ben on Bluesky', service: 'bluesky', externalLink: 'https://bsky.app/' },
  { id: 'youtube', displayName: 'Ben on YouTube', service: 'youtube', externalLink: 'https://youtube.com/' },
];

function fixtureClips() {
  return [
    { id: 'CommunityClutch', title: 'The comeback nobody ordered', creator_name: 'ViewerOne', creator_id: '22', broadcaster_id: '11', broadcaster_name: 'Ben', url: 'https://clips.twitch.tv/CommunityClutch', thumbnail_url: '', duration: 25, view_count: 42, created_at: new Date(Date.now() - 120000).toISOString() },
    { id: 'StreamerMoment', title: 'One more game. Famous last words.', creator_name: 'Ben', creator_id: '11', broadcaster_id: '11', broadcaster_name: 'Ben', url: 'https://clips.twitch.tv/StreamerMoment', thumbnail_url: '', duration: 19, view_count: 12, created_at: new Date(Date.now() - 240000).toISOString() },
  ];
}

function storage(seed) {
  const data = { ...seed };
  for (const [name, fn] of Object.entries({ getItem: key => Object.hasOwn(data, key) ? data[key] : null, setItem: (key, value) => { data[key] = String(value); }, removeItem: key => { delete data[key]; } })) Object.defineProperty(data, name, { value: fn, enumerable: false });
  return data;
}

async function loadApp({ connected = true, failChannel = '', discordArmed = false, customClips } = {}) {
  const { document, window: dom } = parseHTML(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
  let active = null;
  Object.defineProperty(document, 'activeElement', { get: () => active });
  dom.HTMLElement.prototype.focus = function () { active = this; };
  dom.HTMLElement.prototype.blur = function () { active = null; };
  dom.HTMLElement.prototype.scrollIntoView = function () {};
  const requests = [];
  const timers = new Set();
  const data = storage({
    uplink_buffer_key: 'qa-buffer-key', uplink_org_id: 'org-1', uplink_channels: JSON.stringify(channels), uplink_selected_channels: JSON.stringify(channels.map(channel => channel.id)),
    uplink_twitch_login: 'ben', uplink_stream_link: 'https://twitch.tv/ben', uplink_onboarding_complete: 'true', uplink_post_url_field: 'externalLink',
    ...(discordArmed ? { uplink_v5_discord: JSON.stringify({ webhook: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456', roleId: '', copy: 'Live now {{link}}', armed: true }) } : {}),
  });
  let failure = failChannel;
  const context = vm.createContext({ document, localStorage: data, Event: dom.Event, CustomEvent: dom.CustomEvent, HTMLElement: dom.HTMLElement,
    URL, URLSearchParams, AbortController, AbortSignal, Response, Headers, console, crypto: require('node:crypto').webcrypto,
    navigator: {}, innerWidth: 1280, innerHeight: 900, scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {} }),
    confirm: () => true, location: { hostname: 'uplink.test', origin: 'https://uplink.test', pathname: '/', search: '', hash: '', reload() {} }, history: { replaceState() {} },
    requestAnimationFrame: callback => callback(),
    setTimeout: (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref(); timers.add(timer); return timer; }, clearTimeout,
    setInterval: (callback, delay) => { const timer = setInterval(callback, delay); timer.unref(); timers.add(timer); return timer; }, clearInterval,
    fetch: async (url, options = {}) => {
      const input = String(url); const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ url: input, body });
      if (input.includes('buffer-proxy')) {
        if (body.query.includes('createIdea')) return Response.json({ data: { createIdea: { __typename: 'Idea', id: `idea-${requests.length}` } } });
        if (body.query.includes('createPost')) {
          if (body.variables.input.channelId === failure) return Response.json({ data: { createPost: { __typename: 'MutationError', message: 'This channel rejected the post.' } } });
          return Response.json({ data: { createPost: { __typename: 'PostActionSuccess', post: { id: `post-${requests.length}`, status: body.variables.input.saveToDraft ? 'draft' : 'buffer', externalLink: 'https://bsky.app/post/qa' } } } });
        }
        return Response.json({ data: { __type: { fields: [{ name: 'externalLink' }] } } });
      }
      if (input.includes('twitch-proxy')) return Response.json({ live: true, login: 'ben', game: 'Overwatch', title: 'One more game', viewerCount: 12, startedAt: new Date().toISOString(), thumbnailUrl: '' });
      if (input.includes('twitch-clips')) return Response.json({ clips: customClips || fixtureClips(), channel: { id: '11', login: 'ben', name: 'Ben' }, nextCursor: '', until: new Date().toISOString(), fetchedAt: new Date().toISOString() });
      if (input.includes('twitch-auth')) return Response.json({ configured: true, connected, canDownload: connected, user: connected ? { id: '11', login: 'ben', name: 'Ben' } : undefined });
      if (input.includes('clip-import')) return Response.json({ url: `https://uplink.test/media/${body.clipId}.mp4` });
      if (input.includes('discord-announcement')) return Response.json({ id: '234567890123456789', webhookId: '123456789012345678', channelId: '345678901234567890', url: 'https://discord.com/channels/456789012345678901/345678901234567890/234567890123456789' });
      throw new Error(`Unexpected test request: ${input}`);
    },
  });
  context.window = context;
  const dialog = document.getElementById('clipPreviewDialog');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new dom.Event('close')); };
  for (const script of ['app.js', 'v4.js', 'v5.js']) vm.runInContext(fs.readFileSync(path.join(root, script), 'utf8'), context, { filename: script });
  document.dispatchEvent(new dom.Event('DOMContentLoaded'));
  await settle();
  return { document, context, data, requests, setFailure: value => { failure = value; }, cleanup: () => { for (const timer of timers) { clearTimeout(timer); clearInterval(timer); } }, click: id => document.getElementById(id).click(),
    selectClip: id => { const input = document.querySelector(`[data-select-clip="${id}"]`); input.checked = true; input.dispatchEvent(new dom.Event('change', { bubbles: true })); },
  };
}

async function settle() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }

module.exports = { loadApp, settle, fixtureClips, channels };
