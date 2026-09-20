/**
 * generateOutline joins photo analyses by filename, not by array position
 * (phase 1, brief 1.6).
 *
 * `availablePhotos` filtered the hero and the whiteboard out of state.sessionPhotos
 * and THEN read `state.photoAnalyses.analyses[i]` with `i` counting the filtered
 * list. Every analysis after the first removed photo therefore landed on the wrong
 * photo: the outline writer was told photo B shows what photo A shows, and placed
 * it accordingly. The hero is removed on every real run, so the whole list was
 * shifted by one in every session that had a hero.
 *
 * The join is the one the console's photoUrl already uses: basename, case-insensitive.
 */

jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  createTracedSdkQuery: (fn) => fn,
  progressEmitter: { emit: jest.fn(), subscribe: jest.fn(), emitComplete: jest.fn() }
}));
jest.mock('../workflow/checkpoint-helpers',
  () => require('../../__tests__/mocks/checkpoint-helpers.mock'));

const { generateOutline } = require('../workflow/nodes/ai-nodes');
const mockOutline = require('../../__tests__/fixtures/mock-responses/outline.json');

/** Capture the availablePhotos argument generateOutline hands the prompt builder. */
function makeCapturingConfig() {
  const captured = {};
  const promptBuilder = {
    theme: { loadPhasePrompts: async () => ({}), validate: async () => ({ valid: true, missing: [] }) },
    async buildOutlinePrompt(arcAnalysis, selectedArcs, heroImage, availablePhotos) {
      captured.heroImage = heroImage;
      captured.availablePhotos = availablePhotos;
      return { systemPrompt: 's', userPrompt: 'u' };
    }
  };
  return { captured, config: { configurable: { sdkClient: async () => mockOutline, promptBuilder } } };
}

/** An analysis whose description names its own photo, so a shift is visible. */
const analysisFor = (filename, characters) => ({
  filename,
  visualContent: `visual of ${filename}`,
  characterDescriptions: characters.map((description) => ({ description }))
});

describe('generateOutline availablePhotos join', () => {
  it('keeps every description on its own photo once the hero is filtered out', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      sessionPhotos: [
        'data/091826/photos/group.jpg',
        'data/091826/photos/bar.jpg',
        'data/091826/photos/hallway.jpg'
      ],
      photoAnalyses: {
        analyses: [
          // group.jpg names three characters, so it is chosen as the hero and
          // dropped from availablePhotos — the shift that broke everything after it.
          analysisFor('group.jpg', ['Vic', 'Alex', 'Sam']),
          analysisFor('bar.jpg', ['Blake at the bar']),
          analysisFor('hallway.jpg', ['Morgan in the hallway'])
        ]
      }
    };

    await generateOutline(state, config);

    expect(captured.heroImage).toBe('group.jpg');
    expect(captured.availablePhotos).toEqual([
      { filename: 'bar.jpg', fullPath: 'data/091826/photos/bar.jpg', characters: ['Blake at the bar'], visualContent: 'visual of bar.jpg' },
      { filename: 'hallway.jpg', fullPath: 'data/091826/photos/hallway.jpg', characters: ['Morgan in the hallway'], visualContent: 'visual of hallway.jpg' }
    ]);
  });

  it('survives a filtered whiteboard and an analysis list in another order', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      whiteboardPhotoPath: 'data/091826/photos/whiteboard.jpg',
      sessionPhotos: [
        'data/091826/photos/whiteboard.jpg',
        'data/091826/photos/toast.jpg',
        'data/091826/photos/kitchen.jpg'
      ],
      photoAnalyses: {
        analyses: [
          analysisFor('kitchen.jpg', ['Kai in the kitchen']),
          analysisFor('whiteboard.jpg', ['the board']),
          analysisFor('toast.jpg', ['Nova raising a glass'])
        ]
      }
    };

    await generateOutline(state, config);

    const byName = Object.fromEntries(captured.availablePhotos.map((p) => [p.filename, p.characters]));
    expect(byName).toEqual({ 'kitchen.jpg': ['Kai in the kitchen'] });
    expect(captured.heroImage).toBe('toast.jpg');
  });

  it('matches the basename case-insensitively, as the console does', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      sessionPhotos: ['data/091826/photos/Hero.JPG', 'data/091826/photos/Bar.JPG'],
      photoAnalyses: { analyses: [analysisFor('hero.jpg', ['Vic', 'Alex']), analysisFor('bar.JPG', ['Blake'])] }
    };

    await generateOutline(state, config);

    expect(captured.heroImage).toBe('Hero.JPG');
    expect(captured.availablePhotos).toHaveLength(1);
    expect(captured.availablePhotos[0].characters).toEqual(['Blake']);
  });

  it('leaves a photo with no analysis empty rather than borrowing the next one', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      sessionPhotos: ['data/091826/photos/a.jpg', 'data/091826/photos/b.jpg'],
      photoAnalyses: { analyses: [analysisFor('b.jpg', ['Blake'])] }
    };

    await generateOutline(state, config);

    const byName = Object.fromEntries(captured.availablePhotos.map((p) => [p.filename, p.characters]));
    expect(byName['a.jpg']).toEqual([]);
  });
});
