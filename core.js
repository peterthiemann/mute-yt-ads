/* YouTube-specific DOM contract. Unknown player layouts fail closed. */
(function (root) {
  'use strict';
  // Verified 2026-11-02: player/video and ytp-skip-ad-button on a live ad.
  // Older ytp-ad-skip-button variants remain compatibility fallbacks (unverified).
  const selectors = Object.freeze({player:'#movie_player.html5-video-player', video:'video.html5-main-video', skip:'button.ytp-skip-ad-button, button.ytp-ad-skip-button, button.ytp-ad-skip-button-modern'});
  function detect(player) {
    if (!player?.isConnected || !player.matches(selectors.player)) return 'unknown';
    if (player.classList.contains('ad-showing')) return 'ad';
    if (player.classList.contains('ad-interrupting')) return 'unknown';
    return player.classList.contains('html5-video-player') ? 'normal' : 'unknown';
  }
  function usable(button) {
    if (!button.isConnected || button.disabled || button.matches(':disabled') || button.closest('[hidden], [inert], [aria-disabled="true"], [aria-hidden="true"]')) return false;
    const win = button.ownerDocument.defaultView;
    // Visibility is inherited but descendants can override hidden ancestors.
    // Check the button's computed value; display/opacity still hide descendants.
    if (win.getComputedStyle(button).visibility !== 'visible') return false;
    for (let el = button; el; el = el.parentElement) {
      const style = win.getComputedStyle(el);
      if (style.display === 'none' || Number(style.opacity) === 0) return false;
    }
    return Array.from(button.getClientRects()).some(r => r.width > 0 && r.height > 0);
  }
  class MuteSession {
    constructor(video) { this.video = video; this.active = false; this.expected = video.muted; this.override = false; }
    userOverride() {
      if (this.active) this.override = true;
    }
    observeMute() {
      // volumechange cannot distinguish YouTube initialization from user intent.
      // Only explicit input releases control; page-driven resets are re-muted.
      if (this.active && !this.override && !this.video.muted) {
        this.video.muted = true;
      }
    }
    update(state) {
      if (state === 'ad') this.observeMute();
      if (state === 'ad' && !this.active) {
        this.before = this.video.muted; this.active = true; this.override = false;
        this.expected = true; this.video.muted = true;
      } else if (state === 'normal') this.finish();
    }
    finish() {
      if (this.active && !this.override) this.video.muted = this.before;
      this.active = false;
    }
  }
  const api = {selectors, detect, usable, MuteSession};
  if (typeof module !== 'undefined') module.exports = api;
  else root.YouTubeAdMute = api;
})(globalThis);
