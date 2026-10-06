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
The session's source of truth that every claim the writer makes must agree with: the evidence bundle, the ledger and the evidence log, the director's own notes (those given at intake and any note written at a stop) and accusation text, the epilogue, the roster and pronouns, the photos and the director's descriptions of them, and the director's edits. Backstory the director knows but the session does not show is not record: it reaches print only as Nova's own suspicion, an allegation or a question, unless the director writes it into the article.
_Avoid_: session data, ground truth, context

**Epilogue**:
What happened after the investigation, as the director writes it into the notes: a successor named, someone fled, a warrant, a leak, a call that went unanswered. It is record and the only source of the article's follow-up news. All of that news is Nova's own reporting; a channel the director names (a leaked email, an anonymous tip) is Nova's source for that item.
_Avoid_: post-investigation news, aftermath facts

**Owner**:
The character whose memory it is: the point of view the memory records. The article names an exposed memory's owner. A buried memory's owner reaches print only as talk in the room that the director's notes record, with the speaker named.
_Avoid_: author, source

**Exposer**:
The player who turned a memory in to Nova. Anonymous unless the evidence log carries a name or the director's own words (the notes, a correction at the input review, the accusation as written, or an answer at the story meeting) record who turned it in. A name on a turn-in is the player taking public credit: an honest attribution, which the article may print. Never assumed to be the owner.
_Avoid_: source, submitter

**Ledger**:
Nova's record of every transaction in the morning's market: each sale into an account, the first-burial bonus and each transfer, with its time and amount. It never shows which memory was sold. The live display in the room shows only running balances.
_Avoid_: scoreboard, Blake's display

**Account**:
Where a sale's money goes. A player can give it any name, including another character's, so a name identifies no one.
_Avoid_: shell account or personal account as proof of who holds it

**Buyer**:
Whoever pays for a buried memory, into the account the seller names. The players know who buys: the game tells them NeurAI's board wants the memories gone. Nova does not, so in print the buyer is Nova's suspicion, NeurAI and its board, and never a fact: stated as fact, it would accuse a company in print.
_Avoid_: the Black Market (the market is the deals made with Blake, with no proper name)

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

**Nova**:
The NovaNews reporter who writes the article, in the first person. An independent journalist who had been investigating Marcus. Fremont PD required Nova to monitor the investigation as an uninterested third party: the condition of Blake's deal to delay sending officers while the room investigates, agrees its statement and leaves. Exposed memories are turned in to Nova. On site Nova is in the warehouse; remote, Nova monitors from outside. Nova takes no part in the group statement and is never referred to with gendered pronouns.
_Avoid_: the writer (the model pass), the narrator

**Writer**:
The model pass that produces the arcs, the outline or the article.
_Avoid_: generator, agent, model, Nova (the reporter persona, not the pass)

**Beat**:
One move of the story on the story map: a few words in story terms, the people in it, the threads it carries, and the evidence under it. The article writer writes every beat from its evidence and adds none.
_Avoid_: point, item, paragraph plan

**Photo description**:
What the director says a photo shows, given at the character-IDs stop: who is in it and what moment it catches. The caption keeps its subject and action, and may add context from the article or the record.
_Avoid_: beat (a map item), narrative moment, story relevance

**Arc**:
One thread of the session's story, a line of it: an idea about what happened or what it means, said in plain words with its people. The writers tell it through its evidence, usually several pieces, and some threads appear only when sources are set side by side. The arcs are the threads the article weaves toward one convergence; at the story meeting each arc gets its role in the weave.
_Avoid_: storyline, angle

**Weave**:
How the threads make one story: a main thread, the other threads each in a role toward it, the connections where they touch, and the convergence near the end, each said in story terms with its evidence underneath. The same threads woven around a different main thread make a different story.
_Avoid_: interweaving plan, angle, structure

**Main thread**:
The thread the story follows from the lede to the convergence. The other threads ground it, complicate it, mirror it or carry it forward.
_Avoid_: spine, primary arc

**Connection**:
A point where two threads touch, said in story terms: a shared person, a moment, a document or a line, with the evidence that shows it underneath. A cause counts as a connection only when the record shows it.
_Avoid_: bridge, link, callback

**Verdict**:
The official story: the group statement the room agrees on when the recovery window closes, before the police arrive. It is negotiated under the clock, can cite only what is on the Evidence Board, leaves out whatever the room chooses, and is a version every character can live with, so it is shaped by everything the players exposed, sold and argued. The director enters it as the accusation. The article reports it as the official story and shows how the players' choices made it, never claiming to know what really happened to Marcus.
_Avoid_: the answer, the solution, the truth

**Thesis**:
The answer Nova argues by the end. When the director gives one, in the notes or at a stop, that is the thesis; otherwise it is the most interesting journalistic angle on what happened in the session. Usually it lies in the gap between the verdict and what happened leading up to it, and in what that gap shows about the biases the group brought to what it decided to tell the world. When the verdict agrees with everything the room found, it is what the players' own path to the verdict shows. Settled by the director at the story meeting; the outline is built to it, and it lands at the convergence.
_Avoid_: angle, key tension, hook, primary arc

**Throughline**:
The question that carries the thesis. It opens early and runs through every section, each section carrying it forward from its own angle and leaving it sharper, until the thesis lands at the convergence.
_Avoid_: thread (an arc), theme

**Convergence**:
The point near the end where the threads meet and the thesis lands. The weave says where in a line or two of story terms; the article says it once and sharply, in this session's names and sums.
_Avoid_: climax, resolution, payoff (a detail planted early coming back)

**Whiteboard**:
The working notes the game master and the players keep during the investigation and before the deliberation. It is context for how the room reached its verdict, not record: the article never cites it or prints it.
_Avoid_: evidence board (the Evidence Board is where exposed memories' summaries go up), source

**Story meeting**:
The arc stop, where the director settles the weave the article will tell before anything is planned. What the director leaves there is the task every later writer works from.
_Avoid_: story memo, arc cards, arc analysis, pitch

**Story map**:
The outline: the weave laid across the article's sections, in story terms, with each beat's evidence underneath. Under the headline, the deck and the settled story, each section has its job, its beats and its photos; sections the story does not need are dropped, and the beats left out are listed. Length comes from what is on the map, not from a budget per section.
_Avoid_: outline structure, allocation, section plan, script

**Reweave**:
The rework of the story meeting after the director changes a thread's role, adds a thread or picks another main thread. The writer fits the change into the weave and keeps everything else.
_Avoid_: rebuild, regenerate

**Evidence**:
What gets cited. A piece of evidence is a memory, a paper document, a ledger line, an exposure in the evidence log, or something the director's own words record from the room (their notes, their corrections and their answers at the story meeting, as T1 sets out). Each piece names its source or sources, says in a short line what it shows, with the words or figures that matter, and is marked as supporting its line or cutting against it; a piece that sets two sources side by side names both. One thread draws on many pieces, and one piece can serve several threads. The evidence travels under each thread, connection and beat to the article writer, which cites it. The writers choose it; the director sees it only by opening a line, and never edits it.
_Avoid_: sources (what a piece names), citation (the line on an evidence card)

**Evidence card**:
A printed card that quotes one memory, or one passage of a document, from the record word for word. Memories are the main cited evidence: a memory card prints the whole memory, and a document card prints only the passage that matters. The writer chooses the memory or the document and passage; the text itself is copied from the record.
_Avoid_: token card, quote card, sidebar card

**Evidence reference**:
A one-line mention of a document inside the body text, printed as a caption. It shows none of the document's text.
_Avoid_: evidence link, inline card

**Citation**:
The line on an evidence card that names the document being quoted, built from the record, never written by the writer, and never naming who exposed it.
_Avoid_: source, attribution

**Claim check**:
The check that reads every factual claim in writer-authored text against the record. Director-authored text is exempt and counts as record.
_Avoid_: fact check (the older card-fidelity check), accuracy pass

**Trace**:
What a stop shows about the automated reworks that ran before the director arrived: each finding, what changed for it, and a place to comment.
_Avoid_: revision history, log
