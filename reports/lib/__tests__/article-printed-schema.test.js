/**
 * Phase 18 (R13; the read's part 5b; brief D): the schema the article writer is shown holds only
 * what it writes.
 *
 * The JSON printed inside <SCHEMA> in the generation instruction omits the properties the
 * instruction used to tell the writer to leave out: the top-level `financialTracker`, `photos`,
 * `pullQuotes` and `voice_self_check`; a sidebar entry's `owner`, `placement` and `content`; and
 * the `characters` of a photo block and of the hero image. It is derived from the full schema by
 * one pure function (printedBundleSchemaOf), so the two cannot drift. The schema the SDK is given,
 * the validator and the template read the full schema, unchanged, so a bundle that validated
 * before validates now, the fields the writer is no longer shown among it.
 *
 * The real writer and rework run on the rework fixture with the real PromptBuilder and a
 * recording stand-in for the model, so the prompts and the SDK's arguments are the ones sent.
 */

const Ajv = require('ajv');
const contentBundleSchema = require('../schemas/content-bundle.schema.json');
const { printedBundleSchemaOf } = require('../prompt-builder');
const { SchemaValidator } = require('../schema-validator');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { generateContentBundle, reviseContentBundle } = require('../workflow/nodes/ai-nodes');

const clone = (v) => JSON.parse(JSON.stringify(v));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });

/** The writer's and an automatic rework's calls, each with the SDK's arguments. */
async function calls() {
  const state = { ...reworkFixtureState('journalist'), heroImage: 'hero.jpg', contentBundle: null };
  const writer = jest.fn(async () => clone(PREVIOUS_BUNDLE));
  await generateContentBundle(state, cfg(writer));
  const rework = jest.fn(async () => clone(PREVIOUS_BUNDLE));
  await reviseContentBundle({ ...state, _previousContentBundle: clone(PREVIOUS_BUNDLE), articleRevisionCount: 1 }, cfg(rework));
  return { writer: writer.mock.calls[0][0], rework: rework.mock.calls[0][0] };
}

/** The generation instruction of a prompt. */
const instructionOf = (prompt) => prompt.slice(prompt.indexOf('<GENERATION_INSTRUCTION>'), prompt.indexOf('</GENERATION_INSTRUCTION>'));

/** The JSON printed inside <SCHEMA>, parsed. */
function printedOf(prompt) {
  const block = prompt.slice(prompt.indexOf('\n<SCHEMA>\n'), prompt.indexOf('\n</SCHEMA>\n'));
  return JSON.parse(block.slice(block.indexOf('```json\n') + 8, block.lastIndexOf('\n```')));
}

/** The content block of a section whose "type" is `type`. */
const blockOf = (schema, type) => schema.properties.sections.items.properties.content.items.oneOf
  .find((branch) => branch.properties.type.const === type);

/** R13's properties, each as [where, the object holding it, its name], read from a schema. */
const R13 = (schema) => [
  ['top level', schema.properties, 'financialTracker'],
  ['top level', schema.properties, 'photos'],
  ['top level', schema.properties, 'pullQuotes'],
  ['top level', schema.properties, 'voice_self_check'],
  ['a sidebar entry', schema.properties.evidenceCards.items.properties, 'owner'],
  ['a sidebar entry', schema.properties.evidenceCards.items.properties, 'placement'],
  ['a sidebar entry', schema.properties.evidenceCards.items.properties, 'content'],
  ['a photo block', blockOf(schema, 'photo').properties, 'characters'],
  ['the hero image', schema.properties.heroImage.properties, 'characters']
];

/** Every "required" list in a schema, each with the properties it sits beside. */
function requiredLists(node, at = '$', out = []) {
  if (Array.isArray(node)) node.forEach((item, i) => requiredLists(item, `${at}[${i}]`, out));
  else if (node && typeof node === 'object') {
    if (Array.isArray(node.required)) out.push([at, node.required, Object.keys(node.properties || {})]);
    Object.entries(node).forEach(([key, value]) => requiredLists(value, `${at}.${key}`, out));
  }
  return out;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('R13: the schema printed in <SCHEMA> holds only what the article writer writes', () => {
  it('holds none of the properties the writer leaves out, on the writer and on its rework', async () => {
    const { writer, rework } = await calls();
    [writer, rework].forEach(({ prompt }) => {
      const printed = printedOf(prompt);
      expect(R13(printed).filter(([, holder, name]) => name in holder).map(([where, , name]) => `${where}: ${name}`)).toEqual([]);
    });
    expect(printedOf(rework.prompt)).toEqual(printedOf(writer.prompt));
  });

  it('is the full schema with exactly those properties removed, and nothing else', async () => {
    const expected = clone(contentBundleSchema);
    R13(expected).forEach(([, holder, name]) => { delete holder[name]; });
    expect(printedOf((await calls()).writer.prompt)).toEqual(expected);
    expect(printedBundleSchemaOf(contentBundleSchema)).toEqual(expected);
  });

  it('still holds every field items 1 to 6 of the instruction name', async () => {
    const printed = printedOf((await calls()).writer.prompt);
    const section = printed.properties.sections.items.properties;
    const fields = {
      '1. sections': Object.keys(section),
      'paragraph': Object.keys(blockOf(printed, 'paragraph').properties),
      'quote': Object.keys(blockOf(printed, 'quote').properties),
      'evidence-card': Object.keys(blockOf(printed, 'evidence-card').properties),
      'evidence-reference': Object.keys(blockOf(printed, 'evidence-reference').properties),
      'photo': Object.keys(blockOf(printed, 'photo').properties),
      'list': Object.keys(blockOf(printed, 'list').properties),
      '2. evidenceCards': Object.keys(printed.properties.evidenceCards.items.properties),
      '3. heroImage': Object.keys(printed.properties.heroImage.properties),
      '4. headline': Object.keys(printed.properties.headline.properties),
      '5. byline': Object.keys(printed.properties.byline.properties),
      '6. metadata': Object.keys(printed.properties.metadata.properties)
    };
    const named = {
      '1. sections': ['id', 'type', 'heading', 'content'],
      'paragraph': ['type', 'text'],
      'quote': ['type', 'text', 'attribution'],
      'evidence-card': ['type', 'tokenId', 'headline', 'content', 'owner', 'significance'],
      'evidence-reference': ['type', 'tokenId', 'caption'],
      'photo': ['type', 'filename', 'caption'],
      'list': ['type', 'items', 'ordered'],
      '2. evidenceCards': ['tokenId', 'headline', 'summary', 'significance'],
      '3. heroImage': ['filename', 'caption'],
      '4. headline': ['main', 'kicker', 'deck'],
      '5. byline': ['author', 'title', 'guestReporter'],
      '6. metadata': ['sessionId', 'theme', 'generatedAt']
    };
    Object.entries(named).forEach(([where, names]) => {
      expect(`${where}: ${names.filter((name) => !fields[where].includes(name))}`).toBe(`${where}: `);
    });
    ['sections', 'evidenceCards', 'heroImage', 'headline', 'byline', 'metadata']
      .forEach((name) => expect(`${name}: ${name in printed.properties}`).toBe(`${name}: true`));
  });

  it('is valid JSON Schema, and no required list in it names a property it lacks', async () => {
    const printed = printedOf((await calls()).writer.prompt);
    const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
    expect(() => ajv.compile(printed)).not.toThrow();
    expect(requiredLists(printed).flatMap(([at, required, properties]) =>
      required.filter((name) => !properties.includes(name)).map((name) => `${at}: ${name}`))).toEqual([]);
  });

  it("closes the instruction's field list on its first sentence, and names none of the fields left out", async () => {
    const { writer } = await calls();
    const instruction = instructionOf(writer.prompt);
    expect(instruction).toContain('These are the fields the article prints, and the money tracker prints itself from the ledger.\n\n<SCHEMA>\n');
    expect(instruction).not.toContain('The schema also allows');
    ['financialTracker', 'pullQuotes', 'voice_self_check', '"placement"', '"characters"', '"photos"']
      .forEach((name) => expect(`${name}: ${instruction.includes(name)}`).toBe(`${name}: false`));
    // The voice self-check's descriptions leave the prompt with it.
    ['Check against each voice influence', 'Check against voice mechanics requirements', 'Check for anti-patterns']
      .forEach((line) => expect(writer.prompt).not.toContain(line));
  });
});

describe('R13: the SDK, the validator and the template read the full schema', () => {
  it('the schema passed to the SDK is the full one, for the writer and for its automatic rework', async () => {
    const { writer, rework } = await calls();
    expect(writer.jsonSchema).toBe(contentBundleSchema);
    expect(rework.jsonSchema).toBe(contentBundleSchema);
    R13(writer.jsonSchema).forEach(([where, holder, name]) => expect(`${where}: ${name}: ${name in holder}`).toBe(`${where}: ${name}: true`));
  });

  it('a bundle fixture that validated before validates now, the fields the writer is not shown among it', () => {
    // The rework fixture's article, with a headline the schema's ten-character floor admits.
    const bundle = { ...clone(PREVIOUS_BUNDLE), headline: { ...PREVIOUS_BUNDLE.headline, main: 'The Sale Nobody Called a Sale' } };
    expect(bundle.evidenceCards[0]).toHaveProperty('owner');
    expect(bundle.evidenceCards[0]).toHaveProperty('placement');
    expect(new SchemaValidator().validate('content-bundle', bundle).valid).toBe(true);
    bundle.pullQuotes = [{ type: 'verbatim', text: 'It was mine.', attribution: 'Vic' }];
    bundle.financialTracker = { entries: [{ description: 'Gorlan', amount: '$1,000' }] };
    bundle.heroImage = { filename: 'hero.jpg', caption: 'c', characters: ['Vic'] };
    expect(new SchemaValidator().validate('content-bundle', bundle).valid).toBe(true);
  });
});

describe('printedBundleSchemaOf: one pure function from the full schema', () => {
  it('leaves the schema it is given untouched', () => {
    const before = clone(contentBundleSchema);
    printedBundleSchemaOf(contentBundleSchema);
    expect(contentBundleSchema).toEqual(before);
  });

  it('fails loud when a property it removes is gone from the full schema, naming it', () => {
    const schema = clone(contentBundleSchema);
    delete schema.properties.voice_self_check;
    expect(() => printedBundleSchemaOf(schema)).toThrow(/voice_self_check/);
    const noPhotoCharacters = clone(contentBundleSchema);
    delete blockOf(noPhotoCharacters, 'photo').properties.characters;
    expect(() => printedBundleSchemaOf(noPhotoCharacters)).toThrow(/characters/);
  });

  it('fails loud when a property it removes is required, naming it', () => {
    const schema = clone(contentBundleSchema);
    schema.properties.evidenceCards.items.required.push('owner');
    expect(() => printedBundleSchemaOf(schema)).toThrow(/owner/);
  });
});
