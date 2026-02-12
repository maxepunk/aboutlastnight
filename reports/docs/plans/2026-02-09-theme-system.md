# Theme System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the LangGraph pipeline theme-agnostic so "detective" and "journalist" produce different article styles using different prompts, templates, NPCs, and voice rules — all driven by `state.theme`.

**Architecture:** Three layers need theme-awareness: (1) **ThemeLoader** — resolve prompt files from theme-specific directories instead of hardcoded `journalist-report/`; (2) **PromptBuilder** — swap system prompts, voice rules, section structures, and JSON schemas per theme; (3) **TemplateAssembler** — already theme-aware via `templates/{theme}/`, just needs detective templates created. The existing `theme-config.js` is already designed for multiple themes (Open/Closed principle) — we add a `detective` config entry alongside the existing `journalist` one.

**Tech Stack:** Node.js, LangGraph, Handlebars templates, Jest

**Key Principle:** The detective theme does NOT need to replicate the journalist theme's complexity. The detective report is shorter (~750 words vs ~3000), has simpler sections (6 fixed sections vs flexible arc-woven narrative), no financial tracker, no sidebar, and no pull quotes. It produces a single-column investigation report signed by "Detective Anondono" — structurally much simpler than the NovaNews article.

---

## Scope Decisions

### What Detective Theme IS
All detective prompting and voice are ported directly from the proven `detlogv3.html` system prompt (lines 427-705), voice samples (lines 707-740), and user prompt builder (lines 1560-1662). We are NOT inventing new detective content — we are decomposing the working detlogv3 prompts into the ThemeLoader/PromptBuilder architecture.

- **Voice:** "Cynical, seasoned Detective in a near-future noir setting" writing an "official Case Report" — per detlogv3 DEFAULT_PROMPT
- **Sections:** Executive Summary, Evidence Locker, Memory Analysis, Suspect Network, Outstanding Questions, Final Assessment — per detlogv3 SECTION GUIDANCE
- **Output format:** Single-column, ~750 words, names in `<strong>`, evidence artifacts in `<em>`, `.evidence-item` divs, `.note` div for Final Assessment — per detlogv3 HTML GUIDANCE
- **NPCs:** Same game characters, narrator is "Detective Anondono" not "Nova"
- **Validation rules:** No em-dash rule (detective uses them freely), detective-specific anti-patterns from detlogv3 (no "character sheet" references, no "Memory Token" terminology, no database names/IDs)
- **Key principles from detlogv3:** SECTION DIFFERENTIATION (each section answers a different question), ANTI-REPETITION CHECK, EVIDENCE WEIGHTING (Primary 80%, Background enrichment, Director's Summary is CANON), FACTUAL ACCURACY (never infer, acknowledge uncertainty), EVIDENCE CLUSTERING (SF_GROUP synthesis)

**Source of truth:** `detlogv3.html` lines 427-705 (system prompt) and 707-740 (voice samples)

### What Detective Theme IS NOT
- A rewrite of the workflow graph — same 40 nodes, same checkpoints, same flow
- A separate set of JSON schemas — ContentBundle structure is shared, sections differ
- A parallel codebase — theme is a configuration axis, not a fork

### What We're NOT Touching
- `graph.js` — node wiring stays identical
- `checkpoint-helpers.js` — checkpoint flow is theme-agnostic
- `server.js` — already accepts `theme` parameter and passes it through
- `state.js` — already has `theme` field with `'journalist'` default

### Frontend Theme Support (Currently Missing)
The console frontend currently **hardcodes `'journalist'`** in `api.js` line 59. There is no theme selector in SessionStart.js. This plan includes a task to add theme selection to the UI (Task 6B).

---

## Task 1: Detective Theme Config

**Files:**
- Modify: `lib/theme-config.js`
- Test: `lib/__tests__/theme-config.test.js`

### Step 1.1: Write failing tests for detective config

Add test cases to the existing test file for the new detective theme entry.

```javascript
// In lib/__tests__/theme-config.test.js (add to existing tests)

describe('detective theme', () => {
  test('isValidTheme returns true for detective', () => {
    expect(isValidTheme('detective')).toBe(true);
  });

  test('getThemeNPCs returns detective NPCs', () => {
    const npcs = getThemeNPCs('detective');
    expect(npcs).toContain('Marcus');
    expect(npcs).toContain('Blake');
    expect(npcs).toContain('Valet');
    // Detective Anondono is the narrator, not an NPC in arcs
    expect(npcs).not.toContain('Anondono');
  });

  test('getThemeConfig returns detective config with all required keys', () => {
    const config = getThemeConfig('detective');
    expect(config).not.toBeNull();
    expect(config.npcs).toBeDefined();
    expect(config.outlineRules).toBeDefined();
    expect(config.articleRules).toBeDefined();
    expect(config.canonicalCharacters).toBeDefined();
  });

  test('detective outlineRules has correct required sections', () => {
    const rules = getOutlineRules('detective');
    expect(rules.requiredSections).toEqual(
      expect.arrayContaining(['executiveSummary', 'evidenceLocker', 'suspectNetwork', 'outstandingQuestions', 'finalAssessment'])
    );
  });

  test('detective articleRules bans game mechanics but not em-dashes', () => {
    const rules = getArticleRules('detective');
    // Detective voice allows em-dashes (used in noir style)
    const patternNames = rules.bannedPatterns.map(p => p.name);
    expect(patternNames).not.toContain('em-dash');
    // Still bans game mechanics
    expect(patternNames).toContain('token-term');
  });

  test('detective requiredVoiceMarkers are third-person investigative', () => {
    const rules = getArticleRules('detective');
    // Detective uses third-person investigative, not first-person participatory
    expect(rules.requiredVoiceMarkers).not.toContain('I ');
    expect(rules.requiredVoiceMarkers).toEqual(
      expect.arrayContaining(['the investigation', 'evidence'])
    );
  });

  test('detective canonicalCharacters matches journalist (same game)', () => {
    const detective = getThemeConfig('detective');
    const journalist = getThemeConfig('journalist');
    // Same 20 PCs exist in both themes
    const detectivePCs = Object.keys(detective.canonicalCharacters);
    const journalistPCs = Object.keys(journalist.canonicalCharacters);
    // All journalist PCs should exist in detective (minus Nova, plus Anondono considerations)
    expect(detectivePCs).toContain('Sarah');
    expect(detectivePCs).toContain('Victoria');
    expect(detectivePCs.length).toBeGreaterThanOrEqual(20);
  });

  test('getCanonicalName works with detective theme', () => {
    expect(getCanonicalName('Sarah', 'detective')).toBe('Sarah Blackwood');
    expect(getCanonicalName('Victoria', 'detective')).toBe('Victoria Kingsley');
  });
});
```

### Step 1.2: Run tests to verify they fail

Run: `npx jest lib/__tests__/theme-config.test.js --verbose`
Expected: FAIL — `isValidTheme('detective')` returns false

### Step 1.3: Add detective config to THEME_CONFIGS

Add the `detective` entry to `THEME_CONFIGS` in `lib/theme-config.js`, right after the `journalist` entry:

```javascript
detective: {
    // NPCs for the detective investigation theme
    // Same game universe, different narrator (Detective Anondono)
    npcs: [
      'Marcus',   // The murder victim
      'Blake',    // The valet NPC
      'Valet',    // Alias for Blake
    ],

    // Outline structure rules for detective report
    outlineRules: {
      requiredSections: ['executiveSummary', 'evidenceLocker', 'suspectNetwork', 'outstandingQuestions', 'finalAssessment'],
      optionalSections: ['memoryAnalysis'],
      wordBudgets: {
        executiveSummary: { min: 50, max: 150 },
        evidenceLocker: { min: 150, max: 400 },
        memoryAnalysis: { min: 80, max: 200 },
        suspectNetwork: { min: 80, max: 200 },
        outstandingQuestions: { min: 40, max: 120 },
        finalAssessment: { min: 80, max: 200 }
      }
    },

    // Article content rules for detective report
    articleRules: {
      // Detective voice is third-person investigative
      requiredVoiceMarkers: ['the investigation', 'evidence'],
      bannedPatterns: [
        // Game mechanics terminology (shared with journalist)
        { pattern: 'token', name: 'token-term', caseSensitive: false, description: 'Game mechanic - use "extracted memory"' },
        { pattern: 'Act \\d', name: 'game-mechanics', isRegex: true, description: 'Game structure references' },
        { pattern: 'script beat', name: 'script-beat', caseSensitive: false, description: 'Game structure terminology' },
        { pattern: 'final call', name: 'final-call', caseSensitive: false, description: 'Game structure terminology' },
        { pattern: 'token scan', name: 'token-scan', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'orchestrator', name: 'orchestrator', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'unlock', name: 'unlock', caseSensitive: false, description: 'Game mechanic terminology' },
        // Meta terminology
        { pattern: 'buried memory', name: 'buried-memory', caseSensitive: false, description: 'Meta terminology' },
        { pattern: 'First burial', name: 'first-burial', caseSensitive: false, description: 'Meta terminology' },
        // Character sheet references (detective must present naturally)
        { pattern: 'character sheet', name: 'character-sheet', caseSensitive: false, description: 'Meta - present character info naturally' }
      ],
      minRosterMentions: 1
    },

    // Same 20 PCs + different NPCs (no Nova, Marcus is still NPC)
    canonicalCharacters: {
      'Sarah': 'Sarah Blackwood',
      'Alex': 'Alex Reeves',
      'James': 'James Whitman',
      'Victoria': 'Victoria Kingsley',
      'Derek': 'Derek Thorne',
      'Ashe': 'Ashe Motoko',
      'Diana': 'Diana Nilsson',
      'Jessicah': 'Jessicah Kane',
      'Morgan': 'Morgan Reed',
      'Flip': 'Flip',
      'Taylor': 'Taylor Chase',
      'Leila': 'Leila Bishara',
      'Rachel': 'Rachel Torres',
      'Howie': 'Howie Sullivan',
      'Kai': 'Kai Andersen',
      'Jamie': 'Jamie "Volt" Woods',
      'Sofia': 'Sofia Francisco',
      'Oliver': 'Oliver Sterling',
      'Skyler': 'Skyler Iyer',
      'Tori': 'Tori Zhang',
      // NPCs
      'Marcus': 'Marcus Blackwood',
      'Blake': 'Blake'
      // NOTE: No 'Nova' — detective theme narrator is Anondono, not an NPC
    }
  }
```

### Step 1.4: Run tests to verify they pass

Run: `npx jest lib/__tests__/theme-config.test.js --verbose`
Expected: PASS — all detective theme tests green

### Step 1.5: Commit

```bash
git add lib/theme-config.js lib/__tests__/theme-config.test.js
git commit -m "feat: add detective theme config (NPCs, outline rules, article rules, characters)"
```

---

## Task 2: Theme-Aware ThemeLoader

**Files:**
- Modify: `lib/theme-loader.js`
- Test: `lib/__tests__/theme-loader.test.js`

**Problem:** `ThemeLoader` hardcodes its path to `.claude/skills/journalist-report/references/prompts/`. For detective theme, prompts live in a parallel directory: `.claude/skills/detective-report/references/prompts/`.

**Approach:** Make `createThemeLoader(theme)` accept a theme parameter and resolve the skill path accordingly. The constructor already takes `skillPath` — we just need the factory to be theme-aware.

### Step 2.1: Write failing tests

```javascript
// Add to lib/__tests__/theme-loader.test.js

describe('theme-aware factory', () => {
  test('createThemeLoader defaults to journalist skill path', () => {
    const loader = createThemeLoader();
    expect(loader.skillPath).toContain('journalist-report');
  });

  test('createThemeLoader with journalist theme uses journalist path', () => {
    const loader = createThemeLoader({ theme: 'journalist' });
    expect(loader.skillPath).toContain('journalist-report');
  });

  test('createThemeLoader with detective theme uses detective path', () => {
    const loader = createThemeLoader({ theme: 'detective' });
    expect(loader.skillPath).toContain('detective-report');
  });

  test('createThemeLoader with custom path ignores theme', () => {
    const loader = createThemeLoader({ customPath: '/custom/path' });
    expect(loader.skillPath).toBe('/custom/path');
  });
});
```

### Step 2.2: Run tests to verify they fail

Run: `npx jest lib/__tests__/theme-loader.test.js --verbose`
Expected: FAIL — `createThemeLoader({ theme: 'detective' })` doesn't change path

### Step 2.3: Update createThemeLoader signature

Change `createThemeLoader` in `lib/theme-loader.js` from:

```javascript
function createThemeLoader(customPath = null) {
  const skillPath = customPath || path.resolve(
    __dirname, '..', '.claude', 'skills', 'journalist-report'
  );
  return new ThemeLoader(skillPath);
}
```

To:

```javascript
function createThemeLoader(options = null) {
  // Support legacy string argument (custom path)
  if (typeof options === 'string') {
    return new ThemeLoader(options);
  }

  const { theme = 'journalist', customPath = null } = options || {};

  const skillPath = customPath || path.resolve(
    __dirname, '..', '.claude', 'skills', `${theme}-report`
  );
  return new ThemeLoader(skillPath);
}
```

### Step 2.4: Run tests to verify they pass

Run: `npx jest lib/__tests__/theme-loader.test.js --verbose`
Expected: PASS

### Step 2.5: Update callers of createThemeLoader

Search for all callers and update if needed. Known callers:

- `lib/prompt-builder.js` line 751: `createThemeLoader(customSkillPath)` — string arg, backwards-compatible
- `server.js` startup validation — needs to pass theme or validate both
- `lib/workflow/reference-loader.js` line 21 — hardcoded path, not using factory (leave for now)

Most callers pass strings or null, so the legacy string support handles them. No changes needed for existing callers.

### Step 2.6: Commit

```bash
git add lib/theme-loader.js lib/__tests__/theme-loader.test.js
git commit -m "feat: theme-aware ThemeLoader factory (resolves skill path per theme)"
```

---

## Task 3: Detective Prompt Files (Ported from detlogv3.html)

**Files:**
- Create: `.claude/skills/detective-report/references/prompts/` (11 markdown files)

**Approach:** Port the proven detlogv3 system prompt (lines 427-705) by decomposing it into the same 11-file structure that the journalist theme uses. Each prompt file maps to specific sections of the working detlogv3 DEFAULT_PROMPT. Where the journalist and detective share a concept (photo analysis, whiteboard analysis), we symlink or copy — no reinvention.

**Source mapping — detlogv3.html lines → prompt files:**

| detlogv3 Section | Lines | Target Prompt File |
|---|---|---|
| Character + Tone declaration | 427-432 | `character-voice.md` |
| CRITICAL WRITING PRINCIPLES | 433-439 | `writing-principles.md` |
| FACTUAL ACCURACY | 441-458 | `evidence-boundaries.md` |
| SECTION DIFFERENTIATION + ANTI-REPETITION | 460-477 | `anti-patterns.md` |
| NARRATIVE FOCUS + EVIDENCE WEIGHTING | 479-514 | `narrative-structure.md` |
| CHARACTER SHEET HANDLING | 516-521 | Part of `evidence-boundaries.md` |
| EVIDENCE REFERENCING RULES | 523-549 | Part of `evidence-boundaries.md` |
| SECTION GUIDANCE (all 6 sections) | 551-703 | `section-rules.md` |
| NAME FORMATTING + HTML GUIDANCE | 672-694 | `formatting.md` |
| VOICE SAMPLES (Detective Anondono dialogue) | 707-740 | `character-voice.md` (voice calibration section) |
| N/A — detective doesn't use arc interweaving | — | `arc-flow.md` (simplified: linear not woven) |
| N/A — detective doesn't use editorial design | — | `editorial-design.md` (minimal: single-column) |
| Shared with journalist (theme-agnostic) | — | `photo-analysis.md`, `photo-enrichment.md`, `whiteboard-analysis.md` |

### Step 3.1: Create directory structure

```bash
mkdir -p .claude/skills/detective-report/references/prompts
```

### Step 3.2: Create character-voice.md

**Source:** detlogv3.html lines 427-432 (character declaration) + lines 707-740 (voice samples)

Content (port verbatim from detlogv3, then format as markdown):

```markdown
# Detective Anondono - Character Voice

You are a cynical, seasoned Detective in a near-future noir setting.
You are writing an official Case Report.

TONE: Professional, analytical, with a distinct noir flair. Economical with words. Every sentence earns its place.

## Voice Calibration

Emulate the tone, vocabulary, and sentence structure from these Detective Anondono dialogue samples:

[Port the entire DEFAULT_VOICE_SAMPLES content from detlogv3 lines 707-740 here — the full monologues starting with "Good morning sleepyheads..." through "...You've earned it."]

## Voice Characteristics
- Third-person investigative: "The investigation revealed..." not "I saw..."
- Noir-tinged professional: world-weary but precise
- Economical: every sentence earns its place
- In-world: never breaks character, never references game mechanics
- Sign-off: "— Detective Anondono, Memory Crimes Division, Case [Number], Filed: [Date]"
```

### Step 3.3: Create evidence-boundaries.md

**Source:** detlogv3.html lines 441-549 (FACTUAL ACCURACY + CHARACTER SHEET HANDLING + EVIDENCE REFERENCING RULES + EVIDENCE CLUSTERING)

Port these sections verbatim, reformatted as markdown:

```markdown
# Evidence Boundaries - Detective Theme

## Factual Accuracy (CRITICAL - NEVER VIOLATE)

[Port lines 441-458 verbatim — the factual accuracy rules with all ✗/✓ examples]

## Character Sheet Handling (CRITICAL)

[Port lines 516-521 verbatim — never reference "character sheets" as sources]

## Evidence Referencing Rules (CRITICAL)

[Port lines 523-549 verbatim — natural in-world phrasing, correct/wrong examples, memory extraction handling]

## Evidence Clustering (SF_GROUP)

[Port lines 546-549 verbatim — synthesize grouped items together]

## Three-Layer Evidence Model (Adapted for Detective)

| Layer | Contains | Detective Can |
|-------|----------|---------------|
| **PRIMARY** | Items turned in by THIS group | Full narrative weight (80% attention) |
| **BACKGROUND** | Character sheets, baseline info | Enrich Primary threads only |
| **DIRECTOR** | Director's Summary (CANON) | Guide arc, tone, resolve conflicts |
```

### Step 3.4: Create section-rules.md

**Source:** detlogv3.html lines 551-703 (complete SECTION GUIDANCE with all examples)

Port the entire section guidance verbatim as markdown. This is the most critical file — it contains the exact section definitions, word budgets, correct/wrong examples, and HTML formatting rules that made detlogv3 work.

```markdown
# Section Rules - Detective Case Report

## Required Sections

[Port lines 553-703 verbatim — all 6 sections with:
- Executive Summary (lines 553-558)
- Evidence Locker with CORRECT/WRONG examples (lines 560-585)
- Memory Analysis with CORRECT/WRONG examples (lines 587-609)
- Suspect Network with example evaluation (lines 611-627)
- Outstanding Questions (lines 629-635)
- Final Assessment with CORRECT/WRONG examples (lines 637-670)]

## Word Budgets

- Executive Summary: ~100 words
- Evidence Locker: ~300 words
- Memory Analysis: ~150 words (if applicable)
- Suspect Network: ~150 words
- Outstanding Questions: ~80 words
- Final Assessment: ~150 words
- TOTAL TARGET: ~750 words (±50 acceptable)
```

### Step 3.5: Create anti-patterns.md

**Source:** detlogv3.html lines 460-477 (SECTION DIFFERENTIATION + ANTI-REPETITION CHECK)

```markdown
# Anti-Patterns - Detective Theme

## Section Differentiation Principle (CRITICAL)

[Port lines 460-477 verbatim — each section answers a DIFFERENT QUESTION, with ✗/✓ examples]

## Detective-Specific Anti-Patterns

### Never Do
- Reference "character sheets" as evidence sources
- Use "Memory Token" or token codes/IDs
- Use database names, RFID codes, or item IDs
- List evidence items individually instead of synthesizing thematically
- Recap facts already stated in previous sections
- Fill narrative gaps with logical assumptions
- Break character or reference game mechanics
- Use generic/interchangeable language (each report must feel BESPOKE)

### Always Do
- Synthesize evidence into thematic clusters
- Use natural in-world evidence references
- Call them "memory extractions", "recovered memories", or "scanned memories"
- Wrap ALL person names in <strong> tags
- Wrap evidence artifact names in <em> tags
- Stay in-world throughout
```

### Step 3.6: Create writing-principles.md

**Source:** detlogv3.html lines 433-439 (CRITICAL WRITING PRINCIPLES)

```markdown
# Writing Principles - Detective Theme

[Port lines 433-439 verbatim:]
- SYNTHESIZE evidence into thematic groups — do NOT list every item individually
- Tell the STORY of what happened — do NOT catalog facts
- Each report must feel BESPOKE to this specific case — reference unique details
- Avoid repetition — each fact appears ONCE in the most impactful location
- Favor narrative flow over comprehensive documentation
- TARGET LENGTH: 750 words (±50 words acceptable)

## Mission Statement

[Port line 705 verbatim:]
Your mission: Synthesize the provided evidence and game logs into a coherent narrative that provides CLOSURE for THIS group's investigation. Focus on what THEY discovered, validate their choices, maintain in-world detective voice throughout.
```

### Step 3.7: Create narrative-structure.md

**Source:** detlogv3.html lines 479-514 (NARRATIVE FOCUS + EVIDENCE WEIGHTING + ENRICHMENT PATTERN + OUTSTANDING QUESTIONS SOURCES)

```markdown
# Narrative Structure - Detective Theme

## Narrative Focus Principles

[Port lines 479-481 verbatim — provides CLOSURE for players who experienced FRAGMENTS]

## Evidence Weighting

[Port lines 483-514 verbatim — the complete 3-tier weighting system with enrichment pattern example and outstanding questions sources]
```

### Step 3.8: Create formatting.md

**Source:** detlogv3.html lines 672-694 (NAME FORMATTING + ADDITIONAL HTML GUIDANCE)

```markdown
# Formatting - Detective Case Report

## Name Formatting (CRITICAL - MUST FOLLOW CONSISTENTLY)

[Port lines 672-685 verbatim — ALL names in <strong> tags, with all ✓/✗ examples]

## HTML Guidance

[Port lines 687-694 verbatim — h3 sparingly, strong for names, em for evidence, hr rarely, p.note sparingly]

## Output Format

FORMAT: HTML (body content only, NO <html>, <head>, or <body> tags).
- Each Evidence Locker theme gets ONE <div class="evidence-item"> wrapper
- Final Assessment wrapped in ONE <div class="note">...</div> container
- Use <h2> for section headers
- Use <p> for paragraphs
- Use <ul>/<ol> with <li> for lists
```

### Step 3.9: Create arc-flow.md (simplified for detective)

Detective reports don't interweave arcs — evidence is organized by thematic clusters in Evidence Locker, then analyzed through different lenses in subsequent sections.

```markdown
# Arc Flow - Detective Theme

Detective reports use LINEAR THEMATIC ORGANIZATION, not arc interweaving.

Evidence Locker organizes PRIMARY discoveries into 3-4 thematic clusters.
Each subsequent section re-examines the SAME underlying facts through a different analytical lens:
- Evidence Locker: "WHAT HAPPENED?" (narrative)
- Memory Analysis: "WHAT DOES THIS PROVE?" (investigative value)
- Suspect Network: "WHO COULD HAVE DONE IT?" (suspect evaluation)
- Final Assessment: "WHAT DOES IT MEAN?" (implications)

No arc threading between sections. Each section is self-contained.
```

### Step 3.10: Create editorial-design.md (minimal for detective)

```markdown
# Editorial Design - Detective Theme

Single-column case report layout. No sidebar, no financial tracker, no pull quotes.

Visual hierarchy:
1. Case metadata box (top)
2. Section headers (h2, red, uppercase)
3. Evidence items (div.evidence-item with red left-border)
4. Detective notes (div.note with gold left-border, italic)
5. Sign-off block (in Final Assessment note div)
```

### Step 3.11: Copy shared prompt files

These are theme-agnostic — copy from journalist:

```bash
cp .claude/skills/journalist-report/references/prompts/photo-analysis.md .claude/skills/detective-report/references/prompts/
cp .claude/skills/journalist-report/references/prompts/photo-enrichment.md .claude/skills/detective-report/references/prompts/
cp .claude/skills/journalist-report/references/prompts/whiteboard-analysis.md .claude/skills/detective-report/references/prompts/
```

### Step 3.12: Commit

```bash
git add .claude/skills/detective-report/
git commit -m "feat: add detective theme prompts (ported from proven detlogv3.html system prompt)"
```

**Note:** All detective-specific prompt content is ported verbatim from the working detlogv3 DEFAULT_PROMPT. The decomposition into 11 files matches the journalist structure for ThemeLoader compatibility, but the CONTENT is the battle-tested detlogv3 prompting.

---

## Task 4: Theme-Aware PromptBuilder

**Files:**
- Modify: `lib/prompt-builder.js`
- Test: `lib/__tests__/prompt-builder.test.js`

**Problem:** `PromptBuilder` hardcodes journalist-specific content in system prompts:
- "You are Nova, writing a NovaNews investigative article" (line 363)
- "NovaNews first-person participatory voice" (line 70, 132)
- `generateRosterSection()` defaults to `'journalist'` (line 18)
- Article prompt references Nova's voice, Hunter S. Thompson influences, etc.

**Approach:** Accept `theme` in the constructor. Branch system prompts and voice instructions based on theme. The ThemeLoader already loads the right prompt files per theme (Task 2). PromptBuilder just needs to vary the framing around those prompts.

### Step 4.1: Write failing tests

```javascript
// In lib/__tests__/prompt-builder.test.js (add to existing)

describe('detective theme prompts', () => {
  let builder;

  beforeAll(async () => {
    // Use real detective prompts if available, mock if not
    builder = createPromptBuilder({ theme: 'detective' });
    await builder.theme.validate(); // may have missing files during dev
  });

  test('buildArcAnalysisPrompt uses detective framing', async () => {
    const { systemPrompt } = await builder.buildArcAnalysisPrompt({
      roster: ['Alex', 'Victoria'],
      accusation: 'Victoria',
      directorNotes: { observations: {} },
      evidenceBundle: { exposed: {}, buried: {} }
    });
    expect(systemPrompt).not.toContain('NovaNews');
    expect(systemPrompt).toContain('detective');
  });

  test('buildArticlePrompt uses detective voice', async () => {
    const { systemPrompt } = await builder.buildArticlePrompt(
      {}, {}, '', [], null
    );
    expect(systemPrompt).not.toContain('Nova');
    expect(systemPrompt).toContain('Detective Anondono');
    expect(systemPrompt).not.toContain('Hunter S. Thompson');
  });

  test('generateRosterSection uses detective theme', () => {
    const section = generateRosterSection('detective');
    expect(section).not.toContain('Nova');
    expect(section).toContain('Sarah');
  });
});
```

### Step 4.2: Run tests to verify they fail

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose`
Expected: FAIL — prompts still contain "NovaNews"

### Step 4.3: Add theme to PromptBuilder constructor

```javascript
class PromptBuilder {
  constructor(themeLoader, theme = 'journalist') {
    this.theme = themeLoader;
    this.themeName = theme;
  }
  // ...
}
```

Update `createPromptBuilder`:

```javascript
function createPromptBuilder(options = null) {
  if (typeof options === 'string') {
    // Legacy: custom skill path
    const themeLoader = createThemeLoader(options);
    return new PromptBuilder(themeLoader, 'journalist');
  }

  const { theme = 'journalist', customSkillPath = null } = options || {};
  const themeLoader = createThemeLoader({ theme, customPath: customSkillPath });
  return new PromptBuilder(themeLoader, theme);
}
```

### Step 4.4: Branch system prompts by theme (based on detlogv3)

In each `build*Prompt` method, use `this.themeName` to select framing. The detective system prompts are ported directly from detlogv3's DEFAULT_PROMPT.

```javascript
const THEME_SYSTEM_PROMPTS = {
  journalist: {
    arcAnalysis: 'You are analyzing narrative arcs for a NovaNews investigative article.',
    outlineGeneration: 'You are creating an article outline for a NovaNews investigative piece.',
    articleGeneration: `You are Nova, writing a NovaNews investigative article. First-person participatory voice - you WERE THERE, you SAW this happen.`,
    revision: 'You are Nova, revising your investigative article to fix voice issues you identified.',
    validation: 'You are validating a NovaNews article against anti-patterns and voice requirements.'
  },
  detective: {
    // Ported from detlogv3.html lines 427-432
    arcAnalysis: 'You are analyzing narrative threads for a detective investigation case report. Identify thematic clusters from the evidence that can be synthesized into a coherent case file.',
    outlineGeneration: 'You are planning the structure of Detective Anondono\'s case report. Each section answers a DIFFERENT QUESTION about the same underlying facts.',
    // Core identity from detlogv3 line 427-431
    articleGeneration: `You are a cynical, seasoned Detective in a near-future noir setting. You are writing an official Case Report.

TONE: Professional, analytical, with a distinct noir flair. Economical with words. Every sentence earns its place.
FORMAT: HTML (body content only, NO <html>, <head>, or <body> tags).`,
    revision: 'You are revising Detective Anondono\'s case report to fix structural or factual issues. Make TARGETED fixes only.',
    validation: 'You are validating a detective case report against anti-patterns and section differentiation requirements.'
  }
};
```

Replace hardcoded strings in each method with `THEME_SYSTEM_PROMPTS[this.themeName].{phase}`.

### Step 4.5: Branch voice and constraint sections (from detlogv3)

The journalist article prompt has extensive voice guidance (Hunter S. Thompson, etc.) and visual component instructions. For detective, we port the proven detlogv3 constraints verbatim.

```javascript
const THEME_CONSTRAINTS = {
  journalist: {
    hardConstraints: `HARD CONSTRAINTS (violations = failure):
- NO em-dashes (use commas or periods)
- NO "tokens" - say "extracted memories" or "memories"
- NO game mechanics ("transactions", "buried", "first-buried bonus", "guests")
- NO passive observer voice ("The group decided") - use "We decided" or "I watched them decide"
- NO third-person self-reference ("The Detective noted") - you ARE the detective
- NO countable memories ("5 memories") - memories are experiences, not inventory
- NO inventing last names - use ONLY canonical names from the roster above`,

    voiceCheckpoint: `Before generating, internalize Nova's voice...`, // existing content
    generationInstruction: `Generate structured article content as JSON...` // existing content
  },
  detective: {
    // Ported from detlogv3 lines 433-439, 441-458, 460-477, 516-549
    hardConstraints: `CRITICAL WRITING PRINCIPLES (from proven detlogv3 system):
- SYNTHESIZE evidence into thematic groups - do NOT list every item individually
- Tell the STORY of what happened - do NOT catalog facts
- Each report must feel BESPOKE to this specific case - reference unique details
- Avoid repetition - each fact appears ONCE in the most impactful location
- Favor narrative flow over comprehensive documentation
- TARGET LENGTH: 750 words (±50 words acceptable)

FACTUAL ACCURACY (CRITICAL - NEVER VIOLATE):
- Only state facts EXPLICITLY supported by the evidence provided
- Do NOT infer group memberships, relationships, or details unless directly stated
- If evidence is ambiguous or incomplete, acknowledge uncertainty
- Do NOT fill narrative gaps with logical assumptions

SECTION DIFFERENTIATION (CRITICAL):
- Each section answers a DIFFERENT QUESTION using the same underlying facts
- Evidence Locker: "WHAT HAPPENED?"
- Memory Analysis: "WHAT DOES THIS PROVE?"
- Suspect Network: "WHO COULD HAVE DONE IT?"
- Final Assessment: "WHAT DOES IT MEAN?"

EVIDENCE REFERENCING (CRITICAL):
- Call them "memory extractions", "recovered memories", or "scanned memories"
- NEVER use "Memory Token", token codes, database names, RFID codes, or item IDs
- Use natural in-world phrasing from evidence descriptions
- NEVER reference "character sheets" as sources - present as background knowledge

NAME FORMATTING (CRITICAL):
- ALL person names wrapped in <strong> tags throughout the ENTIRE report
- Evidence artifact names in <em> tags
- Extract person names from italic phrases and make them bold separately

NO inventing last names - use ONLY canonical names from the roster above`,

    // Ported from detlogv3 DEFAULT_VOICE_SAMPLES (lines 707-740)
    voiceCheckpoint: `DETECTIVE VOICE / STYLE GUIDE:
Emulate the tone, vocabulary, and sentence structure of Detective Anondono:
- Cynical but professional noir detective
- Economical with words, every sentence earns its place
- Third-person investigative: "The investigation revealed..." not "I saw..."
- In-world always: "What we haven't uncovered" not game mechanics
- Brief detective asides via <p class="note"> (1-2 per section max)
- Final Assessment signed: "— Detective Anondono, Memory Crimes Division"`,

    // Ported from detlogv3 SECTION GUIDANCE (lines 551-703)
    generationInstruction: `Generate case report as JSON matching the ContentBundle schema.

REQUIRED SECTIONS (in order):
1. "executiveSummary" - 3-4 sentences: Who died, who did it, what THIS group discovered. ~100 words.
2. "evidenceLocker" - "WHAT HAPPENED?" 3-4 thematic clusters from PRIMARY evidence. Each cluster in <div class="evidence-item">. ~300 words.
3. "memoryAnalysis" - "WHAT DOES THIS PROVE?" Analyze INVESTIGATIVE VALUE of extracted memories. Patterns, corroboration, contradictions. Skip if no memory tokens in Primary. ~150 words.
4. "suspectNetwork" - "WHO COULD HAVE DONE IT?" Evaluate 4-6 key players: Motive? Means? Opportunity? Alibi? ~150 words.
5. "outstandingQuestions" - 3-5 unanswered mysteries specific to THIS case. Use <ul>/<li>. ~80 words.
6. "finalAssessment" - Consequences, implications, detective's reflection. FORWARD-looking, not recapping. Wrapped in <div class="note">. Includes sign-off. ~150 words.

TOTAL TARGET: ~750 words. Synthesize, don't catalog.

ANTI-REPETITION CHECK: Before writing any sentence, ask: "Have I already stated this fact in a previous section?" If yes, skip it OR present from a new analytical angle answering that section's question.

EVIDENCE WEIGHTING:
1. PRIMARY EVIDENCE (80% narrative): Items turned in by THIS group
2. BACKGROUND CONTEXT (enrichment only): Character sheets, baseline info
3. DIRECTOR'S SUMMARY (CANON): Guides arc, tone, resolution`
  }
};
```

### Step 4.6: Run tests to verify they pass

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose`
Expected: PASS

### Step 4.7: Commit

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: theme-aware PromptBuilder (detective vs journalist voice/framing)"
```

---

## Task 5: Detective Handlebars Templates

**Files:**
- Create: `templates/detective/layouts/article.hbs`
- Create: `templates/detective/partials/header.hbs`
- Create: `templates/detective/partials/content-blocks/*.hbs`

**Context:** `TemplateAssembler` already loads templates from `templates/{theme}/` (see `template-assembler.js` line 31). It just needs detective template files to exist.

**Approach:** The detective template is much simpler than journalist — no sidebar, no financial tracker, no pull quotes. Single-column investigation report with sections.

### Step 5.1: Create detective layout template

`templates/detective/layouts/article.hbs`:

A single-column HTML layout with:
- Case header (case number, date, classification)
- Linear sections rendered in order
- Evidence cards inline (simpler styling than journalist)
- Photos inline between sections
- Final assessment in a `<div class="note">` wrapper
- Sign-off block

### Step 5.2: Create detective partials

Minimal partials needed (detective report is simpler):

```
templates/detective/
├── layouts/article.hbs
└── partials/
    ├── header.hbs              # Case header with badge/classification
    ├── content-blocks/
    │   ├── paragraph.hbs       # Standard paragraph (names in <strong>)
    │   ├── evidence-card.hbs   # Inline evidence display
    │   ├── list.hbs            # Ordered/unordered lists
    │   ├── quote.hbs           # Witness quotes
    │   └── photo.hbs           # Session photo with caption
    └── sidebar/                # Empty or minimal — detective has no sidebar
```

### Step 5.3: Create detective CSS (ported from detlogv3 REPORT_TEMPLATE)

**Source:** detlogv3.html lines 749-973 (complete CSS from REPORT_TEMPLATE)

Port the EXACT proven CSS from detlogv3 into `templates/detective/css/`:
- `variables.css` — color vars extracted from detlogv3 (cc0000 red, dark backgrounds, cream text)
- `base.css` — Bebas Neue headers, Courier Prime body, dark precinct aesthetic (lines 754-895)
- `layout.css` — report-container with watermark pseudo-elements (lines 773-824)
- `components.css` — .evidence-item, .note, .meta-data styling (lines 867-964)

The detlogv3 CSS is battle-tested and defines the detective report aesthetic: monospace body, red headers, evidence items with red left-border, gold detective notes, SVG noise texture overlay.

### Step 5.4: Write template test

```javascript
// In __tests__/unit/template-assembler.test.js (add detective section)

describe('detective theme', () => {
  test('assembles detective report from ContentBundle', async () => {
    const assembler = createTemplateAssembler('detective');
    await assembler.initialize();

    const html = await assembler.assemble({
      headline: { main: 'Case #1221' },
      metadata: { theme: 'detective', sessionId: '1221' },
      sections: [
        { id: 'executiveSummary', type: 'narrative', content: [
          { type: 'paragraph', text: 'Marcus Blackwood is dead.' }
        ]}
      ],
      evidenceCards: [],
      pullQuotes: [],
      photos: [],
      financialTracker: []
    });

    expect(html).toContain('Marcus Blackwood is dead.');
    expect(html).toContain('detective');
    expect(html).not.toContain('NovaNews');
  });
});
```

### Step 5.5: Run test

Run: `npx jest __tests__/unit/template-assembler.test.js --verbose`
Expected: PASS

### Step 5.6: Commit

```bash
git add templates/detective/ __tests__/unit/template-assembler.test.js
git commit -m "feat: add detective Handlebars templates (layout, partials, CSS)"
```

---

## Task 6: Wire Theme Through Node Callers

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js` (lines that create PromptBuilder)
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js` (lines that access theme)
- Modify: `lib/workflow/nodes/evaluator-nodes.js` (NovaNews voice reference)

**Problem:** Several nodes create a `PromptBuilder` without passing theme. They need to read `state.theme` and pass it through.

### Step 6.1: Audit all PromptBuilder creation sites

Search: `createPromptBuilder` in `lib/workflow/nodes/`

Each call site should change from:
```javascript
const builder = createPromptBuilder();
```
To:
```javascript
const theme = state.theme || 'journalist';
const builder = createPromptBuilder({ theme });
```

### Step 6.2: Update evaluator-nodes.js

Line 168 has: `'Does article maintain NovaNews first-person participatory voice (I, my, we)?'`

Replace with theme-aware evaluation criteria:
```javascript
const voiceCriteria = theme === 'detective'
  ? 'Does report maintain detective investigative voice (third-person, professional)?'
  : 'Does article maintain NovaNews first-person participatory voice (I, my, we)?';
```

### Step 6.3: Write tests for theme passthrough

```javascript
// Verify that ai-nodes passes theme to PromptBuilder
test('generateContentBundle uses state.theme for prompts', async () => {
  const state = { ...getDefaultState(), theme: 'detective' };
  // Mock createPromptBuilder to capture arguments
  // Verify 'detective' was passed
});
```

### Step 6.4: Run full test suite

Run: `npm test`
Expected: PASS — all 800+ tests still green

### Step 6.5: Commit

```bash
git add lib/workflow/nodes/ai-nodes.js lib/workflow/nodes/arc-specialist-nodes.js lib/workflow/nodes/evaluator-nodes.js
git commit -m "feat: wire state.theme through all PromptBuilder callers and evaluators"
```

---

## Task 6B: Frontend Theme Selection

**Files:**
- Modify: `console/state.js` — add `theme` to state + SET_THEME action
- Modify: `console/components/SessionStart.js` — add theme toggle/selector
- Modify: `console/api.js` — pass `theme` from state instead of hardcoded `'journalist'`
- Modify: `console/app.js` — pass `theme` from state to API calls

**Problem:** `api.js` line 59 hardcodes `theme: 'journalist'`. No UI control exists for theme selection.

### Step 6B.1: Add theme to console state

In `console/state.js`, add to `initialState`:
```javascript
theme: 'journalist',  // 'journalist' | 'detective'
```

Add action:
```javascript
case 'SET_THEME':
  return { ...state, theme: action.theme };
```

### Step 6B.2: Add theme selector to SessionStart

In `console/components/SessionStart.js`, add a toggle or dropdown before the session ID input. Two clear options:

```jsx
<div className="theme-selector">
  <label className="form-label">Report Theme</label>
  <div className="theme-toggle">
    <button
      className={`theme-option ${theme === 'journalist' ? 'active' : ''}`}
      onClick={() => dispatch({ type: 'SET_THEME', theme: 'journalist' })}
    >
      NovaNews Article
    </button>
    <button
      className={`theme-option ${theme === 'detective' ? 'active' : ''}`}
      onClick={() => dispatch({ type: 'SET_THEME', theme: 'detective' })}
    >
      Detective Case Report
    </button>
  </div>
</div>
```

With descriptive subtitles:
- **NovaNews Article:** "First-person investigative journalism (~3000 words)"
- **Detective Case Report:** "Official case file by Det. Anondono (~750 words)"

### Step 6B.3: Wire theme through API calls

In `console/api.js`, change `startSession` to accept theme:

```javascript
async startSession(sessionId, rawInput, theme = 'journalist') {
  const res = await fetch(`/api/session/${sessionId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ theme, rawSessionInput: rawInput })
  });
  return res.json();
},
```

In `console/app.js`, pass `state.theme` when calling `api.startSession()`.

### Step 6B.4: Add CSS for theme selector

In `console/console.css`, add `.theme-selector` and `.theme-toggle` styles following existing button patterns. Use the noir theme's glass-panel aesthetic.

### Step 6B.5: Commit

```bash
git add console/state.js console/components/SessionStart.js console/api.js console/app.js console/console.css
git commit -m "feat: add theme selector to console frontend (journalist/detective toggle)"
```

---

## Task 7: Detective-Specific Reference Loader

**Files:**
- Modify: `lib/workflow/reference-loader.js`

**Problem:** `reference-loader.js` line 21 hardcodes: `const REFERENCES_DIR = path.join(__dirname, '../../.claude/skills/journalist-report/references/prompts')`. Nodes that use `loadReference()` will always get journalist prompts.

### Step 7.1: Make reference-loader theme-aware

Change the hardcoded path to accept a theme parameter:

```javascript
function getReferencesDir(theme = 'journalist') {
  return path.join(__dirname, '../../.claude/skills', `${theme}-report`, 'references/prompts');
}

// Update loadReference to accept theme
async function loadReference(name, theme = 'journalist') {
  const dir = getReferencesDir(theme);
  // ... existing logic with new dir
}
```

### Step 7.2: Update callers

Nodes calling `loadReference()` need to pass `state.theme`. Audit and update.

### Step 7.3: Commit

```bash
git add lib/workflow/reference-loader.js
git commit -m "feat: theme-aware reference-loader (resolves prompts per theme)"
```

---

## Task 8: Integration Test — Detective E2E

**Files:**
- Test with: `node scripts/e2e-walkthrough.js --session 1221 --theme detective --step`

**Approach:** Run the E2E walkthrough with `--theme detective` flag against an existing session with data. Verify each checkpoint produces reasonable output. This is manual verification, not automated.

### Step 8.1: Add --theme flag to e2e-walkthrough.js

The E2E script sends `theme` in the `/start` POST body. Add CLI flag:

```javascript
// In scripts/e2e-walkthrough.js argument parsing
.option('--theme <theme>', 'Report theme (journalist|detective)', 'journalist')
```

### Step 8.2: Run detective pipeline manually

```bash
node scripts/e2e-walkthrough.js --session 1221 --theme detective --step
```

Walk through each checkpoint. Verify:
- [ ] Input parsing works (theme-agnostic)
- [ ] Paper evidence selection works (theme-agnostic)
- [ ] Photo analysis works (theme-agnostic prompts)
- [ ] Arc analysis uses detective framing
- [ ] Outline shows detective sections (Evidence Locker, Suspect Network, etc.)
- [ ] Article uses detective voice (third-person, names in `<strong>`)
- [ ] HTML assembly produces detective-styled single-column report
- [ ] Report is ~750 words, not ~3000

### Step 8.3: Commit E2E flag addition

```bash
git add scripts/e2e-walkthrough.js
git commit -m "feat: add --theme flag to e2e-walkthrough for detective testing"
```

---

## Task 9: Remove VALID_THEMES Comment & Update Docs

**Files:**
- Modify: `server.js` — remove the "not yet implemented" comment (line 266)
- Modify: `CLAUDE.md` (reports) — update Theme System section
- Modify: `docs/PIPELINE_DEEP_DIVE.md` — add theme documentation

### Step 9.1: Update server.js comment

Remove:
```javascript
// NOTE: 'detective' theme accepted by API but not yet implemented in LangGraph pipeline.
// All workflow nodes default to 'journalist'. See Phase 4 roadmap for detective implementation.
```

Replace with:
```javascript
// Both themes fully supported by LangGraph pipeline.
// 'journalist' = NovaNews investigative article (first-person, ~3000 words)
// 'detective' = Detective Anondono case file (third-person, ~750 words)
```

### Step 9.2: Update CLAUDE.md

Add to Architecture section:
- Theme system overview (how themes work)
- How to add a new theme (4 steps: config, prompts, templates, PromptBuilder framing)

### Step 9.3: Commit

```bash
git add server.js CLAUDE.md docs/PIPELINE_DEEP_DIVE.md
git commit -m "docs: update theme system documentation and remove 'not yet implemented' comment"
```

---

## Task 10: Final Verification

### Step 10.1: Full test suite

Run: `npm test`
Expected: All tests pass

### Step 10.2: Coverage check

Run: `npm run test:coverage`
Expected: Coverage thresholds met (80% lines/functions, 70% branches)

### Step 10.3: Server startup

Run: `npm start`
Expected: Server starts without errors, both themes validate

### Step 10.4: Console frontend verification

Navigate to `/console`, select "detective" theme, start a session. Verify pipeline progresses through checkpoints with detective-appropriate content.

### Step 10.5: Journalist regression

Run: `node scripts/e2e-walkthrough.js --session 1221 --step`
Expected: Journalist theme still works identically (no regression)

---

## Execution Dependencies

```
Task 1 (detective config) ───────────────────┐
                                              │
Task 2 (theme-aware ThemeLoader) ─────────────┤
                                              ├──> Task 6 (wire theme through nodes)
Task 3 (detective prompt files) ──────────────┤        │
                                              │        ├──> Task 8 (E2E integration test)
Task 4 (theme-aware PromptBuilder) ───────────┘        │
                                                       │
Task 5 (detective templates) ─────────────────────────┘
                                                       │
Task 6B (frontend theme selector) ────────────────────┘
                                                       │
Task 7 (theme-aware reference-loader) ────────────────┘
                                                       │
                                              Task 9 (docs) ──> Task 10 (verify)
```

- **Tasks 1-5, 6B** are independently implementable (no cross-dependencies)
- **Task 6** depends on Tasks 2+4 (needs theme-aware ThemeLoader/PromptBuilder to wire through)
- **Task 6B** is independent (pure frontend, no backend dependency)
- **Task 8** depends on all prior tasks (full E2E test requires everything wired)
- **Tasks 9-10** are cleanup after E2E passes

---

## Risk Assessment

**Low risk:**
- Tasks 1, 3, 5, 9 are purely additive (new config, new files, new docs)
- Template system already supports `templates/{theme}/` by design
- `theme-config.js` explicitly designed for Open/Closed extension

**Medium risk:**
- Tasks 2, 4 modify shared infrastructure (ThemeLoader, PromptBuilder)
- Task 6 touches multiple node files
- Backwards compatibility: all existing callers must keep working

**Mitigations:**
- Legacy string argument support in `createThemeLoader`
- Default to `'journalist'` everywhere for backwards compatibility
- Full test suite run after each task
- E2E regression check for journalist theme (Task 10.5)
