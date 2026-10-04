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
   * One document as the stop names it (brief 1.2; task 4.8: a thread's receipt at the
   * story meeting, through receiptView).
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
   * Which pass made a report entry's change, in a line's words, and the reason a send-back's
   * rework gave: `held` for a pass held to the director's edits (an automatic pass or a reweave),
   * whose changes code puts back. changedEditLine reads it, and so does the meeting's line for a
   * field edit on an element a round took out (takenOutWithEditLine).
   */
  function passWords(entry) {
    var automatic = entry.automatic === true;
    var reweave = entry.pass === REWEAVE_PASS;
    var reason = asString(entry.reason).trim();
    return {
      held: automatic || reweave,
      by: automatic ? 'automatic pass ' + entry.pass : (reweave ? 'your reweave' : 'the rework of your send-back'),
      why: reason ? 'Why: ' + reason : 'No reason given.'
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
   * - One on a photo the article cannot print (`unprintable`, task 4.5e), such as a caption the
   *   director wrote under it: code left it out, and the line says why (brief 4.10c).
   * - A cut, or a sentence a rewrite removed, that came back: it is still in the output,
   *   because code never takes text out.
   * - A block the director moved that a pass took to another section: where it went, and
   *   whether code put it back, in the director's order or not (task 4.3c, `inOrder`); one a
   *   pass removed: that code left it out, since only its place was the director's edit. The
   *   map (task 4.9) names the element a beat or a photo.
   * - A change a send-back's rework made: the rework's reason, or that it gave none.
   *
   * @param {Object} entry - one of the report's `changed` entries (lib/hand-edit-diff.js reportAfterPass)
   * @param {Object} [options]
   * @param {function(Object): string} [options.place] - the entry's place; by default its id and `where`
   * @param {function(string): string} [options.valueText] - how a value reads; by default as written
   * @param {function(Object): string} [options.thing] - what a moved element is called; by default a block
   * @param {string} [options.stillIn] - where text that came back still is: by default 'in the article'
   * @returns {string}
   */
  function changedEditLine(entry, options) {
    var o = options || {};
    var label = typeof o.place === 'function'
      ? o.place(entry)
      : entry.id + ', ' + (asString(entry.where) ? entry.where : scopeLabel(entry.scope));
    var valueText = typeof o.valueText === 'function' ? o.valueText : function (text) { return text; };
    var thing = typeof o.thing === 'function' ? o.thing(entry) : 'block';
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
    // never puts such a photo back, so an automatic pass that fixed it keeps its fix. The line says
    // so and claims nothing more: a pass that renamed the photo may have kept the caption's words.
    if (entry.unprintable === true) return label + ': ' + by + ' took out the photo, which the article cannot print, so your "' + director + '" was not put back.';
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
   * task 4.3c) is shown too (brief 4.10b): its line asks the director to move it again. Any
   * other entry code put back asks nothing of the director, so no stop shows it beside the
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
      return entry.pass === SEND_BACK_PASS || entry.restored !== true || entry.inOrder === false;
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
   * `restored` one code put back (FA), each read from the entry's own flags;
   * `keptCount` is the edits checked when none changed. `kept` is the line RevisionDiff
   * prints when no stop shows a line beside the director's edits: that they stand, in the
   * words the map and the meeting print (editsStandLine; brief 4.10c). `notes` are
   * standingNoteItems', under `labels`, the console's stop labels. Task 4.10: this is the
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
      keptCount: report && changed.length === 0 ? report.checked.length : 0,
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
   * Both failure modes here are silent by nature, so both are closed (review fix
   * round 1): an unrecognised action used to fall through to the approve branch, so
   * a typo shipped the outline; a send back with a blank note used to build a
   * payload whose feedback is '' and which no server arm accepts. The components
   * disable the button and return early on a blank note, so null is never sent.
   *
   * @param {object} keys - the four payload keys for the stop
   * @param {object|null} edits - the director's edited object, or null
   * @param {string} note - what the director wrote in the stop's note box
   * @param {string} action - 'approve' or 'send-back'
   * @returns {object|null} the payload, or null for a send back with no note
   */
  function reviewPayload(keys, edits, note, action) {
    if (action !== 'approve' && action !== 'send-back') {
      throw new Error("reviewPayload: action must be 'approve' or 'send-back', got " + String(action));
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
   * changed, and none of the scores its findings recorded (`criteriaScores`).
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
        var mustFix = stringList(findings.structuralIssues);
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
  // The arc stop is the story meeting: a page of about 400 words that the director reads
  // and settles in minutes. ArcSelection.js renders it from meetingView and changes the
  // weave only through the operations below; it sends only meetingPayload's payloads,
  // 4.5's `{meeting: 'approve' | 'reweave' | 'send-back', weave, note}` (lib/meeting.js
  // meetingResume), each held first to meetingWeaveProblems, the gate's decisions. What
  // the director types is sent as typed.

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

  /** What two threads share at a connection. The keys are lib/weave.js CONNECTION_KINDS (a test holds them equal). */
  var CONNECTION_KIND_LABELS = { person: 'A shared person', moment: 'A moment', document: 'A document', line: 'A line' };

  /**
   * Copies of lib/weave.js LEDGER_RECEIPT and STRUCK_KEY and of lib/writer-questions.js
   * WEAVE_ANSWER_KEY, which the browser cannot import; a test holds each equal.
   */
  var LEDGER_RECEIPT = 'ledger';
  var STRUCK_KEY = 'struck';
  var WEAVE_ANSWER_KEY = 'answer';

  /**
   * The weave's text fields, read one place each as lib/hand-edit-diff.js weaveEditsBetween
   * reads them: a copy of its WEAVE_FIELDS, which the browser cannot import; a test holds
   * the two equal (task 4.5c).
   */
  var WEAVE_TEXT_FIELDS = ['story', 'question', 'headline', 'fromYourNotes', 'convergence'];

  /** The fields the director edits in place (spec 4.4). */
  var MEETING_EDITABLE_FIELDS = ['story', 'question', 'headline', 'convergence'];

  /**
   * The weave as the director leaves it, as the gate's director-side schema holds it
   * (lib/meeting.js DIRECTOR_WEAVE_SCHEMA, which the browser cannot import): each
   * property's type ('string', 'boolean', 'strings' for a list of text, an enum's values,
   * or a list's or an object's own shape) and the names required. A test builds this
   * shape from DIRECTOR_WEAVE_SCHEMA and holds the two equal.
   */
  var DIRECTOR_WEAVE_SHAPE = {
    required: ['story', 'question', 'headline', 'threads', 'connections', 'convergence', 'questions'],
    fields: {
      story: 'string',
      question: 'string',
      headline: 'string',
      fromYourNotes: 'string',
      threads: { list: {
        required: ['id', 'claim', 'role'],
        fields: { id: 'string', claim: 'string', role: Object.keys(WEAVE_ROLE_LABELS), receipt: 'string', reason: 'string', verdict: 'boolean' }
      } },
      connections: { list: {
        required: ['id', 'kind', 'joins', 'detail'],
        fields: { id: 'string', kind: Object.keys(CONNECTION_KIND_LABELS), joins: 'strings', detail: 'string', struck: 'boolean' }
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

  /** What a rollback costs: the general warning, and going back to the meeting (R9). */
  var ROLLBACK_WARNING = 'This will clear all data from this point forward.';
  var MEETING_ROLLBACK_LINE = 'The story meeting reopens as you left it, with no model call; a meeting that holds no weave has one written fresh. The map and the article are cleared, and written again once you approve.';

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
   * A thread the writer missed, in one line, with a role: under an id of its own, with no
   * receipt and no reason, which the director-side schema allows. A blank line adds none.
   */
  function addMeetingThread(weave, claim, role) {
    checkedRole(role, 'addMeetingThread');
    if (typeof claim !== 'string' || !claim.trim()) return weave;
    var next = editedWeave(weave, 'addMeetingThread');
    next.threads.push({ id: freshThreadId(next.threads), claim: claim, role: role });
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
   * The changes between two weaves, one per place, as lib/hand-edit-diff.js
   * weaveEditsBetween finds them (a test holds the two equal): each text field and the
   * stronger main thread whole; each thread and connection found by its id, field by
   * field, added whole or taken out whole; a connection struck as one change of the whole,
   * and one brought back as one change of the whole too (task 4.5c). The questions are not
   * read: an answer is the director's words, no edit. Each change under an id either weave
   * repeats carries `repeatedId`, since no edit can find its element by the id.
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
        var p = collection === 'connections' ? withoutKey(prior, STRUCK_KEY) : prior;
        var e = collection === 'connections' ? withoutKey(entry.element, STRUCK_KEY) : entry.element;
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
    if (type === 'strings') {
      if (!Array.isArray(value)) return at + ' must be a list';
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
   * A thread's receipt, named through the stop's evidenceIndex: the document and its owner,
   * found in any case as the weave checks find a receipt, or the ledger. A receipt the index
   * does not hold shows as its id.
   *
   * @param {*} receipt
   * @param {Object} evidenceIndex - data.evidenceIndex
   * @returns {{id: string, label: string, ledger: boolean, known: boolean, firstLine: string}|null}
   */
  function receiptView(receipt, evidenceIndex) {
    var id = asString(receipt).trim();
    if (!id) return null;
    if (id.toLowerCase() === LEDGER_RECEIPT) return { id: id, label: 'the ledger', ledger: true, known: true, firstLine: '' };
    var index = isPlainObject(evidenceIndex) ? evidenceIndex : {};
    var key = hasOwn(index, id) ? id : null;
    if (key === null) {
      var lower = id.toLowerCase();
      key = Object.keys(index).filter(function (k) { return k.toLowerCase() === lower; })[0] || null;
    }
    if (key === null) return { id: id, label: id, ledger: false, known: false, firstLine: '' };
    var entry = evidenceEntry(key, index);
    return { id: id, label: entry.label, ledger: false, known: true, firstLine: entry.firstLine };
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
   * A place in the weave as the meeting names it: one of the weave's lines by its heading
   * (MEETING_LINE_LABELS), anything else by the diff's `where` ("Thread "t3", role").
   *
   * @param {string|null} field - the weave line the place is, if it is one
   * @param {string} where - the diff's words for the place
   */
  function meetingPlace(field, where) {
    return field !== null && hasOwn(MEETING_LINE_LABELS, field) ? MEETING_LINE_LABELS[field] : capitalized(asString(where));
  }

  /** A mark's place: its line, or its element ("Thread "t4"") without the diff's ", cut" or ", added", which the mark's line says. */
  function markPlace(mark) {
    return meetingPlace(lineKeyOf(mark.path), asString(mark.where).replace(/, (cut|added)$/, ''));
  }

  /** The place of an edit a send-back changed: its line (the edit's scope names it), or its `where`. */
  function meetingEditPlace(entry) {
    return meetingPlace(asString(entry.scope), asString(entry.where) || asString(entry.scope));
  }

  /**
   * How the meeting phrases an edit a round changed (changedEditLine, every stop's builder):
   * its place as the page heads it, with no edit id, since the meeting shows none, a role as
   * the role picker names it, and text that came back as still in the weave.
   */
  var MEETING_EDIT_LINE = { place: meetingEditPlace, valueText: roleWord, stillIn: 'in the weave' };

  function lowerFirst(text) {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  /** The line beside a line of the page that the round's passes changed. */
  function markLine(mark) {
    var field = elementFieldOf(mark.path);
    var which = field ? ' (' + field + ')' : '';
    var before = asString(mark.before);
    if (!before) return isElementPath(mark.path) ? 'New this round.' : 'Added this round' + which + '.';
    if (!asString(mark.after)) return 'Emptied this round' + which + '. Before: "' + roleWord(before) + '"';
    return 'Changed this round' + which + '. Before: "' + roleWord(before) + '"';
  }

  /** The line for a line or an element the round's passes took out, which the page no longer shows. */
  function removedLine(mark) {
    return markPlace(mark) + ': taken out this round. Before: "' + asString(mark.before) + '"';
  }

  /**
   * The one line for an edit of a field of an element the round took out whole (brief 4.10c): the
   * element taken out, with what it held, as removedLine says it, then the field the director gave
   * it, which went with it, and the pass that took it out, with the rework's reason, in
   * changedEditLine's words.
   *
   * @param {Object} mark - the round's mark that took the element out
   * @param {Object} entry - the report's entry for the director's edit of one of its fields
   * @param {string} field - that field (`role`)
   */
  function takenOutWithEditLine(mark, entry, field) {
    var pass = passWords(entry);
    return removedLine(mark) + '. The ' + field + ' you gave it, "' + roleWord(asString(entry.director)) + '", went with it ('
      + pass.by + (pass.held ? ', which should have kept your edit). No reason given.' : '). ' + pass.why);
  }

  /** The line for any other mark whose line the page does not show: what changed, and what the place holds now. */
  function elsewhereLine(mark) {
    var after = asString(mark.after);
    return markPlace(mark) + ': ' + lowerFirst(markLine(mark)) + (after ? ' Now: "' + roleWord(after) + '"' : '');
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
   * the line it sits beside names the place.
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
      var line = 'Concern: ' + concernFindingOf(concern.text);
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
   * - A mark that took an element out whole, about an entry for one of its fields, such as the
   *   role the director gave a thread a send-back took out: one line says both
   *   (takenOutWithEditLine).
   *
   * @param {Object} data - the stop's payload
   * @param {Set<string>} onPage - the lines the page shows
   * @param {Object[]} entries - the report's entries the meeting shows
   */
  function besideLines(data, onPage, entries) {
    var placed = concernsBesideLines(data.concerns, onPage, lineKeyOf);
    var marks = new Map();
    var out = { concerns: placed.byLine, marks: marks, otherConcerns: placed.other, removed: [], otherMarks: [], takenOut: new Set(), edits: [] };
    var add = function (map, key, line) {
      var list = map.get(key) || [];
      if (list.indexOf(line) === -1) list.push(line);
      map.set(key, list);
    };
    var lines = asArray(entries).map(function (entry) { return { entry: entry, line: changedEditLine(entry, MEETING_EDIT_LINE), shown: false }; });
    /**
     * What the page shows in a mark's place for the entries the mark is about: each entry's line
     * the first time a mark is about it, worded with the element when the mark took the element out
     * whole and the entry is one of its fields; null when no entry is about the mark, which then
     * shows its own line.
     */
    var editLinesOf = function (mark, elementTakenOut) {
      var about = lines.filter(function (l) { return markOfEntry(mark, l.entry); });
      if (about.length === 0) return null;
      return about.filter(function (l) { return !l.shown; }).map(function (l) {
        l.shown = true;
        var field = entryLineOf(l.entry).field;
        return elementTakenOut && field ? takenOutWithEditLine(mark, l.entry, field) : l.line;
      });
    };
    var round = isPlainObject(data.marks) ? data.marks : {};
    asArray(round.marks).filter(isPlainObject).forEach(function (mark) {
      var key = lineKeyOf(mark.path);
      if (!asString(mark.after) && (isElementPath(mark.path) || !onPage.has(key))) {
        out.removed.push.apply(out.removed, editLinesOf(mark, isElementPath(mark.path)) || [removedLine(mark)]);
        if (key !== null) out.takenOut.add(key);
      } else if (onPage.has(key)) {
        (editLinesOf(mark, false) || [markLine(mark)]).forEach(function (line) { add(marks, key, line); });
      } else {
        out.otherMarks.push.apply(out.otherMarks, editLinesOf(mark, false) || [elsewhereLine(mark)]);
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

  /** The meeting's sections, in the spec's order (4.3). */
  var MEETING_SECTIONS = ['verdict', 'story', 'fromYourNotes', 'threads', 'connections', 'strongerMainThread', 'questions'];

  /**
   * The story meeting's page (spec 4.3): the stop's payload (4.5's, lib/meeting.js
   * meetingCheckpointData) with the director's weave as they have it.
   * - `order`: the sections to show, in the spec's order: the verdict; the story, the
   *   question and the working headline; "from your notes"; the threads; the connections
   *   and the convergence; the stronger main thread; the questions. A section with nothing
   *   in it is left out.
   * - each line the page shows (linesOnPage) carries the concerns about the director's edit
   *   on it, and the marks of what the round's passes changed on it;
   * - `thinNotes`: the one line beside the story when the weave has no "from your notes",
   *   unless the round took it out: then the director's notes held a read the rework
   *   dropped, and the mark of it is listed instead;
   * - the round's lines: `didNotRun` (by what the note box holds; task 4.5c),
   *   `checkFailures` (one line each), `changedEdits` (the edits a round changed that a stop
   *   shows, changedEditsToShow: a send-back's with their reasons, and what no pass put back;
   *   task 4.10), `kept`, the line that says the director's edits stand when none of theirs is
   *   shown (editsStandLine; brief 4.10b), `marked` and the marks no line shows (`removed`,
   *   `otherMarks`), and the concerns no line shows (`otherConcerns`). One line per edit (briefs
   *   4.10b and 4.10c): a changed edit that a mark of the round is about stands in that mark's
   *   place, the first mark's when several are about it, beside its line or listed with the
   *   marks no line shows, and `changedEdits` lists the rest (besideLines).
   * The questions are the stop's (`data.questions`), each paired with its place in the
   * director's weave, whose answer the box shows and sets.
   *
   * @param {Object} data - the stop's payload
   * The stop always holds a weave (the integrator, at 4.11's merge): the arc writer writes one
   * or throws, and only a thread from before the story meeting holds none, which the server
   * refuses wherever it sits and the console shows the server's message for (oldThreadView).
   *
   * @param {Object} weave - the weave as the director has it (meetingDraftOf, then their changes)
   * @param {string} [note] - the meeting's note box (meetingNoteOf, then what they type)
   * @returns {Object}
   */
  function meetingView(data, weave, note) {
    var d = isPlainObject(data) ? data : {};
    var shown = meetingWeaveOf(d.weave);
    var stopQuestions = asArray(d.questions).filter(isPlainObject);
    var onPage = linesOnPage(weave, stopQuestions);
    var beside = besideLines(d, onPage, changedEditsToShow(d.handEditReport));
    var at = function (key) {
      return { concerns: beside.concerns.get(key) || [], marks: beside.marks.get(key) || [] };
    };
    var line = function (key, text) {
      var b = at(key);
      return { text: asString(text), concerns: b.concerns, marks: b.marks };
    };
    var shownThreads = shown ? asArray(shown.threads) : [];
    var threadRepeats = new Set(repeatedIdsOf(shownThreads));
    var connectionRepeats = new Set(repeatedIdsOf(shown ? shown.connections : []));
    var threads = asArray(weave.threads).map(function (element, index) {
      var thread = isPlainObject(element) ? element : {};
      var id = weaveIdOf(thread);
      var role = asString(thread.role);
      var b = id ? at('thread:' + id) : { concerns: [], marks: [] };
      return {
        key: 'thread-' + index,
        index: index,
        id: id,
        claim: asString(thread.claim),
        role: role,
        roleLabel: roleWord(role),
        receipt: receiptView(thread.receipt, d.evidenceIndex),
        reason: asString(thread.reason),
        verdict: thread.verdict === true,
        added: index >= shownThreads.length,
        repeatedId: id !== '' && threadRepeats.has(id),
        concerns: b.concerns,
        marks: b.marks
      };
    });
    var connections = asArray(weave.connections).map(function (element, index) {
      var connection = isPlainObject(element) ? element : {};
      var id = weaveIdOf(connection);
      var kind = asString(connection.kind);
      var b = id ? at('connection:' + id) : { concerns: [], marks: [] };
      return {
        key: 'connection-' + index,
        index: index,
        id: id,
        kind: kind,
        kindLabel: hasOwn(CONNECTION_KIND_LABELS, kind) ? CONNECTION_KIND_LABELS[kind] : kind,
        detail: asString(connection.detail),
        joins: asArray(connection.joins).map(function (joined) { return String(joined); }).join(' and '),
        struck: isStruckConnection(connection),
        repeatedId: id !== '' && connectionRepeats.has(id),
        concerns: b.concerns,
        marks: b.marks
      };
    });
    var stronger = onPage.has('strongerMainThread') ? weave.strongerMainThread : null;
    var strongerView = null;
    if (stronger) {
      var strongerId = asString(stronger.thread).trim();
      var named = asArray(weave.threads).filter(function (t) { return weaveIdOf(t) === strongerId; })[0];
      var sb = at('strongerMainThread');
      strongerView = { thread: strongerId, claim: named ? asString(named.claim) : '', reason: asString(stronger.reason), concerns: sb.concerns, marks: sb.marks };
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
        marks: id ? at('question:' + id).marks : []
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
      threads: threads,
      roles: Object.keys(WEAVE_ROLE_LABELS).map(function (value) { return { value: value, label: WEAVE_ROLE_LABELS[value] }; }),
      connections: connections,
      convergence: line('convergence', weave.convergence),
      strongerMainThread: strongerView,
      questions: questions,
      repeatedIdHint: threads.some(function (t) { return t.repeatedId; }) || connections.some(function (c) { return c.repeatedId; }) ? REPEATED_ID_HINT : '',
      checkFailures: asArray(d.checkFailures).filter(isPlainObject)
        .map(function (failure) { return asString(failure.message).trim(); })
        .filter(Boolean)
        .map(function (message) { return 'Check still failing: ' + message; }),
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

  /** What a rollback to `target` costs, for the rollback panel: going back to the meeting costs no model call (R9). */
  function rollbackWarningLine(target) {
    return target === MEETING_STOP ? MEETING_ROLLBACK_LINE : ROLLBACK_WARNING;
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

  /** What the page calls each of a beat's kinds. The keys are lib/map.js MAP_BEAT_KINDS (a test holds them equal). */
  var BEAT_KIND_LABELS = { scene: 'Scene', receipt: 'Receipt', line: 'Line', figure: 'Figure' };

  /** The line under the settled story: the story is the meeting's, and going back there costs no model call (R9). */
  var STORY_HINT = 'The story was settled at the story meeting. To change it, go back to the meeting: it reopens as you left it, with no model call.';

  /** Why a line's controls are off, while any are: no move or edit can find a line under the writer's repeat. */
  var MAP_LOCKED_HINT = 'The writer gave one id to more than one beat, or placed a photo twice, so the map cannot move or edit those lines: a send-back gives each its own place.';

  /** The top photo's place as a photo's move control names it, and a photo's place by itself in its section. */
  var TOP_PHOTO_LABEL = 'The top of the article';
  var BY_ITSELF_LABEL = 'By itself, with its people';

  /** How much of a beat's material a "beside" choice shows. */
  var BESIDE_TEXT_LENGTH = 60;

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
    var beatName = function (beat, index) { return outlineEditLogic().beatIdOf(beat) || String(Number(index) + 1); };
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
   * (tasks 4.6c and 4.6e).
   *
   * @param {*} map - the map as the director left it
   * @param {Object} data - the stop's payload: the map it showed and the theme's slots
   * @returns {string|null}
   */
  function mapProblems(map, data) {
    var d = isPlainObject(data) ? data : {};
    var editLogic = outlineEditLogic();
    var result = editLogic.validateOutlineShape(map, null, d.mapSlots, d.outline);
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
   * `sections[#theStory].beats[#b2].material`, `leftOut[#b4]`, `topPhoto`): `beat:<id>` (in a
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
   * How the map phrases an edit a rework changed (changedEditLine, every stop's builder): its
   * place as the report names it, with each slot under its label and no edit id, since the map
   * shows none; a moved element is a beat or a photo, and a section it went to reads by its
   * label; text that came back is still on the map (task 4.10).
   *
   * @param {Array} slots - slotsOf(data)
   */
  function mapEditLineOptions(slots) {
    return {
      place: function (entry) { return capitalized(slotWords(asString(entry.where) || scopeLabel(entry.scope), slots)); },
      valueText: function (text) {
        var m = /^section "([^"]*)"$/.exec(asString(text));
        return m ? slotLabelOf(m[1], slots) : text;
      },
      thing: function (entry) { return /(^|, )photo "/.test(asString(entry.where)) ? 'photo' : 'beat'; },
      stillIn: 'on the map'
    };
  }

  /** A served copy of a session photo, for the map's thumbnails: the session's photos folder (server.js /sessionphotos). */
  function mapPhotoUrl(sessionId, filename) {
    if (!sessionId || !asString(filename)) return '';
    return '/sessionphotos/' + encodeURIComponent(sessionId) + '/' + encodeURIComponent(filename);
  }

  /**
   * A beat's material or card as the map's page prints it (task 4.6c): the document it names,
   * by its name and owner, found through the stop's evidenceIndex as the story meeting finds a
   * receipt's (receiptView); or the text as written when it names no document the index holds,
   * such as a speaker and the line, or a ledger entry.
   *
   * @param {*} text - a beat's material, or its card
   * @param {Object} evidenceIndex - data.evidenceIndex
   * @returns {string}
   */
  function mapDocumentText(text, evidenceIndex) {
    var named = receiptView(text, evidenceIndex);
    return named && named.known && !named.ledger ? named.label : asString(text);
  }

  /**
   * The map's page (spec 5.2): the stop's payload (4.6's, lib/map.js mapCheckpointData) with the
   * map as the director has it.
   * - `settledStory` at the top, read-only, with `storyHint`, the way back to the meeting;
   * - the round's lines: `round` (after a send-back, with its note), `checkFailures` (one line
   *   each), `changedEdits` (each edit a rework changed that a stop shows, changedEditsToShow,
   *   by changedEditLine with the map's places: a send-back's with its reason, and what no pass
   *   put back; task 4.10), `kept`, the line that says the director's edits stand when none of
   *   theirs is listed (editsStandLine; brief 4.10b), and `otherConcerns`, the concerns none of
   *   whose places the page shows;
   * - `gapNote`, `headline`, `deck` and `topPhoto`;
   * - `sections`, in the map's order, each under its slot's label with its heading, job, beats
   *   and photos, each beat and photo with the places it can move to, and each beat's material
   *   and card as the page prints them (`materialText`, `cardText`: the document named, through
   *   the payload's evidenceIndex; mapDocumentText);
   * - `dropped`, each with its reason; `tally`, the lines of Everyone and the counts, rebuilt
   *   from the map as edited (mapTallyOf); `leftOut`, folded, each item with the sections it can
   *   come back to; `weaveChanges`, each with its source;
   * - every concern beside the line of the edit it is about (concernsBesideLines), and a line
   *   under a repeat of the map the stop showed (mapRepeats, the writer's) `locked`, its
   *   controls off, with `lockedHint`.
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
    var writers = editLogic.mapRepeats(shown);
    var placed = concernsBesideLines(d.concerns, mapLinesOnPage(map), mapLineKeyOf);
    var at = function (key) { return placed.byLine.get(key) || []; };
    var sections = asArray(map.sections).filter(isPlainObject);
    var targets = sections.map(function (s) { return { value: s.slot, label: slotLabelOf(s.slot, slots) }; });
    var others = function (slot) { return targets.filter(function (t) { return t.value !== slot; }); };

    var beatView = function (beat, index, slot) {
      var b = isPlainObject(beat) ? beat : {};
      var id = editLogic.beatIdOf(b);
      var card = editLogic.beatCardOf(b);
      return {
        key: (slot === null ? 'leftOut' : slot) + '-beat-' + index,
        id: id,
        index: index,
        kindLabel: hasOwn(BEAT_KIND_LABELS, b.kind) ? BEAT_KIND_LABELS[b.kind] : '',
        material: asString(b.material),
        materialText: mapDocumentText(b.material, d.evidenceIndex),
        players: stringList(b.players).join(', '),
        card: card,
        cardText: mapDocumentText(card, d.evidenceIndex),
        connection: asString(b.connection).trim(),
        concerns: id ? at('beat:' + id) : [],
        added: id !== '' && shownBeatIds.indexOf(id) === -1,
        locked: id === '' || writers.beatIds.indexOf(id) !== -1,
        moveTargets: slot === null ? targets : others(slot)
      };
    };

    var photoView = function (photo, index, section) {
      var p = isPlainObject(photo) ? photo : {};
      var filename = asString(p.filename);
      var key = editLogic.photoKey(filename);
      var beside = asString(p.beat).trim();
      var options = [{ value: '', label: BY_ITSELF_LABEL }].concat(asArray(section.beats)
        .filter(function (b) { return editLogic.beatIdOf(b) !== ''; })
        .map(function (b) { return { value: editLogic.beatIdOf(b), label: 'Beside ' + editLogic.beatIdOf(b) + ': ' + shortText(mapDocumentText(b.material, d.evidenceIndex)) }; }));
      if (beside && !options.some(function (o) { return o.value === beside; })) {
        options.push({ value: beside, label: 'Beside ' + beside + ', which is not in this section' });
      }
      return {
        key: section.slot + '-photo-' + index,
        slot: section.slot,
        index: index,
        filename: filename,
        beat: beside,
        besideOptions: options,
        moveTargets: [{ value: editLogic.MAP_TOP_PHOTO, label: TOP_PHOTO_LABEL }].concat(others(section.slot)),
        concerns: at('photo:' + key),
        locked: !filename.trim() || writers.photoKeys.indexOf(key) !== -1
      };
    };

    var topName = asString(map.topPhoto);
    var topPhoto = topName.trim()
      ? { filename: topName, concerns: at('topPhoto'), moveTargets: targets, locked: writers.photoKeys.indexOf(editLogic.photoKey(topName)) !== -1 }
      : null;

    var sectionViews = sections.map(function (section, i) {
      return {
        key: 'section-' + i,
        slot: section.slot,
        label: slotLabelOf(section.slot, slots),
        heading: asString(section.heading),
        job: asString(section.job),
        concerns: at('section:' + section.slot),
        beats: asArray(section.beats).map(function (beat, j) { return beatView(beat, j, section.slot); }),
        photos: asArray(section.photos).map(function (photo, j) { return photoView(photo, j, section); })
      };
    });

    var leftItems = asArray(map.leftOut).map(function (beat, j) {
      var view = beatView(beat, j, null);
      view.targets = targets;
      return view;
    });

    var tally = mapTallyOf(d, map);
    var unplaced = tally.unplaced.filter(function (name) { return tally.raised.indexOf(name) === -1; });
    var cardsOff = tally.cards < MAP_CARDS.min || tally.cards > MAP_CARDS.max;
    var length = map.expectedLength;
    var lineOptions = mapEditLineOptions(slots);
    var human = Number(d.humanRevisionCount) || 0;
    var feedback = asString(d.previousFeedback).trim();
    var anyLocked = sectionViews.some(function (s) {
      return s.beats.some(function (b) { return b.locked; }) || s.photos.some(function (p) { return p.locked; });
    }) || leftItems.some(function (b) { return b.locked; }) || Boolean(topPhoto && topPhoto.locked);

    return {
      settledStory: story,
      storyHint: STORY_HINT,
      round: human > 0
        ? { label: roundsBanner(human, d.revisionCount, d.maxRevisions).roundLabel, note: feedback ? 'You sent the map back with: "' + feedback + '"' : '' }
        : null,
      checkFailures: asArray(d.checkFailures).filter(isPlainObject)
        .map(function (failure) { return asString(failure.message).trim(); })
        .filter(Boolean)
        .map(function (message) { return 'Check still failing: ' + message; }),
      changedEdits: changedEditsToShow(d.handEditReport).map(function (entry) { return changedEditLine(entry, lineOptions); }),
      kept: editsStandLine(d.handEditReport),
      otherConcerns: placed.other,
      gapNote: isPlainObject(map.gapNote)
        ? { line: asString(map.gapNote.line), players: stringList(map.gapNote.players).join(', '), concerns: at('gapNote') }
        : null,
      headline: { text: asString(map.headline), concerns: at('headline') },
      deck: { text: asString(map.deck), concerns: at('deck') },
      topPhoto: topPhoto,
      sections: sectionViews,
      dropped: asArray(map.dropped).filter(isPlainObject).map(function (entry) {
        return { key: 'dropped-' + entry.slot, slot: entry.slot, label: slotLabelOf(entry.slot, slots), reason: asString(entry.reason), concerns: at('dropped:' + entry.slot) };
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
        open: leftItems.some(function (item) { return item.concerns.length > 0; }),
        items: leftItems
      },
      weaveChanges: asArray(map.weaveChanges).filter(isPlainObject).map(function (change, i) {
        var source = asString(change.source).trim();
        return {
          key: 'change-' + i,
          source: source === MAP_NOTE_SOURCE ? 'Your note at the meeting' : 'Your change ' + source + ' at the meeting',
          change: asString(change.change)
        };
      }),
      weaveChangesConcerns: at('weaveChanges'),
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
   * line holds DOCUMENT_SLOT, as the story meeting names a receipt (receiptView, through the
   * stop's evidenceIndex). A finding stored before the fact check wrote lines reads as its
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
    return line.split(DOCUMENT_SLOT).join(named && named.known && !named.ledger ? named.label : UNNAMED_DOCUMENT);
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

  /** An elision inside a quoted passage, where the passage is split (lib/hand-edit-diff.js ELLIPSIS). */
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
   * Where an edit a round changed sits: beside the piece that prints what the director's text
   * became, or, for a block a pass moved, the block itself, the entry's section first; possibly
   * resolved when only the article as the stop opened it printed that; beside no piece when the
   * pass took it out.
   */
  function changedPlace(entry, ctx) {
    var prefer = scopePieces(entry.scope);
    var target;
    if (entry.moved === true) {
      if (typeof entry.became !== 'string') return null;
      var went = /section "([^"]*)"/.exec(entry.became);
      if (went) prefer = inSection(went[1]);
      target = asString(entry.director);
    } else {
      target = typeof entry.became === 'string' ? entry.became : '';
    }
    if (!collapsedText(target)) return null;
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
   *   director's text became (`changed`), with the rework's reason for a send-back's.
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
    CONNECTION_KIND_LABELS: CONNECTION_KIND_LABELS,
    LEDGER_RECEIPT: LEDGER_RECEIPT,
    STRUCK_KEY: STRUCK_KEY,
    WEAVE_ANSWER_KEY: WEAVE_ANSWER_KEY,
    DIRECTOR_WEAVE_SHAPE: DIRECTOR_WEAVE_SHAPE,
    THIN_NOTES_LINE: THIN_NOTES_LINE,
    MEETING_LINE_LABELS: MEETING_LINE_LABELS,
    MEETING_ROLLBACK_LINE: MEETING_ROLLBACK_LINE,
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
    BEAT_KIND_LABELS: BEAT_KIND_LABELS,
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
