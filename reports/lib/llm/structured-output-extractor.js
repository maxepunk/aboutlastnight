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
 * @param {string} text
 * @returns {Object|null} Parsed object or null if no JSON found
 */
function tryExtractJson(text) {
  if (typeof text !== 'string' || text.length === 0) return null;

  // Try markdown fences first (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {
      // Fall through to bare-object scan
    }
  }

  // Scan for the first balanced top-level JSON object
  // (Greedy substring between first { and last } — works for flat outputs;
  // for our use case the model emits a single top-level object.)
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // Not valid JSON
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

  // Path 2: Extract from resultText
  const extracted = tryExtractJson(resultText);
  if (extracted === null) {
    throw new StructuredOutputExtractionError(
      `No JSON object found in result text (length=${(resultText || '').length})`,
      { label, model, lastText: resultText }
    );
  }

  if (!validate(extracted)) {
    throw new StructuredOutputExtractionError(
      `Extracted JSON does not match schema: ${ajv.errorsText(validate.errors)}`,
      { schemaErrors: validate.errors || [], label, model, lastText: resultText }
    );
  }

  return extracted;
}

module.exports = {
  extractStructuredOutput,
  tryExtractJson,
  StructuredOutputExtractionError
};
