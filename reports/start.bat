@echo off
echo ========================================
echo ALN Director Console - Starting Server
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Check if Claude CLI is available
claude --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Claude CLI not found!
    echo Please install Claude Code from: https://code.claude.com
    echo.
    pause
    exit /b 1
)

echo Starting server...
echo.
node server.js

pause
