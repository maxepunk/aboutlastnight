/**
 * The time of day, and the labels that no longer fix the morning (phases 14 and 15, brief E,
 * seat 2; spec section 10; rulings R7 and R8).
 *
 * - One line says when the investigation ran (session-clock.js timeOfDayLine): this morning
 *   for an evening session, this afternoon for a daytime one, from its first sale or exposure
 *   to its last. It prints in SESSION_FACTS (the map and article writers, their reworks, the
 *   article judge) and, for the calls without SESSION_FACTS (the weave writer, its rework, the
 *   story meeting's fact check), beside the session roster in their first section. A session
 *   with no sale and no exposure prints none.
 * - Every code-built label says "the investigation" where it said "the morning": the
 *   timeline's tag and introduction, the record view's introduction, the Sources gloss, the
 *   weave writer's SECTION 2 line and the money summary.
 *
 * Invented names and times throughout: the repo is public.
 */

jest.mock('../workflow/checkpoint-helpers',
  () => require('../../__tests__/mocks/checkpoint-helpers.mock'));

const { PromptBuilder, createPromptBuilder } = require('../prompt-builder');
const { renderMorningTimeline, renderRecordView } = require('../prompt-renderers/record-view');
const { timeOfDayLine } = require('../prompt-renderers/session-clock');
const { SOURCES_GLOSS } = require('../evidence');
const { DIRECTOR_WORDS_SOURCES } = require('../director-words');
const { buildSessionFacts } = require('../workflow/nodes/ai-nodes');
const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
const { _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState } = require('./fixtures/rework-state');

const { buildWeaveSections } = arcTesting;
const { buildEvaluationUserPrompt } = evalTesting;

const MORNING = 'The investigation ran this morning, from 7:37 to 7:50 AM.';
const AFTERNOON = 'The investigation ran this afternoon, from 3:50 to 5:18 PM.';

/** The fixture with an exposure before its 07:50 PM sale: an evening session. */
function eveningState() {
  const base = reworkFixtureState('journalist');
  return { ...base, sessionConfig: { ...base.sessionConfig, exposures: [{ tokenId: 'ale003', exposer: '', time: '07:37 PM' }] } };
}

/** The fixture played in the afternoon: an exposure at 3:50 PM, its sale at 5:18 PM. */
function afternoonState() {
  const base = reworkFixtureState('journalist');
  return {
    ...base,
    sessionConfig: { ...base.sessionConfig, exposures: [{ tokenId: 'ale003', exposer: '', time: '03:50 PM' }] },
    evidenceBundle: {
      ...base.evidenceBundle,
      buried: { transactions: [{ sourceType: 'memory-token', shellAccount: 'Melanie', amount: 75000, time: '05:18 PM' }] }
    }
  };
}

/** The fixture with no sale and no exposure. */
function quietState() {
  const base = reworkFixtureState('journalist');
  return { ...base, evidenceBundle: { ...base.evidenceBundle, buried: { transactions: [] } } };
}

const sessionFactsOf = (state) =>
  new PromptBuilder(null, 'journalist', state.sessionConfig, state.canonicalCharacters, null)._sessionFactsSection(buildSessionFacts(state));
const section1Of = (state) => {
  const sections = buildWeaveSections(state);
  return sections.slice(sections.indexOf('## SECTION 1'), sections.indexOf('## SECTION 2'));
};

describe('the time-of-day line reaches every writer and judge (R7)', () => {
  it('is the line timeOfDayLine builds from the session config and the bundle', () => {
    expect(timeOfDayLine(eveningState().sessionConfig, eveningState().evidenceBundle)).toBe(MORNING);
    expect(timeOfDayLine(afternoonState().sessionConfig, afternoonState().evidenceBundle)).toBe(AFTERNOON);
  });

  it('opens SESSION_FACTS for the map and article writers, before the roster', () => {
    const facts = sessionFactsOf(eveningState());
    expect(facts).toContain(`<SESSION_FACTS>\n${MORNING}\n\nINVESTIGATION ROSTER`);
    expect(sessionFactsOf(afternoonState())).toContain(AFTERNOON);
  });

  it("sits beside the session roster in the weave writer's first section", () => {
    expect(section1Of(eveningState())).toContain(`### Session Roster (the players at the investigation)\n["Alex","Morgan","Sarah","Riley"]\n${MORNING}\n`);
    expect(section1Of(afternoonState())).toContain(AFTERNOON);
  });

  it("reaches the story meeting's fact check and the article judge", () => {
    for (const phase of ['arcs', 'article']) {
      expect(buildEvaluationUserPrompt(phase, eveningState(), { factCheck: null })).toContain(MORNING);
      expect(buildEvaluationUserPrompt(phase, afternoonState(), { factCheck: null })).toContain(AFTERNOON);
    }
  });

  it('prints nowhere for a session with no sale and no exposure', () => {
    const state = quietState();
    expect(timeOfDayLine(state.sessionConfig, state.evidenceBundle)).toBeNull();
    expect(sessionFactsOf(state)).not.toContain('The investigation ran');
    expect(buildWeaveSections(state)).not.toContain('The investigation ran');
    for (const phase of ['arcs', 'article']) {
      expect(buildEvaluationUserPrompt(phase, state, { factCheck: null })).not.toContain('The investigation ran');
    }
  });
});

describe('no code-built label fixes the morning (R8)', () => {
  const bundle = eveningState().evidenceBundle;

  it("names the timeline the investigation's, in its tag and its introduction", () => {
    const lines = renderMorningTimeline(bundle, eveningState().sessionConfig).split('\n');
    expect(lines[0]).toBe('<investigation-timeline>');
    expect(lines[lines.length - 1]).toBe('</investigation-timeline>');
    expect(lines[1]).toMatch(/^The investigation in time order: /);
    expect(lines[1]).not.toMatch(/morning/i);
  });

  it('says in the record view\'s introduction that a character sheet prints marked and trimmed (T1)', () => {
    const intro = renderRecordView(bundle, { sessionConfig: eveningState().sessionConfig }).split('\n')[1];
    expect(intro).toContain("a player's character sheet, which prints marked and trimmed (T1)");
    expect(intro).toContain('<investigation-timeline>');
    expect(intro).not.toMatch(/morning|is complete/i);
  });

  it('glosses the ledger and the log on the investigation\'s timeline, and the notes as the director\'s words name them', () => {
    expect(SOURCES_GLOSS).not.toMatch(/morning/i);
    expect(SOURCES_GLOSS).toContain("\"ledger\" for a sale, the bonus or a transfer on the investigation's timeline");
    const labels = DIRECTOR_WORDS_SOURCES.map((source) => source.label);
    expect(SOURCES_GLOSS).toMatch(new RegExp(`"notes" for the director's own words: ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}$`));
    expect(labels[labels.length - 1]).toBe('the notes at the stops');
  });

  it("opens the weave writer's SECTION 2 on the investigation's timeline, a sheet marked and trimmed", () => {
    const sections = buildWeaveSections(eveningState());
    const line = sections.slice(sections.indexOf('## SECTION 2: THE RECORD\n\n')).split('\n')[2];
    expect(line).toBe("The 2 exposed memories and 2 paper documents, each whole except a player's character sheet, which prints marked and trimmed (T1); then the investigation's timeline: every sale, exposure, bonus and transfer, in time order.");
  });

  it('says the money summary\'s total is what the buyer paid out during the investigation', () => {
    const summary = createPromptBuilder('journalist')._buildFinancialSummary([{ name: 'Melanie', total: 75000, tokenCount: 1 }]);
    expect(summary).toContain('That is what the buyer paid out during the investigation, the sales and the first-burial bonus;');
    expect(summary).not.toMatch(/morning/i);
  });
});
