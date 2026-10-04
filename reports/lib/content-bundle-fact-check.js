/**
 * content-bundle-fact-check — the programmatic checks nobody was running.
 *
 * A measured baseline of the last five real sessions (`data/review-2026-09-18/
 * baseline/BASELINE.md` §4) ranked the article failure classes by frequency ×
 * editorial cost. The top class, and the only one in the whole set that was
 * "invisible to the pipeline", is **evidence cards carrying invented text under
 * real token IDs** — 15 items across 4 of 5 sessions, each one a section-level
 * rewrite. There was no evaluator criterion for it and no code check. Two more
 * classes (roster-coverage gaps, invalid photo references) WERE flagged by the
 * Opus evaluator, as advisories, and shipped anyway. A fourth (reporter mode)
 * was never computed at all: both remote sessions were written as on-site.
 *
 * All four are string checks. This module does them, and only them:
 *   - pure: no LLM, no I/O, no state mutation
 *   - lenient by construction: every judgement call errs toward NOT flagging,
 *     because a false structural failure burns an Opus revision
 *   - actionable: each issue names the card/tokenId/name and says what to do,
 *     because the string IS the revision instruction (see buildRevisionContext)
 *
 * Consumed by `evaluateArticle` as a pre-check that gates the Opus evaluation,
 * mirroring how `validateArcStructure` gates `evaluateArcs`.
 *
 * Phase 4 (brief 4.7a): each finding also comes back with where it sits (`findings`), so
 * the desk can mark it beside its paragraph, and the roster check covers the players the
 * map, as the director left it, places.
 *
 * @module content-bundle-fact-check
 */

// The one wording that points a writer at a document's text (R1); the fix lines
// below use it so they name the document the way every prompt does.
const { DOCUMENT_POINTER } = require('./prompt-renderers/record-view');
// F1 and FA (spec 2026-10-02 section 7): which printed field is one of the director's
// edits, the one prefix a concern about an edit opens with, the one rule for a section's
// key (known item 7) and the one roster-name test. Task 4.5f: a photo reference's name by
// the rule the restore reads too (photoBasename), so the restore reads as unprintable exactly
// the photos this check reads as invalid. Task 4.5g: the session's photo names, the one rule
// for which photos the session holds, which the article's rework reads too (sessionPhotoNames).
const { editLocator, directorEditConcern, sectionKey, namesPerson, photoBasename: basename, sessionPhotoNames, isWhiteboardPhoto } = require('./hand-edit-diff');
// FA (requirement 12): the photos the page prints, the one rule the publish step and the
// article approve read too (lib/publish-photos.js keeps the function's meaning).
const { printedPhotos } = require('./publish-photos');
// Brief 4.7a: the one word count, which the weave's bound reads too (lib/weave.js).
const { wordCount } = require('./word-count');

/**
 * Normalise for substring comparison: every single and double quotation mark,
 * curly or straight, folds to one straight apostrophe; dashes to a plain hyphen;
 * whitespace runs to one space; case-folded.
 *
 * A card the model retyped with a different apostrophe, a different quotation
 * mark or a different line wrap is still the same sentence; only a DIFFERENT
 * sentence is a fabrication. The single/double fold is measured: on 092026 the
 * `95e749b7` card put the document's double-quoted lines in single quotes and
 * failed a correct excerpt.
 *
 * @param {*} value
 * @returns {string}
 */
function normalize(value) {
  return String(value == null ? '' : value)
    .replace(/[‘’‚‛“”„‟"]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The text fields a source item may carry its quotable content in.
 *
 * `summary` is deliberately ABSENT: it is a generated paraphrase, so treating it
 * as quotable would bless the exact fabrication this module exists to catch.
 */
function sourceTextOf(item) {
  if (!item || typeof item !== 'object') return '';
  return String(item.fullContent || item.content || item.description || item.text || '');
}

/**
 * Strip a leading `id -` / `timestamp -` prefix from card content.
 *
 * The article prompt explicitly instructs cards to prefix the verbatim text with
 * the token id and timestamp ("[Token ID] - [timestamp] - ..."), so a CORRECT
 * card is not a pure substring of its source. Removing up to three such
 * segments only ever makes the check more lenient.
 *
 * @param {string} text
 * @returns {string}
 */
const PREFIX_SEGMENT = /^\s*(?:\[[^\]]*\]|\d{1,2}:\d{2}\s*(?:[APap]\.?[Mm]\.?)?|[A-Za-z0-9_-]{2,24})\s*[-:]\s*/;
function stripCardPrefix(text) {
  let out = String(text == null ? '' : text);
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(PREFIX_SEGMENT, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Minimum sentence length worth checking. Shorter fragments match by accident. */
const MIN_CHECKED_SENTENCE = 20;

/**
 * A fragment's own leading and trailing quotation marks (every quotation mark is
 * a straight apostrophe after `normalize`), with the whitespace around them.
 */
const EDGE_QUOTES = /^[\s']+|[\s']+$/g;

/**
 * Is every substantial sentence of `cardContent` present in `sourceText`?
 *
 * Sentence-wise rather than whole-string so a card may legitimately quote two
 * NON-ADJACENT sentences from the same memory. Sentences under
 * MIN_CHECKED_SENTENCE characters are skipped: they are connective fragments
 * whose presence or absence proves nothing either way.
 *
 * Each fragment loses its leading and trailing quotation marks before matching.
 * The split cuts at terminal punctuation INSIDE a quotation (`made!”`), which
 * leaves the closing mark at the head of the NEXT fragment; that fragment then
 * matched only when the card also kept the sentence the source has after the
 * quotation. On 092026 `ale003` and `mor003` were correct non-adjacent excerpts
 * that failed that way.
 *
 * @param {string} cardContent
 * @param {string} sourceText
 * @returns {boolean}
 */
function isVerbatim(cardContent, sourceText) {
  const source = normalize(sourceText);
  if (!source) return false;

  const sentences = stripCardPrefix(cardContent)
    .split(/[.?!]+/)
    .map(fragment => normalize(fragment).replace(EDGE_QUOTES, ''))
    .filter(s => s.length >= MIN_CHECKED_SENTENCE);

  // Nothing substantial to check (a one-line card): accept. Being lenient here
  // costs an editorial note; being strict costs an Opus revision.
  if (sentences.length === 0) return true;

  return sentences.every(s => source.includes(s));
}

/**
 * The checks that report ADVISORIES ONLY, until a live run calibrates them (I2b).
 *
 * Each is a string heuristic that can fire on correct prose, and a
 * structural verdict is expensive in a way an advisory is not: `evaluateArticle`
 * short-circuits the Opus evaluation on any structural issue and routes straight
 * to a revision, of which an article gets three, all paid. This module's standing
 * invariant is to err toward NOT flagging; these could not honour it as
 * structural checks.
 *
 *   'npcPronouns'  - a they/them pronoun within six words of an NPC whose canon
 *                    pronouns differ. Two suppression rules already exist for
 *                    plural and shared referents, and correct prose still slipped
 *                    through the first cut. Phase 3 (3.4), journalist: also a
 *                    pronoun of the other gender for an NPC with a declared one
 *                    (Marcus written "she"), and a gendered pronoun for an NPC the
 *                    canon gives none (Blake) that neither the director's words nor
 *                    the roster give (spec T9), in the forms NPC_GENDERED_PRONOUNS
 *                    lists. Task 4.14c, journalist: the they/them forms it reads are
 *                    the subject and the reflexive (NPC_THEY_PRONOUNS), and a
 *                    pronoun in a speech tag ("Marcus, she said, was") is the
 *                    speaker's.
 *   'leakedExample'- a two-word substring match on illustrative prompt strings.
 *                    The prompt files ship placeholders now, so a hit is far more
 *                    likely to be a session that legitimately wrote the sentence.
 *   'repeatedAbsence' - remote only: the narrator says more than once that they
 *                    were not in the room (phase 2, 2.6). A phrase count with no
 *                    live session behind it yet; "I was not there" can also be
 *                    about the party. Its message has its own prefix, "Absence
 *                    stated", which no console group claims, so a promotion lands
 *                    it in the ungrouped structural list instead of hiding it.
 *
 * Phase 3 (3.4) added five, journalist only, each with its own message prefix and its
 * own group in console/checkpoint-view-logic.js. Each reads the narrator's prose
 * (narratorSegments: the headline, kicker, deck and paragraphs) with quoted spans
 * stripped, never a card, a quote block, a caption or a quoted line:
 *   'emDash'          - an em-dash ("Em-dash in the narrator's prose:", C4's house rule).
 *   'productionWords' - director, GM, game master, tier, timer, or a bare "token"
 *                       ("Production word in print:", T14).
 *   'novaPronoun'     - a gendered pronoun for Nova ("Gendered pronoun for Nova:", T9).
 *   'length'          - the narrator's prose above LENGTH_FLAG_WORDS ("Over length:",
 *                       C4, R4). It counts narratorText whole, quoted lines included:
 *                       the length is what the reader reads.
 *   'headCount'       - a statement of how many people were in the room that disagrees
 *                       with the roster ("Head count:", T10). Vote and account counts
 *                       are not head counts.
 *
 * To PROMOTE one back to structural after a live session's data supports it:
 * remove its name from this list and push its message to `structuralIssues`
 * instead of `advisoryWarnings` at the call site (both are marked with the key).
 * The message strings themselves must not change — `console/checkpoint-view-logic.js`
 * groups the fact-check by message PREFIX.
 */
const FACT_CHECK_ADVISORY_ONLY = [
  'npcPronouns', 'leakedExample', 'repeatedAbsence', 'emDash', 'productionWords', 'novaPronoun', 'length', 'headCount'
];

/**
 * Illustrative strings shipped in the prompt files that a model has been
 * observed copying into a real card (BASELINE §6(b): 071826's `jam003` card
 * reproduced formatting.md's "The job is yours"). The placeholders that replaced
 * them cannot leak any more, but the guard stays: an example that reads like
 * evidence will always be a temptation.
 */
const LEAKED_PROMPT_EXAMPLES = [
  'the job is yours',
  "the ceo isn't even cold yet"
];

/**
 * Reporter-mode phrases.
 *
 * NEVER_VOTES applies in BOTH modes: the reporter is a journalist covering the
 * room, not a member of it, and never casts a vote or owns a memory.
 * PRESENCE applies only to `remote`, where every exposure and the verdict
 * reached the reporter as a tip from someone who was there.
 *
 * Brief 4.10d: each phrase matches whole words wherever the check reads it (wholePhrase),
 * so "Remi voted" holds no "i voted". Brief 4.10e: so "my vote" holds no plural, and
 * "my votes" is a phrase of its own.
 */
const NEVER_VOTES = ['i voted', 'my vote', 'my votes', 'one of them was mine'];
// First-person presence claims only. 'from inside the room' was tempting and
// wrong: "the tip came from inside the room" is exactly how a remote reporter
// SHOULD attribute, and flagging it would burn a revision on correct prose.
const PRESENCE_CLAIMS = [
  'i was in the room',
  'i was there in the room',
  'i sat in that room',
  'i watched from the room'
];
// First-person statements that the reporter was NOT in the room (remote only).
// One is allowed; the attribution shows the absence everywhere else. 092026's
// remote article opened with "I was not there." in the deck and "I was not in
// that room." in the lede. Matched on word boundaries, so "Kai was not there"
// does not count.
const ABSENCE_STATEMENTS = [
  'i was not there',
  "i wasn't there",
  'i was never there',
  'i was not in that room',
  "i wasn't in that room",
  'i was never in that room',
  'i was not in the room',
  "i wasn't in the room",
  'i was never in the room',
  'i was not present',
  "i wasn't present"
];

/**
 * They/them pronouns, every form, for the parked detective's NPC pronoun scan
 * (scanNpcPronouns). The journalist's scan reads NPC_THEY_PRONOUNS.
 *
 * BASELINE §4 class 3: 26 fact errors across 4 of 5 sessions, "above all Marcus
 * written they/them". The victim is never on the session roster, so his pronouns
 * came from nowhere. Within WINDOW words of the NPC's name, a they/them pronoun
 * contradicting the canon is a defect the reviser can fix mechanically.
 */
const THEY_THEM = ['they', 'them', 'their', 'theirs', 'themselves'];
const PRONOUN_WINDOW = 6;

/**
 * Find NPC names followed, within PRONOUN_WINDOW words, by a they/them pronoun
 * that contradicts the canon — but ONLY where that pronoun can only be about
 * the NPC.
 *
 * The first cut of this scan flagged correct prose. `"Marcus and Alex had their
 * own arrangement"`, `"Marcus, Vic and Sarah kept their shares quiet"` and
 * `"Nova asked Marcus about the deal before they voted"` are all right, and all
 * three produced a structural issue — which skips the Opus evaluation, burns a
 * paid revision and instructs the reviser to break correct text. That is a
 * direct violation of this module's err-toward-NOT-flagging invariant, so the
 * scan now suppresses a hit on either sign of a plural or shared referent:
 *
 *   1. the span between the name and the pronoun joins another capitalised name
 *      with a conjunction or a comma ("Marcus and Alex ... their");
 *   2. any OTHER known person (another NPC, or a roster member) is named in the
 *      same sentence ("Nova asked Marcus ... they voted").
 *
 * Rule 2 is deliberately broad: it also suppresses genuine errors in sentences
 * that name someone else. That is the correct direction to be wrong in. The
 * scan keeps the case the baseline actually measured — the victim as the only
 * named subject, carrying they/them.
 *
 * @param {string} prose
 * @param {Object<string,string>} npcPronouns - name -> 'he/him'
 * @param {string[]} [otherNames] - roster names, for rule 2
 * @returns {Array<{name: string, pronoun: string, excerpt: string}>}
 */
function scanNpcPronouns(prose, npcPronouns, otherNames = []) {
  const map = npcPronouns && typeof npcPronouns === 'object' ? npcPronouns : {};
  const scannable = Object.entries(map)
    .filter(([, declared]) => typeof declared === 'string' && !declared.toLowerCase().includes('they'));
  if (scannable.length === 0) return [];

  // Every other person the text could be talking about: the other NPCs plus the
  // session roster.
  const allKnown = [...Object.keys(map), ...asArray(otherNames)]
    .filter(n => typeof n === 'string' && n.trim())
    .map(n => n.trim());

  const sentences = String(prose == null ? '' : prose).split(/[.?!]+/);
  const hits = [];

  for (const [name, declared] of scannable) {
    const others = allKnown.filter(n => n.toLowerCase() !== name.toLowerCase());
    const nameRe = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');

    for (const sentence of sentences) {
      if (!nameRe.test(sentence)) continue;

      // Rule 2: somebody else is named here, so a they/them is ambiguous.
      if (others.some(other => new RegExp(`\\b${escapeRegExp(other)}\\b`, 'i').test(sentence))) {
        continue;
      }

      const windowRe = new RegExp(
        `\\b${escapeRegExp(name)}\\b((?:\\W+\\w+){0,${PRONOUN_WINDOW}})`,
        'gi'
      );
      let match;
      let flagged = false;
      while (!flagged && (match = windowRe.exec(sentence)) !== null) {
        const span = String(match[1] || '');
        const pronoun = THEY_THEM.find(pn => new RegExp(`\\b${pn}\\b`, 'i').test(span));
        if (!pronoun) continue;

        // Rule 1: a conjunction or comma joining another capitalised name makes
        // the subject plural ("Marcus and Alex", "Marcus, Vic and Sarah").
        const upToPronoun = span.split(new RegExp(`\\b${pronoun}\\b`, 'i'))[0] || '';
        if (/(?:\band\b|\bor\b|\bnor\b|,)\s+[A-Z]/.test(upToPronoun)) continue;

        hits.push({ name, pronoun, excerpt: match[0].trim() });
        flagged = true;
      }
      if (flagged) break;   // one report per NPC is enough to act on
    }
  }

  return hits;
}

// ── The narrator's prose (phase 3, 3.4) ──────────────────────────────────────

/** The journalist's narrator, written in the first person and never gendered (spec T9). */
const NARRATOR = 'Nova';

/** Gendered pronouns by gender: every form, for the Nova scan and for what the director's words give. */
const GENDERED_PRONOUNS = {
  masculine: ['he', 'him', 'his', 'himself'],
  feminine: ['she', 'her', 'hers', 'herself']
};

/**
 * The gendered forms an NPC scan reads: the subject and reflexive forms, and the
 * possessive "his" ("Blake counted his money"). The object forms ("Blake paid him"),
 * "her" and "hers" point at someone else, so the Marcus and Blake scans leave them out,
 * erring toward not flagging: on the 53 published reports a "her" after Marcus was
 * another person's ("Marcus buried her exposé", "Marcus had cleaned out her bank
 * account"), five false flags and no true one (fix 3.4c), and "hers" goes with it
 * ("Marcus took what was hers"; fix 3.4cb). The Nova scan reads every form: Nova seldom
 * appears in the third person, and a gendered pronoun beside the name with no one else
 * in the sentence is Nova's.
 */
const NPC_GENDERED_PRONOUNS = {
  masculine: ['he', 'his', 'himself'],
  feminine: ['she', 'herself']
};

/**
 * The they/them forms an NPC scan reads, as it reads the gendered forms (NPC_GENDERED_PRONOUNS):
 * the subject and the reflexive (task 4.14c). The object "them" and the possessives "their" and
 * "theirs" point at other people: on the 11 stored articles every one read after Marcus did
 * ("Marcus built them to", "Marcus had a room full of them", "ran their stolen engine"), four
 * false marks beside correct paragraphs at the desk and no true one.
 */
const NPC_THEY_PRONOUNS = ['they', 'themself', 'themselves'];

/**
 * Verbs of saying. A pronoun right before one, set off from the words before it by a comma, a
 * dash, a bracket or a quoted line, is a speech tag ("Marcus, she said, was ..."; "Marcus was
 * “a thief,” she said"): the speaker's, never the person named before it (task 4.14c).
 */
const SPEECH_VERBS = [
  'said', 'says', 'told', 'tells', 'asked', 'asks', 'added', 'adds', 'admitted', 'admits', 'answered', 'answers',
  'argued', 'argues', 'claimed', 'claims', 'explained', 'explains', 'insisted', 'insists', 'noted', 'notes',
  'recalled', 'recalls', 'remembered', 'remembers', 'replied', 'replies', 'swore', 'swears', 'wrote', 'writes',
  'went on', 'goes on'
];

/** A verb of saying right after a pronoun. */
const SPEECH_VERB_AFTER = new RegExp(`^\\s+(?:${SPEECH_VERBS.map((verb) => verb.split(' ').join('\\s+')).join('|')})\\b`, 'i');

/** What sets a speech tag off from the words before it: a comma, a dash, an opening bracket or a quoted line (QUOTED_SPAN_MASK). */
const SET_OFF_BEFORE = /(?:[,(—–\u0000]|\s-)$/;

/**
 * The possessives an NPC scan reads, and when (findPronounNear's `possessives`): "his"
 * alone. A possessive belongs to the clause's subject, so it is read only when the name
 * is not the object of a preposition ("The last buyer who sold to Blake spent his cut":
 * "his" is the buyer's).
 */
const NPC_POSSESSIVE_PRONOUNS = ['his'];

/** The text before a name ends in a preposition that governs it ("about Marcus", "to the Valet"). */
const GOVERNED_BY_PREPOSITION = new RegExp(
  '\\b(?:about|against|among|around|at|behind|beside|between|by|for|from|in|into|near|of|on|onto|over|' +
  'past|through|to|toward|towards|under|upon|with|without)\\s+(?:the\\s+)?$', 'i'
);

/** The genders a declared pronoun set names: 'he/him' -> ['masculine']; 'they/them' -> []. */
function gendersOf(pronouns) {
  const words = String(pronouns == null ? '' : pronouns).toLowerCase().split(/[^a-z]+/);
  return Object.keys(GENDERED_PRONOUNS).filter(gender => GENDERED_PRONOUNS[gender].some(p => words.includes(p)));
}

/** A letter or digit, accented Latin ones included (exposé's): what stands either side of an apostrophe in a word. */
const LETTER_OR_DIGIT = '[0-9A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F]';
/** Double quotation marks, straight or curly, each read as any other: a span runs from one to the next. */
const DOUBLE_QUOTED = '["“”][^"“”\\n]*["“”]';
/** A single mark that opens a span: after no letter or digit, before a non-space. A curly ’ never opens. */
const SINGLE_OPENING = `(?<!${LETTER_OR_DIGIT})['‘](?=\\S)`;
/** A single mark that can close a span: after a non-space, before no letter or digit. A curly ‘ never closes. */
const SINGLE_CLOSING = `(?<=\\S)['’](?!${LETTER_OR_DIGIT})`;
/** A single mark after a plural (the players' votes): an s before it, a word after it on its line. */
const AFTER_PLURAL = `(?<=[sS])['’](?=[^\\S\\n]+${LETTER_OR_DIGIT})`;
/** A closing mark the rule reads as a close: one not after a plural. */
const SINGLE_ENDING = `(?!${AFTER_PLURAL})${SINGLE_CLOSING}`;
/**
 * A single-quoted span: an opening mark, then its line up to the first ending mark, or, with none
 * on the line, up to the last mark after a plural. So a mark before a shortened word ('90s) with a
 * plural's mark later on its line masks every word between them, the narrator's included: a known
 * limit, in the module's direction, pinned by test.
 */
const SINGLE_QUOTED = `${SINGLE_OPENING}(?:(?:(?!${SINGLE_ENDING})[^\\n])*${SINGLE_ENDING}|[^\\n]*${AFTER_PLURAL})`;

/**
 * The one rule of what a quoted span is (briefs 4.10e and 4.10f): someone else's words, which a
 * narrator check never reads as the narrator's. Its readers:
 *   - stripQuotedSpans: the phase 3 narrator checks (the pronouns, em-dashes, production words
 *     and the head count);
 *   - maskQuotedSpans: the reporter-mode check and its excerpts (phraseExcerpt, acrossExcerpt),
 *     and the absence statements and their excerpts (findAbsenceStatements);
 *   - PRINTED_GAP: what a space in a folded copy may stand for when printedExcerpt finds a
 *     finding's excerpt in the printed text (the phase 3 narrator checks' hits, read in the
 *     stripped copy, and the leaked examples, read in normalize's).
 *
 * No span crosses a line's end. A span in double quotation marks, straight or curly, runs from
 * one mark to the next (DOUBLE_QUOTED). A span in single quotation marks, straight or curly
 * (SINGLE_QUOTED), is told from an apostrophe by where each mark stands, since the writers quote
 * speech in straight single marks too ('She means nothing to me.'):
 *   - in a word (Kai's, don't, o'clock) a mark is an apostrophe: it neither opens nor closes;
 *   - after a plural (the players' votes) a mark is an apostrophe while another mark on its line
 *     can close the span, and closes it when none can;
 *   - before a shortened word ('90s) a mark stands where an opening mark does, so it opens a span
 *     only when a closing mark follows on its line.
 * Where the rule cannot tell, it errs as the module does, toward not flagging: it reads the span.
 */
const QUOTED_SPANS = new RegExp(`(?:${DOUBLE_QUOTED}|${SINGLE_QUOTED})`, 'g');

/** A text with each of its quoted spans (QUOTED_SPANS) replaced, as String#replace takes `replacement`. */
function replaceQuotedSpans(text, replacement) {
  return String(text == null ? '' : text).replace(QUOTED_SPANS, replacement);
}

/**
 * Text with its quoted spans (QUOTED_SPANS) taken out. A span the narrator quotes is someone
 * else's words, which the narrator checks never judge.
 */
function stripQuotedSpans(text) {
  return replaceQuotedSpans(text, ' ');
}

/** What maskQuotedSpans puts in place of each character of a quoted span: neither a word character nor a space. */
const QUOTED_SPAN_MASK = '\u0000';

/**
 * Text with each quoted span stripQuotedSpans takes out masked character for character
 * (QUOTED_SPAN_MASK), so every other character keeps its place (brief 4.10e). The reporter-mode
 * check and the absence statements read the narrator's own words in it: no phrase is read inside
 * a quoted span, and none across one, since a mask is no space between two words; and a
 * finding's excerpt is sliced from the printed text where its match sits.
 */
function maskQuotedSpans(text) {
  return replaceQuotedSpans(text, (span) => QUOTED_SPAN_MASK.repeat(span.length));
}

/**
 * The narrator's prose, piece by piece, with where each piece prints: the headline,
 * kicker and deck, then each paragraph block by section. narratorText joins them.
 *
 * Each piece's `place` is where a finding in it sits (brief 4.7a): `{field}` for the
 * headline, kicker or deck, and `{section, paragraph}` for a paragraph, its ordinal
 * counting the section's paragraph blocks from 1, as `where` says it.
 *
 * @param {Object} contentBundle
 * @returns {Array<{where: string, section: string|null, text: string,
 *   place: {field: string}|{section: string|null, paragraph: number}}>}
 */
function narratorSegments(contentBundle) {
  const bundle = contentBundle || {};
  const headline = bundle.headline || {};
  const segments = [];
  for (const [key, where] of [['main', 'the headline'], ['kicker', 'the kicker'], ['deck', 'the deck']]) {
    if (typeof headline[key] === 'string') {
      segments.push({ where, section: null, text: headline[key], field: `headline.${key}`, place: { field: `headline.${key}` } });
    }
  }
  asArray(bundle.sections).forEach((section, index) => {
    if (!section || typeof section !== 'object') return;
    const sectionId = sectionIdOf(section);
    let paragraph = 0;
    for (const block of asArray(section.content)) {
      if (!block || typeof block !== 'object' || block.type !== 'paragraph') continue;
      paragraph += 1;
      if (typeof block.text !== 'string') continue;
      const place = sectionId ? `section "${sectionId}"` : 'a section with no id';
      segments.push({
        where: `${place}, paragraph ${paragraph}`, section: sectionId || '(no id)', text: block.text,
        sectionKey: sectionKeyOf(section, index), block, place: { section: sectionId, paragraph }
      });
    }
  });
  return segments;
}

/** A section's key as the director's edits address it: hand-edit-diff.js's own rule (known item 7). */
const sectionKeyOf = sectionKey;

/** The theme whose page a bundle prints on, as printedPhotos names it. */
function pageTheme(theme) {
  return theme === 'detective' ? 'detective' : 'journalist';
}

/** The hero's filename when the page prints the hero, else null (printedPhotos' rule). */
function printedHero(bundle, theme) {
  const hero = bundle && bundle.heroImage;
  if (!hero || typeof hero !== 'object') return null;
  return printedPhotos({ heroImage: hero }, pageTheme(theme))[0] || null;
}

/** A short span of text for a message, with any em-dash spelled out (no message carries one). */
function excerptOf(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().replace(/—/g, '[em-dash]');
}

/**
 * A finding's excerpt (brief 4.7a): the printed text the check read there, with its runs
 * of whitespace as one space, or null for none. The article's own words, as data for the
 * desk's marks, so an em-dash stays an em-dash.
 */
function findingExcerpt(text) {
  const out = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  return out || null;
}

/** Every quotation mark normalize folds to one, each of which printedPattern reads as any other. */
const QUOTE_MARKS = '\'‘’‚‛"“”„‟';

/**
 * What a run of spaces in a folded copy can stand for in the printed text: spaces and the
 * quoted spans stripQuotedSpans takes out, read by the one rule (QUOTED_SPANS; brief 4.10f).
 */
const PRINTED_GAP = `(?:\\s|${QUOTED_SPANS.source})+`;

/**
 * The pattern a hit is looked for by in the printed text (printedExcerpt): `target`, the hit
 * with its runs of whitespace as one space, where a space may stand for quoted spans, a
 * quotation mark for any quotation mark, a hyphen for a dash and three full stops for an
 * ellipsis.
 *
 * @param {string} target
 * @returns {string} the pattern's source
 */
function printedPattern(target) {
  let source = '';
  for (let i = 0; i < target.length; i += 1) {
    const ch = target[i];
    if (ch === ' ') source += PRINTED_GAP;
    else if (target.startsWith('...', i)) { source += '(?:\\.\\.\\.|…)'; i += 2; }
    else if (QUOTE_MARKS.includes(ch)) source += `[${QUOTE_MARKS}]`;
    else if ('-–—'.includes(ch)) source += '[-–—]';
    else source += escapeRegExp(ch);
  }
  return source;
}

/**
 * The printed text a hit stands for (brief 4.7a), so the desk finds a finding's excerpt in
 * its block (4.10): `wanted`, read from a folded copy of `printed` (normalize's lowercased
 * text, or the narrator's prose with its quoted spans taken out), looked for in `printed`
 * itself as printedPattern reads it, in any case. `wanted` when `printed` does not hold it.
 *
 * @param {string} printed - the text as the page prints it
 * @param {string} wanted - the hit as the check read it
 * @returns {string}
 */
function printedExcerpt(printed, wanted) {
  const target = typeof wanted === 'string' ? wanted.replace(/\s+/g, ' ').trim() : '';
  if (typeof printed !== 'string' || !printed || !target) return wanted;
  const match = new RegExp(printedPattern(target), 'i').exec(printed);
  return match ? match[0] : wanted;
}

/**
 * A reporter-mode phrase as a pattern: whole words only (brief 4.10d), with whitespace alone
 * between them (brief 4.10e). The phrases matched as plain substrings, so "remi voted" held
 * "i voted", and so did a paragraph ending "kai" before one opening "voted". ALN's names end in
 * "i" often (Remi, Kai, Dani), and each false structural failure spends a paid rework. One
 * reading everywhere: the check reads the narrator's prose with its quoted spans masked
 * (maskQuotedSpans) and folded (normalize), and a finding's excerpt is read on the printed text
 * with its quoted spans masked, so a quoted span never sits between the words of a hit.
 *
 * @param {string} phrase - one of NEVER_VOTES or PRESENCE_CLAIMS
 * @param {string} [flags] - the pattern's flags: none on folded text, 'i' or 'gi' on printed text
 * @returns {RegExp}
 */
function wholePhrase(phrase, flags = '') {
  return new RegExp(`\\b${phrase.split(' ').map(escapeRegExp).join('\\s+')}\\b`, flags);
}

/**
 * The printed text of a reporter-mode phrase in one narrator piece (brief 4.10e): its first match
 * as the check reads the phrase (wholePhrase), outside the piece's quoted spans (maskQuotedSpans),
 * as the page prints it. The phrase itself when the piece does not hold it.
 *
 * @param {string} printed - the piece as the page prints it
 * @param {string} phrase - the phrase as the check reads it
 * @returns {string}
 */
function phraseExcerpt(printed, phrase) {
  const match = wholePhrase(phrase, 'i').exec(maskQuotedSpans(printed));
  return match ? printed.slice(match.index, match.index + match[0].length) : phrase;
}

/**
 * The printed text of a reporter-mode phrase that no one piece holds (brief 4.10d): the first
 * match, read as the check reads the phrase (wholePhrase, outside the quoted spans: brief
 * 4.10e), that starts in one piece and ends in the next, the pieces with text taken in order,
 * so the excerpt sits where the two pieces meet. The check's own phrase when no two adjacent
 * pieces hold it, as when it runs across three.
 *
 * @param {string[]} pieces - the narrator's pieces as the page prints them (narratorSegments)
 * @param {string} phrase - the phrase as the check reads it
 * @returns {string}
 */
function acrossExcerpt(pieces, phrase) {
  const printed = pieces.filter((text) => typeof text === 'string' && text.trim() !== '');
  const pattern = wholePhrase(phrase, 'gi');
  for (let i = 0; i + 1 < printed.length; i += 1) {
    const meet = printed[i].length;
    const joined = `${printed[i]}\n${printed[i + 1]}`;
    const words = maskQuotedSpans(joined);
    pattern.lastIndex = 0;
    for (let match = pattern.exec(words); match; match = pattern.exec(words)) {
      if (match.index < meet && match.index + match[0].length > meet) return joined.slice(match.index, match.index + match[0].length);
      pattern.lastIndex = match.index + 1;
    }
  }
  return phrase;
}

/** The text `reach` characters either side of a hit at `index`, `length` long. */
function windowAround(text, index, length, reach = 30) {
  return text.slice(Math.max(0, index - reach), index + length + reach);
}

/** A section's id as a place names it, or null for a section with none. */
function sectionIdOf(section) {
  return typeof section.id === 'string' && section.id.trim() ? section.id.trim() : null;
}

/** "in X twice", "in X 3 times". */
function times(n) {
  return n === 2 ? ' twice' : n > 2 ? ` ${n} times` : '';
}

// ── The director's lines (brief 4.10b) ───────────────────────────────────────
//
// Each finding carries `line`: what is wrong in the article at the finding's place, in the
// words the director reads beside it at the desk, with that place's part of a finding that
// sits at several. The message beside it stays the rework's: its prefix groups the findings,
// and a rework reads it as its task. A line names a person as the record does and a photo by
// its filename, and leaves a card's document for the desk to name (DOCUMENT_SLOT).

/**
 * The words in a finding's line that stand for the document a card cites. The desk names the
 * document there by its name and owner, as the story meeting names a receipt
 * (console/checkpoint-view-logic.js receiptView, through the stop's evidenceIndex). The
 * console keeps a copy, which a test holds equal.
 */
const DOCUMENT_SLOT = '{document}';

/** Article text a line quotes: its runs of whitespace as one space, in double quotation marks. */
function quoted(text) {
  return `"${String(text == null ? '' : text).replace(/\s+/g, ' ').trim()}"`;
}

/** Names as a line lists them: "Mel", "Mel and Kai", "Mel, Kai and Sam". */
function namesList(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What a line calls a narrator piece: a headline field by its name, a paragraph "This paragraph". */
const PIECE_NAMES = { 'headline.main': 'The headline', 'headline.kicker': 'The kicker', 'headline.deck': 'The deck' };

function pieceOf(place) {
  return place && Object.prototype.hasOwnProperty.call(PIECE_NAMES, place.field) ? PIECE_NAMES[place.field] : 'This paragraph';
}

/**
 * The sentences of a piece's text as `text.split(/[.?!]+/)` gives them, each with where it
 * starts in the text.
 *
 * @returns {Array<{sentence: string, at: number}>}
 */
function sentencesWithOffsets(text) {
  const out = [];
  const breaks = /[.?!]+/g;
  let start = 0;
  let match;
  while ((match = breaks.exec(text)) !== null) {
    out.push({ sentence: text.slice(start, match.index), at: start });
    start = match.index + match[0].length;
  }
  out.push({ sentence: text.slice(start), at: start });
  return out;
}

/**
 * A piece's text with each quoted span as one QUOTED_SPAN_MASK, character for character beside
 * the quote-stripped text, which holds a space there (stripQuotedSpans); the stripped text itself
 * for a piece that does not carry its printed text.
 */
function quotedLinesMarked(segment) {
  const marked = typeof segment.original === 'string' ? replaceQuotedSpans(segment.original, QUOTED_SPAN_MASK) : segment.text;
  return marked.length === segment.text.length ? marked : segment.text;
}

/**
 * Is the pronoun at `at` in a speech tag (task 4.14c)? It is followed by a verb of saying and set
 * off from the words before it (SPEECH_VERB_AFTER, SET_OFF_BEFORE): "Marcus, she said, was", and
 * "Marcus was “a thief,” she said". Such a pronoun is the speaker's.
 *
 * @param {string} marked - the piece's text, quotedLinesMarked's
 * @param {number} at - where the pronoun starts
 * @param {number} length - the pronoun's length
 */
function inSpeechTag(marked, at, length) {
  return SPEECH_VERB_AFTER.test(marked.slice(at + length)) && SET_OFF_BEFORE.test(marked.slice(0, at).replace(/\s+$/, ''));
}

/**
 * The first pronoun from `pronouns` within PRONOUN_WINDOW words after one of `names`,
 * in a sentence of the narrator's (quote-stripped) prose, where it can only be about
 * that person. Lenient, as the module is: a hit is skipped when another known person is
 * named in the sentence, or another capitalised word stands between the name and the
 * pronoun (an antecedent nearer than the name), or a conjunction joins another name to
 * it ("Marcus and Alex ... their"). A pronoun in `possessives` is read only where it is
 * that person's possessive (NPC_POSSESSIVE_PRONOUNS); one that is not is passed over for
 * the next pronoun in the window, and so is a pronoun in a speech tag, which is the
 * speaker's (inSpeechTag; task 4.14c).
 *
 * @param {Array<{where: string, text: string, place: Object, original: string}>} segments -
 *   quotes already stripped from `text`; `original` is the piece as it prints
 * @param {string[]} names - the person's names, matched case-sensitively
 * @param {string[]} pronouns - the pronouns that would be wrong
 * @param {string[]} others - every other known person
 * @param {{possessives?: string[]}} [options] - the pronouns read only as a possessive
 * @returns {{name: string, pronoun: string, excerpt: string, where: string, place: Object, matched: string, original: string}|null}
 *   `excerpt` for the message; `place`, `matched` (the text from the name to the pronoun)
 *   and `original` (the piece as it prints), for the finding (brief 4.7a)
 */
function findPronounNear(segments, names, pronouns, others, { possessives = [] } = {}) {
  const pronounRe = new RegExp(`\\b(${pronouns.map(escapeRegExp).join('|')})\\b`, 'gi');
  const othersRe = others.length > 0 ? new RegExp(`\\b(?:${others.map(escapeRegExp).join('|')})\\b`, 'i') : null;
  const possessive = new Set(possessives.map(p => p.toLowerCase()));
  for (const segment of segments) {
    const marked = quotedLinesMarked(segment);
    for (const { sentence, at } of sentencesWithOffsets(segment.text)) {
      if (othersRe && othersRe.test(sentence)) continue;
      for (const name of names) {
        // "Nova News" is the outlet; "NovaNews" never matches the word "Nova".
        const nameRe = new RegExp(`\\b${escapeRegExp(name)}\\b(?!\\s*News\\b)((?:\\W+\\w+){0,${PRONOUN_WINDOW}})`, 'g');
        let match;
        while ((match = nameRe.exec(sentence)) !== null) {
          const span = String(match[1] || '');
          const spanAt = at + match.index + match[0].length - span.length;
          pronounRe.lastIndex = 0;
          let hit;
          while ((hit = pronounRe.exec(span)) !== null) {
            const before = span.slice(0, hit.index);
            if (/[A-Z][a-z]/.test(before) || /(?:\band\b|\bor\b|\bnor\b|,)\s+[A-Z]/.test(before)) break;
            if (possessive.has(hit[1].toLowerCase()) && GOVERNED_BY_PREPOSITION.test(sentence.slice(0, match.index))) continue;
            if (inSpeechTag(marked, spanAt + hit.index, hit[1].length)) continue;
            const matched = `${name}${before}${hit[1]}`;
            return { name, pronoun: hit[1], excerpt: excerptOf(matched), where: segment.where, place: segment.place, matched, original: segment.original };
          }
        }
      }
    }
  }
  return null;
}

/**
 * The genders the record gives a person with no canon pronoun: any gendered pronoun
 * within PRONOUN_WINDOW words after one of their names in the director's words, and
 * the roster's pronoun for them. Generous on purpose: a pronoun the director used is
 * never flagged.
 *
 * @param {string[]} names
 * @param {string} directorText
 * @param {Object|null} rosterPronouns - name -> 'he/him'
 * @returns {Set<string>}
 */
function givenGenders(names, directorText, rosterPronouns) {
  const given = new Set();
  const all = [...GENDERED_PRONOUNS.masculine, ...GENDERED_PRONOUNS.feminine];
  const pronounRe = new RegExp(`\\b(${all.join('|')})\\b`, 'gi');
  for (const sentence of String(directorText == null ? '' : directorText).split(/[.?!\n]+/)) {
    for (const name of names) {
      const nameRe = new RegExp(`\\b${escapeRegExp(name)}\\b((?:\\W+\\w+){0,${PRONOUN_WINDOW}})`, 'gi');
      let match;
      while ((match = nameRe.exec(sentence)) !== null) {
        for (const pronoun of String(match[1] || '').match(pronounRe) || []) {
          gendersOf(pronoun).forEach(g => given.add(g));
        }
      }
    }
  }
  const map = rosterPronouns && typeof rosterPronouns === 'object' ? rosterPronouns : {};
  for (const [key, value] of Object.entries(map)) {
    if (names.some(name => name.toLowerCase() === key.toLowerCase())) gendersOf(value).forEach(g => given.add(g));
  }
  return given;
}

/** Production words (T14): the game's machinery, which never prints. "Memory token" is the fiction's own. */
const PRODUCTION_WORDS = [
  { word: 'game master', re: /\bgame[\s-]?masters?\b/gi },
  { word: 'GM', re: /\bGMs?\b/g },
  { word: 'director', re: /\b(?:the|our|a|game|session|show)\s+director\b(?!\s+of\b)|\bdirector['’]?s\s+(?:notes?|observations?|account)\b/gi },
  { word: 'tier', re: /\btiers?\b/gi },
  { word: 'timer', re: /\btimers?\b/gi },
  { word: 'token', re: /(?<!\bmemory[\s-])\btokens?\b(?!\s+of\b)/gi }
];

/** The narrator's prose above this many words is flagged (C4, R4). */
const LENGTH_FLAG_WORDS = 1800;

/** The article's length, about this many words (C4): the length's message and its line name it. */
const LENGTH_TARGET_WORDS = 1500;

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'
];

/** A count as a number: digits, or a number word up to twenty. */
function countOf(token) {
  const text = String(token).toLowerCase();
  return /^\d+$/.test(text) ? Number(text) : NUMBER_WORDS.indexOf(text);
}

/**
 * Statements of how many people were in the room (T10), each with the count in group 1.
 * Narrow on purpose: a count of people tied to the room or the warehouse, said as the
 * whole ("there were nine people in the room", "the nine players in that room", "a
 * room of nine", "nine people were in the room", "nine players sat in the room.").
 * Statements about part of the room do not match: "two people in the room never sold";
 * "the two people in the room who never sold", where a relative clause picks the two
 * out; "three players sat in the room and never said a word", where the sentence goes on
 * to what only they did (so "sat" and "stood" count only when the clause ends at the
 * room). A vote or account count is not a head count either.
 */
const HEAD_COUNT_NUMBER = `(\\d{1,3}|${NUMBER_WORDS.join('|')})`;
const HEAD_COUNT_WHO = '(?:people|players|investigators|guests|suspects|of us|of them)';
const HEAD_COUNT_PLACE = '(?:in|inside)\\s+(?:the|that|this)\\s+(?:room|warehouse)';
/** No relative clause follows ("who", "which", or a "that" that is not "that morning"). */
const HEAD_COUNT_NO_RELATIVE_CLAUSE =
  '(?!\\s+(?:who|whom|whose|which)\\b|\\s+that\\b(?!\\s+(?:morning|afternoon|evening|night|day)\\b))';
const HEAD_COUNT_PATTERNS = [
  new RegExp(`\\bthere\\s+were\\s+${HEAD_COUNT_NUMBER}\\s+${HEAD_COUNT_WHO}(?:\\s+[a-z]+){0,3}?\\s+${HEAD_COUNT_PLACE}\\b`, 'gi'),
  new RegExp(`\\b(?:all\\s+of\\s+the|all\\s+the|all|the)\\s+${HEAD_COUNT_NUMBER}\\s+${HEAD_COUNT_WHO}\\s+${HEAD_COUNT_PLACE}\\b${HEAD_COUNT_NO_RELATIVE_CLAUSE}`, 'gi'),
  new RegExp(`\\b(?:a|the|that)\\s+(?:room|warehouse)\\s+of\\s+${HEAD_COUNT_NUMBER}\\b`, 'gi'),
  new RegExp(`\\b${HEAD_COUNT_NUMBER}\\s+(?:people|players)\\s+(?:were|gathered)\\s+${HEAD_COUNT_PLACE}\\b(?!\\s+(?:when|as|while|before|after)\\b)`, 'gi'),
  new RegExp(`\\b${HEAD_COUNT_NUMBER}\\s+(?:people|players)\\s+(?:sat|stood)\\s+${HEAD_COUNT_PLACE}\\b(?=\\s*(?:[.;!?]|$))`, 'gi')
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** `items` grouped by `keyOf`, in the order each key is first seen. */
function groupBy(items, keyOf) {
  const out = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

/** Roster entries arrive as plain names or as {name} objects. */
function rosterNames(roster) {
  return asArray(roster)
    .map(entry => (typeof entry === 'string' ? entry : (entry && entry.name)))
    .filter(n => typeof n === 'string' && n.trim())
    .map(n => n.trim());
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The ids a document in the record answers to: its id, tokenId, notionId, pageId and
 * name, in that order. A card cites a document by any of them: the record view names it
 * by the first of id, tokenId and notionId (record-view.js recordIdOf), and the ids a
 * receipt or a card may name include a paper's pageId and name (node-helpers.js
 * buildValidEvidenceIds).
 */
const SOURCE_ID_FIELDS = ['id', 'tokenId', 'notionId', 'pageId', 'name'];

/**
 * Build `id -> quotable source text` from the record: the evidence bundle's exposed
 * documents, nested under `exposed.{tokens,paperEvidence}` (older callers pass a flat
 * `exposedEvidence` array).
 *
 * Phase 4 (brief 4.6; R5): the record alone. The arc packages that came first went, and
 * each source a package supplied is still found: a package found its document by the
 * token's id or tokenId, or the paper's id, notionId, pageId or name, and each document
 * is entered under every one of them (SOURCE_ID_FIELDS). The first document to claim an
 * id keeps it, as before.
 *
 * @param {Object} evidenceBundle - the curated bundle
 * @returns {Map<string, string>}
 */
function buildSourceMap(evidenceBundle) {
  const map = new Map();
  const add = (item) => {
    if (!item || typeof item !== 'object') return;
    const text = sourceTextOf(item);
    if (!text) return;
    for (const field of SOURCE_ID_FIELDS) {
      const id = item[field];
      if (id && !map.has(String(id))) map.set(String(id), text);
    }
  };

  const exposed = (evidenceBundle && evidenceBundle.exposed) || {};
  asArray(exposed.tokens).forEach(add);
  asArray(exposed.paperEvidence).forEach(add);
  asArray(evidenceBundle && evidenceBundle.exposedEvidence).forEach(add);

  return map;
}

/**
 * The printed text of one content block, per the block partials of each theme's
 * templates. A photo's `characters` never prints; an evidence card's `owner`
 * prints on the journalist page only. The dispatcher renders an unknown block
 * type through the paragraph partial, which prints `text`.
 *
 * @param {Object} block
 * @param {boolean} journalist
 * @returns {Array<*>}
 */
function printedBlockText(block, journalist) {
  switch (block.type) {
    case 'quote': return [block.text, block.attribution];
    case 'evidence-reference': return [block.caption];
    case 'list': return asArray(block.items);
    case 'photo': return [block.caption];
    case 'evidence-card':
      return journalist ? [block.headline, block.content, block.owner] : [block.headline, block.content];
    default: return [block.text];
  }
}

/**
 * Printed text: what a roster mention has to appear in to count. Only text the
 * published page prints counts, per theme (the templates under `templates/`):
 *
 *   both themes  section headings; paragraph text; quote text and attribution;
 *                evidence-reference captions; list items; photo-block captions;
 *                evidence-card headline and content
 *   journalist   also the headline, kicker and deck; the hero caption, when the
 *                page prints the hero (printedPhotos); the evidence-card owner;
 *                each sidebar entry's headline and summary
 *
 * Never counted, because it never prints: a sidebar entry's `content` and
 * `owner`, the top-level `photos`, pull quotes, the characters on a photo or the
 * hero, and on the detective page the headline, the hero and the sidebar. The
 * byline and the financial tracker print but are left out: the byline names the
 * reporter, and an account can carry anyone's name, so neither is a roster
 * member appearing in the story.
 *
 * Within that, it is generous (headings, captions and card text all count): a
 * roster member named anywhere the reader can see them is covered, and a false
 * "missing" claim would send a good article back for a paid revision.
 *
 * @param {Object} contentBundle
 * @param {string} [theme] - 'journalist' (default) | 'detective'
 * @returns {string}
 */
function visibleText(contentBundle, theme) {
  const bundle = contentBundle || {};
  const journalist = theme !== 'detective';
  const parts = [];

  if (journalist) {
    const headline = bundle.headline || {};
    parts.push(headline.main, headline.kicker, headline.deck);
    // FA (requirement 12): the hero's caption counts only when the page prints the hero.
    if (printedHero(bundle, theme)) parts.push(bundle.heroImage.caption);
  }

  for (const section of asArray(bundle.sections)) {
    if (!section || typeof section !== 'object') continue;
    parts.push(section.heading);
    for (const block of asArray(section.content)) {
      if (block && typeof block === 'object') parts.push(...printedBlockText(block, journalist));
    }
  }

  if (journalist) {
    for (const entry of asArray(bundle.evidenceCards)) {
      if (entry && typeof entry === 'object') parts.push(entry.headline, entry.summary);
    }
  }

  return parts.filter(v => typeof v === 'string').join('\n');
}

/**
 * What the REPORTER says in their own voice: paragraph blocks and the headline
 * (main, kicker, deck). Nothing else (I2a).
 *
 * The reporter-mode scan used to read `visibleText`, which is generous ON PURPOSE
 * — it answers "can the reader see this roster name anywhere", so headings,
 * captions and card text all count. Run over first-person reporter-mode phrases,
 * that same generosity turns a correctly attributed player quote into a structural
 * failure: "I voted for Vic" is what a player SAYS, and quoting them is the
 * article doing its job. Same for an evidence card, which is a verbatim extract of
 * someone's memory in the second or first person by construction, and for a
 * caption quoting a line.
 *
 * So the two scans read different text, deliberately: coverage stays generous,
 * reporter mode stays narrow. Narrow here is also the lenient direction — the
 * phrases are narrator claims, and a claim the narrator does not make in their own
 * prose is not a persona breach. Since brief 4.10e reporter mode reads these pieces
 * with their quoted spans masked (maskQuotedSpans), and since brief 4.10f the absence
 * statements do too, so a player's line quoted inside a paragraph is no claim of the
 * narrator's either.
 *
 * @param {Object} contentBundle
 * @returns {string}
 */
function narratorText(contentBundle) {
  return narratorSegments(contentBundle).map(segment => segment.text).join('\n');
}

/**
 * Every ABSENCE_STATEMENTS match in narrator text, in the text's order.
 *
 * Each is the narrator's own words, read as the reporter-mode check reads its phrases (brief
 * 4.10f): outside the quoted spans (maskQuotedSpans), as whole words with whitespace alone
 * between them on one line, a curly apostrophe read as a straight one ("I wasn’t there"). A
 * paragraph that quotes a player's alibi ('I wasn't in the room') is reporting what someone
 * said, not the narrator stating where they were, and a statement whose words a quoted span
 * separates is no statement, as a reporter-mode phrase is none (brief 4.10e). Lenient on
 * purpose, like the rest of the module.
 *
 * @param {string} text - narratorText output, or one narrator piece
 * @returns {Array<{statement: string, excerpt: string}>} each statement as the check reads it
 *   (its whitespace as one space, a curly apostrophe as a straight one), for the message, and
 *   its excerpt: the printed text where the check read it
 */
function findAbsenceStatements(text) {
  const printed = String(text == null ? '' : text);
  const words = maskQuotedSpans(printed).replace(/[‘’]/g, "'");
  const pattern = new RegExp(`\\b(?:${ABSENCE_STATEMENTS.map(s => s.split(' ').map(escapeRegExp).join('[ \\t]+')).join('|')})\\b`, 'gi');
  return [...words.matchAll(pattern)].map(match => ({
    statement: match[0].replace(/[ \t]+/g, ' '),
    excerpt: printed.slice(match.index, match.index + match[0].length)
  }));
}

/**
 * Every card in the bundle with where it sits: each inline `evidence-card` block
 * (in section order), then each sidebar entry of `evidenceCards[]`.
 *
 * An inline evidence card prints its content. A sidebar entry prints its
 * headline and summary only; its `content` never prints (the sidebar partial has
 * no `content` field), so the card check never reads it.
 *
 * @param {Object} bundle
 * @returns {Array<{card: Object, location: {placement: 'inline'|'sidebar', section: string|null}, sectionKey?: string}>}
 *   an inline card's sectionKey is its section as the director's edits address it
 */
function cardOccurrences(bundle) {
  const out = [];
  asArray(bundle.sections).forEach((section, index) => {
    if (!section || typeof section !== 'object') return;
    const sectionId = sectionIdOf(section);
    for (const block of asArray(section.content)) {
      if (block && typeof block === 'object' && block.type === 'evidence-card') {
        out.push({ card: block, location: { placement: 'inline', section: sectionId }, sectionKey: sectionKeyOf(section, index) });
      }
    }
  });
  for (const entry of asArray(bundle.evidenceCards)) {
    if (entry && typeof entry === 'object') {
      out.push({ card: entry, location: { placement: 'sidebar', section: null } });
    }
  }
  return out;
}

/** Where a card sits, as a finding's place names it (brief 4.7a): its id, with its section or the sidebar. */
function cardPlaceOf(tokenId, location) {
  return location.placement === 'sidebar' ? { tokenId, sidebar: true } : { tokenId, section: location.section };
}

/**
 * Where a card defect sits, for its message: `in section "the-story"`,
 * `in section "the-story" twice`, `in sections "lede" and "the-story"`,
 * `in the sidebar`, `in section "lede", and in the sidebar`.
 *
 * @param {Array<{placement: string, section: string|null}>} locations
 * @returns {string}
 */
function describeLocations(locations) {
  const counts = new Map();
  let sidebar = false;
  for (const loc of asArray(locations)) {
    if (loc.placement === 'sidebar') { sidebar = true; continue; }
    const key = loc.section || '';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const times = n => (n === 2 ? ' twice' : n > 2 ? ` ${n} times` : '');
  const named = [];
  let unnamed = 0;
  for (const [section, n] of counts) {
    if (section) named.push(`"${section}"${times(n)}`);
    else unnamed += n;
  }

  const parts = [];
  if (named.length === 1) parts.push(`section ${named[0]}`);
  if (named.length > 1) parts.push(`sections ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`);
  if (unnamed > 0) parts.push(`a section with no id${times(unnamed)}`);
  if (sidebar) parts.push('the sidebar');

  if (parts.length === 0) return 'in the bundle';
  return parts.map(p => `in ${p}`).join(', and ');
}

/**
 * Fact-check a generated ContentBundle against the session's own record.
 *
 * @param {Object}   args
 * @param {Object}   args.contentBundle        - the generated bundle
 * @param {Object}   args.evidenceBundle       - curated three-layer bundle: the record, the
 *                                               cards' one source (phase 4, brief 4.6)
 * @param {Array}    args.roster               - session roster (names or {name})
 * @param {string[]} [args.placedPlayers]      - the roster players the map, as the director
 *                                               left it, places in a beat (brief 4.7a; the
 *                                               evaluator's mapTally). When given, roster
 *                                               coverage checks these alone: a roster player
 *                                               the map does not place is the director's
 *                                               decision, and no finding. With no map, every
 *                                               roster player is checked (C7)
 * @param {Array}    args.sessionPhotos        - photo paths available to this session
 * @param {Array}    [args.excludedPhotos]     - the session photos the director excluded
 *                                               (T13; the evaluator's isPhotoExcluded): no
 *                                               usable reference, and never offered in a fix
 * @param {?string}  [args.whiteboardPhoto]    - the whiteboard photo's filename or path (T13;
 *                                               the writers' whiteboardFilenameOf): the room's
 *                                               working notes, so no usable reference, and
 *                                               never offered in a fix
 * @param {string}   args.reportingMode        - 'on-site' | 'remote' (default 'on-site')
 * @param {Array}    [args.npcs]               - the theme's NPC entries (theme-config
 *                                               getThemeNPCEntries): {name, pronouns?, aliasOf?}
 * @param {Object}   [args.npcPronouns]        - name -> 'he/him': the declared NPCs alone,
 *                                               read when no `npcs` is given
 * @param {Object}   [args.rosterPronouns]     - first name -> pronouns from the roster stop
 * @param {string}   [args.directorText]       - the director's words (notes, corrections,
 *                                               accusation, answers at the story meeting): a
 *                                               pronoun they give is not invented
 * @param {Object}   [args.guestReporter]      - {name}: named in the head-count message
 * @param {string}   [args.theme]              - 'journalist' (default) | 'detective': which
 *                                               page's printed text roster coverage reads; the
 *                                               phase 3 checks run for the journalist only
 * @param {Array}    [args.directorEdits]      - the director's edits the bundle carries
 *                                               (F1; the evaluator's judgedEdits). A structural
 *                                               hit in a field the director wrote, or caused
 *                                               by the director's cut or rewrite, is an
 *                                               advisory under its id (FA, field by field): a
 *                                               card whose content the director wrote, a card
 *                                               (inline or in the sidebar) the director edited
 *                                               with an unknown source, a reporter-mode phrase
 *                                               in a paragraph the director wrote, a photo
 *                                               whose filename the director set, a player
 *                                               whose last mention the director's version
 *                                               dropped (the names the edit recorded)
 * @see BASELINE.md §4 for the measured failure classes each check addresses
 * @returns {{structuralIssues: string[], advisoryWarnings: string[],
 *            cardFidelity: Array<{tokenId: string, ok: boolean, reason: string|null,
 *                                 locations: Array<{placement: 'inline'|'sidebar', section: string|null}>,
 *                                 directorEdit?: string}>,
 *            rosterCoverage: {missing: string[]},
 *            photoReferences: {invalid: string[]},
 *            reporterMode: {violations: string[]},
 *            findings: Array<{kind: string, status: 'structural'|'advisory', place: Object|null,
 *                             excerpt: string|null, message: string, line: string, editId?: string}>}}
 *   A cardFidelity item in one of the director's edits carries that edit's id
 *   (`directorEdit`); `missing`, `invalid` and `violations` list the structural hits only.
 *
 *   `findings` (brief 4.7a) is each hit with where it sits, for the desk's marks (4.10):
 *   its check (`kind`: cardFidelity, rosterCoverage, photoReferences, reporterMode, or an
 *   advisory check FACT_CHECK_ADVISORY_ONLY names); the list its message is in (`status`);
 *   its `place`: `{section, paragraph}` (the section's id and the paragraph's ordinal),
 *   `{field}` (headline.main, headline.kicker or headline.deck), `{tokenId, section}` or
 *   `{tokenId, sidebar: true}` for a card, `{filename, section}` or `{filename, hero: true}`
 *   for a photo, `{section}` for a quote block or a section the length counted, or null
 *   where the hit has no one place (a player never named, a phrase across two pieces); an
 *   excerpt of the printed text there, or null for the length; its message, a string of
 *   `structuralIssues` or `advisoryWarnings`; and its line (brief 4.10b), what is wrong in
 *   the article at that place in the director's words, with that place's part, a card's
 *   document left to the desk to name (DOCUMENT_SLOT). A message that names several places
 *   has a finding at each, and a concern about one of the director's edits carries the
 *   edit's id (`editId`).
 */
function factCheckContentBundle({
  contentBundle,
  evidenceBundle,
  roster,
  placedPlayers,
  sessionPhotos,
  excludedPhotos,
  whiteboardPhoto,
  reportingMode,
  npcs,
  npcPronouns,
  rosterPronouns,
  directorText,
  guestReporter,
  theme,
  directorEdits
} = {}) {
  const structuralIssues = [];
  const journalist = theme !== 'detective';
  // F1: which printed piece is one of the director's edits, and which cut named a player.
  const edits = editLocator(contentBundle || {}, directorEdits);
  /** A hit in the director's text is the director's to weigh: an advisory under the edit's id. Returns the concern. */
  const directorHit = (editId, message) => {
    const concern = directorEditConcern([editId], message);
    advisoryWarnings.push(concern);
    return concern;
  };
  // Brief 4.7a: each hit with where it sits (the JSDoc's `findings`); brief 4.10b: with the
  // director's line for that place beside the rework's message.
  const findings = [];
  const found = (kind, status, place, excerpt, message, line, editId) => {
    findings.push({ kind, status, place: place || null, excerpt: findingExcerpt(excerpt), message, line, ...(editId && { editId }) });
  };
  const npcEntries = (Array.isArray(npcs)
    ? npcs
    : Object.entries(npcPronouns && typeof npcPronouns === 'object' ? npcPronouns : {}).map(([name, pronouns]) => ({ name, pronouns })))
    .filter(entry => entry && typeof entry === 'object' && typeof entry.name === 'string');
  // name -> declared pronouns, for the NPCs the canon gives one (as getThemeNPCPronouns).
  const declaredPronouns = {};
  npcEntries.filter(entry => entry.pronouns && !entry.aliasOf).forEach(entry => { declaredPronouns[entry.name] = entry.pronouns; });
  const advisoryWarnings = [];
  const cardFidelity = [];

  const bundle = contentBundle || {};
  const sources = buildSourceMap(evidenceBundle);

  // ── 1. Card fidelity (BASELINE class 1) ───────────────────────────────────
  // Only printed text is checked. An inline evidence card prints its content, so
  // that content must be copied from its document. A sidebar entry prints a
  // headline and a summary about its document, so it is checked for a known
  // document id and nothing else: a made-up id prints a headline and summary
  // about nothing.
  //
  // One report per defect: a document that fails in several places (inline and
  // in the sidebar, or twice inline) is ONE `cardFidelity` item carrying every
  // location, and one message. The console counts the messages and lists the
  // items, so the two numbers agree.
  //
  // F1 and FA: a defect in a field the director wrote is its own item, with the edit's
  // id (`directorEdit`), and its message is an advisory under that id. A card's content
  // is the director's only when the director wrote it (requirement 2): a card whose
  // headline alone the director changed is still the writer's card. An unknown source is
  // the director's on any card the director edited, inline or in the sidebar
  // (requirement 10), because its fix may drop the card.
  const verdicts = new Map();   // tokenId + outcome + edit -> its cardFidelity item
  const leaks = new Set();      // tokenId + leaked string, reported once
  const cardPlaces = new Map(); // cardFidelity item -> each place it sits, with the card's headline (brief 4.7a)
  const note = (tokenId, reason, location, editId, card) => {
    const key = `${tokenId}\u0000${reason || ''}\u0000${editId || ''}`;
    let item = verdicts.get(key);
    if (!item) {
      item = { tokenId, ok: reason === null, reason, locations: [], ...(editId && { directorEdit: editId }) };
      verdicts.set(key, item);
      cardFidelity.push(item);
      cardPlaces.set(item, []);
    }
    item.locations.push(location);
    cardPlaces.get(item).push({ place: cardPlaceOf(tokenId, location), excerpt: card.headline });
  };

  for (const { card, location, sectionKey: key } of cardOccurrences(bundle)) {
    const tokenId = String(card.tokenId == null ? '' : card.tokenId);
    const inline = location.placement === 'inline';
    const content = inline ? String(card.content == null ? '' : card.content) : '';

    // 'leakedExample' — ADVISORY (FACT_CHECK_ADVISORY_ONLY): a two-word substring
    // match, on strings the prompt files no longer ship. Printed content only.
    const leaked = inline && LEAKED_PROMPT_EXAMPLES.find(ex => normalize(content).includes(ex));
    if (leaked && !leaks.has(`${tokenId}\u0000${leaked}`)) {
      leaks.add(`${tokenId}\u0000${leaked}`);
      const message =
        `Prompt example leaked into evidence card "${tokenId}": "${leaked}" is an illustrative ` +
        `string from the prompt files, not session evidence. Quote ${DOCUMENT_POINTER} word for word, ` +
        `or drop the card.`;
      advisoryWarnings.push(message);
      const shown = printedExcerpt(content, leaked);
      found('leakedExample', 'advisory', cardPlaceOf(tokenId, location), shown, message,
        `This card holds ${quoted(shown)}, an example line from the writer's instructions; check that ${DOCUMENT_SLOT} says it.`);
    }

    const source = sources.get(tokenId);
    if (!source) note(tokenId, 'unknown source', location, inline ? edits.blockEdited(key, card) : edits.sidebarCard(card), card);
    else if (!inline || isVerbatim(content, source)) note(tokenId, null, location, null, card);
    else note(tokenId, 'not verbatim', location, edits.blockField(key, card, 'content'), card);
  }

  for (const item of cardFidelity) {
    if (item.ok) continue;
    const where = describeLocations(item.locations);
    /** One message for the item; a finding at each place it sits, with that place's line. */
    const report = (message, lineAt) => {
      const filed = item.directorEdit ? directorHit(item.directorEdit, message) : (structuralIssues.push(message), message);
      for (const { place, excerpt } of cardPlaces.get(item)) {
        found('cardFidelity', item.directorEdit ? 'advisory' : 'structural', place, excerpt, filed, lineAt(place), item.directorEdit);
      }
    };
    if (item.reason === 'unknown source') {
      // A card with no real document behind it: removal stays on offer.
      report(
        `Evidence card "${item.tokenId}" (${where}) has an unknown source: no memory or paper ` +
        `document in this session's record carries that id. Use the id of a document in <RECORD>, ` +
        `or drop the card.`,
        (place) => `No memory or paper document from this session has the ID ${place.sidebar ? 'this sidebar card' : 'this card'} cites, ${quoted(item.tokenId)}.`
      );
    } else {
      // The document is real and the choice of it stands; only the text is wrong.
      // Never offer removal here: on 092026 a reworker that could not see the
      // documents took "or drop the card" and stripped correct cards.
      report(
        `Evidence card "${item.tokenId}" (${where}) is not verbatim: its content does not appear ` +
        `in that document's text. Keep the card, and replace its content with sentences copied ` +
        `exactly from ${DOCUMENT_POINTER}.`,
        () => `This card's text does not match ${DOCUMENT_SLOT} word for word.`
      );
    }
  }

  // Leaked examples can also arrive as a quote block (formatting.md ships the
  // same string as a "text" example). ADVISORY, as above.
  for (const section of asArray(bundle.sections)) {
    if (!section || typeof section !== 'object') continue;
    for (const block of asArray(section.content)) {
      if (!block || typeof block !== 'object' || block.type !== 'quote') continue;
      const normText = normalize(block.text);
      const leaked = LEAKED_PROMPT_EXAMPLES.find(ex => normText.includes(ex));
      if (leaked) {
        const message =
          `Prompt example leaked into a quote block: "${leaked}" is an illustrative string from ` +
          `the prompt files, not something anyone said. Quote the source verbatim or cut the quote.`;
        advisoryWarnings.push(message);
        const shown = printedExcerpt(block.text, leaked);
        found('leakedExample', 'advisory', { section: sectionIdOf(section) }, shown, message,
          `This quote holds ${quoted(shown)}, an example line from the writer's instructions; check that someone in the session said it.`);
      }
    }
  }

  // ── 2. Roster coverage (BASELINE class 2) ─────────────────────────────────
  // F1: a player whose only mention the director cut is the director's call: an
  // advisory under the cut's id. FA (requirement 9): only for a name the director's
  // version no longer held when sent back, which the cut, or the rewrite that removed
  // it, recorded; a gap a later pass made is the writer's. `missing` lists the
  // writer's gaps alone.
  //
  // Brief 4.7a: the check covers the players the map, as the director left it, places in a
  // beat (`placedPlayers`). A roster player the map does not place is the director's
  // decision, and no finding; a placed player the article never names is the writer's gap,
  // fixed by writing the map's beat. With no map, every roster player is checked (C7).
  const names = rosterNames(roster);
  const placed = Array.isArray(placedPlayers)
    ? new Set(placedPlayers.filter(name => typeof name === 'string').map(name => name.trim().toLowerCase()))
    : null;
  const required = placed ? names.filter(name => placed.has(name.toLowerCase())) : names;
  const prose = visibleText(bundle, theme);
  const unnamed = required.filter(name => !namesPerson(prose, name));
  const cutBy = new Map(unnamed.map(name => [name, edits.cutNaming(name)]));
  const missing = unnamed.filter(name => !cutBy.get(name));
  const isCutEdit = (id) => asArray(directorEdits).some(e => e && e.id === id && (e.after === null || e.after === undefined));
  for (const [cutId, cutNames] of groupBy(unnamed.filter(name => cutBy.get(name)), name => cutBy.get(name))) {
    const cutWord = isCutEdit(cutId) ? 'cut' : 'rewrite';
    const concern = directorHit(cutId,
      `Roster coverage gap: ${cutNames.join(', ')} ${cutNames.length === 1 ? 'is' : 'are'} on the session roster, and the ` +
      `director's ${cutWord} removed the only place the article named ${cutNames.length === 1 ? cutNames[0] : 'each of them'}.`
    );
    found('rosterCoverage', 'advisory', null, null, concern,
      `Your ${cutWord} took out the only ${cutNames.length === 1 ? 'mention' : 'mentions'} of ${namesList(cutNames)} in the article.`, cutId);
  }
  if (missing.length > 0) {
    const message = placed
      ? `Roster coverage gap: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} on the ` +
        `session roster and placed in a beat on the map, but never named anywhere the reader can see. ` +
        `Write the beat the map gives each of them.`
      : `Roster coverage gap: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} on the ` +
        `session roster but never named anywhere the reader can see. Give each of them at least one ` +
        `specific, evidence-grounded appearance.`;
    structuralIssues.push(message);
    found('rosterCoverage', 'structural', null, null, message,
      `${namesList(missing)} ${missing.length === 1 ? 'is' : 'are'} on the ${placed ? 'map' : 'roster'} but never named in the article.`);
  }

  // ── 3. Photo references (BASELINE class 7) ───────────────────────────────
  // The 4b fix batch (T13: an excluded photo never appears): a photo the director
  // excluded is no usable reference, and a fix line offers only the kept photos. It used
  // to offer every session photo, so a rework could be told to place one the director
  // pulled. The message keeps its prefix: the console groups by it.
  //
  // Task 4c-fix (T13: the whiteboard is the room's working notes, and its photo stays out
  // of the article): the whiteboard photo is no usable reference either, and no fix line
  // offers it; a printed one says what it is. Its filename is known whatever the
  // session's photo list holds, so it is checked even when that list is empty.
  const isWhiteboard = (name) => isWhiteboardPhoto(name, whiteboardPhoto);
  const available = new Set(sessionPhotoNames(sessionPhotos));
  const excluded = new Set(asArray(excludedPhotos).map(basename).filter(Boolean));
  const kept = Array.from(available).filter(filename => !excluded.has(filename) && !isWhiteboard(filename));
  const useKept = kept.length > 0 ? `Use one of [${kept.join(', ')}] or remove the reference.` : 'Remove the reference.';
  // FA (requirement 12): the references are the photos the page prints
  // (lib/publish-photos.js printedPhotos), so a detective hero, which never prints, is not
  // checked, and the top-level `photos` list never prints either (phase 3, 3.4; HY1). F1
  // and FA (requirement 2): a reference is the director's only when the director set its
  // filename, the hero's or a photo block's.
  const hero = printedHero(bundle, theme);
  const photoEditOf = (filename) => {
    if (filename === hero) {
      const heroEdit = edits.field('heroImage.filename');
      if (heroEdit) return heroEdit;
    }
    for (const [index, section] of asArray(bundle.sections).entries()) {
      if (!section || typeof section !== 'object') continue;
      for (const block of asArray(section.content)) {
        if (!block || typeof block !== 'object' || block.type !== 'photo' || block.filename !== filename) continue;
        const editId = edits.blockField(sectionKeyOf(section, index), block, 'filename');
        if (editId) return editId;
      }
    }
    return null;
  };
  const referenced = printedPhotos(bundle, pageTheme(theme)).map(filename => ({ filename, editId: photoEditOf(filename) }));
  /** Brief 4.7a: where a printed photo sits, the hero and each photo block that prints it, with its caption. */
  const photoPlaces = (filename) => {
    const places = filename === hero ? [{ place: { filename, hero: true }, excerpt: bundle.heroImage.caption }] : [];
    for (const section of asArray(bundle.sections)) {
      if (!section || typeof section !== 'object') continue;
      for (const block of asArray(section.content)) {
        if (block && typeof block === 'object' && block.type === 'photo' && block.filename === filename) {
          places.push({ place: { filename, section: sectionIdOf(section) }, excerpt: block.caption });
        }
      }
    }
    return places.length > 0 ? places : [{ place: { filename }, excerpt: null }];
  };
  /** A finding at each place a photo prints, each with the photo's line (`lineOf`, by its filename). */
  const photoFindings = (filenames, status, message, lineOf, editId) => filenames.forEach((filename) => {
    photoPlaces(filename).forEach(({ place, excerpt }) => found('photoReferences', status, place, excerpt, message, lineOf(filename), editId));
  });

  const invalidPhotos = [];
  const invalidInEdits = [];   // [filename, editId]: a reference the director placed
  const unverified = [];
  for (const { filename, editId } of referenced) {
    const name = basename(filename);
    if (!isWhiteboard(name) && available.size === 0) {
      unverified.push(filename);
    } else if (isWhiteboard(name) || !available.has(name) || excluded.has(name)) {
      if (editId) {
        if (!invalidInEdits.some(([f]) => f === filename)) invalidInEdits.push([filename, editId]);
      } else if (!invalidPhotos.includes(filename)) {
        invalidPhotos.push(filename);
      }
    }
  }
  if (unverified.length > 0) {
    const message =
      `Could not verify ${unverified.length} photo reference(s): this session's photo list is ` +
      `empty in state, so there is nothing to check the filenames against.`;
    advisoryWarnings.push(message);
    photoFindings(unverified, 'advisory', message,
      (filename) => `The session's photo list is empty, so this photo, ${filename}, could not be checked.`);
  }
  /** Why a printed photo is no usable reference: the one rule its message and its line read. */
  const photoReasonOf = (filename) => {
    const name = basename(filename);
    return isWhiteboard(name) ? 'whiteboard' : excluded.has(name) ? 'excluded' : 'notTheSessions';
  };
  const photoMessage = (filename) => {
    const reason = {
      whiteboard: "this is the whiteboard, the room's working notes, and its photo stays out of the article.",
      excluded: 'the director excluded this photo.',
      notTheSessions: "not one of this session's photos."
    }[photoReasonOf(filename)];
    return `Invalid photo reference "${filename}": ${reason} ${useKept}`;
  };
  // Brief 4.10c: a photo the director left out says what the article does with it: it prints it.
  const photoLine = (filename) => ({
    whiteboard: `This photo, ${filename}, is the whiteboard: the room's working notes, which stay out of the article.`,
    excluded: `The article still prints this photo, ${filename}, which you left out.`,
    notTheSessions: `This photo, ${filename}, is not one of the session's photos.`
  })[photoReasonOf(filename)];
  for (const filename of invalidPhotos) {
    const message = photoMessage(filename);
    structuralIssues.push(message);
    photoFindings([filename], 'structural', message, photoLine);
  }
  for (const [filename, editId] of invalidInEdits.filter(([f]) => !invalidPhotos.includes(f))) {
    photoFindings([filename], 'advisory', directorHit(editId, photoMessage(filename)), photoLine, editId);
  }

  // ── 4. Reporter mode (BASELINE class 6) ──────────────────────────────────
  // NARRATOR text only (I2a): a player quote, an evidence card or a caption may
  // legitimately say "I voted" — the reporter's own prose may not. Brief 4.10e: the
  // narrator's own words, each piece read with its quoted spans masked (maskQuotedSpans),
  // so a player's line quoted inside a paragraph, 'Kai told me, "I voted for Mel."', is the
  // player's too.
  const mode = reportingMode === 'remote' ? 'remote' : 'on-site';
  const pieces = narratorSegments(bundle);
  const normProse = normalize(pieces.map(segment => maskQuotedSpans(segment.text)).join('\n'));
  const violations = [];
  // F1: the director's edit each narrator piece is (a paragraph's text the director
  // wrote, or a headline field the director set), or none. A phrase is the director's
  // when every piece that holds it is one of theirs; in the writer's prose, or across two
  // pieces, it is the writer's.
  const segmentEdits = pieces.map(segment => ({
    text: normalize(maskQuotedSpans(segment.text)),
    editId: segment.field ? edits.field(segment.field) : edits.blockField(segment.sectionKey, segment.block, 'text'),
    place: segment.place,
    original: segment.text
  }));
  /**
   * A reporter-mode hit: a concern when the phrase is the director's, else structural.
   * Brief 4.7a: a finding at each narrator piece that holds the phrase and is the hit's
   * (the director's pieces for a concern, the writer's for a structural hit, so no
   * structural mark sits beside the director's line), with the phrase as the piece prints
   * it, or one with no place when the phrase runs across two pieces.
   *
   * Brief 4.7c: each of the director's pieces is filed under its own edit. A phrase in
   * pieces under different edits is one concern per edit, and each finding carries its own
   * piece's edit and that edit's concern.
   *
   * Brief 4.10b: each finding's line is `lineOf` the phrase as the piece prints it, quoted.
   * Brief 4.10c: a phrase with no one place is quoted as the article prints it across its two
   * pieces, which can be the deck and a paragraph, with "(across two pieces)".
   *
   * Brief 4.10d: the phrase matches whole words in the prose, in each piece and in the text a
   * finding quotes, and a phrase with no one place is quoted from where two adjacent pieces
   * meet in it (acrossExcerpt).
   *
   * Brief 4.10e: a finding quotes the narrator's own words, as the check reads them: whitespace
   * alone between the phrase's words, outside the piece's quoted spans (phraseExcerpt, and
   * acrossExcerpt across two pieces).
   */
  const reporterHit = (phrase, message, lineOf) => {
    const holding = segmentEdits.filter(segment => wholePhrase(phrase).test(segment.text));
    const directors = holding.length > 0 && holding.every(segment => segment.editId);
    const concerns = new Map();   // edit id -> its concern, filed once
    if (directors) {
      holding.forEach(({ editId }) => { if (!concerns.has(editId)) concerns.set(editId, directorHit(editId, message)); });
    } else {
      violations.push(phrase);
      structuralIssues.push(message);
    }
    const marks = holding
      .filter(segment => directors || !segment.editId)
      .map(segment => ({ place: segment.place, excerpt: phraseExcerpt(segment.original, phrase), editId: directors ? segment.editId : null }));
    (marks.length > 0 ? marks : [{ place: null, excerpt: acrossExcerpt(segmentEdits.map(segment => segment.original), phrase), editId: null }])
      .forEach(({ place, excerpt, editId }) => found('reporterMode', editId ? 'advisory' : 'structural', place, excerpt,
        editId ? concerns.get(editId) : message, lineOf(place ? quoted(excerpt) : `${quoted(excerpt)} (across two pieces)`), editId));
  };
  // Brief 4.10b: the director's lines say what T8 asks of the reporter in either theme.
  const votesLine = (phrase) => `${phrase} makes the reporter one of the room: the reporter never votes, joins the room's accusation or exposes a memory.`;
  const presenceLine = (phrase) => `${phrase} puts the reporter in the room, but the reporter covered this session remotely.`;

  for (const phrase of NEVER_VOTES) {
    if (wholePhrase(phrase).test(normProse)) {
      // Phase 3 (3.4): the fix never sends the rework to name who acted; an exposure
      // stays anonymous unless the record names who turned it in (spec T6, T8).
      // Phase 3 (3.9): T8's first sentence as round 7 words it (R21): "accuses" is
      // joining the room's accusation. A rework reads this line as must-fix. Task 4.5f: who
      // turned a memory in is named by the evidence log or the director's words, as the
      // article judge's T6 clause reads them since 4.7d (T1).
      reporterHit(phrase, journalist
        ? `Reporter-mode violation: "${phrase}". Nova reports on the room from outside its choices: Nova never ` +
          `votes, joins the room's accusation or exposes a memory, and is never one of the room (T8). Rewrite the ` +
          `sentence without Nova in the vote or the exposure: the vote is the room's, and an exposure stays ` +
          `anonymous unless the evidence log or the director's words name who turned it in.`
        : `Reporter-mode violation: "${phrase}". The reporter covers the room, they are not a member ` +
          `of it — they never vote and no exposed memory is theirs. Attribute the action to whoever took it.`,
        votesLine
      );
    }
  }
  if (mode === 'remote') {
    for (const phrase of PRESENCE_CLAIMS) {
      if (wholePhrase(phrase).test(normProse)) {
        // Phase 3 (3.4): exposed memories reach Nova by turn-in, never as tips (spec T6, T8).
        // Phase 3 (3.9): the remote mode block of round 7 (R13): Nova never claims to have
        // seen or heard the room, and the event is told as a scene, attributed where it
        // matters, not sourced sentence by sentence.
        reporterHit(phrase, journalist
          ? `Reporter-mode violation (remote): "${phrase}". This session was covered remotely: Nova ` +
            `monitored from outside the warehouse and never claims to have seen or heard the room (T8). Tell ` +
            `the moment as a scene, with attribution where it matters: a line someone was overheard saying, a ` +
            `claim about a person. Exposed memories were turned in to Nova directly, and a person is named as ` +
            `Nova's source only where the record names them.`
          : `Reporter-mode violation (remote): "${phrase}". This session was covered remotely: every ` +
            `exposure, observation and the verdict arrived as a tip from someone who was there. Show ` +
            `where each fact came from by attributing it to the people who told you, and state your ` +
            `absence at most once.`,
          presenceLine
        );
      }
    }

    // 'repeatedAbsence' — ADVISORY (FACT_CHECK_ADVISORY_ONLY): one statement of
    // the absence is allowed. Phase 3 (3.9): for the journalist, as the remote mode
    // block of round 7 says (R13): once, early, and the room's events told as scenes
    // after it. The detective keeps its line.
    const absences = findAbsenceStatements(narratorText(bundle));
    if (absences.length > 1) {
      const message =
        `Absence stated ${absences.length} times (remote): ${absences.map(a => `"${a.statement}"`).join(', ')}. ` +
        (journalist
          ? `Nova says so once, early; after that, the room's events are told as scenes (T8).`
          : `Say that you were not in the room at most once in the whole article, or not at all; ` +
            `everywhere else, show where each fact came from by attributing it to the people who told you.`);
      advisoryWarnings.push(message);
      // Brief 4.7a: a statement sits inside one narrator piece (the joined text keeps each
      // piece on its own line), so each is found in its piece. Brief 4.10f: its excerpt is the
      // printed text where the count read it, so beside "Kai wasn't there" or a quoted line it
      // quotes the narrator's own statement.
      for (const segment of narratorSegments(bundle)) {
        for (const { excerpt: shown } of findAbsenceStatements(segment.text)) {
          found('repeatedAbsence', 'advisory', segment.place, shown, message,
            `${quoted(shown)} is one of ${absences.length} places the article says the reporter was not in the room; once, early, is enough.`);
        }
      }
    }
  }

  // ── 5. NPC pronouns (BASELINE class 3) ───────────────────────────────────
  // 'npcPronouns' — ADVISORY (FACT_CHECK_ADVISORY_ONLY) until a live run
  // calibrates it: two suppression rules are in place and correct prose still
  // slipped through the first cut, and a structural verdict costs a paid revision.
  if (!journalist) {
    for (const hit of scanNpcPronouns(prose, declaredPronouns, names)) {
      const message =
        `Pronoun error: ${hit.name} takes ${declaredPronouns[hit.name]}, but the article writes ` +
        `"${hit.excerpt}". The roster block's non-player-character line is the authority. ` +
        `Correct every pronoun used of ${hit.name}.`;
      advisoryWarnings.push(message);
      // This scan reads the page's whole printed text, so its hit has no one place.
      found('npcPronouns', 'advisory', null, hit.excerpt, message,
        `${quoted(hit.excerpt)} gives ${hit.name} the wrong pronoun: ${hit.name} takes ${declaredPronouns[hit.name]}.`);
    }
  } else {
    const segments = narratorSegments(bundle).map(segment => ({ ...segment, original: segment.text, text: stripQuotedSpans(segment.text) }));
    const npcNames = npcEntries.map(entry => entry.name);
    const allPeople = [...new Set([...npcNames, NARRATOR, ...names])];
    const othersThan = (own) => allPeople.filter(person => !own.some(name => name.toLowerCase() === person.toLowerCase()));

    // ── 5, phase 3 (3.4). NPC pronouns, read in the narrator's prose (spec T9).
    // 'npcPronouns' ADVISORY. Marcus: they/them or the other gender against his canon
    // pronoun, each in the forms an NPC scan reads (task 4.14c: the subject and the
    // reflexive of they/them, NPC_THEY_PRONOUNS). Blake (no canon pronoun): any gendered
    // pronoun the director's words and the roster do not give. Nova is never scanned here:
    // Nova's rule is its own check.
    for (const entry of npcEntries.filter(e => !e.aliasOf && e.name !== NARRATOR)) {
      const own = [entry.name, ...npcEntries.filter(alias => alias.aliasOf === entry.name).map(alias => alias.name)];
      const declared = gendersOf(entry.pronouns);
      if (entry.pronouns) {
        if (String(entry.pronouns).toLowerCase().includes('they')) continue;
        const wrong = [...NPC_THEY_PRONOUNS, ...Object.keys(GENDERED_PRONOUNS).filter(g => !declared.includes(g)).flatMap(g => NPC_GENDERED_PRONOUNS[g])];
        const hit = findPronounNear(segments, own, wrong, othersThan(own), { possessives: NPC_POSSESSIVE_PRONOUNS });
        if (hit) {
          const message =
            `Pronoun error: ${entry.name} takes ${entry.pronouns}, but the article writes "${hit.excerpt}" ` +
            `(in ${hit.where}). The roster block's non-player-character line is the authority. ` +
            `Correct every pronoun used of ${entry.name}.`;
          advisoryWarnings.push(message);
          const shown = printedExcerpt(hit.original, hit.matched);
          found('npcPronouns', 'advisory', hit.place, shown, message,
            `${quoted(shown)} gives ${entry.name} the wrong pronoun: ${entry.name} takes ${entry.pronouns}.`);
        }
        continue;
      }
      const given = givenGenders(own, directorText, rosterPronouns);
      const wrong = Object.keys(GENDERED_PRONOUNS).filter(g => !given.has(g)).flatMap(g => NPC_GENDERED_PRONOUNS[g]);
      if (wrong.length === 0) continue;
      const hit = findPronounNear(segments, own, wrong, othersThan(own), { possessives: NPC_POSSESSIVE_PRONOUNS });
      if (!hit) continue;
      const message = given.size === 0
        ? `Pronoun error: ${entry.name} has no pronoun in the record (neither the director's notes nor the ` +
          `roster give one), but the article writes "${hit.excerpt}" (in ${hit.where}). Write ${entry.name} ` +
          `by name (T9).`
        : `Pronoun error: ${entry.name} takes only the pronoun the director's notes or the roster give, but ` +
          `the article writes "${hit.excerpt}" (in ${hit.where}). Use the pronoun the record gives, or write ` +
          `${entry.name} by name (T9).`;
      advisoryWarnings.push(message);
      const shown = printedExcerpt(hit.original, hit.matched);
      found('npcPronouns', 'advisory', hit.place, shown, message, given.size === 0
        ? `${quoted(shown)} gives ${entry.name} a pronoun you never gave; write ${entry.name} by name.`
        : `${quoted(shown)} gives ${entry.name} a pronoun other than the one you gave.`);
    }

    // 'novaPronoun' ADVISORY: Nova writes in the first person and is otherwise "Nova" (T9).
    const novaHit = findPronounNear(segments, [NARRATOR],
      [...GENDERED_PRONOUNS.masculine, ...GENDERED_PRONOUNS.feminine], othersThan([NARRATOR]));
    if (novaHit) {
      const message =
        `Gendered pronoun for Nova: "${novaHit.excerpt}" (in ${novaHit.where}). Nova writes in the first ` +
        `person and is otherwise "Nova", never a gendered pronoun (T9).`;
      advisoryWarnings.push(message);
      const shown = printedExcerpt(novaHit.original, novaHit.matched);
      found('novaPronoun', 'advisory', novaHit.place, shown, message,
        `${quoted(shown)} gives ${NARRATOR} a gendered pronoun; ${NARRATOR} is never given one.`);
    }

    // 'emDash' ADVISORY: C4's house rule. Brief 4.7a: a finding at each piece that holds
    // one, its excerpt the text around the piece's first. Brief 4.10c: the line counts what
    // the check counts, the em-dashes outside quoted speech.
    const dashes = segments
      .map(segment => ({ segment, where: segment.where, n: (segment.text.match(/—/g) || []).length }))
      .filter(d => d.n > 0);
    if (dashes.length > 0) {
      const total = dashes.reduce((sum, d) => sum + d.n, 0);
      const message =
        `Em-dash in the narrator's prose: ${total} em-dash${total === 1 ? '' : 'es'} ` +
        `(${dashes.map(d => `in ${d.where}${times(d.n)}`).join('; ')}). House style puts a comma, a ` +
        `colon or a full stop where an em-dash might go (C4).`;
      advisoryWarnings.push(message);
      for (const { segment, n } of dashes) {
        found('emDash', 'advisory', segment.place, printedExcerpt(segment.original, windowAround(segment.text, segment.text.indexOf('—'), 1)), message,
          `${pieceOf(segment.place)} has ${n === 1 ? 'an em-dash' : `${n} em-dashes`} outside quoted speech; house style uses none.`);
      }
    }

    // 'productionWords' ADVISORY: the fiction stays whole (T14).
    const production = [];
    for (const segment of segments) {
      for (const { word, re } of PRODUCTION_WORDS) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(segment.text)) !== null) {
          const around = windowAround(segment.text, match.index, match[0].length);
          production.push({ word, text: `"${word}" in ${segment.where} ("...${excerptOf(around)}...")`, place: segment.place, excerpt: printedExcerpt(segment.original, around) });
        }
      }
    }
    if (production.length > 0) {
      const message =
        `Production word in print: ${production.map(hit => hit.text).join('; ')}. The article speaks the fiction's own words ` +
        `(T14): rewrite each line in the world's terms.`;
      advisoryWarnings.push(message);
      for (const hit of production) {
        found('productionWords', 'advisory', hit.place, hit.excerpt, message,
          `${pieceOf(hit.place)} says ${quoted(hit.word)}, a word from behind the scenes of the game.`);
      }
    }

    // 'length' ADVISORY: the narrator's prose above the flag (C4, R4), quoted lines
    // included, by where the words are. Brief 4.7a: a finding at each section whose
    // paragraphs the count covers, for a mark on the section's heading (4.10); the
    // headline's and the deck's words are in the message alone.
    const unstripped = narratorSegments(bundle);
    const totalWords = unstripped.reduce((sum, segment) => sum + wordCount(segment.text), 0);
    if (totalWords > LENGTH_FLAG_WORDS) {
      const bySection = new Map();
      for (const segment of unstripped) {
        const key = segment.section === null ? 'headline and deck' : segment.section;
        bySection.set(key, (bySection.get(key) || 0) + wordCount(segment.text));
      }
      const fmt = (n) => n.toLocaleString('en-US');
      const message =
        `Over length: the narrator's prose (headline, deck and paragraphs) runs ${fmt(totalWords)} words, above ` +
        `the ${fmt(LENGTH_FLAG_WORDS)}-word flag for an article of about ${fmt(LENGTH_TARGET_WORDS)} words (C4): ` +
        `${[...bySection].map(([key, n]) => `${key} ${fmt(n)}`).join(', ')}. Cut what the thesis does not need.`;
      advisoryWarnings.push(message);
      // Each section's words, by its place (brief 4.10b: the section's part of the line). Brief
      // 4.10c: the words counted are the article's words of prose, never a card's, a quote's or
      // a caption's.
      const sections = new Map();
      for (const segment of unstripped) {
        if (segment.section !== null) sections.set(segment.place.section, (sections.get(segment.place.section) || 0) + wordCount(segment.text));
      }
      if (sections.size === 0) {
        found('length', 'advisory', null, null, message, `The article runs ${fmt(totalWords)} words of prose; it aims at about ${fmt(LENGTH_TARGET_WORDS)}.`);
      }
      for (const [section, words] of sections) {
        found('length', 'advisory', { section }, null, message,
          `This section has ${fmt(words)} of the article's ${fmt(totalWords)} words of prose; the article aims at about ${fmt(LENGTH_TARGET_WORDS)}.`);
      }
    }

    // 'headCount' ADVISORY: the room held the roster's players (T10).
    if (names.length > 0) {
      const counts = [];
      for (const segment of segments) {
        const seen = new Set();
        for (const pattern of HEAD_COUNT_PATTERNS) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(segment.text)) !== null) {
            if (seen.has(match.index)) continue;
            if (/\b(?:only|just)\s+$/i.test(segment.text.slice(0, match.index))) continue;
            seen.add(match.index);
            if (countOf(match[1]) !== names.length) counts.push({ text: `"${excerptOf(match[0])}" in ${segment.where}`, place: segment.place, excerpt: printedExcerpt(segment.original, match[0]) });
          }
        }
      }
      if (counts.length > 0) {
        const reporterName = guestReporter && typeof guestReporter === 'object' && typeof guestReporter.name === 'string'
          ? guestReporter.name.trim() : '';
        const reporterFirst = reporterName.split(/\s+/)[0] || '';
        const reporterOnRoster = reporterFirst && names.some(name => name.toLowerCase() === reporterFirst.toLowerCase());
        const reporterNote = !reporterName ? ''
          : reporterOnRoster ? `, the guest reporter ${reporterName} among them`
            : `; the guest reporter ${reporterName} plays no character on it and is not counted`;
        const message =
          `Head count: ${counts.map(hit => hit.text).join('; ')}, but the roster lists ${names.length} players at the investigation` +
          `${reporterNote}. The head count is the players at the investigation (T10).`;
        advisoryWarnings.push(message);
        const reporterLine = !reporterName ? ''
          : reporterOnRoster ? `, the guest reporter ${reporterName} among them`
            : `; the guest reporter ${reporterName} plays no character and is not counted`;
        for (const hit of counts) {
          found('headCount', 'advisory', hit.place, hit.excerpt, message,
            `${quoted(hit.excerpt)} does not match the roster: ${names.length} players were at the investigation${reporterLine}.`);
        }
      }
    }
  }

  return {
    structuralIssues,
    advisoryWarnings,
    cardFidelity,
    rosterCoverage: { missing },
    photoReferences: { invalid: invalidPhotos },
    reporterMode: { violations },
    findings
  };
}

module.exports = {
  factCheckContentBundle,
  FACT_CHECK_ADVISORY_ONLY,
  // Brief 4.10b: where a finding's line names a card's document, which the desk names
  // (console/checkpoint-view-logic.js holds a copy, held equal by a test).
  DOCUMENT_SLOT,
  // FA (requirement 9): the roster's names as the coverage check reads them, which the
  // send-back records a cut's names against (server.js buildResumePayload).
  rosterNames,
  // Exported for targeted unit tests and reuse
  _testing: {
    normalize,
    stripCardPrefix,
    isVerbatim,
    buildSourceMap,
    scanNpcPronouns,
    visibleText,
    narratorText,
    narratorSegments,
    sectionKeyOf,
    stripQuotedSpans,
    findPronounNear,
    givenGenders,
    findAbsenceStatements,
    cardOccurrences,
    describeLocations,
    LEAKED_PROMPT_EXAMPLES,
    NEVER_VOTES,
    PRESENCE_CLAIMS,
    ABSENCE_STATEMENTS
  }
};
