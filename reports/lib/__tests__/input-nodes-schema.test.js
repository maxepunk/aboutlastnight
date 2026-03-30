const { _testing } = require('../workflow/nodes/input-nodes');
const { DIRECTOR_NOTES_SCHEMA } = _testing;

describe('DIRECTOR_NOTES_SCHEMA extensions', () => {
  it('should include reportingMode property with on-site/remote enum', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode.type).toBe('string');
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode.enum).toEqual(['on-site', 'remote']);
  });

  it('should include guestReporter property as object with name and role', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter.type).toBe('object');
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter.properties.name).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter.properties.name.type).toBe('string');
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter.properties.role).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter.properties.role.type).toBe('string');
  });

  it('should NOT require new fields (they are optional overrides)', () => {
    expect(DIRECTOR_NOTES_SCHEMA.required).toEqual(['observations']);
  });

  it('should still include original observations property', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.observations).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.observations.type).toBe('object');
  });
});

describe('mergeDirectorOverrides', () => {
  const { mergeDirectorOverrides } = _testing;

  it('should merge reportingMode from director notes into sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], journalistFirstName: 'Cassandra' };
    const directorNotes = {
      observations: { behaviorPatterns: [] },
      reportingMode: 'remote',
      guestReporter: { name: 'Ashe Motoko', role: 'Guest Reporter' }
    };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.reportingMode).toBe('remote');
    expect(merged.journalistFirstName).toBe('Cassandra');
    expect(merged.guestReporter).toEqual({ name: 'Ashe Motoko', role: 'Guest Reporter' });
  });

  it('should default reportingMode to on-site when not specified', () => {
    const sessionConfig = { roster: ['Alex'], journalistFirstName: 'Cassandra' };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.reportingMode).toBe('on-site');
  });

  it('should preserve journalistFirstName from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], journalistFirstName: 'Athena' };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.journalistFirstName).toBe('Athena');
  });

  it('should default guestReporter to null when not specified', () => {
    const sessionConfig = { roster: ['Alex'] };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.guestReporter).toBeNull();
  });

  it('should handle null directorNotes gracefully', () => {
    const result = mergeDirectorOverrides({ roster: ['Alex'] }, null);
    expect(result.reportingMode).toBe('on-site');
    expect(result.journalistFirstName).toBeUndefined();
    expect(result.guestReporter).toBeNull();
  });

  it('should preserve existing sessionConfig fields', () => {
    const sessionConfig = { roster: ['Alex', 'Sam'], sessionId: '0307', journalistFirstName: 'Cassandra' };
    const directorNotes = { observations: { behaviorPatterns: [] }, reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.roster).toEqual(['Alex', 'Sam']);
    expect(merged.sessionId).toBe('0307');
    expect(merged.reportingMode).toBe('remote');
  });
});

describe('shellAccounts state propagation', () => {
  it('shellAccounts should NOT be in mergeDirectorOverrides output (separate data path)', () => {
    const { mergeDirectorOverrides } = _testing;
    const merged = mergeDirectorOverrides({ roster: ['Alex'] }, { observations: {} });
    expect(merged.shellAccounts).toBeUndefined();
  });
});
