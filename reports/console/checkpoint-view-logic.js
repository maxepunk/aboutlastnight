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
 *   lastEvaluationFrom / evaluationView
 *     state.evaluationHistory is an APPEND-ONLY ARRAY mixing all three phases;
 *     Outline.js and Article.js read `.overallScore` straight off the array and
 *     ArcSelection.js read a per-arc `arc.evaluationHistory` that is never
 *     populated, so the Opus verdict — the entire point of the evaluate/revise
 *     loop — never appeared on any screen (R5 F4, CODE-REVIEW H6). The server
 *     now sends `lastEvaluation` pre-selected per phase; the array fallback is
 *     kept for a payload captured before Task 3.
 *
 *   meetingView (task 4.8)
 *     the arc stop is the story meeting: one weave, read and settled in minutes.
 *     The arc cards it replaced read the arc schema's fields (CODE-REVIEW H7);
 *     the meeting reads 4.5's payload (lib/meeting.js meetingCheckpointData) and
 *     sends only 4.5's payloads (meetingPayload).
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

  // ── Evaluation ────────────────────────────────────────────────────────────

  /**
   * The evaluation to render on this screen.
   *
   * `data.lastEvaluation` is what server.js#lastEvaluationFor already selected
   * for the phase. The `evaluationHistory` branch is the fallback for a payload
   * produced before that existed: the array mixes phases AND revision-invalidated
   * stubs, so "the last entry" is routinely another phase's verdict — filter by
   * phase and take the last, exactly as the server does.
   *
   * @param {object|null} data - checkpoint payload
   * @param {string} [phase] - 'arcs' | 'outline' | 'article'
   * @returns {object|null}
   */
  function lastEvaluationFrom(data, phase) {
    var payload = data || {};
    if (payload.lastEvaluation) return payload.lastEvaluation;
    var entries = asArray(payload.evaluationHistory)
      .filter(function (e) { return e && e.phase === phase; });
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  /**
   * The one phrase a model evaluation's score carries, at all three stops (phase 2,
   * brief 2.4).
   *
   * No judge has yet been checked against the director's own approvals and send
   * backs; that calibration is phase 7. All eight evaluations of 091826 and 092026
   * passed with no structural issue, and one of them cited "I was not in that
   * room" as good voice. A score says what the model thought, not how likely the
   * director is to accept the output.
   */
  var UNCALIBRATED_SCORE_LABEL =
    'Uncalibrated: the model\'s own score, not yet checked against your approvals and send-backs.';

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
   * made the change; any other pass is an automatic pass's number. A copy of
   * lib/hand-edit-diff.js SEND_BACK_PASS; a test holds the two equal.
   */
  var SEND_BACK_PASS = 'send-back';

  /** The heading the concerns about the director's edits sit under, at the evaluation bar and in the fact check. */
  var DIRECTOR_EDIT_CONCERNS_LABEL = 'Concerns about your edits';

  /** What a concern is, under that heading at the evaluation bar. */
  var DIRECTOR_EDIT_CONCERNS_HINT =
    'The judge disagrees with these lines you wrote or cut. Nothing was sent back for them: they are yours to decide.';

  function isDirectorEditConcern(text) {
    return typeof text === 'string' && text.indexOf(DIRECTOR_EDIT_PREFIX) === 0;
  }

  /**
   * Display shape for the evaluation bar, shared by all three gates.
   *
   * Two field-name hazards handled here rather than in three components:
   *   - the score is 0-1, and the old bars printed it as `0.95/10`;
   *   - `structuralPassed` is only on the fact-check-sourced entry; the Opus
   *     history entry (evaluator-nodes.js historyEntry) carries `ready` instead.
   *
   * `calibration` is UNCALIBRATED_SCORE_LABEL whenever the entry carries a model's
   * score. It is '' for an entry with no score, and for the fact check's entry
   * (`source: 'fact-check'`), whose 0 is a placeholder the evaluator writes when
   * the check stops a bundle before the model sees it: a check's answer is
   * definite and has nothing to calibrate.
   *
   * F1: the advisories that open with DIRECTOR_EDIT_PREFIX are the judge's concerns
   * about the director's own edits. They come apart from the other advisories, under
   * their own heading (`directorEditConcerns`, `directorEditConcernsLabel`).
   *
   * @param {object|null} evaluation
   * @returns {{score: string|null, calibration: string, passed: boolean,
   *            structuralIssues: string[], advisoryWarnings: string[],
   *            directorEditConcerns: string[], directorEditConcernsLabel: string,
   *            directorEditConcernsHint: string,
   *            revisionGuidance: string, confidence: string,
   *            revisionNumber: number|null, escalated: boolean,
   *            escalationReason: string, source: string}|null}
   */
  function evaluationView(evaluation) {
    if (!evaluation || typeof evaluation !== 'object') return null;
    var score = typeof evaluation.overallScore === 'number' && !Number.isNaN(evaluation.overallScore)
      ? evaluation.overallScore.toFixed(2)
      : null;
    var passed = evaluation.structuralPassed !== undefined
      ? evaluation.structuralPassed === true
      : evaluation.ready === true;
    var source = asString(evaluation.source);
    var advisories = stringList(evaluation.advisoryWarnings);
    var concerns = advisories.filter(isDirectorEditConcern);
    return {
      score: score,
      calibration: score !== null && source !== 'fact-check' ? UNCALIBRATED_SCORE_LABEL : '',
      passed: passed,
      structuralIssues: stringList(evaluation.structuralIssues),
      advisoryWarnings: advisories.filter(function (text) { return !isDirectorEditConcern(text); }),
      directorEditConcerns: concerns,
      directorEditConcernsLabel: DIRECTOR_EDIT_CONCERNS_LABEL + ' (' + concerns.length + ')',
      directorEditConcernsHint: DIRECTOR_EDIT_CONCERNS_HINT,
      revisionGuidance: asString(evaluation.revisionGuidance),
      confidence: asString(evaluation.confidence),
      revisionNumber: typeof evaluation.revisionNumber === 'number' ? evaluation.revisionNumber : null,
      escalated: evaluation.escalatedToHuman === true,
      escalationReason: asString(evaluation.escalationReason),
      source: source
    };
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
   * The article fact-check as a defect list the gate can render.
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
  var SCOPE_LABELS = {
    lede: 'LEDE', theStory: 'THE STORY', followTheMoney: 'FOLLOW THE MONEY', thePlayers: 'THE PLAYERS',
    whatsMissing: "WHAT'S MISSING", closing: 'CLOSING',
    executiveSummary: 'EXECUTIVE SUMMARY', evidenceLocker: 'EVIDENCE LOCKER', memoryAnalysis: 'MEMORY ANALYSIS',
    suspectNetwork: 'SUSPECT NETWORK', outstandingQuestions: 'OUTSTANDING QUESTIONS', finalAssessment: 'FINAL ASSESSMENT',
    headline: 'Headline', byline: 'Byline', pullQuotes: 'Pull quotes', evidenceCards: 'Evidence cards',
    financialTracker: 'Financial tracker', photos: 'Photos', heroImage: 'Hero image'
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

  /** What the line says of text the director took out that came back: it stays for the director to cut. */
  var STILL_IN_ARTICLE = 'It is still in the article: cut it again if it should go.';

  /**
   * What the line says of a block the director moved that an automatic pass removed: a
   * move is the block's place only, and its text the writer's, so code leaves it out
   * (lib/hand-edit-diff.js settleEdits; FA fix round 1).
   */
  var MOVED_BLOCK_LEFT_OUT = 'Only its place was your edit, so it was not put back: add it again if it should stay.';

  /**
   * One line for an edit a pass changed (F1, FA): its place (by default its id and field,
   * since FA; an entry from before FA names its scope), what happened to the director's
   * text, which pass did it, and what followed. Who made a change is the entry's own
   * `automatic` flag (known item 7). Every stop phrases its report here: the map and the
   * desk through steeringView, the story meeting through meetingView, which names its
   * places as its page heads them and a role as its picker names it (task 4.8, fix round 1).
   * - A connection the director struck (brief 4.5) that a pass brought back or took out;
   *   after an automatic pass, whether code struck it again.
   * - A field or element an automatic pass changed: code put it back (`restored`), and
   *   the line says so; an entry from before FA says the pass should have kept it.
   * - A cut, or a sentence a rewrite removed, that came back: it is still in the article,
   *   because code never takes text out.
   * - A block the director moved that a pass took to another section: where it went, and
   *   whether code put it back; one a pass removed: that code left it out, since only its
   *   place was the director's edit.
   * - A change a send-back's rework made: the rework's reason, or that it gave none.
   *
   * @param {Object} entry - one of the report's `changed` entries (lib/hand-edit-diff.js reportAfterPass)
   * @param {Object} [options]
   * @param {function(Object): string} [options.place] - the entry's place; by default its id and `where`
   * @param {function(string): string} [options.valueText] - how a value reads; by default as written
   * @returns {string}
   */
  function changedEditLine(entry, options) {
    var o = options || {};
    var label = typeof o.place === 'function'
      ? o.place(entry)
      : entry.id + ', ' + (asString(entry.where) ? entry.where : scopeLabel(entry.scope));
    var valueText = typeof o.valueText === 'function' ? o.valueText : function (text) { return text; };
    var became = typeof entry.became === 'string' ? valueText(entry.became) : null;
    var director = valueText(asString(entry.director));
    var automatic = entry.automatic === true;
    var by = automatic ? 'automatic pass ' + entry.pass : 'the rework of your send-back';
    var reason = asString(entry.reason).trim();
    var why = reason ? 'Why: ' + reason : 'No reason given.';
    var cameBackAs = became !== null ? ' as "' + became + '"' : '';
    if (entry.struck === true) {
      var struck = label + ': ' + by + (became !== null ? ' brought it back.' : ' took it out.');
      if (!automatic) return struck + ' ' + why;
      if (became === null) return struck;
      return struck + (entry.restored === true ? ' It was struck again.' : ' It could not be struck again.');
    }
    if (entry.cut === true) return label + ': the text you cut came back' + cameBackAs + ' (' + by + '). ' + (automatic ? STILL_IN_ARTICLE : why);
    if (entry.removed === true) return label + ': a sentence you removed came back' + cameBackAs + ' (' + by + '). ' + (automatic ? STILL_IN_ARTICLE : why);
    if (entry.moved === true) {
      var moved = became !== null ? 'moved the block you placed here to ' + became : 'removed the block you placed here';
      if (!automatic) return label + ': ' + by + ' ' + moved + '. ' + why;
      if (entry.restored === true) return label + ': ' + by + ' ' + moved + '. It was put back.';
      return label + ': ' + by + ' ' + moved + '. ' + (became !== null ? 'It could not be put back.' : MOVED_BLOCK_LEFT_OUT);
    }
    if (automatic && entry.restored === true) {
      return label + ': ' + by + (became !== null ? ' changed your "' + director + '" to "' + became + '"' : ' removed your "' + director + '"') + '. Your text was put back.';
    }
    var what = became !== null ? 'your "' + director + '" became "' + became + '"' : 'your "' + director + '" is gone';
    if (automatic) return label + ': ' + what + ' (' + by + ', which should have kept your edit). No reason given.';
    return label + ': ' + what + ' (' + by + '). ' + why;
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
   * The hand-edit report and the standing notes as RevisionDiff renders them.
   *
   * F1: `changedEdits` holds one line per edit a pass changed this round
   * (changedEditLine), `automatic` marking a change an automatic pass made and
   * `restored` one code put back (FA), each read from the entry's own flags;
   * `keptCount` is the edits checked when none changed. `notes` are standingNoteItems',
   * under `labels`, the console's stop labels.
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
  // One note box at the outline and article stops, sent with whatever the director
  // presses. Before this the only place to write was behind the Reject button, so a
  // note the director had ready at an approve had nowhere to go but a paid rework:
  // last session a structural note existed at 20:35 and reached the writer 52 minutes
  // later. The key assembly lives here because those keys are the whole contract with
  // the server's buildResumePayload, and the components have no test harness.
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
   * @param {object} keys - the four payload keys for one stop
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

  var OUTLINE_REVIEW_KEYS = { decision: 'outline', feedback: 'outlineFeedback', note: 'outlineNote', edits: 'outlineEdits' };
  var ARTICLE_REVIEW_KEYS = { decision: 'article', feedback: 'articleFeedback', note: 'articleNote', edits: 'articleEdits' };

  function outlineReviewPayload(edits, note, action) {
    return reviewPayload(OUTLINE_REVIEW_KEYS, edits, note, action);
  }

  function articleReviewPayload(edits, note, action) {
    return reviewPayload(ARTICLE_REVIEW_KEYS, edits, note, action);
  }

  /**
   * The Send back button at the outline and article stops takes TWO clicks (review
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
   * @param {string} noun - 'outline' or 'article', for the aria-label
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

  /**
   * One line per criterion the evaluation scored, in its own order. Accepts the
   * current `{score, type, notes, fix}` object and a bare number, as
   * buildRevisionContext does.
   */
  function traceCriteria(scores) {
    if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return [];
    return Object.keys(scores).map(function (name) {
      var value = scores[name];
      var detail = value && typeof value === 'object' ? value : {};
      var score = typeof value === 'number' ? value
        : (typeof detail.score === 'number' ? detail.score : null);
      var text = name + ': ' + (score === null ? 'unscored' : score.toFixed(2));
      if (asString(detail.type)) text += ' (' + detail.type + ')';
      if (asString(detail.notes).trim()) text += '. ' + detail.notes.trim();
      if (asString(detail.fix).trim()) text += ' Fix: ' + detail.fix.trim();
      return { key: name, text: text };
    });
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
   * @param {Array|null} trace - data.trace at the outline or article stop
   * @param {string} [theme='journalist'] - the session's theme, which decides whether a
   *   pass's rework was given the evaluation's guidance (TRACE_GUIDANCE_LABELS)
   * @returns {{any: boolean, title: string, passes: Array<{key: string, heading: string,
   *            triggerLabel: string, mustFix: {label: string, items: string[]},
   *            shouldConsider: {label: string, items: string[]}, noFindings: boolean,
   *            changed: {labels: string[], text: string}, guidance: string,
   *            criteria: Array<{key: string, text: string}>, criteriaLabel: string}>}}
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
        var criteria = traceCriteria(findings.criteriaScores);
        return {
          key: 'pass-' + number + '-' + index,
          heading: 'Automatic pass ' + number + (time ? ', at ' + time : ''),
          triggerLabel: TRACE_TRIGGER_LABELS[p.trigger] || 'Why it ran: not recorded.',
          mustFix: traceFindingList('Must fix', mustFix),
          shouldConsider: traceFindingList('Should consider', shouldConsider),
          noFindings: mustFix.length === 0 && shouldConsider.length === 0 && !guidance && criteria.length === 0,
          changed: traceChanged(p.changedScopes),
          guidance: guidance ? guidanceLabel + guidance : '',
          criteria: criteria,
          criteriaLabel: 'Scores (' + criteria.length + ')'
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
   * Each kind a question can have and the word the panel shows for it (fix 3.7b). Phase 4
   * (brief 4.4): the weave's three, lib/writer-questions.js WEAVE_QUESTION_KINDS, since
   * the story meeting asks the questions (a test holds the keys equal to that list). A
   * question of another kind renders with no kind shown.
   */
  var WRITER_QUESTION_KIND_LABELS = { player: 'Player', pronoun: 'Pronoun', figure: 'Figure' };

  /**
   * What the panel tells the director an answer does at each stop (task 3.11; final
   * review, questions-console-docs finding 3). At the arc and outline stops the note
   * reaches the next writer whichever button is pressed, as guidance or a standing
   * note, but that writer never sees the questions, so each answer says what it is
   * about. At the article stop Approve goes straight to assembly and nothing reads
   * its note, so the answers go with a send back.
   */
  var WRITER_QUESTIONS_HINTS = {
    'arc-selection': 'Answer them in the note below, saying what each answer is about.',
    outline: 'Answer them in the note below, saying what each answer is about.',
    article: 'Send back with your answers in the note below to have the writer apply them. Approve publishes the article as it is.'
  };

  /**
   * The writer's questions panel at the arc, outline and article stops (spec C15,
   * D8): one line per question, its kind and what it is about first, skimmed in a
   * glance, then the stop's hint for answering them. An entry without both strings is
   * left out, and an empty list shows no panel. A question with no kind, or an unknown
   * one (a list from before the field had a kind), renders with none.
   *
   * @param {Array|null} questions - data.writerQuestions
   * @param {string} stop - 'arc-selection', 'outline' or 'article': the stop showing
   *   the panel, whose hint says what an answer does there; any other value throws
   * @returns {{any: boolean, title: string, hint: string,
   *            items: Array<{key: string, kind: (string|null), kindLabel: string, about: string, question: string}>}}
   */
  function writerQuestionsView(questions, stop) {
    if (!Object.prototype.hasOwnProperty.call(WRITER_QUESTIONS_HINTS, stop)) {
      throw new Error("writerQuestionsView: stop must be 'arc-selection', 'outline' or 'article', got " + String(stop));
    }
    var items = asArray(questions)
      .filter(function (q) { return q && typeof q === 'object'; })
      .map(function (q) {
        var kind = Object.prototype.hasOwnProperty.call(WRITER_QUESTION_KIND_LABELS, q.kind) ? q.kind : null;
        return { kind: kind, about: asString(q.about).trim(), question: asString(q.question).trim() };
      })
      .filter(function (q) { return q.about.length > 0 && q.question.length > 0; })
      .map(function (q, index) {
        return {
          key: 'question-' + index,
          kind: q.kind,
          kindLabel: q.kind ? WRITER_QUESTION_KIND_LABELS[q.kind] : '',
          about: q.about,
          question: q.question
        };
      });
    return {
      any: items.length > 0,
      title: 'Questions from the writer (' + items.length + ')',
      hint: WRITER_QUESTIONS_HINTS[stop],
      items: items
    };
  }

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

  /** What a meeting with no weave says, and what going back to the meeting does then (R2). */
  var EMPTY_MEETING_LINE = 'No weave reached the story meeting: the arc writer may have failed, or this session is from before the meeting. Going back to the story meeting writes one fresh, about 15 minutes with its fact check.';

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
   * computeResetKey (console/outline-edit-logic.js), read when it runs: that module loads
   * after this one in the browser, and the reducer and the meeting call this long after both.
   */
  function resetKeyOf(value, round) {
    var editLogic = (typeof window !== 'undefined' && window.Console && window.Console.outlineEditLogic)
      || (typeof require === 'function' ? require('./outline-edit-logic') : null);
    if (!editLogic || typeof editLogic.computeResetKey !== 'function') {
      throw new Error('checkpoint-view-logic: the story meeting keys its weave with outline-edit-logic.js computeResetKey, which is not loaded');
    }
    return editLogic.computeResetKey(value, round);
  }

  /**
   * The weave version the meeting shows, keyed the way computeResetKey keys the outline:
   * the weave as the stop sent it, with the director's rounds and the automatic passes.
   *
   * @param {Object} data - the stop's payload
   * @returns {string}
   */
  function meetingVersion(data) {
    var d = isPlainObject(data) ? data : {};
    var round = (Number(d.humanRevisionCount) || 0) * 1000 + (Number(d.revisionCount) || 0);
    return resetKeyOf(d.weave === undefined ? null : d.weave, round);
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

  /**
   * The pendingEdits a new checkpoint leaves (state.js CHECKPOINT_RECEIVED). Every stop's
   * slot is cleared, as it always was, except the meeting's: the director's weave and note
   * stay while the stop shows the same weave version, so a remount of that version (a
   * refused send, the attach watchdog's reload) keeps them, and go when a new one arrives.
   *
   * @param {Object} pendingEdits - state.pendingEdits
   * @param {string} checkpointType - the checkpoint that arrived
   * @param {Object} data - its payload
   * @returns {Object}
   */
  function pendingEditsAfterCheckpoint(pendingEdits, checkpointType, data) {
    var kept = {};
    if (checkpointType !== MEETING_STOP || !isPlainObject(pendingEdits)) return kept;
    if (!slotFits(data, pendingEdits[MEETING_STOP])) return kept;
    kept[MEETING_STOP] = pendingEdits[MEETING_STOP];
    var noteKey = noteSlotKey(MEETING_STOP);
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
   * How the meeting phrases an edit a send-back changed (changedEditLine, every stop's
   * builder): its place as the page heads it, with no edit id, since the meeting shows none,
   * and a role as the role picker names it.
   */
  var MEETING_EDIT_LINE = { place: meetingEditPlace, valueText: roleWord };

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
   * The concerns and the marks by the line of the page they sit beside (linesOnPage), and
   * the ones no line shows, each listed with its place:
   * - `otherConcerns`: a concern none of whose places is on the page;
   * - `removed`: a line or an element the round took out (`takenOut`, by its key);
   * - `otherMarks`: any other mark whose line the page does not show, such as a question the
   *   stop does not ask.
   *
   * @param {Object} data - the stop's payload
   * @param {Set<string>} onPage - the lines the page shows
   */
  function besideLines(data, onPage) {
    var concerns = new Map();
    var marks = new Map();
    var out = { concerns: concerns, marks: marks, otherConcerns: [], removed: [], otherMarks: [], takenOut: new Set() };
    var add = function (map, key, line) {
      var list = map.get(key) || [];
      if (list.indexOf(line) === -1) list.push(line);
      map.set(key, list);
    };
    asArray(data.concerns).filter(isPlainObject).forEach(function (concern) {
      var line = 'Concern: ' + concernFindingOf(concern.text);
      var keys = asArray(concern.places)
        .map(function (place) { return lineKeyOf(place && place.path); })
        .filter(function (key) { return onPage.has(key); });
      if (keys.length === 0) out.otherConcerns.push(line);
      keys.forEach(function (key) { add(concerns, key, line); });
    });
    var round = isPlainObject(data.marks) ? data.marks : {};
    asArray(round.marks).filter(isPlainObject).forEach(function (mark) {
      var key = lineKeyOf(mark.path);
      if (!asString(mark.after) && (isElementPath(mark.path) || !onPage.has(key))) {
        out.removed.push(removedLine(mark));
        if (key !== null) out.takenOut.add(key);
      } else if (onPage.has(key)) {
        add(marks, key, markLine(mark));
      } else {
        out.otherMarks.push(elsewhereLine(mark));
      }
    });
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
   *   `checkFailures` (one line each), `changedEdits` (the send-back's, with their reasons),
   *   `marked` and the marks no line shows (`removed`, `otherMarks`), and the concerns no
   *   line shows (`otherConcerns`).
   * The questions are the stop's (`data.questions`), each paired with its place in the
   * director's weave, whose answer the box shows and sets.
   *
   * @param {Object} data - the stop's payload
   * @param {Object|null} weave - the weave as the director has it (meetingDraftOf, then their changes)
   * @param {string} [note] - the meeting's note box (meetingNoteOf, then what they type)
   * @returns {Object}
   */
  function meetingView(data, weave, note) {
    var d = isPlainObject(data) ? data : {};
    if (!isWeaveValue(weave)) {
      return { hasWeave: false, order: [], emptyLine: EMPTY_MEETING_LINE, didNotRun: didNotRunLine(d.roundDidNotRun, note) };
    }
    var shown = meetingWeaveOf(d.weave);
    var stopQuestions = asArray(d.questions).filter(isPlainObject);
    var onPage = linesOnPage(weave, stopQuestions);
    var beside = besideLines(d, onPage);
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
    var report = editReportOf(d.handEditReport);
    return {
      hasWeave: true,
      order: MEETING_SECTIONS.filter(function (section) { return !hasOwn(present, section) || present[section]; }),
      emptyLine: '',
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
      changedEdits: report
        ? report.changed
          .filter(function (entry) { return entry.pass === SEND_BACK_PASS; })
          .map(function (entry) { return changedEditLine(entry, MEETING_EDIT_LINE); })
        : [],
      didNotRun: didNotRunLine(d.roundDidNotRun, note),
      marked: markedLine(d.marks),
      removed: beside.removed,
      otherMarks: beside.otherMarks,
      otherConcerns: beside.otherConcerns
    };
  }

  /**
   * The standing notes, folded under the meeting's note box: standingNoteItems', the list
   * every stop reads, under the console's stop labels (CHECKPOINT_LABELS, passed in).
   *
   * @param {Array} gateNotes - data.directorGateNotes
   * @param {Object} labels - stop type -> label
   * @returns {{any: boolean, title: string, items: Array<{key: string, label: string, text: string}>}}
   */
  function meetingStandingNotes(gateNotes, labels) {
    var items = standingNoteItems(gateNotes, labels);
    return { any: items.length > 0, title: 'Standing notes (' + items.length + ')', items: items };
  }

  /** What a rollback to `target` costs, for the rollback panel: going back to the meeting costs no model call (R9). */
  function rollbackWarningLine(target) {
    return target === MEETING_STOP ? MEETING_ROLLBACK_LINE : ROLLBACK_WARNING;
  }

  // ── RevisionDiff's key walk (fix 3.7b) ──────────────────────────────────────

  /**
   * The top-level keys RevisionDiff's client-side shallow diff skips: the writer's
   * questions are not part of the output a rework changes, so a round whose questions
   * changed lists nothing for them. The same list as the server's outline diff
   * (lib/hand-edit-diff.js OUTLINE_IGNORED_KEYS; a test holds the two equal).
   */
  var REVISION_DIFF_IGNORED_KEYS = ['writerQuestions'];

  /**
   * The keys RevisionDiff compares: every top-level key of either version, each once,
   * sorted, less REVISION_DIFF_IGNORED_KEYS. A missing version reads as empty.
   *
   * @param {Object|Array|null} previous
   * @param {Object|Array|null} current
   * @returns {string[]}
   */
  function revisionDiffKeys(previous, current) {
    var keys = Object.keys(previous || {}).concat(Object.keys(current || {}));
    return keys
      .filter(function (key, index) { return keys.indexOf(key) === index && REVISION_DIFF_IGNORED_KEYS.indexOf(key) === -1; })
      .sort();
  }

  var api = {
    lastEvaluationFrom: lastEvaluationFrom,
    evaluationView: evaluationView,
    // Phase 2, brief 2.4: the score's label at all three stops
    UNCALIBRATED_SCORE_LABEL: UNCALIBRATED_SCORE_LABEL,
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
    editReportOf: editReportOf,
    traceView: traceView,
    roundsBanner: roundsBanner,
    outlineReviewPayload: outlineReviewPayload,
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
    // Phase 3, brief 3.7: the writer's questions at the arc, outline and article stops
    writerQuestionsView: writerQuestionsView,
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
    // Fix 3.7b: RevisionDiff's key walk skips the writer's questions
    revisionDiffKeys: revisionDiffKeys,
    REVISION_DIFF_IGNORED_KEYS: REVISION_DIFF_IGNORED_KEYS
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.checkpointViewLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
