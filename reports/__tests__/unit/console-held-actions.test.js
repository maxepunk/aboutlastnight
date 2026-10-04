/**
 * Task 4.14d: input that lands. Nothing the director types is lost by pressing a button: while a
 * stop holds input the director has not saved, its actions wait, and a line beside the buttons
 * names the unsaved piece and says to save or discard it first.
 *
 * The final review reproduced the loss on each screen (screens 1, confirmed major): at the desk,
 * Approve published the writer's text over a block editor left open; on the map, a headline typed
 * in its open editor never reached the payload; at the story meeting, a thread typed in the add
 * line and never added was missing from the approved weave. None of the three screens warned.
 *
 * One pure rule decides for every screen (console/unsaved-input-logic.js unsavedInputLine,
 * node-tested in console/__tests__/unsaved-input-logic.test.js). The console has no DOM harness,
 * so the wiring is pinned here on the component sources, in the style of console-edit-gates.test.js:
 * each component asks the rule once per render for each set of buttons that sends one thing, every
 * path a payload leaves the component by consults the answer before it builds the payload, each
 * action button is held while its answer holds, and the line shows beside the buttons.
 *
 * The desk sends two things, so it asks twice (fix round 1): its Approve and Send back send the
 * bundle on the desk and wait on `held`, which JSON typed in the JSON editor also sets; the JSON
 * editor's Save & Approve sends that JSON and waits on `jsonHeld`.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');
const count = (haystack, needle) => haystack.split(needle).length - 1;

const IMPORT = /^const \{ unsavedInputLine \} = window\.Console\.unsavedInputLogic;$/m;
/** The first statement of a send path held by the answer named `hold`. */
const guard = (hold) => `if (${hold}) return;`;
/** The line that shows the answer named `hold` beside the buttons it holds. */
const line = (hold) => `${hold} && React.createElement('p', { className: 'validation-error', role: 'status' }, ${hold})`;

/** The body of the component's function `name`, from its declaration to the brace that closes it. */
function functionBody(src, name) {
  const start = src.indexOf(`  function ${name}(`);
  if (start === -1) throw new Error(`no function ${name}`);
  return src.slice(start, src.indexOf('\n  }\n', start) + 4);
}

/**
 * Each place a payload leaves the component (a call of onApprove or onReject, as a whole word:
 * the desk's handleJsonApprove holds the letters), with the function the call sits in: its name,
 * and its body up to the call.
 */
function sendingPaths(src) {
  return [...src.matchAll(/\bon(?:Approve|Reject)\(/g)]
    .map((match) => match.index)
    .map((at) => {
      const start = src.lastIndexOf('function ', at);
      const name = /^function (\w*)/.exec(src.slice(start))[1];
      return { name, before: src.slice(start, at) };
    });
}

/** The props object of the button whose props hold `marker`: from its `{` to the brace that closes it. */
function buttonProps(src, marker) {
  const at = src.indexOf(marker);
  if (at === -1) throw new Error(`no button holds ${marker}`);
  const open = src.lastIndexOf("React.createElement('button', {", at) + "React.createElement('button', ".length;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') depth -= 1;
    if (depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`the button holding ${marker} never closes its props`);
}

describe('4.14d: the module loads before the three stops that read it', () => {
  it('index.html loads unsaved-input-logic.js after the view logic, whose action lists it names, and the desk\'s logic, which names a section, and before the meeting, the map and the desk', () => {
    const html = read('index.html');
    const at = (src) => html.indexOf(`src="${src}"`);
    expect(at('unsaved-input-logic.js')).toBeGreaterThan(at('checkpoint-view-logic.js'));
    expect(at('unsaved-input-logic.js')).toBeGreaterThan(at('article-desk-logic.js'));
    ['components/checkpoints/ArcSelection.js', 'components/checkpoints/Outline.js', 'components/checkpoints/Article.js'].forEach((consumer) => {
      expect([consumer, at(consumer) > at('unsaved-input-logic.js')]).toEqual([consumer, true]);
    });
  });
});

// Each send path and each action button is paired with the answer that holds it.
describe.each([
  {
    stop: 'the story meeting',
    rel: 'components/checkpoints/ArcSelection.js',
    asks: ["const held = unsavedInputLine('arc-selection', { addLine: newClaim });"],
    paths: [['send', 'held'], ['send', 'held']],
    payload: 'ViewLogic.meetingPayload(',
    buttons: [['onClick: handleApproveClick', 'held'], ["send('reweave')", 'held'], ['onClick: handleSendBackClick', 'held'], ["aria-label': approveAsk.keep.ariaLabel", 'held'], ["aria-label': approveAsk.clear.ariaLabel", 'held']]
  },
  {
    stop: 'the map',
    rel: 'components/checkpoints/Outline.js',
    asks: ["const held = unsavedInputLine('outline', { editor: editing, adding: adding, sections: view.sections });"],
    paths: [['send', 'held'], ['send', 'held']],
    payload: 'ViewLogic.mapPayload(',
    buttons: [["send('approve')", 'held'], ['onClick: handleSendBackClick', 'held']]
  },
  {
    stop: 'the desk',
    rel: 'components/checkpoints/Article.js',
    asks: ["const held = unsavedInputLine('article', unsaved);", "const jsonHeld = unsavedInputLine('article-json', unsaved);"],
    paths: [['handleApprove', 'held'], ['handleJsonApprove', 'jsonHeld'], ['handleReject', 'held']],
    payload: 'ViewLogic.articleReviewPayload(',
    buttons: [['onClick: handleApprove,', 'held'], ['onClick: handleSendBackClick', 'held'], ['onClick: handleJsonApprove', 'jsonHeld']]
  }
])('4.14d: $stop holds its actions while it has unsaved input', ({ rel, asks, paths, payload, buttons }) => {
  const src = read(rel);

  it('reads the rule at load, from the module, and asks it once per render for each set of buttons that sends one thing', () => {
    expect(src).toMatch(IMPORT);
    expect(count(src, 'unsavedInputLine(')).toBe(asks.length);
    asks.forEach((ask) => expect(src).toContain(ask));
  });

  it('consults the answer that holds it on every path a payload leaves by, before it builds the payload', () => {
    const sending = sendingPaths(src);
    expect(sending.map((p) => p.name)).toEqual(paths.map(([name]) => name));
    sending.forEach(({ name, before }, i) => {
      const GUARD = guard(paths[i][1]);
      expect([name, before.includes(GUARD)]).toEqual([name, true]);
      if (before.includes(payload)) expect([name, before.indexOf(GUARD) < before.indexOf(payload)]).toEqual([name, true]);
    });
  });

  it('holds each action button while its answer holds', () => {
    buttons.forEach(([marker, hold]) => {
      expect([marker, new RegExp(`disabled: !!${hold}\\b`).test(buttonProps(src, marker))]).toEqual([marker, true]);
    });
  });

  it('shows the line beside the buttons, after the action row', () => {
    expect(count(src, line('held'))).toBe(1);
    expect(src.indexOf(line('held'))).toBeGreaterThan(src.indexOf("className: 'action-modes mt-md'"));
  });
});

describe('4.14d: at the desk, the JSON editor', () => {
  const src = read('components/checkpoints/Article.js');

  it('shows its own answer\'s line inside the JSON editor, after its Save & Approve', () => {
    const json = src.slice(src.indexOf("mode === 'json' && React.createElement("));
    const panel = json.slice(0, json.indexOf('// Folded below the article'));
    expect(count(src, line('jsonHeld'))).toBe(1);
    expect(panel.indexOf(line('jsonHeld'))).toBeGreaterThan(panel.indexOf("'Save & Approve'"));
  });

  it('tells both asks, while it is open, what it holds and the text it opened with (fix round 1, finding 2)', () => {
    expect(src).toContain("json: mode === 'json' ? { text: jsonText, seed: jsonSeed } : null");
  });

  it('keeps the text it opens with as its seed, which tells JSON the director typed from the desk\'s own', () => {
    const body = functionBody(src, 'handleModeChange');
    expect(body).toContain('setJsonText(seed);');
    expect(body).toContain('setJsonSeed(seed);');
  });
});
