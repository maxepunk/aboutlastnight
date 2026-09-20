# Pre-registration — first fall-run session on the 2026-09-19 pipeline

Written BEFORE the run. Compared against the findings file AFTER it. Baseline = the five
measured sessions (062126–071826, 116 hand edits), see the 2026-09-18 baseline memo.

| # | Failure class (baseline rank) | Baseline frequency | Caught now by | Expectation for this run |
|---|---|---|---|---|
| 1 | Evidence-card content fabricated under a real token id | 4 of 5 | CODE: fact-check structural (card fidelity) → automatic revision before Opus | Zero fabricated cards reach the article gate. Watch for FALSE structurals (a paraphrase flagged as fabricated). |
| 2 | Roster coverage gaps | shipped anyway | CODE: fact-check structural (rosterCoverage) | Every roster PC named at the article gate. |
| 3 | Marcus (victim, not roster) written they/them | FACT errors | ADVISORY only (npcPronouns) | May still ship. Count occurrences; if ≥1, promote the check after the run. |
| 4 | Thesis / headline rewritten by hand | headline survived in 1 of 5 | DIRECTOR: thesis panel at outline (new), echo at article (new) | The headline is changed AT THE GATE or survives; not rewritten after publish. |
| 5 | Evidence-boundary violations (account-name → actor, money direction) | narrowed | PROMPT only | Hand-check; expect ≤1. |
| 6 | Remote session written on-site | 2 of 2 remote | CODE: reporting-mode system block + fact-check narrator scan (structural) | Zero presence/vote claims by the narrator in a remote session. |
| 7 | Invalid photo references / captions | advisory in 4 of 5 | CODE: photoReferences structural | Zero invalid refs. Caption quality is prompt-only. |
| 8 | Voice / scaffolding (WHAT'S MISSING cut, closing untitled) | director pass | PROMPT only | Expect hand edits; count them. |

## Steering metrics to record (from the decision log)
- Rejections used, and how many carried hand edits.
- Reverted-edit advisories seen (the reviser undid an edit).
- Notes typed, and whether a later phase visibly honoured them.
- Gates skipped for time; end-edits made after publish (count, by class).
- Wait per Opus call (outline generation, outline revision, article generation, article revision) — problem 5 data.

## Not expected to change
Prose quality classes 5 and 8: the prompts are unchanged by design; this run is their "before" measurement.
