const {test} = require('node:test');
const assert = require('node:assert/strict');
const {detect, usable, MuteSession} = require('../core.js');
const fixture = (...classes) => ({isConnected:true, matches:()=>true, classList:{contains:c=>classes.includes(c)}});
test('player state fixtures fail closed and distinguish ads', () => {
 assert.equal(detect(null),'unknown');
 assert.equal(detect(fixture('html5-video-player','ad-showing')),'ad');
 assert.equal(detect(fixture('html5-video-player','ad-interrupting')),'unknown');
 assert.equal(detect(fixture('html5-video-player')),'normal');
});
for (const muted of [false,true]) test(`restore initial muted=${muted}, preserving volume`, () => {
 const v={muted,volume:0.37}; const s=new MuteSession(v);
 s.update('ad'); assert.equal(v.muted,true);
 s.update('ad'); s.update('unknown'); assert.equal(v.muted,true);
 s.update('normal'); assert.equal(v.muted,muted); assert.equal(v.volume,0.37);
 s.update('ad'); s.finish(); assert.equal(v.muted,muted);
});
test('explicit user changes win throughout a break; next break resets', () => {
 const v={muted:false}; const s=new MuteSession(v); s.update('ad');
 s.userOverride(); v.muted=false; s.observeMute(); s.update('ad'); assert.equal(v.muted,false);
 v.muted=true; s.observeMute(); s.update('normal'); assert.equal(v.muted,true);
 s.update('ad'); s.update('normal'); assert.equal(v.muted,true);
});

test('live observed ad flags clear while ad-created remains', () => {
 assert.equal(detect(fixture('html5-video-player','ad-created','ad-showing','ad-interrupting')), 'ad');
 assert.equal(detect(fixture('html5-video-player','ad-created')), 'normal');
});

test('YouTube resetting muted during ad is corrected without losing original state', () => {
 const v={muted:false,volume:0.42}; const s=new MuteSession(v);
 s.update('ad'); v.muted=false; s.observeMute(); assert.equal(v.muted,true);
 v.muted=false; s.update('ad'); assert.equal(v.muted,true);
 s.update('normal'); assert.equal(v.muted,false); assert.equal(v.volume,0.42);
});

// DOM-interface fixtures model computed styles without a dependency on jsdom.
function skipFixture() {
 const parent = {parentElement:null, style:{display:'block',visibility:'hidden',opacity:'1'}};
 const button = {
  isConnected:true, disabled:false, parentElement:parent,
  style:{display:'flex',visibility:'visible',opacity:'1'},
  matches:()=>false, closest:()=>null,
  getClientRects:()=>[{width:85,height:36}],
  ownerDocument:{defaultView:{getComputedStyle:el=>el.style}}
 };
 return {button,parent};
}
test('Skip may override ancestor visibility:hidden', () => {
 const {button} = skipFixture(); assert.equal(usable(button),true);
});
test('Skip rejects hidden, disabled, detached and zero-size controls', () => {
 for (const change of [
  (b,p)=>{p.style.display='none';},
  (b,p)=>{p.style.opacity='0';},
  b=>{b.style.visibility='hidden';},
  b=>{b.disabled=true;},
  b=>{b.isConnected=false;},
  b=>{b.closest=()=>({});},
  b=>{b.getClientRects=()=>[];}
 ]) {
  const {button,parent}=skipFixture(); change(button,parent);
  assert.equal(usable(button),false);
 }
});
