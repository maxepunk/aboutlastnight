/**
 * The roster has to reach the photo nodes (CODE-REVIEW H4, backend half)
 *
 * The roster is collected at `await-roster`, which the graph reaches at 1.51 —
 * BEFORE parseRawInput stamps it onto sessionConfig at 0.1. Every photo node
 * read `state.sessionConfig?.roster`, which is empty at that point, so the
 * character-ID parse and the photo enrichment both ran with NO roster: the
 * parser had no valid-name list to disambiguate against and the caption writer
 * had no names to use. `resolveRoster` prefers the incremental channel and falls
 * back to sessionConfig, so both paths work whichever stage of the run they run
 * in.
 */

jest.mock('../workflow/checkpoint-helpers',
  () => require('../../__tests__/mocks/checkpoint-helpers.mock'));

const { parseCharacterIds, finalizePhotoAnalyses } = require('../workflow/nodes/photo-nodes');
const { resolveRoster } = require('../workflow/nodes/node-helpers');
const { createImagePromptBuilder } = require('../image-prompt-builder');

const ANALYSES = {
  analyses: [{
    filename: 'aln-1.jpg',
    visualContent: 'Two people at a table',
    narrativeMoment: 'A negotiation',
    emotionalTone: 'tense',
    storyRelevance: 'high',
    characterDescriptions: [{ description: 'person in a grey coat', role: 'seated' }]
  }],
  stats: { totalPhotos: 1, analyzedPhotos: 1 }
};

/** Capture every prompt the node sends, with the real ImagePromptBuilder. */
function makeConfig(sdkResult) {
  const prompts = [];
  return {
    prompts,
    config: {
      configurable: {
        imagePromptBuilder: createImagePromptBuilder(),
        sdkClient: async ({ prompt }) => { prompts.push(prompt); return sdkResult; }
      }
    }
  };
}

describe('resolveRoster', () => {
  it('prefers the incremental roster channel', () => {
    expect(resolveRoster({ roster: ['Vic', 'Mel'], sessionConfig: { roster: ['Stale'] } }))
      .toEqual(['Vic', 'Mel']);
  });

  it('falls back to sessionConfig when the channel is empty', () => {
    expect(resolveRoster({ roster: [], sessionConfig: { roster: ['Vic'] } })).toEqual(['Vic']);
    expect(resolveRoster({ roster: null, sessionConfig: { roster: ['Vic'] } })).toEqual(['Vic']);
  });

  it('returns an empty array when neither is set', () => {
    expect(resolveRoster({})).toEqual([]);
    expect(resolveRoster({ roster: null, sessionConfig: null })).toEqual([]);
    expect(resolveRoster(null)).toEqual([]);
  });
});

describe('parseCharacterIds sees the roster', () => {
  it('uses state.roster when sessionConfig is not populated yet', async () => {
    const { prompts, config } = makeConfig({ photos: [] });

    await parseCharacterIds({
      roster: ['Vic', 'Mel'],
      sessionConfig: null,
      photoAnalyses: ANALYSES,
      characterIdsRaw: 'the grey coat is Vic'
    }, config);

    expect(prompts.join('\n')).toContain('VALID ROSTER:\nVic, Mel');
  });

  it('state.roster wins when both are set', async () => {
    const { prompts, config } = makeConfig({ photos: [] });

    await parseCharacterIds({
      roster: ['Vic', 'Mel'],
      sessionConfig: { roster: ['Stale', 'Names'] },
      photoAnalyses: ANALYSES,
      characterIdsRaw: 'the grey coat is Vic'
    }, config);

    expect(prompts.join('\n')).toContain('VALID ROSTER:\nVic, Mel');
    expect(prompts.join('\n')).not.toContain('Stale');
  });
});

describe('finalizePhotoAnalyses sees the roster', () => {
  const ENRICHED = {
    enrichedVisualContent: 'Vic at the table',
    enrichedNarrativeMoment: 'A negotiation',
    finalCaption: 'Vic waits',
    identifiedCharacters: ['Vic'],
    boundaryCheck: 'clean'
  };

  it('uses state.roster when sessionConfig is not populated yet', async () => {
    const { prompts, config } = makeConfig(ENRICHED);

    await finalizePhotoAnalyses({
      roster: ['Vic', 'Mel'],
      sessionConfig: null,
      photoAnalyses: ANALYSES,
      characterIdMappings: { 'aln-1.jpg': { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] } }
    }, config);

    expect(prompts.join('\n')).toContain('ROSTER: Vic, Mel');
  });

  it('state.roster wins when both are set', async () => {
    const { prompts, config } = makeConfig(ENRICHED);

    await finalizePhotoAnalyses({
      roster: ['Vic', 'Mel'],
      sessionConfig: { roster: ['Stale', 'Names'] },
      photoAnalyses: ANALYSES,
      characterIdMappings: { 'aln-1.jpg': { characterMappings: [{ descriptionIndex: 0, characterName: 'Vic' }] } }
    }, config);

    expect(prompts.join('\n')).toContain('ROSTER: Vic, Mel');
    expect(prompts.join('\n')).not.toContain('Stale');
  });
});
