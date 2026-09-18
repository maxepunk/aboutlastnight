process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * buildResumePayload Unit Tests
 *
 * Covers outline approval/rejection routing AND schema validation of outlineEdits.
 */
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

  it('does not include outlineEdits when outline:false (rejection)', () => {
    const result = buildResumePayload({
      outline: false,
      outlineFeedback: 'needs more detail',
      outlineEdits: { lede: { hook: 'should not be applied' } }
    });
    expect(result.resume.approved).toBe(false);
    expect(result.stateUpdates.outline).toBeUndefined();
    expect(result.stateUpdates._outlineFeedback).toBe('needs more detail');
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

  it('does not apply articleEdits on rejection (article:false)', () => {
    const result = buildResumePayload({
      article: false,
      articleFeedback: 'tighten the lede',
      articleEdits: { headline: { main: 'should not be applied' } }
    });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(false);
    expect(result.stateUpdates.contentBundle).toBeUndefined();
    expect(result.stateUpdates._articleFeedback).toBe('tighten the lede');
  });

  it('approves without edits when articleEdits is omitted', () => {
    const result = buildResumePayload({ article: true });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.contentBundle).toBeUndefined();
  });
});
