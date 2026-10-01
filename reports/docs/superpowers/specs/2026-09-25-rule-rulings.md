# Rulings sheet: the writing rules

Written 2026-09-25 at `main` `b3d1a1a` and ruled by the director the same day (every entry now carries a ruling), for phase 3, "One rule set" (`docs/superpowers/plans/2026-09-22-roadmap.md`:15, :127). Nothing else in the repository was changed.

> **Status, 2026-09-30.** Phase 3 is now built from `docs/superpowers/specs/2026-09-30-rule-set.md`, not from this sheet. The spec holds the rulings below together with the phase 3 prep grill of 2026-09-27 to 2026-09-30, and where the two differ, the spec wins. This sheet stays as the record of how each ruling was reached; nothing below is rewritten. The later decisions change these entries:
> - **TH1.**
>   - Part (2), backstory only as a question, becomes a line of evidence: Nova states what the record backs, reports what was seen or said in the room, and presents what Nova knows but cannot back as a reading or a question (spec T1).
>   - Part (3) falls: the whiteboard is context, never cited or printed (spec T13).
> - **TL1.**
>   - The deliberation is the investigation's final act, not a separate stage.
>   - Logged times are shown on the morning clock by code: an evening session's times show AM for PM. They are no longer shifted or made relative by the writer (spec T7, section 6).
> - **PE1.** Nova is never gendered; Nova's she/her goes (spec T9).
> - **EX1.** A name on the evidence log is an honest attribution (spec T6).
> - **VO3.** The line is characters, not players: commentary may land on a character's choices, never on the player (spec T11, C13).
> - **PH1.** Every photo the director has not excluded appears, except the whiteboard photo, which is never printed (spec T13).
> - **BU3.** Talk in the room about a buried memory, recorded in the director's notes, may be reported with the speaker named (spec T3).
> - **TH3.** About 1,500 words stands, with its reason recorded: players were not reading longer articles in full (spec C4).
> - **"Rules your notes state that no prompt states yet."**
>   - A16 (a whiteboard claim names its region) falls with TH1 (3).
>   - P9 is reversed: a guest reporter who plays a character is counted (spec T10).
>   - P10 is dropped: the roster is the director's own input.
>   - T12 becomes D9: every observation is weighed, and the article prints what the thesis uses.
>   - V6 is read through the epilogue rule (spec T7).
> - **Mechanical fixes.** Phase 2 already made several (M14 to M19, M23); the rest stand.

The writers' instructions conflict in 62 places: 37 between documents and 25 inside single calls (information-architecture spec, §2.4). This sheet turns them into 43 questions. For each one you confirm a pre-filled answer, pick a side, or note that phase 2 already settled it. Defects that need no ruling are listed after the entries, under "Mechanical fixes".

## Counts

| # | Topic | Pre-filled | Open | Decided for phase 2 | Entries |
|---|---|---|---|---|---|
| 1 | Who exposed a memory | 1 | 0 | 0 | 1 |
| 2 | The buried layer and money | 4 | 1 | 0 | 5 |
| 3 | Account names | 2 | 1 | 0 | 3 |
| 4 | The timeline and the clock | 2 | 0 | 0 | 2 |
| 5 | The reporter's presence | 0 | 1 | 3 | 4 |
| 6 | Voice | 4 | 1 | 0 | 5 |
| 7 | Thesis, sections and canon truth | 4 | 3 | 0 | 7 |
| 8 | Cards, sidebar and pull quotes | 1 | 3 | 1 | 5 |
| 9 | Photos | 1 | 1 | 1 | 3 |
| 10 | People, pronouns and names | 2 | 0 | 0 | 2 |
| 11 | The detective theme | 0 | 4 | 0 | 4 |
| 12 | Prompt hygiene | 1 | 1 | 0 | 2 |
| | **Total** | **22** | **16** | **5** | **43** |

Two phase-2 entries still carry one small point to rule: PR4 (confirm) and CA5 (the sidebar's size). Four pre-filled entries carry a "to confirm" line: BU2, VO4, TH4 and PE2. The mechanical list has 30 items.

## Open entries at a glance

- **BU1.** May the article make a thread of characters none of whose memories reached the board? Your notes and your 091826 arc note disagree.
- **AC1.** May the reporter reason from the count of accounts to people, as her own hedged reading? Your 092026 edit did; your notes say accounts map to no one.
- **PR1.** Whom may the reporter's "we" include? Recommended: the reader or a guest reporter, never the room.
- **VO1.** "The group decided": banned or allowed? Recommended: name the actor where the record names one; "the room" stays for the vote and the verdict.
- **TH1.** What counts as record? Your design says everything you wrote; your notes say an out-of-game assertion must be grounded.
- **TH2.** What orders the arcs, and does exposed evidence get a fixed 80%? Recommended: the verdict orders; no fixed share.
- **TH3.** How long is the article? Recommended: 1,000 to 1,500 words, settable at the outline stop from phase 4.
- **CA1.** May a card quote paper evidence, or memories only? Your template note and your design disagree.
- **CA2.** What is a pull quote? Recommended: verbatim record quotes only, optional, the reporter's own lines stay in prose.
- **CA3.** Must every quote be attributed, and may it say "Nova"? Recommended: the speaker's name always, never "Nova".
- **PH1.** Must every photo be used? Your "all photos" note and your "exclude per photo" design; reconciliation offered.
- **DT1.** Does the no-em-dash rule apply to the detective? Recommended: yes.
- **DT2.** Detective output: HTML or JSON, and may text carry tags? Recommended: JSON, inline name and artifact tags only.
- **DT3.** Detective voice: mode block and first-person samples. Recommended: third person, no mode block.
- **DT4.** May the case report name a perpetrator as fact? Recommended: the group's finding, attributed, never a hidden truth.
- **HY1.** Fields the writer is asked for that never print. Recommended: stop asking, unless you want them printed.

## Game facts confirmed by the director (2026-09-25)

These ground the rulings on exposure, burial and account names. Source: the public how-to-play page and the director's answers.
- Memories are physical tokens behind locks and puzzles. Whoever unlocks one scans it and reads it, then chooses: **trade** (give, swap, leverage, or return it to its owner), **expose** (turn it in: the full memory goes to Nova, its summary goes up on the public Evidence Board), or **bury** (sell it to be erased; the payment goes to an account the seller chooses).
- Keeping one's own memories off the board by holding, buying back or bargaining for them is a real strategy that needs no sale. Many memories are simply never found.
- At turn-in the player chooses whether to put a name on the memory; the evidence log reads "NovaNews (Anonymous)" or a name.
- Anyone can open an account in any character's name. The live ledger shows running balances in real time and does not mark personal accounts apart from shell accounts.
- Nova's ledger lists every transaction with its time and amount (sales, the first-burial bonus, transfers), but not which memory was sold.
- The Valet (Blake) moves about the room and pulls players into quiet corners to trade; some sales happen openly, and the director's notes record them.
- The players are told about the first-burial bonus at the start, as an incentive to sell.
- The director's initial inputs (observations, the accusation, overheard lines) are Nova's observations in the fiction.

## How to read an entry

- **Pre-filled**: your own notes answer this exact question. Confirm the ruling, or change it.
- **Open**: no note decides it (a recommendation is given, with its reason), or your sources disagree (both sides are shown, sometimes with a possible middle).
- **Decided for phase 2**: settled on 2026-09-25 (IA §6). The entry says what, if anything, is left.
- **Covers** lists the register ids the entry settles. Each id appears in the Covers line of exactly one entry or in the mechanical list. The index at the end maps every id.
- **Consequence** lists what a ruling changes: craft files, prompt builders, judges' criteria and checks. Phase 3 is briefed from it.
- A note you write at a stop still outranks any rule for its session (PB:215). A ruling sets the default.

## Sources and abbreviations

Line numbers are at `b3d1a1a`. Quotes are a few words each. Session data is cited, never quoted.

| Abbrev | Path (relative to `reports/` unless absolute) |
|---|---|
| OB | `.superpowers/analysis/2026-09-24-information-architecture/objectives.md` (X1 to X37; OQ1 to OQ5 are its "Open questions"; objective ids such as A4, B8, V3. Its craft objectives are written OB-C1 to OB-C14 here, so they are not mistaken for the register's C1 to C23) |
| JC | `.superpowers/analysis/2026-09-24-information-architecture/surveys/judges-and-craft.md` (Step 2: K1, K2, C1 to C23; the judges J1 to J8 are its Step 1) |
| D1 to D5 | JC "Instructions that name data the same call lacks", in order |
| S1 to S7 | JC "References to sections the same call does not have", in order: (1) `<SESSION_FACTS>` in the reworks, (2) anti-patterns.md:270 in the reworks, (3) the roster block in the reworks, (4) `<section-rules>` in the reworks, (5) "the system prompt" in the article writer, (6) section-rules.md:555-557, (7) the outline writer's "CRITICAL TEMPORAL RULE" |
| W1 to W5 | JC "Writer against judge", in order |
| IA | `docs/superpowers/specs/2026-09-24-information-architecture.md` |
| DS | `docs/superpowers/specs/2026-09-22-director-console-design.md` |
| RM | `docs/superpowers/plans/2026-09-22-roadmap.md` |
| CTX | `CONTEXT.md` |
| DD | `docs/PIPELINE_DEEP_DIVE.md` (a developer document; no writer reads it) |
| J/ | `.claude/skills/journalist-report/references/prompts/` |
| D/ | `.claude/skills/detective-report/references/prompts/` |
| PB | `lib/prompt-builder.js` |
| EV | `lib/workflow/nodes/evaluator-nodes.js` |
| FC | `lib/content-bundle-fact-check.js` |
| AS | `lib/workflow/nodes/arc-specialist-nodes.js` |
| SA | `lib/sdk-client/subagents.js` |
| AI | `lib/workflow/nodes/ai-nodes.js` |
| NH | `lib/workflow/nodes/node-helpers.js` |
| CN | `lib/workflow/nodes/contradiction-nodes.js` |
| M/ | the director's editorial notes, kept outside the repo (line numbers as `cat -n` prints them) |
| RO, LOG26, DIFF26 | `data/091826/run-readout.md`; the 092026 evaluation records; the comparison of the writer's last version with the approved 092026 bundle (as defined in OB). Cited, never quoted |

---

## 1. Who exposed a memory

### EX1. May the article say who brought a memory to the board?

**Covers:** X1, C4, and the session report's "Exposed By" column (IA §6, Q2). **Status: Pre-filled.**

The article can always say whose memory it is: its owner. Who carried it to the board, its exposer, is often someone else. When may the exposer be named?

- Anonymous by default: J/evidence-boundaries.md:14 "ANONYMOUS BY DEFAULT"; J/character-voice.md:50; J/section-rules.md:130; J/writing-principles.md:98.
- Name them: AS:381 "name who exposed each memory"; AS:410; AS:417 (a RIGHT example naming an exposer); J/anti-patterns.md:410 "We know who exposed what", :414, and RIGHT examples at :151, :194, :211-214, :303, :326; J/section-rules.md:345, :386-387, :407-413; J/narrative-structure.md:124; J/writing-principles.md:25-29; PB:1336 "Celebrating sources who exposed"; DD:136.
- Stricter than both: J/formatting.md:33 "Nova NEVER reveals who exposed evidence".

**Your notes.** M/feedback_aln_exposure_attribution.md:13 "exposure is anonymous by default"; :15, a name only "where credit-taking is documented". M/feedback_evidence_boundary_analysis.md:48: a named exposer in the session data counts; :50: credit you give without naming memories stays generic. M/feedback_aln_voice_survives_mechanics.md:14: owner is not exposer, in prose too.

**Ruling to confirm.**
- Exposure is anonymous by default.
- The article names an exposer only where your notes or the record show that person took credit. A named entry in the "Exposed By" column counts, for that memory.
- Credit you give without naming memories stays generic.
- A memory's owner is never assumed to be its exposer.
- The arcs follow the same rule, because they feed the outline and the article.
- The choice to expose is still celebrated, without a name where none is licensed.

**Consequence.**
- Craft: J/formatting.md:33 relaxes to the rule. Examples are rewritten to describe content and owner: J/anti-patterns.md:151, :194, :211-214, :303, :326, :410, :414; J/section-rules.md:345, :386-387, :407-413; J/narrative-structure.md:124; J/writing-principles.md:25-29.
- Builders: AS:381, :410, :417; PB:1336.
- Plumbing: phase 2.2 keeps the "Exposed By" column in state, on disk and at the input review, and holds it out of the writers' prompts (RM:86). Phase 3 sends it to the writers together with this rule.
- Judges: nothing checks it today (JC Step 1, "Writer rules" table; RO:404). The claim check (phase 7) is its natural home.
- Docs: DD:136.

**Your ruling:** Accepted 2026-09-25. At turn-in the player chooses whether to put a name on the memory: the evidence log reads "NovaNews (Anonymous)" or a name. Anonymous means a confidential source, protected even from an on-site Nova who watched them walk up; a name means they went on the record, and Nova may credit them for that memory. The owner is always nameable ("Alex's memory shows"); "Alex turned in her own memory" appears only when the log names Alex or the director notes it. The choice to expose is celebrated in aggregate ("twenty-nine memories reached me anonymously; two came with a name attached"). The arcs follow the same rule.

---

## 2. The buried layer and money

### BU1. May the article make a thread of the characters none of whose memories reached the board?

**Covers:** X12 (objective B8). **Status: Open. Your sources disagree.**

- Against: M/feedback_evidence_boundary_analysis.md:36 "Do NOT build a narrative thread" on a character's memories staying silent. Untouched memories say nothing about their owner's behaviour or money (:32-36, :96). Anyone could have held them, and the owner could run any anonymous account.
- For: your arc note at 091826 asked the writer to look at characters none of whose memories reached the public board (RO:143-145). The article printed that angle (RO:147-148).

A possible middle: the article may state, as a fact about the board, that none of a character's memories are on it. It never reads that as the character's silence, choice or finances. The risk is that a reader infers burial, which BU3 forbids.

**Consequence.**
- No prompt states either side today.
- Either way, the rule goes into J/evidence-boundaries.md (the Layer 1 and Layer 2 lists) and the arc prompt's SECTION 4 (AS:377-395). J/character-voice.md:148 changes under BU3.
- Judges: none.
- A note that asks for the other side still outranks the rule for its session (PB:215).

**Your ruling:** Accepted 2026-09-25. Absence alone is a fact about the board ("Not one of Vic's memories reached the board"); many memories are simply never found (20 on 092026 were never scanned). Because players can trade (give, swap, leverage, return a memory to its owner), keeping one's memories off the board is a real strategy that needs no sale. When something else in the record shows the character acting on it (the director saw them searching, pocketing or bargaining; an overheard line; a document), Nova may say what they did, in the reporting mode's voice (remote: "by several accounts, Vic spent the morning making sure of it"). Without that, she does not make the leap.

### BU2. May the article count memories, and call them buried?

**Covers:** X22, C6, C7. **Status: Pre-filled, with one line to confirm.**

- Banned: PB:315 "NO game mechanics ("buried memories", …)"; PB:316 "NO countable memories".
- Used: J/evidence-boundaries.md:98 "Two memories buried.", :249; J/character-voice.md:85 "Use specific burial counts", :111, :208; J/anti-patterns.md:18-20, :136, :194, :228, :291, :303; J/writing-principles.md:56, :71, :74; J/section-rules.md:407-413; J/narrative-structure.md:95, :124; the data rows "(N tokens)" (PB:488); the printed tracker label "Total Buried" (JC Step 3).
- The reworks get the examples but not the ban (JC, C6).

**Your notes.** M/feedback_evidence_boundary_analysis.md:98: about burials the reporter gives names, totals, "COUNTS, TIMING, the AGGREGATE". M/feedback_aln_journalism_voice_lessons.md:29 "do NOT over-ban ordinary English": the ban is for production labels.

**Ruling to confirm.**
- Burials may be counted, per account and in total.
- A count never says whose memories they were (BU3).
- "Bury", "buried" and "burial" are the fiction's own words, and stay.
- Production labels stay banned. The burial bonus is BU5.
- To confirm: counting exposed memories follows the same logic. Strike this line if you disagree.

**Consequence.**
- Builders: PB:315 drops "buried memories"; PB:316 goes; PB:488 says "burials", not "tokens".
- Craft: examples that tie a count to an owner change under BU3 (J/anti-patterns.md:194; J/character-voice.md:151; J/section-rules.md:411). The other counting examples stay.
- Judges: the article evaluation's antiPatterns "game mechanics" (EV:233-239) must not treat "buried" as a mechanic. No check.

**Your ruling:** Accepted 2026-09-25 (rebuilt on the game's rules). The money story comes from Nova's ledger, which lists every transaction with its time and amount (sales into accounts, the first-burial bonus, transfers between accounts) but not which memory was sold. The article may report each account's total, every sale's time and size, how many sales each account took, bursts and lulls ("The Ember account took four sales between 10:02 and 10:14, $2 million in all"). It may count exposed memories overall and per owner ("three were Alex's"). "Bury", "sold" and "memories" are the fiction's own words.

### BU3. May the article say whose memories were buried, or what they were about?

**Covers:** X2, C5. **Status: Pre-filled.**

- Forbidden: J/evidence-boundaries.md:47, :61-63, :72, :150-155 "Any narrative content whatsoever"; PB:484; AS:367.
- Modelled anyway: J/character-voice.md:147-148 "WHOSE memories are missing from her board", :151 (a named owner's memories, "All buried."), :152 (their topic), :160, :196-201; J/narrative-structure.md:95, :101, :124; J/anti-patterns.md:194, :291, :324-325; J/writing-principles.md:56, :74, :99; J/section-rules.md:222, :411.
- The outline is asked for `thePlayers.buried`, "Character names whose evidence was buried" (outline.schema.json:196; PB:858), and `whatsMissing.buriedItems` (outline.schema.json:236).

**Your notes.** M/feedback_evidence_boundary_analysis.md:96 "Do NOT name an owner" in any buried or sold context; :81, buried content is invisible; :98, the only things reported about burials; :43, a confession licenses the account's owner, "never the CONTENTS".

**Ruling to confirm.**
- No sentence says whose memory was buried or sold.
- No sentence says what a buried memory was about, its topic included.
- Burials are reported by account name, total, count, timing and the aggregate, plus behaviour you observed.
- An open confession licenses "X openly claimed the account", never what went into it.

**Consequence.**
- Craft: every "Modelled" line above is rewritten or cut.
- Schema and builder: `thePlayers.buried` and `whatsMissing.buriedItems` go or change meaning (outline.schema.json:196, :236; PB:858).
- Judges: none. The claim check (phase 7).

**Your ruling:** Accepted 2026-09-25. Whose memory was sold, and what it said, never appears: Nova's ledger does not show it and the game erased it. The only exception is someone's attributed claim ("As the window closed, Sam was overheard: 'I just sold the one that would have finished me.'"). A sale's size speaks to its stakes, because the board pays most for what it most needs gone: Nova may say a sale was big and what that implies, never what the memory said.

### BU4. How much may the article say about what the reporter cannot see?

**Covers:** X5 (objective B11). **Status: Pre-filled.**

- Narrate it: J/character-voice.md:160 "She explicitly states what she doesn't know"; J/evidence-boundaries.md:76 "The shape of silence", :86; J/section-rules.md:548; J/writing-principles.md:74-77.

**Your notes.** M/feedback_evidence_boundary_analysis.md:98 "Keep ONE earned boundary hedge at most"; M/feedback_aln_journalism_voice_lessons.md:97 "do NOT narrate the constraint".

**Ruling to confirm.**
- At most one earned hedge about what the reporter cannot see.
- Behaviour and timing do the implying.
- The article never lectures about the boundary.

**Consequence.**
- Craft: the lines above.
- Judges: none. Both sessions' fixes were by hand (RO:402, :411; DIFF26 whats-missing#3). A should-consider criterion fits phase 7.

**Your ruling:** Accepted 2026-09-25. At most one line about what Nova cannot see, then the story.

### BU5. The burial bonus, seeds and manual adjustments

**Covers:** X35 (objective B10). **Status: Pre-filled.**

- Taught: J/section-rules.md:279-283 computes totals with a first-burial bonus.
- Banned: J/anti-patterns.md:398 "(don't reference at all)"; PB:315.

**Your notes.** M/feedback_evidence_boundary_analysis.md:100 "Ignore pure backend adjustments", and GM "adjustments" are "TRANSFERS". M/reference_character_data_sources.md:35: the account totals are authoritative.

**Ruling to confirm.**
- The bonus, seeds and GM gifts never appear.
- The writer never computes totals. The ledger's totals are the figures.
- A manual adjustment reads as money moving between accounts.
- An apparent entry error goes to you, not into print.

**Consequence.**
- Craft: J/section-rules.md:279-283 deleted. The transfer rule joins J/evidence-boundaries.md Layer 2.
- Builders: FINANCIAL_SUMMARY (PB:476-494) can apply the transfer rule only if its data shows adjustments.
- Judges: the generic "game mechanics" criterion (EV:233-239).

**Your ruling:** Accepted 2026-09-25 (changes the pre-filled answer on the bonus). The players are told about the first-burial bonus at the start, as NeurAI's incentive to sell, and it is in Nova's ledger: Nova may report it when it matters ("The first sale came at 9:14, and the board's $50,000 bonus with it"), never as a rules explanation. Transfers between accounts are reportable money movements and can be the story ("At 10:30, $375,000 left the Vic account for one called L, which never sold a thing"). The ledger's totals are the figures; the writer never computes them. An entry that looks like a mistake comes to the director before it is printed. The ledger covers only this morning's sales and proves nothing about other money in the fiction (Marcus's fortune, an inheritance, investments).

---

## 3. Account names

### AC1. May the reporter reason from the number of accounts to people, as her own hedged reading?

**Covers:** OQ1. **Status: Open. Your sources disagree.**

- For: at 092026 your own money-section edit compared the count of accounts with the count of people and suggested one person took no money. It was framed as the reporter's reading and named no one (DIFF26 follow-the-money#0). It replaced the writer's flat version of the same inference.
- Against: an account says nothing about who operated it (M/feedback_evidence_boundary_analysis.md:39, :58). Anyone could run any anonymous account (:96), so one person may hold several and the count proves nothing.

A possible middle: an aggregate inference, framed as the reporter's own reading and naming no one, is allowed. Any inference that points at a person needs behaviour you observed.

**Consequence.**
- If allowed, J/evidence-boundaries.md's Layer 2 "CAN" list (:65-71) gains the line.
- Your own edits are record and never flagged (CTX:96), so this governs the writer only.
- Judges: none.

**Your ruling:** Accepted 2026-09-25, the middle: Nova may draw a count-level inference as her own reading, naming no one (as in the 092026 money section). Any inference that points at a person needs behaviour the director observed.

### AC2. Does an account's name say who buried?

**Covers:** X3. **Status: Pre-filled.**

- Forbidden: J/section-rules.md:546 "Account name = payment recipient"; J/evidence-boundaries.md:62.
- Asserted anyway:
  - The contradiction notes: CN:59 "maintaining a named burial account" and CN:66 "a deliberate choice to be identifiable". Writers see them labelled "verified to respect evidence boundaries" (PB:1087-1088; AS:420-427).
  - J/writing-principles.md:102 "Who earned money from shell accounts".
  - J/evidence-boundaries.md:249 ("went to Vic's account for burying", marked YES).
  - J/character-voice.md:160 "who buried"; J/section-rules.md:222 ("Sam buried $127K").

**Your notes.** M/feedback_evidence_boundary_analysis.md:39: the name does not prove who walked the memory to Blake; :45, the default phrasing "an account bearing Y's name received"; :100, a name "can be a deliberate FRAME". M/project_report_quality_principles.md:14, :29.

**Ruling to confirm.**
- An account's name shows where the money went, never who buried.
- Default phrasing: "an account bearing X's name received".
- The name may be a frame.
- Only behaviour you observed ties a person to a burial.
- Your confirmation of open use licenses "X openly claimed the account", and nothing about its contents.

**Consequence.**
- Builders: CN:59 and CN:66 reworded. Phase 2.1 already relabels them as derived (RM:79).
- Craft: J/writing-principles.md:102; J/evidence-boundaries.md:249; J/character-voice.md:160; J/section-rules.md:222.
- Judges: none.

**Your ruling:** Accepted 2026-09-25. Anyone can open an account in any character's name, and the live ledger does not mark personal accounts apart from shell accounts. So a name proves nothing: "An account in Vic's name took in $400,000", never "Vic took $400,000", unless the director saw Vic sell into it or Vic claimed it. When it serves the story, Nova may raise the frame ("Was Vic cashing in, or was someone making it look that way?"). Who sold comes from the director's notes: the Valet (Blake) moves about the room pulling players into quiet corners, and some sales happen openly. Nova may line an observation up against her ledger's timestamps and pose the link as a question unless it is confirmed ("Blake had Sam in a corner at 10:12. At 10:13 the Ember account took $500,000."). A sale made openly in front of the room is a fact.

### AC3. May an account's name be decoded into a person by its spelling?

**Covers:** X4 (objective B4). **Status: Pre-filled.**

- Allowed: J/evidence-boundaries.md:69 "name patterns like ChaseT = Taylor Chase?", :80, :144, :254 (marked YES); J/section-rules.md:274, :460-462; AS:436 "Account naming that suggests involvement".

**Your notes.** M/feedback_evidence_boundary_analysis.md:58 "Name-only decoding is out."; M/project_report_quality_principles.md:44 "not NAME ETYMOLOGY".

**Ruling to confirm.**
- No. A spelling alone never ties an account to a person.
- A hypothesis tying an account to a person rests on behaviour you observed and on timing, and is posed as the reporter's question.

**Consequence.**
- Craft: the "Allowed" lines are cut or rewritten. J/evidence-boundaries.md:71 (observations against timing) stays.
- Builders: AS:436 becomes account activity that lines up with observed behaviour.
- Judges: none.

**Your ruling:** Accepted 2026-09-25. A name's spelling ("ChaseT") identifies no one by itself; with behaviour or timing behind it, it may prompt Nova's question.

---

## 4. The timeline and the clock

### TL1. How many stages, and what clock?

**Covers:** X9, C15 (objectives A12, A13). **Status: Pre-filled.**

- Stages: DD:810 says two; M/project_report_quality_principles.md:33 says three; M/feedback_aln_four_stage_timeline.md:10 and PB:800, :1103 say four.
- An evening clock: J/narrative-structure.md:27-29 "The game runs 7-9 PM Pacific", "Around 8 PM"; J/evidence-boundaries.md:84 "8:15 PM", :103, :134, :169; J/character-voice.md:36, :42, :95, :142 ("whole evening"); J/writing-principles.md:116-117 ("all night"); J/anti-patterns.md:244; DD:822.
- A morning clock: PB:294, :1106, :1116.

**Your notes.** M/feedback_aln_four_stage_timeline.md:10 "four time stages", with the table at :12-17. It refines the three-timeline note (M/project_report_quality_principles.md:33), which predates the deliberation as its own stage. M/project_report_quality_principles.md:38: investigation transactions "are AM (morning), not PM", and log times may need shifting.

**Ruling to confirm.**
- Four stages: the party (last night), the investigation (this morning), the deliberation (the end of the morning, the vote), the aftermath (the same day, when the reporter writes).
- The fiction's clock rules. Burials and exposures happen in the morning.
- An investigation timestamp is shifted into the morning or given relatively.
- The game's real evening clock never appears. Party memories keep their own night-time times.

**Consequence.**
- Craft: the evening-clock lines above.
- Upstream: `lib/evidence-preprocessor.js` SYSTEM_PROMPT 34-96 ("during game night"; JC Step 2).
- Docs: DD:810, :822.
- Judges: none. The fact check reads no time words (JC J4).
- The "whole evening" lines are also presence lines (PR2).

**Your ruling:** Accepted 2026-09-25. Four stages, each with its own voice: the party (last night) exists only as memories ("Alex's memory from 11:32 last night shows her swinging at Marcus"), never told as witnessed; the investigation (this morning) is what people did in the room ("I watched" on site, "by several accounts" remote); the deliberation (the end of the morning) is its own movement, the room writing its statement and voting; the aftermath is Nova's own reporting through the day ("I called NeurAI this afternoon"). The ledger's and the evidence log's timestamps come from the real evening clock, so the article shifts them into the fiction's morning or gives them relative ("ten minutes before the window closed"). Party memories keep their own night-time times.

### TL2. When is the article written?

**Covers:** X10. **Status: Pre-filled.**

- The prompts: PB:1108 "Written immediately after the deliberation concluded"; PB:808, :1116 "NEVER say "tonight"".

**Your notes.** M/feedback_aln_four_stage_timeline.md:21 "Nova's present tense is that evening"; :17 uses "tonight" and "this evening" for the follow-up.

**Ruling to confirm.**
- The article is written that same evening, looking back across the day.
- The aftermath (succession, departures, leaks, the reporter's own calls) arrives as same-day follow-up. "This afternoon" and "tonight" are right there.
- "Tonight" never describes the party or the investigation.

**Consequence.**
- Builders: PB:808, :1108, :1116. The post-investigation news wording (PB:418-420) already agrees.
- Judges: none.

**Your ruling:** Accepted 2026-09-25. Nova writes the same evening. "This afternoon" and "tonight" belong to her follow-up ("As of tonight, NeurAI has named no new CEO"), never to the party or the morning.

---

## 5. The reporter's presence

### PR1. Whom may the reporter's "we" include?

**Covers:** C17, W2. **Status: Open. No note decides it.**

- Never a member of the room: both mode blocks say "You did not vote" (PB:246-249); the fact check's vote phrases (FC:158); the article evaluation's reporterMode (EV:244-250).
- "We" as the room: J/writing-principles.md:134 "We ran out of time"; J/anti-patterns.md:410 "We know who exposed what".
- The article evaluation asks for "(I, my, we)" (EV:229, :608).
- Your own "we" elsewhere means the reporter and the reader (M/feedback_aln_journalism_voice_lessons.md:93, "our little investigation together") or the reporter and a guest reporter (:64).

**Recommended.**
- "We" means the reporter and the reader, or the reporter and a guest reporter.
- It never makes the reporter one of the room that investigated, exposed or voted.
- The judge stops asking for "we".

Reason: the reporter never votes and owns no exposed memory (objective V3).

**Consequence.**
- Craft: J/writing-principles.md:134; J/anti-patterns.md:410.
- Judges: EV:229, :608.

**Your ruling:** Accepted 2026-09-25. On site, "we" may take in the room for the experience of being there, never for an act Nova did not do (exposing, accusing, voting) and never the party. Remote, "we" never includes the room. In both modes "we" may be NovaNews, Nova and her reader, or Nova and a guest reporter sharing the byline. The judge stops treating "we" as a voice marker.

### PR2. Presence and absence lines outside the mode block

**Covers:** X6, K2. **Status: Decided for phase 2.**

Decided on 2026-09-25 (IA §6, Q3; RM 2.6): every presence or absence line defers to the mode block. Nothing is left to rule here.

What phase 2 changes:
- Builders: PB:418-419, :1074, :1077-1078, :1112, :1183; AS:191.
- Craft: J/writing-principles.md:7, :25-29; J/evidence-boundaries.md:134; J/anti-patterns.md:246, :280, :315, :378, :408; J/character-voice.md:36; J/narrative-structure.md:270; J/section-rules.md:100, :513; J/photo-enrichment.md:36, :48.
- Docs: DD:162, :446.
- Your note M/feedback_aln_journalism_voice_lessons.md:39 (anchor observations in first-person witnessing) now holds on site only, as M/project_report_quality_principles.md:35 says.
- The clock words inside some of these lines follow TL1.

### PR3. Announcing absence

**Covers:** X8 (objective V2). **Status: Decided for phase 2.**

Decided: a remote writer shows its absence through attribution and states it at most once, and the article judge's remote rule says the same (RM:106, :108; DS:133). Nothing is left to rule.

What phase 2 changes: the remote block (PB:248); the reporterMode criterion (EV:244-250) and the mode line in the judge's user prompt (EV:800-809). On 092026 the judge scored the announcement as good voice (LOG26).

### PR4. First person at the arc and outline stages

**Covers:** X7, C2. **Status: Decided for phase 2, one point to confirm.**

- On site: PB:247 "You watched the investigation from inside the room"; PB:1106; M/project_report_quality_principles.md:35.
- Third person in both modes, at the arcs and the outline: PB:804 "never a first-person presence claim"; AS:406; SA:188; AS:257.
- Presence lines under them (changed in phase 2): PB:418-419; J/evidence-boundaries.md:134; J/narrative-structure.md:270.

Decided: presence lines defer to the mode block (RM 2.6).

**To confirm.** The arcs and the outline stay in the third person in both modes. They are plans, not the article, and your design already has arcs as third-person claims (DS:36, :38). First person on site belongs to the article only.

**Consequence.** None beyond phase 2, if confirmed.

**Your ruling:** Point confirmed 2026-09-25: the arcs and the outline stay in the third person in both modes; only the article uses Nova's first person.

---

## 6. Voice

### VO1. "The group decided"

**Covers:** C16. **Status: Open. No note decides it.**

- Banned: PB:317 "NO passive observer voice ("The group decided")"; PB:1332; PB:335-336.
- Used: J/section-rules.md:509 "State what the group decided."; J/evidence-boundaries.md:250 ("The group suspected Sam", YES); J/writing-principles.md:115, :127; the outline's PB:682 "Frame as "The group accused...""; PB:691.
- Your notes: M/feedback_aln_journalism_voice_lessons.md:60, passives hide who did what, so name the actor. Nothing about a collective subject. Your own 092026 edit made the room the subject of its verdict (DIFF26 closing#0).

**Recommended.**
- Name who acted wherever the record names them.
- "The group" or "the room" stays for what the room did together: the vote and the verdict.

Reason: who did what is named, and named right (objective P8); the accusation is reported as recorded (A8).

**Consequence.**
- Builders: PB:317, :1332, :335-336 narrowed to the recommendation.
- Craft: the lines that use it stay.
- Judges: none.

**Your ruling:** Accepted 2026-09-25 as recommended: name who acted wherever the record names them; "the group" or "the room" stays for what the room did together, the vote and the verdict.

### VO2. How far does the systemic critique run?

**Covers:** X15. **Status: Pre-filled.**

- A lens: J/character-voice.md:30 "let it recede when the session's gap lies elsewhere".
- Everywhere: PB:1337 "Systemic critique woven throughout"; J/section-rules.md:512 "Scale implication", a required closing step; J/character-voice.md:111 "Land on the system as the real villain".

**Your notes.** M/feedback_aln_journalism_voice_lessons.md:93 "cut the grand systemic op-ed ending"; M/project_report_quality_principles.md:24 "not generic surveillance capitalism"; M/feedback_aln_071826_editorial_patterns.md:14, critique "targets the institution's interests".

**Ruling to confirm.**
- The systemic critique is a lens. It appears where this session's evidence earns it.
- It works through this session's names and choices, aimed at institutions.
- It is not required in every section.
- The closing is never a generic op-ed. It stays an open investigation.

**Consequence.**
- Builders: PB:1337.
- Craft: J/section-rules.md:512 becomes optional; J/character-voice.md:111.
- Judges: emotionalResonance is generic (EV:280-284). No check.

**Your ruling:** Accepted 2026-09-25. Criticism of the system appears where this session's evidence leads there, in this session's names ("The board spent $7.5 million this morning making things disappear. Who signed off on that?"), never as generic commentary. The closing ends on an open question, not an op-ed.

### VO3. Naming individuals in the critique

**Covers:** X16. **Status: Pre-filled.**

- J/section-rules.md:511 "Name the people. Name the choices." against J/character-voice.md:44 "never punches down".

**Your notes.** M/feedback_aln_071826_editorial_patterns.md:14 "named individuals get facts, not menace".

**Ruling to confirm.**
- The closing names the session's people and their choices, as facts.
- Judgement and menace aim at institutions: NeurAI, its board, the extraction business.

**Consequence.** J/section-rules.md:511 adds "as facts". Judges: none.

**Your ruling:** Accepted 2026-09-25. The closing names people and what they did as plain facts. Judgement aims at NeurAI, its board and the business of buying memories, not at the players' characters: the players read about their own characters, the report is a gift, and the critique lands on the system.

### VO4. Grace against the thesis, and celebrating the players

**Covers:** X33, OQ4 (objective P11). **Status: Pre-filled, with one line to confirm.**

- Grace: M/project_report_quality_principles.md:26 "frame it as deliberate grace".
- No exemption: M/feedback_aln_voice_survives_mechanics.md:16 "refuse to pretend it places them outside the pattern".
- Celebration: J/formatting.md:70 and EV:583 (the article is a gift that celebrates how the players played).
- Your later note reconciles the first two in one line (:16): honour the moment, and refuse the exemption.

**Ruling to confirm.**
- A genuine moment of grace is honoured as grace.
- No one is exempted from the who-profited thread for being sympathetic.
- The players are celebrated by showing each one's specific choices, never by softening the thesis.
- To confirm: this holds for the whole cast, not only for sympathetic beneficiaries (OQ4 asks the broad form).

**Consequence.**
- Craft: no prompt states it. It joins J/character-voice.md near :40 ("Empathy for buriers").
- Judges: EV:583 keeps "celebrates", with no exemption. No check.

**Your ruling:** Accepted 2026-09-25. A genuine act of grace is honoured as grace (for example, returning a memory to its owner instead of selling it), and the article still follows the money wherever it leads, for every character, not only the likeable ones. The players are celebrated by showing each one's specific choices, never by softening the thesis.

### VO5. "memory token"

**Covers:** X21, W1. **Status: Pre-filled.**

- Banned for writers: J/character-voice.md:54 "NEVER refer to "memory tokens" as objects"; J/anti-patterns.md:148-151, :372; PB:314; the detective's PB:355, D/anti-patterns.md:26, D/evidence-boundaries.md:49.
- Allowed by the judges: EV:236, :607, :609; the detective's EV:235.

**Your notes.** M/feedback_aln_voice_survives_mechanics.md:24: "memory token" is in-world and "fine ACROSS BOTH THEMES". Judges must not block it. The writing prompts steer away "advisorily". The detective bans only the capitalized label.

**Ruling to confirm.**
- "memory token" may print in both themes, and no judge blocks it.
- Writers prefer "extracted memory" (journalist) or "memory extraction" (detective), as advice, not a ban.
- The bare system label "token" or "tokens" is banned everywhere.
- The detective never uses the capitalized label "Memory Token".

**Consequence.**
- Craft: J/character-voice.md:54 softens from "NEVER" to a preference; J/anti-patterns.md:148-151 checked against it.
- Builders: PB:314 stays aimed at bare "tokens". PB:488's "(N tokens)" changes under BU2.
- Judges: EV:235-236, :607, :609 already agree.

**Your ruling:** Accepted 2026-09-25. "Memory token" may appear in print; writers prefer "extracted memory". The bare word "token" never appears as system talk.

---

## 7. Thesis, sections and canon truth

### TH1. What counts as record?

**Covers:** X11 (objective A15). **Status: Open. Your sources disagree.**

- Everything you wrote: CTX:32 (the record includes your notes, accusation text, photo descriptions and edits); DS:12 "Text the director wrote counts as record."; CTX:96 (exempt from the claim check).
- Grounded only: M/feedback_evidence_boundary_analysis.md:102, point (d). Something you say is true outside the game is "NOT the same as GROUNDED". The writer cites the grounded piece and poses the rest as the reporter's question. J/evidence-boundaries.md:230 agrees.
- The whiteboard: M/feedback_aln_071826_editorial_patterns.md:21 "The parse is a hint sheet". CTX:32 lists the whiteboard itself, so this half agrees if the record means the board.

A possible middle:
- Your notes about the session (observations, overheard quotes, the accusation) and your edits are record.
- A fact about the fiction's hidden backstory that you assert in a note, and that no document or observation grounds, reaches print as the reporter's question, unless you write it yourself in an edit.
- The whiteboard in the record is the board. The parse is a hint.

**Consequence.**
- Judges and builders: EV:410 ("ground truth - never question them") and AS:299 ("the AUTHORITATIVE source") are worded to match.
- Craft: J/evidence-boundaries.md:226-233.
- The claim check's scope (phase 7).

**Your ruling:** Accepted 2026-09-25. (1) What happened in the session (the director's observations, the accusation, overheard lines, the vote: all the initial inputs) is record, and is Nova's own observation in the fiction: on site she saw and heard it; remote, it reached her from people in the room. (2) Backstory the director knows but nothing in the session shows reaches print only as Nova's question, grounded in what the record does show, unless the director writes it in at the article stop. (3) The whiteboard in the photo is the record; its parse is a hint.

### TH2. What orders the arcs, and what weights the evidence?

**Covers:** X32. **Status: Open. No note decides these two lines.**

- Volume: J/narrative-structure.md:53 "PRIMARY EVIDENCE | 80%".
- Alignment: J/evidence-boundaries.md:198 "ACCUSATION ALIGNMENT, not evidence volume".
- Your notes set the frame, not the lines: the thesis dictates "everything downstream" (M/feedback_aln_reports_thesis_driven.md:7).

**Recommended.**
- Arcs are ordered by how they bear on the room's verdict: the accusation, the whiteboard and your observations.
- In the article, the space a thread gets follows the thesis and the exposed record.
- The fixed "80%" goes.

Reason: the thesis is the gap between the verdict and the record (objectives T1, T6), and coverage is proportional (T11).

**Consequence.**
- Craft: J/narrative-structure.md:50-56; J/evidence-boundaries.md:198 stays; the detective's narrative-structure.md carries its own 80% (JC Step 2 table).
- Builders: the arc priorities (AS:334-352) checked against it.
- Judges: the arc evaluation's coherence criterion is generic.

**Your ruling:** Accepted 2026-09-25 as recommended: arcs are ordered by how they bear on the room's verdict; the fixed 80% goes.

### TH3. How long is the article?

**Covers:** X17 (craft objective OB-C9). **Status: Open. No note gives a number.**

- DD:32 "~3000 words". No writer reads DD.
- J/formatting.md:192 "1000-1500 words of prose"; PB:1232; J/narrative-structure.md:134; the section budgets in `lib/theme-config.js`:44-50.
- Your design makes a word count "over the ceiling" must-fix (DS:86) and puts the length on the story map (DS:48). 091826 published at about 1,700 words (RO:433-434).

**Recommended.**
- 1,000 to 1,500 words of prose by default.
- From phase 4, you can set a session's length at the outline stop.

Reason: every writer already carries this range, and a must-fix ceiling needs one number (craft objective OB-C9; DS:86).

**Consequence.**
- Docs: DD:32.
- Craft and builders: J/formatting.md:192; PB:1232; the theme-config budgets.
- Judges: the outline's word budget is advisory (EV:171-190), and nothing checks the article's length. A free word-count check fits the fact check.

**Your ruling:** Accepted 2026-09-25 as recommended: 1,000 to 1,500 words of prose by default; from phase 4 the director can set a session's length at the outline stop.

### TH4. A fixed section list, or a thesis-driven one?

**Covers:** X13, W3, OQ3 (objective T5). **Status: Pre-filled, with one line to confirm.**

- Thesis-driven: M/feedback_aln_reports_thesis_driven.md:23 "If 'The Players' doesn't serve the thesis ... drop it"; :14, a session that led with the accusation and dropped THE PLAYERS; M/feedback_aln_071826_editorial_patterns.md:15 "scaffolding, not contract" (WHAT'S MISSING deleted, the closing untitled).
- Fixed:
  - EV:155-158, requiredSections, structural: lede, theStory, thePlayers, closing.
  - `outline.schema.json`:7 requires all six; `lib/theme-config.js`:43-45 requires four and makes two optional (W3).
  - J/section-rules.md:431 "Don't dwell, but don't skip."
  - PB:1236, a fixed list of section ids.
- Your design keeps the six keys for tooling (DS:48): the thesis echo, rollback tables, section ids, console labels.

**Ruling to confirm.**
- The thesis decides the sections. A section whose job is done elsewhere goes.
- Order and headings follow the session's tension.
- The six keys stay as slots for tooling. A slot may print empty, print untitled, or carry a heading the thesis chooses. That answers OQ3: yes.
- To confirm: the slots may print in a different order, as when the accusation leads (thesis_driven.md:23).

**Consequence.**
- Judges: EV:155-158 changes from "all present" to "each printed section earns its place".
- Schema and config: `outline.schema.json`:7 and `lib/theme-config.js`:43-45 allow empty slots. The bundle schema and the template must accept an empty or untitled section and print nothing for it (to verify).
- Craft and builders: J/section-rules.md:431; PB:1236.
- The detective's five required sections (EV:113-114) are untouched unless you extend this ruling.

**Your ruling:** Accepted 2026-09-25. The thesis decides which sections exist, their order and their headings: open with the verdict when the verdict is the story, drop a section whose job is done elsewhere, leave the closing untitled. The six keys stay as slots for tooling.

### TH5. Is there a right answer to grade the verdict against?

**Covers:** X14. The detective side is DT4. **Status: Pre-filled.**

- A right answer implied: J/writing-principles.md:121 "I don't know if the group got it right"; AS:350 "something players completely missed"; PB:685 "Evidence pattern players missed. Frame as revelation."

**Your notes.** M/feedback_aln_reports_thesis_driven.md:19 "There is no canon truth." The group authors the story.

**Ruling to confirm.**
- There is no right answer, and the article never grades the verdict against one.
- The gap is between the room's verdict and the record the room had.
- A "discovered" arc is a pattern in the record the room did not take up, framed that way, never as the solution.

**Consequence.**
- Craft: J/writing-principles.md:112-125 (the verdict examples).
- Builders: AS:350; PB:685.
- Judges: none.

**Your ruling:** Accepted 2026-09-25. There is no right answer. The article never says the room got it wrong or names "the real killer"; the story is the gap between what the room decided and what the record in front of it points to ("The room called it an overdose. Four memories on the board point to a fight at 11:32.").

### TH6. What does the headline carry, and what does the deck carry?

**Covers:** X18 (craft objectives OB-C1, and OB-C2 for the deck, which no prompt states). **Status: Pre-filled.**

- Long, with every duty on the headline: J/formatting.md:199-202, and the three examples from :208.

**Your notes.** M/feedback_aln_headlines_journalism_craft.md:26, the checklist is met by the "headline-AND-deck UNIT"; :28 "Great ones are 3-5 words."; :21-23, the deck's job.

**Ruling to confirm.**
- The headline is a hook with one idea: a proper noun and an active verb, short (three to five words at best). It does not spoil the strongest move.
- The deck carries the who and what, the stakes and the turn. It pairs with the headline without echoing it.
- Proper noun, claim, stakes and genre are met by the two together.

**Consequence.**
- Craft: J/formatting.md:196-212, the rules and all three examples.
- Builders: the outline has no headline field and does not load formatting.md (PB:822-874; `lib/theme-loader.js`:23). The story map (phase 4) puts headline and deck on top.
- Judges: none. A should-consider criterion (DS:86).

**Your ruling:** Accepted 2026-09-25. The headline is short, with a name and an action ("NeurAI Pays to Forget"), and does not give away the article's strongest move. The deck carries who, what, the stakes and the turn ("Nine people spent the morning uncovering how Marcus Blackwood died. Then they voted to call it an overdose.").

### TH7. Fixed "preserve" text in reworks

**Covers:** X28, C19 (objectives T16, H6). **Status: Pre-filled.**

- Fixed text: NH:939 "PRESERVE THESE"; NH:1016 "Do NOT regenerate from scratch"; NH:1019; AI:1133, :1136, :1145, :1153 "Make minimal, surgical fixes"; AI:1606; AS:1108, :1117, :1196-1199.
- Against: AS:1096-1097, "You MAY replace entire arcs" (the arc rework's send-back branch); M/feedback_aln_refinement_structural_moves.md:10 (structure before polish).
- The article rework's first line names another task: "to fix voice issues you identified" (PB:295).

**Your design.** DS:79: the instruction to preserve "is never fixed text".

**Ruling to confirm.**
- No rework carries fixed "preserve" or "do not regenerate" text.
- How much to keep follows your note now, and the send-back's scope once scopes exist (phase 11).
- Your note outranks an evaluation's praise of a criterion.
- A rework's first line names the task its revision context gives it.

**Consequence.** The fixed-text lines above; PB:295. Judges: none.

**Your ruling:** Accepted 2026-09-25. The director's send-back note governs a rework: "rethink it from scratch" gets a rethink, and no fixed "preserve everything" instruction overrides it. A rework's first line names the task its revision context gives it.

---

## 8. Cards, sidebar and pull quotes

### CA1. What may an evidence card quote?

**Covers:** X31. **Status: Open. Your sources disagree.**

- Memories only: M/reference_aln_journalist_template_render.md:13 "paper evidence goes in prose, not cards"; J/formatting.md:25-27.
- Any document: CTX:84 "quotes one document from the record"; DS:92 "for a long document, which passage". At 092026 you restored a form and an email as cards (DIFF26).
- The template note describes the skill path. The design is later (2026-09-22).

**Consequence.**
- Craft: J/formatting.md:25-27.
- Builders: PB:1160-1166 already draws from any document in the evidence packages. In phase 5 the citation line names the kind.
- Judges: the fact check already reads paper sources (FC:291-315).

**Your ruling:** Accepted 2026-09-25. Memories are the primary cited evidence: each exposed memory is a recording of the night that a player chose to bring to Nova instead of selling, so printing them reports on the players' choices. A document (email, form, text thread) may be a card, quoting only the passage that matters, never the whole. Every card is cited clearly: a memory by whose it is and when; a document by its kind and which one.

### CA2. What is a pull quote, and how many?

**Covers:** C11. **Status: Open. No note decides it.**

- Kind. Verbatim only: J/narrative-structure.md:215 "Pull quotes are verbatim, not summaries"; PB:1140. The reporter's own line: J/narrative-structure.md:212 ("Nova's crystallized insight"); PB:1191.
- Count. J/editorial-design.md:83, :143 "2-3", against J/formatting.md:45 "Optional, no minimum.", PB:1192, and J/narrative-structure.md:172 (at most one in the closing).
- Format. J/section-rules.md:378-379 puts commentary inside the quote and attributes it to the owner's memory. J/formatting.md:122 and J/narrative-structure.md:226-227 give the line and the speaker only.
- Your notes: nothing direct. At 091826 you cut a crystallizing quote block (RO:411). Aphorisms are usually filler (M/feedback_aln_journalism_voice_lessons.md:78).

**Recommended.**
- A quote block quotes the record word for word and names its speaker.
- The reporter's own crystallizing line stays in prose. The template prints every quote block inside quotation marks (JC Step 3, `quote.hbs`:13), so a crystallization reads as someone's words.
- Quote blocks are optional: none required, at most one in the closing.
- No commentary inside the quotation marks.

Reason: every quotation is verbatim and in the mouth the record names (objective A4).

**Consequence.**
- Craft: J/editorial-design.md:83, :143; J/narrative-structure.md:172, :204-227; J/section-rules.md:378-379, :480; J/formatting.md:43-50, :122.
- Builders: PB:712-714, :1140, :1189-1192; the schema description `content-bundle.schema.json`:130; the console's "Nova's Insight" label (`lib/theme-config.js`:69).
- Judges: nothing checks quote blocks (objective A4).

**Your ruling:** Accepted 2026-09-25. A quote block quotes the record word for word and names its speaker; Nova's own lines stay in prose. Quote blocks are optional and each must serve the flow of the article: generally two or three per article at most, none in the lede, at most one in the closing.

### CA3. Must every quote carry an attribution, and may it be "Nova"?

**Covers:** C3, C12, X20. **Status: Open. No note decides it.**

- Required: PB:1241 "attribution REQUIRED".
- Omitted for a crystallization: PB:1191; `content-bundle.schema.json`:130; J/section-rules.md:480; J/narrative-structure.md:212.
- Never "Nova": J/formatting.md:49 "NEVER "— Nova""; PB:714; PB:1191.
- "Nova" allowed: J/anti-patterns.md:416; PB:337 "remove attribution or use "- Nova"" (the article rework's only rule on this).
- What prints: any attribution, "Nova" included (JC Step 3, `quote.hbs`:14-16).

**Recommended.**
- A verbatim quote carries its speaker's canonical name.
- "Nova" is never an attribution.
- If CA2 keeps crystallizations, they carry none.

Reason: the template prints whatever is given, and a quote's speaker is a fact (objective A4).

**Consequence.**
- Builders: PB:1241, :337.
- Craft: J/anti-patterns.md:416.
- The schema description stays theme-neutral (M/feedback_aln_schema_descriptions_model_facing.md:14).

**Your ruling:** Accepted 2026-09-25 as recommended: every quote names its speaker's canonical name; "Nova" is never an attribution.

### CA4. Does an inline card quote the whole document, or a passage?

**Covers:** C9. **Status: Pre-filled.**

- Whole: PB:1184 "do NOT truncate or summarize"; PB:1264 "Include tokenId prefix and timestamp"; J/formatting.md:102.
- A passage: J/formatting.md:90, :138 "verbatim sentence(s) copied".

**Your design.** CTX:84: the writer chooses "for a long document, the passage"; DS:92.

**Ruling to confirm.**
- A card quotes its document word for word: all of a short one, one passage of a long one.
- Its text carries no id or timestamp. The citation line names the document (phase 5).

**Consequence.**
- Builders: PB:1184, :1262-1265.
- Craft: J/formatting.md:90, :102, :138.
- Judges: the fact check already accepts a passage. It tests each sentence against the source (FC:427-467).

**Your ruling:** Accepted 2026-09-25 (with CA1). A memory card prints the whole memory, since memories are short, with a citation line ("Alex Reeves's memory, 11:32 PM last night"). A document card prints the passage that matters, cited by kind and name. No ids or timestamps appear inside the card text.

### CA5. Sidebar entries

**Covers:** X19, K1, C10. **Status: Decided for phase 2, one point left.**

Decided: a sidebar entry holds a headline and a summary. The writer writes no document text there, and the fact check reads only printed text (DS:94; RM:101-106).

Left to rule:
- How many: PB:1279 "Sidebar: 5-8 cards", against J/formatting.md:65, :96 and J/editorial-design.md:81 "~10".
- Whether the sidebar lists the inline cards' documents: J/editorial-design.md:91 "The SAME cards appear inline".

**Recommended.** The sidebar is a short catalogue, about five to eight entries, of the documents the article relies on. It includes every document printed as an inline card.

Reason: the sidebar is a short catalogue (craft objective OB-C10), and a reader should find each card's document in it.

**Consequence.**
- Builders: PB:1250, :1262 (phase 2), :1275-1280; `content-bundle.schema.json`:237.
- Craft: J/formatting.md:65, :94-100, :153; J/editorial-design.md:81, :90-91.

**Your ruling:** Point confirmed 2026-09-25: the sidebar holds about five to eight entries, headline and one-line summary each, including every document printed as an inline card.

---

## 9. Photos

### PH1. Must every photo be used?

**Covers:** X25, OQ5. **Status: Open. Your sources disagree.**

- All: M/project_report_quality_principles.md:28 "All photos should be used".
- Exclude: DS:42 "Exclude per photo."

A reconciliation for you to accept: every photo you have not excluded appears, and an excluded photo never does (objective Ph5).

**Consequence.**
- No prompt states either side.
- Builders: the outline's photo list (PB:744-746). Plumbing: the exclude filter (phase 9).
- Judges: the outline's photoPlacement (advisory) could count use. The fact check checks filenames only.

**Your ruling:** Accepted 2026-09-25: every photo the director has not excluded appears; an excluded photo never does.

### PH2. What decides where a photo goes?

**Covers:** X27. **Status: Pre-filled.**

- Pacing: J/narrative-structure.md:193 "Humanize before revelation"; PB:717.

**Your glossary and design.** CTX:64: the beat "decides where the photo is placed". DS:42: when your description is thin, the writer places the photo "in the flow of the story", still grounded in what you wrote.

**Ruling to confirm.**
- The beat decides where a photo goes.
- Pacing decides only when your description is thin.
- Photos still spread across the sections (J/editorial-design.md:153).

**Consequence.**
- Craft: J/narrative-structure.md:187-198.
- Builders: PB:716-718. Your description reaches the writers in phase 2.2.
- Judges: the outline's photoPlacement (advisory) scores by pacing today.

**Your ruling:** Accepted 2026-09-25. A photo goes where the article reaches the moment the director's description names; its caption says what the photo shows and may add context from the article, never a different subject or action. When the description is thin, the writer places the photo where it fits the flow. Photos spread through the article.

### PH3. Whose photo description is the authority?

**Covers:** X26. **Status: Decided for phase 2.**

- Haiku's: EV:514 "The photo descriptions are ground truth".
- Yours: DS:42; M/feedback_aln_071826_editorial_patterns.md:21.

Decided: your description reaches the outline and article writers and the outline judge word for word (RM:84), and Haiku's descriptions carry a derived label (RM:79). Nothing is left to rule. Checking captions against your description is phase 9.

---

## 10. People, pronouns and names

### PE1. Where do pronouns come from, and what if one is missing?

**Covers:** C1, X30 (objectives P4, P5). **Status: Pre-filled.**

- Two answers for the victim in one block. PB:31 gives every name missing from the roster "they/them", so the block reads "Marcus → Marcus Blackwood (they/them)". PB:53-66 gives "Marcus Blackwood (he/him)". J/character-voice.md:60 says the victim's pronouns come from the non-player line only.
- The same block lists all 21 canonical names under "CANONICAL CHARACTER ROSTER" (PB:44-46), with invented they/them, while the session facts say only the roster was present (PB:1206-1207).
- A missing roster pronoun: PB:31 fills it silently; AI:934 only logs.

**Your notes.** M/reference_character_data_sources.md:15 "The director's session roster IS the source of truth"; :16, character sheets are unreliable; :17, derive from character data only when you gave none, "and flag the uncertainty". Canon: `lib/theme-config.js`:31-33 (Marcus he/him, Nova she/her, Blake none).

**Ruling to confirm.**
- Roster characters take your roster's pronouns.
- Non-player characters take canon's: Marcus he/him, Nova she/her, none invented for Blake.
- No one gets an invented default.
- A roster pronoun you did not give is flagged at input review.
- For anyone else, a pronoun from character data is a fallback marked uncertain, never a silent they/them.
- The canonical names are labelled as names, not as the roster.

**Consequence.**
- Builders: PB:27-32, :44-46; AI:932-935; the roster stop (`console/await-roster-logic.js`).
- Judges: the NPC pronoun scan is advisory (FC:559-569), and nothing checks roster pronouns (JC J4). The outline and arc prompts carry no pronouns (OB P4). The judges get them in phase 2.4.

**Your ruling:** Accepted 2026-09-25. Pronouns come from the roster the director enters at intake, not from character sheets. Marcus is he/him, Nova she/her, and Blake gets none invented. A missing roster pronoun is flagged to the director at input review, never guessed.

### PE2. "Find a place for everyone"

**Covers:** X37 (objective P2). **Status: Pre-filled, with one line to confirm.**

- J/anti-patterns.md:257-261, "Find a place for everyone. Even if just:", with an example that gives two players a behaviour no record shows.
- Against: J/writing-principles.md:93 (no invented in-room moments); FC:490-491 "specific, evidence-grounded appearance".

**Your notes.** M/project_report_quality_principles.md:27 "Every player must see themselves."; DS:12, the writer "may not invent".

**Ruling to confirm.**
- Every roster member appears, through something the record shows they did or chose.
- Nothing is invented to place anyone.
- To confirm: when the record holds nothing specific about someone, a plain mention is acceptable.

**Consequence.**
- Craft: J/anti-patterns.md:250-262; J/writing-principles.md:89-103; J/section-rules.md:416-421.
- Judges: the fact check tests names only (FC:483-493). The article evaluation's characterPlacement has no roster (EV:275-279) until phase 2.4.

**Your ruling:** Accepted 2026-09-25 (replaces the pre-filled answer). Every player character appears with context for how they fit the story, even a player who was quiet in the roleplay. Each is connected to at least one arc the article covers, and the writer draws their background from the record: their exposed memories, documents that involve them, the director's observations. Nothing is invented. There is no "plain mention" fallback; the record should hold something about every player, and a writer who finds nothing flags it at the stop as an input gap.

---

## 11. The detective theme

The detective theme has never run live, and its files contradict themselves (IA §2.4; JC open question 7). Phase 3 reviews them (RM:127).

### DT1. Does the no-em-dash rule apply to the detective?

**Covers:** X24, OQ2. **Status: Open. No note decides it.**

- The rule: M/feedback_aln_reports_em_dashes.md:7 names "ALN/NovaNews reports"; J/formatting.md:11 "Hard rule."
- The detective: its antiPatterns criterion leaves em-dashes out (EV:234-235). Em-dashes appear in D/section-rules.md:27, :64, :83; D/character-voice.md:14-38 (the samples) and :46 (the sign-off); D/evidence-boundaries.md:7, :13.

**Recommended.** Yes, both themes. The sign-off uses another mark.

Reason: your note names ALN reports, and phase 3 states each rule once for every writer and judge.

**Consequence.**
- Judges: EV:234-235, :606.
- Craft: the D/ lines above. Builders: the detective hard constraints (PB:341-365).

**Your ruling:** Accepted 2026-09-25 as recommended (yes, both themes). The detective file cleanup is parked until the director plans to run a detective session; it leaves phase 3.

### DT2. HTML or JSON, and may detective text carry tags?

**Covers:** C20. **Status: Open. No note decides it.**

- HTML: PB:303 "FORMAT: HTML"; D/formatting.md:29-36; D/section-rules.md:17, :26-29, :102-113.
- JSON: PB:1000 "as JSON matching the ContentBundle schema"; `content-bundle.schema.json`:5 "prose only, no HTML". The pipeline enforces the schema on every call.
- Tags: D/formatting.md:5-25 wraps names in `<strong>` and artifacts in `<em>`. The detective template prints text unescaped, so the tags render. The journalist template escapes them (JC Step 3).

**Recommended.**
- JSON only.
- Detective text keeps inline `<strong>` names and `<em>` artifacts. No block-level HTML.
- The schema description becomes theme-neutral: no block markup, and inline tags only where a theme's rules allow them.

Reason: the detective's formatting rule (objective V13), and one output contract for both themes.

**Consequence.**
- Builders: PB:303.
- Craft: D/formatting.md:29-36; D/section-rules.md:17, :26-29, :102-113.
- Schema: `content-bundle.schema.json`:5.

**Your ruling:** Accepted 2026-09-25 as recommended (JSON only; inline name and artifact tags only). Cleanup parked with DT1.

### DT3. The detective's voice: mode block and first-person samples

**Covers:** C21. Its invented example names are mechanical fix M6. **Status: Open. No note decides it.**

- Third person: D/character-voice.md:42 "Third-person investigative".
- Against it: the detective writer's system prompt carries the mode block (on site, PB:247 "You watched the investigation…"). The voice samples (D/character-voice.md:10-39) are first-person speech and say "tokens" (:23, :29).
- "Memory Token": PB:355 and D/anti-patterns.md:26 ban it, while the samples say "tokens". VO5 rules the label.

**Recommended.**
- The detective writes in the third person and gets no reporting-mode block. The detective was always on the case.
- The samples stay as a tone reference, labelled as speech not to be written in the first person, with "tokens" removed.

Reason: the detective voice is third person (objective V13), and the evaluator's own code already says the detective report has "no reporter presence to misstate" (EV:242-243).

**Consequence.**
- Builders: PB:254-258 (which prompts get the block); PB:300-303.
- Craft: D/character-voice.md:8-39, :42.

**Your ruling:** Accepted 2026-09-25 as recommended (third person, no reporting-mode block). Cleanup parked with DT1.

### DT4. May the case report name a perpetrator as fact?

**Covers:** no register id of its own. It is the detective side of TH5's question. **Status: Open. No note decides it for the detective.**

- Closure and a named killer: D/section-rules.md:6 "Who died, who did it", :76 "confirmed perpetrator"; D/formatting.md:13 (an example naming a murderer); D/narrative-structure.md:5 "This report provides CLOSURE".
- Your note about the journalist reports: "There is no canon truth." (M/feedback_aln_reports_thesis_driven.md:19).

**Recommended.**
- The case report states the investigation's conclusion as the group's finding, attributed to it.
- It never measures the verdict against a hidden right answer.
- It gives the group closure on what they found and chose.

Reason: there is no canon truth (objective T2), and the report gives this group closure (T15).

**Consequence.**
- Craft: D/section-rules.md:6, :74-77; D/formatting.md:13; D/narrative-structure.md:3-6.
- Judges: the detective's section criteria (EV:113-122).

**Your ruling:** Accepted 2026-09-25 as recommended (the group's finding, attributed, never a hidden truth). Cleanup parked with DT1.

---

## 12. Prompt hygiene

### HY1. Fields the writer is asked for that never print

**Covers:** C14. **Status: Open. Your design decides it for the sidebar only.**

- Asked for, never printed (JC Step 3):
  - the top-level `photos` array (PB:1284-1289), against J/narrative-structure.md:200 and J/formatting.md:163 (photos are inline blocks only; C14)
  - `pullQuotes` (PB:1282)
  - sidebar `content` and `owner` (phase 2 removes `content`)
  - byline location and date
  - the detective's headline, byline, hero and photos (PB:1013-1033)
  - `voice_self_check` (PB:1313-1342). It reaches the article judge, which on 092026 scored roster coverage from it (JC J5).
- Your design, for the sidebar: the writer writes no document text there, and "no check reads text that never prints" (DS:94). IA §7 leaves the general question open.

**Recommended.**
- The writer is not asked for any field that does not print, and no check reads one.
- Where you want a field in print (the detective headline, say), the template prints it and the writer is asked for it.

Reason: writers and checks deal only in text that prints (objective H10).

**Consequence.**
- Builders: PB:1282-1289, :1313-1342, :1013-1033.
- Schema: `content-bundle.schema.json` (the fields go, or become optional).
- Checks: the fact check's `visibleText` (FC:331-358).
- Templates, wherever printing is chosen instead.

**Your ruling:** Accepted 2026-09-25: stop asking the writer for any field that does not print, and no check reads one.

### HY2. What measures the pipeline?

**Covers:** X29. **Status: Pre-filled.**

- Two project memory notes treat the draft-to-published diff as the measure (M/project_report_quality_baseline_2026_09.md:23; M/project_first_fall_run_091826.md:23). RM:36 calls the diff a reading aid.

**Your design.** DS:9: the distance from draft to published text "is not the measure".

**Ruling to confirm.**
- The pipeline is judged by what each stop lets you see and do, and by whether your words and the session's facts reach the next writer.
- The diff stays a reading aid for planning.
- Judges are calibrated against your verdicts (phase 7).

**Consequence.** No prompt or judge changes. The two memory notes are out of date.

**Your ruling:** Accepted 2026-09-25. The pipeline is judged by what each stop lets the director see and do, and by whether the director's words and the session's facts reach the writer, not by how much the director changes the draft.

---

## Mechanical fixes (no ruling needed)

Each fix follows from a rule nobody disputes, or from what a call actually receives. Items M1 to M19 come from the register lists. Items M20 to M30 are the other defects the two registers record.

| # | Covers | Footprint | Fix |
|---|---|---|---|
| M1 | C8 | PB:1172 and J/formatting.md:107 (an evidence reference "linking to sidebar") against PB:1277 ("References to inline body cards"). The template links to neither, and prints the raw id when a reference has no caption (JC Step 3) | Describe it as CTX:88 does, a one-line caption naming a document, no link; make the caption required |
| M2 | C13 | J/section-rules.md:286, :292-296, :298-305; J/formatting.md:68; J/editorial-design.md:84. The tracker prints from the ledger in the sidebar and after the last section, and only when the writer's entries are non-empty (JC Step 3) | Tell the writer the tracker prints itself; drop the placement markers; print it whenever the ledger has a positive total. Where the mobile copy sits is a template choice |
| M3 | C18 | J/anti-patterns.md:183, an em-dash in a RIGHT example; also J/character-voice.md:38, :42 | Rewrite without em-dashes |
| M4 | C22 | J/photo-enrichment.md:40, :80-86 against the enrichment schema (`lib/workflow/nodes/photo-nodes.js`:515-537) | Align the file to the schema, or retire the call in phase 9 as planned. Its first-person examples change in phase 2.6 |
| M5 | C23 | `lib/director-enricher.js`:132 ("same sentence") against its schema :99 ("adjacent") | One wording in both places |
| M6 | X23 | Invented example names, including the names half of C21 (DT3 rules the rest of it): D/evidence-boundaries.md:12, :37-38; D/formatting.md:13-14, :18, :25; D/section-rules.md:27; D/narrative-structure.md:31; D/photo-enrichment.md:50; D/whiteboard-analysis.md:59. J/anti-patterns.md:95 lists one of these names as a hallucination; Blake has no surname in canon (`lib/theme-config.js`:33) | Canonical names only |
| M7 | X34 | SA:148 describes burial as a drug effect, against DD:95 (a memory sold to Blake for pay) | State the mechanic as canon has it: any player may sell any memory they hold to Blake, for pay into a named account |
| M8 | X36, S6 | J/section-rules.md:555-557 point at line numbers that do not exist in J/character-voice.md | Remove the pointers; phase 3 states each rule once |
| M9 | W4 | The outline evaluation's visualDistributionPlan (EV:165-169) accepted a card in the lede on 092026 (LOG26), against PB:730, PB:1147 and J/narrative-structure.md:163-172 | The judge applies the section table |
| M10 | W5 | The arc evaluation's evidenceIdValidity (EV:66-70) re-scores ids the arc check already removed (AS:1386-1408) | Drop the criterion, or score the check's removal count |
| M11 | D1 | `temporalContext` named at PB:1073, J/narrative-structure.md:33 and J/writing-principles.md:5; items render as id, type and text only (PB:938-940; AI:728-735) | The record view (phase 2.1) carries each document's stage, or the three lines go |
| M12 | D2 | A value rating named at J/editorial-design.md:27-29; no writer prompt carries one | Drop the rating table, or carry a rating in the record view |
| M13 | D3 | D/evidence-boundaries.md:31 (an "EVIDENCE:" field), :53-57 (`SF_GROUP`); D/section-rules.md:110-111 (case number and date "from metadata") | Render the fields, or drop the lines |
| M14 | D4 | The article evaluation's characterPlacement without a roster (EV:275-279); the outline evaluation's photos cut to 5 (EV:769-770) and an interweaving plan read from channels that do not exist (EV:756) | Phase 2.4 gives the judges the roster, every photo and the real plan |
| M15 | D5 | `lib/prompt-renderers/director-notes-renderer.js`:46 would print a buried memory's id into writer prompts | Print account, amount and time only (AS:367) |
| M16 | S1 | J/anti-patterns.md:115, :145 name `<SESSION_FACTS>`, which the reworks lack | Give the reworks the session facts (phase 2: a reworker sees what its writer saw) |
| M17 | S2, S5, S7 | "The system prompt" is said to hold the four-stage framework: J/anti-patterns.md:270, J/section-rules.md:135, J/narrative-structure.md:33. In the article and outline writers it is the user prompt's `<TEMPORAL_DISCIPLINE>` (PB:1102-1117, :799-809); the reworks have none | Point to `<TEMPORAL_DISCIPLINE>` by name, and give it to the reworks |
| M18 | S3 | J/character-voice.md:60 names the roster block, which the reworks lack | Give the reworks the roster block |
| M19 | S4 | J/evidence-boundaries.md:239 names `<section-rules>`, which the reworks lack | Give the reworks section-rules, or drop the pointer |
| M20 | JC loaders | Files loaded twice: D/section-rules.md in the detective outline (PB:524, :593); D/evidence-boundaries.md in the detective article (PB:924, :969); the roster block in the journalist article writer (system prompt and PB:1100) | Once each |
| M21 | JC loaders | Loaded but not rendered: J/formatting.md in the outline (its slot at PB:781 renders empty; `lib/theme-loader.js`:23); D/editorial-design.md in the detective article; D/narrative-structure.md in the detective outline | Render the file or drop the slot (TH6 decides whether the outline gets the headline rules) |
| M22 | JC loaders | Never loaded: D/arc-flow.md; the detective image files, because the image builder always takes the journalist path (`lib/image-prompt-builder.js`:305-308) | Load by theme, or delete |
| M23 | JC inline table | The arc rework gets no `<RULES>` and no `<DIRECTOR_GUIDANCE>` (AS:1157-1199), although reports/CLAUDE.md says all three reworks get `<RULES>` | Standing notes in phase 2.2; the rule set in phase 3; correct CLAUDE.md |
| M24 | JC open question 10 | Implementation notes in model-facing text: `content-bundle.schema.json`:24, :130, :258 (code files, an SDK issue number); the SDK note in the `<SCHEMA>` preambles (PB:1052, :1350) and the article rework (AI:1664); "(Commit 8.26)" and template file names (PB:1271-1275); J/anti-patterns.md:153-158, guidance for prompt authors that renders as an instruction | Move to code comments |
| M25 | JC J8 | Dead code with its own rules: `lib/workflow/reference-loader.js`; `buildValidationPrompt` (PB:1450-1538, e.g. :1478) with `validateArticle` (AI:1406-1463); `buildRevisionPrompt` (PB:1381-1440) | Delete |
| M26 | IA §2.3 | The victim's role stated twice, differently: `lib/theme-config.js`:31 against EV:350-355 | State it once in the theme config and have the judge read it |
| M27 | JC inline table | The outline JSON shape in the prompt (PB:822-874) differs from `outline.schema.json` by four fields | One source for the shape |
| M28 | JC inline table | The photo enrichment prompt asks the model to confirm no boundary violations, with no field to hold it (`lib/image-prompt-builder.js`:170-196) | Drop the line or add the field (phase 9 retires the call) |
| M29 | JC J8 | `validateFinancialData` (NH:1115-1140) reads tracker fields the schema forbids, so it matches nothing | Point it at `description`, or delete it |
| M30 | JC open question 14 | Stale text: the weight comment at EV:224; the "pass (1.0), partial (0.5), fail (0.0)" rule the judges do not follow (EV:454, :529, :598); reports/CLAUDE.md's arcAnalysis row | Correct each |

---

## Rules your notes state that no prompt states yet

These are not conflicts, so nothing needs a ruling. Phase 3 adds them to the rule set unless you object. Ids are OB's objectives.

- A3. Your raw notes and raw accusation text beat the parse (M/reference_aln_parsed_data_lossy.md:10-14).
- A6. A card's citation names the document's kind, name and owner, never its exposer (CTX:92; DS:92).
- A11. The roster count is who was at the investigation, not the party's size (RO:415).
- A16. A whiteboard claim names the board's region (M/feedback_aln_journalism_voice_lessons.md:85).
- B9. The burial ledger and any other money in the fiction are kept apart (M/feedback_evidence_boundary_analysis.md:102).
- P9. The byline reporter is not counted among the players in the room (M/feedback_aln_journalism_voice_lessons.md:89; M/reference_aln_parsed_data_lossy.md:16).
- P10. The roster is checked against your notes (M/project_report_quality_principles.md:17).
- T10. The deliberation is its own movement (M/feedback_aln_four_stage_timeline.md:19).
- T12. Every observation, overheard quote and flagged pairing is used, or marked unused at a stop (M/project_report_quality_principles.md:22-23; DS:30).
- V6. The reporter shows her reporting: outreach, dodges, spin (M/feedback_aln_journalism_voice_lessons.md:33-37).
- V7. The closing verdict is the reporter's own, never put in a source's mouth (M/feedback_aln_voice_survives_mechanics.md:18).
- V8. Questions over conclusions (M/feedback_aln_071826_editorial_patterns.md:13).
- Ph1. A caption describes what the photo shows and keeps your subject and action (M/feedback_aln_journalism_voice_lessons.md:51; CTX:64).
- Ph6. A player's appearance is never described, or used to identify a character (M/reference_character_data_sources.md:18).

---

## Coverage index

Every register id, and the one entry or mechanical fix that covers it.

| Id | Where | Id | Where | Id | Where |
|---|---|---|---|---|---|
| X1 | EX1 | X26 | PH3 | C14 | HY1 |
| X2 | BU3 | X27 | PH2 | C15 | TL1 |
| X3 | AC2 | X28 | TH7 | C16 | VO1 |
| X4 | AC3 | X29 | HY2 | C17 | PR1 |
| X5 | BU4 | X30 | PE1 | C18 | M3 |
| X6 | PR2 | X31 | CA1 | C19 | TH7 |
| X7 | PR4 | X32 | TH2 | C20 | DT2 |
| X8 | PR3 | X33 | VO4 | C21 | DT3 (names: M6) |
| X9 | TL1 | X34 | M7 | C22 | M4 |
| X10 | TL2 | X35 | BU5 | C23 | M5 |
| X11 | TH1 | X36 | M8 | D1 | M11 |
| X12 | BU1 | X37 | PE2 | D2 | M12 |
| X13 | TH4 | K1 | CA5 | D3 | M13 |
| X14 | TH5 (detective side: DT4) | K2 | PR2 | D4 | M14 |
| X15 | VO2 | C1 | PE1 | D5 | M15 |
| X16 | VO3 | C2 | PR4 | S1 | M16 |
| X17 | TH3 | C3 | CA3 | S2 | M17 |
| X18 | TH6 | C4 | EX1 | S3 | M18 |
| X19 | CA5 | C5 | BU3 | S4 | M19 |
| X20 | CA3 | C6 | BU2 | S5 | M17 |
| X21 | VO5 | C7 | BU2 | S6 | M8 |
| X22 | BU2 | C8 | M1 | S7 | M17 |
| X23 | M6 | C9 | CA4 | W1 | VO5 |
| X24 | DT1 | C10 | CA5 | W2 | PR1 |
| X25 | PH1 | C11 | CA2 | W3 | TH4 |
| OQ1 | AC1 | C12 | CA3 | W4 | M9 |
| OQ2 | DT1 | C13 | M2 | W5 | M10 |
| OQ3 | TH4 | OQ4 | VO4 | OQ5 | PH1 |
