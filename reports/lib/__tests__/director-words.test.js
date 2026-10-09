/**
 * The director's words are one list (phases 14 and 15, brief B; spec
 * docs/superpowers/specs/2026-10-09-your-words-and-the-world.md section 3; rulings R1 and R2).
 *
 * lib/director-words.js owns the list: the notes, the input-review corrections, the accusation,
 * the answers at the story meeting and every note the director sent at a stop. The notes at the
 * stops are read from directorGateNotes whole, never through filterGateNotes, so a judge reads
 * the note a rework acted on too. Every reader of the director's words reads the list: both
 * judges (the notes at the stops in <DIRECTOR_STOP_NOTES>), the fact check's directorText, the
 * verdict guard's record and the evidence check's "notes".
 *
 * The notes below are invented text.
 */

const { DIRECTOR_WORDS_SOURCES, directorWordsTexts } = require('../director-words');
const { renderDirectorStopNotes } = require('../prompt-renderers/director-words-renderer');
const { evidenceContextOf, evidenceProblems, SOURCES_GLOSS } = require('../evidence');
const { filterGateNotes } = require('../prompt-builder');
const { _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState } = require('./fixtures/rework-state');

const { TRUTH_MATERIAL, directorWords, recordTexts, buildFactCheckArgs, buildEvaluationUserPrompt } = evalTesting;

/** A map note sent back, the meeting's approval note, and a rejection note at the article. */
const MAP_NOTE = 'Shifting the transfer times nine hours to fit the timeline works. They are relevant.';
const MEETING_NOTE = 'Keep the bartender in the story; the room trusted him.';
const ARTICLE_NOTE = 'What if the new CEO was the outcome someone planned all along?';
const NOTES = [
  { gate: 'outline', kind: 'rejection', round: 1, stopRound: 2, text: MAP_NOTE, at: '2026-10-09T03:17:00.000Z' },
  { gate: 'arc-selection', kind: 'approval', round: 1, stopRound: 1, text: `  ${MEETING_NOTE}\n`, at: '2026-10-09T02:00:00.000Z' },
  { gate: 'article', kind: 'rejection', round: 1, stopRound: 1, text: ARTICLE_NOTE, at: '2026-10-09T05:00:00.000Z' }
];

const withNotes = (notes = NOTES) => ({ ...reworkFixtureState('journalist'), directorGateNotes: notes.map((n) => ({ ...n })) });

/** The text between a tag and its closing tag in a prompt. */
const blockIn = (prompt, open) => {
  const start = prompt.indexOf(open);
  const end = prompt.indexOf(open.replace('<', '</'));
  return start < 0 || end < 0 ? null : prompt.slice(start, end + open.length + 1);
};

describe("R1: the director's words are one list", () => {
  it('five sources in order: the notes, the corrections, the accusation, the answers at the story meeting, the notes at the stops', () => {
    expect(DIRECTOR_WORDS_SOURCES.map((source) => source.material)).toEqual(['notes', 'corrections', 'verdict', 'answers', 'stopNotes']);
    expect(DIRECTOR_WORDS_SOURCES.map((source) => source.label)).toEqual([
      'the notes', 'the input-review corrections', 'the accusation', 'the answers at the story meeting', 'the notes at the stops'
    ]);
    expect(Object.isFrozen(DIRECTOR_WORDS_SOURCES)).toBe(true);
    DIRECTOR_WORDS_SOURCES.forEach((source) => expect(Object.isFrozen(source)).toBe(true));
  });

  it("the notes at the stops are every note's text in directorGateNotes, the one a rework is acting on included", () => {
    const state = withNotes();
    const stopNotes = DIRECTOR_WORDS_SOURCES.find((source) => source.material === 'stopNotes');
    expect(stopNotes.texts(state)).toEqual(NOTES.map((n) => n.text));
    // The map's rework acting on MAP_NOTE leaves it out of its standing notes; the list keeps it.
    expect(filterGateNotes(state.directorGateNotes, MAP_NOTE, 'outline').map((n) => n.text)).not.toContain(MAP_NOTE);
    expect(stopNotes.texts({ ...state, _outlineFeedback: MAP_NOTE })).toContain(MAP_NOTE);
  });

  it("directorWordsTexts returns every source's texts in the list's order, empty ones dropped", () => {
    const state = withNotes([...NOTES, { gate: 'outline', kind: 'approval', text: '   ' }]);
    state.inputReviewCorrections = ['Quinn spoke first at the vote, not Alex.', ''];
    const texts = directorWordsTexts(state);
    expect(texts[0]).toBe(state.directorNotes.rawProse);
    expect(texts[1]).toBe('Quinn spoke first at the vote, not Alex.');
    expect(texts.slice(-3)).toEqual(NOTES.map((n) => n.text));
    expect(texts.every((text) => typeof text === 'string' && text.trim())).toBe(true);
    // The evaluator's directorWords is the module's.
    expect(directorWords(state)).toEqual(texts);
  });

  it('a state with no notes at any stop gives none, and no other source changes', () => {
    const state = reworkFixtureState('journalist');
    expect(directorWordsTexts(withNotes([]))).toEqual(directorWordsTexts(state));
    expect(directorWordsTexts({})).toEqual([]);
  });
});

describe('R2: the notes at the stops in their own block', () => {
  it('opens with one line pointing at T1, then each note under its stop and its action, word for word', () => {
    const block = renderDirectorStopNotes(withNotes());
    const lines = block.split('\n');
    expect(lines[0]).toBe('<DIRECTOR_STOP_NOTES>');
    expect(lines[1]).toBe("The notes the director sent with their actions at the stops, in order: the director's own words, each read as T1 sets out.");
    expect(lines.slice(2, -1)).toEqual([
      `- At the map, sent back: "${MAP_NOTE}"`,
      `- At the story meeting, approved: "${MEETING_NOTE}"`,
      `- At the article, sent back: "${ARTICLE_NOTE}"`
    ]);
    expect(lines[lines.length - 1]).toBe('</DIRECTOR_STOP_NOTES>');
    expect(block).not.toMatch(/arc-selection|outline|rejection|\u2014/);
  });

  it('holds "None." when the director sent no note at any stop', () => {
    for (const state of [reworkFixtureState('journalist'), withNotes([]), withNotes([{ gate: 'outline', kind: 'approval', text: '  ' }])]) {
      const lines = renderDirectorStopNotes(state).split('\n');
      expect(lines.slice(2)).toEqual(['None.', '</DIRECTOR_STOP_NOTES>']);
    }
  });

  it('a note that holds lines of its own prints whole, in quotation marks, as one note', () => {
    const text = 'Answers:\n- the readout came after the sales.\n- unknown who said it.';
    const block = renderDirectorStopNotes(withNotes([{ gate: 'outline', kind: 'rejection', text }]));
    expect(block).toContain(`- At the map, sent back: "${text}"\n</DIRECTOR_STOP_NOTES>`);
  });

  it('a note filed before notes had a kind is a send-back', () => {
    const block = renderDirectorStopNotes(withNotes([{ gate: 'article', text: ARTICLE_NOTE }]));
    expect(block).toContain(`- At the article, sent back: "${ARTICLE_NOTE}"`);
  });

  it('TRUTH_MATERIAL names the block by its tag', () => {
    expect(TRUTH_MATERIAL.stopNotes).toBe('<DIRECTOR_STOP_NOTES>');
  });

  describe.each(['arcs', 'article'])('the %s judge', (phase) => {
    const promptFor = (state) => buildEvaluationUserPrompt(phase, state, { factCheck: null });

    it('prints the block once, with every note word for word under its stop and action', () => {
      const prompt = promptFor(withNotes());
      expect(prompt.split('<DIRECTOR_STOP_NOTES>').length - 1).toBe(1);
      expect(blockIn(prompt, '<DIRECTOR_STOP_NOTES>')).toBe(renderDirectorStopNotes(withNotes()));
      [MAP_NOTE, MEETING_NOTE, ARTICLE_NOTE].forEach((text) => expect(blockIn(prompt, '<DIRECTOR_STOP_NOTES>')).toContain(text));
    });

    it('prints it right after the answers at the story meeting, after the notes, before the record', () => {
      const state = withNotes();
      state.weave.questions[0].answer = 'Sarah ran the bar all night.';
      const prompt = promptFor(state);
      const at = (text) => prompt.indexOf(text);
      expect(at('</DIRECTOR_ANSWERS>\n\n<DIRECTOR_STOP_NOTES>')).toBeGreaterThan(-1);
      expect(at('<DIRECTOR_STOP_NOTES>')).toBeGreaterThan(at('</DIRECTOR_NOTES>'));
      expect(at('</DIRECTOR_STOP_NOTES>')).toBeLessThan(at('<RECORD>'));
    });

    it('holds "None." with no note, and the prompt is otherwise as it was', () => {
      const prompt = promptFor(reworkFixtureState('journalist'));
      expect(blockIn(prompt, '<DIRECTOR_STOP_NOTES>')).toContain('\nNone.\n');
      const without = prompt.replace(`\n\n${renderDirectorStopNotes(reworkFixtureState('journalist'))}`, '');
      expect(without).not.toContain('DIRECTOR_STOP_NOTES');
    });

    it('every question that reads the director\'s words reads the notes at the stops', () => {
      const criteria = evalTesting.truthCriteria(phase);
      const readers = Object.entries(criteria)
        .filter(([, c]) => c.reads.some((m) => ['notes', 'corrections', 'verdict', 'answers'].includes(m)))
        .map(([key, c]) => [key, c.reads.includes('stopNotes')]);
      expect(readers.length).toBeGreaterThan(0);
      expect(readers).toEqual(readers.map(([key]) => [key, true]));
    });
  });
});

describe('every reader of the director\'s words reads the notes at the stops', () => {
  it("the fact check's directorText holds each note's text", () => {
    const { directorText } = buildFactCheckArgs(withNotes());
    [MAP_NOTE, MEETING_NOTE, ARTICLE_NOTE].forEach((text) => expect(directorText).toContain(text));
  });

  it("the verdict guard's record holds each note's text", () => {
    const record = recordTexts(withNotes());
    [MAP_NOTE, ARTICLE_NOTE].forEach((text) => expect(record).toContain(text));
  });

  it('a piece of evidence citing "notes" may quote a note at a stop', () => {
    const quoting = [{ sources: ['notes'], shows: `The director ruled "${MAP_NOTE}"`, stance: 'supports' }];
    expect(evidenceContextOf(withNotes()).texts.notes).toContain(MAP_NOTE);
    expect(evidenceProblems(quoting, evidenceContextOf(withNotes()))).toEqual([]);
    expect(evidenceProblems(quoting, evidenceContextOf(withNotes([]))).map((p) => p.kinds)).toEqual([["quotation"]]);
  });

  it("the gloss on \"notes\" says the director's own words include their notes at the stops", () => {
    expect(SOURCES_GLOSS).toMatch(/"notes" for the director's own words: .*the standing notes from the stops$/);
  });
});
