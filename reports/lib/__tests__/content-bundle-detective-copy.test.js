/**
 * The parked detective's <SCHEMA> prints a frozen copy of the content-bundle schema
 * (lib/schemas/content-bundle.detective-prompt.json), its descriptions as they were
 * before phase 3 (3.2) cut the live schema's down to shape. The detective's output
 * is validated against the live schema, so the copy must keep its shape: a shape
 * change to one has to reach the other (fix 3.2b, finding 4).
 *
 * The copy carries no $id, so it can never be registered as the live schema (whose
 * $id is "content-bundle"); the detective's <SCHEMA> still prints the id line it
 * printed before (spec D13: detective prompts do not change).
 *
 * Phase 3 (3.7): the live schema gained the optional `writerQuestions`, so the copy
 * carries it too, to keep the shape; the detective's print leaves it out
 * (DETECTIVE_PRINTED_SCHEMA), so its <SCHEMA> is the text it was.
 */
const liveSchema = require('../schemas/content-bundle.schema.json');
const detectiveCopy = require('../schemas/content-bundle.detective-prompt.json');
const { PromptBuilder } = require('../prompt-builder');

/** The schema with every string-valued description and the $id removed: its shape. */
function shapeOf(value) {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, v]) => !(key === 'description' && typeof v === 'string') && key !== '$id')
    .map(([key, v]) => [key, shapeOf(v)]));
}

describe("the detective's frozen copy of the content-bundle schema", () => {
  it('has the live schema\'s shape: equal once the descriptions are stripped from both', () => {
    expect(shapeOf(detectiveCopy)).toEqual(shapeOf(liveSchema));
  });

  it('strips only string descriptions, so a property named "description" stays shape', () => {
    expect(shapeOf({ properties: { description: { type: 'string', description: 'x' } } }))
      .toEqual({ properties: { description: { type: 'string' } } });
  });

  it('carries no $id, so it never claims the live schema\'s', () => {
    expect(liveSchema.$id).toBe('content-bundle');
    expect(detectiveCopy).not.toHaveProperty('$id');
  });

  it("the detective's <SCHEMA> prints the schema as before, its id line included (D13)", async () => {
    const themeLoader = { loadPhasePrompts: jest.fn().mockResolvedValue({}), validate: jest.fn() };
    const { userPrompt } = await new PromptBuilder(themeLoader, 'detective', {})
      .buildArticlePrompt({}, [], null, [], null, null, null, {});
    const block = userPrompt.slice(userPrompt.indexOf('```json\n', userPrompt.indexOf('<SCHEMA>')) + '```json\n'.length);
    const printed = block.slice(0, block.indexOf('\n```'));
    expect(printed.split('\n').slice(0, 4)).toEqual([
      '{',
      '  "$schema": "http://json-schema.org/draft-07/schema#",',
      '  "$id": "content-bundle",',
      '  "title": "ContentBundle",'
    ]);
    const { writerQuestions, ...printedProperties } = detectiveCopy.properties;
    expect(writerQuestions).toBeDefined();
    expect(JSON.parse(printed)).toEqual({ ...detectiveCopy, $id: 'content-bundle', properties: printedProperties });
    expect(printed).not.toContain('writerQuestions');
  });
});
