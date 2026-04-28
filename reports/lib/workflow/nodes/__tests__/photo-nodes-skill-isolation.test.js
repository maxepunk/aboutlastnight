const { _testing } = require('../photo-nodes');

function makeCapturingSdk() {
  const calls = [];
  const fn = async (options) => {
    calls.push(options);
    return {
      filename: options.label || 'unknown.jpg',
      visualContent: 'mock content',
      narrativeMoment: 'mock moment',
      suggestedCaption: 'mock caption',
      characterDescriptions: [],
      emotionalTone: 'neutral',
      storyRelevance: 'supporting'
    };
  };
  fn.calls = calls;
  return fn;
}

describe('photo-nodes skill isolation', () => {
  test('analyzeSinglePhoto passes loadProjectSettings: false to sdk', async () => {
    expect(_testing).toBeDefined();
    expect(_testing.analyzeSinglePhoto).toBeDefined();

    const sdk = makeCapturingSdk();
    const promptBuilder = {
      buildPhotoAnalysisPrompt: async () => ({ systemPrompt: 'sys', userPrompt: 'user' })
    };

    await _testing.analyzeSinglePhoto({
      sdk,
      imagePromptBuilder: promptBuilder,
      playerFocus: {},
      roster: [],
      processedPath: '/tmp/test.jpg',
      originalFilename: 'test.jpg',
      timeoutMs: 60000
    });

    expect(sdk.calls.length).toBeGreaterThan(0);
    expect(sdk.calls[0].loadProjectSettings).toBe(false);
  });
});
