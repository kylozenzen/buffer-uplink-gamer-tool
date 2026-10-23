const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, deliveryState, summary } = require('../publishing');
const delivery = () => ({ channelId: 'channel-a', payload: { channelId: 'channel-a', text: 'original {{resolved}}', mode: 'shareNow', assets: [{ image: { url: 'https://example.org/image.png' } }] }, state: 'not_attempted', postId: '', retryEligible: false });
const success = (status, id = 'post-a') => ({ data: { createPost: { __typename: 'PostActionSuccess', post: { id, status } } } });

test('only published/sent confirm publication; modes and unknown states stay distinct', () => {
  for (const status of ['pending', 'published', 'queued', 'scheduled', 'draft', 'failed']) assert.equal(deliveryState(status), status);
  assert.equal(deliveryState('sent'), 'published'); // Existing Buffer queries use the sent lifecycle filter.
  for (const status of ['', 'accepted', 'new-enum']) assert.equal(deliveryState(status), 'unknown');
  assert.equal(summary([{ state: 'published' }, { state: 'unknown' }]), '1 published · 1 unresolved');
});

test('persist intent before network; creation accepted pending then reconciled published with backoff', async () => {
  const d = delivery(); const snapshots = []; const waits = []; let checks = 0;
  const engine = createEngine({ persist: () => snapshots.push(structuredClone(d)), sleep: async (ms) => waits.push(ms), request: async (query) => {
    if (query.startsWith('mutation')) { assert.equal(snapshots.at(-1).state, 'sending'); return success('pending'); }
    return { data: { post: { id: 'post-a', status: ++checks === 2 ? 'published' : 'pending' } } };
  } });
  await engine.create(d); assert.equal(d.state, 'pending'); assert.equal(d.postId, 'post-a');
  await engine.poll([d]); assert.equal(d.state, 'published'); assert.deepEqual(waits, [1500]);
});

test('partial failure retries only definite rejections with the immutable original payload', async () => {
  const a = delivery(), b = delivery(); b.payload.channelId = b.channelId = 'channel-b';
  const submissions = [];
  const engine = createEngine({ persist() {}, request: async (q, v) => {
    if (!q.startsWith('mutation')) return { data: { post: { id: 'post-a', status: 'published' } } };
    submissions.push(structuredClone(v.input));
    if (v.input.channelId === 'channel-b' && submissions.length === 2) return { data: { createPost: { __typename: 'MutationError', message: 'Rejected' } } };
    return success('published', v.input.channelId === 'channel-a' ? 'post-a' : 'post-b');
  } });
  await engine.create(a); await engine.create(b);
  assert.equal(b.retryEligible, true); const original = structuredClone(b.payload);
  await engine.retry([a, b]);
  assert.equal(submissions.length, 3); assert.deepEqual(submissions[2], original); assert.equal(a.attempts, 1); assert.equal(b.state, 'published');
});

test('timeout, network failure, and unknown response never automatically create again', async () => {
  for (const response of [new Error('timeout'), new Error('Cannot query field externalLink'), { data: {} }, success('pending', '')]) {
    const d = delivery(); let calls = 0;
    const engine = createEngine({ persist() {}, request: async () => { calls++; if (response instanceof Error) throw response; return response; } });
    await engine.create(d); assert.equal(d.state, 'unknown'); assert.equal(d.retryEligible, false);
    await engine.retry([d]); assert.equal(calls, 1);
  }
});

test('existing failed/unknown posts reconcile before recovery and are never recreated', async () => {
  for (const status of ['failed', 'new-status', 'scheduled', 'queued', 'draft']) {
    const d = delivery(); let mutations = 0;
    const engine = createEngine({ persist() {}, sleep: async () => {}, request: async (q) => {
      if (q.startsWith('mutation')) { mutations++; return success(status); }
      return { data: { post: { id: 'post-a', status: 'published' } } };
    } });
    await engine.create(d); await engine.retry([d]); assert.equal(d.state, 'published'); assert.equal(mutations, 1);
  }
});

test('bounded polling, lookup failures and reload keep unresolved IDs without retry eligibility', async () => {
  let d = delivery(); const waits = []; let checks = 0;
  const engine = createEngine({ persist() {}, sleep: async (ms) => waits.push(ms), request: async (q) => {
    if (q.startsWith('mutation')) return success('pending');
    checks++; throw new Error('lookup unavailable');
  } });
  await engine.create(d); await engine.poll([d]); assert.equal(checks, 4); assert.deepEqual(waits, [1500, 4000, 9000]);
  d = JSON.parse(JSON.stringify(d)); await engine.retry([d]); assert.equal(d.postId, 'post-a'); assert.equal(d.state, 'pending'); assert.equal(d.retryEligible, false);
});

test('failed durable storage prevents any network creation', async () => {
  let calls = 0; const engine = createEngine({ persist() { throw new Error('quota'); }, request: async () => { calls++; } });
  await assert.rejects(engine.create(delivery()), /quota/); assert.equal(calls, 0);
});

test('rejection backoff and caller mutation cannot alter sent bytes', async () => {
  const d = delivery(); let calls = 0;
  const engine = createEngine({ persist() {}, request: async (q, v) => { calls++; v.input.text = 'changed'; throw Object.assign(new Error('rate limit'), { outcome: 'rejected', retryAfter: 60 }); } });
  await engine.create(d); assert.equal(d.payload.text, 'original {{resolved}}'); await engine.retry([d]); assert.equal(calls, 1);
});

test('confirmed publication continues bounded permalink hydration without another creation', async () => {
  const d = delivery(); let mutations = 0;
  const engine = createEngine({ urlField: 'externalLink', persist() {}, sleep: async () => {}, request: async (q) => {
    if (q.startsWith('mutation')) { mutations++; return success('sent'); }
    return { data: { post: { id: 'post-a', status: 'sent', externalLink: 'https://example.org/published' } } };
  } });
  await engine.create(d); assert.equal(d.state, 'published');
  await engine.poll([d]); assert.equal(d.url, 'https://example.org/published'); assert.equal(mutations, 1);
});
