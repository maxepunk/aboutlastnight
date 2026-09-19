const { _testing } = require('../workflow/nodes/input-nodes');

describe('parseRawInput wiring', () => {
  it('does NOT export legacy DIRECTOR_NOTES_SCHEMA', () => {
    expect(_testing.DIRECTOR_NOTES_SCHEMA).toBeUndefined();
  });

  it('still exposes SESSION_CONFIG_SCHEMA and SESSION_REPORT_SCHEMA for step 1/2', () => {
    expect(_testing.SESSION_CONFIG_SCHEMA).toBeDefined();
    expect(_testing.SESSION_REPORT_SCHEMA).toBeDefined();
  });
});

describe('mergeDirectorOverrides — passthrough behavior', () => {
  const { mergeDirectorOverrides } = _testing;

  it('returns sessionConfig unchanged when directorNotes is present', () => {
    const sessionConfig = {
      roster: ['Alex'],
      journalistFirstName: 'Cassandra',
      reportingMode: 'remote',
      guestReporter: { name: 'Ashe', role: 'Guest Reporter' }
    };
    const directorNotes = { rawProse: 'anything' };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged).toEqual(sessionConfig);
  });

  it('preserves reportingMode from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, { rawProse: '' });
    expect(merged.reportingMode).toBe('remote');
  });

  it('preserves guestReporter from sessionConfig', () => {
    const guest = { name: 'Ashe', role: 'Guest Reporter' };
    const sessionConfig = { roster: ['Alex'], guestReporter: guest };
    const merged = mergeDirectorOverrides(sessionConfig, { rawProse: '' });
    expect(merged.guestReporter).toEqual(guest);
  });

  it('handles null directorNotes without adding default fields', () => {
    const sessionConfig = { roster: ['Alex'] };
    const merged = mergeDirectorOverrides(sessionConfig, null);
    expect(merged).toEqual(sessionConfig);
  });
});

describe('Step-1 parse prompt does not invite a derived sessionId (Task 1 Minor)', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'workflow', 'nodes', 'input-nodes.js'), 'utf8'
  );

  it('tells the model to copy the provided sessionId verbatim', () => {
    expect(src).toContain('Use the provided sessionId verbatim');
  });

  it('no longer offers the MMDD derivation that produced data/0711 for session 071126', () => {
    // B1: Haiku answered "0711" for session 071126, the inputs were written to
    // data/0711/ and the report published as report-0711.html with 0 photos.
    // parseRawInput overrides the value now, but the instruction stayed.
    expect(src).not.toContain('derive in MMDD format');
  });
});
