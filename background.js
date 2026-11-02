'use strict';

const busy = new Set();
function youtubeURL(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'www.youtube.com'; }
  catch { return false; }
}

async function skipAd(message, sender) {
  const tabId = sender.tab?.id;
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 ||
      !Number.isInteger(tabId) || typeof sender.documentId !== 'string' || !youtubeURL(sender.url) ||
      !Number.isSafeInteger(message.token) || busy.has(tabId)) return {clicked:false};
  busy.add(tabId);
  const target = {tabId};
  let attached = false;
  try {
    if (!youtubeURL((await chrome.tabs.get(tabId)).url)) return {clicked:false};
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    // Target the originating document, never a replacement after navigation.
    const point = await chrome.tabs.sendMessage(tabId,
      {type:'prepare-skip', token:message.token}, {documentId:sender.documentId});
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0)
      return {clicked:false};
    if (!youtubeURL((await chrome.tabs.get(tabId)).url)) return {clicked:false};
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type:'mousePressed', x:point.x, y:point.y, button:'left', buttons:1, clickCount:1
    });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type:'mouseReleased', x:point.x, y:point.y, button:'left', buttons:0, clickCount:1
    });
    return {clicked:true};
  } catch (error) {
    console.warn('YouTube Skip failed:', error.message);
    return {clicked:false};
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(target); }
      catch { /* Tab closed or Chrome already detached it. */ }
    }
    busy.delete(tabId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'skip-ad') return;
  skipAd(message, sender).then(respond, () => respond({clicked:false}));
  return true;
});
