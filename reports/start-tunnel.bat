@echo off
echo.
echo ============================================
echo   Starting Cloudflare Tunnel
echo   URL: https://console.aboutlastnightgame.com
echo ============================================
echo.
echo This will run the tunnel (keep window open)
echo.

cloudflared tunnel run aln-console
