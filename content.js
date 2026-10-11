/* LinkedIn Feed Filter: content script.
 *
 * Runs on linkedin.com. LinkedIn is a single-page app whose markup changes often, so:
 *   - every selector and keyword lives in CONFIG below (the only part that should need upkeep);
 *   - posts are re-inspected from scratch on every pass (a MutationObserver, throttled);
 *   - every change is a class or a tagged ("lf-") element, so it can be fully undone.
 *
 * HOW TO FIX A POST TYPE THAT SLIPS THROUGH
 *   - Posts not found at all          -> add a selector to CONFIG.postRoots.
 *   - Promoted / Suggested not caught -> add the label text (lowercase) to CONFIG.labels.
 *   - Video / picture not collapsed   -> add a selector to CONFIG.videos, or lower CONFIG.minMedia.
 *   - Collapsing hides too much/little-> adjust CONFIG.chromeMarkers (things the collapse must not swallow).
 */
(() => {
  'use strict';
  if (window.__lfLoaded) return;
  window.__lfLoaded = true;

  const CONFIG = {
    // Only filter on the home feed (and /feed/... pages), not profiles, jobs, messaging...
    feedPath: /^\/(feed(\/.*)?)?$/,

    // Wrapper around the list of posts. Optional: falls back to the whole page.
    feedContainer: 'div[data-testid="mainFeed"]',

    // One element per post. Tried together; when they nest, the outermost one wins.
    postRoots: [
      '[role="listitem"][componentkey^="update-card-focus"]', // current markup
      '[data-urn^="urn:li:activity"]',                         // older markup
      '[data-id^="urn:li:activity"]',
      'div.feed-shared-update-v2'
    ],

    // Attributes that identify a post; if they change, the post node was reused for new content.
    postIdAttrs: ['componentkey', 'data-urn', 'data-id'],

    // The post's own text (never collapsed).
    bodyText: [
      'span[data-testid="expandable-text-box"]',
      '.update-components-text',
      '.feed-shared-update-v2__description'
    ],

    // Things that are definitely video (a real <video> is always detected on top of these).
    videos: [
      'video',
      '[class*="linkedin-video"]',
      '[class*="video-player"]',
      '[data-testid*="video-player"]'
    ],

    // Pictures: <img>/<canvas>/<iframe> at least this big (rendered size, or natural size if unrendered).
    // Avatars, reaction icons and emoji fall below it.
    imageTags: 'img, canvas, iframe',
    minMedia: { width: 150, height: 90 },

    // Never count media found inside these (comments, reply boxes).
    mediaIgnoreWithin: [
      '[data-testid*="comment"]',
      '[class*="comments-comment"]',
      '[class*="comments-comments-list"]',
      'form'
    ],

    // When collapsing media we climb up its wrappers, but stop before a wrapper that also holds
    // post "chrome": the author header, the post text, or the Like/Comment/Repost bar.
    chromeMarkers: [
      'a[href*="/in/"]',
      'a[href*="/company/"]',
      'a[href*="/school/"]',
      'a[href*="/showcase/"]',
      'span[data-testid="expandable-text-box"]',
      'button[aria-label*="Like" i]',
      'button[aria-label*="React" i]',
      'form',
      '[role="textbox"]'
    ],
    chromeButtonText: /^(like|comment|repost|send|share)$/i,

    // Labels are looked for in the first N <p>/<span> elements of a post, outside the post text.
    // English UI only; add translations as needed (lowercase).
    labelScanLimit: 60,
    labelMaxLength: 120,
    labels: {
      promoted: ['promoted', 'sponsored', 'promocionado', 'patrocinado', 'promovido', 'gesponsert',
                 'sponsorisé', 'post sponsorizzato', 'gepromoot'],
      suggested: ['suggested', 'suggested for you', 'recommended for you', 'sugerencias', 'sugerido',
                  'vorgeschlagen', 'suggéré'],
      activity: [
        /\b(likes|loves|celebrates|supports|commented on|replied to|reacted to|is curious about) this\b/i,
        /\bfinds? this (insightful|funny|helpful|interesting)\b/i,
        /\band \d+ others? (like|love|celebrate|support|find|commented|are curious|reacted)\b/i
      ]
    }
  };

  const TEXT = {
    video: 'video',
    image: 'picture'
  };

  const OBSERVE = { childList: true, subtree: true };
  const THROTTLE_MS = 150;
  const BRAKE_START_VH = 100;
  const BRAKE_STEP_VH = 60;
  const BRAKE_MAX_VH = 400;

  const POST_SEL = CONFIG.postRoots.join(',');
  const BODY_SEL = CONFIG.bodyText.join(',');
  const VIDEO_SEL = CONFIG.videos.join(',');
  const IGNORE_SEL = CONFIG.mediaIgnoreWithin.join(',');
  const CHROME_SEL = CONFIG.chromeMarkers.join(',');
  const PROMOTED = new Set(CONFIG.labels.promoted);
  const SUGGESTED = new Set(CONFIG.labels.suggested);

  let settings = LF_normalize(LF_DEFAULTS);
  let extra = 0;                 // extra posts revealed with "Show N more" (this page view only)
  let banner = null;
  let brakeVh = BRAKE_START_VH;
  let lastOverLimit = 0;
  let timer = null;
  let stats = blankStats(false);

  const observer = new MutationObserver(() => schedule());

  // ---------------------------------------------------------------- helpers

  function blankStats(onFeed) {
    return {
      onFeed,
      enabled: settings.enabled,
      posts: 0,
      shown: 0,
      hiddenTotal: 0,
      hidden: { promoted: 0, suggested: 0, activity: 0, video: 0, image: 0 },
      collapsed: 0,
      overLimit: 0,
      limit: settings.limit
    };
  }

  function isFeedPage() {
    return CONFIG.feedPath.test(location.pathname);
  }

  function norm(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function schedule(delay) {
    if (timer !== null) return;
    timer = setTimeout(apply, delay === undefined ? THROTTLE_MS : delay);
  }

  function findPosts() {
    const scope = document.querySelector(CONFIG.feedContainer) || document;
    const posts = [];
    for (const el of scope.querySelectorAll(POST_SEL)) {
      if (el.closest('.lf-banner')) continue;
      if (el.parentElement && el.parentElement.closest(POST_SEL)) continue; // nested: outermost wins
      posts.push(el);
    }
    return posts;
  }

  function postKey(post) {
    for (const attr of CONFIG.postIdAttrs) {
      const v = post.getAttribute(attr);
      if (v) return attr + '=' + v;
    }
    return '';
  }

  // Sticky facts about a post (media never un-renders). Reset if the node is reused for new content.
  function metaFor(post) {
    const key = postKey(post);
    let meta = post.__lf;
    if (!meta || meta.key !== key) {
      meta = { key, hasVideo: false, hasImage: false };
      post.__lf = meta;
    }
    return meta;
  }

  // ---------------------------------------------------------------- labels

  function scanLabels(post, body) {
    const found = { promoted: false, suggested: false, activity: false };
    let seen = 0;
    for (const el of post.querySelectorAll('p, span')) {
      if (++seen > CONFIG.labelScanLimit) break;
      if (body && body.contains(el)) continue;
      const text = norm(el.textContent || '');
      if (!text || text.length > CONFIG.labelMaxLength) continue;
      const segments = text.split(/[•·|]/).map(s => norm(s).toLowerCase());
      if (segments.some(s => PROMOTED.has(s))) found.promoted = true;
      if (segments.some(s => SUGGESTED.has(s))) found.suggested = true;
      if (CONFIG.labels.activity.some(re => re.test(text))) found.activity = true;
    }
    return found;
  }

  // ---------------------------------------------------------------- media

  function isBigEnough(el) {
    const rect = el.getBoundingClientRect();
    let w = rect.width;
    let h = rect.height;
    if (!w || !h) { // not rendered (e.g. we collapsed it): fall back to the file's own size
      w = el.naturalWidth || el.width || 0;
      h = el.naturalHeight || el.height || 0;
    }
    return w >= CONFIG.minMedia.width && h >= CONFIG.minMedia.height;
  }

  // True when `el` sits in the same small wrapper as a <video> (a poster frame / player overlay).
  // Looks at most two wrappers up, and never at one that also holds the post text or the whole post.
  function sharesPlayer(el, post, body) {
    let node = el.parentElement;
    for (let depth = 0; node && node !== post && depth < 2; depth++, node = node.parentElement) {
      if (body && node.contains(body)) return false;
      if (node.querySelector('video')) return true;
    }
    return false;
  }

  // Returns [{ el, kind: 'video' | 'image' }] for the media in a post's content area.
  function findMedia(post, body) {
    const out = [];
    const taken = new Set();
    const add = (el, kind) => {
      if (!taken.has(el)) { taken.add(el); out.push({ el, kind }); }
    };

    for (const el of post.querySelectorAll(VIDEO_SEL)) {
      if (el.closest(IGNORE_SEL)) continue;
      add(el, 'video');
    }

    for (const el of post.querySelectorAll(CONFIG.imageTags)) {
      if (el.closest(IGNORE_SEL)) continue;
      if (el.closest(VIDEO_SEL)) continue;                       // poster image inside a video player
      if (sharesPlayer(el, post, body)) {
        add(el, 'video');                                        // poster image next to a <video>
        continue;
      }
      if (isBigEnough(el)) add(el, 'image');
    }
    return out;
  }

  function hasChromeOutside(parent, node, body) {
    if (body && parent.contains(body)) return true;
    for (const m of parent.querySelectorAll(CHROME_SEL)) {
      if (!node.contains(m)) return true;
    }
    for (const b of parent.querySelectorAll('button')) {
      if (node.contains(b)) continue;
      if (CONFIG.chromeButtonText.test(norm(b.textContent || ''))) return true;
    }
    return false;
  }

  // Climb from a media element to the largest wrapper that holds only media.
  function mediaBlock(el, post, body) {
    let node = el;
    while (node.parentElement && node.parentElement !== post &&
           !hasChromeOutside(node.parentElement, node, body)) {
      node = node.parentElement;
    }
    return node;
  }

  // ---------------------------------------------------------------- applying

  function setPostClass(post, cls, on) {
    if (post.classList.contains(cls) !== on) post.classList.toggle(cls, on);
  }

  function pauseVideos(post) {
    for (const v of post.querySelectorAll('video')) {
      if (!v.paused) { try { v.pause(); } catch (e) { /* ignore */ } }
    }
  }

  function hideReason(meta, labels) {
    if (labels.promoted && settings.promoted === 'hide') return 'promoted';
    if (labels.suggested && settings.suggested === 'hide') return 'suggested';
    if (labels.activity && settings.activity === 'hide') return 'activity';
    if (meta.hasVideo && settings.video === 'hide') return 'video';
    if (meta.hasImage && settings.image === 'hide') return 'image';
    return null;
  }

  // Marks the media wrappers of a visible post and manages its "Show video" button.
  // Returns true when the post currently has media tucked away.
  function applyCollapse(post, body, media) {
    const want = media.filter(m => settings[m.kind] === 'text');
    const blocks = new Map(); // wrapper element -> Set of kinds

    for (const m of want) {
      const block = mediaBlock(m.el, post, body);
      if (!blocks.has(block)) blocks.set(block, new Set());
      blocks.get(block).add(m.kind);
    }
    // Keep wrappers we already flagged: a collapsed image has no size, so it can't be re-measured.
    for (const el of post.querySelectorAll('.lf-media-block')) {
      if (!blocks.has(el)) {
        blocks.set(el, new Set((el.getAttribute('data-lf-kind') || '').split(' ').filter(Boolean)));
      }
    }
    // Merge wrappers nested inside another wrapper.
    for (const [el, kinds] of Array.from(blocks)) {
      for (const [other, otherKinds] of blocks) {
        if (other !== el && other.contains(el)) {
          kinds.forEach(k => otherKinds.add(k));
          blocks.delete(el);
          break;
        }
      }
    }

    for (const el of post.querySelectorAll('.lf-media-block')) {
      if (!blocks.has(el)) {
        el.classList.remove('lf-media-block');
        el.removeAttribute('data-lf-kind');
      }
    }
    for (const [el, kinds] of blocks) {
      if (!el.classList.contains('lf-media-block')) el.classList.add('lf-media-block');
      const kindAttr = Array.from(kinds).sort().join(' ');
      if (el.getAttribute('data-lf-kind') !== kindAttr) el.setAttribute('data-lf-kind', kindAttr);
    }

    let placeholder = post.querySelector('.lf-placeholder');
    if (blocks.size === 0) {
      if (placeholder) placeholder.remove();
      setPostClass(post, 'lf-collapsed', false);
      return false;
    }

    const ordered = Array.from(blocks.keys()).sort((a, b) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    const first = ordered[0];
    const all = new Set();
    blocks.forEach(kinds => kinds.forEach(k => all.add(k)));
    const what = all.has('video') && all.has('image') ? 'video & picture'
      : all.has('video') ? TEXT.video : TEXT.image;

    if (!placeholder || placeholder.nextElementSibling !== first) {
      if (placeholder) placeholder.remove();
      placeholder = buildPlaceholder(post);
      first.parentElement.insertBefore(placeholder, first);
    }
    const revealed = post.classList.contains('lf-revealed');
    const label = (revealed ? 'Hide ' : 'Show ') + what;
    const btn = placeholder.querySelector('button');
    if (btn.textContent !== label) btn.textContent = label;
    const note = placeholder.querySelector('.lf-placeholder-note');
    const noteText = revealed ? '' : 'Hidden by LinkedIn Feed Filter';
    if (note.textContent !== noteText) note.textContent = noteText;

    setPostClass(post, 'lf-collapsed', !revealed);
    return !revealed;
  }

  function buildPlaceholder(post) {
    const wrap = document.createElement('div');
    wrap.className = 'lf-placeholder';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      post.classList.toggle('lf-revealed');
      schedule(0);
    });
    const note = document.createElement('span');
    note.className = 'lf-placeholder-note';
    wrap.append(btn, note);
    return wrap;
  }

  function buildBanner() {
    const el = document.createElement('div');
    el.className = 'lf-banner';
    const inner = document.createElement('div');
    inner.className = 'lf-banner-inner';
    const title = document.createElement('p');
    title.className = 'lf-banner-title';
    const sub = document.createElement('p');
    sub.className = 'lf-banner-sub';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.addEventListener('click', e => {
      e.preventDefault();
      extra += settings.limit;
      brakeVh = BRAKE_START_VH;
      lastOverLimit = 0;
      schedule(0);
    });
    inner.append(title, sub, btn);
    el.append(inner);
    return el;
  }

  function showBanner(after, hiddenCount) {
    if (!banner) banner = buildBanner();
    const [title, sub] = banner.querySelectorAll('p');
    const btn = banner.querySelector('button');
    const t = `That's your ${settings.limit + extra} posts.`;
    const s = `${hiddenCount} more ${hiddenCount === 1 ? 'is' : 'are'} waiting. Change the limit from the extension icon.`;
    const b = `Show ${settings.limit} more`;
    if (title.textContent !== t) title.textContent = t;
    if (sub.textContent !== s) sub.textContent = s;
    if (btn.textContent !== b) btn.textContent = b;

    // Loading brake: LinkedIn loads more posts while the end of its list is on screen. Hidden posts
    // take no space, so every time more arrive we make this card taller to push that point away.
    if (lastOverLimit > 0 && hiddenCount > lastOverLimit) {
      brakeVh = Math.min(brakeVh + BRAKE_STEP_VH, BRAKE_MAX_VH);
    }
    lastOverLimit = hiddenCount;
    banner.style.minHeight = brakeVh + 'vh';

    if (after.nextElementSibling !== banner) after.insertAdjacentElement('afterend', banner);
  }

  function removeBanner() {
    if (banner && banner.parentNode) banner.remove();
    lastOverLimit = 0;
    brakeVh = BRAKE_START_VH;
  }

  function strip() {
    document.querySelectorAll(
      '.lf-hidden, .lf-over-limit, .lf-collapsed, .lf-revealed, .lf-media-block'
    ).forEach(el => el.classList.remove('lf-hidden', 'lf-over-limit', 'lf-collapsed', 'lf-revealed', 'lf-media-block'));
    document.querySelectorAll('[data-lf-kind]').forEach(el => el.removeAttribute('data-lf-kind'));
    document.querySelectorAll('.lf-placeholder, .lf-banner').forEach(el => el.remove());
    lastOverLimit = 0;
    brakeVh = BRAKE_START_VH;
  }

  function run() {
    if (!settings.enabled || !isFeedPage()) {
      strip();
      stats = blankStats(isFeedPage());
      return;
    }

    const posts = findPosts();
    const limit = settings.limit > 0 ? settings.limit + extra : 0;
    const st = blankStats(true);
    st.posts = posts.length;
    let lastShown = null;

    for (const post of posts) {
      const meta = metaFor(post);
      const body = post.querySelector(BODY_SEL);
      const labels = scanLabels(post, body);
      const media = findMedia(post, body);
      for (const m of media) {
        if (m.kind === 'video') meta.hasVideo = true;
        else meta.hasImage = true;
      }

      const reason = hideReason(meta, labels);
      if (reason) {
        setPostClass(post, 'lf-hidden', true);
        setPostClass(post, 'lf-over-limit', false);
        pauseVideos(post);
        st.hidden[reason]++;
        st.hiddenTotal++;
        continue;
      }
      setPostClass(post, 'lf-hidden', false);

      if (limit && st.shown >= limit) {
        setPostClass(post, 'lf-over-limit', true);
        pauseVideos(post);
        st.overLimit++;
        continue;
      }
      setPostClass(post, 'lf-over-limit', false);

      st.shown++;
      lastShown = post;
      if (applyCollapse(post, body, media)) {
        st.collapsed++;
        pauseVideos(post);
      }
    }

    if (limit && st.overLimit > 0 && lastShown) showBanner(lastShown, st.overLimit);
    else removeBanner();

    stats = st;
  }

  function apply() {
    timer = null;
    observer.disconnect();           // our own DOM changes must not trigger another pass
    try {
      run();
    } catch (err) {
      console.warn('[LinkedIn Feed Filter]', err);
    } finally {
      if (document.body) observer.observe(document.body, OBSERVE);
    }
  }

  // ---------------------------------------------------------------- wiring

  function applySettings(raw) {
    settings = LF_normalize(raw);
    extra = 0;
    strip();
    schedule(0);
  }

  // Videos can start themselves: keep the ones we tucked away (or hid) paused.
  document.addEventListener('play', e => {
    const v = e.target;
    if (v && v.tagName === 'VIDEO' && v.closest('.lf-hidden, .lf-over-limit, .lf-collapsed')) {
      try { v.pause(); } catch (err) { /* ignore */ }
    }
  }, true);

  // Images arrive after the markup: re-check once they have a size.
  document.addEventListener('load', e => {
    if (e.target && e.target.tagName === 'IMG') schedule();
  }, true);

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'lf:getStats') {
        sendResponse(Object.assign({}, stats, { onFeed: isFeedPage() }));
      }
    });
  }

  function start(items) {
    settings = LF_normalize(items);
    schedule(0);
    if (document.body) observer.observe(document.body, OBSERVE);
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const next = Object.assign({}, settings);
      let touched = false;
      for (const key of Object.keys(LF_DEFAULTS)) {
        if (changes[key]) { next[key] = changes[key].newValue; touched = true; }
      }
      if (touched) applySettings(next);
    });
    chrome.storage.sync.get(LF_DEFAULTS, start);
  } else {
    start(LF_DEFAULTS);
  }
})();
