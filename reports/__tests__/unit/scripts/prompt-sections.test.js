/**
 * The gate's prompt tools (phase 3, brief 3.0): the section splitter behind
 * `scripts/render-prompts.js --sections`, its comparison, and the checks every render
 * must pass before an absence scan can trust it (not empty, no stringified promise,
 * its required marker present). Pure functions, no files and no model calls.
 */
const {
  splitSections,
  splitRender,
  compareSections,
  renderProblems
} = require('../../../scripts/lib/prompt-sections');

const keysOf = (entries) => entries.map((e) => e.key);
const lines = (...ls) => ls.join('\n');

describe('splitSections', () => {
  test('nested tags stay inside their top-level section', () => {
    const text = lines(
      '<OUTER>',
      'intro',
      '<inner attr="1">',
      'x',
      '</inner>',
      '<OUTER>',
      'same name, nested',
      '</OUTER>',
      '</OUTER>'
    );
    const entries = splitSections(text);
    expect(keysOf(entries)).toEqual(['<OUTER>']);
    expect(entries[0]).toMatchObject({ kind: 'section', name: 'OUTER', text, line: 1 });
  });

  test('text outside any tag is its own section, labelled by the section before it', () => {
    const text = lines(
      'Preamble line',
      '<A>',
      'a',
      '</A>',
      '',
      'Between',
      '<B>b on one line</B>',
      'Trailing'
    );
    const entries = splitSections(text);
    expect(keysOf(entries)).toEqual(['(text at start)', '<A>', '(text after <A>)', '<B>', '(text after <B>)']);
    expect(entries.map((e) => e.kind)).toEqual(['text', 'section', 'text', 'section', 'text']);
    expect(entries[0].text).toBe('Preamble line');
    expect(entries[1].text).toBe(lines('<A>', 'a', '</A>'));
    expect(entries[2].text).toBe(lines('', 'Between'));
    expect(entries[3].text).toBe('<B>b on one line</B>');
    expect(entries[4].text).toBe('Trailing');
  });

  test('a tag opened and never closed is reported, not dropped', () => {
    const text = lines(
      '<A>',
      'a',
      '</A>',
      '<BROKEN>',
      'dangling text',
      '<C>',
      'c',
      '</C>'
    );
    const entries = splitSections(text);
    expect(keysOf(entries)).toEqual(['<A>', '<BROKEN> (unclosed)', '(text after <BROKEN> (unclosed))', '<C>']);
    expect(entries[1]).toMatchObject({ kind: 'unclosed', name: 'BROKEN', text: '<BROKEN>', line: 4 });
    expect(entries[2].text).toBe('dangling text');
    // Every non-blank line of the input is in exactly one entry.
    const covered = entries.flatMap((e) => e.text.split('\n')).filter((l) => l.trim());
    expect(covered).toEqual(text.split('\n').filter((l) => l.trim()));
  });

  test('only a tag that opens a line opens a section; a prose reference does not', () => {
    const text = lines(
      'Copy it from the document with that id in <RECORD>.',
      '<RECORD>',
      'Buried memories appear only in <buried-transactions>.',
      '<buried-transactions>',
      'row',
      '</buried-transactions>',
      '</RECORD>'
    );
    expect(keysOf(splitSections(text))).toEqual(['(text at start)', '<RECORD>']);
  });

  test('closing tags, comments and self-closing tags do not open a section', () => {
    const text = lines('</stray>', '<!-- note -->', '<br/>', 'prose');
    const entries = splitSections(text);
    expect(keysOf(entries)).toEqual(['(text at start)']);
    expect(entries[0].text).toBe(text);
  });

  test('a repeated top-level name is numbered, and blank-only text between sections is skipped', () => {
    const text = lines('<NOTE>', 'one', '</NOTE>', '', '<NOTE>', 'two', '</NOTE>');
    expect(keysOf(splitSections(text))).toEqual(['<NOTE>', '<NOTE>#2']);
  });

  test('an empty text has no sections', () => {
    expect(splitSections('')).toEqual([]);
  });
});

describe('splitRender', () => {
  test('keys each section by the part of the render it is in', () => {
    const text = '===== SYSTEM =====\nYou are the writer.\n<RULES>\nr\n</RULES>\n\n===== USER =====\n<RECORD>\nd\n</RECORD>\n';
    expect(keysOf(splitRender(text))).toEqual([
      'SYSTEM (text at start)', 'SYSTEM <RULES>', 'USER <RECORD>'
    ]);
  });

  test('a text without the frame is split whole', () => {
    expect(keysOf(splitRender('<A>\na\n</A>'))).toEqual(['<A>']);
  });
});

describe('compareSections', () => {
  const render = (user) => `===== SYSTEM =====\nsys\n\n===== USER =====\n${user}\n`;

  test('a render compared with itself has no differences', () => {
    const text = render(lines('<A>', 'a', '</A>', 'between', '<B>', 'b', '</B>'));
    const result = compareSections(text, text);
    expect(result.differences).toBe(0);
    expect(result.rows.every((r) => r.status === 'same')).toBe(true);
    expect(result.rows.find((r) => r.key === 'USER <A>')).toMatchObject({ sizeA: 10, sizeB: 10 });
  });

  test('reports a section that differs and one that exists in only one text, in reading order', () => {
    const a = render(lines('<A>', 'a', '</A>', '<OLD>', 'o', '</OLD>', '<C>', 'c', '</C>'));
    const b = render(lines('<A>', 'a changed', '</A>', '<NEW>', 'n', '</NEW>', '<C>', 'c', '</C>'));
    const result = compareSections(a, b);
    expect(result.rows.map((r) => [r.key, r.status])).toEqual([
      ['SYSTEM (text at start)', 'same'],
      ['USER <A>', 'differs'],
      ['USER <OLD>', 'only-a'],
      ['USER <NEW>', 'only-b'],
      ['USER <C>', 'same']
    ]);
    expect(result.rows.find((r) => r.key === 'USER <OLD>')).toMatchObject({ sizeA: 14, sizeB: null });
    expect(result.differences).toBe(3);
  });

  test('sizes are UTF-8 bytes', () => {
    const result = compareSections('<A>\né\n</A>', '<A>\né\n</A>');
    expect(result.rows[0]).toMatchObject({ sizeA: 11, sizeB: 11 });
  });

  test('names each unclosed tag, per side, by its line in the file', () => {
    const result = compareSections('<A>\na', '<A>\na\n</A>');
    expect(result.unclosed).toEqual([{ side: 'A', key: '<A> (unclosed)', line: 1 }]);
    const framed = compareSections(render('<B>\nb'), render('<B>\nb\n</B>'));
    expect(framed.unclosed).toEqual([{ side: 'A', key: 'USER <B> (unclosed)', line: 5 }]);
  });
});

describe('renderProblems', () => {
  const ok = 'You are the writer.';
  const user = 'Data:\n<RECORD>\ndoc\n</RECORD>';

  test('a whole render with its marker has no problems', () => {
    expect(renderProblems('x.txt', ok, user, ['<RECORD>'])).toEqual([]);
  });

  test('an empty or missing part fails, naming the file and the part', () => {
    expect(renderProblems('x.txt', '   ', user, ['<RECORD>'])).toEqual(['x.txt: the system prompt is empty']);
    expect(renderProblems('x.txt', ok, undefined, ['<RECORD>'])).toEqual([
      'x.txt: the user prompt is empty',
      'x.txt: missing its marker "<RECORD>" (no line opens with it)'
    ]);
  });

  test('a stringified promise fails, naming the file', () => {
    expect(renderProblems('x.txt', ok, `${user}\n[object Promise]`, ['<RECORD>']))
      .toEqual(['x.txt: contains "[object Promise]" (a builder returned a promise that was not awaited)']);
  });

  test('a missing marker fails, naming the file and the marker; a prose mention does not count', () => {
    expect(renderProblems('x.txt', ok, 'Copy it from the document in <RECORD>.', ['<RECORD>']))
      .toEqual(['x.txt: missing its marker "<RECORD>" (no line opens with it)']);
  });

  test('a file with no markers listed fails, so the table cannot fall behind the files', () => {
    expect(renderProblems('x.txt', ok, user, undefined)).toEqual(['x.txt: has no required marker in the table']);
  });
});
