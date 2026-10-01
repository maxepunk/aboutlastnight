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
      warnings.push(unclassified.length + ' adjustment row' + (unclassified.length === 1 ? '' : 's') + ' not classified: ' +
        unclassified.map(function (u) { return (u.time ? u.time + ', ' : '') + dollars(u.amount) + ' on ' + u.account; }).join('; '));
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

  const api = { resolveRosterPronoun, clockLine, ledgerView };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.inputReviewLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
