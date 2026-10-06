# First session on the story meeting, the map and the desk: run sheet (2026-10)

This session tests phase 4. Its readout counts what the pipeline asked of you: how many times it called you back, how much you read at each return, what you changed at the desk (moving and cutting blocks against rewording), and whether the story changed after the meeting (spec `docs/superpowers/specs/2026-10-02-story-meeting-and-map.md`, section 13). Since phase 4b's piece 1 the meeting and the map show the story in plain words, with the evidence folded under each line, and the readout also reads the words each page showed, whether your changes landed, and whether the article's cards and quotations came from the evidence the map's beats carried (spec `docs/superpowers/specs/2026-10-05-story-level-and-evidence.md`, section 12). Since phase 4b's piece 3 the meeting pitches two or three angles, and the readout also reads which angle you sent, what you changed on it, and whether the map follows it (spec `docs/superpowers/specs/2026-10-06-meeting-as-angles.md`, section 15).

## Before you start
1. Local `main` is the merged branch; `npm start` from `reports/`. If a server is already running, stop it first: the graph and the stops changed.
2. `curl -s localhost:3001/api/health` answers. The database is the default `data/checkpoints.sqlite` (no `CHECKPOINT_DB_PATH` set).
3. Open `docs/runbook/decision-log-template.md`, copy it to `data/<id>/decision-log.md`.

## Starting the session
- Session ID = the session date as MMDDYY (second session the same day: add a digit).
- **Report Theme**: NovaNews Article. The detective theme is parked, and the form says so beside it.
- Leave **Photos Path (optional)** blank if the photos are not curated yet: the pipeline asks for the folder after the story meeting.
- Put the whiteboard photo in **Whiteboard Photo (Optional)**. A whiteboard inside the photos folder is left out of the article but NOT read.
- A session started before phase 4 cannot go on as it was. Opening one shows "This session was started before the story meeting. Roll back to the story meeting to continue." with a **Roll back to the story meeting** button: the rollback keeps the parse, the curation and the photos, and writes the weave fresh, about 15 minutes with its fact check. A session paused at the story meeting or later before phase 4b's piece 3, whose meeting holds one story rather than angles, shows a message that its story meeting was written before the present one, with the same button, which writes the angles fresh the same way, about 10 minutes with the fact check. A finished session of that kind shows the same message above its completion; its published report is unaffected.

## During the run
- Never restart the server while a step is running. Restart only at a pause (a stop).
- If the page resets to the blank Session screen: note the time in the decision log, open the browser DevTools console and run
  `document.wasDiscarded; performance.getEntriesByType('navigation')[0].type` and write down both values, then type the session ID and click **Resume**. Nothing is lost.
- Every note you type is kept: each stop shows the notes so far, folded, and every later writer reads them.
- Going back to the story meeting or the map costs no model call: each reopens as you left it.

### The story meeting (the stepper's "Story meeting")
A memo of two or three angles, each a story the article could tell, with one open at a time: angle 1 when the page first opens. With any angle open, the page comes to at most 450 words. The checks hold the writer's own lines to 450 less the words code prints (the verdict, the "Open below" line, the line that keeps the verdict's thread in, the labels), and never to fewer than 350, so a long split vote can run the page past 450. The writer's lines are in plain words, with no quotations, figures, times or document ids; only the headlines, which the article would print, and the questions, which may name the figure they ask about, are exempt. In this order:
1. **The verdict**, from the parse: who the room named, the charge, a split final vote. Then **From your notes**: your own words angle 1 rests on. When your notes end without your read, the page says "Your notes end without your read of the session, so every angle is the writer's."
2. **The angles** side by side, each its headline and its one sentence. The open angle's card says "Open below".
3. The open angle's pitch: its headline, its story, the question it carries, why it lands with the players and where it ends up, with the questions about who appears in the story beside it.
4. **In the story**: the open angle's threads, in its order, each its name and its line, with the questions whose answers change it beside it. The verdict's thread says "Always in: the article reports the verdict." Then **Left out**: the threads the angle leaves out, by name, each opening in place to its line. Then **Add a thread**.
5. **Where they meet**: the line of each connection between two threads in the story. A connection shows only while both its threads are in.

Each question comes to 40 words at most, with "Its answer changes: ..." and an answer box. Under each thread and each connection, **What's behind it** opens its evidence in place: each piece by its source (a document by its name and owner, the ledger, the evidence log or your notes), what it shows, and "Cuts against" on a piece that cuts against the line. You never need to open it: the writers choose and cite the evidence. A thread you added shows "Nothing yet: the map writer finds the evidence for it." No line names an angle, a thread or a connection by a tag such as t1 or c3.

A check still failing sits under the line it is about, in plain words, or above the verdict when no one line holds it, such as a page past its length. After a round, the round's lines sit above the verdict too: each line the round changed, **Your edits a rework changed** with the rework's reasons, or a line that your edits stand.

What each control does, and where your input goes:
- **An angle's card** opens it below, with no model call. Whichever angle is open when you press a button is the one that goes.
- **The open angle's pitch lines, and each thread's name and line**, are text boxes. What you type is final, and it is what the map writer reads. A change to a pitch belongs to its angle and stays on the page when you switch angles; a change to a thread shows in every angle that uses it. A change to an angle you do not send is not kept past the round.
- Each thread's flip control, labelled for screen readers "Leave out of the story" or "Bring into the story", takes it out of the open angle or brings it in; a thread you bring in goes after the angle's own. The verdict's thread stays in. Taking a thread out takes its connections off the page; to drop a connection while both its threads stay in, say so in a note with Reweave or Send back.
- **Add a thread** takes a name, what happened with its people, and the thread in one line; it goes into the open angle. **Take out** removes a thread you added at this look. Your changes are to the lines: the evidence stays the writers'.
- **Your answer**, under each question: the answer travels with its question to every later writer as your words, and no later writer asks it again.
- **Note to the writer, sent with whichever button you press**: with Approve it stands for every later writer; with Reweave the writer fits it in with your changes; with Send back the writer rethinks the angles as it asks.
- **Approve**: the open angle as you left it goes to the map writer, with each thread's evidence, and no wait. It fits your changes in and lists what it changed on the map, and it finds the evidence for a thread you added, or says in the map's gap line that the record cannot carry it.
- **Reweave**, offered once you have changed the open angle or a thread, or written a note (a pick alone, or answers alone, have nothing to fit in): the writer makes the rest of the open angle agree with your changes on it and on its threads (your changes on other angles stand as they are), finds the evidence for a thread you added, and writes the connections between the threads now in. Your lines stay as you wrote them, and the other angles, and every thread and connection outside the open angle, come back as they were, so you can still switch. The meeting reopens on the same angle with the changes marked. About 8 to 15 minutes, with the fact check.
- **Send back** needs a note and takes two clicks (**Confirm send back, starts a rework**): the writer rethinks the angles as the note asks, and may rewrite any of them or pitch new ones ("lead with the money", "none of these; pitch me three about the Valet"). It changes one of your edits only where your note's change means it no longer fits, and the meeting then lists each it changed, with the reason. It reopens on the angle you had open, if the rework kept it, otherwise on angle 1.
- When a reweave or a send-back times out, the meeting says so ("Your reweave did not run: the writer timed out, and the weave is as you left it.") and how to retry. If your note is still in the box, **Approve** asks first: **Keep it and approve** or **Clear it and approve**.

### Photos and character IDs
- **Photos (optional)** asks for the folder: **Use This Folder**. **Back to the story meeting (no model call)** reopens the meeting as you left it.
- **Character IDs** shows each photo with its AI Analysis, a **Your Description** box (who is in it and what moment it catches; the caption keeps it) and a **Leave this photo out** box. A photo left out appears nowhere: not on the map, the page or the published folder. **Submit Character IDs** sends your descriptions and the boxes; **Skip** sends no identifications, and the ticked photos are still left out.

### The map (the stepper's "Map")
The page comes to at most 450 words as it first opens. The checks hold the writer's own lines to 450 less the words code prints (the settled story, your photo descriptions, the counts), and never to fewer than 300, which the writer aims for, so long photo descriptions can run the page past 450. The moves are in plain words, with no quotations, figures, times or document ids. In this order:
1. **The settled story**: the story and question of the angle you sent, read-only, with **Back to the story meeting**, which reopens the meeting as you left it, with no model call. To change the story, go there.
2. The round's lines: after a send-back, the round and the note it carried; your edits a rework changed, or that your edits stand. A check still failing sits under the line it is about, in plain words, or here when no one line holds it.
3. **The gap**, when the map has one: one line on a part of the story the record cannot carry (a thread you added at the meeting, or brought into the angle, among them, named by its name), a player who cannot be placed, or a link the angle lacks, and "It raises:" the players it names.
4. The headline, the deck and the **Top photo, printed above the article**.
5. Each section under its label: **Heading:** ("none printed" for a section that prints none), **Job:**, its beats, each as its move, "Shows:" its players and "(card)" where its evidence prints as a card, and its photos, each by your description beside its thumbnail. Under each beat, **What's behind it** opens its evidence, as at the meeting, with the card's document among its pieces; a beat you added shows "Nothing yet: the article writer finds the evidence for it." No line names a beat by a tag such as b6.
6. **Dropped**: each section the story does not use, with its reason.
7. **Everyone:** where each player appears; "In no beat:" and "Raised in the gap note:" when there are any; the cards (3 to 5) and the photos placed of those you kept; the expected length.
8. **Left out (n)**, folded.
9. **What the map changed to fit your meeting**, each with its source: your change, by the line it sits on at the meeting, or "Your note at the meeting".

What each control does:
- **The pencil** on a line opens its editor: the headline and the deck, the gap, a section's heading and job, a beat (its move and its players), and the expected length ("The article writer aims at it, so set it lower when you strike beats."). Your changes are to the lines: the evidence stays the writers'.
- On a beat: **Move to…** another section, the photos beside it going with it; **Strike** puts it in Left out. **+ Add a beat** adds one to a section, with its move and its players; **Take out** removes a beat you added at this look.
- On a photo: where it sits in its section (beside a beat, or "By itself, with its people"), and **Move to…** another section or the top. The top photo moves with **Move into a section…**. Every photo stays placed once.
- In Left out, **Bring back to…** puts a beat back into the section you pick.
- **Note to the writer, sent with whichever button you press**: with Approve it stands for every later writer; with Send back the writer reworks the map as it asks.
- **Approve**: the article writer writes from the map as you left it, each beat from the evidence it carries, and finds the evidence for a beat you added. **Send back** needs a note and takes two clicks.

### The desk (the stepper's "Article")
The article as it will print, with every editor visible and nothing in front of it: the word count, the hero, **Settled at the story meeting** (the story and its question, read-only), the headline, the byline, and each section with its blocks.
- **Each block's rail**: the pencil edits it in place; ↑ and ↓ move it one step; **Move to** sends it to the end of another section; ✕ deletes it (click again, **Delete?**, to confirm); +¶ and +❝ insert a paragraph or a quote after it. A section's heading has the same two inserts for its top. Photos and cards come from the record: move or delete them; they are never inserted.
- **Show the page as it will print** shows the page as you have it, photo spacing included.
- **The marks** sit beside their paragraph, each under its label: **The judge could not fix this**, **Fact check**, **Fact check, advisory**, **Concern about your edit** or **Your edit**. A mark about a line, a card or a photo you have since changed or taken out folds into **Possibly resolved by your edits**; a mark with no block to sit beside is listed under **Not beside any block**, by the buttons.
- **To fix before you approve or send back** lists each empty block, and a headline or deck past its limits. An empty block is caught before Approve and before Send back.
- **Note to the writer, sent with whichever button you press**: with Approve it stands for every later writer; with Send back it drives the rework, and then stands. "Your hand edits are sent with this note. The writer is told to keep them."
- **Approve** publishes exactly what is on the desk. Its label counts the fact check's unresolved structural issues ("Approve anyway (n unresolved)"). A photo you deleted joins the leave-out list.
- **Send back** needs a note and takes two clicks. The whole article goes back for a structural rework, with your edits as you made them, unless the note's change means one no longer fits.
- **JSON Editor** edits the whole article as JSON (**Save & Approve**).
- Folded below the article: the fact check's whole list, the trace of the automatic reworks, and **Round N: your notes, and what the reworks did to your edits**.

## After publishing
1. Fill the end-of-run block of the decision log.
2. The readout reads the saved versions (`data/<id>/analysis/weave.approved.json`, `data/<id>/analysis/map.approved.json`, `data/<id>/output/content-bundle.approved.json`), the stops log (`data/<id>/stops.jsonl`) and the per-call prompt log (`data/<id>/llm-log/`).
3. Run the two-pass refinement with a findings file, and add one column per finding: *which stop could have caught this, and why it did not*.
4. Do not commit: anything under `data/`, `outputs/report-<id>.html`, `outputs/sessionphotos/<id>/`.
