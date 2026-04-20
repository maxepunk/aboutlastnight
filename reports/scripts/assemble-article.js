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
const { TemplateAssembler } = require('../lib/template-assembler');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key || !value || !key.startsWith('--')) {
      throw new Error(`Invalid CLI arguments. Usage: --bundle <path> --out <path>`);
    }
    args[key.slice(2)] = value;
  }
  if (!args.bundle || !args.out) {
    throw new Error(`Missing required flags. Usage: --bundle <path> --out <path>`);
  }
  return args;
}

async function main() {
  const { bundle: bundlePath, out: outPath } = parseArgs(process.argv.slice(2));

  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
  const theme = bundle?.metadata?.theme || 'journalist';
  const sessionId = bundle?.metadata?.sessionId || null;

  const assembler = new TemplateAssembler(theme, { sessionId });
  const html = await assembler.assemble(bundle, { sessionId });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);

  console.log(`Wrote ${html.length} bytes to ${outPath}`);
}

main().catch(err => {
  console.error(`[assemble-article] ${err.message}`);
  process.exit(1);
});
