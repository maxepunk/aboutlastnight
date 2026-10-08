/**
 * What counts as a word, for every length the pipeline holds an output to: a run of
 * text between whitespace that holds a letter or a digit, so a lone dash or bullet is
 * not a word.
 *
 * The planning pages' length rule (pageLengthOf, the story meeting's and the map's, through
 * lib/stop-pages.js wordsShown, the count the stops log records too) and the article's length
 * check (content-bundle-fact-check.js, brief 4.7a) count by it, so every length is counted one
 * way.
 */

/**
 * @param {*} text
 * @returns {number}
 */
function wordCount(text) {
  return String(text == null ? '' : text).split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;
}

/**
 * The length rule both planning pages keep, the story meeting's and the map's (spec 2026-10-05
 * sections 4.1, 4.2 and 6.1; R5; the integrator's ruling after run 2, extended to the meeting in
 * fix round 4). Stated here once; each stop gives its bound and its floor beside its constants
 * (lib/weave.js MEETING_WORD_BOUND and MEETING_WORD_FLOOR; lib/map.js MAP_PAGES, from
 * MAP_WORD_BOUND, MAP_WORD_AIM, MAP_OPEN_WORD_BOUND and MAP_SYNOPSIS_AIM).
 *
 * The bound is on the page as it prints, counted by lib/stop-pages.js wordsShown, the count the
 * stops log records, which leaves the folds out. The story meeting's page is counted with each of
 * its angles open in turn (piece 3's R5), and the map's on two pages, as it opens with every
 * summary folded and with every summary open, each with its own bound and floor (piece 4, R6). The
 * page also prints words the writer never writes: the lines code prints, such as the meeting's
 * verdict, or the map's settled story and the names of its threads. Those are the page's overhead.
 * Each stop's check node counts it on the same page with every field the writer writes left blank,
 * and counts only the writer's share of the output, so the director's version is never held to the
 * bound. The writer's own words are the
 * page's words less the overhead. The writer may use max(floor, bound - overhead) of them: always
 * the floor, and more only while the whole page stays within the bound. The check (`over-length`)
 * fails when the writer's own words pass that allowance, so the words code prints never fail the
 * writer on words it cannot cut, and never leave it fewer than the floor.
 *
 * @param {number} pageWords - the page, counted
 * @param {number} overheadWords - the words on that page the writer did not write
 * @param {{bound: number, floor: number}} rule - the stop's bound on the page, and the floor of the writer's own words
 * @returns {{page: number, writer: number, allowance: number}}
 */
function pageLengthOf(pageWords, overheadWords, { bound, floor }) {
  return { page: pageWords, writer: pageWords - overheadWords, allowance: Math.max(floor, bound - overheadWords) };
}

module.exports = { wordCount, pageLengthOf };
