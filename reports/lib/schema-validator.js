/**
 * SchemaValidator - JSON Schema validation using Ajv
 *
 * Validates ContentBundle and other structured data against JSON schemas.
 * Central validation point for the unified report generation system.
 *
 * Usage:
 *   const { SchemaValidator } = require('./schema-validator');
 *   const validator = new SchemaValidator();
 *   const result = validator.validate('content-bundle', contentBundle);
 *   if (!result.valid) console.error(result.errors);
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const contentBundleSchema = require('./schemas/content-bundle.schema.json');
const preprocessedEvidenceSchema = require('./schemas/preprocessed-evidence.schema.json');
const outlineSchema = require('./schemas/outline.schema.json');
const detectiveOutlineSchema = require('./schemas/detective-outline.schema.json');

class SchemaValidator {
  /**
   * Create a new SchemaValidator instance
   * Automatically registers the content-bundle schema
   */
  constructor() {
    this.ajv = new Ajv({
      allErrors: true,      // Report all errors, not just first
      verbose: true,        // Include schema in error output
      strict: true,         // Strict mode for schema validation
      allowUnionTypes: true // Allow oneOf with different types
    });

    // Add format validation (date-time, email, uri, etc.)
    addFormats(this.ajv);

    // Map of schema name -> compiled validator
    this.validators = new Map();

    // Register built-in schemas
    this.registerSchema('content-bundle', contentBundleSchema);
    this.registerSchema('preprocessed-evidence', preprocessedEvidenceSchema);
    this.registerSchema('outline', outlineSchema);
    this.registerSchema('detective-outline', detectiveOutlineSchema);
  }

  /**
   * Register a JSON schema for validation
   * @param {string} name - Schema identifier
   * @param {Object} schema - JSON Schema object
   * @throws {Error} If schema is invalid
   */
  registerSchema(name, schema) {
    try {
      const validator = this.ajv.compile(schema);
      this.validators.set(name, validator);
    } catch (err) {
      throw new Error(`Failed to compile schema '${name}': ${err.message}`);
    }
  }

  /**
   * Validate data against a registered schema
   * @param {string} schemaName - Name of registered schema
   * @param {Object} data - Data to validate
   * @returns {Object} - { valid: boolean, errors: Array|null }
   * @throws {Error} If schema is not registered
   */
  validate(schemaName, data) {
    const validator = this.validators.get(schemaName);

    if (!validator) {
      throw new Error(`Unknown schema: ${schemaName}`);
    }

    const valid = validator(data);

    return {
      valid,
      errors: valid ? null : this.formatErrors(validator.errors)
    };
  }

  /**
   * Format Ajv errors into a cleaner structure
   * @param {Array} errors - Ajv error array
   * @returns {Array} - Formatted error objects
   */
  formatErrors(errors) {
    if (!errors) return [];

    return errors.map(err => ({
      path: err.instancePath || '/',
      message: err.message,
      keyword: err.keyword,
      params: err.params,
      // Include which property failed for 'required' errors
      ...(err.keyword === 'required' && {
        missingProperty: err.params?.missingProperty
      }),
      // Include allowed values for 'enum' errors
      ...(err.keyword === 'enum' && {
        allowedValues: err.params?.allowedValues
      })
    }));
  }

  /**
   * Check if a schema is registered
   * @param {string} schemaName - Schema name to check
   * @returns {boolean}
   */
  hasSchema(schemaName) {
    return this.validators.has(schemaName);
  }

  /**
   * Get list of registered schema names
   * @returns {string[]}
   */
  getSchemaNames() {
    return Array.from(this.validators.keys());
  }
}

module.exports = { SchemaValidator };
