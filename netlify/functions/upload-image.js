// netlify/functions/upload-image.js
//
// Buffer's API only accepts a public image URL — it doesn't take raw
// file uploads. So a "photo" a streamer picks in Uplink has to land
// somewhere public first. This stores it in Netlify Blobs (same
// pattern as Stamp/Mise) and hands back a URL Buffer can fetch.
//
// Accepts: POST with JSON body { filename, dataUrl }
// where dataUrl is a base64 data URL (e.g. "data:image/png;base64,...")
// from a <input type="file"> read via FileReader in the browser.

const { getStore } = require('@netlify/blobs');

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { dataUrl, filename } = payload;
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Expected a base64 image data URL' }) };
  }

  const [, mimeType, base64] = match;
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return { statusCode: 415, headers: corsHeaders(), body: JSON.stringify({ error: `Unsupported image type: ${mimeType}` }) };
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_BYTES) {
    return { statusCode: 413, headers: corsHeaders(), body: JSON.stringify({ error: 'Image too large (8MB max)' }) };
  }

  try {
    const store = getStore('uplink-images');
    const ext = mimeType.split('/')[1].replace('+xml', '');
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await store.set(key, buffer, { metadata: { mimeType, filename: filename || key } });

    // Netlify Blobs served via a public getter function — see
    // netlify/functions/image.js, which streams the blob back out.
    const siteUrl = process.env.URL || `https://${event.headers.host}`;
    const publicUrl = `${siteUrl}/.netlify/functions/image?key=${encodeURIComponent(key)}`;

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ url: publicUrl, key }) };
  } catch (err) {
    return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: 'Upload failed: ' + err.message }) };
  }
};
