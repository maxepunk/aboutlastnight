# File shapes

The shapes of the files the journalist skill's steps pass to one another, under `data/<session-id>/`. Angle brackets hold placeholders, and `a | b` lists the allowed values. The inputs and the record keep every text, name and figure as their source gives it; the record puts logged times on the session clock.

What the article says, and how, is the rule set's (`references/rules/`). Two files take their shape from JSON schemas instead of this page:
- `analysis/article-outline.json`: `lib/schemas/outline.schema.json`;
- `output/content-bundle.json`: `lib/schemas/content-bundle.schema.json`, which `scripts/assemble-article.js` validates.

A **document** is any item of the record, an exposed memory or a piece of paper evidence, named by its `id`.

A **question** for the director, wherever a file carries one:

```
{"about": "<a player, a pronoun or a ledger line>", "question": "<the question>"}
```

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
  "stopNotes": [{"stop": "record | arcs | outline | article", "kind": "approval | send-back", "text": "<the director's note>"}]
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
  "questions": [<question>]
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
    "clock": "as logged | evening session: PM times shown as AM",
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
  "questions": [<question>]
}
```

## The arcs

### analysis/arc-analysis.json

```
{
  "thesis": "<the proposed thesis>",
  "narrativeArcs": [{
    "id": "<arc id>",
    "title": "<title>",
    "summary": "<the storyline>",
    "arcSource": "accusation | whiteboard | observation | discovered",
    "keyEvidence": ["<document id>"],
    "characterPlacements": {"<player>": "<what the record shows they did in this arc>"},
    "evidenceStrength": "strong | moderate | weak | speculative",
    "caveats": ["<what complicates the arc>"],
    "unansweredQuestions": ["<what the record leaves open>"],
    "analysisNotes": {"financial": "<the money lens>", "behavioral": "<the behaviour lens>", "victimization": "<the victimization lens>"},
    "interweaving": {"sharedCharacters": ["<character>"], "callbackSeeds": ["<a detail to plant early>"], "convergenceRole": "<what this arc brings to the convergence>"}
  }],
  "interweavingPlan": {
    "suggestedOrder": ["<arc id>"],
    "convergencePoint": "<where the threads meet>",
    "keyCallbacks": [{"plantIn": "<arc id>", "payoffIn": "<arc id>", "detail": "<the detail>"}]
  },
  "heroSuggestion": {"filename": "<file>", "reason": "<why>"},
  "writerQuestions": [<question>],
  "userSelections": null | {"selectedArcs": ["<arc id>"], "heroImage": "<filename>"}
}
```

### summaries/arc-summary.json

```
{
  "thesis": "<the proposed thesis>",
  "arcs": [{"id": "<arc id>", "title": "<title>", "arcSource": "<source>", "evidenceStrength": "<strength>", "summary": "<one line>"}],
  "heroSuggestion": {"filename": "<file>", "reason": "<why>"},
  "writerQuestions": [<question>]
}
```

`arcs` follows `interweavingPlan.suggestedOrder`.

## The outline

### summaries/outline-summary.json

```
{
  "sections": [{"slot": "lede | theStory | followTheMoney | thePlayers | whatsMissing | closing", "plan": "<one line>"}],
  "cards": [{"documentId": "<id>", "slot": "<slot>"}],
  "photos": [{"filename": "<file>", "slot": "<slot>"}],
  "writerQuestions": [<question>]
}
```

`sections` lists the slots the outline fills, in reading order.

## The article

### output/article-metadata.json

```
{"narratorWords": <n>, "cards": <n>, "photos": <n>, "writerQuestions": [<question>], "generatedAt": "<ISO timestamp>"}
```

`narratorWords` counts the headline, the deck and the paragraphs.

### Validation result

The article validator's reply.

```
{
  "passed": <true when mustFix is empty>,
  "mustFix": [{"rule": "<T1 to T15, or C7 for a missing player>", "text": "<the printed words at fault>", "record": "<what the record shows>", "fix": "<the change>"}],
  "shouldConsider": [{"rule": "<C1 to C19>", "text": "<the printed words>", "suggestion": "<the change>"}],
  "narratorWords": {"total": <n>, "bySection": {"<section id>": <n>}}
}
```
