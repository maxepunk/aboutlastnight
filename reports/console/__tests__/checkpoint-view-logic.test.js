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

describe('the uncalibrated label (phase 2, brief 2.4)', () => {
  // No judge has been checked against the director's decisions yet (phase 7), and
  // all eight evaluations of 091826 and 092026 passed. The score is labelled so,
  // in one phrase from this module, at all three stops.
  const { UNCALIBRATED_SCORE_LABEL } = require('../checkpoint-view-logic');

  it('is one plain phrase that says the score is uncalibrated', () => {
    expect(UNCALIBRATED_SCORE_LABEL).toBe(
      'Uncalibrated: the model\'s own score, not yet checked against your approvals and send-backs.'
    );
  });

  it('labels a model evaluation\'s score at every stop', () => {
    const data = {
      evaluationHistory: [
        { phase: 'arcs', overallScore: 0.98, ready: true },
        { phase: 'outline', overallScore: 0.92, ready: true },
        { phase: 'article', overallScore: 0.6, ready: false, escalatedToHuman: true }
      ]
    };
    ['arcs', 'outline', 'article'].forEach((phase) => {
      expect(evaluationView(lastEvaluationFrom(data, phase)).calibration).toBe(UNCALIBRATED_SCORE_LABEL);
    });
  });

  it('leaves an entry with no score unlabelled', () => {
    expect(evaluationView({ ready: false, _error: 'boom' }).calibration).toBe('');
    expect(evaluationView({ phase: 'article', ready: false, reason: 'rollback-invalidated', source: 'rollback' }).calibration).toBe('');
  });

  it('leaves the fact check\'s entry unlabelled: its 0 is not a model\'s score, and a check is definite', () => {
    const view = evaluationView({ overallScore: 0, structuralPassed: false, source: 'fact-check' });
    expect(view.score).toBe('0.00');
    expect(view.calibration).toBe('');
  });

  it('the evaluation bar renders the phrase from the view and carries no wording of its own', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'utils.js'), 'utf8');
    const evalBar = src.slice(src.indexOf('function EvalBar'), src.indexOf('function TracePanel'));
    expect(evalBar).toContain('view.calibration');
    expect(evalBar).not.toMatch(/uncalibrated/i);
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
      keyEvidence: [{ id: 'e1', name: '', owner: '', type: '', firstLine: '', label: 'e1' }],
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
    expect(model.keyEvidence).toEqual([
      { id: 'a moment', name: '', owner: '', type: '', firstLine: '', label: 'a moment' }
    ]);
  });

  it('falls back to the id when the stop sent no index for that document', () => {
    const model = arcCardModel({ keyEvidence: [{ id: 'mor004', owner: 'Vic' }, 'zia002'] });
    expect(model.keyEvidence).toEqual([
      { id: 'mor004', name: '', owner: 'Vic', type: '', firstLine: '', label: 'mor004 (Vic)' },
      { id: 'zia002', name: '', owner: '', type: '', firstLine: '', label: 'zia002' }
    ]);
  });

  // Brief 1.2: the director judged arcs by ids like 85620c6f-befd-4799-a877.
  // evidenceIndex is the arc stop's payload map from that id to the document.
  it('names the document and its owner when the stop sent an evidenceIndex', () => {
    const index = {
      mor004: { name: "Victor's ledger page", owner: 'Vic', type: 'paper', firstLine: 'Page three, entries for the week of the party.' },
      zia002: { name: 'The hallway memory', owner: 'Zia', type: 'memory', firstLine: 'You are standing by the stairs when...' }
    };
    const model = arcCardModel({ keyEvidence: ['mor004', { id: 'zia002' }] }, index);
    expect(model.keyEvidence).toEqual([
      { id: 'mor004', name: "Victor's ledger page", owner: 'Vic', type: 'paper', firstLine: 'Page three, entries for the week of the party.', label: "Victor's ledger page (Vic)" },
      { id: 'zia002', name: 'The hallway memory', owner: 'Zia', type: 'memory', firstLine: 'You are standing by the stairs when...', label: 'The hallway memory (Zia)' }
    ]);
  });

  it('keeps the id as the label for an id the index does not hold', () => {
    const model = arcCardModel({ keyEvidence: ['ghost001'] }, { mor004: { name: 'X', owner: 'Vic' } });
    expect(model.keyEvidence).toEqual([
      { id: 'ghost001', name: '', owner: '', type: '', firstLine: '', label: 'ghost001' }
    ]);
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
  it('returns the real whiteboard fields with arrays defaulted, each region under the players\' heading (phase 3, 3.5)', () => {
    expect(whiteboardView({
      names: ['Vic'],
      regions: [{ label: 'WHO?', location: 'left column', entries: ['Vic', 'Randy'] }],
      connections: [{ from: 'Vic', to: 'Alex' }],
      notes: ['x'],
      ambiguities: ['left column unreadable']
    })).toEqual({
      ambiguities: ['left column unreadable'],
      names: ['Vic'],
      regions: [{ label: 'WHO?', location: 'left column', entries: ['Vic', 'Randy'] }],
      connections: [{ from: 'Vic', to: 'Alex' }],
      notes: ['x'],
      structureType: ''
    });
  });

  it('shows an older parse\'s groups as regions', () => {
    expect(whiteboardView({ groups: [{ label: 'SUSPECTS', members: ['Vic'] }] }).regions)
      .toEqual([{ label: 'SUSPECTS', location: '', entries: ['Vic'] }]);
  });

  it('defaults everything for a missing whiteboard', () => {
    expect(whiteboardView(null)).toEqual({
      ambiguities: [],
      names: [],
      regions: [],
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

describe('steeringView (spec 2026-09-19 §4.4, §5.5; F1)', () => {
  const { steeringView } = require('../checkpoint-view-logic');

  // F1: the report names each of the director's edits a pass changed (server.js
  // getCheckpointData handEditReport, lib/hand-edit-diff.js reportAfterPass).
  const SEND_BACK_CHANGE = {
    id: 'E2', scope: 'section:closing', cut: false,
    director: 'Alex wanted Marcus out of the company.', became: 'Whether the verdict costs Alex anything is still open.',
    pass: 'send-back', automatic: false, reason: 'The note asked the closing to end on the open question.'
  };
  const AUTOMATIC_CHANGE = {
    id: 'E1', scope: 'headline', cut: false, director: 'Alex Reeves Pointed the Room at Jess Kane', became: 'The Room Named Alex',
    pass: 1, automatic: true, reason: null
  };
  const CUT_BACK = {
    id: 'E3', scope: 'section:the-story', cut: true, director: 'The room also weighed whether Vic would replace Marcus.',
    became: 'The room also weighed whether Vic would replace Marcus.', pass: 2, automatic: true, reason: null
  };

  test('nothing: any is false and every list is empty', () => {
    expect(steeringView(null, null)).toEqual({ any: false, changedEdits: [], keptCount: 0, notes: [] });
    expect(steeringView(null, [])).toEqual({ any: false, changedEdits: [], keptCount: 0, notes: [] });
  });

  test('each edit a rework changed is one line: its id and section, the director\'s text and what it became, the pass and the reason', () => {
    const v = steeringView({ checked: ['E1', 'E2'], changed: [SEND_BACK_CHANGE] }, []);
    expect(v.any).toBe(true);
    expect(v.keptCount).toBe(0);
    expect(v.changedEdits).toEqual([{
      key: 'E2-0',
      id: 'E2',
      automatic: false,
      restored: false,
      line: 'E2, Section "closing": your "Alex wanted Marcus out of the company." became "Whether the verdict costs Alex anything is still open." (the rework of your send-back). Why: The note asked the closing to end on the open question.'
    }]);
  });

  test('a change by an automatic pass is flagged, and a missing reason is said', () => {
    const [line] = steeringView({ checked: ['E1'], changed: [AUTOMATIC_CHANGE] }, []).changedEdits;
    expect(line.automatic).toBe(true);
    expect(line.line).toBe('E1, Headline: your "Alex Reeves Pointed the Room at Jess Kane" became "The Room Named Alex" (automatic pass 1, which should have kept your edit). No reason given.');
  });

  test('a cut that came back, and an edit that is gone', () => {
    const gone = { ...SEND_BACK_CHANGE, became: null };
    const v = steeringView({ checked: ['E2', 'E3'], changed: [CUT_BACK, gone] }, []);
    expect(v.changedEdits.map((c) => c.line)).toEqual([
      'E3, Section "the-story": the text you cut came back as "The room also weighed whether Vic would replace Marcus." (automatic pass 2). It is still in the article: cut it again if it should go.',
      'E2, Section "closing": your "Alex wanted Marcus out of the company." is gone (the rework of your send-back). Why: The note asked the closing to end on the open question.'
    ]);
  });

  // FA, requirement 8: code puts back what an automatic pass changed; the report says so,
  // names the field, and flags removed text that came back.
  test('a change code put back, and removed text that came back, each read as what happened', () => {
    const v = steeringView({
      checked: ['E1', 'E2'],
      changed: [
        {
          id: 'E2', scope: 'section:closing', where: 'section "closing", paragraph', cut: false, removed: false, moved: false,
          director: 'Alex wanted Marcus out of the company.', became: 'Alex may have wanted Marcus out.', pass: 1, automatic: true, reason: null, restored: true
        },
        {
          id: 'E1', scope: 'section:whats-missing', where: 'section "whats-missing", paragraph', cut: false, removed: true, moved: false,
          director: 'And the Kowalski theory is still open.', became: 'And the Kowalski theory is still open.', pass: 1, automatic: true, reason: null, restored: false
        },
        {
          id: 'E4', scope: 'section:closing', where: 'section "closing", photo p3.jpg, moved from section "the-story"', cut: false, removed: false, moved: true,
          director: 'filename: p3.jpg; caption: Vic, Remi and Alex', became: 'section "the-story"', pass: 2, automatic: true, reason: null, restored: true
        }
      ]
    }, []);
    expect(v.changedEdits.map((c) => [c.id, c.automatic, c.restored, c.line])).toEqual([
      ['E2', true, true, 'E2, section "closing", paragraph: automatic pass 1 changed your "Alex wanted Marcus out of the company." to "Alex may have wanted Marcus out.". Your text was put back.'],
      ['E1', true, false, 'E1, section "whats-missing", paragraph: a sentence you removed came back as "And the Kowalski theory is still open." (automatic pass 1). It is still in the article: cut it again if it should go.'],
      ['E4', true, true, 'E4, section "closing", photo p3.jpg, moved from section "the-story": automatic pass 2 moved the block you placed here to section "the-story". It was put back.']
    ]);
  });

  // FA fix round 1, finding 1: a move is the block's place only, so code moves a block a
  // pass took elsewhere back and leaves out one a pass removed; each line says which.
  test('a moved block a pass removed, or took where it cannot go back, each read as what happened', () => {
    const move = {
      id: 'E4', scope: 'section:closing', where: 'section "closing", photo p3.jpg, moved from section "the-story"', cut: false, removed: false, moved: true,
      director: 'filename: p3.jpg; caption: Vic, Remi and Alex', pass: 1, automatic: true, reason: null
    };
    const v = steeringView({
      checked: ['E4'],
      changed: [{ ...move, became: null, restored: false }, { ...move, became: 'section "the-story"', restored: false }]
    }, []);
    expect(v.changedEdits.map((c) => [c.restored, c.line])).toEqual([
      [false, 'E4, section "closing", photo p3.jpg, moved from section "the-story": automatic pass 1 removed the block you placed here. Only its place was your edit, so it was not put back: add it again if it should stay.'],
      [false, 'E4, section "closing", photo p3.jpg, moved from section "the-story": automatic pass 1 moved the block you placed here to section "the-story". It could not be put back.']
    ]);
  });

  // FA, known item 7: the screen reads who made a change from the entry's own flag.
  test('a change is automatic when its entry says so', () => {
    const [line] = steeringView({ checked: ['E1'], changed: [{ ...AUTOMATIC_CHANGE, automatic: false }] }, []).changedEdits;
    expect(line.automatic).toBe(false);
  });

  test('a report with nothing changed reports the kept count', () => {
    expect(steeringView({ checked: ['E1', 'E2'], changed: [] }, [])).toEqual({ any: true, changedEdits: [], keptCount: 2, notes: [] });
  });

  test('an empty checked list, or a report from before F1, is treated as no report', () => {
    expect(steeringView({ checked: [], changed: [] }, []).any).toBe(false);
    expect(steeringView({ checked: ['lede'], changed: ['lede'] }, [])).toEqual({ any: false, changedEdits: [], keptCount: 0, notes: [] });
  });

  test('a scope named after a prototype member is rendered raw (M16)', () => {
    const [line] = steeringView({ checked: ['E1'], changed: [{ ...AUTOMATIC_CHANGE, scope: 'constructor' }] }, []).changedEdits;
    expect(line.line.startsWith('E1, constructor: ')).toBe(true);
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

// F1: the judges' and the fact check's concerns about the director's edits sit under a
// heading of their own, apart from the must-fix items and the other advisories, and never
// count as unresolved on the approve button.
describe('concerns about the director\'s edits (F1)', () => {
  const {
    evaluationView, factCheckSummary, approveLabel, DIRECTOR_EDIT_PREFIX, SEND_BACK_PASS,
    DIRECTOR_EDIT_CONCERNS_LABEL
  } = require('../checkpoint-view-logic');
  const CONCERN = "Director's edit E2: T1: the closing states Alex's motive as fact.";

  // FA, known item 7: the console reads a report by the server's own rule.
  test('editReportOf reads a report exactly as the server\'s handEditReportOf does', () => {
    const { editReportOf } = require('../checkpoint-view-logic');
    const { handEditReportOf } = require('../../lib/hand-edit-diff');
    const corpus = [
      null, undefined, 'x', [], {}, { checked: [], changed: [] }, { checked: ['E1'], changed: [] },
      { checked: ['lede'], changed: ['lede'] }, { checked: ['E1'], changed: [{ id: 'E1' }] }, { checked: ['E1'], changed: [null] },
      { checked: ['E1', 2], changed: [] }, { checked: ['E1'] }, { changed: [] }, { checked: 'E1', changed: [] }
    ];
    corpus.forEach((report) => expect([report, editReportOf(report)]).toEqual([report, handEditReportOf(report)]));
  });

  test('the console\'s copies of the server constants are the server\'s', () => {
    const server = require('../../lib/hand-edit-diff');
    expect(typeof DIRECTOR_EDIT_PREFIX === 'string' && DIRECTOR_EDIT_PREFIX.length > 0).toBe(true);
    expect(DIRECTOR_EDIT_PREFIX).toBe(server.DIRECTOR_EDIT_PREFIX);
    expect(typeof SEND_BACK_PASS === 'string' && SEND_BACK_PASS.length > 0).toBe(true);
    expect(SEND_BACK_PASS).toBe(server.SEND_BACK_PASS);
  });

  test('evaluationView lists the judge\'s concerns apart from its other advisories', () => {
    const view = evaluationView({ ready: true, overallScore: 0.9, structuralIssues: [], advisoryWarnings: [CONCERN, 'C10: the lede runs long.'] });
    expect(view.directorEditConcerns).toEqual([CONCERN]);
    expect(view.advisoryWarnings).toEqual(['C10: the lede runs long.']);
    expect(view.directorEditConcernsLabel).toBe(`${DIRECTOR_EDIT_CONCERNS_LABEL} (1)`);
  });

  test('evaluationView without concerns has an empty list', () => {
    const view = evaluationView({ ready: true, overallScore: 0.9, advisoryWarnings: ['C10: x'] });
    expect(view.directorEditConcerns).toEqual([]);
    expect(view.advisoryWarnings).toEqual(['C10: x']);
  });

  test('the fact check\'s concerns are a group of their own, never in the card list or the general advisories', () => {
    const cardConcern = `${DIRECTOR_EDIT_PREFIX}E1: Evidence card "vic001" (in section "the-story") is not verbatim: its content does not appear in that document's text.`;
    const summary = factCheckSummary({
      structuralIssues: [],
      advisoryWarnings: [cardConcern, 'Over length: 1,950 words.', 'Could not verify 2 photo reference(s).'],
      cardFidelity: [{ tokenId: 'vic001', ok: false, reason: 'not verbatim', locations: [{ placement: 'inline', section: 'the-story' }], directorEdit: 'E1' }],
      rosterCoverage: { missing: [] }, photoReferences: { invalid: [] }, reporterMode: { violations: [] }
    });
    expect(summary.groups.map((g) => [g.key, g.severity, g.items.map((i) => i.text)])).toEqual([
      ['directorEdits', 'advisory', [cardConcern]],
      ['length', 'advisory', ['Over length: 1,950 words.']],
      ['advisory', 'advisory', ['Could not verify 2 photo reference(s).']]
    ]);
    expect(summary.groups[0].label).toBe(DIRECTOR_EDIT_CONCERNS_LABEL);
    expect(summary.structural).toBe(0);
    expect(approveLabel(summary, false).label).toBe('Approve (3 advisory)');
  });

  test('without concerns the fact check has no such group', () => {
    const summary = factCheckSummary({ structuralIssues: [], advisoryWarnings: ['Over length: 1,950 words.'] });
    expect(summary.groups.map((g) => g.key)).toEqual(['length']);
  });
});

describe('review payloads for the outline and article stops (phase 1, brief 1.1)', () => {
  const { outlineReviewPayload, articleReviewPayload, sendBackButton, noteSlotKey } = require('../checkpoint-view-logic');

  test('approve with no note sends the bare approval', () => {
    expect(outlineReviewPayload(null, '', 'approve')).toEqual({ outline: true });
    expect(outlineReviewPayload(null, '   ', 'approve')).toEqual({ outline: true });
    expect(articleReviewPayload(null, undefined, 'approve')).toEqual({ article: true });
  });

  test('approve carries the note trimmed on its own key, beside the edits', () => {
    expect(outlineReviewPayload(null, '  Lead with the ledger.  ', 'approve'))
      .toEqual({ outline: true, outlineNote: 'Lead with the ledger.' });
    const outlineEdits = { lede: { hook: 'x' } };
    expect(outlineReviewPayload(outlineEdits, 'Keep the thesis.', 'approve'))
      .toEqual({ outline: true, outlineEdits, outlineNote: 'Keep the thesis.' });
    const articleEdits = { sections: [] };
    expect(articleReviewPayload(articleEdits, ' Name the account. ', 'approve'))
      .toEqual({ article: true, articleEdits, articleNote: 'Name the account.' });
  });

  test('send back carries the note as the feedback and never as a second note key', () => {
    const o = outlineReviewPayload(null, ' Merge the arcs. ', 'send-back');
    expect(o).toEqual({ outline: false, outlineFeedback: 'Merge the arcs.' });
    expect(o.outlineNote).toBeUndefined();
    const a = articleReviewPayload(null, 'Cut the lede.', 'send-back');
    expect(a).toEqual({ article: false, articleFeedback: 'Cut the lede.' });
    expect(a.articleNote).toBeUndefined();
  });

  test('send back carries the edits alongside the note', () => {
    const outlineEdits = { lede: { hook: 'x' } };
    expect(outlineReviewPayload(outlineEdits, 'Fix the money section.', 'send-back'))
      .toEqual({ outline: false, outlineFeedback: 'Fix the money section.', outlineEdits });
    const articleEdits = { sections: [] };
    expect(articleReviewPayload(articleEdits, 'Fix the quote.', 'send-back'))
      .toEqual({ article: false, articleFeedback: 'Fix the quote.', articleEdits });
  });

  test('a non-object edit is not sent', () => {
    expect(outlineReviewPayload('not an outline', 'note', 'approve'))
      .toEqual({ outline: true, outlineNote: 'note' });
    expect(articleReviewPayload(undefined, 'note', 'approve'))
      .toEqual({ article: true, articleNote: 'note' });
  });

  // Review fix round 1: both of these used to fail open. An unknown action fell
  // through to the approve branch, so a typo shipped the outline; a send back with
  // a blank note built {outline:false, outlineFeedback:''}, which no server arm
  // accepts, and the director saw a dead click.
  test('an action that is neither approve nor send back throws', () => {
    expect(() => outlineReviewPayload(null, 'note', 'reject')).toThrow(/approve.*send-back/);
    expect(() => outlineReviewPayload(null, 'note', undefined)).toThrow(/approve.*send-back/);
    expect(() => articleReviewPayload(null, 'note', 'Approve')).toThrow(/approve.*send-back/);
  });

  test('a send back with a blank note builds nothing', () => {
    expect(outlineReviewPayload(null, '', 'send-back')).toBeNull();
    expect(outlineReviewPayload({ lede: {} }, '   ', 'send-back')).toBeNull();
    expect(articleReviewPayload(null, undefined, 'send-back')).toBeNull();
  });

  // The second click is the only brake on a send back now that one box serves both
  // actions. The flag lives in the component; what it means on screen is decided here.
  test('Send back reads as itself until it is armed, and only with a note', () => {
    const idle = sendBackButton(false, 'Merge the arcs.', 'outline');
    expect(idle).toMatchObject({ armed: false, disabled: false, label: 'Send back' });
    expect(idle.ariaLabel).toContain('Send the outline back');

    const armed = sendBackButton(true, 'Merge the arcs.', 'article');
    expect(armed.armed).toBe(true);
    expect(armed.disabled).toBe(false);
    expect(armed.label).toBe('Confirm send back, starts a rework');
    expect(armed.ariaLabel).toContain('Confirm sending the article back');
  });

  test('a blank note disables Send back and reads as disarmed however the flag stands', () => {
    expect(sendBackButton(false, '', 'outline')).toMatchObject({ armed: false, disabled: true, label: 'Send back' });
    expect(sendBackButton(true, '   ', 'article')).toMatchObject({ armed: false, disabled: true, label: 'Send back' });
    expect(sendBackButton(true, undefined, 'outline').disabled).toBe(true);
  });

  test('the note slot sits beside the edits slot, never on top of it', () => {
    expect(noteSlotKey('outline')).toBe('outline:note');
    expect(noteSlotKey('article')).toBe('article:note');
    expect(noteSlotKey('outline')).not.toBe('outline');
  });
});

// ── roundsBanner (phase 1, brief 1.4) ────────────────────────────────────────
// RevisionDiff used to read ONE counter as both the director's round and the
// machine's budget, and print "Maximum revisions reached — this is the final
// version." when it ran out. On 091826 that line appeared after the director's
// second send back and ended their rounds on a false statement. The director's
// rounds are not capped; only the automated passes inside a round are.
describe('roundsBanner', () => {
  const { roundsBanner } = require('../checkpoint-view-logic');

  test('the first look is Round 1, with the whole automated budget unspent', () => {
    const view = roundsBanner(0, 0, 2);
    expect(view.show).toBe(true);
    expect(view.roundLabel).toBe('Round 1');
    expect(view.automatedLabel).toBe('Automated passes this round: 0 of 2');
    expect(view.remainingLabel).toBe('2 automated passes left');
  });

  test('a round counts the director’s send-backs, with no maximum anywhere', () => {
    expect(roundsBanner(2, 0, 2).roundLabel).toBe('Round 3');
    expect(roundsBanner(11, 1, 2).roundLabel).toBe('Round 12');
    const text = JSON.stringify(roundsBanner(11, 2, 2));
    expect(text).not.toMatch(/final version/i);
    expect(text).not.toMatch(/Maximum/i);
  });

  test('the budget colour warns as the automated passes run out', () => {
    expect(roundsBanner(0, 0, 3).remainingColor).toBe('var(--accent-green)');
    expect(roundsBanner(0, 1, 2).remainingColor).toBe('var(--accent-amber)');
    expect(roundsBanner(0, 2, 2).remainingColor).toBe('var(--accent-red)');
  });

  test('a spent budget is 0 left, never a negative count', () => {
    const view = roundsBanner(1, 5, 2);
    expect(view.remainingLabel).toBe('0 automated passes left');
    expect(view.automatedLabel).toBe('Automated passes this round: 5 of 2');
  });

  test('one pass left reads in the singular', () => {
    expect(roundsBanner(0, 1, 2).remainingLabel).toBe('1 automated pass left');
  });

  test('a stop that reports no budget shows nothing', () => {
    expect(roundsBanner(0, 0, 0).show).toBe(false);
    expect(roundsBanner(3, 1, undefined).show).toBe(false);
  });

  test('missing counts read as zero rather than NaN', () => {
    const view = roundsBanner(undefined, null, 2);
    expect(view.roundLabel).toBe('Round 1');
    expect(view.automatedLabel).toBe('Automated passes this round: 0 of 2');
  });
});

describe('the arc stop review (phase 1, brief 1.2)', () => {
  const { arcReviewPayload, arcNotePrefill } = require('../checkpoint-view-logic');

  test('approve carries the selection, and the note on the outlineGuidance key', () => {
    expect(arcReviewPayload(['a', 'b'], '', 'approve')).toEqual({ selectedArcs: ['a', 'b'] });
    expect(arcReviewPayload(['a'], '   ', 'approve')).toEqual({ selectedArcs: ['a'] });
    expect(arcReviewPayload(['a'], '  Lead with the vote.  ', 'approve'))
      .toEqual({ selectedArcs: ['a'], outlineGuidance: 'Lead with the vote.' });
  });

  test('send back carries the note as arcFeedback, never as guidance', () => {
    const payload = arcReviewPayload(['a'], ' Drop the succession thread. ', 'send-back');
    expect(payload).toEqual({ selectedArcs: false, arcFeedback: 'Drop the succession thread.' });
    expect(payload.outlineGuidance).toBeUndefined();
  });

  test('a send back with a blank note builds nothing, and an unknown action throws', () => {
    expect(arcReviewPayload(['a'], '', 'send-back')).toBeNull();
    expect(arcReviewPayload(['a'], '   ', 'send-back')).toBeNull();
    expect(() => arcReviewPayload(['a'], 'note', 'reject')).toThrow(/approve.*send-back/);
    expect(() => arcReviewPayload(['a'], 'note', undefined)).toThrow(/approve.*send-back/);
  });

  test('the next round pre-fills the box from the last arc-stop send-back note', () => {
    const notes = [
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'First try.' },
      { gate: 'outline', kind: 'rejection', round: 1, text: 'Not this stop.' },
      { gate: 'arc-selection', kind: 'rejection', round: 2, text: '  Drop the succession thread.  ' }
    ];
    expect(arcNotePrefill(notes)).toBe('Drop the succession thread.');
  });

  test('an approval note is not a pre-fill, and neither is nothing at all', () => {
    expect(arcNotePrefill([{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Approved with a note.' }])).toBe('');
    expect(arcNotePrefill([{ gate: 'outline', kind: 'rejection', round: 1, text: 'x' }])).toBe('');
    expect(arcNotePrefill([])).toBe('');
    expect(arcNotePrefill(null)).toBe('');
    expect(arcNotePrefill([null, { gate: 'arc-selection', text: '   ' }])).toBe('');
  });

  test('a note with no kind is a send-back note, as the channel has always read it', () => {
    expect(arcNotePrefill([{ gate: 'arc-selection', text: 'Older note.' }])).toBe('Older note.');
  });
});

// ── Slice 2.5: the card list and the counts agree ────────────────────────────
//
// The count on the panel and the Approve button comes from the check's message
// strings; the card list comes from `cardFidelity`. On 092026 one document was
// reported twice in both. The check now reports each defect once, with every
// place the document appears, so the two numbers agree. This runs the real check.
describe('fact-check card list and counts (slice 2.5)', () => {
  const { factCheckSummary, cardLocationText, approveLabel } = require('../checkpoint-view-logic');
  const { factCheckContentBundle } = require('../../lib/content-bundle-fact-check');

  const SOURCE = 'You are standing by the bar when Vic leans in and hands you the number twice over.';
  const FABRICATED = 'Vic told me the job had already been handed out, with the serial numbers filed off.';
  const inline = (over) => Object.assign({ type: 'evidence-card', tokenId: 'vic001', headline: 'The Offer', content: FABRICATED }, over);

  const factCheck = factCheckContentBundle({
    contentBundle: {
      sections: [
        { id: 'lede', type: 'narrative', content: [inline()] },
        { id: 'the-story', type: 'narrative', content: [inline(), inline({ tokenId: 'ghost1' })] }
      ],
      evidenceCards: [
        { tokenId: 'vic001', headline: 'The Offer', summary: 'The offer', content: 'Never printed, never checked.' },
        { tokenId: 'ghost1', headline: 'Nothing', summary: 'About nothing' }
      ]
    },
    // Phase 4 (brief 4.6; R5): the card check's sources come from the record alone.
    evidenceBundle: { exposed: { tokens: [{ id: 'vic001', fullContent: SOURCE }] } },
    roster: [],
    sessionPhotos: []
  });

  it('lists one card per structural card message', () => {
    const summary = factCheckSummary(factCheck);
    const cards = summary.groups.find(g => g.key === 'cards');
    const cardMessages = factCheck.structuralIssues.filter(s => s.indexOf('Evidence card "') === 0);

    expect(cardMessages).toHaveLength(2);
    expect(cards.items).toHaveLength(cardMessages.length);
    expect(summary.structural).toBe(2);
    expect(approveLabel(summary, false).label).toBe('Approve anyway (2 unresolved)');
  });

  it('names every place each flagged document appears', () => {
    const cards = factCheckSummary(factCheck).groups.find(g => g.key === 'cards');
    expect(cards.label).toBe('Evidence cards that failed the check');
    expect(cards.items).toEqual([
      { text: 'vic001: not verbatim (inline in lede, inline in the-story)', tokenId: 'vic001' },
      { text: 'ghost1: unknown source (inline in the-story, sidebar)', tokenId: 'ghost1' }
    ]);
  });

  it('cardLocationText counts repeats and tolerates items from before locations existed', () => {
    expect(cardLocationText([
      { placement: 'inline', section: 'the-story' },
      { placement: 'inline', section: 'the-story' },
      { placement: 'sidebar', section: null }
    ])).toBe('inline in the-story twice, sidebar');
    expect(cardLocationText([{ placement: 'inline', section: null }])).toBe('inline');
    expect(cardLocationText(undefined)).toBe('');
    expect(cardLocationText([null, 'x'])).toBe('');
  });
});

// Brief 2.7: the trace panel at the outline and article stops. Each automatic pass of
// the round, in order: why it ran in words, the must-fix findings, then the
// should-consider ones, then what it changed by scope (through scopeLabel).
describe('traceView (phase 2, brief 2.7)', () => {
  const { traceView } = require('../checkpoint-view-logic');
  const AT = '2026-09-26T17:05:00.000Z';
  const hhmm = (iso) => {
    const d = new Date(iso);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const checkPass = {
    pass: 1,
    round: 1,
    trigger: 'check',
    findings: {
      structuralIssues: ['Roster coverage gap: Zia is never named.'],
      advisoryWarnings: ['NPC pronoun: Marcus is they/them.'],
      criteriaScores: null,
      revisionGuidance: null
    },
    at: AT,
    diff: { kind: 'bundle', scopes: [] },
    changedScopes: ['section:intro', 'evidenceCards']
  };
  const evaluationPass = {
    pass: 2,
    round: 1,
    trigger: 'evaluation',
    findings: {
      structuralIssues: [],
      advisoryWarnings: [],
      criteriaScores: {
        rosterCoverage: { score: 0.4, type: 'structural', notes: 'Zia is missing.', fix: 'Name Zia.' },
        voice: 0.9
      },
      revisionGuidance: 'Put Zia in the opening.'
    },
    at: AT,
    changedScopes: ['headline']
  };

  test('no trace, or an empty one, shows nothing', () => {
    expect(traceView(null)).toEqual({ any: false, title: expect.any(String), passes: [] });
    expect(traceView([]).any).toBe(false);
    expect(traceView([null, 'x']).any).toBe(false);
  });

  test('names the trigger in words and lists must-fix before should-consider', () => {
    const view = traceView([checkPass]);
    expect(view.any).toBe(true);
    expect(view.title).toBe('Trace: 1 automatic rework ran this round before you arrived');
    const [pass] = view.passes;
    expect(pass.heading).toBe('Automatic pass 1, at ' + hhmm(AT));
    expect(pass.triggerLabel).toBe('Why it ran: the check failed.');
    expect(pass.mustFix).toEqual({ label: 'Must fix (1)', items: ['Roster coverage gap: Zia is never named.'] });
    expect(pass.shouldConsider).toEqual({ label: 'Should consider (1)', items: ['NPC pronoun: Marcus is they/them.'] });
    expect(pass.noFindings).toBe(false);
  });

  test('lists what changed by scope, through scopeLabel', () => {
    const [check, evaluation] = traceView([checkPass, evaluationPass]).passes;
    expect(check.changed).toEqual({
      labels: ['Section "intro"', 'Evidence cards'],
      text: 'What changed: Section "intro", Evidence cards'
    });
    expect(evaluation.changed.labels).toEqual(['Headline']);
    const outline = traceView([{ pass: 1, trigger: 'evaluation', changedScopes: ['lede', 'closing'] }]).passes[0];
    expect(outline.changed.text).toBe('What changed: LEDE, CLOSING');
  });

  test('says so when the rework changed nothing, and when no diff could be made', () => {
    const same = traceView([{ pass: 1, trigger: 'check', changedScopes: [] }]).passes[0];
    expect(same.changed).toEqual({ labels: [], text: 'What changed: nothing. The rework returned the same text.' });
    const missing = traceView([{ pass: 1, trigger: 'check', changedScopes: null }]).passes[0];
    expect(missing.changed.text).toBe('What changed: not recorded, because one of the two versions is missing.');
  });

  test('an evaluation pass carries its guidance and one line per scored criterion', () => {
    const view = traceView([checkPass, evaluationPass], 'journalist');
    expect(view.title).toBe('Trace: 2 automatic reworks ran this round before you arrived');
    const pass = view.passes[1];
    expect(pass.triggerLabel).toBe('Why it ran: the evaluation failed.');
    expect(pass.guidance).toBe("The evaluation's guidance, not sent to the rework: Put Zia in the opening.");
    expect(pass.criteriaLabel).toBe('Scores (2)');
    expect(pass.criteria).toEqual([
      { key: 'rosterCoverage', text: 'rosterCoverage: 0.40 (structural). Zia is missing. Fix: Name Zia.' },
      { key: 'voice', text: 'voice: 0.90' }
    ]);
    expect(pass.mustFix.items).toEqual([]);
    expect(pass.noFindings).toBe(false);
  });

  // Final review (reworks[0]): since 3.10 a journalist automatic pass carries no
  // EVALUATOR FEEDBACK (node-helpers.js buildRevisionContext), so the judge's
  // revisionGuidance never reaches its rework, and "Guidance to the writer" credited the
  // rework with an instruction it was never given. A detective pass still prints it to
  // the rework (D13) and keeps that label. With no theme the view reads the journalist's,
  // the pipeline's default.
  test("labels the guidance by whether the rework was given it: the journalist's not, the detective's yes", () => {
    expect(traceView([evaluationPass], 'journalist').passes[0].guidance)
      .toBe("The evaluation's guidance, not sent to the rework: Put Zia in the opening.");
    expect(traceView([evaluationPass]).passes[0].guidance)
      .toBe("The evaluation's guidance, not sent to the rework: Put Zia in the opening.");
    expect(traceView([evaluationPass], 'detective').passes[0].guidance)
      .toBe('Guidance to the writer: Put Zia in the opening.');
  });

  test('a pass with no recorded findings says so rather than rendering empty lists', () => {
    const pass = traceView([{ pass: 1, trigger: 'evaluation', findings: null, changedScopes: [] }]).passes[0];
    expect(pass.noFindings).toBe(true);
    expect(pass.guidance).toBe('');
    expect(pass.criteria).toEqual([]);
  });

  test('an unknown trigger, a missing number and an unreadable time degrade to words, not blanks', () => {
    const pass = traceView([{ trigger: 'mystery', at: 'not a time', changedScopes: [] }]).passes[0];
    expect(pass.triggerLabel).toBe('Why it ran: not recorded.');
    expect(pass.heading).toBe('Automatic pass 1');
  });

  test('keeps the order the server sent and gives each pass a distinct key', () => {
    const view = traceView([checkPass, evaluationPass]);
    expect(view.passes.map((p) => p.heading.split(',')[0])).toEqual(['Automatic pass 1', 'Automatic pass 2']);
    expect(new Set(view.passes.map((p) => p.key)).size).toBe(2);
  });
});

// Phase 3, brief 3.4: the fact check's new code checks are advisories, each with its
// own message prefix. Each lands in a group of its own, so the director sees what kind
// of finding it is, and none counts toward the approve button's unresolved count.
describe('the fact check\'s new advisory groups (phase 3, 3.4)', () => {
  const { factCheckSummary, approveLabel } = require('../checkpoint-view-logic');
  const ADVISORIES = [
    'Em-dash in the narrator\'s prose: 2 em-dashes, in section "the-story", paragraph 1.',
    'Production word in print: "token" in section "lede", paragraph 2.',
    'Gendered pronoun for Nova: "Nova filed her" in the deck.',
    'Pronoun error: Blake has no pronoun in the record, but the article writes "Blake said he".',
    'Pronoun error: Marcus takes he/him, but the article writes "Marcus said she".',
    'Over length: the narrator\'s prose runs 1,950 words.',
    'Head count: "ten people in the room" in section "lede", paragraph 1, but the roster lists 9 players.',
    'Absence stated 2 times (remote): "I was not there", "I was not in that room".',
    'Could not verify 2 photo reference(s): the photo list is empty.'
  ];
  const summary = () => factCheckSummary({
    structuralIssues: ['Roster coverage gap: Remi is on the session roster but never named.'],
    advisoryWarnings: ADVISORIES,
    cardFidelity: [],
    rosterCoverage: { missing: ['Remi'] },
    photoReferences: { invalid: [] },
    reporterMode: { violations: [] }
  });

  it('puts each new check in its own advisory group, and the rest under Advisory', () => {
    const { groups } = summary();
    expect(groups.map((g) => [g.key, g.severity, g.items.length])).toEqual([
      ['roster', 'structural', 1],
      ['emDash', 'advisory', 1],
      ['productionWords', 'advisory', 1],
      ['novaPronoun', 'advisory', 1],
      ['npcPronouns', 'advisory', 2],
      ['length', 'advisory', 1],
      ['headCount', 'advisory', 1],
      ['advisory', 'advisory', 2]
    ]);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
    expect(byKey.headCount.items[0].text).toBe(ADVISORIES[6]);
    expect(byKey.advisory.items.map((i) => i.text)).toEqual([ADVISORIES[7], ADVISORIES[8]]);
    groups.forEach((g) => expect(typeof g.label === 'string' && g.label.length > 0).toBe(true));
  });

  it('counts every advisory once, and none of them as unresolved on the approve button', () => {
    const s = summary();
    expect(s.structural).toBe(1);
    expect(s.advisory).toBe(ADVISORIES.length);
    expect(approveLabel(s, false).label).toBe(`Approve anyway (1 unresolved, ${ADVISORIES.length} advisory)`);
    const advisoryOnly = factCheckSummary({ structuralIssues: [], advisoryWarnings: ADVISORIES.slice(0, 7) });
    expect(approveLabel(advisoryOnly, false).label).toBe('Approve (7 advisory)');
  });

  it('leaves a structural message with a new prefix in Other, where a promotion would land it', () => {
    const { groups } = factCheckSummary({ structuralIssues: ['Head count: promoted'], advisoryWarnings: [] });
    expect(groups.map((g) => g.key)).toEqual(['other']);
  });
});

// Phase 3, brief 3.7 (spec C15, D8): the writer's questions for the director, one line
// per question with what it is about first, at the arc, outline and article stops. The
// director answers with the stop's note box. An empty list shows no panel.
describe('writerQuestionsView (phase 3, brief 3.7)', () => {
  const { writerQuestionsView } = require('../checkpoint-view-logic');
  const Q1 = { kind: 'player', about: 'Sarah', question: 'The record holds nothing about Sarah: what did Sarah do?' };
  // Phase 4 (brief 4.4): the kinds are the weave's, C15's three cases with a figure in
  // place of a ledger entry.
  const Q2 = { kind: 'figure', about: 'The 10:02 AM sale of $250,000', question: 'Is this sale a duplicate?' };

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty list', []],
    ['a list of nothing usable', [null, 'loose', { about: 'Sarah' }, { about: ' ', question: ' ' }]]
  ])('shows no panel for %s', (_name, value) => {
    const view = writerQuestionsView(value, 'outline');
    expect(view.any).toBe(false);
    expect(view.items).toEqual([]);
  });

  it('lists each question with what it is about first, in the writer\'s order', () => {
    const view = writerQuestionsView([Q1, Q2], 'outline');
    expect(view.any).toBe(true);
    expect(view.items.map((item) => [item.about, item.question])).toEqual([
      ['Sarah', Q1.question],
      ['The 10:02 AM sale of $250,000', 'Is this sale a duplicate?']
    ]);
    expect(new Set(view.items.map((item) => item.key)).size).toBe(2);
  });

  it('counts the questions in its title', () => {
    expect(writerQuestionsView([Q1], 'arc-selection').title).toBe('Questions from the writer (1)');
    expect(writerQuestionsView([Q1, Q2], 'arc-selection').title).toBe('Questions from the writer (2)');
  });

  // Task 3.11 (final review, questions-console-docs finding 3): each stop's hint says
  // what an answer does there. At the arc and outline stops the note reaches the next
  // writer whichever button is pressed, but that writer never sees the questions, so
  // each answer says what it is about. At the article stop Approve goes straight to
  // assembly and nothing reads its note, so answers go with a send back.
  it.each(['arc-selection', 'outline'])('at the %s stop, asks for the answers in the note, each saying what it is about', (stop) => {
    expect(writerQuestionsView([Q1], stop).hint).toBe('Answer them in the note below, saying what each answer is about.');
  });

  it('at the article stop, says the answers go with a send back, and that Approve publishes the article as it is', () => {
    expect(writerQuestionsView([Q1], 'article').hint)
      .toBe('Send back with your answers in the note below to have the writer apply them. Approve publishes the article as it is.');
  });

  it.each([
    ['no stop', undefined],
    ['a stop with no questions panel', 'input-review'],
    ['the phase name for the arcs', 'arcs']
  ])('throws on %s, naming the three stops', (_name, stop) => {
    expect(() => writerQuestionsView([Q1], stop)).toThrow(/'arc-selection', 'outline' or 'article'/);
    expect(() => writerQuestionsView([], stop)).toThrow(/'arc-selection', 'outline' or 'article'/);
  });

  // Fix 3.7b (finding 1): each line shows the question's kind; a question with no kind,
  // or an unknown one, from a list made before the field had one, still renders.
  // Phase 4 (brief 4.4): the labels follow the weave's kinds, the questions the story
  // meeting asks (lib/writer-questions.js WEAVE_QUESTION_KINDS).
  it('labels exactly the weave\'s kinds (lib/writer-questions.js)', () => {
    const { WRITER_QUESTION_KIND_LABELS } = require('../checkpoint-view-logic');
    const { WEAVE_QUESTION_KINDS } = require('../../lib/writer-questions');
    expect(Object.keys(WRITER_QUESTION_KIND_LABELS)).toEqual([...WEAVE_QUESTION_KINDS]);
    expect(WRITER_QUESTION_KIND_LABELS).toEqual({ player: 'Player', pronoun: 'Pronoun', figure: 'Figure' });
  });

  it('shows each question\'s kind', () => {
    const view = writerQuestionsView([Q1, Q2, { kind: 'pronoun', about: 'Riley', question: 'Which pronoun?' }], 'article');
    expect(view.items.map((item) => [item.kind, item.kindLabel])).toEqual([
      ['player', 'Player'], ['figure', 'Figure'], ['pronoun', 'Pronoun']
    ]);
  });

  it('renders a question with no kind, or an unknown one, with no kind shown', () => {
    const view = writerQuestionsView([{ about: 'Sarah', question: 'Where?' }, { kind: 'other', about: 'Alex', question: 'Who?' }], 'article');
    expect(view.any).toBe(true);
    expect(view.items.map((item) => [item.kind, item.kindLabel, item.about])).toEqual([[null, '', 'Sarah'], [null, '', 'Alex']]);
  });

  it('trims the ends of each string and skips an entry missing either one', () => {
    const view = writerQuestionsView([{ about: '  Sarah ', question: ' Where? ' }, { question: 'No subject?' }], 'arc-selection');
    expect(view.items.map((item) => [item.about, item.question])).toEqual([['Sarah', 'Where?']]);
  });
});

// Fix 3.7b (finding 4): RevisionDiff's client-side shallow diff walks the keys this
// returns, so a round whose questions changed does not list `writerQuestions` as a
// changed key, as the server's diffOutline skips it (lib/hand-edit-diff.js).
describe('revisionDiffKeys (fix 3.7b)', () => {
  const { revisionDiffKeys, REVISION_DIFF_IGNORED_KEYS } = require('../checkpoint-view-logic');
  const Q = { kind: 'player', about: 'Sarah', question: 'Where was Sarah?' };

  it('walks every top-level key of both versions, sorted', () => {
    expect(revisionDiffKeys({ lede: {}, closing: {} }, { lede: {}, theStory: {} })).toEqual(['closing', 'lede', 'theStory']);
  });

  it('skips writerQuestions, whether added, removed or changed', () => {
    expect(revisionDiffKeys({ lede: {} }, { lede: {}, writerQuestions: [Q] })).toEqual(['lede']);
    expect(revisionDiffKeys({ lede: {}, writerQuestions: [Q] }, { lede: {} })).toEqual(['lede']);
    expect(revisionDiffKeys({ headline: {}, writerQuestions: [Q] }, { headline: {}, writerQuestions: [] })).toEqual(['headline']);
  });

  it('reads a missing version as empty', () => {
    expect(revisionDiffKeys(null, { lede: {}, writerQuestions: [] })).toEqual(['lede']);
    expect(revisionDiffKeys(undefined, undefined)).toEqual([]);
  });

  it('skips exactly the keys the server\'s outline diff skips', () => {
    const { _testing: { OUTLINE_IGNORED_KEYS } } = require('../../lib/hand-edit-diff');
    expect(OUTLINE_IGNORED_KEYS).toContain('writerQuestions');
    expect(REVISION_DIFF_IGNORED_KEYS).toEqual(OUTLINE_IGNORED_KEYS);
  });
});
