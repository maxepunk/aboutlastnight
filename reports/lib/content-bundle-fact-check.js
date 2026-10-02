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
 * @module content-bundle-fact-check
 */

// The one wording that points a writer at a document's text (R1); the fix lines
// below use it so they name the document the way every prompt does.
const { DOCUMENT_POINTER } = require('./prompt-renderers/record-view');

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
 *                    lists.
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
 */
const NEVER_VOTES = ['i voted', 'my vote', 'one of them was mine'];
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
 * They/them pronouns, for the NPC pronoun scan.
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

/**
 * Text with its quoted spans taken out: double quotes, straight or curly, and curly
 * single quotes. A span the narrator quotes is someone else's words, which the
 * narrator checks never judge.
 */
function stripQuotedSpans(text) {
  return String(text == null ? '' : text)
    .replace(/[“”]/g, '"')
    .replace(/"[^"\n]*"/g, ' ')
    .replace(/‘[^\n]*?’(?![A-Za-z])/g, ' ');
}

/**
 * The narrator's prose, piece by piece, with where each piece prints: the headline,
 * kicker and deck, then each paragraph block by section. narratorText joins them.
 *
 * @param {Object} contentBundle
 * @returns {Array<{where: string, section: string|null, text: string}>}
 */
function narratorSegments(contentBundle) {
  const bundle = contentBundle || {};
  const headline = bundle.headline || {};
  const segments = [];
  for (const [key, where] of [['main', 'the headline'], ['kicker', 'the kicker'], ['deck', 'the deck']]) {
    if (typeof headline[key] === 'string') segments.push({ where, section: null, text: headline[key] });
  }
  for (const section of asArray(bundle.sections)) {
    if (!section || typeof section !== 'object') continue;
    const sectionId = typeof section.id === 'string' && section.id.trim() ? section.id.trim() : null;
    let paragraph = 0;
    for (const block of asArray(section.content)) {
      if (!block || typeof block !== 'object' || block.type !== 'paragraph') continue;
      paragraph += 1;
      if (typeof block.text !== 'string') continue;
      const place = sectionId ? `section "${sectionId}"` : 'a section with no id';
      segments.push({ where: `${place}, paragraph ${paragraph}`, section: sectionId || '(no id)', text: block.text });
    }
  }
  return segments;
}

/** A short span of text for a message, with any em-dash spelled out (no message carries one). */
function excerptOf(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().replace(/—/g, '[em-dash]');
}

/** The words in a text: whitespace-separated runs that hold a letter or a digit. */
function wordCount(text) {
  return String(text == null ? '' : text).split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;
}

/** "in X twice", "in X 3 times". */
function times(n) {
  return n === 2 ? ' twice' : n > 2 ? ` ${n} times` : '';
}

/**
 * The first pronoun from `pronouns` within PRONOUN_WINDOW words after one of `names`,
 * in a sentence of the narrator's (quote-stripped) prose, where it can only be about
 * that person. Lenient, as the module is: a hit is skipped when another known person is
 * named in the sentence, or another capitalised word stands between the name and the
 * pronoun (an antecedent nearer than the name), or a conjunction joins another name to
 * it ("Marcus and Alex ... their"). A pronoun in `possessives` is read only where it is
 * that person's possessive (NPC_POSSESSIVE_PRONOUNS); one that is not is passed over for
 * the next pronoun in the window.
 *
 * @param {Array<{where: string, text: string}>} segments - quotes already stripped
 * @param {string[]} names - the person's names, matched case-sensitively
 * @param {string[]} pronouns - the pronouns that would be wrong
 * @param {string[]} others - every other known person
 * @param {{possessives?: string[]}} [options] - the pronouns read only as a possessive
 * @returns {{name: string, pronoun: string, excerpt: string, where: string}|null}
 */
function findPronounNear(segments, names, pronouns, others, { possessives = [] } = {}) {
  const pronounRe = new RegExp(`\\b(${pronouns.map(escapeRegExp).join('|')})\\b`, 'gi');
  const othersRe = others.length > 0 ? new RegExp(`\\b(?:${others.map(escapeRegExp).join('|')})\\b`, 'i') : null;
  const possessive = new Set(possessives.map(p => p.toLowerCase()));
  for (const segment of segments) {
    for (const sentence of segment.text.split(/[.?!]+/)) {
      if (othersRe && othersRe.test(sentence)) continue;
      for (const name of names) {
        // "Nova News" is the outlet; "NovaNews" never matches the word "Nova".
        const nameRe = new RegExp(`\\b${escapeRegExp(name)}\\b(?!\\s*News\\b)((?:\\W+\\w+){0,${PRONOUN_WINDOW}})`, 'g');
        let match;
        while ((match = nameRe.exec(sentence)) !== null) {
          const span = String(match[1] || '');
          pronounRe.lastIndex = 0;
          let hit;
          while ((hit = pronounRe.exec(span)) !== null) {
            const before = span.slice(0, hit.index);
            if (/[A-Z][a-z]/.test(before) || /(?:\band\b|\bor\b|\bnor\b|,)\s+[A-Z]/.test(before)) break;
            if (possessive.has(hit[1].toLowerCase()) && GOVERNED_BY_PREPOSITION.test(sentence.slice(0, match.index))) continue;
            return { name, pronoun: hit[1], excerpt: excerptOf(`${name}${before}${hit[1]}`), where: segment.where };
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

/** Basename of a path, tolerating both separators. */
function basename(p) {
  return String(p == null ? '' : p).split(/[/\\]/).filter(Boolean).pop() || '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
 * Build `id -> quotable source text` from the arc packages and the evidence
 * bundle.
 *
 * Both shapes are accepted for each source because both are live in the tree:
 * `buildArcEvidencePackages` emits `evidenceItems`, and the bundle nests its
 * items under `exposed.{tokens,paperEvidence}` (older callers pass a flat
 * `exposedEvidence` array).
 */
function buildSourceMap(arcEvidencePackages, evidenceBundle) {
  const map = new Map();
  const add = (item) => {
    if (!item || typeof item !== 'object') return;
    const id = item.id || item.tokenId || item.notionId || item.pageId || item.name;
    const text = sourceTextOf(item);
    if (!id || !text) return;
    // First non-empty text wins; the arc packages are added first and carry the
    // content the generator was actually shown.
    if (!map.has(String(id))) map.set(String(id), text);
  };

  for (const pkg of asArray(arcEvidencePackages)) {
    if (!pkg || typeof pkg !== 'object') continue;
    asArray(pkg.evidenceItems).forEach(add);
    asArray(pkg.evidence).forEach(add);   // alternate field name
  }

  const exposed = (evidenceBundle && evidenceBundle.exposed) || {};
  asArray(exposed.tokens).forEach(add);
  asArray(exposed.paperEvidence).forEach(add);
  asArray(evidenceBundle && evidenceBundle.exposedEvidence).forEach(add);

  return map;
}

/** Every content block across every section, flattened. */
function contentBlocks(contentBundle) {
  return asArray(contentBundle && contentBundle.sections)
    .flatMap(section => asArray(section && section.content))
    .filter(block => block && typeof block === 'object');
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
 *   journalist   also the headline, kicker and deck; the hero caption; the
 *                evidence-card owner; each sidebar entry's headline and summary
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
    if (bundle.heroImage && typeof bundle.heroImage === 'object') parts.push(bundle.heroImage.caption);
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
 * prose is not a persona breach.
 *
 * @param {Object} contentBundle
 * @returns {string}
 */
function narratorText(contentBundle) {
  return narratorSegments(contentBundle).map(segment => segment.text).join('\n');
}

/**
 * Every ABSENCE_STATEMENTS match in narrator text, in the text's own casing.
 *
 * Double-quoted spans are skipped first: a paragraph that quotes a player's
 * alibi ("I wasn't in the room") is reporting what someone said, not the
 * narrator stating where they were. Lenient on purpose, like the rest of the
 * module.
 *
 * @param {string} text - narratorText output
 * @returns {string[]}
 */
function findAbsenceStatements(text) {
  const unquoted = String(text == null ? '' : text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/"[^"\n]*"/g, ' ')
    .replace(/[ \t]+/g, ' ');
  const pattern = new RegExp(`\\b(?:${ABSENCE_STATEMENTS.map(escapeRegExp).join('|')})\\b`, 'gi');
  return unquoted.match(pattern) || [];
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
 * @returns {Array<{card: Object, location: {placement: 'inline'|'sidebar', section: string|null}}>}
 */
function cardOccurrences(bundle) {
  const out = [];
  for (const section of asArray(bundle.sections)) {
    if (!section || typeof section !== 'object') continue;
    const sectionId = typeof section.id === 'string' && section.id.trim() ? section.id.trim() : null;
    for (const block of asArray(section.content)) {
      if (block && typeof block === 'object' && block.type === 'evidence-card') {
        out.push({ card: block, location: { placement: 'inline', section: sectionId } });
      }
    }
  }
  for (const entry of asArray(bundle.evidenceCards)) {
    if (entry && typeof entry === 'object') {
      out.push({ card: entry, location: { placement: 'sidebar', section: null } });
    }
  }
  return out;
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
 * @param {Array}    args.arcEvidencePackages  - per-arc evidence the generator was shown
 * @param {Object}   args.evidenceBundle       - curated three-layer bundle
 * @param {Array}    args.roster               - session roster (names or {name})
 * @param {Array}    args.sessionPhotos        - photo paths available to this session
 * @param {Array}    [args.excludedPhotos]     - the session photos the director excluded
 *                                               (T13; the evaluator's isPhotoExcluded): no
 *                                               usable reference, and never offered in a fix
 * @param {string}   args.reportingMode        - 'on-site' | 'remote' (default 'on-site')
 * @param {Array}    [args.npcs]               - the theme's NPC entries (theme-config
 *                                               getThemeNPCEntries): {name, pronouns?, aliasOf?}
 * @param {Object}   [args.npcPronouns]        - name -> 'he/him': the declared NPCs alone,
 *                                               read when no `npcs` is given
 * @param {Object}   [args.rosterPronouns]     - first name -> pronouns from the roster stop
 * @param {string}   [args.directorText]       - the director's words (notes, corrections,
 *                                               accusation): a pronoun they give is not invented
 * @param {Object}   [args.guestReporter]      - {name}: named in the head-count message
 * @param {string}   [args.theme]              - 'journalist' (default) | 'detective': which
 *                                               page's printed text roster coverage reads; the
 *                                               phase 3 checks run for the journalist only
 * @see BASELINE.md §4 for the measured failure classes each check addresses
 * @returns {{structuralIssues: string[], advisoryWarnings: string[],
 *            cardFidelity: Array<{tokenId: string, ok: boolean, reason: string|null,
 *                                 locations: Array<{placement: 'inline'|'sidebar', section: string|null}>}>,
 *            rosterCoverage: {missing: string[]},
 *            photoReferences: {invalid: string[]},
 *            reporterMode: {violations: string[]}}}
 */
function factCheckContentBundle({
  contentBundle,
  arcEvidencePackages,
  evidenceBundle,
  roster,
  sessionPhotos,
  excludedPhotos,
  reportingMode,
  npcs,
  npcPronouns,
  rosterPronouns,
  directorText,
  guestReporter,
  theme
} = {}) {
  const structuralIssues = [];
  const journalist = theme !== 'detective';
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
  const sources = buildSourceMap(arcEvidencePackages, evidenceBundle);

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
  const verdicts = new Map();   // tokenId + outcome -> its cardFidelity item
  const leaks = new Set();      // tokenId + leaked string, reported once
  const note = (tokenId, reason, location) => {
    const key = `${tokenId}\u0000${reason || ''}`;
    let item = verdicts.get(key);
    if (!item) {
      item = { tokenId, ok: reason === null, reason, locations: [] };
      verdicts.set(key, item);
      cardFidelity.push(item);
    }
    item.locations.push(location);
  };

  for (const { card, location } of cardOccurrences(bundle)) {
    const tokenId = String(card.tokenId == null ? '' : card.tokenId);
    const inline = location.placement === 'inline';
    const content = inline ? String(card.content == null ? '' : card.content) : '';

    // 'leakedExample' — ADVISORY (FACT_CHECK_ADVISORY_ONLY): a two-word substring
    // match, on strings the prompt files no longer ship. Printed content only.
    const leaked = inline && LEAKED_PROMPT_EXAMPLES.find(ex => normalize(content).includes(ex));
    if (leaked && !leaks.has(`${tokenId}\u0000${leaked}`)) {
      leaks.add(`${tokenId}\u0000${leaked}`);
      advisoryWarnings.push(
        `Prompt example leaked into evidence card "${tokenId}": "${leaked}" is an illustrative ` +
        `string from the prompt files, not session evidence. Quote ${DOCUMENT_POINTER} word for word, ` +
        `or drop the card.`
      );
    }

    const source = sources.get(tokenId);
    if (!source) note(tokenId, 'unknown source', location);
    else if (!inline || isVerbatim(content, source)) note(tokenId, null, location);
    else note(tokenId, 'not verbatim', location);
  }

  for (const item of cardFidelity) {
    if (item.ok) continue;
    const where = describeLocations(item.locations);
    if (item.reason === 'unknown source') {
      // A card with no real document behind it: removal stays on offer.
      structuralIssues.push(
        `Evidence card "${item.tokenId}" (${where}) has an unknown source: no memory or paper ` +
        `document in this session's record carries that id. Use the id of a document in <RECORD>, ` +
        `or drop the card.`
      );
    } else {
      // The document is real and the choice of it stands; only the text is wrong.
      // Never offer removal here: on 092026 a reworker that could not see the
      // documents took "or drop the card" and stripped correct cards.
      structuralIssues.push(
        `Evidence card "${item.tokenId}" (${where}) is not verbatim: its content does not appear ` +
        `in that document's text. Keep the card, and replace its content with sentences copied ` +
        `exactly from ${DOCUMENT_POINTER}.`
      );
    }
  }

  // Leaked examples can also arrive as a quote block (formatting.md ships the
  // same string as a "text" example). ADVISORY, as above.
  for (const block of contentBlocks(bundle)) {
    if (block.type !== 'quote') continue;
    const normText = normalize(block.text);
    const leaked = LEAKED_PROMPT_EXAMPLES.find(ex => normText.includes(ex));
    if (leaked) {
      advisoryWarnings.push(
        `Prompt example leaked into a quote block: "${leaked}" is an illustrative string from ` +
        `the prompt files, not something anyone said. Quote the source verbatim or cut the quote.`
      );
    }
  }

  // ── 2. Roster coverage (BASELINE class 2) ─────────────────────────────────
  const names = rosterNames(roster);
  const prose = visibleText(bundle, theme);
  const missing = names.filter(name => !new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(prose));
  if (missing.length > 0) {
    structuralIssues.push(
      `Roster coverage gap: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} on the ` +
      `session roster but never named anywhere the reader can see. Give each of them at least one ` +
      `specific, evidence-grounded appearance.`
    );
  }

  // ── 3. Photo references (BASELINE class 7) ───────────────────────────────
  // The 4b fix batch (T13: an excluded photo never appears): a photo the director
  // excluded is no usable reference, and a fix line offers only the kept photos. It used
  // to offer every session photo, so a rework could be told to place one the director
  // pulled. The message keeps its prefix: the console groups by it.
  const available = new Set(asArray(sessionPhotos).map(basename).filter(Boolean));
  const excluded = new Set(asArray(excludedPhotos).map(basename).filter(Boolean));
  const kept = Array.from(available).filter(filename => !excluded.has(filename));
  const useKept = kept.length > 0 ? `Use one of [${kept.join(', ')}] or remove the reference.` : 'Remove the reference.';
  const referenced = [];
  if (bundle.heroImage && typeof bundle.heroImage === 'object' && bundle.heroImage.filename) {
    referenced.push(String(bundle.heroImage.filename));
  }
  for (const block of contentBlocks(bundle)) {
    if (block.type === 'photo' && block.filename) referenced.push(String(block.filename));
  }
  // The top-level `photos` list never prints, so it is not read (phase 3, 3.4; HY1).

  const invalidPhotos = [];
  if (available.size === 0) {
    if (referenced.length > 0) {
      advisoryWarnings.push(
        `Could not verify ${referenced.length} photo reference(s): this session's photo list is ` +
        `empty in state, so there is nothing to check the filenames against.`
      );
    }
  } else {
    for (const filename of referenced) {
      const name = basename(filename);
      if ((!available.has(name) || excluded.has(name)) && !invalidPhotos.includes(filename)) {
        invalidPhotos.push(filename);
      }
    }
    for (const filename of invalidPhotos) {
      const reason = excluded.has(basename(filename))
        ? 'the director excluded this photo.'
        : "not one of this session's photos.";
      structuralIssues.push(`Invalid photo reference "${filename}": ${reason} ${useKept}`);
    }
  }

  // ── 4. Reporter mode (BASELINE class 6) ──────────────────────────────────
  // NARRATOR text only (I2a): a player quote, an evidence card or a caption may
  // legitimately say "I voted" — the reporter's own prose may not.
  const mode = reportingMode === 'remote' ? 'remote' : 'on-site';
  const normProse = normalize(narratorText(bundle));
  const violations = [];

  for (const phrase of NEVER_VOTES) {
    if (normProse.includes(phrase)) {
      violations.push(phrase);
      // Phase 3 (3.4): the fix never sends the rework to name who acted; an exposure
      // stays anonymous unless the record names who turned it in (spec T6, T8).
      // Phase 3 (3.9): T8's first sentence as round 7 words it (R21): "accuses" is
      // joining the room's accusation. A rework reads this line as must-fix.
      structuralIssues.push(journalist
        ? `Reporter-mode violation: "${phrase}". Nova reports on the room from outside its choices: Nova never ` +
          `votes, joins the room's accusation or exposes a memory, and is never one of the room (T8). Rewrite the ` +
          `sentence without Nova in the vote or the exposure: the vote is the room's, and an exposure stays ` +
          `anonymous unless the evidence log or the director's notes name who turned it in.`
        : `Reporter-mode violation: "${phrase}". The reporter covers the room, they are not a member ` +
          `of it — they never vote and no exposed memory is theirs. Attribute the action to whoever took it.`
      );
    }
  }
  if (mode === 'remote') {
    for (const phrase of PRESENCE_CLAIMS) {
      if (normProse.includes(phrase)) {
        violations.push(phrase);
        // Phase 3 (3.4): exposed memories reach Nova by turn-in, never as tips (spec T6, T8).
        // Phase 3 (3.9): the remote mode block of round 7 (R13): Nova never claims to have
        // seen or heard the room, and the event is told as a scene, attributed where it
        // matters, not sourced sentence by sentence.
        structuralIssues.push(journalist
          ? `Reporter-mode violation (remote): "${phrase}". This session was covered remotely: Nova ` +
            `monitored from outside the warehouse and never claims to have seen or heard the room (T8). Tell ` +
            `the moment as a scene, with attribution where it matters: a line someone was overheard saying, a ` +
            `claim about a person. Exposed memories were turned in to Nova directly, and a person is named as ` +
            `Nova's source only where the record names them.`
          : `Reporter-mode violation (remote): "${phrase}". This session was covered remotely: every ` +
            `exposure, observation and the verdict arrived as a tip from someone who was there. Show ` +
            `where each fact came from by attributing it to the people who told you, and state your ` +
            `absence at most once.`
        );
      }
    }

    // 'repeatedAbsence' — ADVISORY (FACT_CHECK_ADVISORY_ONLY): one statement of
    // the absence is allowed. Phase 3 (3.9): for the journalist, as the remote mode
    // block of round 7 says (R13): once, early, and the room's events told as scenes
    // after it. The detective keeps its line.
    const absences = findAbsenceStatements(narratorText(bundle));
    if (absences.length > 1) {
      advisoryWarnings.push(
        `Absence stated ${absences.length} times (remote): ${absences.map(a => `"${a}"`).join(', ')}. ` +
        (journalist
          ? `Nova says so once, early; after that, the room's events are told as scenes (T8).`
          : `Say that you were not in the room at most once in the whole article, or not at all; ` +
            `everywhere else, show where each fact came from by attributing it to the people who told you.`)
      );
    }
  }

  // ── 5. NPC pronouns (BASELINE class 3) ───────────────────────────────────
  // 'npcPronouns' — ADVISORY (FACT_CHECK_ADVISORY_ONLY) until a live run
  // calibrates it: two suppression rules are in place and correct prose still
  // slipped through the first cut, and a structural verdict costs a paid revision.
  if (!journalist) {
    for (const hit of scanNpcPronouns(prose, declaredPronouns, names)) {
      advisoryWarnings.push(
        `Pronoun error: ${hit.name} takes ${declaredPronouns[hit.name]}, but the article writes ` +
        `"${hit.excerpt}". The roster block's non-player-character line is the authority. ` +
        `Correct every pronoun used of ${hit.name}.`
      );
    }
  } else {
    const segments = narratorSegments(bundle).map(segment => ({ ...segment, text: stripQuotedSpans(segment.text) }));
    const npcNames = npcEntries.map(entry => entry.name);
    const allPeople = [...new Set([...npcNames, NARRATOR, ...names])];
    const othersThan = (own) => allPeople.filter(person => !own.some(name => name.toLowerCase() === person.toLowerCase()));

    // ── 5, phase 3 (3.4). NPC pronouns, read in the narrator's prose (spec T9).
    // 'npcPronouns' ADVISORY. Marcus: they/them or the other gender against his canon
    // pronoun. Blake (no canon pronoun): any gendered pronoun the director's words and
    // the roster do not give. Nova is never scanned here: Nova's rule is its own check.
    for (const entry of npcEntries.filter(e => !e.aliasOf && e.name !== NARRATOR)) {
      const own = [entry.name, ...npcEntries.filter(alias => alias.aliasOf === entry.name).map(alias => alias.name)];
      const declared = gendersOf(entry.pronouns);
      if (entry.pronouns) {
        if (String(entry.pronouns).toLowerCase().includes('they')) continue;
        const wrong = [...THEY_THEM, ...Object.keys(GENDERED_PRONOUNS).filter(g => !declared.includes(g)).flatMap(g => NPC_GENDERED_PRONOUNS[g])];
        const hit = findPronounNear(segments, own, wrong, othersThan(own), { possessives: NPC_POSSESSIVE_PRONOUNS });
        if (hit) {
          advisoryWarnings.push(
            `Pronoun error: ${entry.name} takes ${entry.pronouns}, but the article writes "${hit.excerpt}" ` +
            `(in ${hit.where}). The roster block's non-player-character line is the authority. ` +
            `Correct every pronoun used of ${entry.name}.`
          );
        }
        continue;
      }
      const given = givenGenders(own, directorText, rosterPronouns);
      const wrong = Object.keys(GENDERED_PRONOUNS).filter(g => !given.has(g)).flatMap(g => NPC_GENDERED_PRONOUNS[g]);
      if (wrong.length === 0) continue;
      const hit = findPronounNear(segments, own, wrong, othersThan(own), { possessives: NPC_POSSESSIVE_PRONOUNS });
      if (!hit) continue;
      advisoryWarnings.push(given.size === 0
        ? `Pronoun error: ${entry.name} has no pronoun in the record (neither the director's notes nor the ` +
          `roster give one), but the article writes "${hit.excerpt}" (in ${hit.where}). Write ${entry.name} ` +
          `by name (T9).`
        : `Pronoun error: ${entry.name} takes only the pronoun the director's notes or the roster give, but ` +
          `the article writes "${hit.excerpt}" (in ${hit.where}). Use the pronoun the record gives, or write ` +
          `${entry.name} by name (T9).`
      );
    }

    // 'novaPronoun' ADVISORY: Nova writes in the first person and is otherwise "Nova" (T9).
    const novaHit = findPronounNear(segments, [NARRATOR],
      [...GENDERED_PRONOUNS.masculine, ...GENDERED_PRONOUNS.feminine], othersThan([NARRATOR]));
    if (novaHit) {
      advisoryWarnings.push(
        `Gendered pronoun for Nova: "${novaHit.excerpt}" (in ${novaHit.where}). Nova writes in the first ` +
        `person and is otherwise "Nova", never a gendered pronoun (T9).`
      );
    }

    // 'emDash' ADVISORY: C4's house rule.
    const dashes = segments
      .map(segment => ({ where: segment.where, n: (segment.text.match(/—/g) || []).length }))
      .filter(d => d.n > 0);
    if (dashes.length > 0) {
      const total = dashes.reduce((sum, d) => sum + d.n, 0);
      advisoryWarnings.push(
        `Em-dash in the narrator's prose: ${total} em-dash${total === 1 ? '' : 'es'} ` +
        `(${dashes.map(d => `in ${d.where}${times(d.n)}`).join('; ')}). House style puts a comma, a ` +
        `colon or a full stop where an em-dash might go (C4).`
      );
    }

    // 'productionWords' ADVISORY: the fiction stays whole (T14).
    const production = [];
    for (const segment of segments) {
      for (const { word, re } of PRODUCTION_WORDS) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(segment.text)) !== null) {
          const from = Math.max(0, match.index - 30);
          production.push(`"${word}" in ${segment.where} ("...${excerptOf(segment.text.slice(from, match.index + match[0].length + 30))}...")`);
        }
      }
    }
    if (production.length > 0) {
      advisoryWarnings.push(
        `Production word in print: ${production.join('; ')}. The article speaks the fiction's own words ` +
        `(T14): rewrite each line in the world's terms.`
      );
    }

    // 'length' ADVISORY: the narrator's prose above the flag (C4, R4), quoted lines
    // included, by where the words are.
    const unstripped = narratorSegments(bundle);
    const totalWords = unstripped.reduce((sum, segment) => sum + wordCount(segment.text), 0);
    if (totalWords > LENGTH_FLAG_WORDS) {
      const bySection = new Map();
      for (const segment of unstripped) {
        const key = segment.section === null ? 'headline and deck' : segment.section;
        bySection.set(key, (bySection.get(key) || 0) + wordCount(segment.text));
      }
      const fmt = (n) => n.toLocaleString('en-US');
      advisoryWarnings.push(
        `Over length: the narrator's prose (headline, deck and paragraphs) runs ${fmt(totalWords)} words, above ` +
        `the ${fmt(LENGTH_FLAG_WORDS)}-word flag for an article of about 1,500 words (C4): ` +
        `${[...bySection].map(([key, n]) => `${key} ${fmt(n)}`).join(', ')}. Cut what the thesis does not need.`
      );
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
            if (countOf(match[1]) !== names.length) counts.push(`"${excerptOf(match[0])}" in ${segment.where}`);
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
        advisoryWarnings.push(
          `Head count: ${counts.join('; ')}, but the roster lists ${names.length} players at the investigation` +
          `${reporterNote}. The head count is the players at the investigation (T10).`
        );
      }
    }
  }

  return {
    structuralIssues,
    advisoryWarnings,
    cardFidelity,
    rosterCoverage: { missing },
    photoReferences: { invalid: invalidPhotos },
    reporterMode: { violations }
  };
}

module.exports = {
  factCheckContentBundle,
  FACT_CHECK_ADVISORY_ONLY,
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
