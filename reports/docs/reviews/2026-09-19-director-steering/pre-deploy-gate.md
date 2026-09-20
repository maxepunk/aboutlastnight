# Director steering — pre-deploy gate (2026-09-19)

Branch `feat/director-steering` at `038ee59` (33 commits above `main` `f5f5c46`). Spec: `docs/superpowers/specs/2026-09-19-director-steering-design.md` §7. Everything below ran against a COPY of the checkpoint database and a scratch database; the production `data/checkpoints.sqlite`, its WAL, `data/0919269/` and `outputs/report-0919269.html` were never opened by any test or gate process (checked by mtime, see §4). No session content appears in this file beyond the two `GATE` marker strings.

## 1. Suite

`npx jest --silent` on the integrated branch, exit code guarded: **145 suites / 2,293 tests, exit 0** (baseline at the branch point: 138 / 2,147). Since Task 2, Jest's `setupFiles` entry `__tests__/setup/checkpoint-db-path.js` points `CHECKPOINT_DB_PATH` at a temp file, so no suite opens the production database (verified in the Task 2 fix round: with the file deleted, a full run does not recreate it).

## 2. Prompt regression guard (spec §7.3)

`scripts/render-prompts.js` rendered the four prompts (outline generation, outline revision, article generation, article revision) from the copied `0919269` thread's persisted state through the real builders, once on the branch and once on `main` (read-only worktree at `f5f5c46`), then `--compare`:

```
OK    outline-generation.txt
OK    outline-revision.txt
OK    article-generation.txt
OK    article-revision.txt
exit 0
```

The task reviewer reproduced the run and diffed the raw files: the only differences are the `<HAND_EDITS>` block, the standing-notes paragraph inside `<DIRECTOR_GUIDANCE>`, and one trailing blank line. `grep -c "<HAND_EDITS>" render-branch/outline-revision.txt` = 1; `grep -c "RENDER-DIFF NOTE B" render-branch/article-generation.txt` = 1. This thread has no arc-selection guidance, so the render exercised the notes-only `<DIRECTOR_GUIDANCE>` shape; the guidance-only byte-identity rests on the pinned literal in `lib/__tests__/prompt-builder-director-guidance.test.js`.

## 3. Console click-through (spec §7.2)

Integrator, built-in browser, throwaway server on `PORT=3011` with `CHECKPOINT_DB_PATH` at a scratch file, `window.fetch` stubbed after login to serve payloads built from the copied thread through `buildCompleteCheckpointData` with the stub steering keys.

| # | Check | Result |
|---|---|---|
| 1 | Resume → outline gate renders with the THESIS panel first | PASS |
| 2 | Advisory line "The rework changed sections you edited by hand: CLOSING." | PASS (rendered in the red warning style; deferred minor, see §6) |
| 3 | Standing note `[arc-selection, rejection 1] …` under "Standing notes the writer will see" | PASS |
| 4 | Thesis pencil → edit hook → Save → THESIS and LEDE show the new hook; LEDE evidence list unchanged | PASS |
| 5 | Reject → cue line "Your hand edits will be sent with this note. The reviser is told to keep them." → note → Submit → exactly one POST to `/approve` with `{outline:false, outlineFeedback, outlineEdits}`; `outlineEdits.lede.hook` is the new hook, `selectedEvidence` preserved, all six sections present | PASS |
| 6 | Blank the hook via the LEDE editor → Reject → `.validation-error` shown (`/lede/hook must have required string 'hook'`), POST count unchanged | PASS (message says "Cannot approve" on the reject path; deferred minor) |
| 7 | `handEditReport {checked:['lede'], changed:[]}` → "Rework kept all 1 hand edit.", no advisory | PASS |
| 8 | Article payload with `outlineThesis` → "THESIS (from the approved outline)" echo above the headline; article report and two standing notes in order | PASS |
| — | No GET ever recorded as a POST; browser console clean on every pass | PASS |

## 4. Live gate on a copy (spec §7.4)

Preconditions: the director's `main` server was down by probe (`GET localhost:3001/api/health` refused, no listener on 3001) — recorded, not assumed. `data/checkpoints.sqlite` (+ `-wal`, `-shm`) copied to scratch at 17:12 (the production file unchanged since 06:01); `data/0919269/` snapshotted; mtimes of the production database, WAL and published report recorded before and after.

Server: `server.js` run as the MAIN module with `ACCESS_PASSWORD` (throwaway), `SESSION_SECRET` (random), `CHECKPOINT_DB_PATH` (the copy), `LLM_CALL_LOG_DIR` (scratch) and `PORT=3011` preset. Note for the next gate: the plan's wrapper that `require()`s `server.js` never listens (the listen sits behind `require.main === module`), and startup aborts without `NOTION_TOKEN`, so the wrapper runs with `reports/` as the working directory so dotenv supplies the token to the process.

| Step | Result |
|---|---|
| 4. Rollback to `outline` (SSE before POST) | `{"status":"processing"}`; outline gate reached after 7 min 10 s with no photos pause; `revisionCount` 0, score 0.95, `handEditReport` null, `directorGateNotes` `[]` |
| 5. Edit the thesis hook (`[GATE EDIT]` appended) and reject with `GATE TEST: keep my hook exactly. Make the key tension name the money, not the vote.` | `{"status":"processing"}` (the schema gate passed the edited outline); second outline gate after 3 min 4 s, one revise + evaluate pair (no evaluator loop) |
| 6.1 `cp2.checkpoint` | `handEditReport = {checked:['lede'], changed:[]}` — the reviser KEPT the hook (its tail is still `[GATE EDIT]`); `directorGateNotes = [{gate:'outline', kind:'rejection', round:1, text:'GATE TEST: …', at}]`; `revisionCount` 1; `previousFeedback` null (the revisers null the slot; the notes list is the visible record, spec M8) |
| 6.2 Per-call log | 4 files + `index.jsonl` under `<LLM_CALL_LOG_DIR>/0919269/llm-log/`; the `reviseOutline` file contains `<HAND_EDITS>`, `GATE EDIT` ×3 (the diff line, the previous output, the model's kept hook), `GATE TEST` ×1 (HUMAN FEEDBACK). `Standing notes the director gave` ×0 — correct: the only note in existence was the one this pass was acting on, which spec §5.3 [I10] omits from the standing list because it is already in the prompt as HUMAN FEEDBACK. The paragraph's rendering through the real builders is proven by §2 and by the Task 3 unit tests |
| 6.3 Durations (problem 5 data) | see below |
| 6.4 Console on the real gate (no stub) | Resume `0919269` → "Revision 1 of 3 / 2 remaining", "Rework kept all 1 hand edit.", standing note `[outline, rejection 1] GATE TEST: …`, verdict bar 0.95 after revision 1; the evaluator's own advisory remarks that the `[GATE EDIT]` marker survived; no console errors |
| 6.5 | Stopped at the second outline gate (spec [I11]); the optional two-call approve to the article gate was not spent |
| 7. Isolation | Gate server stopped; `diff mtimes-before mtimes-after` → **PRODUCTION-UNTOUCHED** (database, WAL, `data/0919269/` listing, published report all identical); `git status` shows no tracked changes; the copy grew from 522,498,048 to 543,887,360 bytes |

Opus call durations at the pinned effort (`index.jsonl`, all `channel: structured_output`, usage recorded with cache-creation / cache-read / output tokens):

| Call | Elapsed |
|---|---|
| generateOutline | 299.9 s |
| evaluate-outline | 109.2 s |
| reviseOutline | 82.0 s |
| evaluate-outline (after revision) | 98.9 s |

Four Opus calls in total.

## 5. Rulings that shaped this gate

- The click-through is the integrator's, not a task reviewer's (a subagent driving the shared browser pane is a shared-resource hazard; the plan already had the integrator repeat it).
- "The director's server is down" is satisfied by probe evidence recorded here, because the gate runs on a copy and the user was not available mid-run.
- The step-6 "standing notes" grep expectation in the plan assumed an arc-selection note existed; with a single outline note the specified behaviour is zero occurrences on that pass.

## 6. Follow-ups (deferred minors, triaged by the final review)

Recorded in the SDD ledger. The user-facing ones: the hand-edit advisory reuses the red blocking-warning style and should get its own muted treatment; the reject path's invalid-edit message says "Cannot approve" because both handlers share one validation helper; the thesis editor lacks right padding in edit mode; `outlineThesisOf` returns three blank strings instead of `null` for an empty lede; `formatGateNotes` and `steeringView` do not guard a note without `gate`; `render-prompts.js` swallows every require error and collapses blank runs before comparing.
