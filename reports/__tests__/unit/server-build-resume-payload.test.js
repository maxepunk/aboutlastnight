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

  // Phase 3 (3.2; TH4): the lede's fields are optional now, so B2 is pinned on the type.
  it('rejects a journalist outline whose lede.primaryArc is not a string (B2)', () => {
    const edits = validJournalistOutline();
    edits.lede.primaryArc = 42;
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
      // Phase 3 (3.2; TH4): a lede with only a hook is a valid outline now, so the
      // malformed edit is one the schema still refuses.
      outlineEdits: { lede: { hook: 42 } }
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
    // F1: the edits stand by id at their stop (lib/hand-edit-diff.js standingAfterSendBack).
    expect(stateUpdates._outlineHandEdits).toEqual({
      kind: 'outline',
      issued: 1,
      edits: [{
        id: 'E1', scope: 'lede', path: 'lede.hook', at: [{ key: 'lede' }, { key: 'hook' }],
        before: before.lede.hook, after: 'A sharper hook.', removed: [before.lede.hook]
      }]
    });
    expect(stateUpdates._outlineHandEditReport).toBeNull();
  });

  // Fix 3.2b (finding 5): an outline written before phase 3 still carries
  // thePlayers.buried and whatsMissing.buriedItems, which the editors drop before
  // sending (dropRetiredOutlineFields). The diff must not record those two as
  // removals the director made.
  test('outline: an outline written before phase 3 diffs without the retired fields', () => {
    const before = validJournalistOutline();
    before.thePlayers.buried = ['the silent partner'];
    before.whatsMissing.buriedItems = ['transfer-009'];
    const edits = validJournalistOutline();
    edits.lede.hook = 'A sharper hook.';
    const { stateUpdates, error } = buildResumePayload(
      { outline: false, outlineFeedback: 'Tighten the lede', outlineEdits: edits },
      { outline: before, directorGateNotes: [] }
    );
    expect(error).toBeNull();
    expect(stateUpdates._outlineHandEdits).toEqual({
      kind: 'outline',
      issued: 1,
      edits: [{
        id: 'E1', scope: 'lede', path: 'lede.hook', at: [{ key: 'lede' }, { key: 'hook' }],
        before: before.lede.hook, after: 'A sharper hook.', removed: [before.lede.hook]
      }]
    });
    expect(before.thePlayers.buried).toEqual(['the silent partner']);   // the stored outline is not changed
  });

  test('outline: an outline written before phase 3, sent back unchanged, records no hand edit', () => {
    const before = validJournalistOutline();
    before.thePlayers.buried = ['the silent partner'];
    before.whatsMissing.buriedItems = ['transfer-009'];
    const { stateUpdates } = buildResumePayload(
      { outline: false, outlineFeedback: 'Rework the closing', outlineEdits: validJournalistOutline() },
      { outline: before }
    );
    expect(stateUpdates._outlineHandEdits).toBeNull();
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
    edits.closing = 'collapsed';                       // a section must be an object (phase 3: slots are optional, not untyped)
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

  test('the outline\'s edits stand the same way', () => {
    const shown = validJournalistOutline();
    const edits = validJournalistOutline();
    edits.closing.arcResolutions[0].resolution = 'The ledger does not settle it.';
    const first = buildResumePayload({ outline: false, outlineFeedback: 'x', outlineEdits: edits }, { outline: shown });
    const standing = first.stateUpdates._outlineHandEdits;
    expect(standing.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'closing.arcResolutions[0].resolution']]);
    const second = buildResumePayload({ outline: false, outlineFeedback: 'y' }, { outline: edits, _outlineHandEdits: standing });
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
      { outline: true, outlineEdits: { lede: 'collapsed' }, outlineNote: 'Keep my lede.' },
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

  test('an outline send back resets the outline trace and leaves the article trace alone', () => {
    const { stateUpdates, error } = buildResumePayload(
      { outline: false, outlineFeedback: 'Rework the closing' },
      { outline: validJournalistOutline(), _outlineTrace: [PASS], _articleTrace: [PASS] }
    );
    expect(error).toBeNull();
    expect(stateUpdates).toHaveProperty('_outlineTrace', null);
    expect(stateUpdates).not.toHaveProperty('_articleTrace');
  });

  test('an outline send back WITH edits resets it too', () => {
    const edits = validJournalistOutline();
    edits.lede.hook = 'A sharper hook.';
    const { stateUpdates, error } = buildResumePayload(
      { outline: false, outlineFeedback: 'Tighten the lede', outlineEdits: edits },
      { outline: validJournalistOutline(), _outlineTrace: [PASS] }
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
    const outline = buildResumePayload({ outline: true, outlineNote: 'Keep it.' }, { outline: validJournalistOutline(), _outlineTrace: [PASS] });
    const article = buildResumePayload({ article: true }, { contentBundle: bundleFixture(), _articleTrace: [PASS] });
    expect(outline.stateUpdates).not.toHaveProperty('_outlineTrace');
    expect(article.stateUpdates).not.toHaveProperty('_articleTrace');
  });

  test('an invalid edit sent back writes nothing, the trace reset included', () => {
    const edits = validJournalistOutline();
    edits.lede = 'collapsed';  // phase 3 (3.2): an empty lede is valid; a section must still be an object
    const { stateUpdates, error } = buildResumePayload(
      { outline: false, outlineFeedback: 'x', outlineEdits: edits },
      { outline: validJournalistOutline(), _outlineTrace: [PASS] }
    );
    expect(error).toMatch(/Edited outline failed schema validation/);
    expect(stateUpdates).not.toHaveProperty('_outlineTrace');
  });

  // Parity with the hand-edit fields across every outline/article action the server
  // takes: the trace is written exactly when that side's hand-edit report is, and
  // always as null. (Approve clears it in the checkpoint node, as it does the
  // hand-edit fields: checkpoint-hand-edit-clears.test.js.)
  const outlineEdits = () => { const e = validJournalistOutline(); e.lede.hook = 'A sharper hook.'; return e; };
  const articleEdits = () => { const e = bundleFixture(); e.headline.main = 'A different headline'; return e; };
  const invalidOutline = () => { const e = validJournalistOutline(); e.lede = {}; return e; };
  const ACTIONS = [
    ['outline send back', () => ({ outline: false, outlineFeedback: 'Rework it' })],
    ['outline send back with edits', () => ({ outline: false, outlineFeedback: 'Rework it', outlineEdits: outlineEdits() })],
    ['outline send back with an invalid edit', () => ({ outline: false, outlineFeedback: 'x', outlineEdits: invalidOutline() })],
    ['outline approve', () => ({ outline: true })],
    ['outline approve with edits and a note', () => ({ outline: true, outlineEdits: outlineEdits(), outlineNote: 'Keep it.' })],
    ['article send back', () => ({ article: false, articleFeedback: 'Rework it' })],
    ['article send back with edits', () => ({ article: false, articleFeedback: 'Rework it', articleEdits: articleEdits() })],
    ['article approve', () => ({ article: true })],
    ['article approve with edits', () => ({ article: true, articleEdits: articleEdits() })]
  ];

  test.each(ACTIONS)('%s: each trace is written exactly when its side\'s hand-edit report is', (_name, approvals) => {
    const { stateUpdates } = buildResumePayload(approvals(), {
      outline: validJournalistOutline(), contentBundle: bundleFixture(), _outlineTrace: [PASS], _articleTrace: [PASS]
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
