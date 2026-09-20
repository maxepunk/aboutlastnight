process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * buildResumePayload Unit Tests
 *
 * Covers outline approval/rejection routing AND schema validation of outlineEdits.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildResumePayload } = require('../../server.js');

function validJournalistOutline() {
  return {
    lede: {
      hook: 'A party ends with one guest dead and a room full of liars.',
      keyTension: 'The room accused the wrong person.',
      primaryArc: 'The Blackwood embezzlement'
    },
    theStory: {
      arcInterweaving: {
        interleavingPlan: 'Open on the accusation, braid the money trail through it.',
        convergencePoint: 'The shell-account ledger names the real culprit.'
      },
      arcs: [
        { name: 'The embezzlement', paragraphCount: 3 }
      ]
    },
    followTheMoney: {
      arcConnections: [
        { arcName: 'The embezzlement', financialAngle: 'Funds routed through three shells.' }
      ]
    },
    thePlayers: {
      arcConnections: [
        { arcName: 'The embezzlement', characterAngle: 'Sarah controlled the accounts.' }
      ]
    },
    whatsMissing: {
      arcConnections: [
        { arcName: 'The embezzlement', openQuestion: 'Who signed the final transfer?' }
      ]
    },
    closing: {
      arcResolutions: [
        { arcName: 'The embezzlement', resolution: 'The ledger settles it.' }
      ]
    }
  };
}

function validDetectiveOutline() {
  return {
    executiveSummary: {
      hook: 'One body, six suspects, a paper trail.',
      caseOverview: 'Victim found at the Blackwood estate after the party.',
      primaryFindings: ['Funds were diverted.', 'The accused had no access.']
    },
    evidenceLocker: {
      evidenceGroups: [
        { theme: 'Financial', evidenceIds: ['rfid-001'], synthesis: 'Transfers cluster on one account.' }
      ]
    },
    suspectNetwork: {
      assessments: [
        { name: 'Sarah Blackwood', role: 'CFO', suspicionLevel: 'high' }
      ]
    },
    outstandingQuestions: {
      questions: ['Who authorized the final transfer?']
    },
    finalAssessment: {
      verdict: 'Evidence points to Sarah, not the accused.',
      closingLine: 'The ledger never lies; people do.'
    }
  };
}

describe('buildResumePayload — outlineEdits validation', () => {
  it('applies a structurally-valid journalist outline (no theme arg → defaults journalist)', () => {
    const edits = validJournalistOutline();
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toEqual(edits);
  });

  it('rejects a corrupt journalist outline (B1: arcConnections as a string) and does NOT apply it', () => {
    const edits = validJournalistOutline();
    edits.followTheMoney.arcConnections = 'Funds routed through three shells.';
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (outline)'));
    expect(result.error).toEqual(expect.stringContaining('/followTheMoney/arcConnections'));
    expect(result.stateUpdates.outline).toBeUndefined();
  });

  it('rejects a journalist outline missing required lede.primaryArc (B2)', () => {
    const edits = validJournalistOutline();
    delete edits.lede.primaryArc;
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (outline)'));
    expect(result.error).toEqual(expect.stringContaining('primaryArc'));
    expect(result.stateUpdates.outline).toBeUndefined();
  });

  it('rejects a journalist outline with a stray root pullQuotes key (B4)', () => {
    const edits = validJournalistOutline();
    edits.pullQuotes = [{ type: 'verbatim', text: 'quote' }];
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (outline)'));
    expect(result.stateUpdates.outline).toBeUndefined();
  });

  it('applies a structurally-valid detective outline when theme is detective', () => {
    const edits = validDetectiveOutline();
    const result = buildResumePayload({ outline: true, outlineEdits: edits }, {}, 'detective');
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toEqual(edits);
  });

  it('reads theme from currentState.theme when no explicit theme arg is passed', () => {
    const edits = validDetectiveOutline();
    const result = buildResumePayload({ outline: true, outlineEdits: edits }, { theme: 'detective' });
    expect(result.error).toBeNull();
    expect(result.stateUpdates.outline).toEqual(edits);
  });

  it('rejects a corrupt detective outline (assessments as a string)', () => {
    const edits = validDetectiveOutline();
    edits.suspectNetwork.assessments = 'Sarah is the prime suspect.';
    const result = buildResumePayload({ outline: true, outlineEdits: edits }, {}, 'detective');
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (detective-outline)'));
    expect(result.error).toEqual(expect.stringContaining('/suspectNetwork/assessments'));
    expect(result.stateUpdates.outline).toBeUndefined();
  });
});

describe('buildResumePayload — outlineEdits routing (regression, validation active)', () => {
  it('routes a complete valid outline into stateUpdates.outline when outline:true', () => {
    const edits = validJournalistOutline();
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toEqual(edits);
  });

  // Spec 2026-09-19 §4.1: edits now travel WITH a rejection, so a reject applies a
  // VALID edited outline (see 'reject WITH hand edits' below). A malformed one is
  // still refused, and refusing it writes nothing at all -- not even the feedback.
  it('refuses a malformed outlineEdits on outline:false instead of applying it', () => {
    const result = buildResumePayload({
      outline: false,
      outlineFeedback: 'needs more detail',
      outlineEdits: { lede: { hook: 'should not be applied' } }
    });
    expect(result.error).toMatch(/Edited outline failed schema validation \(outline\)/);
    expect(result.stateUpdates.outline).toBeUndefined();
    expect(result.stateUpdates._outlineFeedback).toBeUndefined();
  });

  it('approves without edits when outlineEdits is omitted', () => {
    const result = buildResumePayload({ outline: true });
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toBeUndefined();
  });
});

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

describe('buildResumePayload — arc-selection director guidance (Q2)', () => {
  it('carries trimmed outlineGuidance alongside the arc selection', () => {
    const result = buildResumePayload({
      selectedArcs: ['a'],
      outlineGuidance: '  Lead with the money, not the vote. '
    });
    expect(result.error).toBeNull();
    expect(result.resume.selectedArcs).toEqual(['a']);
    expect(result.stateUpdates.selectedArcs).toEqual(['a']);
    expect(result.stateUpdates._outlineGuidance).toBe('Lead with the money, not the vote.');
  });

  it('omits the key entirely for blank guidance', () => {
    ['', '   ', undefined, null, 42].forEach((guidance) => {
      const result = buildResumePayload({ selectedArcs: ['a'], outlineGuidance: guidance });
      expect('_outlineGuidance' in result.stateUpdates).toBe(false);
    });
  });

  it('does not attach guidance to an arc REJECTION', () => {
    const result = buildResumePayload({
      selectedArcs: false,
      arcFeedback: 'these arcs miss the vote',
      outlineGuidance: 'Lead with the money'
    });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(false);
    expect('_outlineGuidance' in result.stateUpdates).toBe(false);
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

    const arcs = buildResumePayload(
      { selectedArcs: ['a'], photosPath: dir }, {}, 'journalist', 'arc-selection'
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
      'character-ids': { characterIds: { 'Person in red': 'Sarah' } },
      outline: { outline: true },
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
    const result = buildResumePayload({
      selectedArcs: ['a'],
      whiteboardPhotoPath: 'D:/x.jpg'
    }, current, 'journalist', 'arc-selection');
    expect(result.error).toBeNull();
    expect('rawSessionInput' in result.stateUpdates).toBe(false);
  });
});

describe('reject WITH hand edits (spec 2026-09-19 §4.1)', () => {
  const bundleFixture = () => JSON.parse(JSON.stringify(require('../fixtures/content-bundles/valid-journalist.json')));

  test('outline: valid edits are written as the current outline with a diff and a null report', () => {
    const before = validJournalistOutline();
    const edits = validJournalistOutline();
    edits.lede.hook = 'A sharper hook.';
    const { resume, stateUpdates, error } = buildResumePayload(
      { outline: false, outlineFeedback: 'Tighten the lede', outlineEdits: edits },
      { outline: before, directorGateNotes: [] }
    );
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: false, feedback: 'Tighten the lede' });
    expect(stateUpdates.outline).toEqual(edits);
    expect(stateUpdates._outlineFeedback).toBe('Tighten the lede');
    expect(stateUpdates._outlineHandEdits).toEqual({
      kind: 'outline',
      sections: [{ key: 'lede', changes: [{ path: 'lede.hook', before: before.lede.hook, after: 'A sharper hook.' }] }]
    });
    expect(stateUpdates._outlineHandEditReport).toBeNull();
  });

  test('outline: edits identical to the current outline write the outline but a null diff', () => {
    const before = validJournalistOutline();
    const { stateUpdates } = buildResumePayload(
      { outline: false, outlineFeedback: 'Rework the closing', outlineEdits: validJournalistOutline() },
      { outline: before }
    );
    expect(stateUpdates.outline).toEqual(before);
    expect(stateUpdates._outlineHandEdits).toBeNull();
  });

  test('outline: invalid edits return the schema error and write nothing', () => {
    const edits = validJournalistOutline();
    edits.lede = {};                                   // hook/keyTension/primaryArc required
    const { stateUpdates, error } = buildResumePayload(
      { outline: false, outlineFeedback: 'x', outlineEdits: edits },
      { outline: validJournalistOutline() }
    );
    expect(error).toMatch(/Edited outline failed schema validation \(outline\)/);
    expect(stateUpdates.outline).toBeUndefined();
    expect(stateUpdates._outlineHandEdits).toBeUndefined();
    expect(stateUpdates.directorGateNotes).toBeUndefined();
  });

  test('outline: a reject WITHOUT edits resets the diff and report to null', () => {
    const { stateUpdates } = buildResumePayload(
      { outline: false, outlineFeedback: 'Rework it' },
      { outline: validJournalistOutline(), _outlineHandEdits: { kind: 'outline', sections: [] }, _outlineHandEditReport: { checked: ['lede'], changed: [] } }
    );
    expect(stateUpdates.outline).toBeUndefined();
    expect(stateUpdates._outlineHandEdits).toBeNull();
    expect(stateUpdates._outlineHandEditReport).toBeNull();
  });

  test('outline: detective theme validates against detective-outline', () => {
    const { error } = buildResumePayload(
      { outline: false, outlineFeedback: 'x', outlineEdits: validJournalistOutline() },
      { theme: 'detective', outline: {} }
    );
    expect(error).toMatch(/detective-outline/);
  });

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
    expect(stateUpdates._articleHandEdits.scopes.map((s) => s.key)).toEqual(['headline']);
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

describe('directorGateNotes (spec 2026-09-19 §5.2)', () => {
  const existing = [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the vote arc.', at: '2026-09-19T10:00:00.000Z' }];

  test('an arc rejection appends one arc-selection entry with round = existing arc notes + 1', () => {
    const { stateUpdates } = buildResumePayload({ selectedArcs: false, arcFeedback: 'Merge arcs 2 and 3.' }, { directorGateNotes: existing });
    expect(stateUpdates.directorGateNotes).toHaveLength(2);
    expect(stateUpdates.directorGateNotes[0]).toEqual(existing[0]);
    expect(stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'arc-selection', kind: 'rejection', round: 2, text: 'Merge arcs 2 and 3.' });
    expect(stateUpdates.directorGateNotes[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('an outline rejection appends an outline entry, round 1 when no outline notes exist', () => {
    const { stateUpdates } = buildResumePayload({ outline: false, outlineFeedback: 'Lead with the ledger.' }, { outline: validJournalistOutline(), directorGateNotes: existing });
    expect(stateUpdates.directorGateNotes.map((n) => n.gate)).toEqual(['arc-selection', 'outline']);
    expect(stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'outline', kind: 'rejection', round: 1, text: 'Lead with the ledger.' });
  });

  test('an article rejection appends an article entry; a missing channel counts as empty', () => {
    const { stateUpdates } = buildResumePayload({ article: false, articleFeedback: 'Name the shell account.' }, { contentBundle: {} });
    expect(stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'article', kind: 'rejection', round: 1, text: 'Name the shell account.' })]);
  });

  test('an approval with no note appends nothing, and arc GUIDANCE is not recorded as a note', () => {
    const a = buildResumePayload({ selectedArcs: ['arc-1'], outlineGuidance: 'Lead with the money.' }, { directorGateNotes: existing });
    expect(a.stateUpdates._outlineGuidance).toBe('Lead with the money.');
    expect(a.stateUpdates.directorGateNotes).toBeUndefined();
    const o = buildResumePayload({ outline: true }, { directorGateNotes: existing });
    expect(o.stateUpdates.directorGateNotes).toBeUndefined();
    const ar = buildResumePayload({ article: true }, { directorGateNotes: existing });
    expect(ar.stateUpdates.directorGateNotes).toBeUndefined();
    const blank = buildResumePayload({ outline: true, outlineNote: '   ' }, { directorGateNotes: existing });
    expect(blank.stateUpdates.directorGateNotes).toBeUndefined();
  });

  // Phase 1 brief 1.1: the note box is sent with WHATEVER the director presses.
  // A note sent with an approval stands for every later writer, labelled as an
  // approval note so the prompt can say it is forward guidance, not something a
  // rework already applied.
  test('an approval WITH a note appends one entry of kind approval, trimmed', () => {
    const o = buildResumePayload({ outline: true, outlineNote: '  Keep the ledger thread.  ' }, { outline: validJournalistOutline(), directorGateNotes: existing });
    expect(o.stateUpdates.directorGateNotes).toHaveLength(2);
    expect(o.stateUpdates.directorGateNotes[1]).toMatchObject({ gate: 'outline', kind: 'approval', round: 1, text: 'Keep the ledger thread.' });
    expect(o.stateUpdates.directorGateNotes[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const a = buildResumePayload({ article: true, articleNote: 'Name the shell account.' }, { contentBundle: {} });
    expect(a.stateUpdates.directorGateNotes).toEqual([expect.objectContaining({ gate: 'article', kind: 'approval', round: 1, text: 'Name the shell account.' })]);
  });

  test('an approval note travels with edits, and an invalid edit writes no note at all', () => {
    const withEdits = buildResumePayload(
      { outline: true, outlineEdits: validJournalistOutline(), outlineNote: 'Keep my lede.' },
      { outline: validJournalistOutline(), directorGateNotes: [] }
    );
    expect(withEdits.error).toBeNull();
    expect(withEdits.stateUpdates.directorGateNotes).toHaveLength(1);
    const bad = buildResumePayload(
      { outline: true, outlineEdits: { lede: {} }, outlineNote: 'Keep my lede.' },
      { outline: validJournalistOutline(), directorGateNotes: [] }
    );
    expect(bad.error).toContain('failed schema validation');
    expect(bad.stateUpdates.directorGateNotes).toBeUndefined();
  });

  test('round counts per gate AND kind, so an approval 1 and a rejection 1 coexist at one stop', () => {
    const afterApproval = buildResumePayload({ outline: true, outlineNote: 'Keep the ledger thread.' }, { outline: validJournalistOutline(), directorGateNotes: [] });
    const notes = afterApproval.stateUpdates.directorGateNotes;
    const afterReject = buildResumePayload({ outline: false, outlineFeedback: 'Lead with the ledger.' }, { outline: validJournalistOutline(), directorGateNotes: notes });
    expect(afterReject.stateUpdates.directorGateNotes.map((n) => [n.gate, n.kind, n.round])).toEqual([
      ['outline', 'approval', 1],
      ['outline', 'rejection', 1]
    ]);
    const afterSecondApproval = buildResumePayload({ outline: true, outlineNote: 'And keep the closing.' }, { outline: validJournalistOutline(), directorGateNotes: afterReject.stateUpdates.directorGateNotes });
    expect(afterSecondApproval.stateUpdates.directorGateNotes[2]).toMatchObject({ gate: 'outline', kind: 'approval', round: 2 });
  });
});
