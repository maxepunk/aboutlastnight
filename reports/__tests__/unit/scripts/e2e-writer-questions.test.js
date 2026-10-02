/**
 * The harness prints the writer's questions in step mode (phase 3, brief 3.7).
 *
 * Source-level pins, as e2e-trace.test.js: the harness runs main() on require. The
 * panel's logic is pinned in console/__tests__/checkpoint-view-logic.test.js, and the
 * harness prints from that same module.
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

describe('e2e-walkthrough prints the writer\'s questions', () => {
  it('prints them through writerQuestionsView, with the stop\'s hint (task 3.11)', () => {
    const fn = body('function displayWriterQuestions(');
    expect(fn).toMatch(/^function displayWriterQuestions\(questions, stop\)/);
    expect(fn).toMatch(/ViewLogic\.writerQuestionsView\(questions, stop\)/);
    expect(fn).toMatch(/if \(!view\.any\) return;/);
    expect(fn).toMatch(/item\.about/);
    expect(fn).toMatch(/item\.question/);
    expect(fn).toMatch(/view\.hint/);
    // Fix 3.7b (finding 1): the kind, when the question has one, before the subject.
    expect(fn).toMatch(/item\.kindLabel \? `\[\$\{item\.kindLabel\}\] ` : ''/);
  });

  it.each(['arc-selection', 'outline', 'article'])('step mode prints them at the %s stop, naming the stop', (stop) => {
    const fn = body('function displayCheckpointData(');
    const at = fn.indexOf(`case '${stop}':`);
    expect(at).toBeGreaterThan(-1);
    const nextCase = fn.indexOf('\n    case ', at + 1);
    const caseBody = fn.slice(at, nextCase === -1 ? undefined : nextCase);
    expect(caseBody).toMatch(/displayWriterQuestions\(checkpoint\.writerQuestions, checkpointType\)/);
  });
});
