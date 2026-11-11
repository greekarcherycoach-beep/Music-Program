// File-system, tag-reading and library-store helpers used by the Electron main process (no Electron imports, so they can be unit-tested).
const fs = require('fs'), fsp = fs.promises, path = require('path');
const AUDIO_RE = /\.(mp3|flac|m4a|mp4|aac|ogg|oga|opus|wav|wma|aiff?|ape|dsf|dff|wv|mka|tta|mpc|ac3|dts|alac|caf|spx)$/i;
const MIME = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wma: 'audio/x-ms-wma', aif: 'audio/aiff', aiff: 'audio/aiff' };

async function readdir(p) {
  const ents = await fsp.readdir(p, { withFileTypes: true }), out = [];
  await Promise.all(ents.map(async e => {
    try {
      if (e.isDirectory()) out.push({ name: e.name, dir: true });
      else if ((e.isFile() || e.isSymbolicLink()) && AUDIO_RE.test(e.name)) { const st = await fsp.stat(path.join(p, e.name)); if (st.isFile()) out.push({ name: e.name, dir: false, size: st.size, mtime: st.mtimeMs }); }
    } catch (x) { /* unreadable entry: skip */ }
  }));
  return out;
}
async function stat(paths) {
  const out = [];
  for (const p of paths || []) { try { const st = await fsp.stat(p); out.push({ path: p, name: path.basename(p), dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs }); } catch (x) { } }
  return out;
}
// Tags in the same shape the renderer already understands (jsmediatags-like) + audio format info.
async function readTags(p, resize) {
  try {
    const mm = await import('music-metadata'), m = await mm.parseFile(p), c = m.common || {}, f = m.format || {};
    const cm = Array.isArray(c.comment) ? c.comment[0] : c.comment, ctext = typeof cm === 'string' ? cm : (cm && cm.text) || '';
    const out = { title: c.title || '', artist: c.artist || '', album: c.album || '', year: c.year ? String(c.year) : '', track: c.track && c.track.no ? String(c.track.no) : '',
      genre: (c.genre || []).join(';'), comment: { text: ctext }, initialkey: c.key || '', bpm: c.bpm || '', __dur: f.duration || 0, __sr: f.sampleRate || 0, __bits: f.bitsPerSample || 0 };
    const pic = c.picture && c.picture[0];
    if (pic && resize) { try { out.picture = { thumb: resize(Buffer.from(pic.data)) }; } catch (x) { } }
    return out;
  } catch (e) { return {}; }
}
// HTTP-style range handling for the djfile:// protocol (needed so <audio> can seek).
async function fileInfo(p, range) {
  const st = await fsp.stat(p), size = st.size, ext = path.extname(p).slice(1).toLowerCase();
  const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m) return { status: 200, start: 0, end: Math.max(0, size - 1), size, headers: { ...h, 'Content-Length': String(size) } };
  let s = m[1] === '' ? NaN : +m[1], e = m[2] === '' ? NaN : +m[2];
  if (isNaN(s)) { s = Math.max(0, size - e); e = size - 1; } else if (isNaN(e) || e >= size) e = size - 1;
  if (s > e || s >= size) return { status: 416, size, headers: { ...h, 'Content-Range': 'bytes */' + size } };
  return { status: 206, start: s, end: e, size, headers: { ...h, 'Content-Length': String(e - s + 1), 'Content-Range': `bytes ${s}-${e}/${size}` } };
}
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const countOf = s => { const m = /"count":(\d+)/.exec(s); return m ? +m[1] : null; };
class LibraryStore {
  constructor(dir, keep = 5) { this.dir = dir; this.file = path.join(dir, 'library.json'); this.bk = path.join(dir, 'backups'); this.keep = keep; this.lastBk = 0; }
  head(f) { try { const fd = fs.openSync(f, 'r'), b = Buffer.alloc(512), n = fs.readSync(fd, b, 0, 512, 0); fs.closeSync(fd); return countOf(b.toString('utf8', 0, n)); } catch (e) { return null; } }
  info() { if (!fs.existsSync(this.file)) return { exists: false, count: 0 }; const c = this.head(this.file); return { exists: true, count: c == null ? 1 : c }; }
  async save(json) {
    await fsp.mkdir(this.bk, { recursive: true });
    if (fs.existsSync(this.file)) {
      const oldC = this.head(this.file), newC = countOf(json.slice(0, 512));
      if (Date.now() - this.lastBk > 600000 || (newC != null && oldC != null && newC < oldC * 0.9)) {
        await fsp.copyFile(this.file, path.join(this.bk, 'library-' + stamp() + '.json')); this.lastBk = Date.now(); await this.prune();
      }
    }
    const tmp = this.file + '.tmp'; await fsp.writeFile(tmp, json); await fsp.rename(tmp, this.file); return true;
  }
  async names() { try { return (await fsp.readdir(this.bk)).filter(n => /^library-[\d-]+\.json$/.test(n)).sort().reverse(); } catch (e) { return []; } }
  async prune() { for (const n of (await this.names()).slice(this.keep)) { try { await fsp.unlink(path.join(this.bk, n)); } catch (e) { } } }
  async backups() { const out = []; for (const n of await this.names()) { try { const f = path.join(this.bk, n), st = await fsp.stat(f); out.push({ name: n, size: st.size, mtime: st.mtimeMs, count: this.head(f) }); } catch (e) { } } return out; }
  async readBackup(name) { if (!/^library-[\d-]+\.json$/.test(name)) throw new Error('bad name'); return fsp.readFile(path.join(this.bk, name), 'utf8'); }
  // Newest valid file wins: the main file, otherwise the most recent readable backup.
  async load() {
    const ok = s => { try { const j = JSON.parse(s); return j && Array.isArray(j.tracks); } catch (e) { return false; } };
    try { const s = await fsp.readFile(this.file, 'utf8'); if (ok(s)) return { json: s, from: null }; } catch (e) { }
    for (const n of await this.names()) { try { const s = await this.readBackup(n); if (ok(s)) return { json: s, from: n }; } catch (e) { } }
    return null;
  }
}
module.exports = { AUDIO_RE, readdir, stat, readTags, fileInfo, LibraryStore };
