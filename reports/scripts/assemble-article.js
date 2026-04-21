#!/usr/bin/env node
/**
 * assemble-article.js
 *
 * Render a ContentBundle JSON into final article HTML using the shared
 * TemplateAssembler. Thin CLI wrapper so the journalist-report skill
 * can produce the same output as the LangGraph pipeline.
 *
 * Usage:
 *   node scripts/assemble-article.js --bundle path/to/content-bundle.json --out path/to/article.html
 */

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const { createTemplateAssembler } = require('../lib/template-assembler');
const { THEME_CONFIGS } = require('../lib/theme-config');

const DEFAULT_THEME = Object.keys(THEME_CONFIGS)[0];

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      bundle: { type: 'string' },
      out: { type: 'string' },
    },
    strict: true,
  });

  if (!values.bundle || !values.out) {
    throw new Error('Missing required flags. Usage: --bundle <path> --out <path>');
  }

  const bundle = JSON.parse(fs.readFileSync(values.bundle, 'utf-8'));
  const theme = bundle?.metadata?.theme || DEFAULT_THEME;
  const sessionId = bundle?.metadata?.sessionId || null;

  const assembler = createTemplateAssembler(theme, { sessionId });
  const html = await assembler.assemble(bundle);

  fs.mkdirSync(path.dirname(values.out), { recursive: true });
  fs.writeFileSync(values.out, html);

  console.log(`Wrote ${html.length} bytes to ${values.out}`);
}

main().catch(err => {
  console.error(`[assemble-article] ${err.message}`);
  process.exit(1);
});
