/**
 * The wordings phases 14 and 15 retired (plan ruling R12; spec 2026-10-09 section 15), with the
 * judges' and the fact check's own copies of them (brief F). The judges' truth questions and the
 * fact check's T8 messages are held to this list (article-judge.test.js,
 * content-bundle-fact-check.test.js). The integrator adds R12's wordings to removed-phrases.js once
 * no code text carries them; this list is the questions' and messages' check until then.
 *
 * Strings match case-insensitively. Not a test file (jest's testMatch is *.test.js).
 */
const RETIRED_WORDINGS = Object.freeze([
  // R12, as the plan lists them.
  'is never one of the room',
  'for being there and for nothing more',
  'Nova says so in one plain line',
  "One honest line about Nova's own motive",
  'this morning, in the warehouse',
  'what is still open often belongs in the closing',
  'is never a reason to suspect its namesake',
  'paid out this morning',
  'on the morning clock',
  // The judges' and the fact check's own copies of the same rules.
  'one of the room',
  'from outside its choices',
  'never a reason to suspect its namesake',
  "the morning's payments",
  'the close of the morning'
]);

module.exports = { RETIRED_WORDINGS };
