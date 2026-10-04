/**
 * Photo Nodes Unit Tests
 *
 * Tests for the analyzePhotos node that performs early
 * photo analysis before evidence preprocessing.
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.3 for design rationale.
 */

// Mock checkpointInterrupt to prevent GraphInterrupt in unit tests
// Uses shared mock - see __tests__/mocks/checkpoint-helpers.mock.js
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const {
  analyzePhotos,
  finalizePhotoAnalyses,
  createMockPhotoAnalyzer,
  _testing: {
    getSdkClient,
    buildPhotoAnalysisSystemPrompt,
    createEmptyPhotoAnalysisResult,
    createFailedPhotoAnalysis,
    safeParseJson,
    PHOTO_ANALYSIS_SCHEMA
  }
} = require('../../../lib/workflow/nodes/photo-nodes');
const { PHASES } = require('../../../lib/workflow/state');
const { createMockImagePromptBuilder } = require('../../../lib/image-prompt-builder');

// Create a shared mock ImagePromptBuilder for tests
const mockImagePromptBuilder = createMockImagePromptBuilder();

describe('photo-nodes', () => {
  describe('module exports', () => {
    it('exports analyzePhotos function', () => {
      expect(typeof analyzePhotos).toBe('function');
    });

    it('exports createMockPhotoAnalyzer function', () => {
      expect(typeof createMockPhotoAnalyzer).toBe('function');
    });

    it('exports _testing with helper functions', () => {
      expect(_testing).toBeDefined();
      expect(typeof getSdkClient).toBe('function');
      expect(typeof buildPhotoAnalysisSystemPrompt).toBe('function');
      expect(typeof createEmptyPhotoAnalysisResult).toBe('function');
      expect(typeof safeParseJson).toBe('function');
    });

    it('exports PHOTO_ANALYSIS_SCHEMA', () => {
      expect(PHOTO_ANALYSIS_SCHEMA).toBeDefined();
      expect(PHOTO_ANALYSIS_SCHEMA.type).toBe('object');
      expect(PHOTO_ANALYSIS_SCHEMA.required).toContain('filename');
    });
  });

  describe('getSdkClient', () => {
    it('returns injected client from config', () => {
      const mockClient = jest.fn();
      const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

      const result = getSdkClient(config);

      expect(result).toBe(mockClient);
    });

    it('returns default sdkQuery when not injected', () => {
      const config = { configurable: {} };

      const result = getSdkClient(config);

      expect(typeof result).toBe('function');
    });

    it('handles null config', () => {
      const result = getSdkClient(null);

      expect(typeof result).toBe('function');
    });
  });

  describe('buildPhotoAnalysisSystemPrompt', () => {
    it('includes player focus when provided', () => {
      const playerFocus = {
        primaryInvestigation: 'Who stole the diamond?'
      };

      const prompt = buildPhotoAnalysisSystemPrompt(playerFocus);

      expect(prompt).toContain('Who stole the diamond?');
      expect(prompt).toContain('investigating');
    });

    it('uses generic message when no player focus', () => {
      const prompt = buildPhotoAnalysisSystemPrompt({});

      expect(prompt).toContain('general investigative perspective');
    });

    it('handles null player focus', () => {
      const prompt = buildPhotoAnalysisSystemPrompt(null);

      expect(prompt).toContain('general investigative perspective');
    });

    it('includes instructions about NOT using names', () => {
      const prompt = buildPhotoAnalysisSystemPrompt({});

      expect(prompt).toContain('DO NOT use character names');
      expect(prompt).toContain('physical descriptions');
    });

    it('mentions About Last Night game context', () => {
      const prompt = buildPhotoAnalysisSystemPrompt({});

      expect(prompt).toContain('About Last Night');
      expect(prompt).toContain('crime thriller');
    });
  });

  describe('createEmptyPhotoAnalysisResult', () => {
    it('returns object with empty analyses array', () => {
      const result = createEmptyPhotoAnalysisResult('test-session');

      expect(result.analyses).toEqual([]);
    });

    it('includes sessionId', () => {
      const result = createEmptyPhotoAnalysisResult('test-session');

      expect(result.sessionId).toBe('test-session');
    });

    it('includes analyzedAt timestamp', () => {
      const result = createEmptyPhotoAnalysisResult('test-session');

      expect(result.analyzedAt).toBeDefined();
      expect(new Date(result.analyzedAt)).toBeInstanceOf(Date);
    });

    it('includes stats with zero counts', () => {
      const result = createEmptyPhotoAnalysisResult('test-session');

      expect(result.stats.totalPhotos).toBe(0);
      expect(result.stats.analyzedPhotos).toBe(0);
      expect(result.stats.processingTimeMs).toBe(0);
    });

    it('handles null sessionId', () => {
      const result = createEmptyPhotoAnalysisResult(null);

      expect(result.sessionId).toBeNull();
    });
  });

  describe('safeParseJson', () => {
    it('parses valid JSON', () => {
      const json = '{"filename": "test.jpg", "visualContent": "content"}';

      const result = safeParseJson(json, 'test.jpg');

      expect(result.filename).toBe('test.jpg');
      expect(result.visualContent).toBe('content');
    });

    it('throws actionable error for invalid JSON', () => {
      const invalidJson = 'not valid json';

      expect(() => safeParseJson(invalidJson, 'test.jpg'))
        .toThrow(/Failed to parse test\.jpg:/);
    });

    it('includes context in error message', () => {
      const invalidJson = 'not valid json';

      expect(() => safeParseJson(invalidJson, 'photo123.jpg'))
        .toThrow(/photo123\.jpg/);
    });

    it('includes response preview in error message', () => {
      const invalidJson = 'this is not valid json at all';

      expect(() => safeParseJson(invalidJson, 'test.jpg'))
        .toThrow(/this is not valid/);
    });
  });

  describe('analyzePhotos', () => {
    describe('skip logic', () => {
      it('skips when photoAnalyses already exists', async () => {
        const state = {
          photoAnalyses: { analyses: [{ filename: 'existing.jpg' }] },
          sessionPhotos: ['photo1.jpg']
        };
        const config = { configurable: {} };

        const result = await analyzePhotos(state, config);

        expect(result.currentPhase).toBe(PHASES.ANALYZE_PHOTOS);
        expect(result.photoAnalyses).toBeUndefined();
      });

      it('skips when no session photos', async () => {
        const state = {
          sessionPhotos: [],
          sessionId: 'test-session'
        };
        const config = { configurable: {} };

        const result = await analyzePhotos(state, config);

        expect(result.currentPhase).toBe(PHASES.ANALYZE_PHOTOS);
        expect(result.photoAnalyses.analyses).toEqual([]);
        expect(result.photoAnalyses.stats.totalPhotos).toBe(0);
      });

      it('skips when sessionPhotos is undefined', async () => {
        const state = {
          sessionId: 'test-session'
        };
        const config = { configurable: {} };

        const result = await analyzePhotos(state, config);

        expect(result.currentPhase).toBe(PHASES.ANALYZE_PHOTOS);
        expect(result.photoAnalyses.analyses).toEqual([]);
      });
    });

    describe('processing', () => {
      it('analyzes photos with mock client', async () => {
        const mockClient = jest.fn().mockResolvedValue({
          filename: 'test.jpg',
          visualContent: 'People gathered',
          narrativeMoment: 'The accusation',
          suggestedCaption: 'A dramatic moment',
          characterDescriptions: [],
          emotionalTone: 'tense',
          storyRelevance: 'critical'
        });

        const state = {
          sessionPhotos: ['photo1.jpg', 'photo2.jpg'],
          sessionId: 'test-session',
          playerFocus: { primaryInvestigation: 'Test investigation' }
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        const result = await analyzePhotos(state, config);

        expect(result.photoAnalyses.stats.totalPhotos).toBe(2);
        expect(result.photoAnalyses.stats.analyzedPhotos).toBe(2);
        expect(mockClient).toHaveBeenCalledTimes(2);
      });

      it('includes sessionId in result', async () => {
        const mockClient = jest.fn().mockResolvedValue({
          filename: 'test.jpg',
          visualContent: 'Content',
          narrativeMoment: 'Moment'
        });

        const state = {
          sessionPhotos: ['photo1.jpg'],
          sessionId: 'my-session-123'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        const result = await analyzePhotos(state, config);

        expect(result.photoAnalyses.sessionId).toBe('my-session-123');
      });

      it('extracts filename from path', async () => {
        const mockClient = jest.fn().mockResolvedValue({
          filename: 'photo.jpg',
          visualContent: 'Content',
          narrativeMoment: 'Moment'
        });

        const state = {
          sessionPhotos: ['/path/to/photo.jpg'],
          sessionId: 'test'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        const result = await analyzePhotos(state, config);

        expect(result.photoAnalyses.analyses[0].filename).toBe('photo.jpg');
      });

      it('handles photo objects with path property', async () => {
        const mockClient = jest.fn().mockResolvedValue({
          filename: 'photo.jpg',
          visualContent: 'Content',
          narrativeMoment: 'Moment'
        });

        const state = {
          sessionPhotos: [{ path: '/path/to/photo.jpg', metadata: {} }],
          sessionId: 'test'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        const result = await analyzePhotos(state, config);

        expect(result.photoAnalyses.analyses[0].filename).toBe('photo.jpg');
      });

      it('calls Claude with haiku model', async () => {
        const mockClient = jest.fn().mockResolvedValue({
          filename: 'test.jpg',
          visualContent: 'Content',
          narrativeMoment: 'Moment'
        });

        const state = {
          sessionPhotos: ['photo1.jpg'],
          sessionId: 'test'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        await analyzePhotos(state, config);

        expect(mockClient).toHaveBeenCalledWith(
          expect.objectContaining({ model: 'haiku' })
        );
      });

      it('includes player focus in prompt', async () => {
        const mockClient = jest.fn().mockResolvedValue({
          filename: 'test.jpg',
          visualContent: 'Content',
          narrativeMoment: 'Moment'
        });

        const state = {
          sessionPhotos: ['photo1.jpg'],
          sessionId: 'test',
          playerFocus: { primaryInvestigation: 'Who is the Valet?' }
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        await analyzePhotos(state, config);

        // Player focus is now in userPrompt via ImagePromptBuilder
        expect(mockClient).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: expect.stringContaining('Who is the Valet?')
          })
        );
      });
    });

    describe('error handling', () => {
      it('handles individual photo analysis failure gracefully', async () => {
        let callCount = 0;
        const mockClient = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              filename: 'good.jpg',
              visualContent: 'Good content',
              narrativeMoment: 'Good moment'
            });
          }
          return Promise.reject(new Error('API timeout'));
        });

        const state = {
          sessionPhotos: ['good.jpg', 'bad.jpg'],
          sessionId: 'test'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        const result = await analyzePhotos(state, config);

        // Should still complete with partial results
        // Parallel branch architecture: analyzePhotos is pure, checkpointCharacterIds handles interrupt
        expect(result.currentPhase).toBe(PHASES.ANALYZE_PHOTOS);
        expect(result.photoAnalyses.analyses.length).toBe(2);
        expect(result.photoAnalyses.stats.analyzedPhotos).toBe(1);
        expect(result.photoAnalyses.stats.failedPhotos).toBe(1);

        // Failed photo should have placeholder
        const failedAnalysis = result.photoAnalyses.analyses[1];
        expect(failedAnalysis._error).toBe('API timeout');
        expect(failedAnalysis.storyRelevance).toBe('contextual');
      });

      it('throws when all photos fail (N2 fail-loud, no empty fallthrough)', async () => {
        const mockClient = jest.fn().mockRejectedValue(new Error('Service unavailable'));

        const state = {
          sessionPhotos: ['photo1.jpg'],
          sessionId: 'test'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        // N2: a total failure (every photo errored) is an outage, not graceful degradation.
        // analyzePhotos must throw rather than return an empty/placeholder result that
        // flows onward and yields mis-attributed captions.
        await expect(analyzePhotos(state, config)).rejects.toThrow(/photo analysis failed/i);
      });

      it('throws on total failure even when the SDK throws synchronously', async () => {
        const mockClient = jest.fn().mockImplementation(() => {
          throw new Error('Complete failure');
        });

        const state = {
          sessionPhotos: ['photo1.jpg'],
          sessionId: 'test'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        // analyzeSinglePhoto's catch still converts the sync throw into a placeholder, so the
        // single-photo batch ends with analyzedPhotos === 0 → the N2 guard throws.
        await expect(analyzePhotos(state, config)).rejects.toThrow(/photo analysis failed/i);
      });
    });

    describe('state updates', () => {
      it('returns partial state update', async () => {
        const mockClient = jest.fn().mockResolvedValue({
          filename: 'test.jpg',
          visualContent: 'Content',
          narrativeMoment: 'Moment'
        });

        const state = {
          sessionPhotos: ['photo1.jpg'],
          sessionId: 'test',
          existingField: 'should-not-be-in-result'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        const result = await analyzePhotos(state, config);

        expect(result.photoAnalyses).toBeDefined();
        expect(result.currentPhase).toBeDefined();
        expect(result.existingField).toBeUndefined();
      });

      it('includes processing time in stats', async () => {
        const mockClient = jest.fn().mockResolvedValue({
          filename: 'test.jpg',
          visualContent: 'Content',
          narrativeMoment: 'Moment'
        });

        const state = {
          sessionPhotos: ['photo1.jpg'],
          sessionId: 'test'
        };
        const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

        const result = await analyzePhotos(state, config);

        expect(result.photoAnalyses.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('createMockPhotoAnalyzer', () => {
    it('creates mock with analyze method', () => {
      const mock = createMockPhotoAnalyzer();

      expect(typeof mock.analyze).toBe('function');
    });

    it('returns valid structure from analyze', async () => {
      const mock = createMockPhotoAnalyzer();
      const result = await mock.analyze(
        ['photo1.jpg', 'photo2.jpg'],
        { primaryInvestigation: 'Test' }
      );

      expect(result.analyses).toBeDefined();
      expect(result.analyses.length).toBe(2);
      expect(result.analyzedAt).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it('uses analysisPrefix for customization', async () => {
      const mock = createMockPhotoAnalyzer({ analysisPrefix: 'CustomPrefix' });
      const result = await mock.analyze(['photo1.jpg'], {});

      expect(result.analyses[0].visualContent).toContain('CustomPrefix');
    });

    it('produces analyses with all required fields', async () => {
      const mock = createMockPhotoAnalyzer();
      const result = await mock.analyze(['photo1.jpg'], {});

      const analysis = result.analyses[0];
      expect(analysis.filename).toBeDefined();
      expect(analysis.visualContent).toBeDefined();
      expect(analysis.narrativeMoment).toBeDefined();
      expect(analysis.suggestedCaption).toBeDefined();
      expect(analysis.characterDescriptions).toBeDefined();
      expect(analysis.emotionalTone).toBeDefined();
      expect(analysis.storyRelevance).toBeDefined();
    });
  });

  describe('finalizePhotoAnalyses - failed photo retry', () => {
    function makeAnalysis(filename, failed = false) {
      if (failed) return createFailedPhotoAnalysis(filename, 'SDK error');
      return {
        filename,
        visualContent: 'People gathered around table',
        narrativeMoment: 'Discussion phase',
        suggestedCaption: 'A group discussion',
        characterDescriptions: [],
        emotionalTone: 'tense',
        storyRelevance: 'supporting'
      };
    }

    it('retries failed photo analyses and recovers them', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        filename: 'failed.jpg',
        visualContent: 'Recovered content',
        narrativeMoment: 'Recovered moment',
        suggestedCaption: 'Recovered caption',
        characterDescriptions: [],
        emotionalTone: 'neutral',
        storyRelevance: 'contextual'
      });

      const state = {
        photoAnalyses: {
          analyses: [
            makeAnalysis('good.jpg'),
            makeAnalysis('failed.jpg', true)
          ],
          stats: { totalPhotos: 2, analyzedPhotos: 1, failedPhotos: 1 }
        },
        sessionPhotos: ['/photos/good.jpg', '/photos/failed.jpg'],
        sessionConfig: { roster: ['Alice', 'Bob'] },
        characterIdMappings: {},
        playerFocus: {}
      };
      const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

      const result = await finalizePhotoAnalyses(state, config);

      // The failed photo should have been retried and recovered
      const recoveredAnalysis = result.photoAnalyses.analyses.find(a => a.filename === 'failed.jpg');
      expect(recoveredAnalysis._error).toBeUndefined();
      expect(recoveredAnalysis.visualContent).toBe('Recovered content');
      expect(result.photoAnalyses.enrichmentStats.retriedPhotos).toBe(1);
      expect(result.photoAnalyses.enrichmentStats.recoveredPhotos).toBe(1);
    });

    it('keeps failed placeholder when retry also fails', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('Still broken'));

      const state = {
        photoAnalyses: {
          analyses: [
            makeAnalysis('good.jpg'),
            makeAnalysis('failed.jpg', true)
          ],
          stats: { totalPhotos: 2, analyzedPhotos: 1, failedPhotos: 1 }
        },
        sessionPhotos: ['/photos/good.jpg', '/photos/failed.jpg'],
        sessionConfig: { roster: [] },
        characterIdMappings: {},
        playerFocus: {}
      };
      const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

      const result = await finalizePhotoAnalyses(state, config);

      // Failed photo stays failed
      const stillFailed = result.photoAnalyses.analyses.find(a => a.filename === 'failed.jpg');
      expect(stillFailed._error).toBeDefined();
      expect(result.photoAnalyses.enrichmentStats.retriedPhotos).toBe(1);
      expect(result.photoAnalyses.enrichmentStats.recoveredPhotos).toBe(0);
    });

    it('skips retry when no photos failed', async () => {
      const mockClient = jest.fn();

      const state = {
        photoAnalyses: {
          analyses: [makeAnalysis('good1.jpg'), makeAnalysis('good2.jpg')],
          stats: { totalPhotos: 2, analyzedPhotos: 2, failedPhotos: 0 }
        },
        sessionPhotos: ['/photos/good1.jpg', '/photos/good2.jpg'],
        sessionConfig: { roster: [] },
        characterIdMappings: {},
        playerFocus: {}
      };
      const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

      const result = await finalizePhotoAnalyses(state, config);

      // No SDK calls for retry (only enrichment passthrough)
      expect(mockClient).not.toHaveBeenCalled();
      expect(result.photoAnalyses.enrichmentStats.retriedPhotos).toBe(0);
      expect(result.photoAnalyses.enrichmentStats.recoveredPhotos).toBe(0);
    });

    it('skips retry for photo whose path is not in sessionPhotos', async () => {
      const mockClient = jest.fn();

      const state = {
        photoAnalyses: {
          analyses: [makeAnalysis('orphaned.jpg', true)],
          stats: { totalPhotos: 1, analyzedPhotos: 0, failedPhotos: 1 }
        },
        sessionPhotos: ['/photos/different.jpg'], // No match for orphaned.jpg
        sessionConfig: { roster: [] },
        characterIdMappings: {},
        playerFocus: {}
      };
      const config = { configurable: { sdkClient: mockClient, imagePromptBuilder: mockImagePromptBuilder } };

      const result = await finalizePhotoAnalyses(state, config);

      // Should not attempt SDK call since path couldn't be resolved
      expect(mockClient).not.toHaveBeenCalled();
      // Original failed analysis preserved
      const stillFailed = result.photoAnalyses.analyses.find(a => a.filename === 'orphaned.jpg');
      expect(stillFailed._error).toBeDefined();
    });
  });

  describe('PHOTO_ANALYSIS_SCHEMA', () => {
    it('has required fields defined', () => {
      expect(PHOTO_ANALYSIS_SCHEMA.required).toContain('filename');
      expect(PHOTO_ANALYSIS_SCHEMA.required).toContain('visualContent');
      expect(PHOTO_ANALYSIS_SCHEMA.required).toContain('narrativeMoment');
    });

    it('defines emotionalTone as description-guided string', () => {
      const emotionalTone = PHOTO_ANALYSIS_SCHEMA.properties.emotionalTone;

      expect(emotionalTone.type).toBe('string');
      expect(emotionalTone.enum).toBeUndefined();
      expect(emotionalTone.description).toContain('tense');
      expect(emotionalTone.description).toContain('revelatory');
    });

    it('defines storyRelevance as enum', () => {
      const storyRelevance = PHOTO_ANALYSIS_SCHEMA.properties.storyRelevance;

      expect(storyRelevance.type).toBe('string');
      expect(storyRelevance.enum).toContain('critical');
      expect(storyRelevance.enum).toContain('supporting');
      expect(storyRelevance.enum).toContain('contextual');
    });

    it('defines characterDescriptions as array', () => {
      const charDesc = PHOTO_ANALYSIS_SCHEMA.properties.characterDescriptions;

      expect(charDesc.type).toBe('array');
      expect(charDesc.items.properties.description).toBeDefined();
      expect(charDesc.items.properties.role).toBeDefined();
    });
  });
});

// Reference _testing to avoid unused variable warning
const _testing = {
  getSdkClient,
  buildPhotoAnalysisSystemPrompt,
  createEmptyPhotoAnalysisResult,
  createFailedPhotoAnalysis,
  safeParseJson,
  PHOTO_ANALYSIS_SCHEMA
};

/**
 * The leave-out box (phase 4, brief 4.2): the character-ID parse writes an explicit
 * `exclude` into the mapping of every photo the stop showed, in each of its paths, after
 * it builds the mappings and before finalizePhotoAnalyses reads them: true when the photo
 * is on the leave-out list (its box was ticked), otherwise the parse's own value,
 * otherwise false. The mapping then decides for every photo the director saw.
 */
describe('parseCharacterIds: the explicit leave-out mark in each path (brief 4.2)', () => {
  const { parseCharacterIds } = require('../../../lib/workflow/nodes/photo-nodes');
  const analyses = { analyses: ['a.jpg', 'b.jpg', 'c.jpg'].map((filename) => ({ filename, characterDescriptions: [] })) };
  const mapping = (exclude, extra = {}) => ({ characterMappings: [], additionalCharacters: [], corrections: {}, ...extra, exclude });
  const config = (sdk) => ({ configurable: { sdkClient: sdk, imagePromptBuilder: mockImagePromptBuilder } });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('no text to parse (the stop sent structured ids, as its Skip does): marks every photo, the ticked one true', async () => {
    const sdk = jest.fn();
    const result = await parseCharacterIds({
      characterIdsRaw: null,
      characterIdMappings: {},
      leftOutPhotos: ['b.jpg'],
      photoAnalyses: analyses
    }, config(sdk));

    expect(sdk).not.toHaveBeenCalled();
    expect(result.currentPhase).toBe(PHASES.PARSE_CHARACTER_IDS);
    expect(result.characterIdMappings).toEqual({ 'a.jpg': mapping(false), 'b.jpg': mapping(true), 'c.jpg': mapping(false) });
  });

  it('structured mappings already given: keeps each one\'s own value and adds the box\'s', async () => {
    const sdk = jest.fn();
    const result = await parseCharacterIds({
      characterIdsRaw: 'text from an earlier round',
      characterIdMappings: { 'a.jpg': mapping(true, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] }) },
      leftOutPhotos: ['c.jpg'],
      photoAnalyses: analyses
    }, config(sdk));

    expect(sdk).not.toHaveBeenCalled();
    expect(result.characterIdMappings).toEqual({
      'a.jpg': mapping(true, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] }),
      'b.jpg': mapping(false),
      'c.jpg': mapping(true)
    });
  });

  it('the parse of the director\'s text: the box decides over the parse, the text decides where the box is clear, every other photo is kept', async () => {
    const sdk = jest.fn().mockResolvedValue({
      photos: [
        { filename: 'A.JPG', characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }], exclude: false },
        { filename: 'b.jpg', exclude: true }
      ]
    });
    const result = await parseCharacterIds({
      characterIdsRaw: 'Photo A: Vic by the bar. Photo B: leave this one out.',
      characterIdMappings: null,
      leftOutPhotos: ['a.jpg'],
      photoAnalyses: analyses,
      roster: ['Vic']
    }, config(sdk));

    expect(sdk).toHaveBeenCalledTimes(1);
    expect(result.characterIdMappings).toEqual({
      'A.JPG': mapping(true, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] }),
      'b.jpg': mapping(true),
      'c.jpg': mapping(false)
    });
  });

  it('no photo analyses: the stop showed no photo, and the mappings stay empty as before', async () => {
    const sdk = jest.fn();
    const result = await parseCharacterIds({
      characterIdsRaw: 'Photo A: Vic', characterIdMappings: null, leftOutPhotos: ['a.jpg'], photoAnalyses: { analyses: [] }
    }, config(sdk));
    expect(sdk).not.toHaveBeenCalled();
    expect(result.characterIdMappings).toEqual({});
  });

  it('finalizePhotoAnalyses then leaves the ticked photo out with no model call', async () => {
    const parsed = await parseCharacterIds({
      characterIdsRaw: null, characterIdMappings: {}, leftOutPhotos: ['b.jpg'], photoAnalyses: analyses
    }, config(jest.fn()));
    const sdk = jest.fn();
    const result = await finalizePhotoAnalyses({
      photoAnalyses: analyses, characterIdMappings: parsed.characterIdMappings, roster: []
    }, config(sdk));

    expect(sdk).not.toHaveBeenCalled();
    expect(result.photoAnalyses.analyses.map((a) => [a.filename, a.excluded === true])).toEqual([
      ['a.jpg', false], ['b.jpg', true], ['c.jpg', false]
    ]);
  });
});

/**
 * The leave-out box, follow-ups (phase 4, brief 4.2b). finalizePhotoAnalyses finds each
 * photo's mapping by photoKey, as isPhotoExcluded does, because the parse's keys need not
 * match an analysis filename's case. And it spends no retry of a failed analysis, a paid
 * vision call, on a photo isPhotoExcluded leaves out: that photo never prints.
 */
describe('finalizePhotoAnalyses: the leave-out box, follow-ups (brief 4.2b)', () => {
  const mapping = (exclude, extra = {}) => ({ characterMappings: [], additionalCharacters: [], corrections: {}, ...extra, exclude });
  const config = (sdk) => ({ configurable: { sdkClient: sdk, imagePromptBuilder: mockImagePromptBuilder } });
  const analysis = (filename) => ({
    filename,
    visualContent: 'Two people at a table',
    narrativeMoment: 'A negotiation',
    suggestedCaption: 'A deal at the table',
    characterDescriptions: [{ description: 'person in a grey coat', role: 'seated' }],
    emotionalTone: 'tense',
    storyRelevance: 'supporting'
  });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('a ticked photo whose mapping key differs from its filename only in case gets its excluded mark', async () => {
    const sdk = jest.fn();
    const result = await finalizePhotoAnalyses({
      photoAnalyses: { analyses: [analysis('a.jpg'), analysis('b.jpg')] },
      characterIdMappings: { 'A.JPG': mapping(true), 'b.jpg': mapping(false) },
      leftOutPhotos: ['a.jpg'],
      roster: []
    }, config(sdk));

    expect(sdk).not.toHaveBeenCalled();
    const [a, b] = result.photoAnalyses.analyses;
    expect(a.excluded).toBe(true);
    expect(a.finalCaption).toBeNull();
    expect(b.excluded).toBeUndefined();
    expect(result.photoAnalyses.enrichmentStats.excluded).toBe(1);
  });

  it('an identified photo whose mapping key differs only in case is enriched from that mapping', async () => {
    const sdk = jest.fn().mockResolvedValue({
      identifiedCharacters: ['Vic'], enrichedVisualContent: 'Vic at a table', enrichedNarrativeMoment: 'A negotiation', finalCaption: 'Vic waits'
    });
    const result = await finalizePhotoAnalyses({
      photoAnalyses: { analyses: [analysis('a.jpg')] },
      characterIdMappings: { 'A.JPG': mapping(false, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] }) },
      roster: ['Vic']
    }, config(sdk));

    expect(sdk).toHaveBeenCalledTimes(1);
    expect(sdk.mock.calls[0][0].prompt).toContain('"person in a grey coat" (seated) -> Vic');
    expect(result.photoAnalyses.analyses[0].identifiedCharacters).toEqual(['Vic']);
  });

  it('reads a photo\'s identifications and its exclusion from one entry, the one photoMappingOf finds (fix round 1)', async () => {
    // Two keys name each photo: the first holds no mapping, and the director's mapping
    // sits under the second. a.jpg is kept and identified; b.jpg is left out, and its
    // mapping also names someone, whom no call may read.
    const sdk = jest.fn().mockResolvedValue({
      identifiedCharacters: ['Vic'], enrichedVisualContent: 'Vic at a table', enrichedNarrativeMoment: 'A negotiation', finalCaption: 'Vic waits'
    });
    const result = await finalizePhotoAnalyses({
      photoAnalyses: { analyses: [analysis('a.jpg'), analysis('b.jpg')] },
      characterIdMappings: {
        'A.JPG': 'Vic',
        'a.jpg': mapping(false, { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] }),
        'B.JPG': ['Sam'],
        'b.jpg': mapping(true, { characterMappings: [{ descriptionIndex: 0, characterName: 'Sam' }] })
      },
      roster: ['Vic']
    }, config(sdk));

    expect(sdk).toHaveBeenCalledTimes(1);
    const { prompt } = sdk.mock.calls[0][0];
    expect(prompt).toContain('Filename: a.jpg');
    expect(prompt).toContain('"person in a grey coat" (seated) -> Vic');
    expect(prompt).not.toContain('-> Sam');
    const [a, b] = result.photoAnalyses.analyses;
    expect(a.identifiedCharacters).toEqual(['Vic']);
    expect(b.excluded).toBe(true);
    expect(b.identifiedCharacters).toEqual([]);
    expect(b.finalCaption).toBeNull();
  });

  it('spends no retry on a left-out photo whose analysis failed, and still retries a kept one', async () => {
    const sdk = jest.fn().mockResolvedValue({ ...analysis('kept.jpg'), visualContent: 'Recovered' });
    const result = await finalizePhotoAnalyses({
      photoAnalyses: { analyses: [createFailedPhotoAnalysis('out.jpg', 'SDK error'), createFailedPhotoAnalysis('kept.jpg', 'SDK error')] },
      sessionPhotos: ['/photos/out.jpg', '/photos/kept.jpg'],
      characterIdMappings: { 'out.jpg': mapping(true), 'kept.jpg': mapping(false) },
      leftOutPhotos: ['out.jpg'],
      roster: []
    }, config(sdk));

    expect(sdk.mock.calls.map(([options]) => options.label)).toEqual(['kept.jpg']);
    const [out, kept] = result.photoAnalyses.analyses;
    expect(out.excluded).toBe(true);
    expect(out._error).toBe('SDK error');
    expect(kept._error).toBeUndefined();
    expect(kept.visualContent).toBe('Recovered');
    expect(result.photoAnalyses.enrichmentStats.retriedPhotos).toBe(1);
  });
});

/**
 * A kept photo's analysis carries no exclusion from an earlier round (phase 4, task 4.3c).
 * A rollback to the character-IDs stop keeps the analyses, and finalizePhotoAnalyses runs
 * again when no photo was identified, so an analysis can arrive still marked excluded from
 * the round before. A photo the mapping keeps loses that mark in each branch that keeps it,
 * so the analysis and enrichmentStats.excluded agree with the mapping.
 */
describe('finalizePhotoAnalyses: a kept photo loses a stale exclusion (task 4.3c)', () => {
  const mapping = (exclude, extra = {}) => ({ characterMappings: [], additionalCharacters: [], corrections: {}, ...extra, exclude });
  const named = (name) => ({ characterMappings: [{ descriptionIndex: 0, characterName: name }] });
  const config = (sdk) => ({ configurable: { sdkClient: sdk, imagePromptBuilder: mockImagePromptBuilder } });
  const staleAnalysis = (filename) => ({
    filename,
    excluded: true,
    visualContent: 'Two people at a table',
    narrativeMoment: 'A negotiation',
    suggestedCaption: 'A deal at the table',
    characterDescriptions: [{ description: 'person in a grey coat', role: 'seated' }]
  });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('drops the mark when the photo is kept with no identification, enriched, or enriched by the fallback after an error', async () => {
    const sdk = jest.fn(async (options) => {
      if (options.prompt.includes('Filename: failed.jpg')) throw new Error('SDK error');
      return { identifiedCharacters: ['Vic'], enrichedVisualContent: 'Vic at a table', enrichedNarrativeMoment: 'A negotiation', finalCaption: 'Vic waits' };
    });
    const result = await finalizePhotoAnalyses({
      photoAnalyses: { analyses: ['plain.jpg', 'named.jpg', 'failed.jpg', 'out.jpg'].map(staleAnalysis) },
      characterIdMappings: {
        'plain.jpg': mapping(false), 'named.jpg': mapping(false, named('Vic')), 'failed.jpg': mapping(false, named('Sam')), 'out.jpg': mapping(true)
      },
      roster: ['Vic', 'Sam']
    }, config(sdk));

    expect(sdk).toHaveBeenCalledTimes(2);
    const byName = Object.fromEntries(result.photoAnalyses.analyses.map((a) => [a.filename, a]));
    ['plain.jpg', 'named.jpg', 'failed.jpg'].forEach((filename) => expect([filename, 'excluded' in byName[filename]]).toEqual([filename, false]));
    expect(byName['named.jpg'].identifiedCharacters).toEqual(['Vic']);
    expect(byName['failed.jpg']._enrichmentError).toBe('SDK error');
    expect(byName['out.jpg'].excluded).toBe(true);
    expect(result.photoAnalyses.enrichmentStats.excluded).toBe(1);
  });
});
