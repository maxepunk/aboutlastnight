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
const { THEME_CONFIGS, getThemeConfig } = require('../lib/theme-config');

const DEFAULT_THEME = Object.keys(THEME_CONFIGS)[0];

/**
 * The bundle with the theme's in-world date (display.storyDate) on its metadata, as
 * the pipeline's generateContentBundle (lib/workflow/nodes/ai-nodes.js) stamps it, over
 * any date the writer gave. The journalist header prints storyDate and falls back to
 * generatedAt, the day the bundle was made. A theme with no in-world date, or a bundle
 * with no metadata, is returned as it is.
 */
function withStoryDate(bundle, theme) {
  const storyDate = getThemeConfig(theme)?.display?.storyDate;
  if (!storyDate || !bundle?.metadata || typeof bundle.metadata !== 'object') return bundle;
  return { ...bundle, metadata: { ...bundle.metadata, storyDate } };
}

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

  const written = JSON.parse(fs.readFileSync(values.bundle, 'utf-8'));
  const theme = written?.metadata?.theme || DEFAULT_THEME;
  const sessionId = written?.metadata?.sessionId || null;
  const bundle = withStoryDate(written, theme);

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
