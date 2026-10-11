/* Popup / options page. Every change is saved immediately; open LinkedIn tabs update live. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const app = $('app');
  const statusEl = $('status');
  const savedEl = $('saved');
  const limitEl = $('limit');

  let current = LF_normalize(LF_DEFAULTS);
  let savedTimer = null;

  // ------------------------------------------------------------ rendering

  function render() {
    $('enabled').checked = current.enabled;
    app.classList.toggle('off', !current.enabled);
    for (const name of ['video', 'image']) {
      for (const radio of document.querySelectorAll(`input[name="${name}"]`)) {
        radio.checked = radio.value === current[name];
      }
    }
    for (const name of ['promoted', 'suggested', 'activity']) {
      $(name).checked = current[name] === 'hide';
    }
    if (document.activeElement !== limitEl) limitEl.value = String(current.limit);
    $('limit-hint').textContent = current.limit === 0
      ? 'No limit: your whole feed is shown.'
      : `Your feed stops after ${current.limit} posts, with a button to show more.`;
  }

  function flashSaved() {
    savedEl.textContent = 'Saved';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { savedEl.textContent = ''; }, 1200);
  }

  // ------------------------------------------------------------ storage

  function save(patch) {
    current = LF_normalize(Object.assign({}, current, patch));
    render();
    chrome.storage.sync.set(current, () => {
      flashSaved();
      setTimeout(refreshStatus, 400);
    });
  }

  // ------------------------------------------------------------ status line

  function describe(st) {
    if (!st.enabled) return 'The filter is off.';
    if (!st.onFeed) return 'Open your LinkedIn home feed to see it working.';
    if (st.posts === 0) {
      return 'No posts found yet. If your feed is loaded, LinkedIn may have changed its layout (see README).';
    }
    const parts = [`${st.shown} shown`];
    if (st.hiddenTotal) parts.push(`${st.hiddenTotal} hidden`);
    if (st.collapsed) parts.push(`${st.collapsed} with media tucked away`);
    if (st.overLimit) parts.push(`${st.overLimit} past your limit`);
    return 'This page: ' + parts.join(' · ');
  }

  function refreshStatus() {
    statusEl.textContent = 'Open or refresh your LinkedIn feed to see it working.';
    if (!chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs && tabs[0];
      if (!tab || tab.id === undefined) return;
      chrome.tabs.sendMessage(tab.id, { type: 'lf:getStats' }, reply => {
        if (chrome.runtime.lastError || !reply) return; // not a LinkedIn tab
        statusEl.textContent = describe(reply);
      });
    });
  }

  // ------------------------------------------------------------ events

  $('enabled').addEventListener('change', e => save({ enabled: e.target.checked }));

  for (const name of ['video', 'image']) {
    for (const radio of document.querySelectorAll(`input[name="${name}"]`)) {
      radio.addEventListener('change', () => { if (radio.checked) save({ [name]: radio.value }); });
    }
  }

  for (const name of ['promoted', 'suggested', 'activity']) {
    $(name).addEventListener('change', e => save({ [name]: e.target.checked ? 'hide' : 'show' }));
  }

  function commitLimit() {
    const n = parseInt(limitEl.value, 10);
    save({ limit: isFinite(n) && n >= 0 ? n : 0 });
    limitEl.value = String(current.limit);
  }

  limitEl.addEventListener('change', commitLimit);
  limitEl.addEventListener('keydown', e => { if (e.key === 'Enter') { limitEl.blur(); } });
  $('less').addEventListener('click', () => save({ limit: Math.max(0, current.limit - 5) }));
  $('more').addEventListener('click', () => save({ limit: Math.min(500, current.limit + 5) }));
  $('reset').addEventListener('click', () => save(LF_DEFAULTS));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const next = Object.assign({}, current);
    for (const key of Object.keys(LF_DEFAULTS)) {
      if (changes[key]) next[key] = changes[key].newValue;
    }
    current = LF_normalize(next);
    render();
  });

  chrome.storage.sync.get(LF_DEFAULTS, items => {
    current = LF_normalize(items);
    render();
    refreshStatus();
  });
})();
