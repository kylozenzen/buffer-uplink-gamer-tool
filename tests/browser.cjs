/* Run with PLAYWRIGHT_MODULE pointing at playwright or playwright-core, and a Chromium executable. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const built = fs.mkdtempSync(path.join(os.tmpdir(), 'uplink-build-'));
for (const file of ['index.html', 'app.js', 'publishing.js', 'publishing.css', 'v4.js', 'v4.css', 'scripts/inject-v4.js']) {
  fs.mkdirSync(path.dirname(path.join(built, file)), { recursive: true });
  fs.copyFileSync(path.join(root, file), path.join(built, file));
}
execFileSync(process.execPath, [path.join(built, 'scripts/inject-v4.js')]);
const once = fs.readFileSync(path.join(built, 'index.html'), 'utf8');
execFileSync(process.execPath, [path.join(built, 'scripts/inject-v4.js')]);
assert.equal(fs.readFileSync(path.join(built, 'index.html'), 'utf8'), once);
assert(once.indexOf('publishing.js') < once.indexOf('app.js'));
assert(once.indexOf('app.js') < once.indexOf('v4.js'));
const server = http.createServer((req, res) => {
  const [target, ...parts] = req.url.split('/').filter(Boolean);
  const dir = target === 'built' ? built : root;
  const file = path.join(dir, parts.join('/') || 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
const history = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('uplink_transmission_history') || '[]'));
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const version of ['source', 'built']) {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        // State-machine tests assert real backoff intervals; keep browser runs quick.
        const schedule = window.setTimeout.bind(window);
        window.setTimeout = (fn, delay, ...args) => schedule(fn, [1500, 4000, 9000].includes(delay) ? 10 : delay, ...args);
        if (localStorage.getItem('seeded')) return;
        localStorage.setItem('seeded', 'true');
        const data = {
          uplink_buffer_key: 'browser-test-only', uplink_confirm_enabled: 'false', uplink_sound_enabled: 'false',
          uplink_onboarding_complete: 'true', uplink_post_url_field: 'externalLink',
          uplink_templates: JSON.stringify([{ id: 'loadout-a', label: 'Test launch', copy: 'Original launch', image: 'https://example.org/image.png' }]),
          uplink_active_template: 'loadout-a',
          uplink_v4_platform_variants: JSON.stringify({ 'loadout-a': { mastodon: 'Mastodon launch', bluesky: 'Bluesky launch' } }),
          uplink_channels: JSON.stringify([{ id: 'a', displayName: 'Account A', service: 'mastodon' }, { id: 'b', displayName: 'Account B', service: 'bluesky' }]),
          uplink_selected_channels: JSON.stringify(['a', 'b']),
        };
        for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
      });
      const submissions = []; const states = new Map(); let rejectB = true; let ambiguous = false; let pending = false;
      await context.route('**/api.buffer.com/**', (route) => route.abort());
      await context.route('**/.netlify/functions/buffer-proxy', async (route) => {
        const { query, variables } = route.request().postDataJSON();
        let data;
        if (query.startsWith('mutation')) {
          submissions.push(structuredClone(variables.input));
          if (ambiguous) { await route.abort('connectionreset'); return; }
          if (variables.input.channelId === 'b' && rejectB) data = { createPost: { __typename: 'MutationError', message: 'Definite rejection' } };
          else {
            const id = 'post-' + variables.input.channelId + '-' + submissions.length;
            const status = pending ? 'pending' : variables.input.saveToDraft ? 'draft' : variables.input.mode === 'addToQueue' ? 'queued' : variables.input.mode === 'customScheduled' ? 'scheduled' : 'published';
            states.set(id, status);
            data = { createPost: { __typename: 'PostActionSuccess', post: { id, status, externalLink: status === 'published' ? 'https://example.org/posts/' + id : '' } } };
          }
        } else if (query.includes('GetPost')) {
          data = { post: { id: variables.input.id, status: states.get(variables.input.id) || 'published', externalLink: states.get(variables.input.id) === 'published' ? 'https://example.org/posts/' + variables.input.id : '' } };
        } else data = {};
        await route.fulfill({ json: { data } });
      });
      const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/${version}/`);
      if (version === 'built') await page.waitForSelector('#v4LaunchControl');
      await page.click('#sendBtn');
      await page.waitForFunction(() => !state.sending && state.history.length > 0);
      let entries = await history(page); assert.equal(entries[0].deliveries[0].state, 'published'); assert.equal(entries[0].deliveries[1].state, 'failed');
      assert.match(await page.locator('.history-result').first().innerText(), /1 published.*1 failed/i);
      const original = submissions[1];
      assert.equal(submissions[0].channelId, 'a'); assert.equal(original.channelId, 'b');
      assert.equal(original.text, version === 'built' ? 'Bluesky launch' : 'Original launch');
      // A second tab holding the delivery lock prevents a concurrent recovery.
      const otherTab = await context.newPage();
      await otherTab.goto(`${base}/${version}/`);
      await otherTab.evaluate(() => {
        window.deliveryLock = navigator.locks.request('uplink-deliveries', async () => {
          window.lockHeld = true; await new Promise((resolve) => { window.releaseLock = resolve; });
        });
      });
      await otherTab.waitForFunction(() => window.lockHeld);
      await page.getByRole('button', { name: 'Retry failed destinations' }).click();
      await page.waitForFunction(() => !state.sending && document.getElementById('sendLog').textContent.includes('Another Uplink tab'));
      assert.equal(submissions.length, 2);
      await otherTab.evaluate(() => window.releaseLock());
      await otherTab.close();
      // Edit the composer, selected destinations and V4 mode before retrying.
      await page.evaluate(() => { state.templates[0].copy = 'CHANGED'; state.templates[0].image = ''; state.selectedChannelIds.clear(); localStorage.setItem('uplink_v4_platform_variants', JSON.stringify({ 'loadout-a': { bluesky: 'CHANGED VARIANT' } })); });
      if (version === 'built') await page.click('[data-v4-mode="draft"]');
      rejectB = false;
      await page.getByRole('button', { name: 'Retry failed destinations' }).click();
      await page.waitForFunction(() => !state.sending && state.history[0].success === 2);
      assert.equal(submissions.length, 3); assert.deepEqual(submissions[2], original);
      // Reload the app with a crash-ambiguous delivery and an accepted pending ID.
      await page.evaluate(() => {
        const entries = JSON.parse(localStorage.getItem('uplink_transmission_history'));
        entries[0].deliveries[0].state = 'pending';
        entries[0].deliveries[1].state = 'sending'; entries[0].deliveries[1].postId = '';
        localStorage.setItem('uplink_transmission_history', JSON.stringify(entries));
      });
      await page.reload();
      await page.waitForFunction(() => state.history[0]?.deliveries[0].state === 'published' && state.history[0]?.deliveries[1].state === 'unknown');
      assert.equal(submissions.length, 3);
      assert.match(await page.locator('.delivery-details').first().innerText(), /cannot safely retry without a post ID/);
      assert.equal(await page.getByRole('button', { name: 'Retry failed destinations' }).count(), 0);
      // A lost create response must stay unresolved and must not create again on reopen.
      await page.evaluate(() => { state.selectedChannelIds = new Set(['a']); updateReadyHud(); });
      if (version === 'built') await page.click('[data-v4-mode="now"]');
      ambiguous = true;
      await page.click('#sendBtn');
      await page.waitForFunction(() => !state.sending && state.history[0].deliveries[0].state === 'unknown');
      assert.equal(submissions.length, 4); await page.reload();
      await page.waitForFunction(() => state.history[0]?.deliveries[0].state === 'unknown');
      assert.equal(submissions.length, 4);
      ambiguous = false;
      if (version === 'built') {
        for (const mode of ['queue', 'schedule', 'draft']) {
          await page.click(`[data-v4-mode="${mode}"]`);
          if (mode === 'schedule') await page.locator('#v4ScheduleAt').fill(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
          await page.click('#sendBtn');
          await page.waitForFunction(() => !state.sending);
          entries = await history(page);
          assert.equal(entries[0].deliveries[0].state, mode === 'queue' ? 'queued' : mode === 'schedule' ? 'scheduled' : 'draft');
          assert.equal(entries[0].success, 0);
          assert(!/ live/i.test(await page.locator('.history-result').first().innerText()));
        }
        // Reconcile all persisted queued/scheduled deliveries on reopening.
        for (const id of states.keys()) states.set(id, 'published');
        await page.reload();
        await page.waitForFunction(() => state.history.find((e) => e.launchMode === 'queue').deliveries[0].state === 'published');
        const queueIndex = await page.evaluate(() => state.history.findIndex((e) => e.launchMode === 'queue'));
        assert(await page.locator('.history-item').nth(queueIndex).locator('a[href^="https://example.org/posts/"]').count() > 0);
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.locator('body').evaluate((el) => el.scrollWidth <= innerWidth));
      }
      assert.deepEqual(errors, []); console.log(`PASS ${version}: partial recovery, original payload, crash/reopen and ambiguous outcome${version === 'built' ? ', launch modes, mobile layout' : ''}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { server.close(); fs.rmSync(built, { recursive: true, force: true }); });
