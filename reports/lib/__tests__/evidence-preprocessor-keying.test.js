/**
 * Every preprocessed item is keyed to its input item, never to the id the model
 * echoed (phase 2 final fix wave, item 8).
 *
 * On 092026 a rescued paper document (Notion id 18c2f33d-583f-809b-a3d8-cb7843f0b423,
 * "Remi <> Vic Funding Email") reached every <RECORD> as id="18c2f33d-809b-a3d8-
 * cb7843f0b423" with "(The record holds no text for this document.)". Haiku dropped
 * "583f-" from the id, `batch.find(b => b.id === item.id)` failed, and the merge
 * kept Haiku's bare item, which has no rawData. The same fallback would drop a
 * memory's authoritative disposition.
 *
 * Now: match by the input's id; if the model's id is not in the batch, recover by an
 * unambiguous rule (the model kept the batch's order, or one input and one reply are
 * left), or reject the reply. Either way the input's id, rawData and disposition
 * survive, and an input the model returned nothing for still comes out.
 */

const { createEvidencePreprocessor } = require('../evidence-preprocessor');

const REAL_ID = '18c2f33d-583f-809b-a3d8-cb7843f0b423';
const MANGLED_ID = '18c2f33d-809b-a3d8-cb7843f0b423';
const EMAIL = 'From: Remi Whitman\nTo: Vic Kingsley\nSubject: Funding\nVic, the bridge round closes Friday.';

const paper = (notionId, name, description) => ({ notionId, name, description, owners: ['Remi Whitman'], basicType: 'Document' });
const memory = (tokenId, text) => ({ tokenId, name: tokenId.toUpperCase(), disposition: 'exposed', fullDescription: text, owners: ['Alex Reeves'] });

/** A model stand-in that answers each batch with `reply(batchItems)`. */
function modelReplying(reply) {
  return jest.fn(async ({ prompt }) => ({ items: reply(JSON.parse(prompt.slice(prompt.indexOf('['))) ) }));
}

const summaryOf = (id, sourceType = 'paper-evidence', summary = `summary of ${id}`) => ({ id, sourceType, summary, tags: ['t'] });

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

async function run(input, reply) {
  const sdkClient = modelReplying(reply);
  const result = await createEvidencePreprocessor({ sdkClient }).process({ memoryTokens: [], paperEvidence: [], sessionId: 't', ...input });
  return result.items;
}

describe('a reply with a mangled id', () => {
  it('keeps the input\'s id, text and disposition (the 092026 funding email)', async () => {
    const items = await run(
      { paperEvidence: [paper(REAL_ID, 'Remi <> Vic Funding Email', EMAIL)] },
      () => [summaryOf(MANGLED_ID, 'paper-evidence', 'Remi pushes Vic on the bridge round')]
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.id).toBe(REAL_ID);
    expect(item.disposition).toBe('exposed');
    expect(item.rawData.description).toBe(EMAIL);
    expect(item.fullContent).toBe(EMAIL);
    // Recovered by elimination (one input, one reply): the model's summary is kept.
    expect(item.summary).toBe('Remi pushes Vic on the bridge round');
    expect(items.map((i) => i.id)).not.toContain(MANGLED_ID);
  });

  it('keeps an exposed memory\'s disposition, whatever the model says', async () => {
    const items = await run(
      { memoryTokens: [memory('ale003', 'Alex text.'), memory('mor001', 'Morgan text.')] },
      () => [
        { ...summaryOf('ale003', 'memory-token'), disposition: 'buried' },
        { ...summaryOf('MOR-001', 'memory-token'), disposition: 'buried' }
      ]
    );
    expect(items.map((i) => [i.id, i.disposition, i.fullContent])).toEqual([
      ['ale003', 'exposed', 'Alex text.'],
      ['mor001', 'exposed', 'Morgan text.']
    ]);
  });

  it('recovers by position when the model kept the batch\'s order', async () => {
    const inputs = [paper('p-1', 'One', 'Text one.'), paper('p-2', 'Two', 'Text two.'), paper('p-3', 'Three', 'Text three.')];
    const items = await run({ paperEvidence: inputs }, () => [
      summaryOf('p-1', 'paper-evidence', 'first'),
      summaryOf('p-X', 'paper-evidence', 'second'),
      summaryOf('p-Y', 'paper-evidence', 'third')
    ]);
    expect(items.map((i) => [i.id, i.summary, i.rawData.description])).toEqual([
      ['p-1', 'first', 'Text one.'],
      ['p-2', 'second', 'Text two.'],
      ['p-3', 'third', 'Text three.']
    ]);
  });

  it('rejects a reply it cannot place, and the input still comes out with its record', async () => {
    // The model reordered and mangled two ids: neither position nor elimination
    // is unambiguous, so both replies are rejected.
    const inputs = [paper('p-1', 'One', 'Text one.'), paper('p-2', 'Two', 'Text two.'), paper('p-3', 'Three', 'Text three.')];
    const items = await run({ paperEvidence: inputs }, () => [
      summaryOf('p-X', 'paper-evidence', 'a guess'),
      summaryOf('p-1', 'paper-evidence', 'first'),
      summaryOf('p-Y', 'paper-evidence', 'another guess')
    ]);
    expect(items.map((i) => i.id)).toEqual(['p-1', 'p-2', 'p-3']);
    const [one, two, three] = items;
    expect(one.summary).toBe('first');
    for (const item of [two, three]) {
      expect(item.summary).not.toMatch(/guess/);
      expect(item.disposition).toBe('exposed');
      expect(item.rawData.description).toBe(item.id === 'p-2' ? 'Text two.' : 'Text three.');
    }
  });

  it('never pairs a reply with an input of another source type', async () => {
    const items = await run(
      { memoryTokens: [memory('ale003', 'Alex text.')], paperEvidence: [paper('p-1', 'One', 'Text one.')] },
      () => [summaryOf('ale003', 'memory-token', 'alex'), summaryOf('ale-003', 'memory-token', 'a memory reply')]
    );
    const p1 = items.find((i) => i.id === 'p-1');
    expect(p1.sourceType).toBe('paper-evidence');
    expect(p1.summary).not.toBe('a memory reply');
    expect(p1.rawData.description).toBe('Text one.');
  });
});

describe('a reply that leaves an input out', () => {
  it('the input still comes out, with its record', async () => {
    const items = await run(
      { paperEvidence: [paper('p-1', 'One', 'Text one.'), paper('p-2', 'Two', 'Text two.')] },
      () => [summaryOf('p-1', 'paper-evidence', 'first')]
    );
    expect(items.map((i) => i.id)).toEqual(['p-1', 'p-2']);
    expect(items[1].rawData.description).toBe('Text two.');
    expect(items[1].disposition).toBe('exposed');
  });

  it('a duplicate reply for one input does not stand in for another', async () => {
    const items = await run(
      { paperEvidence: [paper('p-1', 'One', 'Text one.'), paper('p-2', 'Two', 'Text two.'), paper('p-3', 'Three', 'Text three.')] },
      () => [summaryOf('p-1', 'paper-evidence', 'first'), summaryOf('p-1', 'paper-evidence', 'first again'), summaryOf('p-2', 'paper-evidence', 'second')]
    );
    expect(items.map((i) => [i.id, i.summary === 'first again'])).toEqual([['p-1', false], ['p-2', false], ['p-3', false]]);
  });
});
