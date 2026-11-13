// config.js — per-deploy settings for Uplink's Buffer sign-in.
// The OAuth client id comes from the Netlify environment variable BUFFER_CLIENT_ID
// (served by /.netlify/functions/app-config). You can also hard-code it below as a fallback.
window.UPLINK_CONFIG = {
  prefix: 'uplink',
  BUFFER_CLIENT_ID: '',
  scope: 'posts:read posts:write account:read offline_access',
  tokenEndpoint: '/.netlify/functions/buffer-token',
};

function initUplinkBufferConnection() {
  const c = window.UPLINK_CONFIG;
  if (window.BufferConnection) window.BufferConnection.init({ prefix: c.prefix, clientId: c.BUFFER_CLIENT_ID, tokenEndpoint: c.tokenEndpoint, refreshSkewMs: 5 * 60 * 1000 });
}
initUplinkBufferConnection(); // usable right away for stored sessions; re-run once the client id arrives

// Resolves once the Netlify-provided settings are loaded (never rejects).
window.UPLINK_CONFIG_READY = fetch('/.netlify/functions/app-config')
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then((remote) => {
    if (remote && remote.bufferClientId) window.UPLINK_CONFIG.BUFFER_CLIENT_ID = remote.bufferClientId;
    initUplinkBufferConnection();
    return window.UPLINK_CONFIG;
  });
