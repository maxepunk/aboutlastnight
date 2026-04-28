/**
 * Structured Output Extractor
 *
 * Recovers structured output from SDK responses when the SDK's outputFormat
 * mechanism silently fails (see anthropics/claude-agent-sdk-typescript#277).
 *
 * Strategy:
 * 1. If structuredOutput is present and schema-valid → return it
 * 2. Else extract JSON from resultText (markdown fence, then bare object)
 * 3. Validate against schema with ajv
 * 4. Return on success, throw with diagnostic context on failure
 *
 * @module llm/structured-output-extractor
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Cache compiled validators by schema object reference. WeakMap means stable
// schema constants (the dominant pattern in our LangGraph nodes) get reused,
// and one-off schemas are GC'd with their owning scope.
const validatorCache = new WeakMap();

function getValidator(schema) {
  let validate = validatorCache.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(schema, validate);
  }
  return validate;
}

class StructuredOutputExtractionError extends Error {
  constructor(message, { schemaErrors = [], label, model, lastText } = {}) {
    super(message);
    this.name = 'StructuredOutputExtractionError';
    this.schemaErrors = schemaErrors;
    this.label = label;
    this.model = model;
    this.lastText = lastText;
  }
}

/**
 * Extract a JSON object from text, handling markdown fences and bare objects.
 *
 * When `accept` is provided, returns the FIRST candidate that both parses AND
 * satisfies the predicate. This handles multi-object texts where prose includes
 * additional JSON-like content alongside the schema-valid response.
 *
 * @param {string} text
 * @param {(obj: Object) => boolean} [accept] - Optional predicate. Defaults to "any parseable object".
 * @returns {Object|null} Parsed object or null if no acceptable object found
 */
function tryExtractJson(text, accept) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const isAcceptable = typeof accept === 'function' ? accept : () => true;

  // Try markdown fences first (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const fenced = JSON.parse(fenceMatch[1].trim());
      if (isAcceptable(fenced)) return fenced;
      // Fence content not acceptable — fall through to bare-object scan
    } catch (_) {
      // Fall through
    }
  }

  // Scan for any balanced top-level JSON object. Handles multi-object texts
  // like "preamble {bad} prose {good}" by finding the first '{' that opens a
  // balanced, parseable, AND acceptable substring. String literals are tracked
  // so braces inside quoted strings don't disturb the depth counter.
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (isAcceptable(parsed)) return parsed;
          } catch (_) {
            // Try the next '{' position
          }
          break;
        }
      }
    }
  }

  return null;
}

/**
 * Extract validated structured output, with fallback to resultText parsing.
 *
 * @param {Object} args
 * @param {*} args.structuredOutput - SDK-provided structured_output (may be undefined)
 * @param {string} args.resultText - SDK-provided result text (may be empty)
 * @param {Object} args.schema - JSON schema to validate against
 * @param {string} [args.label] - Call label for diagnostics
 * @param {string} [args.model] - Model name for diagnostics
 * @returns {Object} Schema-valid object
 * @throws {StructuredOutputExtractionError} When no schema-valid object can be produced
 */
function extractStructuredOutput({ structuredOutput, resultText, schema, label, model }) {
  const validate = getValidator(schema);

  // Path 1: SDK-provided structured output is valid
  if (structuredOutput !== undefined && structuredOutput !== null) {
    if (validate(structuredOutput)) {
      return structuredOutput;
    }
    // Fall through to text-extraction; SDK output was schema-invalid
  }

  // Path 2: Extract from resultText, preferring the first schema-valid candidate
  // (handles multi-object texts where prose contains additional JSON-like content).
  const extracted = tryExtractJson(resultText, (obj) => validate(obj));
  if (extracted === null) {
    // No schema-valid candidate found — try once more without the predicate so
    // we can produce a useful diagnostic about WHY validation failed (rather
    // than the less helpful "no JSON found").
    const anyParseable = tryExtractJson(resultText);
    if (anyParseable !== null) {
      validate(anyParseable); // populate validate.errors
      throw new StructuredOutputExtractionError(
        `Extracted JSON does not match schema: ${ajv.errorsText(validate.errors)}`,
        { schemaErrors: validate.errors || [], label, model, lastText: resultText }
      );
    }
    throw new StructuredOutputExtractionError(
      `No JSON object found in result text (length=${(resultText || '').length})`,
      { label, model, lastText: resultText }
    );
  }

  // extracted passed the predicate inside tryExtractJson, so it is schema-valid here.
  return extracted;
}

module.exports = {
  extractStructuredOutput,
  StructuredOutputExtractionError
};
