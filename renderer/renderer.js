'use strict';
const $=id=>document.getElementById(id);$('mascot').innerHTML=window.CORGI_SVG||'';
let state={},dragging=false,start,moved=false,thresholdDirty=false,reminderDirty=false,clickTimer,bubbleTimer,haloTimer;
const api=window.corgi;
function hideHalo(){clearTimeout(haloTimer);$('hoverActions').hidden=true;}
function showHalo(){clearTimeout(haloTimer);if(!dragging&&$('settings').hidden&&!state.pendingReminder)$('hoverActions').hidden=false;}
$('petHalo').onpointerenter=()=>{if(!$('hoverActions').hidden){clearTimeout(haloTimer);action('hover',true);}};
$('petArea').onpointerover=e=>{if(e.target.closest('.corgi-body')){showHalo();action('hover',true);}};
$('petHalo').onpointerleave=()=>{clearTimeout(haloTimer);haloTimer=setTimeout(()=>{hideHalo();action('hover',false);},180);};
const haloActions={haloPet:['pet'],haloSnack:['snack'],haloWater:['reminderNow','water'],haloBreak:['reminderNow','break'],haloFocus:['focus'],haloSettings:['openSettings']};
for(const [id,args] of Object.entries(haloActions)){
 $(id).onpointerdown=e=>e.stopPropagation();
 $(id).onclick=e=>{e.stopPropagation();clearTimeout(clickTimer);clickTimer=null;action(...args);};
}

async function action(name,value){try{if(!api)throw Error('这是浏览器视觉预览，不是系统输入法或桌面程序。');const result=await api.action(name,value);if(name==='threshold')thresholdDirty=false;if(name==='reminderSettings')reminderDirty=false;if(result)update(result);$('error').textContent='';}catch(e){$('error').textContent=e.message;$('bubble').textContent=e.message;}}
function update(s){state={...state,...s};if(s.state){$('mascot').dataset.state=s.state;$('mascot').setAttribute('data-corgi-state',s.state);$('petArea').classList.toggle('watering',s.state==='water');}if(s.direction)$('mascot').dataset.direction=s.direction;if(typeof s.roamingEnabled==='boolean')$('roamingEnabled').checked=s.roamingEnabled;if(s.text){$('bubble').classList.toggle('quiet',false);clearTimeout(bubbleTimer);bubbleTimer=setTimeout(()=>$('bubble').classList.toggle('quiet',true),7000);$('bubble').textContent=s.text;$('feedback').textContent=s.text;}$('count').textContent=`今天 ${state.total||0} 字`;$('statusDot').classList.toggle('connected',!!state.connected);$('connection').textContent=state.bridgeErrors?'计数读取受限或有异常，请查看记录目录。':state.connected?'已读取今日 Rime 计数':'尚未读取今日计数。请先上屏一个词。';$('rimeDir').textContent=state.rimeDir||'';$('pause').textContent=state.paused?'继续陪伴':'暂停鼓励与提醒';
 if(!thresholdDirty&&s.threshold)$('threshold').value=s.threshold;if(!reminderDirty){for(const kind of ['water','break']){if(typeof state[kind+'Enabled']==='boolean')$(kind+'Enabled').checked=state[kind+'Enabled'];if(state[kind+'Minutes'])$(kind+'Minutes').value=state[kind+'Minutes'];}}
 if(typeof s.petScale==='number')$('petScale').value=String(s.petScale);
 if(typeof s.openSettings==='boolean'){$('settings').hidden=!s.openSettings;if(s.openSettings)hideHalo();}
 $('reminderCard').hidden=!state.pendingReminder;if(state.pendingReminder)hideHalo();if(state.pendingReminder){const water=state.pendingReminder.kind==='water';$('reminderTitle').textContent=water?'💧 喝水时间':'🌿 休息时间';$('reminderDone').textContent=water?'喝好了':'休息好了';}
 $('interactionCounts').textContent=`本次陪伴：摸摸 ${state.pats||0} · 饼干 ${state.treats||0} · 喝水 ${state.waterDone||0} · 休息 ${state.breakDone||0}`;updateTimers();
}
function updateTimers(){const now=Date.now();$('timer').textContent=state.focusEnd?(state.paused?'专注已暂停':`${Math.max(0,Math.ceil((state.focusEnd-now)/60000))} 分钟专注`):'';const label=(kind,title)=>!state[kind+'Enabled']?`${title}已关闭`:state.paused?`${title}已暂停`:`${title}约 ${Math.max(0,Math.ceil((state[kind==='water'?'nextWater':'nextBreak']-now)/60000))||0} 分钟后`;$('nextReminders').textContent=label('water','喝水')+' · '+label('break','休息');}
if(api)api.subscribe(update);else $('bubble').textContent='视觉预览 · 原生输入统计需运行桌面程序';
for(const id of ['pause','chooseDir','install','uninstall'])$(id).onclick=()=>action(id);
$('waterNow').onclick=()=>action('reminderNow','water');$('breakNow').onclick=()=>action('reminderNow','break');
$('reminderDone').onclick=()=>action('reminderAction','done');$('reminderSnooze').onclick=()=>action('reminderAction','snooze');$('reminderDisable').onclick=()=>action('reminderAction','disable');
$('focus2').onclick=()=>action('focus');$('close').onclick=()=>{thresholdDirty=false;reminderDirty=false;update(state);$('settings').hidden=true;action('closeSettings');};$('save').onclick=()=>action('threshold',Number($('threshold').value));
$('saveReminders').onclick=()=>action('reminderSettings',{waterEnabled:$('waterEnabled').checked,waterMinutes:Number($('waterMinutes').value),breakEnabled:$('breakEnabled').checked,breakMinutes:Number($('breakMinutes').value)});
for(const el of document.querySelectorAll('#settings input'))el.addEventListener('input',()=>{if(el.id==='roamingEnabled')return;if(el.id==='threshold')thresholdDirty=true;else reminderDirty=true;$('feedback').textContent='尚未保存。点击对应保存按钮生效；关闭面板会放弃未保存修改。';});
$('roamingEnabled').onchange=()=>action('roaming',$('roamingEnabled').checked);$('walkNow').onclick=()=>action('walkNow');$('petScale').onchange=()=>action('petScale',Number($('petScale').value));
$('petArea').onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();action('menu');}};
$('petArea').oncontextmenu=e=>{e.preventDefault();action('menu');};
$('petArea').onpointerdown=e=>{if(e.button!==0)return;start={x:e.clientX,y:e.clientY};moved=false;dragging=true;e.currentTarget.setPointerCapture(e.pointerId);action('dragStart');};
$('petArea').onpointermove=e=>{if(dragging){if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)moved=true;if(moved){hideHalo();$('mascot').dataset.state='drag';action('dragMove');}}};
$('petArea').onpointerup=()=>{if(!dragging)return;dragging=false;action('dragEnd');if(!moved){if(clickTimer){clearTimeout(clickTimer);clickTimer=null;action('snack');}else clickTimer=setTimeout(()=>{clickTimer=null;action('pet');},300);}else $('mascot').dataset.state='idle';showHalo();};
$('petArea').onpointercancel=()=>{dragging=false;action('dragEnd');};
setInterval(updateTimers,1000);
let lastHit;document.addEventListener('mousemove',e=>{const hit=!!e.target.closest('#petArea,#settings,#reminderCard')||(!$('hoverActions').hidden&&!!e.target.closest('#petHalo'));if(hit!==lastHit){lastHit=hit;action('hover',hit);}});document.addEventListener('mouseleave',()=>{lastHit=false;hideHalo();action('hover',false);});
