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

  it('renders each criterion score, its notes and its fix', () => {
    const section = build();
    expect(section).toContain('rosterCoverage: 0.50');
    expect(section).toContain('Quinn missing');
    expect(section).toContain('add Quinn');
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

  // Phase 3 (3.10): the judge's guidance reaches a send back only. On an automatic pass
  // its must-fix steps repeat ISSUES TO ADDRESS and its optional steps read as
  // instructions (the integrator's ruling), so it is left out there.
  it('carries the evaluator revision guidance on a send back, and leaves it out of an automatic pass', () => {
    const guided = { ...ARC_EVALUATION, revisionGuidance: 'Step 1: place Quinn.' };
    expect(build({ validationResults: guided, humanFeedback: 'Rethink it.' })).toContain('EVALUATOR FEEDBACK:\nStep 1: place Quinn.');
    expect(build({ validationResults: guided })).not.toContain('Step 1: place Quinn.');
  });

  it('prints a string confidence verbatim instead of NaN%', () => {
    const section = build();
    expect(section).toContain('high');
    expect(section).not.toContain('NaN');
  });

  it('still handles the legacy numeric criteriaScores shape', () => {
    const legacy = {
      phase: 'arcs',
      criteriaScores: { rosterCoverage: 0.5, coherence: 0.95 },
      issues: ['legacy issue string'],
      feedback: 'legacy feedback',
      confidence: 0.9
    };
    const section = build({ validationResults: legacy });
    expect(section).toContain('rosterCoverage: 0.50');
    expect(section).toContain('coherence: 0.95');
    expect(section).toContain('legacy issue string');
    expect(section).not.toContain('[object Object]');
    // Phase 3 (3.10): the legacy feedback is the EVALUATOR FEEDBACK block, which only a
    // send back carries.
    expect(section).not.toContain('legacy feedback');
    expect(build({ validationResults: legacy, humanFeedback: 'Rethink it.' })).toContain('legacy feedback');
  });

  it('formats object-shaped issues by message (validateArcStructure shape)', () => {
    const section = build({
      validationResults: {
        phase: 'arcs',
        issues: [{ type: 'no-accusation-arc', message: 'No accusation arc present', severity: 'structural' }],
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
    expect(contextSection).toContain('rosterCoverage');
  });

  it('keeps an UNSTAMPED block (legacy writers) for whichever phase is revising', () => {
    const unstamped = { criteriaScores: { arcCoverage: 0.4 }, feedback: 'thread the arcs' };
    const { contextSection } = buildRevisionContext({
      phase: 'outline',
      revisionCount: 1,
      validationResults: unstamped,
      previousOutput: {}
    });
    expect(contextSection).toContain('arcCoverage: 0.40');
    // Phase 3 (3.10): its feedback is EVALUATOR FEEDBACK, which only a send back carries.
    const sentBack = buildRevisionContext({
      phase: 'outline', revisionCount: 0, validationResults: unstamped, previousOutput: {}, humanFeedback: 'x'
    }).contextSection;
    expect(sentBack).toContain('arcCoverage: 0.40');
    expect(sentBack).toContain('thread the arcs');
  });

  it('says so plainly when there is no evaluator feedback at all', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'article',
      revisionCount: 1,
      validationResults: null,
      previousOutput: {},
      humanFeedback: 'tighten the closing'
    });
    expect(contextSection).toContain('(no evaluator feedback for this phase)');
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

  it('reads `passed`, the field the evaluator writes, not the `ready` nobody writes', () => {
    expect(build()).toContain('Ready: YES');
    expect(build()).not.toContain('Ready: NO');
  });

  it('still says NO when the evaluation failed', () => {
    const section = build({
      validationResults: { ...PASSED, passed: false, structuralIssues: ['card "T-1" misquotes its source'] }
    });
    expect(section).toContain('Ready: NO (must address issues)');
  });

  it('names the send-back as the reason for a rework the evaluation passed', () => {
    const section = build({ humanFeedback: 'Rethink the closing.' });
    expect(section).toContain('Ready: YES');
    // The line wraps, so compare reflowed (as the <HAND_EDITS> cases below do).
    expect(section.replace(/\s+/g, ' '))
      .toContain('This evaluation passed. The director sent the work back anyway; their note below is the reason for this rework.');
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

  it('still reports the pass when the evaluation had nothing else to say', () => {
    // A clean evaluation writes empty lists and no guidance. That is an answer, not
    // an absence — and it is exactly the state a send-back after a pass lands in.
    const section = build({
      validationResults: { phase: 'article', passed: true, structuralIssues: [], advisoryWarnings: [] },
      humanFeedback: 'Rethink the closing.'
    });
    expect(section).toContain('Ready: YES');
    expect(section).not.toContain('(no evaluator feedback for this phase)');
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
describe('<HAND_EDITS> block (spec 2026-09-19 §4.3; F1)', () => {
  const { diffOutline, standingAfterSendBack } = require('../hand-edit-diff');
  let standing;
  beforeAll(() => {
    standing = standingAfterSendBack(null, { lede: { hook: 'Old' }, closing: { finalLine: 'The ledger never lies.' } }, { lede: { hook: 'New' }, closing: {} }, 'outline');
  });
  const base = { phase: 'outline', revisionCount: 1, validationResults: null, previousOutput: { lede: { hook: 'New' }, closing: {} } };
  const SEND_BACK_RULE = "An edit is the final word on its text, so the text the director wrote stays exactly as written, each block they moved stays where they put it, and each cut and each removed sentence stays out, unless the structural change the director's note asks for means it no longer fits. List each edit this rework changes, removes or brings back in changedDirectorEdits, with its id and one sentence on why.";
  const AUTOMATIC_RULE = "This automatic pass fixes the writer's text, in a block the director moved too. An edit is the final word on its text, so the text the director wrote stays exactly as written, each block they moved stays where they put it, and each cut and each removed sentence stays out.";

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
    for (const humanFeedback of [null, 'Move the photos apart.']) {
      const { contextSection } = buildRevisionContext({
        phase: 'article', revisionCount: 1, previousOutput: article(1), humanFeedback,
        handEdits: standingAfterSendBack(null, article(0), article(1), 'bundle'),
        validationResults: { phase: 'article', passed: false, criteriaScores: {}, structuralIssues: [issue], advisoryWarnings: [], revisionGuidance: '' }
      });
      const block = contextSection.slice(contextSection.indexOf('<HAND_EDITS>'), contextSection.indexOf('</HAND_EDITS>'));
      expect(block).toContain('E1 (section "closing", paragraph, moved from section "the-story"): begins "Riley watched the ledger all morning and said…"');
      expect(block).toContain('A line marked moved names a block the director moved to that place without changing it: the place is the director\'s, and the block\'s text is still the writer\'s.');
      expect(contextSection.slice(0, contextSection.indexOf('<HAND_EDITS>'))).toContain(issue);
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
    // Phase 3 (3.10; R23): the must-fix items, then the suggestions by name.
    expect(instructions).toMatch(/fixes the must-fix items: the ISSUES TO ADDRESS/);
    expect(instructions).toMatch(/a SHOULD CONSIDER item or a suggestion in CRITERIA SCORES/);
  });

  it('gives an advisory criterion that scored low as a suggestion, never as a fix or as needing improvement', () => {
    const { contextSection } = build();
    expect(contextSection).not.toMatch(/need(s)? improvement/i);
    expect(contextSection).toMatch(/- lede: 0\.50 \[advisory\]\n {6}notes: flat opening\n {6}suggestion: open on a moment/);
    expect(contextSection).not.toContain('fix: open on a moment');
    // A structural criterion keeps its fix.
    expect(contextSection).toMatch(/- sectionFlow: 0\.40 \[structural\]\n {6}notes: the money section is missing\n {6}fix: add it/);
  });

  it('tells the reworker the scores are uncalibrated', () => {
    const { contextSection } = build();
    expect(contextSection).toMatch(/uncalibrated/i);
    expect(contextSection.indexOf('uncalibrated')).toBeLessThan(contextSection.indexOf('CRITERIA SCORES:'));
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

  it('says nothing about scores when the findings carry none (the fact check before the model)', () => {
    const FACT_CHECK = {
      phase: 'article',
      passed: false,
      structuralIssues: ['Evidence card "ale003" quotes text its document does not hold.'],
      advisoryWarnings: [],
      feedback: 'Evidence card "ale003" quotes text its document does not hold.'
    };
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 1, validationResults: FACT_CHECK, previousOutput: {}
    });
    expect(contextSection).not.toMatch(/uncalibrated|evaluating model|scores below/i);
    expect(contextSection).toMatch(/Ready: NO \(must address issues\)\n\nCRITERIA SCORES:\n {2}\(no criteria scores available\)/);
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
    expect(instructions.match(/Take up a SHOULD CONSIDER item or a suggestion in CRITERIA SCORES/g)).toHaveLength(1);
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
  /** One criterion's lines in CRITERIA SCORES: its score line and any lines under it. */
  const criterionLines = (section, name) => {
    const scores = section.slice(section.indexOf('CRITERIA SCORES:'), section.indexOf('ISSUES TO ADDRESS:'));
    const at = scores.indexOf(`  - ${name}: `);
    const next = scores.indexOf('\n  - ', at + 1);
    return scores.slice(at, next < 0 ? scores.length : next).trimEnd();
  };
  const SCOPE = 'only where it touches a line this rework is already changing for a must-fix item';
  /** R23's reason (the 4b fix batch), as WHAT THIS REWORK DOES gives it on an automatic pass. */
  const SCOPE_REASON = 'Those lines passed the check or evaluation that ran before this pass, and in past reworks the new errors that reached the director were in lines rewritten with no finding behind them.';
  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  it('the bar is one constant: node-helpers.js exports it and the evaluator imports it', () => {
    expect(STRUCTURAL_PASS_SCORE).toBe(0.8);
    const evaluator = fs.readFileSync(path.join(__dirname, '..', 'workflow', 'nodes', 'evaluator-nodes.js'), 'utf8');
    expect(evaluator).not.toMatch(/const STRUCTURAL_PASS_SCORE\s*=/);
    expect(evaluator).toMatch(/\bSTRUCTURAL_PASS_SCORE\b[^}]*\}\s*=\s*require\('\.\/node-helpers'\)/);
    // The context reads the same bar: a criterion at the bar passes, one just under it fails.
    const atBar = (score) => build({
      validationResults: { phase: 'arcs', passed: false, structuralIssues: [], criteriaScores: { verdictTruth: { score, type: 'structural', fix: 'BAR-FIX' } } }
    });
    expect(atBar(STRUCTURAL_PASS_SCORE)).not.toContain('BAR-FIX');
    expect(atBar(STRUCTURAL_PASS_SCORE - 0.01)).toContain('      fix: BAR-FIX');
  });

  it("a passing structural criterion's fix is absent from the automatic and the send-back context: it prints its score alone", () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build(kind);
      expect(section).not.toContain('PASSING-FIX');
      expect(section).not.toContain('PASSING-NOTES');
      expect(criterionLines(section, 'verdictTruth')).toBe('  - verdictTruth: 0.88 [structural]');
      expect(criterionLines(section, 'playersTruth')).toBe('  - playersTruth: 0.92 [structural]');
      expect(criterionLines(section, 'rosterCoverage')).toBe('  - rosterCoverage: 1.00 [structural]');
    }
  });

  // The 4b fix batch (the integrator's ruling; 3.10 review minor 1): a criterion failed
  // only when it scored below the bar. "Named in the structural issues" went: it matched
  // a key as a whole word anywhere in an issue, so a plain-English key (convergence,
  // coherence) read as failing whenever an issue used the word. A judge that scores a
  // criterion as passing but lists its breach has the breach in ISSUES TO ADDRESS, with
  // its own fix, so nothing is lost.
  it("a failing criterion's fix is present as must-fix: scored below the bar; a criterion an issue names but scored at or above the bar prints its score alone", () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build(kind);
      expect(criterionLines(section, 'wordsTruth')).toBe('  - wordsTruth: 0.50 [structural]\n      notes: A misquote.\n      fix: FAILING-FIX give the text to its speaker.');
      // Scored above the bar: it passed, whatever the issues say. The issue that names
      // it is in ISSUES TO ADDRESS.
      expect(criterionLines(section, 'accusationArcPresent')).toBe('  - accusationArcPresent: 0.90 [structural]');
      expect(section).not.toContain('NAMED-FIX');
      expect(section).toContain('  - accusationArcPresent: the verdict arc is labelled "observation".');
    }
    // The automatic pass names its fix lines among the must-fix items.
    const instructions = build().slice(build().indexOf('WHAT THIS REWORK DOES'));
    expect(instructions).toMatch(/fixes the must-fix items: the ISSUES TO ADDRESS and the fixes in CRITERIA SCORES\./);
  });

  // The judge names a truth criterion's breach by its rule ids, and an issue can cite a
  // second rule a passing criterion holds: at the gate (092026, the fifth arc
  // evaluation) "T7, T1: ..." sat beside evidenceTruth 0.9, whose fix was the judge's
  // own "Step 3 (optional)" about another line. A criterion is named by its key.
  it('a rule id in an issue names no criterion: a passing criterion it shares a rule with prints its score alone', () => {
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
    expect(section).toContain('fix: FAILING-FIX keep to the epilogue.');
    expect(section).not.toContain('PASSING-FIX');
    expect(criterionLines(section, 'evidenceTruth')).toBe('  - evidenceTruth: 0.90 [structural]');
  });

  // The 4b fix batch (3.10 review minor 1): at the outline, "convergence" is a common
  // word in findings (C16), and the passing convergence advisory's notes and suggestion
  // reached the rework whenever an issue used it.
  it('a passing convergence criterion beside an issue that uses the word "convergence" prints its score alone', () => {
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
      expect(criterionLines(section, 'convergence')).toBe('  - convergence: 0.95 [advisory]');
      expect(section).not.toMatch(/PASSING-(NOTES|FIX)/);
      expect(section).toContain("      fix: FAILING-FIX write it as Nova's suspicion.");
    }
  });

  it("an advisory criterion's line is a suggestion; a passing one prints its score alone", () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build(kind);
      expect(criterionLines(section, 'coherence')).toBe('  - coherence: 0.70 [advisory]\n      notes: Bridges disagree.\n      suggestion: ADVISORY-FIX align the bridges.');
      expect(section).not.toContain('fix: ADVISORY-FIX');
      expect(criterionLines(section, 'evidenceConfidenceBalance')).toBe('  - evidenceConfidenceBalance: 1.00 [advisory]');
    }
    const instructions = build().slice(build().indexOf('WHAT THIS REWORK DOES'));
    expect(instructions).toContain(`Take up a SHOULD CONSIDER item or a suggestion in CRITERIA SCORES ${SCOPE}.`);
  });

  it('EVALUATOR FEEDBACK is absent on an automatic pass, and the send back keeps it', () => {
    const automatic = build();
    expect(automatic).not.toContain('EVALUATOR FEEDBACK');
    expect(automatic).not.toContain('JUDGE-GUIDANCE');
    expect(build(SEND_BACK)).toContain(`EVALUATOR FEEDBACK:\n${EVALUATION.revisionGuidance}`);
  });

  it('the scope sentence appears once, and no other line gives a suggestion a scope of its own', () => {
    const section = build();
    expect(count(section, SCOPE)).toBe(1);
    expect(count(section, 'Everything else in the previous arcs stays word for word.')).toBe(1);
    expect(section).not.toMatch(/truer to the record|serve the piece|was not questioned|not requirements/);
    expect(section).toContain('SHOULD CONSIDER:\nThese came from the evaluation that ran before this pass.\n\n  - T2: relabel');
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

  /** The fixture's weave with one receipt the record does not hold, so a check fails. */
  function stateWithBadReceipt() {
    const state = clone(reworkFixtureState('journalist'));
    state.meetingApproved = false; // the meeting is still open: the checks skip an approved one
    state.weave.threads = state.weave.threads.map((t) => (t.id === 't2' ? { ...t, receipt: 'zzz999' } : t));
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
  const evaluationOf = (contextSection) => contextSection.slice(contextSection.indexOf('EVALUATION SUMMARY'), contextSection.indexOf('HUMAN FEEDBACK'));

  // Brief 4.7c (R1): one context for every theme, so the detective's case went with its branch.
  it('at a send-back, the stored verdict\'s findings that quote the newly standing edits are left out', () => {
    const standing = standingAfterSendBack(null, shown, sentBack, 'bundle');
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 0, round: 2, validationResults: stored, previousOutput: sentBack,
      humanFeedback: 'Move the photos.', handEdits: standing
    });
    const evaluation = evaluationOf(contextSection);
    expect(evaluation).toContain(`T12: "${WRITERS}" puts the line in Sarah's mouth.`);
    expect(evaluation).toContain('fix: Cut the line.');
    expect(evaluation).toContain('C10: the lede runs long.');
    expect(evaluation).not.toContain(CLAIM);
    expect(evaluation).not.toContain('Rewrite the closing');
    expect(evaluation).not.toContain('Step 1');
    expect(evaluation).toContain('evidenceTruth: 0.50 [structural]');
  });

  // FA, requirement 5 at the send-back: a criterion under the rule ids of an issue left
  // out keeps its notes and fix from the rework, quoted or not. Finding 3's case: the
  // stop showed "T1: ... states Alex's motive as fact", the director rewrote the closing
  // and kept the claim, and evidenceTruth's fix said to rewrite the closing.
  it('a criterion under the rule ids of an issue left out keeps its notes and fix from the send-back rework', () => {
    const covered = {
      ...stored,
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
    expect(evaluation).toContain('evidenceTruth: 0.50 [structural]');
    expect(evaluation).toContain('fix: Cut the line.');
  });

  it('with no standing edits the stored verdict reaches the rework as it is', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 0, validationResults: stored, previousOutput: shown, humanFeedback: 'Move the photos.', handEdits: null
    });
    expect(evaluationOf(contextSection)).toContain(`T1: "${CLAIM}" states a motive as fact.`);
    expect(evaluationOf(contextSection)).toContain('Step 1');
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
    weave.threads = weave.threads.map((t) => (t.id === 't3' ? { ...t, role: 'mirrors-it' } : t));
    weave.connections = weave.connections.map((c) => (c.id === 'c2' ? { ...c, struck: true } : c));
    return weave;
  };
  const edits = () => carriedEdits(standingAtMeeting(null, WEAVE, left()), left());
  const STALE = { phase: 'arcs', passed: false, structuralIssues: ['T3: "a stale finding" from before the round.'], criteriaScores: { evidenceTruth: { score: 0.3, notes: 'stale', fix: 'stale fix' } } };
  const context = (overrides) => buildRevisionContext({
    phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2, validationResults: STALE,
    previousOutput: left(), handEdits: edits(), ...overrides
  }).contextSection;

  it("a reweave with no note gets the reweave's scope: fit the director's changes in, keep every other line", () => {
    const text = context({ meetingRound: 'reweave', humanFeedback: null, validationResults: null });
    expect(text).toContain("REVISION CONTEXT: WEAVE (round 2: the director's reweave)");
    expect(text).toContain("The director asked for a reweave at the story meeting. This rework fits the director's changes into the weave: each change in <HAND_EDITS>.");
    expect(text).toMatch(/keeps every other line word for word/);
    expect(text).not.toContain('This rework fixes the must-fix items');
    expect(text).not.toContain('HUMAN FEEDBACK');
    expect(text).not.toContain('EVALUATION SUMMARY');
    expect(text).not.toContain('(no evaluator feedback');
  });

  it("a reweave's note is part of what it fits in", () => {
    const text = context({ meetingRound: 'reweave', humanFeedback: 'Join the ledger thread to the vote.', validationResults: null });
    expect(text).toContain('HUMAN FEEDBACK (HIGHEST PRIORITY):\nJoin the ledger thread to the vote.');
    expect(text).toContain("each change in <HAND_EDITS>, and each change the note above asks for.");
  });

  it("the director's changes are final through a reweave: its <HAND_EDITS> lists them by place, with the meeting's own rule", () => {
    const text = context({ meetingRound: 'reweave', humanFeedback: null, validationResults: null });
    const block = text.slice(text.indexOf('<HAND_EDITS>'), text.indexOf('</HAND_EDITS>'));
    expect(block).toContain("The director's changes to the weave at the story meeting.");
    expect(block).toContain('each role they gave stays, each thread they added stays in the weave, and each connection they struck and each removed sentence stay out of it.');
    expect(block).toContain('E1 (thread "t3", role): "mirrors-it"');
    expect(block).toMatch(/E2 \(connection "c2", struck\): kind "moment"/);
    expect(block).not.toContain('changedDirectorEdits');
    expect(block).not.toMatch(/block they moved|marked moved/);
  });

  it('the previous weave prints as the rework reads it: the struck connection out, the strike listed in <HAND_EDITS>', () => {
    const { previousOutputSection } = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 2, validationResults: null,
      previousOutput: left(), handEdits: edits(), meetingRound: 'reweave', humanFeedback: null
    });
    expect(previousOutputSection).toContain('"c1"');
    expect(previousOutputSection).not.toContain('"c2"');
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
    expect(text).toContain('This automatic pass fixes the writer\'s text.');
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
  const MAP_EDITS_FINAL = 'the text they wrote stays exactly as written, each beat and photo they moved stays where they put it, each beat they added stays, each beat they struck stays in leftOut, each removed sentence stays out, and the top photo they chose stays the top photo.';

  /** The director's map: b6's line rewritten, and b4 struck. */
  function directorsMap() {
    const left = clone(MAP);
    left.sections[3].beats[0].material = 'Riley: "I kept the books, and the second ledger"';
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
    expect(block).toContain('E1 (section "closing", beat "b6", material): "Riley: "I kept the books, and the second ledger""\n  removed: "Riley: "I only kept the books""');
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
    expect(line).toBe("Players in no beat: Riley. Place each in a section's beat, or name them among gapNote's players, as C7 (`<craft-material>`) sets out.");
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
    left.sections[3].beats[0].material = 'Riley: "I kept the books, and the second ledger"';
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

  it("a send-back after a map check that still fails prints the check's lines under its own label, and no evaluator line", () => {
    const { failing, validationResults } = failingChecks();
    expect(validationResults).toMatchObject({ phase: 'outline', source: 'map-checks', passed: false });
    const text = context({ previousOutput: failing, handEdits: standingOnMap(null, MAP, failing), humanFeedback: NOTE, validationResults });
    expect(text).not.toMatch(/evaluator/i);
    const lines = validationResults.structuralIssues.map((line) => `  - ${line}`).join('\n');
    expect(text).toContain(`MAP CHECK FAILURES:\n${lines}\n\nHUMAN FEEDBACK (HIGHEST PRIORITY):\n${NOTE}\n\n${END}\n\n<HAND_EDITS>`);
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
