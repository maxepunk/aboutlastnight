# First fall-run session — run sheet (2026-09)

## Before you start
1. Local `main` is the merged branch; `npm start` from `reports/`. If a server is already running, stop it first — the graph and the gates changed.
2. `curl -s localhost:3001/api/health` answers. The database is the default `data/checkpoints.sqlite` (no `CHECKPOINT_DB_PATH` set).
3. Open `docs/runbook/decision-log-template.md`, copy it to `data/<id>/decision-log.md`.

## Starting the session
- Session ID = the session date as MMDDYY (second session the same day: add a digit).
- Leave **Photos** blank if the photos are not curated yet: the pipeline asks for the folder after arc selection.
- Put the whiteboard photo in the **Whiteboard** field. A whiteboard inside the photos folder is excluded from the article but NOT read.

## During the run
- Never restart the server while a step is running. Restart only at a pause (a gate).
- If the page resets to the blank Session screen: note the time in the decision log, open the browser DevTools console and run
  `document.wasDiscarded; performance.getEntriesByType('navigation')[0].type` and write down both values, then type the session ID and click **Resume**. Nothing is lost.
- At **arc selection**: the guidance box goes to the outline AND the article prompts.
- At **outline**: read the THESIS panel first. Edit by hand what you can, then, if the clock allows, reject once with a note — your edits travel with it and the reviser is told to keep them. After the rework, read the advisory line (kept / changed your edits).
- At **article**: the thesis echo sits above the headline; judge the headline against it. Same reject-once request if the clock allows. Read "Standing notes the writer will see".
- Every note you type is kept and shown to every later writer.

## After publishing
1. Fill the end-of-run block of the decision log.
2. Run the two-pass refinement with a findings file, and add one column per finding: *which gate could have caught this, and why it did not*.
3. Do not commit: anything under `data/`, `outputs/report-<id>.html`, `outputs/sessionphotos/<id>/`.
4. The per-call prompt log is at `data/<id>/llm-log/` for the prompt work.
