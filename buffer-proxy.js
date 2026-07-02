// buffer-proxy.js
//
// Stateless pass-through. This function exists ONLY to get around
// browser CORS restrictions on Buffer's API — it does not read,
// log, store, or persist the Authorization header or the request
// body anywhere. Every request is forwarded and the response is
// returned as-is.
//
// TODO(Ben): confirm this is actually the endpoint + auth shape
// your Buffer token works against — swap BUFFER_API_URL and the
// header format to match what you've already verified in PostIQ.

const BUFFER_API_URL = 'https://api.buffer.com'; // GraphQL endpoint — verify

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization header' }) };
  }

  try {
    const res = await fetch(BUFFER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: event.body,
    });

    const text = await res.text();

    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (err) {
    // Intentionally no logging of request contents — only the error message.
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Could not reach Buffer', detail: err.message }),
    };
  }
};
