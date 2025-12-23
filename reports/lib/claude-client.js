/**
 * ClaudeClient - Unified Claude CLI wrapper for report generation
 *
 * Provides a consistent interface for calling Claude CLI with:
 * - Isolated work directories (prevents .claude.json conflicts)
 * - Model-specific timeouts
 * - Structured JSON output via --json-schema
 * - Retry logic with exponential backoff
 * - Mock support for testing
 *
 * Usage:
 *   const { callClaude } = require('./claude-client');
 *   const result = await callClaude({
 *     prompt: 'Analyze this data...',
 *     systemPrompt: 'You are a data analyst.',
 *     model: 'sonnet',
 *     jsonSchema: { type: 'object', properties: { ... } }
 *   });
 *
 * Testing:
 *   Parsing functions are exported via _testing for unit tests:
 *   const { _testing: { parseJsonOutput, extractJsonFromText } } = require('./claude-client');
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Model-specific timeout configuration
const MODEL_TIMEOUTS = {
  opus: 10 * 60 * 1000,    // 10 minutes
  sonnet: 5 * 60 * 1000,   // 5 minutes
  haiku: 2 * 60 * 1000     // 2 minutes
};

// Default retry configuration
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_BASE = 1000; // 1 second base, exponential backoff

/**
 * Call Claude CLI with the specified options
 *
 * @param {Object} options - Call options
 * @param {string} options.prompt - User prompt (sent via stdin)
 * @param {string} [options.systemPrompt] - System prompt
 * @param {string} [options.model='sonnet'] - Model: 'haiku', 'sonnet', 'opus'
 * @param {Object} [options.jsonSchema] - JSON schema for structured output
 * @param {string} [options.outputFormat='text'] - Output format: 'text', 'json'
 * @param {string} [options.tools] - Tools to enable (empty string disables all)
 * @param {number} [options.timeout] - Custom timeout in ms (overrides model default)
 * @param {number} [options.maxRetries=2] - Maximum retry attempts
 * @returns {Promise<string>} - Claude's response
 * @throws {Error} - If all retries fail
 */
async function callClaude(options) {
  const {
    prompt,
    systemPrompt = null,
    model = 'sonnet',
    jsonSchema = null,
    outputFormat = 'text',
    tools = null,
    timeout = null,
    maxRetries = DEFAULT_MAX_RETRIES
  } = options;

  if (!prompt) {
    throw new Error('prompt is required');
  }

  const actualTimeout = timeout || MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;

  // Create isolated working directory to prevent .claude.json conflicts
  const workDir = path.join(
    os.tmpdir(),
    `claude-batch-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );

  try {
    await fs.mkdir(workDir, { recursive: true });
    console.log(`[${new Date().toISOString()}] Calling Claude (${model}) in ${workDir}`);

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await executeClaudeProcess({
          prompt,
          systemPrompt,
          model,
          jsonSchema,
          outputFormat,
          tools,
          timeout: actualTimeout,
          workDir
        });

        console.log(`[${new Date().toISOString()}] Claude completed successfully`);
        return result;

      } catch (error) {
        lastError = error;
        console.error(`[${new Date().toISOString()}] Attempt ${attempt + 1} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;

  } finally {
    // Cleanup isolated temp directory
    try {
      await fs.rm(workDir, { recursive: true, force: true });
      console.log(`[${new Date().toISOString()}] Cleaned up: ${workDir}`);
    } catch (cleanupError) {
      console.warn(`[${new Date().toISOString()}] Failed to cleanup temp directory:`, cleanupError.message);
    }
  }
}

/**
 * Execute a single Claude CLI process
 *
 * @param {Object} options - Process options
 * @returns {Promise<string>} - Claude's response
 */
async function executeClaudeProcess(options) {
  const {
    prompt,
    systemPrompt,
    model,
    jsonSchema,
    outputFormat,
    tools,
    timeout,
    workDir
  } = options;

  return new Promise((resolve, reject) => {
    // Build arguments array
    const args = ['-p']; // -p flag for prompt mode

    if (outputFormat === 'json') {
      args.push('--output-format', 'json');
    }

    if (model) {
      args.push('--model', model);
    }

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    if (jsonSchema) {
      args.push('--json-schema', JSON.stringify(jsonSchema));
    }

    if (tools !== null) {
      args.push('--tools', tools);
    }

    // Spawn Claude process in isolated directory
    const claude = spawn('claude', args, {
      cwd: workDir,
      windowsHide: true // Don't show console window on Windows
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Manual timeout implementation for cross-platform reliability
    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error(`[${new Date().toISOString()}] Process timeout after ${timeout}ms (${model})`);
      claude.kill();
    }, timeout);

    // Collect stdout
    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Collect stderr
    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process completion
    claude.on('close', (code, signal) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`Process timeout after ${timeout}ms (${model})`));
        return;
      }

      // Detect abnormal termination
      if (code === null && signal === null) {
        reject(new Error(
          `Process terminated abnormally (no exit code or signal). ` +
          `Stdout: ${stdout.length} bytes, Stderr: ${stderr.length} bytes.`
        ));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
        return;
      }

      if (stderr && !stderr.includes('warning')) {
        console.warn(`[${new Date().toISOString()}] Claude stderr:`, stderr);
      }

      // Parse output based on format
      let finalResult = stdout.trim();

      if (outputFormat === 'json') {
        finalResult = parseJsonOutput(finalResult);
      }

      resolve(finalResult);
    });

    // Handle spawn errors
    claude.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    // Handle STDIN errors (EPIPE on Windows when process closes stdin early)
    claude.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') {
        console.error(`[${new Date().toISOString()}] STDIN error:`, err.code, err.message);
      }
    });

    // Write prompt to stdin and close
    try {
      claude.stdin.write(prompt);
      claude.stdin.end();
    } catch (err) {
      if (err.code !== 'EPIPE') {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to write to stdin: ${err.message}`));
      }
    }
  });
}

/**
 * Parse JSON output from Claude CLI
 * Handles streaming array format and extracts structured_output
 *
 * @param {string} rawOutput - Raw stdout from Claude CLI
 * @returns {string} - Parsed JSON string
 */
function parseJsonOutput(rawOutput) {
  try {
    const wrapper = JSON.parse(rawOutput);

    // New format: Array of message objects (streaming output)
    if (Array.isArray(wrapper)) {
      // Find the result message with structured_output or text content
      const resultMsg = wrapper.find(msg =>
        msg.type === 'result' && msg.subtype === 'success'
      );

      if (resultMsg) {
        // Check for structured_output first (from --json-schema)
        if (resultMsg.structured_output) {
          return JSON.stringify(resultMsg.structured_output);
        }

        // Fall back to result field
        if (resultMsg.result) {
          return extractJsonFromText(resultMsg.result);
        }
      }

      // Try finding assistant message with text
      const assistantMsg = wrapper.find(msg =>
        msg.type === 'assistant' && msg.message
      );

      if (assistantMsg?.message?.content) {
        const textContent = assistantMsg.message.content.find(c => c.type === 'text');
        if (textContent) {
          return extractJsonFromText(textContent.text);
        }
      }
    }

    // Legacy single object format
    if (wrapper.structured_output) {
      return JSON.stringify(wrapper.structured_output);
    }

    // Legacy path: Extract from result field
    if (wrapper.result) {
      return extractJsonFromText(wrapper.result);
    }

    return rawOutput;

  } catch (e) {
    console.warn(`[${new Date().toISOString()}] Failed to parse Claude JSON wrapper:`, e.message);
    return rawOutput;
  }
}

/**
 * Extract JSON from text that may contain markdown code fences
 *
 * @param {string} text - Text that may contain JSON in code fences
 * @returns {string} - Extracted JSON string
 */
function extractJsonFromText(text) {
  // Extract JSON from markdown code fences
  const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // Fallback: simple fence stripping
  return text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
}

/**
 * Get model timeout configuration
 * @param {string} model - Model name
 * @returns {number} - Timeout in milliseconds
 */
function getModelTimeout(model) {
  return MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
}

/**
 * Check if Claude CLI is available
 * @returns {Promise<boolean>}
 */
async function isClaudeAvailable() {
  return new Promise((resolve) => {
    const claude = spawn('claude', ['--version'], { windowsHide: true });

    claude.on('close', (code) => {
      resolve(code === 0);
    });

    claude.on('error', () => {
      resolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      claude.kill();
      resolve(false);
    }, 5000);
  });
}

module.exports = {
  // Main API
  callClaude,
  getModelTimeout,
  isClaudeAvailable,
  MODEL_TIMEOUTS,

  // Exported for testing - parsing functions are pure and deterministic
  _testing: {
    parseJsonOutput,
    extractJsonFromText
  }
};

// Self-test when run directly
if (require.main === module) {
  (async () => {
    console.log('ClaudeClient Self-Test\n');

    // Check availability
    console.log('Checking Claude CLI availability...');
    const available = await isClaudeAvailable();
    console.log(`Claude CLI available: ${available}\n`);

    if (!available) {
      console.error('Claude CLI not found. Run "claude --version" to verify installation.');
      process.exit(1);
    }

    // Test simple call
    console.log('Testing simple text call with Haiku...');
    try {
      const result = await callClaude({
        prompt: 'Say "Hello from Claude Client!" and nothing else.',
        model: 'haiku'
      });
      console.log(`Result: ${result}\n`);
    } catch (error) {
      console.error(`Error: ${error.message}\n`);
    }

    // Test JSON schema call
    console.log('Testing JSON schema call with Haiku...');
    try {
      const result = await callClaude({
        prompt: 'Return a test object.',
        model: 'haiku',
        outputFormat: 'json',
        jsonSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' }
          },
          required: ['status', 'timestamp']
        }
      });
      console.log(`Result: ${result}\n`);
      const parsed = JSON.parse(result);
      console.log(`Parsed status: ${parsed.status}`);
    } catch (error) {
      console.error(`Error: ${error.message}\n`);
    }

    console.log('\nSelf-test complete.');
  })();
}
