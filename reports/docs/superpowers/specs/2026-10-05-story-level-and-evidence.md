# The story level, with the evidence underneath

Piece 1 of phase 4b in the roadmap (`docs/superpowers/plans/2026-09-22-roadmap.md`). The design was settled with the director on 2026-10-05, after session 100226, the first session run on phase 4. It changes what the story meeting's writer and the map writer produce, and what travels from them to the article writer.

It supersedes what the phase 4 spec (`docs/superpowers/specs/2026-10-02-story-meeting-and-map.md`) says about a thread's claim and its one receipt, a beat's material, the two pages' lengths of about 400 and 450 words, and the checks on them: sections 4.2, 4.3, 4.5, 4.6, 5.2, 5.4, 5.5 and 13, where they say so. Pieces 2 to 6 of phase 4b have their own specs: the review of the director's changes, the meeting's page, the map's page, the desk, and the review as the director works. The vocabulary is `CONTEXT.md`'s. This piece adds evidence, and gives thread and beat the meanings in section 3.

## 1. What piece 1 is for

The director gives input only at the level of the story. The story meeting and the map show the story and its structure in plain terms, short enough to read and change in minutes. The evidence behind every line travels underneath, so the article writer gets threads it can support and cite. The director can open it, and never needs to.

- The meeting shows what the story is and how its threads relate, in at most 300 words.
- The map shows what goes where, in what order, in at most 450 words, aiming for 300.
- The article is where the evidence is cited, in about 1,500 words.

## 2. Why: session 100226

Session 100226 ran cleanly up to the article stop. Every call completed. The meeting's fact check found two errors of fact, and its one fix cleared them. The map's checks passed with no rework, and the article judge found nothing to fix. The story meeting and the map did not work.

- **Too long.** The meeting showed 676 words and the map 1,193, against about 400 and 450 designed. The draft's prose came to 1,659 words, so the director read more planning than article.
- **The citation level.** Both pages carried the evidence itself.
  - The meeting had 11 threads and 8 connections, holding 13 quotations, vote counts, times and document ids. Its main thread read: "Ten voted overdose after Quinn's confession and Alex's 'Could it be that Marcus overdosed us?'; second count: Alex 5." One connection read: "mar004, first turned in at 08:52: 'The instructions were clear.' Whose?"
  - The map's 18 beats averaged 31 words, against 55 for a paragraph of the draft, and held about 30 quotations and 26 document ids. Almost every quotation reappeared word for word in the draft. The map had already chosen the article's material, and the article step mostly joined it up.
- **The design asked for it.** The phase 4 spec pinned each thread to one receipt, its strongest document, so a strong document came out as a thread of its own. Skyler's line about testing the prototype is evidence for the test-run thread, not a thread. The spec also named each beat by its material: the document, the speaker and the line, the ledger entry. So a beat was a source, not a move in the story.
- **The pages were forms.** Every field was an input and every link a dropdown of tags such as t1 or c3, with a menu and buttons on every line. Pieces 3 and 4 answer that. This piece answers the content.

The director called the two pages "a big wall of buttons and text that is really really hard to work with", and said: "Part of the point of this whole pipeline for all the stops (but especially story meeting and story map) is to abstract away my need to be able to keep track of every citation and focus on the big picture narrative with the writers knowing to pull right citations to assemble the right story."

## 3. A thread and its evidence

- **A thread is a line of the story:** an idea about what happened or what it means. The writers tell it through evidence, usually several pieces. Some threads appear only when sources are set side by side. On 100226, "the memories were sold off as the test run came to light" comes from setting the ledger's times against the time a memory was turned in, and no single document says it.
- **A piece of evidence is what gets cited:** a memory, a paper document, a ledger line, an exposure in the evidence log, or something the director's notes record from the room. One thread draws on many pieces, and one piece can serve several threads.
- **A connection** is where two threads touch, said in story terms, with the evidence that shows it underneath.
- **A beat** is one move of the story on the map: a few words in story terms, the people in it, the threads it carries, and the evidence under it. The code keeps the name beat.
- **The director's own words** (their notes, their corrections and their answers at the meeting) are evidence for what happened in the room, as T1 sets out. A line the director writes about the room is supported by their account. A line about what a document says, or about the money, needs the record behind it.

The director works with the threads and the moves. Choosing and citing the evidence is the writers' job, and the fact check holds them to the record.

## 4. What the director reads

### 4.1 The story meeting

At most 300 words as the page prints it, in this order:
1. the verdict, printed by code from the parse;
2. the story, the question it carries, and a working headline;
3. from your notes: the words of the director's own read that the story rests on, quoted exactly, when the story starts from it;
4. the threads in the story, each as its role, a short name and one line, the main thread first;
5. the left-out threads by name, each with its reason a click away;
6. where the threads touch: only the connections the story turns on, one line each;
7. where they converge, in one or two lines;
8. the optional stronger main thread, in one line (C1);
9. the questions, each with what its answer changes and its answer box (C15).

The writer's lines are in story terms: no quotation from a document, no figures, no clock times and no document ids. People's names are story terms. The only quotation on the page is the director's own words, in "from your notes".

A worked example: 100226's meeting as the writer proposed it, rewritten at this level, in 281 words.

> **The verdict:** an accidental overdose, by ten votes. No one accused.
>
> **The story:** The room called Marcus's death an accident, a verdict that left every hand clean, though its own evidence describes a test run of NeurAI's technology.
> **The question:** If Marcus died of his own dose, whose test run was it, and who inherits it?
> **Working headline:** Ten Votes Call Marcus Blackwood's Test Run an Accident
> **From your notes:** "the pilot run for a much bigger rollout of NeurAI's brilliant new memory technology"
>
> **The threads**
> **Main thread** · An accident: the room's verdict, which cleared every hand.
> **Grounds it** · Marcus's own dosing: he had been testing the drug on himself.
> **Complicates it** · The test run: the night tested NeurAI's technology on its guests, and some wanted it tested.
> **Complicates it** · Quinn's two stories: what Quinn told the room doesn't match Quinn's own memory.
> **Mirrors it** · The memories sold: sold off while the room argued.
> **Mirrors it** · Reality is negotiable: the truth around Marcus has been bent before.
> **Carries it forward** · The successors: NeurAI waits to name Quinn and Alex until the case closes.
> **Left out (3)** ▸ The other suspects · Protecting Sarah · Remi's and Zia's quarrels
>
> **Where they touch**
> Quinn and Alex steered the verdict, and they're the successors.
> Marcus's last memory says he followed instructions. Whose?
> The sales spiked just as the test run came to light.
> A negotiated verdict, beside Reality is negotiable.
>
> **Where they converge:** An overdose closes the case on the one man who can't answer. Does the pilot run become the rollout?
>
> **Question about Remi:** The notes record nothing Remi did in the room. What did Remi do? *Your answer gives Remi a moment in the article.* [answer box]

Shown with every thread and every connection the writer found, in full, the same meeting runs to 366 words. That is why the left-out threads appear by name and the writer shows only the connections the story turns on.

### 4.2 The map

At most 450 words as the page prints it, and the map writer aims for 300. The page shows:
- the headline, the deck and the top photo;
- the settled story, printed by code from the meeting, as now;
- each section in order: its heading, its job in one line, and its moves as short phrases with the people in them, a move whose evidence prints as a card marked "(card)";
- each section's photos, by the director's descriptions;
- the dropped sections, each with a one-line reason, as now;
- Everyone, the cards, the photos and the expected length;
- Left out, folded;
- the gap note and what the map changed to fit the meeting, in story terms, as now.

The moves name moments and people, never documents, quotations, figures or times. The headline and the deck are the article's own printed lines, so they keep whatever the article prints.

A worked example: 100226's map as written after the director's choices at the meeting, rewritten at this level, in 301 words.

> **Experiment Gone Wrong That Got Dubbed an Accident**
> By ten votes, the room called Marcus Blackwood's death an overdose that left every hand clean. The evidence it gathered describes a test run, with the guests as its subjects.
> *Top photo:* Riley, Nat, Sam, Quinn and Kai at the evidence screen as the final deliberations begin.
>
> **Lede** · *Opens on the vote and asks the question.*
> Alex's late theory that Marcus overdosed everyone · the quick vote for an accident · a verdict that cleared every hand · the question.
>
> **The Story** · *The room's case for an accident, then the turn.*
> Quinn's confession · Marcus dosing himself · Marcus summons Quinn, and an envelope changes hands (card) · the second count, where votes went to Alex · the company's work called worthless · the test run on the evidence board (card).
> *Photos:* Nat reviewing evidence · Remi, Jess and Alex at the bar's lock · Taylor, Kai, Nat and Riley comparing findings.
>
> **Follow the Money** · *What was sold while the room argued.*
> The memories sold off, and who Nova suspects bought them · a burst of sales just as the test run surfaced.
>
> **The Players** · *The choices around the verdict.*
> Quinn's account against Quinn's own memory (card) · Riley arms Mel to protect Sarah · Sarah's words to Jess (card) · Taylor's history of bending the truth.
> *Photos:* Sam searching under the rugs · Taylor and Remi with the evidence · Sarah and Alex's intense early talk · Kai sharing theories with Sarah and Remi.
>
> **What's Missing** · *What an overdose leaves outside the case.*
> Whose instructions Marcus followed (card) · who wanted the prototype tested · Vic, named and never voted on.
>
> **Closing** · *Where the threads meet.*
> The successors waiting on the case · does the pilot run become the rollout?
> *Photo:* Alex and Vic mid-negotiation.
>
> Everyone is placed · 5 cards · 9 of 9 photos · about 1,450 words
> **Left out (18)** ▸

## 5. What travels underneath

### 5.1 What each line carries

- **A thread** carries the pieces of evidence that tell it. Each piece names its source or sources: a memory or paper document by its id, the ledger, the evidence log, or the director's notes. It says what it shows in a short line, with the words or figures that matter. It is marked as supporting the thread or cutting against it. A piece that sets two sources side by side names both.
- **A connection** carries the evidence that shows where its two threads touch.
- **A move** carries the pieces its moment uses: pieces from its threads' evidence, and anything else the record gives that moment, such as a line from the director's notes. In a move marked "(card)", one piece is flagged as the card's document.

On 100226, two lines would open like this:
- **The memories sold:** the ledger's sales into ten accounts, with Rich and Kai taking the most; and the ledger set against the evidence log, five sales into Rich at 9:58, two minutes after "Tonight is the test run" was turned in. Nothing in the record cuts against it.
- **Marcus dosing himself:** Marcus's email asking Quinn to "go up on the dosage"; Sam's diary, "I think he's experimenting on himself"; and Jess's memory, "You know for a fact that he is."

### 5.2 How it travels

1. The meeting's writer attaches the evidence as it writes each thread and connection.
2. The code checks and the fact check read it (section 6).
3. When the director approves, the map writer receives each thread with its evidence, printed in the settled weave, and gives each move the pieces that tell it. It also reads the whole record.
4. The article writer writes each move from its pieces and cites them: the quotations, the figures and the times. It still reads the whole record for a scene's detail.

Each rework carries the evidence as its writer does.

### 5.3 The director's changes, until piece 2

The next writer finds the evidence for a line the director changes or adds. A thread added at the meeting gets its evidence from the map writer, and a move added on the map gets it from the article writer.
- If the record can't support a thread the director added, the map says so in its gap note, in story terms.
- If it can't support a move the director added, the fact check marks it at the desk.

Piece 2 moves that answer to the moment the director approves.

The evidence is never the director's edit. The director doesn't edit it, so it stays out of their edits, as a struck connection's flag and the answers do today. A writer that finds new evidence for a line the director wrote has not changed that line.

### 5.4 What the director sees of it

Nothing, unless they open a line. On today's pages, each line gets a fold, "What's behind it" (section 9). Pieces 3 and 4 open it in place.

## 6. The checks

### 6.1 Code checks

They run free, before the director sees either page, on the writer's output and on each rework's:
- **Length.** The meeting at most 300 words and the map at most 450, counted as the page prints it when it first opens, with the count the stops log records.
- **Story terms.** No document ids, quotation marks, clock times or money figures in the writer's lines. Exempt: the director's own lines, "from your notes", the verdict line, the working headline, and the map's headline and deck.
- **Structure, as now.** The verdict is one of the threads. Each connection joins two threads the weave holds. Each left-out thread has its reason, and every thread, connection and question has an id of its own. On the map, every thread in the story lands in at least one move, and every connection the story keeps lands too. Every roster player is in a move or raised in the gap note, every kept photo is placed once, and the cards number three to five.
- **The evidence.** Every piece names a source the record holds, and a quotation in a piece is word for word in its source. Every thread the writer put in the story has at least one piece that supports it. A move marked "(card)" flags one piece, whose source is a document in the record.

A failure sends the page back for one automatic rework, as now. A fault in one of the director's own changes is a concern beside the change, never a rework, as section 7 of the phase 4 spec sets out.

### 6.2 The fact check

One pass and one fix, as now. It reads each line against its evidence, and each piece against the record. A line that says more than its evidence shows is an error of fact. A finding about a piece of evidence is the writer's to fix, so the fix can cite something else.

### 6.3 What the director sees

Nothing, when everything passes. A check that still fails after the rework shows beside its line, in story terms.

## 7. The writers

- **The meeting's writer** writes the story, the question and the headline, and each thread as a role, a short name and one line, with its evidence attached. It shows only the connections the story turns on, each with its evidence, and lists the threads it leaves out by name, each with a reason. The lens work (C16) reaches the weave as each thread's role, and as evidence marked supporting the thread or cutting against it.
- **The map writer** reads the settled weave with each thread's evidence, then the record. It writes each section's moves in story terms, gives each move its threads, its people and its evidence, flags each card's document, and aims for 300 words.
- **The article writer** writes each move from its evidence, cites it, and reads the whole record for detail. It adds no beat, thread or connection, as now.

## 8. Rule text to change

The new text comes to the director to read before the build, as the rule text of phases 3 and 4 did.
- **C16** says an arc is "a claim about what happened, with its people, its evidence ...", that connections are "each named exactly", and that the article writer writes "from the documents the map names". Instead:
  - a thread is a line of the story in plain terms, with its evidence underneath;
  - a connection says in story terms where two threads touch, with the evidence that shows it;
  - the article writer writes from the evidence each move carries.

  The convergence still lands in the article in this session's names and sums. On the meeting's page it is a line in story terms.
- **C2** says a section's beats are "each named by its material: the document, the speaker and the line, the ledger entry". Instead, a beat is a move of the story in a few words, with its people, and its evidence names what the article will use.
- **C9:** the map marks the moves whose evidence prints as a card, and names the card's document underneath. The counts are unchanged.

## 9. Today's pages, until pieces 3 and 4

Piece 1 lands on its own with the console working, so today's two pages keep their layout and show the new lines. They change only as much as they must, because pieces 3 and 4 replace them.
- **The meeting.** Each thread shows its role, its name and its line, with a "What's behind it" fold in place of the receipt line. Each connection shows its line and the names of the two threads it joins, in place of its kind and their tags. The add-a-thread line takes a name, a line and a role.
- **The map.** Each move shows its words, its people and its card marker, with a "What's behind it" fold in place of its material, kind and card lines. Photos show the director's description beside the thumbnail. The beat editor and the add-a-beat line take a move's words and its people.
- **Both pages.** The tags (t1, c3, b6) leave the page. The fold lists each piece with its source by name (a document by its name and owner), what it shows, and whether it cuts against the line.

## 10. Sessions already running

- Piece 1 lands when no session is paused at the meeting or a later stop. Session 100226 will be finished before then.
- A session started earlier that reaches the meeting after that is fine: the new writer writes its weave.
- A session paused on the old shapes gets the old-thread message, extended to the old shapes, and a rollback to the meeting that writes the weave fresh: the weave writer and its fact check, about 15 minutes of model time.

## 11. What goes

- A thread's claim and its one receipt.
- A beat's material, and its kind and card id on the page.
- The tags on the two pages.
- The weave's bound of 500 words over the writer's own text, replaced by the page's count.
- From the prompts: "named exactly", "each beat naming its material", and the Receipts list as a list of receipts.

## 12. Cost and the test

- **Reading:** at most 300 words at the meeting and 450 at the map, against 676 and 1,193 on 100226.
- **Model time:** about the same as phase 4. The meeting's writer writes less on the page and more underneath, and the map writer writes less.
- **The test** is the director's next session after piece 1 lands:
  - what the stops log records at the meeting and the map;
  - whether the director's changes landed;
  - whether the article's cards and quotations come from the evidence the moves carried;
  - the article.

## 13. Out of scope

- Piece 2, the review of the director's changes on Approve and Reweave, and piece 6, the same review as the director works.
- Pieces 3 and 4, the meeting's and the map's new pages, and piece 5, the desk.
- The phases after 4b on the roadmap.

## 14. For the plan

Where the design meets the code. The footprint survey, kept locally at `.superpowers/sdd/2026-10-05-phase-4b-story-level/surveys/piece-1-footprint.md`, lists every place by file and line at `22082fa1`. These are integration points and the integrator's rulings, not decisions for the director.

- **The shapes.**
  - A thread: `{id, name, line, role, verdict?, reason?, evidence}`, with `reason` for a left-out thread.
  - A piece: `{sources, shows, stance}`. `sources` holds one or more of a document id, `ledger`, the evidence log and the director's notes; `stance` is supports or cuts against.
  - A connection: `{id, joins, line, kind, evidence}`. Its `kind` stays underneath, unprinted, so `isSameConnection` still tells a struck connection by its kind and its ends.
  - A beat: `{id, move, players, threads, connection?, card?, kind?, evidence}`. `card` is a marker, and one piece carries the card flag. `kind` stays underneath as a hint to the article writer, unprinted.
  - `WEAVE_SCHEMA` (`lib/sdk-client/subagents.js`), `DIRECTOR_WEAVE_SCHEMA` (`lib/meeting.js`), `outline.schema.json` with `mapSchemaFor` and `directorMapSchemaFor` (`lib/map.js`), and the console's copies (`DIRECTOR_WEAVE_SHAPE`, `validateMapShape`) move together, held equal by their existing tests.
- **The writers' prompts.** Only the lines code writes change. The evidence reaches the reworks, the article writer's `<STORY_MAP>` and both judges inside the JSON they already print.
  - The weave writer: `weaveOutputFormat`, `WEAVE_TASK` (at most 300 words, story terms, what the evidence holds), and the Receipts list, which becomes the list of sources a piece may name.
  - The settled weave (`renderSettledWeave`): each thread's role, name and line, with its evidence for the map writer. The receipt goes.
  - The map: `mapTask` (aim for 300, at most 450, each beat a move with its threads, people and evidence) and the schema's descriptions. The article writer: `STORY_MAP_LABEL`, and an `ARTICLE_TASK` line on citing each move's evidence. The inline card line reads the flagged piece's document.
  - The three writer renders pinned in `lib/__tests__/writer-prompts-pinned.test.js` are re-pinned, with the reason.
- **The checks.**
  - `weaveFindings` (`lib/weave.js`): the receipt checks become evidence checks, and the story-terms and length checks join them.
  - `mapFindings` (`lib/map.js`): the card checks read the flagged piece (`beatCardOf` and the card-count helpers). The new checks are that every thread in the story lands in a move, and the page's length. The connections check stays.
  - The length is counted by building the stop's page from the writer's output, as it would first open, with `lib/stop-pages.js` and `lib/word-count.js`. The page needs the evidence index and the questions (survey, section 2.6), which the node holds or can build.
- **The fact check.** `buildEvaluationUserPrompt('arcs')` already prints the weave as JSON; its opening line and `BREACH_NOTES.arcs` name the evidence. A finding that quotes a piece sits in nobody's printed text, so it stays the writer's must-fix (`locateQuotedText` reads only the printed fields).
- **The director's edits** (`lib/hand-edit-diff.js`).
  - `evidence` stays out of `weaveEditsBetween`, `weaveMarks`, the console's `meetingWeaveChanges` and `mapEditsBetween`, as `struck` and the answers do. Today a nested array is diffed: as one whole-field edit on the weave, which a pass's restore writes back, and as one edit per piece on the map, which never stands and whose restore would corrupt the beat (survey, Q1).
  - `WEAVE_PRINTED_FIELDS` and `mapParts` take the new text fields. `THREAD_FIELD_PLACES` and `meetingChangePlace` (`lib/meeting.js`) quote the line in place of the claim.
- **The console and the harness.** `meetingView`, `mapView`, `ArcSelection.js`, `Outline.js`, `outline-edit-logic.js` (`initBeat`, `buildBeat`, `addBeat`, the client gate), `unsaved-input-logic.js` and `lib/stop-pages.js` follow section 9. `receiptView` names each piece's sources through `evidenceIndex`. The map's payload carries the director's photo descriptions for the page.
- **Old shapes.** `oldThreadOf` (`lib/old-thread.js`) flags only a thread with no weave. It extends to a weave or a map in the old shape: a thread with no `line` or no `evidence`, or a beat with no `move`. Its rollback to the meeting clears the weave, its baseline and the director's edits, so the writer starts fresh.
- **Fixtures and scripts.** `scripts/lib/fixed-weave.js` and `scripts/lib/fixed-map.js`, whose planted failures become evidence failures; `lib/__tests__/fixtures/rework-state.js`, which about 65 test files read; the mock client's answers; and `__tests__/fixtures/mock-responses/weave.json` and `outline.json`.
- **The standalone skill** follows: `SKILL.md`'s two pages, `references/schemas.md` (held by `journalist-skill-path.test.js`), and the arc analyzer's, outline generator's and article generator's agents.
- **Docs.** `CLAUDE.md`, `CONTEXT.md` (Beat, Arc, Weave, Connection, Convergence, Story map, and a new entry for Evidence), `docs/PIPELINE_DEEP_DIVE.md` and `docs/runbook/first-run-sheet.md`.

## Decisions (2026-10-05)

- The director gives input only at the level of the story. The pipeline carries the citations through every stop underneath, so the article writer gets threads it can support.
- A thread is a line of the story; a piece of evidence is what gets cited.
- The meeting is at most 300 words and the map at most 450, aiming for 300, counted as each page prints. 100226's two pages at this level are the worked examples.
- The evidence travels: the meeting's writer attaches it, the fact check reads it, the map writer gives it to the moves, and the article writer cites it.
- The director's own words count as evidence for the room.
- Until piece 2 lands, the next writer finds the evidence for the director's changes, and the stop says so in story terms when the record can't support one.
- The director sees the evidence only by opening a line.
- The code checks hold the length, the story terms, the structure and the evidence, with one automatic rework, as now. The fact check reads each line against its evidence.
- C16, C2 and C9 change, and the director reads the new text before the build.
- Today's pages change only as much as they must.
- Piece 1 lands when no session is paused at the meeting or later. A thread on the old shapes rolls back to the meeting, where the weave is written fresh.
- Considered and dropped: a threads-by-sections grid on the map, whose cards were citations at this level; and a word such as "solid" or "thin" pasted on each thread.
