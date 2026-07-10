/* ==========================================================
   UPLINK — Streamer Broadcast Deck
   Local-first UI with Buffer + Twitch integrations.
   ========================================================== */

const STORAGE = {
  key: 'uplink_buffer_key',
  orgId: 'uplink_org_id',
  channels: 'uplink_channels',
  templates: 'uplink_templates',
  selectedChannels: 'uplink_selected_channels',
  activeTemplate: 'uplink_active_template',
  twitchLogin: 'uplink_twitch_login',
  streamLink: 'uplink_stream_link',
  history: 'uplink_transmission_history',
  sound: 'uplink_sound_enabled',
  confirm: 'uplink_confirm_enabled',
};

const BUFFER_ENDPOINT = '/.netlify/functions/buffer-proxy';

const $ = (id) => document.getElementById(id);
const els = {
  setupView: $('setupView'),
  mainApp: $('mainApp'),
  keyInput: $('keyInput'),
  connectBtn: $('connectBtn'),
  revealKeyBtn: $('revealKeyBtn'),
  setupError: $('setupError'),

  channelRow: $('channelRow'),
  refreshChannels: $('refreshChannels'),
  selectedCount: $('selectedCount'),
  channelReadyStat: $('channelReadyStat'),

  templatePicker: $('templatePicker'),
  templatePreview: $('templatePreview'),
  templateStatus: $('templateStatus'),
  templateReadyStat: $('templateReadyStat'),
  mediaStatus: $('mediaStatus'),
  mediaReadyStat: $('mediaReadyStat'),
  charCount: $('charCount'),
  quickEditBtn: $('quickEditBtn'),
  duplicateActiveBtn: $('duplicateActiveBtn'),
  newFromConsoleBtn: $('newFromConsoleBtn'),
  jumpToTemplatesBtn: $('jumpToTemplatesBtn'),

  sendBtn: $('sendBtn'),
  sendBtnMain: $('sendBtnMain'),
  sendBtnSub: $('sendBtnSub'),
  sendLog: $('sendLog'),
  preflightText: $('preflightText'),
  preflightFill: $('preflightFill'),
  historyList: $('historyList'),
  clearHistoryBtn: $('clearHistoryBtn'),

  tplGrid: $('tplGrid'),
  tplEmpty: $('tplEmpty'),
  newTemplateBtn: $('newTemplateBtn'),
  tplModal: $('tplModal'),
  tplModalTitle: $('tplModalTitle'),
  tplCloseBtn: $('tplCloseBtn'),
  tplLabel: $('tplLabel'),
  tplType: $('tplType'),
  tplCopy: $('tplCopy'),
  tplCharCount: $('tplCharCount'),
  tplImage: $('tplImage'),
  tplSaveBtn: $('tplSaveBtn'),
  tplCancelBtn: $('tplCancelBtn'),

  twitchLoginInput: $('twitchLoginInput'),
  saveTwitchBtn: $('saveTwitchBtn'),
  twitchSaveStatus: $('twitchSaveStatus'),
  streamLinkInput: $('streamLinkInput'),
  saveStreamLinkBtn: $('saveStreamLinkBtn'),
  streamLinkSaveStatus: $('streamLinkSaveStatus'),
  disconnectBtn: $('disconnectBtn'),
  soundToggle: $('soundToggle'),
  confirmToggle: $('confirmToggle'),

  streamArt: $('streamArt'),
  streamThumb: $('streamThumb'),
  streamLiveFlag: $('streamLiveFlag'),
  streamStatusLabel: $('streamStatusLabel'),
  streamGame: $('streamGame'),
  streamTitle: $('streamTitle'),
  streamViewers: $('streamViewers'),
  streamStarted: $('streamStarted'),
  streamSignal: $('streamSignal'),
  streamRefreshBtn: $('streamRefreshBtn'),
  openSystemsBtn: $('openSystemsBtn'),
  topTwitchDot: $('topTwitchDot'),
  topTwitchStatus: $('topTwitchStatus'),
  twitchLiveBadge: $('twitchLiveBadge'),

  tplImagePreview: $('tplImagePreview'),
  tplFileInput: $('tplFileInput'),
  tplUploadBtn: $('tplUploadBtn'),
  tplTwitchBtn: $('tplTwitchBtn'),
  tplRemoveImageBtn: $('tplRemoveImageBtn'),
  tplImageStatus: $('tplImageStatus'),
  tplUrlBtn: $('tplUrlBtn'),
  tplUrlPanel: $('tplUrlPanel'),
  tplImageUrlInput: $('tplImageUrlInput'),
  tplImageUrlUseBtn: $('tplImageUrlUseBtn'),
  tplReuseBtn: $('tplReuseBtn'),
  tplReusePanel: $('tplReusePanel'),
  tplBrowsePostsBtn: $('tplBrowsePostsBtn'),
  tplBrowsePanel: $('tplBrowsePanel'),
  tplInsertLinkBtn: $('tplInsertLinkBtn'),
  tplInsertLinkStatus: $('tplInsertLinkStatus'),

  transmitOverlay: $('transmitOverlay'),
  transmitStamp: $('transmitStamp'),
  transmitLoadingLabel: $('transmitLoadingLabel'),
  screenFlash: $('screenFlash'),
};

const state = {
  channels: [],
  selectedChannelIds: new Set(),
  templates: [],
  activeTemplateId: null,
  editingTemplateId: null,
  liveData: null,
  history: [],
  sending: false,
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultTemplates() {
  return [
    {
      id: randomId(),
      label: 'Going live',
      type: 'Going Live',
      copy: '🔴 LIVE: {{game}} — {{title}}\n\n{{link}}',
      image: '',
    },
    {
      id: randomId(),
      label: 'Ranked climb',
      type: 'Ranked',
      copy: 'ranked climb is live. good comms, bad decisions, matchmaking has already chosen violence.\n\n{{link}}',
      image: '',
    },
    {
      id: randomId(),
      label: 'Community night',
      type: 'Community',
      copy: 'community night is live — bring your best loadout and your least reliable friends.\n\n{{link}}',
      image: '',
    },
    {
      id: randomId(),
      label: 'Late-night chaos',
      type: 'Going Live',
      copy: 'late-night {{game}}. the strategy gets worse from here.\n\n{{link}}',
      image: '',
    },
  ];
}

function normalizeTemplates(templates) {
  return (Array.isArray(templates) ? templates : []).map((template) => ({
    id: template.id || randomId(),
    label: template.label || 'Untitled loadout',
    type: template.type || 'Custom',
    copy: template.copy || '',
    image: template.image || '',
  }));
}

function boot() {
  const key = localStorage.getItem(STORAGE.key);
  if (!key) {
    els.setupView.style.display = 'grid';
    els.mainApp.style.display = 'none';
    return;
  }

  state.channels = loadJSON(STORAGE.channels, []);
  state.templates = normalizeTemplates(loadJSON(STORAGE.templates, defaultTemplates()));
  if (!state.templates.length) state.templates = defaultTemplates();
  state.selectedChannelIds = new Set(loadJSON(STORAGE.selectedChannels, []));
  state.activeTemplateId = localStorage.getItem(STORAGE.activeTemplate) || state.templates[0]?.id || null;
  state.history = loadJSON(STORAGE.history, []);

  if (!state.templates.some((template) => template.id === state.activeTemplateId)) {
    state.activeTemplateId = state.templates[0]?.id || null;
  }

  saveJSON(STORAGE.templates, state.templates);
  if (state.activeTemplateId) localStorage.setItem(STORAGE.activeTemplate, state.activeTemplateId);

  els.twitchLoginInput.value = localStorage.getItem(STORAGE.twitchLogin) || '';
  els.streamLinkInput.value = localStorage.getItem(STORAGE.streamLink) || '';

  showApp();
  syncSettingToggles();
  renderAll();
  renderTwitchState(null);
  checkTwitchLive();

  if (!state.channels.length) {
    fetchChannels(key).catch((error) => {
      els.sendLog.textContent = readableError(error, 'Could not load Buffer channels.');
    });
  }
}

function showApp() {
  els.setupView.style.display = 'none';
  els.mainApp.style.display = 'block';
}

function renderAll() {
  renderChannels();
  renderTemplatePicker();
  renderTemplatesTab();
  renderHistory();
  updateReadyHud();
}

/* ---------- connection ---------- */

els.revealKeyBtn.addEventListener('click', () => {
  const showing = els.keyInput.type === 'text';
  els.keyInput.type = showing ? 'password' : 'text';
  els.revealKeyBtn.textContent = showing ? 'Show' : 'Hide';
  els.revealKeyBtn.setAttribute('aria-label', showing ? 'Show token' : 'Hide token');
});

els.keyInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') els.connectBtn.click();
});

els.connectBtn.addEventListener('click', async () => {
  const key = els.keyInput.value.trim();
  if (!key) {
    showSetupError('Paste a Buffer access token to initialize Uplink.');
    return;
  }

  els.connectBtn.disabled = true;
  els.connectBtn.textContent = 'Linking…';
  els.setupError.style.display = 'none';

  try {
    localStorage.setItem(STORAGE.key, key);
    state.templates = normalizeTemplates(loadJSON(STORAGE.templates, defaultTemplates()));
    if (!state.templates.length) state.templates = defaultTemplates();
    state.activeTemplateId = state.templates[0]?.id || null;
    saveJSON(STORAGE.templates, state.templates);
    if (state.activeTemplateId) localStorage.setItem(STORAGE.activeTemplate, state.activeTemplateId);

    await fetchChannels(key);
    showApp();
    syncSettingToggles();
    renderAll();
    renderTwitchState(null);
    checkTwitchLive();
    playTone('ready');
  } catch (error) {
    localStorage.removeItem(STORAGE.key);
    showSetupError(readableError(error, 'Could not connect to Buffer.'));
  } finally {
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = 'Initialize';
  }
});

function showSetupError(message) {
  els.setupError.textContent = message;
  els.setupError.style.display = 'block';
}

function readableError(error, fallback) {
  if (isAuthError(error)) {
    return `Buffer rejected that token: ${error.message}. Generate a fresh token in Buffer and try again.`;
  }
  if (error?.code === 'RATE_LIMIT') return 'Buffer is rate-limiting requests. Give the network a moment, then retry.';
  return `${fallback} ${error?.message || ''}`.trim();
}

async function bufferRequest(key, query, variables = {}) {
  const response = await fetch(BUFFER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: key, query, variables }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error(`Buffer request failed (${response.status})`), { code: 'PROXY_BAD_RESPONSE' });
  }

  if (data.errors?.length) {
    const first = data.errors[0] || {};
    throw Object.assign(new Error(first.message || 'Buffer request failed'), {
      code: first.code,
      status: first.status,
      retryable: first.retryable,
    });
  }

  return data;
}

function isAuthError(error) {
  return error?.code === 'AUTH_ERROR';
}

async function fetchChannels(key) {
  const accountQuery = `query { account { organizations { id name } } }`;
  const accountData = await bufferRequest(key, accountQuery, {});
  const orgId = accountData?.data?.account?.organizations?.[0]?.id;
  if (!orgId) throw new Error('No Buffer organization was found for this token.');
  localStorage.setItem(STORAGE.orgId, orgId);

  const channelsQuery = `query C($organizationId: OrganizationId!) { channels(input:{organizationId:$organizationId}){ id displayName name service } }`;
  const channelsData = await bufferRequest(key, channelsQuery, { organizationId: orgId });
  state.channels = channelsData?.data?.channels || [];
  saveJSON(STORAGE.channels, state.channels);

  const hasSavedSelection = localStorage.getItem(STORAGE.selectedChannels) !== null;
  if (!hasSavedSelection) {
    state.channels.forEach((channel) => state.selectedChannelIds.add(channel.id));
    saveJSON(STORAGE.selectedChannels, [...state.selectedChannelIds]);
  } else {
    const validIds = new Set(state.channels.map((channel) => channel.id));
    state.selectedChannelIds = new Set([...state.selectedChannelIds].filter((id) => validIds.has(id)));
    saveJSON(STORAGE.selectedChannels, [...state.selectedChannelIds]);
  }

  renderChannels();
  updateReadyHud();
}

els.refreshChannels.addEventListener('click', async () => {
  const key = localStorage.getItem(STORAGE.key);
  if (!key) return;
  const original = els.refreshChannels.textContent;
  els.refreshChannels.textContent = 'Scanning…';
  try {
    await fetchChannels(key);
    els.sendLog.textContent = `Network refreshed. ${state.channels.length} channel${state.channels.length === 1 ? '' : 's'} detected.`;
    playTone('ready');
  } catch (error) {
    els.sendLog.textContent = readableError(error, 'Channel refresh failed.');
    playTone('fail');
  } finally {
    els.refreshChannels.textContent = original;
  }
});

/* ---------- channels ---------- */

function renderChannels() {
  els.channelRow.innerHTML = '';

  if (!state.channels.length) {
    els.channelRow.innerHTML = '<div class="empty-note">No Buffer channels detected yet. Refresh the network after connecting accounts in Buffer.</div>';
    return;
  }

  state.channels.forEach((channel) => {
    const active = state.selectedChannelIds.has(channel.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `channel-card${active ? ' active' : ''}`;
    card.setAttribute('aria-pressed', String(active));

    const icon = document.createElement('span');
    icon.className = 'channel-icon';
    icon.textContent = serviceInitials(channel.service || channel.name || '?');

    const copy = document.createElement('span');
    copy.className = 'channel-copy';
    const name = document.createElement('strong');
    name.textContent = channel.displayName || channel.name || channel.service || 'Channel';
    const service = document.createElement('span');
    service.textContent = channel.service || 'Buffer channel';
    copy.append(name, service);

    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.setAttribute('aria-hidden', 'true');

    card.append(icon, copy, toggle);
    card.addEventListener('click', () => {
      if (state.selectedChannelIds.has(channel.id)) state.selectedChannelIds.delete(channel.id);
      else state.selectedChannelIds.add(channel.id);
      saveJSON(STORAGE.selectedChannels, [...state.selectedChannelIds]);
      renderChannels();
      updateReadyHud();
      playTone('tick');
    });

    els.channelRow.appendChild(card);
  });
}

function serviceInitials(service) {
  const normalized = String(service).replace(/[^a-z0-9 ]/gi, ' ').trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return normalized.slice(0, 2).toUpperCase() || '?';
}

/* ---------- templates + dynamic tokens ---------- */

function activeTemplate() {
  return state.templates.find((template) => template.id === state.activeTemplateId) || null;
}

function resolveTemplateCopy(template, liveData = state.liveData) {
  if (!template) return '';
  const login = localStorage.getItem(STORAGE.twitchLogin) || '';
  const savedLink = localStorage.getItem(STORAGE.streamLink) || (login ? `https://twitch.tv/${login}` : '');
  const replacements = {
    game: liveData?.game || 'Live now',
    title: liveData?.title || 'Come hang out',
    viewers: Number.isFinite(liveData?.viewerCount) ? String(liveData.viewerCount) : '',
    link: savedLink,
  };

  let copy = String(template.copy || '').replace(/\{\{\s*(game|title|viewers|link)\s*\}\}/gi, (_, token) => replacements[token.toLowerCase()] || '');
  copy = copy
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
  return copy;
}

function renderTemplatePicker() {
  els.templatePicker.innerHTML = '';

  if (!state.templates.length) {
    els.templatePicker.innerHTML = '<div class="empty-note">No loadouts saved yet.</div>';
    renderPreview(null);
    return;
  }

  state.templates.forEach((template, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `template-chip${template.id === state.activeTemplateId ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(template.id === state.activeTemplateId));

    const slot = document.createElement('span');
    slot.className = 'slot';
    slot.textContent = index < 9 ? String(index + 1).padStart(2, '0') : '—';

    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = template.type || 'Custom';

    const label = document.createElement('strong');
    label.textContent = template.label;

    button.append(slot, type, label);
    button.addEventListener('click', () => selectTemplate(template.id));
    els.templatePicker.appendChild(button);
  });

  renderPreview(activeTemplate());
}

function selectTemplate(id, options = {}) {
  if (!state.templates.some((template) => template.id === id)) return;
  state.activeTemplateId = id;
  localStorage.setItem(STORAGE.activeTemplate, id);
  renderTemplatePicker();
  updateReadyHud();
  if (!options.silent) playTone('tick');
}

function renderPreview(template) {
  els.templatePreview.innerHTML = '';

  const media = document.createElement('div');
  media.className = 'preview-media';

  const copy = document.createElement('div');
  copy.className = 'preview-copy';
  const labelRow = document.createElement('div');
  labelRow.className = 'preview-label';
  const label = document.createElement('span');
  const count = document.createElement('span');
  const text = document.createElement('div');
  text.className = 'preview-text';

  if (!template) {
    media.textContent = 'TXT';
    label.textContent = 'No loadout selected';
    count.textContent = '—';
    text.classList.add('preview-empty');
    text.textContent = 'Choose a saved signal above or build one in Loadouts.';
  } else {
    const resolved = resolveTemplateCopy(template);
    label.textContent = `${template.type || 'Custom'} // ${template.label}`;
    count.textContent = `${resolved.length} chars`;
    text.textContent = resolved || template.copy;
    if (template.image) {
      media.style.backgroundImage = `url("${cssUrl(template.image)}")`;
      media.textContent = '';
    } else {
      media.textContent = 'TXT';
    }
  }

  labelRow.append(label, count);
  copy.append(labelRow, text);
  els.templatePreview.append(media, copy);

  els.quickEditBtn.disabled = !template;
  els.duplicateActiveBtn.disabled = !template;
}

function renderTemplatesTab() {
  els.tplGrid.innerHTML = '';
  els.tplEmpty.style.display = state.templates.length ? 'none' : 'block';

  state.templates.forEach((template) => {
    const card = document.createElement('article');
    card.className = 'tpl-card';

    const media = document.createElement('div');
    media.className = 'tpl-card-media';
    if (template.image) media.style.backgroundImage = `url("${cssUrl(template.image)}")`;

    const body = document.createElement('div');
    body.className = 'tpl-card-body';
    const type = document.createElement('span');
    type.className = 'tag';
    type.textContent = `${template.type || 'Custom'} // ${template.image ? 'Visual armed' : 'Text signal'}`;
    const heading = document.createElement('h3');
    heading.textContent = template.label;
    const copy = document.createElement('p');
    copy.textContent = template.copy;

    const actions = document.createElement('div');
    actions.className = 'tpl-card-actions';
    actions.append(
      actionButton('Use', () => {
        selectTemplate(template.id, { silent: true });
        switchTab('console');
        playTone('ready');
      }),
      actionButton('Edit', () => openTemplateModal(template.id)),
      actionButton('Duplicate', () => duplicateTemplate(template.id)),
      actionButton('Delete', () => deleteTemplate(template.id))
    );

    body.append(type, heading, copy, actions);
    card.append(media, body);
    els.tplGrid.appendChild(card);
  });
}

function actionButton(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function duplicateTemplate(id) {
  const source = state.templates.find((template) => template.id === id);
  if (!source) return;
  const clone = { ...source, id: randomId(), label: `${source.label} copy` };
  const index = state.templates.findIndex((template) => template.id === id);
  state.templates.splice(index + 1, 0, clone);
  state.activeTemplateId = clone.id;
  persistTemplates();
  renderAll();
  playTone('ready');
}

function deleteTemplate(id) {
  const template = state.templates.find((item) => item.id === id);
  if (!template) return;
  if (!window.confirm(`Delete the “${template.label}” loadout?`)) return;

  state.templates = state.templates.filter((item) => item.id !== id);
  if (state.activeTemplateId === id) state.activeTemplateId = state.templates[0]?.id || null;
  persistTemplates();
  renderAll();
}

function persistTemplates() {
  saveJSON(STORAGE.templates, state.templates);
  if (state.activeTemplateId) localStorage.setItem(STORAGE.activeTemplate, state.activeTemplateId);
  else localStorage.removeItem(STORAGE.activeTemplate);
}

function openTemplateModal(id = null) {
  state.editingTemplateId = id;
  const template = id ? state.templates.find((item) => item.id === id) : null;
  els.tplModalTitle.textContent = template ? 'Edit loadout' : 'Build loadout';
  els.tplLabel.value = template?.label || '';
  els.tplType.value = template?.type || 'Going Live';
  els.tplCopy.value = template?.copy || '';
  setTemplateImage(template?.image || '');
  els.tplImageStatus.textContent = '';
  els.tplInsertLinkStatus.textContent = '';
  hideMediaPanels();
  updateModalCharCount();
  els.tplModal.classList.add('show');
  window.setTimeout(() => els.tplLabel.focus(), 40);
}

function closeTemplateModal() {
  els.tplModal.classList.remove('show');
  state.editingTemplateId = null;
}

function saveTemplateFromModal() {
  const label = els.tplLabel.value.trim();
  const copy = els.tplCopy.value.trim();
  const type = els.tplType.value || 'Custom';
  const image = els.tplImage.value.trim();

  if (!label) {
    els.tplLabel.focus();
    els.tplImageStatus.textContent = 'Give this loadout a name.';
    return;
  }
  if (!copy) {
    els.tplCopy.focus();
    els.tplImageStatus.textContent = 'Add the signal copy before saving.';
    return;
  }

  if (state.editingTemplateId) {
    const template = state.templates.find((item) => item.id === state.editingTemplateId);
    if (!template) return;
    Object.assign(template, { label, type, copy, image });
    state.activeTemplateId = template.id;
  } else {
    const template = { id: randomId(), label, type, copy, image };
    state.templates.unshift(template);
    state.activeTemplateId = template.id;
  }

  persistTemplates();
  closeTemplateModal();
  renderAll();
  playTone('ready');
}

els.newTemplateBtn.addEventListener('click', () => openTemplateModal());
els.newFromConsoleBtn.addEventListener('click', () => openTemplateModal());
els.tplCancelBtn.addEventListener('click', closeTemplateModal);
els.tplCloseBtn.addEventListener('click', closeTemplateModal);
els.tplSaveBtn.addEventListener('click', saveTemplateFromModal);
els.quickEditBtn.addEventListener('click', () => {
  const template = activeTemplate();
  if (template) openTemplateModal(template.id);
});
els.duplicateActiveBtn.addEventListener('click', () => {
  const template = activeTemplate();
  if (template) duplicateTemplate(template.id);
});
els.jumpToTemplatesBtn.addEventListener('click', () => switchTab('templates'));

els.tplModal.addEventListener('click', (event) => {
  if (event.target === els.tplModal) closeTemplateModal();
});

els.tplCopy.addEventListener('input', updateModalCharCount);

function updateModalCharCount() {
  els.tplCharCount.textContent = `${els.tplCopy.value.length} characters`;
}

document.querySelectorAll('[data-token]').forEach((button) => {
  button.addEventListener('click', () => insertAtCursor(els.tplCopy, button.dataset.token));
});

function insertAtCursor(textarea, value) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const needsSpace = before && !/\s$/.test(before) && value !== '\n';
  const insert = `${needsSpace ? ' ' : ''}${value}`;
  textarea.value = before + insert + after;
  const cursor = start + insert.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  updateModalCharCount();
  playTone('tick');
}

els.tplInsertLinkBtn.addEventListener('click', () => {
  const link = localStorage.getItem(STORAGE.streamLink);
  if (!link) {
    els.tplInsertLinkStatus.textContent = 'No stream link saved. Use {{link}} or add one in Systems.';
    return;
  }
  if (els.tplCopy.value.includes(link)) {
    els.tplInsertLinkStatus.textContent = 'That saved link is already in this loadout.';
    return;
  }
  insertAtCursor(els.tplCopy, link);
  els.tplInsertLinkStatus.textContent = 'Saved stream link inserted.';
  window.setTimeout(() => { els.tplInsertLinkStatus.textContent = ''; }, 2200);
});

/* ---------- Twitch ---------- */

async function checkTwitchLive(options = {}) {
  const login = localStorage.getItem(STORAGE.twitchLogin);
  if (!login) {
    state.liveData = null;
    if (options.updateUI !== false) renderTwitchState(null);
    renderPreview(activeTemplate());
    updateReadyHud();
    return null;
  }

  if (options.updateUI !== false) {
    els.streamRefreshBtn.disabled = true;
    els.streamRefreshBtn.textContent = 'Scanning…';
  }

  try {
    const response = await fetch(`/.netlify/functions/twitch-proxy?login=${encodeURIComponent(login)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Twitch lookup failed');
    state.liveData = data;
    if (options.updateUI !== false) renderTwitchState(data);
    renderPreview(activeTemplate());
    updateReadyHud();
    return data;
  } catch (error) {
    state.liveData = { live: false, error: error.message };
    if (options.updateUI !== false) renderTwitchState(state.liveData);
    return null;
  } finally {
    if (options.updateUI !== false) {
      els.streamRefreshBtn.disabled = false;
      els.streamRefreshBtn.textContent = 'Refresh Twitch';
    }
  }
}

function renderTwitchState(data) {
  const login = localStorage.getItem(STORAGE.twitchLogin);
  els.streamArt.classList.remove('has-image');
  els.streamThumb.removeAttribute('src');
  els.streamLiveFlag.classList.remove('live');
  els.topTwitchDot.classList.remove('live');
  els.topTwitchDot.classList.add('offline');

  if (!login) {
    els.streamLiveFlag.textContent = 'Twitch standby';
    els.streamStatusLabel.textContent = 'No Twitch channel linked';
    els.streamGame.textContent = 'Connect your channel for live intelligence';
    els.streamTitle.textContent = 'Uplink can pull your current game, title, viewer count, and live thumbnail into the deck.';
    els.streamViewers.textContent = '—';
    els.streamStarted.textContent = '—';
    els.streamSignal.textContent = 'Offline';
    els.topTwitchStatus.textContent = 'Twitch idle';
    return;
  }

  if (data?.error) {
    els.streamLiveFlag.textContent = 'Signal error';
    els.streamStatusLabel.textContent = `Could not read @${login}`;
    els.streamGame.textContent = 'Twitch signal unavailable';
    els.streamTitle.textContent = data.error;
    els.streamViewers.textContent = '—';
    els.streamStarted.textContent = '—';
    els.streamSignal.textContent = 'Error';
    els.topTwitchStatus.textContent = 'Twitch error';
    return;
  }

  if (data?.live) {
    els.streamLiveFlag.textContent = 'Live now';
    els.streamLiveFlag.classList.add('live');
    els.streamStatusLabel.textContent = `@${login} is broadcasting`;
    els.streamGame.textContent = data.game || 'Live on Twitch';
    els.streamTitle.textContent = data.title || 'No stream title set.';
    els.streamViewers.textContent = formatNumber(data.viewerCount ?? 0);
    els.streamStarted.textContent = formatElapsed(data.startedAt);
    els.streamSignal.textContent = 'Live';
    els.topTwitchDot.classList.remove('offline');
    els.topTwitchDot.classList.add('live');
    els.topTwitchStatus.textContent = 'Twitch live';
    if (data.thumbnailUrl) {
      els.streamThumb.src = `${data.thumbnailUrl}${data.thumbnailUrl.includes('?') ? '&' : '?'}uplink=${Date.now()}`;
      els.streamArt.classList.add('has-image');
    }
    return;
  }

  els.streamLiveFlag.textContent = 'Channel offline';
  els.streamStatusLabel.textContent = `@${login} is connected`;
  els.streamGame.textContent = 'Ready for the next broadcast';
  els.streamTitle.textContent = 'Go live, then refresh Uplink to pull your current stream data into dynamic loadouts.';
  els.streamViewers.textContent = '0';
  els.streamStarted.textContent = '—';
  els.streamSignal.textContent = 'Standby';
  els.topTwitchStatus.textContent = 'Twitch standby';
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function formatElapsed(dateString) {
  if (!dateString) return '—';
  const started = new Date(dateString).getTime();
  if (!Number.isFinite(started)) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

els.streamRefreshBtn.addEventListener('click', async () => {
  const data = await checkTwitchLive();
  playTone(data?.live ? 'ready' : 'tick');
});

els.openSystemsBtn.addEventListener('click', () => switchTab('settings'));

els.saveTwitchBtn.addEventListener('click', async () => {
  const login = els.twitchLoginInput.value.trim().replace(/^@/, '').toLowerCase();
  if (!login) {
    localStorage.removeItem(STORAGE.twitchLogin);
    els.twitchSaveStatus.textContent = 'Twitch channel cleared.';
    state.liveData = null;
    renderTwitchState(null);
    return;
  }

  localStorage.setItem(STORAGE.twitchLogin, login);
  if (!localStorage.getItem(STORAGE.streamLink)) {
    const link = `https://twitch.tv/${login}`;
    localStorage.setItem(STORAGE.streamLink, link);
    els.streamLinkInput.value = link;
  }
  els.twitchSaveStatus.textContent = 'Channel linked. Scanning Twitch…';
  const data = await checkTwitchLive();
  els.twitchSaveStatus.textContent = data?.live ? 'Linked — live signal detected.' : 'Linked — channel is currently offline.';
  playTone('ready');
  window.setTimeout(() => { els.twitchSaveStatus.textContent = ''; }, 3200);
});

els.saveStreamLinkBtn.addEventListener('click', () => {
  const link = els.streamLinkInput.value.trim();
  if (link && !/^https?:\/\//i.test(link)) {
    els.streamLinkSaveStatus.textContent = 'Use a full URL beginning with http:// or https://';
    return;
  }
  if (link) localStorage.setItem(STORAGE.streamLink, link);
  else localStorage.removeItem(STORAGE.streamLink);
  els.streamLinkSaveStatus.textContent = link ? 'Primary stream link saved.' : 'Primary stream link cleared.';
  renderPreview(activeTemplate());
  updateReadyHud();
  playTone('ready');
  window.setTimeout(() => { els.streamLinkSaveStatus.textContent = ''; }, 2500);
});

els.tplTwitchBtn.addEventListener('click', async () => {
  const login = localStorage.getItem(STORAGE.twitchLogin);
  if (!login) {
    els.tplImageStatus.textContent = 'Link your Twitch channel in Systems first.';
    return;
  }
  els.tplImageStatus.textContent = 'Scanning Twitch…';
  const data = await checkTwitchLive();
  if (!data?.live || !data.thumbnailUrl) {
    els.tplImageStatus.textContent = `@${login} is not live, so no current thumbnail is available.`;
    return;
  }
  setTemplateImage(data.thumbnailUrl);
  els.tplImageStatus.textContent = 'Current live thumbnail armed.';
  playTone('ready');
});

/* ---------- image sources ---------- */

function setTemplateImage(url) {
  els.tplImage.value = url || '';
  if (url) {
    els.tplImagePreview.style.backgroundImage = `url("${cssUrl(url)}")`;
    els.tplImagePreview.textContent = '';
    els.tplRemoveImageBtn.style.display = 'inline-flex';
  } else {
    els.tplImagePreview.style.backgroundImage = '';
    els.tplImagePreview.textContent = 'No visual selected';
    els.tplRemoveImageBtn.style.display = 'none';
  }
}

function cssUrl(url) {
  return String(url || '').replace(/["\\\n\r]/g, '');
}

function hideMediaPanels() {
  els.tplUrlPanel.style.display = 'none';
  els.tplReusePanel.style.display = 'none';
  els.tplBrowsePanel.style.display = 'none';
}

els.tplUploadBtn.addEventListener('click', () => els.tplFileInput.click());
els.tplRemoveImageBtn.addEventListener('click', () => {
  setTemplateImage('');
  els.tplImageStatus.textContent = 'Visual removed.';
});

els.tplFileInput.addEventListener('change', async () => {
  const file = els.tplFileInput.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    els.tplImageStatus.textContent = 'That file is larger than the 8MB upload limit.';
    els.tplFileInput.value = '';
    return;
  }

  els.tplImageStatus.textContent = 'Uploading visual…';
  try {
    const dataUrl = await fileToDataUrl(file);
    const response = await fetch('/.netlify/functions/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed');
    setTemplateImage(data.url);
    els.tplImageStatus.textContent = 'Visual uploaded and armed.';
    playTone('ready');
  } catch (error) {
    els.tplImageStatus.textContent = `Upload failed: ${error.message}`;
    playTone('fail');
  } finally {
    els.tplFileInput.value = '';
  }
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

els.tplUrlBtn.addEventListener('click', () => {
  const opening = els.tplUrlPanel.style.display === 'none';
  hideMediaPanels();
  if (!opening) return;
  els.tplUrlPanel.style.display = 'block';
  els.tplImageUrlInput.value = '';
  els.tplImageUrlInput.focus();
});

els.tplImageUrlUseBtn.addEventListener('click', () => {
  const url = els.tplImageUrlInput.value.trim();
  if (!/^https?:\/\//i.test(url)) {
    els.tplImageStatus.textContent = 'Paste a public image URL beginning with http:// or https://';
    return;
  }
  setTemplateImage(url);
  els.tplImageStatus.textContent = 'Public image URL armed.';
  hideMediaPanels();
});

els.tplImageUrlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    els.tplImageUrlUseBtn.click();
  }
});

els.tplReuseBtn.addEventListener('click', () => {
  const opening = els.tplReusePanel.style.display === 'none';
  hideMediaPanels();
  if (!opening) return;

  const withImages = state.templates.filter((template) => template.image && template.id !== state.editingTemplateId);
  els.tplReusePanel.innerHTML = '';
  els.tplReusePanel.className = 'media-panel';

  if (!withImages.length) {
    els.tplReusePanel.innerHTML = '<div class="empty-note">No other loadouts have a reusable visual.</div>';
  } else {
    els.tplReusePanel.classList.add('reuse-grid');
    withImages.forEach((template) => {
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'reuse-thumb';
      thumb.style.backgroundImage = `url("${cssUrl(template.image)}")`;
      thumb.title = template.label;
      thumb.setAttribute('aria-label', `Use visual from ${template.label}`);
      thumb.addEventListener('click', () => {
        setTemplateImage(template.image);
        els.tplImageStatus.textContent = `Visual reused from “${template.label}.”`;
        hideMediaPanels();
      });
      els.tplReusePanel.appendChild(thumb);
    });
  }
  els.tplReusePanel.style.display = 'flex';
});

async function fetchRecentPostsWithMedia(key) {
  const orgId = localStorage.getItem(STORAGE.orgId);
  if (!orgId) throw new Error('No organization is cached. Refresh the Buffer network first.');

  const introspectQuery = `query { __type(name: "Post") { fields { name } } }`;
  const introspectData = await bufferRequest(key, introspectQuery, {});
  const fieldNames = (introspectData?.data?.__type?.fields || []).map((field) => field.name);
  const mediaField = fieldNames.find((name) => /^(assets|media|attachments|images)$/i.test(name))
    || fieldNames.find((name) => /asset|media|attach|image/i.test(name))
    || null;

  const runPosts = async (nodeExtra) => {
    const query = `query GetRecent($organizationId: OrganizationId!, $first: Int!) {
      posts(first: $first, input: { organizationId: $organizationId, filter: { status: [sent] } }) {
        edges { node { id text dueAt channelId${nodeExtra ? ` ${nodeExtra}` : ''} } }
      }
    }`;
    const data = await bufferRequest(key, query, { organizationId: orgId, first: 20 });
    return (data?.data?.posts?.edges || []).map((edge) => edge.node);
  };

  if (!mediaField) {
    const posts = await runPosts('');
    return { posts: posts.map((post) => ({ ...post, imageUrl: null })), mediaField: null };
  }

  const candidateShapes = [
    `${mediaField} { ... on ImageAsset { url } }`,
    `${mediaField} { images { url } }`,
    `${mediaField} { image { url } }`,
    `${mediaField} { url }`,
    `${mediaField}`,
  ];

  for (const shape of candidateShapes) {
    try {
      const posts = await runPosts(shape);
      return {
        posts: posts.map((post) => ({ ...post, imageUrl: extractImageUrl(post[mediaField]) })),
        mediaField,
      };
    } catch (error) {
      if (!/cannot query field|does not exist|unknown field/i.test(String(error.message || ''))) throw error;
    }
  }

  const posts = await runPosts('');
  return { posts: posts.map((post) => ({ ...post, imageUrl: null })), mediaField };
}

function extractImageUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    if (typeof value.url === 'string') return value.url;
    if (value.image) return extractImageUrl(value.image);
    if (value.images) return extractImageUrl(value.images);
  }
  return null;
}

els.tplBrowsePostsBtn.addEventListener('click', async () => {
  const opening = els.tplBrowsePanel.style.display === 'none';
  hideMediaPanels();
  if (!opening) return;

  els.tplBrowsePanel.style.display = 'block';
  els.tplBrowsePanel.innerHTML = '<div class="empty-note">Scanning recent Buffer posts…</div>';

  try {
    const key = localStorage.getItem(STORAGE.key);
    const { posts, mediaField } = await fetchRecentPostsWithMedia(key);
    if (!mediaField) {
      els.tplBrowsePanel.innerHTML = '<div class="empty-note">Buffer did not expose a readable media field for this account. Paste the image URL instead.</div>';
      return;
    }

    const withImages = posts.filter((post) => post.imageUrl);
    if (!withImages.length) {
      els.tplBrowsePanel.innerHTML = '<div class="empty-note">No reusable images were resolved from recent posts.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'browse-list';
    withImages.slice(0, 12).forEach((post) => {
      const row = document.createElement('div');
      row.className = 'browse-item';
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.style.backgroundImage = `url("${cssUrl(post.imageUrl)}")`;
      const text = document.createElement('div');
      text.className = 'txt';
      text.textContent = post.text || '(no text)';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Use';
      button.addEventListener('click', () => {
        setTemplateImage(post.imageUrl);
        els.tplImageStatus.textContent = 'Visual reused from a past Buffer post.';
        hideMediaPanels();
      });
      row.append(thumb, text, button);
      list.appendChild(row);
    });
    els.tplBrowsePanel.innerHTML = '';
    els.tplBrowsePanel.appendChild(list);
  } catch (error) {
    els.tplBrowsePanel.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = `Could not load past posts: ${error.message || 'unknown error'}`;
    els.tplBrowsePanel.appendChild(note);
  }
});

/* ---------- pre-flight + sending ---------- */

function updateReadyHud() {
  const template = activeTemplate();
  const targetCount = state.selectedChannelIds.size;
  const hasChannels = targetCount > 0;
  const hasTemplate = Boolean(template);
  const resolvedCopy = resolveTemplateCopy(template);
  const readyCount = Number(hasChannels) + Number(hasTemplate);

  els.selectedCount.textContent = `${targetCount} channel${targetCount === 1 ? '' : 's'}`;
  els.channelReadyStat.classList.toggle('ready', hasChannels);
  els.templateStatus.textContent = template?.label || 'None selected';
  els.templateReadyStat.classList.toggle('ready', hasTemplate);
  els.mediaStatus.textContent = template?.image ? 'Visual armed' : 'Text only';
  els.mediaReadyStat.classList.toggle('ready', Boolean(template?.image));
  els.charCount.textContent = `${resolvedCopy.length} chars`;

  els.preflightText.textContent = `${readyCount} / 2 ready`;
  els.preflightFill.style.width = `${readyCount * 50}%`;
  els.sendBtn.disabled = !(hasChannels && hasTemplate) || state.sending;

  if (state.sending) {
    els.sendBtnMain.textContent = 'Routing Signal';
    els.sendBtnSub.textContent = `Sending to ${targetCount} target${targetCount === 1 ? '' : 's'}`;
  } else if (!hasChannels && !hasTemplate) {
    els.sendBtnMain.textContent = 'Transmit Uplink';
    els.sendBtnSub.textContent = 'Choose channels + loadout';
  } else if (!hasChannels) {
    els.sendBtnMain.textContent = 'Arm Channels';
    els.sendBtnSub.textContent = 'Select at least one target';
  } else if (!hasTemplate) {
    els.sendBtnMain.textContent = 'Load Signal';
    els.sendBtnSub.textContent = 'Select a saved loadout';
  } else {
    els.sendBtnMain.textContent = 'Transmit Uplink';
    els.sendBtnSub.textContent = `${targetCount} target${targetCount === 1 ? '' : 's'} armed`;
  }
}

els.sendBtn.addEventListener('click', () => sendUplink(activeTemplate()));

async function sendUplink(template) {
  if (state.sending || !template) return;
  const key = localStorage.getItem(STORAGE.key);
  const targets = state.channels.filter((channel) => state.selectedChannelIds.has(channel.id));
  if (!key || !targets.length) return;

  if (isSettingEnabled(STORAGE.confirm)) {
    const confirmed = window.confirm(`Transmit “${template.label}” to ${targets.length} channel${targets.length === 1 ? '' : 's'} now?`);
    if (!confirmed) return;
  }

  state.sending = true;
  els.sendBtn.classList.add('sending');
  els.sendLog.textContent = 'Pre-flight complete. Routing signal through Buffer…';
  updateReadyHud();
  showTransmitLoading();
  playTone('launch');

  try {
    const needsLiveData = /\{\{\s*(game|title|viewers)\s*\}\}/i.test(template.copy);
    if (needsLiveData && localStorage.getItem(STORAGE.twitchLogin)) {
      await checkTwitchLive({ updateUI: true });
    }

    const renderedTemplate = { ...template, copy: resolveTemplateCopy(template) };
    if (!renderedTemplate.copy) throw new Error('This loadout resolves to empty copy. Add text or configure its dynamic tokens.');

    const results = await Promise.allSettled(targets.map((channel) => postOne(key, channel, renderedTemplate)));
    const okCount = results.filter((result) => result.status === 'fulfilled').length;
    const failures = results.filter((result) => result.status === 'rejected');
    const failCount = failures.length;
    const firstError = failures[0]?.reason;
    const anyExpired = failures.some((result) => isAuthError(result.reason));

    if (anyExpired) {
      els.sendLog.textContent = readableError(firstError, 'Buffer rejected the token.');
      playTransmitFailAnimation();
      playTone('fail');
    } else if (okCount > 0) {
      els.sendLog.textContent = failCount
        ? `Signal reached ${okCount} channel${okCount === 1 ? '' : 's'}; ${failCount} failed: ${firstError?.message || 'unknown error'}.`
        : `Signal live on ${okCount} channel${okCount === 1 ? '' : 's'}. Queue cleared. Go play.`;
      playTransmitAnimation();
      playTone('success');
      if (navigator.vibrate) navigator.vibrate([35, 35, 65]);
    } else {
      els.sendLog.textContent = `Transmission failed: ${firstError?.message || 'unknown Buffer error'}.`;
      playTransmitFailAnimation();
      playTone('fail');
    }

    addHistoryEntry({
      template: template.label,
      success: okCount,
      failed: failCount,
      targetCount: targets.length,
      channels: targets.map((channel) => channel.displayName || channel.service),
    });
  } catch (error) {
    els.sendLog.textContent = `Transmission failed: ${error.message || 'unknown error'}.`;
    playTransmitFailAnimation();
    playTone('fail');
    addHistoryEntry({ template: template.label, success: 0, failed: targets.length, targetCount: targets.length, channels: targets.map((channel) => channel.displayName || channel.service) });
  } finally {
    state.sending = false;
    els.sendBtn.classList.remove('sending');
    hideTransmitLoading();
    updateReadyHud();
  }
}

async function postOne(key, channel, template) {
  const mutation = `mutation CreatePost($input:CreatePostInput!){createPost(input:$input){__typename ... on PostActionSuccess{post{id dueAt text channelId}} ... on MutationError{message}}}`;
  const input = {
    channelId: channel.id,
    text: template.copy,
    schedulingType: 'automatic',
    mode: 'shareNow',
  };
  if (template.image) input.assets = [{ image: { url: template.image } }];

  const response = await bufferRequest(key, mutation, { input });
  const result = response?.data?.createPost;
  if (!result) throw new Error('Buffer returned an empty post response.');
  if (result.__typename === 'MutationError') throw new Error(result.message || 'Buffer rejected this post.');
  if (result.__typename !== 'PostActionSuccess') throw new Error(result.message || `Unexpected Buffer result: ${result.__typename}`);
  return result;
}

/* ---------- local history ---------- */

function addHistoryEntry(entry) {
  state.history.unshift({ id: randomId(), timestamp: Date.now(), ...entry });
  state.history = state.history.slice(0, 12);
  saveJSON(STORAGE.history, state.history);
  renderHistory();
}

function renderHistory() {
  els.historyList.innerHTML = '';
  if (!state.history.length) {
    els.historyList.innerHTML = '<div class="empty-note">No transmissions yet. The timeline is suspiciously peaceful.</div>';
    return;
  }

  state.history.slice(0, 6).forEach((entry) => {
    const item = document.createElement('div');
    const failed = !entry.success;
    item.className = `history-item${failed ? ' fail' : ''}`;

    const icon = document.createElement('div');
    icon.className = 'history-icon';
    icon.textContent = failed ? '×' : '✓';

    const copy = document.createElement('div');
    copy.className = 'history-copy';
    const title = document.createElement('strong');
    title.textContent = entry.template || 'Unnamed loadout';
    const meta = document.createElement('span');
    meta.textContent = `${formatRelativeTime(entry.timestamp)} · ${entry.targetCount || 0} target${entry.targetCount === 1 ? '' : 's'}`;
    copy.append(title, meta);

    const result = document.createElement('div');
    result.className = 'history-result';
    result.textContent = failed ? 'Failed' : `${entry.success} live`;

    item.append(icon, copy, result);
    els.historyList.appendChild(item);
  });
}

function formatRelativeTime(timestamp) {
  const diff = Math.max(0, Date.now() - Number(timestamp || 0));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

els.clearHistoryBtn.addEventListener('click', () => {
  if (!state.history.length) return;
  if (!window.confirm('Clear local transmission history?')) return;
  state.history = [];
  localStorage.removeItem(STORAGE.history);
  renderHistory();
});

/* ---------- settings ---------- */

function isSettingEnabled(key) {
  return localStorage.getItem(key) === 'true';
}

function syncSettingToggles() {
  syncToggle(els.soundToggle, isSettingEnabled(STORAGE.sound));
  syncToggle(els.confirmToggle, isSettingEnabled(STORAGE.confirm));
}

function syncToggle(element, active) {
  element.classList.toggle('active', active);
  element.setAttribute('aria-checked', String(active));
}

els.soundToggle.addEventListener('click', () => {
  const next = !isSettingEnabled(STORAGE.sound);
  localStorage.setItem(STORAGE.sound, String(next));
  syncToggle(els.soundToggle, next);
  if (next) playTone('ready');
});

els.confirmToggle.addEventListener('click', () => {
  const next = !isSettingEnabled(STORAGE.confirm);
  localStorage.setItem(STORAGE.confirm, String(next));
  syncToggle(els.confirmToggle, next);
  playTone('tick');
});

els.disconnectBtn.addEventListener('click', () => {
  if (!window.confirm('Disconnect Buffer and wipe all Uplink data stored in this browser?')) return;
  Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
  window.location.reload();
});

/* ---------- navigation + shortcuts ---------- */

document.querySelectorAll('.tab-btn').forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${tab}`));
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

document.addEventListener('keydown', (event) => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  const typing = ['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable;

  if (event.key === 'Escape' && els.tplModal.classList.contains('show')) {
    closeTemplateModal();
    return;
  }

  if (typing || els.tplModal.classList.contains('show')) return;

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    if (!els.sendBtn.disabled) els.sendBtn.click();
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && /^[1-9]$/.test(event.key)) {
    const template = state.templates[Number(event.key) - 1];
    if (template) selectTemplate(template.id);
  }
});

/* ---------- sound + motion ---------- */

let audioContext = null;
function playTone(kind) {
  if (!isSettingEnabled(STORAGE.sound)) return;
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const tones = {
      tick: [[520, 0, .035, .035]],
      ready: [[420, 0, .045, .04], [620, .06, .06, .045]],
      launch: [[180, 0, .08, .04], [260, .08, .09, .04]],
      success: [[390, 0, .08, .05], [560, .08, .08, .05], [760, .16, .12, .045]],
      fail: [[170, 0, .13, .055], [115, .12, .18, .05]],
    };
    (tones[kind] || tones.tick).forEach(([frequency, delay, duration, gain]) => scheduleTone(frequency, delay, duration, gain));
  } catch {
    // Audio is an enhancement; silently ignore blocked contexts.
  }
}

function scheduleTone(frequency, delay, duration, gainAmount) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(gainAmount, audioContext.currentTime + delay + .01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + delay + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(audioContext.currentTime + delay);
  oscillator.stop(audioContext.currentTime + delay + duration + .02);
}

function showTransmitLoading() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  els.transmitOverlay.classList.remove('playing', 'fading', 'failing');
  els.transmitOverlay.classList.add('searching');
}

function hideTransmitLoading() {
  els.transmitOverlay.classList.remove('searching');
}

function playTransmitAnimation() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  els.transmitStamp.textContent = 'Signal Live';
  els.screenFlash.classList.remove('flash');
  void els.screenFlash.offsetWidth;
  els.screenFlash.classList.add('flash');
  els.transmitOverlay.classList.remove('fading', 'searching', 'failing');
  els.transmitOverlay.classList.add('playing');
  window.setTimeout(() => els.transmitOverlay.classList.add('fading'), 900);
  window.setTimeout(() => els.transmitOverlay.classList.remove('playing', 'fading'), 1350);
}

function playTransmitFailAnimation() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  els.transmitStamp.textContent = 'Signal Lost';
  els.transmitOverlay.classList.remove('fading', 'searching', 'playing');
  els.transmitOverlay.classList.add('failing');
  window.setTimeout(() => els.transmitOverlay.classList.add('fading'), 650);
  window.setTimeout(() => {
    els.transmitOverlay.classList.remove('failing', 'fading');
    els.transmitStamp.textContent = 'Signal Live';
  }, 1100);
}

boot();
