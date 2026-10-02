/**
 * The harness's side of the trace (phase 2, brief 2.7).
 *
 * The harness runs main() on require and prompts on stdin, so it has no unit seam:
 * these are source-level pins, in the style of e2e-photos-handler.test.js. The panel's
 * logic itself is pinned in console/__tests__/checkpoint-view-logic.test.js, and the
 * harness renders from that same module rather than from a copy.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8'
);

function body(signature) {
  const block = SRC.slice(SRC.indexOf(signature));
  return block.slice(0, block.indexOf('\n}\n'));
}

describe('e2e-walkthrough renders the trace', () => {
  it('reads the console view logic module rather than a copy of it', () => {
    expect(SRC).toMatch(/const ViewLogic = require\('\.\.\/console\/checkpoint-view-logic'\);/);
  });

  // Final review (reworks[0]): the view labels the evaluation's guidance by whether the
  // rework was given it, which depends on the theme, so the harness passes the theme it
  // runs with, as the console passes the stop's.
  it('renders the passes through traceView, with the theme the run uses', () => {
    const fn = body('function displayTrace(');
    expect(fn).toMatch(/ViewLogic\.traceView\(trace, THEME\)/);
    expect(fn).toMatch(/pass\.triggerLabel/);
    expect(fn).toMatch(/pass\.mustFix/);
    expect(fn).toMatch(/pass\.shouldConsider/);
    expect(fn).toMatch(/pass\.changed\.text/);
  });

  it.each([
    ['outline', 'async function handleOutline('],
    ['article', 'async function handleArticle(']
  ])('the %s stop shows the trace and reads its evaluation from the right place', (phase, signature) => {
    const fn = body(signature);
    expect(fn).toMatch(/displayTrace\(checkpoint\.trace\)/);
    // evaluationHistory is an array mixing all three phases, and the server never
    // sends `escalated`: both reads are gone.
    expect(fn).not.toMatch(/checkpoint\.evaluationHistory/);
    expect(fn).not.toMatch(/checkpoint\.escalated/);
    expect(fn).toMatch(new RegExp(`ViewLogic\\.lastEvaluationFrom\\(checkpoint, '${phase}'\\)`));
    expect(fn).toMatch(/escalatedToHuman === true/);
  });
});
