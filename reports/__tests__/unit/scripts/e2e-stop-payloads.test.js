process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * 4.12a: the harness's payloads at the story meeting, the map, the desk and the character-IDs
 * stop are the console's own (phase 4, brief 4.12a; the integrator's rulings 1 and 2).
 *
 * scripts/lib/stop-payloads.js builds each through the console's builders
 * (console/checkpoint-view-logic.js): the meeting's through meetingPayload, the map's through
 * mapPayload(action, mapDraftOf(data), note), the desk's through articleReviewPayload with
 * articleEdits, and the character-IDs stop's through characterIdsPayload and
 * characterIdsSkipPayload, which send the photos to leave out only when the run names them.
 * Each payload here goes through the server's own gate (server.js buildResumePayload) on a
 * state in the new shape, and is taken. The old payloads the harness used to send are refused
 * by name. Invented text throughout.
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
    const reweave = stopApproval('arc-selection', data, { action: 'reweave', note: 'Make the ledger the main thread.' });
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

describe('4.12a: the character-IDs payload is the console\'s, with the photos to leave out only when the run names them (ruling 1)', () => {
  const state = () => ({ ...reworkFixtureState('journalist'), characterIdMappings: null });

  it('skips with no list when the run names no photo, which leaves the list as it is', async () => {
    const s = state();
    const built = stopApproval('character-ids', await payloadAt('character-ids', s), {});
    expect(built.payload).toEqual({ characterIds: {} });
    const { stateUpdates, error } = gate(built.payload, s, 'character-ids');
    expect(error).toBeNull();
    expect(stateUpdates).not.toHaveProperty('leftOutPhotos');
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

  it('approves through characterIdsPayload when the run gives the director\'s descriptions, with the list only when named', async () => {
    const s = state();
    const data = await payloadAt('character-ids', s);
    const descriptions = { 'p2.jpg': 'Alex leans over the ledger and points at a line.' };
    const cards = View.characterIdCards(data.photoAnalyses.analyses, data.sessionPhotos, data.leftOutPhotos);

    const described = stopApproval('character-ids', data, { photoDescriptions: descriptions });
    const { leftOutPhotos: _none, ...withoutList } = View.characterIdsPayload(cards, descriptions, {});
    expect(described.payload).toEqual(withoutList);
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
