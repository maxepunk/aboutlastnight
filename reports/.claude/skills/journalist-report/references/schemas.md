# File shapes

The shapes of the files the journalist skill's steps pass to one another, under `data/<session-id>/`. Angle brackets hold placeholders, and `a | b` lists the allowed values. The inputs and the record keep every text, name and figure as their source gives it; the record puts logged times on the session clock.

What the article says, and how, is the rule set's (`references/rules/`). Two files take their shape from JSON schemas instead of this page:
- `analysis/article-outline.json`, the story map: `lib/schemas/outline.schema.json`;
- `output/content-bundle.json`: `lib/schemas/content-bundle.schema.json`, which `scripts/assemble-article.js` validates.

A **document** is any item of the record, an exposed memory or a piece of paper evidence, named by its `id`.

A **record question** is one the session report or the record leaves for the director at the record's stop:

```
{"kind": "player | pronoun | ledger", "about": "<the player's name, or for a ledger question the entry's time and amount, or the account>", "question": "<the question>"}
```

`kind` names the case: `player` when the record holds nothing about a player, `pronoun` when a roster pronoun is missing, `ledger` when a ledger entry or an account's total looks wrong. The weave's questions, asked at the story meeting, have the weave's own shape.

## Inputs

### inputs/session-config.json

```
{
  "sessionId": "<MMDDYY>",
  "roster": [{"name": "<the character's first name>", "pronouns": "<as the director gives them>"}],
  "reportingMode": "on-site | remote",
  "journalistFirstName": "<first name>",
  "guestReporter": {"name": "<name>", "role": "<role>"} | null,
  "accusationRaw": "<the group statement>",
  "whiteboardPhoto": "<filename> | null"
}
```

### inputs/director-notes.json

The director's words, in one place: the notes given at intake, and every note given at a stop.

```
{
  "notes": "<the director's notes, the epilogue included>",
  "stopNotes": [{"stop": "record | meeting | map | article", "kind": "approval | reweave | send-back", "text": "<the director's note>"}]
}
```

### inputs/orchestrator-parsed.json

The session report's rows, figures and times as written.

```
{
  "exposures": [{"memoryId": "<id>", "time": "<as logged>", "turnedIn": "anonymous | named: <name>"}],
  "sales": [{"time": "<as logged>", "amount": <number>, "account": "<account>"}],
  "adjustments": [{"kind": "bonus | transfer", "time": "<as logged>", "amount": <number>, "from": "<account> | null", "to": "<account>"}],
  "finalStandings": [{"account": "<account>", "total": <number>}],
  "questions": [<record question>]
}
```

### inputs/selected-paper-evidence.json

```
{"unlockedItems": ["<item name>"]}
```

### inputs/character-ids.json

```
{"photos": [{"filename": "<file>", "characters": ["<name>"], "description": "<the director's description>", "excluded": false}]}
```

## Photo analysis

One per session photo, the image analyzer's reply; `analysis/image-analyses-combined.json` is the list of them.

```
{
  "filename": "<file>",
  "visualContent": "<the setting, the objects and what is happening>",
  "people": [{"description": "<what tells this person apart in the frame>", "action": "<what they are doing>"}],
  "legibleText": "<text readable in the photo, as written> | null",
  "quality": "<blur, lighting or obstruction that limits use> | null"
}
```

## The record

### analysis/evidence-bundle.json

```
{
  "sessionContext": {"sessionId", "roster", "reportingMode", "journalistFirstName", "guestReporter"},
  "verdict": "<the group statement>",
  "exposedMemories": [{"id": "<tokenId>", "name": "<name>", "owners": ["<character>"], "text": "<fullDescription, whole>"}],
  "paperEvidence": [{"id": "<notionId>", "name": "<name>", "type": "<basicType, as fetched>", "owners": ["<character>"], "text": "<description, whole>"}],
  "ledger": {
    "clock": "as logged | evening session: times moved twelve hours",
    "accounts": [{"name": "<account>", "total": <number>, "sales": <number>}],
    "total": <number>
  },
  "timeline": [
    {"minute": "<hh:mm AM|PM>", "events": [
      {"kind": "exposure", "memoryId": "<id>", "turnedIn": "anonymous | named: <name>"},
      {"kind": "sale", "amount": <number>, "account": "<account>"},
      {"kind": "bonus", "amount": <number>, "account": "<account>"},
      {"kind": "transfer", "amount": <number>, "from": "<account>", "to": "<account>"}
    ]}
  ],
  "whiteboardReading": {"label": "A model's reading of the whiteboard photo: the room's working notes, context only", "text": "<legible text>"} | null,
  "photos": [{"filename": "<file>", "path": "<local path>", "characters": ["<name>"], "description": "<the director's description>", "excluded": false, "analysis": "<the photo analysis's visualContent>"}],
  "bundledAt": "<ISO timestamp>"
}
```

`ledger.total` is the sum of the account totals.

### summaries/evidence-summary.json

```
{
  "counts": {"exposedMemories": <n>, "paperEvidence": <n>, "sales": <n>, "accounts": <n>, "photos": <n>, "photosExcluded": <n>},
  "exposed": [{"id": "<id>", "owners": ["<character>"], "firstLine": "<the memory's first line>"}],
  "paperEvidence": [{"id": "<id>", "name": "<name>"}],
  "accounts": [{"name": "<account>", "total": <number>, "sales": <number>}],
  "clock": "<as in the ledger>",
  "verdict": "<the group statement>",
  "questions": [<record question>]
}
```

## The weave

### analysis/weave.json

The arc analyzer writes the weave. The director's changes at the story meeting are written into it, and every later step reads the weave as the director left it.

```
{
  "story": "<the thesis, in one to three sentences>",
  "question": "<the question the story carries through the article>",
  "headline": "<a working headline>",
  "fromYourNotes": "<the director's own words the story rests on, copied exactly>",
  "threads": [{"id": "<thread id>", "claim": "<what the thread claims, in one line>", "role": "main-thread | grounds-it | complicates-it | mirrors-it | carries-it-forward | left-out", "receipt": "<document id> | ledger", "reason": "<for a left-out thread, why the story does not need it>", "verdict": true}],
  "connections": [{"id": "<connection id>", "kind": "person | moment | document | line", "joins": ["<thread id>", "<thread id>"], "detail": "<where the two threads touch, named exactly>", "struck": true}],
  "convergence": "<where the threads converge and the story lands>",
  "strongerMainThread": {"thread": "<thread id>", "reason": "<why, in one line>"},
  "questions": [{"id": "<question id>", "kind": "player | pronoun | figure", "about": "<the player's name; for a figure, the ledger entry's time and amount or the words said in the room>", "question": "<the question>", "changes": "<what its answer changes in print>", "answer": "<the director's answer, word for word>"}],
  "directorChanges": [{"id": "E<n>", "change": "<what the director changed at the story meeting, as they gave it>"}]
}
```

`fromYourNotes` is there only when the story starts from the director's read, `verdict` only on the thread that carries the room's verdict, and `strongerMainThread` only when the writer sees one. A thread the director adds has an id of its own and may have no receipt. `struck`, `answer` and `directorChanges` are the director's, written at the story meeting: `struck` on each connection they struck, `answer` on each question they answered, and in `directorChanges` each change they made, under the next id from E1.

## The map

### analysis/article-outline.json

The story map, in the shape of `lib/schemas/outline.schema.json`. Each section's `slot`, and each dropped slot, is one of the journalist theme's slots, `map.slots` in `lib/theme-config.js`. The director's changes at the map's stop are written into it: a struck beat moves to `leftOut`, and a beat brought back moves into the section the director picks.

## The article

### output/article-metadata.json

```
{"narratorWords": <n>, "cards": <n>, "photos": <n>, "generatedAt": "<ISO timestamp>"}
```

`narratorWords` counts the headline, the deck and the paragraphs.

### Validation result

The article validator's reply.

```
{
  "passed": <true when mustFix is empty>,
  "mustFix": [{"rule": "<T1 to T15, or placed-player for a player the map places whom the page never names>", "text": "<the printed words at fault>", "record": "<what the record shows>", "fix": "<the change>"}],
  "flags": [{"flag": "em-dash | over-length", "where": "<the section id, or headline>", "text": "<the printed words, or the words per section>"}],
  "narratorWords": {"total": <n>, "bySection": {"<section id>": <n>}}
}
```
