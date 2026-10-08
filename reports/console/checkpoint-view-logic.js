/**
 * checkpoint-view-logic.js — PURE read-side logic for the four intervention
 * checkpoint screens (the story meeting at arc-selection, outline, article,
 * input-review).
 *
 * Dual-export: registers on window.Console.checkpointViewLogic for the browser
 * AND exposes the same surface via module.exports under Node so it can be
 * unit-tested in node-env Jest (reports/CLAUDE.md: the console has no DOM/React
 * harness, so anything testable lives in a module like this one and the React
 * component is a thin consumer).
 *
 * WHY IT EXISTS: every function here replaces an inline read of a field name
 * that the pipeline does not emit. The director approved four of the last five
 * articles first-pass at every checkpoint and then made 20-41 fixes each,
 * because the gates were rendering nothing:
 *
 *   meetingView (task 4.8)
 *     the arc stop is the story meeting: one weave, read and settled in minutes.
 *     The arc cards it replaced read the arc schema's fields (CODE-REVIEW H7);
 *     the meeting reads 4.5's payload (lib/meeting.js meetingCheckpointData) and
 *     sends only 4.5's payloads (meetingPayload).
 *
 *   mapView (task 4.9)
 *     the outline stop is the map: the settled weave laid across the sections, read
 *     and edited line by line in minutes. It reads 4.6's payload (lib/map.js
 *     mapCheckpointData) and sends only 4.6's payloads (mapPayload).
 *
 *   deskView (task 4.10)
 *     the article stop is the director's desk: the article as it will print, each fact
 *     the judge could not fix and each code check's flag marked beside the piece it is
 *     about, and nothing in front of it, no score and no note on the writing.
 *
 *   accusationView
 *     the block read `reasoning` and `confidence`; the parse emits `charge` and
 *     `notes`, so the whole parsed accusation (votes, motive, alternative
 *     theories) was invisible on the one screen that exists to verify it
 *     (R5 F7, CODE-REVIEW H25).
 *
 *   whiteboardView
 *     the panel read connectionsMade / questionsRaised / votingResults; the
 *     whiteboard schema (input-nodes.js WHITEBOARD_SCHEMA) emits names /
 *     connections / groups / notes / structureType / ambiguities.
 *
 *   factCheckSummary
 *     the programmatic fact-check (lib/content-bundle-fact-check.js) reached the
 *     reviser as prompt text and the operator not at all; half the refinement
 *     work was already computed and thrown away (BASELINE §5).
 *
 * MUST NOT reference React, and must not touch `window` at module-evaluation
 * time except the guarded window.Console write.
 */
(function () {
  'use strict';

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asString(value) {
    return typeof value === 'string' ? value : '';
  }

  /** Every entry of `value` that is a non-empty string, trimmed of nothing. */
  function stringList(value) {
    return asArray(value).filter(function (v) { return typeof v === 'string' && v.length > 0; });
  }

  // ── The director's edits are final (F1, spec 2026-10-02 section 7) ──────────

  /**
   * The one prefix a finding about one of the director's edits opens with, in the
   * judge's and the fact check's advisoryWarnings: "Director's edit E3: T1: ...". A copy
   * of lib/hand-edit-diff.js DIRECTOR_EDIT_PREFIX, which the browser cannot import; a
   * test holds the two equal.
   */
  var DIRECTOR_EDIT_PREFIX = "Director's edit ";

  /**
   * The pass a hand-edit report entry names when the rework of the director's send-back
   * made the change; any other pass is a reweave's (REWEAVE_PASS) or an automatic pass's
   * number. A copy of lib/hand-edit-diff.js SEND_BACK_PASS; a test holds the two equal.
   */
  var SEND_BACK_PASS = 'send-back';

  /**
   * The pass a hand-edit report entry names when a reweave at the story meeting made the change
   * (brief 4.5). A reweave is held to the director's edits as an automatic pass is. A copy of
   * lib/hand-edit-diff.js REWEAVE_PASS; a test holds the two equal.
   */
  var REWEAVE_PASS = 'reweave';

  /** The heading the concerns about the director's edits sit under, in the fact check's list. */
  var DIRECTOR_EDIT_CONCERNS_LABEL = 'Concerns about your edits';

  function isDirectorEditConcern(text) {
    return typeof text === 'string' && text.indexOf(DIRECTOR_EDIT_PREFIX) === 0;
  }

  // ── Documents by name (brief 1.2) ─────────────────────────────────────────

  /**
   * One document as the stop names it (brief 1.2; a piece's document at the story meeting,
   * through receiptView; phase 4b, brief 1B).
   *
   * `evidenceIndex` is the stop's payload map from a document's id to the document
   * (`server.js#buildEvidenceIndex`); without it the director judged the arcs by
   * `85620c6f-befd-4799-a877-8fc25c040d8e`, which is what happened in a session
   * before brief 1.2. An id the index does not hold still renders: the label falls
   * back to the id, so a stale or hand-built payload shows something rather than a
   * blank.
   *
   * @param {string} id - the document's id, as the index keys it
   * @param {object} index - evidenceIndex from the checkpoint payload
   * @returns {{id: string, name: string, owner: string, type: string,
   *            firstLine: string, label: string}|null}
   */
  function evidenceEntry(id, index) {
    if (typeof id !== 'string' || !id) return null;
    var known = (index && typeof index === 'object' && index[id]) || {};
    // The index falls back to the id when a document has no name of its own, and
    // repeating it as a name would claim more than the record holds.
    var name = asString(known.name) === id ? '' : asString(known.name);
    var owner = asString(known.owner);
    return {
      id: id,
      name: name,
      owner: owner,
      type: asString(known.type),
      firstLine: asString(known.firstLine),
      label: (name || id) + (owner ? ' (' + owner + ')' : '')
    };
  }

  // ── Truncated-paste guard ─────────────────────────────────────────────────

  /** How much of the end of a paste to show by default. */
  var TAIL_LENGTH = 60;

  /**
   * How much text there is and how it ends.
   *
   * Session 062726's director notes reached the pipeline TWO PARAGRAPHS SHORT
   * and nobody could tell, because no screen ever said how much text it was
   * holding (baseline §6(a)). A word count plus the last characters makes a
   * truncated paste visible before submit, and again on the review screen before
   * approval. Whitespace in the tail is collapsed so a multi-paragraph ending
   * still renders on one line.
   *
   * @param {*} text
   * @param {number} [tailLength]
   * @returns {{words: number, tail: string, truncated: boolean}}
   */
  function wordTail(text, tailLength) {
    var limit = typeof tailLength === 'number' && tailLength > 0 ? tailLength : TAIL_LENGTH;
    if (typeof text !== 'string') return { words: 0, tail: '', truncated: false };
    var collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed.length === 0) return { words: 0, tail: '', truncated: false };
    return {
      words: collapsed.split(' ').filter(function (w) { return w.length > 0; }).length,
      tail: collapsed.length > limit ? collapsed.slice(-limit) : collapsed,
      truncated: collapsed.length > limit
    };
  }

  // ── Input review ──────────────────────────────────────────────────────────

  /**
   * Display shape for the parsed accusation.
   *
   * `accused` is an array in sessionConfig; it is joined here so the screen can
   * render it and, when it is empty, say so in red rather than hiding the whole
   * block (which is what "the one thing this checkpoint exists to verify" did).
   * `reasoning` is accepted as `notes` for an older payload.
   *
   * @param {object|null} accusation
   * @returns {{accused: string, charge: string, notes: string}}
   */
  function accusationView(accusation) {
    var a = accusation || {};
    var accused = Array.isArray(a.accused)
      ? a.accused.filter(function (n) { return typeof n === 'string' && n.trim().length > 0; }).join(', ')
      : asString(a.accused);
    return {
      accused: accused,
      charge: asString(a.charge),
      notes: asString(a.notes) || asString(a.reasoning)
    };
  }

  /**
   * Display shape for the whiteboard analysis: the fields input-nodes.js
   * WHITEBOARD_SCHEMA emits.
   *
   * `ambiguities` is first in the returned object AND first on the screen: it is
   * the parser's own list of what it could not read, which is exactly what the
   * director can correct and nothing else can.
   *
   * Phase 3 (brief 3.5): `regions`, each under the heading the players wrote, in
   * place of groups under a model-written label. An older parse's `groups`
   * ({label, members}) show as regions.
   *
   * @param {object|null} wb
   * @returns {{ambiguities: any[], names: any[], regions: Array<{label: string, location: string, entries: any[]}>,
   *            connections: any[], notes: any[], structureType: string}}
   */
  function whiteboardView(wb) {
    var w = wb || {};
    var regions = Array.isArray(w.regions)
      ? w.regions.filter(function (r) { return r && typeof r === 'object'; }).map(function (r) {
        return { label: asString(r.label), location: asString(r.location), entries: asArray(r.entries) };
      })
      : asArray(w.groups).filter(function (g) { return g && typeof g === 'object'; }).map(function (g) {
        return { label: asString(g.label), location: '', entries: asArray(g.members) };
      });
    return {
      ambiguities: asArray(w.ambiguities),
      names: asArray(w.names),
      regions: regions,
      connections: asArray(w.connections),
      notes: asArray(w.notes),
      structureType: asString(w.structureType)
    };
  }

  // ── Article fact-check ────────────────────────────────────────────────────

  /**
   * The prefixes lib/content-bundle-fact-check.js gives the structural issues it
   * ALSO reports through a structured sub-object (cardFidelity, rosterCoverage,
   * photoReferences, reporterMode).
   *
   * Anything else it can emit has no structured counterpart, so it would be
   * invisible if the screen showed only the four groups. Those land in the `other`
   * group. (I2b: the two messages that used to arrive this way — a leaked prompt
   * example and an NPC pronoun error — are advisories now; the pronoun error has
   * its own advisory group since phase 3, see ADVISORY_GROUPS. Their prefixes were
   * left unchanged so that promoting one back to structural needs no change here.)
   *
   * Prefix matching is deliberate and fails safe: if a message is reworded, its
   * issue moves INTO `other` (still on screen, just ungrouped) rather than out
   * of the list.
   */
  var GROUPED_ISSUE_PREFIXES = [
    'Evidence card "',
    'Roster coverage gap:',
    'Invalid photo reference "',
    'Reporter-mode violation'
  ];

  function isGroupedIssue(text) {
    return GROUPED_ISSUE_PREFIXES.some(function (prefix) { return text.indexOf(prefix) === 0; });
  }

  /**
   * The advisory checks that get a group of their own (phase 3, 3.4), by the message
   * prefix lib/content-bundle-fact-check.js gives each. Every advisory none of them
   * claims (a leaked prompt example, a repeated absence, an unverifiable photo list)
   * stays in the general `advisory` group. Only advisories are grouped here: a
   * structural message with one of these prefixes, which a promotion would produce,
   * lands in `other` as before. None of them counts toward the approve button's
   * unresolved count (approveLabel), which is structural only.
   */
  var ADVISORY_GROUPS = [
    { key: 'emDash', prefix: 'Em-dash in the narrator\'s prose:', label: 'Em-dashes in Nova\'s prose' },
    { key: 'productionWords', prefix: 'Production word in print:', label: 'Production words in print' },
    { key: 'novaPronoun', prefix: 'Gendered pronoun for Nova:', label: 'Nova written with a gendered pronoun' },
    { key: 'npcPronouns', prefix: 'Pronoun error:', label: 'Pronouns for Marcus and Blake' },
    { key: 'length', prefix: 'Over length:', label: 'Length' },
    { key: 'headCount', prefix: 'Head count:', label: 'Head count' }
  ];

  function advisoryGroupOf(text) {
    for (var i = 0; i < ADVISORY_GROUPS.length; i += 1) {
      if (text.indexOf(ADVISORY_GROUPS[i].prefix) === 0) return ADVISORY_GROUPS[i];
    }
    return null;
  }

  function group(key, label, severity, items) {
    return { key: key, label: label, severity: severity, items: items };
  }

  // ── Card locations (slice 2.5) ────────────────────────────────────────────

  /**
   * Where a flagged card sits, from a `cardFidelity` item's `locations`:
   * `inline in the-story`, `inline in the-story twice, sidebar`.
   *
   * The check reports one item per defect however many places the document
   * appears, so the card list and the structural count agree; this names every
   * place, so the director can find each copy. An item from before the check
   * carried locations has none, and gets an empty string.
   *
   * @param {Array<{placement: string, section: string|null}>|undefined} locations
   * @returns {string}
   */
  function cardLocationText(locations) {
    var order = [];
    var counts = {};
    asArray(locations).forEach(function (loc) {
      if (!loc || typeof loc !== 'object') return;
      var label = loc.placement === 'sidebar'
        ? 'sidebar'
        : (asString(loc.section) ? 'inline in ' + loc.section : 'inline');
      if (!Object.prototype.hasOwnProperty.call(counts, label)) {
        counts[label] = 0;
        order.push(label);
      }
      counts[label] += 1;
    });
    return order.map(function (label) {
      var n = counts[label];
      return label + (n === 2 ? ' twice' : n > 2 ? ' ' + n + ' times' : '');
    }).join(', ');
  }

  /**
   * The article fact-check as a defect list the gate can render: the whole list, which the
   * desk folds below the article since each finding is marked beside its piece (task 4.10).
   *
   * F1: a hit located in the director's own edit, or caused by the director's cut, is an
   * advisory opening with DIRECTOR_EDIT_PREFIX. Those form one group of their own
   * (`directorEdits`), after the structural groups and before the other advisories; a
   * card item marked with its edit (`directorEdit`) is not in the card list. They count
   * as advisories, never as unresolved (approveLabel).
   *
   * @param {object|null} factCheck - state._articleFactCheck
   * @returns {{structural: number, advisory: number, total: number,
   *            groups: Array<{key: string, label: string, severity: string,
   *                           items: Array<{text: string, tokenId?: string}>}>}}
   */
  function factCheckSummary(factCheck) {
    var fc = factCheck || {};
    var structuralIssues = stringList(fc.structuralIssues);
    var advisoryWarnings = stringList(fc.advisoryWarnings);
    var groups = [];

    var badCards = asArray(fc.cardFidelity)
      .filter(function (c) { return c && c.ok === false && !asString(c.directorEdit); })
      .map(function (c) {
        var tokenId = asString(c.tokenId);
        var reason = asString(c.reason) || 'failed the fidelity check';
        var where = cardLocationText(c.locations);
        return {
          text: (tokenId || '(no tokenId)') + ': ' + reason + (where ? ' (' + where + ')' : ''),
          tokenId: tokenId
        };
      });
    if (badCards.length > 0) {
      groups.push(group('cards', 'Evidence cards that failed the check', 'structural', badCards));
    }

    var missing = stringList(fc.rosterCoverage && fc.rosterCoverage.missing)
      .map(function (name) { return { text: name }; });
    if (missing.length > 0) {
      groups.push(group('roster', 'Roster members never mentioned', 'structural', missing));
    }

    var invalidPhotos = stringList(fc.photoReferences && fc.photoReferences.invalid)
      .map(function (filename) { return { text: filename }; });
    if (invalidPhotos.length > 0) {
      groups.push(group('photos', 'Invalid photo references', 'structural', invalidPhotos));
    }

    var violations = stringList(fc.reporterMode && fc.reporterMode.violations)
      .map(function (phrase) { return { text: phrase }; });
    if (violations.length > 0) {
      groups.push(group('reporter', 'Reporter-mode violations', 'structural', violations));
    }

    var other = structuralIssues
      .filter(function (text) { return !isGroupedIssue(text); })
      .map(function (text) { return { text: text }; });
    if (other.length > 0) {
      groups.push(group('other', 'Other structural issues', 'structural', other));
    }

    var concerns = advisoryWarnings
      .filter(isDirectorEditConcern)
      .map(function (text) { return { text: text }; });
    if (concerns.length > 0) {
      groups.push(group('directorEdits', DIRECTOR_EDIT_CONCERNS_LABEL, 'advisory', concerns));
    }

    ADVISORY_GROUPS.forEach(function (spec) {
      var items = advisoryWarnings
        .filter(function (text) { return advisoryGroupOf(text) === spec; })
        .map(function (text) { return { text: text }; });
      if (items.length > 0) groups.push(group(spec.key, spec.label, 'advisory', items));
    });

    var otherAdvisories = advisoryWarnings
      .filter(function (text) { return advisoryGroupOf(text) === null && !isDirectorEditConcern(text); })
      .map(function (text) { return { text: text }; });
    if (otherAdvisories.length > 0) {
      groups.push(group('advisory', 'Advisory', 'advisory', otherAdvisories));
    }

    return {
      structural: structuralIssues.length,
      advisory: advisoryWarnings.length,
      total: structuralIssues.length + advisoryWarnings.length,
      groups: groups
    };
  }

  /**
   * The article gate's Approve button copy.
   *
   * The count is STRUCTURAL ONLY. Advisory warnings are "suggestions, not
   * blockers" by the evaluator's own definition, so counting them as unresolved
   * (which the first cut did) makes a cosmetic note read like a defect and
   * cheapens the warning it is there to carry. They are reported alongside
   * instead, and they never put "anyway" on the button — there is nothing to
   * approve *anyway* when nothing structural failed.
   *
   * @param {object|null} summary - factCheckSummary result
   * @param {boolean} hasEdits - whether the bundle carries hand-edits
   * @returns {{label: string, ariaLabel: string}}
   */
  function approveLabel(summary, hasEdits) {
    var base = hasEdits ? 'Approve with Edits' : 'Approve';
    var structural = (summary && summary.structural) || 0;
    var advisory = (summary && summary.advisory) || 0;

    if (structural === 0 && advisory === 0) {
      return {
        label: base,
        ariaLabel: hasEdits ? 'Approve article with edits' : 'Approve article'
      };
    }
    if (structural === 0) {
      return {
        label: base + ' (' + advisory + ' advisory)',
        ariaLabel: 'Approve the article with ' + advisory + ' advisory fact-check note(s)'
      };
    }
    var tail = structural + ' unresolved' + (advisory > 0 ? ', ' + advisory + ' advisory' : '');
    return {
      label: base + ' anyway (' + tail + ')',
      ariaLabel: 'Approve the article despite ' + structural + ' unresolved fact-check issue(s)'
    };
  }

  // ── steeringView (spec 2026-09-19 §4.4, §5.5) ─────────────────────────────
  // The hand-edit report and the standing notes as RevisionDiff renders them.
  // A scope as a trace or a report names it: the article's (lib/hand-edit-diff.js diffBundle)
  // and the map's (diffMap, task 4.9); a section's scope is `section:<id or slot>`.
  var SCOPE_LABELS = {
    headline: 'Headline', byline: 'Byline', pullQuotes: 'Pull quotes', evidenceCards: 'Evidence cards',
    financialTracker: 'Financial tracker', photos: 'Photos', heroImage: 'Hero image',
    deck: 'Deck', topPhoto: 'Top photo', gapNote: 'Gap note', leftOut: 'Left out', dropped: 'Dropped sections',
    weaveChanges: 'Changes to the weave', expectedLength: 'Expected length'
  };

  function scopeLabel(key) {
    // Own-property only: a scope key named after an Object.prototype member
    // ('constructor', 'toString') would otherwise render the inherited function.
    if (Object.prototype.hasOwnProperty.call(SCOPE_LABELS, key)) return SCOPE_LABELS[key];
    if (typeof key === 'string' && key.indexOf('section:') === 0) return 'Section "' + key.slice(8) + '"';
    return String(key);
  }

  /**
   * A hand-edit report as the server sends it since F1 (lib/hand-edit-diff.js
   * reportAfterPass): `checked`, the ids of the director's edits the round's passes
   * checked, and `changed`, one entry per edit a pass changed. A report from before F1
   * named scopes, not edits, and one that checked nothing says nothing: both read as
   * none. The server's handEditReportOf reads a report by the same rule, and a test holds
   * the two equal (FA, known item 7).
   */
  function editReportOf(report) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return null;
    if (!Array.isArray(report.checked) || !Array.isArray(report.changed) || report.checked.length === 0) return null;
    if (!report.checked.every(function (id) { return typeof id === 'string' && /^E\d+$/.test(id); })) return null;
    if (!report.changed.every(function (c) { return c && typeof c === 'object' && !Array.isArray(c) && typeof c.id === 'string'; })) return null;
    return report;
  }

  /**
   * What the line says of text the director took out that came back: it stays for the
   * director to cut, in the output the stop shows (`options.stillIn`, by default the article).
   */
  function stillInLine(stillIn) {
    return 'It is still ' + (asString(stillIn) || 'in the article') + ': cut it again if it should go.';
  }

  /**
   * What the line says of a block the director moved that an automatic pass removed: a
   * move is the block's place only, and its text the writer's, so code leaves it out
   * (lib/hand-edit-diff.js settleEdits; FA fix round 1).
   */
  var MOVED_BLOCK_LEFT_OUT = 'Only its place was your edit, so it was not put back: add it again if it should stay.';

  /**
   * What the line says of a writer's move the director's order of a section named, which an
   * automatic pass removed from the map or moved into Left out (the entry's `fromOrder`;
   * lib/hand-edit-diff.js reportAfterPass, fixes C2 and H1): the director set its place in the
   * order and never placed it, and its evidence went with it, so code leaves it where the pass
   * put it and the line asks for nothing.
   */
  var WRITERS_MOVE_LEFT = 'It was the writer\'s move, so it was not put back.';

  /**
   * What the line says of a block moved within its section that code put back in that section
   * where no place keeps the director's order (task 4.3c: the entry's `inOrder` is false).
   */
  var PUT_BACK_OUT_OF_ORDER = 'It was put back in its section, but not in the order you left it: move it again if the order matters.';

  /**
   * What the line says of an element the director put in whole that code put back without a photo
   * the article cannot print, which a pass took out of print (task 4.5g: the entry's `unprintable`
   * beside `restored`): the rest of the director's edit stands, as code put it back, for every
   * later pass and the next send-back (lib/hand-edit-diff.js standingAfterPass; fix round 1), and
   * the place may want a photo the article can print.
   */
  var PUT_BACK_WITHOUT_PHOTO = 'The rest of your edit stands: place a photo the article can print here if it should have one.';

  /**
   * What the line says of a block the director wrote that code put back where it could not tell
   * which block was the pass's version of it (task 4.14c: the entry's `maybeCopies`, the texts of
   * the blocks that may be, the closest first): the director checks whether their text now prints
   * twice, and deletes each block that repeats it (fix round 2: two blocks may each be).
   */
  function maybeCopyLine(texts) {
    var quoted = texts.map(function (text) { return '"' + text + '"'; });
    if (quoted.length === 1) return quoted[0] + ' may be the pass\'s version of it: delete that block if your text now prints twice.';
    return quoted.slice(0, -1).join(', ') + ' and ' + quoted[quoted.length - 1] +
      ' may each be the pass\'s version of it: delete each block that repeats your text.';
  }

  /** The texts of the blocks a report entry names as ones that may be a pass's version of the director's (`maybeCopies`, task 4.14c); [] for none. */
  function maybeCopyTexts(entry) {
    return Array.isArray(entry.maybeCopies) ? entry.maybeCopies.filter(function (text) { return typeof text === 'string'; }) : [];
  }

  /**
   * A reason a rework gave, as a sentence the next reason can follow (brief 4.10e): closed with a
   * full stop, in place of a comma, colon, semicolon or dash it trails off on, unless it ends on its
   * own closing punctuation (a full stop, a question or exclamation mark, or an ellipsis, with any
   * closing quotation mark or bracket after it). '' for none.
   */
  function closedReason(text) {
    var reason = asString(text).trim();
    if (!reason || /[.!?\u2026]["'\u201d\u2019)\]]*$/.test(reason)) return reason;
    return reason.replace(/[\s,;:\-\u2013\u2014]+$/, '') + '.';
  }

  /**
   * Which pass made a report entry's change, in a line's words, and the reason a send-back's
   * rework gave: `held` for a pass held to the director's edits (an automatic pass or a reweave),
   * whose changes code puts back. changedEditLine reads it for one entry, and the meeting's line
   * for an element a round took out reads it for the edits of the element's fields
   * (takenOutWithEditLine; brief 4.10d): given the entries of one pass, `why` gives each reason
   * the rework gave for them once, in their order, each closed with a full stop (closedReason;
   * brief 4.10e), so one reason ends before the next begins.
   *
   * @param {Object|Object[]} entries - a report entry, or the entries of one pass
   * @returns {{held: boolean, by: string, why: string}}
   */
  function passWords(entries) {
    var list = Array.isArray(entries) ? entries : [entries];
    var entry = list[0];
    var automatic = entry.automatic === true;
    var reweave = entry.pass === REWEAVE_PASS;
    var reasons = [];
    list.forEach(function (each) {
      var reason = closedReason(each.reason);
      if (reason && reasons.indexOf(reason) === -1) reasons.push(reason);
    });
    return {
      held: automatic || reweave,
      by: automatic ? 'automatic pass ' + entry.pass : (reweave ? 'your reweave' : 'the rework of your send-back'),
      why: reasons.length > 0 ? 'Why: ' + reasons.join(' ') : 'No reason given.'
    };
  }

  /**
   * One line for an edit a pass changed (F1, FA): its place (by default its id and field,
   * since FA; an entry from before FA names its scope), what happened to the director's
   * text, which pass did it, and what followed. Who made a change is the entry's own
   * `automatic` flag (known item 7), and a reweave's entry names its pass (brief 4.5): a
   * reweave is held to the director's edits as an automatic pass is, so its line reads as an
   * automatic pass's does, under its own name. Every stop phrases its report here: the desk
   * through steeringView and deskMarks, the map through mapView, the story meeting through
   * meetingView, which names its places as its page heads them (task 4.8, fix round 1).
   * - A beat the director struck on the map (brief 4.6) that a pass brought back or took out;
   *   after an automatic pass, whether code struck it again.
   * - A thread the director brought into an angle's story or left out of it (`flip`; piece 3,
   *   R2) that a pass flipped the other way; after a pass held to the edits, whether code put it
   *   back (`options.story` names the story, by default "the story"). One whose angle the pass
   *   took out whole (`angleTakenOut`, the final review) says the flip went with the angle.
   * - A field or element an automatic pass changed: code put it back (`restored`), and
   *   the line says so; an entry from before FA says the pass should have kept it.
   * - One on a photo the article cannot print (`unprintable`, task 4.5e), which a pass took out of
   *   print: a caption the director wrote under it, which code left out with it, and the line says
   *   why (brief 4.10c); or, beside `restored`, an element the director put in whole that code put
   *   back without that photo, whose line asks for a photo the article can print (task 4.5g). An
   *   entry whose photo still prints carries no `unprintable` and reads as any other change.
   * - A cut, or a sentence a rewrite removed, that came back: it is still in the output,
   *   because code never takes text out.
   * - A Key Evidence entry the director deleted that a pass put back under its tokenId, in any
   *   words (the entry's `tokenId`, task 4.14f): after an automatic pass, that code took it out
   *   again, as the map says of a struck beat struck again; after a send-back, the rework's reason.
   * - A block the director moved that a pass took to another section: where it went, and
   *   whether code put it back, in the director's order or not (task 4.3c, `inOrder`); one a
   *   pass removed: that code left it out, since only its place was the director's edit. The
   *   map (task 4.9) names the element a move or a photo (fix H1: the page's word), and the desk
   *   a Key Evidence entry an entry (task 4.14c).
   * - A writer's move the director's order of a section named, which an automatic pass took out
   *   of that order (`fromOrder`, fix H1): that the pass removed it, or moved it into the place
   *   `became` names, and that code left it there, since the move was the writer's.
   * - A block the director wrote that code put back where it could not tell which block was the
   *   pass's version of it (`maybeCopies`, task 4.14c): the blocks that may be, for the director
   *   to check.
   * - A change a send-back's rework made: the rework's reason, or that it gave none.
   *
   * @param {Object} entry - one of the report's `changed` entries (lib/hand-edit-diff.js reportAfterPass)
   * @param {Object} [options]
   * @param {function(Object): string} [options.place] - the entry's place; by default its id and `where`
   * @param {function(string): string} [options.valueText] - how a value reads; by default as written
   * @param {function(Object): string} [options.thing] - what a moved element is called; by default a
   *   sidebar entry is an entry and anything else a block
   * @param {string} [options.stillIn] - where text that came back still is: by default 'in the article'
   * @param {function(Object): string} [options.story] - the story a flipped thread's entry is about
   * @returns {string}
   */
  function changedEditLine(entry, options) {
    var o = options || {};
    var label = typeof o.place === 'function'
      ? o.place(entry)
      : entry.id + ', ' + (asString(entry.where) ? entry.where : scopeLabel(entry.scope));
    var valueText = typeof o.valueText === 'function' ? o.valueText : function (text) { return text; };
    var thing = typeof o.thing === 'function' ? o.thing(entry) : (entry.scope === 'evidenceCards' ? 'entry' : 'block');
    var became = typeof entry.became === 'string' ? valueText(entry.became) : null;
    var director = valueText(asString(entry.director));
    // A pass held to the director's edits: code puts back what it changed.
    var pass = passWords(entry);
    var held = pass.held;
    var by = pass.by;
    var why = pass.why;
    var cameBackAs = became !== null ? ' as "' + became + '"' : '';
    if (entry.struck === true) {
      var struck = label + ': ' + by + (became !== null ? ' brought it back.' : ' took it out.');
      if (!held) return struck + ' ' + why;
      if (became === null) return struck;
      return struck + (entry.restored === true ? ' It was struck again.' : ' It could not be struck again.');
    }
    // Piece 3 (R2): a thread the director brought into an angle's story, or left out of it, which a
    // pass flipped the other way; `options.story` names that story (the meeting's open angle, or
    // another angle by its name).
    if ((entry.flip === 'in' || entry.flip === 'out') && entry.angleTakenOut === true) {
      // The final review: the pass took out the angle the flip was on, and the flip went with it;
      // the place names that angle's story.
      var choice = 'your choice to ' + (entry.flip === 'in' ? 'bring this thread into it' : 'leave this thread out of it');
      var tookOut = label + ': ' + by + ' took out that angle';
      if (!held) return tookOut + ', and ' + choice + ' went with it. ' + why;
      return tookOut + ', with ' + choice + '.' + (entry.restored === true ? ' Both were put back.' : ' It could not be put back.');
    }
    if (entry.flip === 'in' || entry.flip === 'out') {
      var story = typeof o.story === 'function' ? o.story(entry) : 'the story';
      var flipped = label + ': ' + by + (entry.flip === 'in'
        ? ' left it out of ' + story + ', which you brought it into.'
        : ' put it in ' + story + ', which you left it out of.');
      if (!held) return flipped + ' ' + why;
      if (entry.restored === true) return flipped + (entry.flip === 'in' ? ' It was put back in.' : ' It was left out again.');
      return flipped + (entry.flip === 'in' ? ' It could not be put back in.' : ' It could not be left out again.');
    }
    if (entry.cut === true && asString(entry.tokenId)) {
      var putBack = label + ': ' + by + ' put back the ' + thing + ' you deleted.';
      if (!held) return putBack + ' ' + why;
      return putBack + (entry.restored === true ? ' It was taken out again.' : ' It could not be taken out again.');
    }
    if (entry.cut === true) return label + ': the text you cut came back' + cameBackAs + ' (' + by + '). ' + (held ? stillInLine(o.stillIn) : why);
    if (entry.removed === true) return label + ': a sentence you removed came back' + cameBackAs + ' (' + by + '). ' + (held ? stillInLine(o.stillIn) : why);
    if (entry.moved === true && entry.fromOrder === true) {
      var outOfOrder = label + ': ' + by + (became !== null
        ? ' moved this ' + thing + ' from the order you set into ' + became + '.'
        : ' removed this ' + thing + ' from the order you set.');
      return outOfOrder + ' ' + (held ? WRITERS_MOVE_LEFT : why);
    }
    if (entry.moved === true) {
      var moved = became !== null ? 'moved the ' + thing + ' you placed here to ' + became : 'removed the ' + thing + ' you placed here';
      if (!held) return label + ': ' + by + ' ' + moved + '. ' + why;
      if (entry.restored === true) return label + ': ' + by + ' ' + moved + '. ' + (entry.inOrder === false ? PUT_BACK_OUT_OF_ORDER : 'It was put back.');
      return label + ': ' + by + ' ' + moved + '. ' + (became !== null ? 'It could not be put back.' : MOVED_BLOCK_LEFT_OUT);
    }
    // Brief 4.10c: an edit on a photo the article cannot print (`unprintable`, task 4.5e), such as a
    // caption the director wrote under it. The pass's output holds no photo of that name, and code
    // never puts back such a photo a pass took out of print, so an automatic pass that fixed it keeps
    // its fix. The line says so and claims nothing more: a pass that renamed the photo may have kept
    // the caption's words. Task 4.5g: an element the director put in whole went back without that
    // photo (`restored` beside it), so the line says what is gone, and that the rest stands.
    if (entry.unprintable === true) {
      if (entry.restored === true) return label + ': ' + by + ' took out a photo you placed here, which the article cannot print. ' + PUT_BACK_WITHOUT_PHOTO;
      return label + ': ' + by + ' took out the photo, which the article cannot print, so your "' + director + '" was not put back.';
    }
    if (held && entry.restored === true && maybeCopyTexts(entry).length > 0) {
      return label + ': ' + by + (became !== null ? ' changed your "' + director + '" to "' + became + '"' : ' took out your "' + director + '"') +
        '. Your text was put back. ' + maybeCopyLine(maybeCopyTexts(entry).map(function (text) { return valueText(text); }));
    }
    if (held && entry.restored === true) {
      return label + ': ' + by + (became !== null ? ' changed your "' + director + '" to "' + became + '"' : ' removed your "' + director + '"') + '. Your text was put back.';
    }
    var what = became !== null ? 'your "' + director + '" became "' + became + '"' : 'your "' + director + '" is gone';
    if (held) return label + ': ' + what + ' (' + by + ', which should have kept your edit). No reason given.';
    return label + ': ' + what + ' (' + by + '). ' + why;
  }

  /**
   * The entries of a hand-edit report a stop shows (the integrator's ruling 8 on 4.9's
   * minors): each change a send-back's rework made, which comes with its reason, and each
   * change any other pass made that code did not put back: a cut or a removed sentence that
   * came back, a moved element a pass removed, a struck beat that could not be struck again. A
   * block code put back in its section out of the director's order (`inOrder` false,
   * task 4.3c) is shown too (brief 4.10b): its line asks the director to move it again. So is
   * an element the director put in whole that code put back without a photo the article cannot
   * print, which a pass took out of print (`unprintable` beside `restored`, task 4.5g): its line
   * asks the director for a photo the article can print. So is a block the director wrote that
   * code put back where it could not tell which block was the pass's version of it (`maybeCopies`
   * beside `restored`, task 4.14c): its line asks the director whether their text prints twice.
   * Any other entry code put back asks nothing of the director, so no stop shows it beside the
   * edit; at the desk it stays in the folded record of the round (RevisionDiff, steeringView).
   * One rule for the story meeting (meetingView), the map (mapView) and the desk (deskMarks).
   *
   * @param {*} report - a stop's handEditReport
   * @returns {Object[]} the entries, in the report's order
   */
  function changedEditsToShow(report) {
    var read = editReportOf(report);
    if (!read) return [];
    return read.changed.filter(function (entry) {
      return entry.pass === SEND_BACK_PASS || entry.restored !== true || entry.inOrder === false || entry.unprintable === true ||
        maybeCopyTexts(entry).length > 0;
    });
  }

  /**
   * The line a stop shows when it checked the director's edits and shows no changed line
   * (brief 4.10b): the edits stand, whether the round's passes kept them or code put them back.
   * '' when the stop shows a changed line (changedEditsToShow), or checked no edit. One line for
   * the map (mapView), the story meeting (meetingView) and the desk's folded record of the round
   * (steeringView, which RevisionDiff prints; brief 4.10c). The map counts no records (fix H4): one
   * action there can make two edits (a card dropped mid-column is a move edit and an order edit; a
   * photo put beside a move in another column is a move and a beside), so it passes
   * `counted: false` and says only that the edits stand.
   *
   * @param {*} report - a stop's handEditReport
   * @param {Object} [options]
   * @param {boolean} [options.counted] - false: more than one edit reads "Your edits stand."
   * @returns {string}
   */
  function editsStandLine(report, options) {
    var read = editReportOf(report);
    if (!read || changedEditsToShow(read).length > 0) return '';
    var n = read.checked.length;
    if (n === 1) return 'Your edit stands.';
    if (options && options.counted === false) return 'Your edits stand.';
    return (n === 2 ? 'Both' : 'All ' + n) + ' of your edits stand.';
  }

  /** How the standing notes name a note's kind (directorGateNotes' `kind`). */
  var NOTE_KIND_WORDS = { approval: 'approval note', rejection: 'rework note' };

  /**
   * The standing notes as every stop lists them (steeringView at the map and the desk,
   * meetingStandingNotes at the story meeting; task 4.8, fix round 1): each note with text,
   * in order, under its stop's label, its kind and its round. A note with no kind is a
   * rejection, as the channel has always read it.
   *
   * @param {Array} gateNotes - data.directorGateNotes
   * @param {Object} [labels] - stop type -> label (the console's CHECKPOINT_LABELS); a stop
   *   it does not name reads as its type
   * @returns {Array<{key: string, label: string, text: string}>}
   */
  function standingNoteItems(gateNotes, labels) {
    var names = isPlainObject(labels) ? labels : {};
    return asArray(gateNotes)
      .filter(function (n) { return isPlainObject(n) && typeof n.text === 'string' && n.text.trim(); })
      .map(function (n, i) {
        var kind = asString(n.kind) || 'rejection';
        var stop = hasOwn(names, n.gate) ? names[n.gate] : asString(n.gate);
        var kindWord = hasOwn(NOTE_KIND_WORDS, kind) ? NOTE_KIND_WORDS[kind] : kind + ' note';
        return { key: 'note-' + i, label: stop + ', ' + kindWord + ' ' + (n.round || 1), text: n.text.trim() };
      });
  }

  /**
   * The standing notes folded under a stop's note box, at the story meeting and on the map:
   * standingNoteItems' list, under the console's stop labels (CHECKPOINT_LABELS, passed in).
   *
   * @param {Array} gateNotes - data.directorGateNotes
   * @param {Object} labels - stop type -> label
   * @returns {{any: boolean, title: string, items: Array<{key: string, label: string, text: string}>}}
   */
  function standingNotesView(gateNotes, labels) {
    var items = standingNoteItems(gateNotes, labels);
    return { any: items.length > 0, title: 'Standing notes (' + items.length + ')', items: items };
  }

  /**
   * The hand-edit report and the standing notes as RevisionDiff renders them.
   *
   * F1: `changedEdits` holds one line per edit a pass changed this round
   * (changedEditLine), `automatic` marking a change an automatic pass made and
   * `restored` one code put back (FA), each read from the entry's own flags.
   * `kept` is the line RevisionDiff prints when no stop shows a line beside the director's
   * edits: that they stand, in the words the map and the meeting print (editsStandLine;
   * brief 4.10c), which the desk's page in the stops log prints too (task 4.12c). `notes`
   * are standingNoteItems', under `labels`, the console's stop labels. Task 4.10: this is the
   * whole record of the round, which the desk folds below the article; beside an edit a stop
   * shows only changedEditsToShow's entries.
   */
  function steeringView(handEditReport, gateNotes, labels) {
    var report = editReportOf(handEditReport);
    var changed = report ? report.changed : [];
    var notes = standingNoteItems(gateNotes, labels);
    return {
      any: !!report || notes.length > 0,
      changedEdits: changed.map(function (entry, index) {
        return { key: entry.id + '-' + index, id: entry.id, automatic: entry.automatic === true, restored: entry.restored === true, line: changedEditLine(entry) };
      }),
      kept: editsStandLine(report),
      notes: notes
    };
  }

  // ── roundsBanner (phase 1, brief 1.4) ─────────────────────────────────────
  // One counter used to serve both the machine and the director, so RevisionDiff
  // read "Revision 2 of 3" off the automated budget, called the director's second
  // send back the last one, and printed "Maximum revisions reached — this is the
  // final version." The director's rounds are not capped; only the machine's own
  // reworks inside a round are, and those start over at every send back.

  /**
   * @param {number} humanRevisionCount - rounds the director has already taken
   * @param {number} revisionCount - automated passes spent in the current round
   * @param {number} maxRevisions - the automated budget for a round
   * @returns {object} {show, roundLabel, automatedLabel, remainingLabel, remainingColor}
   */
  function roundsBanner(humanRevisionCount, revisionCount, maxRevisions) {
    var rounds = Number(humanRevisionCount) || 0;
    var used = Number(revisionCount) || 0;
    var budget = Number(maxRevisions) || 0;
    // A budget of 0 means the stop reported none, not that the machine is out of
    // passes: say nothing rather than guess.
    var remaining = Math.max(0, budget - used);
    return {
      show: budget > 0,
      roundLabel: 'Round ' + (rounds + 1),
      automatedLabel: 'Automated passes this round: ' + used + ' of ' + budget,
      remainingLabel: remaining + ' automated pass' + (remaining === 1 ? '' : 'es') + ' left',
      remainingColor: remaining > 1 ? 'var(--accent-green)'
        : remaining === 1 ? 'var(--accent-amber)'
          : 'var(--accent-red)'
    };
  }

  // ── review payloads (phase 1, brief 1.1) ──────────────────────────────────
  // One note box at the article stop, sent with whatever the director presses (the map's
  // payloads are mapPayload's, task 4.9). Before this the only place to write was behind
  // the Reject button, so a note the director had ready at an approve had nowhere to go
  // but a paid rework: last session a structural note existed at 20:35 and reached the
  // writer 52 minutes later. The key assembly lives here because those keys are the whole
  // contract with the server's buildResumePayload, and the components have no test harness.
  //
  // On a send back the note IS the feedback and is never also sent on the note key:
  // the server's reject arm already records it as a standing note of kind 'rejection',
  // so a second key would append the same sentence twice.

  /**
   * The desk's two actions, the ones reviewPayload builds (task 4.14g): the one list, read by
   * reviewPayload's guard, by console/unsaved-input-logic.js's held line and by the harness
   * (scripts/lib/stop-payloads.js STOP_ACTIONS), as the meeting's and the map's are read from
   * MEETING_ACTIONS and MAP_ACTIONS. The server keeps no copy: its article arm reads
   * `article: true | false`.
   */
  var DESK_ACTIONS = ['approve', 'send-back'];

  /**
   * Both failure modes here are silent by nature, so both are closed (review fix
   * round 1): an unrecognised action used to fall through to the approve branch, so
   * a typo shipped the outline; a send back with a blank note used to build a
   * payload whose feedback is '' and which no server arm accepts. The components
   * disable the button and return early on a blank note, so null is never sent.
   *
   * @param {object} keys - the four payload keys for the stop
   * @param {object|null} edits - the director's edited object, or null
   * @param {string} note - what the director wrote in the stop's note box
   * @param {string} action - one of DESK_ACTIONS
   * @returns {object|null} the payload, or null for a send back with no note
   */
  function reviewPayload(keys, edits, note, action) {
    if (DESK_ACTIONS.indexOf(action) === -1) {
      throw new Error('reviewPayload: action must be ' + DESK_ACTIONS.map(function (a) { return "'" + a + "'"; }).join(' or ') +
        ', got ' + String(action));
    }
    var text = typeof note === 'string' ? note.trim() : '';
    if (action === 'send-back' && !text) return null;
    var payload = {};
    if (action === 'send-back') {
      payload[keys.decision] = false;
      payload[keys.feedback] = text;
    } else {
      payload[keys.decision] = true;
      if (text) payload[keys.note] = text;
    }
    if (edits && typeof edits === 'object') payload[keys.edits] = edits;
    return payload;
  }

  var ARTICLE_REVIEW_KEYS = { decision: 'article', feedback: 'articleFeedback', note: 'articleNote', edits: 'articleEdits' };

  function articleReviewPayload(edits, note, action) {
    return reviewPayload(ARTICLE_REVIEW_KEYS, edits, note, action);
  }

  /**
   * The Send back button at every stop takes TWO clicks (review
   * fix round 1). One box now serves both actions, so Send back sits beside a note
   * the director also fills in for approvals, and one mis-click costs a round and,
   * at the article stop, about nine minutes of Opus. The old two-step reject panel's
   * second click was the only brake there was; this is that brake.
   *
   * The arming FLAG is React state in the component. What it means on screen is
   * decided here. Arming is meaningless without a note, so a blank note reads as
   * disarmed however the flag stands.
   *
   * @param {boolean} armed - has the director already clicked Send back once
   * @param {string} note - the stop's note box
   * @param {string} noun - what is sent back ('weave', 'map' or 'article'), for the aria-label
   */
  function sendBackButton(armed, note, noun) {
    var ready = typeof note === 'string' && !!note.trim();
    var isArmed = !!armed && ready;
    return {
      armed: isArmed,
      disabled: !ready,
      label: isArmed ? 'Confirm send back, starts a rework' : 'Send back',
      ariaLabel: isArmed
        ? 'Confirm send back of the ' + noun + ', which starts a rework'
        : 'Send the ' + noun + ' back for a rework, with the note'
    };
  }

  // ── Where a stop's note waits (phase 1, brief 1.1) ────────────────────────

  /**
   * Where a stop's note lives in `pendingEdits`, beside that stop's edits, so a
   * remount while the rework runs restores both. A SIBLING key, never the edits slot
   * itself: app.js hands `pendingEdits[checkpointType]` to the component as the
   * edited object, and a note stored there would come back as one.
   */
  function noteSlotKey(checkpoint) {
    return checkpoint + ':note';
  }

  // ── The director's words (phase 2, brief 2.2) ─────────────────────────────

  /** How the input review names a verdict kind (lib/accusation-verdict.js VERDICT_KINDS). */
  var VERDICT_KIND_LABELS = {
    culprit: 'the room named a culprit',
    accident: 'an accident',
    overdose: 'an overdose',
    'self-harm': 'self-harm',
    other: 'a verdict that names no one'
  };

  /** How the input review names a culprit verdict that blames no character (phase 3, brief 3.5). */
  var BLAMES_NO_CHARACTER_LABEL = 'the room blamed an institution or an unnamed person';

  /**
   * The verdict kind the parse returned, for the input review.
   *
   * A verdict with no culprit leaves `accused` empty on purpose, and the screen
   * used to read an empty `accused` as "not parsed" and show it in red. `noCulprit`
   * is what lets it say what the room decided instead. Phase 3 (brief 3.5): so does
   * `blamesNoCharacter`, for a culprit verdict that blames an institution or an
   * unnamed person (lib/accusation-verdict.js blamesNoCharacter), whose charge holds
   * the room's words for who. A culprit verdict with neither an accused nor a charge
   * is a failed parse, and keeps the red "not parsed" line.
   *
   * @param {object|null} accusation - sessionConfig.accusation
   * @returns {{verdictKind: string, noCulprit: boolean, blamesNoCharacter: boolean, label: string}}
   */
  function verdictView(accusation) {
    var a = accusation || {};
    var kind = asString(a.verdictKind);
    var known = Object.prototype.hasOwnProperty.call(VERDICT_KIND_LABELS, kind);
    var parsed = accusationView(a);
    var namesNoOne = kind === 'culprit' && parsed.accused === '' && parsed.charge.trim() !== '';
    return {
      verdictKind: known ? kind : '',
      noCulprit: known && kind !== 'culprit',
      blamesNoCharacter: namesNoOne,
      label: namesNoOne ? BLAMES_NO_CHARACTER_LABEL : (known ? VERDICT_KIND_LABELS[kind] : '')
    };
  }

  /**
   * The split final vote, for the input review (phase 3, brief 3.5): every option
   * with its count, the one the group statement adopted marked, or a note that it
   * adopted none. `split` is false when the parse recorded no split vote.
   *
   * @param {object|null} accusation - sessionConfig.accusation
   * @returns {{split: boolean, line: string}}
   */
  function votesView(accusation) {
    var votes = asArray((accusation || {}).votes).filter(function (v) {
      return v && asString(v.option).trim() && typeof v.count === 'number';
    });
    if (votes.length < 2) return { split: false, line: '' };
    var anyAdopted = votes.some(function (v) { return v.adopted === true; });
    var line = votes.map(function (v) {
      return asString(v.option).trim() + ' ' + v.count + (v.adopted === true ? ' (adopted by the group statement)' : '');
    }).join(', ');
    return { split: true, line: anyAdopted ? line : line + ' (the group statement adopted none of these)' };
  }

  /**
   * Each exposed memory's exposer, exposure time and owner, as the parse kept them
   * from the session report's Detective Evidence Log (sessionConfig.exposures).
   *
   * Since phase 3 (brief 3.5) the writers see each one's time and the name on its
   * turn-in on the morning timeline, for memories the bundle holds as exposed; the
   * owner column is shown here only.
   *
   * Two alarms (phase 3, brief 3.5), from two lists the parse keeps apart:
   * - `noneExposed`: the parse's list of exposed memory ids (exposedTokens, counted as
   *   sessionConfig.exposedTokenCount) is empty. Disposition reads that list alone,
   *   so every memory then counts as buried, whatever the per-row log holds.
   * - `logEmpty`: the per-row log is empty while memories were exposed (or the count
   *   predates the field): no exposure times or turn-in names reach the writers.
   * A thread whose parse predates either list has nothing to judge.
   *
   * @param {Array|null} exposures - sessionConfig.exposures
   * @param {number|undefined} exposedTokenCount - sessionConfig.exposedTokenCount
   * @returns {{rows: Array<{tokenId: string, exposer: string, time: string, owner: string}>, count: number, noneExposed: boolean, logEmpty: boolean}}
   */
  function exposuresView(exposures, exposedTokenCount) {
    var rows = asArray(exposures)
      .filter(function (e) { return e && typeof e === 'object' && asString(e.tokenId).trim(); })
      .map(function (e) {
        return {
          tokenId: asString(e.tokenId).trim(),
          exposer: asString(e.exposer).trim(),
          time: asString(e.time).trim(),
          owner: asString(e.owner).trim()
        };
      });
    var noneExposed = exposedTokenCount === 0;
    return {
      rows: rows,
      count: rows.length,
      noneExposed: noneExposed,
      logEmpty: !noneExposed && Array.isArray(exposures) && rows.length === 0
    };
  }

  /** The basename of a path, for the photo join. */
  function baseName(value) {
    return asString(value).split('/').pop().split('\\').pop();
  }

  /**
   * One card per photo analysis at the character-IDs stop, paired with its photo
   * BY FILENAME.
   *
   * The screen paired `photoAnalyses[i]` with `sessionPhotos[i]`, and the analyses
   * are produced eight at a time, so nothing held the two lists in the same order:
   * a card could show one photo's thumbnail over another photo's analysis, and the
   * director's description went out under the wrong filename. The analysis carries
   * its own filename; the thumbnail is the session photo with that basename
   * (case-insensitive, as the server's joins do).
   *
   * Brief 4.2: `leftOut` says whether the server lists the photo as left out (the
   * payload's `leftOutPhotos`), matched the same way; the leave-out box starts from it.
   *
   * @param {Array} photoAnalyses - data.photoAnalyses.analyses
   * @param {Array} sessionPhotos - data.sessionPhotos (paths)
   * @param {Array} [leftOutPhotos] - data.leftOutPhotos (filenames)
   * @returns {Array<{key: string, filename: string, displayName: string, path: string, analysis: object, leftOut: boolean}>}
   */
  function characterIdCards(photoAnalyses, sessionPhotos, leftOutPhotos) {
    var photos = asArray(sessionPhotos).filter(function (p) { return typeof p === 'string' && p; });
    var listed = {};
    asArray(leftOutPhotos).forEach(function (name) {
      var key = baseName(name).toLowerCase();
      if (key) listed[key] = true;
    });
    return asArray(photoAnalyses).map(function (analysis, i) {
      var a = analysis && typeof analysis === 'object' ? analysis : {};
      var filename = baseName(a.filename);
      var wanted = filename.toLowerCase();
      var path = '';
      if (wanted) {
        for (var j = 0; j < photos.length; j += 1) {
          if (baseName(photos[j]).toLowerCase() === wanted) { path = photos[j]; break; }
        }
      }
      var displayName = filename || baseName(path) || 'Photo ' + (i + 1);
      return {
        key: filename || 'photo-' + i,
        filename: filename,
        displayName: displayName,
        path: path,
        analysis: a,
        leftOut: Boolean(wanted && listed[wanted])
      };
    });
  }

  /**
   * The leave-out boxes when the character-IDs stop (re)mounts (brief 4.2), by card key:
   * the director's unsent ticks, kept in the stop's pendingEdits slot as `leftOut`, win
   * over the photos the server already lists (each card's `leftOut`), so a tick survives
   * a remount.
   *
   * @param {Array} cards - characterIdCards(...)
   * @param {Object|undefined} pending - the stop's pendingEdits slot
   * @returns {Object<string, boolean>}
   */
  function characterIdLeaveOutTicks(cards, pending) {
    var draft = pending && typeof pending === 'object' && pending.leftOut && typeof pending.leftOut === 'object'
      ? pending.leftOut
      : null;
    var ticks = {};
    asArray(cards).forEach(function (card) {
      ticks[card.key] = draft && Object.prototype.hasOwnProperty.call(draft, card.key)
        ? draft[card.key] === true
        : card.leftOut === true;
    });
    return ticks;
  }

  /** The filenames whose leave-out box is ticked, in card order. A card with no filename has none. */
  function leftOutFilenames(cards, ticks) {
    var ticked = ticks && typeof ticks === 'object' ? ticks : {};
    return asArray(cards)
      .filter(function (card) { return card.filename && ticked[card.key] === true; })
      .map(function (card) { return card.filename; });
  }

  /**
   * The character-IDs approval: the raw text the Sonnet parser reads, as before,
   * plus each description as its own field keyed by filename.
   *
   * `characterIdsRaw` keeps its shape (one block per photo: filename, the machine's
   * description, its character descriptions, the director's input). The director's
   * text is also sent word for word (trimmed at the ends) in `photoDescriptions`,
   * so the writers read it as typed and not as the parser rewrote it. A photo the
   * director left blank has no entry; `photoDescriptions` is omitted when every box
   * is blank.
   *
   * Brief 4.2: `leftOutPhotos` is the filenames whose leave-out box is ticked, sent
   * every time (an empty list when every box is clear): for every photo the stop
   * showed, the box decides.
   *
   * @param {Array} cards - characterIdCards(...)
   * @param {Object} descriptions - card key -> the director's text
   * @param {Object} [ticks] - card key -> ticked (characterIdLeaveOutTicks)
   * @returns {{characterIdsRaw: string, photoDescriptions?: Object, leftOutPhotos: string[]}}
   */
  function characterIdsPayload(cards, descriptions, ticks) {
    var typed = descriptions && typeof descriptions === 'object' ? descriptions : {};
    var blocks = [];
    var byFilename = {};
    asArray(cards).forEach(function (card) {
      var photo = card.analysis || {};
      var userText = asString(typed[card.key]).trim();
      var aiVisual = asString(photo.visualContent).trim();
      var charDescs = asArray(photo.characterDescriptions)
        .map(function (d) {
          return '[' + ((d && d.description) || 'unknown') + ', role: ' + ((d && d.role) || 'UNKNOWN') + ']';
        })
        .join(', ');

      var lines = ['Photo ' + card.displayName + ':'];
      if (aiVisual) lines.push('  AI Description: ' + aiVisual);
      if (charDescs) lines.push('  Character Descriptions: ' + charDescs);
      if (userText) lines.push('  User Input: ' + userText);
      blocks.push(lines.join('\n'));
      if (userText && card.filename) byFilename[card.filename] = userText;
    });
    var payload = { characterIdsRaw: blocks.join('\n') };
    if (Object.keys(byFilename).length > 0) payload.photoDescriptions = byFilename;
    payload.leftOutPhotos = leftOutFilenames(cards, ticks);
    return payload;
  }

  /**
   * The character-IDs stop's Skip (brief 4.2): no identifications, and the photos whose
   * leave-out box is ticked still left out.
   *
   * @param {Array} cards - characterIdCards(...)
   * @param {Object} ticks - card key -> ticked
   * @returns {{characterIds: Object, leftOutPhotos: string[]}}
   */
  function characterIdsSkipPayload(cards, ticks) {
    return { characterIds: {}, leftOutPhotos: leftOutFilenames(cards, ticks) };
  }

  // ── The trace (phase 2, brief 2.7) ────────────────────────────────────────
  // What the automatic reworks did before the director arrived at the outline or
  // article stop. Nothing from before an automatic pass used to reach a stop: the
  // version it started from was cleared by the reworker, and the evaluation's reasons
  // were overwritten by the next evaluation. The server now sends each pass of the
  // current round under `trace` (server.js#traceForStop): its number, trigger,
  // findings, time, and the scopes it changed (`changedScopes`, from the diff of the
  // version it started from against the one it produced). Read-only.

  var TRACE_TRIGGER_LABELS = {
    check: 'Why it ran: the check failed.',
    evaluation: 'Why it ran: the evaluation failed.'
  };

  /** HH:MM in the viewer's own clock, or '' for a missing or unreadable time. */
  function traceTime(at) {
    var ms = typeof at === 'string' ? Date.parse(at) : NaN;
    if (Number.isNaN(ms)) return '';
    var d = new Date(ms);
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function traceFindingList(label, items) {
    return { label: label + ' (' + items.length + ')', items: items };
  }

  /**
   * What the pass changed, by scope. `changedScopes` is null when the server could
   * not diff (a rework that errored leaves no version), and [] when the rework
   * returned the text it was given: both are said in words rather than left blank.
   */
  function traceChanged(changedScopes) {
    if (!Array.isArray(changedScopes)) {
      return { labels: [], text: 'What changed: not recorded, because one of the two versions is missing.' };
    }
    var labels = changedScopes
      .filter(function (key) { return typeof key === 'string' && key.length > 0; })
      .map(scopeLabel);
    if (labels.length === 0) {
      return { labels: [], text: 'What changed: nothing. The rework returned the same text.' };
    }
    return { labels: labels, text: 'What changed: ' + labels.join(', ') };
  }

  /**
   * How the trace labels a judge's revisionGuidance, by whether the automatic rework was
   * given it (final review, reworks[0]). Since phase 3 (3.10) a journalist automatic pass
   * carries no EVALUATOR FEEDBACK (node-helpers.js buildRevisionContext): the rework gets
   * the must-fix items alone, so the guidance is the evaluation's, never sent. The
   * detective's passes still print it to the rework (D13).
   */
  var TRACE_GUIDANCE_LABELS = {
    journalist: 'The evaluation\'s guidance, not sent to the rework: ',
    detective: 'Guidance to the writer: '
  };

  /**
   * The trace panel's model for one stop.
   *
   * Task 4.10 (spec 6.3 and section 10): the judges' scores go at every stop, so a pass shows
   * what it had to fix, what it was told to consider, the evaluation's guidance and what it
   * changed, and none of the scores its findings recorded (`criteriaScores`). Brief 4.10e: each
   * must-fix line reads past its leading rule ids, as the desk's marks do (judgeMarkText), since
   * the director reads the line, not the rule.
   *
   * @param {Array|null} trace - data.trace at the map or the article stop
   * @param {string} [theme='journalist'] - the session's theme, which decides whether a
   *   pass's rework was given the evaluation's guidance (TRACE_GUIDANCE_LABELS)
   * @returns {{any: boolean, title: string, passes: Array<{key: string, heading: string,
   *            triggerLabel: string, mustFix: {label: string, items: string[]},
   *            shouldConsider: {label: string, items: string[]}, noFindings: boolean,
   *            changed: {labels: string[], text: string}, guidance: string}>}}
   */
  function traceView(trace, theme) {
    var guidanceLabel = TRACE_GUIDANCE_LABELS[theme === 'detective' ? 'detective' : 'journalist'];
    var passes = asArray(trace)
      .filter(function (p) { return p && typeof p === 'object'; })
      .map(function (p, index) {
        var findings = p.findings && typeof p.findings === 'object' ? p.findings : {};
        var number = typeof p.pass === 'number' && p.pass > 0 ? p.pass : index + 1;
        var time = traceTime(p.at);
        var mustFix = stringList(findings.structuralIssues).map(judgeMarkText);
        var shouldConsider = stringList(findings.advisoryWarnings);
        var guidance = asString(findings.revisionGuidance).trim();
        return {
          key: 'pass-' + number + '-' + index,
          heading: 'Automatic pass ' + number + (time ? ', at ' + time : ''),
          triggerLabel: TRACE_TRIGGER_LABELS[p.trigger] || 'Why it ran: not recorded.',
          mustFix: traceFindingList('Must fix', mustFix),
          shouldConsider: traceFindingList('Should consider', shouldConsider),
          noFindings: mustFix.length === 0 && shouldConsider.length === 0 && !guidance,
          changed: traceChanged(p.changedScopes),
          guidance: guidance ? guidanceLabel + guidance : ''
        };
      });
    var n = passes.length;
    return {
      any: n > 0,
      title: 'Trace: ' + n + ' automatic rework' + (n === 1 ? '' : 's') + ' ran this round before you arrived',
      passes: passes
    };
  }

  // ── The writer's questions (phase 3, brief 3.7) ────────────────────────────

  /**
   * Each kind a question can have and the word the story meeting shows for it (fix 3.7b).
   * Phase 4 (brief 4.4): the weave's three, lib/writer-questions.js WEAVE_QUESTION_KINDS,
   * since the story meeting asks the questions (a test holds the keys equal to that list).
   * A question of another kind renders with no kind shown.
   */
  var WRITER_QUESTION_KIND_LABELS = { player: 'Player', pronoun: 'Pronoun', figure: 'Figure' };

  // ── The story meeting (phase 4, task 4.8; spec 4.3 and 4.4) ────────────────
  //
  // The arc stop is the story meeting: a memo of two or three pitched angles over one shared set
  // of threads, at most 450 words with any angle open (phase 4b, piece 3, brief 3B; spec
  // 2026-10-06 sections 5 and 6), that the director reads and settles in minutes. ArcSelection.js
  // renders it from meetingView and changes the weave only through the operations below; it sends
  // only meetingPayload's payloads, 4.5's `{meeting: 'approve' | 'reweave' | 'send-back', weave,
  // note}` (lib/meeting.js meetingResume), the weave with the director's pick on it, each held
  // first to meetingWeaveProblems, the gate's decisions. What the director types is sent as typed.
  // The evidence under each line is the writers', so the page folds it, and no change of the
  // director's touches it (R6).

  /** The meeting's stop type: the stop types keep their names (R3). */
  var MEETING_STOP = 'arc-selection';

  /** The meeting's three actions. A copy of lib/meeting.js MEETING_ACTIONS; a test holds the two equal. */
  var MEETING_ACTIONS = ['approve', 'reweave', 'send-back'];

  /**
   * An angle's printed fields, in the order the pitch prints them: a copy of lib/weave.js
   * ANGLE_FIELDS, which the browser cannot import (a test holds the two equal). The director
   * rewrites any of them in place on the open angle (setAngleField).
   */
  var ANGLE_FIELDS = ['headline', 'gist', 'story', 'question', 'lands', 'ends'];

  /** The fields of a thread the director rewrites in place (setThreadField): its name and its line. */
  var THREAD_TEXT_FIELDS = ['name', 'line'];

  /**
   * What two threads share at a connection: a copy of lib/weave.js CONNECTION_KINDS (a test
   * holds the two equal). The kind stays underneath, unprinted (R1): the gate's shape reads it.
   */
  var CONNECTION_KINDS = ['person', 'moment', 'document', 'line'];

  /**
   * A copy of lib/writer-questions.js WEAVE_ANSWER_KEY, which the browser cannot import; a test
   * holds the two equal.
   */
  var WEAVE_ANSWER_KEY = 'answer';

  /** The key a line carries its evidence under: a copy of lib/hand-edit-diff.js EVIDENCE_KEY (a test holds the two equal). */
  var EVIDENCE_KEY = 'evidence';

  /**
   * The sources a piece of evidence may name besides a document, each with the words the fold
   * names it by (phase 4b, brief 1B). The keys are lib/evidence.js EVIDENCE_SOURCES' values,
   * which the browser cannot import (a test holds them equal).
   */
  var EVIDENCE_SOURCE_LABELS = { ledger: 'The ledger', 'evidence-log': 'The evidence log', notes: 'Your notes' };

  /** Whether a piece supports its line or cuts against it: a copy of lib/evidence.js EVIDENCE_STANCES (a test holds the two equal). */
  var EVIDENCE_STANCES = ['supports', 'cuts-against'];

  /** The stance the fold names, where a piece takes it. */
  var CUTS_AGAINST = 'cuts-against';

  /**
   * The weave's text fields, read one place each as lib/hand-edit-diff.js weaveEditsBetween
   * reads them: a copy of its WEAVE_FIELDS, which the browser cannot import; a test holds
   * the two equal (task 4.5c).
   */
  var WEAVE_TEXT_FIELDS = ['fromYourNotes'];

  /**
   * One piece of evidence, as the gate's director-side schema holds it (lib/evidence.js
   * EVIDENCE_PIECE_SCHEMA, which both the weave's and the map's schemas embed).
   */
  var EVIDENCE_PIECE_SHAPE = { list: {
    required: ['sources', 'shows', 'stance'],
    fields: { sources: 'nonEmptyStrings', shows: 'string', stance: EVIDENCE_STANCES, card: 'boolean' }
  } };

  /**
   * The key the weave carries the director's pick under, the id of the angle they sent on: a
   * copy of lib/weave.js PICKED_KEY, which the browser cannot import (a test holds the two
   * equal; phase 4b, piece 3, R1).
   */
  var PICKED_KEY = 'picked';

  /**
   * The weave as the director leaves it, as the gate's director-side schema holds it
   * (lib/meeting.js DIRECTOR_WEAVE_SCHEMA, which the browser cannot import): each
   * property's type ('string', 'boolean', 'strings' for a list of text, 'nonEmptyStrings'
   * for one that holds at least one, an enum's values, or a list's or an object's own
   * shape) and the names required. An angle is its id, its pitch and the ids of its threads,
   * and the director's pick names one (phase 4b, piece 3). A thread the director adds is its
   * id, name and line; the evidence, the writers', is held to its shape wherever a line
   * carries it (phase 4b, brief 1B). A test builds this shape from DIRECTOR_WEAVE_SCHEMA and
   * holds the two equal.
   */
  var DIRECTOR_WEAVE_SHAPE = {
    required: ['angles', 'threads', 'connections', 'questions'],
    fields: {
      angles: { list: {
        required: ['id', 'headline', 'gist', 'story', 'question', 'lands', 'ends', 'threads'],
        fields: { id: 'string', headline: 'string', gist: 'string', story: 'string', question: 'string', lands: 'string', ends: 'string', threads: 'strings' }
      } },
      fromYourNotes: 'string',
      threads: { list: {
        required: ['id', 'name', 'line'],
        fields: { id: 'string', name: 'string', line: 'string', verdict: 'boolean', evidence: EVIDENCE_PIECE_SHAPE }
      } },
      connections: { list: {
        required: ['id', 'joins', 'line', 'kind'],
        fields: { id: 'string', joins: 'strings', line: 'string', kind: CONNECTION_KINDS, evidence: EVIDENCE_PIECE_SHAPE }
      } },
      questions: { list: {
        required: ['id', 'kind', 'about', 'question', 'changes'],
        fields: { id: 'string', kind: Object.keys(WRITER_QUESTION_KIND_LABELS), about: 'string', question: 'string', changes: 'string', thread: 'string', answer: 'string' }
      } },
      picked: 'string'
    }
  };

  /**
   * The line in place of "from your notes" when the weave has none (the director, 2026-10-03, on
   * thin notes; spec 2026-10-06 section 5): the notes end without the director's read, so every
   * angle is the writer's.
   */
  var THIN_NOTES_LINE = "Your notes end without your read of the session, so every angle is the writer's.";

  /** What the open angle's card says in place of its headline, which its pitch prints below (spec 5). */
  var ANGLE_OPEN_LINE = 'Open below';

  /**
   * The line beside the thread that carries the room's verdict, which stays in every angle (R8;
   * spec 6): the page offers no way to take it out.
   */
  var VERDICT_LOCK_LINE = 'Always in: the article reports the verdict.';

  /** Why the controls of a line under a writer's repeated id are off, while they are. */
  var REPEATED_ID_HINT = 'The writer gave one id to more than one angle, thread or connection, so the meeting cannot pick or change those: a reweave with a note, or a send-back, gives each its own id.';

  /** Why Reweave is not offered, while it is not (the integrator's ruling 5). */
  var REWEAVE_HINT = 'Reweave fits your changes and your note into the angle: change the angle or one of its threads, or write a note first.';

  /** What a rollback costs: the general warning, and going back to the meeting or the map (R9; the map's, task 4.14b). */
  var ROLLBACK_WARNING = 'This will clear all data from this point forward.';
  var MEETING_ROLLBACK_LINE = 'The story meeting reopens as you left it, with no model call; a meeting that holds no weave has one written fresh. The map and the article are cleared, and written again once you approve.';
  var MAP_ROLLBACK_LINE = 'The map reopens as you left it, with no model call. The article is cleared, and written again once you approve.';

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function capitalized(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  /** Whether a value is a weave: an object with a list of threads (lib/weave.js isWeave). */
  function isWeaveValue(value) {
    return isPlainObject(value) && Array.isArray(value.threads);
  }

  /** An object without its code-owned keys, those that open with an underscore (lib/weave.js weaveForPrompt). */
  function withoutCodeOwned(object) {
    var out = {};
    Object.keys(object).forEach(function (key) { if (key.charAt(0) !== '_') out[key] = object[key]; });
    return out;
  }

  /**
   * The weave the meeting edits: a copy of the stop's weave without its code-owned keys
   * (the fact check's mark), or null when the stop holds no weave.
   *
   * @param {*} weave - data.weave
   * @returns {Object|null}
   */
  function meetingWeaveOf(weave) {
    return isWeaveValue(weave) ? cloneJson(withoutCodeOwned(weave)) : null;
  }

  /**
   * console/outline-edit-logic.js, read when it runs: that module loads after this one in the
   * browser, and the reducer, the meeting and the map call it long after both. The meeting and
   * the map key their versions with its computeResetKey, and the map reads its map rules.
   */
  function outlineEditLogic() {
    var editLogic = (typeof window !== 'undefined' && window.Console && window.Console.outlineEditLogic)
      || (typeof require === 'function' ? require('./outline-edit-logic') : null);
    if (!editLogic || typeof editLogic.computeResetKey !== 'function') {
      throw new Error('checkpoint-view-logic: the story meeting and the map read console/outline-edit-logic.js, which is not loaded');
    }
    return editLogic;
  }

  function resetKeyOf(value, round) {
    return outlineEditLogic().computeResetKey(value, round);
  }

  /**
   * The version of what a stop shows, keyed the way computeResetKey keys it: the stop's
   * output as it sent it (the weave, the map), with the director's rounds and the automatic
   * passes. A stop's pending slot holds the director's work under it (task 4.9: one rule for
   * the meeting and the map).
   *
   * @param {*} value - the stop's output
   * @param {Object} data - the stop's payload, for its round counters
   * @returns {string}
   */
  function stopVersion(value, data) {
    var d = isPlainObject(data) ? data : {};
    var round = (Number(d.humanRevisionCount) || 0) * 1000 + (Number(d.revisionCount) || 0);
    return resetKeyOf(value === undefined ? null : value, round);
  }

  /**
   * The weave version the meeting shows (stopVersion).
   *
   * @param {Object} data - the stop's payload
   * @returns {string}
   */
  function meetingVersion(data) {
    var d = isPlainObject(data) ? data : {};
    return stopVersion(d.weave, d);
  }

  /** The meeting's pendingEdits slot: the director's weave, under the version it was made on. */
  function meetingPendingSlot(data, weave) {
    return { version: meetingVersion(data), weave: weave };
  }

  function slotFits(data, pending) {
    return isPlainObject(pending) && pending.version === meetingVersion(data);
  }

  /**
   * The weave the meeting opens on: the director's, from their pending slot, while the
   * stop shows the version they made it on; the stop's weave otherwise.
   *
   * @param {Object} data - the stop's payload
   * @param {*} pending - the meeting's pendingEdits slot
   * @returns {Object|null}
   */
  function meetingDraftOf(data, pending) {
    if (slotFits(data, pending) && isWeaveValue(pending.weave)) return cloneJson(pending.weave);
    return meetingWeaveOf(isPlainObject(data) ? data.weave : null);
  }

  /** The meeting's note box on (re)mount: the director's note, under the same rule as their weave. */
  function meetingNoteOf(data, pending, pendingNote) {
    return slotFits(data, pending) && typeof pendingNote === 'string' ? pendingNote : '';
  }

  /** The version a stop's pending slot is held under, for the stops that keep one: the meeting's and the map's. */
  function pendingSlotVersionOf(checkpointType) {
    if (checkpointType === MEETING_STOP) return meetingVersion;
    if (checkpointType === MAP_STOP) return mapVersion;
    return null;
  }

  /**
   * The pendingEdits a new checkpoint leaves (state.js CHECKPOINT_RECEIVED). Every stop's
   * slot is cleared, as it always was, except the meeting's and the map's (task 4.9): the
   * director's weave or map and note stay while the stop shows the same version, so a
   * remount of that version (a refused send, the attach watchdog's reload) keeps them, and
   * go when a new one arrives.
   *
   * @param {Object} pendingEdits - state.pendingEdits
   * @param {string} checkpointType - the checkpoint that arrived
   * @param {Object} data - its payload
   * @returns {Object}
   */
  function pendingEditsAfterCheckpoint(pendingEdits, checkpointType, data) {
    var kept = {};
    var versionOf = pendingSlotVersionOf(checkpointType);
    if (!versionOf || !isPlainObject(pendingEdits)) return kept;
    var slot = pendingEdits[checkpointType];
    if (!isPlainObject(slot) || slot.version !== versionOf(data)) return kept;
    kept[checkpointType] = slot;
    var noteKey = noteSlotKey(checkpointType);
    if (hasOwn(pendingEdits, noteKey)) kept[noteKey] = pendingEdits[noteKey];
    return kept;
  }

  // The director's changes. Each returns a new weave and leaves the one it was given as it was.

  function editedWeave(weave, operation) {
    if (!isWeaveValue(weave)) throw new Error(operation + ': the meeting changes a weave, an object with a list of threads');
    return cloneJson(weave);
  }

  function elementAt(list, index, operation, what) {
    if (!Array.isArray(list) || !isPlainObject(list[index])) throw new Error(operation + ': the weave holds no ' + what + ' at ' + index);
    return list[index];
  }

  /**
   * The angle open at the meeting (R1): the angle the weave's pick names, else the first, else
   * null for a weave with no angle. A copy of lib/weave.js pickedAngleOf, which the browser cannot
   * import; a test holds the two equal on one corpus. The page opens it, the operations change it,
   * and the validator holds it to the verdict's thread (meetingPickProblem).
   *
   * @param {*} weave
   * @returns {Object|null}
   */
  function openAngleOf(weave) {
    var angles = asArray(isPlainObject(weave) ? weave.angles : null).filter(isPlainObject);
    if (angles.length === 0) return null;
    var picked = asString(weave[PICKED_KEY]).trim();
    var named = picked ? angles.filter(function (angle) { return weaveIdOf(angle) === picked; })[0] : null;
    return named || angles[0];
  }

  /** The open angle of a weave the meeting is changing, which it must hold. */
  function openAngleIn(weave, operation) {
    var angle = openAngleOf(weave);
    if (!angle) throw new Error(operation + ': the weave holds no angle to open');
    return angle;
  }

  /** The ids of the threads an angle tells, trimmed, in its order. */
  function angleThreadIdsOf(angle) {
    return asArray(isPlainObject(angle) ? angle.threads : null).map(function (id) { return asString(id).trim(); }).filter(Boolean);
  }

  /** Whether a weave's thread under an id carries the room's verdict. */
  function isVerdictThreadId(weave, id) {
    return asArray(weave.threads).some(function (thread) { return isPlainObject(thread) && weaveIdOf(thread) === id && thread.verdict === true; });
  }

  /**
   * The angle the director opens (R1): the pick, `picked`, set to its id. Switching angles keeps
   * every change the director made on each (spec 6), and a pick is no change of the weave's.
   *
   * @param {Object} weave - the weave as the director has it
   * @param {string} angleId - an angle the weave holds
   * @returns {Object}
   */
  function pickMeetingAngle(weave, angleId) {
    var next = editedWeave(weave, 'pickMeetingAngle');
    var id = asString(angleId).trim();
    if (!id || !asArray(next.angles).some(function (angle) { return weaveIdOf(angle) === id; })) {
      throw new Error('pickMeetingAngle: the weave holds no angle ' + String(angleId));
    }
    next[PICKED_KEY] = id;
    return next;
  }

  /**
   * A line of an angle's pitch (ANGLE_FIELDS), as typed. The page rewrites the open angle's; a
   * change belongs to the angle it was made on (spec 6).
   *
   * @param {Object} weave
   * @param {string} angleId - the angle the line is on
   * @param {string} field - one of ANGLE_FIELDS
   * @param {string} text
   * @returns {Object}
   */
  function setAngleField(weave, angleId, field, text) {
    if (ANGLE_FIELDS.indexOf(field) === -1) {
      throw new Error("setAngleField: the meeting rewrites an angle's " + ANGLE_FIELDS.join(', ') + ' in place, not ' + String(field));
    }
    var next = editedWeave(weave, 'setAngleField');
    var id = asString(angleId).trim();
    var angle = asArray(next.angles).filter(function (a) { return isPlainObject(a) && weaveIdOf(a) === id; })[0];
    if (!angle) throw new Error('setAngleField: the weave holds no angle ' + String(angleId));
    angle[field] = typeof text === 'string' ? text : '';
    return next;
  }

  /**
   * A thread's name or its line, as typed. The thread is shared, so the change shows in every
   * angle that tells it (R9; spec 6).
   *
   * @param {Object} weave
   * @param {number} index - the thread's place in the weave's threads
   * @param {string} field - 'name' or 'line'
   * @param {string} text
   * @returns {Object}
   */
  function setThreadField(weave, index, field, text) {
    if (THREAD_TEXT_FIELDS.indexOf(field) === -1) {
      throw new Error("setThreadField: the meeting rewrites a thread's name or line in place, not " + String(field));
    }
    var next = editedWeave(weave, 'setThreadField');
    elementAt(next.threads, index, 'setThreadField', 'thread')[field] = typeof text === 'string' ? text : '';
    return next;
  }

  /**
   * A thread flipped into the open angle, after the angle's own threads, or out of it (spec 6).
   * The thread that carries the room's verdict stays in, whatever is asked (R8). A thread flipped
   * to where it already is leaves the angle as it was.
   *
   * @param {Object} weave
   * @param {string} threadId - a thread the weave holds
   * @param {boolean} isIn - true to bring it into the story, false to leave it out
   * @returns {Object}
   */
  function flipMeetingThread(weave, threadId, isIn) {
    var next = editedWeave(weave, 'flipMeetingThread');
    var id = asString(threadId).trim();
    if (!id || !asArray(next.threads).some(function (thread) { return weaveIdOf(thread) === id; })) {
      throw new Error('flipMeetingThread: the weave holds no thread ' + String(threadId));
    }
    var angle = openAngleIn(next, 'flipMeetingThread');
    var ids = asArray(angle.threads);
    var holds = angleThreadIdsOf(angle).indexOf(id) !== -1;
    if (isIn && !holds) angle.threads = ids.concat([id]);
    if (!isIn && holds && !isVerdictThreadId(next, id)) {
      angle.threads = ids.filter(function (entry) { return asString(entry).trim() !== id; });
    }
    return next;
  }

  /** The first `t<n>` no thread holds, counting on from the threads there are. */
  function freshThreadId(threads) {
    var taken = new Set(threads.map(weaveIdOf));
    var n = threads.length + 1;
    while (taken.has('t' + n)) n += 1;
    return 't' + n;
  }

  /**
   * A thread the writer missed (spec 6; phase 4b, brief 1B): its name and its line under an id of
   * its own, `{id, name, line}`, as typed, in the story of the open angle, after its own threads.
   * It carries no evidence, which the director-side schema allows: the map writer finds it (piece
   * 1, spec 5.3). With no name and no line it adds none; either alone is kept as typed, the other
   * left blank.
   *
   * @param {Object} weave - the weave as the director has it
   * @param {string} name - the thread's short name
   * @param {string} line - the thread in one line
   * @returns {Object} the weave with the thread, or the weave given when there is nothing to add
   */
  function addMeetingThread(weave, name, line) {
    var typedName = typeof name === 'string' ? name : '';
    var typedLine = typeof line === 'string' ? line : '';
    if (!typedName.trim() && !typedLine.trim()) return weave;
    var next = editedWeave(weave, 'addMeetingThread');
    var angle = openAngleIn(next, 'addMeetingThread');
    var id = freshThreadId(next.threads);
    next.threads.push({ id: id, name: typedName, line: typedLine });
    angle.threads = asArray(angle.threads).concat([id]);
    return next;
  }

  /**
   * A thread taken out again: the meeting offers it only for a thread added at this look. It goes
   * off every angle that tells it too, so no angle names a thread the weave does not hold.
   */
  function removeMeetingThread(weave, index) {
    var next = editedWeave(weave, 'removeMeetingThread');
    var id = weaveIdOf(elementAt(next.threads, index, 'removeMeetingThread', 'thread'));
    next.threads.splice(index, 1);
    var stillHeld = next.threads.some(function (thread) { return weaveIdOf(thread) === id; });
    if (id && !stillHeld) {
      asArray(next.angles).filter(isPlainObject).forEach(function (angle) {
        if (Array.isArray(angle.threads)) angle.threads = angle.threads.filter(function (entry) { return asString(entry).trim() !== id; });
      });
    }
    return next;
  }

  /** The director's answer to a question, as typed; a blank box is no answer. */
  function setQuestionAnswer(weave, index, text) {
    var next = editedWeave(weave, 'setQuestionAnswer');
    var question = elementAt(next.questions, index, 'setQuestionAnswer', 'question');
    if (typeof text === 'string' && text.trim()) question[WEAVE_ANSWER_KEY] = text;
    else delete question[WEAVE_ANSWER_KEY];
    return next;
  }

  // How the gate reads two weaves (lib/weave.js and lib/hand-edit-diff.js), for a browser
  // that cannot import them. Tests hold the decisions equal.

  /** An element's id as every join at the meeting reads it, trimmed (lib/weave.js weaveIdOf). */
  function weaveIdOf(element) {
    return element && typeof element === 'object' && typeof element.id === 'string' ? element.id.trim() : '';
  }

  /** The ids more than one element of a list carries, each once (lib/weave.js repeatedIds). */
  function repeatedIdsOf(elements) {
    var seen = new Set();
    var repeated = [];
    asArray(elements).forEach(function (element) {
      var id = weaveIdOf(element);
      if (!id) return;
      if (seen.has(id) && repeated.indexOf(id) === -1) repeated.push(id);
      seen.add(id);
    });
    return repeated;
  }

  /** How many elements of a list carry each id. */
  function idCounts(elements) {
    var counts = new Map();
    asArray(elements).forEach(function (element) {
      var id = weaveIdOf(element);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return counts;
  }

  /** A value with every object's keys sorted and every string trimmed (lib/hand-edit-diff.js sortKeys). */
  function sortedTrimmed(value) {
    if (Array.isArray(value)) return value.map(sortedTrimmed);
    if (isPlainObject(value)) {
      var out = {};
      Object.keys(value).sort().forEach(function (key) { out[key] = sortedTrimmed(value[key]); });
      return out;
    }
    return typeof value === 'string' ? value.trim() : value;
  }

  /** Trimmed canonical equality (lib/hand-edit-diff.js same). */
  function sameValue(a, b) {
    if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
    var canon = function (v) { return v === undefined ? 'undefined' : JSON.stringify(sortedTrimmed(v)); };
    return canon(a) === canon(b);
  }

  /** A collection's elements under their id and occurrence, so the elements under a repeated id pair in order. */
  function elementsById(list) {
    var out = { list: [], map: new Map(), repeated: new Set(repeatedIdsOf(list)) };
    var seen = new Map();
    asArray(list).forEach(function (element) {
      var id = weaveIdOf(element);
      if (!id) return;
      var occurrence = seen.get(id) || 0;
      seen.set(id, occurrence + 1);
      var key = occurrence + ':' + id;
      out.map.set(key, element);
      out.list.push({ id: id, key: key, element: element });
    });
    return out;
  }

  function withoutKey(object, key) {
    var out = {};
    Object.keys(object).forEach(function (k) { if (k !== key) out[k] = object[k]; });
    return out;
  }

  function unionKeys(a, b) {
    var keys = Object.keys(a || {});
    Object.keys(b || {}).forEach(function (key) { if (keys.indexOf(key) === -1) keys.push(key); });
    return keys;
  }

  /**
   * The changes between two weaves, one per place, as lib/hand-edit-diff.js
   * weaveEditsBetween finds them (a test holds the two equal): "from your notes" whole; each
   * angle found by its id, field by field (its pitch), and each thread flipped into or out of it
   * (`field` its `threads`, with the `thread` and which way, `flip`; piece 3, R2), a thread the
   * weave lacks on either side being no flip; each thread and connection found by its id, field
   * by field, added whole or taken out whole. The pick is no change (R1). The questions are not
   * read: an answer is the director's words, no edit. Nor is the evidence under a line, the
   * writers' (phase 4b, brief 1B; R6). Each change under an id either weave repeats carries
   * `repeatedId`, since no edit can find its element by the id, but a change to the first angle
   * under a repeated id, the one the pick opens.
   *
   * @param {*} before
   * @param {*} after
   * @returns {Array<{scope: string, id: (string|null), field: (string|null), repeatedId: boolean, thread?: string, flip?: string}>}
   */
  function meetingWeaveChanges(before, after) {
    if (!isPlainObject(before) || !isPlainObject(after)) return [];
    var out = [];
    var change = function (scope, id, field, repeatedId) {
      out.push({ scope: scope, id: id, field: field, repeatedId: repeatedId });
    };
    WEAVE_TEXT_FIELDS.forEach(function (field) {
      if (!sameValue(before[field], after[field])) change(field, null, null, false);
    });
    var threadsBefore = elementsById(before.threads);
    var threadsAfter = elementsById(after.threads);
    var heldIn = function (threads, id) { return threads.list.some(function (entry) { return entry.id === id; }); };
    var anglesBefore = elementsById(before.angles);
    var anglesAfter = elementsById(after.angles);
    // The first angle under an id the writer repeated is the one the pick opens, so only a later
    // one is out of the director's reach.
    var angleRepeated = function (entry) {
      return (anglesBefore.repeated.has(entry.id) || anglesAfter.repeated.has(entry.id)) && entry.key.indexOf('0:') !== 0;
    };
    anglesAfter.list.forEach(function (entry) {
      var repeated = angleRepeated(entry);
      var prior = anglesBefore.map.get(entry.key);
      if (!prior) {
        change('angles', entry.id, null, repeated);
        return;
      }
      unionKeys(prior, entry.element).forEach(function (field) {
        if (field !== 'threads' && !sameValue(prior[field], entry.element[field])) change('angles', entry.id, field, repeated);
      });
      var was = angleIdsUnique(prior);
      var now = angleIdsUnique(entry.element);
      var both = function (id) { return heldIn(threadsBefore, id) && heldIn(threadsAfter, id); };
      var flip = function (threadId, way) {
        var flipRepeated = repeated || threadsBefore.repeated.has(threadId) || threadsAfter.repeated.has(threadId);
        out.push({ scope: 'angles', id: entry.id, field: 'threads', repeatedId: flipRepeated, thread: threadId, flip: way });
      };
      now.forEach(function (id) { if (was.indexOf(id) === -1 && both(id)) flip(id, 'in'); });
      was.forEach(function (id) { if (now.indexOf(id) === -1 && both(id)) flip(id, 'out'); });
    });
    anglesBefore.list.forEach(function (entry) {
      if (!anglesAfter.map.has(entry.key)) change('angles', entry.id, null, angleRepeated(entry));
    });
    ['threads', 'connections'].forEach(function (collection) {
      var b = collection === 'threads' ? threadsBefore : elementsById(before[collection]);
      var a = collection === 'threads' ? threadsAfter : elementsById(after[collection]);
      var repeated = function (id) { return b.repeated.has(id) || a.repeated.has(id); };
      a.list.forEach(function (entry) {
        var prior = b.map.get(entry.key);
        if (!prior) {
          change(collection, entry.id, null, repeated(entry.id));
          return;
        }
        // Phase 4b (brief 1B; R6): the evidence is never the director's edit, so no change
        // reads it, as lib/hand-edit-diff.js withoutEvidence leaves it out.
        var p = withoutKey(prior, EVIDENCE_KEY);
        var e = withoutKey(entry.element, EVIDENCE_KEY);
        unionKeys(p, e).forEach(function (field) {
          if (!sameValue(p[field], e[field])) change(collection, entry.id, field, repeated(entry.id));
        });
      });
      b.list.forEach(function (entry) {
        if (!a.map.has(entry.key)) change(collection, entry.id, null, repeated(entry.id));
      });
    });
    return out;
  }

  /** The ids of the threads an angle tells, trimmed, each once, in its order. */
  function angleIdsUnique(angle) {
    var ids = [];
    angleThreadIdsOf(angle).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
    return ids;
  }

  /** What a value lacks against its shape's type, or null. */
  function typeProblem(value, type, at) {
    if (type === 'string') return typeof value === 'string' ? null : at + ' must be text';
    if (type === 'boolean') return typeof value === 'boolean' ? null : at + ' must be true or false';
    if (type === 'strings' || type === 'nonEmptyStrings') {
      if (!Array.isArray(value)) return at + ' must be a list';
      if (type === 'nonEmptyStrings' && value.length === 0) return at + ' must name at least one';
      for (var i = 0; i < value.length; i += 1) {
        if (typeof value[i] !== 'string') return at + '[' + i + '] must be text';
      }
      return null;
    }
    if (Array.isArray(type)) return typeof value === 'string' && type.indexOf(value) !== -1 ? null : at + ' must be one of ' + type.join(', ');
    if (type.list) {
      if (!Array.isArray(value)) return at + ' must be a list';
      for (var j = 0; j < value.length; j += 1) {
        var inList = shapeProblem(value[j], type.list, at + '[' + j + ']');
        if (inList) return inList;
      }
      return null;
    }
    return shapeProblem(value, type.object, at);
  }

  /** What an object lacks against a shape of DIRECTOR_WEAVE_SHAPE, or null. */
  function shapeProblem(value, shape, at) {
    if (!isPlainObject(value)) return (at || 'the weave') + ' must be an object';
    var prefix = at ? at + '.' : '';
    for (var i = 0; i < shape.required.length; i += 1) {
      if (value[shape.required[i]] === undefined) return prefix + shape.required[i] + ' is missing';
    }
    var keys = Object.keys(shape.fields);
    for (var k = 0; k < keys.length; k += 1) {
      if (value[keys[k]] === undefined) continue;
      var problem = typeProblem(value[keys[k]], shape.fields[keys[k]], prefix + keys[k]);
      if (problem) return problem;
    }
    return null;
  }

  /**
   * The word for one element of each of the weave's collections: a refusal's word, and a
   * line's key on the page. A copy of lib/hand-edit-diff.js WEAVE_ELEMENTS; a test holds the
   * two equal (task 4.5c).
   */
  var ELEMENT_WORDS = { angles: 'angle', threads: 'thread', connections: 'connection', questions: 'question' };

  /**
   * What the gate would refuse in the weave as the director left it, as one reason, or
   * null for a weave it takes (the integrator's ruling 4; lib/meeting.js
   * directorWeaveProblems, whose decisions a test holds this to):
   * - the director-side schema (DIRECTOR_WEAVE_SHAPE);
   * - an id the director's version carries more often than the weave the meeting showed:
   *   the director's repeat;
   * - a change under an id the writer repeated: no edit could find its element by the id.
   *   A writer's repeat passes while the director leaves the elements under it as shown;
   * - a pick that names no angle, and a picked angle without the thread that carries the
   *   room's verdict (R8; lib/meeting.js pickProblems), which a reweave or a send-back is refused
   *   only when the director's version made (3 final, item 5).
   * Both weaves are read without their code-owned keys, as the gate reads them.
   *
   * @param {*} weave - the weave as the director left it
   * @param {*} shown - the weave the meeting showed (data.weave)
   * @param {string} [action='approve'] - the action the director pressed (MEETING_ACTIONS)
   * @returns {string|null}
   */
  function meetingWeaveProblems(weave, shown, action) {
    var left = isPlainObject(weave) ? withoutCodeOwned(weave) : null;
    if (!left) return 'The weave as you left it must be an object, with its threads.';
    var malformed = shapeProblem(left, DIRECTOR_WEAVE_SHAPE, '');
    if (malformed) return 'The weave as you left it is malformed: ' + malformed + '.';
    var shownWeave = isWeaveValue(shown) ? withoutCodeOwned(shown) : null;
    var retired = meetingRetiredKeyProblem(left, shownWeave);
    if (retired) return retired;
    var repeats = [];
    ['angles', 'threads', 'connections', 'questions'].forEach(function (collection) {
      var theirs = shownWeave ? idCounts(shownWeave[collection]) : new Map();
      idCounts(left[collection]).forEach(function (n, id) {
        if (n >= 2 && n > (theirs.get(id) || 0)) repeats.push(collection + ' share the id "' + id + '"');
      });
    });
    if (repeats.length > 0) {
      return 'Two ' + repeats.join('; two ') + ': your changes made ' + (repeats.length > 1 ? 'these repeats' : 'this repeat') + '. Give each its own id.';
    }
    var touched = shownWeave ? meetingWeaveChanges(shownWeave, left).filter(function (c) { return c.repeatedId; }) : [];
    if (touched.length > 0) {
      // A thread flipped under an id the writer repeated names the threads (piece 3, brief 3C).
      var first = touched[0];
      var threadRepeat = first.flip && repeatedIdsOf(shownWeave.threads).indexOf(first.thread) !== -1;
      return 'The writer gave more than one ' + (threadRepeat ? 'thread' : ELEMENT_WORDS[first.scope]) + ' the id "' + (threadRepeat ? first.thread : first.id) + '", so the meeting cannot tell which of them you changed. Put them back as the meeting showed them: a reweave with a note, or a send-back, gives each its own id.';
    }
    return meetingAngleSetProblem(left, shownWeave) || meetingPickProblem(left, shownWeave, action || 'approve');
  }

  /**
   * What the gate refuses in the director's angles, or null (lib/meeting.js angleSetProblems,
   * whose decisions a test holds this to; R9, fix round 1): an angle the meeting showed that the
   * version drops, or one it adds that the meeting never showed, named by its headline. The gate
   * stores the angles the meeting showed, by id, and only the picked one as the director left it.
   *
   * @param {Object} weave - the weave as the director left it, which the shape has taken
   * @param {Object|null} shown - the weave the meeting showed, without its code-owned keys
   * @returns {string|null}
   */
  function meetingAngleSetProblem(weave, shown) {
    if (!isPlainObject(shown) || !Array.isArray(shown.angles)) return null;
    var idsOf = function (angles) { return asArray(angles).filter(isPlainObject).map(function (angle) { return weaveIdOf(angle); }); };
    var shownIds = idsOf(shown.angles);
    var leftIds = idsOf(weave.angles);
    var named = function (angle) { return '"' + (asString(angle.headline).trim() || weaveIdOf(angle) || 'an angle with no id') + '"'; };
    var dropped = asArray(shown.angles).filter(isPlainObject).filter(function (angle) { return leftIds.indexOf(weaveIdOf(angle)) === -1; });
    var added = asArray(weave.angles).filter(isPlainObject).filter(function (angle) { return shownIds.indexOf(weaveIdOf(angle)) === -1; });
    if (dropped.length > 0) return 'Keep the angle ' + named(dropped[0]) + ': the meeting keeps the angles it showed, and you change only the one you pick.';
    if (added.length > 0) return 'The angle ' + named(added[0]) + ' is not one the meeting showed: pick one of the angles the meeting showed, and change only that one.';
    return null;
  }

  /**
   * The keys the story meeting no longer has (lib/meeting.js RETIRED_WEAVE_KEYS, which a test holds
   * this copy equal to; 3 final, item 7): the weave's own story, question, headline, convergence and
   * stronger main thread, a role on an angle or a thread, a left-out reason and a connection's strike.
   */
  var MEETING_RETIRED_KEYS = {
    weave: ['story', 'question', 'headline', 'convergence', 'strongerMainThread'],
    angles: ['role'],
    threads: ['role', 'reason'],
    connections: ['struck']
  };

  /**
   * What the gate refuses as a key the meeting no longer has, or null (lib/meeting.js
   * retiredKeyProblems, whose decisions a test holds this to): each retired key the director's
   * version holds that the weave the meeting showed does not hold with the same value, on the same
   * element by its id.
   *
   * @param {Object} weave - the weave as the director left it, which the shape has taken
   * @param {Object|null} shown - the weave the meeting showed, without its code-owned keys
   * @returns {string|null}
   */
  function meetingRetiredKeyProblem(weave, shown) {
    var has = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
    var theirs = function (element, before) {
      return function (key) {
        return has(element, key) && !(before && has(before, key) && JSON.stringify(before[key]) === JSON.stringify(element[key]));
      };
    };
    var listed = function (words) {
      return words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : words.join('');
    };
    var named = function (keys) { return listed(keys.map(function (key) { return '"' + key + '"'; })); };
    var found = [];
    var onWeave = MEETING_RETIRED_KEYS.weave.filter(theirs(weave, isPlainObject(shown) ? shown : null));
    if (onWeave.length > 0) found.push(named(onWeave) + ' on the weave');
    ['angles', 'threads', 'connections'].forEach(function (collection) {
      asArray(weave[collection]).filter(isPlainObject).forEach(function (element) {
        var id = weaveIdOf(element);
        var before = isPlainObject(shown)
          ? asArray(shown[collection]).filter(function (own) { return isPlainObject(own) && weaveIdOf(own) === id; })[0]
          : null;
        var keys = MEETING_RETIRED_KEYS[collection].filter(theirs(element, before));
        if (keys.length > 0) found.push(named(keys) + ' on ' + ELEMENT_WORDS[collection] + ' "' + id + '"');
      });
    });
    if (found.length === 0) return null;
    return 'The story meeting no longer has ' + listed(found) + ': take them out of the version you send. Each angle carries its own headline, story, question and ending, a thread is in an angle or out of it, and a connection you want gone goes with a note.';
  }

  /** How a refusal of R8 names the angle the action sends (lib/meeting.js ANGLE_THE_ACTION_SENDS; 3 final, item 5). */
  var MEETING_NO_ANGLE_LINE = 'There is no angle to approve. Send the weave back with a note, and the writer pitches the angles again.';
  var MEETING_ANGLE_SENT = { approve: 'The angle you approve', reweave: 'The angle you reweave', 'send-back': 'The angle you send back' };

  /**
   * What the gate refuses in the director's pick, or null (lib/meeting.js pickProblems, whose
   * decisions a test holds this to): a pick that names no angle the weave holds; a pick of an
   * angle id the writer repeated, other than the angle the meeting opened (3B fix 7), since the
   * gate stores the angle sent by its id; and a version that does not carry the thread that
   * carries the room's verdict (R8): the thread taken out,
   * its verdict flag taken off or moved, or the thread left out of the picked angle (the one the
   * pick names, else the first). The verdict's thread is the one the weave the meeting showed
   * flags, by id, else the one the version flags (fix round 1, finding 2). The page locks that
   * thread in the open angle, so this holds a version from anywhere else to the gate's rule.
   * As the gate does (3 final, item 5), an approve is refused whoever left the thread out, and a
   * reweave or a send-back only when the director's version took the thread out, took its verdict
   * off or left it out of an angle the meeting showed telling it; each line names the action.
   *
   * @param {Object} weave - the weave as the director left it, which the shape has taken
   * @param {Object|null} [shown] - the weave the meeting showed, without its code-owned keys
   * @param {string} [action='approve'] - the action the director pressed
   * @returns {string|null}
   */
  function meetingPickProblem(weave, shown, action) {
    var angles = asArray(weave.angles);
    var picked = asString(weave[PICKED_KEY]).trim();
    var byId = function (id) { return angles.filter(function (angle) { return weaveIdOf(angle) === id; })[0] || null; };
    if (picked && !byId(picked)) return 'Pick one of the angles the meeting showed.';
    var angle = openAngleOf(weave);
    // 3 final, item 6: an approve sends an angle on to the map (lib/meeting.js NO_ANGLE_TO_APPROVE).
    if (!angle) return action === 'approve' || !action ? MEETING_NO_ANGLE_LINE : null;
    var openId = weaveIdOf(angle);
    var shownOpen = isPlainObject(shown) ? openAngleOf(shown) : null;
    if (openId && isPlainObject(shown) && (idCounts(shown.angles).get(openId) || 0) > 1 && openId !== weaveIdOf(shownOpen)) {
      return 'The writer gave more than one angle the id "' + openId + '", so the meeting cannot tell which of them you picked. Leave the pick as the meeting showed it, or pick an angle under an id of its own: a reweave with a note, or a send-back, gives each angle its own id.';
    }
    var named = angleThreadIdsOf(angle);
    var flagged = function (threads) {
      return asArray(threads).filter(function (thread) { return isPlainObject(thread) && thread.verdict === true && weaveIdOf(thread); });
    };
    var shownVerdict = isPlainObject(shown) ? flagged(shown.threads) : [];
    var verdictThreads = shownVerdict.length > 0 ? shownVerdict : flagged(weave.threads);
    var shownSame = isPlainObject(shown) ? asArray(shown.angles).filter(function (own) { return weaveIdOf(own) === openId; })[0] : null;
    var shownNamed = shownSame ? angleThreadIdsOf(shownSame) : [];
    var sends = MEETING_ANGLE_SENT[action] || MEETING_ANGLE_SENT.approve;
    for (var i = 0; i < verdictThreads.length; i += 1) {
      var id = weaveIdOf(verdictThreads[i]);
      var name = '"' + (asString(verdictThreads[i].name).trim() || id) + '"';
      var held = asArray(weave.threads).filter(function (own) { return weaveIdOf(own) === id; });
      if (held.length === 0) return 'Keep ' + name + " in the weave: it tells the room's verdict, which the article always reports.";
      if (!held.some(function (own) { return own.verdict === true; })) return "Keep the room's verdict on " + name + ': the article always reports it.';
      if (named.indexOf(id) !== -1) continue;
      var yours = !shownSame || shownNamed.indexOf(id) !== -1;
      if (yours) return sends + ' must keep ' + name + ": it tells the room's verdict, which the article always reports.";
      if (action === 'approve' || !action) return sends + ' must tell ' + name + ": it tells the room's verdict, which the article always reports. Bring it into the angle, or send the weave back with a note.";
    }
    return null;
  }

  /**
   * The director's version as the gate stores it (R9): the angles the meeting showed, in its
   * order and by id, each as the meeting showed it but the one open, which is as the director left
   * it, so a change left on an angle they switched away from is not kept. A pick the director's
   * order alone made is written as their pick. A copy of lib/meeting.js withUnsentAnglesAsShown,
   * which a test holds this to on one corpus.
   *
   * @param {Object} left - the weave as the director left it, without its code-owned keys
   * @param {Object|null} shown - the weave the meeting showed, without its code-owned keys
   * @returns {Object}
   */
  function withUnsentAnglesAsShown(left, shown) {
    if (!isWeaveValue(shown) || !Array.isArray(shown.angles)) return left;
    var picked = openAngleOf(left);
    var pickedId = picked ? weaveIdOf(picked) : '';
    if (!pickedId) return left;
    var sentAt = -1;
    shown.angles.some(function (angle, index) {
      if (weaveIdOf(angle) !== pickedId) return false;
      sentAt = index;
      return true;
    });
    var angles = shown.angles.map(function (angle, index) { return index === sentAt ? picked : cloneJson(angle); });
    var stored = Object.assign({}, left, { angles: angles });
    if (weaveIdOf(openAngleOf(stored)) !== pickedId) stored[PICKED_KEY] = pickedId;
    return stored;
  }

  /**
   * Whether the director changed the weave the gate stores at this look: anything but an answer
   * or the pick (ruling 5), read on their version with the angles they did not send as the
   * meeting showed them (withUnsentAnglesAsShown, R9).
   */
  function hasWeaveChanges(shown, weave) {
    if (!isPlainObject(shown) || !isPlainObject(weave)) return false;
    var meetingShowed = withoutCodeOwned(shown);
    return meetingWeaveChanges(meetingShowed, withUnsentAnglesAsShown(withoutCodeOwned(weave), meetingShowed)).length > 0;
  }

  /**
   * Whether a round that did not run (lib/meeting.js roundDidNotRunOf) was a reweave with no
   * note. Such a reweave carried a change (ruling 5), and the meeting reopened on the
   * director's version with that change in it, not yet fitted in: lib/meeting.js
   * meetingResume stored it before the rework, and the gate takes a retry as the director's
   * standing edits.
   */
  function isUnfittedReweave(round) {
    return isPlainObject(round) && round.round === 'reweave' && !asString(round.note).trim();
  }

  /**
   * Whether a reweave has something to fit in (the integrator's ruling 5): the director has
   * changed the open angle or a thread, or written a note (spec 7). A change left on an angle
   * they did not send is none, since the gate stores that angle as the meeting showed it (R9;
   * hasWeaveChanges). The changes of a reweave that did not run count, since they are the
   * director's and still unfitted (isUnfittedReweave). The buttons and the payload read this one
   * rule.
   *
   * @param {Object} data - the stop's payload: the weave it showed and a round that did not run
   * @param {*} weave - the weave as the director left it
   * @param {string} note - the meeting's note box
   * @returns {boolean}
   */
  function reweaveHasSomething(data, weave, note) {
    var d = isPlainObject(data) ? data : {};
    if (typeof note === 'string' && note.trim()) return true;
    return hasWeaveChanges(d.weave, weave) || (isWeaveValue(weave) && isUnfittedReweave(d.roundDidNotRun));
  }

  /** Whether the director's version differs from the weave shown in anything, as typed, answers included. */
  function weaveDiffers(shown, weave) {
    var exact = function (v) { return JSON.stringify(sortKeysOnly(v)); };
    return exact(isPlainObject(shown) ? withoutCodeOwned(shown) : shown) !== exact(weave);
  }

  function sortKeysOnly(value) {
    if (Array.isArray(value)) return value.map(sortKeysOnly);
    if (isPlainObject(value)) {
      var out = {};
      Object.keys(value).sort().forEach(function (key) { out[key] = sortKeysOnly(value[key]); });
      return out;
    }
    return value === undefined ? null : value;
  }

  /**
   * One of the meeting's payloads, 4.5's (lib/meeting.js meetingResume):
   * - approve: `{meeting: 'approve', weave, note?}`;
   * - reweave: `{meeting: 'reweave', weave, note?}`, offered only when it has something to
   *   fit in (reweaveHasSomething, ruling 5): null otherwise, answers alone being no change;
   * - send-back: `{meeting: 'send-back', note, weave?}`, null without a note; the weave
   *   rides along when the director changed it in anything, answers included.
   * The weave goes without its code-owned keys, and the note as typed, when it is not blank.
   *
   * @param {string} action - 'approve', 'reweave' or 'send-back'
   * @param {Object} data - the stop's payload: the weave it showed and a round that did not run
   * @param {Object} weave - the weave as the director left it
   * @param {string} note - the meeting's note box
   * @returns {Object|null}
   */
  function meetingPayload(action, data, weave, note) {
    if (MEETING_ACTIONS.indexOf(action) === -1) {
      throw new Error('meetingPayload: the story meeting takes approve, reweave or send-back, not ' + String(action));
    }
    var shown = isPlainObject(data) ? data.weave : null;
    var typed = typeof note === 'string' ? note : '';
    var hasNote = typed.trim().length > 0;
    var left = isPlainObject(weave) ? withoutCodeOwned(weave) : null;
    if (action === 'send-back') {
      if (!hasNote) return null;
      var back = { meeting: 'send-back', note: typed };
      if (left && weaveDiffers(shown, left)) back.weave = left;
      return back;
    }
    if (action === 'reweave' && !reweaveHasSomething(data, left, typed)) return null;
    var payload = { meeting: action, weave: left };
    if (hasNote) payload.note = typed;
    return payload;
  }

  /**
   * The meeting's three buttons: Approve; Reweave, offered while it has something to fit in,
   * and only then (reweaveHasSomething, ruling 5); Send back, on its note, in two clicks
   * (sendBackButton).
   *
   * @param {Object} data - the stop's payload: the weave it showed and a round that did not run
   */
  function meetingButtons(data, weave, note, sendBackArmed) {
    var canReweave = reweaveHasSomething(data, weave, note);
    return {
      approve: { label: 'Approve', ariaLabel: 'Approve the weave as you left it, with your note' },
      reweave: {
        label: 'Reweave',
        disabled: !canReweave,
        ariaLabel: 'Reweave: the writer fits your changes and your note into the angle you have open, and the meeting reopens',
        hint: canReweave ? '' : REWEAVE_HINT
      },
      sendBack: sendBackButton(sendBackArmed, note, 'weave')
    };
  }

  /**
   * The verdict, printed by code from the parse (spec 4.3): who the room named, or what it
   * decided when it named no one; the charge; a split final vote.
   *
   * @param {Object|null} accusation - data.accusation
   * @returns {{parsed: boolean, who: string, charge: string, vote: string}}
   */
  function meetingVerdictView(accusation) {
    var parsed = accusationView(accusation);
    var verdict = verdictView(accusation);
    var votes = votesView(accusation);
    var who = parsed.accused
      || (verdict.noCulprit ? 'No one: ' + verdict.label : '')
      || (verdict.blamesNoCharacter ? 'No character: ' + verdict.label : '');
    return { parsed: who !== '', who: who, charge: parsed.charge, vote: votes.split ? votes.line : '' };
  }

  /**
   * A document the stop names, through its evidenceIndex: its name and owner, found in any
   * case as the evidence check finds a source (lib/evidence.js). A document the index does not
   * hold shows as its id. The story meeting names a piece's document by it (evidenceFoldView),
   * the map a card's, and the desk the document a card cites.
   *
   * @param {*} documentId
   * @param {Object} evidenceIndex - data.evidenceIndex
   * @returns {{id: string, label: string, known: boolean, firstLine: string}|null}
   */
  function receiptView(documentId, evidenceIndex) {
    var id = asString(documentId).trim();
    if (!id) return null;
    var index = isPlainObject(evidenceIndex) ? evidenceIndex : {};
    var key = hasOwn(index, id) ? id : null;
    if (key === null) {
      var lower = id.toLowerCase();
      key = Object.keys(index).filter(function (k) { return k.toLowerCase() === lower; })[0] || null;
    }
    if (key === null) return { id: id, label: id, known: false, firstLine: '' };
    var entry = evidenceEntry(key, index);
    return { id: id, label: entry.label, known: true, firstLine: entry.firstLine };
  }

  /** The fold under each line of the story meeting and the map (spec 9). */
  var EVIDENCE_FOLD_TITLE = "What's behind it";

  /**
   * What a fold's group says to a screen reader: the fold's title and the line it sits under,
   * "What's behind it: <name>". The one builder the meeting's threads and connections and the
   * map's moves call (fix round 3).
   *
   * @param {string} name - the line, as its other labels name it
   * @returns {string}
   */
  function evidenceFoldLabel(name) {
    return EVIDENCE_FOLD_TITLE + ': ' + name;
  }

  /** What the fold says of a piece that cuts against its line. */
  var CUTS_AGAINST_LABEL = 'Cuts against';

  /**
   * The fold of a thread the director added at the story meeting, or brought into the story from
   * left out (fix round 4), while it carries no evidence: the next writer finds its evidence (spec
   * 5.3; Review focus 1). A thread of the writer's with none is a check's failure, which the page
   * shows beside it instead.
   */
  var MEETING_NO_EVIDENCE_LINE = 'Nothing yet: the map writer finds the evidence for it.';

  /**
   * The fold of a thread the director added that a writer has since returned (the payload's
   * `reworkedThreads`; lib/meeting.js meetingReworkedThreads) while it still carries no evidence: a
   * Reweave finds the evidence for such a thread, or leaves it with none when the record cannot carry
   * it (spec 2026-10-06 section 7; 3 final, item 2). The map's gap note says so after.
   */
  var MEETING_NOTHING_FOUND_LINE = 'The writer found nothing in the record for it.';

  /**
   * One of a piece's sources as the fold names it: the ledger, the evidence log or the
   * director's notes in EVIDENCE_SOURCE_LABELS' words, read in any case as the evidence check
   * reads them, and a document by its name and owner (receiptView), or as written when the
   * index does not hold it.
   */
  function sourceWords(source, evidenceIndex) {
    var id = asString(source).trim();
    if (!id) return null;
    var named = id.toLowerCase();
    if (hasOwn(EVIDENCE_SOURCE_LABELS, named)) return { label: EVIDENCE_SOURCE_LABELS[named], named: true };
    return { label: receiptView(id, evidenceIndex).label, named: false };
  }

  /** A piece's sources as one phrase: "The ledger and the evidence log", "ALE003 - The sale (Alex Reeves), the ledger and your notes". */
  function sourcesPhrase(words) {
    var labels = words.map(function (w, n) { return n > 0 && w.named ? lowerFirst(w.label) : w.label; });
    return labels.length > 1 ? labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1] : labels.join('');
  }

  /**
   * The "What's behind it" fold of a line (phase 4b, brief 1B; spec 5.4 and 9): each piece of
   * its evidence, in order, with its sources by name (sourceWords), what it shows, and whether
   * it cuts against the line. The story meeting folds each thread's and each connection's
   * evidence with it, and the map each move's. A line with no evidence folds no piece: its
   * stop says why in its own words (MEETING_NO_EVIDENCE_LINE at the meeting).
   *
   * @param {*} pieces - a line's evidence
   * @param {Object} evidenceIndex - data.evidenceIndex
   * @returns {Array<{key: string, sources: string[], shows: string, cutsAgainst: boolean, text: string}>}
   */
  function evidenceFoldView(pieces, evidenceIndex) {
    return asArray(pieces).filter(isPlainObject).map(function (piece, n) {
      var words = asArray(piece.sources).map(function (source) { return sourceWords(source, evidenceIndex); }).filter(Boolean);
      var named = sourcesPhrase(words);
      var shows = asString(piece.shows).trim();
      var cutsAgainst = piece.stance === CUTS_AGAINST;
      return {
        key: 'piece-' + n,
        sources: words.map(function (w) { return w.label; }),
        shows: shows,
        cutsAgainst: cutsAgainst,
        text: (cutsAgainst ? CUTS_AGAINST_LABEL + ' · ' : '') + (named ? named + ': ' : '') + shows
      };
    });
  }

  /** The ids after the prefix of a concern ("E1, E3: "), as lib/hand-edit-diff.js CONCERN_IDS reads them. */
  var CONCERN_IDS = /^((?:E\d+)(?:\s*,\s*E\d+)*)\s*:\s*/;

  /**
   * What a concern about the director's edit says after its prefix and ids (lib/hand-edit-diff.js
   * concernFinding; a test holds the two equal): the line beside the edit names the place, so
   * the ids are not shown. Any other text is shown as it is.
   */
  function concernFindingOf(text) {
    var finding = asString(text);
    if (finding.indexOf(DIRECTOR_EDIT_PREFIX) !== 0) return finding;
    var m = CONCERN_IDS.exec(finding.slice(DIRECTOR_EDIT_PREFIX.length));
    return m ? finding.slice(DIRECTOR_EDIT_PREFIX.length + m[0].length) : finding;
  }

  /**
   * The rule ids a judge's finding opens with, and the colon after them ("T5: ", "T4, T6: "): the
   * ids as lib/workflow/nodes/node-helpers.js leadingRuleIds reads them, which the browser cannot
   * import; a test holds the two equal.
   */
  var LEADING_RULE_IDS = /^\s*((?:T\d{1,2}(?:\s*(?:,|&|\/|and)\s*)?)+)\s*:\s*/;

  /**
   * What a judge's mark says at the desk (brief 4.10c): its finding past the leading rule ids, and a
   * concern's past its prefix and ids first (concernFindingOf), since the director reads the line,
   * not the rule. A finding that opens with no rule ids is shown as it is.
   */
  function judgeMarkText(text) {
    var finding = concernFindingOf(text);
    var m = LEADING_RULE_IDS.exec(finding);
    return m ? capitalized(finding.slice(m[0].length)) : finding;
  }

  /**
   * What the page calls each of its lines: "from your notes", and each line of the open angle's
   * pitch (ANGLE_FIELDS; spec 2026-10-06 section 5). ArcSelection.js heads each line with it, and
   * a mark whose line the page does not show is listed under it.
   */
  var MEETING_LINE_LABELS = {
    fromYourNotes: 'From your notes',
    headline: 'Headline',
    story: 'The story',
    question: 'The question it carries',
    lands: 'Why it lands',
    ends: 'Where it ends up'
  };

  /** The weave's own fields that have a line on the page: "from your notes". The pitch's lines are an angle's. */
  var LINE_FIELDS = ['fromYourNotes'];

  /** The collections a place in the weave may name, each with the key of its line on the page. */
  var LINE_ELEMENTS = { angles: 'angle', threads: 'thread', connections: 'connection', questions: 'question' };

  /**
   * A thread flipped into or out of an angle, as lib/hand-edit-diff.js writes its path
   * (`angles[#a1].threads[#t6]`; piece 3, R2): the angle's id and the thread's.
   */
  var FLIP_PATH = /^angles\[#([^\]]*)\]\.threads\[#([^\]]*)\]$/;

  /**
   * A flip's place as lib/hand-edit-diff.js editWhere writes it (`angle "a1", thread "t6",
   * brought in`): the angle's id, the thread's, and which way it flipped.
   */
  var FLIP_PLACE = /^angle "([^"]*)", thread "([^"]*)", (brought in|left out)$/;

  /**
   * The line on the page a place in the weave sits on (a path as lib/hand-edit-diff.js and
   * lib/weave.js weaveFindings write it: `fromYourNotes`, `angles[#a2]`, `threads[#t3].line`,
   * `connections[#c2]`): `fromYourNotes`, `angle:a2`, `thread:t3`, `connection:c2`,
   * `question:q1`, or null for a place no line shows. An angle's key is its card's, and the
   * pitch's while the angle is open. A thread flipped into or out of an angle sits on the
   * thread's line, which the page shows in the story or left out (piece 3, R2).
   */
  function lineKeyOf(path) {
    var flip = FLIP_PATH.exec(asString(path));
    if (flip) return /^index-\d+$/.test(flip[2]) ? null : 'thread:' + flip[2];
    var m = /^([A-Za-z]+)(?:\[#([^\]]*)\])?/.exec(asString(path));
    if (!m) return null;
    if (m[2] === undefined) return LINE_FIELDS.indexOf(m[1]) !== -1 ? m[1] : null;
    if (!hasOwn(LINE_ELEMENTS, m[1]) || /^index-\d+$/.test(m[2])) return null;
    return LINE_ELEMENTS[m[1]] + ':' + m[2];
  }

  /** Whether a path names a whole angle, thread, connection or question. */
  function isElementPath(path) {
    return /^(angles|threads|connections|questions)\[#[^\]]*\]$/.test(asString(path));
  }

  /** The field a path ends on inside an element (`line` in `threads[#t3].line`), or ''. */
  function elementFieldOf(path) {
    var m = /^[A-Za-z]+\[#[^\]]*\]\.([A-Za-z]+)/.exec(asString(path));
    return m ? m[1] : '';
  }

  /**
   * The words of a value the weave's diff wrote as an element's fields (lib/hand-edit-diff.js
   * weaveReportText: `id: t6; name: …; line: …`, an angle's `id: a2; headline: …; gist: …`), each
   * field by its key, or null for any other text. The fields are found by the keys a weave's
   * elements carry, so a value that is plain text reads as itself.
   */
  var ELEMENT_FIELD_KEYS = ['id', 'headline', 'gist', 'story', 'question', 'lands', 'ends', 'name', 'line', 'verdict', 'joins', 'kind', 'about', 'changes', 'answer', 'thread'];
  var ELEMENT_FIELD_SPLIT = new RegExp('; (?=(?:' + ELEMENT_FIELD_KEYS.join('|') + '): )');
  var ELEMENT_FIELD_START = /^id: /;

  /** The card's one sentence, which an angle's card shows and the pitch does not head. */
  var CARD_LINE_WORDS = 'card line';

  /**
   * How a place names a line of an angle's pitch (piece 3, brief 3C): by the heading the pitch
   * gives it (MEETING_LINE_LABELS), as a phrase after the angle (`The angle "…", why it lands`),
   * and the card's one sentence as its card line. lib/meeting.js ANGLE_FIELD_PLACES names the same
   * lines for a later stop, and a test holds the two equal.
   */
  var ANGLE_FIELD_WORDS = (function () {
    var words = {};
    ANGLE_FIELDS.forEach(function (field) {
      if (field === 'gist') { words[field] = CARD_LINE_WORDS; return; }
      var heading = MEETING_LINE_LABELS[field];
      words[field] = (heading.charAt(0).toLowerCase() + heading.slice(1)).replace(/^the /, '');
    });
    return words;
  })();

  function elementFieldsOf(text) {
    var value = asString(text);
    if (!ELEMENT_FIELD_START.test(value)) return null;
    var fields = {};
    value.split(ELEMENT_FIELD_SPLIT).forEach(function (part) {
      var at = part.indexOf(': ');
      if (at > 0) fields[part.slice(0, at)] = part.slice(at + 2);
    });
    return fields;
  }

  /**
   * A thread as the meeting names it, on the page and to a screen reader: its name, or its line
   * when it has none, trimmed (meetingWordsOf's rule, which meetingView's labels read too; fix
   * round 2).
   *
   * @param {*} thread
   * @returns {string}
   */
  function threadLabelOf(thread) {
    var t = isPlainObject(thread) ? thread : {};
    return asString(t.name).trim() || asString(t.line).trim();
  }

  /**
   * The meeting's words for the weave's elements (phase 4b, brief 1B; spec 9: the tags leave
   * the page): each thread by its name, each connection by the names of the threads it joins,
   * each question by what it is about, read from the weave as the director has it, then the
   * weave the meeting showed, then the elements the round's marks carry (one the round took
   * out). No line or label of the meeting names an element by its id: a place the diff names
   * by an id (`thread "t3", line`), and a value it writes as an element's fields, read through
   * these words.
   *
   * @param {Object} weave - the weave as the director has it
   * @param {Object|null} shown - the weave the meeting showed
   * @param {Array} marks - the round's marks (data.marks.marks)
   * @returns {{threadName: function(string): string, joinsText: function(*): string,
   *            place: function(string|null, string): string, storyOf: function(string): string,
   *            value: function(*): string, fieldValue: function(string, *): string}}
   */
  function meetingWordsOf(weave, shown, marks) {
    var elements = { angles: new Map(), threads: new Map(), connections: new Map(), questions: new Map() };
    var remember = function (collection, element) {
      var id = weaveIdOf(element);
      if (id && !elements[collection].has(id)) elements[collection].set(id, element);
    };
    [weave, shown].forEach(function (w) {
      if (!isPlainObject(w)) return;
      Object.keys(elements).forEach(function (collection) {
        asArray(w[collection]).forEach(function (element) { remember(collection, element); });
      });
    });
    asArray(marks).filter(isPlainObject).forEach(function (mark) {
      var collection = (/^([A-Za-z]+)\[/.exec(asString(mark.path)) || [])[1];
      if (hasOwn(elements, collection) && isPlainObject(mark.element)) remember(collection, mark.element);
    });
    var quoted = function (text) { return '"' + text + '"'; };
    var threadName = function (id) {
      var thread = elements.threads.get(asString(id).trim());
      return thread ? threadLabelOf(thread) : '';
    };
    var namesOf = function (ids, quote) {
      var named = asArray(ids).map(function (id) {
        var name = threadName(id);
        if (!name) return 'a thread the weave does not hold';
        return quote ? quoted(name) : name;
      });
      return named.length > 1 ? named.slice(0, -1).join(', ') + ' and ' + named[named.length - 1] : named.join('');
    };
    /**
     * An element's place by its words, found by its id in the weaves and the marks, or else in
     * `fields`, the element as a report entry wrote it (one a send-back took out, which no weave
     * the stop holds keeps).
     */
    var openAngle = openAngleOf(weave);
    /** An angle by its headline, or its card line, as the meeting shows its card. */
    var angleName = function (id, fields) {
      var angle = elements.angles.get(asString(id).trim());
      var own = angle || fields || {};
      return asString(own.headline).trim() || asString(own.gist).trim();
    };
    /** The story a thread is flipped into or out of: the open angle's, or another angle's by its name. */
    var storyOf = function (angleId) {
      if (openAngle && weaveIdOf(openAngle) === asString(angleId).trim()) return 'the story';
      var name = angleName(angleId);
      return name ? 'the story of ' + quoted(name) : 'the story of another angle';
    };
    var elementPlace = function (word, id, fields) {
      var own = fields || {};
      if (word === 'angle') {
        var headline = angleName(id, own);
        return headline ? 'The angle ' + quoted(headline) : 'An angle';
      }
      if (word === 'thread') {
        var name = threadName(id) || asString(own.name).trim() || asString(own.line).trim();
        return name ? 'Thread ' + quoted(name) : 'A thread';
      }
      if (word === 'connection') {
        var connection = elements.connections.get(id);
        var joins = connection ? asArray(connection.joins) : asString(own.joins).split(' / ').filter(Boolean);
        return joins.length > 0 ? 'The connection between ' + namesOf(joins, true) : 'A connection';
      }
      var question = elements.questions.get(id);
      var about = question ? asString(question.about).trim() : asString(own.about).trim();
      return about ? 'The question about ' + quoted(about) : 'A question';
    };
    var value = function (text) {
      var fields = elementFieldsOf(text);
      if (!fields) return asString(text);
      if (hasOwn(fields, 'headline') || hasOwn(fields, 'gist')) return asString(fields.headline) || asString(fields.gist);
      if (hasOwn(fields, 'joins')) return asString(fields.line);
      if (hasOwn(fields, 'question')) return asString(fields.question);
      var said = [asString(fields.name), asString(fields.line)].filter(Boolean).join(': ');
      return said;
    };
    return {
      threadName: threadName,
      /** The threads a connection joins, by name: "The sale" and "The heir". */
      joinsText: function (joins) { return namesOf(joins, true); },
      /**
       * A place in the weave as the meeting names it: one of the weave's lines by its heading
       * (MEETING_LINE_LABELS); an element by its words (`Thread "The envelope", line`), from
       * the diff's `where` (`thread "t3", line`), read from `elementText` (a report entry's
       * element, as the diff wrote it) when no weave holds it; anything else by the diff's words.
       */
      place: function (field, where, elementText) {
        if (field !== null && hasOwn(MEETING_LINE_LABELS, field)) return MEETING_LINE_LABELS[field];
        var flip = FLIP_PLACE.exec(asString(where));
        if (flip) {
          var flipped = threadName(flip[2]) || asString(elementText).trim();
          var thread = flipped ? 'Thread ' + quoted(flipped) : 'A thread';
          return storyOf(flip[1]) === 'the story' ? thread : thread + ', in ' + storyOf(flip[1]);
        }
        var m = ELEMENT_PLACE.exec(asString(where));
        if (!m) return capitalized(asString(where));
        var rest = m[1] === 'angle' && hasOwn(ANGLE_FIELD_WORDS, asString(m[3])) ? ANGLE_FIELD_WORDS[m[3]] : m[3];
        return elementPlace(m[1], m[2], elementFieldsOf(elementText)) + (rest ? ', ' + rest : '');
      },
      /** The story a thread was flipped into or out of, by the angle's id: the open angle's is "the story". */
      storyOf: storyOf,
      /** A value as the meeting names it: an element by its words, any other text as it is. */
      value: value,
      /**
       * A field's value as a mark names it: the threads a connection joins by name, and the thread
       * a question sits beside by its name; anything else as `value` names it.
       */
      fieldValue: function (field, text) {
        if (field === 'joins') return namesOf(asString(text).split(' / ').filter(Boolean), false);
        if (field === 'thread') return threadName(text) || (asString(text).trim() ? 'a thread the weave does not hold' : '');
        return value(text);
      }
    };
  }

  /** A mark's place: its line, or its element by its words, without the diff's ", cut" or ", added", which the mark's line says. */
  function markPlace(mark, words) {
    return words.place(lineKeyOf(mark.path), asString(mark.where).replace(/, (cut|added)$/, ''));
  }

  /**
   * How the meeting phrases an edit a round changed (changedEditLine, every stop's builder):
   * its place as the page heads it (an element by its words), with no edit id, since the
   * meeting shows none; a value as the meeting names it, an element by its words; and text that
   * came back as still in the weave.
   *
   * @param {Object} words - meetingWordsOf's
   */
  function meetingEditLineOptions(words) {
    return {
      place: function (entry) {
        return words.place(asString(entry.scope), asString(entry.where) || asString(entry.scope), asString(entry.director) || asString(entry.became));
      },
      valueText: words.value,
      stillIn: 'in the weave',
      story: function (entry) {
        var flip = FLIP_PLACE.exec(asString(entry.where));
        return flip ? words.storyOf(flip[1]) : 'the story';
      }
    };
  }

  function lowerFirst(text) {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  /** The field of a thread that marks it as carrying the room's verdict, which a mark says in words (brief 4.14a). */
  var VERDICT_FIELD = 'verdict';

  /**
   * The field of a connection the page never prints (R1): what the two threads share. A mark of
   * it sits beside no line, so the meeting leaves it out (besideLines).
   */
  var UNPRINTED_FIELDS = { connections: ['kind'] };

  /** Whether a mark is of a field the page never prints. */
  function isUnprintedMark(mark) {
    var collection = (/^([A-Za-z]+)\[/.exec(asString(mark.path)) || [])[1];
    return hasOwn(UNPRINTED_FIELDS, collection) && UNPRINTED_FIELDS[collection].indexOf(elementFieldOf(mark.path)) !== -1;
  }

  /** A mark of a thread's verdict flag, in words (brief 4.14a): whether the thread carries the room's verdict now. */
  function verdictMarkLine(mark) {
    if (asString(mark.after).trim() === 'true') return "Changed this round: carries the room's verdict.";
    if (asString(mark.before).trim() === 'true') return "Changed this round: no longer carries the room's verdict.";
    return "Changed this round: does not carry the room's verdict.";
  }

  /** The line beside a line of the page that the round's passes changed: what it was, as the meeting names it. */
  function markLine(mark, words) {
    var flip = FLIP_PATH.exec(asString(mark.path));
    if (flip && (mark.flip === 'in' || mark.flip === 'out')) {
      return (mark.flip === 'in' ? 'Brought into ' : 'Left out of ') + words.storyOf(flip[1]) + ' this round.';
    }
    var field = elementFieldOf(mark.path);
    if (field === VERDICT_FIELD) return verdictMarkLine(mark);
    var angleField = /^angles\[/.test(asString(mark.path)) && hasOwn(ANGLE_FIELD_WORDS, field);
    var which = field ? ' (' + (angleField ? ANGLE_FIELD_WORDS[field] : field) + ')' : '';
    var before = asString(mark.before);
    if (!before) return isElementPath(mark.path) ? 'New this round.' : 'Added this round' + which + '.';
    var was = words.fieldValue(field, before);
    if (!asString(mark.after)) return 'Emptied this round' + which + '. Before: "' + was + '"';
    return 'Changed this round' + which + '. Before: "' + was + '"';
  }

  /**
   * What an element the round took out whole held, as the meeting shows it (brief 4.14a; phase
   * 4b, brief 1B): an angle by its card line, or its story without one (piece 3; 3 fix A: the
   * place already names it by its headline), a thread by its line, a connection by its line, a
   * question by its words and its kind; the place before it names the element (markPlace). Read from the element
   * the mark carries (lib/hand-edit-diff.js weaveMarks); null for a mark that carries none.
   */
  function takenOutWords(mark) {
    var element = isPlainObject(mark.element) ? mark.element : null;
    var collection = (/^([A-Za-z]+)\[/.exec(asString(mark.path)) || [])[1];
    if (!element || !isElementPath(mark.path)) return null;
    var quoted = function (text) { return '"' + asString(text).trim() + '"'; };
    var about = function (parts) {
      var said = parts.filter(Boolean).join(', ');
      return said ? ' (' + said + ')' : '';
    };
    // An angle's place names it by its headline, or its card line without one (angleName), so what
    // it held reads as its card line, or its story when the place already used the card line or
    // the angle has none (3 fix A).
    if (collection === 'angles') {
      var gist = asString(element.gist).trim();
      return quoted(asString(element.headline).trim() && gist ? gist : asString(element.story));
    }
    if (collection === 'threads') return quoted(element.line);
    if (collection === 'connections') return quoted(element.line);
    var questionKind = asString(element.kind);
    return quoted(element.question) + about([hasOwn(WRITER_QUESTION_KIND_LABELS, questionKind) ? WRITER_QUESTION_KIND_LABELS[questionKind] : '']);
  }

  /** The line for a line or an element the round's passes took out, which the page no longer shows: what it held, in words. */
  function removedLine(mark, words) {
    var held = takenOutWords(mark);
    return markPlace(mark, words) + ': taken out this round. Before: ' + (held !== null ? held : '"' + words.value(mark.before) + '"');
  }

  /**
   * The one line for the edits of the fields of an element the round took out whole (briefs
   * 4.10c and 4.10d): the element taken out, with what it held, as removedLine says it, then each
   * field the director gave it, which went with it, and the pass that took it out with the
   * rework's reasons, in passWords' words. Only a send-back's rework takes out such an element
   * for good: a reweave and an automatic pass are held to the director's edits, and code puts the
   * element back from the version the pass started from (lib/hand-edit-diff.js settleEdits), so
   * their entries are restored and changedEditsToShow shows none.
   *
   * @param {Object} mark - the round's mark that took the element out
   * @param {Array<{entry: Object, field: string}>} edits - the report's entries for the
   *   director's edits of the element's fields, in the report's order, each with its field (`line`)
   * @param {Object} words - meetingWordsOf's
   */
  function takenOutWithEditLine(mark, edits, words) {
    var gave = edits.map(function (edit) {
      return 'the ' + edit.field + ' you gave it, "' + words.value(edit.entry.director) + '"';
    });
    var listed = gave.length < 2 ? gave.join('') : gave.slice(0, -1).join(', ') + ', and ' + gave[gave.length - 1];
    var pass = passWords(edits.map(function (edit) { return edit.entry; }));
    return removedLine(mark, words) + '. ' + capitalized(listed) + ', went with it (' + pass.by + '). ' + pass.why;
  }

  /** The line for any other mark whose line the page does not show: what changed, and what the place holds now. */
  function elsewhereLine(mark, words) {
    var field = elementFieldOf(mark.path);
    var after = field === VERDICT_FIELD ? '' : asString(mark.after);
    return markPlace(mark, words) + ': ' + lowerFirst(markLine(mark, words)) + (after ? ' Now: "' + words.fieldValue(field, after) + '"' : '');
  }

  /** The banner over the marks after a round. */
  function markedLine(marks) {
    if (!isPlainObject(marks)) return '';
    var round = marks.round === 'send-back' ? 'send-back' : 'reweave';
    return 'After your ' + round + ', ' + (asArray(marks.marks).length > 0
      ? 'each line the writer changed from the weave you left is marked.'
      : 'the writer changed no line of the weave you left.');
  }

  /**
   * Whether the note box holds the note a round that did not run carried (lib/meeting.js
   * roundDidNotRunOf), as typed for that round: restored there with the meeting's pending
   * slot, or typed again (task 4.5c).
   */
  function holdsRoundNote(round, note) {
    var written = isPlainObject(round) ? asString(round.note).trim() : '';
    return written !== '' && asString(note).trim() === written;
  }

  /**
   * The one line for a round whose rework timed out (lib/meeting.js roundDidNotRunOf), which
   * says how to retry with what the buttons and the note box offer: a reweave with no note
   * left its changes in the weave, so Reweave retries it as it stands (isUnfittedReweave); a
   * round whose note the box holds is sent again as it is, with the action it was typed for
   * (task 4.5c); a round whose note the box does not hold takes it again from the box, so
   * the line gives it back word for word.
   *
   * @param {Object|null} round - data.roundDidNotRun
   * @param {string} [note] - the meeting's note box
   */
  function didNotRunLine(round, note) {
    if (!isPlainObject(round)) return '';
    var kind = round.round === 'send-back' ? 'send-back' : 'reweave';
    var line = 'Your ' + kind + ' did not run: the writer timed out, and the weave is as you left it.';
    if (isUnfittedReweave(round)) return line + ' Reweave again to retry.';
    var action = kind === 'reweave' ? 'reweave' : 'send the weave back';
    var written = asString(round.note).trim();
    if (!written) return line + ' To retry, write a note and ' + action + '.';
    if (holdsRoundNote(round, note)) return line + ' Your note is in the box: ' + action + ' again to retry.';
    return line + ' To retry, write your note in the box again and ' + action + '. Your note was: "' + written + '"';
  }

  /**
   * What Approve asks before it sends the note box, when the box holds the note of a round
   * that did not run (holdsRoundNote; task 4.5c): that note was typed for the round, so the
   * page asks whether to keep it, as an approval note, or to clear it, and either answer
   * approves. Null when Approve sends the box as it is.
   *
   * @param {Object} data - the stop's payload: a round that did not run
   * @param {string} note - the meeting's note box
   * @returns {{question: string, keep: {label: string, ariaLabel: string}, clear: {label: string, ariaLabel: string}}|null}
   */
  function meetingApproveAsk(data, note) {
    var round = isPlainObject(data) ? data.roundDidNotRun : null;
    if (!holdsRoundNote(round, note)) return null;
    var kind = round.round === 'send-back' ? 'send-back' : 'reweave';
    return {
      question: 'The note in the box was written for your ' + kind + ', which did not run. Approve with it as an approval note, which every later writer reads, or clear it?',
      keep: { label: 'Keep it and approve', ariaLabel: 'Approve the weave, with the note in the box as an approval note' },
      clear: { label: 'Clear it and approve', ariaLabel: 'Clear the note box, then approve the weave' }
    };
  }

  /**
   * The open angle's story as the page prints it (spec 2026-10-06 section 5): the angle open
   * (openAngleOf), the threads it tells in its order, each once (an id the weave does not hold is
   * skipped), and every other thread of the weave, left out; read from the weave as the director
   * has it, so a flip moves a thread at once. Each thread keeps its place in the weave, by which
   * the operations change it, and an entry that is no object is no thread, as lib/weave.js reads
   * the list (objectsOf). The console's reading of lib/weave.js settledAngleOf, held equal by a
   * test on one corpus, without the connections (openConnectionsOf).
   *
   * @param {Object} weave - the weave as the director has it
   * @returns {{angle: (Object|null), inStory: Array<{thread: Object, index: number}>, leftOut: Array<{thread: Object, index: number}>}}
   */
  function openStoryOf(weave) {
    var angle = openAngleOf(weave);
    var threads = [];
    asArray(weave.threads).forEach(function (thread, index) {
      if (thread !== null && typeof thread === 'object') threads.push({ thread: thread, index: index });
    });
    var inStory = [];
    angleThreadIdsOf(angle).forEach(function (id) {
      var entry = threads.filter(function (t) { return weaveIdOf(t.thread) === id; })[0];
      if (entry && inStory.indexOf(entry) === -1) inStory.push(entry);
    });
    return { angle: angle, inStory: inStory, leftOut: threads.filter(function (t) { return inStory.indexOf(t) === -1; }) };
  }

  /** The connections the page shows: each that joins two different threads of the open angle's story, in the weave's order. */
  function openConnectionsOf(weave, story) {
    var ids = new Set(story.inStory.map(function (t) { return weaveIdOf(t.thread); }).filter(Boolean));
    return asArray(weave.connections).map(function (connection, index) { return { connection: isPlainObject(connection) ? connection : {}, index: index }; })
      .filter(function (c) {
        var joins = asArray(c.connection.joins).map(function (id) { return asString(id).trim(); });
        return joins.length === 2 && joins[0] !== joins[1] && ids.has(joins[0]) && ids.has(joins[1]);
      });
  }

  /**
   * The lines the page shows, by their keys (lineKeyOf), for the weave as the director has it
   * and the questions the stop asks: "from your notes" while the weave holds it; each angle (its
   * card, and its pitch while it is open); each thread, in the story or left out by name; each
   * connection the page shows (openConnectionsOf); each question the stop asks. meetingView shows
   * exactly these, and a mark, a concern or a failure sits beside one of them or is listed apart.
   *
   * @param {Object} weave - the weave as the director has it
   * @param {Object[]} questions - the stop's questions (data.questions)
   * @returns {Set<string>}
   */
  function linesOnPage(weave, questions) {
    var keys = new Set();
    if (asString(weave.fromYourNotes).trim()) keys.add('fromYourNotes');
    var add = function (word, element) {
      var id = weaveIdOf(element);
      if (id) keys.add(word + ':' + id);
    };
    asArray(weave.angles).forEach(function (angle) { add('angle', angle); });
    asArray(weave.threads).forEach(function (thread) { add('thread', thread); });
    openConnectionsOf(weave, openStoryOf(weave)).forEach(function (c) { add('connection', c.connection); });
    questions.forEach(function (q) { add('question', q); });
    return keys;
  }

  /**
   * The concerns about the director's edits by the line of a stop's page they sit beside,
   * and those none of whose places is on the page, listed apart: one builder for the meeting
   * and the map (task 4.9). Each concern reads as its finding, past its prefix and ids, since
   * the line it sits beside names the place, and past its leading rule ids, as the desk's marks
   * read (judgeMarkText; brief 4.10d), since the director reads the line, not the rule.
   *
   * @param {Array} concerns - the stop's `concerns`, each `{text, places: [{path}]}`
   * @param {Set<string>} onPage - the keys of the lines the page shows
   * @param {function(string): (string|null)} keyOf - the line a place's path sits on
   * @returns {{byLine: Map<string, string[]>, other: string[]}}
   */
  function concernsBesideLines(concerns, onPage, keyOf) {
    var byLine = new Map();
    var other = [];
    asArray(concerns).filter(isPlainObject).forEach(function (concern) {
      var line = 'Concern: ' + judgeMarkText(concern.text);
      var keys = asArray(concern.places)
        .map(function (place) { return keyOf(place && place.path); })
        .filter(function (key) { return onPage.has(key); });
      if (keys.length === 0) other.push(line);
      keys.forEach(function (key) {
        var list = byLine.get(key) || [];
        if (list.indexOf(line) === -1) list.push(line);
        byLine.set(key, list);
      });
    });
    return { byLine: byLine, other: other };
  }

  /**
   * The words lib/hand-edit-diff.js editWhere closes a place with when the edit is a whole element or
   * a cut. A test holds the meeting's reading of a place to editWhere, through markOfEntry, for the
   * words that decide a mark (added); a cut is matched by its text (brief 4.10c).
   */
  var WHOLE_EDIT_WORDS = /(^|, )(added|cut)$/;

  /** An element of the weave in a report entry's place, as editWhere writes it: `thread "t3", line`, `angle "a1", story`. */
  var ELEMENT_PLACE = new RegExp('^(' + Object.keys(ELEMENT_WORDS).map(function (k) { return ELEMENT_WORDS[k]; }).join('|') + ') "([^"]*)"(?:, (.*))?$');

  /**
   * The line of the meeting's page an entry of the hand-edit report is on (lineKeyOf's key), and
   * the field of that line the edit is, '' for the whole line or element; read from the entry's
   * place as editWhere writes it (`fromYourNotes`, `angle "a1", story`, `thread "t3", line`,
   * `thread "t6", added`). A flip (`angle "a1", thread "t6", brought in`) is on its thread's line,
   * as its mark is (lineKeyOf), its field the angle's `threads`.
   */
  function entryLineOf(entry) {
    var where = asString(entry.where);
    var flip = FLIP_PLACE.exec(where);
    if (flip) return { key: 'thread:' + flip[2], field: 'threads' };
    var m = ELEMENT_PLACE.exec(where);
    var parts = where.split(', ');
    var rest = m ? asString(m[3]) : parts.slice(1).join(', ');
    return { key: m ? m[1] + ':' + m[2] : parts[0], field: rest.replace(WHOLE_EDIT_WORDS, '') };
  }

  /**
   * Is a mark of the round's changes about the edit a report entry names (brief 4.10b)? Text
   * the director took out that came back (a cut, a removed sentence) is about the line it came
   * back in; any other entry is about its own place: the same line, and the same field of it
   * unless one of the two is the whole line or element. Exported for the test that holds the
   * place's reading to lib/hand-edit-diff.js editWhere (brief 4.10c).
   */
  function markOfEntry(mark, entry) {
    if (entry.cut === true || entry.removed === true) {
      var became = collapsedText(entry.became);
      return became !== '' && collapsedText(mark.after).indexOf(became) !== -1;
    }
    var line = entryLineOf(entry);
    if (lineKeyOf(mark.path) !== line.key) return false;
    var field = elementFieldOf(mark.path);
    return line.field === '' || field === '' || line.field === field;
  }

  /** How a code check still failing opens its line on the meeting's page. */
  var CHECK_FAILING_PREFIX = 'Check still failing: ';

  /**
   * The code checks still failing on the weave or the map in hand (lib/meeting.js
   * meetingCheckFailures, lib/map.js mapCheckFailures), by the line of the page their place names
   * (phase 4b, briefs 1B and 1D; spec 6.3): a failure about a thread, a connection, a question or
   * a field of the weave, or about a beat, a section, a photo or a field of the map, sits beside
   * that line, and one with no place, or a place the page does not show, stays at the top of the
   * page. Each says what is wrong in the director's words, its `line` (lib/weave.js
   * weaveFindings, lib/map.js mapFindings), never the rework's `message`, which a failure stored
   * before the line existed is read by instead. One builder for the meeting and the map, as
   * concernsBesideLines is.
   *
   * @param {Array} failures - the stop's `checkFailures`, each `{type, message, line?, place?}`
   * @param {Set<string>} onPage - the keys of the lines the page shows
   * @param {function(string): (string|null)} [keyOf] - the line a place sits on: the meeting's
   *   (lineKeyOf) unless the map's is given (mapLineKeyOf)
   * @returns {{byLine: Map<string, string[]>, top: string[]}}
   */
  function failuresBesideLines(failures, onPage, keyOf) {
    var lineOf = typeof keyOf === 'function' ? keyOf : lineKeyOf;
    var byLine = new Map();
    var top = [];
    asArray(failures).filter(isPlainObject).forEach(function (failure) {
      var said = asString(failure.line).trim() || asString(failure.message).trim();
      if (!said) return;
      var line = CHECK_FAILING_PREFIX + said;
      var key = lineOf(failure.place);
      if (key === null || !onPage.has(key)) {
        top.push(line);
        return;
      }
      var list = byLine.get(key) || [];
      list.push(line);
      byLine.set(key, list);
    });
    return { byLine: byLine, top: top };
  }

  /**
   * The concerns and the marks by the line of the page they sit beside (linesOnPage), and
   * the ones no line shows, each listed with its place:
   * - `otherConcerns`: a concern none of whose places is on the page;
   * - `removed`: a line or an element the round took out (`takenOut`, by its key);
   * - `otherMarks`: any other mark whose line the page does not show, such as a question the
   *   stop does not ask;
   * - `edits`: the lines of the report's entries (`entries`, changedEditsToShow's) that no mark
   *   is about.
   * One line per edit (briefs 4.10b and 4.10c): where a mark and an entry are about the same edit
   * (markOfEntry), the entry's line, which says what the round did to the director's edit,
   * stands in the mark's place, and the entry is not listed again.
   * - Several marks about one entry, such as two fields of a thread the director added: the
   *   entry's line stands in the first mark's place, and the other marks show nothing.
   * - A mark that took an element out whole, about the entries for its fields, such as the
   *   line and the name the director gave a thread a send-back took out: one line says the
   *   element went and names each field (takenOutWithEditLine; brief 4.10d).
   * A mark of a field the page never prints, a connection's kind, is no line (isUnprintedMark).
   * Every place is named in the meeting's words, never by an id (meetingWordsOf; phase 4b,
   * brief 1B).
   *
   * @param {Object} data - the stop's payload
   * @param {Set<string>} onPage - the lines the page shows
   * @param {Object[]} entries - the report's entries the meeting shows
   * @param {Object} words - meetingWordsOf's
   */
  function besideLines(data, onPage, entries, words) {
    var placed = concernsBesideLines(data.concerns, onPage, lineKeyOf);
    var marks = new Map();
    var out = { concerns: placed.byLine, marks: marks, otherConcerns: placed.other, removed: [], otherMarks: [], takenOut: new Set(), edits: [] };
    var add = function (map, key, line) {
      var list = map.get(key) || [];
      if (list.indexOf(line) === -1) list.push(line);
      map.set(key, list);
    };
    var editLine = meetingEditLineOptions(words);
    var lines = asArray(entries).map(function (entry) { return { entry: entry, line: changedEditLine(entry, editLine), shown: false }; });
    /**
     * What the page shows in a mark's place for the entries the mark is about: each entry's line
     * the first time a mark is about it, in the report's order; when the mark took the element out
     * whole, one line for the entries that are its fields, where the first of them stands. Null
     * when no entry is about the mark, which then shows its own line.
     */
    var editLinesOf = function (mark, elementTakenOut) {
      var about = lines.filter(function (l) { return markOfEntry(mark, l.entry); });
      if (about.length === 0) return null;
      var fresh = about.filter(function (l) { return !l.shown; });
      fresh.forEach(function (l) { l.shown = true; });
      var fields = elementTakenOut ? fresh.filter(function (l) { return entryLineOf(l.entry).field; }) : [];
      var shown = [];
      fresh.forEach(function (l) {
        if (fields.indexOf(l) === -1) shown.push(l.line);
        else if (l === fields[0]) {
          shown.push(takenOutWithEditLine(mark, fields.map(function (f) { return { entry: f.entry, field: entryLineOf(f.entry).field }; }), words));
        }
      });
      return shown;
    };
    var round = isPlainObject(data.marks) ? data.marks : {};
    asArray(round.marks).filter(isPlainObject).filter(function (mark) { return !isUnprintedMark(mark); }).forEach(function (mark) {
      var key = lineKeyOf(mark.path);
      if (!asString(mark.after) && (isElementPath(mark.path) || !onPage.has(key))) {
        out.removed.push.apply(out.removed, editLinesOf(mark, isElementPath(mark.path)) || [removedLine(mark, words)]);
        if (key !== null) out.takenOut.add(key);
      } else if (onPage.has(key)) {
        (editLinesOf(mark, false) || [markLine(mark, words)]).forEach(function (line) { add(marks, key, line); });
      } else {
        out.otherMarks.push.apply(out.otherMarks, editLinesOf(mark, false) || [elsewhereLine(mark, words)]);
      }
    });
    out.edits = lines.filter(function (l) { return !l.shown; }).map(function (l) { return l.line; });
    return out;
  }

  function sameQuestion(a, b) {
    return isPlainObject(a) && ['id', 'kind', 'about', 'question', 'changes'].every(function (field) {
      return asString(a[field]).trim() === asString(b[field]).trim();
    });
  }

  /** The meeting's sections, in the spec's order (2026-10-06 section 5). */
  var MEETING_SECTIONS = ['verdict', 'fromYourNotes', 'angles', 'pitch', 'threads', 'connections'];

  /** The heading over the names of the threads the open angle leaves out (spec 5). */
  var LEFT_OUT_TITLE = 'Left out';

  /** The line to add a thread the writer missed (spec 6): its button, and its two boxes' labels and hints. */
  var ADD_THREAD = {
    button: 'Add a thread',
    labels: { name: 'The name of a thread to add', line: 'A thread to add, in one line' },
    placeholders: { name: 'What happened, with its people', line: 'The thread in one line' }
  };

  /**
   * The story meeting's page (spec 2026-10-06 sections 5 and 6; phase 4b, piece 3, brief 3B): the
   * stop's payload (4.5's, lib/meeting.js meetingCheckpointData) with the director's weave as they
   * have it, the angle their pick names open (openAngleOf), the first when they have picked none.
   * - `order`: the sections to show, in the spec's order: the verdict; "from your notes" or the
   *   thin-notes line; the angles; the open angle's pitch; its threads; where they meet. A section
   *   with nothing in it is left out.
   * - `fromYourNotes`: the line, while the weave holds it; `thinNotes`, the one line in its place
   *   when it does not, unless the round took it out: then the director's notes held a read the
   *   rework dropped, and the mark of it is listed instead.
   * - `angles`: every angle, as its card: `number`, `headline` and `gist`, `open` on the open one,
   *   whose card says `angleOpenLine` in place of its headline, which its pitch prints. `label` is
   *   its headline, or its card line when it has none, and `labels.pick` its pick control's name.
   * - `pitch`: the open angle's pitch, each of `headline`, `story`, `question`, `lands` and `ends`
   *   a line under MEETING_LINE_LABELS' heading, with `questions`, those that sit by the pitch: a
   *   question beside no thread, or beside a thread the weave does not hold (R10).
   * - `threads`: the threads in the story, in the angle's order, each its name and its line with
   *   its evidence folded (`evidence`, evidenceFoldView's) and the questions that sit beside it;
   *   the thread that carries the room's verdict `locked`, with `lockedLine` (R8). A thread the
   *   director added, at this look or an earlier one (`data.directorsThreads`), that has no
   *   evidence carries the fold's one line (`noEvidence`, MEETING_NO_EVIDENCE_LINE, or, once a writer
   *   has returned it, `data.reworkedThreads`, MEETING_NOTHING_FOUND_LINE); a thread of
   *   the writer's with none shows the check's failure beside it (`failures`) instead.
   * - `leftOut`: every other thread, by name (`names`, under its `title`), each opening in place to
   *   its line, with the questions that sit beside them.
   * - `add`: the line to add a thread (ADD_THREAD).
   * - `connections`: each connection between two threads in the story, its line, its evidence
   *   folded; its kind stays underneath, unprinted.
   * - `questions`: every question the stop asks, in its order, each the same object it sits as.
   * - each line the page shows (linesOnPage) carries the concerns about the director's edit on
   *   it, the marks of what the round's passes changed on it, and the code checks still failing
   *   whose place it is (`failures`, failuresBesideLines; spec 9.3); an angle's sit on its card,
   *   or on the pitch while it is open.
   * - the round's lines: `didNotRun` (by what the note box holds; task 4.5c), `checkFailures`
   *   (the failures with no place on the page), `changedEdits` (changedEditsToShow's entries no
   *   mark stands for; task 4.10), `kept` (editsStandLine; brief 4.10b), `marked` and the marks no
   *   line shows (`removed`, `otherMarks`), and the concerns no line shows (`otherConcerns`).
   * Every element keeps piece 1's convention: `label`, its words as the page prints them, and
   * `labels`, its controls' names and its fold's title, keyed by the control. No line or label
   * names an element by its id (meetingWordsOf); each element's `id` and `index` stay on its view
   * for the operations, which change the weave by them.
   *
   * The stop always holds a weave (the integrator, at 4.11's merge): the arc writer writes one
   * or throws, and only a thread on an old shape holds none, which the server refuses wherever it
   * sits and the console shows the server's message for (oldThreadView).
   *
   * @param {Object} data - the stop's payload
   * @param {Object} weave - the weave as the director has it (meetingDraftOf, then their changes)
   * @param {string} [note] - the meeting's note box (meetingNoteOf, then what they type)
   * @returns {Object}
   */
  function meetingView(data, weave, note) {
    var d = isPlainObject(data) ? data : {};
    var shown = meetingWeaveOf(d.weave);
    var round = isPlainObject(d.marks) ? d.marks : {};
    var words = meetingWordsOf(weave, shown, round.marks);
    var stopQuestions = asArray(d.questions).filter(isPlainObject);
    var onPage = linesOnPage(weave, stopQuestions);
    var beside = besideLines(d, onPage, changedEditsToShow(d.handEditReport), words);
    var failing = failuresBesideLines(d.checkFailures, onPage);
    var at = function (key) {
      return { concerns: beside.concerns.get(key) || [], marks: beside.marks.get(key) || [], failures: failing.byLine.get(key) || [] };
    };
    var none = { concerns: [], marks: [], failures: [] };
    var line = function (key, text) {
      var b = key ? at(key) : none;
      return { text: asString(text), concerns: b.concerns, marks: b.marks, failures: b.failures };
    };
    var story = openStoryOf(weave);
    var open = story.angle;
    var openId = open ? weaveIdOf(open) : '';
    var held = new Set(asArray(weave.threads).map(weaveIdOf).filter(Boolean));

    var draftQuestions = asArray(weave.questions);
    var cursor = 0;
    var questions = stopQuestions.map(function (q, n) {
      var index = -1;
      for (var i = cursor; i < draftQuestions.length; i += 1) {
        if (sameQuestion(draftQuestions[i], q)) { index = i; break; }
      }
      if (index !== -1) cursor = index + 1;
      var asked = index !== -1 ? draftQuestions[index] : q;
      var id = asString(q.id).trim();
      var kind = asString(q.kind);
      var about = asString(q.about);
      var b = id ? at('question:' + id) : none;
      return {
        key: 'question-' + n,
        index: index,
        id: id,
        kind: kind,
        kindLabel: hasOwn(WRITER_QUESTION_KIND_LABELS, kind) ? WRITER_QUESTION_KIND_LABELS[kind] : '',
        about: about,
        question: asString(q.question),
        changes: asString(q.changes),
        answer: asString(asked[WEAVE_ANSWER_KEY]),
        // R10: beside a thread the weave holds, or by the pitch.
        thread: held.has(asString(asked.thread).trim()) ? asString(asked.thread).trim() : '',
        label: 'Question about ' + about.trim(),
        labels: { answer: 'Your answer: ' + asString(q.question) },
        marks: b.marks,
        failures: b.failures
      };
    });
    var questionsBeside = function (id) {
      return questions.filter(function (q) { return id !== '' && q.thread === id; });
    };

    var shownThreads = shown ? asArray(shown.threads) : [];
    var directorsEarlier = new Set(asArray(d.directorsThreads).map(function (id) { return asString(id).trim(); }).filter(Boolean));
    var reworked = new Set(asArray(d.reworkedThreads).map(function (id) { return asString(id).trim(); }).filter(Boolean));
    var threadRepeats = new Set(repeatedIdsOf(shownThreads));
    var connectionRepeats = new Set(repeatedIdsOf(shown ? shown.connections : []));
    var threadView = function (entry, inStory) {
      var thread = entry.thread;
      var id = weaveIdOf(thread);
      var b = id ? at('thread:' + id) : none;
      var evidence = evidenceFoldView(thread.evidence, d.evidenceIndex);
      var added = entry.index >= shownThreads.length;
      var label = threadLabelOf(thread);
      var locked = inStory && thread.verdict === true;
      return {
        key: 'thread-' + entry.index,
        index: entry.index,
        id: id,
        name: asString(thread.name),
        line: asString(thread.line),
        label: label,
        labels: {
          fold: evidenceFoldLabel(label),
          flip: (inStory ? 'Leave out of the story: ' : 'Bring into the story: ') + label,
          name: 'The name of the thread ' + label,
          line: 'The line of the thread ' + label,
          takeOut: 'Take out the thread you added: ' + label
        },
        inStory: inStory,
        verdict: thread.verdict === true,
        locked: locked,
        lockedLine: locked ? VERDICT_LOCK_LINE : '',
        added: added,
        repeatedId: id !== '' && threadRepeats.has(id),
        evidence: evidence,
        noEvidence: evidence.length === 0 && (added || directorsEarlier.has(id))
          ? (!added && reworked.has(id) ? MEETING_NOTHING_FOUND_LINE : MEETING_NO_EVIDENCE_LINE)
          : '',
        questions: questionsBeside(id),
        concerns: b.concerns,
        marks: b.marks,
        failures: b.failures
      };
    };
    var threads = story.inStory.map(function (entry) { return threadView(entry, true); });
    var leftOutThreads = story.leftOut.map(function (entry) { return threadView(entry, false); });
    var besideAThread = new Set(threads.concat(leftOutThreads).map(function (t) { return t.id; }).filter(Boolean));

    // A pick names an angle by its id, so it opens the first angle under that id, and the gate
    // refuses a pick of an id the writer repeated unless it is the angle the meeting opened
    // (meetingPickProblem, lib/meeting.js pickProblems). Every other angle under such an id is
    // `repeatedId`, and its card picks nothing (3 fix A).
    var shownAngles = shown ? asArray(shown.angles) : [];
    var angleRepeats = new Set(repeatedIdsOf(shownAngles));
    var shownOpenAt = shown ? shownAngles.indexOf(openAngleOf(shown)) : -1;
    var angles = asArray(weave.angles).map(function (element, index) {
      var angle = isPlainObject(element) ? element : {};
      var id = weaveIdOf(angle);
      var isOpen = element === open;
      var label = asString(angle.headline).trim() || asString(angle.gist).trim();
      var b = id && !isOpen ? at('angle:' + id) : none;
      return {
        key: 'angle-' + index,
        index: index,
        id: id,
        number: index + 1,
        headline: asString(angle.headline),
        gist: asString(angle.gist),
        label: label,
        labels: { pick: 'Open the angle ' + (label ? '"' + label + '"' : String(index + 1)) },
        open: isOpen,
        repeatedId: id !== '' && angleRepeats.has(id) && index !== shownOpenAt,
        concerns: b.concerns,
        marks: b.marks,
        failures: b.failures
      };
    });
    var pitch = null;
    if (open) {
      var pb = openId ? at('angle:' + openId) : none;
      var openCard = angles.filter(function (a) { return a.open; })[0];
      pitch = {
        id: openId,
        index: openCard.index,
        number: openCard.number,
        label: openCard.label,
        headline: line(null, open.headline),
        story: line(null, open.story),
        question: line(null, open.question),
        lands: line(null, open.lands),
        ends: line(null, open.ends),
        questions: questions.filter(function (q) { return !besideAThread.has(q.thread); }),
        concerns: pb.concerns,
        marks: pb.marks,
        failures: pb.failures
      };
    }

    var connections = openConnectionsOf(weave, story).map(function (c) {
      var connection = c.connection;
      var id = weaveIdOf(connection);
      var b = id ? at('connection:' + id) : none;
      var joins = words.joinsText(connection.joins);
      var said = asString(connection.line).trim();
      var named = joins ? 'the connection between ' + joins : 'the connection "' + said + '"';
      return {
        key: 'connection-' + c.index,
        index: c.index,
        id: id,
        line: asString(connection.line),
        joins: joins,
        label: said,
        labels: {
          fold: evidenceFoldLabel(named)
        },
        repeatedId: id !== '' && connectionRepeats.has(id),
        evidence: evidenceFoldView(connection.evidence, d.evidenceIndex),
        concerns: b.concerns,
        marks: b.marks,
        failures: b.failures
      };
    });

    var fromYourNotes = onPage.has('fromYourNotes') ? line('fromYourNotes', weave.fromYourNotes) : null;
    var thinNotes = fromYourNotes || beside.takenOut.has('fromYourNotes') ? '' : THIN_NOTES_LINE;
    var present = {
      fromYourNotes: fromYourNotes !== null || thinNotes !== '',
      angles: angles.length > 0,
      pitch: pitch !== null,
      connections: connections.length > 0
    };
    return {
      order: MEETING_SECTIONS.filter(function (section) { return !hasOwn(present, section) || present[section]; }),
      verdict: meetingVerdictView(d.accusation),
      fromYourNotes: fromYourNotes,
      thinNotes: thinNotes,
      angles: angles,
      angleOpenLine: ANGLE_OPEN_LINE,
      pitch: pitch,
      evidenceTitle: EVIDENCE_FOLD_TITLE,
      threads: threads,
      leftOut: {
        title: LEFT_OUT_TITLE,
        names: leftOutThreads.map(function (t) { return t.label; }).filter(Boolean).join(' · '),
        threads: leftOutThreads,
        questions: questions.filter(function (q) { return leftOutThreads.some(function (t) { return t.id !== '' && t.id === q.thread; }); })
      },
      add: ADD_THREAD,
      connections: connections,
      questions: questions,
      repeatedIdHint: angles.some(function (a) { return a.repeatedId; }) || threads.concat(leftOutThreads).some(function (t) { return t.repeatedId; }) || connections.some(function (c) { return c.repeatedId; }) ? REPEATED_ID_HINT : '',
      checkFailures: failing.top,
      changedEdits: beside.edits,
      kept: editsStandLine(d.handEditReport),
      didNotRun: didNotRunLine(d.roundDidNotRun, note),
      marked: markedLine(d.marks),
      removed: beside.removed,
      otherMarks: beside.otherMarks,
      otherConcerns: beside.otherConcerns
    };
  }

  /** The standing notes, folded under the meeting's note box: the fold every stop reads (standingNotesView). */
  function meetingStandingNotes(gateNotes, labels) {
    return standingNotesView(gateNotes, labels);
  }

  /**
   * What a rollback to `target` costs, for the rollback panel: going back to the meeting or to
   * the map reopens it as the director left it, with no model call (R9; the map's line, task
   * 4.14b); every other point clears from there.
   */
  function rollbackWarningLine(target) {
    if (target === MEETING_STOP) return MEETING_ROLLBACK_LINE;
    if (target === MAP_STOP) return MAP_ROLLBACK_LINE;
    return ROLLBACK_WARNING;
  }

  // ── The map on screen (phase 4, task 4.9; spec 5.2 and 5.3) ────────────────
  //
  // The outline stop is the map: at most 450 words, aiming for 300 (phase 4b), which the
  // director reads in minutes and edits line by line. Outline.js renders it from mapView and changes it only through the editors and
  // moves of console/outline-edit-logic.js; it sends only mapPayload's payloads, 4.6's
  // `{outline: 'approve' | 'send-back', map, note}` (lib/map.js mapResume), each held first to
  // mapProblems, the gate's decisions. What the director types is sent as typed. The slots, their
  // order and their labels are the theme's, which the payload carries (`mapSlots`), so nothing
  // here names a theme's slots. Whether a value is a map, a beat's id and card, where each beat
  // and photo sits and what the map repeats, the page takes from outline-edit-logic.js's
  // readers, the ones its client gate reads.

  /** The map's stop type: the stop types keep their names (R3). */
  var MAP_STOP = 'outline';

  /** The map's two actions. A copy of lib/map.js MAP_ACTIONS; a test holds the two equal. */
  var MAP_ACTIONS = ['approve', 'send-back'];

  /** The source a change to the weave names for the meeting's note: a copy of lib/map.js MEETING_NOTE_SOURCE (a test holds the two equal). */
  var MAP_NOTE_SOURCE = 'note';

  /** How many cards the article carries (C9): a copy of lib/map.js MAP_CARDS (a test holds the two equal). */
  var MAP_CARDS = { min: 3, max: 5 };

  /**
   * The mark on a move's card whose evidence prints as a card (spec 4.2; piece 4, R11: "Card" in
   * place of "(card)"): the page prints no kind and no document id.
   */
  var MAP_CARD_MARK = 'Card';

  /**
   * The mark on the piece of a move's evidence that prints as its card, in what's behind a selected
   * card (piece 4; spec 2026-10-07 section 5): the flagged piece of a move marked as a card.
   */
  var MAP_PRINTS_AS_CARD = 'Prints as a card';

  /**
   * The map's page in the spec's order (piece 4; spec 2026-10-07 section 4), as mapView's `order`
   * names its parts, which lib/stop-pages.js and Outline.js both follow: the round's lines, the
   * counts (`tally`), the settled story with the gap note, the threads (`legend`), the top of the
   * article, the board's columns (`sections`), the tray (`leftOut`), the dropped sections and the
   * map's changes to fit the meeting. The note box, the standing notes and the trace follow them.
   */
  var MAP_SECTIONS = ['round', 'tally', 'settledStory', 'legend', 'top', 'sections', 'leftOut', 'dropped', 'weaveChanges'];

  /** The legend's title and its control that clears a thread picked (spec 4). */
  var MAP_LEGEND_TITLE = 'The threads';
  var MAP_SHOW_ALL = 'Show all';

  /**
   * How many tones the dots cycle through (R4): a thread's tone is its place in the legend, 1 to
   * MAP_TONES and repeating; 0 is the grey tone, for a thread outside the story. The console's
   * light and dark tokens give each tone its colour.
   */
  var MAP_TONES = 8;

  /** A column whose section prints no heading. */
  var MAP_NO_HEADING_LINE = 'No heading printed';

  /**
   * The top of the article when the map has no top photo (fix H3): a photo dropped from the top onto
   * a move or a column leaves none, and the article then prints no hero.
   */
  var MAP_NO_TOP_PHOTO_LINE = 'No top photo: the article prints none. Drag a photo here, or select one and move it to the top of the article, to set it.';

  /** A column the director emptied: the gate drops it when the map is sent (outline-edit-logic.js dropEmptiedSections). */
  var MAP_EMPTIED_COLUMN_LINE = 'Empty: this section drops from the article when you send the map.';

  /** The board's one control that opens or closes every summary (spec 4). */
  var MAP_SUMMARY_TOGGLE = { open: 'Open every summary', close: 'Close every summary' };

  /**
   * The words the board's controls show (piece 4, spec 5 and 6; fix B1), which Outline.js prints as
   * they are: a selected card's controls, a selected move's in the tray, a selected photo's (the
   * top photo's move into a section among them), the add line at a column's foot, the move's
   * editor and the expected length's editor (fix D1). Each control's accessible name holds the
   * words it shows, in their order, with the move or the photo it acts on named in place of "it"
   * (WCAG 2.5.3, label in name; fix B2): mapView's `labels` name a move's and a photo's
   * controls, and the add line's names are here.
   */
  var MAP_CONTROLS = {
    card: {
      editWords: 'Edit the words',
      moveUp: 'Move up',
      moveDown: 'Move down',
      moveTo: 'Move to another section…',
      photoBeside: 'Put a photo beside it…',
      leaveOut: 'Leave it out',
      takeOut: 'Take it out'
    },
    tray: { bringBack: 'Bring it back into…' },
    photo: { placeBeside: 'Put it beside a move…', moveTo: 'Move to…', topMoveTo: 'Move into a section…' },
    addLine: {
      open: '+ Add a move',
      move: 'The move, in a few plain words',
      moveLabel: 'The move to add, in a few plain words',
      players: 'Its players, separated by commas',
      playersLabel: "The move's players, separated by commas",
      add: 'Add the move'
    },
    beatEditor: {
      move: 'The move',
      moveHint: 'A few plain words of the story.',
      synopsis: 'Summary',
      synopsisHint: 'One sentence: what the article tells at this move.',
      players: 'Players it shows',
      playersHint: 'Names, separated by commas.'
    },
    lengthEditor: {
      label: 'Expected length, in words',
      hint: 'A whole number. The article writer aims at it, so set it lower when you leave moves out.'
    }
  };

  /**
   * The fold of a beat the director added on the map while it carries no evidence: the article
   * writer finds its evidence (spec 5.3). A beat of the writer's with none is a check's failure,
   * which the page shows beside it instead.
   */
  var MAP_NO_EVIDENCE_LINE = 'Nothing yet: the article writer finds the evidence for it.';

  /** The line under the settled story: the story is the meeting's, and going back there costs no model call (R9). */
  var STORY_HINT = 'The story was settled at the story meeting. To change it, go back to the meeting: it reopens as you left it, with no model call.';

  /** Why a line's controls are off, while any are: no move or edit can find a line under the writer's repeat. */
  var MAP_LOCKED_HINT = 'The writer gave one id to more than one beat, or placed a photo twice, so the map cannot move or edit those lines: a send-back gives each its own place.';

  /** The top photo's place as a photo's move control names it, and a photo's place by itself in its section. */
  var TOP_PHOTO_LABEL = 'The top of the article';
  var BY_ITSELF_LABEL = 'By itself, with its people';

  /** How much of a beat's move a "beside" choice shows. */
  var BESIDE_TEXT_LENGTH = 60;

  /**
   * The line beside a photo the map places that the director left out of the article since,
   * such as one deleted at the desk (task 4.14b): the article reads the map without it.
   */
  var LEFT_OUT_PHOTO_LINE = 'You left this photo out of the article, so it does not print.';

  /**
   * A dropped section's line on the page when the director emptied it: the reason the gate
   * writes for the writers (outline-edit-logic.js EMPTIED_SECTION_REASON), in the director's
   * own words (task 4.14b).
   */
  var EMPTIED_SECTION_LINE = 'You emptied this section on the map.';

  /**
   * How a change to the weave names its source (task 4.14b): the meeting's change by the place
   * the meeting names it by (the payload's `meetingChanges`, `{id, place}`), the meeting's note
   * by its name, and any other source as a change at the meeting, by no id, since the meeting
   * shows none.
   */
  var WEAVE_CHANGE_NOTE = 'Your note at the meeting';
  var WEAVE_CHANGE_UNNAMED = 'Your change at the meeting';

  /** The theme's slots the payload carries (`mapSlots`), each `{key, label}`. */
  function slotsOf(data) {
    return asArray(isPlainObject(data) ? data.mapSlots : null)
      .filter(function (slot) { return isPlainObject(slot) && typeof slot.key === 'string'; })
      .map(function (slot) { return { key: slot.key, label: asString(slot.label) || slot.key }; });
  }

  /** A slot's label on the page: the theme's, or the slot's own key for one the theme does not name. */
  function slotLabelOf(key, slots) {
    var found = slots.filter(function (slot) { return slot.key === key; })[0];
    return found ? found.label : (asString(key) || 'a section');
  }

  /** A slot's words in a place a diff or a report names (`section "theStory"`): its label. */
  function slotWords(text, slots) {
    return asString(text)
      .replace(/dropped slot "([^"]*)"/g, function (_, key) { return 'dropped section ' + slotLabelOf(key, slots); })
      .replace(/section "([^"]*)"/g, function (_, key) { return slotLabelOf(key, slots); });
  }

  /** A whole number with its thousands marked: 1,400. */
  function withCommas(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** The text a "beside" choice shows: up to BESIDE_TEXT_LENGTH characters. */
  function shortText(text) {
    var t = asString(text).trim();
    return t.length > BESIDE_TEXT_LENGTH ? t.slice(0, BESIDE_TEXT_LENGTH - 1) + '…' : t;
  }

  /**
   * The map as the stop showed it, the version the meeting's rule keys (stopVersion): what the
   * director's map and note are held under in the map's pending slot.
   *
   * @param {Object} data - the stop's payload
   * @returns {string}
   */
  function mapVersion(data) {
    var d = isPlainObject(data) ? data : {};
    return stopVersion(d.outline, d);
  }

  /** The map's pendingEdits slot: the director's map, under the version it was made on. */
  function mapPendingSlot(data, map) {
    return { version: mapVersion(data), map: map };
  }

  function mapSlotFits(data, pending) {
    return isPlainObject(pending) && pending.version === mapVersion(data);
  }

  /**
   * The map the screen opens on: the director's, from their pending slot, while the stop shows
   * the version they made it on; a copy of the stop's map otherwise; null when the stop holds
   * no map.
   *
   * @param {Object} data - the stop's payload
   * @param {*} pending - the map's pendingEdits slot
   * @returns {Object|null}
   */
  function mapDraftOf(data, pending) {
    var editLogic = outlineEditLogic();
    if (mapSlotFits(data, pending) && editLogic.isMapValue(pending.map)) return cloneJson(pending.map);
    var d = isPlainObject(data) ? data : {};
    return editLogic.isMapValue(d.outline) ? cloneJson(d.outline) : null;
  }

  /** The map's note box on (re)mount: the director's note, under the same rule as their map. */
  function mapNoteOf(data, pending, pendingNote) {
    return mapSlotFits(data, pending) && typeof pendingNote === 'string' ? pendingNote : '';
  }

  /**
   * The map's own lines as the page names them, by the field a validator's path or a report's place
   * names (R11: never by the field's name): mapPathWords and mapEditLineOptions read them.
   */
  var MAP_LINE_WORDS = {
    headline: 'the headline', deck: 'the deck', topPhoto: 'the top photo', expectedLength: 'the expected length',
    gapNote: 'the gap note', weaveChanges: "the map's changes to the weave"
  };

  /**
   * A report's place that opens on one of the map's own lines by its field's name (`expectedLength`,
   * `weaveChanges, cut`), in the page's words; a place that opens on a word already ("headline",
   * "gap note") stays as it is.
   */
  function mapLineWords(where) {
    return asString(where).replace(/^[a-z]+[A-Z][A-Za-z]*(?=,|$)/, function (field) {
      return hasOwn(MAP_LINE_WORDS, field) ? MAP_LINE_WORDS[field] : field;
    });
  }

  /** The field of a beat that holds its summary (piece 4, R1), which the page names "the summary of" its move (R11). */
  var MAP_SUMMARY_FIELD = 'synopsis';

  /** A place in the map, as the validator's path names it, in the words the page uses. */
  function mapPathWords(path, map, slots) {
    var parts = asString(path).split('/').filter(Boolean);
    var m = isPlainObject(map) ? map : {};
    var tail = function (rest) { return rest.length > 0 ? ', ' + rest.join(', ') : ''; };
    // Phase 4b (brief 1D; spec 9): a beat by its move, never by its id.
    var beatName = function (beat, index) {
      var move = isPlainObject(beat) ? asString(beat.move).trim() : '';
      return move ? '"' + shortText(move) + '"' : String(Number(index) + 1);
    };
    // Piece 4 (R11): a beat's summary as the summary of its move, never by the field's name.
    var beatPlace = function (beat, index, rest) {
      return rest[0] === MAP_SUMMARY_FIELD
        ? 'the summary of the move ' + beatName(beat, index) + tail(rest.slice(1))
        : 'beat ' + beatName(beat, index) + tail(rest);
    };
    if (parts.length === 0) return 'the map';
    if (hasOwn(MAP_LINE_WORDS, parts[0])) return MAP_LINE_WORDS[parts[0]];
    if (parts[0] === 'dropped') {
      var dropped = asArray(m.dropped)[Number(parts[1])];
      return 'the dropped section ' + slotLabelOf(isPlainObject(dropped) ? dropped.slot : '', slots) + tail(parts.slice(2));
    }
    if (parts[0] === 'leftOut') return 'left out, ' + beatPlace(asArray(m.leftOut)[Number(parts[1])], parts[1], parts.slice(2));
    if (parts[0] === 'sections') {
      var section = asArray(m.sections)[Number(parts[1])];
      var label = isPlainObject(section) ? slotLabelOf(section.slot, slots) : 'a section';
      if (parts[2] === 'beats') {
        return label + ', ' + beatPlace(asArray(isPlainObject(section) ? section.beats : null)[Number(parts[3])], parts[3], parts.slice(4));
      }
      if (parts[2] === 'photos') {
        var photo = asArray(isPlainObject(section) ? section.photos : null)[Number(parts[3])];
        return label + ', photo ' + (isPlainObject(photo) && asString(photo.filename) ? photo.filename : String(Number(parts[3]) + 1)) + tail(parts.slice(4));
      }
      return label + tail(parts.slice(2));
    }
    return asString(path);
  }

  /**
   * What the gate would refuse in the map as the director left it, as one line in the words
   * the page uses, or null for a map it takes (the integrator's ruling 3): the map's client
   * gate, console/outline-edit-logic.js validateOutlineShape, which decides as lib/map.js
   * directorMapProblems does (a test holds the decisions equal), given the theme's slots and
   * the map the stop showed, whose repeats are the writer's. The validator reads the map shown
   * through shownMapOf, as the gate and mapView do, so a value that is no map is no map shown
   * (tasks 4.6c and 4.6e). It reads the photos the director left out (`leftOutPhotos`), as the
   * gate does, so a left-out photo their changes put at the top is refused here too (task 4.14b).
   *
   * @param {*} map - the map as the director left it
   * @param {Object} data - the stop's payload: the map it showed, the theme's slots and the photos left out
   * @returns {string|null}
   */
  function mapProblems(map, data) {
    var d = isPlainObject(data) ? data : {};
    var editLogic = outlineEditLogic();
    var result = editLogic.validateOutlineShape(map, null, d.mapSlots, d.outline, asArray(d.leftOutPhotos));
    if (result.valid) return null;
    var slots = slotsOf(d);
    var text = result.errors.map(function (error) {
      return mapPathWords(error.path, map, slots) + ' ' + error.message;
    }).join('; ');
    return 'The map cannot be sent yet: ' + text + (/[.!?]$/.test(text) ? '' : '.');
  }

  /**
   * One of the map's payloads, 4.6's (lib/map.js mapResume): `{outline: 'approve' | 'send-back',
   * map, note?}`. Both carry a copy of the map as the director left it, edited or not, which
   * is what the article writer reads next; a send-back carries its note, and builds nothing
   * without one. The note goes as typed, when it is not blank.
   *
   * @param {string} action - 'approve' or 'send-back'
   * @param {Object} map - the map as the director left it
   * @param {string} note - the map's note box
   * @returns {Object|null}
   */
  function mapPayload(action, map, note) {
    if (MAP_ACTIONS.indexOf(action) === -1) {
      throw new Error('mapPayload: the map takes approve or send-back, not ' + String(action));
    }
    if (!outlineEditLogic().isMapValue(map)) return null;
    var typed = typeof note === 'string' ? note : '';
    var hasNote = typed.trim().length > 0;
    if (action === 'send-back' && !hasNote) return null;
    var payload = { outline: action, map: cloneJson(map) };
    if (hasNote) payload.note = typed;
    return payload;
  }

  /** The map's two buttons: Approve, and Send back on its note in two clicks (sendBackButton). */
  function mapButtons(note, sendBackArmed) {
    return {
      approve: { label: 'Approve', ariaLabel: 'Approve the map as you left it, with your note' },
      sendBack: sendBackButton(sendBackArmed, note, 'map')
    };
  }

  /**
   * The counts of the map as the director has it, rebuilt through mapTally
   * (console/outline-edit-logic.js), the function the map checks count with, on the inputs the
   * stop's payload carries (task 4.6c; it sends no count of its own, task 4.6d): the session's
   * roster with the canon's full names (`roster`, lib/map.js mapRosterOf) and the photos kept
   * for the article (`keptPhotos`). So "In no move" lists the players in roster order whatever
   * the director moved, and a beat that names a player by a full name places them as on the
   * server.
   *
   * @param {Object} data - the stop's payload, with its `roster` and `keptPhotos`
   * @param {Object} map - the map as the director has it
   * @returns {{everyone: Array, unplaced: string[], raised: string[], cards: number, photos: {placed: number, of: number}}}
   */
  function mapTallyOf(data, map) {
    var d = isPlainObject(data) ? data : {};
    return outlineEditLogic().mapTally(map, { roster: asArray(d.roster), keptPhotos: asArray(d.keptPhotos) });
  }

  /**
   * The line on the map's page a place sits on (a path as lib/hand-edit-diff.js writes it:
   * `sections[#theStory].beats[#b2].move`, `leftOut[#b4]`, `topPhoto`): `beat:<id>` (in a
   * section or in left out), `photo:<photoKey>`, `section:<slot>`, `dropped:<slot>`, one of the
   * map's own lines (`headline`, `deck`, `expectedLength`, `weaveChanges`, `gapNote`,
   * `topPhoto`), or null for a place no line shows.
   *
   * @param {string} path
   * @returns {string|null}
   */
  function mapLineKeyOf(path) {
    var p = asString(path);
    var m = /^sections\[#([^\]]*)\]\.beats\[#([^\]]*)\]/.exec(p);
    if (m) return 'beat:' + m[2];
    m = /^sections\[#([^\]]*)\]\.photos\[#([^\]]*)\]/.exec(p);
    if (m) return 'photo:' + outlineEditLogic().photoKey(m[2]);
    m = /^sections\[#([^\]]*)\]/.exec(p);
    if (m) return 'section:' + m[1];
    m = /^leftOut\[#([^\]]*)\]/.exec(p);
    if (m) return 'beat:' + m[1];
    m = /^dropped\[#([^\]]*)\]/.exec(p);
    if (m) return 'dropped:' + m[1];
    m = /^(headline|deck|expectedLength|weaveChanges|gapNote|topPhoto)(?![A-Za-z])/.exec(p);
    return m ? m[1] : null;
  }

  /**
   * The lines the map's page shows, by their keys (mapLineKeyOf): each beat and photo where the map
   * places it. A value that is no map (isMapValue) places nothing, so the page shows its own lines
   * alone (fix E3).
   */
  function mapLinesOnPage(given) {
    var editLogic = outlineEditLogic();
    var map = editLogic.shownMapOf(given) || {};
    var keys = new Set(['headline', 'deck', 'expectedLength', 'weaveChanges']);
    if (isPlainObject(map.gapNote)) keys.add('gapNote');
    asArray(map.sections).filter(isPlainObject).forEach(function (section) { keys.add('section:' + section.slot); });
    editLogic.mapPhotoPlacements(map).forEach(function (placement) {
      keys.add(placement.at === editLogic.MAP_TOP_PHOTO ? 'topPhoto' : 'photo:' + editLogic.photoKey(placement.filename));
    });
    editLogic.mapBeatPlacements(map).forEach(function (placement) { keys.add('beat:' + placement.id); });
    asArray(map.dropped).filter(isPlainObject).forEach(function (entry) { keys.add('dropped:' + entry.slot); });
    return keys;
  }

  /**
   * The beat a report entry's place names, the one reader of it (piece 4, brief 4C): lib/hand-edit-
   * diff.js mapEditWhere writes a beat as `beat "<id>"`, followed by `, move` when the edit is on its
   * move (`section "lede", beat "b4", move`, `section "lede", the summary of beat "b4"`, `left out,
   * beat "b2", struck from section "lede"`). Returns `{id, text, index}`, the id, the text naming
   * the beat (its move field with it) and where that text starts, or null for a place that names
   * no beat, such as a section's order or a photo's. mapView reads an entry's beat through it, and
   * beatWords the words it rewrites; a test holds it to the places the server writes.
   *
   * @param {*} where - an entry's place
   * @returns {{id: string, text: string, index: number}|null}
   */
  function beatOfPlace(where) {
    var m = /beat "([^"]*)"(?:, move\b)?/.exec(asString(where));
    return m ? { id: m[1], text: m[0], index: m.index } : null;
  }

  /**
   * A beat's place as a diff or a report names it (`beat "b4"`, `beat "b4", move`), in the words
   * the map's page uses (beatOfPlace): the beat's move, found on the map (phase 4b, brief 1D; spec
   * 9: the tags leave the page), which names the move field too. A beat the map no longer holds
   * reads by `title`, the title the report entry carries for it (lib/hand-edit-diff.js
   * reportAfterPass goneBeatTitle: fix C2, a move the director's order named that a pass removed
   * from the map; fix F1, a move a move edit of theirs placed that a pass removed), or as "a move"
   * with none. So `the summary of beat "b4"` reads as the summary of the move (R11).
   */
  function beatWords(text, map, title) {
    var t = asString(text);
    var named = beatOfPlace(t);
    if (!named) return t;
    var beat = outlineEditLogic().beatWithId(map, named.id);
    var move = isPlainObject(beat) ? asString(beat.move).trim() : asString(title).trim();
    var words = move ? 'the move "' + shortText(move) + '"' : 'a move';
    return t.slice(0, named.index) + words + t.slice(named.index + named.text.length);
  }

  /**
   * How the map phrases an edit a rework changed (changedEditLine, every stop's builder): its
   * place as the report names it, with each slot under its label, each beat by its move
   * (beatWords), the map's own lines by their names (mapLineWords) and no edit id, since the map
   * shows none, so a summary edit reads as the summary of the move and an order edit as the order
   * of the section's moves (piece 4, R11); a moved element is a move or a photo (fix H1),
   * and a section it went to reads by its label; text that came back is still on the map (task
   * 4.10).
   *
   * @param {Array} slots - slotsOf(data)
   * @param {*} [map] - the map the page shows, which names each beat by its move
   */
  function mapEditLineOptions(slots, map) {
    return {
      place: function (entry) { return capitalized(beatWords(slotWords(mapLineWords(asString(entry.where) || scopeLabel(entry.scope)), slots), map, entry.title)); },
      valueText: function (text) {
        // Fix H2: left out reads as the tray the page names it by.
        if (asString(text) === 'left out') return scopeLabel('leftOut');
        var m = /^section "([^"]*)"$/.exec(asString(text));
        return m ? slotLabelOf(m[1], slots) : text;
      },
      thing: function (entry) { return /(^|, )photo "/.test(asString(entry.where)) ? 'photo' : 'move'; },
      stillIn: 'on the map'
    };
  }

  /**
   * What the line says of a section the director emptied that an automatic pass put back (task
   * 4.14b, fix round 1): code takes out only an empty one (lib/hand-edit-diff.js settleEdits), so
   * the section holds what the pass put in it, for the director to empty again.
   */
  var EMPTIED_SECTION_STILL_ON_MAP = 'It is still on the map: empty it again if it should go.';

  /**
   * The slot a report entry names as one of the two edits a section the director emptied leaves
   * on the map (task 4.14b, fix round 1), as lib/hand-edit-diff.js mapEditWhere names them: the
   * section's cut (`section "<slot>", cut`) or its dropped slot (`dropped slot "<slot>"`); null for
   * any other entry. The map has no section delete, so a section's cut is always such a drop.
   *
   * @param {Object} entry - a report entry
   * @param {'cut'|'dropped'} kind - which of the two edits
   * @returns {string|null}
   */
  function emptiedSectionSlotOf(entry, kind) {
    var where = asString(entry.where);
    var m = kind === 'cut' ? /^section "([^"]*)", cut$/.exec(where) : /^dropped slot "([^"]*)"$/.exec(where);
    if (!m || (kind === 'cut' && entry.cut !== true)) return null;
    return m[1];
  }

  /**
   * The lines for the edits a pass changed that the map's page shows (changedEditsToShow), each by
   * changedEditLine with the map's places (mapEditLineOptions), except a section the director
   * emptied that a pass put back (task 4.14b, fix round 1): one line, the section's, in the words
   * of its dropped line ("You emptied this section on the map."), in place of the line each of the
   * drop's two edits gives, its cut come back and its dropped slot gone. After an automatic pass
   * it asks the director to empty the section again; after a send-back it gives the rework's
   * reasons for both edits.
   *
   * @param {*} report - the stop's handEditReport
   * @param {Array} slots - slotsOf(data)
   * @param {*} [map] - the map the page shows, which names each beat by its move
   * @returns {string[]}
   */
  function mapChangedEditLines(report, slots, map) {
    var entries = changedEditsToShow(report);
    var lineOptions = mapEditLineOptions(slots, map);
    var keyOf = function (slot, entry) { return slot + '|' + String(entry.pass); };
    var cuts = {};
    entries.forEach(function (entry) {
      var slot = emptiedSectionSlotOf(entry, 'cut');
      if (slot !== null) cuts[keyOf(slot, entry)] = true;
    });
    var gone = {};
    var shown = entries.filter(function (entry) {
      var slot = emptiedSectionSlotOf(entry, 'dropped');
      if (slot === null || !cuts[keyOf(slot, entry)]) return true;
      gone[keyOf(slot, entry)] = entry;
      return false;
    });
    return shown.map(function (entry) {
      var slot = emptiedSectionSlotOf(entry, 'cut');
      if (slot === null) return changedEditLine(entry, lineOptions);
      var drop = gone[keyOf(slot, entry)];
      var pass = passWords(drop ? [entry, drop] : entry);
      return slotLabelOf(slot, slots) + ': ' + pass.by + ' put back the section you emptied. '
        + (pass.held ? EMPTIED_SECTION_STILL_ON_MAP : pass.why);
    });
  }

  /** A served copy of a session photo, for the map's thumbnails: the session's photos folder (server.js /sessionphotos). */
  function mapPhotoUrl(sessionId, filename) {
    if (!sessionId || !asString(filename)) return '';
    return '/sessionphotos/' + encodeURIComponent(sessionId) + '/' + encodeURIComponent(filename);
  }

  /**
   * The director's description of a photo (the payload's `photoDescriptions`, given at the
   * character-IDs stop), found by the photo's one join key (photoKey) as the writers find it
   * (lib/prompt-renderers/director-words-renderer.js renderPhotoEntry), or '' when there is none
   * (phase 4b, brief 1D; spec 4.2 and 9).
   *
   * @param {*} descriptions - data.photoDescriptions, `{filename: text}`
   * @param {string} filename
   * @returns {string}
   */
  function photoDescriptionOf(descriptions, filename) {
    if (!isPlainObject(descriptions) || !asString(filename).trim()) return '';
    var key = outlineEditLogic().photoKey(filename);
    var found = Object.keys(descriptions).filter(function (name) { return outlineEditLogic().photoKey(name) === key; })[0];
    return found === undefined ? '' : asString(descriptions[found]).trim();
  }

  /**
   * What a move's fold and controls say to a screen reader (phase 4b, brief 1F; spec 9: the tags
   * leave the page), keyed by the control as every element's `labels` are (fix round 3): each
   * names the move by its words, never its id, or as "a move" when it has none. The page renders
   * them as given, so Outline.js builds no label of its own.
   *
   * Piece 4 (spec 2026-10-07 sections 5 and 6): the card's own controls too, each by the move's
   * title: selecting it, its summary's toggle, Move up and Move down, and putting a photo beside it.
   *
   * @param {*} move - the beat's move
   * @returns {{fold: string, moveTo: string, strike: string, takeOut: string, bringBack: string, select: string, showSummary: string, hideSummary: string, moveUp: string, moveDown: string, photoBeside: string}}
   */
  function moveLabelsOf(move) {
    var words = asString(move).trim();
    var named = words ? '"' + words + '"' : 'a move';
    return {
      fold: evidenceFoldLabel(words || 'a move'),
      moveTo: 'Move ' + named + ' to another section',
      strike: 'Leave ' + named + ' out',
      takeOut: 'Take ' + named + ' out',
      bringBack: 'Bring ' + named + ' back into a section',
      select: words ? 'Select the move ' + named : 'Select a move',
      showSummary: 'Show the summary of ' + named,
      hideSummary: 'Hide the summary of ' + named,
      moveUp: 'Move ' + named + ' up',
      moveDown: 'Move ' + named + ' down',
      photoBeside: 'Put a photo beside ' + named
    };
  }

  /**
   * The legend of the map's page (piece 4, R4; spec 4): the settled story's threads, in the
   * angle's order, from the payload's `legend` (lib/map.js mapLegendOf), each with its `tone` by
   * its place (1 to MAP_TONES, repeating), its name and its line, and its pick control's name; and
   * `toneOf`, each thread id the weave holds to its dot, `{tone, name}`: a story thread's tone, or
   * the grey tone 0 with its name for a thread outside the story. The ids are keys only.
   */
  function mapLegendView(legend) {
    var l = isPlainObject(legend) ? legend : {};
    /** A move's thread ids, trimmed, each once, in its own order. */
    var ownIds = function (ids) {
      var seen = [];
      return stringList(ids).map(function (id) { return id.trim(); }).filter(function (id) {
        if (!id || seen.indexOf(id) !== -1) return false;
        seen.push(id);
        return true;
      });
    };
    var dots = new Map();
    var threads = asArray(l.threads).filter(isPlainObject).map(function (thread, i) {
      var tone = (i % MAP_TONES) + 1;
      var name = asString(thread.name).trim();
      var id = asString(thread.id).trim();
      if (id && !dots.has(id)) dots.set(id, { tone: tone, name: name, key: 'thread-' + i });
      return { key: 'thread-' + i, tone: tone, label: name, name: name, line: asString(thread.line).trim(), labels: { pick: 'Follow the thread "' + name + '" across the board' } };
    });
    asArray(l.others).filter(isPlainObject).forEach(function (thread) {
      var id = asString(thread.id).trim();
      if (id && !dots.has(id)) dots.set(id, { tone: 0, name: asString(thread.name).trim() });
    });
    var meets = new Map();
    asArray(l.connections).filter(isPlainObject).forEach(function (connection) {
      var id = asString(connection.id).trim();
      if (id && !meets.has(id)) meets.set(id, asString(connection.line).trim());
    });
    return {
      view: { title: MAP_LEGEND_TITLE, showAll: MAP_SHOW_ALL, threads: threads },
      dotsOf: function (ids) {
        return ownIds(ids).map(function (id) {
          var dot = dots.get(id);
          return dot ? { tone: dot.tone, name: dot.name } : { tone: 0, name: '' };
        });
      },
      // Piece 4 (brief 4D): the keys of the legend's threads a move carries, in its own order, by
      // which the board outlines the cards of a thread picked; a thread outside the story has none.
      keysOf: function (ids) {
        return ownIds(ids).map(function (id) { return dots.has(id) ? dots.get(id).key || '' : ''; }).filter(Boolean);
      },
      meetsOf: function (id) { return meets.get(asString(id).trim()) || ''; }
    };
  }

  /** A photo as its controls name it to a screen reader: by the director's description, quoted, as the page shows it, or by its filename when there is none. */
  function photoNameOf(filename, description) {
    return description ? '"' + description + '"' : asString(filename);
  }

  /**
   * The words a change to the weave names its source by (task 4.14b): a change of the
   * director's at the meeting by the place the meeting names its line by, from the payload's
   * `meetingChanges` (`{id, place}`: the meeting's changes the settled story shows), as "Your
   * change to why it lands" or "Your change to whether 'The letter' is in the story"; the
   * meeting's note by its name; and any other source as a change at the meeting. Never by an id:
   * the meeting shows none.
   *
   * @param {*} source - the change's `source`
   * @param {*} meetingChanges - data.meetingChanges
   * @returns {string}
   */
  function weaveChangeSource(source, meetingChanges) {
    var id = asString(source).trim();
    if (id === MAP_NOTE_SOURCE) return WEAVE_CHANGE_NOTE;
    var named = asArray(meetingChanges).filter(function (change) {
      return isPlainObject(change) && id !== '' && asString(change.id).trim() === id && asString(change.place).trim() !== '';
    })[0];
    return named ? 'Your change to ' + asString(named.place).trim() : WEAVE_CHANGE_UNNAMED;
  }

  /**
   * The map's page (spec 5.2; spec 2026-10-05 sections 4.2 and 9): the stop's payload (4.6's,
   * lib/map.js mapCheckpointData) with the map as the director has it.
   * Piece 4 (spec 2026-10-07 sections 4 to 7; R4, R7, R8, R11): the page is a corkboard.
   * `order` names the parts to show, in the spec's order (MAP_SECTIONS: `round`, `tally`,
   * `settledStory`, `legend`, `top`, `sections`, `leftOut`, `dropped`, `weaveChanges`), a part with
   * nothing in it left out; lib/stop-pages.js and Outline.js follow it. Then:
   * - `settledStory`, read-only, with `storyHint`, the way back to the meeting, and the gap note
   *   beside it;
   * - `legend` (mapLegendView, from the payload's `legend`): `title`, `showAll` and `threads`, the
   *   settled story's threads in the angle's order, each `{key, tone, label, name, line, labels: {pick}}`, its `label` its name as the page prints it,
   *   its `tone` its place, 1 to MAP_TONES and repeating, its line shown only once it is picked;
   * - `summaries`, the board's one toggle's two labels (MAP_SUMMARY_TOGGLE);
   * - the round's lines: `round` (after a send-back, with its note), `checkFailures` (the code
   *   checks still failing whose place the page does not show, one line each, in the director's
   *   words; failuresBesideLines), `changedEdits` (each edit a rework changed that a stop shows,
   *   changedEditsToShow, by changedEditLine with the map's places: a send-back's with its reason,
   *   and what no pass put back; task 4.10; a section the director emptied that a pass put back
   *   as one line, the section's, mapChangedEditLines, task 4.14b fix round 1), `kept`, the line
   *   that says the director's edits stand when none of theirs is listed (editsStandLine; brief
   *   4.10b), and `otherConcerns`, the concerns none of whose places the page shows. An edit a
   *   rework changed that is about a move the map holds sits on that move's card instead
   *   (`changed`; spec 7), as does one about a photo in a section that sits beside a move of it,
   *   since the photo prints on that card (brief 4C); one about a section the board shows (its
   *   order, a field of it, a photo by itself in it) under that section's head (its `changed`);
   *   one about the headline, the deck or the top photo at the top of the article (`top.changed`;
   *   run 1 follow-up F8); and one about the gap note (while the page shows it), the expected
   *   length or the weave changes beside that place (`changedBeside`, `{gapNote, length,
   *   weaveChanges}`, each a list of lines; brief 4C): only one with no place on the page stays
   *   here. The beat an entry names is read by beatOfPlace, the one reader of its place;
   * - `gapNote`, `headline`, `deck` and `topPhoto`, and `top`, the top of the article's
   *   `{changed, noPhoto}`, `noPhoto` MAP_NO_TOP_PHOTO_LINE while the map has no top photo, else ''
   *   (fix H3);
   * - `sections`, the board's columns in the map's order, each under its slot's label with its
   *   heading ('' when it prints none: the page says MAP_NO_HEADING_LINE), job, cards (`beats`)
   *   and photos (`photos`, every photo of the section in its order, for the controls that place
   *   one by its index; `byThemselves`, those beside no move of the section, at the column's
   *   foot), and `emptied`, MAP_EMPTIED_COLUMN_LINE on a column the director emptied, which the
   *   gate drops when the map is sent (dropEmptiedSections), each beat and photo with the places
   *   it can move to (phase 4b, brief 1D):
   *   - each card as its move (its title, which is also its `label`, its words as the page prints
   *     them), its people, its `synopsis` ('' for none, as on a map
   *     from before piece 4), its `dots` (`{tone, name}` for each thread it carries: a story
   *     thread's tone, the grey tone 0 with its name for a thread outside the story, and 0 with no
   *     name for an id the weave does not hold), its `legendKeys` (the keys of the legend's threads
   *     it carries, by which the board follows a thread picked; brief 4D), its `photos` (the photos
   *     beside it), its `photoChoices` (each photo a control can find that is not beside it, the top
   *     photo first, `{value, label, slot, index}` by its description and its place, for "Put a
   *     photo beside it" through placePhotoBeside; brief 4D), its card
   *     mark (`card`, true where its evidence prints as a card: the beat's flagged piece names its
   *     document, beatCardOf, the one reader of a beat's card; `cardMark`, MAP_CARD_MARK or ''),
   *     `meets`, the line of the connection that lands in it, `canMoveUp` and `canMoveDown` within
   *     its column, and its `changed` lines, with its evidence folded
   *     (`evidence`, evidenceFoldView's, under `evidenceTitle`, the piece that prints as its card
   *     `printsAsCard`, marked MAP_PRINTS_AS_CARD; brief 4D) and, for a beat the director
   *     added that has none, at this look or an earlier one (`data.addedBeats`), the fold's one
   *     line (`noEvidence`, MAP_NO_EVIDENCE_LINE). Its kind stays underneath, unprinted. Each beat row is keyed by its beat's id, so an editor open on it survives a
   *     strike or a move above it; a beat whose id another beat of its list holds, or with none,
   *     by its place (task 4.14b);
   *   - each photo with the director's description (`description`, photoDescriptionOf), or ''
   *     when there is none, the beats of its section it can sit beside (`besideOptions`), and
   *     every move it can be put beside in any section (`besideTargets`, for placePhotoBeside),
   *     each named by its move; the top photo carries the same `besideTargets`, empty while it
   *     is left out. A photo sits beside the beat it names unless that beat is struck
   *     (photoBeatOf; task 4.14b);
   *   - what each beat's fold and controls, and each photo's controls, say to a screen reader
   *     (`labels`, keyed by the control, as on the meeting's page; phase 4b, brief 1F, and fix
   *     round 3): a beat named by its move's words (moveLabelsOf: its fold's group "What's behind
   *     it: <move>", evidenceFoldLabel, and since piece 4 its selection, its summary's toggle, Move
   *     up, Move down and the photo beside it); a photo, the top photo too, by the director's
   *     description, or its filename when there is none (photoNameOf), its selection (`select`)
   *     and its place beside a move in any section (`placeBeside`) among them (brief 4D). A
   *     section's `label` is
   *     its slot's name, as the page prints it. The page builds none;
   * - a photo the map places that the director left out of the article since (the payload's
   *   `leftOutPhotos`), at the top or in a section, is `leftOut`: marked with
   *   LEFT_OUT_PHOTO_LINE before its concerns, its controls off, and no place to move to (task
   *   4.14b);
   * - `dropped`, each with its reason, a section the director emptied with EMPTIED_SECTION_LINE;
   *   `tally`, the counts, rebuilt from the map as edited (mapTallyOf): `placed`, "Everyone
   *   placed" when every roster player is in a move, else `unplaced` and `raised`, then `cards`,
   *   `photos` and `length`; `leftOut`, the tray, always open, each move by its title and its dots,
   *   with the sections it can come back to;
   *   `weaveChanges`, each with its source in words (weaveChangeSource; task 4.14b);
   * - every concern beside the line of the edit it is about (concernsBesideLines), every code
   *   check still failing beside the line its place names (`failures` on a beat, a section, a
   *   photo and the gap note, `weaveChangesFailures`; failuresBesideLines with mapLineKeyOf;
   *   spec 6.3), and a line under a repeat of the map the stop showed (mapRepeats, the writer's)
   *   `locked`, its controls off, with `lockedHint`, which speaks of those repeats alone.
   * No line or label names a beat, a thread or a connection by its id: the tags leave the page
   * (spec 9). Each beat's `id` stays on its view for the controls, which change the map by it.
   *
   * The stop always holds a map (task 4.11): the map writer, its rework and the director's
   * gate each leave one, and only a thread from before the story meeting holds an outline
   * that is no map. The server refuses such a thread wherever it sits, paused, complete or
   * stopped on an error (lib/old-thread.js; fix round 1), so no replay carries its outline
   * past a fresh meeting to this stop; paused here, it gets the server's message in place
   * of the stop (app.js, oldThreadView). A value that is no map (isMapValue: null, or an
   * outline in an old shape) still shows no map and throws nothing (fix E3): it is read as
   * an empty one, as the gate reads it (shownMapOf), so every reader below gets an object.
   *
   * @param {Object} data - the stop's payload
   * @param {*} given - the map as the director has it (mapDraftOf, then their changes)
   * @returns {Object}
   */
  function mapView(data, given) {
    var d = isPlainObject(data) ? data : {};
    var editLogic = outlineEditLogic();
    var map = editLogic.shownMapOf(given) || {};
    var slots = slotsOf(d);
    var story = isPlainObject(d.settledStory)
      ? { story: asString(d.settledStory.story), question: asString(d.settledStory.question) }
      : null;
    var shown = editLogic.shownMapOf(d.outline);
    var shownBeatIds = editLogic.mapBeatPlacements(shown).map(function (placement) { return placement.id; });
    var addedEarlier = asArray(d.addedBeats).map(function (id) { return asString(id).trim(); }).filter(Boolean);
    var writers = editLogic.mapRepeats(shown);
    var leftOutKeys = asArray(d.leftOutPhotos).filter(function (name) { return asString(name).trim() !== ''; }).map(editLogic.photoKey);
    var onPage = mapLinesOnPage(map);
    var placed = concernsBesideLines(d.concerns, onPage, mapLineKeyOf);
    var failing = failuresBesideLines(d.checkFailures, onPage, mapLineKeyOf);
    var at = function (key) { return placed.byLine.get(key) || []; };
    var failuresAt = function (key) { return failing.byLine.get(key) || []; };
    var sections = asArray(map.sections).filter(isPlainObject);
    var targets = sections.map(function (s) { return { value: s.slot, label: slotLabelOf(s.slot, slots) }; });
    var others = function (slot) { return targets.filter(function (t) { return t.value !== slot; }); };
    /** A photo under a repeat of the map shown, the writer's, or with no filename: no control can find it. */
    var photoRepeated = function (filename) {
      return !asString(filename).trim() || writers.photoKeys.indexOf(editLogic.photoKey(filename)) !== -1;
    };
    /** A photo the director left out of the article since the map (task 4.14b). */
    var photoLeftOut = function (filename) {
      return asString(filename).trim() !== '' && leftOutKeys.indexOf(editLogic.photoKey(filename)) !== -1;
    };
    /** The ids of a list of beats, as the row keys read them. */
    var idsOf = function (beats) { return asArray(beats).map(function (b) { return editLogic.beatIdOf(isPlainObject(b) ? b : {}); }); };
    /** A beat's move as a choice names it: up to BESIDE_TEXT_LENGTH characters. */
    var moveOf = function (beat) { return shortText(isPlainObject(beat) ? beat.move : ''); };
    // Piece 4 (R4): the legend, each card's dots and the line where its threads meet.
    var legend = mapLegendView(d.legend);
    // Piece 4 (spec 7): an edit a rework changed sits on the card of the move it is about, in the
    // words changedEditLine gives it; one about a section the board shows under that section's
    // head, and one about the headline, the deck or the top photo at the top of the article
    // (sectionOfEntry, onTop; run 1 follow-up F8), each in mapChangedEditLines' words; only one with
    // no place on the page stays among the round's lines.
    // Brief 4C (the integrator's ruling after run 1's follow-ups): a photo prints on the card of the
    // move it sits beside, so a line about a photo in a section sits on that card (cardOfEntry), and
    // one about a photo by itself keeps its section's head; a line about the gap note, the expected
    // length or the weave changes sits beside its own place (`changedBeside`, besideOfEntry). The
    // order edit names its section, so it sits under the section's head.
    var lineOptions = mapEditLineOptions(slots, map);
    var placedBeatIds = editLogic.mapBeatPlacements(map).map(function (placement) { return placement.id; });
    /** The beat on the map an entry's place names (beatOfPlace, the one reader), or null. */
    var beatOfEntry = function (entry) {
      var named = beatOfPlace(entry.where);
      return named && placedBeatIds.indexOf(named.id) !== -1 ? named.id : null;
    };
    /** Each photo that prints on a card, by its section's slot and its key, to the id of the move it sits beside there. */
    var photoCards = {};
    sections.forEach(function (section) {
      var ids = idsOf(section.beats);
      asArray(section.photos).forEach(function (photo) {
        if (!isPlainObject(photo) || !asString(photo.filename).trim()) return;
        var beside = editLogic.photoBeatOf(map, photo);
        if (beside && ids.indexOf(beside) !== -1) photoCards[asString(section.slot) + '|' + editLogic.photoKey(photo.filename)] = beside;
      });
    });
    /**
     * The card an entry sits on: the move its place names, or the move beside which the photo it
     * names sits in the section it names, where that photo prints; else null. A photo now in
     * another section keeps the head of the section its place names.
     */
    var cardOfEntry = function (entry) {
      var named = beatOfEntry(entry);
      if (named !== null) return named;
      var photo = /^section "([^"]*)", photo "([^"]*)"/.exec(asString(entry.where));
      var key = photo ? photo[1] + '|' + editLogic.photoKey(photo[2]) : '';
      return photo && hasOwn(photoCards, key) ? photoCards[key] : null;
    };
    var boardSlots = sections.map(function (section) { return asString(section.slot); });
    /** The slot of the section on the board an entry is about (a field of it, its order, a photo by itself in it, its cut or its drop), or null. */
    var sectionOfEntry = function (entry) {
      var m = /^(?:section|dropped slot) "([^"]*)"/.exec(asString(entry.where));
      return m && boardSlots.indexOf(m[1]) !== -1 ? m[1] : null;
    };
    /** Whether an entry is about the top of the article: the headline, the deck or the top photo. */
    var onTop = function (entry) { return /^(?:headline|deck|the top photo|topPhoto)(?:,|$)/.test(asString(entry.where)); };
    /** The map's own place an entry is about, beside which its line sits: the gap note while the page shows one, the expected length or the weave changes; else null. */
    var besideOfEntry = function (entry) {
      var where = asString(entry.where);
      if (/^gap note(?:,|$)/.test(where)) return isPlainObject(map.gapNote) ? 'gapNote' : null;
      if (/^expectedLength(?:,|$)/.test(where)) return 'length';
      if (/^weaveChanges(?:,|$)/.test(where)) return 'weaveChanges';
      return null;
    };
    var report = isPlainObject(d.handEditReport) ? d.handEditReport : null;
    var toShow = changedEditsToShow(report);
    var onCards = toShow.filter(function (entry) { return cardOfEntry(entry) !== null; });
    var onSections = toShow.filter(function (entry) { return onCards.indexOf(entry) === -1 && sectionOfEntry(entry) !== null; });
    var atTop = toShow.filter(function (entry) { return onCards.indexOf(entry) === -1 && onSections.indexOf(entry) === -1 && onTop(entry); });
    var besides = toShow.filter(function (entry) {
      return onCards.indexOf(entry) === -1 && onSections.indexOf(entry) === -1 && atTop.indexOf(entry) === -1 && besideOfEntry(entry) !== null;
    });
    var changedOn = function (id) {
      return onCards.filter(function (entry) { return cardOfEntry(entry) === id; }).map(function (entry) { return changedEditLine(entry, lineOptions); });
    };
    /** The report with only the entries `keep` holds, for mapChangedEditLines, which pairs a section's cut with its drop. */
    var reportOf = function (keep) {
      return Object.assign({}, report, { changed: asArray(report.changed).filter(function (entry) { return keep(entry); }) });
    };
    var changedUnderHead = function (slot) {
      var here = onSections.filter(function (entry) { return sectionOfEntry(entry) === slot; });
      return here.length > 0 ? mapChangedEditLines(reportOf(function (entry) { return here.indexOf(entry) !== -1; }), slots, map) : [];
    };
    var changedBesideOf = function (place) {
      var here = besides.filter(function (entry) { return besideOfEntry(entry) === place; });
      return here.length > 0 ? mapChangedEditLines(reportOf(function (entry) { return here.indexOf(entry) !== -1; }), slots, map) : [];
    };
    var changedBeside = { gapNote: changedBesideOf('gapNote'), length: changedBesideOf('length'), weaveChanges: changedBesideOf('weaveChanges') };
    var placedEntries = onCards.concat(onSections, atTop, besides);
    var restOfReport = report && placedEntries.length > 0
      ? reportOf(function (entry) { return placedEntries.indexOf(entry) === -1; })
      : report;
    var targetsBeside = sections.reduce(function (all, section) {
      return all.concat(asArray(section.beats).filter(function (b) { return editLogic.beatIdOf(isPlainObject(b) ? b : {}) !== ''; }).map(function (b) {
        return { slot: section.slot, value: editLogic.beatIdOf(b), label: 'Beside: ' + moveOf(b) + ' (' + slotLabelOf(section.slot, slots) + ')' };
      }));
    }, []);

    var beatView = function (beat, index, slot, ids) {
      var b = isPlainObject(beat) ? beat : {};
      var id = editLogic.beatIdOf(b);
      var ownId = id !== '' && ids.filter(function (other) { return other === id; }).length === 1;
      var added = id !== '' && shownBeatIds.indexOf(id) === -1;
      // Piece 4 (brief 4D; spec 5): the piece a move marked as a card prints as its card, marked so in
      // what's behind the selected card (beatCardOf and cardPiecesOf, the readers of a beat's card).
      var cardPiece = editLogic.beatCardOf(b) ? editLogic.cardPiecesOf(b)[0] : null;
      var printed = asArray(b.evidence).filter(isPlainObject).indexOf(cardPiece);
      var evidence = evidenceFoldView(b.evidence, d.evidenceIndex).map(function (piece, n) {
        return Object.assign(piece, { printsAsCard: n === printed });
      });
      return {
        key: (slot === null ? 'leftOut' : slot) + (ownId ? '-beat-' + id : '-beat@' + index),
        id: id,
        index: index,
        label: asString(b.move),
        move: asString(b.move),
        players: stringList(b.players).join(', '),
        synopsis: asString(b.synopsis).trim(),
        dots: legend.dotsOf(b.threads),
        legendKeys: legend.keysOf(b.threads),
        card: Boolean(editLogic.beatCardOf(b)),
        cardMark: editLogic.beatCardOf(b) ? MAP_CARD_MARK : '',
        photos: [],
        photoChoices: [],
        evidence: evidence,
        meets: legend.meetsOf(b.connection),
        noEvidence: evidence.length === 0 && (added || addedEarlier.indexOf(id) !== -1) ? MAP_NO_EVIDENCE_LINE : '',
        concerns: id ? at('beat:' + id) : [],
        failures: id ? failuresAt('beat:' + id) : [],
        changed: id ? changedOn(id) : [],
        added: added,
        locked: id === '' || writers.beatIds.indexOf(id) !== -1,
        canMoveUp: slot !== null && index > 0,
        canMoveDown: slot !== null && index < ids.length - 1,
        moveTargets: slot === null ? targets : others(slot),
        labels: moveLabelsOf(b.move)
      };
    };

    var photoView = function (photo, index, section) {
      var p = isPlainObject(photo) ? photo : {};
      var filename = asString(p.filename);
      var key = editLogic.photoKey(filename);
      var leftOut = photoLeftOut(filename);
      var beside = editLogic.photoBeatOf(map, p);
      var options = [{ value: '', label: BY_ITSELF_LABEL }].concat(asArray(section.beats)
        .filter(function (b) { return editLogic.beatIdOf(b) !== ''; })
        .map(function (b) { return { value: editLogic.beatIdOf(b), label: 'Beside: ' + moveOf(b) }; }));
      if (beside && !options.some(function (o) { return o.value === beside; })) {
        options.push({ value: beside, label: 'Beside: ' + moveOf(editLogic.beatWithId(map, beside)) + ', which is not in this section' });
      }
      var description = photoDescriptionOf(d.photoDescriptions, filename);
      var named = photoNameOf(filename, description);
      return {
        key: section.slot + '-photo-' + index,
        slot: section.slot,
        index: index,
        filename: filename,
        description: description,
        labels: {
          beside: 'Where ' + named + ' sits in its section',
          moveTo: 'Move ' + named + ' to the top or to another section',
          select: 'Select the photo ' + named,
          placeBeside: 'Put ' + named + ' beside a move'
        },
        beat: beside,
        besideOptions: options,
        besideTargets: leftOut ? [] : targetsBeside,
        moveTargets: leftOut ? [] : [{ value: editLogic.MAP_TOP_PHOTO, label: TOP_PHOTO_LABEL }].concat(others(section.slot)),
        concerns: (leftOut ? [LEFT_OUT_PHOTO_LINE] : []).concat(at('photo:' + key)),
        failures: failuresAt('photo:' + key),
        leftOut: leftOut,
        locked: leftOut || photoRepeated(filename)
      };
    };

    var topName = asString(map.topPhoto);
    var topLeftOut = photoLeftOut(topName);
    var topDescription = photoDescriptionOf(d.photoDescriptions, topName);
    var topPhoto = topName.trim()
      ? {
          filename: topName,
          description: topDescription,
          labels: {
            moveTo: 'Move the top photo ' + photoNameOf(topName, topDescription) + ' into a section',
            select: 'Select the top photo ' + photoNameOf(topName, topDescription),
            placeBeside: 'Put the top photo ' + photoNameOf(topName, topDescription) + ' beside a move'
          },
          concerns: (topLeftOut ? [LEFT_OUT_PHOTO_LINE] : []).concat(at('topPhoto')),
          failures: failuresAt('topPhoto'),
          besideTargets: topLeftOut ? [] : targetsBeside,
          moveTargets: topLeftOut ? [] : targets,
          leftOut: topLeftOut,
          locked: topLeftOut || photoRepeated(topName)
        }
      : null;

    var sectionViews = sections.map(function (section, i) {
      var ids = idsOf(section.beats);
      var beats = asArray(section.beats).map(function (beat, j) { return beatView(beat, j, section.slot, ids); });
      var photos = asArray(section.photos).map(function (photo, j) { return photoView(photo, j, section); });
      // Piece 4 (spec 4): each photo beside a move of its own section sits on that move's card,
      // and the rest sit at the column's foot by themselves.
      var byThemselves = photos.filter(function (photo) {
        var card = photo.beat ? beats.filter(function (b) { return b.id === photo.beat; })[0] : null;
        if (card) card.photos.push(photo);
        return !card;
      });
      var before = editLogic.sectionWithSlot(shown, section.slot);
      var emptied = beats.length === 0 && photos.length === 0 && Boolean(before)
        && (asArray(before.beats).length > 0 || asArray(before.photos).length > 0);
      return {
        key: 'section-' + i,
        slot: section.slot,
        label: slotLabelOf(section.slot, slots),
        heading: asString(section.heading),
        job: asString(section.job),
        concerns: at('section:' + section.slot),
        failures: failuresAt('section:' + section.slot),
        changed: changedUnderHead(section.slot),
        beats: beats,
        photos: photos,
        byThemselves: byThemselves,
        emptied: emptied ? MAP_EMPTIED_COLUMN_LINE : ''
      };
    });

    // Piece 4 (brief 4D; spec 5): "Put a photo beside it" on a selected card offers every photo on
    // the board that a control can find and that is not beside the move already, the top photo
    // first, each by its description and its place, with the place placePhotoBeside takes it from.
    var choosable = (topPhoto && !topPhoto.locked ? [{ photo: topPhoto, slot: editLogic.MAP_TOP_PHOTO, index: 0, place: TOP_PHOTO_LABEL }] : [])
      .concat(sectionViews.reduce(function (all, section) {
        return all.concat(section.photos.filter(function (photo) { return !photo.locked; }).map(function (photo) {
          return { photo: photo, slot: section.slot, index: photo.index, place: section.label };
        }));
      }, []));
    sectionViews.forEach(function (section) {
      section.beats.forEach(function (card) {
        if (card.locked) return;
        card.photoChoices = choosable.filter(function (c) { return !c.photo.beat || c.photo.beat !== card.id; }).map(function (c) {
          return {
            value: c.slot + '#' + c.index,
            label: photoNameOf(c.photo.filename, c.photo.description) + ' (' + c.place + ')',
            slot: c.slot,
            index: c.index
          };
        });
      });
    });

    var leftIds = idsOf(map.leftOut);
    var leftItems = asArray(map.leftOut).map(function (beat, j) {
      var view = beatView(beat, j, null, leftIds);
      view.targets = targets;
      return view;
    });

    var tally = mapTallyOf(d, map);
    var unplaced = tally.unplaced.filter(function (name) { return tally.raised.indexOf(name) === -1; });
    var cardsWord = tally.cards === 1 ? ' card' : ' cards';
    var cardsOff = tally.cards < MAP_CARDS.min || tally.cards > MAP_CARDS.max;
    var length = map.expectedLength;
    var human = Number(d.humanRevisionCount) || 0;
    var feedback = asString(d.previousFeedback).trim();
    // The hint speaks of the writer's repeats: a photo the director left out is marked on its own line.
    var anyLocked = sectionViews.some(function (s) {
      return s.beats.some(function (b) { return b.locked; }) || s.photos.some(function (p) { return photoRepeated(p.filename); });
    }) || leftItems.some(function (b) { return b.locked; }) || Boolean(topPhoto && photoRepeated(topPhoto.filename));

    var round = human > 0
      ? { label: roundsBanner(human, d.revisionCount, d.maxRevisions).roundLabel, note: feedback ? 'You sent the map back with: "' + feedback + '"' : '' }
      : null;
    var changedEdits = mapChangedEditLines(restOfReport, slots, map);
    // Fix H4: the map counts no records.
    var kept = editsStandLine(d.handEditReport, { counted: false });
    var dropped = asArray(map.dropped).filter(isPlainObject);
    var weaveChanges = asArray(map.weaveChanges).filter(isPlainObject);
    var present = {
      round: Boolean(d.roundDidNotRun) || Boolean(round) || failing.top.length > 0 || changedEdits.length > 0 || Boolean(kept) || placed.other.length > 0,
      legend: legend.view.threads.length > 0,
      dropped: dropped.length > 0,
      weaveChanges: weaveChanges.length > 0 || at('weaveChanges').length > 0 || failuresAt('weaveChanges').length > 0 || changedBeside.weaveChanges.length > 0
    };

    return {
      order: MAP_SECTIONS.filter(function (part) { return !hasOwn(present, part) || present[part]; }),
      settledStory: story,
      storyHint: STORY_HINT,
      round: round,
      checkFailures: failing.top,
      changedEdits: changedEdits,
      kept: kept,
      otherConcerns: placed.other,
      legend: legend.view,
      summaries: { open: MAP_SUMMARY_TOGGLE.open, close: MAP_SUMMARY_TOGGLE.close },
      gapNote: isPlainObject(map.gapNote)
        ? { line: asString(map.gapNote.line), players: stringList(map.gapNote.players).join(', '), concerns: at('gapNote'), failures: failuresAt('gapNote') }
        : null,
      headline: { text: asString(map.headline), concerns: at('headline') },
      deck: { text: asString(map.deck), concerns: at('deck') },
      topPhoto: topPhoto,
      top: {
        changed: atTop.length > 0 ? mapChangedEditLines(reportOf(function (entry) { return atTop.indexOf(entry) !== -1; }), slots, map) : [],
        noPhoto: topPhoto ? '' : MAP_NO_TOP_PHOTO_LINE
      },
      changedBeside: changedBeside,
      evidenceTitle: EVIDENCE_FOLD_TITLE,
      sections: sectionViews,
      dropped: dropped.map(function (entry) {
        var reason = asString(entry.reason);
        return {
          key: 'dropped-' + entry.slot,
          slot: entry.slot,
          label: slotLabelOf(entry.slot, slots),
          reason: reason === editLogic.EMPTIED_SECTION_REASON ? EMPTIED_SECTION_LINE : reason,
          concerns: at('dropped:' + entry.slot)
        };
      }),
      tally: {
        placed: tally.unplaced.length === 0 ? 'Everyone placed' : '',
        unplaced: unplaced.length > 0 ? 'In no move: ' + unplaced.join(', ') : '',
        raised: tally.raised.length > 0 ? 'Raised in the gap note: ' + tally.raised.join(', ') : '',
        cards: tally.cards + cardsWord + (cardsOff ? ', ' + (tally.cards < MAP_CARDS.min ? 'under' : 'over') + ' the ' + MAP_CARDS.min + ' to ' + MAP_CARDS.max + ' the article carries' : ''),
        photos: tally.photos.placed + ' of ' + tally.photos.of + ' photos',
        length: Number.isInteger(length)
          ? 'About ' + withCommas(length) + ' words'
          : 'Length not set',
        lengthConcerns: at('expectedLength')
      },
      leftOut: {
        title: 'Left out (' + leftItems.length + ')',
        items: leftItems
      },
      weaveChanges: weaveChanges.map(function (change, i) {
        return {
          key: 'change-' + i,
          source: weaveChangeSource(change.source, d.meetingChanges),
          change: asString(change.change)
        };
      }),
      weaveChangesConcerns: at('weaveChanges'),
      weaveChangesFailures: failuresAt('weaveChanges'),
      lockedHint: anyLocked ? MAP_LOCKED_HINT : ''
    };
  }

  // ── The desk's marks (phase 4, task 4.10; spec 6.2 and 6.3) ──────────────────
  //
  // The article stop is the director's desk: the article as it will print, with nothing in
  // front of it. A fact the judge could not fix within its budget and a code check's flag sit
  // beside the paragraph, card or photo they are about; a concern about one of the director's
  // edits, and an edit a rework changed, beside the edit. There is no score and no note on the
  // writing. A mark whose text the director's edit has since changed or taken out folds below
  // the article as possibly resolved, and one with no piece to sit beside goes in one line
  // beside the approve button. Article.js renders the desk from deskView, and the harness
  // prints the desk from the same model (task 4.12).

  /**
   * console/article-desk-logic.js, read when it runs, as outlineEditLogic is: that module loads
   * after this one in the browser, and the desk calls it long after both.
   */
  function deskLogic() {
    var desk = (typeof window !== 'undefined' && window.Console && window.Console.articleDeskLogic)
      || (typeof require === 'function' ? require('./article-desk-logic') : null);
    if (!desk || typeof desk.printedPlaces !== 'function') {
      throw new Error("checkpoint-view-logic: the desk's marks read console/article-desk-logic.js, which is not loaded");
    }
    return desk;
  }

  /** What the desk calls each kind of mark, by its tone. */
  var DESK_MARK_LABELS = {
    judge: 'The judge could not fix this',
    structural: 'Fact check',
    concern: 'Concern about your edit',
    changed: 'Your edit',
    advisory: 'Fact check, advisory'
  };

  /** The order marks sit in beside one piece: the errors of fact first, then the director's own lines, then the house's flags. */
  var DESK_MARK_ORDER = ['judge', 'structural', 'concern', 'changed', 'advisory'];

  /** The kind the fact check gives the length (lib/content-bundle-fact-check.js), which sits on its section's heading. */
  var LENGTH_KIND = 'length';

  /** The source of the fact check's own entry in the evaluation history (evaluator-nodes.js), which is never the judge's. */
  var FACT_CHECK_SOURCE = 'fact-check';

  /** The echo above the headline, the meeting's story, and the fold of what the director's edits may have resolved. */
  var DESK_ECHO_TITLE = 'Settled at the story meeting';
  var DESK_RESOLVED_HINT = 'Each was about a line, a card or a photo you have since changed or taken out.';

  /**
   * The words in a fact-check finding's line that stand for the document its card cites: a copy
   * of lib/content-bundle-fact-check.js DOCUMENT_SLOT, which the browser cannot import; a test
   * holds the two equal.
   */
  var DOCUMENT_SLOT = '{document}';

  /** What a line calls a card's document that the stop's evidenceIndex does not name. */
  var UNNAMED_DOCUMENT = 'the document it cites';

  /**
   * What a fact-check finding's mark says (brief 4.10b): the finding's line, what is wrong in
   * the article at its place in the director's words, with the card's document named where the
   * line holds DOCUMENT_SLOT, as the story meeting names a piece's document (receiptView,
   * through the stop's evidenceIndex). A finding stored before the fact check wrote lines reads as its
   * message, a concern's past its prefix and ids.
   *
   * @param {Object} finding - one of the fact check's findings
   * @param {Object} evidenceIndex - data.evidenceIndex
   * @returns {string}
   */
  function findingLine(finding, evidenceIndex) {
    var line = asString(finding.line);
    if (!line) return typeof finding.editId === 'string' && finding.editId ? concernFindingOf(finding.message) : asString(finding.message);
    if (line.indexOf(DOCUMENT_SLOT) === -1) return line;
    var place = isPlainObject(finding.place) ? finding.place : {};
    var named = receiptView(place.tokenId, evidenceIndex);
    return line.split(DOCUMENT_SLOT).join(named && named.known ? named.label : UNNAMED_DOCUMENT);
  }

  /** Text with its runs of whitespace as one space, trimmed: how a finding's excerpt is written. */
  function collapsedText(text) {
    return asString(text).replace(/\s+/g, ' ').trim();
  }

  /**
   * A text as lib/grounding.js normalizeForGrounding reads it, for the browser that cannot
   * import it: curly quotation marks straight, every dash a hyphen, its whitespace one space.
   * A test holds the two equal.
   */
  function groundingText(value) {
    return String(value || '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014-]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * A letter or a digit, as the quotes' rule reads one: a character with a case, or 0 to 9.
   * The server reads any letter or number (\p{L}, \p{N}); the console keeps to the regular
   * expressions the browser's Babel compiles, and the game's text is written in English.
   */
  function isLetterOrDigit(ch) {
    return typeof ch === 'string' && ch.length > 0 && (/[0-9]/.test(ch) || ch.toLowerCase() !== ch.toUpperCase());
  }

  /**
   * The single-quoted passages of a text, as lib/grounding.js quotedPassages finds them: from a
   * quotation mark no letter or digit precedes, past each apostrophe inside a word, to a
   * quotation mark no letter or digit follows.
   */
  function singleQuotedPassages(text) {
    var out = [];
    var i = 0;
    while (i < text.length) {
      if (text.charAt(i) !== "'" || isLetterOrDigit(text.charAt(i - 1))) {
        i += 1;
        continue;
      }
      var j = i + 1;
      while (j < text.length && (text.charAt(j) !== "'" || (isLetterOrDigit(text.charAt(j - 1)) && isLetterOrDigit(text.charAt(j + 1))))) j += 1;
      if (j < text.length && j > i + 1 && !isLetterOrDigit(text.charAt(j + 1))) {
        out.push(text.slice(i, j + 1));
        i = j + 1;
      } else {
        i += 1;
      }
    }
    return out;
  }

  /**
   * The passages a finding quotes, as lib/grounding.js quotedPassages reads them, for the
   * browser that cannot import it: the double-quoted passages, then the single-quoted ones,
   * each without its quotation marks and trimmed. A test holds the two equal.
   *
   * @param {*} value - a finding
   * @returns {string[]}
   */
  function quotedPassagesOf(value) {
    var text = groundingText(value);
    var doubles = text.match(/"[^"]+"/g) || [];
    return doubles.concat(singleQuotedPassages(text))
      .map(function (passage) { return passage.slice(1, -1).trim(); })
      .filter(Boolean);
  }

  /** An elision inside a quoted passage, where the passage is split (lib/grounding.js ELISION). */
  var ELISION = /\s*(?:\[\s*(?:\.{3}|\u2026)\s*\]|\.{3}|\u2026)\s*/;

  /** The fewest words a quoted passage needs to locate anything (lib/hand-edit-diff.js MIN_LOCATING_WORDS; a test holds the two equal). */
  var MIN_QUOTE_WORDS = 3;

  /**
   * How many words a text holds, as lib/hand-edit-diff.js wordsIn counts them in English text
   * (isLetterOrDigit): each run that opens on a letter or a digit, through its letters, digits,
   * apostrophes and hyphens.
   */
  function wordsIn(text) {
    var t = asString(text);
    var n = 0;
    var inWord = false;
    for (var i = 0; i < t.length; i += 1) {
      var ch = t.charAt(i);
      if (isLetterOrDigit(ch)) {
        if (!inWord) n += 1;
        inWord = true;
      } else if (!(inWord && (ch === "'" || ch === '-'))) {
        inWord = false;
      }
    }
    return n;
  }

  /** A text as a quote is looked for in it: grounding's reading, in lower case (lib/hand-edit-diff.js fold). */
  function foldQuote(text) {
    return groundingText(text).toLowerCase();
  }

  /**
   * The passages that can locate a finding, as lib/hand-edit-diff.js locateQuotedText reads
   * them: each passage it quotes, split at an elision (ELISION), of MIN_QUOTE_WORDS words or
   * more (wordsIn), and none that is one of the article's section headings (headingsOf), which
   * a finding quotes to say where the problem is. A test holds the two equal on a corpus of
   * findings, through locateQuotedText.
   *
   * @param {string} text - a finding
   * @param {Set<string>} headings - the article's section headings, folded
   * @returns {string[]}
   */
  function locatingPassages(text, headings) {
    var out = [];
    quotedPassagesOf(text).forEach(function (passage) {
      passage.split(ELISION).forEach(function (piece) {
        var p = piece.trim();
        if (wordsIn(p) >= MIN_QUOTE_WORDS && !headings.has(foldQuote(p))) out.push(p);
      });
    });
    return out;
  }

  /**
   * A piece of the desk as the key Article.js renders its marks under ('headline', 'byline',
   * 'hero', 'heading:<s>', 'block:<s>:<b>', 'sidebar:<k>'), from its anchor
   * (article-desk-logic.js printedPlaces).
   *
   * @param {Object} anchor
   * @returns {string}
   */
  function deskAnchorKey(anchor) {
    if (!isPlainObject(anchor)) return '';
    if (anchor.kind === 'block') return 'block:' + anchor.section + ':' + anchor.block;
    if (anchor.kind === 'heading') return 'heading:' + anchor.section;
    if (anchor.kind === 'sidebar') return 'sidebar:' + anchor.index;
    return asString(anchor.kind);
  }

  /** A piece of the desk in words, in the bundle its anchor indexes: "The Story, block 3". */
  function pieceWords(anchor, bundle) {
    var sections = isPlainObject(bundle) && Array.isArray(bundle.sections) ? bundle.sections : [];
    var label = function (s) { return deskLogic().sectionLabel(sections[s], s); };
    if (anchor.kind === 'headline') return 'The headline';
    if (anchor.kind === 'byline') return 'The byline';
    if (anchor.kind === 'hero') return 'The top photo';
    if (anchor.kind === 'heading') return label(anchor.section) + ', heading';
    if (anchor.kind === 'block') return label(anchor.section) + ', block ' + (anchor.block + 1);
    if (anchor.kind === 'sidebar') return 'Sidebar card ' + (anchor.index + 1);
    return '';
  }

  /**
   * A section's id as a finding's place names it: its id trimmed, or null for a section with
   * none (lib/content-bundle-fact-check.js sectionIdOf; a test holds it to the fact check's
   * findings).
   */
  function findingSectionId(section) {
    return isPlainObject(section) && typeof section.id === 'string' && section.id.trim() ? section.id.trim() : null;
  }

  function sectionsIn(bundle) {
    return isPlainObject(bundle) && Array.isArray(bundle.sections) ? bundle.sections : [];
  }

  /** The index of the one section a finding's place names, or -1 when none, or more than one, has that id. */
  function sectionNamed(bundle, sectionId) {
    var sections = sectionsIn(bundle);
    var found = -1;
    for (var s = 0; s < sections.length; s += 1) {
      if (findingSectionId(sections[s]) === sectionId) {
        if (found !== -1) return -1;
        found = s;
      }
    }
    return found;
  }

  /** The index of a bundle's section under a key (article-desk-logic.js sectionKey), or -1. */
  function sectionWithKey(bundle, key) {
    var sections = sectionsIn(bundle);
    for (var s = 0; s < sections.length; s += 1) {
      if (deskLogic().sectionKey(sections[s], s) === key) return s;
    }
    return -1;
  }

  /** The label of a bundle's section under a key, as the desk reads it: its heading, else its id; the key itself for none. */
  function sectionLabelOfKey(bundle, key) {
    var s = sectionWithKey(bundle, key);
    return s === -1 ? key : deskLogic().sectionLabel(sectionsIn(bundle)[s], s);
  }

  /** The pieces of a section, by its key, or null for no section. */
  function inSection(key) {
    return key === null || key === undefined ? null : function (piece) { return piece.sectionKey === key; };
  }

  /** Does a piece print `text`, its runs of whitespace as one space? */
  function holdsText(piece, text) {
    var wanted = collapsedText(text);
    return wanted !== '' && piece.texts.some(function (t) { return collapsedText(t).indexOf(wanted) !== -1; });
  }

  /** Does a piece print a passage a finding quotes, as the server's guard looks for it, in any case? */
  function holdsQuote(piece, passage) {
    var wanted = foldQuote(passage);
    return wanted !== '' && piece.texts.some(function (t) { return foldQuote(t).indexOf(wanted) !== -1; });
  }

  /** The first piece that passes the test: among the preferred pieces first, then any. */
  function firstPiece(pieces, test, prefer) {
    var i;
    if (typeof prefer === 'function') {
      for (i = 0; i < pieces.length; i += 1) if (prefer(pieces[i]) && test(pieces[i])) return pieces[i];
    }
    for (i = 0; i < pieces.length; i += 1) if (test(pieces[i])) return pieces[i];
    return null;
  }

  /**
   * Where a mark sits: beside the first piece on the desk that passes the test (`{at}`); folded
   * below as possibly resolved when only the article as the stop opened it held such a piece,
   * so the director's edit changed or took it out (`{was}`, where it was then); or null, beside
   * no piece.
   */
  function locate(ctx, test, prefer) {
    var now = firstPiece(ctx.currentPieces, test, prefer);
    if (now) return { at: now.anchor };
    var before = firstPiece(ctx.openedPieces, test, prefer);
    return before ? { was: before.anchor } : null;
  }

  /** The headline's main line, kicker or deck, as text. */
  function headlineField(bundle, name) {
    var head = isPlainObject(bundle) && isPlainObject(bundle.headline) ? bundle.headline : {};
    return asString(head[name]);
  }

  /** A finding on the headline, the kicker or the deck: beside the headline while the field is as the stop opened it or holds the excerpt. */
  function fieldPlace(field, excerpt, ctx) {
    var name = field.indexOf('headline.') === 0 ? field.slice('headline.'.length) : '';
    if (!name) return null;
    var now = headlineField(ctx.current, name);
    var wanted = collapsedText(excerpt);
    if (now === headlineField(ctx.opened, name) || (wanted !== '' && collapsedText(now).indexOf(wanted) !== -1)) return { at: { kind: 'headline' } };
    return { was: { kind: 'headline' } };
  }

  /**
   * A finding on a card or a photo, found by what names it (the integrator's ruling 4): its id
   * or its filename, in the sidebar, the hero or a section's blocks. Beside it, wherever it now
   * sits, while it is as the stop opened it; possibly resolved once the director's edit changed
   * or deleted it. Its excerpt (the card's headline, the photo's caption) decides nothing: the
   * director fixing a card's text leaves its headline as it was. `occurrence` says which of the
   * cards or photos of that name in the finding's section it is about.
   */
  function identityPlace(place, occurrence, ctx) {
    var card = typeof place.tokenId === 'string';
    var kind = place.sidebar === true ? 'sidebar' : (place.hero === true ? 'hero' : 'block');
    var named = function (piece) {
      if (piece.anchor.kind !== kind || !isPlainObject(piece.block)) return false;
      if (card) return piece.block.tokenId === place.tokenId && (kind === 'sidebar' || piece.block.type === 'evidence-card');
      return piece.block.filename === place.filename && (kind === 'hero' || piece.block.type === 'photo');
    };
    var opened = ctx.openedPieces.filter(named);
    var inItsSection = kind === 'block' && hasOwn(place, 'section')
      ? opened.filter(function (piece) { return findingSectionId(sectionsIn(ctx.opened)[piece.anchor.section]) === place.section; })
      : opened;
    var was = inItsSection[occurrence] || inItsSection[0] || opened[0] || null;
    if (!was) {
      var now = firstPiece(ctx.currentPieces, named, null);
      return now ? { at: now.anchor } : null;
    }
    var unchanged = function (piece) { return named(piece) && ctx.desk.sameBlock(piece.block, was.block); };
    var found = firstPiece(ctx.currentPieces, unchanged, inSection(was.sectionKey));
    return found ? { at: found.anchor } : { was: was.anchor };
  }

  /**
   * Where a fact check's finding sits (brief 4.7a's places; the integrator's rulings 1 to 4):
   * - a paragraph, by its section and ordinal while no block at or before it in that section
   *   was inserted, deleted, moved or edited (article-desk-logic.js untouchedThrough), and by its
   *   excerpt otherwise, its own section first;
   * - the headline, the kicker or the deck: beside the headline (fieldPlace);
   * - a card or a photo, by what names it (identityPlace);
   * - the length, on the heading of each section it counts;
   * - a quote block, by its excerpt;
   * - no place (a player never named, a phrase across two pieces): beside no piece.
   * A finding found by its excerpt sits beside a block of its own kind, a paragraph's beside a
   * paragraph and a quote block's beside a quote (brief 4.10b): its line names the piece it is
   * about, and a card, a caption or a quote can hold the same words.
   */
  function findingPlace(finding, occurrence, ctx) {
    var place = finding.place;
    if (!isPlainObject(place)) return null;
    if (typeof place.field === 'string') return fieldPlace(place.field, finding.excerpt, ctx);
    if (typeof place.tokenId === 'string' || typeof place.filename === 'string') return identityPlace(place, occurrence, ctx);
    var os = sectionNamed(ctx.opened, place.section);
    var key = os === -1 ? null : ctx.desk.sectionKey(sectionsIn(ctx.opened)[os], os);
    if (finding.kind === LENGTH_KIND) {
      var heading = key === null ? -1 : sectionWithKey(ctx.current, key);
      return heading === -1 ? null : { at: { kind: 'heading', section: heading } };
    }
    if (typeof place.paragraph === 'number' && key !== null) {
      var block = ctx.desk.paragraphBlockIndex(sectionsIn(ctx.opened)[os].content, place.paragraph);
      var cs = sectionWithKey(ctx.current, key);
      if (block !== -1 && cs !== -1 && ctx.desk.untouchedThrough(ctx.changes, key, block)) return { at: { kind: 'block', section: cs, block: block } };
    }
    if (!collapsedText(finding.excerpt)) return null;
    var type = typeof place.paragraph === 'number' ? 'paragraph' : 'quote';
    return locate(ctx, function (piece) {
      return piece.anchor.kind === 'block' && isPlainObject(piece.block) && piece.block.type === type && holdsText(piece, finding.excerpt);
    }, inSection(key));
  }

  /**
   * Where a finding that quotes the article sits (a judge's issue, a judge's concern): beside the
   * first piece that holds a passage it quotes (locatingPassages), never a section's heading.
   */
  function quotePlace(text, ctx) {
    var passages = locatingPassages(text, ctx.headings);
    var holding = function (passage) {
      return function (piece) { return piece.anchor.kind !== 'heading' && holdsQuote(piece, passage); };
    };
    var i;
    for (i = 0; i < passages.length; i += 1) {
      var now = firstPiece(ctx.currentPieces, holding(passages[i]), null);
      if (now) return { at: now.anchor };
    }
    for (i = 0; i < passages.length; i += 1) {
      var before = firstPiece(ctx.openedPieces, holding(passages[i]), null);
      if (before) return { was: before.anchor };
    }
    return null;
  }

  /** The pieces a report entry's scope names, looked in first: its section's, the headline's, the byline's, the hero's or the sidebar's. */
  function scopePieces(scope) {
    var m = /^section:(.*)$/.exec(asString(scope));
    if (m) return inSection(m[1]);
    var kinds = { headline: 'headline', byline: 'byline', heroImage: 'hero', evidenceCards: 'sidebar' };
    var kind = hasOwn(kinds, scope) ? kinds[scope] : null;
    return kind ? function (piece) { return piece.anchor.kind === kind; } : null;
  }

  /** The filename or the id an element's text names, as lib/hand-edit-diff.js editValueText writes an element ("filename: p3.jpg; caption: ..."). */
  function namedIn(text) {
    var m = /(?:^|; )(filename|tokenId): ([^;]+)/.exec(asString(text));
    return m ? { field: m[1], value: m[2].trim() } : null;
  }

  /**
   * The key of the section a report entry is about whole (brief 4.10e), such as a section the
   * director put in whole that code put back without a photo the article cannot print: its scope
   * names the section, and its place names the section and nothing in it, as lib/hand-edit-diff.js
   * editWhere names a whole section. Null for any other entry.
   */
  function wholeSectionKey(entry) {
    var m = /^section:(.*)$/.exec(asString(entry.scope));
    if (!m || entry.moved === true || entry.cut === true || entry.removed === true) return null;
    return asString(entry.where) === 'section "' + m[1] + '"' ? m[1] : null;
  }

  /**
   * Where an edit a round changed sits: beside the piece that prints what the director's text
   * became, or, for a block a pass moved, the block itself, the entry's section first; for an
   * entry about a whole section, whose text no one piece prints, on that section's heading (brief
   * 4.10e); beside the director's text code put back, for a block that may print twice (task
   * 4.14c, `maybeCopies`); possibly resolved when only the article as the stop opened it printed
   * that; beside no piece when the pass took it out.
   */
  function changedPlace(entry, ctx) {
    var prefer = scopePieces(entry.scope);
    var target;
    if (entry.moved === true) {
      if (typeof entry.became !== 'string') return null;
      var went = /section "([^"]*)"/.exec(entry.became);
      if (went) prefer = inSection(went[1]);
      target = asString(entry.director);
    } else if (maybeCopyTexts(entry).length > 0) {
      target = asString(entry.director);
    } else {
      target = typeof entry.became === 'string' ? entry.became : '';
    }
    if (!collapsedText(target)) return null;
    var whole = wholeSectionKey(entry);
    if (whole !== null) {
      return locate(ctx, function (piece) { return piece.anchor.kind === 'heading' && piece.sectionKey === whole; }, null);
    }
    var name = namedIn(target);
    return locate(ctx, function (piece) {
      return holdsText(piece, target) || (name !== null && isPlainObject(piece.block) && piece.block[name.field] === name.value);
    }, prefer);
  }

  /**
   * How the desk phrases an edit a round changed (changedEditLine, every stop's builder): its
   * place as the report names it, each section by its label on the desk (its heading, else its
   * id), with no edit id, since the desk shows none.
   */
  function deskEditLineOptions(bundle) {
    var words = function (text) {
      return asString(text).replace(/section "([^"]*)"/gi, function (_, key) { return sectionLabelOfKey(bundle, key); });
    };
    return {
      place: function (entry) { return capitalized(words(asString(entry.where) || scopeLabel(entry.scope))); },
      valueText: function (text) {
        var m = /^(another place in )?section "([^"]*)"$/.exec(asString(text));
        return m ? (m[1] || '') + sectionLabelOfKey(bundle, m[2]) : text;
      }
    };
  }

  /** The article's section headings, folded as a quote is looked for (lib/hand-edit-diff.js sectionHeadings). */
  function headingsOf(bundle) {
    var out = new Set();
    sectionsIn(bundle).forEach(function (section) {
      if (isPlainObject(section) && asString(section.heading).trim()) out.add(foldQuote(section.heading));
    });
    return out;
  }

  /**
   * The marks in their order (DESK_MARK_ORDER), each beside its piece, folded below as possibly
   * resolved, or beside no piece; a mark that repeats another of its tone and text at the same
   * place is shown once.
   */
  function placeMarks(found, ctx) {
    var ordered = found.map(function (mark, i) { return { mark: mark, i: i }; }).sort(function (a, b) {
      return (DESK_MARK_ORDER.indexOf(a.mark.tone) - DESK_MARK_ORDER.indexOf(b.mark.tone)) || (a.i - b.i);
    });
    var at = {};
    var apart = [];
    var resolved = [];
    var put = function (list, mark) {
      if (!list.some(function (m) { return m.tone === mark.tone && m.text === mark.text; })) list.push(mark);
    };
    ordered.forEach(function (entry, n) {
      var place = entry.mark.place;
      var mark = { key: 'mark-' + n, tone: entry.mark.tone, label: DESK_MARK_LABELS[entry.mark.tone], text: entry.mark.text, where: '', anchor: null };
      if (place && place.at) {
        mark.anchor = place.at;
        mark.where = pieceWords(place.at, ctx.current);
        var key = deskAnchorKey(place.at);
        if (!hasOwn(at, key)) at[key] = [];
        put(at[key], mark);
      } else if (place && hasOwn(place, 'was')) {
        mark.where = pieceWords(place.was, ctx.opened);
        put(resolved, mark);
      } else {
        put(apart, mark);
      }
    });
    return { at: at, apart: apart, resolved: resolved };
  }

  /**
   * The desk's marks (spec 6.2 and 6.3): each mark, `{key, tone, label, text, where, anchor}`,
   * beside the piece of the desk it is about, or apart:
   * - the judge's issues left unresolved at the cap (an escalated evaluation's structural
   *   issues), each by the sentence it quotes (tone `judge`), read past its leading rule ids
   *   (judgeMarkText; brief 4.10c);
   * - the fact check's findings (brief 4.7a), each by its place (findingPlace): its must-fix
   *   flags (`structural`) and its advisories (`advisory`); one under a director's edit's id is a
   *   concern (`concern`). Each says what is wrong in the article there, in the director's
   *   words: the finding's line for its place (findingLine; brief 4.10b), never the message the
   *   rework reads;
   * - the judge's concerns about the director's edits, each beside the line it quotes (`concern`),
   *   read past its prefix, its ids and its leading rule ids (judgeMarkText);
   * - the edits a round changed that a stop shows (changedEditsToShow), each beside what the
   *   director's text became (`changed`), an entry about a whole section on its heading (brief
   *   4.10e), with the rework's reason for a send-back's.
   * The judge's score, its notes on the writing and every other advisory of its are not marks.
   *
   * @param {Object} data - the article stop's payload: `contentBundle` (the article as the stop
   *   opened it), `factCheck`, `lastEvaluation`, `handEditReport`, and `evidenceIndex`, which
   *   names a card's document
   * @param {Object} current - the bundle on the desk (Article.js getCurrentBundle)
   * @returns {{at: Object<string, Object[]>, apart: Object[], resolved: Object[]}} the marks by
   *   the key of the piece they sit beside (deskAnchorKey), the marks beside no piece, and the
   *   marks possibly resolved, each `where` naming the piece it was beside when the stop opened
   */
  function deskMarks(data, current) {
    var d = isPlainObject(data) ? data : {};
    var desk = deskLogic();
    var opened = isPlainObject(d.contentBundle) ? d.contentBundle : {};
    var onDesk = isPlainObject(current) ? current : opened;
    var ctx = {
      desk: desk,
      opened: opened,
      current: onDesk,
      changes: desk.deskChanges(opened, onDesk),
      openedPieces: desk.printedPlaces(opened),
      currentPieces: desk.printedPlaces(onDesk),
      headings: headingsOf(opened)
    };
    var found = [];
    var add = function (tone, text, place) {
      if (asString(text).trim()) found.push({ tone: tone, text: asString(text), place: place });
    };

    var evaluation = isPlainObject(d.lastEvaluation) && d.lastEvaluation.source !== FACT_CHECK_SOURCE ? d.lastEvaluation : null;
    if (evaluation && evaluation.escalatedToHuman === true) {
      stringList(evaluation.structuralIssues).forEach(function (issue) { add('judge', judgeMarkText(issue), quotePlace(issue, ctx)); });
    }

    var occurrences = {};
    asArray(isPlainObject(d.factCheck) ? d.factCheck.findings : null).filter(isPlainObject).forEach(function (finding) {
      var key = asString(finding.kind) + '\u0000' + asString(finding.message) + '\u0000' + JSON.stringify(finding.place || null);
      var occurrence = hasOwn(occurrences, key) ? occurrences[key] : 0;
      occurrences[key] = occurrence + 1;
      var concern = typeof finding.editId === 'string' && finding.editId !== '';
      var tone = concern ? 'concern' : (finding.status === 'structural' ? 'structural' : 'advisory');
      add(tone, findingLine(finding, d.evidenceIndex), findingPlace(finding, occurrence, ctx));
    });

    if (evaluation) {
      stringList(evaluation.advisoryWarnings).filter(isDirectorEditConcern).forEach(function (text) {
        add('concern', judgeMarkText(text), quotePlace(text, ctx));
      });
    }

    var lineOptions = deskEditLineOptions(onDesk);
    changedEditsToShow(d.handEditReport).forEach(function (entry) {
      add('changed', changedEditLine(entry, lineOptions), changedPlace(entry, ctx));
    });

    return placeMarks(found, ctx);
  }

  /**
   * The marks beside one piece of the desk.
   *
   * @param {Object} marks - deskMarks(...)
   * @param {Object} anchor - the piece, as printedPlaces names it
   * @returns {Object[]}
   */
  function deskMarksAt(marks, anchor) {
    var at = isPlainObject(marks) && isPlainObject(marks.at) ? marks.at : {};
    var key = deskAnchorKey(anchor);
    return key && hasOwn(at, key) ? at[key] : [];
  }

  /**
   * The echo above the headline (task 4.10; the integrator's ruling 5): the story the director
   * settled at the meeting and the question it carries, read-only, each as text (a non-string
   * reads as empty), under the labels the meeting gives them; null when the stop sends none.
   *
   * @param {Object} data - the article stop's payload, with its `settledStory`
   * @returns {{title: string, storyLabel: string, story: string, questionLabel: string, question: string}|null}
   */
  function deskEcho(data) {
    var settled = isPlainObject(data) && isPlainObject(data.settledStory) ? data.settledStory : null;
    if (!settled) return null;
    return {
      title: DESK_ECHO_TITLE,
      storyLabel: MEETING_LINE_LABELS.story,
      story: asString(settled.story).trim(),
      questionLabel: MEETING_LINE_LABELS.question,
      question: asString(settled.question).trim()
    };
  }

  /**
   * The desk (spec 6.3): everything Article.js and the harness show of the article stop beside
   * the article itself.
   * - `echo`: the settled story above the headline (deskEcho);
   * - `marks`: deskMarks', each beside its piece (deskMarksAt);
   * - `apart`: the marks with no piece, one line each beside the approve button, where its
   *   count is;
   * - `folds`, below the article: the marks possibly resolved, the fact check's list
   *   (factCheckSummary, whose structural count is the approve button's), and the title of the
   *   round's record (RevisionDiff). The trace folds there too, through traceView.
   * There is no score.
   *
   * @param {Object} data - the article stop's payload
   * @param {Object} current - the bundle on the desk
   * @returns {Object}
   */
  function deskView(data, current) {
    var d = isPlainObject(data) ? data : {};
    var marks = deskMarks(d, current);
    var summary = factCheckSummary(d.factCheck || null);
    var rounds = roundsBanner(d.humanRevisionCount, d.revisionCount, d.maxRevisions);
    return {
      echo: deskEcho(d),
      marks: marks,
      apart: { any: marks.apart.length > 0, title: 'Not beside any block (' + marks.apart.length + ')', items: marks.apart },
      folds: {
        resolved: {
          any: marks.resolved.length > 0,
          title: 'Possibly resolved by your edits (' + marks.resolved.length + ')',
          hint: DESK_RESOLVED_HINT,
          items: marks.resolved
        },
        factCheck: { any: summary.groups.length > 0, title: 'Fact check: ' + summary.structural + ' structural, ' + summary.advisory + ' advisory', summary: summary },
        rounds: { title: rounds.roundLabel + ': your notes, and what the reworks did to your edits' }
      }
    };
  }

  // ── A send-back that did not run, at the map and the desk (task 4.14e) ───────

  /** The stops that send back what the line names: the map and the article. */
  var SENT_BACK_NOUNS = ['map', 'article'];

  /**
   * The one line for a send-back at the map or the desk whose rework did not run (task 4.14e;
   * the final review's ruling 5; data.roundDidNotRun, lib/workflow/state.js roundDidNotRunAt):
   * the stop is as the director left it, and the line says how to retry with what the note box
   * holds, as the story meeting's line does (didNotRunLine): a note the box holds is sent again as
   * it is; one it does not hold is given back word for word. Outline.js and Article.js show it,
   * and the harness's pages print it (lib/stop-pages.js).
   *
   * @param {Object|null} round - data.roundDidNotRun
   * @param {string} note - the stop's note box
   * @param {string} noun - what the stop sends back: 'map' or 'article'
   * @returns {string}
   * @throws {Error} for any other noun
   */
  function reworkDidNotRunLine(round, note, noun) {
    if (SENT_BACK_NOUNS.indexOf(noun) === -1) {
      throw new Error('reworkDidNotRunLine: the line names the map or article a send-back carries, not ' + String(noun));
    }
    if (!isPlainObject(round)) return '';
    var line = 'Your send-back did not run: the writer failed, and the ' + noun + ' is as you left it.';
    var written = asString(round.note).trim();
    if (!written) return line + ' To retry, write a note and send the ' + noun + ' back.';
    if (holdsRoundNote(round, note)) return line + ' Your note is in the box: send the ' + noun + ' back again to retry.';
    return line + ' To retry, write your note in the box again and send the ' + noun + ' back. Your note was: "' + written + '"';
  }

  // ── A thread from before the story meeting (phase 4, task 4.11; R2) ─────────

  /**
   * What the console shows for a thread the server flags as started before the story
   * meeting (lib/old-thread.js; GET /checkpoint's `oldThread`, and a refused request's
   * body): the server's message, a button for the rollback it names, and the rollback
   * points the stepper opens. app.js shows it in place of the stop, and above a finished
   * session's completion. The message and the points are the server's; the console words
   * the button from its stop labels. The server decides the line once: a thread with no
   * weave gets one, and a thread on phase 4's shapes another (brief 1G), each shown as sent.
   *
   * @param {Object|null} holder - a stop's payload, a loaded completion or a refused request's body
   * @param {Object} labels - the console's stop labels (utils.js CHECKPOINT_LABELS)
   * @returns {{message: string, rollbackTo: string, rollbackLabel: string, rollbackPoints: string[]}|null}
   */
  function oldThreadView(holder, labels) {
    var flag = isPlainObject(holder) ? holder.oldThread : null;
    if (!isPlainObject(flag) || !asString(flag.message) || !asString(flag.rollbackTo)) return null;
    var label = isPlainObject(labels) && asString(labels[flag.rollbackTo]) ? labels[flag.rollbackTo].toLowerCase() : flag.rollbackTo;
    return {
      message: flag.message,
      rollbackTo: flag.rollbackTo,
      rollbackLabel: 'Roll back to the ' + label,
      rollbackPoints: stringList(flag.rollbackPoints)
    };
  }

  // ── RevisionDiff's key walk (fix 3.7b) ──────────────────────────────────────

  /**
   * The keys RevisionDiff compares: every top-level key of either version, each once,
   * sorted. A missing version reads as empty.
   *
   * @param {Object|Array|null} previous
   * @param {Object|Array|null} current
   * @returns {string[]}
   */
  function revisionDiffKeys(previous, current) {
    var keys = Object.keys(previous || {}).concat(Object.keys(current || {}));
    return keys
      .filter(function (key, index) { return keys.indexOf(key) === index; })
      .sort();
  }

  var api = {
    // F1: the director's edits are final (copies of lib/hand-edit-diff.js, held equal by a test)
    DIRECTOR_EDIT_PREFIX: DIRECTOR_EDIT_PREFIX,
    SEND_BACK_PASS: SEND_BACK_PASS,
    DIRECTOR_EDIT_CONCERNS_LABEL: DIRECTOR_EDIT_CONCERNS_LABEL,
    accusationView: accusationView,
    whiteboardView: whiteboardView,
    factCheckSummary: factCheckSummary,
    cardLocationText: cardLocationText,
    approveLabel: approveLabel,
    wordTail: wordTail,
    steeringView: steeringView,
    changedEditLine: changedEditLine,
    standingNotesView: standingNotesView,
    concernsBesideLines: concernsBesideLines,
    editReportOf: editReportOf,
    traceView: traceView,
    roundsBanner: roundsBanner,
    // Task 4.14g: the desk's actions, one list
    DESK_ACTIONS: DESK_ACTIONS,
    articleReviewPayload: articleReviewPayload,
    sendBackButton: sendBackButton,
    noteSlotKey: noteSlotKey,
    // Phase 2, brief 2.2: the director's words
    verdictView: verdictView,
    // Phase 3, brief 3.5: the split final vote at the input review
    votesView: votesView,
    exposuresView: exposuresView,
    characterIdCards: characterIdCards,
    characterIdsPayload: characterIdsPayload,
    // Phase 4, brief 4.2: the leave-out box at the character-IDs stop
    characterIdLeaveOutTicks: characterIdLeaveOutTicks,
    characterIdsSkipPayload: characterIdsSkipPayload,
    // Phase 3, brief 3.7: the kinds of the writer's questions, which the story meeting asks
    WRITER_QUESTION_KIND_LABELS: WRITER_QUESTION_KIND_LABELS,
    // Phase 4, task 4.8: the story meeting on screen
    MEETING_STOP: MEETING_STOP,
    MEETING_ACTIONS: MEETING_ACTIONS,
    // Phase 4b, piece 3 (brief 3B): the console's copy of lib/weave.js ANGLE_FIELDS, held equal by a test
    ANGLE_FIELDS: ANGLE_FIELDS,
    CONNECTION_KINDS: CONNECTION_KINDS,
    // Phase 4b (brief 1B): the evidence under each line, folded (the map reuses the fold's view),
    // and the console's copies of lib/evidence.js's sources and stances and of the evidence's key
    // (held equal by a test)
    EVIDENCE_SOURCE_LABELS: EVIDENCE_SOURCE_LABELS,
    EVIDENCE_STANCES: EVIDENCE_STANCES,
    EVIDENCE_KEY: EVIDENCE_KEY,
    EVIDENCE_FOLD_TITLE: EVIDENCE_FOLD_TITLE,
    evidenceFoldLabel: evidenceFoldLabel,
    CUTS_AGAINST_LABEL: CUTS_AGAINST_LABEL,
    MEETING_NO_EVIDENCE_LINE: MEETING_NO_EVIDENCE_LINE,
    MEETING_RETIRED_KEYS: MEETING_RETIRED_KEYS,
    MEETING_NOTHING_FOUND_LINE: MEETING_NOTHING_FOUND_LINE,
    evidenceFoldView: evidenceFoldView,
    WEAVE_ANSWER_KEY: WEAVE_ANSWER_KEY,
    DIRECTOR_WEAVE_SHAPE: DIRECTOR_WEAVE_SHAPE,
    PICKED_KEY: PICKED_KEY,
    THIN_NOTES_LINE: THIN_NOTES_LINE,
    MEETING_LINE_LABELS: MEETING_LINE_LABELS,
    // 3 fix A: a line of an angle's pitch as a place names it, from MEETING_LINE_LABELS (held to
    // lib/meeting.js ANGLE_FIELD_PLACES by a test)
    ANGLE_FIELD_WORDS: ANGLE_FIELD_WORDS,
    ANGLE_OPEN_LINE: ANGLE_OPEN_LINE,
    VERDICT_LOCK_LINE: VERDICT_LOCK_LINE,
    MEETING_ROLLBACK_LINE: MEETING_ROLLBACK_LINE,
    meetingWeaveOf: meetingWeaveOf,
    meetingVersion: meetingVersion,
    meetingPendingSlot: meetingPendingSlot,
    meetingDraftOf: meetingDraftOf,
    meetingNoteOf: meetingNoteOf,
    pendingEditsAfterCheckpoint: pendingEditsAfterCheckpoint,
    // Phase 4b, piece 3 (brief 3B): the open angle (the console's copy of lib/weave.js
    // pickedAngleOf) and its story (the copy of settledAngleOf's threads), each held equal by a
    // test, and the director's changes on angles
    openAngleOf: openAngleOf,
    openStoryOf: openStoryOf,
    pickMeetingAngle: pickMeetingAngle,
    setAngleField: setAngleField,
    setThreadField: setThreadField,
    flipMeetingThread: flipMeetingThread,
    addMeetingThread: addMeetingThread,
    removeMeetingThread: removeMeetingThread,
    setQuestionAnswer: setQuestionAnswer,
    meetingWeaveChanges: meetingWeaveChanges,
    // Fix round 1 (R9): the director's version as the gate stores it, which the reweave's offer
    // reads (the copy of lib/meeting.js withUnsentAnglesAsShown, held equal by a test)
    withUnsentAnglesAsShown: withUnsentAnglesAsShown,
    meetingWeaveProblems: meetingWeaveProblems,
    meetingPayload: meetingPayload,
    meetingButtons: meetingButtons,
    // Task 4.5c: Approve's question for a note restored after a round that did not run, and
    // the console's copies of the server's weave fields and elements (held equal by a test)
    meetingApproveAsk: meetingApproveAsk,
    WEAVE_TEXT_FIELDS: WEAVE_TEXT_FIELDS,
    ELEMENT_WORDS: ELEMENT_WORDS,
    meetingVerdictView: meetingVerdictView,
    receiptView: receiptView,
    concernFindingOf: concernFindingOf,
    meetingView: meetingView,
    meetingStandingNotes: meetingStandingNotes,
    rollbackWarningLine: rollbackWarningLine,
    // Phase 4, task 4.9: the map on screen
    MAP_STOP: MAP_STOP,
    MAP_ACTIONS: MAP_ACTIONS,
    MAP_NOTE_SOURCE: MAP_NOTE_SOURCE,
    MAP_CARDS: MAP_CARDS,
    // Phase 4b (brief 1D): the mark beside a move whose evidence prints as a card, and the fold of a
    // beat the director added with no evidence yet
    MAP_CARD_MARK: MAP_CARD_MARK,
    MAP_SECTIONS: MAP_SECTIONS,
    MAP_PRINTS_AS_CARD: MAP_PRINTS_AS_CARD,
    MAP_LEGEND_TITLE: MAP_LEGEND_TITLE,
    MAP_TONES: MAP_TONES,
    MAP_NO_HEADING_LINE: MAP_NO_HEADING_LINE,
    MAP_NO_TOP_PHOTO_LINE: MAP_NO_TOP_PHOTO_LINE,
    MAP_EMPTIED_COLUMN_LINE: MAP_EMPTIED_COLUMN_LINE,
    MAP_SUMMARY_TOGGLE: MAP_SUMMARY_TOGGLE,
    // Fix B1: the words the board's controls show
    MAP_CONTROLS: MAP_CONTROLS,
    MAP_NO_EVIDENCE_LINE: MAP_NO_EVIDENCE_LINE,
    stopVersion: stopVersion,
    mapVersion: mapVersion,
    mapPendingSlot: mapPendingSlot,
    mapDraftOf: mapDraftOf,
    mapNoteOf: mapNoteOf,
    mapProblems: mapProblems,
    mapPayload: mapPayload,
    mapButtons: mapButtons,
    mapTallyOf: mapTallyOf,
    mapLineKeyOf: mapLineKeyOf,
    mapLinesOnPage: mapLinesOnPage,
    mapEditLineOptions: mapEditLineOptions,
    // Brief 4C: the one reader of the beat a report entry's place names, and the field a beat's
    // summary is in (a copy of lib/hand-edit-diff.js's, held equal by a test)
    beatOfPlace: beatOfPlace,
    MAP_SUMMARY_FIELD: MAP_SUMMARY_FIELD,
    mapView: mapView,
    mapPhotoUrl: mapPhotoUrl,
    // Task 4.14b: going back to the map, a photo left out since the map, a section the director
    // emptied, and a change to the weave named by its place
    MAP_ROLLBACK_LINE: MAP_ROLLBACK_LINE,
    LEFT_OUT_PHOTO_LINE: LEFT_OUT_PHOTO_LINE,
    EMPTIED_SECTION_LINE: EMPTIED_SECTION_LINE,
    weaveChangeSource: weaveChangeSource,
    // Phase 4, task 4.10: the desk's marks, and one rule for the changed lines a stop shows
    REWEAVE_PASS: REWEAVE_PASS,
    changedEditsToShow: changedEditsToShow,
    // Brief 4.10b: the line that says the director's edits stand, and where a finding's line names
    // a card's document (a copy of lib/content-bundle-fact-check.js DOCUMENT_SLOT, held equal by a test)
    editsStandLine: editsStandLine,
    DOCUMENT_SLOT: DOCUMENT_SLOT,
    // Brief 4.10c: whether a mark of the round is about a report entry, the meeting's reading of the
    // entry's place, which a test holds to lib/hand-edit-diff.js editWhere
    markOfEntry: markOfEntry,
    deskAnchorKey: deskAnchorKey,
    deskMarks: deskMarks,
    deskMarksAt: deskMarksAt,
    deskEcho: deskEcho,
    deskView: deskView,
    // The console's copies of the server's rules for where a finding sits, each held equal by a
    // test: lib/grounding.js's reading of a quote, the passages lib/hand-edit-diff.js
    // locateQuotedText locates by, and lib/content-bundle-fact-check.js sectionIdOf
    quotedPassagesOf: quotedPassagesOf,
    groundingText: groundingText,
    MIN_QUOTE_WORDS: MIN_QUOTE_WORDS,
    locatingPassages: locatingPassages,
    headingsOf: headingsOf,
    findingSectionId: findingSectionId,
    // Task 4.14e: a send-back at the map or the desk whose rework did not run
    reworkDidNotRunLine: reworkDidNotRunLine,
    // Phase 4, task 4.11: a thread from before the story meeting
    oldThreadView: oldThreadView,
    // Fix 3.7b: RevisionDiff's key walk
    revisionDiffKeys: revisionDiffKeys
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.checkpointViewLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
