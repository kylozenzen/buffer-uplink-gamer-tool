const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/buffer-proxy');
const event = { httpMethod: 'POST', body: JSON.stringify({ token: 'test-only', query: 'mutation { createPost }', variables: {} }) };

test('proxy classifies rejection vs uncertainty and calls upstream exactly once', async (t) => {
  for (const [status, outcome] of [[401, 'rejected'], [403, 'rejected'], [429, 'rejected'], [500, 'uncertain'], [503, 'uncertain']]) {
    await t.test(String(status), async () => {
      let calls = 0;
      t.mock.method(global, 'fetch', async () => { calls++; return new Response(JSON.stringify({ errors: [{ message: 'upstream' }] }), { status }); });
      const response = await handler(event);
      assert.equal(calls, 1); assert.equal(response.statusCode, status);
      assert.equal(JSON.parse(response.body).errors[0].outcome, outcome);
      t.mock.restoreAll();
    });
  }
});
test('timeout, network loss and non-JSON response are uncertain without automatic replay', async (t) => {
  for (const value of [Object.assign(new Error('timeout'), { name: 'AbortError' }), new Error('network lost'), new Response('bad gateway', { status: 502 })]) {
    let calls = 0;
    t.mock.method(global, 'fetch', async () => { calls++; if (value instanceof Error) throw value; return value; });
    const response = await handler(event); const error = JSON.parse(response.body).errors[0];
    assert.equal(calls, 1); assert.equal(error.outcome, 'uncertain'); assert.equal(error.retryable, false);
    t.mock.restoreAll();
  }
});
test('preflight rejection never reaches Buffer', async (t) => {
  let calls = 0; t.mock.method(global, 'fetch', async () => { calls++; });
  const response = await handler({ httpMethod: 'POST', body: '{}' });
  assert.equal(calls, 0); assert.equal(JSON.parse(response.body).errors[0].outcome, 'rejected');
});
