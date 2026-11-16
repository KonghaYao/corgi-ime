'use strict';
// Tests actual main.cjs orchestration with a mocked Electron shell. These tests
// do NOT certify native focus, click-through, IME integration or OS packaging.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const main = path.resolve(__dirname, '../src/main.cjs');
const localRequire = createRequire(main);

async function boot(t, settings, platform='win32') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corgi-main-test-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  fs.mkdirSync(path.join(dir, 'corgi-stats'));
  fs.writeFileSync(path.join(dir, 'settings.json'), settings === undefined
    ? JSON.stringify({rimeDir:dir, threshold:20}) : settings);
  const states = [], handlers = {}, intervals = [];
  let win, menu, menuCallback, clock=Date.now(), cursor={x:0,y:0};
  const dialogs={folder:{canceled:true,filePaths:[]},message:{response:0}};
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length?args:[clock])); }
    static now() { return clock; }
  }
  const engineModule={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../src/engine.cjs'),'utf8'),
    {module:engineModule,Date:FakeDate});
  class Window {
    constructor(options) {
      win = this; this.options = options; this.focused = false;
      this.bounds={x:options.x,y:options.y,width:options.width,height:options.height};
      this.webContents = {send:(_channel,s) => states.push(s),
        setWindowOpenHandler(){}, on(){}};
    }
    setMenu() {}
    setIgnoreMouseEvents(value) { this.ignoreMouse = value; }
    setFocusable(value) { this.focusable = value; }
    focus() { this.focused = true; }
    loadFile() {}
    once(_event, fn) { fn(); }
    showInactive() {}
    isDestroyed() { return false; }
    getBounds() { return {...this.bounds}; }
    setPosition(x,y) { this.bounds.x=x;this.bounds.y=y; }
  }
  const electron = {
    app:{requestSingleInstanceLock:()=>true, on(){},
      whenReady:()=>Promise.resolve(), getPath:()=>dir, quit(){}},
    BrowserWindow:Window,
    ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}},
    Menu:{buildFromTemplate:items=>{menu=items; return {popup(options){menuCallback=options.callback;}};}},
    dialog:{showOpenDialog:async()=>dialogs.folder,showMessageBox:async()=>dialogs.message},
    screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),on(){},
      getCursorScreenPoint:()=>({...cursor}),
      getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1080}})}
  };
  vm.runInNewContext(fs.readFileSync(main, 'utf8'), {
    require:name => name === 'electron' ? electron
      : name === './engine.cjs' ? engineModule.exports
      : name === 'node:os' ? {...os,homedir:()=>dir} : localRequire(name),
    __dirname:path.dirname(main),
    process:{platform,env:{APPDATA:dir}}, Date:FakeDate,
    setInterval:fn=>{intervals.push(fn);return intervals.length;},
    clearInterval(){}, setTimeout:()=>1, clearTimeout(){}
  }, {filename:main});
  await Promise.resolve();
  assert.ok(win, 'main should create its window');
  assert.equal(intervals.length, 2);
  const now = new Date(clock);
  const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const file = path.join(dir, 'corgi-stats', `${day}-qa-a.stats`);
  return {dir, states, win, dialogs,
    advance:ms=>{clock+=ms;}, now:()=>clock,
    moveCursor:(x,y)=>{cursor={x,y};},
    walk:intervals[1], poll:intervals[0], latest:()=>states.at(-1),
    put:(seq,total)=>fs.writeFileSync(file, `CORGI1\t${day}\tqa\t${seq}\t${total}\n`),
    partial:()=>fs.writeFileSync(file, 'CORGI1\t'),
    action:(name,value,sender=win.webContents)=>handlers.action({sender},name,value),
    closeMenu:()=>menuCallback(), getMenu:()=>menu};
}

test('main integrates connection, monotonic counters and pause/resume without catch-up', async t => {
  const h = await boot(t);
  h.put(1,10); h.poll();
  assert.equal(h.latest().connected, true);
  h.put(2,15); h.poll();
  assert.equal(h.latest().total, 15);
  h.partial(); h.poll();
  assert.equal(h.latest().total, 15);
  h.put(3,15); h.poll();
  assert.equal(h.latest().progress, 15, 'partial write recovery must not double count');
  await h.action('pause');
  h.put(4,100); // No timer poll occurs before immediate resume.
  await h.action('pause');
  h.put(5,101); h.poll();
  assert.equal(h.latest().progress, 1);
  assert.equal(h.latest().praises, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'settings.json'),'utf8')).paused, false);
});

test('main records each pet/snack action and returns visible feedback',async t=>{
  const h=await boot(t);
  await h.action('pet');assert.equal(h.latest().pats,1);assert.equal(h.latest().state,'pet');assert.ok(h.latest().text);
  await h.action('snack');assert.equal(h.latest().treats,1);assert.equal(h.latest().state,'snack');assert.ok(h.latest().text);
  await h.action('focus');assert.equal(h.latest().focusEnd,h.now()+25*60000);assert.ok(h.latest().text);
  await h.action('focus');assert.equal(h.latest().focusEnd,null);assert.match(h.latest().text,/取消/);
  await h.action('threshold',200);assert.equal(h.latest().threshold,200);assert.match(h.latest().text,/200/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'settings.json'),'utf8')).threshold,200);
});

test('main reminder actions persist configuration and snooze really becomes due',async t=>{
  const h=await boot(t);
  await h.action('reminderSettings',{waterEnabled:false,waterMinutes:2,breakEnabled:false,breakMinutes:3});
  assert.match(h.latest().text,/保存/);
  await h.action('reminderNow','water');assert.equal(h.latest().pendingReminder.kind,'water');assert.equal(h.latest().state,'water');
  await h.action('reminderAction','snooze');assert.equal(h.latest().pendingReminder,null);assert.equal(h.latest().nextWater,h.now()+10*60000);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'settings.json'),'utf8')).waterEnabled,true);
  h.advance(10*60000-1);h.poll();assert.equal(h.latest().pendingReminder,null);
  h.advance(1);h.poll();assert.equal(h.latest().pendingReminder.kind,'water');
  await h.action('reminderAction','done');assert.equal(h.latest().waterDone,1);assert.equal(h.latest().pendingReminder,null);
  await h.action('reminderNow','break');await h.action('reminderAction','done');assert.equal(h.latest().breakDone,1);
  await h.action('reminderNow','water');await h.action('reminderAction','disable');
  assert.equal(h.latest().waterEnabled,false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'settings.json'),'utf8')).waterEnabled,false);
});

test('main pauses reminder scheduling and resumes without overdue reminder flood',async t=>{
  const h=await boot(t);
  await h.action('reminderSettings',{waterEnabled:true,waterMinutes:1,breakEnabled:false,breakMinutes:3});
  await h.action('pause');h.advance(10*60000);h.poll();assert.equal(h.latest().pendingReminder,null);
  await h.action('pause');h.poll();assert.equal(h.latest().pendingReminder,null);
  h.advance(60000);h.poll();assert.equal(h.latest().pendingReminder.kind,'water');
});

test('main cancelled directory/install/uninstall actions preserve disk and report cancellation',async t=>{
  const h=await boot(t);const file=path.join(h.dir,'settings.json');const before=fs.readFileSync(file,'utf8');
  for(const action of ['chooseDir','install','uninstall']){
    await h.action(action);assert.match(h.latest().text,/取消/);assert.equal(fs.readFileSync(file,'utf8'),before);
    assert.equal(fs.existsSync(path.join(h.dir,'corgi-install.json')),false);
  }
});

test('main drag changes actual window coordinates, clamps them and stops after release',async t=>{
  const h=await boot(t);const before=h.win.getBounds();h.moveCursor(100,100);await h.action('dragStart');
  h.moveCursor(80,70);await h.action('dragMove');assert.equal(h.win.bounds.x,before.x-20);assert.equal(h.win.bounds.y,before.y-30);
  h.moveCursor(-10000,-10000);await h.action('dragMove');assert.equal(h.win.bounds.x,0);assert.equal(h.win.bounds.y,0);
  await h.action('dragEnd');assert.match(h.latest().text,/位置/);
  h.moveCursor(500,500);await h.action('dragMove');assert.equal(h.win.bounds.x,0);assert.equal(h.win.bounds.y,0);
});

test('Linux fallback retains mouse input rather than enabling unreliable forward click-through',async t=>{
  const h=await boot(t,undefined,'linux');assert.equal(h.win.ignoreMouse,undefined);
  await h.action('hover',true);assert.equal(h.win.ignoreMouse,undefined);
});

test('main configures nonfocusable shell, settings focus lifecycle and hover routing', async t => {
  const h = await boot(t);
  assert.equal(h.win.options.focusable, false);
  assert.equal(h.win.options.webPreferences.contextIsolation, true);
  assert.equal(h.win.options.webPreferences.nodeIntegration, false);
  assert.equal(h.win.ignoreMouse, true);
  await h.action('hover', true); assert.equal(h.win.ignoreMouse, false);
  await h.action('hover', false); assert.equal(h.win.ignoreMouse, true);
  await h.action('menu');
  h.getMenu().find(item=>item.label==='设置与输入法安装').click();
  assert.equal(h.win.focusable, true);
  assert.equal(h.latest().openSettings, true);
  await h.action('closeSettings');
  assert.equal(h.win.focusable, false);
  assert.equal(h.latest().openSettings, false);
  const before = h.states.length;
  await h.action('snack', undefined, {});
  assert.equal(h.states.length, before, 'reject foreign renderer sender');
});

for (const raw of ['null', '[]', '42', '"oops"', '{broken']) {
  test(`main safely recovers malformed settings shape: ${raw}`, async t => {
    const h = await boot(t, raw);
    assert.equal(h.latest().threshold, 120);
    assert.equal(h.latest().paused, false);
    assert.equal(typeof h.latest().rimeDir, 'string');
    assert.ok(h.latest().rimeDir.startsWith(h.dir));
  });
}

 test('roaming is work-gated, nonfocusable and can be stopped persistently',async t=>{
 const h=await boot(t);const x=h.win.bounds.x;h.advance(60000);h.walk();assert.equal(h.win.bounds.x,x);
 await h.action('focus');h.walk();assert.equal(h.latest().walking,true);h.advance(100);h.walk();assert.notEqual(h.win.bounds.x,x);assert.equal(h.win.focused,false);
 await h.action('roaming',false);const stopped=h.win.bounds.x;h.advance(60000);h.walk();assert.equal(h.win.bounds.x,stopped);assert.equal(h.latest().walking,false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'settings.json'),'utf8')).roamingEnabled,false);
 await assert.rejects(h.action('walkNow'),/开启/);
 });
 test('manual walk survives settings close but stops for hover, drag, pause and reminder',async t=>{
 const h=await boot(t);await h.action('openSettings');await h.action('walkNow');h.walk();assert.equal(h.latest().walking,false);
 await h.action('closeSettings');h.walk();assert.equal(h.latest().walking,true);
 for(const [start,end] of [['hover','hover'],['dragStart','dragEnd'],['pause','pause'],['reminderNow','reminderAction']]){
 if(start==='hover')h.moveCursor(h.win.bounds.x+20,h.win.bounds.y+20);await h.action(start,start==='hover'?true:start==='reminderNow'?'water':undefined);const x=h.win.bounds.x;h.advance(100);h.walk();assert.equal(h.win.bounds.x,x,start);
 await h.action(end,end==='hover'?false:end==='reminderAction'?'done':undefined);
 await h.action('walkNow');h.walk();assert.equal(h.latest().walking,true,start);
 }
 });

test('open native menu blocks long-running focus walks and explicit menu request survives close',async t=>{
 const h=await boot(t);await h.action('focus');await h.action('menu');const x=h.win.bounds.x;
 h.advance(60000);h.walk();assert.equal(h.win.bounds.x,x);assert.equal(h.latest().walking,false);
 h.getMenu().find(x=>x.label==='散步一小圈').click();h.walk();assert.equal(h.latest().walking,false);
 h.closeMenu();h.walk();assert.equal(h.latest().walking,true);h.advance(100);h.walk();assert.notEqual(h.win.bounds.x,x);
});
test('stale hover after native menu no longer prevents manual roaming outside window',async t=>{
 const h=await boot(t);await h.action('hover',true);h.moveCursor(-9999,-9999);await h.action('walkNow');h.walk();assert.equal(h.latest().walking,true);
});
