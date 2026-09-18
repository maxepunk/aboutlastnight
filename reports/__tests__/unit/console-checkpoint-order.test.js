/**
 * CHECKPOINT_ORDER is the console stepper's model of the pipeline (H3).
 *
 * It had drifted out of graph order — `input-review` sat first while the graph
 * reaches it fifth — so the stepper reported the wrong position for the whole run
 * and PipelineProgress offered the wrong rollback targets (every step before the
 * real one looked already done, every step after looked unreachable).
 *
 * The list lives in console/session-start-logic.js rather than console/utils.js
 * because utils.js touches `window` at load and cannot be required in node-env.
 */
const fs = require('fs');
const path = require('path');

const { CHECKPOINT_ORDER } = require('../../console/session-start-logic');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');

describe('CHECKPOINT_ORDER', () => {
  it('is the order the graph actually interrupts in', () => {
    expect(CHECKPOINT_ORDER).toEqual([
      'paper-evidence-selection',
      'await-roster',
      'character-ids',
      'await-full-context',
      'input-review',
      'pre-curation',
      'evidence-and-photos',
      'arc-selection',
      'outline',
      'article'
    ]);
  });

  it('covers every checkpoint type the graph can pause at, exactly once', () => {
    expect(CHECKPOINT_ORDER.slice().sort()).toEqual(Object.values(CHECKPOINT_TYPES).sort());
    expect(new Set(CHECKPOINT_ORDER).size).toBe(CHECKPOINT_ORDER.length);
  });

  it('matches the forward addEdge chain in lib/workflow/graph.js', () => {
    // Derived from graph.js:539-568. The checkpoint NODES, in the order this list
    // claims, must appear as a forward chain; input-review is hosted inside
    // parseRawInput, which the graph reaches from checkpointAwaitContext.
    const graphSrc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'lib', 'workflow', 'graph.js'), 'utf8'
    );
    const chain = [
      'checkpointPaperEvidence',      // paper-evidence-selection
      'checkpointAwaitRoster',        // await-roster
      'checkpointCharacterIds',       // character-ids
      'checkpointAwaitContext',       // await-full-context
      'parseRawInput',                // input-review (interrupt lives in this node)
      'checkpointPreCuration',        // pre-curation
      'checkpointEvidenceAndPhotos'   // evidence-and-photos
    ];
    const positions = chain.map((node) => graphSrc.indexOf(`builder.addEdge('${node}'`));
    chain.forEach((node, i) => {
      if (positions[i] < 0) throw new Error(`graph.js has no outgoing addEdge for ${node}`);
    });
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('is published to the stepper by utils.js rather than copied there', () => {
    // utils.js cannot be required (top-level `window`), so assert on its source.
    const utilsSrc = fs.readFileSync(path.join(CONSOLE_DIR, 'utils.js'), 'utf8');
    expect(utilsSrc).toMatch(
      /const CHECKPOINT_ORDER = window\.Console\.sessionStartLogic\.CHECKPOINT_ORDER;/
    );
    expect(utilsSrc).not.toMatch(/CHECKPOINT_ORDER = \[/);
  });

  it('has its module loaded before utils.js in index.html', () => {
    // utils.js reads window.Console.sessionStartLogic at load time, so a later
    // script tag would leave the stepper with an undefined order.
    const html = fs.readFileSync(path.join(CONSOLE_DIR, 'index.html'), 'utf8');
    const logicAt = html.indexOf('src="session-start-logic.js"');
    const utilsAt = html.indexOf('src="utils.js"');
    const sessionStartAt = html.indexOf('src="components/SessionStart.js"');
    expect(logicAt).toBeGreaterThan(-1);
    expect(utilsAt).toBeGreaterThan(logicAt);
    expect(sessionStartAt).toBeGreaterThan(logicAt);
  });

  it('loads every pure logic module before the file that destructures it', () => {
    // These are load-time destructures, not lazy lookups: a wrong order yields
    // `undefined` at load and a blank page, which no other test would catch (the
    // console has no DOM harness).
    const html = fs.readFileSync(path.join(CONSOLE_DIR, 'index.html'), 'utf8');
    const at = (src) => html.indexOf(`src="${src}"`);
    // llm-stream-logic: state.js delegates its reducer transitions, api.js uses
    // closeOnThrow, app.js uses the two message formatters.
    expect(at('state.js')).toBeGreaterThan(at('llm-stream-logic.js'));
    expect(at('api.js')).toBeGreaterThan(at('llm-stream-logic.js'));
    expect(at('app.js')).toBeGreaterThan(at('llm-stream-logic.js'));
    // session-status-logic: state.js SET_ERROR / CLEAR_ERROR.
    expect(at('state.js')).toBeGreaterThan(at('session-status-logic.js'));
    // session-start-logic: app.js reads decideAttachFallback + buildReportLinks.
    expect(at('app.js')).toBeGreaterThan(at('session-start-logic.js'));
    // api.js still precedes every component that destructures window.Console.api.
    expect(at('components/SessionStart.js')).toBeGreaterThan(at('api.js'));
    expect(at('app.js')).toBeGreaterThan(at('api.js'));
  });

  it('labels every step it orders', () => {
    const utilsSrc = fs.readFileSync(path.join(CONSOLE_DIR, 'utils.js'), 'utf8');
    CHECKPOINT_ORDER.forEach((type) => {
      expect(utilsSrc).toContain(`'${type}':`);
    });
  });
});
