/* Shared by content.js and popup.js: the settings model and its defaults. */

var LF_DEFAULTS = {
  enabled: true,
  video: 'text',      // 'show' | 'text' (text only + "Show video" button) | 'hide' (whole post)
  image: 'text',      // same three modes; covers pictures, carousels, documents, link previews
  promoted: 'hide',   // 'show' | 'hide'
  suggested: 'hide',  // 'show' | 'hide'
  activity: 'hide',   // "<name> likes / commented on this" posts: 'show' | 'hide'
  limit: 20           // max posts shown on the feed; 0 = no limit
};

function LF_normalize(raw) {
  var s = Object.assign({}, LF_DEFAULTS, raw || {});
  var pick = function (value, allowed, fallback) {
    return allowed.indexOf(value) === -1 ? fallback : value;
  };
  var limit = parseInt(s.limit, 10);
  if (!isFinite(limit) || limit < 0) limit = LF_DEFAULTS.limit;
  return {
    enabled: s.enabled !== false,
    video: pick(s.video, ['show', 'text', 'hide'], LF_DEFAULTS.video),
    image: pick(s.image, ['show', 'text', 'hide'], LF_DEFAULTS.image),
    promoted: pick(s.promoted, ['show', 'hide'], LF_DEFAULTS.promoted),
    suggested: pick(s.suggested, ['show', 'hide'], LF_DEFAULTS.suggested),
    activity: pick(s.activity, ['show', 'hide'], LF_DEFAULTS.activity),
    limit: Math.min(limit, 500)
  };
}
