# File shapes

The shapes of the files the journalist skill's steps pass to one another, under `data/<session-id>/`. Angle brackets hold placeholders, and `a | b` lists the allowed values. The inputs and the record keep every text, name and figure as their source gives it; the record puts logged times on the session clock.

What the article says, and how, is the rule set's (`references/rules/`). Two files take their shape from JSON schemas instead of this page:
- `analysis/article-outline.json`, the story map: `lib/schemas/outline.schema.json`, with a beat's evidence as "The map" below gives it;
- `output/content-bundle.json`: `lib/schemas/content-bundle.schema.json`, which `scripts/assemble-article.js` validates.

A **document** is any item of the record, an exposed memory or a piece of paper evidence, named by its `id`.

A **piece of evidence** is one piece of the record a line of the story rests on. A thread, a connection and a beat each carry theirs in `evidence`, each piece with:
- `sources`: where it comes from, a document by its `id`, `ledger` for a sale, the bonus or a transfer, `evidence-log` for an exposure, or `notes` for the director's own words. A piece that sets two sources side by side names both;
- `shows`: what it shows, in a short line with the words or figures that matter; a quotation is word for word from its source;
- `stance`: whether it supports its line or cuts against it.

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

The arc analyzer writes the weave: two or three angles over one shared set of threads. The director's pick and changes at the story meeting are written into it, and every later step reads the angle the director picked, as they left it.

```
{
  "angles": [{"id": "<angle id>", "headline": "<the headline the article would print>", "gist": "<one sentence that sums the angle up, for its card>", "story": "<the story, in two or three sentences>", "question": "<the question the story carries through the article>", "lands": "<why it lands with the players, in one line>", "ends": "<where it ends up, in one line>", "threads": ["<thread id>", "<thread id>"]}],
  "fromYourNotes": "<the director's own words angle 1 rests on, copied exactly>",
  "threads": [{"id": "<thread id>", "name": "<what happened, with its people, in a few plain words>", "line": "<the thread in one plain line>", "verdict": true, "evidence": [{"sources": ["<document id> | ledger | evidence-log | notes"], "shows": "<what the piece shows, with the words or figures that matter>", "stance": "supports | cuts-against"}]}],
  "connections": [{"id": "<connection id>", "joins": ["<thread id>", "<thread id>"], "line": "<where the two threads touch, in one plain line>", "kind": "person | moment | document | line", "evidence": [{"sources": ["<document id> | ledger | evidence-log | notes"], "shows": "<what the piece shows>", "stance": "supports | cuts-against"}]}],
  "questions": [{"id": "<question id>", "kind": "player | pronoun | figure", "about": "<the player's name; for a figure, the ledger entry's time and amount or the words said in the room>", "question": "<the question>", "changes": "<what its answer changes in print>", "thread": "<the id of the thread its answer changes>", "answer": "<the director's answer, word for word>"}],
  "picked": "<the id of the angle the director picked>",
  "directorChanges": [{"id": "E<n>", "change": "<what the director changed at the story meeting, as they gave it>"}]
}
```

An angle's `threads` are the threads it tells, in the order it tells them, the verdict's thread among them. `fromYourNotes` is there only when angle 1 starts from the director's read, `verdict` only on the thread that carries the room's verdict, and a question's `thread` only when its answer changes that thread; a question without one sits by the pitch. A thread the director adds has an id of its own, a name and a line, and no evidence yet: the outline generator finds its evidence. `picked`, `answer` and `directorChanges` are the director's, written at the story meeting: `picked` on the weave, naming the angle they sent on (with none, angle 1), `answer` on each question they answered, and in `directorChanges` each change they made, under the next id from E1.

## The map

### analysis/article-outline.json

The story map, in the shape of `lib/schemas/outline.schema.json`. Each section's `slot`, and each dropped slot, is one of the journalist theme's slots, `map.slots` in `lib/theme-config.js`. The schema leaves a piece of evidence open; a beat, in a section's `beats` or in `leftOut`, is:

```
{"id": "<beat id, its own across the map, such as b1>", "move": "<the move of the story, in a few plain words with its people>", "players": ["<roster player's name>"], "synopsis": "<one sentence, in story terms, saying what the article tells at this move>", "threads": ["<id of a settled angle's thread the move carries>"], "connection": "<id of the connection between two of the settled angle's threads that lands here>", "card": true, "kind": "scene | receipt | line | figure", "evidence": [{"sources": ["<document id> | ledger | evidence-log | notes"], "shows": "<what the piece shows, with the words or figures that matter>", "stance": "supports | cuts-against", "card": true}]}
```

`connection` is there only on the beat where a connection between two of the settled angle's threads lands. `card` marks a beat whose evidence prints as a card, and then one of its pieces, whose source is the card's document. `kind` is a hint for the article generator; the map's page never prints it. A beat the director adds has an id, a move and its people, and no evidence yet: the article generator finds its evidence. The director's changes at the map's stop are written into the map: a struck beat moves to `leftOut`, and a beat brought back moves into the section the director picks.

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
