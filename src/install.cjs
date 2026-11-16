'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),YAML=require('yaml');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function installUnlocked(dir,resources){
 if(!fs.statSync(dir).isDirectory())throw Error('请选择已安装 Rime 的用户配置目录');
 if(!['luna_pinyin.dict.yaml','build/luna_pinyin.table.bin'].some(f=>fs.existsSync(path.join(dir,f))))throw Error('未检测到 luna_pinyin 词典。请先安装官方朙月拼音方案并重新部署，再安装扩展。');
 const marker=path.join(dir,'corgi-install.json'); if(fs.existsSync(marker))throw Error('该目录已安装柯基扩展，请先卸载再重新安装。');
 const config=path.join(dir,'default.custom.yaml');if(fs.existsSync(config)&&fs.lstatSync(config).isSymbolicLink())throw Error('配置为符号链接，请手工安装以保留链接语义。');const original=fs.existsSync(config)?fs.readFileSync(config):null;
 const doc=original?YAML.parseDocument(original.toString()):new YAML.Document({patch:{}});
 if(doc.errors.length)throw Error('现有 default.custom.yaml 无法解析，未修改任何内容。');
 const list=doc.getIn(['patch','schema_list']);
 if(list&&!YAML.isSeq(list))throw Error('现有 schema_list 使用特殊格式，请手工安装以免破坏配置。');
 // Preserve an explicit existing list; otherwise append through Rime patch syntax without replacing defaults.
 const appendKey=['patch','schema_list/+'];
 if(list){const values=list.toJSON(); if(!values.some(v=>v.schema==='corgi_pinyin'))list.add({schema:'corgi_pinyin'});}
 else{const append=doc.getIn(appendKey);if(append&&!YAML.isSeq(append))throw Error('已有 schema_list/+ 格式不兼容，未修改。');if(append){if(!append.toJSON().some(v=>v.schema==='corgi_pinyin'))append.add({schema:'corgi_pinyin'});}else doc.setIn(appendKey,[{schema:'corgi_pinyin'}]);}
 const destinations=[['corgi_pinyin.schema.yaml','corgi_pinyin.schema.yaml'],['lua/corgi_counter.lua','lua/corgi_counter.lua']];
 for(const [,relative]of destinations)if(fs.existsSync(path.join(dir,relative)))throw Error('目标文件已存在，未覆盖：'+relative);
 const backup=original?'default.custom.yaml.corgi-backup-'+Date.now():null;const created=[];let configWritten=false;const nextConfig=doc.toString(),nextHash=hash(nextConfig);
 try{fs.mkdirSync(path.join(dir,'lua'),{recursive:true});fs.mkdirSync(path.join(dir,'corgi-stats'),{recursive:true});if(backup)fs.writeFileSync(path.join(dir,backup),original,{flag:'wx'});
 for(const [source,relative]of destinations){const dest=path.join(dir,relative);fs.copyFileSync(path.join(resources,source),dest,fs.constants.COPYFILE_EXCL);created.push(relative);}
 const current=fs.existsSync(config)?fs.readFileSync(config):null;if((original===null)!==(current===null)||(original&&hash(original)!==hash(current)))throw Error('安装期间配置被其他程序修改，已停止。');
 atomicWrite(config,nextConfig);configWritten=true;
 const manifest={version:1,backup,configHash:hash(fs.readFileSync(config)),files:created.map(relative=>({relative,sha256:hash(fs.readFileSync(path.join(dir,relative)))}))};
 fs.writeFileSync(marker,JSON.stringify(manifest,null,2),{flag:'wx'});return manifest;
 }catch(e){for(const relative of created)try{fs.unlinkSync(path.join(dir,relative));}catch{}if(configWritten&&fs.existsSync(config)&&hash(fs.readFileSync(config))===nextHash){if(original)atomicWrite(config,original);else fs.unlinkSync(config);}throw e;}
}
function uninstallUnlocked(dir){const marker=path.join(dir,'corgi-install.json');const m=JSON.parse(fs.readFileSync(marker,'utf8'));const config=path.join(dir,'default.custom.yaml');
 if(m.version!==1||!Array.isArray(m.files)||m.files.some(f=>!['corgi_pinyin.schema.yaml','lua/corgi_counter.lua'].includes(f.relative))||m.backup&&!/^default\.custom\.yaml\.corgi-backup-\d+$/.test(m.backup))throw Error('安装记录无效');
 if(hash(fs.readFileSync(config))!==m.configHash)throw Error('安装后配置发生变化，为保护你的设置未自动卸载。请按手工卸载说明操作。');
 for(const f of m.files)if(fs.existsSync(path.join(dir,f.relative))&&hash(fs.readFileSync(path.join(dir,f.relative)))!==f.sha256)throw Error('扩展文件被修改，未自动卸载。');
 const original=m.backup?fs.readFileSync(path.join(dir,m.backup)):null;
 if(original)atomicWrite(config,original);else fs.unlinkSync(config);
 for(const f of m.files)if(fs.existsSync(path.join(dir,f.relative)))fs.unlinkSync(path.join(dir,f.relative));fs.unlinkSync(marker);
 return {preservedStats:true};
}
function atomicWrite(file,data){const temp=file+'.corgi-'+crypto.randomUUID()+'.tmp';let fd;try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,file);}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function locked(dir,fn){const lock=path.join(dir,'.corgi-install.lock');let fd;try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('已有安装或卸载事务。若上次异常退出，请先检查备份与配置后手工移除 .corgi-install.lock。');throw e;}try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,time:Date.now()}));return fn();}finally{fs.closeSync(fd);fs.unlinkSync(lock);}}
const install=(dir,resources)=>locked(dir,()=>installUnlocked(dir,resources));
const uninstall=dir=>locked(dir,()=>uninstallUnlocked(dir));
module.exports={install,uninstall};
