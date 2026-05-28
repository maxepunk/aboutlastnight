# Outline Rich-Editor Bug-Fix Implementation Plan

> **REQUIRED SUB-SKILL:** For agentic workers — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Every code step uses checkbox syntax (`- [ ]`). Follow strict TDD per task: write the failing test, run it expecting FAIL, write the minimal real implementation, run it expecting PASS, then commit. Do NOT batch tasks. Do NOT skip the FAIL run — a test that passes before implementation is testing nothing.
>
> **Goal:** Ship `feature/outline-rich-editor` as a merge-ready, zero-bug branch whose per-section inline Outline editors produce schema-valid outlines for BOTH the journalist (`outline.schema.json`) and detective (`detective-outline.schema.json`) themes, with client-side AND server-side validation gating every edit, and with the cross-file twins in `Article.js` fixed in lockstep.
>
> **Architecture:** Extract all bug-prone save/merge/normalize/validate logic out of the React components into a single PURE, dual-export CommonJS-friendly module (`reports/console/outline-edit-logic.js`). The module registers on `window.Console.outlineEditLogic` for the browser AND ends with a Node `module.exports` guard so its pure functions are unit-testable in node-env Jest (no DOM, no React, no jsdom). The React editors become thin wrappers that call these pure functions. Seven shared React widgets (built from existing CSS classes) replace ~11 near-identical editors. The server activates the already-registered (but never-called) Ajv `SchemaValidator` against the active theme schema inside `buildResumePayload`.
>
> **Tech Stack:** React 18 + Babel standalone via CDN (ZERO build, ZERO npm deps added to the browser). Node + Jest (`testEnvironment: node`, already configured in `reports/package.json` / `reports/jest.config.js`) for unit tests. Ajv via the existing `reports/lib/schema-validator.js`. No new dependencies of any kind.

---

## Branch context

- **Work on `feature/outline-rich-editor`.** The working tree is currently checked out on `main`, whose `Outline.js` is the 511-line pre-feature JSON-textarea version — it has NONE of the inline editors this plan fixes. The 1157-line buggy editors live ONLY on the feature branch. **The executing agent MUST `git checkout feature/outline-rich-editor` first**, or every line-anchored edit below will fail.
- The working tree is clean of tracked changes (the `header.hbs` change was already committed). Untracked report working-files and image dirs (`reports/outputs/`, `reports/assets/images/`, `docs/superpowers/plans/`) do not block a checkout.
- The branch **already merges cleanly into `main`** (textually verified; merge-base `817dec26ab7d99585de03f43f3e4efe4def88f99`, 13 commits ahead). This plan does not change merge mechanics; it only fixes correctness on the branch.
- All line numbers below were verified against `git show feature/outline-rich-editor:<path>`. If a line anchor does not match after checkout, STOP and re-locate by the quoted code, not the number.
- Run all `git` commands from the repo root `C:/Users/spide/Documents/claudecode/aboutlastnight`. Run all `npx jest` / `node` commands from `reports/` (the Node project root). On Windows use `cd reports; npx jest ...` (PowerShell). The examples below show the canonical `cd reports` form.

### Pre-flight (run once before Task 1)

- [ ] Check out the feature branch: from repo root run `git checkout feature/outline-rich-editor`
- [ ] Confirm the buggy editors are present: `git show HEAD:reports/console/components/checkpoints/Outline.js | wc -l` → expect `1157`
- [ ] Establish the test baseline: `cd reports` then `npx jest __tests__/unit/server-build-resume-payload.test.js -v` → expect 3 passing tests (this baseline test is intentionally broken and rewritten in Task 10)
- [ ] Confirm `node --check` works on a file you'll edit: `cd reports` then `node --check console/components/checkpoints/Outline.js` → expect no output (this file is plain `React.createElement`, no JSX, so `node --check` parses it cleanly). NOTE: `node --check` validates SYNTAX only; it does not run browser globals.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `reports/console/outline-edit-logic.js` | **CREATE** | Dual-export pure module. All init/build/merge/coerce/validate logic. Browser: `window.Console.outlineEditLogic`. Node: `module.exports`. NEVER touches React/window at eval time except a guarded `window.Console` write. Establishes the first `module.exports` in `reports/console/`. |
| `reports/__tests__/unit/outline-edit-logic.test.js` | **CREATE** | Node-env unit tests for every pure function. Proves B1–B5, N1–N4, `validateOutline`, `validateOutlineShape`. Requires the module + the real `SchemaValidator` for capstone conformance. |
| `reports/console/console.css` | **MODIFY** | Add `.flex-1 { flex: 1; }` (currently a phantom class). No other CSS changes — all widget classes already exist. |
| `reports/console/components/checkpoints/Outline.js` | **MODIFY** | Replace buggy editors with thin wrappers + 7 shared widgets. Fix dataKey (B5), `handleJsonApprove` (B6), add client validation gate + `editError` UI (decision #2). Delete `NamedSectionEditor`, `PullQuotesEditor`, dead `renderListEditForm`/`CollapsibleSection` imports. |
| `reports/console/components/checkpoints/Article.js` | **MODIFY** | Twin fixes only: dataKey (B5) via `computeResetKey`, and `handleJsonApprove` SAVE_PENDING_EDITS (B6). Scope-guarded — no editor changes. |
| `reports/console/index.html` | **MODIFY** | Add `<script type="text/babel" src="outline-edit-logic.js">` AFTER `RevisionDiff.js` (line 34) and BEFORE `Outline.js` (line 35). |
| `reports/console/utils.js` | **MODIFY** | Remove unused helpers + registration entries (decision #4): `renderListEditForm` / `ListEditForm` (zero call sites today) AND `renderTextEditForm` / `TextEditForm` (become dead once Task 4 removes their last call). Keep `CollapsibleSection` (genuinely used by many other components). |
| `reports/server.js` | **MODIFY** | Module-scope `outlineValidator = new SchemaValidator()`; add 3rd `theme` param to `buildResumePayload`; activate Ajv validation in the outline block; pass theme at the two call sites. |
| `reports/__tests__/unit/server-build-resume-payload.test.js` | **MODIFY** | Rewrite the now-invalid partial-outline fixture to a complete valid outline; add positive/negative journalist + detective validation tests. |

---

## Task 1 — Create the dual-export pure logic module + its full unit suite (TDD)

This is the foundation. Everything else calls these pure functions. We write the tests first, watch them fail (module does not exist), then create the module, then watch them pass.

**Files:**
- **CREATE** `reports/__tests__/unit/outline-edit-logic.test.js`
- **CREATE** `reports/console/outline-edit-logic.js`

### 1.1 Write the failing test file

- [ ] Create `reports/__tests__/unit/outline-edit-logic.test.js` with the complete contents below. It requires the not-yet-existing module and the real `SchemaValidator`, defines two valid-outline factories reused across negative tests, then exercises every primitive, initializer, builder, merge fn, and validator.

```javascript
/**
 * outline-edit-logic.js — pure-function unit tests (node-env, no DOM/React).
 * Proves B1–B5, N1–N4, and the client/server validation surface.
 */
const L = require('../../console/outline-edit-logic.js');
const { SchemaValidator } = require('../../lib/schema-validator');

const v = new SchemaValidator();
const validate = (name, data) => v.validate(name, data);

// ── Fixtures ────────────────────────────────────────────────────────────────
function validJournalistOutline() {
  return {
    lede: {
      hook: 'A party ends with one guest dead and a room full of liars.',
      keyTension: 'The room accused the wrong person.',
      primaryArc: 'The Blackwood embezzlement',
      selectedEvidence: ['rfid-001', 'rfid-002']
    },
    theStory: {
      arcInterweaving: {
        interleavingPlan: 'Open on the accusation, braid the money trail through it.',
        convergencePoint: 'The shell-account ledger names the real culprit.',
        callbackOpportunities: [
          { plantIn: 'lede', payoffIn: 'closing', detail: 'The misread receipt.' }
        ]
      },
      arcs: [
        {
          name: 'The embezzlement',
          paragraphCount: 3,
          evidenceCards: [
            { tokenId: 'rfid-001', placement: 'arc-open', loopFunction: 'OPENER' }
          ],
          photoPlacement: { filename: 'whiteboard.jpg', afterParagraph: 2, purpose: 'bridge' }
        }
      ]
    },
    followTheMoney: {
      arcConnections: [
        { arcName: 'The embezzlement', financialAngle: 'Funds routed through three shells.' }
      ],
      shellAccounts: [
        { name: 'Meridian Holdings', total: '$1.2M', inference: 'Front for diverted payroll.', relatedArc: 'The embezzlement' }
      ],
      photoPlacement: null
    },
    thePlayers: {
      arcConnections: [
        { arcName: 'The embezzlement', characterAngle: 'Sarah controlled the accounts.' }
      ],
      exposed: ['Sarah Blackwood'],
      buried: ['the silent partner'],
      pullQuotes: [
        { type: 'verbatim', text: 'I never touched that account.', attribution: 'Sarah Blackwood', advancesArc: 'The embezzlement' }
      ],
      characterHighlights: { 'Sarah Blackwood': 'Cool under questioning.' }
    },
    whatsMissing: {
      arcConnections: [
        { arcName: 'The embezzlement', openQuestion: 'Who signed the final transfer?' }
      ],
      knownUnknowns: ['The third signatory'],
      narrativePurpose: 'Flag the gap the room never closed.',
      buriedItems: ['transfer-009']
    },
    closing: {
      arcResolutions: [
        { arcName: 'The embezzlement', resolution: 'The ledger settles it.' }
      ],
      systemicAngle: 'Money moves faster than accountability.',
      accusationHandling: 'The room accused the valet; the ledger says otherwise.',
      finalLine: 'The receipts outlived the alibi.'
    }
  };
}

function validDetectiveOutline() {
  return {
    executiveSummary: {
      hook: 'One body, six suspects, a paper trail.',
      caseOverview: 'Victim found at the Blackwood estate after the party.',
      primaryFindings: ['Funds were diverted.', 'The accused had no access.']
    },
    evidenceLocker: {
      evidenceGroups: [
        { theme: 'Financial', evidenceIds: ['rfid-001', 'rfid-002'], synthesis: 'Transfers cluster on one account.' }
      ]
    },
    memoryAnalysis: {
      focus: 'The diverted payroll runs.',
      keyPatterns: ['Monthly cadence', 'Round-dollar amounts'],
      significance: 'Pattern predates the victim joining the firm.'
    },
    suspectNetwork: {
      keyRelationships: [
        { characters: ['Sarah Blackwood', 'the valet'], nature: 'Employer and alibi-witness.' }
      ],
      assessments: [
        { name: 'Sarah Blackwood', role: 'CFO', suspicionLevel: 'high' }
      ]
    },
    outstandingQuestions: {
      questions: ['Who authorized the final transfer?'],
      investigativeGaps: 'The signatory page is missing.'
    },
    finalAssessment: {
      accusationHandling: 'The room accused the valet.',
      verdict: 'Evidence points to Sarah, not the accused.',
      closingLine: 'The ledger never lies; people do.'
    }
  };
}

// ── (A) Primitives ───────────────────────────────────────────────────────────
describe('primitives', () => {
  it('deepClone produces an independent copy', () => {
    const src = { a: { b: 1 } };
    const out = L.deepClone(src);
    expect(out).toEqual(src);
    out.a.b = 2;
    expect(src.a.b).toBe(1);
    expect(L.deepClone(undefined)).toBeUndefined();
  });

  it('splitCsv trims, drops empties, rejects non-strings', () => {
    expect(L.splitCsv('a, b ,c')).toEqual(['a', 'b', 'c']);
    expect(L.splitCsv('')).toEqual([]);
    expect(L.splitCsv('  ')).toEqual([]);
    expect(L.splitCsv('a,,b')).toEqual(['a', 'b']);
    expect(L.splitCsv(123)).toEqual([]);
  });

  it('joinCsv joins arrays, empty for non-arrays', () => {
    expect(L.joinCsv(['a', 'b'])).toBe('a, b');
    expect(L.joinCsv([])).toBe('');
    expect(L.joinCsv('x')).toBe('');
  });

  it('setRowField immutably replaces one field on one row', () => {
    const rows = [{ arcName: 'A', financialAngle: 'x' }];
    const out = L.setRowField(rows, 0, 'financialAngle', 'y');
    expect(out).toEqual([{ arcName: 'A', financialAngle: 'y' }]);
    expect(rows[0].financialAngle).toBe('x');
    expect(out[0]).not.toBe(rows[0]);
    expect(L.setRowField(rows, 9, 'financialAngle', 'y')).toEqual(rows);
  });

  it('setRowList accepts CSV string or array', () => {
    const a = L.setRowList([{ characters: [] }], 0, 'characters', 'a,b');
    expect(a[0].characters).toEqual(['a', 'b']);
    const b = L.setRowList([{ characters: [] }], 0, 'characters', ['x']);
    expect(b[0].characters).toEqual(['x']);
  });

  it('removeRow / addRow are immutable', () => {
    expect(L.removeRow([1, 2, 3], 1)).toEqual([1, 3]);
    expect(L.addRow([1], 2)).toEqual([1, 2]);
    expect(L.addRow(null, { x: 1 })).toEqual([{ x: 1 }]);
  });

  it('coerceInt floors valid numbers, undefined otherwise', () => {
    expect(L.coerceInt('3')).toBe(3);
    expect(L.coerceInt(3)).toBe(3);
    expect(L.coerceInt('3.9')).toBe(3);
    expect(L.coerceInt('')).toBeUndefined();
    expect(L.coerceInt('abc')).toBeUndefined();
    expect(L.coerceInt(null)).toBeUndefined();
  });

  it('coerceTotal keeps currency strings, numbers stay numbers', () => {
    expect(L.coerceTotal('1200')).toBe(1200);
    expect(L.coerceTotal(1200)).toBe(1200);
    expect(L.coerceTotal('1200.5')).toBe(1200.5);
    expect(L.coerceTotal('$1.2M')).toBe('$1.2M');
    expect(L.coerceTotal('approx 500')).toBe('approx 500');
    expect(L.coerceTotal('-50')).toBe(-50);
    expect(L.coerceTotal('')).toBeUndefined();
  });

  it('nonEmpty gates non-blank strings only', () => {
    expect(L.nonEmpty('x')).toBe(true);
    expect(L.nonEmpty('  ')).toBe(false);
    expect(L.nonEmpty('')).toBe(false);
    expect(L.nonEmpty(null)).toBe(false);
    expect(L.nonEmpty(5)).toBe(false);
  });

  it('rowsToMap / mapToRows round-trip; blank keys dropped', () => {
    expect(L.rowsToMap([{ key: 'Sarah', value: 'lead' }, { key: '', value: 'z' }, { key: 'Bob', value: 'x' }]))
      .toEqual({ Sarah: 'lead', Bob: 'x' });
    expect(L.rowsToMap([])).toEqual({});
    expect(L.mapToRows({ Sarah: 'lead' })).toEqual([{ key: 'Sarah', value: 'lead' }]);
    expect(L.mapToRows(null)).toEqual([]);
    expect(L.mapToRows(['a'])).toEqual([]);
    expect(L.rowsToMap(L.mapToRows({ a: '1', b: '2' }))).toEqual({ a: '1', b: '2' });
  });

  it('schemaNameForTheme maps themes', () => {
    expect(L.schemaNameForTheme('detective')).toBe('detective-outline');
    expect(L.schemaNameForTheme('journalist')).toBe('outline');
    expect(L.schemaNameForTheme(undefined)).toBe('outline');
  });

  it('computeResetKey (B5) distinguishes revisions with identical 100-char prefixes', () => {
    const a = validJournalistOutline();
    const b = validJournalistOutline();
    b.closing.finalLine = 'A completely different closing line that the prefix never reaches.';
    expect(L.computeResetKey(a, 0)).not.toBe(L.computeResetKey(b, 0));
    expect(L.computeResetKey(a, 0)).toBe(L.computeResetKey(a, 0));
    expect(L.computeResetKey(a, 0)).not.toBe(L.computeResetKey(a, 1));
    const circ = {}; circ.self = circ;
    expect(function () { L.computeResetKey(circ, 0); }).not.toThrow();
  });
});

// ── (C) Journalist initializers ───────────────────────────────────────────────
describe('journalist initializers (no loss on load)', () => {
  it('initLede retains primaryArc (B2 root) and selectedEvidence', () => {
    const s = L.initLede(validJournalistOutline().lede);
    expect(s.primaryArc).toBe('The Blackwood embezzlement');
    expect(s.keyTension).toBe('The room accused the wrong person.');
    expect(s.selectedEvidence).toEqual(['rfid-001', 'rfid-002']);
    const empty = L.initLede(undefined);
    expect(empty.hook).toBe('');
    expect(empty.selectedEvidence).toEqual([]);
  });

  it('initArc stringifies paragraphCount for the input', () => {
    const s = L.initArc({ name: 'X', paragraphCount: 5 });
    expect(s.paragraphCount).toBe('5');
    expect(s.name).toBe('X');
  });

  it('initArcInterweaving (B3) reads the object, survives a legacy string', () => {
    const s = L.initArcInterweaving(validJournalistOutline().theStory.arcInterweaving);
    expect(s.interleavingPlan).toContain('braid');
    expect(s.convergencePoint).toContain('ledger');
    const legacy = L.initArcInterweaving('flattened string');
    expect(legacy.interleavingPlan).toBe('');
    expect(legacy.convergencePoint).toBe('');
  });

  it('initFollowTheMoney (B1) deep-clones object-arrays', () => {
    const s = L.initFollowTheMoney(validJournalistOutline().followTheMoney);
    expect(Array.isArray(s.arcConnections)).toBe(true);
    expect(s.arcConnections[0].financialAngle).toContain('shells');
    expect(s.shellAccounts[0].total).toBe('$1.2M');
  });

  it('initThePlayers maps characterHighlights to rows and clones pullQuotes', () => {
    const s = L.initThePlayers(validJournalistOutline().thePlayers);
    expect(s.characterHighlights).toEqual([{ key: 'Sarah Blackwood', value: 'Cool under questioning.' }]);
    expect(s.pullQuotes[0].type).toBe('verbatim');
    expect(s.pullQuotes[0].text).toContain('account');
  });

  it('initWhatsMissing / initClosing keep object-arrays', () => {
    const wm = L.initWhatsMissing(validJournalistOutline().whatsMissing);
    expect(wm.arcConnections[0].openQuestion).toContain('signed');
    const cl = L.initClosing(validJournalistOutline().closing);
    expect(Array.isArray(cl.arcResolutions)).toBe(true);
    expect(cl.arcResolutions[0].resolution).toContain('ledger');
  });
});

// ── (D) Journalist builders: conformance + preservation ─────────────────────────
describe('journalist builders', () => {
  it('buildLedePayload (B2+N4) keeps primaryArc, omits empty selectedEvidence, no stray keys', () => {
    const orig = validJournalistOutline().lede;
    const state = L.initLede(orig);
    state.hook = 'Edited hook.';
    state.selectedEvidence = [];
    const out = L.buildLedePayload(state, orig);
    expect(out.primaryArc).toBe('The Blackwood embezzlement');
    expect(out.keyTension).toBe('The room accused the wrong person.');
    expect(out.hook).toBe('Edited hook.');
    expect(out.selectedEvidence).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(['hook', 'keyTension', 'primaryArc']);
    const full = L.mergeSection(validJournalistOutline(), 'lede', out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildArcPayload (N1) coerces paragraphCount to int, preserves evidenceCards+photoPlacement, no keyPoints', () => {
    const origArc = validJournalistOutline().theStory.arcs[0];
    const state = L.initArc(origArc);
    state.name = 'Renamed arc';
    state.paragraphCount = '4';
    const out = L.buildArcPayload(state, origArc);
    expect(out.paragraphCount).toBe(4);
    expect(out.name).toBe('Renamed arc');
    expect(out.evidenceCards).toEqual(origArc.evidenceCards);
    expect(out.photoPlacement).toEqual(origArc.photoPlacement);
    expect(out.keyPoints).toBeUndefined();
    const full = L.mergeArc(validJournalistOutline(), 0, out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildArcInterweavingPayload (B3) stays an object, preserves callbackOpportunities', () => {
    const orig = validJournalistOutline().theStory.arcInterweaving;
    const state = L.initArcInterweaving(orig);
    state.convergencePoint = 'Edited convergence.';
    const out = L.buildArcInterweavingPayload(state, orig);
    expect(typeof out).toBe('object');
    expect(out.interleavingPlan).toContain('braid');
    expect(out.convergencePoint).toBe('Edited convergence.');
    expect(out.callbackOpportunities).toEqual(orig.callbackOpportunities);
    const full = L.mergeArcInterweaving(validJournalistOutline(), out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildFollowTheMoneyPayload (B1 core) keeps arrays, currency string, null photoPlacement, no strays', () => {
    const orig = validJournalistOutline().followTheMoney;
    const state = L.initFollowTheMoney(orig);
    state.arcConnections = L.setRowField(state.arcConnections, 0, 'financialAngle', 'Edited angle.');
    const out = L.buildFollowTheMoneyPayload(state, orig);
    expect(Array.isArray(out.arcConnections)).toBe(true);
    expect(out.arcConnections[0].financialAngle).toBe('Edited angle.');
    expect(Array.isArray(out.shellAccounts)).toBe(true);
    expect(out.shellAccounts[0].total).toBe('$1.2M');
    expect(out.photoPlacement).toBeNull();
    expect(out.focus).toBeUndefined();
    expect(out.characterHighlights).toBeUndefined();
    expect(out.buriedItems).toBeUndefined();
    const full = L.mergeSection(validJournalistOutline(), 'followTheMoney', out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildThePlayersPayload (B1+B4) keeps map, valid pullQuotes (type/text, no placement), no strays', () => {
    const orig = validJournalistOutline().thePlayers;
    const state = L.initThePlayers(orig);
    state.characterHighlights = L.setRowField(state.characterHighlights, 0, 'value', 'Edited highlight.');
    state.pullQuotes = L.addRow(state.pullQuotes, { type: 'insight', text: 'A new insight quote.', attribution: null });
    const out = L.buildThePlayersPayload(state, orig);
    expect(Array.isArray(out.arcConnections)).toBe(true);
    expect(typeof out.characterHighlights).toBe('object');
    expect(Array.isArray(out.characterHighlights)).toBe(false);
    expect(out.characterHighlights['Sarah Blackwood']).toBe('Edited highlight.');
    expect(out.pullQuotes[1].type).toBe('insight');
    expect(out.pullQuotes[1].text).toBe('A new insight quote.');
    expect(out.pullQuotes[1].placement).toBeUndefined();
    expect(out.pullQuotes[1].attribution).toBeNull();
    expect(out.shellAccounts).toBeUndefined();
    expect(out.focus).toBeUndefined();
    const full = L.mergeSection(validJournalistOutline(), 'thePlayers', out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildThePlayersPayload defaults a missing pullQuote type to verbatim and still validates', () => {
    const orig = validJournalistOutline().thePlayers;
    const state = L.initThePlayers(orig);
    state.pullQuotes = L.addRow(state.pullQuotes, { text: 'No type set.' });
    const out = L.buildThePlayersPayload(state, orig);
    expect(out.pullQuotes[1].type).toBe('verbatim');
    const full = L.mergeSection(validJournalistOutline(), 'thePlayers', out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildWhatsMissingPayload edits arcConnections, omits empty narrativePurpose, no strays', () => {
    const orig = validJournalistOutline().whatsMissing;
    const state = L.initWhatsMissing(orig);
    state.arcConnections = L.setRowField(state.arcConnections, 0, 'openQuestion', 'Edited question?');
    state.narrativePurpose = '';
    const out = L.buildWhatsMissingPayload(state, orig);
    expect(out.arcConnections[0].openQuestion).toBe('Edited question?');
    expect(out.narrativePurpose).toBeUndefined();
    expect(out.buriedItems).toEqual(['transfer-009']);
    expect(out.shellAccounts).toBeUndefined();
    expect(out.characterHighlights).toBeUndefined();
    const full = L.mergeSection(validJournalistOutline(), 'whatsMissing', out);
    expect(validate('outline', full).valid).toBe(true);
  });

  it('buildClosingPayload (B-closing) keeps arcResolutions array, preserves accusationHandling', () => {
    const orig = validJournalistOutline().closing;
    const state = L.initClosing(orig);
    state.arcResolutions = L.setRowField(state.arcResolutions, 0, 'resolution', 'Edited resolution.');
    const out = L.buildClosingPayload(state, orig);
    expect(Array.isArray(out.arcResolutions)).toBe(true);
    expect(out.arcResolutions[0].resolution).toBe('Edited resolution.');
    expect(out.accusationHandling).toBe(orig.accusationHandling);
    const full = L.mergeSection(validJournalistOutline(), 'closing', out);
    expect(validate('outline', full).valid).toBe(true);
  });
});

// ── "edit one field, everything else preserved" invariant ──────────────────────
describe('preservation invariant', () => {
  it('followTheMoney: editing one arcConnection leaves shellAccounts + photoPlacement untouched', () => {
    const orig = validJournalistOutline().followTheMoney;
    const state = L.initFollowTheMoney(orig);
    state.arcConnections = L.setRowField(state.arcConnections, 0, 'financialAngle', 'Only this changed.');
    const out = L.buildFollowTheMoneyPayload(state, orig);
    expect(out.shellAccounts).toEqual(orig.shellAccounts);
    expect(out.photoPlacement).toEqual(orig.photoPlacement);
  });

  it('thePlayers: editing one pullQuote leaves arcConnections/exposed/buried/characterHighlights untouched', () => {
    const orig = validJournalistOutline().thePlayers;
    const state = L.initThePlayers(orig);
    state.pullQuotes = L.setRowField(state.pullQuotes, 0, 'text', 'Only this changed.');
    const out = L.buildThePlayersPayload(state, orig);
    expect(out.arcConnections).toEqual(orig.arcConnections);
    expect(out.exposed).toEqual(orig.exposed);
    expect(out.buried).toEqual(orig.buried);
    expect(out.characterHighlights).toEqual(orig.characterHighlights);
  });

  it('arc: editing name leaves evidenceCards + photoPlacement untouched', () => {
    const orig = validJournalistOutline().theStory.arcs[0];
    const state = L.initArc(orig);
    state.name = 'Only this changed.';
    const out = L.buildArcPayload(state, orig);
    expect(out.evidenceCards).toEqual(orig.evidenceCards);
    expect(out.photoPlacement).toEqual(orig.photoPlacement);
  });
});

// ── (E/F) Detective builders ────────────────────────────────────────────────────
describe('detective builders', () => {
  it('buildExecutiveSummaryPayload validates', () => {
    const orig = validDetectiveOutline().executiveSummary;
    const state = L.initExecutiveSummary(orig);
    state.hook = 'Edited hook.';
    const out = L.buildExecutiveSummaryPayload(state, orig);
    expect(Array.isArray(out.primaryFindings)).toBe(true);
    const full = L.mergeSection(validDetectiveOutline(), 'executiveSummary', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });

  it('buildEvidenceLockerPayload keeps evidenceIds as string[]', () => {
    const orig = validDetectiveOutline().evidenceLocker;
    const state = L.initEvidenceLocker(orig);
    state.evidenceGroups = L.setRowList(state.evidenceGroups, 0, 'evidenceIds', 'a,b,c');
    const out = L.buildEvidenceLockerPayload(state, orig);
    expect(out.evidenceGroups[0].evidenceIds).toEqual(['a', 'b', 'c']);
    const full = L.mergeSection(validDetectiveOutline(), 'evidenceLocker', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });

  it('buildMemoryAnalysisPayload omits empty keyPatterns; outline without memoryAnalysis still valid', () => {
    const orig = validDetectiveOutline().memoryAnalysis;
    const state = L.initMemoryAnalysis(orig);
    state.keyPatterns = [];
    const out = L.buildMemoryAnalysisPayload(state, orig);
    expect(out.keyPatterns).toBeUndefined();
    expect(out.focus).toBe(orig.focus);
    const full = L.mergeSection(validDetectiveOutline(), 'memoryAnalysis', out);
    expect(validate('detective-outline', full).valid).toBe(true);
    const noMem = validDetectiveOutline();
    delete noMem.memoryAnalysis;
    expect(validate('detective-outline', noMem).valid).toBe(true);
  });

  it('buildSuspectNetworkPayload drops invalid suspicionLevel, omits empty keyRelationships', () => {
    const orig = validDetectiveOutline().suspectNetwork;
    const state = L.initSuspectNetwork(orig);
    state.assessments = L.setRowField(state.assessments, 0, 'suspicionLevel', 'bogus');
    const out = L.buildSuspectNetworkPayload(state, orig);
    expect(out.assessments[0].suspicionLevel).toBeUndefined();
    expect(out.assessments[0].name).toBe('Sarah Blackwood');
    const full = L.mergeSection(validDetectiveOutline(), 'suspectNetwork', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });

  it('buildOutstandingQuestionsPayload keeps questions string[], omits empty gaps', () => {
    const orig = validDetectiveOutline().outstandingQuestions;
    const state = L.initOutstandingQuestions(orig);
    state.investigativeGaps = '';
    const out = L.buildOutstandingQuestionsPayload(state, orig);
    expect(Array.isArray(out.questions)).toBe(true);
    expect(out.investigativeGaps).toBeUndefined();
    const full = L.mergeSection(validDetectiveOutline(), 'outstandingQuestions', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });

  it('buildFinalAssessmentPayload omits empty accusationHandling', () => {
    const orig = validDetectiveOutline().finalAssessment;
    const state = L.initFinalAssessment(orig);
    state.accusationHandling = '';
    const out = L.buildFinalAssessmentPayload(state, orig);
    expect(out.accusationHandling).toBeUndefined();
    expect(out.verdict).toBe(orig.verdict);
    const full = L.mergeSection(validDetectiveOutline(), 'finalAssessment', out);
    expect(validate('detective-outline', full).valid).toBe(true);
  });
});

// ── (G) Merge fns ───────────────────────────────────────────────────────────────
describe('merge fns', () => {
  it('mergeSection is immutable and swaps one key', () => {
    const orig = validJournalistOutline();
    const snapshot = JSON.parse(JSON.stringify(orig));
    const next = L.mergeSection(orig, 'lede', { hook: 'x', keyTension: 'y', primaryArc: 'z' });
    expect(next.lede).toEqual({ hook: 'x', keyTension: 'y', primaryArc: 'z' });
    expect(next.closing).toEqual(orig.closing);
    expect(orig).toEqual(snapshot);
    expect(next).not.toBe(orig);
  });

  it('mergeArc (N3) swaps one arc, never seeds arcInterweaving as a string', () => {
    const orig = validJournalistOutline();
    orig.theStory.arcs.push({ name: 'Second', paragraphCount: 2 });
    const snapshot = JSON.parse(JSON.stringify(orig));
    const next = L.mergeArc(orig, 1, { name: 'Edited second', paragraphCount: 5 });
    expect(next.theStory.arcs[1].name).toBe('Edited second');
    expect(next.theStory.arcInterweaving).toEqual(orig.theStory.arcInterweaving);
    expect(typeof next.theStory.arcInterweaving).toBe('object');
    expect(orig).toEqual(snapshot);
    const bare = L.mergeArc({}, 0, { name: 'A', paragraphCount: 1 });
    expect(Array.isArray(bare.theStory.arcs)).toBe(true);
    expect(bare.theStory.arcInterweaving).toBeUndefined();
  });

  it('mergeArcInterweaving (B3) swaps the object, leaves arcs alone', () => {
    const orig = validJournalistOutline();
    const next = L.mergeArcInterweaving(orig, { interleavingPlan: 'p', convergencePoint: 'c' });
    expect(next.theStory.arcInterweaving).toEqual({ interleavingPlan: 'p', convergencePoint: 'c' });
    expect(next.theStory.arcs).toEqual(orig.theStory.arcs);
  });
});

// ── (H) validateOutline (server-side surface, injected validator) ───────────────
describe('validateOutline (B7 server-side surface)', () => {
  it('accepts a valid journalist outline', () => {
    const r = L.validateOutline(validJournalistOutline(), 'journalist', validate);
    expect(r.valid).toBe(true);
    expect(r.message).toBe('');
    expect(r.schemaName).toBe('outline');
  });

  it('rejects arcConnections collapsed to a string (B1) with path in message', () => {
    const o = validJournalistOutline();
    o.followTheMoney.arcConnections = 'collapsed';
    const r = L.validateOutline(o, 'journalist', validate);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('/followTheMoney/arcConnections');
  });

  it('uses the detective schema name for detective theme', () => {
    const o = validDetectiveOutline();
    o.executiveSummary.primaryFindings = 'not an array';
    const r = L.validateOutline(o, 'detective', validate);
    expect(r.valid).toBe(false);
    expect(r.schemaName).toBe('detective-outline');
  });

  it('calls the injected validateFn with the resolved schema name', () => {
    const spy = jest.fn(function () { return { valid: true, errors: null }; });
    L.validateOutline(validJournalistOutline(), 'detective', spy);
    expect(spy).toHaveBeenCalledWith('detective-outline', expect.any(Object));
  });

  it('lazy-requires SchemaValidator when no validateFn is injected (node path)', () => {
    const o = validJournalistOutline();
    o.followTheMoney.arcConnections = 'collapsed';
    const r = L.validateOutline(o, 'journalist');
    expect(r.valid).toBe(false);
  });
});

// ── (I) validateOutlineShape (client gate) ──────────────────────────────────────
describe('validateOutlineShape (client gate)', () => {
  it('accepts a complete valid journalist outline', () => {
    expect(L.validateOutlineShape(validJournalistOutline(), 'journalist').valid).toBe(true);
  });

  it('rejects arcConnections collapsed to a string (B1)', () => {
    const o = validJournalistOutline();
    o.followTheMoney.arcConnections = 'collapsed';
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/followTheMoney/arcConnections')).toBe(true);
  });

  it('rejects missing required lede.primaryArc (B2)', () => {
    const o = validJournalistOutline();
    delete o.lede.primaryArc;
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/lede/primaryArc')).toBe(true);
  });

  it('rejects arcInterweaving flattened to a string (B3)', () => {
    const o = validJournalistOutline();
    o.theStory.arcInterweaving = 'flattened';
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/theStory/arcInterweaving')).toBe(true);
  });

  it('rejects a stray top-level pullQuotes key (B4)', () => {
    const o = validJournalistOutline();
    o.pullQuotes = [];
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/pullQuotes')).toBe(true);
  });

  it('rejects arcResolutions collapsed to a string (B-closing)', () => {
    const o = validJournalistOutline();
    o.closing.arcResolutions = 'collapsed';
    const r = L.validateOutlineShape(o, 'journalist');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/closing/arcResolutions')).toBe(true);
  });

  it('accepts a complete valid detective outline', () => {
    expect(L.validateOutlineShape(validDetectiveOutline(), 'detective').valid).toBe(true);
  });

  it('rejects detective assessments collapsed to a string', () => {
    const o = validDetectiveOutline();
    o.suspectNetwork.assessments = 'collapsed';
    const r = L.validateOutlineShape(o, 'detective');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.path === '/suspectNetwork/assessments')).toBe(true);
  });
});

// ── Capstone: full round-trip conformance ───────────────────────────────────────
describe('capstone conformance', () => {
  it('journalist: init→build every section, merge all, validate', () => {
    let o = validJournalistOutline();
    o = L.mergeSection(o, 'lede', L.buildLedePayload(L.initLede(o.lede), o.lede));
    o = L.mergeArcInterweaving(o, L.buildArcInterweavingPayload(L.initArcInterweaving(o.theStory.arcInterweaving), o.theStory.arcInterweaving));
    o = L.mergeArc(o, 0, L.buildArcPayload(L.initArc(o.theStory.arcs[0]), o.theStory.arcs[0]));
    o = L.mergeSection(o, 'followTheMoney', L.buildFollowTheMoneyPayload(L.initFollowTheMoney(o.followTheMoney), o.followTheMoney));
    o = L.mergeSection(o, 'thePlayers', L.buildThePlayersPayload(L.initThePlayers(o.thePlayers), o.thePlayers));
    o = L.mergeSection(o, 'whatsMissing', L.buildWhatsMissingPayload(L.initWhatsMissing(o.whatsMissing), o.whatsMissing));
    o = L.mergeSection(o, 'closing', L.buildClosingPayload(L.initClosing(o.closing), o.closing));
    expect(validate('outline', o).valid).toBe(true);
  });

  it('detective: init→build every section, merge all, validate', () => {
    let o = validDetectiveOutline();
    o = L.mergeSection(o, 'executiveSummary', L.buildExecutiveSummaryPayload(L.initExecutiveSummary(o.executiveSummary), o.executiveSummary));
    o = L.mergeSection(o, 'evidenceLocker', L.buildEvidenceLockerPayload(L.initEvidenceLocker(o.evidenceLocker), o.evidenceLocker));
    o = L.mergeSection(o, 'memoryAnalysis', L.buildMemoryAnalysisPayload(L.initMemoryAnalysis(o.memoryAnalysis), o.memoryAnalysis));
    o = L.mergeSection(o, 'suspectNetwork', L.buildSuspectNetworkPayload(L.initSuspectNetwork(o.suspectNetwork), o.suspectNetwork));
    o = L.mergeSection(o, 'outstandingQuestions', L.buildOutstandingQuestionsPayload(L.initOutstandingQuestions(o.outstandingQuestions), o.outstandingQuestions));
    o = L.mergeSection(o, 'finalAssessment', L.buildFinalAssessmentPayload(L.initFinalAssessment(o.finalAssessment), o.finalAssessment));
    expect(validate('detective-outline', o).valid).toBe(true);
  });
});
```

- [ ] Run the test, expecting FAIL (module does not exist yet): `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -v`
  - Expected output: `Cannot find module '../../console/outline-edit-logic.js' from '__tests__/unit/outline-edit-logic.test.js'` — the whole suite errors. Correct RED state.

### 1.2 Create the module (full real implementation)

- [ ] Create `reports/console/outline-edit-logic.js` with the complete contents below. Full module — primitives, theme/reset helpers, journalist initializers + builders, detective initializers + builders, merge fns, `validateOutline` (Ajv-backed, for the server) and `validateOutlineShape` (dependency-free, for the client). It guards `window` and lazily requires `SchemaValidator` only inside `validateOutline`, so a bare `require()` under Node never pulls in Ajv unless asked.

```javascript
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
      pullQuotes: deepClone(Array.isArray(s.pullQuotes) ? s.pullQuotes : []),
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
    var quotes = (Array.isArray(formState.pullQuotes) ? formState.pullQuotes : []).map(function (row) {
      var q = { type: row.type || 'verbatim', text: row.text || '' };
      if (row.attribution === null) { q.attribution = null; }
      else if (nonEmpty(row.attribution)) { q.attribution = row.attribution; }
      if (nonEmpty(row.advancesArc)) q.advancesArc = row.advancesArc;
      return q;
    });
    setOrDeleteArray(out, 'pullQuotes', quotes);
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
```

- [ ] Run the test, expecting PASS: `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -v`
  - Expected: all `describe` blocks green, e.g. `Tests: 41 passed, 41 total` (count is approximate; the point is zero failures).
- [ ] Syntax-check the module under Node: `cd reports` then `node --check console/outline-edit-logic.js` → expect no output.
- [ ] Confirm a bare require works and the browser guard is inert under Node: `cd reports` then `node -e "const m=require('./console/outline-edit-logic.js'); console.log(typeof m.buildLedePayload, typeof m.validateOutlineShape);"` → expect `function function`.

### 1.3 Commit

- [ ] Commit: from repo root `git add reports/console/outline-edit-logic.js reports/__tests__/unit/outline-edit-logic.test.js` then
  `git commit -m "feat(console): add pure outline-edit-logic module with full unit suite"`
  (footer per repo convention: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task 2 — Shared widgets + the `.flex-1` CSS rule

The 7 shared React widgets live at module scope in `Outline.js` (where the section editors that consume them live). They are pure-presentational and call ONLY the Task-1 pure functions plus `React` and existing helpers. This task adds the widgets and the one missing CSS rule; it does not yet wire any section editor to them (Tasks 3–6).

**Files:**
- **MODIFY** `reports/console/console.css` — add `.flex-1`
- **MODIFY** `reports/console/components/checkpoints/Outline.js` — update the module-scope destructure + add the 7 widgets

### 2.1 Add the `.flex-1` CSS rule

- [ ] In `reports/console/console.css`, find the utility cluster near the `.flex` rule (around line 623). Add immediately after `.flex`:

```css
.flex-1 { flex: 1; }
```

- [ ] Confirm it is the only addition: `cd reports` then Grep `flex-1` in `console/console.css` should return exactly one match.

### 2.2 Update the module-scope destructure in Outline.js

- [ ] In `reports/console/components/checkpoints/Outline.js`, replace the line-14 destructure. CURRENT (verified L14–15):

```javascript
const { Badge, CollapsibleSection, safeStringify, editBtn, renderTextEditForm, renderListEditForm } = window.Console.utils;
const { RevisionDiff } = window.Console;
```

REPLACE WITH (drops `CollapsibleSection` + `renderListEditForm` — both zero-call-site here; KEEPS `renderTextEditForm` until Task 4 removes its last use; adds the logic module):

```javascript
const { Badge, safeStringify, editBtn, renderTextEditForm } = window.Console.utils;
const { RevisionDiff } = window.Console;
const EditLogic = window.Console.outlineEditLogic;
```

### 2.3 Add the 7 shared widgets at module scope

- [ ] Immediately AFTER the destructure block from 2.2 and BEFORE the first editor component, insert the following 7 widgets. They use ONLY existing CSS classes (`article-block__edit-form`, `edit-form__actions`, `flex`, `flex-col`, `items-center`, `gap-sm`, `mt-sm`, `mb-sm`, `flex-1`, `input`, `btn`, `btn-sm`, `btn-primary`, `btn-ghost`, `text-xs`, `text-muted`, `article-block--editing`).

```javascript
// ═══════════════════════════════════════════════════════
// Shared edit widgets (pure-presentational; call EditLogic primitives)
// ═══════════════════════════════════════════════════════

function actionsRow(onSave, onCancel) {
  return React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
    React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: onSave }, 'Save'),
    React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
  );
}

function TextField(props) {
  const label = props.label;
  const value = props.value || '';
  const onChange = props.onChange;
  const multiline = props.multiline;
  const placeholder = props.placeholder || '';
  return React.createElement('label', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    React.createElement(multiline ? 'textarea' : 'input', {
      className: 'input',
      value: value,
      placeholder: placeholder,
      rows: multiline ? 3 : undefined,
      onChange: function (e) { onChange(e.target.value); }
    })
  );
}

function EnumSelect(props) {
  const label = props.label;
  const value = props.value;
  const options = props.options || [];
  const onChange = props.onChange;
  const includeBlank = props.includeBlank;
  const opts = (includeBlank ? [''] : []).concat(options);
  return React.createElement('label', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    React.createElement('select', {
      className: 'input',
      value: value == null ? '' : value,
      onChange: function (e) { onChange(e.target.value); }
    }, opts.map(function (opt, i) {
      return React.createElement('option', { key: i, value: opt }, opt === '' ? '(none)' : opt);
    }))
  );
}

function StringListEditor(props) {
  const label = props.label;
  const items = Array.isArray(props.value) ? props.value : [];
  const onChange = props.onChange;
  const placeholder = props.placeholder || '';
  return React.createElement('div', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    items.map(function (item, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', {
          className: 'input flex-1',
          value: item || '',
          placeholder: placeholder,
          onChange: function (e) {
            const next = items.slice();
            next[idx] = e.target.value;
            onChange(next);
          }
        }),
        React.createElement('button', {
          className: 'btn btn-sm btn-ghost',
          'aria-label': 'Remove item',
          onClick: function () { onChange(EditLogic.removeRow(items, idx)); }
        }, '×')
      );
    }),
    React.createElement('button', {
      className: 'btn btn-sm btn-ghost mb-sm',
      onClick: function () { onChange(EditLogic.addRow(items, '')); }
    }, '+ Add')
  );
}

function ObjectListEditor(props) {
  const label = props.label;
  const rows = Array.isArray(props.value) ? props.value : [];
  const onChange = props.onChange;
  const renderRow = props.renderRow; // (row, idx, setField) => ReactElement
  const makeRow = props.makeRow;     // () => object
  function setField(idx, field, val) { onChange(EditLogic.setRowField(rows, idx, field, val)); }
  return React.createElement('div', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    rows.map(function (row, idx) {
      return React.createElement('div', { key: idx, className: 'article-block--editing mb-sm' },
        renderRow(row, idx, setField),
        React.createElement('button', {
          className: 'btn btn-sm btn-ghost',
          'aria-label': 'Remove row',
          onClick: function () { onChange(EditLogic.removeRow(rows, idx)); }
        }, '× Remove')
      );
    }),
    React.createElement('button', {
      className: 'btn btn-sm btn-ghost mb-sm',
      onClick: function () { onChange(EditLogic.addRow(rows, makeRow())); }
    }, '+ Add')
  );
}

function ObjectEditor(props) {
  const obj = props.value || {};
  const renderFields = props.renderFields; // (obj, setField) => ReactElement
  const onChange = props.onChange;
  function setField(field, val) {
    const next = Object.assign({}, obj);
    next[field] = val;
    onChange(next);
  }
  return React.createElement('div', { className: 'flex flex-col gap-sm mb-sm' }, renderFields(obj, setField));
}

function KeyValueEditor(props) {
  const label = props.label;
  const rows = Array.isArray(props.value) ? props.value : [];
  const onChange = props.onChange;
  return React.createElement('div', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    rows.map(function (row, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', {
          className: 'input flex-1',
          value: row.key || '',
          placeholder: 'name',
          'aria-label': 'Key',
          onChange: function (e) { onChange(EditLogic.setRowField(rows, idx, 'key', e.target.value)); }
        }),
        React.createElement('input', {
          className: 'input flex-1',
          value: row.value || '',
          placeholder: 'highlight',
          'aria-label': 'Value',
          onChange: function (e) { onChange(EditLogic.setRowField(rows, idx, 'value', e.target.value)); }
        }),
        React.createElement('button', {
          className: 'btn btn-sm btn-ghost',
          'aria-label': 'Remove pair',
          onClick: function () { onChange(EditLogic.removeRow(rows, idx)); }
        }, '×')
      );
    }),
    React.createElement('button', {
      className: 'btn btn-sm btn-ghost mb-sm',
      onClick: function () { onChange(EditLogic.addRow(rows, { key: '', value: '' })); }
    }, '+ Add')
  );
}
```

> `ObjectEditor` is provided for completeness/consistency with the widget set; the section editors in Tasks 3–6 use `TextField`/`EnumSelect`/`StringListEditor`/`ObjectListEditor`/`KeyValueEditor` directly. If `ObjectEditor` ends up with zero call sites after Task 6, remove it in Task 11's cleanup pass.

### 2.4 Verify + commit

- [ ] Confirm `CollapsibleSection` and `renderListEditForm` have ZERO references in this file now: `cd reports` then Grep `CollapsibleSection` and `renderListEditForm` in `console/components/checkpoints/Outline.js`. Expect ZERO matches for both. (The OLD editors are still present and still compile because they did not use those two symbols; the only symbol the old editors still use that we kept is `renderTextEditForm`, removed in Task 4.)
- [ ] Syntax-check: `cd reports` then `node --check console/components/checkpoints/Outline.js` → expect no output.
- [ ] Re-run the logic suite (unchanged): `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -v` → expect all PASS.
- [ ] Commit: from repo root `git add reports/console/console.css reports/console/components/checkpoints/Outline.js` then
  `git commit -m "feat(console): add shared outline edit widgets and .flex-1 rule"`

---

## Task 3 — Refactor journalist lede / followTheMoney / thePlayers / whatsMissing / closing editors

Rewrite the five journalist non-arc editors as thin wrappers over the Task-1 builders and Task-2 widgets. DELETES `NamedSectionEditor` (B1/N2 source) and `PullQuotesEditor` (B4 source); pull-quotes move into `ThePlayersEditor`. Save-shape correctness is already proven by Task 1's builder tests.

**Files:**
- **MODIFY** `reports/console/components/checkpoints/Outline.js`
  - Replace `LedeEditor` (L21–46)
  - DELETE `NamedSectionEditor` (L96–143) and `PullQuotesEditor` (L173–208)
  - Replace `ClosingEditor` (L145–171)
  - Add `FollowTheMoneyEditor`, `ThePlayersEditor`, `WhatsMissingEditor`
  - Rewire `renderLede`, the three FOLLOW THE MONEY / THE PLAYERS / WHAT'S MISSING renderers, `renderClosing`; DELETE `renderPullQuotes`

### 3.1 Replace `LedeEditor` (fixes B2 / N4)

- [ ] Replace the entire `LedeEditor` function (L21–46) with:

```javascript
function LedeEditor({ lede, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initLede(lede); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildLedePayload(state, lede)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Hook', value: state.hook, multiline: true, onChange: function (v) { set('hook', v); } }),
    React.createElement(TextField, { label: 'Key Tension', value: state.keyTension, multiline: true, onChange: function (v) { set('keyTension', v); } }),
    React.createElement(TextField, { label: 'Primary Arc', value: state.primaryArc, onChange: function (v) { set('primaryArc', v); } }),
    React.createElement(StringListEditor, { label: 'Selected Evidence (optional)', value: state.selectedEvidence, placeholder: 'token id', onChange: function (v) { set('selectedEvidence', v); } }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 3.2 Add `FollowTheMoneyEditor` (fixes B1 for FOLLOW THE MONEY)

- [ ] Insert a new `FollowTheMoneyEditor` (where `NamedSectionEditor` was, after `LedeEditor`):

```javascript
function FollowTheMoneyEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initFollowTheMoney(section); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildFollowTheMoneyPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Arc Connections (required)',
      value: state.arcConnections,
      makeRow: function () { return { arcName: '', financialAngle: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Arc Name', value: row.arcName, onChange: function (v) { setField(idx, 'arcName', v); } }),
          React.createElement(TextField, { label: 'Financial Angle', value: row.financialAngle, multiline: true, onChange: function (v) { setField(idx, 'financialAngle', v); } })
        );
      },
      onChange: function (v) { setList('arcConnections', v); }
    }),
    React.createElement(ObjectListEditor, {
      label: 'Shell Accounts (optional)',
      value: state.shellAccounts,
      makeRow: function () { return { name: '', total: '', inference: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Name', value: row.name, onChange: function (v) { setField(idx, 'name', v); } }),
          React.createElement(TextField, { label: 'Total (number or text e.g. $1.2M)', value: row.total == null ? '' : String(row.total), onChange: function (v) { setField(idx, 'total', v); } }),
          React.createElement(TextField, { label: 'Inference', value: row.inference, multiline: true, onChange: function (v) { setField(idx, 'inference', v); } }),
          React.createElement(TextField, { label: 'Related Arc (optional)', value: row.relatedArc || '', onChange: function (v) { setField(idx, 'relatedArc', v); } })
        );
      },
      onChange: function (v) { setList('shellAccounts', v); }
    }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 3.3 Add `ThePlayersEditor` (fixes B1 + B4 — pull-quotes now live here)

- [ ] Insert a new `ThePlayersEditor`:

```javascript
function ThePlayersEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initThePlayers(section); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildThePlayersPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Arc Connections (required)',
      value: state.arcConnections,
      makeRow: function () { return { arcName: '', characterAngle: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Arc Name', value: row.arcName, onChange: function (v) { setField(idx, 'arcName', v); } }),
          React.createElement(TextField, { label: 'Character Angle', value: row.characterAngle, multiline: true, onChange: function (v) { setField(idx, 'characterAngle', v); } })
        );
      },
      onChange: function (v) { setList('arcConnections', v); }
    }),
    React.createElement(StringListEditor, { label: 'Exposed (optional)', value: state.exposed, placeholder: 'character name', onChange: function (v) { setList('exposed', v); } }),
    React.createElement(StringListEditor, { label: 'Buried (optional)', value: state.buried, placeholder: 'topic', onChange: function (v) { setList('buried', v); } }),
    React.createElement(ObjectListEditor, {
      label: 'Pull Quotes (optional)',
      value: state.pullQuotes,
      makeRow: function () { return { type: 'verbatim', text: '', attribution: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(EnumSelect, { label: 'Type', value: row.type || 'verbatim', options: ['verbatim', 'insight', 'crystallization'], onChange: function (v) { setField(idx, 'type', v); } }),
          React.createElement(TextField, { label: 'Text', value: row.text, multiline: true, onChange: function (v) { setField(idx, 'text', v); } }),
          React.createElement(TextField, { label: 'Attribution (optional)', value: row.attribution == null ? '' : row.attribution, onChange: function (v) { setField(idx, 'attribution', v); } }),
          React.createElement(TextField, { label: 'Advances Arc (optional)', value: row.advancesArc || '', onChange: function (v) { setField(idx, 'advancesArc', v); } })
        );
      },
      onChange: function (v) { setList('pullQuotes', v); }
    }),
    React.createElement(KeyValueEditor, { label: 'Character Highlights (optional, name → note)', value: state.characterHighlights, onChange: function (v) { setList('characterHighlights', v); } }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 3.4 Add `WhatsMissingEditor` (fixes B1 for WHAT'S MISSING)

- [ ] Insert a new `WhatsMissingEditor`:

```javascript
function WhatsMissingEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initWhatsMissing(section); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildWhatsMissingPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Arc Connections (required)',
      value: state.arcConnections,
      makeRow: function () { return { arcName: '', openQuestion: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Arc Name', value: row.arcName, onChange: function (v) { setField(idx, 'arcName', v); } }),
          React.createElement(TextField, { label: 'Open Question', value: row.openQuestion, multiline: true, onChange: function (v) { setField(idx, 'openQuestion', v); } })
        );
      },
      onChange: function (v) { setList('arcConnections', v); }
    }),
    React.createElement(StringListEditor, { label: 'Known Unknowns (optional)', value: state.knownUnknowns, onChange: function (v) { setList('knownUnknowns', v); } }),
    React.createElement(TextField, { label: 'Narrative Purpose (optional)', value: state.narrativePurpose, multiline: true, onChange: function (v) { setList('narrativePurpose', v); } }),
    React.createElement(StringListEditor, { label: 'Buried Items (optional)', value: state.buriedItems, placeholder: 'token id', onChange: function (v) { setList('buriedItems', v); } }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 3.5 Replace `ClosingEditor` (fixes B-closing)

- [ ] Replace the entire `ClosingEditor` function (L145–171) with:

```javascript
function ClosingEditor({ closing, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initClosing(closing); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildClosingPayload(state, closing)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Arc Resolutions (required)',
      value: state.arcResolutions,
      makeRow: function () { return { arcName: '', resolution: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Arc Name', value: row.arcName, onChange: function (v) { setField(idx, 'arcName', v); } }),
          React.createElement(TextField, { label: 'Resolution', value: row.resolution, multiline: true, onChange: function (v) { setField(idx, 'resolution', v); } })
        );
      },
      onChange: function (v) { setList('arcResolutions', v); }
    }),
    React.createElement(TextField, { label: 'Systemic Angle (optional)', value: state.systemicAngle, multiline: true, onChange: function (v) { setList('systemicAngle', v); } }),
    React.createElement(TextField, { label: 'Final Line (optional)', value: state.finalLine, onChange: function (v) { setList('finalLine', v); } }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 3.6 DELETE the dead editors

- [ ] DELETE the entire `NamedSectionEditor` function (L96–143).
- [ ] DELETE the entire `PullQuotesEditor` function (L173–208).

### 3.7 Rewire the render functions

- [ ] In the journalist branch of `renderOutlineSections` (verified order L1069–1077), the three `renderNamedSection(...)` entries and the trailing `renderPullQuotes(current.pullQuotes)` entry must change. CURRENT:

```javascript
renderNamedSection('FOLLOW THE MONEY', current.followTheMoney, 'followTheMoney'),
renderNamedSection('THE PLAYERS', current.thePlayers, 'thePlayers'),
renderNamedSection("WHAT'S MISSING", current.whatsMissing, 'whatsMissing'),
renderClosing(current.closing),
renderPullQuotes(current.pullQuotes)
```

REPLACE WITH (drop `renderPullQuotes` entirely; pull quotes are now inside THE PLAYERS):

```javascript
renderFollowTheMoney(current.followTheMoney),
renderThePlayers(current.thePlayers),
renderWhatsMissing(current.whatsMissing),
renderClosing(current.closing)
```

- [ ] DELETE the old `renderNamedSection` function and the old `renderPullQuotes` function. After this the journalist branch array is exactly: `renderLede`, `renderTheStory`, `renderFollowTheMoney`, `renderThePlayers`, `renderWhatsMissing`, `renderClosing`.
- [ ] Add the three dedicated renderers, modeled on the existing `renderLede`/`renderClosing` (header + pencil `editBtn` + `isEditing('section', key)` swap + `saveSectionEdit(key, payload)`). Insert near the other renderers:

```javascript
function renderFollowTheMoney(section) {
  if (!section) return null;
  const editing = isEditing('section', 'followTheMoney');
  return React.createElement('div', { key: 'followTheMoney', className: 'outline-section' + (editing ? ' outline-section--editing' : '') },
    React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
      React.createElement('h4', { className: 'outline-section__title' }, 'FOLLOW THE MONEY'),
      !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'followTheMoney' }); })
    ),
    editing
      ? React.createElement(FollowTheMoneyEditor, { section: section, onSave: function (u) { saveSectionEdit('followTheMoney', u); }, onCancel: cancelEdit })
      : React.createElement('div', { className: 'outline-section__content' },
          React.createElement('p', { className: 'text-xs text-muted' }, (section.arcConnections || []).length + ' arc connection(s), ' + ((section.shellAccounts || []).length) + ' shell account(s)'))
  );
}

function renderThePlayers(section) {
  if (!section) return null;
  const editing = isEditing('section', 'thePlayers');
  return React.createElement('div', { key: 'thePlayers', className: 'outline-section' + (editing ? ' outline-section--editing' : '') },
    React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
      React.createElement('h4', { className: 'outline-section__title' }, 'THE PLAYERS'),
      !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'thePlayers' }); })
    ),
    editing
      ? React.createElement(ThePlayersEditor, { section: section, onSave: function (u) { saveSectionEdit('thePlayers', u); }, onCancel: cancelEdit })
      : React.createElement('div', { className: 'outline-section__content' },
          React.createElement('p', { className: 'text-xs text-muted' }, (section.arcConnections || []).length + ' arc connection(s), ' + ((section.pullQuotes || []).length) + ' pull quote(s)'))
  );
}

function renderWhatsMissing(section) {
  if (!section) return null;
  const editing = isEditing('section', 'whatsMissing');
  return React.createElement('div', { key: 'whatsMissing', className: 'outline-section' + (editing ? ' outline-section--editing' : '') },
    React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
      React.createElement('h4', { className: 'outline-section__title' }, "WHAT'S MISSING"),
      !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'whatsMissing' }); })
    ),
    editing
      ? React.createElement(WhatsMissingEditor, { section: section, onSave: function (u) { saveSectionEdit('whatsMissing', u); }, onCancel: cancelEdit })
      : React.createElement('div', { className: 'outline-section__content' },
          React.createElement('p', { className: 'text-xs text-muted' }, (section.arcConnections || []).length + ' open question(s)'))
  );
}
```

> The non-editing display bodies above are minimal summaries. If you want to preserve the richer read-only displays the original `renderNamedSection` produced, copy that read-only branch verbatim and only change the `editing ?` branch to point at the NEW editor + `saveSectionEdit(key, …)`. The load-bearing change is: editing branch renders the NEW editor; save flows through `saveSectionEdit(key, builderOutput)`.

### 3.8 Verify + commit

- [ ] Confirm deleted symbols have zero references: `cd reports` then Grep `NamedSectionEditor`, `PullQuotesEditor`, `renderNamedSection`, `renderPullQuotes` in `console/components/checkpoints/Outline.js`. Expect ZERO matches for all four.
- [ ] Syntax-check: `cd reports` then `node --check console/components/checkpoints/Outline.js` → expect no output.
- [ ] Re-run the logic suite: `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -v` → expect all PASS.
- [ ] Commit: from repo root `git add reports/console/components/checkpoints/Outline.js` then
  `git commit -m "refactor(console): rebuild journalist lede/money/players/missing/closing editors on pure builders"`

---

## Task 4 — Fix `theStory` arcs + arcInterweaving (B3, N1, N3)

Replace `ArcOutlineEditor` (emitted stray `keyPoints`, stringified `photoPlacement` — N1) and the string-based interweaving editor (B3). Fix `saveTheStoryArc` / `saveInterweaving` to use the merge fns (N3 — no more `arcInterweaving:''` string seed).

**Files:**
- **MODIFY** `reports/console/components/checkpoints/Outline.js`
  - Replace `ArcOutlineEditor` (L48–94)
  - Add `ArcInterweavingEditor`
  - Replace `saveTheStoryArc` (L531–540) + `saveInterweaving` (L542–550) bodies
  - Rewire the interweaving editor path in `renderTheStory` (was `renderTextEditForm` at ~L672)
  - Remove `renderTextEditForm` from the destructure (now unused)

### 4.1 Replace `ArcOutlineEditor` (fixes N1)

- [ ] Replace the entire `ArcOutlineEditor` function (L48–94) with:

```javascript
function ArcOutlineEditor({ arc, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initArc(arc); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildArcPayload(state, arc)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Arc Name', value: state.name, onChange: function (v) { set('name', v); } }),
    React.createElement(TextField, { label: 'Paragraph Count', value: state.paragraphCount, onChange: function (v) { set('paragraphCount', v); } }),
    React.createElement('p', { className: 'text-xs text-muted' }, 'Evidence cards and photo placement are preserved automatically and not editable here.'),
    actionsRow(handleSave, onCancel)
  );
}
```

- [ ] Remove the now-dead read-only `keyPoints` display in `renderTheStory`. `keyPoints` is NOT a schema field (`theStory.arcs[]` items are `{name, paragraphCount, evidenceCards?, photoPlacement?}`), and after the editor above stops emitting it (N1), nothing produces it. In `renderTheStory`'s read-only arc block (verified ~L655–659) DELETE the block:

```javascript
arc.keyPoints && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
  (Array.isArray(arc.keyPoints) ? arc.keyPoints : [arc.keyPoints]).map(function (point, j) {
    return React.createElement('li', { key: 'kp-' + j }, typeof point === 'string' ? point : safeStringify(point));
  })
),
```

Leave the surrounding `arc.name` / `arc.paragraphCount` / `arc.evidenceCards` / `arc.photoPlacement` read-only displays intact.

### 4.2 Add `ArcInterweavingEditor` (fixes B3)

- [ ] Insert a new `ArcInterweavingEditor` immediately after `ArcOutlineEditor`:

```javascript
function ArcInterweavingEditor({ interweaving, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initArcInterweaving(interweaving); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildArcInterweavingPayload(state, interweaving)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Interleaving Plan', value: state.interleavingPlan, multiline: true, onChange: function (v) { set('interleavingPlan', v); } }),
    React.createElement(TextField, { label: 'Convergence Point', value: state.convergencePoint, multiline: true, onChange: function (v) { set('convergencePoint', v); } }),
    React.createElement('p', { className: 'text-xs text-muted' }, 'Callback opportunities are preserved automatically and not editable here.'),
    actionsRow(handleSave, onCancel)
  );
}
```

### 4.3 Fix `saveTheStoryArc` and `saveInterweaving` (fixes N3)

- [ ] Replace the body of `saveTheStoryArc` (L531–540) with a `mergeArc` call (no wrong-typed `arcInterweaving:''` seed):

```javascript
function saveTheStoryArc(arcIdx, updatedArc) {
  const next = ensureEditedOutline();
  setEditedOutline(EditLogic.mergeArc(next, arcIdx, updatedArc));
  setHasEdits(true);
  setEditingBlock(null);
}
```

- [ ] Replace the body of `saveInterweaving` (L542–550). It now receives the interweaving OBJECT and merges it:

```javascript
function saveInterweaving(updatedInterweaving) {
  const next = ensureEditedOutline();
  setEditedOutline(EditLogic.mergeArcInterweaving(next, updatedInterweaving));
  setHasEdits(true);
  setEditingBlock(null);
}
```

### 4.4 Rewire the interweaving render path

- [ ] In `renderTheStory`, locate the interweaving editor branch. CURRENT (verified ~L671–685): inside `isEditing('theStoryInterweaving', 'interweaving')` it renders `renderTextEditForm({ value: <string>, multiline: true, onSave: function (t) { saveInterweaving(t); }, onCancel: cancelEdit })`; the ELSE (read-only) branch renders a `safeStringify(...)` display row that ENDS WITH `editBtn(function () { setEditingBlock({ type: 'theStoryInterweaving', key: 'interweaving' }); })` — that pencil is the ONLY affordance that opens the interweaving editor. The replacement read-only branch MUST keep an equivalent `editBtn`, or `arcInterweaving` becomes permanently uneditable (a functional regression that defeats the B3 fix). REPLACE that branch with:

```javascript
isEditing('theStoryInterweaving', 'interweaving')
  ? React.createElement(ArcInterweavingEditor, {
      interweaving: theStory.arcInterweaving,
      onSave: function (u) { saveInterweaving(u); },
      onCancel: cancelEdit
    })
  : React.createElement('div', { className: 'flex items-center gap-sm mt-sm' },
      React.createElement('div', { className: 'outline-section__content flex-1' },
        React.createElement('p', { className: 'text-xs text-muted' }, 'Interleaving Plan:'),
        React.createElement('p', null, (theStory.arcInterweaving && theStory.arcInterweaving.interleavingPlan) || ''),
        React.createElement('p', { className: 'text-xs text-muted' }, 'Convergence Point:'),
        React.createElement('p', null, (theStory.arcInterweaving && theStory.arcInterweaving.convergencePoint) || '')
      ),
      editBtn(function () { setEditingBlock({ type: 'theStoryInterweaving', key: 'interweaving' }); })
    )
```

> `theStory` is the local the existing `renderTheStory` binds (the original reads `current.theStory`). Use whatever local name the function already uses — match it exactly. The behavioral changes: editing branch renders `ArcInterweavingEditor`; read-only branch reads `.interleavingPlan` / `.convergencePoint` instead of `safeStringify(object)`; AND the read-only branch RETAINS the `editBtn` that sets `editingBlock = { type: 'theStoryInterweaving', key: 'interweaving' }` — without it the new `ArcInterweavingEditor` can never be triggered. (The original branch had this pencil; do not drop it.)

### 4.5 Remove the now-unused `renderTextEditForm` import

- [ ] Confirm `renderTextEditForm` has zero remaining references in this file: `cd reports` then Grep `renderTextEditForm` in `console/components/checkpoints/Outline.js`. Expect ZERO matches.
- [ ] Update the destructure (from Task 2.2) to drop `renderTextEditForm`:

```javascript
const { Badge, safeStringify, editBtn } = window.Console.utils;
```

> NOTE: This was the LAST `renderTextEditForm` call site anywhere in `reports/console/` (verified: it is used only in `Outline.js` at the L14 destructure + the single ~L672 call, and defined/registered in `utils.js`). Dropping it here makes `renderTextEditForm` and its backer `TextEditForm` fully dead — they will be removed from `utils.js` in Task 11, exactly like `renderListEditForm` / `ListEditForm`. Do NOT remove them from `utils.js` here; Task 11 owns the utils.js cleanup so all dead-helper removals land in one commit.

### 4.6 Verify + commit

- [ ] Syntax-check: `cd reports` then `node --check console/components/checkpoints/Outline.js` → expect no output.
- [ ] Re-run the logic suite (covers `buildArcPayload`, `buildArcInterweavingPayload`, `mergeArc`, `mergeArcInterweaving`): `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -v` → expect all PASS.
- [ ] Commit: from repo root `git add reports/console/components/checkpoints/Outline.js` then
  `git commit -m "fix(console): rebuild theStory arc + arcInterweaving editors as object-preserving"`

---

## Task 5 — (verification gate) Pull quotes → `thePlayers.pullQuotes`

Pull-quotes were relocated into `ThePlayersEditor` (Task 3.3) with correct fields (`type`/`text`/`attribution`/`advancesArc`, no `placement`), targeting `thePlayers.pullQuotes` via `buildThePlayersPayload` + `saveSectionEdit('thePlayers', …)`; `PullQuotesEditor`/`renderPullQuotes`/the root `pullQuotes` entry were deleted (Task 3.6/3.7). This task confirms B4 is fully closed. No new files.

- [ ] Confirm there is NO root-level `pullQuotes` write in `Outline.js`: `cd reports` then Grep `saveSectionEdit('pullQuotes'` in `console/components/checkpoints/Outline.js`. Expect ZERO matches.
- [ ] Confirm `placement` is gone from pull-quote handling: `cd reports` then Grep `placement` in `console/components/checkpoints/Outline.js`. Expect ZERO matches (schema has no `placement`; it only existed in the deleted `PullQuotesEditor`).
- [ ] Re-run the relevant logic tests: `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -t "thePlayers" -v` → expect PASS.
- [ ] No commit (no changes). If any Grep above is non-empty, return to Task 3 and finish the relocation before proceeding.

---

## Task 6 — Detective section editors on the shared pattern

The six detective editors are already schema-correct on the branch, but decision #4 requires consolidating them onto the shared widgets + pure builders so the whole file uses ONE pattern (and they pick up the validation/dataKey/json-approve fixes via the host). Rewrite all six as thin wrappers. Save-shape correctness is proven by Task 1's detective builder tests. The detective renderers already call `saveSectionEdit(<key>, payload)` (verified L803/L840/L883/L921/L971/L1003) — those stay; only the editor bodies change.

**Files:**
- **MODIFY** `reports/console/components/checkpoints/Outline.js`
  - Replace `ExecutiveSummaryEditor` (L214–249), `EvidenceLockerEditor` (L251–296), `MemoryAnalysisEditor` (L298–333), `SuspectNetworkEditor` (L335–404), `OutstandingQuestionsEditor` (L406–437), `FinalAssessmentEditor` (L439–464)

### 6.1 Replace `ExecutiveSummaryEditor`

- [ ] Replace the entire `ExecutiveSummaryEditor` function (L214–249) with:

```javascript
function ExecutiveSummaryEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initExecutiveSummary(section); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildExecutiveSummaryPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Hook', value: state.hook, multiline: true, onChange: function (v) { set('hook', v); } }),
    React.createElement(TextField, { label: 'Case Overview', value: state.caseOverview, multiline: true, onChange: function (v) { set('caseOverview', v); } }),
    React.createElement(StringListEditor, { label: 'Primary Findings (required)', value: state.primaryFindings, onChange: function (v) { set('primaryFindings', v); } }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 6.2 Replace `EvidenceLockerEditor`

- [ ] Replace the entire `EvidenceLockerEditor` function (L251–296) with:

```javascript
function EvidenceLockerEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initEvidenceLocker(section); });
  function setGroups(val) { setState(Object.assign({}, state, { evidenceGroups: val })); }
  function handleSave() { onSave(EditLogic.buildEvidenceLockerPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Evidence Groups (required)',
      value: state.evidenceGroups,
      makeRow: function () { return { theme: '', evidenceIds: [], synthesis: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Theme', value: row.theme, onChange: function (v) { setField(idx, 'theme', v); } }),
          React.createElement(StringListEditor, { label: 'Evidence IDs', value: Array.isArray(row.evidenceIds) ? row.evidenceIds : [], placeholder: 'token id', onChange: function (v) { setField(idx, 'evidenceIds', v); } }),
          React.createElement(TextField, { label: 'Synthesis', value: row.synthesis, multiline: true, onChange: function (v) { setField(idx, 'synthesis', v); } })
        );
      },
      onChange: setGroups
    }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 6.3 Replace `MemoryAnalysisEditor`

- [ ] Replace the entire `MemoryAnalysisEditor` function (L298–333) with:

```javascript
function MemoryAnalysisEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initMemoryAnalysis(section); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildMemoryAnalysisPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Focus', value: state.focus, multiline: true, onChange: function (v) { set('focus', v); } }),
    React.createElement(StringListEditor, { label: 'Key Patterns (optional)', value: state.keyPatterns, onChange: function (v) { set('keyPatterns', v); } }),
    React.createElement(TextField, { label: 'Significance', value: state.significance, multiline: true, onChange: function (v) { set('significance', v); } }),
    actionsRow(handleSave, onCancel)
  );
}
```

> The detective renderer `renderMemoryAnalysis` (~L883) already guards on the section's presence — if `memoryAnalysis` is absent the editor is never invoked, so absence is preserved. Do NOT change that guard.

### 6.4 Replace `SuspectNetworkEditor`

- [ ] Replace the entire `SuspectNetworkEditor` function (L335–404) with:

```javascript
function SuspectNetworkEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initSuspectNetwork(section); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildSuspectNetworkPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Assessments (required)',
      value: state.assessments,
      makeRow: function () { return { name: '', role: '', suspicionLevel: 'low' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Name', value: row.name, onChange: function (v) { setField(idx, 'name', v); } }),
          React.createElement(TextField, { label: 'Role', value: row.role, onChange: function (v) { setField(idx, 'role', v); } }),
          React.createElement(EnumSelect, { label: 'Suspicion Level (optional)', value: row.suspicionLevel, options: ['high', 'moderate', 'low'], includeBlank: true, onChange: function (v) { setField(idx, 'suspicionLevel', v); } })
        );
      },
      onChange: function (v) { setList('assessments', v); }
    }),
    React.createElement(ObjectListEditor, {
      label: 'Key Relationships (optional)',
      value: state.keyRelationships,
      makeRow: function () { return { characters: [], nature: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(StringListEditor, { label: 'Characters', value: Array.isArray(row.characters) ? row.characters : [], placeholder: 'character name', onChange: function (v) { setField(idx, 'characters', v); } }),
          React.createElement(TextField, { label: 'Nature', value: row.nature, multiline: true, onChange: function (v) { setField(idx, 'nature', v); } })
        );
      },
      onChange: function (v) { setList('keyRelationships', v); }
    }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 6.5 Replace `OutstandingQuestionsEditor`

- [ ] Replace the entire `OutstandingQuestionsEditor` function (L406–437) with:

```javascript
function OutstandingQuestionsEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initOutstandingQuestions(section); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildOutstandingQuestionsPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(StringListEditor, { label: 'Questions (required)', value: state.questions, onChange: function (v) { set('questions', v); } }),
    React.createElement(TextField, { label: 'Investigative Gaps (optional)', value: state.investigativeGaps, multiline: true, onChange: function (v) { set('investigativeGaps', v); } }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 6.6 Replace `FinalAssessmentEditor`

- [ ] Replace the entire `FinalAssessmentEditor` function (L439–464) with:

```javascript
function FinalAssessmentEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initFinalAssessment(section); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildFinalAssessmentPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Verdict', value: state.verdict, multiline: true, onChange: function (v) { set('verdict', v); } }),
    React.createElement(TextField, { label: 'Closing Line', value: state.closingLine, onChange: function (v) { set('closingLine', v); } }),
    React.createElement(TextField, { label: 'Accusation Handling (optional)', value: state.accusationHandling, multiline: true, onChange: function (v) { set('accusationHandling', v); } }),
    actionsRow(handleSave, onCancel)
  );
}
```

### 6.7 Verify + commit

- [ ] Syntax-check: `cd reports` then `node --check console/components/checkpoints/Outline.js` → expect no output.
- [ ] Re-run the detective logic tests: `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -t "detective" -v` → expect all PASS.
- [ ] Commit: from repo root `git add reports/console/components/checkpoints/Outline.js` then
  `git commit -m "refactor(console): rebuild detective editors on shared widgets and pure builders"`

---

## Task 7 — Robust reset-key fix in Outline.js AND Article.js (B5)

Replace the colliding `safeStringify(x).slice(0,100)` dataKey with `EditLogic.computeResetKey(x, revisionCount)` in BOTH components. `computeResetKey` is already unit-tested (Task 1). Article.js must import the logic module the same way Outline does.

**Files:**
- **MODIFY** `reports/console/components/checkpoints/Outline.js` (dataKey at L487)
- **MODIFY** `reports/console/components/checkpoints/Article.js` (import at L13; dataKey at L621)

### 7.1 Outline.js dataKey

- [ ] In `Outline.js`, replace the dataKey line (L487):

```javascript
const dataKey = safeStringify(outline).slice(0, 100);
```

with (`revisionCount` is already in scope, verified L471):

```javascript
const dataKey = EditLogic.computeResetKey(outline, revisionCount);
```

### 7.2 Article.js: add the logic-module import + replace dataKey

- [ ] In `Article.js`, the destructure (verified L13) is `const { Badge, CollapsibleSection, safeStringify, editBtn } = window.Console.utils;`. Add the logic module on the line below it (do NOT remove the existing names — Article uses them):

```javascript
const ArticleEditLogic = window.Console.outlineEditLogic;
```

- [ ] Replace the Article dataKey line (verified L621):

```javascript
const dataKey = safeStringify(contentBundle).slice(0, 100);
```

with (`revisionCount` already in scope, verified L596):

```javascript
const dataKey = ArticleEditLogic.computeResetKey(contentBundle, revisionCount);
```

> Article.js loads after `outline-edit-logic.js` (the new script tag is inserted before BOTH Outline.js line 35 and Article.js line 36 in Task 9.1), so `window.Console.outlineEditLogic` is defined when Article's module-scope destructure runs. Ensure the Task-9.1 index.html change is done before relying on Article at runtime; the load-order is enforced by placing the new script before Outline.js (which precedes Article.js).

### 7.3 Verify + commit

- [ ] Confirm no `slice(0, 100)` dataKey remains: `cd reports` then Grep `slice(0, 100)` in `console/components/checkpoints/Outline.js` and `console/components/checkpoints/Article.js`. Expect ZERO matches in both.
- [ ] Syntax-check both: `cd reports` then `node --check console/components/checkpoints/Outline.js` and `node --check console/components/checkpoints/Article.js` → expect no output.
- [ ] Re-run the logic suite (computeResetKey): `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -t "computeResetKey" -v` → expect PASS.
- [ ] Commit: from repo root `git add reports/console/components/checkpoints/Outline.js reports/console/components/checkpoints/Article.js` then
  `git commit -m "fix(console): replace truncating dataKey with collision-free computeResetKey (B5)"`

---

## Task 8 — `handleJsonApprove` SAVE_PENDING_EDITS in Outline.js AND Article.js (B6)

Add the missing `SAVE_PENDING_EDITS` dispatch to both JSON-approve paths so JSON-mode edits survive a processing-error remount, matching what each `handleApprove` already does. The Outline `handleJsonApprove` is further wrapped with a validation gate in Task 9 — Task 8.2's version is the intermediate dispatch-only form. (An implementer MAY skip Task 8.2 and go straight to Task 9.4's final form for Outline, but MUST still do Task 8.1 for Article.)

**Files:**
- **MODIFY** `reports/console/components/checkpoints/Outline.js` (`handleJsonApprove`, L576–584)
- **MODIFY** `reports/console/components/checkpoints/Article.js` (`handleJsonApprove`, L768–776)

### 8.1 Article.js handleJsonApprove (independent twin)

- [ ] Replace the Article `handleJsonApprove` (verified L768–776) with:

```javascript
  function handleJsonApprove() {
    try {
      var parsed = JSON.parse(jsonText);
      setJsonError('');
      if (dispatch) {
        dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'article', edits: parsed });
      }
      onApprove({ article: true, articleEdits: parsed });
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
    }
  }
```

### 8.2 Outline.js handleJsonApprove (dispatch only — validation added in Task 9)

- [ ] Replace the Outline `handleJsonApprove` (verified L576–584) with the dispatch-added version:

```javascript
  function handleJsonApprove() {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
      return;
    }
    setJsonError('');
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: parsed });
    }
    onApprove({ outline: true, outlineEdits: parsed });
  }
```

### 8.3 Verify + commit

- [ ] Confirm both JSON-approve handlers now dispatch SAVE_PENDING_EDITS: `cd reports` then Grep `SAVE_PENDING_EDITS` in `console/components/checkpoints/Outline.js` (expect 2 matches: `handleApprove` + `handleJsonApprove`) and in `console/components/checkpoints/Article.js` (expect 2 matches).
- [ ] Syntax-check both: `cd reports` then `node --check console/components/checkpoints/Outline.js` and `node --check console/components/checkpoints/Article.js` → expect no output.
- [ ] Commit: from repo root `git add reports/console/components/checkpoints/Outline.js reports/console/components/checkpoints/Article.js` then
  `git commit -m "fix(console): persist JSON-mode edits via SAVE_PENDING_EDITS in both checkpoints (B6)"`

---

## Task 9 — Client-side validation gate + inline error UI (decision #2, client half)

Wire `EditLogic.validateOutlineShape` into both Outline approve paths so a structurally-corrupt edit is blocked before it leaves the browser, with an inline `.validation-error` message. Insert the new `outline-edit-logic.js` script tag into `index.html`.

**Files:**
- **MODIFY** `reports/console/index.html` (add script tag after line 34 `RevisionDiff.js`, before line 35 `Outline.js`)
- **MODIFY** `reports/console/components/checkpoints/Outline.js` (add `editError` state; gate `handleApprove` + `handleJsonApprove`; render `editError`)

### 9.1 Add the script tag (load order)

- [ ] In `reports/console/index.html`, the verified load order has `RevisionDiff.js` on line 34 and `Outline.js` on line 35. Insert a new line BETWEEN them:

```html
  <script type="text/babel" src="components/RevisionDiff.js"></script>
  <script type="text/babel" src="outline-edit-logic.js"></script>
  <script type="text/babel" src="components/checkpoints/Outline.js"></script>
```

> The module is at `reports/console/outline-edit-logic.js`; relative to `index.html` (in `reports/console/`) the src is `outline-edit-logic.js`. It must load before BOTH `Outline.js` (line 35→36) and `Article.js` (line 36→37) so `window.Console.outlineEditLogic` exists at their module-scope destructures.

### 9.2 Add `editError` state

- [ ] In `Outline.js`, find the edit-state `useState` cluster (verified L477–484, ending with `const [feedbackText, setFeedbackText] = React.useState('');`). Add one line after it:

```javascript
  const [editError, setEditError] = React.useState('');
```

### 9.3 Gate `handleApprove`

- [ ] Replace `handleApprove` (verified L567–574) with the validating version:

```javascript
  function handleApprove() {
    if (hasEdits && editedOutline) {
      const themeForValidation = isDetective ? 'detective' : 'journalist';
      const result = EditLogic.validateOutlineShape(editedOutline, themeForValidation);
      if (!result.valid) {
        setEditError('Cannot approve — edited outline is invalid: ' +
          result.errors.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
        return;
      }
      setEditError('');
      if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: editedOutline });
      onApprove({ outline: true, outlineEdits: editedOutline });
    } else {
      onApprove({ outline: true });
    }
  }
```

### 9.4 Gate `handleJsonApprove` (final form, extends Task 8.2)

- [ ] Replace `handleJsonApprove` (the Task-8.2 version) with the validating version:

```javascript
  function handleJsonApprove() {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
      return;
    }
    const themeForValidation = isDetective ? 'detective' : 'journalist';
    const result = EditLogic.validateOutlineShape(parsed, themeForValidation);
    if (!result.valid) {
      setJsonError('Outline is invalid: ' +
        result.errors.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
      return;
    }
    setJsonError('');
    if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: parsed });
    onApprove({ outline: true, outlineEdits: parsed });
  }
```

### 9.5 Render the `editError` message above the action buttons

- [ ] In the main render tree, locate the action-mode button block (verified L1100–1117, `React.createElement('div', { className: 'action-modes mt-md' }, …)`). Immediately BEFORE that `div` (as a preceding sibling array element), add the conditional error paragraph using the real `.validation-error` class (verified at console.css:1349):

```javascript
    editError && React.createElement('p', { className: 'validation-error', role: 'alert' }, editError),
```

> The JSON-mode error already renders via `jsonError && React.createElement('p', { className: 'validation-error' }, jsonError)` (verified L1129) — that element now also carries the JSON-path validation message, so no new markup is needed for the JSON path.

### 9.6 Verify + commit

- [ ] Syntax-check: `cd reports` then `node --check console/components/checkpoints/Outline.js` → expect no output.
- [ ] Confirm the script tag exists and is correctly ordered: `cd reports` then Grep `outline-edit-logic.js` in `console/index.html`. Expect 1 match, between `RevisionDiff.js` and `components/checkpoints/Outline.js`.
- [ ] Re-run the client-validator tests: `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js -t "validateOutlineShape" -v` → expect all PASS.
- [ ] Commit: from repo root `git add reports/console/index.html reports/console/components/checkpoints/Outline.js` then
  `git commit -m "feat(console): block invalid outline edits client-side with inline validation error"`

---

## Task 10 — Server-side validation in buildResumePayload + tests (decision #2, server half / B7)

Activate the already-registered Ajv `SchemaValidator` in `buildResumePayload`. Reject corrupt `outlineEdits` with an HTTP-400 `error` string (which the console already surfaces in `.error-banner__message` via the existing `response.error` → `SET_ERROR` path — no console api/app changes needed). TDD: write the new/rewritten tests first (they FAIL against current server behavior), then implement.

**Files:**
- **MODIFY** `reports/__tests__/unit/server-build-resume-payload.test.js` (rewrite + add tests)
- **MODIFY** `reports/server.js` (module-scope validator; signature; outline block; call sites)

### 10.1 Rewrite the test file FIRST (RED)

- [ ] Replace the ENTIRE contents of `reports/__tests__/unit/server-build-resume-payload.test.js` with the version below. It uses complete valid fixtures and exercises the validation gate. Against the current (un-validated) server, the negative tests FAIL (corrupt outlines are applied, so `result.error` is null and `stateUpdates.outline` is set) — the correct RED state.

```javascript
/**
 * buildResumePayload Unit Tests
 *
 * Covers outline approval/rejection routing AND schema validation of outlineEdits.
 */
const { buildResumePayload } = require('../../server.js');

function validJournalistOutline() {
  return {
    lede: {
      hook: 'A party ends with one guest dead and a room full of liars.',
      keyTension: 'The room accused the wrong person.',
      primaryArc: 'The Blackwood embezzlement'
    },
    theStory: {
      arcInterweaving: {
        interleavingPlan: 'Open on the accusation, braid the money trail through it.',
        convergencePoint: 'The shell-account ledger names the real culprit.'
      },
      arcs: [
        { name: 'The embezzlement', paragraphCount: 3 }
      ]
    },
    followTheMoney: {
      arcConnections: [
        { arcName: 'The embezzlement', financialAngle: 'Funds routed through three shells.' }
      ]
    },
    thePlayers: {
      arcConnections: [
        { arcName: 'The embezzlement', characterAngle: 'Sarah controlled the accounts.' }
      ]
    },
    whatsMissing: {
      arcConnections: [
        { arcName: 'The embezzlement', openQuestion: 'Who signed the final transfer?' }
      ]
    },
    closing: {
      arcResolutions: [
        { arcName: 'The embezzlement', resolution: 'The ledger settles it.' }
      ]
    }
  };
}

function validDetectiveOutline() {
  return {
    executiveSummary: {
      hook: 'One body, six suspects, a paper trail.',
      caseOverview: 'Victim found at the Blackwood estate after the party.',
      primaryFindings: ['Funds were diverted.', 'The accused had no access.']
    },
    evidenceLocker: {
      evidenceGroups: [
        { theme: 'Financial', evidenceIds: ['rfid-001'], synthesis: 'Transfers cluster on one account.' }
      ]
    },
    suspectNetwork: {
      assessments: [
        { name: 'Sarah Blackwood', role: 'CFO', suspicionLevel: 'high' }
      ]
    },
    outstandingQuestions: {
      questions: ['Who authorized the final transfer?']
    },
    finalAssessment: {
      verdict: 'Evidence points to Sarah, not the accused.',
      closingLine: 'The ledger never lies; people do.'
    }
  };
}

describe('buildResumePayload — outlineEdits validation', () => {
  it('applies a structurally-valid journalist outline (no theme arg → defaults journalist)', () => {
    const edits = validJournalistOutline();
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toEqual(edits);
  });

  it('rejects a corrupt journalist outline (B1: arcConnections as a string) and does NOT apply it', () => {
    const edits = validJournalistOutline();
    edits.followTheMoney.arcConnections = 'Funds routed through three shells.';
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (outline)'));
    expect(result.error).toEqual(expect.stringContaining('/followTheMoney/arcConnections'));
    expect(result.stateUpdates.outline).toBeUndefined();
  });

  it('rejects a journalist outline missing required lede.primaryArc (B2)', () => {
    const edits = validJournalistOutline();
    delete edits.lede.primaryArc;
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (outline)'));
    expect(result.error).toEqual(expect.stringContaining('primaryArc'));
    expect(result.stateUpdates.outline).toBeUndefined();
  });

  it('rejects a journalist outline with a stray root pullQuotes key (B4)', () => {
    const edits = validJournalistOutline();
    edits.pullQuotes = [{ type: 'verbatim', text: 'quote' }];
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (outline)'));
    expect(result.stateUpdates.outline).toBeUndefined();
  });

  it('applies a structurally-valid detective outline when theme is detective', () => {
    const edits = validDetectiveOutline();
    const result = buildResumePayload({ outline: true, outlineEdits: edits }, {}, 'detective');
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toEqual(edits);
  });

  it('reads theme from currentState.theme when no explicit theme arg is passed', () => {
    const edits = validDetectiveOutline();
    const result = buildResumePayload({ outline: true, outlineEdits: edits }, { theme: 'detective' });
    expect(result.error).toBeNull();
    expect(result.stateUpdates.outline).toEqual(edits);
  });

  it('rejects a corrupt detective outline (assessments as a string)', () => {
    const edits = validDetectiveOutline();
    edits.suspectNetwork.assessments = 'Sarah is the prime suspect.';
    const result = buildResumePayload({ outline: true, outlineEdits: edits }, {}, 'detective');
    expect(result.error).toEqual(expect.stringContaining('failed schema validation (detective-outline)'));
    expect(result.error).toEqual(expect.stringContaining('/suspectNetwork/assessments'));
    expect(result.stateUpdates.outline).toBeUndefined();
  });
});

describe('buildResumePayload — outlineEdits routing (regression, validation active)', () => {
  it('routes a complete valid outline into stateUpdates.outline when outline:true', () => {
    const edits = validJournalistOutline();
    const result = buildResumePayload({ outline: true, outlineEdits: edits });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toEqual(edits);
  });

  it('does not include outlineEdits when outline:false (rejection)', () => {
    const result = buildResumePayload({
      outline: false,
      outlineFeedback: 'needs more detail',
      outlineEdits: { lede: { hook: 'should not be applied' } }
    });
    expect(result.resume.approved).toBe(false);
    expect(result.stateUpdates.outline).toBeUndefined();
    expect(result.stateUpdates._outlineFeedback).toBe('needs more detail');
  });

  it('approves without edits when outlineEdits is omitted', () => {
    const result = buildResumePayload({ outline: true });
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toBeUndefined();
  });
});
```

- [ ] Run the test, expecting FAIL on the negatives: `cd reports` then `npx jest __tests__/unit/server-build-resume-payload.test.js -v`
  - Expected RED: the four "rejects …" tests FAIL (e.g. `expect(received).toEqual(expect.stringContaining(...))` with `received` = `null`; and `expect(result.stateUpdates.outline).toBeUndefined()` fails because the corrupt edit was applied). The positive/routing tests PASS. Confirms the gate is not yet active.

### 10.2 Implement the server gate (GREEN)

- [ ] In `reports/server.js`, add the module-scope validator after the existing requires near the top (a single instance reuses Ajv's compiled validators):

```javascript
const { SchemaValidator } = require('./lib/schema-validator');
const outlineValidator = new SchemaValidator();
```

- [ ] Change the `buildResumePayload` signature (verified L134) to add the 3rd `theme` param:

```javascript
function buildResumePayload(approvals, currentState = {}, theme = (currentState.theme || 'journalist')) {
```

- [ ] Replace the outline-approval block (verified L199–210) with the validating version:

```javascript
    // Outline: approve, approve-with-edits, or reject-with-feedback
    if (approvals.outline === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.outlineEdits && typeof approvals.outlineEdits === 'object') {
            const schemaName = theme === 'detective' ? 'detective-outline' : 'outline';
            const { valid, errors } = outlineValidator.validate(schemaName, approvals.outlineEdits);
            if (!valid) {
                const detail = (errors || [])
                    .map(function (e) { return (e.path || '/') + ' ' + e.message; })
                    .join('; ');
                error = 'Edited outline failed schema validation (' + schemaName + '): ' + detail;
                return { resume, stateUpdates, error };
            }
            stateUpdates.outline = approvals.outlineEdits;
        }
    } else if (approvals.outline === false && typeof approvals.outlineFeedback === 'string' && approvals.outlineFeedback.trim()) {
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.outlineFeedback.trim();
        stateUpdates._outlineFeedback = approvals.outlineFeedback.trim();
    }
```

- [ ] Update the `/approve` call site (verified L947) to pass the already-resolved `theme` explicitly:

```javascript
        const { resume, stateUpdates, error: validationError } = buildResumePayload(approvals, graphState.values, theme);
```

- [ ] Update the `/generate` call site (verified L547) to pass the body `theme` explicitly (it is in scope at L508/L514):

```javascript
            const { stateUpdates, error: validationError } = buildResumePayload(approvals, {}, theme);
```

### 10.3 Verify + commit

- [ ] Run the server test, expecting PASS: `cd reports` then `npx jest __tests__/unit/server-build-resume-payload.test.js -v`
  - Expected GREEN: all tests pass — positive applies; negatives rejected with the failing path in the `error` string and `stateUpdates.outline` undefined; detective via both explicit-arg and `currentState.theme`.
- [ ] Syntax-check: `cd reports` then `node --check server.js` → expect no output.
- [ ] Commit: from repo root `git add reports/server.js reports/__tests__/unit/server-build-resume-payload.test.js` then
  `git commit -m "feat(server): validate edited outlines against theme schema in buildResumePayload (B7)"`

---

## Task 11 — Remove unused `renderListEditForm` / `renderTextEditForm` / dead code (decision #4)

Two pairs of helpers in `utils.js` are dead after the refactor and must be removed (definitions + registration entries):

- **`renderListEditForm` / `ListEditForm`** — ZERO call sites across `reports/console/*.js` even before this work (the only would-be consumer was the dead Outline.js L14 destructure entry, dropped in Task 2.2).
- **`renderTextEditForm` / `TextEditForm`** — used ONLY by `Outline.js` (the L14 destructure + the single ~L672 interweaving call). Task 4 removed BOTH (the call in 4.4, the destructure entry in 4.5), so after Task 4 they have ZERO call sites anywhere in `reports/console/` — fully dead, exactly like `renderListEditForm`.

Verified across the feature branch: `renderTextEditForm`/`TextEditForm` appear only in `Outline.js` and `utils.js`; `CollapsibleSection` appears in many components (`CheckpointShell.js`, `ProgressStream.js`, `RollbackPanel.js`, `SessionStart.js`, `Article.js`, `EvidenceBundle.js`, `InputReview.js`, `PreCuration.js`) — so KEEP `CollapsibleSection`, REMOVE both dead pairs. Also remove `ObjectEditor` from Outline.js if it ended up with zero call sites.

**Files:**
- **MODIFY** `reports/console/utils.js`
- **MODIFY** `reports/console/components/checkpoints/Outline.js` (only if `ObjectEditor` is unused)

### 11.1 Confirm call sites before removal

- [ ] Confirm `renderListEditForm` and `ListEditForm` have no callers outside utils.js: `cd reports` then Grep `renderListEditForm` and `ListEditForm` across `console/`. Expect matches ONLY in `console/utils.js`. If any other file references them, STOP — investigate.
- [ ] Confirm `renderTextEditForm` and `TextEditForm` are now dead (Task 4 removed their last use): `cd reports` then Grep `renderTextEditForm` and `TextEditForm` across `console/`. Expect matches ONLY in `console/utils.js` (the definitions + registration). If `Outline.js` (or any other file) still references them, STOP — Task 4.4/4.5 was not completed; finish it before removing the helpers.
- [ ] Confirm `CollapsibleSection` IS still used elsewhere (it must NOT be removed): `cd reports` then Grep `CollapsibleSection` across `console/`. Expect matches in files OTHER than utils.js (e.g. `CheckpointShell.js`, `ProgressStream.js`, `Article.js`, `EvidenceBundle.js`, `InputReview.js`, `PreCuration.js`, `RollbackPanel.js`, `SessionStart.js`). Keep `CollapsibleSection`.

### 11.2 Remove the definitions + registration

- [ ] In `reports/console/utils.js`, DELETE the `ListEditForm` function (~L157) and the `renderListEditForm` factory (~L216).
- [ ] In `reports/console/utils.js`, DELETE the `TextEditForm` function (~L123) and the `renderTextEditForm` factory (~L148) — both are now dead (Task 4 removed their only caller).
- [ ] In the `window.Console.utils = { ... }` registration object (verified utils.js:239), REMOVE four entries: `ListEditForm,`, `renderListEditForm,`, `TextEditForm,`, and `renderTextEditForm,`. The surviving registration must be exactly: `{ truncate, safeStringify, Badge, CollapsibleSection, JsonViewer, formatElapsed, editBtn, CHECKPOINT_ORDER, CHECKPOINT_LABELS }`. (`CollapsibleSection` stays — it is used by many other components.)

### 11.3 Remove `ObjectEditor` if unused

- [ ] Check whether `ObjectEditor` (added in Task 2.3) has any call sites: `cd reports` then Grep `ObjectEditor` in `console/components/checkpoints/Outline.js`. If the only match is its definition (no `React.createElement(ObjectEditor` call), DELETE the `ObjectEditor` function. If it is used, keep it.

### 11.4 Verify + commit

- [ ] Confirm the dead symbols are gone: `cd reports` then Grep `renderListEditForm`, `ListEditForm`, `renderTextEditForm`, and `TextEditForm` across `console/`. Expect ZERO matches anywhere for all four.
- [ ] Confirm `CollapsibleSection` is still present and used: `cd reports` then Grep `CollapsibleSection` across `console/`. Expect matches in `console/utils.js` (definition + registration) AND several other components. It must NOT be zero.
- [ ] Syntax-check the touched files: `cd reports` then `node --check console/utils.js` and `node --check console/components/checkpoints/Outline.js` → expect no output.
- [ ] Commit: from repo root `git add reports/console/utils.js reports/console/components/checkpoints/Outline.js` then
  `git commit -m "chore(console): remove unused renderListEditForm/renderTextEditForm and dead widgets"`

---

## Task 12 — Final verification: full suite, node smoke test, syntax checks, manual click-through

No DOM test harness exists, so component behavior is verified by (a) the pure-logic suite proving every save shape, (b) a scripted Node smoke test exercising the full init→build→merge→validate round-trip, (c) `node --check` on every changed console file, (d) a manual console click-through covering each section in both themes.

> **Wiring is not automatically tested — Task 12.4 is load-bearing, not optional.** By design (no jsdom/React harness), the COMPONENT-WIRING tasks (3, 4, 6, 7, 8, 9) commit "green" on only two gates: `node --check` (syntax) and a re-run of the unchanged pure-logic suite. Neither proves the React wiring is correct — that a pencil opens the right editor, that an editor's `onSave` routes through the right builder, that a widget is actually rendered. A wiring regression (e.g. a dropped `editBtn`, a mis-keyed `isEditing`, an editor wired to the wrong `saveSectionEdit` key) will pass Tasks 3–9 silently and is caught ONLY by the manual click-through in Task 12.4. Therefore Task 12.4 MUST be performed in full before declaring the branch merge-ready; skipping it forfeits the "zero-bug" guarantee for everything except the pure logic and the server gate. Do not mark this plan complete on a green Jest run alone.

**Files:**
- **CREATE (temporary, NOT committed)** `reports/.smoke/outline-smoke.js` + two JSON fixtures — throwaway; delete after running. Use `.smoke/` so it is outside `__tests__/` and not matched by jest's testMatch.

### 12.1 Full automated suite

- [ ] Run the entire Jest suite to confirm nothing regressed: `cd reports` then `npx jest`
  - Expected: all suites pass, including `__tests__/unit/outline-edit-logic.test.js` and `__tests__/unit/server-build-resume-payload.test.js`. Zero failures. If a PRE-EXISTING suite was already failing on the branch before this work, note it but do not let it block; re-run just the two suites this plan owns:
  - `cd reports` then `npx jest __tests__/unit/outline-edit-logic.test.js __tests__/unit/server-build-resume-payload.test.js -v` → expect all PASS.

### 12.2 Scripted Node smoke test (full module round-trip)

- [ ] Create `reports/.smoke/outline-smoke.js` with:

```javascript
const L = require('../console/outline-edit-logic.js');
const { SchemaValidator } = require('../lib/schema-validator');
const v = new SchemaValidator();
const validate = (n, d) => v.validate(n, d);

let j = require('./fixtures-journalist.json');
j = L.mergeSection(j, 'lede', L.buildLedePayload(Object.assign(L.initLede(j.lede), { hook: 'edited' }), j.lede));
j = L.mergeArcInterweaving(j, L.buildArcInterweavingPayload(Object.assign(L.initArcInterweaving(j.theStory.arcInterweaving), { convergencePoint: 'edited' }), j.theStory.arcInterweaving));
j = L.mergeArc(j, 0, L.buildArcPayload(Object.assign(L.initArc(j.theStory.arcs[0]), { paragraphCount: '4' }), j.theStory.arcs[0]));
j = L.mergeSection(j, 'followTheMoney', L.buildFollowTheMoneyPayload(L.initFollowTheMoney(j.followTheMoney), j.followTheMoney));
j = L.mergeSection(j, 'thePlayers', L.buildThePlayersPayload(L.initThePlayers(j.thePlayers), j.thePlayers));
j = L.mergeSection(j, 'whatsMissing', L.buildWhatsMissingPayload(L.initWhatsMissing(j.whatsMissing), j.whatsMissing));
j = L.mergeSection(j, 'closing', L.buildClosingPayload(L.initClosing(j.closing), j.closing));
const jr = validate('outline', j);
console.log('JOURNALIST valid:', jr.valid, jr.errors || '');

let d = require('./fixtures-detective.json');
d = L.mergeSection(d, 'executiveSummary', L.buildExecutiveSummaryPayload(L.initExecutiveSummary(d.executiveSummary), d.executiveSummary));
d = L.mergeSection(d, 'evidenceLocker', L.buildEvidenceLockerPayload(L.initEvidenceLocker(d.evidenceLocker), d.evidenceLocker));
d = L.mergeSection(d, 'suspectNetwork', L.buildSuspectNetworkPayload(L.initSuspectNetwork(d.suspectNetwork), d.suspectNetwork));
d = L.mergeSection(d, 'outstandingQuestions', L.buildOutstandingQuestionsPayload(L.initOutstandingQuestions(d.outstandingQuestions), d.outstandingQuestions));
d = L.mergeSection(d, 'finalAssessment', L.buildFinalAssessmentPayload(L.initFinalAssessment(d.finalAssessment), d.finalAssessment));
const dr = validate('detective-outline', d);
console.log('DETECTIVE valid:', dr.valid, dr.errors || '');

if (!jr.valid || !dr.valid) { process.exit(1); }
console.log('SMOKE OK');
```

- [ ] Create `reports/.smoke/fixtures-journalist.json` and `reports/.smoke/fixtures-detective.json` by copying the `validJournalistOutline()` / `validDetectiveOutline()` object bodies from `reports/__tests__/unit/outline-edit-logic.test.js` (the full versions WITH `evidenceCards`/`photoPlacement`/`callbackOpportunities`/`characterHighlights` for journalist, WITH `memoryAnalysis`/`keyRelationships` for detective) as JSON.
- [ ] Run it: `cd reports` then `node .smoke/outline-smoke.js`
  - Expected output: `JOURNALIST valid: true` , `DETECTIVE valid: true` , `SMOKE OK`. Exit code 0.
- [ ] Delete the smoke dir (do NOT commit): `cd reports` then remove `.smoke/` (PowerShell: `Remove-Item -Recurse -Force .smoke`).

### 12.3 Syntax-check every changed console file

- [ ] Run `node --check` on each changed file, expecting no output for any:
  - `cd reports` then `node --check console/outline-edit-logic.js`
  - `cd reports` then `node --check console/components/checkpoints/Outline.js`
  - `cd reports` then `node --check console/components/checkpoints/Article.js`
  - `cd reports` then `node --check console/utils.js`
  - `cd reports` then `node --check server.js`

### 12.4 Manual console click-through (live server)

- [ ] Start the server: `cd reports` then `npm start` (serves `http://localhost:3001/console`).
- [ ] Open `http://localhost:3001/console`, authenticate, and resume/start a JOURNALIST session to the `outline` checkpoint (e.g. `node scripts/e2e-walkthrough.js --session <id>` per CLAUDE.md, or load a session known to be at the outline checkpoint).
- [ ] For EACH journalist section, click the pencil, edit one field, Save, confirm the summary updates and no console error appears:
  - [ ] LEDE — edit Hook; confirm Primary Arc shows as a field and is NOT lost on Save.
  - [ ] THE STORY — edit an arc's Paragraph Count to a number; confirm the Arc Interweaving read-only row shows a pencil edit button, click it (this proves the affordance from Task 4.4 is present and reachable), then edit Arc Interweaving's Interleaving Plan + Convergence Point (two fields, NOT a raw JSON blob) and Save. If no pencil appears next to Arc Interweaving, STOP — the Task 4.4 read-only branch dropped its `editBtn`; re-add it before continuing.
  - [ ] FOLLOW THE MONEY — edit an Arc Connection's Financial Angle; edit a Shell Account's Total to a currency string like `$1.2M` and confirm it is accepted.
  - [ ] THE PLAYERS — edit an Arc Connection; add a Pull Quote (Type dropdown + Text); add a Character Highlight key/value pair.
  - [ ] WHAT'S MISSING — edit an Open Question.
  - [ ] CLOSING — edit a Resolution (object-array row, NOT a single textarea).
- [ ] Click **Approve** (structured edits): confirm it proceeds (no `.validation-error` shown) and the workflow advances.
- [ ] Negative client gate: enter **Edit & Approve** (JSON mode), corrupt the outline (e.g. set `"followTheMoney": { "arcConnections": "x" }`), click **Save & Approve** → confirm an inline `.validation-error` appears and submit is BLOCKED (workflow does not advance).
- [ ] Repeat the section-edit + Approve pass for a DETECTIVE session (Executive Summary, Evidence Locker, Memory Analysis if present, Suspect Network incl. Suspicion Level dropdown, Outstanding Questions, Final Assessment). Confirm a session WITHOUT `memoryAnalysis` does not render/emit that section.
- [ ] Stop the server.

### 12.5 Branch-merge sanity + final commit

- [ ] Dry-check the merge into main (do NOT leave a merge in progress): from repo root `git merge --no-commit --no-ff main`; if it reports "Already up to date" or a clean merge, immediately `git merge --abort`. If conflicts appear, resolve or `git merge --abort` and investigate.
- [ ] Confirm working tree has no stray files (the `.smoke/` dir was deleted): from repo root `git status --short` → expect only intended tracked changes already committed, plus pre-existing untracked report/image files.
- [ ] If any uncommitted verification changes remain, commit: from repo root `git add -A` then `git commit -m "test(console): verification pass for outline rich-editor fixes"` (only if there is something to commit).

---

## Bug → Task traceability

| Bug | Description | Fixed in |
|-----|-------------|----------|
| B1 | `NamedSectionEditor` collapses arcConnections array → string; mangles shellAccounts/characterHighlights | Task 1 (builders) + Task 3 (editors) |
| B2 / N4 | `LedeEditor` drops required `primaryArc`; emits bare object | Task 1 (`buildLedePayload`) + Task 3.1 |
| B3 | `saveInterweaving` flattens `theStory.arcInterweaving` object → string | Task 1 (`buildArcInterweavingPayload` / `mergeArcInterweaving`) + Task 4 |
| B4 | Pull-quotes wired to nonexistent root `pullQuotes`; wrong fields (`placement`, missing `type`) | Task 1 (`buildThePlayersPayload`) + Task 3.3/3.6/3.7 + Task 5 |
| B-closing | `ClosingEditor` edits `arcResolutions` array as scalar | Task 1 (`buildClosingPayload`) + Task 3.5 |
| B5 | `dataKey = safeStringify(x).slice(0,100)` collides across revisions (Outline + Article) | Task 1 (`computeResetKey`) + Task 7 |
| B6 | `handleJsonApprove` omits `SAVE_PENDING_EDITS` (Outline + Article) | Task 8 (+ Task 9 for Outline's validating form) |
| B7 | No client- or server-side re-validation of edited outlines | Task 9 (client) + Task 10 (server) |
| N1 | `ArcOutlineEditor` emits stray `keyPoints`; stringifies `photoPlacement` | Task 1 (`buildArcPayload`) + Task 4.1 |
| N2 | `NamedSectionEditor` sprays cross-section stray fields on every save | Task 1 (builders emit only documented keys) + Task 3 |
| N3 | `saveTheStoryArc`/`saveInterweaving` seed `arcInterweaving:''` (string) when theStory absent | Task 1 (`mergeArc`/`mergeArcInterweaving`) + Task 4.3 |
| Decision #4 | Consolidate ~11 editors; remove unused `renderListEditForm` + `renderTextEditForm` (and their backers) | Tasks 2, 3, 4, 6 (consolidation) + Task 11 (removal) |
