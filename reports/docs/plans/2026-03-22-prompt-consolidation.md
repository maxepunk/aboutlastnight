# Prompt Reference File Consolidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the 9 article-generation prompt reference files from ~19K tokens to ~13K tokens by eliminating redundancies, resolving conflicts, removing copy-paste trap templates, and clarifying the arc-weaving vs. section-differentiation tension — without losing any unique guidance.

**Architecture:** Edit existing files in place. No new files created. The audit identified 47 redundancy incidents across 9 files plus prompt-builder.js. The consolidation follows three principles: (1) each rule has ONE authoritative home, (2) other files cross-reference rather than repeat, (3) complete prose examples are replaced with structural guidance. The key insight: the closing template in section-rules.md IS the root cause of generic closings — the LLM copies it verbatim.

**Tech Stack:** Markdown prompt files, JavaScript (prompt-builder.js)

---

## File Map

All files in `.claude/skills/journalist-report/references/prompts/`:

| File | Words | Role After Consolidation |
|------|-------|-------------------------|
| `character-voice.md` | 2140 → ~1600 | Nova's identity, voice influences, POV rules. SOLE authority on voice |
| `writing-principles.md` | 1095 → ~600 | High-level writing philosophy. Remove temporal rules (→ cross-ref) |
| `evidence-boundaries.md` | 1886 → ~1886 | Three-layer model. SOLE authority on evidence rules. No changes needed |
| `section-rules.md` | 3115 → ~2200 | Section purposes and content guidance. Largest reduction target |
| `narrative-structure.md` | 2033 → ~1600 | Arc interweaving, evidence card mechanics. Absorbs arc-flow.md |
| `arc-flow.md` | 748 → 0 | DELETE — merge into narrative-structure.md |
| `formatting.md` | 684 → ~500 | Visual rhythm, HTML conventions. Absorbs formatting rules from elsewhere |
| `anti-patterns.md` | 1860 → ~1200 | What NOT to do. Remove temporal section (→ cross-ref), trim examples |
| `editorial-design.md` | 882 → ~700 | Layout, photo distribution. Resolve financial tracker conflict |

Estimated reduction: ~19K → ~13K tokens (~32% reduction)

Also modify: `lib/prompt-builder.js` (remove duplicate hard constraints that are in reference files)

---

## Task 1: Remove the Closing Copy-Paste Trap

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/section-rules.md:526-547`

**Context:** The closing section contains a COMPLETE prose example (lines 526-546) including "First they wanted your clicks. Then your conversations." The LLM copies this verbatim across sessions. This is the #1 root cause of generic closings.

- [ ] **Step 1: Read the current closing example**

Read `section-rules.md` lines 503-560 to understand the full closing guidance.

- [ ] **Step 2: Replace the prose template with structural guidance**

Replace lines 526-547 (the complete example) with guidance about WHAT makes a good closing, without providing copy-paste-able text:

```markdown
**Closing Structure (DO NOT use a template — generate from THIS session's threads):**

1. **Accusation landing** (1-2 sentences): State what the group decided. Don't rehash evidence.
2. **The harder question** (1-2 sentences): What the accusation doesn't address. The alternative theory, the uncomfortable implication, the thing nobody wanted to say.
3. **Complacency thread** (2-3 sentences): Connect specific acts of looking the other way from THIS session to the larger consequence. Name the people. Name the choices. Each small reasonable decision that stacked into a system.
4. **Scale implication** (1-2 sentences): If this technology/system survives its creator, what happens next? Ground this in what THIS session revealed, not generic tech industry commentary.
5. **Nova's witness line** (1 sentence): "I was in that room." Land on something only THIS group of players would recognize.

**NEVER USE:** "First they wanted your clicks" / "That's not a murder mystery, that's a business model" / any surveillance capitalism framing that could apply to ANY session. The closing must be unreusable.
```

- [ ] **Step 3: Also update the "Good" example label in section-rules.md**

Find any remaining example blocks in the closing section labeled "Good:" and replace with structural alternatives or remove entirely.

- [ ] **Step 4: Verify no other files contain the same closing template**

Search all prompt files for "First they wanted your clicks" or "business model" to ensure no other copy-paste traps exist for the closing.

- [ ] **Step 5: Commit**

```
fix: replace closing copy-paste template with structural guidance

The section-rules.md closing example ("First they wanted your clicks...")
was being copied verbatim by the LLM across sessions, producing generic
closings. Replaced with structural guidance about WHAT makes a good
closing without providing reusable prose.
```

---

## Task 2: Consolidate Temporal Discipline (5 locations → 1 + cross-refs)

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/writing-principles.md:5-24`
- Modify: `.claude/skills/journalist-report/references/prompts/narrative-structure.md:30-39`
- Modify: `.claude/skills/journalist-report/references/prompts/section-rules.md:132-156`
- Modify: `.claude/skills/journalist-report/references/prompts/anti-patterns.md:273-333`
- Keep unchanged: `lib/prompt-builder.js:84-90` (system prompt — highest salience, stays)

**Context:** The temporal discipline rule (party = past, investigation = present) appears in 5 separate locations with minor wording variations. This dilutes every instance. The system prompt in prompt-builder.js already contains the rule at the highest-salience position. The reference files should cross-reference it, not repeat it.

- [ ] **Step 1: Identify the authoritative version**

The version in `lib/prompt-builder.js` lines 84-90 (THEME_SYSTEM_PROMPTS) is the authoritative version because it's in the system prompt (highest salience). The evidence items also now carry `temporalContext` fields (from our pipeline improvements). These two layers handle temporal discipline.

- [ ] **Step 2: Replace temporal sections in writing-principles.md**

Replace lines 5-24 (the full temporal framework) with a cross-reference:

```markdown
## Temporal Discipline

See the system prompt's CRITICAL TEMPORAL RULE for the authoritative two-timeline framework. Evidence items carry a `temporalContext` field (PARTY/INVESTIGATION/BACKGROUND) that reinforces this at the data level.

Key principle: Memory CONTENT = party events (last night). Director observations = investigation events (this morning). Never conflate them.
```

- [ ] **Step 3: Replace temporal section in narrative-structure.md**

Replace lines 30-39 with a brief cross-reference (2-3 lines, not a full framework repeat).

- [ ] **Step 4: Replace temporal section in section-rules.md**

Replace lines 132-156 with a brief cross-reference. Keep the section-specific temporal notes (e.g., "THE STORY spans two timelines") but remove the duplicated framework table.

- [ ] **Step 5: Replace temporal section in anti-patterns.md**

Lines 273-333 contain "Timeline Conflation" as an anti-pattern with a full decision table. Replace the framework explanation with a cross-reference, but KEEP the specific wrong/right examples (those are anti-pattern examples, which is this file's purpose):

```markdown
### Timeline Conflation

See system prompt for the two-timeline framework. Here are specific violations to avoid:

**WRONG:** "I watched Remi turn Sam's laptop around this morning."
**WHY:** This is a party event (recovered memory from 1:08AM). Nova watched the RECORDING, not the event.
**RIGHT:** "The recovered footage from 1:08AM shows Remi turning Sam's laptop..."

[Keep the WRONG/RIGHT substitution table from lines 313-333]
```

- [ ] **Step 6: Verify no temporal guidance was lost**

Read all 4 modified files to confirm the core rule is still accessible via cross-reference and the system prompt.

- [ ] **Step 7: Commit**

```
refactor: consolidate temporal discipline to system prompt + cross-refs

Temporal framework was duplicated in 5 locations. System prompt
(highest salience) is now the authority. Reference files cross-reference
it instead of repeating it. Anti-patterns file keeps specific wrong/right
examples. Net reduction: ~200 words across 4 files.
```

---

## Task 3: Consolidate Section Differentiation and Resolve Arc-Weaving Conflict

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/section-rules.md:7-23`
- Modify: `.claude/skills/journalist-report/references/prompts/narrative-structure.md:78-98`

**Context:** "Section Differentiation" appears in both files with near-identical tables. More critically, section-rules.md says "facts should NOT repeat across sections" while arc-flow.md/narrative-structure.md say "arcs weave through every section." These CONFLICT. The resolution: distinguish between REPEATING a fact (bad) and EXAMINING an event from a different angle (good).

- [ ] **Step 1: Rewrite section-rules.md differentiation guidance (lines 7-23)**

Replace with clearer guidance that resolves the conflict:

```markdown
## Critical: Section Differentiation

Each section answers a DIFFERENT QUESTION about the same underlying events.

| Section | Question | Angle |
|---------|----------|-------|
| LEDE | What happened? | Hook and stakes |
| THE STORY | How did it unfold? | Narrative chronology, evidence, discoveries |
| FOLLOW THE MONEY | Who profited from silence? | Financial patterns, shell accounts |
| THE PLAYERS | Who helped and who hindered? | Character choices and motivations |
| WHAT'S MISSING | What don't we know? | Gaps, buried secrets, unanswered questions |
| CLOSING | What does this mean? | Systemic reflection, forward implications |

**The arc-weaving distinction:** An event like "Morgan tried to sell Riley's evidence" can appear in multiple sections — but each section examines it through a DIFFERENT lens:
- THE STORY: What happened (the chase, the timeline)
- FOLLOW THE MONEY: What it reveals about the Black Market (transaction patterns)
- THE PLAYERS: What it says about Morgan's character (betrayal arc)

**Repetition = same fact, same angle, different section. That's the violation.**
**Multi-angle = same event, different question answered. That's good writing.**
```

- [ ] **Step 2: Remove duplicate section differentiation from narrative-structure.md (lines 78-98)**

Replace with a cross-reference:

```markdown
## 3. Section Differentiation

See `<section-rules>` for the authoritative section-question table and the arc-weaving distinction (repeating a fact vs examining from a different angle).
```

- [ ] **Step 3: Verify the conflict is resolved**

Read the updated section-rules.md and narrative-structure.md to confirm the weaving-vs-repetition tension is clearly articulated.

- [ ] **Step 4: Commit**

```
fix: resolve arc-weaving vs section-differentiation conflict

The prompt system simultaneously said "weave arcs through every section"
and "facts should NOT repeat across sections." These conflicted. Now
section-rules.md clearly distinguishes between fact repetition (same
fact, same angle = bad) and multi-angle examination (same event,
different question = good writing).
```

---

## Task 4: Merge arc-flow.md into narrative-structure.md

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/narrative-structure.md`
- Delete: `.claude/skills/journalist-report/references/prompts/arc-flow.md`
- Modify: `lib/theme-loader.js:33-43` (remove arc-flow from articleGeneration phase list)

**Context:** arc-flow.md (748 words) is too short to stand alone and overlaps heavily with narrative-structure.md. Both explain interweaving. Merging eliminates one file from the 9-file load and removes duplicate interweaving guidance.

- [ ] **Step 1: Read both files completely**

Read narrative-structure.md and arc-flow.md. Identify what's unique in arc-flow.md that isn't already in narrative-structure.md.

- [ ] **Step 2: Merge unique content from arc-flow.md into narrative-structure.md**

Add arc-flow.md's unique content (the arc-section mapping table, interweaving techniques, convergence point concept) as a new section at the end of narrative-structure.md. Do NOT duplicate content that already exists in narrative-structure.md.

- [ ] **Step 3: Delete arc-flow.md**

Remove the file.

- [ ] **Step 4: Update theme-loader.js**

Remove `'arc-flow'` from the `articleGeneration` array (line 39) in `lib/theme-loader.js`. Also remove from any other phase arrays that reference it.

- [ ] **Step 5: Verify the article prompt still assembles correctly**

Run: `npm test`
Expected: All tests pass (no test references arc-flow directly — it's loaded by theme-loader)

- [ ] **Step 6: Commit**

```
refactor: merge arc-flow.md into narrative-structure.md

arc-flow.md (748 words) overlapped heavily with narrative-structure.md.
Unique content (arc-section mapping, convergence techniques) merged.
One fewer file in the article generation prompt load.
```

---

## Task 5: Remove Evidence Boundary Duplication from section-rules.md

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/section-rules.md:237-278`

**Context:** section-rules.md lines 237-278 repeat the three-layer evidence model that's comprehensively covered in evidence-boundaries.md. The evidence-boundaries.md version is the authoritative one and already handles account name interpretation, money direction, and director observation exceptions.

- [ ] **Step 1: Replace lines 237-278 with a cross-reference**

```markdown
### Evidence Boundaries in Each Section

See `<evidence-boundaries>` for the authoritative three-layer model (EXPOSED, BURIED, DIRECTOR). Key per-section notes:

- **THE STORY:** Primarily Layer 1 (exposed evidence as narrative). Layer 3 (director observations) for behavioral grounding.
- **FOLLOW THE MONEY:** Layer 2 (shell account patterns — amounts, names, timing). NEVER attribute account activity to specific people unless director observed them at the Valet.
- **THE PLAYERS:** Layer 1 + Layer 3 (exposed evidence + director observations). Layer 2 only for named account patterns.
- **WHAT'S MISSING:** Frame Layer 2 gaps as mysteries. "I can tell you the shape of the silence."
```

- [ ] **Step 2: Also fix the conflict on line 249-253**

The audit found section-rules.md implies "who buried" is knowable from Layer 2. Fix to match evidence-boundaries.md:

```
- Who buried (Layer 2 patterns ONLY if director observed at Valet, no content)
```

→ becomes:

The cross-reference replacement in Step 1 handles this.

- [ ] **Step 3: Commit**

```
refactor: remove evidence boundary duplication from section-rules.md

Lines 237-278 repeated the three-layer model from evidence-boundaries.md.
Replaced with cross-reference plus section-specific application notes.
Also fixes conflict where section-rules implied "who buried" was knowable.
```

---

## Task 6: Deduplicate "No Tokens" and "No Em-Dashes" Rules

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/writing-principles.md:188-194`
- Modify: `.claude/skills/journalist-report/references/prompts/anti-patterns.md:148-184`

**Context:** "No tokens" appears in 5 places, "No em-dashes" in 4 places. The system prompt in prompt-builder.js already contains both as hard constraints. The formatting.md file already covers both. The writing-principles.md and anti-patterns.md copies are redundant.

- [ ] **Step 1: Remove "No Em-Dashes" section from writing-principles.md (lines 188-190)**

Delete these lines entirely. The rule lives in formatting.md and the system prompt.

- [ ] **Step 2: Remove "No Tokens" section from writing-principles.md (lines 192-194)**

Delete these lines entirely. The rule lives in character-voice.md (authoritative, with rationale about treating memories as experiences) and the system prompt.

- [ ] **Step 3: Trim anti-patterns.md em-dash and token sections**

Keep these sections in anti-patterns.md (it's their job to show WRONG/RIGHT examples) but trim to just the examples without repeating the rule explanation. The rule is established elsewhere; anti-patterns shows what violations look like.

- [ ] **Step 4: Commit**

```
refactor: deduplicate em-dash and token terminology rules

Both rules appeared in 4-5 locations. System prompt and dedicated files
(formatting.md, character-voice.md) are authoritative. Removed duplicate
explanations from writing-principles.md. Trimmed anti-patterns.md to
show only WRONG/RIGHT examples without re-explaining the rules.
```

---

## Task 7: Remove Copy-Paste Trap Templates from character-voice.md

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/character-voice.md:40-81`

**Context:** character-voice.md contains three complete prose paragraphs (lines 40-44, 48-53, 77-81) written in Nova's voice. The audit identified these as high-risk copy-paste traps — the LLM uses them verbatim or near-verbatim in generated articles. One even names a specific character ("Sam") who may not be in every session.

- [ ] **Step 1: Replace prose examples with structural voice notes**

Replace each complete prose example with a description of WHAT the example demonstrates, not HOW it sounds:

For lines 40-44 (reporter's complicity):
```markdown
**Self-implication:** Nova acknowledges her own motivations for being there. She's not above the story — she's part of it. This creates trust with the reader.
```

For lines 48-53 (understanding buried):
```markdown
**Empathy for buriers:** Nova doesn't judge people who buried memories. She understands the economics of the choice. Frame burying as survival, not greed.
```

For lines 77-81 (Sam's bravery):
```markdown
**Source celebration:** When someone exposes critical evidence, name them and acknowledge what it cost them. Specific, not generic — reference what THIS person gave up.
```

- [ ] **Step 2: Search for other named-character examples that assume specific rosters**

Grep all prompt files for character names (Sam, Vic, Taylor, etc.) in example prose. Flag any that assume a specific character is present.

- [ ] **Step 3: Commit**

```
fix: remove copy-paste trap templates from character-voice.md

Three complete prose paragraphs in Nova's voice were being used
verbatim by the LLM. Replaced with structural descriptions of
what each voice technique achieves, without providing reusable text.
```

---

## Task 8: Remove Copy-Paste Trap Templates from section-rules.md

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/section-rules.md:90-98,315-325`

**Context:** section-rules.md contains complete prose templates for the LEDE (lines 90-98) and FOLLOW THE MONEY (lines 315-325) that the LLM copies. The lede template ("Marcus Blackwood is dead. [X] people woke up...") appears nearly verbatim in generated articles.

- [ ] **Step 1: Replace lede prose template with structural guidance**

Replace lines 90-98 with:

```markdown
**Lede Structure:**
1. Death declaration (1 sentence)
2. Memory theft framing — what happened to the victims (1-2 sentences)
3. Accusation preview — who's accused and why (1-2 sentences)
4. Nova's presence — she was there (1 sentence)

Generate original prose. Do NOT reuse any phrasing from examples in this file.
```

- [ ] **Step 2: Replace Follow the Money prose template with structural guidance**

Replace lines 315-325 with structural guidance about what the section should contain (total buried amount, account rankings, patterns, mysteries) without providing finished prose.

- [ ] **Step 3: Commit**

```
fix: remove copy-paste trap templates from section-rules.md

Lede and Follow the Money templates were being copied verbatim.
Replaced with structural descriptions of what each section needs
without providing reusable prose.
```

---

## Task 9: Final Audit — Word Count and Redundancy Check

**Files:**
- All 8 remaining prompt files (arc-flow.md deleted in Task 4)

- [ ] **Step 1: Run word count comparison**

```bash
for f in character-voice writing-principles evidence-boundaries section-rules narrative-structure formatting anti-patterns editorial-design; do
  wc -w ".claude/skills/journalist-report/references/prompts/${f}.md" 2>/dev/null
done
```

Compare against the targets in the File Map above.

- [ ] **Step 2: Grep for remaining redundancies**

Search for any rule that still appears in 3+ locations:
```bash
grep -rn "em.dash\|token.*never\|section differentiation\|temporal\|three.*layer\|PARTY.*INVESTIGATION" .claude/skills/journalist-report/references/prompts/ | sort
```

Each rule should appear in at most 2 places (its authoritative home + one cross-reference).

- [ ] **Step 3: Grep for remaining copy-paste traps**

Search for complete sentences that read like finished article prose:
```bash
grep -rn "First they wanted\|business model\|I was in that room\|woke up.*morning\|holes where.*memories" .claude/skills/journalist-report/references/prompts/
```

None of these should appear as reusable templates.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

All tests should pass. Prompt file changes don't affect unit tests, but theme-loader changes (Task 4) could.

- [ ] **Step 5: Commit**

```
chore: verify prompt consolidation — word counts, redundancy check

All prompt reference files audited post-consolidation. Redundancies
reduced from 47 to <10. Copy-paste traps eliminated. Total prompt
content reduced from ~19K to ~13K tokens.
```

---

## Verification Checklist

After all 9 tasks:

1. [ ] `npm test` passes
2. [ ] Total prompt word count reduced by ~30%
3. [ ] No rule appears in more than 2 files (authority + one cross-ref)
4. [ ] No complete prose paragraphs exist as "examples" that could be copied verbatim
5. [ ] The closing section has NO template, only structural guidance
6. [ ] The arc-weaving vs. differentiation conflict is explicitly resolved
7. [ ] arc-flow.md is deleted and removed from theme-loader.js
8. [ ] evidence-boundaries.md is the SOLE authority on three-layer rules
9. [ ] Temporal framework has ONE authority (system prompt) with cross-references

## Files Modified (Complete List)

| File | Change | Task |
|------|--------|------|
| `section-rules.md:526-547` | Replace closing template with structural guidance | 1 |
| `writing-principles.md:5-24` | Replace temporal framework with cross-ref | 2 |
| `narrative-structure.md:30-39` | Replace temporal framework with cross-ref | 2 |
| `section-rules.md:132-156` | Replace temporal framework with cross-ref | 2 |
| `anti-patterns.md:273-333` | Trim temporal section, keep wrong/right examples | 2 |
| `section-rules.md:7-23` | Rewrite differentiation to resolve weaving conflict | 3 |
| `narrative-structure.md:78-98` | Remove duplicate differentiation, add cross-ref | 3 |
| `narrative-structure.md` (append) | Absorb unique arc-flow.md content | 4 |
| `arc-flow.md` | DELETE | 4 |
| `lib/theme-loader.js:39` | Remove 'arc-flow' from articleGeneration | 4 |
| `section-rules.md:237-278` | Replace evidence boundary duplication with cross-ref | 5 |
| `writing-principles.md:188-194` | Remove duplicate em-dash and token rules | 6 |
| `anti-patterns.md:148-184` | Trim to examples only, remove rule re-explanations | 6 |
| `character-voice.md:40-81` | Replace prose templates with structural descriptions | 7 |
| `section-rules.md:90-98,315-325` | Replace prose templates with structural guidance | 8 |
