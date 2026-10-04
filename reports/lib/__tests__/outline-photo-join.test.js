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
 *
 * Phase 2, brief 2.2: what the join carries changed. Each photo now brings the names
 * the director identified in it (identifiedCharacters); Haiku's pre-identification
 * descriptions no longer reach the outline writer, which reads the director's own
 * description of the photo instead (joined by filename in the prompt builder).
 *
 * Phase 4 (brief 4.6): the outline writer is the map writer, whose photo list is code's
 * pick for the top photo first (marked `hero: true`), then the others the director kept.
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
    async buildOutlinePrompt(settledWeave, photos) {
      const hero = photos.find((photo) => photo.hero);
      captured.heroImage = hero ? hero.filename : null;
      captured.availablePhotos = photos.filter((photo) => !photo.hero);
      return { systemPrompt: 's', userPrompt: 'u' };
    }
  };
  return { captured, config: { configurable: { sdkClient: async () => mockOutline, promptBuilder } } };
}

/** An analysis whose names are its own photo's, so a shift is visible. */
const analysisFor = (filename, characters) => ({
  filename,
  visualContent: `visual of ${filename}`,
  characterDescriptions: characters.map((description) => ({ description })),
  identifiedCharacters: characters
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
      { filename: 'bar.jpg', fullPath: 'data/091826/photos/bar.jpg', identifiedCharacters: ['Blake at the bar'] },
      { filename: 'hallway.jpg', fullPath: 'data/091826/photos/hallway.jpg', identifiedCharacters: ['Morgan in the hallway'] }
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

    const byName = Object.fromEntries(captured.availablePhotos.map((p) => [p.filename, p.identifiedCharacters]));
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
    expect(captured.availablePhotos[0].identifiedCharacters).toEqual(['Blake']);
  });

  it('leaves a photo with no analysis empty rather than borrowing the next one', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      sessionPhotos: ['data/091826/photos/a.jpg', 'data/091826/photos/b.jpg'],
      photoAnalyses: { analyses: [analysisFor('b.jpg', ['Blake'])] }
    };

    await generateOutline(state, config);

    const byName = Object.fromEntries(captured.availablePhotos.map((p) => [p.filename, p.identifiedCharacters]));
    expect(byName['a.jpg']).toEqual([]);
  });

  it('carries no pre-identification description to the writer (brief 2.2)', async () => {
    const { captured, config } = makeCapturingConfig();
    const state = {
      sessionPhotos: ['data/092026/photos/hero.jpg', 'data/092026/photos/seven.jpg'],
      photoAnalyses: {
        analyses: [
          analysisFor('hero.jpg', ['Vic', 'Alex', 'Sam']),
          { filename: 'seven.jpg', visualContent: 'two people at a table', characterDescriptions: [{ description: 'person in red' }], identifiedCharacters: ['Alex', 'Sam'] }
        ]
      }
    };

    await generateOutline(state, config);

    expect(captured.availablePhotos).toEqual([
      { filename: 'seven.jpg', fullPath: 'data/092026/photos/seven.jpg', identifiedCharacters: ['Alex', 'Sam'] }
    ]);
    expect(JSON.stringify(captured.availablePhotos)).not.toMatch(/person in red|two people at a table/);
  });
});
