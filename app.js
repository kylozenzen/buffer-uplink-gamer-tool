/* ==========================================================
   UPLINK — app logic
   Storage: everything lives in localStorage. Requests go
   straight from the browser to Buffer's GraphQL API
   (https://api.buffer.com) with the pasted personal access
   token as a Bearer header — no proxy in the loop. See the
   note above BUFFER_ENDPOINT for why, and buffer-proxy.js if
   you need a server-side fallback.
   ========================================================== */

const STORAGE = {
  key: 'uplink_buffer_key',
  orgId: 'uplink_org_id',
  channels: 'uplink_channels',
  templates: 'uplink_templates',
  selectedChannels: 'uplink_selected_channels',
  activeTemplate: 'uplink_active_template',
};

const els = {
  setupView: document.getElementById('setupView'),
  mainApp: document.getElementById('mainApp'),
  keyInput: document.getElementById('keyInput'),
  connectBtn: document.getElementById('connectBtn'),
  setupError: document.getElementById('setupError'),
  channelRow: document.getElementById('channelRow'),
  refreshChannels: document.getElementById('refreshChannels'),
  templatePicker: document.getElementById('templatePicker'),
  templatePreview: document.getElementById('templatePreview'),
  sendBtn: document.getElementById('sendBtn'),
  sendLog: document.getElementById('sendLog'),
  tplGrid: document.getElementById('tplGrid'),
  tplEmpty: document.getElementById('tplEmpty'),
  newTemplateBtn: document.getElementById('newTemplateBtn'),
  tplModal: document.getElementById('tplModal'),
  tplModalTitle: document.getElementById('tplModalTitle'),
  tplLabel: document.getElementById('tplLabel'),
  tplCopy: document.getElementById('tplCopy'),
  tplImage: document.getElementById('tplImage'),
  tplSaveBtn: document.getElementById('tplSaveBtn'),
  tplCancelBtn: document.getElementById('tplCancelBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
};

let state = {
  channels: [],
  selectedChannelIds: new Set(),
  templates: [],
  activeTemplateId: null,
  editingTemplateId: null,
};

// ---------- storage helpers ----------
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- boot ----------
function boot() {
  const key = localStorage.getItem(STORAGE.key);
  if (key) {
    showApp();
    state.channels = loadJSON(STORAGE.channels, []);
    state.templates = loadJSON(STORAGE.templates, defaultTemplates());
    state.selectedChannelIds = new Set(loadJSON(STORAGE.selectedChannels, []));
    state.activeTemplateId = localStorage.getItem(STORAGE.activeTemplate) || null;
    renderChannels();
    renderTemplatePicker();
    renderTemplatesTab();
    if (state.channels.length === 0) fetchChannels(key);
  } else {
    els.setupView.style.display = 'block';
    els.mainApp.style.display = 'none';
  }
}

function defaultTemplates() {
  return [
    { id: cryptoRandomId(), label: 'Ranked grind', copy: 'climbing to Diamond tonight — pull up 🎮', image: '' },
    { id: cryptoRandomId(), label: 'Chill stream', copy: 'just vibing and playing whatever, come chill', image: '' },
  ];
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function showApp() {
  els.setupView.style.display = 'none';
  els.mainApp.style.display = 'block';
}

// ---------- connect ----------
els.connectBtn.addEventListener('click', async () => {
  const key = els.keyInput.value.trim();
  if (!key) return;
  els.connectBtn.textContent = 'Connecting…';
  els.setupError.style.display = 'none';
  try {
    localStorage.setItem(STORAGE.key, key);
    await fetchChannels(key);
    state.templates = loadJSON(STORAGE.templates, defaultTemplates());
    saveJSON(STORAGE.templates, state.templates);
    showApp();
    renderChannels();
    renderTemplatePicker();
    renderTemplatesTab();
  } catch (err) {
    localStorage.removeItem(STORAGE.key);
    els.setupError.textContent = 'Could not reach Buffer with that key: ' + err.message;
    els.setupError.style.display = 'block';
  } finally {
    els.connectBtn.textContent = 'Connect';
  }
});

// ---------- Buffer API layer ----------
// Buffer's GraphQL API is a single POST endpoint. Confirmed against
// Buffer's live schema (introspected directly) and developers.buffer.com:
// one endpoint, Bearer token in the Authorization header, JSON body of
// { query, variables }. Buffer's own browser-based API Explorer talks to
// this same endpoint directly from client-side JS with a pasted personal
// access token, which is the same flow Uplink uses — so this calls Buffer
// directly with no proxy. buffer-proxy.js is left in the repo as an
// unused fallback in case a manual CORS check (see chat) turns up
// otherwise; point BUFFER_ENDPOINT at '/.netlify/functions/buffer-proxy'
// if you need it.
const BUFFER_ENDPOINT = 'https://api.buffer.com';

async function bufferRequest(key, query, variables) {
  const res = await fetch(BUFFER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Buffer request failed (${res.status})`);
  const data = await res.json();
  if (data.errors && data.errors.length) throw new Error(data.errors[0].message);
  return data.data;
}

async function fetchChannels(key) {
  // Verified against Buffer's live GraphQL schema: Query.account returns
  // organizations(filter: OrganizationFilterInput) — filter is optional,
  // so an unfiltered call returns all orgs on this token.
  const accountQuery = `query { account { organizations { id name } } }`;
  const accountData = await bufferRequest(key, accountQuery, {});
  const orgId = accountData?.account?.organizations?.[0]?.id;
  if (!orgId) throw new Error('No organization found on this token');
  localStorage.setItem(STORAGE.orgId, orgId);

  // Query.channels takes a single `input: ChannelsInput!` object
  // (organizationId + optional filter), not a bare organizationId arg.
  const channelsQuery = `
    query Channels($input: ChannelsInput!) {
      channels(input: $input) {
        id
        service
        displayName
        avatar
      }
    }`;
  const channelsData = await bufferRequest(key, channelsQuery, { input: { organizationId: orgId } });
  const channels = channelsData?.channels || [];
  state.channels = channels;
  saveJSON(STORAGE.channels, channels);
  // default: select everything on first connect
  if (state.selectedChannelIds.size === 0) {
    channels.forEach(c => state.selectedChannelIds.add(c.id));
    saveJSON(STORAGE.selectedChannels, [...state.selectedChannelIds]);
  }
  renderChannels();
}

async function sendUplink(template) {
  const key = localStorage.getItem(STORAGE.key);
  const targets = state.channels.filter(c => state.selectedChannelIds.has(c.id));
  if (!key || targets.length === 0 || !template) return;

  els.sendBtn.disabled = true;
  els.sendBtn.textContent = 'Sending…';
  els.sendLog.textContent = '';

  const results = await Promise.allSettled(targets.map(channel => postOne(key, channel, template)));
  const okCount = results.filter(r => r.status === 'fulfilled').length;
  const failCount = results.length - okCount;

  els.sendBtn.disabled = false;
  els.sendBtn.textContent = 'Send Uplink';
  els.sendLog.textContent = failCount === 0
    ? `Sent to ${okCount} channel${okCount === 1 ? '' : 's'}.`
    : `Sent to ${okCount}, failed on ${failCount}. Check Settings → Connection.`;
}

async function postOne(key, channel, template) {
  // Verified against Buffer's live GraphQL schema:
  // - createPost takes a single `input: CreatePostInput!` object, not
  //   flat args. channelId, mode, and schedulingType are required.
  // - mode: shareNow is a real ShareMode enum value (publish immediately,
  //   as opposed to addToQueue/shareNext/customScheduled).
  // - createPost returns a union (PostActionPayload): PostActionSuccess
  //   on success, or one of several error types that all implement the
  //   MutationError interface — hence the two inline fragments below
  //   instead of flat `id`/`status` fields.
  // - Image assets use `assets: [{ image: { url } }]`; metadata (e.g.
  //   altText) is optional on ImageAssetInput so it's fine to omit.
  const mutation = `
    mutation SendPost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id status }
        }
        ... on MutationError {
          message
        }
      }
    }`;

  const input = {
    channelId: channel.id,
    text: template.copy,
    mode: 'shareNow',
    schedulingType: 'automatic',
  };
  if (template.image) {
    input.assets = [{ image: { url: template.image } }];
  }

  const data = await bufferRequest(key, mutation, { input });
  const result = data?.createPost;
  if (result?.message) throw new Error(result.message);
  return result;
}

// ---------- render: channels ----------
function renderChannels() {
  els.channelRow.innerHTML = '';
  if (state.channels.length === 0) {
    els.channelRow.innerHTML = '<div class="empty-note">No channels found on this token yet. Hit Refresh.</div>';
    updateSendButtonState();
    return;
  }
  state.channels.forEach(channel => {
    const active = state.selectedChannelIds.has(channel.id);
    const div = document.createElement('div');
    div.className = 'switch' + (active ? ' active' : '');
    div.innerHTML = `<span class="plat">${channel.displayName || channel.service}<small>${channel.service}</small></span><div class="toggle"></div>`;
    div.addEventListener('click', () => {
      if (state.selectedChannelIds.has(channel.id)) {
        state.selectedChannelIds.delete(channel.id);
      } else {
        state.selectedChannelIds.add(channel.id);
      }
      saveJSON(STORAGE.selectedChannels, [...state.selectedChannelIds]);
      renderChannels();
    });
    els.channelRow.appendChild(div);
  });
  updateSendButtonState();
}

els.refreshChannels.addEventListener('click', async () => {
  const key = localStorage.getItem(STORAGE.key);
  if (!key) return;
  els.refreshChannels.textContent = 'Refreshing…';
  try {
    await fetchChannels(key);
  } catch (err) {
    els.sendLog.textContent = 'Refresh failed: ' + err.message;
  }
  els.refreshChannels.textContent = 'Refresh';
});

// ---------- render: template picker (console) ----------
function renderTemplatePicker() {
  els.templatePicker.innerHTML = '';
  if (state.templates.length === 0) {
    els.templatePicker.innerHTML = '<div class="empty-note">No templates yet — add one in the Templates tab.</div>';
    renderPreview(null);
    return;
  }
  state.templates.forEach(t => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (t.id === state.activeTemplateId ? ' active' : '');
    chip.textContent = t.label;
    chip.addEventListener('click', () => {
      state.activeTemplateId = t.id;
      localStorage.setItem(STORAGE.activeTemplate, t.id);
      renderTemplatePicker();
    });
    els.templatePicker.appendChild(chip);
  });
  const active = state.templates.find(t => t.id === state.activeTemplateId) || null;
  renderPreview(active);
}

function renderPreview(template) {
  if (!template) {
    els.templatePreview.textContent = 'Pick a template above, or build one in the Templates tab.';
    els.templatePreview.classList.add('empty');
  } else {
    els.templatePreview.textContent = template.copy + (template.image ? `\n[image attached]` : '');
    els.templatePreview.classList.remove('empty');
  }
  updateSendButtonState();
}

function updateSendButtonState() {
  const hasChannels = state.selectedChannelIds.size > 0;
  const hasTemplate = !!state.templates.find(t => t.id === state.activeTemplateId);
  els.sendBtn.disabled = !(hasChannels && hasTemplate);
}

els.sendBtn.addEventListener('click', () => {
  const template = state.templates.find(t => t.id === state.activeTemplateId);
  sendUplink(template);
});

// ---------- templates tab ----------
function renderTemplatesTab() {
  els.tplGrid.innerHTML = '';
  els.tplEmpty.style.display = state.templates.length === 0 ? 'block' : 'none';
  state.templates.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tpl-card';
    card.innerHTML = `
      <span class="tag">${t.image ? 'with image' : 'text only'}</span>
      <h3>${escapeHtml(t.label)}</h3>
      <p>${escapeHtml(t.copy)}</p>
      <div class="tpl-card-actions">
        <button data-action="edit">Edit</button>
        <button data-action="delete">Delete</button>
      </div>`;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openTemplateModal(t.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteTemplate(t.id));
    els.tplGrid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function deleteTemplate(id) {
  state.templates = state.templates.filter(t => t.id !== id);
  saveJSON(STORAGE.templates, state.templates);
  if (state.activeTemplateId === id) {
    state.activeTemplateId = null;
    localStorage.removeItem(STORAGE.activeTemplate);
  }
  renderTemplatesTab();
  renderTemplatePicker();
}

function openTemplateModal(id) {
  state.editingTemplateId = id || null;
  const t = id ? state.templates.find(x => x.id === id) : null;
  els.tplModalTitle.textContent = id ? 'Edit template' : 'New template';
  els.tplLabel.value = t ? t.label : '';
  els.tplCopy.value = t ? t.copy : '';
  els.tplImage.value = t ? t.image : '';
  els.tplModal.classList.add('show');
}

function closeTemplateModal() {
  els.tplModal.classList.remove('show');
}

els.newTemplateBtn.addEventListener('click', () => openTemplateModal(null));
els.tplCancelBtn.addEventListener('click', closeTemplateModal);

els.tplSaveBtn.addEventListener('click', () => {
  const label = els.tplLabel.value.trim();
  const copy = els.tplCopy.value.trim();
  const image = els.tplImage.value.trim();
  if (!label || !copy) return;

  if (state.editingTemplateId) {
    const t = state.templates.find(x => x.id === state.editingTemplateId);
    t.label = label; t.copy = copy; t.image = image;
  } else {
    state.templates.push({ id: cryptoRandomId(), label, copy, image });
  }
  saveJSON(STORAGE.templates, state.templates);
  closeTemplateModal();
  renderTemplatesTab();
  renderTemplatePicker();
});

// ---------- tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------- settings ----------
els.disconnectBtn.addEventListener('click', () => {
  if (!confirm('Disconnect and clear your Buffer key from this browser?')) return;
  Object.values(STORAGE).forEach(k => localStorage.removeItem(k));
  location.reload();
});

boot();
