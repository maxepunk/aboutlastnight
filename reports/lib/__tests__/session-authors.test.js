/**
 * The article's authors, known to every stage (phases 14 and 15, brief E, seat 1; spec
 * section 5; rulings R4 and R5).
 *
 * - Nova's name for the session joins the roster section's Nova line (tested in
 *   prompt-builder-roster.test.js, beside the roster section's other lines).
 * - On site only, the character-IDs parse and the photo enrichment are told Nova's names
 *   beside the roster, and the photo entries mark a name for Nova as the article's writer.
 *   The roster decides a clash: a name a roster player has is that player.
 * - Each guest reporter, when the session has any (phase 17, R5): read apart through
 *   guestReportersOf, one line in SESSION_FACTS, the weave writer's first section and both
 *   judges, and a turn-in under each one's name marked on the timeline. With none, nothing
 *   new prints.
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
// K4: a name that already holds Nova's own name takes the shorter mark, so it does not repeat it
const MARKED_BY_NAME = (name) => `${name} (who writes this article)`;
const GUEST = { name: 'Dana Okafor', role: 'Contributing Reporter' };
const SECOND = { name: 'Remi Vale', role: 'Field Reporter' };
const DANA = { name: 'Dana Okafor', firstName: 'Dana', role: 'Contributing Reporter' };
const REMI = { name: 'Remi Vale', firstName: 'Remi', role: 'Field Reporter' };
const EXPOSURES = [
  { tokenId: 'ale003', exposer: 'Dana', time: '07:37 PM' },
  { tokenId: 'mor001', exposer: 'dana okafor', time: '07:40 PM' },
  { tokenId: 'sar002', exposer: 'Remi', time: '07:45 PM' }
];
// The read's section 14, word for word, for one reporter and for two
const GUEST_LINE = "The guest reporter: Dana Okafor (Contributing Reporter) shares this article's byline. " +
  'Each memory turned in under the name Dana Okafor or Dana is reporting Dana Okafor filed to Nova for this article.';
const TWO_LINE = "The guest reporters: Dana Okafor (Contributing Reporter) and Remi Vale (Field Reporter) share this article's byline. " +
  'Each memory turned in under the name Dana Okafor or Dana is reporting Dana Okafor filed to Nova for this article. ' +
  'Each memory turned in under the name Remi Vale or Remi is reporting Remi Vale filed to Nova for this article.';

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
      .toEqual(['Vic', MARKED('rhea'), MARKED_BY_NAME('Nova')]);
    expect(heroPhotoEntry(state, 'a.jpg').identifiedCharacters).toEqual(['Vic', MARKED('rhea'), MARKED_BY_NAME('Nova')]);
  });

  // Final fix wave (K4): "Nova (Nova, who writes this article)" repeated the name. A name that
  // is Nova's own, alone or with the first name, takes the theme's shorter mark; the first name
  // alone keeps the mark that names Nova.
  it("marks Nova's own name without repeating it", () => {
    const context = { theme: 'journalist', sessionConfig: { reportingMode: 'on-site', journalistFirstName: 'Rhea' } };
    expect(markWriterInPhoto(['Nova', 'Rhea Nova', 'Rhea', 'nova'], context))
      .toEqual(['Nova (who writes this article)', 'Rhea Nova (who writes this article)', 'Rhea (Nova, who writes this article)', 'nova (who writes this article)']);
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

// Phase 17 (R5): each guest reporter apart. guestReportersOf is the one reading: the parse's
// list, or an older thread's single {name, role}, its comma-joined names read apart and its
// roles paired by position. The line (the read's section 14) takes the writer's name from the
// theme's writer entry; the mark keeps its form, and a first name two reporters share marks
// neither.
describe('each guest reporter, when the session has any (R5)', () => {
  const { guestReportersOf } = require('../prompt-renderers/session-authors');
  const withGuests = (guestReporters) => {
    const base = reworkFixtureState('journalist');
    return { ...base, sessionConfig: { ...base.sessionConfig, guestReporters, exposures: EXPOSURES } };
  };
  const withOlderGuest = (guestReporter) => {
    const base = reworkFixtureState('journalist');
    return { ...base, sessionConfig: { ...base.sessionConfig, guestReporter, exposures: EXPOSURES } };
  };
  const BUNDLE = {
    exposed: { tokens: ['ale003', 'mor001', 'sar002'].map((id) => ({ id, rawData: { tokenId: id } })), paperEvidence: [] },
    buried: { transactions: [] }
  };

  describe('guestReportersOf', () => {
    it('is empty with none: a null config, no value, a null value, a blank name', () => {
      expect(guestReportersOf(null)).toEqual([]);
      expect(guestReportersOf({})).toEqual([]);
      expect(guestReportersOf({ guestReporter: null })).toEqual([]);
      expect(guestReportersOf({ guestReporter: { name: '  ', role: 'Guest Reporter' } })).toEqual([]);
      expect(guestReportersOf({ guestReporter: { role: 'Guest Reporter' } })).toEqual([]);
      expect(guestReportersOf({ guestReporters: [] })).toEqual([]);
      expect(guestReportersOf({ guestReporters: [{ name: ' ', role: 'Guest Reporter' }, null] })).toEqual([]);
    });

    it("reads the parse's list, each entry with its first name", () => {
      expect(guestReportersOf({ guestReporters: [GUEST, SECOND] })).toEqual([DANA, REMI]);
    });

    it('reads the list before an older value', () => {
      expect(guestReportersOf({ guestReporters: [SECOND], guestReporter: GUEST })).toEqual([REMI]);
      expect(guestReportersOf({ guestReporters: [], guestReporter: GUEST })).toEqual([]);
    });

    it('reads an older value with one name as one reporter', () => {
      expect(guestReportersOf({ guestReporter: GUEST })).toEqual([DANA]);
      expect(guestReportersOf({ guestReporter: { name: 'Dana' } })).toEqual([{ name: 'Dana', firstName: 'Dana', role: '' }]);
    });

    it('reads an older value with two names and two roles as two reporters, the roles paired by position', () => {
      expect(guestReportersOf({ guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Contributing Reporter, Field Reporter' } }))
        .toEqual([DANA, REMI]);
    });

    it('gives each of two names the one role when there is one', () => {
      expect(guestReportersOf({ guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Guest Reporter' } })).toEqual([
        { name: 'Dana Okafor', firstName: 'Dana', role: 'Guest Reporter' },
        { name: 'Remi Vale', firstName: 'Remi', role: 'Guest Reporter' }
      ]);
    });

    it('keeps the role whole for one name whose role holds a comma', () => {
      expect(guestReportersOf({ guestReporter: { name: 'Dana Okafor', role: ' Reporter, Editor ' } }))
        .toEqual([{ name: 'Dana Okafor', firstName: 'Dana', role: 'Reporter, Editor' }]);
    });

    it('collapses whitespace and drops blank pieces', () => {
      expect(guestReportersOf({ guestReporter: { name: '  Dana   Okafor ,, ,  Remi\tVale ', role: ' Guest Reporter ' } })).toEqual([
        { name: 'Dana Okafor', firstName: 'Dana', role: 'Guest Reporter' },
        { name: 'Remi Vale', firstName: 'Remi', role: 'Guest Reporter' }
      ]);
      expect(guestReportersOf({ guestReporters: [{ name: '  Remi   Vale ', role: ' Field Reporter ' }] })).toEqual([REMI]);
    });
  });

  describe('the line', () => {
    it('names one reporter, whose turn-ins are reporting they filed to the writer', () => {
      expect(guestReporterLine({ guestReporters: [GUEST] }, 'journalist')).toBe(GUEST_LINE);
      expect(guestReporterLine({ guestReporter: GUEST }, 'journalist')).toBe(GUEST_LINE);
    });

    it('names two reporters, then one sentence for each', () => {
      expect(guestReporterLine({ guestReporters: [GUEST, SECOND] }, 'journalist')).toBe(TWO_LINE);
      expect(guestReporterLine({ guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Contributing Reporter, Field Reporter' } }, 'journalist'))
        .toBe(TWO_LINE);
    });

    it('joins three names as "A, B and C"', () => {
      const line = guestReporterLine({ guestReporters: [GUEST, SECOND, { name: 'Kit Arden', role: '' }] }, 'journalist');
      expect(line.startsWith("The guest reporters: Dana Okafor (Contributing Reporter), Remi Vale (Field Reporter) and Kit Arden share this article's byline. "))
        .toBe(true);
      expect(line.endsWith('Each memory turned in under the name Kit Arden or Kit is reporting Kit Arden filed to Nova for this article.')).toBe(true);
    });

    it('prints a one-word name once, and no parentheses with no role', () => {
      expect(guestReporterLine({ guestReporters: [{ name: 'Dana', role: '' }] }, 'journalist'))
        .toBe("The guest reporter: Dana shares this article's byline. Each memory turned in under the name Dana is reporting Dana filed to Nova for this article.");
    });

    it('names no first name two reporters share, as the mark marks neither', () => {
      expect(guestReporterLine({ guestReporters: [GUEST, { name: 'Dana Vale', role: '' }] }, 'journalist')).toBe(
        "The guest reporters: Dana Okafor (Contributing Reporter) and Dana Vale share this article's byline. " +
        'Each memory turned in under the name Dana Okafor is reporting Dana Okafor filed to Nova for this article. ' +
        'Each memory turned in under the name Dana Vale is reporting Dana Vale filed to Nova for this article.'
      );
    });

    it('is null with no guest reporter, or with no writer entry in the theme', () => {
      expect(guestReporterLine({ guestReporter: null }, 'journalist')).toBeNull();
      expect(guestReporterLine({}, 'journalist')).toBeNull();
      expect(guestReporterLine({ guestReporters: [] }, 'journalist')).toBeNull();
      expect(guestReporterLine({ guestReporter: { name: '  ', role: 'Guest Reporter' } }, 'journalist')).toBeNull();
      expect(guestReporterLine(null, 'journalist')).toBeNull();
      expect(guestReporterLine({ guestReporters: [GUEST] }, 'detective')).toBeNull();
      expect(guestReporterLine({ guestReporters: [GUEST] })).toBeNull();
    });
  });

  it('joins SESSION_FACTS for the map and article writers, and nothing prints with none', () => {
    for (const [state, line] of [[withGuests([GUEST]), GUEST_LINE], [withGuests([GUEST, SECOND]), TWO_LINE], [withOlderGuest(GUEST), GUEST_LINE]]) {
      const builder = new PromptBuilder(null, 'journalist', state.sessionConfig, state.canonicalCharacters, null);
      expect(builder._sessionFactsSection(buildSessionFacts(state))).toContain(line);
    }
    for (const none of [withGuests([]), withOlderGuest(null)]) {
      const builder = new PromptBuilder(null, 'journalist', none.sessionConfig, none.canonicalCharacters, null);
      expect(buildSessionFacts(none)).not.toHaveProperty('guestReporterLine');
      expect(builder._sessionFactsSection(buildSessionFacts(none))).not.toContain('guest reporter');
    }
  });

  it("joins the weave writer's first section, beside the session roster", () => {
    for (const [state, line] of [[withGuests([GUEST]), GUEST_LINE], [withGuests([GUEST, SECOND]), TWO_LINE], [withOlderGuest(GUEST), GUEST_LINE]]) {
      const sections = buildWeaveSections(state);
      const section1 = sections.slice(sections.indexOf('## SECTION 1'), sections.indexOf('## SECTION 2'));
      expect(section1).toContain(line);
    }
    expect(buildWeaveSections(withGuests([]))).not.toContain('The guest reporter');
    expect(buildWeaveSections(withOlderGuest(null))).not.toContain('The guest reporter');
  });

  it('reaches both judges beside the session roster', () => {
    for (const phase of ['arcs', 'article']) {
      expect(buildEvaluationUserPrompt(phase, withGuests([GUEST]), { factCheck: null })).toContain(GUEST_LINE);
      expect(buildEvaluationUserPrompt(phase, withGuests([GUEST, SECOND]), { factCheck: null })).toContain(TWO_LINE);
      expect(buildEvaluationUserPrompt(phase, withGuests([]), { factCheck: null })).not.toContain('The guest reporter');
      expect(buildEvaluationUserPrompt(phase, withOlderGuest(null), { factCheck: null })).not.toContain('The guest reporter');
    }
  });

  it("gives the fact check's head count each reporter apart, an older value too", () => {
    const { buildFactCheckArgs } = evalTesting;
    expect(buildFactCheckArgs(withGuests([GUEST, SECOND])).guestReporters).toEqual([DANA, REMI]);
    expect(buildFactCheckArgs(withOlderGuest({ name: 'Dana Okafor, Remi Vale', role: 'Contributing Reporter, Field Reporter' })).guestReporters)
      .toEqual([DANA, REMI]);
    expect(buildFactCheckArgs(withOlderGuest(null)).guestReporters).toEqual([]);
    expect(buildFactCheckArgs(withOlderGuest(null))).not.toHaveProperty('guestReporter');
  });

  describe('the mark', () => {
    it("marks a turn-in under each reporter's full name or first name, in any case", () => {
      const config = { guestReporters: [GUEST, SECOND] };
      expect(guestTurnInName('Dana', config)).toBe('Dana (the guest reporter, Dana Okafor)');
      expect(guestTurnInName('dana okafor', config)).toBe('dana okafor (the guest reporter)');
      expect(guestTurnInName('Remi', config)).toBe('Remi (the guest reporter, Remi Vale)');
      expect(guestTurnInName('REMI VALE', config)).toBe('REMI VALE (the guest reporter)');
      expect(guestTurnInName('Vic', config)).toBe('Vic');
      expect(guestTurnInName('Dana', { guestReporter: null })).toBe('Dana');
      expect(guestTurnInName('Dana', { guestReporters: [] })).toBe('Dana');
    });

    it('marks an older value as each reporter apart', () => {
      const config = { guestReporter: { name: 'Dana Okafor, Remi Vale', role: 'Contributing Reporter, Field Reporter' } };
      expect(guestTurnInName('Dana', config)).toBe('Dana (the guest reporter, Dana Okafor)');
      expect(guestTurnInName('Remi', config)).toBe('Remi (the guest reporter, Remi Vale)');
      expect(guestTurnInName('Remi Vale', config)).toBe('Remi Vale (the guest reporter)');
      expect(guestTurnInName('Dana Okafor, Remi Vale', config)).toBe('Dana Okafor, Remi Vale');
    });

    it('marks a guest who plays a roster character: the normal case', () => {
      const config = { roster: ['Vic', 'Dana'], guestReporters: [GUEST], exposures: [{ tokenId: 'ale003', exposer: 'Dana', time: '07:37 PM' }] };
      expect(guestTurnInName('Dana', config)).toBe('Dana (the guest reporter, Dana Okafor)');
      expect(renderMorningTimeline(BUNDLE, config)).toContain('document: ale003 | named: Dana (the guest reporter, Dana Okafor)');
    });

    it('leaves a first name two reporters share unmarked, while each full name marks', () => {
      const config = { guestReporters: [GUEST, { name: 'Dana Vale', role: '' }] };
      expect(guestTurnInName('Dana', config)).toBe('Dana');
      expect(guestTurnInName('dana', config)).toBe('dana');
      expect(guestTurnInName('Dana Okafor', config)).toBe('Dana Okafor (the guest reporter)');
      expect(guestTurnInName('Dana Vale', config)).toBe('Dana Vale (the guest reporter)');
    });

    it("marks each reporter's turn-ins on the timeline", () => {
      const timeline = renderMorningTimeline(BUNDLE, withGuests([GUEST, SECOND]).sessionConfig);
      expect(timeline).toContain('document: ale003 | named: Dana (the guest reporter, Dana Okafor)');
      expect(timeline).toContain('document: mor001 | named: dana okafor (the guest reporter)');
      expect(timeline).toContain('document: sar002 | named: Remi (the guest reporter, Remi Vale)');
      for (const none of [withGuests([]), withOlderGuest(null)]) {
        const plain = renderMorningTimeline(BUNDLE, none.sessionConfig);
        expect(plain).toContain('document: ale003 | named: Dana\n');
        expect(plain).not.toContain('guest reporter');
      }
    });
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

// Final fix wave (K3): one default first name for Nova. The theme's writer.defaultFirstName
// is the one source: the parse's stamp and the article writer's byline read it through
// writerFirstNameOf, and no other server file holds the name. The console's start form cannot
// import the server's theme, so it keeps its own copy, held equal here.
describe("one default first name for the article's writer (K3)", () => {
  const fs = require('fs');
  const path = require('path');
  const { writerFirstNameOf } = require('../prompt-renderers/session-authors');
  const { getThemeNPCEntries } = require('../theme-config');
  const REPORTS = path.join(__dirname, '..', '..');
  const DEFAULT = getThemeNPCEntries('journalist').find((entry) => entry && entry.writer).writer.defaultFirstName;

  it("gives the director's first name, else the theme's default, and none for a theme with no writer", () => {
    expect(writerFirstNameOf('journalist', '  Rhea ')).toBe('Rhea');
    expect(writerFirstNameOf('journalist', '')).toBe(DEFAULT);
    expect(writerFirstNameOf('journalist', undefined)).toBe(DEFAULT);
    expect(writerFirstNameOf('detective', undefined)).toBeNull();
  });

  it('is held by the theme alone among the server files that stamp or print it', () => {
    for (const file of ['lib/prompt-builder.js', 'lib/workflow/nodes/input-nodes.js', 'lib/workflow/nodes/ai-nodes.js']) {
      expect([file, fs.readFileSync(path.join(REPORTS, file), 'utf8').includes(`'${DEFAULT}'`)]).toEqual([file, false]);
    }
  });

  it("matches the console's start form: its stamp, its placeholder and its help line", () => {
    const source = fs.readFileSync(path.join(REPORTS, 'console', 'components', 'SessionStart.js'), 'utf8');
    expect(source).toMatch(/raw\.journalistFirstName = reporterName\.trim\(\) \|\| '([^']+)'/);
    expect(source.match(/raw\.journalistFirstName = reporterName\.trim\(\) \|\| '([^']+)'/)[1]).toBe(DEFAULT);
    expect(source.match(/placeholder: '([^']+)',\s*value: reporterName/)[1]).toBe(DEFAULT);
    expect(source.match(/'Leave blank for default \((\S+) Nova\)'/)[1]).toBe(DEFAULT);
  });

  it('stamps the default at the parse when the start form gives none', () => {
    const source = fs.readFileSync(path.join(REPORTS, 'lib', 'workflow', 'nodes', 'input-nodes.js'), 'utf8');
    expect(source).toMatch(/result\.journalistFirstName = writerFirstNameOf\(/);
  });
});
