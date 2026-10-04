/**
 * PromptBuilder Unit Tests
 */

const { PromptBuilder, createPromptBuilder } = require('../prompt-builder');
const { ThemeLoader, PHASE_REQUIREMENTS } = require('../theme-loader');
// Phase 4 (brief 4.6): the outline writer is the map writer, which reads the settled weave
// first, as its task (lib/prompt-renderers/settled-weave.js).
const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
const { WEAVE: FIXTURE_WEAVE } = require('./fixtures/rework-state');
const SETTLED_WEAVE = renderSettledWeave(FIXTURE_WEAVE, null);
/** The director's note from the story meeting: a standing note, so <DIRECTOR_GUIDANCE> prints. */
const MEETING_NOTES = [{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Lead with the money.', at: '2026-10-03T09:00:00.000Z' }];

// Mock ThemeLoader
jest.mock('../theme-loader', () => {
  const actual = jest.requireActual('../theme-loader');
  return {
    ...actual,
    createThemeLoader: jest.fn(() => ({
      loadPhasePrompts: jest.fn(),      validate: jest.fn()
    }))
  };
});

describe('PromptBuilder', () => {
  let mockThemeLoader;
  let builder;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock theme loader
    mockThemeLoader = {
      loadPhasePrompts: jest.fn(),      validate: jest.fn()
    };

    builder = new PromptBuilder(mockThemeLoader);
  });

  describe('constructor', () => {
    it('should store theme loader reference', () => {
      expect(builder.theme).toBe(mockThemeLoader);
    });

    it('should accept sessionConfig as optional third parameter', () => {
      const sessionConfig = { reportingMode: 'remote', journalistFirstName: 'Cassandra' };
      const b = new PromptBuilder(mockThemeLoader, 'journalist', sessionConfig);
      expect(b.sessionConfig).toEqual(sessionConfig);
    });

    it('should default sessionConfig to empty object when not provided', () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist');
      expect(b.sessionConfig).toEqual({});
    });
  });

  // Phase 4 (brief 4.6): the outline writer is the map writer. It reads the settled weave
  // first, as its task; the selected arcs and the hero line went with the arc selection,
  // and the detective's outline with R1.
  describe('buildOutlinePrompt', () => {
    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'section-rules': 'Lede must hook...',
        'editorial-design': 'Mix photo and evidence...',
        'narrative-structure': 'Build arcs...',
        'formatting': 'Use specific classes...',
        'evidence-boundaries': 'Only quote exposed...'
      });
    });

    it('should return system and user prompts', async () => {
      const result = await builder.buildOutlinePrompt(SETTLED_WEAVE);

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    // Phase 3 (3.2): the journalist outline writer reads the rule set, never the
    // retired craft files.
    it('loads no craft file: the journalist reads the rule set', async () => {
      await builder.buildOutlinePrompt(SETTLED_WEAVE);

      expect(mockThemeLoader.loadPhasePrompts).not.toHaveBeenCalled();
    });

    it('should carry the world and the truth rules in the system prompt', async () => {
      const { systemPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE);

      expect(systemPrompt).toContain('<world>');
      expect(systemPrompt).toContain('<truth-rules>');
      expect(systemPrompt).not.toContain('Lede must hook');
    });

    it("reads the settled weave first, as its task, then the task and the theme's slots", async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE);

      expect(userPrompt.startsWith(`${SETTLED_WEAVE}\n`)).toBe(true);
      expect(userPrompt.indexOf("Lay the settled weave above across the article's sections"))
        .toBeGreaterThan(userPrompt.indexOf('</SETTLED_WEAVE>'));
      const slots = userPrompt.slice(userPrompt.indexOf('<SLOTS>'), userPrompt.indexOf('</SLOTS>'));
      expect(slots).toContain('- lede: no heading');
      expect(slots).toContain('- theStory: The Story');
      expect(slots).toContain('- closing: no heading');
      expect(userPrompt).not.toContain('SELECTED ARCS');
      expect(userPrompt).not.toContain('<arc-metadata>');
    });

    it('refuses to lay out a map without a settled weave: the story meeting settles it', async () => {
      await expect(builder.buildOutlinePrompt('')).rejects.toThrow('The map writer reads the settled weave first');
    });

    it("lists code's pick for the top photo first, marked, then every other photo the director kept", async () => {
      const photos = [
        { filename: 'hero.png', identifiedCharacters: ['Alex'], hero: true },
        { filename: 'p2.png', identifiedCharacters: [] }
      ];
      const { userPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE, photos);

      const list = userPrompt.slice(userPrompt.indexOf('<available-photos>'), userPrompt.indexOf('</available-photos>'));
      expect(list).toContain('1. [hero image] hero.png: Alex');
      expect(list).toContain('2. p2.png: Unknown');
      expect(userPrompt).not.toContain('HERO IMAGE:');
    });

    // Phase 3 (3.2; M27): the outline's shape is its schema's alone; the prompt no longer
    // restates it in its own words. Fix 3.2b (finding 10): the prompt embeds that one
    // schema under <SCHEMA>, as the article writer embeds the content-bundle schema, a
    // backstop for the SDK channel (#277). It sits after the data and before the craft
    // files. Phase 4 (brief 4.6): the schema is the theme's map schema, the map's shape
    // with the theme's slots.
    it("embeds the theme's map schema under a <SCHEMA> tag, and restates the shape nowhere else", async () => {
      const { mapSchemaFor } = require('../map');
      const { userPrompt } = await builder.buildOutlinePrompt(
        SETTLED_WEAVE, [], [], { roster: ['Alex Reeves'], accusation: 'Alex', playerCount: 1 }
      );

      const printed = JSON.stringify(mapSchemaFor('journalist'), null, 2);
      expect(userPrompt.split(printed).length - 1).toBe(1);
      const schemaBlock = userPrompt.slice(userPrompt.indexOf('\n<SCHEMA>\n'), userPrompt.indexOf('\n</SCHEMA>\n'));
      expect(schemaBlock).toContain(printed);
      expect(userPrompt.indexOf('\n<SCHEMA>\n')).toBeGreaterThan(userPrompt.indexOf('</SESSION_FACTS>'));
      // The craft files open on their own lines; the map's task names their tags in prose.
      expect(userPrompt.indexOf('\n</SCHEMA>\n')).toBeLessThan(userPrompt.indexOf('\n<craft-'));
      const outsideSchema = userPrompt.replace(/<SCHEMA>[\s\S]*?<\/SCHEMA>/g, '');
      expect(outsideSchema).not.toContain('Return JSON with the following structure');
      expect(outsideSchema).not.toContain('"followTheMoney": {');
    });

    it('the detective has no map writer: its outline prompt fails loud (R1)', async () => {
      const detective = new PromptBuilder(mockThemeLoader, 'detective', {});
      await expect(detective.buildOutlinePrompt(SETTLED_WEAVE)).rejects.toThrow('The "detective" theme has no story map');
    });
  });

  describe('buildArticlePrompt', () => {
    const mockOutline = {
      lede: { hook: 'Something is rotten...' },
      theStory: { arcs: [] }
    };

    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': 'Be NovaGlade...',
        'writing-principles': 'Show dont tell...',
        'evidence-boundaries': 'Only exposed...',
        'section-rules': 'Lede hooks...',
        'narrative-structure': 'Build arcs...',
        'formatting': 'Use classes...',
        'anti-patterns': 'No em-dashes...',
        'editorial-design': 'Mix media...'
      });
    });

    it('should return system and user prompts', async () => {
      const result = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    // Phase 3 (3.2): the journalist article writer reads the rule set, never the
    // retired craft files.
    it('loads no craft file: the journalist reads the rule set', async () => {
      await builder.buildArticlePrompt(
        mockOutline
      );

      expect(mockThemeLoader.loadPhasePrompts).not.toHaveBeenCalled();
    });

    it('should carry the voice craft file in the user prompt', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('<craft-voice>');
      expect(userPrompt).not.toContain('Be NovaGlade');
    });

    it('should carry every article craft file in the user prompt', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      // Task 3.8: the eight craft files, grouped by the writer's job (spec section 8).
      ['story', 'form', 'material', 'voice', 'judgement', 'telling', 'cards', 'questions']
        .forEach((name) => expect(userPrompt).toContain(`<craft-${name}>`));
      expect(userPrompt).not.toContain('Show dont tell');
    });

    it('should include approved outline in user prompt', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('Something is rotten');
    });

    // Workaround for SDK constrained-decoding bug #277: embed the full schema in
    // the prompt so the model has an authoritative shape contract when the SDK
    // falls back to text output. Without this, the prose field descriptions are
    // the only spec the model sees, which has been brittle.
    it('embeds the content-bundle JSON schema under a <SCHEMA> tag', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('<SCHEMA>');
      expect(userPrompt).toContain('"$id": "content-bundle"');
      // Schema content should be present at the field level so the model
      // sees enum values and additionalProperties constraints, not just names.
      expect(userPrompt).toContain('"evidenceCards"');
      expect(userPrompt).toContain('"financialTracker"');
      expect(userPrompt).toContain('"additionalProperties": false');
      // Phase 3 (3.2; M24): the SDK issue note is a code comment now, not prompt text.
      expect(userPrompt).not.toContain('anthropics/claude-agent-sdk-typescript#277');
    });

    // Phase 3 (3.2): the em-dash house style is C4's, in craft-telling.
    it('should carry the telling craft file, where the em-dash house style lives', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('<craft-telling>');
    });

    it('journalist prompt names the six section slots', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('one of lede, the-story, follow-the-money, the-players, whats-missing or closing');
    });

    it('journalist prompt includes pullQuotes and financialTracker', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('pullQuotes');
      expect(userPrompt).toContain('financialTracker');
    });

    // Phase 3 (3.2; spec section 7): the fixed section table and every-arc-in-every-
    // section went; C2 and C16 say what stays.
    it('journalist prompt carries neither VISUAL_DISTRIBUTION nor ARC_FLOW', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).not.toContain('VISUAL_DISTRIBUTION');
      expect(userPrompt).not.toContain('ARC_FLOW');
    });

    // Phase 3 (3.2): the length is C4's (about 1,500 words), in craft-telling.
    it('journalist article prompt leaves the word target to C4', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        { lede: { hook: 'test' } }, null
      );
      const generationInstruction = userPrompt.split('<GENERATION_INSTRUCTION>')[1] || '';
      expect(generationInstruction).not.toContain('1000-1500 words');
      expect(userPrompt).toContain('<craft-telling>');
    });
  });

  describe('getPhaseRequirements', () => {
    // Phase 3 (3.2): keyed by theme; the journalist's writers list no craft file.
    it('should return the theme\'s requirements for a valid phase', () => {
      expect(builder.getPhaseRequirements('articleGeneration')).toEqual([]);
      const detective = new PromptBuilder(mockThemeLoader, 'detective');
      expect(detective.getPhaseRequirements('articleGeneration')).toEqual(PHASE_REQUIREMENTS.detective.articleGeneration);
    });

    it('should return empty array for unknown phase', () => {
      const reqs = builder.getPhaseRequirements('unknownPhase');
      expect(reqs).toEqual([]);
    });
  });

  describe('createPromptBuilder factory', () => {
    const { createThemeLoader } = require('../theme-loader');

    it('should create PromptBuilder with ThemeLoader', () => {
      const builder = createPromptBuilder();
      expect(builder).toBeInstanceOf(PromptBuilder);
    });

    it('should pass custom path to ThemeLoader (legacy string)', () => {
      createPromptBuilder('/custom/skill/path');
      expect(createThemeLoader).toHaveBeenCalledWith('/custom/skill/path');
    });

    it('should pass journalist options when no arg specified', () => {
      createPromptBuilder();
      expect(createThemeLoader).toHaveBeenCalledWith({ theme: 'journalist', customPath: undefined });
    });

    it('should pass theme options to ThemeLoader', () => {
      createPromptBuilder({ theme: 'detective' });
      expect(createThemeLoader).toHaveBeenCalledWith({ theme: 'detective', customPath: undefined });
    });

    it('should set themeName on builder when theme option given', () => {
      const b = createPromptBuilder({ theme: 'detective' });
      expect(b.themeName).toBe('detective');
    });

    it('should default themeName to journalist', () => {
      const b = createPromptBuilder();
      expect(b.themeName).toBe('journalist');
    });

    it('should pass sessionConfig to PromptBuilder', () => {
      const sessionConfig = { reportingMode: 'remote' };
      const b = createPromptBuilder({ theme: 'journalist', sessionConfig });
      expect(b.sessionConfig).toEqual(sessionConfig);
    });

    it('should default sessionConfig to empty object when not provided', () => {
      const b = createPromptBuilder({ theme: 'journalist' });
      expect(b.sessionConfig).toEqual({});
    });
  });

  // Phase 4 (brief 4.7b; R1): the detective's article writer went with the old stages it
  // wrote from, its craft files' loading and their template variables with it: the parked
  // detective has no story map to write an article from. Its skill folder, templates and
  // theme config stay, the worked example of a second theme.
  describe('the parked detective (R1)', () => {
    it('has no article writer: its article prompts fail loud, naming the theme, and load no craft file', async () => {
      const detective = new PromptBuilder(mockThemeLoader, 'detective', {});
      await expect(detective.buildArticleSystemPrompt()).rejects.toThrow('The "detective" theme has no story map');
      await expect(detective.buildArticleUserSections({ sections: [] })).rejects.toThrow('The "detective" theme has no story map');
      await expect(detective.buildArticlePrompt({ sections: [] })).rejects.toThrow('The "detective" theme has no story map');
      expect(mockThemeLoader.loadPhasePrompts).not.toHaveBeenCalled();
    });
  });

  // Phase 3 (3.2): the stages are the world's and T7's, in the system prompt, the
  // same in both modes. The <TEMPORAL_DISCIPLINE> blocks restated them (and the
  // article's said memories went to "the Detective"); they went.
  describe('the stages (the world and T7)', () => {
    const stagesFor = async (reportingMode, which) => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', { reportingMode });
      return which === 'outline'
        ? b.buildOutlinePrompt(SETTLED_WEAVE)
        : b.buildArticlePrompt({ sections: [] }, 'hero.jpg');
    };

    it.each(['outline', 'article'])('the %s system prompt says the party was last night and the investigation this morning', async (which) => {
      const { systemPrompt, userPrompt } = await stagesFor('on-site', which);
      expect(systemPrompt).toContain('**The party** happened last night');
      expect(systemPrompt).toContain('**The investigation** is the game itself, this morning');
      expect(userPrompt).not.toContain('<TEMPORAL_DISCIPLINE>');
      expect(systemPrompt).not.toContain('the game session');
    });

    it('the world and the truth rules are the same in both modes; only the mode block differs', async () => {
      const remote = (await stagesFor('remote', 'article')).systemPrompt;
      const onSite = (await stagesFor('on-site', 'article')).systemPrompt;
      const core = (text) => text.slice(text.indexOf('<world>'), text.indexOf('</truth-rules>'));
      expect(core(remote)).toBe(core(onSite));
      expect(core(remote)).not.toContain('physically present');
    });
  });

  describe('byline generation instruction', () => {
    it('should include byline instruction in journalist article prompt', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {
        journalistFirstName: 'Cassandra',
        guestReporter: null
      });

      const { userPrompt } = await builder.buildArticlePrompt(
        { sections: [] }, 'hero.jpg'
      );

      expect(userPrompt).toContain('"byline"');
      expect(userPrompt).toContain('"author"');
      expect(userPrompt).toContain('Cassandra Nova | NovaNews');
    });

    it('should include guest reporter in byline when present', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {
        journalistFirstName: 'Cassandra',
        guestReporter: { name: 'Ashe Motoko', role: 'Guest Reporter' }
      });

      const { userPrompt } = await builder.buildArticlePrompt(
        { sections: [] }, 'hero.jpg'
      );

      expect(userPrompt).toContain('Ashe Motoko');
      expect(userPrompt).toContain('Guest Reporter');
    });
  });

  describe('financial summary in prompts', () => {
    it('buildOutlinePrompt should include FINANCIAL_SUMMARY when shellAccounts provided', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const shellAccounts = [
        { name: 'Cayman', total: 1455000, tokenCount: 9 },
        { name: 'Sarah', total: 350000, tokenCount: 1 }
      ];

      const { userPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE, [], shellAccounts);

      expect(userPrompt).toContain('FINANCIAL_SUMMARY');
      expect(userPrompt).toContain('Cayman');
      expect(userPrompt).toContain('$1,455,000');
      expect(userPrompt).toContain('$350,000');
    });

    it('should not include FINANCIAL_SUMMARY when shellAccounts empty', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE, [], []);

      expect(userPrompt).not.toContain('FINANCIAL_SUMMARY');
    });

    it('buildArticlePrompt should include FINANCIAL_SUMMARY when shellAccounts provided', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const shellAccounts = [
        { name: 'Cayman', total: 1455000, tokenCount: 9 },
        { name: 'Sarah', total: 350000, tokenCount: 1 }
      ];

      const { userPrompt } = await builder.buildArticlePrompt(
        { lede: { hook: 'Hook' } }, 'hero.jpg', shellAccounts
      );

      expect(userPrompt).toContain('FINANCIAL_SUMMARY');
      expect(userPrompt).toContain('Cayman');
      expect(userPrompt).toContain('$1,455,000');
      expect(userPrompt).toContain('$350,000');
      // Phase 3 (3.2): the figures' provenance, in place of "DETERMINISTIC".
      expect(userPrompt).toContain('figures code computed from the session report');
    });

    it('buildArticlePrompt should not include FINANCIAL_SUMMARY when shellAccounts empty', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await builder.buildArticlePrompt(
        { lede: { hook: 'Hook' } }, 'hero.jpg', []
      );

      expect(userPrompt).not.toContain('FINANCIAL_SUMMARY');
    });

    it('should filter out shellAccounts with zero total', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const shellAccounts = [
        { name: 'Cayman', total: 1455000, tokenCount: 9 },
        { name: 'EmptyAccount', total: 0, tokenCount: 0 }
      ];

      const { userPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE, [], shellAccounts);

      expect(userPrompt).toContain('Cayman');
      expect(userPrompt).not.toContain('EmptyAccount');
    });

    it('should include total buried amount', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const shellAccounts = [
        { name: 'Cayman', total: 1455000, tokenCount: 9 },
        { name: 'Sarah', total: 350000, tokenCount: 1 }
      ];

      const { userPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE, [], shellAccounts);

      expect(userPrompt).toContain('$1,805,000');
    });
  });

  describe('module exports', () => {
    it('should export PromptBuilder class', () => {
      expect(PromptBuilder).toBeDefined();
      expect(typeof PromptBuilder).toBe('function');
    });

    it('should export createPromptBuilder factory', () => {
      expect(createPromptBuilder).toBeDefined();
      expect(typeof createPromptBuilder).toBe('function');
    });
  });

  describe('SESSION_FACTS injection in article prompt', () => {
    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': 'voice content',
        'evidence-boundaries': 'boundaries content',
        'narrative-structure': 'structure content',
        'anti-patterns': 'anti-patterns content',
        'section-rules': 'section rules',
        'formatting': 'formatting',
        'editorial-design': 'editorial design',
        'writing-principles': 'writing principles',
        'photo-analysis': 'photo analysis'
      });
    });

    it('should include SESSION_FACTS when sessionFacts provided', async () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await b.buildArticlePrompt(
        {}, // outline
        null, // heroImage
        [], // shellAccounts
        { // sessionFacts
          roster: ['Alex Reeves', 'Vic Kingsley', 'Sam Thorne'],
          accusation: 'Vic and Sam',
          playerCount: 3
        }
      );
      expect(userPrompt).toContain('<SESSION_FACTS>');
      expect(userPrompt).toContain('INVESTIGATION ROSTER (3 players)');
      expect(userPrompt).toContain('Alex Reeves');
      expect(userPrompt).toContain('Vic Kingsley');
      // Phase 3 (3.2): the agency rule rewritten (Blake acts in the room) and the head
      // count in T10's words (fix 3.2b, finding 7).
      expect(userPrompt).toContain('Only the 3 players above were at the investigation');
      expect(userPrompt).toContain('When the article counts the people at the investigation, it counts these 3 players.');
    });

    it('should omit SESSION_FACTS when sessionFacts is null', async () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await b.buildArticlePrompt(
        {}, null, [], null
      );
      expect(userPrompt).not.toContain('<SESSION_FACTS>');
    });
  });

  describe('INVESTIGATION_OBSERVATIONS injection in article prompt', () => {
    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': 'voice', 'evidence-boundaries': 'boundaries',
        'narrative-structure': 'structure', 'anti-patterns': 'anti-patterns',
        'section-rules': 'rules', 'formatting': 'formatting',
        'editorial-design': 'editorial', 'writing-principles': 'writing', 'photo-analysis': 'photo'
      });
    });

    it('should include INVESTIGATION_OBSERVATIONS when directorNotes has rawProse', async () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const directorNotes = {
        rawProse: 'Blake solicited Vic three times. Heated argument at the bar.',
        quotes: [],
        transactionReferences: [],
        postInvestigationDevelopments: [],
        whiteboard: { suspects: ['Vic'] }  // Should NOT be included
      };
      const { userPrompt } = await b.buildArticlePrompt(
        {}, null, [], null, directorNotes
      );
      expect(userPrompt).toContain('<INVESTIGATION_OBSERVATIONS>');
      expect(userPrompt).toContain('Blake solicited Vic three times');
      // Phase 3 (3.2): the header names what the notes are, and dates nothing to
      // "this morning"; T1 and the mode block say how the room's events reached Nova.
      expect(userPrompt).toContain("The director's notes on the session, as written");
      expect(userPrompt).not.toContain('What happened during the investigation this morning');
      // Whiteboard should NOT be in this section
      expect(userPrompt).not.toContain('suspects');
    });

    it('should omit INVESTIGATION_OBSERVATIONS when directorNotes is null', async () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await b.buildArticlePrompt(
        {}, null, [], null, null
      );
      expect(userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
    });

    it('should omit INVESTIGATION_OBSERVATIONS when rawProse is empty', async () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await b.buildArticlePrompt(
        {}, null, [], null, { rawProse: '', quotes: [], transactionReferences: [], postInvestigationDevelopments: [] }
      );
      expect(userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
    });
  });

  /**
   * Brief 1.3 — the previous stage's advisory findings reach the next writer.
   *
   * The outline evaluation's two warnings about frontloading were computed, logged
   * and then dropped; the article writer never saw them. They are suggestions, so
   * they travel as their own section and never as a must-fix.
   *
   * Phase 4 (brief 4.6): neither writer prints one now. The arc stage's went with the arc
   * selection (the map writer reads the settled weave), and the outline judge's with the
   * judge.
   */
  describe('SHOULD_CONSIDER (advisories carried forward from the previous stage)', () => {
    const ADVISORIES = ['The lede frontloads the verdict', 'Two arcs rest on the same document'];

    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': 'voice', 'evidence-boundaries': 'boundaries',
        'narrative-structure': 'structure', 'anti-patterns': 'anti-patterns',
        'section-rules': 'rules', 'formatting': 'formatting',
        'editorial-design': 'editorial', 'writing-principles': 'writing', 'photo-analysis': 'photo'
      });
    });

    it("prints none in the map writer's prompt", async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE, [], [], null, { shouldConsider: ADVISORIES });
      expect(userPrompt).not.toContain('SHOULD_CONSIDER');
      expect(userPrompt).not.toContain('- The lede frontloads the verdict');
    });

    // Phase 4 (brief 4.6): the outline judge, whose advisories these were, left the graph.
    it('prints none in the article prompt', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        {}, null, [], null, null, null, { shouldConsider: ADVISORIES }
      );
      expect(userPrompt).not.toContain('SHOULD_CONSIDER');
      expect(userPrompt).not.toContain('- The lede frontloads the verdict');
    });

    it('keeps <DIRECTOR_GUIDANCE> the last section of both prompts', async () => {
      const outline = await builder.buildOutlinePrompt(
        SETTLED_WEAVE, [], [], null, { shouldConsider: ADVISORIES, gateNotes: MEETING_NOTES }
      );
      const article = await builder.buildArticlePrompt(
        {}, null, [], null, null, null,
        { shouldConsider: ADVISORIES, directorGuidance: 'Lead with the money.' }
      );
      for (const { userPrompt } of [outline, article]) {
        expect(userPrompt).not.toContain('SHOULD_CONSIDER');
        expect(userPrompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
      }
    });
  });

  describe('generateRosterSection (Notion-derived)', () => {
    it('should use Notion-derived canonical characters directly', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonicalCharacters = {
        'Alex': 'Alex Reeves',
        'Vic': 'Vic Kingsley',
        'Sarah': 'Sarah Blackwood'
      };
      const result = generateRosterSection('journalist', canonicalCharacters);
      expect(result).toContain('Alex → Alex Reeves');
      expect(result).toContain('Vic → Vic Kingsley');
      expect(result).toContain('Sarah → Sarah Blackwood');
    });

    it('should return empty roster when no characters provided', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const result = generateRosterSection('journalist');
      expect(result).toContain('CANONICAL CHARACTER ROSTER');
      // No character entries since no hardcoded fallback
      expect(result).not.toContain('→');
    });

    it('should include character data when provided', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonicalCharacters = { 'Alex': 'Alex Reeves' };
      const characterData = {
        'Alex Reeves': { role: 'CEO', groups: ['Board'] }
      };
      const result = generateRosterSection('journalist', canonicalCharacters, characterData);
      expect(result).toContain('Alex → Alex Reeves');
      expect(result).toContain('Alex Reeves: Role: CEO | Member of: Board');
    });

    // Phase 3 (3.2; T9): a roster member with no captured pronoun prints "pronoun
    // not given", which the writer raises with the director.
    it('appends pronouns from rosterPronouns, and says when a roster member has none', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley', Sam: 'Sam Rivera' };
      const pronouns = { Vic: 'she/her' };
      const result = generateRosterSection('journalist', canonical, null, pronouns, ['Vic', 'Sam']);
      expect(result).toContain('Vic Kingsley (she/her)');
      expect(result).toContain('Sam Rivera (pronoun not given)');
    });

    it('says "pronoun not given" for every roster member when no pronoun map is given', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley' };
      const result = generateRosterSection('journalist', canonical, null, null, ['Vic']);
      expect(result).toContain('Vic Kingsley (pronoun not given)');
    });

    it('guesses no pronoun for a character off the roster (final fix wave)', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const result = generateRosterSection('journalist', { Vic: 'Vic Kingsley' });
      expect(result).toMatch(/- Vic → Vic Kingsley$/m);
    });

    it('detective theme omits the pronoun annotation entirely (X-6)', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley', Sam: 'Sam Rivera' };
      const pronouns = { Vic: 'she/her' };
      const result = generateRosterSection('detective', canonical, null, pronouns);
      expect(result).toContain('Vic → Vic Kingsley');
      expect(result).toContain('Sam → Sam Rivera');
      // No pronoun suffix on detective roster lines:
      expect(result).not.toContain('they/them');
      expect(result).not.toContain('she/her');
      expect(result).not.toMatch(/Vic Kingsley \(/);
      // Bare line — nothing trailing the full name (not even a stray space):
      expect(result).toMatch(/- Vic → Vic Kingsley$/m);
    });

    it('journalist theme still appends the pronoun annotation (X-6 does not regress F1)', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley' };
      const result = generateRosterSection('journalist', canonical, null, { Vic: 'she/her' });
      expect(result).toContain('Vic Kingsley (she/her)');
    });

    it('_rosterSection() returns the same string as the direct generateRosterSection call (CR-7)', () => {
      const { PromptBuilder, generateRosterSection } = require('../prompt-builder');
      const pb = new PromptBuilder(null, 'journalist');
      pb.canonicalCharacters = { Vic: 'Vic Kingsley' };
      pb.characterData = null;
      pb.sessionConfig = { rosterPronouns: { Vic: 'she/her' } };
      expect(pb._rosterSection()).toBe(
        generateRosterSection('journalist', pb.canonicalCharacters, pb.characterData, pb.sessionConfig.rosterPronouns)
      );
    });
  });

  describe('buildArticlePrompt — enriched director notes', () => {
    let builder;
    let mockThemeLoader;

    beforeEach(() => {
      jest.clearAllMocks();
      mockThemeLoader = {
        loadPhasePrompts: jest.fn().mockResolvedValue({
          'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
          'anti-patterns': '', 'section-rules': '', 'editorial-design': '', 'formatting': '',
          'writing-principles': ''
        }),        validate: jest.fn()
      };
      const sessionConfig = { reportingMode: 'on-site', journalistFirstName: 'Cassandra' };
      builder = new PromptBuilder(mockThemeLoader, 'journalist', sessionConfig);
    });

    const outline = { theStory: { arcs: [] } };

    it('injects rawProse inside <INVESTIGATION_OBSERVATIONS>', async () => {
      const directorNotes = {
        rawProse: 'I watched Alex and Sam in the corner.',
        quotes: [],
        transactionReferences: [],
        postInvestigationDevelopments: []
      };
      const { userPrompt } = await builder.buildArticlePrompt(outline, null, [], null, directorNotes, null);
      expect(userPrompt).toContain('<INVESTIGATION_OBSERVATIONS>');
      expect(userPrompt).toContain('I watched Alex and Sam in the corner.');
      expect(userPrompt).not.toContain('"behaviorPatterns"');
    });

    it('emits <QUOTE_BANK> when quotes present', async () => {
      const directorNotes = {
        rawProse: 'notes',
        quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
        transactionReferences: [],
        postInvestigationDevelopments: []
      };
      const { userPrompt } = await builder.buildArticlePrompt(outline, null, [], null, directorNotes, null);
      expect(userPrompt).toContain('<QUOTE_BANK>');
      expect(userPrompt).toContain('we had to act');
    });

    it('emits <TRANSACTION_LINKS> when links present', async () => {
      const directorNotes = {
        // A link prints only when the notes hold its observation (3.6b fix batch).
        rawProse: 'Kai paid Blake at the bar.',
        quotes: [],
        transactionReferences: [{
          excerpt: 'Kai paid Blake', linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }], confidence: 'high'
        }],
        postInvestigationDevelopments: []
      };
      const { userPrompt } = await builder.buildArticlePrompt(outline, null, [], null, directorNotes, null);
      expect(userPrompt).toContain('<TRANSACTION_LINKS>');
      // A buried memory's sale: account, amount and time, never its id (final fix wave).
      expect(userPrompt).toContain('amount: $450,000 | time: 09:40 PM');
      expect(userPrompt).not.toContain('tay004');
    });

    it('emits <EPILOGUE> with the director\'s sentence when the notes carry an epilogue (phase 3, 3.6)', async () => {
      // The block was <POST_INVESTIGATION_NEWS> and led with the enricher's headline;
      // it now prints the director's sentence as written, under the glossary's name.
      const directorNotes = {
        rawProse: 'notes. It has just been announced that Sarah is interim CEO.',
        quotes: [],
        transactionReferences: [],
        postInvestigationDevelopments: [{ headline: 'Sarah named interim CEO', detail: 'It has just been announced that Sarah is interim CEO.' }]
      };
      const { userPrompt } = await builder.buildArticlePrompt(outline, null, [], null, directorNotes, null);
      // The epilogue is its own block, apart from the notes, holding the director's sentence as written.
      expect(userPrompt).toMatch(/<EPILOGUE>[\s\S]*It has just been announced that Sarah is interim CEO\.[\s\S]*<\/EPILOGUE>/);
      expect(userPrompt).not.toContain('Sarah named interim CEO');
    });

    it('omits empty tags', async () => {
      const directorNotes = {
        rawProse: 'just prose here',
        quotes: [],
        transactionReferences: [],
        postInvestigationDevelopments: []
      };
      const { userPrompt } = await builder.buildArticlePrompt(outline, null, [], null, directorNotes, null);
      expect(userPrompt).not.toContain('<QUOTE_BANK>');
      expect(userPrompt).not.toContain('<TRANSACTION_LINKS>');
      expect(userPrompt).not.toContain('<EPILOGUE>');
    });

    it('handles null directorNotes gracefully', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(outline, null, [], null, null, null);
      expect(userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
    });
  });
});

/**
 * The outline writer sees the director's raw notes (phase 1, brief 1.5).
 *
 * <INVESTIGATION_OBSERVATIONS> reached the ARTICLE prompt only, so the planner
 * that decides what each section does, and which arc carries it, never read the
 * director's own account of the morning. Same section, same renderer, placed
 * with the data — <DIRECTOR_GUIDANCE> keeps the last word. Phase 4 (brief 4.6): the
 * planner is the map writer, and the notes follow its task and slots.
 */
describe('buildOutlinePrompt — the director\'s raw notes', () => {
  const { PromptBuilder } = require('../prompt-builder');

  const DIRECTOR_NOTES = {
    // Phase 3 (3.6): an epilogue item prints as the director's sentence, so the
    // sentence is in the notes.
    // The link's observation too (3.6b fix batch: a link prints only when the notes hold it).
    rawProse: 'Blake solicited Vic three times. Heated argument at the bar. Alex paid Blake. Sarah was named interim CEO after the investigation.',
    quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
    transactionReferences: [{
      excerpt: 'Alex paid Blake',
      linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }],
      confidence: 'high'
    }],
    postInvestigationDevelopments: [{ detail: 'Sarah was named interim CEO after the investigation.' }],
    whiteboard: { suspects: ['Vic'] }
  };

  function builder() {
    const themeLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'section-rules': 'SR', 'editorial-design': 'ED',
        'narrative-structure': 'NS', 'formatting': 'FM', 'evidence-boundaries': 'EB'
      }),
      validate: jest.fn()
    };
    return new PromptBuilder(themeLoader, 'journalist', { reportingMode: 'remote' });
  }

  const render = (options) => builder().buildOutlinePrompt(SETTLED_WEAVE, [], [], null, options);

  it('renders the section when the director wrote notes', async () => {
    const { userPrompt } = await render({ directorNotes: DIRECTOR_NOTES });
    expect(userPrompt).toContain('<INVESTIGATION_OBSERVATIONS>');
    expect(userPrompt).toContain('Blake solicited Vic three times');
    expect(userPrompt).toContain('we had to act');
    expect(userPrompt).toContain('amount: $450,000 | time: 09:40 PM');
    expect(userPrompt).not.toContain('tay004');
    expect(userPrompt).toContain('<EPILOGUE>');
    expect(userPrompt).toContain('- Sarah was named interim CEO after the investigation.');
  });

  it('places it after the task and the slots, before the photos, and leaves the guidance last', async () => {
    const { userPrompt } = await render({ directorNotes: DIRECTOR_NOTES, gateNotes: MEETING_NOTES });
    expect(userPrompt.indexOf('<INVESTIGATION_OBSERVATIONS>')).toBeGreaterThan(userPrompt.indexOf('</SLOTS>'));
    // The section opens on its own line; the map's task names the tag in prose.
    expect(userPrompt.indexOf('</INVESTIGATION_OBSERVATIONS>')).toBeLessThan(userPrompt.indexOf('\n<available-photos>\n'));
    expect(userPrompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('omits it when there are no notes, and when the prose is empty', async () => {
    expect((await render({})).userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
    expect((await render({ directorNotes: null })).userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
    expect((await render({ directorNotes: { rawProse: '' } })).userPrompt)
      .not.toContain('<INVESTIGATION_OBSERVATIONS>');
  });

  it('carries the whiteboard nowhere near it — that is Layer 3, and it has its own path', async () => {
    const { userPrompt } = await render({ directorNotes: DIRECTOR_NOTES });
    expect(userPrompt).not.toContain('suspects');
  });

  // Phase 3 (3.2): the <TEMPORAL_DISCIPLINE> block went (the world and T7 state the
  // stages). Phase 4 (brief 4.6): the outline's third-person line went with its task; the
  // map writes no prose, and names each beat's material (C2).
  it('the map writes no prose, and the prompt carries no first-person marker (integrator ruling, phase 1)', async () => {
    const { userPrompt } = await render({ directorNotes: null });
    const task = userPrompt.slice(userPrompt.indexOf('</SETTLED_WEAVE>'), userPrompt.indexOf('<SLOTS>'));
    expect(task).toContain('writes no prose');
    expect(userPrompt).not.toContain('"I watched"');
    expect(userPrompt).not.toContain('Nova was there');
  });
});

/**
 * Brief 2.1 — one record view in the outline and article writers.
 *
 * Each prompt carries <RECORD> once, in its data part: every exposed document in
 * full, labelled, and the buried memories as transactions only. The outline's
 * five-per-arc cap is gone (on 092026 the outline writer never saw 12 of the 37
 * documents the article writer used).
 *
 * Phase 4 (brief 4.6; R5): the per-arc sections that named each arc's documents and
 * kept code-cut excerpts went with the arc packages; the record is the writers' one
 * evidence section.
 */
describe('the record view in the outline and article prompts (brief 2.1)', () => {
  const { PromptBuilder, generateRosterSection } = require('../prompt-builder');
  const { DOCUMENT_POINTER } = require('../prompt-renderers/record-view');
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');

  const textOf = (id) => `${id.toUpperCase()} - 11:0${id.length}PM - the full memory of ${id}, "never" said aloud.`;
  const token = (id, owner) => ({
    id, sourceType: 'memory-token', owner: 'Derived Guess', summary: `summary of ${id}`,
    fullContent: textOf(id), content: textOf(id), temporalContext: 'PARTY',
    rawData: { tokenId: id, name: `${id.toUpperCase()} - name`, fullDescription: textOf(id), owners: [owner] }
  });
  const ARC_TOKENS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
  const PAPER_TEXT = 'Board minutes: the vote to sell BizAI passed four to one.';
  const evidenceBundle = {
    exposed: {
      tokens: [...ARC_TOKENS.map(id => token(id, 'Alex Reeves')), token('mar004', 'Marcus Blackwood')],
      paperEvidence: [{
        notionId: 'p1', name: 'Board minutes', basicType: 'Document', description: PAPER_TEXT,
        owners: [], id: 'p1', fullContent: PAPER_TEXT, sourceType: 'paper-evidence'
      }]
    },
    buried: {
      transactions: [
        { sourceType: 'memory-token', shellAccount: 'Melanie', amount: 75000, time: '07:50 PM', temporalContext: 'INVESTIGATION' },
        // A malformed buried item carrying what a buried item must never show.
        { tokenId: 'zzq001', owner: 'Quill Zebrowski', fullDescription: 'Quill saw the result.', shellAccount: 'Deez', amount: 225000, time: '08:00 PM' }
      ]
    }
  };
  // mar004 is in no arc; the record holds it as it holds every exposed document.
  const ALL_TEXTS = [...ARC_TOKENS, 'mar004'].map(textOf).concat(PAPER_TEXT);
  const count = (haystack, needle) => haystack.split(needle).length - 1;

  function builderFor(theme) {
    const themeLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'section-rules': 'SR', 'editorial-design': 'ED', 'narrative-structure': 'NS',
        'formatting': 'FM', 'evidence-boundaries': 'EB', 'character-voice': 'CV',
        'writing-principles': 'WP', 'anti-patterns': 'AP'
      }),
      validate: jest.fn()
    };
    return new PromptBuilder(themeLoader, theme, {});
  }
  const options = { evidenceBundle, directorGuidance: 'Lead with the money.' };
  const shellAccounts = [{ name: 'Melanie', total: 75000, tokenCount: 1 }];
  // Phase 4 (brief 4.6): the map writer's standing notes carry the director's last word.
  const outlineFor = (theme) => builderFor(theme).buildOutlinePrompt(
    SETTLED_WEAVE, [], shellAccounts, null, { evidenceBundle, gateNotes: MEETING_NOTES }
  );
  const articleFor = (theme) => builderFor(theme).buildArticlePrompt(
    { lede: {} }, 'hero.png', shellAccounts, null, null, null, options
  );

  function expectOneRecord(userPrompt) {
    // The section opens on its own line; the pointer lines mention <RECORD> in prose.
    expect(userPrompt.match(/^<RECORD>$/gm)).toHaveLength(1);
    expect(count(userPrompt, '</RECORD>')).toBe(1);
    // Every usable document in full, each exactly once: the view, never a second copy.
    for (const text of ALL_TEXTS) expect(count(userPrompt, text)).toBe(1);
    expect(userPrompt).toContain('<document id="m1" kind="memory" name="M1 - name" owner="Alex Reeves" layer="exposed">');
    expect(userPrompt).toContain('<document id="mar004" kind="memory" name="MAR004 - name" owner="Marcus Blackwood" layer="exposed">');
    expect(userPrompt).toContain('<document id="p1" kind="Document" name="Board minutes" layer="exposed">');
    expect(userPrompt).not.toContain('Derived Guess');
    // Buried memories: sales only, once, on the morning timeline (phase 3, 3.5: it
    // replaced <buried-transactions>; 07:50 PM is the first sale, so the evening clock
    // shows each time as morning), with no id, owner or text.
    expect(count(userPrompt, '<morning-timeline>\n')).toBe(1);
    expect(userPrompt).toContain('- 08:00 AM | sale | account: Deez | amount: $225,000');
    for (const secret of ['zzq001', 'Quill']) expect(userPrompt).not.toContain(secret);
    // The director's words keep the last word.
    expect(userPrompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  }

  it('the journalist outline holds the view once, with no per-arc lists and no five-per-arc cap', async () => {
    const { userPrompt } = await outlineFor('journalist');
    expectOneRecord(userPrompt);
    // Phase 4 (brief 4.6; R5): no package section and no code-cut excerpts.
    expect(userPrompt).not.toContain('<arc-evidence>');
    expect(userPrompt).not.toContain('Excerpts');
    expect(userPrompt).not.toContain('Full Content:');
    expect(userPrompt).not.toContain('For pull quotes');
    expect(userPrompt).not.toMatch(/with their \*\*fullContent\*\*/);
    // FINANCIAL_SUMMARY (account totals) stays beside the view's transactions (R2).
    expect(userPrompt).toContain('<FINANCIAL_SUMMARY>');
  });

  it('the journalist article holds the view once, inside <DATA_CONTEXT>, with no arc packages', async () => {
    const { userPrompt } = await articleFor('journalist');
    expectOneRecord(userPrompt);
    expect(userPrompt.indexOf('<DATA_CONTEXT>')).toBeLessThan(userPrompt.indexOf('<RECORD>'));
    expect(userPrompt.indexOf('</RECORD>')).toBeLessThan(userPrompt.indexOf('</DATA_CONTEXT>'));
    // Phase 3 (3.2): the card's text is copied from the document in <RECORD>. Phase 4
    // (brief 4.6; R5): the packages that named each arc's documents, excerpts and photos
    // went; the record is whole, and each photo's entry prints once, in PHOTOS.
    expect(userPrompt).not.toContain('ARC EVIDENCE PACKAGES');
    expect(userPrompt).not.toContain('EXCERPTS:');
    expect(userPrompt).not.toContain('ARC PHOTOS:');
    expect(userPrompt).not.toContain('use fullContent directly');
    expect(userPrompt).toContain(`"content" is copied from ${DOCUMENT_POINTER}`);
    expect(userPrompt).not.toContain('from arcEvidencePackages.evidenceItems[].fullContent');
  });

  // Phase 3 (3.2; T4): the tensions print as the director's sentences that name Blake
  // or the Valet. A note from before 3.6 that read an account's name as its holder
  // prints nothing, and an old blake-proximity note prints its observations, not its
  // generic narrativeNote. The filter is the arc writer's (directorTensionSentences,
  // fix 3.2b): only the sentences the notes hold word for word print, each once.
  const TENSION_NOTES = { rawProse: 'Blake pulled Vic aside at the bar. The Valet read the balances.' };

  it('prints the director\'s sentences about Blake, labelled, and drops the old account-name notes', async () => {
    const tensions = {
      tensions: [
        { type: 'named-account', narrativeNote: 'Mel used their own name for a burial account.' },
        { type: 'transparency-vs-burial', narrativeNote: 'Mel publicly demonstrated transparency.' },
        {
          type: 'blake-proximity',
          observations: ['Blake pulled Vic aside\n  at the bar.', 'The Valet read the balances.'],
          narrativeNote: 'Director observed multiple characters interacting with Blake.'
        }
      ]
    };
    const { userPrompt } = await builderFor('journalist').buildArticlePrompt(
      {}, null, [], null, TENSION_NOTES, tensions, { evidenceBundle }
    );
    const block = userPrompt.slice(userPrompt.indexOf('<NARRATIVE_TENSIONS>'), userPrompt.indexOf('</NARRATIVE_TENSIONS>'));
    expect(block).toBe(`<NARRATIVE_TENSIONS>\n${DERIVED_LABELS.narrativeTensions}\n- Blake pulled Vic aside at the bar.\n- The Valet read the balances.\n`);
    expect(block).not.toMatch(/Black Market|verified to respect|named-account|Director observed/);
  });

  it('prints a stored sentence only when the notes hold it word for word, and each once', async () => {
    const tensions = {
      tensions: [{
        type: 'blake-proximity',
        observations: ['Blake paid Vic.', 'The Valet read the balances.', 'The Valet read the balances.']
      }]
    };
    const { userPrompt } = await builderFor('journalist').buildArticlePrompt(
      {}, null, [], null, TENSION_NOTES, tensions, { evidenceBundle }
    );
    const block = userPrompt.slice(userPrompt.indexOf('<NARRATIVE_TENSIONS>'), userPrompt.indexOf('</NARRATIVE_TENSIONS>'));
    expect(block).toBe(`<NARRATIVE_TENSIONS>\n${DERIVED_LABELS.narrativeTensions}\n- The Valet read the balances.\n`);
    expect(userPrompt).not.toContain('Blake paid Vic.');
  });

  it('prints no tensions block when the thread has no notes to hold the sentences', async () => {
    const tensions = { tensions: [{ type: 'blake-proximity', observations: ['The Valet read the balances.'] }] };
    const { userPrompt } = await builderFor('journalist').buildArticlePrompt(
      {}, null, [], null, null, tensions, { evidenceBundle }
    );
    expect(userPrompt).not.toContain('<NARRATIVE_TENSIONS>');
  });

  it('prints no tensions block when only old account-name notes are stored', async () => {
    const tensions = { tensions: [{ type: 'named-account', narrativeNote: 'Mel used their own name for a burial account.' }] };
    const { userPrompt } = await builderFor('journalist').buildArticlePrompt(
      {}, null, [], null, null, tensions, { evidenceBundle }
    );
    expect(userPrompt).not.toContain('<NARRATIVE_TENSIONS>');
  });

  it('labels the character context as a model\'s extraction that the record overrules', () => {
    const out = generateRosterSection('journalist', { Alex: 'Alex Reeves' }, { 'Alex Reeves': { role: 'CEO' } });
    expect(out).toContain(`CHARACTER CONTEXT (${DERIVED_LABELS.characterContext}):`);
    expect(out).not.toContain('use for factual accuracy');
  });
});

/**
 * The director's words beside their parse, in the outline and article writers
 * (phase 2, brief 2.2): the full accusation with the charge, the input-review
 * corrections after the notes, each photo description word for word, and the
 * whiteboard connections under the arc writer's label.
 */
describe("buildOutlinePrompt / buildArticlePrompt — the director's words as record", () => {
  const { PromptBuilder } = require('../prompt-builder');

  const RAW_ACCUSATION = 'Six votes for an accidental overdose, in a final round that had already deadlocked 4 to 4 between Alex and Vic.';
  const OVERDOSE_FACTS = {
    roster: ['Alex Reeves', 'Vic Kingsley'],
    playerCount: 2,
    accusation: { verdictKind: 'overdose', accused: [], charge: 'Accidental overdose' },
    accusationText: RAW_ACCUSATION,
    whiteboard: { suspectsExplored: ['Vic'], connections: ['Vic -> Blake (paid)'], notes: [], namesFound: ['Vic', 'Blake'] }
  };
  const DIRECTOR_NOTES = {
    rawProse: 'Vic to Ashe: "If you ever want to turn, My company is very interesting."',
    quotes: [], transactionReferences: [], postInvestigationDevelopments: []
  };
  const CORRECTION = 'This was actually Blake -> Ashe, and what was said was my company would be very interested.';
  const PHOTO_7 = "Alex and Sam react to a memory they've just unlocked.";
  const PHOTO_DESCRIPTIONS = { 'aln092026 (7 of 9).jpg': PHOTO_7 };
  // Phase 3 (3.9): the article writer's photos as articleWriterInputs passes them (the
  // hero first), the filename in a different case from the description's key.
  const ARTICLE_PHOTOS = [
    { filename: 'hero.jpg', identifiedCharacters: ['Alex'], hero: true },
    { filename: 'AlN092026 (7 OF 9).JPG', identifiedCharacters: ['Alex', 'Sam'] }
  ];

  function builder(theme = 'journalist') {
    const themeLoader = {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'section-rules': 'SR', 'editorial-design': 'ED', 'narrative-structure': 'NS', 'formatting': 'FM',
        'evidence-boundaries': 'EB', 'character-voice': 'CV', 'anti-patterns': 'AP', 'writing-principles': 'WP'
      }),
      validate: jest.fn()
    };
    return new PromptBuilder(themeLoader, theme, {});
  }

  const outline = (facts, options = {}, theme) => builder(theme).buildOutlinePrompt(
    SETTLED_WEAVE,
    [{ filename: 'aln092026 (7 of 9).jpg', fullPath: 'p/aln092026 (7 of 9).jpg', identifiedCharacters: ['Alex', 'Sam'] },
     { filename: 'aln092026 (2 of 9).jpg', fullPath: 'p/aln092026 (2 of 9).jpg', identifiedCharacters: [] }], [], facts, options
  );
  const article = (facts, options = {}) => builder().buildArticlePrompt(
    {},
    'hero.jpg', [], facts, DIRECTOR_NOTES, null, options
  );
  const between = (text, open, close) => text.slice(text.indexOf(open), text.indexOf(close));

  describe('the accusation', () => {
    it("the outline carries the charge, no accused for a no-culprit verdict, and the director's words", async () => {
      const { userPrompt } = await outline(OVERDOSE_FACTS);
      const facts = between(userPrompt, '<SESSION_FACTS>', '</SESSION_FACTS>');
      expect(facts).toContain("ACCUSATION: none (the room's verdict names no culprit: an overdose)");
      expect(facts).toContain('CHARGE: Accidental overdose');
      expect(facts).toContain('<DIRECTOR_ACCUSATION>');
      expect(facts).toContain(RAW_ACCUSATION);
      expect(facts).not.toMatch(/ACCUSATION: Marcus/);
    });

    it('the article carries the same, from the same renderer', async () => {
      const { userPrompt } = await article(OVERDOSE_FACTS);
      const facts = between(userPrompt, '<SESSION_FACTS>', '</SESSION_FACTS>');
      expect(facts).toContain("ACCUSATION: none (the room's verdict names no culprit: an overdose)");
      expect(facts).toContain('CHARGE: Accidental overdose');
      expect(facts).toContain(RAW_ACCUSATION);
    });

    it('a culprit verdict names the accused and the charge', async () => {
      const facts = { ...OVERDOSE_FACTS, accusation: { verdictKind: 'culprit', accused: ['Vic', 'Sam'], charge: 'Murder' }, accusationText: null };
      const { userPrompt } = await article(facts);
      expect(userPrompt).toContain('ACCUSATION: Vic and Sam\nCHARGE: Murder');
      expect(userPrompt).not.toContain('<DIRECTOR_ACCUSATION>');
    });
  });

  describe('the input-review corrections', () => {
    it("follow the notes, labelled as the director's, and the notes are not rewritten", async () => {
      const renders = [
        () => outline(null, { directorNotes: DIRECTOR_NOTES, directorCorrections: [CORRECTION] }),
        () => article(null, { directorCorrections: [CORRECTION] })
      ];
      for (const render of renders) {
        const { userPrompt } = await render();
        const obs = between(userPrompt, '<INVESTIGATION_OBSERVATIONS>', '</INVESTIGATION_OBSERVATIONS>');
        expect(obs).toContain(DIRECTOR_NOTES.rawProse);
        expect(obs).toContain('<DIRECTOR_CORRECTIONS>');
        expect(obs).toContain(CORRECTION);
        expect(obs).toMatch(/director's own words and override the notes where the two differ/);
        expect(obs.indexOf('</DIRECTOR_NOTES>')).toBeLessThan(obs.indexOf('<DIRECTOR_CORRECTIONS>'));
      }
    });

    it('add nothing when the director sent none', async () => {
      const { userPrompt } = await article(null, { directorCorrections: [] });
      expect(userPrompt).not.toContain('<DIRECTOR_CORRECTIONS>');
    });
  });

  describe('the photo descriptions', () => {
    it("the outline lists each photo by filename, names and the director's description, word for word", async () => {
      const { userPrompt } = await outline(null, { photoDescriptions: PHOTO_DESCRIPTIONS });
      const photos = between(userPrompt, '<available-photos>', '</available-photos>');
      expect(photos).toContain(`1. aln092026 (7 of 9).jpg: Alex, Sam\n   The director's description, word for word: ${PHOTO_7}`);
      expect(photos).toContain("2. aln092026 (2 of 9).jpg: Unknown\n   The director's description: none given");
      expect(photos).not.toMatch(/Visual:|Characters:/);
    });

    // Phase 3 (3.9; T13): the article writer lists every photo the director kept under
    // PHOTOS, each entry once. Phase 4 (brief 4.6; R5): no arc package points at them.
    it("the article's photo list carries the description, joined by filename whatever the case", async () => {
      const { userPrompt } = await article(null, { photoDescriptions: PHOTO_DESCRIPTIONS, photos: ARTICLE_PHOTOS });
      const photos = between(userPrompt, '\nPHOTOS (', '<RECORD>');
      expect(photos).toContain(`1. [hero image] hero.jpg: Alex\n   The director's description: none given`);
      expect(photos).toContain(`2. AlN092026 (7 OF 9).JPG: Alex, Sam\n   The director's description, word for word: ${PHOTO_7}`);
      expect(userPrompt.split(PHOTO_7)).toHaveLength(2);
      expect(userPrompt).not.toContain('ARC PHOTOS:');
    });

    it('the article writer lists every photo it is given', async () => {
      const photos = [...ARTICLE_PHOTOS, { filename: 'aln092026 (9 of 9).jpg', identifiedCharacters: [] }];
      const { userPrompt } = await builder().buildArticlePrompt(
        {},
        'hero.jpg', [], null, DIRECTOR_NOTES, null, { photos }
      );
      const list = between(userPrompt, '\nPHOTOS (', '<RECORD>');
      expect(list).toContain('PHOTOS (every photo the director has not excluded, without the whiteboard');
      expect(list).toContain('3. aln092026 (9 of 9).jpg: Unknown');
    });
  });

  describe('the whiteboard', () => {
    // Phase 3 (3.5): labelled as a model's reading of the photo, context for how the
    // room reasoned, in place of "Players drew these during investigation".
    it("reaches the outline and article writers under the arc writer's label", async () => {
      for (const render of [() => outline(OVERDOSE_FACTS), () => article(OVERDOSE_FACTS)]) {
        const { userPrompt } = await render();
        expect(userPrompt).toContain("### The Whiteboard (a model's reading of the photo)");
        expect(userPrompt).not.toContain('Players drew these');
        expect(userPrompt).toContain('- no heading: Vic');
        expect(userPrompt).toContain('**Names on the whiteboard:** ["Vic","Blake"]');
      }
    });

    it('is left out when the whiteboard held nothing', async () => {
      const facts = { ...OVERDOSE_FACTS, whiteboard: { suspectsExplored: [], connections: [], notes: [], namesFound: [] } };
      const { userPrompt } = await article(facts);
      expect(userPrompt).not.toContain('The Whiteboard');
    });
  });
});

/**
 * Phase 3 (task 3.2): the outline and article writers read the rule set, and the
 * inline text it states or contradicts goes (spec 2026-09-30-rule-set.md, sections
 * 4, 5, 7 and 8; the integrator's placement ruling).
 *
 * The builder's theme loader throws if anything asks it for a file: a journalist
 * writer reads its rules from lib/rule-set.js, never from the retired craft files.
 */
describe('phase 3 (3.2): the journalist writers read the rule set', () => {
  const { loadRuleSet } = require('../rule-set');
  const { generateRosterSection } = require('../prompt-builder');
  const { instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');

  const CANONICAL = { Alex: 'Alex Reeves', Riley: 'Riley Torres', Jamie: 'Jamie Park', Marcus: 'Marcus Blackwood', Blake: 'Blake' };
  const SESSION = {
    roster: ['Alex', 'Riley'], rosterPronouns: { Alex: 'he/him' },
    reportingMode: 'remote', journalistFirstName: 'Cass'
  };
  const FACTS = {
    roster: ['Alex Reeves', 'Riley Torres'], playerCount: 2,
    accusation: { accused: ['Alex Reeves'], charge: 'Murder', verdictKind: 'culprit' },
    accusationText: 'They voted for Alex.'
  };
  const NOTES_NO_EPILOGUE = { rawProse: 'Alex and Riley argued by the ledger this morning.', quotes: [], transactionReferences: [], postInvestigationDevelopments: [] };
  const NOTES_EPILOGUE = {
    ...NOTES_NO_EPILOGUE,
    rawProse: `${NOTES_NO_EPILOGUE.rawProse} After the investigation, Riley left town.`,
    postInvestigationDevelopments: [{ detail: 'After the investigation, Riley left town.' }]
  };
  const ACCOUNTS = [
    { name: 'Ember', total: 250000, tokenCount: 2 },
    { name: 'Riley', total: 50000, tokenCount: 0 },
    { name: 'Empty', total: 0, tokenCount: 0 }
  ];

  const throwingLoader = () => ({
    loadPhasePrompts: jest.fn(async (phase) => { throw new Error(`a journalist writer asked the theme loader for ${phase}`); }),
    validate: jest.fn()
  });
  const journalist = (sessionConfig = SESSION) => new PromptBuilder(throwingLoader(), 'journalist', sessionConfig, CANONICAL, null);
  const outlineOf = (b) => b.buildOutlinePrompt(
    SETTLED_WEAVE, [], ACCOUNTS, FACTS, { directorNotes: NOTES_NO_EPILOGUE, gateNotes: MEETING_NOTES }
  );
  const articleOf = (b, notes = NOTES_NO_EPILOGUE) => b.buildArticlePrompt(
    { lede: { hook: 'h' } }, 'hero.jpg', ACCOUNTS, FACTS, notes, null, { directorGuidance: 'Lead with the money.' }
  );
  const between = (text, open, close) => text.slice(text.indexOf(open), text.indexOf(close) + close.length);

  describe('the rule sections', () => {
    it('the outline writer: the world and the truth rules in its system prompt, its craft (no voice) in its user prompt', async () => {
      const { core, craft } = loadRuleSet('outline');
      const { systemPrompt, userPrompt } = await outlineOf(journalist());
      expect(systemPrompt.split(core).length - 1).toBe(1);
      expect(userPrompt.split(craft).length - 1).toBe(1);
      expect(userPrompt).not.toContain('<craft-voice>');
      expect(userPrompt.indexOf(craft)).toBeGreaterThan(userPrompt.indexOf('</SESSION_FACTS>'));
      // Phase 4 (brief 4.6): the map's task names <DIRECTOR_GUIDANCE> in prose, so the
      // section is the last one.
      expect(userPrompt.indexOf(craft)).toBeLessThan(userPrompt.lastIndexOf('<DIRECTOR_GUIDANCE>'));
    });

    it('the article writer: the world and the truth rules in its system prompt, every craft file in its user prompt', async () => {
      const { core, craft } = loadRuleSet('article');
      const { systemPrompt, userPrompt } = await articleOf(journalist());
      expect(systemPrompt.split(core).length - 1).toBe(1);
      expect(userPrompt.split(craft).length - 1).toBe(1);
      expect(userPrompt).toContain('<craft-voice>');
      expect(userPrompt.indexOf(craft)).toBeGreaterThan(userPrompt.indexOf('</GENERATION_INSTRUCTION>'));
      expect(userPrompt.indexOf(craft)).toBeLessThan(userPrompt.indexOf('<DIRECTOR_GUIDANCE>'));
    });

    it('the mode block keeps its place, right after the identity line, before the world', async () => {
      for (const { systemPrompt } of [await outlineOf(journalist()), await articleOf(journalist())]) {
        expect(systemPrompt.split('\n')[2]).toBe('<mode-remote>');
        expect(systemPrompt.indexOf('</mode-remote>')).toBeLessThan(systemPrompt.indexOf('<world>'));
      }
    });

    it('the roster block is in the article system prompt once (M20)', async () => {
      const { systemPrompt, userPrompt } = await articleOf(journalist());
      expect(systemPrompt.split('CANONICAL CHARACTER ROSTER:').length - 1).toBe(1);
      expect(userPrompt).not.toContain('CANONICAL CHARACTER ROSTER:');
    });
  });

  describe('the removed lines', () => {
    const REMOVED = [
      'HOW THE BLACK MARKET WORKS', 'Blake now possesses', 'Black Market', 'exposed to the Detective',
      'State conclusions confidently', 'participatory', 'implicated', 'TEMPORAL CONTEXT KEY',
      'where one arc ends and another begins', 'It has just been announced', '<TEMPORAL_DISCIPLINE>',
      '<ARC_FLOW>', '<VISUAL_DISTRIBUTION>', '<arc-section-flow>', '<visual-rules>',
      'Return JSON with the following structure', 'the schema wins', 'claude-agent-sdk-typescript#277'
    ];

    it.each(['outline', 'article'])("none in the %s prompts' instruction text, nor any phrase on the removed list", async (which) => {
      const { systemPrompt, userPrompt } = which === 'outline' ? await outlineOf(journalist()) : await articleOf(journalist(), NOTES_EPILOGUE);
      const text = instructionText(`${systemPrompt}\n${userPrompt}`);
      expect(findRemovedPhrases(text)).toEqual([]);
      REMOVED.forEach((phrase) => expect(`${phrase}: ${text.includes(phrase)}`).toBe(`${phrase}: false`));
      expect(text).not.toMatch(/[—–]/);
    });
  });

  describe('the notes block', () => {
    it('with no epilogue in the notes, no post-investigation section appears (Review Focus 5)', async () => {
      for (const { userPrompt } of [await outlineOf(journalist()), await articleOf(journalist())]) {
        const block = between(userPrompt, '<INVESTIGATION_OBSERVATIONS>', '</INVESTIGATION_OBSERVATIONS>');
        expect(block).toContain(NOTES_NO_EPILOGUE.rawProse);
        expect(block).not.toMatch(/EPILOGUE|POST_INVESTIGATION|epilogue|announced|Following the investigation/);
        // The header dates nothing to "this morning": the notes are dated by what they say.
        expect(instructionText(block)).not.toMatch(/this morning/i);
      }
    });

    it('with an epilogue, the header points at <EPILOGUE> and at T7, and prescribes no phrasing', async () => {
      const { userPrompt } = await articleOf(journalist(), NOTES_EPILOGUE);
      const block = between(userPrompt, '<INVESTIGATION_OBSERVATIONS>', '</INVESTIGATION_OBSERVATIONS>');
      const header = block.slice(0, block.indexOf('<DIRECTOR_NOTES>'));
      expect(header).toContain('<EPILOGUE>');
      expect(header).toContain('T7');
      expect(block).toContain('- After the investigation, Riley left town.');
      expect(header).not.toMatch(/announced|Currently/);
    });
  });

  describe('the roster block (T9, T15)', () => {
    const section = generateRosterSection('journalist', CANONICAL, null, { Alex: 'he/him', Jamie: 'they/them' }, ['Alex', 'Riley', 'Jamie']);
    const lines = section.split('\n');

    it('never genders Nova', () => {
      expect(lines.filter((l) => /\bNova\b/.test(l))).toEqual(['- Nova - the NovaNews reporter who writes the article']);
    });

    it('gives Marcus he/him and the canon line, and invents nothing for Blake', () => {
      expect(lines.filter((l) => l.startsWith('- Marcus'))).toEqual(['- Marcus Blackwood (he/him) - the man whose death the room investigates']);
      expect(lines.filter((l) => l.startsWith('- Blake'))).toEqual(['- Blake - manages operations at NeurAI; Marcus called Blake his Valet']);
    });

    it("prints \"pronoun not given\" for a roster character with none captured, and keeps the director's they/them", () => {
      expect(section).toContain('- Riley → Riley Torres (pronoun not given)');
      expect(section).toContain('- Jamie → Jamie Park (they/them)');
      expect(section).toContain('- Alex → Alex Reeves (he/him)');
      expect(section).not.toContain('Riley Torres (they/them)');
    });
  });

  describe('the agency rule and the head count (rewritten, not deleted)', () => {
    it.each(['outline', 'article'])('the %s SESSION_FACTS says who was at the investigation, that Blake acts in the room, and that Nova is not a player', async (which) => {
      const { userPrompt } = which === 'outline' ? await outlineOf(journalist()) : await articleOf(journalist());
      const facts = between(userPrompt, '<SESSION_FACTS>', '</SESSION_FACTS>');
      expect(facts).toContain('Only the 2 players above were at the investigation');
      // Fix 3.2b (finding 7): the line no longer says Marcus and every other character
      // reach the article only through memories and then puts Blake in the room, and
      // the count is of the players at the investigation (T10), not of the room.
      expect(facts).toContain('Every other character except Blake appears only through the memories and documents.');
      expect(facts).toMatch(/Blake was in the room too/);
      expect(facts).toMatch(/Nova is not one of the players/);
      expect(facts).toContain('When the article counts the people at the investigation, it counts these 2 players.');
      expect(facts).not.toMatch(/Marcus included|how many people were in the room|the number is/);
      expect(facts).not.toMatch(/NEVER give non-roster characters/);
    });

    // Final review (rules-writers[0]; R11, T5, T14): the line said Blake worked the room
    // "for NeurAI", a fact about whom the deals were for, which round 7 made Nova's
    // suspicion; the gate's outline echoed it into FOLLOW THE MONEY. It now says what
    // world.md says Blake does: in the room, making deals, acting and speaking as the
    // record shows, with nothing about whom the deals serve.
    it.each(['outline', 'article'])('the %s SESSION_FACTS puts Blake in the room making deals, and names no one the deals serve', async (which) => {
      const { userPrompt } = which === 'outline' ? await outlineOf(journalist()) : await articleOf(journalist());
      const facts = between(userPrompt, '<SESSION_FACTS>', '</SESSION_FACTS>');
      expect(facts).toContain('Blake was in the room too, making deals, and acts and speaks there as the record shows.');
      expect(facts).not.toMatch(/for NeurAI|NeurAI/);
    });
  });

  describe('FINANCIAL_SUMMARY counts sales from the code-computed figures', () => {
    it.each(['outline', 'article'])('in the %s prompt', async (which) => {
      const { userPrompt } = which === 'outline' ? await outlineOf(journalist()) : await articleOf(journalist());
      const summary = between(userPrompt, '<FINANCIAL_SUMMARY>', '</FINANCIAL_SUMMARY>');
      expect(summary).toContain('- Ember: $250,000 (2 sales)');
      expect(summary).toContain('- Riley: $50,000 (0 sales)');
      expect(summary).not.toContain('Empty');
      expect(summary).toContain('All accounts together: $300,000');
      expect(summary).toMatch(/first-burial bonus/);
      expect(summary).not.toMatch(/\btokens?\b|Total buried|Black Market|Blake/);
    });

    // Phase 3 (3.9; spec section 7, R12): "a reading" is retired as the word for Nova's
    // inference. Phase 4 (brief 4.6): the map holds no account inference; its <SCHEMA>
    // calls nothing a reading.
    it("the map writer's <SCHEMA> calls nothing a reading", async () => {
      const { userPrompt } = await outlineOf(journalist());
      const schema = between(userPrompt, '<SCHEMA>', '</SCHEMA>');
      expect(schema).toContain('"title": "StoryMap"');
      expect(schema).not.toMatch(/\breading\b/i);
    });
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6b: the map writer's task says what is true of the prompt it sits in
// ═══════════════════════════════════════════════════════════════════════════
//
// The meeting's note is the approval note marked arc-selection, the one note the map's
// check accepts as a change's source (lib/map.js meetingNoteOf); a reweave's or a
// send-back's note prints marked as a rejection. The top photo starts from the photo marked
// [hero image] only when <available-photos> marks one.
describe("4.6b: the map writer's task says what is true", () => {
  const { meetingNoteOf } = require('../map');
  const TOP_PHOTO_LINE = "- Choose the top photo. The photo marked [hero image] in <available-photos> is code's pick, the one with the most players identified in it: start from it.";
  const HERO = { filename: 'hero.jpg', identifiedCharacters: ['Alex'], hero: true };
  const OTHER = { filename: 'p2.jpg', identifiedCharacters: [] };
  const builder = () => new PromptBuilder({ loadPhasePrompts: jest.fn(), validate: jest.fn() });
  /** The map writer's task: from its first line to the theme's slots. */
  const taskOf = (userPrompt) => userPrompt.slice(userPrompt.indexOf("Lay the settled weave above across the article's sections"), userPrompt.indexOf('<SLOTS>'));

  it('with a photo marked [hero image], the top photo starts from it', async () => {
    const { userPrompt } = await builder().buildOutlinePrompt(SETTLED_WEAVE, [HERO, OTHER], [], null, { gateNotes: MEETING_NOTES });
    expect(taskOf(userPrompt)).toContain(`${TOP_PHOTO_LINE}\n- List what you considered and did not use under leftOut`);
    expect(userPrompt).toContain('1. [hero image] hero.jpg: Alex');
  });

  it.each([
    ['no photo at all', []],
    ['photos, none of them marked', [OTHER]]
  ])("with %s, no line points at a photo marked [hero image], and none is marked", async (_name, photos) => {
    const { userPrompt } = await builder().buildOutlinePrompt(SETTLED_WEAVE, photos, [], null, { gateNotes: MEETING_NOTES });
    const task = taskOf(userPrompt);
    expect(task).toContain('- Give each section you use its heading');
    expect(task).not.toContain('Choose the top photo');
    expect(userPrompt).not.toContain('[hero image]');
  });

  it("names the meeting's note as the approval note marked arc-selection: the note the map's check counts as the source \"note\"", async () => {
    const { userPrompt } = await builder().buildOutlinePrompt(SETTLED_WEAVE, [HERO], [], null, { gateNotes: MEETING_NOTES });
    const task = taskOf(userPrompt);
    expect(task).toContain('each change the director\'s note from the meeting asks for (the approval note marked arc-selection in <DIRECTOR_GUIDANCE>)');
    expect(task).not.toContain('standing note');
    // The approval note prints marked [arc-selection, approval N], and the check counts it;
    // a rejection note at the meeting prints marked as one, and the check does not.
    expect(userPrompt).toContain('- [arc-selection, approval 1] Lead with the money.');
    expect(meetingNoteOf({ directorGateNotes: MEETING_NOTES })).toBe(true);
    const rejection = [{ ...MEETING_NOTES[0], kind: 'rejection' }];
    const { userPrompt: sentBack } = await builder().buildOutlinePrompt(SETTLED_WEAVE, [HERO], [], null, { gateNotes: rejection });
    expect(sentBack).toContain('- [arc-selection, rejection 1] Lead with the money.');
    expect(meetingNoteOf({ directorGateNotes: rejection })).toBe(false);
  });
});
