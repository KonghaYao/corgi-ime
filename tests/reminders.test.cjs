'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PetEngine}=require('../src/engine.cjs');
const M=60000;
const config=(overrides={})=>({waterEnabled:true,waterMinutes:30,breakEnabled:true,breakMinutes:45,...overrides});

test('reminder due boundary is exact and pending reminders never repeat',()=>{
  const e=new PetEngine({},0);
  assert.equal(e.tick(30*M-1),null);
  assert.equal(e.tick(30*M).state,'water');
  assert.deepEqual(e.snapshot().pendingReminder,{kind:'water',since:30*M});
  assert.equal(e.tick(30*M+1),null);
  assert.equal(e.tick(60*M),null);
});
test('reminder configuration validates atomically and reschedules both kinds',()=>{
  const e=new PetEngine({},0);e.showReminder('water',10);
  const before=JSON.stringify(e.snapshot());
  for(const c of [null,{},config({waterMinutes:0}),config({waterMinutes:241}),config({waterMinutes:1.5}),config({breakMinutes:NaN}),config({waterEnabled:'yes'})]){
    assert.throws(()=>e.configureReminders(c,100));
    assert.equal(JSON.stringify(e.snapshot()),before);
  }
  e.configureReminders(config({waterMinutes:1,breakMinutes:240}),100);
  assert.equal(e.snapshot().nextWater,100+M);
  assert.equal(e.snapshot().nextBreak,100+240*M);
  assert.equal(e.snapshot().pendingReminder,null);
});
test('disabled reminders do not fire and settings survive engine reconstruction',()=>{
  const e=new PetEngine({},0);e.configureReminders(config({waterEnabled:false,breakEnabled:false,waterMinutes:7,breakMinutes:9}),0);
  assert.equal(e.tick(1000*M),null);
  const restarted=new PetEngine(e.reminderSettings(),500);
  assert.deepEqual(restarted.reminderSettings(),e.reminderSettings());
  assert.equal(restarted.tick(1000*M),null);
});
test('done increments only the selected counter, dismisses and reschedules',()=>{
  const e=new PetEngine({},0);
  e.showReminder('water',10);assert.match(e.resolveReminder('done',20).text,/已记录/);
  assert.equal(e.waterDone,1);assert.equal(e.breakDone,0);assert.equal(e.next.water,20+30*M);assert.equal(e.pendingReminder,null);
  assert.equal(e.resolveReminder('done',21),null);assert.equal(e.waterDone,1);
  e.showReminder('break',30);e.resolveReminder('done',40);
  assert.equal(e.waterDone,1);assert.equal(e.breakDone,1);assert.equal(e.next.break,40+45*M);
});
test('snooze reopens an explicitly disabled category and actually fires ten minutes later',()=>{
  const e=new PetEngine(config({waterEnabled:false,breakEnabled:false}),0);
  e.showReminder('water',100);assert.match(e.resolveReminder('snooze',200).text,/重新开启/);
  assert.equal(e.reminders.water.enabled,true);assert.equal(e.waterDone,0);
  assert.equal(e.tick(200+10*M-1),null);
  assert.equal(e.tick(200+10*M).state,'water');
});
test('disable only affects the pending type and prevents future automatic alerts',()=>{
  const e=new PetEngine({},0);e.showReminder('water',100);e.resolveReminder('disable',200);
  assert.equal(e.reminders.water.enabled,false);assert.equal(e.reminders.break.enabled,true);
  assert.equal(e.tick(40*M),null);
  assert.equal(e.tick(45*M).state,'stretch');
  assert.equal(e.snapshot().pendingReminder.kind,'break');
});
test('unknown reminder kinds/actions reject without disturbing pending state',()=>{
  const e=new PetEngine({},0);e.showReminder('water',100);
  const before=JSON.stringify(e.snapshot());
  assert.throws(()=>e.showReminder('unknown',200));assert.throws(()=>e.resolveReminder('unknown',200));
  assert.equal(JSON.stringify(e.snapshot()),before);
});
test('earliest due reminder is selected and other due type is not lost',()=>{
  const e=new PetEngine(config({waterMinutes:10,breakMinutes:5}),0);
  assert.equal(e.tick(10*M).state,'stretch');
  e.resolveReminder('done',10*M);
  assert.equal(e.tick(10*M).state,'water');
});
test('focus completion does not overwrite an existing pending reminder',()=>{
  const e=new PetEngine({},0);e.focus(0);e.showReminder('water',24*M);
  assert.equal(e.tick(25*M),null);assert.equal(e.pendingReminder.kind,'water');
  e.resolveReminder('done',25*M);
  assert.equal(e.tick(25*M).state,'stretch');assert.equal(e.focusEnd,null);
  assert.equal(e.tick(26*M),null);
});
test('pause suppresses timed reminders, freezes focus and resume starts new reminder intervals',()=>{
  const e=new PetEngine({},0);e.focus(0);e.showReminder('water',M);
  e.togglePause(5*M);assert.equal(e.pendingReminder,null);
  assert.equal(e.tick(100*M),null);
  e.togglePause(65*M);
  assert.equal(e.focusEnd,85*M);assert.equal(e.next.water,95*M);assert.equal(e.next.break,110*M);
  assert.equal(e.tick(85*M-1),null);assert.equal(e.tick(85*M).state,'stretch');
});
test('focus begun during pause gets a full twenty-five minutes after resume',()=>{
  const e=new PetEngine({paused:true},0);e.focus(5*M);e.togglePause(20*M);
  assert.equal(e.focusEnd,45*M);assert.equal(e.tick(45*M-1),null);assert.equal(e.tick(45*M).state,'stretch');
});
test('focus cancel clears scheduled completion',()=>{
  const e=new PetEngine(config({waterEnabled:false,breakEnabled:false}),0);e.focus(0);assert.equal(e.focus(1),null);assert.equal(e.tick(30*M),null);
});
