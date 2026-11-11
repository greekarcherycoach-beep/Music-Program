const path = require('path'), assert = require('assert'), { Mpv } = require('../mpv');
(async () => {
  const m = new Mpv({ spawnArgs: [process.execPath, path.join(__dirname, 'fake-mpv.js')] }), evs = [];
  assert.ok(m.args({ exclusive: true, device: 'wasapi/{x}' }, 'P').includes('--audio-exclusive=yes')); assert.ok(!m.args({}, 'P').includes('--audio-device=auto'));
  m.on('event', e => evs.push(e)); await m.start({ exclusive: true });
  assert.deepStrictEqual((await m.cmd(['get_property', 'audio-device-list'])).map(d => d.name), ['auto', 'wasapi/{x}']);
  await m.cmd(['loadfile', 'a.flac', 'replace']); await m.cmd(['loadfile', 'b.flac', 'append']);
  await new Promise(r => setTimeout(r, 100)); assert.ok(evs.some(e => e.event === 'property-change' && e.name === 'duration' && e.data === 10), 'duration event');
  await assert.rejects(m.cmd(['bogus']), /unknown/);
  await m.cmd(['__finish']); await new Promise(r => setTimeout(r, 100)); assert.ok(evs.some(e => e.event === 'end-file' && e.reason === 'eof'));
  const s = await m.cmd(['__state']); assert.strictEqual(s.idx, 1, 'moved on to the queued file (gapless)');
  await m.stop(); await assert.rejects(m.cmd(['get_property', 'pause']));
  console.log('mpv tests OK'); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
