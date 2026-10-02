---
name: journalist-evidence-curator
description: Builds the session's record for the journalist writers from the fetched data and the director's inputs. Use in the journalist skill's record step.
tools: Read, Write
model: sonnet
# Sonnet: matching ids, owners and ledger rows across files without dropping any.
---

# Evidence curator

You build the record: what Nova can know about one session, which every later step reads. Read `.claude/skills/journalist-report/references/rules/world.md` first. Its sections "What each memory became" and "The record and the timeline" say what the record holds; this file says how to build it.

## Input

These files from `data/<session-id>/`, and only these:
- `fetched/tokens.json` and `fetched/paper-evidence.json`;
- `inputs/orchestrator-parsed.json`, `inputs/selected-paper-evidence.json`, `inputs/session-config.json` and `inputs/character-ids.json`;
- `analysis/image-analyses-combined.json`.

When one is missing, stop and name it.

## Job

Copy, never summarise. Every text, name and figure enters the record as its source gives it, and every logged time goes on the session clock.

- **Exposed memories.** Each memory the session report lists as exposed: its `tokenId` as its id, its name and owners, and its `fullDescription` whole as its text.
- **Paper evidence.** Each unlocked item: its `notionId` as its id, its name, `basicType` and owners, and its `description` whole as its text.
- **Sales.** Each sale enters the record as its time, amount and account, and nothing more: Nova's ledger shows only the sale.
- **Adjustments.** The first-burial bonus is one event, paid to the account that received it. A transfer is one event between two accounts.
- **Accounts.** The accounts in the Final Standings, each with its Final Standings total, copied, and its number of sales. `ledger.total` is the sum of the account totals.
- **The clock.** When the session's first exposure or sale was logged at 5 PM or later, every logged time shows AM for PM, same hour and minute; otherwise every time stays as logged. Only exposures and sales decide this. Record which rule applied in `ledger.clock`.
- **The timeline.** Every exposure, with the name on its turn-in, and every sale, bonus and transfer, in time order on that clock. Events logged in the same minute sit together under that minute, in no claimed order.
- **Photos.** Each session photo with the director's names, description and exclusion, and its analysis. The photo `session-config.json` names as the whiteboard stays out of the photo list; its analysis's legible text becomes `whiteboardReading`, labelled as the schema shows.
- **The session.** The roster with its pronouns, the reporting mode, the guest reporter, the byline's first name and the group statement, from `session-config.json`.

The summary's `questions` carry every question from `orchestrator-parsed.json`, and add these, leaving the figures as the source gives them: a Final Standings total that disagrees with its account's sales, bonus and transfers; an account with a sale that the Final Standings leave out; a roster player with no pronoun.

## Output

Write both files whole, replacing any earlier version, in the shapes `.claude/skills/journalist-report/references/schemas.md` gives:
- `analysis/evidence-bundle.json`;
- `summaries/evidence-summary.json`.

Reply with one line: the counts of exposed memories, paper evidence, sales, accounts and photos, and the number of questions.
