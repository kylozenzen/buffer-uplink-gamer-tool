// netlify/functions/image.js
// Serves an uploaded image back out of Netlify Blobs at a stable
// public URL so Buffer's API can fetch it.

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  const key = event.queryStringParameters?.key;
  if (!key) return { statusCode: 400, body: 'Missing key' };

  try {
    const store = getStore('uplink-images');
    const blob = await store.get(key, { type: 'arrayBuffer' });
    if (!blob) return { statusCode: 404, body: 'Not found' };

    const meta = await store.getMetadata(key);
    const mimeType = meta?.metadata?.mimeType || 'application/octet-stream';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
      body: Buffer.from(blob).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 502, body: 'Could not load image: ' + err.message };
  }
};
