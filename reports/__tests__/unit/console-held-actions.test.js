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
 *
 * Task 4.14g: no control drops what the director typed. Every control that would close or replace an
 * open editor, or an add line holding text, waits for it as the actions do: the map and the desk ask
 * the rule once per render for each kind of control, each such control is disabled while its answer
 * holds and its handler returns first, and a line beside the open piece says why. A hold is not an
 * error: every held line has a style of its own, `.held-line`.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');
const count = (haystack, needle) => haystack.split(needle).length - 1;

const IMPORT = /^const \{ unsavedInputLine \} = window\.Console\.unsavedInputLogic;$/m;
/** The first statement of a send path held by the answer named `hold`. */
const guard = (hold) => `if (${hold}) return;`;
/**
 * The line that shows the answer named `hold` beside what it holds, styled as a hold (task 4.14g):
 * the story meeting writes its one line out, and the map and the desk render theirs through their
 * own heldLine.
 */
const MEETING_LINE = (hold) => `${hold} && React.createElement('p', { className: 'held-line', role: 'status' }, ${hold})`;
const HELD_LINE = (hold) => `heldLine(${hold})`;

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

// Each send path and each action button is paired with the answer that holds it. `controls` are the
// asks for the controls that would close what is open (task 4.14g, pinned in its describes below).
describe.each([
  {
    stop: 'the story meeting',
    rel: 'components/checkpoints/ArcSelection.js',
    asks: ["const held = unsavedInputLine('arc-selection', { addLine: newName + newLine });"],
    controls: [],
    paths: [['send', 'held'], ['send', 'held']],
    payload: 'ViewLogic.meetingPayload(',
    buttons: [['onClick: handleApproveClick', 'held'], ["send('reweave')", 'held'], ['onClick: handleSendBackClick', 'held'], ["aria-label': approveAsk.keep.ariaLabel", 'held'], ["aria-label': approveAsk.clear.ariaLabel", 'held']],
    line: MEETING_LINE
  },
  {
    stop: 'the map',
    rel: 'components/checkpoints/Outline.js',
    asks: ["const held = unsavedInputLine('outline', unsaved);"],
    controls: ["const editHeld = unsavedInputLine('outline', unsaved, 'edit');", "const addHeld = unsavedInputLine('outline', unsaved, 'add');"],
    paths: [['send', 'held'], ['send', 'held']],
    payload: 'ViewLogic.mapPayload(',
    buttons: [["send('approve')", 'held'], ['onClick: handleSendBackClick', 'held']],
    line: HELD_LINE
  },
  {
    stop: 'the desk',
    rel: 'components/checkpoints/Article.js',
    asks: ["const held = unsavedInputLine('article', unsaved);", "const jsonHeld = unsavedInputLine('article-json', unsaved);"],
    controls: ['edit', 'move', 'delete', 'insert'].map((kind) => `const ${kind}Held = unsavedInputLine('article', unsaved, '${kind}');`),
    paths: [['handleApprove', 'held'], ['handleJsonApprove', 'jsonHeld'], ['handleReject', 'held']],
    payload: 'ViewLogic.articleReviewPayload(',
    buttons: [['onClick: handleApprove,', 'held'], ['onClick: handleSendBackClick', 'held'], ['onClick: handleJsonApprove', 'jsonHeld']],
    line: HELD_LINE
  }
])('4.14d: $stop holds its actions while it has unsaved input', ({ rel, asks, controls, paths, payload, buttons, line }) => {
  const src = read(rel);

  it('reads the rule at load, from the module, and asks it once per render for each set of buttons that sends one thing, and for each kind of control (4.14g)', () => {
    expect(src).toMatch(IMPORT);
    expect(count(src, 'unsavedInputLine(')).toBe(asks.length + controls.length);
    asks.concat(controls).forEach((ask) => expect([ask, count(src, ask)]).toEqual([ask, 1]));
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
    expect(count(src, HELD_LINE('jsonHeld'))).toBe(1);
    expect(panel.indexOf(HELD_LINE('jsonHeld'))).toBeGreaterThan(panel.indexOf("'Save & Approve'"));
  });

  it('tells both asks, while it is open, what it holds, the text it opened with and the desk\'s count of changes then, beside the count now (fix round 1)', () => {
    expect(src).toContain([
      '  const unsaved = {',
      '    editor: editingBlock,',
      '    bundle: editedBundle || contentBundle,',
      "    json: mode === 'json' ? { text: jsonText, seed: jsonSeed, seededAt: jsonSeededAt } : null,",
      '    deskVersion: deskVersion',
      '  };'
    ].join('\n'));
  });

  it('keeps, when it opens, its text as its seed, which tells JSON the director typed, and the desk\'s count then', () => {
    const body = functionBody(src, 'handleModeChange');
    expect(body).toContain('setJsonText(seed);');
    expect(body).toContain('setJsonSeed(seed);');
    expect(body).toContain('setJsonSeededAt(deskVersion);');
  });

  it('sees every change to the desk: each place that puts a bundle on the desk also moves its count (fix round 1, finding 1)', () => {
    const places = [...src.matchAll(/setEditedBundle\(/g)].map((m) => m.index);
    expect(places.length).toBeGreaterThan(0);
    places.forEach((at) => {
      const where = src.slice(at, src.indexOf('\n', at));
      const block = src.slice(at, src.indexOf('\n  }', at));
      expect([where, block.includes('setDeskVersion(')]).toEqual([where, true]);
    });
  });
});

/** The first statement of a function body as functionBody returns it. */
const firstStatement = (body) => body.split('\n')[1].trim();

/** The name of the function a place in the source sits in, or a word saying it has none. */
function enclosingFunction(src, at) {
  const found = /^function (\w*)\(/.exec(src.slice(src.lastIndexOf('function ', at)));
  return found && found[1] ? found[1] : '(an anonymous function)';
}

// Task 4.14g. At the desk, a pencil opens its editor in place of the open one (startBlockEdit and its
// three siblings), and a move, a delete or an insert puts a new bundle on the desk through applyDesk,
// which closes the open editor. Each kind of control asks the rule, and waits while it answers.
describe('4.14g: at the desk, a pencil, a move, a delete and an insert wait for an open editor', () => {
  const src = read('components/checkpoints/Article.js');
  const HANDLERS = [
    ['startBlockEdit', 'editHeld'], ['startHeadingEdit', 'editHeld'], ['startSidebarEdit', 'editHeld'], ['startHeadlineEdit', 'editHeld'],
    ['moveStep', 'moveHeld'], ['moveToSection', 'moveHeld'], ['sidebarStep', 'moveHeld'],
    ['deleteClick', 'deleteHeld'], ['sidebarDeleteClick', 'deleteHeld'],
    ['insertAt', 'insertHeld']
  ];

  it('each handler that opens an editor, moves, deletes or inserts returns first while its answer holds', () => {
    HANDLERS.forEach(([name, hold]) => {
      expect([name, firstStatement(functionBody(src, name))]).toEqual([name, guard(hold)]);
    });
  });

  it('opens an editor and puts a bundle on the desk only in those handlers, an editor\'s own Save, and applyDesk itself', () => {
    const guarded = HANDLERS.map(([name]) => name);
    [...src.matchAll(/\bsetEditingBlock\(\{/g)].forEach((m) => {
      const name = enclosingFunction(src, m.index);
      expect([name, guarded.includes(name)]).toEqual([name, true]);
    });
    [...src.matchAll(/\bapplyDesk\(/g)].forEach((m) => {
      const name = enclosingFunction(src, m.index);
      expect([name, name === 'applyDesk' || guarded.includes(name) || /^save\w+Edit$/.test(name)]).toEqual([name, true]);
    });
  });

  it('holds each control while its answer holds: the pencil in every row, and every button and select in a rail', () => {
    expect(functionBody(src, 'deskRow')).toContain('editBtn(onEdit, editHeld)');
    // deskButton disables a held button and gives it the line as its tooltip.
    const button = functionBody(src, 'deskButton');
    expect(button).toContain('disabled: !!opts.disabled || !!opts.held,');
    expect(button).toContain('title: opts.held || title');
    // Every rail button carries the answer of its kind: a block's up, down, delete and two inserts;
    // a section heading's two inserts; a Key Evidence entry's up, down and delete.
    const calls = count(src, 'deskButton(') - 1;
    expect(calls).toBe(10);
    expect(count(src, 'held: moveHeld') + count(src, 'held: deleteHeld') + count(src, 'held: insertHeld')).toBe(calls);
    const block = functionBody(src, 'blockControls');
    expect([count(block, 'held: moveHeld'), count(block, 'held: deleteHeld'), count(block, 'held: insertHeld')]).toEqual([2, 1, 2]);
    expect(count(functionBody(src, 'renderSectionHeading'), 'held: insertHeld')).toBe(2);
    const sidebar = functionBody(src, 'sidebarControls');
    expect([count(sidebar, 'held: moveHeld'), count(sidebar, 'held: deleteHeld')]).toEqual([2, 1]);
    // The block's move-to select.
    expect(block).toContain('disabled: !!moveHeld,');
    expect(block).toContain("title: moveHeld || 'Move this block to the end of a section'");
  });

  it('shows the line under the open editor, through which every editor on the desk renders', () => {
    expect(functionBody(src, 'withMarks')).toContain('React.createElement(React.Fragment, { key: key }, editor, heldLine(editHeld), deskMarksList(marks))');
    ['BlockEditor', 'SectionHeadingEditor', 'HeadlineEditor', 'SidebarEvidenceCardEditor', 'FinancialEntryEditor', 'HeroImageEditor', 'BylineEditor'].forEach((editor) => {
      const call = `React.createElement(${editor}, {`;
      const at = src.indexOf(call);
      expect([editor, count(src, call), src.slice(src.lastIndexOf('\n', at), at).includes('withMarks(')]).toEqual([editor, 1, true]);
    });
  });
});

// Task 4.14g. On the map, a pencil opens its editor in place of the open one, and "+ Add a beat" opens
// the add line in its section in place of the open one.
describe('4.14g: on the map, a pencil waits for an open editor, and "+ Add a beat" for an add line that holds text', () => {
  const src = read('components/checkpoints/Outline.js');

  it('asks the rule about the same description of what is open as the actions', () => {
    expect(count(src, 'const unsaved = { editor: editing, adding: adding, sections: view.sections };')).toBe(1);
  });

  it('opens an editor only through open, and an add line only through openAddLine, each returning first while its answer holds', () => {
    expect(firstStatement(functionBody(src, 'open'))).toBe(guard('editHeld'));
    expect(firstStatement(functionBody(src, 'openAddLine'))).toBe(guard('addHeld'));
    [...src.matchAll(/\bsetEditing\(\{/g)].forEach((m) => expect(enclosingFunction(src, m.index)).toBe('open'));
    [...src.matchAll(/\bsetAdding\(\{ slot:/g)].forEach((m) => expect(enclosingFunction(src, m.index)).toBe('openAddLine'));
  });

  it('holds every pencil and every "+ Add a beat" while its answer holds', () => {
    // Piece 4 (brief 4D): four pencils, the head, the gap note, each column's head and the length;
    // a move's words open from Edit the words on its selected card, which waits the same way.
    expect(count(src, 'editBtn(')).toBe(4);
    expect(count(src, '); }, editHeld)')).toBe(4);
    const editTheWords = buttonProps(src, "'Edit the words'");
    expect(editTheWords).toMatch(/disabled: !!editHeld\b/);
    expect(editTheWords).toContain("open('beat', beat.id)");
    const add = buttonProps(src, "'+ Add a beat'");
    expect(add).toMatch(/disabled: !!addHeld\b/);
    expect(add).toContain('title: addHeld || undefined');
    expect(add).toContain('openAddLine(slot)');
  });

  it('shows the pencils\' line under every open editor, and "+ Add a beat"\'s under the add line', () => {
    const editing = [...src.matchAll(/map__editing'/g)].map((m) => m.index);
    expect(editing.length).toBe(5);
    expect(count(src, HELD_LINE('editHeld'))).toBe(5);
    // Each editor's container holds the line, before the line's own row and its pencil.
    editing.forEach((at) => {
      const container = src.slice(at, src.indexOf('editBtn(', at));
      expect([container.split('\n')[0], container.includes(HELD_LINE('editHeld'))]).toEqual([container.split('\n')[0], true]);
    });
    expect(count(src, HELD_LINE('addHeld'))).toBe(1);
    expect(functionBody(src, 'addLine')).toContain(HELD_LINE('addHeld'));
  });
});

// Task 4.14g (the review of 4.14d, finding 5): a hold is not an error. A held line said why a button
// waits in the same red as a real refusal, so a director could look for something broken.
describe('4.14g: a hold is not an error', () => {
  const STOPS = ['ArcSelection.js', 'Outline.js', 'Article.js'];

  it('every held line at the three stops is a held-line with role status, and none is in the error\'s style', () => {
    expect(count(read('components/checkpoints/ArcSelection.js'), MEETING_LINE('held'))).toBe(1);
    ['Outline.js', 'Article.js'].forEach((name) => {
      const src = read(`components/checkpoints/${name}`);
      const helper = src.slice(src.indexOf('function heldLine('), src.indexOf('\n}\n', src.indexOf('function heldLine(')));
      expect([name, helper.includes("React.createElement('p', { className: 'held-line', role: 'status' }, text)")]).toEqual([name, true]);
    });
    STOPS.forEach((name) => {
      expect([name, /validation-error', role: 'status'/.test(read(`components/checkpoints/${name}`))]).toEqual([name, false]);
    });
  });

  it('console.css gives .held-line a style of its own, with none of the error\'s red', () => {
    const css = read('console.css');
    const rule = css.slice(css.indexOf('.held-line {'));
    expect(css.indexOf('.held-line {')).toBeGreaterThan(-1);
    expect(rule.slice(0, rule.indexOf('}'))).not.toMatch(/accent-red|#e74c3c|231, 76, 60/);
  });

  it('a held pencil is disabled and says why in its tooltip, and reads as held', () => {
    const utils = read('utils.js');
    const editBtn = utils.slice(utils.indexOf('function editBtn('), utils.indexOf('\n}\n', utils.indexOf('function editBtn(')));
    expect(editBtn).toContain('function editBtn(onClick, held)');
    expect(editBtn).toContain('disabled: !!held,');
    expect(editBtn).toContain("title: held || 'Edit'");
    expect(read('console.css')).toContain('.article-block__edit-btn:disabled');
  });
});
