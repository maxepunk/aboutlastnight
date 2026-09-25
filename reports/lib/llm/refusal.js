/**
 * Declined requests (refusals) in the Agent SDK stream.
 *
 * Since SDK 0.3.162 a declined request ends with `stop_reason: "refusal"` and
 * `stop_details: {category, explanation}`. `@anthropic-ai/sdk` 0.128.0 types the category
 * as `cyber`, `bio`, `frontier_llm`, `reasoning_extraction`, `general_harms` or null; the
 * CLI treats it as an open string. Before this module the wrapper read neither, so a
 * refused schema call failed as a schema mismatch and a refused text call returned the
 * refusal as content.
 *
 * Ruling (integrator, 2026-09-25): a declined request is never answered by another
 * model. The bundled CLI (2.1.282) has its own refusal fallback routes, keyed on the
 * requested model and independent of the `fallbackModel` option: for `claude-opus-5-5`
 * it retries `bio` and `frontier_llm` on `claude-opus-5` and `cyber` on
 * `claude-opus-4-8`. The wrapper turns them off with
 * `CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK=1` and `CLAUDE_CODE_NO_MODEL_FALLBACK=1` (the
 * CLI's no-fallback guarantee, which also gates this lane) in the subprocess env
 * (client.js), and this tracker treats any main-thread fallback that still happens as a
 * declined request.
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
 *     api_refusal_category, scope}: the CLI retried the refused turn on another model.
 *     The refused frames are retracted, and the fallback leg's assistant frames name
 *     them in `supersedes`. On the main thread (scope 'session', or absent, which the
 *     types say to read as 'session') this is a declined request: `declinedFallback()`
 *     names the category and the fallback model, and the wrapper throws at once. A
 *     main-thread frame carrying `supersedes` is the same fallback leg and is declined
 *     the same way. A 'local' fallback (a subagent or side question; pipeline calls run
 *     none) does not decline the call and is carried as `refusalFallback`. It is not
 *     only recorded: if the fallback model shows in the result's modelUsage, the call
 *     fails as a model substitution (lib/llm/model-substitution.js), as any call served
 *     by a model other than its pinned one does.
 *
 * A refusal signal that is not terminal, followed by a clean finish on another stop
 * reason, returns the result. The wrapper records the signal as `refusalSignal` on
 * llm_complete, so the call log shows it. The exception: when the result's modelUsage
 * names a model other than the one the call resolved to (`servedModelMatches`,
 * lib/llm/sdk-fields.js), another model finished the declined request, and the wrapper
 * throws `SdkRefusalError` naming it. Without a refusal signal, the same modelUsage
 * throws `SdkModelSubstitutionError` instead.
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
   * @param {string|null} [details.fallbackModel] - the model the CLI retried the declined
   *   turn on, when it did; its answer is not used
   * @param {{cause?: unknown}} [options] - Error options: the failure this refusal names
   */
  constructor({ category = null, explanation = null, model = null, label = '', fallbackModel = null } = {}, options) {
    const who = model || 'the model';
    super(
      `${REFUSAL_MARKER} (category: ${category || NO_CATEGORY}): ${who} declined the request` +
      `${label ? ` - ${label}` : ''}${explanation ? `: ${explanation}` : ''}` +
      `${fallbackModel ? ` (the CLI retried it on ${fallbackModel}; that answer is not used)` : ''}`,
      options
    );
    this.name = 'SdkRefusalError';
    this.sdkSubtype = REFUSAL_SUBTYPE;
    this.refusalCategory = category || null;
    this.refusalExplanation = explanation || null;
    this.refusalFallbackModel = fallbackModel || null;
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
 * `observe(msg)` is fed every message. `declinedFallback()` is a main-thread fallback
 * (declined at once); `terminalRefusal(resultMsg)` decides at the result whether the
 * call was declined; `pending()` is any refusal seen so far, used to name a failure that
 * follows one; `fallback()` is the CLI's retry on another model, if any.
 *
 * @param {Object} [context]
 * @param {string|null} [context.model] - the model id the call asked for, used when a
 *   fallback frame does not name the original model
 */
function createRefusalTracker({ model = null } = {}) {
  let refusal = null;   // {category, explanation, terminal}: the latest refusal signal on the main thread
  let fallback = null;  // {originalModel, fallbackModel, category, scope}: the CLI's retry on another model
  let declined = null;  // {category, explanation, fallbackModel}: a main-thread fallback, i.e. a declined request

  const details = (d) => (d && typeof d === 'object' ? d : {});
  const note = (category, explanation, terminal = false) => {
    refusal = {
      category: category ?? refusal?.category ?? null,
      explanation: explanation ?? refusal?.explanation ?? null,
      terminal: terminal || Boolean(refusal?.terminal)
    };
  };
  // The first sign of a main-thread fallback declines the call. A later sign of the same
  // fallback (the end-of-turn notice after a superseding frame) completes the record:
  // what it names wins, and the earlier sign fills what it leaves out.
  const declineOnFallback = (fb, explanation) => {
    fallback = {
      originalModel: fb.originalModel ?? fallback?.originalModel ?? model,
      fallbackModel: fb.fallbackModel ?? fallback?.fallbackModel ?? null,
      category: fb.category ?? fallback?.category ?? refusal?.category ?? null,
      scope: fb.scope ?? fallback?.scope ?? null
    };
    declined = {
      category: fallback.category,
      explanation: explanation ?? declined?.explanation ?? refusal?.explanation ?? null,
      fallbackModel: fallback.fallbackModel
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
        // A main-thread frame that replaces earlier frames is the fallback leg: another
        // model is answering the declined request.
        if (Array.isArray(msg.supersedes) && msg.supersedes.length > 0) {
          declineOnFallback({ fallbackModel: msg.message?.model ?? null }, null);
        }
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
        const fb = {
          originalModel: msg.original_model ?? null,
          fallbackModel: msg.fallback_model ?? null,
          category: msg.api_refusal_category ?? null,
          scope: msg.scope ?? null
        };
        if (msg.scope === 'local') {
          // A subagent or side question fell back; the main turn is unaffected.
          fallback = { ...fb, originalModel: fb.originalModel ?? model };
          return;
        }
        declineOnFallback(fb, msg.api_refusal_explanation ?? null);
      }
    },

    /**
     * @returns {{category: string|null, explanation: string|null, fallbackModel: string|null}|null}
     *   a main-thread fallback: the call is declined, whatever follows
     */
    declinedFallback() {
      return declined ? { ...declined } : null;
    },

    /**
     * @param {Object} result - the SDK result message
     * @returns {{category: string|null, explanation: string|null, fallbackModel?: string|null}|null}
     *   the refusal that ended the call
     */
    terminalRefusal(result) {
      if (declined) return { ...declined };
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

    /**
     * @returns {{category: string|null, explanation: string|null, fallbackModel?: string|null}|null}
     *   any refusal seen so far: a main-thread fallback, or the latest refusal signal
     */
    pending() {
      if (declined) return { ...declined };
      return refusal ? { category: refusal.category, explanation: refusal.explanation } : null;
    },

    /** @returns {{originalModel: string|null, fallbackModel: string|null, category: string|null, scope: string|null}|null} */
    fallback() {
      return fallback ? { ...fallback } : null;
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
