# Phase 17: the writing

The design for phase 17 of the director console roadmap (`docs/superpowers/plans/2026-09-22-roadmap.md`, its section "Phase 17: the writing, after 101126"). Agreed with the director on 2026-10-17, 2026-10-18 and 2026-10-20.

## Intent and the why

The article writer's draft should read as one cohesive story in Nova's voice before the director touches it.

The stops now work: on 100926, 101026 and 101126 the story meeting and the map took minutes or went through untouched, and on 101126 the director's pitch carried into the article. What the director still rewrites at the desk is the writing. In their words, lines such as "A sign isn't a driver" and "An overdose names no one. A frame names the outsider." are "nonsense"; "Here's where I land, and it's opinion, not record" is "just bad writing" that reads "LIKE AI Slop instead of intentional journalistic writing"; and their edits "focus each article around a decent narrative arc and flow instead of randomly citing evidence or referencing input content when it doesn't serve the story".

The draft has to be good without the director's steering. How much they put in at the early stops varies with their bandwidth: some sessions get sharp input at the meeting and some run to the article with almost none. The angle that brings everything together sometimes shows only once they read prose. And sessions differ: a roleplay-heavy game leaves many notes and angles, a puzzle-heavy one an accusation and few moments.

## What the director decided

- **The approach is a mix.** The truth floor stays as rules. The voice and the article's intent are described, as a writer and a reader, not given as a list of instructions, because instructions get followed to the letter: "and it's opinion, not record" is a writer obeying T1's "marks as Nova's, worded fresh each time".
- **The voice is Coffeezilla's**, the way he works a case, written as prose: Nova talks to the reader while building the case from receipts; asks the obvious question out loud; hedges like a person where it matters; is dry about what is absurd, never cute; and is clear about who is harmed and who profits. The director's test for every line is that it makes sense.
- **The headline and the deck lead.** In the director's words they are "possibly the most important pieces of the copy that the whole article is built on and they need to be able to set the tone, establish the voice, set up the narrative throughline and capture the reader's interest immediately". So they are written in Nova's voice wherever they are born (section 3), and the article is built on them.
- **The article is one cohesive story.** It opens on the question the session raises, every paragraph moves the argument, each section hands the reader to the next, and it lands on the thesis. Evidence is in it because the story needs it there.
- **No example passages** from the director's finished articles go into the prompt. The cast is the same every session, so a line from one session's article can be reused word for word where it is not true, and phase 3 saw sample lines turn into tics ("the shape of the silence"). If a later session shows the description is not enough, examples come back as the next step, chosen with that risk in mind.
- **The standard** the voice has to produce, from the desk edits of 100926, 101026 and 101126 (the director: "this is much better"):
  1. Every line says something the reader can follow; a line that only sounds sharp becomes the plain claim or the question it stands for, and a short line stays when it carries a claim ("Wronged, all three. Absent, all three." stayed; the director wrote "Expendable." themselves).
  2. Opinion and doubt in a person's words, honest about what Nova cannot know ("yet they read an awful lot like Alex and Vic", "That said, I have no reason to believe that she sold a single memory"), never a label about the label ("and it is mine", "and I'll own it", "is my call"); a plain "My read:" is fine.
  3. Where the record stops, Nova says the suspicion in so many words, hedged as a reporter hedges, and asks the pointed question, instead of a flat line that leaves it implied ("names neither of them" became "seems to be designed to remove Remi from the conversation").
  4. Plain verbs that add no claim the room did not make ("Sam agreed", not "Sam took the handoff").
  5. Evidence told for what it does in the argument ("and contradicted his denial"), or left in the record: every cut came from the evidence the map put under a move (Blake's pile-on and the baggies document on 101026, the baggies passage on 100926, the tip line on 101126).
  6. Each paragraph ends on the argument and each section hands off (101026's The Story now ends on the room's assumption that the richest account was Remi's, which Follow the Money opens on).
  7. The game off the page: a guest reporter's turn-ins told as their reporting (101126's one send-back), the ledger's rule unsaid, the remote statement in Nova's own words rather than the mode rule's.

## Goals, non-goals, anti-goals

**Goals.**
- The unsteered draft reads as one cohesive story in the voice above, on a rich session and a thin one alike (a thin session makes a shorter article, never a padded one, C4).
- The director's desk work moves to what only the director can supply: a sharper angle seen late, the room's facts, the ending they want.
- When the director does give input early, it carries into the draft.

**Non-goals.**
- The stops' pages (the meeting, the map, the desk).
- The evidence path (phase 3b).
- A judge or check on the writing. The judges stay truth-only (phase 7, which would have scored writing, was dropped on 2026-10-02).
- Examples in the prompt (deferred, above).

**Anti-goals.** Phase 17 fails, even if every test passes, if it produces:
- a Coffeezilla impression: his catchphrases, a video's cadence ("let's take a look"), snark at the players' characters;
- a new form the writer fills, such as every paragraph ending on a thesis line, or the same hedge in every section;
- the voice leaking into the lines that plan the story, such as a thread named with a figure of speech, which the director turned down at 100326;
- a longer list of rules for the writer to obey;
- any change that makes the draft depend on the director's early input.

## Constraints

- The truth floor holds: what T1 to T15 require of a claim does not change, only the wording of how an opinion is said (T1) and how a game rule stays unsaid (T14).
- Each rule is stated once, with its reason, in the rule files (`.claude/skills/journalist-report/references/rules/`), and `lib/__tests__/rule-set.test.js` lints them: each item once, every pointer to an item that exists, no em-dash, no gendered Nova, nothing on `lib/__tests__/fixtures/removed-phrases.js`.
- No session's sentences go into the rules, for the reason above.
- The director's edits stay final: nothing here touches the machinery that holds a rework to them.
- Prompt changes are re-pinned with their reason in `lib/__tests__/writer-prompts-pinned.test.js`; tests that pin rule wording (`lib/__tests__/rule-set.test.js`, `lib/__tests__/article-writer-map.test.js`) move with the text.
- No gate makes a live model call, and no old session is rerun live. The test is the director's next new session.
- The text of every rule and description changed here is the director's to approve before the plan, as a rule-text read (the step every phase since 3 has used).

## The design

### 1. The voice, described (C12)

`craft-voice.md` (C12) becomes the description of Nova's voice: who Nova is as a reporter, who reads the article (the players, about their own session), and how Nova works a case and sounds, built on Coffeezilla's way of working a case, written as prose. It carries points 2 to 4 of the standard as what that voice does in a sentence, each with its reason, and the director's test that every line makes sense. It is written as a description of a writer, not as instructions, with as few prohibitions as possible: where it names a failure, it says what Nova does instead. It quotes no phrase, a hedge included, so that none becomes a tic: it describes what a reporter's hedge does, not the words.

The director decided: C12 describes what we want from Coffeezilla's writing and voice, in place of today's list of names (Kara Swisher, Casey Newton, Heather Cox Richardson, Marisa Kabas, Coffeezilla "for following the money" and Hunter S. Thompson "for first-person energy only"). A bare list of names gave the writer almost nothing: nothing in the three drafts reads like any of them. C12 also says the voice is every line that prints, the headline, the deck and the section headings included, wherever they are written (section 3), while the lines that plan the story stay in plain story terms (C16).

### 2. The cohesive story (C2, C4, C16)

The story's shape already lives in C1 (one thesis), C2 (every section a movement of one story), C16 (threads toward one convergence) and C19 (the question stays alive). What is missing is the paragraph: C4's "Every paragraph and card pulls the reader into the next" is met today with a punchy last line. C4 (`craft-telling.md`) carries points 1 and 6: every line says something the reader can follow, in place of today's "every sharp line makes a claim"; each paragraph makes its point toward the argument and leaves the reader on it or on the thread the next one picks up; each section hands off to the next. Point 5, the evidence, is the article writer's alone, so it goes in C16's article writer part (section 4), not in C4. C16's "the article says it once and says it sharply" becomes "says it once, plainly and in full".

Point 5 stays out of C4 because the map writer reads C4, and it should not read the line as telling it to put less evidence under each move; the map still gives the article a choice.

### 3. The headline and the deck

Today the two lines that set the article up are written by the two calls that read no voice:
- **The headline is born at the story meeting.** Each angle the arc writer pitches has one; the director may edit it there; the map and the article carry it unchanged (they did on 100926, 101026 and 101126).
- **The deck is first written by the map writer.** Its task (`mapTask`, `lib/prompt-builder.js`) opens "It writes no prose" and never names the deck, which reaches it only as a schema field ("The deck printed under the headline"). The article prints it as written: on 101126 it ended "Nova asks who gains.", which the director cut.
- **The section headings** are the map writer's too, and print as written.
- The article writer, the one call with the voice, inherits all three and builds the lede under them (`stampFromMap`).

The change:
- **The arc writer and the map writer read C12** (`ARC_CRAFT` and `OUTLINE_CRAFT` in `lib/rule-set.js` gain craft-voice). C12 says the voice is for the lines that print; every other line they write (an angle's pitch, a thread, a connection, a move, a summary, the gap note) stays in plain story terms, as C16 sets out and as the director asked at 100326, and the story-terms check is unchanged.
- **C5** (`craft-form.md`), which the arc writer, the map writer and the article writer all read, carries the director's statement of what the headline and the deck do: set the tone, establish the voice, set up the throughline, and capture the reader at once.
- **The map writer's task** names the deck, the headline it carries, and the section headings as the prose it writes, in place of "It writes no prose".
- The stamp is unchanged: the article prints the map's headline, deck and top photo, and the article writer builds the lede and the throughline on them.

The director then sees the article's tone at the meeting and on the map, where steering costs least, instead of first meeting it at the desk.

### 4. The writer's job, framed as writing

Today the article writer is told to "write the map": its task (`ARTICLE_TASK`, `lib/prompt-builder.js`) lists where everything goes and names the prose nowhere, and four places tell it the evidence under a move is what it uses and cites. The writer reads the map as a list to get through.
- **The task** opens on the article as one cohesive story that argues the settled angle's thesis, with the map as its plan, and gains a line on the prose pointing at C4 and C12. Its lines that keep the director's decisions (their edits first, every beat on the map and no other, the map's order, headings, photos, headline and deck) stay as they are.
- **C16's article writer part** says the writer writes the article the map plans, drawing on the evidence under each move for what the move needs, and cites what it uses. It carries point 5: every quotation, figure or document the article prints does something in its paragraph (proves the point, complicates it, or shows the person), and what the paragraph does not need stays in the record.
- **C2** calls the evidence "the pieces of the record the article can draw on to tell it" (today "will use to tell it"), and its line on the article writer says "drawing on its evidence".
- **The map's label** in the article writer's prompt (`STORY_MAP_LABEL`) says the evidence holds the pieces the move "can be told from" (today "is told from").
- **The identity line** (`lib/theme-config.js`, `identities.article`) may gain a clause naming the article's reader and that it is one story; the rule-text read decides.

The director agreed: the article writer's craft files (`ARTICLE_CRAFT`, `lib/rule-set.js`) end with craft-telling and craft-voice, the two that say how the prose reads, so they sit last before the director's notes. Today voice sits in the middle of the list. The arc writer's and the map writer's lists gain craft-voice (section 3) and otherwise keep their order.

### 5. The truth floor and the fiction

- **T1** (`truth-rules.md`): an opinion Nova commits to is said plainly as Nova's own, as a person says what they think, in place of "marks as Nova's, worded fresh each time". What T1 requires (the opinion is Nova's and grounded in what the record shows) is unchanged. The wording stands on its own, with no pointer to C12, because both judges read T1 and neither reads C12.
- **The judges' questions** follow T1 and T14 (`TRUTH_GROUPS` in `lib/workflow/nodes/evaluator-nodes.js`): `evidenceTruth`, which both judges ask, asks today for "an opinion marked as Nova's", and `fictionTruth` for "Nova reasoning inside the world". On 101126 the article judge, in both rounds, cited "My read, and I'll own it" as an opinion properly marked as Nova's. Left as it is, the judge keeps rewarding the label, and could score an opinion said plainly as unmarked: below 0.8 that is a must-fix, and the automatic rework would put a label back. The fix, which the director asked for: the questions ask what the rules are for, as phases 14 and 15 reworded them to their rules. `evidenceTruth` asks whether any line states as fact what the record cannot back, and says a line is Nova's by how it is said, so a line said plainly as Nova's view, asked as a question, or hedged as a reporter hedges passes, and the judge neither looks for a tag nor asks for one. `fictionTruth` asks whether any line explains a rule of the game to the players. A breach the judge does find names the line and what it states as fact; the automatic rework reads the same rules as the writer, C12 among them, so it rewrites the line in Nova's voice. No new mechanism: the wording of two questions changes, and the new wording goes into the rule-text read. The story meeting's fact check shares `evidenceTruth` and takes the same wording. What the judges hold the article to is unchanged.
- **T14**: where a game rule matters to a line, Nova reasons from what the rule makes true and leaves the rule unsaid.
- **C11** (`craft-material.md`) and **world.md**: a guest reporter is a journalist working the room, and their turn-ins are the reporting they filed to Nova, told as that (today "their name on a turn-in").
- **mode-remote.md**: Nova says once, early and in Nova's own words, that Nova followed the investigation from outside, as the start of Nova's questions; the terms of the police deal stay in the background unless the story turns on them. (The evidence is mixed: the director cut the copied rule sentence on 101026 and 101126 and kept it on 100926, where it led into the questions.)
- **C10** (`craft-material.md`) keeps its mechanics check; point 4, the verbs, lives in C12's description.

### 6. Inputs, and one fix

- **The guest reporter's line** in the writers' and judges' prompts (`guestReporterLine`, `lib/prompt-renderers/session-authors.js`) matches C11: their turn-ins are reporting they filed to Nova for this article.
- **Two guest reporters.** On 101126 the start form's one guest-reporter field held "Ashe Motoko, Taylor Chase", so code read them as one person: Ashe's turn-ins were marked with both names, and Taylor's were never marked as a guest reporter's. The session config holds each guest reporter apart, and every reader of it (the start form, the parse's stamp, the byline, `guestReporterLine`, the timeline's turn-in mark `guestTurnInName`) reads the list.
- **The timeline's turn-in mark** keeps its form ("named: Ashe (the guest reporter, Ashe Motoko)"), with each reporter named apart. The director agreed: the mark is the evidence log's fact, which every writer and judge and the exposer checks (T6) read, and the motif on 101126 came from how the rules and the notes said what a named turn-in means, which C11 and world.md now say in the world's terms. (The roadmap's phase 17 section lists the mark among the places to look at; this is the look.)

### 7. The meeting's length after a reweave

Both reweaves came back at more than twice the meeting's 450-word bound: 1,134 words on 100926 and 1,057 on 101126, the director's own lines included. Measure each page's split between the director's lines and the writer's from the stored threads' weaves (read through copies, never the live database), and report it to the director. Nothing changes at the meeting in this phase.

### 8. The standalone skill

The skill's article generator (`.claude/agents/journalist-article-generator.md`) has its own task text, which repeats the framing this design changes ("each written from the pieces of its `evidence`, citing their quotations, figures and times"), and its byline takes one guest reporter. The director decided: the skill is brought up to date as the last part of this phase, once the pipeline changes are in, so it stays usable. It follows the pipeline, as it did in phases 4b and 14 and 15: its article generator's task framed as writing the article, its rule lists matching `RULE_SET_CALLS` (craft-voice for its arc and outline agents too), and its byline taking each guest reporter. The skill reads the same rule files, so without this it would read the new voice under the old framing.

### 9. What stays

The map writer's job, apart from C2's wording of what the evidence is for, the line C4 changes, and the headline, deck and headings it now writes in the voice (section 3). C9's card counts and C17 (scenes set against receipts). The judges' criteria, apart from the two questions in section 5, and the programmatic fact check. The reworks, which read their writer's rules and so take every change above.

## How the work runs

1. **The rule-text read.** Before the plan, the full text of C12's new description, every rule edit above, the task's new lines, the map label, the guest reporter's line and the judges' two questions go to the director in one document, each beside what it replaces and the reason, as the rule-text reads of earlier phases did. It settles the one call this design leaves open, a clause on the article writer's identity line, and shows the full text of C12's description of Coffeezilla's writing and voice. The director approves or edits it. The earlier draft of 2026-10-18 (rule edits only, scratch `phase-17-rule-text-read.md`) is superseded by this design, but its quotations of today's text and of the three sessions can be reused.
2. **The plan**, written only once the read is approved, from this design and the approved text, so every slice names its exact wording and the pins and lints that move with it (among them `lib/__tests__/retired-craft-files.test.js`, which holds the skill's rule lists to `RULE_SET_CALLS` order).
3. **The build**, then the gates: the whole suite, the rule-set lint, prompt renders from stored threads (`scripts/render-prompts.js`), the pins re-pinned with reasons, and a final review. No live model call.
4. **The test**: the director's next new session, its desk edits read as two whole articles (the writer's last draft beside the approved one) against the standard above, and the reasons put to the director, as phase 15's standing step sets out.

## Left to the builder

The slices and their order; which tests move with which text; how the session config holds two guest reporters and how an older thread's single string is read; how the reweave pages are measured.
