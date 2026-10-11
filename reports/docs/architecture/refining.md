# Refining published reports

The two-pass refinement workflow for a report already published.

Moved verbatim from `reports/CLAUDE.md` on 2026-10-11, when CLAUDE.md became a map. A part named in bold elsewhere in this text, such as **The map**, may now sit in another file in `docs/architecture/`; CLAUDE.md lists which file holds which part.

## Refining Generated Reports

Pipeline-generated reports contain systematic factual errors that read as plausible. The repo has a structured **two-pass refinement workflow** driven by the user-level `refining-aln-reports` skill (auto-loads when you mention reviewing/editing a session report).

**Working-file convention** (in `outputs/`, all prefixed `report-MMDDYY-`):

| Suffix | Pass | Purpose |
|--------|------|---------|
| `-refsheet.md` | Pre-read | Ground truth built from source data (`data/{id}/`) BEFORE reading the article. Roster, pronouns, accounts, transactions, accusation. |
| `-findings.md` | Pass 1 (fact-check) | Claim-by-claim verification against refsheet. Flags fabrications, evidence-boundary violations, pronoun errors. |
| `-editplan.md` | Pass 1 (fact-check) | Section-by-section rewrite plan addressing findings. |
| `-draft.md` | Pass 1 output | Revised prose (Markdown, not HTML) after applying editplan. |
| `-findings-copyedit.md` | Pass 2 (copy-edit) | Examines the **fact-corrected** article (not the original) for pacing, redundancy, throat-clearing, abstract→specific. |
| `-editplan-copyedit.md` | Pass 2 (copy-edit) | Structural and sentence-level polish plan. |

**Two-pass discipline:** Fact-check and copy-edit are separate cycles. Copy-edit always operates on the fact-corrected article, never the original. Don't pattern-match em-dashes from older reference reports (they predate the no-em-dash rule).

**Final HTML output:** Published as `outputs/report-MMDDYY.html`. The matching `assets/images/MMDDYY/` directory must exist before publishing.

**Editorial intent fetch:** If the pipeline server is running, the refinement skill pulls the director's checkpoint feedback from `/api/session/:id/state/:field` to inform the refsheet: `directorGateNotes`, every note the director sent at a stop, each with its gate, its kind (`approval` or `rejection`) and the round of its stop (`stopRound`); `weave`, the story as the director left it at the story meeting; `outline`, the map as they left it; and `_rescuedItems`. The `_arcFeedback`, `_outlineFeedback` and `_articleFeedback` slots hold a note only until its rework runs, which clears them before the stop opens (task 4.12e), and `selectedArcs` went with the arc selection (R4). The approved versions are on disk too: `analysis/weave.approved.json`, `analysis/map.approved.json` and `output/content-bundle.approved.json`.
