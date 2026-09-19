/**
 * API Client Module
 * All methods include credentials: 'include' for cookie-based auth.
 * Exports to window.Console.api
 */

window.Console = window.Console || {};

// Review fix 1: closes the stream when the POST that follows it throws. Pure and
// node-tested in __tests__/unit/llm-stream-logic.test.js. llm-stream-logic.js loads
// BEFORE api.js in index.html for this destructure.
const { closeOnThrow } = window.Console.llmStreamLogic;

/**
 * Open the progress stream and resolve once the server's `connected` frame lands.
 *
 * Shared by the three SSE-before-POST calls (approve/rollback/resume) and by
 * attach(), which opens a stream and does NOT post. Extracted because it was
 * copied three times and attach would have made four.
 *
 * @param {string} sessionId
 * @param {function} onProgress
 * @returns {Promise<EventSource>} resolves only after 'connected'; rejects (and
 *   closes the stream) on handshake failure or a 10 s timeout, so no caller can
 *   POST against a dead stream.
 */
async function openProgressStream(sessionId, onProgress) {
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
  return eventSource;
}

/**
 * Parse a response body and, on a non-2xx, stamp the HTTP status onto it.
 *
 * The console has to tell the two 409s apart: the session lock ("a run is already
 * going" — attach to it) and the B9 refusal ("this thread is complete" — a real
 * error). Only the status distinguishes a 409 from a 400, and only `currentPhase`
 * distinguishes the two 409s. Never stamped on a 2xx, where `status:'processing'`
 * is a legitimate body field.
 *
 * @param {Response} res
 * @returns {Promise<object>}
 */
async function readJsonWithStatus(res) {
  const body = await res.json();
  if (!res.ok && body && typeof body === 'object') body.status = res.status;
  return body;
}

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
   *
   * C1: the route 409s when a thread already exists for this id, because Start
   * Fresh discards its state and re-runs everything. `force` is the deliberate
   * override, sent only after the director confirms (startFreshDecision).
   *
   * @param {string} sessionId - Alphanumeric + hyphens, 1-30 chars
   * @param {object} rawInput - Raw session input (photosPath required)
   * @param {string} [theme]
   * @param {boolean} [force] - discard an existing thread's state on purpose
   * @returns {Promise<object>} Checkpoint or phase response
   */
  async startSession(sessionId, rawInput, theme = 'journalist', force = false) {
    const res = await fetch(`/api/session/${sessionId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ theme, rawSessionInput: rawInput, force: force === true })
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
    const eventSource = await openProgressStream(sessionId, onProgress);

    // Step 2: POST approval. closeOnThrow owns the window between the open stream
    // and a tracked one: if this throws, the caller never gets `eventSource` back,
    // so only this wrapper can still close it.
    const response = await closeOnThrow(eventSource, async () => {
      const res = await fetch(`/api/session/${sessionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      return readJsonWithStatus(res);
    });

    // Step 3: Return both
    return { response, eventSource };
  },

  /**
   * Attach to a run that is ALREADY in flight (H8): open the progress stream and
   * nothing else. Posting instead would 409 against the session lock, and on a
   * complete thread /resume would re-run the whole paid pipeline.
   *
   * @param {string} sessionId
   * @param {function} onProgress
   * @returns {Promise<{eventSource: EventSource}>}
   */
  async attach(sessionId, onProgress) {
    const eventSource = await openProgressStream(sessionId, onProgress);
    return { eventSource };
  },

  /**
   * Rollback to a checkpoint (SSE-before-POST — /rollback is non-blocking and streams
   * its result + live progress via SSE, same contract as approve()).
   * @returns {Promise<{response: object, eventSource: EventSource}>}
   */
  async rollback(sessionId, rollbackTo, overrides, onProgress) {
    const eventSource = await openProgressStream(sessionId, onProgress);

    const response = await closeOnThrow(eventSource, async () => {
      const res = await fetch(`/api/session/${sessionId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rollbackTo, stateOverrides: overrides })
      });
      return readJsonWithStatus(res);
    });
    return { response, eventSource };
  },

  /**
   * Resume an existing workflow (SSE-before-POST — /resume is non-blocking and streams
   * its result + live progress via SSE, same contract as approve()).
   * @returns {Promise<{response: object, eventSource: EventSource}>}
   */
  async resume(sessionId, onProgress) {
    const eventSource = await openProgressStream(sessionId, onProgress);

    const response = await closeOnThrow(eventSource, async () => {
      const res = await fetch(`/api/session/${sessionId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      return readJsonWithStatus(res);
    });
    return { response, eventSource };
  },

  /**
   * Non-secret client configuration. `allowNonstandardSessionId` mirrors the
   * server's ALLOW_NONSTANDARD_SESSION_ID opt-out so the Session screen enforces
   * the same session-ID contract the /start route does.
   * @returns {Promise<{notionConfigured: boolean, allowNonstandardSessionId: boolean}>}
   */
  async getConfig() {
    const res = await fetch('/api/config', { credentials: 'include' });
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
          case 'llm_delta':
          case 'llm_complete':
          case 'llm_error':
          case 'complete':
          case 'failed':
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
        // Handshake never completed. Terminal: reject so the caller won't POST
        // against a dead stream, and close (nothing is waiting on a retry).
        rejectConnected(new Error('SSE connection failed'));
        if (onProgress) onProgress({ type: 'error', data: { message: 'SSE connection lost' } });
        eventSource.close();
        return;
      }

      // H9: a drop AFTER 'connected' is transient — laptop sleep, tunnel blip, a
      // proxy idle-timing out a 12-minute Opus call. Closing here defeated
      // EventSource's native auto-reconnect and dropped the console back to a stale
      // checkpoint while the run carried on server-side, so approving that view
      // either 400'd or (on a revision landing at the same checkpoint type)
      // approved content the director never saw. Leave the stream open: the browser
      // reconnects and the server re-sends 'connected' on the new stream.
      if (onProgress) {
        onProgress({
          type: 'reconnecting',
          data: { message: 'Connection interrupted, reconnecting…' }
        });
      }
    };

    return { eventSource, connected };
  }
};

window.Console.api = api;
