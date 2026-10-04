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
 * each component asks the rule once per render, every path a payload leaves the component by
 * consults the answer before it builds the payload, each action button is held while there is an
 * answer, and the line shows beside the buttons.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');
const count = (haystack, needle) => haystack.split(needle).length - 1;

const IMPORT = /^const \{ unsavedInputLine \} = window\.Console\.unsavedInputLogic;$/m;
const GUARD = 'if (held) return;';
const LINE = "held && React.createElement('p', { className: 'validation-error', role: 'status' }, held)";

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

describe.each([
  {
    stop: 'the story meeting',
    rel: 'components/checkpoints/ArcSelection.js',
    ask: "const held = unsavedInputLine('arc-selection', { addLine: newClaim });",
    paths: ['send', 'send'],
    payload: 'ViewLogic.meetingPayload(',
    buttons: ['onClick: handleApproveClick', "send('reweave')", 'onClick: handleSendBackClick', "aria-label': approveAsk.keep.ariaLabel", "aria-label': approveAsk.clear.ariaLabel"],
    lines: 1
  },
  {
    stop: 'the map',
    rel: 'components/checkpoints/Outline.js',
    ask: "const held = unsavedInputLine('outline', { editor: editing, adding: adding, sections: view.sections });",
    paths: ['send', 'send'],
    payload: 'ViewLogic.mapPayload(',
    buttons: ["send('approve')", 'onClick: handleSendBackClick'],
    lines: 1
  },
  {
    stop: 'the desk',
    rel: 'components/checkpoints/Article.js',
    ask: "const held = unsavedInputLine('article', { editor: editingBlock, bundle: editedBundle || contentBundle });",
    paths: ['handleApprove', 'handleJsonApprove', 'handleReject'],
    payload: 'ViewLogic.articleReviewPayload(',
    buttons: ['onClick: handleApprove,', 'onClick: handleSendBackClick', 'onClick: handleJsonApprove'],
    // Beside the action row, and beside the JSON editor's Save & Approve, which sits below it.
    lines: 2
  }
])('4.14d: $stop holds its actions while it has unsaved input', ({ rel, ask, paths, payload, buttons, lines }) => {
  const src = read(rel);

  it('reads the rule at load, from the module, and asks it once per render about what the stop has open', () => {
    expect(src).toMatch(IMPORT);
    expect(count(src, 'unsavedInputLine(')).toBe(1);
    expect(src).toContain(ask);
  });

  it('consults the answer on every path a payload leaves by, before it builds the payload', () => {
    const sending = sendingPaths(src);
    expect(sending.map((p) => p.name)).toEqual(paths);
    sending.forEach(({ name, before }) => {
      expect([name, before.includes(GUARD)]).toEqual([name, true]);
      if (before.includes(payload)) expect([name, before.indexOf(GUARD) < before.indexOf(payload)]).toEqual([name, true]);
    });
  });

  it('holds each action button while the stop has unsaved input', () => {
    buttons.forEach((marker) => {
      expect([marker, /disabled: !!held\b/.test(buttonProps(src, marker))]).toEqual([marker, true]);
    });
  });

  it('shows the line beside the buttons, after the action row', () => {
    expect(count(src, LINE)).toBe(lines);
    expect(src.indexOf(LINE)).toBeGreaterThan(src.indexOf("className: 'action-modes mt-md'"));
  });
});

describe('4.14d: at the desk, the JSON editor\'s line sits with its Save & Approve', () => {
  it('shows the line again inside the JSON editor, after its button', () => {
    const src = read('components/checkpoints/Article.js');
    const json = src.slice(src.indexOf("mode === 'json' && React.createElement("));
    const panel = json.slice(0, json.indexOf('// Folded below the article'));
    expect(panel.indexOf(LINE)).toBeGreaterThan(panel.indexOf("'Save & Approve'"));
  });
});
