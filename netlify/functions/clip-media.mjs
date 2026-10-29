import { getStore } from '@netlify/blobs';

// Streaming avoids the buffered function response limit for video files.
export default async function (request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!/^[a-f0-9-]{36}\.mp4$/.test(key)) return new Response('Clip not found', { status: 404 });
  try {
    const store = getStore({ name: 'uplink-videos', consistency: 'strong' });
    const result = await store.getWithMetadata(key, { type: 'stream' });
    if (!result) return new Response('Clip not found', { status: 404 });
    const headers = { 'Content-Type': 'video/mp4', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Disposition': 'inline', 'Accept-Ranges': 'none' };
    if (result.metadata.size) headers['Content-Length'] = String(result.metadata.size);
    if (request.method === 'HEAD') { await result.data.cancel(); return new Response(null, { headers }); }
    return new Response(result.data, { headers });
  } catch { return new Response('Video temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
