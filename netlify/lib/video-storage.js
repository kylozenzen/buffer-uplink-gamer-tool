const crypto = require('node:crypto');

function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

async function uploadRemoteVideo(downloadUrl) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!/^[A-Za-z0-9_-]+$/.test(cloud || '')) throw new Error('Cloudinary is not configured correctly.');
  const publicId = `uplink/${crypto.randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHash('sha256').update(`public_id=${publicId}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`).digest('hex');
  const form = new FormData();
  for (const [name, value] of Object.entries({ file: downloadUrl, public_id: publicId, timestamp, signature, api_key: process.env.CLOUDINARY_API_KEY })) form.set(name, value);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/video/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(40000), redirect: 'error' });
  let result;
  try { result = await response.json(); } catch { throw new Error('Video hosting did not confirm the import. Try again later.'); }
  if (!response.ok || result.resource_type !== 'video' || !result.secure_url?.startsWith(`https://res.cloudinary.com/${cloud}/video/upload/`)) {
    throw new Error('Video hosting could not import this clip. Check the Cloudinary configuration, file limits, and quota.');
  }
  return { url: result.secure_url, provider: 'cloudinary', publicId: result.public_id };
}

module.exports = { cloudinaryConfigured, uploadRemoteVideo };
