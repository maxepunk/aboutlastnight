/**
 * checkpoint-view-logic.js — PURE read-side logic for the four intervention
 * checkpoint screens (arc-selection, outline, article, input-review).
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
 *   arcCardModel
 *     the cards read keyMoments / financialConnections / thematicLinks / hook;
 *     the arc schema emits keyEvidence / caveats / unansweredQuestions /
 *     emotionalHook, and characterPlacements is an OBJECT MAP of name -> role
 *     (CODE-REVIEW H7).
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
   * Display shape for the evaluation bar, shared by all three gates.
   *
   * Two field-name hazards handled here rather than in three components:
   *   - the score is 0-1, and the old bars printed it as `0.95/10`;
   *   - `structuralPassed` is only on the fact-check-sourced entry; the Opus
   *     history entry (evaluator-nodes.js historyEntry) carries `ready` instead.
   *
   * @param {object|null} evaluation
   * @returns {{score: string|null, passed: boolean, structuralIssues: string[],
   *            advisoryWarnings: string[], revisionGuidance: string,
   *            confidence: string, revisionNumber: number|null,
   *            escalated: boolean, escalationReason: string, source: string}|null}
   */
  function evaluationView(evaluation) {
    if (!evaluation || typeof evaluation !== 'object') return null;
    var score = typeof evaluation.overallScore === 'number' && !Number.isNaN(evaluation.overallScore)
      ? evaluation.overallScore.toFixed(2)
      : null;
    var passed = evaluation.structuralPassed !== undefined
      ? evaluation.structuralPassed === true
      : evaluation.ready === true;
    return {
      score: score,
      passed: passed,
      structuralIssues: stringList(evaluation.structuralIssues),
      advisoryWarnings: stringList(evaluation.advisoryWarnings),
      revisionGuidance: asString(evaluation.revisionGuidance),
      confidence: asString(evaluation.confidence),
      revisionNumber: typeof evaluation.revisionNumber === 'number' ? evaluation.revisionNumber : null,
      escalated: evaluation.escalatedToHuman === true,
      escalationReason: asString(evaluation.escalationReason),
      source: asString(evaluation.source)
    };
  }

  // ── Arc cards ─────────────────────────────────────────────────────────────

  /**
   * One evidence reference as the card renders it (brief 1.2).
   *
   * keyEvidence is a plain array of ids in the current schema, but the arc
   * evidence packages carry `{id, owner}` objects, so both shapes resolve to an
   * id. `evidenceIndex` is the arc stop's payload map from that id to the
   * document behind it (`server.js#buildEvidenceIndex`); without it the director
   * is judging an arc by `85620c6f-befd-4799-a877-8fc25c040d8e`, which is what
   * happened last session. An id the index does not hold still renders: the
   * label falls back to the id, so a stale or hand-built payload shows something
   * rather than a blank badge.
   *
   * @param {string|object} entry
   * @param {object} index - evidenceIndex from the checkpoint payload
   * @returns {{id: string, name: string, owner: string, type: string,
   *            firstLine: string, label: string}|null}
   */
  function evidenceEntry(entry, index) {
    var id = '';
    var entryOwner = '';
    if (typeof entry === 'string') {
      id = entry;
    } else if (entry && typeof entry === 'object') {
      id = asString(entry.id) || asString(entry.tokenId) || asString(entry.description) || '';
      entryOwner = asString(entry.owner);
    }
    if (!id) return null;
    var known = (index && typeof index === 'object' && index[id]) || {};
    // The index falls back to the id when a document has no name of its own, and
    // repeating it as a name would claim more than the record holds.
    var name = asString(known.name) === id ? '' : asString(known.name);
    var owner = asString(known.owner) || entryOwner;
    return {
      id: id,
      name: name,
      owner: owner,
      type: asString(known.type),
      firstLine: asString(known.firstLine),
      label: (name || id) + (owner ? ' (' + owner + ')' : '')
    };
  }

  /**
   * characterPlacements normalised to a list.
   *
   * The arc schema emits an object map (`{ "Vic": "central" }`) and the
   * validator rebuilds it as one; an array of `{character|name, role}` is
   * accepted too so an older or hand-built payload still renders.
   */
  function placementList(placements) {
    if (Array.isArray(placements)) {
      return placements
        .map(function (p) {
          if (!p || typeof p !== 'object') return null;
          var name = asString(p.name) || asString(p.character);
          if (!name) return null;
          return { name: name, role: asString(p.role) };
        })
        .filter(Boolean);
    }
    if (!placements || typeof placements !== 'object') return [];
    return Object.keys(placements).map(function (name) {
      var role = placements[name];
      return { name: name, role: typeof role === 'string' ? role : (role == null ? '' : String(role)) };
    });
  }

  /**
   * Display model for one arc card.
   *
   * @param {object|null} arc
   * @param {object} [evidenceIndex] - the stop's id -> document map
   * @returns {{title: string, summary: string, hook: string,
   *            keyEvidence: Array<{id: string, name: string, owner: string, type: string,
   *                                firstLine: string, label: string}>,
   *            caveats: string[], unansweredQuestions: string[], source: string,
   *            strength: string, characters: Array<{name: string, role: string}>}}
   */
  function arcCardModel(arc, evidenceIndex) {
    var a = arc || {};
    var evidence = Array.isArray(a.keyEvidence) ? a.keyEvidence : a.keyMoments;
    return {
      title: asString(a.title),
      summary: asString(a.summary),
      keyEvidence: asArray(evidence)
        .map(function (entry) { return evidenceEntry(entry, evidenceIndex); })
        .filter(Boolean),
      // `emotionalHook` is the schema field; `hook` is what the cards used to read.
      hook: asString(a.emotionalHook) || asString(a.hook),
      caveats: stringList(a.caveats),
      unansweredQuestions: stringList(a.unansweredQuestions),
      source: asString(a.arcSource),
      strength: asString(a.evidenceStrength),
      characters: placementList(a.characterPlacements)
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

  // ── Arc selection defaults ────────────────────────────────────────────────

  /** How many arcs the outline prompt is written for. */
  var MIN_ARCS = 3;
  var MAX_ARCS = 5;

  /**
   * Which arcs to pre-select.
   *
   * Every arc arrived checked, which — with the cards unreadable (R5 F8) —
   * pushed the director to approve all five, and five-plus arcs routinely costs
   * an outline revision. Follow the evidence instead: the strong arcs, capped at
   * MAX_ARCS; with none strong, the first MIN_ARCS, so the screen still opens
   * with a workable selection rather than an empty one.
   *
   * The id convention matches the component's (`arc.id || arc.title`), which is
   * also what the approve payload sends as `selectedArcs`.
   *
   * @param {Array|null} arcs
   * @returns {string[]}
   */
  function defaultArcSelection(arcs) {
    var list = asArray(arcs);
    var idOf = function (arc) { return (arc && (arc.id || arc.title)) || ''; };
    var strong = list
      .filter(function (arc) { return arc && arc.evidenceStrength === 'strong'; })
      .slice(0, MAX_ARCS);
    var chosen = strong.length > 0 ? strong : list.slice(0, MIN_ARCS);
    return chosen.map(idOf).filter(function (id) { return id.length > 0; });
  }

  /**
   * The inline note for a selection outside the 3-5 band, or null inside it.
   *
   * @param {number} count
   * @returns {string|null}
   */
  function arcSelectionNote(count) {
    if (count > MAX_ARCS) {
      return 'More than 5 arcs usually forces an outline revision. Consider dropping the weakest.';
    }
    if (count < MIN_ARCS) {
      return 'Fewer than 3 arcs gives the outline too little to braid; the article tends to read thin.';
    }
    return null;
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
   * Display shape for the whiteboard analysis: the six fields
   * input-nodes.js WHITEBOARD_SCHEMA actually emits.
   *
   * `ambiguities` is first in the returned object AND first on the screen: it is
   * the parser's own list of what it could not read, which is exactly what the
   * director can correct and nothing else can.
   *
   * @param {object|null} wb
   * @returns {{ambiguities: any[], names: any[], groups: any[], connections: any[],
   *            notes: any[], structureType: string}}
   */
  function whiteboardView(wb) {
    var w = wb || {};
    return {
      ambiguities: asArray(w.ambiguities),
      names: asArray(w.names),
      groups: asArray(w.groups),
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
   * example and an NPC pronoun error — are advisories now and render in the
   * `advisory` group. Their prefixes were left unchanged so that promoting one back
   * to structural needs no change here.)
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

  function group(key, label, severity, items) {
    return { key: key, label: label, severity: severity, items: items };
  }

  /**
   * The article fact-check as a defect list the gate can render.
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
      .filter(function (c) { return c && c.ok === false; })
      .map(function (c) {
        var tokenId = asString(c.tokenId);
        var reason = asString(c.reason) || 'failed the fidelity check';
        return { text: (tokenId || '(no tokenId)') + ': ' + reason, tokenId: tokenId };
      });
    if (badCards.length > 0) {
      groups.push(group('cards', 'Evidence cards that are not verbatim', 'structural', badCards));
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

    if (advisoryWarnings.length > 0) {
      groups.push(group('advisory', 'Advisory', 'advisory',
        advisoryWarnings.map(function (text) { return { text: text }; })));
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

  function steeringView(handEditReport, gateNotes) {
    var report = handEditReport && Array.isArray(handEditReport.checked) && handEditReport.checked.length > 0
      ? handEditReport : null;
    var changed = report ? (Array.isArray(report.changed) ? report.changed : []) : [];
    var notes = (Array.isArray(gateNotes) ? gateNotes : [])
      .filter(function (n) { return n && typeof n.text === 'string' && n.text.trim(); })
      .map(function (n) {
        return { label: '[' + n.gate + ', ' + (n.kind || 'rejection') + ' ' + (n.round || 1) + ']', text: n.text.trim() };
      });
    return {
      any: !!report || notes.length > 0,
      changedLabels: changed.map(scopeLabel),
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

  // ── the arc stop's review (phase 1, brief 1.2) ────────────────────────────

  /**
   * The arc stop sends the same one box with either action, but on different keys,
   * so it cannot share `reviewPayload`: an approve carries the SELECTION and the
   * note as `outlineGuidance` (its own channel, `_outlineGuidance`, which reaches
   * the outline and article prompts), while a send back carries
   * `selectedArcs: false` and the note as `arcFeedback`, which the server also
   * records as a standing note of kind 'rejection'. Sending the note on both keys
   * at once would file the same sentence twice, and a guidance recorded on a send
   * back would outlive the arcs it was written about
   * (`server-build-resume-payload.test.js`: guidance is not recorded on an arc
   * rejection).
   *
   * @param {string[]} selectedArcIds - the ids the director has ticked
   * @param {string} note - the stop's note box
   * @param {string} action - 'approve' or 'send-back'
   * @returns {object|null} the payload, or null for a send back with no note
   */
  function arcReviewPayload(selectedArcIds, note, action) {
    if (action !== 'approve' && action !== 'send-back') {
      throw new Error("arcReviewPayload: action must be 'approve' or 'send-back', got " + String(action));
    }
    var text = typeof note === 'string' ? note.trim() : '';
    if (action === 'send-back') {
      if (!text) return null;
      return { selectedArcs: false, arcFeedback: text };
    }
    var payload = { selectedArcs: asArray(selectedArcIds) };
    if (text) payload.outlineGuidance = text;
    return payload;
  }

  /**
   * What the arc stop's note box holds when a rework comes back.
   *
   * A note sent with a send back drove that rework and then stands, but the box
   * itself came back empty, so the director had to retype the same sentence to
   * carry it forward as guidance on the approve. The latest arc-stop note of kind
   * 'rejection' is that sentence. An approval note is already standing guidance
   * and is not offered again.
   *
   * @param {Array} gateNotes - data.directorGateNotes
   * @returns {string}
   */
  function arcNotePrefill(gateNotes) {
    var notes = asArray(gateNotes);
    for (var i = notes.length - 1; i >= 0; i -= 1) {
      var n = notes[i];
      if (!n || typeof n !== 'object') continue;
      if (n.gate !== 'arc-selection') continue;
      if ((asString(n.kind) || 'rejection') !== 'rejection') continue;
      var text = asString(n.text).trim();
      if (text) return text;
    }
    return '';
  }

  /**
   * Where a stop's note lives in `pendingEdits`, beside that stop's edits, so a
   * remount while the rework runs restores both. A SIBLING key, never the edits slot
   * itself: app.js hands `pendingEdits[checkpointType]` to the component as the
   * edited object, and a note stored there would come back as one.
   */
  function noteSlotKey(checkpoint) {
    return checkpoint + ':note';
  }

  var api = {
    lastEvaluationFrom: lastEvaluationFrom,
    evaluationView: evaluationView,
    arcCardModel: arcCardModel,
    defaultArcSelection: defaultArcSelection,
    arcSelectionNote: arcSelectionNote,
    accusationView: accusationView,
    whiteboardView: whiteboardView,
    factCheckSummary: factCheckSummary,
    approveLabel: approveLabel,
    wordTail: wordTail,
    steeringView: steeringView,
    roundsBanner: roundsBanner,
    outlineReviewPayload: outlineReviewPayload,
    articleReviewPayload: articleReviewPayload,
    sendBackButton: sendBackButton,
    arcReviewPayload: arcReviewPayload,
    arcNotePrefill: arcNotePrefill,
    noteSlotKey: noteSlotKey
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.checkpointViewLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
