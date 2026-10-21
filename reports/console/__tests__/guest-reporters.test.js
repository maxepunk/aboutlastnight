/**
 * Each guest reporter apart, on the console's screens (phase 17, R5).
 *
 * The console cannot import lib/, so input-review-logic.js keeps its own copy of
 * guestReportersOf (lib/prompt-renderers/session-authors.js), held equal to the server's here
 * over every case R5 names. The input review's session panel prints each reporter on a line
 * of their own through guestReporterPanelLines, read here as InputReview.js renders it
 * (lib/__tests__/fixtures/component-source.js loadInputReview), and the start form's help line
 * says how to give two.
 *
 * Invented names throughout: the repo is public.
 */
const fs = require('fs');
const path = require('path');

const Logic = require('../input-review-logic');
const Server = require('../../lib/prompt-renderers/session-authors');
const { loadInputReview, textOf, elementsOf } = require('../../lib/__tests__/fixtures/component-source');

const CONSOLE_DIR = path.join(__dirname, '..');

const CASES = [
  null,
  undefined,
  {},
  { guestReporter: null },
  { guestReporter: { name: '  ', role: 'Guest Reporter' } },
  { guestReporter: { role: 'Guest Reporter' } },
  { guestReporter: [{ name: 'Dana Okafor', role: 'Guest Reporter' }] },
  { guestReporters: [] },
  { guestReporters: [{ name: ' ', role: 'Guest Reporter' }, null, 'Dana Okafor'] },
  { guestReporters: [{ name: 'Dana Okafor', role: 'Contributing Reporter' }, { name: 'Remi Vale', role: 'Field Reporter' }] },
  { guestReporters: [{ name: 'Remi Vale', role: 'Field Reporter' }], guestReporter: { name: 'Dana Okafor', role: 'Guest Reporter' } },
  { guestReporters: [{ name: '  Remi   Vale ', role: ' Field Reporter ' }, { name: 'Dana' }] },
  { guestReporter: { name: 'Dana Okafor', role: 'Contributing Reporter' } },
  { guestReporter: { name: 'Dana' } },
  { guestReporter: { name: 'Dana Okafor', role: 42 } },
  { guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Contributing Reporter, Field Reporter' } },
  { guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Guest Reporter' } },
  { guestReporter: { name: 'Dana Okafor, Remi Vale', role: '' } },
  { guestReporter: { name: 'Dana Okafor', role: ' Reporter, Editor ' } },
  { guestReporter: { name: '  Dana   Okafor ,, ,  Remi\tVale ', role: ' Guest Reporter ' } },
  { guestReporter: { name: 'Dana Okafor, Dana Vale, Kit Arden', role: 'Guest Reporter, , Field Reporter' } },
  // The integrator's ruling after run 1: blank role pieces drop before pairing, and a name the
  // Name field repeats is one reporter.
  { guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Guest Reporter,' } },
  { guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Guest Reporter, , Contributing Reporter' } },
  { guestReporter: { name: 'Dana Okafor, dana okafor', role: 'Guest Reporter' } },
  { guestReporter: { name: 'Dana Okafor, Remi Vale,  DANA   OKAFOR ', role: 'Contributing Reporter, Field Reporter' } },
  { guestReporter: { name: 'Dana Okafor', role: 'Guest Reporter,' } },
  { guestReporter: { name: 'Dana Okafor, Remi Vale', role: ' , ' } }
];

describe("the console's guestReportersOf (R5)", () => {
  it("equals the server's over every case", () => {
    for (const config of CASES) {
      expect([config, Logic.guestReportersOf(config)]).toEqual([config, Server.guestReportersOf(config)]);
    }
  });

  it('reads two reporters apart from an older value', () => {
    expect(Logic.guestReportersOf({ guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Contributing Reporter, Field Reporter' } })).toEqual([
      { name: 'Dana Okafor', firstName: 'Dana', role: 'Contributing Reporter' },
      { name: 'Remi Vale', firstName: 'Remi', role: 'Field Reporter' }
    ]);
  });

  it('drops blank role pieces before pairing, and reads a repeated name as one reporter', () => {
    expect(Logic.guestReportersOf({ guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Guest Reporter,' } })).toEqual([
      { name: 'Dana Okafor', firstName: 'Dana', role: 'Guest Reporter' },
      { name: 'Remi Vale', firstName: 'Remi', role: 'Guest Reporter' }
    ]);
    expect(Logic.guestReportersOf({ guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Guest Reporter, , Contributing Reporter' } })).toEqual([
      { name: 'Dana Okafor', firstName: 'Dana', role: 'Guest Reporter' },
      { name: 'Remi Vale', firstName: 'Remi', role: 'Contributing Reporter' }
    ]);
    expect(Logic.guestReportersOf({ guestReporter: { name: 'Dana Okafor, dana okafor', role: 'Guest Reporter' } }))
      .toEqual([{ name: 'Dana Okafor', firstName: 'Dana', role: 'Guest Reporter' }]);
  });
});

describe("the input review's session panel (R5)", () => {
  it('prints each reporter as "Name | Role", one to a line, with "Guest Reporter" for a blank role', () => {
    expect(Logic.guestReporterPanelLines({ guestReporters: [{ name: 'Dana Okafor', role: 'Contributing Reporter' }, { name: 'Remi Vale', role: '' }] }))
      .toEqual(['Dana Okafor | Contributing Reporter', 'Remi Vale | Guest Reporter']);
    expect(Logic.guestReporterPanelLines({ guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Contributing Reporter, Field Reporter' } }))
      .toEqual(['Dana Okafor | Contributing Reporter', 'Remi Vale | Field Reporter']);
  });

  it('prints one reporter as before, and nothing with none', () => {
    expect(Logic.guestReporterPanelLines({ guestReporter: { name: 'Dana Okafor', role: 'Guest Reporter' } })).toEqual(['Dana Okafor | Guest Reporter']);
    expect(Logic.guestReporterPanelLines({ guestReporter: { name: 'Dana' } })).toEqual(['Dana | Guest Reporter']);
    expect(Logic.guestReporterPanelLines({ guestReporter: null })).toEqual([]);
    expect(Logic.guestReporterPanelLines({ guestReporters: [] })).toEqual([]);
    expect(Logic.guestReporterPanelLines(null)).toEqual([]);
  });

  // InputReview.js run with a React that builds a tree of its elements: the session panel's rows
  // as the screen renders them, one row per line the panel prints.
  describe("is what InputReview.js's panel prints", () => {
    const { InputReview } = loadInputReview();
    const panelRows = (sessionConfig) => {
      const screen = InputReview({ data: { type: 'input-review', sessionConfig, directorNotes: {} }, onApprove() {}, onReject() {}, theme: 'journalist' });
      const [panel] = elementsOf(screen, (element) => element.props.className === 'checkpoint-section' &&
        elementsOf(element.children, (child) => child.type === 'h4').map(textOf)[0] === 'Session Info');
      return elementsOf(panel, (element) => element.type === 'span' && element.props.className === 'text-sm').map(textOf);
    };

    it('with no guest reporter: no guest row', () => {
      expect(panelRows({ sessionId: '0101' })).toEqual(['Session ID: 0101', 'Theme: journalist']);
      expect(panelRows({ sessionId: '0101', guestReporters: [] })).toEqual(['Session ID: 0101', 'Theme: journalist']);
    });

    it('with one: one row, "Guest Reporter" for a blank role', () => {
      expect(panelRows({ sessionId: '0101', guestReporters: [{ name: 'Dana Okafor', role: 'Contributing Reporter' }] }))
        .toEqual(['Session ID: 0101', 'Guest Reporter: Dana Okafor | Contributing Reporter', 'Theme: journalist']);
      expect(panelRows({ sessionId: '0101', guestReporter: { name: 'Dana Okafor', role: '' } }))
        .toEqual(['Session ID: 0101', 'Guest Reporter: Dana Okafor | Guest Reporter', 'Theme: journalist']);
    });

    it('with two: a row for each, from the list and from an older value alike', () => {
      const rows = ['Session ID: 0101', 'Guest Reporter: Dana Okafor | Contributing Reporter', 'Guest Reporter: Remi Vale | Field Reporter', 'Theme: journalist'];
      expect(panelRows({ sessionId: '0101', guestReporters: [{ name: 'Dana Okafor', role: 'Contributing Reporter' }, { name: 'Remi Vale', role: 'Field Reporter' }] }))
        .toEqual(rows);
      expect(panelRows({ sessionId: '0101', guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Contributing Reporter, Field Reporter' } }))
        .toEqual(rows);
    });
  });
});

describe("the start form's help line (R5)", () => {
  it('says how to give two reporters, and the form still sends what was typed', () => {
    const source = fs.readFileSync(path.join(CONSOLE_DIR, 'components', 'SessionStart.js'), 'utf8');
    expect(source).toContain("'Leave Name blank to omit. Separate two reporters with a comma, and give their roles in the same order. Role defaults to \"Guest Reporter\" if blank.'");
    expect(source).toMatch(/raw\.guestReporter = \{\s*name: guestReporterName\.trim\(\),\s*role: guestReporterRole\.trim\(\) \|\| 'Guest Reporter'\s*\};/);
  });
});
