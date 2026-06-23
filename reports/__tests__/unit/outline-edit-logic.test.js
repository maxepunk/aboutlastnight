/**
 * outline-edit-logic.js — pure-function unit tests (node-env, no DOM/React).
 * Proves B1–B5, N1–N4, and the client/server validation surface.
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
      buried: ['the silent partner'],
      characterHighlights: { 'Sarah Blackwood': 'Cool under questioning.' }
    },
    whatsMissing: {
      arcConnections: [
        { arcName: 'The embezzlement', openQuestion: 'Who signed the final transfer?' }
      ],
      knownUnknowns: ['The third signatory'],
      narrativePurpose: 'Flag the gap the room never closed.',
      buriedItems: ['transfer-009']
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

  it('schemaNameForTheme maps themes', () => {
    expect(L.schemaNameForTheme('detective')).toBe('detective-outline');
    expect(L.schemaNameForTheme('journalist')).toBe('outline');
    expect(L.schemaNameForTheme(undefined)).toBe('outline');
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
    const full = L.mergeSection(validJournalistOutline(), 'lede', out);
    expect(validate('outline', full).valid).toBe(true);
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
    const full = L.mergeArc(validJournalistOutline(), 0, out);
    expect(validate('outline', full).valid).toBe(true);
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
    const full = L.mergeArcInterweaving(validJournalistOutline(), out);
    expect(validate('outline', full).valid).toBe(true);
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
    const full = L.mergeSection(validJournalistOutline(), 'followTheMoney', out);
    expect(validate('outline', full).valid).toBe(true);
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
    const full = L.mergeSection(validJournalistOutline(), 'thePlayers', out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildWhatsMissingPayload edits arcConnections, omits empty narrativePurpose, no strays', () => {
    const orig = validJournalistOutline().whatsMissing;
    const state = L.initWhatsMissing(orig);
    state.arcConnections = L.setRowField(state.arcConnections, 0, 'openQuestion', 'Edited question?');
    state.narrativePurpose = '';
    const out = L.buildWhatsMissingPayload(state, orig);
    expect(out.arcConnections[0].openQuestion).toBe('Edited question?');
    expect(out.narrativePurpose).toBeUndefined();
    expect(out.buriedItems).toEqual(['transfer-009']);
    expect(out.shellAccounts).toBeUndefined();
    expect(out.characterHighlights).toBeUndefined();
    const full = L.mergeSection(validJournalistOutline(), 'whatsMissing', out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildClosingPayload (B-closing) keeps arcResolutions array, preserves accusationHandling', () => {
    const orig = validJournalistOutline().closing;
    const state = L.initClosing(orig);
    state.arcResolutions = L.setRowField(state.arcResolutions, 0, 'resolution', 'Edited resolution.');
    const out = L.buildClosingPayload(state, orig);
    expect(Array.isArray(out.arcResolutions)).toBe(true);
    expect(out.arcResolutions[0].resolution).toBe('Edited resolution.');
    expect(out.accusationHandling).toBe(orig.accusationHandling);
    const full = L.mergeSection(validJournalistOutline(), 'closing', out);
    expect(validate('outline', full).valid).toBe(true);
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

  it('thePlayers: editing characterHighlights leaves arcConnections/exposed/buried untouched', () => {
    const orig = validJournalistOutline().thePlayers;
    const state = L.initThePlayers(orig);
    state.characterHighlights = L.setRowField(state.characterHighlights, 0, 'value', 'Only this changed.');
    const out = L.buildThePlayersPayload(state, orig);
    expect(out.arcConnections).toEqual(orig.arcConnections);
    expect(out.exposed).toEqual(orig.exposed);
    expect(out.buried).toEqual(orig.buried);
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
  it('buildExecutiveSummaryPayload validates', () => {
    const orig = validDetectiveOutline().executiveSummary;
    const state = L.initExecutiveSummary(orig);
    state.hook = 'Edited hook.';
    const out = L.buildExecutiveSummaryPayload(state, orig);
    expect(Array.isArray(out.primaryFindings)).toBe(true);
    const full = L.mergeSection(validDetectiveOutline(), 'executiveSummary', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });

  it('buildEvidenceLockerPayload keeps evidenceIds as string[]', () => {
    const orig = validDetectiveOutline().evidenceLocker;
    const state = L.initEvidenceLocker(orig);
    state.evidenceGroups = L.setRowList(state.evidenceGroups, 0, 'evidenceIds', 'a,b,c');
    const out = L.buildEvidenceLockerPayload(state, orig);
    expect(out.evidenceGroups[0].evidenceIds).toEqual(['a', 'b', 'c']);
    const full = L.mergeSection(validDetectiveOutline(), 'evidenceLocker', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });

  it('buildMemoryAnalysisPayload omits empty keyPatterns; outline without memoryAnalysis still valid', () => {
    const orig = validDetectiveOutline().memoryAnalysis;
    const state = L.initMemoryAnalysis(orig);
    state.keyPatterns = [];
    const out = L.buildMemoryAnalysisPayload(state, orig);
    expect(out.keyPatterns).toBeUndefined();
    expect(out.focus).toBe(orig.focus);
    const full = L.mergeSection(validDetectiveOutline(), 'memoryAnalysis', out);
    expect(validate('detective-outline', full).valid).toBe(true);
    const noMem = validDetectiveOutline();
    delete noMem.memoryAnalysis;
    expect(validate('detective-outline', noMem).valid).toBe(true);
  });

  it('buildSuspectNetworkPayload drops invalid suspicionLevel, omits empty keyRelationships', () => {
    const orig = validDetectiveOutline().suspectNetwork;
    const state = L.initSuspectNetwork(orig);
    state.assessments = L.setRowField(state.assessments, 0, 'suspicionLevel', 'bogus');
    const out = L.buildSuspectNetworkPayload(state, orig);
    expect(out.assessments[0].suspicionLevel).toBeUndefined();
    expect(out.assessments[0].name).toBe('Sarah Blackwood');
    const full = L.mergeSection(validDetectiveOutline(), 'suspectNetwork', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });

  it('buildOutstandingQuestionsPayload keeps questions string[], omits empty gaps', () => {
    const orig = validDetectiveOutline().outstandingQuestions;
    const state = L.initOutstandingQuestions(orig);
    state.investigativeGaps = '';
    const out = L.buildOutstandingQuestionsPayload(state, orig);
    expect(Array.isArray(out.questions)).toBe(true);
    expect(out.investigativeGaps).toBeUndefined();
    const full = L.mergeSection(validDetectiveOutline(), 'outstandingQuestions', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });

  it('buildFinalAssessmentPayload omits empty accusationHandling', () => {
    const orig = validDetectiveOutline().finalAssessment;
    const state = L.initFinalAssessment(orig);
    state.accusationHandling = '';
    const out = L.buildFinalAssessmentPayload(state, orig);
    expect(out.accusationHandling).toBeUndefined();
    expect(out.verdict).toBe(orig.verdict);
    const full = L.mergeSection(validDetectiveOutline(), 'finalAssessment', out);
    expect(validate('detective-outline', full).valid).toBe(true);
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

// ── (H) validateOutline (server-side surface, injected validator) ───────────────
describe('validateOutline (B7 server-side surface)', () => {
  it('accepts a valid journalist outline', () => {
    const r = L.validateOutline(validJournalistOutline(), 'journalist', validate);
    expect(r.valid).toBe(true);
    expect(r.message).toBe('');
    expect(r.schemaName).toBe('outline');
  });

  it('rejects arcConnections collapsed to a string (B1) with path in message', () => {
    const o = validJournalistOutline();
    o.followTheMoney.arcConnections = 'collapsed';
    const r = L.validateOutline(o, 'journalist', validate);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('/followTheMoney/arcConnections');
  });

  it('uses the detective schema name for detective theme', () => {
    const o = validDetectiveOutline();
    o.executiveSummary.primaryFindings = 'not an array';
    const r = L.validateOutline(o, 'detective', validate);
    expect(r.valid).toBe(false);
    expect(r.schemaName).toBe('detective-outline');
  });

  it('calls the injected validateFn with the resolved schema name', () => {
    const spy = jest.fn(function () { return { valid: true, errors: null }; });
    L.validateOutline(validJournalistOutline(), 'detective', spy);
    expect(spy).toHaveBeenCalledWith('detective-outline', expect.any(Object));
  });

  it('lazy-requires SchemaValidator when no validateFn is injected (node path)', () => {
    const o = validJournalistOutline();
    o.followTheMoney.arcConnections = 'collapsed';
    const r = L.validateOutline(o, 'journalist');
    expect(r.valid).toBe(false);
  });
});

// ── (I) validateOutlineShape (client gate) ──────────────────────────────────────
describe('validateOutlineShape (client gate)', () => {
  it('accepts a complete valid journalist outline', () => {
    expect(L.validateOutlineShape(validJournalistOutline(), 'journalist').valid).toBe(true);
  });

  it('rejects arcConnections collapsed to a string (B1)', () => {
    const o = validJournalistOutline();
    o.followTheMoney.arcConnections = 'collapsed';
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/followTheMoney/arcConnections')).toBe(true);
  });

  it('rejects missing required lede.primaryArc (B2)', () => {
    const o = validJournalistOutline();
    delete o.lede.primaryArc;
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/lede/primaryArc')).toBe(true);
  });

  it('rejects arcInterweaving flattened to a string (B3)', () => {
    const o = validJournalistOutline();
    o.theStory.arcInterweaving = 'flattened';
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/theStory/arcInterweaving')).toBe(true);
  });

  it('rejects a stray top-level pullQuotes key (B4)', () => {
    const o = validJournalistOutline();
    o.pullQuotes = [];
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/pullQuotes')).toBe(true);
  });

  it('rejects arcResolutions collapsed to a string (B-closing)', () => {
    const o = validJournalistOutline();
    o.closing.arcResolutions = 'collapsed';
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/closing/arcResolutions')).toBe(true);
  });

  it('accepts a complete valid detective outline', () => {
    expect(L.validateOutlineShape(validDetectiveOutline(), 'detective').valid).toBe(true);
  });

  it('rejects detective assessments collapsed to a string', () => {
    const o = validDetectiveOutline();
    o.suspectNetwork.assessments = 'collapsed';
    const r = L.validateOutlineShape(o, 'detective');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/suspectNetwork/assessments')).toBe(true);
  });
});

// ── Capstone: full round-trip conformance ───────────────────────────────────────
describe('capstone conformance', () => {
  it('journalist: init→build every section, merge all, validate', () => {
    let o = validJournalistOutline();
    o = L.mergeSection(o, 'lede', L.buildLedePayload(L.initLede(o.lede), o.lede));
    o = L.mergeArcInterweaving(o, L.buildArcInterweavingPayload(L.initArcInterweaving(o.theStory.arcInterweaving), o.theStory.arcInterweaving));
    o = L.mergeArc(o, 0, L.buildArcPayload(L.initArc(o.theStory.arcs[0]), o.theStory.arcs[0]));
    o = L.mergeSection(o, 'followTheMoney', L.buildFollowTheMoneyPayload(L.initFollowTheMoney(o.followTheMoney), o.followTheMoney));
    o = L.mergeSection(o, 'thePlayers', L.buildThePlayersPayload(L.initThePlayers(o.thePlayers), o.thePlayers));
    o = L.mergeSection(o, 'whatsMissing', L.buildWhatsMissingPayload(L.initWhatsMissing(o.whatsMissing), o.whatsMissing));
    o = L.mergeSection(o, 'closing', L.buildClosingPayload(L.initClosing(o.closing), o.closing));
    expect(validate('outline', o).valid).toBe(true);
  });

  it('detective: init→build every section, merge all, validate', () => {
    let o = validDetectiveOutline();
    o = L.mergeSection(o, 'executiveSummary', L.buildExecutiveSummaryPayload(L.initExecutiveSummary(o.executiveSummary), o.executiveSummary));
    o = L.mergeSection(o, 'evidenceLocker', L.buildEvidenceLockerPayload(L.initEvidenceLocker(o.evidenceLocker), o.evidenceLocker));
    o = L.mergeSection(o, 'memoryAnalysis', L.buildMemoryAnalysisPayload(L.initMemoryAnalysis(o.memoryAnalysis), o.memoryAnalysis));
    o = L.mergeSection(o, 'suspectNetwork', L.buildSuspectNetworkPayload(L.initSuspectNetwork(o.suspectNetwork), o.suspectNetwork));
    o = L.mergeSection(o, 'outstandingQuestions', L.buildOutstandingQuestionsPayload(L.initOutstandingQuestions(o.outstandingQuestions), o.outstandingQuestions));
    o = L.mergeSection(o, 'finalAssessment', L.buildFinalAssessmentPayload(L.initFinalAssessment(o.finalAssessment), o.finalAssessment));
    expect(validate('detective-outline', o).valid).toBe(true);
  });
});
