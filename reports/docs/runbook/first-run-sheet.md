# First session on the story meeting, the map and the desk: run sheet (2026-10)

This session tests phase 4. Its readout counts what the pipeline asked of you: how many times it called you back, how much you read at each return, what you changed at the desk (moving and cutting blocks against rewording), and whether the story changed after the meeting (spec `docs/superpowers/specs/2026-10-02-story-meeting-and-map.md`, section 13).

## Before you start
1. Local `main` is the merged branch; `npm start` from `reports/`. If a server is already running, stop it first: the graph and the stops changed.
2. `curl -s localhost:3001/api/health` answers. The database is the default `data/checkpoints.sqlite` (no `CHECKPOINT_DB_PATH` set).
3. Open `docs/runbook/decision-log-template.md`, copy it to `data/<id>/decision-log.md`.

## Starting the session
- Session ID = the session date as MMDDYY (second session the same day: add a digit).
- **Report Theme**: NovaNews Article. The detective theme is parked, and the form says so beside it.
- Leave **Photos Path (optional)** blank if the photos are not curated yet: the pipeline asks for the folder after the story meeting.
- Put the whiteboard photo in **Whiteboard Photo (Optional)**. A whiteboard inside the photos folder is left out of the article but NOT read.
- A session started before phase 4 cannot go on as it was. Opening one shows "This session was started before the story meeting. Roll back to the story meeting to continue." with a **Roll back to the story meeting** button: the rollback keeps the parse, the curation and the photos, and writes the weave fresh, about 15 minutes with its fact check.

## During the run
- Never restart the server while a step is running. Restart only at a pause (a stop).
- If the page resets to the blank Session screen: note the time in the decision log, open the browser DevTools console and run
  `document.wasDiscarded; performance.getEntriesByType('navigation')[0].type` and write down both values, then type the session ID and click **Resume**. Nothing is lost.
- Every note you type is kept: each stop shows the notes so far, folded, and every later writer reads them.
- Going back to the story meeting or the map costs no model call: each reopens as you left it.

### The story meeting (the stepper's "Story meeting")
About 400 words, in this order:
1. **The verdict**, from the parse: who the room named, the charge, a split final vote.
2. **The story**, **The question it carries** and the **Working headline**.
3. **From your notes**: your own words the story rests on. When your notes end without your read, the page says "Your notes end without your read of the session, so this story is the writer's proposal."
4. **The threads**, each with its role, its receipt by document and owner ("Receipt: ..."), and a left-out thread's reason ("Left out because: ..."). The thread that tells the room's verdict carries the badge "the room's verdict".
5. **Where they touch**: the connections, each with what it shares and the threads it joins. Then **Where they converge**.
6. **A stronger main thread**, when the writer sees one, with its reason.
7. **Questions**, each with "Its answer changes: ..." and an answer box.

After a round, the round's lines sit above the verdict: a check still failing, each line the round changed, **Your edits a rework changed** with the rework's reasons, or a line that your edits stand.

What each control does, and where your input goes:
- **The story, the question, the headline and the convergence** are text boxes. What you type is final, and it is what the map writer reads.
- **A thread's role picker** (Main thread, Grounds it, Complicates it, Mirrors it, Carries it forward, Left out) changes its role. **Add a thread** takes one line, "A thread the writer missed, in one line", and a role; **Take out** removes a thread you added at this look.
- **Strike** takes a connection out of the story; **Unstrike** brings it back.
- **Your answer**, under each question: the answer travels with its question to every later writer as your words, and no later writer asks it again.
- **Note to the writer, sent with whichever button you press**: with Approve it stands for every later writer; with Reweave the writer fits it in with your changes; with Send back the writer rethinks the weave as it asks.
- **Approve**: the weave as you left it goes to the map writer, which fits your changes in and lists what it changed on the map.
- **Reweave**, offered once you have changed the weave or written a note: the writer fits your changes in, keeps every line you did not touch, and the meeting reopens with the changes marked. About 10 minutes, with the fact check.
- **Send back** needs a note and takes two clicks (**Confirm send back, starts a rework**): the writer rethinks the weave. It changes one of your edits only where your note's change means it no longer fits, and the meeting then lists each it changed, with the reason.
- When a reweave or a send-back times out, the meeting says so ("Your reweave did not run: the writer timed out, and the weave is as you left it.") and how to retry. If your note is still in the box, **Approve** asks first: **Keep it and approve** or **Clear it and approve**.

### Photos and character IDs
- **Photos (optional)** asks for the folder: **Use This Folder**. **Back to the story meeting (no model call)** reopens the meeting as you left it.
- **Character IDs** shows each photo with its AI Analysis, a **Your Description** box (who is in it and what moment it catches; the caption keeps it) and a **Leave this photo out** box. A photo left out appears nowhere: not on the map, the page or the published folder. **Submit Character IDs** sends your descriptions and the boxes; **Skip** sends no identifications, and the ticked photos are still left out.

### The map (the stepper's "Map")
About 450 words, in this order:
1. **The settled story**, read-only, with **Back to the story meeting**, which reopens the meeting as you left it, with no model call. To change the story, go there.
2. The round's lines: after a send-back, the round and the note it carried; a check still failing; your edits a rework changed, or that your edits stand.
3. **The gap**, when the map has one: one line on a part of the story the record cannot carry, a player who cannot be placed, or a link the weave lacks, and "It raises:" the players it names.
4. The headline, the deck and the **Top photo, printed above the article**.
5. Each section under its label: **Heading:** ("none printed" for a section that prints none), **Job:**, its beats (each with its kind, its material named by document and owner, a "Card:" badge for a card and a "lands here" badge for a connection from the meeting, and "Shows:" its players) and its photos.
6. **Dropped**: each section the story does not use, with its reason.
7. **Everyone:** where each player appears; "In no beat:" and "Raised in the gap note:" when there are any; the cards (3 to 5) and the photos placed of those you kept; the expected length.
8. **Left out (n)**, folded.
9. **What the map changed to fit your meeting**, each with its source: "Your change E3 at the meeting" or "Your note at the meeting".

What each control does:
- **The pencil** on a line opens its editor: the headline and the deck, the gap, a section's heading and job, a beat (material, kind, players, card, connection), and the expected length ("The article writer aims at it, so set it lower when you strike beats.").
- On a beat: **Move to…** another section, the photos beside it going with it; **Strike** puts it in Left out. **+ Add a beat** adds one to a section, with its material and its players; **Take out** removes a beat you added at this look.
- On a photo: where it sits in its section (beside a beat, or "By itself, with its people"), and **Move to…** another section or the top. The top photo moves with **Move into a section…**. Every photo stays placed once.
- In Left out, **Bring back to…** puts a beat back into the section you pick.
- **Note to the writer, sent with whichever button you press**: with Approve it stands for every later writer; with Send back the writer reworks the map as it asks.
- **Approve**: the article writer writes from the map as you left it. **Send back** needs a note and takes two clicks.

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
