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

/**
 * Normalise for substring comparison: curly quotes to straight, dashes to a
 * plain hyphen, whitespace runs to one space, case-folded.
 *
 * A card the model retyped with a different apostrophe or line wrap is still
 * the same sentence; only a DIFFERENT sentence is a fabrication.
 *
 * @param {*} value
 * @returns {string}
 */
function normalize(value) {
  return String(value == null ? '' : value)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
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
 * Is every substantial sentence of `cardContent` present in `sourceText`?
 *
 * Sentence-wise rather than whole-string so a card may legitimately quote two
 * NON-ADJACENT sentences from the same memory. Sentences under
 * MIN_CHECKED_SENTENCE characters are skipped: they are connective fragments
 * whose presence or absence proves nothing either way.
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
    .map(normalize)
    .filter(s => s.length >= MIN_CHECKED_SENTENCE);

  // Nothing substantial to check (a one-line card): accept. Being lenient here
  // costs an editorial note; being strict costs an Opus revision.
  if (sentences.length === 0) return true;

  return sentences.every(s => source.includes(s));
}

/**
 * The checks that report ADVISORIES ONLY, until a live run calibrates them (I2b).
 *
 * Both are string heuristics that demonstrably fire on correct prose, and a
 * structural verdict is expensive in a way an advisory is not: `evaluateArticle`
 * short-circuits the Opus evaluation on any structural issue and routes straight
 * to a revision, of which an article gets three, all paid. This module's standing
 * invariant is to err toward NOT flagging; these two could not honour it as
 * structural checks.
 *
 *   'npcPronouns'  - a they/them pronoun within six words of an NPC whose canon
 *                    pronouns differ. Two suppression rules already exist for
 *                    plural and shared referents, and correct prose still slipped
 *                    through the first cut.
 *   'leakedExample'- a two-word substring match on illustrative prompt strings.
 *                    The prompt files ship placeholders now, so a hit is far more
 *                    likely to be a session that legitimately wrote the sentence.
 *
 * To PROMOTE one back to structural after a live session's data supports it:
 * remove its name from this list and push its message to `structuralIssues`
 * instead of `advisoryWarnings` at the call site (both are marked with the key).
 * The message strings themselves must not change — `console/checkpoint-view-logic.js`
 * groups the fact-check by message PREFIX.
 */
const FACT_CHECK_ADVISORY_ONLY = ['npcPronouns', 'leakedExample'];

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
 * Reader-visible prose: what a roster mention has to appear in to count.
 *
 * Deliberately generous (headline, captions, card text all count) — a roster
 * member named anywhere the reader can see them is covered, and a false
 * "missing" claim would send a good article back for a paid revision.
 */
function visibleText(contentBundle) {
  const bundle = contentBundle || {};
  const parts = [];

  const headline = bundle.headline || {};
  parts.push(headline.main, headline.kicker, headline.deck);

  for (const block of contentBlocks(bundle)) {
    parts.push(block.text, block.caption, block.headline, block.content);
    asArray(block.items).forEach(i => parts.push(i));
  }

  for (const c of asArray(bundle.evidenceCards)) {
    if (c && typeof c === 'object') parts.push(c.headline, c.content, c.summary, c.owner);
  }
  for (const p of asArray(bundle.photos)) {
    if (p && typeof p === 'object') parts.push(p.caption, ...asArray(p.characters));
  }
  if (bundle.heroImage && typeof bundle.heroImage === 'object') {
    parts.push(bundle.heroImage.caption, ...asArray(bundle.heroImage.characters));
  }
  for (const q of asArray(bundle.pullQuotes)) {
    if (q && typeof q === 'object') parts.push(q.text, q.attribution);
    else parts.push(q);
  }

  return parts.filter(v => typeof v === 'string').join('\n');
}

/**
 * What the REPORTER says in their own voice: paragraph blocks and the headline
 * (main, kicker, deck). Nothing else (I2a).
 *
 * The reporter-mode scan used to read `visibleText`, which is generous ON PURPOSE
 * — it answers "can the reader see this roster name anywhere", so captions, card
 * text and pull quotes all count. Run over first-person reporter-mode phrases,
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
  const bundle = contentBundle || {};
  const headline = bundle.headline || {};
  const parts = [headline.main, headline.kicker, headline.deck];

  for (const block of contentBlocks(bundle)) {
    if (block.type === 'paragraph') parts.push(block.text);
  }

  return parts.filter(v => typeof v === 'string').join('\n');
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
 * @param {string}   args.reportingMode        - 'on-site' | 'remote' (default 'on-site')
 * @param {Object}   [args.npcPronouns]        - name -> 'he/him' for NPCs (victim pronoun scan)
 * @see BASELINE.md §4 for the measured failure classes each check addresses
 * @returns {{structuralIssues: string[], advisoryWarnings: string[],
 *            cardFidelity: Array<{tokenId: string, ok: boolean, reason: string|null}>,
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
  reportingMode,
  npcPronouns
} = {}) {
  const structuralIssues = [];
  const advisoryWarnings = [];
  const cardFidelity = [];

  const bundle = contentBundle || {};
  const sources = buildSourceMap(arcEvidencePackages, evidenceBundle);

  // ── 1. Card fidelity (BASELINE class 1) ───────────────────────────────────
  const cards = [
    ...asArray(bundle.evidenceCards).filter(c => c && typeof c === 'object'),
    ...contentBlocks(bundle).filter(b => b.type === 'evidence-card')
  ];

  for (const c of cards) {
    const tokenId = String(c.tokenId == null ? '' : c.tokenId);
    const content = String(c.content == null ? '' : c.content);
    const normContent = normalize(content);

    // 'leakedExample' — ADVISORY (FACT_CHECK_ADVISORY_ONLY): a two-word substring
    // match, on strings the prompt files no longer ship.
    const leaked = LEAKED_PROMPT_EXAMPLES.find(ex => normContent.includes(ex));
    if (leaked) {
      advisoryWarnings.push(
        `Prompt example leaked into evidence card "${tokenId}": "${leaked}" is an illustrative ` +
        `string from the prompt files, not session evidence. Quote the real source verbatim or drop the card.`
      );
    }

    const source = sources.get(tokenId);
    if (!source) {
      cardFidelity.push({ tokenId, ok: false, reason: 'unknown source' });
      structuralIssues.push(
        `Evidence card "${tokenId}" has an unknown source: no memory token or paper evidence ` +
        `item in this session carries that id. Use an id from the arc evidence packages, or drop the card.`
      );
      continue;
    }

    if (isVerbatim(content, source)) {
      cardFidelity.push({ tokenId, ok: true, reason: null });
    } else {
      cardFidelity.push({ tokenId, ok: false, reason: 'not verbatim' });
      structuralIssues.push(
        `Evidence card "${tokenId}" is not verbatim: its content does not appear in the source ` +
        `text. Replace the card content with sentences copied exactly from that source, or drop the card.`
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
  const prose = visibleText(bundle);
  const missing = names.filter(name => !new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(prose));
  if (missing.length > 0) {
    structuralIssues.push(
      `Roster coverage gap: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} on the ` +
      `session roster but never named anywhere the reader can see. Give each of them at least one ` +
      `specific, evidence-grounded appearance.`
    );
  }

  // ── 3. Photo references (BASELINE class 7) ───────────────────────────────
  const available = new Set(asArray(sessionPhotos).map(basename).filter(Boolean));
  const referenced = [];
  if (bundle.heroImage && typeof bundle.heroImage === 'object' && bundle.heroImage.filename) {
    referenced.push(String(bundle.heroImage.filename));
  }
  for (const block of contentBlocks(bundle)) {
    if (block.type === 'photo' && block.filename) referenced.push(String(block.filename));
  }
  for (const p of asArray(bundle.photos)) {
    if (p && typeof p === 'object' && p.filename) referenced.push(String(p.filename));
  }

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
      if (!available.has(basename(filename)) && !invalidPhotos.includes(filename)) {
        invalidPhotos.push(filename);
      }
    }
    for (const filename of invalidPhotos) {
      structuralIssues.push(
        `Invalid photo reference "${filename}": not one of this session's photos. Use one of ` +
        `[${Array.from(available).join(', ')}] or remove the reference.`
      );
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
      structuralIssues.push(
        `Reporter-mode violation: "${phrase}". The reporter covers the room, they are not a member ` +
        `of it — they never vote and no exposed memory is theirs. Attribute the action to whoever took it.`
      );
    }
  }
  if (mode === 'remote') {
    for (const phrase of PRESENCE_CLAIMS) {
      if (normProse.includes(phrase)) {
        violations.push(phrase);
        structuralIssues.push(
          `Reporter-mode violation (remote): "${phrase}". This session was covered remotely — every ` +
          `exposure, observation and the verdict arrived as a tip from someone who was there. Write ` +
          `it from what they told you and attribute it.`
        );
      }
    }
  }

  // ── 5. NPC pronouns (BASELINE class 3) ───────────────────────────────────
  // 'npcPronouns' — ADVISORY (FACT_CHECK_ADVISORY_ONLY) until a live run
  // calibrates it: two suppression rules are in place and correct prose still
  // slipped through the first cut, and a structural verdict costs a paid revision.
  for (const hit of scanNpcPronouns(prose, npcPronouns, names)) {
    advisoryWarnings.push(
      `Pronoun error: ${hit.name} takes ${npcPronouns[hit.name]}, but the article writes ` +
      `"${hit.excerpt}". The roster block's non-player-character line is the authority. ` +
      `Correct every pronoun used of ${hit.name}.`
    );
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
    LEAKED_PROMPT_EXAMPLES,
    NEVER_VOTES,
    PRESENCE_CLAIMS
  }
};
