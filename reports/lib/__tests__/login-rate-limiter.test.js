const { createLoginRateLimiter } = require('../login-rate-limiter');

describe('login rate limiter', () => {
  test('allows up to maxAttempts failures, then locks out', () => {
    let now = 0;
    const rl = createLoginRateLimiter({ maxAttempts: 5, windowMs: 60000, lockoutMs: 300000, clock: () => now });
    const ip = '1.2.3.4';
    for (let i = 0; i < 5; i++) {
      expect(rl.check(ip).allowed).toBe(true);
      rl.recordFailure(ip);
    }
    const blocked = rl.check(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  test('successful login clears the counter', () => {
    let now = 0;
    const rl = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 300000, clock: () => now });
    const ip = '5.6.7.8';
    rl.recordFailure(ip);
    rl.recordFailure(ip);
    rl.recordSuccess(ip);
    // counter reset → full budget again
    expect(rl.check(ip).allowed).toBe(true);
    rl.recordFailure(ip);
    rl.recordFailure(ip);
    expect(rl.check(ip).allowed).toBe(true);
  });

  test('lockout expires after lockoutMs', () => {
    let now = 0;
    const rl = createLoginRateLimiter({ maxAttempts: 2, windowMs: 60000, lockoutMs: 300000, clock: () => now });
    const ip = '9.9.9.9';
    rl.recordFailure(ip); rl.recordFailure(ip);
    expect(rl.check(ip).allowed).toBe(false);
    now += 300001; // past lockout
    expect(rl.check(ip).allowed).toBe(true);
  });

  test('failures outside the rolling window do not accumulate', () => {
    let now = 0;
    const rl = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 300000, clock: () => now });
    const ip = '8.8.8.8';
    rl.recordFailure(ip);
    now += 61000; // first failure ages out
    rl.recordFailure(ip);
    rl.recordFailure(ip);
    expect(rl.check(ip).allowed).toBe(true); // only 2 in-window
  });

  test('separate IPs have independent budgets', () => {
    let now = 0;
    const rl = createLoginRateLimiter({ maxAttempts: 2, windowMs: 60000, lockoutMs: 300000, clock: () => now });
    rl.recordFailure('a'); rl.recordFailure('a');
    expect(rl.check('a').allowed).toBe(false);
    expect(rl.check('b').allowed).toBe(true);
  });

  test('a fully-decayed IP bucket is reclaimed on next check (bounded memory)', () => {
    let now = 0;
    const rl = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 60000, clock: () => now });
    rl.recordFailure('x');
    expect(rl.size()).toBe(1);
    now += 60001; // the single failure ages out; no lock was ever set
    expect(rl.check('x').allowed).toBe(true);
    expect(rl.size()).toBe(0); // bucket reclaimed, not leaked
  });
});
