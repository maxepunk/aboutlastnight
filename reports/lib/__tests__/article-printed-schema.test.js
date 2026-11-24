/**
 * Phase 18, run 2b (R23, replacing R13; brief H): one shape for the article writer.
 *
 * The schema the article writer is shown in <SCHEMA> and the schema the SDK is given for the
 * article call are one: the full ContentBundle schema less every field the generation
 * instruction's six items do not name (UNSHOWN_BUNDLE_FIELDS, one list; writerBundleSchemaOf, one
 * derivation). On a send-back that carries the director's edits, both carry the changed-edits
 * field. The previous article a rework reads is shown in the same shape (bundleAsShown), and code
 * carries each field the writer is not shown from the previous article into the reworked one
 * (carryUnshownFields), before the director's edits are put back and before validation. The
 * validator, the template, the desk and the stored bundle keep the full schema, so a bundle that
 * validated before validates now.
 *
 * The real writer and rework run on the rework fixture with the real PromptBuilder and a
 * recording stand-in for the model, so the prompts and the SDK's arguments are the ones sent.
 * Invented names and text: the repo is public.
 */

const Ajv = require('ajv');
const contentBundleSchema = require('../schemas/content-bundle.schema.json');
const {
  writerBundleSchemaOf, WRITER_BUNDLE_SCHEMA, UNSHOWN_BUNDLE_FIELDS, UNOFFERED_BLOCK_TYPES, bundleAsShown, carryUnshownFields
} = require('../prompt-builder');
const { SchemaValidator } = require('../schema-validator');
const { diffBundle, PRINTED_FIELDS, CHANGED_EDITS_KEY } = require('../hand-edit-diff');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { generateContentBundle, reviseContentBundle } = require('../workflow/nodes/ai-nodes');

const clone = (v) => JSON.parse(JSON.stringify(v));
const cfg = (sdk, configurable = {}) => ({ configurable: { sdkClient: sdk, theme: 'journalist', ...configurable } });

/** The fixture past the map's approve. */
const articleState = (overrides = {}) => ({ ...reworkFixtureState('journalist'), heroImage: 'hero.jpg', contentBundle: null, ...overrides });

/** The previous article with every field the writer is not shown, and the director's owner on a sidebar entry. */
function storedBundle() {
  const bundle = clone(PREVIOUS_BUNDLE);
  bundle.headline.main = 'The Sale Nobody Called a Sale';
  bundle.metadata.version = '1.0.0';
  bundle.metadata.storyDate = '2027-02-22';
  bundle.byline.location = 'NovaNews desk';
  bundle.byline.date = 'Monday';
  bundle.sections[0].content.push({ type: 'photo', filename: 'p2.jpg', caption: 'Alex at the ledger.', characters: ['Alex'] });
  bundle.heroImage = { filename: 'hero.jpg', caption: 'The bar.', characters: ['Alex', 'Morgan'] };
  bundle.evidenceCards[0].content = 'An envelope changes hands.';
  bundle.financialTracker = { entries: [{ description: 'Melanie', amount: '$75,000' }], totalExposed: '$75,000' };
  bundle.photos = [{ filename: 'p2.jpg', caption: 'Alex.' }];
  bundle.pullQuotes = [{ type: 'verbatim', text: 'I only kept the books.', attribution: 'Riley' }];
  bundle.voice_self_check = { overall_assessment: 'fine' };
  bundle._revisionHistory = [{ timestamp: '2026-01-01T00:00:00.000Z', revisionNumber: 1, duration: '1.0s' }];
  return bundle;
}

/** The writer's call, an automatic rework's and a send-back's with the director's desk edit, each as the SDK is given it. */
async function calls() {
  const state = articleState();
  const writer = jest.fn(async () => clone(PREVIOUS_BUNDLE));
  await generateContentBundle(state, cfg(writer));
  const rework = jest.fn(async () => clone(PREVIOUS_BUNDLE));
  await reviseContentBundle({ ...state, _previousContentBundle: storedBundle(), articleRevisionCount: 1 }, cfg(rework));
  const writers = storedBundle();
  const directors = clone(writers);
  directors.evidenceCards[0].owner = 'Riley Torres';
  const sendBack = jest.fn(async () => ({ ...bundleAsShown(directors), [CHANGED_EDITS_KEY]: [] }));
  await reviseContentBundle({
    ...state, _previousContentBundle: directors, _articleHandEdits: await diffBundle(writers, directors),
    _articleFeedback: 'Tighten the second section.', articleRevisionCount: 0, humanArticleRevisionCount: 1
  }, cfg(sendBack));
  return { writer: writer.mock.calls[0][0], rework: rework.mock.calls[0][0], sendBack: sendBack.mock.calls[0][0] };
}

/** The generation instruction of a prompt. */
const instructionOf = (prompt) => prompt.slice(prompt.indexOf('<GENERATION_INSTRUCTION>'), prompt.indexOf('</GENERATION_INSTRUCTION>'));

/** The JSON printed inside <SCHEMA>, parsed. */
function printedOf(prompt) {
  const block = prompt.slice(prompt.indexOf('\n<SCHEMA>\n'), prompt.indexOf('\n</SCHEMA>\n'));
  return JSON.parse(block.slice(block.indexOf('```json\n') + 8, block.lastIndexOf('\n```')));
}

/** The JSON of the previous article a rework prints. */
function previousOf(prompt) {
  const start = prompt.indexOf('PREVIOUS ARTICLE OUTPUT (the version this rework starts from):');
  const text = prompt.slice(start, prompt.indexOf('END PREVIOUS OUTPUT', start));
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

/** The content block of a section whose "type" is `type`. */
const blockOf = (schema, type) => schema.properties.sections.items.properties.content.items.oneOf
  .find((branch) => branch.properties.type.const === type);

/** Every "required" list in a schema, each with the properties it sits beside. */
function requiredLists(node, at = '$', out = []) {
  if (Array.isArray(node)) node.forEach((item, i) => requiredLists(item, `${at}[${i}]`, out));
  else if (node && typeof node === 'object') {
    if (Array.isArray(node.required)) out.push([at, node.required, Object.keys(node.properties || {})]);
    Object.entries(node).forEach(([key, value]) => requiredLists(value, `${at}.${key}`, out));
  }
  return out;
}

/** Each object of a schema a field the instruction names sits on, with the fields its six items name there. */
const NAMED = {
  'the bundle': [(s) => s, ['metadata', 'headline', 'byline', 'sections', 'evidenceCards', 'heroImage']],
  '1. a section': [(s) => s.properties.sections.items, ['id', 'type', 'heading', 'content']],
  'a paragraph': [(s) => blockOf(s, 'paragraph'), ['type', 'text']],
  'a quote': [(s) => blockOf(s, 'quote'), ['type', 'text', 'attribution']],
  'an evidence card': [(s) => blockOf(s, 'evidence-card'), ['type', 'tokenId', 'headline', 'content', 'owner', 'significance']],
  'a photo': [(s) => blockOf(s, 'photo'), ['type', 'filename', 'caption']],
  '2. a sidebar entry': [(s) => s.properties.evidenceCards.items, ['tokenId', 'headline', 'summary', 'significance']],
  '3. the hero image': [(s) => s.properties.heroImage, ['filename', 'caption']],
  '4. the headline': [(s) => s.properties.headline, ['main', 'deck']],
  '5. the byline': [(s) => s.properties.byline, ['author', 'title', 'guestReporter']],
  '6. the metadata': [(s) => s.properties.metadata, ['sessionId', 'theme', 'generatedAt']]
};

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe("R23: the writer's schema holds exactly the fields the instruction's six items name", () => {
  it('holds every field the six items name and no other, at every place they name one', () => {
    Object.entries(NAMED).forEach(([where, [objectOf, names]]) => {
      expect(`${where}: ${Object.keys(objectOf(WRITER_BUNDLE_SCHEMA).properties).sort()}`).toBe(`${where}: ${[...names].sort()}`);
    });
  });

  it('is the full schema with exactly the unshown fields removed, and nothing else', () => {
    const expected = clone(contentBundleSchema);
    const top = expected.properties;
    ['financialTracker', 'photos', 'pullQuotes', 'voice_self_check', '_revisionHistory'].forEach((name) => delete top[name]);
    delete top.headline.properties.kicker;
    ['version', 'storyDate'].forEach((name) => delete top.metadata.properties[name]);
    ['location', 'date'].forEach((name) => delete top.byline.properties[name]);
    ['owner', 'placement', 'content'].forEach((name) => delete top.evidenceCards.items.properties[name]);
    delete blockOf(expected, 'photo').properties.characters;
    delete top.heroImage.properties.characters;
    const blocks = top.sections.items.properties.content.items;
    blocks.oneOf = blocks.oneOf.filter((branch) => !['evidence-reference', 'list'].includes(branch.properties.type.const));
    expect(writerBundleSchemaOf(contentBundleSchema)).toEqual(expected);
    expect(WRITER_BUNDLE_SCHEMA).toEqual(expected);
    expect(UNSHOWN_BUNDLE_FIELDS).toHaveLength(15);
  });

  it('is valid JSON Schema the SDK takes: no required list names a property it lacks, and no format keyword', () => {
    const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
    expect(() => ajv.compile(clone(WRITER_BUNDLE_SCHEMA))).not.toThrow();
    expect(requiredLists(WRITER_BUNDLE_SCHEMA).flatMap(([at, required, properties]) =>
      required.filter((name) => !properties.includes(name)).map((name) => `${at}: ${name}`))).toEqual([]);
    expect(JSON.stringify(WRITER_BUNDLE_SCHEMA)).not.toContain('"format"');
  });

  it("each field the writer is not shown is one the page does not print, the money tracker and the line above the headline apart", () => {
    const printedAt = {
      bundle: ['headline', 'byline', 'heroImage', 'sections', 'evidenceCards', 'financialTracker'],
      headline: PRINTED_FIELDS.headline,
      metadata: [],
      byline: PRINTED_FIELDS.byline,
      sidebarEntry: PRINTED_FIELDS.sidebarCard,
      photoBlock: PRINTED_FIELDS.blocks.photo,
      heroImage: PRINTED_FIELDS.heroImage
    };
    const printed = UNSHOWN_BUNDLE_FIELDS
      .filter(([place, name]) => (printedAt[place] || ['?']).includes(name))
      .map(([place, name]) => `${place}: ${name}`);
    // The page prints the money tracker from the ledger, and the line above the headline from the theme (R38).
    expect(printed).toEqual(['bundle: financialTracker', 'headline: kicker']);
  });
});

describe('R23: the SDK is given the schema the writer is shown', () => {
  it('on the first write, the printed schema is the call\'s, and both are the writer\'s', async () => {
    const { writer } = await calls();
    expect(writer.jsonSchema).toBe(WRITER_BUNDLE_SCHEMA);
    expect(printedOf(writer.prompt)).toEqual(writer.jsonSchema);
  });

  it('on an automatic rework, the same', async () => {
    const { rework } = await calls();
    expect(rework.jsonSchema).toBe(WRITER_BUNDLE_SCHEMA);
    expect(printedOf(rework.prompt)).toEqual(rework.jsonSchema);
  });

  it('on a send-back with the director\'s standing edits, both carry the changed-edits field, required', async () => {
    const { sendBack } = await calls();
    expect(sendBack.jsonSchema.properties).toHaveProperty(CHANGED_EDITS_KEY);
    expect(sendBack.jsonSchema.required).toContain(CHANGED_EDITS_KEY);
    expect(printedOf(sendBack.prompt)).toEqual(sendBack.jsonSchema);
    const { [CHANGED_EDITS_KEY]: _list, ...rest } = sendBack.jsonSchema.properties;
    expect(rest).toEqual(WRITER_BUNDLE_SCHEMA.properties);
    expect(sendBack.prompt).toContain(`in ${CHANGED_EDITS_KEY}, with its id and one sentence on why.`);
  });

  it('a send-back with no standing edit prints and is given the writer\'s schema alone', async () => {
    const sdk = jest.fn(async () => clone(PREVIOUS_BUNDLE));
    await reviseContentBundle({
      ...articleState(), _previousContentBundle: storedBundle(), _articleFeedback: 'Tighten it.', articleRevisionCount: 0
    }, cfg(sdk));
    const [{ jsonSchema, prompt }] = sdk.mock.calls[0];
    expect(jsonSchema).toBe(WRITER_BUNDLE_SCHEMA);
    expect(printedOf(prompt)).toEqual(jsonSchema);
  });

  it('config.configurable.contentBundleSchema still overrides the first write\'s schema', async () => {
    const override = { $id: 'content-bundle', type: 'object' };
    const sdk = jest.fn(async () => clone(PREVIOUS_BUNDLE));
    await generateContentBundle(articleState(), cfg(sdk, { contentBundleSchema: override }));
    expect(sdk.mock.calls[0][0].jsonSchema).toBe(override);
  });

  it("on all three kinds of call, neither the instruction nor the printed schema names the line above the headline (R38)", async () => {
    const all = await calls();
    Object.entries(all).forEach(([name, { prompt, jsonSchema }]) => {
      expect(`${name}: ${/kicker/i.test(instructionOf(prompt))}`).toBe(`${name}: false`);
      expect(printedOf(prompt)).toEqual(jsonSchema);
      expect(jsonSchema.properties.headline.properties).not.toHaveProperty('kicker');
    });
    expect(all.writer.prompt).toContain('4. "headline": {"main": "...", "deck": "..."}: the headline and the deck as the task above gives them.\n');
  });

  it("closes the instruction's field list on its first sentence, and names none of the fields left out", async () => {
    const { writer } = await calls();
    const instruction = instructionOf(writer.prompt);
    expect(instruction).toContain('These are the fields the article prints, and the money tracker prints itself from the ledger.\n\n<SCHEMA>\n');
    ['financialTracker', 'pullQuotes', 'voice_self_check', '_revisionHistory', '"placement"', '"characters"', '"photos"', '"storyDate"', '"location"']
      .forEach((name) => expect(`${name}: ${instruction.includes(name)}`).toBe(`${name}: false`));
    ['Check against each voice influence', 'Reporting location', 'In-world article date', 'Revision iterations']
      .forEach((line) => expect(writer.prompt).not.toContain(line));
  });
});

describe('R23: the previous article a rework reads is in the writer\'s shape', () => {
  it('prints the previous article without the fields the writer is not shown', async () => {
    const { rework, sendBack } = await calls();
    expect(previousOf(rework.prompt)).toEqual(bundleAsShown(storedBundle()));
    expect(JSON.stringify(previousOf(rework.prompt)))
      .not.toMatch(/"(placement|characters|storyDate|version|location|date|financialTracker|photos|pullQuotes|voice_self_check|_revisionHistory)":/);
    // The evidence card in a section keeps its owner: item 1 names it.
    expect(previousOf(sendBack.prompt).sections[0].content[1].owner).toBe('Alex Reeves');
    expect(previousOf(sendBack.prompt).evidenceCards[0]).not.toHaveProperty('owner');
  });

  it("still lists the director's edit to a field the writer is not shown in <HAND_EDITS>", async () => {
    const { sendBack } = await calls();
    const handEdits = sendBack.prompt.slice(sendBack.prompt.indexOf('<HAND_EDITS>'), sendBack.prompt.indexOf('</HAND_EDITS>'));
    expect(handEdits).toContain('Riley Torres');
  });

  it('bundleAsShown leaves the bundle it is given untouched, and is the bundle less each unshown field', () => {
    const bundle = storedBundle();
    const shown = bundleAsShown(bundle);
    expect(bundle).toEqual(storedBundle());
    expect(new SchemaValidator().validate('content-bundle', shown).valid).toBe(true);
    expect(shown.evidenceCards[0]).toEqual({ tokenId: 'mor001', headline: 'The envelope', summary: 'Morgan pays Riley', significance: 'supporting' });
    expect(shown.heroImage).toEqual({ filename: 'hero.jpg', caption: 'The bar.' });
    expect(shown.headline).toEqual({ main: 'The Sale Nobody Called a Sale', deck: PREVIOUS_BUNDLE.headline.deck });
    expect(shown.metadata).toEqual(PREVIOUS_BUNDLE.metadata);
    expect(shown.byline).toEqual(PREVIOUS_BUNDLE.byline);
    expect(Object.keys(shown).sort()).toEqual(['byline', 'evidenceCards', 'headline', 'heroImage', 'metadata', 'sections']);
  });
});

describe('R23: carryUnshownFields, the fields the writer is not shown, from the previous article into the reworked one', () => {
  it('copies each field the reworked article lacks, by the place it sits', () => {
    const previous = storedBundle();
    const carried = carryUnshownFields(previous, bundleAsShown(previous));
    expect(carried).toEqual(previous);
  });

  it('matches a sidebar entry by its document id, a photo block and the top photo by filename, wherever the rework moved them', () => {
    const previous = storedBundle();
    const reworked = bundleAsShown(previous);
    reworked.evidenceCards.reverse();
    const photo = reworked.sections[0].content.pop();
    reworked.sections.push({ id: 'closing', type: 'conclusion', content: [{ ...photo, filename: 'P2.JPG' }] });
    const carried = carryUnshownFields(previous, reworked);
    expect(carried.evidenceCards.map((entry) => [entry.tokenId, entry.owner, entry.placement])).toEqual([
      ['p-rescued', 'Unknown', 'sidebar'], ['mor001', 'Morgan Reed', 'sidebar']
    ]);
    expect(carried.evidenceCards[1].content).toBe('An envelope changes hands.');
    expect(carried.sections[1].content[0].characters).toEqual(['Alex']);
    expect(carried.heroImage.characters).toEqual(['Alex', 'Morgan']);
  });

  it('copies a field only where the reworked article lacks it, and to no entry the previous one did not hold', () => {
    const previous = storedBundle();
    const reworked = bundleAsShown(previous);
    reworked.evidenceCards[0].owner = 'Sarah Blackwood';
    reworked.evidenceCards.push({ tokenId: 'ale003', headline: 'The brag', summary: 'Marcus brags' });
    reworked.heroImage = { filename: 'p2.jpg', caption: 'Another photo.' };
    const carried = carryUnshownFields(previous, reworked);
    expect(carried.evidenceCards[0].owner).toBe('Sarah Blackwood');
    expect(carried.evidenceCards[2]).toEqual({ tokenId: 'ale003', headline: 'The brag', summary: 'Marcus brags' });
    expect(carried.heroImage).toEqual({ filename: 'p2.jpg', caption: 'Another photo.' });
  });

  it('pairs entries that repeat one document id in their order', () => {
    const previous = storedBundle();
    previous.evidenceCards = [
      { tokenId: 'mor001', headline: 'First', owner: 'Morgan Reed' },
      { tokenId: 'mor001', headline: 'Second', owner: 'Riley Torres' }
    ];
    const carried = carryUnshownFields(previous, bundleAsShown(previous));
    expect(carried.evidenceCards.map((entry) => entry.owner)).toEqual(['Morgan Reed', 'Riley Torres']);
  });

  it('leaves both articles it is given untouched, and passes a reworked article that is no object through', () => {
    const previous = storedBundle();
    const reworked = bundleAsShown(previous);
    const before = clone(reworked);
    carryUnshownFields(previous, reworked);
    expect(previous).toEqual(storedBundle());
    expect(reworked).toEqual(before);
    expect(carryUnshownFields(previous, null)).toBe(null);
    expect(carryUnshownFields(null, reworked)).toEqual(reworked);
  });
});

describe("R23: the carry runs in the article's rework, before the director's edits are put back", () => {
  /** The writer's article, and the director's at the desk with an owner they wrote on a sidebar entry. */
  async function deskState() {
    const writers = storedBundle();
    const directors = clone(writers);
    directors.evidenceCards[0].owner = 'Riley Torres';
    return { ...articleState(), _previousContentBundle: directors, _articleHandEdits: await diffBundle(writers, directors), directors };
  }

  /** The reworked article as the writer can return it: the writer's shape, a paragraph changed. */
  const reworkedFrom = (bundle) => {
    const out = bundleAsShown(bundle);
    out.sections[0].content[0].text = 'Marcus bragged at the bar.';
    return out;
  };

  it("an automatic pass keeps the director's owner, and every other field the writer was not shown", async () => {
    const { directors, ...state } = await deskState();
    const sdk = jest.fn(async () => reworkedFrom(directors));
    const out = await reviseContentBundle({ ...state, articleRevisionCount: 1 }, cfg(sdk));
    expect(out.contentBundle.evidenceCards[0].owner).toBe('Riley Torres');
    expect(out.contentBundle.sections[0].content[0].text).toBe('Marcus bragged at the bar.');
    expect(out.contentBundle.metadata.storyDate).toBe('2027-02-22');
    expect(out.contentBundle.byline.location).toBe('NovaNews desk');
    expect(out.contentBundle.heroImage.characters).toEqual(['Alex', 'Morgan']);
    expect(out.contentBundle.financialTracker).toEqual(directors.financialTracker);
    expect(out.contentBundle._revisionHistory).toHaveLength(2);
    // Nothing of the director's had to be put back: the carry kept it.
    expect(JSON.stringify(out._articleHandEditReport || {})).not.toContain('restored');
    expect(new SchemaValidator().validate('content-bundle', out.contentBundle).valid).toBe(true);
  });

  it("a send-back keeps the director's owner, though code puts back nothing on a send-back", async () => {
    const { directors, ...state } = await deskState();
    const sdk = jest.fn(async () => ({ ...reworkedFrom(directors), [CHANGED_EDITS_KEY]: [] }));
    const out = await reviseContentBundle({
      ...state, _articleFeedback: 'Tighten the second section.', articleRevisionCount: 0, humanArticleRevisionCount: 1
    }, cfg(sdk));
    expect(out.contentBundle.sections[0].content[0].text).toBe('Marcus bragged at the bar.');
    expect(out.contentBundle.evidenceCards[0].owner).toBe('Riley Torres');
    expect(out.contentBundle).not.toHaveProperty(CHANGED_EDITS_KEY);
    expect(new SchemaValidator().validate('content-bundle', out.contentBundle).valid).toBe(true);
  });
});

describe('R23: the validator and the template keep the full schema', () => {
  it('a stored bundle with every field the writer is not shown still validates', () => {
    expect(new SchemaValidator().validate('content-bundle', storedBundle()).valid).toBe(true);
  });

  it('a stored article with a line above the headline of its own validates and prints it (R38)', async () => {
    const { TemplateAssembler } = require('../template-assembler');
    const bundle = storedBundle();
    bundle.headline.kicker = 'Inside the Ledger';
    expect(new SchemaValidator().validate('content-bundle', bundle).valid).toBe(true);
    const html = await new TemplateAssembler('journalist').assemble(bundle);
    expect(html).toContain('<div class="nn-article__kicker">Inside the Ledger</div>');
  });
});

// Phase 18, run 2c (R34; the wording doc's part 6): two kinds of block are no longer offered, the
// caption that names a document and prints none of its text, and the list. Their lines leave the
// generation instruction, and their shapes leave the writer's schema through the one derivation.
describe('R34: the article writer is offered only the blocks an article uses', () => {
  const typesOf = (schema) => schema.properties.sections.items.properties.content.items.oneOf.map((branch) => branch.properties.type.const);

  it("the writer's schema offers a paragraph, a quote, a photo and an evidence card, and the full schema keeps the other two", () => {
    expect(UNOFFERED_BLOCK_TYPES).toEqual(['evidence-reference', 'list']);
    expect(typesOf(WRITER_BUNDLE_SCHEMA).sort()).toEqual(['evidence-card', 'paragraph', 'photo', 'quote']);
    expect(typesOf(contentBundleSchema).sort()).toEqual(['evidence-card', 'evidence-reference', 'list', 'paragraph', 'photo', 'quote']);
  });

  it('the generation instruction offers neither, on the first write, an automatic rework and a send-back, and each prints the schema it is given', async () => {
    const all = await calls();
    Object.entries(all).forEach(([name, { prompt, jsonSchema }]) => {
      // The instruction's own lines, above the schema it prints.
      const instruction = instructionOf(prompt).split('<SCHEMA>')[0];
      ['"evidence-reference"', '"list"', '"items"', '"ordered"', 'a one-line caption naming a document']
        .forEach((gone) => expect(`${name} ${gone}: ${instruction.includes(gone)}`).toBe(`${name} ${gone}: false`));
      expect(typesOf(jsonSchema).sort()).toEqual(['evidence-card', 'paragraph', 'photo', 'quote']);
      expect(printedOf(prompt)).toEqual(jsonSchema);
    });
  });

  it('the instruction lists the four blocks it offers, in order', async () => {
    const { writer } = await calls();
    const opening = '     * {"type": "';
    const blocks = instructionOf(writer.prompt).split('\n').filter((line) => line.startsWith(opening));
    expect(blocks.map((line) => line.slice(opening.length, line.indexOf('"', opening.length))))
      .toEqual(['paragraph', 'quote', 'evidence-card', 'photo']);
  });

  it('a stored article that holds a list and a caption naming a document still validates', () => {
    const bundle = storedBundle();
    bundle.sections[0].content.push(
      { type: 'evidence-reference', tokenId: 'mor001', caption: 'The envelope Morgan handed over.' },
      { type: 'list', items: ['The vote', 'The sale'], ordered: false }
    );
    expect(new SchemaValidator().validate('content-bundle', bundle).valid).toBe(true);
  });

  it('fails loud, naming it, when a block type it leaves out is gone from the full schema', () => {
    const schema = clone(contentBundleSchema);
    const blocks = schema.properties.sections.items.properties.content.items;
    blocks.oneOf = blocks.oneOf.filter((branch) => branch.properties.type.const !== 'list');
    expect(() => writerBundleSchemaOf(schema)).toThrow(/"list"/);
  });
});

describe('writerBundleSchemaOf: one pure function from the full schema', () => {
  it('leaves the schema it is given untouched', () => {
    const before = clone(contentBundleSchema);
    writerBundleSchemaOf(contentBundleSchema);
    expect(contentBundleSchema).toEqual(before);
  });

  it('fails loud when a property it removes is gone from the full schema, naming it', () => {
    const schema = clone(contentBundleSchema);
    delete schema.properties.voice_self_check;
    expect(() => writerBundleSchemaOf(schema)).toThrow(/voice_self_check/);
    const noPhotoCharacters = clone(contentBundleSchema);
    delete blockOf(noPhotoCharacters, 'photo').properties.characters;
    expect(() => writerBundleSchemaOf(noPhotoCharacters)).toThrow(/characters/);
  });

  it('fails loud when a property it removes is required, naming it', () => {
    const schema = clone(contentBundleSchema);
    schema.properties.evidenceCards.items.required.push('owner');
    expect(() => writerBundleSchemaOf(schema)).toThrow(/owner/);
  });
});
