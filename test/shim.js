/* Test-only stand-in for the chrome.* extension APIs, so content.js and popup.js run in a plain page. */
(() => {
  const store = {};
  const changeListeners = [];
  const messageListeners = [];

  window.chrome = {
    storage: {
      sync: {
        get(defaults, cb) { cb(Object.assign({}, defaults, store)); },
        set(items, cb) {
          const changes = {};
          for (const k of Object.keys(items)) {
            changes[k] = { oldValue: store[k], newValue: items[k] };
          }
          Object.assign(store, items);
          changeListeners.forEach(fn => fn(changes, 'sync'));
          if (cb) cb();
        }
      },
      onChanged: { addListener(fn) { changeListeners.push(fn); } }
    },
    runtime: {
      lastError: null,
      onMessage: { addListener(fn) { messageListeners.push(fn); } }
    },
    tabs: {
      query(_q, cb) { cb([{ id: 1 }]); },
      sendMessage(_id, msg, cb) {
        let reply;
        messageListeners.forEach(fn => fn(msg, {}, r => { reply = r; }));
        cb(reply);
      }
    }
  };

  window.__lfTest = {
    set(patch) { return new Promise(res => window.chrome.storage.sync.set(patch, res)); },
    stats() {
      let reply;
      messageListeners.forEach(fn => fn({ type: 'lf:getStats' }, {}, r => { reply = r; }));
      return reply;
    }
  };
})();
