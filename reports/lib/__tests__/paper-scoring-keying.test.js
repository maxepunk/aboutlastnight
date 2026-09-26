/**
 * Curation's paper scoring keys every scored item to its input, never to the id the
 * model echoed (phase 2 final fix wave, residual item 8).
 *
 * This is the call that lost 092026's rescued email. In the gate run, Sonnet's "Paper
 * evidence batch 6/6" was sent the email as `18c2f33d-583f-809b-a3d8-cb7843f0b423`,
 * with its text, and answered `18c2f33d-809b-a3d8-cb7843f0b423`. scorePaperEvidence
 * merged the reply back with `paperItems.find(p => p.id === scored.id)` and then
 * `...scored`, so a failed match kept the model's id and dropped `rawData` and
 * `fullContent`, and every <RECORD> printed "(The record holds no text for this
 * document.)". The exclusion cache for the rescue was keyed on the name the model
 * echoed, which had the same weakness.
 *
 * The replies are now placed on the batch's inputs by the preprocessor's rule
 * (pairRepliesWithBatch: by id, else by position, else by elimination), and only the
 * scoring fields are taken from a reply.
 */

const fixture = require('./fixtures/paper-scoring-092026-batch6.json');
const { _testing: { scorePaperEvidence }, curateEvidenceBundle } = require('../workflow/nodes/ai-nodes');

const EMAIL_ID = '18c2f33d-583f-809b-a3d8-cb7843f0b423';
const MANGLED = '18c2f33d-809b-a3d8-cb7843f0b423';
const clone = (v) => JSON.parse(JSON.stringify(v));

/** A preprocessed paper item, as the preprocessor hands it to curation. */
function preprocessed(item) {
  const rawData = { notionId: item.id, name: item.name, description: item.description, owners: item.owners, narrativeThreads: item.narrativeThreads, basicType: 'Document' };
  return { id: item.id, sourceType: 'paper-evidence', disposition: 'exposed', summary: `${item.name} summary`, rawData, fullContent: item.description };
}

const CONTEXT = { roster: ['Sarah', 'Remi', 'Vic'], suspects: [], exposedTokenSummaries: [], playerFocus: {} };
const replying = (reply) => jest.fn(async () => clone(reply));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('the 092026 batch 6/6 replay', () => {
  it('the logged reply really does echo the email with "583f-" dropped', () => {
    expect(fixture.input.map((i) => i.id)).toContain(EMAIL_ID);
    expect(fixture.reply.items.map((i) => i.id)).toEqual([fixture.input[0].id, MANGLED]);
  });

  it('the email keeps its full id, its text and its rawData, and takes the reply\'s score', async () => {
    const inputs = fixture.input.map(preprocessed);
    const scored = await scorePaperEvidence(inputs, CONTEXT, replying(fixture.reply));

    expect(scored.map((s) => s.id)).toEqual([fixture.input[0].id, EMAIL_ID]);
    const email = scored[1];
    expect(email.id).toBe(EMAIL_ID);
    expect(email.rawData).toEqual(inputs[1].rawData);
    expect(email.rawData.description).toBe(fixture.input[1].description);
    expect(email.fullContent).toBe(fixture.input[1].description);
    expect(email.name).toBe('Remi <> Vic Funding Email (unlocked)');
    expect(email).toMatchObject({ score: 2, include: true, criteriaMatched: ['rosterConnection', 'substantiveContent'] });
    expect(scored.map((s) => s.id)).not.toContain(MANGLED);
  });

  it('curation puts the email into the bundle with its id and text', async () => {
    const result = await curateEvidenceBundle(
      { preprocessedEvidence: { items: fixture.input.map(preprocessed) }, sessionConfig: { roster: ['Sarah', 'Remi', 'Vic'] }, sessionId: '092026' },
      { configurable: { sdkClient: replying(fixture.reply) } }
    );
    const email = result.evidenceBundle.exposed.paperEvidence.find((p) => p.name === 'Remi <> Vic Funding Email (unlocked)');
    expect(email.id).toBe(EMAIL_ID);
    expect(email.fullContent).toBe(fixture.input[1].description);
    expect(email.description).toBe(fixture.input[1].description);
  });
});

describe('only the scoring fields come from a reply', () => {
  it('a reply cannot replace the input\'s id, name, record or text', async () => {
    const [card] = fixture.input.map(preprocessed);
    const reply = { items: [{
      id: card.id, name: 'A NAME THE MODEL MADE UP', score: 3, include: true, relevanceNote: 'n',
      rawData: { description: 'MODEL TEXT' }, fullContent: 'MODEL TEXT', narrativeThreads: ['MODEL THREAD']
    }] };
    const [scored] = await scorePaperEvidence([card], CONTEXT, replying(reply));
    expect(scored).toMatchObject({ id: card.id, name: "Sarah's Card (unlocked)", score: 3, include: true, relevanceNote: 'n' });
    expect(scored.rawData).toEqual(card.rawData);
    expect(scored.fullContent).toBe(card.fullContent);
    expect(scored.narrativeThreads).toEqual(['Marriage Troubles']);
  });
});

describe('an input with no placed reply', () => {
  it('is kept, not included, and marked not scored and rescuable ("never evaluated" at the evidence stop)', async () => {
    const inputs = fixture.input.map(preprocessed);
    // The model answered for the card only, and then for an id in no input.
    const reply = { items: [clone(fixture.reply.items[0]), { id: 'no-such-item', name: 'x', score: 7, include: true }, { id: 'another-stray', name: 'y', score: 7, include: true }] };
    const scored = await scorePaperEvidence(inputs, CONTEXT, replying(reply));

    expect(scored.map((s) => s.id)).toEqual([fixture.input[0].id, EMAIL_ID]);
    expect(scored[1]).toMatchObject({
      id: EMAIL_ID, include: false, notScored: true, score: null, rescuable: true, excludeReason: 'scoringError'
    });
    expect(scored[1].rawData).toEqual(inputs[1].rawData);
    expect(scored[1].fullContent).toBe(fixture.input[1].description);
  });
});

describe('the rescue cache is keyed on the input, not on the name the model echoed', () => {
  it('an excluded item is cached, and reported, under its own name with its own record', async () => {
    const inputs = fixture.input.map(preprocessed);
    const reply = { items: [
      clone(fixture.reply.items[0]),
      { id: MANGLED, name: 'Remi / Vic funding email', score: 1, include: false, excludeReason: 'tangentialThread', rescuable: true }
    ] };
    const result = await curateEvidenceBundle(
      { preprocessedEvidence: { items: inputs }, sessionConfig: { roster: ['Sarah'] }, sessionId: '092026' },
      { configurable: { sdkClient: replying(reply) } }
    );
    const name = 'Remi <> Vic Funding Email (unlocked)';
    expect(Object.keys(result._excludedItemsCache)).toEqual([name]);
    expect(result._excludedItemsCache[name]).toEqual(inputs[1].rawData);
    expect(result.evidenceBundle.curationReport.excluded.map((e) => e.name)).toEqual([name]);
  });
});
