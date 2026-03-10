const { _testing } = require('../workflow/nodes/input-nodes');
const { DIRECTOR_NOTES_SCHEMA } = _testing;

describe('DIRECTOR_NOTES_SCHEMA extensions', () => {
  it('should include reportingMode property with on-site/remote enum', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode.type).toBe('string');
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode.enum).toEqual(['on-site', 'remote']);
  });

  it('should include journalistFirstName property', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.journalistFirstName).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.journalistFirstName.type).toBe('string');
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
