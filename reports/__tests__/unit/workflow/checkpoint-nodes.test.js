/**
 * Checkpoint Nodes Unit Tests
 *
 * Tests checkpoint nodes that pause the workflow for human approval.
 * Focuses on correct data wiring (what state fields reach the UI).
 *
 * Bug regression tests:
 * - checkpointAwaitRoster must carry NO photo keys (the photo chain runs later)
 * - tagTokenDispositions must re-tag tokens even when all have existing dispositions
 */

// Mock checkpoint-helpers — captures interrupt calls so we can inspect payloads
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const {
  checkpointAwaitRoster,
  _testing: { checkpointAwaitRoster: rawCheckpointAwaitRoster, checkpointCharacterIds }
} = require('../../../lib/workflow/nodes/checkpoint-nodes');

const { checkpointInterrupt } = require('../../../lib/workflow/checkpoint-helpers');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { _testing: { checkpointArticle } } = require('../../../lib/workflow/nodes/checkpoint-nodes');

describe('checkpoint-nodes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkpointAwaitRoster', () => {
    it('no longer sends photo data — the photos are not fetched yet (M3)', async () => {
      // Photo late-join: the chain runs after arc selection, so photoAnalyses and
      // whiteboardPhotoPath were ALWAYS empty at this gate. The console rendered a
      // "Photo Analyses (0 total)" block and a red "Whiteboard: Not Found" badge on
      // every run, which is worse than saying nothing.
      const state = {
        photoAnalyses: { analyses: [{ filename: 'stale.jpg' }] },   // cannot exist here
        whiteboardPhotoPath: 'data/0216/photos/whiteboard.jpg',      // cannot exist here
        canonicalCharacters: { Vic: 'Victoria Blackwood' },
        roster: null
      };

      await checkpointAwaitRoster(state, {});

      const payload = checkpointInterrupt.mock.calls[0][1];
      expect('genericPhotoAnalyses' in payload).toBe(false);
      expect('whiteboardPhotoPath' in payload).toBe(false);
      expect(payload.canonicalCharacters).toEqual({ Vic: 'Victoria Blackwood' });
      expect(payload.message).toBe('Provide the roster (names and pronouns). Photos are not needed yet.');
      expect(checkpointInterrupt.mock.calls[0][0]).toBe('await-roster');
      expect(checkpointInterrupt.mock.calls[0][2]).toBeNull();
    });

    it('skips interrupt when roster is already provided', async () => {
      const state = { canonicalCharacters: {}, roster: ['Alice', 'Bob', 'Charlie'] };

      await checkpointAwaitRoster(state, {});

      expect(checkpointInterrupt).toHaveBeenCalledWith(
        'await-roster',
        expect.any(Object),
        ['Alice', 'Bob', 'Charlie']
      );
    });

    it('defaults canonicalCharacters to {} so the console can always index it', async () => {
      await checkpointAwaitRoster({ roster: null }, {});
      expect(checkpointInterrupt.mock.calls[0][1].canonicalCharacters).toEqual({});
    });
  });

  describe('checkpointCharacterIds old-graph guard (C5)', () => {
    it('throws when reached without arcs having ever been analysed', async () => {
      // A thread paused at character-ids on the PREVIOUS graph triggers this node
      // on its first Resume (a plain edge is a channel named after the TARGET, so
      // the pending write still fires it), and the node's outgoing writes then
      // follow the NEW graph: parseCharacterIds, finalizePhotoAnalyses,
      // buildArcEvidencePackages with zero arcs, then a PAID generateOutline and
      // evaluateOutline. Fail before the interrupt instead.
      await expect(checkpointCharacterIds({ photoAnalyses: { analyses: [] }, roster: ['Vic'] }, {}))
        .rejects.toThrow(/previous graph/i);
      await expect(checkpointCharacterIds({ photoAnalyses: null, roster: null }, {}))
        .rejects.toThrow(/await-full-context/);
    });

    it('does not throw on the normal path', async () => {
      const out = await checkpointCharacterIds({
        photoAnalyses: { analyses: [] }, roster: ['Vic'],
        narrativeArcs: [{ id: 'arc-1' }], selectedArcs: ['arc-1'], characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it('does not throw on the human-revision-cap forward, where selectedArcs IS empty (v2 I1)', async () => {
      // routeAfterArcCheckpoint forces `forward` with an EMPTY selection once the
      // human cap is reached, and under the new edges that path runs through this
      // gate. Discriminating on selectedArcs would kill it with a message that is
      // false ("previous graph") and a recovery that is wrong ("roll back to
      // await-full-context"). narrativeArcs is the real discriminator: an
      // old-graph thread never ran analyzeArcs.
      const { REVISION_CAPS } = require('../../../lib/workflow/state');
      const out = await checkpointCharacterIds({
        photoAnalyses: { analyses: [] }, roster: ['Vic'],
        selectedArcs: [],
        narrativeArcs: [{ id: 'arc-1' }],
        humanArcRevisionCount: REVISION_CAPS.HUMAN_ARCS,
        characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it('accepts _arcAnalysisCache alone, for an analysed run whose arcs were all filtered', async () => {
      // validateArcStructure drops arcs with no evidence AND no characters, and
      // routeArcValidation/routeArcEvaluation escalate the resulting 0-arc state to
      // the human gate instead of revising futilely. That run HAS analysed its arcs,
      // so it must not be told it was started on the previous graph.
      const out = await checkpointCharacterIds({
        photoAnalyses: { analyses: [] }, roster: ['Vic'],
        narrativeArcs: [], selectedArcs: [],
        _arcAnalysisCache: { synthesizedAt: '2026-09-19T00:00:00.000Z', architecture: 'split-call' },
        characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it('accepts an arcs evaluation entry alone (arcs seeded, then all filtered)', async () => {
      // checkpointArcSelection is only reachable through evaluateArcs, so every
      // new-graph path to this gate carries an `arcs` entry — including a resumed
      // run whose seeded arcs were filtered away and whose evaluation was skipped
      // on that pre-seeded entry, so nothing wrote _arcAnalysisCache.
      const out = await checkpointCharacterIds({
        photoAnalyses: { analyses: [] }, roster: ['Vic'],
        narrativeArcs: [],
        evaluationHistory: [{ phase: 'arcs', ready: true }],
        characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it('accepts _previousArcs alone as evidence that arcs were analysed', async () => {
      // reviseArcs stashes the prior arcs there and nulls narrativeArcs on the way
      // into a revision; a timeout can leave the state in exactly that shape.
      const out = await checkpointCharacterIds({
        photoAnalyses: null, roster: ['Vic'],
        narrativeArcs: [], _previousArcs: [{ id: 'arc-1' }], characterIdMappings: null
      }, {});
      expect(out.currentPhase).toBeDefined();
    });
  });
  describe('checkpointArticle writes the approved bundle (brief 1.6)', () => {
    // The director's approved version existed nowhere on disk: the writer's last
    // version is in the checkpoint database and the published HTML is rendered,
    // so nothing could be compared after a run without reading the report back.
    // The update the console sends is applied BEFORE this node re-executes (F25),
    // so state.contentBundle here IS what the director approved, edits included.
    let dataDir;
    const BUNDLE = { headline: { main: 'The Ledger Says Otherwise' }, sections: [] };

    beforeEach(() => {
      dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-approved-'));
    });

    const approvedPath = (sessionId) =>
      path.join(dataDir, sessionId, 'output', 'content-bundle.approved.json');

    it('writes it to the session folder on approve', async () => {
      const out = await checkpointArticle(
        { sessionId: '091826', contentBundle: BUNDLE },
        { configurable: { dataDir } }
      );

      expect(out.articleApproved).toBe(true);
      expect(JSON.parse(fs.readFileSync(approvedPath('091826'), 'utf-8'))).toEqual(BUNDLE);
    });

    it('takes the session id from the state, never from the bundle', async () => {
      // parseRawInput's post-mortem: a model-supplied id wrote session 071126's
      // inputs to data/0711/. The id is the thread, and nothing else.
      await checkpointArticle(
        { sessionId: '091826', contentBundle: { ...BUNDLE, metadata: { sessionId: '0918' } } },
        { configurable: { dataDir } }
      );

      expect(fs.existsSync(approvedPath('091826'))).toBe(true);
      expect(fs.existsSync(approvedPath('0918'))).toBe(false);
    });

    it('does not fail the approval when the write fails', async () => {
      // A full disk or a locked folder must not cost the director the approval:
      // the file is a side effect of the gate, not its product.
      const blocked = path.join(dataDir, 'not-a-directory');
      fs.writeFileSync(blocked, 'this is a file');

      const out = await checkpointArticle(
        { sessionId: '091826', contentBundle: BUNDLE },
        { configurable: { dataDir: blocked } }
      );

      expect(out.articleApproved).toBe(true);
    });

    it('writes nothing when there is no session id', async () => {
      const out = await checkpointArticle(
        { contentBundle: BUNDLE },
        { configurable: { dataDir } }
      );

      expect(out.articleApproved).toBe(true);
      expect(fs.readdirSync(dataDir)).toEqual([]);
    });

    it('writes nothing on a replay of an already-approved article', async () => {
      // skipCondition short-circuits the interrupt; the approve branch is not the
      // director's approval this time, it is the graph walking back through it.
      const out = await checkpointArticle(
        { sessionId: '091826', contentBundle: BUNDLE, articleApproved: true },
        { configurable: { dataDir } }
      );

      expect(out.articleApproved).toBeUndefined();
      expect(fs.readdirSync(dataDir)).toEqual([]);
    });
  });
});
