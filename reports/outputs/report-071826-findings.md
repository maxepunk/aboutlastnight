# Session 071826 — Fact-Check Findings (Cycle 1)

Article read AFTER refsheet. Categories: **S** systemic, **A** accuracy/fabrication, **B** evidence boundary, **C** coverage, **H** header/meta. Copy-edit observations deferred to Cycle 2 per two-pass discipline.

**Verdict up front:** the draft's five-section skeleton, account figures, and one or two closing insights are salvageable. Its voice premise (Nova as voting participant), its evidence-card layer (all five inline cards carry invented content), and its account of the deliberation (frictionless consensus) are wrong at the root. The deliberation record, the aftermath reporting, four photos, the session's defining quote, and three of eleven players' storylines are missing. This is a rebuild-within-skeleton, not a patch.

---

## S — Systemic

### S1. Nova is written as a voting, present participant. She was REMOTE. (every section)
Instances: deck "Nine of us convicted…"; lede "Nine hands went up this morning, and one of them was mine", "Last night we were guests at Marcus's party", "we took his life apart"; THE STORY "The memory we recovered", "which is exactly what we did this morning", "Nine of us voted"; THE PLAYERS "the man we convicted", "We let the person…", "She raised her hand with the rest of us"; WHAT'S MISSING "right before I heard her say"; CLOSING "I raised my hand for Vic", "We convicted the most visible man"; hero caption "we spent the morning".
**Record:** reportingMode = remote. Nova was at neither the party nor the investigation nor the vote. Party = recordings; investigation/deliberation = tips and accounts; aftermath = leaks + her own outreach (the board email "leaked to Nova", the assistant call).
**Fix:** full-register conversion. The lede's entire conceit ("I want to be honest about my own hand") is unsalvageable as written; the remote frame is actually stronger for this session — she can audit the room's verdict from outside it.

## A — Accuracy / Fabrication

### A1. All five inline evidence cards carry INVENTED content under real token IDs. (the single worst class)
- `vic004` card ("You signed NeurAI's first real check… never once stopped reminding him of it") — not vic004. Real vic004 = the 1:08 AM fraud discovery (Remi arrives with the laptop; the demo is fake; "it's worthless").
- `ale001` card ("You built the core… This morning you found all of it") — not ale001. Real ale001 = the 9:18 PM rage-texts to Vic (C&D threat; "M stole the idea & design for NeurAI"; "Meet me at the bar at 10:00?"). Card also repeats the this-morning timeline error (A5).
- `jam003` card ("He's out. You're in. The job is yours.") — misquotes; invents "The job is yours"; drops "Trust me. It's done." and the detail that SARAH's name was in the wind.
- Taylor email card ("Kill it. The BizAI piece does not run… Tell Ashe it did not meet the bar") — wholly invented quote. Real recovered email: "Done. Ashe's expose on your 'memory experiments' won't see daylight. Editor thinks it needs 'more substantiation.' She'll be reassigned to lifestyle by Monday. Now about that exclusive the launch…" (Quote around "She'll" — Ashe is he/him this session.)
- `ril003` card ("Years of it. You watched Sarah forgive him…") — not ril003. Real ril003 = the 11:43 PM drunk voicemail: shell companies mapped, "When you're ready, we blow this wide open. The money is yours. Love you!" The actual money-relevant smoking gun was replaced with invented sentiment.
- Sidebar minis mirror the fabrications; one mini carries a chimera token-id (`1902f33d-…-819e-…` — Vic's dossier notionId spliced onto the Taylor email's). Sidebar must be rebuilt in sync (match by data-token/data-token-id).
**Fix:** every card = verbatim token/document text (or verbatim excerpt), correct ID, correct owner label.

### A2. The vote arithmetic is wrong and Nova is counted in it.
"Nine hands went up… one of them was mine" / "Nine of us voted." **Record:** 11 players; Vic drew 9 in a preliminary the clock froze into the verdict; Alex-Vic collusion drew fewer (~6, apparent board tally); Sarah drew 4 (floated in the final five seconds); Zia drew 0. Blake called it. Nova cast nothing.

### A3. The deliberation is misrepresented as frictionless consensus — and its actual beats are absent.
"the verdict landing with the tidy click of a thing everyone had agreed on before the question was even asked"; "I keep returning to how little friction there was."
**Record (raw accusation + notes):** Vic OPENED as the aggrieved party; **Blake stated there was strong evidence someone had been trying to FRAME Vic and counted it in his favor**; the frame accusation hit Alex within seconds; Remi volunteered his own second-largest account and Blake attested it; Blake raised the unanswered Zia account TWICE; **Sarah made the room's first formal accusation — of ALEX** (inheritance theory, tracking the C&D's actual demands); a player called Alex a low-key scapegoat; Alex turned the room onto Vic; Remi "didn't want to put a number on it" then said $20M — Blake noting it exceeded every account on the table; Alex ran the package argument (both of us or Vic alone); Vic countered (Alex found the fake code, Alex took the laptop); the room implied Blake had private talks with Vic (Blake: he'd spoken to just about every single person — he was facilitating); Blake described the pile-on as "like a fish being beaten with a hammer" and named ALEX the hammer; Sarah's name went up at five seconds; time ran out; **the preliminary became the verdict**; Blake told the room to carry the evidence out so the police couldn't get it and evacuated everyone into a neighboring business as cops came through the warehouse doors.
**Fix:** the deliberation is the session's centerpiece and must be reconstructed as a movement. "A decision to stop discovering" can survive only re-anchored to the CLOCK (the room ran out of time mid-argument), not to a false calm.

### A4. "there was no Zia at Marcus's party… whoever Zia is" — the exposed record proves the opposite.
Zia attended the party and is all over the public record: ezr001 (9:18 PM, Zia's stolen-algorithm complaint to Ezra), ash003 (11:10 PM, Zia gives Ashe the scoop AT the party), ash004 (12:42 AM, Zia circulating the room endorsing Ashe). The room's own board lists Zia under KNOWN ATTENDEES and red-circles "Zia — M stolen their code" at the top of the suspect list. Blake's claim ("not part of the night") is contradicted by the record the room itself assembled — which is the sharper story: not "who is Zia" but "the board's top account wore the name of a red-circled attendee with the best-documented grievance, and nobody voted for it or answered Blake twice."

### A5. Fraud-discovery timeline: "This morning Alex was the one who surfaced the fraud" (+ photo-2 caption).
**Record:** the discovery happened at the party, 1:08 AM, documented from both sides (ale004 + vic004), and both memories name REMI as the one who walked the laptop over. "Surfaced this morning" is wrong on time and, if read as "exposed it to the board," violates exposure anonymity (B-adjacent). Deliberation echoed the Alex-alone version (Vic's counter) — report that as the room's claim, against the record.

### A6. Remi's entire scene is fabricated — and the real one is better.
"Remi Whitman ran the audit this morning… walked us through Marcus's finances"; "the person with the most to hide about the finances"; photo-6 caption "ran this morning's money audit."
**Record:** BLAKE read the balances. Remi's documented moves: steered the conversation toward who had money; volunteered he held the second-largest account; director-observed at Blake's — **"put these in my personal account, I have nothing to hide"** (the session's defining quote, absent from the article); Blake attested the ~$2M was genuinely his — the ONLY name verified all night; his account's seven transactions all stamped 11:22 AM, one single visit; he supplied the $20M figure that matches the grievance in his own recovered emails ("Victoria's committed $20 Million… UGH, I hate silicon valley!"); he brokered the 1:08 AM discovery per both exposed memories; he never drew a vote. "Most to hide" inverts the one verified fact — the true irony is a man PAID $1.755M to disappear seven memories in one minute while calling it transparency.

### A7. Sarah's paragraph is wrong end to end.
"the quiet answer to a question nobody asked" — she was named as a jealous wife in the final five seconds and DREW FOUR VOTES. "the composed successor to everything he built" — sourced from nothing in-scene; the CEO offer exists only in the board email leaked to Nova at writing time ("as soon as things 'settle down'") and must be reported as that leak, in the aftermath. "She raised her hand with the rest of us" — fabricated individual vote + mode violation. Her actual documented arc is absent: kicked Marcus out and came to confront him (texts), retained Mel for the divorce (email), the anonymously-mailed paternity test (Mel email + diary), broke up the fight (ale003: "SARAH pulls you off"), discovered the twin apology cards with Jess and Sam (photo 1 — laughing), made the room's FIRST formal accusation (Alex), took 4 votes at five seconds, gets the company by nightfall (leak).

### A8. Vic superlatives and losses are invented.
"the room's richest man" (deck), "the oldest man in the room with the deepest pockets", "never once let Marcus forget", "lost the company he thought he owned." **Record:** the room's logic was the inverse — Vic was voted as the man who LOST the most ($20M per Remi's number; $30M sunk per the exposed memories and one-pager). NeurAI was never his to lose, and the leak says it goes to Sarah. His documented on-record moves: the 9:55 PM plan ("ALEX is in, MARCUS is out… quiet like and ASAP" to dodge criminal conspiracy charges), the 10 PM bar meeting (documented from both ends), the post-punch seal (jam003), the 1:08 AM discovery that the $30M bought a sham.

### A9. Taylor's story mis-dated and mis-described.
"spent an earlier chapter of his career" — the burial email is dated Jan 31, 2027, three weeks before the party. The exposé is described as "how BizAI became NeurAI and who got written out" — the recovered excerpt ("Blood In The Code: Inside BizAI's Cult of Velocity") is about BizAI's surveillance-and-monitoring culture; Marcus's own email calls it an exposé on his "memory experiments." Also missing: Ashe INTERVIEWED Taylor during the investigation (director-observed) — the fired journalist questioning the one who buried him, while Taylor worked the Matrix Rave poster's binary (photo 7) and later held Flip's IOU (photo 9).

### A10. Burial timing: "Overnight, memories got buried" / "Seven accounts took money last night."
All 34 transactions ran 10:30–11:27 AM during the investigation (confirmed shift), ending minutes before the vote. The draft even contradicts itself ("heavier… than it was yesterday"). The timing texture is thesis material: ~$6.1M of $7.865M moved in the final eleven minutes; the last two transactions (11:27) stamped "Vic Kingsley" onto the ledger as deliberation loomed.

### A11. Small fabrications in WHAT'S MISSING.
"Sam Thorne asked the question twice this morning and never got an answer" — the notes record the question once; the outcome isn't recorded. "whether anyone still holds the draft Ashe Motoko actually wrote" — the room recovered Nat's copy of the excerpt (Nat–Ashe email); the record answers this bullet.

### A12. "The house" / "inside his own house" — the venue is a warehouse (evacuation through "the warehouse doors"; diary; the rave-poster venue economy). Note: Marcus living in the adjoining space is BURIED content (rem002) — don't reach for it.

### A13. Byline "Nova | NovaNews Investigative Desk" → "Cassandra Nova" (journalistFirstName: Cassandra; house convention).

## B — Evidence Boundary

### B1. "Wronged, promoted, and paid." — asserts Alex received the Alex-account money.
The account BEARS his name; it was built in one two-minute visit (11:19–11:20). Whether he was paid is exactly what the display cannot show — and the room itself aired the memories-buried-under-another-name theory, which cuts both ways. Keep it an observation and a question. (Same paragraph's "an account carrying Alex's name is heavier by 1.28 million" is the CORRECT phrasing — keep that.)

### B2. "Zia… took more money to stay silent than anyone in the room."
Asserts receipt and purpose. The account wears the name; who directed money there, and whose memories it holds, are invisible. Both the "everyone measuring everyone's take" room-behavior and Blake's twice-unanswered question survive fact-checking — the assertion doesn't.

### B3. "the second-deepest stake in which parts of it we were allowed to see" (Remi) — implies he gated the record's visibility; drifts toward token-to-account knowledge. Replace with the verified-name irony (A6).

### B4. (borderline, hold for Cycle 2) FTM's blindness passage ("I cannot tell you whose memories… I can tell you the shape of the silence") — the hedge is EARNED, keep exactly one sentence of it; currently it's stacked.

Checked and clean: no token-to-account mappings asserted; no exposer named anywhere; Remi account ownership is licensed by the director-observed confession + Blake attestation (owner only, never contents).

## C — Coverage

### C1. Morgan has no storyline (one bullet only) — with an EXPOSED-record arc available.
fli003 (exposed): Marcus hands her a fat envelope of cash at 11:29 PM. The physical envelope in the recovered evidence; whiteboard: "Morgan — Envelope full of cash (Bribe?)". ril003 (exposed): Riley's voicemail maps the shell companies she built. Director-observed: Riley asks for a trade — "what do you got that I want?"; Sam to the room — "where's Morgan?". Her own recovered papers document the 8 PM emergency meeting with Vic about Marcus and the line "desperate enough to consider eliminating the threat?" Present in photos 3, 5, 8. Named in deliberation: never — not once. The unexamined-name thesis has no better exhibit.

### C2. The aftermath is absent — remote Nova's native material and the closing's payoff.
The leaked NeurAI board email (Sarah, CEO, "as soon as things 'settle down'"); Vic's assistant ("taking a vacation to recover from the trauma of last night's events" — the dodge and the spin are the story); the room carrying the evidence out ahead of the police at Blake's instruction. None appear.

### C3. The frame thread is absent.
Blake's on-record statement that someone had tried to frame Vic (counted in his favor) + two Vic-named accounts + the 11:27 finale + a conviction anyway. This is the thesis's engine and appears nowhere.

### C4. Alternative theories absent (skill mandate: represent ALL).
Alex-Vic collusion package (Alex's own argument — drew ~6), Sarah jealous-wife (4 votes, five seconds), Zia (0 despite the red circle and the unanswered $2.1M).

### C5. Sam has no storyline.
First act of the morning: going to Sarah to ask if she's ok (director). Her recovered diary: she made Marcus's drugs ("it's probably the shit I'm making for him"), found the paternity test slipped under the warehouse door and mailed it to Sarah ("Maybe there's another way to let her know…"), and recorded Marcus four days before he died: **"I'm worried about what Vic knows. I wish I could remember that last convo."** — the strongest pro-guilt evidence against Vic in the whole record, apparently unused by the room that convicted him. Stanford Four texture available (nat001 exposed + posters + photo 3); photo 5 shows her reading the diary itself.

### C6. Jess is thin and her strongest exposed material is unused.
jes003 (exposed): Marcus tested the extraction ON HER ("an acting gig… play a butler"; he showed her the token). The twin apology cards — identical text to "J." and "S." ("She means nothing to me") — discovered together, and photo 1 catches the three women LAUGHING over them. The pregnancy is citable via the recovered paternity test (names her), Mel's email ("anonymously mailed"), and Sam's diary — cite documents, never the buried bathroom scene.

### C7. Ashe's morning journalism is missing: he interviewed Taylor about Marcus's dealings (director-observed); he landed the Ezra interview (ash004) with Zia talking him up around the room; his killed exposé excerpt was recovered (via Nat). He's currently only the exposé's victim.

### C8. Quinn: the recovered Marcus→Quinn email is unused — "bring me another batch of Psychotrophin-3A… you can't afford to say no, can you? I'm having a party on the 21st." Premeditation in the victim's own hand, naming the party date. Her "omg this is bad" is used (keep).

### C9. Riley: his REAL ril003 (shell-company map, "we blow this wide open. The money is yours. Love you!") is displaced by an invented card; the trade attempt with Morgan and the loyalty card are available.

### C10. The extraction premeditation chain is absent: Quinn email ("party on the 21st") + Kai's install brief ("It's crucial that there are no problems with the environmental cues. I need them to run exactly as written") + jes003 (the human trial) + jam004 (Skyler's ultimatum, witnessed) + mar004 — **the victim's own final recorded memory is EXPOSED** ("Drugged people make terrible assistants") and unused. The article never establishes what the party actually was.

### C11. Photos: 4 of 9 unused — #1 (cards/laughter), #3 (Morgan+Sam, posters), #5 (the huddle; Sam reading her diary; Quinn alone at the bar), #9 (final moments; Taylor holding Flip's IOU, legible). Skill: all photos used. Captions must name visible people (hero photo 8 currently names nobody; photo 4 caption omits Alex and Jess at the bar behind).

### C12. Director quotes unused: Remi's "put these in my personal account, I have nothing to hide"; Morgan's "what do you got that I want?"; Blake's "like a fish being beaten with a hammer" (naming Alex the hammer) and "spoken to just about every single person"; Sam checking on Sarah. (Used: Quinn's "omg this is bad", Sam's "where's Morgan".)

### C13. Library-vs-ledger: all 41 recovered documents were in the room — the diary, the police report (the 2024 burglary of Ezra's incubator files: the origin of how Marcus knew Zia's algorithm, Quinn's compound, Skyler's protocols), the blackmail email, the napkin surveillance op ($100 per recorded conversation, paid by Skyler; "blue collar treasure hunter") — and the final four minutes audited balances instead. The room had the library and counted the ledger. Nowhere in the article.

### C14. Blake is nearly absent ("the Valet," once). He read the balances, verified exactly one name, raised Zia twice, deflected the private-conversations challenge, coined the fish-and-hammer line, called the verdict when the clock died, and ordered the evacuation. Voice note: "Blake," not "the Valet," per house style.

## H — Header / Meta

### H1. Headline/deck rework as a unit; then sync `<title>`, `meta description`, `og:title`, `og:description` (lines 6–13) — they currently mirror the broken deck ("Nine of us convicted…").
Current headline has workable bones but summarizes; the deck is fabricated. Candidate directions for the editplan (decide there, not here): the frame angle ("Told Someone Framed Vic Kingsley, the Room Convicted Him Anyway"), the audit angle (headline blade + deck carrying 9-votes/clock/frame/board-email), the Zia angle. Hook in the headline, load in the deck.

### H2. Hero caption (photo 8): names none of the ten visible people; "The house" wrong; "we spent the morning" wrong mode.

---

## Preserve (verified correct — don't lose in the rebuild)
- Every account figure and the $7,865,000 total (tracker matches display totals; bars scale correctly).
- $30M as Vic's sunk investment (correctly used).
- Money direction in FTM ¶1 (you get PAID for burying; "an account under a name you choose").
- "An account carrying Alex's name is heavier by 1.28 million" — model boundary phrasing.
- One earned blindness hedge in FTM.
- Closing's core insight — "This economy does not punish taking. It punishes losing where people can see you do it." — true to the record and worth rebuilding around the real specifics (frame ignored, library unread, board email timing).
- "It felt less like a discovery than a decision to stop discovering" — salvageable ONLY re-anchored to the clock freeze.

## Proposed next step
On your approval of scope: build `report-071826-editplan.md` — section-by-section rebuild plan (including the structural decision of where the deliberation and aftermath live), then apply to a Markdown draft for iteration before touching the HTML.
