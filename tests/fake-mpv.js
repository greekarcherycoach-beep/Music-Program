// Minimal stand-in for mpv's JSON IPC, used to test the controller and the renderer adapter without mpv installed.
const net = require('net'), fs = require('fs');
const sock = (process.argv.find(a => a.startsWith('--input-ipc-server=')) || '').split('=')[1];
try { fs.unlinkSync(sock); } catch (e) { }
const st = { pause: false, 'time-pos': null, duration: null, playlist: [], idx: -1 }, obs = new Map(); let conn = null;
const ev = o => conn && conn.write(JSON.stringify(o) + '\n');
const prop = (n, v) => { st[n] = v; for (const [id, name] of obs) if (name === n) ev({ event: 'property-change', id, name: n, data: v }); };
const start = i => { st.idx = i; ev({ event: 'start-file' }); ev({ event: 'file-loaded' }); prop('duration', 10); prop('time-pos', 0); };
net.createServer(c => {
  conn = c; let buf = '';
  c.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const [cmd, ...a] = m.command; let data = null, error = 'success';
    if (cmd === 'observe_property') obs.set(a[0], a[1]);
    else if (cmd === 'get_property') data = a[0] === 'audio-device-list' ? [{ name: 'auto', description: 'Autoselect device' }, { name: 'wasapi/{x}', description: 'Speakers' }] : st[a[0]];
    else if (cmd === 'set_property') prop(a[0], a[1]);
    else if (cmd === 'loadfile') { if (a[1] === 'append') st.playlist.push(a[0]); else { st.playlist = [a[0]]; start(0); } }
    else if (cmd === 'playlist-clear') { st.playlist = st.playlist.slice(st.idx, st.idx + 1); st.idx = st.playlist.length ? 0 : -1; }
    else if (cmd === 'seek') prop('time-pos', a[0]);
    else if (cmd === '__finish') { ev({ event: 'end-file', reason: 'eof' }); if (st.playlist[st.idx + 1]) start(st.idx + 1); else { st.idx = -1; st.playlist = []; } }
    else if (cmd === '__state') data = { playlist: st.playlist, idx: st.idx, pause: st.pause, pos: st['time-pos'] };
    else if (cmd === 'quit') { c.write(JSON.stringify({ error, data, request_id: m.request_id }) + '\n'); setTimeout(() => process.exit(0), 20); continue; }
    else error = 'unknown command';
    c.write(JSON.stringify({ error, data, request_id: m.request_id }) + '\n'); } });
}).listen(sock);
