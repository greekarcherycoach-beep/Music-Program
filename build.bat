@echo off
where node >nul 2>nul || (echo Install Node.js LTS first: https://nodejs.org & pause & exit /b 1)
call npm install || (pause & exit /b 1)
echo.
echo === Attempt 1: full build (with custom .exe icon) ===
call npm run dist
if %errorlevel%==0 goto done
echo.
echo Attempt 1 failed. Windows blocks symbolic links while unpacking the signing tools.
echo === Attempt 2: building without .exe icon editing ===
call npx electron-builder --win nsis portable --publish never -c.win.signAndEditExecutable=false
if %errorlevel% neq 0 (echo Build failed. See README.md - section Troubleshooting. & pause & exit /b 1)
:done
echo.
echo Done! The installers are in the "dist" folder.
pause
