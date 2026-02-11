/**
 * API Client Module
 * All methods include credentials: 'include' for cookie-based auth.
 * Exports to window.Console.api
 */

window.Console = window.Console || {};

const api = {
  /**
   * Login with password
   * @param {string} password
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async login(password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password })
    });
    return res.json();
  },

  /**
   * Check current auth status
   * @returns {Promise<{authenticated: boolean}>}
   */
  async checkAuth() {
    const res = await fetch('/api/auth/check', {
      credentials: 'include'
    });
    return res.json();
  },

  /**
   * Logout current session
   * @returns {Promise<{success: boolean}>}
   */
  async logout() {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    return res.json();
  },

  /**
   * Start a new session with raw input
   * @param {string} sessionId - MMDD format
   * @param {object} rawInput - Raw session input (photosPath required)
   * @returns {Promise<object>} Checkpoint or phase response
   */
  async startSession(sessionId, rawInput, theme = 'journalist') {
    const res = await fetch(`/api/session/${sessionId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ theme, rawSessionInput: rawInput })
    });
    return res.json();
  },

  /**
   * Approve current checkpoint (SSE-before-POST pattern)
   * 1. Connect SSE, wait for 'connected'
   * 2. POST approval
   * 3. Return { response, eventSource }
   *
   * @param {string} sessionId
   * @param {object} payload - Approval payload
   * @param {function} onProgress - Progress callback ({ type, data })
   * @returns {Promise<{response: object, eventSource: EventSource}>}
   */
  async approve(sessionId, payload, onProgress) {
    // Step 1: Connect SSE first, wait for connected event (with timeout)
    const { eventSource, connected } = api.connectSSE(sessionId, onProgress);
    let timerId;
    const timeout = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('SSE connection timeout after 10s')), 10000);
    });
    await Promise.race([connected, timeout]).then(() => clearTimeout(timerId)).catch((err) => {
      clearTimeout(timerId);
      eventSource.close();
      throw err;
    });

    // Step 2: POST approval
    const res = await fetch(`/api/session/${sessionId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const response = await res.json();

    // Step 3: Return both
    return { response, eventSource };
  },

  /**
   * Rollback to a specific checkpoint
   * @param {string} sessionId
   * @param {string} rollbackTo - Checkpoint name
   * @param {object} [overrides] - State overrides
   * @returns {Promise<object>}
   */
  async rollback(sessionId, rollbackTo, overrides) {
    const res = await fetch(`/api/session/${sessionId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rollbackTo, stateOverrides: overrides })
    });
    return res.json();
  },

  /**
   * Resume existing workflow
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async resume(sessionId) {
    const res = await fetch(`/api/session/${sessionId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    return res.json();
  },

  /**
   * Get current checkpoint info
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async getCheckpoint(sessionId) {
    const res = await fetch(`/api/session/${sessionId}/checkpoint`, {
      credentials: 'include'
    });
    return res.json();
  },

  /**
   * Get full session state
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async getState(sessionId) {
    const res = await fetch(`/api/session/${sessionId}/state`, {
      credentials: 'include'
    });
    return res.json();
  },

  /**
   * Connect to SSE progress stream
   * @param {string} sessionId
   * @param {function} onProgress - Called with { type, data } for each event
   * @returns {{eventSource: EventSource, connected: Promise<void>}}
   */
  connectSSE(sessionId, onProgress) {
    const eventSource = new EventSource(`/api/session/${sessionId}/progress`);
    let resolveConnected, rejectConnected;
    let isConnected = false;
    const connected = new Promise((resolve, reject) => {
      resolveConnected = resolve;
      rejectConnected = reject;
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type || 'unknown';

        switch (type) {
          case 'connected':
            isConnected = true;
            resolveConnected();
            if (onProgress) onProgress({ type: 'connected', data });
            break;
          case 'progress':
          case 'llm_start':
          case 'llm_complete':
          case 'complete':
          case 'error':
          case 'heartbeat':
            if (onProgress) onProgress({ type, data });
            break;
          default:
            if (onProgress) onProgress({ type, data });
            break;
        }
      } catch (err) {
        console.error('[SSE] Failed to parse event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[SSE] Connection error:', err);
      if (!isConnected) {
        // Reject so approve() won't POST against a dead SSE connection
        rejectConnected(new Error('SSE connection failed'));
      }
      if (onProgress) {
        onProgress({ type: 'error', data: { message: 'SSE connection lost' } });
      }
      eventSource.close();
    };

    return { eventSource, connected };
  }
};

window.Console.api = api;
