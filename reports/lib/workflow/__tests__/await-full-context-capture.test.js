jest.mock('../checkpoint-helpers', () => {
  const actual = jest.requireActual('../checkpoint-helpers');
  return { ...actual, checkpointInterrupt: jest.fn() };
});
const { checkpointInterrupt } = require('../checkpoint-helpers');
const { _testing } = require('../nodes/checkpoint-nodes');

test('capture branch nulls sessionConfig/directorNotes/playerFocus so parseRawInput re-parses (ROLL-4)', async () => {
  checkpointInterrupt.mockReturnValue({ fullContext: { accusation: 'a', sessionReport: 'r', directorNotes: 'n' } });
  const result = await _testing.checkpointAwaitContext(
    { accusation: null, sessionReport: null, directorNotesRaw: null }, {}
  );
  expect(result.accusation).toBe('a');
  expect(result.directorNotesRaw).toBe('n');     // payload .directorNotes -> channel directorNotesRaw
  expect(result.sessionConfig).toBeNull();        // <- the re-parse trigger
  expect(result.directorNotes).toBeNull();
  expect(result.playerFocus).toBeNull();
});
