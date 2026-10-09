/**
 * The article's authors, known to every stage (phases 14 and 15, brief E, seat 1; spec
 * section 5; rulings R4 and R5).
 *
 * - Nova's name for the session joins the roster section's Nova line (tested in
 *   prompt-builder-roster.test.js, beside the roster section's other lines).
 * - On site only, the character-IDs parse and the photo enrichment are told Nova's names
 *   beside the roster, and the photo entries mark a name for Nova as the article's writer.
 *   The roster decides a clash: a name a roster player has is that player.
 * - The guest reporter, when the session has one: one line in SESSION_FACTS, the weave
 *   writer's first section and both judges, and a turn-in under their name marked on the
 *   timeline. With none, nothing new prints.
 *
 * Invented names throughout: the repo is public.
 */

const { PromptBuilder } = require('../prompt-builder');
const { renderMorningTimeline } = require('../prompt-renderers/record-view');
const {
  guestReporterLine, guestTurnInName
} = require('../prompt-renderers/session-authors');
const { buildSessionFacts } = require('../workflow/nodes/ai-nodes');
const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
const { _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState } = require('./fixtures/rework-state');

const { buildWeaveSections } = arcTesting;
const { buildEvaluationUserPrompt } = evalTesting;

const GUEST = { name: 'Dana Okafor', role: 'Contributing Reporter' };
const GUEST_LINE = "The guest reporter: Dana Okafor (Contributing Reporter) shares this article's byline. " +
  "A memory turned in under the name Dana Okafor or Dana is Dana Okafor's reporting for this article.";

describe('the guest reporter, when the session has one (R5)', () => {
  const withGuest = (guestReporter) => {
    const base = reworkFixtureState('journalist');
    return {
      ...base,
      sessionConfig: {
        ...base.sessionConfig,
        guestReporter,
        exposures: [
          { tokenId: 'ale003', exposer: 'Dana', time: '07:37 PM' },
          { tokenId: 'mor001', exposer: 'dana okafor', time: '07:40 PM' }
        ]
      }
    };
  };

  it('is one line that says who shares the byline and whose reporting their turn-ins are', () => {
    expect(guestReporterLine({ guestReporter: GUEST })).toBe(GUEST_LINE);
    expect(guestReporterLine({ guestReporter: { name: 'Ashe', role: '' } }))
      .toBe("The guest reporter: Ashe shares this article's byline. A memory turned in under the name Ashe is Ashe's reporting for this article.");
  });

  it('is null with no guest reporter', () => {
    expect(guestReporterLine({ guestReporter: null })).toBeNull();
    expect(guestReporterLine({})).toBeNull();
    expect(guestReporterLine({ guestReporter: { name: '  ', role: 'Guest Reporter' } })).toBeNull();
    expect(guestReporterLine(null)).toBeNull();
  });

  it('joins SESSION_FACTS for the map and article writers, and nothing prints with none', () => {
    const state = withGuest(GUEST);
    const builder = new PromptBuilder(null, 'journalist', state.sessionConfig, state.canonicalCharacters, null);
    expect(builder._sessionFactsSection(buildSessionFacts(state))).toContain(GUEST_LINE);

    const none = withGuest(null);
    expect(builder._sessionFactsSection(buildSessionFacts(none))).not.toContain('guest reporter');
  });

  it("joins the weave writer's first section, beside the session roster", () => {
    const sections = buildWeaveSections(withGuest(GUEST));
    const section1 = sections.slice(sections.indexOf('## SECTION 1'), sections.indexOf('## SECTION 2'));
    expect(section1).toContain(GUEST_LINE);
    expect(buildWeaveSections(withGuest(null))).not.toContain('The guest reporter:');
  });

  it('reaches both judges beside the session roster', () => {
    for (const phase of ['arcs', 'article']) {
      expect(buildEvaluationUserPrompt(phase, withGuest(GUEST), { factCheck: null })).toContain(GUEST_LINE);
      expect(buildEvaluationUserPrompt(phase, withGuest(null), { factCheck: null })).not.toContain('The guest reporter:');
    }
  });

  it('marks a turn-in under their full name or their first name, in any case', () => {
    expect(guestTurnInName('Dana', { guestReporter: GUEST })).toBe('Dana (the guest reporter, Dana Okafor)');
    expect(guestTurnInName('dana okafor', { guestReporter: GUEST })).toBe('dana okafor (the guest reporter)');
    expect(guestTurnInName('Vic', { guestReporter: GUEST })).toBe('Vic');
    expect(guestTurnInName('Dana', { guestReporter: null })).toBe('Dana');

    const bundle = {
      exposed: { tokens: ['ale003', 'mor001'].map((id) => ({ id, rawData: { tokenId: id } })), paperEvidence: [] },
      buried: { transactions: [] }
    };
    const timeline = renderMorningTimeline(bundle, withGuest(GUEST).sessionConfig);
    expect(timeline).toContain('document: ale003 | named: Dana (the guest reporter, Dana Okafor)');
    expect(timeline).toContain('document: mor001 | named: dana okafor (the guest reporter)');
    const plain = renderMorningTimeline(bundle, withGuest(null).sessionConfig);
    expect(plain).toContain('document: ale003 | named: Dana\n');
    expect(plain).not.toContain('guest reporter');
  });
});
