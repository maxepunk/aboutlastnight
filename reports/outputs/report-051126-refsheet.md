# Reference Sheet — Session 051126 (Monday, May 11, 2026)

Built from `data/051126/` + server state (`selectedArcs`, `selectedPaperEvidence`, arc analysis) before reading the article. **DO NOT INFER ANYTHING NOT ON THIS PAGE.** If the article claims something not here, it's fabrication or hiding in a source I missed.

---

## Session Metadata

- Session date: **2026-05-11** (Monday)
- Reporting mode: **REMOTE** — director override. (Session-config.json says "on-site" but this is a captured-input error. Cassandra Nova was NOT physically present; she worked the case from her newsroom. Ashe Motoko was the named on-the-ground reporter and shared byline.)
- Journalist: **Cassandra Nova** with shared byline **Ashe Motoko** (director-noted: Ashe "instrumental in securing a significant number of tokens and providing Cassandra with crucial tips… receiving a shared byline")
- Voice consequence: NO "I watched" / "I saw in the room" / "in my hearing" / "across the room" from Nova. Use: "Ashe radioed in" / "the floor report placed" / "the audio feed captured" / "what came across my desk" / "by Ashe's count." See 050926 refsheet for the same precedent.
- Roster: **15 players**
- Investigation window: **04:43 PM → 06:00 PM** (77 minutes of burial activity) — convert all timestamps to AM in the article
- Total burials: **$11,585,000** across 10 named/anonymous accounts + 1 zeroed (Bebop-swept) account
- Total tokens: 81 → **12 exposed / 56 buried / 11 untouched / 2 scanned-but-uncommitted (jam003, zia003)**
- **Exposure rate ~15%** — most of the night is buried or invisible.

---

## Roster (15) + Player Pronouns — DIRECTOR-LOCKED

| Character | Pronoun | Notes |
|---|---|---|
| Riley Torres | **she** | Texts use "Rachel" as alternative name — same person, alias |
| Jamie 'Volt' Woods | **she** | Bartender |
| Sam Thorne | **he** | Chemist; "personal account" burials |
| Kai Andersen | **he** | Artist; ran the party installation; handed Remi the 5:55 bundle |
| Ashe Motoko | **she** | Investigative journalist; shared byline with Nova |
| Flip (Phil Kowalski) | **he** | Party architect / construction worker hidden identity; "personal account" burials |
| Vic Kingsley | **he** | VC; "Where IS MY MONEY?!" |
| Jess Kane (Jessicah) | **she** | Pregnant with Marcus's child |
| Remi Whitman | **he** | CEO of AIBioComp; sole architect of the Quinn theory |
| Morgan Reed | **she** | Crisis manager / lobbyist; Vic's outburst target |
| Sarah Blackwood | **she** | The widow; CEO-elect of NeurAI |
| Mel Nilsson | **she** | Sarah's divorce lawyer; Stanford Four |
| Alex Reeves | **he** | Wronged co-founder of BizAI; case against Morgan with Vic |
| Taylor Chase | **she** | Journalist who killed Ashe's exposé as a Marcus favor |
| Zia Bishara | **she** | Coder whose Oracle Ledger Marcus stole |
| **Quinn Sterling** (non-roster, accused) | **he** | session-config: "his involvement… his only way out." **Pipeline outline uses "she/her" — must fix.** |
| Marcus Blackwood (deceased, non-roster) | **he** | — |
| Ezra Sullivan (non-roster, evidence only) | **they/them** | Police report: "Mx. Sullivan" |

**Non-roster PCs referenced in evidence:** Quinn (the accused, absent), Marcus (deceased), Ezra Sullivan, Mel-Nat-Sam Stanford Four context, Skyler Iyer (CyberLife), Taylor Chase. Quinn is the most consequential non-roster PC — the accused, never physically present at the investigation.

**NPCs (Nova-side):** Cassandra Nova (narrator), Blake (black-market broker), Marcus (the deceased).

---

## Accusation — THREE THEORIES COMPETED

The session-config `accusation.notes` field captured only the winner. Per director raw input, **three theories collided during final deliberation**:

| # | Architect(s) | Target | Target presence | Votes | Evidentiary base |
|---|---|---|---|---|---|
| 1 | **Sam Thorne** | Marcus (overdose) — Sam himself complicit as supplier | Sam in the room | **3** | Sam's own labor reproducing the drug + his diary worry + his "definitely going to jail" line during the morning |
| 2 | **Vic + Alex** | **Morgan Reed** (shell-account financial crime) | Morgan in the room | **6** | ril003 (Riley's drunk VM mapping shell vehicles) + Morgan-Taylor email + Morgan's lobbying letter + Riley's research compiled over months + Vic's $20M-committed receipts |
| 3 | **Remi Whitman** ⭐ winner | **Quinn Sterling** (absent chemist, blackmail-victim murderer) | Quinn NOT in the room | **9** | qui002 + qui003 + Quinn-Marcus blackmail email — 3 documents total, all establishing Quinn as victim of blackmail |

**Vote arithmetic:** 3+6+9 = 18 votes for 15 players. Players could vote for multiple theories. Quinn won with 9 votes — a plurality, not unanimity, not majority of all players.

### The structural fact this changes

**Two of the three theories had present-room targets.** Sam was campaigning to be implicated. Vic+Alex were prosecuting Morgan. Both targets were in the warehouse and could be confronted, contradicted, defended. The third theory targeted Quinn — who wasn't there.

The room broke for the absent target.

That's the article's actual thesis. The current draft treated Quinn as the only candidate and missed this entirely.

### Quinn theory specifics (winner)

- **Architect of theory:** Remi Whitman (sole proponent)
- **Remi's preparation:** Kai handed Remi a bundle of memory tokens at ~5:55 AM saying "Here, these are all for you." Vote at ~6:04 AM. Bundle arrived 9 minutes before the count.
- **Only TWO exposed memory tokens touch Quinn directly:** qui002 (Marcus blackmailing Quinn for PT-3A) and qui003 (Quinn confessing to Ezra). Plus ONE paper document: the Marcus→Quinn threatening email.
- **No exposed memory or paper document places Quinn at the party scene on the night Marcus died.**
- **All three Quinn-touching evidence pieces frame Quinn as a victim** of Marcus's blackmail, not as having means or motive for murder.

### Sam theory specifics

- Sam was overheard saying "We're friends, don't you remember?" to Sarah AND "oh man, I'm definitely going to jail" later — both before deliberation.
- Sam believed his drugs killed Marcus. Marcus had paid Sam off the books to reproduce Quinn's formula. The PT-3B baggies prop confirms the chemistry chain: Quinn synthesized → Sam reproduced → Marcus self-administered (per mar004 + Sam's diary).
- 3 votes is consistent with Sam + maybe 2 sympathetic voters.

### Morgan theory specifics (largest evidentiary base, second-place finish)

- 6 votes — the largest concrete-evidence theory.
- Built by Vic + Alex over the investigation morning per director observation: "Vic and Alex were seen spending much of the investigation collaborating and building a case against Morgan."
- Evidence chain: Riley compiled documents about Marcus's shell vehicles over months → Alex tipped Cassandra with Riley's documents → Ashe submitted ril003 (Riley's drunk VM) to the Detective at 05:59 PM → Vic's deliberation outburst at Morgan: "Where IS MY MONEY?!"
- Morgan's response in evidence: Morgan asking Zia about helping Marcus move money — a deflection AND an accusation rolled into one.
- The morgan-Taylor email (paper) confirms Morgan was working press-relations through Taylor, the same broker who killed Ashe's 2024 NeurAI exposé.

**Critical implication:** The strongest-evidence theory lost to the thinnest-evidence theory. That mechanism is the article's spine.

---

## Exposure Map — 12 EXPOSED, 56 BURIED, 13 UNTOUCHED

### EXPOSED (12) — Nova can quote content, describe, draw conclusions

| Token | Owner | Party time | Summary |
|---|---|---|---|
| ash001 | Ashe Motoko | 8:52PM | Ashe overhears Marcus insult Kai: *"I hired you to decorate, not think. Artists who forget they're vendors don't get hired again."* Ashe runs away to avoid being recognized. |
| ash002 | Ashe Motoko | 9:59PM | Ashe confronts Taylor for leaking the NeurAI exposé to Marcus and getting Ashe fired from SVBJ. |
| ash003 | Ashe Motoko | 11:10PM | Zia tells Ashe how Marcus showed up at their house "blitzed out of his mind" and asked to install Zia's Oracle Ledger algorithm into NeurAI for a demo. |
| ash004 | Ashe Motoko | 12:42AM | Ezra grants Ashe a rare on-the-record sit-down interview ("the scoop of the century"). |
| cas004 | Tori Zhang (Cass) | 12:38AM | Kai+Cass discover Marcus stole Cass's Synesthesia Engine code and is planning to run it on unsuspecting party guests. |
| jam004 | Jamie 'Volt' Woods | 12:32AM | Jamie overhears Skyler ultimatum to Marcus: "Tonight we were supposed to do a test run. But you say your AI's still buggy. So let's try programming my prototype with your memory recordings instead." Jamie freezes / invisible. |
| mar004 | Marcus Blackwood | 1:50AM | **Marcus's OWN POV.** Drugs guests, executes memory capture, then can't get them to lock the tokens. "Drugged people make terrible assistants… You don't think ANYONE has the right combinations anymore." |
| qui002 | Quinn Sterling | 9:59PM | **Marcus is blackmailing Quinn** over PT-3A development; Quinn buried the PT-3A safety assessments. Marcus demands more, told Quinn to meet at the bar at 10. |
| qui003 | Quinn Sterling | 12:02AM | Quinn confesses to Ezra. Torn between giving Marcus the compound vs Marcus destroying career. "Terrified of exposure on both sides." |
| rem002 | Remi Whitman | 9:37PM | Remi follows Marcus through a secret door, finds him too high to track sentences, grabs a thumb drive, leaves. |
| rem004 | Remi Whitman | 1:08AM | Remi shows Vic and Alex the code comparison. Left: Zia's Oracle Ledger 2023. Right: NeurAI 2027. Identical. "He didn't even bother changing the notes." |
| ril003 | Riley Torres | 11:43PM | Riley's drunk VM to Sarah: "Marcus worked with MORGAN to set up a slew of hidden investment accounts… insider trading… I've mapped the shell vehicles. The paper trail is clear. When you're ready, we blow this wide open. The money is yours. Love you! Also… I'm going to find Flip. Don't judge me!" |

### EXPOSURE ATTRIBUTION (orchestrator "Exposed By" column)

| Submitter | Tokens |
|---|---|
| **Ashe Motoko (named)** | ash001, ash002, ash003, ash004, **ril003** (Riley's drunk VM) — 5 tokens |
| Anonymous tips | jam004, mar004, qui002, qui003, rem002, rem004, cas004 — 7 tokens |

Ashe is the **only named exposer** for this session. She submitted her own four tokens AND Riley's drunk VM. The other 7 came in as anonymous tips that Cassandra cannot trace to a specific operator.

**Implication for narrative:** "Riley exposed her own VM" = NOT TRUE. Riley's voicemail surfaced because Ashe submitted it. The Morgan/shell-account theory's evidentiary core (ril003) was put on the public record by Ashe, not by Riley herself.

### BURIED (56) — Account/amount/time only; Nova CANNOT see content or initiator unless director observed

Per-account breakdown with admin-adjusted totals below. Critical points:

- **Sarah's three tokens (sar001/003/004)** were ALL buried into the **F Marcus** account at 05:37 PM (consecutive). Per director observation, Jess + Sarah approached Blake at ~5:46 and **funds from Bebop transferred to F Marcus** moments after. Bebop closed at $0 net total.
- **Jamie's only own buried token (jam001)** went to F Marcus at 06:00 PM — the last transaction of the day.

### UNTOUCHED (11) — Content INVISIBLE to Nova

ale001, cas001, fli001, fli003, jam002, mor003, qui001, ril004, sar002, sky003, zia001

**Critical untouched tokens Nova CANNOT quote:**
- **ale001, fli001, jam002, qui001, sar002, sky003, zia001** — characters' party-night POVs unavailable.
- **mor003** — Morgan's POV of the 11:22 PM hammock confrontation with Marcus (the bribe-instead-of-reckoning scene). Nova doesn't have it.
- **Quinn's first and fourth tokens (qui001, qui004)** are NOT exposed. Only qui002 and qui003 are available.

### SCANNED BUT NEVER COMMITTED (2)

- **jam003** (Jamie 'Volt' Woods)
- **zia003** (Zia Bishara)

Per session report, these two tokens were scanned during the game but neither exposed (Detective) nor buried (Black Market). Both Jamie and Zia held back one specific token each. Content remains invisible to Cassandra. The fact of withholding is itself notable — both are present-room players who participated in burials and exposures but kept one piece of their own evidence off both tables.

---

## Paper Evidence — 41 Items Selected (Content Quotable)

Most-load-bearing items for the thesis:

**The Quinn case (the accusation's evidentiary core):**
- **Quinn → Marcus threatening email (Feb 17, 2027):** "I need you to bring me another batch of Psychotrophin-3A… you didn't test levels anywhere near this high during the PT-3B safety assessments, but I'm certain we should go up on the dosage. And **you can't afford to say no, can you?** I'm having a party on the 21st. I'll put you on the guest list."
- **Baggies of PsychoTrophin (prop):** Physical drug evidence. Includes formulations PT-1 through PT-10 and A through E. **PT-3B = the formulation used on Feb 21 party guests.** (Important: it's PT-3B in the prop, but Marcus's email demands PT-3A. PT-3A is the higher-side-effects formula Quinn was being pushed to develop.)

**Twin apology cards (paper, identical body, different recipient/back-clue):**
- **Sarah's Card:** "Front: A rose with 'I fucked up. I'm sorry.' Inside: S. I'm sorry. I love you. It's never going to happen again. She means nothing to me. Don't leave me. M. Back: 'Look under panda.'"
- **Jess's Card:** Identical body. Back: 'Look under dog.'

**Paternity test (DDC Non-Invasive Prenatal):** 99.85% paternity probability. Marcus Blackwood = father, Jessicah Kane = mother. Dated 5/23/2023.

**Sam's Diary (Feb 17–20, 2027):**
- 2/17: "M was off his head… 'I'm worried about what Vic knows. I wish I could remember that last convo with them.'"
- 2/18: "I think he's experimenting on himself. When he asked if I'd break out my chemistry set and reproduce a mysterious formula for him, I should have asked more questions."
- 2/19: Sam plans to corner Mel and Nat at the party.
- 2/20: Sam finds paternity test under the warehouse door. **"I think she has a right to know what her husband has been getting up to! But I can't tell her… Maybe there's another way to let her know…"** (Note: Sam does NOT explicitly confirm he mailed it. Sam's intent is to figure out *some* way to let Sarah know.)

**Alex's Cease & Desist Letter (Patchwork Law Firm, Jan 28, 2027):** Demands Marcus removed as CEO, Alex granted all equity. Deadline Feb 28, 2027. Cites Alex's BizAI contribution and NeurAI as derivative.

**Mel's email about Sarah's divorce (Feb 21, 2:08 AM):** "I've taken on Sarah Blackwood as a client… though I actually met Marcus first, I believe that Sarah's case is better… Sarah mentioned a positive paternity test that was anonymously mailed to her home address."

**Riley → Sarah Texts:** "Riley, you'll be so proud of me. I finally kicked Marcus out! Things are OVER between us. But I have to talk to him about something important, and he won't answer my calls. So I'm going to the rave tonight to confront him." Note: texts use "Rachel" as Riley's other name — Riley's Loyalty Card signs "-R" → Rachel/Riley appears to be same person (alias).

**Riley's Loyalty Card to Sarah:** "Therapy was 'inefficient.' / You shelved the promotion for 'the family.' / He made you cry at Christmas. / You are amazing + deserve so much more." Signed -R.

**Bartender's Napkin Notes (Jamie's surface):** Identifies Flip = Phil Kowalski (Kowalski Construction, fixed Jamie's ice machine). Marcus calls Flip "blue collar treasure hunter." Riley "doesn't know he's Phil."

**Flip's Bookie Texts:** $30K gambling debt. "Be here with the 30K or come ready to sleep in an ice bath." Flip suggests rooting through "throw pillows with Marcus's head on them" for cash.

**Flip's IOU (11/10/20):** Phil Kowalski owes Marcus one undefined favor.

**Jamie's texts with Skyler:** Skyler paid Jamie $100/interaction to record tech-recruit conversations at the party.

**Vic's Newspaper (SVBJ Jan 1, 2027):** Kingsley Fund seeded NeurAI + AIBioComp (competing investments). "I have my reasons." Includes hidden "Useful Names Game" puzzle (party prop).

**Remi → Marcus threatening email (Feb 6, 2025):** "I hear that Victoria's committed $20 Million for your next round of funding. What. The Actual. Fuck."

**Remi → Vic Funding Email (Jan 29, 2027):** Remi pitching Vic to redirect funds from Marcus to AIBioComp. MRR $350K.

**Alex ↔ Remi emails (Feb 17–18, 2025):** Remi: *"Can you get me on the guestlist for the rave too? Maybe we can do some digging together and take that asshole down."* (premeditation)

**Taylor ↔ Marcus Ashe Story Burial Email (Jan 31, 2027):** Taylor: *"Done. Ashe's expose on your 'memory experiments' won't see daylight. Editor thinks it needs 'more substantiation.' She'll be reassigned to lifestyle by Monday."* Note: Taylor uses "she/her" for Ashe in this Jan email — but director observed Ashe pronoun usage is **they/them** this session. The Jan email is dated content; Taylor's pronoun usage doesn't override player-locked pronoun.

**Morgan ↔ Taylor email currying favor:** Taylor offering Morgan "background touchpoints" with policy-press contacts. "Access = power."

**Mel ↔ Nat texts:** Mel inviting Nat to the party — "first, burst, second, reckoned" — Stanford Four ritual.

**Sam ↔ Mel Texts:** Mel confirms she slept with Marcus in the past, won't again. "Wouldn't make that mistake twice." Mel mentions Vic walked in; Sam says he has to "check on something real quick" (left the door open for Sam being aware of Vic's presence).

**Ezra's Police Report (Oct 4, 2024):** "Mx. Sullivan" — office burglary, files from 2020 Online Incubator Program stolen. **Confirms Ezra = they/them.**

**Nat ↔ Ashe emails with Expose Excerpt ("Blood In The Code: Inside BizAI's Cult of Velocity"):** Ashe's killed BizAI exposé. Note: this email was sent by Ashe to Nat ("Nat, As promised, I've included an excerpt"). The expose dates from before Ashe's NeurAI investigation.

**Kai's Install Brief:** Marcus emails Kai instructions for the party installation — "the new specs I sent you… environmental cues… run exactly as written." This is the Synesthesia Engine injection vehicle.

**Character sheets selected** (treat as ambient context, not Nova-witness): Jamie, Flip, Morgan, Riley, Vic, Alex.

**Other paper:** Bar Menu, Sam's Rave Posters (4), Posters 1 (Walls — set dressing), 5 pillows with letters inside (Flip-owned prop), Guest Check (sparse — title only), Taylor's indexing puzzle note.

---

## Director Observations — VERBATIM Quotes (9, all temporal-safe for "I overheard")

These are GOLD for replacing fabricated dialogue. Every quote below was observed during the investigation morning.

| # | Speaker | Quote | Addressee / Context |
|---|---|---|---|
| 1 | Sam | "We're friends, don't you remember?" | To Sarah |
| 2 | Sam | "oh man, I'm definitely going to jail." | To Sarah (later, same conversation arc) |
| 3 | Riley | "So, you're pregnant, huh?" | To Jess |
| 4 | Riley | "I was talking to Alex, and considering giving him something. But I don't know if I can trust him. I trust you because you're my best friend." | To Sarah, hushed |
| 5 | Morgan | "So, It seems you've been helping Marcus move some money around. Yeah?" | To Zia |
| 6 | Kai | "Hey Jess." | To Jess |
| 7 | Jess | "What do you want?! My baby??" | Snapping back at Kai |
| 8 | Kai | "Here, these are all for you." | To Remi, handing over memory tokens at approx 5:55 PM |
| 9 | Vic | "Where IS MY MONEY?!" | Shouting at Morgan during final deliberations |

## Director Observations — Behavioral Patterns

- **Remi seen schmoozing with Vic** early in the investigation.
- **Vic + Alex** collaborated throughout, building a case against **Morgan**.
- **Morgan seen confronting Zia** about helping Marcus move money.
- **Riley + Sarah** had a hushed conversation about whether to trust Alex.
- **Riley + Jess** confrontation about the pregnancy.
- **Kai + Jess** terse exchange ("Hey Jess." / "What do you want?! My baby??").
- **Alex tipped off Cassandra** with documents originally compiled by Riley about Marcus's shell accounts and Morgan's role.
- **Jess + Sarah** had animated conversation before approaching Blake at ~5:46 PM, moments before Bebop's funds transferred into F Marcus.
- **Kai → Remi** memory-token handoff at ~5:55 PM, ~9 minutes before deliberation.
- **Vic's deliberation outburst** at Morgan: "Where IS MY MONEY?!"
- **Sam, Jamie, Flip** all used **PERSONAL bank accounts** for burials (director-confirmed token-to-account attribution for these three).
- **Ashe Motoko** provided crucial tips throughout, sharing byline.
- **Most exposures were anonymous tips** (Nova received them without source attribution); Ashe was the named exception.

## Post-Investigation Development

> "At the time of writing this article, it was leaked to Cassandra from sources within NeurAI that the company is preparing to name Sarah Blackwood as the next CEO of the company to replace Marcus after his death."

Nova present-tense knowledge at publication.

---

## Financial Ground Truth — Nova-Visible

**Authoritative shell account totals (admin-adjusted via orchestrator):**

| Rank | Account | Total | Tokens | Nature |
|---|---|---|---|---|
| 1 | **Biku** | $2,845,000 | 19 | Anonymous; massive 5:52 PM and 5:57 PM sweep clusters |
| 2 | **F Marcus** | $2,730,000 | 7 | Anonymous (name-charged); Sarah's three tokens + Mel001/003 + Ril001 + Jam001. Recipient of Bebop transfer. |
| 3 | **Sam** | $1,710,000 | 12 | **Director-confirmed personal account.** Sam Thorne. |
| 4 | **Ja** | $1,375,000 | 3 | Anonymous; 3 large transactions (sam002 $375K, sky004 $750K, ale003 $250K) |
| 5 | **Elias Moore** | $850,000 | 3 | Anonymous; vic001, vic003, ale004 |
| 6 | **Flip** | $750,000 | 3 | **Director-confirmed personal account.** Flip / Phil Kowalski. kai004, rem003, fli004 |
| 7 | **Marcus** | $650,000 | 3 | Anonymous (name-charged); sky002, nat003, ezr004 — different from F Marcus |
| 8 | **Jamie** | $600,000 | 2 | **Director-confirmed personal account.** mel002, tay004 |
| 9 | **Abc** | $75,000 | 1 | Anonymous; ezr002 only |
| — | **Bebop** | **$0 net** | 3 | Anonymous; 3 tokens of inflow ($1,050K total), **transferred OUT to F Marcus at ~5:46** per director |
| **TOTAL** | | **$11,585,000** | **56** | **77 minutes (04:43 PM – 06:00 PM)** |

**Director-confirmed account-to-person attributions:**
- **Sam** account = Sam Thorne (chemist, used personal account)
- **Jamie** account = Jamie 'Volt' Woods (bartender, used personal account)
- **Flip** account = Flip / Phil Kowalski (party architect, used personal account)
- **Bebop → F Marcus transfer** at ~5:46 = Jess + Sarah operation (director observed them approaching Blake together moments before)

**No director-confirmed attribution for:** Biku, Ja, Elias Moore, Marcus, Abc. These are speculation-only unless cross-referenced with director observations of Blake-window behavior.

**What Nova CAN say:**
- Account names, totals, transaction counts, timestamps.
- That Sam, Jamie, and Flip explicitly used personal accounts (director ground truth).
- Bebop's transfer pattern (3 inflows totaling $1.05M, then $0 net — consistent with the director-observed Jess+Sarah transfer to F Marcus).

**What Nova CANNOT say:**
- Whose tokens are in Biku, Ja, Elias Moore, Marcus, Abc accounts (no source).
- That any specific person controls any anonymous account (without director observation).
- That F Marcus is "Sarah and Jess's account" — director said they transferred Bebop's funds INTO F Marcus, not that they OPENED or OPERATE F Marcus. Other transactions also flow into F Marcus from other tokens.

---

## Critical Boundary Reading: The F Marcus / Sarah Question + Bebop Transfer Mechanics

Seven direct deposits hit F Marcus across the morning, plus one GM-station adjustment:
- **05:37 AM (batch):** sar001 ($225K), sar003 ($75K), sar004 ($450K)
- **05:46 AM:** mel001 ($30K), mel003 ($450K) — same minute as Jess+Sarah at Blake
- **05:47 AM (adjustment):** Transfer FROM Bebop = +$1,050,000 (GM_Station_1, post-Jess+Sarah action)
- **05:48 AM (adjustment, mirror):** Bebop −$1,050,000
- **05:54 AM:** ril001 ($75K)
- **06:00 AM:** jam001 ($375K)

**Transfer mechanics:** Director observed Jess and Sarah approaching Blake at approximately 5:46 AM. The Bebop→F Marcus transfer was recorded by GM_Station_1 at 5:47-5:48 AM (one minute later). So the player-side trigger was Jess+Sarah's approach; the system-side execution was Blake/GM processing at 5:47-5:48. Boundary-safe phrasing for the article: *"Moments after Jess and Sarah approached Blake together, Bebop's funds were transferred to F Marcus."* Avoid claiming Jess+Sarah personally executed the transfer; Blake/GM did the mechanical move at their request.

**Boundary-safe framing:**
- Sarah's three Sarah-owned tokens went into F Marcus at the same minute (05:37). Cassandra cannot say who walked them there.
- The Bebop transfer (Jess+Sarah-triggered) added $1.05M of Bebop's three prior burials into F Marcus at 05:47-05:48.
- F Marcus ALSO received tokens (mel001/003, ril001, jam001) at separate times — Cassandra cannot attribute those to Jess+Sarah.
- Net: **F Marcus is the destination of Jess+Sarah's transfer AND of other burials by other operators.** The name is loaded; let the reader sit with it without decoding ownership.

---

## Investigation Time vs Party Time — DIRECTOR-CONFIRMED

**Investigation timeline events should be converted to AM from PM** (orchestrator records in PM, article publishes in AM). So:
- 04:43 PM → **4:43 AM** (Blake's table opens)
- 05:37 PM → **5:37 AM** (Sarah's three tokens hit F Marcus in a batch)
- 05:46 PM → **5:46 AM** (Bebop transfer to F Marcus; Jess+Sarah at Blake)
- 05:55 PM → **5:55 AM** (Kai→Remi memory handoff)
- 06:00 PM → **6:00 AM** (last burial: jam001 to F Marcus)
- Vote at approximately **6:04 AM** (per outline summary)

**Party time = last night.** All exposed token times (8:52 PM, 9:37 PM, 12:32 AM, etc.) are recovered-memory events. Frame as "the memory shows" / "at 12:32 AM last night" — NOT as Nova witnessing.

---

## Photos (12 of 12) — Character IDs DIRECTOR-LOCKED

| # | File | Subjects | Beat |
|---|---|---|---|
| 1 | aln0511 (1 of 12).jpg | **Remi** (foreground) + **Vic** (background) | Investigating evidence found amidst their personal belongings |
| 2 | aln0511 (2 of 12).jpg | **Jamie** | Intently reviewing documents discovered within the bar safe |
| 3 | aln0511 (3 of 12).jpg | **Sarah and Riley** | Hush-hush conversation |
| 4 | aln0511 (4 of 12).jpg | **Kai and Flip** | Reviewing contents of one of Kai's memory tokens |
| 5 | aln0511 (5 of 12).jpg | **Morgan, Taylor, Sam** | In deep investigation |
| 6 | aln0511 (6 of 12).jpg | **Zia and Riley** in discussion; **Jess** in background reviewing a memory token | Parallel-track investigation |
| 7 | aln0511 (7 of 12).jpg | **Morgan and Sam** | Looking over old posters from previous parties Sam and Marcus threw together |
| 8 | aln0511 (8 of 12).jpg | **Kai, Remi, Alex, Vic, Jamie** | Unlocking memories hidden within boxes from Marcus's secret workshop |
| 9 | aln0511 (9 of 12).jpg | **Kai** | Notices a conversation between others while mid-investigation |
| 10 | aln0511 (10 of 12).jpg | **Alex and Vic** | Working together on unlocking a secret hidden within the SVBJ found in Vic's belongings |
| 11 | aln0511 (11 of 12).jpg | **Sam and Mel** | Working through how to unlock memories in a box discovered in Marcus's secret workshop |
| 12 | aln0511 (12 of 12).jpg | **Zia, Sarah, Morgan** | Working through a secret code in the drug room |

**Pipeline article only used 4 photos (8, 9, 11, 12).** Photos 1, 2, 3, 4, 5, 6, 7, 10 are unused — strong placement candidates for Pass 2.

**Pipeline caption verification:**
- Photo 8 caption "Kai Andersen, Remi Whitman, Alex Reeves, Vic Kingsley, and Jamie 'Volt' Woods" ✓ — correct IDs.
- Photo 9 caption "Kai Andersen, sometime after the handoff" ✓ — correct subject.
- Photo 11 caption "Sam Thorne and Mel Nilsson, before the vote. The other chemist, and the divorce attorney already at work." ✓ — correct IDs. Caption frames their activity, fine.
- Photo 12 (hero) caption "Zia Bishara, Sarah Blackwood, and Morgan Reed. The room as the count came in." ✓ — correct IDs. **But the photo activity is "working through a secret code in the drug room" — NOT "the room as the count came in."** Hero caption misrepresents what's happening in the frame. Flag for findings pass.

---

## Selected Arcs (User-Approved, No Rejections)

All 5 arcs approved on first pass (no `_arcFeedback`, `_outlineFeedback`, `_articleFeedback`):

1. **arc-quinn-blackmailed-chemist** — "The Chemist's Last Resort" (HIGH emphasis, accusation arc)
2. **arc-sarah-succession** — "The Widow Who Inherits" (HIGH, post-investigation CEO leak)
3. **arc-financial-crusade-against-morgan** — Vic+Alex coalition (HIGH, Vic's outburst)
4. **arc-named-burial-accounts** — Sam, Jamie, Flip's personal-name burials ($3.06M signed in their own names)
5. **arc-memory-brokers** — Kai's 5:55 PM handoff to Remi; the bundle that armed the Quinn case

These are the editorial intent. Refinement must preserve these emphases.

---

## Thesis (Locked) — Three theories, one absent target won

**Three theories collided in deliberation.** Sam Thorne (3 votes) argued Marcus had overdosed on the drugs Sam had been supplying — Sam was campaigning to be implicated. Vic and Alex (6 votes) built a documented case against Morgan Reed for the shell-account financial crime that had hollowed out Vic's NeurAI investment. Remi Whitman (9 votes, winner) argued an absent chemist named Quinn Sterling had killed Marcus to escape his blackmail.

**Two of the three targets were in the room.** Sam was advocating his own indictment. Morgan was being prosecuted by Vic and Alex with the strongest documented evidence chain (ril003, Morgan-Taylor email, Riley's compiled documents). The third target — Quinn — was absent. The room broke for the absent target.

Remi's case rested on **three documents**: qui002 (Marcus blackmailing Quinn), qui003 (Quinn confessing to Ezra about the guilt), and Marcus's threatening email demanding more PT-3A. All three frame Quinn as a victim of blackmail. None place Quinn at the party the night Marcus died. The bundle that armed Remi's theory arrived in his hand at ~5:55 AM — Kai pressed it into him with *"Here, these are all for you"* — nine minutes before the count.

**Meanwhile:** $11.585 million moved through Blake's table in 77 minutes. Three voters (Sam, Flip, Jamie) signed their own first names to $3.06 million in burials. F Marcus took $2.73M including Sarah's three buried tokens AND the swept-out $1.05M from Bebop (Jess+Sarah's maneuver at 5:46-48 AM). Anonymous accounts absorbed the rest.

Sarah Blackwood, the widow, will be named NeurAI's CEO by week's end — leaked to Cassandra from sources inside the company during the count.

**The verdict was the deal.** Of three theories — one self-implicating (Sam), one prosecuting a present neighbor (Morgan), one targeting an absent person (Quinn) — the room picked the only one that required no voter to indict anyone present. The strongest-evidence theory lost to the thinnest. The room reached for the option that protected itself.

---

## Boundary Watchlist (Aggressive Fact-Check Items for the Article)

1. **Remote framing.** Cassandra was NOT in the warehouse. No "I watched" / "I saw in the room" / "across the room" / "in my hearing" from her. Use floor reports, audio feed, "what came across my desk," "Ashe radioed in" instead.
2. **Cassandra in first person only.** Cassandra IS the narrator. She is "I" / "me." Eliminate any "tipped to Cassandra by X" / "fed Cassandra tips" — those are third-person self-references and wrong. Use "tipped to me" / "fed me." Cassandra's name appears only in the byline.
3. **All three accusation theories surfaced.** Article must represent Sam's overdose theory (3 votes), Vic+Alex's Morgan/shell-account theory (6 votes), Remi's Quinn theory (9 votes, winner). The single-theory framing flattens the entire story.
4. **Pronoun audit against the locked table.** Riley (she), Jamie (she), Sam (he), Kai (he), Ashe (she), Flip (he), Vic (he), Jess (she), Remi (he), Morgan (she), Sarah (she), Mel (she), Alex (he), Taylor (she), Zia (she), Quinn (he), Ezra (they/them).
5. **Sam did NOT mail the paternity test.** His diary contemplates "another way to let her know" but never confirms mailing. Mel's divorce email confirms an anonymous mailing happened — the article must NOT name Sam as the sender.
6. **F Marcus account ownership.** Don't claim Sarah "owns" F Marcus or "operates" it. Jess and Sarah triggered the Bebop sweep INTO F Marcus at 5:46 AM; the GM station processed it at 5:47-48 AM. Other tokens flowed in from other operators. Multi-operator destination.
7. **The bundle Kai handed Remi at 5:55 AM is one specific transaction.** Don't claim it's the entire basis of Remi's case. Remi may have had other tokens from other sources. The only verifiable handoff Nova has is Kai's "Here, these are all for you." The rest is opaque.
8. **Ril003 was exposed by ASHE, not by Riley.** Per orchestrator timeline. Riley's voicemail surfaced because Ashe submitted it. Article should reflect this chain of custody.
9. **Quinn = HE.** Pipeline article uses she/her throughout — must fix.
8. **Anonymous accounts (Biku, Ja, Elias Moore, Marcus, Abc).** Don't decode names to identify owners. No director observation places anyone at Blake's window for these.
9. **The Quinn accusation as if open-and-shut.** Per arc analysis caveats: 9 votes is "a majority of a divided room, not a consensus." Multiple roster PCs had documented motive but weren't named. Frame appropriately.
10. **Quinn's investigation-day actions.** Quinn was NOT in the warehouse. Article cannot describe Quinn's behavior during the investigation. Only evidence-content references allowed.
11. **PT-3A vs PT-3B.** Marcus's email demanded PT-3A. The party-night drug (per PsychoTrophin baggies prop) was PT-3B. Don't conflate.
12. **Sam mailed the paternity test** — Sam's diary says she found it under the warehouse door and considered "another way to let her know." Sam does NOT explicitly confirm mailing it. The Mel divorce email says it was "anonymously mailed." The Sam→Mailer leap requires a director call.
13. **Kai's 5:55 PM handoff contents** are unknowable. Don't claim the bundle contained Quinn-related tokens; Nova doesn't see what was handed.
14. **All 15 roster players must appear by name AND have a storyline beat.** Cross-check against article.
15. **Director quotes (9 of them) ALL belong in the article.** Pipeline may underuse them.
16. **Paper evidence must be cited as sources** when claims rest on documents (paternity test, C&D, Quinn email, etc.).
17. **Investigation-time vs party-time framing.** PM transaction timestamps may need shift to AM. Verify with director.
18. **Shared byline.** Ashe gets shared byline — must appear in masthead/byline area.
19. **Photo IDs** for all 12 photos must be verified by director.
20. **"On-site" mode** — Nova was physically present (unlike 050926 which was remote). Use "I watched" / "I overheard" — not "the feed showed."
21. **Twin apology cards.** Both unlocked. Display BOTH (panda + dog) — display as paired evidence per 050926 precedent. Pipeline may show only one.
22. **The convergence: 5:46 (Bebop→F Marcus), 5:55 (Kai→Remi handoff), 6:04 (vote).** This is the spine — verify article has it.

---

## Director-Resolved Questions

1. **Pronouns** — locked in roster table above.
2. **Photo IDs** — locked in photo table above (all 12 verified).
3. **PM → AM time shift** — CONFIRMED. Investigation timestamps convert to AM in the article.
4. **Sam mailing the paternity test** — **NO.** Article must not attribute the mailing to Sam.
5. **Riley = Rachel** — director did not address; texts treat them as the same person via "-R" signature. Treat as alias / same character; flag only if article gets it wrong.
6. **Vote** — **9 of votes cast** (not necessarily 9/15). The verdict is a majority of votes cast, not a unanimous or super-majority outcome. Frame as "majority of votes cast" or "nine of the votes cast" — do not call it unanimous.
7. **Alternative theories** — director did not record any. Pipeline assumes Quinn was the only theory. Treat the absence of alternatives as itself notable (a one-theory deliberation is structurally unusual).
8. **F Marcus account naming** — director did not address. Treat the name with care: don't decode it as "Fuck Marcus" without source. Don't claim it's a memorial fund. The name is loaded; let the reader sit with it.

---

End of reference sheet. Ready to proceed to Phase 2 (read article + fact-check findings).
