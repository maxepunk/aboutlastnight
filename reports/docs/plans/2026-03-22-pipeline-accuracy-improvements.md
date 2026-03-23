# Pipeline Accuracy Improvements: Temporal Discipline, Character Data, Contradiction Surfacing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the four systemic error classes that produce factually incorrect reports — temporal conflation, character group misidentification, missing narrative tensions, and transaction mechanics confusion — through a combination of evidence pre-annotation, structured character data extraction, programmatic contradiction surfacing, and prompt clarification.

**Architecture:** Two waves. Wave 1 (Tasks A-B) modifies prompt assembly to annotate evidence with temporal context and clarify transaction mechanics — no new nodes, immediate testability. Wave 2 (Tasks C-F) adds two new graph nodes (`extractCharacterData` and `surfaceContradictions`) that produce structured data injected into all downstream prompts. Both waves modify `prompt-builder.js` at different entry points; cross-cutting concern is the shared `generateRosterSection()` method which gains character metadata in Task D.

**Tech Stack:** Node.js, LangGraph state annotations, Claude Agent SDK, Jest

---

## Error-to-Task Mapping

| Error Class | Root Cause | Fix | Task |
|-------------|-----------|------|------|
| Temporal conflation ("I watched Remi this morning" for party events) | Evidence items lack temporal markers; rules are distant from data in prompt | Pre-annotate evidence with `[RECOVERED MEMORY — PARTY]` / `[INVESTIGATION]` tags | A |
| Transaction mechanics ("Blake collected $5.67M") | No explanation of Black Market value flow in prompts | Add mechanics primer to financial summary | B |
| Character group misidentification (wrong Stanford Four members) | No structured character relationship data; LLM infers from scattered evidence | Extract groups/relationships/roles from paper evidence + tokens before arc analysis | C, D |
| Missing narrative tensions (Skyler's transparency + $155K burial) | No cross-referencing of public behavior vs burial patterns | Programmatic contradiction surfacing within evidence boundaries | E, F |

---

## Wave 1: Prompt-Level Changes

### Task A: Temporal Pre-Annotation of Evidence Items

**Files:**
- Modify: `lib/workflow/nodes/node-helpers.js:421-462` (`routeTokensByDisposition`)
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:1351-1396` (`extractEvidenceSummary`)
- Modify: `lib/prompt-builder.js:764-775` (article prompt evidence injection)
- Test: `lib/__tests__/temporal-annotation.test.js` (create)

**Context:** Evidence items arrive as raw text with embedded timestamps (e.g., "REMI.1 - 9:02PM"). The three-timeline model exists in prompt rules but fails because the temporal context is distant from the evidence content. The fix puts temporal tags AT the evidence, not in a rules section hundreds of tokens away.

**Step 1: Write the failing test**

```javascript
// lib/__tests__/temporal-annotation.test.js
const { routeTokensByDisposition } = require('../workflow/nodes/node-helpers');

describe('temporal pre-annotation', () => {
  test('exposed tokens get PARTY temporal context', () => {
    const tokens = [{
      id: 'rem001', disposition: 'exposed', ownerLogline: 'Remi Whitman',
      summary: 'Remi watches Marcus', fullDescription: 'REMI.1 - 9:02PM - ...',
      characterRefs: [], tags: []
    }];
    const { exposed } = routeTokensByDisposition(tokens);
    expect(exposed[0].temporalContext).toBe('PARTY');
  });

  test('buried tokens get INVESTIGATION temporal context', () => {
    const tokens = [{
      disposition: 'buried', shellAccount: 'Burns', transactionAmount: 75000,
      sessionTransactionTime: '10:30 PM'
    }];
    const { buried } = routeTokensByDisposition(tokens);
    expect(buried[0].temporalContext).toBe('INVESTIGATION');
  });
});

describe('extractEvidenceSummary temporal tags', () => {
  const { _testing } = require('../workflow/nodes/arc-specialist-nodes');
  // extractEvidenceSummary needs to be exported for testing — see Step 3 note

  test('exposed tokens carry temporalContext through to summary', () => {
    const bundle = {
      exposed: {
        tokens: [{ id: 'rem001', owner: 'Remi', summary: 'test', temporalContext: 'PARTY', characterRefs: [] }],
        paperEvidence: [{ id: 'p1', name: 'Doc', summary: 'test', temporalContext: 'BACKGROUND', characterRefs: [] }]
      },
      buried: {
        transactions: [{ shellAccount: 'Burns', amount: 75000, time: '10:30 PM', temporalContext: 'INVESTIGATION' }]
      }
    };
    const result = _testing.extractEvidenceSummary(bundle);
    expect(result.exposedTokens[0].timeline).toBe('PARTY');
    expect(result.exposedPaper[0].timeline).toBe('BACKGROUND');
    expect(result.buriedTransactions[0].timeline).toBe('INVESTIGATION');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/temporal-annotation.test.js --verbose`
Expected: FAIL — `temporalContext` is undefined

**Step 3: Implement**

In `lib/workflow/nodes/node-helpers.js`, add `temporalContext` to both routing paths in `routeTokensByDisposition()`:

At line ~439 (exposed push), add:
```javascript
        temporalContext: 'PARTY',
```

At line ~449 (buried push), add:
```javascript
        temporalContext: 'INVESTIGATION',
```

In `lib/workflow/nodes/arc-specialist-nodes.js`, update `extractEvidenceSummary()` at line ~1360 to preserve temporalContext:

Change the exposed tokens mapping (line ~1360):
```javascript
    timeline: t.temporalContext || 'party-night'
```

Change the exposed paper mapping (line ~1370):
```javascript
    timeline: p.temporalContext || 'party-context'
```

Change the buried transactions mapping (line ~1382):
```javascript
    timeline: t.temporalContext || 'investigation'
```

Export `extractEvidenceSummary` for testing — add to the existing `module.exports._testing` or the main exports if there's a `_testing` object.

In `lib/prompt-builder.js`, modify the evidence bundle injection in `buildArticlePrompt()` around line 764. Change:
```javascript
EVIDENCE BUNDLE (quote ONLY from exposed evidence):
${JSON.stringify(evidenceBundle, null, 2)}
```
To:
```javascript
EVIDENCE BUNDLE (quote ONLY from exposed evidence):

TEMPORAL CONTEXT GUIDE:
- Items tagged [PARTY] are RECOVERED MEMORIES from the night of the party. Nova watched these play back on screens during the investigation. Use: "The memory shows..." / "Recovered footage from [time] captures..." / "A memory from [time] reveals..."
- Items tagged [INVESTIGATION] are things Nova DIRECTLY OBSERVED or that occurred during the investigation. Use: "I watched..." / "I saw..." / "This morning..."
- Items tagged [BACKGROUND] are documents that predate the party. Use: "Records show..." / "Documents reveal..."
NEVER describe a [PARTY] memory as something Nova witnessed in person. She watched recordings, not the events themselves.

${JSON.stringify(evidenceBundle, null, 2)}
```

Also add similar temporal guidance in `buildCoreArcPrompt()` at line ~189 in `arc-specialist-nodes.js`, near where the evidence summary is injected.

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/temporal-annotation.test.js --verbose && npm test`
Expected: PASS

**Step 5: Commit**

```
feat: temporal pre-annotation of evidence items

Each evidence item now carries a temporalContext field (PARTY, INVESTIGATION,
BACKGROUND) from routing through article generation. Temporal context guide
injected directly above evidence bundle in prompts, so the LLM sees the
framing rules at the point of consumption, not in a distant rules section.
Addresses systematic temporal conflation in generated reports.
```

---

### Task B: Transaction Mechanics Primer

**Files:**
- Modify: `lib/prompt-builder.js:241-256` (`_buildFinancialSummary`)
- Test: `lib/__tests__/prompt-builder-financial.test.js` (create or extend existing)

**Context:** Generated articles confuse the direction of value flow in the Black Market. "Blake collected $5.67M" implies Blake received money, but Blake PAID account holders in exchange for collecting their memories. The prompt needs explicit mechanics.

**Step 1: Write the failing test**

```javascript
// lib/__tests__/prompt-builder-financial.test.js
const { createPromptBuilder } = require('../prompt-builder');

describe('financial summary - transaction mechanics', () => {
  test('includes Black Market mechanics explanation', () => {
    const pb = createPromptBuilder('journalist');
    const accounts = [
      { name: 'Burns', total: 1300000, tokenCount: 7 },
      { name: 'Skyler', total: 155000, tokenCount: 2 }
    ];
    const result = pb._buildFinancialSummary(accounts);
    expect(result).toContain('surrendering');  // or similar — memories surrendered TO Blake
    expect(result).toContain('collects');       // Blake collects the memories
    expect(result).toContain('buried');         // memories are buried/removed from public record
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder-financial.test.js --verbose`
Expected: FAIL — current financial summary has no mechanics explanation

**Step 3: Implement**

In `lib/prompt-builder.js`, modify `_buildFinancialSummary()` at line ~241. Add a mechanics primer before the account listing:

```javascript
  _buildFinancialSummary(shellAccounts) {
    if (!shellAccounts || shellAccounts.length === 0) return '';
    const nonZero = shellAccounts.filter(a => a.total > 0);
    if (nonZero.length === 0) return '';

    const total = shellAccounts.reduce((sum, a) => sum + (a.total || 0), 0);

    return `
<FINANCIAL_SUMMARY>
HOW THE BLACK MARKET WORKS:
Blake's network collects memories and buries them — removing them from the public record.
In exchange, account holders are PAID for surrendering their memories.
Shell account totals represent how much each account holder RECEIVED for burying secrets.
The total ($${total.toLocaleString('en-US')}) is the combined VALUE of secrets Blake acquired.
Blake now possesses all buried memories and the leverage they contain.
Nova CANNOT know whose specific memories went to which accounts — only the account names, amounts, and timing.

AUTHORITATIVE SHELL ACCOUNT DATA (use these exact figures in financialTracker):
${nonZero.map(a =>
  `- ${a.name}: $${a.total.toLocaleString('en-US')} (${a.tokenCount} token${a.tokenCount !== 1 ? 's' : ''})`
).join('\n')}
Total buried: $${total.toLocaleString('en-US')}

These figures are DETERMINISTIC — do not estimate, round, or recalculate. Use exact values.
</FINANCIAL_SUMMARY>`;
  }
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder-financial.test.js --verbose && npm test`
Expected: PASS

**Step 5: Commit**

```
feat: add Black Market mechanics primer to financial summary prompt

Explains value flow direction: Blake collects memories and pays account
holders. Prevents articles from saying "Blake collected $5.67M" (implying
Blake received money) when Blake actually paid that amount to acquire
buried secrets. Also reinforces that Nova cannot know whose memories
went to which accounts.
```

---

## Wave 2: Architecture-Level Changes

### Task C: Character Data Extraction Node

**Files:**
- Modify: `lib/workflow/state.js:280-297` (add `characterData` field)
- Create: `lib/workflow/nodes/character-data-nodes.js`
- Modify: `lib/workflow/graph.js` (add node and edge)
- Test: `lib/__tests__/character-data-extraction.test.js` (create)

**Context:** The pipeline has no structured character relationship data. Group memberships (Stanford Four), relationships (Mel is Sarah's attorney), and roles (Morgan is a crisis manager) are scattered across paper evidence and tokens. The LLM must infer everything, and gets it wrong. This node extracts structured character data from ALL paper evidence (including items that may score below curation threshold) plus exposed tokens, producing a `characterData` object that flows to all downstream prompts.

**Step 1: Add state field**

In `lib/workflow/state.js`, add near the `preprocessedEvidence` field (line ~285):

```javascript
    // Character data extracted from paper evidence + tokens (pre-curation)
    characterData: Annotation({ reducer: replaceReducer, default: null }),
```

**Step 2: Write the failing test**

```javascript
// lib/__tests__/character-data-extraction.test.js
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { extractCharacterData } = require('../workflow/nodes/character-data-nodes');

describe('extractCharacterData', () => {
  test('extracts group membership from paper evidence text messages', () => {
    const state = {
      characterData: null,
      paperEvidence: [
        {
          name: 'Mel - Nat texts',
          description: 'Mel: If you\'re there we can all play SPOT THE DIFFERENCE and compare how these parties went down in our Stanford Four era vs today.',
          owners: ['Mel Nilsson']
        }
      ],
      memoryTokens: [
        {
          tokenId: 'nat001', disposition: 'exposed',
          fullDescription: 'NAT.1 - 8:28PM - Your camera catches MEL doing a backflip off the speakers. SAM is laughing. MARCUS grabs your shoulder: "We\'re going to change the world, Nat. All four of us."',
          owners: ['Nat Francisco']
        }
      ],
      sessionConfig: { roster: ['Mel', 'Nat', 'Sam', 'Alex'] }
    };
    const config = { configurable: {} };

    // Mock SDK to return structured extraction
    const mockSdk = jest.fn().mockResolvedValueOnce({
      characters: {
        'Mel': { groups: ['Stanford Four'], relationships: { 'Nat': 'Stanford Four member', 'Marcus': 'old friend' }, role: 'Attorney' },
        'Nat': { groups: ['Stanford Four'], relationships: { 'Mel': 'Stanford Four member', 'Marcus': 'old friend' }, role: 'Filmmaker' },
        'Sam': { groups: ['Stanford Four'], relationships: { 'Marcus': 'drug supplier/friend' }, role: 'Drug manufacturer' }
      }
    });

    return extractCharacterData(
      state,
      { configurable: { sdkClient: mockSdk } }
    ).then(result => {
      expect(result.characterData).toBeDefined();
      expect(result.characterData.characters['Mel'].groups).toContain('Stanford Four');
      expect(result.characterData.characters['Nat'].groups).toContain('Stanford Four');
    });
  });

  test('skips if characterData already exists', async () => {
    const state = { characterData: { characters: { 'Mel': { groups: ['Stanford Four'] } } } };
    const result = await extractCharacterData(state, { configurable: {} });
    expect(result.characterData).toBeUndefined(); // No update — skip
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx jest lib/__tests__/character-data-extraction.test.js --verbose`
Expected: FAIL — module doesn't exist

**Step 4: Implement the node**

Create `lib/workflow/nodes/character-data-nodes.js`:

```javascript
/**
 * Character Data Extraction Node
 *
 * Extracts structured character data (groups, relationships, roles) from
 * ALL paper evidence + exposed memory tokens. Runs before curation so that
 * character sheet data is captured regardless of curation scoring.
 *
 * Uses Haiku for fast extraction — this is a factual parsing task, not creative.
 */

const { PHASES } = require('../state');
const { getSdkClient } = require('./node-helpers');
const { traceNode } = require('../../observability');

const CHARACTER_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    characters: {
      type: 'object',
      description: 'Map of character first names to their extracted data',
      additionalProperties: {
        type: 'object',
        properties: {
          groups: {
            type: 'array',
            items: { type: 'string' },
            description: 'Named groups this character belongs to (e.g., "Stanford Four", "Ezra\'s mentees")'
          },
          relationships: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of other character names to relationship description'
          },
          role: {
            type: 'string',
            description: 'Professional or social role (e.g., "Attorney", "Bartender", "Investor")'
          }
        }
      }
    }
  },
  required: ['characters']
};

async function extractCharacterData(state, config) {
  // Skip if already extracted
  if (state.characterData) {
    console.log('[extractCharacterData] Skipping — characterData already exists');
    return {};
  }

  const roster = state.sessionConfig?.roster || [];
  const paperEvidence = state.paperEvidence || [];
  const tokens = (state.memoryTokens || []).filter(t => t.disposition === 'exposed');

  if (paperEvidence.length === 0 && tokens.length === 0) {
    console.log('[extractCharacterData] No evidence available');
    return { characterData: { characters: {}, source: 'empty' } };
  }

  const sdk = getSdkClient(config, 'extractCharacterData');

  // Build context from ALL paper evidence (not just curated)
  const paperContext = paperEvidence
    .filter(p => p.description && p.description.length > 20)
    .map(p => `[${p.name}] ${p.description.substring(0, 500)}`)
    .join('\n\n');

  // Build context from exposed tokens (first 200 chars each)
  const tokenContext = tokens
    .slice(0, 30) // Cap to prevent prompt overflow
    .map(t => `[${t.tokenId}] ${(t.fullDescription || t.summary || '').substring(0, 200)}`)
    .join('\n\n');

  const prompt = `Extract character relationship data from these documents and memories.

ROSTER (characters in this session): ${roster.join(', ')}
Marcus Blackwood is the deceased victim (NPC, not on roster).
Blake/Valet is the Black Market operator (NPC, not on roster).

PAPER EVIDENCE:
${paperContext}

EXPOSED MEMORY CONTENT:
${tokenContext}

For each roster character mentioned, extract:
1. Named groups they belong to (e.g., "Stanford Four" — include ALL members)
2. Key relationships with other characters (role-based: "attorney for", "mentor to", "friend of")
3. Their professional/social role

Only include data explicitly stated or strongly implied by the evidence. Do not infer or speculate.`;

  try {
    const result = await sdk({
      prompt,
      systemPrompt: 'You extract structured character data from narrative evidence. Be factual and precise. Only report what the evidence explicitly states.',
      model: 'haiku',
      jsonSchema: CHARACTER_EXTRACTION_SCHEMA,
      timeoutMs: 60000,
      disableTools: true,
      label: 'Character data extraction'
    });

    const charCount = Object.keys(result.characters || {}).length;
    console.log(`[extractCharacterData] Extracted data for ${charCount} characters`);

    return {
      characterData: {
        characters: result.characters || {},
        source: 'extracted',
        extractedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('[extractCharacterData] Error:', error.message);
    // Non-fatal — pipeline can proceed without character data
    return {
      characterData: { characters: {}, source: 'error', error: error.message }
    };
  }
}

module.exports = {
  extractCharacterData: traceNode(extractCharacterData, 'extractCharacterData', {
    stateFields: ['paperEvidence', 'memoryTokens']
  }),
  _testing: { extractCharacterData }
};
```

**Step 5: Wire into graph**

In `lib/workflow/graph.js`, import the new node and add it between `preprocessEvidence` and `checkpointPreCuration`:

```javascript
// Import
const { extractCharacterData } = require('./nodes/character-data-nodes');

// Add node (near other node registrations)
builder.addNode('extractCharacterData', extractCharacterData);

// Replace edge: preprocessEvidence → checkpointPreCuration
// With: preprocessEvidence → extractCharacterData → checkpointPreCuration
// (Remove old edge, add two new ones)
builder.addEdge('preprocessEvidence', 'extractCharacterData');
builder.addEdge('extractCharacterData', 'checkpointPreCuration');
```

**Step 6: Run tests**

Run: `npx jest lib/__tests__/character-data-extraction.test.js --verbose && npm test`
Expected: PASS

**Step 7: Commit**

```
feat: character data extraction node

New Haiku-powered node extracts structured character data (groups,
relationships, roles) from ALL paper evidence + exposed tokens before
curation. Produces characterData state field with per-character maps.
Runs between preprocessEvidence and checkpointPreCuration so that
character sheet data is captured regardless of curation scoring.
Addresses Stanford Four misidentification class of errors.
```

---

### Task D: Character Data Prompt Integration

**Files:**
- Modify: `lib/prompt-builder.js:23-37` (`generateRosterSection`)
- Modify: `lib/prompt-builder.js:165-220` (`buildArcAnalysisPrompt`)
- Modify: `lib/prompt-builder.js:612-828` (`buildArticlePrompt`)
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:153-250` (`buildCoreArcPrompt`)
- Test: `lib/__tests__/character-data-prompt.test.js` (create)

**Context:** The `characterData` extracted in Task C needs to flow into all downstream prompts so the LLM knows group memberships and relationships before generating arcs or articles.

**Step 1: Write the failing test**

```javascript
// lib/__tests__/character-data-prompt.test.js
const { createPromptBuilder } = require('../prompt-builder');

describe('character data in prompts', () => {
  test('generateRosterSection includes character groups and roles', () => {
    const pb = createPromptBuilder('journalist', null, {
      'Alex': { groups: [], relationships: {}, role: 'Wronged Partner' },
      'Mel': { groups: ['Stanford Four'], relationships: { 'Sarah': 'divorce attorney' }, role: 'Attorney' }
    });
    const roster = pb.generateRosterSection();
    expect(roster).toContain('Stanford Four');
    expect(roster).toContain('Attorney');
    expect(roster).toContain('Mel');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/character-data-prompt.test.js --verbose`
Expected: FAIL — `createPromptBuilder` doesn't accept characterData parameter

**Step 3: Implement**

Modify `createPromptBuilder()` to accept a `characterData` parameter and store it. Modify `generateRosterSection()` to append character metadata below each roster entry when character data is available:

```javascript
generateRosterSection(theme, canonicalCharacters, characterData) {
  // ... existing canonical name mapping ...

  // Append character metadata if available
  if (characterData && Object.keys(characterData).length > 0) {
    rosterLines += '\n\nCHARACTER CONTEXT (extracted from evidence — use for accuracy):';
    for (const [name, data] of Object.entries(characterData)) {
      const parts = [];
      if (data.role) parts.push(`Role: ${data.role}`);
      if (data.groups?.length) parts.push(`Groups: ${data.groups.join(', ')}`);
      if (data.relationships && Object.keys(data.relationships).length > 0) {
        const rels = Object.entries(data.relationships).map(([k, v]) => `${k} (${v})`).join(', ');
        parts.push(`Relationships: ${rels}`);
      }
      if (parts.length > 0) {
        rosterLines += `\n- ${name}: ${parts.join(' | ')}`;
      }
    }
  }

  return rosterLines;
}
```

Pass `characterData` through `buildCoreArcPrompt()` in arc-specialist-nodes.js and through `buildArticlePrompt()` in prompt-builder.js. The character data comes from `state.characterData.characters`.

**Step 4: Run tests**

Run: `npx jest lib/__tests__/character-data-prompt.test.js --verbose && npm test`
Expected: PASS

**Step 5: Commit**

```
feat: inject character data into arc analysis and article prompts

generateRosterSection() now includes character groups, relationships,
and roles extracted from paper evidence. Ensures the LLM knows "Stanford
Four = Marcus, Sam, Mel, Nat" and "Mel is Sarah's divorce attorney"
before generating arcs or writing articles.
```

---

### Task E: Contradiction Surfacing Node

**Files:**
- Modify: `lib/workflow/state.js` (add `narrativeTensions` field)
- Create: `lib/workflow/nodes/contradiction-nodes.js`
- Modify: `lib/workflow/graph.js` (add node and edge)
- Test: `lib/__tests__/contradiction-surfacing.test.js` (create)

**Context:** Narrative tensions between public behavior and Black Market activity are goldmines the pipeline doesn't surface. This is a PROGRAMMATIC node (no LLM needed) that cross-references shell accounts vs roster, director-noted behavior vs burial patterns. It MUST respect evidence boundaries — Nova can see account names and amounts, but NOT whose specific memories went to which accounts.

**Step 1: Add state field**

In `lib/workflow/state.js`:
```javascript
    narrativeTensions: Annotation({ reducer: replaceReducer, default: null }),
```

**Step 2: Write the failing test**

```javascript
// lib/__tests__/contradiction-surfacing.test.js

describe('surfaceContradictions', () => {
  const { surfaceContradictions } = require('../workflow/nodes/contradiction-nodes')._testing;

  test('flags named shell accounts matching roster members', () => {
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Skyler', 'Alex', 'Mel', 'Remi'] },
      shellAccounts: [
        { name: 'Skyler', total: 155000, tokenCount: 2 },
        { name: 'Burns', total: 1300000, tokenCount: 7 },
        { name: 'Alex', total: 775000, tokenCount: 4 },
        { name: 'Mel', total: 810000, tokenCount: 5 }
      ],
      directorNotes: {
        observations: {
          behaviorPatterns: [
            'Skyler was the first to submit information to Nova, boldly declaring he had nothing to hide'
          ]
        }
      }
    };

    const result = surfaceContradictions(state);
    const tensions = result.narrativeTensions.tensions;

    // Should flag Skyler's contradiction: declared transparency + named burial account
    const skylerTension = tensions.find(t => t.character === 'Skyler');
    expect(skylerTension).toBeDefined();
    expect(skylerTension.type).toBe('transparency-vs-burial');
    expect(skylerTension.publicBehavior).toContain('nothing to hide');
    expect(skylerTension.burialData.total).toBe(155000);

    // Should flag named accounts (Alex, Mel, Remi) but NOT anonymous ones (Burns)
    const namedAccounts = tensions.filter(t => t.type === 'named-account');
    expect(namedAccounts.length).toBeGreaterThanOrEqual(3); // Skyler, Alex, Mel (Remi too if > 0)
  });

  test('does NOT flag anonymous accounts as roster matches', () => {
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Sarah', 'Morgan'] },
      shellAccounts: [
        { name: 'Burns', total: 1300000, tokenCount: 7 },
        { name: 'Daisy', total: 1312500, tokenCount: 3 }
      ],
      directorNotes: { observations: { behaviorPatterns: [] } }
    };

    const result = surfaceContradictions(state);
    // Burns and Daisy don't match roster — no named-account tensions
    const namedAccounts = result.narrativeTensions.tensions.filter(t => t.type === 'named-account');
    expect(namedAccounts.length).toBe(0);
  });

  test('does NOT reference specific token IDs or buried content', () => {
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Skyler'] },
      shellAccounts: [{ name: 'Skyler', total: 155000, tokenCount: 2 }],
      directorNotes: { observations: { behaviorPatterns: [] } }
    };

    const result = surfaceContradictions(state);
    const json = JSON.stringify(result.narrativeTensions);
    // Must NOT contain token IDs (evidence boundary)
    expect(json).not.toMatch(/sky\d{3}/);
    expect(json).not.toContain('tokenId');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx jest lib/__tests__/contradiction-surfacing.test.js --verbose`
Expected: FAIL — module doesn't exist

**Step 4: Implement the node**

Create `lib/workflow/nodes/contradiction-nodes.js`:

```javascript
/**
 * Contradiction Surfacing Node (PROGRAMMATIC — no LLM)
 *
 * Cross-references shell accounts vs roster and director observations
 * to surface narrative tensions. Respects evidence boundaries:
 * - CAN see: shell account names, amounts, timing
 * - CAN see: director observations about public behavior
 * - CANNOT see: whose specific memories went to which accounts
 * - CANNOT reference: token IDs, buried content
 */

const { traceNode } = require('../../observability');

function surfaceContradictions(state) {
  if (state.narrativeTensions) {
    console.log('[surfaceContradictions] Skipping — already exists');
    return {};
  }

  const roster = state.sessionConfig?.roster || [];
  const shellAccounts = state.shellAccounts || [];
  const behaviorPatterns = state.directorNotes?.observations?.behaviorPatterns || [];
  const rosterLower = new Set(roster.map(r => r.toLowerCase()));

  const tensions = [];

  // 1. Flag named shell accounts matching roster members
  for (const account of shellAccounts) {
    if (account.total <= 0) continue;

    const isNamed = rosterLower.has(account.name.toLowerCase());
    if (!isNamed) continue;

    const rosterName = roster.find(r => r.toLowerCase() === account.name.toLowerCase());

    // Check for transparency contradiction: director noted public behavior + burial
    const transparencyNotes = behaviorPatterns.filter(p =>
      p.toLowerCase().includes(rosterName.toLowerCase()) &&
      (p.includes('submit') || p.includes('expos') || p.includes('public') ||
       p.includes('nothing to hide') || p.includes('boldly') || p.includes('transparent'))
    );

    if (transparencyNotes.length > 0) {
      tensions.push({
        type: 'transparency-vs-burial',
        character: rosterName,
        publicBehavior: transparencyNotes[0],
        burialData: { accountName: account.name, total: account.total, tokenCount: account.tokenCount },
        narrativeNote: `${rosterName} publicly demonstrated transparency while also maintaining a named burial account with $${account.total.toLocaleString('en-US')}. This contradiction is visible to Nova.`
      });
    } else {
      tensions.push({
        type: 'named-account',
        character: rosterName,
        burialData: { accountName: account.name, total: account.total, tokenCount: account.tokenCount },
        narrativeNote: `${rosterName} used their own name for a burial account ($${account.total.toLocaleString('en-US')}). Unlike anonymous accounts, this is a deliberate choice to be identifiable.`
      });
    }
  }

  // 2. Flag Blake-proximity patterns from director observations
  const blakeProximity = behaviorPatterns.filter(p =>
    p.toLowerCase().includes('blake') || p.toLowerCase().includes('valet')
  );

  if (blakeProximity.length > 0) {
    tensions.push({
      type: 'blake-proximity',
      observations: blakeProximity,
      narrativeNote: 'Director observed multiple characters interacting with Blake. Nova can note these patterns without knowing transaction details.'
    });
  }

  console.log(`[surfaceContradictions] Found ${tensions.length} narrative tensions`);

  return {
    narrativeTensions: {
      tensions,
      surfacedAt: new Date().toISOString()
    }
  };
}

module.exports = {
  surfaceContradictions: traceNode(surfaceContradictions, 'surfaceContradictions', {
    stateFields: ['shellAccounts', 'sessionConfig']
  }),
  _testing: { surfaceContradictions }
};
```

**Step 5: Wire into graph**

In `lib/workflow/graph.js`:

```javascript
const { surfaceContradictions } = require('./nodes/contradiction-nodes');

builder.addNode('surfaceContradictions', surfaceContradictions);

// Insert between processRescuedItems and analyzeArcs
// Replace: builder.addEdge('processRescuedItems', 'analyzeArcs');
// With:
builder.addEdge('processRescuedItems', 'surfaceContradictions');
builder.addEdge('surfaceContradictions', 'analyzeArcs');
```

**Step 6: Run tests**

Run: `npx jest lib/__tests__/contradiction-surfacing.test.js --verbose && npm test`
Expected: PASS

**Step 7: Commit**

```
feat: programmatic contradiction surfacing node

New node cross-references shell account names vs roster and director
observations to surface narrative tensions. Identifies named burial
accounts (Skyler used own name for $155K), transparency contradictions
(declared nothing to hide + maintained burial account), and Blake
proximity patterns. Strictly respects evidence boundaries — no token
IDs or buried content referenced. Runs between processRescuedItems
and analyzeArcs.
```

---

### Task F: Contradiction Prompt Integration

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:153-250` (`buildCoreArcPrompt`)
- Modify: `lib/prompt-builder.js:612-828` (`buildArticlePrompt`)
- Test: `lib/__tests__/contradiction-prompt.test.js` (create)

**Context:** The `narrativeTensions` from Task E need to be injected into arc analysis and article prompts so the LLM can weave them into the narrative.

**Step 1: Write the failing test**

```javascript
// lib/__tests__/contradiction-prompt.test.js

describe('contradiction data in arc prompt', () => {
  test('buildCoreArcPrompt includes narrative tensions when present', () => {
    // This test needs the buildCoreArcPrompt function
    // Verify tensions section appears in assembled prompt
    // Implementation depends on how buildCoreArcPrompt accesses state
  });
});
```

Note: Exact test shape depends on how `buildCoreArcPrompt` is refactored to accept tensions. The key assertion: the prompt string should contain a `NARRATIVE_TENSIONS` section when `state.narrativeTensions` has entries.

**Step 2: Implement**

In `buildCoreArcPrompt()` (arc-specialist-nodes.js), add a tensions section after the evidence summary injection:

```javascript
    // Narrative tensions (programmatic cross-references)
    const tensions = state.narrativeTensions?.tensions || [];
    const tensionsSection = tensions.length > 0 ? `

NARRATIVE TENSIONS (programmatic cross-references — evidence-boundary compliant):
These contradictions were identified by comparing public behavior with Black Market activity.
They are strong narrative opportunities. Each has been verified to respect evidence boundaries.

${tensions.map(t => `- [${t.type}] ${t.narrativeNote}`).join('\n')}
` : '';
```

In `buildArticlePrompt()` (prompt-builder.js), add tensions alongside director observations (after line ~775):

```javascript
    // Narrative tensions
    ${narrativeTensions && narrativeTensions.tensions?.length > 0 ? `
<NARRATIVE_TENSIONS>
These contradictions between public behavior and Black Market activity are verified to respect evidence boundaries. Weave them into the narrative where appropriate:
${narrativeTensions.tensions.map(t => `- ${t.narrativeNote}`).join('\n')}
</NARRATIVE_TENSIONS>` : ''}
```

The `narrativeTensions` parameter needs to be passed to `buildArticlePrompt()` from the article generation node. Check `generateContentBundle` in `ai-nodes.js` to see where the prompt is assembled, and add `state.narrativeTensions` to the data passed.

**Step 3: Run tests**

Run: `npx jest lib/__tests__/contradiction-prompt.test.js --verbose && npm test`
Expected: PASS

**Step 4: Commit**

```
feat: inject narrative tensions into arc analysis and article prompts

Surfaces programmatic contradictions (transparency vs burial, named
accounts, Blake proximity) in NARRATIVE_TENSIONS prompt sections.
Each tension includes a pre-written narrativeNote verified against
evidence boundaries, giving the LLM ready-to-use narrative material
for character complexity.
```

---

## Cross-Cutting Concerns

### State Pruning Compatibility
Task C adds `characterData` and Task E adds `narrativeTensions` to state. Both use `replaceReducer` so they work with the pruning logic from the earlier resilience work. These fields are consumed by arc analysis and article generation — they should be added to `ROLLBACK_CLEARS` for relevant checkpoints (same pattern as existing fields).

### Prompt Builder Parameter Evolution
Tasks A, D, and F all modify `prompt-builder.js`. Task A adds temporal guidance to the evidence bundle injection. Task D modifies `generateRosterSection()` to include character metadata. Task F adds tensions to the article prompt. These touch different methods and don't conflict, but the `buildArticlePrompt()` method grows — monitor for prompt length issues.

### Graph Node Ordering
Two new nodes are inserted:
```
... → preprocessEvidence → extractCharacterData → checkpointPreCuration → ...
... → processRescuedItems → surfaceContradictions → analyzeArcs → ...
```
These don't conflict. `extractCharacterData` needs `paperEvidence` and `memoryTokens` (available after fetch). `surfaceContradictions` needs `shellAccounts` and `directorNotes` (available after input parsing).

### E2E Testing
After all tasks, run: `node scripts/e2e-walkthrough.js --session 0320 --fresh`
Verify at checkpoints:
1. `pre-curation`: `characterData` populated with Stanford Four membership
2. `arc-selection`: Arcs reference correct character groups; narrative tensions visible
3. `article`: No temporal conflation; transaction mechanics correct; contradictions woven in

---

## Verification Checklist

After all 6 tasks:

1. `npm test` — all tests pass (existing + ~12 new)
2. Temporal tags: Evidence items in prompts show `[PARTY]` / `[INVESTIGATION]` / `[BACKGROUND]`
3. Transaction primer: Financial summary includes Black Market mechanics explanation
4. Character data: `generateRosterSection()` includes groups and relationships for characters with extracted data
5. Stanford Four: Character data correctly identifies Marcus/Sam/Mel/Nat (not Ezra/Quinn/Zia)
6. Contradictions: Skyler's named account flagged as transparency contradiction
7. Evidence boundaries: No token IDs in buried data; no contradiction references buried content
8. E2E pipeline: Session 0320 produces factually improved article

## Review Corrections (Post-Review Addendum)

These corrections override specific sections in the tasks above. Apply them during implementation.

### CRITICAL FIX 1: Task A — `buildCoreArcPrompt` temporal guidance is NOT vague

The plan says "Also add similar temporal guidance in `buildCoreArcPrompt()`." This is unnecessary — `buildCoreArcPrompt()` ALREADY has a SECTION 4.5: TEMPORAL AWARENESS (arc-specialist-nodes.js lines 303-318) with a full table and language markers. The temporal pre-annotation in Task A enhances this by adding `temporalContext` fields to the evidence DATA ITEMS themselves (SECTION 3, lines 260-272). The evidence section headers already say "PARTY MEMORIES" and "INVESTIGATION ACTIONS." Adding `temporalContext` to each item reinforces this at the item level.

**What Task A actually needs to do in `buildCoreArcPrompt`:** In SECTION 3 (lines 260-272), the `JSON.stringify` calls already emit the evidence items. Once `temporalContext` is added to the items (via `extractEvidenceSummary`), it will automatically appear in the JSON output. No additional prompt text changes needed in `buildCoreArcPrompt`.

The temporal context guide text addition is ONLY for `buildArticlePrompt()` at line 764, where the evidence bundle is injected WITHOUT the structured section headers that `buildCoreArcPrompt` provides.

---

### CRITICAL FIX 2: Task D — Full data flow specification

The plan's Task D is underspecified. Here is the complete data flow:

**Step D.1: Modify `createPromptBuilder()` (prompt-builder.js:1200)**

Add `characterData` to the options object:

```javascript
function createPromptBuilder(options = null) {
  if (typeof options === 'string') {
    const themeLoader = createThemeLoader(options);
    return new PromptBuilder(themeLoader, 'journalist');
  }
  const { theme = 'journalist', customSkillPath, sessionConfig = {}, canonicalCharacters = null, characterData = null } = options || {};
  const themeLoader = createThemeLoader({ theme, customPath: customSkillPath });
  return new PromptBuilder(themeLoader, theme, sessionConfig, canonicalCharacters, characterData);
}
```

**Step D.2: Modify `PromptBuilder` constructor (prompt-builder.js:~110)**

Find the constructor and add `characterData` parameter:

```javascript
constructor(themeLoader, themeName = 'journalist', sessionConfig = {}, canonicalCharacters = null, characterData = null) {
  // ... existing initialization ...
  this.characterData = characterData;
}
```

**Step D.3: Modify `getPromptBuilder()` (ai-nodes.js:55-61)**

Pass `state.characterData` through:

```javascript
function getPromptBuilder(config, state) {
  if (config?.configurable?.promptBuilder) return config.configurable.promptBuilder;
  const theme = state?.theme || 'journalist';
  const sessionConfig = state?.sessionConfig || {};
  const canonicalCharacters = state?.canonicalCharacters || null;
  const characterData = state?.characterData?.characters || null;
  return createPromptBuilder({ theme, sessionConfig, canonicalCharacters, characterData });
}
```

**Step D.4: Modify `generateRosterSection()` (prompt-builder.js:23-37)**

Add `characterData` as third parameter. This is a STANDALONE function (not a class method), called from 4 locations:

```javascript
function generateRosterSection(theme = 'journalist', canonicalCharacters = null, characterData = null) {
  // ... existing canonical name mapping (lines 24-32) ...

  let result = `CANONICAL CHARACTER ROSTER:
Use ONLY these full names in ALL article text. NEVER invent different last names:
${lines}`;

  if (characterData && Object.keys(characterData).length > 0) {
    result += '\n\nCHARACTER CONTEXT (extracted from evidence — use for factual accuracy):';
    for (const [name, data] of Object.entries(characterData)) {
      const parts = [];
      if (data.role) parts.push(`Role: ${data.role}`);
      if (data.groups?.length) parts.push(`Member of: ${data.groups.join(', ')}`);
      if (data.relationships && Object.keys(data.relationships).length > 0) {
        const rels = Object.entries(data.relationships)
          .slice(0, 4) // Cap to prevent prompt bloat
          .map(([k, v]) => `${k} (${v})`)
          .join(', ');
        parts.push(`Relationships: ${rels}`);
      }
      if (parts.length > 0) {
        result += `\n- ${name}: ${parts.join(' | ')}`;
      }
    }
  }

  return result;
}
```

**Step D.5: Update ALL 4 call sites of `generateRosterSection()`**

1. **Line 624** (system prompt in `buildArticlePrompt`):
   `generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData)`

2. **Line 679** (detective branch of `buildArticlePrompt`):
   `generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData)`

3. **Line 788** (journalist rules section of `buildArticlePrompt`):
   `generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData)`

4. **Line in `buildOutlinePrompt`** (find exact line — search for `generateRosterSection` in that method):
   `generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData)`

**Step D.6: Inject character data into `buildCoreArcPrompt()` (arc-specialist-nodes.js)**

`buildCoreArcPrompt` receives `state` directly (line 153), NOT through PromptBuilder. Add character data as a new subsection after the roster section (after line 234):

```javascript
${state.characterData?.characters && Object.keys(state.characterData.characters).length > 0 ? `
### Character Context (extracted from paper evidence — use for accuracy)
${Object.entries(state.characterData.characters).map(([name, data]) => {
  const parts = [];
  if (data.groups?.length) parts.push(`Member of: ${data.groups.join(', ')}`);
  if (data.role) parts.push(`Role: ${data.role}`);
  if (data.relationships) {
    const rels = Object.entries(data.relationships).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(', ');
    if (rels) parts.push(`Relationships: ${rels}`);
  }
  return parts.length > 0 ? `- ${name}: ${parts.join(' | ')}` : null;
}).filter(Boolean).join('\n')}

IMPORTANT: Use these group memberships as ground truth. Do NOT infer different group compositions from memory content.
` : ''}
```

**Step D.7: Update test**

Replace the plan's test with one that matches the actual API:

```javascript
const { createPromptBuilder } = require('../prompt-builder');

describe('character data in prompts', () => {
  test('generateRosterSection includes character groups and roles', () => {
    const { generateRosterSection } = require('../prompt-builder');
    const charData = {
      'Mel': { groups: ['Stanford Four'], relationships: { 'Sarah': 'divorce attorney' }, role: 'Attorney' },
      'Alex': { groups: [], relationships: {}, role: 'Wronged Partner' }
    };
    const result = generateRosterSection('journalist', null, charData);
    expect(result).toContain('Stanford Four');
    expect(result).toContain('Attorney');
    expect(result).toContain('Mel');
  });

  test('PromptBuilder stores and passes characterData', () => {
    const charData = { 'Mel': { groups: ['Stanford Four'], role: 'Attorney' } };
    const pb = createPromptBuilder({ theme: 'journalist', characterData: charData });
    expect(pb.characterData).toEqual(charData);
  });
});
```

---

### CRITICAL FIX 3: Task E — Test assertion is wrong

The test expects `namedAccounts.length >= 3` but Skyler is classified as `transparency-vs-burial` (not `named-account`). Fix the assertion:

```javascript
    // Skyler = transparency-vs-burial, Alex = named-account, Mel = named-account
    const namedAccounts = tensions.filter(t => t.type === 'named-account');
    expect(namedAccounts.length).toBe(2); // Alex and Mel only
```

Also add:
```javascript
    // Skyler gets the more specific type
    const transparencyTensions = tensions.filter(t => t.type === 'transparency-vs-burial');
    expect(transparencyTensions.length).toBe(1);
    expect(transparencyTensions[0].character).toBe('Skyler');
```

---

### CRITICAL FIX 4: Task F — Complete test and implementation

Replace the pseudocode test with actual test code:

```javascript
// lib/__tests__/contradiction-prompt.test.js

describe('contradiction data in arc prompt', () => {
  test('buildCoreArcPrompt includes narrative tensions when present', () => {
    // buildCoreArcPrompt is a standalone function receiving state directly
    const { _testing } = require('../workflow/nodes/arc-specialist-nodes');
    const { buildCoreArcPrompt } = _testing || {};

    // If buildCoreArcPrompt is not exported for testing, test via the full prompt string
    // by checking the analyzeArcsPlayerFocusGuided output includes tensions data
    // For now, test the prompt builder integration:

    const { createPromptBuilder } = require('../prompt-builder');
    const pb = createPromptBuilder({ theme: 'journalist' });

    // Test that buildArticlePrompt accepts and includes tensions
    // This requires a full prompt build — see Task F implementation details below
  });
});
```

**NOTE:** `buildCoreArcPrompt` is NOT currently exported in `_testing`. The implementer has two choices:
1. Export it in `_testing` (preferred for unit testing)
2. Test indirectly through `analyzeArcsPlayerFocusGuided` (integration-level)

**Task F — `buildArticlePrompt` parameter addition:**

Add `narrativeTensions` as 9th parameter to `buildArticlePrompt()`:

```javascript
// prompt-builder.js — buildArticlePrompt method signature
async buildArticlePrompt(outline, evidenceBundle, template, arcEvidencePackages, heroImage, shellAccounts, sessionFacts, directorNotes, narrativeTensions) {
```

Add after line 775 (after INVESTIGATION_OBSERVATIONS closing tag):
```javascript
${(narrativeTensions?.tensions?.length > 0) ? `
<NARRATIVE_TENSIONS>
These contradictions between public behavior and Black Market activity are verified
to respect evidence boundaries. They are strong narrative opportunities:
${narrativeTensions.tensions.map(t => `- [${t.type}] ${t.narrativeNote}`).join('\n')}
</NARRATIVE_TENSIONS>` : ''}
```

Update the call site in ai-nodes.js:1173:
```javascript
  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(
    state.outline || {},
    state.evidenceBundle || {},
    template,
    arcEvidencePackages,
    state.heroImage,
    shellAccounts,
    sessionFacts,
    state.directorNotes || null,
    state.narrativeTensions || null  // NEW: contradiction data
  );
```

---

### IMPORTANT FIX 5: Tasks C & E — `nodes/index.js` barrel update

Both new node files must be registered in `lib/workflow/nodes/index.js`:

```javascript
// After line 29 (const nodeHelpers = require('./node-helpers');)
const characterDataNodes = require('./character-data-nodes');
const contradictionNodes = require('./contradiction-nodes');
```

Add to exports (after line 54):
```javascript
  // Character data extraction (pipeline accuracy improvements)
  extractCharacterData: characterDataNodes.extractCharacterData,

  // Contradiction surfacing (pipeline accuracy improvements)
  surfaceContradictions: contradictionNodes.surfaceContradictions,
```

Add to `_testing` (after line 113):
```javascript
    characterData: characterDataNodes._testing,
    contradictions: contradictionNodes._testing,
```

In `graph.js`, import through the barrel:
```javascript
// Use existing pattern:
const nodes = require('./nodes');
// Then reference as nodes.extractCharacterData, nodes.surfaceContradictions
```

---

### IMPORTANT FIX 6: `getDefaultState()` updates

In `lib/workflow/state.js`, add to `getDefaultState()` (after line 673):

```javascript
    // Character data (pipeline accuracy improvements)
    characterData: null,
    // Narrative tensions (pipeline accuracy improvements)
    narrativeTensions: null,
```

---

### IMPORTANT FIX 7: ROLLBACK_CLEARS entries

In `lib/workflow/state.js`, add `characterData` and `narrativeTensions` to relevant ROLLBACK_CLEARS entries:

**`characterData`** — produced between `preprocessEvidence` and `checkpointPreCuration`. Add to:
- `input-review` (line 825): already clears everything, add `'characterData'`
- `paper-evidence-selection` (line 844): add `'characterData'`
- `await-roster` (line 855): add `'characterData'`
- `character-ids` (line 866): add `'characterData'`
- `pre-curation` (line 877): add `'characterData'` (rollback should re-extract)
- `evidence-and-photos` (line 888): add `'characterData'` (already clears pruned fields)

**`narrativeTensions`** — produced between `processRescuedItems` and `analyzeArcs`. Add to:
- All entries from `input-review` through `evidence-and-photos` (same as `characterData` above)
- `arc-selection` (line 897): add `'narrativeTensions'`

---

### IMPORTANT FIX 8: Task A — `buildArticlePrompt` temporal guide placement

The plan says to change lines 764-765 but doesn't specify the exact old/new strings. Here is the precise edit:

**Old (line 764-765):**
```
EVIDENCE BUNDLE (quote ONLY from exposed evidence):
${JSON.stringify(evidenceBundle, null, 2)}
```

**New:**
```
EVIDENCE BUNDLE (quote ONLY from exposed evidence):

TEMPORAL CONTEXT KEY (evidence items carry a temporalContext field):
- "PARTY" = RECOVERED MEMORY from the night of the party. You watched this play back on a screen.
  USE: "The memory shows..." / "Recovered footage from [time] captures..." / "A memory from [time] reveals..."
  NEVER: "I watched [character] do X" for party events. You were NOT at the party.
- "INVESTIGATION" = Something you DIRECTLY OBSERVED or that occurred during this morning's investigation.
  USE: "I watched..." / "I saw..." / "This morning..."
- "BACKGROUND" = Document or evidence that predates the party.
  USE: "Records show..." / "Documents reveal..."

${JSON.stringify(evidenceBundle, null, 2)}
```

---

## Files Modified (Complete List — Updated)

| File | Change | Task |
|------|--------|------|
| `lib/workflow/nodes/node-helpers.js:421-462` | Add `temporalContext` to routed tokens | A |
| `lib/workflow/nodes/arc-specialist-nodes.js:1351-1396` | Preserve temporal tags in evidence summary | A |
| `lib/prompt-builder.js:764-765` | Temporal context guide above evidence bundle | A |
| `lib/prompt-builder.js:241-256` | Transaction mechanics primer in financial summary | B |
| `lib/workflow/state.js:~285,~644,~823+` | Add state fields, defaults, and ROLLBACK_CLEARS | C, E |
| `lib/workflow/nodes/character-data-nodes.js` | New: character data extraction node | C |
| `lib/workflow/nodes/contradiction-nodes.js` | New: contradiction surfacing node | E |
| `lib/workflow/nodes/index.js:20-129` | Barrel export for both new node files | C, E |
| `lib/workflow/graph.js:559,567` | Wire extractCharacterData and surfaceContradictions nodes | C, E |
| `lib/prompt-builder.js:23-37` | Character metadata in `generateRosterSection()` | D |
| `lib/prompt-builder.js:~110` | PromptBuilder constructor accepts `characterData` | D |
| `lib/prompt-builder.js:1200-1210` | `createPromptBuilder()` passes `characterData` | D |
| `lib/prompt-builder.js:624,679,788` | All call sites of `generateRosterSection()` updated | D |
| `lib/workflow/nodes/ai-nodes.js:55-61` | `getPromptBuilder()` passes `state.characterData` | D |
| `lib/workflow/nodes/arc-specialist-nodes.js:234` | Character context section in `buildCoreArcPrompt` | D |
| `lib/workflow/nodes/arc-specialist-nodes.js:~300` | Tensions section in `buildCoreArcPrompt` | F |
| `lib/prompt-builder.js:775` | Tensions section in `buildArticlePrompt` | F |
| `lib/prompt-builder.js:618` | `buildArticlePrompt` accepts 9th param `narrativeTensions` | F |
| `lib/workflow/nodes/ai-nodes.js:1173-1182` | Pass `state.narrativeTensions` to `buildArticlePrompt` | F |
| `lib/__tests__/temporal-annotation.test.js` | New: temporal tag tests | A |
| `lib/__tests__/prompt-builder-financial.test.js` | New: transaction primer tests | B |
| `lib/__tests__/character-data-extraction.test.js` | New: character extraction tests | C |
| `lib/__tests__/character-data-prompt.test.js` | New: character data in prompts tests | D |
| `lib/__tests__/contradiction-surfacing.test.js` | New: contradiction tests (corrected assertions) | E |
| `lib/__tests__/contradiction-prompt.test.js` | New: contradiction prompt tests (actual test code) | F |
