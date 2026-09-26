process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The harness can send the director's photo descriptions (phase 2 final fix wave,
 * item 10).
 *
 * At the character-IDs stop e2e-walkthrough sent only the character ids, so a run
 * through the harness could never give the writers the director's description of a
 * photo, and the phase gate needs it to. `--photo-descriptions <file.json>` reads a
 * `{filename: description}` map and adds it to every character-IDs approval the
 * harness sends (interactive, --auto and --approve), in the shape buildResumePayload
 * validates.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadPhotoDescriptionsFile, withPhotoDescriptions } = require('../../../scripts/lib/photo-descriptions');
const { buildResumePayload } = require('../../../server.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8');
const MAP = { 'aln092026 (7 of 9).jpg': 'Kai and Remi at the bar, the ledger open between them.' };

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-photo-desc-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (name, text) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return p; };

describe('loadPhotoDescriptionsFile', () => {
  it('reads a {filename: description} map', () => {
    expect(loadPhotoDescriptionsFile(write('d.json', JSON.stringify(MAP)))).toEqual(MAP);
  });

  it.each([
    ['not JSON', '{nope'],
    ['an array', '["a.jpg"]'],
    ['a string', '"a.jpg"'],
    ['a non-string description', '{"a.jpg": 3}']
  ])('fails loudly on %s', (_name, text) => {
    expect(() => loadPhotoDescriptionsFile(write('d.json', text))).toThrow(/--photo-descriptions/);
  });

  it('fails loudly on a missing file', () => {
    expect(() => loadPhotoDescriptionsFile(path.join(dir, 'missing.json'))).toThrow(/--photo-descriptions/);
  });
});

describe('withPhotoDescriptions', () => {
  it.each([
    ['the default approval', { characterIds: {} }],
    ['a raw description', { characterIdsRaw: 'Photo 1 shows Kai.' }],
    ['structured ids', { characterIds: { 'a.jpg': { characterMappings: [] } } }]
  ])('adds the map to a character-IDs approval (%s), in the shape buildResumePayload keeps', (_name, approvals) => {
    const payload = withPhotoDescriptions('character-ids', approvals, MAP);
    expect(payload).toEqual({ ...approvals, photoDescriptions: MAP });
    const { stateUpdates, error } = buildResumePayload(payload, {}, 'journalist', 'character-ids');
    expect(error).toBeFalsy();
    expect(stateUpdates.photoDescriptions).toEqual(MAP);
  });

  it('leaves every other stop, a missing map, and a payload that already carries one alone', () => {
    const approvals = { outline: true };
    expect(withPhotoDescriptions('outline', approvals, MAP)).toBe(approvals);
    const ids = { characterIds: {} };
    expect(withPhotoDescriptions('character-ids', ids, null)).toBe(ids);
    const own = { characterIds: {}, photoDescriptions: { 'b.jpg': 'the file\'s own' } };
    expect(withPhotoDescriptions('character-ids', own, MAP)).toBe(own);
  });
});

describe('e2e-walkthrough wiring', () => {
  it('takes --photo-descriptions, loads the file once, and documents it in --help', () => {
    expect(SRC).toMatch(/getArgValue\('--photo-descriptions'\)/);
    expect(SRC).toMatch(/loadPhotoDescriptionsFile\(PHOTO_DESCRIPTIONS_FILE\)/);
    const help = SRC.slice(SRC.indexOf('function showHelp('), SRC.indexOf('function showHelp(') + 4000);
    expect(help).toMatch(/--photo-descriptions <f>/);
  });

  it('adds the map on both approval paths (step mode and interactive/auto)', () => {
    const calls = SRC.match(/withPhotoDescriptions\(checkpointType, /g) || [];
    expect(calls).toHaveLength(2);
  });
});
