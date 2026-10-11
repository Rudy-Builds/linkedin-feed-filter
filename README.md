# LinkedIn Feed Filter

A small browser extension that calms your LinkedIn feed so it is about people again, not the algorithm.

- **Videos** and **pictures / documents**: show them, show the post's text with the media tucked behind a
  **Show video / Show picture** button, or hide the whole post.
- **Hide** promoted (ads), suggested, and "someone likes / commented on this" posts.
- **Posts to show**: set a number, and your feed stops there with a "Show N more" button. `0` means no limit.

Everything is changed from the toolbar icon, saves instantly, and later setting changes apply to open LinkedIn
tabs without a reload. Nothing leaves your browser: no network requests, no tracking, only the `storage`
permission.

## Install (Chrome, Edge, Brave, Arc)

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this folder (`linked-filter`).
4. Pin the extension (puzzle-piece icon, then the pin) so the icon is easy to reach.
5. Open your LinkedIn feed and click the icon to choose what to filter. **If LinkedIn was already open when you
   installed (or reloaded) the extension, refresh that tab once**; Chrome only adds the extension to pages
   loaded after it was installed.

Firefox: add `"browser_specific_settings": { "gecko": { "id": "linkedin-feed-filter@example.com" } }` to
`manifest.json` and load it from `about:debugging` (This Firefox, then Load Temporary Add-on).

## The three media modes

| Mode | What you see |
| --- | --- |
| **Show** | LinkedIn as normal. |
| **Text only** | The post's author and text stay. The video / picture is replaced by a **Show video** button. Click it to reveal, click again to tuck it away. Videos are paused while hidden. |
| **Hide post** | The whole post is removed from the feed. |

## Good to know

- **Only the home feed is filtered** (`linkedin.com/feed`), not profiles, jobs, or messages.
- **The limit counts posts you can actually see.** Hidden ads do not use up slots.
- **Past your limit you get a card with "Show N more".** That card is deliberately tall: LinkedIn loads more
  posts whenever the end of its list is on screen, and hidden posts take no room, so the card is meant to push
  that point away so the feed stops loading in the background. This has only been checked against a mock, not
  LinkedIn's real infinite scroll. If the feed seems to keep loading past your limit, raise or remove the limit
  (set it to `0`) and let me know.
- **Promoted / Suggested / activity detection reads the label text, in English.** For another language add the
  word to `CONFIG.labels` in `content.js`.

## If a post slips through

LinkedIn changes its page structure from time to time. All the selectors and keywords live in one block,
`CONFIG`, at the top of [content.js](content.js), with a comment saying which setting to change for which symptom:

| Symptom | Fix |
| --- | --- |
| The popup says "No posts found yet" on a loaded feed | Add a selector to `CONFIG.postRoots`. |
| A promoted / suggested post is still visible | Add its label (lowercase) to `CONFIG.labels`. |
| A video or picture is not tucked away | Add a selector to `CONFIG.videos`, or lower `CONFIG.minMedia`. |
| Hiding media also hides the Like / Comment bar | Add a selector for the bar to `CONFIG.chromeMarkers`. |

After editing, click the reload icon on the extension's card in `chrome://extensions` and refresh LinkedIn.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 definition. |
| `content.js`, `content.css` | Runs on LinkedIn: finds posts, applies your settings. |
| `defaults.js` | The settings model and defaults, shared by the content script and popup. |
| `popup.html`, `popup.css`, `popup.js` | The settings UI (also used as the extension's options page). |
| `icons/` | Toolbar icons. |
| `test/` | A mock feed and in-page tests (see below). |

## Testing without LinkedIn

```bash
python3 test/serve.py
```

Open <http://localhost:8765/feed/> and run `await window.runLfTests()` in the browser console. It builds a mock
feed (text, picture, video, promoted, suggested, activity, old and new markup, comment images) and checks
filtering, the Show button, the limit, live setting changes, and posts that load later.
<http://localhost:8765/popup-preview.html> shows the popup with a fake storage.

These tests run against a mock of LinkedIn's markup, not the live site.
