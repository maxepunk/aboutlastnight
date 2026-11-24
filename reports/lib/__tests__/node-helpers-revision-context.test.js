/**
 * buildRevisionContext — evaluator feedback actually reaches the reviser
 * (PROMPT-REVIEW B4 + the "shared channel" finding)
 *
 * Measured across the last five sessions: every revision prompt rendered the
 * evaluator's per-criterion feedback as `[object Object]` and its issues list as
 * `(no specific issues listed)`. The evaluator writes criteriaScores as
 * `{score, type, notes, fix}` objects and splits its findings into
 * structuralIssues/advisoryWarnings; the context builder interpolated the
 * objects directly and only ever read a legacy `issues` array. So the reviser
 * was told to "make targeted fixes" with nothing to target.
 *
 * Second half of the same bug: validationResults is ONE shared channel for all
 * three phases. The outline reviser happily consumed the arc evaluator's
 * leftovers. The block is now phase-stamped and dropped on a mismatch.
 */

const { buildRevisionContext } = require('../workflow/nodes/node-helpers');

const ARC_EVALUATION = {
  phase: 'arcs',
  criteriaScores: {
    rosterCoverage: { score: 0.5, type: 'structural', notes: 'Quinn missing', fix: 'add Quinn' },
    coherence: { score: 1.0, type: 'advisory', notes: '', fix: '' }
  },
  structuralIssues: ['Missing roster members: Quinn'],
  advisoryWarnings: ['x'],
  revisionGuidance: 'g',
  confidence: 'high'
};

describe('buildRevisionContext — evaluator criteria reach the prompt (B4)', () => {
  const build = (overrides = {}) => buildRevisionContext({
    phase: 'arcs',
    revisionCount: 1,
    validationResults: ARC_EVALUATION,
    previousOutput: [{ id: 'arc-1' }],
    ...overrides
  }).contextSection;

  // Phase 18, run 2b (brief K; R27): the rework reads the findings, not the scores. An
  // evaluation that lists its own must-fix lines prints them, and no criterion's name, score,
  // notes or fix beside them.
  it('renders the must-fix lines, and no criterion score, notes or fix beside them', () => {
    const section = build();
    expect(section).toContain('  - Missing roster members: Quinn');
    expect(section).not.toContain('rosterCoverage');
    expect(section).not.toContain('0.50');
    expect(section).not.toContain('Quinn missing');
    expect(section).not.toContain('add Quinn');
  });

  it('lists structural issues as must-fix and advisory warnings as should-consider', () => {
    const section = build();
    // Assert the rendered ISSUES lines, not a bare 'x' — which matched any 'x'
    // anywhere in several hundred characters of boilerplate and could not fail.
    expect(section).toContain('  - Missing roster members: Quinn');
    expect(section).toContain('  - x');
    // Brief 1.3: the two lists are separate. Concatenated, an advisory warning read
    // to the writer as a defect it had to fix.
    expect(section).toMatch(/ISSUES TO ADDRESS:\n  - Missing roster members: Quinn\n\n/);
    expect(section).toMatch(/SHOULD CONSIDER:\n[\s\S]*?\n  - x/);
  });

  it('names no criterion to preserve (phase 3, 3.3; TH7)', () => {
    // After a pass every criterion scores 0.8 or more, so the list outranked the
    // director's note; with one of nine players missing (0.89) it told the reworker to
    // keep rosterCoverage directly above the issue naming the missing player (V3).
    // Brief 4.7c (R1): the parked detective's list went with its branch.
    expect(build()).not.toContain('PRESERVE THESE');
  });

  it('never renders [object Object] or the empty-issues placeholder', () => {
    const section = build();
    expect(section).not.toContain('[object Object]');
    expect(section).not.toContain('(no specific issues listed)');
  });

  // Phase 3 (3.10): the judge's guidance left the automatic pass, since its must-fix steps
  // repeat ISSUES TO ADDRESS and its optional steps read as instructions (the integrator's
  // ruling). Brief K (R27): it leaves the send back too, where it was the third copy of a fix.
  it('leaves the evaluator revision guidance out of a send back and an automatic pass alike', () => {
    const guided = { ...ARC_EVALUATION, revisionGuidance: 'Step 1: place Quinn.' };
    for (const humanFeedback of [null, 'Rethink it.']) {
      const section = build({ validationResults: guided, humanFeedback });
      expect(section).not.toContain('Step 1: place Quinn.');
      expect(section).not.toContain('EVALUATOR FEEDBACK');
    }
  });

  it('prints no confidence, as a word or as a number', () => {
    for (const confidence of ['high', 0.9]) {
      const section = build({ validationResults: { ...ARC_EVALUATION, confidence } });
      expect(section).not.toContain('Confidence');
      expect(section).not.toMatch(/\bhigh\b|90%|NaN/);
    }
  });

  it('still handles the legacy numeric criteriaScores shape', () => {
    const legacy = {
      phase: 'arcs',
      criteriaScores: { rosterCoverage: 0.5, coherence: 0.95 },
      structuralIssues: ['legacy issue string'],
      feedback: 'legacy feedback',
      confidence: 0.9
    };
    const section = build({ validationResults: legacy });
    expect(section).toContain('legacy issue string');
    expect(section).not.toMatch(/rosterCoverage|coherence|0\.50|0\.95/);
    expect(section).not.toContain('[object Object]');
    // Brief K (R27): the legacy feedback is a judge's guidance, which no rework reads.
    expect(section).not.toContain('legacy feedback');
    expect(build({ validationResults: legacy, humanFeedback: 'Rethink it.' })).not.toContain('legacy feedback');
    expect(build({ validationResults: legacy, humanFeedback: 'Rethink it.' })).toContain('  - legacy issue string');
  });

  it('formats an object in the must-fix list by its message', () => {
    const section = build({
      validationResults: {
        phase: 'arcs',
        structuralIssues: [{ type: 'no-accusation-arc', message: 'No accusation arc present', severity: 'structural' }],
        criteriaScores: { rosterCoverage: 1.0 }
      }
    });
    expect(section).toContain('No accusation arc present');
    expect(section).not.toContain('[object Object]');
  });
});

describe('buildRevisionContext — phase-stamped feedback (shared-channel bug)', () => {
  it('drops the evaluation block when validationResults belongs to another phase', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'outline',
      revisionCount: 1,
      validationResults: ARC_EVALUATION,   // stamped phase:'arcs'
      previousOutput: { lede: {} }
    });
    expect(contextSection).toContain('(no evaluator feedback for this phase)');
    expect(contextSection).not.toContain('rosterCoverage');
    expect(contextSection).not.toContain('Missing roster members: Quinn');
    expect(contextSection).not.toContain('EVALUATOR FEEDBACK');
  });

  it('keeps the block when the stamp matches', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'arcs',
      revisionCount: 1,
      validationResults: ARC_EVALUATION,
      previousOutput: []
    });
    expect(contextSection).not.toContain('(no evaluator feedback for this phase)');
    expect(contextSection).toContain('Missing roster members: Quinn');
  });

  it('keeps an UNSTAMPED block (legacy writers) for whichever phase is revising', () => {
    const unstamped = { criteriaScores: { arcCoverage: 0.4 }, structuralIssues: ['Thread the arcs.'], feedback: 'thread the arcs' };
    const { contextSection } = buildRevisionContext({
      phase: 'outline',
      revisionCount: 1,
      validationResults: unstamped,
      previousOutput: {}
    });
    expect(contextSection).toContain('ISSUES TO ADDRESS:\n  - Thread the arcs.');
    // Brief K (R27): a send back reads the same must-fix line, and no guidance.
    const sentBack = buildRevisionContext({
      phase: 'outline', revisionCount: 0, validationResults: unstamped, previousOutput: {}, humanFeedback: 'x'
    }).contextSection;
    expect(sentBack).toContain('ISSUES TO ADDRESS:\n  - Thread the arcs.');
    expect(sentBack).not.toContain('thread the arcs');
  });

  // Brief K (R27): an automatic pass, whose scope names the must-fix list, says so plainly. A
  // send back opens on the director's note, the one task, and prints no line about the evaluation.
  it('says so plainly when there is no evaluator feedback at all on an automatic pass; a send back prints the note alone', () => {
    const options = { phase: 'article', validationResults: null, previousOutput: {} };
    expect(buildRevisionContext({ ...options, revisionCount: 1, humanFeedback: null }).contextSection)
      .toContain('(no evaluator feedback for this phase)');
    const { contextSection } = buildRevisionContext({ ...options, revisionCount: 0, humanFeedback: 'tighten the closing' });
    expect(contextSection).not.toContain('(no evaluator feedback for this phase)');
    // Human feedback is a separate channel and must survive.
    expect(contextSection).toContain('tighten the closing');
  });
});

/**
 * Brief 1.3 — the rework prompt tells the truth.
 *
 * Measured on session 091826: every rework prompt said "Ready: NO (must address
 * issues)" and listed four evidence-card defects fixed an hour earlier. Two causes.
 * The builder read `validationResults.ready`, which no evaluator branch writes (they
 * write `passed`), so the line was hardcoded to NO. And a passing evaluation wrote
 * nothing at all, so the previous failure stayed in the channel.
 */
describe('buildRevisionContext — the evaluation state it reports (brief 1.3)', () => {
  const PASSED = {
    phase: 'article',
    passed: true,
    structuralIssues: [],
    advisoryWarnings: ['the lede frontloads the verdict'],
    criteriaScores: { voice: { score: 0.92, type: 'advisory', notes: 'strong' } },
    revisionGuidance: '',
    confidence: 'high'
  };

  const build = (overrides = {}) => buildRevisionContext({
    phase: 'article',
    revisionCount: 0,
    validationResults: PASSED,
    previousOutput: { headline: {} },
    ...overrides
  }).contextSection;

  // Brief K (R27): no readiness line prints. A stale "Ready: NO" was the bug brief 1.3 fixed; the
  // prompt read found the true one noise beside the findings, which say what to change.
  it('prints no readiness line after a pass, and nothing to fix', () => {
    expect(build()).not.toMatch(/Ready|must address/);
    expect(build()).toMatch(/ISSUES TO ADDRESS:\n {2}\(none reported\)/);
  });

  it('prints no readiness line after a failure, only its must-fix line', () => {
    const section = build({
      validationResults: { ...PASSED, passed: false, structuralIssues: ['card "T-1" misquotes its source'] }
    });
    expect(section).not.toMatch(/Ready|must address/);
    expect(section).toContain('ISSUES TO ADDRESS:\n  - card "T-1" misquotes its source');
  });

  // Brief 1.3 said why a send-back followed a pass. Brief K: the note comes first and is the task
  // (WHAT THIS REWORK DOES says so), so no line about the pass stands between it and the edits.
  it('opens a send-back after a pass on the director\'s note, with no line about the pass', () => {
    const section = build({ humanFeedback: 'Rethink the closing.' });
    expect(section).not.toMatch(/Ready|This evaluation passed|reason for this rework/);
    expect(section.indexOf('HUMAN FEEDBACK (HIGHEST PRIORITY):\nRethink the closing.')).toBeGreaterThan(-1);
    expect(section).not.toContain('ISSUES TO ADDRESS');
  });

  it('says nothing about a send-back on an automated rework', () => {
    expect(build({ humanFeedback: null })).not.toContain('reason for this rework');
  });

  it('keeps a passing evaluation out of the must-fix list and its advisories in should-consider', () => {
    const section = build();
    expect(section).toMatch(/ISSUES TO ADDRESS:\n  \(none reported\)/);
    expect(section).toContain('  - the lede frontloads the verdict');
    // Phase 3 (3.10): the journalist's list says where its items came from; what a
    // rework does with a suggestion is WHAT THIS REWORK DOES's to say, once (R23).
    expect(section).toContain('SHOULD CONSIDER:\nThese came from the evaluation that ran before this pass.\n\n  - the lede');
  });

  it('prints nothing about a clean evaluation on a send-back: no readiness, no absence line, no empty list', () => {
    // A clean evaluation writes empty lists and no guidance, the state a send-back after a pass
    // lands in. Brief K: the rework reads the note, the edits and the scope.
    const section = build({
      validationResults: { phase: 'article', passed: true, structuralIssues: [], advisoryWarnings: [] },
      humanFeedback: 'Rethink the closing.'
    });
    expect(section).not.toMatch(/Ready|no evaluator feedback for this phase|ISSUES TO ADDRESS|none reported/);
    expect(section).toContain('What the note leaves alone stays as it was.');
  });

  it('omits the should-consider list entirely when the evaluation raised none', () => {
    expect(build({ validationResults: { ...PASSED, advisoryWarnings: [] } }))
      .not.toContain('SHOULD CONSIDER');
  });

  it('no longer tells the writer to leave every high-scoring criterion alone', () => {
    // With every criterion above 0.8 this instruction turned a "rethink the closing"
    // send-back into a relabel.
    const section = build();
    expect(section).not.toContain('scoring well');
    expect(section).not.toMatch(/do NOT change anything related to it/);
    // Phase 3 (3.3): the instructions are one paragraph with no fixed "preserve" text.
    // Brief 4.7c (R1): the parked detective's four numbered lines went with its branch.
    expect(section).toContain('WHAT THIS REWORK DOES:');
    expect(section).not.toContain('CRITICAL REVISION INSTRUCTIONS');
  });
});

/**
 * Brief 2.3 — the banner names whose pass this is.
 *
 * A send back resets the automated counter before the reworker reads it, so the
 * director's own rework was bannered "automated pass 0" right above their note.
 * The send back is the director's round; the discriminator is the feedback slot, as
 * in the increment nodes. (The three reworker nodes pass the round their send back
 * opens; reworker-writer-parity.test.js checks each one's banner end to end.)
 */
describe('buildRevisionContext — the banner (brief 2.3)', () => {
  const banner = (overrides) => buildRevisionContext({
    phase: 'article',
    revisionCount: 0,
    validationResults: null,
    previousOutput: {},
    ...overrides
  }).contextSection.split('\n').find(line => line.startsWith('REVISION CONTEXT:'));

  it("reads as the director's round on a send back, with the round it opens", () => {
    expect(banner({ humanFeedback: 'Rethink the closing.', round: 2 }))
      .toBe("REVISION CONTEXT: ARTICLE (round 2: the director's send back)");
  });

  it('never says "automated pass" for a send back', () => {
    expect(banner({ humanFeedback: 'Rethink the closing.', round: 3 })).not.toContain('automated pass');
  });

  it('names the send back without a number when the caller has no round', () => {
    expect(banner({ humanFeedback: 'Rethink the closing.' }))
      .toBe("REVISION CONTEXT: ARTICLE (the director's send back)");
    expect(banner({ humanFeedback: 'Rethink the closing.', round: 0 }))
      .toBe("REVISION CONTEXT: ARTICLE (the director's send back)");
  });

  it('is unchanged for an automated pass, whatever round it runs in', () => {
    expect(banner({ revisionCount: 1, round: 2 })).toBe('REVISION CONTEXT: ARTICLE (automated pass 1)');
    expect(banner({ phase: 'arcs', revisionCount: 2 })).toBe('REVISION CONTEXT: ARCS (automated pass 2)');
  });

  it('changes nothing else in the context', () => {
    const base = { revisionCount: 0, validationResults: { phase: 'article', passed: true }, humanFeedback: 'x' };
    const withRound = buildRevisionContext({ phase: 'article', previousOutput: {}, ...base, round: 2 }).contextSection;
    const without = buildRevisionContext({ phase: 'article', previousOutput: {}, ...base }).contextSection;
    expect(withRound.replace('round 2: ', '')).toBe(without);
  });
});

describe('evaluator → reviser wiring (the write side)', () => {
  const { _testing } = require('../workflow/nodes/evaluator-nodes');

  it('the evaluator jsonSchema describes criteriaScores objects and string issue lists', () => {
    // The schema was `criteriaScores: {type:'object'}` with untyped arrays, so the
    // model was free to emit whatever shape; nothing downstream could read it. Brief 4.7c:
    // the judges' one schema is the truth-only contract's, whose criteria carry no type
    // (each takes its definition's).
    const schema = _testing.TRUTH_ONLY_EVALUATION_JSON_SCHEMA;
    expect(schema.properties.criteriaScores.additionalProperties).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['score'],
        properties: expect.objectContaining({
          score: { type: 'number' },
          notes: expect.objectContaining({ type: 'string' }),
          fix: expect.objectContaining({ type: 'string' })
        })
      })
    );
    expect(schema.properties.structuralIssues.items).toEqual({ type: 'string' });
    expect(schema.properties.advisoryWarnings.items).toEqual({ type: 'string' });
  });
});

// F1 (spec 2026-10-02 section 7): the block lists the director's standing edits by id
// and section, each with the director's text, in one of two wordings. An automatic pass
// fixes the writer's text, so every edit stays as written. A send-back may change an
// edit only where the note's structural change means it no longer fits, and returns
// each one it changed, with why. The sentence about the evaluator's notes predating the
// edits is gone: the judge now reads the edits.
//
// Brief 4.7f: a cut takes its material with it. The cut check flags only the cut's own
// sentences coming back, so the rule asks the rework to retell the cut in no other words, under
// the same exception on a send-back. The rule and its exception are stated here alone: the
// article writer's task gives these edits precedence and restates neither.
describe('<HAND_EDITS> block (spec 2026-09-19 §4.3; F1)', () => {
  const { diffOutline, standingAfterSendBack } = require('../hand-edit-diff');
  let standing;
  beforeAll(() => {
    standing = standingAfterSendBack(null, { lede: { hook: 'Old' }, closing: { finalLine: 'The ledger never lies.' } }, { lede: { hook: 'New' }, closing: {} }, 'outline');
  });
  const base = { phase: 'outline', revisionCount: 1, validationResults: null, previousOutput: { lede: { hook: 'New' }, closing: {} } };
  const SEND_BACK_RULE = "Each edit of the director's is final unless the structural change their note asks for means it no longer fits: the text the director wrote stays exactly as written, each block they moved stays where they put it, each removed sentence stays out, and each block they cut stays out. What a block they cut said is not said again anywhere in the article. List each edit this rework changes, removes or brings back in changedDirectorEdits, with its id and one sentence on why.";
  const AUTOMATIC_RULE = "This automatic pass fixes the writer's text, in a block the director moved too. Each edit of the director's is final: the text the director wrote stays exactly as written, each block they moved stays where they put it, each removed sentence stays out, and each block they cut stays out. What a block they cut said is not said again anywhere in the article.";

  it('sits after HUMAN FEEDBACK and before the instructions (WHAT THIS REWORK DOES since phase 3)', () => {
    const { contextSection, previousOutputSection } = buildRevisionContext({ ...base, humanFeedback: 'Tighten it', handEdits: standing });
    const hf = contextSection.indexOf('HUMAN FEEDBACK');
    const he = contextSection.indexOf('<HAND_EDITS>');
    const cr = contextSection.indexOf('WHAT THIS REWORK DOES');
    expect(hf).toBeGreaterThan(-1);
    expect(he).toBeGreaterThan(hf);
    expect(cr).toBeGreaterThan(he);
    expect(contextSection).toContain('</HAND_EDITS>');
    expect(previousOutputSection).not.toContain('HAND_EDITS');
  });

  it('on a send-back, lists each edit by id and section with the director\'s text, and asks why for any it changes', () => {
    const { contextSection } = buildRevisionContext({ ...base, humanFeedback: 'Tighten it', handEdits: standing });
    const block = contextSection.slice(contextSection.indexOf('<HAND_EDITS>'), contextSection.indexOf('</HAND_EDITS>'));
    expect(block).toContain(SEND_BACK_RULE);
    expect(block).toContain('E1 (lede, hook): "New"');
    expect(block).toContain('E2 (closing, finalLine, cut): "The ledger never lies."');
    expect(block).not.toContain(AUTOMATIC_RULE);
    expect(contextSection).not.toContain("The evaluator's notes above were written before these edits.");
  });

  it('on an automatic pass, keeps every edit as written and asks for no list', () => {
    const { contextSection } = buildRevisionContext({ ...base, humanFeedback: null, handEdits: standing });
    const block = contextSection.slice(contextSection.indexOf('<HAND_EDITS>'), contextSection.indexOf('</HAND_EDITS>'));
    expect(block).toContain(AUTOMATIC_RULE);
    expect(block).toContain('E1 (lede, hook): "New"');
    expect(block).not.toContain('changedDirectorEdits');
    expect(block).not.toContain('unless the structural change');
    expect(contextSection.indexOf('<HAND_EDITS>')).toBeLessThan(contextSection.indexOf('WHAT THIS REWORK DOES'));
  });

  it('keeps each edit\'s id across rounds', () => {
    const later = { ...standing, issued: 5, edits: standing.edits.map((e, i) => ({ ...e, id: ['E3', 'E5'][i] })) };
    const { contextSection } = buildRevisionContext({ ...base, humanFeedback: null, handEdits: later });
    expect(contextSection).toContain('E3 (lede, hook): "New"');
    expect(contextSection).toContain('E5 (closing, finalLine, cut): "The ledger never lies."');
  });

  it('lists only the edits the version the rework starts from carries', () => {
    const { contextSection } = buildRevisionContext({ ...base, previousOutput: { lede: { hook: 'Rewritten' }, closing: {} }, handEdits: standing });
    expect(contextSection).not.toContain('E1 (lede, hook)');
    expect(contextSection).toContain('E2 (closing, finalLine, cut)');
  });

  it('reads a diff stored before the edits had ids', () => {
    const diff = diffOutline({ lede: { hook: 'Old' } }, { lede: { hook: 'New' } });
    expect(buildRevisionContext({ ...base, handEdits: diff }).contextSection).toContain('E1 (lede, hook): "New"');
  });

  // FA, requirement 3: a rewrite's removed sentences print under the edit.
  it('lists the sentences an edit removed under it, and says what a removed line is', () => {
    const rewritten = { lede: { hook: 'The party ended with one guest dead.' } };
    const withRemoval = standingAfterSendBack(null, { lede: { hook: 'The party ended with one guest dead. The room ran out of time.' } }, rewritten, 'outline');
    const { contextSection } = buildRevisionContext({ ...base, previousOutput: rewritten, humanFeedback: null, handEdits: withRemoval });
    expect(contextSection).toContain('E1 (lede, hook): "The party ended with one guest dead."\n  removed: "The room ran out of time."');
    expect(contextSection).toContain('A removed: line under an edit is a sentence the director took out of that text when rewriting it.');
  });

  // FA fix round 1, finding 2: a move is the block's place only, so the block stays the
  // writer's: the block lists it by its place, and a finding that quotes the moved
  // block's text reaches the rework as the writer's must-fix.
  it('lists a moved block by its place, and a finding about its text reaches the rework', () => {
    const LINE = 'Riley watched the ledger all morning and said nothing to anyone.';
    const article = (where) => {
      const a = {
        headline: { main: 'The Sale' },
        sections: [
          { id: 'the-story', type: 'narrative', content: [{ type: 'paragraph', text: 'Mel built the first theory around the fight.' }] },
          { id: 'closing', type: 'narrative', content: [{ type: 'paragraph', text: 'Whether the verdict costs Alex anything is still open.' }] }
        ]
      };
      a.sections[where].content.push({ type: 'paragraph', text: LINE });
      return a;
    };
    const issue = `T12: "${LINE}" is not in the record. Cut the line.`;
    // Brief K: the rework reads the limit's name where the stored finding holds its code.
    const { LIMIT_CODES } = require('../workflow/nodes/evaluator-nodes');
    const shown = issue.replace('T12', LIMIT_CODES[11].name);
    for (const humanFeedback of [null, 'Move the photos apart.']) {
      const { contextSection } = buildRevisionContext({
        phase: 'article', revisionCount: 1, previousOutput: article(1), humanFeedback,
        handEdits: standingAfterSendBack(null, article(0), article(1), 'bundle'),
        validationResults: { phase: 'article', passed: false, criteriaScores: {}, structuralIssues: [issue], advisoryWarnings: [], revisionGuidance: '' }
      });
      const block = contextSection.slice(contextSection.indexOf('<HAND_EDITS>'), contextSection.indexOf('</HAND_EDITS>'));
      expect(block).toContain('E1 (section "closing", paragraph, moved from section "the-story"): begins "Riley watched the ledger all morning and said…"');
      expect(block).toContain('A line marked moved names a block the director moved to that place without changing it: the place is the director\'s, and the block\'s text is still the writer\'s.');
      expect(contextSection.slice(0, contextSection.indexOf('<HAND_EDITS>'))).toContain(shown);
    }
  });

  it('is absent when handEdits is null, empty or missing, or when no edit is carried', () => {
    expect(buildRevisionContext({ ...base, handEdits: null }).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext({ ...base, handEdits: diffOutline({}, {}) }).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext(base).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext({ ...base, previousOutput: { lede: { hook: 'Rewritten' }, closing: { finalLine: 'The ledger never lies.' } }, handEdits: standing }).contextSection)
      .not.toContain('HAND_EDITS');
  });
});

/**
 * Phase 3, brief 3.3 (TH7, and coverage rows 62 to 64, 69 and 70): the revision context
 * every journalist rework carries.
 *
 * It told the reworker to PRESERVE every criterion that scored 0.8 or more, called
 * every criterion under 0.7 one that "needs improvement" (an advisory one included),
 * never said the scores are uncalibrated, and closed on fixed "PRESERVE EVERYTHING
 * THAT'S WORKING - Do NOT regenerate from scratch" lines. On 091826 every criterion
 * scored above 0.8, so the director's "rethink the closing" came back as a relabel.
 * The director's note now sets how much a rework keeps; an advisory criterion reaches
 * the reworker as a suggestion. The detective keeps today's text (D13).
 */
describe('buildRevisionContext: the director governs the rework, advisories are suggestions (phase 3, 3.3)', () => {
  const EVALUATION = {
    phase: 'outline',
    passed: false,
    criteriaScores: {
      sectionFlow: { score: 0.4, type: 'structural', notes: 'the money section is missing', fix: 'add it' },
      lede: { score: 0.5, type: 'advisory', notes: 'flat opening', fix: 'open on a moment' },
      voice: { score: 0.95, type: 'advisory', notes: 'strong', fix: '' }
    },
    structuralIssues: ['The money section is missing.'],
    advisoryWarnings: ['The closing could name the account.'],
    revisionGuidance: 'Add the money section.',
    confidence: 'medium'
  };
  const build = (overrides = {}) => buildRevisionContext({
    phase: 'outline',
    revisionCount: 1,
    validationResults: EVALUATION,
    previousOutput: { lede: {} },
    ...overrides
  });
  const FIXED_PRESERVE = /preserve|not regenerat|IMPROVING|TARGETED FIX|minimal, surgical|need improvement|working well/i;

  it('carries no fixed "preserve" or "do not regenerate" text, on a send back or an automated pass', () => {
    for (const humanFeedback of [null, 'Rethink the closing from scratch.']) {
      const { contextSection, previousOutputSection } = build({ humanFeedback });
      expect(contextSection).not.toMatch(FIXED_PRESERVE);
      expect(previousOutputSection).not.toMatch(FIXED_PRESERVE);
    }
  });

  it("on a send back, says the director's note sets the task and how much the rework keeps", () => {
    const { contextSection } = build({ humanFeedback: 'Rethink the closing from scratch.' });
    const instructions = contextSection.slice(contextSection.indexOf('WHAT THIS REWORK DOES'));
    expect(contextSection).toContain('WHAT THIS REWORK DOES');
    expect(instructions).toMatch(/director's note above is the task/);
    expect(instructions).toMatch(/how much of the previous outline this rework keeps/);
    expect(instructions).toMatch(/rethink gets a rethink/);
  });

  it('on an automated pass, scopes the rework to the findings: must-fix issues, advisory suggestions', () => {
    const { contextSection } = build({ humanFeedback: null });
    const instructions = contextSection.slice(contextSection.indexOf('WHAT THIS REWORK DOES'));
    expect(contextSection).toContain('WHAT THIS REWORK DOES');
    // Phase 3 (3.10; R23): the must-fix items, then the suggestions by name. Brief K: the
    // suggestions are SHOULD CONSIDER's alone, since CRITERIA SCORES no longer prints.
    expect(instructions).toMatch(/fixes the must-fix items: the ISSUES TO ADDRESS\./);
    expect(instructions).toMatch(/Take up a SHOULD CONSIDER item only where/);
  });

  // Brief K (R27): an advisory criterion fails nothing, so its fix is neither a must-fix line nor
  // a suggestion; the judge's suggestions are its advisoryWarnings, under SHOULD CONSIDER.
  it('gives an advisory criterion that scored low no line at all, neither as a fix nor as a suggestion', () => {
    const { contextSection } = build();
    expect(contextSection).not.toMatch(/need(s)? improvement/i);
    expect(contextSection).not.toMatch(/flat opening|open on a moment|lede: |\[advisory\]/);
    // The structural criterion's finding is the must-fix line the evaluation lists.
    expect(contextSection).toContain('ISSUES TO ADDRESS:\n  - The money section is missing.');
    expect(contextSection).not.toMatch(/sectionFlow|add it/);
  });

  // Brief K (R27): the scores and the line on who computed them went whole.
  it('prints no score and no line about the scores', () => {
    const { contextSection } = build();
    expect(contextSection).not.toMatch(/uncalibrated|evaluating model|CRITERIA SCORES|0\.40|0\.50|0\.95/);
  });

  // Post-merge fix (3.3 review, finding 1): only a model evaluation's scores are the
  // model's. Phase 4 (brief 4.4): the weave checks replace the arc check and score
  // nothing, so their context carries no scores' line at all, and their lines print
  // under the checks' own label.
  it("prints the weave checks' lines under their label, with no word of the evaluating model's", () => {
    const WEAVE_CHECKS = {
      phase: 'arcs',
      source: 'weave-checks',
      passed: false,
      ready: false,
      structuralPassed: false,
      structuralIssues: ['Thread "t2" has no receipt. Give it its strongest receipt: the id of a document in <RECORD>, or "ledger".']
    };
    for (const humanFeedback of [null, 'Merge the two money threads.']) {
      const { contextSection } = buildRevisionContext({
        phase: 'arcs', outputName: 'weave', revisionCount: 1, validationResults: WEAVE_CHECKS, previousOutput: {}, humanFeedback
      });
      expect(contextSection).not.toMatch(/uncalibrated|evaluating model|scores below/i);
      expect(contextSection).toContain(`WEAVE CHECK FAILURES:\n  - ${WEAVE_CHECKS.structuralIssues[0]}`);
      expect(contextSection).not.toContain('ISSUES TO ADDRESS');
    }
  });

  // Brief K (R27): the fact check's short-circuit writes its lines twice, as its must-fix list
  // and as its feedback; the rework reads each once, on either kind of pass.
  it('prints each of the fact check\'s lines once, and nothing about scores (the fact check before the model)', () => {
    const LINE = 'Evidence card "ale003" quotes text its document does not hold.';
    const FACT_CHECK = {
      phase: 'article',
      passed: false,
      structuralIssues: [LINE],
      advisoryWarnings: [],
      feedback: LINE
    };
    for (const humanFeedback of [null, 'Tighten the closing.']) {
      const { contextSection } = buildRevisionContext({
        phase: 'article', revisionCount: humanFeedback ? 0 : 1, validationResults: FACT_CHECK, previousOutput: {}, humanFeedback
      });
      expect(contextSection).not.toMatch(/uncalibrated|evaluating model|scores below|Ready|CRITERIA SCORES|no criteria scores/i);
      expect(contextSection.split(LINE).length - 1).toBe(1);
      expect(contextSection).toContain(`ISSUES TO ADDRESS:\n  - ${LINE}`);
    }
  });

  // Post-merge fix (3.3 review, finding 2): each rule once. The scores' line said "Only
  // ISSUES TO ADDRESS is must-fix; a criterion marked [advisory] is a suggestion", and the
  // automatic pass's WHAT THIS REWORK DOES said both again, with the reason. Phase 3
  // (3.10): the rule is R23's, stated in WHAT THIS REWORK DOES alone.
  it('on an automated pass, states once what is must-fix and what is a suggestion', () => {
    const { contextSection } = build({ humanFeedback: null });
    const instructions = contextSection.slice(contextSection.indexOf('WHAT THIS REWORK DOES'));
    expect(contextSection.slice(0, contextSection.indexOf('WHAT THIS REWORK DOES'))).not.toMatch(/must-fix|suggestions? (is|are)\b/);
    expect(instructions.match(/fixes the must-fix items/g)).toHaveLength(1);
    expect(instructions.match(/Take up a SHOULD CONSIDER item only where/g)).toHaveLength(1);
  });

  it("keeps the fixture's anchors: the send-back NOTE line, the previous version's header and its end", () => {
    const { contextSection, previousOutputSection } = build({ humanFeedback: 'x' });
    expect(contextSection).toContain('HUMAN FEEDBACK (HIGHEST PRIORITY):\nx\n\nNOTE: The human reviewer has explicitly requested these changes.');
    expect(previousOutputSection).toMatch(/^PREVIOUS OUTLINE OUTPUT \(the version this rework starts from\):\n═+$/m);
    expect(previousOutputSection).toMatch(/\n═+\nEND PREVIOUS OUTPUT\n═+$/);
  });

});

/**
 * Phase 3, brief 3.10 (R23; final review rules-writers[0], questions-console-docs[0]
 * and the rework half of judges-factcheck[1]): an automatic rework fixes the must-fix
 * items, and takes up a suggestion only where it touches a line it is already changing
 * for one; everything else stays word for word. The director's send back keeps its own
 * scope (TH7).
 *
 * At the gate, 092026's first automatic arc rework was given four must-fix issues, and
 * beside them: fix lines under four truth criteria the judge had passed (verdictTruth
 * 0.88, stagesTruth 0.90, novaPositionTruth 0.95, playersTruth 0.92), the judge's
 * guidance with its "Step 4 (optional)", and a line telling it to take a suggestion up
 * wherever it made the arcs truer to the record. It kept 53% of its sentences and wrote
 * a new breach. A stored verdict carries a fix on a passing criterion, so the context
 * filters by the score, whatever the judge wrote.
 */
describe('buildRevisionContext: an automatic rework fixes the must-fix items (phase 3, 3.10; R23)', () => {
  const fs = require('fs');
  const path = require('path');
  const { STRUCTURAL_PASS_SCORE } = require('../workflow/nodes/node-helpers');

  // A stored verdict in the gate's shape: the passing criteria carry fix lines too.
  const EVALUATION = {
    phase: 'arcs',
    passed: false,
    criteriaScores: {
      rosterCoverage: { score: 1, type: 'structural', notes: 'All nine placed.', fix: 'PASSING-FIX none needed.' },
      verdictTruth: { score: 0.88, type: 'structural', notes: 'PASSING-NOTES two framing risks.', fix: 'PASSING-FIX relabel the two candidates.' },
      playersTruth: { score: 0.92, type: 'structural', notes: 'PASSING-NOTES pronouns match.', fix: 'PASSING-FIX settle the pronoun questions.' },
      wordsTruth: { score: 0.5, type: 'structural', notes: 'A misquote.', fix: 'FAILING-FIX give the text to its speaker.' },
      accusationArcPresent: { score: 0.9, type: 'structural', notes: 'NAMED-NOTES mislabelled.', fix: 'NAMED-FIX label the verdict arc.' },
      coherence: { score: 0.7, type: 'advisory', notes: 'Bridges disagree.', fix: 'ADVISORY-FIX align the bridges.' },
      evidenceConfidenceBalance: { score: 1, type: 'advisory', notes: 'PASSING-NOTES balanced.', fix: 'PASSING-FIX none needed.' }
    },
    structuralIssues: [
      'T12: the text is given to the wrong speaker.',
      'accusationArcPresent: the verdict arc is labelled "observation".'
    ],
    advisoryWarnings: ['T2: relabel the two candidates.'],
    revisionGuidance: 'JUDGE-GUIDANCE Step 1: give the text to its speaker. Step 2 (optional): relabel the candidates.',
    confidence: 'high'
  };
  const AUTOMATIC = { humanFeedback: null, revisionCount: 1 };
  const SEND_BACK = { humanFeedback: 'Rethink the money thread.', revisionCount: 0, round: 2 };
  const build = (overrides = {}) => buildRevisionContext({
    phase: 'arcs', validationResults: EVALUATION, previousOutput: [{ id: 'arc-1' }], ...AUTOMATIC, ...overrides
  }).contextSection;
  const count = (haystack, needle) => haystack.split(needle).length - 1;
  /** Brief K: the limits' names, which a rework reads in place of the codes a finding opens with. */
  const { LIMIT_CODES } = require('../workflow/nodes/evaluator-nodes');
  const nameOf = (code) => LIMIT_CODES.find((limit) => limit.code === code).name;
  const SCOPE = 'only where it touches a line this rework is already changing for a must-fix item';
  /** R23's reason (the 4b fix batch), as WHAT THIS REWORK DOES gives it on an automatic pass. */
  const SCOPE_REASON = 'Those lines passed the check or evaluation that ran before this pass, and in past reworks the new errors that reached the director were in lines rewritten with no finding behind them.';
  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  it('the bar is one constant: node-helpers.js exports it and the evaluator imports it', () => {
    expect(STRUCTURAL_PASS_SCORE).toBe(0.8);
    const evaluator = fs.readFileSync(path.join(__dirname, '..', 'workflow', 'nodes', 'evaluator-nodes.js'), 'utf8');
    expect(evaluator).not.toMatch(/const STRUCTURAL_PASS_SCORE\s*=/);
    expect(evaluator).toMatch(/\bSTRUCTURAL_PASS_SCORE\b[^}]*\}\s*=\s*require\('\.\/node-helpers'\)/);
    // The context reads the same bar: with no must-fix line listed (brief K), a criterion at the
    // bar passes, and one just under it fails and gives its fix as the must-fix line.
    const atBar = (score) => build({
      validationResults: { phase: 'arcs', passed: false, structuralIssues: [], criteriaScores: { verdictTruth: { score, type: 'structural', fix: 'BAR-FIX' } } }
    });
    expect(atBar(STRUCTURAL_PASS_SCORE)).not.toContain('BAR-FIX');
    expect(atBar(STRUCTURAL_PASS_SCORE - 0.01)).toContain('ISSUES TO ADDRESS:\n  - BAR-FIX');
  });

  // Brief K (R27): no criterion prints, passing or failing; a passing one's fix never reaches a
  // rework, by either path.
  it("a passing structural criterion prints nothing in the automatic and the send-back context: no fix, no notes, no score", () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build(kind);
      expect(section).not.toContain('PASSING-FIX');
      expect(section).not.toContain('PASSING-NOTES');
      expect(section).not.toMatch(/verdictTruth|playersTruth|rosterCoverage|0\.88|0\.92|1\.00/);
    }
  });

  // The 4b fix batch (the integrator's ruling; 3.10 review minor 1): a criterion failed
  // only when it scored below the bar. "Named in the structural issues" went: it matched
  // a key as a whole word anywhere in an issue, so a plain-English key (convergence,
  // coherence) read as failing whenever an issue used the word. A judge that scores a
  // criterion as passing but lists its breach has the breach in ISSUES TO ADDRESS, with
  // its own fix, so nothing is lost.
  // Brief K (R27): an evaluation that lists its own must-fix lines prints them, each once, and a
  // failing criterion's fix, which states the same finding again, does not print. A criterion an
  // issue names but scored at or above the bar adds nothing either: the issue is in ISSUES TO
  // ADDRESS, with its own fix.
  it("a failing criterion's fix is the must-fix line's second copy and does not print; an issue that names a passing criterion prints as listed", () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build(kind);
      expect(section).toContain(`  - ${nameOf('T12')}: the text is given to the wrong speaker.`);
      expect(section).not.toContain('FAILING-FIX');
      expect(section).not.toContain('NAMED-FIX');
      expect(section).toContain('  - accusationArcPresent: the verdict arc is labelled "observation".');
      expect(section).not.toMatch(/wordsTruth|0\.50|0\.90|\[structural\]/);
    }
    // The automatic pass names the one must-fix list.
    const instructions = build().slice(build().indexOf('WHAT THIS REWORK DOES'));
    expect(instructions).toMatch(/fixes the must-fix items: the ISSUES TO ADDRESS\./);
    expect(instructions).not.toContain('CRITERIA SCORES');
  });

  // The judge names a truth criterion's breach by its rule ids, and an issue can cite a
  // second rule a passing criterion holds: at the gate (092026, the fifth arc
  // evaluation) "T7, T1: ..." sat beside evidenceTruth 0.9, whose fix was the judge's
  // own "Step 3 (optional)" about another line. Brief K: the issue reads both limits' names, and
  // neither criterion's fix prints beside it.
  it('a finding that opens with two codes reads both limits\' names; no criterion it shares a rule with adds a line', () => {
    const section = build({
      validationResults: {
        phase: 'arcs', passed: false,
        structuralIssues: ['T7, T1: the bridge adds an offer the epilogue does not give.'],
        criteriaScores: {
          stagesTruth: { score: 0.6, type: 'structural', notes: 'A breach.', fix: 'FAILING-FIX keep to the epilogue.' },
          evidenceTruth: { score: 0.9, type: 'structural', notes: 'No breach.', fix: 'PASSING-FIX move the turn-ins apart.' }
        }
      }
    });
    expect(section).toContain(`ISSUES TO ADDRESS:\n  - ${nameOf('T7')}, ${nameOf('T1')}: the bridge adds an offer the epilogue does not give.`);
    expect(section).not.toContain('FAILING-FIX');
    expect(section).not.toContain('PASSING-FIX');
    expect(section).not.toMatch(/stagesTruth|evidenceTruth/);
  });

  // The 4b fix batch (3.10 review minor 1): at the outline, "convergence" is a common
  // word in findings (C16), and the passing convergence advisory's notes and suggestion
  // reached the rework whenever an issue used it.
  // Brief K: no criterion prints, so the issue is the one line.
  it('a passing convergence criterion beside an issue that uses the word "convergence" prints nothing; the issue prints once', () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build({
        ...kind,
        phase: 'outline',
        validationResults: {
          phase: 'outline', passed: false,
          structuralIssues: ['T1: the convergence paragraph states the buyer as fact.'],
          criteriaScores: {
            convergence: { score: 0.95, type: 'advisory', notes: 'PASSING-NOTES the threads meet late.', fix: 'PASSING-FIX none needed.' },
            evidenceTruth: { score: 0.4, type: 'structural', notes: 'The buyer as fact.', fix: "FAILING-FIX write it as Nova's suspicion." }
          }
        }
      });
      expect(section).not.toMatch(/convergence: |\[advisory\]|evidenceTruth/);
      expect(section).not.toMatch(/PASSING-(NOTES|FIX)/);
      expect(section).not.toContain('FAILING-FIX');
      expect(count(section, 'the convergence paragraph states the buyer as fact.')).toBe(1);
      expect(section).toContain(`  - ${nameOf('T1')}: the convergence paragraph states the buyer as fact.`);
    }
  });

  // Brief K (R27): an advisory criterion fails nothing, so no line of it prints, and the
  // suggestions a rework may take up are SHOULD CONSIDER's alone, on an automatic pass.
  it("an advisory criterion prints no line; the suggestions are SHOULD CONSIDER's, on an automatic pass only", () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build(kind);
      expect(section).not.toMatch(/ADVISORY-FIX|Bridges disagree|coherence|evidenceConfidenceBalance|suggestion:/);
    }
    const instructions = build().slice(build().indexOf('WHAT THIS REWORK DOES'));
    expect(instructions).toContain(`Take up a SHOULD CONSIDER item ${SCOPE}.`);
    expect(build(SEND_BACK)).not.toContain('SHOULD CONSIDER');
  });

  it('EVALUATOR FEEDBACK is absent on an automatic pass and on a send back', () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build(kind);
      expect(section).not.toContain('EVALUATOR FEEDBACK');
      expect(section).not.toContain('JUDGE-GUIDANCE');
    }
  });

  it('the scope sentence appears once, and no other line gives a suggestion a scope of its own', () => {
    const section = build();
    expect(count(section, SCOPE)).toBe(1);
    expect(count(section, 'Everything else in the previous arcs stays word for word.')).toBe(1);
    expect(section).not.toMatch(/truer to the record|serve the piece|was not questioned|not requirements/);
    expect(section).toContain(`SHOULD CONSIDER:\nThese came from the evaluation that ran before this pass.\n\n  - ${nameOf('T2')}: relabel`);
    // Each part names only lists the context carries. The 4b fix batch: the scope's
    // reason follows it (R23 carries its reason).
    const plain = build({
      validationResults: { phase: 'article', passed: false, structuralIssues: ['A card misquotes its document.'], advisoryWarnings: [] },
      phase: 'article'
    });
    expect(plain.slice(plain.indexOf('WHAT THIS REWORK DOES'))).toMatch(
      new RegExp(`This rework fixes the must-fix items: the ISSUES TO ADDRESS\\. Everything else in the previous article stays word for word\\. ${escapeRegExp(SCOPE_REASON)}\\s*$`)
    );
  });

  // The 4b fix batch (3.10 review minor 3; the plan's rule for model-facing text: each
  // rule once, with its reason). The removed "What the findings do not name was not
  // questioned" was the only reason the old text gave. The reason lets a rework decide
  // the edge case, such as a suggestion that half-touches a line it is fixing.
  it('the scope sentence carries its reason, once, right after it', () => {
    const section = build();
    expect(count(section, SCOPE_REASON)).toBe(1);
    expect(section).toContain(`Everything else in the previous arcs stays word for word. ${SCOPE_REASON}`);
    expect(build(SEND_BACK)).not.toContain(SCOPE_REASON);
  });

  it("the send back keeps its scope: the director's note is the task", () => {
    const section = build(SEND_BACK);
    const instructions = section.slice(section.indexOf('WHAT THIS REWORK DOES'));
    expect(instructions).toMatch(/The director's note above is the task, and it sets how much of the previous arcs this rework keeps/);
    expect(section).not.toContain(SCOPE);
    expect(section).not.toMatch(/serve the piece|not requirements/);
  });

});

/**
 * Phase 3, brief 3.10: the shared context states R23 once, and the rework rules each
 * reworker adds after its writer's system prompt state no scope of their own. Each
 * whole rework (system prompt and user prompt) carries the scope sentence once.
 *
 * Fix round 1: the article rework's system prompt called the automatic task "the
 * evaluation's findings", every finding the context lists, until its first line was
 * pointed at WHAT THIS REWORK DOES, the one section that states the task.
 */
describe('each automatic rework states its scope once, in the revision context (phase 3, 3.10)', () => {
  const { reworkFixtureState } = require('./fixtures/rework-state');
  const { createPromptBuilder } = require('../prompt-builder');
  const {
    _testing: { buildOutlineRevisionPrompt, buildOutlineRevisionSystemPrompt, buildArticleRevisionPrompt, buildArticleRevisionSystemPrompt }
  } = require('../workflow/nodes/ai-nodes');
  const { _testing: { buildArcRevisionPrompt, getArcRevisionSystemPrompt } } = require('../workflow/nodes/arc-specialist-nodes');
  const SCOPE = 'only where it touches a line this rework is already changing for a must-fix item';
  const count = (haystack, needle) => haystack.split(needle).length - 1;
  const verdict = (phase) => ({
    phase, passed: false,
    criteriaScores: { coherence: { score: 0.5, type: 'advisory', notes: 'thin', fix: 'tie the threads' } },
    structuralIssues: ['T12: a misquote.'], advisoryWarnings: ['C10: name who acted.']
  });

  it.each(['arcs', 'outline', 'article'])('the %s rework', async (phase) => {
    const state = reworkFixtureState('journalist');
    const { contextSection, previousOutputSection } = buildRevisionContext({
      phase, revisionCount: 1, validationResults: verdict(phase), previousOutput: {}, humanFeedback: null
    });
    const builder = createPromptBuilder({
      theme: 'journalist', sessionConfig: state.sessionConfig, canonicalCharacters: state.canonicalCharacters,
      characterData: state.characterData.characters
    });
    let whole;
    if (phase === 'arcs') {
      whole = `${getArcRevisionSystemPrompt(null, state.sessionConfig, 'journalist')}\n${buildArcRevisionPrompt(state, contextSection, previousOutputSection)}`;
    } else if (phase === 'outline') {
      whole = `${await buildOutlineRevisionSystemPrompt(builder)}\n${await buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, builder)}`;
    } else {
      whole = `${await buildArticleRevisionSystemPrompt(builder)}\n${await buildArticleRevisionPrompt(state, contextSection, previousOutputSection, builder)}`;
    }
    expect(count(whole, SCOPE)).toBe(1);
    expect(count(whole, 'stays word for word')).toBe(1);
    expect(count(whole, 'WHAT THIS REWORK DOES:')).toBe(1);
    expect(whole).not.toMatch(/this rework answers|truer to the record|serve the piece|was not questioned|evaluation's findings/);
  });
});

/**
 * The 4b fix batch (the integrator's ruling; 3.10 review minor 2): a code check's own
 * findings still reach an automatic rework, under a label that says they are the
 * check's. Only a judge's revisionGuidance is left out of an automatic pass: its
 * must-fix steps repeat ISSUES TO ADDRESS and its optional steps read as instructions.
 *
 * Phase 4 (brief 4.4): the weave checks (validateArcStructure, source "weave-checks")
 * replace the arc check, whose coverage line left the arc stage with roster coverage.
 * Each check's line names the defect and its fix.
 */
describe("a code check's findings reach an automatic rework (the 4b fix batch)", () => {
  const arcNodes = require('../workflow/nodes/arc-specialist-nodes');
  const { reworkFixtureState } = require('./fixtures/rework-state');
  const clone = (v) => JSON.parse(JSON.stringify(v));

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => jest.restoreAllMocks());

  /** The fixture's weave with one piece of evidence naming a document the record does not hold, so a check fails. */
  function stateWithBadReceipt() {
    const state = clone(reworkFixtureState('journalist'));
    state.meetingApproved = false; // the meeting is still open: the checks skip an approved one
    state.weave.threads = state.weave.threads.map((t) => (t.id === 't2'
      ? { ...t, evidence: [{ sources: ['zzz999'], shows: 'A document no record holds.', stance: 'supports' }] }
      : t));
    return state;
  }

  it("an automatic pass after the weave checks carries each check's line, under the checks' label", async () => {
    const state = stateWithBadReceipt();
    const { validationResults } = arcNodes.validateArcStructure(state, {});
    expect(validationResults.source).toBe('weave-checks');
    expect(validationResults.structuralIssues).toHaveLength(1);
    const line = validationResults.structuralIssues[0];
    expect(line).toContain('"zzz999"');
    const { contextSection } = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 1, validationResults, previousOutput: state.weave, humanFeedback: null
    });
    expect(contextSection).toContain(`WEAVE CHECK FAILURES:\n  - ${line}`);
    expect(contextSection).not.toContain('EVALUATOR FEEDBACK');

    // The rework the graph runs next sends it to the model.
    let sent;
    await arcNodes.reviseArcs(
      { ...state, arcRevisionCount: 1, validationResults },
      { configurable: { sdkClient: async (options) => { sent = options; return clone(state.weave); }, theme: 'journalist' } }
    );
    expect(sent.prompt).toContain(`WEAVE CHECK FAILURES:\n  - ${line}`);
  });

  it("an automatic pass after a judge's verdict carries no EVALUATOR FEEDBACK", () => {
    const verdict = {
      phase: 'arcs', passed: false,
      criteriaScores: { rosterCoverage: { score: 0.75, type: 'structural', notes: 'Riley missing.', fix: 'Place Riley.' } },
      structuralIssues: ['rosterCoverage: Riley has no placement.'],
      revisionGuidance: 'JUDGE-GUIDANCE Step 1: place Riley. Step 2 (optional): tighten the bridges.',
      confidence: 'high'
    };
    const { contextSection } = buildRevisionContext({
      phase: 'arcs', revisionCount: 1, validationResults: verdict, previousOutput: [], humanFeedback: null
    });
    expect(contextSection).not.toContain('EVALUATOR FEEDBACK');
    expect(contextSection).not.toContain('JUDGE-GUIDANCE');
    expect(contextSection).not.toContain('WEAVE CHECK FAILURES');
  });

  // Phase 4b (brief 1B): a check's line names the line it is about in the director's words for
  // it, here the name of a thread the director added, whose evidence a rework gave a document the
  // record lacks. The checks read only the writer's text (R11), so the failure is the writer's,
  // and the rework reads it, though it quotes words the director wrote.
  it("a check's line that names a thread by the name the director gave it still reaches the automatic pass", () => {
    const { standingAtMeeting } = require('../hand-edit-diff');
    const state = clone(reworkFixtureState('journalist'));
    const added = { id: 't6', name: 'The second ledger in the back room', line: 'Riley kept a second ledger.' };
    const left = { ...clone(state.weave), threads: [...clone(state.weave).threads, added] };
    const handEdits = standingAtMeeting(null, clone(state.weave), left);
    // A reweave kept the thread and gave it evidence, a piece naming a document the record lacks.
    const rewoven = clone(left);
    rewoven.threads[5].evidence = [{ sources: ['zzz999'], shows: 'A ledger no record holds.', stance: 'supports' }];
    const checked = { ...state, meetingApproved: false, weave: rewoven, _weaveHandEdits: handEdits };
    const { validationResults } = arcNodes.validateArcStructure(checked, {});
    expect(validationResults.structuralIssues).toEqual([expect.stringMatching(/^The thread "The second ledger in the back room": piece 1 names "zzz999"/)]);
    const { contextSection } = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 1, validationResults, previousOutput: rewoven, handEdits, humanFeedback: null
    });
    expect(contextSection).toContain(`WEAVE CHECK FAILURES:\n  - ${validationResults.structuralIssues[0]}`);
  });
});

// FA, requirement 7 (final review, finding 3): a send-back rework reads the verdict the
// stop showed, which no judge wrote with the director's newest edits in view. The
// rework's context leaves out each of that verdict's findings located in the director's
// text: its structural issues and suggestions, the notes and fix of a criterion, and the
// judge's guidance once a step of it was about such a finding.
describe('a rework never reads a finding located in the director\'s text (FA)', () => {
  const { standingAfterSendBack } = require('../hand-edit-diff');
  const CLAIM = 'Alex wanted Marcus out of the company.';
  const WRITERS = 'Sarah pointed the room at the baby mama, and the vote followed.';
  const article = (closing) => ({
    headline: { main: 'The Room Voted' },
    sections: [
      { id: 'story', type: 'narrative', content: [{ type: 'paragraph', text: WRITERS }] },
      { id: 'closing', type: 'narrative', content: [{ type: 'paragraph', text: closing }] }
    ]
  });
  const shown = article(`${CLAIM} The January demand says so.`);
  const sentBack = article(`${CLAIM} Nobody in the room asked why.`);   // the director kept the claim
  const stored = {
    phase: 'article', passed: false,
    structuralIssues: [`T1: "${CLAIM}" states a motive as fact.`, `T12: "${WRITERS}" puts the line in Sarah's mouth.`],
    advisoryWarnings: [`C14: "${CLAIM}" is a stock line.`, 'C10: the lede runs long.'],
    criteriaScores: {
      evidenceTruth: { score: 0.5, type: 'structural', notes: `The closing "${CLAIM}" states a motive.`, fix: 'Rewrite the closing as the room\'s suspicion.' },
      wordsTruth: { score: 0.4, type: 'structural', notes: `"${WRITERS}" is in no document.`, fix: 'Cut the line.' }
    },
    revisionGuidance: 'Step 1: write the closing as the room\'s suspicion. Step 2: cut the line about Sarah.'
  };
  // Brief K (R27): on a send-back the findings follow the note and come before the director's
  // edits, which quote the director's text; the evaluation is that span.
  const evaluationOf = (contextSection) => {
    const end = contextSection.indexOf('<HAND_EDITS>') >= 0 ? contextSection.indexOf('<HAND_EDITS>') : contextSection.indexOf('WHAT THIS REWORK DOES');
    return contextSection.slice(contextSection.indexOf('NOTE: The human reviewer'), end);
  };
  const { LIMIT_CODES } = require('../workflow/nodes/evaluator-nodes');
  const nameOf = (code) => LIMIT_CODES.find((limit) => limit.code === code).name;

  // Brief 4.7c (R1): one context for every theme, so the detective's case went with its branch.
  // Brief K (R27): what is left prints as the must-fix lines alone, each once and named by its
  // limit; a send-back reads no suggestion, no criterion and no guidance.
  it('at a send-back, the stored verdict\'s findings that quote the newly standing edits are left out', () => {
    const standing = standingAfterSendBack(null, shown, sentBack, 'bundle');
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 0, round: 2, validationResults: stored, previousOutput: sentBack,
      humanFeedback: 'Move the photos.', handEdits: standing
    });
    const evaluation = evaluationOf(contextSection);
    expect(evaluation).toContain(`ISSUES TO ADDRESS:\n  - ${nameOf('T12')}: "${WRITERS}" puts the line in Sarah's mouth.`);
    expect(evaluation).not.toContain('Cut the line.');
    expect(evaluation).not.toContain('the lede runs long.');
    expect(evaluation).not.toContain(CLAIM);
    expect(evaluation).not.toContain('Rewrite the closing');
    expect(evaluation).not.toContain('Step 1');
    expect(evaluation).not.toContain('evidenceTruth');
  });

  // FA, requirement 5 at the send-back: a criterion under the rule ids of an issue left
  // out keeps its notes and fix from the rework, quoted or not. Finding 3's case: the
  // stop showed "T1: ... states Alex's motive as fact", the director rewrote the closing
  // and kept the claim, and evidenceTruth's fix said to rewrite the closing. Brief K: when every
  // must-fix line was left out, the failed criteria's fixes are the must-fix lines, and the
  // covered criterion's fix is still not among them.
  it('a criterion under the rule ids of an issue left out keeps its fix from the send-back rework, also as a must-fix line', () => {
    const covered = {
      ...stored,
      structuralIssues: [`T1: "${CLAIM}" states a motive as fact.`],
      criteriaScores: {
        evidenceTruth: { score: 0.5, type: 'structural', notes: 'The closing states a motive as fact.', fix: 'Rewrite the closing as the room\'s suspicion.' },
        wordsTruth: { score: 0.4, type: 'structural', notes: 'A line no document holds.', fix: 'Cut the line.' }
      },
      criteriaRules: { evidenceTruth: ['T1', 'T3', 'T4', 'T6'], wordsTruth: ['T12'] }
    };
    const standing = standingAfterSendBack(null, shown, sentBack, 'bundle');
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 0, round: 2, validationResults: covered, previousOutput: sentBack,
      humanFeedback: 'Move the photos.', handEdits: standing
    });
    const evaluation = evaluationOf(contextSection);
    expect(evaluation).not.toContain('Rewrite the closing');
    expect(evaluation).not.toContain(CLAIM);
    expect(evaluation).toContain('ISSUES TO ADDRESS:\n  - Cut the line.');
  });

  it('with no standing edits the stored verdict reaches the rework as its must-fix lines', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 0, validationResults: stored, previousOutput: shown, humanFeedback: 'Move the photos.', handEdits: null
    });
    expect(evaluationOf(contextSection)).toContain(`  - ${nameOf('T1')}: "${CLAIM}" states a motive as fact.`);
    expect(evaluationOf(contextSection)).toContain(`  - ${nameOf('T12')}: "${WRITERS}" puts the line in Sarah's mouth.`);
    expect(evaluationOf(contextSection)).not.toContain('Step 1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5: the story meeting's rounds (TH7, R23; rulings 1 and 9)
// ═══════════════════════════════════════════════════════════════════════════
//
// A reweave or a send-back is the director's round, marked explicitly: the mark, never the
// note's presence, selects the rework's scope. A reweave fits the director's changes in and
// keeps every line they did not touch; a send-back rethinks the weave as the note asks. A
// director's round reads no finding from before the round. A code check's rework reads the
// check's lines alone (ruling 9).
describe("4.5: the story meeting's rounds in the revision context", () => {
  const { standingAtMeeting, carriedEdits } = require('../hand-edit-diff');
  const { WEAVE } = require('./fixtures/rework-state');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const left = () => {
    const weave = clone(WEAVE);
    weave.threads = weave.threads.map((t) => (t.id === 't3' ? { ...t, line: T3_LINE } : t));
    weave.connections = weave.connections.map((c) => (c.id === 'c2' ? { ...c, line: C2_LINE } : c));
    return weave;
  };
  const T3_LINE = 'Morgan paid Riley at the bar, where no one looked.';
  const C2_LINE = 'The sale and the result came back the same night.';
  const edits = () => carriedEdits(standingAtMeeting(null, WEAVE, left()), left());
  const STALE = { phase: 'arcs', passed: false, structuralIssues: ['T3: "a stale finding" from before the round.'], criteriaScores: { evidenceTruth: { score: 0.3, notes: 'stale', fix: 'stale fix' } } };
  const context = (overrides) => buildRevisionContext({
    phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2, validationResults: STALE,
    previousOutput: left(), handEdits: edits(), ...overrides
  }).contextSection;

  it("a reweave with no note gets the reweave's scope: fit the director's changes in, keep every other line", () => {
    const text = context({ meetingRound: 'reweave', humanFeedback: null, validationResults: null });
    expect(text).toContain("REVISION CONTEXT: WEAVE (round 2: the director's reweave)");
    // Piece 3 (brief 3C, R3): the scope names the angle the director has open, and keeps the rest.
    expect(text).toContain(`The director asked for a reweave at the story meeting of the angle they have open, a1 ("The Room Voted Overdose. The Ledger Kept Talking."). This rework fits the director's changes on that angle and on its threads into it: E1 and E2 in <HAND_EDITS>.`);
    expect(text).toMatch(/keeps every other line word for word/);
    expect(text).not.toContain('This rework fixes the must-fix items');
    expect(text).not.toContain('HUMAN FEEDBACK');
    expect(text).not.toContain('EVALUATION SUMMARY');
    expect(text).not.toContain('(no evaluator feedback');
  });

  it("a reweave's note is part of what it fits in", () => {
    const text = context({ meetingRound: 'reweave', humanFeedback: 'Join the ledger thread to the vote.', validationResults: null });
    expect(text).toContain('HUMAN FEEDBACK (HIGHEST PRIORITY):\nJoin the ledger thread to the vote.');
    expect(text).toContain("E1 and E2 in <HAND_EDITS>, and each change the note above asks for.");
  });

  it("the director's changes are final through a reweave: its <HAND_EDITS> lists them by place, with the meeting's own rule", () => {
    const text = context({ meetingRound: 'reweave', humanFeedback: null, validationResults: null });
    const block = text.slice(text.indexOf('<HAND_EDITS>'), text.indexOf('</HAND_EDITS>'));
    expect(block).toContain("The director's changes to the weave at the story meeting.");
    expect(block).toContain('each thread they brought into an angle stays in it and each they left out of one stays out, each thread they added stays in the weave where they put it, and each removed sentence stays out of it.');
    expect(block).toContain(`E1 (thread "t3", line): "${T3_LINE}"`);
    expect(block).toContain(`E2 (connection "c2", line): "${C2_LINE}"`);
    // R7: the strike went from the weave, and with it every line on a connection struck or brought back.
    expect(block).not.toMatch(/struck|brought back/);
    expect(block).not.toContain('changedDirectorEdits');
    expect(block).not.toMatch(/block they moved|marked moved/);
  });

  it('a send-back rethinks the weave as the note asks, and may change an edit only where the note needs it, saying why', () => {
    const text = context({ meetingRound: 'send-back', humanFeedback: 'Rethink the money thread.', validationResults: null });
    expect(text).toContain("REVISION CONTEXT: WEAVE (round 2: the director's send back)");
    expect(text).toContain("The director's note above is the task, and it sets how much of the previous weave this rework keeps: change what the note asks, as far as it asks, so a note that asks for a rethink gets a rethink. What the note leaves alone stays as it was.");
    expect(text).not.toMatch(/unless an issue to address needs it changed/);
    expect(text).toMatch(/unless the structural change their note asks for means it no longer fits/);
    expect(text).toContain('changedDirectorEdits');
  });

  it('the mark decides, never the note: an automatic pass with a note in the slot keeps the automatic scope', () => {
    const text = context({ meetingRound: null, humanFeedback: 'A note left over.', validationResults: { phase: 'arcs', passed: false, structuralIssues: ['T3: "x y z" breaks a rule.'] } });
    expect(text).toContain('automated pass 0');
    expect(text).toContain('This rework fixes the must-fix items');
    expect(text).not.toContain('HUMAN FEEDBACK');
    expect(text).toContain("This automatic pass fixes the writer's text. Each change of the director's is final:");
  });

  it("a code check's rework reads the check's lines alone: no confidence and no criteria scores (ruling 9)", () => {
    const text = context({
      meetingRound: null, humanFeedback: null, handEdits: null, previousOutput: clone(WEAVE),
      validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, ready: false, structuralPassed: false, structuralIssues: ['Thread "t2" gives the receipt "zzz".'] }
    });
    expect(text).toContain('WEAVE CHECK FAILURES:\n  - Thread "t2" gives the receipt "zzz".');
    ['EVALUATION SUMMARY', 'Confidence', 'Ready:', 'CRITERIA SCORES', 'no criteria scores'].forEach((gone) => expect(`${gone}: ${text.includes(gone)}`).toBe(`${gone}: false`));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Piece 3, final review: the Reweave fits only the open angle's changes
// ═══════════════════════════════════════════════════════════════════════════
//
// <HAND_EDITS> lists every standing edit, the director's edits on other angles from earlier looks
// included. A Reweave works on the open angle (spec 2026-10-06 section 7; R3), so its scope names
// the changes on that angle and on its threads by id, and says the rest stand as they are.
describe("3 final: the Reweave's scope names only the open angle's changes", () => {
  const { standingAtMeeting } = require('../hand-edit-diff');
  const { WEAVE } = require('./fixtures/rework-state');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  // Look 1: the director rewrites angle 2's story and sends it on (E1). Look 2: they open angle 1,
  // leave t4 out of it (E2) and rewrite t1's line (E3); t1 is in angle 1.
  const looks = () => {
    const first = clone(WEAVE);
    first.picked = 'a2';
    first.angles[1].story = 'Angle two, as the director rewrote it at the first look.';
    const atFirst = standingAtMeeting(null, WEAVE, first);
    const second = clone(first);
    second.picked = 'a1';
    second.angles[0].threads = second.angles[0].threads.filter((id) => id !== 't4');
    second.threads[0].line = 'The room settled on an overdose, as the director put it.';
    return { weave: second, handEdits: standingAtMeeting(atFirst, first, second) };
  };
  const scopeOf = (note = null) => {
    const { weave, handEdits } = looks();
    const text = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 3, previousOutput: weave,
      handEdits, humanFeedback: note, meetingRound: 'reweave'
    }).contextSection;
    return text.slice(text.indexOf('WHAT THIS REWORK DOES:'));
  };

  it('fits in the changes on the open angle and on its threads, and says the changes on other angles stand', () => {
    const scope = scopeOf();
    expect(scope).toContain("This rework fits the director's changes on that angle and on its threads into it: E2 and E3 in <HAND_EDITS>.");
    expect(scope).toContain("The director's other changes in <HAND_EDITS>, E1, are on other angles or on threads outside this one, and stand as they are.");
    expect(scope).not.toContain('each change in <HAND_EDITS>');
  });

  it('with a note, fits in the note too', () => {
    expect(scopeOf('Join the ledger to the vote.')).toContain('E2 and E3 in <HAND_EDITS>, and each change the note above asks for.');
  });

  // 3 final, item 2 (spec 2026-10-06 section 7): a Reweave finds evidence for a thread the director
  // added to the open angle, or leaves it with none when the record cannot carry it.
  it('asks for the evidence of a thread the director added to the open angle, and none when the record holds none', () => {
    const { weave, handEdits } = looks();
    weave.threads.push({ id: 't6', name: 'Jess turned in the meeting', line: 'Jess turned in the record of the meeting.' });
    weave.angles[0].threads.push('t6');
    const withAdded = standingAtMeeting(handEdits, WEAVE, weave);
    const text = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 3, previousOutput: weave,
      handEdits: withAdded, humanFeedback: null, meetingRound: 'reweave'
    }).contextSection;
    expect(text).toContain('The director added "Jess turned in the meeting" to this angle: give it as its evidence the pieces of the record that tell it, when the record holds them, and no evidence when it holds none, because the meeting then tells the director the record cannot carry it.');
    expect(scopeOf()).not.toContain('The director added');
  });

  // 3 final, item 3: a send-back's note is read against the angle the director had open ("angle 2,
  // but less about Taylor"), so its scope names that angle as context, and the rethink may still
  // reach any angle.
  it("a send-back's scope names the angle the director had open, as context for the note", () => {
    const { weave, handEdits } = looks();
    weave.picked = 'a2';
    const text = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 3, previousOutput: weave,
      handEdits, humanFeedback: 'Less about Morgan.', meetingRound: 'send-back'
    }).contextSection;
    expect(text).toContain('The director had the angle a2 ("Morgan Paid Riley at the Bar While the Room Argued") open when they sent the weave back, so a note about "this angle" or "the angle" is about that one; the rethink still reaches any angle, as far as the note asks.');
    expect(text).toContain("The director's note above is the task");
  });

  // 3 final, item 4: the weave's automatic passes (the check rework and the fact-check fix) keep
  // every id, since the director's edits and the pick find their elements by it. Stated once, in the
  // automatic pass's scope, and only for the weave.
  it("an automatic pass on the weave keeps every id; the director's rounds and other stops say nothing of ids", () => {
    const { weave, handEdits } = looks();
    const ids = "Every angle, thread, connection and question keeps its id, because the director's edits and pick find them by it.";
    const auto = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 1, previousOutput: weave, handEdits, meetingRound: null,
      validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: ['A thread has no evidence.'] }
    }).contextSection;
    expect(auto.split(ids).length - 1).toBe(1);
    const reweave = buildRevisionContext({ phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 3, previousOutput: weave, handEdits, meetingRound: 'reweave' }).contextSection;
    expect(reweave).not.toContain(ids);
    const article = buildRevisionContext({
      phase: 'article', revisionCount: 1, previousOutput: { headline: 'x', sections: [] }, handEdits: null,
      validationResults: { phase: 'article', passed: false, structuralIssues: ['T1: "x y z" breaks a rule.'] }
    }).contextSection;
    expect(article).not.toContain(ids);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5b: the director's note has one end marker at every stop
// ═══════════════════════════════════════════════════════════════════════════
//
// At the story meeting the note block keeps the line after the director's note, "NOTE: The
// human reviewer has explicitly requested these changes.", and leaves out only the sentence
// about the evaluator's issues, which a director's round never reads (4.5). The line is
// where the director's words end: the removed-phrase scan (lib/__tests__/fixtures/
// removed-phrases.js instructionText) reads it so, and could not read the meeting's
// send-back render without it.
describe("4.5b: the director's note ends on the same line at every stop", () => {
  const { WEAVE } = require('./fixtures/rework-state');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const END = 'NOTE: The human reviewer has explicitly requested these changes.';
  const EVALUATOR = 'Address human feedback FIRST, then address any remaining evaluator issues.';
  const meeting = (meetingRound) => buildRevisionContext({
    phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2, validationResults: null,
    previousOutput: clone(WEAVE), handEdits: null, humanFeedback: 'Rethink the money thread.', meetingRound
  }).contextSection;

  it.each(['send-back', 'reweave'])("at the story meeting, a %s's note is followed by the end line, with a blank line after it, and nothing about the evaluator", (round) => {
    const text = meeting(round);
    expect(text).toContain(`HUMAN FEEDBACK (HIGHEST PRIORITY):\nRethink the money thread.\n\n${END}\n\n`);
    expect(text).not.toContain(EVALUATOR);
  });

  it('the outline and the article keep both lines, as before', () => {
    const text = buildRevisionContext({
      phase: 'outline', revisionCount: 1, validationResults: null, previousOutput: { lede: { hook: 'h' } }, humanFeedback: 'Tighten it.'
    }).contextSection;
    expect(text).toContain(`HUMAN FEEDBACK (HIGHEST PRIORITY):\nTighten it.\n\n${END}\n${EVALUATOR}\n`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6: the map's rework context (brief 4.6)
// ═══════════════════════════════════════════════════════════════════════════
describe("4.6: the map's rework context", () => {
  const { MAP, reworkFixtureState } = require('./fixtures/rework-state');
  const { standingOnMap, MAP_EDIT_LINES_GUIDE } = require('../hand-edit-diff');
  const { _testing: { checkMap } } = require('../workflow/nodes/map-nodes');
  const { reviseOutline } = require('../workflow/nodes/ai-nodes');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  // Task 4.14b, fix round 1: a section the director dropped stays in dropped. Piece 4 (brief
  // 4C; R3): the beats of a section the director ordered stay in their order. Fix A: and in that
  // section, since the order stands only while the section holds every beat it names.
  const MAP_EDITS_FINAL = 'the text they wrote stays exactly as written, each beat and photo they moved stays where they put it, the beats of each section they ordered stay in that section, in the order they set, each beat they added stays, each beat they struck stays in leftOut, each section they dropped stays in dropped, each removed sentence stays out, and the top photo they chose stays the top photo.';

  /** The director's map: b6's line rewritten, and b4 struck. */
  function directorsMap() {
    const left = clone(MAP);
    left.sections[3].beats[0].move = 'Riley keeps the books, and a second ledger';
    left.leftOut.push(left.sections[1].beats.splice(2, 1)[0]);
    return left;
  }
  const handEditsBlock = (contextSection) => contextSection.slice(contextSection.indexOf('<HAND_EDITS>'), contextSection.indexOf('</HAND_EDITS>'));

  it("on a send-back, each of the director's edits is final unless the note needs it changed, and the rework lists what it changed", () => {
    const left = directorsMap();
    const { contextSection } = buildRevisionContext({
      phase: 'outline', outputName: 'map', revisionCount: 1, previousOutput: left,
      handEdits: standingOnMap(null, MAP, left), humanFeedback: 'Lead with the envelope.'
    });
    expect(contextSection).toContain("REVISION CONTEXT: MAP (the director's send back)");
    const block = handEditsBlock(contextSection);
    expect(block).toContain(`The director's edits on the map, by id. ${MAP_EDIT_LINES_GUIDE}`);
    expect(block).toContain(`Each edit of the director's is final unless the structural change their note asks for means it no longer fits: ${MAP_EDITS_FINAL} List each edit this rework changes, removes or brings back in changedDirectorEdits, with its id and one sentence on why.`);
    expect(block).toContain('E1 (section "closing", beat "b6", move): "Riley keeps the books, and a second ledger"\n  removed: "Riley says they only kept the books"');
    expect(block).toContain('E2 (left out, beat "b4", struck from section "theStory")');
  });

  it("on an automatic pass, every edit of the director's stays, and no list is asked for", () => {
    const left = directorsMap();
    const { contextSection } = buildRevisionContext({
      phase: 'outline', outputName: 'map', revisionCount: 1, previousOutput: left,
      handEdits: standingOnMap(null, MAP, left), humanFeedback: null
    });
    const block = handEditsBlock(contextSection);
    expect(block).toContain(`This automatic pass fixes the writer's lines. Each edit of the director's is final: ${MAP_EDITS_FINAL}`);
    expect(block).not.toContain('changedDirectorEdits');
  });

  it("the check's rework reads each failed check's line under the checks' own label, and the rework sends it", async () => {
    const state = reworkFixtureState();
    const failing = clone(MAP);
    failing.sections[3].beats[0].players = [];
    failing.sections[1].beats[1].players = ['Morgan'];
    const { validationResults } = checkMap({ ...state, outline: failing, _mapCheck: null });
    expect(validationResults).toMatchObject({ phase: 'outline', source: 'map-checks', passed: false });
    const [line] = validationResults.structuralIssues;
    expect(line).toBe("Players in no beat: Riley. Place each in a section's beat, or name them among gapNote's players, as \"The people\" in `<job-map>` says.");
    const { contextSection } = buildRevisionContext({
      phase: 'outline', outputName: 'map', revisionCount: 1, previousOutput: failing, validationResults, humanFeedback: null
    });
    expect(contextSection).toContain(`MAP CHECK FAILURES:\n  - ${line}`);
    expect(contextSection).toContain('This rework fixes the must-fix items: the MAP CHECK FAILURES.');
    expect(contextSection).not.toContain('ISSUES TO ADDRESS');
    expect(contextSection).not.toMatch(/uncalibrated|evaluating model|scores below/i);

    let sent;
    await reviseOutline(
      { ...state, outline: null, _previousOutline: failing, outlineRevisionCount: 1, validationResults },
      { configurable: { sdkClient: async (options) => { sent = options; return clone(MAP); }, theme: 'journalist' } }
    );
    expect(sent.prompt).toContain(`MAP CHECK FAILURES:\n  - ${line}`);
    expect(sent.label).toBe('Map revision 1');
  });

  // Fix C5: a pass that renumbers a beat of a column the director ordered has it read as removed,
  // so code does not put the director's order back on it, and the page reports the move as removed
  // (fix C2). The automatic pass's scope says every
  // beat keeps its id, once, as the weave's says of its elements; a send-back's scope, where the
  // note sets what changes, says nothing of ids.
  it("on an automatic pass, every beat keeps its id; a send-back says nothing of ids", () => {
    const ids = "Every beat keeps its id, because the director's edits find each beat by it.";
    const left = directorsMap();
    const auto = buildRevisionContext({
      phase: 'outline', outputName: 'map', revisionCount: 1, previousOutput: left,
      handEdits: standingOnMap(null, MAP, left), humanFeedback: null
    }).contextSection;
    expect(auto.split(ids).length - 1).toBe(1);
    const sendBack = buildRevisionContext({
      phase: 'outline', outputName: 'map', revisionCount: 0, round: 2, previousOutput: left,
      handEdits: standingOnMap(null, MAP, left), humanFeedback: 'Lead with the envelope.'
    }).contextSection;
    expect(sendBack).not.toContain(ids);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6b: the map's rework context names no evaluator
// ═══════════════════════════════════════════════════════════════════════════
//
// No evaluator reads the map (spec 5.4): its rework reads the map checks' lines under their
// own label, or nothing when no check result is in hand (after going back to the map, R9,
// the result is cleared and the checks skip the map they marked). The director's note keeps
// its end marker, the NOTE line, which the removed-phrase scan reads as where the director's
// words end (brief 4.5b).
describe("4.6b: the map's rework context names no evaluator", () => {
  const { MAP, reworkFixtureState } = require('./fixtures/rework-state');
  const { standingOnMap } = require('../hand-edit-diff');
  const { _testing: { checkMap } } = require('../workflow/nodes/map-nodes');
  const { reviseOutline } = require('../workflow/nodes/ai-nodes');
  const { instructionText } = require('./fixtures/removed-phrases');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const NOTE = 'Lead with the envelope.';
  const END = 'NOTE: The human reviewer has explicitly requested these changes.';

  /** The director's map: b6's line rewritten, and b4 struck. */
  function directorsMap() {
    const left = clone(MAP);
    left.sections[3].beats[0].move = 'Riley keeps the books, and a second ledger';
    left.leftOut.push(left.sections[1].beats.splice(2, 1)[0]);
    return left;
  }
  /** The map checks' result on a map with Riley in no beat, as the check node writes it. */
  function failingChecks() {
    const failing = directorsMap();
    failing.sections[3].beats[0].players = [];
    failing.sections[1].beats[1].players = ['Morgan'];
    return { failing, validationResults: checkMap({ ...reworkFixtureState(), outline: failing, _mapCheck: null }).validationResults };
  }
  const context = (options) => buildRevisionContext({ phase: 'outline', outputName: 'map', revisionCount: 0, round: 2, ...options }).contextSection;

  it("a send-back with no check result in hand prints no evaluator line, and the director's note ends on the NOTE line", () => {
    const left = directorsMap();
    const text = context({ previousOutput: left, handEdits: standingOnMap(null, MAP, left), humanFeedback: NOTE, validationResults: null });
    expect(text).not.toMatch(/evaluator/i);
    expect(text).toContain(`REVISION CONTEXT: MAP (round 2: the director's send back)\n═══════════════════════════════════════════════════════════════════════════════\n\nHUMAN FEEDBACK (HIGHEST PRIORITY):\n${NOTE}\n\n${END}\n\n<HAND_EDITS>`);
    expect(instructionText(text)).toContain(`HUMAN FEEDBACK (HIGHEST PRIORITY):\n\n${END}`);
  });

  // Brief K (R27): the director's note comes first, then the check's lines, then the edits.
  it("a send-back after a map check that still fails prints the check's lines under its own label, after the note, and no evaluator line", () => {
    const { failing, validationResults } = failingChecks();
    expect(validationResults).toMatchObject({ phase: 'outline', source: 'map-checks', passed: false });
    const text = context({ previousOutput: failing, handEdits: standingOnMap(null, MAP, failing), humanFeedback: NOTE, validationResults });
    expect(text).not.toMatch(/evaluator/i);
    const lines = validationResults.structuralIssues.map((line) => `  - ${line}`).join('\n');
    expect(text).toContain(`HUMAN FEEDBACK (HIGHEST PRIORITY):\n${NOTE}\n\n${END}\n\nMAP CHECK FAILURES:\n${lines}\n\n<HAND_EDITS>`);
  });

  it('the automatic pass after a failed check prints no evaluator line either', () => {
    const { failing, validationResults } = failingChecks();
    const text = context({ revisionCount: 1, previousOutput: failing, handEdits: standingOnMap(null, MAP, failing), humanFeedback: null, validationResults });
    expect(text).not.toMatch(/evaluator/i);
    expect(text).toContain('MAP CHECK FAILURES:');
  });

  it("the send-back's rework, as reviseOutline sends it, names no evaluator and keeps the NOTE line", async () => {
    const left = directorsMap();
    let sent;
    await reviseOutline(
      {
        ...reworkFixtureState(), outline: null, _previousOutline: left, _outlineHandEdits: standingOnMap(null, MAP, left),
        _outlineFeedback: NOTE, outlineRevisionCount: 0, humanOutlineRevisionCount: 1, validationResults: null
      },
      { configurable: { sdkClient: async (options) => { sent = options; return clone(left); }, theme: 'journalist' } }
    );
    expect(sent.label).toBe('Map revision 0');
    const revision = sent.prompt.slice(sent.prompt.indexOf('REVISION CONTEXT: MAP'), sent.prompt.indexOf('WHAT THIS REWORK DOES'));
    expect(revision).not.toMatch(/evaluator/i);
    expect(revision).toContain(`${NOTE}\n\n${END}\n\n<HAND_EDITS>`);
  });
});

// Brief 4.7c (R1): the parked detective's branch went with the old stages its reworks wrote:
// its PRESERVE lists, its four numbered instructions, its preamble for SHOULD CONSIDER
// (SHOULD_CONSIDER_PREAMBLE) and its previous-output header. One context for every theme,
// so buildRevisionContext takes no theme.
describe('4.7c: one revision context for every theme (R1)', () => {
  const VERDICT = {
    phase: 'outline', passed: false,
    criteriaScores: {
      sectionFlow: { score: 0.4, type: 'structural', notes: 'the money section is missing', fix: 'add it' },
      voice: { score: 0.95, type: 'advisory', notes: 'strong', fix: '' }
    },
    structuralIssues: ['The money section is missing.'],
    advisoryWarnings: ['The closing could name the account.'],
    revisionGuidance: 'Add the money section.',
    confidence: 'medium'
  };

  it.each([['an automatic pass', null], ['a send-back', 'Rethink the closing.']])('%s: a theme in the options changes nothing, and no parked text prints', (name, humanFeedback) => {
    const options = { phase: 'outline', revisionCount: humanFeedback ? 0 : 1, round: 2, validationResults: VERDICT, previousOutput: { lede: {} }, humanFeedback };
    const context = buildRevisionContext(options);
    expect(buildRevisionContext({ ...options, theme: 'detective' })).toEqual(context);
    const text = `${context.contextSection}\n${context.previousOutputSection}`;
    expect(text).not.toMatch(/PRESERVE|CRITICAL REVISION INSTRUCTIONS|need improvement|serve the piece|not requirements|to improve, not regenerate/);
    expect(text).toContain('WHAT THIS REWORK DOES:');
  });

  it('SHOULD CONSIDER says only where its items came from', () => {
    const { contextSection } = buildRevisionContext({ phase: 'outline', revisionCount: 1, validationResults: VERDICT, previousOutput: { lede: {} } });
    expect(contextSection).toContain('SHOULD CONSIDER:\nThese came from the evaluation that ran before this pass.\n\n  - The closing could name the account.');
    expect(require('../prompt-builder')).not.toHaveProperty('SHOULD_CONSIDER_PREAMBLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The meeting's edits-are-final line, in each round's frame
// ═══════════════════════════════════════════════════════════════════════════
//
// Task 4.5d gave the line a connection the director brought back; piece 3 (brief 3C; R7) took
// the strike out of the weave, and the line with it.
describe("the meeting's edits-are-final line, in each round's frame", () => {
  const { standingAtMeeting, carriedEdits } = require('../hand-edit-diff');
  const { WEAVE } = require('./fixtures/rework-state');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const FINAL = "Each change of the director's is final: the text they wrote stays exactly as written, each thread they brought into an angle stays in it and each they left out of one stays out, each thread they added stays in the weave where they put it, and each removed sentence stays out of it.";
  /** The director rewrote t2's line: E1. */
  const left = () => {
    const weave = clone(WEAVE);
    weave.threads[1].line = 'The sale came at the bar, and the room never asked who paid.';
    return weave;
  };
  const edits = () => carriedEdits(standingAtMeeting(null, clone(WEAVE), left()), left());
  const handEdits = (overrides) => {
    const text = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2, validationResults: null,
      previousOutput: left(), handEdits: edits(), theme: 'journalist', humanFeedback: null, meetingRound: null, ...overrides
    }).contextSection;
    return text.slice(text.indexOf('<HAND_EDITS>'), text.indexOf('</HAND_EDITS>'));
  };

  it("an automatic pass fixes the writer's text; a reweave and a send-back keep their own frames", () => {
    expect(handEdits({ meetingRound: null, revisionCount: 1 })).toContain(`This automatic pass fixes the writer's text. ${FINAL}`);
    expect(handEdits({ meetingRound: 'reweave' })).toContain(FINAL);
    expect(handEdits({ meetingRound: 'send-back', humanFeedback: 'Rethink it.' }))
      .toContain(`Each change of the director's is final unless the structural change their note asks for means it no longer fits: ${FINAL.replace("Each change of the director's is final: ", '')} List each change this rework alters, removes or brings back in changedDirectorEdits, with its id and one sentence on why.`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14b: a director's round on the map reads no check failures from before it (the final
// review, ruling 2), as the meeting's does (arc-specialist-nodes.js arcReworkCall). The
// failures were found on the map the stop showed; the director's version may have fixed them,
// and the checks run again on the rework's map.
// ═══════════════════════════════════════════════════════════════════════════
describe("4.14b: a director's round on the map reads no check failures from before it", () => {
  const { MAP, reworkFixtureState } = require('./fixtures/rework-state');
  const { standingOnMap } = require('../hand-edit-diff');
  const { _testing: { checkMap } } = require('../workflow/nodes/map-nodes');
  const { reviseOutline } = require('../workflow/nodes/ai-nodes');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const NOTE = 'Move the money figure into the closing.';

  /** The map the stop opened on, Riley in no beat, and the checks' result on it, still in hand. */
  function openedWithFailure() {
    const failing = clone(MAP);
    failing.sections[1].beats[1].players = ['Morgan'];
    failing.sections[3].beats[0].players = [];
    const { validationResults } = checkMap({ ...reworkFixtureState(), outline: failing, _mapCheck: null });
    expect(validationResults).toMatchObject({ phase: 'outline', source: 'map-checks', passed: false });
    return { failing, validationResults };
  }

  /** The prompt reviseOutline sends from a state over the fixture's. */
  async function promptSent(overrides) {
    let sent;
    await reviseOutline(
      { ...reworkFixtureState(), outline: null, ...overrides },
      { configurable: { sdkClient: async (options) => { sent = options; return clone(overrides._previousOutline); }, theme: 'journalist' } }
    );
    return sent.prompt;
  }

  it("the director places Riley and sends the map back: the rework reads the note and the edits, and no check failure", async () => {
    const { failing, validationResults } = openedWithFailure();
    const left = clone(failing);
    left.sections[3].beats[0].players = ['Riley'];
    const prompt = await promptSent({
      _previousOutline: left, _outlineHandEdits: standingOnMap(null, failing, left), _outlineFeedback: NOTE,
      outlineRevisionCount: 0, humanOutlineRevisionCount: 1, validationResults
    });
    expect(prompt).not.toContain('MAP CHECK FAILURES');
    expect(prompt).not.toContain('Players in no beat');
    expect(prompt).toContain(`HUMAN FEEDBACK (HIGHEST PRIORITY):\n${NOTE}`);
    expect(prompt).toContain('E1 (section "closing", beat "b6", players): "Riley"');
  });

  it('the automatic pass after a failed check still reads its lines', async () => {
    const { failing, validationResults } = openedWithFailure();
    const prompt = await promptSent({ _previousOutline: failing, _outlineFeedback: null, outlineRevisionCount: 1, validationResults });
    expect(prompt).toContain("MAP CHECK FAILURES:\n  - Players in no beat: Riley. Place each in a section's beat, or name them among gapNote's players");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14b, fix round 1: a send-back that empties a section, then an automatic pass that puts it
// back (R11). The rework reads the drop in <HAND_EDITS>, as a section the director dropped, which
// stays in dropped; and code holds the drop by its slot when a pass puts the section back anyway
// (lib/hand-edit-diff.js settleEdits), so the article writer never gets the empty section.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.14b fix round 1: a send-back that empties a section, then an automatic pass that puts it back', () => {
  const { MAP, reworkFixtureState } = require('./fixtures/rework-state');
  const { mapResume } = require('../map');
  const { MAP_EDIT_LINES_GUIDE } = require('../hand-edit-diff');
  const { reviseOutline } = require('../workflow/nodes/ai-nodes');
  const EditLogic = require('../../console/outline-edit-logic');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  /** A map check failure on the send-back rework's map: the writer's, so an automatic pass runs. */
  const FAILED = {
    phase: 'outline', source: 'map-checks', passed: false, ready: false, structuralPassed: false,
    structuralIssues: ["Players in no beat: Riley. Place each in a section's beat, or name them among gapNote's players, as \"The people\" in `<job-map>` says."]
  };

  /** The director strikes b5, Follow the Money's one beat, and sends the map back; the send-back's rework keeps the drop. */
  function sentBack() {
    const state = reworkFixtureState();
    const { error, stateUpdates } = mapResume(
      { outline: 'send-back', map: EditLogic.strikeBeat(clone(MAP), 'b5'), note: 'Tighten the lede.' }, state, { theme: 'journalist' }
    );
    expect(error).toBeNull();
    return { ...state, ...stateUpdates, _outlineFeedback: null, _mapBaseline: clone(stateUpdates.outline) };
  }

  /** The automatic pass, the SDK returning `pass`: the prompt it sent and the state it returned. */
  async function automaticPass(round, pass) {
    let sent;
    const out = await reviseOutline(
      { ...round, outline: null, _previousOutline: clone(round.outline), outlineRevisionCount: 1, validationResults: FAILED },
      { configurable: { sdkClient: async (options) => { sent = options; return clone(pass); }, theme: 'journalist' } }
    );
    return { prompt: sent.prompt, out };
  }

  it('the rework reads the drop as a section the director dropped, which stays in dropped', async () => {
    const round = sentBack();
    const { prompt } = await automaticPass(round, round.outline);
    const block = prompt.slice(prompt.indexOf('<HAND_EDITS>'), prompt.indexOf('</HAND_EDITS>'));
    expect(MAP_EDIT_LINES_GUIDE).toContain('a section they dropped, in two lines (its dropped slot with the reason, and the section marked cut), which is out of the story;');
    expect(block).toContain(`The director's edits on the map, by id. ${MAP_EDIT_LINES_GUIDE}`);
    expect(block).toContain("This automatic pass fixes the writer's lines. Each edit of the director's is final: the text they wrote stays exactly as written, each beat and photo they moved stays where they put it, the beats of each section they ordered stay in that section, in the order they set, each beat they added stays, each beat they struck stays in leftOut, each section they dropped stays in dropped, each removed sentence stays out, and the top photo they chose stays the top photo.");
    expect(block).toContain('E1 (dropped slot "followTheMoney"): slot "followTheMoney"; reason "The director emptied this section on the map."');
    expect(block).toContain('E2 (section "followTheMoney", cut): slot "followTheMoney"; heading "Follow the Money"; job "What the sale paid, and to whom."');
  });

  it("a pass that puts the section back with the struck beat: code stores the map with the section dropped, and approved as shown it stays dropped", async () => {
    const round = sentBack();
    const pass = clone(round.outline);
    pass.sections.splice(2, 0, clone(MAP.sections[2]));
    pass.leftOut = pass.leftOut.filter((b) => b.id !== 'b5');
    pass.dropped = pass.dropped.filter((d) => d.slot !== 'followTheMoney');
    const { out } = await automaticPass(round, pass);
    expect(out.outline.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'closing']);
    expect(out.outline.dropped.map((d) => [d.slot, d.reason])).toEqual([
      ['thePlayers', 'Every player appears above.'], ['whatsMissing', "Its question is the closing's."], ['followTheMoney', EditLogic.EMPTIED_SECTION_REASON]
    ]);
    expect(out._mapBaseline).toEqual(out.outline);
    const atStop = { ...round, outline: out.outline, _mapBaseline: out._mapBaseline, _outlineHandEditReport: out._outlineHandEditReport };
    const approved = mapResume({ outline: 'approve', map: clone(out.outline) }, atStop, { theme: 'journalist' });
    expect(approved.error).toBeNull();
    expect(approved.stateUpdates.outline.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'closing']);
    expect(approved.stateUpdates._outlineHandEdits.edits.map((e) => e.id)).toEqual(['E1', 'E2', 'E3']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 18, run 2b, brief K (R27): a rework is shown findings, not scores
// ═══════════════════════════════════════════════════════════════════════════
//
// The prompt read found the article's send-back stating one finding three times (a criterion's
// fix, the must-fix line, the judge's guidance) in about 400 words, ahead of the director's
// one-line note, beside nine scores, camel-case criterion names and a "Ready: NO" line. A rework
// now reads each finding once: the must-fix lines under ISSUES TO ADDRESS, and on an automatic
// pass the suggestions under SHOULD CONSIDER. A judge's finding reads the limit's name where the
// stored finding holds its code. A director's send-back opens on the note, then the findings, the
// edits and the scope, and leaves the suggestions out. A code check's lines print as before.
describe('brief K: a rework is shown findings, not scores (R27)', () => {
  const { LIMIT_CODES } = require('../workflow/nodes/evaluator-nodes');
  const nameOf = (code) => LIMIT_CODES.find((limit) => limit.code === code).name;
  const count = (haystack, needle) => haystack.split(needle).length - 1;
  const MISQUOTE = 'In whatsMissing, "the office called it preposterous and said Mx. Iyer is recovering" gives Nova\'s own line to the office.';
  const FIX = 'Remove the quotation marks around the recovery line and give it in Nova\'s own voice.';
  /** A stored verdict in the shape the prompt read met: one finding stated three times. */
  const FAILED = {
    phase: 'article',
    passed: false,
    confidence: 'high',
    criteriaScores: {
      evidenceTruth: { score: 0.92, type: 'structural', notes: 'PASSING-NOTES fine.', fix: 'PASSING-FIX nothing.' },
      wordsTruth: { score: 0.7, type: 'structural', notes: 'A line given to the wrong speaker.', fix: FIX }
    },
    criteriaRules: { evidenceTruth: ['T1', 'T3', 'T4', 'T6'], wordsTruth: ['T12'] },
    structuralIssues: [`T12: ${MISQUOTE}`],
    advisoryWarnings: ['Over length: the narrator\'s prose runs 1,859 words.'],
    revisionGuidance: `Step 1: ${FIX}`
  };
  const SCORE_WORDS = ['EVALUATION SUMMARY', 'Confidence', 'Ready:', 'CRITERIA SCORES', 'uncalibrated', 'EVALUATOR FEEDBACK',
    'This evaluation passed', 'evidenceTruth', 'wordsTruth', '[structural]', '0.92', '0.70', 'no criteria scores'];
  const noScores = (text) => SCORE_WORDS.filter((word) => text.includes(word));
  const context = (options) => buildRevisionContext({ phase: 'article', previousOutput: { headline: { main: 'h' } }, ...options }).contextSection;
  const afterBanner = (text) => text.slice(text.indexOf('═\n\n', text.indexOf('REVISION CONTEXT:')) + 3);

  it('an automatic pass after a failed evaluation reads its must-fix lines and its suggestions, each once, and no score', () => {
    const text = context({ revisionCount: 1, validationResults: FAILED, humanFeedback: null });
    expect(noScores(text)).toEqual([]);
    expect(afterBanner(text)).toMatch(new RegExp(`^ISSUES TO ADDRESS:\\n  - ${nameOf('T12')}: In whatsMissing`));
    expect(count(text, MISQUOTE)).toBe(1);
    expect(text).not.toContain(FIX);
    expect(text).not.toContain('PASSING-');
    expect(text).toContain(`ISSUES TO ADDRESS:\n  - ${nameOf('T12')}: ${MISQUOTE}\n\nSHOULD CONSIDER:\nThese came from the evaluation that ran before this pass.\n\n  - Over length: the narrator's prose runs 1,859 words.\n\n═`);
    const scope = text.slice(text.indexOf('WHAT THIS REWORK DOES:'));
    expect(scope).toContain('This rework fixes the must-fix items: the ISSUES TO ADDRESS. Take up a SHOULD CONSIDER item only where it touches a line this rework is already changing for a must-fix item.');
  });

  it('a finding reads the limit\'s name in place of each code it opens with; the stored finding keeps its codes', () => {
    const stored = { phase: 'article', passed: false, structuralIssues: ['T4, T6: the account is named as the exposer\'s.', 'T8: Nova votes.', 'The card misquotes T3 in its text.'] };
    const before = JSON.stringify(stored);
    const text = context({ revisionCount: 1, validationResults: stored, humanFeedback: null });
    expect(text).toContain(`  - ${nameOf('T4')}, ${nameOf('T6')}: the account is named as the exposer's.`);
    expect(text).toContain(`  - ${nameOf('T8')}: Nova votes.`);
    expect(text).toContain('  - The card misquotes T3 in its text.');
    expect(text).not.toMatch(/^ {2}- T\d/m);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it('an evaluation that failed a criterion and lists no must-fix line has the failed criteria\'s fixes as its must-fix lines', () => {
    const stored = {
      phase: 'article', passed: false,
      criteriaScores: {
        antiPatterns: { score: 0.5, type: 'structural', notes: 'NOTES the lede leans on a stock line.', fix: 'Cut the stock line from the lede.' },
        voice: { score: 0.5, type: 'advisory', notes: 'flat', fix: 'ADVISORY-FIX open on a moment.' },
        playersTruth: { score: 0.95, type: 'structural', notes: 'fine', fix: 'PASSING-FIX none.' }
      },
      structuralIssues: [], advisoryWarnings: []
    };
    for (const humanFeedback of [null, 'Tighten the closing.']) {
      const text = context({ revisionCount: humanFeedback ? 0 : 1, validationResults: stored, humanFeedback });
      expect(text).toContain('ISSUES TO ADDRESS:\n  - Cut the stock line from the lede.\n\n');
      expect(noScores(text)).toEqual([]);
      expect(text).not.toMatch(/antiPatterns|voice|playersTruth|0\.50|NOTES|ADVISORY-FIX|PASSING-FIX/);
    }
    expect(context({ revisionCount: 0, validationResults: stored, humanFeedback: 'Tighten the closing.' }))
      .toContain('What the note leaves alone stays as it was, unless an issue to address needs it changed.');
  });

  it("an automatic pass after a code check prints the check's lines as before", () => {
    const checks = { phase: 'arcs', source: 'weave-checks', passed: false, ready: false, structuralPassed: false, structuralIssues: ['Thread "t2" gives the receipt "zzz".'] };
    const text = buildRevisionContext({ phase: 'arcs', outputName: 'weave', revisionCount: 1, validationResults: checks, previousOutput: {}, humanFeedback: null, meetingRound: null }).contextSection;
    expect(afterBanner(text)).toMatch(/^WEAVE CHECK FAILURES:\n {2}- Thread "t2" gives the receipt "zzz"\.\n\n═/);
    expect(text).toContain('This rework fixes the must-fix items: the WEAVE CHECK FAILURES. Everything else in the previous weave stays word for word.');
  });

  it("a send-back after a passed evaluation opens on the director's note and prints no finding", () => {
    const passed = { phase: 'article', passed: true, confidence: 'high', structuralIssues: [], advisoryWarnings: ['A suggestion from the judge.'],
      criteriaScores: { wordsTruth: { score: 0.95, type: 'structural', notes: 'fine', fix: '' } }, revisionGuidance: 'GUIDANCE none.' };
    const text = context({ revisionCount: 0, round: 2, validationResults: passed, humanFeedback: 'Tighten the closing.' });
    expect(afterBanner(text)).toMatch(/^HUMAN FEEDBACK \(HIGHEST PRIORITY\):\nTighten the closing\.\n/);
    expect(noScores(text)).toEqual([]);
    expect(text).not.toMatch(/ISSUES TO ADDRESS|SHOULD CONSIDER|A suggestion from the judge|GUIDANCE|none reported|no evaluator feedback/);
    expect(text).toContain('What the note leaves alone stays as it was.');
    expect(text).not.toContain('unless an issue to address needs it changed');
  });

  it("a send-back with open findings opens on the note, then the findings, the director's edits and the scope, with no suggestion", () => {
    const { standingAfterSendBack } = require('../hand-edit-diff');
    const shown = { headline: { main: 'The Room Voted' }, sections: [] };
    const left = { headline: { main: 'The Room Voted Twice' }, sections: [] };
    const text = context({
      revisionCount: 0, round: 2, validationResults: FAILED, previousOutput: left, humanFeedback: 'Tighten the closing.',
      handEdits: standingAfterSendBack(null, shown, left, 'bundle')
    });
    const at = (needle) => text.indexOf(needle);
    expect(afterBanner(text)).toMatch(/^HUMAN FEEDBACK \(HIGHEST PRIORITY\):\nTighten the closing\.\n\nNOTE: The human reviewer has explicitly requested these changes\.\nAddress human feedback FIRST, then address any remaining evaluator issues\.\n\nISSUES TO ADDRESS:\n/);
    expect(at('ISSUES TO ADDRESS:')).toBeLessThan(at('<HAND_EDITS>'));
    expect(at('</HAND_EDITS>')).toBeLessThan(at('WHAT THIS REWORK DOES:'));
    expect(text).toContain(`ISSUES TO ADDRESS:\n  - ${nameOf('T12')}: ${MISQUOTE}\n\n<HAND_EDITS>`);
    expect(count(text, MISQUOTE)).toBe(1);
    expect(text).not.toContain(FIX);
    expect(text).not.toMatch(/SHOULD CONSIDER|Over length/);
    expect(noScores(text)).toEqual([]);
    expect(text).toContain('What the note leaves alone stays as it was, unless an issue to address needs it changed.');
  });

  it('a stored evaluation of the old shape reaches the rework as its findings alone', () => {
    const legacy = {
      phase: 'arcs',
      criteriaScores: { rosterCoverage: 0.5, coherence: 0.95, accusationArcPresent: { score: 0.4, type: 'structural', notes: 'n', fix: 'Label the verdict arc.' } },
      structuralIssues: ['legacy issue string', { type: 'no-accusation-arc', message: 'No accusation arc present', severity: 'structural' }],
      advisoryWarnings: ['T2: relabel the two candidates.'],
      feedback: 'legacy feedback',
      confidence: 0.9
    };
    for (const humanFeedback of [null, 'Rethink it.']) {
      const text = buildRevisionContext({ phase: 'arcs', revisionCount: 1, validationResults: legacy, previousOutput: [], humanFeedback }).contextSection;
      expect(text).toContain('ISSUES TO ADDRESS:\n  - legacy issue string\n  - No accusation arc present (structural)');
      expect(text).not.toMatch(/legacy feedback|rosterCoverage|coherence|accusationArcPresent|Label the verdict arc|0\.50|90%|\[object Object\]/);
      expect(noScores(text)).toEqual([]);
      if (humanFeedback) expect(text).not.toContain('relabel the two candidates');
      else expect(text).toContain(`  - ${nameOf('T2')}: relabel the two candidates.`);
    }
  });

  it("the story meeting's two rounds and the map's send-back print no evaluation, as before", () => {
    const { WEAVE, MAP } = require('./fixtures/rework-state');
    const clone = (v) => JSON.parse(JSON.stringify(v));
    for (const meetingRound of ['reweave', 'send-back']) {
      const text = buildRevisionContext({
        phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2, validationResults: null, previousOutput: clone(WEAVE),
        handEdits: null, humanFeedback: meetingRound === 'send-back' ? 'Rethink it.' : null, meetingRound
      }).contextSection;
      expect(afterBanner(text)).toMatch(meetingRound === 'send-back' ? /^HUMAN FEEDBACK \(HIGHEST PRIORITY\):\nRethink it\.\n\nNOTE: The human reviewer has explicitly requested these changes\.\n\n═/ : /^═/);
    }
    const map = buildRevisionContext({
      phase: 'outline', outputName: 'map', revisionCount: 0, round: 2, validationResults: null, previousOutput: clone(MAP), humanFeedback: 'Lead with the envelope.'
    }).contextSection;
    expect(afterBanner(map)).toMatch(/^HUMAN FEEDBACK \(HIGHEST PRIORITY\):\nLead with the envelope\.\n\nNOTE: The human reviewer has explicitly requested these changes\.\n\n═/);
  });
});
