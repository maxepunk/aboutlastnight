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
  it('prints the story meeting, the map and the desk through scripts/lib/stop-print.js in step mode, with the run\'s theme', () => {
    expect(SRC).toMatch(/const \{ stopPrint \} = require\('\.\/lib\/stop-print'\);/);
    const fn = body('function displayCheckpointData(');
    ['arc-selection', 'outline', 'article'].forEach((stop) => expect(fn).toContain(`case '${stop}':`));
    expect(fn).toMatch(/case 'arc-selection':\n\s*case 'outline':\n\s*case 'article':\n\s*printStop\(checkpointType, checkpoint, currentPhase\);/);
    expect(body('function printStop(')).toMatch(/stopPrint\(stop, checkpoint, \{ theme: THEME \}\)/);
  });

  it('runs the three stops through one handler, which prints the same page and builds the console\'s payloads', () => {
    ['arc-selection', 'outline', 'article'].forEach((stop) => expect(SRC).toContain(`'${stop}': handleDecisionStop`));
    const fn = body('async function handleDecisionStop(');
    expect(fn).toMatch(/printStop\(stop, checkpoint, currentPhase\)/);
    expect(fn).toMatch(/stopApproval\(stop, checkpoint, \{ action, note \}\)/);
  });

  it('builds the default approval at those stops and at the character-IDs stop with stopApproval, from the run\'s options', () => {
    expect(SRC).toMatch(/const \{ stopApproval, STOP_ACTIONS \} = require\('\.\/lib\/stop-payloads'\);/);
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
