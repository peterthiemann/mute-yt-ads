const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup({point={x:100,y:50},fail=false}={}) {
 const calls=[]; let listener;
 const chrome={runtime:{id:'test',onMessage:{addListener:f=>{listener=f;}}},
  tabs:{get:async()=>({url:'https://www.youtube.com/watch?v=test'}),sendMessage:async()=>point},
  debugger:{attach:async()=>{calls.push('attach');},detach:async()=>{calls.push('detach');},
   sendCommand:async(t,m,p)=>{calls.push(p.type);if(fail)throw Error('input failed');}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'),'utf8'),{chrome,URL,console:{warn:()=>{}}});
 const sender={id:'test',frameId:0,documentId:'doc',url:'https://www.youtube.com/watch?v=test',tab:{id:1}};
 return {calls,run:(s=sender)=>new Promise(resolve=>listener({type:'skip-ad',token:1},s,resolve))};
}
test('debugger press/release and detach after fresh validation',async()=>{
 const t=setup();assert.equal((await t.run()).clicked,true);
 assert.deepEqual(t.calls,['attach','mousePressed','mouseReleased','detach']);
});
test('stale button cancels input and detaches',async()=>{
 const t=setup({point:null});assert.equal((await t.run()).clicked,false);
 assert.deepEqual(t.calls,['attach','detach']);
});
test('input failure still detaches',async()=>{
 const t=setup({fail:true});assert.equal((await t.run()).clicked,false);
 assert.equal(t.calls.at(-1),'detach');
});
test('rejects foreign sender without attachment',async()=>{
 const t=setup();assert.equal((await t.run({id:'other'})).clicked,false);assert.deepEqual(t.calls,[]);
});
