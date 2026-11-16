'use strict';
const phrases=['又敲下了一小段，已经很棒啦！','认真工作的你，值得一颗小饼干。','不是每一分钟都要高效，我陪着你。','慢慢来，我们已经走了这么远。','今天的进度 +1，尾巴快乐 +100！','你写下的每一小步，都算数。'];
const MINUTE=60000;
const validMinutes=n=>Number.isInteger(n)&&n>=1&&n<=240;
class PetEngine{
 constructor(settings={},now=Date.now()){
  this.threshold=Number.isInteger(settings.threshold)&&settings.threshold>=20&&settings.threshold<=10000?settings.threshold:120;
  this.paused=!!settings.paused;this.pauseStarted=this.paused?now:null;this.total=0;this.baseline=null;this.progress=0;this.lastPraise=0;this.started=now;this.focusEnd=null;this.praises=0;this.treats=0;this.pats=0;
  this.reminders={water:{enabled:settings.waterEnabled!==false,minutes:validMinutes(settings.waterMinutes)?settings.waterMinutes:30},break:{enabled:settings.breakEnabled!==false,minutes:validMinutes(settings.breakMinutes)?settings.breakMinutes:45}};
  this.next={water:now+this.reminders.water.minutes*MINUTE,break:now+this.reminders.break.minutes*MINUTE};this.pendingReminder=null;this.waterDone=0;this.breakDone=0;
 }
 observe(total,now=Date.now()){if(!Number.isSafeInteger(total)||total<0)return null;const previous=this.baseline;this.baseline=total;this.total=total;if(previous===null||total<previous||this.paused)return null;const delta=total-previous;if(!delta)return null;this.progress+=delta;if(this.progress>=this.threshold&&now-this.lastPraise>=30000){this.progress%=this.threshold;this.lastPraise=now;this.praises++;return{state:'happy',text:phrases[(this.praises-1)%phrases.length]};}return{state:'typing',text:''};}
 togglePause(now=Date.now()){this.paused=!this.paused;this.progress=0;if(this.paused)this.pauseStarted=now;if(!this.paused){if(this.focusEnd&&this.pauseStarted!==null)this.focusEnd+=Math.max(0,now-this.pauseStarted);this.pauseStarted=null;for(const kind of ['water','break'])this.next[kind]=now+this.reminders[kind].minutes*MINUTE;}this.pendingReminder=null;return this.paused;}
 setThreshold(n){if(!Number.isInteger(n)||n<20||n>10000)throw Error('阈值须为 20–10000 的整数');this.threshold=n;this.progress=0;}
 configureReminders(config,now=Date.now()){
  if(!config||typeof config!=='object'||typeof config.waterEnabled!=='boolean'||typeof config.breakEnabled!=='boolean'||!validMinutes(config.waterMinutes)||!validMinutes(config.breakMinutes))throw Error('喝水、休息间隔须为 1–240 的整数分钟，开关须明确。');
  for(const kind of ['water','break']){this.reminders[kind]={enabled:config[kind+'Enabled'],minutes:config[kind+'Minutes']};this.next[kind]=now+this.reminders[kind].minutes*MINUTE;}this.pendingReminder=null;
 }
 reminderSettings(){return{waterEnabled:this.reminders.water.enabled,waterMinutes:this.reminders.water.minutes,breakEnabled:this.reminders.break.enabled,breakMinutes:this.reminders.break.minutes};}
 focus(now=Date.now()){this.focusEnd=this.focusEnd?null:now+25*MINUTE;if(this.paused&&this.focusEnd)this.pauseStarted=now;return this.focusEnd;}
 showReminder(kind,now=Date.now()){
  if(!['water','break'].includes(kind))throw Error('未知提醒类型');
  this.pendingReminder={kind,since:now};return{state:kind==='water'?'water':'stretch',text:kind==='water'?'喝口水吧！照顾自己，也是今天的重要进度。':'离开屏幕休息一下吧，伸伸肩膀，我在这里等你。'};
 }
 resolveReminder(action,now=Date.now()){
  if(!['done','snooze','disable'].includes(action))throw Error('未知提醒操作');
  if(!this.pendingReminder)return null;
  const kind=this.pendingReminder.kind;this.pendingReminder=null;
  if(action==='disable'){this.reminders[kind].enabled=false;return{state:'idle',text:kind==='water'?'喝水提醒已关闭，可在设置重新开启。':'休息提醒已关闭，可在设置重新开启。'};}
  this.next[kind]=now+(action==='snooze'?10:this.reminders[kind].minutes)*MINUTE;
  if(action==='snooze'){const wasDisabled=!this.reminders[kind].enabled;this.reminders[kind].enabled=true;return{state:'idle',text:wasDisabled?'已重新开启这类提醒，10 分钟后再提醒你。':'好，10 分钟后再提醒你。'};}
  if(kind==='water')this.waterDone++;else this.breakDone++;
  return{state:kind==='water'?'water':'happy',text:kind==='water'?'已记录一次喝水！麦麦也咕嘟咕嘟补充能量。':'已记录一次休息！欢迎回来，我们慢慢继续。'};
 }
 tick(now=Date.now()){
  if(this.paused||this.pendingReminder)return null;
  if(this.focusEnd&&now>=this.focusEnd){this.focusEnd=null;return this.showReminder('break',now);}
  const due=['water','break'].filter(k=>this.reminders[k].enabled&&now>=this.next[k]).sort((a,b)=>this.next[a]-this.next[b]);
  return due.length?this.showReminder(due[0],now):null;
 }
 snapshot(){return{total:this.total,threshold:this.threshold,progress:this.progress,paused:this.paused,praises:this.praises,focusEnd:this.focusEnd,treats:this.treats,pats:this.pats,waterDone:this.waterDone,breakDone:this.breakDone,pendingReminder:this.pendingReminder,...this.reminderSettings(),nextWater:this.next.water,nextBreak:this.next.break};}
}
module.exports={PetEngine};
