/**
 * checkpoint-view-logic — the pure read-side of the four intervention screens.
 *
 * Node-env unit tests against the dual-export module, per reports/CLAUDE.md
 * ("Console has NO DOM/React test harness"): every field-name decision the
 * checkpoint screens used to make inline lives here so it can be pinned, and the
 * React components are thin consumers verified by a manual click-through.
 *
 * Each function exists because a screen was reading a field that does not exist:
 *   lastEvaluationFrom  - R5 F4: evaluationHistory is an ARRAY of per-phase
 *                         records; all three eval bars read `.overallScore` off
 *                         the array and rendered nothing, for every session.
 *   arcCardModel        - R5 F4/R4 H7: the arc cards read keyMoments /
 *                         financialConnections / thematicLinks / hook, none of
 *                         which the arc schema emits (keyEvidence, caveats,
 *                         unansweredQuestions, emotionalHook do).
 *   accusationView      - R5 F7: the accusation block read `reasoning` and
 *                         `confidence`; the parse emits `charge` and `notes`, so
 *                         the 400-character motive/vote record was never shown.
 *   whiteboardView      - R5/PROMPT-REVIEW: the panel read connectionsMade /
 *                         questionsRaised / votingResults; the whiteboard schema
 *                         emits names/connections/groups/notes/structureType/
 *                         ambiguities.
 *   factCheckSummary    - BASELINE §5: the programmatic fact-check existed only
 *                         as an advisory in the revision prompt and was never put
 *                         in front of the person approving the article.
 */
const {
  lastEvaluationFrom,
  evaluationView,
  arcCardModel,
  accusationView,
  whiteboardView,
  factCheckSummary
} = require('../checkpoint-view-logic');

describe('lastEvaluationFrom', () => {
  it('prefers the server-selected lastEvaluation', () => {
    const evaluation = { overallScore: 0.9 };
    expect(lastEvaluationFrom({ lastEvaluation: evaluation })).toBe(evaluation);
  });

  it('falls back to the last entry for the phase in an old evaluationHistory payload', () => {
    const data = {
      evaluationHistory: [
        { phase: 'arcs', overallScore: 0.8 },
        { phase: 'outline', overallScore: 0.7 }
      ]
    };
    expect(lastEvaluationFrom(data, 'outline')).toEqual({ phase: 'outline', overallScore: 0.7 });
  });

  it('takes the LAST entry for the phase, not the first (revision loops append)', () => {
    const data = {
      evaluationHistory: [
        { phase: 'article', overallScore: 0.4, revisionNumber: 0 },
        { phase: 'outline', overallScore: 0.9 },
        { phase: 'article', overallScore: 0.93, revisionNumber: 1 }
      ]
    };
    expect(lastEvaluationFrom(data, 'article').overallScore).toBe(0.93);
  });

  it('returns null when nothing matches, when the payload is empty, and when evaluationHistory is not an array', () => {
    expect(lastEvaluationFrom({ evaluationHistory: [{ phase: 'arcs' }] }, 'outline')).toBeNull();
    expect(lastEvaluationFrom({})).toBeNull();
    expect(lastEvaluationFrom(null)).toBeNull();
    // The bug this replaces: the array was read as an object.
    expect(lastEvaluationFrom({ evaluationHistory: { overallScore: 0.9 } }, 'arcs')).toBeNull();
  });
});

describe('evaluationView', () => {
  it('reads structuralPassed when present and falls back to ready', () => {
    expect(evaluationView({ structuralPassed: false, ready: true }).passed).toBe(false);
    // The Opus history entry stores only `ready` (evaluator-nodes historyEntry).
    expect(evaluationView({ ready: true }).passed).toBe(true);
  });

  it('formats the 0-1 score to two decimals and defaults every list', () => {
    const view = evaluationView({ overallScore: 0.912, ready: true });
    expect(view.score).toBe('0.91');
    expect(view.structuralIssues).toEqual([]);
    expect(view.advisoryWarnings).toEqual([]);
  });

  it('carries escalation, guidance, confidence and source through', () => {
    const view = evaluationView({
      overallScore: 0,
      structuralPassed: false,
      structuralIssues: ['card t1 is not verbatim'],
      advisoryWarnings: ['tighten the lede'],
      revisionGuidance: 'Step 1: fix the card.',
      confidence: 'high',
      revisionNumber: 2,
      escalatedToHuman: true,
      escalationReason: 'Reached revision cap (3)',
      source: 'fact-check'
    });
    expect(view.score).toBe('0.00');
    expect(view.passed).toBe(false);
    expect(view.structuralIssues).toEqual(['card t1 is not verbatim']);
    expect(view.advisoryWarnings).toEqual(['tighten the lede']);
    expect(view.revisionGuidance).toBe('Step 1: fix the card.');
    expect(view.confidence).toBe('high');
    expect(view.revisionNumber).toBe(2);
    expect(view.escalationReason).toBe('Reached revision cap (3)');
    expect(view.source).toBe('fact-check');
  });

  it('returns null for a missing evaluation', () => {
    expect(evaluationView(null)).toBeNull();
  });

  it('leaves the score null when the evaluator recorded no number', () => {
    expect(evaluationView({ ready: false, _error: 'boom' }).score).toBeNull();
  });
});

describe('arcCardModel', () => {
  it('maps the current arc schema field names', () => {
    const arc = {
      title: 'T',
      summary: 'S',
      keyEvidence: ['e1'],
      emotionalHook: 'H',
      caveats: ['c'],
      unansweredQuestions: ['q'],
      arcSource: 'player-focus',
      evidenceStrength: 'strong',
      characterPlacements: [{ character: 'Vic', role: 'central' }]
    };
    expect(arcCardModel(arc)).toEqual({
      title: 'T',
      summary: 'S',
      keyEvidence: ['e1'],
      hook: 'H',
      caveats: ['c'],
      unansweredQuestions: ['q'],
      source: 'player-focus',
      strength: 'strong',
      characters: [{ name: 'Vic', role: 'central' }]
    });
  });

  it('reads characterPlacements in its real shape: an object map of name -> role', () => {
    const model = arcCardModel({
      characterPlacements: { Vic: 'central', Alex: 'witness' }
    });
    expect(model.characters).toEqual([
      { name: 'Vic', role: 'central' },
      { name: 'Alex', role: 'witness' }
    ]);
  });

  it('tolerates the old field names hook and keyMoments', () => {
    const model = arcCardModel({ hook: 'old hook', keyMoments: ['a moment'] });
    expect(model.hook).toBe('old hook');
    expect(model.keyEvidence).toEqual(['a moment']);
  });

  it('renders an evidence entry that carries an owner as "id (owner)"', () => {
    const model = arcCardModel({ keyEvidence: [{ id: 'mor004', owner: 'Vic' }, 'zia002'] });
    expect(model.keyEvidence).toEqual(['mor004 (Vic)', 'zia002']);
  });

  it('defaults every field for an empty or missing arc', () => {
    expect(arcCardModel(null)).toEqual({
      title: '',
      summary: '',
      keyEvidence: [],
      hook: '',
      caveats: [],
      unansweredQuestions: [],
      source: '',
      strength: '',
      characters: []
    });
  });
});

describe('accusationView', () => {
  it('joins the accused array and carries charge + the full notes', () => {
    expect(accusationView({ accused: ['Vic'], charge: 'Murder', notes: '9 votes…' })).toEqual({
      accused: 'Vic',
      charge: 'Murder',
      notes: '9 votes…'
    });
  });

  it('accepts reasoning as notes (older payloads) and a string accused', () => {
    expect(accusationView({ accused: 'Vic', reasoning: 'because' })).toEqual({
      accused: 'Vic',
      charge: '',
      notes: 'because'
    });
  });

  it('joins several accused names', () => {
    expect(accusationView({ accused: ['Vic', 'Alex'] }).accused).toBe('Vic, Alex');
  });

  it('reports an empty accused so the screen can warn instead of hiding the block', () => {
    expect(accusationView({ charge: 'Murder' })).toEqual({ accused: '', charge: 'Murder', notes: '' });
    expect(accusationView(null)).toEqual({ accused: '', charge: '', notes: '' });
  });
});

describe('whiteboardView', () => {
  it('returns the six real whiteboard fields with arrays defaulted', () => {
    expect(whiteboardView({
      names: ['Vic'],
      groups: [],
      connections: [{ from: 'Vic', to: 'Alex' }],
      notes: ['x'],
      ambiguities: ['left column unreadable']
    })).toEqual({
      ambiguities: ['left column unreadable'],
      names: ['Vic'],
      groups: [],
      connections: [{ from: 'Vic', to: 'Alex' }],
      notes: ['x'],
      structureType: ''
    });
  });

  it('defaults everything for a missing whiteboard', () => {
    expect(whiteboardView(null)).toEqual({
      ambiguities: [],
      names: [],
      groups: [],
      connections: [],
      notes: [],
      structureType: ''
    });
  });

  it('drops non-array values rather than rendering a crash', () => {
    const view = whiteboardView({ names: 'Vic', connections: null, structureType: 'accusation web' });
    expect(view.names).toEqual([]);
    expect(view.connections).toEqual([]);
    expect(view.structureType).toBe('accusation web');
  });
});

describe('factCheckSummary', () => {
  const factCheck = {
    structuralIssues: ['Evidence card "t1" is not verbatim: …', 'Roster coverage gap: Remi …'],
    advisoryWarnings: ['Could not verify 2 photo reference(s) …'],
    cardFidelity: [
      { tokenId: 't1', ok: false, reason: 'not verbatim' },
      { tokenId: 't2', ok: true, reason: null }
    ],
    rosterCoverage: { missing: ['Remi'] },
    photoReferences: { invalid: ['ghost.jpg'] },
    reporterMode: { violations: ['i voted'] }
  };

  it('counts the structural and advisory issues the fact-check reported', () => {
    const summary = factCheckSummary(factCheck);
    expect(summary.structural).toBe(2);
    expect(summary.advisory).toBe(1);
    expect(summary.total).toBe(3);
  });

  it('groups the defects, keeping the failed cards and dropping the passing ones', () => {
    const summary = factCheckSummary(factCheck);
    expect(summary.groups.map(g => g.key)).toEqual([
      'cards', 'roster', 'photos', 'reporter', 'advisory'
    ]);

    const cards = summary.groups[0];
    expect(cards.severity).toBe('structural');
    expect(cards.items).toEqual([{ text: 't1: not verbatim', tokenId: 't1' }]);

    expect(summary.groups[1].items).toEqual([{ text: 'Remi' }]);
    expect(summary.groups[2].items).toEqual([{ text: 'ghost.jpg' }]);
    expect(summary.groups[3].items).toEqual([{ text: 'i voted' }]);
    expect(summary.groups[4].severity).toBe('advisory');
    expect(summary.groups[4].items).toEqual([{ text: 'Could not verify 2 photo reference(s) …' }]);
  });

  it('omits empty groups', () => {
    const summary = factCheckSummary({
      structuralIssues: [],
      advisoryWarnings: [],
      cardFidelity: [{ tokenId: 't1', ok: true, reason: null }],
      rosterCoverage: { missing: [] },
      photoReferences: { invalid: [] },
      reporterMode: { violations: [] }
    });
    expect(summary.groups).toEqual([]);
    expect(summary.total).toBe(0);
  });

  // I2b moved the pronoun and leaked-example messages to `advisoryWarnings`, where
  // they render in the `advisory` group. The `other` group still has to exist for
  // any structural message the four structured groups do not recognise — including
  // one of these two if a live run promotes it back.
  it('keeps a structural issue that has no structured group of its own', () => {
    const summary = factCheckSummary({
      structuralIssues: ['Pronoun error: Marcus takes he/him, but the article writes "Marcus … their"'],
      advisoryWarnings: [],
      cardFidelity: [],
      rosterCoverage: { missing: [] },
      photoReferences: { invalid: [] },
      reporterMode: { violations: [] }
    });
    expect(summary.structural).toBe(1);
    expect(summary.groups.map(g => g.key)).toEqual(['other']);
    expect(summary.groups[0].items[0].text).toMatch(/^Pronoun error/);
  });

  it('shows an unattributable issue alongside the structured groups, never instead of them', () => {
    const summary = factCheckSummary({
      structuralIssues: [
        'Evidence card "t1" is not verbatim: …',
        'Prompt example leaked into a quote block: "the job is yours" …'
      ],
      advisoryWarnings: [],
      cardFidelity: [{ tokenId: 't1', ok: false, reason: 'not verbatim' }],
      rosterCoverage: { missing: [] },
      photoReferences: { invalid: [] },
      reporterMode: { violations: [] }
    });
    expect(summary.groups.map(g => g.key)).toEqual(['cards', 'other']);
    expect(summary.groups[1].items).toHaveLength(1);
    expect(summary.groups[1].items[0].text).toMatch(/^Prompt example leaked/);
  });

  it('returns an empty summary for a null fact-check (no fact-check on this payload)', () => {
    expect(factCheckSummary(null)).toEqual({ structural: 0, advisory: 0, total: 0, groups: [] });
  });
});

// ── Arc selection defaults (4.4) ────────────────────────────────────────────
//
// R5 F8 companion: every arc arrived pre-selected, which (with unreadable cards)
// pushed the director to accept all 5 — and 5+ arcs routinely forces an outline
// revision. The default now follows the evidence, and the count is called out
// when it leaves the 3-5 band the outline prompt is written for.
describe('defaultArcSelection', () => {
  const { defaultArcSelection, arcSelectionNote } = require('../checkpoint-view-logic');

  const arc = (id, strength) => ({ id, title: 'T ' + id, evidenceStrength: strength });

  it('pre-selects the strong arcs, capped at 5', () => {
    const arcs = [
      arc('a', 'strong'), arc('b', 'moderate'), arc('c', 'strong'),
      arc('d', 'strong'), arc('e', 'strong'), arc('f', 'strong'), arc('g', 'strong')
    ];
    expect(defaultArcSelection(arcs)).toEqual(['a', 'c', 'd', 'e', 'f']);
  });

  it('falls back to the first three when no arc is strong', () => {
    const arcs = [arc('a', 'moderate'), arc('b', 'weak'), arc('c', 'speculative'), arc('d', 'weak')];
    expect(defaultArcSelection(arcs)).toEqual(['a', 'b', 'c']);
  });

  it('identifies an arc by title when it has no id (the component keys the same way)', () => {
    expect(defaultArcSelection([{ title: 'Only', evidenceStrength: 'strong' }])).toEqual(['Only']);
  });

  it('returns nothing for no arcs', () => {
    expect(defaultArcSelection([])).toEqual([]);
    expect(defaultArcSelection(null)).toEqual([]);
  });

  it('notes a count outside the 3-5 band and stays silent inside it', () => {
    expect(arcSelectionNote(3)).toBeNull();
    expect(arcSelectionNote(5)).toBeNull();
    expect(arcSelectionNote(6)).toMatch(/More than 5 arcs usually forces an outline revision/);
    expect(arcSelectionNote(2)).toMatch(/Fewer than 3/);
    expect(arcSelectionNote(0)).toMatch(/Fewer than 3/);
  });
});

// ── Truncated-paste guard (4.8) ─────────────────────────────────────────────
//
// Baseline §6(a): session 062726's director notes reached the pipeline two
// paragraphs short and nobody could tell, because no screen ever said how much
// text it had. A word count plus the last few characters makes a truncated
// paste visible before submit and, on the review screen, before approval.
describe('wordTail', () => {
  const { wordTail } = require('../checkpoint-view-logic');

  it('counts words and returns the tail', () => {
    expect(wordTail('one two three', 20)).toEqual({
      words: 3,
      tail: 'one two three',
      truncated: false
    });
  });

  it('returns only the last N characters, marked truncated', () => {
    const view = wordTail('abcdefghij', 4);
    expect(view.tail).toBe('ghij');
    expect(view.truncated).toBe(true);
  });

  it('collapses newlines so a multi-paragraph tail renders on one line', () => {
    const view = wordTail('first para.\n\n  second   para.', 60);
    expect(view.tail).toBe('first para. second para.');
    expect(view.words).toBe(4);
  });

  it('defaults to a 60-character tail', () => {
    const text = 'x'.repeat(200);
    expect(wordTail(text).tail).toHaveLength(60);
  });

  it('handles empty, whitespace-only and non-string input', () => {
    expect(wordTail('')).toEqual({ words: 0, tail: '', truncated: false });
    expect(wordTail('   \n  ')).toEqual({ words: 0, tail: '', truncated: false });
    expect(wordTail(null)).toEqual({ words: 0, tail: '', truncated: false });
    expect(wordTail(12345)).toEqual({ words: 0, tail: '', truncated: false });
  });
});

// ── Approve label (review fix: the count must be structural-only) ───────────
//
// 4.7 made the label warn when the fact-check list is non-empty, but counted
// structural + advisory together, so an article with one cosmetic advisory read
// as having an unresolved defect. Advisories are explicitly "suggestions, not
// blockers" (evaluator-nodes.js), so they are reported separately and they never
// put "anyway" on the button.
describe('approveLabel', () => {
  const { approveLabel, factCheckSummary } = require('../checkpoint-view-logic');

  const summaryOf = (structural, advisory) => factCheckSummary({
    structuralIssues: Array.from({ length: structural }, (_, i) => 'Pronoun error: ' + i),
    advisoryWarnings: Array.from({ length: advisory }, (_, i) => 'advisory ' + i)
  });

  it('is a plain Approve when the fact-check found nothing', () => {
    expect(approveLabel(summaryOf(0, 0), false).label).toBe('Approve');
    expect(approveLabel(summaryOf(0, 0), true).label).toBe('Approve with Edits');
  });

  it('counts only the structural issues as unresolved', () => {
    expect(approveLabel(summaryOf(4, 0), false).label).toBe('Approve anyway (4 unresolved)');
  });

  it('reports the advisories alongside, not inside, the unresolved count', () => {
    expect(approveLabel(summaryOf(4, 1), false).label)
      .toBe('Approve anyway (4 unresolved, 1 advisory)');
    expect(approveLabel(summaryOf(4, 2), false).label)
      .toBe('Approve anyway (4 unresolved, 2 advisory)');
  });

  it('does not say "anyway" when only advisories were found', () => {
    expect(approveLabel(summaryOf(0, 1), false).label).toBe('Approve (1 advisory)');
    expect(approveLabel(summaryOf(0, 3), true).label).toBe('Approve with Edits (3 advisory)');
  });

  it('keeps the edited-bundle wording in the warning cases', () => {
    expect(approveLabel(summaryOf(2, 0), true).label)
      .toBe('Approve with Edits anyway (2 unresolved)');
  });

  it('gives an aria-label that names what is being overridden', () => {
    expect(approveLabel(summaryOf(4, 1), false).ariaLabel)
      .toBe('Approve the article despite 4 unresolved fact-check issue(s)');
    expect(approveLabel(summaryOf(0, 0), true).ariaLabel).toBe('Approve article with edits');
    expect(approveLabel(summaryOf(0, 0), false).ariaLabel).toBe('Approve article');
  });

  it('tolerates a missing summary', () => {
    expect(approveLabel(null, false).label).toBe('Approve');
  });
});

describe('steeringView (spec 2026-09-19 §4.4, §5.5)', () => {
  const { steeringView } = require('../checkpoint-view-logic');

  test('nothing → any:false with empty parts', () => {
    expect(steeringView(null, null)).toEqual({ any: false, changedLabels: [], keptCount: 0, notes: [] });
    expect(steeringView(null, [])).toEqual({ any: false, changedLabels: [], keptCount: 0, notes: [] });
  });

  test('changed scopes are mapped to the gate labels; section ids and unknown keys are readable', () => {
    const v = steeringView({ checked: ['lede', 'closing', 'section:intro', 'evidenceCards', 'weird'], changed: ['lede', 'section:intro', 'weird'] }, []);
    expect(v.any).toBe(true);
    expect(v.changedLabels).toEqual(['LEDE', 'Section "intro"', 'weird']);
    expect(v.keptCount).toBe(0);
  });

  test('a prototype key is rendered raw, not as the inherited member (M16)', () => {
    const v = steeringView({ checked: ['constructor'], changed: ['constructor'] }, []);
    expect(v.changedLabels).toEqual(['constructor']);
  });

  test('a report with nothing changed reports the kept count', () => {
    const v = steeringView({ checked: ['headline', 'byline'], changed: [] }, []);
    expect(v).toEqual({ any: true, changedLabels: [], keptCount: 2, notes: [] });
  });

  test('an empty checked list is treated as no report', () => {
    expect(steeringView({ checked: [], changed: [] }, []).any).toBe(false);
  });

  test('notes become labelled lines in order; malformed entries are skipped', () => {
    const v = steeringView(null, [
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.' },
      null, { gate: 'outline', text: '' },
      { gate: 'outline', round: 2, text: 'Lead with the ledger.' }
    ]);
    expect(v.any).toBe(true);
    expect(v.notes).toEqual([
      { label: '[arc-selection, rejection 1]', text: 'Drop the vote arc.' },
      { label: '[outline, rejection 2]', text: 'Lead with the ledger.' }
    ]);
  });
});
