# Director Console

The pipeline that turns one game session's record into a published report, and the places where the director steers it. This file is the glossary for that work: what the words mean, not how anything is built.

## Language

**Director**:
The person running the session who steers the pipeline and signs off the report.
_Avoid_: user, human, human reviewer, operator

**Stop**:
A point where the pipeline waits for the director before it continues.
_Avoid_: gate, checkpoint (reserved for LangGraph persistence), interrupt

**Round**:
One look the director takes at a stop. A stop can have many rounds.
_Avoid_: attempt, revision N of M

**Note**:
Anything the director writes for the writer. A note goes into prompts and stands for every later writer until the director closes it.
_Avoid_: feedback, guidance, corrections, comment

**Edit**:
A direct change the director makes to the writer's output. It is the final word on that text.
_Avoid_: hand edit, inline edit, override

**Check**:
A programmatic test of an output, free to run, with a definite answer.
_Avoid_: validation, fact check (one particular check)

**Record**:
The session's source of truth that every claim the writer makes must agree with: the evidence bundle, the director's own notes and accusation text, the roster and pronouns, the whiteboard, the director's photo descriptions and the director's edits.
_Avoid_: session data, ground truth, context

**Intake**:
The start-of-session collection of everything only the director holds.
_Avoid_: session start, input collection, full context

**Automated budget**:
The cap on how many reworks the machine may trigger on its own before it hands over to the director. It never counts the director's own send-backs.
_Avoid_: revision cap, revision limit, max revisions

**Send back**:
The director's act of returning an output for another writer pass. It is never limited.
_Avoid_: reject, request changes, rejection

**Rework**:
One writer pass on an existing output. A send-back, a failed check or a failed evaluation each produce a rework.
_Avoid_: revision, regeneration (a rework starts from the existing output; a rebuild does not)

**Evaluation**:
The model's rubric-scored opinion of an output, produced before the director sees it.
_Avoid_: review, verdict, validation, evaluator feedback

**Review**:
The batch the director submits at a stop in one go: anchored notes, a cover note, edits and the action (approve or send back). Nothing in it reaches the writer before the submit.
_Avoid_: approval, feedback, submission

**Writer**:
The model pass that produces the arcs, the outline or the article.
_Avoid_: generator, agent, model, Nova (the reporter persona, not the pass)

**Beat**:
The moment a photo shows in the story, as the director describes it at the character-IDs stop. It decides where the photo is placed, and the caption must keep it: the writer may add context from the article or the record, never a different subject or action.
_Avoid_: narrative moment, story relevance, context

**Arc**:
One thread of the session's story: a claim about what happened, the evidence it rests on, who did what, and what is uncertain. The director selects arcs at the arc stop.
_Avoid_: thread, storyline, angle

**Thesis**:
The story's angle in one sentence: what the room decided and where the record points instead. Proposed by the writer and settled by the director at the arc stop; the outline is built to it.
_Avoid_: angle, key tension, hook, primary arc

**Story memo**:
What the arc stop shows: the arcs as plain claims with named evidence, roles, strength and open questions, the thesis, and how the arcs pull against each other.
_Avoid_: arc cards, arc analysis

**Story map**:
The outline. For each section: what it does for the reader, the material it uses by name, how the thesis appears through that section, and how it hands off to the next. Under the thesis, the headline, the deck and the length.
_Avoid_: outline structure, allocation, section plan

**Citation**:
The line on an evidence card that names the document being quoted, built from the record, never written by the writer, and never naming who exposed it.
_Avoid_: source, attribution

**Claim check**:
The check that reads every factual claim in writer-authored text against the record. Director-authored text is exempt and counts as record.
_Avoid_: fact check (the older card-fidelity check), accuracy pass

**Trace**:
What a stop shows about the automated reworks that ran before the director arrived: each finding, what changed for it, and a place to comment.
_Avoid_: revision history, log
