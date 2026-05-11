/**
 * Skill Autoload Probe
 *
 * Asks the model to enumerate every skill/instruction visible in its system
 * context. Mirrors generateContentBundle's SDK settings (model: opus,
 * disableTools: true, loadProjectSettings: true) so the probe reflects what
 * an article-generation call actually sees.
 *
 * Usage: node scripts/probe-skill-autoload.js
 */

const { sdkQuery } = require('../lib/llm');

const PROBE_PROMPT = `Without using any tools, list every skill, plugin, or system instruction visible to you right now. For each, give:
- name (e.g. "journalist-report", "superpowers:using-superpowers")
- source (user-level, project-level, or session-injected)
- whether you would normally invoke it for an article-generation task

Return the list as JSON matching the schema. Do not invoke any of the skills. Just enumerate them.`;

const PROBE_SCHEMA = {
  type: 'object',
  required: ['skills', 'totalCount'],
  properties: {
    skills: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'source'],
        properties: {
          name: { type: 'string' },
          source: { type: 'string' },
          wouldInvokeForArticleGen: { type: 'boolean' },
          description: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    totalCount: { type: 'integer' },
    notes: { type: 'string' }
  },
  additionalProperties: false
};

(async function main() {
  console.log('Probing skill autoload visible to article-generation-style SDK call...');
  console.log('Settings: model=opus, disableTools=true, loadProjectSettings=true (default)\n');

  const result = await sdkQuery({
    prompt: PROBE_PROMPT,
    model: 'opus',
    jsonSchema: PROBE_SCHEMA,
    disableTools: true,
    label: 'skill autoload probe',
    onProgress: (msg) => {
      if (msg.type === 'llm_complete') {
        console.log(`\n[probe] Complete in ${msg.elapsed?.toFixed(1)}s — channel=${msg.channel} stop=${msg.stopReason} out=${msg.usage?.output_tokens}`);
      } else if (msg.type === 'llm_error') {
        console.log(`\n[probe] FAILED in ${msg.elapsed?.toFixed(1)}s — channel=unknown stop=${msg.stopReason} structuredOutputPresent=${msg.structuredOutputPresent}`);
      }
    }
  });

  console.log(`\nTotal skills visible: ${result.totalCount}`);
  console.log('\nSkills:');
  for (const skill of result.skills) {
    const flag = skill.wouldInvokeForArticleGen ? ' [WOULD-INVOKE]' : '';
    console.log(`  - ${skill.name} (${skill.source})${flag}`);
    if (skill.description) console.log(`      ${skill.description}`);
  }
  if (result.notes) {
    console.log(`\nNotes from model: ${result.notes}`);
  }
})().catch(err => {
  console.error('Probe failed:', err.message);
  if (err.schemaErrors) console.error('Schema errors:', err.schemaErrors);
  process.exit(1);
});
