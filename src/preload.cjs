const {contextBridge,ipcRenderer}=require('electron');
const allowed=new Set(['menu','pet','snack','focus','pause','threshold','petScale','closeSettings','dragStart','dragMove','dragEnd','chooseDir','install','uninstall','hover','reminderSettings','reminderNow','reminderAction','openSettings','roaming','walkNow','checkUpdates']);
contextBridge.exposeInMainWorld('corgi',{action:(name,value)=>allowed.has(name)?ipcRenderer.invoke('action',name,value):Promise.reject(Error('Invalid action')),subscribe:fn=>{ipcRenderer.on('state',(_,state)=>fn(state));}});
