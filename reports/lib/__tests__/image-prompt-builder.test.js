/**
 * ImagePromptBuilder Unit Tests
 */

const {
  ImagePromptBuilder,
  createImagePromptBuilder,
  createMockImagePromptBuilder
} = require('../image-prompt-builder');

// Mock ThemeLoader
jest.mock('../theme-loader', () => {
  const actual = jest.requireActual('../theme-loader');
  return {
    ...actual,
    createThemeLoader: jest.fn(() => ({
      loadPhasePrompts: jest.fn(),
      loadPrompt: jest.fn(),
      validate: jest.fn()
    }))
  };
});

describe('ImagePromptBuilder', () => {
  let mockThemeLoader;
  let builder;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock theme loader
    mockThemeLoader = {
      loadPhasePrompts: jest.fn(),
      loadPrompt: jest.fn(),
      validate: jest.fn()
    };

    builder = new ImagePromptBuilder(mockThemeLoader);
  });

  describe('constructor', () => {
    it('should store theme loader reference', () => {
      expect(builder.theme).toBe(mockThemeLoader);
    });
  });

  describe('buildWhiteboardPrompt', () => {
    const mockSessionData = {
      roster: ['Victoria', 'Morgan', 'Jessicah', 'Kai', 'Taylor'],
      whiteboardPhotoPath: '/path/to/whiteboard.jpg'
    };

    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'whiteboard-analysis': 'You are analyzing a whiteboard...',
        'photo-analysis': 'You are analyzing photos...',
        'photo-enrichment': 'You are enriching photos...'
      });
    });

    it('should return system and user prompts', async () => {
      const result = await builder.buildWhiteboardPrompt(mockSessionData);

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    it('should load imageAnalysis phase prompts', async () => {
      await builder.buildWhiteboardPrompt(mockSessionData);

      expect(mockThemeLoader.loadPhasePrompts).toHaveBeenCalledWith('imageAnalysis');
    });

    it('should include roster in user prompt for OCR disambiguation', async () => {
      const result = await builder.buildWhiteboardPrompt(mockSessionData);

      expect(result.userPrompt).toContain('Victoria');
      expect(result.userPrompt).toContain('Morgan');
      expect(result.userPrompt).toContain('Jessicah');
    });

    it('should include whiteboard photo path in user prompt', async () => {
      const result = await builder.buildWhiteboardPrompt(mockSessionData);

      expect(result.userPrompt).toContain('/path/to/whiteboard.jpg');
    });

    it('should use whiteboard-analysis reference doc as system prompt', async () => {
      const result = await builder.buildWhiteboardPrompt(mockSessionData);

      expect(result.systemPrompt).toContain('You are analyzing a whiteboard');
    });

    it('should handle empty roster', async () => {
      const result = await builder.buildWhiteboardPrompt({
        roster: [],
        whiteboardPhotoPath: '/path/to/whiteboard.jpg'
      });

      expect(result.userPrompt).toContain('CHARACTER ROSTER');
    });
  });

  describe('buildPhotoAnalysisPrompt', () => {
    const mockOptions = {
      playerFocus: { primaryInvestigation: 'Victoria and Morgan collusion' },
      photoPath: '/path/to/photo1.jpg',
      filename: 'photo1.jpg',
      roster: ['Victoria', 'Morgan', 'Derek']
    };

    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'whiteboard-analysis': 'You are analyzing a whiteboard...',
        'photo-analysis': 'You are analyzing session photographs...',
        'photo-enrichment': 'You are enriching photos...'
      });
    });

    it('should return system and user prompts', async () => {
      const result = await builder.buildPhotoAnalysisPrompt(mockOptions);

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    it('should include photo path in user prompt', async () => {
      const result = await builder.buildPhotoAnalysisPrompt(mockOptions);

      expect(result.userPrompt).toContain('/path/to/photo1.jpg');
    });

    it('should include filename in user prompt', async () => {
      const result = await builder.buildPhotoAnalysisPrompt(mockOptions);

      expect(result.userPrompt).toContain('photo1.jpg');
    });

    it('should include player focus context', async () => {
      const result = await builder.buildPhotoAnalysisPrompt(mockOptions);

      expect(result.userPrompt).toContain('Victoria and Morgan collusion');
    });

    it('should mention roster count but NOT use for identification', async () => {
      const result = await builder.buildPhotoAnalysisPrompt(mockOptions);

      expect(result.userPrompt).toContain('3 characters');
      expect(result.userPrompt).toContain('describe people generically');
    });

    it('should handle missing player focus', async () => {
      const result = await builder.buildPhotoAnalysisPrompt({
        ...mockOptions,
        playerFocus: null
      });

      expect(result.userPrompt).toContain('general investigative perspective');
    });

    it('should use photo-analysis reference doc as system prompt', async () => {
      const result = await builder.buildPhotoAnalysisPrompt(mockOptions);

      expect(result.systemPrompt).toContain('analyzing session photographs');
    });
  });

  describe('buildPhotoEnrichmentPrompt', () => {
    const mockOptions = {
      analysis: {
        filename: 'photo1.jpg',
        visualContent: 'A person in a red dress examines evidence',
        narrativeMoment: 'Discovery moment',
        suggestedCaption: 'The truth revealed',
        emotionalTone: 'revelatory',
        storyRelevance: 'critical',
        characterDescriptions: [
          { description: 'person in red dress', role: 'examining evidence' }
        ]
      },
      userInput: {
        characterMappings: [{ descriptionIndex: 0, characterName: 'Victoria' }],
        corrections: { context: 'Near the evidence table' }
      },
      sessionData: {
        roster: ['Victoria', 'Morgan', 'Derek'],
        directorNotes: {
          observations: {
            behaviorPatterns: ['Victoria and Morgan worked together']
          }
        }
      }
    };

    beforeEach(() => {
      mockThemeLoader.loadPhasePrompts.mockResolvedValue({
        'whiteboard-analysis': 'You are analyzing a whiteboard...',
        'photo-analysis': 'You are analyzing photos...',
        'photo-enrichment': 'You are enriching photo analyses...'
      });
    });

    it('should return system and user prompts', async () => {
      const result = await builder.buildPhotoEnrichmentPrompt(mockOptions);

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
    });

    it('should include original analysis in user prompt', async () => {
      const result = await builder.buildPhotoEnrichmentPrompt(mockOptions);

      expect(result.userPrompt).toContain('person in red dress');
      expect(result.userPrompt).toContain('Discovery moment');
    });

    it('should include character mappings', async () => {
      const result = await builder.buildPhotoEnrichmentPrompt(mockOptions);

      expect(result.userPrompt).toContain('Victoria');
      expect(result.userPrompt).toContain('person in red dress');
    });

    it('should include corrections if provided', async () => {
      const result = await builder.buildPhotoEnrichmentPrompt(mockOptions);

      expect(result.userPrompt).toContain('Near the evidence table');
    });

    it('should include roster context', async () => {
      const result = await builder.buildPhotoEnrichmentPrompt(mockOptions);

      expect(result.userPrompt).toContain('ROSTER');
      expect(result.userPrompt).toContain('Victoria, Morgan, Derek');
    });

    it('should include director observations', async () => {
      const result = await builder.buildPhotoEnrichmentPrompt(mockOptions);

      expect(result.userPrompt).toContain('Victoria and Morgan worked together');
    });

    it('should use photo-enrichment reference doc as system prompt', async () => {
      const result = await builder.buildPhotoEnrichmentPrompt(mockOptions);

      expect(result.systemPrompt).toContain('enriching photo analyses');
    });

    it('should handle missing session data', async () => {
      const result = await builder.buildPhotoEnrichmentPrompt({
        ...mockOptions,
        sessionData: {}
      });

      expect(result).toHaveProperty('userPrompt');
    });
  });

  describe('getPhaseRequirements', () => {
    it('should return imageAnalysis requirements', () => {
      const reqs = builder.getPhaseRequirements();

      expect(reqs).toContain('whiteboard-analysis');
      expect(reqs).toContain('photo-analysis');
      expect(reqs).toContain('photo-enrichment');
    });
  });
});

describe('createImagePromptBuilder', () => {
  it('should create an ImagePromptBuilder instance', () => {
    const builder = createImagePromptBuilder();

    expect(builder).toBeInstanceOf(ImagePromptBuilder);
  });
});

describe('createMockImagePromptBuilder', () => {
  it('should create a mock builder that works without file system', async () => {
    const mockBuilder = createMockImagePromptBuilder();

    const result = await mockBuilder.buildWhiteboardPrompt({
      roster: ['Test'],
      whiteboardPhotoPath: '/test/path.jpg'
    });

    expect(result.systemPrompt).toContain('Mock whiteboard');
    expect(result).toHaveProperty('userPrompt');
  });

  it('should allow custom mock prompts', async () => {
    const mockBuilder = createMockImagePromptBuilder({
      prompts: {
        'whiteboard-analysis': 'Custom whiteboard prompt'
      }
    });

    const result = await mockBuilder.buildWhiteboardPrompt({
      roster: ['Test'],
      whiteboardPhotoPath: '/test/path.jpg'
    });

    expect(result.systemPrompt).toContain('Custom whiteboard prompt');
  });
});
