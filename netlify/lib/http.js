function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: JSON.stringify(body) };
}

function siteOrigin() {
  const origin = process.env.UPLINK_PUBLIC_URL || process.env.DEPLOY_PRIME_URL || process.env.URL;
  if (!origin) throw Object.assign(new Error('Set UPLINK_PUBLIC_URL to this deployment’s HTTPS address.'), { status: 501 });
  const url = new URL(origin);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Uplink requires an HTTPS public URL.');
  return url.origin;
}

function requireOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  if (!origin || origin !== siteOrigin()) throw Object.assign(new Error('Open Uplink on this deployment to perform this action.'), { status: 403 });
}

function bodyJson(event) {
  if (String(event.body || '').length > 24000) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  try { return JSON.parse(event.body || '{}'); } catch { throw Object.assign(new Error('Invalid JSON request.'), { status: 400 }); }
}

function failure(error) {
  const status = [400, 401, 403, 404, 405, 409, 413, 415, 429, 501].includes(error.status) ? error.status : 502;
  return json(status, { error: error.name === 'TimeoutError' ? 'The request timed out. Try again in a moment.' : error.message || 'The request failed.' });
}

module.exports = { json, siteOrigin, requireOrigin, bodyJson, failure };
