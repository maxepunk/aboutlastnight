# Pipeline Quality Improvements: 0307 Session Retrospective

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce manual post-pipeline edits by fixing 5 issues identified from the 0307 session: orphaned financial data, hardcoded reporting mode, wrong temporal conventions, missing byline instruction, and hardcoded journalist name.

**Architecture:** Extend director notes parsing to extract session overrides (reporting mode, journalist name, guest reporter). Thread `sessionConfig` + `orchestratorParsed` through PromptBuilder to all prompt phases. Add deterministic financial data assembly and programmatic validation.

**Tech Stack:** Node.js, Jest, LangGraph state, Claude Agent SDK (sdkQuery), Handlebars templates

---

## Group A: Infrastructure (Director Notes Extraction + PromptBuilder Access)

These tasks create the shared plumbing that Groups B, C, and D depend on.

### Task A1: Extend DIRECTOR_NOTES_SCHEMA with session overrides

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js:182-207` (schema) and `:478-488` (prompt)
- Test: `lib/__tests__/input-nodes.test.js` (create if needed)

**Step 1: Write the failing test**

Create test file if it doesn't exist. Test that the extended schema accepts new fields:

```javascript
// lib/__tests__/input-nodes-schema.test.js
const { _testing } = require('../workflow/nodes/input-nodes');
const { DIRECTOR_NOTES_SCHEMA } = _testing;

describe('DIRECTOR_NOTES_SCHEMA extensions', () => {
  it('should include reportingMode property', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode.enum).toEqual(['on-site', 'remote']);
  });

  it('should include journalistFirstName property', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.journalistFirstName).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.journalistFirstName.type).toBe('string');
  });

  it('should include guestReporter property', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter.type).toBe('object');
  });

  it('should NOT require new fields (they are optional overrides)', () => {
    expect(DIRECTOR_NOTES_SCHEMA.required).toEqual(['observations']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`
Expected: FAIL — `reportingMode` property not defined on schema

**Step 3: Implement schema extension**

In `lib/workflow/nodes/input-nodes.js`, extend `DIRECTOR_NOTES_SCHEMA` (line 182):

```javascript
const DIRECTOR_NOTES_SCHEMA = {
  type: 'object',
  required: ['observations'],
  properties: {
    observations: {
      type: 'object',
      properties: {
        behaviorPatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Observed behavior patterns during gameplay'
        },
        suspiciousCorrelations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suspected connections between players/events'
        },
        notableMoments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key moments during the session'
        }
      }
    },
    reportingMode: {
      type: 'string',
      enum: ['on-site', 'remote'],
      description: 'Whether the journalist was physically present (on-site) or receiving tips remotely (remote). Infer from director notes — e.g. "not on site" or "received tips remotely" = remote.'
    },
    journalistFirstName: {
      type: 'string',
      description: 'First name of the journalist NPC for this session. Default is "Cassandra" if not mentioned.'
    },
    guestReporter: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the guest reporter' },
        role: { type: 'string', description: 'Role descriptor (e.g. "Guest Reporter", "Field Correspondent")' }
      },
      description: 'If a player or NPC is credited as guest/co-reporter, extract their name and role here. Only populate if director notes explicitly mention a guest reporter or co-author.'
    }
  }
};
```

**Step 4: Update Step 3 parsing prompt**

In the same file, update the Step 3 prompt (line 478) to instruct the LLM to extract these fields:

```javascript
    const directorNotesPrompt = `Parse the following director observations into categorized lists AND extract session overrides:

DIRECTOR NOTES:
${rawInput.directorNotes}

Categories:
1. behaviorPatterns: Observable behaviors (who talked to whom, what they did)
2. suspiciousCorrelations: Suspected connections, possible pseudonyms, theories
3. notableMoments: Key moments or events worth highlighting

Session Overrides (extract if mentioned, omit if not):
4. reportingMode: Was the journalist physically present ("on-site") or receiving tips remotely ("remote")? Look for phrases like "not on site", "received tips remotely", "was present at the scene", etc. If unclear, omit this field.
5. journalistFirstName: The journalist's first name if explicitly mentioned (e.g. "Cassandra Nova", "Nova"). If not mentioned, omit this field.
6. guestReporter: If any player or character is credited as a guest reporter, co-reporter, or contributor to the article, extract their name and role. Only include if explicitly stated in director notes.

Return structured JSON matching the schema.`;
```

**Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/workflow/nodes/input-nodes.js lib/__tests__/input-nodes-schema.test.js
git commit -m "feat: extend DIRECTOR_NOTES_SCHEMA with reportingMode, journalistFirstName, guestReporter"
```

---

### Task A2: Populate sessionConfig with director note overrides

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js:519-535` (post-parse merge)
- Test: `lib/__tests__/input-nodes-schema.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('parseRawInput session config population', () => {
  it('should merge reportingMode from director notes into sessionConfig', async () => {
    // This tests the merge logic, not the full parse
    // We verify that directorNotes overrides flow to sessionConfig
    const mockDirectorNotes = {
      observations: { behaviorPatterns: [], suspiciousCorrelations: [], notableMoments: [] },
      reportingMode: 'remote',
      journalistFirstName: 'Cassandra',
      guestReporter: { name: 'Ashe Motoko', role: 'Guest Reporter' }
    };

    // Test the merge function we're about to create
    const { mergeDirectorOverrides } = require('../workflow/nodes/input-nodes')._testing;
    const sessionConfig = { roster: ['Alex'], journalistName: 'Cassandra' };
    const merged = mergeDirectorOverrides(sessionConfig, mockDirectorNotes);

    expect(merged.reportingMode).toBe('remote');
    expect(merged.journalistFirstName).toBe('Cassandra');
    expect(merged.guestReporter).toEqual({ name: 'Ashe Motoko', role: 'Guest Reporter' });
  });

  it('should default reportingMode to on-site when not specified', () => {
    const { mergeDirectorOverrides } = require('../workflow/nodes/input-nodes')._testing;
    const sessionConfig = { roster: ['Alex'], journalistName: 'Cassandra' };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);

    expect(merged.reportingMode).toBe('on-site');
  });

  it('should default journalistFirstName to "Cassandra" when not specified', () => {
    const { mergeDirectorOverrides } = require('../workflow/nodes/input-nodes')._testing;
    const sessionConfig = { roster: ['Alex'], journalistName: 'Cassandra' };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);

    expect(merged.journalistFirstName).toBe('Cassandra');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`
Expected: FAIL — `mergeDirectorOverrides` is not exported

**Step 3: Implement merge function**

Add helper function in `input-nodes.js` (above the `parseRawInput` function):

```javascript
/**
 * Merge director note overrides into sessionConfig
 * Applies defaults when director notes don't specify values
 */
function mergeDirectorOverrides(sessionConfig, directorNotes) {
  return {
    ...sessionConfig,
    reportingMode: directorNotes?.reportingMode || 'on-site',
    journalistFirstName: directorNotes?.journalistFirstName || sessionConfig?.journalistName || 'Cassandra',
    guestReporter: directorNotes?.guestReporter || null
  };
}
```

Then call it after the Promise.allSettled block (around line 535):

```javascript
  console.log('[parseRawInput] Steps 1-3 complete');

  // Merge director note overrides into sessionConfig
  sessionConfig = mergeDirectorOverrides(sessionConfig, directorNotes);
  console.log(`[parseRawInput] Reporting mode: ${sessionConfig.reportingMode}`);
  if (sessionConfig.guestReporter) {
    console.log(`[parseRawInput] Guest reporter: ${sessionConfig.guestReporter.name}`);
  }
```

Export in `_testing`:

```javascript
_testing: {
  DEFAULT_DATA_DIR,
  SESSION_CONFIG_SCHEMA,
  SESSION_REPORT_SCHEMA,
  DIRECTOR_NOTES_SCHEMA,
  WHITEBOARD_SCHEMA,
  deriveSessionId,
  ensureDir,
  sanitizePath,
  mergeDirectorOverrides
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/nodes/input-nodes.js lib/__tests__/input-nodes-schema.test.js
git commit -m "feat: merge director note overrides (reportingMode, journalistFirstName, guestReporter) into sessionConfig"
```

---

### Task A3: Add orchestratorParsed.shellAccounts to state

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js:527-529` (orchestratorParsed merge)
- Modify: `lib/workflow/state.js` (add shellAccounts annotation if needed)

**Step 1: Verify current data flow**

Check that `orchestratorParsed.shellAccounts` exists but is not merged into `sessionConfig`. Currently (line 527-529):

```javascript
const orchestratorParsed = step2Result.status === 'fulfilled'
  ? step2Result.value
  : { exposedTokens: [], buriedTokens: [], shellAccounts: [], ... };
```

The `shellAccounts` data is in `orchestratorParsed` but never reaches the prompt builder. It needs to be accessible via state.

**Step 2: Write the failing test**

```javascript
describe('shellAccounts state propagation', () => {
  it('should include shellAccounts in orchestratorParsed state update', () => {
    // Verify the return value of parseRawInput includes shellAccounts
    // in a location accessible to downstream nodes
    const { mergeDirectorOverrides } = require('../workflow/nodes/input-nodes')._testing;
    const sessionConfig = { roster: ['Alex'] };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);

    // shellAccounts should NOT be in sessionConfig (it comes from orchestratorParsed)
    // This test verifies the separation is correct
    expect(merged.shellAccounts).toBeUndefined();
  });
});
```

The real verification is that the `parseRawInput` node returns `orchestratorParsed` in state. Check the node's return statement to confirm `orchestratorParsed` is already in the returned state object.

**Step 3: Trace the data path**

Read the `parseRawInput` return statement to verify `orchestratorParsed` is already in the returned state. If it is, the data is already available via `state.orchestratorParsed.shellAccounts`. The gap is in the PromptBuilder, which doesn't receive it (fixed in Task A4).

**Step 4: Run test**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`
Expected: PASS

**Step 5: Commit (if changes needed)**

```bash
git add lib/workflow/nodes/input-nodes.js lib/__tests__/input-nodes-schema.test.js
git commit -m "chore: verify shellAccounts available in state via orchestratorParsed"
```

---

### Task A4: Give PromptBuilder access to sessionConfig

**Files:**
- Modify: `lib/prompt-builder.js:138-141` (constructor)
- Modify: `lib/workflow/nodes/ai-nodes.js:56-60` (getPromptBuilder factory)
- Test: `lib/__tests__/prompt-builder.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('PromptBuilder sessionConfig access', () => {
  it('should accept sessionConfig as optional third parameter', () => {
    const mockLoader = { loadPhasePrompts: jest.fn(), loadTemplate: jest.fn(), validate: jest.fn() };
    const sessionConfig = { reportingMode: 'remote', journalistFirstName: 'Cassandra' };
    const builder = new PromptBuilder(mockLoader, 'journalist', sessionConfig);

    expect(builder.sessionConfig).toEqual(sessionConfig);
  });

  it('should default sessionConfig to empty object when not provided', () => {
    const mockLoader = { loadPhasePrompts: jest.fn(), loadTemplate: jest.fn(), validate: jest.fn() };
    const builder = new PromptBuilder(mockLoader, 'journalist');

    expect(builder.sessionConfig).toEqual({});
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: FAIL — `builder.sessionConfig` is undefined

**Step 3: Implement constructor change**

In `lib/prompt-builder.js`, update the constructor (line 138):

```javascript
  constructor(themeLoader, themeName = 'journalist', sessionConfig = {}) {
    this.theme = themeLoader;
    this.themeName = themeName;
    this.sessionConfig = sessionConfig;
  }
```

**Step 4: Update getPromptBuilder factory**

In `lib/workflow/nodes/ai-nodes.js`, update `getPromptBuilder` (line 56):

```javascript
function getPromptBuilder(config, state) {
  if (config?.configurable?.promptBuilder) return config.configurable.promptBuilder;
  const theme = state?.theme || 'journalist';
  const sessionConfig = state?.sessionConfig || {};
  return createPromptBuilder({ theme, sessionConfig });
}
```

Also update `createPromptBuilder` in `lib/prompt-builder.js` to pass through `sessionConfig`:

```javascript
function createPromptBuilder({ theme = 'journalist', sessionConfig = {} } = {}) {
  const themeLoader = createThemeLoader(theme);
  return new PromptBuilder(themeLoader, theme, sessionConfig);
}
```

**Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/prompt-builder.js lib/workflow/nodes/ai-nodes.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: give PromptBuilder access to sessionConfig via constructor and factory"
```

---

### Task A5: Add resolvePromptVariables utility

**Files:**
- Modify: `lib/prompt-builder.js` (add method)
- Test: `lib/__tests__/prompt-builder.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('resolvePromptVariables', () => {
  it('should replace {{JOURNALIST_FIRST_NAME}} with sessionConfig value', () => {
    const mockLoader = { loadPhasePrompts: jest.fn(), loadTemplate: jest.fn(), validate: jest.fn() };
    const builder = new PromptBuilder(mockLoader, 'journalist', { journalistFirstName: 'Cassandra' });

    const input = 'Nova (first name configurable via {{JOURNALIST_FIRST_NAME}}) is the journalist.';
    const result = builder.resolvePromptVariables(input);

    expect(result).toBe('Nova (first name configurable via Cassandra) is the journalist.');
  });

  it('should replace {{REPORTING_MODE}} with sessionConfig value', () => {
    const mockLoader = { loadPhasePrompts: jest.fn(), loadTemplate: jest.fn(), validate: jest.fn() };
    const builder = new PromptBuilder(mockLoader, 'journalist', { reportingMode: 'remote' });

    const result = builder.resolvePromptVariables('Mode: {{REPORTING_MODE}}');
    expect(result).toBe('Mode: remote');
  });

  it('should use defaults when sessionConfig values are missing', () => {
    const mockLoader = { loadPhasePrompts: jest.fn(), loadTemplate: jest.fn(), validate: jest.fn() };
    const builder = new PromptBuilder(mockLoader, 'journalist', {});

    const result = builder.resolvePromptVariables('{{JOURNALIST_FIRST_NAME}} Nova');
    expect(result).toBe('Cassandra Nova');
  });

  it('should handle null/empty input gracefully', () => {
    const mockLoader = { loadPhasePrompts: jest.fn(), loadTemplate: jest.fn(), validate: jest.fn() };
    const builder = new PromptBuilder(mockLoader, 'journalist', {});

    expect(builder.resolvePromptVariables('')).toBe('');
    expect(builder.resolvePromptVariables(null)).toBe('');
    expect(builder.resolvePromptVariables(undefined)).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: FAIL — `resolvePromptVariables` is not a function

**Step 3: Implement resolvePromptVariables**

Add method to `PromptBuilder` class in `lib/prompt-builder.js`:

```javascript
  /**
   * Resolve template variables in prompt text using sessionConfig values
   * Variables use {{VARIABLE_NAME}} format (matching existing prompt conventions)
   *
   * @param {string} text - Prompt text with template variables
   * @returns {string} Text with variables resolved
   */
  resolvePromptVariables(text) {
    if (!text) return '';

    const variables = {
      JOURNALIST_FIRST_NAME: this.sessionConfig.journalistFirstName || 'Cassandra',
      REPORTING_MODE: this.sessionConfig.reportingMode || 'on-site'
    };

    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] !== undefined ? variables[varName] : match;
    });
  }
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: add resolvePromptVariables to PromptBuilder for template variable resolution"
```

---

### Task A6: Wire resolvePromptVariables into prompt assembly

**Files:**
- Modify: `lib/prompt-builder.js:154-175` (buildArcAnalysisPrompt), `:217+` (buildOutlinePrompt), `:700+` (buildArticlePrompt)
- Test: `lib/__tests__/prompt-builder.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('prompt variable resolution in build methods', () => {
  it('buildArcAnalysisPrompt should resolve variables in loaded prompts', async () => {
    const mockLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': 'Nova ({{JOURNALIST_FIRST_NAME}}) is the journalist.',
        'evidence-boundaries': 'Boundaries text',
        'narrative-structure': 'Structure text',
        'anti-patterns': 'Anti-patterns text'
      }),
      loadTemplate: jest.fn(),
      validate: jest.fn()
    };
    const builder = new PromptBuilder(mockLoader, 'journalist', { journalistFirstName: 'Athena' });

    const sessionData = {
      roster: ['Alex'],
      accusation: 'Jess Kane',
      directorNotes: { observations: {} },
      evidenceBundle: {}
    };

    const { systemPrompt } = await builder.buildArcAnalysisPrompt(sessionData);
    expect(systemPrompt).toContain('Nova (Athena) is the journalist.');
    expect(systemPrompt).not.toContain('{{JOURNALIST_FIRST_NAME}}');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: FAIL — `{{JOURNALIST_FIRST_NAME}}` still present

**Step 3: Apply resolvePromptVariables in each build method**

In `buildArcAnalysisPrompt` (line ~157), wrap each loaded prompt through resolution:

```javascript
  async buildArcAnalysisPrompt(sessionData) {
    const rawPrompts = await this.theme.loadPhasePrompts('arcAnalysis');
    const prompts = Object.fromEntries(
      Object.entries(rawPrompts).map(([k, v]) => [k, this.resolvePromptVariables(v)])
    );
    // ... rest unchanged
```

Apply the same pattern to `buildOutlinePrompt` and `buildArticlePrompt` — wrap the `loadPhasePrompts` call with variable resolution.

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: resolve template variables ({{JOURNALIST_FIRST_NAME}}, etc.) in all prompt build methods"
```

---

## Group B: Temporal Discipline + Reporting Mode

Depends on: Group A (sessionConfig access, resolvePromptVariables)

### Task B1: Rewrite TEMPORAL_DISCIPLINE with correct conventions

**Files:**
- Modify: `lib/prompt-builder.js:732-740` (TEMPORAL_DISCIPLINE section)
- Test: `lib/__tests__/prompt-builder.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('TEMPORAL_DISCIPLINE content', () => {
  it('should include "LAST NIGHT" for party timeline', async () => {
    const mockLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'arc-flow': '', 'anti-patterns': ''
      }),
      loadTemplate: jest.fn().mockResolvedValue('template'),
      validate: jest.fn()
    };
    const builder = new PromptBuilder(mockLoader, 'journalist', { reportingMode: 'on-site' });

    const { userPrompt } = await builder.buildArticlePrompt(
      { sections: [] }, {}, 'template', [], 'hero.jpg'
    );

    expect(userPrompt).toContain('LAST NIGHT');
    expect(userPrompt).toContain('THIS MORNING');
    expect(userPrompt).toMatch(/party.*last night/i);
    expect(userPrompt).toMatch(/investigation.*this morning/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: FAIL — current text says "past" and "present", not "LAST NIGHT" and "THIS MORNING"

**Step 3: Rewrite TEMPORAL_DISCIPLINE**

In `lib/prompt-builder.js`, replace lines 732-740:

```javascript
<TEMPORAL_DISCIPLINE>
CRITICAL: THREE TIMELINES — get them right or the article makes no sense.

1. THE PARTY (LAST NIGHT): Marcus's party where the death occurred. Events known ONLY through extracted memories.
2. THE INVESTIGATION (THIS MORNING): Party attendees woke up with holes in their memories. Nova ${this.sessionConfig.reportingMode === 'remote' ? 'received real-time tips from investigators' : 'was physically present, witnessing the investigation firsthand'}.
3. THE ARTICLE (NOW): Written immediately after the investigation concluded.

LANGUAGE RULES:
- Party events: "Last night..." / "The memory shows..." / "In the recording..." — Nova was NOT at the party.
- Investigation events: "This morning..." / "I watched..." / "I saw..." — Nova ${this.sessionConfig.reportingMode === 'remote' ? 'received reports and tips as they happened' : 'directly witnessed these'}.
- Burial transactions are INVESTIGATION actions (this morning), NOT party events (last night).
- NEVER treat a party event and investigation event as simultaneous.
- NEVER say "tonight" — the party was last night, the investigation was this morning.
</TEMPORAL_DISCIPLINE>
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "fix: rewrite TEMPORAL_DISCIPLINE with correct last night/this morning/now conventions"
```

---

### Task B2: Update system prompt temporal rule

**Files:**
- Modify: `lib/prompt-builder.js:53-60` (THEME_SYSTEM_PROMPTS.journalist.articleGeneration)
- Test: `lib/__tests__/prompt-builder.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('articleGeneration system prompt', () => {
  it('should reference last night/this morning timeline', async () => {
    const mockLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'arc-flow': '', 'anti-patterns': ''
      }),
      loadTemplate: jest.fn().mockResolvedValue('template'),
      validate: jest.fn()
    };
    const builder = new PromptBuilder(mockLoader, 'journalist', { reportingMode: 'on-site' });

    const { systemPrompt } = await builder.buildArticlePrompt(
      { sections: [] }, {}, 'template', [], 'hero.jpg'
    );

    expect(systemPrompt).toContain('last night');
    expect(systemPrompt).toContain('this morning');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: FAIL — current text says "THE INVESTIGATION (the game session)"

**Step 3: Update system prompt**

Replace `THEME_SYSTEM_PROMPTS.journalist.articleGeneration` (line 53):

```javascript
    articleGeneration: `You are Nova, writing a NovaNews investigative article. First-person participatory voice.

CRITICAL TEMPORAL RULE: THE PARTY happened LAST NIGHT. THE INVESTIGATION happened THIS MORNING.
You are writing the article NOW, immediately after the investigation concluded.
- Memory CONTENT describes party events from LAST NIGHT. Nova was NOT at the party.
- Director observations describe investigation events from THIS MORNING.
- "I watched" / "I saw" = investigation behavior from this morning.
- "The memory shows" / "In the recording" = party events from last night.
- Burial transactions are investigation actions (this morning), NOT party events.`,
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "fix: update articleGeneration system prompt with correct last night/this morning timeline"
```

---

### Task B3: Parameterize reporting mode in character-voice.md

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/character-voice.md:10-11` and `:97-128`

**Step 1: Identify hardcoded on-site language**

Lines 10-11 say: "Was surveilling the party, entered after the emergency alert"
Lines 97-128 contain POV examples that assume physical presence.

These are prompt reference files loaded by ThemeLoader. The `resolvePromptVariables` from Task A6 will handle `{{JOURNALIST_FIRST_NAME}}` but reporting mode needs conditional blocks.

**Step 2: Update character-voice.md background section**

Replace lines 10-11:

```markdown
- Was surveilling the party, entered after the emergency alert (DEFAULT — override via reportingMode)
- When reportingMode is "remote": Was monitoring from off-site, receiving real-time tips from investigators on the ground
```

**Note:** Since this is a prompt reference (not code), the PromptBuilder's `TEMPORAL_DISCIPLINE` section (Task B1) already handles the runtime parameterization. The character-voice.md provides the LLM with context about Nova's identity. The key fix is ensuring the `TEMPORAL_DISCIPLINE` block (which IS code-generated and parameterized) takes precedence via recency bias.

**Step 3: Add reporting mode awareness to POV section**

After line 128, add:

```markdown
**REPORTING MODE OVERRIDE:**
When reportingMode is "remote", Nova received tips and evidence digitally. Adjust participatory language:
- "I was in that room" → "The tip came through at 3AM"
- "I watched [Character]" → "My source described [Character]"
- "Standing there, I could see" → "From what I was receiving"
- Nova can still be participatory (Thompson-esque) about the ACT of receiving/processing evidence
```

**Step 4: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/character-voice.md
git commit -m "feat: add reporting mode awareness to character-voice.md POV section"
```

---

### Task B4: Inject reporting mode context into arc analysis prompt

**Files:**
- Modify: `lib/prompt-builder.js:161-174` (arc analysis user prompt)
- Test: `lib/__tests__/prompt-builder.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('arc analysis reporting mode', () => {
  it('should include reporting mode context in arc analysis prompt', async () => {
    const mockLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': 'voice text', 'evidence-boundaries': 'boundaries',
        'narrative-structure': 'structure', 'anti-patterns': 'patterns'
      }),
      validate: jest.fn()
    };
    const builder = new PromptBuilder(mockLoader, 'journalist', { reportingMode: 'remote' });

    const { userPrompt } = await builder.buildArcAnalysisPrompt({
      roster: ['Alex'], accusation: 'Jess', directorNotes: {}, evidenceBundle: {}
    });

    expect(userPrompt).toContain('REPORTING MODE: remote');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: FAIL

**Step 3: Add reporting mode to arc analysis user prompt**

In `buildArcAnalysisPrompt`, after the ACCUSATION line (line ~163):

```javascript
    const userPrompt = `Analyze the following evidence for narrative arcs.

ROSTER: ${sessionData.roster.join(', ')}
ACCUSATION: ${sessionData.accusation}
REPORTING MODE: ${this.sessionConfig.reportingMode || 'on-site'}
NOTE: The party was LAST NIGHT. The investigation was THIS MORNING. The article is being written NOW.

DIRECTOR OBSERVATIONS (PRIMARY WEIGHT - INVESTIGATION THIS MORNING, Nova ${this.sessionConfig.reportingMode === 'remote' ? 'received tips remotely' : 'witnessed this'}):
${JSON.stringify(sessionData.directorNotes?.observations || {}, null, 2)}
...
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: inject reporting mode and temporal context into arc analysis prompt"
```

---

## Group C: Byline Generation

Depends on: Group A (sessionConfig access)

### Task C1: Add byline to journalist GENERATION_INSTRUCTION

**Files:**
- Modify: `lib/prompt-builder.js:832-914` (GENERATION_INSTRUCTION)
- Test: `lib/__tests__/prompt-builder.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('byline generation instruction', () => {
  it('should include byline instruction in journalist article prompt', async () => {
    const mockLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'arc-flow': '', 'anti-patterns': ''
      }),
      loadTemplate: jest.fn().mockResolvedValue('template'),
      validate: jest.fn()
    };
    const builder = new PromptBuilder(mockLoader, 'journalist', {
      journalistFirstName: 'Cassandra',
      guestReporter: null
    });

    const { userPrompt } = await builder.buildArticlePrompt(
      { sections: [] }, {}, 'template', [], 'hero.jpg'
    );

    expect(userPrompt).toContain('byline');
    expect(userPrompt).toContain('author');
  });

  it('should include guest reporter in byline instruction when present', async () => {
    const mockLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'arc-flow': '', 'anti-patterns': ''
      }),
      loadTemplate: jest.fn().mockResolvedValue('template'),
      validate: jest.fn()
    };
    const builder = new PromptBuilder(mockLoader, 'journalist', {
      journalistFirstName: 'Cassandra',
      guestReporter: { name: 'Ashe Motoko', role: 'Guest Reporter' }
    });

    const { userPrompt } = await builder.buildArticlePrompt(
      { sections: [] }, {}, 'template', [], 'hero.jpg'
    );

    expect(userPrompt).toContain('Ashe Motoko');
    expect(userPrompt).toContain('Guest Reporter');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: FAIL — no byline instruction exists

**Step 3: Add byline item to GENERATION_INSTRUCTION**

In the journalist GENERATION_INSTRUCTION block (after item 7, before `</GENERATION_INSTRUCTION>`), add:

```javascript
8. "byline" - Article byline object:
   - "author": "${this.sessionConfig.journalistFirstName || 'Cassandra'} Nova | NovaNews"
   - "title": "Senior Investigative Correspondent"${this.sessionConfig.guestReporter ? `
   - "guestReporter": "${this.sessionConfig.guestReporter.name} | ${this.sessionConfig.guestReporter.role}"` : ''}
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: add byline generation instruction with guest reporter support"
```

---

### Task C2: Update header.hbs for guest reporter and dynamic date

**Files:**
- Modify: `templates/journalist/partials/header.hbs:27-43`

**Step 1: Update template**

Replace lines 27-43:

```handlebars
  {{!-- Article Metadata: Byline + Date + Article ID --}}
  <div class="nn-article__meta">
    {{#if byline.author}}
    <span class="nn-article__byline">
      {{byline.author}}{{#if byline.title}} | {{byline.title}}{{/if}}
    </span>
    {{#if byline.guestReporter}}
    <span class="nn-article__guest-reporter">
      with {{byline.guestReporter}}
    </span>
    {{/if}}
    <span class="nn-article__divider">·</span>
    {{/if}}

    <time class="nn-article__date" datetime="{{formatDatetime metadata.generatedAt}}">
      {{formatDate metadata.generatedAt}}
    </time>

    <span class="nn-article__divider">·</span>

    <span class="nn-article__id">Article {{articleId metadata}}</span>
  </div>
```

**Note:** The `formatDate` helper needs to exist in the template assembler. Check if it already does — if not, add it. The hardcoded "February 22, 2027" is removed in favor of `formatDate`.

**Step 2: Verify formatDate helper exists**

Check `lib/template-assembler.js` for Handlebars helper registration. If `formatDate` doesn't exist, add it:

```javascript
Handlebars.registerHelper('formatDate', function(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
});
```

**Step 3: Add CSS for guest reporter**

In the journalist theme CSS file, add:

```css
.nn-article__guest-reporter {
  font-style: italic;
  margin-left: 0.25em;
}
```

**Step 4: Commit**

```bash
git add templates/journalist/partials/header.hbs lib/template-assembler.js
git commit -m "feat: update header.hbs for guest reporter byline and dynamic date"
```

---

### Task C3: Wire byline data through template assembler

**Files:**
- Modify: `lib/template-assembler.js` (ensure byline from contentBundle reaches template)

**Step 1: Verify data flow**

Check that `contentBundle.byline` is passed through to the Handlebars template context in the `buildTemplateData` method. The template expects `byline.author`, `byline.title`, and optionally `byline.guestReporter`.

If the template assembler already passes through all `contentBundle` fields, this may already work. If not, explicitly add `byline` to the template data.

**Step 2: Test by reviewing template-assembler.js**

Read the `buildTemplateData` method to confirm `byline` is included in the returned context object. If it's missing, add it alongside `headline`, `sections`, etc.

**Step 3: Commit if changes needed**

```bash
git add lib/template-assembler.js
git commit -m "feat: wire byline data through template assembler to header partial"
```

---

## Group D: Deterministic Financial Data

Depends on: Group A (sessionConfig/orchestratorParsed access in PromptBuilder)

### Task D1: Inject FINANCIAL_SUMMARY into outline and article prompts

**Files:**
- Modify: `lib/prompt-builder.js` (buildOutlinePrompt, buildArticlePrompt)
- Modify: `lib/workflow/nodes/ai-nodes.js` (pass shellAccounts to prompt builder methods)
- Test: `lib/__tests__/prompt-builder.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('financial summary in prompts', () => {
  it('buildOutlinePrompt should include FINANCIAL_SUMMARY when shellAccounts available', async () => {
    const mockLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'arc-flow': '', 'anti-patterns': ''
      }),
      loadTemplate: jest.fn().mockResolvedValue('template'),
      validate: jest.fn()
    };
    const shellAccounts = [
      { name: 'Cayman', total: 1455000, tokenCount: 9 },
      { name: 'Sarah', total: 350000, tokenCount: 1 }
    ];
    const builder = new PromptBuilder(mockLoader, 'journalist', {});

    const { userPrompt } = await builder.buildOutlinePrompt(
      { narrativeArcs: [] }, [], 'hero.jpg', {}, [], [], shellAccounts
    );

    expect(userPrompt).toContain('FINANCIAL_SUMMARY');
    expect(userPrompt).toContain('Cayman');
    expect(userPrompt).toContain('$1,455,000');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: FAIL — no FINANCIAL_SUMMARY section

**Step 3: Add shellAccounts parameter and FINANCIAL_SUMMARY section**

Update `buildOutlinePrompt` signature to accept `shellAccounts` as a new parameter:

```javascript
  async buildOutlinePrompt(arcAnalysis, selectedArcs, heroImage, evidenceBundle, availablePhotos, arcEvidencePackages, shellAccounts = []) {
```

Add a `FINANCIAL_SUMMARY` section to the outline user prompt (after DATA_CONTEXT, before RULES):

```javascript
    const financialSummary = shellAccounts?.length ? `
<FINANCIAL_SUMMARY>
AUTHORITATIVE SHELL ACCOUNT DATA (use these exact figures in financialTracker):
${shellAccounts.filter(a => a.total > 0).map(a =>
  `- ${a.name}: $${a.total.toLocaleString()} (${a.tokenCount} token${a.tokenCount !== 1 ? 's' : ''})`
).join('\n')}
Total buried: $${shellAccounts.reduce((sum, a) => sum + a.total, 0).toLocaleString()}

These figures are DETERMINISTIC — do not estimate, round, or recalculate. Use exact values.
</FINANCIAL_SUMMARY>` : '';
```

Insert `${financialSummary}` into the user prompt.

Apply the same pattern to `buildArticlePrompt`.

**Step 4: Update ai-nodes.js to pass shellAccounts**

In `generateOutline` (line ~902):

```javascript
  const shellAccounts = state.orchestratorParsed?.shellAccounts || [];
  const { systemPrompt, userPrompt } = await promptBuilder.buildOutlinePrompt(
    arcAnalysis,
    state.selectedArcs || [],
    heroImage,
    state.evidenceBundle || {},
    availablePhotos,
    arcEvidencePackages,
    shellAccounts  // NEW: authoritative financial data
  );
```

Same for `generateArticle` (line ~1161).

**Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/prompt-builder.js lib/workflow/nodes/ai-nodes.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: inject FINANCIAL_SUMMARY with authoritative shell account data into outline and article prompts"
```

---

### Task D2: Programmatic financial validation in outline evaluator

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js` or create new validation in evaluator flow
- Test: extend existing test

**Step 1: Write the failing test**

```javascript
describe('validateFinancialData', () => {
  it('should flag financial tracker entries that deviate from shell account totals', () => {
    const { validateFinancialData } = require('../workflow/nodes/node-helpers');

    const financialTracker = {
      entries: [
        { name: 'Cayman', amount: '$1,455,000' },
        { name: 'Sarah', amount: '$125,000' }  // WRONG — should be $350,000
      ]
    };
    const shellAccounts = [
      { name: 'Cayman', total: 1455000 },
      { name: 'Sarah', total: 350000 }
    ];

    const issues = validateFinancialData(financialTracker, shellAccounts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('Sarah');
    expect(issues[0]).toContain('350,000');
  });

  it('should return empty array when all amounts match', () => {
    const { validateFinancialData } = require('../workflow/nodes/node-helpers');

    const financialTracker = {
      entries: [
        { name: 'Cayman', amount: '$1,455,000' },
        { name: 'Sarah', amount: '$350,000' }
      ]
    };
    const shellAccounts = [
      { name: 'Cayman', total: 1455000 },
      { name: 'Sarah', total: 350000 }
    ];

    const issues = validateFinancialData(financialTracker, shellAccounts);
    expect(issues).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/node-helpers.test.js -v` (or wherever this test lives)
Expected: FAIL — `validateFinancialData` not exported

**Step 3: Implement validateFinancialData**

Add to `lib/workflow/nodes/node-helpers.js`:

```javascript
/**
 * Validate financial tracker entries against authoritative shell account data
 * Returns array of issue strings (empty = valid)
 */
function validateFinancialData(financialTracker, shellAccounts) {
  if (!financialTracker?.entries?.length || !shellAccounts?.length) return [];

  const accountMap = new Map(
    shellAccounts.filter(a => a.total > 0).map(a => [a.name.toLowerCase(), a.total])
  );

  const issues = [];
  for (const entry of financialTracker.entries) {
    const name = entry.name || entry.account || '';
    const expectedTotal = accountMap.get(name.toLowerCase());
    if (expectedTotal === undefined) continue;

    const actualAmount = typeof entry.amount === 'number'
      ? entry.amount
      : parseFloat(String(entry.amount).replace(/[$,]/g, '')) || 0;

    if (actualAmount !== expectedTotal) {
      issues.push(
        `Financial mismatch: "${name}" shows $${actualAmount.toLocaleString()} but authoritative data is $${expectedTotal.toLocaleString()}`
      );
    }
  }

  return issues;
}
```

Export it from node-helpers.js.

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/node-helpers.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/nodes/node-helpers.js lib/__tests__/node-helpers.test.js
git commit -m "feat: add validateFinancialData programmatic checker for shell account totals"
```

---

### Task D3: Deterministic financial tracker override in template assembler

**Files:**
- Modify: `lib/template-assembler.js:322-366` (financial tracker assembly)
- Test: extend template-assembler tests

**Step 1: Write the failing test**

```javascript
describe('deterministic financial tracker', () => {
  it('should override LLM-generated financial data with shellAccounts when available', () => {
    const assembler = new TemplateAssembler('journalist');
    const contentBundle = {
      financialTracker: {
        entries: [
          { name: 'Cayman', amount: '$1,000,000' },  // LLM got this wrong
          { name: 'Sarah', amount: '$125,000' }       // LLM got this wrong too
        ]
      }
    };
    const shellAccounts = [
      { name: 'Cayman', total: 1455000, tokenCount: 9 },
      { name: 'Sarah', total: 350000, tokenCount: 1 }
    ];

    const result = assembler.overrideFinancialTracker(contentBundle.financialTracker, shellAccounts);
    expect(result.entries[0].amount).toBe('$1,455,000');
    expect(result.entries[1].amount).toBe('$350,000');
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — `overrideFinancialTracker` not defined

**Step 3: Implement deterministic override**

Add method to `TemplateAssembler` class:

```javascript
  /**
   * Override LLM-generated financial tracker with deterministic shell account data
   * Preserves LLM-generated labels/descriptions but replaces amounts with authoritative values
   *
   * @param {Object} financialTracker - LLM-generated financial tracker
   * @param {Array} shellAccounts - Authoritative shell account data from orchestratorParsed
   * @returns {Object} Financial tracker with corrected amounts
   */
  overrideFinancialTracker(financialTracker, shellAccounts) {
    if (!financialTracker?.entries?.length || !shellAccounts?.length) return financialTracker;

    const accountMap = new Map(
      shellAccounts.filter(a => a.total > 0).map(a => [a.name.toLowerCase(), a])
    );

    const entries = financialTracker.entries.map(entry => {
      const name = entry.name || entry.account || '';
      const authoritative = accountMap.get(name.toLowerCase());
      if (!authoritative) return entry;

      return {
        ...entry,
        amount: `$${authoritative.total.toLocaleString()}`
      };
    });

    const totalExposed = shellAccounts.reduce((sum, a) => sum + a.total, 0);

    return {
      ...financialTracker,
      entries,
      totalExposed: `$${totalExposed.toLocaleString()}`
    };
  }
```

Call this in `buildTemplateData` before `_calculateBarWidths`:

```javascript
      // Override LLM-generated financial data with deterministic values
      const correctedTracker = this.overrideFinancialTracker(
        contentBundle.financialTracker,
        contentBundle._shellAccounts || []
      );

      financialTracker: correctedTracker ? {
        ...correctedTracker,
        entries: this._calculateBarWidths(correctedTracker.entries)
      } : null,
```

**Note:** The `_shellAccounts` field needs to be injected into the contentBundle or passed separately. The cleanest approach is to pass it via the template assembler's `assemble` method, which already receives the full state or a context object.

**Step 4: Run test to verify it passes**

Expected: PASS

**Step 5: Commit**

```bash
git add lib/template-assembler.js lib/__tests__/template-assembler.test.js
git commit -m "feat: deterministic financial tracker override using authoritative shell account data"
```

---

### Task D4: Wire shellAccounts through to template assembly

**Files:**
- Modify: `lib/workflow/nodes/template-nodes.js` (pass shellAccounts to assembler)

**Step 1: Find where template assembly is called**

Read `template-nodes.js` to find the `assembleArticle` node and how it calls the template assembler.

**Step 2: Add shellAccounts to assembly context**

Pass `state.orchestratorParsed?.shellAccounts` to the template assembler so it can perform the deterministic override:

```javascript
  // Inject shellAccounts for deterministic financial tracker
  const contentBundleWithFinancials = {
    ...contentBundle,
    _shellAccounts: state.orchestratorParsed?.shellAccounts || []
  };
```

**Step 3: Commit**

```bash
git add lib/workflow/nodes/template-nodes.js
git commit -m "feat: wire shellAccounts from orchestratorParsed to template assembler for deterministic financials"
```

---

## Cross-Cutting Verification

### Task V1: End-to-end verification with 0307 session data

**Files:**
- Use: `scripts/e2e-walkthrough.js`

**Step 1: Run e2e with 0307 session**

```bash
node scripts/e2e-walkthrough.js --session 0307 --fresh --step
```

**Step 2: Verify at each checkpoint**

At `input-review` checkpoint:
- [ ] `sessionConfig.reportingMode` is `"remote"` (from director notes: "not on site")
- [ ] `sessionConfig.journalistFirstName` is `"Cassandra"`
- [ ] `sessionConfig.guestReporter` has Ashe Motoko info

At `outline` checkpoint:
- [ ] TEMPORAL_DISCIPLINE references "last night" and "this morning"
- [ ] Financial tracker shows Sarah at $350,000 (not $125,000)
- [ ] Byline instruction is present in prompt

At `article` checkpoint:
- [ ] Byline includes "Cassandra Nova | NovaNews"
- [ ] Guest reporter mentioned in byline
- [ ] No "tonight" or wrong temporal language
- [ ] Financial tracker amounts match authoritative shell account data

**Step 3: Review final HTML output**

- [ ] Header has dynamic date (not hardcoded "February 22, 2027")
- [ ] Guest reporter appears in byline area
- [ ] Financial tracker bars show correct amounts

**Step 4: Commit any integration fixes**

```bash
git add -A
git commit -m "fix: integration fixes from e2e verification of pipeline quality improvements"
```

---

## Summary of Changes by File

| File | Changes |
|------|---------|
| `lib/workflow/nodes/input-nodes.js` | Extended DIRECTOR_NOTES_SCHEMA, added mergeDirectorOverrides, updated Step 3 prompt |
| `lib/prompt-builder.js` | Added sessionConfig param, resolvePromptVariables, TEMPORAL_DISCIPLINE rewrite, FINANCIAL_SUMMARY injection, byline instruction |
| `lib/workflow/nodes/ai-nodes.js` | Updated getPromptBuilder to pass sessionConfig, pass shellAccounts to prompt methods |
| `lib/workflow/nodes/node-helpers.js` | Added validateFinancialData |
| `lib/template-assembler.js` | Added overrideFinancialTracker, formatDate helper |
| `lib/workflow/nodes/template-nodes.js` | Wire shellAccounts to template assembly |
| `templates/journalist/partials/header.hbs` | Guest reporter support, dynamic date |
| `.claude/skills/journalist-report/references/prompts/character-voice.md` | Reporting mode awareness |
| Tests | `input-nodes-schema.test.js`, `prompt-builder.test.js`, `node-helpers.test.js`, `template-assembler.test.js` |
