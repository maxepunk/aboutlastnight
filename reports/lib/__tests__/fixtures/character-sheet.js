/**
 * A player's character sheet in the shape the paper-evidence fetch stores it (phase 15, brief D;
 * spec 2026-10-09 section 7): a paper document named "<Name> Character Sheet", basicType
 * "Document", its text opening on the role and the DOB line, then the headed blocks
 * `▌[FLAGGED] SUSPECTED MOTIVE`, RECOVERED MEMORY FRAGMENTS, CORE IDENTITY, KEY RELATIONSHIPS
 * and WHERE TO START. The headings are the real ones; every other word is invented, because the
 * repo is public.
 *
 * Also an older copy saved with no headings (basicType "Prop"), which prints whole, marked.
 */

/** The backstory blocks of the invented sheet, which the record keeps. */
const SHEET_BACKSTORY = [
  '< Restless Sommelier >',
  'DOB: 04/22/1987    |    KNOWN ASSOCIATE: MARCUS, QUINN',
  '',
  'RECOVERED MEMORY FRAGMENTS',
  '[01] You poured the wine at the gallery opening where Quinn first met Marcus.',
  '[02] You kept the cork from the bottle Marcus never paid for.',
  '',
  'CORE IDENTITY',
  'You spent ten years in vineyards before the city pulled you in. Tonight you want the cellar keys back, whatever it costs.',
  '',
  'KEY RELATIONSHIPS',
  '[01] Quinn: Your oldest friend, who still owes you a favour.'
];

const SHEET_MOTIVE = [
  '▌[FLAGGED] SUSPECTED MOTIVE',
  '"Marcus sold your cellar out from under you. Time to collect."'
];

const SHEET_START = [
  'WHERE TO START',
  '[01] Check the wine rack by the stairs first.',
  '[02] Find Quinn before anyone else does.'
];

/** The sheet's text as stored: the role, the motive block, the backstory blocks, the start block. */
const SHEET_TEXT = [
  SHEET_BACKSTORY[0],
  SHEET_BACKSTORY[1],
  '',
  ...SHEET_MOTIVE,
  '',
  ...SHEET_BACKSTORY.slice(3),
  '',
  ...SHEET_START
].join('\n');

/** The sheet as curation keeps a paper item: the Notion record spread, plus id. */
function characterSheet(overrides = {}) {
  return {
    notionId: 'sheet-0001',
    name: 'Dana Vire Character Sheet',
    basicType: 'Document',
    description: SHEET_TEXT,
    narrativeThreads: ['Underground Parties'],
    files: [],
    owners: ['Dana Vire'],
    id: 'sheet-0001',
    fullContent: SHEET_TEXT,
    sourceType: 'paper-evidence',
    ...overrides
  };
}

/** An older copy, saved as a Prop, whose text carries none of the headings. */
const HEADINGLESS_TEXT = 'Dana Vire. Sommelier. Knows Quinn from the gallery. Wants the cellar keys back.';

function headinglessSheet(overrides = {}) {
  return characterSheet({
    notionId: 'sheet-0002',
    id: 'sheet-0002',
    basicType: 'Prop',
    description: HEADINGLESS_TEXT,
    fullContent: HEADINGLESS_TEXT,
    ...overrides
  });
}

module.exports = {
  characterSheet,
  headinglessSheet,
  SHEET_TEXT,
  SHEET_BACKSTORY,
  SHEET_MOTIVE,
  SHEET_START,
  HEADINGLESS_TEXT
};
