# Director console: the design

What the director console should let the director do, stop by stop, and the mechanisms behind it. This is the design settled in the grill of 2026-09-20 (after session 091826) and amended on 2026-09-22 (after session 092026). It replaces the two documents the grill promised, the per-stop UX spec and the evaluation-and-prompt spec.

The build order and the status of each piece live in `docs/superpowers/plans/2026-09-22-roadmap.md`. The vocabulary lives in `CONTEXT.md`, and this document uses it: stop, round, note, edit, send back, rework, check, evaluation, review, writer, record, automated budget, beat, arc, thesis, story memo, story map, evidence card, evidence reference, citation, claim check, trace.

## Principles

1. **The director decides what is publishable.** The director's edits are the final word, and a choice such as leaving out the whiteboard is an input, not a gap. The pipeline is judged by two things only: what each stop lets the director see and do, and whether the director's words and the session's facts reach the next writer. How far the writer's draft sits from the published text is not the measure.
2. **Words flow.** Every note, edit and session fact reaches the prompt it belongs in, labelled with its authority. A control that changes nothing downstream is a defect.
3. **A reworker sees what its writer saw.** A rework gets everything the writer of that output was given, plus the previous version, the findings and the director's notes. A rework that cannot see the documents can only guess or delete. Session 092026 showed both.
4. **The record decides facts.** Every claim a reader would take as fact must agree with the record. Text the director wrote counts as record. The writer may interpret; it may not invent.
5. **Steer where it is cheapest.** Work is ordered by what a problem costs the director to fix by hand at the stop where it surfaces. A structural problem found at the outline costs an outline rework of about 80 seconds. Found at the article, it costs a rebuild or an hour of rewriting.
6. **A slice lands in all three layers or it is not done.** The screen, the plumbing and the prompt change together, and the change is proved on a copy of a real thread before it merges.

## The stops

Each stop is described as its target. "Now" says what exists after phase 1.

### Intake

**Target.** One form at the start of the session collects everything only the director holds: session id, theme, reporting mode, guest reporter, roster with pronouns, accusation, session report, director notes, optional whiteboard photo, the paper evidence unlocked during play, and the photos folder. The photos folder may be left empty. A panel then lists what the director still owes, and the folder can be supplied there while the pipeline runs. Pre-curation stops being a stop but stays viewable.

**Constraints found in the code.** The unlocked-paper list exists only after the graph fetches it from Notion, so the intake is a two-step exchange. Folding the full-context stop into the intake removes the only code that reconciles the parse across its three state layers, so that reconciliation must move. The photos stop is skipped whenever a folder path exists, so the confirmation must key on something else.

**Now.** Unchanged: the start form, the roster, full-context and paper-evidence stops, and pre-curation as a stop.

### Input review

**Target.** Direct edits for the roster, pronouns, accused, charge and whiteboard fields, written to disk as well as state so a replay cannot overwrite them. Empty parses shown in red. The observations the machine took from the director's notes listed, and marked used or unused at the arc stop.

**Now.** Unchanged: read-only, with a prose correction that re-runs the parse.

### Arc stop: the story memo

**Target.** Each arc reads as a plain claim, with the documents it rests on named and one quotable line from each, who does what, how strong it is, and what is uncertain. One paragraph says how the arcs pull against each other. The writer proposes a thesis in the form "the room decided X; the record points at Y", and the director settles it here. Notes anchor to any line of any arc; the director can propose an arc as a one-line claim; selection stays a checkbox.

**Now (phase 1).** Documents are named with their owner and first line instead of ids. One note box is always visible: approve sends it as guidance to the outline and article writers, send back sends it as the rework's feedback and it then stands, and the next round opens with it pre-filled. Summaries are third-person claims. The thesis is still proposed at the outline stop.

### Photos and character IDs

**Target.** The director describes each photo once: who is in it and what moment it shows. That text reaches the writer verbatim and is the authority for placement and caption. The caption may add context from the article or the record but never a different subject or action; when the director's description is thin, the writer may place the photo in the flow of the story, still grounded in what the director wrote. Exclude per photo. Later, photos may come from the game-master interface, with the director choosing which to use.

**Now.** The director's descriptions reach the identity mapping only. A Haiku pass rewrites them into captions the article writer never sees, and the writer invents its own captions from a filename and names. The exclude flag exists in the data but nothing filters on it.

### Outline stop: the story map

**Target.** The outline becomes the brief the writer follows, readable by the director. On top: the thesis, the headline and deck, the length. Then each of the six sections says what it does for the reader, the material it uses by name (documents, quotes, the photo and its beat), how the thesis shows through that section, and how it hands off to the next. Paragraph counts and placement tables fold away. The director edits any of that text and anchors notes to any part. The six section keys stay, which keeps the thesis echo at the article stop, the rollback tables, the section ids and the console labels working.

**Now (phase 1).** One note box sent with any action; an approval note reaches the article writer as forward guidance. The outline writer now knows the reporting mode, sees the director's raw notes and gets the arc evaluation's advisories. The outline itself is unchanged: a JSON plan the article writer receives whole, with instructions for five of its thirty fields.

### Article stop

**Target.** The rendered page is the surface. The director reads the article as it will print, edits a block in place, and deletes, moves or inserts blocks. A rail beside the page holds the claim check's list with a jump to each claim, open notes, a search of the record, and the trace. A toggle highlights what changed since the director's last round. The JSON editor stays under "advanced".

**Now (phase 1).** One note box sent with any action; "Round N" with no maximum; the automated budget shown per round; no false "final version" banner. The page is still a list of block editors beside an HTML preview, with no block delete, move or insert.

## Mechanisms

### Notes and the review

A review is everything the director submits at a stop in one go: notes anchored to a target (an arc, an outline section or one of its parts, an article section or block, a photo), one cover note, edits, and the action (approve or send back). Nothing reaches the writer before the submit. A note stands for every later writer until the director closes it. After a rework the writer replies to each note: addressed, partly, or not, with a one-line reason. Notes written while the pipeline runs are queued to the next stop.

Article blocks have no stable id, and a rework shifts block positions. Anchors therefore use the section id plus a fingerprint of the block's content, and re-anchor when the director moves or deletes blocks.

**Now (phase 1).** One note per stop per action, kinds `approval` and `rejection`, standing in every later prompt. No anchors, replies or closing yet.

### Rounds and the automated budget

The director's send-backs are never limited. A failed check or evaluation may trigger reworks on its own, at most two per round of the director's; the counter resets on every send-back. At the cap the stop opens with every unresolved finding listed. **Now:** built in phase 1 at the arc, outline and article stops.

### Reworks and their scope

A send-back carries a scope:
- **Targeted.** Only the anchored blocks go to the writer, with their context, and only those blocks come back; the server splices them in. Untouched text is untouched by construction, and an edited block is sent only if a note anchors on it.
- **Rewrite this section.** The section is written again from the story map and the notes; the rest is kept.
- **Rebuild.** The article is written again from the story map and every standing note. This is the existing rollback to the article stop, with the notes kept.

The instruction to preserve or not follows from the scope. It is never fixed text: a fixed "do not regenerate" instruction turned the director's "rethink from scratch" into a relabel on 091826.

**What every rework sees** (principle 3): the writer's full inputs for that output, the previous version, the findings, the director's notes and the director's edits.

### Checks, the evaluation and the claim check

- **Checks** are programmatic and free. A failed must-fix check triggers an automatic rework inside the budget.
- **The evaluation** is the automated version of the director's judgement, run before the director looks. Its rubric comes from what the director actually sends work back for, not from the craft prompts. Every finding names a location and a fix. Must-fix covers anything that would be wrong in print: accuracy and attribution against the record, framing that contradicts the record, reporting mode, roster coverage, word budget over the ceiling, a caption that contradicts the director's photo description. Should-consider covers craft: headline and deck, the thesis threaded through every section, repetition, momentum, visual balance. Should-consider findings reach the next writer and appear at the stop as candidate notes the director can accept into a rework.
- **The claim check** reads every factual claim in writer-authored text against the record. Director-authored text is exempt. A claim the record contradicts, and a claim the record does not support, are both must-fix. The fix rewrites the claim to what the record supports, or deletes it when the record has nothing. It runs on Opus before the evaluation, and its list appears at the article stop.
- **The evaluation and the claim check get the record.** Today the article evaluation sees only the article and the outline.

### Evidence cards

The writer chooses which document a card quotes and, for a long document, which passage. The server copies that text from the record word for word when it assembles the article, and adds the citation line in the same step: document kind and name, and owner where the record has one. The citation never names who exposed a document. The writer never types card text, so a card cannot misquote its source, and the card fidelity check no longer applies to printed cards.

An evidence reference is a one-line mention in the body text and shows no document text. A sidebar entry shows a headline and a summary; the writer writes no document text there, and no check reads text that never prints.

### The trace

The trace tells the director what the machine did to the output before the director arrived: each automatic pass, why it ran, and what it changed. The first version is a read-only panel at the outline and article stops. Comments on a finding and undo for a change come with the review.

## Decisions

| Date | Decision | Source |
|---|---|---|
| 2026-09-20 | The director directs; notes and scoped send-backs are the main tools; edits are for sentences; a whole-article rework is an explicit choice. | Grill Q2 |
| 2026-09-20 | Five decision stops plus an intake; photos required but may arrive late. | Q3, Q10, Q29 |
| 2026-09-20 | Notes with any action, anchored notes plus one cover note, one submit per review, the director closes notes. | Q4, Q11 |
| 2026-09-20 | Automatic reworks run before the director sees a draft and are shown so the director can dispute them. Send-backs unlimited; automated budget two per round. | Q5, Q13 |
| 2026-09-20 | The evaluation is the automated version of the director's judgement; must-fix versus should-consider; findings with a location and a fix. | Q6, Q14, Q15 |
| 2026-09-20 | Every writer claim is read against the record; the writer may not take liberties with facts. | Q7, Q16 |
| 2026-09-20 | Three rework scopes; targeted reworks return only the addressed items and the server splices them. | Q8, Q12 |
| 2026-09-20 | Story memo at the arc stop, story map as the outline, keeping the six section keys. | Q23 to Q26 |
| 2026-09-20 | The article stop is the rendered page with a rail; readable, without clutter. | Q19, Q27 |
| 2026-09-20 | The director's photo description is the authority for captions; context may be added, grounded in it. | Q20, Q22 |
| 2026-09-20 | Opus for the claim check. Fable only if a later session shows it improves arc synthesis, interweaving or the evaluation. | Q31 |
| 2026-09-20 | Order work by what a problem costs the director to fix by hand; the story map before the story memo. | Priority discussion |
| 2026-09-22 | Card text comes from the record, filled by the server, with the citation in the same step. | After 092026 |
| 2026-09-22 | Structural trouble is typical: the story map stays next after the fix for reworks. | After 092026 |
| 2026-09-22 | A reworker sees what its writer saw. A minimal trace ships with that fix. | After 092026 |

## Known gaps

These are recorded so no one mistakes them for intended behaviour. Each has a home in the roadmap.

- The article, outline and arc reworkers do not see what their writers saw. The article reworker has no document text, and the outline reworker gets arc ids and evidence counts only.
- The article evaluation sees no record.
- The writer is told to put full document text in sidebar entries, which never print, and the fact check reads that text. On 092026 six of the seven flags that set off an automatic pass were on it.
- The fact check's fix line offers "or drop the card", and a sentence that follows a closing quotation mark fails even when its words match.
- The remote reporting-mode block makes the writer announce its absence ("I was not there") instead of showing it through attribution.
- First-person presence markers remain in the article prompt builder and two craft files, under the article's mode block.
- The arc stop's note is not kept across a page reload; the outline and article notes are.
- Should-consider findings do not survive a rollback.
