# Photo late-join — pre-deploy gate (Task 5), 2026-09-19

Branch `feat/photo-late-join`. Run by the controller against the branch's own server (throwaway console password; `.env` untouched).

## Thread sweep (steps 1–3)

`SELECT DISTINCT thread_id FROM checkpoints` → 6 threads: 062126, 062626, 062726, 071126, 071826, 0919269.

| Thread | checkpointType | currentPhase | inProgress | Action |
|---|---|---|---|---|
| 062126, 062626, 062726, 071126, 071826 | (none) | complete | no | none |
| 0919269 | paper-evidence-selection (old graph) | 1.43 | no | resumed under the new graph as the smoke run |

No thread was paused at `character-ids`; nothing to clear. No thread was in progress at the restart.

## Smoke run (step 5) — thread 0919269 resumed under the new graph

- paper-evidence → await-roster → **await-full-context** (the old position `character-ids` was skipped: old-thread migration correct) → parse → input-review → pre-curation → evidence-and-photos → arc-selection, with **no photo work** on the way.
- After arc selection the `photos` gate fired, pre-filled from the start-time `rawSessionInput.photosPath` (R9), `defaultDir` absolute, `found: 10`.
- **Negative 1:** `POST /start` with a non-existent `photosPath` on a never-used id → `400 Photos directory not found: <path>. Leave the field blank…`; no thread created.
- **Negative 2:** answering the gate with a non-existent path → `400 Photos directory not found: <path>`; the run stayed at the gate.
- Real folder → the branch skipped fetch/preprocess/analysis on the surviving photo state and paused at `character-ids`; mappings entered; arc evidence packages built with 8/5/5 photos; hero image selected; outline (Opus), article (Opus) + one automatic revision, fact-check + evaluation, assembly.
- Result: `outputs/report-0919269.html`, `photosCopied: 10`, 6 `<img>` tags / 5 `sessionphotos/` references. Weekly quota 33% → 37% for the run.
- Not exercised live (verified by unit tests and the Task 1 reviewer's static trace): the empty-folder "no photographs" answer.

## Observations for the follow-ups

- `GET /checkpoint` at the `photos` gate reports `currentPhase` 2.35 (arc selection's); the node writes 2.36 only on resume.
- The I3 failure-card fix (rollback target `photos` when `fetchSessionPhotos` throws) has node tests and a static wiring check; a live click-through needs a deliberately failing fetch and was not run.
