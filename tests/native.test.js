const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const N = require('../native');
const wav = (secs, rate) => { const n = secs * rate * 2, b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n, 40); return b; };
(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'djt-')); fs.mkdirSync(path.join(d, 'Sub')); fs.writeFileSync(path.join(d, 'a.wav'), wav(2, 44100)); fs.writeFileSync(path.join(d, 'Sub', 'b.mp3'), 'not really audio'); fs.writeFileSync(path.join(d, 'notes.txt'), 'x'); fs.writeFileSync(path.join(d, 'x.dsf'), 'x');
  // readdir: only audio files and folders, with sizes
  const l = (await N.readdir(d)).sort((a, b) => a.name < b.name ? -1 : 1); assert.deepStrictEqual(l.map(x => x.name), ['Sub', 'a.wav', 'x.dsf']); assert.ok(l.find(x => x.name === 'a.wav').size > 100); assert.strictEqual(l[0].dir, true);
  const st = await N.stat([d, path.join(d, 'a.wav'), path.join(d, 'missing')]); assert.strictEqual(st.length, 2); assert.strictEqual(st[0].dir, true); assert.strictEqual(st[1].name, 'a.wav');
  // tags: real WAV gives duration + sample rate; garbage never throws
  const t = await N.readTags(path.join(d, 'a.wav')); assert.ok(Math.abs(t.__dur - 2) < 0.05, 'duration ' + t.__dur); assert.strictEqual(t.__sr, 44100); assert.strictEqual(t.__bits, 16);
  const g = await N.readTags(path.join(d, 'Sub', 'b.mp3')); assert.strictEqual(g.title || '', ''); assert.strictEqual(g.__dur || 0, 0); assert.deepStrictEqual(await N.readTags(path.join(d, 'nope.flac')), {});
  // range requests
  const f = path.join(d, 'a.wav'), size = fs.statSync(f).size;
  let r = await N.fileInfo(f, null); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers['Content-Length'], String(size));
  r = await N.fileInfo(f, 'bytes=100-199'); assert.strictEqual(r.status, 206); assert.strictEqual(r.headers['Content-Range'], `bytes 100-199/${size}`);
  r = await N.fileInfo(f, 'bytes=100-'); assert.strictEqual(r.end, size - 1); r = await N.fileInfo(f, 'bytes=-50'); assert.strictEqual(r.start, size - 50);
  assert.strictEqual((await N.fileInfo(f, `bytes=${size + 5}-`)).status, 416);
  // library store: atomic save, backups on shrink, pruning, fallback to a backup when the main file is corrupt
  const S = new N.LibraryStore(path.join(d, 'lib'), 3), lib = n => JSON.stringify({ app: 'x', v: 3, count: n, tracks: Array.from({ length: n }, (_, i) => ({ id: i })) });
  assert.deepStrictEqual(S.info(), { exists: false, count: 0 });
  await S.save(lib(100)); assert.deepStrictEqual(S.info(), { exists: true, count: 100 }); assert.strictEqual((await S.backups()).length, 0);
  await S.save(lib(40)); const b1 = await S.backups(); assert.strictEqual(b1.length, 1); assert.strictEqual(b1[0].count, 100);   // shrink => backup of the old file
  for (let i = 0; i < 4; i++) { S.lastBk = 0; await new Promise(r => setTimeout(r, 1100)); await S.save(lib(40 + i)); }
  assert.ok((await S.backups()).length <= 3, 'pruned to 3');
  assert.strictEqual(JSON.parse((await S.load()).json).count, 43);
  fs.writeFileSync(S.file, '{"count":9,"tracks":[ broken'); const ld = await S.load(); assert.ok(ld.from && JSON.parse(ld.json).tracks.length > 0, 'fell back to backup');
  await assert.rejects(S.readBackup('../../etc/passwd'));
  console.log('native tests OK');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
