/**
 * The whiteboard parse, and how the writers see it (phase 3, brief 3.5; spec T13,
 * section 6; coverage-upstream #77, #81, #82; coverage-photos-detective W4 to W18).
 *
 * - The parse matches handwritten names against the canonical characters and the
 *   NPCs, not only the roster, and keeps the literal text when unsure: a room can
 *   suspect someone who is not at the table, and the old rule rewrote that name into
 *   the nearest player's.
 * - It keeps each region of the whiteboard with the players' own heading and adds no
 *   label of its own (the schema used to suggest "SUSPECTS", and code took the first
 *   group so labelled as the room's suspects).
 * - The writers see it labelled as a machine's reading of the photo, context for how
 *   the room reasoned, never as what "players drew".
 */

const fs = require('fs');
const path = require('path');

const { ImagePromptBuilder } = require('../image-prompt-builder');
const { _testing: { WHITEBOARD_SCHEMA } } = require('../workflow/nodes/input-nodes');
const { synthesizePlayerFocus } = require('../workflow/nodes/node-helpers');
const { renderWhiteboardConnections } = require('../prompt-renderers/director-words-renderer');

const WHITEBOARD_FILE = path.join(__dirname, '..', '..', '.claude', 'skills', 'journalist-report',
  'references', 'prompts', 'whiteboard-analysis.md');

/** A parse of a whiteboard whose regions the players headed themselves. */
const PARSE = {
  names: ['Vic', 'Alex', 'Randy'],
  regions: [
    { label: 'WHO?', location: 'left column', entries: ['Vic', 'Alex', 'Randy'] },
    { label: '', location: 'top right', entries: ['$$', '2am?'] }
  ],
  connections: [{ from: 'Vic', to: '$$', label: 'paid?' }],
  notes: ['the valet knows'],
  structureType: 'two columns',
  ambiguities: ['[unclear: Mo could be Morgan]']
};

describe('WHITEBOARD_SCHEMA: regions with the players\' own headings', () => {
  const props = WHITEBOARD_SCHEMA.properties;

  it('has a region per area of the whiteboard, each with its heading, location and entries', () => {
    expect(WHITEBOARD_SCHEMA.required).toEqual(expect.arrayContaining(['names', 'regions']));
    expect(Object.keys(props.regions.items.properties)).toEqual(['label', 'location', 'entries']);
    expect(props.regions.items.properties.label.description).toMatch(/players wrote/);
    expect(props.regions.items.properties.label.description).toMatch(/empty when they wrote none/);
  });

  it('suggests no label of its own and no roster correction', () => {
    const text = JSON.stringify(WHITEBOARD_SCHEMA);
    expect(props.groups).toBeUndefined();
    expect(text).not.toMatch(/SUSPECTS/);
    expect(text).not.toMatch(/roster-corrected/);
    expect(text).not.toMatch(/accusation web/);
  });
});

describe('the whiteboard prompt matches names against every character and the NPCs', () => {
  function builder(systemPrompt = 'SYSTEM') {
    return new ImagePromptBuilder({ loadPhasePrompts: async () => ({ 'whiteboard-analysis': systemPrompt }) });
  }

  it('lists the roster, every character in the game and the NPCs', async () => {
    const { userPrompt } = await builder().buildWhiteboardPrompt({
      roster: ['Vic', 'Alex'],
      characters: ['Vic Kingsley', 'Alex Reeves', 'Morgan Reed'],
      npcs: ['Marcus Blackwood', 'Blake', 'Nova'],
      whiteboardPhotoPath: '/p/whiteboard.jpg'
    });
    expect(userPrompt).toContain('/p/whiteboard.jpg');
    expect(userPrompt).toContain('Vic, Alex');
    expect(userPrompt).toContain('Vic Kingsley, Alex Reeves, Morgan Reed');
    expect(userPrompt).toContain('Marcus Blackwood, Blake, Nova');
    expect(userPrompt).toMatch(/keep the text as written/);
    expect(userPrompt).not.toMatch(/roster-corrected|use the roster above to correct/);
  });

  it('the system prompt file keeps unsure names literal and frames no murder', () => {
    const text = fs.readFileSync(WHITEBOARD_FILE, 'utf8');
    expect(text).not.toMatch(/murder mystery/);
    expect(text).not.toMatch(/prefer roster names/i);
    expect(text).not.toMatch(/Always apply roster disambiguation/);
    expect(text).toMatch(/copy the text as written/i);
    expect(text).toMatch(/region/i);
    expect(text).not.toMatch(/—/);
  });
});

describe('synthesizePlayerFocus reads regions, not a "suspect" label', () => {
  it('keeps every region with its heading, and every name as the parse returned it', () => {
    const focus = synthesizePlayerFocus({ roster: ['Vic', 'Alex'], accusation: { accused: ['Vic'], charge: 'Murder' } }, { whiteboard: PARSE });
    expect(focus.whiteboardContext.regions).toEqual(PARSE.regions);
    expect(focus.whiteboardContext.namesFound).toEqual(['Vic', 'Alex', 'Randy']);
    expect(focus.whiteboardContext.ambiguities).toEqual(PARSE.ambiguities);
    expect(focus.whiteboardContext.suspectsExplored).toBeUndefined();
  });

  it('reads an older parse\'s groups as regions', () => {
    const focus = synthesizePlayerFocus({ accusation: {} }, { whiteboard: { names: [], groups: [{ label: 'SUSPECTS', members: ['Vic'] }] } });
    expect(focus.whiteboardContext.regions).toEqual([{ label: 'SUSPECTS', location: '', entries: ['Vic'] }]);
  });
});

describe('renderWhiteboardConnections: a machine\'s reading, given as context', () => {
  const context = synthesizePlayerFocus({ accusation: {} }, { whiteboard: PARSE }).whiteboardContext;

  it('labels the whole as a model\'s reading of the photo, context for how the room reasoned', () => {
    const out = renderWhiteboardConnections(context);
    expect(out.startsWith('### The Whiteboard (a model\'s reading of the photo)\n')).toBe(true);
    expect(out).toMatch(/context for how the room reasoned/);
    expect(out).not.toMatch(/Players drew these/);
  });

  it('prints each region under the players\' heading, and a name off the roster as written', () => {
    const out = renderWhiteboardConnections(context);
    expect(out).toContain('- "WHO?" (left column): Vic, Alex, Randy');
    expect(out).toContain('- no heading (top right): $$, 2am?');
    expect(out).toContain('**Lines drawn:** ["Vic → $$ (paid?)"]');
    expect(out).toContain('[unclear: Mo could be Morgan]');
  });

  it('prints an older thread\'s suspect list as an unheaded region, and nothing when the whiteboard is empty', () => {
    const out = renderWhiteboardConnections({ suspectsExplored: ['Alex', 'Morgan'], connections: [], notes: [], namesFound: [] });
    expect(out).toContain('- no heading: Alex, Morgan');
    expect(renderWhiteboardConnections({}, { omitWhenEmpty: true })).toBe('');
  });
});
