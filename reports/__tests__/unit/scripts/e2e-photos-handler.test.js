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

  it('answers the photos gate in --auto mode from the payload default dir', () => {
    const block = SRC.slice(SRC.indexOf('function getDefaultApprovalForProfile'));
    const fn = block.slice(0, block.indexOf('\n}\n'));
    expect(fn).toMatch(/case 'photos':/);
    // v2 I4: the folder must be CREATED, not just named. fetchSessionPhotos throws
    // on a missing directory and buildResumePayload refuses one, so a fixture
    // session with no data/<id>/photos would otherwise dead-end --auto.
    expect(fn).toMatch(/mkdirSync\([^)]*defaultDir/);
  });

  it('creates the folder in the interactive handler too (v2 I4)', () => {
    const block = SRC.slice(SRC.indexOf('async function handlePhotos'));
    expect(block.slice(0, block.indexOf('\n}\n'))).toMatch(/mkdirSync/);
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
