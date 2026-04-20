# Director Notes Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Haiku 3-bucket director-notes compressor in `parseRawInput` step 3 with an Opus enricher that preserves raw prose verbatim and adds four context-grounded indexes (entity resolution, transaction cross-references, quote bank, post-investigation developments), then update every consumer and rebuild the broken `input-review` UI to surface the new structure.

**Architecture:** New helper module `lib/director-enricher.js` owns the schema + prompt + enrichment call (parallel to `lib/evidence-preprocessor.js`). Step 3 of `parseRawInput` in `lib/workflow/nodes/input-nodes.js` awaits steps 1 & 2 and invokes the new enricher. Seven consumers updated to read new shape. One dead code path (`analyzeNarrativeArcs` + `buildArcAnalysisPrompt`) removed. UI rebuilt per spec.

**Tech Stack:** Node.js, Jest 30, Claude Agent SDK (`sdkQuery`), LangGraph (MemorySaver), React 18 via Babel standalone (CDN).

**Spec reference:** `docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md`

---

## File Structure

### New
- `lib/director-enricher.js` — Schema, prompt builder, enrichment call, graceful fallback. Top-level helper (not a node), parallel to `lib/evidence-preprocessor.js`.
- `lib/__tests__/director-enricher.test.js` — Unit tests for the helper.

### Modified — backend
- `lib/workflow/nodes/input-nodes.js` — Remove `DIRECTOR_NOTES_SCHEMA`, swap step 3 to call new enricher, reorder step 3 to await steps 1 & 2.
- `lib/workflow/nodes/node-helpers.js` — `synthesizePlayerFocus` reads new shape.
- `lib/workflow/nodes/arc-specialist-nodes.js` — `extractPlayerFocusContext` + `buildCoreArcPrompt` + revision prompt builder use new shape. **Note:** spec did not list this file; discovered during plan writing. Contains TWO places that read the 3-bucket shape (core + revision paths) plus a diagnostic `console.log`.
- `lib/prompt-builder.js` — `buildArticlePrompt` uses new shape; delete dead `buildArcAnalysisPrompt`.
- `lib/workflow/nodes/ai-nodes.js` — Delete dead `analyzeNarrativeArcs`.
- `lib/workflow/nodes/contradiction-nodes.js` — Use pre-computed `transactionReferences` + raw prose search.
- `lib/image-prompt-builder.js` — Photo enrichment reads `rawProse` (truncated) instead of `behaviorPatterns.slice(0, 3)`.

### NOT modified (spec listed but investigation showed no code change needed)
- `lib/workflow/nodes/evaluator-nodes.js` — The spec's downstream-consumer table listed this file, but `grep` confirms it has **no programmatic access** to `observations.behaviorPatterns/suspiciousCorrelations/notableMoments`. The only match for "directorNotes" in this file is inside a prompt string (line 344) describing what the evaluator should consider — no schema-shape coupling. No code change required; Task 14's regression sweep will catch any surprise.

### Modified — tests
- `lib/__tests__/input-nodes-schema.test.js` — Rewrite schema assertions for new shape.
- `lib/__tests__/contradiction-surfacing.test.js` — Update fixtures.
- `lib/__tests__/prompt-builder.test.js` — Update fixtures.

### Modified — frontend
- `console/components/checkpoints/InputReview.js` — Rebuild director notes rendering per UI spec.
- `console/console.css` — Minor additions for new subsections (character-mention grid, quote-row, transaction-link-row, news-card).

---

## Implementation Order Rationale

Foundation first (Tasks 1-3): build the new helper in isolation with unit tests — zero blast radius on the rest of the codebase.

Wire foundation in (Task 4): swap step 3 in `parseRawInput`. At this point, `director-notes.json` changes shape. Downstream is now broken.

Downstream consumer sweep (Tasks 5-10): update every reader of the old 3-bucket shape. Pipeline returns to working.

Dead-code cleanup (Task 11): remove orphaned `analyzeNarrativeArcs` + `buildArcAnalysisPrompt`.

UI (Tasks 12-13): rebuild InputReview to surface the new data.

End-to-end validation (Task 14): replay against real session fixtures.

---

## Task 1: Create the enrichment schema

**Files:**
- Create: `lib/director-enricher.js`
- Create: `lib/__tests__/director-enricher.test.js`

- [ ] **Step 1: Write the failing schema-shape test**

Create `lib/__tests__/director-enricher.test.js`:

```javascript
const { DIRECTOR_NOTES_ENRICHED_SCHEMA } = require('../director-enricher');

describe('DIRECTOR_NOTES_ENRICHED_SCHEMA', () => {
  it('requires rawProse as the source of truth', () => {
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.required).toContain('rawProse');
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.rawProse.type).toBe('string');
  });

  it('defines characterMentions as an object of arrays keyed by canonical name', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.characterMentions;
    expect(prop.type).toBe('object');
    expect(prop.additionalProperties.type).toBe('array');
    const item = prop.additionalProperties.items;
    expect(item.properties.excerpt.type).toBe('string');
    expect(item.properties.proseOffset.type).toBe('number');
    expect(item.properties.timeAnchor.type).toBe('string');
    expect(item.properties.linkedCharacters.type).toBe('array');
    expect(item.properties.kind.type).toBe('string');
  });

  it('defines entityNotes with NPC and shell-account arrays', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.entityNotes;
    expect(prop.properties.npcsReferenced.type).toBe('array');
    expect(prop.properties.shellAccountsReferenced.type).toBe('array');
    expect(prop.properties.shellAccountsReferenced.items.properties.account.type).toBe('string');
    expect(prop.properties.shellAccountsReferenced.items.properties.directorSuspicion.type).toBe('string');
  });

  it('defines transactionReferences with linked-transaction detail', () => {
    const item = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.transactionReferences.items;
    expect(item.properties.excerpt.type).toBe('string');
    expect(item.properties.linkedTransactions.type).toBe('array');
    const tx = item.properties.linkedTransactions.items;
    expect(tx.properties.timestamp.type).toBe('string');
    expect(tx.properties.tokenId.type).toBe('string');
    expect(tx.properties.tokenOwner.type).toBe('string');
    expect(tx.properties.sellingTeam.type).toBe('string');
    expect(tx.properties.amount.type).toBe('string');
    expect(item.properties.confidence.enum).toEqual(['high', 'medium', 'low']);
    expect(item.properties.linkReasoning.type).toBe('string');
  });

  it('defines quotes with speaker, text, addressee, context, confidence', () => {
    const item = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.quotes.items;
    expect(item.properties.speaker.type).toBe('string');
    expect(item.properties.text.type).toBe('string');
    expect(item.properties.addressee.type).toBe('string');
    expect(item.properties.context.type).toBe('string');
    expect(item.properties.confidence.enum).toEqual(['high', 'low']);
    expect(item.required).toEqual(expect.arrayContaining(['speaker', 'text']));
  });

  it('defines postInvestigationDevelopments with headline, detail, subjects', () => {
    const item = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.postInvestigationDevelopments.items;
    expect(item.properties.headline.type).toBe('string');
    expect(item.properties.detail.type).toBe('string');
    expect(item.properties.subjects.type).toBe('array');
    expect(item.properties.bearingOnNarrative.type).toBe('string');
  });

  it('does NOT include the legacy observations.{behaviorPatterns,...} field', () => {
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.observations).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest lib/__tests__/director-enricher.test.js -v
```

Expected: FAIL — "Cannot find module '../director-enricher'".

- [ ] **Step 3: Create the schema in `lib/director-enricher.js`**

```javascript
/**
 * Director Notes Enricher
 *
 * Replaces the legacy Haiku 3-bucket compressor with an Opus-backed enricher
 * that preserves the director's prose verbatim and adds four context-grounded
 * indexes over it (entity resolution, transaction cross-references, quote
 * bank, post-investigation developments).
 *
 * Spec: docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md
 */

const DIRECTOR_NOTES_ENRICHED_SCHEMA = {
  type: 'object',
  required: ['rawProse'],
  properties: {
    rawProse: {
      type: 'string',
      description: 'Original director prose, verbatim. MUST equal input exactly.'
    },
    characterMentions: {
      type: 'object',
      description: 'Keys = canonical roster names. Arrays = excerpts mentioning each.',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          required: ['excerpt'],
          properties: {
            excerpt: { type: 'string', description: 'Verbatim passage from rawProse' },
            proseOffset: { type: 'number', description: 'Byte index into rawProse' },
            timeAnchor: { type: 'string', description: 'Temporal cue if present (e.g., "throughout morning")' },
            linkedCharacters: {
              type: 'array',
              items: { type: 'string' },
              description: 'Co-mentioned roster members'
            },
            kind: { type: 'string', description: 'Freeform tag (e.g., behavioral_pattern, dialogue, interpretation)' }
          }
        }
      }
    },
    entityNotes: {
      type: 'object',
      properties: {
        npcsReferenced: {
          type: 'array',
          items: { type: 'string' },
          description: 'Known NPC names referenced (Blake, Marcus, Nova, etc.)'
        },
        shellAccountsReferenced: {
          type: 'array',
          items: {
            type: 'object',
            required: ['account'],
            properties: {
              account: { type: 'string', description: 'Shell account name as it appears in scoring timeline' },
              directorSuspicion: { type: 'string', description: 'Director\'s stated suspicion or note about this account' }
            }
          }
        }
      }
    },
    transactionReferences: {
      type: 'array',
      items: {
        type: 'object',
        required: ['excerpt', 'linkedTransactions', 'confidence'],
        properties: {
          excerpt: { type: 'string', description: 'Observation text that references a transaction' },
          proseOffset: { type: 'number' },
          linkedTransactions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', description: 'e.g., "09:40 PM"' },
                tokenId: { type: 'string' },
                tokenOwner: { type: 'string' },
                sellingTeam: { type: 'string' },
                amount: { type: 'string', description: 'Formatted string, e.g., "$450,000"' }
              }
            }
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          linkReasoning: { type: 'string', description: 'Why these transactions match (or why no match)' }
        }
      }
    },
    quotes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['speaker', 'text'],
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string', description: 'Verbatim quote' },
          addressee: { type: 'string', description: 'Who the speaker was addressing, if known' },
          context: { type: 'string', description: 'Surrounding context from prose' },
          proseOffset: { type: 'number' },
          confidence: { type: 'string', enum: ['high', 'low'], description: 'high = speaker named adjacent' }
        }
      }
    },
    postInvestigationDevelopments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['headline'],
        properties: {
          headline: { type: 'string', description: 'One-line summary of the development' },
          detail: { type: 'string', description: 'Full text from prose' },
          subjects: { type: 'array', items: { type: 'string' }, description: 'Characters involved' },
          bearingOnNarrative: { type: 'string', description: 'Why this matters for the article' },
          proseOffset: { type: 'number' }
        }
      }
    }
  }
};

module.exports = {
  DIRECTOR_NOTES_ENRICHED_SCHEMA
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest lib/__tests__/director-enricher.test.js -v
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/director-enricher.js lib/__tests__/director-enricher.test.js
git commit -m "feat(enrichment): add DIRECTOR_NOTES_ENRICHED_SCHEMA"
```

---

## Task 2: Build the enrichment prompt

**Files:**
- Modify: `lib/director-enricher.js`
- Modify: `lib/__tests__/director-enricher.test.js`

- [ ] **Step 1: Add failing prompt-builder tests**

Append to `lib/__tests__/director-enricher.test.js`:

```javascript
const { buildEnrichmentPrompt } = require('../director-enricher');

describe('buildEnrichmentPrompt', () => {
  const sampleContext = {
    rawProse: 'Vic was working the room. Remi said "do you want to trade a little" to Mel.',
    roster: ['Vic', 'Remi', 'Mel'],
    accusation: { accused: ['Morgan'], charge: 'Murder of Marcus' },
    npcs: ['Blake', 'Marcus', 'Nova'],
    shellAccounts: [{ name: 'Marcus friend', total: 930000, tokenCount: 3 }],
    detectiveEvidenceLog: [{ token: 'tay004', owner: 'Taylor Chase', time: '09:40 PM', evidence: '...' }],
    scoringTimeline: [{ time: '09:40 PM', type: 'Sale', detail: 'tay004/Taylor Chase', team: 'Cass', amount: '+$450,000' }]
  };

  it('returns systemPrompt and userPrompt strings', () => {
    const out = buildEnrichmentPrompt(sampleContext);
    expect(typeof out.systemPrompt).toBe('string');
    expect(typeof out.userPrompt).toBe('string');
    expect(out.systemPrompt.length).toBeGreaterThan(0);
    expect(out.userPrompt.length).toBeGreaterThan(0);
  });

  it('system prompt forbids summarization and requires rawProse verbatim', () => {
    const { systemPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(systemPrompt).toMatch(/not.*summariz/i);
    expect(systemPrompt).toMatch(/verbatim/i);
    expect(systemPrompt).toMatch(/rawProse.*MUST equal the input/i);
  });

  it('user prompt contains all context sections as XML tags', () => {
    const { userPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(userPrompt).toContain('<ROSTER>');
    expect(userPrompt).toContain('<ACCUSATION>');
    expect(userPrompt).toContain('<NPCS>');
    expect(userPrompt).toContain('<SHELL_ACCOUNTS>');
    expect(userPrompt).toContain('<DETECTIVE_EVIDENCE_LOG>');
    expect(userPrompt).toContain('<SCORING_TIMELINE>');
    expect(userPrompt).toContain('<DIRECTOR_NOTES_RAW>');
    expect(userPrompt).toContain('<ENRICHMENT_RULES>');
  });

  it('user prompt includes the raw director prose unmodified', () => {
    const { userPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(userPrompt).toContain(sampleContext.rawProse);
  });

  it('rules appear LAST in user prompt for recency bias', () => {
    const { userPrompt } = buildEnrichmentPrompt(sampleContext);
    const rulesIdx = userPrompt.lastIndexOf('<ENRICHMENT_RULES>');
    const notesIdx = userPrompt.lastIndexOf('<DIRECTOR_NOTES_RAW>');
    expect(rulesIdx).toBeGreaterThan(notesIdx);
  });

  it('lists roster members inside <ROSTER>', () => {
    const { userPrompt } = buildEnrichmentPrompt(sampleContext);
    expect(userPrompt).toMatch(/<ROSTER>[\s\S]*Vic[\s\S]*Remi[\s\S]*Mel[\s\S]*<\/ROSTER>/);
  });

  it('handles empty optional context gracefully', () => {
    const minimal = {
      rawProse: 'Short note.',
      roster: [],
      accusation: null,
      npcs: [],
      shellAccounts: [],
      detectiveEvidenceLog: [],
      scoringTimeline: []
    };
    const { userPrompt } = buildEnrichmentPrompt(minimal);
    expect(userPrompt).toContain('Short note.');
    expect(userPrompt).toContain('<ROSTER>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest lib/__tests__/director-enricher.test.js -v
```

Expected: 7 new tests FAIL — "buildEnrichmentPrompt is not a function".

- [ ] **Step 3: Implement the prompt builder**

Append to `lib/director-enricher.js`:

```javascript
const ENRICHMENT_SYSTEM_PROMPT = `You enrich director notes with context-grounded indexes. You do NOT summarize, paraphrase, or compress. The director's prose is the source of truth; your job is to build *indexes into it*.

Hard rules:
1. \`rawProse\` in your output MUST equal the input prose exactly (verbatim, including punctuation, line breaks, and typos).
2. Character mentions use canonical names from the provided <ROSTER> only. Non-roster names go to entityNotes (npcsReferenced for known NPCs from <NPCS>, otherwise leave unflagged).
3. transactionReferences: link an observation to a scoring-timeline row ONLY when timestamp, actor, and amount converge. If no row matches cleanly, emit linkedTransactions: [] with confidence: "low" and a linkReasoning explaining the ambiguity. Do NOT fabricate.
4. quotes: only extract phrases that appear in quotation marks in the prose, or unambiguous direct speech. Preserve wording exactly. confidence: "high" iff speaker is named adjacent to the quote; otherwise "low".
5. postInvestigationDevelopments: only passages with explicit post-investigation temporal markers ("just been announced", "currently whereabouts unknown", "is on his way to", "following the investigation", "at the time of this article's writing").
6. Never fabricate. Empty arrays are always valid. A missing anchor is better than an invented one.

You are an INDEXER, not a SUMMARIZER. If you find yourself rewriting the director's words, stop — quote them verbatim in excerpts instead.`;

function buildEnrichmentPrompt({
  rawProse,
  roster = [],
  accusation = null,
  npcs = [],
  shellAccounts = [],
  detectiveEvidenceLog = [],
  scoringTimeline = []
}) {
  const rosterBlock = roster.length > 0 ? roster.join(', ') : '(none provided)';
  const accusationBlock = accusation
    ? `Accused: ${(accusation.accused || []).join(', ') || 'unspecified'}\nCharge: ${accusation.charge || 'unspecified'}`
    : '(none provided)';
  const npcsBlock = npcs.length > 0 ? npcs.join(', ') : '(none)';
  const shellAccountsBlock = shellAccounts.length > 0
    ? JSON.stringify(shellAccounts, null, 2)
    : '(none)';
  const evidenceLogBlock = detectiveEvidenceLog.length > 0
    ? JSON.stringify(detectiveEvidenceLog, null, 2)
    : '(none)';
  const timelineBlock = scoringTimeline.length > 0
    ? JSON.stringify(scoringTimeline, null, 2)
    : '(none)';

  const userPrompt = `<ROSTER>
${rosterBlock}
</ROSTER>

<ACCUSATION>
${accusationBlock}
</ACCUSATION>

<NPCS>
${npcsBlock}
</NPCS>

<SHELL_ACCOUNTS>
${shellAccountsBlock}
</SHELL_ACCOUNTS>

<DETECTIVE_EVIDENCE_LOG>
${evidenceLogBlock}
</DETECTIVE_EVIDENCE_LOG>

<SCORING_TIMELINE>
${timelineBlock}
</SCORING_TIMELINE>

<DIRECTOR_NOTES_RAW>
${rawProse}
</DIRECTOR_NOTES_RAW>

<ENRICHMENT_RULES>
1. Preserve rawProse verbatim — your output's rawProse field MUST equal the text inside <DIRECTOR_NOTES_RAW> above, exactly.
2. Use ONLY roster names from <ROSTER> as keys in characterMentions.
3. Link transactionReferences only when timestamp, actor, and amount converge with <SCORING_TIMELINE>. Otherwise confidence: "low" and empty linkedTransactions.
4. Extract quotes verbatim; confidence "high" iff speaker named adjacent, else "low".
5. postInvestigationDevelopments only for passages with explicit post-investigation markers.
6. Empty arrays are valid. Never fabricate.
</ENRICHMENT_RULES>`;

  return { systemPrompt: ENRICHMENT_SYSTEM_PROMPT, userPrompt };
}

module.exports = {
  DIRECTOR_NOTES_ENRICHED_SCHEMA,
  buildEnrichmentPrompt
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest lib/__tests__/director-enricher.test.js -v
```

Expected: all PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/director-enricher.js lib/__tests__/director-enricher.test.js
git commit -m "feat(enrichment): add enrichment prompt builder"
```

---

## Task 3: Add the enrichment call with graceful fallback

**Files:**
- Modify: `lib/director-enricher.js`
- Modify: `lib/__tests__/director-enricher.test.js`

- [ ] **Step 1: Add failing enrichment-call tests**

Append to `lib/__tests__/director-enricher.test.js`:

```javascript
const { enrichDirectorNotes, createFallback } = require('../director-enricher');

describe('createFallback', () => {
  it('preserves rawProse and returns empty indexes', () => {
    const fallback = createFallback('some prose');
    expect(fallback.rawProse).toBe('some prose');
    expect(fallback.characterMentions).toEqual({});
    expect(fallback.entityNotes).toEqual({ npcsReferenced: [], shellAccountsReferenced: [] });
    expect(fallback.quotes).toEqual([]);
    expect(fallback.transactionReferences).toEqual([]);
    expect(fallback.postInvestigationDevelopments).toEqual([]);
  });
});

describe('enrichDirectorNotes', () => {
  const baseContext = {
    rawProse: 'Vic was working the room. "do you want to trade a little" Remi said to Mel.',
    roster: ['Vic', 'Remi', 'Mel'],
    accusation: { accused: ['Morgan'], charge: 'Murder' },
    npcs: ['Blake'],
    shellAccounts: [],
    detectiveEvidenceLog: [],
    scoringTimeline: []
  };

  it('invokes sdk with opus model, schema, and disableTools', async () => {
    const sdk = jest.fn().mockResolvedValue({
      rawProse: baseContext.rawProse,
      characterMentions: {},
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });

    await enrichDirectorNotes(baseContext, sdk);

    expect(sdk).toHaveBeenCalledTimes(1);
    const call = sdk.mock.calls[0][0];
    expect(call.model).toBe('opus');
    expect(call.disableTools).toBe(true);
    expect(call.jsonSchema).toBe(DIRECTOR_NOTES_ENRICHED_SCHEMA);
    expect(call.timeoutMs).toBe(10 * 60 * 1000);
    expect(call.label).toBe('Director notes enrichment');
  });

  it('returns the SDK result on success', async () => {
    const expected = {
      rawProse: baseContext.rawProse,
      characterMentions: { Vic: [{ excerpt: 'Vic was working the room.' }] },
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [{ speaker: 'Remi', text: 'do you want to trade a little', confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    };
    const sdk = jest.fn().mockResolvedValue(expected);

    const result = await enrichDirectorNotes(baseContext, sdk);
    expect(result).toEqual(expected);
  });

  it('returns fallback when SDK throws', async () => {
    const sdk = jest.fn().mockRejectedValue(new Error('timeout'));
    const result = await enrichDirectorNotes(baseContext, sdk);
    expect(result.rawProse).toBe(baseContext.rawProse);
    expect(result.characterMentions).toEqual({});
    expect(result.quotes).toEqual([]);
    expect(result.transactionReferences).toEqual([]);
  });

  it('returns fallback when SDK returns result missing required rawProse', async () => {
    const sdk = jest.fn().mockResolvedValue({ characterMentions: {} });
    const result = await enrichDirectorNotes(baseContext, sdk);
    expect(result.rawProse).toBe(baseContext.rawProse);
  });

  it('returns fallback with empty prose when input rawProse is missing', async () => {
    const sdk = jest.fn();
    const result = await enrichDirectorNotes({ ...baseContext, rawProse: '' }, sdk);
    expect(result.rawProse).toBe('');
    expect(sdk).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest lib/__tests__/director-enricher.test.js -v
```

Expected: new tests FAIL — "enrichDirectorNotes is not a function".

- [ ] **Step 3: Implement `enrichDirectorNotes` and `createFallback`**

Append to `lib/director-enricher.js`:

```javascript
function createFallback(rawProse) {
  return {
    rawProse: rawProse || '',
    characterMentions: {},
    entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
    quotes: [],
    transactionReferences: [],
    postInvestigationDevelopments: []
  };
}

async function enrichDirectorNotes(context, sdk) {
  const rawProse = context?.rawProse || '';
  if (!rawProse) {
    return createFallback('');
  }

  const { systemPrompt, userPrompt } = buildEnrichmentPrompt(context);

  try {
    const result = await sdk({
      prompt: userPrompt,
      systemPrompt,
      model: 'opus',
      disableTools: true,
      jsonSchema: DIRECTOR_NOTES_ENRICHED_SCHEMA,
      timeoutMs: 10 * 60 * 1000,
      label: 'Director notes enrichment'
    });

    if (!result || typeof result.rawProse !== 'string') {
      console.warn('[enrichDirectorNotes] SDK returned invalid result; falling back');
      return createFallback(rawProse);
    }

    // Normalize optional fields so downstream consumers always see the expected shape
    return {
      rawProse: result.rawProse,
      characterMentions: result.characterMentions || {},
      entityNotes: result.entityNotes || { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: result.quotes || [],
      transactionReferences: result.transactionReferences || [],
      postInvestigationDevelopments: result.postInvestigationDevelopments || []
    };
  } catch (error) {
    console.warn(`[enrichDirectorNotes] SDK call failed: ${error.message}; falling back`);
    return createFallback(rawProse);
  }
}

module.exports = {
  DIRECTOR_NOTES_ENRICHED_SCHEMA,
  buildEnrichmentPrompt,
  enrichDirectorNotes,
  createFallback
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest lib/__tests__/director-enricher.test.js -v
```

Expected: all PASS (20 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/director-enricher.js lib/__tests__/director-enricher.test.js
git commit -m "feat(enrichment): add enrichment call with graceful fallback"
```

---

## Task 4: Wire enricher into `parseRawInput` step 3

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js` (remove old `DIRECTOR_NOTES_SCHEMA`, remove inline step-3 AI call, reorder dependencies, call new enricher)
- Modify: `lib/__tests__/input-nodes-schema.test.js` (rewrite for new shape)

- [ ] **Step 1: Rewrite `input-nodes-schema.test.js`**

Replace the entire file with:

```javascript
const { _testing } = require('../workflow/nodes/input-nodes');

describe('parseRawInput wiring', () => {
  it('does NOT export legacy DIRECTOR_NOTES_SCHEMA', () => {
    expect(_testing.DIRECTOR_NOTES_SCHEMA).toBeUndefined();
  });

  it('still exposes SESSION_CONFIG_SCHEMA and SESSION_REPORT_SCHEMA for step 1/2', () => {
    expect(_testing.SESSION_CONFIG_SCHEMA).toBeDefined();
    expect(_testing.SESSION_REPORT_SCHEMA).toBeDefined();
  });
});

describe('mergeDirectorOverrides — passthrough behavior', () => {
  const { mergeDirectorOverrides } = _testing;

  it('returns sessionConfig unchanged when directorNotes is present', () => {
    const sessionConfig = {
      roster: ['Alex'],
      journalistFirstName: 'Cassandra',
      reportingMode: 'remote',
      guestReporter: { name: 'Ashe', role: 'Guest Reporter' }
    };
    const directorNotes = { rawProse: 'anything' };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged).toEqual(sessionConfig);
  });

  it('preserves reportingMode from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, { rawProse: '' });
    expect(merged.reportingMode).toBe('remote');
  });

  it('preserves guestReporter from sessionConfig', () => {
    const guest = { name: 'Ashe', role: 'Guest Reporter' };
    const sessionConfig = { roster: ['Alex'], guestReporter: guest };
    const merged = mergeDirectorOverrides(sessionConfig, { rawProse: '' });
    expect(merged.guestReporter).toEqual(guest);
  });

  it('handles null directorNotes without adding default fields', () => {
    const sessionConfig = { roster: ['Alex'] };
    const merged = mergeDirectorOverrides(sessionConfig, null);
    expect(merged).toEqual(sessionConfig);
  });
});
```

- [ ] **Step 2: Run schema test to verify it fails**

```bash
npx jest lib/__tests__/input-nodes-schema.test.js -v
```

Expected: FAIL (because `DIRECTOR_NOTES_SCHEMA` still exists and is still exported).

- [ ] **Step 3: Remove `DIRECTOR_NOTES_SCHEMA` from `input-nodes.js` and update `_testing` export**

In `lib/workflow/nodes/input-nodes.js`, delete lines 182-207 (the full `DIRECTOR_NOTES_SCHEMA` constant and its doc comment at 180-181). Then in the `_testing` export block (around line 851-861), remove the `DIRECTOR_NOTES_SCHEMA` entry:

Find (around line 851):
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

Replace with:
```javascript
  _testing: {
    DEFAULT_DATA_DIR,
    SESSION_CONFIG_SCHEMA,
    SESSION_REPORT_SCHEMA,
    WHITEBOARD_SCHEMA,
    deriveSessionId,
    ensureDir,
    sanitizePath,
    mergeDirectorOverrides
  }
```

- [ ] **Step 4: Replace step 3 body in `parseRawInput` with enricher call**

At the top of `lib/workflow/nodes/input-nodes.js`, add to existing requires:

```javascript
const { enrichDirectorNotes } = require('../../director-enricher');
const { getThemeNPCs } = require('../../theme-config');
```

Locate `parseRawInput` (starts around line 359). Replace the existing **Step 3 Promise** block (approximately lines 480-523 — the `const step3Promise = (async () => { ... })();` and its entire body) with a placeholder comment (we'll call the enricher after steps 1 & 2 resolve):

Find the block starting `  // Step 3 Promise: Parse director notes` and ending at its `})();` and delete it entirely.

Then find the `Promise.allSettled` block (approximately lines 527-531):

```javascript
  const [step1Result, step2Result, step3Result] = await Promise.allSettled([
    step1Promise,
    step2Promise,
    step3Promise
  ]);
```

Replace with:

```javascript
  const [step1Result, step2Result] = await Promise.allSettled([
    step1Promise,
    step2Promise
  ]);
```

Then find the Step 3 result extraction (approximately lines 546-548):

```javascript
  let directorNotes = step3Result.status === 'fulfilled'
    ? step3Result.value
    : { observations: { behaviorPatterns: [], suspiciousCorrelations: [], notableMoments: [] } };
```

Replace with:

```javascript
  // Step 3: Director notes enrichment (depends on Step 1 roster + Step 2 orchestrator data)
  const theme = config?.configurable?.theme || 'journalist';
  const themeNPCs = getThemeNPCs(theme);
  const orchestratorData = orchestratorParsed || {};

  let directorNotes;
  if (!rawInput.directorNotes) {
    directorNotes = {
      rawProse: '',
      characterMentions: {},
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: []
    };
  } else {
    console.log('[parseRawInput] Step 3: Enriching director notes with Opus');
    directorNotes = await enrichDirectorNotes({
      rawProse: rawInput.directorNotes,
      roster: sessionConfig.roster || [],
      accusation: sessionConfig.accusation || null,
      npcs: themeNPCs,
      shellAccounts: orchestratorData.shellAccounts || [],
      detectiveEvidenceLog: orchestratorData.exposedTokens || [],
      scoringTimeline: orchestratorData.scoringTimeline || []
    }, sdk);

    const counts = {
      chars: Object.keys(directorNotes.characterMentions || {}).length,
      quotes: (directorNotes.quotes || []).length,
      txRefs: (directorNotes.transactionReferences || []).length,
      postInv: (directorNotes.postInvestigationDevelopments || []).length
    };
    console.log(`[parseRawInput] Director enrichment complete: ${counts.chars} character mentions, ${counts.quotes} quotes, ${counts.txRefs} transaction links, ${counts.postInv} post-investigation items`);
  }
```

Make sure the surrounding code still uses `directorNotes` correctly for step 4 (whiteboard merge) and step 5 (playerFocus). The whiteboard merge line `directorNotes.whiteboard = whiteboardData;` must still work — it does, since `directorNotes` is now the enriched object with `whiteboard` added.

- [ ] **Step 5: Run schema test to verify it passes**

```bash
npx jest lib/__tests__/input-nodes-schema.test.js -v
```

Expected: PASS.

- [ ] **Step 6: Run full unit-test suite to surface downstream breaks**

```bash
npm test
```

Expected: failures in `contradiction-surfacing.test.js`, `prompt-builder.test.js`, and any tests asserting on legacy `observations.behaviorPatterns` shape. This is EXPECTED — subsequent tasks fix each consumer. Note which tests fail; they should all get green in Tasks 5-10.

- [ ] **Step 7: Commit**

```bash
git add lib/workflow/nodes/input-nodes.js lib/__tests__/input-nodes-schema.test.js
git commit -m "feat(enrichment): swap parseRawInput step 3 to Opus enricher"
```

---

## Task 5: Update `synthesizePlayerFocus` in node-helpers

**Files:**
- Modify: `lib/workflow/nodes/node-helpers.js`

- [ ] **Step 1: Check for existing node-helpers tests**

```bash
ls lib/__tests__/ | grep -i focus
ls lib/__tests__/ | grep -i helper
```

If no existing test file covers `synthesizePlayerFocus`, create `lib/__tests__/synthesize-player-focus.test.js`; otherwise add the tests below to the existing file.

- [ ] **Step 2: Write failing tests**

Create `lib/__tests__/synthesize-player-focus.test.js`:

```javascript
const { synthesizePlayerFocus } = require('../workflow/nodes/node-helpers');

describe('synthesizePlayerFocus — reads enriched director-notes shape', () => {
  const sessionConfig = {
    roster: ['Alex', 'Vic', 'Morgan'],
    accusation: { accused: ['Alex'], charge: 'Murder of Marcus', notes: 'Stolen code motive' }
  };

  it('exposes directorObservations with rawProse, quotes, postInvestigationDevelopments', () => {
    const directorNotes = {
      rawProse: 'Alex was seen with Sam. "we had to act" Alex said.',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      postInvestigationDevelopments: [{ headline: 'Alex detained' }],
      whiteboard: {}
    };
    const focus = synthesizePlayerFocus(sessionConfig, directorNotes);

    expect(focus.directorObservations.rawProse).toBe(directorNotes.rawProse);
    expect(focus.directorObservations.quotes).toEqual(directorNotes.quotes);
    expect(focus.directorObservations.postInvestigationDevelopments).toEqual(directorNotes.postInvestigationDevelopments);
  });

  it('does NOT expose legacy behaviorPatterns/suspiciousCorrelations/notableMoments fields', () => {
    const directorNotes = { rawProse: 'notes', whiteboard: {} };
    const focus = synthesizePlayerFocus(sessionConfig, directorNotes);
    expect(focus.directorObservations.behaviorPatterns).toBeUndefined();
    expect(focus.directorObservations.suspiciousCorrelations).toBeUndefined();
    expect(focus.directorObservations.notableMoments).toBeUndefined();
  });

  it('handles missing director notes gracefully', () => {
    const focus = synthesizePlayerFocus(sessionConfig, null);
    expect(focus.directorObservations.rawProse).toBe('');
    expect(focus.directorObservations.quotes).toEqual([]);
    expect(focus.directorObservations.postInvestigationDevelopments).toEqual([]);
  });

  it('still carries accusation and primaryInvestigation through', () => {
    const focus = synthesizePlayerFocus(sessionConfig, { rawProse: '' });
    expect(focus.accusation.accused).toEqual(['Alex']);
    expect(focus.primaryInvestigation).toBe('Murder of Marcus');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest lib/__tests__/synthesize-player-focus.test.js -v
```

Expected: FAIL — `directorObservations.rawProse` is undefined (old code returns `{behaviorPatterns, suspiciousCorrelations, notableMoments}`).

- [ ] **Step 4: Update `synthesizePlayerFocus`**

In `lib/workflow/nodes/node-helpers.js`, locate `synthesizePlayerFocus` at line 336. Find this block (lines 337-380):

```javascript
function synthesizePlayerFocus(sessionConfig, directorNotes) {
  const whiteboard = directorNotes?.whiteboard || {};
  const observations = directorNotes?.observations || {};

  // ... existing code ...

    // Director observations (what ACTUALLY happened - highest weight for narrative)
    directorObservations: {
      behaviorPatterns: observations.behaviorPatterns || [],
      suspiciousCorrelations: observations.suspiciousCorrelations || [],
      notableMoments: observations.notableMoments || []
    },
```

Change the `const observations = directorNotes?.observations || {};` line (line 338) to:

```javascript
  const rawProse = directorNotes?.rawProse || '';
  const quotes = directorNotes?.quotes || [];
  const postInvestigationDevelopments = directorNotes?.postInvestigationDevelopments || [];
```

And replace the `directorObservations` block (lines 375-380) with:

```javascript
    // Director observations (what ACTUALLY happened - highest weight for narrative)
    // Enriched schema (2026-04): raw prose + quote bank + post-investigation news
    directorObservations: {
      rawProse,
      quotes,
      postInvestigationDevelopments
    },
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest lib/__tests__/synthesize-player-focus.test.js -v
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/workflow/nodes/node-helpers.js lib/__tests__/synthesize-player-focus.test.js
git commit -m "refactor(enrichment): synthesizePlayerFocus reads enriched shape"
```

---

## Task 6: Update `arc-specialist-nodes.js` — both core and revision paths

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js`

- [ ] **Step 1: Write failing test**

Create `lib/__tests__/arc-specialist-prompts.test.js`:

```javascript
const {
  _testing
} = require('../workflow/nodes/arc-specialist-nodes');

describe('arc-specialist prompt builders consume enriched director-notes', () => {
  // Only run if _testing exports the helpers we need; otherwise these are inlined.
  // We reach in via require.cache to get the module internals.
  const arcModule = require('../workflow/nodes/arc-specialist-nodes');

  const state = {
    sessionConfig: { roster: ['Alex', 'Vic', 'Morgan'] },
    playerFocus: {
      accusation: { accused: ['Alex'], charge: 'Murder', reasoning: 'Motive present' },
      whiteboardContext: { suspectsExplored: ['Vic'], connections: [], notes: [], namesFound: ['Alex'] },
      primaryInvestigation: 'Who killed Marcus'
    },
    directorNotes: {
      rawProse: 'Alex was seen with Sam in the corner. "we had to act" Alex said.',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      transactionReferences: [{
        excerpt: 'Alex paid Blake',
        linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }],
        confidence: 'high'
      }],
      postInvestigationDevelopments: [{ headline: 'Alex detained' }],
      whiteboard: {}
    },
    evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] }, allEvidenceIds: [] },
    theme: 'journalist',
    canonicalCharacters: {}
  };

  it('buildCoreArcPrompt includes rawProse and NOT legacy 3-bucket JSON', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).toContain('Alex was seen with Sam in the corner.');
    expect(prompt).not.toMatch(/\*\*Behavior Patterns:\*\*/);
    expect(prompt).not.toMatch(/\*\*Suspicious Correlations:\*\*/);
    expect(prompt).not.toMatch(/\*\*Notable Moments:\*\*/);
  });

  it('buildCoreArcPrompt surfaces quotes, transactionReferences, postInvestigationDevelopments', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).toContain('we had to act');
    expect(prompt).toContain('tay004');
    expect(prompt).toContain('Alex detained');
  });

  it('buildArcRevisionPrompt includes rawProse and NOT legacy arrays', () => {
    const revisionState = { ...state, validationResults: { structuralIssues: [], issues: [] } };
    const prompt = arcModule._testing.buildArcRevisionPrompt(revisionState, '', '');
    expect(prompt).toContain('Alex was seen with Sam in the corner.');
    expect(prompt).not.toMatch(/\*\*Behavior Patterns:\*\*/);
  });
});
```

- [ ] **Step 2: Check what `_testing` currently exports**

```bash
grep -n "_testing" lib/workflow/nodes/arc-specialist-nodes.js
```

If `buildCoreArcPrompt` and `buildArcRevisionPrompt` are NOT in `_testing`, we need to add them. Find the `module.exports` block near end of file (around line 1950+) and ensure `_testing` exports both helpers:

```javascript
module.exports = {
  // ... existing exports ...
  _testing: {
    // ... existing ...
    buildCoreArcPrompt,
    buildArcRevisionPrompt
  }
};
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest lib/__tests__/arc-specialist-prompts.test.js -v
```

Expected: FAIL — prompt contains `Behavior Patterns:` heading and does NOT contain rawProse.

- [ ] **Step 4: Update `extractPlayerFocusContext`**

In `lib/workflow/nodes/arc-specialist-nodes.js`, find `extractPlayerFocusContext` (starts line 78):

```javascript
function extractPlayerFocusContext(state) {
  const playerFocus = state.playerFocus || {};
  const directorNotes = state.directorNotes || {};
  const sessionConfig = state.sessionConfig || {};

  return {
    accusation: playerFocus.accusation || {},
    whiteboard: playerFocus.whiteboardContext || {},
    observations: directorNotes.observations || {},
    roster: sessionConfig.roster || [],
    primaryInvestigation: playerFocus.primaryInvestigation || 'General investigation'
  };
}
```

Replace with:

```javascript
function extractPlayerFocusContext(state) {
  const playerFocus = state.playerFocus || {};
  const directorNotes = state.directorNotes || {};
  const sessionConfig = state.sessionConfig || {};

  return {
    accusation: playerFocus.accusation || {},
    whiteboard: playerFocus.whiteboardContext || {},
    // Enriched director-notes shape (2026-04): rawProse primary, quotes + tx refs + post-investigation news as structured extras
    directorProse: directorNotes.rawProse || '',
    directorQuotes: directorNotes.quotes || [],
    directorTransactionLinks: directorNotes.transactionReferences || [],
    directorPostInvestigation: directorNotes.postInvestigationDevelopments || [],
    roster: sessionConfig.roster || [],
    primaryInvestigation: playerFocus.primaryInvestigation || 'General investigation'
  };
}
```

- [ ] **Step 5: Update `buildCoreArcPrompt` observations block**

Find the `### Director Observations` section in `buildCoreArcPrompt` (around lines 211-214):

```
### Director Observations (GROUND TRUTH - Director witnessed these behaviors)
**Behavior Patterns:** ${JSON.stringify(context.observations.behaviorPatterns || [])}
**Suspicious Correlations:** ${JSON.stringify(context.observations.suspiciousCorrelations || [])}
**Notable Moments:** ${JSON.stringify(context.observations.notableMoments || [])}
```

Replace with:

```
### Director Observations (GROUND TRUTH - Director witnessed these behaviors)
The director's prose below is the AUTHORITATIVE source. Use it to ground arcs in behavioral reality.

<DIRECTOR_NOTES>
${context.directorProse || '(no director notes provided)'}
</DIRECTOR_NOTES>

${context.directorQuotes.length > 0 ? `<QUOTE_BANK>
Verbatim quotes extracted from the notes — prefer these when citing what someone said:
${context.directorQuotes.map(q => `- ${q.speaker}${q.addressee ? ` (to ${q.addressee})` : ''}: "${q.text}"${q.context ? ` — ${q.context}` : ''} [${q.confidence}]`).join('\n')}
</QUOTE_BANK>` : ''}

${context.directorTransactionLinks.length > 0 ? `<TRANSACTION_LINKS>
Behavioral observations pre-linked to specific burial transactions:
${context.directorTransactionLinks.map(t => {
  const txs = (t.linkedTransactions || []).map(tx => `${tx.timestamp} ${tx.tokenId} ${tx.amount} → ${tx.sellingTeam}`).join('; ');
  return `- "${t.excerpt}" → [${txs || 'no link'}] (${t.confidence})`;
}).join('\n')}
</TRANSACTION_LINKS>` : ''}

${context.directorPostInvestigation.length > 0 ? `<POST_INVESTIGATION_NEWS>
Developments that occurred AFTER the investigation concluded — distinct epistemic status:
${context.directorPostInvestigation.map(d => `- ${d.headline}${d.detail ? `: ${d.detail}` : ''}${d.subjects?.length ? ` [subjects: ${d.subjects.join(', ')}]` : ''}`).join('\n')}
</POST_INVESTIGATION_NEWS>` : ''}
```

- [ ] **Step 6: Update revision-path prompt builder**

The file contains a SECOND prompt builder (for arc revisions) that reads the 3-bucket shape directly via its own `const observations = directorNotes.observations || {};`. It does NOT go through `extractPlayerFocusContext`.

Search for this line inside the file (it appears exactly once outside any test):

```javascript
  const observations = directorNotes.observations || {};
```

This line lives inside the revision prompt builder function (search `grep -n "const observations" lib/workflow/nodes/arc-specialist-nodes.js` to confirm the function name and line number — previously at line 722 pre-edits; will have shifted).

Replace that line with:

```javascript
  const directorProse = directorNotes.rawProse || '';
  const directorQuotes = directorNotes.quotes || [];
  const directorTxRefs = directorNotes.transactionReferences || [];
  const directorPostInv = directorNotes.postInvestigationDevelopments || [];
```

Then, a few lines below, find the three-line block in the same function:

```
**Behavior Patterns:** ${JSON.stringify(observations.behaviorPatterns || [])}
**Suspicious Correlations:** ${JSON.stringify(observations.suspiciousCorrelations || [])}
**Notable Moments:** ${JSON.stringify(observations.notableMoments || [])}
```

Replace with exactly the same structured block pattern used in Step 5 (for `buildCoreArcPrompt`), but using the local variables from this function:

```
The director's prose below is the AUTHORITATIVE source. Use it to ground arcs in behavioral reality.

<DIRECTOR_NOTES>
${directorProse || '(no director notes provided)'}
</DIRECTOR_NOTES>

${directorQuotes.length > 0 ? `<QUOTE_BANK>
Verbatim quotes extracted from the notes — prefer these when citing what someone said:
${directorQuotes.map(q => `- ${q.speaker}${q.addressee ? ` (to ${q.addressee})` : ''}: "${q.text}"${q.context ? ` — ${q.context}` : ''} [${q.confidence}]`).join('\n')}
</QUOTE_BANK>` : ''}

${directorTxRefs.length > 0 ? `<TRANSACTION_LINKS>
Behavioral observations pre-linked to specific burial transactions:
${directorTxRefs.map(t => {
  const txs = (t.linkedTransactions || []).map(tx => `${tx.timestamp} ${tx.tokenId} ${tx.amount} → ${tx.sellingTeam}`).join('; ');
  return `- "${t.excerpt}" → [${txs || 'no link'}] (${t.confidence})`;
}).join('\n')}
</TRANSACTION_LINKS>` : ''}

${directorPostInv.length > 0 ? `<POST_INVESTIGATION_NEWS>
Developments that occurred AFTER the investigation concluded — distinct epistemic status:
${directorPostInv.map(d => `- ${d.headline}${d.detail ? `: ${d.detail}` : ''}${d.subjects?.length ? ` [subjects: ${d.subjects.join(', ')}]` : ''}`).join('\n')}
</POST_INVESTIGATION_NEWS>` : ''}
```

- [ ] **Step 7: Update the diagnostic `console.log`**

Search the file for:

```javascript
  console.log(`  - director.behaviorPatterns: ${(observations.behaviorPatterns || []).length} items`);
```

Replace with:

```javascript
  console.log(`  - director: ${(directorNotes.rawProse || '').length} chars prose, ${(directorNotes.quotes || []).length} quotes, ${(directorNotes.transactionReferences || []).length} tx refs`);
```

If there's a surrounding `const observations = ...` line that is now unused after this change, delete it to avoid a lint warning.

- [ ] **Step 8: Run arc-specialist tests**

```bash
npx jest lib/__tests__/arc-specialist-prompts.test.js lib/__tests__/generate-arcs-retry.test.js -v
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/workflow/nodes/arc-specialist-nodes.js lib/__tests__/arc-specialist-prompts.test.js
git commit -m "refactor(enrichment): arc-specialist prompts use enriched director notes"
```

---

## Task 7: Update `buildArticlePrompt` in prompt-builder.js

**Files:**
- Modify: `lib/prompt-builder.js`
- Modify: `lib/__tests__/prompt-builder.test.js`

- [ ] **Step 1: Write failing test**

Append to `lib/__tests__/prompt-builder.test.js` (after the existing describe blocks):

```javascript
describe('buildArticlePrompt — enriched director notes', () => {
  let builder;
  let mockThemeLoader;

  beforeEach(() => {
    jest.clearAllMocks();
    mockThemeLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'anti-patterns': '', 'section-rules': '', 'editorial-design': '', 'formatting': '',
        'writing-principles': ''
      }),
      loadTemplate: jest.fn(),
      validate: jest.fn()
    };
    const sessionConfig = { reportingMode: 'on-site', journalistFirstName: 'Cassandra' };
    builder = new PromptBuilder(mockThemeLoader, 'journalist', sessionConfig);
  });

  const outline = { theStory: { arcs: [] } };
  const template = '<template/>';

  it('injects rawProse inside <INVESTIGATION_OBSERVATIONS>', async () => {
    const directorNotes = {
      rawProse: 'I watched Alex and Sam in the corner.',
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: []
    };
    const { userPrompt } = await builder.buildArticlePrompt(outline, template, [], null, [], null, directorNotes, null);
    expect(userPrompt).toContain('<INVESTIGATION_OBSERVATIONS>');
    expect(userPrompt).toContain('I watched Alex and Sam in the corner.');
    expect(userPrompt).not.toContain('"behaviorPatterns"');
  });

  it('emits <QUOTE_BANK> when quotes present', async () => {
    const directorNotes = {
      rawProse: 'notes',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    };
    const { userPrompt } = await builder.buildArticlePrompt(outline, template, [], null, [], null, directorNotes, null);
    expect(userPrompt).toContain('<QUOTE_BANK>');
    expect(userPrompt).toContain('we had to act');
  });

  it('emits <TRANSACTION_LINKS> when links present', async () => {
    const directorNotes = {
      rawProse: 'notes',
      quotes: [],
      transactionReferences: [{
        excerpt: 'Kai paid Blake', linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }], confidence: 'high'
      }],
      postInvestigationDevelopments: []
    };
    const { userPrompt } = await builder.buildArticlePrompt(outline, template, [], null, [], null, directorNotes, null);
    expect(userPrompt).toContain('<TRANSACTION_LINKS>');
    expect(userPrompt).toContain('tay004');
  });

  it('emits <POST_INVESTIGATION_NEWS> when developments present', async () => {
    const directorNotes = {
      rawProse: 'notes',
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: [{ headline: 'Sarah named interim CEO', detail: 'Just been announced' }]
    };
    const { userPrompt } = await builder.buildArticlePrompt(outline, template, [], null, [], null, directorNotes, null);
    expect(userPrompt).toContain('<POST_INVESTIGATION_NEWS>');
    expect(userPrompt).toContain('Sarah named interim CEO');
    // This tag must be DISTINCT from general observations so Nova writes "It has just been announced..."
    expect(userPrompt).toMatch(/<POST_INVESTIGATION_NEWS>[\s\S]*Sarah named interim CEO[\s\S]*<\/POST_INVESTIGATION_NEWS>/);
  });

  it('omits empty tags', async () => {
    const directorNotes = {
      rawProse: 'just prose here',
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: []
    };
    const { userPrompt } = await builder.buildArticlePrompt(outline, template, [], null, [], null, directorNotes, null);
    expect(userPrompt).not.toContain('<QUOTE_BANK>');
    expect(userPrompt).not.toContain('<TRANSACTION_LINKS>');
    expect(userPrompt).not.toContain('<POST_INVESTIGATION_NEWS>');
  });

  it('handles null directorNotes gracefully', async () => {
    const { userPrompt } = await builder.buildArticlePrompt(outline, template, [], null, [], null, null, null);
    expect(userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest lib/__tests__/prompt-builder.test.js -v
```

Expected: failures in the new describe block.

- [ ] **Step 3: Update `buildArticlePrompt`**

In `lib/prompt-builder.js`, find the `<INVESTIGATION_OBSERVATIONS>` block (around lines 807-814):

```javascript
${(directorNotes?.observations && Object.keys(directorNotes.observations).length > 0) ? `
<INVESTIGATION_OBSERVATIONS>
What you observed during the investigation this morning.
These ground your behavioral claims - who you saw talking to whom,
notable moments, patterns you noticed.

${JSON.stringify(directorNotes.observations, null, 2)}
</INVESTIGATION_OBSERVATIONS>` : ''}
```

Replace with:

```javascript
${(directorNotes?.rawProse) ? `
<INVESTIGATION_OBSERVATIONS>
What you observed during the investigation this morning.
These ground your behavioral claims — who you saw talking to whom, notable moments, patterns you noticed.

${directorNotes.rawProse}
</INVESTIGATION_OBSERVATIONS>` : ''}
${(directorNotes?.quotes?.length > 0) ? `
<QUOTE_BANK>
Verbatim quotes extracted from the investigation. Prefer these when citing what someone said over paraphrasing.
${directorNotes.quotes.map(q => `- ${q.speaker}${q.addressee ? ` (to ${q.addressee})` : ''}: "${q.text}"${q.context ? ` — ${q.context}` : ''} [${q.confidence}]`).join('\n')}
</QUOTE_BANK>` : ''}
${(directorNotes?.transactionReferences?.length > 0) ? `
<TRANSACTION_LINKS>
Behavioral observations pre-linked to specific burial transactions. Use these to ground financial claims in hard data.
${directorNotes.transactionReferences.map(t => {
  const txs = (t.linkedTransactions || []).map(tx => `${tx.timestamp} ${tx.tokenId} ${tx.amount} → ${tx.sellingTeam}`).join('; ');
  return `- "${t.excerpt}" → [${txs || 'no link'}] (${t.confidence})`;
}).join('\n')}
</TRANSACTION_LINKS>` : ''}
${(directorNotes?.postInvestigationDevelopments?.length > 0) ? `
<POST_INVESTIGATION_NEWS>
Developments that occurred AFTER the investigation concluded. Write these with distinct epistemic language: "It has just been announced…", "Currently…", "Following the investigation…". Do NOT conflate these with things Nova witnessed this morning.
${directorNotes.postInvestigationDevelopments.map(d => `- ${d.headline}${d.detail ? `: ${d.detail}` : ''}${d.subjects?.length ? ` [subjects: ${d.subjects.join(', ')}]` : ''}${d.bearingOnNarrative ? ` — ${d.bearingOnNarrative}` : ''}`).join('\n')}
</POST_INVESTIGATION_NEWS>` : ''}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest lib/__tests__/prompt-builder.test.js -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "refactor(enrichment): buildArticlePrompt uses enriched director notes"
```

---

## Task 8: Update `contradiction-nodes.js` to use `transactionReferences`

**Files:**
- Modify: `lib/workflow/nodes/contradiction-nodes.js`
- Modify: `lib/__tests__/contradiction-surfacing.test.js`

- [ ] **Step 1: Rewrite `contradiction-surfacing.test.js` fixtures**

Open `lib/__tests__/contradiction-surfacing.test.js`. In every `state` fixture, replace:

```javascript
directorNotes: { observations: { behaviorPatterns: [ /* strings */ ] } }
```

With:

```javascript
directorNotes: { rawProse: '...strings joined into prose...', transactionReferences: [] }
```

For the test `flags named shell accounts matching roster members`, change the fixture to:

```javascript
directorNotes: {
  rawProse: 'Skyler was the first to submit information to Nova, boldly declaring he had nothing to hide',
  transactionReferences: []
}
```

For `does NOT flag anonymous accounts`:

```javascript
directorNotes: { rawProse: '', transactionReferences: [] }
```

For the third test (`does NOT reference specific token IDs`):

```javascript
directorNotes: { rawProse: '', transactionReferences: [] }
```

- [ ] **Step 2: Run contradiction test to verify it fails**

```bash
npx jest lib/__tests__/contradiction-surfacing.test.js -v
```

Expected: FAIL on the transparency-vs-burial test — `contradiction-nodes.js` still reads `observations.behaviorPatterns` which is now undefined.

- [ ] **Step 3: Update `contradiction-nodes.js` to read `rawProse`**

In `lib/workflow/nodes/contradiction-nodes.js`, find line 24:

```javascript
  const behaviorPatterns = state.directorNotes?.observations?.behaviorPatterns || [];
```

Replace with:

```javascript
  // Enriched schema (2026-04): search raw prose instead of the removed 3-bucket arrays.
  // We split on sentence boundaries to preserve the per-sentence match semantics the
  // old behaviorPatterns array provided.
  const rawProse = state.directorNotes?.rawProse || '';
  const behaviorPatterns = rawProse
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
```

The rest of the file (the string-matching logic at lines 39-44 and 65-67) continues to work against these sentence-fragment strings unchanged.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest lib/__tests__/contradiction-surfacing.test.js -v
```

Expected: PASS.

- [ ] **Step 5: Add a new test exercising the pre-computed `transactionReferences`**

At the end of `lib/__tests__/contradiction-surfacing.test.js`, before the final `});`, add:

```javascript
test('transactionReferences from enriched notes are available in state for downstream use', () => {
  // This test documents that pre-computed transaction refs survive into the contradiction
  // surfacing step's state. The current programmatic logic doesn't consume them directly,
  // but they're available for future checks and for downstream prompt assembly.
  const state = {
    narrativeTensions: null,
    sessionConfig: { roster: ['Kai'] },
    shellAccounts: [],
    directorNotes: {
      rawProse: 'Kai was seen with Blake.',
      transactionReferences: [{
        excerpt: 'Kai was seen with Blake',
        linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }],
        confidence: 'high'
      }]
    }
  };
  const result = surfaceContradictions(state);
  expect(result.narrativeTensions).toBeDefined();
  // transactionReferences pass through state unchanged (not consumed by this node directly)
  expect(state.directorNotes.transactionReferences[0].linkedTransactions[0].tokenId).toBe('tay004');
});
```

- [ ] **Step 6: Run test**

```bash
npx jest lib/__tests__/contradiction-surfacing.test.js -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/workflow/nodes/contradiction-nodes.js lib/__tests__/contradiction-surfacing.test.js
git commit -m "refactor(enrichment): contradiction-nodes reads rawProse; preserves tx refs"
```

---

## Task 9: Update `image-prompt-builder.js` photo enrichment context

**Files:**
- Modify: `lib/image-prompt-builder.js`
- Modify: `lib/__tests__/image-prompt-builder.test.js` (if relevant test fixtures use old shape)

- [ ] **Step 1: Check existing test coverage**

```bash
grep -n "behaviorPatterns" lib/__tests__/image-prompt-builder.test.js
```

If matches, those fixtures will need updating. Note the line numbers.

- [ ] **Step 2: Write a focused test for the photo-enrichment prompt director context**

If the test file already has a test covering the photo-enrichment prompt, update its fixture. Otherwise, add a new test to `lib/__tests__/image-prompt-builder.test.js`:

```javascript
describe('buildPhotoEnrichmentPrompt — enriched director notes', () => {
  const { createImagePromptBuilder } = require('../image-prompt-builder');

  beforeAll(() => {
    // ImagePromptBuilder loads prompts from the filesystem; mock or rely on real files.
    // If existing tests mock it, follow their pattern.
  });

  it('references rawProse (truncated) when directorNotes.rawProse present', async () => {
    const builder = createImagePromptBuilder();
    const longProse = 'A'.repeat(1000) + ' Vic working the room. Morgan in shadows.';
    const sessionData = {
      roster: ['Vic', 'Morgan'],
      directorNotes: { rawProse: longProse }
    };
    const analysis = { filename: 'p.jpg', visualContent: 'v', narrativeMoment: 'n', emotionalTone: 'e', storyRelevance: 's' };
    const { userPrompt } = await builder.buildPhotoEnrichmentPrompt({ analysis, userInput: {}, sessionData });
    expect(userPrompt).toMatch(/DIRECTOR OBSERVATIONS:/);
    // truncated context, not the full 1000+ char prose
    expect(userPrompt).toContain('Vic working the room');
  });

  it('omits director context when rawProse missing', async () => {
    const builder = createImagePromptBuilder();
    const sessionData = { roster: [], directorNotes: {} };
    const analysis = { filename: 'p.jpg', visualContent: 'v', narrativeMoment: 'n', emotionalTone: 'e', storyRelevance: 's' };
    const { userPrompt } = await builder.buildPhotoEnrichmentPrompt({ analysis, userInput: {}, sessionData });
    expect(userPrompt).not.toMatch(/DIRECTOR OBSERVATIONS:/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx jest lib/__tests__/image-prompt-builder.test.js -v
```

- [ ] **Step 4: Update `image-prompt-builder.js`**

Find line 160-162:

```javascript
    const directorContext = sessionData.directorNotes?.observations?.behaviorPatterns?.length > 0
      ? `DIRECTOR OBSERVATIONS:\n${sessionData.directorNotes.observations.behaviorPatterns.slice(0, 3).join('\n')}`
      : '';
```

Replace with:

```javascript
    // Enriched schema (2026-04): use raw prose, truncated for context
    const rawProse = sessionData.directorNotes?.rawProse || '';
    const directorContext = rawProse
      ? `DIRECTOR OBSERVATIONS:\n${rawProse.slice(0, 600)}${rawProse.length > 600 ? '…' : ''}`
      : '';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest lib/__tests__/image-prompt-builder.test.js -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/image-prompt-builder.js lib/__tests__/image-prompt-builder.test.js
git commit -m "refactor(enrichment): image prompt uses rawProse for director context"
```

---

## Task 10: Remove dead `analyzeNarrativeArcs` and `buildArcAnalysisPrompt`

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js`
- Modify: `lib/prompt-builder.js`
- Modify: `lib/__tests__/prompt-builder.test.js`

These two functions are orphaned: the graph uses `analyzeArcsPlayerFocusGuided` from `arc-specialist-nodes.js` (verified at `lib/workflow/graph.js:436`). `analyzeNarrativeArcs` and `buildArcAnalysisPrompt` have no live callers. Removing them prevents the enriched schema from silently leaking the legacy 3-bucket shape into dead paths.

- [ ] **Step 1: Verify no live callers**

```bash
grep -rn "analyzeNarrativeArcs" lib/ server.js | grep -v __tests__
grep -rn "buildArcAnalysisPrompt" lib/ server.js | grep -v __tests__
```

Expected callers:
- `lib/workflow/nodes/ai-nodes.js` (the function itself + export)
- `lib/prompt-builder.js` (the function itself)
- `lib/workflow/nodes/index.js` (re-export, if present)

If any other callers exist, STOP and reassess — the "dead code" assumption is wrong.

- [ ] **Step 2: Delete from `ai-nodes.js`**

In `lib/workflow/nodes/ai-nodes.js`, find `async function analyzeNarrativeArcs(state, config) { ... }` (starts line 649). Delete the entire function and its doc comment (lines approximately 638-700 — the block ending at the `return { narrativeArcs: ..., currentPhase: ... }` and closing brace).

In the same file near line 1645, find:
```javascript
  analyzeNarrativeArcs: traceNode(analyzeNarrativeArcs, 'analyzeNarrativeArcs'),
```

Delete that line.

Also remove any remaining `analyzeNarrativeArcs` references in the module's header comment (line 6 has `- analyzeNarrativeArcs: Analyze evidence for narrative arcs (2)` — delete that bullet).

- [ ] **Step 3: Delete from `prompt-builder.js`**

Find `async buildArcAnalysisPrompt(sessionData) { ... }` (around lines 173-200 based on earlier grep). Delete the entire method including doc comment (lines 161-200 approximately — the block documenting `@param sessionData.directorNotes` through the closing brace of the method).

- [ ] **Step 4: Remove test references**

In `lib/__tests__/prompt-builder.test.js`, delete the `describe('buildArcAnalysisPrompt', ...)` block (starts around line 55) and its fixtures (`mockSessionData` at line 56). Keep other describe blocks intact.

In `lib/workflow/nodes/index.js` (if it re-exports nodes), remove any `analyzeNarrativeArcs` line.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all pass. If a test file fails because it imports the deleted function, delete those test cases too.

- [ ] **Step 6: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js lib/prompt-builder.js lib/__tests__/prompt-builder.test.js lib/workflow/nodes/index.js
git commit -m "chore: delete dead analyzeNarrativeArcs + buildArcAnalysisPrompt"
```

---

## Task 11: Rebuild InputReview — raw-prose section

**Files:**
- Modify: `console/components/checkpoints/InputReview.js`
- Modify: `console/console.css`

(The console has no unit-test framework; changes get manual/visual verification in later tasks.)

- [ ] **Step 1: Replace the Director Observations block with Director Notes (raw)**

In `console/components/checkpoints/InputReview.js`, find the existing Director Observations block (lines 127-136):

```javascript
    // Director Observations
    directorNotes.observations && directorNotes.observations.length > 0 &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' }, 'Director Observations'),
        React.createElement('ul', { className: 'checkpoint-section__list' },
          directorNotes.observations.map(function (obs, i) {
            return React.createElement('li', { key: obs + '-' + i, className: 'text-sm text-secondary' }, obs);
          })
        )
      ),
```

Replace with:

```javascript
    // Director Notes (raw prose - source of truth)
    directorNotes.rawProse && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement(window.Console.utils.CollapsibleSection, {
        title: 'Director Notes (' + directorNotes.rawProse.length + ' chars)',
        defaultOpen: true
      },
        React.createElement('pre', { className: 'director-prose' }, directorNotes.rawProse)
      )
    ),
```

- [ ] **Step 2: Add `.director-prose` style**

In `console/console.css`, append:

```css
.director-prose {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--text-secondary);
  background: var(--surface-1);
  padding: var(--space-md);
  border-left: 2px solid var(--accent-cyan);
  border-radius: 2px;
  margin: 0;
  max-height: 400px;
  overflow-y: auto;
}
```

(If `--surface-1`, `--text-secondary`, etc. don't exist, inspect `console.css` for the project's actual CSS variable names and adjust.)

- [ ] **Step 3: Visual verify in browser**

Start the server, navigate to a session at the `input-review` checkpoint, confirm raw prose renders as a collapsible pre-formatted block. Use a recent session (e.g., 041826 if it's been re-parsed post-migration; otherwise run a fresh session).

```bash
npm start
# Navigate to http://localhost:3001/console, log in, open a session at input-review
```

- [ ] **Step 4: Commit**

```bash
git add console/components/checkpoints/InputReview.js console/console.css
git commit -m "feat(ui): InputReview shows raw director prose"
```

---

## Task 12: Rebuild InputReview — structured enrichment sections

**Files:**
- Modify: `console/components/checkpoints/InputReview.js`
- Modify: `console/console.css`

- [ ] **Step 1: Add Character Mentions section**

In `InputReview.js`, after the Director Notes block from Task 11, add:

```javascript
    // Character Mentions (click tag to expand per-character excerpts)
    directorNotes.characterMentions && Object.keys(directorNotes.characterMentions).length > 0 &&
      React.createElement(CharacterMentionsSection, {
        mentions: directorNotes.characterMentions,
        roster: roster
      }),
```

And define `CharacterMentionsSection` at the top of the file, before the `InputReview` function:

```javascript
function CharacterMentionsSection({ mentions, roster }) {
  const [selected, setSelected] = React.useState(null);
  const rosterNames = roster.length > 0 ? roster : Object.keys(mentions);
  const entries = rosterNames.map(name => ({
    name,
    count: (mentions[name] || []).length,
    items: mentions[name] || []
  }));

  return React.createElement('div', { className: 'checkpoint-section' },
    React.createElement('h4', { className: 'checkpoint-section__title' }, 'Character Mentions'),
    React.createElement('div', { className: 'tag-list' },
      entries.map(e =>
        React.createElement('button', {
          key: e.name,
          type: 'button',
          className: 'char-mention-tag' + (e.count === 0 ? ' is-empty' : '') + (selected === e.name ? ' is-selected' : ''),
          onClick: () => setSelected(selected === e.name ? null : e.name),
          'aria-pressed': selected === e.name
        }, e.name + ' · ' + e.count)
      )
    ),
    selected && React.createElement('div', { className: 'char-mention-detail' },
      (mentions[selected] || []).length === 0
        ? React.createElement('p', { className: 'text-sm text-muted' }, 'No mentions.')
        : (mentions[selected] || []).map((m, i) =>
            React.createElement('div', { key: i, className: 'char-mention-excerpt' },
              React.createElement('p', { className: 'text-sm' }, m.excerpt),
              React.createElement('div', { className: 'char-mention-meta' },
                m.timeAnchor && React.createElement(Badge, { label: m.timeAnchor, color: 'var(--accent-cyan)' }),
                m.kind && React.createElement(Badge, { label: m.kind, color: 'var(--accent-amber)' }),
                (m.linkedCharacters || []).map(c =>
                  React.createElement(Badge, { key: c, label: 'w/ ' + c, color: 'var(--accent-green)' })
                )
              )
            )
          )
    )
  );
}
```

- [ ] **Step 2: Add Quote Bank section**

After the Character Mentions block, add:

```javascript
    // Quote Bank
    directorNotes.quotes && directorNotes.quotes.length > 0 &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' },
          'Quote Bank (' + directorNotes.quotes.length + ')'),
        React.createElement('ul', { className: 'quote-list' },
          directorNotes.quotes.map((q, i) =>
            React.createElement('li', { key: i, className: 'quote-row' + (q.confidence === 'low' ? ' is-low-confidence' : '') },
              React.createElement('span', { className: 'quote-speaker' },
                q.speaker,
                q.addressee && React.createElement('span', { className: 'text-muted' }, ' → ' + q.addressee),
                ': '
              ),
              React.createElement('span', { className: 'quote-text' }, '"' + q.text + '"'),
              React.createElement(Badge, {
                label: q.confidence,
                color: q.confidence === 'high' ? 'var(--accent-green)' : 'var(--accent-amber)'
              }),
              q.context && React.createElement('details', { className: 'quote-context' },
                React.createElement('summary', null, 'context'),
                React.createElement('p', { className: 'text-sm text-muted' }, q.context)
              )
            )
          )
        )
      ),
```

- [ ] **Step 3: Add Transaction Cross-References section**

After the Quote Bank, add:

```javascript
    // Transaction Cross-References
    directorNotes.transactionReferences && directorNotes.transactionReferences.length > 0 &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' },
          'Transaction Cross-References (' + directorNotes.transactionReferences.length + ')'),
        React.createElement('div', { className: 'tx-ref-list' },
          directorNotes.transactionReferences.map((t, i) =>
            React.createElement('div', { key: i, className: 'tx-ref-row' },
              React.createElement('div', { className: 'tx-ref-excerpt' },
                React.createElement('p', { className: 'text-sm' }, '"' + t.excerpt + '"'),
                React.createElement(Badge, {
                  label: t.confidence,
                  color: t.confidence === 'high' ? 'var(--accent-green)'
                       : t.confidence === 'medium' ? 'var(--accent-amber)' : 'var(--accent-red)'
                })
              ),
              React.createElement('div', { className: 'tx-ref-links' },
                (t.linkedTransactions || []).length === 0
                  ? React.createElement('span', { className: 'text-sm text-muted' }, '(no link)')
                  : t.linkedTransactions.map((tx, j) =>
                      React.createElement('div', { key: j, className: 'tx-ref-row__tx text-sm' },
                        React.createElement('span', { className: 'text-muted' }, tx.timestamp + ' · '),
                        React.createElement('span', null, tx.tokenId + ' (' + tx.tokenOwner + ') '),
                        React.createElement('span', { className: 'text-secondary' }, tx.amount + ' → ' + tx.sellingTeam)
                      )
                    ),
                t.linkReasoning && React.createElement('details', { className: 'tx-ref-reason' },
                  React.createElement('summary', null, 'Why this link?'),
                  React.createElement('p', { className: 'text-sm text-muted' }, t.linkReasoning)
                )
              )
            )
          )
        )
      ),
```

- [ ] **Step 4: Add Post-Investigation Developments section**

After the Transaction section, add:

```javascript
    // Post-Investigation Developments
    directorNotes.postInvestigationDevelopments && directorNotes.postInvestigationDevelopments.length > 0 &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' }, 'Post-Investigation Developments'),
        React.createElement('div', { className: 'news-card-list' },
          directorNotes.postInvestigationDevelopments.map((d, i) =>
            React.createElement('div', { key: i, className: 'news-card' },
              React.createElement('h5', { className: 'news-card__headline' }, d.headline),
              d.detail && React.createElement('p', { className: 'news-card__detail text-sm' }, d.detail),
              (d.subjects || []).length > 0 && React.createElement('div', { className: 'news-card__subjects' },
                d.subjects.map(s => React.createElement(Badge, { key: s, label: s, color: 'var(--accent-cyan)' }))
              ),
              d.bearingOnNarrative && React.createElement('p', { className: 'news-card__bearing text-sm text-muted' }, d.bearingOnNarrative)
            )
          )
        )
      ),
```

- [ ] **Step 5: Add Entity Notes strip**

After the Whiteboard block (existing, keep unchanged), add:

```javascript
    // Entity Notes (NPCs + flagged shell accounts)
    directorNotes.entityNotes && (
      (directorNotes.entityNotes.npcsReferenced || []).length > 0 ||
      (directorNotes.entityNotes.shellAccountsReferenced || []).length > 0
    ) &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' }, 'Entity Notes'),
        (directorNotes.entityNotes.npcsReferenced || []).length > 0 && React.createElement('div', { className: 'mb-sm' },
          React.createElement('span', { className: 'text-sm text-muted' }, 'NPCs referenced: '),
          React.createElement('div', { className: 'tag-list mt-sm' },
            directorNotes.entityNotes.npcsReferenced.map(n =>
              React.createElement(Badge, { key: n, label: n, color: 'var(--accent-amber)' })
            )
          )
        ),
        (directorNotes.entityNotes.shellAccountsReferenced || []).length > 0 && React.createElement('div', null,
          React.createElement('span', { className: 'text-sm text-muted' }, 'Shell accounts flagged: '),
          React.createElement('ul', { className: 'entity-shell-list' },
            directorNotes.entityNotes.shellAccountsReferenced.map((s, i) =>
              React.createElement('li', { key: i, className: 'text-sm' },
                React.createElement('strong', null, s.account),
                s.directorSuspicion && React.createElement('span', { className: 'text-muted' }, ' — ' + s.directorSuspicion)
              )
            )
          )
        )
      ),
```

- [ ] **Step 6: Add supporting CSS**

Append to `console/console.css`:

```css
/* Character Mentions grid */
.char-mention-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  margin: 0 6px 6px 0;
  background: var(--surface-1);
  border: 1px solid var(--border-muted);
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.char-mention-tag:hover { background: var(--surface-2); }
.char-mention-tag.is-selected { border-color: var(--accent-cyan); color: var(--text-primary); }
.char-mention-tag.is-empty { opacity: 0.45; }
.char-mention-detail { margin-top: var(--space-md); }
.char-mention-excerpt { margin-bottom: var(--space-sm); padding-left: var(--space-md); border-left: 2px solid var(--border-muted); }
.char-mention-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }

/* Quote bank */
.quote-list { list-style: none; padding-left: 0; }
.quote-row { padding: var(--space-sm) 0; border-bottom: 1px solid var(--border-muted); font-size: 0.875rem; }
.quote-row.is-low-confidence { background: color-mix(in srgb, var(--accent-amber) 8%, transparent); padding-left: var(--space-sm); border-left: 2px solid var(--accent-amber); }
.quote-speaker { font-weight: 600; color: var(--text-primary); }
.quote-text { color: var(--text-secondary); margin-right: 6px; }
.quote-context { margin-top: 4px; font-size: 0.8rem; }

/* Transaction cross-references */
.tx-ref-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); padding: var(--space-sm) 0; border-bottom: 1px solid var(--border-muted); }
.tx-ref-excerpt { display: flex; flex-direction: column; gap: 4px; }
.tx-ref-links { display: flex; flex-direction: column; gap: 4px; }
.tx-ref-row__tx { font-family: var(--font-mono, monospace); }
.tx-ref-reason { margin-top: 4px; font-size: 0.8rem; }

/* News cards for post-investigation developments */
.news-card-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-md); }
.news-card { padding: var(--space-md); background: var(--surface-1); border-left: 3px solid var(--accent-amber); border-radius: 2px; }
.news-card__headline { font-size: 0.95rem; margin: 0 0 var(--space-sm) 0; }
.news-card__detail { margin: 0 0 var(--space-sm) 0; }
.news-card__subjects { display: flex; gap: 4px; margin-bottom: var(--space-sm); }
.news-card__bearing { margin: 0; font-style: italic; }

/* Entity notes */
.entity-shell-list { list-style: disc; padding-left: var(--space-lg); margin: var(--space-sm) 0 0 0; }
```

If specific CSS variables don't match this codebase's tokens, grep `console/console.css` for the actual variable names and adjust.

- [ ] **Step 7: Visual verify**

Start the server, run a fresh session with known rich director notes (paste the 0411 notes into the textarea), advance to input-review, confirm all five subsections render correctly. Click a character tag to verify the expand behavior. Toggle the raw-prose collapsible. Check low-confidence quote styling.

- [ ] **Step 8: Commit**

```bash
git add console/components/checkpoints/InputReview.js console/console.css
git commit -m "feat(ui): InputReview surfaces character mentions, quotes, tx links, post-investigation news"
```

---

## Task 13: Integration verification against real session fixtures

**Files:**
- None new; running the pipeline end-to-end.

This task is verification, not code. The goal is to confirm enrichment works against real director prose before merging.

- [ ] **Step 1: Run the 0411 session through the pipeline with `--fresh` to force re-parse**

```bash
node scripts/e2e-walkthrough.js --session 0411 --fresh --step
```

When the pipeline pauses at `input-review`, open `data/0411/inputs/director-notes.json` and verify:
- `rawProse` exists and equals the raw "Notes:" section from the 04/11 raw input the user pasted during brainstorming.
- `characterMentions` contains entries for Vic, Morgan, Remi, Sarah, Riley, etc.
- `quotes` contains at least `"so do you want to trade a little"` (Remi) and `"I don't know if I should trust you"` (Mel). Both should be `confidence: "high"`.
- `quotes` contains `"I need BOTH of your companies to succeed"` (Vic).
- `transactionReferences` contains a link for the Kai/Blake/Taylor-account observation, linked to a 09:40 PM `tay004` transaction (amount `+$450,000`, team `Cass`).
- `postInvestigationDevelopments` is empty or small for 0411 (the 04/11 sample notes don't have strong post-investigation material).

Approve the checkpoint; allow the pipeline to continue and generate an arc set. Verify via `data/0411/analysis/arc-analysis.json` that generated arcs reference verbatim quotes from the quote bank.

- [ ] **Step 2: Run the 0417 session through the pipeline with `--fresh`**

```bash
node scripts/e2e-walkthrough.js --session 0417 --fresh --step
```

When the pipeline pauses at `input-review`, verify:
- `quotes` contains `"I'm 100% innocent. at least 100%"` (Quinn), `"Sarah said she wanted to preserve his memory"` (Morgan), and `"I'm the one who makes parties but he takes the credit"` (Sam).
- `postInvestigationDevelopments` contains entries for: Sarah Blackwood interim CEO, Marcus Memorial Fund being fake, Animal Liberation Fund donation, and Mel travelling to Rome.
- `entityNotes.npcsReferenced` contains Blake (mentioned: "Remi was seen having a quiet conversation with Blake around 9:30").

- [ ] **Step 3: Approve and allow the 0417 pipeline to continue to article generation**

Check that the final article in `data/0417/output/article.html` uses at least one verbatim quote from the bank and at least one post-investigation development framed with distinct language ("It has just been announced…", "Currently…", or similar).

- [ ] **Step 4: If any of the above fail, diagnose**

- If `rawProse` differs from input: the enricher violated the verbatim rule. Inspect the prompt — probably the rules block was not last, or the "MUST equal" wording was too weak.
- If key quotes are missing: increase specificity in the quote-extraction rule; may need to remind the model that quoted strings in the prose are first-class to extract.
- If transaction links are wrong: check `linkReasoning` output — it likely indicates where disambiguation failed. The scoring timeline format may need clearer column naming.

Fix, re-run, repeat until both sessions produce acceptable enrichments.

- [ ] **Step 5: Commit any diagnostic fixes**

```bash
git add -u
git commit -m "fix(enrichment): tune prompt for <specific diagnostic finding>"
```

If no fixes needed, nothing to commit — task is verification only.

---

## Task 14: Final regression sweep

**Files:**
- None new; running the full test suite.

- [ ] **Step 1: Run the entire Jest suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 2: Run test coverage**

```bash
npm run test:coverage
```

Expected: coverage on `lib/director-enricher.js` is ≥80% lines, ≥70% branches. If below, add unit tests for uncovered branches (especially fallback paths).

- [ ] **Step 3: If coverage insufficient, add targeted tests and re-run**

```bash
npx jest lib/__tests__/director-enricher.test.js --coverage --collectCoverageFrom=lib/director-enricher.js
```

Iterate until thresholds met.

- [ ] **Step 4: Final commit**

```bash
git add -u
git commit -m "test(enrichment): raise coverage for director-enricher"
```

(Skip if coverage already met without changes.)

---

## Out of scope — deferred to follow-up

- Wiring `proseOffset` fields into UI scroll-to-excerpt interactions (emitted by enricher but not consumed in v1).
- Feeding `characterMentions` index into arc-generation prompts (skipped as redundant with raw prose; revisit if arc quality regressions surface).
- In-checkpoint editing of enrichment output (rollback-to-parse covers v1 needs).
- Any theme-specific enrichment differences (detective theme uses the same schema in v1).

---

## Commit cadence summary

Expected commits, in order:
1. `feat(enrichment): add DIRECTOR_NOTES_ENRICHED_SCHEMA`
2. `feat(enrichment): add enrichment prompt builder`
3. `feat(enrichment): add enrichment call with graceful fallback`
4. `feat(enrichment): swap parseRawInput step 3 to Opus enricher`
5. `refactor(enrichment): synthesizePlayerFocus reads enriched shape`
6. `refactor(enrichment): arc-specialist prompts use enriched director notes`
7. `refactor(enrichment): buildArticlePrompt uses enriched director notes`
8. `refactor(enrichment): contradiction-nodes reads rawProse; preserves tx refs`
9. `refactor(enrichment): image prompt uses rawProse for director context`
10. `chore: delete dead analyzeNarrativeArcs + buildArcAnalysisPrompt`
11. `feat(ui): InputReview shows raw director prose`
12. `feat(ui): InputReview surfaces character mentions, quotes, tx links, post-investigation news`
13. `fix(enrichment): <diagnostic finding>` (optional, if integration surfaces an issue)
14. `test(enrichment): raise coverage for director-enricher` (optional, if coverage gap)
