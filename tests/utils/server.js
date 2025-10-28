/**
 * Local HTTP server utilities
 *
 * Note: Playwright's webServer config handles auto-starting servers.
 * These utilities are for manual server management and detection.
 */

const { spawn } = require('child_process');
const http = require('http');

/**
 * Check if a server is running on a specific port
 */
async function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start a Python HTTP server
 */
function startPythonServer(port, cwd) {
  return new Promise((resolve, reject) => {
    const server = spawn('python3', ['-m', 'http.server', String(port)], {
      cwd: cwd || process.cwd(),
      stdio: 'pipe',
    });

    let started = false;

    // Wait for server to be ready
    const checkInterval = setInterval(async () => {
      if (await isServerRunning(port)) {
        clearInterval(checkInterval);
        started = true;
        resolve(server);
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!started) {
        clearInterval(checkInterval);
        server.kill();
        reject(new Error(`Server failed to start on port ${port}`));
      }
    }, 5000);

    server.on('error', (err) => {
      if (!started) {
        clearInterval(checkInterval);
        reject(err);
      }
    });
  });
}

/**
 * Stop a running server process
 */
function stopServer(serverProcess) {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
}

module.exports = {
  isServerRunning,
  startPythonServer,
  stopServer,
};
