/**
 * assembleHtml photo copy (operator gate, 2026-09-19)
 *
 * The copy into outputs/sessionphotos/<id>/ iterated fs.readdirSync(photosDir) and
 * copyFileSync'd every entry. A subfolder inside the photos folder (data/<id>/photos/group/,
 * which the 071826 photo set carries) made copyFileSync throw EPERM at the LAST node of
 * the run, after every paid call had completed. The copy now takes top-level files only
 * and reports how many it copied.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { _testing } = require('../workflow/nodes/template-nodes');

function makePhotosDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-photo-copy-'));
  const src = path.join(root, 'photos');
  fs.mkdirSync(path.join(src, 'group'), { recursive: true });
  fs.writeFileSync(path.join(src, 'a.jpg'), 'jpg-a');
  fs.writeFileSync(path.join(src, 'whiteboard.jpg'), 'jpg-w');
  fs.writeFileSync(path.join(src, 'group', 'g1.jpg'), 'jpg-g1');
  return { root, src, dest: path.join(root, 'out', 'sessionphotos', '0919269') };
}

describe('copySessionPhotos', () => {
  test('copies the top-level files, skips subdirectories, and returns the count', () => {
    const { src, dest } = makePhotosDir();
    const copied = _testing.copySessionPhotos(src, dest);
    expect(copied).toBe(2);
    expect(fs.readdirSync(dest).sort()).toEqual(['a.jpg', 'whiteboard.jpg']);
    expect(fs.existsSync(path.join(dest, 'group'))).toBe(false);
  });

  test('returns 0 and creates nothing when the source folder is missing', () => {
    const { root } = makePhotosDir();
    const dest = path.join(root, 'out2', 'sessionphotos', 'x');
    expect(_testing.copySessionPhotos(path.join(root, 'nope'), dest)).toBe(0);
    expect(fs.existsSync(dest)).toBe(false);
  });
});
