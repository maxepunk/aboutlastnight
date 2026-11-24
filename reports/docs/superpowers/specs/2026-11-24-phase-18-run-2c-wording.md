# Phase 18, run 2c: the approved wording

The director approved these lines on 2026-11-24, after the prompt read (gate 4) and two rounds of correction. Each entry gives the line as it is and the line as approved. A builder puts the approved line in word for word. Nothing on this page that is not inside a quotation block goes into a file a model reads.

One decision is still open: the small line above the headline (D1). Until the director gives its words, nothing about that line changes.

## How to read it

- "Now" is the text at the phase branch's head after run 2b.
- "Approved" is the text to build. Where a line holds a session's values, the code keeps its constants and placeholders and only the words change.
- "Stays" names text beside the change that must not move.

## Part 1. The rule files

The approved-text folder holds each rule file exactly as built. This run changes four of them there, and the rules folder is copied from it.

### world.md, "The group statement"

Now: `It is a version each of them can live with.`

Approved: `Each of them agrees only to a statement they can accept.`

### limits.md, "The money"

Now: `Nobody has shown who the buyer is.`

Approved: `The record does not show who the buyer is.`

### limits.md, "Whose account it is"

Now: `An account's total shows where money went. A transfer between accounts is a deal between two people.`

Approved: `From an account's total Nova can say where money went. From a transfer Nova can say that two people made a deal.`

### brief.md, "How the two fit"

The paragraph's last sentence, `That is the news.`, is cut. The sentence before it ends the paragraph.

### brief.md, "Nova"

Now: `Nova says what Nova was told and who told it, what Nova thinks, and how sure Nova is, the way a person does.`

Approved: `Nova says what Nova was told, what Nova thinks, and how sure Nova is, the way a person does.`

### job-map.md, "What the director settled"

Now: `Every thread of the settled story lands on at least one beat, and a thread can be told across several. You add no thread and no connection of your own.`

Approved: `Every thread of the settled story lands on at least one beat, and a thread can be told across several. Every connection between its threads lands on one beat, the one where the article shows those two threads meeting, because the connections are part of the story the director settled. You add no thread and no connection of your own.`

### job-map.md, "The lines the article prints"

Now: `Write them as the brief says, in Nova's voice.`

Approved: `Write the line under the headline as the brief says. A section's heading says what that section tells the reader, in this story's own names. Take it from the section's step. Both are in Nova's voice.`

### Kept as they are, by the director's decision

- limits.md, "Who made a memory public": `A person turning in a memory chooses whether to put their name to it, and leaving it off protects them.`
- brief.md, "The argument": `who is better off now, and what they can do next`.
- brief.md, "Nova": `asks who gained from the way things turned out`.

## Part 2. The map writer's prompt

### The list of sections

Now, in `<SLOTS>`:

```
The article's slots, in their usual order, each with the heading the map starts from:
- lede: no heading
- theStory: The Story
- followTheMoney: Follow the Money
- thePlayers: The Players
- whatsMissing: What's Missing
- closing: no heading
```

Approved:

```
The sections the map can use, by the name the map gives each. Use the ones the story needs, in the order its steps need them.
- lede: the opening
- theStory: what people said and did in front of everyone
- followTheMoney: the money
- thePlayers: particular people and what they wanted
- whatsMissing: what nobody has explained
- closing: the closing
```

The stock headings are no longer offered to the map writer. Whatever else reads a slot's stock heading (the console, a section the director adds) keeps it. The words after each slot's name live with the slot in the theme's config, once.

### A beat's players, in the map's schema

Now: `The roster players the beat shows, by name`

Approved: `The played characters who do something in this beat that bears on the question, by name`

## Part 3. The settled angle, as the later writers read it

Two sentences are added at the end of the line above the settled angle, for every reader of it:

`WHERE IT ENDS UP is Nova's answer to the QUESTION. FROM THE DIRECTOR'S NOTES, when it is there, is the director's own read of the session, which this angle rests on.`

For the article writer and its rework alone, these follow them:

`The headline is printed as it stands. Every other line here was written for the director to decide by, the lines the director changed included. They say what the article argues. None of them is a sentence for the article.`

Stays: every other sentence of that line, in both of its forms (with and without the evidence under the threads).

## Part 4. The weave writer's prompt

### The task's opening

Now: `Pitch two or three angles for the director to read in a few minutes at the story meeting and pick from. The page they read comes to at most 450 words with any one angle open: your lines, without the evidence under them (the headline and card line of each angle that is not open; the open angle's pitch, its threads and the names of the threads it leaves out; the line of each connection between its threads; the questions), and what code prints around them (the verdict, the line that says the open angle is open below, the line that keeps the verdict's thread in, the labels over your lines, and a line when the notes end without the director's read). So your own lines come to about 325 words.`

Approved: `Pitch two or three angles for the director to read in a few minutes at the story meeting and pick from. The director opens one angle at a time. With any one angle open, your lines on the page come to about 325 words: that angle's pitch, its threads and its connections, the questions, and the headline and one-line summary of each other angle. The evidence under a line is not counted. A check counts the words and says when a page runs over. Write each line in full, plain words. When the page is too long, leave out a thread or a connection before you clip a sentence.`

Stays: the two sentences that follow (`<job-weave> below says ...` and `The fields hold them:`), the bound itself and the check.

### A connection's evidence, in the fields

Now: `the pieces that show the two threads touch`

Approved: `the pieces that show what the two threads share`

### The sentences about Blake

Now, the label over them: `The pipeline's code gathered the sentences below by searching the director's notes for Blake and the Valet. Each is the director's own sentence, copied as written, so each is part of the record; only the choice of sentences is the code's.`

Approved: `Code gathered these sentences from the director's notes above: every one that mentions Blake. A memory is sold to Blake, so these are where the notes record who was seen making a deal. They are listed again for that check only. Being listed here does not make them more important to the story.`

The article writer and its rework no longer get this block at all.

## Part 5. Blocks every prompt shares

### The list of names

Now:

```
CANONICAL CHARACTER ROSTER:
Use ONLY these full names in ALL article text. NEVER invent different last names:
(the names)
A name with no pronoun is not on this session's roster, so its pronoun is not recorded: never guess one.

Non-player characters (fixed canon, NOT on the session roster; these pronouns are as authoritative as the roster's):
```

Approved:

```
Every character of the game, first name and then the full name the article prints. A surname that is not on this list is invented, so use these. A name marked with a pronoun, or marked as having none given, was played in this session. The rest were not played.
(the names)

The game's own characters, who are never played. Where a pronoun is given here, it is fixed:
```

The line about a name with no pronoun goes. Where a theme prints no pronouns, the two sentences about them are left out.

### The list of quoted lines

Now: `The lines the director's notes quote, each with its speaker as the notes and corrections give it:`

Approved: `Each line the director's notes quote, with who said it, as the notes and the corrections give it. Use it to get a line's words and its speaker right once the story needs that line. Being on this list is no reason to use a line.`

### Three labels over derived blocks

Over the quote bank and the links. Now: `A model (Opus) built this from the director's notes above. It is derived, not the record: where it differs from the notes or the rest of the record, the record decides.`

Approved: `A model built this from the director's notes above. Where it differs from the notes, the notes decide.`

Over the epilogue. Now: `A model (Opus) picked these sentences out of the director's notes as the epilogue, what happened after the investigation, and each is copied as written. The picking is derived, not the record: where it differs from the notes, the record decides.`

Approved: `A model picked these sentences out of the director's notes as the epilogue, what happened after the investigation. Each is copied as written. Where the notes give a different account of what happened afterwards, the notes decide.`

Over the summary of the characters. Now: `A model (Haiku) extracted this from the documents. It is derived, not the record: where it differs from the record, the record decides.`

Approved: `A model made this summary from the documents in the record. Where it differs from a document, the document decides. Its pronouns are the documents', which are often not this session's. Take pronouns from the roster.`

## Part 6. The article writer's prompt

- The block of sentences about Blake is gone from it (part 4).
- Two kinds of block are no longer offered: the caption that names a document and prints none of its text, and the list. Their two lines leave the generation instruction, and their two shapes leave the schema the writer is shown and given. The validator, the template and a stored article keep both.

## Part 7. The judges

### The list of limits

Each judge lists all fifteen limits again, as the spec's section 7 says. Run 2b's shorter lists are taken back.

### After "One breach fails it: score it below 0.8."

Added, for both judges:

`A breach is something you can show: the sentence, and what in the record or the director's words it goes against. A line you only doubt is not a breach. A plain statement of what Nova thinks is Nova's opinion, and it needs no label to pass.`

`The director's words are the director's notes, the corrections at the input review, the accusation as the director wrote it, the answers at the story meeting and the notes at the stops.`

### The questions say "the director's words"

Each list of the director's words inside a question goes, since the line above now gives it once. No question asks anything new.

The article's judge:

| Question | Now | Approved |
|---|---|---|
| evidenceTruth | `as the director's words record it (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops), reported as fact` | `as the director's words record it, reported as fact` |
| moneyTruth | `a balance the director's words (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops) record as said or shown in the warehouse` | `a balance the director's words record as said or shown in the warehouse` |
| verdictTruth | `as the director's words record it (the accusation, the notes, the answers at the story meeting and the notes at the stops);` | `as the director's words record it;` |
| stagesTruth | `the time the record gives, or the time a note at a stop rules (T7)?` | `the time the record or the director's words give (T7)?` |
| playersTruth | `the pronoun the director's own words give (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops), or else` | `the pronoun the director's words give, or else` |
| wordsTruth | `from the record or the director's words (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops) and given to` | `from the record or the director's words and given to` |

The weave's judge:

| Question | Now | Approved |
|---|---|---|
| evidenceTruth | `as the director's words record it (the director's notes, their answers at the story meeting and the notes at the stops), reported as fact` | `as the director's words record it, reported as fact` |
| evidenceTruth | `or the director's notes, their answers at the story meeting or the notes at the stops say who it was (T6)` | `or the director's words say who it was (T6)` |
| moneyTruth | `a balance the director's notes or the notes at the stops record as said or shown in the warehouse as that moment's figure; and a ledger line the director's answer at the story meeting or a note at a stop explains as that answer or note gives it (T1).` | `a balance the director's words record as said or shown in the warehouse as that moment's figure; and a ledger line they explain as they give it (T1).` |
| verdictTruth | `as the director's words record it (the accusation, the notes and the notes at the stops);` | `as the director's words record it;` |
| stagesTruth | `the time the record gives, or the time a note at a stop rules (T7)?` | `the time the record or the director's words give (T7)?` |
| playersTruth | `the pronoun the director's answer at the story meeting or a note at a stop gives (T9)` | `the pronoun the director's words give (T9)` |
| wordsTruth | `from the record, the director's notes or the notes at the stops, and given to` | `from the record or the director's words, and given to` |

Stays: in evidenceTruth, `or the director's notes record that the director saw it`, which is the limit's own wording about a sale; and every other word of every question.

### The fixed facts

Both judges' first question gains a clause at its end, and names the limit among its codes.

Now: `... say who it was (T6)?`

Approved: `... say who it was (T6); and does nothing in it go against the fixed facts (T15)?`

### What a fix holds

The article's judge. Now: `quotes the sentence and names its section, names the record it contradicts, and gives the fix:`

Approved: `quotes the sentence and names its section, and says what the record or the director's words show instead. Say what is wrong and what is true. Do not write the new sentence. The writer words it, and a sentence you write is printed as it stands.`

The weave's judge. Now: `the piece by its sources, names the record it contradicts, and gives the fix:`

Approved: `the piece by its sources, and says what the record or the director's words show instead. Say what is wrong and what is true. Do not write the new sentence. The writer words it, and a sentence you write is printed as it stands.`

Stays: the sample entry that follows, and the output's shape.

### What a weave is, for its judge

Added after the first sentence of the weave judge's user prompt (`Check this weave against the record and the director's words.`):

`The weave is the writer's notes to the director. Only an angle's headline is printed. Judge what each line claims, not how it is worded: a line breaks a limit when the article it leads to would state something the record and the director's words do not support.`

### The map, for the article's judge

Now: `The map below is the one the article writer wrote from, as the director left it: the beats in its sections are what the article tells, and leftOut holds what it leaves out, each beat the director struck among them.`

Approved: `The map below is the one the article writer wrote from, as the director left it. The headline, the line under it and each section's heading were settled on it before the article was written, and the writer prints them as given. A concern about one of them is for the director, reported the way a concern about one of the director's edits is. Whether the article follows the map is not yours to judge.`

### A concern about one of the director's edits

Now: `the rule or criterion it concerns`

Approved: `the limit it concerns`

## Part 8. A rework and the fact check

### The label over the director's note in a rework

Now:

```
HUMAN FEEDBACK (HIGHEST PRIORITY):
(the note)

NOTE: The human reviewer has explicitly requested these changes.
Address human feedback FIRST, then address any remaining evaluator issues.
```

Approved:

```
THE DIRECTOR'S NOTE:
(the note)
```

Both NOTE lines go, at every stop.

### The whiteboard photo, in the fact check's two messages

Now: `the room's working notes`

Approved: `the working notes kept during the investigation`

## Not in this run

- What a piece of evidence holds. The spec's non-goals keep it for after the next session, if that session's draft still prints the evidence wholesale.
- The small line above the headline, until the director gives its words.
- The check that each connection lands on a beat, a new field for a person's tie, the judges' scores, the typing notes in the game's documents, and the reading of the accusation: each stays as designed.

## Part 9. Four rewordings after the build (approved 2026-11-24)

Run 2c's reviewers named every reader of each new line and found four that were right for one reader and loose for another. The director approved these rewordings.

### The label over the sales a model paired with the notes

Now: `A model (Opus) paired each observation below, quoted from the director's notes, with ledger sales it judged to match. Each pairing is the model's reading, not something the notes state: where it differs from the notes or the rest of the record, the record decides.`

Approved: `A model paired each observation below, quoted from the director's notes, with the sales in the ledger it judged to match. Each pairing is the model's guess, not something the notes state. Where the notes or the ledger point another way, they decide.`

### Where pronouns come from

In the list of names. Now: `A name marked with a pronoun, or marked as having none given, was played in this session. The rest were not played.`

Approved: `A name marked with a pronoun, or marked as having none given, was played in this session, and the pronoun is the one the director's roster gives. The rest were not played.`

In the label over the summary of the characters. Now: `Take pronouns from the roster.`

Approved: `Take pronouns from the list of names.`

### What the settled angle's lines are, for the article writer

Now: `The headline is printed as it stands. Every other line here was written for the director to decide by, the lines the director changed included. They say what the article argues. None of them is a sentence for the article.`

Approved: `The headline is printed as it stands. The other lines here, the director's own among them, say what the article argues. None of them is a sentence for the article.`

### The label over the sentences about Blake

Now: `every one that mentions Blake.`

Approved: `every one that mentions Blake, by name or as the Valet.`

Stays: every other word of that label.
