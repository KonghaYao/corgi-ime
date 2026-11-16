const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {parseCounter, readCounters, createCounterTracker} = require('../src/counters.cjs');
const day = '2026-11-13';
const data = (id, seq, total) => `CORGI1\t${day}\t${id}\t${seq}\t${total}\n`;
test('strict counters reject partial, mismatched and text-bearing records', () => {
 const name = `${day}-s1-a.stats`;
 assert.equal(parseCounter(data('s1',1,2),name,day).total,2);
 for (const s of [data('s1',1,2).trim(), data('s1',1,2)+'private text', data('s2',1,2), data('s1',3,2), data('s1',1,2).replace('2\n','Infinity\n'), 'x'.repeat(513)]) assert.equal(parseCounter(s,name,day),null);
});
test('double slots deduplicate, partial writer preserves previous valid snapshot', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'corgi-test-'));
 try {
  fs.writeFileSync(path.join(dir,`${day}-s1-a.stats`),data('s1',2,9));
  fs.writeFileSync(path.join(dir,`${day}-s1-b.stats`),data('s1',3,12));
  fs.writeFileSync(path.join(dir,`${day}-s2-a.stats`),data('s2',1,2));
  assert.equal(readCounters(dir,day).total,14);
  fs.writeFileSync(path.join(dir,`${day}-s1-b.stats`),'CORGI1\t');
  assert.equal(readCounters(dir,day).total,11);
  fs.symlinkSync(path.join(dir,`${day}-s2-a.stats`),path.join(dir,`${day}-s3-a.stats`));
  assert.equal(readCounters(dir,day).total,11);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('tracker never regresses or repeats reward when a slot is incomplete',()=>{
 const update=createCounterTracker();
 const snap=total=>({sessions:{s:{total}}});
 assert.deepEqual(update(snap(12),day),{total:12,delta:12});
 assert.deepEqual(update(snap(9),day),{total:12,delta:0});
 assert.deepEqual(update(snap(12),day),{total:12,delta:0});
 assert.deepEqual(update(snap(15),day),{total:15,delta:3});
 assert.deepEqual(update(snap(2),'2026-11-14'),{total:2,delta:2});
});
test('missing folder is nonfatal',()=>assert.equal(readCounters('/not-a-folder-corgi',day).total,0));
test('tracker clamps aggregate overflow before arithmetic becomes unsafe',()=>{
 const update=createCounterTracker();
 const max=Number.MAX_SAFE_INTEGER;
 assert.deepEqual(update({sessions:{a:{total:max-2},b:{total:10}}},day),{total:max,delta:max});
 assert.deepEqual(update({sessions:{a:{total:max-2},b:{total:20}}},day),{total:max,delta:0});
 assert.deepEqual(update({sessions:{bad:{total:Infinity},neg:{total:-1},unsafe:{total:max+1}}},day),{total:max,delta:0});
 assert.deepEqual(update({sessions:{a:{total:3}}},'2026-11-14'),{total:3,delta:3});
});
test('retention only removes strict old protocol regular files',()=>{
 const {cleanupOlderCounters}=require('../src/counters.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'corgi-clean-test-'));
 const put=(date,id,content)=>fs.writeFileSync(path.join(dir,`${date}-${id}-a.stats`),content || `CORGI1\t${date}\t${id}\t1\t2\n`);
 try {
  put('2026-11-06','old'); put('2026-11-07','keep'); put('2026-11-14','future');
  put('2026-11-01','bad','user data');
  fs.symlinkSync(path.join(dir,'2026-11-07-keep-a.stats'),path.join(dir,'2026-11-01-link-a.stats'));
  assert.deepEqual(cleanupOlderCounters(dir,day),{removed:1,errors:[]});
  assert.equal(fs.readdirSync(dir).length,4);
  assert.deepEqual(cleanupOlderCounters(dir,day),{removed:0,errors:[]});
  assert.throws(()=>cleanupOlderCounters(dir,'2026-02-30'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('reader bounds matching files at 4096 and reports scan limit',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'corgi-cap-test-'));
 try {
  for(let i=0;i<4097;i++) fs.writeFileSync(path.join(dir,`${day}-s${i}-a.stats`),data(`s${i}`,1,1));
  const result=readCounters(dir,day);
  assert.equal(result.total,4096);
  assert.ok(result.errors.includes('SCAN_LIMIT'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
