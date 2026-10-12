# LinkedIn Feed Filter

**A free add-on for your web browser that makes your LinkedIn feed calmer.** It hides ads and "suggested" posts,
tucks videos and pictures behind a button, and stops the feed after a number of posts you choose, so LinkedIn is
about people again, not the algorithm.

## What it does

- **Hides ads and clutter.** Promoted (ad) posts, "Suggested for you" posts, and "Someone likes / commented on this"
  posts disappear from your feed.
- **Keeps videos and pictures out of your face.** You still see who posted and what they wrote. The video or
  picture waits behind a **Show video** / **Show picture** button until you want it. Or hide those posts entirely.
- **Gives your feed an end.** Pick how many posts you want (the default is 20). When you reach it, the feed stops
  and offers a **Show more** button instead of scrolling forever.

Everything is controlled from one small menu, and changes apply right away.

## Install (about 3 minutes, no coding)

Works in **Google Chrome, Microsoft Edge, Brave and Arc**. (It is not in the Chrome Web Store, so the steps below
install it directly from this page.)

**1. Download it.**
At the top of this page, click the green **Code** button, then **Download ZIP**.

**2. Unzip it.**
Open your Downloads folder and unzip the file you just got (Windows: right-click it, then **Extract All**.
Mac: double-click it). You now have a folder called `linkedin-feed-filter-main`.
Move it somewhere permanent, such as your Documents folder. **Don't delete or move it later**, because your
browser reads the add-on from that folder.

**3. Open your browser's extensions page.**
Click the browser menu (the three dots, top right), then **Extensions**, then **Manage Extensions**.
Or type `chrome://extensions` into the address bar and press Enter (Edge: `edge://extensions`).

**4. Turn on Developer mode.**
Flip the **Developer mode** switch in the top-right corner (in Edge it is in the left-hand menu).
This only lets you add extensions from your own computer.

**5. Add the folder.**
Click **Load unpacked**, pick the `linkedin-feed-filter-main` folder (the one with a file called `manifest.json`
inside), and click **Select Folder**. "LinkedIn Feed Filter" now appears in your list.

**6. Pin it so it's easy to find.**
Click the puzzle-piece icon next to your address bar, then the pin beside **LinkedIn Feed Filter**.

**7. Open LinkedIn.**
Go to your LinkedIn home feed. **If LinkedIn was already open, refresh that tab once.** Browsers only add an
extension to pages loaded after it was installed.

That's it. With the default settings your feed is already filtered.

## How to use it

Click the **Feed Filter** icon in your toolbar while you're on LinkedIn. Every change saves instantly.

| Setting | What it does |
| --- | --- |
| **On / off switch** (top right) | Turn the filter off completely without removing it. |
| **Videos** and **Pictures & documents** | Choose **Show** (normal LinkedIn), **Text only** (keep the words, hide the media behind a button), or **Hide post** (remove the whole post). |
| **Hide these posts** | Switch off **Promoted** (ads), **Suggested** and **Connection activity** posts. |
| **Posts to show** | How many posts to show before the feed stops. Use **+** / **−** or type a number. **0 means no limit.** |
| **Reset to defaults** | Puts everything back the way it was when you installed it. |

**Default settings:** videos and pictures set to *Text only*, ads, suggested and activity posts hidden, and a
limit of 20 posts.

When a post is set to *Text only*, click **Show video** or **Show picture** to reveal it, and click again to tuck
it away. Videos pause while hidden.

## Updating, turning off, removing

- **Update to a newer version:** download the ZIP again (step 1), copy its contents over your old folder, then on
  the extensions page click the circular **reload** arrow on the LinkedIn Feed Filter card.
- **Turn it off for a while:** use the on/off switch in the menu, or the toggle on the extensions page.
- **Remove it:** on the extensions page, click **Remove** on the LinkedIn Feed Filter card. You can then delete the
  folder.

## Your privacy

The add-on runs only on LinkedIn pages and only needs permission to save your settings. It doesn't collect
anything, track you, or send any data anywhere; your settings stay in your browser.

## Something not working?

| What you see | What to try |
| --- | --- |
| Nothing changed on LinkedIn | Refresh the LinkedIn tab. Check the on/off switch in the menu is on. |
| It only works on the home feed | That's on purpose. Profiles, jobs and messages are left alone. |
| The feed stops and shows "Show more" | That's your **Posts to show** limit. Click **Show more**, raise the number, or set it to `0`. |
| An ad or suggested post still gets through | LinkedIn changes its page layout now and then. Please [open an issue](../../issues) and say what you saw. |
| Ads aren't hidden and LinkedIn is in another language | Ad and "suggested" detection currently reads English labels only. |

---

<details>
<summary><strong>For developers</strong></summary>

### Firefox

Add `"browser_specific_settings": { "gecko": { "id": "linkedin-feed-filter@example.com" } }` to `manifest.json`
and load it from `about:debugging` (This Firefox, then Load Temporary Add-on).

### Good to know

- **Only the home feed is filtered** (`linkedin.com/feed`), not profiles, jobs, or messages.
- **The limit counts posts you can actually see.** Hidden ads do not use up slots.
- **Past your limit you get a card with "Show N more".** That card is deliberately tall: LinkedIn loads more
  posts whenever the end of its list is on screen, and hidden posts take no room, so the card is meant to push
  that point away so the feed stops loading in the background. This has only been checked against a mock, not
  LinkedIn's real infinite scroll. If the feed seems to keep loading past your limit, raise or remove the limit
  (set it to `0`) and open an issue.
- **Promoted / Suggested / activity detection reads the label text, in English.** For another language add the
  word to `CONFIG.labels` in `content.js`.

### If a post slips through

LinkedIn changes its page structure from time to time. All the selectors and keywords live in one block,
`CONFIG`, at the top of [content.js](content.js), with a comment saying which setting to change for which symptom:

| Symptom | Fix |
| --- | --- |
| The popup says "No posts found yet" on a loaded feed | Add a selector to `CONFIG.postRoots`. |
| A promoted / suggested post is still visible | Add its label (lowercase) to `CONFIG.labels`. |
| A video or picture is not tucked away | Add a selector to `CONFIG.videos`, or lower `CONFIG.minMedia`. |
| Hiding media also hides the Like / Comment bar | Add a selector for the bar to `CONFIG.chromeMarkers`. |

After editing, click the reload icon on the extension's card in `chrome://extensions` and refresh LinkedIn.

### Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 definition. |
| `content.js`, `content.css` | Runs on LinkedIn: finds posts, applies your settings. |
| `defaults.js` | The settings model and defaults, shared by the content script and popup. |
| `popup.html`, `popup.css`, `popup.js` | The settings UI (also used as the extension's options page). |
| `icons/` | Toolbar icons. |
| `test/` | A mock feed and in-page tests (see below). |

### Testing without LinkedIn

```bash
python3 test/serve.py
```

Open <http://localhost:8765/feed/> and run `await window.runLfTests()` in the browser console. It builds a mock
feed (text, picture, video, promoted, suggested, activity, old and new markup, comment images) and checks
filtering, the Show button, the limit, live setting changes, and posts that load later.
<http://localhost:8765/popup-preview.html> shows the popup with a fake storage.

These tests run against a mock of LinkedIn's markup, not the live site.

</details>
