const { _testing } = require('../workflow/nodes/input-nodes');
const { DIRECTOR_NOTES_SCHEMA } = _testing;

describe('DIRECTOR_NOTES_SCHEMA — reverted to observations-only', () => {
  it('should NOT include reportingMode (now sourced from rawInput)', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode).toBeUndefined();
  });

  it('should NOT include guestReporter (now sourced from rawInput)', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter).toBeUndefined();
  });

  it('should still include observations property', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.observations).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.observations.type).toBe('object');
  });

  it('should still require observations', () => {
    expect(DIRECTOR_NOTES_SCHEMA.required).toEqual(['observations']);
  });
});

describe('mergeDirectorOverrides — passthrough behavior', () => {
  const { mergeDirectorOverrides } = _testing;

  it('should return sessionConfig unchanged when directorNotes is present', () => {
    const sessionConfig = {
      roster: ['Alex'],
      journalistFirstName: 'Cassandra',
      reportingMode: 'remote',
      guestReporter: { name: 'Ashe Motoko', role: 'Guest Reporter' }
    };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged).toEqual(sessionConfig);
  });

  it('should preserve reportingMode from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, { observations: {} });
    expect(merged.reportingMode).toBe('remote');
  });

  it('should preserve guestReporter from sessionConfig', () => {
    const guest = { name: 'Ashe Motoko', role: 'Guest Reporter' };
    const sessionConfig = { roster: ['Alex'], guestReporter: guest };
    const merged = mergeDirectorOverrides(sessionConfig, { observations: {} });
    expect(merged.guestReporter).toEqual(guest);
  });

  it('should NOT pull reportingMode from directorNotes (extraction removed)', () => {
    const sessionConfig = { roster: ['Alex'], reportingMode: 'on-site' };
    const directorNotes = { observations: {}, reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.reportingMode).toBe('on-site');
  });

  it('should NOT pull guestReporter from directorNotes (extraction removed)', () => {
    const sessionConfig = { roster: ['Alex'], guestReporter: null };
    const directorNotes = {
      observations: {},
      guestReporter: { name: 'Fake', role: 'X' }
    };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.guestReporter).toBeNull();
  });

  it('should handle null directorNotes without adding default fields', () => {
    const sessionConfig = { roster: ['Alex'] };
    const merged = mergeDirectorOverrides(sessionConfig, null);
    expect(merged).toEqual(sessionConfig);
  });

  it('should preserve journalistFirstName from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], journalistFirstName: 'Athena' };
    const merged = mergeDirectorOverrides(sessionConfig, { observations: {} });
    expect(merged.journalistFirstName).toBe('Athena');
  });

  it('should preserve arbitrary existing sessionConfig fields', () => {
    const sessionConfig = {
      roster: ['Alex', 'Sam'],
      sessionId: '0307',
      journalistFirstName: 'Cassandra',
      reportingMode: 'on-site',
      guestReporter: null
    };
    const merged = mergeDirectorOverrides(sessionConfig, { observations: {} });
    expect(merged.roster).toEqual(['Alex', 'Sam']);
    expect(merged.sessionId).toBe('0307');
    expect(merged.reportingMode).toBe('on-site');
  });
});

describe('shellAccounts state propagation', () => {
  it('shellAccounts should NOT be in mergeDirectorOverrides output (separate data path)', () => {
    const { mergeDirectorOverrides } = _testing;
    const merged = mergeDirectorOverrides({ roster: ['Alex'] }, { observations: {} });
    expect(merged.shellAccounts).toBeUndefined();
  });
});
