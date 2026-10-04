/**
 * 4.14e: the harness's pages say a send-back did not run, as the map and the desk do (the final
 * review's ruling 5). The harness has no note box, so the line gives the note back word for
 * word, as the stops do when their box does not hold it (reworkDidNotRunLine). The payloads are
 * the server's own. Invented text.
 */
const View = require('../../console/checkpoint-view-logic');
const { mapCheckpointData } = require('../map');
const { roundDidNotRunAt } = require('../workflow/state');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { stopPage } = require('../stop-pages');

const clone = (v) => JSON.parse(JSON.stringify(v));
const NOTE = 'Tighten the money section.';
const GAVE_UP = { round: 'send-back', note: NOTE, countsBefore: {}, failures: 3, at: '2026-10-04T10:00:00.000Z', error: 'SDK timeout after 900s', status: 'did-not-run' };
const textsOf = (page) => page.lines.filter((line) => !line.folded && line.text).map((line) => line.text);

/** The map's payload, as the server sends it for a thread paused at the map. */
function mapData(state) {
  return { type: 'outline', ...mapCheckpointData(state, { keptPhotos: ['hero.jpg', 'p2.jpg'], evidenceIndex: {}, maxRevisions: 1 }), trace: [] };
}

/** The desk's payload: the keys server.js getCheckpointData sends at the article stop. */
function deskData(roundDidNotRun) {
  return {
    type: 'article', contentBundle: clone(PREVIOUS_BUNDLE), factCheck: null, lastEvaluation: null, handEditReport: null,
    directorGateNotes: [], settledStory: null, trace: [], writerTrackerPrints: false,
    revisionCount: 0, humanRevisionCount: 0, maxRevisions: 2, roundDidNotRun
  };
}

describe('4.14e: the pages say a send-back did not run', () => {
  it("the map's page prints the line among what happened since the director last looked, before the gap note and the headline", () => {
    const state = { ...reworkFixtureState('journalist'), _outlineRework: GAVE_UP };
    const data = mapData(state);
    const line = View.reworkDidNotRunLine(data.roundDidNotRun, '', 'map');
    expect(line).toContain(`Your note was: "${NOTE}"`);
    const texts = textsOf(stopPage('outline', data));
    expect(texts).toContain(line);
    expect(texts.indexOf(line)).toBeLessThan(texts.indexOf(state.outline.headline));
  });

  it("the desk's page prints the line", () => {
    const data = deskData(roundDidNotRunAt('article', { _articleRework: GAVE_UP }));
    const line = View.reworkDidNotRunLine(data.roundDidNotRun, '', 'article');
    expect(textsOf(stopPage('article', data))).toContain(line);
  });

  it('prints no such line when every round ran', () => {
    const map = textsOf(stopPage('outline', mapData(reworkFixtureState('journalist'))));
    const desk = textsOf(stopPage('article', deskData(null)));
    [...map, ...desk].forEach((text) => expect(text).not.toMatch(/did not run/));
  });
});
