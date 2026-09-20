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

  it('names the high-scoring criteria to preserve', () => {
    expect(build()).toContain('PRESERVE THESE: coherence');
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
    // The four surviving instructions are renumbered with no gap.
    const instructions = section.slice(section.indexOf('CRITICAL REVISION INSTRUCTIONS'));
    expect(instructions).toContain('1. PRESERVE EVERYTHING');
    expect(instructions).toContain('3. Output the complete revised article');
    expect(instructions).toContain('4. Maintain consistency');
    expect(instructions).not.toContain('5.');
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

  it('sits after HUMAN FEEDBACK and before CRITICAL REVISION INSTRUCTIONS', () => {
    const { contextSection, previousOutputSection } = buildRevisionContext({ ...base, humanFeedback: 'Tighten it', handEdits: diff });
    const hf = contextSection.indexOf('HUMAN FEEDBACK');
    const he = contextSection.indexOf('<HAND_EDITS>');
    const cr = contextSection.indexOf('CRITICAL REVISION INSTRUCTIONS');
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
    expect(contextSection.indexOf('<HAND_EDITS>')).toBeLessThan(contextSection.indexOf('CRITICAL REVISION INSTRUCTIONS'));
  });

  it('is absent when handEdits is null, empty or missing', () => {
    expect(buildRevisionContext({ ...base, handEdits: null }).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext({ ...base, handEdits: diffOutline({}, {}) }).contextSection).not.toContain('HAND_EDITS');
    expect(buildRevisionContext(base).contextSection).not.toContain('HAND_EDITS');
  });
});
