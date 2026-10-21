/**
 * Each guest reporter apart, on the console's screens (phase 17, R5).
 *
 * The console cannot import lib/, so input-review-logic.js keeps its own copy of
 * guestReportersOf (lib/prompt-renderers/session-authors.js), held equal to the server's here
 * over every case R5 names. The input review's session panel prints each reporter on a line
 * of their own through guestReporterPanelLines, and the start form's help line says how to
 * give two.
 *
 * Invented names throughout: the repo is public.
 */
const fs = require('fs');
const path = require('path');

const Logic = require('../input-review-logic');
const Server = require('../../lib/prompt-renderers/session-authors');

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
  { guestReporter: { name: 'Dana Okafor, Dana Vale, Kit Arden', role: 'Guest Reporter, , Field Reporter' } }
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

  it("is what InputReview.js's panel prints, with no reading of its own", () => {
    const source = fs.readFileSync(path.join(CONSOLE_DIR, 'components', 'checkpoints', 'InputReview.js'), 'utf8');
    expect(source).toMatch(/guestReporterPanelLines\(sessionConfig\)/);
    expect(source).not.toMatch(/sessionConfig\.guestReporter\b/);
  });
});

describe("the start form's help line (R5)", () => {
  it('says how to give two reporters, and the form still sends what was typed', () => {
    const source = fs.readFileSync(path.join(CONSOLE_DIR, 'components', 'SessionStart.js'), 'utf8');
    expect(source).toContain("'Leave Name blank to omit. Separate two reporters with a comma, and give their roles in the same order. Role defaults to \"Guest Reporter\" if blank.'");
    expect(source).toMatch(/raw\.guestReporter = \{\s*name: guestReporterName\.trim\(\),\s*role: guestReporterRole\.trim\(\) \|\| 'Guest Reporter'\s*\};/);
  });
});
