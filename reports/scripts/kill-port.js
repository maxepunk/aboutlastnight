#!/usr/bin/env node
/**
 * Kill process using a specific port (Windows/Mac/Linux)
 * Usage: node scripts/kill-port.js [port]
 */

const { execSync } = require('child_process');
const PORT = process.argv[2] || 3001;

function killPort(port) {
  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
      // Windows: find PID using netstat, then kill
      const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
      const lines = result.trim().split('\n');

      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) {
          pids.add(pid);
        }
      }

      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
          console.log(`Killed process ${pid} on port ${port}`);
        } catch (e) {
          // Process may have already exited
        }
      }

      if (pids.size === 0) {
        console.log(`No process found on port ${port}`);
      }
    } else {
      // Mac/Linux: use lsof and kill
      const result = execSync(`lsof -ti :${port}`, { encoding: 'utf8' });
      const pids = result.trim().split('\n').filter(Boolean);

      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
          console.log(`Killed process ${pid} on port ${port}`);
        } catch (e) {
          // Process may have already exited
        }
      }
    }
  } catch (e) {
    // No process found on port (command failed)
    console.log(`Port ${port} is free`);
  }
}

killPort(PORT);
