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
      'await-full-context',
      'input-review',
      'pre-curation',
      'evidence-and-photos',
      'arc-selection',
      'photos',
      'character-ids',
      'outline',
      'article'
    ]);
  });

  it('covers every checkpoint type the graph can pause at, exactly once', () => {
    expect(CHECKPOINT_ORDER.slice().sort()).toEqual(Object.values(CHECKPOINT_TYPES).sort());
    expect(new Set(CHECKPOINT_ORDER).size).toBe(CHECKPOINT_ORDER.length);
  });

  it('matches the forward addEdge chain in lib/workflow/graph.js', () => {
    // Derived from the graph.js forward addEdge chain. The checkpoint NODES, in the
    // order this list claims, must appear as a forward chain. input-review is reached
    // via parseRawInput (checkpointAwaitContext -> parseRawInput ->
    // checkpointInputReview, B2), so parseRawInput stands in for it here: its outgoing
    // addEdge is the one that leads to the input-review interrupt.
    const graphSrc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'lib', 'workflow', 'graph.js'), 'utf8'
    );
    const chain = [
      'checkpointPaperEvidence',      // paper-evidence-selection
      'checkpointAwaitRoster',        // await-roster
      'checkpointAwaitContext',       // await-full-context
      'parseRawInput',                // -> checkpointInputReview (input-review interrupt)
      'checkpointPreCuration',        // pre-curation
      'checkpointEvidenceAndPhotos',  // evidence-and-photos
      // arc-selection is reached by a CONDITIONAL edge (builder.branches), asserted
      // in __tests__/unit/workflow/graph-routing.test.js. The photo branch hangs off
      // its forward leg, so its two gates come last in graph.js source order.
      'checkpointPhotos',             // photos
      'checkpointCharacterIds'        // character-ids
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
    // session-start-logic: app.js reads decideAttachFallback + completedResultFrom,
    // SessionStart.js reads isValidSessionId / classifyCheckpointResponse /
    // buildReportLinks / completedResultFrom.
    expect(at('app.js')).toBeGreaterThan(at('session-start-logic.js'));
    // api.js still precedes every component that destructures window.Console.api.
    expect(at('components/SessionStart.js')).toBeGreaterThan(at('api.js'));
    expect(at('app.js')).toBeGreaterThan(at('api.js'));

    // checkpoint-view-logic: FIVE load-time consumers. Each of these does
    // `const ViewLogic = window.Console.checkpointViewLogic;` at load, so a later
    // tag means every field read on that gate throws on first render.
    [
      'components/checkpoints/InputReview.js',
      'components/checkpoints/AwaitFullContext.js',
      'components/checkpoints/ArcSelection.js',
      'components/checkpoints/Outline.js',
      'components/checkpoints/Article.js'
    ].forEach((consumer) => {
      expect(at(consumer)).toBeGreaterThan(at('checkpoint-view-logic.js'));
    });

    // RevisionDiff: three load-time destructures of `window.Console.RevisionDiff`.
    // It USED to load after ArcSelection.js, so on that one screen the name was
    // undefined and the revision banner, the budget badge and the director's own
    // last feedback could not render at all (R5 F10 observed exactly that, live).
    [
      'components/checkpoints/ArcSelection.js',
      'components/checkpoints/Outline.js',
      'components/checkpoints/Article.js'
    ].forEach((consumer) => {
      expect(at(consumer)).toBeGreaterThan(at('components/RevisionDiff.js'));
    });

    // outline-edit-logic: Outline.js and Article.js alias it at module scope.
    expect(at('components/checkpoints/Outline.js')).toBeGreaterThan(at('outline-edit-logic.js'));
    expect(at('components/checkpoints/Article.js')).toBeGreaterThan(at('outline-edit-logic.js'));
  });

  it('every load-time window.Console destructure in a console script is satisfied by the tag order', () => {
    // The generalisation of the test above: rather than listing the pairs we happen
    // to know about, read every `window.Console.<name>` / `= window.Console;`
    // destructure that runs at MODULE SCOPE and check the provider's tag comes
    // first. This is what catches the NEXT file added out of order.
    const html = fs.readFileSync(path.join(CONSOLE_DIR, 'index.html'), 'utf8');
    const tags = [...html.matchAll(/<script type="text\/babel" src="([^"]+)"><\/script>/g)]
      .map((m) => m[1]);

    // name on window.Console -> the script that assigns it
    const providers = {};
    tags.forEach((src) => {
      const code = fs.readFileSync(path.join(CONSOLE_DIR, src), 'utf8');
      const assigns = [...code.matchAll(/window\.Console\.([A-Za-z_$][\w$]*)\s*=/g)];
      assigns.forEach((m) => {
        if (!(m[1] in providers)) providers[m[1]] = src;
      });
    });

    const problems = [];
    tags.forEach((src, i) => {
      const code = fs.readFileSync(path.join(CONSOLE_DIR, src), 'utf8');
      // Module-scope lines only: a destructure or read that is NOT indented.
      const moduleScope = code.split('\n').filter((line) => /^(const|let|var)\s/.test(line));
      moduleScope.forEach((line) => {
        // `window.Console.foo` and `{ A, B } = window.Console`
        const direct = [...line.matchAll(/window\.Console\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
        const bag = line.includes('= window.Console;')
          ? (line.match(/\{([^}]*)\}/) || [null, ''])[1]
              .split(',')
              .map((n) => n.split(':')[0].trim())
              .filter(Boolean)
          : [];
        [...direct, ...bag].forEach((name) => {
          const provider = providers[name];
          // `window.Console.checkpoints = window.Console.checkpoints || {}` and the
          // guarded self-registration in the dual-export modules are not reads.
          if (!provider || provider === src) return;
          if (tags.indexOf(provider) > i) {
            problems.push(`${src} reads window.Console.${name} at load but ${provider} loads later`);
          }
        });
      });
    });

    expect(problems).toEqual([]);
  });

  it('labels every step it orders', () => {
    const utilsSrc = fs.readFileSync(path.join(CONSOLE_DIR, 'utils.js'), 'utf8');
    CHECKPOINT_ORDER.forEach((type) => {
      expect(utilsSrc).toContain(`'${type}':`);
    });
  });
});
