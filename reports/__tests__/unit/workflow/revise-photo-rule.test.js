/**
 * Task 4.5f: the article rework gives the restore the photos the article can print (the
 * integrator's ruling 1 on 4.5e's findings, progress.md 2026-10-04).
 *
 * 4.5e taught the restore (lib/hand-edit-diff.js settleEdits) to leave out a photo the article
 * cannot print, given the list of photos it can print, and no caller gave the list, so an
 * automatic pass that fixed an invalid photo the director captioned had its fix undone and the
 * round spent its budget on the photo. reviseContentBundle now gives the session's kept photos
 * (ai-nodes.js keptPhotoFilenames), which follow the fact check's rule for a usable photo:
 * - the list equals the photos the fact check reads as usable references, an empty list
 *   included, when the session holds photos and the director kept none;
 * - with no session photos the fact check checks none, and the restore is given no list.
 *
 * getSdkClient returns config.configurable.sdkClient as-is, so a jest.fn is the model here.
 * Invented text.
 */
const { keptPhotoFilenames, reviseContentBundle, createMockPromptBuilder } = require('../../../lib/workflow/nodes/ai-nodes');
const { _testing: { buildFactCheckArgs } } = require('../../../lib/workflow/nodes/evaluator-nodes');
const { factCheckContentBundle } = require('../../../lib/content-bundle-fact-check');
const { standingAfterSendBack } = require('../../../lib/hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });
const photo = (filename, caption = 'The huddle at the bar.') => ({ type: 'photo', filename, caption });

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('4.5f: the kept photos are the photos the fact check reads as usable references', () => {
  /**
   * The names among `names` the fact check reads as usable: a bundle printing a photo block for
   * each, checked with the arguments the article's evaluation builds from `state`, less the
   * names it lists as invalid references.
   */
  function usableByFactCheck(state, names) {
    const contentBundle = { sections: [{ id: 's', type: 'narrative', content: names.map((name) => photo(name)) }], evidenceCards: [] };
    const result = factCheckContentBundle({ ...buildFactCheckArgs({ ...state, contentBundle }), evidenceBundle: { exposed: { tokens: [], paperEvidence: [] } } });
    return names.filter((name) => !result.photoReferences.invalid.includes(name));
  }
  const basenames = (state) => state.sessionPhotos.map((p) => p.split(/[/\\]/).pop());

  it.each([
    ['the director left one photo out at the photos stop and another by the analysis, and the whiteboard is among the photos', {
      sessionPhotos: ['/data/0926262/photos/a.jpg', 'C:\\data\\0926262\\photos\\b.jpg', 'photos/c.jpg', 'photos/d.jpg', 'photos/wb.jpg'],
      whiteboardPhotoPath: 'photos/wb.jpg',
      characterIdMappings: { 'C.JPG': { exclude: true } },
      photoAnalyses: { analyses: [{ filename: 'd.jpg', excluded: true }] }
    }, ['a.jpg', 'b.jpg']],
    ['the session holds photos and the director kept none', {
      sessionPhotos: ['photos/a.jpg', 'photos/wb.jpg'],
      whiteboardPhotoPath: 'photos/wb.jpg',
      characterIdMappings: { 'a.jpg': { exclude: true } }
    }, []],
    ['the session holds only the whiteboard', { sessionPhotos: ['photos/wb.jpg'], whiteboardPhotoPath: 'photos/wb.jpg' }, []]
  ])('%s', (_name, state, kept) => {
    const names = [...basenames(state), 'not-ours.jpg', 'A.JPG'];
    expect(keptPhotoFilenames(state, null)).toEqual(kept);
    expect(usableByFactCheck(state, names)).toEqual(kept);
  });

  it('with no session photos the fact check checks no photo, and the kept list is empty: the rework gives the restore no list (below)', () => {
    const state = { sessionPhotos: [] };
    expect(keptPhotoFilenames(state, null)).toEqual([]);
    expect(usableByFactCheck(state, ['a.jpg', 'not-ours.jpg'])).toEqual(['a.jpg', 'not-ours.jpg']);
  });
});

describe('4.5f: the article rework gives the restore the photos the article can print', () => {
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const CAPTION = 'Six people huddle at the bar, late in the evening.';
  const article = (content) => ({
    metadata: { sessionId: '0926262' },
    headline: { main: 'The Room Voted Five to Four', kicker: 'NovaNews', deck: 'The room named Alex.' },
    sections: [{ id: 's', type: 'narrative', heading: 'The Story', content: content.map(clone) }]
  });
  const cfg = (sdk) => ({ configurable: { sdkClient: sdk, promptBuilder: createMockPromptBuilder(), theme: 'journalist' } });

  /** The director captions the writer's photo `filename` and sends back (E1); then an automatic pass takes the photo out. */
  async function automaticPass(filename, state) {
    const sentBack = article([A, photo(filename, CAPTION), B]);
    const standing = standingAfterSendBack(null, article([A, photo(filename), B]), sentBack, 'bundle');
    return reviseContentBundle(
      { ...state, _previousContentBundle: sentBack, _articleHandEdits: standing, articleRevisionCount: 1 },
      cfg(jest.fn(async () => article([A, B])))
    );
  }

  it("a photo the session does not hold stays out, and the director's caption with it", async () => {
    const result = await automaticPass('not-ours.jpg', { sessionPhotos: ['photos/a.jpg'] });
    expect(result.contentBundle.sections[0].content).toEqual([A, B]);
    expect(result._articleHandEditReport.changed).toEqual([expect.objectContaining({ id: 'E1', restored: false, unprintable: true })]);
  });

  it('the session holds photos and the director kept none: the photo stays out', async () => {
    const result = await automaticPass('a.jpg', { sessionPhotos: ['photos/a.jpg'], characterIdMappings: { 'a.jpg': { exclude: true } } });
    expect(result.contentBundle.sections[0].content).toEqual([A, B]);
    expect(result._articleHandEditReport.changed).toEqual([expect.objectContaining({ id: 'E1', restored: false, unprintable: true })]);
  });

  it("a photo the director kept goes back with the director's caption", async () => {
    const result = await automaticPass('a.jpg', { sessionPhotos: ['photos/a.jpg'] });
    expect(result.contentBundle.sections[0].content).toEqual([A, photo('a.jpg', CAPTION), B]);
    expect(result._articleHandEditReport.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
    expect(result._articleHandEditReport.changed[0]).not.toHaveProperty('unprintable');
  });

  it('the session holds no photos: the restore is given no list, and the photo goes back, as the fact check checks none', async () => {
    const result = await automaticPass('not-ours.jpg', { sessionPhotos: [] });
    expect(result.contentBundle.sections[0].content).toEqual([A, photo('not-ours.jpg', CAPTION), B]);
    expect(result._articleHandEditReport.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5g: one rule for the session's photo names, and the whiteboard stays out with no list (the
// integrator's ruling 1 on 4.5f's findings, progress.md 2026-10-04; the 4.5f review's minors 2
// and 3). Invented text.
// ═══════════════════════════════════════════════════════════════════════════
describe("4.5g: the session's photo names decide whether the fact check checks the session's photos and whether the rework gives the restore its list", () => {
  const { sessionPhotoNames } = require('../../../lib/hand-edit-diff');
  const A = paragraph('Alpha paragraph opens the section with a long first line here.');
  const B = paragraph('Bravo paragraph follows with another long first line of text.');
  const CAPTION = 'Six people huddle at the bar, late in the evening.';
  const article = (content) => ({
    metadata: { sessionId: '0926262' },
    headline: { main: 'The Room Voted Five to Four', kicker: 'NovaNews', deck: 'The room named Alex.' },
    sections: [{ id: 's', type: 'narrative', heading: 'The Story', content: content.map(clone) }]
  });
  const cfg = (sdk) => ({ configurable: { sdkClient: sdk, promptBuilder: createMockPromptBuilder(), theme: 'journalist' } });

  /** The director captions the writer's photo `filename` and sends back (E1); then an automatic pass takes the photo out. */
  async function automaticPass(filename, state) {
    const sentBack = article([A, photo(filename, CAPTION), B]);
    const standing = standingAfterSendBack(null, article([A, photo(filename), B]), sentBack, 'bundle');
    return reviseContentBundle(
      { ...state, _previousContentBundle: sentBack, _articleHandEdits: standing, articleRevisionCount: 1 },
      cfg(jest.fn(async () => article([A, B])))
    );
  }

  /** The fact check of a bundle printing `filename`, given the arguments the article's evaluation builds from `state`. */
  function factCheckOf(state, filename) {
    const contentBundle = { sections: [{ id: 's', type: 'narrative', content: [photo(filename)] }], evidenceCards: [] };
    return factCheckContentBundle({ ...buildFactCheckArgs({ ...state, contentBundle }), evidenceBundle: { exposed: { tokens: [], paperEvidence: [] } } });
  }

  it.each([
    ['photos by path, and an empty entry', ['/data/0926262/photos/a.jpg', 'C:\\data\\0926262\\photos\\b.jpg', ''], ['a.jpg', 'b.jpg']],
    ['entries with no name', ['/', ''], []],
    ['no photos', [], []]
  ])('%s', async (_name, sessionPhotos, names) => {
    const state = { sessionPhotos };
    expect(sessionPhotoNames(sessionPhotos)).toEqual(names);
    const holds = names.length > 0;
    // The fact check reads a photo the session never took as invalid only when the session holds photos.
    expect(factCheckOf(state, 'not-ours.jpg').photoReferences.invalid).toEqual(holds ? ['not-ours.jpg'] : []);
    // With a list the photo the pass took out stays out with the director's caption; with none it goes back.
    const result = await automaticPass('not-ours.jpg', state);
    expect(result.contentBundle.sections[0].content).toEqual(holds ? [A, B] : [A, photo('not-ours.jpg', CAPTION), B]);
  });

  it('the session holds no photos: the restore still refuses the whiteboard, as the fact check reads it as an invalid reference', async () => {
    const state = { sessionPhotos: [], whiteboardPhotoPath: 'photos/wb.jpg' };
    const result = await automaticPass('wb.jpg', state);
    expect(result.contentBundle.sections[0].content).toEqual([A, B]);
    expect(result._articleHandEditReport.changed).toEqual([expect.objectContaining({ id: 'E1', restored: false, unprintable: true })]);
    expect(factCheckOf(state, 'wb.jpg').photoReferences.invalid).toEqual(['wb.jpg']);
  });
});
