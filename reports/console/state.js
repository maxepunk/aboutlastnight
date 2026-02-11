/**
 * State Reducer
 * Single useReducer state machine for the entire app.
 * Exports window.Console.useAppState and window.Console.ACTIONS
 */

window.Console = window.Console || {};

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
  progressMessages: [],
  llmActivity: null,       // { label, model, startTime, prompt, systemPrompt, response } or null
  lastLlmActivity: null,   // Last completed LLM call (with response) for panel display
  // Revision tracking (client-side cache for diff display)
  revisionCache: { outline: null, article: null },
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
  SSE_LLM_COMPLETE: 'SSE_LLM_COMPLETE',
  SSE_COMPLETE: 'SSE_COMPLETE',
  SSE_ERROR: 'SSE_ERROR',
  WORKFLOW_COMPLETE: 'WORKFLOW_COMPLETE',
  CACHE_REVISION: 'CACHE_REVISION',
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
        processing: false
      };

    case ACTIONS.PROCESSING_START:
      return {
        ...state,
        processing: true,
        progressMessages: [],
        llmActivity: null,
        error: null
      };

    case ACTIONS.SSE_CONNECTED:
      return { ...state, sseConnected: true };

    case ACTIONS.SSE_PROGRESS:
      return {
        ...state,
        progressMessages: [...state.progressMessages.slice(-49), action.message]
      };

    case ACTIONS.SSE_LLM_START:
      return {
        ...state,
        llmActivity: {
          label: action.label,
          model: action.model,
          startTime: Date.now(),
          prompt: action.prompt || null,
          systemPrompt: action.systemPrompt || null,
          response: null
        }
      };

    case ACTIONS.SSE_LLM_COMPLETE:
      return {
        ...state,
        // Preserve last LLM activity with response for the collapsible panel
        lastLlmActivity: state.llmActivity ? {
          ...state.llmActivity,
          response: action.response || null,
          completedElapsed: action.elapsed || null
        } : state.lastLlmActivity,
        llmActivity: null
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
        checkpointType: null
      };

    case ACTIONS.CACHE_REVISION:
      return {
        ...state,
        revisionCache: {
          ...state.revisionCache,
          [action.contentType]: action.data
        }
      };

    case ACTIONS.SET_ERROR:
      return { ...state, error: action.message };

    case ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };

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
