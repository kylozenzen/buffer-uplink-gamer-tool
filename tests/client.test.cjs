const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, settle } = require('./helpers.cjs');

test('community and creator clips load; Ideas work without a video connection', async t => {
  const app = await loadApp({ connected: false }); t.after(app.cleanup);
  app.document.querySelector('[data-tab="clips"]').click(); await settle();
  assert.equal(app.document.querySelectorAll('.clip-card').length, 2);
  assert.match(app.document.getElementById('clipsGrid').textContent, /Clipped by ViewerOne/);
  app.selectClip('CommunityClutch');
  assert.equal(app.document.getElementById('createClipDraftsBtn').disabled, true);
  assert.equal(app.document.getElementById('saveClipIdeasBtn').disabled, false);
  app.click('saveClipIdeasBtn'); await settle();
  const requests = app.requests.filter(request => request.body?.query.includes('createIdea'));
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.variables.input.content.text, /Clipped by ViewerOne/);
  assert.equal(requests[0].body.variables.input.content.media[0].type, 'link');
  app.click('saveClipIdeasBtn'); await settle();
  assert.equal(app.requests.filter(request => request.body?.query.includes('createIdea')).length, 1, 'Repeated selection must not create a duplicate Idea');
});

test('partial video failures retry only destinations that have not succeeded', async t => {
  const app = await loadApp({ failChannel: 'youtube' }); t.after(app.cleanup);
  app.document.querySelector('[data-tab="clips"]').click(); await settle();
  app.selectClip('CommunityClutch');
  app.click('createClipDraftsBtn'); await settle();
  let posts = app.requests.filter(request => request.body?.query?.includes('createPost'));
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.variables.input.saveToDraft, true);
  assert.match(posts[0].body.variables.input.assets[0].video.url, /CommunityClutch\.mp4/);
  assert.equal(posts[1].body.variables.input.metadata.youtube.categoryId, '20');
  assert.equal(posts[1].body.variables.input.metadata.youtube.privacy, 'public');
  app.setFailure(''); app.click('createClipDraftsBtn'); await settle();
  posts = app.requests.filter(request => request.body?.query?.includes('createPost'));
  assert.deepEqual(posts.map(request => request.body.variables.input.channelId), ['bsky', 'youtube', 'youtube']);
  assert.match(app.document.getElementById('clipsActionStatus').textContent, /Nothing published/);
});

test('Discord participates in Live now and stays out of Buffer draft mode', async t => {
  const app = await loadApp({ discordArmed: true }); t.after(app.cleanup);
  assert.equal(app.document.getElementById('discordArmBtn').getAttribute('aria-pressed'), 'true');
  app.document.querySelector('[data-v4-mode="draft"]').click();
  assert.equal(app.document.getElementById('discordArmBtn').getAttribute('aria-pressed'), 'false');
  app.click('sendBtn'); await settle();
  assert.equal(app.requests.filter(request => request.url.includes('discord-announcement')).length, 0);
  app.document.querySelector('[data-v4-mode="now"]').click();
  app.click('sendBtn'); await settle();
  const messages = app.requests.filter(request => request.url.includes('discord-announcement'));
  assert.equal(messages.length, 1);
  assert.match(messages[0].body.content, /https:\/\/twitch.tv\/ben/);
  assert.match(app.data.uplink_v5_last_discord, /234567890123456789/);
});

test('clip titles and creator names render as text, never executable HTML', async t => {
  const app = await loadApp({ customClips: [{ id: 'EvilTitle', title: '<img src=x onerror=alert(1)>', creator_name: '<script>bad()</script>', created_at: new Date().toISOString(), view_count: 1, duration: 10 }] }); t.after(app.cleanup);
  app.document.querySelector('[data-tab="clips"]').click(); await settle();
  assert.equal(app.document.querySelector('.clip-body h3 img'), null);
  assert.equal(app.document.querySelector('.clip-meta script'), null);
  assert.match(app.document.querySelector('.clip-body h3').textContent, /<img/);
});

test('launch keyboard shortcuts cannot publish while reviewing clips', async t => {
  const app = await loadApp({ discordArmed: true }); t.after(app.cleanup);
  app.document.querySelector('[data-tab="clips"]').click(); await settle();
  const event = new app.context.Event('keydown');
  Object.assign(event, { key: 'Enter', ctrlKey: true });
  app.document.dispatchEvent(event); await settle();
  assert.equal(app.requests.filter(request => request.body?.query?.includes('createPost') || request.url.includes('discord-announcement')).length, 0);
});
