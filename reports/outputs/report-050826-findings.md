# Findings — report-050826.html (refinement diagnostic)

Generated 2026-05-10 via refining-aln-reports skill methodology. Reference sheet built from `reports/data/050826/inputs/`, `fetched/`, and visually-analyzed photos BEFORE reading the article. Cross-checked against 042526 source-to-article comparison to calibrate failure-mode patterns.

## Reference sheet summary

- **Roster (12)** with director-supplied pronouns: Morgan he, Sarah she, Taylor she, Sam he, Jamie she, Vic he, Jess she, Mel she, Ashe she, Riley she, Alex he, Remi he. **Note: Taylor and Jamie use opposite pronouns from 042526's same-character names** — pipeline-default risk on these two was the highest. Pipeline got both right this time.
- **Non-roster (canonical defaults, flagged):** Quinn they/them, Ezra they/them (per Police Report's "Mx." honorific), Skyler he/him, Cass she/her, Kai she/her, Flip he/him, Nat he/him, Zia she/her.
- **Accusation:** Vic 9, Alex 2, Sarah 1, Jess 1. Director's analytical hint: *"Vic may have been a choice of convenience that kept others' hands clean, and perhaps even for some, an opportunity to eliminate a power player from the board along with Marcus."*
- **Token states:** 48 exposed / 7 buried (5 shells totalling $2.375M) / 10 untouched.
- **Paper evidence:** 41 unlocked + 10 cut. Notable: Sarah's Card and Jess's Card are word-for-word identical (only recipient initial and back-side hint differ). Mel's 2:08 AM divorce-retention email confirms attorney relationship pre-rave. Ezra's Police Report has NO named suspect for the EFF burglary. Sam's Diary confirms he mailed the paternity test to Sarah.
- **Photos verified visually:** Director's IDs match what's in frame for all 11 photos.

## Diagnostic verdict: dominant axes

**Boundary + accuracy.** The article is structurally clean (thesis-coherent, pronouns correct, roster fully covered, closing bridge passes), but contains two factual errors that misread the source data, plus pronoun attribution on one non-roster character. Length and pacing are fine. Em-dashes pervasive (style fix).

## A. Factual / boundary errors

### A1. "Two names appear on the public evidence record" — unsupported by session data

**Location:** Line 1729 (THE PLAYERS, opening paragraph), and echoed at line 1585 (THE STORY): *"Taylor was one of only two investigators whose names appear on the public record. The other was Ashe. Two named voices in a room of forty-eight anonymous submissions."*

**Problem:** Per the session report's Detective Evidence Log, **46 of 48 tokens were exposed by "Anonymous"**. The two non-anonymous exposures are:
- mor001 → exposed by "**Morgan**" (a burial-team account, not the player Morgan signing with their name)
- nat004 → exposed by "**First Burial**" (system label)

Neither "Ashe" nor "Taylor" appears as a named exposer in the session data.

**What the director actually said:** *"While most of their individual token exposures were done anonymously, it was noted that Ashe and Taylor both made crucial contributions to the record."* The director's note describes Ashe and Taylor's *behavior at the investigation* (puzzle-solving, evidence-handling, discussions) — not that they signed token submissions with their real names.

**Fix:** Reframe to capture the director's actual meaning without inventing the named-exposure mechanism:

> Two of the twelve made themselves visible in ways the director flagged as crucial. Ashe and Taylor are both journalists. Most of their individual token submissions were anonymous, like everyone else's. What they did instead was harder to render anonymous — Ashe walked into Taylor's 9:51PM drunk brag and confronted him on the record, then sat across from Ezra Sullivan at 12:42AM with a tape recorder for an interview Ezra had not granted to anyone in forty years. Taylor turned on Vic during the deliberation and put Morgan's reservations on his recorder at 12:40AM. The room ran on anonymity. The journalists ran on byline.

**Severity:** High. This is a structural claim that anchors the PLAYERS section opening.

### A2. Kai called "a man" — unsourced gender attribution on non-roster character

**Location:** Line 1751 (WHAT'S MISSING): *"the name they chose belonged to a man who was in the exposed evidence but not in the room."*

**Problem:** Kai is non-roster, no session-pronoun specified. Source data does not gender Kai. Per the skill, ungendered non-roster characters require director confirmation; defaults should be neutral or canonical. Calling Kai "a man" attributes gender without source.

**Fix:** Drop the gender. Replace with role: *"the name they chose belonged to the installer who was in the exposed evidence but not in the room."*

**Severity:** Medium (single instance; quietly damaging if Kai's player reads the article).

### A3. Photo 5 caption: "phone down, eyes elsewhere" inaccurate

**Location:** Line 1538.

**Problem:** Visual analysis of photo 5 shows Taylor with phone in hand, looking at the screen. The caption asserts the phone is "down" and his eyes are "elsewhere." Wrong on both counts.

**Fix:** *"The photo my source forwarded: Vic with his hand pressed to his forehead under the wall that reads MARCUS ALWAYS WINS. Taylor stands beside him, phone in hand."*

**Severity:** Low (caption-only).

### A4. Photo 8 caption: "my source noted" implies director quote not in source

**Location:** Line 1582.

**Problem:** *"The kind of moment, my source noted, that decides votes."* The director's notes do not contain this observation. The phrase "my source noted" implies attribution to the director that doesn't exist.

**Fix:** Either drop the attribution or rephrase as Nova's own reading. Example: *"The kind of moment that decides votes."*

**Severity:** Low (caption-only) but it's a category error — putting words in a source.

## B. Director-emphasis underdevelopment

### B1. The "opportunity to eliminate a power player from the board" thesis is only half-developed

**The director's read:** Vic was *"a choice of convenience that kept others' hands clean, and perhaps even for some, an opportunity to eliminate a power player from the board along with Marcus."*

**What the article does well:** Captures convenience ("$2.375M for the silences nobody voted on"), captures the irony ("the accusation found a man who had already lost the thing he committed the crime to keep").

**What it leaves on the table:** *Who benefits structurally from Vic being out?* Per Vic's own exposed memory (vic002, 9:55PM), Vic's plan was to install **Alex** as Marcus's replacement at NeurAI. That plan was operational by the sidewalk handoff at 11:39PM ("He's out. You're in. Trust me. It's done.") With Marcus dead AND Vic now accused and fled to a non-extradition jurisdiction, NeurAI's leadership chair — which Vic was already trying to hand to Alex — is wide open. Alex is in the room. Alex's January cease-and-desist (paper evidence) demanded the board install him as CTO and a neutral interim CEO.

The article doesn't connect: Vic's removal → Vic's planned succession → Alex as the structural beneficiary. This is the strongest available development of the director's thesis hint and the article walks past it.

**Suggested addition (THE STORY or CLOSING):** A paragraph naming who benefits structurally. Not an accusation against Alex — but observation that the vote landed on the man whose removal cleared the runway Vic himself had been preparing for someone *in* the room.

**Severity:** Medium. Quality multiplier; the article is good without this but would be stronger with it.

## C. Style: em-dashes pervasive

The article uses em-dashes throughout — evidence card labels (e.g., "Bartender's Sidewalk Earful — 11:39PM"), financial tracker rows ("Angela — largest account, two memories buried"), and the article's `&mdash;` HTML entities in the closing paragraphs. Per the no-em-dash rule (memory dated 2026-04-27), default to periods, commas, colons, parens, or restructure.

**Severity:** Style. Across the article: ~30 instances. Replacement is mechanical.

## D. What the article got right (worth preserving)

This article is the cleanest pipeline output across the five reviewed prior reports for these axes:

- **Pronouns:** All 12 roster pronouns correct on first pass. (Notable improvement vs. 042526's Jamie/Kai errors.)
- **Roster coverage:** All 12 named with sourced storylines.
- **Director observations:** All 6 director-noted patterns captured (Sam-Jess collaboration, Taylor-Vic turn, exposed-much-more-than-buried, Ashe-Taylor crucial contributions, Caymans flight, pre-police commotion).
- **Boundary discipline on the EFF burglary:** Explicitly notes "an unidentified intruder" and "The police report has no named suspect" before doing the inferential work. This was a known prior failure mode handled correctly here.
- **Three-layer evidence model:** Buried account names treated as recipient names, not initiator identification. "None of the names on those accounts match anyone in the room" — correct framing.
- **Closing bridge test:** Passes. Systemic claim ("the data extraction business... reaches for something more literal") anchored to specific session moments (Skyler's demand, Quinn's blackmail, Sam's manufacture). Genericness test: would not paste into any other session unchanged.
- **Identical apology cards motif:** Captured ("the document trail of a serial template").
- **Strongest analytical move in the article:** The 11:22PM hammock + 11:29PM Flip-witness corroboration as "the most evidentially solid moment in the file" → "the strongest corroborated evidence in the file was for a crime the room did not address." This is a real Nova-grade observation and should be preserved.

## Verdict

**Light revision needed.** The article is structurally sound and ready to send after correcting the two factual issues (A1, A2) and the two caption issues (A3, A4). The director-emphasis underdevelopment (B1) is a quality multiplier, not a correctness blocker. Em-dashes (C) are a mechanical style pass. No structural revision required.

| Severity | Findings |
|---|---|
| High | A1 (Ashe/Taylor named-on-record claim) |
| Medium | A2 (Kai gender attribution), B1 (director-thesis underdevelopment) |
| Low | A3, A4 (caption inaccuracies), C (em-dashes) |

Article path: `C:\Users\spide\documents\claudecode\aboutlastnight\reports\outputs\report-050826.html`
