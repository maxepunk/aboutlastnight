# Findings — Session 052326 (Cycle 1: Fact-Check Only)

Article: `outputs/report-052326.html`
Reference: `outputs/report-052326-refsheet.md`
Editorial intent: pipeline ran to completion with **no rejection feedback** on arcs, outline, or article. All 5 arcs accepted as proposed, no rescued items. Pure pipeline output — nothing user-emphasized to defend.

**Tagging convention:**
- **A** = Accuracy / factual error against source data
- **B** = Boundary violation (evidence-layer or voice / remote-Cassandra)
- **C** = Coverage gap (missing roster beat, missing director quote, photo under-use)
- **H** = Header / headline / deck / byline / hero caption issue

Copy-edit observations (pacing, throat-clearing, aphorism audit, etc.) are deferred to Cycle 2 per [[feedback_aln_refinement_two_pass]].

---

## Open questions for director (resolve before edit plan)

1. **Quinn's pronouns.** Not specified in your inputs. Article uses inconsistent pronouns: `she/her` at lines 1517, 1685, 1858 and `him` at lines 1492, 1676. Quinn is an NPC and not played this session, so player-pronoun inheritance doesn't help. Default canonical? Recommend "they/them" or "he/him" — pick one and we apply globally.
2. **Sam ↔ Derek relationship.** Paper-evidence PsychoTrophin baggies prop reads: "Different formulations that Derek created based on the compound synthesized by Quinn." The prop is owned by Sam Thorne. Sam's character sheet wasn't visible in the paper-evidence pages I read. Is **Derek = Sam** (alias / real name / nickname)? If yes, the article's "Derek's reformulation" point reduces to a Sam-implicates-Sam observation, which is much sharper. If not, "Derek" is a never-met NPC who reformulated PT compounds for Marcus. Need confirmation before we keep or rewrite the lab-switch beats.
3. **Was paper evidence "Paternity Test for Sarah" unlocked during play?** It's marked `(locked)` in the Notion source. Article cites the 99.85% probability number (line 1621) and references the test by content. If unlocked, fine. If still locked at deliberation end, article can describe its existence (per Sam's diary) but cannot quote the percentage.
4. **NeurAI co-CEOs: which two?** Source says "an offer email commending Alex on her negotiation skills and offering her an interim co-CEO role along with Sarah." That parses as **Alex + Sarah**. Article body uses Alex + Sarah (line 1565, 1666). Article closing uses **Sarah + Vic** (lines 1678, 1689). Confirm Alex + Sarah is correct and we fix the closing.

---

## A — Accuracy / Factual Errors

### A1. CRITICAL: Wrong co-CEOs named in two closing paragraphs

**Where:** Line 1678 ("When NeurAI's board actually decided on Sarah and Vic as co-CEOs"); Line 1689 ("Sarah Blackwood and Vic Kingsley will run NeurAI by Monday").

**Source:** Director note: "offer email commending Alex on her negotiation skills and offering her an interim co-CEO role along with Sarah." Co-CEOs are **Alex + Sarah**. Vic Kingsley is the VC funder, not a CEO candidate.

**Severity:** Highest. The closing's thesis-load sentence is factually wrong. Internal contradiction with body (line 1565: "an interim co-CEO role alongside Sarah" — Alex receiving the offer).

**Proposed fix:** Replace "Sarah and Vic" / "Sarah Blackwood and Vic Kingsley" with "Alex and Sarah" / "Alex Reeves and Sarah Blackwood." The closing's analytical claim about Vic (the investor who was already removing Marcus) can be preserved in a separate sentence: "Vic Kingsley, the investor who was already removing him, ran the board that issued the offer."

---

### A2. CRITICAL: Pronoun — Morgan referred to as she/her

**Where:** Lines 1583 ("I watched her work, then I watched her come back to the room"); 1595 ("Morgan's recovered memory... shows her sitting down across from journalist Taylor Chase... she begins to spill... She did not raise this contribution"); sidebar mini 1886 ("she sits down with Taylor's recorder").

**Source:** Your roster input specified `Morgan(he)`. All Morgan references must be **he/him**.

**Proposed fix:** Replace `her → his/him`, `she → he` for every Morgan reference. Cross-check Morgan's character sheet description ("a Tech lobbyist who translates chaos into talking points") for any other pronoun slip.

---

### A3. CRITICAL: Pronoun — Sam referred to as he in The Story

**Where:** Line 1567: "Sam Thorne's name came up as the source of the recreational supply at Marcus's parties. **He's** also in the Stanford Four."

**Source:** Your roster input specified `Sam(she)`. Sam's player is she/her.

**Proposed fix:** "He's also in the Stanford Four" → "She's also in the Stanford Four." Scan all Sam references for any other slip (lines 1568-1569, 1581 look OK but verify on apply).

---

### A4. Pronoun inconsistency — Quinn

**Where:** Lines 1517 ("terrified of what he'd ask **her** to do"), 1685 ("**her** control of the Psychotrophin-3A supply chain"), sidebar 1858 ("Marcus demands **she** bring PT-3A... **She's** terrified") use feminine. Lines 1676 ("active manhunt to bring **him** in"), 1492 (hero caption: "never included **him**") use masculine.

**Source:** No pronoun specified for Quinn (NPC, not played this session).

**Proposed fix:** Once director picks a pronoun, apply globally. Recommend they/them as the safest NPC default if no in-fiction pronoun is established. Pending answer to Open Question #1.

---

### A5. Taylor Chase misidentified as the editor who buried Ashe's expose

**Where:** Line 1641 ("The editor who buried it was Taylor Chase"); Line 1659 ("Taylor Chase, the same editor Morgan's memory shows feeding dirt to last night").

**Source:** Paper evidence "Taylor <> Marcus Ashe Story Burial Email" reads (from Taylor to Marcus): "Done. Ashe's expose on your 'memory experiments' won't see daylight. **Editor thinks it needs 'more substantiation.' She'll be reassigned to lifestyle by Monday.**" Taylor is reporting to Marcus that **the editor (a separate person)** killed the story. Also Taylor wrote the SVBJ Kingsley Fund article (byline "By Taylor Chase, line-word-letter") and got the NeurAI exclusive — clearly a journalist, not an editor.

**Proposed fix:** Reframe both instances. Taylor is the **journalist who arranged for the editor to bury it**, in exchange for the NeurAI exclusive. Specifically:
- Line 1641: "The journalist who arranged the burial was Taylor Chase, the same Taylor Chase whose recorder, in Morgan's recovered memory from 12:40 AM..."
- Line 1659: "Taylor Chase, the same Taylor Chase Morgan's memory shows feeding dirt to last night."

---

### A6. Quinn placed in Marcus's lab; source places meeting at the bar

**Where:** Line 1517: "A recovered memory placed Quinn in Marcus's lab the night before, terrified of what he'd ask her to do."

**Source:** qui002 (the cited memory) ends: "MARCUS wants you to bring him another batch of it tonight. You're to meet him at the bar at 10." The meeting was scheduled at **the bar**, not the lab. No exposed memory places Quinn in Marcus's lab.

**Proposed fix:** Replace "in Marcus's lab the night before" with "scheduled to meet Marcus at the bar at 10 PM" or simply "at the party the night before."

---

### A7. Sam's diary "names Derek" — wrong source

**Where:** Line 1569: "Sam's own recovered diary, exposed this morning, names Derek as the chemist who built the formulation tree off Quinn's original synthesis."

**Source:** The four Sam diary entries (Feb 17-20, 2027) describe Marcus's deteriorating state, the paternity test, and Sam's drug-making, but do NOT name Derek. The **PsychoTrophin baggies prop** description says: "Different formulations that Derek created based on the compound synthesized by Quinn. Psychotrophin3B is the formulation that was used to extract party-goers' memories on Feb 21, 2027."

**Proposed fix:** Attribute correctly. Replace "Sam's own recovered diary, exposed this morning, names Derek" with "The labeled baggies of Psychotrophin — recovered from the lab and reading PT-1A through 10E — were tagged as Derek's reformulations of Quinn's original synthesis." Or, if Open Question #2 confirms Sam = Derek, the sentence can be sharpened to that revelation.

**Dependency:** Resolution of Open Question #2 affects how this is rewritten.

---

### A8. "Chemists" plural in closing — only Sam is a chemist in the room

**Where:** Line 1687: "The chemists with access to the formulation tree convicted the chemist who didn't ship the final batch."

**Source:** Only Sam is a chemist among the 12 roster players. Mel is a divorce attorney (per Mel's email to her law firm and character sheet). Nat is a documentarian/filmmaker (per nat001 "your camera catches Mel doing a backflip"). Marcus is the dead victim. Quinn is the absent accused. Plural "chemists" implies multiple in-room chemists; there is one.

**Proposed fix:** Singular: "The chemist with access to the formulation tree convicted the chemist who didn't ship the final batch." (Or, if Sam = Derek per Open Question #2, the line becomes much sharper as-is — the reformulator was in the room.)

---

### A9. Pronoun — Quinn in the sidebar mini

**Where:** Sidebar mini line 1858: "Marcus demands she bring PT-3A to the bar at 10. She's terrified."

Covered under A4. Apply consistent pronoun.

---

### A10. Marcus's "I'm worried about what Vic knows" quote attributed to Sam's diary entry of 2/17/27

**Where:** Line 1662-1663: inline quote ascribed to "Marcus Blackwood, recorded in Sam's diary, 2/17/27."

**Source:** Sam's diary entry 2/17/27 reads: "M was off his head when I ran into him at the lab today. He has been there more and more often lately. He told me 'I'm worried about what Vic knows. I Wish I could remember that last convo with them, but my memory is not the best.'"

**Status:** **Accurate.** Direct quote, properly sourced.

---

### A11. "$7.46 million" total — internally consistent but conflicts with orchestrator's `totalBuried` ($7.19M)

**Where:** Lines 1647, 1680 (closing), 1767 (mobile tracker total), 1847 (sidebar tracker total).

**Source:** Sum of all 9 shell-account totals = $7,460,000 (matches sidebar tracker exactly). Orchestrator's `totalBuried` field reports $7,190,000 — sum of sale transactions ONLY, excluding adjustments. Article uses end-of-day totals (with adjustments), which is what the sidebar shows. Internally consistent.

**Status:** Accurate as written. Note for reference only.

---

## B — Boundary Violations (Evidence + Remote-Voice)

### B1. REMOTE voice — "I was in that room"

**Where:** Line 1499: "I was in that room. So was Ashe Motoko, who shares this byline because he did the feet-on-the-ground reporting while I worked the wires."

**Source:** `session-config.json reportingMode: "remote"`. Director note: "Cassandra was NOT present in person during this investigation." Your reinforcement in chat: Cassandra wrote the article remotely, no first-person presence verbs for the investigation.

**Proposed fix:** "I wasn't in that room. Ashe Motoko was, and he shares this byline because he did the feet-on-the-ground reporting while I worked the wires from outside." (Or equivalent that lands the remote framing as central, not contradicted.)

---

### B2. REMOTE voice — "Twelve of us stood around the evidence table this morning"

**Where:** Line 1497: "Twelve of us stood around the evidence table this morning, sifting through extracted memories and labeled baggies of Psychotrophin, and the name we put on the board belonged to someone who wasn't in the building."

**Source:** Same as B1. "Of us" / "we put on the board" places Nova in the room.

**Proposed fix:** "Twelve people stood around the evidence table this morning, sifting through extracted memories and labeled baggies of Psychotrophin. The name they put on the board belonged to someone who wasn't in the building."

---

### B3. REMOTE voice — "I watched her work, then I watched her come back to the room"

**Where:** Line 1583 (about Morgan): "I watched her work, then I watched her come back to the room and add nothing to the case against Marcus's lobbying architecture."

**Source:** Cassandra was remote. Cannot have visually witnessed Morgan in-person.

**Proposed fix:** Replace direct-witness verbs with relayed framing. Two options:
- "Ashe reported Morgan working the burial market, then coming back to the room and adding nothing to the case against Marcus's lobbying architecture."
- "From what Ashe relayed, Morgan worked the burial market for a stretch, then returned to the room and added nothing to the case against Marcus's lobbying architecture."

Also fix pronoun per A2.

---

### B4. Vic's decision to replace Marcus — sourced from untouched token

**Where:** Line 1607: "She'd already decided to replace him at NeurAI."

**Source:** This claim is contained in `vic002` ("ALEX is in, MARCUS is out. No more C & D... NeurAI remains a viable investment"). `vic002` is in the **untouched** list (scanned but never turned in). Content NOT accessible to Nova.

**Available substitutes that ARE supported:**
- `vic003` (exposed): Vic firing Marcus on the sidewalk while pressing scarf to his bleeding nose. This shows the firing, not the prior decision.
- Whiteboard: "Alex is in, Marcus is out" appears as a note. Reportable as a whiteboard fact, not as a memory-quote.
- Jamie's `jam003` (untouched): contains "He's out. You're in. Trust me. It's done." Also unavailable.

**Proposed fix:** Reframe to what Nova can know. "Vic Kingsley was outside on the sidewalk by then, in her own recovered memory, pressing a designer scarf against Marcus's bleeding nose. She had fired him before the room ever convened. The whiteboard kept her language anyway: 'Alex is in, Marcus is out.'"

---

### B5. "Vic had moved someone else into the chair"

**Where:** Line 1607: "The fight on the whiteboard between Sarah and Alex this morning was a duel over a chair Vic had moved someone else into the night before."

**Source:** Same problem as B4 — depends on vic002's content (untouched). The whiteboard has the **phrase** "Alex is in, Marcus is out" but Nova can't attribute it to Vic's specific decision night-of without the token.

**Proposed fix:** Soften to the whiteboard fact. "The fight on the whiteboard between Sarah and Alex this morning was a duel over a seat Vic had been arranging to fill before Marcus's death, according to the line the room itself wrote on the whiteboard: 'Alex is in, Marcus is out.'"

---

### B6. Comparative claim about Morgan and Blake — overstates director's "frequently"

**Where:** Line 1583 ("Morgan Reed spent more of the morning at Blake's station than at the evidence table"); Line 1668 ("Morgan Reed spent more time talking to Blake than to any of the eleven other players in the room").

**Source:** Director observation reads, in full: "Morgan was seen frequently talking to Blake." That's a frequency claim, not a comparative-to-the-evidence-table claim or a more-than-any-other-player claim.

**Proposed fix:** Stay within the director's wording. "Morgan Reed spent stretches of the morning at Blake's station rather than at the evidence table." Or simply: "Morgan Reed was seen frequently at Blake's station."

---

### B7. "Valet getting paid by Valet's employers" — decodes Blake account without behavioral evidence

**Where:** Line 1653: "Blake himself appears on his own ledger at $500,000 across a single transaction. The Valet getting paid by the Valet's employers is the closest thing the night offered to a self-portrait of the institution Morgan and Vic were quietly working with."

**Source:** What Nova knows about the Blake account: it received `sar004` (Sarah's first token) at 9:21 PM for $450K, plus the $50K first-burial bonus. **She does not know who operated that burial** or who chose the receiving account name. Decoding the Blake account as "the Valet's employers (Morgan/Vic) funding their own institution" requires (a) decoding "Blake" = the Valet = NeurAI's institutional money and (b) attributing the operator to Morgan/Vic. Neither is supported.

**Proposed fix:** Demote to a boundary-safe observation. "Blake himself appears on his own ledger at $500,000 across a single transaction — the morning's first burial, from a token owned by Sarah Blackwood. Whoever walked it to the Valet's window chose to label the account after the Valet himself."

---

### B8. Mel "walking the room through" the bank account / "without walking it through her own Stanford Four texts"

**Where:** Line 1581: "Mel walked the group through Sarah's nearly empty shared bank account without walking it through her own Stanford Four texts from earlier in the morning."

**Source:** What Nova knows about Mel: `mel002` (exposed) shows the divorce / bank-account discussion as a party-night memory. Mel's email to her law firm (paper evidence) confirms she's Sarah's divorce lawyer. Mel-Nat texts are paper evidence. **Mel's investigation-morning deliberation behavior is not in director notes**; whether she "walked the room through" specifics is not relayed by Ashe or director.

**Proposed fix:** Drop the investigation-morning behavioral claim. Anchor in the memory content and paper evidence directly. "Mel Nilsson's recovered memory walked through Sarah's nearly empty shared bank account. The paper evidence in Mel's email to her law firm shows the divorce was already a retained case the morning Marcus died."

---

### B9. Sam "contributed to the case against Quinn without ever raising..." — counterfactual deliberation behavior

**Where:** Line 1581: "Sam contributed to the case against Quinn without ever raising the part of his own recovered memory where Marcus, drugged out of his mind on Sam's party blend, confessed the BizAI algorithm was Alex's work."

**Source:** Director note says: "During that discussion of the drugs, Sam's name came up as it was a poorly kept secret that he was the source for the recreational drugs that floated around Marcus's parties." But the director did NOT report whether Sam specifically helped Ashe build the case against Quinn, nor whether Sam withheld the `sam002` content. The counterfactual ("without ever raising") attributes specific in-room behavior Ashe didn't relay.

**Proposed fix:** Anchor in the memory content (sam002 is exposed) without claiming what Sam said or didn't say at the suspect board. "Sam Thorne's name came up in the deliberations as the source of Marcus's party-drug supply. Her own recovered memory from 10:44 PM shows Marcus, drugged out of his mind on her usual blend, confessing the BizAI algorithm was Alex's work." (Note Sam pronoun fix per A3.)

---

### B10. "Vic Kingsley stayed quiet about the sidewalk"

**Where:** Line 1668: "Vic Kingsley stayed quiet about the sidewalk."

**Source:** Same problem as B8/B9 — counterfactual deliberation behavior unsourced. The whiteboard suspect list (Sarah, Alex, Quinn, Sam) does not include Vic, which supports "Vic was not named as a suspect." It does not support "Vic stayed quiet about the sidewalk-firing memory."

**Proposed fix:** Soften to whiteboard-fact framing. "Vic Kingsley's name didn't reach the suspect board."

---

### B11. "They had already been offered it" — Sarah's knowledge of the offer is unsourced

**Where:** Line 1666: "Both of them ended up named for Marcus's job during the deliberations and neither said publicly what the leaked email later confirmed. They had already been offered it."

**Source:** The leak email says it commends Alex on her "negotiation skills" — implying Alex was already negotiating with NeurAI. Sarah's knowledge of the offer is not established by the leak (the offer was extended to Alex "along with Sarah" — Sarah may have been informed by the leak itself, by Alex during the showdown, or not at all). Article wraps both into "they had already been offered it."

**Proposed fix:** Pull back from joint knowledge. "Alex had already been negotiating with NeurAI's board, by the email's own admission. Neither woman said publicly what the leaked email later confirmed: the room was choosing between two candidates the board had been working on for weeks."

---

### B12. "Premium secrets sell at a premium" — boundary-safe but flagged for Cycle 2

**Where:** Line 1649.

**Status:** Not a fact-check violation. Filing for Cycle 2 copy-edit consideration.

---

## C — Coverage Gaps

### C1. Photo under-use — 4 of 12 photos placed

**Used:** photo 11 (hero — Ashe addressing group), photo 6 (Sarah-Alex), photo 10 (Morgan), photo 4 (Ashe-Flip-Jamie).

**Not used:** 1, 2, 3, 5, 7, 8, 9, 12.

**Most-relevant unused:**
- **Photo 9 (Sam, Sarah, Mel intense discussion):** directly supports the Stanford-Four / chemistry-in-the-room thread. Could land in The Story or The Players.
- **Photo 12 (Jamie, Kai, Alex, Mel, Sarah — Alex's impassioned plea):** the visual document of the Sarah-Alex showdown. Could replace the photo-6 placement or supplement it.
- **Photo 1 (Mel, Sam — reviewing evidence post-wake-up):** Stanford-Four chemists at the start of the investigation. Anchors the chemists-convicting-the-chemist thread visually.

**Proposed fix in Cycle 2:** Add 2-3 more photo placements. Defer specific selections until structural moves are decided.

---

### C2. Section nav missing the Closing

**Where:** Sidebar nav lines 1913-1918 — lists The Story, Follow the Money, The Players, What's Missing. The Closing (`id="closing"`) is omitted.

**Proposed fix:** Add `<li><a href="#closing" class="section-nav__link">Closing</a></li>` after the What's Missing entry. (Verify whether the rendering script depends on the omission — if so, add a "Closing" without the section title.)

---

### C3. Remi gets a director quote but no narrative weight

**Where:** Line 1670: "Remi Whitman and Alex shared a moment overheard in passing. 'You found my memory,' Remi said. 'I did,' Alex replied. What Alex did with that information is the kind of thing this morning's verdict did not ask."

**Status:** Remi appears by name with the director quote. But Remi's broader role — competitor whose AI Bio Comp Marcus's NeurAI investment was suppressing, party-night collaborator with Alex against Marcus, owner of a complete-burial token set ($1.23M to Leo) — does not surface. Director-credit for Remi as a Marcus-grievance carrier is left on the table.

**Proposed fix in Cycle 2:** Consider whether Remi's competition with Marcus and Alex-collaboration deserves a beat. Defer structural decision; not a Cycle 1 fact-check issue.

---

### C4. Riley name consistency check

**Where:** Article does not currently reference Riley/Rachel directly except via the loyalty card content in `ril001` (line 1547 references "Riley's loyalty card" implicitly via Riley exposure).

Actually re-checking: Riley is not named in the article body that I read. Only Mel is named as Sarah's lawyer (correct). The "Riley wrote Sarah a card" / "Riley's shell-company voicemail" content from `ril001`/`ril003` is implicitly available but not surfaced.

**Status:** Not a fact-check issue. The article didn't use Riley material extensively; if Cycle 2 expands to use it, ensure consistent "Riley" naming (paper evidence uses "Rachel" inconsistently — paper evidence is a known issue but article-facing should be "Riley").

---

### C5. Roster coverage holds at minimum

Every roster member appears at least once: Remi (dialogue), Sarah (multiple), Ashe (lead character), Sam (multiple), Jess (director quote + "great contributions"), Jamie (capsule + sidebar account), Vic (multiple), Alex (multiple), Mel (multiple), Morgan (multiple), Flip (IOU + loan shark), Kai (emailed instructions + "held his emails close"). Coverage technically passes.

**Status:** No coverage failure. Cycle 2 may revisit thinness around Remi/Jamie/Kai.

---

### C6. Director quotes — all three used

- "You found my memory" / "I did" → present at line 1670.
- "Should I go talk to Sarah? What do you think?" → present at line 1670.
- Ashe's deliberation speech → present at line 1533.

**Status:** Pass.

---

## H — Header / Title / Deck / Byline / Hero

### H1. Headline overclaims "Named" Co-CEOs

**Where:** Line 1463 (headline): "NeurAI Named Co-CEOs This Morning. Twelve People Just Convicted the Chemist Who Wasn't There."

**Source:** The leak is an offer email — the board EXTENDED an offer of an interim co-CEO role. "Named" implies the appointment was announced/finalized. The article body line 1689 (which is independently wrong about WHO the co-CEOs are) says they "will run NeurAI by Monday," suggesting the appointment is imminent rather than complete.

**Severity:** Moderate. Defensible journalistic shorthand for "imminent appointment" but slightly forward of the actual evidence (an offer email leak).

**Proposed fix options for director to choose:**
- (a) Keep as-is, "Named" reads as journalist's shorthand for "tapped."
- (b) Soften to "NeurAI Picked Its Co-CEOs This Morning."
- (c) Tighter: "NeurAI Tapped Alex and Sarah for Marcus's Job This Morning."

**Note:** Whatever lands here also needs to match the corrected closing (per A1).

---

### H2. Deck — supportable but check pronoun and timing

**Where:** Line 1465: "Quinn Sterling wasn't at Marcus Blackwood's last party. By the time twelve investigators voted on his absence, the company he allegedly killed for had already settled the succession question."

- "twelve investigators" → matches the 12-player roster. OK.
- "on his absence" → uses `him` for Quinn. Lock pronoun per Open Question #1.
- "had already settled the succession question" → claim depends on the offer-equals-settled framing. Same flag as H1.

**Status:** Mostly supportable, pending pronoun lock. May need light tightening once H1 is resolved.

---

### H3. Hero photo caption — pronoun consistency + reach

**Where:** Line 1492: "Six of the twelve. The room that voted for Quinn Sterling never included him."

- "Six of the twelve" → matches photo composition (5 visible + Ashe addressing). OK.
- "never included him" → pronoun lock (Open Question #1). Currently uses `him`, body uses `her`.
- "The room that voted for Quinn Sterling never included [Quinn]" → describes a fact NOT visible in the photo. The photo shows Ashe addressing the group; the caption is interpreting what they're doing. Marginal but defensible because the act of being addressed at the deliberations IS what the photo documents.

**Proposed fix:** Lock pronoun. Consider whether to tighten to what's visible: "Six of the twelve gathered for Ashe's closing argument. Quinn Sterling was not one of them."

---

### H4. Byline — remote framing not signaled in the byline itself

**Where:** Lines 1468-1473:
```
Cassandra Nova | NovaNews | Senior Investigative Correspondent
|| Ashe Motoko | Guest Reporter
```

**Status:** The lede attempts to land the remote framing ("Ashe... did the feet-on-the-ground reporting while I worked the wires"). The byline itself reads as a standard dual-credit. Adding a remote indicator to Cassandra's role line — e.g. "Cassandra Nova | NovaNews | Senior Investigative Correspondent (remote)" — would prime the reader before the lede has to do the work.

**Note:** `templates/journalist/partials/header.hbs` shows as modified in git status. Verify whether you've already adjusted the template for remote framing; if so, the article may not pick up the change without regeneration.

**Severity:** Low (Cycle 2 candidate). Flagging here because it relates to the A1/B1/B2 voice fixes.

---

### H5. Article ID

**Where:** Line 1482: "Article NNA-052326-26"

**Status:** Looks like a sequence/date stamp. Not flagging unless director wants to verify the numbering convention.

---

## Severity Summary

**Must-fix before publish (block on these):**
- A1 (wrong co-CEOs in closing)
- A2 (Morgan pronouns)
- A3 (Sam pronoun)
- A4 (Quinn pronoun lock — pending director input)
- A5 (Taylor as journalist, not editor)
- A6 (Quinn in lab vs bar)
- A7 (Derek source attribution)
- A8 (chemists plural → singular)
- B1, B2, B3 (REMOTE voice violations — three places)
- B4, B5 (Vic untouched-content attribution)

**Should-fix in this cycle:**
- B6 (Morgan comparative)
- B7 (Blake account decoding)
- B8, B9, B10 (counterfactual deliberation behavior)
- B11 (Sarah's offer knowledge)
- C2 (section nav missing closing)
- H1, H3 (headline/hero pronoun and timing)

**Cycle 2 deferred (copy-edit cycle after fact-check lands):**
- B12 (aphorism)
- C1 (photo placement decisions — may shift after structural moves)
- C3 (Remi enrichment)
- H4 (byline remote indicator)

**Open questions blocking edit plan:**
1. Quinn's pronouns
2. Sam ↔ Derek relationship
3. Paternity test unlocked status
4. Co-CEO confirmation (Alex + Sarah, not Sarah + Vic)

---

## Counts

- A findings: 11 (3 critical pronoun, 1 critical co-CEO, 1 source misattribution, others moderate)
- B findings: 12 (3 REMOTE voice, 2 untouched-token, 5 counterfactual/boundary, 2 deferred)
- C findings: 6 (1 nav, 1 photo under-use deferred, 4 status-pass)
- H findings: 5 (1 headline, 1 deck, 1 hero, 1 byline, 1 ID)

Total fact-check issues requiring edits: **24** (excluding open questions and deferred Cycle 2 items).
