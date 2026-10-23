/* ==========================================================
   UPLINK V4 — Native Signals
   Additive layer over the V3 deck:
   - platform-specific copy variants
   - Now / Queue / Schedule / Draft launch modes
   - on-demand Buffer post metrics / mission report
   ========================================================== */

(() => {
  'use strict';

  const V4_STORAGE = {
    variants: 'uplink_v4_platform_variants',
    launchMode: 'uplink_v4_launch_mode',
    scheduleAt: 'uplink_v4_schedule_at',
    metrics: 'uplink_v4_metrics_cache',
  };

  const MODE_CONFIG = {
    now: {
      label: 'Live now',
      button: 'Transmit Uplink',
      sub: 'Publish immediately',
      bufferMode: 'shareNow',
      saveToDraft: false,
    },
    queue: {
      label: 'Queue',
      button: 'Add to Queue',
      sub: 'Use the next Buffer slot',
      bufferMode: 'addToQueue',
      saveToDraft: false,
    },
    schedule: {
      label: 'Schedule',
      button: 'Schedule Signal',
      sub: 'Deploy at a custom time',
      bufferMode: 'customScheduled',
      saveToDraft: false,
    },
    draft: {
      label: 'Draft',
      button: 'Save to Drafts',
      sub: 'Send to Buffer without publishing',
      bufferMode: 'addToQueue',
      saveToDraft: true,
    },
  };

  let variantPanelOpen = false;
  let metricsCache = loadV4JSON(V4_STORAGE.metrics, {});

  function loadV4JSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveV4JSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function currentSignalKey() {
    if (state.composeMode === 'manual') return 'manual-compose';
    return state.activeTemplateId || 'no-signal';
  }

  function normalizeService(service) {
    const raw = String(service || '').toLowerCase();
    if (raw.includes('twitter') || raw === 'x') return 'twitter';
    if (raw.includes('threads')) return 'threads';
    if (raw.includes('blue')) return 'bluesky';
    if (raw.includes('linkedin')) return 'linkedin';
    if (raw.includes('facebook')) return 'facebook';
    if (raw.includes('mastodon')) return 'mastodon';
    if (raw.includes('instagram')) return 'instagram';
    if (raw.includes('tiktok')) return 'tiktok';
    if (raw.includes('youtube')) return 'youtube';
    if (raw.includes('pinterest')) return 'pinterest';
    return raw.replace(/[^a-z0-9]/g, '') || 'social';
  }

  function serviceLabel(channel) {
    return channel.service || channel.name || channel.displayName || 'Social';
  }

  function variantsStore() {
    return loadV4JSON(V4_STORAGE.variants, {});
  }

  function getVariant(signalKey, serviceKey) {
    return variantsStore()?.[signalKey]?.[serviceKey] || '';
  }

  function setVariant(signalKey, serviceKey, value) {
    const all = variantsStore();
    all[signalKey] = all[signalKey] || {};
    if (String(value || '').trim()) all[signalKey][serviceKey] = value;
    else delete all[signalKey][serviceKey];
    if (!Object.keys(all[signalKey]).length) delete all[signalKey];
    saveV4JSON(V4_STORAGE.variants, all);
  }

  function resolveRawCopy(rawCopy) {
    const signal = currentSignal();
    return resolveTemplateCopy({
      id: signal?.id || 'v4-preview',
      label: signal?.label || 'Signal',
      type: signal?.type || 'Custom',
      image: signal?.image || '',
      copy: rawCopy || '',
    });
  }

  function rawMasterCopy() {
    const signal = currentSignal();
    return String(signal?.copy || '');
  }

  function selectedServices() {
    const seen = new Map();
    state.channels
      .filter((channel) => state.selectedChannelIds.has(channel.id))
      .forEach((channel) => {
        const key = normalizeService(channel.service || channel.name);
        if (!seen.has(key)) seen.set(key, { key, label: serviceLabel(channel), channel });
      });
    return [...seen.values()];
  }

  function createVariantTools() {
    const signalPanel = document.querySelector('[data-tour="signal"]');
    if (!signalPanel || document.getElementById('v4SignalTools')) return;

    const wrap = document.createElement('div');
    wrap.className = 'v4-signal-tools';
    wrap.id = 'v4SignalTools';
    wrap.innerHTML = `
      <div class="v4-tools-head">
        <div class="v4-tools-copy">
          <strong>Native signals</strong>
          <span>Keep the master copy or tune a version for each armed platform.</span>
        </div>
        <button class="btn btn-small v4-variant-toggle" id="v4VariantToggle" type="button" aria-expanded="false">
          Customize by channel <span class="v4-variant-count" id="v4VariantCount">0</span>
        </button>
      </div>
      <div class="v4-variant-panel" id="v4VariantPanel"></div>
    `;
    signalPanel.appendChild(wrap);

    document.getElementById('v4VariantToggle').addEventListener('click', () => {
      variantPanelOpen = !variantPanelOpen;
      document.getElementById('v4VariantToggle').setAttribute('aria-expanded', String(variantPanelOpen));
      renderVariantEditor();
      playTone('tick');
    });
  }

  function renderVariantEditor() {
    const panel = document.getElementById('v4VariantPanel');
    const counter = document.getElementById('v4VariantCount');
    if (!panel || !counter) return;

    const services = selectedServices();
    const signalKey = currentSignalKey();
    const master = rawMasterCopy();
    const customCount = services.filter(({ key }) => Boolean(getVariant(signalKey, key).trim())).length;
    counter.textContent = String(customCount);
    panel.classList.toggle('show', variantPanelOpen);
    panel.innerHTML = '';

    if (!variantPanelOpen) return;
    if (!currentSignal()) {
      panel.innerHTML = '<div class="v4-variant-empty">Load or write a signal first, then Uplink can fork it by destination.</div>';
      return;
    }
    if (!services.length) {
      panel.innerHTML = '<div class="v4-variant-empty">Arm at least one social channel to reveal its native copy slot.</div>';
      return;
    }

    services.forEach(({ key, label }) => {
      const saved = getVariant(signalKey, key);
      const card = document.createElement('div');
      card.className = 'v4-variant-card';
      card.innerHTML = `
        <div class="v4-variant-head">
          <div class="v4-platform"><span class="v4-platform-dot"></span>${escapeV4(label)}</div>
          <div class="v4-variant-meta">
            <span class="v4-variant-state ${saved.trim() ? 'custom' : ''}">${saved.trim() ? 'Custom' : 'Master'}</span>
            <span class="v4-variant-count-text">${resolveRawCopy(saved || master).length} chars</span>
            <button class="v4-reset-variant" type="button">Use master</button>
          </div>
        </div>
        <textarea aria-label="${escapeV4(label)} post variant" placeholder="Leave blank to use the master signal.">${escapeV4(saved)}</textarea>
        <div class="v4-variant-foot"><span>Supports {{game}}, {{title}}, {{viewers}}, {{link}}</span><span>${escapeV4(label)}</span></div>
      `;

      const textarea = card.querySelector('textarea');
      const stateLabel = card.querySelector('.v4-variant-state');
      const count = card.querySelector('.v4-variant-count-text');
      const reset = card.querySelector('.v4-reset-variant');

      textarea.addEventListener('input', () => {
        setVariant(signalKey, key, textarea.value);
        const custom = Boolean(textarea.value.trim());
        stateLabel.textContent = custom ? 'Custom' : 'Master';
        stateLabel.classList.toggle('custom', custom);
        count.textContent = `${resolveRawCopy(textarea.value || master).length} chars`;
        updateVariantCounter();
      });
      reset.addEventListener('click', () => {
        textarea.value = '';
        textarea.dispatchEvent(new Event('input'));
        textarea.focus();
      });
      panel.appendChild(card);
    });
  }

  function updateVariantCounter() {
    const counter = document.getElementById('v4VariantCount');
    if (!counter) return;
    const signalKey = currentSignalKey();
    counter.textContent = String(selectedServices().filter(({ key }) => Boolean(getVariant(signalKey, key).trim())).length);
  }

  function escapeV4(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function launchMode() {
    const saved = localStorage.getItem(V4_STORAGE.launchMode);
    return MODE_CONFIG[saved] ? saved : 'now';
  }

  function createLaunchControl() {
    const sendPanel = document.querySelector('[data-tour="transmit"]');
    const transmitButton = document.getElementById('sendBtn');
    if (!sendPanel || !transmitButton || document.getElementById('v4LaunchControl')) return;

    const wrap = document.createElement('div');
    wrap.id = 'v4LaunchControl';
    wrap.className = 'v4-launch-control';
    wrap.innerHTML = `
      <div class="v4-launch-label"><span>Launch mode</span><strong id="v4ModeStatus">LIVE NOW</strong></div>
      <div class="v4-launch-modes" role="group" aria-label="Launch mode">
        <button class="v4-mode-btn" data-v4-mode="now" type="button">Now</button>
        <button class="v4-mode-btn" data-v4-mode="queue" type="button">Queue</button>
        <button class="v4-mode-btn" data-v4-mode="schedule" type="button">Schedule</button>
        <button class="v4-mode-btn" data-v4-mode="draft" type="button">Draft</button>
      </div>
      <div class="v4-schedule-wrap" id="v4ScheduleWrap">
        <label class="sr-only" for="v4ScheduleAt">Schedule date and time</label>
        <input type="datetime-local" id="v4ScheduleAt">
      </div>
      <div class="v4-mode-note" id="v4ModeNote"></div>
    `;
    sendPanel.insertBefore(wrap, transmitButton);

    const scheduleInput = document.getElementById('v4ScheduleAt');
    scheduleInput.value = localStorage.getItem(V4_STORAGE.scheduleAt) || '';
    scheduleInput.addEventListener('input', () => {
      localStorage.setItem(V4_STORAGE.scheduleAt, scheduleInput.value);
      updateReadyHud();
    });

    wrap.querySelectorAll('[data-v4-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        localStorage.setItem(V4_STORAGE.launchMode, button.dataset.v4Mode);
        renderLaunchControl();
        updateReadyHud();
        playTone('tick');
      });
    });
    renderLaunchControl();
  }

  function scheduleDate() {
    const raw = document.getElementById('v4ScheduleAt')?.value || localStorage.getItem(V4_STORAGE.scheduleAt) || '';
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function scheduleValid() {
    const date = scheduleDate();
    return Boolean(date && date.getTime() > Date.now() + 60 * 1000);
  }

  function renderLaunchControl() {
    const mode = launchMode();
    const config = MODE_CONFIG[mode];
    document.querySelectorAll('[data-v4-mode]').forEach((button) => button.classList.toggle('active', button.dataset.v4Mode === mode));
    document.getElementById('v4ScheduleWrap')?.classList.toggle('show', mode === 'schedule');
    const status = document.getElementById('v4ModeStatus');
    const note = document.getElementById('v4ModeNote');
    if (status) status.textContent = config.label.toUpperCase();
    if (note) {
      note.classList.remove('error');
      if (mode === 'now') note.textContent = 'Publishes immediately to every armed target.';
      if (mode === 'queue') note.textContent = 'Adds each platform signal to its next Buffer queue slot.';
      if (mode === 'draft') note.textContent = 'Creates Buffer drafts only. Nothing publishes until you schedule it later.';
      if (mode === 'schedule') {
        note.textContent = scheduleValid() ? `Scheduled for ${scheduleDate().toLocaleString()}.` : 'Choose a time at least one minute in the future.';
        note.classList.toggle('error', !scheduleValid());
      }
    }
  }

  const baseUpdateReadyHud = updateReadyHud;
  updateReadyHud = function v4UpdateReadyHud() {
    baseUpdateReadyHud();
    renderLaunchControl();
    const mode = launchMode();
    const config = MODE_CONFIG[mode];
    const signal = currentSignal();
    const hasChannels = state.selectedChannelIds.size > 0;
    const hasSignal = Boolean(signal && resolveTemplateCopy(signal));
    const scheduleOkay = mode !== 'schedule' || scheduleValid();
    els.sendBtn.disabled = !(hasChannels && hasSignal && scheduleOkay) || state.sending;

    if (!state.sending && hasChannels && hasSignal) {
      els.sendBtnMain.textContent = config.button;
      els.sendBtnSub.textContent = mode === 'schedule' && scheduleValid()
        ? scheduleDate().toLocaleString()
        : `${state.selectedChannelIds.size} target${state.selectedChannelIds.size === 1 ? '' : 's'} · ${config.sub}`;
    }
  };

  sendUplink = async function v4SendUplink(template) {
    const mode = launchMode();
    if (mode === 'schedule' && !scheduleValid()) {
      els.sendLog.textContent = 'Choose a future launch time before scheduling this signal.';
      return;
    }
    const config = MODE_CONFIG[mode];
    const dueAt = mode === 'schedule' ? scheduleDate().toISOString() : '';
    // Capture variants and mode before any asynchronous work or UI edits.
    const variants = Object.fromEntries(state.channels.map((channel) => [channel.id,
      getVariant(currentSignalKey(), normalizeService(channel.service || channel.name)).trim() || template?.copy || '']));
    return sendReliableLaunch(template, {
      mode, scheduledFor: dueAt,
      needsLiveData: /\{\{\s*(game|title|viewers)\s*\}\}/i.test(Object.values(variants).join('\n')),
      makePayload: (channel, signal) => ({
        channelId: channel.id, text: resolveTemplateCopy({ ...signal, copy: variants[channel.id] }),
        schedulingType: 'automatic', mode: config.bufferMode,
        ...(config.saveToDraft ? { saveToDraft: true } : {}),
        ...(dueAt ? { dueAt } : {}),
        ...(signal.image ? { assets: [{ image: { url: signal.image } }] } : {}),
      }),
    });
  };

  function createMissionPanel() {
    const historyPanel = document.querySelector('[data-tour="history"]');
    if (!historyPanel || document.getElementById('v4MissionPanel')) return;
    const panel = document.createElement('section');
    panel.className = 'panel panel-pad v4-mission-panel';
    panel.id = 'v4MissionPanel';
    panel.innerHTML = '<div class="panel-head"><div class="panel-kicker">After action report</div></div><div id="v4MissionBody"></div>';
    historyPanel.insertAdjacentElement('afterend', panel);
    renderMissionReport();
  }

  function latestMission() {
    const entry = state.history.find((record) => record.deliveries?.some((post) => post.state === 'published' && post.postId));
    return entry ? { ...entry, posts: entry.deliveries.filter((post) => post.state === 'published' && post.postId) } : null;
  }

  function renderMissionReport() {
    const body = document.getElementById('v4MissionBody');
    if (!body) return;
    const mission = latestMission();
    if (!mission) {
      body.innerHTML = '<div class="v4-mission-empty">Complete a transmission and Uplink will turn its Buffer post IDs into a compact performance report.</div>';
      return;
    }

    const cached = mission.posts.map((post) => metricsCache[post.postId]).filter(Boolean);
    const totals = aggregateMetrics(cached);
    const freshness = cached.map((item) => item.metricsUpdatedAt).filter(Boolean).sort().pop() || '';
    const mode = MODE_CONFIG[mission.launchMode || 'now']?.label || 'Live now';
    body.innerHTML = `
      <div class="v4-mission-head">
        <div class="v4-mission-title"><strong>${escapeV4(mission.template || 'Signal')}</strong><span>${mission.targetCount || mission.posts.length} targets · ${escapeV4(formatRelativeTime(mission.timestamp))}</span></div>
        <span class="v4-mission-badge">${escapeV4(mode)}</span>
      </div>
      ${cached.length ? renderMetricTiles(totals, mission.posts.length) : '<div class="v4-mission-empty" style="margin-top:12px">Metrics have not been pulled yet. Buffer refreshes social performance data daily.</div>'}
      <div class="v4-mission-actions"><button class="btn btn-small btn-primary" id="v4RefreshMetrics" type="button">${cached.length ? 'Refresh metrics' : 'Pull metrics'}</button></div>
      <div class="v4-mission-status ${cached.length ? 'good' : ''}" id="v4MissionStatus">${freshness ? `Last Buffer metric refresh: ${escapeV4(new Date(freshness).toLocaleString())}` : 'Uses Buffer post metrics when this API key/account supports them.'}</div>
    `;
    document.getElementById('v4RefreshMetrics')?.addEventListener('click', refreshMissionMetrics);
  }

  function aggregateMetrics(records) {
    const totals = {};
    records.forEach((record) => {
      (record.metrics || []).forEach((metric) => {
        const key = String(metric.type || metric.name || 'metric');
        const value = Number(metric.value);
        if (Number.isFinite(value)) totals[key] = (totals[key] || 0) + value;
      });
    });
    return totals;
  }

  function renderMetricTiles(totals, postCount) {
    const priority = ['impressions', 'reach', 'reactions', 'comments', 'clicks', 'views', 'engagements'];
    const entries = Object.entries(totals);
    const ordered = [
      ...priority.map((key) => entries.find(([type]) => type.toLowerCase() === key)).filter(Boolean),
      ...entries.filter(([type]) => !priority.includes(type.toLowerCase())),
    ].filter((entry, index, arr) => arr.findIndex(([type]) => type === entry[0]) === index).slice(0, 3);
    const tiles = [["Posts", postCount], ...ordered.map(([type, value]) => [metricLabel(type), value])];
    return `<div class="v4-metrics-grid">${tiles.slice(0, 4).map(([label, value]) => `<div class="v4-metric"><span>${escapeV4(label)}</span><strong>${escapeV4(formatNumber(Number(value) || 0))}</strong></div>`).join('')}</div>`;
  }

  function metricLabel(type) {
    return String(type || 'Metric').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  async function refreshMissionMetrics() {
    const mission = latestMission();
    const button = document.getElementById('v4RefreshMetrics');
    const status = document.getElementById('v4MissionStatus');
    const key = localStorage.getItem(STORAGE.key);
    if (!mission || !key || !button || !status) return;

    button.disabled = true;
    button.textContent = 'Scanning…';
    status.className = 'v4-mission-status';
    status.textContent = `Pulling performance for ${mission.posts.length} social post${mission.posts.length === 1 ? '' : 's'}…`;

    try {
      let supported = 0;
      for (const post of mission.posts) {
        if (!post.postId) continue;
        const data = await bufferRequest(key, `query GetPostMetrics($input: PostInput!) { post(input: $input) { id metrics { type name value unit } metricsUpdatedAt } }`, { input: { id: post.postId } });
        const record = data?.data?.post;
        if (record) {
          metricsCache[post.postId] = { metrics: record.metrics || [], metricsUpdatedAt: record.metricsUpdatedAt || '' };
          supported += 1;
        }
      }
      saveV4JSON(V4_STORAGE.metrics, metricsCache);
      renderMissionReport();
      const nextStatus = document.getElementById('v4MissionStatus');
      if (nextStatus) {
        nextStatus.className = 'v4-mission-status good';
        nextStatus.textContent = supported ? `Mission report refreshed across ${supported} post${supported === 1 ? '' : 's'}.` : 'No metrics were returned for these posts yet.';
      }
    } catch (error) {
      status.className = 'v4-mission-status error';
      status.textContent = `Metrics unavailable: ${error.message || 'this Buffer key/account may not expose post metrics yet.'}`;
      button.disabled = false;
      button.textContent = 'Retry metrics';
    }
  }

  const baseRenderHistory = renderHistory;
  renderHistory = function v4RenderHistory() {
    baseRenderHistory();
    const entries = state.history;
    document.querySelectorAll('#historyList .history-item').forEach((item, index) => {
      const entry = entries[index];
      if (!entry?.launchMode) return;
      const title = item.querySelector('.history-copy strong');
      if (title && !title.querySelector('.v4-history-mode')) {
        const badge = document.createElement('span');
        badge.className = 'v4-history-mode';
        badge.textContent = entry.launchMode === 'now' ? 'Immediate request' : MODE_CONFIG[entry.launchMode]?.label || entry.launchMode;
        title.appendChild(badge);
      }


    });
    renderMissionReport();
  };

  function hookDeckChanges() {
    const refresh = () => window.setTimeout(() => {
      renderVariantEditor();
      updateReadyHud();
    }, 0);

    document.getElementById('channelRow')?.addEventListener('click', refresh);
    document.getElementById('templatePicker')?.addEventListener('click', refresh);
    document.querySelectorAll('[data-compose-mode]').forEach((button) => button.addEventListener('click', refresh));
    document.getElementById('manualCompose')?.addEventListener('input', () => {
      if (variantPanelOpen) renderVariantEditor();
    });
    document.getElementById('tplSaveBtn')?.addEventListener('click', refresh);
    document.getElementById('clearManualBtn')?.addEventListener('click', refresh);
  }

  document.getElementById('disconnectBtn')?.addEventListener('click', () => {
    if (!localStorage.getItem(STORAGE.key)) Object.values(V4_STORAGE).forEach((key) => localStorage.removeItem(key));
  });

  function bootV4() {
    createVariantTools();
    createLaunchControl();
    createMissionPanel();
    hookDeckChanges();
    renderVariantEditor();
    renderLaunchControl();
    renderHistory();
    updateReadyHud();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootV4, { once: true });
  else bootV4();
})();
