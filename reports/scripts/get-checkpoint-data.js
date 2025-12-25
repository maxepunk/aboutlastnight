#!/usr/bin/env node
/**
 * Get current checkpoint data for review
 */
require('dotenv').config();

async function main() {
  const password = process.env.ACCESS_PASSWORD;

  // Login
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];

  // Get current state (resume without approvals)
  const res = await fetch('http://localhost:3001/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({
      sessionId: 'test-fresh-1',
      theme: 'journalist'
    })
  });

  const data = await res.json();

  // Output full state
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
