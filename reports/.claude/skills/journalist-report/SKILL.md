---
name: journalist-report
description: |
  Makes one About Last Night session's NovaNews article in Claude Code, outside the director console: gathers the session's data, runs the journalist agents step by step and stops for the director at each decision. Use when asked to generate, write or draft a session's article or report here rather than in the console.
---

# NovaNews article, step by step

This skill makes one session's article, with the director deciding at each stop. The rule set in `references/rules/` decides what the article says and how: `world.md` (the game, what each memory became, the record), `truth-rules.md` (T1 to T15), the `craft-*.md` files (C1 to C19) and the mode files `mode-on-site.md` and `mode-remote.md`. Each agent reads the rule files its job needs. This skill holds the steps, the stops and the files passed between them; where anything below differs from the rule set, the rule set decides.

The story is settled in stages, as in the console: the record; the weave, the one story the article will tell, which the director settles at the story meeting; the story map, the weave laid across the article's sections, which the director settles at the map's stop; and the article, written from both.

Run every command from `reports/`. The session id is the session date as MMDDYY. The session's files live in `data/<session-id>/`, in the shapes `references/schemas.md` gives.

## The agents

| Step | Agent | Writes |
|---|---|---|
| 5 | `journalist-image-analyzer` | one photo's analysis, in its reply |
| 7 | `journalist-evidence-curator` | `analysis/evidence-bundle.json`, `summaries/evidence-summary.json` |
| 8 | `journalist-arc-analyzer` | `analysis/weave.json` |
| 9 | `journalist-outline-generator` | `analysis/article-outline.json` |
| 10 | `journalist-article-generator` | `output/content-bundle.json`, `output/article-metadata.json`, `output/article.html` |
| 11 | `journalist-article-validator` | the validation result, in its reply |

Start each one with the Agent tool, giving it the session id, and for a round from a stop, which round it is; its definition names the files it reads.

## Stops

At a stop, show the director what the stop decides, then ask with AskUserQuestion whether to approve or send back, and at the story meeting whether to reweave. The record's stop shows `summaries/evidence-summary.json` with its questions; the story meeting, the weave; the map's stop, the map; the article's stop, the page with the validation result.

At the story meeting and the map's stop the director's changes are final: write each into the step's file as the director gives it, word for word. Add every note the director gives at a stop to `stopNotes` in `inputs/director-notes.json`, word for word, with its stop and its kind: an approval, a reweave or a send-back. Every later agent reads the director's words there.

A send-back needs a note. It runs the step's agent again, starting from the files it wrote last time, with the note as its task.

## Steps

Before step 1, look in `data/<session-id>/`. The console writes its own files there under the names this skill uses, in its own shapes, and reads them back when it resumes or rolls back the session; a console session paused at an early stop may hold only `fetched/`. When the folder already holds any file, tell the director what is there, and ask whether to go on before writing anything in it.

### 1. Gather the session's inputs

Ask for each input that is missing, and have every required one before step 2.

Required:
- the roster: the first name of each character played, with the pronouns the director gives;
- the group statement, word for word;
- the session report: its exposures, sales, adjustment rows and Final Standings;
- the director's notes, the epilogue included;
- the folder of session photos, and which photo is the whiteboard.

Optional: the reporting mode (`on-site`, the default, or `remote`), a guest reporter's name and role, and Nova's first name for the byline (default Cassandra).

Write `inputs/session-config.json`, and `inputs/director-notes.json` with the notes and an empty `stopNotes`.

### 2. Copy the session report

Copy the session report's rows into `inputs/orchestrator-parsed.json`, figures and times as written:
- each exposure, with the name on its turn-in, or anonymous;
- each sale: its time, amount and account;
- the first-burial bonus, as one adjustment paid to the account its payment row credits. The game master's setup row and the reversal row on the bonus's holding account are bookkeeping, so leave both out;
- each transfer, which the report books as two rows, a credit on the receiving account and a debit on the sending account whose detail reads "To<account>". Copy the pair as one adjustment, from the sender to the receiver, at the credit row's time;
- the Final Standings, each account with its total, without the bonus's holding account.

The report names an anonymous turn-in with a label of one form: the newsroom's name, "NovaNews" or a misspelling of it, followed by "(Anonymous)". The Final Standings list that label too, at zero. The label marks an exposure anonymous and is never an account, so its Final Standings row stays out. An account that a sale, the bonus or a transfer paid stays, whatever its name, "Anonymous" included.

A row that fits none of these, or a figure that looks wrong, goes in `questions`.

### 3. Fetch the memories and the paper evidence

The scripts read `NOTION_TOKEN` from the environment.

```
node .claude/skills/journalist-report/scripts/fetch-notion-tokens.js --token-ids=<exposed memory ids, comma-separated> --pretty --output=data/<session-id>/fetched/tokens.json
node .claude/skills/journalist-report/scripts/fetch-paper-evidence.js --pretty --output=data/<session-id>/fetched/paper-evidence.json
```

Fetch only the exposed memories. A sold memory reaches the record as its sale and nothing more.

**Stop: the unlocked paper evidence.** List every fetched item, numbered and grouped by type, and ask the director in chat which numbers were unlocked this session. Write `inputs/selected-paper-evidence.json`.

### 4. Gather the photos

Copy the session photos to `assets/images/<session-id>/photos/`, count them, and confirm each file is on disk before step 5.

### 5. Describe every photo

Start one `journalist-image-analyzer` per session photo, the whiteboard's included, all in one message so they run together, each with the photo's absolute path. Collect the replies, one per photo, in `analysis/image-analyses-combined.json`.

### 6. Stop: who is in each photo

Show the director each session photo other than the whiteboard (Read it) beside its analysis, and ask in chat, as a numbered list: who is in it, one line on what it shows, and whether to leave it out. Write `inputs/character-ids.json` with the director's words as given.

### 7. Build the record

Start `journalist-evidence-curator`.

**Stop: the record.** Show `summaries/evidence-summary.json` with its questions. The director approves or corrects. A correction to something the record copies (a pronoun, the reporting mode, a ledger row) is made in the input file that holds it, and the curator runs again.

### 8. Write the weave

Start `journalist-arc-analyzer`.

**Stop: the story meeting.** Show the weave as one page at the level of the story, in this order:
1. the verdict: the group statement, from the record;
2. the story, the question it carries and the working headline;
3. from your notes, or, when the weave has none, the line "Your notes end without your read of the session, so this story is the writer's proposal.";
4. the threads in the story, the main thread first, each as its role, its name and its line;
5. the threads left out, by name, with their reasons when the director asks;
6. where the threads touch: each live connection's line, with the names of the two threads it joins; then where they converge;
7. the stronger main thread, when the weave has one;
8. the questions, each with what its answer changes.

The page names a thread by its name and a connection by its line, and shows no ids. Each line's evidence stays off the page: when the director asks what is behind a line, show its pieces under it, each piece's sources by name (a document by its name and owner in the record; the ledger, the evidence log or the director's notes), what it shows, and whether it cuts against the line. A thread the director added has none yet: the outline generator finds its evidence. Counted without the evidence, the arc analyzer's page comes to at most 300 words; the director's own additions may take it past.

The director can edit the story, the question, the headline and the convergence; change a thread's role; add a thread with a name, a line and a role; strike a connection, or bring a struck one back; answer each question; and leave a note. The evidence is the writers', so a change is to the lines alone. Write each answer on its question, and each other change into `analysis/weave.json`, listed in `directorChanges` (`references/schemas.md`, "The weave"). Then:
- **Approve**: go on to step 9.
- **Reweave**, once the director has changed more than the answers or written a note: start `journalist-arc-analyzer` for a reweave, then hold this stop again.
- **Send back**, with a note: start it for a send-back, then hold this stop again, showing each of the director's changes the rework changed, with its reason.

### 9. Lay out the map

Start `journalist-outline-generator`.

**Stop: the map.** Show the map as one page at the level of the story, in this order:
1. the settled story: the weave's story and question, read-only;
2. the gap line, when the map has one;
3. the headline, the deck and the top photo;
4. each section in the map's order, under its slot's label: its heading, its job, its beats, each as its move and its people with "(card)" after a beat marked as a card, and its photos;
5. the dropped sections, each with its reason;
6. Everyone: where each roster player appears, from the beats' players; then the cards, the photos placed of those the director kept, and the expected length;
7. left out, when the director asks;
8. what the map changed to fit the meeting's changes, each with its source.

The page names a beat by its move, and shows no ids. Each photo goes by the director's description in `inputs/character-ids.json`, or its filename when there is none. Each beat's evidence stays off the page, as at the story meeting, with the card's document marked among its pieces. A beat the director added has none yet: the article generator finds its evidence. Counted without the evidence, the outline generator's page comes to at most 450 words, aiming for 300; the director's own additions may take it past.

The director can edit any line, a beat's move and its people among them; move a beat to another section, or a photo to another section or the top; strike a beat into left out; bring a beat back from left out into a section they pick; add a beat with its move and its people; and leave a note. Write each change into `analysis/article-outline.json` (`references/schemas.md`, "The map"). Then:
- **Approve**: go on to step 10.
- **Send back**, with a note: start `journalist-outline-generator` again, then hold this stop again.
- **Back to the story meeting**, to change the story itself: hold step 8's stop again on the weave as the director left it, with no agent run. After its approval, step 9 writes the map again.

### 10. Write the article

Start `journalist-article-generator`. It writes from the settled weave and the map as the director left them, each beat from the evidence it carries, and renders `output/article.html`.

### 11. Check the article

Start `journalist-article-validator`. When its `mustFix` list holds findings, show them and ask the director whether to send them back to the article generator as a rework or to go on to the stop. That rework gets the `mustFix` list alone: the flags are the director's, shown at step 12. Check every rework again.

### 12. Stop: the article, and publish

Show the director the validation result, its flags included, and the page. The copy in the session folder shows no photos; the published copy does. A send-back is a rework of step 10.

On approval, publish:
- `output/article.html` as `outputs/report-<session-id>.html`;
- the session photos to `outputs/sessionphotos/<session-id>/`, where the page looks for them.

## When a step fails

- A fetch script that stops on `NOTION_TOKEN`: ask the director to set it.
- Photos missing from the folder: go on with the ones there, and tell the director which are missing.
- An agent that errors or returns nothing: start it once more; when it fails again, tell the director and stay at that step.
