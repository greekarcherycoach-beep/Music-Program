// Runs the renderer's MpvEngine (extracted from app/index.html) against the real controller + a fake mpv process.
const fs = require('fs'), path = require('path'), assert = require('assert'), { Mpv } = require('../mpv');
const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const code = html.slice(html.indexOf('/* ===== v20 native ===== */'), html.indexOf('/* ===== end v20 ===== */'));
globalThis.window = { desktop: null };
const { MpvEngine } = new Function(code + ';return{MpvEngine,NFile,NDir,natFile}')();
const sleep = ms => new Promise(r => setTimeout(r, ms)), U = p => 'djfile://local/' + encodeURIComponent(p);
(async () => {
  const mpv = new Mpv({ spawnArgs: [process.execPath, path.join(__dirname, 'fake-mpv.js')] }), el = new EventTarget(), log = []; let nextFile = '/m/b.flac';
  ['play', 'pause', 'ended', 'loadedmetadata', 'timeupdate', 'durationchange', 'error'].forEach(n => el.addEventListener(n, () => log.push(n)));
  const eng = new MpvEngine(el, { cmd: a => mpv.cmd(a), start: o => mpv.start(o), stop: () => mpv.stop(), onEvent: cb => { mpv.on('event', cb); return () => mpv.off('event', cb); } }, { next: () => nextFile, exclusive: () => 1 });
  const st = () => mpv.cmd(['__state']);
  await eng.enable(); assert.strictEqual(el.paused, true); assert.ok(Number.isNaN(el.duration));
  el.src = U('/m/a.flac'); await sleep(150);
  let s = await st(); assert.deepStrictEqual(s.playlist, ['/m/a.flac', '/m/b.flac'], 'current + gapless next queued'); assert.strictEqual(s.pause, true, 'loads paused until play()');
  assert.strictEqual(el.duration, 10); assert.ok(log.includes('loadedmetadata') && log.includes('durationchange'));
  await el.play(); await sleep(100); s = await st(); assert.strictEqual(s.pause, false); assert.strictEqual(el.paused, false); assert.ok(log.includes('play'));
  el.currentTime = 4; await sleep(350); assert.strictEqual(el.currentTime, 4);
  // gapless: mpv moves to b by itself, the app then "cues" b: no reload
  nextFile = '/m/c.flac'; await mpv.cmd(['__finish']); await sleep(120); assert.ok(log.includes('ended'));
  el.src = U('/m/b.flac'); await sleep(150); s = await st(); assert.deepStrictEqual(s.playlist, ['/m/b.flac', '/m/c.flac'], 'b kept playing, c queued'); assert.strictEqual(s.pause, false, 'no restart / pause');
  // end of queue + repeat-one: the app seeks to 0 and plays again
  nextFile = ''; el.src = U('/m/b.flac'); await sleep(100); await mpv.cmd(['__finish']); await sleep(100); // last track ends -> mpv idle
  el.currentTime = 0; await sleep(150); s = await st(); assert.ok(s.playlist.length === 1 && s.pause === true, 'reloaded last track paused'); await el.play(); await sleep(100); assert.strictEqual((await st()).pause, false);
  // a track without a path cannot be played by mpv
  const n = log.length; el.src = 'blob:http://x/1'; assert.ok(log.slice(n).includes('error'));
  // disable restores the element's own properties
  eng.disable(); assert.ok(!Object.prototype.hasOwnProperty.call(el, 'currentTime') && !Object.prototype.hasOwnProperty.call(el, 'play'));
  // NFile / NDir shims
  const { NFile, NDir } = new Function(code + ';return{NFile,NDir}')(); const f = new NFile('C:\\Music\\a b.mp3', 'a b.mp3', 5, 1); assert.strictEqual(f.url, 'djfile://local/' + encodeURIComponent('C:\\Music\\a b.mp3')); assert.strictEqual(new NDir('C:\\Music\\Rock\\').name, 'Rock'); assert.strictEqual(new NDir('/home/x/Mu').name, 'Mu');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(new NDir('/a/b'))), { path: '/a/b', name: 'b', kind: 'directory' });   // plain data => safe to store in IndexedDB
  console.log('engine tests OK'); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
