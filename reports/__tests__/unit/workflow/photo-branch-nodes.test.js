/**
 * The two node-level halves of the photo late-join.
 *
 * fetchSessionPhotos: ONE owner of the path, and a missing folder is an ERROR.
 *   Returning `[]` for a missing directory is how a typo used to produce a
 *   photo-less article with no error anywhere (C1).
 * detectWhiteboard: the user-supplied path is checked BEFORE the empty-photos
 *   return. It used to come after, so a director who named the whiteboard
 *   explicitly got null - and with the chain behind arc selection that ordering
 *   would leak the whiteboard into the article (I1).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { fetchSessionPhotos } = require('../../../lib/workflow/nodes/fetch-nodes');
const { detectWhiteboard } = require('../../../lib/workflow/nodes/photo-nodes');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-branch-')); });

describe('fetchSessionPhotos', () => {
  it('scans exactly state.photosPath', async () => {
    fs.writeFileSync(path.join(tmp, 'a.jpg'), 'x');
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x');
    const out = await fetchSessionPhotos({ sessionId: '091926', sessionPhotos: null, photosPath: tmp }, {});
    expect(out.sessionPhotos).toEqual([path.join(tmp, 'a.jpg')]);
  });

  it('ignores rawSessionInput.photosPath and sessionConfig.photosPath (one owner)', async () => {
    fs.writeFileSync(path.join(tmp, 'a.jpg'), 'x');
    const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-decoy-'));
    fs.writeFileSync(path.join(decoy, 'wrong.jpg'), 'x');
    const out = await fetchSessionPhotos({
      sessionId: '091926',
      sessionPhotos: null,
      photosPath: tmp,
      rawSessionInput: { photosPath: decoy },
      sessionConfig: { photosPath: decoy }
    }, {});
    expect(out.sessionPhotos).toEqual([path.join(tmp, 'a.jpg')]);
  });

  it('throws when photosPath is unset instead of silently finding nothing', async () => {
    await expect(fetchSessionPhotos({ sessionId: '091926', sessionPhotos: null, photosPath: null }, {}))
      .rejects.toThrow(/photosPath is not set/i);
  });

  it('throws, naming the path AND the recovery, when the directory is missing', async () => {
    const missing = path.join(tmp, 'nope');
    // This is the BACKSTOP now (v2 C1): both API entry points validate the folder,
    // so reaching here means it was deleted between the approval and the fetch. The
    // message must name the recovery, because the console's failure card offers a
    // rollback to the LAST GATE SEEN, not to this node (F26).
    await expect(fetchSessionPhotos({ sessionId: '091926', sessionPhotos: null, photosPath: missing }, {}))
      .rejects.toThrow(/Photos directory not found/);
    await expect(fetchSessionPhotos({ sessionId: '091926', sessionPhotos: null, photosPath: missing }, {}))
      .rejects.toThrow(/Roll back to the photos step and supply the folder again/);
  });

  it('still skips on an already-set sessionPhotos, including [] (resume/replay)', async () => {
    const out = await fetchSessionPhotos({ sessionId: '091926', sessionPhotos: [], photosPath: null }, {});
    expect(out).not.toHaveProperty('sessionPhotos');
  });
});

describe('detectWhiteboard', () => {
  it('uses the user-supplied path even with no photos in the folder (I1)', async () => {
    const out = await detectWhiteboard({
      sessionPhotos: [],
      whiteboardPhotoPath: null,
      rawSessionInput: { whiteboardPhotoPath: 'D:/shoots/whiteboard.jpg' }
    }, {});
    expect(out.whiteboardPhotoPath).toBe('D:/shoots/whiteboard.jpg');
  });

  it('returns null with no photos and no user path', async () => {
    const out = await detectWhiteboard({ sessionPhotos: [], whiteboardPhotoPath: null }, {});
    expect(out.whiteboardPhotoPath).toBeNull();
  });

  it('prefers the user path over an in-folder filename match', async () => {
    const out = await detectWhiteboard({
      sessionPhotos: ['/p/whiteboard.jpg'],
      whiteboardPhotoPath: null,
      rawSessionInput: { whiteboardPhotoPath: 'D:/explicit.jpg' }
    }, {});
    expect(out.whiteboardPhotoPath).toBe('D:/explicit.jpg');
  });

  it('still fuzzy-matches the folder when no user path was given', async () => {
    const out = await detectWhiteboard({ sessionPhotos: ['/p/a.jpg', '/p/whiteboard.jpg'], whiteboardPhotoPath: null }, {});
    expect(out.whiteboardPhotoPath).toBe('/p/whiteboard.jpg');
  });

  it('still skips when already detected', async () => {
    const out = await detectWhiteboard({ sessionPhotos: ['/p/whiteboard.jpg'], whiteboardPhotoPath: '/p/prior.jpg' }, {});
    expect(out).not.toHaveProperty('whiteboardPhotoPath');
  });
});
