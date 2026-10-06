process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * 4.12a: the harness's payloads at the story meeting, the map, the desk and the character-IDs
 * stop are the console's own (phase 4, brief 4.12a; the integrator's rulings 1 and 2).
 *
 * scripts/lib/stop-payloads.js builds each through the console's builders
 * (console/checkpoint-view-logic.js): the meeting's through meetingPayload, the map's through
 * mapPayload(action, mapDraftOf(data), note), the desk's through articleReviewPayload with
 * articleEdits, and the character-IDs stop's through characterIdsPayload and
 * characterIdsSkipPayload, whose leave-out boxes start from the photos the server lists and
 * take the photos the run names (task 4.12c). Each payload here goes through the server's own
 * gate (server.js buildResumePayload) on a state in the new shape, and is taken. The old
 * payloads the harness used to send are refused by name, and a run whose options do not fit
 * is refused before it posts (optionsRefusal, task 4.12c). Invented text throughout.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildResumePayload, getCheckpointData } = require('../../../server.js');
const View = require('../../../console/checkpoint-view-logic');
const Desk = require('../../../console/article-desk-logic');
const { reworkFixtureState, DOCUMENT_TEXT } = require('../../../lib/__tests__/fixtures/rework-state');
const { stopApproval } = require('../../../scripts/lib/stop-payloads');

const SESSION = '010126';

/** The payload a stop sends, as the server builds it for a thread paused there. */
async function payloadAt(stop, state) {
  return { type: stop, ...(await getCheckpointData(stop, state)) };
}

/** The server's gate on a payload, at the stop the thread is paused at. */
const gate = (approvals, state, stop, options) => buildResumePayload(approvals, state, 'journalist', stop, options);

const paragraph = (text) => ({ type: 'paragraph', text });

/** The article on the desk: two printed photos, a card copied from the record. */
function article() {
  return {
    metadata: { sessionId: SESSION, theme: 'journalist', generatedAt: '2026-10-04T10:00:00.000Z' },
    headline: { main: 'Six Votes Said Overdose. The Ledger Said Sale.', kicker: 'NovaNews', deck: 'A sale the night he died.' },
    heroImage: { filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Alex and Morgan deadlocked, and six votes named an accidental overdose.')] },
      {
        id: 'theStory', type: 'narrative', heading: 'The Story',
        content: [
          paragraph('Marcus bragged about the sale the night he died.'),
          { type: 'evidence-card', tokenId: 'ale003', headline: 'The brag', content: DOCUMENT_TEXT.ale003, owner: 'Alex Reeves', significance: 'critical' },
          { type: 'photo', filename: 'p2.jpg', caption: 'Alex leans over the ledger and points at a line.' }
        ]
      },
      { id: 'closing', type: 'conclusion', content: [paragraph('Riley says they only kept the books.')] }
    ]
  };
}

let dataDir;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-e2e-payloads-'));
  const photos = path.join(dataDir, SESSION, 'photos');
  fs.mkdirSync(photos, { recursive: true });
  ['hero.jpg', 'p2.jpg'].forEach((name) => fs.writeFileSync(path.join(photos, name), 'jpg'));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('4.12a: the story meeting\'s payload is meetingPayload\'s', () => {
  const state = () => ({ ...reworkFixtureState('journalist'), meetingApproved: null });

  it('approves the weave as the stop shows it, and the gate takes it', async () => {
    const s = state();
    const data = await payloadAt('arc-selection', s);
    const built = stopApproval('arc-selection', data, { action: 'approve' });
    expect(built.payload).toEqual(View.meetingPayload('approve', data, View.meetingDraftOf(data), ''));
    expect(Object.keys(built.payload.weave).filter((key) => key.startsWith('_'))).toEqual([]);
    const { resume, error } = gate(built.payload, s, 'arc-selection');
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: true });
  });

  it('sends a note with an approve, which stands as an approval note', async () => {
    const s = state();
    const built = stopApproval('arc-selection', await payloadAt('arc-selection', s), { action: 'approve', note: 'Keep the heir thread close.' });
    const { stateUpdates, error } = gate(built.payload, s, 'arc-selection');
    expect(error).toBeNull();
    expect(stateUpdates.directorGateNotes.slice(-1)[0]).toMatchObject({ gate: 'arc-selection', kind: 'approval', text: 'Keep the heir thread close.' });
  });

  it('reweaves and sends back on a note, and the gate takes each as the director\'s round', async () => {
    const s = state();
    const data = await payloadAt('arc-selection', s);
    const reweave = stopApproval('arc-selection', data, { action: 'reweave', note: 'Lead with the money.' });
    expect(gate(reweave.payload, s, 'arc-selection').resume).toMatchObject({ approved: false, round: 'reweave' });
    const sendBack = stopApproval('arc-selection', data, { action: 'send-back', note: 'Rethink the weave around the heir.' });
    expect(gate(sendBack.payload, s, 'arc-selection').resume).toMatchObject({ approved: false, round: 'send-back', feedback: 'Rethink the weave around the heir.' });
  });

  it('builds no reweave with nothing to fit in, and no send-back without a note, and says why', async () => {
    const data = await payloadAt('arc-selection', state());
    const reweave = stopApproval('arc-selection', data, { action: 'reweave' });
    expect(reweave.payload).toBeUndefined();
    expect(reweave.refusal).toBe(View.meetingButtons(data, View.meetingDraftOf(data), '', false).reweave.hint);
    const sendBack = stopApproval('arc-selection', data, { action: 'send-back' });
    expect(sendBack.payload).toBeUndefined();
    expect(sendBack.refusal).toMatch(/send-back.*--note/i);
  });
});

describe('4.12a: the map\'s payload is mapPayload(action, mapDraftOf(data), note)', () => {
  it('approves and sends back the map as the stop shows it, and the gate takes each', async () => {
    const s = reworkFixtureState('journalist');
    const data = await payloadAt('outline', s);
    const approve = stopApproval('outline', data, { action: 'approve' });
    expect(approve.payload).toEqual(View.mapPayload('approve', View.mapDraftOf(data), ''));
    expect(gate(approve.payload, s, 'outline')).toMatchObject({ resume: { approved: true }, error: null });
    const sendBack = stopApproval('outline', data, { action: 'send-back', note: 'Move the vote earlier.' });
    expect(gate(sendBack.payload, s, 'outline')).toMatchObject({ resume: { approved: false, feedback: 'Move the vote earlier.' }, error: null });
  });

  it('builds no send-back without a note, and no reweave, which the map does not take', async () => {
    const data = await payloadAt('outline', reworkFixtureState('journalist'));
    expect(stopApproval('outline', data, { action: 'send-back' }).refusal).toMatch(/send-back.*--note/i);
    expect(stopApproval('outline', data, { action: 'reweave', note: 'x' }).refusal).toMatch(/map.*approve.*send-back/i);
  });
});

describe('4.12a: the desk\'s payload carries the article as articleEdits', () => {
  const state = (bundle = article()) => ({ ...reworkFixtureState('journalist'), contentBundle: bundle });

  it('approves the article as the desk shows it, and the gate takes it', async () => {
    const s = state();
    const data = await payloadAt('article', s);
    const built = stopApproval('article', data, { action: 'approve' });
    expect(built.payload).toEqual(View.articleReviewPayload(data.contentBundle, '', 'approve'));
    expect(built.payload.articleEdits).toEqual(s.contentBundle);
    expect(gate(built.payload, s, 'article', { dataDir })).toMatchObject({ resume: { approved: true }, error: null });
  });

  it('sends the article back on a note, with the article as left', async () => {
    const s = state();
    const built = stopApproval('article', await payloadAt('article', s), { action: 'send-back', note: 'Move the photo below the card.' });
    expect(built.payload).toMatchObject({ article: false, articleFeedback: 'Move the photo below the card.' });
    expect(gate(built.payload, s, 'article', { dataDir })).toMatchObject({ resume: { approved: false, feedback: 'Move the photo below the card.' }, error: null });
  });

  it('builds no send-back without a note, and no reweave', async () => {
    const data = await payloadAt('article', state());
    expect(stopApproval('article', data, { action: 'send-back' }).refusal).toMatch(/send-back.*--note/i);
    expect(stopApproval('article', data, { action: 'reweave', note: 'x' }).refusal).toMatch(/article.*approve.*send-back/i);
  });

  // The integrator's ruling 2: the desk's checks run in the console, so the harness's approval
  // meets the server's schema gate alone; step mode prints what the console would refuse.
  it('meets the server\'s schema gate alone: the desk\'s problems do not stop the harness, and the gate refuses what its schema refuses', async () => {
    const blank = article();
    blank.sections[0].content.push(paragraph(' '));
    const blankData = await payloadAt('article', state(blank));
    expect(Desk.deskProblems(blank).length).toBeGreaterThan(0);
    const sent = stopApproval('article', blankData, { action: 'approve' });
    expect(gate(sent.payload, state(blank), 'article', { dataDir }).error).toBeNull();

    const empty = article();
    empty.sections[0].content.push(paragraph(''));
    const refused = stopApproval('article', await payloadAt('article', state(empty)), { action: 'approve' });
    expect(gate(refused.payload, state(empty), 'article', { dataDir }).error).toMatch(/schema validation/);
  });
});

// Task 4.12c: the boxes start from the photos the server lists, as the console's do, so the
// payload always carries the list, as the console's builders build it (4.12c's describe below).
describe('4.12a: the character-IDs payload is the console\'s, with the photos the run names left out (ruling 1)', () => {
  const state = () => ({ ...reworkFixtureState('journalist'), characterIdMappings: null });

  it('skips with the boxes as the server lists them when the run names no photo, which leaves the list as it is', async () => {
    const s = state();
    const data = await payloadAt('character-ids', s);
    const cards = View.characterIdCards(data.photoAnalyses.analyses, data.sessionPhotos, data.leftOutPhotos);
    const built = stopApproval('character-ids', data, {});
    expect(built.payload).toEqual(View.characterIdsSkipPayload(cards, View.characterIdLeaveOutTicks(cards)));
    expect(built.payload).toEqual({ characterIds: {}, leftOutPhotos: [] });
    const { stateUpdates, error } = gate(built.payload, s, 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates.leftOutPhotos).toEqual([]);
  });

  it('skips through characterIdsSkipPayload with the photos the run names, matched as the cards match them', async () => {
    const s = state();
    const data = await payloadAt('character-ids', s);
    const built = stopApproval('character-ids', data, { leaveOut: ['P2.JPG'] });
    const cards = View.characterIdCards(data.photoAnalyses.analyses, data.sessionPhotos, data.leftOutPhotos);
    expect(built.payload).toEqual(View.characterIdsSkipPayload(cards, { 'p2.jpg': true }));
    expect(built.payload.leftOutPhotos).toEqual(['p2.jpg']);
    const { stateUpdates, error } = gate(built.payload, s, 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates.leftOutPhotos).toEqual(['p2.jpg']);
  });

  it('approves through characterIdsPayload when the run gives the director\'s descriptions, with the list as the boxes leave it', async () => {
    const s = state();
    const data = await payloadAt('character-ids', s);
    const descriptions = { 'p2.jpg': 'Alex leans over the ledger and points at a line.' };
    const cards = View.characterIdCards(data.photoAnalyses.analyses, data.sessionPhotos, data.leftOutPhotos);

    const described = stopApproval('character-ids', data, { photoDescriptions: descriptions });
    expect(described.payload).toEqual(View.characterIdsPayload(cards, descriptions, View.characterIdLeaveOutTicks(cards)));
    expect(described.payload.leftOutPhotos).toEqual([]);
    expect(gate(described.payload, s, 'character-ids')).toMatchObject({ error: null, stateUpdates: { photoDescriptions: descriptions } });

    const both = stopApproval('character-ids', data, { photoDescriptions: descriptions, leaveOut: ['hero.jpg'] });
    expect(both.payload).toEqual(View.characterIdsPayload(cards, descriptions, { 'hero.jpg': true }));
    expect(gate(both.payload, s, 'character-ids').stateUpdates.leftOutPhotos).toEqual(['hero.jpg']);
  });

  it('fails loud on a photo the stop does not show, naming it and the photos it does', async () => {
    const data = await payloadAt('character-ids', state());
    expect(() => stopApproval('character-ids', data, { leaveOut: ['nope.jpg'] })).toThrow(/nope\.jpg.*hero\.jpg, p2\.jpg/);
    expect(() => stopApproval('character-ids', data, { photoDescriptions: { 'nope.jpg': 'x' } })).toThrow(/nope\.jpg.*hero\.jpg, p2\.jpg/);
  });

  it('takes no action but approve', async () => {
    const data = await payloadAt('character-ids', state());
    expect(stopApproval('character-ids', data, { action: 'send-back', note: 'x' }).refusal).toMatch(/character-IDs.*approve/i);
  });
});

describe('4.12a: every other stop keeps the harness\'s own default, and the old payloads are refused by name', () => {
  it('builds nothing at a stop the console\'s builders do not cover', () => {
    ['input-review', 'paper-evidence-selection', 'await-roster', 'await-full-context', 'pre-curation', 'evidence-and-photos', 'photos']
      .forEach((stop) => expect([stop, stopApproval(stop, { type: stop }, {})]).toEqual([stop, null]));
  });

  it('the server refuses the arc selection and the old outline approval the harness used to send', () => {
    const s = { ...reworkFixtureState('journalist'), meetingApproved: null };
    expect(gate({ selectedArcs: ['t1', 't2', 't3'] }, s, 'arc-selection').error).toMatch(/selectedArcs/);
    expect(gate({ selectedArcs: ['t1'] }, s, null).error).toMatch(/arc selection is gone/);
    expect(gate({ outline: true }, reworkFixtureState('journalist'), 'outline').error).toMatch(/The map takes/);
  });
});

// Task 4.12c (ruling 4 on 4.12a's minors): the console starts its leave-out boxes from the
// photos the server lists (characterIdLeaveOutTicks), and the harness built its ticks from
// nothing, so a photo already left out came back unless --leave-out named it again, and no
// empty list could be sent. The harness's boxes start where the console's do, and the run's
// option ticks the photos it names, as a director's ticks do.
describe('4.12c: the leave-out boxes start where the console\'s do', () => {
  const listed = () => ({ ...reworkFixtureState('journalist'), characterIdMappings: null, leftOutPhotos: ['hero.jpg'] });
  const cardsOf = (data) => View.characterIdCards(data.photoAnalyses.analyses, data.sessionPhotos, data.leftOutPhotos);

  it('a photo the server lists stays out when the run names another one', async () => {
    const s = listed();
    const data = await payloadAt('character-ids', s);
    expect(data.leftOutPhotos).toEqual(['hero.jpg']);
    const cards = cardsOf(data);
    const built = stopApproval('character-ids', data, { leaveOut: ['p2.jpg'] });
    expect(built.payload).toEqual(View.characterIdsSkipPayload(cards, { ...View.characterIdLeaveOutTicks(cards), 'p2.jpg': true }));
    expect(built.payload.leftOutPhotos).toEqual(['hero.jpg', 'p2.jpg']);
    const { stateUpdates, error } = gate(built.payload, s, 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates.leftOutPhotos).toEqual(['hero.jpg', 'p2.jpg']);
  });

  it('with no photo named, the boxes are the server\'s list, sent as the console sends them, and the list stays as it is', async () => {
    const s = listed();
    const data = await payloadAt('character-ids', s);
    const descriptions = { 'p2.jpg': 'Alex leans over the ledger and points at a line.' };
    [stopApproval('character-ids', data, {}), stopApproval('character-ids', data, { leaveOut: [] }), stopApproval('character-ids', data, { photoDescriptions: descriptions })]
      .forEach((built) => {
        expect(built.payload.leftOutPhotos).toEqual(['hero.jpg']);
        expect(gate(built.payload, s, 'character-ids').stateUpdates.leftOutPhotos).toEqual(['hero.jpg']);
      });
  });

  it('sends an explicit empty list when no box is ticked, whether the run gave --leave-out with no photo or no --leave-out, and the gate takes it', async () => {
    const s = { ...reworkFixtureState('journalist'), characterIdMappings: null, leftOutPhotos: [] };
    const data = await payloadAt('character-ids', s);
    // The harness passes the names the option gave, an empty list for `--leave-out ""`, and null with no option.
    [[], null].forEach((leaveOut) => {
      const built = stopApproval('character-ids', data, { leaveOut });
      expect([leaveOut, built.payload]).toEqual([leaveOut, { characterIds: {}, leftOutPhotos: [] }]);
      const { stateUpdates, error } = gate(built.payload, s, 'character-ids');
      expect(error).toBeNull();
      expect(stateUpdates.leftOutPhotos).toEqual([]);
    });
  });
});

// Task 4.12c (ruling 4 on 4.12a's minors): the harness's options say what they take. The
// --action and --note guard named the meeting, the map and the article while it took the
// character-IDs stop too, and --leave-out at any other stop was dropped without a word.
describe('4.12c: the harness\'s options say what they take (optionsRefusal)', () => {
  const { STOP_ACTIONS, optionsRefusal } = require('../../../scripts/lib/stop-payloads');

  it('--action and --note go with --approve <stop> and --step at a stop STOP_ACTIONS lists, and the refusal names each stop with what it takes', () => {
    // The character-IDs stop takes one action and no note, so it is not among them.
    expect(Object.keys(STOP_ACTIONS)).toEqual(['arc-selection', 'outline', 'article']);
    const refusal = optionsRefusal({ approveType: 'character-ids', stepMode: true, action: 'approve' });
    expect(refusal).toMatch(/^--action and --note go with --approve <stop> and --step/);
    Object.entries(STOP_ACTIONS).forEach(([stop, actions]) => {
      expect([stop, refusal.includes(stop)]).toEqual([stop, true]);
      actions.forEach((action) => expect([action, refusal.includes(action)]).toEqual([action, true]));
    });
    expect(refusal).not.toMatch(/character-ids/);
    // The same refusal wherever the two go astray: no --step, no --approve, or a stop that takes neither.
    [
      { approveType: 'outline', stepMode: false, note: 'Move the vote earlier.' },
      { stepMode: true, action: 'send-back' },
      { approveType: 'input-review', stepMode: true, note: 'x' }
    ].forEach((options) => expect(optionsRefusal(options)).toBe(refusal));
    expect(optionsRefusal({ approveType: 'outline', stepMode: true, action: 'send-back', note: 'Move the vote earlier.' })).toBeNull();
    expect(optionsRefusal({ approveType: 'outline', stepMode: true })).toBeNull();
    expect(optionsRefusal({})).toBeNull();
  });

  it('--leave-out with an --approve for any stop but character-ids is refused, saying so', () => {
    ['arc-selection', 'outline', 'article', 'input-review', 'photos'].forEach((stop) => {
      const refusal = optionsRefusal({ approveType: stop, stepMode: true, leaveOut: true });
      expect([stop, /--leave-out/.test(refusal), /character-ids/.test(refusal), refusal.includes(`--approve ${stop}`)]).toEqual([stop, true, true, true]);
    });
    expect(optionsRefusal({ approveType: 'character-ids', stepMode: true, leaveOut: true })).toBeNull();
    // With no --approve, the run ticks the boxes when it reaches the stop.
    expect(optionsRefusal({ leaveOut: true })).toBeNull();
  });
});

// Task 4.12d (the review of 4.12c, minor 4): with --approve-file the harness sends the file as it
// is, so --action, --note and --leave-out, which build the payload, were dropped without a word,
// for example `--approve outline --approve-file f.json --action send-back --note x --step`.
describe('4.12d: --approve-file sends its file as it is, so the options it would drop are refused (optionsRefusal)', () => {
  const { optionsRefusal } = require('../../../scripts/lib/stop-payloads');
  const FILE = 'my-map.json';

  it('refuses --action, --note and --leave-out with --approve-file, naming the ones given and where their content goes', () => {
    [
      [{ approveType: 'outline', stepMode: true, action: 'send-back', note: 'Move the vote earlier.' }, '--action and --note'],
      [{ approveType: 'arc-selection', stepMode: true, action: 'reweave' }, '--action'],
      [{ approveType: 'article', stepMode: true, note: 'Tighten the story.' }, '--note'],
      [{ approveType: 'character-ids', stepMode: true, leaveOut: true }, '--leave-out'],
      [{ approveType: 'outline', stepMode: true, action: 'approve', note: 'x', leaveOut: true }, '--action, --note and --leave-out']
    ].forEach(([options, given]) => {
      // Each of these runs is taken without the file: the refusal is the file's alone.
      expect([given, optionsRefusal({ ...options, leaveOut: options.leaveOut && options.approveType === 'character-ids' })]).toEqual([given, null]);
      const refusal = optionsRefusal({ ...options, approveFile: FILE });
      expect([given, refusal]).toEqual([given, expect.stringMatching(/^--approve-file sends its file as it is, so it takes no --action, --note, --angle or --leave-out/)]);
      expect([given, refusal.includes(`(got ${given})`)]).toEqual([given, true]);
      expect(refusal).toMatch(/the action, the note, the pick and the photos left out/);
    });
  });

  it('takes --approve-file with the options that do not build its payload, and alone', () => {
    expect(optionsRefusal({ approveType: 'outline', stepMode: true, approveFile: FILE })).toBeNull();
    expect(optionsRefusal({ approveType: 'character-ids', stepMode: true, approveFile: FILE })).toBeNull();
    expect(optionsRefusal({ approveType: 'character-ids', stepMode: true, approveFile: null, leaveOut: true })).toBeNull();
  });
});

// Task 4.12e (the ruling on 4.12d's minor 2 and concern 1): the harness reads --approve-file only
// with --approve in step mode (scripts/e2e-walkthrough.js), where it refuses the options the file
// replaces. Anywhere else the run never reads the file, and the refusal it gave there, that the
// file takes no --action, --note or --leave-out, did not hold: the file itself is what the run
// drops. So there it refuses the file, saying the run would never read it.
describe('4.12e: --approve-file is refused where the run never reads it, with that reason', () => {
  const { optionsRefusal } = require('../../../scripts/lib/stop-payloads');
  const FILE = 'my-map.json';
  const OWN_REASON = /^--approve-file goes with --approve <stop> and --step: step mode sends the file as the approval at that stop\. /;

  it('refuses the file without --approve, without --step, or without both, naming what the run lacks', () => {
    [
      [{ stepMode: true }, '--approve'],
      [{ approveType: 'outline' }, '--step'],
      [{ approveType: 'character-ids', stepMode: false }, '--step'],
      [{}, '--approve and no --step']
    ].forEach(([options, missing]) => {
      const refusal = optionsRefusal({ ...options, approveFile: FILE });
      expect([missing, refusal]).toEqual([missing, expect.stringMatching(OWN_REASON)]);
      expect([missing, refusal.endsWith(`This run has no ${missing}, so it would never read the file.`)]).toEqual([missing, true]);
      expect(refusal).not.toMatch(/sends its file as it is/);
    });
  });

  it('gives the file\'s own reason there even beside --action, --note or --leave-out, since the run would not read the file they compete with', () => {
    expect(optionsRefusal({ approveFile: FILE, action: 'send-back', note: 'x', leaveOut: true })).toMatch(OWN_REASON);
    expect(optionsRefusal({ approveType: 'outline', approveFile: FILE, note: 'x' })).toMatch(OWN_REASON);
  });

  it('with --approve and --step it reads the file, and refuses only the options the file replaces, as before', () => {
    expect(optionsRefusal({ approveType: 'outline', stepMode: true, approveFile: FILE })).toBeNull();
    expect(optionsRefusal({ approveType: 'outline', stepMode: true, approveFile: FILE, note: 'x' }))
      .toMatch(/^--approve-file sends its file as it is, so it takes no --action, --note, --angle or --leave-out \(got --note\)/);
  });
});

// Piece 3, brief 3E (spec 2026-10-06 sections 6 and 17): the meeting pitches two or three angles,
// and the harness picks one with --angle <n>, counted from 1 in the order the meeting shows
// them. The pick goes through the console's own operation (pickMeetingAngle) and payload
// builder (meetingPayload), so the harness sends what the console's pick would.
describe("3E: --angle picks the angle the story meeting sends on", () => {
  const { optionsRefusal } = require('../../../scripts/lib/stop-payloads');
  const state = () => ({ ...reworkFixtureState('journalist'), meetingApproved: null });

  it('sets the pick to the nth angle and sends the console\'s payload, which the gate takes and stores', async () => {
    const s = state();
    const data = await payloadAt('arc-selection', s);
    const second = data.weave.angles[1].id;
    const built = stopApproval('arc-selection', data, { action: 'approve', angle: 2 });
    expect(built.payload).toEqual(View.meetingPayload('approve', data, View.pickMeetingAngle(View.meetingDraftOf(data), second), ''));
    expect(built.payload.weave.picked).toBe(second);
    const { resume, stateUpdates, error } = gate(built.payload, s, 'arc-selection');
    expect(error).toBeNull();
    expect(resume).toEqual({ approved: true });
    expect(stateUpdates.weave.picked).toBe(second);
  });

  it('sends the pick with every action the meeting takes', async () => {
    const data = await payloadAt('arc-selection', state());
    const third = data.weave.angles[2].id;
    expect(stopApproval('arc-selection', data, { action: 'reweave', note: 'Lead with the heir.', angle: 3 }).payload.weave.picked).toBe(third);
    expect(stopApproval('arc-selection', data, { action: 'send-back', note: 'Rethink the heir.', angle: 3 }).payload.weave.picked).toBe(third);
  });

  it('without --angle the pick stays as the meeting showed it', async () => {
    const data = await payloadAt('arc-selection', state());
    expect(stopApproval('arc-selection', data, { action: 'approve' }).payload.weave).not.toHaveProperty('picked');
  });

  it('refuses an angle the meeting does not show, naming how many it shows', async () => {
    const data = await payloadAt('arc-selection', state());
    const count = data.weave.angles.length;
    const built = stopApproval('arc-selection', data, { action: 'approve', angle: count + 1 });
    expect(built.payload).toBeUndefined();
    expect(built.refusal).toBe(`The story meeting shows ${count} angles, so --angle takes 1 to ${count} (got ${count + 1}).`);
  });

  it('goes with --approve arc-selection and --step alone, and with a whole number from 1', () => {
    expect(optionsRefusal({ approveType: 'arc-selection', stepMode: true, angle: '2' })).toBeNull();
    const elsewhere = /^--angle picks the angle the story meeting sends on, so it goes with --approve arc-selection and --step\./;
    [
      { approveType: 'outline', stepMode: true, angle: '2' },
      { approveType: 'arc-selection', stepMode: false, angle: '2' },
      { stepMode: true, angle: '2' },
      { angle: '1' }
    ].forEach((options) => expect([options, optionsRefusal(options)]).toEqual([options, expect.stringMatching(elsewhere)]));
    ['0', '-1', '1.5', 'two', ''].forEach((angle) => {
      expect([angle, optionsRefusal({ approveType: 'arc-selection', stepMode: true, angle })])
        .toEqual([angle, `--angle takes an angle's number, counted from 1 in the order the story meeting shows them (got "${angle}").`]);
    });
  });

  it('goes without --approve-file, which carries the pick itself', () => {
    expect(optionsRefusal({ approveType: 'arc-selection', stepMode: true, angle: '2', approveFile: 'weave.json' }))
      .toMatch(/^--approve-file sends its file as it is, so it takes no --action, --note, --angle or --leave-out \(got --angle\)/);
  });

  // Review focus 5: a director's version whose picked angle lacks the verdict's thread, sent with
  // --approve-file past the console's lock. Step mode reads the file through
  // scripts/lib/stop-payloads.js loadApprovalFile, the harness's one loader (its source pin is in
  // e2e-stops-step-mode.test.js), and sends what it returns, to which photo descriptions are added
  // only at the character-IDs stop (withPhotoDescriptions). The gate refuses it, naming the thread.
  it("sends --approve-file's version as it is, and the gate refuses a picked angle without the verdict's thread, naming it", async () => {
    const { loadApprovalFile } = require('../../../scripts/lib/stop-payloads');
    const { withPhotoDescriptions } = require('../../../scripts/lib/photo-descriptions');
    const s = state();
    const data = await payloadAt('arc-selection', s);
    const weave = View.meetingDraftOf(data);
    const verdict = weave.threads.find((thread) => thread.verdict === true);
    const picked = weave.angles[1];
    expect(picked.threads).toContain(verdict.id);
    picked.threads = picked.threads.filter((id) => id !== verdict.id);
    weave.picked = picked.id;
    const file = path.join(dataDir, 'weave.json');
    fs.writeFileSync(file, JSON.stringify({ meeting: 'approve', weave }, null, 2));

    // What step mode's --approve-file branch sends at the meeting, a --photo-descriptions given too.
    const sent = withPhotoDescriptions('arc-selection', loadApprovalFile(file), { 'p2.jpg': 'Alex leans over the ledger.' });
    expect(sent).toEqual({ meeting: 'approve', weave });
    const { resume, error } = gate(sent, s, 'arc-selection');
    expect(resume).toEqual({});
    expect(error).toEqual(expect.stringContaining(verdict.name));
    expect(error).toMatch(/verdict/);
  });

  it('refuses an --approve-file that is not one JSON object, naming the option and the file', () => {
    const { loadApprovalFile } = require('../../../scripts/lib/stop-payloads');
    const missing = path.join(dataDir, 'none.json');
    expect(() => loadApprovalFile(missing)).toThrow(`--approve-file ${missing}:`);
    const broken = path.join(dataDir, 'broken.json');
    fs.writeFileSync(broken, '{"meeting": "approve",');
    expect(() => loadApprovalFile(broken)).toThrow(`--approve-file ${broken}:`);
    const list = path.join(dataDir, 'list.json');
    fs.writeFileSync(list, '[]');
    expect(() => loadApprovalFile(list)).toThrow(`--approve-file ${list}: expected one JSON object, the approval step mode sends.`);
  });
});
