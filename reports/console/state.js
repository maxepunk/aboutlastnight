/**
 * State Reducer
 * Single useReducer state machine for the entire app.
 * Exports window.Console.useAppState and window.Console.ACTIONS
 */

window.Console = window.Console || {};

// Pure transition logic for the live LLM stream (dual-export, node-tested).
// Must load BEFORE state.js in index.html (script-tag order).
const StreamLogic = window.Console.llmStreamLogic;

const initialState = {
  // Auth
  authenticated: false,
  // Session
  sessionId: null,
  theme: 'journalist',  // 'journalist' | 'detective'
  phase: null,
  // Checkpoint
  checkpointType: null,
  checkpointData: {},
  // Processing
  processing: false,
  sseConnected: false,
  progressMessages: [],    // DEPRECATED: retained for any legacy reader; eventLog is authoritative
  eventLog: [],            // unbounded scrollable macro feed (retires the .slice(-49) cap)
  llmActivity: null,       // { label, model, startTime, phase, streamText, tokenCount, ttftMs, lastEventAt, error, response } or null
  lastLlmActivity: null,   // Last completed LLM call (with response) for panel display
  // Revision tracking (client-side cache for diff display)
  revisionCache: { outline: null, article: null },
  // Pending edits (survives component unmount during processing) — namespaced by checkpoint type
  pendingEdits: {},
  // Errors
  error: null,
  // Completed
  completedResult: null
};

const ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  SET_SESSION: 'SET_SESSION',
  CHECKPOINT_RECEIVED: 'CHECKPOINT_RECEIVED',
  PROCESSING_START: 'PROCESSING_START',
  SSE_CONNECTED: 'SSE_CONNECTED',
  SSE_PROGRESS: 'SSE_PROGRESS',
  SSE_LLM_START: 'SSE_LLM_START',
  SSE_LLM_DELTA: 'SSE_LLM_DELTA',
  SSE_LLM_COMPLETE: 'SSE_LLM_COMPLETE',
  SSE_LLM_FAILURE: 'SSE_LLM_FAILURE',
  SSE_COMPLETE: 'SSE_COMPLETE',
  SSE_ERROR: 'SSE_ERROR',
  WORKFLOW_COMPLETE: 'WORKFLOW_COMPLETE',
  CACHE_REVISION: 'CACHE_REVISION',
  SAVE_PENDING_EDITS: 'SAVE_PENDING_EDITS',
  RESET_SESSION: 'RESET_SESSION',
  SET_THEME: 'SET_THEME',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR'
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOGIN_SUCCESS:
      return { ...state, authenticated: true };

    case ACTIONS.LOGOUT:
      return { ...initialState };

    case ACTIONS.RESET_SESSION:
      return { ...initialState, authenticated: true };

    case ACTIONS.SET_SESSION:
      return { ...state, sessionId: action.sessionId };

    case ACTIONS.SET_THEME:
      return { ...state, theme: action.theme };

    case ACTIONS.CHECKPOINT_RECEIVED:
      return {
        ...state,
        checkpointType: action.checkpointType,
        checkpointData: action.data || {},
        phase: action.phase || state.phase,
        processing: false,
        // Clear all checkpoint edit slots when a new checkpoint arrives
        // (deliberate substitute for a dedicated RESET_PENDING_EDITS action)
        pendingEdits: {}
      };

    case ACTIONS.PROCESSING_START:
      return {
        ...state,
        processing: true,
        progressMessages: [],
        eventLog: [],
        llmActivity: null,
        error: null
      };

    case ACTIONS.SSE_CONNECTED:
      return { ...state, sseConnected: true };

    case ACTIONS.SSE_PROGRESS:
      return {
        ...state,
        eventLog: StreamLogic.appendEvent(state.eventLog, { kind: 'progress', message: action.message }),
        // Capped legacy mirror — drop in P5.4 once ProgressStream reads eventLog.
        progressMessages: [...state.progressMessages.slice(-49), action.message]
      };

    case ACTIONS.SSE_LLM_START:
      return {
        ...state,
        llmActivity: StreamLogic.applyLlmStart(state.llmActivity, {
          label: action.label,
          model: action.model,
          startTime: Date.now(),
          prompt: action.prompt,
          systemPrompt: action.systemPrompt
        })
      };

    case ACTIONS.SSE_LLM_DELTA:
      return {
        ...state,
        llmActivity: StreamLogic.applyLlmDelta(state.llmActivity, {
          phase: action.phase,
          deltaText: action.deltaText,
          tokenCount: action.tokenCount,
          ttftMs: action.ttftMs,
          lastEventAt: Date.now()
        })
      };

    case ACTIONS.SSE_LLM_FAILURE:
      return {
        ...state,
        llmActivity: StreamLogic.applyLlmFailure(state.llmActivity, { error: action.error }),
        eventLog: StreamLogic.appendEvent(state.eventLog, { kind: 'error', message: action.error })
      };

    case ACTIONS.SSE_LLM_COMPLETE:
      return {
        ...state,
        ...StreamLogic.applyLlmComplete(state, {
          response: action.response,
          elapsed: action.elapsed
        })
      };

    case ACTIONS.SSE_COMPLETE:
      return { ...state, processing: false, sseConnected: false };

    case ACTIONS.SSE_ERROR:
      return {
        ...state,
        error: action.message,
        processing: false,
        sseConnected: false
      };

    case ACTIONS.WORKFLOW_COMPLETE:
      return {
        ...state,
        completedResult: action.result,
        processing: false,
        checkpointType: null,
        // Clear all checkpoint edit slots on workflow completion
        pendingEdits: {}
      };

    case ACTIONS.CACHE_REVISION:
      return {
        ...state,
        revisionCache: {
          ...state.revisionCache,
          [action.contentType]: action.data
        }
      };

    case ACTIONS.SAVE_PENDING_EDITS:
      return {
        ...state,
        pendingEdits: {
          ...state.pendingEdits,
          [action.checkpoint]: action.edits
        }
      };

    case ACTIONS.SET_ERROR:
      // UX-1: also clears `processing` so an early-400 approve can't hang the spinner.
      return window.Console.sessionStatusLogic.applySetError(state, action.message);

    case ACTIONS.CLEAR_ERROR:
      return window.Console.sessionStatusLogic.applyClearError(state);

    default:
      console.warn('[state] Unknown action:', action.type);
      return state;
  }
}

/**
 * Custom hook wrapping useReducer with our state machine
 * @returns {[object, function]} [state, dispatch]
 */
function useAppState() {
  return React.useReducer(reducer, initialState);
}

window.Console.useAppState = useAppState;
window.Console.ACTIONS = ACTIONS;
