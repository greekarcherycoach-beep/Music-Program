const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
const on = (ch, cb) => { const h = (_, ...a) => cb(...a); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  mpvOk: ipcRenderer.sendSync('mpv:ok'),
  native: {
    readdir: p => inv('nat:readdir', p), stat: ps => inv('nat:stat', ps), readTags: p => inv('nat:tags', p), pickFolder: () => inv('nat:pick'),
    pathFor: f => { try { return webUtils.getPathForFile(f); } catch (e) { return ''; } },
    watch: ps => inv('nat:watch', ps), onChanged: cb => on('native:changed', cb),
    libInfo: () => inv('lib:info'), libLoad: () => inv('lib:load'), libSave: j => inv('lib:save', j), libBackups: () => inv('lib:backups'), libBackup: n => inv('lib:backup', n), openLibDir: () => inv('lib:openDir')
  },
  mpv: { start: o => inv('mpv:start', o), stop: () => inv('mpv:stop'), cmd: a => inv('mpv:cmd', a), onEvent: cb => on('mpv:event', cb) },
  state: s => ipcRenderer.send('app:state', s), onCmd: cb => on('cmd', cb),
  getOpen: () => inv('app:getOpen'), onOpen: cb => on('app:open', cb),
  onFlush: cb => on('app:flush', cb), flushDone: () => ipcRenderer.send('app:flushDone'),
  prefs: { get: () => inv('prefs:get'), set: p => inv('prefs:set', p) }
});
