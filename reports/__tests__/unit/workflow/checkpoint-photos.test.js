/**
 * checkpointPhotos — the gate that collects the photo folder after arc selection.
 *
 * The skip signal is state.photosPath and NOTHING else (C1/C2). It deliberately
 * does not skip on a directory scan: preprocessPhotos COPIES every photo into
 * data/<id>/photos (lib/image-preprocessor.js:135-136), so a `found > 0` skip
 * could never fire a second time and a rollback to this point would be a dead end.
 */
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const fs = require('fs');
const os = require('os');
const path = require('path');

const { _testing: { checkpointPhotos } } = require('../../../lib/workflow/nodes/checkpoint-nodes');
const { checkpointInterrupt } = require('../../../lib/workflow/checkpoint-helpers');
const { PHASES } = require('../../../lib/workflow/state');

let dataDir;

beforeEach(() => {
  jest.clearAllMocks();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-photos-'));
});

const cfg = () => ({ configurable: { dataDir } });

function seedPhotos(sessionId, names) {
  const dir = path.join(dataDir, sessionId, 'photos');
  fs.mkdirSync(dir, { recursive: true });
  names.forEach((n) => fs.writeFileSync(path.join(dir, n), 'x'));
  return dir;
}

describe('checkpointPhotos skip signal', () => {
  it('pauses when photosPath is null, whatever else is in state', async () => {
    const state = { sessionId: '091926', photosPath: null, sessionPhotos: ['a.jpg'], photoAnalyses: { analyses: [] } };
    await checkpointPhotos(state, cfg());
    expect(checkpointInterrupt).toHaveBeenCalledWith('photos', expect.any(Object), null);
  });

  it('does NOT pause once photosPath is set', async () => {
    const state = { sessionId: '091926', photosPath: 'D:/shoots/091926-clean' };
    await checkpointPhotos(state, cfg());
    expect(checkpointInterrupt).toHaveBeenCalledWith('photos', expect.any(Object), 'D:/shoots/091926-clean');
  });

  it('still pauses when the default dir is full — a scan is not a skip signal (C2)', async () => {
    seedPhotos('091926', ['a.jpg', 'b.png', 'notes.txt']);
    await checkpointPhotos({ sessionId: '091926', photosPath: null }, cfg());
    expect(checkpointInterrupt).toHaveBeenCalledWith('photos', expect.any(Object), null);
  });
});

describe('checkpointPhotos payload', () => {
  it('reports the default dir and the image count there', async () => {
    const dir = seedPhotos('091926', ['a.jpg', 'b.png', 'c.webp', 'notes.txt']);
    await checkpointPhotos({ sessionId: '091926', photosPath: null }, cfg());
    const payload = checkpointInterrupt.mock.calls[0][1];
    expect(payload.defaultDir).toBe(dir);
    expect(payload.found).toBe(3);
    expect(payload.sessionId).toBe('091926');
  });

  it('reports found:0 for a missing default dir rather than throwing', async () => {
    await checkpointPhotos({ sessionId: '999999', photosPath: null }, cfg());
    expect(checkpointInterrupt.mock.calls[0][1].found).toBe(0);
  });

  it('pre-fills from the start-time rawSessionInput path after a rollback cleared photosPath (R4)', async () => {
    const state = { sessionId: '091926', photosPath: null, rawSessionInput: { photosPath: 'D:/shoots/091926-clean' } };
    await checkpointPhotos(state, cfg());
    expect(checkpointInterrupt.mock.calls[0][1].photosPath).toBe('D:/shoots/091926-clean');
  });

  it('prefers the rollback stash over the start-time path (v2 M1)', async () => {
    // After the director corrects a bad start-time path AT this gate, every later
    // rollback nulls photosPath — and rawSessionInput is EXEMPT, so without the
    // stash the gate would re-offer the original typo the director just fixed.
    const state = {
      sessionId: '091926',
      photosPath: null,
      _previousPhotosPath: 'D:/shoots/091926-CORRECTED',
      rawSessionInput: { photosPath: 'D:/shoots/091926-typo' }
    };
    await checkpointPhotos(state, cfg());
    expect(checkpointInterrupt.mock.calls[0][1].photosPath).toBe('D:/shoots/091926-CORRECTED');
  });

  it('pre-fills null when there was never a path', async () => {
    await checkpointPhotos({ sessionId: '091926', photosPath: null }, cfg());
    expect(checkpointInterrupt.mock.calls[0][1].photosPath).toBeNull();
  });
});

describe('checkpointPhotos capture', () => {
  it('captures the resumed path, stripped of quotes and whitespace, and consumes the stash', async () => {
    checkpointInterrupt.mockImplementationOnce(() => ({ photosPath: '  "D:/shoots/091926-clean"  ' }));
    const out = await checkpointPhotos(
      { sessionId: '091926', photosPath: null, _previousPhotosPath: 'D:/old' }, cfg()
    );
    expect(out.photosPath).toBe('D:/shoots/091926-clean');
    expect(out.currentPhase).toBe(PHASES.PHOTOS);
    // v2 M1: consumed, exactly as checkpointAwaitContext clears _previousFullContext.
    expect(out._previousPhotosPath).toBeNull();
  });

  it('writes no photosPath when the resume carries none', async () => {
    checkpointInterrupt.mockImplementationOnce(() => ({ photosPath: '   ' }));
    const out = await checkpointPhotos({ sessionId: '091926', photosPath: null }, cfg());
    expect('photosPath' in out).toBe(false);
    expect(out.currentPhase).toBe(PHASES.PHOTOS);
  });

  it('writes no photosPath on the skip path (the value is already in state)', async () => {
    const out = await checkpointPhotos({ sessionId: '091926', photosPath: 'D:/x' }, cfg());
    expect('photosPath' in out).toBe(false);
  });
});
