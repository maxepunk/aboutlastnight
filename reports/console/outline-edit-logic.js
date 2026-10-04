/**
 * outline-edit-logic.js — PURE logic for the Outline checkpoint editors.
 *
 * Dual-export: registers on window.Console.outlineEditLogic for the browser
 * (React editors call these as thin wrappers) AND exposes the same surface via
 * module.exports under Node so it can be unit-tested in node-env Jest.
 *
 * INVARIANTS:
 *   - Every build*Payload(formState, originalSection) starts from deepClone(original)
 *     so untouched required/optional/non-editable keys (evidenceCards,
 *     photoPlacement, callbackOpportunities, accusationHandling, ...) are PRESERVED.
 *   - Each builder emits ONLY keys documented in the schema for that section
 *     (every section object is additionalProperties:false). Cross-section stray
 *     keys are removed by explicit delete/omit after the clone. Kills B1/N2.
 *   - Object-arrays are edited one object per row; the WHOLE object is written
 *     back at its index. Object-maps (characterHighlights) are key/value rows.
 *   - Integer fields (paragraphCount) are coerced to int.
 *   - shellAccounts.total accepts number OR string and is NEVER force-coerced.
 *
 * MUST NOT reference React or window at module-evaluation time except the
 * guarded window.Console write.
 *
 * Phase 4 (brief 4.6): the outline is the story map. Its client gate is
 * validateMapShape (I), held to the director-side map schema (lib/map.js
 * directorMapSchemaFor), whose refusal the server's payload gate gives; Everyone and
 * the counts are mapTally (K). The section builders (D to G) edit the outline written
 * before phase 4, until the map's screen replaces them (4.9).
 */
(function () {
  'use strict';

  // ── (A) GENERIC PURE PRIMITIVES ──────────────────────────────────────────
  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function splitCsv(str) {
    if (typeof str !== 'string') return [];
    return str.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }

  function joinCsv(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.join(', ');
  }

  function setRowField(rows, idx, field, value) {
    var src = Array.isArray(rows) ? rows : [];
    return src.map(function (row, i) {
      if (i !== idx) return row;
      var next = Object.assign({}, row);
      next[field] = value;
      return next;
    });
  }

  function setRowList(rows, idx, field, value) {
    var list = Array.isArray(value) ? value.slice() : splitCsv(value);
    return setRowField(rows, idx, field, list);
  }

  function removeRow(rows, idx) {
    var src = Array.isArray(rows) ? rows : [];
    return src.filter(function (_row, i) { return i !== idx; });
  }

  function addRow(rows, newRow) {
    var src = Array.isArray(rows) ? rows : [];
    return src.concat([newRow]);
  }

  function coerceInt(value) {
    if (value === '' || value === null || value === undefined) return undefined;
    var n = parseInt(String(value), 10);
    return Number.isNaN(n) ? undefined : n;
  }

  function coerceTotal(value) {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value === 'number') return value;
    var str = String(value).trim();
    if (str === '') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(str)) {
      var n = Number(str);
      if (Number.isFinite(n)) return n;
    }
    return str;
  }

  function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function rowsToMap(rows) {
    var out = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row) return;
      var k = typeof row.key === 'string' ? row.key.trim() : '';
      if (k === '') return;
      out[k] = typeof row.value === 'string' ? row.value : (row.value == null ? '' : String(row.value));
    });
    return out;
  }

  function mapToRows(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
    return Object.keys(map).map(function (k) {
      return { key: k, value: typeof map[k] === 'string' ? map[k] : String(map[k]) };
    });
  }

  // ── (B) RESET-KEY HELPER ──────────────────────────────────────────────────
  function computeResetKey(obj, revisionCount) {
    var rc = (typeof revisionCount === 'number' && !Number.isNaN(revisionCount)) ? revisionCount : 0;
    var serialized;
    try { serialized = JSON.stringify(obj); } catch (e) { serialized = String(obj); }
    if (serialized == null) serialized = '';
    return String(rc) + ':' + serialized.length + ':' + serialized.slice(0, 64);
  }

  // ── helpers for builders: set-or-omit ─────────────────────────────────────
  function setOrDeleteArray(obj, key, arr) {
    if (Array.isArray(arr) && arr.length > 0) { obj[key] = arr; } else { delete obj[key]; }
  }
  function setOrDeleteString(obj, key, str) {
    if (typeof str === 'string' && str.trim().length > 0) { obj[key] = str; } else { delete obj[key]; }
  }

  // ── (C) JOURNALIST INITIALIZERS ───────────────────────────────────────────
  function initLede(lede) {
    var s = lede || {};
    return {
      hook: typeof s.hook === 'string' ? s.hook : '',
      keyTension: typeof s.keyTension === 'string' ? s.keyTension : '',
      primaryArc: typeof s.primaryArc === 'string' ? s.primaryArc : '',
      selectedEvidence: Array.isArray(s.selectedEvidence) ? s.selectedEvidence.slice() : []
    };
  }

  // Thesis panel (spec 2026-09-19 §6.1): the three LEDE fields the director
  // rewrites most. Derived from initLede so the two initializers cannot disagree
  // about how a missing or non-string field is coerced (review fix 1, finding 6);
  // selectedEvidence is dropped because the thesis editor does not show it.
  function initThesis(lede) {
    var base = initLede(lede);
    return { hook: base.hook, keyTension: base.keyTension, primaryArc: base.primaryArc };
  }

  function initArc(arc) {
    var s = arc || {};
    return {
      name: typeof s.name === 'string' ? s.name : '',
      paragraphCount: s.paragraphCount != null ? String(s.paragraphCount) : ''
    };
  }

  function initArcInterweaving(interweaving) {
    var s = (interweaving && typeof interweaving === 'object') ? interweaving : {};
    return {
      interleavingPlan: typeof s.interleavingPlan === 'string' ? s.interleavingPlan : '',
      convergencePoint: typeof s.convergencePoint === 'string' ? s.convergencePoint : ''
    };
  }

  function initFollowTheMoney(section) {
    var s = section || {};
    return {
      arcConnections: deepClone(Array.isArray(s.arcConnections) ? s.arcConnections : []),
      shellAccounts: deepClone(Array.isArray(s.shellAccounts) ? s.shellAccounts : [])
    };
  }

  // Phase 3 (3.2; BU3): thePlayers.buried and whatsMissing.buriedItems left the
  // outline schema, because whose memory was sold never appears. They are neither
  // shown nor edited, and an outline written before phase 3 loses them on any edit
  // (dropRetiredOutlineFields), so its edits still pass the schema.
  function initThePlayers(section) {
    var s = section || {};
    return {
      arcConnections: deepClone(Array.isArray(s.arcConnections) ? s.arcConnections : []),
      exposed: Array.isArray(s.exposed) ? s.exposed.slice() : [],
      characterHighlights: mapToRows(s.characterHighlights)
    };
  }

  function initWhatsMissing(section) {
    var s = section || {};
    return {
      arcConnections: deepClone(Array.isArray(s.arcConnections) ? s.arcConnections : []),
      knownUnknowns: Array.isArray(s.knownUnknowns) ? s.knownUnknowns.slice() : [],
      narrativePurpose: typeof s.narrativePurpose === 'string' ? s.narrativePurpose : ''
    };
  }

  /** The fields phase 3 retired from the outline schema, by section (BU3). */
  var RETIRED_OUTLINE_FIELDS = { thePlayers: ['buried'], whatsMissing: ['buriedItems'] };

  /**
   * A copy of the outline without the fields phase 3 retired. The editors start
   * from it, so an outline written before phase 3 can still be edited and pass the
   * schema; the original is untouched.
   */
  function dropRetiredOutlineFields(outline) {
    var next = deepClone(outline);
    if (!isPlainObject(next)) return next;
    Object.keys(RETIRED_OUTLINE_FIELDS).forEach(function (sectionKey) {
      if (!isPlainObject(next[sectionKey])) return;
      RETIRED_OUTLINE_FIELDS[sectionKey].forEach(function (field) { delete next[sectionKey][field]; });
    });
    return next;
  }

  function initClosing(section) {
    var s = section || {};
    return {
      arcResolutions: deepClone(Array.isArray(s.arcResolutions) ? s.arcResolutions : []),
      systemicAngle: typeof s.systemicAngle === 'string' ? s.systemicAngle : '',
      finalLine: typeof s.finalLine === 'string' ? s.finalLine : ''
    };
  }

  // ── (D) JOURNALIST BUILDERS ───────────────────────────────────────────────
  function buildLedePayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.hook = formState.hook || '';
    out.keyTension = formState.keyTension || '';
    out.primaryArc = formState.primaryArc || '';
    setOrDeleteArray(out, 'selectedEvidence',
      Array.isArray(formState.selectedEvidence) ? formState.selectedEvidence.filter(nonEmpty) : splitCsv(formState.selectedEvidence));
    return out;
  }

  // Thesis panel (spec 2026-09-19 §6.1): three LEDE fields with their own editor.
  // Delegates to buildLedePayload so the LEDE builder stays the single writer of
  // that section and selectedEvidence survives untouched.
  function buildThesisPayload(formState, originalLede) {
    var base = initLede(originalLede);
    return buildLedePayload({
      hook: formState.hook,
      keyTension: formState.keyTension,
      primaryArc: formState.primaryArc,
      selectedEvidence: base.selectedEvidence
    }, originalLede);
  }

  function buildArcPayload(formState, originalArc) {
    var out = deepClone(originalArc) || {};
    out.name = formState.name || '';
    var pc = coerceInt(formState.paragraphCount);
    if (pc !== undefined) { out.paragraphCount = pc; }
    return out;
  }

  function buildArcInterweavingPayload(formState, originalInterweaving) {
    var out = deepClone(originalInterweaving) || {};
    out.interleavingPlan = formState.interleavingPlan || '';
    out.convergencePoint = formState.convergencePoint || '';
    return out;
  }

  function buildFollowTheMoneyPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.arcConnections = (Array.isArray(formState.arcConnections) ? formState.arcConnections : []).map(function (row) {
      return { arcName: row.arcName || '', financialAngle: row.financialAngle || '' };
    });
    var accounts = (Array.isArray(formState.shellAccounts) ? formState.shellAccounts : []).map(function (row) {
      var acct = { name: row.name || '', total: coerceTotal(row.total) };
      if (acct.total === undefined) acct.total = '';
      // Phase 3 (3.2): an account's inference is optional (outline.schema.json).
      if (nonEmpty(row.inference)) acct.inference = row.inference;
      if (nonEmpty(row.relatedArc)) acct.relatedArc = row.relatedArc;
      return acct;
    });
    setOrDeleteArray(out, 'shellAccounts', accounts);
    return out;
  }

  function buildThePlayersPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.arcConnections = (Array.isArray(formState.arcConnections) ? formState.arcConnections : []).map(function (row) {
      return { arcName: row.arcName || '', characterAngle: row.characterAngle || '' };
    });
    setOrDeleteArray(out, 'exposed', Array.isArray(formState.exposed) ? formState.exposed.filter(nonEmpty) : splitCsv(formState.exposed));
    delete out.buried;  // Phase 3 (3.2; BU3): retired from the outline schema
    delete out.pullQuotes;  // F3/X-5: pullQuotes removed from the outline contract (article phase ignores planned quotes; crystallization flows through inline quote content-blocks)
    var map = rowsToMap(formState.characterHighlights);
    if (Object.keys(map).length > 0) { out.characterHighlights = map; } else { delete out.characterHighlights; }
    return out;
  }

  function buildWhatsMissingPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.arcConnections = (Array.isArray(formState.arcConnections) ? formState.arcConnections : []).map(function (row) {
      return { arcName: row.arcName || '', openQuestion: row.openQuestion || '' };
    });
    setOrDeleteArray(out, 'knownUnknowns', Array.isArray(formState.knownUnknowns) ? formState.knownUnknowns.filter(nonEmpty) : splitCsv(formState.knownUnknowns));
    setOrDeleteString(out, 'narrativePurpose', formState.narrativePurpose);
    delete out.buriedItems;  // Phase 3 (3.2; BU3): retired from the outline schema
    return out;
  }

  function buildClosingPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.arcResolutions = (Array.isArray(formState.arcResolutions) ? formState.arcResolutions : []).map(function (row) {
      return { arcName: row.arcName || '', resolution: row.resolution || '' };
    });
    setOrDeleteString(out, 'systemicAngle', formState.systemicAngle);
    setOrDeleteString(out, 'finalLine', formState.finalLine);
    return out;
  }

  // ── (E) DETECTIVE INITIALIZERS ────────────────────────────────────────────
  function initExecutiveSummary(section) {
    var s = section || {};
    return {
      hook: typeof s.hook === 'string' ? s.hook : '',
      caseOverview: typeof s.caseOverview === 'string' ? s.caseOverview : '',
      primaryFindings: Array.isArray(s.primaryFindings) ? s.primaryFindings.slice() : []
    };
  }

  function initEvidenceLocker(section) {
    var s = section || {};
    return { evidenceGroups: deepClone(Array.isArray(s.evidenceGroups) ? s.evidenceGroups : []) };
  }

  function initMemoryAnalysis(section) {
    var s = section || {};
    return {
      focus: typeof s.focus === 'string' ? s.focus : '',
      keyPatterns: Array.isArray(s.keyPatterns) ? s.keyPatterns.slice() : [],
      significance: typeof s.significance === 'string' ? s.significance : ''
    };
  }

  function initSuspectNetwork(section) {
    var s = section || {};
    return {
      keyRelationships: deepClone(Array.isArray(s.keyRelationships) ? s.keyRelationships : []),
      assessments: deepClone(Array.isArray(s.assessments) ? s.assessments : [])
    };
  }

  function initOutstandingQuestions(section) {
    var s = section || {};
    return {
      questions: Array.isArray(s.questions) ? s.questions.slice() : [],
      investigativeGaps: typeof s.investigativeGaps === 'string' ? s.investigativeGaps : ''
    };
  }

  function initFinalAssessment(section) {
    var s = section || {};
    return {
      accusationHandling: typeof s.accusationHandling === 'string' ? s.accusationHandling : '',
      verdict: typeof s.verdict === 'string' ? s.verdict : '',
      closingLine: typeof s.closingLine === 'string' ? s.closingLine : ''
    };
  }

  // ── (F) DETECTIVE BUILDERS ────────────────────────────────────────────────
  function buildExecutiveSummaryPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.hook = formState.hook || '';
    out.caseOverview = formState.caseOverview || '';
    out.primaryFindings = (Array.isArray(formState.primaryFindings) ? formState.primaryFindings.filter(nonEmpty) : splitCsv(formState.primaryFindings));
    return out;
  }

  function buildEvidenceLockerPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.evidenceGroups = (Array.isArray(formState.evidenceGroups) ? formState.evidenceGroups : []).map(function (row) {
      return {
        theme: row.theme || '',
        evidenceIds: Array.isArray(row.evidenceIds) ? row.evidenceIds.filter(nonEmpty) : splitCsv(row.evidenceIds),
        synthesis: row.synthesis || ''
      };
    });
    return out;
  }

  function buildMemoryAnalysisPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.focus = formState.focus || '';
    out.significance = formState.significance || '';
    setOrDeleteArray(out, 'keyPatterns', Array.isArray(formState.keyPatterns) ? formState.keyPatterns.filter(nonEmpty) : splitCsv(formState.keyPatterns));
    return out;
  }

  function buildSuspectNetworkPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.assessments = (Array.isArray(formState.assessments) ? formState.assessments : []).map(function (row) {
      var a = { name: row.name || '', role: row.role || '' };
      if (row.suspicionLevel === 'high' || row.suspicionLevel === 'moderate' || row.suspicionLevel === 'low') {
        a.suspicionLevel = row.suspicionLevel;
      }
      return a;
    });
    var rels = (Array.isArray(formState.keyRelationships) ? formState.keyRelationships : []).map(function (row) {
      return {
        characters: Array.isArray(row.characters) ? row.characters.filter(nonEmpty) : splitCsv(row.characters),
        nature: row.nature || ''
      };
    });
    setOrDeleteArray(out, 'keyRelationships', rels);
    return out;
  }

  function buildOutstandingQuestionsPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.questions = (Array.isArray(formState.questions) ? formState.questions.filter(nonEmpty) : splitCsv(formState.questions));
    setOrDeleteString(out, 'investigativeGaps', formState.investigativeGaps);
    return out;
  }

  function buildFinalAssessmentPayload(formState, originalSection) {
    var out = deepClone(originalSection) || {};
    out.verdict = formState.verdict || '';
    out.closingLine = formState.closingLine || '';
    setOrDeleteString(out, 'accusationHandling', formState.accusationHandling);
    return out;
  }

  // ── (G) IMMUTABLE MERGE ───────────────────────────────────────────────────
  function mergeSection(outline, sectionKey, updatedSection) {
    var next = deepClone(outline) || {};
    next[sectionKey] = updatedSection;
    return next;
  }

  function mergeArc(outline, arcIdx, updatedArc) {
    var next = deepClone(outline) || {};
    if (!next.theStory || typeof next.theStory !== 'object') next.theStory = {};
    if (!Array.isArray(next.theStory.arcs)) next.theStory.arcs = [];
    next.theStory.arcs = next.theStory.arcs.map(function (arc, i) {
      return i === arcIdx ? updatedArc : arc;
    });
    if (arcIdx >= next.theStory.arcs.length) {
      next.theStory.arcs = next.theStory.arcs.concat([updatedArc]);
    }
    return next;
  }

  function mergeArcInterweaving(outline, updatedInterweaving) {
    var next = deepClone(outline) || {};
    if (!next.theStory || typeof next.theStory !== 'object') next.theStory = {};
    next.theStory.arcInterweaving = updatedInterweaving;
    return next;
  }

  // ── (I) CLIENT-SIDE STRUCTURAL VALIDATION (dependency-free fast-fail gate) ──
  function isPlainObject(val) { return val !== null && typeof val === 'object' && !Array.isArray(val); }
  function isNonEmptyString(val) { return typeof val === 'string' && val.trim().length > 0; }

  // The map's client gate (phase 4, brief 4.6): the director-side map schema's rules, held
  // equal to it by a test (lib/map.js directorMapSchemaFor; never stricter, and a corpus
  // the two decide alike). The root keys, a beat's kinds and the headline limits are the
  // schema's; the slots, when the stop's payload gives them, are the theme's.
  var MAP_ROOT_KEYS = ['headline', 'deck', 'topPhoto', 'gapNote', 'sections', 'dropped', 'leftOut', 'expectedLength', 'weaveChanges'];
  var MAP_REQUIRED_KEYS = ['headline', 'deck', 'sections', 'dropped', 'leftOut', 'expectedLength', 'weaveChanges'];
  // A beat's kind, one of the schema's four (lib/map.js MAP_BEAT_KINDS; a test holds the
  // two lists equal).
  var BEAT_KINDS = ['scene', 'receipt', 'line', 'figure'];
  var SECTION_KEYS = ['slot', 'heading', 'job', 'beats', 'photos'];
  var BEAT_KEYS = ['id', 'kind', 'material', 'players', 'card', 'connection'];
  // A beat the director added or brought back needs only these (R12).
  var BEAT_REQUIRED_KEYS = ['id', 'material'];
  var PHOTO_KEYS = ['filename', 'beat'];

  /**
   * The headline and deck limits: the content bundle's, one constant
   * (console/article-desk-logic.js HEADLINE_LIMITS), which the map's schema states too.
   * Read when a map is checked, since article-desk-logic.js loads after this module.
   */
  function headlineLimits() {
    if (typeof window !== 'undefined' && window.Console && window.Console.articleDeskLogic) {
      return window.Console.articleDeskLogic.HEADLINE_LIMITS;
    }
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('./article-desk-logic').HEADLINE_LIMITS;
    }
    return null;
  }

  /** A text's length as the schema counts it, in code points. */
  function codePoints(text) {
    return Array.from(text).length;
  }

  function onlyKeys(errors, path, value, allowed) {
    Object.keys(value).forEach(function (k) {
      if (allowed.indexOf(k) === -1) errors.push({ path: path + '/' + k, message: 'is not an allowed key' });
    });
  }

  function requiredKeys(errors, path, value, required) {
    required.forEach(function (k) {
      if (value[k] === undefined) errors.push({ path: path, message: "must have required property '" + k + "'" });
    });
  }

  function stringAt(errors, path, value) {
    if (value !== undefined && typeof value !== 'string') errors.push({ path: path, message: 'must be a string' });
  }

  function stringList(errors, path, value) {
    if (value === undefined) return;
    if (!Array.isArray(value)) { errors.push({ path: path, message: 'must be an array of strings' }); return; }
    value.forEach(function (item, i) {
      if (typeof item !== 'string') errors.push({ path: path + '/' + i, message: 'must be a string' });
    });
  }

  function objectList(errors, path, value, each) {
    if (value === undefined) return;
    if (!Array.isArray(value)) { errors.push({ path: path, message: 'must be an array' }); return; }
    value.forEach(function (item, i) {
      if (!isPlainObject(item)) { errors.push({ path: path + '/' + i, message: 'must be an object' }); return; }
      each(item, path + '/' + i);
    });
  }

  function slotAt(errors, path, value, slots) {
    if (typeof value !== 'string') { errors.push({ path: path, message: 'must be a string' }); return; }
    if (slots && slots.indexOf(value) === -1) errors.push({ path: path, message: 'must be one of the slots: ' + slots.join(', ') });
  }

  function validateBeat(errors, beat, path) {
    onlyKeys(errors, path, beat, BEAT_KEYS);
    requiredKeys(errors, path, beat, BEAT_REQUIRED_KEYS);
    ['id', 'material', 'card', 'connection'].forEach(function (k) { stringAt(errors, path + '/' + k, beat[k]); });
    if (beat.kind !== undefined && BEAT_KINDS.indexOf(beat.kind) === -1) {
      errors.push({ path: path + '/kind', message: 'must be one of ' + BEAT_KINDS.join(', ') });
    }
    stringList(errors, path + '/players', beat.players);
  }

  /**
   * The map's client gate: the checks the director-side schema makes, so a map the server
   * would refuse is caught before the POST, and a map it accepts passes. With `slots` (the
   * stop's `mapSlots`, as keys or as `{key}`), a section's slot and a dropped slot must be
   * one of them.
   *
   * @param {*} map
   * @param {Object} [options]
   * @param {Array} [options.slots]
   * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
   */
  function validateMapShape(map, options) {
    if (!isPlainObject(map)) return { valid: false, errors: [{ path: '/', message: 'the map must be an object' }] };
    var opts = options || {};
    var slots = Array.isArray(opts.slots)
      ? opts.slots.map(function (slot) { return isPlainObject(slot) ? slot.key : slot; }).filter(function (k) { return typeof k === 'string'; })
      : null;
    var errors = [];
    onlyKeys(errors, '', map, MAP_ROOT_KEYS);
    requiredKeys(errors, '/', map, MAP_REQUIRED_KEYS);

    var limits = headlineLimits();
    if (map.headline !== undefined) {
      if (typeof map.headline !== 'string') errors.push({ path: '/headline', message: 'must be a string' });
      else if (limits && (codePoints(map.headline) < limits.main.min || codePoints(map.headline) > limits.main.max)) {
        errors.push({ path: '/headline', message: 'must be ' + limits.main.min + ' to ' + limits.main.max + ' characters' });
      }
    }
    if (map.deck !== undefined) {
      if (typeof map.deck !== 'string') errors.push({ path: '/deck', message: 'must be a string' });
      else if (limits && codePoints(map.deck) > limits.deck.max) errors.push({ path: '/deck', message: 'must be at most ' + limits.deck.max + ' characters' });
    }
    stringAt(errors, '/topPhoto', map.topPhoto);
    if (map.gapNote !== undefined) {
      if (!isPlainObject(map.gapNote)) errors.push({ path: '/gapNote', message: 'must be an object' });
      else {
        onlyKeys(errors, '/gapNote', map.gapNote, ['line', 'players']);
        requiredKeys(errors, '/gapNote', map.gapNote, ['line', 'players']);
        stringAt(errors, '/gapNote/line', map.gapNote.line);
        stringList(errors, '/gapNote/players', map.gapNote.players);
      }
    }
    objectList(errors, '/sections', map.sections, function (section, path) {
      onlyKeys(errors, path, section, SECTION_KEYS);
      requiredKeys(errors, path, section, SECTION_KEYS);
      if (section.slot !== undefined) slotAt(errors, path + '/slot', section.slot, slots);
      stringAt(errors, path + '/heading', section.heading);
      stringAt(errors, path + '/job', section.job);
      objectList(errors, path + '/beats', section.beats, function (beat, beatPath) { validateBeat(errors, beat, beatPath); });
      objectList(errors, path + '/photos', section.photos, function (photo, photoPath) {
        onlyKeys(errors, photoPath, photo, PHOTO_KEYS);
        requiredKeys(errors, photoPath, photo, ['filename']);
        stringAt(errors, photoPath + '/filename', photo.filename);
        stringAt(errors, photoPath + '/beat', photo.beat);
      });
    });
    objectList(errors, '/dropped', map.dropped, function (dropped, path) {
      onlyKeys(errors, path, dropped, ['slot', 'reason']);
      requiredKeys(errors, path, dropped, ['slot', 'reason']);
      if (dropped.slot !== undefined) slotAt(errors, path + '/slot', dropped.slot, slots);
      stringAt(errors, path + '/reason', dropped.reason);
    });
    objectList(errors, '/leftOut', map.leftOut, function (beat, path) { validateBeat(errors, beat, path); });
    if (map.expectedLength !== undefined && !Number.isInteger(map.expectedLength)) {
      errors.push({ path: '/expectedLength', message: 'must be an integer' });
    }
    objectList(errors, '/weaveChanges', map.weaveChanges, function (change, path) {
      onlyKeys(errors, path, change, ['source', 'change']);
      requiredKeys(errors, path, change, ['source', 'change']);
      stringAt(errors, path + '/source', change.source);
      stringAt(errors, path + '/change', change.change);
    });
    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * The outline stop's client gate, by its old name for Outline.js (4.9 rebuilds the
   * screen): the map's gate. The outline stage's detective branch went with it (R1).
   *
   * @param {*} outline - the map
   * @param {string} [theme] - unused: every theme's map has one shape
   * @param {Array} [slots] - the stop's mapSlots
   */
  function validateOutlineShape(outline, theme, slots) {
    return validateMapShape(outline, { slots: slots });
  }

  // ── (I2) ARTICLE CLIENT GATE (B6) ─────────────────────────────────────────
  //
  // The mirror of validateOutlineShape for the ContentBundle. Task 3 added the
  // server-side content-bundle schema check (a 400 the console already renders);
  // this catches the obvious breakage before the POST and in the same inline
  // error slot, because an unvalidated hand-edit used to reach
  // validateContentBundle, which routes a bad bundle straight to END — after ten
  // checkpoints and five-plus Opus calls, with Retry failing identically.
  //
  // NOT STRICTER THAN THE SERVER, on purpose: content-bundle.schema.json makes
  // `heading` optional on a section, so requiring it here would block Approve on
  // a bundle the server would have accepted. This gate checks only what is
  // unambiguously required, and leaves the fine grain to the schema.

  /** The content-block `type` values content-bundle.schema.json allows. */
  var CONTENT_BLOCK_TYPES = [
    'paragraph', 'quote', 'evidence-reference', 'list', 'photo', 'evidence-card'
  ];

  /**
   * Dependency-free structural check on an edited ContentBundle.
   *
   * @param {*} bundle
   * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
   */
  function validateBundleShape(bundle) {
    if (!isPlainObject(bundle)) {
      return { valid: false, errors: [{ path: '/', message: 'article bundle must be an object' }] };
    }
    var errors = [];

    ['metadata', 'headline'].forEach(function (key) {
      if (!isPlainObject(bundle[key])) {
        errors.push({ path: '/' + key, message: "must be a required object '" + key + "'" });
      }
    });

    if (!Array.isArray(bundle.sections) || bundle.sections.length === 0) {
      errors.push({ path: '/sections', message: 'must be a non-empty array of sections' });
      return { valid: false, errors: errors };
    }

    bundle.sections.forEach(function (section, i) {
      var base = '/sections/' + i;
      if (!isPlainObject(section)) {
        errors.push({ path: base, message: 'must be an object' });
        return;
      }
      if (!isNonEmptyString(section.id)) {
        errors.push({ path: base + '/id', message: "must have required string 'id'" });
      }
      if (section.heading !== undefined && typeof section.heading !== 'string') {
        errors.push({ path: base + '/heading', message: 'must be a string when present' });
      }
      if (!Array.isArray(section.content)) {
        errors.push({ path: base + '/content', message: 'must be an array of content blocks' });
        return;
      }
      section.content.forEach(function (block, j) {
        var blockPath = base + '/content/' + j;
        if (!isPlainObject(block)) {
          errors.push({ path: blockPath, message: 'must be an object' });
          return;
        }
        if (typeof block.type !== 'string' || block.type.length === 0) {
          errors.push({ path: blockPath + '/type', message: "must have a string 'type'" });
          return;
        }
        if (CONTENT_BLOCK_TYPES.indexOf(block.type) === -1) {
          errors.push({
            path: blockPath + '/type',
            message: "'" + block.type + "' is not a content block type (" + CONTENT_BLOCK_TYPES.join(', ') + ')'
          });
        }
      });
    });

    return { valid: errors.length === 0, errors: errors };
  }

  // ── (K) THE MAP: EVERYONE AND THE COUNTS (phase 4, brief 4.6) ──────────────
  //
  // Everyone, the cards and the photos are built by one function from the beats, so the
  // stop's payload, the console's map as the director edits it (4.9) and the map checks
  // (lib/map.js) count alike. A name in a beat counts for the roster member it names.

  /**
   * The roster member a name names, by the member's roster name: the first name, the full
   * name, or a name whose first word is the first name, each in any case; null for a name
   * that is no roster member's, such as an NPC or a character off the roster.
   *
   * @param {*} name - a name as a beat or the gap note gives it
   * @param {Array<string|{name: string, fullName?: string|null}>} roster
   * @returns {string|null}
   */
  function rosterMemberOf(name, roster) {
    var wanted = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!wanted) return null;
    var firstWord = wanted.split(/\s+/)[0];
    var list = Array.isArray(roster) ? roster : [];
    for (var i = 0; i < list.length; i += 1) {
      var entry = list[i];
      var first = isPlainObject(entry) ? entry.name : entry;
      if (typeof first !== 'string' || !first.trim()) continue;
      var own = first.trim().toLowerCase();
      var full = isPlainObject(entry) && typeof entry.fullName === 'string' ? entry.fullName.trim().toLowerCase() : '';
      if (wanted === own || firstWord === own || (full && wanted === full)) return first.trim();
    }
    return null;
  }

  /**
   * A photo's filename as every join reads it: the basename, lower case. The console's copy
   * of the server's one join key (lib/prompt-renderers/director-words-renderer.js photoKey),
   * which it cannot require; a test holds the two equal (brief 4.6, fix round 1).
   */
  function photoKey(filename) {
    return String(filename || '').split(/[/\\]/).pop().toLowerCase();
  }

  /**
   * The id of the document a beat prints as a card, trimmed, or '' for a beat that is no
   * card: the one rule for which beats are cards, for the counts and the map checks.
   */
  function beatCardOf(beat) {
    return isPlainObject(beat) && typeof beat.card === 'string' ? beat.card.trim() : '';
  }

  /**
   * Where the map places each photo, in order: the top photo first (`at: 'topPhoto'`),
   * then each section's photos (`at`: the section's slot). A photo placed twice is listed
   * twice.
   *
   * @param {*} map
   * @returns {Array<{filename: string, at: string}>}
   */
  function mapPhotoPlacements(map) {
    var out = [];
    if (!isPlainObject(map)) return out;
    if (typeof map.topPhoto === 'string' && map.topPhoto.trim()) out.push({ filename: map.topPhoto, at: 'topPhoto' });
    (Array.isArray(map.sections) ? map.sections : []).forEach(function (section) {
      if (!isPlainObject(section)) return;
      (Array.isArray(section.photos) ? section.photos : []).forEach(function (photo) {
        if (isPlainObject(photo) && typeof photo.filename === 'string' && photo.filename.trim()) {
          out.push({ filename: photo.filename, at: section.slot });
        }
      });
    });
    return out;
  }

  /**
   * Everyone and the counts (spec 5.2): where each roster player appears, each under the
   * first section whose beat shows them; the roster players in no section's beat
   * (`unplaced`) and those the gap note raises (`raised`); the cards in the sections; and
   * how many of the photos kept for the article the map places, the top photo included.
   * A left-out beat places no one and carries no card.
   *
   * @param {*} map
   * @param {Object} [options]
   * @param {Array} [options.roster] - rosterMemberOf's roster
   * @param {string[]} [options.keptPhotos] - the filenames of the photos kept for the article
   * @returns {{everyone: Array<{slot: string, heading: string, players: string[]}>,
   *   unplaced: string[], raised: string[], cards: number, photos: {placed: number, of: number}}}
   */
  function mapTally(map, options) {
    var opts = options || {};
    var roster = Array.isArray(opts.roster) ? opts.roster : [];
    var kept = Array.isArray(opts.keptPhotos) ? opts.keptPhotos : [];
    var everyone = [];
    var seen = {};
    var cards = 0;
    (isPlainObject(map) && Array.isArray(map.sections) ? map.sections : []).forEach(function (section) {
      if (!isPlainObject(section)) return;
      var players = [];
      (Array.isArray(section.beats) ? section.beats : []).forEach(function (beat) {
        if (!isPlainObject(beat)) return;
        if (beatCardOf(beat)) cards += 1;
        (Array.isArray(beat.players) ? beat.players : []).forEach(function (name) {
          var member = rosterMemberOf(name, roster);
          if (member && !seen[member]) {
            seen[member] = true;
            players.push(member);
          }
        });
      });
      if (players.length > 0) {
        everyone.push({ slot: section.slot, heading: typeof section.heading === 'string' ? section.heading : '', players: players });
      }
    });
    var names = [];
    roster.forEach(function (entry) {
      var first = isPlainObject(entry) ? entry.name : entry;
      if (typeof first === 'string' && first.trim() && names.indexOf(first.trim()) === -1) names.push(first.trim());
    });
    var raised = [];
    var gapPlayers = isPlainObject(map) && isPlainObject(map.gapNote) && Array.isArray(map.gapNote.players) ? map.gapNote.players : [];
    gapPlayers.forEach(function (name) {
      var member = rosterMemberOf(name, roster);
      if (member && raised.indexOf(member) === -1) raised.push(member);
    });
    var keptKeys = kept.map(photoKey);
    var placed = [];
    mapPhotoPlacements(map).forEach(function (placement) {
      var key = photoKey(placement.filename);
      if (keptKeys.indexOf(key) !== -1 && placed.indexOf(key) === -1) placed.push(key);
    });
    return {
      everyone: everyone,
      unplaced: names.filter(function (name) { return !seen[name]; }),
      raised: raised,
      cards: cards,
      photos: { placed: placed.length, of: kept.length }
    };
  }

  // ── (J) PUBLIC SURFACE ────────────────────────────────────────────────────
  var api = {
    deepClone: deepClone,
    splitCsv: splitCsv,
    joinCsv: joinCsv,
    setRowField: setRowField,
    setRowList: setRowList,
    removeRow: removeRow,
    addRow: addRow,
    coerceInt: coerceInt,
    coerceTotal: coerceTotal,
    nonEmpty: nonEmpty,
    rowsToMap: rowsToMap,
    mapToRows: mapToRows,
    computeResetKey: computeResetKey,

    initLede: initLede,
    initThesis: initThesis,
    initArc: initArc,
    initArcInterweaving: initArcInterweaving,
    initFollowTheMoney: initFollowTheMoney,
    initThePlayers: initThePlayers,
    initWhatsMissing: initWhatsMissing,
    initClosing: initClosing,

    buildLedePayload: buildLedePayload,
    buildThesisPayload: buildThesisPayload,
    buildArcPayload: buildArcPayload,
    buildArcInterweavingPayload: buildArcInterweavingPayload,
    buildFollowTheMoneyPayload: buildFollowTheMoneyPayload,
    buildThePlayersPayload: buildThePlayersPayload,
    buildWhatsMissingPayload: buildWhatsMissingPayload,
    buildClosingPayload: buildClosingPayload,

    initExecutiveSummary: initExecutiveSummary,
    initEvidenceLocker: initEvidenceLocker,
    initMemoryAnalysis: initMemoryAnalysis,
    initSuspectNetwork: initSuspectNetwork,
    initOutstandingQuestions: initOutstandingQuestions,
    initFinalAssessment: initFinalAssessment,

    buildExecutiveSummaryPayload: buildExecutiveSummaryPayload,
    buildEvidenceLockerPayload: buildEvidenceLockerPayload,
    buildMemoryAnalysisPayload: buildMemoryAnalysisPayload,
    buildSuspectNetworkPayload: buildSuspectNetworkPayload,
    buildOutstandingQuestionsPayload: buildOutstandingQuestionsPayload,
    buildFinalAssessmentPayload: buildFinalAssessmentPayload,

    mergeSection: mergeSection,
    mergeArc: mergeArc,
    mergeArcInterweaving: mergeArcInterweaving,
    dropRetiredOutlineFields: dropRetiredOutlineFields,

    validateOutlineShape: validateOutlineShape,
    validateMapShape: validateMapShape,
    validateBundleShape: validateBundleShape,
    CONTENT_BLOCK_TYPES: CONTENT_BLOCK_TYPES,
    MAP_ROOT_KEYS: MAP_ROOT_KEYS,
    BEAT_KINDS: BEAT_KINDS,

    // Phase 4 (brief 4.6): Everyone and the counts, one function from the beats
    rosterMemberOf: rosterMemberOf,
    photoKey: photoKey,
    beatCardOf: beatCardOf,
    mapPhotoPlacements: mapPhotoPlacements,
    mapTally: mapTally
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.outlineEditLogic = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
