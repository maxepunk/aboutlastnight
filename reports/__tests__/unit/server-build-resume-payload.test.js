process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * buildResumePayload Unit Tests
 *
 * Covers each stop's approval shapes. Phase 4 (brief 4.6): the outline is the story map,
 * whose payload is {outline: 'approve' | 'send-back', map, note} (the 4.6 describe at the
 * end); the old outline payload's describes went with it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildResumePayload } = require('../../server.js');

// Phase 4 (brief 4.6): a map the stop showed, which passes the map checks (invented text).
const { MAP } = require('../../lib/__tests__/fixtures/rework-state');
const mapFixture = () => JSON.parse(JSON.stringify(MAP));

describe('buildResumePayload — rosterPronouns forwarding (F1 / CR-1 regression)', () => {
  it('forwards approvals.rosterPronouns into BOTH resume and stateUpdates when roster is present', () => {
    const result = buildResumePayload({
      roster: ['Vic', 'Sam'],
      rosterPronouns: { Vic: 'she/her', Sam: 'he/him' }
    });
    expect(result.error).toBeNull();
    expect(result.resume.roster).toEqual(['Vic', 'Sam']);
    // The link CR-1 severed: pronouns must ride along on resume + stateUpdates.
    expect(result.resume.rosterPronouns).toEqual({ Vic: 'she/her', Sam: 'he/him' });
    expect(result.stateUpdates.rosterPronouns).toEqual({ Vic: 'she/her', Sam: 'he/him' });
  });

  it('forwards roster without rosterPronouns when none supplied (no undefined keys injected)', () => {
    const result = buildResumePayload({ roster: ['Vic'] });
    expect(result.error).toBeNull();
    expect(result.resume.roster).toEqual(['Vic']);
    expect('rosterPronouns' in result.resume).toBe(false);
    expect('rosterPronouns' in result.stateUpdates).toBe(false);
  });

  it('ignores rosterPronouns when roster is absent/invalid (no orphan pronouns)', () => {
    const result = buildResumePayload({ rosterPronouns: { Vic: 'she/her' } });
    // roster branch never fires → pronouns must NOT leak through on their own.
    expect('rosterPronouns' in result.resume).toBe(false);
    expect('rosterPronouns' in result.stateUpdates).toBe(false);
  });
});

describe('buildResumePayload — articleEdits validation (B6)', () => {
  // The article checkpoint's JSON editor previously fed straight into
  // stateUpdates.contentBundle with no shape check, so one dropped key routed
  // validateContentBundle -> END after 10 checkpoints and 5+ Opus calls.
  const validBundle = () => JSON.parse(JSON.stringify(
    require('../fixtures/content-bundles/valid-journalist.json')
  ));

  it('applies a schema-valid content bundle', () => {
    const edits = validBundle();
    const result = buildResumePayload({ article: true, articleEdits: edits });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.contentBundle).toEqual(edits);
  });

  it('rejects an edit missing required top-level keys and does NOT apply it', () => {
    const result = buildResumePayload({ article: true, articleEdits: { headline: { main: 'x' } } });
    expect(result.error).toEqual(expect.stringContaining('content-bundle'));
    expect(result.error).toEqual(expect.stringContaining('sections'));
    expect(result.stateUpdates.contentBundle).toBeUndefined();
  });

  it('rejects an edit whose sections went from array to string', () => {
    const edits = validBundle();
    edits.sections = 'THE STORY: everything happened at once.';
    const result = buildResumePayload({ article: true, articleEdits: edits });
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (content-bundle)'));
    expect(result.error).toEqual(expect.stringContaining('/sections'));
    expect(result.stateUpdates.contentBundle).toBeUndefined();
  });

  it('refuses a malformed articleEdits on rejection (article:false)', () => {
    const result = buildResumePayload({
      article: false,
      articleFeedback: 'tighten the lede',
      articleEdits: { headline: { main: 'should not be applied' } }
    });
    expect(result.error).toMatch(/Edited article failed schema validation \(content-bundle\)/);
    expect(result.stateUpdates.contentBundle).toBeUndefined();
    expect(result.stateUpdates._articleFeedback).toBeUndefined();
  });

  it('approves without edits when articleEdits is omitted', () => {
    const result = buildResumePayload({ article: true });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.contentBundle).toBeUndefined();
  });
});

describe('buildResumePayload — input review (CODE-REVIEW B2/B8)', () => {
  it('approves the parse with inputReview:true', () => {
    const result = buildResumePayload({ inputReview: true });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.resume.feedback).toBeUndefined();
  });

  it('no longer writes the dead _inputEdits channel', () => {
    const result = buildResumePayload({ inputReview: true, inputEdits: { 'sessionConfig.roster': ['Vic'] } });
    expect(result.error).toBeNull();
    expect('_inputEdits' in result.stateUpdates).toBe(false);
  });

  it('rejects with corrections on inputReview:false + inputFeedback', () => {
    const result = buildResumePayload({
      inputReview: false,
      inputFeedback: '  Blake said the dead-man line, not Casper  '
    });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(false);
    expect(result.resume.feedback).toBe('Blake said the dead-man line, not Casper');
  });

  it('is not a valid approval when inputReview:false carries no feedback', () => {
    const result = buildResumePayload({ inputReview: false });
    expect(result.error).toEqual(expect.stringContaining('No valid approval'));
  });

  it('is not a valid approval when inputFeedback is blank', () => {
    const result = buildResumePayload({ inputReview: false, inputFeedback: '   ' });
    expect(result.error).toEqual(expect.stringContaining('No valid approval'));
  });
});

describe('fullContext approval clears the parse it replaces (operator gate 2026-09-19)', () => {
  // loadDirectorNotes rehydrates sessionConfig/directorNotes from data/<id>/inputs/*.json on
  // any replay where directorNotes is null (a forced Start Fresh of a reused id, a rollback
  // to await-full-context), and parseRawInput skips whenever sessionConfig is populated.
  // The interrupted node re-executes with the update already applied, so the gate's own
  // "capture" branch never runs on the API path: the re-parse trigger must ride on the update.
  const { buildResumePayload } = require('../../server.js');
  const full = { accusation: 'Vic, 9 votes', sessionReport: '# Session Report', directorNotes: 'notes' };

  test('nulls sessionConfig, directorNotes and playerFocus so parseRawInput runs on the new inputs', () => {
    const { stateUpdates, error } = buildResumePayload({ fullContext: full }, { sessionConfig: { roster: ['Old'] } }, 'journalist');
    expect(error).toBeNull();
    expect(stateUpdates.directorNotesRaw).toBe('notes');
    expect(stateUpdates.sessionConfig).toBeNull();
    expect(stateUpdates.directorNotes).toBeNull();
    expect(stateUpdates.playerFocus).toBeNull();
  });
});

describe('buildResumePayload — photosPath is a photos-gate-only approval (C1/I3/v2 M2)', () => {
  let dir;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-approve-')); });

  it('accepts an existing path at the photos checkpoint', () => {
    const result = buildResumePayload({ photosPath: dir }, {}, 'journalist', 'photos');
    expect(result.error).toBeNull();
    expect(result.resume.photosPath).toBe(dir);
    expect(result.stateUpdates.photosPath).toBe(dir);
  });

  it('consumes the pre-fill stash on the approval that answers the gate (v2 I2)', () => {
    // The APPROVAL clears _previousPhotosPath, not the node. /approve invokes
    // Command({resume, update: stateUpdates}) and the update is applied BEFORE the
    // interrupted node re-executes (F25), so on re-execution state.photosPath is
    // already set, checkpointPhotos skips, and a capture branch inside it could
    // never run on any HTTP path.
    const result = buildResumePayload({ photosPath: dir }, {}, 'journalist', 'photos');
    expect(result.stateUpdates._previousPhotosPath).toBeNull();
  });

  it('does not touch the stash at the two convenience gates (v2 I2)', () => {
    // Those gates do not ANSWER the photos interrupt, so there is no pre-fill to
    // consume — the gate has not been shown yet.
    const evidence = buildResumePayload(
      { evidenceBundle: true, photosPath: dir }, {}, 'journalist', 'evidence-and-photos'
    );
    expect('_previousPhotosPath' in evidence.stateUpdates).toBe(false);

    const arcs = buildResumePayload(
      { selectedArcs: ['a'], photosPath: dir }, {}, 'journalist', 'arc-selection'
    );
    expect('_previousPhotosPath' in arcs.stateUpdates).toBe(false);
  });

  it('strips surrounding quotes and whitespace', () => {
    const result = buildResumePayload({ photosPath: '  "' + dir + '" ' }, {}, 'journalist', 'photos');
    expect(result.resume.photosPath).toBe(dir);
    expect(result.stateUpdates.photosPath).toBe(dir);
  });

  it('refuses a folder that does not exist, naming the path (v2 C1)', () => {
    // The whole point: catch the typo HERE, not an hour later in fetchSessionPhotos
    // where the console cannot offer the photos step as a rollback target (F26).
    const missing = path.join(dir, 'nope');
    const result = buildResumePayload({ photosPath: missing }, {}, 'journalist', 'photos');
    expect(result.error).toBe('Photos directory not found or not a directory: ' + missing);
    expect('photosPath' in result.stateUpdates).toBe(false);
    expect(result.resume.photosPath).toBeUndefined();
  });

  it('refuses a FILE path, not just a missing one (v2 I1)', () => {
    // existsSync() is TRUE for a file, so pasting the path of a photo instead of
    // its folder used to pass this gate, pass fetchSessionPhotos's fs.access, and
    // then die on readdir's ENOTDIR — OUTSIDE the labelled catch, after the paid
    // arc analysis, with a raw scandir error instead of the recovery sentence.
    const file = path.join(dir, 'a.jpg');
    fs.writeFileSync(file, 'x');
    const result = buildResumePayload({ photosPath: file }, {}, 'journalist', 'photos');
    expect(result.error).toBe('Photos directory not found or not a directory: ' + file);
    expect('photosPath' in result.stateUpdates).toBe(false);
    expect(result.resume.photosPath).toBeUndefined();
  });

  // REGRESSION PIN, not a red test (v2 M9): a bare {photosPath} already yields
  // "No valid approval" on today's code, because no block reads the key at all.
  // It is kept so the fourth argument cannot later be widened by accident.
  it('is NOT an approval on its own at outline, article or arc-selection (I3)', () => {
    // checkpointOutline returns {currentPhase} for a resume that is neither
    // approved:true nor approved:false+feedback, routeAfterOutlineCheckpoint sends
    // it to 'revise', and incrementOutlineRevision + reviseOutline + evaluateOutline
    // all run — unattended and paid. Same shape at article and arc-selection.
    ['outline', 'article', 'arc-selection'].forEach((type) => {
      const result = buildResumePayload({ photosPath: dir }, {}, 'journalist', type);
      expect(result.error).toEqual(expect.stringContaining('No valid approval'));
      expect(result.resume.photosPath).toBeUndefined();
    });
  });

  it('writes the state channel at the two convenience gates (I3)', () => {
    // The optional inputs on the evidence and arc-selection gates: the folder lands
    // in state so the `photos` gate skips, without the path being what advanced the
    // graph.
    const evidence = buildResumePayload(
      { evidenceBundle: true, photosPath: '  "' + dir + '"  ' }, {}, 'journalist', 'evidence-and-photos'
    );
    expect(evidence.error).toBeNull();
    expect(evidence.stateUpdates.photosPath).toBe(dir);
    expect(evidence.resume.photosPath).toBeUndefined();

    // Brief 4.5: the story meeting's approve.
    const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
    const arcs = buildResumePayload(
      { meeting: 'approve', weave: JSON.parse(JSON.stringify(WEAVE)), photosPath: dir }, { weave: WEAVE }, 'journalist', 'arc-selection'
    );
    expect(arcs.error).toBeNull();
    expect(arcs.stateUpdates.photosPath).toBe(dir);
  });

  it('does NOT write the state channel at gates downstream of the fetch (v2 M2)', () => {
    // sessionPhotos has already been scanned from a different value by then, so the
    // write would only make state lie about where the photos came from until the
    // next `photos` rollback.
    //
    // v2 M10: each gate carries ITS OWN approval shape. This used to post
    // {article: true} at all three, which is not an approval at character-ids or
    // outline — so those two cases passed because the whole call was refused, not
    // because the photosPath block declined to write.
    const APPROVAL_BY_TYPE = {
      // Task 4.3c: the structured form holds a mapping object per photo.
      'character-ids': { characterIds: { 'p1.jpg': { characterMappings: [{ descriptionIndex: 0, characterName: 'Sarah' }] } } },
      outline: { outline: 'approve', map: mapFixture() },  // brief 4.6: the map's approve
      article: { article: true }
    };
    Object.entries(APPROVAL_BY_TYPE).forEach(([type, approval]) => {
      const result = buildResumePayload({ ...approval, photosPath: dir }, {}, 'journalist', type);
      expect(result.error).toBeNull();          // the gate's own approval IS valid here
      expect('photosPath' in result.stateUpdates).toBe(false);
      expect(result.resume.photosPath).toBeUndefined();
    });
  });

  it('ignores a blank or non-string path everywhere', () => {
    ['', '   ', null, 42, undefined].forEach((value) => {
      const result = buildResumePayload({ photosPath: value }, {}, 'journalist', 'photos');
      expect(result.error).toEqual(expect.stringContaining('No valid approval'));
      expect('photosPath' in result.stateUpdates).toBe(false);
    });
  });
});

describe('buildResumePayload — whiteboardPhotoPath rides along, never approves (R1)', () => {
  const current = { rawSessionInput: { photosPath: 'data/091926/photos', journalistFirstName: 'Cass' } };

  it('merges into rawSessionInput on a full-context approval', () => {
    const result = buildResumePayload({
      fullContext: { accusation: 'a', sessionReport: 's', directorNotes: 'd' },
      whiteboardPhotoPath: '  "D:/shoots/whiteboard.jpg"  '
    }, current, 'journalist', 'await-full-context');
    expect(result.error).toBeNull();
    // The parse has not run at this point, so nothing is re-paid.
    expect(result.stateUpdates.rawSessionInput).toEqual({
      photosPath: 'data/091926/photos',
      journalistFirstName: 'Cass',
      whiteboardPhotoPath: 'D:/shoots/whiteboard.jpg'
    });
  });

  it('nulls the parse outputs so the re-parse actually happens (v2 I3)', () => {
    // Without this the promise in the console copy is false on every replay:
    // Command.update is applied BEFORE the interrupted node re-executes (F25), so
    // checkpointAwaitContext's own gate (accusation && sessionReport &&
    // directorNotesRaw) is already satisfied, it takes the SKIP branch, and its
    // "ROLL-4 re-parse" arm — the code that nulls sessionConfig — never runs.
    // parseRawInput then skips on the sessionConfig that loadDirectorNotes
    // rehydrated from inputs/session-config.json, and the whiteboard is never read.
    const result = buildResumePayload({
      fullContext: { accusation: 'a', sessionReport: 's', directorNotes: 'd' }
    }, current, 'journalist', 'await-full-context');
    expect(result.error).toBeNull();
    expect(result.stateUpdates.sessionConfig).toBeNull();
    expect(result.stateUpdates.directorNotes).toBeNull();
    expect(result.stateUpdates.playerFocus).toBeNull();
  });

  it('does not null the parse outputs when the fullContext is incomplete', () => {
    const result = buildResumePayload(
      { fullContext: { accusation: 'a' } }, current, 'journalist', 'await-full-context'
    );
    expect(result.error).toEqual(expect.stringContaining('No valid approval'));
    expect('sessionConfig' in result.stateUpdates).toBe(false);
  });

  it('merges on an input-review reject with corrections (that path already re-parses)', () => {
    const result = buildResumePayload({
      inputReview: false,
      inputFeedback: 'Blake said the dead-man line',
      whiteboardPhotoPath: 'D:/shoots/whiteboard.jpg'
    }, current, 'journalist', 'input-review');
    expect(result.error).toBeNull();
    expect(result.stateUpdates.rawSessionInput.whiteboardPhotoPath).toBe('D:/shoots/whiteboard.jpg');
  });

  it('is not itself a valid approval anywhere', () => {
    ['await-full-context', 'input-review', 'photos'].forEach((type) => {
      const result = buildResumePayload({ whiteboardPhotoPath: 'D:/x.jpg' }, current, 'journalist', type);
      expect(result.error).toEqual(expect.stringContaining('No valid approval'));
    });
  });

  it('is ignored at every other gate', () => {
    // Brief 4.6: the map's approve.
    const result = buildResumePayload({
      outline: 'approve',
      map: mapFixture(),
      whiteboardPhotoPath: 'D:/x.jpg'
    }, { ...current, outline: mapFixture() }, 'journalist', 'outline');
    expect(result.error).toBeNull();
    expect('rawSessionInput' in result.stateUpdates).toBe(false);
    // Brief 4.5c: the story meeting takes only its own keys, so beside the meeting's
    // approve the rider is refused, and nothing is written.
    const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
    const atMeeting = buildResumePayload({
      meeting: 'approve',
      weave: JSON.parse(JSON.stringify(WEAVE)),
      whiteboardPhotoPath: 'D:/x.jpg'
    }, { ...current, weave: WEAVE }, 'journalist', 'arc-selection');
    expect(atMeeting.error).toContain('This request carries whiteboardPhotoPath, which the story meeting does not take.');
    expect(atMeeting.stateUpdates).toEqual({});
  });
});

describe('reject WITH hand edits (spec 2026-09-19 §4.1)', () => {
  const bundleFixture = () => JSON.parse(JSON.stringify(require('../fixtures/content-bundles/valid-journalist.json')));

  test('article: valid edits are written with a diff scoped to the headline', () => {
    const before = bundleFixture();
    const edits = bundleFixture();
    edits.headline.main = 'A different headline';
    const { stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Cut the second section', articleEdits: edits },
      { contentBundle: before }
    );
    expect(error).toBeNull();
    expect(stateUpdates.contentBundle).toEqual(edits);
    expect(stateUpdates._articleHandEdits.kind).toBe('bundle');
    expect(stateUpdates._articleHandEdits.edits.map((e) => [e.id, e.scope])).toEqual([['E1', 'headline']]);
    expect(stateUpdates._articleHandEditReport).toBeNull();
  });

  test('article: invalid edits return the schema error and write nothing', () => {
    const edits = bundleFixture();
    delete edits.headline;
    const { stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'x', articleEdits: edits },
      { contentBundle: bundleFixture() }
    );
    expect(error).toMatch(/Edited article failed schema validation \(content-bundle\)/);
    expect(stateUpdates.contentBundle).toBeUndefined();
    expect(stateUpdates._articleHandEdits).toBeUndefined();
  });

  test('article: a reject WITHOUT edits resets the diff and report to null', () => {
    const { stateUpdates } = buildResumePayload({ article: false, articleFeedback: 'Rework it' }, { contentBundle: bundleFixture() });
    expect(stateUpdates._articleHandEdits).toBeNull();
    expect(stateUpdates._articleHandEditReport).toBeNull();
  });
});

// F1 (spec 2026-10-02 section 7): the director's edits stand at their stop across every
// send-back, by id. An earlier edit stands while the version the stop showed carries
// its text (a cut, while the text it removed stays absent); an edit a rework changed,
// which the director saw and left, drops. The new diff joins with the next ids.
describe('the director\'s edits stand across send-backs (F1)', () => {
  const bundleFixture = () => JSON.parse(JSON.stringify(require('../fixtures/content-bundles/valid-journalist.json')));
  const INTRO = 'Three months of investigation have revealed a pattern of financial irregularities that raise serious questions about how Dr. James Chen managed his company\'s research funding.';
  const REWRITE = 'Three months of reporting found the money moving through shells, and Dr. Chen signing for it.';

  /** Round 1: the director rewrites the second intro paragraph and cuts the conclusion's one paragraph. */
  function roundOne() {
    const shown = bundleFixture();
    const edits = bundleFixture();
    edits.sections[0].content[1].text = REWRITE;
    const cut = edits.sections[3].content.splice(0, 1)[0];
    const { stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Move the photos.', articleEdits: edits },
      { contentBundle: shown }
    );
    expect(error).toBeNull();
    return { standing: stateUpdates._articleHandEdits, edited: edits, cut };
  }

  test('round 1 numbers the edits E1, E2 with their scopes', () => {
    const { standing, cut } = roundOne();
    expect(standing.issued).toBe(2);
    expect(standing.edits.map((e) => [e.id, e.scope, e.after === null])).toEqual([['E1', 'section:intro', false], ['E2', 'section:conclusion', true]]);
    expect(standing.edits[1].before).toEqual(cut);
  });

  test('a send-back without edits keeps an earlier edit whose text the stop showed', () => {
    const { standing, edited } = roundOne();
    const shown = JSON.parse(JSON.stringify(edited));   // the rework kept both edits
    const { stateUpdates } = buildResumePayload({ article: false, articleFeedback: 'Tighten the money section.' }, { contentBundle: shown, _articleHandEdits: standing });
    expect(stateUpdates._articleHandEdits).toEqual(standing);
    expect(stateUpdates._articleHandEditReport).toBeNull();
    expect(stateUpdates.contentBundle).toBeUndefined();
  });

  test('an edit the shown version changed drops; a cut whose text stayed out stands', () => {
    const { standing, edited } = roundOne();
    const shown = JSON.parse(JSON.stringify(edited));
    shown.sections[0].content[1].text = INTRO;   // the rework put the writer's paragraph back
    const { stateUpdates } = buildResumePayload({ article: false, articleFeedback: 'Again.' }, { contentBundle: shown, _articleHandEdits: standing });
    expect(stateUpdates._articleHandEdits.edits.map((e) => e.id)).toEqual(['E2']);
  });

  test('a cut whose text came back drops', () => {
    const { standing, edited, cut } = roundOne();
    const shown = JSON.parse(JSON.stringify(edited));
    shown.sections[2].content.push(cut);
    const { stateUpdates } = buildResumePayload({ article: false, articleFeedback: 'Again.' }, { contentBundle: shown, _articleHandEdits: standing });
    expect(stateUpdates._articleHandEdits.edits.map((e) => e.id)).toEqual(['E1']);
  });

  test('ids are stable across rounds; the new diff takes the next number', () => {
    const { standing, edited } = roundOne();
    const sentBack = JSON.parse(JSON.stringify(edited));
    sentBack.headline.main = 'Nova Labs Money Ran Through Three Shells';
    const { stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Sharper headline.', articleEdits: sentBack },
      { contentBundle: JSON.parse(JSON.stringify(edited)), _articleHandEdits: standing }
    );
    expect(error).toBeNull();
    expect(stateUpdates._articleHandEdits.edits.map((e) => [e.id, e.path])).toEqual([
      ['E1', 'sections[#intro].content[1].text'], ['E2', 'sections[#conclusion].content[-]'], ['E3', 'headline.main']
    ]);
    expect(stateUpdates._articleHandEdits.issued).toBe(3);
  });

  // Phase 4 (brief 4.6): the map's edits stand the same way, against the writer's last map.
  test('the map\'s edits stand the same way', () => {
    const shown = mapFixture();
    const edits = mapFixture();
    edits.sections[3].beats[0].material = 'Riley: "I kept the books, and the second ledger"';
    const first = buildResumePayload({ outline: 'send-back', note: 'x', map: edits }, { outline: shown, _mapBaseline: shown });
    const standing = first.stateUpdates._outlineHandEdits;
    expect(standing.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#closing].beats[#b6].material']]);
    const second = buildResumePayload({ outline: 'send-back', note: 'y' }, { outline: edits, _mapBaseline: shown, _outlineHandEdits: standing });
    expect(second.stateUpdates._outlineHandEdits).toEqual(standing);
  });

  test('the send-back records, from the session roster, the names a cut removed (FA)', () => {
    const shown = bundleFixture();
    shown.sections[3].content.push({ type: 'paragraph', text: 'Kai said nothing all night, and left before the vote.' });
    const sentBack = JSON.parse(JSON.stringify(shown));
    sentBack.sections[3].content.pop();
    const { stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Cut the Kai line.', articleEdits: sentBack },
      { contentBundle: shown, sessionConfig: { roster: ['Kai', { name: 'Chen' }] } }
    );
    expect(error).toBeNull();
    expect(stateUpdates._articleHandEdits.edits).toEqual([expect.objectContaining({ id: 'E1', after: null, names: ['Kai'] })]);
  });

  test('approve and a rollback clear the standing edits', async () => {
    const { standing, edited } = roundOne();
    expect(standing.edits.map((e) => e.id)).toEqual(['E1', 'E2']);
    let checkpointArticle;
    let buildRollbackState;
    jest.isolateModules(() => {
      jest.doMock('../../lib/workflow/checkpoint-helpers', () => require('../mocks/checkpoint-helpers.mock'));
      ({ _testing: { checkpointArticle } } = require('../../lib/workflow/nodes/checkpoint-nodes'));
      ({ buildRollbackState } = require('../../lib/api-helpers'));
    });
    jest.dontMock('../../lib/workflow/checkpoint-helpers');
    const approved = await checkpointArticle({ contentBundle: edited, evaluationHistory: [], _articleHandEdits: standing, _articleHandEditReport: { checked: ['E1'], changed: [] } }, {});
    expect(approved).toMatchObject({ articleApproved: true, _articleHandEdits: null, _articleHandEditReport: null });
    expect(buildRollbackState('article')).toMatchObject({ _articleHandEdits: null, _articleHandEditReport: null });
  });
});

describe('directorGateNotes (spec 2026-09-19 §5.2)', () => {
  const existing = [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.', at: '2026-09-19T10:00:00.000Z' }];

  // Brief 4.5: the story meeting's send-back.
  test('an arc rejection appends one arc-selection entry with round = existing arc notes + 1', () => {
    const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
    const { stateUpdates } = buildResumePayload({ meeting: 'send-back', note: 'Merge arcs 2 and 3.' }, { weave: WEAVE, directorGateNotes: existing });
    expect(stateUpdates.directorGateNotes).toHaveLength(2);
    expect(stateUpdates.directorGateNotes[0]).toEqual(existing[0]);
    expect(stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'arc-selection', kind: 'rejection', round: 2, text: 'Merge arcs 2 and 3.' });
    expect(stateUpdates.directorGateNotes[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // Brief 4.6: the map's send-back.
  test('an outline rejection appends an outline entry, round 1 when no outline notes exist', () => {
    const { stateUpdates } = buildResumePayload({ outline: 'send-back', note: 'Lead with the ledger.' }, { outline: mapFixture(), directorGateNotes: existing });
    expect(stateUpdates.directorGateNotes.map((n) => n.gate)).toEqual(['arc-selection', 'outline']);
    expect(stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'outline', kind: 'rejection', round: 1, text: 'Lead with the ledger.' });
  });

  test('an article rejection appends an article entry; a missing channel counts as empty', () => {
    const { stateUpdates } = buildResumePayload({ article: false, articleFeedback: 'Name the shell account.' }, { contentBundle: {} });
    expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'article', kind: 'rejection', round: 1, text: 'Name the shell account.' })]);
  });

  // Brief 4.5: the story meeting's approve with no note; the meeting writes no guidance.
  test('an approval with no note appends nothing, and the meeting writes no guidance', () => {
    const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
    const a = buildResumePayload({ meeting: 'approve', weave: JSON.parse(JSON.stringify(WEAVE)) }, { weave: WEAVE, directorGateNotes: existing });
    expect(a.error).toBeNull();
    expect('_outlineGuidance' in a.stateUpdates).toBe(false);
    expect(a.stateUpdates.directorGateNotes).toBeUndefined();
    const o = buildResumePayload({ outline: 'approve', map: mapFixture() }, { outline: mapFixture(), directorGateNotes: existing });
    expect(o.error).toBeNull();
    expect(o.stateUpdates.directorGateNotes).toBeUndefined();
    const ar = buildResumePayload({ article: true }, { directorGateNotes: existing });
    expect(ar.stateUpdates.directorGateNotes).toBeUndefined();
    const blank = buildResumePayload({ outline: 'approve', map: mapFixture(), note: '   ' }, { outline: mapFixture(), directorGateNotes: existing });
    expect(blank.stateUpdates.directorGateNotes).toBeUndefined();
  });

  // Phase 1 brief 1.1: the note box is sent with WHATEVER the director presses.
  // A note sent with an approval stands for every later writer, labelled as an
  // approval note so the prompt can say it is forward guidance, not something a
  // rework already applied.
  test('an approval WITH a note appends one entry of kind approval, trimmed', () => {
    const o = buildResumePayload({ outline: 'approve', map: mapFixture(), note: '  Keep the ledger thread.  ' }, { outline: mapFixture(), directorGateNotes: existing });
    expect(o.stateUpdates.directorGateNotes).toHaveLength(2);
    expect(o.stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'outline', kind: 'approval', round: 1, text: 'Keep the ledger thread.' });
    expect(o.stateUpdates.directorGateNotes[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const a = buildResumePayload({ article: true, articleNote: 'Name the shell account.' }, { contentBundle: {} });
    expect(a.stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'article', kind: 'approval', round: 1, text: 'Name the shell account.' })]);
  });

  test('an approval note travels with edits, and an invalid edit writes no note at all', () => {
    const edited = mapFixture();
    edited.headline = 'The Ledger Kept Talking After the Vote';
    const withEdits = buildResumePayload(
      { outline: 'approve', map: edited, note: 'Keep my headline.' },
      { outline: mapFixture(), directorGateNotes: [] }
    );
    expect(withEdits.error).toBeNull();
    expect(withEdits.stateUpdates.directorGateNotes).toHaveLength(1);
    const bad = buildResumePayload(
      { outline: 'approve', map: { ...mapFixture(), sections: 'collapsed' }, note: 'Keep my headline.' },
      { outline: mapFixture(), directorGateNotes: [] }
    );
    expect(bad.error).toContain('failed the director-side schema');
    expect(bad.stateUpdates.directorGateNotes).toBeUndefined();
  });

  test('round counts per gate AND kind, so an approval 1 and a rejection 1 coexist at one stop', () => {
    const afterApproval = buildResumePayload({ outline: 'approve', map: mapFixture(), note: 'Keep the ledger thread.' }, { outline: mapFixture(), directorGateNotes: [] });
    const notes = afterApproval.stateUpdates.directorGateNotes;
    const afterReject = buildResumePayload({ outline: 'send-back', note: 'Lead with the ledger.' }, { outline: mapFixture(), directorGateNotes: notes });
    expect(afterReject.stateUpdates.directorGateNotes.map((n) => [n.gate, n.kind, n.round])).toEqual([
      ['outline', 'approval', 1],
      ['outline', 'rejection', 1]
    ]);
    const afterSecondApproval = buildResumePayload({ outline: 'approve', map: mapFixture(), note: 'And keep the closing.' }, { outline: mapFixture(), directorGateNotes: afterReject.stateUpdates.directorGateNotes });
    expect(afterSecondApproval.stateUpdates.directorGateNotes[2]).toMatchObject({ gate: 'outline', kind: 'approval', round: 2 });
  });
});

/**
 * The character-IDs stop sends each photo's description as its own field, keyed by
 * filename, beside the raw text (phase 2, brief 2.2). The server keeps it word for
 * word in state and on the resume; checkpointCharacterIds writes the session folder.
 */
describe('buildResumePayload — the per-photo description map (brief 2.2)', () => {
  const PHOTO_7 = "Alex and Sam react to a memory they've just unlocked.";

  it('stores the map beside characterIdsRaw, in state and on the resume', () => {
    const { resume, stateUpdates, error } = buildResumePayload({
      characterIdsRaw: 'Photo aln092026 (7 of 9).jpg:\n  User Input: ' + PHOTO_7,
      photoDescriptions: { 'aln092026 (7 of 9).jpg': PHOTO_7 }
    }, {}, 'journalist', 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates.photoDescriptions).toEqual({ 'aln092026 (7 of 9).jpg': PHOTO_7 });
    expect(resume.photoDescriptions).toEqual({ 'aln092026 (7 of 9).jpg': PHOTO_7 });
    expect(stateUpdates.characterIdsRaw).toContain(PHOTO_7);
  });

  it('keeps the text word for word, trimmed at the ends only, and drops blank boxes', () => {
    const { stateUpdates } = buildResumePayload({
      characterIdsRaw: 'x',
      photoDescriptions: { 'a.jpg': '  Kai, "the quiet one", by the bar.  ', 'b.jpg': '   ' }
    }, {}, 'journalist', 'character-ids');
    expect(stateUpdates.photoDescriptions).toEqual({ 'a.jpg': 'Kai, "the quiet one", by the bar.' });
  });

  it('writes nothing when every box was blank', () => {
    const { stateUpdates, resume } = buildResumePayload({
      characterIdsRaw: 'x', photoDescriptions: { 'a.jpg': '' }
    }, {}, 'journalist', 'character-ids');
    expect(stateUpdates).not.toHaveProperty('photoDescriptions');
    expect(resume).not.toHaveProperty('photoDescriptions');
  });

  it('refuses a map that is not filename -> text', () => {
    expect(buildResumePayload({ characterIdsRaw: 'x', photoDescriptions: ['a'] }, {}, 'journalist', 'character-ids').error)
      .toMatch(/photoDescriptions must be an object/);
    expect(buildResumePayload({ characterIdsRaw: 'x', photoDescriptions: { 'a.jpg': 7 } }, {}, 'journalist', 'character-ids').error)
      .toMatch(/photoDescriptions\["a.jpg"\] must be a string/);
  });

  it('is never an approval on its own', () => {
    const { error, stateUpdates } = buildResumePayload({ photoDescriptions: { 'a.jpg': 'text' } }, {}, 'journalist', 'character-ids');
    expect(error).toBe('No valid approval detected in request');
    expect(stateUpdates).not.toHaveProperty('photoDescriptions');
  });

  it('rides along with the structured characterIds form too', () => {
    const { stateUpdates } = buildResumePayload({
      characterIds: { 'a.jpg': { characterMappings: [] } }, photoDescriptions: { 'a.jpg': 'Kai at the bar.' }
    }, {}, 'journalist', 'character-ids');
    expect(stateUpdates.photoDescriptions).toEqual({ 'a.jpg': 'Kai at the bar.' });
  });
});

/**
 * The leave-out box (phase 4, brief 4.2): the character-IDs stop sends the filenames
 * whose "leave this photo out" box is ticked, beside the descriptions. The server keeps
 * them in the leave-out list, in state (the update, which a structured approval needs:
 * the stop skips on its mappings) and on the resume. For every photo the stop showed the
 * box decides; the parse then writes each choice into the photo's mapping.
 */
describe('buildResumePayload — the leave-out box (brief 4.2)', () => {
  const atStop = (leftOutPhotos = null) => ({
    photoAnalyses: { analyses: [{ filename: 'aln (7 of 9).jpg' }, { filename: 'aln (8 of 9).jpg' }] },
    leftOutPhotos
  });

  it('keeps the ticked filenames beside the raw text, in state and on the resume', () => {
    const { resume, stateUpdates, error } = buildResumePayload({
      characterIdsRaw: 'Photo aln (7 of 9).jpg:', photoDescriptions: { 'aln (7 of 9).jpg': 'Kai at the bar.' },
      leftOutPhotos: ['aln (8 of 9).jpg']
    }, atStop(), 'journalist', 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates.leftOutPhotos).toEqual(['aln (8 of 9).jpg']);
    expect(resume.leftOutPhotos).toEqual(['aln (8 of 9).jpg']);
    expect(stateUpdates.characterIdsRaw).toBe('Photo aln (7 of 9).jpg:');
    // The mappings are the parse's to write: a mapping in the update would make the stop
    // and the parse skip, and the director's text would never be read.
    expect(stateUpdates).not.toHaveProperty('characterIdMappings');
  });

  it('rides along with the structured form, the stop\'s Skip', () => {
    const { stateUpdates, error } = buildResumePayload(
      { characterIds: {}, leftOutPhotos: ['aln (7 of 9).jpg'] }, atStop(), 'journalist', 'character-ids'
    );
    expect(error).toBeNull();
    expect(stateUpdates.characterIdMappings).toEqual({});
    expect(stateUpdates.leftOutPhotos).toEqual(['aln (7 of 9).jpg']);
  });

  it('for every photo the stop showed the box decides: a clear box takes a listed photo off the list', () => {
    const { stateUpdates } = buildResumePayload(
      { characterIdsRaw: 'x', leftOutPhotos: [] }, atStop(['aln (7 of 9).jpg', 'gone.jpg']), 'journalist', 'character-ids'
    );
    expect(stateUpdates.leftOutPhotos).toEqual(['gone.jpg']);
  });

  it('refuses a choice that is not a list of this stop\'s photos', () => {
    expect(buildResumePayload({ characterIdsRaw: 'x', leftOutPhotos: 'aln (7 of 9).jpg' }, atStop(), 'journalist', 'character-ids').error)
      .toBe('leftOutPhotos must be a list of photo filenames');
    expect(buildResumePayload({ characterIdsRaw: 'x', leftOutPhotos: ['ghost.jpg'] }, atStop(), 'journalist', 'character-ids').error)
      .toBe('leftOutPhotos names "ghost.jpg", which is not a photo at this stop');
  });

  it('is never an approval on its own, and leaves the list alone when the stop sent no choices', () => {
    const alone = buildResumePayload({ leftOutPhotos: ['aln (7 of 9).jpg'] }, atStop(), 'journalist', 'character-ids');
    expect(alone.error).toBe('No valid approval detected in request');
    expect(alone.stateUpdates).not.toHaveProperty('leftOutPhotos');
    const noChoices = buildResumePayload({ characterIdsRaw: 'x' }, atStop(['aln (7 of 9).jpg']), 'journalist', 'character-ids');
    expect(noChoices.error).toBeNull();
    expect(noChoices.stateUpdates).not.toHaveProperty('leftOutPhotos');
  });
});

/**
 * The character-IDs stop's payload builders (console/checkpoint-view-logic.js), fed
 * through buildResumePayload on a state at the stop: what the screen sends is what the
 * server keeps (the plan's console constraint).
 */
describe('the character-IDs stop\'s payloads, through buildResumePayload (brief 4.2)', () => {
  const { characterIdCards, characterIdLeaveOutTicks, characterIdsPayload, characterIdsSkipPayload } = require('../../console/checkpoint-view-logic');
  const state = {
    sessionPhotos: ['C:/data/092026/photos/aln (7 of 9).jpg', 'C:/data/092026/photos/aln (8 of 9).jpg'],
    photoAnalyses: { analyses: [{ filename: 'aln (7 of 9).jpg', visualContent: 'two people at a table' }, { filename: 'aln (8 of 9).jpg' }] },
    leftOutPhotos: null
  };
  const cards = characterIdCards(state.photoAnalyses.analyses, state.sessionPhotos, state.leftOutPhotos);

  it('Submit: the ticked photo joins the leave-out list beside the raw text and the descriptions', () => {
    const ticks = { ...characterIdLeaveOutTicks(cards, undefined), 'aln (8 of 9).jpg': true };
    const payload = characterIdsPayload(cards, { 'aln (7 of 9).jpg': 'Kai at the bar.' }, ticks);
    const { stateUpdates, resume, error } = buildResumePayload(payload, state, 'journalist', 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates.leftOutPhotos).toEqual(['aln (8 of 9).jpg']);
    expect(resume.leftOutPhotos).toEqual(['aln (8 of 9).jpg']);
    expect(stateUpdates.photoDescriptions).toEqual({ 'aln (7 of 9).jpg': 'Kai at the bar.' });
    expect(stateUpdates.characterIdsRaw).toContain('Photo aln (7 of 9).jpg:');
  });

  it('Skip: no identifications, and the ticked photo still left out', () => {
    const payload = characterIdsSkipPayload(cards, { 'aln (7 of 9).jpg': true });
    const { stateUpdates, error } = buildResumePayload(payload, state, 'journalist', 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates.characterIdMappings).toEqual({});
    expect(stateUpdates.leftOutPhotos).toEqual(['aln (7 of 9).jpg']);
  });

  it('every box clear: nothing of this stop is left out', () => {
    const payload = characterIdsPayload(cards, {}, characterIdLeaveOutTicks(cards, undefined));
    expect(buildResumePayload(payload, state, 'journalist', 'character-ids').stateUpdates.leftOutPhotos).toEqual([]);
  });
});

// Brief 2.7: the trace shows the current round's automatic passes only. A send back
// opens a new round, so the reject arms reset that stop's trace where they reset the
// hand-edit fields; the send-back rework itself writes no entry (graph.js increments).
describe('the trace is reset on a send back (phase 2, brief 2.7)', () => {
  const bundleFixture = () => JSON.parse(JSON.stringify(require('../fixtures/content-bundles/valid-journalist.json')));
  const PASS = { pass: 1, round: 1, trigger: 'evaluation', findings: {}, before: {}, at: '2026-09-26T10:00:00.000Z' };

  // Brief 4.6: the map's send-back.
  test('an outline send back resets the outline trace and leaves the article trace alone', () => {
    const { stateUpdates, error } = buildResumePayload(
      { outline: 'send-back', note: 'Rework the closing' },
      { outline: mapFixture(), _outlineTrace: [PASS], _articleTrace: [PASS] }
    );
    expect(error).toBeNull();
    expect(stateUpdates).toHaveProperty('_outlineTrace', null);
    expect(stateUpdates).not.toHaveProperty('_articleTrace');
  });

  test('an outline send back WITH edits resets it too', () => {
    const edits = mapFixture();
    edits.headline = 'A Sharper Headline for the Vote';
    const { stateUpdates, error } = buildResumePayload(
      { outline: 'send-back', note: 'Tighten the headline', map: edits },
      { outline: mapFixture(), _outlineTrace: [PASS] }
    );
    expect(error).toBeNull();
    expect(stateUpdates).toHaveProperty('_outlineTrace', null);
  });

  test('an article send back, with or without edits, resets the article trace and leaves the outline trace alone', () => {
    const plain = buildResumePayload({ article: false, articleFeedback: 'Rework it' }, { contentBundle: bundleFixture(), _articleTrace: [PASS], _outlineTrace: [PASS] });
    expect(plain.stateUpdates).toHaveProperty('_articleTrace', null);
    expect(plain.stateUpdates).not.toHaveProperty('_outlineTrace');

    const edits = bundleFixture();
    edits.headline.main = 'A different headline';
    const edited = buildResumePayload({ article: false, articleFeedback: 'Cut it', articleEdits: edits }, { contentBundle: bundleFixture(), _articleTrace: [PASS] });
    expect(edited.error).toBeNull();
    expect(edited.stateUpdates).toHaveProperty('_articleTrace', null);
  });

  test('an approve leaves both traces alone', () => {
    const outline = buildResumePayload({ outline: 'approve', map: mapFixture(), note: 'Keep it.' }, { outline: mapFixture(), _outlineTrace: [PASS] });
    const article = buildResumePayload({ article: true }, { contentBundle: bundleFixture(), _articleTrace: [PASS] });
    expect(outline.stateUpdates).not.toHaveProperty('_outlineTrace');
    expect(article.stateUpdates).not.toHaveProperty('_articleTrace');
  });

  test('an invalid edit sent back writes nothing, the trace reset included', () => {
    const edits = mapFixture();
    edits.sections = 'collapsed';  // brief 4.6: the map's sections are a list
    const { stateUpdates, error } = buildResumePayload(
      { outline: 'send-back', note: 'x', map: edits },
      { outline: mapFixture(), _outlineTrace: [PASS] }
    );
    expect(error).toMatch(/failed the director-side schema/);
    expect(stateUpdates).not.toHaveProperty('_outlineTrace');
  });

  // Parity with the hand-edit fields across every outline/article action the server
  // takes: the trace is written exactly when that side's hand-edit report is, and
  // always as null. (Approve clears it in the checkpoint node, as it does the
  // hand-edit fields: checkpoint-hand-edit-clears.test.js.)
  // Brief 4.6: the map's payloads.
  const outlineEdits = () => { const e = mapFixture(); e.headline = 'A Sharper Headline for the Vote'; return e; };
  const articleEdits = () => { const e = bundleFixture(); e.headline.main = 'A different headline'; return e; };
  const invalidOutline = () => { const e = mapFixture(); e.sections = 'collapsed'; return e; };
  const ACTIONS = [
    ['outline send back', () => ({ outline: 'send-back', note: 'Rework it' })],
    ['outline send back with edits', () => ({ outline: 'send-back', note: 'Rework it', map: outlineEdits() })],
    ['outline send back with an invalid edit', () => ({ outline: 'send-back', note: 'x', map: invalidOutline() })],
    ['outline approve', () => ({ outline: 'approve', map: mapFixture() })],
    ['outline approve with edits and a note', () => ({ outline: 'approve', map: outlineEdits(), note: 'Keep it.' })],
    ['article send back', () => ({ article: false, articleFeedback: 'Rework it' })],
    ['article send back with edits', () => ({ article: false, articleFeedback: 'Rework it', articleEdits: articleEdits() })],
    ['article approve', () => ({ article: true })],
    ['article approve with edits', () => ({ article: true, articleEdits: articleEdits() })]
  ];

  test.each(ACTIONS)('%s: each trace is written exactly when its side\'s hand-edit report is', (_name, approvals) => {
    const { stateUpdates } = buildResumePayload(approvals(), {
      outline: mapFixture(), contentBundle: bundleFixture(), _outlineTrace: [PASS], _articleTrace: [PASS]
    });
    ['outline', 'article'].forEach((s) => {
      expect(`_${s}Trace` in stateUpdates).toBe(`_${s}HandEditReport` in stateUpdates);
      if (`_${s}Trace` in stateUpdates) expect(stateUpdates[`_${s}Trace`]).toBeNull();
    });
  });
});

// FA, requirement 12 (final review of the photos, finding 1): the article stop could
// approve a page that publish then refused, and neither recovery kept the director's desk.
// The approve now checks every photo the page prints against data/<id>/photos and refuses
// with the filename while the stop is still open. Publish's throw stays a backstop.
describe('the article approve checks the printed photos (FA)', () => {
  const bundleFixture = () => JSON.parse(JSON.stringify(require('../fixtures/content-bundles/valid-journalist.json')));
  let dataDir;
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-approve-photos-'));
    fs.mkdirSync(path.join(dataDir, '0926262', 'photos'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, '0926262', 'photos', 'p1.jpg'), 'jpeg');
  });
  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  /** The fixture with a hero (or none) and photo blocks in its first section. */
  const printing = (hero, ...blocks) => {
    const b = bundleFixture();
    if (hero) b.heroImage = { filename: hero, caption: 'The huddle' };
    blocks.forEach((filename) => b.sections[0].content.push({ type: 'photo', filename, caption: 'At the bar' }));
    return b;
  };
  const approve = (approvals, state, theme = 'journalist') =>
    buildResumePayload(approvals, { sessionId: '0926262', ...state }, theme, 'article', { dataDir });

  test('refuses the approval while the stop is open, naming each printed photo the folder lacks', () => {
    const result = approve({ article: true, articleNote: 'Ship it.' }, { contentBundle: printing('p1.jpg', 'p2.jpg', 'p3 (1 of 2).jpg') });
    expect(result.error).toContain('"p2.jpg", "p3 (1 of 2).jpg"');
    expect(result.error).toContain(path.join(dataDir, '0926262', 'photos'));
    expect(result.error).not.toContain('"p1.jpg"');
    expect(result.stateUpdates).toEqual({});
    expect(result.resume).toEqual({});
  });

  test('checks the bundle the director approves with', () => {
    const result = approve({ article: true, articleEdits: printing(null, 'p9.jpg') }, { contentBundle: printing('p1.jpg') });
    expect(result.error).toContain('"p9.jpg"');
    expect(result.stateUpdates.contentBundle).toBeUndefined();
  });

  test('approves when every printed photo is in the folder; a detective hero never prints, so it is not checked', () => {
    expect(approve({ article: true }, { contentBundle: printing('p1.jpg', 'p1.jpg') }).error).toBeNull();
    expect(approve({ article: true }, { contentBundle: printing('missing-hero.jpg', 'p1.jpg') }, 'detective').error).toBeNull();
  });

  test('a filename that leads outside the folder is refused like a missing one', () => {
    expect(approve({ article: true }, { contentBundle: printing(null, '../p1.jpg') }).error).toContain('"../p1.jpg"');
  });

  test('without a session id there is no folder to check, as publish copies none', () => {
    expect(buildResumePayload({ article: true }, { contentBundle: printing(null, 'p9.jpg') }, 'journalist', 'article', { dataDir }).error).toBeNull();
  });
});

// Phase 4, task 4.3 (spec 2026-10-02 section 6.3): the article stop is the director's desk,
// and Approve publishes exactly what is on it. The desk builds its bundle with the pure
// operations in console/article-desk-logic.js and sends it on every approve and send-back,
// edited or not, through articleReviewPayload. Its own checks catch an empty block and a
// headline outside the schema's limits first; the server's schema gate stays the last word
// on shape. The director's moves and deletes become standing edits at a send-back.
describe('the desk\'s payload through buildResumePayload (task 4.3)', () => {
  const Desk = require('../../console/article-desk-logic');
  const { articleReviewPayload } = require('../../console/checkpoint-view-logic');
  const paragraph = (text) => ({ type: 'paragraph', text });
  const PHOTO = { type: 'photo', filename: 'p1.jpg', caption: 'The six in the huddle.' };
  const CARD = { type: 'evidence-card', tokenId: 'doc001', headline: 'Wire transfer records', content: 'Transfers to the Cayman account, March to June.' };
  let dataDir;

  /** The writer's draft as the stop stores it: a photo in the intro, a card in the evidence section. */
  const stored = () => {
    const b = JSON.parse(JSON.stringify(require('../fixtures/content-bundles/valid-journalist.json')));
    b.metadata.sessionId = '0926262';
    b.sections[0].content.push(JSON.parse(JSON.stringify(PHOTO)));
    b.sections[1].content.push(JSON.parse(JSON.stringify(CARD)));
    return b;
  };
  /** The photo moved to the conclusion, the card deleted, a paragraph inserted in the money section. */
  const deskWithInsert = () => {
    let desk = Desk.moveToSection(stored(), { section: 0, block: 2 }, 3);
    desk = Desk.deleteBlock(desk, 1, 3);
    return Desk.insertBlock(desk, 2, 1, 'paragraph');
  };
  const atStop = (bundle) => ({ sessionId: '0926262', contentBundle: bundle });
  const review = (payload, bundle = stored()) => buildResumePayload(payload, atStop(bundle), 'journalist', 'article', { dataDir });

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-desk-payload-'));
    fs.mkdirSync(path.join(dataDir, '0926262', 'photos'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, '0926262', 'photos', 'p1.jpg'), 'jpeg');
  });
  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  test('the desk names the paragraph it inserted and left empty, and the schema gate refuses it too', () => {
    const desk = deskWithInsert();
    expect(Desk.deskProblems(desk).map((p) => p.message)).toEqual([
      'Section "Following the Money", block 2: the paragraph is empty. Write it or delete it.'
    ]);
    const result = review(articleReviewPayload(desk, '', 'approve'));
    expect(result.error).toContain('failed schema validation (content-bundle)');
    expect(result.stateUpdates.contentBundle).toBeUndefined();
  });

  test('approve sends exactly the bundle on the desk, and the server stores that bundle', () => {
    const desk = Desk.setBlock(deskWithInsert(), 2, 1, paragraph('The ledger shows three transfers in one week.'));
    expect(Desk.deskProblems(desk)).toEqual([]);
    const payload = articleReviewPayload(desk, 'Ship it.', 'approve');
    expect(payload).toEqual({ article: true, articleNote: 'Ship it.', articleEdits: desk });
    const result = review(payload);
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.contentBundle).toBe(desk);
  });

  test('an untouched desk sends the draft it opened on', () => {
    const draft = stored();
    const result = review(articleReviewPayload(draft, '', 'approve'), draft);
    expect(result.error).toBeNull();
    expect(result.stateUpdates.contentBundle).toEqual(stored());
  });

  test('a send-back carries the director\'s moves and deletes as standing edits', () => {
    let desk = Desk.moveBlock(stored(), { section: 0, block: 2 }, { section: 0, block: 0 });   // the photo to the top of the intro
    desk = Desk.deleteBlock(desk, 1, 3);                                                         // the card
    const result = review(articleReviewPayload(desk, 'Tighten the money section.', 'send-back'));
    expect(result.error).toBeNull();
    const edits = result.stateUpdates._articleHandEdits.edits;
    expect(edits.map((e) => [e.id, e.path, e.from || null, e.after === null ? 'cut' : 'place'])).toEqual([
      ['E1', 'sections[#intro].content[0]', 'intro', 'place'],
      ['E2', 'sections[#evidence-section].content[-]', null, 'cut']
    ]);
    expect(edits[1].before).toEqual(CARD);
    expect(result.stateUpdates.contentBundle).toBe(desk);
  });
});

/**
 * Brief 4.2b: the structured form, the character-IDs stop's Skip, clears the raw text
 * beside the mappings. characterIdsRaw survives a rollback to the stop
 * (ROLLBACK_CLEARS_EXEMPT); left in place, the parse would read the earlier round's text
 * again, a paid call whose identifications and exclusions come back on photos whose box
 * is clear. The director's latest action at the stop is Skip, and the boxes decide.
 */
describe('buildResumePayload: the structured form clears the raw text (brief 4.2b)', () => {
  const afterRollback = {
    characterIdsRaw: 'Photo aln (8 of 9).jpg:\n  User Input: leave this one out',
    characterIdMappings: null,
    leftOutPhotos: null,
    photoAnalyses: { analyses: [{ filename: 'aln (7 of 9).jpg' }, { filename: 'aln (8 of 9).jpg' }] }
  };

  it('Skip writes characterIdsRaw: null beside the mappings, in the state update', () => {
    const { stateUpdates, resume, error } = buildResumePayload(
      { characterIds: {}, leftOutPhotos: [] }, afterRollback, 'journalist', 'character-ids'
    );
    expect(error).toBeNull();
    expect(stateUpdates).toHaveProperty('characterIdsRaw', null);
    expect(stateUpdates.characterIdMappings).toEqual({});
    expect(stateUpdates.leftOutPhotos).toEqual([]);
    expect(resume.characterIdMappings).toEqual({});
  });

  it('so does a structured form that carries identifications', () => {
    const ids = { 'aln (7 of 9).jpg': { characterMappings: [{ descriptionIndex: 0, characterName: 'Kai' }] } };
    const { stateUpdates, error } = buildResumePayload({ characterIds: ids }, afterRollback, 'journalist', 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates).toHaveProperty('characterIdsRaw', null);
    expect(stateUpdates.characterIdMappings).toEqual(ids);
  });

  it('the text form keeps the director\'s text, and writes no mappings', () => {
    const { stateUpdates, error } = buildResumePayload(
      { characterIdsRaw: 'Photo aln (7 of 9).jpg:\n  User Input: Kai at the bar.' }, afterRollback, 'journalist', 'character-ids'
    );
    expect(error).toBeNull();
    expect(stateUpdates.characterIdsRaw).toBe('Photo aln (7 of 9).jpg:\n  User Input: Kai at the bar.');
    expect(stateUpdates).not.toHaveProperty('characterIdMappings');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5: the story meeting's payloads (brief 4.5; spec 4.3 and 4.4)
// ═══════════════════════════════════════════════════════════════════════════
//
// The arc stop is the story meeting: `{meeting: 'approve' | 'reweave' | 'send-back', weave,
// note}` replaces the arc selection. lib/meeting.js meetingResume holds the weave to the
// director-side schema (lib/__tests__/meeting.test.js covers it); these pin the server's
// part: the notes, the stop it is taken at, and the old shape refused.
describe('4.5: the story meeting through buildResumePayload', () => {
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const { withFactCheckMark } = require('../../lib/weave');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const shown = () => ({
    weave: withFactCheckMark(clone(WEAVE), { at: 't', ready: true, fixes: 0 }),
    _weaveBaseline: clone(WEAVE),
    directorGateNotes: [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the heir thread.', at: 't0' }]
  });
  const left = () => {
    const weave = clone(WEAVE);
    weave.threads = weave.threads.map((t) => (t.id === 't3' ? { ...t, role: 'mirrors-it' } : t));
    weave.questions = weave.questions.map((q) => ({ ...q, answer: 'Sarah ran the bar.' }));
    return weave;
  };

  it("approve resumes as an approval, writes the director's version and their edits, and joins the note as an approval note", () => {
    const { resume, stateUpdates, error } = buildResumePayload({ meeting: 'approve', weave: left(), note: '  Lead with the vote.  ' }, shown(), 'journalist', 'arc-selection');
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: true });
    expect(stateUpdates.weave.questions[0].answer).toBe('Sarah ran the bar.');
    expect(stateUpdates.weave._factCheck).toEqual({ at: 't', ready: true, fixes: 0 });
    expect(stateUpdates._weaveHandEdits.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'threads[#t3].role']]);
    expect(stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Lead with the vote.' });
    ['_outlineGuidance', 'selectedArcs', '_meetingRound', '_arcFeedback'].forEach((key) => expect(`${key}: ${key in stateUpdates}`).toBe(`${key}: false`));
  });

  it('a reweave with no note is the director\'s round, marked, and appends no note', () => {
    const { resume, stateUpdates, error } = buildResumePayload({ meeting: 'reweave', weave: left() }, shown(), 'journalist', 'arc-selection');
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: false, round: 'reweave' });
    expect(stateUpdates).toMatchObject({ _meetingRound: 'reweave', _arcFeedback: null });
    expect(stateUpdates.directorGateNotes).toBeUndefined();
  });

  it('a send-back carries its note to the rework and joins it as a rejection note, round counted per kind', () => {
    const { resume, stateUpdates, error } = buildResumePayload({ meeting: 'send-back', note: 'Rethink the money thread.' }, shown(), 'journalist', 'arc-selection');
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: false, round: 'send-back', feedback: 'Rethink the money thread.' });
    expect(stateUpdates).toMatchObject({ _meetingRound: 'send-back', _arcFeedback: 'Rethink the money thread.' });
    expect(stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'arc-selection', kind: 'rejection', round: 2, text: 'Rethink the money thread.' });
  });

  it('refuses a malformed weave with the schema\'s reason, and writes nothing', () => {
    const bad = left();
    bad.threads[0].role = 'hero';
    const result = buildResumePayload({ meeting: 'approve', weave: bad }, shown(), 'journalist', 'arc-selection');
    expect(result.error).toMatch(/director-side schema: \/threads\/0\/role must be equal to one of the allowed values/);
    expect(result.stateUpdates).toEqual({});
    expect(result.resume).toEqual({});
  });

  it('refuses a send-back with no note, and an action the meeting does not take', () => {
    expect(buildResumePayload({ meeting: 'send-back', note: '  ' }, shown()).error).toMatch(/A send-back carries a note/);
    expect(buildResumePayload({ meeting: 'select', weave: left() }, shown()).error).toMatch(/approve, reweave or send-back/);
  });

  it("takes the meeting's actions only at the meeting: at another stop an approval would approve that stop (I3)", () => {
    ['outline', 'article', 'photos'].forEach((type) => {
      const result = buildResumePayload({ meeting: 'approve', weave: left() }, shown(), 'journalist', type);
      expect(result.error).toMatch(/taken at the story meeting \(arc-selection\)/);
      expect(result.resume).toEqual({});
    });
  });

  it('refuses the arc selection\'s old shape by name, so a stale console never approves by a selection', () => {
    [{ selectedArcs: ['a'] }, { selectedArcs: false, arcFeedback: 'x' }, { outlineGuidance: 'Lead with the money.' }].forEach((approvals) => {
      // Brief 4.5c: at the meeting the meeting's own keys are the only ones taken, so the old
      // shape is refused there by its keys, naming the stop; with no stop given, by name.
      const atMeeting = buildResumePayload(approvals, shown(), 'journalist', 'arc-selection');
      expect(atMeeting.error).toMatch(/^The thread is paused at the story meeting \(arc-selection\), which takes only its own action: \{meeting/);
      expect(atMeeting.error).toContain(`This request carries ${Object.keys(approvals).join(' and ')}, which the story meeting does not take.`);
      expect(atMeeting.stateUpdates).toEqual({});
      const result = buildResumePayload(approvals, shown());
      expect(result.error).toMatch(/The arc selection is gone: the story meeting takes \{meeting/);
      expect(result.stateUpdates).toEqual({});
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5b: at the story meeting, only the meeting's own action is taken
// ═══════════════════════════════════════════════════════════════════════════
//
// 4.5's guard (I3) the other way round. Every other stop's arm writes the resume its own
// stop reads, and the meeting's stop reads `{approved: true}` as its approval: a stale
// console tab's {outline: true} approved the meeting with no weave, no edits and no note,
// and wrote weave.approved.json, which the readout reads as the director's settled story.
describe("4.5b: at the story meeting only the meeting's own action is taken", () => {
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const { withFactCheckMark } = require('../../lib/weave');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const atMeeting = () => ({ weave: withFactCheckMark(clone(WEAVE), { at: 't', ready: true, fixes: 0 }), _weaveBaseline: clone(WEAVE) });
  const edited = () => ({ ...clone(WEAVE), threads: clone(WEAVE).threads.map((t) => (t.id === 't3' ? { ...t, role: 'mirrors-it' } : t)) });

  /** Each other stop's approval or send-back, as its console sends it, with the stop it answers. */
  const OTHER_STOPS = [
    ['input-review', { inputReview: true }],
    ['input-review', { inputReview: false, inputFeedback: 'Blake said the dead-man line.' }],
    ['paper-evidence-selection', { selectedPaperEvidence: [{ notionId: 'p-dna' }] }],
    ['await-roster', { roster: ['Alex', 'Morgan'], rosterPronouns: { Alex: 'he/him' } }],
    ['await-full-context', { fullContext: { accusation: 'a', sessionReport: 's', directorNotes: 'd' } }],
    ['pre-curation', { preCuration: true }],
    ['evidence-and-photos', { evidenceBundle: true, rescuedItems: ['p-rescued'] }],
    ['character-ids', { characterIdsRaw: 'p1.jpg: Alex at the bar' }],
    ['character-ids', { characterIds: { 'p1.jpg': { characters: ['Alex'] } } }],
    // The map's own actions since 4.6 (the integrator's merge of 4.5b and 4.6).
    ['outline', { outline: 'approve', map: mapFixture() }],
    ['outline', { outline: 'send-back', map: mapFixture(), note: 'Tighten the map.' }],
    ['article', { article: true }],
    ['article', { article: false, articleFeedback: 'Cut the sidebar.' }]
  ];

  it.each(OTHER_STOPS)("refuses the %s stop's %j at the meeting, naming the stop the thread is paused at, and writes nothing", (_stop, approvals) => {
    const result = buildResumePayload(approvals, atMeeting(), 'journalist', 'arc-selection');
    expect(result.error).toMatch(/^The thread is paused at the story meeting \(arc-selection\), which takes only its own action/);
    // Brief 4.5c: the meeting names every key it does not take, its riders included; a note
    // is the meeting's own key, so it is not named.
    expect(result.error).toContain(`This request carries ${Object.keys(approvals).filter((key) => key !== 'note').join(' and ')}, which the story meeting does not take.`);
    expect(result.resume).toEqual({});
    expect(result.stateUpdates).toEqual({});
  });

  it.each(OTHER_STOPS)("takes the %s stop's %j at that stop, so the list the meeting refuses is each stop's own", (stop, approvals) => {
    // The map's stop reads the map it showed (4.6), so the state holds one.
    const state = { ...atMeeting(), outline: mapFixture(), _mapBaseline: mapFixture() };
    expect(buildResumePayload(approvals, state, 'journalist', stop).error).toBeNull();
  });

  it("refuses another stop's key beside the meeting's own action: a reweave never turns into an approval", () => {
    const result = buildResumePayload({ meeting: 'reweave', weave: edited(), outline: true, article: true }, atMeeting(), 'journalist', 'arc-selection');
    expect(result.error).toContain('This request carries outline and article, which the story meeting does not take.');
    expect(result.resume).toEqual({});
    expect(result.stateUpdates).toEqual({});
  });

  it("still takes the meeting's own action there", () => {
    const result = buildResumePayload({ meeting: 'reweave', weave: edited() }, atMeeting(), 'journalist', 'arc-selection');
    expect(result.error).toBeNull();
    expect(result.resume).toEqual({ approved: false, round: 'reweave' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6: the map through buildResumePayload (brief 4.6; lib/map.js mapResume)
// ═══════════════════════════════════════════════════════════════════════════
describe('4.6: the map through buildResumePayload', () => {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const ROSTER = { roster: ['Alex', 'Morgan', 'Riley', 'Sarah'] };
  /** The stop as the map writer left it: the map shown is the writer's last map. */
  const atMap = (extra = {}) => ({ outline: mapFixture(), _mapBaseline: mapFixture(), sessionConfig: ROSTER, directorGateNotes: [], ...extra });

  /**
   * The director's map: a beat added, a line rewritten, a beat struck, another photo chosen
   * for the top and the old top photo moved into the story.
   */
  function directorsMap() {
    const map = mapFixture();
    map.sections[2].beats.push({ id: 'b10', material: 'The bonus at 07:52 PM' });
    map.sections[3].beats[0].material = 'Riley: "I kept the books, and the second ledger"';
    map.leftOut.push(map.sections[1].beats.splice(2, 1)[0]);
    map.topPhoto = 'p2.jpg';
    map.sections[1].photos = [{ filename: 'hero.jpg' }];
    return map;
  }
  const EDITS = [
    ['E1', 'sections[#followTheMoney].beats[#b10]'],
    ['E2', 'sections[#closing].beats[#b6].material'],
    ['E3', 'leftOut[#b4]'],
    ['E4', 'topPhoto'],
    ['E5', 'sections[#theStory].photos[#hero.jpg]']
  ];

  it("approve resumes as an approval, writes the director's map, their edits and the hero, and joins the note as an approval note", () => {
    const map = directorsMap();
    const { resume, stateUpdates, error } = buildResumePayload({ outline: 'approve', map, note: ' Keep the bonus beat. ' }, atMap(), 'journalist', 'outline');
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: true });
    expect(stateUpdates.outline).toEqual(map);
    expect(stateUpdates.heroImage).toBe('p2.jpg');
    expect(stateUpdates._outlineHandEdits).toMatchObject({ kind: 'map', issued: 5 });
    expect(stateUpdates._outlineHandEdits.edits.map((e) => [e.id, e.path])).toEqual(EDITS);
    expect(stateUpdates._outlineHandEdits.edits[2]).toMatchObject({ from: 'theStory', struck: true });
    expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'outline', kind: 'approval', round: 1, text: 'Keep the bonus beat.' })]);
    // The approval is the stop's to set (checkpointOutline), and an approve opens no round.
    ['outlineApproved', '_outlineFeedback', '_outlineHandEditReport', '_outlineTrace'].forEach((key) => expect(`${key}: ${key in stateUpdates}`).toBe(`${key}: false`));
  });

  it("a send-back carries its note to the rework, opens a round, and writes the director's map and edits", () => {
    const map = directorsMap();
    const state = atMap({ _outlineHandEditReport: { checked: ['E1'], changed: [] }, _outlineTrace: [{ pass: 1 }] });
    const { resume, stateUpdates, error } = buildResumePayload({ outline: 'send-back', map, note: 'Lead with the bonus.' }, state, 'journalist', 'outline');
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: false, feedback: 'Lead with the bonus.' });
    expect(stateUpdates).toMatchObject({ outline: map, heroImage: 'p2.jpg', _outlineFeedback: 'Lead with the bonus.', _outlineHandEditReport: null, _outlineTrace: null });
    expect(stateUpdates._outlineHandEdits.edits.map((e) => [e.id, e.path])).toEqual(EDITS);
    expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'outline', kind: 'rejection', round: 1, text: 'Lead with the bonus.' })]);
  });

  it('a send-back without a map keeps the map shown, and the edits that stand on it', () => {
    const first = buildResumePayload({ outline: 'approve', map: directorsMap() }, atMap(), 'journalist', 'outline');
    const state = atMap({ outline: first.stateUpdates.outline, _outlineHandEdits: first.stateUpdates._outlineHandEdits });
    const { stateUpdates, error } = buildResumePayload({ outline: 'send-back', note: 'Tighten the closing.' }, state, 'journalist', 'outline');
    expect(error).toBeNull();
    expect(stateUpdates.outline).toEqual(state.outline);
    expect(stateUpdates.heroImage).toBe('p2.jpg');
    expect(stateUpdates._outlineHandEdits).toEqual(first.stateUpdates._outlineHandEdits);
  });

  // The edits stand past approve (checkpointOutline keeps them) and through the rollback to
  // the map (R9), which keeps the map as the director left it beside the writer's last map:
  // the next approve diffs against the writer's map, and the edits already standing keep
  // their ids, so none is counted twice.
  it("diffs against the writer's last map: edits already standing keep their ids, and a new one takes the next", () => {
    const first = buildResumePayload({ outline: 'approve', map: directorsMap() }, atMap(), 'journalist', 'outline');
    const again = directorsMap();
    again.headline = 'The Bonus the Room Never Saw';
    const state = atMap({ outline: first.stateUpdates.outline, _outlineHandEdits: first.stateUpdates._outlineHandEdits });
    const { stateUpdates, error } = buildResumePayload({ outline: 'approve', map: again }, state, 'journalist', 'outline');
    expect(error).toBeNull();
    expect(stateUpdates._outlineHandEdits.edits.map((e) => [e.id, e.path])).toEqual([...EDITS, ['E6', 'headline']]);
    expect(stateUpdates._outlineHandEdits.issued).toBe(6);
  });

  it('the hero is the top photo the director leaves: none when the map names none', () => {
    const map = mapFixture();
    delete map.topPhoto;
    map.sections[1].photos.push({ filename: 'hero.jpg' });
    const { stateUpdates, error } = buildResumePayload({ outline: 'approve', map }, atMap(), 'journalist', 'outline');
    expect(error).toBeNull();
    expect(stateUpdates.heroImage).toBeNull();
  });

  it("allows a beat the director added or brought back with only its id and material, and refuses a malformed map with the schema's reason", () => {
    const added = mapFixture();
    added.sections[0].beats.push({ id: 'b11', material: 'Alex at the window' });
    added.leftOut.push({ id: 'b12', material: 'The second envelope' });
    expect(buildResumePayload({ outline: 'approve', map: added }, atMap(), 'journalist', 'outline').error).toBeNull();

    const cases = [
      ['a beat with no material', (m) => { delete m.sections[0].beats[0].material; }, /beats\/0 must have required property 'material'/],
      ['a kind the map has none of', (m) => { m.sections[1].beats[0].kind = 'quote'; }, /kind must be equal to one of the allowed values/],
      ['a slot the theme has none of', (m) => { m.sections[3].slot = 'epilogue'; }, /slot must be equal to one of the allowed values/],
      ['a key the map has none of', (m) => { m.lede = { hook: 'x' }; }, /must NOT have additional properties/],
      ['a headline under its least length', (m) => { m.headline = 'Short'; }, /headline must NOT have fewer than 10 characters/]
    ];
    cases.forEach(([name, change, reason]) => {
      const map = mapFixture();
      change(map);
      const result = buildResumePayload({ outline: 'approve', map, note: 'x' }, atMap(), 'journalist', 'outline');
      expect(`${name}: ${result.error}`).toMatch(reason);
      expect(`${name}: ${JSON.stringify(result.stateUpdates)}`).toBe(`${name}: {}`);
    });
  });

  it("refuses a beat id the director's changes repeat, and lets a repeat the writer made through to the checks", () => {
    const theirs = mapFixture();
    theirs.sections[0].beats.push({ id: 'b2', material: 'A second b2' });
    expect(buildResumePayload({ outline: 'approve', map: theirs }, atMap(), 'journalist', 'outline').error)
      .toBe('Two beats share the id "b2": the director\'s changes made this repeat. Give each beat an id of its own.');
    const writers = mapFixture();
    writers.sections[0].beats.push({ id: 'b2', kind: 'scene', material: 'A second b2', players: [] });
    const result = buildResumePayload({ outline: 'approve', map: clone(writers) }, atMap({ outline: writers, _mapBaseline: writers }), 'journalist', 'outline');
    expect(result.error).toBeNull();
  });

  it('refuses the old outline payload by name, a send-back with no note and an approve with no map, and writes nothing', () => {
    const refused = [
      [{ outline: true }, 'The map takes {outline: "approve" | "send-back", map, note} (got outline: true).'],
      [{ outline: false, outlineFeedback: 'x' }, 'The map takes {outline: "approve" | "send-back", map, note} (outlineFeedback is the old outline\'s).'],
      [{ outline: 'approve', outlineEdits: mapFixture(), outlineNote: 'x' }, 'The map takes {outline: "approve" | "send-back", map, note} (outlineEdits, outlineNote are the old outline\'s).'],
      [{ outline: 'send-back', map: mapFixture() }, 'A send-back carries a note: what the writer should change.'],
      [{ outline: 'send-back', note: '   ' }, 'A send-back carries a note: what the writer should change.'],
      [{ outline: 'approve' }, 'An approve carries the map as the director left it.'],
      [{ outline: 'approve', map: mapFixture(), note: 42 }, "The map's note must be text."]
    ];
    refused.forEach(([approvals, message]) => {
      expect(buildResumePayload(approvals, atMap(), 'journalist', 'outline')).toEqual({ resume: {}, stateUpdates: {}, error: message });
    });
  });

  it("takes the map's actions only at the map: at another stop an approval would approve that stop (I3)", () => {
    ['article', 'character-ids'].forEach((type) => {
      expect(buildResumePayload({ outline: 'approve', map: mapFixture() }, atMap(), 'journalist', type))
        .toEqual({ resume: {}, stateUpdates: {}, error: `The map's actions are taken at the map (outline), not at ${type}.` });
    });
    // At the story meeting 4.5b's guard answers first: the meeting takes only its own action.
    const atTheMeeting = buildResumePayload({ outline: 'approve', map: mapFixture() }, atMap(), 'journalist', 'arc-selection');
    expect(atTheMeeting).toMatchObject({ resume: {}, stateUpdates: {} });
    expect(atTheMeeting.error).toMatch(/^The thread is paused at the story meeting \(arc-selection\), which takes only its own action/);
  });

  it('refuses a payload for a theme with no map instead of throwing (R1)', () => {
    const result = buildResumePayload({ outline: 'approve', map: mapFixture() }, atMap({ theme: 'detective' }), undefined, 'outline');
    expect(result).toEqual({
      resume: {}, stateUpdates: {},
      error: 'The "detective" theme has no story map: its config names no map slots (lib/theme-config.js). The detective is parked (R1).'
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.8: the meeting's payload builders through buildResumePayload (brief 4.8)
// ═══════════════════════════════════════════════════════════════════════════
//
// The meeting's screen builds its payloads in console/checkpoint-view-logic.js. Fed through
// buildResumePayload on a state paused at the meeting, each is the 4.5 payload the gate
// takes: what the director typed reaches the stored weave as typed.
describe('4.8: the meeting\'s payload builders through buildResumePayload', () => {
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const { withFactCheckMark } = require('../../lib/weave');
  const { meetingCheckpointData } = require('../../lib/meeting');
  const {
    meetingWeaveOf, meetingPayload, setMeetingField, setThreadRole, addMeetingThread, setConnectionStruck, setQuestionAnswer
  } = require('../../console/checkpoint-view-logic');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const MARK = { at: 't', ready: true, fixes: 0 };
  const atMeeting = () => ({
    weave: withFactCheckMark(clone(WEAVE), MARK),
    _weaveBaseline: clone(WEAVE),
    directorGateNotes: []
  });
  const take = (payload, state = atMeeting()) => buildResumePayload(payload, state, 'journalist', 'arc-selection');
  /** The stop's payload at a state, which the console's builders read (server.js getCheckpointData's arm). */
  const dataOf = (state) => meetingCheckpointData(state, { evidenceIndex: {}, maxRevisions: 1 });

  /** A role changed, a thread added, a connection struck, a question answered and the story edited, each as typed. */
  const changed = (shown) => {
    let w = meetingWeaveOf(shown);
    w = setMeetingField(w, 'story', 'The room named an overdose; the ledger names a sale. ');
    w = setThreadRole(w, 2, 'mirrors-it');
    w = addMeetingThread(w, 'Riley kept a second ledger.', 'grounds-it');
    w = setConnectionStruck(w, 1, true);
    w = setQuestionAnswer(w, 0, ' Sarah ran the bar all morning.');
    return w;
  };

  test('approve: the director\'s weave is stored as typed, each change is an edit, and the note joins as an approval note', () => {
    const state = atMeeting();
    const { resume, stateUpdates, error } = take(meetingPayload('approve', dataOf(state), changed(state.weave), 'Lead with the vote.'), state);
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: true });
    expect(stateUpdates.weave.story).toBe('The room named an overdose; the ledger names a sale. ');
    expect(stateUpdates.weave.questions[0].answer).toBe(' Sarah ran the bar all morning.');
    expect(stateUpdates.weave.connections[1].struck).toBe(true);
    expect(stateUpdates.weave._factCheck).toEqual(MARK);
    expect(stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['story', 'threads[#t3].role', 'threads[#t6]', 'connections[#c2]']);
    expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'arc-selection', kind: 'approval', text: 'Lead with the vote.' })]);
  });

  test('approve untouched: the weave as the meeting showed it, with no edit', () => {
    const state = atMeeting();
    const { stateUpdates, error } = take(meetingPayload('approve', dataOf(state), meetingWeaveOf(state.weave), ''), state);
    expect(error).toBeNull();
    expect(stateUpdates._weaveHandEdits).toBeNull();
    expect(stateUpdates.directorGateNotes).toBeUndefined();
  });

  test('a reweave with a change and no note is the director\'s round, marked', () => {
    const state = atMeeting();
    const payload = meetingPayload('reweave', dataOf(state), setThreadRole(meetingWeaveOf(state.weave), 4, 'grounds-it'), '');
    const { resume, stateUpdates, error } = take(payload, state);
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: false, round: 'reweave' });
    expect(stateUpdates._meetingRound).toBe('reweave');
    expect(stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t5].role']);
  });

  // Fix round 1, finding 1: a reweave whose rework timed out reopens the meeting on the
  // director's version (reviseArcs' timeout path), so its changes are in the weave shown. The
  // console offers Reweave again with nothing new typed, and the gate takes that retry,
  // carrying the changes as the director's standing edits.
  test('the retry of a reweave that did not run, sent with nothing new typed, is a payload the gate takes', () => {
    const state = atMeeting();
    const first = take(meetingPayload('reweave', dataOf(state), setThreadRole(meetingWeaveOf(state.weave), 4, 'grounds-it'), ''), state);
    expect(first.error).toBeNull();
    const reopened = {
      ...state, ...first.stateUpdates, _meetingRound: null, _arcFeedback: null,
      _arcReworkTimeout: { consecutive: 1, attempt: 0, round: 'reweave', note: null, at: 't' }
    };
    const data = dataOf(reopened);
    const retry = meetingPayload('reweave', data, meetingWeaveOf(data.weave), '');
    expect(retry).not.toBeNull();
    const { resume, stateUpdates, error } = take(retry, reopened);
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: false, round: 'reweave' });
    expect(stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t5].role']);
  });

  test('a send-back with only a note leaves the weave as shown; one with an answer stores the answer', () => {
    const state = atMeeting();
    const plain = take(meetingPayload('send-back', dataOf(state), meetingWeaveOf(state.weave), 'Rethink the money thread.'), state);
    expect(plain.error).toBeNull();
    expect(plain.resume).toEqual({ approved: false, round: 'send-back', feedback: 'Rethink the money thread.' });
    expect(plain.stateUpdates.weave).toEqual(state.weave);

    const answered = take(meetingPayload('send-back', dataOf(state), setQuestionAnswer(meetingWeaveOf(state.weave), 0, 'Sarah ran the bar.'), 'Rethink it.'), atMeeting());
    expect(answered.error).toBeNull();
    expect(answered.stateUpdates.weave.questions[0].answer).toBe('Sarah ran the bar.');
  });

  test('app.js\'s fallback approve, built the same way, is the payload the gate takes', () => {
    const state = atMeeting();
    const { error, resume } = take(meetingPayload('approve', dataOf(state), meetingWeaveOf(state.weave), ''), state);
    expect(error).toBeNull();
    expect(resume.approved).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6b: the map's gate refuses a photo the director's changes place more than once
// ═══════════════════════════════════════════════════════════════════════════
//
// lib/map.js directorMapProblems, by its rule for repeats: a repeat the map the stop showed
// does not hold is the director's. Refused at the gate, their choice of a top photo never
// becomes a double placement that no edit carries, that the check files as the writer's and
// that an automatic pass could undo unrestored.
describe("4.6b: the map's gate refuses a photo the director's changes place more than once", () => {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const atMap = (extra = {}) => ({ outline: mapFixture(), _mapBaseline: mapFixture(), sessionConfig: { roster: ['Alex', 'Morgan', 'Riley', 'Sarah'] }, directorGateNotes: [], ...extra });

  it.each(['approve', 'send-back'])('%s: a top photo set to a photo already placed is refused, naming the director, and nothing is written', (action) => {
    const map = mapFixture();
    expect(map.sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b2' }]);
    map.topPhoto = 'p2.jpg';
    expect(buildResumePayload({ outline: action, map, note: 'Lead with the ledger.' }, atMap(), 'journalist', 'outline')).toEqual({
      resume: {}, stateUpdates: {},
      error: "\"p2.jpg\" is placed more than once: the director's changes made this repeat. Place each photo once: as the top photo, or in one section."
    });
  });

  it("a repeat the map the stop showed holds is the writer's: approved as left, for the checks to report", () => {
    const shown = mapFixture();
    shown.sections[3].photos.push({ filename: 'p2.jpg' });
    const { error, stateUpdates } = buildResumePayload({ outline: 'approve', map: clone(shown) }, atMap({ outline: shown, _mapBaseline: shown }), 'journalist', 'outline');
    expect(error).toBeNull();
    expect(stateUpdates.outline).toEqual(shown);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.3c: a structured character-IDs answer holds mappings
// ═══════════════════════════════════════════════════════════════════════════
//
// The structured arm took any object under `characterIds`, a list included, and any value
// under each photo's key, while the parse and the console's payloads write one mapping
// object per photo. A hand-built answer whose value was text or a list then sat in the
// mappings, where photoMappingOf passes it over and the photo's identifications and
// exclusion go unread. The arm refuses such an answer, naming the key, and keeps the stop's
// Skip, an empty object.
describe('4.3c: a structured character-IDs answer holds mappings', () => {
  const at = (characterIds) => buildResumePayload({ characterIds }, {}, 'journalist', 'character-ids');

  it('refuses a value that is not a mapping object, naming its key, and writes nothing', () => {
    [['Vic', 'Vic'], ['a list', ['Sam']], ['null', null], ['a number', 7]].forEach(([what, value]) => {
      const { error, stateUpdates, resume } = at({ 'b.jpg': { characterMappings: [] }, 'aln (7 of 9).jpg': value });
      expect([what, error]).toEqual([what, 'characterIds["aln (7 of 9).jpg"] must be a mapping object']);
      expect(stateUpdates).toEqual({});
      expect(resume).toEqual({});
    });
  });

  it('refuses an answer that is not an object of photo filename -> mapping', () => {
    [['a list', [{ characterMappings: [] }]], ['text', 'Photo 1: Vic'], ['null', null]].forEach(([what, value]) => {
      expect([what, at(value).error]).toEqual([what, 'characterIds must be an object of photo filename -> mapping']);
    });
  });

  it('takes {} (the stop\'s Skip) and an object of mappings', () => {
    expect(at({}).error).toBeNull();
    expect(at({}).stateUpdates.characterIdMappings).toEqual({});
    const ids = { 'aln (7 of 9).jpg': { characterMappings: [{ descriptionIndex: 0, characterName: 'Kai' }] }, 'b.jpg': {} };
    const { error, stateUpdates } = at(ids);
    expect(error).toBeNull();
    expect(stateUpdates.characterIdMappings).toEqual(ids);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5c: the meeting takes only its own keys; a note sent again in its round files once
// ═══════════════════════════════════════════════════════════════════════════
//
// 4.5b's guard refused a fixed list of other stops' keys, so an approval key a later arm
// adds would approve the meeting again. While the thread is paused at the story meeting the
// server takes the meeting's own keys, the ones console/checkpoint-view-logic.js
// meetingPayload builds, and the photos folder that rides along with them, and refuses any
// other, naming the stop. A note the director sends again in the round it was filed in (a
// round whose rework did not run, retried) files once. Invented text.
describe('4.5c: the meeting takes only its own keys, and a note sent again in its round files once', () => {
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const { withFactCheckMark } = require('../../lib/weave');
  const { meetingCheckpointData } = require('../../lib/meeting');
  const {
    meetingWeaveOf, meetingPayload, setThreadRole, setConnectionStruck, setQuestionAnswer
  } = require('../../console/checkpoint-view-logic');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const MARK = { at: 't', ready: true, fixes: 0 };
  const atMeeting = (extra = {}) => ({
    weave: withFactCheckMark(clone(WEAVE), MARK), _weaveBaseline: clone(WEAVE), directorGateNotes: [],
    arcRevisionCount: 0, humanArcRevisionCount: 0, ...extra
  });
  const take = (payload, state = atMeeting()) => buildResumePayload(payload, state, 'journalist', 'arc-selection');
  /** The stop's payload at a state, which the console's builders read (server.js getCheckpointData's arm). */
  const dataOf = (state) => meetingCheckpointData(state, { evidenceIndex: {}, maxRevisions: 1 });
  const shownOf = (state) => meetingWeaveOf(state.weave);
  const PAUSED = /^The thread is paused at the story meeting \(arc-selection\), which takes only its own action: \{meeting: "approve" \| "reweave" \| "send-back", weave, note\}\. /;

  describe('at the meeting the server takes its own keys and the photos folder, and refuses any other, naming the stop', () => {
    it.each([
      ['an approval key no stop has', { approved: true }, 'approved'],
      ["a rider no arm reads at the meeting, beside the meeting's own approve", { meeting: 'approve', weave: clone(WEAVE), rescuedItems: ['p-rescued'] }, 'rescuedItems'],
      ["another stop's note, beside a reweave", { meeting: 'reweave', weave: clone(WEAVE), note: 'Fit the ledger in.', outlineNote: 'Keep the bonus beat.' }, 'outlineNote'],
      ['two keys the meeting does not take', { meeting: 'approve', weave: clone(WEAVE), theme: 'journalist', force: true }, 'theme and force']
    ])('%s: refused, naming the stop and the keys, and nothing written', (_name, approvals, named) => {
      const result = take(approvals);
      expect(result.error).toMatch(PAUSED);
      expect(result.error).toContain(`This request carries ${named}, which the story meeting does not take.`);
      expect(result.resume).toEqual({});
      expect(result.stateUpdates).toEqual({});
    });

    it("takes every payload the console builds, each carrying only the meeting's keys, and the photos folder beside the meeting's own action", () => {
      const state = atMeeting();
      const data = dataOf(state);
      const reroled = setThreadRole(shownOf(state), 2, 'mirrors-it');
      const payloads = [
        meetingPayload('approve', data, shownOf(state), ''),
        meetingPayload('approve', data, reroled, 'Lead with the vote.'),
        meetingPayload('reweave', data, reroled, ''),
        meetingPayload('reweave', data, shownOf(state), 'Make the sale the main thread.'),
        meetingPayload('send-back', data, shownOf(state), 'Rethink the money thread.'),
        meetingPayload('send-back', data, setQuestionAnswer(shownOf(state), 0, 'Sarah ran the bar.'), 'Rethink it.')
      ];
      payloads.forEach((payload) => {
        expect(Object.keys(payload).filter((key) => !['meeting', 'weave', 'note'].includes(key))).toEqual([]);
        expect(take(payload, atMeeting()).error).toBeNull();
      });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-meeting-photos-'));
      try {
        const withPhotos = take({ ...payloads[0], photosPath: dir }, atMeeting());
        expect(withPhotos.error).toBeNull();
        expect(withPhotos.stateUpdates.photosPath).toBe(dir);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('a note sent again in the round it was filed in files once', () => {
    const NOTE = 'Make the sale the main thread.';
    /** The meeting reopened after a round whose rework timed out: reviseArcs gives the round back. */
    const reopenedAfter = (state, taken) => ({
      ...state, ...taken.stateUpdates, _meetingRound: null, _arcFeedback: null, arcRevisionCount: 0,
      humanArcRevisionCount: state.humanArcRevisionCount,
      _arcReworkTimeout: { consecutive: 1, attempt: 0, round: taken.stateUpdates._meetingRound, note: taken.stateUpdates._arcFeedback, at: 't' }
    });

    it('the retry of a round that did not run, with its note, files no second note; the round reads the note all the same', () => {
      const state = atMeeting();
      const first = take(meetingPayload('reweave', dataOf(state), shownOf(state), NOTE), state);
      expect(first.stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'arc-selection', kind: 'rejection', round: 1, text: NOTE })]);
      const reopened = reopenedAfter(state, first);
      const retry = take(meetingPayload('reweave', dataOf(reopened), shownOf(reopened), NOTE), reopened);
      expect(retry.error).toBeNull();
      expect(retry.resume).toEqual({ approved: false, round: 'reweave', feedback: NOTE });
      expect(retry.stateUpdates._arcFeedback).toBe(NOTE);
      expect(retry.stateUpdates.directorGateNotes).toBeUndefined();
    });

    // Fix round 1, finding 1: the same words kept with Approve at the reopened meeting are no
    // longer filed beside the round's note; they replace it (the "a round that did not run
    // leaves its note to the director's next action" describe at the end of this file).
    it('the same words in a later round file again', () => {
      const state = atMeeting();
      const first = take(meetingPayload('reweave', dataOf(state), shownOf(state), NOTE), state);
      const reopened = reopenedAfter(state, first);
      // A round that ran: the next look at the meeting is its next round.
      const nextRound = { ...reopened, humanArcRevisionCount: 1, _arcReworkTimeout: null };
      const again = take(meetingPayload('reweave', dataOf(nextRound), shownOf(nextRound), NOTE), nextRound);
      expect(again.stateUpdates.directorGateNotes.map((n) => [n.kind, n.round, n.text])).toEqual([['rejection', 1, NOTE], ['rejection', 2, NOTE]]);
    });

    it('a note filed before notes recorded their round holds back no note', () => {
      const state = atMeeting({ directorGateNotes: [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: NOTE, at: 't0' }] });
      expect(take(meetingPayload('reweave', dataOf(state), shownOf(state), NOTE), state).stateUpdates.directorGateNotes).toHaveLength(2);
    });
  });

  // Review 4.8, minor 8: the two payload shapes the pure tests alone covered.
  describe("the console's note-only reweave and a send-back that carries a role change, through the gate", () => {
    it("a note-only reweave: the director's round, on the weave as shown, with no edit and the note as the round's", () => {
      const state = atMeeting();
      const payload = meetingPayload('reweave', dataOf(state), shownOf(state), 'Make the sale the main thread.');
      expect(payload).toEqual({ meeting: 'reweave', weave: clone(WEAVE), note: 'Make the sale the main thread.' });
      const { resume, stateUpdates, error } = take(payload, state);
      expect(error).toBeNull();
      expect(resume).toEqual({ approved: false, round: 'reweave', feedback: 'Make the sale the main thread.' });
      expect(stateUpdates).toMatchObject({ weave: state.weave, _weaveHandEdits: null, _meetingRound: 'reweave', _arcFeedback: 'Make the sale the main thread.' });
      expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'arc-selection', kind: 'rejection', text: 'Make the sale the main thread.' })]);
    });

    it('a send-back that carries a role change: the role stored as the director left it, its edit standing, and the note as the round\'s', () => {
      const state = atMeeting();
      const reroled = setThreadRole(shownOf(state), 2, 'mirrors-it');
      const payload = meetingPayload('send-back', dataOf(state), reroled, 'Rethink the money thread.');
      expect(payload).toEqual({ meeting: 'send-back', note: 'Rethink the money thread.', weave: reroled });
      const { resume, stateUpdates, error } = take(payload, state);
      expect(error).toBeNull();
      expect(resume).toEqual({ approved: false, round: 'send-back', feedback: 'Rethink the money thread.' });
      expect(stateUpdates.weave.threads[2].role).toBe('mirrors-it');
      expect(stateUpdates._weaveHandEdits.edits.map((e) => e.path)).toEqual(['threads[#t3].role']);
      expect(stateUpdates).toMatchObject({ _meetingRound: 'send-back', _arcFeedback: 'Rethink the money thread.' });
    });
  });

  describe('a reweave whose only change brings back a connection the director struck is taken', () => {
    const struck = () => setConnectionStruck(clone(WEAVE), 1, true);
    /** The director strikes c2 and approves: their strike is E1. */
    const approvedWithStrike = () => take(meetingPayload('approve', dataOf(atMeeting()), struck(), ''), atMeeting());

    it("after a round, whose weave holds the strike: the console sends the reweave, and the un-strike is the director's edit", () => {
      const afterRound = atMeeting({
        weave: withFactCheckMark(struck(), MARK), _weaveBaseline: struck(),
        _weaveHandEdits: approvedWithStrike().stateUpdates._weaveHandEdits, humanArcRevisionCount: 1
      });
      const payload = meetingPayload('reweave', dataOf(afterRound), setConnectionStruck(shownOf(afterRound), 1, false), '');
      expect(payload).not.toBeNull();
      const { resume, stateUpdates, error } = take(payload, afterRound);
      expect(error).toBeNull();
      expect(resume).toEqual({ approved: false, round: 'reweave' });
      expect(stateUpdates._weaveHandEdits.edits.map((e) => [e.id, e.path, e.unstruck])).toEqual([['E2', 'connections[#c2]', true]]);
    });

    it('with no round since the strike (an approve, then back to the meeting, which reopens as the director left it)', () => {
      const back = atMeeting({ ...approvedWithStrike().stateUpdates });
      const payload = meetingPayload('reweave', dataOf(back), setConnectionStruck(shownOf(back), 1, false), '');
      expect(payload).not.toBeNull();
      const { stateUpdates, error } = take(payload, back);
      expect(error).toBeNull();
      expect(stateUpdates._weaveHandEdits.edits.map((e) => [e.id, e.path, e.unstruck])).toEqual([['E2', 'connections[#c2]', true]]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5c fix round 1, finding 2: a change at the place of a standing edit is the director's
// whether or not a round ran since
// ═══════════════════════════════════════════════════════════════════════════
//
// The review's probes (p4/4.5c-review/restrike-after-unstrike.js, role-back-and-forth.js):
// a strike a round kept, brought back at an approve, then struck again with no round since,
// was no edit, so the console offered Reweave and the gate refused it as empty; a role set
// back and forth the same way did the same. The gate now reads each place a standing edit is
// carried in the weave the meeting showed as the meeting showed it (lib/hand-edit-diff.js
// withShownEdits). Invented text.
describe('4.5c fix round 1: a change at the place of a standing edit is the director\'s whether or not a round ran since', () => {
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const { withFactCheckMark, weaveForPrompt } = require('../../lib/weave');
  const { settleEdits, carriedEdits, REWEAVE_PASS } = require('../../lib/hand-edit-diff');
  const { meetingCheckpointData } = require('../../lib/meeting');
  const {
    meetingDraftOf, meetingPayload, meetingButtons, setThreadRole, setConnectionStruck
  } = require('../../console/checkpoint-view-logic');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const MARK = { at: 't', ready: true, fixes: 0 };
  const atMeeting = () => ({
    weave: withFactCheckMark(clone(WEAVE), MARK), _weaveBaseline: clone(WEAVE), directorGateNotes: [],
    arcRevisionCount: 0, humanArcRevisionCount: 0
  });
  const take = (payload, state) => buildResumePayload(payload, state, 'journalist', 'arc-selection');
  const dataOf = (state) => meetingCheckpointData(state, { evidenceIndex: {}, maxRevisions: 1 });

  /** The director acts at the meeting through the console's builders: the payload, Reweave's offer, and the gate's answer. */
  function act(state, action, change) {
    const data = dataOf(state);
    const left = change(meetingDraftOf(data, undefined));
    const payload = meetingPayload(action, data, left, '');
    return { offered: !meetingButtons(data, left, '', false).reweave.disabled, payload, taken: payload ? take(payload, state) : null };
  }

  /** A reweave that runs and keeps every line of the director's: code settles it, and its weave is the writer's last. */
  function ranRound(state) {
    const before = weaveForPrompt(state.weave);
    const { output } = settleEdits(null, { edits: carriedEdits(state._weaveHandEdits, before), before, after: clone(before), pass: REWEAVE_PASS });
    return {
      ...state, weave: withFactCheckMark(output, MARK), _weaveBaseline: weaveForPrompt(output),
      _meetingRound: null, _arcFeedback: null, humanArcRevisionCount: state.humanArcRevisionCount + 1
    };
  }

  it('strike, a reweave that keeps it, bring it back and approve, back at the meeting, strike again: Reweave is offered, the gate takes it, and the strike is an edit', () => {
    const struck = act(atMeeting(), 'reweave', (w) => setConnectionStruck(w, 1, true));
    expect(struck.taken.error).toBeNull();
    const afterRound = ranRound({ ...atMeeting(), ...struck.taken.stateUpdates });
    const back = act(afterRound, 'approve', (w) => setConnectionStruck(w, 1, false));
    expect(back.taken.error).toBeNull();
    expect(back.taken.stateUpdates._weaveHandEdits.edits.map((e) => [e.id, e.path, e.unstruck === true])).toEqual([['E2', 'connections[#c2]', true]]);
    // Back at the meeting (R9): as the director left it, with no pass since.
    const again = act({ ...afterRound, ...back.taken.stateUpdates }, 'reweave', (w) => setConnectionStruck(w, 1, true));
    expect(again.offered).toBe(true);
    expect(again.taken.error).toBeNull();
    expect(again.taken.resume).toEqual({ approved: false, round: 'reweave' });
    expect(again.taken.stateUpdates._weaveHandEdits.edits.map((e) => [e.id, e.path, e.struck === true])).toEqual([['E3', 'connections[#c2]', true]]);
  });

  it('a role the same way: set, kept by a reweave, set back and approved, then set again with no round since', () => {
    const reroled = act(atMeeting(), 'reweave', (w) => setThreadRole(w, 2, 'mirrors-it'));
    const afterRound = ranRound({ ...atMeeting(), ...reroled.taken.stateUpdates });
    const back = act(afterRound, 'approve', (w) => setThreadRole(w, 2, 'complicates-it'));
    expect(back.taken.error).toBeNull();
    const again = act({ ...afterRound, ...back.taken.stateUpdates }, 'reweave', (w) => setThreadRole(w, 2, 'mirrors-it'));
    expect(again.offered).toBe(true);
    expect(again.taken.error).toBeNull();
    expect(again.taken.stateUpdates._weaveHandEdits.edits.map((e) => [e.id, e.path, e.before, e.after]))
      .toEqual([['E3', 'threads[#t3].role', 'complicates-it', 'mirrors-it']]);
  });

  it('with no round since an approve, setting the place of an edit back to the writer\'s is a reweave the gate takes, as after a round', () => {
    const approved = act(atMeeting(), 'approve', (w) => setThreadRole(w, 2, 'mirrors-it'));
    const back = act({ ...atMeeting(), ...approved.taken.stateUpdates }, 'reweave', (w) => setThreadRole(w, 2, 'complicates-it'));
    expect(back.offered).toBe(true);
    expect(back.taken.error).toBeNull();
    expect(back.taken.stateUpdates._weaveHandEdits.edits.map((e) => [e.id, e.path, e.before, e.after]))
      .toEqual([['E2', 'threads[#t3].role', 'mirrors-it', 'complicates-it']]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5c fix round 1, finding 1: a round that did not run leaves its note to the director's
// next action
// ═══════════════════════════════════════════════════════════════════════════
//
// The review's probe (p4/4.5c-review/restored-note-clear.js): a reweave posted with a note
// filed it as a standing rejection note, and its rework timed out; at the reopened meeting
// "Clear it and approve" left the note standing, and the map writer read it as applied by a
// rework that never ran; "Keep it and approve" filed it again, as an approval note beside it.
// The director's next action at the meeting now decides: sent again with a round, it stands
// as filed; kept with Approve, it is an approval note; cleared, or replaced by another note,
// it goes. Until then the stop lists it in the note box, not among the standing notes.
// Invented text.
describe('4.5c fix round 1: a round that did not run leaves its note to the director\'s next action', () => {
  const { WEAVE } = require('../../lib/__tests__/fixtures/rework-state');
  const { withFactCheckMark } = require('../../lib/weave');
  const { meetingCheckpointData } = require('../../lib/meeting');
  const { meetingWeaveOf, meetingPayload } = require('../../console/checkpoint-view-logic');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const MARK = { at: 't', ready: true, fixes: 0 };
  const NOTE = 'Make the sale the main thread.';
  const EARLIER = { gate: 'outline', kind: 'approval', round: 1, stopRound: 1, text: 'Keep the bonus beat.', at: 't0' };
  const atMeeting = (extra = {}) => ({
    weave: withFactCheckMark(clone(WEAVE), MARK), _weaveBaseline: clone(WEAVE), directorGateNotes: [],
    arcRevisionCount: 0, humanArcRevisionCount: 0, ...extra
  });
  const take = (payload, state) => buildResumePayload(payload, state, 'journalist', 'arc-selection');
  const dataOf = (state) => meetingCheckpointData(state, { evidenceIndex: {}, maxRevisions: 1 });
  const shownOf = (state) => meetingWeaveOf(state.weave);
  const notesOf = (list) => list.map((n) => [n.gate, n.kind, n.text]);

  /** A round posted with its note, whose rework timed out: reviseArcs gives the round back, and the meeting reopens. */
  function reopenedAfter(action, note = NOTE, before = atMeeting()) {
    const taken = take(meetingPayload(action, dataOf(before), shownOf(before), note), before);
    expect(taken.error).toBeNull();
    return {
      ...before, ...taken.stateUpdates, _meetingRound: null, _arcFeedback: null, arcRevisionCount: 0,
      humanArcRevisionCount: before.humanArcRevisionCount,
      _arcReworkTimeout: { consecutive: 1, attempt: 0, round: action, note: taken.stateUpdates._arcFeedback, at: 't' }
    };
  }

  it('clear it and approve: the note the round filed goes, and no later writer reads it', () => {
    const reopened = reopenedAfter('reweave', NOTE, atMeeting({ directorGateNotes: [EARLIER] }));
    expect(notesOf(reopened.directorGateNotes)).toEqual([['outline', 'approval', EARLIER.text], ['arc-selection', 'rejection', NOTE]]);
    const cleared = take(meetingPayload('approve', dataOf(reopened), shownOf(reopened), ''), reopened);
    expect(cleared.error).toBeNull();
    expect(cleared.resume).toEqual({ approved: true });
    expect(notesOf(cleared.stateUpdates.directorGateNotes)).toEqual([['outline', 'approval', EARLIER.text]]);
  });

  it('keep it and approve: the note stands once, as an approval note, which a later writer reads as forward guidance', () => {
    const reopened = reopenedAfter('reweave');
    const kept = take(meetingPayload('approve', dataOf(reopened), shownOf(reopened), NOTE), reopened);
    expect(kept.error).toBeNull();
    expect(kept.stateUpdates.directorGateNotes).toEqual([
      expect.objectContaining({ gate: 'arc-selection', kind: 'approval', round: 1, stopRound: 1, text: NOTE })
    ]);
  });

  it('a retry with the note edited: the edited note is the round\'s, and the first goes', () => {
    const edited = 'Make the sale the main thread, and keep the heir out.';
    const reopened = reopenedAfter('reweave');
    const retry = take(meetingPayload('reweave', dataOf(reopened), shownOf(reopened), edited), reopened);
    expect(retry.error).toBeNull();
    expect(retry.stateUpdates._arcFeedback).toBe(edited);
    expect(retry.stateUpdates.directorGateNotes).toEqual([
      expect.objectContaining({ gate: 'arc-selection', kind: 'rejection', round: 1, stopRound: 1, text: edited })
    ]);
    // A send-back after a send-back that did not run, with another note, the same way.
    const sentBack = reopenedAfter('send-back', 'Rethink the money thread.');
    const again = take(meetingPayload('send-back', dataOf(sentBack), shownOf(sentBack), 'Rethink the heir thread.'), sentBack);
    expect(notesOf(again.stateUpdates.directorGateNotes)).toEqual([['arc-selection', 'rejection', 'Rethink the heir thread.']]);
  });

  it('the retry with the note as it was, by either round: the note stands as filed, once, and the round reads it as its own', () => {
    const reopened = reopenedAfter('reweave');
    const retry = take(meetingPayload('reweave', dataOf(reopened), shownOf(reopened), NOTE), reopened);
    expect(retry.stateUpdates._arcFeedback).toBe(NOTE);
    expect(retry.stateUpdates.directorGateNotes).toBeUndefined();
    const asSendBack = take(meetingPayload('send-back', dataOf(reopened), shownOf(reopened), NOTE), reopened);
    expect(asSendBack.resume).toEqual({ approved: false, round: 'send-back', feedback: NOTE });
    expect(asSendBack.stateUpdates.directorGateNotes).toBeUndefined();
  });

  it('only the round\'s own note goes: the same words from an earlier round stand, and a round with no note withdraws none', () => {
    // An earlier round ran with these words; this round (the second) carried them again and did not run.
    const secondRound = reopenedAfter('reweave', NOTE, atMeeting({
      humanArcRevisionCount: 1,
      directorGateNotes: [{ gate: 'arc-selection', kind: 'rejection', round: 1, stopRound: 1, text: NOTE, at: 't0' }]
    }));
    expect(secondRound.directorGateNotes.map((n) => n.stopRound)).toEqual([1, 2]);
    const cleared = take(meetingPayload('approve', dataOf(secondRound), shownOf(secondRound), ''), secondRound);
    expect(cleared.stateUpdates.directorGateNotes.map((n) => [n.kind, n.stopRound, n.text])).toEqual([['rejection', 1, NOTE]]);
    // A reweave with no note that did not run filed no note, and the next action withdraws none.
    const noteless = { ...atMeeting({ directorGateNotes: [EARLIER] }), _arcReworkTimeout: { consecutive: 1, attempt: 0, round: 'reweave', note: null, at: 't' } };
    expect(take(meetingPayload('approve', dataOf(noteless), shownOf(noteless), ''), noteless).stateUpdates.directorGateNotes).toBeUndefined();
  });

  it('the reopened stop lists the round\'s note in the note box\'s place, not among the standing notes; the others stay listed', () => {
    const reopened = reopenedAfter('reweave', NOTE, atMeeting({ directorGateNotes: [EARLIER] }));
    const data = dataOf(reopened);
    expect(data.roundDidNotRun).toEqual({ round: 'reweave', at: 't', note: NOTE });
    expect(notesOf(data.directorGateNotes)).toEqual([['outline', 'approval', EARLIER.text]]);
    // With no round that did not run, every note is listed.
    expect(notesOf(dataOf({ ...reopened, _arcReworkTimeout: null }).directorGateNotes))
      .toEqual([['outline', 'approval', EARLIER.text], ['arc-selection', 'rejection', NOTE]]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.7b (spec section 8; the integrator's ruling 1): a photo the director deletes at the
// desk joins the leave-out list, through 4.2's function (lib/photo-leave-out.js
// leavePhotosOut), at the approve or send-back that carries the delete. The desk sends the
// bundle on it with every approve and send-back, so a deleted photo is a photo block of the
// stored bundle whose filename appears nowhere in the desk's bundle.
describe('4.7b: a photo deleted at the desk joins the leave-out list', () => {
  const Desk = require('../../console/article-desk-logic');
  const { articleReviewPayload } = require('../../console/checkpoint-view-logic');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const P1 = { type: 'photo', filename: 'p1.jpg', caption: 'The six in the huddle.' };
  const P2 = { type: 'photo', filename: 'p2.jpg', caption: 'Alex at the ledger.' };
  const mapping = (exclude) => ({ characterMappings: [], additionalCharacters: [], corrections: {}, exclude });
  let dataDir;

  /** The writer's draft as the stop stores it: two photos in the intro. */
  const stored = () => {
    const b = clone(require('../fixtures/content-bundles/valid-journalist.json'));
    b.metadata.sessionId = '0926262';
    b.sections[0].content.push(clone(P1), clone(P2));
    return b;
  };
  const atStop = (bundle, extra = {}) => ({
    sessionId: '0926262',
    contentBundle: bundle,
    photoAnalyses: { analyses: [{ filename: 'p1.jpg' }, { filename: 'p2.jpg' }] },
    characterIdMappings: { 'p1.jpg': mapping(false), 'p2.jpg': mapping(false) },
    leftOutPhotos: [],
    ...extra
  });
  const review = (payload, state = atStop(stored())) => buildResumePayload(payload, state, 'journalist', 'article', { dataDir });
  /** The desk with the intro's second photo (p2.jpg) deleted. */
  const withoutP2 = () => Desk.deleteBlock(stored(), 0, 3);

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-desk-delete-'));
    fs.mkdirSync(path.join(dataDir, '0926262', 'photos'), { recursive: true });
    ['p1.jpg', 'p2.jpg'].forEach((f) => fs.writeFileSync(path.join(dataDir, '0926262', 'photos', f), 'jpeg'));
  });
  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  test("a send-back that deletes a photo leaves it out: on the list, and excluded in the photo's mapping", () => {
    const result = review(articleReviewPayload(withoutP2(), 'Tighten the intro.', 'send-back'));
    expect(result.error).toBeNull();
    expect(result.stateUpdates.leftOutPhotos).toEqual(['p2.jpg']);
    expect(result.stateUpdates.characterIdMappings['p2.jpg'].exclude).toBe(true);
    expect(result.stateUpdates.characterIdMappings['p1.jpg'].exclude).toBe(false);
    // The delete is also the director's cut at the stop, as every desk delete is.
    expect(result.stateUpdates._articleHandEdits.edits.map((e) => [e.path, e.before])).toEqual([['sections[#intro].content[-]', P2]]);
  });

  test('an approve that deletes a photo leaves it out too', () => {
    const result = review(articleReviewPayload(withoutP2(), '', 'approve'));
    expect(result.error).toBeNull();
    expect(result.stateUpdates.leftOutPhotos).toEqual(['p2.jpg']);
    expect(result.stateUpdates.characterIdMappings['p2.jpg'].exclude).toBe(true);
  });

  test('a photo still on the desk is no delete: moved to another section, or made the hero', () => {
    const moved = Desk.moveToSection(stored(), { section: 0, block: 3 }, 3);
    expect(review(articleReviewPayload(moved, 'Move it back.', 'send-back')).stateUpdates).not.toHaveProperty('leftOutPhotos');
    const hero = withoutP2();
    hero.heroImage = { filename: 'p2.jpg', caption: 'Alex at the ledger.' };
    const result = review(articleReviewPayload(hero, '', 'approve'));
    expect(result.error).toBeNull();
    expect(result.stateUpdates).not.toHaveProperty('leftOutPhotos');
  });

  test('an approve or send-back with no desk bundle, or a refused one, leaves nothing out', () => {
    expect(review({ article: true }).stateUpdates).not.toHaveProperty('leftOutPhotos');
    expect(review({ article: false, articleFeedback: 'Tighten it.' }).stateUpdates).not.toHaveProperty('leftOutPhotos');
    const broken = withoutP2();
    delete broken.headline;
    const refused = review(articleReviewPayload(broken, 'Tighten it.', 'send-back'));
    expect(refused.error).toContain('failed schema validation (content-bundle)');
    expect(refused.stateUpdates).not.toHaveProperty('leftOutPhotos');
  });

  test('the list keeps the photos left out before, each once', () => {
    const result = review(articleReviewPayload(withoutP2(), 'Tighten the intro.', 'send-back'), atStop(stored(), { leftOutPhotos: ['p9.jpg'] }));
    expect(result.stateUpdates.leftOutPhotos).toEqual(['p9.jpg', 'p2.jpg']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.9: the map's payload builders through buildResumePayload (brief 4.9)
// ═══════════════════════════════════════════════════════════════════════════
//
// The map's screen changes the map through console/outline-edit-logic.js and builds its
// payloads in console/checkpoint-view-logic.js. Fed through buildResumePayload on a state
// paused at the map, each is the 4.6 payload the gate takes, and the map it stores is the map
// the director left, every change in it: what the article writer reads next.
describe('4.9: the map\'s payload builders through buildResumePayload', () => {
  const EditLogic = require('../../console/outline-edit-logic');
  const { mapPayload, mapDraftOf } = require('../../console/checkpoint-view-logic');
  const { mapCheckpointData } = require('../../lib/map');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const atMap = () => ({
    outline: mapFixture(), _mapBaseline: mapFixture(), sessionConfig: { roster: ['Alex', 'Morgan', 'Riley', 'Sarah'] }, directorGateNotes: []
  });
  /** The stop's payload at a state, which the console's builders read (server.js getCheckpointData's arm). */
  const dataOf = (state) => mapCheckpointData(state, { keptPhotos: ['hero.jpg', 'p2.jpg'], maxRevisions: 1 });
  const take = (payload, state = atMap()) => buildResumePayload(payload, state, 'journalist', 'outline');
  const beatOf = (map, id) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].find((b) => b.id === id);

  /** A beat struck, one brought back, one added with its player, one moved, a line edited and a photo moved to the top. */
  function everyChange(state) {
    let m = mapDraftOf(dataOf(state), undefined);
    m = EditLogic.strikeBeat(m, 'b4');
    m = EditLogic.bringBackBeat(m, 'b9', 'closing');
    m = EditLogic.addBeat(m, 'followTheMoney', 'The bonus at 07:52 PM', 'Riley');
    m = EditLogic.moveBeat(m, 'b3', 'closing');
    m = EditLogic.mergeBeat(m, 'b6', EditLogic.buildBeat({ ...EditLogic.initBeat(beatOf(m, 'b6')), material: 'Riley: "I kept the books, and the second ledger"' }, beatOf(m, 'b6')));
    return EditLogic.movePhoto(m, 'theStory', 0, EditLogic.MAP_TOP_PHOTO);
  }

  test('approve: the map is stored as the director left it, each change a standing edit, the top photo the hero, the note an approval note', () => {
    const state = atMap();
    const left = everyChange(state);
    const { resume, stateUpdates, error } = take(mapPayload('approve', left, ' Keep the bonus beat. '), state);
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: true });
    expect(stateUpdates.outline).toEqual(left);
    expect(stateUpdates.heroImage).toBe('p2.jpg');
    expect(stateUpdates._outlineHandEdits.edits.map((e) => [e.path, e.from || null])).toEqual([
      ['sections[#followTheMoney].beats[#b10]', 'none'],
      ['sections[#closing].beats[#b6].material', null],
      ['sections[#closing].beats[#b9]', 'leftOut'],
      ['sections[#closing].beats[#b3]', 'theStory'],
      ['leftOut[#b4]', 'theStory'],
      ['topPhoto', 'theStory'],
      ['sections[#theStory].photos[#hero.jpg]', 'topPhoto']
    ]);
    expect(stateUpdates._outlineHandEdits.edits[4].struck).toBe(true);
    expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'outline', kind: 'approval', text: 'Keep the bonus beat.' })]);
  });

  test('approve untouched: the map as the stop showed it, with no edit and no note', () => {
    const state = atMap();
    const { stateUpdates, error } = take(mapPayload('approve', mapDraftOf(dataOf(state), undefined), ''), state);
    expect(error).toBeNull();
    expect(stateUpdates.outline).toEqual(state.outline);
    expect(stateUpdates._outlineHandEdits).toBeNull();
    expect(stateUpdates.directorGateNotes).toBeUndefined();
  });

  test('a send-back carries its note to the rework and the map as the director left it, and opens a round', () => {
    const state = atMap();
    const left = everyChange(state);
    const { resume, stateUpdates, error } = take(mapPayload('send-back', left, 'Lead with the bonus.'), state);
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: false, feedback: 'Lead with the bonus.' });
    expect(stateUpdates).toMatchObject({ outline: left, _outlineFeedback: 'Lead with the bonus.', _outlineHandEditReport: null, _outlineTrace: null });
    expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'outline', kind: 'rejection', text: 'Lead with the bonus.' })]);
  });

  test('app.js\'s fallback approve, built the same way, is a payload the gate takes', () => {
    const state = atMap();
    const { error, resume } = take(mapPayload('approve', mapDraftOf(dataOf(state), undefined), ''), state);
    expect(error).toBeNull();
    expect(resume.approved).toBe(true);
    expect(clone(state.outline)).toEqual(mapFixture());
  });
});
