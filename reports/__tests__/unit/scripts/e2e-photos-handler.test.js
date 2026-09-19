/**
 * The harness's side of the photo late-join.
 *
 * The harness has no unit-testable seam for its handlers (they prompt on stdin),
 * so these are source-level pins in the style of
 * __tests__/unit/console-checkpoint-order.test.js. The --rollback help list is
 * pinned against VALID_ROLLBACK_POINTS because it had ALREADY drifted before this
 * change: it listed `evidence-bundle`, which is not a rollback point, and omitted
 * `await-full-context`, which is.
 */
const fs = require('fs');
const path = require('path');

const { VALID_ROLLBACK_POINTS } = require('../../../lib/workflow/state');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'scripts', 'e2e-walkthrough.js'), 'utf8'
);

describe('e2e-walkthrough photo late-join wiring', () => {
  it('routes the photos checkpoint to a handler', () => {
    expect(SRC).toMatch(/'photos': handlePhotos/);
    expect(SRC).toMatch(/function handlePhotos\(/);
  });

  it('answers the photos gate in --auto mode from the gate pre-fill, then the default dir', () => {
    const block = SRC.slice(SRC.indexOf('function getDefaultApprovalForProfile'));
    const fn = block.slice(0, block.indexOf('\n}\n'));
    expect(fn).toMatch(/case 'photos':/);
    // v2 I4: the folder must be CREATED, not just named. fetchSessionPhotos throws
    // on a missing directory and buildResumePayload refuses one, so a fixture
    // session with no data/<id>/photos would otherwise dead-end --auto.
    expect(fn).toMatch(/mkdirSync\([^)]*defaultDir/);
    // v2 M1: --auto must PREFER checkpointData.photosPath. Answering defaultDir
    // unconditionally re-analyses data/<id>/photos — the PROCESSED copies from the
    // first pass — instead of the folder the gate offered, which after a `photos`
    // rollback is the custom one the director just corrected to (via
    // _previousPhotosPath) and on an old thread is rawSessionInput.photosPath.
    // Same images, wrong folder.
    expect(fn).toMatch(/checkpointData\.photosPath\s*\|\|\s*checkpointData\.defaultDir/);
    // And it must mkdir ONLY when the answer IS the default dir, mirroring
    // handlePhotos: creating a custom path hides a missing custom folder instead of
    // letting it reach the server's "Photos directory not found" 400.
    expect(fn).toMatch(/===\s*checkpointData\.defaultDir[\s\S]*?mkdirSync\(checkpointData\.defaultDir/);
  });

  it('creates the folder in the interactive handler too (v2 I4)', () => {
    const block = SRC.slice(SRC.indexOf('async function handlePhotos'));
    const fn = block.slice(0, block.indexOf('\n}\n'));
    expect(fn).toMatch(/mkdirSync/);
    // The guard must compare the RETURNED path against checkpoint.defaultDir, not
    // against the prefill (which can be a previously-typed custom path after a
    // rollback). Creating a custom path here would hide a missing custom folder
    // instead of letting it reach the server's "Photos directory not found" 400.
    expect(fn).toMatch(/photosPath === checkpoint\.defaultDir[\s\S]*?mkdirSync\(checkpoint\.defaultDir/);
  });

  it('no longer forces a photosPath into /start from the session directory', () => {
    const block = SRC.slice(SRC.indexOf('async function loadSessionInput'), SRC.indexOf('function loadInputFile'));
    expect(block).not.toMatch(/photosPath: photosDir/);
  });
});

describe('the --rollback help list matches VALID_ROLLBACK_POINTS', () => {
  const block = SRC.slice(SRC.indexOf('ROLLBACK VALUES'), SRC.indexOf('EXAMPLES:'));

  it('lists every real rollback point', () => {
    VALID_ROLLBACK_POINTS.forEach((point) => {
      expect(block).toContain(point);
    });
  });

  it('lists no name that is not a rollback point', () => {
    expect(block).not.toContain('evidence-bundle');
  });
});

describe('the smart-defaults profile covers the photos gate', () => {
  const profile = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'config', 'auto-profiles', 'smart-defaults.json'), 'utf8'
  ));

  it('has a photos entry', () => {
    expect(profile.checkpoints.photos).toBeDefined();
    expect(profile.checkpoints.photos.strategy).toBe('approve');
  });
});
