'use strict';
// DOM contract tests; a mock DOM cannot certify rendered layout or OS input.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PetEngine}=require('../src/engine.cjs');
function boot(){
  const html=fs.readFileSync(path.resolve(__dirname,'../renderer/index.html'),'utf8');
  const elements={}, documentEvents={};
  for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)){
    const listeners={};
    elements[id]={id,hidden:id==='settings'||id==='reminderCard'||id==='hoverActions',value:'',checked:false,textContent:'',dataset:{},listeners,
      classList:{toggle(){}},setAttribute(){},addEventListener:(name,fn)=>{listeners[name]=fn;},setPointerCapture(){}};
  }
  const actions=[],engine=new PetEngine();let subscriber,openSettings=false;const timers=new Map();let timerId=0;
  const send=extra=>subscriber({...engine.snapshot(),openSettings,...extra});
  const api={subscribe:fn=>{subscriber=fn;},action:async(name,value)=>{
    actions.push({name,value});let event;
    if(name==='threshold')engine.setThreshold(value);
    else if(name==='reminderSettings')engine.configureReminders(value);
    else if(name==='reminderNow')event=engine.showReminder(value);
    else if(name==='reminderAction')event=engine.resolveReminder(value);
    else if(name==='pet'){engine.pats++;event={state:'pet',text:'摸摸已记录'};}
    else if(name==='snack'){engine.treats++;event={state:'snack',text:'饼干已记录'};}
    else if(name==='pause')engine.togglePause();
    else if(name==='focus')engine.focus();
    else if(name==='openSettings')openSettings=true;
    else if(name==='closeSettings')openSettings=false;
    send(event||{});return engine.snapshot();
  }};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../renderer/renderer.js'),'utf8'),{
    document:{getElementById:id=>{assert.ok(elements[id],`missing element ${id}`);return elements[id];},
      querySelectorAll:()=>['threshold','waterEnabled','waterMinutes','breakEnabled','breakMinutes'].map(id=>elements[id]),
      addEventListener(name,fn){documentEvents[name]=fn;}},window:{corgi:api,CORGI_SVG:'<svg></svg>'},setInterval(){},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},Date
  });
  send({});
  return{elements,actions,engine,send,documentEvents, enterBody:()=>elements.petArea.onpointerover({target:{closest:s=>s==='.corgi-body'}}), flush:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},
    click:async id=>{await elements[id].onclick({stopPropagation(){}});await new Promise(resolve=>setImmediate(resolve));},
    edit:(id,value)=>{if(typeof value==='boolean')elements[id].checked=value;else elements[id].value=String(value);elements[id].listeners.input();}};
}
test('renderer preserves unsaved reminder fields when only threshold is saved',async()=>{
  const h=boot();h.edit('waterMinutes',7);h.edit('threshold',200);h.send({total:123});
  assert.equal(String(h.elements.waterMinutes.value),'7');
  await h.click('save');assert.equal(h.engine.threshold,200);assert.equal(h.engine.reminders.water.minutes,30);
  assert.equal(String(h.elements.waterMinutes.value),'7');
  await h.click('saveReminders');assert.equal(h.engine.reminders.water.minutes,7);
});
test('renderer preserves unsaved threshold when reminder settings are saved and close cancels only unsaved edits',async()=>{
  const h=boot();h.edit('threshold',220);h.edit('breakMinutes',8);await h.click('saveReminders');
  assert.equal(h.engine.reminders.break.minutes,8);assert.equal(h.engine.threshold,120);assert.equal(String(h.elements.threshold.value),'220');
  await h.click('close');assert.equal(String(h.elements.threshold.value),'120');assert.equal(h.elements.settings.hidden,true);
});
test('renderer reminder controls open actual pending card and done/snooze/disable resolve it',async()=>{
  const h=boot();
  await h.click('waterNow');assert.equal(h.elements.reminderCard.hidden,false);assert.equal(h.engine.pendingReminder.kind,'water');
  await h.click('reminderDone');assert.equal(h.elements.reminderCard.hidden,true);assert.equal(h.engine.waterDone,1);assert.match(h.elements.interactionCounts.textContent,/喝水 1/);
  await h.click('breakNow');assert.equal(h.engine.pendingReminder.kind,'break');await h.click('reminderSnooze');assert.equal(h.elements.reminderCard.hidden,true);assert.ok(h.engine.next.break>Date.now());
  await h.click('waterNow');await h.click('reminderDisable');assert.equal(h.engine.reminders.water.enabled,false);assert.equal(h.elements.reminderCard.hidden,true);
});
test('renderer all visible action buttons route to expected operations and update counters',async()=>{
  const h=boot();
  for(const [id,name]of [['focus2','focus'],['focus2','focus'],['pause','pause'],['walkNow','walkNow'],['chooseDir','chooseDir'],['install','install'],['uninstall','uninstall'],['close','closeSettings']]){
    await h.click(id);assert.equal(h.actions.at(-1).name,name,id);
  }
  assert.equal(h.engine.pats,0);assert.equal(h.engine.treats,0);
  assert.equal(h.engine.focusEnd,null);assert.equal(h.engine.paused,true);
});

test('pet gestures retain actions without toolbar: single, double, drag, context keyboard',async()=>{
 const h=boot(),pet=h.elements.petArea;assert.equal(h.elements.toolbar,undefined);
 const down=()=>pet.onpointerdown({button:0,clientX:10,clientY:10,currentTarget:pet,pointerId:1});
 down();pet.onpointerup();h.flush();await new Promise(r=>setImmediate(r));assert.equal(h.engine.pats,1);
 down();pet.onpointerup();down();pet.onpointerup();h.flush();await new Promise(r=>setImmediate(r));assert.equal(h.engine.treats,1);assert.equal(h.engine.pats,1);
 down();pet.onpointermove({clientX:30,clientY:30});pet.onpointerup();h.flush();assert.equal(h.engine.pats,1);
 let prevented=false;pet.oncontextmenu({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.actions.at(-1).name,'menu');
 pet.onkeydown({key:'F10',shiftKey:true,preventDefault(){}});assert.equal(h.actions.at(-1).name,'menu');
});

test('halo is initially hidden, enters, cancels delayed leave and leaves document immediately',()=>{
 const h=boot(),halo=h.elements.petHalo,nav=h.elements.hoverActions;
 assert.equal(nav.hidden,true);h.enterBody();assert.equal(nav.hidden,false);assert.equal(h.actions.at(-1).name,'hover');assert.equal(h.actions.at(-1).value,true);
 halo.onpointerleave();assert.equal(nav.hidden,false);h.enterBody();h.flush();assert.equal(nav.hidden,false);
 halo.onpointerleave();h.flush();assert.equal(nav.hidden,true);h.enterBody();h.documentEvents.mouseleave();assert.equal(nav.hidden,true);
});
test('all six halo buttons perform actual operations without drag start or extra pet',async()=>{
 const h=boot();h.enterBody();
 for(const [id,name,val]of [['haloPet','pet'],['haloSnack','snack'],['haloWater','reminderNow','water'],['haloBreak','reminderNow','break'],['haloFocus','focus'],['haloSettings','openSettings']]){
 let stopped=false;h.elements[id].onpointerdown({stopPropagation(){stopped=true;}});assert.ok(stopped);await h.click(id);assert.equal(h.actions.at(-1).name,name);assert.equal(h.actions.at(-1).value,val);
 if(val){assert.equal(h.engine.pendingReminder.kind,val);await h.click('reminderDone');}
 }
 assert.equal(h.engine.pats,1);assert.equal(h.engine.treats,1);assert.equal(h.engine.waterDone,1);assert.equal(h.engine.breakDone,1);assert.ok(h.engine.focusEnd);assert.equal(h.elements.settings.hidden,false);assert.equal(h.actions.some(x=>x.name==='dragStart'),false);
});
test('halo hides during settings, pending reminder and drag, preserving underlying controls',async()=>{
 const h=boot(),halo=h.elements.petHalo,nav=h.elements.hoverActions,pet=h.elements.petArea;
 h.enterBody();await h.click('haloSettings');assert.equal(nav.hidden,true);h.enterBody();assert.equal(nav.hidden,true);await h.click('close');h.enterBody();assert.equal(nav.hidden,false);
 await h.click('haloWater');assert.equal(nav.hidden,true);h.enterBody();assert.equal(nav.hidden,true);await h.click('reminderDone');h.enterBody();assert.equal(nav.hidden,false);
 pet.onpointerdown({button:0,clientX:0,clientY:0,currentTarget:pet,pointerId:1});pet.onpointermove({clientX:20,clientY:20});assert.equal(nav.hidden,true);h.enterBody();assert.equal(nav.hidden,true);pet.onpointerup();h.flush();assert.equal(h.engine.pats,0);
});
test('halo action cancels pending single-click praise and halo hit-testing holds roam',async()=>{
 const h=boot(),p=h.elements.petArea;p.onpointerdown({button:0,clientX:0,clientY:0,currentTarget:p,pointerId:1});p.onpointerup();await h.click('haloSnack');h.flush();assert.equal(h.engine.pats,0);assert.equal(h.engine.treats,1);
 let selector;h.documentEvents.mousemove({target:{closest(s){selector=s;return true;}}});assert.match(selector,/petArea/);assert.equal(h.actions.at(-1).name,'hover');assert.equal(h.actions.at(-1).value,true);
});

test('renderer pet size selector routes changes and reflects main state',async()=>{
  const h=boot();h.elements.petScale.value='1.25';
  await h.elements.petScale.onchange();
  assert.equal(h.actions.at(-1).name,'petScale');assert.equal(h.actions.at(-1).value,1.25);
  h.send({petScale:1.5});assert.equal(String(h.elements.petScale.value),'1.5');
});
test('closed ring ignores transparent outer area and opens only on real corgi body',()=>{
 const h=boot(),nav=h.elements.hoverActions;h.elements.petHalo.onpointerenter();assert.equal(nav.hidden,true);assert.equal(h.actions.length,0);
 h.elements.petArea.onpointerover({target:{closest:()=>null}});assert.equal(nav.hidden,true);
 h.enterBody();assert.equal(nav.hidden,false);h.elements.petHalo.onpointerleave();h.elements.petHalo.onpointerenter();h.flush();assert.equal(nav.hidden,false);
 h.elements.petHalo.onpointerleave();h.flush();assert.equal(nav.hidden,true);
 let asked=[];h.documentEvents.mousemove({target:{closest:s=>{asked.push(s);return null;}}});assert.equal(asked.includes('#petHalo'),false);assert.equal(h.actions.at(-1).value,false);
 h.enterBody();asked=[];h.documentEvents.mousemove({target:{closest:s=>{asked.push(s);return s==='#petHalo';}}});assert.equal(asked.includes('#petHalo'),true);assert.equal(h.actions.at(-1).value,true);
});
