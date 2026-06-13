# ALN Report Pipeline — Correctness Review (Bugs & Data-Wiring Defects)

Scope: lib/workflow/{graph,state}.js, lib/workflow/nodes/*, lib/llm/*, lib/evidence-preprocessor.js, lib/image-preprocessor.js, lib/template-*, templates/*, server.js, lib/api-helpers.js.

Severity: P0 = corrupts model input/output or evidence boundary; P1 = data loss / wrong content reaches gen; P2 = degradation / fragile; P3 = latent/cosmetic-adjacent. Status: [CONFIRMED] by code reading vs [RUNTIME] needs runtime verification.

---

## P0 — Highest impact (explains known symptoms)

### P0-1. generateOutline maps photo analyses to photos by ARRAY INDEX against a *filtered* list → photo/caption mismatch [CONFIRMED]
File: lib/workflow/nodes/ai-nodes.js:889-902 (`generateOutline`, building `availablePhotos`).
```js
const availablePhotos = (state.sessionPhotos || [])
  .filter(photo => getPhotoFilename(photo) !== heroImage)        // removes hero
  .filter(photo => !whiteboardFilename || ... !== whiteboardFilename)  // removes whiteboard
  .map((photoPath, i) => {
    const filename = getPhotoFilename(photoPath) || `photo-${i}.jpg`;
    const analysis = state.photoAnalyses?.analyses?.[i] || {};   // <-- BUG: index i into UNFILTERED analyses
    return { filename, ..., characters: analysis.characterDescriptions?... , visualContent: analysis.visualContent || '' };
  });
```
Failure: `availablePhotos` is built from `sessionPhotos` after filtering out the hero and whiteboard, but `analysis` is looked up by the *post-filter* index `i` into `state.photoAnalyses.analyses` (which is aligned to the *unfiltered* `sessionPhotos`). Once the hero (and/or whiteboard) is removed, every remaining photo's index is shifted, so each photo gets the WRONG analysis — characters and visualContent from a different image. This feeds the outline prompt photo descriptions attached to the wrong filename → caption/character mismatch in the article. This is a direct cause of the "photo/caption mismatch" symptom.
Note the SAME function does it correctly for hero selection at 868-876 (looks up `analyses.find(a => a.filename === filename)`). The `availablePhotos` block should use the same filename-keyed `.find`, not `[i]`.
Fix: `const analysis = (state.photoAnalyses?.analyses || []).find(a => a.filename === filename) || {};`

### P0-2. tagTokenDispositions re-buries ALL tokens (incl. exposed) on transient file-read failure → evidence-boundary over-restriction / lost exposed content [CONFIRMED]
File: lib/workflow/nodes/fetch-nodes.js:392-400.
```js
} catch (err) {
  console.log('[tagTokenDispositions] No orchestrator-parsed.json found, all tokens default to buried');
  const buriedTokens = state.memoryTokens.map(token => ({ ...token, disposition: 'buried' }));
  return { memoryTokens: buriedTokens };
}
```
Failure: This node runs AFTER parseRawInput writes orchestrator-parsed.json, and unconditionally re-tags. If the read throws for ANY reason (transient FS error, race, permissions) — not just "missing file" — every token is forced to `disposition:'buried'`, clobbering the correct `exposed` tags set by fetchMemoryTokens. Buried tokens contribute only amounts/accounts and their full content is withheld, so exposed memories vanish from the article entirely. Even in the happy path, this design means the exposed/buried split has a single point of failure with a silent, content-suppressing fallback.
Fix: On read failure, preserve existing dispositions — return `{}` (no-op) rather than re-burying. Only default tokens that have no disposition yet.

### P0-3. Disposition default = 'buried' for any token not in either list; unknownCount hardcoded 0 hides misclassification [CONFIRMED]
File: lib/workflow/nodes/fetch-nodes.js:102-110 (`tagTokensWithDisposition`).
```js
// Tokens not in either list ... effectively buried
return { ...token, disposition: 'buried' };
...
return { taggedTokens, exposedCount, buriedCount, unknownCount: 0 };
```
Failure: If parseRawInput's Step 2 (session-report parse) drops/garbles an exposed token ID (Sonnet table parse is fuzzy), that token silently becomes `buried`: its content is suppressed from the report. `unknownCount: 0` is hardcoded so logs never reveal the misclassification. Combined with the lowercase-ID matching in fetchMemoryTokens (line 85, `token.tokenId || token.id`) vs orchestrator IDs, any ID-format drift buries exposed evidence.
Fix: Track a true unknown bucket and log loudly when a fetched token matches neither list; treat unknown as a distinct disposition (not silently buried) so the pre-curation checkpoint surfaces it.

### P0-4. evaluateArcs user prompt sends BURIED transaction amounts/accounts to the evaluator labeled for "verification" — and the arc-gen prompt likewise exposes them; risk of buried-pattern detail bleeding into arcs [CONFIRMED design risk / RUNTIME for actual leak]
File: lib/workflow/nodes/evaluator-nodes.js:607-650; arc-specialist-nodes.js:298-301.
Buried transactions are passed with `amount`, `shellAccount`, `time` (token identity stripped — good). This is within boundary rules (amounts/accounts are reportable). NOT a leak by itself. The real exposure is that the arc prompt SECTION 3 includes buried transactions inline; if the model conflates them with exposed evidence it can fabricate "whose" memory was buried. The boundary comment is present but relies entirely on model compliance. Flagging as the structural origin of "evidence-layer violation" symptoms — there is no programmatic post-check that arc summaries don't attribute buried content to a person.
Fix (defense-in-depth): add a programmatic scan of generated arc summaries/analysisNotes for buried-token attribution language tied to a character + amount, surfaced as a structural issue.

---

## P1 — Data loss / wrong content reaches generation

### P1-5. arcEvidencePackages is NEVER cleared by ANY rollback point → stale per-arc evidence/photos survive arc-selection & evidence rollbacks [CONFIRMED]
Files: lib/workflow/state.js ROLLBACK_CLEARS (838-936) — `arcEvidencePackages` absent from every list; ai-nodes.js:702-705 skip-logic `if (state.arcEvidencePackages?.length > 0) return skip`.
Failure: Rolling back to `arc-selection`, `evidence-and-photos`, `pre-curation`, etc. clears `selectedArcs`, `narrativeArcs`, `evidenceBundle` but leaves `arcEvidencePackages` populated. On replay, `buildArcEvidencePackages` sees a non-empty array and SKIPS, so outline/article generation consume per-arc evidence (fullContent, quotable excerpts, photos) built from the OLD arcs/evidence — fabricated/mismatched quotes and evidence cards keyed to arcs that no longer exist. Directly enables "fabricated facts" after a rollback.
Fix: Add `arcEvidencePackages` to ROLLBACK_CLEARS for `input-review`, `paper-evidence-selection`, `await-roster`, `character-ids`, `pre-curation`, `evidence-and-photos`, `arc-selection` (everything ≥ arc selection). Reset to `[]` (replaceReducer accepts null too).

### P1-6. Evidence-preprocessor silently DROPS model-omitted items (no length reconciliation) [CONFIRMED]
File: lib/evidence-preprocessor.js (~348-351). `const items = parsed.items || []; items.map(...)`.
Failure: Haiku batches of 8 under token pressure can return fewer items than submitted. Missing inputs are never emitted (no fallback, no error, success:true). Evidence items vanish before curation — including potentially exposed tokens. Item count silently shrinks.
Fix: Reconcile returned IDs against batch IDs; emit a fallback item (with original disposition + fullContent) for any missing ID and log a warning.

### P1-7. Evidence-preprocessor emits UNMATCHED model items un-enriched, bypassing the "use ORIGINAL disposition" safeguard [CONFIRMED — boundary risk]
File: lib/evidence-preprocessor.js (~352, 370). `const original = batch.find(b => b.id === item.id); ... if (!original) return item;`
Failure: If the model alters/hallucinates an `id`, `original` is undefined and the raw model item ships with no `rawData`, no `fullContent`, and whatever disposition the MODEL assigned — defeating the hard rule that buried tokens keep their original disposition. A buried token with a garbled id could ship as exposed → content-boundary leak.
Fix: Drop unmatched items or treat as batch failure; never emit model items whose id doesn't match an input.

### P1-8. fullContent fallback chain substitutes name/title (a label) for verbatim content; diverges from documented chain [CONFIRMED]
File: lib/evidence-preprocessor.js:172-182.
```js
const fullContent = rawData?.fullDescription || rawData?.content || rawData?.description
  || rawData?.text || rawData?.name || rawData?.title || '';
```
Documented chain (CLAUDE.md / node-helpers.extractFullContent) is `fullContent → fullDescription → content → description → summary`. Here `name`/`title` are appended as fallbacks and `summary` is omitted. If body fields are absent, `fullContent` becomes the token's NAME — and downstream article gen quotes `fullContent` verbatim, so a title gets quoted as if it were memory content (fabricated quote). node-helpers.extractFullContent (lines 309-320) is the canonical version and does NOT include name/title — the two diverge.
Fix: Reuse extractFullContent() here; drop name/title from the chain.

### P1-9. analyzePhotos: prompt build is OUTSIDE the per-photo try/catch → one prompt-build throw rejects Promise.all and discards ALL completed photo analyses [CONFIRMED]
File: lib/workflow/nodes/photo-nodes.js (analyzeSinglePhoto builds prompt before its try; analyzePhotos uses `Promise.all`).
Failure: analyzeSinglePhoto catches SDK errors and returns a placeholder, but `imagePromptBuilder.buildPhotoAnalysisPrompt(...)` is awaited before the try. A theme-loader/read failure there escapes, `Promise.all` rejects, outer catch returns `createEmptyPhotoAnalysisResult` and routes to ERROR — every successfully analyzed photo is lost.
Fix: Move prompt-build inside try; or use `Promise.allSettled` and map rejects to placeholders.

### P1-10. finalizePhotoAnalyses: unguarded Promise.all over enrichment with no node-level try/catch → one branch throw loses ALL enrichment + retried analyses [CONFIRMED]
File: lib/workflow/nodes/photo-nodes.js (`await Promise.all(enrichmentPromises)`; SDK branch has its own try but passthrough/excluded branches don't; no outer catch).
Failure: A throw in any non-SDK branch (malformed analysis) rejects the whole node; LangGraph errors out and no enriched photoAnalyses is returned, losing retried analyses too. Unlike analyzePhotos, there's not even a degrade path.
Fix: Wrap in try/catch with degradation or use allSettled.

### P1-11. Stale descriptionIndex after photo retry attaches wrong character name to a photo [RUNTIME]
File: lib/workflow/nodes/photo-nodes.js (enrichment uses `analysis.characterDescriptions?.[m.descriptionIndex]`; retried photos get fresh analyses with different description ordering).
Failure: characterIdMappings carry a `descriptionIndex` chosen against the analysis present at the character-ids checkpoint. If a photo is later retried, its `characterDescriptions` array is regenerated (different order/length), so the stored index now points to a different person → wrong name/caption. Low incidence (failed photos have empty descriptions, so mappings usually weren't authorable), but the fallback emits "Description #N → name" for an out-of-range index.
Fix: Invalidate/re-collect characterMappings for any retried photo, or key mappings by description text rather than index.

---

## P2 — Degradation / fragility

### P2-12. Detective content blocks render LLM prose through triple-stache → broken HTML on ordinary punctuation [CONFIRMED]
Files: templates/detective/partials/content-blocks/paragraph.hbs:1 `{{{text}}}`, quote.hbs:2 `{{{text}}}`, evidence-card.hbs:2 `{{{content}}}`, list.hbs:7 `{{{this}}}`.
Failure: Schema declares these as plain prose strings. Any `<`, `&`, `"` in model output (e.g. "Q&A", "<unknown> caller") breaks the DOM or injects markup. Journalist theme renders the identical fields with double-stache safely — the two themes diverge in correctness from the same data.
Fix: Change to `{{text}}` / `{{content}}` / `{{this}}` (match journalist partials).

### P2-13. pullQuotes computed into context but never rendered by any layout → entire content category silently dropped [CONFIRMED]
Files: template-assembler.js:341-342 (computes hasPullQuotes), templates/journalist/layouts/article.hbs (no reference to pullQuotes / sidebar/pull-quote), partials/sidebar/pull-quote.hbs exists but unused.
Failure: Pull quotes the model generates (generateContentBundle even logs a minPullQuotes warning) are discarded at render. generateContentBundle.js:1228 counts them and can trigger a revision loop demanding more pull quotes that will never appear in output — wasted revision cycles + missing content.
Fix: Render `{{#if hasPullQuotes}}{{#each pullQuotes}}{{> sidebar/pull-quote this}}{{/each}}{{/if}}` in the journalist layout, or remove the dead requirement.

### P2-14. Whole-batch failure in scorePaperEvidence/preprocessor degrades all 8 items even if only one failed [CONFIRMED]
Files: ai-nodes.js:228-242 (scorePaperEvidence catch returns whole batch as excluded scoringError); evidence-preprocessor.js (~378-410 fallbackItems on any batch throw).
Failure: One transient SDK hiccup excludes/degrades up to 8 evidence items. scorePaperEvidence has a single retry (good); preprocessor has none. Excluded items are rescuable at checkpoint, so recoverable, but quietly removes real evidence from the default path.

### P2-15. parseAmount zeroes/mis-parses messy amount strings → wrong financial bar widths (fallback path) [CONFIRMED, RUNTIME for frequency]
File: template-assembler.js:408-417 (`_calculateBarWidths`). Regex `^([\d.]+)([KkMmBb]?)$` only matches a clean number+suffix; "1.2M+", "1.2MM", ranges → `parseFloat` collapses (e.g. "1.2MM" → 1.2), skewing every normalized bar. Dominant path (shellAccounts present → overrideFinancialTracker regenerates clean "$N") is safe; only the LLM-data fallback is affected.
Fix: tolerant numeric extraction.

### P2-16. validateFinancialData uses strict !== equality on amounts → false mismatches; only validates entries whose name matches a shellAccount [CONFIRMED minor]
File: node-helpers.js:1000-1025. `if (actualAmount !== expectedTotal)`. Float/format coercion could yield spurious mismatches; entries with a name not in accountMap are skipped (continue), so a fabricated extra entry with a novel name is never flagged. Low risk but the financial-number-error symptom partly lives here: the check only catches WRONG amounts on KNOWN accounts, not invented accounts or invented entries.

### P2-17. LLM client: no Promise.race timeout; abort relies on SDK honoring signal mid-stream [RUNTIME]
File: lib/llm/client.js (timeout only via abortController.abort(); detection only if SDK throws). A genuinely-stuck call that never yields and never throws may block past the timeout — the exact case the timeout is meant to guard.
Fix: race the SDK iteration against a timeout promise that rejects.

### P2-18. structured-output text-fallback fence extraction takes only the FIRST ```fence; a schema-valid-but-wrong first block is accepted [CONFIRMED]
File: lib/llm/structured-output-extractor.js:77-86 (`text.match(/```.../)` no /g). If the model emits an example fenced block first, then the real answer, and the example passes the (often permissive) schema, the wrong object is returned. Loose schemas (e.g. only `items` required) make this and the brace-scan accept-first-valid behavior more likely.
Fix: iterate all fenced blocks (matchAll), validate each against the predicate before falling through.

---

## P3 — Latent / lower priority

- P3-19. ai-nodes.js validateArticle (1330-1387) still uses deprecated `voiceRevisionCount` and `state.sessionConfig?.roster?.map(p => p.name)` — if roster entries are strings, `.name` is undefined → roster coverage check sees `[undefined,...]`. [CONFIRMED] (Compare generateOutline which handles both string and object roster.) This node may be dead (validateContentBundle is the wired schema validator), but if invoked, roster coverage is broken for string rosters.
- P3-20. recoveredPhotos stat computed via array subtraction across reassigned `analyses` rather than the tracked `recovered` counter (photo-nodes.js ~932) — stat-only fragility. [CONFIRMED]
- P3-21. eachWithIndex helper passes `@index` as a context key, unreachable via `{{@index}}` (template-helpers.js:328-341). Currently unused. [CONFIRMED]
- P3-22. Detective layout references `hasPhotos` never set in buildContext (detective/layouts/article.hbs:35) — dead block, inert. [CONFIRMED]
- P3-23. image-preprocessor results.reduce/map over potentially-sparse array could throw if a limiter task throws before assignment, corrupting sessionPhotos (image-preprocessor.js ~252). [RUNTIME]
- P3-24. evidence-preprocessor post-validation field injection (shellAccount/transactionAmount/fullContent/rawData added after ITEM_SCHEMA validation) — final shape never schema-checked; false assurance. [CONFIRMED]

---

## Notes on areas checked and found OK
- Revision loops: incrementArc/Outline/ArticleRevision correctly preserve previous output into _previous* and clear the live field; reviseX restore from _previous* and clear feedback. The "feed stale article version" concern is mitigated: revise consumes _previousContentBundle, not a stale contentBundle. (ai-nodes.js 306-342, 976-1060, 1402-1491; graph.js 270-342.)
- routeAfterArcCheckpoint humanArcRevisionCount cap (graph.js 187-195) and incrementArcRevision human-vs-evaluator counting (270-299) are coherent.
- surfaceContradictions (contradiction-nodes.js) respects boundaries: matches roster names to ACCOUNT names (allowed), never token identity. OK.
- Hero image is NOT duplicated into inline photos array; captions stay bound to their photo object in the assembler (separate hero figure vs photos loop). Financial summation in overrideFinancialTracker is numerically correct.
- buildRollbackState correctly uses [] for append-reducer fields (evaluationHistory/errors) and null for replace fields. Its gap is the MISSING arcEvidencePackages (P1-5), not the clearing mechanism.
