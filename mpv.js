// Controls an external mpv process over its JSON IPC (WASAPI exclusive / bit-perfect output, gapless playback, many formats).
const { spawn } = require('child_process'), net = require('net'), os = require('os'), path = require('path'), { EventEmitter } = require('events');
class Mpv extends EventEmitter {
  constructor({ exe, spawnArgs = [], platform = process.platform } = {}) { super(); Object.assign(this, { exe, spawnArgs, platform, rid: 0, pending: new Map(), proc: null, sock: null, buf: '', lastPos: 0 }); }
  pipeName() { const id = process.pid + '-' + Math.random().toString(36).slice(2, 8); return this.platform === 'win32' ? '\\\\.\\pipe\\djape1-mpv-' + id : path.join(os.tmpdir(), 'djape1-mpv-' + id + '.sock'); }
  args(o, pipe) {
    const a = ['--idle=yes', '--no-video', '--no-audio-display', '--no-config', '--no-terminal', '--force-window=no', '--input-ipc-server=' + pipe, '--gapless-audio=yes',
      '--replaygain=no', '--volume=100', '--audio-pitch-correction=no', '--keep-open=no', '--audio-exclusive=' + (o.exclusive ? 'yes' : 'no')];
    if (this.platform === 'win32') a.push('--ao=wasapi');
    if (o.device && o.device !== 'auto') a.push('--audio-device=' + o.device);
    return a;
  }
  async start(o = {}) {
    if (this.proc) await this.stop();
    const pipe = this.pipeName(), [cmd, ...pre] = this.spawnArgs.length ? this.spawnArgs : [this.exe];
    const p = this.proc = spawn(cmd, [...pre, ...this.args(o, pipe)], { windowsHide: true, stdio: 'ignore' });
    p.on('exit', () => { if (this.proc === p) { this.proc = null; this.sock = null; this.rejectAll(new Error('mpv exited')); this.emit('exit'); } });
    p.on('error', e => this.emit('problem', e.message));
    this.sock = await this.connect(pipe);
    this.sock.on('data', d => this.onData(d)); this.sock.on('error', () => { });
    for (const [i, n] of [[1, 'time-pos'], [2, 'duration'], [3, 'pause']]) await this.cmd(['observe_property', i, n]);
    return true;
  }
  connect(pipe, tries = 80) {
    return new Promise((res, rej) => { const t = () => { const s = net.connect(pipe); s.once('connect', () => res(s)); s.once('error', () => { s.destroy(); if (--tries <= 0) rej(new Error('mpv IPC not available')); else setTimeout(t, 100); }); }; t(); });
  }
  onData(d) {
    this.buf += d.toString('utf8'); let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1); if (!line.trim()) continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.request_id !== undefined && this.pending.has(m.request_id)) { const q = this.pending.get(m.request_id); this.pending.delete(m.request_id); clearTimeout(q.t); m.error === 'success' ? q.res(m.data) : q.rej(new Error(m.error)); }
      else if (m.event) {
        if (m.event === 'property-change' && m.name === 'time-pos') { const now = Date.now(); if (now - this.lastPos < 250) continue; this.lastPos = now; }
        this.emit('event', m);
      }
    }
  }
  cmd(args) {
    return new Promise((res, rej) => {
      if (!this.sock) return rej(new Error('mpv not running'));
      const id = ++this.rid, t = setTimeout(() => { this.pending.delete(id); rej(new Error('mpv timeout')); }, 5000);
      this.pending.set(id, { res, rej, t }); this.sock.write(JSON.stringify({ command: args, request_id: id }) + '\n');
    });
  }
  rejectAll(e) { for (const q of this.pending.values()) { clearTimeout(q.t); q.rej(e); } this.pending.clear(); }
  async stop() {
    const p = this.proc; if (!p) return true;
    try { await this.cmd(['quit']); } catch (e) { }
    await new Promise(r => { const t = setTimeout(() => { try { p.kill(); } catch (e) { } r(); }, 800); p.once('exit', () => { clearTimeout(t); r(); }); });
    this.proc = null; try { this.sock && this.sock.destroy(); } catch (e) { } this.sock = null; return true;
  }
}
module.exports = { Mpv };
