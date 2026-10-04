/**
 * 4.12a: the harness drives the story meeting, the map and the desk (phase 4, brief 4.12a).
 *
 * Step mode prints each of the three stops through scripts/lib/stop-print.js, which prints the
 * page lib/stop-pages.js builds from the console's own view models (meetingView, mapView,
 * deskView), so the harness shows what the console shows: the desk with its marks through
 * deskMarksAt and deskAnchorKey, the marks beside no piece, the folds, and the desk's problems
 * through deskProblems, which the console would refuse (the integrator's ruling 2). No score is
 * printed anywhere. The payloads are scripts/lib/stop-payloads.js's, the console's builders.
 *
 * The printer is tested here on the server's own payloads; the harness runs main() on require,
 * so its wiring is pinned on the source, as e2e-paused-stop.test.js pins its opening. What went
 * with this slice (the arc stop's fields, the auto profiles, the local caps, the printed score,
 * the evaluation and the writer's questions read off the stops) is pinned gone.
 */
const fs = require('fs');
const path = require('path');

const View = require('../../../console/checkpoint-view-logic');
const Desk = require('../../../console/article-desk-logic');
const { meetingCheckpointData } = require('../../../lib/meeting');
const { mapCheckpointData } = require('../../../lib/map');
const { reworkFixtureState } = require('../../../lib/__tests__/fixtures/rework-state');
const { stopPrint } = require('../../../scripts/lib/stop-print');

const SCRIPTS = path.join(__dirname, '..', '..', '..', 'scripts');
const SRC = fs.readFileSync(path.join(SCRIPTS, 'e2e-walkthrough.js'), 'utf8');

/** A function's body in the harness, from its signature to its closing brace at the left margin. */
function body(signature) {
  const block = SRC.slice(SRC.indexOf(signature));
  return block.slice(0, block.indexOf('\n}\n'));
}

const textOf = (printed) => printed.map((line) => line.text).join('\n');

const meetingData = () => ({
  type: 'arc-selection',
  ...meetingCheckpointData({ ...reworkFixtureState('journalist'), meetingApproved: null }, { evidenceIndex: {}, maxRevisions: 1 }),
  directorGateNotes: [{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Keep the heir thread close.' }]
});
const mapData = () => ({
  type: 'outline',
  ...mapCheckpointData(reworkFixtureState('journalist'), { keptPhotos: ['hero.jpg', 'p2.jpg'], evidenceIndex: {}, maxRevisions: 1 }),
  trace: []
});

const paragraph = (text) => ({ type: 'paragraph', text });
const DASHED = 'The room weighed the fake demo—and then it weighed Alex.';
function deskData() {
  const bundle = {
    headline: { main: 'The Room Named Alex, Five Votes to Four', deck: 'Nine players and one verdict.' },
    byline: { author: 'Nova', title: 'Independent Reporter' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Alex asked for the scoreboard with two minutes left.'), paragraph(' ')] },
      { id: 'theStory', type: 'narrative', heading: 'The Story', content: [paragraph(DASHED)] }
    ]
  };
  return {
    type: 'article',
    contentBundle: bundle,
    factCheck: {
      structuralIssues: [],
      advisoryWarnings: [`Em-dash in the narrator's prose: "${DASHED}"`, 'Roster coverage gap: Sam is never named.'],
      findings: [
        { kind: 'emDash', status: 'advisory', place: { section: 'theStory', paragraph: 1 }, excerpt: DASHED, message: `Em-dash in the narrator's prose: "${DASHED}"` },
        { kind: 'roster', status: 'advisory', place: null, excerpt: '', message: 'Roster coverage gap: Sam is never named.' }
      ]
    },
    lastEvaluation: { phase: 'article', ready: true, overallScore: 0.93, structuralIssues: [], advisoryWarnings: [] },
    handEditReport: null,
    directorGateNotes: [],
    settledStory: { story: 'The room named Alex, and the money had already moved.', question: 'Will the verdict cost Alex anything?' },
    trace: [],
    revisionCount: 0,
    humanRevisionCount: 0,
    maxRevisions: 2
  };
}

describe('4.12a: step mode prints the three stops from the console\'s view models (scripts/lib/stop-print.js)', () => {
  it('prints the story meeting\'s page: the verdict, each line under the label the meeting gives it, each thread with its id and role, the questions', () => {
    const data = meetingData();
    const view = View.meetingView(data, View.meetingDraftOf(data), '');
    const text = textOf(stopPrint('arc-selection', data));
    expect(text).toContain(view.verdict.who);
    expect(text).toContain(`${View.MEETING_LINE_LABELS.story}: ${view.story.text}`);
    expect(text).toContain(`${View.MEETING_LINE_LABELS.headline}: ${view.headline.text}`);
    expect(text).toContain(`t1 (the room's verdict): ${view.threads[0].roleLabel} · ${view.threads[0].claim}`);
    expect(text).toContain(`Receipt: ${view.threads[0].receipt.label}`);
    expect(text).toContain(`${view.questions[0].about}: ${view.questions[0].question}`);
  });

  it('prints what the page folds as folded', () => {
    const printed = stopPrint('arc-selection', meetingData());
    const note = printed.find((line) => line.text.includes('Keep the heir thread close.'));
    expect(note.folded).toBe(true);
    expect(note.text).toMatch(/▸/);
  });

  it('prints the map\'s page: the settled story, each section under its slot\'s label, its job and beats, and the counts', () => {
    const data = mapData();
    const view = View.mapView(data, View.mapDraftOf(data));
    const text = textOf(stopPrint('outline', data));
    expect(text).toContain(view.settledStory.story);
    view.sections.forEach((section) => {
      expect(text).toContain(section.label);
      expect(text).toContain(`Job: ${section.job}`);
      section.beats.forEach((beat) => expect(text).toContain(beat.materialText));
    });
    expect(text).toContain(view.tally.cards);
  });

  it('prints the desk: the echo, the article with each mark under its piece by deskMarksAt, the marks beside no piece, the problems, and no score', () => {
    const data = deskData();
    const view = View.deskView(data, data.contentBundle);
    const printed = stopPrint('article', data);
    const text = textOf(printed);
    expect(text).toContain(view.echo.story);
    const dashed = printed.findIndex((line) => line.text.includes(DASHED) && !line.beside);
    const [mark] = View.deskMarksAt(view.marks, { kind: 'block', section: 1, block: 0 });
    expect(printed[dashed + 1].text).toContain(`${mark.label}: ${mark.text}`);
    expect(printed[dashed].text).toContain(View.deskAnchorKey({ kind: 'block', section: 1, block: 0 }));
    view.apart.items.forEach((apart) => expect(text).toContain(apart.text));
    Desk.deskProblems(data.contentBundle).forEach((problem) => expect(text).toContain(problem.message));
    expect(text).not.toMatch(/\b0\.93\b|\bscores?\b/i);
  });
});

describe('4.12a: the harness prints and approves the three stops through the shared modules', () => {
  // Task 4.12c: step mode prints every stop with a page through printStop, these three among them.
  it('prints the story meeting, the map and the desk through scripts/lib/stop-print.js in step mode, with the run\'s theme', () => {
    expect(SRC).toMatch(/const \{ stopPrint \} = require\('\.\/lib\/stop-print'\);/);
    const fn = body('function displayCheckpointData(');
    expect(fn).toMatch(/if \(PAGE_STOPS\.includes\(checkpointType\)\) \{\n\s*printStop\(checkpointType, checkpoint, currentPhase\);\n\s*return;\n\s*\}/);
    ['arc-selection', 'outline', 'article'].forEach((stop) => expect(fn).not.toContain(`case '${stop}':`));
    expect(body('function printStop(')).toMatch(/stopPrint\(stop, checkpoint, \{ theme: THEME \}\)/);
  });

  it('runs the three stops through one handler, which prints the same page and builds the console\'s payloads', () => {
    ['arc-selection', 'outline', 'article'].forEach((stop) => expect(SRC).toContain(`'${stop}': handleDecisionStop`));
    const fn = body('async function handleDecisionStop(');
    expect(fn).toMatch(/printStop\(stop, checkpoint, currentPhase\)/);
    expect(fn).toMatch(/stopApproval\(stop, checkpoint, \{ action, note \}\)/);
  });

  it('builds the default approval at those stops and at the character-IDs stop with stopApproval, from the run\'s options', () => {
    expect(SRC).toMatch(/const \{ stopApproval, STOP_ACTIONS(, optionsRefusal)? \} = require\('\.\/lib\/stop-payloads'\);/);
    const fn = body('function defaultApproval(');
    expect(fn).toMatch(/stopApproval\(checkpointType, checkpointData, \{ action: ACTION, note: NOTE, leaveOut: LEAVE_OUT, photoDescriptions: PHOTO_DESCRIPTIONS \}\)/);
  });

  it('takes --action, --note and --leave-out, and documents them in --help', () => {
    ['--action', '--note', '--leave-out'].forEach((flag) => expect(SRC).toContain(`getArgValue('${flag}')`));
    const help = body('function showHelp(');
    expect(help).toMatch(/--action <a>/);
    expect(help).toMatch(/--note <text>/);
    expect(help).toMatch(/--leave-out <files>/);
  });

  it('reads the console\'s view logic for the character-IDs cards rather than pairing analyses by index', () => {
    expect(SRC).toMatch(/const ViewLogic = require\('\.\.\/console\/checkpoint-view-logic'\);/);
    expect(SRC).toMatch(/ViewLogic\.characterIdCards\(/);
    expect(SRC).not.toMatch(/photos\[i\] \|\| 'unknown'/);
  });

  it('keeps none of what went: the arc stop\'s fields, the auto profiles, the local caps, the printed score and the evaluation and questions read off the stops', () => {
    [
      'narrativeArcs', 'keyMoments', 'emotionalTone', 'financialConnections', 'thematicLinks', 'arcInterweaving',
      'theStory.arcs', 'pullQuotes', '--profile', 'auto-profiles', 'loadAutoProfile', 'applySmartSelect', 'activeProfile',
      'REVISION_CAPS', 'displayRevisionDiff', 'revisionCache', 'displayEvaluationStatus', 'evaluationView',
      'lastEvaluationFrom', 'writerQuestionsView', 'displayWriterQuestions', 'writerQuestions', 'overallScore', 'evaluation.issues'
    ].forEach((gone) => expect(`${gone}: ${SRC.includes(gone)}`).toBe(`${gone}: false`));
    expect(fs.existsSync(path.join(SCRIPTS, '..', 'config', 'auto-profiles'))).toBe(false);
  });

  it('reads a verdict\'s structural issues, never its issues: the completion counts the last verdict\'s structuralIssues', () => {
    expect(SRC).not.toMatch(/\.issues\b/);
    expect(SRC).toMatch(/currentData\.validationResults\.structuralIssues/);
  });
});

// Task 4.12c: the input review and the character-IDs stop have a page (lib/stop-pages.js), so
// the harness prints them as the console shows them, as it prints the three decision stops,
// and its options say what they take (scripts/lib/stop-payloads.js optionsRefusal).
describe('4.12c: the harness prints the input review and the character-IDs stop from their pages', () => {
  const InputLogic = require('../../../console/input-review-logic');

  it('prints the input review\'s parse and the character-IDs stop\'s cards through stop-print', () => {
    const review = {
      type: 'input-review',
      sessionConfig: { accusation: { accused: ['Alex'], charge: 'Sold the company out from under Marcus', verdictKind: 'culprit' } },
      directorNotes: { whiteboard: { ambiguities: ['A name under the coffee stain'] } },
      ledger: { clock: { decided: true, evening: true, firstTime: '07:50 PM' }, adjustmentsParsed: true, accounts: [{ name: 'Melanie', total: 75000, tokenCount: 1 }], adjustments: [], mismatches: [], unclassified: [] }
    };
    const text = textOf(stopPrint('input-review', review));
    expect(text).toContain('Alex');
    expect(text).toContain('Sold the company out from under Marcus');
    expect(text).toContain(InputLogic.ledgerView(review.ledger).clockLine);
    expect(text).toContain('A name under the coffee stain');

    const photos = {
      type: 'character-ids',
      photoAnalyses: { analyses: [{ filename: 'hero.jpg', visualContent: 'Alex and Morgan at the bar.', characterDescriptions: [{ role: 'CENTRAL', description: 'A man in a grey suit.' }] }] },
      sessionPhotos: ['/p/hero.jpg'],
      leftOutPhotos: ['hero.jpg']
    };
    const printed = stopPrint('character-ids', photos);
    expect(textOf(printed)).toContain('hero.jpg');
    expect(textOf(printed)).toContain('Alex and Morgan at the bar.');
    expect(textOf(printed)).toContain('A man in a grey suit.');
    expect(printed.some((line) => /left out/i.test(line.text))).toBe(true);
  });

  it('step mode and the two stops\' handlers print the page; the handlers\' own displays, which read fields the parse no longer writes, went', () => {
    expect(SRC).toMatch(/const \{ PAGE_STOPS \} = require\('\.\.\/lib\/stop-pages'\);/);
    expect(body('async function handleInputReview(')).toMatch(/printStop\('input-review', checkpoint, currentPhase\)/);
    expect(body('async function handleCharacterIds(')).toMatch(/printStop\('character-ids', checkpoint, currentPhase\)/);
    ['DIRECTOR OBSERVATIONS', 'votingResults', 'questionsRaised', 'accusation.reasoning', 'relevanceScore'].forEach((gone) => {
      expect(`${gone}: ${SRC.includes(gone)}`).toBe(`${gone}: false`);
    });
  });

  // Task 4.12d: and --approve-file, which sends its file as it is, refuses the options it would drop.
  it('refuses a run whose options do not fit, through optionsRefusal, before anything is posted', () => {
    const fn = body('async function runWalkthrough(');
    expect(fn).toMatch(/const refusal = optionsRefusal\(\{ approveType: APPROVE_TYPE, stepMode: STEP_MODE, action: ACTION_ARG, note: NOTE_ARG, leaveOut: LEAVE_OUT_GIVEN, approveFile: APPROVE_FILE \}\);/);
    expect(fn.indexOf('optionsRefusal(')).toBeLessThan(fn.indexOf('await login()'));
    expect(SRC).toMatch(/const LEAVE_OUT_GIVEN = args\.includes\('--leave-out'\);/);
    expect(SRC).not.toMatch(/--action and --note go with/);
  });
});

// Task 4.12c, fix round 1: the input review's and the character-IDs stop's pages are what the
// stops log counts, and their screens show more than the page: the blocks each component renders
// straight from the payload, with no view model. The harness prints those beside the page, where
// the screen shows them (scripts/lib/stop-print.js), so a run sees what the director sees: an
// enrichment that fell back (the article would have no quote bank), a remote session's mode, the
// roster with its pronouns. The stops log still counts the page alone.
describe('4.12c, fix round 1: the harness prints beside a page the blocks its screen renders from the payload', () => {
  const { stopPage, wordsShown } = require('../../../lib/stop-pages');
  const { BESIDE_HEADINGS } = require('../../../scripts/lib/stop-print');
  const InputLogic = require('../../../console/input-review-logic');
  const componentSrc = (file) => fs.readFileSync(path.join(SCRIPTS, '..', 'console', 'components', 'checkpoints', file), 'utf8');
  const COMPONENT_SRC = { 'input-review': componentSrc('InputReview.js'), 'character-ids': componentSrc('CharacterIds.js') };

  const FALLBACK = 'Director-notes enrichment failed (SDK timeout). The article will have no quote bank. Reject with corrections to retry.';
  const DROPPED = '2 quotes dropped: not found verbatim in the prose. Anything a player actually said has to be in the notes word for word to reach the article.';

  /** The input review's payload as GET /checkpoint sends it: a remote session whose enrichment fell back. */
  function reviewData(extra = {}) {
    return {
      type: 'input-review',
      sessionConfig: {
        sessionId: '100426',
        journalistFirstName: 'Cass',
        reportingMode: 'remote',
        guestReporter: { name: 'Quinn' },
        roster: ['Alex', 'Morgan', 'Zed'],
        rosterPronouns: { Alex: 'he/him', Morgan: 'she/her' },
        accusation: { accused: ['Alex'], charge: 'Sold the company out from under Marcus', verdictKind: 'culprit' },
        exposures: [{ tokenId: 'ale003', exposer: 'Quinn', time: '08:10 PM', owner: 'Alex Reeves' }],
        exposedTokenCount: 1
      },
      directorNotes: { whiteboard: { names: ['Alex', 'Morgan'] } },
      playerFocus: {
        primaryInvestigation: 'Who sold the company?', primarySuspects: ['Alex', 'Morgan'],
        playerTheory: 'Alex sold it to cover a debt.', confidenceLevel: 'medium', secondaryThreads: ['The second ledger']
      },
      canonicalCharacters: { Alex: 'Alex Reeves', Morgan: 'Morgan Reed' },
      enrichment: { quotes: 0, characterMentions: 2, transactionReferences: 0, fallback: { reason: 'SDK timeout' }, warnings: { droppedQuotes: 2, unrecordedSpeakers: 1 } },
      ledger: { clock: { decided: true, evening: true, firstTime: '07:50 PM' }, adjustmentsParsed: true, accounts: [{ name: 'Melanie', total: 75000, tokenCount: 1 }], adjustments: [], mismatches: [], unclassified: [] },
      ...extra
    };
  }

  /** The character-IDs stop's payload: the interrupt's analyses and roster, getCheckpointData's photos and list. */
  function photosData(extra = {}) {
    return {
      type: 'character-ids',
      photoAnalyses: { analyses: [{ filename: 'hero.jpg', visualContent: 'Alex and Morgan at the bar.', characterDescriptions: [{ role: 'CENTRAL', description: 'A man in a grey suit.' }] }] },
      sessionPhotos: ['/p/hero.jpg'],
      leftOutPhotos: [],
      roster: ['Alex', 'Morgan'],
      ...extra
    };
  }

  /** Where a block's or a section's heading prints, folded or not. */
  const titleAt = (printed, label) => printed.findIndex((line) => line.tone === 'title' && line.text.replace(/^▸ /, '') === `── ${label} ──`);

  it('prints the enricher\'s fallback as an alert below the page, with the counts and the warnings the panel shows', () => {
    const data = reviewData();
    const printed = stopPrint('input-review', data);
    const fallback = printed.find((line) => line.text.includes(FALLBACK));
    expect(fallback).toEqual(expect.objectContaining({ tone: 'alert', folded: false }));
    const text = textOf(printed);
    expect(text).toContain('Quotes indexed: 0 · Character mentions: 2 · Transaction links: 0');
    expect(text).toContain(DROPPED);
    const warnings = InputLogic.enrichmentWarningLines(data.enrichment.warnings);
    expect(warnings).toEqual(['1 quote speaker not recorded: the notes and corrections do not name them']);
    warnings.forEach((warning) => expect(text).toContain(warning));
    // The panel closes the screen: below the whiteboard, the page's last section.
    expect(titleAt(printed, 'Director-Notes Enrichment')).toBeGreaterThan(titleAt(printed, 'Whiteboard'));
    expect(printed.indexOf(fallback)).toBeGreaterThan(titleAt(printed, 'Director-Notes Enrichment'));
  });

  it('prints the session\'s settings and the roster with each pronoun above the page, flagging a name no character matches', () => {
    const printed = stopPrint('input-review', reviewData());
    const text = textOf(printed);
    ['Session ID: 100426', 'Journalist: Cass', 'Reporting Mode: remote', 'Guest Reporter: Quinn | Guest Reporter', 'Theme: journalist']
      .forEach((setting) => expect(text).toContain(setting));
    const at = (name) => printed.findIndex((line) => line.text.trim() === name);
    ['Alex (he/him)', 'Morgan (she/her)', 'Zed (they/them)'].forEach((name) => expect([name, at(name) > -1]).toEqual([name, true]));
    expect(printed[at('Zed (they/them)') + 1]).toEqual(expect.objectContaining({ tone: 'concern', beside: true, text: '    ⚠ no character match' }));
    expect(printed.filter((line) => line.text.includes('no character match'))).toHaveLength(1);
    expect(titleAt(printed, 'Session Info')).toBeLessThan(titleAt(printed, 'Roster'));
    expect(titleAt(printed, 'Roster')).toBeLessThan(titleAt(printed, 'Accusation'));
  });

  it('leaves out the reporting mode and the guest reporter at a detective session, as the screen does', () => {
    const text = textOf(stopPrint('input-review', reviewData(), { theme: 'detective' }));
    expect(text).toContain('Theme: detective');
    expect(text).not.toMatch(/Reporting Mode|Guest Reporter/);
  });

  it('prints the player focus where the screen shows it: after the exposures, before the director\'s notes and the whiteboard', () => {
    const data = reviewData({
      directorNotes: { quotes: [{ speaker: 'Morgan', text: 'I only kept the books' }], whiteboard: { names: ['Alex', 'Morgan'] } },
      enrichment: { quotes: 1, characterMentions: 2, transactionReferences: 0, fallback: null, warnings: {} }
    });
    const printed = stopPrint('input-review', data);
    const focus = titleAt(printed, 'Player Focus');
    expect(titleAt(printed, 'Exposed Memories (1)')).toBeLessThan(focus);
    expect(focus).toBeLessThan(titleAt(printed, 'Quote Bank (1)'));
    expect(titleAt(printed, 'Quote Bank (1)')).toBeLessThan(titleAt(printed, 'Whiteboard'));
    expect(printed.slice(focus + 1, focus + 6).map((line) => line.text)).toEqual([
      '  Primary Investigation: Who sold the company?', '  Primary Suspects: Alex, Morgan',
      '  Player Theory: Alex sold it to cover a debt.', '  Confidence: medium', '  Secondary Threads: The second ledger'
    ]);
    expect(textOf(printed)).not.toContain('enrichment failed');
  });

  it('prints the page whole and in its order, and the stops log counts the page alone', () => {
    const data = reviewData();
    const page = stopPage('input-review', data);
    const printed = stopPrint('input-review', data);
    let at = 0;
    page.lines.forEach((line) => {
      const needle = line.text || line.label;
      const found = printed.findIndex((p, i) => i >= at && p.text.includes(needle) && p.folded === line.folded);
      expect([needle, found >= at]).toEqual([needle, true]);
      at = found + 1;
    });
    // None of the blocks beside the page is a line of it, so none is counted. Task 4.12d: the
    // enricher's warnings are the page's (enrichmentWarningLines), so the bare payload keeps them.
    const onPage = page.lines.map((line) => `${line.label} ${line.text}`).join('\n');
    ['remote', 'enrichment failed', 'she/her', 'Who sold the company?'].forEach((text) => expect([text, onPage.includes(text)]).toEqual([text, false]));
    const bare = reviewData({ playerFocus: null, canonicalCharacters: {}, enrichment: { warnings: { unrecordedSpeakers: 1 } } });
    bare.sessionConfig = { accusation: bare.sessionConfig.accusation, exposures: bare.sessionConfig.exposures, exposedTokenCount: 1 };
    expect(wordsShown('input-review', data)).toBe(wordsShown('input-review', bare));
  });

  it('prints the session\'s roster above the character-IDs cards, as the roster bar shows it, and counts the cards alone', () => {
    const printed = stopPrint('character-ids', photosData());
    const bar = titleAt(printed, 'Session Roster');
    expect(bar).toBe(0);
    expect(printed[bar + 1].text).toBe('  Alex, Morgan');
    expect(bar).toBeLessThan(titleAt(printed, 'hero.jpg'));
    // A thread that has parsed already: the bar reads the parse's roster, as the component does.
    expect(textOf(stopPrint('character-ids', photosData({ roster: undefined, sessionConfig: { roster: ['Riley'] } })))).toContain('  Riley');
    expect(titleAt(stopPrint('character-ids', photosData({ roster: [] })), 'Session Roster')).toBe(-1);
    expect(wordsShown('character-ids', photosData())).toBe(wordsShown('character-ids', photosData({ roster: [] })));
  });

  // Task 4.12d: each heading matched where its component renders it, not as any quoted string.
  it('heads each block in its component\'s words, and the fallback\'s alert is the enrichment panel\'s sentence', () => {
    const { rendersHeading } = require('../../../lib/__tests__/fixtures/component-source');
    expect(Object.keys(BESIDE_HEADINGS).sort()).toEqual(['character-ids', 'input-review']);
    Object.entries(BESIDE_HEADINGS).forEach(([stop, headings]) => {
      Object.values(headings).forEach((heading) => expect([stop, heading, rendersHeading(COMPONENT_SRC[stop], heading)]).toEqual([stop, heading, true]));
    });
    ['Director-notes enrichment failed (', 'no reason recorded', 'The article will have no quote bank. Reject with corrections to retry.']
      .forEach((words) => expect([words, COMPONENT_SRC['input-review'].includes(`'${words}'`)]).toEqual([words, true]));
  });

  it('prints the roster bar before the character-IDs handler asks who is in each photo', () => {
    const fn = body('async function handleCharacterIds(');
    expect(fn.indexOf("printStop('character-ids', checkpoint, currentPhase)")).toBeGreaterThan(-1);
    expect(fn.indexOf("printStop('character-ids', checkpoint, currentPhase)")).toBeLessThan(fn.indexOf('await prompt('));
  });
});

// ── Task 4.12d ──────────────────────────────────────────────────────────────
// The review of 4.12c (minors 3 and 4): --approve-file sends its file as it is, so the harness
// refuses the options it would drop (scripts/lib/stop-payloads.js optionsRefusal), and
// --leave-out only ticks. The help says so.
describe('4.12d: --help says what --leave-out and --approve-file take', () => {
  it('--help says --leave-out only ticks: a photo the server lists cannot be unticked, and the list goes out empty only when the server lists none', () => {
    const help = body('function showHelp(').replace(/\s+/g, ' ');
    const leaveOut = help.slice(help.indexOf('--leave-out <files>'), help.indexOf('--theme <theme>'));
    expect(leaveOut).toMatch(/only ticks/);
    expect(leaveOut).toMatch(/a photo the server already lists cannot be unticked/);
    expect(leaveOut).toMatch(/the list goes out empty only when the server lists none/);
    expect(leaveOut).not.toMatch(/an empty one included/);
  });

  it('--help says --approve-file takes no --action, --note or --leave-out', () => {
    const help = body('function showHelp(').replace(/\s+/g, ' ');
    const file = help.slice(help.indexOf('--approve-file <f>'), help.indexOf('--photo-descriptions <f>'));
    expect(file).toMatch(/takes no --action, --note or --leave-out/);
  });
});

// The re-review of 4.12c's fix round: the harness's copies of the enrichment panel's counts line
// and its dropped-quotes sentence were held to nothing. They are held here to InputReview.js run
// with a React that builds a tree (lib/__tests__/fixtures/component-source.js), so the harness
// prints what the panel renders. With the ruling on 4.12c's minor 2, the enricher's warnings and
// the notes receipt are the page's, and the harness places its blocks around them as the screen
// does.
describe('4.12d: the harness prints the input review\'s panel and notes as the screen renders them', () => {
  const { loadInputReview, textOf, elementsOf } = require('../../../lib/__tests__/fixtures/component-source');
  const { NOTES_RECEIPT_LABEL } = require('../../../lib/stop-pages');

  /** The input review's payload, with the enrichment and the notes a case gives. */
  const reviewWith = (extra = {}) => ({
    type: 'input-review',
    sessionConfig: {
      sessionId: '100426', roster: ['Alex', 'Morgan'],
      accusation: { accused: ['Alex'], charge: 'Sold the company out from under Marcus', verdictKind: 'culprit' },
      exposures: [{ tokenId: 'ale003', exposer: 'Quinn', time: '08:10 PM', owner: 'Alex Reeves' }],
      exposedTokenCount: 1
    },
    directorNotes: { whiteboard: { names: ['Alex', 'Morgan'] } },
    playerFocus: { primaryInvestigation: 'Who sold the company?' },
    ...extra
  });
  const titleAt = (printed, label) => printed.findIndex((line) => line.tone === 'title' && line.text.replace(/^▸ /, '') === `── ${label} ──`);

  it('prints the enrichment panel under its heading as the component renders it: the counts, the fallback, the quotes dropped, the enricher\'s warnings', () => {
    const { EnrichmentPanel } = loadInputReview();
    [
      { quotes: 3, characterMentions: 2, transactionReferences: 1, fallback: null, warnings: {} },
      { quotes: 0, characterMentions: 0, transactionReferences: 0, fallback: { reason: 'SDK timeout' }, warnings: { droppedQuotes: 1, unrecordedSpeakers: 2, droppedContexts: 1 } },
      { fallback: {}, warnings: { droppedQuotes: 2, droppedExcerpts: 1 } }
    ].forEach((enrichment) => {
      const printed = stopPrint('input-review', reviewWith({ enrichment }));
      const at = titleAt(printed, 'Director-Notes Enrichment');
      expect(at).toBeGreaterThan(-1);
      const panel = elementsOf(EnrichmentPanel({ enrichment }), (element) => element.type === 'p').map(textOf);
      expect(printed.slice(at + 1).map((line) => line.text.trim())).toEqual(panel);
    });
    // No enrichment, no panel, on the screen and in the print.
    expect(EnrichmentPanel({ enrichment: null })).toBeNull();
    expect(titleAt(stopPrint('input-review', reviewWith({ enrichment: null })), 'Director-Notes Enrichment')).toBe(-1);
  });

  it('prints the player focus before the director\'s notes, which the notes receipt opens, as the screen does', () => {
    const data = reviewWith({
      directorNotes: { rawProse: 'Alex and Morgan argued at the bar.', quotes: [{ speaker: 'Morgan', text: 'I only kept the books' }], whiteboard: {} }
    });
    const printed = stopPrint('input-review', data);
    const focus = titleAt(printed, 'Player Focus');
    const receipt = printed.findIndex((line) => line.text.trim().startsWith(`${NOTES_RECEIPT_LABEL}: `));
    expect(titleAt(printed, 'Exposed Memories (1)')).toBeLessThan(focus);
    expect([focus > -1, receipt > focus]).toEqual([true, true]);
    expect(receipt).toBeLessThan(titleAt(printed, 'Quote Bank (1)'));
  });
});

// Task 4.12e (the ruling on 4.12d's minor 1): the map's round, its headline, deck and top photo,
// and its counts are parts of the screen Outline.js names only as an aria-label (lib/stop-pages.js
// PAGE_REGIONS). The print names them nowhere, so each ran into the group of the heading printed
// before it: the round under "The settled story", the counts under the last section or "Dropped".
// Where a printed line's part of the screen differs from the line before it, the print now breaks
// with a rule that names nothing. A heading starts a group of its own, so a heading needs none.
describe('4.12e: the print breaks where the part of the screen changes, and names no part', () => {
  const { stopPage, PAGE_REGIONS } = require('../../../lib/stop-pages');
  const BREAK = { text: '──', tone: 'break', folded: false, beside: false };
  /** The map in the round after a send-back: its round line shows, with the note. */
  const mapInRound2 = () => ({ ...mapData(), humanRevisionCount: 1, previousFeedback: 'Move the vote earlier.' });
  /** The story meeting after a round that left the director's edit standing: its round's line shows, first on the page. */
  const meetingAfterARound = () => ({ ...meetingData(), handEditReport: { checked: ['E1'], changed: [] } });

  it("breaks before the map's round, before its headline, deck and top photo, and before its counts, so none falls under the heading before it", () => {
    const data = mapInRound2();
    const view = View.mapView(data, View.mapDraftOf(data));
    const printed = stopPrint('outline', data);
    const at = (text) => printed.findIndex((line) => line.text.trim() === text);
    const parts = [view.round.label, `Headline: ${view.headline.text}`, `Everyone: ${view.tally.everyone}`];
    parts.forEach((first) => {
      const i = at(first);
      expect([first, i > 0 && printed[i - 1]]).toEqual([first, BREAK]);
    });
    // Each part runs to the next break or heading: the round holds its label and the note.
    const round = at(view.round.label);
    expect(printed.slice(round, at(`Headline: ${view.headline.text}`) - 1).map((line) => line.text.trim()))
      .toEqual([view.round.label, view.round.note]);
  });

  it("breaks exactly where a line's part of the screen differs from the line before it, unless the line is a heading", () => {
    [['outline', mapInRound2()], ['outline', mapData()], ['arc-selection', meetingAfterARound()]].forEach(([stop, data]) => {
      const page = stopPage(stop, data).lines;
      const expected = [];
      page.forEach((line, i) => {
        if (i > 0 && line.region !== page[i - 1].region && line.tone !== 'title') expected.push('break');
        expected.push(line.tone);
      });
      expect([stop, stopPrint(stop, data).map((line) => line.tone)]).toEqual([stop, expected]);
    });
  });

  it('prints no break on a page whose lines name no part of the screen, and no printed line names a part', () => {
    const review = {
      type: 'input-review',
      sessionConfig: { roster: ['Alex'], accusation: { accused: ['Alex'], charge: 'Sold the company', verdictKind: 'culprit' } },
      directorNotes: { rawProse: 'Alex argued at the bar.', whiteboard: { names: ['Alex'] } },
      enrichment: { quotes: 0, characterMentions: 0, transactionReferences: 0, fallback: null, warnings: {} }
    };
    expect(stopPrint('input-review', review).filter((line) => line.tone === 'break')).toEqual([]);
    const names = Object.values(PAGE_REGIONS).flatMap((regions) => Object.values(regions));
    [['outline', mapInRound2()], ['arc-selection', meetingAfterARound()]].forEach(([stop, data]) => {
      const printed = stopPrint(stop, data).map((line) => line.text);
      names.forEach((name) => expect([stop, name, printed.some((text) => text.includes(name))]).toEqual([stop, name, false]));
    });
  });

  it('colours a break as the harness colours what it dims', () => {
    expect(SRC).toMatch(/const TONE_COLORS = \{[^}]*\bbreak: 'dim'/);
  });
});
