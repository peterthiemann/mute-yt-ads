(() => {
  'use strict';
  const {selectors, detect, usable, MuteSession} = globalThis.YouTubeAdMute;
  let player, video, session, observer, timer, queued = false;
  let clicked = new WeakSet();
  let pending, retryAfter = 0, sequence = 0;
  const volumeChanged = () => session?.observeMute();
  function detachVideo() {
    video?.removeEventListener('volumechange', volumeChanged);
    session?.finish();
    video = session = undefined;
  }
  function reconcile() {
    const next = document.querySelector(selectors.player);
    if (next !== player) {
      observer?.disconnect(); detachVideo(); player = next; clicked = new WeakSet();
      if (player) {
        observer = new MutationObserver(schedule);
        observer.observe(player, {subtree:true, childList:true, attributes:true,
          attributeFilter:['class','style','hidden','disabled','aria-disabled','aria-hidden','inert']});
      }
    }
    if (!player) return;
    const nextVideo = player.querySelector(selectors.video);
    if (nextVideo !== video) {
      detachVideo(); video = nextVideo;
      if (video) { session = new MuteSession(video); video.addEventListener('volumechange', volumeChanged); }
    }
    const state = detect(player);
    session?.update(state);
    if (state === 'normal') clicked = new WeakSet();
    if (state !== 'ad' || !video) return;
    for (const button of player.querySelectorAll(selectors.skip)) {
      if (!usable(button)) { clicked.delete(button); continue; }
      if (!clicked.has(button) && !pending && Date.now() >= retryAfter) {
        const request = {button, player, token: ++sequence};
        pending = request;
        chrome.runtime.sendMessage({type:'skip-ad', token:request.token}).then(result => {
          if (result?.clicked && player === request.player) clicked.add(button);
          else retryAfter = Date.now() + 5000;
        }).catch(() => { retryAfter = Date.now() + 5000; }).finally(() => {
          if (pending === request) pending = undefined;
        });
        break;
      }
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; reconcile(); });
  }
  function start() {
    if (timer) return;
    reconcile(); timer = setInterval(reconcile, 500);
  }
  function stop() {
    clearInterval(timer); timer = undefined; observer?.disconnect(); detachVideo(); player = undefined;
  }
  // Capture intent before YouTube changes muted. Never infer intent from
  // volumechange.isTrusted: browser-generated media events are trusted too.
  function userInput(event) {
    if (!event.isTrusted || !session?.active) return;
    const target = event.target;
    if (event.type === 'pointerdown') {
      if (player?.contains(target) && target.closest?.('.ytp-mute-button, .ytp-volume-panel')) session.userOverride();
    } else if ((event.key?.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) &&
      !target.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
      session.userOverride();
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (player?.contains(target) && target.closest?.('.ytp-mute-button, .ytp-volume-panel')) session.userOverride();
    }
  }
  // Recompute after debugger attachment: Chrome's notice can move the player.
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.type !== 'prepare-skip') return;
    const request = pending;
    const button = request?.button;
    if (!request || request.token !== message.token || request.player !== player ||
        !player?.isConnected || detect(player) !== 'ad' || !player.contains(button) || !usable(button)) {
      respond(null); return;
    }
    const r = button.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !hit || !button.contains(hit)) {
      respond(null); return;
    }
    respond({x, y});
  });
  document.addEventListener('pointerdown', userInput, true);
  document.addEventListener('keydown', userInput, true);
  document.addEventListener('yt-navigate-finish', schedule);
  document.addEventListener('fullscreenchange', schedule);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  start();
})();
