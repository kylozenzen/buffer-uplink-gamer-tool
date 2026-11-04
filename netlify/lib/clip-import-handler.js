const crypto = require('node:crypto');
const { getStore } = require('@netlify/blobs');
const { json, siteOrigin, requireOrigin, bodyJson, failure } = require('./http');
const { getSession, userGet, validateSession, privateStore } = require('./twitch-session');
const { cloudinaryConfigured, uploadRemoteVideo } = require('./video-storage');

// Netlify streaming responses have a 20 MB ceiling. Stay below it.
const MAX_VIDEO_BYTES = 18 * 1024 * 1024;

function trustedDownloadUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !['twitchcdn.net', 'twitch.tv'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error('Twitch returned an unsupported video download URL.');
  return url.href;
}

async function readVideo(response) {
  if (!response.ok) throw new Error('Twitch could not provide this video. Try again after processing finishes.');
  const type = response.headers.get('content-type')?.split(';')[0] || '';
  if (!['video/mp4', 'application/octet-stream', 'binary/octet-stream'].includes(type)) throw Object.assign(new Error('Twitch returned an unsupported video format.'), { status: 415 });
  if (Number(response.headers.get('content-length')) > MAX_VIDEO_BYTES) throw Object.assign(new Error('This clip exceeds this deployment’s 18 MB limit. Choose a shorter clip or save it as an Idea.'), { status: 413 });
  if (!response.body) throw new Error('The clip video is not ready yet.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_VIDEO_BYTES) throw Object.assign(new Error('This clip exceeds this deployment’s 18 MB limit. Choose a shorter clip or save it as an Idea.'), { status: 413 });
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (size < 12) throw new Error('The clip video is not ready yet.');
  const video = Buffer.concat(chunks, size);
  if (video.toString('ascii', 4, 8) !== 'ftyp') throw Object.assign(new Error('Twitch did not return a valid MP4 file.'), { status: 415 });
  return video;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    requireOrigin(event);
    const data = bodyJson(event);
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(data.clipId || '')) return json(400, { error: 'Invalid Twitch clip.' });
    const orientation = data.orientation || 'landscape';
    if (!['landscape', 'portrait'].includes(orientation)) return json(400, { error: 'Choose landscape or portrait.' });
    const session = await getSession(event);
    await validateSession(session);
    // Resolve ownership from Twitch, never from a caller-supplied broadcaster ID.
    const found = await userGet(session, `clips?id=${encodeURIComponent(data.clipId)}`);
    const clip = found.data?.[0];
    if (!clip) return json(404, { error: 'This clip is unavailable or has been deleted.' });
    const query = new URLSearchParams({ broadcaster_id: clip.broadcaster_id, editor_id: session.record.userId, clip_id: clip.id });
    // Twitch checks broadcaster/editor permissions even when a cached import exists.
    const downloads = await userGet(session, `clips/downloads?${query}`);
    const downloadUrl = downloads.data?.[0]?.[`${orientation}_download_url`];
    if (!downloadUrl) return json(409, { error: orientation === 'portrait' ? 'This clip has no portrait version yet. Create one in Twitch or choose landscape.' : 'This clip is still processing or has no downloadable video yet.' });
    const recordKey = `imports/${session.record.userId}/${clip.id}/${orientation}`;
    const previous = await privateStore().get(recordKey, { type: 'json' });
    if (previous?.url) return json(200, { url: previous.url, clipId: clip.id, orientation, reused: true });
    if (previous?.key) return json(200, { url: `${siteOrigin()}/.netlify/functions/clip-media?key=${previous.key}`, clipId: clip.id, orientation, reused: true });
    if (cloudinaryConfigured()) {
      const hosted = await uploadRemoteVideo(trustedDownloadUrl(downloadUrl));
      await privateStore().setJSON(recordKey, { ...hosted, importedAt: new Date().toISOString() });
      return json(200, { url: hosted.url, clipId: clip.id, orientation });
    }
    const response = await fetch(trustedDownloadUrl(downloadUrl), { signal: AbortSignal.timeout(25000), redirect: 'error' });
    const video = await readVideo(response);
    const key = `${crypto.randomUUID()}.mp4`;
    await getStore('uplink-videos').set(key, video, { metadata: { mimeType: 'video/mp4', size: video.length, clipId: clip.id, broadcasterId: clip.broadcaster_id, orientation, createdAt: new Date().toISOString() } });
    await privateStore().setJSON(recordKey, { key, importedAt: new Date().toISOString() });
    return json(200, { url: `${siteOrigin()}/.netlify/functions/clip-media?key=${key}`, clipId: clip.id, orientation });
  } catch (error) { return failure(error); }
};

exports.trustedDownloadUrl = trustedDownloadUrl;
exports.readVideo = readVideo;
