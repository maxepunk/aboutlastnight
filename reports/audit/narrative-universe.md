# About Last Night — Narrative Universe (Ground-Truth Characterization)

**Source:** Read directly from the live Notion workspace ("About Last Night…an Immersive Crime Thriller" project) on 2026-06-19. Three databases were dumped in full via the Notion API:

| Database | Notion data source | Rows |
|---|---|---|
| **Elements** (memory tokens, documents, props, containers, set dressing) | `collection://18c2f33d-583f-806a-bb29-000b6550c2eb` | **182** |
| **Characters** | `collection://18c2f33d-583f-801e-a3bf-000b2aa23d59` | **25** |
| **Timeline** | `collection://1b52f33d-583f-8063-89b3-000ba393fdc4` | **85** |

This is a neutral characterization of the *shared, fixed* universe that every game session draws from. Each session exposes/buries a different subset; the article a session produces re-orders this same fabula. Nothing here describes one session.

**Element type breakdown (182 total):** 79 Memory Token + 2 Memory Token Video = **81 memory tokens**; 64 Document; 20 Container; 11 Prop; 6 Set Dressing.

---

## COVERAGE STATEMENT

- **Memory tokens: 81/81 captured in FULL** (complete second-person `Description/Text`, embedded SF_ fields, owner, threads, status, Act). The corpus is exactly **20 player-characters × 4 tokens (= 80) + Marcus's single MAR004**. The full text of all 81 is in the working file `audit/_tokens.txt`.
- **Characters: 25/25 captured in full** (logline, primary action, overview & key relationships, emotion toward CEO, owned elements). Working file `audit/_chars.txt`.
- **Documents/paper evidence: 64 catalogued; ~35 high-value documents captured in full** (all 21 character sheets, the blackmail email, IOU, C&D letter, paternity test, diary, police report, shell-company leverage doc, lobbying letter, bartender napkins, expose excerpt, newspaper). Working files `audit/_keydocs.txt` and `audit/_docidx.txt`. The remaining ~29 are mostly puzzle notes, short texts, and unlocked clue props.
- **Timeline: 85/85 events captured** (working file `audit/_timeline.txt`). See companion `fictional-timeline.md`.

> **Important ground-truth correction to the audit brief's expectations.** The live Elements database has been **cleaned up / consolidated**. The "46-item Memory Tokens Checklist" page (with OLD codes like ALR001, JAV003, JEK002, SAB001, SKI001, VIK001, MAB001, MOR021, HOS011, OLS011, TOZ001, DIN021) and the `ZZZ`-prefixed deprecated tokens **still exist on stray Notion documents and in search history, but are NOT present in the current live Elements database.** The live token set uses one clean, collision-free code per character (ALE, ASH, CAS, EZR, FLI, JAM, JES, KAI, MAR, MEL, MOR, NAT, QUI, REM, RIL, SAM, SAR, SKY, TAY, VIC, ZIA), each with exactly four tokens numbered 001–004. The old/new code mapping is itself a data-quality fact (see Data-Quality Notes).

---

## 1. CHARACTERS (all 25)

Two distinct identities exist: a **canonical character name** (in the Characters DB and on character sheets) and an older **first-name persona** that still appears in some Timeline notes and a few owned-element labels. The canonical (current) name is authoritative. Pronoun note: the universe is written **gender-neutral by design** — character sheets and tokens use "they/them" almost universally, and per-session director rosters assign the actual pronoun at runtime. Flag below = characters most often recast / genuinely ambiguous.

### Core tier — Players
| Canonical | Older persona | Role / occupation | Motive re: Marcus | Canonical pronoun |
|---|---|---|---|---|
| **Alex Reeves** | (same) | Engineer; Marcus's ex-partner, co-founded BizAI | Marcus stole BizAI code + the NeurAI idea; wants credit, equity, Marcus ousted (or to take NeurAI via Vic) | they (sheet uses he in one C&D line — ambiguous, **FLAG**) |
| **Ashe Motoko** | (same) | Investigative journalist (ex-SVBJ, now blogs) | Marcus got their expose buried and got them fired; justice grudge | they (**FLAG** — frequently recast) |
| **Sarah Blackwood** | (same) | Marcus's wife of 15 yrs; ex-successful career, now homemaker | Found paternity test, separating; Marcus secretly drained their shared account, left her destitute | she |
| **Remi Whitman** | **James** (Remi) | CEO of AIBioComp; competes with NeurAI for Vic's funding | Marcus gets 80%+ of the funding despite worse tech; wants to expose why | he (**FLAG** — "James" in older data) |
| **Vic Kingsley** | **Victoria** | VC; ran the 2010 Facebook internship; now funds NeurAI + AIBioComp | Marcus is a criminal-liability risk; plans to replace him with Alex | they/she (**FLAG** — "Victoria" canon, recast) |

### Core tier — NPCs
| Canonical | Role | Function |
|---|---|---|
| **Marcus Blackwood** | The murdered CEO of NeurAI (ex-BizAI); neuroscientist | Victim. The gravitational center; every thread orbits him. Owns only MAR004. |
| **Blake Manley** | "Marcus's Valet"; operations at NeurAI | NPC "Burial Facilitator" — runs the burial **market**: acting for the **NeurAI board**, he **PAYS players to bury** memory tokens (money flows market→players; the board buys silence wholesale, and exposing forgoes the pay). (In some sessions referred to as the Valet.) |
| **___ Nova** | Investigative journalist / "Truth-Seeking Detective" | The NPC who crashes the morning-after investigation and writes the post-game report. **Nova is the article's narrator** (journalist theme). |

### Secondary tier — Players
| Canonical | Older persona | Role / occupation | Motive re: Marcus | Pronoun |
|---|---|---|---|---|
| **Flip** | (Phil Kowalski — real name) | "Party architect" / construction worker; scouts illegal venues | $30K gambling debt; financially dependent on Marcus, who holds his secret identity as leverage | he |
| **Jess Kane** | **Jessicah** | Actor; Marcus's pregnant mistress | Carrying Marcus's child; he shut her out; wants closure / hopes he'll leave Sarah | she |
| **Mel Nilsson** | **Diana** Nilsson | Divorce lawyer ("the Party Lawyer"); Stanford Four | Had an affair w/ Marcus a decade ago; now represents Sarah in the divorce | she (**FLAG** — "Mel"/"Diana" + recast) |
| **Morgan Reed** | (same) | Tech lobbyist; arranged Marcus's congressional testimony | Marcus's erratic behavior threatens Morgan's reputation; set up Marcus's shell companies | he/they (**FLAG**) |
| **Riley Torres** | **Rachel** Torres | Environmental lawyer; Sarah's best friend/roommate | Hates Marcus for hurting Sarah; found his shell-company environmental crimes | she (**FLAG** — "Rachel" in older data) |
| **Sam Thorne** | **Derek** Thorn(e) | "Marcus's Plug" — drug supplier; clandestine chemist; Stanford Four; co-host of parties since 2009 | Makes the PsychoTrophin for Marcus; "if he goes down, I do too"; resentment + loyalty | he (**FLAG** — "Derek" canon-older) |
| **Taylor Chase** | (same) | Journalist at SVBJ; hype-man for VCs/CEOs | Leaked Ashe's expose to Marcus (got Ashe fired) for an exclusive; bro-camaraderie w/ Marcus | he/they |
| **Zia Bishara** | **Leila** | Crypto CEO; created "The Oracle Ledger" blockchain algorithm | Marcus "borrowed" then stole the Oracle Ledger; wants it back | they (**FLAG** — "Leila" older, recast) |

### Tertiary tier — Players
| Canonical | Older persona | Role / occupation | Motive re: Marcus | Pronoun |
|---|---|---|---|---|
| **Cass Zhang** | **Tori** Zhang | VR developer; CEO Immersive Futures; built the "Synesthesia Engine" | Marcus commissioned then secretly stole/ran the Synesthesia Engine without paying | they (**FLAG** — "Tori" older) |
| **Ezra Sullivan** | **Howie** Sullivan | "Sage of Connection"; '60s-era Valley engineer; ran the 2020 online incubator | Mentor figure; only nice things to say; advocates an "Emergent Third Path" | they (**FLAG** — "Howie" older) |
| **Jamie 'Volt' Woods** | (same) | Freelance bartender; documents the party for "insurance" | The invisible-witness; sells/withholds gossip; knows Flip's real identity | they (**FLAG** — frequently recast) |
| **Kai Andersen** | (same) | Creative technologist; built Marcus's party installations | Hero-worships Marcus; brought Ashe as plus-one; realizes Marcus made him run stolen code | they/he (**FLAG**) |
| **Nat Francisco** | **Sofia** Francisco | Documentary filmmaker; Stanford Four; back from Hollywood | Making "The Algorithm," an expose film; needs Marcus's investment; idealism vs. his corruption | they/she (**FLAG** — "Sofia" older) |
| **Quinn Sterling** | **Oliver** Sterling | Pharmacologist; CTO of OcuLife (chemogenetics) | Marcus discovered Quinn's buried PsychoTrophin research and blackmails them to keep making it | he/they (**FLAG** — "Oliver" older, commonly recast) |
| **Skyler Iyer** | (same) | Robotics CEO (CyberLife); building an AI companion robot | Cutthroat; dares Marcus to boot the prototype with stolen memories when the deadline slips | they (**FLAG** — frequently recast) |

### The two blank/deprecated character rows
- Two Characters-DB rows have **no name and no Type/Tier** — only loglines "**Maverick Dreamweaver**" and "**Futuristic Dreamer**." These are vestigial/duplicate records (deprecated character-design stubs). Note also the duplicate **"E - Diana Character Sheet"** document still owned by Mel — a leftover from the Diana→Mel rename.

---

## 2. MEMORY-TOKEN CORPUS, ORGANIZED BY OWNER

Every player owns four tokens (ID 001–004). Format below: `ID (SF_ValueRating, SF_MemoryType) — timestamp — one-line summary`. SF_Group is blank on essentially every token (only NAT001 carries "Marcus Mention (x1)"). Full second-person texts are in `audit/_tokens.txt`. Threads in **bold**.

**Value-rating distribution (1–5):** 1×13, 2×23, 3×14, 4×14, 5×17. **MemoryType distribution:** Mention ×62, Party ×15, Personal ×1, blank ×3. ("Mention" is by far the dominant memory type.)

### Alex Reeves — thread: **Funding & Espionage / Advanced Technology**
- ALE001 (3, Mention) 9:18PM — Rage-texts Vic that Marcus stole his IP; cease & desist or court. Vic agrees to meet at 10.
- ALE002 (4, Mention) 10:10PM — Tells Remi the BizAI algorithm never worked; Alex rebuilt it overnight for YC demo day; Marcus took credit.
- ALE003 (3, Party) 11:32PM — Marcus brags about the BizAI sale again; Alex punches him in the jaw. Sarah pulls him off.
- ALE004 (5, Mention) 1:08AM — Shows Vic the specs: NeurAI's "AI" needs manual fixes for 90% of inputs; the $30M investment bought a sham.

### Ashe Motoko — **Underground Parties / Funding & Espionage / Advanced Technology**
- ASH001 (2, Mention) 8:52PM — Overhears Marcus tell Kai "I hired you to decorate, not think."
- ASH002 (3, Mention) 9:59PM — Confronts Taylor for tipping Marcus off, getting the BizAI expose buried and Ashe fired.
- ASH003 (2, Mention) 11:10PM — Zia gives Ashe a scoop: Marcus showed up "blitzed" begging to install Zia's algorithm into NeurAI for a CyberLife demo.
- ASH004 (1, Mention) 12:42AM — Lands a rare on-the-record interview with Ezra (Zia talked Ashe up to the room).

### Cass Zhang — **Advanced Technology**
- CAS001 (2, Mention) 8:57PM — Tells Quinn that Marcus commissioned the Synesthesia Engine for $50K; waiting on the signed contract.
- CAS002 (1, blank) 10:27PM — Ezra helps Cass prep the pitch; needs 60 seconds with Skyler or Vic.
- CAS003 (1, blank) 11:19PM — Pitches Skyler; blank stare; "Fuck."
- CAS004 (5, Mention) 12:38AM — Code comparison proves Marcus secretly ran the stolen Synesthesia Engine on guests via Kai's installation.

### Ezra Sullivan — **Advanced Technology (+ Funding & Espionage on EZR004)**
- EZR001 (3, Mention) 9:18PM — Zia asks for advice; worried Marcus uses the Oracle Ledger without permission/credit.
- EZR002 (2, Mention) 10:27PM — Cass had to sign an NDA about the Synesthesia Engine; strikes Ezra as suspiciously secretive.
- EZR003 (2, Mention) 12:02AM — Quinn asks for advice re: a colleague ignoring safety — the colleague is Marcus.
- EZR004 (2, Mention) 12:42AM — Grants Ashe a rare interview; concedes Marcus has been "lost to the machine that is capitalism."

### Flip — **Underground Parties / Marriage Troubles / Political Corruption**
- FLI001 (2, Party) 8:07PM — Asks Marcus for a loan for his bookie (cash-in-couch-cushion code) in exchange for an undefined favor. Again.
- FLI002 (1, Mention) 9:42PM — Rebuffed by Jess; seeks out Sam for drugs to mask anxiety. (Reveals real name: Phil Kowalski.)
- FLI003 (4, Party) 11:29PM — Witnesses Marcus hand a fat wad of cash to Morgan ("that DC type") near the bar.
- FLI004 (2, Mention) 1:45AM — Takes more drugs from Sam; flirts with Riley; decides to ignore everything he's seen.

### Jamie 'Volt' Woods — **Underground Parties / Memory Drug / Funding & Espionage**
- JAM001 (4, Party) 8:07PM — Witnesses Marcus hand a cash-stuffed envelope to a construction worker (Flip).
- JAM002 (3, Party) 10:01PM — Overhears Marcus + a lab-coated stranger: "Ingesting extracts—untested. Dangerous." Marcus pops the pills anyway.
- JAM003 (3, Mention) 11:39PM — Overhears the post-fight VC (Vic) tell Alex "He's out. You're in. It's done." Hears the name Sarah.
- JAM004 (5, Party) 12:32AM — Overhears Skyler tell Marcus to program the prototype with memory recordings since the AI's still buggy.

### Jess Kane — **Marriage Troubles / Memory Drug**
- JES001 (4, Party) 8:17PM — Marcus walks right past her; she breaks down.
- JES002 (3, Mention) 9:42PM — Overhears Sam tell Nat that Marcus is self-experimenting with Psychotrophin-3A. She knows it's true.
- JES003 (5, Mention) 11:04PM — Tells Nat that Marcus extracted her memory: he had her "play a butler," drugged her, stored her memory on a token.
- JES004 (4, Mention) 1:36AM — Bathroom confrontation with Sarah; "You can have him. But that baby deserves better." "We're both his victims."

### Kai Andersen — **Underground Parties / Advanced Technology** (KAI001 is a **Memory Token Video**)
- KAI001 (1, Mention) 8:43PM — Folding puzzle; hustling to finish a last-minute Marcus request.
- KAI002 (2, Mention) 9:32PM — Searches for Ashe; stung by Marcus dismissing him as "just a vendor."
- KAI003 (2, Mention) 11:19PM — Overhears Cass pitch the Synesthesia Engine — it sounds like the code Marcus made him embed.
- KAI004 (4, Mention) 12:38AM — He and Cass confirm Marcus stole the Synesthesia Engine and means to run it on guests tonight.

### Marcus Blackwood — **Memory Drug** (the only token he owns)
- MAR004 (5, Party) 1:50AM — The extraction worked; he orders drugged guests to lock their own memory tokens behind combinations. Chaos: nobody remembers the combos. ("Act 0.")

### Mel Nilsson — **Underground Parties / Marriage Troubles / Advanced Technology**
- MEL001 (1, Mention) 8:28PM — Reminisces with Nat about talking Stanford police out of arrests in 2007 — the day she became "the Party Lawyer."
- MEL002 (3, Mention) 10:10PM — Sarah's shared account is nearly empty; Marcus prepared for divorce by hiding a nest egg.
- MEL003 (5, Mention) 11:09PM — Riley hands Mel the whole case (shell companies, insider trading, paternity); Mel will use it to protect Sarah.
- MEL004 (3, Mention) 12:50AM — Stanford Four meeting; learns Marcus built his companies on stolen code; considers blackmail to recover Sarah's money.

### Morgan Reed — **Funding & Espionage**
- MOR001 (2, Mention) 8:23PM — Meets Vic to discuss "the Marcus problem" — drugs, dodgy dealings, shared reputational risk.
- MOR002 (4, Mention) 10:12PM — Riley confronts Morgan with proof of the shell companies; Morgan tells Riley how to trace the money to keep his name out.
- MOR003 (5, Party) 11:22PM — On the hammock, blackmails Marcus ("go public or I give Senator Walsh the evidence"); Marcus bribes him instead.
- MOR004 (2, Mention) 12:40AM — Betrays Marcus to Taylor on the record (incl. Marcus's "get me a world leader" demand).

### Nat Francisco — **(NAT001 unthreaded) / Memory Drug**
- NAT001 (2, Personal) 8:28PM — The Stanford Four's glow rave on film; "We're going to change the world, all four of us." That Marcus doesn't exist anymore.
- NAT002 (3, Mention) 9:42PM — Sam confesses he makes Marcus's memory drug in a secret warehouse lab; Nat tells him to go talk to Marcus.
- NAT003 (5, Mention) 11:04PM — Jess reveals Marcus uses Psychotrophin-3A + environmental controls to extract human memories.
- NAT004 (5, Mention) 12:50AM — With Sam: Marcus lied about NeurAI's AI (it doesn't work) and is stealing memories instead of fixing it.

### Quinn Sterling — **Advanced Technology** (+ Memory Drug on the threatening email)
- QUI001 (2, Mention) 8:57PM — Killed his company with Cass and Zia to bury his dangerous PT-3A research; Marcus found out anyway.
- QUI002 (5, Party) 9:59PM — Marcus blackmails Quinn over the buried PT-3A safety assessments; demands another batch tonight (meet at the bar at 10).
- QUI003 (2, Mention) 12:02AM — Confesses everything to Ezra; terrified of exposure either way.
- QUI004 (1, Mention) 12:52AM — Reunion with Cass and Zia; admits why he burned the company; Zia forgives him.

### Remi Whitman — **Funding & Espionage / Advanced Technology** (REM001 is a **Memory Token Video**)
- REM001 (5, Party) 9:02PM — Watches Marcus enter a secret room adjoining the party space.
- REM002 (1, Mention) 9:37PM — Follows Marcus into his secret lab/living space; grabs a thumb drive; goes to find Alex.
- REM003 (5, Mention) 11:29PM — Texts Vic "Have NeurAI IP theft proof. Oracle Ledger code." Vic nods across the room.
- REM004 (3, Mention) 1:08AM — Shows Vic and Alex the code comparison (Zia's 2023 Oracle Ledger vs NeurAI 2027) — identical; Marcus is "a sloppy thief."

### Riley Torres — **Marriage Troubles / Political Corruption / Underground Parties**
- RIL001 (2, Mention) 8:46PM — Writes Sarah a "reasons to leave Marcus" card; leaves off the paternity test for now.
- RIL002 (4, Mention) 10:12PM — Confronts Morgan about the shell companies/insider trading; trades silence for the money trail to help Sarah.
- RIL003 (4, Mention) 11:43PM — Drunk voicemail to Sarah mapping the shell vehicles; "the money is yours… also I'm going to find Flip."
- RIL004 (2, Mention) 1:45AM — Flirts with Flip while he reminisces about breaking into the Matrix Rave venue with Marcus.

### Sam Thorne — **Funding & Espionage**
- SAM001 (2, Mention) 8:25PM — Panic-texts Marcus after overhearing Vic and Morgan talk about jail; threatens to leave with "my special memory drugs."
- SAM002 (4, Party) 10:44PM — Gets Marcus high; Marcus blurts that the BizAI algorithm was Alex's rewrite that he took credit for.
- SAM003 (1, Mention) 11:17PM — Hands Remi his laptop (full of client secrets) and texts Zia to be Remi's hacker.
- SAM004 (2, Mention) 12:50AM — Stanford Four meeting; reveals he was the one who mailed Sarah the paternity test.

### Sarah Blackwood — **Marriage Troubles / Funding & Espionage**
- SAR001 (4, Mention) 8:59PM — Found a paternity test in the mail; told Marcus to go; he just said "okay" and left.
- SAR002 (4, Mention) 10:10PM — Discovers Marcus already cleared out their shared account; he financially planned to leave her destitute.
- SAR003 (2, Mention) 11:35PM — Breaks up the Alex/Marcus fight; "Why are you still with him?" "I know he is… but he's my asshole."
- SAR004 (5, Mention) 1:36AM — Finds Jess crying in the bathroom; realizes she's the pregnant mistress; offers solidarity.

### Skyler Iyer — **Advanced Technology**
- SKY001 (1, Mention) 9:19PM — Interview transcript: CyberLife's "agentic cyber-escort" needs Marcus's memory-capture tech for agent training.
- SKY002 (2, Party) 10:22PM — Marcus probes Skyler about CyberLife's neural-adaptation protocols; too specific — has he accessed their files?
- SKY003 (1, Mention) 11:19PM — Drifts during Cass's pitch; notices Marcus and Morgan in a tense standoff.
- SKY004 (5, Party) **12:32AM** (text reads "12:32PM" — source typo) — Dares Marcus to boot the prototype with the stolen memory recordings: "What's the worst that could happen?"

### Taylor Chase — **Advanced Technology / Funding & Espionage / Political Corruption**
- TAY001 (1, Mention) 9:19PM — Interviews Skyler about the world's first functional-intelligence humanoid robot (needs Marcus's tech).
- TAY002 (3, Mention) 9:51PM — Drunkenly brags to Zia about getting Ashe fired to win the NeurAI exclusive.
- TAY003 (1, blank) 12:22AM — Emails Morgan offering to place a story of his choosing: "attention = power."
- TAY004 (5, Mention) 12:40AM — Records Morgan's exclusive: shell companies, insider trading, dangerous experiments, lying under oath.

### Vic Kingsley — **Funding & Espionage / Advanced Technology**
- VIC001 (3, Mention) 8:23PM — Meets Morgan; won't risk jail for Marcus's criminal exposure; "something has to be done."
- VIC002 (4, Mention) 9:55PM — Plans to replace Marcus with Alex at NeurAI to dodge conspiracy charges.
- VIC003 (3, Party) 11:35PM — Fires Marcus while he's slumped bleeding on the sidewalk after the fight, scarf to his nose.
- VIC004 (5, Mention) 1:08AM — Remi+Alex show her NeurAI's code is faked/worthless; the corporate takeover was pointless.

### Zia Bishara — **Advanced Technology / Funding & Espionage**
- ZIA001 (2, Mention) 9:18PM — Marcus showed up unannounced/"zonked," begged to borrow the Oracle Ledger for a CyberLife demo, then ghosted.
- ZIA002 (2, Mention) 9:59PM — Watches Ashe annihilate Taylor over the firing/exclusive.
- ZIA003 (4, Mention) 11:10PM — Starts telling Ashe that Marcus stole the algorithm; interrupted by their dealer asking for a hack.
- ZIA004 (5, Mention) 12:31AM — Compiles proof: Marcus's "proprietary" NeurAI indexing is Zia's stolen Oracle Ledger code (he didn't even change the comments).

---

## 3. PAPER EVIDENCE / DOCUMENTS / CHARACTER SHEETS

64 Documents exist. They split into a few clear families. (One, "Guest Check (unlocked)," has an empty content field — a data-quality note.)

### Character sheets (21, one per player + Marcus/Nova absent; plus a duplicate "E - Diana" stub)
Uniform structure, quotable verbatim:
```
< Archetype >          (e.g. "< The Party Lawyer >", "< Wronged Partner >")
DOB | KNOWN ASSOCIATE: ...
▌[FLAGGED] SUSPECTED MOTIVE   ← a pointed line that frames each character as a murder suspect
RECOVERED MEMORY FRAGMENTS    ← 3–5 bracketed first-person bullets
CORE IDENTITY                 ← 2–4 second-person paragraphs of backstory + motive
KEY RELATIONSHIPS             ← numbered list mapping them to other characters
WHERE TO START                ← in-game puzzle hooks
```
The SUSPECTED-MOTIVE lines are the spine of the "who killed Marcus" deduction — e.g. Sarah's "fantasize about what things would be like if you could just erase Marcus"; Riley's "you could just kill him"; Morgan's "desperate enough to consider eliminating the threat"; Quinn's "he's left you with zero ethical options"; Zia's "murderous rage" (per Timeline). DOBs/relationships on the sheets are authoritative character bios.

### Key plot-bearing documents (captured in full)
- **Quinn — Marcus threatening email (locked):** From `marcus.blackwood@neurai.co`, Feb 17 2027. "I need you to bring me another batch of Psychotrophin-3A… you can't afford to say no, can you? I'm having a party on the 21st." — the blackmail in Marcus's own words.
- **Flip's IOU (locked):** Dated 11/10/20. "Phil Kowalski owes Marcus Blackwood one undefined favor to be cashed in… of his choosing." Signed Phil Kowalski / Marcus Blackwood.
- **Alex's Cease & Desist Letter (unlocked):** Patchwork Law Firm, Jan 28 2027. Asserts NeurAI's code/idea is Alex's IP; demands Marcus's removal as CEO and Alex installed as CTO; deadline Feb 28 2027. (Doubles as a puzzle — UV/"illuminate the truth" mechanic.)
- **Paternity test for Sarah (locked):** DDC DNA Diagnostics Center. Mother **Jessicah Kane**, alleged father **Marcus Blackwood**, collected 5/23/2023, **99.85% probability of paternity** — "The alleged father is the biological father of the fetus."
- **Sam's Diary Entries (locked):** 2/17–2/20/27. Tracks Marcus's drug decline, Sam reproducing "a mysterious formula" off the books, and Sam finding the paternity test under the lab door — establishing that **Sam anonymously mailed it to Sarah**.
- **Riley's Leverage (locked):** "INVESTMENT SUMMARY — SELECTED VEHICLES (ENERGY)." Three shell companies (Delaware/Cayman/Nevada, 2024) funneling capital into **Morgan Corp** environmental projects with timing tied to EPA/zoning approvals; all trace back to **Blackwood Capital principals**. Handwritten note ties Marcus + Morgan together.
- **Remi's threatening email to Marcus:** Feb 6 2025. "Victoria's committed $20 Million for your next round… you with your mediocre idea and code can secure $20 million??"
- **Morgan's Lobbying letter (unlocked):** To "Senator James P. Burns III" re: the AI Advancement and Regulation Act — overloaded with heat/fire idioms (a steganographic puzzle); a heat-revealed note exposes the briefcase code "000 000."
- **Ezra's Police Report (locked):** SVPD incident #24-104-0287, an Oct 2024 office burglary at the EFF — stolen files relate to Ezra's 2020 incubator program (i.e., how Marcus learned others' secrets).
- **Bartender's Napkin Notes (locked):** Jamie's running observations exposing Flip = "Phil from Kowalski Construction" and Marcus calling him his "blue collar treasure hunter."
- **Nat–Ashe emails w/ Expose Excerpt (locked):** "Blood In The Code: Inside BizAI's Cult of Velocity" by Ashe — the buried investigative piece Marcus killed.
- **Vic's Newspaper (unlocked):** SVBJ Jan 1 2027, Taylor's puff piece announcing Kingsley-Fund's seed rounds in NeurAI + AIBioComp (Marcus sold BizAI for "$300 Million"); also carries the "Useful Names Game" puzzle.
- Plus: Riley's Loyalty Card to Sarah, Jess's apology Card from Marcus, Kai's Install Brief (Marcus ordering the stolen-code light sequence run "exactly as written"), Taylor↔Marcus story-burial email, Morgan↔Taylor "currying favor" email, the various texts/emails (Riley↔Sarah, Sam↔Mel, Alex↔Remi, Cass↔Quinn, Zia↔Quinn, Skyler↔Taylor, Mel↔Nat, Mel's divorce emails), Sam's Rave Posters, binary translator, indexing/puzzle notes.

### Props / Containers / Set Dressing (101 elements)
These are physical objects (purses, jackets, safes, backpacks, booksafes, pillows-with-letters, poster boards) that act as **containers** gating tokens/documents behind puzzles, plus atmospheric set dressing (bar menu, rave posters). Owners on these props are the same characters. They carry little narrative text but define the escape-room layer.

---

## 4. THE NARRATIVE THREADS

The Elements DB's "Narrative Threads" property defines **7 base threads** (plus 14 combo/composite tags like `Underground Parties|Memory Drug`). The team's design target was "no more than 5 narrative threads," and the five load-bearing story threads are:

1. **Funding & Espionage** — the NeurAI/BizAI fraud + corporate-takeover spine. Alex, Vic, Remi, Morgan, Sam, Taylor, Ashe. (Marcus stole Alex's code; Vic plans to replace him with Alex; Remi exposes the fraud.)
2. **Advanced Technology** — the stolen-IP web feeding the memory-extraction tech. Zia (Oracle Ledger), Cass (Synesthesia Engine), Quinn (Psychotrophin), Skyler (CyberLife prototype), Ezra, Kai. Converges on Marcus running stolen code on guests.
3. **Memory Drug** — PsychoTrophin-3A/3B and the memory-extraction protocol. Sam (chemist), Quinn (researcher/blackmail victim), Jess (extracted subject), Nat, Jamie, Marcus (MAR004).
4. **Marriage Troubles** — the divorce/affair/paternity. Sarah, Jess, Mel, Riley, Flip (FLI002). (Paternity test → drained accounts → bathroom reconciliation.)
5. **Political Corruption** — shell companies, insider trading, environmental crime, bribery, lobbying. Morgan, Riley (Riley's Leverage), Flip (FLI003 bribery), Taylor.

Two further threads exist in the data:
6. **Underground Parties** — the party-scene / class-anxiety layer (Flip, Jamie, Kai, Sam, Mel history). Often the connective tissue rather than a murder driver.
7. **Background/Atmosphere** — set dressing and minor color (used on several documents and props).

---

## 5. RELATIONSHIP WEB (major connections)

- **Marriage / affair / paternity:** Marcus ⟷ Sarah (married 2014, 15 yrs, separating). Marcus ⟷ Jess (affair from 2024; she's pregnant, 99.85% his). Marcus ⟷ Mel (a decade-ago fling). Sarah ⟷ Riley (best friends/roommates). Sarah ⟷ Mel (now her divorce lawyer). Sam = the one who anonymously mailed Sarah the paternity test.
- **The Stanford Four (2006):** Marcus, **Sam** (Derek), **Mel** (Diana), **Nat** (Sofia) — met at Stanford; Sam+Marcus began the underground parties in 2008–2009; Mel helped book the first venue.
- **The 2010 Facebook internship (run by Vic):** Marcus, **Alex**, **Sarah** met here; bond/feud origin. Alex+Sarah bonded over "Marcus is a douchebag."
- **BizAI → NeurAI theft chain:** Alex co-founded **BizAI** with Marcus (2018/2022 YC); Alex engineered ~90% of the code, got pushed out in the sale ($300M). Marcus then founded **NeurAI** on (allegedly) Alex's idea + stolen code. → C&D letter.
- **The 2020 online incubator (run by Ezra/Howie):** Marcus, **Cass** (Tori), **Quinn** (Oliver), **Skyler**, **Zia** (Leila) — Ezra's five mentees. Quinn+Cass+Zia later founded a startup together that Quinn killed overnight to bury his PT-3A research (→ Quinn/Zia "bad blood").
- **Stolen-IP victims:** Zia (Oracle Ledger blockchain → "borrowed" → stolen, renamed NeurAI's indexing). Cass (Synesthesia Engine → commissioned, NDA'd, secretly run on guests). Quinn (PsychoTrophin research → blackmail leverage). Alex (BizAI/NeurAI core code).
- **VC funding rivalry:** Vic funds both **NeurAI (Marcus)** and **AIBioComp (Remi/James)** — a deliberate competitive bet; Marcus gets 80%+; Remi resents it; Alex is Remi's ally; both court Vic.
- **The drug supply:** Sam ("Marcus's Plug") makes PsychoTrophin-3A for Marcus in a secret warehouse lab; Quinn is the original researcher Marcus blackmails for more.
- **The lobbying/corruption ring:** Morgan set up Marcus's shell companies (Blackwood Capital → Morgan Corp environmental projects) and arranged his congressional testimony; Riley investigates it for Sarah; Marcus bribes Morgan; Morgan flips to Taylor.
- **The journalism axis:** Ashe wrote the BizAI expose → Taylor leaked it to Marcus → editors buried it → Ashe fired (Jan 2025). Taylor is Marcus's friendly hype-man; Nova is the outside journalist who later investigates.
- **The robot endgame:** Skyler (CyberLife) needs Marcus's memory-capture tech for a humanoid prototype; when Marcus's AI fails, Skyler dares him to boot the prototype with the freshly **extracted human memories** — the trigger for the 1:50 AM extraction.
- **Service-worker witnesses:** Jamie (bartender, documents everything, knows Flip's secret). Flip (knows Marcus's cash/bribe habits). Kai (built the installation that ran the stolen code).

---

## 6. DATA-QUALITY NOTES (neutral ground-truth observations)

- **ID scheme:** 3-letter character code + 3-digit number, with the SF_RFID echoing it lowercase (e.g. `MAR004` / `[mar004]`). The live token set is collision-free (one code per character, 001–004).
- **Historic code collisions / renames (now resolved in the live DB):** the consolidated codes replaced an older, collision-prone set. Old→new examples visible in stray pages and the 46-item checklist: `ALR→ALE`, `JAV`/`JAW→JAM`, `JEK→JES`, `SAB→SAR`, `SKI→SKY`, `VIK→VIC`, `MAB→MAR`, `DIN→MEL`(Diana), `SOF→NAT`(Sofia), `LEB→ZIA`(Leila), `RAT→RIL`(Rachel), `TOZ→CAS`(Tori), `HOS/OLS→EZR/QUI`. The brief's "JAW vs JAV, SAR vs SAB" collisions are real in the project's history but not in the current Elements database.
- **Deprecated `ZZZ` tokens:** `ZZZ001`, `ZZZ004`, etc. exist as standalone retired pages outside the live Elements DB (not returned in the DB dump).
- **Character ↔ persona drift:** the canonical Characters DB and current character sheets use the *new* names (Mel, Nat, Zia, Cass, Quinn, Riley, Sam, Remi, Vic); the **Timeline DB still narrates with the OLD first names** (Diana, Sofia, Leila, Tori, Oliver, Rachel, Derek, James, Victoria) and a few owned-element labels do too (e.g. Mel owns "E - Diana Character Sheet"; Nat owns "Sofia's brooch/sunglasses/gold purse"; Zia owns "Leila's teal cape cod jacket"; Remi owns "James' black jacket"). This is the single biggest naming-consistency hazard in the universe.
- **"Mention" memory type dominates** (62/81). SF_MemoryType values seen: Mention, Party, Personal, and blank (3 tokens: CAS002, CAS003, TAY003). SF_Group is empty on all but NAT001.
- **Gender is intentionally unspecified** in nearly all token/sheet prose ("they/them"), so the canonical pronoun for most players is genuinely indeterminate and is set per-session by the director's roster. Sarah (she) and a few others are consistently gendered; the rest float.
- **Embedded-timestamp typo:** SKY004's body reads "12:32PM" though its summary and narrative position are 12:32 **AM** (pairs with JAM004). Trust the AM.
- **Two blank Character rows** (loglines only: "Maverick Dreamweaver," "Futuristic Dreamer") and **one empty Document** ("Guest Check") carry no usable content.
- **Status:** every live memory token is "Casey Approved." Acts: tokens are tagged Act 0/1/2 ("First Available"); MAR004 is the lone Act 0.
- **Marcus and Nova own almost nothing** in the Elements DB (Marcus → only MAR004; Nova → nothing). They are narrative roles, not token owners.
