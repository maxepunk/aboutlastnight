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

  it('carries the evaluator revision guidance', () => {
    expect(build()).toContain('g');
  });

  it('prints a string confidence verbatim instead of NaN%', () => {
    const section = build();
    expect(section).toContain('high');
    expect(section).not.toContain('NaN');
  });

  it('still handles the legacy numeric criteriaScores shape', () => {
    const section = build({
      validationResults: {
        phase: 'arcs',
        criteriaScores: { rosterCoverage: 0.5, coherence: 0.95 },
        issues: ['legacy issue string'],
        feedback: 'legacy feedback',
        confidence: 0.9
      }
    });
    expect(section).toContain('rosterCoverage: 0.50');
    expect(section).toContain('coherence: 0.95');
    expect(section).toContain('legacy issue string');
    expect(section).toContain('legacy feedback');
    expect(section).not.toContain('[object Object]');
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
    const { contextSection } = buildRevisionContext({
      phase: 'outline',
      revisionCount: 1,
      validationResults: { criteriaScores: { arcCoverage: 0.4 }, feedback: 'thread the arcs' },
      previousOutput: {}
    });
    expect(contextSection).toContain('arcCoverage: 0.40');
    expect(contextSection).toContain('thread the arcs');
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
    expect(section).toContain('SHOULD CONSIDER:');
    expect(section).toContain('They are not requirements.');
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
    expect(instructions).toMatch(/ISSUES TO ADDRESS/);
    expect(instructions).toMatch(/suggestions/);
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
  // automatic pass's WHAT THIS REWORK DOES said both again, with the reason.
  it('on an automated pass, states once that ISSUES TO ADDRESS are must-fix and an [advisory] criterion a suggestion', () => {
    const { contextSection } = build({ humanFeedback: null });
    expect(contextSection.match(/must-fix/g)).toHaveLength(1);
    expect(contextSection.match(/marked \[advisory\]/g)).toHaveLength(1);
    const instructions = contextSection.slice(contextSection.indexOf('WHAT THIS REWORK DOES'));
    expect(instructions).toMatch(/The ISSUES TO ADDRESS are must-fix\./);
    expect(instructions).toMatch(/criteria marked \[advisory\] are suggestions: take one up where/);
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
