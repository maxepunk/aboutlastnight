# Stage 2 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 18 conformance/design findings from the Stage-2 static audit (`audit/stage2/handoff.md`) so journalist-theme reports require minimal post-generation refinement — pushing correctness-critical work off the model into code/UI and repairing prompt rules that are contradictory, stale, or over-mandated.

**Architecture:** Edits span three loci. (1) **Shared prompt files** (`.claude/skills/journalist-report/references/prompts/*.md`) inherited by BOTH the console pipeline and the pure skill. (2) **Console/lib deterministic code** (`lib/`, `console/`, `templates/`). (3) **Skill path** (`.claude/skills/journalist-report/SKILL.md`, `.claude/agents/journalist-*.md`). The pipeline is already strong where deterministic; this plan adds the missing determinism (pronoun resolution) and fixes guidance.

**Tech Stack:** Node.js + Jest (lib code — TDD). React 18 via CDN/Babel (console UI — manual browser test, no harness per codebase convention). Handlebars (templates). Markdown (prompt/skill rule files — verified by re-read + director approval, not unit tests).

**Source of truth:** `audit/success-spec.md` + the project memory feedback notes. Grounding: `audit/stage2/grounding-map.md`. Diagnosis: `audit/stage2/handoff.md`.

**Director decisions baked in (2026-06-20):**
- **Voice/thesis rewrites (F2, F6, F7, F11)** are presented as full proposed replacement text under a **⚠️ DIRECTOR APPROVAL GATE** — approving this plan approves those drafts. Mechanical edits (F4 name swaps, F9 ban scoping, F12 default) are applied directly.
- **F1 pronoun pipeline** is implemented in full this session via a **parallel `rosterPronouns` map** (roster array stays `string[]` — zero lib-consumer churn).
- **F3 pull quotes:** DROP the mandate (set `minPullQuotes: 0`, soften guidance, route crystallization/verbatim moments to inline `quote` content blocks, which already render).

**Execution preconditions:**
1. Not on `main`. Create a branch (e.g. `stage2-remediation`) via `superpowers:using-git-worktrees` before Task 1. All commit steps below assume that branch.
2. Baseline green: run `npx jest` once and confirm a passing baseline before editing.

---

## File Structure

**Batch A — Console/lib code, config, templates (mechanical, TDD where testable):**
- Modify: `lib/theme-config.js` (F3 `minPullQuotes`, F9 token-ban scope)
- Modify: `lib/__tests__/theme-config.test.js` (F3/F9 assertions)
- Modify: `lib/prompt-builder.js` (F3 pull-quote instruction, F8 `<TEMPLATE>` embed, F9 guests, F12 default name)
- Modify: `lib/workflow/nodes/ai-nodes.js` (F8 `loadTemplate` cleanup)
- Modify: `lib/sdk-client/subagents.js` (F16 dead-code deletion)

**Batch B — Shared prompt files (by file; substantive = approval gate, names = mechanical):**
- Modify: `.claude/skills/journalist-report/references/prompts/character-voice.md` (F2, F6)
- Modify: `.claude/skills/journalist-report/references/prompts/writing-principles.md` (F2, F6, F11)
- Modify: `.claude/skills/journalist-report/references/prompts/section-rules.md` (F2, F6, F3-guidance)
- Modify: `.claude/skills/journalist-report/references/prompts/evidence-boundaries.md` (F2, F4)
- Modify: `.claude/skills/journalist-report/references/prompts/formatting.md` (F7, F4, F3-guidance)
- Modify: `.claude/skills/journalist-report/references/prompts/anti-patterns.md` (F4)
- Modify: `.claude/skills/journalist-report/references/prompts/narrative-structure.md` (F11, F17, F3-guidance)

**Batch C — F1 pronoun pipeline (capture → carry → assign → rule):**
- Modify: `console/components/checkpoints/AwaitRoster.js` (capture)
- Modify: `lib/workflow/state.js` (`rosterPronouns` annotation)
- Modify: `lib/workflow/nodes/checkpoint-nodes.js` (capture from resume)
- Modify: `lib/workflow/nodes/input-nodes.js` (stamp `sessionConfig.rosterPronouns`)
- Modify: `lib/prompt-builder.js` (`generateRosterSection` pronoun injection + 4 call sites)
- Modify: `.claude/skills/journalist-report/references/prompts/character-voice.md` (pronoun rule)
- Modify: `console/components/checkpoints/InputReview.js` (read-only display)
- Modify: `lib/__tests__/prompt-builder.test.js`, `__tests__/unit/workflow/state.test.js` (tests)

**Batch D — Skill path (F10 parity, F4 names, F12 default, F18 byline, F9 validator):**
- Modify: `.claude/skills/journalist-report/SKILL.md`
- Modify: `.claude/skills/journalist-report/references/schemas.md`
- Modify: `.claude/skills/journalist-report/references/voice-samples.md`
- Modify: `.claude/agents/journalist-evidence-curator.md`
- Modify: `.claude/agents/journalist-article-validator.md`

**Batch E — F5 financial adjustment classification (🔎 data-gated):**
- Modify: `lib/workflow/nodes/input-nodes.js` (parse classification)
- Modify: `.claude/skills/journalist-report/SKILL.md` (port deterministic override discipline)

**Batch F — P2 careful/verify (F13 NPCs behavioral, F14 paper gate, F15 metadata verify):**
- Modify: `lib/theme-config.js`, `lib/workflow/nodes/evaluator-nodes.js`, `lib/workflow/nodes/character-data-nodes.js` (F13)
- Modify: `lib/workflow/nodes/ai-nodes.js` (F14 paper relevance gate)
- Verify only: report git history (F15)

**Batches are independently executable.** Recommended order is A → B → C → D → E → F (mechanical momentum first, then voice, then the big pipeline, then skill parity, then data-gated, then careful P2).

---

# Batch A — Console/lib code, config, templates

### Task A1: F3 — Drop the pull-quote mandate (config + test)

**Files:**
- Modify: `lib/theme-config.js:91`
- Modify: `lib/__tests__/theme-config.test.js:238`

- [ ] **Step 1: Update the failing assertion first (TDD: change the spec)**

In `lib/__tests__/theme-config.test.js`, line 238 currently asserts:

```javascript
      expect(config.display.postGenValidation.minPullQuotes).toBe(2);
```

Change to:

```javascript
      expect(config.display.postGenValidation.minPullQuotes).toBe(0);
```

(Leave line 239 `minInlineEvidenceCards).toBe(3)` unchanged — inline evidence cards DO render and stay mandated.)

- [ ] **Step 2: Run the test to verify it now fails against current config**

Run: `npx jest lib/__tests__/theme-config.test.js -t "postGenValidation"`
Expected: FAIL — config still returns `2`.

- [ ] **Step 3: Set the journalist config to 0**

In `lib/theme-config.js`, line 91, change:

```javascript
        minPullQuotes: 2,
```

to:

```javascript
        minPullQuotes: 0,
```

(The enforcement at `ai-nodes.js:1239` is already guarded `if (minPullQuotes > 0 && ...)`, so `0` cleanly disables it. Leave the detective copy at `:151` as-is.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest lib/__tests__/theme-config.test.js -t "postGenValidation"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/theme-config.js lib/__tests__/theme-config.test.js
git commit -m "fix(journalist): drop minPullQuotes mandate (pull quotes render nowhere)"
```

---

### Task A2: F3 — Redirect pull-quote guidance to inline quote blocks (prompt-builder)

**Files:**
- Modify: `lib/prompt-builder.js:875-883`
- Modify: `lib/prompt-builder.js:968-973`

- [ ] **Step 1: Soften the VISUAL_COMPONENT_TYPES pull-quote requirement**

In `lib/prompt-builder.js`, lines 875-883 currently read:

```javascript
PULL QUOTES (2 types):
- VERBATIM: Exact quote from evidence WITH character attribution ("— Victoria Kingsley")
- CRYSTALLIZATION: Journalist insight, NO attribution (NEVER "— Nova")

MINIMUM REQUIREMENTS:
- At least 3 evidence-card blocks across sections (in sections[].content[], NOT just evidenceCards[])
- At least 2 pull quotes distributed across 2+ sections
- No two evidence-cards adjacent (separate with prose)
</VISUAL_COMPONENT_TYPES>
```

Replace with:

```javascript
CRYSTALLIZATION & VERBATIM MOMENTS:
- For a damning verbatim line from evidence, use an inline "quote" content block (type: "quote", with attribution) inside the relevant section — it renders in the article body.
- For a crystallizing journalist insight, use an inline "quote" content block with attribution omitted (no "— Nova").
- These are OPTIONAL. Use them where a line earns a pause, not to fill a quota.

MINIMUM REQUIREMENTS:
- At least 3 evidence-card blocks across sections (in sections[].content[], NOT just evidenceCards[])
- No two evidence-cards adjacent (separate with prose)
</VISUAL_COMPONENT_TYPES>
```

- [ ] **Step 2: Mark the top-level `pullQuotes` field optional**

In `lib/prompt-builder.js`, lines 968-973 currently read:

```javascript
3. "pullQuotes" - Featured quotes for sidebar (distribute across 2+ sections):
   - "type": EXACT lowercase "verbatim" or "crystallization" (do NOT use uppercase)
   - "text": The quote text
   - "attribution": Character name (string) for verbatim; null for crystallization
   - "sourceTokenId": Optional. For verbatim quotes only; the tokenId being quoted
   - "placement": EXACT one of "left" | "right" | "center" (default "right"). Do NOT use "sidebar" or "inline" here.
```

Replace with:

```javascript
3. "pullQuotes" - OPTIONAL legacy array; NOT rendered by the current template. Prefer inline "quote" content blocks (see VISUAL_COMPONENT_TYPES) for crystallization and verbatim moments. May be omitted entirely.
```

- [ ] **Step 3: Verify the prompt no longer mandates pull quotes**

Run: `npx jest lib/__tests__/prompt-builder.test.js`
Expected: PASS (no test asserts the removed "At least 2 pull quotes" string; if one does, update it to expect the inline-quote guidance).

Then confirm by grep:
Run: `grep -n "At least 2 pull quotes" lib/prompt-builder.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/prompt-builder.js
git commit -m "fix(journalist): route crystallization/verbatim to inline quote blocks; pull quotes optional"
```

---

### Task A3: F8 — Remove the stale `<TEMPLATE>` embed from generation prompts

**Files:**
- Modify: `lib/prompt-builder.js:635-637, 778-780`
- Modify: `lib/workflow/nodes/ai-nodes.js:1159-1163`

- [ ] **Step 1: Remove the two `<TEMPLATE>` embed blocks**

In `lib/prompt-builder.js`, delete the block at lines 635-637:

```javascript
<TEMPLATE>
${template}
</TEMPLATE>
```

and the identical block at lines 778-780. (The authoritative output contract is the embedded JSON schema; the legacy `assets/article.html` template is stale — `datetime="2027-02-22"`, "Black Market Ledger", no hero/evidence-card slots — and only misleads structure/labels.)

- [ ] **Step 2: Trace and remove the now-dead `template` threading**

Run: `grep -n "loadTemplate\|template" lib/workflow/nodes/ai-nodes.js | grep -i template`
Then in `lib/workflow/nodes/ai-nodes.js`, remove the `loadTemplate` call at lines 1159-1163:

```javascript
  // Load template for context (optional - article generation can proceed without it)
  const template = await promptBuilder.theme.loadTemplate().catch(err => {
    console.warn(`[generateContentBundle] Template load failed, proceeding without template context: ${err.message}`);
    return '';
  });
```

Then locate the `buildArticlePrompt(...)` call (around `ai-nodes.js:1193`) and remove the `template` argument it passes. Run `grep -n "buildArticlePrompt(\|buildOutlinePrompt(" lib/` and remove the now-unused `template` parameter from those method signatures in `prompt-builder.js` and any other call site (the outline prompt's `template` arg too). If a signature change is risky, leaving the parameter as an unused `_template` is acceptable — but the `<TEMPLATE>` embed itself MUST be gone.

- [ ] **Step 3: Verify the embed is gone and nothing broke**

Run: `grep -rn "<TEMPLATE>" lib/`
Expected: no output.
Run: `npx jest`
Expected: PASS (fix any test that asserted the template string was embedded).

- [ ] **Step 4: Commit**

```bash
git add lib/prompt-builder.js lib/workflow/nodes/ai-nodes.js
git commit -m "fix(journalist): remove stale legacy <TEMPLATE> embed from generation prompts"
```

---

### Task A4: F9 — Scope the `token` ban to bare "token"; drop residual `guests` bans

**Files:**
- Modify: `lib/theme-config.js:59`
- Modify: `lib/__tests__/theme-config.test.js` (token-term assertion ~`:142`)
- Modify: `lib/prompt-builder.js:98, 117, 1087`

- [ ] **Step 1: Find how `bannedPatterns` are applied (regex support)**

Run: `grep -rn "bannedPatterns\|isRegex\|caseSensitive" lib/ --include=*.js | grep -v __tests__ | grep -v theme-config.js`
Read the consumer (the voice/anti-pattern validator) to confirm it builds `new RegExp(pattern, caseSensitive ? '' : 'i')` when `isRegex` is set, and that bare-string patterns are matched case-insensitively. This confirms a lookbehind regex will work.

- [ ] **Step 2: Write a failing test for the scoped token ban**

In `lib/__tests__/theme-config.test.js`, locate the `token-term` test (~line 142) and replace/extend it so it asserts the SCOPED behavior. Add a test that applies the pattern:

```javascript
    it('token-term ban flags bare "token" but NOT "memory token"', () => {
      const rules = getThemeRules('journalist'); // use the existing accessor in this file
      const tokenTerm = rules.bannedPatterns.find(p => p.name === 'token-term');
      expect(tokenTerm).toBeDefined();
      expect(tokenTerm.isRegex).toBe(true);
      const re = new RegExp(tokenTerm.pattern, tokenTerm.caseSensitive ? '' : 'i');
      expect(re.test('they handed me a token')).toBe(true);   // bare token → flagged
      expect(re.test('her memory token surfaced')).toBe(false); // allowed phrase → not flagged
    });
```

(Match the file's existing helper for fetching rules — it already does `rules.bannedPatterns.find(...)` near line 137-146, so reuse that accessor.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest lib/__tests__/theme-config.test.js -t "token-term"`
Expected: FAIL — current pattern is the bare substring `'token'`, which matches "memory token".

- [ ] **Step 4: Scope the journalist token pattern**

In `lib/theme-config.js`, line 59, change:

```javascript
        { pattern: 'token', name: 'token-term', caseSensitive: false, description: 'Game mechanic terminology' },
```

to:

```javascript
        { pattern: '(?<!memory\\s)\\btokens?\\b', name: 'token-term', isRegex: true, caseSensitive: false, description: 'Bare "token" as a system label - use "memory token" or "extracted memory"' },
```

(Leave the detective copy at `:126` unchanged — detective is out of scope for this audit.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest lib/__tests__/theme-config.test.js -t "token-term"`
Expected: PASS.

- [ ] **Step 6: Remove the residual `guests` bans (journalist only)**

In `lib/prompt-builder.js`:
- Line 98 currently: `- NO game mechanics ("buried memories", "first-buried bonus", "guests")` → change to `- NO game mechanics ("buried memories", "first-buried bonus")` (drop `, "guests"`).
- Lines 117-118 currently:
  ```javascript
  - Transform: "guests" -> "people" or "those present" or "partygoers"
  - Sentence rhythm: Short punchy, then longer building, then short again`
  ```
  Delete the `Transform: "guests" ...` line (keep the `Sentence rhythm` line).
- Line 1087 currently: `- "guests" -> "people" or "those present" or "partygoers"` → delete this line from the revision checklist.

(Per commit `af572d5` "stop banning guests/transactions" and `[[feedback_aln_voice_survives_mechanics]]`. Leave the detective revision check at `:1158` alone.)

- [ ] **Step 7: Verify and run full suite**

Run: `grep -n '"guests"' lib/prompt-builder.js`
Expected: only the detective-path reference (~`:1158`) remains, if any.
Run: `npx jest`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/theme-config.js lib/__tests__/theme-config.test.js lib/prompt-builder.js
git commit -m "fix(journalist): scope token ban to bare 'token'; stop banning 'guests'"
```

---

### Task A5: F12 — Single-source the default reporter name (in-file dedup)

**Files:**
- Modify: `lib/prompt-builder.js` (top-of-file const + `:1036`, `:1244`)

- [ ] **Step 1: Add a module constant near the top of `lib/prompt-builder.js`**

After the existing top-of-file `require`/const declarations, add:

```javascript
// Default reporter first name when the director provides none. The pipeline's
// authoritative stamp is input-nodes.js (parseRawInput); this fallback only
// covers PromptBuilder instances constructed without that stamp (e.g. tests, skill).
const DEFAULT_JOURNALIST_FIRST_NAME = 'Cassandra';
```

- [ ] **Step 2: Use the constant at both fallback sites**

Line 1036 currently:
```javascript
   - "author": "${this.sessionConfig.journalistFirstName || 'Cassandra'} Nova | NovaNews"
```
Change the literal to the constant:
```javascript
   - "author": "${this.sessionConfig.journalistFirstName || DEFAULT_JOURNALIST_FIRST_NAME} Nova | NovaNews"
```

Line 1244 currently:
```javascript
      JOURNALIST_FIRST_NAME: this.sessionConfig.journalistFirstName || 'Cassandra',
```
Change to:
```javascript
      JOURNALIST_FIRST_NAME: this.sessionConfig.journalistFirstName || DEFAULT_JOURNALIST_FIRST_NAME,
```

- [ ] **Step 3: Verify**

Run: `grep -n "'Cassandra'" lib/prompt-builder.js`
Expected: no output (only the single const definition uses the literal now).
Run: `npx jest lib/__tests__/prompt-builder.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/prompt-builder.js
git commit -m "refactor(journalist): single-source default reporter name in prompt-builder"
```

---

### Task A6: F16 — Delete dead `subagents.js` specialist code

**Files:**
- Modify: `lib/sdk-client/subagents.js` (delete `getSpecialistAgents` + orchestrator/synthesis prompt constants)

- [ ] **Step 1: Confirm zero references**

Run: `grep -rn "getSpecialistAgents\|ORCHESTRATOR_SYSTEM_PROMPT\|SYNTHESIS_SYSTEM_PROMPT\|SPECIALIST_OUTPUT_SCHEMAS" lib/ --include=*.js`
Expected: only comments and the dead definitions themselves (no `require`, no invocation). The `module.exports` block (`:1000-1028`) already documents these as removed legacy exports.

- [ ] **Step 2: Delete the dead function and prompt constants**

In `lib/sdk-client/subagents.js`, delete the `getSpecialistAgents` function (starts `:62`) and the orchestrator/synthesis prompt-string constants and schemas that are not exported (the ranges flagged in the audit: roughly `:62-284` and `:292-456` — delete only definitions confirmed unreferenced in Step 1). Preserve `CORE_ARC_*`, `INTERWEAVING_*`, `PLAYER_FOCUS_GUIDED_*`, `normalizePath`, and the `module.exports` block.

- [ ] **Step 3: Verify nothing broke**

Run: `node -e "require('./lib/sdk-client/subagents.js'); console.log('loads ok')"`
Expected: `loads ok`.
Run: `npx jest`
Expected: PASS (arc-specialist tests use the retained split-call exports).

- [ ] **Step 4: Commit**

```bash
git add lib/sdk-client/subagents.js
git commit -m "chore: delete dead getSpecialistAgents + orchestrator/synthesis prompts (unreferenced)"
```

---

# Batch B — Shared prompt files

> **⚠️ The substantive reframes below (F2, F6, F7, F11) are the DIRECTOR APPROVAL GATE.** Approving this plan approves the proposed text. F4 name swaps and F17 are mechanical (applied directly). Each prompt file is one task so edits to the same file never conflict.
>
> **Verification for every Batch B task:** after editing, re-read the changed sections and grep that the old phrasing is gone; run `npx jest lib/__tests__/theme-loader.test.js` (confirms prompt files still load). No unit test asserts prose content.

### Task B1: `character-voice.md` — F2 attribution + F6 thesis

**Files:** Modify `.claude/skills/journalist-report/references/prompts/character-voice.md`

- [ ] **Step 1: F6 — Reframe "The Dual Story" (lines 25-33) ⚠️ APPROVAL GATE**

Replace the block currently at lines 25-33 (`## The Dual Story` … `The systemic critique is what they'll remember.`) with:

```markdown
## The Story and Its Larger Resonance

The reporter is always chasing ONE bespoke story: the gap between what this room concluded and what the full record actually implies. That gap — this session's specific tension between the verdict and the evidence — is the organizing thesis. Find it first.

**The Hook:** Who killed Marcus Blackwood? What happened at that party?

**The Resonance:** When the session's evidence supports it, the specific story opens onto a larger one: what happens when a company treats human experience as a commodity, harvesting clicks, then conversations, then memories themselves. This systemic critique is a LENS that deepens the bespoke gap, not a second story bolted onto every paragraph. Reach for it when THIS session's evidence earns it; let it recede when the session's gap lies elsewhere.

The murder mystery pulls readers in. The session-specific gap is what the article is actually about. The systemic resonance is what makes it land.
```

- [ ] **Step 2: F2 — Reframe "Celebrating Her Sources" (lines 47-51) ⚠️ APPROVAL GATE**

Replace the block currently at lines 47-51 (`## Celebrating Her Sources` … `without shaming those who made different choices.`) with:

```markdown
## Celebrating the Choice to Expose

The people who chose to expose memories rather than bury them are the reporter's heroes. They had every reason to take the money. To protect themselves. To let the system win. Instead, they brought evidence to light.

**Celebrate the choice; attribute with care.** Nova honors the act of exposure and the courage it took to choose the record over the payout. But exposure is anonymous by default: she names a specific person as the exposer ONLY when director notes or the public record show they openly took credit. Otherwise she celebrates the choice without naming who made it, and she never assumes a memory's owner is the one who exposed it. Acknowledge bravery without shaming those who made different choices.
```

- [ ] **Step 3: Verify and commit**

Run: `grep -n "Dual Story\|Celebrating Her Sources" .claude/skills/journalist-report/references/prompts/character-voice.md`
Expected: no output.
Run: `npx jest lib/__tests__/theme-loader.test.js` → PASS.

```bash
git add .claude/skills/journalist-report/references/prompts/character-voice.md
git commit -m "fix(prompts): bespoke-gap thesis + anonymous-by-default exposure in character-voice"
```

---

### Task B2: `writing-principles.md` — F2 + F6 + F11

**Files:** Modify `.claude/skills/journalist-report/references/prompts/writing-principles.md`

- [ ] **Step 1: F11 — Reframe "Temporal Discipline" to four stages (lines 3-8) ⚠️ APPROVAL GATE**

Replace the block currently at lines 3-8 (`## Temporal Discipline` … `Never conflate them.`) with:

```markdown
## Temporal Discipline

The system prompt contains the authoritative stage framework: THE PARTY (last night) -> THE INVESTIGATION (this morning) -> THE DELIBERATION (this morning, when the room settled on its verdict) -> THE ARTICLE (now). Evidence items carry a `temporalContext` field (PARTY/INVESTIGATION/BACKGROUND) that reinforces this at the data level.

Key principle: Memory CONTENT describes party events from last night (Nova was not there). Director observations describe this-morning events: the investigation and the deliberation (Nova was there). The verdict is a deliberation outcome, and it may diverge from what the record implies; that gap is the article's spine. Never conflate the party with this morning.
```

- [ ] **Step 2: F6 — Reframe "Every Section Serves Both Stories" (lines 34-48) ⚠️ APPROVAL GATE**

Replace the header and lead at lines 34-41 (`## Every Section Serves Both Stories` … `surveillance capitalism becomes" theme`) with:

```markdown
## Every Section Serves the Bespoke Gap

The organizing thesis is THIS session's gap: what the room concluded vs. what the record implies. Every section examines that gap from a different angle (see `<section-rules>` for the per-section questions), never restating it.

Each piece of evidence should:
1. Advance the "what happened that night" question
2. Sharpen the session's specific gap, and where the evidence supports it, connect to the larger pattern (a company turning human experience into inventory). Use the systemic lens when it deepens THIS gap; do not force it into every paragraph.
```

(Keep the existing code example at lines 42-48 — it illustrates the systemic lens — but it now reads as an example of the optional lens, not a mandate.)

- [ ] **Step 3: F2 — Fix the attribution lines in "Everyone Gets Named" (lines 98-99) ⚠️ APPROVAL GATE**

Lines 98-99 currently:

```markdown
- Who exposed which memories (from exposed evidence list)
- Who buried which memories (from buried evidence list)
```

Replace with:

```markdown
- Whose memories were exposed (name the OWNER; the exposed-evidence list identifies owners, not who chose to expose)
- Which characters are connected to buried threads (by topic and account patterns only, never claiming who buried what)
```

(The second line also closes a Layer-2 boundary leak — Nova cannot know who buried which memory.)

- [ ] **Step 4: Verify and commit**

Run: `grep -n "two-timeline\|Both Stories\|Who exposed which memories\|Who buried which memories" .claude/skills/journalist-report/references/prompts/writing-principles.md`
Expected: no output.

```bash
git add .claude/skills/journalist-report/references/prompts/writing-principles.md
git commit -m "fix(prompts): four-stage timeline, bespoke-gap thesis, attribution boundary in writing-principles"
```

---

### Task B3: `section-rules.md` — F2 + F6 + F3 guidance

**Files:** Modify `.claude/skills/journalist-report/references/prompts/section-rules.md`

- [ ] **Step 1: F2 — Fix THE STORY attribution bullet (line 130) ⚠️ APPROVAL GATE**

Line 130 currently:

```markdown
- Name characters who exposed evidence (celebrate sources)
```

Replace with:

```markdown
- Name the OWNER of each memory (whose experience it records). Treat who EXPOSED it as anonymous by default; credit an exposer by name only when director notes or the record show they took credit. Never assume the owner exposed their own memory.
```

- [ ] **Step 2: F6 — Fix CLOSING content bullets (lines 497-500) ⚠️ APPROVAL GATE**

The CLOSING `**Content:**` list (lines 497-500) currently:

```markdown
- Connect back to dual story (murder resolved? + system exposed)
- The surveillance capitalism thread made explicit
- What this case represents beyond itself
- End on the reporter's voice, not neutral summary
```

Replace with:

```markdown
- Land the session's bespoke gap: the tension between the room's verdict and what the record implies
- Make the larger resonance explicit ONLY through THIS session's specifics (the systemic pattern this particular evidence exposed), never a generic surveillance-capitalism statement
- What this case represents beyond itself, grounded in what this room actually did
- End on the reporter's voice, not neutral summary
```

(This reinforces the existing rule at `:515` "NEVER USE generic surveillance capitalism framing … must be unreusable.")

- [ ] **Step 3: F3 — Soften pull-quote references to inline quote blocks (mechanical)**

In THE PLAYERS section, the pull-quote guidance (around `:357-381`, "Pull quotes for particularly impactful choices (1-2 MAX)" and the Pull Quote Standards table) should be reframed to inline `quote` content blocks. Change the `**Visual Components:**` bullet under THE PLAYERS from:

```markdown
- **Pull quotes** for particularly impactful choices (1-2 MAX)
```

to:

```markdown
- **Inline quote blocks** for particularly impactful choices (optional; use a `quote` content block with attribution)
```

In WHAT'S MISSING, the "Pull Quote (if used)" crystallization note (around `:475-480`) — change "Pull Quote" to "Inline quote block (crystallization, no attribution)". The guidance content stays; only the mechanism changes from the unrendered `pullQuotes[]` array to inline `quote` blocks.

- [ ] **Step 4: F6 — Update the Global Rules cross-reference (line 558)**

Line 558 currently:

```markdown
- Systemic critique woven throughout (lines 182-197)
```

Replace with:

```markdown
- Bespoke gap (verdict vs. record) threaded through every section as a different angle, never restated
```

- [ ] **Step 5: Verify and commit**

Run: `grep -n "celebrate sources\|dual story\|surveillance capitalism thread made explicit" .claude/skills/journalist-report/references/prompts/section-rules.md`
Expected: no output.

```bash
git add .claude/skills/journalist-report/references/prompts/section-rules.md
git commit -m "fix(prompts): attribution rule, bespoke-gap closing, inline-quote routing in section-rules"
```

---

### Task B4: `evidence-boundaries.md` — F2 attribution + F4 name

**Files:** Modify `.claude/skills/journalist-report/references/prompts/evidence-boundaries.md`

- [ ] **Step 1: F2 — Fix the Layer-1 exposer rule (lines 13-14) ⚠️ APPROVAL GATE**

Lines 13-14 currently:

```markdown
- CAN name WHOSE memory it is (the owner - whose experience is recorded)
- CANNOT name who exposed it (Nova keeps her sources confidential)
```

Replace with:

```markdown
- CAN name WHOSE memory it is (the owner - whose experience is recorded)
- Treats WHO chose to expose it as ANONYMOUS BY DEFAULT. Name an exposer only when director notes or the public record show that person openly took credit. Never assume the owner exposed their own memory - the exposer is often not the owner.
```

- [ ] **Step 2: F2 — Fix "What Makes Exposed Evidence Usable" (line 30) ⚠️ APPROVAL GATE**

Line 30 currently:

```markdown
- Nova protects her sources - never reveal WHO exposed evidence
```

Replace with:

```markdown
- Exposure is anonymous by default - Nova names an exposer only when that person openly took credit (per director notes or public record). She never guesses, and never assumes the owner exposed it.
```

- [ ] **Step 3: F2 — Make the Quick-Reference row conditional (line 252) ⚠️ APPROVAL GATE**

Line 252 currently:

```markdown
| "Remi exposed the cease and desist letter" | 1 | YES - attribution + content |
```

Replace with:

```markdown
| "Remi's cease and desist letter" (owner attribution) | 1 | YES - name the owner + quote content |
| "Remi exposed the cease and desist letter" (exposer credit) | 1 | ONLY if Remi publicly took credit (director notes / record) |
```

- [ ] **Step 4: F4 — De-hardcode the reporter name (line 166)**

Line 166 currently references the configurable first name as a literal:

```markdown
3. **The Whiteboard** (what Cassandra documented during investigation) - SUPPORTING CONTEXT
```

Replace with:

```markdown
3. **The Whiteboard** (what was documented during the investigation) - SUPPORTING CONTEXT
```

- [ ] **Step 5: Verify and commit**

Run: `grep -n "CANNOT name who exposed\|never reveal WHO exposed\|Cassandra" .claude/skills/journalist-report/references/prompts/evidence-boundaries.md`
Expected: no output.

```bash
git add .claude/skills/journalist-report/references/prompts/evidence-boundaries.md
git commit -m "fix(prompts): anonymous-by-default exposure rule + de-hardcode reporter name in evidence-boundaries"
```

---

### Task B5: `formatting.md` — F7 headlines + F4 names + F3 guidance

**Files:** Modify `.claude/skills/journalist-report/references/prompts/formatting.md`

- [ ] **Step 1: F7 — Rewrite Headline Rules (lines 193-208) ⚠️ APPROVAL GATE**

Replace the block at lines 193-208 (`## Headline Rules` through the bad-headlines list) with:

```markdown
## Headline Rules

If the director doesn't provide a headline, generate one that does real journalism work:
- **Names names.** Use proper nouns from THIS session: the victim, the accused, NeurAI, a specific shell account or dollar figure. No abstractions.
- **Active verb.** Something happened; say what, in the active voice.
- **Specific stakes.** Point at the concrete consequence this session exposed, not a generic theme.
- **Genre signal.** It should read as investigative journalism, a headline a tech-accountability outlet would actually run, not a tagline or a poem.
- Avoid clickbait, all-caps, and thesis-fragment poetry. Do not reuse a previous session's headline shape.

The examples below are illustrative SHAPES (proper noun + active verb + specific stake). Fill them with THIS session's real names and numbers.

**Good headlines:**
- "Marcus Blackwood Is Dead. The Room Blamed Vic Kingsley. The Money Says Otherwise."
- "Six Shell Accounts, $4.1 Million, and the Memories NeurAI Paid to Bury"
- "The Night Alex Reeves Lost His Algorithm and Marcus Blackwood Lost His Life"

**Bad headlines:**
- "Murder at Tech Company" (no names, no stakes)
- "SHOCKING: CEO Found Dead!" (clickbait, all-caps)
- "An Investigation into Recent Events" (generic, no genre signal)
- "The Party That Stole Your Mind" (thesis-fragment poetry: no proper nouns, no event)
- "What NeurAI Doesn't Want You to Remember" (tagline, not a headline)
```

- [ ] **Step 2: F4 — Fix "Vic Chase" → "Vic Kingsley" (lines 87, 143, 153)**

Three example JSON blocks use the non-canonical owner `"Vic Chase"` (lines 87, 143, 153). The canonical name per `anti-patterns.md:94` is **Vic Kingsley**. Replace each `"owner": "Vic Chase"` / `"attribution": "Vic Chase"` with the `Kingsley` form:

Line 87: `"owner": "Vic Chase"` → `"owner": "Vic Kingsley"`
Line 143: `"attribution": "Vic Chase"` → `"attribution": "Vic Kingsley"`
Line 153: `"owner": "Vic Chase"` → `"owner": "Vic Kingsley"`

(Use Edit with `replace_all` is unsafe here since the surrounding JSON differs — do them as three targeted edits, or one `replace_all` on the exact substring `Vic Chase` → `Vic Kingsley` since all three should change identically.)

- [ ] **Step 3: F3 — Update the Pull Quote component guidance (lines 41-49, 67)**

The "Pull Quote" component description (lines 41-49) and the Component Frequency row "Pull Quotes | Inline | 2-3 for crystallization moments" (line 67) should point to inline `quote` content blocks. Change the line-67 row to:

```markdown
| Inline Quotes | Inline | Optional; `quote` blocks for crystallization or verbatim moments |
```

and adjust the line 42-45 Pull Quote "When to use" note to: "Use an inline `quote` content block (renders in the article body). Optional; no minimum."

- [ ] **Step 4: Verify and commit**

Run: `grep -n "Vic Chase\|The Party That Stole Your Mind" .claude/skills/journalist-report/references/prompts/formatting.md`
Expected: no output (the "Party That Stole Your Mind" now appears only inside the bad-headline example — confirm it is labeled as BAD, which is intended).

```bash
git add .claude/skills/journalist-report/references/prompts/formatting.md
git commit -m "fix(prompts): journalism-craft headlines, canonical Vic Kingsley, inline-quote guidance in formatting"
```

---

### Task B6: `anti-patterns.md` — F4 retired-name example

**Files:** Modify `.claude/skills/journalist-report/references/prompts/anti-patterns.md`

- [ ] **Step 1: F4 — Replace the uncertain "Tori" example (line 260)**

Line 260 currently:

```markdown
Kai was there. Tori was there. They held their cards close.
```

Replace with two unambiguously-canonical first names already used elsewhere in the prompt corpus:

```markdown
Kai was there. Sam was there. They held their cards close.
```

(`Kai` and `Sam` both appear as canonical examples in `evidence-boundaries.md`. "Tori" is a retired/uncertain name and should not anchor a model-good example.)

- [ ] **Step 2: Verify and commit**

Run: `grep -n "Tori" .claude/skills/journalist-report/references/prompts/anti-patterns.md`
Expected: no output.

```bash
git add .claude/skills/journalist-report/references/prompts/anti-patterns.md
git commit -m "fix(prompts): replace retired-name example in anti-patterns"
```

---

### Task B7: `narrative-structure.md` — F11 timeline + F17 cross-theme + F3 guidance

**Files:** Modify `.claude/skills/journalist-report/references/prompts/narrative-structure.md`

- [ ] **Step 1: F17 — Restate the cross-theme reference self-contained (line 48)**

Line 48 currently:

```markdown
Apply the same 80%/enrichment pattern from the detective report system:
```

Replace with:

```markdown
Apply an 80%/enrichment weighting:
```

- [ ] **Step 2: F11 — Update "Temporal Awareness" to the stage framework (lines 30-32) ⚠️ APPROVAL GATE**

Lines 30-32 currently:

```markdown
**Temporal Awareness:**

See the system prompt's CRITICAL TEMPORAL RULE for the two-timeline framework. Evidence items carry `temporalContext` fields that reinforce timeline boundaries at the data level.
```

Replace with:

```markdown
**Temporal Awareness:**

See the system prompt's CRITICAL TEMPORAL RULE for the four-stage framework (party -> investigation -> deliberation -> article). Evidence items carry `temporalContext` fields that reinforce these boundaries at the data level. The verdict emerges in the deliberation stage and may diverge from what the record implies.
```

- [ ] **Step 3: F11 — Add a Deliberation row to the Narrative Moment table (lines 19-24) ⚠️ APPROVAL GATE**

After the "Final rush" row (line 23) in the `| Narrative Moment | How to Identify | Article Treatment |` table, add:

```markdown
| The room decides | Players weigh evidence and vote | The verdict forms - note where it diverges from the record |
```

- [ ] **Step 4: F3 — Pull Quotes section (lines 201-227) → inline quote blocks (mechanical)**

The "Pull Quotes: Crystallization Points" subsection and the Section Appropriateness table's "Pull Quotes" column reference the unrendered `pullQuotes[]` device. Add a one-line note at the top of the "Pull Quotes: Crystallization Points" block (after line 201):

```markdown
> **Rendering note:** Emit these as inline `quote` content blocks inside the section (they render in the article body). The legacy top-level `pullQuotes[]` array is not rendered.
```

(Leave the craft guidance — verbatim vs crystallization, the WRONG/CORRECT examples — intact; only the emission mechanism changes.)

- [ ] **Step 5: Verify and commit**

Run: `grep -n "two-timeline\|from the detective report system" .claude/skills/journalist-report/references/prompts/narrative-structure.md`
Expected: no output.

```bash
git add .claude/skills/journalist-report/references/prompts/narrative-structure.md
git commit -m "fix(prompts): four-stage timeline + deliberation beat, self-contained weighting, inline-quote note"
```

---

# Batch C — F1 Pronoun Pipeline (capture → carry → assign → rule)

> **Design:** roster stays `string[]` everywhere; pronouns travel in a NEW parallel `rosterPronouns` map keyed by first name (`{ "Vic": "they/them", ... }`), default `they/them`. This touches the capture UI, state, the await-roster checkpoint, the input stamp, and the prompt roster block — and ZERO of the ~13 lib roster consumers (verified: they call `.toLowerCase()`/`.join()` on `string[]` elements).

### Task C1: F1 — `resolvePronouns` helper + roster-block injection (TDD)

**Files:**
- Modify: `lib/prompt-builder.js` (`generateRosterSection` + 4 call sites + export)
- Modify: `lib/__tests__/prompt-builder.test.js`

- [ ] **Step 1: Write the failing test**

In `lib/__tests__/prompt-builder.test.js`, inside the existing `describe('generateRosterSection (Notion-derived)', ...)` block (around `:1064`), add:

```javascript
    it('appends pronouns from rosterPronouns, defaulting to they/them', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley', Sam: 'Sam Rivera' };
      const pronouns = { Vic: 'she/her' }; // Sam omitted -> default
      const result = generateRosterSection('journalist', canonical, null, pronouns);
      expect(result).toContain('Vic Kingsley (she/her)');
      expect(result).toContain('Sam Rivera (they/them)');
    });

    it('defaults all to they/them when no pronoun map is given', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley' };
      const result = generateRosterSection('journalist', canonical);
      expect(result).toContain('Vic Kingsley (they/them)');
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -t "pronouns"`
Expected: FAIL — `generateRosterSection` takes only 3 params and emits no pronouns.

- [ ] **Step 3: Add a 4th param + pronoun resolution to `generateRosterSection`**

In `lib/prompt-builder.js`, change the signature (line 22) and the roster-line mapping (lines 25-27). Current:

```javascript
function generateRosterSection(theme = 'journalist', canonicalCharacters = null, characterData = null) {
  const characters = canonicalCharacters || {};

  const lines = Object.entries(characters)
    .map(([first, full]) => `- ${first} → ${full}`)
    .join('\n');
```

Replace with:

```javascript
function generateRosterSection(theme = 'journalist', canonicalCharacters = null, characterData = null, rosterPronouns = null) {
  const characters = canonicalCharacters || {};
  const pronounMap = rosterPronouns || {};

  // Case-insensitive pronoun lookup by first name; default they/them.
  const resolvePronouns = (first) => {
    if (pronounMap[first]) return pronounMap[first];
    const key = Object.keys(pronounMap).find(k => k.toLowerCase() === String(first).toLowerCase());
    return key ? pronounMap[key] : 'they/them';
  };

  const lines = Object.entries(characters)
    .map(([first, full]) => `- ${first} → ${full} (${resolvePronouns(first)})`)
    .join('\n');
```

- [ ] **Step 4: Update the 4 call sites to pass `this.sessionConfig.rosterPronouns`**

In `lib/prompt-builder.js`, the four call sites (lines 591, 645, 788, 1077) currently read:

```javascript
${generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData)}
```

Change each to:

```javascript
${generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData, this.sessionConfig?.rosterPronouns)}
```

(`generateRosterSection` is already exported at `:1274`; no export change needed.)

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js`
Expected: PASS (new pronoun tests + existing tests; the existing `generateRosterSection` tests will now see `(they/them)` appended — update any exact-string assertion that breaks to tolerate the suffix).

- [ ] **Step 6: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "feat(journalist): inject roster pronouns into prompt roster block (default they/them)"
```

---

### Task C2: F1 — `rosterPronouns` state channel (TDD)

**Files:**
- Modify: `lib/workflow/state.js` (annotation + `getDefaultState`)
- Modify: `__tests__/unit/workflow/state.test.js`

- [ ] **Step 1: Write the failing test**

In `__tests__/unit/workflow/state.test.js`, add a test asserting the default state includes `rosterPronouns: null` (match the file's existing default-state test style):

```javascript
  it('getDefaultState includes rosterPronouns defaulting to null', () => {
    const { getDefaultState } = require('../../../lib/workflow/state');
    expect(getDefaultState().rosterPronouns).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/unit/workflow/state.test.js -t "rosterPronouns"`
Expected: FAIL — field does not exist.

- [ ] **Step 3: Add the annotation**

In `lib/workflow/state.js`, immediately after the `roster` annotation (ends line 199), add:

```javascript

  /**
   * Per-character pronouns provided alongside the roster (F1)
   * Map of first name -> pronoun string, e.g. { 'Vic': 'she/her' }
   * Parallel to roster (which stays string[]); default they/them resolved at prompt time.
   * Set by checkpointAwaitRoster, carried into sessionConfig.rosterPronouns by parseRawInput.
   */
  rosterPronouns: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),
```

- [ ] **Step 4: Add to `getDefaultState`**

In the `getDefaultState` return object, immediately after `roster: null,` (line 675), add:

```javascript
    rosterPronouns: null,
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest __tests__/unit/workflow/state.test.js`
Expected: PASS. (The self-test `console.log` "Should be 53" comments are cosmetic — no assertion — so adding a field is safe.)

- [ ] **Step 6: Commit**

```bash
git add lib/workflow/state.js __tests__/unit/workflow/state.test.js
git commit -m "feat(state): add rosterPronouns channel (parallel to roster)"
```

---

### Task C3: F1 — Capture pronouns at the await-roster checkpoint

**Files:**
- Modify: `lib/workflow/nodes/checkpoint-nodes.js:166-172`

- [ ] **Step 1: Capture `rosterPronouns` from the resume value**

In `lib/workflow/nodes/checkpoint-nodes.js`, the `checkpointAwaitRoster` resume block (lines 166-172) currently:

```javascript
  if (resumeValue?.roster && !skipCondition) {
    console.log(`[checkpointAwaitRoster] Captured roster from resume: ${resumeValue.roster.length} characters`);
    return {
      roster: resumeValue.roster,
      currentPhase: PHASES.AWAIT_ROSTER
    };
  }
```

Replace with:

```javascript
  if (resumeValue?.roster && !skipCondition) {
    console.log(`[checkpointAwaitRoster] Captured roster from resume: ${resumeValue.roster.length} characters`);
    return {
      roster: resumeValue.roster,
      rosterPronouns: resumeValue.rosterPronouns || {},
      currentPhase: PHASES.AWAIT_ROSTER
    };
  }
```

- [ ] **Step 2: Verify the node still loads / tests pass**

Run: `npx jest __tests__/unit/workflow/checkpoint-nodes.test.js`
Expected: PASS (add/adjust an assertion if the test snapshots the await-roster return shape).

- [ ] **Step 3: Commit**

```bash
git add lib/workflow/nodes/checkpoint-nodes.js
git commit -m "feat(checkpoint): capture rosterPronouns from await-roster resume value"
```

---

### Task C4: F1 — Stamp `sessionConfig.rosterPronouns` in parseRawInput

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js:425-428`

- [ ] **Step 1: Stamp the field alongside the other session-config stamps**

In `lib/workflow/nodes/input-nodes.js`, the Step-1 stamping block (lines 425-428) currently:

```javascript
    result.journalistFirstName = rawInput.journalistFirstName || 'Cassandra';
    result.reportingMode = rawInput.reportingMode || 'on-site';
    result.guestReporter = rawInput.guestReporter || null;
    result.createdAt = new Date().toISOString();
```

Insert one line so it reads:

```javascript
    result.journalistFirstName = rawInput.journalistFirstName || 'Cassandra';
    result.reportingMode = rawInput.reportingMode || 'on-site';
    result.guestReporter = rawInput.guestReporter || null;
    result.rosterPronouns = state.rosterPronouns || rawInput.rosterPronouns || {};
    result.createdAt = new Date().toISOString();
```

(`state` is in scope in `parseRawInput` — it is already read at `:392` for `state.roster`. This makes `sessionConfig.rosterPronouns` available to PromptBuilder, which reads `this.sessionConfig.rosterPronouns` per Task C1 Step 4.)

- [ ] **Step 2: Verify**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js`
Expected: PASS (the SDK schema is unchanged — `rosterPronouns` is stamped post-parse like `journalistFirstName`, so no SESSION_CONFIG_SCHEMA edit is needed).

- [ ] **Step 3: Commit**

```bash
git add lib/workflow/nodes/input-nodes.js
git commit -m "feat(input): carry rosterPronouns into sessionConfig"
```

---

### Task C5: F1 — Capture pronouns in the AwaitRoster UI

**Files:**
- Modify: `console/components/checkpoints/AwaitRoster.js`

- [ ] **Step 1: Rewrite the component to capture per-name pronouns**

Replace the body of `console/components/checkpoints/AwaitRoster.js` (keep the file header comment and the `window.Console` registration). The change: `tags` become `[{ name, pronouns }]`; each chip shows a pronoun `<select>` (default `they/them`); `handleSubmit` emits `{ roster: string[], rosterPronouns: {name: pronouns} }`.

Replace the function (lines 12-166, `function AwaitRoster(...)` through its closing `}`) with:

```javascript
function AwaitRoster({ data, onApprove }) {
  const rawAnalyses = data && data.genericPhotoAnalyses;
  const genericPhotoAnalyses = Array.isArray(rawAnalyses) ? rawAnalyses : (rawAnalyses && rawAnalyses.analyses) || [];
  const whiteboardPhotoPath = (data && data.whiteboardPhotoPath) || null;

  const PRONOUN_OPTIONS = ['they/them', 'she/her', 'he/him'];

  // Each tag: { name, pronouns }. Roster stays string[]; pronouns travel separately.
  const [tags, setTags] = React.useState([]);
  const [inputValue, setInputValue] = React.useState('');

  function addTag(raw) {
    const name = raw.trim();
    if (!name) return;
    setTags(function (prev) {
      const exists = prev.some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); });
      if (exists) return prev;
      return prev.concat([{ name: name, pronouns: 'they/them' }]);
    });
    setInputValue('');
  }

  function removeTag(index) {
    setTags(function (prev) { return prev.filter(function (_, i) { return i !== index; }); });
  }

  function setPronouns(index, pronouns) {
    setTags(function (prev) {
      return prev.map(function (t, i) { return i === index ? { name: t.name, pronouns: pronouns } : t; });
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    }
    if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  function handleChange(e) {
    const val = e.target.value;
    if (val.includes(',')) {
      const parts = val.split(',');
      parts.forEach(function (part, i) { if (i < parts.length - 1) { addTag(part); } });
      setInputValue(parts[parts.length - 1]);
    } else {
      setInputValue(val);
    }
  }

  function buildPayload(allTags) {
    const roster = allTags.map(function (t) { return t.name; });
    const rosterPronouns = {};
    allTags.forEach(function (t) { rosterPronouns[t.name] = t.pronouns; });
    return { roster: roster, rosterPronouns: rosterPronouns };
  }

  function handleSubmit() {
    const finalTags = inputValue.trim()
      ? tags.concat([{ name: inputValue.trim(), pronouns: 'they/them' }])
      : tags;
    onApprove(buildPayload(finalTags));
  }

  const previewAnalyses = genericPhotoAnalyses.slice(0, 3);

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Why Roster Is Needed'),
      React.createElement('p', { className: 'text-sm text-secondary' },
        'The roster maps real player names to character identities and sets each character’s pronouns (the universe is gender-neutral; the roster is the authority). This drives article references and prevents pronoun errors.'
      )
    ),

    previewAnalyses.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' },
        'Photo Analyses (' + genericPhotoAnalyses.length + ' total)'
      ),
      React.createElement('div', { className: 'flex flex-col gap-sm' },
        previewAnalyses.map(function (analysis, i) {
          const content = (analysis && analysis.visualContent) || (typeof analysis === 'string' ? analysis : '');
          return React.createElement('div', { key: 'analysis-' + i, className: 'evidence-item' },
            React.createElement('div', { className: 'evidence-item__header' },
              React.createElement('span', { className: 'evidence-item__number' }, '#' + (i + 1)),
              React.createElement('span', { className: 'text-sm text-secondary' },
                truncate(typeof content === 'string' ? content : String(content), 120)
              )
            )
          );
        })
      ),
      genericPhotoAnalyses.length > 3 && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
        '+ ' + (genericPhotoAnalyses.length - 3) + ' more analyses'
      )
    ),

    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Whiteboard Status'),
      React.createElement('div', { className: 'flex gap-sm items-center' },
        whiteboardPhotoPath
          ? React.createElement(Badge, { label: 'Detected', color: 'var(--accent-green)' })
          : React.createElement(Badge, { label: 'Not Found', color: 'var(--accent-red)' }),
        whiteboardPhotoPath && React.createElement('span', { className: 'text-xs text-muted' }, whiteboardPhotoPath)
      )
    ),

    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Enter Player Names'),
      React.createElement('p', { className: 'text-xs text-muted mb-sm' },
        'Type a name and press Enter or comma to add. Set pronouns per name (defaults to they/them). Click ✕ to remove.'
      ),
      React.createElement('div', { className: 'tag-input' },
        React.createElement('input', {
          className: 'tag-input__field',
          type: 'text',
          value: inputValue,
          onChange: handleChange,
          onKeyDown: handleKeyDown,
          placeholder: tags.length === 0 ? 'e.g., Alice, Bob, Charlie' : 'Add another name...'
        })
      ),
      tags.length > 0 && React.createElement('div', { className: 'flex flex-col gap-sm mt-sm' },
        tags.map(function (tag, i) {
          return React.createElement('div', { key: tag.name + '-' + i, className: 'flex gap-sm items-center' },
            React.createElement('span', { className: 'tag-chip' },
              React.createElement('span', null, tag.name),
              React.createElement('button', {
                className: 'tag-chip__remove',
                onClick: function () { removeTag(i); },
                'aria-label': 'Remove ' + tag.name
              }, '✕')
            ),
            React.createElement('select', {
              className: 'input',
              value: tag.pronouns,
              onChange: function (e) { setPronouns(i, e.target.value); },
              'aria-label': 'Pronouns for ' + tag.name
            },
              PRONOUN_OPTIONS.map(function (p) {
                return React.createElement('option', { key: p, value: p }, p);
              })
            )
          );
        })
      )
    ),

    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        disabled: tags.length === 0 && !inputValue.trim(),
        onClick: handleSubmit
      }, 'Submit Roster (' + (tags.length + (inputValue.trim() ? 1 : 0)) + ')')
    )
  );
}
```

(Note: custom pronouns beyond the three presets can be added in a follow-up; `they/them`/`she/her`/`he/him` covers the corpus. The payload's `roster` is still a plain `string[]`, so the backend and all lib consumers are unaffected.)

- [ ] **Step 2: Manual browser test**

1. `npm start`, open `http://localhost:3001/console`.
2. Start a fresh journalist session; reach the await-roster checkpoint.
3. Add names (Enter/comma). Each name appears as a chip with a pronoun dropdown defaulting to `they/them`. Change one to `she/her`.
4. DevTools Network: click Submit. Confirm the POST to `/api/session/:id/approve` body is `{ "roster": ["Vic", "Sam", ...], "rosterPronouns": { "Vic": "she/her", "Sam": "they/them", ... } }`.
5. Confirm the pipeline continues (roster `string[]` shape unchanged → downstream nodes unaffected).

- [ ] **Step 3: Commit**

```bash
git add console/components/checkpoints/AwaitRoster.js
git commit -m "feat(console): capture per-character pronouns at await-roster checkpoint"
```

---

### Task C6: F1 — Display pronouns on InputReview + pronoun rule in character-voice.md

**Files:**
- Modify: `console/components/checkpoints/InputReview.js:107-114`
- Modify: `.claude/skills/journalist-report/references/prompts/character-voice.md`

- [ ] **Step 1: Show pronouns in the Roster display**

In `console/components/checkpoints/InputReview.js`, the Roster block (lines 107-114) renders bare name badges. Pull `rosterPronouns` from sessionConfig (add near line 62 `const rosterPronouns = sessionConfig.rosterPronouns || {};`) and append the pronoun to each badge label. Change the badge map (lines 110-112) from:

```javascript
        roster.map(function (name) {
          return React.createElement(Badge, { key: name, label: name, color: 'var(--accent-cyan)' });
        })
```

to:

```javascript
        roster.map(function (name) {
          const pronouns = rosterPronouns[name] || 'they/them';
          return React.createElement(Badge, { key: name, label: name + ' (' + pronouns + ')', color: 'var(--accent-cyan)' });
        })
```

- [ ] **Step 2: Add the pronoun RULE to character-voice.md ⚠️ APPROVAL GATE**

In `.claude/skills/journalist-report/references/prompts/character-voice.md`, add a new section immediately before `## POV: First-Person Witness (CRITICAL)` (line 59):

```markdown
## Pronouns (CRITICAL)

Use each character's pronouns exactly as given in the roster block (every roster line ends with the character's pronouns, e.g. `Vic Kingsley (she/her)`). The universe is gender-neutral; the roster is the authority. When a character's pronouns are `they/them`, use they/them. NEVER infer a character's gender from their name, their role, or anything in their memories.

```

- [ ] **Step 3: Manual test + verify**

Browser: at the `input-review` checkpoint of the session from C5, confirm the Roster badges read `Vic (she/her)`, `Sam (they/them)`, etc.
Run: `grep -n "Pronouns (CRITICAL)" .claude/skills/journalist-report/references/prompts/character-voice.md` → one match.

- [ ] **Step 4: Commit**

```bash
git add console/components/checkpoints/InputReview.js .claude/skills/journalist-report/references/prompts/character-voice.md
git commit -m "feat(journalist): display roster pronouns on InputReview + add pronoun rule to character-voice"
```

---

# Batch D — Skill-path parity & hygiene

> The pure skill (`.claude/skills/journalist-report/`) carries stale data and lacks the console's determinism. These edits bring it toward parity. All are doc/markdown edits — verify by re-read + grep.

### Task D1: F10 — Add reporting-mode + guest-reporter + Notion-name discipline to SKILL.md

**Files:** Modify `.claude/skills/journalist-report/SKILL.md`

- [ ] **Step 1: Add reporting mode + guest reporter + pronouns to the inputs section (lines 158-165)**

The REQUIRED/Optional inputs block (lines 158-165) lists roster, accusation, photos, director notes, and "Journalist first name - Default: Cassandra". Extend it:

- Under REQUIRED, change the roster bullet (line 159) to capture pronouns:
  ```markdown
  - **Character roster** - Who was present (first names) AND each character's pronouns (default they/them; the universe is gender-neutral and the roster is the authority — never infer gender from a name)
  ```
- Under Optional inputs, after the "Journalist first name" bullet (line 165), add:
  ```markdown
  - **Reporting mode** - `on-site` (default) or `remote`. On-site: Nova was physically present at the investigation. Remote: she received tips remotely (adjust participatory voice accordingly — see character-voice "REPORTING MODE OVERRIDE").
  - **Guest reporter** - Optional name + role credited as co-reporter (omit if none).
  ```

- [ ] **Step 2: Add a Notion-name discipline note**

Near the roster input (after the Step-1 additions), add:

```markdown
> **Canonical names:** Use the actual session roster's names. Do NOT use names from examples in this skill or its reference files — those are illustrative and may be retired. If unsure of a last name, use the first name only (never invent one).
```

- [ ] **Step 3: Verify + commit**

Run: `grep -n "Reporting mode\|Guest reporter\|pronouns" .claude/skills/journalist-report/SKILL.md` → matches present.

```bash
git add .claude/skills/journalist-report/SKILL.md
git commit -m "feat(skill): capture reporting-mode, guest-reporter, pronouns; add canonical-name discipline"
```

---

### Task D2: F5(skill) + F10 — Deterministic financial totals discipline in SKILL.md

**Files:** Modify `.claude/skills/journalist-report/SKILL.md:209-212`

- [ ] **Step 1: Replace the model-formula totals with authoritative-figures discipline**

Lines 209-212 currently instruct the model to compute totals:

```markdown
**Shell Account Calculation:**
- Base amount = sum of individual token sale prices
- First-token bonus = +$50,000 for FIRST token to each account
- Total = base + bonus
```

Replace with:

```markdown
**Shell Account Totals (AUTHORITATIVE — do not recompute):**
- Use the shell-account totals exactly as they appear in the session report's Final Standings / Final Totals. Do NOT recompute from individual sale prices or add bonuses yourself.
- In-world adjustments already baked into a posted total (first-burial bonus, transfers, settlements) are diegetic — keep them. Only an explicit out-of-world GM correction (e.g. an "Aledupmistake"-type note) is set aside.
- If Final Standings is missing, report the figures you can see and say so; never fabricate a total.
```

(This mirrors the console's deterministic override at `template-assembler.js:376` and the F5 diegetic-vs-out-of-world rule. Full console-grade override isn't portable to the skill, but consuming the report's posted totals verbatim removes the formula-drift.)

- [ ] **Step 2: Verify + commit**

Run: `grep -n "First-token bonus = " .claude/skills/journalist-report/SKILL.md` → no output.

```bash
git add .claude/skills/journalist-report/SKILL.md
git commit -m "fix(skill): consume authoritative shell-account totals, stop model-formula recompute"
```

---

### Task D3: F4 + F12 + F18 — Purge retired names/IDs and align byline in skill references

**Files:**
- Modify: `.claude/skills/journalist-report/SKILL.md:1220-1221`
- Modify: `.claude/skills/journalist-report/references/schemas.md`
- Modify: `.claude/skills/journalist-report/references/voice-samples.md:151`
- Modify: `.claude/agents/journalist-evidence-curator.md:106`

- [ ] **Step 1: Neutralize the hardcoded 15-name roster in SKILL.md (lines 1220-1221)**

The article-validator example embeds a retired roster:

```markdown
  Character roster: James, Taylor, Sarah, Kai, Rachel, Jamie, Derek, Victoria,
                    Tori, Oliver, Morgan, Jessicah, Diana, Ashe, Alex
```

Replace with a neutral placeholder so the example can't anchor retired names:

```markdown
  Character roster: <the actual session roster, first names>
```

- [ ] **Step 2: Align the byline in schemas.md (F18) and de-hardcode the default (F12)**

In `.claude/skills/journalist-report/references/schemas.md`, the byline example (lines 650-655):

```json
  "byline": {
    "author": "Cassandra Nova",
    "title": "Senior Investigative Reporter",
    "location": "Fremont, CA",
    "date": "December 21, 2025"
  },
```

Change `"title"` to match the real renderer (`prompt-builder.js:1037`): `"Senior Investigative Correspondent"`. (Leave `"Cassandra Nova"` as the illustrative default — it matches the documented default.)

- [ ] **Step 3: Replace retired example IDs/names with neutral placeholders in schemas.md (F4)**

The schemas.md examples are saturated with retired IDs (`alr001`, `vik002`, `jav042`) and names (`Victoria`, `Diana`, `Tori`). These are illustrative JSON shapes — replace the retired tokens with neutral placeholders that can't be mistaken for canon. Do a careful pass:
- Token IDs `alr001`/`vik002`/`jav042` → `tok001`/`tok002`/`tok003`.
- Names `Victoria`/`Diana`/`Tori` → `Vic`/`Mel`/`Sam` (current canon) OR `[Character A]`/`[Character B]` placeholders.

Use targeted edits per occurrence (the enumerated lines from the audit: 13, 71, 79, 113, 136, 187-205, 216, 228-231, 253-254, 262-263, 277, 286-288, 338-351, 371-392, 405-430, 464-487, 544-561, 589). Verify with grep in Step 5.

- [ ] **Step 4: voice-samples.md + evidence-curator.md**

- `voice-samples.md:151` "Derek, Sarah, James" → "Sam, Sarah, Vic" (or other current canon). `Sarah` is canonical (Sarah Blackwood); `Derek`/`James` are retired.
- `journalist-evidence-curator.md:106` `"journalistFirstName": "Cassandra"` — leave (matches documented default), but if the surrounding `sessionContext` example uses retired roster/IDs, neutralize those too.

- [ ] **Step 5: Verify + commit**

Run: `grep -rn "alr001\|vik002\|jav042\|Victoria\|Diana\|\bTori\b\|Senior Investigative Reporter\|James, Taylor" .claude/skills/journalist-report/ .claude/agents/journalist-*.md`
Expected: no output (or only inside clearly-labeled "retired/old name" mapping notes, if any exist intentionally).

```bash
git add .claude/skills/journalist-report/SKILL.md .claude/skills/journalist-report/references/schemas.md .claude/skills/journalist-report/references/voice-samples.md .claude/agents/journalist-evidence-curator.md
git commit -m "fix(skill): purge retired names/IDs, neutralize example roster, align byline title"
```

---

### Task D4: F9(skill) — Fix the article-validator ban table

**Files:** Modify `.claude/agents/journalist-article-validator.md:25-27`

- [ ] **Step 1: Scope the token ban and drop the guests ban**

The ban table (lines 23-34) has:

```markdown
| "token" / "tokens" | Game mechanics language | Use "extracted memory" |
| "guest" / "guests" | Game mechanics language | Use "party-goers", "attendees", "those present" |
```

Replace those two rows with a single scoped token row (drop the guests row entirely, per F9):

```markdown
| bare "token" / "tokens" (NOT "memory token") | System-label language | Use "memory token" or "extracted memory" |
```

- [ ] **Step 2: Verify + commit**

Run: `grep -n '"guest"' .claude/agents/journalist-article-validator.md` → no output.

```bash
git add .claude/agents/journalist-article-validator.md
git commit -m "fix(skill): scope token ban, drop guests ban in article-validator"
```

---

# Batch E — F5 Financial Adjustment Classification (🔎 DATA-GATED)

> **Do not start until the 🔎 verification step passes.** This changes which money events the article narrates.

### Task E1: 🔎 Verify the adjustment taxonomy from session data

**Files:** none (investigation)

- [ ] **Step 1: Inspect real session scoring data**

Read 2-3 sessions' parsed data and raw inputs to enumerate the actual adjustment-row types on the Scoring Timeline:
- `data/<id>/inputs/session-config.json` and `data/<id>/fetched/` for parsed shell accounts.
- The corresponding Drive `MMDD inputs` doc Scoring Timeline (or `audit/sessions/<id>.md` traces).
Confirm: (a) the current first-burial-bonus dollar value, (b) the full set of adjustment-row labels (first-burial bonus, transfers, settlements, GM corrections), (c) which are diegetic (incorporate) vs out-of-world (drop).

- [ ] **Step 2: Record the taxonomy**

Write the confirmed taxonomy into this task as a checklist (diegetic labels to RETAIN vs GM-correction labels to DROP) before writing code. If the taxonomy is ambiguous, STOP and ask the director.

---

### Task E2: F5 — Classify adjustment rows in the session-report parse

**Files:** Modify `lib/workflow/nodes/input-nodes.js:462-470`

- [ ] **Step 1: Replace blanket skip with type classification**

The current Step-2 parse instruction (lines 462-470) tells the model to skip ALL adjustment rows. Using the taxonomy from E1, replace the blanket skip with classification: retain diegetic adjustments (first-burial bonus, transfers, settlements) as narratable money events surfaced to the financial summary; drop only out-of-world GM-correction rows. Exact replacement text depends on E1's taxonomy — draft it then, against the verified labels, keeping the existing "only count true buries" tokenId rule for the buried-token list itself.

- [ ] **Step 2: Verify**

Run: `npx jest` (parse-related tests) and, if the pipeline server is available, run one session end-to-end to confirm diegetic adjustments now appear in the financial summary and the article narrates them. (Output-faithfulness is a generation check, outside static scope — flag for a verification gen.)

- [ ] **Step 3: Commit**

```bash
git add lib/workflow/nodes/input-nodes.js
git commit -m "fix(financial): retain diegetic ledger adjustments, drop only GM corrections"
```

---

# Batch F — P2 careful / verify

### Task F1: F14 — Decouple the paper-relevance gate from exposed tokens (behavioral)

**Files:** Modify `lib/workflow/nodes/ai-nodes.js:84-107`

- [ ] **Step 1: Remove the exposed-token coupling from AUTO-EXCLUDE**

In `PAPER_SCORING_PROMPT` (lines 84-107), the AUTO-EXCLUDE list includes:

```
- Paper evidence that would introduce entirely NEW narrative threads not touched by exposed tokens, player focus, or suspects
```

Delete that bullet. Per the director-confirmed rule, paper evidence is available by default and is NOT gated by the token exposed/buried mechanic. Keep the puzzle-only and minimal-description auto-excludes. Optionally narrow the surviving auto-excludes to "puzzle/mechanical only" + "empty/minimal" + (future) explicit director exclusion.

- [ ] **Step 2: Verify (behavioral — flag for gen)**

Run: `npx jest __tests__/unit/workflow/ai-nodes.test.js` (and `score-paper-evidence-retry.test.js`).
Expected: PASS. Then flag: this widens paper inclusion — confirm with a verification gen that the article doesn't over-pull tangential paper (the rescue UI `EvidenceBundle.js` remains the human backstop).

- [ ] **Step 3: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js
git commit -m "fix(curation): stop gating paper evidence on exposed-token coupling"
```

---

### Task F2: F13 — Centralize journalist NPCs (BEHAVIORAL — verify or defer)

**Files:**
- Modify: `lib/theme-config.js` (add journalist `npcs`)
- Modify: `lib/workflow/nodes/evaluator-nodes.js:284-289`, `lib/workflow/nodes/character-data-nodes.js:81-85`
- Modify: `lib/__tests__/theme-config.test.js`

> **⚠️ Behavioral, not pure hygiene.** `getThemeNPCs('journalist')` returns `[]` today (no journalist `npcs` array), and 5 nodes call it (`arc-specialist-nodes.js:167,1303`, `evaluator-nodes.js:297`, `input-nodes.js:527`, `node-helpers.js`). Adding the array ACTIVATES NPC-awareness in those nodes. This is likely a latent bug-fix (those nodes should know Marcus/Nova/Blake/Valet are NPCs) but it changes arc-coverage/validation behavior. Treat with care; if a verification gen shows arc disruption, DEFER.

- [ ] **Step 1: Write the test**

In `lib/__tests__/theme-config.test.js`, update the journalist `getThemeNPCs` test (~line 42) to assert the populated list:

```javascript
    it('getThemeNPCs returns journalist NPCs', () => {
      const npcs = getThemeNPCs('journalist');
      expect(npcs).toEqual(expect.arrayContaining(['Marcus', 'Nova', 'Blake', 'Valet']));
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest lib/__tests__/theme-config.test.js -t "journalist NPCs"`
Expected: FAIL — journalist config has no `npcs` array (returns `[]`).

- [ ] **Step 3: Add the journalist `npcs` array**

In `lib/theme-config.js`, in the journalist `THEME_CONFIGS` entry (near the detective `npcs` at `:100`, add the journalist equivalent in the journalist block):

```javascript
    npcs: [
      'Marcus',   // The murder victim
      'Nova',     // The journalist narrator
      'Blake',    // The valet NPC / Black Market operator
      'Valet',    // Alias for Blake
    ],
```

- [ ] **Step 4: Derive the hardcoded consumers' keys from `getThemeNPCs` (anti-drift)**

In `evaluator-nodes.js` (the `NPC_DESCRIPTIONS` map at `:284-289`) and `character-data-nodes.js` (the prose NPC list at `:81-85`), leave the descriptive text but add a comment + a test-or-runtime check that their NPC keys are a subset of `getThemeNPCs('journalist')`, so future drift is caught. (Do NOT rip out the descriptive maps — they carry per-NPC narrative notes the nodes use.)

- [ ] **Step 5: Run full suite + targeted arc/evaluator tests**

Run: `npx jest`
Expected: PASS. Pay attention to `arc-specialist-nodes.test.js` and `evaluator-nodes.test.js` (roster-coverage / NPC-exclusion logic). If any coverage test now behaves differently, evaluate whether it's the intended fix or a regression. If risk is unclear, **defer F13** (revert this task's commits) and note it for a focused session.

- [ ] **Step 6: Commit**

```bash
git add lib/theme-config.js lib/workflow/nodes/evaluator-nodes.js lib/workflow/nodes/character-data-nodes.js lib/__tests__/theme-config.test.js
git commit -m "fix(journalist): populate journalist NPCs so getThemeNPCs is authoritative"
```

---

### Task F3: F15 — Confirm metadata mismatches are manual edits (verify only)

**Files:** none (investigation)

- [ ] **Step 1: Check a refined report's git history**

For one published report that showed an og/title/`<time datetime>` mismatch (open-question #6), run `git log -p outputs/report-MMDDYY.html` (or the root `report*.html`) and confirm whether the mismatch was introduced by a manual post-generation HTML edit vs the generator. The real renderer syncs these (`article.hbs:7-14,41-48`), so the expected finding is "manual edit." Record the conclusion in `audit/open-questions.md` #6. No code change unless the generator is implicated.

---

# Self-Review (completed during authoring)

**Spec coverage:** All 18 findings mapped to tasks — F1→C1-C6, F2→B1/B2/B3/B4, F3→A1/A2/B3/B5/B7, F4→B4/B5/B6/D3, F5→E1/E2/D2, F6→B1/B2/B3, F7→B5, F8→A3, F9→A4/D4, F10→D1/D2, F11→B2/B7, F12→A5/D3, F13→F2, F14→F1, F15→F3, F16→A6, F17→B7, F18→D3.

**Placeholder scan:** The only deliberately-deferred specifics are Batch E's parse text (gated on the 🔎 E1 taxonomy — cannot be written without session data, by the director's own F5 decision) and A3 Step 2 / D3 Step 3 (enumerated-but-voluminous edits that name every target line for the executor). All code edits show exact current text + exact replacement.

**Type consistency:** `rosterPronouns` is a `{name: pronouns}` object everywhere (state default `null`, stamped to `{}`, read with `|| {}`, resolved with `they/them` fallback). Roster stays `string[]` end-to-end. `generateRosterSection`'s 4th param name (`rosterPronouns`) matches the call-site source (`this.sessionConfig?.rosterPronouns`).

# Items requiring external verification (🔎)
- **E1 (blocks Batch E):** first-burial-bonus value + per-session adjustment taxonomy (session scoring data).
- **F3/F15:** whether corpus metadata mismatches trace to manual edits (report git history).
- **Behavioral changes to confirm with a verification generation** (out of static scope): F14 (paper inclusion breadth), F13 (NPC activation / arc coverage), F5 (diegetic adjustments narrated), and an overall pronoun/voice spot-check after Batch C.
