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
      loadPhasePrompts: jest.fn(),
      loadTemplate: jest.fn(),
      validate: jest.fn()
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
      loadPhasePrompts: jest.fn(),
      loadTemplate: jest.fn(),
      validate: jest.fn()
    };

    builder = new PromptBuilder(mockThemeLoader);
  });

  describe('constructor', () => {
    it('should store theme loader reference', () => {
      expect(builder.theme).toBe(mockThemeLoader);
    });
  });

  describe('buildArcAnalysisPrompt', () => {
    const mockSessionData = {
      roster: ['Alex', 'James', 'Victoria', 'Morgan', 'Derek'],
      accusation: 'Victoria and Morgan',
      directorNotes: {
        observations: {
          behaviorPatterns: ['Pattern 1', 'Pattern 2']
        },
        whiteboard: {
          suspects: ['Derek']
        }
      },
      evidenceBundle: {
        exposed: { tokens: [{ id: 'tok1' }] },
        buried: { transactions: [] }
      }
    };

    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'character-voice': 'Be NovaGlade...',
        'evidence-boundaries': 'Only report exposed...',
        'narrative-structure': 'Build 2-4 arcs...',
        'anti-patterns': 'Avoid em-dashes...'
      });
    });

    it('should return system and user prompts', async () => {
      const result = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    it('should load arcAnalysis phase prompts', async () => {
      await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(mockThemeLoader.loadPhasePrompts).toHaveBeenCalledWith('arcAnalysis');
    });

    it('should include character-voice in system prompt', async () => {
      const { systemPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(systemPrompt).toContain('Be NovaGlade');
    });

    it('should include evidence-boundaries in system prompt', async () => {
      const { systemPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(systemPrompt).toContain('Only report exposed');
    });

    it('should include roster in user prompt', async () => {
      const { userPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(userPrompt).toContain('Alex, James, Victoria, Morgan, Derek');
    });

    it('should include accusation in user prompt', async () => {
      const { userPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(userPrompt).toContain('Victoria and Morgan');
    });

    it('should include director observations in user prompt', async () => {
      const { userPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(userPrompt).toContain('Pattern 1');
      expect(userPrompt).toContain('Pattern 2');
    });

    it('should include evidence bundle in user prompt', async () => {
      const { userPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(userPrompt).toContain('tok1');
    });

    it('should include narrative-structure in user prompt', async () => {
      const { userPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(userPrompt).toContain('Build 2-4 arcs');
    });

    it('should include JSON output structure specification', async () => {
      const { userPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

      expect(userPrompt).toContain('narrativeArcs');
      expect(userPrompt).toContain('characterPlacementOpportunities');
      expect(userPrompt).toContain('rosterCoverage');
    });

    it('should handle missing director notes gracefully', async () => {
      const dataWithoutNotes = {
        ...mockSessionData,
        directorNotes: null
      };

      const { userPrompt } = await builder.buildArcAnalysisPrompt(dataWithoutNotes);

      expect(userPrompt).toContain('DIRECTOR OBSERVATIONS');
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
    const mockEvidenceBundle = { exposed: { tokens: [] } };

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
        mockArcAnalysis, selectedArcs, heroImage, mockEvidenceBundle
      );

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    it('should load outlineGeneration phase prompts', async () => {
      await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage, mockEvidenceBundle
      );

      expect(mockThemeLoader.loadPhasePrompts).toHaveBeenCalledWith('outlineGeneration');
    });

    it('should include section-rules in system prompt', async () => {
      const { systemPrompt } = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage, mockEvidenceBundle
      );

      expect(systemPrompt).toContain('Lede must hook');
    });

    it('should include numbered selected arcs in user prompt', async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage, mockEvidenceBundle
      );

      expect(userPrompt).toContain('1. The Money Trail');
      expect(userPrompt).toContain('2. Lab Secrets');
    });

    it('should include hero image in user prompt', async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage, mockEvidenceBundle
      );

      expect(userPrompt).toContain('HERO IMAGE: hero.png');
    });

    it('should include JSON output structure', async () => {
      const { userPrompt } = await builder.buildOutlinePrompt(
        mockArcAnalysis, selectedArcs, heroImage, mockEvidenceBundle
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
    const mockEvidenceBundle = { exposed: { tokens: [] } };
    const mockTemplate = '<html>{{content}}</html>';

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
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    it('should load articleGeneration phase prompts', async () => {
      await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(mockThemeLoader.loadPhasePrompts).toHaveBeenCalledWith('articleGeneration');
    });

    it('should include character-voice in user prompt (VOICE_CHECKPOINT)', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(userPrompt).toContain('Be NovaGlade');
    });

    it('should include writing-principles in user prompt (VOICE_CHECKPOINT)', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(userPrompt).toContain('Show dont tell');
    });

    it('should include approved outline in user prompt', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(userPrompt).toContain('Something is rotten');
    });

    it('should include template in user prompt', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(userPrompt).toContain('<html>{{content}}</html>');
    });

    it('should include anti-patterns in user prompt', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(userPrompt).toContain('No em-dashes');
    });

    it('journalist prompt includes LEDE, THE STORY, FOLLOW THE MONEY sections', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(userPrompt).toContain('LEDE');
      expect(userPrompt).toContain('THE STORY');
      expect(userPrompt).toContain('FOLLOW THE MONEY');
    });

    it('journalist prompt includes pullQuotes and financialTracker', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(userPrompt).toContain('pullQuotes');
      expect(userPrompt).toContain('financialTracker');
    });

    it('journalist prompt includes VISUAL_DISTRIBUTION and ARC_FLOW', async () => {
      const { userPrompt } = await builder.buildArticlePrompt(
        mockOutline, mockEvidenceBundle, mockTemplate
      );

      expect(userPrompt).toContain('VISUAL_DISTRIBUTION');
      expect(userPrompt).toContain('ARC_FLOW');
    });
  });

  describe('buildValidationPrompt', () => {
    const mockArticleHtml = '<article><p>The investigation reveals...</p></article>';
    const roster = ['Alex', 'James', 'Victoria'];

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

      expect(userPrompt).toContain('Alex, James, Victoria');
    });

    it('should include article HTML in user prompt', async () => {
      const { userPrompt } = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(userPrompt).toContain('The investigation reveals');
    });

    it('should specify validation checklist items', async () => {
      const { userPrompt } = await builder.buildValidationPrompt(mockArticleHtml, roster);

      expect(userPrompt).toContain('Em-dashes');
      expect(userPrompt).toContain('token/tokens');
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
      const reqs = builder.getPhaseRequirements('arcAnalysis');
      expect(reqs).toEqual(PHASE_REQUIREMENTS.arcAnalysis);
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
        'arc-flow': 'Linear thematic...'
      });
    });

    it('buildArcAnalysisPrompt uses detective framing', async () => {
      const { systemPrompt } = await detectiveBuilder.buildArcAnalysisPrompt({
        roster: ['Alex', 'Victoria'],
        accusation: 'Victoria',
        directorNotes: { observations: {} },
        evidenceBundle: { exposed: {}, buried: {} }
      });
      expect(systemPrompt).not.toContain('NovaNews');
      expect(systemPrompt).toContain('detective');
    });

    it('buildOutlinePrompt uses detective framing', async () => {
      const { systemPrompt } = await detectiveBuilder.buildOutlinePrompt(
        { narrativeArcs: [] }, ['Arc 1'], 'hero.png', {}
      );
      expect(systemPrompt).not.toContain('NovaNews');
      expect(systemPrompt).toContain('Detective Anondono');
    });

    it('buildArticlePrompt uses detective voice, not Nova', async () => {
      const { systemPrompt } = await detectiveBuilder.buildArticlePrompt(
        {}, {}, '', [], null
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
        {}, {}, '', [], null
      );
      expect(systemPrompt).toContain('SYNTHESIZE');
      expect(systemPrompt).toContain('750 words');
      expect(systemPrompt).not.toContain('em-dashes');
    });

    describe('buildArticlePrompt detective user prompt', () => {
      const mockOutline = { executiveSummary: { hook: 'Case opened...' } };
      const mockEvidence = { exposed: { tokens: [] } };
      const mockTemplate = '<html>detective-template</html>';

      it('detective user prompt does NOT include journalist sections', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        // These are journalist-specific structural concepts
        expect(userPrompt).not.toContain('FOLLOW THE MONEY');
        expect(userPrompt).not.toContain('THE PLAYERS');
        expect(userPrompt).not.toContain('VISUAL_DISTRIBUTION');
        expect(userPrompt).not.toContain('ARC_FLOW');
        // pullQuotes/financialTracker appear as schema fields in journalist but only as exclusion warnings in detective
        expect(userPrompt).not.toContain('"pullQuotes"');
        expect(userPrompt).not.toContain('"financialTracker"');
      });

      it('detective user prompt includes detective section IDs', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('executive-summary');
        expect(userPrompt).toContain('evidence-locker');
        expect(userPrompt).toContain('suspect-network');
        expect(userPrompt).toContain('final-assessment');
      });

      it('detective user prompt includes SECTION_GUIDANCE', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('SECTION_GUIDANCE');
        expect(userPrompt).toContain('EXECUTIVE SUMMARY');
        expect(userPrompt).toContain('EVIDENCE LOCKER');
        expect(userPrompt).toContain('OUTSTANDING QUESTIONS');
        expect(userPrompt).toContain('FINAL ASSESSMENT');
      });

      it('detective user prompt includes DATA_CONTEXT with outline and evidence', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('DATA_CONTEXT');
        expect(userPrompt).toContain('Case opened');
        expect(userPrompt).toContain('TEMPLATE');
        expect(userPrompt).toContain('detective-template');
      });

      it('detective user prompt includes voice checkpoint with detective constraints', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('VOICE_CHECKPOINT');
        expect(userPrompt).toContain('Detective Anondono');
      });

      it('detective user prompt references Detective Anondono as author', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('Detective Anondono');
        expect(userPrompt).toContain('Lead Investigator');
      });

      it('detective user prompt explicitly excludes pullQuotes, evidenceCards, financialTracker', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('Do NOT include pullQuotes');
        expect(userPrompt).toContain('evidenceCards');
        expect(userPrompt).toContain('financialTracker');
      });

      it('detective user prompt specifies ~750 word target', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('750 words');
      });

      it('detective user prompt includes ANTI_PATTERNS', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('ANTI_PATTERNS');
        expect(userPrompt).toContain('Section differentiation');
      });

      it('detective user prompt includes RULES section with prompt references', async () => {
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, [], null
        );
        expect(userPrompt).toContain('RULES');
        expect(userPrompt).toContain('Evidence Locker');   // section-rules
        expect(userPrompt).toContain('Closure for players'); // narrative-structure
      });

      it('detective user prompt includes arc evidence when provided', async () => {
        const arcEvidence = [{
          arcId: 'financial-trail',
          arcTitle: 'Financial Trail',
          evidenceItems: [{ id: 'tok1', type: 'memory', fullContent: 'Money moved...', quotableExcerpts: ['follow the money'] }],
          photos: []
        }];
        const { userPrompt } = await detectiveBuilder.buildArticlePrompt(
          mockOutline, mockEvidence, mockTemplate, arcEvidence, null
        );
        expect(userPrompt).toContain('financial-trail');
        expect(userPrompt).toContain('Money moved');
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
        'arc-flow': 'flow stub'
      }),
      loadTemplate: jest.fn(),
      validate: jest.fn()
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
});
