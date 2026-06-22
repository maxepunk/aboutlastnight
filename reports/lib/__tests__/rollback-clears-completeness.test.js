/**
 * ROLLBACK_CLEARS completeness guard (ROOT-1)
 *
 * buildRollbackState clears a hand-maintained denylist (ROLLBACK_CLEARS). Nothing
 * previously asserted that the denylist actually COVERS every field a node writes —
 * which is exactly how ROLL-1 (roster) and ROLL-2 (arcEvidencePackages) slipped in.
 *
 * This test enumerates every Annotation channel (ReportStateAnnotation.spec) and
 * asserts each one is EITHER cleared by some rollback point OR explicitly listed in
 * ROLLBACK_CLEARS_EXEMPT with a documented reason. A new node-written field added
 * without a clear-list entry (and not exempted) fails here.
 */

const {
  ReportStateAnnotation,
  ROLLBACK_CLEARS,
  ROLLBACK_CLEARS_EXEMPT
} = require('../workflow/state');

describe('ROLLBACK_CLEARS completeness (ROOT-1)', () => {
  // Union of every field cleared by ANY rollback point
  const clearedSomewhere = new Set(
    Object.values(ROLLBACK_CLEARS).flat()
  );

  // Enumerate the TRUE channel set (Annotation.spec), not getDefaultState() —
  // getDefaultState omits shellAccounts, so it would miss that channel's drift.
  const allStateFields = Object.keys(ReportStateAnnotation.spec);

  test('every state field is either cleared by a rollback point or explicitly exempt', () => {
    const uncovered = allStateFields.filter(
      f => !clearedSomewhere.has(f) && !ROLLBACK_CLEARS_EXEMPT.has(f)
    );
    expect(uncovered).toEqual([]);
  });

  test('EXEMPT and CLEARED are disjoint (no field both cleared and exempted)', () => {
    const both = [...ROLLBACK_CLEARS_EXEMPT].filter(f => clearedSomewhere.has(f));
    expect(both).toEqual([]);
  });

  test('every EXEMPT entry is a real state field (no stale exemptions)', () => {
    const stale = [...ROLLBACK_CLEARS_EXEMPT].filter(f => !allStateFields.includes(f));
    expect(stale).toEqual([]);
  });

  test('every cleared field is a real state field (no typos in ROLLBACK_CLEARS)', () => {
    const ghosts = [...clearedSomewhere].filter(f => !allStateFields.includes(f));
    expect(ghosts).toEqual([]);
  });

  test('roster + rosterPronouns are cleared somewhere (ROLL-1/ROLL-3 guard)', () => {
    expect(clearedSomewhere.has('roster')).toBe(true);
    expect(clearedSomewhere.has('rosterPronouns')).toBe(true);
  });

  test('arcEvidencePackages is cleared somewhere (ROLL-2 guard)', () => {
    expect(clearedSomewhere.has('arcEvidencePackages')).toBe(true);
  });

  test('full-context raw inputs cleared + _previousFullContext exempt (ROLL-4 guard)', () => {
    expect(clearedSomewhere.has('accusation')).toBe(true);
    expect(clearedSomewhere.has('sessionReport')).toBe(true);
    expect(clearedSomewhere.has('directorNotesRaw')).toBe(true);
    expect(ROLLBACK_CLEARS_EXEMPT.has('_previousFullContext')).toBe(true);
  });
});

describe('ROLLBACK_CLEARS per-point re-pause completeness (ROOT-1, audit extension)', () => {
  // GRAPH EXECUTION / REPLAY order (derived from graph.js edges) — deliberately NOT the
  // frontend DISPLAY order in console/utils.js (which lists 'input-review' first). On
  // rollback the graph replays from START in THIS order, so a field captured at checkpoint C
  // is "downstream" of every point at-or-before C here. 'input-review' is an interrupt INSIDE
  // parseRawInput and executes LATE (after await-full-context) despite its 0.2 label —
  // edge checkpointAwaitContext -> parseRawInput.
  const CHECKPOINT_SEQUENCE = [
    'paper-evidence-selection',
    'await-roster',
    'character-ids',
    'await-full-context',
    'input-review',
    'pre-curation',
    'evidence-and-photos',
    'arc-selection',
    'outline',
    'article'
  ];

  // The human-captured skip-field(s) whose presence makes each checkpoint SKIP (silently reuse
  // stale input) on the replay — verified against checkpoint-nodes.js + input-nodes.js skip
  // conditions. 'input-review' is intentionally [] : its skip-field (sessionConfig) is
  // RE-DERIVED deterministically by parseRawInput on every replay, so it is not a stale-input
  // reuse risk and upstream points need not clear it. (rosterPronouns travels with roster:
  // both are captured at await-roster and cleared as a unit.)
  const SKIP_FIELDS = {
    'paper-evidence-selection': ['selectedPaperEvidence'],
    'await-roster': ['roster', 'rosterPronouns'],
    'character-ids': ['characterIdMappings'],
    'await-full-context': ['accusation', 'sessionReport', 'directorNotesRaw'],
    'input-review': [],
    'pre-curation': ['preCurationApproved'],
    'evidence-and-photos': ['_evidenceApproved'],
    'arc-selection': ['selectedArcs'],
    'outline': ['outlineApproved'],
    'article': ['articleApproved']
  };

  test('every rollback point clears its own + every downstream checkpoint skip-field', () => {
    const gaps = [];
    CHECKPOINT_SEQUENCE.forEach((checkpoint, idx) => {
      for (const field of SKIP_FIELDS[checkpoint]) {
        for (let p = 0; p <= idx; p++) {
          const point = CHECKPOINT_SEQUENCE[p];
          if (!(ROLLBACK_CLEARS[point] || []).includes(field)) {
            gaps.push(`${point} does not clear '${field}' (captured at ${checkpoint})`);
          }
        }
      }
    });
    expect(gaps).toEqual([]);
  });

  test('every checkpoint in the sequence is a real rollback point', () => {
    for (const cp of CHECKPOINT_SEQUENCE) {
      expect(ROLLBACK_CLEARS).toHaveProperty(cp);
    }
  });

  test('every skip-field is a real state channel (no stale fixture)', () => {
    const all = Object.keys(ReportStateAnnotation.spec);
    const ghosts = [...new Set(Object.values(SKIP_FIELDS).flat())].filter(f => !all.includes(f));
    expect(ghosts).toEqual([]);
  });
});
