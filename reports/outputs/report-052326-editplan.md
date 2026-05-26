# Edit Plan — Session 052326 (Cycle 1: Fact-Check Edits)

Article: `outputs/report-052326.html`
Findings: `outputs/report-052326-findings.md`
Refsheet: `outputs/report-052326-refsheet.md`

**Director-resolved open questions (2026-05-26):**
1. Quinn → he/him
2. Sam's chemist work is hers; never write "Derek" in the article
3. Paternity test was unlocked — 99.85% number stays
4. Co-CEOs are Alex + Sarah (closing must be corrected)

**Scope of this cycle:**
- All A-tagged accuracy errors
- All B-tagged boundary / remote-voice violations
- Coverage gap C2 (section nav)
- Header items H1, H2, H3

**Deferred to Cycle 2 (per [[feedback_aln_refinement_two_pass]]):**
- B12 (aphorism audit), C1 (photo placement decisions), C3 (Remi enrichment), H4 (byline remote indicator), and all sentence-level rhythm / pacing / throat-clearing observations from my end-to-end re-read.

---

## Apply order

Apply edits in **document order (top of file down)** so each subsequent Edit's `old_string` is matched against text still in place. The pronoun global subs are listed in their natural positions; I do not use `replace_all` because it risks over-application (Morgan / Sam / Quinn appear as nouns where replacing pronouns is irrelevant or wrong).

Each edit below is a paired `OLD` (existing text, unique by surrounding context) and `NEW` (proposed replacement). For multi-sentence edits I include enough context to make the match unique.

---

## Section: Hero photo caption (line 1489-1492)

### EDIT 1 — H3 (Quinn pronoun + tighten the reach beyond what the photo shows)

Addresses: H3, A4 (Quinn → he/him), and brings caption back to what's visible.

**OLD (in two places — the `alt` attribute and the `<figcaption>` text):**
```
alt="Six of the twelve. The room that voted for Quinn Sterling never included him."
```
```
<figcaption class="article-photo__caption">Six of the twelve. The room that voted for Quinn Sterling never included him.</figcaption>
```

**Decision needed:** The current text already uses `him` — matches the locked Quinn pronoun. The caption's "never included him" stretches beyond the photo (Quinn's absence isn't visible — the photo shows Ashe addressing the group). The hero caption can either:
- (a) Stay as-is (`him` is already correct after Quinn pronoun lock; the "never included" claim is the article's central tension which the hero is allowed to frame).
- (b) Tighten to what's visible: "Ashe Motoko closes his case to the room. Quinn Sterling was not in it."

**Proposed:** (b). Decision: closer to what's IN the photo (Ashe addressing) + the room/Quinn framing as a second sentence. Replace both `alt` and `<figcaption>` text.

**NEW alt:** `alt="Ashe Motoko closes his case to the room. Quinn Sterling was not in it."`
**NEW figcaption text:** `Ashe Motoko closes his case to the room. Quinn Sterling was not in it.`

---

## Section: Lede (lines 1495-1501)

### EDIT 2 — B1, B2 (REMOTE voice — Nova was not in the room)

Addresses: B1, B2. Reframes both lede paragraphs so Cassandra is explicitly remote and Ashe is the on-ground witness. Also reframes "twelve of us" → "twelve people."

**OLD:**
```
        <p>Quinn Sterling wasn&#x27;t there. The chemist the room finally settled on for Marcus Blackwood&#x27;s death never made it to his last party. Twelve of us stood around the evidence table this morning, sifting through extracted memories and labeled baggies of Psychotrophin, and the name we put on the board belonged to someone who wasn&#x27;t in the building.</p>

        <p>I was in that room. So was Ashe Motoko, who shares this byline because he did the feet-on-the-ground reporting while I worked the wires. By the time the vote landed, the company Quinn allegedly killed for had already named its new co-CEOs. The verdict and the leaked press release belong to the same morning.</p>
```

**NEW:**
```
        <p>Quinn Sterling wasn&#x27;t there. The chemist the room finally settled on for Marcus Blackwood&#x27;s death never made it to his last party. Twelve people stood around the evidence table this morning, sifting through extracted memories and labeled baggies of Psychotrophin, and the name they put on the board belonged to someone who wasn&#x27;t in the building.</p>

        <p>I wasn&#x27;t in that room. Ashe Motoko was, and he shares this byline because he did the feet-on-the-ground reporting while I worked the wires from outside. By the time the vote landed, the company Quinn allegedly killed for had already named its new co-CEOs. The verdict and the leaked offer belong to the same morning.</p>
```

**Notes:**
- "leaked press release" → "leaked offer" — the source is an offer email, not a press release. Accuracy tightening.
- The remote framing now leads the second paragraph instead of being contradicted by it.

---

## Section: The Story (lines 1502-1642)

### EDIT 3 — A5, A6 (Taylor as journalist not editor; Quinn at bar not lab; Quinn pronoun)

Addresses: A5 (line 1505 doesn't have Taylor reference; first Taylor reference is at line 1641 — separate edit), A6 (Quinn lab → bar), A4 (Quinn pronoun her → him), plus paragraph integrity.

**OLD (line 1517):**
```
        <p>A recovered memory placed Quinn in Marcus&#x27;s lab the night before, terrified of what he&#x27;d ask her to do. The blackmail trail surfaced next. Marcus had her by the throat over buried safety assessments for Psychotrophin-3A, and he was already drafting the demand for another batch.</p>
```

**NEW:**
```
        <p>A recovered memory placed Quinn at the bar on Marcus&#x27;s instruction the night before, terrified of what he was being asked to deliver. The blackmail trail surfaced next. Marcus had him by the throat over buried safety assessments for Psychotrophin-3A, and was already drafting the demand for another batch.</p>
```

---

### EDIT 4 — Ashe quote already accurate (verification only)

Line 1533 contains Ashe's deliberation quote, verbatim from director notes. No edit needed.

---

### EDIT 5 — Sarah-Alex showdown framing (already mostly OK; only minor tightening if any)

Line 1535. Verify no fact-check issue. Skim:
> "Before Quinn's name landed, two others did. Marcus's theft of Alex Reeves's NeurAI code came up first, and Alex's name went on the board. Then Alex made an impassioned defense and named Sarah Blackwood as another candidate for Marcus's old job. Sarah's name went up next. A showdown between the two women split the group for a long half hour."

**Status:** Accurate. No fact-check edit. (Cycle 2 may revisit "long half hour" — director notes don't quantify the duration; could overclaim.)

---

### EDIT 6 — B11 (Sarah's knowledge of the offer)

Addresses: B11. Tightens the "they had already been offered it" claim that pre-attributes Sarah's awareness.

**OLD (line 1566):**
```
        <p>What none of us in that room knew at the time: NeurAI&#x27;s board had already decided. After the deliberations ended, an anonymous leak reached me. The email commended Alex on her negotiation skills and offered her an interim co-CEO role alongside Sarah. The succession the room was duelling over was settled before the vote. I cannot help but feel the investigation was a front for an interview.</p>
```

**NEW:**
```
        <p>What no one at that evidence table said out loud: Alex had already been negotiating with NeurAI&#x27;s board. After the deliberations ended, an anonymous leak reached me. The email commended Alex on her negotiation skills and offered her an interim co-CEO role alongside Sarah. The succession the room was duelling over was being decided in parallel. I cannot help but feel the investigation was a front for an interview.</p>
```

**Notes:**
- Drops "What none of us in that room knew" — Nova wasn't in the room (REMOTE voice fix overlaps with B1/B2).
- "had already decided" → "being decided in parallel" — the leak proves an offer was extended, not that the final decision was sealed before the vote. More defensible.

---

### EDIT 7 — A7, A8, A3 (Sam = chemist; never write "Derek"; Sam pronoun)

Addresses: A7 (Derek source misattribution → reframe entirely without surfacing Derek), A8 (chemists plural → singular), A3 (Sam pronoun he's → she's).

**OLD (lines 1567-1569):**
```
        <p>The chemistry case the room built against Quinn opened back up the moment anyone really looked at the baggies. Psychotrophin-1A through 10E. A whole formulation tree, not a single compound. Sam Thorne&#x27;s name came up as the source of the recreational supply at Marcus&#x27;s parties. He&#x27;s also in the Stanford Four. So is Mel. So was Marcus.</p>

        <p>Sam&#x27;s own recovered diary, exposed this morning, names Derek as the chemist who built the formulation tree off Quinn&#x27;s original synthesis. The Psychotrophin-3B batch that extracted everyone&#x27;s memories last night was Derek&#x27;s reformulation. The room treated the labeled baggies as Quinn-corroborating. They were also Derek-corroborating, and Derek wasn&#x27;t in the building either.</p>
```

**NEW:**
```
        <p>The chemistry case the room built against Quinn opened back up the moment anyone really looked at the baggies. Psychotrophin-1A through 10E. A whole formulation tree, not a single compound. Sam Thorne&#x27;s name came up as the source of the recreational supply at Marcus&#x27;s parties. She&#x27;s also in the Stanford Four. So is Mel. So was Marcus.</p>

        <p>Sam&#x27;s own recovered diary, exposed this morning, places her squarely inside Marcus&#x27;s drug supply. &quot;It&#x27;s probably the shit I&#x27;m making for him,&quot; she wrote of Marcus three days before the party. The labeled baggies tell the same story in inventory form: PT-1A through 10E, a formulation tree built off Quinn&#x27;s original synthesis. The PT-3B batch that extracted everyone&#x27;s memories last night was Sam&#x27;s reformulation. The room treated the baggies as Quinn-corroborating. They were also Sam-corroborating. Sam was in the building.</p>
```

**Notes:**
- "Derek" is removed entirely. The PT baggies are now attributed to Sam directly. The article does not surface or explain any alias.
- Sam's diary quote ("It's probably the shit I'm making for him") is direct from the 2/18/27 entry — supported.
- "Sam was in the building" — sharp closer that lands the thesis without overreaching.

---

### EDIT 8 — B9, A3 (Sam contributed... reframe + pronoun)

Addresses: B9 (counterfactual deliberation behavior unsupported by director), A3 (Sam pronoun his → her).

**OLD (line 1581):**
```
        <p>Sam contributed to the case against Quinn without ever raising the part of his own recovered memory where Marcus, drugged out of his mind on Sam&#x27;s party blend, confessed the BizAI algorithm was Alex&#x27;s work. Mel walked the group through Sarah&#x27;s nearly empty shared bank account without walking it through her own Stanford Four texts from earlier in the morning. The chemists in the room helped convict the chemist who wasn&#x27;t.</p>
```

**NEW:**
```
        <p>Sam Thorne&#x27;s name came up during the drug discussion. The room flagged her as the recreational supplier but did not advance her to the suspect board. Her own recovered memory from 10:44 PM shows Marcus, drugged out of his mind on her usual blend, confessing the BizAI algorithm was Alex&#x27;s work. Mel Nilsson&#x27;s recovered memory walks through Sarah&#x27;s nearly empty shared bank account; her email to her law firm shows the divorce was already a retained case the morning Marcus died. The chemist in the room helped convict the chemist who wasn&#x27;t.</p>
```

**Notes:**
- Sam pronouns: "Sam... her... her own recovered memory" — corrected from his.
- "Sam contributed to the case against Quinn without ever raising" → softened to what's actually sourced (room flagged her, didn't advance; her exposed memory is what Nova can quote).
- Same correction applied to Mel framing.
- Plural "chemists" → singular "chemist." Sam is the chemist.

---

### EDIT 9 — B3, A2 (REMOTE voice + Morgan pronouns)

Addresses: B3 (I watched), A2 (Morgan she → he), B6 (comparative "more than evidence table" → director's "frequently").

**OLD (line 1583):**
```
        <p>While the chemistry argument ran, a different network was operating. Morgan Reed spent more of the morning at Blake&#x27;s station than at the evidence table. I watched her work, then I watched her come back to the room and add nothing to the case against Marcus&#x27;s lobbying architecture.</p>
```

**NEW:**
```
        <p>While the chemistry argument ran, a different network was operating. Ashe relayed that Morgan Reed was a fixture at Blake&#x27;s station this morning — back to it between rounds, in conversation with the Valet more than with the rest of the room. When Morgan rejoined the evidence table, he added nothing to the case against Marcus&#x27;s lobbying architecture.</p>
```

**Notes:**
- "I watched" → "Ashe relayed" (REMOTE voice fix).
- "spent more of the morning at Blake's station than at the evidence table" → "fixture at Blake's station... in conversation with the Valet more than with the rest of the room" — still a relative claim but more defensible from "frequently" + director's specific note that Morgan was talking to Blake.
- "her work / her come back" → "Morgan rejoined" / "he added" (Morgan = he).

---

### EDIT 10 — A2 (Morgan pronouns), B10 hold (Morgan suspect board)

Addresses: A2 (Morgan she → he in the paragraph about her 12:40 AM memory).

**OLD (line 1595):**
```
        <p>Morgan&#x27;s recovered memory from 12:40 AM at the party shows her sitting down across from journalist Taylor Chase with the recorder running, spilling the worst things she had on Marcus. The lobbyist who built Marcus&#x27;s public narrative as the principled face of AI ethics had decided last night to feed that narrative to the press, item by item. She did not raise this contribution at the suspect board this morning.</p>
```

**NEW:**
```
        <p>Morgan&#x27;s recovered memory from 12:40 AM at the party shows him sitting down across from journalist Taylor Chase with the recorder running, spilling the worst things he had on Marcus. The lobbyist who built Marcus&#x27;s public narrative as the principled face of AI ethics had decided last night to feed that narrative to the press, item by item. His name never reached the suspect board this morning.</p>
```

**Notes:**
- All Morgan pronouns corrected.
- "She did not raise this contribution at the suspect board" → "His name never reached the suspect board" — anchored to the whiteboard observation (Morgan is not on the suspect ranking list) rather than a counterfactual about deliberation behavior.

---

### EDIT 11 — B4, B5 (Vic's untouched-token attribution)

Addresses: B4, B5. Vic's pre-investigation decision came from vic002 (untouched). Reframe to what Nova can actually source.

**OLD (line 1607):**
```
        <p>Vic Kingsley was outside on the sidewalk by then, in her own recovered memory, pressing a designer scarf against Marcus&#x27;s bleeding nose. She&#x27;d already decided to replace him at NeurAI. The fight on the whiteboard between Sarah and Alex this morning was a duel over a chair Vic had moved someone else into the night before.</p>
```

**NEW:**
```
        <p>Vic Kingsley was outside on the sidewalk by then, in her own recovered memory, pressing a designer scarf against Marcus&#x27;s bleeding nose. The whiteboard preserved the line the room itself wrote down: &quot;Alex is in, Marcus is out.&quot; The fight between Sarah and Alex this morning was a duel over a seat that someone — investor or otherwise — had already begun arranging to fill.</p>
```

**Notes:**
- Removes the direct claim about Vic's decision (which depends on untouched vic002).
- Replaces with the whiteboard observation (which is reportable — the whiteboard literally has "Alex is in, Marcus is out" written on it).
- Replaces "Vic had moved someone else into" with the boundary-safe "someone — investor or otherwise — had already begun arranging" — preserves the thrust without attributing to Vic specifically what Nova cannot source.

---

### EDIT 12 — A5 (Taylor as journalist, not editor) — first instance

Addresses: A5. This is the first occurrence in The Story; another occurs in The Players.

**OLD (line 1641):**
```
        <p>His investigation of Marcus&#x27;s memory experiments was killed three weeks before the party. The editor who buried it was Taylor Chase, the same Taylor Chase whose recorder, in Morgan&#x27;s recovered memory from 12:40 AM, was rolling while Morgan spilled the dirt the night Marcus died. The same name appears on both sides of the leverage. The room cast its vote for Quinn, and in the same hour NeurAI&#x27;s announcement landed. Every thread collapsed into a single observation: the verdict cleared the room of everyone in it.</p>
```

**NEW:**
```
        <p>His investigation of Marcus&#x27;s memory experiments was killed three weeks before the party. The journalist who arranged the burial was Taylor Chase, the same Taylor Chase whose recorder, in Morgan&#x27;s recovered memory from 12:40 AM, was rolling while Morgan spilled the dirt the night Marcus died. The same name appears on both sides of the leverage. The room cast its vote for Quinn, and in the same hour NeurAI&#x27;s offer landed. Every thread collapsed into a single observation: the verdict cleared the room of everyone in it.</p>
```

**Notes:**
- "editor" → "journalist who arranged the burial" (per Taylor-Marcus story-burial email — Taylor reported "Done. Editor thinks it needs 'more substantiation'" to Marcus, indicating Taylor leveraged the editor to bury, not that Taylor was the editor).
- "NeurAI's announcement landed" → "NeurAI's offer landed" — leak was an offer email, not an announcement.

---

## Section: Follow the Money (lines 1644-1654)

### EDIT 13 — B7 (Blake account decoding)

Addresses: B7. Demote the "Valet getting paid by Valet's employers" claim to a boundary-safe observation.

**OLD (line 1653):**
```
        <p>Blake himself appears on his own ledger at $500,000 across a single transaction. The Valet getting paid by the Valet&#x27;s employers is the closest thing the night offered to a self-portrait of the institution Morgan and Vic were quietly working with. The house collected.</p>
```

**NEW:**
```
        <p>Blake himself appears on his own ledger at $500,000 across a single transaction. The morning&#x27;s first burial. A token owned by Sarah Blackwood, routed at 9:21 PM into an account whoever operated it chose to label after the Valet. The house, by one read, collected on its own table.</p>
```

**Notes:**
- Removes the institutional decoding ("Morgan and Vic were quietly working with").
- Anchors in observable facts: account is named "Blake," contains Sarah's first-burial token sar004, was at 9:21 PM.
- Preserves the rhetorical "house collected" with a hedge ("by one read") that doesn't claim the operator's identity.

---

## Section: The Players (lines 1656-1671)

### EDIT 14 — A5 (Taylor as journalist not editor), Ashe paragraph

Addresses: A5 (second instance).

**OLD (line 1659):**
```
        <p>Ashe Motoko carried the room. He synthesized the chemistry argument, walked the group through Quinn&#x27;s blackmail email, and held the line when Alex&#x27;s name went up on the board. He shares this byline because he earned it. He also held the strongest undisclosed grievance of anyone in the room. His investigation of Marcus&#x27;s memory experiments was killed before the party by Taylor Chase, the same editor Morgan&#x27;s memory shows feeding dirt to last night. Both of those things are true. Neither disqualifies the other.</p>
```

**NEW:**
```
        <p>Ashe Motoko carried the room. He synthesized the chemistry argument, walked the group through Quinn&#x27;s blackmail email, and held the line when Alex&#x27;s name went up on the board. He shares this byline because he earned it. He also held the strongest undisclosed grievance of anyone in the room. His investigation of Marcus&#x27;s memory experiments was killed before the party by Taylor Chase — the same Taylor Chase whose recorder, in Morgan&#x27;s recovered memory, was running while Morgan spilled the dirt the night Marcus died. Both of those things are true. Neither disqualifies the other.</p>
```

**Notes:** "the same editor" → "the same Taylor Chase" — drops the editor misattribution without restating the (now in EDIT 12) journalist-arranged-burial detail.

---

### EDIT 15 — B11 (Sarah/Alex offer knowledge)

Addresses: B11. Soften the joint-knowledge claim.

**OLD (line 1666):**
```
        <p>Sarah Blackwood barely spoke about her own marriage this morning. Alex Reeves described the punch Sarah pulled her off of matter-of-factly, the way someone tells a story they have already told themselves enough times to flatten. Both of them ended up named for Marcus&#x27;s job during the deliberations and neither said publicly what the leaked email later confirmed. They had already been offered it.</p>
```

**NEW:**
```
        <p>Sarah Blackwood barely spoke about her own marriage this morning. Alex Reeves described the punch Sarah pulled her off of matter-of-factly, the way someone tells a story they have already told themselves enough times to flatten. Both of them ended up named for Marcus&#x27;s job during the deliberations. Alex was already negotiating with NeurAI&#x27;s board by the leaked email&#x27;s own admission — &quot;negotiation skills&quot; was the board&#x27;s phrase, not mine.</p>
```

**Notes:**
- Drops the joint-they-had-been-offered claim, which over-attributes Sarah's pre-vote knowledge.
- Anchors Alex's prior negotiations in the email's own language. Sarah's knowledge is left open.

---

### EDIT 16 — A2 (Morgan pronouns), B6, B10 (Morgan comparative + Vic counterfactual)

Addresses: A2, B6, B10.

**OLD (line 1668):**
```
        <p>Mel Nilsson walked the room through Sarah&#x27;s nearly empty shared bank account without walking it through her own Stanford Four texts. Sam Thorne helped build the case against Quinn while sitting on the memory of Marcus drugged-confessing the BizAI fraud. Morgan Reed spent more time talking to Blake than to any of the eleven other players in the room. Vic Kingsley stayed quiet about the sidewalk.</p>
```

**NEW:**
```
        <p>Mel Nilsson&#x27;s memory walks the divorce. Sam Thorne&#x27;s exposed memory walks the BizAI confession. Both contributions surfaced in the morning&#x27;s record but neither paragraph followed Sam&#x27;s name to the suspect board. Morgan Reed was a fixture at Blake&#x27;s station, frequently in conversation with the Valet and rarely with the rest of the room. Vic Kingsley&#x27;s name didn&#x27;t reach the suspect board at all.</p>
```

**Notes:**
- Drops "without walking it through her own Stanford Four texts" (counterfactual unsupported by director observation).
- Drops "sitting on the memory" framing (counterfactual unsupported).
- Pulls Sam's pronoun out of the construction entirely (now anchored to her exposed memory content).
- "more time talking to Blake than to any of the eleven other players" → "fixture at Blake's station, frequently in conversation with the Valet and rarely with the rest of the room" — preserves the editorial weight while staying within director's "frequently."
- "Vic Kingsley stayed quiet about the sidewalk" → "Vic Kingsley's name didn't reach the suspect board" — anchored to whiteboard observation, not deliberation-counterfactual.

---

## Section: What's Missing (lines 1673-1681)

### EDIT 17 — A1 (CRITICAL: wrong co-CEOs)

Addresses: A1 — first occurrence of the Sarah+Vic error.

**OLD (line 1678):**
```
        <p>Five threads got logged and dropped this morning. Who synthesized the specific Psychotrophin-3B batch used at the party, Quinn&#x27;s lab or Derek&#x27;s reformulation. When NeurAI&#x27;s board actually decided on Sarah and Vic as co-CEOs, and who drafted the leak that landed in my inbox after the vote. Who B is on a burial ledger that dwarfs every other account. What was in Ashe&#x27;s expose before Taylor and Marcus killed it. Why Phil Kowalski&#x27;s name sits on a 2020 IOU for an &#x27;undefined favor&#x27; and appears nowhere else.</p>
```

**NEW:**
```
        <p>Five threads got logged and dropped this morning. Who actually mixed the specific Psychotrophin-3B batch that extracted everyone&#x27;s memories last night, and when. When NeurAI&#x27;s board actually decided on Alex and Sarah as co-CEOs, and who drafted the leak that landed in my inbox after the vote. Who B is on a burial ledger that dwarfs every other account. What was in Ashe&#x27;s expose before Taylor and Marcus killed it. Why Phil Kowalski&#x27;s name sits on a 2020 IOU for an &#x27;undefined favor&#x27; and appears nowhere else.</p>
```

**Notes:**
- "Sarah and Vic" → "Alex and Sarah" (correct co-CEOs).
- "Quinn's lab or Derek's reformulation" reframed to "Who actually mixed the specific Psychotrophin-3B batch... and when" — removes the "Derek" reference while preserving the open question. The reframe keeps the lab-switch arc's unfinished business as a Cycle-2-pointing question.

---

## Section: Closing (lines 1683-1692)

### EDIT 18 — A4 (Quinn pronouns), tighten the verdict-stands paragraph

Addresses: A4 — Quinn her → him, and clean up "her control" / "her documented blackmail relationship" which read as Quinn doing the blackmail (he was being blackmailed).

**OLD (line 1685):**
```
        <p>The accusation stands. The room concluded Quinn Sterling killed Marcus Blackwood through her control of the Psychotrophin-3A supply chain and her documented blackmail relationship, and law enforcement has agreed enough to open a manhunt. The evidence supports it. So does the chemistry timeline. The verdict is not wrong on its face.</p>
```

**NEW:**
```
        <p>The accusation stands. The room concluded Quinn Sterling killed Marcus Blackwood through his control of the Psychotrophin-3A synthesis Marcus was blackmailing him to produce, and law enforcement has agreed enough to open a manhunt. The evidence supports it. So does the chemistry timeline. The verdict is not wrong on its face.</p>
```

**Notes:**
- Quinn → his/him.
- "her documented blackmail relationship" → "the Psychotrophin-3A synthesis Marcus was blackmailing him to produce" — now correctly frames Quinn as the blackmail VICTIM rather than perpetrator. Source: qui002.

---

### EDIT 19 — Closing middle paragraph (A2 / B-style cleanup)

Status: Re-read the paragraph at line 1687 for any pronoun issues.

> "What the verdict does not account for is everyone else in that room. The succession was decided before the vote. Morgan, who built Marcus's narrative as the face of principled AI, was already dismantling it on a journalist's recorder. The chemists with access to the formulation tree convicted the chemist who didn't ship the final batch. The journalist whose career Marcus destroyed led the prosecution. Flip's loan shark is still waiting. Jess's paternity test is still sealed. Kai's instructions from Marcus are still in an inbox nobody asked about. None of those people made the suspect board for more than half an hour."

Issues:
- "Morgan" — no pronoun in this sentence; OK.
- "The chemists with access to the formulation tree convicted the chemist" — A8 (chemists plural → singular).
- "Jess's paternity test is still sealed" — small accuracy nit: the test was unlocked during play (per director). "Sealed" is figurative for "not public yet," defensible journalistically. Hold.

### EDIT 19 — A8 (chemists plural → singular)

**OLD (line 1687):**
```
        <p>What the verdict does not account for is everyone else in that room. The succession was decided before the vote. Morgan, who built Marcus&#x27;s narrative as the face of principled AI, was already dismantling it on a journalist&#x27;s recorder. The chemists with access to the formulation tree convicted the chemist who didn&#x27;t ship the final batch. The journalist whose career Marcus destroyed led the prosecution. Flip&#x27;s loan shark is still waiting. Jess&#x27;s paternity test is still sealed. Kai&#x27;s instructions from Marcus are still in an inbox nobody asked about. None of those people made the suspect board for more than half an hour.</p>
```

**NEW:**
```
        <p>What the verdict does not account for is everyone else in that room. The succession was being settled in parallel with the vote. Morgan, who built Marcus&#x27;s narrative as the face of principled AI, was already dismantling it on a journalist&#x27;s recorder. The chemist with access to the formulation tree convicted the chemist who didn&#x27;t ship the final batch. The journalist whose career Marcus destroyed led the prosecution. Flip&#x27;s loan shark is still waiting. Jess&#x27;s paternity test is in evidence. Kai&#x27;s instructions from Marcus are still in an inbox nobody asked about. None of those people made the suspect board for more than half an hour.</p>
```

**Notes:**
- "chemists" → "chemist" (singular, Sam).
- "decided before the vote" → "being settled in parallel with the vote" — more defensible timing claim, matches EDIT 6 reframe.
- "paternity test is still sealed" → "paternity test is in evidence" — paternity test was unlocked during play; "in evidence" lands the "the room had it and walked past" point without the "sealed" inaccuracy.

---

### EDIT 20 — A1 (CRITICAL: wrong co-CEOs in closing thesis paragraph)

Addresses: A1 — second and most load-bearing instance of the Sarah+Vic error.

**OLD (line 1689):**
```
        <p>Sarah Blackwood and Vic Kingsley will run NeurAI by Monday. The technology that made Marcus&#x27;s death investigable, the same technology that made it possible to extract memories from twelve people without their consent in the first place, will now belong to the woman he was divorcing and the investor who was already removing him. The system Marcus built survived him by absorbing every grievance the room declined to name.</p>
```

**NEW:**
```
        <p>Alex Reeves and Sarah Blackwood will run NeurAI by Monday. The technology that made Marcus&#x27;s death investigable, the same technology that made it possible to extract memories from twelve people without their consent in the first place, will now belong to the partner he stole from and the wife he was divorcing. Vic Kingsley, the investor who was already removing him, ran the board that signed the offer. The system Marcus built survived him by absorbing every grievance the room declined to name.</p>
```

**Notes:**
- "Sarah Blackwood and Vic Kingsley" → "Alex Reeves and Sarah Blackwood" — corrects the central thesis sentence.
- "the woman he was divorcing and the investor who was already removing him" → "the partner he stole from and the wife he was divorcing" — describes Alex (partner he stole from) and Sarah (wife). Adds Vic's role as the board-chair who signed the offer in a separate sentence to preserve the article's analytical claim about Vic without falsely making her a co-CEO.

---

## Section: Sidebar mini-cards (line 1851 onward)

### EDIT 21 — A4 (Quinn pronoun in sidebar mini)

Addresses: A4 in the sidebar mini summary.

**OLD (line 1858):**
```
          <div class="evidence-card-mini__summary">Quinn&#x27;s 9:59 PM memory: Marcus demands she bring PT-3A to the bar at 10. She&#x27;s terrified.</div>
```

**NEW:**
```
          <div class="evidence-card-mini__summary">Quinn&#x27;s 9:59 PM memory: Marcus demands he bring PT-3A to the bar at 10. He&#x27;s terrified.</div>
```

---

### EDIT 22 — A2 (Morgan pronoun in sidebar mini)

Addresses: A2 in the sidebar mini summary.

**OLD (line 1886):**
```
          <div class="evidence-card-mini__summary">Morgan&#x27;s 12:40 AM memory: she sits down with Taylor&#x27;s recorder and starts spilling on Marcus.</div>
```

**NEW:**
```
          <div class="evidence-card-mini__summary">Morgan&#x27;s 12:40 AM memory: he sits down with Taylor&#x27;s recorder and starts spilling on Marcus.</div>
```

---

## Section: Section nav (line 1911-1919)

### EDIT 23 — C2 (section nav missing Closing)

Addresses: C2.

**OLD:**
```
        <ul class="section-nav__list">
          <li><a href="#the-story" class="section-nav__link">The Story</a></li>
          <li><a href="#follow-the-money" class="section-nav__link">Follow the Money</a></li>
          <li><a href="#the-players" class="section-nav__link">The Players</a></li>
          <li><a href="#whats-missing" class="section-nav__link">What&#x27;s Missing</a></li>
        </ul>
```

**NEW:**
```
        <ul class="section-nav__list">
          <li><a href="#the-story" class="section-nav__link">The Story</a></li>
          <li><a href="#follow-the-money" class="section-nav__link">Follow the Money</a></li>
          <li><a href="#the-players" class="section-nav__link">The Players</a></li>
          <li><a href="#whats-missing" class="section-nav__link">What&#x27;s Missing</a></li>
          <li><a href="#closing" class="section-nav__link">Closing</a></li>
        </ul>
```

---

## Section: Headline / Deck — H1, H2 holds for director call

### Headline (line 1463) — H1 decision still open

Current: **"NeurAI Named Co-CEOs This Morning. Twelve People Just Convicted the Chemist Who Wasn't There."**

The headline's "Named" reads as journalistic shorthand for "tapped." Given the closing now correctly identifies Alex and Sarah, and the lede frames the leak as an OFFER, the headline can stay if you're comfortable that "Named" reads as "moved to appoint." If you want to soften:

- **Option A (keep):** "NeurAI Named Co-CEOs This Morning. Twelve People Just Convicted the Chemist Who Wasn't There."
- **Option B (tighter, names the candidates):** "NeurAI Tapped Alex Reeves and Sarah Blackwood This Morning. Twelve People Just Convicted the Chemist Who Wasn't There."
- **Option C (offer-language):** "NeurAI Offered Co-CEO Roles to Alex Reeves and Sarah Blackwood This Morning. Twelve People Just Convicted the Chemist Who Wasn't There."

**My recommendation: A or B.** A is punchier and reads as a journalistic claim that the imminent appointment counts as the news. B is more transparent. C is the most accurate but loses some force.

**Awaiting your call before applying.**

### Deck (line 1465) — H2 status

Current: **"Quinn Sterling wasn't at Marcus Blackwood's last party. By the time twelve investigators voted on his absence, the company he allegedly killed for had already settled the succession question."**

After the fact-check edits land, the deck reads cleanly: Quinn pronouns are already `his`; "settled the succession question" pairs with the lede's "named its new co-CEOs" and the closing's "Alex Reeves and Sarah Blackwood will run NeurAI by Monday." If you change the headline timing language (H1 option B or C), consider also softening "had already settled" → "was already settling" for consistency.

**Awaiting H1 decision; deck change is conditional.**

---

## Summary

**24 edits to apply (Edits 1-23, plus the H1 headline call once you decide).**

Edits 1-23 are all locked. The only deferred decision is H1 (headline keep/soften), which I'll apply as your final word.

**Apply order is top-of-file → bottom-of-file as numbered above.** No dependencies between edits other than that order.

**Verification after apply:**
- Open the HTML in a browser; confirm rendering is intact (no broken markup).
- Re-read the fact-corrected article end-to-end with fresh eyes — this is the start of Cycle 2 (copy-edit).

**Cycle 2 will examine the fact-corrected article holistically, not the original.** Per [[feedback_aln_refinement_two_pass]], copy-edit observations from my first read are not folded in here. After you approve and we apply these 23 (+1) edits, I do the Cycle 2 read.
