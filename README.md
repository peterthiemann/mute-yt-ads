# Mute YouTube Ads

Plain JavaScript, Manifest V3, no dependencies or build step. Runs only on
`https://www.youtube.com/*`. No popup, network calls or data collection. Requires Chrome 106 or newer.
A background service worker uses the `debugger` permission for browser-level Skip
clicks. YouTube host access allows validating the target tab URL. No `tabs`,
`scripting`, `activeTab`, or all-sites host permission is requested. Chrome's
powerful debugger permission nevertheless carries a broad data-access warning;
the implementation restricts requests to the main document on www.youtube.com.

## Install and update

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder (containing manifest.json).
4. Refresh any already-open YouTube tabs.

After editing files, click the extension's **Reload** button on that page, then
refresh YouTube. Approve Chrome's new debugger permission if prompted, and
re-enable the extension if the permission update disabled it. Remove or disable
the separate **YouTube Skip Debugger Test** extension once this version is loaded.
Disable or remove the extension there to uninstall.

## Behavior and maintenance

`core.js` centralizes selectors, player detection, button eligibility, and the mute
state machine. `content.js` manages the lifecycle and requests Skip clicks. `background.js`
validates the requesting extension, main frame, original document and YouTube URL,
serializes clicks per tab, attaches the debugger, asks the original content script
to revalidate the same button and recompute its center, sends a mouse press/release,
and detaches in a finally block. Hit testing excludes offscreen or covered buttons.
There is an unavoidable short race between final validation and browser input;
no coordinates are saved for later clicks. A MutationObserver watches only
the current player subtree, filtering attributes and batching callbacks. A 500 ms
fallback discovers players and replacements and catches CSS-only visibility
changes. Navigation and fullscreen events also trigger reconciliation. Old video
listeners and observers are removed on replacement; pagehide stops the timer,
with pageshow restarting it for back/forward cache restores.

The player `ad-showing` class starts an ad session. `ad-interrupting` without
`ad-showing` is uncertain; unknown states do not initiate muting or skipping, and
an existing session waits for normal state before restoration. A recognized
player without these flags counts as normal. This relies on YouTube maintaining
those flags accurately. Only visible, enabled native Skip buttons are clicked.
Each button is marked clicked only after Chrome accepts both input commands.
Failed attempts back off for five seconds. Successful buttons are not clicked
again until they become unavailable or normal playback
resumes, allowing reuse between consecutive ads. No seeking, speed changes,
request blocking, or non-skippable-ad bypass occurs.

An ad session records the video's original muted value and sets only `muted`.
Volume is never assigned. Consecutive ad states retain the same snapshot.
On normal playback or detachment, the snapshot is restored unless explicit user
input released control during the break. Trusted pointer input on the player's
mute/volume controls, keyboard activation of those controls, or the M shortcut
outside text fields releases control for the remainder of the break. The final
mute value then survives restoration. Volume is never assigned.

YouTube can reset the media mute property during ad initialization. Such changes
are re-muted on volumechange or reconciliation unless user input released control.
Media events alone cannot identify user intent. Changes through other extensions,
DevTools or accessibility mechanisms that do not emit the recognized input may
therefore be re-muted. Interacting with the volume controls releases mute control
even if only adjusting volume. On replacement, the old element is restored and
the new element receives an independent snapshot.

## Verification status and limitations

Chrome's official documentation was consulted:
- https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts

Live DOM verification on 2026-11-02 (signed out, Germany, in-app browser):
optional cookies were rejected, then a search result opened
https://www.youtube.com/watch?v=bb4KirnWsB4 (NASA Is Making Big Changes To Artemis).
A real preroll ad was observed with:

- Player: `#movie_player.html5-video-player`.
- Video: `video.html5-main-video` (also carried `video-stream`, readyState 4).
- Ad flags: `ad-showing` and `ad-interrupting` together.
- Actual Skip: `button.ytp-skip-ad-button`, also carrying
  `ytp-skip-ad-button-fix-fullscreen-grid`; enabled, visible, 85.2 × 36 CSS pixels.

Clicking that exact selector through browser automation dismissed the ad. Both
ad flags disappeared, the Skip button was removed, and the content timeline
changed from the ad's 2:56 duration to 20:03. `ad-created` remained on the player,
confirming that it must not be used alone as an active-ad signal. The existing
primary selectors already matched; no selector replacement was necessary.
Source comments now distinguish the verified primary selector from unverified
legacy Skip fallbacks. The transition-only `ad-interrupting` case remains an
unverified conservative assumption.

This verified live DOM selectors and one manual Skip action, **not an installed
extension end-to-end test**. Muting/restoration, consecutive ads, fullscreen,
navigation and replacement still require the manual checklist below. YouTube
experiments and DOM changes can differ from this single observed session.
Shorts, embedded players on other domains, and unrecognized player layouts are
not supported. A reused Skip element must become unavailable between ads to be
clicked again during one continuous break. Browser scheduling can delay actions
in background tabs; “as soon as available” means the next observer reconciliation
(or fallback tick for CSS-only changes).

## Troubleshooting

Confirm the extension is enabled, reload it and refresh the YouTube tab. Confirm
the URL starts with exactly `https://www.youtube.com/`. Check extension errors at
chrome://extensions and the YouTube DevTools console. Inspect #movie_player's
classes and the Skip button against core.js; do not substitute translated labels.
If YouTube changes its state flags, disable the extension until detection is
updated. An ad remaining audible after using the mute/volume controls is intentional.
After loading or reloading this extension, refresh all existing YouTube tabs.

## Automated checks

With Node.js installed (no npm install):

```sh
node --test tests/*.test.js
node --check core.js
node --check content.js
node --check background.js
```

Tests use minimal local DOM-interface fixtures, not a browser DOM. They verify
state classification, uncertain states, repeated ad states, initial mute values,
volume preservation, restoration, external override, and subsequent breaks.
They do not establish live selector correctness or browser integration behavior.

## Manual checklist

- [ ] Skippable ad: starts muted; actual Skip is clicked once when enabled/visible.
- [ ] Non-skippable ad: stays muted; plays for its normal duration; no seek/speed change.
- [ ] Consecutive ads: remains muted; each newly available Skip works; original state returns.
- [ ] Start muted: remains muted after the break; volume stays unchanged.
- [ ] Start unmuted: restored unmuted after the break; volume stays unchanged.
- [ ] During ad, unmute: remains unmuted without fighting; final choice survives.
- [ ] During ad, unmute then mute: final muted choice survives; volume-only change is retained.
- [ ] Navigate between videos using YouTube links, back/forward and autoplay; repeat ad checks.
- [ ] Replace video/player through navigation or DevTools: old element restored, new element handled independently.
- [ ] Fullscreen: mute, Skip and restoration continue working.
- [ ] Multiple separate breaks: each captures a fresh mute state.
- [ ] Missing/unknown player or transitional flags: no new mute or Skip action.
- [ ] Hidden/disabled Skip: no click; after becoming available, exactly one click.
- [ ] Leave page and return via back/forward: functionality resumes without duplicate clicks.

### Skip visibility correction

The visibility check now uses the Skip button's own computed `visibility`.
CSS allows a visible child inside a `visibility:hidden` ancestor; rejecting every
hidden ancestor incorrectly rejects such a control. Ancestor `display:none` and
zero opacity, hidden/inert/ARIA flags, disabled state and empty layout rectangles
still prevent clicks. Local regression fixtures cover this distinction. This is
a code-level correction; it has not been confirmed as the cause on the reporting
user's page. If Skip still fails after reloading the extension and refreshing
YouTube, inspect the actual button class and its computed styles.

### Browser-level Skip integration (version 1.1.0)

The user confirmed that the separate debugger test displayed SENT and skipped a
live ad where DOM click and synthetic pointer sequences did not work. The main
extension now automatically uses that same Input.dispatchMouseEvent press/release
mechanism. This user-confirmed test validates the mechanism; the integrated
automatic lifecycle has local mocked tests and still needs live confirmation.
Chrome may briefly display its debugging notice for each attachment. Opening
DevTools, another attached debugger, enterprise restrictions, or cancelling the
debugging session may prevent skipping; muting continues independently. Errors
appear in the main extension's service worker console at chrome://extensions.
Do not disable Chrome's debugging notices or security protections.

After updating: reload the main extension, accept the debugger permission if
prompted, and refresh all YouTube tabs. Test an available Skip without touching
the toolbar: it should activate automatically. Repeat with consecutive ads,
fullscreen, navigation, a hidden/covered Skip, and DevTools open (failure should
leave playback muted, without repeated rapid attachment attempts).

Official API references:
- https://developer.chrome.com/docs/extensions/reference/api/debugger
- https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchMouseEvent
