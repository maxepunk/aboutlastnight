# Skill Template Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the `journalist-report` skill's article generation path to use the same Handlebars template system (`templates/journalist/`) as the LangGraph pipeline, eliminating template-fork drift while leaving the pipeline untouched.

**Architecture:** Change the skill's `journalist-article-generator` subagent from emitting raw HTML (via `assets/article.html` placeholder substitution) to emitting a validated `ContentBundle` JSON, then invoking a new thin CLI wrapper around the existing `TemplateAssembler` to render the final HTML. The pipeline already uses this path — we're giving the skill the same on-ramp. The legacy `assets/article.html` is kept in place (option 1) because the pipeline's `theme-loader.loadTemplate()` still reads it as optional LLM prompt context; making it authoritative for neither path is a documentation problem, not a code problem.

**Tech Stack:** Node.js, Jest, Handlebars (via existing `lib/template-assembler.js`), existing ContentBundle schema at `lib/schemas/content-bundle.schema.json`, Claude Code skill + subagent definitions.

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `scripts/assemble-article.js` | **Create** | CLI entrypoint: load ContentBundle JSON, invoke `TemplateAssembler`, write HTML |
| `__tests__/unit/scripts/assemble-article.test.js` | **Create** | Unit test for the assembly CLI against existing `valid-journalist.json` fixture |
| `.claude/agents/journalist-article-generator.md` | **Modify** | Change subagent contract: emit ContentBundle JSON + run assembly script; add Bash tool |
| `.claude/skills/journalist-report/SKILL.md` | **Modify** | Phase 4 instructions: describe new bundle-then-assemble flow |
| `.claude/skills/journalist-report/references/schemas.md` | **Modify** | Add ContentBundle schema reference (pointer to `lib/schemas/content-bundle.schema.json`) |
| `.claude/skills/journalist-report/references/prompts/formatting.md` | **Modify** | Minor: align any lingering "generate HTML" guidance with "emit ContentBundle" reality (file already mostly correct) |
| `.claude/skills/journalist-report/assets/article.html` | **Keep** | Unchanged — still referenced by pipeline `theme-loader.loadTemplate()` as optional prompt context |
| `reports/CLAUDE.md` | **Modify** | One-line note: skill now uses `TemplateAssembler` via `scripts/assemble-article.js` |

---

## Task 1: Create the assembly CLI script (TDD)

**Files:**
- Create: `scripts/assemble-article.js`
- Test: `__tests__/unit/scripts/assemble-article.test.js`

**Context for engineer:** `TemplateAssembler` (at `lib/template-assembler.js`) is already the pipeline's rendering engine. Its constructor signature is `new TemplateAssembler(theme, options)` and it exposes `await assembler.assemble(contentBundle, { sessionId })` which returns a complete HTML string. By default it inlines CSS and JS (`inlineCss: true`, `inlineJs: true`), which produces standalone HTML — exactly what the skill's current output is. We're writing a thin CLI so the skill's subagent can invoke it via `Bash`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/scripts/assemble-article.test.js`:

```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const VALID_BUNDLE = require('../../fixtures/content-bundles/valid-journalist.json');
const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'assemble-article.js');

describe('assemble-article CLI', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders a valid ContentBundle to HTML and writes it to the output path', () => {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const outPath = path.join(tmpDir, 'article.html');
    fs.writeFileSync(bundlePath, JSON.stringify(VALID_BUNDLE));

    execFileSync('node', [SCRIPT, '--bundle', bundlePath, '--out', outPath], { stdio: 'pipe' });

    expect(fs.existsSync(outPath)).toBe(true);
    const html = fs.readFileSync(outPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(VALID_BUNDLE.headline.main);
  });

  it('exits non-zero with an informative message when the bundle is missing required fields', () => {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const outPath = path.join(tmpDir, 'article.html');
    fs.writeFileSync(bundlePath, JSON.stringify({ metadata: { theme: 'journalist' } }));

    expect(() => {
      execFileSync('node', [SCRIPT, '--bundle', bundlePath, '--out', outPath], { stdio: 'pipe' });
    }).toThrow();

    expect(fs.existsSync(outPath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/unit/scripts/assemble-article.test.js`
Expected: FAIL — `Cannot find module '../../../scripts/assemble-article.js'` or ENOENT on the script.

- [ ] **Step 3: Create the script**

Create `scripts/assemble-article.js`:

```javascript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/unit/scripts/assemble-article.test.js`
Expected: PASS — both test cases green.

- [ ] **Step 5: Smoke-test the CLI manually**

Run: `node scripts/assemble-article.js --bundle __tests__/fixtures/content-bundles/valid-journalist.json --out /tmp/smoke.html && head -2 /tmp/smoke.html`
Expected: `Wrote <N> bytes to /tmp/smoke.html` followed by `<!DOCTYPE html>` as the first line of the output.

- [ ] **Step 6: Commit**

```bash
git add scripts/assemble-article.js __tests__/unit/scripts/assemble-article.test.js
git commit -m "feat(scripts): add assemble-article CLI for skill-path rendering"
```

---

## Task 2: Update the journalist-article-generator subagent

**Files:**
- Modify: `.claude/agents/journalist-article-generator.md`

**Context for engineer:** The current subagent definition (Opus model, tools `Read, Write`) instructs the agent to write `output/article.html` directly using `assets/article.html` as a template. We're changing it to write a ContentBundle JSON + metadata, then shell out to the assembly script we just wrote. The subagent needs `Bash` added to its tool list.

- [ ] **Step 1: Read the current file in full**

Run: `cat .claude/agents/journalist-article-generator.md`
Expected: the agent definition shown above with `tools: Read, Write`, model `opus`, and a "Template" section pointing at `assets/article.html`.

- [ ] **Step 2: Replace the file contents**

Overwrite `.claude/agents/journalist-article-generator.md` with:

```markdown
---
name: journalist-article-generator
description: Generates the final NovaNews article HTML from approved outline. Use in Phase 4 after outline is approved.
tools: Read, Write, Bash
model: opus
# Model rationale: Opus is essential for:
# - Maintaining consistent Nova voice across 1500+ words
# - Weaving systemic critique naturally into narrative
# - Creating compelling prose that feels like real investigative journalism
# Sonnet produces competent but less distinctive prose; this is the flagship output.
---

# Article Generator

You generate the final NovaNews investigative article by emitting a structured
ContentBundle JSON and then invoking the shared rendering pipeline to produce HTML.

## First: Load Reference Files

Before writing, READ these reference files from the skill directory:

```
.claude/skills/journalist-report/references/prompts/character-voice.md
.claude/skills/journalist-report/references/prompts/writing-principles.md
.claude/skills/journalist-report/references/prompts/formatting.md
.claude/skills/journalist-report/references/prompts/evidence-boundaries.md
.claude/skills/journalist-report/references/prompts/section-rules.md
.claude/skills/journalist-report/references/schemas.md
```

These contain:
- Nova's voice and language rules
- Anti-patterns to avoid
- ContentBundle field semantics (section types, content-block kinds, sidebar components)
- Three-layer evidence boundaries
- Section-by-section guidance

Also READ the JSON schema that defines the shape of your output:
`lib/schemas/content-bundle.schema.json`

## CRITICAL: Three-Layer Boundary Check (Pre-Generation)

**Before writing FOLLOW THE MONEY and WHAT'S MISSING sections, internalize these rules:**

1. Review `evidence-boundaries.md` Layer 2 section carefully
2. **NEVER state whose memory was buried** - the Black Market display shows account totals, not individual token ownership
3. Use **account-centric language**: "ChaseT received $750K" NOT "Kai's memories went to ChaseT"
4. Transaction timestamps ARE visible - you can correlate timing with director observations
5. The mystery IS the mystery: "I don't know whose memories those were. I know what they cost."

**Director Observation Exception:**
- If director noted someone at Valet ("Taylor at Valet at 8:15 PM")
- AND transaction timestamp correlates ("ChaseT received a transaction at 8:16 PM")
- You CAN note the correlation, but CANNOT claim to know WHOSE memory Taylor sold

## Input Files (Session Data)

- `analysis/article-outline.json` - Approved outline with all placements
- `analysis/evidence-bundle.json` - Full evidence for quoting exposed content

## Your Task

1. Read all reference files to internalize voice and rules
2. Read the approved outline - follow placements EXACTLY
3. Read the ContentBundle schema so your output validates on the first pass
4. Produce a ContentBundle JSON matching `lib/schemas/content-bundle.schema.json`
5. Write the bundle to `output/content-bundle.json`
6. Write `output/article-metadata.json` (see shape below)
7. Invoke the shared renderer via Bash:
   ```
   node scripts/assemble-article.js \
     --bundle output/content-bundle.json \
     --out output/article.html
   ```
8. Confirm `output/article.html` exists and is non-empty

## Output Files

- `output/content-bundle.json` - Validated ContentBundle JSON (your structured output)
- `output/article.html` - Rendered HTML produced by the assembly script
- `output/article-metadata.json`:
```json
{
  "wordCount": 1847,
  "sections": 6,
  "evidenceCardsUsed": 4,
  "photosPlaced": 3,
  "generatedAt": "ISO timestamp",
  "generatedBy": "journalist-article-generator",
  "selfAssessment": {
    "voiceConsistency": "strong throughout",
    "antiPatternViolations": 0,
    "systemicCritiquePresent": true
  }
}
```

## Why a Bundle, Not HTML

Emitting structured JSON + letting the shared `TemplateAssembler` render HTML gives
the skill path the same structural consistency as the server pipeline: evidence
cards, financial trackers, sidebar components, and the reading-progress bar all
come out of the same Handlebars partials that the pipeline uses. You focus on
voice and structure; the template handles markup.

If the assembly script fails with a schema validation error, the error message
identifies the offending path (e.g., `sections[2].content[0]: required property
"text" missing`). Fix the bundle and re-run the script.

## Return Value

```
"Article generated: 1,847 words, 6 sections. Voice score: 5/5. Zero anti-pattern violations."
```
```

- [ ] **Step 3: Verify the file parses as valid Claude Code subagent frontmatter**

Run: `head -10 .claude/agents/journalist-article-generator.md`
Expected: frontmatter block showing `tools: Read, Write, Bash`, `model: opus`.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/journalist-article-generator.md
git commit -m "feat(skill): rewrite article-generator subagent to emit ContentBundle"
```

---

## Task 3: Update SKILL.md Phase 4 instructions

**Files:**
- Modify: `.claude/skills/journalist-report/SKILL.md:1135-1195` (Phase 4 section)

**Context for engineer:** The SKILL.md currently documents Phase 4 as "generate HTML directly using `assets/article.html` template." We need to update the Phase 4 Task invocation example and the output description to match the new subagent contract.

- [ ] **Step 1: Locate the Phase 4 section**

Run: `grep -n "^## Phase 4" .claude/skills/journalist-report/SKILL.md`
Expected: a single match around line 1135.

- [ ] **Step 2: Replace the Phase 4 section**

Replace the block between `## Phase 4: Article Generation (ARTICLE-GENERATOR SUBAGENT)` (inclusive) and `## Phase 5: Validation (VALIDATOR SUBAGENT)` (exclusive) with:

```markdown
## Phase 4: Article Generation (ARTICLE-GENERATOR SUBAGENT)

**Use the article-generator subagent** for quality prose generation with fresh context.
The subagent emits a structured `ContentBundle` JSON; a shared rendering script then
produces the final HTML using the same Handlebars template system as the server pipeline.

### 4.1 Record Outline Approval

After user approves outline in checkpoint 3, update `article-outline.json` with:
```javascript
{
  userApproval: {
    approved: true,
    revisions: [],
    approvedAt: "ISO timestamp"
  }
}
```

### 4.2 Invoke Article Generator Subagent

```
Task(subagent_type="journalist-article-generator", prompt=`
  Session: 20251221

  Generate the final NovaNews article from approved outline.

  Read from session data directory:
  - analysis/article-outline.json (approved outline with all placements)
  - analysis/evidence-bundle.json (for quoting exposed evidence)

  Emit a ContentBundle JSON matching lib/schemas/content-bundle.schema.json.

  Write to:
  - output/content-bundle.json (your structured output)
  - output/article-metadata.json (word count, components used, self-assessment)

  Then run:
    node scripts/assemble-article.js \
      --bundle output/content-bundle.json \
      --out output/article.html

  Return concise summary with word count and voice assessment.
`)
```

**The subagent loads these reference files internally:**
- `references/prompts/character-voice.md`
- `references/prompts/writing-principles.md`
- `references/prompts/formatting.md`
- `references/prompts/evidence-boundaries.md`
- `references/prompts/section-rules.md`
- `references/schemas.md`
- `lib/schemas/content-bundle.schema.json`

### 4.3 Output

The subagent produces:
- `output/content-bundle.json` - Validated ContentBundle JSON
- `output/article.html` - Rendered HTML via shared `TemplateAssembler`
- `output/article-metadata.json` - Generation metadata and self-assessment

**Critical constraints enforced by subagent:**
- First-person participatory voice ("I was there when...")
- No em-dashes anywhere
- "Extracted memories" never "tokens"
- Blake suspicious but not condemned
- Systemic critique woven throughout

**Structural consistency** is now enforced by the template system rather than by the
LLM: evidence cards, financial trackers, pull quotes, and sidebar components are
all rendered from the same Handlebars partials the pipeline uses, so the skill and
pipeline paths now produce structurally identical HTML for equivalent inputs.

---
```

- [ ] **Step 3: Verify the section boundaries still line up**

Run: `grep -n "^## Phase" .claude/skills/journalist-report/SKILL.md`
Expected: Phase 1 through Phase 5 sections in order, with Phase 4 and Phase 5 still distinct.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/journalist-report/SKILL.md
git commit -m "docs(skill): update Phase 4 to describe bundle-then-assemble flow"
```

---

## Task 4: Add missing content-block examples to formatting.md

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/formatting.md`

**Context for engineer:** `formatting.md` is already JSON/ContentBundle oriented (no HTML examples) and its "Content Block Types" section at lines 74–107 shows `photo` and `evidence-card` examples. But the ContentBundle schema defines additional content-block types — `paragraph`, `quote`, `evidence-reference`, `list` — and a top-level `pullQuotes` array shape, none of which are exemplified. Adding these reduces the subagent's chance of emitting a malformed bundle on first pass.

- [ ] **Step 1: Verify current state**

Run: `grep -c '"type": "photo"\|"type": "evidence-card"' .claude/skills/journalist-report/references/prompts/formatting.md`
Expected: ≥ 2 (the existing examples).

- [ ] **Step 2: Add a "Complete Content Block Reference" subsection after line 107**

In `formatting.md`, locate the end of the "Sidebar vs Inline Evidence" subsection (around line 107, just before the `---` separator that precedes "## Photos (Inline Placement)"). Insert this block on the line immediately before that separator:

```markdown

### Complete Content Block Reference

All seven content-block shapes the subagent may emit inside `sections[].content[]`:

```json
{ "type": "paragraph", "text": "Vic arrived early that evening..." }
```

```json
{ "type": "quote", "text": "The job is yours.", "attribution": "Vic Chase" }
```

```json
{ "type": "evidence-reference", "tokenId": "rat031", "caption": "The offer" }
```

```json
{ "type": "list", "ordered": false, "items": ["First observation", "Second observation"] }
```

```json
{ "type": "photo", "filename": "20251221_205807.png", "caption": "Vic before the vote", "characters": ["Vic"] }
```

```json
{ "type": "evidence-card", "tokenId": "rat031", "headline": "The Offer", "content": "The job is yours. The CEO isn't even cold yet.", "owner": "Vic Chase", "significance": "critical" }
```

### Top-Level Arrays

`pullQuotes[]` — two shapes:

```json
{ "type": "verbatim", "text": "The job is yours.", "attribution": "Vic Chase", "sourceTokenId": "rat031", "placement": "right" }
```

```json
{ "type": "crystallization", "text": "Memory is the one thing the market never stops buying.", "attribution": null, "placement": "center" }
```

`evidenceCards[]` — sidebar catalog entries (summary, not full content):

```json
{ "tokenId": "rat031", "headline": "The Offer", "summary": "Vic Chase takes Marcus's chair before his body is cold.", "owner": "Vic Chase", "significance": "critical", "placement": "sidebar" }
```
```

- [ ] **Step 3: Verify all seven block types and both pullQuote variants are now documented**

Run:
```bash
for t in paragraph quote evidence-reference list photo evidence-card verbatim crystallization; do
  count=$(grep -c "\"type\": \"$t\"" .claude/skills/journalist-report/references/prompts/formatting.md)
  echo "$t: $count"
done
```
Expected: every type has count ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/formatting.md
git commit -m "docs(skill): add complete ContentBundle block-type examples to formatting.md"
```

---

## Task 5: Add ContentBundle schema reference to schemas.md

**Files:**
- Modify: `.claude/skills/journalist-report/references/schemas.md`

**Context for engineer:** `schemas.md` currently documents evidence-bundle, arc-analysis, and article-outline shapes. It does not document the ContentBundle shape, because the skill previously skipped that layer. We need to add a ContentBundle section so the subagent has a single place to find its output contract.

- [ ] **Step 1: Check the current structure**

Run: `grep -n "^##\|^# " .claude/skills/journalist-report/references/schemas.md`
Expected: a list of section headings. Note the position of the last top-level section.

- [ ] **Step 2: Append the ContentBundle section at the end of the file**

Append to `.claude/skills/journalist-report/references/schemas.md`:

```markdown

---

## ContentBundle (Phase 4 Output)

**Authoritative schema:** `lib/schemas/content-bundle.schema.json`

Always read the schema file directly before generating — this document is a
human-readable summary; the JSON schema is what `TemplateAssembler` validates
against.

**Top-level shape:**

```json
{
  "metadata": {
    "sessionId": "20251221",
    "theme": "journalist",
    "generatedAt": "2026-04-20T18:30:00.000Z",
    "version": "1.0.0",
    "storyDate": "2027-02-22"
  },
  "headline": {
    "main": "Required primary headline (10-200 chars)",
    "kicker": "Optional small text above",
    "deck": "Optional subheadline"
  },
  "byline": {
    "author": "Cassandra Nova",
    "title": "Senior Investigative Reporter",
    "location": "Fremont, CA",
    "date": "December 21, 2025"
  },
  "sections": [ /* see Section shape */ ],
  "pullQuotes": [ /* verbatim or crystallization */ ],
  "evidenceCards": [ /* sidebar + inline evidence */ ],
  "financialTracker": { "entries": [...], "totalExposed": "$4.06M" },
  "photos": [ /* inline photos */ ],
  "heroImage": { "filename": "...", "caption": "...", "characters": [...] }
}
```

**Section shape (`sections[]`):**

- `id` — unique section identifier (e.g., `"lede"`, `"the-story"`)
- `type` — one of `narrative`, `evidence-highlight`, `investigation-notes`, `conclusion`, `case-summary`
- `heading` — optional section heading
- `content[]` — array of content blocks, each one of:
  - `paragraph` — `{ type, text }`
  - `quote` — `{ type, text, attribution }`
  - `evidence-reference` — `{ type, tokenId, caption }`
  - `list` — `{ type, ordered, items[] }`
  - `photo` — `{ type, filename, caption, characters[] }`
  - `evidence-card` — `{ type, tokenId, headline, content, owner, significance }`

**Pull quote shape (`pullQuotes[]`):**

- `verbatim` — exact quote from evidence, requires `attribution` and `sourceTokenId`
- `crystallization` — journalist insight, `attribution` MUST be `null`

**Evidence card shape (`evidenceCards[]`):**

- Required: `tokenId`, `headline`
- Optional: `content` (full quotable text), `summary`, `owner`, `significance` (`critical`/`supporting`/`contextual`), `placement` (`sidebar`/`inline`)

**Validation:** `scripts/assemble-article.js` invokes `TemplateAssembler.assemble()`
which validates against the schema. Errors name the offending JSON path. Fix the
bundle and re-run the script.
```

- [ ] **Step 3: Verify the reference compiles**

Run: `grep -c "ContentBundle" .claude/skills/journalist-report/references/schemas.md`
Expected: count ≥ 3 (heading + body references).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/journalist-report/references/schemas.md
git commit -m "docs(skill): add ContentBundle schema reference"
```

---

## Task 6: Update reports/CLAUDE.md

**Files:**
- Modify: `reports/CLAUDE.md` (the existing "Journalist Skill (Direct Claude Code Usage)" section)

**Context for engineer:** The CLAUDE.md notes that the skill can be invoked directly. Add one line reflecting the new rendering path.

- [ ] **Step 1: Locate the "Journalist Skill" section**

Run: `grep -n "^## Journalist Skill" reports/CLAUDE.md`
Expected: single line number match.

- [ ] **Step 2: Append a rendering-path note**

Edit `reports/CLAUDE.md`. Inside the existing "Journalist Skill (Direct Claude Code Usage)" section, add a new line at the end of the section (before the next `##` heading):

```markdown

**Rendering:** Article generation emits a `ContentBundle` JSON and renders HTML via
`scripts/assemble-article.js`, which uses the shared `TemplateAssembler` (same as
the server pipeline). Output is structurally identical across both paths.
```

- [ ] **Step 3: Commit**

```bash
git add reports/CLAUDE.md
git commit -m "docs: note skill now uses shared TemplateAssembler rendering"
```

---

## Task 7: End-to-end verification

**Files:**
- No code changes. Manual verification only.

**Context for engineer:** The unit test for the assembly script covers the rendering contract. This task verifies the skill → pipeline alignment holds on a real session.

- [ ] **Step 1: Run the full existing Jest suite**

Run: `npm test`
Expected: all tests pass. The new `assemble-article.test.js` appears in the output. No pipeline tests regress (they don't import any of the files we touched).

- [ ] **Step 2: Pick a prior session with an existing pipeline-generated article**

Run: `ls reports/report2025*ALL*.html 2>&1 | head -5`
Note one (e.g., `reports/report20251221ALL15.html`) and its session ID (e.g., `20251221`).

- [ ] **Step 3: Regenerate via the skill path**

In Claude Code, invoke the `journalist-report` skill against the same session. Let it run Phases 1–5. When it finishes, it should produce:
- `data/{session-id}/output/content-bundle.json`
- `data/{session-id}/output/article.html`

- [ ] **Step 4: Compare structural markers against the pipeline-generated HTML**

Run:
```bash
node -e "
const fs = require('fs');
const cheerio = require('cheerio');
function shape(html) {
  const $ = cheerio.load(html);
  return {
    evidenceCards: $('.nn-evidence-card').length,
    photos: $('.nn-photo').length,
    pullQuotes: $('.nn-pullquote').length,
    financialRows: $('.nn-financial__row').length,
    sections: $('.nn-article section, article > section').length
  };
}
const old = shape(fs.readFileSync(process.argv[1], 'utf-8'));
const new_ = shape(fs.readFileSync(process.argv[2], 'utf-8'));
console.log('Pipeline:', old);
console.log('Skill:   ', new_);
" reports/report20251221ALL15.html data/20251221/output/article.html
```

Expected: the two objects have the same non-zero counts for `evidenceCards`, `photos`, `pullQuotes`, and `financialRows` (within ±1 if the LLM chose slightly different component counts — structural classes should be identical). If counts differ by a large margin or any are zero in the new output, investigate — it likely means the subagent produced a malformed bundle.

If `cheerio` is not installed, either `npm i -D cheerio` for this test or use a simpler grep: `grep -c 'nn-evidence-card' file.html` for each target class.

- [ ] **Step 5: Visual spot-check**

Open both HTML files in a browser. The skill output and pipeline output should look visually identical modulo the specific prose Opus wrote. Fonts, layout, sidebar, reading-progress bar, GA4 tag should all match.

- [ ] **Step 6: If verification passes, tag the alignment**

```bash
git tag skill-template-aligned
git push --tags
```

If verification fails, do NOT revert. File the diff, investigate the divergent component, and open a follow-up task. The most likely failure modes:
1. The subagent produced a ContentBundle that validates but omits sidebar data the pipeline includes (e.g., `financialTracker`) — fix the subagent prompt to always populate it from the outline's `followTheMoney` section.
2. Photo paths render wrong — confirm `sessionId` is being passed through to `assemble()` and the skill is placing photos in the expected `data/{session-id}/photos/` layout.

---

## Rollback Plan

If any task causes skill-path regressions that can't be fixed quickly:

```bash
git revert <commit-sha-of-task-2>  # subagent change
git revert <commit-sha-of-task-3>  # SKILL.md change
```

The script (Task 1), reference doc updates (Tasks 4, 5, 6), and pipeline code are all independently safe and do not need reverting. The pipeline path is untouched throughout.

---

## What's NOT in this plan (deliberate)

- **Deleting `assets/article.html`**: kept as prompt context for the pipeline's `ai-nodes.js:1173`. A future task can replace `promptBuilder.theme.loadTemplate()` with a schema reference and delete the file, but that touches pipeline code and tests and is out of scope here (you chose option 1).
- **Pipeline code changes**: none. `lib/template-assembler.js`, `lib/theme-loader.js`, `lib/workflow/**`, and all 43 graph nodes are untouched.
- **Detective theme**: the same alignment could apply, but the skill only currently ships journalist. If you add a detective skill path later, follow this same pattern.
- **CSS/JS deduplication**: `assets/css/*` and `assets/js/article.js` are already single-source (pipeline reads them via `theme-loader.loadStyles/loadScripts`). No fork exists there.
