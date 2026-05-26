# Findings — Session 052326 (Cycle 2: Copy-Edit on the Fact-Corrected Article)

Article (post-Cycle 1): `outputs/report-052326.html`
Refsheet: `outputs/report-052326-refsheet.md`
Cycle 1 findings: `outputs/report-052326-findings.md`

**Method:** Read the fact-corrected article end-to-end as a magazine reader, then applied the five copy-edit tests (paragraph justification, pacing audit, throat-clearing purge, hedge audit, abstract→specific) and looked for structural moves before sentence-level polish per [[feedback_aln_refinement_structural_moves]].

**Tagging:**
- **STRUCT** = Structural moves (paragraph relocation, section restructure, rewrite-from-purpose)
- **REDUND** = Cross-section redundancy — same beat narrated in multiple places
- **VOICE** = Aphorism / editorial hedge / throat-clearing
- **MECH** = Em-dashes (no-em-dash rule per [[feedback_aln_reports_em_dashes]])
- **CAPT** = Photo caption issue or under-use of available photos
- **COVER** = Roster member thin-coverage or character beat that doesn't pay off

---

## Overall read

**What works (don't lose these):**
- Headline + deck pair is a strong, conventional journalism lead. The deck's three-sentence escalation (gathered / verdict landed / manhunt) does its job.
- Lede paragraph 1's opener: *"Quinn Sterling wasn't there. The chemist the room finally settled on for Marcus Blackwood's death never made it to his last party."* Sharp.
- Ashe's deliberation quote in The Story is gold.
- Sam's diary quote *"It's probably the shit I'm making for him"* lands the lab-switch arc.
- *"The next time his name appears in a document it will be on a warrant."* — kicker line in What's Missing.
- *"I can tell you the shape of the silence. I can't tell you what's inside it. The shape cost $7.46 million."* — strong closer in What's Missing.
- The financial-tracker visual treatment + concrete dollar figures.
- The closing's "absent chemist absorbed every account" kicker.

**What needs structural work (the big ones):**
1. **The leak still hinges the article in the body.** Six locations reference the Alex/Sarah offer. The headline is leak-free but the body isn't — and you've said the leak should not be load-bearing. (See STRUCT-1.)
2. **The Players section is mostly redundant.** Three of its four paragraphs re-narrate beats already established in The Story. Cutting the section (and redistributing its 2-3 unique beats) tightens the article significantly. (See STRUCT-2.)
3. **The Sam paragraph cluster (paragraphs 7-9 of The Story) circles the same point three times.** Sam-as-recreational-supplier, then Sam-via-diary-as-PT-formulator, then Sam-flagged-during-drug-discussion. Compresses cleanly to two. (See STRUCT-3.)
4. **The Closing's third paragraph is leak-load-bearing** ("Alex Reeves and Sarah Blackwood will run NeurAI by Monday" as its opening image). If the leak isn't the article's hinge, the closing's centerpiece shouldn't be the appointments. (See STRUCT-4.)
5. **Photo under-use: 4 of 12 photos placed.** Two strong unused photos directly support arcs the article already develops. (See CAPT-1.)

---

## STRUCT — Structural moves (highest leverage; do these first)

### STRUCT-1. Pull the leak out of the lede; let it be a mid-Story discovery

**Issue:** Lede paragraph 2 currently reads: *"I wasn't in that room. Ashe Motoko was, and he shares this byline because he did the feet-on-the-ground reporting while I worked the wires from outside. **By the time the vote landed, the company Quinn allegedly killed for had already named its new co-CEOs. The verdict and the leaked offer belong to the same morning.**"*

The bolded portion makes the leak a co-anchor of the lede. The reader, on first encounter, learns the verdict AND the leak in the same breath. That's the leak hinging the article from sentence three onward.

The leak's natural home is The Story paragraph 6, where it's introduced as a discovery ("After the deliberations ended, an anonymous leak reached me"). That's where it lands with maximum narrative force — as a reveal that complicates everything the room just did. By the time the reader gets there, the verdict has been built; the leak then recontextualizes.

**Proposed structural move:** Remove the leak references from the lede. Lede paragraph 2 becomes purely about the remote-Cassandra / on-ground-Ashe framing + the manhunt as immediate consequence.

**Proposed lede paragraph 2 rewrite:**
> *"I wasn't in that room. Ashe Motoko was, and he shares this byline because he did the feet-on-the-ground reporting while I worked the wires from outside. By the time the vote landed, Quinn Sterling was already a fugitive in his own absence. What the verdict couldn't account for took the rest of the morning to surface."*

The third sentence here is a promissory note — the article will tell you what the verdict couldn't account for. The reader keeps reading.

---

### STRUCT-2. Cut The Players section; redistribute its 2-3 unique beats

**Issue:** The Players is four paragraphs. Reading them against The Story:

| Players paragraph | Content | Already in The Story? |
|---|---|---|
| Para 1 (Ashe) | Ashe carried the room + Taylor-Chase recorder grievance | Yes — same Taylor-recorder connection in Story para 15 (line 1641) |
| Para 2 (Sarah/Alex) | Sarah barely spoke + Alex's negotiation skills phrase | Yes — Sarah-Alex showdown in Story para 4; Alex-negotiating in Story para 6 |
| Para 3 (Mel/Sam/Morgan/Vic) | Mel's memory, Sam-not-on-board, Morgan at Blake, Vic silent | Yes — all in Story paras 9-12 |
| Para 4 (Jess/Flip/Kai/Remi) | Jess's "Should I go talk to Sarah" quote; Flip loan shark; Kai emails; Remi-Alex "You found my memory" exchange | **Partially new** — Jess quote and Remi-Alex exchange are not in The Story. Flip and Kai mentions are in Story para 14. |

What's unique to The Players and would need to land elsewhere if the section is cut:
- **Jess's question to Blake** ("Should I go talk to Sarah? What do you think?") — director-quote gold
- **Remi-Alex exchange** ("You found my memory." / "I did.") — director-quote gold
- **"Both of those things are true. Neither disqualifies the other"** characterization of Ashe — the journalistic-truth move

**Proposed structural move:** Cut The Players section entirely. Relocate the three unique beats:

1. **Jess's question to Blake** → place in The Story, between paragraph 9 (Sam contributed) and paragraph 10 (chemistry argument running / Morgan at Blake's). The Jess-asking-Blake-about-Sarah moment thematically belongs with the burial-market activity. The quote serves as a bridge: it's another player working a side channel while the main case is being built.

2. **Remi-Alex exchange** → place in The Story, after the cease-and-desist paragraph (line 1547) or after the leak reveal (line 1565). The "You found my memory" / "I did" exchange thematically belongs with the Alex / Marcus-stole-the-IP thread — Alex's morning-of allies are surfacing the same evidence Alex's lawyers had been compiling for months.

3. **The "Both of those things are true. Neither disqualifies the other" line** about Ashe → fold into Story paragraph 15 (the closing of The Story, where Taylor and the killed expose already land). Currently para 15 closes with "the verdict cleared the room of everyone in it." Insert the Ashe characterization just before that line. Ashe is both the byline-sharing reporter AND the heaviest-motive-holder in the room; that contradiction belongs at the moment the article asserts the room cleared itself.

**What you lose by cutting The Players:** A formal section header. A break between The Story (long) and Follow the Money / What's Missing / Closing. Some readers like sectional rhythm.

**What you gain:** ~250 words of redundancy removed. The Story tightens into a single architected sequence. Each character beat lands once, in the section where it pays off.

**Section structure after cut:**
1. Lede
2. The Story (absorbs Jess quote, Remi-Alex exchange, Ashe characterization)
3. Follow the Money
4. What's Missing
5. Closing

Five sections → four. The 032726 reference report dropped a section for thesis reasons; same principle applies here.

**Alternative (if you want to keep The Players):** Reconceive the section's purpose. Instead of recapping who did what, make it about what each player was NOT asked. Currently it does this implicitly ("Vic Kingsley's name didn't reach the suspect board at all"), but most of the section is recap. A reconceived Players would be a one-paragraph roll call of unasked questions, one per player. Tighter and non-redundant. But cutting is cleaner.

---

### STRUCT-3. Compress the Sam paragraph cluster (Story paragraphs 7-9) into two

**Issue:** Three consecutive paragraphs cover essentially the same point: Sam was the chemist in the room.

- **Para 7 (1567):** Chemistry case re-opens. PT-1A through 10E. Sam is the recreational supplier. Sam is in Stanford Four.
- **Para 8 (1569):** Sam's diary quote. PT-1A through 10E AGAIN. Sam's reformulation. Sam was in the building.
- **Para 9 (1581):** Sam's name came up in drug discussion (RESTATED). Her recovered memory. Mel's recovered memory. The chemist in the room helped convict the chemist who wasn't.

The "Sam was in the Stanford Four / her chemistry connects to the murder weapon" point lands three times. The "PT-1A through 10E" formulation-tree detail appears twice (paras 7 and 8). The "Sam's name came up" framing appears twice (paras 7 and 9).

**Proposed structural move:** Compress to two paragraphs.

**Paragraph A (replaces 7 and the chemistry portion of 8):**
> *"The chemistry case the room built against Quinn opened back up the moment anyone really looked at the baggies. Psychotrophin-1A through 10E. A whole formulation tree, not a single compound. Sam Thorne's name came up as the source of the recreational supply at Marcus's parties; her own recovered diary, exposed this morning, places her squarely inside Marcus's drug supply. "It's probably the shit I'm making for him," she wrote of Marcus three days before the party. The PT-3B batch that extracted everyone's memories last night was Sam's reformulation of Quinn's original synthesis. She's in the Stanford Four. So is Mel. So was Marcus."*

**Paragraph B (replaces para 9, refocused):**
> *"Sam was in the building. The room flagged her as the recreational supplier and did not advance her to the suspect board. Her own recovered memory from 10:44 PM shows Marcus, drugged out of his mind on her usual blend, confessing the BizAI algorithm was Alex's work. Mel Nilsson's recovered memory walks through Sarah's nearly empty shared bank account; her email to her law firm shows the divorce was already a retained case the morning Marcus died. The chemist in the room helped convict the chemist who wasn't."*

Three paragraphs → two. The thesis hit ("Sam was in the building") lands at the start of the second paragraph as a turn rather than at the end of the first as a closer — gives the second paragraph an opening rhythm.

---

### STRUCT-4. Reframe Closing paragraph 3 — the appointments shouldn't lead the institutional aftermath

**Issue:** Closing paragraph 3 currently opens: *"Alex Reeves and Sarah Blackwood will run NeurAI by Monday."* That's the leak's content elevated to the closing's load-bearing image. If the article shouldn't hinge on the leak, the closing's third paragraph shouldn't open with the appointments.

The paragraph's analytical content is still important — the technology Marcus built passing to people who survived him is a strong systemic claim. But it should be subordinated to the broader survives-Marcus thesis, not led by the appointments.

**Proposed structural move:** Lead the paragraph with the system-survives-Marcus claim. Let the appointments appear as a supporting detail within that frame.

**Proposed paragraph 3 rewrite:**
> *"The system Marcus built survived him. The drug supply is still being formulated; the lobbying architecture is still being maintained; the investor who fired him before the room ever gathered still runs the board. By Monday that board will have handed Marcus's title to the partner he stole from and the wife he was divorcing. The technology that made it possible to extract memories from twelve people without their consent in the first place will now belong to them. The system absorbed every grievance the room declined to name."*

This puts the system-survival claim first (the thesis) and the appointments inside that frame (supporting detail). The leak is acknowledged but is no longer the headline image of the closing.

**Alternative (more aggressive):** Cut paragraph 3 entirely. The Closing becomes three paragraphs:
1. The verdict stands (acknowledges the conclusion)
2. What the verdict doesn't account for (lists the room's unasked questions)
3. Kicker ("The absent chemist absorbed every account...")

The institutional aftermath is then handled in The Story (where the leak is revealed) and What's Missing (where it's named as an open question), and the Closing focuses on the structural truth without the appointments.

Recommend the reframe (first option) over the cut. The institutional aftermath IS part of the story; it just shouldn't be the closing's load-bearing image.

---

### STRUCT-5. Fold the "other motives" throat-clearing transition paragraph

**Issue:** Story paragraph 13 (1609): *"There were other motives in that room. Several. The room logged them and walked past."*

Pure transition. "Several" as a one-word sentence-fragment is rhythm theater. "The room logged them and walked past" is the kind of thesis-restatement that tells the reader what's coming next instead of letting the next paragraph do it.

**Proposed structural move:** Cut entirely. The photo + caption that follows ("Ashe, Flip, and Jamie. Three motives, none of them on the board.") does the transition work. Then paragraph 14 ("Flip's signed IOU...") lands directly.

---

### STRUCT-6. Relocate the Marcus-via-Sam's-diary inline quote

**Issue:** The inline quote at lines 1661-1664 sits in The Players, between the Ashe paragraph (about Ashe's grievance) and the Sarah paragraph (about Sarah's silence). The quote is *"I'm worried about what Vic knows. I wish I could remember that last convo with them, but my memory is not the best."* — Marcus speaking, recorded in Sam's diary 2/17/27.

The quote is about VIC. It doesn't serve the Ashe paragraph it follows or the Sarah paragraph it precedes. Orphaned placement.

**Proposed structural move:** Move the inline quote to The Story, just before the Vic-on-sidewalk paragraph (line 1607). The quote's "I'm worried about what Vic knows" sets up the next paragraph's reveal that Vic was, in the same hours, about to fire Marcus on the sidewalk. That pairing earns the quote's placement.

If The Players is cut per STRUCT-2, the quote relocates anyway; this just specifies where.

---

### STRUCT-7. Lede paragraph 1 — kill the internal redundancy

**Issue:** Lede paragraph 1 sentence 1 says *"Quinn Sterling wasn't there."* Sentence 3 says *"the name they put on the board belonged to someone who wasn't in the building."* Same factual point, two sentences apart, in the same paragraph.

**Proposed move:** Tighten paragraph 1 to land the structural anomaly once.

**Proposed rewrite:**
> *"Quinn Sterling wasn't there. The chemist the room finally settled on for Marcus Blackwood's death never made it to his last party. Twelve people stood around the evidence table this morning, sifted through extracted memories and labeled baggies of Psychotrophin, and named him anyway."*

"And named him anyway" replaces the longer "the name they put on the board belonged to someone who wasn't in the building" and lands the same point in three words instead of fifteen. The fact of his absence was established in sentence 1; the third sentence doesn't restate it, it acts on it.

---

## REDUND — Cross-section redundancy beyond what STRUCT-2 covers

### REDUND-1. The Taylor-Chase-recorder connection narrated in three places

Same observation appears in:
- The Story para 15 (line 1641): *"The journalist who arranged the burial was Taylor Chase, the same Taylor Chase whose recorder, in Morgan's recovered memory from 12:40 AM, was rolling..."*
- The Players para 1 (line 1659): *"His investigation of Marcus's memory experiments was killed before the party by Taylor Chase — the same Taylor Chase whose recorder, in Morgan's recovered memory, was running..."*
- The Closing acknowledges it implicitly via *"The journalist whose career Marcus destroyed led the prosecution."*

If The Players is cut (STRUCT-2), the duplicate disappears. If The Players stays, the Players para 1 mention should be a one-sentence callback ("Ashe's killed expose, detailed above, is the heaviest motive of anyone present") rather than re-narrating the Taylor connection.

### REDUND-2. "Alex was already negotiating" appears in two places

- Story para 6 (1565): *"What no one at that evidence table said out loud: Alex had already been negotiating with NeurAI's board."*
- Players para 2 (1666): *"Alex was already negotiating with NeurAI's board by the leaked email's own admission."*

Same point. Players cut resolves it; if Players stays, the second mention should be a brief callback.

### REDUND-3. Morgan at Blake's station appears in two places

- Story para 10 (1583): *"Ashe relayed that Morgan Reed was a fixture at Blake's station this morning..."*
- Players para 3 (1668): *"Morgan Reed was a fixture at Blake's station, frequently in conversation with the Valet and rarely with the rest of the room."*

Direct phrase-level duplication. Players cut resolves.

### REDUND-4. Flip's IOU / loan shark appears in two places

- Story para 14 (1621): *"Flip's signed IOU to Marcus from 2020, with a loan shark texting in real time for thirty thousand dollars, never went up."*
- Players para 4 (1670): *"Flip stayed off the suspect board entirely despite a loan shark in his texts."*

Brief mention in Players, full treatment in Story. Players cut resolves.

### REDUND-5. The "twelve people" count appears... a lot

The count "twelve" appears nine times across the article:
- Deck: "Twelve of Marcus Blackwood's guests"
- Lede para 1: "Twelve people stood around"
- Story para 3: "Twelve hands. One absent chemist."
- Story para 4: "the two women" (implicit twelve room)
- Follow the Money para 1: "twelve people who did have seats"
- Closing para 3: "extract memories from twelve people without their consent"
- Hero caption (removed in Cycle 1 from "Six of the twelve" but kicker line still indirect)

Most of these are load-bearing. But "Twelve hands. One absent chemist." in Story para 3 — coming right after a four-sentence Ashe quote that already establishes the room's vote — is decorative. Could be cut.

**Proposed minor move:** Cut "Twelve hands. One absent chemist." from Story para 3. The paragraph ends with "Jamie 'Volt' Woods added that he'd found an empty capsule..." which lands better as the rhythmic close.

---

## VOICE — Aphorism, hedge, throat-clearing

### VOICE-1. "The case closed itself" — aphorism that misdescribes the action

**Where:** Story para 3 (1533), closing line: *"The case closed itself."*

**Issue:** The case didn't close itself. Ashe closed it (took the stage, made the chemistry argument). The room closed it (let the argument carry, voted). "Closed itself" reads clever but flattens agency that's the article's whole point — the room actively chose this verdict over alternatives.

**Proposed fix:** Replace with a specific descriptor that names the agency. Options:
- *"The room let the argument close it."* (passive room, active argument — captures that the room didn't push back)
- *"Ashe closed it. The room let him."* (active dual agency)
- Or simply cut "The case closed itself." and let the previous sentence (Jamie's empty capsule) be the closer.

Recommend cutting outright. The Ashe quote and Jamie's empty-capsule contribution already convey that the case closed; the assertion is redundant.

### VOICE-2. "Premium secrets sell at a premium" — empty aphorism

**Where:** Follow the Money para 2 (1649), closing line.

**Issue:** Aphorism that gestures at significance without making a specific claim. What's the specific point? That Leo's per-transaction average is higher than B's? That's the data point; saying "premium secrets sell at a premium" is paraphrase-as-conclusion.

**Proposed fix:** Cut. Let the data (Leo's $410K average per transaction, vs B's $2.73M total across more transactions) carry. Or replace with a specific claim:
- *"Leo's account sells fewer secrets at higher prices."* (specific claim about the account's pattern)

Recommend cut.

### VOICE-3. "Every thread collapsed into a single observation" — abstract closer

**Where:** Story para 15 (1641), penultimate sentence: *"Every thread collapsed into a single observation: the verdict cleared the room of everyone in it."*

**Issue:** "Every thread collapsed into a single observation" is throat-clearing before the actual observation. The thesis-line is *"the verdict cleared the room of everyone in it"* — that's strong on its own.

**Proposed fix:** Cut the "Every thread collapsed into a single observation" framing. Just land the thesis: *"The verdict cleared the room of everyone in it."* Or restructure: *"The room cast its vote for Quinn, and in the same hour NeurAI's offer landed. The verdict cleared the room of everyone in it."*

### VOICE-4. "I cannot help but feel the investigation was a front for an interview" — editorial hedge

**Where:** Story para 6 (1565), closing line.

**Issue:** "I cannot help but feel" is a classic editorial hedge — Nova has a published byline and an investigative beat; she commits to her claims. "Cannot help but feel" softens the assertion into reportorial gut-instinct.

**Proposed fix:** Commit. Options:
- *"The investigation was a front for an interview."* (full commit)
- *"By the leaked email's own framing, the investigation was a front for an interview."* (anchored in the source, no hedge needed)

Recommend the second — anchors the claim in the leak's language ("commending Alex on her negotiation skills" implies the board was treating the investigation as a negotiation context) and removes the editorial hedge.

### VOICE-5. "Both of those things are true. Neither disqualifies the other" — aphorism in service of a real point

**Where:** Players para 1 (1659), closing pair.

**Issue:** This one's borderline. It IS making a specific claim (Ashe is both the byline-sharing reporter AND the heaviest motive in the room). The aphoristic phrasing is doing real work. But the construction "X is true. Y is true. Both can be true" is a writerly tic.

**Status:** Hold. If The Players is cut per STRUCT-2, the line moves into The Story per the relocation plan. In that new context, the construction works because it lands as the article's reckoning with its own co-byline. If The Players stays, sharpen to: *"Ashe carried the prosecution. Ashe carried the heaviest motive. The article had to acknowledge both."* Or similar.

### VOICE-6. "by one read" — defensive hedge inside Follow the Money

**Where:** Follow the Money para 4 (1653): *"The house, by one read, collected on its own table."*

**Issue:** "By one read" is an editorial hedge. The boundary-safety the hedge gestures at is real (Nova can't identify the operator of the Blake account), but the existing paragraph structure already does that work — "an account whoever operated it chose to label after the Valet" makes the boundary clear. "By one read" then double-hedges.

**Proposed fix:** Drop "by one read." The sentence becomes: *"The house collected on its own table."* Tighter and the boundary-care is already established by the preceding sentence.

### VOICE-7. "long half hour" — invented quantification

**Where:** Story para 4 (1535): *"A showdown between the two women split the group for a long half hour."*

**Issue:** Director notes don't quantify the showdown's duration. "Long half hour" is fabricated specificity. It's also the kind of detail readers don't need — the showdown's emotional weight is what matters.

**Proposed fix:** Replace with a non-quantified descriptor. Options:
- *"A showdown between the two women split the group."*
- *"A showdown between the two women split the room into two camps."*

### VOICE-8. "as the timer ran out" — game-mechanic vocabulary

**Where:** Story para 3 (1533): *"As the timer ran out, the room voted."*

**Issue:** "The timer" is in-game vocabulary. Journalism vocabulary would be "the deliberation period" or "the morning session" or just "in the final minutes." Per [[feedback_aln_journalism_voice_lessons]] — game-mechanic vocabulary should be translated.

**Proposed fix:** *"In the final minutes, the room voted."* or *"When the deliberation closed, the room voted."*

---

## MECH — Em-dash audit (no em-dashes per default rule)

Four em-dashes in the article body. All need replacement.

### MECH-1. Story para 10 (1583)

> *"Ashe relayed that Morgan Reed was a fixture at Blake's station this morning **—** back to it between rounds, in conversation with the Valet more than with the rest of the room."*

**Fix:** *"Ashe relayed that Morgan Reed was a fixture at Blake's station this morning, back to it between rounds, in conversation with the Valet more than with the rest of the room."*

(Comma replacement; the appositive flows naturally.)

### MECH-2. Story para 12 (1607)

> *"The fight between Sarah and Alex this morning was a duel over a seat that someone **—** investor or otherwise **—** had already begun arranging to fill."*

**Fix:** *"The fight between Sarah and Alex this morning was a duel over a seat that someone, investor or otherwise, had already begun arranging to fill."*

(Comma replacements for the parenthetical.) Alternative: drop "or otherwise" entirely and commit: *"The fight between Sarah and Alex this morning was a duel over a seat the investor had already begun arranging to fill."* (Vic is the investor; the source supports this if Cassandra knows from the whiteboard's "Alex is in, Marcus is out" line.)

### MECH-3. Players para 1 (1659) — if Players section stays per STRUCT-2

> *"His investigation of Marcus's memory experiments was killed before the party by Taylor Chase **—** the same Taylor Chase whose recorder, in Morgan's recovered memory, was running..."*

**Fix:** *"His investigation of Marcus's memory experiments was killed before the party by Taylor Chase, the same Taylor Chase whose recorder, in Morgan's recovered memory, was running..."*

(If Players is cut per STRUCT-2, this resolves on its own.)

### MECH-4. Players para 2 (1666) — if Players section stays

> *"Alex was already negotiating with NeurAI's board by the leaked email's own admission **—** 'negotiation skills' was the board's phrase, not mine."*

**Fix:** *"Alex was already negotiating with NeurAI's board by the leaked email's own admission. 'Negotiation skills' was the board's phrase, not mine."*

(Period replacement, capitalize "Negotiation.")

---

## CAPT — Photos and captions

### CAPT-1. Photo 6 caption contradicts the body

**Where:** Story (line 1540, 1544): *"Sarah and Alex this morning. Neither of them knew the offer email was already drafted."*

**Issue:** The Cycle 1 edits established that Alex *was* already negotiating with NeurAI's board ("'negotiation skills' was the board's phrase, not mine"). So Alex very likely knew an offer was coming. The caption's "Neither of them knew" is inconsistent with the body's framing.

**Proposed fix:** Reframe to what's visible + accurate. Options:
- *"Sarah Blackwood and Alex Reeves investigate evidence together. Three hours later their names would be on the suspect board."* (visible: them investigating; factual: the showdown ahead)
- *"Sarah and Alex this morning. By the deliberations, each would be named for Marcus's job."* (clean, accurate)
- *"Sarah and Alex working a piece of evidence this morning. By the deliberations, the showdown."* (briefer)

Recommend the second option. Removes the inaccurate "neither knew" while preserving the photo's narrative weight.

### CAPT-2. Photo under-use — strong unused photos available

Currently used: 11 (hero), 6, 10, 4.
Not used: 1, 2, 3, 5, 7, 8, 9, 12.

**Recommend adding:**

- **Photo 9** (Sam, Sarah, Mel intense discussion). Visualizes the Stanford-Four / chemistry-in-the-room thesis. Lands in The Story near the Sam-as-chemist paragraphs (around line 1567-1581). Caption candidate: *"Sam Thorne, Sarah Blackwood, and Mel Nilsson. Two members of the Stanford Four and the woman Marcus was leaving."* (or similar — verify who's L-to-R)

- **Photo 12** (Jamie, Kai, Alex, Mel, Sarah — Alex's impassioned plea). Direct visualization of the Sarah-Alex showdown. Lands in The Story right around the Sarah-Alex deliberations (around line 1535). Caption candidate: *"Alex Reeves makes her case mid-deliberations. By the end of the morning her name would be off the board and on a co-CEO offer."*

- **Photo 5** (Jamie, Remi, Vic with the NeurAI one-pager) — optional. Lands around the Vic-on-sidewalk / arrangement-being-made paragraph (line 1607). Caption candidate: *"Jamie Woods, Remi Whitman, and Vic Kingsley with a NeurAI one-pager recovered from Vic's purse. The investor was already removing Marcus before the party began."*

Two added photos (9 and 12) brings coverage to 6 of 12 and pays off two specific narrative beats. Three added (9, 12, 5) brings to 7 of 12 and gives Remi a visual beat in addition to his single dialogue line.

### CAPT-3. Hero caption — fine after Cycle 1 fix

*"Ashe Motoko closes his case to the room. Quinn Sterling was not in it."* — works. No change.

### CAPT-4. Photo 10 caption (Morgan)

*"Morgan Reed mid-investigation. The lobbyist who built Marcus's reputation as the principled face of AI ethics."*

**Issue:** Caption is descriptive and accurate. Minor: it imposes an editorial frame ("lobbyist who built Marcus's reputation as the principled face of AI ethics") that goes a step beyond what's visible. The article body makes this claim, but the caption asserting it goes slightly past what the photo shows.

**Status:** Hold. Not a clear violation; defensible because the caption identifies who Morgan is. Could tighten to: *"Morgan Reed cracking a code in Marcus's lab this morning."* — closer to what's literally visible. But this is a judgment call.

### CAPT-5. Photo 4 caption (Ashe, Flip, Jamie)

*"Ashe, Flip, and Jamie. Three motives, none of them on the board."*

**Status:** Strong. No change recommended. Lands the article's beat.

---

## COVER — Coverage observations

### COVER-1. Remi is thin

Remi appears once in the article body, in the dialogue quote *"You found my memory."* / *"I did."* No other character beat. He has the rare distinction (in this article) of being a roster player with a director-credited overheard moment, but the article doesn't develop him further.

**Options:**
1. **Hold.** The Remi-Alex exchange is gold and lands as a kicker line in The Players para 4 (or wherever it relocates). Some players get more weight than others based on the morning's events; that's fine.
2. **Add a Remi visual.** Photo 5 (Jamie, Remi, Vic with the one-pager) gives Remi a visual presence + ties him to the NeurAI competitor / Vic-funding subplot.
3. **One-sentence enrichment** during the Vic-on-sidewalk paragraph: *"Remi Whitman, Vic's other portfolio company, was working a different angle of the same morning."* — anchors Remi as the AI BioComp founder Vic also funds.

Recommend (2) as the lightest-touch addition.

### COVER-2. Roster check post-edits

Twelve roster: Remi, Sarah, Ashe, Sam, Jess, Jamie, Vic, Alex, Mel, Morgan, Flip, Kai. All appear by name. All except Remi have at least one specific action or quote attached. Coverage holds.

### COVER-3. Director quote usage

All three director quotes appear:
- Ashe's deliberation speech ✓
- Jess's "Should I go talk to Sarah?" ✓
- Remi-Alex exchange ✓

Pass.

---

## Summary — recommendation prioritization

**Tier 1 (Highest leverage, do these first):**
- **STRUCT-1** — Pull leak out of lede
- **STRUCT-2** — Cut The Players section (or reconceive it tightly)
- **STRUCT-4** — Reframe Closing para 3 to lead with system-survives-Marcus
- **CAPT-1** — Fix the contradicted Photo 6 caption

**Tier 2 (Compounds Tier 1):**
- **STRUCT-3** — Compress Sam paragraph cluster
- **STRUCT-5** — Cut "other motives" throat-clearing transition
- **STRUCT-6** — Relocate Marcus-Vic inline quote
- **STRUCT-7** — Tighten lede para 1 internal redundancy

**Tier 3 (Sentence-level after structural):**
- **VOICE-1** — "The case closed itself" cut
- **VOICE-2** — "Premium secrets sell at a premium" cut
- **VOICE-3** — "Every thread collapsed" trim
- **VOICE-4** — "I cannot help but feel" hedge fix
- **VOICE-6** — "by one read" hedge fix
- **VOICE-7** — "long half hour" replace
- **VOICE-8** — "as the timer ran out" translate
- **MECH-1 through MECH-4** — em-dash replacements
- **REDUND-5** — "Twelve hands. One absent chemist." cut

**Tier 4 (Additive — pure copy-edit gains):**
- **CAPT-2** — Add photos 9 and 12 (and optionally 5)
- **COVER-1** — Light Remi enrichment via photo 5

**Counts:**
- 7 structural moves (Tier 1-2)
- 7 voice / hedge / aphorism cuts (Tier 3)
- 4 em-dash mechanical replacements (Tier 3)
- 3 photo additions (Tier 4)
- 1 photo caption fix (Tier 1)
- ~2 redundancy callbacks (resolved by structural moves)

**If you approve the Tier 1 structural moves, the Tier 2-3 sentence-level work compounds favorably.** If you reject the structural moves (e.g., keep The Players section), the Tier 3 sentence-level fixes still apply but the redundancy issues persist.

**Anticipated word count change:** Currently ~1,400 words. Structural cuts (Players + Sam compression + "other motives" + lede tighten + Closing reframe) drop ~300-400 words. Photo additions don't add prose. Net: ~1,050-1,150 words after Cycle 2.

Per [[feedback_aln_refinement_structural_moves]] — shorter is the point. No backfill to original length.

---

## Open questions before edit plan

1. **STRUCT-2: cut The Players section, or reconceive it?** Recommend cut. If you'd rather keep it as a formal break, the reconceive-to-unasked-questions alternative is in STRUCT-2's body.
2. **STRUCT-4: reframe Closing para 3, or cut it entirely?** Recommend reframe.
3. **CAPT-2: add 2 photos (9, 12) or 3 (9, 12, 5)?** Recommend 3 — Remi gets the visual beat he otherwise doesn't get.
4. **VOICE-2 "Premium secrets sell at a premium" — cut or replace?** Recommend cut.
5. **VOICE-5 "Both of those things are true. Neither disqualifies the other"** — accept as load-bearing if Players is cut (the line relocates to a context where it lands), or sharpen if Players stays?

Once you green-light the directions, I'll build `outputs/report-052326-editplan-copyedit.md` with the specific old/new strings.
