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

    it('should pass custom path to ThemeLoader', () => {
      createPromptBuilder('/custom/skill/path');
      expect(createThemeLoader).toHaveBeenCalledWith('/custom/skill/path');
    });

    it('should pass null when no path specified', () => {
      createPromptBuilder();
      expect(createThemeLoader).toHaveBeenCalledWith(null);
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
