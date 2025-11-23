#!/bin/bash

echo "========================================"
echo "ALN Director Console - Starting Server"
echo "========================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Check if Claude CLI is available
if ! command -v claude &> /dev/null; then
    echo "[ERROR] Claude CLI not found!"
    echo "Please install Claude Code from: https://code.claude.com"
    echo ""
    exit 1
fi

echo "Starting server..."
echo ""
node server.js
