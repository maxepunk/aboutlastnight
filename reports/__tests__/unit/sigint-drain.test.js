/**
 * SIGINT drain (DUR-2): an in-flight /approve resume must finish (or be
 * awaited) and the durable checkpointer's db handle must close before exit.
 */
const { drainAndClose, _inFlight } = require('../../server.js');

describe('drainAndClose (DUR-2)', () => {
  it('awaits every in-flight task, then closes the db, then the server', async () => {
    const order = [];
    const inFlight = new Set();
    const task = new Promise(resolve => setTimeout(() => { order.push('task'); resolve(); }, 20))
      .finally(() => inFlight.delete(task));
    inFlight.add(task);

    const checkpointer = { db: { close: () => order.push('db.close') } };
    const server = { close: (cb) => { order.push('server.close'); cb && cb(); } };

    await drainAndClose({ inFlight, checkpointer, server });

    expect(order).toEqual(['task', 'db.close', 'server.close']);
    expect(inFlight.size).toBe(0);
  });

  it('still closes db + server when there are no in-flight tasks', async () => {
    const order = [];
    const checkpointer = { db: { close: () => order.push('db.close') } };
    const server = { close: (cb) => { order.push('server.close'); cb && cb(); } };
    await drainAndClose({ inFlight: new Set(), checkpointer, server });
    expect(order).toEqual(['db.close', 'server.close']);
  });

  it('closes db + server even if an in-flight task rejects (no unhandled rejection)', async () => {
    const order = [];
    const inFlight = new Set();
    const task = Promise.reject(new Error('boom')).catch(() => order.push('task-rejected'));
    inFlight.add(task);
    const checkpointer = { db: { close: () => order.push('db.close') } };
    const server = { close: (cb) => { order.push('server.close'); cb && cb(); } };
    await drainAndClose({ inFlight, checkpointer, server });
    expect(order).toContain('db.close');
    expect(order).toContain('server.close');
  });

  it('resolves even if server.close never calls back (open SSE/keep-alive backstop)', async () => {
    const order = [];
    const checkpointer = { db: { close: () => order.push('db.close') } };
    // A real http.Server with an open SSE connection: close() fires but never invokes cb.
    const server = { close: () => { order.push('server.close-called'); /* no cb */ } };
    await drainAndClose({ inFlight: new Set(), checkpointer, server, closeTimeoutMs: 10 });
    expect(order).toEqual(['db.close', 'server.close-called']); // returned despite no callback
  });

  it('exposes a module-scope in-flight Set for the /approve handler to register into', () => {
    expect(_inFlight instanceof Set).toBe(true);
  });
});
