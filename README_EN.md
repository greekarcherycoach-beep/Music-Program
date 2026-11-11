# Dj Ape1 — Windows 10/11 desktop app (version 2)

Builds two files into `dist`: **DjApe1-Setup-2.0.0.exe** (installer, file associations, uninstaller) and **DjApe1-Portable-2.0.0.exe** (no install; data in `DjApe1-data` next to the exe).

## What's inside
- **Native folders:** no permission prompts, fast scanning, tags and durations read by the system, new files detected automatically.
- **Library on disk** (`library\library.json`) with atomic writes and **automatic backups** (last 5). A damaged file falls back to the newest healthy backup. Restore: Manage → Data → "Restore…".
- **Windows integration:** media keys, taskbar buttons, tray icon, close-to-tray, start with Windows, "Open with Dj Ape1" for audio files.
- **mpv audio engine** (🔊 Audio → Audio engine): WASAPI **Exclusive** (the file's real sample rate and bit depth, no Windows mixing), **gapless** playback, extra formats (DSD, APE, WV…). ASIO is not supported by mpv; WASAPI Exclusive gives bit-perfect output on most DACs. While Exclusive is playing, other applications have no sound from that device.

## Build
**GitHub (nothing to install):** create a private repository, upload *all* files including the hidden `.github` folder, then Actions → **Build Windows** → Run workflow; download the `.exe` files from **Artifacts** (about 10 minutes). Push a tag like `v2.0.0` to also create a Release. The workflow downloads mpv itself; if that fails the build continues and the app uses the Chromium engine.
**Locally:** install Node.js LTS, double-click `build.bat` (or `npm install` + `npm run dist`). `npm start` runs without building, `npm test` runs the tests. To add mpv by hand, put `mpv.exe` in `vendor\mpv`.

## Troubleshooting
- "Cannot create symbolic link … privilege": Windows blocks symlinks. `build.bat` retries automatically without exe icon editing. For your own icon turn on Developer Mode, delete `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`, and rebuild.
- `dist\win-unpacked\Dj Ape1.exe` is a working app even if packaging fails.
- mpv is GPL/LGPL software and is bundled as distributed by the mpv-winbuild project. Fine for personal use; keep attribution if you redistribute the app.
