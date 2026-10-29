/* Uplink — community clips and Discord. No automatic clip publishing. */
(() => {
  'use strict';
  const KEYS = {
    discord: 'uplink_v5_discord', lastDiscord: 'uplink_v5_last_discord', notes: 'uplink_v5_clip_notes',
    sent: 'uplink_v5_clip_deliveries', clipChannels: 'uplink_v5_clip_channels',
  };
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let discord = read(KEYS.discord, { webhook: '', roleId: '', copy: '', armed: false });
  let auth = { connected: false, configured: true, maxVideoMB: 18 };
  let notes = read(KEYS.notes, {});
  let deliveries = read(KEYS.sent, {});
  let clips = new Map();
  let selected = new Set();
  let clipChannels = new Set(read(KEYS.clipChannels, []));
  let fetching = false;
  let busy = false;
  let nextCursor = '';
  let windowEnd = '';
  let lastChecked = '';
  let requestId = 0;
  let controller;
  let lastLogin = '';
  let deferredRender = false;

  function status(id, message, error = false) {
    const node = byId(id);
    if (node) { node.textContent = message; node.classList.toggle('error', error); }
  }

  async function api(path, data) {
    const response = await fetch(`/.netlify/functions/${path}`, {
      credentials: 'same-origin', cache: 'no-store', ...(data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(55000),
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('Uplink could not read the response. Check the destination before retrying.'); }
    if (!response.ok || result.error) throw Object.assign(new Error(result.error || `Request failed (${response.status}).`), { status: response.status });
    return result;
  }

  function mode() { return localStorage.getItem('uplink_v4_launch_mode') || 'now'; }
  function getDiscordTarget() {
    return discord.webhook && discord.armed && mode() === 'now' ? { id: 'uplink-discord', service: 'discord', displayName: 'Discord', discordConfig: { ...discord } } : null;
  }

  function resolvedDiscordCopy(template = currentSignal(), config = discord) {
    return resolveTemplateCopy({ ...(template || {}), copy: config.copy.trim() || template?.copy || '' });
  }

  function renderDiscordTarget() {
    const container = byId('discordTargetRow');
    if (!container) return;
    const configured = Boolean(discord.webhook);
    const active = Boolean(getDiscordTarget());
    const description = !configured ? 'Add a webhook in Systems to announce to your community.' : mode() !== 'now' ? 'Discord sends with Live now. This mode only targets Buffer.' : 'Your announcement goes directly to Discord alongside your social posts.';
    container.innerHTML = `<button type="button" id="discordArmBtn" class="v5-discord-card${active ? ' active' : ''}" aria-pressed="${active}" aria-disabled="${configured && mode() !== 'now'}"><span><strong>Discord announcement</strong><small>${esc(description)}</small></span><span class="v5-pill">${!configured ? 'SET UP' : active ? 'ARMED' : 'STANDBY'}</span></button>`;
    byId('discordArmBtn').addEventListener('click', () => {
      if (!configured) { switchTab('settings'); byId('discordWebhook').focus(); return; }
      if (mode() !== 'now' || state.sending) return;
      discord.armed = !discord.armed; write(KEYS.discord, discord); updateReadyHud();
    });
    const preview = byId('discordCopyPreview');
    if (preview) preview.textContent = resolvedDiscordCopy() || 'Select a signal or write Discord copy above to preview it.';
    const last = read(KEYS.lastDiscord, null);
    byId('endStreamBtn').disabled = !configured || !last?.id || state.sending;
  }

  async function sendDiscord(template, config = { ...discord }) {
    const content = resolvedDiscordCopy(template, config);
    const result = await api('discord-announcement', { webhook: config.webhook, roleId: config.roleId, content, thumbnail: state.liveData?.thumbnailUrl || '' });
    write(KEYS.lastDiscord, { id: result.id, webhookId: result.webhookId, channelId: result.channelId, login: localStorage.getItem(STORAGE.twitchLogin) || '', at: Date.now() });
    renderDiscordTarget();
    return { postId: '', url: result.url || '', copy: content, status: 'sent' };
  }

  function saveDiscord() {
    const webhook = byId('discordWebhook').value.trim();
    let url;
    try { url = new URL(webhook); } catch { status('discordSettingsStatus', 'Paste a webhook URL from your Discord channel integrations.', true); return; }
    if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname) || url.port || url.username || url.password || !/^\/api(?:\/v\d+)?\/webhooks\/\d{15,22}\/[A-Za-z0-9_-]{20,200}\/?$/.test(url.pathname)) {
      status('discordSettingsStatus', 'Use an HTTPS Discord webhook URL from your channel integrations.', true); return;
    }
    const roleId = byId('discordRole').value.trim();
    if (roleId && !/^\d{15,22}$/.test(roleId)) { status('discordSettingsStatus', 'Enter a numeric role ID, or leave it blank.', true); return; }
    if (webhook !== discord.webhook) localStorage.removeItem(KEYS.lastDiscord);
    discord = { webhook, roleId, copy: byId('discordCopy').value.trim(), armed: discord.webhook === webhook ? discord.armed : false };
    write(KEYS.discord, discord); updateReadyHud();
    status('discordSettingsStatus', 'Saved in this browser. Arm Discord on the Launch Deck when you’re ready.');
  }

  async function endStream() {
    const last = read(KEYS.lastDiscord, null);
    if (!last?.id) return;
    const replay = byId('replayUrl').value.trim();
    if (replay) {
      try { const url = new URL(replay); if (url.protocol !== 'https:') throw new Error(); } catch { status('endStreamStatus', 'Use a complete HTTPS replay URL.', true); return; }
    }
    byId('endStreamBtn').disabled = true;
    status('endStreamStatus', 'Updating the latest Discord announcement…');
    try {
      const webhookId = new URL(discord.webhook).pathname.split('/').filter(Boolean).at(-2);
      if (webhookId !== last.webhookId) throw new Error('The webhook changed. Send a new announcement first.');
      await api('discord-announcement', { webhook: discord.webhook, messageId: last.id, content: `Stream wrapped. Thanks for hanging out!${replay ? `\nCatch the replay: ${replay}` : ''}` });
      status('endStreamStatus', 'Discord updated. Your community won’t receive another role ping.');
    } catch (error) { status('endStreamStatus', error.message, true); }
    finally { renderDiscordTarget(); }
  }

  async function checkAuth() {
    try { auth = { maxVideoMB: 18, ...await api('twitch-auth?action=status') }; }
    catch { auth = { connected: false, configured: true, maxVideoMB: 18, unavailable: true }; }
    const name = auth.user?.name || 'Twitch';
    byId('clipsConnectionTitle').textContent = auth.connected ? `Video imports connected as ${name}` : 'Browse first. Connect when you need video.';
    byId('clipsConnectionNote').textContent = auth.connected ? `Import your channel’s clips or clips you’re authorized to edit. Video imports: up to ${auth.maxVideoMB} MB. Portrait needs a version already made in Twitch.` : auth.unavailable ? 'Video connection could not be checked. Clip browsing and Ideas still work. Try again in Systems.' : !auth.configured ? 'This deployment needs Twitch credentials configured before clip browsing or video import can connect.' : 'Public clips include moments you and your viewers created. Connect Twitch only when you want to import video.';
    byId('clipsConnectBtn').hidden = Boolean(auth.connected || !auth.configured);
    byId('twitchVideoConnect').hidden = Boolean(auth.connected || !auth.configured);
    byId('twitchVideoDisconnect').hidden = !auth.connected;
    byId('twitchVideoStatus').textContent = auth.connected ? `Connected as ${name}. Video imports up to ${auth.maxVideoMB} MB.` : auth.unavailable ? 'Connection check unavailable. Reload to try again.' : auth.configured ? 'Not connected. Public clips and Ideas work without this step.' : 'Set Twitch credentials on this deployment to enable the connection.';
    if (auth.connected && !localStorage.getItem(STORAGE.twitchLogin)) {
      localStorage.setItem(STORAGE.twitchLogin, auth.user.login); byId('twitchLoginInput').value = auth.user.login;
      if (!localStorage.getItem(STORAGE.streamLink)) { localStorage.setItem(STORAGE.streamLink, `https://twitch.tv/${auth.user.login}`); byId('streamLinkInput').value = `https://twitch.tv/${auth.user.login}`; }
      checkTwitchLive();
    }
    updateClipActions();
  }

  function deliveryKey(clip) { return `${localStorage.getItem(STORAGE.orgId) || ''}:${clip.id}`; }
  function delivery(clip) { return deliveries[deliveryKey(clip)] || { channels: {} }; }
  function caption(clip) { return Object.hasOwn(notes, clip.id) ? notes[clip.id] : clip.title || ''; }
  function selectedClips() { return [...selected].map(id => clips.get(id)).filter(Boolean); }
  function videoChannels() { return state.channels.filter(channel => /^(instagram|facebook|twitter|x|linkedin|youtube|mastodon|tiktok|threads|bluesky)$/i.test(channel.service)); }

  function renderClipChannels() {
    const available = videoChannels();
    const valid = new Set(available.map(channel => channel.id));
    clipChannels = new Set([...clipChannels].filter(id => valid.has(id)));
    if (!localStorage.getItem(KEYS.clipChannels)) clipChannels = new Set(available.filter(channel => state.selectedChannelIds.has(channel.id)).map(channel => channel.id));
    byId('clipChannelList').innerHTML = available.length ? available.map(channel => `<label class="clip-channel"><input type="checkbox" data-clip-channel="${esc(channel.id)}"${clipChannels.has(channel.id) ? ' checked' : ''}${busy ? ' disabled' : ''}>${esc(channel.displayName || channel.name || channel.service)} <small>${esc(channel.service)}</small></label>`).join('') : '<span class="v5-muted">Connect a video-compatible channel in Buffer, then refresh your network on the Launch Deck.</span>';
  }

  function updateClipActions() {
    if (!byId('clipsSelectedCount')) return;
    const count = selected.size;
    byId('clipsSelectedCount').textContent = count ? `${count} moment${count === 1 ? '' : 's'} selected` : 'Choose your moments';
    byId('saveClipIdeasBtn').disabled = !count || busy;
    byId('createClipDraftsBtn').disabled = !count || !clipChannels.size || !auth.connected || !auth.canDownload || busy;
    byId('createClipDraftsBtn').textContent = byId('clipDelivery').value === 'queue' ? 'Add videos to queue' : 'Create video drafts';
    byId('clipActionNote').textContent = byId('clipDelivery').value === 'queue' ? 'Ideas save links and notes. Add to Queue will publish videos at your next Buffer slots. Review the captions and destinations first.' : `Ideas save the Twitch link and notes. Video drafts attach the file and stay unpublished.${auth.connected ? ' Instagram imports need a Twitch portrait version.' : ' Connect Twitch to enable video import.'}`;
    for (const id of ['clipOrientation', 'clipDelivery', 'clipsClearSelection', 'clipsWindow', 'clipsLoadMoreBtn']) byId(id).disabled = busy;
    byId('clipsRefreshBtn').disabled = busy || fetching;
  }

  function renderClips() {
    if (document.activeElement?.matches('[data-clip-caption]')) { deferredRender = true; return; }
    const grid = byId('clipsGrid');
    const login = localStorage.getItem(STORAGE.twitchLogin) || '';
    if (!login) {
      grid.innerHTML = '<div class="clips-empty"><h2>Your next posts are in here.</h2>Link your Twitch username in Systems to see your community’s clips.<br><button class="btn btn-small" data-open-settings type="button" style="margin-top:15px">Link a channel</button></div>';
      return;
    }
    const list = [...clips.values()];
    list.sort(byId('clipsSort').value === 'views' ? (a, b) => b.view_count - a.view_count : (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    if (!list.length) {
      grid.innerHTML = `<div class="clips-empty"><h2>${fetching ? 'Scanning the highlights…' : 'No clips in this window yet.'}</h2>${fetching ? 'Getting clips from Twitch.' : 'Try a wider time window, or check back after someone clips a moment. New clips can take time to process.'}</div>`;
      return;
    }
    grid.innerHTML = list.map(clip => {
      const sent = delivery(clip);
      const channelResults = Object.values(sent.channels || {});
      const uncertain = sent.idea?.uncertain || channelResults.some(result => result.uncertain);
      const sentCount = channelResults.filter(result => result.id).length;
      const badge = uncertain ? 'Check Buffer' : sentCount ? `${sentCount} video post${sentCount === 1 ? '' : 's'}` : sent.idea?.id ? 'Idea saved' : '';
      const date = new Date(clip.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const title = clip.title || 'Untitled clip';
      const image = /^https:\/\//.test(clip.thumbnail_url || '') ? `<img src="${esc(clip.thumbnail_url)}" alt="" loading="lazy">` : '';
      return `<article class="clip-card${selected.has(clip.id) ? ' selected' : ''}" data-clip-id="${esc(clip.id)}"><div class="clip-thumb">${image}<label class="clip-select"><input type="checkbox" data-select-clip="${esc(clip.id)}" aria-label="Select ${esc(title)}"${selected.has(clip.id) ? ' checked' : ''}${busy ? ' disabled' : ''}>SELECT</label><span class="clip-duration">${Math.round(clip.duration)}s</span></div><div class="clip-body"><h3>${esc(title)}</h3><div class="clip-meta">Clipped by ${esc(clip.creator_name)} · ${esc(date)}<br>${Number(clip.view_count || 0).toLocaleString()} views</div><div class="clip-buttons"><button class="btn btn-small" type="button" data-preview-clip="${esc(clip.id)}">Preview</button>${badge ? `<span class="v5-pill sent">${esc(badge)}</span>` : ''}<a href="https://clips.twitch.tv/${encodeURIComponent(clip.id)}" target="_blank" rel="noopener noreferrer">Twitch ↗</a>${uncertain ? `<button class="link-btn" type="button" data-reset-clip="${esc(clip.id)}">Review before retry</button>` : ''}</div>${selected.has(clip.id) ? `<label class="v5-field"><span>Caption / notes</span><textarea data-clip-caption="${esc(clip.id)}" maxlength="4000"${busy ? ' disabled' : ''}>${esc(caption(clip))}</textarea></label>` : ''}</div></article>`;
    }).join('');
    byId('clipsLoadMoreBtn').hidden = !nextCursor;
    updateClipActions();
  }

  async function loadClips({ reset = false, more = false, quiet = false } = {}) {
    if (busy || (fetching && quiet)) return;
    const login = localStorage.getItem(STORAGE.twitchLogin) || '';
    if (!login) { renderClips(); return; }
    if (login !== lastLogin) reset = true;
    controller?.abort(); const currentController = new AbortController(); controller = currentController;
    const mine = ++requestId;
    fetching = true;
    byId('clipsGrid').setAttribute('aria-busy', 'true');
    byId('clipsChannelLabel').textContent = `@${login.toUpperCase()} // CLIPS`;
    updateClipActions();
    if (!quiet) status('clipsActionStatus', 'Finding your clips…');
    const query = new URLSearchParams({ login, days: byId('clipsWindow').value });
    if (more && nextCursor) { query.set('after', nextCursor); query.set('until', windowEnd); }
    else if (quiet && lastChecked && !reset) query.set('since', new Date(Date.parse(lastChecked) - 120000).toISOString());
    const timer = window.setTimeout(() => currentController.abort(), 20000);
    try {
      const response = await fetch(`/.netlify/functions/twitch-clips?${query}`, { cache: 'no-store', signal: currentController.signal });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Could not load Twitch clips.');
      if (mine !== requestId) return;
      if (reset) { clips = new Map(); selected.clear(); nextCursor = ''; }
      let added = 0;
      for (const clip of result.clips || []) {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(clip.id)) continue;
        if (!clips.has(clip.id)) added++;
        clips.set(clip.id, clip);
      }
      const cutoff = Date.now() - Number(byId('clipsWindow').value) * 86400000;
      for (const [id, clip] of clips) if (Date.parse(clip.created_at) < cutoff) { clips.delete(id); selected.delete(id); }
      if (!quiet || reset) { nextCursor = result.nextCursor || ''; windowEnd = result.until; }
      lastChecked = result.fetchedAt; lastLogin = login;
      renderClips();
      byId('clipsRefreshNote').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · checks every 45s while visible`;
      if (!quiet || added) status('clipsActionStatus', quiet ? `${added} new clip${added === 1 ? '' : 's'} found.` : `${clips.size} clip${clips.size === 1 ? '' : 's'} loaded. Choose a few to send to Buffer.`);
    } catch (error) {
      if (mine !== requestId) return;
      if (error.name !== 'AbortError') status('clipsActionStatus', error.message, true);
      else if (!quiet) status('clipsActionStatus', 'The clip request timed out. Refresh to try again.', true);
    } finally {
      window.clearTimeout(timer);
      if (mine === requestId) { fetching = false; byId('clipsGrid').setAttribute('aria-busy', 'false'); updateClipActions(); }
    }
  }

  function previewClip(id) {
    const clip = clips.get(id); if (!clip) return;
    byId('clipPreviewTitle').textContent = clip.title || 'Clip preview';
    byId('clipPreviewCredit').textContent = `Clipped by ${clip.creator_name} on Twitch.`;
    const iframe = document.createElement('iframe');
    const query = new URLSearchParams({ clip: clip.id, parent: window.location.hostname, autoplay: 'false' });
    iframe.src = `https://clips.twitch.tv/embed?${query}`; iframe.title = `Twitch clip: ${clip.title}`;
    iframe.allow = 'autoplay; fullscreen'; iframe.allowFullscreen = true;
    byId('clipPreviewFrame').replaceChildren(iframe); byId('clipPreviewDialog').showModal();
  }

  function remember(clip, value) { deliveries[deliveryKey(clip)] = value; write(KEYS.sent, deliveries); }
  function ambiguous(error) { return !error.status || error.status >= 500; }

  async function bufferMutation(query, input, field) {
    const response = await bufferRequest(localStorage.getItem(STORAGE.key), query, { input });
    const result = response?.data?.[field];
    if (!result) throw new Error('Buffer did not confirm the result. Check Buffer before retrying.');
    if (result.__typename === 'MutationError') throw Object.assign(new Error(result.message || 'Buffer rejected the content.'), { status: 400 });
    return result;
  }

  async function deliverClips(kind) {
    if (busy) return;
    const batch = selectedClips();
    if (!batch.length) return;
    const organizationId = localStorage.getItem(STORAGE.orgId);
    if (!organizationId) { status('clipsActionStatus', 'Refresh your Buffer network before sending clips.', true); return; }
    const queue = byId('clipDelivery').value === 'queue';
    const orientation = byId('clipOrientation').value;
    const targets = videoChannels().filter(channel => clipChannels.has(channel.id));
    if (kind === 'video' && (!auth.connected || !auth.canDownload || !targets.length)) return;
    if (kind === 'video' && orientation === 'landscape' && targets.some(channel => channel.service.toLowerCase() === 'instagram')) {
      status('clipsActionStatus', 'Choose the Twitch portrait version for Instagram, or deselect Instagram. Uplink imports your existing Twitch edit.', true); return;
    }
    if (kind === 'video' && queue && !window.confirm(`Add ${batch.length} selected clip(s) to ${targets.length} Buffer channel(s)? They will publish at your next queue slots.`)) return;
    busy = true; renderClipChannels(); renderClips(); updateClipActions();
    let saved = 0; let skipped = 0; const failures = [];
    for (let index = 0; index < batch.length; index++) {
      const clip = batch[index];
      status('clipsActionStatus', `Processing clip ${index + 1} of ${batch.length}: ${clip.title}`);
      const record = delivery(clip); record.channels ||= {};
      if (kind === 'idea') {
        if (record.idea) { skipped++; continue; }
        try {
          const result = await bufferMutation('mutation ClipIdea($input:CreateIdeaInput!){createIdea(input:$input){__typename ... on Idea{id} ... on MutationError{message}}}', {
            organizationId, content: { title: (clip.title || 'Twitch clip').slice(0, 200), text: `${caption(clip)}\n\n${clip.url}\nClipped by ${clip.creator_name} on Twitch.`, media: [{ type: 'link', url: clip.url, thumbnailUrl: clip.thumbnail_url }] },
          }, 'createIdea');
          if (!result.id) throw new Error('Buffer did not return an Idea ID. Check Buffer before retrying.');
          record.idea = { id: result.id, at: Date.now() }; remember(clip, record); saved++;
        } catch (error) {
          if (ambiguous(error)) { record.idea = { uncertain: true }; remember(clip, record); }
          failures.push(`${clip.title}: ${error.message}`);
        }
        continue;
      }
      const remaining = targets.filter(channel => !record.channels[channel.id]);
      skipped += targets.length - remaining.length;
      if (!remaining.length) continue;
      let media;
      try { media = await api('clip-import', { clipId: clip.id, orientation }); }
      catch (error) { failures.push(`${clip.title}: ${error.message}`); continue; }
      for (const channel of remaining) {
        try {
          const input = { channelId: channel.id, text: caption(clip), schedulingType: 'automatic', mode: 'addToQueue', saveToDraft: !queue, assets: [{ video: { url: media.url } }] };
          const service = String(channel.service).toLowerCase();
          if (service === 'youtube') input.metadata = { youtube: { title: (clip.title || 'Stream highlight').slice(0, 100), categoryId: '20', privacy: 'public', madeForKids: false } };
          if (service === 'instagram') input.metadata = { instagram: { type: 'reel', shouldShareToFeed: true } };
          const result = await bufferMutation('mutation ClipPost($input:CreatePostInput!){createPost(input:$input){__typename ... on PostActionSuccess{post{id status}} ... on MutationError{message}}}', input, 'createPost');
          if (!result.post?.id) throw new Error('Buffer did not return a post ID. Check Buffer before retrying.');
          record.channels[channel.id] = { id: result.post.id, mode: queue ? 'queue' : 'draft', at: Date.now() }; remember(clip, record); saved++;
        } catch (error) {
          if (ambiguous(error)) { record.channels[channel.id] = { uncertain: true }; remember(clip, record); }
          failures.push(`${clip.title} → ${channel.displayName || channel.service}: ${error.message}`);
        }
      }
    }
    busy = false; renderClipChannels(); renderClips(); updateClipActions();
    const noun = kind === 'idea' ? 'Idea' : queue ? 'queued video' : 'video draft';
    const message = `${saved} ${noun}${saved === 1 ? '' : 's'} saved.${skipped ? ` ${skipped} previously sent or unconfirmed destination(s) skipped.` : ''}${failures.length ? ` ${failures.length} failed. ${failures.slice(0, 3).join(' | ')}` : ''}${kind === 'video' && !queue && saved ? ' Nothing published.' : ''}`;
    status('clipsActionStatus', message, failures.length > 0);
  }

  async function disconnectTwitch() {
    byId('twitchVideoDisconnect').disabled = true;
    try { await api('twitch-auth?action=disconnect', {}); await checkAuth(); status('twitchVideoMessage', 'Twitch disconnected. Existing hosted clips remain available for your Buffer posts.'); }
    catch (error) { status('twitchVideoMessage', error.message, true); }
    finally { byId('twitchVideoDisconnect').disabled = false; }
  }

  window.UplinkV5 = {
    getDiscordTarget, sendDiscord, renderDiscordTarget,
    discordCopy: () => discord.copy,
    disconnectAll: async () => { await api('twitch-auth?action=disconnect', {}); Object.values(KEYS).forEach(key => localStorage.removeItem(key)); },
  };

  function boot() {
    byId('discordWebhook').value = discord.webhook; byId('discordRole').value = discord.roleId; byId('discordCopy').value = discord.copy;
    byId('saveDiscordBtn').addEventListener('click', saveDiscord);
    byId('clearDiscordBtn').addEventListener('click', () => { discord = { webhook: '', roleId: '', copy: '', armed: false }; localStorage.removeItem(KEYS.discord); localStorage.removeItem(KEYS.lastDiscord); byId('discordWebhook').value = ''; byId('discordRole').value = ''; byId('discordCopy').value = ''; updateReadyHud(); status('discordSettingsStatus', 'Discord webhook removed from this browser.'); });
    byId('discordCopy').addEventListener('input', () => { byId('discordCopyPreview').textContent = resolveTemplateCopy({ copy: byId('discordCopy').value }) || 'Your active signal will be used.'; });
    byId('endStreamBtn').addEventListener('click', endStream);
    byId('reviewClipsBtn').addEventListener('click', () => switchTab('clips'));
    byId('twitchVideoDisconnect').addEventListener('click', disconnectTwitch);
    byId('clipsRefreshBtn').addEventListener('click', () => loadClips({ reset: true }));
    byId('clipsLoadMoreBtn').addEventListener('click', () => loadClips({ more: true }));
    byId('clipsWindow').addEventListener('change', () => loadClips({ reset: true }));
    byId('clipsSort').addEventListener('change', renderClips);
    byId('clipDelivery').addEventListener('change', updateClipActions);
    byId('clipsClearSelection').addEventListener('click', () => { selected.clear(); renderClips(); });
    byId('saveClipIdeasBtn').addEventListener('click', () => deliverClips('idea'));
    byId('createClipDraftsBtn').addEventListener('click', () => deliverClips('video'));
    byId('clipChannelList').addEventListener('change', event => { const id = event.target.dataset.clipChannel; if (!id) return; event.target.checked ? clipChannels.add(id) : clipChannels.delete(id); write(KEYS.clipChannels, [...clipChannels]); updateClipActions(); });
    byId('clipsGrid').addEventListener('change', event => {
      const id = event.target.dataset.selectClip; if (!id || busy) return;
      if (event.target.checked && selected.size >= 10) { event.target.checked = false; status('clipsActionStatus', 'Choose up to 10 clips in one batch.', true); return; }
      event.target.checked ? selected.add(id) : selected.delete(id); renderClips();
    });
    byId('clipsGrid').addEventListener('input', event => { const id = event.target.dataset.clipCaption; if (id) { notes[id] = event.target.value; write(KEYS.notes, notes); } });
    byId('clipsGrid').addEventListener('focusout', () => { if (deferredRender) { deferredRender = false; window.setTimeout(renderClips, 0); } });
    byId('clipsGrid').addEventListener('click', event => {
      const preview = event.target.closest('[data-preview-clip]'); if (preview) previewClip(preview.dataset.previewClip);
      if (event.target.closest('[data-open-settings],#clipsOpenSettings')) switchTab('settings');
      const reset = event.target.closest('[data-reset-clip]');
      if (reset && !busy && window.confirm('First check Buffer for this clip. Only continue if its unconfirmed Idea or posts were NOT created. Allow a retry for those unconfirmed destinations?')) {
        const clip = clips.get(reset.dataset.resetClip); const record = delivery(clip);
        if (record.idea?.uncertain) delete record.idea;
        for (const [id, value] of Object.entries(record.channels || {})) if (value.uncertain) delete record.channels[id];
        remember(clip, record); renderClips();
      }
    });
    byId('closeClipPreview').addEventListener('click', () => byId('clipPreviewDialog').close());
    byId('clipPreviewDialog').addEventListener('close', () => byId('clipPreviewFrame').replaceChildren());
    document.addEventListener('uplink:tab', event => { if (event.detail === 'clips') { renderClipChannels(); loadClips({ reset: lastLogin !== (localStorage.getItem(STORAGE.twitchLogin) || '') }); } });
    document.addEventListener('uplink:channels', () => { renderClipChannels(); updateClipActions(); });
    const clipsVisible = () => !document.hidden && els.mainApp.style.display !== 'none' && byId('view-clips').classList.contains('active');
    document.addEventListener('visibilitychange', () => { if (clipsVisible()) loadClips({ quiet: true }); });
    window.setInterval(() => { if (clipsVisible()) loadClips({ quiet: true }); }, 45000);
    renderDiscordTarget(); renderClipChannels(); updateClipActions();
    checkAuth().then(() => { if (window.location.hash === '#clips' && localStorage.getItem(STORAGE.key)) switchTab('clips'); });
    const params = new URLSearchParams(window.location.search);
    if (params.has('twitch')) {
      const result = params.get('twitch');
      status('clipsActionStatus', result === 'connected' ? 'Twitch connected. Select a few clips to import.' : result === 'cancelled' ? 'Twitch connection cancelled. Browsing and Ideas still work.' : 'Twitch connection failed. Check the registered callback URL and try again.', result === 'failed');
      params.delete('twitch'); window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
