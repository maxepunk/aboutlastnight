# Reference Sheet — Session 052326 (Marcus Blackwood's Death Investigation)

Built from `data/052326/inputs/` and `data/052326/fetched/`. This is the ground-truth document for fact-checking `outputs/report-052326.html`. Do not consult the article when answering against this sheet.

---

## Session Identity

- **Session ID:** 052326
- **Game date:** Saturday, May 23, 2026 (3h 15m duration; 11 teams)
- **Article date:** 2026-05-26
- **Accusation:** Quinn Sterling (charge: murder of Marcus Blackwood) — **NOT IN THE ROOM**
- **Theory of death:** drugs (drugs Quinn supplied, room said). Whiteboard explicitly notes "Someone switched M.'s drug" as a theory.

## Voice & Reportage Constraints (CRITICAL)

- **`reportingMode: "remote"`.** Cassandra was NOT present in person. She wrote from a remote position with Ashe doing on-the-ground reporting under shared byline.
- **Director-notes.json parsing error:** `rawProse` reads "Cassandra was now present in person during this investigation" — a parsing inversion of the user's "Cassandra was NOT present in person." The session-config correctly captures remote mode. Any first-person-witness language in the article ("I watched," "I overheard," "I saw") for investigation events is a fact-check failure.
- **Allowed remote-voice constructions:** "Ashe reported," "according to the investigation feed," "from what I've been told," "an anonymous tip reached me," "Ashe relayed," "the morning's investigation, as documented by Ashe."
- **Co-byline:** Ashe Motoko (Guest Reporter). The article's byline should acknowledge this.
- **Cass vs. Cassandra:** **Cass = "Tori Zhang"** (NPC, ownership of cas001-004). Cassandra Nova is the journalist. The whiteboard reference to "Cass" knowing about psychoxx-3A is to Tori Zhang. Do not conflate.

---

## Roster (12) with Pronouns

| Character | Pronouns | Role / Backstory |
|-----------|----------|------------------|
| Remi (Whitman) | he/him | Founder/CEO of AI BioComp (NeurAI competitor); Vic-funded; rivalry with Marcus |
| Sarah (Blackwood) | she/her | Marcus's wife; pursuing divorce |
| Ashe (Motoko) | he/him | Investigative journalist (fired from SVBJ over Marcus expose); GUEST REPORTER co-byline |
| **Quinn Sterling (NPC, accused, ABSENT)** | **he/him** (director-confirmed 2026-05-26) | Chemist who synthesized PT-3A; blackmailed by Marcus per qui002. Currently subject of active manhunt. |
| Sam (Thorne) | she/her | Stanford Four; Marcus's recreational-drug source; chemist who reformulated Quinn's PT-3A as PT-3B and the rest of the formulation tree. The PT baggies prop and "Posters 1 (Walls)" data labels reference "Derek" — the director has confirmed this is Sam. Article uses "Sam" throughout and does NOT surface "Derek" at all. The chemist reformulating Quinn's compound is Sam. |
| Jess (Kane) | she/her | Marcus's pregnant mistress (per paternity test); divorce confrontation with Sarah |
| Jamie ('Volt' Woods) | he/him | Bartender; observer/note-taker for hire (Skyler paid him to record); produced the "empty capsule" |
| Vic (Kingsley) | she/her | VC who funded NeurAI and AI BioComp; decided to replace Marcus with Alex |
| Alex (Reeves) | she/her | Wronged BizAI co-founder; sued Marcus over IP theft; punched Marcus at 11:32 PM |
| Mel (Nilsson) | she/her | Stanford Four; Sarah's divorce attorney |
| Morgan (Reed) | he/him | Crisis Manager/Tech lobbyist; helped Marcus with shell companies; blackmailed by Riley |
| Flip (real name Phil Kowalski) | he/him | Construction worker / "Party Architect"; owed Marcus money; gambling debts to bookie |
| Kai (Andersen) | he/him | Artist running Marcus's installation at the party; on a date with Ashe |

## NPCs in Memory Tokens (NOT in roster; cannot have on-camera scenes this morning)

- **Marcus Blackwood** — victim. Was the party host.
- **Quinn Sterling** — accused; not in the room; subject of active manhunt.
- **Riley Torres** — environmental lawyer; Sarah's best friend. **NOTE:** In paper evidence "Riley - Sarah Texts (unlocked)," Riley texts under the name "Rachel." Treat as same person (Riley = Rachel signature on her Loyalty Card; texts use Rachel as her display name). Article should pick one and stay consistent; recommend "Riley" since that's the canonical character name.
- **Ezra Sullivan** — Mentor / EFF program director. Granted Ashe a rare on-record interview (ezr004).
- **Zia Bishara** — NPC whose Oracle Ledger algorithm Marcus stole.
- **Nat Francisco** — Stanford Four / documentarian (per ash001 BizAI expose context).
- **Taylor Chase** — Journalist who killed Ashe's BizAI expose for Marcus.
- **Skyler Iyer** — CyberLife humanoid-robot prototype project; paid Jamie to record conversations.
- **Cass = Tori Zhang** — Synesthesia Engine creator whose code Marcus stole.
- **Blake** — investigation NPC running the burial market (his "tablet" was the burial mechanism).
- **"Derek" (NOT a separate person)** — Source-data labels on the PT baggies prop and Posters 1 (Walls) reference "Derek." Per director (2026-05-26), this is Sam. Article does NOT introduce "Derek" — the chemist who reformulated PT compounds is Sam, full stop.

---

## Exposure Map (23 exposed tokens — Nova can quote content)

These are the ONLY tokens whose content Nova may quote, paraphrase, or describe.

| Token | Owner | Time | What it shows |
|-------|-------|------|---------------|
| `mar004` | Marcus | 1:50 AM | Marcus drugs, manipulates, executes memory-capture protocol on guests. Token-locking system chaotic. |
| `ale003` | Alex | 11:32 PM | Alex punches Marcus over the BizAI sale brag. Sarah pulls her off. |
| `ash002` | Ashe | 9:59 PM | Ashe confronts Taylor about killing his expose; gets fired exposed as Taylor's favor to Marcus. |
| `ezr001` | Ezra | 9:18 PM | Zia asks Ezra for advice — Marcus using Oracle Ledger without permission. |
| `ezr002` | Ezra | 10:27 PM | Cass had to sign NDA about Synesthesia Engine for Marcus. Ezra suspicious. |
| `ezr003` | Ezra | 12:02 AM | Quinn asks Ezra for advice — Marcus won't listen to safety concerns. |
| `jes002` | Jess | 9:42 PM | Jess overhears Sam complain to Nat about Marcus experimenting on himself with PT-3A; Jess confirms it's true (she experienced it). |
| `mel002` | Mel | 10:10 PM | Mel learns Marcus secretly cleaned out the shared bank account before the divorce. Sarah broke, no job. |
| `mor004` | Morgan | 12:40 AM | Morgan spills "worst things" to Taylor: shell companies, insider trading, dangerous experiments, lying under oath. Marcus quote re: "world leader." |
| `nat001` | Nat | 8:28 PM | Stanford Four glow rave 2007: Nat films, Mel dances, Sam laughs, Marcus dreams. "Before money changed everything." |
| `nat003` | Nat | 11:04 PM | Jess tells Nat about PT-3A and Marcus's memory-extraction tech. |
| `qui002` | Quinn | 9:59 PM | Marcus blackmailing Quinn for PT-3A; Marcus interested in neural-plasticity effects. |
| `qui003` | Quinn | 12:02 AM | Quinn confesses guilt and anxiety to Ezra about supplying PT-3A. |
| `ril001` | Riley | 8:46 PM | Riley writing Sarah a Mojito-GPT-fueled card: 1) therapy "inefficient"; 2) shelved promotion; 3) Christmas tears. Left off list: paternity test. |
| `ril003` | Riley | 11:43 PM | Riley voicemail to Sarah: Morgan helped Marcus set up shell companies, insider trading. Paper trail clear. |
| `ril004` | Riley | 1:45 AM | Flip brags about discovering illegal venues for Marcus's parties via B&E skills. Riley wonders when kissing starts. |
| `sam002` | Sam | 10:44 PM | Sam gives Marcus the "usual party blend"; Marcus blurts that BizAI algorithm was Alex's work. |
| `sky001` | Skyler | 9:19 PM | Skyler tells Taylor about CyberLife humanoid-robot prototype; needs Marcus's AI for agent training. |
| `sky004` | Skyler | 12:32 AM | Skyler instructs Marcus to boot the prototype with captured human memories. (Marked as "12:32 PM" in token but context is party-night.) |
| `vic003` | Vic | 11:35 PM | Vic fires Marcus on the sidewalk while pressing designer scarf to his bleeding nose. |
| `zia001` | Zia | 9:18 PM | Marcus showed up unannounced at Zia's begging to "borrow" Oracle Ledger for CyberLife demo. Now ghosted. |
| `zia002` | Zia | 9:59 PM | Zia witnesses Ashe annihilate Taylor for conspiring with Marcus to bury the expose. |
| `zia003` | Zia | 11:10 PM | Zia tells Ashe that Marcus is using Oracle Ledger code under "proprietary NeurAI" branding. |

## Buried Tokens — Content NOT accessible to Nova (only metadata)

Nova knows: account name, total amount, transaction count, time. She does NOT know which tokens went to which accounts.

**35 buried tokens** distributed across 9 named accounts (see Financial Reference below).

## Untouched Tokens — Content NOT accessible (treat like buried for content purposes)

`jam002, jam003, jes001, jes004, mor001, qui004, rem004, tay002, vic002, vic004`

**Critical:** `vic002` is untouched. vic002 = "VIC.2 - Vic hires Alex" memory containing the line "ALEX is in, MARCUS is out." Yet the whiteboard contains the phrase "Alex is in, Marcus is out." This means the room wrote that phrase to the whiteboard without the token being formally exposed. **Possible sources for the room's knowledge:** the Vic-player volunteered it verbally, or the room inferred it. **Article-side rule:** Nova cannot cite "Alex is in, Marcus is out" AS A QUOTE FROM A MEMORY. She CAN cite it as appearing on the whiteboard (which is observable).

`jam003` is untouched; it contains "He's out. You're in. Trust me. It's done... SARAH name was also mentioned." Cannot quote this content.

---

## Financial Reference — Shell Accounts (admin-adjusted totals are authoritative)

Total buried across all accounts: **$7.19M** (sales) + adjustments. **23 exposed transactions / 35 buried = 58 total.**

| Rank | Account | Total | # Tokens | Notable |
|------|---------|-------|----------|---------|
| 1 | **B** | $2,730,000 | 7 | Mixed tokens: mor003 ($750K), jam004 ($750K), tay004 ($450K), nat004 ($450K), mor002 ($225K), sam004 ($75K), sky003 ($30K). Single anonymous account collecting party-tier and mention-tier from across the roster. |
| 2 | **Leo** | $1,230,000 | 3 | ALL three Remi tokens (rem001/rem002/rem003) buried in one batch at 10:27 PM. |
| 3 | **Squirrels** | $1,035,000 | 6 | Two batches: three Sarah tokens (sar001/sar002/sar003) at 10:19-10:20 PM, then mel001/mel003/ash004 at 10:28 PM. |
| 4 | **Pika** | $750,001 | 4 | First-of-morning Quinn token (qui001 at 9:27 PM). Plus Alex's ale001 + ale002 + tay001. Also $270,001 in negotiated/adjustment amounts. |
| 5 | **Anon** | $605,000 | 4 | ALL four Flip tokens (fli001/fli002/fli003/fli004) between 9:46 and 10:03 PM. |
| 6 | **Blake** | $500,000 | 1 | Sarah's FIRST burial of the morning: `sar004` at 9:21 PM ($450K) + $50K first-burial bonus. Account NAMED "Blake" (the GM/NPC name). |
| 7 | **President** | $279,990 | 4 | All three Kai tokens (kai001/kai002/kai003) + mel004. |
| 8 | **Spongebob** | $255,000 | 5 | sam001, sam003, ash003, ezr004, cas003 ($0 — UNKNOWN-tier token). |
| 9 | **Jamie** | $75,009 | 1 | ash001 only. Account named "Jamie" (matches roster name). |

### Burial-Pattern Observations (BOUNDARY-SAFE)

These are facts Nova can report without violating boundaries:

- **The first burial of the morning** was a Sarah-owned token (sar004) into an account named "Blake" at 9:21 PM — within minutes of investigation start.
- **Three Remi tokens** were all routed to a single account ("Leo") in one minute (10:27 PM). Behavioral pattern: batched burial.
- **Three Sarah tokens** (sar001-003) routed to "Squirrels" within 60 seconds (10:19-10:20 PM). Another batched burial.
- **All four Flip tokens** routed to "Anon" between 9:46 and 10:03 PM.
- **All three Kai tokens** routed to "President."
- **Sarah's complete token set** (sar001-004) was buried — none exposed.
- **Remi's tokens** (rem001-003) all buried; rem004 untouched.
- **Account "B" (the winner)** collected from 7 different characters' tokens — most-distributed of any account.
- **Total burial activity** peaks 10:00-10:30 PM (during/after deliberation).

### Director Observation Relevant to Burials

> **"Morgan was seen frequently talking to Blake."**

This is the ONLY director-observed behavior near the burial market. It is reportable. It does NOT decode any specific account, but it establishes Morgan as an active participant in the burial market.

### What Nova CANNOT Say (Boundary Violations)

- "Morgan buried X token."
- "The B account belonged to Morgan." (Even if behavioral evidence points that direction, account-name-decoding is unsafe without director confirmation.)
- "Sarah buried her own memories" or "Alex buried qui001." (Operator unknown.)
- Anything mapping a specific token to a specific account in prose.
- Decoding account names by etymology ("Squirrels = Sam because squirrels store nuts" etc.) without behavioral evidence.

---

## Director Quotes (TEMPORAL-SAFE GOLD — use as many as possible)

All from this morning's investigation; relayed to Cassandra through Ashe / the feed / tips.

1. **Remi → Alex:** "You found my memory." Alex replied: "I did." (What Alex did with that information is unknown.)
2. **Jess → Blake (overheard):** "Should I go talk to Sarah? What do you think?"
3. **Ashe to the group (final deliberations):** "This asshole got me fired, Alex was seen punching him, but none of that was reason for us to have killed him. If there's someone to blame, I don't know. But Quinn made this drug, and Quinn is not here. We know that."

## Director-Observed Behaviors

- Ashe went looking for Sarah early on (his first interview subject of the morning).
- Ashe stepped up to support Cassandra with feet-on-the-ground reporting; shared byline.
- Morgan was seen frequently talking to Blake.
- Jess made great contributions to the public record. (Director credits Jess with EXPOSURES generically; specific tokens still default to anonymous.)
- Ashe took the stage at the beginning of the final deliberations and systematically broke down findings.
- Jamie added that he'd found an empty capsule at the bar (supporting drug theory).

## Deliberation Narrative

The room's reasoning, per the director:

1. Ashe established drug-cause-of-death theory (Quinn made the drug).
2. Jamie corroborated with the empty capsule from the bar.
3. Sam's name came up as recreational-drug source for Marcus's parties (but did NOT advance to suspect board).
4. Marcus's theft of Alex's tech came up → **Alex's name went on the board.**
5. Alex defended herself and accused NeurAI of running a recruitment scheme during the investigation → named Sarah as another candidate for Marcus's vacated job.
6. **Sarah's name went on the board.**
7. Showdown between Alex and Sarah — group split and uncertain.
8. Timer ran down; vote settled on **Quinn Sterling** as prime suspect.

## Whiteboard (per session-config parse)

**Title:** MARCUS BLACKWOOD IS DEAD (underlined).

**Suspect-ranking list (red marker, upper right):**
- 1 Sarah
- 4 Alex (mark could be "4" or upward arrow)
- 5 Quinn
- Sam (no number visible — may be cut off)

(Interpretation ambiguity: numbers may be vote tallies, suspect-ranks, or order-of-listing. Verify against article claims.)

**Notes (black marker, free-form):**
- "MARCUS BLACKWOOD IS DEAD"
- "Drugs - Marcus was poisoned"
- "Marcus drugged us."
- "Someone switched M.'s drug."
- "Quinn, Cass and Zia know about some details of this drug psychoxx-3A"
- "Marcus has a secret: drug addictive"
- "Alex is in, Marcus is out"
- "Marcus agreed to use an untested drug made by someone works in the Lab."
- "Marcus took Credit from Alex's work → Biz Az"

**Names found on whiteboard:** Sarah, Alex, Sam, Quinn, Cass, Zia, Marcus.

**Whiteboard ambiguity flag:** "Cass" appears on the whiteboard as someone who knows about PT-3A. This refers to Tori Zhang (NPC), NOT to Cassandra Nova. Do not let the article conflate.

---

## Post-Investigation Developments (REPORTABLE — these are NOW facts)

1. **NeurAI co-CEO leak (anonymous):** Cassandra received an email from NeurAI offering Alex and Sarah an interim co-CEO arrangement. Alex was commended on her "negotiation skills." Cassandra's framing: "I cannot help but feel the investigation was a front for an interview."
2. **Quinn Sterling fugitive status:** Active manhunt; not available for comment.

These two facts are the THESIS-LOAD. They sit in the lede and the closing.

## The Thesis

**The room accused an absent chemist while the surviving institution kept moving.** The verdict named Quinn (who wasn't there to defend himself); the actual contest happening in the room (between Sarah and Alex for Marcus's seat) was being adjudicated by NeurAI in real time. Both candidates emerged with co-CEO offers. The investigation was the interview.

**Pipeline outline's stated tension:** "The room accused an absent chemist while the surviving institution kept moving, and the people in the room who stood to inherit Marcus's seat stayed quiet about how close to it they already were."

Convergence point: **the verdict cleared the room of everyone in it.**

---

## Paper Evidence — What Nova Can Cite (UNLOCKED = unlocked during play; otherwise locked)

UNLOCKED documents (available without unlock; ambient):
- **Vic's Newspaper** (SVBJ Special Edition, Jan 1, 2027): Kingsley Fund announces NeurAI + AI Bio Comp investments. Names "Marcus Blackwood" / "Remi Whitman" / 2010 Facebook internship.
- **Kai's Install Brief** from Marcus, Feb 21, 2027: "environmental cues... run exactly as written." Confirms last-minute install demand.
- **Vic's copy of Remi's One-Pager**: AI Bio Comp branding; MRR $200k; "currently raising $10M."
- **Vic's copy of Marcus' Company One-Pager (locked)**: NeurAI memory-capture technology; "$30 Million."
- **Jess's Card**: "I fucked up. I'm sorry... She means nothing to me." From M. "Look under dog." (Mirror of Sarah's Card with "Look under panda.")
- **Sarah's Card**: same M apology card; "Look under panda."
- **Riley's Loyalty Card to Sarah**: "For when you need reminders of your worth..." Signed "-R." [NOTE: paper evidence calls Riley "Rachel" in texts.]
- **Riley - Sarah Texts (unlocked)**: Riley/"Rachel" texts confirming Sarah is going to the rave to confront Marcus.
- **Guest Check (unlocked)**: bartender prop.
- **Alex's Cease & Desist Letter (unlocked)**: Full grievance; Marcus took credit for BizAI code; demands removal as CEO of NeurAI; deadline Feb 28, 2027.
- **Flip texts with his bookie (unlocked)**: "30K or come ready to sleep in an ice bath... cash inside the throw pillows... ones with Marcus's head on them."
- **Taylor's indexing puzzle note (unlocked)**: numeric code referencing the SVBJ article.
- **Morgan's Lobbying letter** to Senator Burns about AI Advancement Act.
- **Remi <> Vic Funding Email (unlocked)**: Remi pitching Vic; references Marcus's "outdated codebase" and demonstrated ignorance.
- **Sam's Rave Posters (unlocked)**: 4 posters with notes; references Stanford-era parties.

LOCKED documents (had to be unlocked during investigation; treat as accessed if pipeline marked them unlocked):
- **Quinn-Marcus threatening email**: Marcus demanding another batch of PT-3A; "you can't afford to say no, can you?" Feb 17, 2027.
- **Mel - Nat texts**: Mel invites Nat to Marcus's rave; references Stanford Four "spot the difference."
- **Jamie's texts with Skyler**: Skyler paid Jamie $100/conversation to record Marcus's tech-savvy guests.
- **Flip's IOU**: signed 11/10/20 — "undefined favor to be cashed in on a future date" — Marcus held the chit on Flip ("Phil Kowalski").
- **Sam's Diary Entries** (4 entries, Feb 17-20, 2027): Marcus deteriorating, paternity test slipped under door, Stanford Four meeting planned. KEY paper evidence for arc-lab-switch — explicitly names Derek as compound-reformulator (via the PT baggies prop).
- **Ezra's Police Report**: Office burglary Oct 4, 2024; files re: 2020 online incubator program stolen.
- **Nat - Ashe emails with Expose Excerpt**: Ashe sent Nat an excerpt from his killed BizAI expose ("Blood In The Code"). NDA-bound but shared off-record.
- **Bartender's Napkin Notes**: Jamie's running observations re: Flip = Phil Kowalski.
- **Ashe's Phone Number**: "Ashe's tip line"; voicemail mentions Blackwood investigation.
- **Taylor <> Marcus Story Burial Email** (Jan 31, 2027): "Ashe's expose on your 'memory experiments' won't see daylight." "She'll be reassigned to lifestyle." DIRECTLY confirms Taylor killed the story for Marcus.
- **Morgan <> Taylor currying favor email**: Taylor solicits intros from Morgan in exchange for favorable framing; "access = power."
- **Paternity Test for Sarah**: Confirms Marcus is father; mother is Jessicah Kane.
- **Mel's email re: divorce**: To partners at her law firm — taking Sarah as a client; references positive paternity test, anonymously mailed.
- **Alex <> Remi emails**: Alex and Remi coordinating before the rave to dig together on Marcus.
- **Remi's threatening email to Marcus**: "you with your mediocre idea and code can secure $20 million??"
- **Sam <> Mel texts**: Mel and Sam at the rave; Mel sees Vic walk in.
- **Sam's Rave Posters annotations** (Nat): "Here are the originals, since it sounds like Marcus likes to play George Lucas with the reprints!"

Props (treat as observable / character-known):
- **Baggies of PsychoTrophin** (PT-1A through PT-10E): "Different formulations that Derek created based on the compound synthesized by Quinn." **KEY:** This prop tags the lab-switch arc. Derek is the reformulator; Quinn is the original synthesizer. PT-3B was the formulation used on party-goers Feb 21, 2027.
- **5 pillows with letters inside** (Flip-owned).
- **Bar Menu** (cocktail recipes including "THE MARCUS" and "CLAUDE'S COSMO").
- **Posters 1 (Walls)**: party posters from prior Marcus parties.

### KEY PAPER-EVIDENCE FACTS THE ARTICLE MUST CITE AS SOURCES

When the article makes claims drawn from paper evidence (not memory tokens), it MUST surface the document:

- "A paternity test recovered from Sarah's belongings confirms..." (Paternity Test for Sarah)
- "Alex's Cease & Desist letter states..." (Alex C&D)
- "An email recovered from Marcus's files shows him demanding another batch of PT-3A from Quinn..." (Quinn-Marcus threatening email)
- "A Jan 31 email from Taylor to Marcus reads: 'Ashe's expose on your memory experiments won't see daylight.'" (Story burial email)
- "Sam's diary entries from the week of the party..." (Sam's Diary)
- "An IOU from 2020 records Flip — under his real name, Phil Kowalski — owing Marcus an undefined favor." (Flip's IOU)
- "The PT baggies recovered from the lab are labeled PT-1A through PT-10E, formulations created by 'Derek' based on Quinn's compound." (PT baggies prop)
- "Mel's email to her law firm notes she took Sarah as a divorce client after a positive paternity test was anonymously mailed to Sarah." (Mel's divorce email)

---

## Photo ID Reference (12 photos, names L-to-R per user input)

| # | Visible | Action |
|---|---------|--------|
| 1 | Mel, Sam | Reviewing evidence in personal belongings right after waking; Blake's mandate to investigate Marcus |
| 2 | Jamie, Ashe (foreground); Remi (background) | Jamie + Ashe reviewing a piece of evidence; Remi listening |
| 3 | Sam | Unlocking a box holding memory tokens |
| 4 | Ashe, Flip, Jamie | Working together to unlock a stash of memory tokens |
| 5 | Jamie, Remi, Vic | Reviewing the NeurAI one-pager found in Vic's purse |
| 6 | Sarah, Alex | Investigating a piece of evidence together |
| 7 | Flip, Jess | Reviewing exposed evidence as investigation nears final deliberation |
| 8 | Ashe, Alex | Quiet conversation together |
| 9 | Sam, Sarah, Mel | Intense discussion |
| 10 | Morgan | Cracking a code in Marcus's secret workshop (drug room) |
| 11 | Jamie, Mel (bg), Flip (bg), Vic (back to camera), Remi (bg), Ashe | Ashe addresses the group with findings to kick off final deliberations |
| 12 | Jamie, Kai, Alex, Mel, Sarah | Alex's impassioned plea about her innocence |

**Caption discipline:** Captions describe what is VISIBLE. They do not impose thematic narration. Sarah and Alex in photo #6 are investigating evidence; captions cannot say what that evidence was unless it is visible.

---

## Pipeline-Selected Narrative Arcs (5)

1. **arc-quinn-verdict**: The Quinn Verdict — vote for the absent chemist
2. **arc-sarah-alex-showdown**: The Showdown — two names on the board, one job at NeurAI
3. **arc-lab-switch**: contesting the chemistry evidence (Sam, Derek-via-baggies, the formulation question)
4. **arc-crisis-network**: institutional architecture around the investigation (Morgan, Vic, Blake)
5. **arc-many-motives**: unpursued grievance threads (Flip's debts, Jess's paternity, Ashe's killed expose)

## Roster Coverage Check (for fact-check pass)

Every player must have something they DID this morning or that happened TO them. Required appearances (cross-reference against article):

- **Remi**: said "You found my memory" to Alex. Investigation-morning behavior beyond that quote is observed. Party-night memories owned by Remi: rem001 (buried), rem002 (buried), rem003 (buried), rem004 (untouched) — Nova CANNOT quote any of these. Remi's investigation-morning contribution must come from director observation, the quote, or paper evidence (Alex<>Remi emails reference Remi).
- **Sarah**: Ashe sought her out first; she was named on the suspect board (Alex's redirect); co-recipient of NeurAI offer. Paper evidence: Sarah's Card, Riley's Loyalty Card, Riley-Sarah texts, Paternity Test.
- **Ashe**: lead prosecutor at deliberations; co-byline. Multiple exposed memory tokens (ash002). Paper evidence: Nat-Ashe expose excerpt; Taylor-Marcus story burial confirms Ashe's expose was killed; Ezra interview (ezr004 buried, so Nova cannot quote but Ezra's role is establishable through ezr001-003).
- **Sam**: named as recreational drug source (did not advance to suspect board). Sam's exposed: sam002 (Marcus's BizAI confession). Paper: Sam's Diary (names Derek), Sam-Mel texts.
- **Jess**: asked Blake "Should I go talk to Sarah?"; director-credited generic exposure. Exposed: jes002 (overhears Sam on PT-3A). Paper: Paternity Test (Jess named as mother), Jess's Card.
- **Jamie**: produced empty capsule corroborating drug theory; character role is bartender/observer. Exposed: none (his tokens jam001-004 are buried/untouched). Paper: Jamie's texts with Skyler (Skyler paid Jamie to record); Bartender's Napkin Notes; Character sheet (bartender).
- **Vic**: Active during burial period (one of "B" account candidates per pattern but unconfirmed). Paper: Vic's Newspaper; Vic's copy of company one-pagers. Tokens vic001 (buried), vic002 (untouched), vic003 (exposed — fires Marcus), vic004 (untouched).
- **Alex**: punched Marcus (ale003 exposed); named on suspect board; redirected to Sarah; recipient of co-CEO offer. Paper: Cease & Desist (full grievance), Alex-Remi emails.
- **Mel**: Sarah's divorce attorney; in Stanford Four photo (#9) with Sam and Sarah; in photo #11 and #12. Exposed: mel002 (divorce/bank account talk). Paper: Mel's email to law firm; Mel-Nat texts; Sam-Mel texts.
- **Morgan**: seen frequently at Blake (director). Exposed: mor004 (spills to Taylor — shell companies, insider trading, lying under oath). Paper: Morgan's Lobbying letter; Morgan-Taylor email.
- **Flip**: in photos #4, #7, #11. Real name Phil Kowalski. Tokens: all four buried to "Anon." Paper: Flip's IOU, Flip texts with bookie, Bartender's Napkin Notes (identify him), Character sheet.
- **Kai**: in photos #12. Exposed: none (all Kai tokens are buried or party-tier). Paper: Kai's Install Brief, Ashe's Phone Number (note to Kai). Character sheet.

## Common Boundary-Violation Patterns to Watch For

When fact-checking, flag any of these:

1. "Sarah buried her own memories" — operator unknown.
2. "Morgan buried mor003 in B" — token-to-account mapping is invisible to Nova.
3. "The Leo account belonged to Alex" — name-decoding without behavioral evidence.
4. "Vic admitted she was replacing Marcus with Alex" — vic002 is untouched; content invisible.
5. "Remi showed Vic and Alex Marcus's fraud" — rem004 is untouched; vic004 is untouched; ale004 is untouched.
6. "Sarah found Jess in the bathroom" / "We're both his victims" — sar004 is buried; jes004 is untouched; ale004 untouched. The bathroom-confrontation between Sarah and Jess is invisible to Nova. Cannot describe.
7. "I watched [X happen during the investigation]" — Nova was REMOTE.
8. "I overheard [X this morning]" — Nova was REMOTE. Must be relayed via Ashe or tipped.
9. "ALEX is in, MARCUS is out" cited as quote from a memory — vic002 untouched.
10. "He's out. You're in." cited from jam003 — untouched.
11. Misnaming Cass (Tori Zhang, NPC) as Cassandra (the journalist, Nova).
12. Claiming Ashe interviewed Ezra and quoting Ezra's "capitalism" speech (ezr004 buried — content invisible to Nova; Ashe was the interviewer in-game but the article's audience accesses this through Ashe relayed, only if Ashe shared it).

## Untouched-Token Trap Reminder

**Do NOT build narrative threads around what untouched tokens contain.** Untouched tokens are invisible. Specifically beware claims about:
- Vic firing Marcus with the "Alex is in, Marcus is out" specifics → use vic003 (exposed) which shows the sidewalk firing, not vic002 (untouched) which has the planning.
- The Stanford-Four memory-extraction emergency meeting (sam004 buried, mel004 buried, nat004 buried) — the 12:50 AM meeting content is invisible.
- The bathroom Sarah-Jess confrontation (sar004 + jes004 + ale004 all untouched/buried).
- Remi's lab break-in (rem002 buried).
- Remi-Alex-Vic code review (rem004, ale004, vic004 all untouched).

Things that ARE accessible:
- The fact of Alex punching Marcus (ale003 exposed).
- The fact of Vic on the sidewalk firing Marcus (vic003 exposed).
- Marcus's drugging/memory-extraction protocol (mar004 exposed).
- Skyler instructing Marcus to boot the prototype with memories (sky004 exposed).
- The Stanford Four glow rave 2007 origin (nat001 exposed).
- Jess overhearing Sam re: PT-3A (jes002 exposed).
- Sam getting Marcus high and learning of BizAI theft (sam002 exposed).
- Mel learning of the bank-account drain (mel002 exposed).
- Ashe confronting Taylor (ash002 + zia002 exposed).
- Zia telling Ashe about Oracle Ledger theft (zia003 exposed).
- Morgan spilling to Taylor (mor004 exposed).
- Quinn's blackmail by Marcus (qui002 exposed).
- Quinn's anxiety to Ezra (qui003 exposed).
- Riley's loyalty card / shell-company voicemail / Flip flirtation (ril001, ril003, ril004 exposed).

---

## Fact-Check Pass Plan

When reading the article section by section, ask of every claim:

1. **Source?** Is this from exposed evidence (cite token), director observation (cite quote/description), paper evidence (cite document), or unsupported?
2. **Timeline?** Party event framed as "the memory shows..." or as Nova witnessing in present tense? Investigation event framed as Ashe-relayed / tipped, NOT as Nova first-person witness?
3. **Boundary?** Any account-name decoding, token-to-account mapping, untouched-content inference, or self-burial attribution?
4. **Identity?** Pronouns match the player from this session? Group memberships correct per paper evidence? Cass not conflated with Cassandra?
5. **Accuracy?** Financial figures match shell totals? Timestamps consistent? Whiteboard claims faithful?
6. **Intent?** Was emphasis user-requested (per editorial intent) or hallucinated?
