/* In-page tests for content.js. Open /feed/ (see test/serve.py) and run: await window.runLfTests() */
(() => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SETTLE = 450;
  const BASE = { enabled: true, video: 'text', image: 'text', promoted: 'hide', suggested: 'hide', activity: 'hide', limit: 0 };

  const $ = id => document.getElementById(id);
  const shown = el => !!el && el.getClientRects().length > 0;
  const placeholderOf = id => $(id).querySelector('.lf-placeholder');
  const btnOf = id => { const p = placeholderOf(id); return p && p.querySelector('button'); };
  const visiblePosts = () => Array.from(document.querySelectorAll('#feed > .post')).filter(shown);
  const lfLeftovers = () => document.querySelectorAll(
    '.lf-hidden,.lf-over-limit,.lf-collapsed,.lf-revealed,.lf-media-block,.lf-placeholder,.lf-banner,[data-lf-kind]').length;

  async function reset(patch) {
    window.buildFeed();
    await window.__lfTest.set(Object.assign({}, BASE, patch || {}));
    await wait(SETTLE);
  }

  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  test('defaults: promoted / suggested / activity posts are hidden, others stay', async () => {
    await reset();
    const hidden = ['p-promoted', 'p-suggested', 'p-activity'];
    const out = [];
    for (const id of hidden) if (shown($(id))) out.push(id + ' should be hidden');
    for (const id of ['p-text', 'p-image', 'p-video', 'p-commentimg', 'p-legacy', 'p-both', 'p-poster']) {
      if (!shown($(id))) out.push(id + ' should be visible');
    }
    return out;
  });

  test('text-only: media posts get a button, text posts and comment-only images do not', async () => {
    await reset();
    const out = [];
    for (const id of ['p-image', 'p-video', 'p-both', 'p-poster']) {
      if (!placeholderOf(id)) out.push(id + ' should have a Show button');
    }
    for (const id of ['p-text', 'p-commentimg', 'p-legacy', 'plain-1']) {
      if (placeholderOf(id)) out.push(id + ' should NOT have a Show button');
    }
    const label = (id, want) => { const b = btnOf(id); if (!b || b.textContent !== want) out.push(`${id} label: want "${want}", got "${b && b.textContent}"`); };
    label('p-image', 'Show picture');
    label('p-video', 'Show video');
    label('p-both', 'Show video & picture');
    label('p-poster', 'Show video');
    return out;
  });

  test('text-only: media is hidden but text, header and Like bar stay visible', async () => {
    await reset();
    const out = [];
    const post = $('p-image');
    if (shown(post.querySelector('img.pic'))) out.push('picture should be hidden');
    if (!shown(post.querySelector('[data-testid="expandable-text-box"]'))) out.push('post text should be visible');
    if (!shown(post.querySelector('.hdr'))) out.push('header should be visible');
    if (!shown(post.querySelector('.bar'))) out.push('like/comment bar should be visible');
    if (!shown(placeholderOf('p-image'))) out.push('placeholder should be visible');
    const vid = $('p-video');
    if (shown(vid.querySelector('video'))) out.push('video should be hidden');
    if (!shown(vid.querySelector('.bar'))) out.push('video post bar should be visible');
    return out;
  });

  test('show button reveals media, survives re-scans, and can hide it again', async () => {
    await reset();
    const out = [];
    btnOf('p-image').click();
    await wait(SETTLE);
    if (!shown($('p-image').querySelector('img.pic'))) out.push('picture should be visible after click');
    if (btnOf('p-image').textContent !== 'Hide picture') out.push('button should now say Hide picture');
    $('feed').appendChild(window.buildPost({ id: 'extra-1' })); // trigger a re-scan
    await wait(SETTLE);
    if (!shown($('p-image').querySelector('img.pic'))) out.push('picture should stay visible after a re-scan');
    btnOf('p-image').click();
    await wait(SETTLE);
    if (shown($('p-image').querySelector('img.pic'))) out.push('picture should be hidden again');
    return out;
  });

  test('collapsed media stays collapsed through re-scans (no flicker)', async () => {
    await reset();
    const before = document.querySelectorAll('.lf-media-block').length;
    for (let i = 0; i < 3; i++) {
      $('feed').appendChild(window.buildPost({ id: 'noise-' + i }));
      await wait(SETTLE);
    }
    const after = document.querySelectorAll('.lf-media-block').length;
    return before === 0 ? ['no media blocks found at all'] : (before === after ? [] : [`blocks ${before} -> ${after}`]);
  });

  test('video = hide: video posts disappear, picture posts stay collapsed', async () => {
    await reset({ video: 'hide' });
    const out = [];
    for (const id of ['p-video', 'p-both', 'p-poster']) if (shown($(id))) out.push(id + ' should be hidden');
    if (!shown($('p-image')) || !placeholderOf('p-image')) out.push('p-image should be visible with a button');
    return out;
  });

  test('image = hide: picture posts disappear; poster-image video is still a video', async () => {
    await reset({ image: 'hide' });
    const out = [];
    for (const id of ['p-image', 'p-both']) if (shown($(id))) out.push(id + ' should be hidden');
    if (!shown($('p-poster'))) out.push('p-poster (video with poster img) must not be treated as a picture');
    if (!shown($('p-video'))) out.push('p-video should be visible');
    return out;
  });

  test('media = show: nothing collapsed', async () => {
    await reset({ video: 'show', image: 'show' });
    const out = [];
    if (document.querySelectorAll('.lf-placeholder,.lf-media-block').length) out.push('found placeholders / blocks');
    if (!shown($('p-image').querySelector('img.pic'))) out.push('picture should be visible');
    return out;
  });

  test('promoted = show / suggested = show / activity = show bring those posts back', async () => {
    await reset({ promoted: 'show', suggested: 'show', activity: 'show' });
    const out = [];
    for (const id of ['p-promoted', 'p-suggested', 'p-activity']) if (!shown($(id))) out.push(id + ' should be visible');
    return out;
  });

  test('limit: exactly N posts visible, banner after the Nth, button shows N more', async () => {
    await reset({ limit: 5 });
    const out = [];
    const vis = visiblePosts();
    if (vis.length !== 5) out.push('expected 5 visible posts, got ' + vis.length);
    const banner = document.querySelector('.lf-banner');
    if (!banner) { out.push('banner missing'); return out; }
    if (banner.previousElementSibling !== vis[vis.length - 1]) out.push('banner should sit right after the 5th visible post');
    banner.querySelector('button').click();
    await wait(SETTLE);
    if (visiblePosts().length !== 10) out.push('after "Show 5 more" expected 10, got ' + visiblePosts().length);
    return out;
  });

  test('limit counts only posts that are actually shown (hidden ads do not use up slots)', async () => {
    await reset({ limit: 4 });
    const ids = visiblePosts().map(p => p.id);
    const want = ['p-text', 'p-image', 'p-video', 'p-commentimg'];
    return JSON.stringify(ids) === JSON.stringify(want) ? [] : ['visible: ' + ids.join(',')];
  });

  test('limit 0 = no limit, no banner', async () => {
    await reset({ limit: 0 });
    const out = [];
    if (document.querySelector('.lf-banner')) out.push('banner should not exist');
    if (document.querySelectorAll('.lf-over-limit').length) out.push('nothing should be over limit');
    return out;
  });

  test('new posts that load later are filtered', async () => {
    await reset();
    $('feed').appendChild(window.buildPost({ id: 'late-promo', promoted: true }));
    $('feed').appendChild(window.buildPost({ id: 'late-image', image: true }));
    await wait(SETTLE);
    const out = [];
    if (shown($('late-promo'))) out.push('late promoted post should be hidden');
    if (!placeholderOf('late-image')) out.push('late image post should be collapsed');
    return out;
  });

  test('loading brake: card grows when more over-limit posts arrive', async () => {
    await reset({ limit: 5 });
    const banner = document.querySelector('.lf-banner');
    const h0 = parseInt(banner.style.minHeight, 10);
    for (let i = 0; i < 4; i++) $('feed').appendChild(window.buildPost({ id: 'more-' + i }));
    await wait(SETTLE);
    const h1 = parseInt(document.querySelector('.lf-banner').style.minHeight, 10);
    return h1 > h0 ? [] : [`min-height ${h0}vh -> ${h1}vh, expected growth`];
  });

  test('master switch off removes every trace; on brings it back', async () => {
    await reset({ limit: 5 });
    await window.__lfTest.set({ enabled: false });
    await wait(SETTLE);
    const out = [];
    if (lfLeftovers()) out.push('leftovers after disabling: ' + lfLeftovers());
    if (visiblePosts().length !== 40) out.push('all 40 posts should be visible when off, got ' + visiblePosts().length);
    await window.__lfTest.set({ enabled: true });
    await wait(SETTLE);
    if (visiblePosts().length !== 5) out.push('after re-enabling expected 5, got ' + visiblePosts().length);
    return out;
  });

  test('off the feed (e.g. /jobs/) nothing is filtered; back on /feed/ it is', async () => {
    await reset({ limit: 5 });
    const out = [];
    history.pushState({}, '', '/jobs/');
    $('feed').appendChild(window.buildPost({ id: 'nav-1' }));
    await wait(SETTLE);
    if (lfLeftovers()) out.push('should be stripped on /jobs/');
    history.pushState({}, '', '/feed/');
    $('feed').appendChild(window.buildPost({ id: 'nav-2' }));
    await wait(SETTLE);
    if (visiblePosts().length !== 5) out.push('expected 5 visible back on /feed/, got ' + visiblePosts().length);
    return out;
  });

  test('stats reported to the popup add up', async () => {
    await reset({ limit: 0 });
    const s = window.__lfTest.stats();
    const out = [];
    if (s.posts !== 40) out.push('posts: ' + s.posts);
    if (s.hiddenTotal !== 3) out.push('hiddenTotal: ' + s.hiddenTotal);
    if (s.collapsed !== 4) out.push('collapsed: ' + s.collapsed);
    if (s.shown !== 37) out.push('shown: ' + s.shown);
    if (!s.onFeed) out.push('onFeed false');
    return out;
  });

  test('settings are validated (junk values fall back to defaults)', async () => {
    const n = LF_normalize({ video: 'bogus', limit: -3, promoted: 5, image: 'hide', enabled: false });
    const out = [];
    if (n.video !== LF_DEFAULTS.video) out.push('video: ' + n.video);
    if (n.limit !== LF_DEFAULTS.limit) out.push('limit: ' + n.limit);
    if (n.promoted !== LF_DEFAULTS.promoted) out.push('promoted: ' + n.promoted);
    if (n.image !== 'hide') out.push('image: ' + n.image);
    if (n.enabled !== false) out.push('enabled: ' + n.enabled);
    return out;
  });

  window.runLfTests = async function () {
    const results = [];
    for (const t of tests) {
      let problems;
      try { problems = await t.fn(); } catch (e) { problems = ['threw: ' + e.message]; }
      results.push({ name: t.name, pass: problems.length === 0, problems });
    }
    await reset();
    window.__lfResults = results;
    return results;
  };
})();
