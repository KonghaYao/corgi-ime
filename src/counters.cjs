'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function parseCounter(text, name, day) {
  if (typeof text !== 'string' || text.length > 512 || !DAY.test(day)) return null;
  const match = /^CORGI1\t(\d{4}-\d{2}-\d{2})\t([A-Za-z0-9_]{1,100})\t([1-9]\d{0,14})\t([1-9]\d{0,14})\n$/.exec(text);
  if (!match || match[1] !== day) return null;
  const [, date, session, seqText, totalText] = match;
  if (name !== `${date}-${session}-a.stats` && name !== `${date}-${session}-b.stats`) return null;
  const seq = Number(seqText), total = Number(totalText);
  if (!Number.isSafeInteger(seq) || !Number.isSafeInteger(total) || total < seq) return null;
  return { date, session, seq, total };
}
function readCounters(directory, day) {
  if (!DAY.test(day)) throw new TypeError('Invalid date');
  const sessions = Object.create(null), errors = [];
  let names;
  try { names = fs.readdirSync(directory); } catch (e) {
    return { total: 0, sessions, errors: e.code === 'ENOENT' ? [] : [e.code || 'READ_ERROR'] };
  }
  let scanned = 0;
  for (const name of names) {
    if (!name.startsWith(`${day}-`) || !/^[A-Za-z0-9_-]+\.stats$/.test(name)) continue;
    if (++scanned > 4096) { errors.push('SCAN_LIMIT'); break; }
    let fd;
    try {
      const p = path.join(directory, name);
      const st = fs.lstatSync(p);
      if (!st.isFile() || st.isSymbolicLink() || st.size > 512) continue;
      fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      if (!fs.fstatSync(fd).isFile()) continue;
      const b = Buffer.alloc(513), size = fs.readSync(fd, b, 0, b.length, 0);
      const value = size <= 512 ? parseCounter(b.subarray(0, size).toString('utf8'), name, day) : null;
      if (value && (!sessions[value.session] || value.seq > sessions[value.session].seq)) sessions[value.session] = value;
    } catch (e) { if (e.code !== 'ENOENT') errors.push(e.code || 'READ_ERROR'); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  let total = 0;
  for (const entry of Object.values(sessions)) {
    if (Number.isSafeInteger(total + entry.total)) total += entry.total;
    else errors.push('COUNT_OVERFLOW');
  }
  return { total, sessions, errors };
}
// Pollers retain monotonic high-water values: a partially written newest slot must
// not regress visible progress, nor produce duplicate encouragement on next poll.
function createCounterTracker() {
  let activeDay, seen = Object.create(null), total = 0;
  return (snapshot, day) => {
    if (day !== activeDay) { activeDay = day; seen = Object.create(null); total = 0; }
    const previous = total;
    for (const [id, value] of Object.entries(snapshot.sessions)) {
      if (!value || !Number.isSafeInteger(value.total) || value.total < 0) continue;
      const old = seen[id] || 0;
      if (value.total > old) {
        // Saturate BEFORE adding: summing first can already round an unsafe integer.
        total += Math.min(value.total - old, Number.MAX_SAFE_INTEGER - total);
        seen[id] = value.total;
      }
    }
    return { total, delta: total - previous };
  };
}
// Called by the companion, never from the IME hot path. Only protocol-owned files.
function cleanupOlderCounters(directory, day, days = 7) {
  const stamp = Date.parse(day + 'T00:00:00Z');
  if (!DAY.test(day) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== day || !Number.isInteger(days) || days < 1) throw new TypeError('Invalid retention');
  const cutoff = stamp - (days - 1) * 86400000;
  const result = { removed: 0, errors: [] };
  let entries;
  try { entries = fs.readdirSync(directory); } catch (e) { if (e.code !== 'ENOENT') result.errors.push(e.code || 'READ_ERROR'); return result; }
  let scanned = 0;
  for (const name of entries) {
    if (++scanned > 4096) { result.errors.push('SCAN_LIMIT'); break; }
    const match = /^(\d{4}-\d{2}-\d{2})-[A-Za-z0-9_]{1,100}-[ab]\.stats$/.exec(name);
    if (!match) continue;
    const fileDay = match[1], fileStamp = Date.parse(fileDay + 'T00:00:00Z');
    if (!Number.isFinite(fileStamp) || new Date(fileStamp).toISOString().slice(0,10) !== fileDay || fileStamp >= cutoff) continue;
    const p = path.join(directory, name);
    let fd;
    try {
      const before = fs.lstatSync(p);
      if (!before.isFile() || before.isSymbolicLink() || before.size > 512) continue;
      fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev) continue;
      const b = Buffer.alloc(513), size = fs.readSync(fd,b,0,b.length,0);
      if (size > 512 || !parseCounter(b.subarray(0,size).toString('utf8'),name,fileDay)) continue;
      fs.closeSync(fd); fd = undefined;
      const now = fs.lstatSync(p);
      if (!now.isFile() || now.isSymbolicLink() || now.ino !== before.ino || now.dev !== before.dev || now.mtimeMs !== before.mtimeMs || now.size !== before.size) continue;
      fs.unlinkSync(p); result.removed++;
    } catch(e) { if (e.code !== 'ENOENT') result.errors.push(e.code || 'CLEANUP_ERROR'); }
    finally { if(fd !== undefined) fs.closeSync(fd); }
  }
  return result;
}
module.exports = { parseCounter, readCounters, createCounterTracker, cleanupOlderCounters };
