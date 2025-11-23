@echo off
echo.
echo ============================================
echo   Starting ALN Console + Cloudflare Tunnel
echo ============================================
echo.
echo This will open TWO windows:
echo   1. Server (localhost:3000)
echo   2. Cloudflare Tunnel
echo.
echo Public URL: https://console.aboutlastnightgame.com
echo.
echo Press any key to start...
pause > nul

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Start server in new window
echo Starting server...
start "ALN Console Server" cmd /k "cd /d %SCRIPT_DIR% && npm start"

REM Wait 3 seconds for server to start
timeout /t 3 /nobreak > nul

REM Start tunnel in new window
echo Starting tunnel...
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel run aln-console"

echo.
echo ============================================
echo   Both windows should now be open!
echo ============================================
echo.
echo Visit: https://console.aboutlastnightgame.com
echo.
echo To stop everything: Close both windows
echo   or press Ctrl+C in each window
echo.
echo Press any key to close this window...
pause > nul
