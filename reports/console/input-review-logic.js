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

  /**
   * One adjustment in words. A row the parse shifted onto the game's clock shows its
   * logged time beside the shifted one.
   */
  function adjustmentLine(a) {
    const logged = a.time && a.loggedTime ? ' (logged ' + a.loggedTime + ')' : '';
    const when = a.time ? a.time + logged + ': ' : '';
    if (a.kind === 'bonus') return when + 'first-burial bonus of ' + dollars(a.amount) + ' paid to ' + a.toAccount;
    return when + 'transfer of ' + dollars(a.amount) + ' from ' + a.fromAccount + ' to ' + a.toAccount;
  }

  /** A count with its noun, singular for one: "1 transfer", "4 transfers". */
  function counted(n, noun) {
    return n + ' ' + noun + (n === 1 ? '' : 's');
  }

  /**
   * The ledger rows the parse lined up onto the game's clock, in one line (phases 14
   * and 15, brief C; R3): what moved, how many hours and which way (ledgerCheck.clockShift,
   * {hours, moved, bonus}), or how many rows sit off the clock with no single shift that
   * lines them up (ledgerCheck.offClock, {rows}). Null when every row is on the clock.
   *
   * @param {Object} ledger - data.ledger
   * @returns {string|null}
   */
  function shiftLine(ledger) {
    const shift = ledger.clockShift;
    if (shift && typeof shift === 'object' && Number(shift.moved) > 0) {
      const transfers = Number(shift.moved) - (shift.bonus ? 1 : 0);
      const what = [shift.bonus ? 'the first-burial bonus' : '', transfers > 0 ? counted(transfers, 'transfer') : '']
        .filter(Boolean).join(' and ');
      const hours = counted(Math.abs(Number(shift.hours)), 'hour');
      return 'The session report logged ' + what + ' ' + hours + ' off the game\'s clock. ' +
        (Number(shift.moved) === 1 ? 'It\'s' : 'They\'re') + ' shifted ' + (Number(shift.hours) < 0 ? 'back ' : 'forward ') +
        hours + ' to line up with the sales.';
    }
    const off = ledger.offClock;
    if (off && typeof off === 'object' && Number(off.rows) > 0) {
      const one = Number(off.rows) === 1;
      return counted(Number(off.rows), 'ledger row') + (one ? ' sits' : ' sit') + ' off the game\'s clock, and no single shift lines ' +
        (one ? 'it' : 'them') + ' up. ' + (one ? 'It prints' : 'They print') + ' as the session report logged ' + (one ? 'it' : 'them') + '.';
    }
    return null;
  }

  /** An account name for matching, as lib/session-ledger.js keys it: letters and digits, lower case. */
  function accountKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Which figure the writers got for an account whose total the Final Standings
   * dispute (final review, data-harness-docs[0]), read from the accounts the writers
   * were given (state.shellAccounts): since that fix, the standings' figure wherever the
   * standings list one. A thread parsed before it kept the sales and adjustments'
   * figure, and no account at all for one the rows never reached.
   *
   * @param {{account: string, standings: number|null}} mismatch
   * @param {Array} accounts - data.ledger.accounts
   * @returns {string}
   */
  function writersFigure(mismatch, accounts) {
    const key = accountKey(mismatch.account);
    const account = accounts.find(function (a) { return a && accountKey(a.name) === key; });
    if (!account) return 'The writers get no figure for it';
    if (mismatch.standings != null && Math.abs(Number(account.total) - mismatch.standings) < 0.5) {
      return 'The writers get the Final Standings\' figure';
    }
    return 'The writers get the sales and adjustments\' figure';
  }

  /**
   * The ledger at the input review (data.ledger, from lib/session-ledger.js
   * ledgerReviewOf): what needs the director first, then each account and each
   * adjustment.
   *
   * `shiftLine` sits beside the clock's line: the rows the parse lined up onto the game's
   * clock, or the rows no single shift fits (shiftLine above), null when there are none.
   * `warnings` leads: the adjustment rows not parsed, a total that disagrees with
   * the session report's Final Standings (and which figure the writers got), no sale or
   * account parsed at all, a row the code could not classify. The accounts and
   * adjustments are the detail, folded away on the screen.
   *
   * @param {Object|null} ledger
   * @returns {{clockLine: string, shiftLine: string|null, warnings: string[], accounts: Array<{name: string, total: string, sales: string}>, adjustments: string[]}}
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
        (m.standings == null ? 'the Final Standings do not list it' : 'the Final Standings say ' + dollars(m.standings)) +
        '. ' + writersFigure(m, list(l.accounts)));
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
      shiftLine: shiftLine(l),
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
