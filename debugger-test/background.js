'use strict';

const busy = new Set();
const youtubeURL = url => {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'www.youtube.com'; }
  catch { return false; }
};

// Runs in the tab only after the user explicitly clicks the extension icon.
function findSkip() {
  const player = document.querySelector('#movie_player.html5-video-player.ad-showing');
  if (!player) return {error: 'No active ad detected. Try during an ad with Skip visible.'};
  for (const button of player.querySelectorAll('button.ytp-skip-ad-button, button.ytp-ad-skip-button, button.ytp-ad-skip-button-modern')) {
    if (button.disabled || button.matches(':disabled') || button.closest('[hidden], [inert], [aria-disabled="true"], [aria-hidden="true"]')) continue;
    if (getComputedStyle(button).visibility !== 'visible') continue;
    let hidden = false;
    for (let el = button; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || Number(style.opacity) === 0) hidden = true;
    }
    if (hidden) continue;
    const r = button.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    if (!button.contains(document.elementFromPoint(x, y))) continue;
    return {x, y, selector: button.className};
  }
  return {error: 'No visible, enabled, unobstructed Skip button found.'};
}

async function result(tabId, badge, message) {
  console.info(message);
  await chrome.action.setBadgeText({tabId, text: badge});
  await chrome.action.setTitle({tabId, title: message});
}

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || busy.has(tab.id)) return;
  const tabId = tab.id;
  if (!youtubeURL(tab.url)) {
    await result(tabId, 'NO', 'Open https://www.youtube.com/ and try during a skippable ad.');
    return;
  }
  busy.add(tabId);
  const target = {tabId};
  let attached = false;
  try {
    await result(tabId, '…', 'Checking visible Skip button…');
    // Attaching can move the viewport, so resolve coordinates afterward.
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    const current = await chrome.tabs.get(tabId);
    if (!youtubeURL(current.url)) throw new Error('The tab navigated away from YouTube.');
    const [{result: button}] = await chrome.scripting.executeScript({target: {tabId}, func: findSkip});
    if (!button || button.error) throw new Error(button?.error || 'Could not inspect Skip.');
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: button.x, y: button.y, button: 'left', buttons: 1, clickCount: 1
    });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: button.x, y: button.y, button: 'left', buttons: 0, clickCount: 1
    });
    await result(tabId, 'SENT', 'One browser-level click sent. Check whether the ad skipped.');
  } catch (error) {
    await result(tabId, 'ERR', `Skip test: ${error.message}`);
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(target); }
      catch (error) { console.info('Debugger already detached:', error.message); }
    }
    busy.delete(tabId);
  }
});
