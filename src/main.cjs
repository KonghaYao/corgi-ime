'use strict';
const {app,BrowserWindow,ipcMain,Menu,dialog,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {RoamingController,clampPosition}=require('./roaming.cjs');
const {PetEngine}=require('./engine.cjs'),{install,uninstall}=require('./install.cjs');
let win,engine,roamer,settings={},timer,roamTimer,restoreTimer,lastDate,dragAnchor,hovered=false,settingsOpen=false,menuOpen=false,lastInputAt=0,uiScale=0.5;
let track=require('./counters.cjs').createCounterTracker();
const defaultRime=()=>process.platform==='darwin'?path.join(os.homedir(),'Library/Rime'):path.join(process.env.APPDATA||os.homedir(),'Rime');
const BASE_WIDTH=360,BASE_HEIGHT=420,DEFAULT_SCALE=0.5,MIN_SCALE=0.5,MAX_SCALE=1.5;
function normalizeScale(value){const n=Number(value);return Number.isFinite(n)&&n>=MIN_SCALE&&n<=MAX_SCALE?Math.round(n*100)/100:DEFAULT_SCALE;}
function requestedScale(value){const n=Number(value);if(!Number.isFinite(n)||n<MIN_SCALE||n>MAX_SCALE)throw Error('大小须在 50%–150% 之间');return Math.round(n*100)/100;}
function scaledSize(scale){return{width:Math.round(BASE_WIDTH*scale),height:Math.round(BASE_HEIGHT*scale)};}
function save(){fs.writeFileSync(path.join(app.getPath('userData'),'settings.json'),JSON.stringify(settings));}
function date(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function send(extra={}){if(win&&!win.isDestroyed())win.webContents.send('state',{...engine.snapshot(),roamingEnabled:roamer?.enabled!==false,walking:!!roamer?.moving,petScale:uiScale,rimeDir:settings.rimeDir,...extra});}
function act(event){if(!event)return;if((engine.pendingReminder||roamer?.moving)&&event.state==='typing')return;if(event.state!=='typing')roamer?.hold(Date.now(),15000);send(event);clearTimeout(restoreTimer);restoreTimer=setTimeout(()=>send({state:engine.paused?'sleep':engine.pendingReminder?.kind==='water'?'water':engine.pendingReminder?'stretch':roamer?.moving?'walk':'idle'}),event.state==='typing'?1500:7000);}
function poll(){let connected=false;try{const {readCounters}=require('./counters.cjs');const current=date();if(current!==lastDate){engine.baseline=null;engine.progress=0;lastDate=current;require('./counters.cjs').cleanupOlderCounters(path.join(settings.rimeDir,'corgi-stats'),current);}const r=readCounters(path.join(settings.rimeDir,'corgi-stats'),current);connected=Object.keys(r.sessions).length>0;const observed=track(r,current).total;if(engine.baseline!==null&&observed>engine.baseline)lastInputAt=Date.now();act(engine.observe(observed));send({connected,bridgeErrors:r.errors?.length||0});}catch{send({connected:false});}act(engine.tick());}
function openSettings(){settingsOpen=true;roamer.hold(Date.now());applyWindowScale(1);send({openSettings:true,state:'idle'});win.setFocusable(true);win.focus();}
function setRoaming(value){roamer.setEnabled(value,Date.now());settings.roamingEnabled=value;save();send({state:'idle',text:value?'散步已开启。工作或专注时，我会偶尔轻轻走一圈。':'散步已关闭，我会乖乖待在这里。'});}
function manualWalk(){roamer.requestWalk(Date.now());send({text:'把鼠标移开，关上设置，麦麦就出发散步。'});}
function menu(){menuOpen=true;roamer.hold(Date.now());send({state:engine.paused?'sleep':'idle'});Menu.buildFromTemplate([
 {label:'摸摸麦麦',click(){engine.pats++;act({state:'pet',text:'摸摸收到，给你一颗爱心！'});}},
 {label:'喂块饼干（双击我）',click(){engine.treats++;act({state:'snack',text:'咔嚓！谢谢你的饼干。'});}},
 {label:'现在喝水',click(){act(engine.showReminder('water'));}},
 {label:'现在休息',click(){act(engine.showReminder('break'));}},
 {label:'25 分钟专注 / 取消',click(){engine.focus();send({text:engine.focusEnd?(engine.paused?'专注已设定，恢复陪伴后开始。':'专注开始，我会轻轻陪着你。'):'专注计时已取消。'});}},
 {label:engine.paused?'继续陪伴':'暂停鼓励与提醒',click(){poll();engine.togglePause();roamer.hold(Date.now());settings.paused=engine.paused;save();send({state:engine.paused?'sleep':'idle',text:engine.paused?'我先打个盹，散步和提醒也暂停了。':'醒啦！继续慢慢来。'});}},
 {type:'separator'},
 {label:'工作时自动散步',type:'checkbox',checked:roamer.enabled,click:item=>setRoaming(item.checked)},
 {label:'散步一小圈',enabled:roamer.enabled,click:manualWalk},
 {label:'设置与输入法安装',click:openSettings},
 {type:'separator'},{label:'退出柯基',click(){app.quit();}}
]).popup({window:win,callback(){menuOpen=false;if(!roamer.manual)roamer.hold(Date.now());}});}
function walkTick(){if(!win||win.isDestroyed()||!roamer)return;const now=Date.now(),bounds=win.getBounds(),area=screen.getDisplayNearestPoint({x:bounds.x,y:bounds.y}).workArea;const cursor=screen.getCursorScreenPoint();if(cursor.x<bounds.x||cursor.x>=bounds.x+bounds.width||cursor.y<bounds.y||cursor.y>=bounds.y+bounds.height)hovered=false;const result=roamer.step({now,bounds,area,working:!!engine.focusEnd||now-lastInputAt<120000,blocked:engine.paused||hovered||settingsOpen||menuOpen||!!dragAnchor||!!engine.pendingReminder});if(result.x!==undefined)win.setPosition(result.x,result.y);if(result.changed)send({state:result.moving?'walk':engine.paused?'sleep':engine.pendingReminder?.kind==='water'?'water':engine.pendingReminder?'stretch':'idle',direction:result.direction||'right'});}

function clamp(bounds){return clampPosition(bounds,screen.getDisplayNearestPoint({x:bounds.x,y:bounds.y}).workArea);}
function applyWindowScale(scale){if(!win||win.isDestroyed())return;const bounds=win.getBounds(),area=screen.getDisplayNearestPoint({x:bounds.x,y:bounds.y}).workArea,size=scaledSize(scale);const next=clampPosition({x:bounds.x+bounds.width-size.width,y:bounds.y+bounds.height-size.height,...size},area);win.webContents.setZoomFactor(scale);win.setBounds({...next,...size});}
if(!app.requestSingleInstanceLock())app.quit();else{
app.on('second-instance',()=>{if(win){win.showInactive();act({state:'happy',text:'我已经在这里啦！右键可以打开设置。'});}});
app.whenReady().then(()=>{try{settings=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'settings.json'),'utf8'));}catch{}if(!settings||typeof settings!=='object'||Array.isArray(settings))settings={};settings.rimeDir=typeof settings.rimeDir==='string'?settings.rimeDir:defaultRime();uiScale=normalizeScale(settings.petScale);engine=new PetEngine(settings);roamer=new RoamingController({enabled:settings.roamingEnabled!==false,now:Date.now()});
 const area=screen.getPrimaryDisplay().workArea,size=scaledSize(uiScale);win=new BrowserWindow({width:size.width,height:size.height,x:area.x+area.width-size.width-20,y:area.y+area.height-size.height-20,transparent:true,frame:false,resizable:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setZoomFactor(uiScale);win.webContents.on('did-finish-load',()=>win.webContents.setZoomFactor(uiScale));
 win.setPosition(...Object.values(clamp(win.getBounds())));win.setMenu(null);if(process.platform!=='linux')win.setIgnoreMouseEvents(true,{forward:true});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile(path.join(__dirname,'../renderer/index.html'));win.once('ready-to-show',()=>{win.showInactive();send({state:engine.paused?'sleep':'idle',text:'鼠标靠近我，周围会浮现互动图标。也可单击、双击或右键。'});poll();});
 const reclamp=()=>{if(win){roamer.hold(Date.now());win.setPosition(...Object.values(clamp(win.getBounds())));send({state:'idle'});}};screen.on('display-removed',reclamp);screen.on('display-metrics-changed',reclamp);timer=setInterval(poll,1500);roamTimer=setInterval(walkTick,100);
});
ipcMain.handle('action',async(event,name,value)=>{if(event.sender!==win.webContents)return;
 if(name==='menu')menu();
 else if(name==='pet'){engine.pats++;act({state:'pet',text:['摸摸收到！尾巴已进入超频模式。','你照顾我，我陪着你。','今天也辛苦啦，给你一个毛茸茸的拥抱。'][Math.floor(Math.random()*3)]});}
 else if(name==='snack'){engine.treats++;act({state:'snack',text:'咔嚓！你的饼干让我又充满电啦。'});}
 else if(name==='focus'){engine.focus();send({text:engine.focusEnd?(engine.paused?'专注已设定，恢复陪伴后开始。':'25 分钟专注开始。'):'专注计时已取消。'});}
 else if(name==='pause'){poll();engine.togglePause();roamer.hold(Date.now());settings.paused=engine.paused;save();send({state:engine.paused?'sleep':'idle',text:engine.paused?'鼓励和定时提醒已暂停。Rime 数字计数仍继续。':'陪伴已恢复，提醒从现在重新计时。'});}
 else if(name==='threshold'){engine.setThreshold(value);settings.threshold=value;save();send({text:`已保存，每 ${value} 字鼓励一次。`});}
 else if(name==='petScale'){const next=requestedScale(value);uiScale=next;settings.petScale=next;save();roamer.hold(Date.now());if(!settingsOpen)applyWindowScale(next);send({text:settingsOpen?`大小已保存为 ${Math.round(next*100)}%，关闭设置后生效。`:`柯基大小已调整为 ${Math.round(next*100)}%。`});}
 else if(name==='reminderSettings'){engine.configureReminders(value);Object.assign(settings,engine.reminderSettings());save();send({text:'喝水与休息提醒设置已保存，从现在重新计时。'});}
 else if(name==='reminderNow'){act(engine.showReminder(value));}
 else if(name==='reminderAction'){act(engine.resolveReminder(value));Object.assign(settings,engine.reminderSettings());save();send();}
 else if(name==='openSettings')openSettings();
 else if(name==='roaming'){setRoaming(value);}
 else if(name==='walkNow'){manualWalk();}
 else if(name==='closeSettings'){settingsOpen=false;if(!roamer.manual)roamer.hold(Date.now());win.setFocusable(false);send({openSettings:false});applyWindowScale(uiScale);}
 else if(name==='dragStart'){roamer.hold(Date.now());dragAnchor={mouse:screen.getCursorScreenPoint(),bounds:win.getBounds()};}
 else if(name==='dragMove'&&dragAnchor){const cursor=screen.getCursorScreenPoint();const p=clamp({...dragAnchor.bounds,x:dragAnchor.bounds.x+cursor.x-dragAnchor.mouse.x,y:dragAnchor.bounds.y+cursor.y-dragAnchor.mouse.y});win.setPosition(p.x,p.y);}
 else if(name==='dragEnd'){dragAnchor=null;roamer.hold(Date.now(),30000);send({state:'idle',text:'新位置安顿好了，我继续陪着你。'});}
 else if(name==='chooseDir'){const result=await dialog.showOpenDialog(win,{title:'选择 Rime 用户配置目录',properties:['openDirectory'],defaultPath:settings.rimeDir});if(!result.canceled){settings.rimeDir=result.filePaths[0];engine.baseline=null;lastDate=null;track=require('./counters.cjs').createCounterTracker();save();send({text:'Rime 目录已更新，等待新计数。'});}else send({text:'目录选择已取消，原设置未改变。'});}
 else if(name==='install'){const answer=await dialog.showMessageBox(win,{type:'question',buttons:['取消','安装扩展'],defaultId:0,cancelId:0,title:'安装柯基拼音',message:'将添加独立拼音方案、Lua 计数模块，并备份后修改 default.custom.yaml。不会替换现有输入法。',detail:'需要已安装带 librime-lua 的官方 Squirrel 或 Weasel，以及 luna_pinyin 词典。安装后请手动重新部署并选择“柯基拼音”。'});if(answer.response===1){install(settings.rimeDir,path.join(__dirname,'../rime'));send({text:'扩展已写入。请重新部署 Rime，再选择“柯基拼音”。'});}else send({text:'安装已取消，未修改 Rime 配置。'});}
 else if(name==='uninstall'){const answer=await dialog.showMessageBox(win,{type:'question',buttons:['取消','卸载扩展'],defaultId:0,cancelId:0,message:'恢复安装前配置并删除未被修改的扩展文件；计数记录和备份保留。'});if(answer.response===1){uninstall(settings.rimeDir);send({text:'扩展已卸载，请重新部署 Rime。'});}else send({text:'卸载已取消，扩展保持不变。'});}
 else if(name==='hover'&&typeof value==='boolean'){hovered=value;if(process.platform!=='linux')win.setIgnoreMouseEvents(!value,{forward:true});}

 return {...engine.snapshot(),roamingEnabled:roamer.enabled,walking:roamer.moving,petScale:uiScale};
});
app.on('before-quit',()=>{clearInterval(timer);clearInterval(roamTimer);clearTimeout(restoreTimer);});app.on('window-all-closed',()=>app.quit());}
