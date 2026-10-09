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

jest.mock('../workflow/checkpoint-helpers',
  () => require('../../__tests__/mocks/checkpoint-helpers.mock'));

const { PromptBuilder } = require('../prompt-builder');
const { renderMorningTimeline } = require('../prompt-renderers/record-view');
const {
  writerInPhotosLine, markWriterInPhoto, guestReporterLine, guestTurnInName
} = require('../prompt-renderers/session-authors');
const { buildAvailablePhotos, heroPhotoEntry, buildSessionFacts } = require('../workflow/nodes/ai-nodes');
const { parseCharacterIds, finalizePhotoAnalyses } = require('../workflow/nodes/photo-nodes');
const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
const { _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');
const { createImagePromptBuilder } = require('../image-prompt-builder');
const { reworkFixtureState } = require('./fixtures/rework-state');

const { buildWeaveSections } = arcTesting;
const { buildEvaluationUserPrompt } = evalTesting;

const CANONICAL = { Vic: 'Vic Kingsley', Mel: 'Mel Nilsson', Cass: 'Cass Zhang' };
const MARKED = (name) => `${name} (Nova, who writes this article)`;
const GUEST = { name: 'Dana Okafor', role: 'Contributing Reporter' };
const GUEST_LINE = "The guest reporter: Dana Okafor (Contributing Reporter) shares this article's byline. " +
  "A memory turned in under the name Dana Okafor or Dana is Dana Okafor's reporting for this article.";

describe("on site, the character-IDs parse and the photo enrichment know Nova's names (R4)", () => {
  const ANALYSES = {
    analyses: [{
      filename: 'room-1.jpg',
      visualContent: 'Two people at a table',
      narrativeMoment: 'Comparing notes',
      emotionalTone: 'focused',
      storyRelevance: 'high',
      characterDescriptions: [{ description: 'person in a grey coat', role: 'seated' }]
    }],
    stats: { totalPhotos: 1, analyzedPhotos: 1 }
  };
  const ENRICHED = {
    enrichedVisualContent: 'Vic at the table', enrichedNarrativeMoment: 'Comparing notes',
    finalCaption: 'Vic and Rhea compare notes', identifiedCharacters: ['Vic', 'Rhea'], boundaryCheck: 'clean'
  };
  function makeConfig(sdkResult) {
    const prompts = [];
    return {
      prompts,
      config: { configurable: { imagePromptBuilder: createImagePromptBuilder(), sdkClient: async ({ prompt }) => { prompts.push(prompt); return sdkResult; } } }
    };
  }
  const stateFor = (reportingMode) => ({
    theme: 'journalist',
    roster: ['Vic', 'Mel'],
    sessionConfig: { roster: ['Vic', 'Mel'], reportingMode, journalistFirstName: 'Rhea' },
    photoAnalyses: ANALYSES
  });

  it('gives the line only on site, naming Nova and the first name', () => {
    const line = writerInPhotosLine('journalist', { reportingMode: 'on-site', journalistFirstName: 'Rhea' });
    expect(line).toContain('Rhea Nova');
    expect(line).toContain('A name a roster player has names that player');
    expect(writerInPhotosLine('journalist', { reportingMode: 'remote', journalistFirstName: 'Rhea' })).toBeNull();
    expect(writerInPhotosLine('detective', { reportingMode: 'on-site' })).toBeNull();
  });

  it('prints the line beside the roster in the character-IDs parse, on site only', async () => {
    const onSite = makeConfig({ photos: [] });
    await parseCharacterIds({ ...stateFor('on-site'), characterIdsRaw: 'the grey coat is Rhea' }, onSite.config);
    expect(onSite.prompts.join('\n')).toContain(`VALID ROSTER:\nVic, Mel\n\nTHE ARTICLE'S WRITER:\n${writerInPhotosLine('journalist', stateFor('on-site').sessionConfig)}`);

    const remote = makeConfig({ photos: [] });
    await parseCharacterIds({ ...stateFor('remote'), characterIdsRaw: 'the grey coat is Vic' }, remote.config);
    expect(remote.prompts.join('\n')).not.toContain("THE ARTICLE'S WRITER");
    expect(remote.prompts.join('\n')).not.toContain('Nova');
  });

  it("prints the line after the enrichment's ROSTER line, on site only", async () => {
    const mappings = { 'room-1.jpg': { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] } };
    const onSite = makeConfig(ENRICHED);
    await finalizePhotoAnalyses({ ...stateFor('on-site'), characterIdMappings: mappings }, onSite.config);
    expect(onSite.prompts.join('\n')).toContain(`ROSTER: Vic, Mel\nTHE ARTICLE'S WRITER: ${writerInPhotosLine('journalist', stateFor('on-site').sessionConfig)}`);

    const remote = makeConfig(ENRICHED);
    await finalizePhotoAnalyses({ ...stateFor('remote'), characterIdMappings: mappings }, remote.config);
    expect(remote.prompts.join('\n')).not.toContain("THE ARTICLE'S WRITER");
  });
});

describe('the photo entries mark Nova as the article\'s writer, on site only (R4)', () => {
  const photoState = ({ reportingMode, journalistFirstName = 'Rhea', roster = ['Vic', 'Mel'], names }) => ({
    theme: 'journalist',
    roster,
    sessionConfig: { roster, reportingMode, journalistFirstName },
    canonicalCharacters: CANONICAL,
    sessionPhotos: ['photos/a.jpg', 'photos/b.jpg'],
    photoAnalyses: { analyses: [
      { filename: 'a.jpg', identifiedCharacters: names },
      { filename: 'b.jpg', identifiedCharacters: ['Vic'] }
    ] }
  });

  it('marks a name equal to Nova\'s first name, or "Nova", in the hero entry and the other photos', () => {
    const state = photoState({ reportingMode: 'on-site', names: ['Vic', 'rhea', 'Nova'] });
    expect(buildAvailablePhotos(state, 'b.jpg', null)[0].identifiedCharacters)
      .toEqual(['Vic', MARKED('rhea'), MARKED('Nova')]);
    expect(heroPhotoEntry(state, 'a.jpg').identifiedCharacters).toEqual(['Vic', MARKED('rhea'), MARKED('Nova')]);
  });

  it('leaves a roster player who shares Nova\'s first name as the player: the roster decides', () => {
    const state = photoState({ reportingMode: 'on-site', journalistFirstName: 'Cass', roster: ['Vic', 'Cass'], names: ['Vic', 'Cass', 'Cass Zhang'] });
    expect(heroPhotoEntry(state, 'a.jpg').identifiedCharacters).toEqual(['Vic', 'Cass', 'Cass Zhang']);
    expect(markWriterInPhoto(['Cass'], { theme: 'journalist', sessionConfig: { reportingMode: 'on-site', journalistFirstName: 'Cass' }, rosterNames: ['Cass Zhang'] }))
      .toEqual(['Cass']);
  });

  it('marks nothing in a remote session', () => {
    const state = photoState({ reportingMode: 'remote', names: ['Vic', 'Rhea', 'Nova'] });
    expect(heroPhotoEntry(state, 'a.jpg').identifiedCharacters).toEqual(['Vic', 'Rhea', 'Nova']);
    expect(buildAvailablePhotos(state, 'b.jpg', null)[0].identifiedCharacters).toEqual(['Vic', 'Rhea', 'Nova']);
  });
});

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

// Final fix wave (K2): one rule for the reporting mode. The mode block read anything but
// 'remote' as on site, the photo calls and marks anything but 'on-site' as remote, so a
// session with no mode stamped got the on-site block and remote photos. isOnSite is the one
// rule, the mode block's: on site unless the mode is 'remote'.
describe('one rule for the reporting mode (K2)', () => {
  const { isOnSite, reportingModeOf } = require('../prompt-renderers/session-authors');
  const { buildReportingModeBlock } = require('../prompt-builder');

  it('is on site unless the mode is remote', () => {
    expect(isOnSite({ reportingMode: 'on-site' })).toBe(true);
    expect(isOnSite({ reportingMode: 'remote' })).toBe(false);
    expect(isOnSite({})).toBe(true);
    expect(isOnSite(null)).toBe(true);
    expect(reportingModeOf({})).toBe('on-site');
    expect(reportingModeOf({ reportingMode: 'remote' })).toBe('remote');
  });

  it('gives the mode block, the photo line and the photo marks the same reading of a session with no mode', () => {
    const noMode = { journalistFirstName: 'Rhea' };
    expect(buildReportingModeBlock(noMode, 'journalist')).toBe(buildReportingModeBlock({ reportingMode: 'on-site' }, 'journalist'));
    expect(writerInPhotosLine('journalist', noMode)).toBe(writerInPhotosLine('journalist', { ...noMode, reportingMode: 'on-site' }));
    expect(writerInPhotosLine('journalist', noMode)).not.toBeNull();
    expect(markWriterInPhoto(['Rhea'], { theme: 'journalist', sessionConfig: noMode }))
      .toEqual(markWriterInPhoto(['Rhea'], { theme: 'journalist', sessionConfig: { ...noMode, reportingMode: 'on-site' } }));
    expect(markWriterInPhoto(['Rhea'], { theme: 'journalist', sessionConfig: noMode })).not.toEqual(['Rhea']);
  });
});
