# Fact-Check Edit Plan — report-041026.html

**Scope:** Accuracy, boundary, timeline, identity, source. Copy/pacing issues NOT addressed here — that's Phase 3.

**Verdict on overall article:** Structurally sound. The "machine killed him" thesis aligns with the group's actual conclusion (death by overdose, no single murderer). Most evidence card references are clean. But the article has **~15 fact-check issues** ranging from outright violations (token-to-account boundary breaches, unsourced figures) to pronoun applications that contradict your rule.

---

## Critical Violations (must fix)

### FC-1. "Not one payment going out" contradicts the Alex transfer (follow-the-money, line 1604)

**Current text:** *"That's the price of silence this morning. Not one payment going out. Every dollar flowing in..."*

**Problem:** The director observation explicitly documents a **transfer out** of the White account to Alex's personal bank account. The article contradicts this sentence two paragraphs later when it describes the Sarah/Alex/Blake trade.

**Fix:** Remove "Not one payment going out" OR rewrite to acknowledge the exception. E.g., *"Every dollar flowing in — with one exception: $150,000 walked out of the White account and into Alex Reeves's personal bank. We'll come back to that."*

---

### FC-2. Token-to-account boundary violations

The article makes three claims that decode account contents — something Nova cannot do. Per the skill: *"Nova knows account names, totals, transaction counts, and timestamps. Nova does NOT know which specific tokens went to which accounts."*

**FC-2a. Marcus account (line 1622):** *"Six memories buried under a dead man's name. Someone decided Marcus Blackwood's secrets should follow him into the dark. That's not grief. That's cleanup."*

- **Violation:** Nova cannot know the content of the buried memories. She cannot know whose secrets they are. The director note explicitly flags the Marcus account as a **"throw off scent"** — identity manipulation, NOT a signal about contents.
- **Fix:** Drop the "Marcus Blackwood's secrets" decoding. Replace with a behavioral read that doesn't decode contents. E.g., *"Marcus. $950,000. Six memories routed under a dead man's name. That's not grief — Marcus had been dead for hours before these deposits, and the account name is pointed. The director's working read is that someone wanted the scent thrown, and six different deposits across three separate minutes suggest the confusion paid off."*

**FC-2b. Jess account "self-burial" inference (line 1622):** *"Full name on the account. No hiding. Jess Kane was named in the accusation this morning, and the account bearing that name has a single buried memory. No pseudonym. Either brazen confidence or a message: I buried this and I want you to know."*

- **Violation:** Assumes Jess Kane is the one who buried a memory there. Nova has no token-to-account mapping. Someone else could have used "Jess" as an account name (the Marcus-account precedent proves this).
- **Fix:** Reframe as account-name observation only, not a self-burial claim. E.g., *"And an account simply named 'Jess.' $225,000. One memory. Jess Kane was named in the accusation this morning, and the only account that matches her name holds a single buried memory. Nova can't confirm who made the deposit — the Marcus account proves names on this ledger can be misdirection — but whoever chose 'Jess' was either brazen or deliberate."*

**FC-2c. What's Missing section (line 1678):** *"Whatever story that memory tells, Jess wanted it known that it was theirs."*

- **Violation:** Same token-to-account assumption.
- **Fix:** Delete the sentence, or reframe: *"Whatever story that memory tells, someone chose Jess's name for the account — either her or someone using her as a decoy."*

---

### FC-3. "Sam Thorne organized the party" — unsupported claim (appears 4 times)

**Instances:**
- Hero photo caption (line 1483)
- "The Players" (line 1656)
- "What's Missing" (line 1664)
- Closing (line 1683)

**Problem:** No exposed token or director observation says Sam "organized" the party. What IS supported:
- Sam manufactured Psychotrophin-3A for Marcus (nat002 exposed: "making this experimental memory drug in a secret laboratory")
- Sam was responsible for Marcus's safety (session-config accusation notes)
- Sam "was seen supporting the efforts of a number of investigators throughout the investigation" (director obs)
- Sam is in the Stanford Four (nat001 exposed, paper evidence)

Sam as "organizer" comes from character-sheet paper evidence about Flip ("You work with Marcus and Sam to turn unlikely spaces into nights people remember") and Sam's diary entries — neither of which establishes Sam as the organizer of THIS party.

**Fix:** Replace "organized the party" everywhere with accurate language:
- **Hero caption:** *"Sam Thorne manufactured the drug that killed Marcus and was explicitly responsible for his safety. The group did not include Sam among the accused."*
- **The Players:** *"Meanwhile, Sam Thorne manufactured the drugs Marcus ingested in a secret lab, was explicitly tasked with Marcus's safety, and was seen supporting other investigators throughout the morning."*
- **What's Missing:** *"I keep coming back to Sam Thorne. Sam manufactured the drugs in a secret lab with weird lighting in an abandoned warehouse. Sam was explicitly responsible for Marcus's safety that night..."*
- **Closing:** *"Sam Thorne, who manufactured the drugs and was responsible for Marcus's safety, is not among the accused."*

---

### FC-4. "Billion-dollar valuation" / "billion-dollar deals" — unsourced (lines 1524, 1685)

**Current text:**
- Line 1524: *"The engine underneath NeurAI's billion-dollar valuation was stolen code that didn't function."*
- Line 1685: *"Billion-dollar deals built on demos that didn't work."*

**Problem:** No paper evidence or token supports a billion-dollar figure. What we have:
- Marcus sold BizAI for **$300 Million** (Vic's Newspaper — Taylor's SVBJ article)
- Vic committed **$20 Million** to NeurAI (Remi's threatening email)
- NeurAI one-pager asks for **$30 Million** strategic investment

**Fix:**
- Line 1524: *"The engine underneath NeurAI's $30-million funding ask was stolen code that didn't function."*
- Line 1685: *"Eight-figure deals built on demos that didn't work."* (or "Multi-million-dollar deals")

---

### FC-5. "Ingesting untested neurotoxins" overstates (closing, line 1683)

**Current text:** *"Skyler Iyer, whose deadline pushed a desperate man into ingesting untested neurotoxins."*

**Problem:** Source evidence describes PT-3A as "experimental," "dangerous," inducing "neural plasticity." No evidence classifies it as a "neurotoxin." jam002 says "ingesting extracts—untested. Dangerous." — not "neurotoxin."

**Fix:** *"Skyler Iyer, whose deadline pushed a desperate man into ingesting untested extracts."* (uses Jamie's language directly, which is both temporal-safe and accurate)

---

### FC-6. "Someone conducted a sustained operation" — the White account had five depositors (line 1606)

**Current text:** *"That's not a panicked burial. That's a systematic campaign of erasure. Someone conducted a sustained operation to make a very large amount of history disappear."*

**Problem:** The White account received tokens from **at least five different players** at separate times: Sarah (3 tokens at 9:41–42), Mel (1 at 9:42), Remi (1 at 9:58), Vic (3 at 9:58), Alex (3 at 10:01). This is coordinated multi-party burial, not a single "someone."

**Fix:** *"That's not a panicked burial. That's a coordinated campaign. Ten separate deposits, arriving in three distinct bursts — a cluster at 9:41, another at 9:58, a final one at 10:01. Multiple hands moving in shifts."*

---

### FC-7. Pokerface misattributed to Morgan alone (line 1620)

**Current text:** *"Then there's Pokerface. $1.175 million, four transactions... Morgan Reed's arc is about playing every side, holding every card, choosing leverage over action. Someone with a poker face built an account worth over a million dollars. I'll let you draw your own conclusions."*

**Problem:** The director observation is explicit: *"Pokerface appears to be a collusion between multiple investigators."* The buried tokens list shows deposits from Flip, Morgan (2×), and Jamie. Of the four, **Jamie alone dropped $750K** (the single largest burial of the night) — more than Morgan's contributions combined. The article frames Pokerface as Morgan's — it isn't.

**Fix:** *"Then there's Pokerface. $1.175 million, four transactions — and here the director's notes are explicit: this account was a collusion. Multiple hands, a single name, a joke the depositors shared. The single largest burial of the entire morning — a $750,000 deposit — landed here at 9:57 AM. Around the same time, I watched Morgan Reed and Jamie 'Volt' Woods working closely together. I'll let you draw your own conclusions about coordination."*

---

### FC-8. Pronoun violations — Morgan, Zia, Alex

Your rule: default to no gendered pronouns. The article uses "she/her" for Morgan (lines 1560, 1572, 1632, twice), "she" for Zia (line 1524), and "his own name" for Alex (line 1618). Sarah (she/her) and Marcus (he/him) are correct per your canonical gender rule.

**Question for you before I fix these:** Did any of Morgan / Zia / Alex's players use gendered pronouns at the table? If not, I'll replace all with names or gender-neutral phrasing.

---

### FC-9. Missing explicit statement of accusation outcome

**Problem:** You told me the group **landed on death by overdose, no single murderer** after deliberating multiple suspects. The article implies this with its "system not killer" thesis but never states the outcome. A reader could walk away thinking 5 people were convicted.

**Fix:** Add one sentence to the lede (between P1 and P2) or to P2 making this explicit:

> *"The group accused five people in turn: Quinn Sterling, Sarah Blackwood, Jess Kane, Morgan Reed, and Skyler Iyer. After working through each theory, the verdict they landed on wasn't murder — it was overdose. No single hand. No single killer. Just a system that left a body behind."*

Or weave into existing P2:

> *"The group accused five people: Quinn Sterling, Sarah Blackwood, Jess Kane, Morgan Reed, and Skyler Iyer — and then, after working through each theory, walked it back. The final verdict was death by overdose. No single killer. The evidence pointed less toward a coordinated killing and more toward a system so rotten that one man's death was its inevitable byproduct."*

---

## Secondary Flags (fix)

### FC-10. "Zia proved it this morning" — temporal scrambling (line 1524)

**Current text:** *"Zia Bishara proved it this morning. She pulled up a code comparison on a laptop Remi Whitman handed her..."*

**Problem:** zia004 is a **recovered memory** from 12:31 AM during the party. Zia didn't prove it "this morning" — Zia proved it during the party, and Nova watched the memory this morning. The pronoun "she" also triggers FC-8.

**Fix:** *"Zia Bishara had proved it already. A recovered memory from 12:31 AM shows Zia pulling up a code comparison on a laptop Remi Whitman had just handed over: the Oracle Ledger commit from 2023 next to NeurAI's 'proprietary' system from 2027."*

---

### FC-11. Hero photo caption — "Sam organized" overlap with FC-3

Same fix as FC-3. Use the rewritten caption.

---

### FC-12. Photo 8 caption misleading (line 1675)

**Current text:** *"Riley Torres, Sam Thorne, and Nat Francisco. The question nobody asked Sam hangs over the entire investigation."*

**Problem:** Sam WAS flagged in the accusation notes as "responsible for Marcus's safety." The accurate framing is that Sam wasn't ACCUSED despite being flagged. "Nobody asked" is misleading.

**Fix:** *"Riley Torres, Sam Thorne, and Nat Francisco. Sam manufactured the drug, was tasked with Marcus's safety, and never made the accusation list."*

---

### FC-13. "Two minutes after Quinn's deadline" (line 1512)

**Current text:** *"Two minutes after Quinn's deadline, Jamie 'Volt' Woods witnessed..."*

**Problem:** Quinn's deadline was 10:00 PM (qui002 exposed). jam002 timestamp is 10:01 PM. That's **one** minute after, not two.

**Fix:** *"One minute after Quinn's deadline..."* or *"Just past Quinn's deadline..."*

---

### FC-14. "Synesthesia Engine as part of an extraction apparatus" — inference overreach (line 1560)

**Current text:** *"...the technology Cass had pitched for $50,000 was being deployed without a contract, without consent, as part of an extraction apparatus Cass never agreed to build."*

**Problem:** The link between the Synesthesia Engine and the memory extraction is **inferred**, not established. cas004 asks the question but doesn't answer: *"Why was he so anxious to install the Synesthesia Engine at his party tonight? What makes this program worth stealing and executing on unsuspecting guests?"* The Psychotrophin-3A + drug extraction chain is established. The Synesthesia Engine's role in it isn't.

**Fix:** Soften to frame as suspicion, not fact. *"...the technology Cass had pitched for $50,000 was being deployed without a contract, without consent, running on unsuspecting partygoers while Marcus extracted memories one room over. Cass never got to ask what the two had to do with each other."*

---

### FC-15. "Jamie saw the mechanism of death" — overreach (line 1632)

**Current text:** *"Jamie saw the mechanism of death and called it rich people and their top shelf habits."*

**Problem:** jam002 shows Jamie witnessing a lab-coated stranger handing Marcus extracts and Marcus ingesting them. Jamie saw **a** drug exchange — whether it was the thing that killed Marcus isn't proven. The group's conclusion was overdose, so extracts/pills are plausibly involved, but "mechanism of death" is a forensic term the evidence doesn't earn.

**Fix:** *"Jamie watched Marcus ingest whatever the stranger handed him and called it rich people and their top shelf habits."*

---

### FC-16. Evidence card mismatch: sidebar has 8, article body has 7 (structural)

**Problem:** The sidebar includes an evidence-card-mini for `cas004` ("The Synesthesia Engine Theft"), but the article body has no matching inline card. Per the skill's sync rule, these should match.

**Fix options:**
- **Option A:** Add an inline evidence card for cas004 in "The Story" section where the Synesthesia Engine is discussed (line 1560 area).
- **Option B:** Remove the cas004 mini from the sidebar.

**Recommendation:** Option A. The Synesthesia Engine theft is a material story beat and deserves the inline card. The article's current P8 (line 1560) already describes it — adding the card reinforces a thread that currently lives only in prose.

---

## Roster Coverage Flag (non-blocking for fact-check, will re-examine in copy edit)

**FC-17.** The "Players" section P5 (line 1658) lists 9 characters — Vic, Alex, Mel, Riley, Taylor, Ashe, Kai, Flip, Ezra — with no storylines. Per the skill: *"A character mentioned by name but without their actual narrative contribution is still missing."*

This is partially a fact-check issue (Riley's investigation work for Sarah, Alex's NeurAI claim, Mel's divorce case, Taylor's Marcus-favor, Ashe's Ezra interview, Kai's installation, Flip's debt/drug arc, Ezra's mentor role — all have exposed-token anchors) and partially a structure issue for the copy edit phase.

**I'm flagging this but NOT fixing it in the fact-check pass** — the fix is additive content, not correction. When we move to the copy edit phase, this is where expansion belongs. Resolving FC-1 through FC-16 first clears the slate for that structural work.

---

## Photos — Spot-check summary

All 6 photo captions and character IDs cross-checked against your director mapping:

| Inline Photo | File | Article Caption | Status |
|---|---|---|---|
| Hero | aln410 (2 of 9) | "Mel Nilsson, Sam Thorne, and Nat Francisco" | ✓ ID correct; caption claim flagged (FC-3) |
| Inline 1 | aln410 (1 of 9) | "Zia Bishara and Cass" | ✓ |
| Inline 2 | aln410 (7 of 9) | "Sarah Blackwood and Alex Reeves" | ✓ |
| Inline 3 | aln410 (9 of 9) | "Morgan Reed and Jamie 'Volt' Woods" | ✓ |
| Inline 4 | aln410 (5 of 9) | "Cass and Jess Kane" | ✓ |
| Inline 5 | aln410 (8 of 9) | "Riley Torres, Sam Thorne, and Nat Francisco" | ✓ ID correct; caption claim flagged (FC-12) |

**Photos used: 6 of 9.** Photos 3 (Taylor + Vic w/ SVBJ secret), 4 (Taylor + Ashe + Kai), and 6 (Zia solo with memory token box) are **not used**. Per the skill: "All session photos should be used." This is a structural/coverage issue — I'll address it in the copy edit phase if you agree the photos belong in.

---

## Questions I need you to answer before applying edits

1. **Pronouns (FC-8):** For Morgan, Zia, Alex — did their players use gendered pronouns, or do I replace all gendered references with names / neutral phrasing?
2. **FC-9 (accusation outcome placement):** Lede P2 or new sentence? Either works — preference?
3. **FC-7 (Pokerface rewrite):** I proposed foregrounding the $750K deposit timing alongside the Morgan/Jamie director observation. OK to commit to that read, or keep it more abstract?
4. **FC-14 (Synesthesia Engine softening):** I'm softening "extraction apparatus" to "one room over" language. Acceptable, or do you want the connection framed differently?
5. **FC-16 (sidebar mismatch):** Add inline cas004 card (Option A), or remove sidebar mini (Option B)?

Once you approve this plan, I apply the edits, we verify, then we move to the copy edit phase (paragraph justification, pacing, transitions, hedges, concrete language, roster expansion — FC-17 and the three missing photos land there).
