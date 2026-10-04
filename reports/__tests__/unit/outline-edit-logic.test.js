/**
 * outline-edit-logic.js — pure-function unit tests (node-env, no DOM/React).
 * Proves B1–B5, N1–N4, and the client validation surface.
 *
 * Phase 4 (brief 4.6): the outline is the story map. The old outline's schema checks went
 * with its schema; the section builders below still edit the outline written before phase 4
 * until the map's screen replaces them (4.9). The map's client gate is held to the
 * director-side schema, and Everyone and the counts come from the beats (the 4.6 describes).
 */
const L = require('../../console/outline-edit-logic.js');
const { SchemaValidator } = require('../../lib/schema-validator');

const v = new SchemaValidator();
const validate = (name, data) => v.validate(name, data);

// ── Fixtures ────────────────────────────────────────────────────────────────
function validJournalistOutline() {
  return {
    lede: {
      hook: 'A party ends with one guest dead and a room full of liars.',
      keyTension: 'The room accused the wrong person.',
      primaryArc: 'The Blackwood embezzlement',
      selectedEvidence: ['rfid-001', 'rfid-002']
    },
    theStory: {
      arcInterweaving: {
        interleavingPlan: 'Open on the accusation, braid the money trail through it.',
        convergencePoint: 'The shell-account ledger names the real culprit.',
        callbackOpportunities: [
          { plantIn: 'lede', payoffIn: 'closing', detail: 'The misread receipt.' }
        ]
      },
      arcs: [
        {
          name: 'The embezzlement',
          paragraphCount: 3,
          evidenceCards: [
            { tokenId: 'rfid-001', placement: 'arc-open', loopFunction: 'OPENER' }
          ],
          photoPlacement: { filename: 'whiteboard.jpg', afterParagraph: 2, purpose: 'bridge' }
        }
      ]
    },
    followTheMoney: {
      arcConnections: [
        { arcName: 'The embezzlement', financialAngle: 'Funds routed through three shells.' }
      ],
      shellAccounts: [
        { name: 'Meridian Holdings', total: '$1.2M', inference: 'Front for diverted payroll.', relatedArc: 'The embezzlement' }
      ],
      photoPlacement: null
    },
    thePlayers: {
      arcConnections: [
        { arcName: 'The embezzlement', characterAngle: 'Sarah controlled the accounts.' }
      ],
      exposed: ['Sarah Blackwood'],
      characterHighlights: { 'Sarah Blackwood': 'Cool under questioning.' }
    },
    whatsMissing: {
      arcConnections: [
        { arcName: 'The embezzlement', openQuestion: 'Who signed the final transfer?' }
      ],
      knownUnknowns: ['The third signatory'],
      narrativePurpose: 'Flag the gap the room never closed.'
    },
    closing: {
      arcResolutions: [
        { arcName: 'The embezzlement', resolution: 'The ledger settles it.' }
      ],
      systemicAngle: 'Money moves faster than accountability.',
      accusationHandling: 'The room accused the valet; the ledger says otherwise.',
      finalLine: 'The receipts outlived the alibi.'
    }
  };
}

function validDetectiveOutline() {
  return {
    executiveSummary: {
      hook: 'One body, six suspects, a paper trail.',
      caseOverview: 'Victim found at the Blackwood estate after the party.',
      primaryFindings: ['Funds were diverted.', 'The accused had no access.']
    },
    evidenceLocker: {
      evidenceGroups: [
        { theme: 'Financial', evidenceIds: ['rfid-001', 'rfid-002'], synthesis: 'Transfers cluster on one account.' }
      ]
    },
    memoryAnalysis: {
      focus: 'The diverted payroll runs.',
      keyPatterns: ['Monthly cadence', 'Round-dollar amounts'],
      significance: 'Pattern predates the victim joining the firm.'
    },
    suspectNetwork: {
      keyRelationships: [
        { characters: ['Sarah Blackwood', 'the valet'], nature: 'Employer and alibi-witness.' }
      ],
      assessments: [
        { name: 'Sarah Blackwood', role: 'CFO', suspicionLevel: 'high' }
      ]
    },
    outstandingQuestions: {
      questions: ['Who authorized the final transfer?'],
      investigativeGaps: 'The signatory page is missing.'
    },
    finalAssessment: {
      accusationHandling: 'The room accused the valet.',
      verdict: 'Evidence points to Sarah, not the accused.',
      closingLine: 'The ledger never lies; people do.'
    }
  };
}

// ── (A) Primitives ───────────────────────────────────────────────────────────
describe('primitives', () => {
  it('deepClone produces an independent copy', () => {
    const src = { a: { b: 1 } };
    const out = L.deepClone(src);
    expect(out).toEqual(src);
    out.a.b = 2;
    expect(src.a.b).toBe(1);
    expect(L.deepClone(undefined)).toBeUndefined();
  });

  it('splitCsv trims, drops empties, rejects non-strings', () => {
    expect(L.splitCsv('a, b ,c')).toEqual(['a', 'b', 'c']);
    expect(L.splitCsv('')).toEqual([]);
    expect(L.splitCsv('  ')).toEqual([]);
    expect(L.splitCsv('a,,b')).toEqual(['a', 'b']);
    expect(L.splitCsv(123)).toEqual([]);
  });

  it('joinCsv joins arrays, empty for non-arrays', () => {
    expect(L.joinCsv(['a', 'b'])).toBe('a, b');
    expect(L.joinCsv([])).toBe('');
    expect(L.joinCsv('x')).toBe('');
  });

  it('setRowField immutably replaces one field on one row', () => {
    const rows = [{ arcName: 'A', financialAngle: 'x' }];
    const out = L.setRowField(rows, 0, 'financialAngle', 'y');
    expect(out).toEqual([{ arcName: 'A', financialAngle: 'y' }]);
    expect(rows[0].financialAngle).toBe('x');
    expect(out[0]).not.toBe(rows[0]);
    expect(L.setRowField(rows, 9, 'financialAngle', 'y')).toEqual(rows);
  });

  it('setRowList accepts CSV string or array', () => {
    const a = L.setRowList([{ characters: [] }], 0, 'characters', 'a,b');
    expect(a[0].characters).toEqual(['a', 'b']);
    const b = L.setRowList([{ characters: [] }], 0, 'characters', ['x']);
    expect(b[0].characters).toEqual(['x']);
  });

  it('removeRow / addRow are immutable', () => {
    expect(L.removeRow([1, 2, 3], 1)).toEqual([1, 3]);
    expect(L.addRow([1], 2)).toEqual([1, 2]);
    expect(L.addRow(null, { x: 1 })).toEqual([{ x: 1 }]);
  });

  it('coerceInt floors valid numbers, undefined otherwise', () => {
    expect(L.coerceInt('3')).toBe(3);
    expect(L.coerceInt(3)).toBe(3);
    expect(L.coerceInt('3.9')).toBe(3);
    expect(L.coerceInt('')).toBeUndefined();
    expect(L.coerceInt('abc')).toBeUndefined();
    expect(L.coerceInt(null)).toBeUndefined();
  });

  it('coerceTotal keeps currency strings, numbers stay numbers', () => {
    expect(L.coerceTotal('1200')).toBe(1200);
    expect(L.coerceTotal(1200)).toBe(1200);
    expect(L.coerceTotal('1200.5')).toBe(1200.5);
    expect(L.coerceTotal('$1.2M')).toBe('$1.2M');
    expect(L.coerceTotal('approx 500')).toBe('approx 500');
    expect(L.coerceTotal('-50')).toBe(-50);
    expect(L.coerceTotal('')).toBeUndefined();
  });

  it('nonEmpty gates non-blank strings only', () => {
    expect(L.nonEmpty('x')).toBe(true);
    expect(L.nonEmpty('  ')).toBe(false);
    expect(L.nonEmpty('')).toBe(false);
    expect(L.nonEmpty(null)).toBe(false);
    expect(L.nonEmpty(5)).toBe(false);
  });

  it('rowsToMap / mapToRows round-trip; blank keys dropped', () => {
    expect(L.rowsToMap([{ key: 'Sarah', value: 'lead' }, { key: '', value: 'z' }, { key: 'Bob', value: 'x' }]))
      .toEqual({ Sarah: 'lead', Bob: 'x' });
    expect(L.rowsToMap([])).toEqual({});
    expect(L.mapToRows({ Sarah: 'lead' })).toEqual([{ key: 'Sarah', value: 'lead' }]);
    expect(L.mapToRows(null)).toEqual([]);
    expect(L.mapToRows(['a'])).toEqual([]);
    expect(L.rowsToMap(L.mapToRows({ a: '1', b: '2' }))).toEqual({ a: '1', b: '2' });
  });

  it('computeResetKey (B5) distinguishes revisions with identical 100-char prefixes', () => {
    const a = validJournalistOutline();
    const b = validJournalistOutline();
    b.closing.finalLine = 'A completely different closing line that the prefix never reaches.';
    expect(L.computeResetKey(a, 0)).not.toBe(L.computeResetKey(b, 0));
    expect(L.computeResetKey(a, 0)).toBe(L.computeResetKey(a, 0));
    expect(L.computeResetKey(a, 0)).not.toBe(L.computeResetKey(a, 1));
    const circ = {}; circ.self = circ;
    expect(function () { L.computeResetKey(circ, 0); }).not.toThrow();
  });

  // Brief 1.2: the arc stop keys its reset on this helper too. The arc reviser
  // is told to make targeted fixes and preserve the set, so a rework comes back
  // with the SAME ids and new text; an id-list key cannot see that, and the
  // round that moves on a director send back is humanArcRevisionCount, not
  // arcRevisionCount (incrementArcRevision holds the latter flat on that pass).
  it('computeResetKey sees new arc content behind unchanged arc ids', () => {
    const before = [
      { id: 'arc-1', title: 'The wire transfers', summary: 'Money left the shell account.' },
      { id: 'arc-2', title: 'The valet', summary: 'Blake was in the hallway.' }
    ];
    const after = [
      { id: 'arc-1', title: 'The wire transfers', summary: 'Money left the shell account twice.' },
      { id: 'arc-2', title: 'The valet', summary: 'Blake was in the hallway.' }
    ];
    // Same ids, same length, same human round: the key must still move.
    expect(L.computeResetKey(before, 0)).not.toBe(L.computeResetKey(after, 0));
    // And the human round alone moves it when the arcs come back byte-identical.
    expect(L.computeResetKey(before, 0)).not.toBe(L.computeResetKey(before, 1));
    expect(L.computeResetKey(before, 1)).toBe(L.computeResetKey(before, 1));
  });
});

// ── (C) Journalist initializers ───────────────────────────────────────────────
describe('journalist initializers (no loss on load)', () => {
  it('initLede retains primaryArc (B2 root) and selectedEvidence', () => {
    const s = L.initLede(validJournalistOutline().lede);
    expect(s.primaryArc).toBe('The Blackwood embezzlement');
    expect(s.keyTension).toBe('The room accused the wrong person.');
    expect(s.selectedEvidence).toEqual(['rfid-001', 'rfid-002']);
    const empty = L.initLede(undefined);
    expect(empty.hook).toBe('');
    expect(empty.selectedEvidence).toEqual([]);
  });

  it('initArc stringifies paragraphCount for the input', () => {
    const s = L.initArc({ name: 'X', paragraphCount: 5 });
    expect(s.paragraphCount).toBe('5');
    expect(s.name).toBe('X');
  });

  it('initArcInterweaving (B3) reads the object, survives a legacy string', () => {
    const s = L.initArcInterweaving(validJournalistOutline().theStory.arcInterweaving);
    expect(s.interleavingPlan).toContain('braid');
    expect(s.convergencePoint).toContain('ledger');
    const legacy = L.initArcInterweaving('flattened string');
    expect(legacy.interleavingPlan).toBe('');
    expect(legacy.convergencePoint).toBe('');
  });

  it('initFollowTheMoney (B1) deep-clones object-arrays', () => {
    const s = L.initFollowTheMoney(validJournalistOutline().followTheMoney);
    expect(Array.isArray(s.arcConnections)).toBe(true);
    expect(s.arcConnections[0].financialAngle).toContain('shells');
    expect(s.shellAccounts[0].total).toBe('$1.2M');
  });

  it('initThePlayers maps characterHighlights to rows (no pullQuotes seed, X-5)', () => {
    const s = L.initThePlayers(validJournalistOutline().thePlayers);
    expect(s.characterHighlights).toEqual([{ key: 'Sarah Blackwood', value: 'Cool under questioning.' }]);
    expect(s.pullQuotes).toBeUndefined();
  });

  it('initWhatsMissing / initClosing keep object-arrays', () => {
    const wm = L.initWhatsMissing(validJournalistOutline().whatsMissing);
    expect(wm.arcConnections[0].openQuestion).toContain('signed');
    const cl = L.initClosing(validJournalistOutline().closing);
    expect(Array.isArray(cl.arcResolutions)).toBe(true);
    expect(cl.arcResolutions[0].resolution).toContain('ledger');
  });
});

// ── (D) Journalist builders: conformance + preservation ─────────────────────────
// Phase 4 (brief 4.6): the builders edit the outline written before phase 4, until the map's
// screen replaces them (4.9). The outline's schema is the map's now, so their output is no
// longer checked against it.
describe('journalist builders', () => {
  it('buildLedePayload (B2+N4) keeps primaryArc, omits empty selectedEvidence, no stray keys', () => {
    const orig = validJournalistOutline().lede;
    const state = L.initLede(orig);
    state.hook = 'Edited hook.';
    state.selectedEvidence = [];
    const out = L.buildLedePayload(state, orig);
    expect(out.primaryArc).toBe('The Blackwood embezzlement');
    expect(out.keyTension).toBe('The room accused the wrong person.');
    expect(out.hook).toBe('Edited hook.');
    expect(out.selectedEvidence).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(['hook', 'keyTension', 'primaryArc']);
  });

  it('buildArcPayload (N1) coerces paragraphCount to int, preserves evidenceCards+photoPlacement, no keyPoints', () => {
    const origArc = validJournalistOutline().theStory.arcs[0];
    const state = L.initArc(origArc);
    state.name = 'Renamed arc';
    state.paragraphCount = '4';
    const out = L.buildArcPayload(state, origArc);
    expect(out.paragraphCount).toBe(4);
    expect(out.name).toBe('Renamed arc');
    expect(out.evidenceCards).toEqual(origArc.evidenceCards);
    expect(out.photoPlacement).toEqual(origArc.photoPlacement);
    expect(out.keyPoints).toBeUndefined();
  });

  it('buildArcInterweavingPayload (B3) stays an object, preserves callbackOpportunities', () => {
    const orig = validJournalistOutline().theStory.arcInterweaving;
    const state = L.initArcInterweaving(orig);
    state.convergencePoint = 'Edited convergence.';
    const out = L.buildArcInterweavingPayload(state, orig);
    expect(typeof out).toBe('object');
    expect(out.interleavingPlan).toContain('braid');
    expect(out.convergencePoint).toBe('Edited convergence.');
    expect(out.callbackOpportunities).toEqual(orig.callbackOpportunities);
  });

  it('buildFollowTheMoneyPayload (B1 core) keeps arrays, currency string, null photoPlacement, no strays', () => {
    const orig = validJournalistOutline().followTheMoney;
    const state = L.initFollowTheMoney(orig);
    state.arcConnections = L.setRowField(state.arcConnections, 0, 'financialAngle', 'Edited angle.');
    const out = L.buildFollowTheMoneyPayload(state, orig);
    expect(Array.isArray(out.arcConnections)).toBe(true);
    expect(out.arcConnections[0].financialAngle).toBe('Edited angle.');
    expect(Array.isArray(out.shellAccounts)).toBe(true);
    expect(out.shellAccounts[0].total).toBe('$1.2M');
    expect(out.photoPlacement).toBeNull();
    expect(out.focus).toBeUndefined();
    expect(out.characterHighlights).toBeUndefined();
    expect(out.buriedItems).toBeUndefined();
  });

  it('buildThePlayersPayload (B1+B4) keeps map, drops pullQuotes, no strays (X-5)', () => {
    const orig = validJournalistOutline().thePlayers;
    const state = L.initThePlayers(orig);
    state.characterHighlights = L.setRowField(state.characterHighlights, 0, 'value', 'Edited highlight.');
    const out = L.buildThePlayersPayload(state, orig);
    expect(Array.isArray(out.arcConnections)).toBe(true);
    expect(typeof out.characterHighlights).toBe('object');
    expect(Array.isArray(out.characterHighlights)).toBe(false);
    expect(out.characterHighlights['Sarah Blackwood']).toBe('Edited highlight.');
    expect(out.pullQuotes).toBeUndefined();
    expect(out.shellAccounts).toBeUndefined();
    expect(out.focus).toBeUndefined();
  });

  it('buildWhatsMissingPayload edits arcConnections, omits empty narrativePurpose, no strays', () => {
    const orig = validJournalistOutline().whatsMissing;
    const state = L.initWhatsMissing(orig);
    state.arcConnections = L.setRowField(state.arcConnections, 0, 'openQuestion', 'Edited question?');
    state.narrativePurpose = '';
    const out = L.buildWhatsMissingPayload(state, orig);
    expect(out.arcConnections[0].openQuestion).toBe('Edited question?');
    expect(out.narrativePurpose).toBeUndefined();
    // Phase 3 (3.2; BU3): buriedItems left the schema, and the builder drops it.
    expect(out.buriedItems).toBeUndefined();
    expect(out.shellAccounts).toBeUndefined();
    expect(out.characterHighlights).toBeUndefined();
  });

  it('buildClosingPayload (B-closing) keeps arcResolutions array, preserves accusationHandling', () => {
    const orig = validJournalistOutline().closing;
    const state = L.initClosing(orig);
    state.arcResolutions = L.setRowField(state.arcResolutions, 0, 'resolution', 'Edited resolution.');
    const out = L.buildClosingPayload(state, orig);
    expect(Array.isArray(out.arcResolutions)).toBe(true);
    expect(out.arcResolutions[0].resolution).toBe('Edited resolution.');
    expect(out.accusationHandling).toBe(orig.accusationHandling);
  });
});

// ── "edit one field, everything else preserved" invariant ──────────────────────
describe('preservation invariant', () => {
  it('followTheMoney: editing one arcConnection leaves shellAccounts + photoPlacement untouched', () => {
    const orig = validJournalistOutline().followTheMoney;
    const state = L.initFollowTheMoney(orig);
    state.arcConnections = L.setRowField(state.arcConnections, 0, 'financialAngle', 'Only this changed.');
    const out = L.buildFollowTheMoneyPayload(state, orig);
    expect(out.shellAccounts).toEqual(orig.shellAccounts);
    expect(out.photoPlacement).toEqual(orig.photoPlacement);
  });

  it('thePlayers: editing characterHighlights leaves arcConnections/exposed untouched', () => {
    const orig = validJournalistOutline().thePlayers;
    const state = L.initThePlayers(orig);
    state.characterHighlights = L.setRowField(state.characterHighlights, 0, 'value', 'Only this changed.');
    const out = L.buildThePlayersPayload(state, orig);
    expect(out.arcConnections).toEqual(orig.arcConnections);
    expect(out.exposed).toEqual(orig.exposed);
    expect(out.characterHighlights).toEqual({ 'Sarah Blackwood': 'Only this changed.' });
  });

  it('arc: editing name leaves evidenceCards + photoPlacement untouched', () => {
    const orig = validJournalistOutline().theStory.arcs[0];
    const state = L.initArc(orig);
    state.name = 'Only this changed.';
    const out = L.buildArcPayload(state, orig);
    expect(out.evidenceCards).toEqual(orig.evidenceCards);
    expect(out.photoPlacement).toEqual(orig.photoPlacement);
  });
});

// ── (E/F) Detective builders ────────────────────────────────────────────────────
describe('detective builders', () => {
  it('buildExecutiveSummaryPayload keeps primaryFindings a list', () => {
    const orig = validDetectiveOutline().executiveSummary;
    const state = L.initExecutiveSummary(orig);
    state.hook = 'Edited hook.';
    const out = L.buildExecutiveSummaryPayload(state, orig);
    expect(Array.isArray(out.primaryFindings)).toBe(true);
  });

  it('buildEvidenceLockerPayload keeps evidenceIds as string[]', () => {
    const orig = validDetectiveOutline().evidenceLocker;
    const state = L.initEvidenceLocker(orig);
    state.evidenceGroups = L.setRowList(state.evidenceGroups, 0, 'evidenceIds', 'a,b,c');
    const out = L.buildEvidenceLockerPayload(state, orig);
    expect(out.evidenceGroups[0].evidenceIds).toEqual(['a', 'b', 'c']);
  });

  it('buildMemoryAnalysisPayload omits empty keyPatterns', () => {
    const orig = validDetectiveOutline().memoryAnalysis;
    const state = L.initMemoryAnalysis(orig);
    state.keyPatterns = [];
    const out = L.buildMemoryAnalysisPayload(state, orig);
    expect(out.keyPatterns).toBeUndefined();
    expect(out.focus).toBe(orig.focus);
  });

  it('buildSuspectNetworkPayload drops invalid suspicionLevel, omits empty keyRelationships', () => {
    const orig = validDetectiveOutline().suspectNetwork;
    const state = L.initSuspectNetwork(orig);
    state.assessments = L.setRowField(state.assessments, 0, 'suspicionLevel', 'bogus');
    const out = L.buildSuspectNetworkPayload(state, orig);
    expect(out.assessments[0].suspicionLevel).toBeUndefined();
    expect(out.assessments[0].name).toBe('Sarah Blackwood');
  });

  it('buildOutstandingQuestionsPayload keeps questions string[], omits empty gaps', () => {
    const orig = validDetectiveOutline().outstandingQuestions;
    const state = L.initOutstandingQuestions(orig);
    state.investigativeGaps = '';
    const out = L.buildOutstandingQuestionsPayload(state, orig);
    expect(Array.isArray(out.questions)).toBe(true);
    expect(out.investigativeGaps).toBeUndefined();
  });

  it('buildFinalAssessmentPayload omits empty accusationHandling', () => {
    const orig = validDetectiveOutline().finalAssessment;
    const state = L.initFinalAssessment(orig);
    state.accusationHandling = '';
    const out = L.buildFinalAssessmentPayload(state, orig);
    expect(out.accusationHandling).toBeUndefined();
    expect(out.verdict).toBe(orig.verdict);
  });
});

// ── (G) Merge fns ───────────────────────────────────────────────────────────────
describe('merge fns', () => {
  it('mergeSection is immutable and swaps one key', () => {
    const orig = validJournalistOutline();
    const snapshot = JSON.parse(JSON.stringify(orig));
    const next = L.mergeSection(orig, 'lede', { hook: 'x', keyTension: 'y', primaryArc: 'z' });
    expect(next.lede).toEqual({ hook: 'x', keyTension: 'y', primaryArc: 'z' });
    expect(next.closing).toEqual(orig.closing);
    expect(orig).toEqual(snapshot);
    expect(next).not.toBe(orig);
  });

  it('mergeArc (N3) swaps one arc, never seeds arcInterweaving as a string', () => {
    const orig = validJournalistOutline();
    orig.theStory.arcs.push({ name: 'Second', paragraphCount: 2 });
    const snapshot = JSON.parse(JSON.stringify(orig));
    const next = L.mergeArc(orig, 1, { name: 'Edited second', paragraphCount: 5 });
    expect(next.theStory.arcs[1].name).toBe('Edited second');
    expect(next.theStory.arcInterweaving).toEqual(orig.theStory.arcInterweaving);
    expect(typeof next.theStory.arcInterweaving).toBe('object');
    expect(orig).toEqual(snapshot);
    const bare = L.mergeArc({}, 0, { name: 'A', paragraphCount: 1 });
    expect(Array.isArray(bare.theStory.arcs)).toBe(true);
    expect(bare.theStory.arcInterweaving).toBeUndefined();
  });

  it('mergeArcInterweaving (B3) swaps the object, leaves arcs alone', () => {
    const orig = validJournalistOutline();
    const next = L.mergeArcInterweaving(orig, { interleavingPlan: 'p', convergencePoint: 'c' });
    expect(next.theStory.arcInterweaving).toEqual({ interleavingPlan: 'p', convergencePoint: 'c' });
    expect(next.theStory.arcs).toEqual(orig.theStory.arcs);
  });
});

// ── (K) validateBundleShape (article client gate, B6) ───────────────────────────
//
// The mirror of validateOutlineShape for the ARTICLE gate. Task 3 added the
// server-side content-bundle schema check, which returns a 400; this catches the
// obvious breakage before the POST, in the same `validation-error` slot, so a
// hand-edit cannot reach validateContentBundle (which routes a bad bundle
// straight to END — after ten checkpoints and five-plus Opus calls).
//
// DELIBERATELY NOT STRICTER THAN THE SERVER: content-bundle.schema.json makes
// `heading` optional on a section, so this gate must not require it or it would
// block Approve on a bundle the server would accept.
describe('validateBundleShape (article client gate)', () => {
  function validBundle() {
    return {
      metadata: { sessionId: '091826', theme: 'journalist', generatedAt: '2026-09-18T12:00:00Z' },
      headline: { main: 'The room got it wrong' },
      sections: [
        {
          id: 'lede',
          type: 'narrative',
          heading: 'LEDE',
          content: [
            { type: 'paragraph', text: 'One guest dead, a room full of liars.' },
            { type: 'quote', text: 'I never touched the ledger.', attribution: 'Vic' }
          ]
        }
      ]
    };
  }

  it('accepts a valid bundle', () => {
    expect(L.validateBundleShape(validBundle())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a section with no heading (the server schema does)', () => {
    const b = validBundle();
    delete b.sections[0].heading;
    expect(L.validateBundleShape(b).valid).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(L.validateBundleShape(null).valid).toBe(false);
    expect(L.validateBundleShape([]).valid).toBe(false);
    expect(L.validateBundleShape('{}').errors[0].path).toBe('/');
  });

  it('requires metadata, headline and sections', () => {
    ['metadata', 'headline', 'sections'].forEach((key) => {
      const b = validBundle();
      delete b[key];
      const r = L.validateBundleShape(b);
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.path === '/' + key)).toBe(true);
    });
  });

  it('rejects an empty sections array', () => {
    const b = validBundle();
    b.sections = [];
    const r = L.validateBundleShape(b);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/sections')).toBe(true);
  });

  it('requires a string id and an array content on every section', () => {
    const b = validBundle();
    delete b.sections[0].id;
    b.sections[0].content = 'prose';
    const r = L.validateBundleShape(b);
    expect(r.errors.some(e => e.path === '/sections/0/id')).toBe(true);
    expect(r.errors.some(e => e.path === '/sections/0/content')).toBe(true);
  });

  it('rejects a non-string heading when one is present', () => {
    const b = validBundle();
    b.sections[0].heading = 7;
    expect(L.validateBundleShape(b).errors.some(e => e.path === '/sections/0/heading')).toBe(true);
  });

  it('rejects a content block with no type, a non-string type, or an unknown type', () => {
    const b = validBundle();
    b.sections[0].content = [{ text: 'no type' }, { type: 3 }, { type: 'sidebar' }];
    const r = L.validateBundleShape(b);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/sections/0/content/0/type')).toBe(true);
    expect(r.errors.some(e => e.path === '/sections/0/content/1/type')).toBe(true);
    const unknown = r.errors.find(e => e.path === '/sections/0/content/2/type');
    expect(unknown.message).toMatch(/sidebar/);
  });

  it('accepts every block type the schema defines', () => {
    const b = validBundle();
    b.sections[0].content = [
      { type: 'paragraph', text: 'x' },
      { type: 'quote', text: 'y' },
      { type: 'evidence-reference', tokenId: 't1' },
      { type: 'list', items: ['a'] },
      { type: 'photo', filename: 'p.jpg' },
      { type: 'evidence-card', tokenId: 't2', headline: 'h', content: 'c' }
    ];
    expect(L.validateBundleShape(b).valid).toBe(true);
  });

  it('rejects a non-object content block', () => {
    const b = validBundle();
    b.sections[0].content = ['just a string'];
    expect(L.validateBundleShape(b).errors.some(e => e.path === '/sections/0/content/0')).toBe(true);
  });

  it('rejects a non-object section', () => {
    const b = validBundle();
    b.sections = ['lede'];
    expect(L.validateBundleShape(b).errors.some(e => e.path === '/sections/0')).toBe(true);
  });

  // The gap runs one way only: the client may pass what the server rejects (the
  // server's 400 names the field and the console already renders it), never the
  // reverse, which would block Approve on a bundle the server would accept.
  it('is deliberately lenient where the server is finer-grained (metadata.generatedAt)', () => {
    const b = validBundle();
    delete b.metadata.generatedAt;
    expect(L.validateBundleShape(b).valid).toBe(true);
    expect(validate('content-bundle', b).valid).toBe(false);
  });

  it('agrees with the server schema on the fixture it accepts', () => {
    expect(validate('content-bundle', validBundle()).valid).toBe(
      L.validateBundleShape(validBundle()).valid
    );
  });
});

describe('thesis editor logic (spec 2026-09-19 §6.1)', () => {
  test('initThesis reads the three fields and tolerates a missing lede', () => {
    expect(L.initThesis({ hook: 'H', keyTension: 'T', primaryArc: 'A', selectedEvidence: ['e'] })).toEqual({ hook: 'H', keyTension: 'T', primaryArc: 'A' });
    expect(L.initThesis(null)).toEqual({ hook: '', keyTension: '', primaryArc: '' });
    expect(L.initThesis({ hook: 7 })).toEqual({ hook: '', keyTension: '', primaryArc: '' });
  });

  test('buildThesisPayload replaces the three fields and preserves selectedEvidence and unknown keys', () => {
    const original = { ...validJournalistOutline().lede, extraKey: { kept: true } };
    const out = L.buildThesisPayload({ hook: 'New hook', keyTension: 'New tension', primaryArc: 'New arc' }, original);
    expect(out).toEqual({ ...original, hook: 'New hook', keyTension: 'New tension', primaryArc: 'New arc' });
    expect(out).not.toBe(original);
    expect(original.hook).toBe(validJournalistOutline().lede.hook);   // no mutation
  });

  test('buildThesisPayload keeps blank fields blank (the validation layer decides)', () => {
    const out = L.buildThesisPayload({ hook: '', keyTension: 'T', primaryArc: '' }, validJournalistOutline().lede);
    expect(out.hook).toBe('');
    expect(out.primaryArc).toBe('');
  });

  test('a thesis save on a LEDE with no selectedEvidence emits no selectedEvidence key', () => {
    const out = L.buildThesisPayload({ hook: 'h', keyTension: 't', primaryArc: 'a' }, { hook: 'x', keyTension: 'y', primaryArc: 'z' });
    expect(out).toEqual({ hook: 'h', keyTension: 't', primaryArc: 'a' });
  });
});

// ── Phase 3 (3.2): the outline form as TH4 ruled ──────────────────────────────
//
// thePlayers.buried and whatsMissing.buriedItems went (BU3: whose memory was sold never
// appears), and the editors drop them from an outline written before phase 3. Phase 4
// (brief 4.6): the outline's schema is the map's, so the old schema's cases went with it.
describe('phase 3 (3.2): the outline form (TH4)', () => {
  it('the editors drop them from an outline written before phase 3', () => {
    const old = validJournalistOutline();
    old.thePlayers.buried = ['the silent partner'];
    old.whatsMissing.buriedItems = ['transfer-009'];
    const players = L.buildThePlayersPayload(L.initThePlayers(old.thePlayers), old.thePlayers);
    const missing = L.buildWhatsMissingPayload(L.initWhatsMissing(old.whatsMissing), old.whatsMissing);
    expect(players.buried).toBeUndefined();
    expect(missing.buriedItems).toBeUndefined();
    expect(L.initThePlayers(old.thePlayers).buried).toBeUndefined();
    expect(L.initWhatsMissing(old.whatsMissing).buriedItems).toBeUndefined();

    const cleaned = L.dropRetiredOutlineFields(old);
    expect(cleaned.thePlayers.buried).toBeUndefined();
    expect(cleaned.whatsMissing.buriedItems).toBeUndefined();
    expect(old.thePlayers.buried).toEqual(['the silent partner']);
    expect(L.dropRetiredOutlineFields({ lede: { hook: 'h' } })).toEqual({ lede: { hook: 'h' } });
  });

  it('an account edited with its inference left blank omits the field', () => {
    const section = { arcConnections: [], shellAccounts: [{ name: 'Ember', total: 5, inference: 'x' }] };
    const state = L.initFollowTheMoney(section);
    state.shellAccounts[0].inference = '';
    expect(L.buildFollowTheMoneyPayload(state, section).shellAccounts[0]).toEqual({ name: 'Ember', total: 5 });
  });
});

describe('4.6: Everyone and the counts, one function from the beats (mapTally)', () => {
  const ROSTER = [
    { name: 'Ellis', fullName: 'Ellis Reeve' }, { name: 'Rowan', fullName: 'Rowan Vale' },
    { name: 'Sloane', fullName: 'Sloane Hart' }, { name: 'Mira', fullName: 'Mira Fenn' }, { name: 'Kai', fullName: 'Kai Lune' }
  ];
  const map = () => ({
    topPhoto: 'huddle.jpg',
    gapNote: { line: 'The record holds nothing Kai did.', players: ['kai'] },
    sections: [
      { slot: 'lede', heading: '', job: 'Open.', beats: [{ id: 'b1', kind: 'scene', material: 'The scoreboard', players: ['Ellis Reeve', 'Rowan'] }], photos: [] },
      {
        slot: 'theStory', heading: 'The Story', job: 'The case.',
        beats: [
          { id: 'b2', kind: 'receipt', material: 'row001', players: ['Rowan', 'Sloane'], card: 'row001' },
          { id: 'b3', kind: 'line', material: 'Blake: "Pay up"', players: ['Blake'] }
        ],
        photos: [{ filename: 'theory.jpg', beat: 'b2' }, { filename: 'theory.jpg' }]
      }
    ],
    leftOut: [{ id: 'b9', kind: 'scene', material: 'Mira at the bar', players: ['Mira'], card: 'row002' }]
  });

  it('lists each roster player under the first section whose beat shows them, the players in no beat, those the gap note raises, the cards and the photos placed of those kept', () => {
    expect(L.mapTally(map(), { roster: ROSTER, keptPhotos: ['huddle.jpg', 'Theory.JPG', 'cards.jpg'] })).toEqual({
      everyone: [
        { slot: 'lede', heading: '', players: ['Ellis', 'Rowan'] },
        { slot: 'theStory', heading: 'The Story', players: ['Sloane'] }
      ],
      unplaced: ['Mira', 'Kai'],
      raised: ['Kai'],
      cards: 1,
      photos: { placed: 2, of: 3 }
    });
  });

  it('reads a map with no sections, and no roster, as empty', () => {
    expect(L.mapTally({}, {})).toEqual({ everyone: [], unplaced: [], raised: [], cards: 0, photos: { placed: 0, of: 0 } });
  });

  it("mapPhotoPlacements lists the top photo first, then each section's photos in order", () => {
    expect(L.mapPhotoPlacements(map())).toEqual([
      { filename: 'huddle.jpg', at: 'topPhoto' },
      { filename: 'theory.jpg', at: 'theStory' },
      { filename: 'theory.jpg', at: 'theStory' }
    ]);
  });

  it('rosterMemberOf reads a first name, a full name and either in any case, and nothing else', () => {
    expect(L.rosterMemberOf('ellis', ROSTER)).toBe('Ellis');
    expect(L.rosterMemberOf('Rowan Vale', ROSTER)).toBe('Rowan');
    expect(L.rosterMemberOf(' KAI LUNE ', ROSTER)).toBe('Kai');
    expect(L.rosterMemberOf('Blake', ROSTER)).toBe(null);
    expect(L.rosterMemberOf('Ellison', ROSTER)).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6: the map's client gate follows the director-side schema (validateMapShape)
// ═══════════════════════════════════════════════════════════════════════════
describe("4.6: the map's client gate, held to the director-side schema", () => {
  const Ajv = require('ajv');
  const { MAP } = require('../../lib/__tests__/fixtures/rework-state');
  const { directorMapSchemaFor, MAP_BEAT_KINDS } = require('../../lib/map');
  const { mapSlotsOf } = require('../../lib/theme-config');
  const { HEADLINE_LIMITS } = require('../../console/article-desk-logic');
  const schema = directorMapSchemaFor('journalist');
  const schemaAccepts = new Ajv({ allErrors: true, strict: true }).compile(schema);
  const slots = mapSlotsOf('journalist');
  const map = () => JSON.parse(JSON.stringify(MAP));
  const edited = (change) => { const m = map(); change(m); return m; };

  /** Maps a writer or the director can leave, then maps the schema refuses. */
  const ACCEPTED = {
    'the fixture map': map,
    'a beat the director added, with only its id and its material': () => edited((m) => { m.sections[0].beats.push({ id: 'b11', material: 'Alex at the window' }); }),
    'a beat the director brought back, with only its id and its material': () => edited((m) => { m.leftOut.push({ id: 'b12', material: 'The second envelope' }); }),
    'a gap note raising a player': () => edited((m) => { m.gapNote = { line: 'The record holds nothing Sarah did.', players: ['Sarah'] }; }),
    'no top photo': () => edited((m) => { delete m.topPhoto; }),
    'no sections, nothing dropped, nothing left out': () => edited((m) => { m.sections = []; m.dropped = []; m.leftOut = []; }),
    'a headline at its longest, counted in code points': () => edited((m) => { m.headline = `${'x'.repeat(HEADLINE_LIMITS.main.max - 1)}\u{1F600}`; }),
    'a headline at its shortest, counted in code points': () => edited((m) => { m.headline = '\u{1F600}'.repeat(HEADLINE_LIMITS.main.min); }),
    'a deck at its longest': () => edited((m) => { m.deck = 'd'.repeat(HEADLINE_LIMITS.deck.max); }),
    'a weave change with its source': () => edited((m) => { m.weaveChanges = [{ source: 'E2', change: 'The envelope lands in the lede.' }]; })
  };
  const REFUSED = {
    'no headline': () => edited((m) => { delete m.headline; }),
    'a headline one under its shortest': () => edited((m) => { m.headline = 'x'.repeat(HEADLINE_LIMITS.main.min - 1); }),
    'a headline one over its longest': () => edited((m) => { m.headline = 'x'.repeat(HEADLINE_LIMITS.main.max + 1); }),
    'a deck one over its longest': () => edited((m) => { m.deck = 'd'.repeat(HEADLINE_LIMITS.deck.max + 1); }),
    "the old outline's lede": () => edited((m) => { m.lede = { hook: 'h' }; }),
    "the writers' questions, which left the outline": () => edited((m) => { m.writerQuestions = []; }),
    'pull quotes': () => edited((m) => { m.pullQuotes = []; }),
    'sections collapsed to a string': () => edited((m) => { m.sections = 'collapsed'; }),
    'a section with no job': () => edited((m) => { delete m.sections[0].job; }),
    'a slot the theme has none of': () => edited((m) => { m.sections[0].slot = 'epilogue'; }),
    'a dropped slot the theme has none of': () => edited((m) => { m.dropped[0].slot = 'epilogue'; }),
    'a beat with no material': () => edited((m) => { delete m.sections[1].beats[0].material; }),
    'a beat with no id': () => edited((m) => { delete m.leftOut[0].id; }),
    'a kind the map has none of': () => edited((m) => { m.sections[1].beats[0].kind = 'quote'; }),
    'a key a beat has none of': () => edited((m) => { m.sections[1].beats[0].excerpt = 'x'; }),
    'players that are not a list': () => edited((m) => { m.sections[0].beats[0].players = 'Alex'; }),
    'a photo with no filename': () => edited((m) => { m.sections[1].photos = [{ beat: 'b2' }]; }),
    'a length that is not a whole number': () => edited((m) => { m.expectedLength = 1200.5; }),
    'a weave change with no source': () => edited((m) => { m.weaveChanges = [{ change: 'x' }]; }),
    'a gap note with no players': () => edited((m) => { m.gapNote = { line: 'x' }; }),
    'a list in place of the map': () => []
  };

  it.each(Object.keys(ACCEPTED))('takes %s, as the schema does: never stricter', (name) => {
    const m = ACCEPTED[name]();
    expect(`${name}: ${schemaAccepts(m)}`).toBe(`${name}: true`);
    const r = L.validateMapShape(m, { slots });
    expect(`${name}: ${r.valid}: ${JSON.stringify(r.errors)}`).toBe(`${name}: true: []`);
  });

  it.each(Object.keys(REFUSED))('refuses %s, as the schema does', (name) => {
    const m = REFUSED[name]();
    expect(`${name}: ${schemaAccepts(m)}`).toBe(`${name}: false`);
    expect(`${name}: ${L.validateMapShape(m, { slots }).valid}`).toBe(`${name}: false`);
  });

  it('says where each fault is', () => {
    const r = L.validateMapShape(edited((m) => { m.sections[1].beats[0].kind = 'quote'; m.dropped[0].slot = 'epilogue'; }), { slots });
    expect(r.errors.map((e) => e.path)).toEqual(['/sections/1/beats/0/kind', '/dropped/0/slot']);
  });

  it("checks a slot against the stop's slots, given as keys or as the payload's entries, and takes any slot without them", () => {
    const m = REFUSED['a slot the theme has none of']();
    expect(L.validateMapShape(m, { slots: slots.map((slot) => slot.key) }).valid).toBe(false);
    expect(L.validateMapShape(m).valid).toBe(true);
  });

  it("validateOutlineShape, the stop's old name, is the map's gate", () => {
    const m = REFUSED['a slot the theme has none of']();
    expect(L.validateOutlineShape(m, 'journalist', slots)).toEqual(L.validateMapShape(m, { slots }));
    expect(L.validateOutlineShape(map(), 'journalist', slots)).toEqual({ valid: true, errors: [] });
  });

  it("its root keys and a beat's kinds are the schema's", () => {
    expect([...L.MAP_ROOT_KEYS].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(L.BEAT_KINDS).toEqual([...MAP_BEAT_KINDS]);
    expect(L.BEAT_KINDS).toEqual(schema.properties.sections.items.properties.beats.items.properties.kind.enum);
    expect(L.BEAT_KINDS).toEqual(schema.properties.leftOut.items.properties.kind.enum);
  });
});
