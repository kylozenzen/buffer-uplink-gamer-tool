/* Durable delivery state machine. No create mutation is retried automatically. */
(function (root) {
  'use strict';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function deliveryState(status) {
    const value = String(status || '').toLowerCase();
    return ({ published: 'published', sent: 'published', pending: 'pending', processing: 'pending', publishing: 'pending', queued: 'queued', scheduled: 'scheduled', draft: 'draft', failed: 'failed', error: 'failed' })[value] || 'unknown';
  }
  function applyPost(delivery, post, urlField) {
    if (!post || !post.id || (delivery.postId && delivery.postId !== post.id)) return false;
    delivery.postId = post.id;
    delivery.status = post.status || '';
    delivery.state = deliveryState(post.status);
    delivery.url = typeof post[urlField] === 'string' ? post[urlField] : delivery.url || '';
    delivery.retryEligible = false; // Existing posts must be managed in Buffer, never recreated.
    delivery.error = delivery.state === 'failed' ? { message: 'Buffer reports this existing post failed. Review its error in Buffer.', outcome: 'failed' } : null;
    delivery.reconciliationError = null;
    delivery.updatedAt = Date.now();
    return true;
  }
  function summary(deliveries) {
    const counts = {};
    deliveries.forEach((d) => { counts[d.state] = (counts[d.state] || 0) + 1; });
    return Object.entries(counts).map(([state, count]) => `${count} ${state === 'unknown' ? 'unresolved' : state === 'sending' ? 'awaiting response' : state}`).join(' · ');
  }
  function createEngine({ request, persist, urlField = '', sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    const selection = `id status${urlField ? ` ${urlField}` : ''}`;
    async function create(delivery) {
      // Persist the intent before crossing the network boundary. A crash is ambiguous.
      delivery.state = 'sending';
      delivery.retryEligible = false;
      delivery.error = null;
      delivery.attemptedAt = Date.now();
      delivery.attempts = (delivery.attempts || 0) + 1;
      persist();
      try {
        const response = await request(`mutation CreatePost($input:CreatePostInput!){createPost(input:$input){__typename ... on PostActionSuccess{post{${selection}}} ... on MutationError{message}}}`, { input: clone(delivery.payload) });
        const result = response?.data?.createPost;
        if (result?.__typename === 'MutationError') {
          delivery.state = 'failed';
          delivery.retryEligible = true;
          delivery.error = { message: result.message || 'Buffer rejected this post.', outcome: 'rejected' };
        } else if (result?.__typename !== 'PostActionSuccess' || !applyPost(delivery, result.post, urlField)) {
          throw new Error('Buffer did not return an identifiable post. Check Buffer before sending again.');
        }
      } catch (error) {
        const rejected = error.outcome === 'rejected';
        delivery.state = rejected ? 'failed' : 'unknown';
        delivery.retryEligible = rejected;
        delivery.error = { message: error.message || 'The response was interrupted.', code: error.code || '', outcome: rejected ? 'rejected' : 'uncertain', retryAfter: error.retryAfter || null };
        delivery.retryAfterAt = error.retryAfter ? Date.now() + error.retryAfter * 1000 : 0;
      }
      persist();
    }
    async function reconcile(delivery) {
      if (!delivery.postId) return;
      try {
        const response = await request(`query GetPost($input:PostInput!){post(input:$input){${selection}}}`, { input: { id: delivery.postId } });
        if (!applyPost(delivery, response?.data?.post, urlField)) throw new Error('Post status unavailable; review this post in Buffer.');
      } catch (error) {
        delivery.reconciliationError = error.message || 'Unable to check Buffer.';
        // A failed lookup is never proof that creation failed.
      }
      delivery.lastCheckedAt = Date.now();
      persist();
    }
    async function poll(deliveries, delays = [0, 1500, 4000, 9000]) {
      for (const delay of delays) {
        const pending = deliveries.filter((d) => d.postId && (d.state === 'published' ? Boolean(urlField && !d.url) : !['draft', 'failed'].includes(d.state)));
        if (!pending.length) break;
        if (delay) await sleep(delay);
        await Promise.all(pending.map(reconcile));
      }
    }
    async function retry(deliveries) {
      // Reconcile known IDs. Neither a successful nor an ambiguous delivery
      // becomes eligible merely because a status query failed.
      for (const delivery of deliveries) {
        if (delivery.postId) { await reconcile(delivery); continue; }
        if (delivery.state === 'failed' && delivery.retryEligible && (!delivery.retryAfterAt || delivery.retryAfterAt <= Date.now())) await create(delivery);
      }
    }
    return { create, reconcile, poll, retry };
  }
  const api = { deliveryState, applyPost, summary, createEngine };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UplinkPublishing = api;
})(typeof globalThis === 'object' ? globalThis : this);
