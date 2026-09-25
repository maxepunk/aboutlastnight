/**
 * Declined requests (refusals) in the Agent SDK stream.
 *
 * Since SDK 0.3.162 a declined request ends with `stop_reason: "refusal"` and
 * `stop_details: {category, explanation}` (Opus 5.5 categories include `cyber`, `bio`
 * and `reasoning_extraction`; the set is open). Before this module the wrapper read
 * neither, so a refused schema call failed as a schema mismatch and a refused text call
 * returned the refusal as content.
 *
 * Where a refusal can show up, from the 0.3.282 types (`sdk.d.ts` and
 * `@anthropic-ai/sdk` 0.128.0 `BetaMessage` / `BetaRawMessageDeltaEvent`). No live
 * refusal has been captured through this SDK yet, so every source is read and each one
 * is optional:
 *   - result `stop_reason: 'refusal'`: the turn's stop reason arrives on the result
 *     (per-block assistant frames carry `stop_reason: null`).
 *   - an assistant frame whose `message.stop_reason` is 'refusal', with
 *     `message.stop_details` (the "assistant error frame").
 *   - a `stream_event` `message_delta` whose `delta.stop_reason` is 'refusal', with
 *     `delta.stop_details` (only seen with includePartialMessages, which we always set).
 *   - `system/model_refusal_no_fallback` {api_refusal_category, api_refusal_explanation}:
 *     the CLI's "declined, and no retry runs" notice.
 *   - `system/model_refusal_fallback` {original_model, fallback_model,
 *     api_refusal_category}: the CLI retried the refused turn on another model. The
 *     refused frames are retracted, and the fallback leg's assistant frames name them in
 *     `supersedes`. The pipeline passes no `fallbackModel`, so this should not happen;
 *     if it does, the call is NOT failed (the turn continued), but the fallback is
 *     recorded so the call log shows which model answered.
 *
 * @module llm/refusal
 */
'use strict';

const REFUSAL_SUBTYPE = 'refusal';

// Every refusal message starts with this marker. A node that re-wraps an error into a
// plain Error around the original text, or keeps only the text (a per-photo
// placeholder, an evaluation-history `_error`, the enricher's fallback reason), still
// carries a name the retry classifier and the director can read.
const REFUSAL_MARKER = 'SDK refusal';
const REFUSAL_MESSAGE_RE = /\bSDK refusal \(category: ([^)]*)\)/;
const NO_CATEGORY = 'none given';

class SdkRefusalError extends Error {
  /**
   * @param {Object} details
   * @param {string|null} [details.category] - stop_details.category (open string, may be null)
   * @param {string|null} [details.explanation] - stop_details.explanation (display only)
   * @param {string|null} [details.model] - the model id the call asked for
   * @param {string} [details.label] - the call's label
   */
  constructor({ category = null, explanation = null, model = null, label = '' } = {}) {
    const who = model || 'the model';
    super(
      `${REFUSAL_MARKER} (category: ${category || NO_CATEGORY}): ${who} declined the request` +
      `${label ? ` - ${label}` : ''}${explanation ? `: ${explanation}` : ''}`
    );
    this.name = 'SdkRefusalError';
    this.sdkSubtype = REFUSAL_SUBTYPE;
    this.refusalCategory = category || null;
    this.refusalExplanation = explanation || null;
  }
}

/**
 * The refusal an error carries, looking through `.cause` links (a re-wrapping node
 * passes the original as the cause) and, as a last resort, the refusal marker in a
 * message that kept only the text.
 *
 * @param {unknown} err
 * @returns {{category: string|null, explanation: string|null}|null}
 */
function refusalOf(err) {
  const seen = new Set();
  for (let e = err; e && typeof e === 'object' && !seen.has(e) && seen.size < 10; e = e.cause) {
    seen.add(e);
    if (e instanceof SdkRefusalError || e.sdkSubtype === REFUSAL_SUBTYPE) {
      return { category: e.refusalCategory ?? null, explanation: e.refusalExplanation ?? null };
    }
    const match = typeof e.message === 'string' ? REFUSAL_MESSAGE_RE.exec(e.message) : null;
    if (match) {
      return { category: match[1] === NO_CATEGORY ? null : match[1], explanation: null };
    }
  }
  return null;
}

/** @param {unknown} err @returns {boolean} */
function isRefusalError(err) {
  return refusalOf(err) !== null;
}

/**
 * Follow the refusal signals across one call's stream.
 *
 * `observe(msg)` is fed every message. `terminalRefusal(resultMsg)` decides at the
 * result whether the call was declined; `pending()` is an unsuperseded refusal signal,
 * used to name a schema failure that follows one; `fallback()` is the CLI's retry on
 * another model, if any.
 */
function createRefusalTracker() {
  let refusal = null;   // {category, explanation, terminal}: set by a signal, cleared by a fallback retry
  let fallback = null;  // {originalModel, fallbackModel, category}

  const details = (d) => (d && typeof d === 'object' ? d : {});
  const note = (category, explanation, terminal = false) => {
    refusal = {
      category: category ?? refusal?.category ?? null,
      explanation: explanation ?? refusal?.explanation ?? null,
      terminal: terminal || Boolean(refusal?.terminal)
    };
  };

  return {
    observe(msg) {
      if (!msg || typeof msg !== 'object' || msg.parent_tool_use_id) return;

      if (msg.type === 'stream_event') {
        const ev = msg.event || {};
        if (ev.type === 'message_delta' && ev.delta?.stop_reason === 'refusal') {
          const d = details(ev.delta.stop_details);
          note(d.category, d.explanation);
        }
        return;
      }

      if (msg.type === 'assistant') {
        // A fallback-leg frame replaces the refused leg's frames.
        if (Array.isArray(msg.supersedes) && msg.supersedes.length > 0) refusal = null;
        if (msg.message?.stop_reason === 'refusal') {
          const d = details(msg.message.stop_details);
          note(d.category, d.explanation);
        }
        return;
      }

      if (msg.type === 'system' && msg.subtype === 'model_refusal_no_fallback') {
        note(msg.api_refusal_category, msg.api_refusal_explanation, true);
        return;
      }

      if (msg.type === 'system' && msg.subtype === 'model_refusal_fallback') {
        fallback = {
          originalModel: msg.original_model ?? null,
          fallbackModel: msg.fallback_model ?? null,
          category: msg.api_refusal_category ?? null
        };
        // 'local' = a subagent or side question fell back; the main turn is unaffected.
        if (msg.scope !== 'local') refusal = null;
      }
    },

    /**
     * @param {Object} result - the SDK result message
     * @returns {{category: string|null, explanation: string|null}|null} the refusal that ended the call
     */
    terminalRefusal(result) {
      const r = result || {};
      if (r.stop_reason === 'refusal') {
        const d = details(r.stop_details);
        return {
          category: d.category ?? refusal?.category ?? null,
          explanation: d.explanation ?? refusal?.explanation ?? null
        };
      }
      if (!refusal) return null;
      const found = { category: refusal.category, explanation: refusal.explanation };
      if (refusal.terminal) return found;
      // A signal with no fallback after it, and a result that is not a clean finish on
      // another stop reason: the turn ended on the refusal.
      const cleanFinish = r.subtype === 'success' && !r.is_error &&
        typeof r.stop_reason === 'string' && r.stop_reason.length > 0;
      return cleanFinish ? null : found;
    },

    /** @returns {{category: string|null, explanation: string|null}|null} */
    pending() {
      return refusal ? { category: refusal.category, explanation: refusal.explanation } : null;
    },

    /** @returns {{originalModel: string|null, fallbackModel: string|null, category: string|null}|null} */
    fallback() {
      return fallback;
    }
  };
}

module.exports = {
  SdkRefusalError,
  refusalOf,
  isRefusalError,
  createRefusalTracker,
  REFUSAL_SUBTYPE,
  REFUSAL_MARKER
};
