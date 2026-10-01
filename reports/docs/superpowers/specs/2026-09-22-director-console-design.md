# Director console: the design

What the director console should let the director do, stop by stop, and the mechanisms behind it. This is the design settled in the grill of 2026-09-20 (after session 091826) and amended on 2026-09-22 (after session 092026). It replaces the two documents the grill promised, the per-stop UX spec and the evaluation-and-prompt spec. The "Now" lines and the known gaps were updated on 2026-09-27, after phase 2.

The build order and the status of each piece live in `docs/superpowers/plans/2026-09-22-roadmap.md`. The vocabulary lives in `CONTEXT.md`, and this document uses it: stop, round, note, edit, send back, rework, check, evaluation, review, writer, record, automated budget, beat, arc, thesis, story memo, story map, evidence card, evidence reference, citation, claim check, trace.

## What the article is for

The game's how-to-play page promises the players "a personalized investigative report on the Nova News blog, showing how your choices shaped the official story. You'll catch pieces of the narrative you may have missed during your session." The article keeps that promise. The players who were in the room read it to see themselves, to catch what they missed, and to see how their choices shaped the verdict. They have to read it to the end, so it runs to about 1,500 words.

The article is written by Nova. Nova is an independent journalist who had been investigating Marcus, and whom Fremont PD required to monitor the investigation as an uninterested third party, the condition of Blake's deal to hold off the police. The rules that make the article true and worth reading are in `docs/superpowers/specs/2026-09-30-rule-set.md`. Every console stop exists to get that article written with as little of the director's hand-fixing as possible.

## Principles

1. **The director decides what is publishable.** The director's edits are the final word, and a choice such as leaving out the whiteboard is an input, not a gap. The pipeline is judged by two things only: what each stop lets the director see and do, and whether the director's words and the session's facts reach the next writer. How far the writer's draft sits from the published text is not the measure.
2. **Words flow.** Every note, edit and session fact reaches the prompt it belongs in, labelled with its authority. A control that changes nothing downstream is a defect.
3. **A reworker sees what its writer saw.** A rework gets everything the writer of that output was given, plus the previous version, the findings and the director's notes. A rework that cannot see the documents can only guess or delete. Session 092026 showed both.
4. **The record decides facts.** Every claim a reader would take as fact must agree with the record. Text the director wrote counts as record, notes written at a stop included. The writer may interpret; it may not invent. How a claim is written follows its evidence:
   - what the record backs, Nova states;
   - what was seen or said in the room, Nova reports, with the speaker named;
   - what Nova knows or suspects but cannot back, Nova presents as a reading or a question (rule-set spec, T1).
5. **Steer where it is cheapest.** Work is ordered by what a problem costs the director to fix by hand at the stop where it surfaces. A structural problem found at the outline costs one outline rework (eleven minutes on Opus 5.5 at the phase 2 gate) and a short read. Found at the article, it costs a rebuild and a second full read, or an hour of rewriting.
6. **A slice lands in all three layers or it is not done.** The screen, the plumbing and the prompt change together, and the change is proved on a copy of a real thread before it merges.

## The stops

Each stop is described as its target. "Now" says what exists after phase 2.

### Intake

**Target.** One form at the start of the session collects everything only the director holds: session id, theme, reporting mode, guest reporter, roster with pronouns, accusation, session report, director notes, optional whiteboard photo, the paper evidence unlocked during play, and the photos folder. The photos folder may be left empty. A panel then lists what the director still owes, and the folder can be supplied there while the pipeline runs. Pre-curation stops being a stop but stays viewable.

**Constraints found in the code.** The unlocked-paper list exists only after the graph fetches it from Notion, so the intake is a two-step exchange. Folding the full-context stop into the intake removes the only code that reconciles the parse across its three state layers, so that reconciliation must move. The photos stop is skipped whenever a folder path exists, so the confirmation must key on something else.

**Now.** Unchanged by phases 1 and 2: the start form, the roster, full-context and paper-evidence stops, and pre-curation as a stop.

### Input review

**Target.** Direct edits for the roster, pronouns, accused, charge and whiteboard fields, written to disk as well as state so a replay cannot overwrite them. Empty parses shown in red. The observations the machine took from the director's notes listed, and marked used or unused at the arc stop.

**Now (phase 2).** Read-only, with a prose correction that re-runs the parse. Every correction is kept in order and reaches the arc, outline and article writers beside the director's notes, not only the parse. The parse keeps who exposed each memory, and the input review lists it. A verdict with no culprit, such as an overdose or an accident, names no one. There are no direct edits, and nothing marks which observations were used.

### Arc stop: the story memo

**Target.** Each arc reads as a plain claim, with the documents it rests on named and one quotable line from each, who does what, how strong it is, and what is uncertain. One paragraph says how the arcs pull against each other. The writer proposes a thesis in the form "the room decided X; the record points at Y", and the director settles it here. Notes anchor to any line of any arc; the director can propose an arc as a one-line claim; selection stays a checkbox.

**Now (phases 1 and 2).** Documents are named with their owner and first line instead of ids. One note box is always visible: approve sends it as guidance to the outline and article writers, send back sends it as the rework's feedback and it then stands, and the next round opens with it pre-filled. The note survives a page reload. Summaries are third-person claims. The arc writer and the arc reworker read every exposed document in full, the director's accusation word for word, the corrections and the standing notes, so a second send-back keeps the first note. An arc rework keeps the interweaving plan. The arc judge reads the documents and the director's notes, and its score is labelled uncalibrated. The thesis is still proposed at the outline stop, and an arc does not yet show a quotable line per document.

### Photos and character IDs

**Target.** The director describes each photo once: who is in it and what moment it shows. That text reaches the writer verbatim and is the authority for placement and caption. The caption may add context from the article or the record but never a different subject or action; when the director's description is thin, the writer may place the photo in the flow of the story, still grounded in what the director wrote. Exclude per photo. Later, photos may come from the game-master interface, with the director choosing which to use.

**Now (phase 2).** The director describes each photo at the character-IDs stop. The description reaches the outline writer, the article writer and the outline judge word for word, with the filename and the identified names, joined by filename. A Haiku pass still rewrites it into a caption that no prompt prints. The writer writes its own caption, and nothing checks that caption against the description. The exclude flag exists in the data, but the console cannot set it and the writers' photo lists do not filter on it.

### Outline stop: the story map

**Target.** The outline becomes the brief the writer follows, readable by the director. On top: the thesis, the headline and deck, the length. Then each of the six sections says what it does for the reader, the material it uses by name (documents, quotes, the photo and its beat), how the thesis shows through that section, and how it hands off to the next. Paragraph counts and placement tables fold away. The director edits any of that text and anchors notes to any part. The six section keys stay, which keeps the thesis echo at the article stop, the rollback tables, the section ids and the console labels working.

**Now (phases 1 and 2).** One note box sent with any action; an approval note reaches the article writer as forward guidance. The outline writer knows the reporting mode and gets the arc evaluation's advisories. It reads every exposed document in full instead of the first five per arc, the director's accusation word for word, the notes with the corrections, the whiteboard and the photo descriptions. The outline reworker is built from the writer's own sections, so it reads all of that too, plus the note and the hand edits. The outline judge reads the documents, every photo the writer could place, the interweaving plan and the notes, and its score is labelled uncalibrated. A trace panel lists what the automatic passes changed before the director arrived. The outline itself is unchanged: a JSON plan the article writer receives whole, with instructions for five of its thirty fields.

### Article stop

**Target.** The rendered page is the surface. The director reads the article as it will print, edits a block in place, and deletes, moves or inserts blocks. A rail beside the page holds the claim check's list with a jump to each claim, open notes, a search of the record, and the trace. A toggle highlights what changed since the director's last round. The JSON editor stays under "advanced".

**Now (phases 1 and 2).** One note box sent with any action; "Round N" with no maximum; the automated budget shown per round; no false "final version" banner. The article reworker reads the same record as the writer, so an automatic pass no longer deletes correct cards for want of their text. The article judge reads the record, the roster with pronouns, the director's notes and accusation, and the fact check's result, and its score is labelled uncalibrated. A remote article states the reporter's absence at most once. A trace panel lists the automatic passes. The page is still a list of block editors beside an HTML preview, with no block delete, move or insert.

## Mechanisms

### Notes and the review

A review is everything the director submits at a stop in one go: notes anchored to a target (an arc, an outline section or one of its parts, an article section or block, a photo), one cover note, edits, and the action (approve or send back). Nothing reaches the writer before the submit. A note stands for every later writer until the director closes it. After a rework the writer replies to each note: addressed, partly, or not, with a one-line reason. Notes written while the pipeline runs are queued to the next stop.

Article blocks have no stable id, and a rework shifts block positions. Anchors therefore use the section id plus a fingerprint of the block's content, and re-anchor when the director moves or deletes blocks.

**Now (phases 1 and 2).** One note per stop per action, kinds `approval` and `rejection`, standing in every later prompt, the arc writer's and the arc reworker's included. No anchors, replies or closing yet.

### Rounds and the automated budget

The director's send-backs are never limited. A failed check or evaluation may trigger reworks on its own, at most two per round of the director's; the counter resets on every send-back. At the cap the stop opens with every unresolved finding listed. **Now:** built in phase 1 at the arc, outline and article stops.

### Reworks and their scope

A send-back carries a scope:
- **Targeted.** Only the anchored blocks go to the writer, with their context, and only those blocks come back; the server splices them in. Untouched text is untouched by construction, and an edited block is sent only if a note anchors on it.
- **Rewrite this section.** The section is written again from the story map and the notes; the rest is kept.
- **Rebuild.** The article is written again from the story map and every standing note. This is the existing rollback to the article stop, with the notes kept.

The instruction to preserve or not follows from the scope. It is never fixed text: a fixed "do not regenerate" instruction turned the director's "rethink from scratch" into a relabel on 091826.

**What every rework sees** (principle 3): the writer's full inputs for that output, the previous version, the findings, the director's notes and the director's edits.

**Now (phase 2).** Each reworker is built from its writer's own sections, then the findings, the previous version, the director's note and edits, and the director's guidance last. There is no scope yet: every send-back reworks the whole output, and the rework rules still carry fixed "preserve, do not regenerate" lines until phase 3 rules on them.

### Checks, the evaluation and the claim check

- **Checks** are programmatic and free. A failed must-fix check triggers an automatic rework inside the budget.
- **The evaluation** is the automated version of the director's judgement, run before the director looks. Its rubric comes from what the director actually sends work back for, not from the craft prompts. Every finding names a location and a fix. Must-fix covers anything that would be wrong in print: accuracy and attribution against the record, framing that contradicts the record, reporting mode, roster coverage, word budget over the ceiling, a caption that contradicts the director's photo description. Should-consider covers craft: headline and deck, the thesis threaded through every section, repetition, momentum, visual balance. Should-consider findings reach the next writer and appear at the stop as candidate notes the director can accept into a rework.
- **The claim check** reads every factual claim in writer-authored text against the record. Director-authored text is exempt. A claim the record contradicts, and a claim the record does not support, are both must-fix. The fix rewrites the claim to what the record supports, or deletes it when the record has nothing. It runs on Opus before the evaluation, and its list appears at the article stop.
- **The evaluation and the claim check get the record.**

**Now (phase 2).** The checks and three model judges run. All three judges read the record, the roster with pronouns, the director's notes and corrections, and the accusation word for word; the article judge also reads the fact check's result. Their rubric is unchanged, and each score is labelled uncalibrated at its stop until phase 7. There is no claim check yet.

### Evidence cards

The writer chooses which document a card quotes and, for a long document, which passage. The server copies that text from the record word for word when it assembles the article, and adds the citation line in the same step: document kind and name, and owner where the record has one. The citation never names who exposed a document. The writer never types card text, so a card cannot misquote its source, and the card fidelity check no longer applies to printed cards.

An evidence reference is a one-line mention in the body text and shows no document text. A sidebar entry shows a headline and a summary; the writer writes no document text there, and no check reads text that never prints.

**Now (phase 2).** The writer still types card text. The fact check compares each inline card's sentences with its document and reads nothing that does not print, and its fix line says to keep the card and copy the sentences from the document. The writer is no longer asked for document text in sidebar entries.

### The trace

The trace tells the director what the machine did to the output before the director arrived: each automatic pass, why it ran, and what it changed. The first version is a read-only panel at the outline and article stops. Comments on a finding and undo for a change come with the review.

**Now (phase 2).** The read-only panel exists at the outline and article stops. It lists the current round's automatic passes, what set off each one (a check or the evaluation, with its findings), and what each changed, by section. It clears when the director sends back or approves. The arc stop has none.

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
| 2026-09-24 | The pipeline's Opus calls move from Opus 4.8 to Opus 5.5 in the first slice of phase 2. The installed Agent SDK is too old for Opus 5.5, so the slice upgrades it to 0.3.280 or later. | Probe on 2026-09-24 |
| 2026-09-25 | One record view: every call that decides, writes, reworks or judges the story sees every usable document in full, with the same label (id, kind, name, owner, layer); buried memories as transactions only. | Information architecture, Q1 |
| 2026-09-25 | The director's raw text stays part of the record beside its parse, never replaced by it: the full accusation, photo descriptions word for word, corrections applied to what writers read, the session report's "Exposed By" column. Standing notes reach the arc prompts; an arc rework keeps the interweaving plan. | Information architecture, Q2 |
| 2026-09-25 | The reporting-mode lines are fixed now. The writing rules become one set with a reason for each, after the director rules on the conflicts in a grill session. | Information architecture, Q3 |
| 2026-09-25 | The judges get the record view, the roster, the director's notes and the fact check's result now; their scores show as uncalibrated at the stops until calibrated against the director's verdicts. | Information architecture, Q4 |
| 2026-09-30 | One rule set: fifteen truth rules with reasons, craft guidance taken only from the director's own words and edits, what code can guarantee taken out of the prose, quotas and templates removed. Published articles are evidence of what goes wrong, not the bar. | Phase 3 prep grill; `docs/superpowers/specs/2026-09-30-rule-set.md` |
| 2026-09-30 | Nova is the uninterested third party the police deal required, and is never gendered. The verdict is the group's negotiated official story, and the article shows how the players' choices made it. | Phase 3 prep grill, T3, T4, round 5 |
| 2026-09-30 | The evidence path is simplified in its own phase (3b): every unlocked document reaches the writers; the scoring, the summaries and two stops go. | Phase 3 prep grill, D11 |

## Known gaps

These are recorded so no one mistakes them for intended behaviour. The phase that removes each is named in brackets. The full map of what every call sees, the objectives it serves, the comparison with published practice and six root causes are in `docs/superpowers/specs/2026-09-24-information-architecture.md`. Phase 2 closed seven of the eight gaps listed here before it: reworkers without their writers' inputs, an article evaluation with no record, sidebar text the writer was asked for and the check read, the "or drop the card" fix line and the quotation-mark failure, the remote block announcing absence, presence markers under the mode block, and the arc note lost on reload.

- Should-consider findings do not survive a rollback. [7]
- Who exposed each memory is kept and shown at the input review, but no writer reads it until the rule on naming an exposer is settled. [3]
- The rework rules say "preserve, do not regenerate" whatever the director asked for. [3, then 11]
- The detective photo-enrichment file keeps two first-person examples. [3]
- A Haiku pass writes a caption for every photo that no prompt prints. [9]
- The console cannot set a photo's exclude flag, and the writers' photo lists do not filter on it. [9]
- The Haiku summaries made before curation are not written to the call log. [no phase yet]
