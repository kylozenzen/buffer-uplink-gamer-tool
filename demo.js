/* ==========================================================
   UPLINK — Sample stream
   Lets anyone try the deck without a Twitch channel. While sample mode is
   on, Twitch lookups for the sample login return made-up stream data and
   clips. Buffer requests are untouched, so anything you send is real (the
   launch mode defaults to Draft for exactly that reason).
   Load before app.js so the very first Twitch lookup is covered.
   ========================================================== */
(function () {
  'use strict';
  const SAMPLE_LOGIN = 'uplinksample';
  const FLAG = 'uplink_sample_stream';
  const LOGIN_KEY = 'uplink_twitch_login';
  const LINK_KEY = 'uplink_stream_link';

  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const isOn = () => read(FLAG) === 'true' && read(LOGIN_KEY) === SAMPLE_LOGIN;
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const thumb = (n) => `/sample/thumb-${n}.svg`;

  function liveData() {
    return {
      live: true, login: SAMPLE_LOGIN,
      title: 'Ranked grind until we hit Diamond (or until chat stops believing in me)',
      game: 'Starfall Arena', viewerCount: 128, startedAt: ago(74),
      thumbnailUrl: thumb(0), sample: true,
    };
  }

  function clipsData() {
    const clip = (id, title, by, mins, views, dur, n) => ({ id, title, creator_name: by, creator_id: by === 'You' ? '1' : String(n + 10), broadcaster_id: '1', url: '', thumbnail_url: thumb(n), duration: dur, view_count: views, created_at: ago(mins), sample: true });
    return {
      clips: [
        clip('SampleClutchOneHP', '1 HP clutch. Chat lost its mind.', 'pixelpatty', 38, 412, 27, 1),
        clip('SampleTeammateLaunch', 'Launched my own teammate off the map', 'You', 61, 233, 18, 2),
        clip('SampleBigBrainPlay', 'The plan worked?? The plan actually worked', 'chatgoblin', 95, 158, 31, 3),
        clip('SampleOneMoreGame', '"One more game." It was not one more game.', 'nightowl_ny', 140, 97, 22, 4),
      ],
      channel: { id: '1', login: SAMPLE_LOGIN, name: 'Uplink Sample' },
      fetchedAt: new Date().toISOString(), until: new Date().toISOString(), nextCursor: '',
    };
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, options) {
    const url = String(input && input.url ? input.url : input);
    if (isOn() && url.includes('/.netlify/functions/')) {
      if (url.includes('twitch-proxy')) return Promise.resolve(Response.json(liveData()));
      if (url.includes('twitch-clips')) return Promise.resolve(Response.json(clipsData()));
    }
    return nativeFetch(input, options);
  };

  function start() {
    try {
      localStorage.setItem(FLAG, 'true');
      localStorage.setItem(LOGIN_KEY, SAMPLE_LOGIN);
      localStorage.setItem(LINK_KEY, `https://twitch.tv/${SAMPLE_LOGIN}`);
    } catch {}
    const login = document.getElementById('twitchLoginInput'); if (login) login.value = '';
    const link = document.getElementById('streamLinkInput'); if (link) link.value = `https://twitch.tv/${SAMPLE_LOGIN}`;
    refresh();
  }

  function stop() {
    try {
      localStorage.removeItem(FLAG);
      if (read(LOGIN_KEY) === SAMPLE_LOGIN) localStorage.removeItem(LOGIN_KEY);
      if (read(LINK_KEY) === `https://twitch.tv/${SAMPLE_LOGIN}`) localStorage.removeItem(LINK_KEY);
    } catch {}
    const link = document.getElementById('streamLinkInput'); if (link) link.value = '';
    refresh();
  }

  function refresh() {
    syncUI();
    if (typeof checkTwitchLive === 'function') checkTwitchLive();
    document.dispatchEvent(new CustomEvent('uplink:tab', { detail: document.getElementById('view-clips')?.classList.contains('active') ? 'clips' : 'console' }));
  }

  function syncUI() {
    const on = isOn();
    document.body.classList.toggle('sample-mode', on);
    const btn = document.getElementById('sampleStreamBtn');
    if (btn) {
      const hasRealLogin = !!read(LOGIN_KEY) && !on;
      btn.hidden = hasRealLogin;
      btn.textContent = on ? 'Exit sample stream' : 'Try a sample stream';
    }
    const banner = document.getElementById('sampleBanner');
    if (banner) banner.hidden = !on;
    if (on) {
      const label = document.getElementById('streamStatusLabel');
      if (label) label.textContent = 'Sample stream // not a real channel';
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-sample-start]')) { event.preventDefault(); start(); }
    else if (event.target.closest('[data-sample-stop]')) { event.preventDefault(); stop(); }
    else if (event.target.closest('#sampleStreamBtn')) { event.preventDefault(); isOn() ? stop() : start(); }
  });

  // Linking a real Twitch channel ends sample mode.
  document.addEventListener('click', (event) => {
    if (event.target.closest('#saveTwitchBtn') && read(FLAG) === 'true') {
      window.setTimeout(() => { if (read(LOGIN_KEY) !== SAMPLE_LOGIN) { try { localStorage.removeItem(FLAG); } catch {} syncUI(); } }, 0);
    }
  });

  // Keep the label/banner right after the app re-renders the stream card.
  document.addEventListener('DOMContentLoaded', () => {
    syncUI();
    if (typeof renderTwitchState === 'function') {
      const original = renderTwitchState;
      // eslint-disable-next-line no-global-assign
      renderTwitchState = function (data) { original(data); syncUI(); };
    }
  });

  window.UplinkSample = { isOn, start, stop, LOGIN: SAMPLE_LOGIN };
})();
