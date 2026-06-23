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
 * guarded window.Console write. SchemaValidator is lazy-required only inside
 * validateOutline and only when no validateFn is injected.
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

  // ── (B) THEME + RESET-KEY HELPERS ─────────────────────────────────────────
  function schemaNameForTheme(theme) {
    return theme === 'detective' ? 'detective-outline' : 'outline';
  }

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

  function initThePlayers(section) {
    var s = section || {};
    return {
      arcConnections: deepClone(Array.isArray(s.arcConnections) ? s.arcConnections : []),
      exposed: Array.isArray(s.exposed) ? s.exposed.slice() : [],
      buried: Array.isArray(s.buried) ? s.buried.slice() : [],
      characterHighlights: mapToRows(s.characterHighlights)
    };
  }

  function initWhatsMissing(section) {
    var s = section || {};
    return {
      arcConnections: deepClone(Array.isArray(s.arcConnections) ? s.arcConnections : []),
      knownUnknowns: Array.isArray(s.knownUnknowns) ? s.knownUnknowns.slice() : [],
      narrativePurpose: typeof s.narrativePurpose === 'string' ? s.narrativePurpose : '',
      buriedItems: Array.isArray(s.buriedItems) ? s.buriedItems.slice() : []
    };
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
      var acct = { name: row.name || '', total: coerceTotal(row.total), inference: row.inference || '' };
      if (acct.total === undefined) acct.total = '';
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
    setOrDeleteArray(out, 'buried', Array.isArray(formState.buried) ? formState.buried.filter(nonEmpty) : splitCsv(formState.buried));
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
    setOrDeleteArray(out, 'buriedItems', Array.isArray(formState.buriedItems) ? formState.buriedItems.filter(nonEmpty) : splitCsv(formState.buriedItems));
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

  // ── (H) SERVER-SIDE VALIDATION (Ajv-backed; injectable) ───────────────────
  function validateOutline(outline, theme, validateFn) {
    var schemaName = schemaNameForTheme(theme);
    var doValidate = validateFn;

    if (typeof doValidate !== 'function') {
      if (typeof require === 'function') {
        try {
          var mod = require('../lib/schema-validator');
          var validatorInstance = new mod.SchemaValidator();
          doValidate = function (name, data) { return validatorInstance.validate(name, data); };
        } catch (e) {
          return {
            valid: false,
            errors: [{ path: '/', message: 'validator unavailable: ' + e.message }],
            schemaName: schemaName,
            message: 'Outline validator unavailable: ' + e.message
          };
        }
      } else {
        return {
          valid: false,
          errors: [{ path: '/', message: 'no validator available in this environment' }],
          schemaName: schemaName,
          message: 'No outline validator available in this environment'
        };
      }
    }

    var result = doValidate(schemaName, outline);
    var errors = result.errors || [];
    var message = result.valid
      ? ''
      : 'Edited outline failed schema validation (' + schemaName + '): ' +
        errors.map(function (e) { return (e.path || '/') + ' ' + e.message; }).join('; ');

    return { valid: !!result.valid, errors: errors, schemaName: schemaName, message: message };
  }

  // ── (I) CLIENT-SIDE STRUCTURAL VALIDATION (dependency-free fast-fail gate) ──
  function isPlainObject(val) { return val !== null && typeof val === 'object' && !Array.isArray(val); }
  function isNonEmptyString(val) { return typeof val === 'string' && val.trim().length > 0; }

  var JOURNALIST_ARC_FIELDS = {
    followTheMoney: { key: 'arcConnections', subFields: ['arcName', 'financialAngle'] },
    thePlayers: { key: 'arcConnections', subFields: ['arcName', 'characterAngle'] },
    whatsMissing: { key: 'arcConnections', subFields: ['arcName', 'openQuestion'] },
    closing: { key: 'arcResolutions', subFields: ['arcName', 'resolution'] }
  };
  var JOURNALIST_ROOT_KEYS = ['lede', 'theStory', 'followTheMoney', 'thePlayers', 'whatsMissing', 'closing'];
  var DETECTIVE_ROOT_KEYS = ['executiveSummary', 'evidenceLocker', 'memoryAnalysis', 'suspectNetwork', 'outstandingQuestions', 'finalAssessment'];
  var DETECTIVE_REQUIRED_ROOT_KEYS = ['executiveSummary', 'evidenceLocker', 'suspectNetwork', 'outstandingQuestions', 'finalAssessment'];

  function validateObjectArray(errors, path, value, subFields) {
    if (!Array.isArray(value)) {
      errors.push({ path: path, message: 'must be an array of objects (was ' + (value === null ? 'null' : typeof value) + ')' });
      return;
    }
    value.forEach(function (item, i) {
      if (!isPlainObject(item)) { errors.push({ path: path + '/' + i, message: 'must be an object' }); return; }
      subFields.forEach(function (f) {
        if (!isNonEmptyString(item[f])) {
          errors.push({ path: path + '/' + i + '/' + f, message: "must have required string '" + f + "'" });
        }
      });
    });
  }

  function validateJournalistOutlineShape(outline, errors) {
    Object.keys(outline).forEach(function (k) {
      if (JOURNALIST_ROOT_KEYS.indexOf(k) === -1) {
        errors.push({ path: '/' + k, message: 'is not an allowed top-level outline key' });
      }
    });
    if (!isPlainObject(outline.lede)) {
      errors.push({ path: '/lede', message: 'must be an object' });
    } else {
      ['hook', 'keyTension', 'primaryArc'].forEach(function (f) {
        if (!isNonEmptyString(outline.lede[f])) {
          errors.push({ path: '/lede/' + f, message: "must have required string '" + f + "'" });
        }
      });
    }
    if (!isPlainObject(outline.theStory)) {
      errors.push({ path: '/theStory', message: 'must be an object' });
    } else {
      var ai = outline.theStory.arcInterweaving;
      if (!isPlainObject(ai)) {
        errors.push({ path: '/theStory/arcInterweaving', message: 'must be an object (interleavingPlan + convergencePoint)' });
      } else {
        ['interleavingPlan', 'convergencePoint'].forEach(function (f) {
          if (!isNonEmptyString(ai[f])) {
            errors.push({ path: '/theStory/arcInterweaving/' + f, message: "must have required string '" + f + "'" });
          }
        });
      }
      if (!Array.isArray(outline.theStory.arcs)) {
        errors.push({ path: '/theStory/arcs', message: 'must be an array' });
      } else {
        outline.theStory.arcs.forEach(function (arc, i) {
          if (!isPlainObject(arc)) { errors.push({ path: '/theStory/arcs/' + i, message: 'must be an object' }); return; }
          if (!isNonEmptyString(arc.name)) {
            errors.push({ path: '/theStory/arcs/' + i + '/name', message: "must have required string 'name'" });
          }
          if (!Number.isInteger(arc.paragraphCount)) {
            errors.push({ path: '/theStory/arcs/' + i + '/paragraphCount', message: 'must have required integer paragraphCount' });
          }
        });
      }
    }
    Object.keys(JOURNALIST_ARC_FIELDS).forEach(function (sectionKey) {
      var spec = JOURNALIST_ARC_FIELDS[sectionKey];
      var section = outline[sectionKey];
      if (!isPlainObject(section)) { errors.push({ path: '/' + sectionKey, message: 'must be an object' }); return; }
      validateObjectArray(errors, '/' + sectionKey + '/' + spec.key, section[spec.key], spec.subFields);
    });
    if (isPlainObject(outline.thePlayers) && outline.thePlayers.characterHighlights != null && !isPlainObject(outline.thePlayers.characterHighlights)) {
      errors.push({ path: '/thePlayers/characterHighlights', message: 'must be an object map of string values' });
    }
  }

  function validateDetectiveOutlineShape(outline, errors) {
    Object.keys(outline).forEach(function (k) {
      if (DETECTIVE_ROOT_KEYS.indexOf(k) === -1) {
        errors.push({ path: '/' + k, message: 'is not an allowed top-level outline key' });
      }
    });
    DETECTIVE_REQUIRED_ROOT_KEYS.forEach(function (k) {
      if (!isPlainObject(outline[k])) { errors.push({ path: '/' + k, message: 'is required and must be an object' }); }
    });
    if (isPlainObject(outline.executiveSummary)) {
      ['hook', 'caseOverview'].forEach(function (f) {
        if (!isNonEmptyString(outline.executiveSummary[f])) {
          errors.push({ path: '/executiveSummary/' + f, message: "must have required string '" + f + "'" });
        }
      });
      if (!Array.isArray(outline.executiveSummary.primaryFindings)) {
        errors.push({ path: '/executiveSummary/primaryFindings', message: 'must be an array of strings' });
      }
    }
    if (isPlainObject(outline.evidenceLocker)) {
      validateObjectArray(errors, '/evidenceLocker/evidenceGroups', outline.evidenceLocker.evidenceGroups, ['theme', 'synthesis']);
      if (Array.isArray(outline.evidenceLocker.evidenceGroups)) {
        outline.evidenceLocker.evidenceGroups.forEach(function (g, i) {
          if (isPlainObject(g) && !Array.isArray(g.evidenceIds)) {
            errors.push({ path: '/evidenceLocker/evidenceGroups/' + i + '/evidenceIds', message: 'must be an array of strings' });
          }
        });
      }
    }
    if (isPlainObject(outline.suspectNetwork)) {
      validateObjectArray(errors, '/suspectNetwork/assessments', outline.suspectNetwork.assessments, ['name', 'role']);
    }
    if (isPlainObject(outline.outstandingQuestions) && !Array.isArray(outline.outstandingQuestions.questions)) {
      errors.push({ path: '/outstandingQuestions/questions', message: 'must be an array of strings' });
    }
    if (isPlainObject(outline.finalAssessment)) {
      ['verdict', 'closingLine'].forEach(function (f) {
        if (!isNonEmptyString(outline.finalAssessment[f])) {
          errors.push({ path: '/finalAssessment/' + f, message: "must have required string '" + f + "'" });
        }
      });
    }
  }

  function validateOutlineShape(outline, theme) {
    var errors = [];
    if (!isPlainObject(outline)) {
      return { valid: false, errors: [{ path: '/', message: 'outline must be an object' }] };
    }
    if (theme === 'detective') { validateDetectiveOutlineShape(outline, errors); }
    else { validateJournalistOutlineShape(outline, errors); }
    return { valid: errors.length === 0, errors: errors };
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
    schemaNameForTheme: schemaNameForTheme,
    computeResetKey: computeResetKey,

    initLede: initLede,
    initArc: initArc,
    initArcInterweaving: initArcInterweaving,
    initFollowTheMoney: initFollowTheMoney,
    initThePlayers: initThePlayers,
    initWhatsMissing: initWhatsMissing,
    initClosing: initClosing,

    buildLedePayload: buildLedePayload,
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

    validateOutline: validateOutline,
    validateOutlineShape: validateOutlineShape
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.outlineEditLogic = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
