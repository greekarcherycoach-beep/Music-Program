// Downloads a Windows mpv build (mpv.exe) into vendor/mpv so it is bundled with the app. Never fails the build: without it the app simply runs with the Chromium audio engine.
const https = require('https'), fs = require('fs'), path = require('path'), cp = require('child_process');
const OUT = path.join(__dirname, '..', 'vendor', 'mpv'); fs.mkdirSync(OUT, { recursive: true });
const readme = path.join(OUT, 'README.txt'); if (!fs.existsSync(readme)) fs.writeFileSync(readme, 'Put mpv.exe here (https://mpv.io/installation/) to enable the audiophile engine.\n');
if (fs.existsSync(path.join(OUT, 'mpv.exe'))) { console.log('[get-mpv] mpv.exe already present'); process.exit(0); }
const get = (url, redirects = 5) => new Promise((res, rej) => {
  const headers = { 'User-Agent': 'djape1-build', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN && url.includes('api.github.com')) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  https.get(url, { headers }, r => {
    if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects > 0) { r.resume(); return res(get(new URL(r.headers.location, url).href, redirects - 1)); }
    if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode + ' for ' + url)); }
    res(r);
  }).on('error', rej);
});
(async () => {
  try {
    const r = await get('https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest'); let body = ''; for await (const c of r) body += c;
    const a = (JSON.parse(body).assets || []).find(x => /^mpv-x86_64-\d{8}-git-[0-9a-f]+\.7z$/.test(x.name));
    if (!a) throw new Error('no matching mpv asset in the latest release');
    console.log('[get-mpv] downloading', a.name);
    const tmp = path.join(OUT, 'mpv.7z'), dl = await get(a.browser_download_url);
    await new Promise((ok, no) => { const w = fs.createWriteStream(tmp); dl.pipe(w); w.on('finish', ok); w.on('error', no); });
    cp.execFileSync(require('7zip-bin').path7za, ['e', '-y', '-o' + OUT, tmp, 'mpv.exe'], { stdio: 'inherit' });
    fs.unlinkSync(tmp); console.log('[get-mpv] mpv.exe installed');
  } catch (e) { console.warn('[get-mpv] skipped (' + e.message + '). The app will use the Chromium audio engine; see README to add mpv.exe manually.'); }
})();
