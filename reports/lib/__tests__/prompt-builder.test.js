/**
 * PromptBuilder Unit Tests
 */

const { PromptBuilder, createPromptBuilder } = require('../prompt-builder');
const { ThemeLoader, PHASE_REQUIREMENTS } = require('../theme-loader');

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

  describe('buildOutlinePrompt', () => {
    const mockArcAnalysis = {
      narrativeArcs: [
        { name: 'The Money Trail', playerEmphasis: 'HIGH' },
        { name: 'Lab Secrets', playerEmphasis: 'MEDIUM' }
      ]
    };
    const selectedArcs = ['The Money Trail', 'Lab Secrets'];
    const heroImage = 'hero.png';
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
      const result = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage
      );

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    it('should load outlineGeneration phase prompts', async () => {
      await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage
      );

      expect(mockThemeLoader.loadPhasePrompts).toHaveBeenCalledWith('outlineGeneration');
    });

    it('should include section-rules in system prompt', async () => {
      const { systemPrompt } = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage
      );

      expect(systemPrompt).toContain('Lede must hook');
    });

    it('should include numbered selected arcs in user prompt', async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage
      );

      expect(userPrompt).toContain('1. The Money Trail');
      expect(userPrompt).toContain('2. Lab Secrets');
    });

    it('should include hero image in user prompt', async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage
      );

      expect(userPrompt).toContain('HERO IMAGE: hero.png');
    });

    it('should include JSON output structure', async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage
      );

      expect(userPrompt).toContain('lede');
      expect(userPrompt).toContain('theStory');
      expect(userPrompt).toContain('followTheMoney');
      expect(userPrompt).toContain('thePlayers');
      expect(userPrompt).toContain('whatsMissing');
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

    it('should load articleGeneration phase prompts', async () => {
      await builder.buildArticlePrompt(
        mockOutline
      );

      expect(mockThemeLoader.loadPhasePrompts).toHaveBeenCalledWith('articleGeneration');
    });

    it('should include character-voice in user prompt (VOICE_CHECKPOINT)', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('Be NovaGlade');
    });

    it('should include writing-principles in user prompt (VOICE_CHECKPOINT)', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('Show dont tell');
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
      expect(userPrompt).toContain('anthropics/claude-agent-sdk-typescript#277');
    });

    it('should include anti-patterns in user prompt', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('No em-dashes');
    });

    it('journalist prompt includes LEDE, THE STORY, FOLLOW THE MONEY sections', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('LEDE');
      expect(userPrompt).toContain('THE STORY');
      expect(userPrompt).toContain('FOLLOW THE MONEY');
    });

    it('journalist prompt includes pullQuotes and financialTracker', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('pullQuotes');
      expect(userPrompt).toContain('financialTracker');
    });

    it('journalist prompt includes VISUAL_DISTRIBUTION and ARC_FLOW', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline
      );

      expect(userPrompt).toContain('VISUAL_DISTRIBUTION');
      expect(userPrompt).toContain('ARC_FLOW');
    });

    it('journalist article prompt includes explicit word target in GENERATION_INSTRUCTION', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        { lede: { hook: 'test' } }, [], null
      );
      const generationInstruction = userPrompt.split('<GENERATION_INSTRUCTION>')[1] || '';
      expect(generationInstruction).toContain('1000-1500 words');
    });
  });

  describe('buildValidationPrompt', () => {
    const mockArticleHtml = '<article><p>The investigation reveals...</p></article>';
    const roster = ['Alex', 'Remi', 'Vic'];

    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'anti-patterns': 'No em-dashes, no tokens...',
        'character-voice': 'NovaGlade voice...',
        'evidence-boundaries': 'Only quote exposed...'
      });
    });

    it('should return system and user prompts', async () => {
      const result = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    it('should load validation phase prompts', async () => {
      await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(mockThemeLoader.loadPhasePrompts).toHaveBeenCalledWith('validation');
    });

    it('should include anti-patterns in system prompt', async () => {
      const { systemPrompt } = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(systemPrompt).toContain('No em-dashes');
    });

    it('should include character-voice in system prompt', async () => {
      const { systemPrompt } = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(systemPrompt).toContain('NovaGlade voice');
    });

    it('should include roster in user prompt', async () => {
      const { userPrompt } = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(userPrompt).toContain('Alex, Remi, Vic');
    });

    it('should include article HTML in user prompt', async () => {
      const { userPrompt } = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(userPrompt).toContain('The investigation reveals');
    });

    it('should specify validation checklist items', async () => {
      const { userPrompt } = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(userPrompt).toContain('Em-dashes');
      expect(userPrompt).toContain('memory token');
      expect(userPrompt).toContain('Game mechanics language');
      expect(userPrompt).toContain('Vague attribution');
      expect(userPrompt).toContain('Passive/neutral voice');
      expect(userPrompt).toContain('Missing roster members');
      expect(userPrompt).toContain('Blake condemned');
    });

    it('should specify JSON output structure', async () => {
      const { userPrompt } = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(userPrompt).toContain('passed');
      expect(userPrompt).toContain('issues');
      expect(userPrompt).toContain('voice_score');
      expect(userPrompt).toContain('roster_coverage');
    });
  });

  describe('getPhaseRequirements', () => {
    it('should return requirements for valid phase', () => {
      const reqs = builder.getPhaseRequirements('articleGeneration');
      expect(reqs).toEqual(PHASE_REQUIREMENTS.articleGeneration);
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

  describe('detective theme prompts', () => {
    let detectiveBuilder;

    beforeEach(() => {
      detectiveBuilder = new PromptBuilder(mockThemeLoader, 'detective');
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': 'Detective Anondono voice...',
        'writing-principles': 'Synthesize evidence...',
        'evidence-boundaries': 'Factual accuracy...',
        'section-rules': 'Evidence Locker...',
        'narrative-structure': 'Closure for players...',
        'formatting': 'Strong tags for names...',
        'anti-patterns': 'Section differentiation...',
        'editorial-design': 'Single column...',
      });
    });

    it('buildOutlinePrompt uses detective framing', async () => {
      const { systemPrompt } = await detectiveBuilder.buildOutlinePrompt(
        { narrativeArcs: [] }, ['Arc 1'], 'hero.png'
      );
      expect(systemPrompt).not.toContain('NovaNews');
      expect(systemPrompt).toContain('Detective Anondono');
    });

    it('buildArticlePrompt uses detective voice, not Nova', async () => {
      const { systemPrompt } = await detectiveBuilder.buildArticlePrompt(
        {}, [], null
      );
      expect(systemPrompt).not.toContain('You are Nova');
      expect(systemPrompt).not.toContain('Hunter S. Thompson');
      expect(systemPrompt).toContain('Detective');
    });

    it('buildRevisionPrompt uses detective framing', async () => {
      const { systemPrompt } = await detectiveBuilder.buildRevisionPrompt('content', 'check');
      expect(systemPrompt).not.toContain('Nova');
      expect(systemPrompt).toContain('Detective Anondono');
    });

    it('buildValidationPrompt uses detective framing', async () => {
      const { systemPrompt } = await detectiveBuilder.buildValidationPrompt('<html></html>', ['Alex']);
      expect(systemPrompt).not.toContain('NovaNews');
      expect(systemPrompt).toContain('detective');
    });

    it('detective article prompt includes detective constraints', async () => {
      const { systemPrompt } = await detectiveBuilder.buildArticlePrompt(
        {}, [], null
      );
      expect(systemPrompt).toContain('SYNTHESIZE');
      expect(systemPrompt).toContain('750 words');
      expect(systemPrompt).not.toContain('em-dashes');
    });

    describe('buildArticlePrompt detective user prompt', () => {
      const mockOutline = { executiveSummary: { hook: 'Case opened...' } };

      it('detective user prompt does NOT include journalist sections', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        // The embedded <SCHEMA> (SDK#277 workaround) contains the full schema for both
        // themes — including the financialTracker description which mentions "FOLLOW THE
        // MONEY". So substring checks for those names hit the schema text. Strip the
        // schema block before the negative-presence assertions.
        const promptWithoutSchema = userPrompt.replace(/<SCHEMA>[\s\S]*?<\/SCHEMA>/g, '');
        // These are journalist-specific structural concepts that must not appear in
        // detective prompt instructions.
        expect(promptWithoutSchema).not.toContain('FOLLOW THE MONEY');
        expect(promptWithoutSchema).not.toContain('THE PLAYERS');
        expect(promptWithoutSchema).not.toContain('VISUAL_DISTRIBUTION');
        expect(promptWithoutSchema).not.toContain('ARC_FLOW');
        // Detective branch must explicitly exclude journalist-only output fields.
        expect(userPrompt).toContain('Do NOT include pullQuotes, evidenceCards, or financialTracker');
        // Journalist-specific GENERATION_INSTRUCTION patterns must be absent.
        expect(promptWithoutSchema).not.toContain('pullQuotes" - Featured quotes for sidebar');
        expect(promptWithoutSchema).not.toContain('financialTracker" - Shell-account LEDGER');
      });

      it('detective user prompt includes detective section IDs', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('executive-summary');
        expect(userPrompt).toContain('evidence-locker');
        expect(userPrompt).toContain('suspect-network');
        expect(userPrompt).toContain('final-assessment');
      });

      it('detective user prompt includes SECTION_GUIDANCE', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('SECTION_GUIDANCE');
        expect(userPrompt).toContain('EXECUTIVE SUMMARY');
        expect(userPrompt).toContain('EVIDENCE LOCKER');
        expect(userPrompt).toContain('OUTSTANDING QUESTIONS');
        expect(userPrompt).toContain('FINAL ASSESSMENT');
      });

      it('detective user prompt includes DATA_CONTEXT with outline and evidence', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('DATA_CONTEXT');
        expect(userPrompt).toContain('Case opened');
      });

      it('detective user prompt includes voice checkpoint with detective constraints', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('VOICE_CHECKPOINT');
        expect(userPrompt).toContain('Detective Anondono');
      });

      it('detective user prompt references Detective Anondono as author', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('Detective Anondono');
        expect(userPrompt).toContain('Lead Investigator');
      });

      it('detective user prompt explicitly excludes pullQuotes, evidenceCards, financialTracker', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('Do NOT include pullQuotes');
        expect(userPrompt).toContain('evidenceCards');
        expect(userPrompt).toContain('financialTracker');
      });

      it('detective user prompt specifies ~750 word target', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('750 words');
      });

      it('detective user prompt includes ANTI_PATTERNS', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('ANTI_PATTERNS');
        expect(userPrompt).toContain('Section differentiation');
      });

      it('detective user prompt includes RULES section with prompt references', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, [], null
        );
        expect(userPrompt).toContain('RULES');
        expect(userPrompt).toContain('Evidence Locker');   // section-rules
        expect(userPrompt).toContain('Closure for players'); // narrative-structure
      });

      it('detective user prompt includes arc evidence when provided', async () => {
        // Brief 2.1: the package names the document by id; its text is in <RECORD>, once.
        const arcEvidence = [{
          arcId: 'financial-trail',
          arcTitle: 'Financial Trail',
          evidenceItems: [{ id: 'tok1', type: 'memory', fullContent: 'Money moved...', quotableExcerpts: ['follow the money'] }],
          photos: []
        }];
        const evidenceBundle = {
          exposed: { tokens: [{ id: 'tok1', fullContent: 'Money moved...', rawData: { tokenId: 'tok1', name: 'TOK1', fullDescription: 'Money moved...', owners: ['Alex Reeves'] } }], paperEvidence: [] },
          buried: { transactions: [] }
        };
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, arcEvidence, null, [], null, null, null, { evidenceBundle }
        );
        expect(userPrompt).toContain('financial-trail');
        expect(userPrompt).toContain('tok1 (memory)');
        expect(userPrompt).toContain('<document id="tok1" kind="memory" name="TOK1" owner="Alex Reeves" layer="exposed">');
        expect(userPrompt.split('Money moved').length - 1).toBe(1);
      });
    });
  });

  // Helper factory for theme-branching tests (returns a stub ThemeLoader
  // that resolves with all prompt keys the methods might request)
  function createStubThemeLoader() {
    return {
      loadPhasePrompts: jest.fn().mockResolvedValue({
        'character-voice': 'voice stub',
        'writing-principles': 'principles stub',
        'evidence-boundaries': 'boundaries stub',
        'section-rules': 'rules stub',
        'narrative-structure': 'structure stub',
        'formatting': 'formatting stub',
        'anti-patterns': 'anti-patterns stub',
        'editorial-design': 'design stub',
      }),      validate: jest.fn()
    };
  }

  describe('PromptBuilder.buildRevisionPrompt (theme branching)', () => {
    it('journalist revision references Nova and em-dashes', async () => {
      const pb = new PromptBuilder(createStubThemeLoader(), 'journalist');
      const { userPrompt } = await pb.buildRevisionPrompt('content', 'check');
      expect(userPrompt).toContain('Nova');
      expect(userPrompt).toContain('em-dashes');
    });

    it('detective revision does NOT reference Nova or em-dashes', async () => {
      const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
      const { userPrompt } = await pb.buildRevisionPrompt('content', 'check');
      expect(userPrompt).not.toContain('Nova');
      expect(userPrompt).not.toContain('em-dashes');
    });

    it('detective revision checks for section differentiation and formatting', async () => {
      const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
      const { userPrompt } = await pb.buildRevisionPrompt('content', 'check');
      expect(userPrompt).toContain('Repeated facts across sections');
      expect(userPrompt).toContain('first-person voice that slipped in');
      expect(userPrompt).toContain('<strong>');
    });

    it('detective revision system prompt preserves only sections and photos', async () => {
      const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
      const { systemPrompt } = await pb.buildRevisionPrompt('content', 'check');
      expect(systemPrompt).toContain('sections, photos');
      expect(systemPrompt).not.toContain('pull quotes');
      expect(systemPrompt).not.toContain('financial tracker');
    });
  });

  describe('PromptBuilder.buildValidationPrompt (theme branching)', () => {
    it('journalist validation checks for em-dashes and participatory voice', async () => {
      const pb = new PromptBuilder(createStubThemeLoader(), 'journalist');
      const { userPrompt } = await pb.buildValidationPrompt('<html></html>', ['Alex']);
      expect(userPrompt).toContain('Em-dashes');
      expect(userPrompt).toContain('Passive/neutral voice');
      expect(userPrompt).toContain('blake_handled_correctly');
    });

    it('detective validation does NOT check for em-dashes', async () => {
      const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
      const { userPrompt } = await pb.buildValidationPrompt('<html></html>', ['Alex']);
      expect(userPrompt).not.toContain('Em-dashes');
      expect(userPrompt).not.toContain('blake_handled_correctly');
    });

    it('detective validation checks for section differentiation', async () => {
      const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
      const { userPrompt } = await pb.buildValidationPrompt('<html></html>', ['Alex']);
      expect(userPrompt).toContain('section differentiation');
      expect(userPrompt).toContain('section_differentiation');
    });
  });

  describe('resolvePromptVariables', () => {
    it('should replace {{JOURNALIST_FIRST_NAME}} with sessionConfig value', () => {
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', { journalistFirstName: 'Cassandra' });
      const input = 'Nova (first name configurable via {{JOURNALIST_FIRST_NAME}}) is the journalist.';
      const result = builder.resolvePromptVariables(input);
      expect(result).toBe('Nova (first name configurable via Cassandra) is the journalist.');
    });

    it('should replace {{REPORTING_MODE}} with sessionConfig value', () => {
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', { reportingMode: 'remote' });
      const result = builder.resolvePromptVariables('Mode: {{REPORTING_MODE}}');
      expect(result).toBe('Mode: remote');
    });

    it('should use defaults when sessionConfig values are missing', () => {
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const result = builder.resolvePromptVariables('{{JOURNALIST_FIRST_NAME}} Nova');
      expect(result).toBe('Cassandra Nova');
    });

    it('should handle null/empty input gracefully', () => {
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      expect(builder.resolvePromptVariables('')).toBe('');
      expect(builder.resolvePromptVariables(null)).toBe('');
      expect(builder.resolvePromptVariables(undefined)).toBe('');
    });

    it('should leave unknown variables untouched', () => {
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const result = builder.resolvePromptVariables('Hello {{UNKNOWN_VAR}}');
      expect(result).toBe('Hello {{UNKNOWN_VAR}}');
    });
  });

  describe('prompt variable resolution in build methods', () => {
    it('buildOutlinePrompt should resolve variables in loaded prompts', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'section-rules': 'Written by {{JOURNALIST_FIRST_NAME}} for NovaNews.',
        'editorial-design': 'Design text',
        'narrative-structure': 'Structure text',
        'formatting': 'Formatting text',
        'evidence-boundaries': 'Boundaries text'
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', { journalistFirstName: 'Athena' });

      const { systemPrompt } = await builder.buildOutlinePrompt(
        { narrativeArcs: [] }, ['Arc 1'], 'hero.png'
      );
      expect(systemPrompt).toContain('Written by Athena for NovaNews.');
      expect(systemPrompt).not.toContain('{{JOURNALIST_FIRST_NAME}}');
    });

    it('buildArticlePrompt should resolve variables in loaded prompts', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '{{JOURNALIST_FIRST_NAME}} Nova reporting.',
        'writing-principles': 'Principles text',
        'evidence-boundaries': 'Boundaries text',
        'section-rules': 'Rules text',
        'narrative-structure': 'Structure text',
        'formatting': 'Formatting text',
        'anti-patterns': 'Anti-patterns text',
        'editorial-design': 'Design text'
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', { journalistFirstName: 'Athena' });

      const { userPrompt } = await builder.buildArticlePrompt(
        { lede: { hook: 'Hook' } }
      );
      expect(userPrompt).toContain('Athena Nova reporting.');
      expect(userPrompt).not.toContain('{{JOURNALIST_FIRST_NAME}}');
    });
  });

  describe('TEMPORAL_DISCIPLINE content', () => {
    it('should include LAST NIGHT and THIS MORNING timeline references', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', { reportingMode: 'on-site' });
      const { userPrompt } = await builder.buildArticlePrompt(
        { sections: [] }, [], 'hero.jpg'
      );

      expect(userPrompt).toContain('LAST NIGHT');
      expect(userPrompt).toContain('THIS MORNING');
      // Phase 2 (2.6): where Nova was is the system prompt's mode block's to say.
      expect(userPrompt).toContain('set by the REPORTING MODE in your system prompt');
      expect(userPrompt).not.toContain('physically present');
    });

    it('defers to the mode block in both modes instead of restating it (phase 2, 2.6)', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });
      const blockFor = async (reportingMode) => {
        const builder = new PromptBuilder(mockThemeLoader, 'journalist', { reportingMode });
        const { userPrompt } = await builder.buildArticlePrompt(
          { sections: [] }, [], 'hero.jpg'
        );
        return userPrompt.slice(
          userPrompt.indexOf('<TEMPORAL_DISCIPLINE>'),
          userPrompt.indexOf('</TEMPORAL_DISCIPLINE>')
        );
      };
      const remote = await blockFor('remote');
      const onSite = await blockFor('on-site');

      expect(remote.length).toBeGreaterThan(0);
      expect(remote).toBe(onSite);
      expect(remote).not.toContain('received real-time tips');
      expect(remote).not.toContain('received reports and tips');
      expect(remote).not.toContain('physically present');
      expect(remote).not.toContain('directly witnessed');
    });
  });

  describe('articleGeneration system prompt', () => {
    it('should reference last night/this morning timeline', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });
      const builder = new PromptBuilder(mockThemeLoader, 'journalist', { reportingMode: 'on-site' });
      const { systemPrompt } = await builder.buildArticlePrompt(
        { sections: [] }, [], 'hero.jpg'
      );

      expect(systemPrompt).toContain('LAST NIGHT');
      expect(systemPrompt).toContain('THIS MORNING');
      expect(systemPrompt).not.toContain('the game session');
    });
  });

  describe('outline TEMPORAL_DISCIPLINE', () => {
    it('should reference LAST NIGHT and THIS MORNING instead of past/present', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'section-rules': '', 'editorial-design': '', 'narrative-structure': '',
        'formatting': '', 'evidence-boundaries': ''
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', { reportingMode: 'on-site' });
      const { userPrompt } = await builder.buildOutlinePrompt(
        { narrativeArcs: [] }, ['Arc 1'], 'hero.png'
      );

      expect(userPrompt).toContain('LAST NIGHT');
      expect(userPrompt).toContain('THIS MORNING');
      expect(userPrompt).not.toContain('(past)');
      expect(userPrompt).not.toContain('(present)');
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
        { sections: [] }, [], 'hero.jpg'
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
        { sections: [] }, [], 'hero.jpg'
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

      const { userPrompt } = await builder.buildOutlinePrompt(
        { narrativeArcs: [] }, [], 'hero.jpg', [], [], shellAccounts
      );

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
      const { userPrompt } = await builder.buildOutlinePrompt(
        { narrativeArcs: [] }, [], 'hero.jpg', [], [], []
      );

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
        { lede: { hook: 'Hook' } }, [], 'hero.jpg', shellAccounts
      );

      expect(userPrompt).toContain('FINANCIAL_SUMMARY');
      expect(userPrompt).toContain('Cayman');
      expect(userPrompt).toContain('$1,455,000');
      expect(userPrompt).toContain('$350,000');
      expect(userPrompt).toContain('DETERMINISTIC');
    });

    it('buildArticlePrompt should not include FINANCIAL_SUMMARY when shellAccounts empty', async () => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': '', 'evidence-boundaries': '', 'narrative-structure': '',
        'section-rules': '', 'editorial-design': '', 'formatting': '',
        'anti-patterns': ''
      });

      const builder = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await builder.buildArticlePrompt(
        { lede: { hook: 'Hook' } }, [], 'hero.jpg', []
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

      const { userPrompt } = await builder.buildOutlinePrompt(
        { narrativeArcs: [] }, [], 'hero.jpg', [], [], shellAccounts
      );

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

      const { userPrompt } = await builder.buildOutlinePrompt(
        { narrativeArcs: [] }, [], 'hero.jpg', [], [], shellAccounts
      );

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
        [], // arcEvidencePackages
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
      expect(userPrompt).toContain('CHARACTER AGENCY RULE');
      expect(userPrompt).toContain('Use exactly 3');
    });

    it('should omit SESSION_FACTS when sessionFacts is null', async () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await b.buildArticlePrompt(
        {}, [], null, [], null
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
        {}, [], null, [], null, directorNotes
      );
      expect(userPrompt).toContain('<INVESTIGATION_OBSERVATIONS>');
      expect(userPrompt).toContain('Blake solicited Vic three times');
      // Phase 2 (2.6): the header names what the notes are and defers to the mode
      // block for how they reached the reporter; it no longer says "you observed".
      expect(userPrompt).toContain('What happened during the investigation this morning');
      expect(userPrompt).toContain('How it reached you is set by the reporting mode in your system prompt');
      // Whiteboard should NOT be in this section
      expect(userPrompt).not.toContain('suspects');
    });

    it('should omit INVESTIGATION_OBSERVATIONS when directorNotes is null', async () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await b.buildArticlePrompt(
        {}, [], null, [], null, null
      );
      expect(userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
    });

    it('should omit INVESTIGATION_OBSERVATIONS when rawProse is empty', async () => {
      const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
      const { userPrompt } = await b.buildArticlePrompt(
        {}, [], null, [], null, { rawProse: '', quotes: [], transactionReferences: [], postInvestigationDevelopments: [] }
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

    it('renders the advisories in the outline prompt, with the preamble', async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(
        {}, [], 'hero.png', [], [], [], null, { shouldConsider: ADVISORIES }
      );
      expect(userPrompt).toContain('<SHOULD_CONSIDER>');
      expect(userPrompt).toContain('- The lede frontloads the verdict');
      expect(userPrompt).toContain('- Two arcs rest on the same document');
      expect(userPrompt).toContain('They are not requirements.');
    });

    it('renders them in the article prompt too', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        {}, [], null, [], null, null, null, { shouldConsider: ADVISORIES }
      );
      expect(userPrompt).toContain('<SHOULD_CONSIDER>');
      expect(userPrompt).toContain('- The lede frontloads the verdict');
    });

    it('keeps <DIRECTOR_GUIDANCE> the last section of both prompts', async () => {
      const outline = await builder.buildOutlinePrompt(
        {}, [], 'hero.png', [], [], [], null,
        { shouldConsider: ADVISORIES, directorGuidance: 'Lead with the money.' }
      );
      const article = await builder.buildArticlePrompt(
        {}, [], null, [], null, null, null,
        { shouldConsider: ADVISORIES, directorGuidance: 'Lead with the money.' }
      );
      for (const { userPrompt } of [outline, article]) {
        expect(userPrompt).toContain('<SHOULD_CONSIDER>');
        expect(userPrompt.indexOf('<SHOULD_CONSIDER>'))
          .toBeLessThan(userPrompt.indexOf('<DIRECTOR_GUIDANCE>'));
        expect(userPrompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
      }
    });

    it('omits the section when the previous stage raised nothing', async () => {
      const outline = await builder.buildOutlinePrompt({}, [], 'hero.png', [], [], [], null, {});
      const article = await builder.buildArticlePrompt({}, [], null, [], null, null, null, { shouldConsider: [] });
      expect(outline.userPrompt).not.toContain('SHOULD_CONSIDER');
      expect(article.userPrompt).not.toContain('SHOULD_CONSIDER');
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

    it('appends pronouns from rosterPronouns, defaulting a roster member to they/them', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley', Sam: 'Sam Rivera' };
      const pronouns = { Vic: 'she/her' };
      const result = generateRosterSection('journalist', canonical, null, pronouns, ['Vic', 'Sam']);
      expect(result).toContain('Vic Kingsley (she/her)');
      expect(result).toContain('Sam Rivera (they/them)');
    });

    it('defaults every roster member to they/them when no pronoun map is given', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley' };
      const result = generateRosterSection('journalist', canonical, null, null, ['Vic']);
      expect(result).toContain('Vic Kingsley (they/them)');
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
      const { userPrompt } = await builder.buildArticlePrompt(outline, [], null, [], null, directorNotes, null);
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
      const { userPrompt } = await builder.buildArticlePrompt(outline, [], null, [], null, directorNotes, null);
      expect(userPrompt).toContain('<QUOTE_BANK>');
      expect(userPrompt).toContain('we had to act');
    });

    it('emits <TRANSACTION_LINKS> when links present', async () => {
      const directorNotes = {
        rawProse: 'notes',
        quotes: [],
        transactionReferences: [{
          excerpt: 'Kai paid Blake', linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }], confidence: 'high'
        }],
        postInvestigationDevelopments: []
      };
      const { userPrompt } = await builder.buildArticlePrompt(outline, [], null, [], null, directorNotes, null);
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
      const { userPrompt } = await builder.buildArticlePrompt(outline, [], null, [], null, directorNotes, null);
      // This tag must be DISTINCT from general observations so Nova writes "It has just been announced..."
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
      const { userPrompt } = await builder.buildArticlePrompt(outline, [], null, [], null, directorNotes, null);
      expect(userPrompt).not.toContain('<QUOTE_BANK>');
      expect(userPrompt).not.toContain('<TRANSACTION_LINKS>');
      expect(userPrompt).not.toContain('<EPILOGUE>');
    });

    it('handles null directorNotes gracefully', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(outline, [], null, [], null, null, null);
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
 * with the data and BEFORE the arc metadata — <DIRECTOR_GUIDANCE> keeps the last
 * word.
 */
describe('buildOutlinePrompt — the director\'s raw notes', () => {
  const { PromptBuilder } = require('../prompt-builder');

  const DIRECTOR_NOTES = {
    // Phase 3 (3.6): an epilogue item prints as the director's sentence, so the
    // sentence is in the notes.
    rawProse: 'Blake solicited Vic three times. Heated argument at the bar. Sarah was named interim CEO after the investigation.',
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

  const render = (options) => builder().buildOutlinePrompt(
    { narrativeArcs: [{ id: 'arc-1', title: 'The Money Trail' }] },
    ['arc-1'], 'hero.png', [], [], [], null, options
  );

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

  it('places it before the arc metadata, and leaves the guidance last', async () => {
    const { userPrompt } = await render({
      directorNotes: DIRECTOR_NOTES,
      directorGuidance: 'Lead with the money.'
    });
    expect(userPrompt.indexOf('<INVESTIGATION_OBSERVATIONS>')).toBeGreaterThan(-1);
    expect(userPrompt.indexOf('<INVESTIGATION_OBSERVATIONS>'))
      .toBeLessThan(userPrompt.indexOf('<arc-metadata>'));
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

  it('the temporal-discipline block hands the outline writer no first-person marker (integrator ruling, phase 1)', async () => {
    const { userPrompt } = await render({ directorNotes: null });
    const block = userPrompt.slice(userPrompt.indexOf('<TEMPORAL_DISCIPLINE>'), userPrompt.indexOf('</TEMPORAL_DISCIPLINE>'));
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toContain('"I watched"');
    expect(block).not.toContain('Nova was there');
    expect(block).toContain('third person');
  });
});

/**
 * Brief 2.1 — one record view in the outline and article writers.
 *
 * Each prompt carries <RECORD> once, in its data part: every exposed document in
 * full, labelled, and the buried memories as transactions only. The per-arc
 * sections name each arc's documents by id and keep the quotable excerpts, but no
 * longer repeat the text, and the outline's five-per-arc cap is gone (on 092026 the
 * outline writer never saw 12 of the 37 documents the article writer used).
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
  // mar004 is in no arc (the arc check removed it); the record still holds it.
  const packages = [
    {
      arcId: 'arc-1', arcTitle: 'The Money Trail',
      evidenceItems: ARC_TOKENS.map(id => ({
        id, type: 'memory', fullContent: textOf(id), quotableExcerpts: [`quote from ${id}`]
      })),
      photos: []
    },
    {
      arcId: 'arc-2', arcTitle: 'The Vote',
      evidenceItems: [{ id: 'p1', type: 'paper', fullContent: PAPER_TEXT, quotableExcerpts: [] }],
      photos: []
    }
  ];
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
  const outlineFor = (theme) => builderFor(theme).buildOutlinePrompt(
    { narrativeArcs: [{ id: 'arc-1', title: 'The Money Trail' }] }, ['arc-1', 'arc-2'], 'hero.png', [],
    packages, shellAccounts, null, options
  );
  const articleFor = (theme) => builderFor(theme).buildArticlePrompt(
    { lede: {} }, packages, 'hero.png', shellAccounts, null, null, null, options
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

  it('the journalist outline holds the view once, before the per-arc lists, with no five-per-arc cap', async () => {
    const { userPrompt } = await outlineFor('journalist');
    expectOneRecord(userPrompt);
    expect(userPrompt.indexOf('<RECORD>')).toBeLessThan(userPrompt.indexOf('<arc-evidence>'));
    for (const id of ARC_TOKENS) expect(userPrompt).toContain(`- ${id}: memory\n  Quotable: "quote from ${id}"`);
    expect(userPrompt).toContain(`**Evidence Items (7 items; each one's full text is ${DOCUMENT_POINTER}):**`);
    expect(userPrompt).not.toContain('Full Content:');
    expect(userPrompt).toContain(`2. For evidence cards, use **evidenceItems**: each item's full text is ${DOCUMENT_POINTER}`);
    expect(userPrompt).not.toMatch(/with their \*\*fullContent\*\*/);
    // FINANCIAL_SUMMARY (account totals) stays beside the view's transactions (R2).
    expect(userPrompt).toContain('<FINANCIAL_SUMMARY>');
  });

  it('the detective outline holds the same view, before <evidence-context>, uncapped', async () => {
    const { userPrompt } = await outlineFor('detective');
    expectOneRecord(userPrompt);
    expect(userPrompt.indexOf('<RECORD>')).toBeLessThan(userPrompt.indexOf('<evidence-context>'));
    for (const id of ARC_TOKENS) expect(userPrompt).toContain(`- ${id}: memory`);
    expect(userPrompt).not.toMatch(/Content: "/);
  });

  it('the journalist article holds the view once, inside <DATA_CONTEXT>, and the packages name documents by id', async () => {
    const { userPrompt } = await articleFor('journalist');
    expectOneRecord(userPrompt);
    expect(userPrompt.indexOf('<DATA_CONTEXT>')).toBeLessThan(userPrompt.indexOf('<RECORD>'));
    expect(userPrompt.indexOf('</RECORD>')).toBeLessThan(userPrompt.indexOf('ARC EVIDENCE PACKAGES'));
    expect(userPrompt.indexOf('ARC EVIDENCE PACKAGES')).toBeLessThan(userPrompt.indexOf('</DATA_CONTEXT>'));
    expect(userPrompt).toContain(`EVIDENCE (for context and additional quoting; each one's full text is ${DOCUMENT_POINTER}):\nm1 (memory)\nm2 (memory)`);
    expect(userPrompt).toContain('- "quote from m1" (from m1)');
    expect(userPrompt).toContain('No extracted quotes - quote the arc\'s documents in <RECORD> directly');
    expect(userPrompt).not.toContain('use fullContent directly');
    // The pointer lines 1163 and 1184 (R3: 1250 and 1261-1269 are brief 2.5's).
    expect(userPrompt).toContain(`content (VERBATIM from ${DOCUMENT_POINTER})`);
    expect(userPrompt).toContain(`[Full verbatim text of ${DOCUMENT_POINTER} - do NOT truncate or summarize]`);
    expect(userPrompt).not.toContain('from arcEvidencePackages.evidenceItems[].fullContent');
  });

  it('the detective article holds the same view inside <DATA_CONTEXT>', async () => {
    const { userPrompt } = await articleFor('detective');
    expectOneRecord(userPrompt);
    expect(userPrompt.indexOf('<RECORD>')).toBeLessThan(userPrompt.indexOf('</DATA_CONTEXT>'));
    expect(userPrompt.indexOf('</DATA_CONTEXT>')).toBeLessThan(userPrompt.indexOf('<RULES>'));
  });

  it('labels the contradiction notes as code-made leads that the record overrules', async () => {
    const tensions = { tensions: [{ type: 'named-account', narrativeNote: 'Mel used their own name for a burial account.' }] };
    const { userPrompt } = await builderFor('journalist').buildArticlePrompt(
      {}, [], null, [], null, null, tensions, { evidenceBundle }
    );
    const block = userPrompt.slice(userPrompt.indexOf('<NARRATIVE_TENSIONS>'), userPrompt.indexOf('</NARRATIVE_TENSIONS>'));
    expect(block).toContain(DERIVED_LABELS.narrativeTensions);
    expect(block).toContain('- [named-account] Mel used their own name for a burial account.');
    expect(block).not.toMatch(/verified to respect/);
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
    { narrativeArcs: [] }, ['arc-1'], 'hero.jpg',
    [{ filename: 'aln092026 (7 of 9).jpg', fullPath: 'p/aln092026 (7 of 9).jpg', identifiedCharacters: ['Alex', 'Sam'] },
     { filename: 'aln092026 (2 of 9).jpg', fullPath: 'p/aln092026 (2 of 9).jpg', identifiedCharacters: [] }],
    [], [], facts, options
  );
  const article = (facts, options = {}) => builder().buildArticlePrompt(
    {},
    [{ arcId: 'arc-1', arcTitle: 'The vote', evidenceItems: [], photos: [{ filename: 'AlN092026 (7 OF 9).JPG', characters: ['Alex', 'Sam'] }] }],
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

    it("the detective outline's SESSION_FACTS uses the same verdict lines", async () => {
      const { userPrompt } = await outline(OVERDOSE_FACTS, {}, 'detective');
      expect(userPrompt).toContain('CHARGE: Accidental overdose');
      expect(userPrompt).toContain(RAW_ACCUSATION);
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

    it("the article's arc photos carry the description, joined by filename whatever the case", async () => {
      const { userPrompt } = await article(null, { photoDescriptions: PHOTO_DESCRIPTIONS });
      expect(userPrompt).toContain(`- AlN092026 (7 OF 9).JPG: Alex, Sam\n  The director's description, word for word: ${PHOTO_7}`);
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
