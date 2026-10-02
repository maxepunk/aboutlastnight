---
name: journalist-report
description: |
  Makes one About Last Night session's NovaNews article in Claude Code, outside the director console: gathers the session's data, runs the journalist agents step by step and stops for the director at each decision. Use when asked to generate, write or draft a session's article or report here rather than in the console.
---

# NovaNews article, step by step

This skill makes one session's article, with the director deciding at each stop. The rule set in `references/rules/` decides what the article says and how: `world.md` (the game, what each memory became, the record), `truth-rules.md` (T1 to T15), the `craft-*.md` files (C1 to C19) and the mode files `mode-on-site.md` and `mode-remote.md`. Each agent reads the rule files its job needs. This skill holds the steps, the stops and the files passed between them; where anything below differs from the rule set, the rule set decides.

Run every command from `reports/`. The session id is the session date as MMDDYY. The session's files live in `data/<session-id>/`, in the shapes `references/schemas.md` gives.

## The agents

| Step | Agent | Writes |
|---|---|---|
| 5 | `journalist-image-analyzer` | one photo's analysis, in its reply |
| 7 | `journalist-evidence-curator` | `analysis/evidence-bundle.json`, `summaries/evidence-summary.json` |
| 8 | `journalist-arc-analyzer` | `analysis/arc-analysis.json`, `summaries/arc-summary.json` |
| 9 | `journalist-outline-generator` | `analysis/article-outline.json`, `summaries/outline-summary.json` |
| 10 | `journalist-article-generator` | `output/content-bundle.json`, `output/article-metadata.json`, `output/article.html` |
| 11 | `journalist-article-validator` | the validation result, in its reply |

Start each one with the Agent tool, giving it the session id; its definition names the files it reads. Read each step's summary file yourself; the agents work from the full files.

## Stops

At a stop, show the director the step's summary with its questions (`questions` or `writerQuestions`), then ask with AskUserQuestion whether to approve or send back. The director answers the questions and gives direction in a note.

Add every note the director gives at a stop to `stopNotes` in `inputs/director-notes.json`, word for word, with its stop and whether it came with an approval or a send-back. Every later agent reads the director's words there.

A send-back runs the step's agent again, starting from the files it wrote last time.

## Steps

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

The report writes an anonymous turn-in as "NovaNews (Anonymous)", in whatever spelling, and lists that label among the Final Standings too. The label marks an exposure anonymous and is never an account, so its Final Standings row stays out.

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

### 8. Find the arcs

Start `journalist-arc-analyzer`.

**Stop: the arcs.** Show `summaries/arc-summary.json`: the thesis, the arcs in their suggested order, the suggested opening photo and the writer's questions. Ask which three to five arcs to build on and which photo opens the article, and write both into `userSelections` in `analysis/arc-analysis.json`.

### 9. Plan the outline

Start `journalist-outline-generator`.

**Stop: the outline.** Show `summaries/outline-summary.json`.

### 10. Write the article

Start `journalist-article-generator`. It writes the bundle and renders `output/article.html`.

### 11. Check the article

Start `journalist-article-validator`. When it returns must-fix findings, show them and ask the director whether to send them back to the article generator as a rework or to go on to the stop. Check every rework again.

### 12. Stop: the article, and publish

Show the director the validation result, its should-consider list included, the writer's questions from `output/article-metadata.json`, and the page. The copy in the session folder shows no photos; the published copy does. A send-back is a rework of step 10.

On approval, publish:
- `output/article.html` as `outputs/report-<session-id>.html`;
- the session photos to `outputs/sessionphotos/<session-id>/`, where the page looks for them.

## When a step fails

- A fetch script that stops on `NOTION_TOKEN`: ask the director to set it.
- Photos missing from the folder: go on with the ones there, and tell the director which are missing.
- An agent that errors or returns nothing: start it once more; when it fails again, tell the director and stay at that step.
