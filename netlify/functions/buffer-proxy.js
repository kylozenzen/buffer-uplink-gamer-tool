// buffer-proxy.js
//
// Stateless pass-through. app.js routes all Buffer requests through this
// function rather than calling https://api.buffer.com directly, since
// Buffer's CORS policy on that endpoint isn't documented anywhere and
// couldn't be confirmed. It does not read, log, store, or persist the
// Authorization header or the request body anywhere; every request is
// forwarded and the response is returned as-is.

const BUFFER_API_URL = 'https://api.buffer.com'; // confirmed: Buffer's GraphQL endpoint

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
