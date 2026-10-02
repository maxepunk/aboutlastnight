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

  it('names no criterion to preserve for the journalist (phase 3, 3.3; TH7); the detective keeps the list', () => {
    // After a pass every criterion scores 0.8 or more, so the list outranked the
    // director's note; with one of nine players missing (0.89) it told the reworker to
    // keep rosterCoverage directly above the issue naming the missing player (V3).
    expect(build()).not.toContain('PRESERVE THESE');
    expect(build({ theme: 'detective' })).toContain('PRESERVE THESE: coherence');
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
    // Phase 3 (3.3): the journalist's instructions are one paragraph with no fixed
    // "preserve" text; the detective keeps the four numbered lines, with no gap.
    expect(section).toContain('WHAT THIS REWORK DOES:');
    expect(section).not.toContain('CRITICAL REVISION INSTRUCTIONS');
    const parked = build({ theme: 'detective' });
    const instructions = parked.slice(parked.indexOf('CRITICAL REVISION INSTRUCTIONS'));
    expect(instructions).toContain('1. PRESERVE EVERYTHING');
    expect(instructions).toContain('3. Output the complete revised article');
    expect(instructions).toContain('4. Maintain consistency');
    expect(instructions).not.toContain('5.');
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
    // model was free to emit whatever shape; nothing downstream could read it.
    const schema = _testing.EVALUATION_JSON_SCHEMA;
    expect(schema.properties.criteriaScores.additionalProperties).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['score'],
        properties: expect.objectContaining({
          score: { type: 'number' },
          type: expect.objectContaining({ type: 'string' }),
          notes: expect.objectContaining({ type: 'string' }),
          fix: expect.objectContaining({ type: 'string' })
        })
      })
    );
    expect(schema.properties.structuralIssues.items).toEqual({ type: 'string' });
    expect(schema.properties.advisoryWarnings.items).toEqual({ type: 'string' });
  });
});

describe('<HAND_EDITS> block (spec 2026-09-19 §4.3)', () => {
  const { diffOutline } = require('../hand-edit-diff');
  const diff = diffOutline({ lede: { hook: 'Old' } }, { lede: { hook: 'New' } });
  const base = { phase: 'outline', revisionCount: 1, validationResults: null, previousOutput: { lede: { hook: 'New' } } };

  it('sits after HUMAN FEEDBACK and before the instructions (WHAT THIS REWORK DOES since phase 3)', () => {
    const { contextSection, previousOutputSection } = buildRevisionContext({ ...base, humanFeedback: 'Tighten it', handEdits: diff });
    const hf = contextSection.indexOf('HUMAN FEEDBACK');
    const he = contextSection.indexOf('<HAND_EDITS>');
    const cr = contextSection.indexOf('WHAT THIS REWORK DOES');
    expect(hf).toBeGreaterThan(-1);
    expect(he).toBeGreaterThan(hf);
    expect(cr).toBeGreaterThan(he);
    expect(contextSection).toContain('- lede.hook: was "Old" -> now "New"');
    // The block text wraps that sentence across a line (spec 4.3), so compare reflowed.
    expect(contextSection.replace(/\s+/g, ' ')).toContain("The evaluator's notes above were written before these edits.");
    expect(contextSection).toContain('</HAND_EDITS>');
    expect(previousOutputSection).not.toContain('HAND_EDITS');
  });

  it('is present even without human feedback (an evaluator-driven second pass)', () => {
    const { contextSection } = buildRevisionContext({ ...base, humanFeedback: null, handEdits: diff });
    expect(contextSection).toContain('<HAND_EDITS>');
    expect(contextSection.indexOf('<HAND_EDITS>')).toBeLessThan(contextSection.indexOf('WHAT THIS REWORK DOES'));
    expect(contextSection.indexOf('WHAT THIS REWORK DOES')).toBeGreaterThan(-1);
  });

  it('is absent when handEdits is null, empty or missing', () => {
    expect(buildRevisionContext({ ...base, handEdits: null }).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext({ ...base, handEdits: diffOutline({}, {}) }).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext(base).contextSection).not.toContain('HAND_EDITS');
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

  // Post-merge fix (3.3 review, finding 1): the arc check computes rosterCoverage and
  // accusationArcPresent in code (validateArcStructure, source 'programmatic-validation').
  // The context called them "the evaluating model's own and uncalibrated" too, right
  // above "rosterCoverage: 0.75". Only a model evaluation's scores are the model's.
  it("labels the arc check's code-computed scores as the check's, never as the evaluating model's", () => {
    const ARC_CHECK = {
      phase: 'arcs',
      ready: false,
      structuralPassed: false,
      issues: [{ type: 'missing-roster-coverage', message: 'Missing roster members: Alex', severity: 'structural' }],
      revisionGuidance: 'Place Alex in an arc.',
      criteriaScores: { rosterCoverage: 0.75, accusationArcPresent: 1.0 },
      source: 'programmatic-validation'
    };
    for (const humanFeedback of [null, 'Merge the two money arcs.']) {
      const { contextSection } = buildRevisionContext({
        phase: 'arcs', revisionCount: 1, validationResults: ARC_CHECK, previousOutput: [], humanFeedback
      });
      expect(contextSection).not.toMatch(/uncalibrated|evaluating model/i);
      const guide = contextSection.slice(contextSection.indexOf('EVALUATION SUMMARY:'), contextSection.indexOf('CRITERIA SCORES:'));
      expect(guide).toMatch(/The scores below are the arc check's, computed in code from the arcs\./);
      expect(contextSection).toContain('  - rosterCoverage: 0.75\n  - accusationArcPresent: 1.00');
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

  it('the detective keeps the parked text (D13)', () => {
    const { contextSection, previousOutputSection } = build({ theme: 'detective', humanFeedback: 'x' });
    expect(contextSection).toContain('These aspects are working well, PRESERVE THESE: voice');
    expect(contextSection).toContain('These aspects need improvement: sectionFlow, lede');
    expect(contextSection).toContain("1. PRESERVE EVERYTHING THAT'S WORKING - Do NOT regenerate from scratch");
    expect(contextSection).toContain('      fix: open on a moment');
    expect(contextSection).not.toMatch(/uncalibrated/i);
    expect(previousOutputSection).toContain('PREVIOUS OUTLINE OUTPUT (to improve, not regenerate):');
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
  const crypto = require('crypto');
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

  it("a failing criterion's fix is present as must-fix: scored below the bar, or named in the structural issues", () => {
    for (const kind of [AUTOMATIC, SEND_BACK]) {
      const section = build(kind);
      expect(criterionLines(section, 'wordsTruth')).toBe('  - wordsTruth: 0.50 [structural]\n      notes: A misquote.\n      fix: FAILING-FIX give the text to its speaker.');
      // Scored above the bar, but a structural issue names it: it failed.
      expect(criterionLines(section, 'accusationArcPresent')).toBe('  - accusationArcPresent: 0.90 [structural]\n      notes: NAMED-NOTES mislabelled.\n      fix: NAMED-FIX label the verdict arc.');
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
    // Each part names only lists the context carries.
    const plain = build({
      validationResults: { phase: 'article', passed: false, structuralIssues: ['A card misquotes its document.'], advisoryWarnings: [] },
      phase: 'article'
    });
    expect(plain.slice(plain.indexOf('WHAT THIS REWORK DOES'))).toMatch(
      /This rework fixes the must-fix items: the ISSUES TO ADDRESS\. Everything else in the previous article stays word for word\.\s*$/
    );
  });

  it("the send back keeps its scope: the director's note is the task", () => {
    const section = build(SEND_BACK);
    const instructions = section.slice(section.indexOf('WHAT THIS REWORK DOES'));
    expect(instructions).toMatch(/The director's note above is the task, and it sets how much of the previous arcs this rework keeps/);
    expect(section).not.toContain(SCOPE);
    expect(section).not.toMatch(/serve the piece|not requirements/);
  });

  // The detective is parked (D13): its context is byte for byte what it was at 51d2b95,
  // for this verdict, on an automatic pass and on a send back.
  it("the detective's context is unchanged (D13)", () => {
    const pinned = {
      automatic: ['ea305fae85cac5b59ed479bca84632a8e64e1118471c182fe007a7a4b01072d5', 2176],
      'send-back': ['d70f97a6cdff541df564b3c6907526f6779651b1a6837d191f993d020bedd846', 2395]
    };
    const DETECTIVE_EVALUATION = {
      phase: 'arcs', passed: false,
      criteriaScores: {
        rosterCoverage: { score: 1, type: 'structural', notes: 'All placed.', fix: 'None needed.' },
        verdictTruth: { score: 0.88, type: 'structural', notes: 'Two framing risks.', fix: 'Relabel the two candidates.' },
        wordsTruth: { score: 0.5, type: 'structural', notes: 'A misquote.', fix: 'Give the text to its speaker.' },
        coherence: { score: 0.7, type: 'advisory', notes: 'Bridges disagree.', fix: 'Align the bridges.' },
        evidenceConfidenceBalance: { score: 1, type: 'advisory', notes: 'Balanced.', fix: 'None needed.' }
      },
      structuralIssues: ['T12: the text is given to the wrong speaker.'],
      advisoryWarnings: ['T2: relabel the two candidates.'],
      revisionGuidance: 'Step 1: give the text to its speaker. Step 2 (optional): relabel the candidates.',
      confidence: 'high'
    };
    for (const [name, humanFeedback] of [['automatic', null], ['send-back', 'Rethink the money thread.']]) {
      const { contextSection, previousOutputSection } = buildRevisionContext({
        phase: 'arcs', revisionCount: humanFeedback ? 0 : 1, round: 2, validationResults: DETECTIVE_EVALUATION,
        previousOutput: [{ id: 'arc-1' }], humanFeedback, theme: 'detective'
      });
      const text = `${contextSection}\n=====\n${previousOutputSection}`;
      const hash = crypto.createHash('sha256').update(text).digest('hex');
      expect(`${name} ${text.length} ${hash}`).toBe(`${name} ${pinned[name][1]} ${pinned[name][0]}`);
    }
  });
});

/**
 * Phase 3, brief 3.10: the shared context states R23 once, and the rework rules each
 * reworker adds after its writer's system prompt state no scope of their own. Each
 * whole rework (system prompt and user prompt) carries the scope sentence once.
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
      whole = `${getArcRevisionSystemPrompt(false, state.sessionConfig, 'journalist')}\n${buildArcRevisionPrompt(state, contextSection, previousOutputSection)}`;
    } else if (phase === 'outline') {
      whole = `${await buildOutlineRevisionSystemPrompt(builder)}\n${await buildOutlineRevisionPrompt(state, contextSection, previousOutputSection, builder)}`;
    } else {
      whole = `${await buildArticleRevisionSystemPrompt(builder)}\n${await buildArticleRevisionPrompt(state, contextSection, previousOutputSection, builder)}`;
    }
    expect(count(whole, SCOPE)).toBe(1);
    expect(count(whole, 'stays word for word')).toBe(1);
    expect(whole).not.toMatch(/this rework answers|truer to the record|serve the piece|was not questioned/);
  });
});
