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

  // Brief 4.5 (R2): the guard reads the weave. A thread that reaches the character-IDs stop
  // with no weave was started before the story meeting existed (or before the photo
  // late-join, when this stop ran before arc analysis): the parse, the curation and the
  // photos are kept by a rollback to the story meeting, which writes the weave fresh.
  describe('checkpointCharacterIds: the guard reads the weave (brief 4.5)', () => {
    const WEAVE = { story: 's', question: 'q', headline: 'h', threads: [{ id: 't1', claim: 'c', role: 'main-thread', receipt: 'ledger', verdict: true }], connections: [], convergence: 'v', questions: [] };

    it('throws when reached with no weave, telling the director to roll back to the story meeting', async () => {
      await expect(checkpointCharacterIds({ photoAnalyses: { analyses: [] }, roster: ['Vic'] }, {}))
        .rejects.toThrow(/story meeting/);
      await expect(checkpointCharacterIds({ photoAnalyses: null, roster: null }, {}))
        .rejects.toThrow(/arc-selection/);
    });

    it('does not throw on the normal path: the weave the meeting settled', async () => {
      const out = await checkpointCharacterIds({ photoAnalyses: { analyses: [] }, roster: ['Vic'], weave: WEAVE, characterIdMappings: null }, {});
      expect(out.currentPhase).toBeDefined();
    });

    it.each([
      ['its arcs', { narrativeArcs: [{ id: 'arc-1' }], selectedArcs: ['arc-1'] }],
      ['its arc analysis cache', { narrativeArcs: [], _arcAnalysisCache: { synthesizedAt: '2026-09-19T00:00:00.000Z', architecture: 'split-call' } }],
      ['an arcs evaluation entry', { narrativeArcs: [], evaluationHistory: [{ phase: 'arcs', ready: true }] }],
      ['the arcs a rework stashed', { narrativeArcs: [], _previousArcs: [{ id: 'arc-1' }] }]
    ])('a thread from before the story meeting, with %s and no weave, is told to roll back to the meeting', async (_name, shape) => {
      await expect(checkpointCharacterIds({ photoAnalyses: { analyses: [] }, roster: ['Vic'], characterIdMappings: null, ...shape }, {}))
        .rejects.toThrow(/Roll back to the story meeting \(arc-selection\)/);
    });
  });

  // Brief 4.5: the story meeting's stop. The payload resumes it as an approval or as one of
  // the director's rounds; the approval is the stop's to set, and it writes the approved
  // weave beside the session's other approved versions.
  describe('checkpointArcSelection: the story meeting (brief 4.5)', () => {
    const { _testing: { checkpointArcSelection } } = require('../../../lib/workflow/nodes/checkpoint-nodes');
    const WEAVE = { story: 's', question: 'q', headline: 'h', threads: [{ id: 't1', claim: 'c', role: 'main-thread', receipt: 'ledger', verdict: true }], connections: [], convergence: 'v', questions: [] };
    let dataDir;
    beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-meeting-')); });
    afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    const approvedWeave = (sessionId) => path.join(dataDir, sessionId, 'analysis', 'weave.approved.json');

    it('shows the weave, and skips once the meeting is approved', async () => {
      checkpointInterrupt.mockReturnValueOnce({ approved: true });
      await checkpointArcSelection({ sessionId: '100326', weave: WEAVE }, { configurable: { dataDir } });
      expect(checkpointInterrupt.mock.calls[0][0]).toBe('arc-selection');
      expect(checkpointInterrupt.mock.calls[0][1]).toEqual({ weave: WEAVE });
      expect(checkpointInterrupt.mock.calls[0][2]).toBeNull();

      jest.clearAllMocks();
      const replay = await checkpointArcSelection({ sessionId: '100326', weave: WEAVE, meetingApproved: true }, { configurable: { dataDir } });
      expect(checkpointInterrupt.mock.calls[0][2]).toBe(true);
      expect(replay).not.toHaveProperty('meetingApproved');
    });

    it("an approve sets the meeting's approval, ends the round's report and marks, and writes weave.approved.json", async () => {
      checkpointInterrupt.mockReturnValueOnce({ approved: true });
      const out = await checkpointArcSelection({ sessionId: '100326', weave: { ...WEAVE, _factCheck: { at: 't', ready: true, fixes: 0 } } }, { configurable: { dataDir } });
      expect(out).toMatchObject({ meetingApproved: true, _meetingRound: null, _weaveHandEditReport: null, _weaveMarks: null });
      expect(out).not.toHaveProperty('_weaveHandEdits');
      expect(out).not.toHaveProperty('_weaveBaseline');
      expect(JSON.parse(fs.readFileSync(approvedWeave('100326'), 'utf-8'))).toEqual({ ...WEAVE, _factCheck: { at: 't', ready: true, fixes: 0 } });
    });

    it('writes nothing on a replay of an approved meeting, or without a session id', async () => {
      await checkpointArcSelection({ sessionId: '100326', weave: WEAVE, meetingApproved: true }, { configurable: { dataDir } });
      checkpointInterrupt.mockReturnValueOnce({ approved: true });
      await checkpointArcSelection({ weave: WEAVE }, { configurable: { dataDir } });
      expect(fs.readdirSync(dataDir)).toEqual([]);
    });

    it.each(['reweave', 'send-back'])('a %s marks the round and approves nothing', async (round) => {
      checkpointInterrupt.mockReturnValueOnce({ approved: false, round });
      const out = await checkpointArcSelection({ sessionId: '100326', weave: WEAVE }, { configurable: { dataDir } });
      expect(out).toMatchObject({ _meetingRound: round });
      expect(out).not.toHaveProperty('meetingApproved');
      expect(fs.readdirSync(dataDir)).toEqual([]);
    });

    it('refuses a resume that is neither an approval nor a round', async () => {
      checkpointInterrupt.mockReturnValueOnce({ selectedArcs: ['arc-1'] });
      await expect(checkpointArcSelection({ sessionId: '100326', weave: WEAVE }, { configurable: { dataDir } }))
        .rejects.toThrow(/approve, reweave or send-back/);
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
      // the file is a side effect of the stop, not its product.
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

/**
 * checkpointCharacterIds keeps the director's photo descriptions (phase 2, brief 2.2):
 * captured from the resume, as the IDs are, and written to the session folder.
 */
describe('checkpointCharacterIds: the per-photo descriptions', () => {
  const PHOTO_7 = "Alex and Sam react to a memory they've just unlocked.";
  let dataDir;

  beforeEach(() => {
    jest.clearAllMocks();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-photo-desc-'));
  });
  afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

  const analysedState = {
    sessionId: '092026',
    photoAnalyses: { analyses: [{ filename: 'aln092026 (7 of 9).jpg' }] },
    roster: ['Alex', 'Sam'],
    weave: { story: 's', question: 'q', headline: 'h', threads: [{ id: 't1', claim: 'c', role: 'main-thread', receipt: 'ledger', verdict: true }], connections: [], convergence: 'v', questions: [] },
    characterIdMappings: null
  };

  it('captures the map beside the raw text and writes inputs/photo-descriptions.json', async () => {
    checkpointInterrupt.mockReturnValueOnce({
      characterIdsRaw: 'Photo aln092026 (7 of 9).jpg:',
      photoDescriptions: { 'aln092026 (7 of 9).jpg': PHOTO_7 }
    });

    const out = await checkpointCharacterIds({ ...analysedState }, { configurable: { dataDir } });

    expect(out.characterIdsRaw).toBe('Photo aln092026 (7 of 9).jpg:');
    expect(out.photoDescriptions).toEqual({ 'aln092026 (7 of 9).jpg': PHOTO_7 });
    const file = path.join(dataDir, '092026', 'inputs', 'photo-descriptions.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ 'aln092026 (7 of 9).jpg': PHOTO_7 });
  });

  it('writes nothing and adds no key when the resume carried no descriptions', async () => {
    checkpointInterrupt.mockReturnValueOnce({ characterIdsRaw: 'Photo a.jpg:' });

    const out = await checkpointCharacterIds({ ...analysedState }, { configurable: { dataDir } });

    expect(out).not.toHaveProperty('photoDescriptions');
    expect(fs.readdirSync(dataDir)).toEqual([]);
  });
});

/**
 * The leave-out box (phase 4, brief 4.2): the stop's choices ride beside the
 * descriptions. buildResumePayload writes them through the update, which is what keeps
 * them on a structured approval (the stop skips on its mappings); on the raw path the
 * node captures them from the resume too, as it captures the descriptions.
 */
describe('checkpointCharacterIds: the leave-out choices', () => {
  const analysedState = {
    sessionId: null,
    photoAnalyses: { analyses: [{ filename: 'a.jpg' }, { filename: 'b.jpg' }] },
    weave: { story: 's', question: 'q', headline: 'h', threads: [{ id: 't1', claim: 'c', role: 'main-thread', receipt: 'ledger', verdict: true }], connections: [], convergence: 'v', questions: [] },
    characterIdMappings: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('captures them beside the raw text', async () => {
    checkpointInterrupt.mockReturnValueOnce({ characterIdsRaw: 'Photo b.jpg:', leftOutPhotos: ['b.jpg'] });
    const out = await checkpointCharacterIds({ ...analysedState }, {});
    expect(out.characterIdsRaw).toBe('Photo b.jpg:');
    expect(out.leftOutPhotos).toEqual(['b.jpg']);
  });

  it('captures an empty choice too: every box clear', async () => {
    checkpointInterrupt.mockReturnValueOnce({ characterIdsRaw: 'Photo b.jpg:', leftOutPhotos: [] });
    const out = await checkpointCharacterIds({ ...analysedState }, {});
    expect(out.leftOutPhotos).toEqual([]);
  });

  it('adds no key when the resume carried no choices', async () => {
    checkpointInterrupt.mockReturnValueOnce({ characterIdsRaw: 'Photo b.jpg:' });
    const out = await checkpointCharacterIds({ ...analysedState }, {});
    expect(out).not.toHaveProperty('leftOutPhotos');
  });
});
