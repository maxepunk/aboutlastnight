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
   * meetingView, which names its places as its page heads them and a role as its picker
   * names it (task 4.8, fix round 1).
   * - A connection the director struck (brief 4.5) that a pass brought back or took out;
   *   after an automatic pass or a reweave, whether code struck it again.
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
   *   map (task 4.9) names the element a beat or a photo, and the desk a Key Evidence entry an
   *   entry (task 4.14c).
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
    if (entry.cut === true && asString(entry.tokenId)) {
      var putBack = label + ': ' + by + ' put back the ' + thing + ' you deleted.';
      if (!held) return putBack + ' ' + why;
      return putBack + (entry.restored === true ? ' It was taken out again.' : ' It could not be taken out again.');
    }
    if (entry.cut === true) return label + ': the text you cut came back' + cameBackAs + ' (' + by + '). ' + (held ? stillInLine(o.stillIn) : why);
    if (entry.removed === true) return label + ': a sentence you removed came back' + cameBackAs + ' (' + by + '). ' + (held ? stillInLine(o.stillIn) : why);
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
   * came back, a moved element a pass removed, a struck connection that could not be struck
   * again. A block code put back in its section out of the director's order (`inOrder` false,
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
   * (steeringView, which RevisionDiff prints; brief 4.10c).
   *
   * @param {*} report - a stop's handEditReport
   * @returns {string}
   */
  function editsStandLine(report) {
    var read = editReportOf(report);
    if (!read || changedEditsToShow(read).length > 0) return '';
    var n = read.checked.length;
    if (n === 1) return 'Your edit stands.';
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
        ? 'Confirm sending the ' + noun + ' back, which starts a rework'
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
  // The arc stop is the story meeting: a page of at most 300 words, at the level of the
  // story, that the director reads and settles in minutes (phase 4b, brief 1B; spec
  // 2026-10-05 section 4.1). ArcSelection.js renders it from meetingView and changes the
  // weave only through the operations below; it sends only meetingPayload's payloads,
  // 4.5's `{meeting: 'approve' | 'reweave' | 'send-back', weave, note}` (lib/meeting.js
  // meetingResume), each held first to meetingWeaveProblems, the gate's decisions. What
  // the director types is sent as typed. The evidence under each line is the writers', so the
  // page folds it, and no change of the director's touches it (R6).

  /** The meeting's stop type: the stop types keep their names (R3). */
  var MEETING_STOP = 'arc-selection';

  /** The meeting's three actions. A copy of lib/meeting.js MEETING_ACTIONS; a test holds the two equal. */
  var MEETING_ACTIONS = ['approve', 'reweave', 'send-back'];

  /**
   * Each role a thread can take, in the meeting's order, with the word the role picker
   * shows. The keys are lib/weave.js WEAVE_ROLES (a test holds them equal).
   */
  var WEAVE_ROLE_LABELS = {
    'main-thread': 'Main thread',
    'grounds-it': 'Grounds it',
    'complicates-it': 'Complicates it',
    'mirrors-it': 'Mirrors it',
    'carries-it-forward': 'Carries it forward',
    'left-out': 'Left out'
  };

  /**
   * What two threads share at a connection: a copy of lib/weave.js CONNECTION_KINDS (a test
   * holds the two equal). The kind stays underneath, unprinted (R1): the gate's shape reads it.
   */
  var CONNECTION_KINDS = ['person', 'moment', 'document', 'line'];

  /** The role of a thread the story does not need: a copy of lib/weave.js LEFT_OUT_ROLE (a test holds the two equal). */
  var LEFT_OUT_ROLE = 'left-out';

  /**
   * Copies of lib/weave.js STRUCK_KEY and of lib/writer-questions.js WEAVE_ANSWER_KEY, which
   * the browser cannot import; a test holds each equal.
   */
  var STRUCK_KEY = 'struck';
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
  var WEAVE_TEXT_FIELDS = ['story', 'question', 'headline', 'fromYourNotes', 'convergence'];

  /** The fields the director edits in place (spec 4.4). */
  var MEETING_EDITABLE_FIELDS = ['story', 'question', 'headline', 'convergence'];

  /**
   * One piece of evidence, as the gate's director-side schema holds it (lib/evidence.js
   * EVIDENCE_PIECE_SCHEMA, which both the weave's and the map's schemas embed).
   */
  var EVIDENCE_PIECE_SHAPE = { list: {
    required: ['sources', 'shows', 'stance'],
    fields: { sources: 'nonEmptyStrings', shows: 'string', stance: EVIDENCE_STANCES, card: 'boolean' }
  } };

  /**
   * The weave as the director leaves it, as the gate's director-side schema holds it
   * (lib/meeting.js DIRECTOR_WEAVE_SCHEMA, which the browser cannot import): each
   * property's type ('string', 'boolean', 'strings' for a list of text, 'nonEmptyStrings'
   * for one that holds at least one, an enum's values, or a list's or an object's own
   * shape) and the names required. A thread the director adds is its id, name, line and
   * role; the evidence, the writers', is held to its shape wherever a line carries it
   * (phase 4b, brief 1B). A test builds this shape from DIRECTOR_WEAVE_SCHEMA and holds the
   * two equal.
   */
  var DIRECTOR_WEAVE_SHAPE = {
    required: ['story', 'question', 'headline', 'threads', 'connections', 'convergence', 'questions'],
    fields: {
      story: 'string',
      question: 'string',
      headline: 'string',
      fromYourNotes: 'string',
      threads: { list: {
        required: ['id', 'name', 'line', 'role'],
        fields: { id: 'string', name: 'string', line: 'string', role: Object.keys(WEAVE_ROLE_LABELS), verdict: 'boolean', reason: 'string', evidence: EVIDENCE_PIECE_SHAPE }
      } },
      connections: { list: {
        required: ['id', 'joins', 'line', 'kind'],
        fields: { id: 'string', joins: 'strings', line: 'string', kind: CONNECTION_KINDS, evidence: EVIDENCE_PIECE_SHAPE, struck: 'boolean' }
      } },
      convergence: 'string',
      strongerMainThread: { object: { required: ['thread', 'reason'], fields: { thread: 'string', reason: 'string' } } },
      questions: { list: {
        required: ['id', 'kind', 'about', 'question', 'changes'],
        fields: { id: 'string', kind: Object.keys(WRITER_QUESTION_KIND_LABELS), about: 'string', question: 'string', changes: 'string', answer: 'string' }
      } }
    }
  };

  /** The line beside the story when the weave has no "from your notes" (the director, 2026-10-03, on thin notes). */
  var THIN_NOTES_LINE = "Your notes end without your read of the session, so this story is the writer's proposal.";

  /** Why the controls of a line under a writer's repeated id are off, while they are. */
  var REPEATED_ID_HINT = 'The writer gave one id to more than one thread or connection, so the meeting cannot change those lines: a reweave with a note, or a send-back, gives each its own id.';

  /** Why Reweave is not offered, while it is not (the integrator's ruling 5). */
  var REWEAVE_HINT = 'Reweave fits your changes and your note into the weave: change the weave or write a note first.';

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

  function checkedRole(role, operation) {
    if (!hasOwn(WEAVE_ROLE_LABELS, role)) {
      throw new Error(operation + ': a thread takes one of the meeting\'s roles (' + Object.keys(WEAVE_ROLE_LABELS).join(', ') + '), not ' + String(role));
    }
    return role;
  }

  /** The story, the question, the headline or the convergence, as typed. */
  function setMeetingField(weave, field, text) {
    if (MEETING_EDITABLE_FIELDS.indexOf(field) === -1) {
      throw new Error('setMeetingField: the meeting edits the story, question, headline or convergence in place, not ' + String(field));
    }
    var next = editedWeave(weave, 'setMeetingField');
    next[field] = typeof text === 'string' ? text : '';
    return next;
  }

  /** A thread's role, from the list. */
  function setThreadRole(weave, index, role) {
    checkedRole(role, 'setThreadRole');
    var next = editedWeave(weave, 'setThreadRole');
    elementAt(next.threads, index, 'setThreadRole', 'thread').role = role;
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
   * A thread the writer missed (phase 4b, brief 1B): its name, its line and its role, under an
   * id of its own, `{id, name, line, role}`, as typed. It carries no evidence and no reason,
   * which the director-side schema allows: the map writer finds its evidence (spec 5.3). With
   * no name and no line it adds none; either alone is kept as typed, the other left blank.
   *
   * @param {Object} weave - the weave as the director has it
   * @param {string} name - the thread's short name
   * @param {string} line - the thread in one line
   * @param {string} role - one of the meeting's roles
   * @returns {Object} the weave with the thread, or the weave given when there is nothing to add
   */
  function addMeetingThread(weave, name, line, role) {
    checkedRole(role, 'addMeetingThread');
    var typedName = typeof name === 'string' ? name : '';
    var typedLine = typeof line === 'string' ? line : '';
    if (!typedName.trim() && !typedLine.trim()) return weave;
    var next = editedWeave(weave, 'addMeetingThread');
    next.threads.push({ id: freshThreadId(next.threads), name: typedName, line: typedLine, role: role });
    return next;
  }

  /** A thread taken out again: the meeting offers it only for a thread added at this look. */
  function removeMeetingThread(weave, index) {
    var next = editedWeave(weave, 'removeMeetingThread');
    elementAt(next.threads, index, 'removeMeetingThread', 'thread');
    next.threads.splice(index, 1);
    return next;
  }

  /** A connection struck (`struck: true`), or unstruck: the key comes off, and the writer's connection is back as it was. */
  function setConnectionStruck(weave, index, struck) {
    var next = editedWeave(weave, 'setConnectionStruck');
    var connection = elementAt(next.connections, index, 'setConnectionStruck', 'connection');
    if (struck) connection[STRUCK_KEY] = true;
    else delete connection[STRUCK_KEY];
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

  function isStruckConnection(connection) {
    return Boolean(connection && typeof connection === 'object' && connection[STRUCK_KEY] === true);
  }

  /**
   * The left-out threads a connection joins (brief 4.14a): each id it joins under which the weave
   * holds threads and every one of them is left out, in the order it names them, each once. A copy
   * of lib/weave.js leftOutThreadsJoined, which the browser cannot import; a test holds the two
   * equal on one corpus. Such a connection is out of the story with its thread, and comes back
   * when the thread does.
   *
   * @param {Object} connection
   * @param {Object} weave - the weave as the director has it
   * @returns {string[]}
   */
  function leftOutThreadsOf(connection, weave) {
    var joins = isPlainObject(connection) && Array.isArray(connection.joins) ? connection.joins : [];
    var threads = asArray(isPlainObject(weave) ? weave.threads : null).filter(isPlainObject);
    var out = [];
    joins.map(function (id) { return asString(id).trim(); }).forEach(function (id) {
      if (!id || out.indexOf(id) !== -1) return;
      var under = threads.filter(function (thread) { return weaveIdOf(thread) === id; });
      if (under.length > 0 && under.every(function (thread) { return thread.role === LEFT_OUT_ROLE; })) out.push(id);
    });
    return out;
  }

  /**
   * The line under a connection that goes out of the story with a left-out thread (brief 4.14a),
   * or '' for a connection in the story: which threads it goes with, by their names (phase 4b,
   * brief 1B), and that bringing them in brings it back.
   *
   * @param {string[]} threads - the left-out threads it joins (leftOutThreadsOf)
   * @param {Object} words - meetingWordsOf's, which names them
   * @returns {string}
   */
  function leftOutLine(threads, words) {
    if (threads.length === 0) return '';
    var named = words.joinsText(threads);
    if (threads.length === 1) return 'Out of the story with ' + named + ', which is left out. Bring it in and this connection comes back.';
    return 'Out of the story with ' + named + ', which are left out. Bring ' + (threads.length === 2 ? 'both' : 'all of them') + ' in and this connection comes back.';
  }

  /**
   * The changes between two weaves, one per place, as lib/hand-edit-diff.js
   * weaveEditsBetween finds them (a test holds the two equal): each text field and the
   * stronger main thread whole; each thread and connection found by its id, field by
   * field, added whole or taken out whole; a connection struck as one change of the whole,
   * and one brought back as one change of the whole too (task 4.5c). The questions are not
   * read: an answer is the director's words, no edit. Nor is the evidence under a line, the
   * writers' (phase 4b, brief 1B; R6). Each change under an id either weave repeats carries
   * `repeatedId`, since no edit can find its element by the id.
   *
   * @param {*} before
   * @param {*} after
   * @returns {Array<{scope: string, id: (string|null), field: (string|null), repeatedId: boolean, struck: boolean}>}
   */
  function meetingWeaveChanges(before, after) {
    if (!isPlainObject(before) || !isPlainObject(after)) return [];
    var out = [];
    var change = function (scope, id, field, repeatedId, struck) {
      out.push({ scope: scope, id: id, field: field, repeatedId: repeatedId, struck: struck });
    };
    WEAVE_TEXT_FIELDS.concat(['strongerMainThread']).forEach(function (field) {
      if (!sameValue(before[field], after[field])) change(field, null, null, false, false);
    });
    ['threads', 'connections'].forEach(function (collection) {
      var b = elementsById(before[collection]);
      var a = elementsById(after[collection]);
      var repeated = function (id) { return b.repeated.has(id) || a.repeated.has(id); };
      a.list.forEach(function (entry) {
        var prior = b.map.get(entry.key);
        if (!prior) {
          change(collection, entry.id, null, repeated(entry.id), false);
          return;
        }
        if (collection === 'connections' && isStruckConnection(entry.element) !== isStruckConnection(prior)) {
          change(collection, entry.id, null, repeated(entry.id), isStruckConnection(entry.element));
          return;
        }
        // Phase 4b (brief 1B; R6): the evidence is never the director's edit, so no change
        // reads it, as lib/hand-edit-diff.js withoutEvidence leaves it out.
        var p = withoutKey(collection === 'connections' ? withoutKey(prior, STRUCK_KEY) : prior, EVIDENCE_KEY);
        var e = withoutKey(collection === 'connections' ? withoutKey(entry.element, STRUCK_KEY) : entry.element, EVIDENCE_KEY);
        unionKeys(p, e).forEach(function (field) {
          if (!sameValue(p[field], e[field])) change(collection, entry.id, field, repeated(entry.id), false);
        });
      });
      b.list.forEach(function (entry) {
        if (!a.map.has(entry.key)) change(collection, entry.id, null, repeated(entry.id), false);
      });
    });
    return out;
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
  var ELEMENT_WORDS = { threads: 'thread', connections: 'connection', questions: 'question' };

  /**
   * What the gate would refuse in the weave as the director left it, as one reason, or
   * null for a weave it takes (the integrator's ruling 4; lib/meeting.js
   * directorWeaveProblems, whose decisions a test holds this to):
   * - the director-side schema (DIRECTOR_WEAVE_SHAPE);
   * - an id the director's version carries more often than the weave the meeting showed:
   *   the director's repeat;
   * - a change under an id the writer repeated: no edit could find its element by the id.
   *   A writer's repeat passes while the director leaves the elements under it as shown.
   * Both weaves are read without their code-owned keys, as the gate reads them.
   *
   * @param {*} weave - the weave as the director left it
   * @param {*} shown - the weave the meeting showed (data.weave)
   * @returns {string|null}
   */
  function meetingWeaveProblems(weave, shown) {
    var left = isPlainObject(weave) ? withoutCodeOwned(weave) : null;
    if (!left) return 'The weave as you left it must be an object, with its threads.';
    var malformed = shapeProblem(left, DIRECTOR_WEAVE_SHAPE, '');
    if (malformed) return 'The weave as you left it is malformed: ' + malformed + '.';
    var shownWeave = isWeaveValue(shown) ? withoutCodeOwned(shown) : null;
    var repeats = [];
    ['threads', 'connections', 'questions'].forEach(function (collection) {
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
      return 'The writer gave more than one ' + ELEMENT_WORDS[touched[0].scope] + ' the id "' + touched[0].id + '", so the meeting cannot tell which of them you changed. Put them back as the meeting showed them: a reweave with a note, or a send-back, gives each its own id.';
    }
    return null;
  }

  /** Whether the director changed the weave at this look: anything but an answer (ruling 5). */
  function hasWeaveChanges(shown, weave) {
    return isPlainObject(shown) && isPlainObject(weave) && meetingWeaveChanges(withoutCodeOwned(shown), withoutCodeOwned(weave)).length > 0;
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
   * changed the weave, anything but an answer, or written a note. The changes of a reweave
   * that did not run count, since they are the director's and still unfitted
   * (isUnfittedReweave). The buttons and the payload read this one rule.
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
        ariaLabel: 'Reweave: the writer fits your changes and your note into the weave, and the meeting reopens',
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

  /** What the fold says of a piece that cuts against its line. */
  var CUTS_AGAINST_LABEL = 'Cuts against';

  /**
   * The fold of a thread the director added at the story meeting while it carries no evidence:
   * the next writer finds its evidence (spec 5.3; Review focus 1). A thread of the writer's with
   * none is a check's failure, which the page shows beside it instead.
   */
  var MEETING_NO_EVIDENCE_LINE = 'Nothing yet: the map writer finds the evidence for it.';

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
   * What the page calls each of the weave's lines: ArcSelection.js heads each line with it,
   * and a mark whose line the page does not show is listed under it.
   */
  var MEETING_LINE_LABELS = {
    story: 'The story',
    question: 'The question it carries',
    headline: 'Working headline',
    fromYourNotes: 'From your notes',
    convergence: 'Where they converge',
    strongerMainThread: 'A stronger main thread'
  };

  /** The weave's fields that each have a line on the page. */
  var LINE_FIELDS = Object.keys(MEETING_LINE_LABELS);

  /**
   * The line on the page a place in the weave sits on (a path as lib/hand-edit-diff.js
   * writes it: `story`, `threads[#t3].role`, `connections[#c2]`): `story`, `thread:t3`,
   * `connection:c2`, `question:q1`, or null for a place no line shows.
   */
  function lineKeyOf(path) {
    var m = /^([A-Za-z]+)(?:\[#([^\]]*)\])?/.exec(asString(path));
    if (!m) return null;
    if (m[2] === undefined) return LINE_FIELDS.indexOf(m[1]) !== -1 ? m[1] : null;
    if (!hasOwn(ELEMENT_WORDS, m[1]) || /^index-\d+$/.test(m[2])) return null;
    return ELEMENT_WORDS[m[1]] + ':' + m[2];
  }

  /** Whether a path names a whole thread, connection or question. */
  function isElementPath(path) {
    return /^(threads|connections|questions)\[#[^\]]*\]$/.test(asString(path));
  }

  /** The field a path ends on inside an element (`role` in `threads[#t3].role`), or ''. */
  function elementFieldOf(path) {
    var m = /^[A-Za-z]+\[#[^\]]*\]\.([A-Za-z]+)/.exec(asString(path));
    return m ? m[1] : '';
  }

  /** A role's value as the role picker names it; any other text as it is. */
  function roleWord(text) {
    var t = asString(text);
    return hasOwn(WEAVE_ROLE_LABELS, t) ? WEAVE_ROLE_LABELS[t] : t;
  }

  /**
   * The words of a value the weave's diff wrote as an element's fields (lib/hand-edit-diff.js
   * editValueText: `id: t6; name: …; line: …; role: grounds-it`, or the stronger main thread's
   * `thread: t2; reason: …`), each field by its key, or null for any other text. The fields are
   * found by the keys a weave's elements carry, so a value that is plain text reads as itself.
   */
  var ELEMENT_FIELD_KEYS = ['id', 'name', 'line', 'role', 'verdict', 'reason', 'joins', 'kind', 'struck', 'about', 'question', 'changes', 'answer', 'thread'];
  var ELEMENT_FIELD_SPLIT = new RegExp('; (?=(?:' + ELEMENT_FIELD_KEYS.join('|') + '): )');
  var ELEMENT_FIELD_START = /^(?:id|thread): /;

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
   * by an id (`thread "t3", role`), and a value it writes as an element's fields, read through
   * these words.
   *
   * @param {Object} weave - the weave as the director has it
   * @param {Object|null} shown - the weave the meeting showed
   * @param {Array} marks - the round's marks (data.marks.marks)
   * @returns {{threadName: function(string): string, joinsText: function(*): string,
   *            place: function(string|null, string): string, value: function(*): string,
   *            fieldValue: function(string, *): string}}
   */
  function meetingWordsOf(weave, shown, marks) {
    var elements = { threads: new Map(), connections: new Map(), questions: new Map() };
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
    var elementPlace = function (word, id, fields) {
      var own = fields || {};
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
      if (!fields) return roleWord(text);
      if (hasOwn(fields, 'thread')) return [threadName(fields.thread), asString(fields.reason)].filter(Boolean).join(': ');
      if (hasOwn(fields, 'joins')) return asString(fields.line);
      if (hasOwn(fields, 'question')) return asString(fields.question);
      var said = [asString(fields.name), asString(fields.line)].filter(Boolean).join(': ');
      return said + (fields.role ? ' (' + roleWord(fields.role) + ')' : '');
    };
    return {
      threadName: threadName,
      /** The threads a connection joins, by name: "The sale" and "The heir". */
      joinsText: function (joins) { return namesOf(joins, true); },
      /**
       * A place in the weave as the meeting names it: one of the weave's lines by its heading
       * (MEETING_LINE_LABELS); an element by its words (`Thread "The envelope", role`), from
       * the diff's `where` (`thread "t3", role`), read from `elementText` (a report entry's
       * element, as the diff wrote it) when no weave holds it; anything else by the diff's words.
       */
      place: function (field, where, elementText) {
        if (field !== null && hasOwn(MEETING_LINE_LABELS, field)) return MEETING_LINE_LABELS[field];
        var m = ELEMENT_PLACE.exec(asString(where));
        if (!m) return capitalized(asString(where));
        return elementPlace(m[1], m[2], elementFieldsOf(elementText)) + (m[3] ? ', ' + m[3] : '');
      },
      /** A value as the meeting names it: an element by its words, a role as the role picker names it, any other text as it is. */
      value: value,
      /** A field's value as a mark names it: the threads a connection joins by name; anything else as `value` names it. */
      fieldValue: function (field, text) {
        if (field === 'joins') return namesOf(asString(text).split(' / ').filter(Boolean), false);
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
   * meeting shows none; a value as the meeting names it, an element by its words and a role as
   * the role picker names it; and text that came back as still in the weave.
   *
   * @param {Object} words - meetingWordsOf's
   */
  function meetingEditLineOptions(words) {
    return {
      place: function (entry) {
        return words.place(asString(entry.scope), asString(entry.where) || asString(entry.scope), asString(entry.director) || asString(entry.became));
      },
      valueText: words.value,
      stillIn: 'in the weave'
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
    var field = elementFieldOf(mark.path);
    if (field === VERDICT_FIELD) return verdictMarkLine(mark);
    var which = field ? ' (' + field + ')' : '';
    var before = asString(mark.before);
    if (!before) return isElementPath(mark.path) ? 'New this round.' : 'Added this round' + which + '.';
    var was = words.fieldValue(field, before);
    if (!asString(mark.after)) return 'Emptied this round' + which + '. Before: "' + was + '"';
    return 'Changed this round' + which + '. Before: "' + was + '"';
  }

  /**
   * What an element the round took out whole held, as the meeting shows it (brief 4.14a; phase
   * 4b, brief 1B): a thread by its line and its role, a connection by its line, a question by its
   * words and its kind; the place before it names the element (markPlace). Read from the element
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
    if (collection === 'threads') return quoted(element.line) + about([roleWord(asString(element.role))]);
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
   *   director's edits of the element's fields, in the report's order, each with its field (`role`)
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
   * The lines the page shows, by their keys (lineKeyOf), for the weave as the director has
   * it and the questions the stop asks: the story, the question, the headline and the
   * convergence always; "from your notes" and the stronger main thread while the weave holds
   * them; each thread and connection by its id; each question the stop asks. meetingView
   * shows exactly these, and a mark or a concern sits beside one of them or is listed apart.
   *
   * @param {Object} weave - the weave as the director has it
   * @param {Object[]} questions - the stop's questions (data.questions)
   * @returns {Set<string>}
   */
  function linesOnPage(weave, questions) {
    var keys = new Set(['story', 'question', 'headline', 'convergence']);
    if (asString(weave.fromYourNotes).trim()) keys.add('fromYourNotes');
    if (isPlainObject(weave.strongerMainThread)) keys.add('strongerMainThread');
    [['threads', 'thread'], ['connections', 'connection']].forEach(function (pair) {
      asArray(weave[pair[0]]).forEach(function (element) {
        var id = weaveIdOf(element);
        if (id) keys.add(pair[1] + ':' + id);
      });
    });
    questions.forEach(function (q) {
      var id = asString(q.id).trim();
      if (id) keys.add('question:' + id);
    });
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
   * words that decide a mark (added, struck and brought back); a cut is matched by its text (brief
   * 4.10c).
   */
  var WHOLE_EDIT_WORDS = /(^|, )(added|cut|struck|brought back)$/;

  /** An element of the weave in a report entry's place, as editWhere writes it: `thread "t3", role`. */
  var ELEMENT_PLACE = new RegExp('^(' + Object.keys(ELEMENT_WORDS).map(function (k) { return ELEMENT_WORDS[k]; }).join('|') + ') "([^"]*)"(?:, (.*))?$');

  /**
   * The line of the meeting's page an entry of the hand-edit report is on (lineKeyOf's key), and
   * the field of that line the edit is, '' for the whole line or element; read from the entry's
   * place as editWhere writes it (`story`, `thread "t3", role`, `thread "t6", added`).
   */
  function entryLineOf(entry) {
    var where = asString(entry.where);
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
   *   line and the role the director gave a thread a send-back took out: one line says the
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

  /** The fold that holds each left-out thread's reason, a click away (spec 4.1). */
  var LEFT_OUT_REASONS_TITLE = 'Why each is left out';

  /** The meeting's sections, in the spec's order (4.1). */
  var MEETING_SECTIONS = ['verdict', 'story', 'fromYourNotes', 'threads', 'connections', 'strongerMainThread', 'questions'];

  /** A thread's place in the meeting's order of roles: the main thread first, then WEAVE_ROLES' order, a role the meeting does not know last. */
  function roleRank(role) {
    var rank = Object.keys(WEAVE_ROLE_LABELS).indexOf(role);
    return rank === -1 ? Object.keys(WEAVE_ROLE_LABELS).length : rank;
  }

  /**
   * The story meeting's page (spec 2026-10-05 sections 4.1 and 9; phase 4b, brief 1B): the stop's
   * payload (4.5's, lib/meeting.js meetingCheckpointData) with the director's weave as they have it.
   * - `order`: the sections to show, in the spec's order: the verdict; the story, the
   *   question and the working headline; "from your notes"; the threads; the connections
   *   and the convergence; the stronger main thread; the questions. A section with nothing
   *   in it is left out.
   * - `threads`: the threads in the story, the main thread first and the others in the order of
   *   the roles (WEAVE_ROLE_LABELS), each as its role, its name and its line, with its evidence
   *   folded (`evidence`, evidenceFoldView's) and, for a thread the director added that has none,
   *   at this look or an earlier one (`data.addedThreads`), the fold's one line (`noEvidence`,
   *   MEETING_NO_EVIDENCE_LINE). A thread of the writer's with none shows the check's failure
   *   beside it (`failures`) instead. Each thread carries the labels the page names it by (fix
   *   round 2; the page decides none): `label`, its name or its line when it has none
   *   (threadLabelOf), and from it `foldLabel` (its fold's group), `roleAriaLabel` and
   *   `takeOutAriaLabel`.
   * - `leftOut`: the threads left out, by name (`names`, under its `title`), with their reasons
   *   folded under `reasonsTitle`.
   * - `connections`: each connection's line, with the names of the two threads it joins and its
   *   evidence folded; its kind stays underneath, unprinted. Each carries `label`, by the threads
   *   it joins or its line, quoted, when it joins none, and from it `foldLabel` and
   *   `strikeAriaLabel` (fix round 2). One that joins a left-out thread,
   *   unstruck, carries `leftOut`, the line that says it is out of the story with that thread and
   *   comes back with it (leftOutThreadsOf; brief 4.14a), read from the weave as the director has
   *   it, so it follows their roles.
   * - each line the page shows (linesOnPage) carries the concerns about the director's edit
   *   on it, the marks of what the round's passes changed on it, and the code checks still
   *   failing whose place it is (`failures`, failuresBesideLines; spec 6.3).
   * - `thinNotes`: the one line beside the story when the weave has no "from your notes",
   *   unless the round took it out: then the director's notes held a read the rework
   *   dropped, and the mark of it is listed instead.
   * - the round's lines: `didNotRun` (by what the note box holds; task 4.5c),
   *   `checkFailures` (the failures with no place on the page, one line each), `changedEdits`
   *   (the edits a round changed that a stop shows, changedEditsToShow: a send-back's with their
   *   reasons, and what no pass put back; task 4.10), `kept`, the line that says the director's
   *   edits stand when none of theirs is shown (editsStandLine; brief 4.10b), `marked` and the
   *   marks no line shows (`removed`, `otherMarks`), and the concerns no line shows
   *   (`otherConcerns`). One line per edit (briefs 4.10b and 4.10c): a changed edit that a mark
   *   of the round is about stands in that mark's place, the first mark's when several are about
   *   it, beside its line or listed with the marks no line shows, and `changedEdits` lists the
   *   rest (besideLines).
   * No line or label names an element by its id (meetingWordsOf): the tags leave the page (spec
   * 9). Each element's `id` stays on its view for the controls, which change the weave by it.
   * The questions are the stop's (`data.questions`), each paired with its place in the
   * director's weave, whose answer the box shows and sets.
   *
   * The stop always holds a weave (the integrator, at 4.11's merge): the arc writer writes one
   * or throws, and only a thread from before the story meeting holds none, which the server
   * refuses wherever it sits and the console shows the server's message for (oldThreadView).
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
      var b = at(key);
      return { text: asString(text), concerns: b.concerns, marks: b.marks, failures: b.failures };
    };
    var shownThreads = shown ? asArray(shown.threads) : [];
    var addedEarlier = new Set(asArray(d.addedThreads).map(function (id) { return asString(id).trim(); }).filter(Boolean));
    var threadRepeats = new Set(repeatedIdsOf(shownThreads));
    var connectionRepeats = new Set(repeatedIdsOf(shown ? shown.connections : []));
    var allThreads = asArray(weave.threads).map(function (element, index) {
      var thread = isPlainObject(element) ? element : {};
      var id = weaveIdOf(thread);
      var role = asString(thread.role);
      var b = id ? at('thread:' + id) : none;
      var evidence = evidenceFoldView(thread.evidence, d.evidenceIndex);
      var added = index >= shownThreads.length;
      var label = threadLabelOf(thread);
      return {
        key: 'thread-' + index,
        index: index,
        id: id,
        name: asString(thread.name),
        line: asString(thread.line),
        label: label,
        foldLabel: EVIDENCE_FOLD_TITLE + ': ' + label,
        roleAriaLabel: 'Role of the thread ' + label,
        takeOutAriaLabel: 'Take out the thread you added: ' + label,
        role: role,
        roleLabel: roleWord(role),
        reason: asString(thread.reason),
        verdict: thread.verdict === true,
        added: added,
        repeatedId: id !== '' && threadRepeats.has(id),
        evidence: evidence,
        noEvidence: evidence.length === 0 && (added || addedEarlier.has(id)) ? MEETING_NO_EVIDENCE_LINE : '',
        concerns: b.concerns,
        marks: b.marks,
        failures: b.failures
      };
    });
    var threads = allThreads
      .filter(function (t) { return t.role !== LEFT_OUT_ROLE; })
      .sort(function (a, b) { return roleRank(a.role) - roleRank(b.role) || a.index - b.index; });
    var leftOutThreads = allThreads.filter(function (t) { return t.role === LEFT_OUT_ROLE; });
    var connections = asArray(weave.connections).map(function (element, index) {
      var connection = isPlainObject(element) ? element : {};
      var id = weaveIdOf(connection);
      var b = id ? at('connection:' + id) : none;
      var struck = isStruckConnection(connection);
      var joins = words.joinsText(connection.joins);
      var label = joins ? 'the connection between ' + joins : 'the connection "' + asString(connection.line) + '"';
      return {
        key: 'connection-' + index,
        index: index,
        id: id,
        line: asString(connection.line),
        joins: joins,
        label: label,
        foldLabel: EVIDENCE_FOLD_TITLE + ': ' + label,
        strikeAriaLabel: (struck ? 'Unstrike ' : 'Strike ') + label,
        struck: struck,
        // Brief 4.14a: out of the story with a left-out thread, said under it; a strike already keeps it out.
        leftOut: struck ? '' : leftOutLine(leftOutThreadsOf(connection, weave), words),
        repeatedId: id !== '' && connectionRepeats.has(id),
        evidence: evidenceFoldView(connection.evidence, d.evidenceIndex),
        concerns: b.concerns,
        marks: b.marks,
        failures: b.failures
      };
    });
    var stronger = onPage.has('strongerMainThread') ? weave.strongerMainThread : null;
    var strongerView = null;
    if (stronger) {
      var strongerId = asString(stronger.thread).trim();
      var sb = at('strongerMainThread');
      strongerView = { thread: strongerId, name: words.threadName(strongerId), reason: asString(stronger.reason), concerns: sb.concerns, marks: sb.marks, failures: sb.failures };
    }
    var draftQuestions = asArray(weave.questions);
    var cursor = 0;
    var questions = stopQuestions.map(function (q, n) {
      var index = -1;
      for (var i = cursor; i < draftQuestions.length; i += 1) {
        if (sameQuestion(draftQuestions[i], q)) { index = i; break; }
      }
      if (index !== -1) cursor = index + 1;
      var id = asString(q.id).trim();
      var kind = asString(q.kind);
      var b = id ? at('question:' + id) : none;
      return {
        key: 'question-' + n,
        index: index,
        id: id,
        kind: kind,
        kindLabel: hasOwn(WRITER_QUESTION_KIND_LABELS, kind) ? WRITER_QUESTION_KIND_LABELS[kind] : '',
        about: asString(q.about),
        question: asString(q.question),
        changes: asString(q.changes),
        answer: asString((index !== -1 ? draftQuestions[index] : q)[WEAVE_ANSWER_KEY]),
        marks: b.marks,
        failures: b.failures
      };
    });
    var fromYourNotes = onPage.has('fromYourNotes') ? line('fromYourNotes', weave.fromYourNotes) : null;
    var present = {
      fromYourNotes: fromYourNotes !== null,
      strongerMainThread: strongerView !== null,
      questions: questions.length > 0
    };
    return {
      order: MEETING_SECTIONS.filter(function (section) { return !hasOwn(present, section) || present[section]; }),
      verdict: meetingVerdictView(d.accusation),
      story: line('story', weave.story),
      question: line('question', weave.question),
      headline: line('headline', weave.headline),
      thinNotes: fromYourNotes || beside.takenOut.has('fromYourNotes') ? '' : THIN_NOTES_LINE,
      fromYourNotes: fromYourNotes,
      evidenceTitle: EVIDENCE_FOLD_TITLE,
      threads: threads,
      leftOut: {
        title: 'Left out (' + leftOutThreads.length + ')',
        names: leftOutThreads.map(function (t) { return t.label; }).filter(Boolean).join(' · '),
        reasonsTitle: LEFT_OUT_REASONS_TITLE,
        threads: leftOutThreads
      },
      roles: Object.keys(WEAVE_ROLE_LABELS).map(function (value) { return { value: value, label: WEAVE_ROLE_LABELS[value] }; }),
      connections: connections,
      convergence: line('convergence', weave.convergence),
      strongerMainThread: strongerView,
      questions: questions,
      repeatedIdHint: allThreads.some(function (t) { return t.repeatedId; }) || connections.some(function (c) { return c.repeatedId; }) ? REPEATED_ID_HINT : '',
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
  // The outline stop is the map: about 450 words the director reads in minutes and edits line
  // by line. Outline.js renders it from mapView and changes it only through the editors and
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

  /** The mark beside a move whose evidence prints as a card (spec 4.2): the page prints no kind and no document id. */
  var MAP_CARD_MARK = '(card)';

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
    var heads = {
      headline: 'the headline', deck: 'the deck', topPhoto: 'the top photo', expectedLength: 'the expected length',
      gapNote: 'the gap note', weaveChanges: "the map's changes to the weave"
    };
    if (parts.length === 0) return 'the map';
    if (hasOwn(heads, parts[0])) return heads[parts[0]];
    if (parts[0] === 'dropped') {
      var dropped = asArray(m.dropped)[Number(parts[1])];
      return 'the dropped section ' + slotLabelOf(isPlainObject(dropped) ? dropped.slot : '', slots) + tail(parts.slice(2));
    }
    if (parts[0] === 'leftOut') return 'left out, beat ' + beatName(asArray(m.leftOut)[Number(parts[1])], parts[1]) + tail(parts.slice(2));
    if (parts[0] === 'sections') {
      var section = asArray(m.sections)[Number(parts[1])];
      var label = isPlainObject(section) ? slotLabelOf(section.slot, slots) : 'a section';
      if (parts[2] === 'beats') {
        return label + ', beat ' + beatName(asArray(isPlainObject(section) ? section.beats : null)[Number(parts[3])], parts[3]) + tail(parts.slice(4));
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
   * Everyone and the counts of the map as the director has it, rebuilt through mapTally
   * (console/outline-edit-logic.js), the function the map checks count with, on the inputs the
   * stop's payload carries (task 4.6c; it sends no count of its own, task 4.6d): the session's
   * roster with the canon's full names (`roster`, lib/map.js mapRosterOf) and the photos kept
   * for the article (`keptPhotos`). So "In no beat" lists the players in roster order whatever
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

  /** The lines the map's page shows, by their keys (mapLineKeyOf): each beat and photo where the map places it. */
  function mapLinesOnPage(map) {
    var editLogic = outlineEditLogic();
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
   * A beat's place as a diff or a report names it (`beat "b4"`, `beat "b4", move`), in the words
   * the map's page uses: the beat's move, found on the map (phase 4b, brief 1D; spec 9: the tags
   * leave the page), which names the move field too, or "a move" for a beat the map no longer
   * holds.
   */
  function beatWords(text, map) {
    return asString(text).replace(/beat "([^"]*)"(?:, move\b)?/g, function (_, id) {
      var beat = outlineEditLogic().beatWithId(map, id);
      var move = isPlainObject(beat) ? asString(beat.move).trim() : '';
      return move ? 'the move "' + shortText(move) + '"' : 'a move';
    });
  }

  /**
   * How the map phrases an edit a rework changed (changedEditLine, every stop's builder): its
   * place as the report names it, with each slot under its label, each beat by its move
   * (beatWords) and no edit id, since the map shows none; a moved element is a beat or a photo,
   * and a section it went to reads by its label; text that came back is still on the map (task
   * 4.10).
   *
   * @param {Array} slots - slotsOf(data)
   * @param {*} [map] - the map the page shows, which names each beat by its move
   */
  function mapEditLineOptions(slots, map) {
    return {
      place: function (entry) { return capitalized(beatWords(slotWords(asString(entry.where) || scopeLabel(entry.scope), slots), map)); },
      valueText: function (text) {
        var m = /^section "([^"]*)"$/.exec(asString(text));
        return m ? slotLabelOf(m[1], slots) : text;
      },
      thing: function (entry) { return /(^|, )photo "/.test(asString(entry.where)) ? 'photo' : 'beat'; },
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
   * leave the page): each names the move by its words, never its id, or as "a move" when it has
   * none. The page renders them as given, so Outline.js builds no label of its own.
   *
   * @param {*} move - the beat's move
   * @returns {{fold: string, moveTo: string, strike: string, takeOut: string, bringBack: string}}
   */
  function moveLabelsOf(move) {
    var words = asString(move).trim();
    var named = words ? '"' + words + '"' : 'a move';
    return {
      fold: EVIDENCE_FOLD_TITLE + ': ' + (words || 'a move'),
      moveTo: 'Move ' + named + ' to another section',
      strike: 'Strike ' + named + ' into left out',
      takeOut: 'Take out the move you added: ' + (words || 'a move'),
      bringBack: 'Bring ' + named + ' back into a section'
    };
  }

  /** A photo as its controls name it to a screen reader: by the director's description, quoted, as the page shows it, or by its filename when there is none. */
  function photoNameOf(filename, description) {
    return description ? '"' + description + '"' : asString(filename);
  }

  /**
   * The words a change to the weave names its source by (task 4.14b): a change of the
   * director's at the meeting by the place the meeting names its line by, from the payload's
   * `meetingChanges` (`{id, place}`: the meeting's changes the weave carries), as "Your change
   * to the role of 'Morgan paid Riley at the bar'"; the meeting's note by its name; and any
   * other source as a change at the meeting. Never by an id: the meeting shows none.
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
   * - `settledStory` at the top, read-only, with `storyHint`, the way back to the meeting;
   * - the round's lines: `round` (after a send-back, with its note), `checkFailures` (the code
   *   checks still failing whose place the page does not show, one line each, in the director's
   *   words; failuresBesideLines), `changedEdits` (each edit a rework changed that a stop shows,
   *   changedEditsToShow, by changedEditLine with the map's places: a send-back's with its reason,
   *   and what no pass put back; task 4.10; a section the director emptied that a pass put back
   *   as one line, the section's, mapChangedEditLines, task 4.14b fix round 1), `kept`, the line
   *   that says the director's edits stand when none of theirs is listed (editsStandLine; brief
   *   4.10b), and `otherConcerns`, the concerns none of whose places the page shows;
   * - `gapNote`, `headline`, `deck` and `topPhoto`;
   * - `sections`, in the map's order, each under its slot's label with its heading, job, beats
   *   and photos, each beat and photo with the places it can move to (phase 4b, brief 1D):
   *   - each beat as its move, its people and its card mark (`card`, true where its evidence prints
   *     as a card: the beat's flagged piece names its document, beatCardOf, the one reader of a
   *     beat's card; the page shows MAP_CARD_MARK), with its evidence folded
   *     (`evidence`, evidenceFoldView's, under `evidenceTitle`) and, for a beat the director
   *     added that has none, at this look or an earlier one (`data.addedBeats`), the fold's one
   *     line (`noEvidence`, MAP_NO_EVIDENCE_LINE). Its kind and its connection stay underneath,
   *     unprinted. Each beat row is keyed by its beat's id, so an editor open on it survives a
   *     strike or a move above it; a beat whose id another beat of its list holds, or with none,
   *     by its place (task 4.14b);
   *   - each photo with the director's description (`description`, photoDescriptionOf), or ''
   *     when there is none, and the beats it can sit beside, each named by its move. A photo sits
   *     beside the beat it names unless that beat is struck (photoBeatOf; task 4.14b);
   *   - what each beat's fold and controls, and each photo's controls, say to a screen reader
   *     (`labels`, phase 4b, brief 1F): a beat named by its move's words (moveLabelsOf), the
   *     fold's group "What's behind it: <move>"; a photo, the top photo too, by the director's
   *     description, or its filename when there is none (photoNameOf). The page builds none;
   * - a photo the map places that the director left out of the article since (the payload's
   *   `leftOutPhotos`), at the top or in a section, is `leftOut`: marked with
   *   LEFT_OUT_PHOTO_LINE before its concerns, its controls off, and no place to move to (task
   *   4.14b);
   * - `dropped`, each with its reason, a section the director emptied with EMPTIED_SECTION_LINE;
   *   `tally`, the lines of Everyone and the counts, rebuilt from the map as edited
   *   (mapTallyOf); `leftOut`, folded, each item with the sections it can come back to;
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
   * of the stop (app.js, oldThreadView).
   *
   * @param {Object} data - the stop's payload
   * @param {Object} map - the map as the director has it (mapDraftOf, then their changes)
   * @returns {Object}
   */
  function mapView(data, map) {
    var d = isPlainObject(data) ? data : {};
    var editLogic = outlineEditLogic();
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

    var beatView = function (beat, index, slot, ids) {
      var b = isPlainObject(beat) ? beat : {};
      var id = editLogic.beatIdOf(b);
      var ownId = id !== '' && ids.filter(function (other) { return other === id; }).length === 1;
      var added = id !== '' && shownBeatIds.indexOf(id) === -1;
      var evidence = evidenceFoldView(b.evidence, d.evidenceIndex);
      return {
        key: (slot === null ? 'leftOut' : slot) + (ownId ? '-beat-' + id : '-beat@' + index),
        id: id,
        index: index,
        move: asString(b.move),
        players: stringList(b.players).join(', '),
        card: Boolean(editLogic.beatCardOf(b)),
        evidence: evidence,
        noEvidence: evidence.length === 0 && (added || addedEarlier.indexOf(id) !== -1) ? MAP_NO_EVIDENCE_LINE : '',
        concerns: id ? at('beat:' + id) : [],
        failures: id ? failuresAt('beat:' + id) : [],
        added: added,
        locked: id === '' || writers.beatIds.indexOf(id) !== -1,
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
          moveTo: 'Move ' + named + ' to the top or to another section'
        },
        beat: beside,
        besideOptions: options,
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
          labels: { moveTo: 'Move the top photo ' + photoNameOf(topName, topDescription) + ' into a section' },
          concerns: (topLeftOut ? [LEFT_OUT_PHOTO_LINE] : []).concat(at('topPhoto')),
          failures: failuresAt('topPhoto'),
          moveTargets: topLeftOut ? [] : targets,
          leftOut: topLeftOut,
          locked: topLeftOut || photoRepeated(topName)
        }
      : null;

    var sectionViews = sections.map(function (section, i) {
      var ids = idsOf(section.beats);
      return {
        key: 'section-' + i,
        slot: section.slot,
        label: slotLabelOf(section.slot, slots),
        heading: asString(section.heading),
        job: asString(section.job),
        concerns: at('section:' + section.slot),
        failures: failuresAt('section:' + section.slot),
        beats: asArray(section.beats).map(function (beat, j) { return beatView(beat, j, section.slot, ids); }),
        photos: asArray(section.photos).map(function (photo, j) { return photoView(photo, j, section); })
      };
    });

    var leftIds = idsOf(map.leftOut);
    var leftItems = asArray(map.leftOut).map(function (beat, j) {
      var view = beatView(beat, j, null, leftIds);
      view.targets = targets;
      return view;
    });

    var tally = mapTallyOf(d, map);
    var unplaced = tally.unplaced.filter(function (name) { return tally.raised.indexOf(name) === -1; });
    var cardsOff = tally.cards < MAP_CARDS.min || tally.cards > MAP_CARDS.max;
    var length = map.expectedLength;
    var human = Number(d.humanRevisionCount) || 0;
    var feedback = asString(d.previousFeedback).trim();
    // The hint speaks of the writer's repeats: a photo the director left out is marked on its own line.
    var anyLocked = sectionViews.some(function (s) {
      return s.beats.some(function (b) { return b.locked; }) || s.photos.some(function (p) { return photoRepeated(p.filename); });
    }) || leftItems.some(function (b) { return b.locked; }) || Boolean(topPhoto && photoRepeated(topPhoto.filename));

    return {
      settledStory: story,
      storyHint: STORY_HINT,
      round: human > 0
        ? { label: roundsBanner(human, d.revisionCount, d.maxRevisions).roundLabel, note: feedback ? 'You sent the map back with: "' + feedback + '"' : '' }
        : null,
      checkFailures: failing.top,
      changedEdits: mapChangedEditLines(d.handEditReport, slots, map),
      kept: editsStandLine(d.handEditReport),
      otherConcerns: placed.other,
      gapNote: isPlainObject(map.gapNote)
        ? { line: asString(map.gapNote.line), players: stringList(map.gapNote.players).join(', '), concerns: at('gapNote'), failures: failuresAt('gapNote') }
        : null,
      headline: { text: asString(map.headline), concerns: at('headline') },
      deck: { text: asString(map.deck), concerns: at('deck') },
      topPhoto: topPhoto,
      evidenceTitle: EVIDENCE_FOLD_TITLE,
      sections: sectionViews,
      dropped: asArray(map.dropped).filter(isPlainObject).map(function (entry) {
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
        everyone: tally.everyone.map(function (entry) { return entry.players.join(', ') + ' (' + slotLabelOf(entry.slot, slots) + ')'; }).join(' · '),
        unplaced: unplaced.length > 0 ? 'In no beat: ' + unplaced.join(', ') : '',
        raised: tally.raised.length > 0 ? 'Raised in the gap note: ' + tally.raised.join(', ') : '',
        cards: 'Cards: ' + tally.cards + (cardsOff ? ', ' + (tally.cards < MAP_CARDS.min ? 'under' : 'over') + ' the ' + MAP_CARDS.min + ' to ' + MAP_CARDS.max + ' the article carries' : ''),
        photos: 'Photos: ' + tally.photos.placed + ' of ' + tally.photos.of,
        length: Number.isInteger(length)
          ? 'Expected length: about ' + withCommas(length) + ' words'
          : 'Expected length: not set',
        lengthConcerns: at('expectedLength')
      },
      leftOut: {
        title: 'Left out (' + leftItems.length + ')',
        open: leftItems.some(function (item) { return item.concerns.length > 0 || item.failures.length > 0; }),
        items: leftItems
      },
      weaveChanges: asArray(map.weaveChanges).filter(isPlainObject).map(function (change, i) {
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
   * the button from its stop labels.
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
    WEAVE_ROLE_LABELS: WEAVE_ROLE_LABELS,
    CONNECTION_KINDS: CONNECTION_KINDS,
    // Phase 4b (brief 1B): the evidence under each line, folded (the map reuses the fold's view),
    // and the console's copies of lib/evidence.js's sources and stances and of the evidence's key
    // (held equal by a test)
    EVIDENCE_SOURCE_LABELS: EVIDENCE_SOURCE_LABELS,
    EVIDENCE_STANCES: EVIDENCE_STANCES,
    EVIDENCE_KEY: EVIDENCE_KEY,
    EVIDENCE_FOLD_TITLE: EVIDENCE_FOLD_TITLE,
    CUTS_AGAINST_LABEL: CUTS_AGAINST_LABEL,
    MEETING_NO_EVIDENCE_LINE: MEETING_NO_EVIDENCE_LINE,
    evidenceFoldView: evidenceFoldView,
    STRUCK_KEY: STRUCK_KEY,
    WEAVE_ANSWER_KEY: WEAVE_ANSWER_KEY,
    DIRECTOR_WEAVE_SHAPE: DIRECTOR_WEAVE_SHAPE,
    THIN_NOTES_LINE: THIN_NOTES_LINE,
    MEETING_LINE_LABELS: MEETING_LINE_LABELS,
    MEETING_ROLLBACK_LINE: MEETING_ROLLBACK_LINE,
    // Brief 4.14a: the console's copy of lib/weave.js's left-out rule, held equal by a test
    LEFT_OUT_ROLE: LEFT_OUT_ROLE,
    leftOutThreadsOf: leftOutThreadsOf,
    meetingWeaveOf: meetingWeaveOf,
    meetingVersion: meetingVersion,
    meetingPendingSlot: meetingPendingSlot,
    meetingDraftOf: meetingDraftOf,
    meetingNoteOf: meetingNoteOf,
    pendingEditsAfterCheckpoint: pendingEditsAfterCheckpoint,
    setMeetingField: setMeetingField,
    setThreadRole: setThreadRole,
    addMeetingThread: addMeetingThread,
    removeMeetingThread: removeMeetingThread,
    setConnectionStruck: setConnectionStruck,
    setQuestionAnswer: setQuestionAnswer,
    meetingWeaveChanges: meetingWeaveChanges,
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
