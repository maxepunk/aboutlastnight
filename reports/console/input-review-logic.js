/**
 * input-review-logic.js — pure, dual-export logic for the InputReview checkpoint.
 *
 * Browser: registers on window.Console.inputReviewLogic.
 * Node: module.exports (unit-tested in node-env; reports/CLAUDE.md console rule —
 *       no DOM/React harness, so pure logic lives here and the React component
 *       is a thin consumer verified manually).
 */
(function () {
  /**
   * Resolve a character's pronouns for display at the input-review gate.
   * Tolerant of case divergence between the parsed roster name and the
   * (canonical-keyed, post-X-1) pronoun map; defaults to they/them.
   *
   * @param {string} name - roster name as parsed into sessionConfig.roster
   * @param {Object|null} rosterPronouns - canonical-first-name-keyed pronoun map
   * @returns {string} pronoun string, or 'they/them'
   */
  function resolveRosterPronoun(name, rosterPronouns) {
    const map = rosterPronouns || {};
    if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    const lower = String(name).toLowerCase();
    const key = Object.keys(map).find(k => k.toLowerCase() === lower);
    return key ? map[key] : 'they/them';
  }

  // ── Phase 3, brief 3.5: the session clock and the ledger ──────────────────

  /** A dollar figure as the screen prints it. */
  function dollars(amount) {
    return typeof amount === 'number' && isFinite(amount)
      ? '$' + amount.toLocaleString('en-US')
      : String(amount == null ? '' : amount);
  }

  /**
   * Which clock rule applied (lib/prompt-renderers/session-clock.js): the writers
   * see an evening session's logged times as morning.
   *
   * @param {Object|null} clock - data.ledger.clock: {decided, evening, firstTime}
   * @returns {string}
   */
  function clockLine(clock) {
    const c = clock || {};
    if (!c.decided) return 'Clock not decided: no exposure or sale time was parsed';
    const first = c.firstTime ? ' (first exposure or sale at ' + c.firstTime + ')' : '';
    return c.evening
      ? 'Evening session: logged times shown as morning' + first
      : 'Daytime session: logged times shown as logged' + first;
  }

  /** One adjustment in words. */
  function adjustmentLine(a) {
    const when = a.time ? a.time + ': ' : '';
    if (a.kind === 'bonus') return when + 'first-burial bonus of ' + dollars(a.amount) + ' paid to ' + a.toAccount;
    return when + 'transfer of ' + dollars(a.amount) + ' from ' + a.fromAccount + ' to ' + a.toAccount;
  }

  /**
   * The ledger at the input review (data.ledger, from lib/session-ledger.js
   * ledgerReviewOf): what needs the director first, then each account and each
   * adjustment.
   *
   * `warnings` leads: the adjustment rows not parsed, a total that disagrees with
   * the session report's Final Standings, no sale or account parsed at all, a row the
   * code could not classify. The accounts and adjustments are the detail, folded away
   * on the screen.
   *
   * @param {Object|null} ledger
   * @returns {{clockLine: string, warnings: string[], accounts: Array<{name: string, total: string, sales: string}>, adjustments: string[]}}
   */
  function ledgerView(ledger) {
    const l = ledger || {};
    const list = (v) => (Array.isArray(v) ? v : []);
    const warnings = [];
    if (!l.adjustmentsParsed) {
      warnings.push('Adjustments not parsed: the account totals are the session report\'s Final Standings, ' +
        'and no first-burial bonus or transfer reaches the writers');
    }
    list(l.mismatches).forEach(function (m) {
      warnings.push(m.account + ': the sales and adjustments add up to ' + dollars(m.computed) + '; ' +
        (m.standings == null ? 'the Final Standings do not list it' : 'the Final Standings say ' + dollars(m.standings)));
    });
    if (list(l.accounts).length === 0) {
      warnings.push('No sales or account totals parsed from the session report: the writers get no ledger');
    }
    const unclassified = list(l.unclassified);
    if (unclassified.length > 0) {
      // A row code could not read carries what the parse copied: a missing account or
      // amount is named as missing.
      warnings.push(unclassified.length + ' adjustment row' + (unclassified.length === 1 ? '' : 's') + ' not classified: ' +
        unclassified.map(function (u) {
          return (u.time ? u.time + ', ' : '') + (dollars(u.amount) || 'no amount') + ' on ' + (u.account || 'no account');
        }).join('; '));
    }
    return {
      clockLine: clockLine(l.clock),
      warnings: warnings,
      accounts: list(l.accounts).filter(function (a) { return a && a.name; }).map(function (a) {
        const n = typeof a.tokenCount === 'number' ? a.tokenCount : 0;
        return { name: String(a.name), total: dollars(a.total), sales: n === 0 ? 'no sales' : n + ' sale' + (n === 1 ? '' : 's') };
      }),
      adjustments: list(l.adjustments).filter(function (a) { return a && (a.kind === 'bonus' || a.kind === 'transfer'); }).map(adjustmentLine)
    };
  }

  // ── The director's notes as the enricher indexed them (task 3.5 fix batch, item 9) ──
  //
  // The panel reads two shapes: the one stored before task 3.6 (every quote with a
  // speaker, every epilogue item with a model-written headline) and the one 3.6
  // stores (a quote's speaker only where the notes or a correction name it, and the
  // director's correction beside it; an epilogue item is the director's sentence).

  /** A field as trimmed text, '' for anything that is not text. */
  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  /** What the panel shows for a quote whose speaker the notes do not name. */
  const SPEAKER_NOT_RECORDED = 'speaker not recorded';

  /**
   * One quote from the quote bank, for the notes panel.
   *
   * A quote with no speaker, or the stored "unknown", shows "speaker not recorded",
   * as the writers' <QUOTE_BANK> prints it.
   *
   * @param {Object|null} quote - a directorNotes.quotes entry
   * @returns {{speaker: string, speakerRecorded: boolean, addressee: string, text: string,
   *            context: string, correction: string, confidence: string}}
   */
  function quoteView(quote) {
    const q = quote && typeof quote === 'object' ? quote : {};
    const speaker = text(q.speaker);
    const recorded = speaker !== '' && speaker.toLowerCase() !== 'unknown';
    return {
      speaker: recorded ? speaker : SPEAKER_NOT_RECORDED,
      speakerRecorded: recorded,
      addressee: text(q.addressee),
      text: text(q.text),
      context: text(q.context),
      correction: text(q.correction),
      confidence: text(q.confidence)
    };
  }

  /**
   * One epilogue item (directorNotes.postInvestigationDevelopments), for the notes
   * panel: the headline only when a stored item has one, the director's sentence
   * (`detail`) always.
   *
   * @param {Object|null} item
   * @returns {{headline: string, detail: string, subjects: string[], bearing: string}}
   */
  function epilogueItemView(item) {
    const d = item && typeof item === 'object' ? item : {};
    return {
      headline: text(d.headline),
      detail: text(d.detail),
      subjects: Array.isArray(d.subjects) ? d.subjects.filter(function (s) { return text(s) !== ''; }) : [],
      bearing: text(d.bearingOnNarrative)
    };
  }

  /** The enricher's warnings since task 3.6, each counted under a short label. */
  const ENRICHMENT_WARNING_LABELS = [
    { key: 'unrecordedSpeakers', one: 'quote speaker', many: 'quote speakers', why: 'not recorded: the notes and corrections do not name them' },
    { key: 'droppedContexts', one: 'quote context', many: 'quote contexts', why: 'dropped: not copied word for word from the notes' },
    { key: 'droppedEpilogueItems', one: 'epilogue item', many: 'epilogue items', why: 'dropped: not copied word for word from the notes' },
    // 3.6b fix batch: a quote's correction the director's corrections do not hold (its
    // speaker is then left out too), and a transaction link whose observation the
    // notes do not hold.
    { key: 'droppedCorrections', one: 'quote correction', many: 'quote corrections', why: 'dropped: not copied word for word from the corrections' },
    { key: 'droppedExcerpts', one: 'transaction link', many: 'transaction links', why: 'dropped: observation not copied word for word from the notes' }
  ];

  /**
   * The enricher's warnings the panel lists beside the dropped-quote line: one line
   * per key with a count above zero.
   *
   * @param {Object|null} warnings - data.enrichment.warnings (_enrichmentWarnings)
   * @returns {string[]}
   */
  function enrichmentWarningLines(warnings) {
    const w = warnings && typeof warnings === 'object' ? warnings : {};
    return ENRICHMENT_WARNING_LABELS
      .filter(function (label) { return typeof w[label.key] === 'number' && w[label.key] > 0; })
      .map(function (label) {
        const n = w[label.key];
        return n + ' ' + (n === 1 ? label.one : label.many) + ' ' + label.why;
      });
  }

  const api = { resolveRosterPronoun, clockLine, ledgerView, quoteView, epilogueItemView, enrichmentWarningLines };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.inputReviewLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
