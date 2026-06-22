const { probeNotionReachable } = require('../../server.js');

describe('probeNotionReachable', () => {
  test('returns ok:true when the client request resolves', async () => {
    const client = { request: jest.fn().mockResolvedValue({ object: 'user', type: 'bot' }) };
    const result = await probeNotionReachable(client);
    expect(result.ok).toBe(true);
    expect(client.request).toHaveBeenCalledWith('users/me');
  });

  test('returns ok:false with the error message when the request rejects', async () => {
    const client = { request: jest.fn().mockRejectedValue(new Error('401 unauthorized')) };
    const result = await probeNotionReachable(client);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
  });
});
