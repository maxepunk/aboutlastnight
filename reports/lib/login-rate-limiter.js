/**
 * Zero-dependency in-memory login rate limiter (SEC-5).
 *
 * Per-IP rolling-window failure count with lockout. Single-process server,
 * so a plain Map is sufficient — no Redis/express-rate-limit dependency.
 * Clock is injectable for deterministic tests.
 */
function createLoginRateLimiter({
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,   // rolling window for counting failures
  lockoutMs = 15 * 60 * 1000,  // how long a tripped IP stays blocked
  clock = Date.now
} = {}) {
  // Invariant: keep windowMs <= lockoutMs. With windowMs > lockoutMs an IP's
  // oldest failures are still in-window when its lock expires, so check() would
  // immediately re-lock it and it could never recover until it stops attempting
  // for a full windowMs. The default config keeps them equal (clean reset).
  // ip -> { failures: number[] (timestamps), lockedUntil: number }
  const buckets = new Map();

  function prune(entry, now) {
    entry.failures = entry.failures.filter(t => now - t < windowMs);
  }

  function check(ip) {
    const now = clock();
    const entry = buckets.get(ip);
    if (!entry) return { allowed: true };
    if (entry.lockedUntil && now < entry.lockedUntil) {
      return { allowed: false, retryAfterMs: entry.lockedUntil - now };
    }
    prune(entry, now);
    if (entry.failures.length >= maxAttempts) {
      // window full but no active lock (e.g. just aged in) — block + lock
      entry.lockedUntil = now + lockoutMs;
      return { allowed: false, retryAfterMs: lockoutMs };
    }
    // Opportunistic cleanup: past the lock + window-full branches, an entry with
    // no in-window failures carries no state — drop it so the Map stays bounded
    // for IPs that return. (Fully-orphaned IPs that never check again are not
    // swept; acceptable for this single-operator, loopback-bound, tunnel-only
    // console — see threat model in server.js login bind comment.)
    if (entry.failures.length === 0) {
      buckets.delete(ip);
    }
    return { allowed: true };
  }

  function recordFailure(ip) {
    const now = clock();
    let entry = buckets.get(ip);
    if (!entry) { entry = { failures: [], lockedUntil: 0 }; buckets.set(ip, entry); }
    prune(entry, now);
    entry.failures.push(now);
    if (entry.failures.length >= maxAttempts) {
      entry.lockedUntil = now + lockoutMs;
    }
  }

  function recordSuccess(ip) {
    buckets.delete(ip);
  }

  function size() {
    return buckets.size;
  }

  return { check, recordFailure, recordSuccess, size };
}

module.exports = { createLoginRateLimiter };
