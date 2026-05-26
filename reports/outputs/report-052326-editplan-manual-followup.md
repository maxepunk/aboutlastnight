# Follow-up Edit Plan — Session 052326 (After Director's Manual Edits)

**Source of triggering changes:** Director's manual edits to `outputs/report-052326.html`, committed reasoning summarized in conversation. Two reframes plus minor adjustments.

**Reframe A — Quinn was at the party:** Quinn was at the warehouse last night; left at some unknown point before the morning investigation. Source-supported (qui002, qui003, qui004 place Quinn at the party). Lede ¶1 + deck + hero caption already adjusted by director.

**Reframe B — Blake was actively recruiting during the investigation:** Per the director's new Story ¶4, Alex's defense revealed Blake had been transacting Marcus's old job on the floor of the investigation, offering it to candidates who could demonstrate loyalty to NeurAI. Alex admitted being approached; she named Sarah as another approached candidate. This is a major thesis shift — the leak in ¶6 is no longer a surprise reveal; it is institutional confirmation of what Alex put on the record.

This document drafts fixes ordered top-down through the file. Edits group by:
- **MUST-FIX:** Direct contradiction or stale meta
- **SHOULD-FIX:** Ambiguity caused by the reframes
- **CONSIDER:** Thematic ripple effects from Reframe B

The director chose to fix all except CONSIDER #5 (Morgan-at-Blake's station). I'm also adding **one ripple I missed in my initial scan**: What's Missing ¶2 contains the question *"When NeurAI's board actually decided on Alex and Sarah as co-CEOs"* — that question now reads differently under Reframe B and is worth tightening.

---

## EDIT FU-1 — Meta description (MUST-FIX #2)

**Where:** Line 6.

**OLD:**
```
  <meta name="description" content="Twelve of Marcus Blackwood&#x27;s guests gathered to investigate his death this morning. Their verdict landed on the one suspect who hadn&#x27;t shown up. An active manhunt is now underway.">
```

**NEW:**
```
  <meta name="description" content="Twelve of Marcus Blackwood&#x27;s guests gathered to investigate his death this morning. Their verdict landed on a suspect who was seen at last night&#x27;s party, but gone by the time everyone else woke up. An active manhunt is now underway.">
```

Match the director's new deck verbatim.

---

## EDIT FU-2 — OG description (MUST-FIX #2)

**Where:** Line 9.

**OLD:**
```
  <meta property="og:description" content="Twelve of Marcus Blackwood&#x27;s guests gathered to investigate his death this morning. Their verdict landed on the one suspect who hadn&#x27;t shown up. An active manhunt is now underway.">
```

**NEW:**
```
  <meta property="og:description" content="Twelve of Marcus Blackwood&#x27;s guests gathered to investigate his death this morning. Their verdict landed on a suspect who was seen at last night&#x27;s party, but gone by the time everyone else woke up. An active manhunt is now underway.">
```

---

## EDIT FU-3 — Lede ¶1 punctuation (SHOULD-FIX #4)

**Where:** Line 1497.

**OLD:**
```
        <p>Quinn Sterling wasn&#x27;t there. The chemist the room finally settled on for Marcus Blackwood&#x27;s death had somehow left the party after the others had lost consciousness. Twelve people stood around the evidence table this morning, sifted through extracted memories and labeled baggies of Psychotrophin named him despite not knowing where he is or how he disappeared from the warehouse where they all woke up this morning.</p>
```

**NEW:**
```
        <p>Quinn Sterling wasn&#x27;t there. The chemist the room finally settled on for Marcus Blackwood&#x27;s death had somehow left the party after the others had lost consciousness. Twelve people stood around the evidence table this morning, sifted through extracted memories and labeled baggies of Psychotrophin, and named him despite not knowing where he is or how he disappeared from the warehouse where they all woke up this morning.</p>
```

Adds the missing comma + "and" before "named him." Three actions in series (stood, sifted, named) now read cleanly.

---

## EDIT FU-4 — Story ¶1 calibration (CONSIDER #6)

**Where:** Line 1505.

**OLD:**
```
        <p>Ashe took the stage at the start of the final deliberations and broke it down systematically. The drugs killed Marcus. Someone named Quinn made the drugs. Quinn wasn&#x27;t in the building. The chemistry argument tracked, and the rest of the room let it carry.</p>
```

**NEW:**
```
        <p>Ashe took the stage at the start of the final deliberations and broke it down systematically. The drugs killed Marcus. Someone named Quinn made the drugs. Quinn was gone by morning. The chemistry argument tracked, and the rest of the room let it carry.</p>
```

**Why:** "Quinn wasn't in the building" was clean when Quinn never made it to the party. With Reframe A established in the lede, "the building" is now ambiguous — the warehouse where everyone woke up IS the same building where Quinn was last night. *"Quinn was gone by morning"* clarifies (he was there, he left, the room voted anyway) and connects directly to the lede's disappearance framing. Side benefit: avoids the "room... rest of the room" near-repetition that the literal swap to "in the room" would create.

---

## EDIT FU-5 — Story ¶6 reframe (MUST-FIX #1)

**Where:** Line 1565.

**OLD:**
```
        <p>What no one at that evidence table said out loud: Alex had already been negotiating with NeurAI&#x27;s board. After the deliberations ended, an anonymous leak reached me. The email commended Alex on her negotiation skills and offered her an interim co-CEO role alongside Sarah. The succession the room was duelling over was being decided in parallel. By the email&#x27;s own framing, the investigation was a front for an interview.</p>
```

**NEW:**
```
        <p>An anonymous leak from NeurAI&#x27;s board reached me after the deliberations closed. The email commended Alex on her negotiation skills and confirmed the interim co-CEO offer alongside Sarah. The board put its name on what Alex had just admitted in defense. The investigation was being run as an interview in plain sight.</p>
```

**Why:** The director's new ¶4 has Alex admitting Blake's recruitment in defense. ¶6's old opener — *"What no one at that evidence table said out loud"* — directly contradicts the new ¶4. The whole paragraph's role has shifted from "the reveal" to "institutional confirmation." The new version:
- Drops the contradicted opener.
- Positions the leak as the paper trail confirming what Alex already exposed.
- Strips the "By the email's own framing" hedge from Cycle 2 — no longer needed since Alex named the mechanism in the room.
- Lands the thesis directly: *"The investigation was being run as an interview in plain sight."* No "by inference" weakening clause; the in-plain-sight framing is now factually anchored.

This change is structural, not sentence-level. ¶6's role in the article has changed.

---

## EDIT FU-6 — What's Missing ¶1 (SHOULD-FIX #3 + CONSIDER #8 combined)

**Where:** Line 1692.

**OLD:**
```
        <p>Quinn Sterling was never in the room to defend or confess. The blackmail email is real. The PT-3A demand is real. The presence is not. There is now an active manhunt to bring him in for questioning. The next time his name appears in a document it will be on a warrant.</p>
```

**NEW:**
```
        <p>Quinn Sterling was never in the room to defend or confess. The blackmail email is real. The PT-3A demand is real. His morning presence is not. When and how he left the warehouse where the others woke up, and who saw him last, are open questions for the active manhunt. The next time his name appears in a document it will be on a warrant.</p>
```

**Why:** Two changes in one paragraph because they belong together:
- *"The presence is not"* → *"His morning presence is not."* Disambiguates against the party presence the lede now establishes.
- Adds the *"when and how he left"* question, folding the Quinn-disappearance thread into the Quinn paragraph (where it naturally belongs) instead of inflating the five-threads paragraph below to six. Also folds the "active manhunt" mention into the same sentence so it's not orphaned.

The kicker line *"The next time his name appears in a document it will be on a warrant"* is preserved.

---

## EDIT FU-7 — What's Missing ¶2 (additional ripple — was not in original list)

**Where:** Line 1694.

**OLD:**
```
        <p>Five threads got logged and dropped this morning. Who actually mixed the specific Psychotrophin-3B batch that extracted everyone&#x27;s memories last night, and when. When NeurAI&#x27;s board actually decided on Alex and Sarah as co-CEOs, and who drafted the leak that landed in my inbox after the vote. Who B is on a burial ledger that dwarfs every other account. What was in Ashe&#x27;s expose before Taylor and Marcus killed it. Why Phil Kowalski&#x27;s name sits on a 2020 IOU for an &#x27;undefined favor&#x27; and appears nowhere else.</p>
```

**NEW:**
```
        <p>Five threads got logged and dropped this morning. Who actually mixed the specific Psychotrophin-3B batch that extracted everyone&#x27;s memories last night, and when. When the board authorized the recruitment Blake transacted this morning, and who drafted the post-deliberation leak. Who B is on a burial ledger that dwarfs every other account. What was in Ashe&#x27;s expose before Taylor and Marcus killed it. Why Phil Kowalski&#x27;s name sits on a 2020 IOU for an &#x27;undefined favor&#x27; and appears nowhere else.</p>
```

**Why:** Under Reframe B, the *"When NeurAI's board actually decided on Alex and Sarah as co-CEOs"* question reads off. The board's decision didn't happen as a single moment; it had been institutional momentum that authorized Blake to transact. The genuine open question is now *"when did the board authorize the recruitment Blake was transacting"* — that's the question Alex's admission opened. The drafter of the post-deliberation leak remains its own open thread.

**I'm flagging this as a missed item from my initial ripple analysis.** When you said edits can have greater echoes than I noticed, this is exactly the kind of one I underweighted.

---

## EDIT FU-8 — Closing ¶2 sharpening (CONSIDER #7)

**Where:** Line 1703.

**OLD:**
```
        <p>What the verdict does not account for is everyone else in that room. The succession was being settled in parallel with the vote. Morgan, who built Marcus&#x27;s narrative as the face of principled AI, was already dismantling it on a journalist&#x27;s recorder. The chemist with access to the formulation tree convicted the chemist who didn&#x27;t ship the final batch. The journalist whose career Marcus destroyed led the prosecution. Flip&#x27;s loan shark is still waiting. Jess&#x27;s paternity test is in evidence. Kai&#x27;s instructions from Marcus are still in an inbox nobody asked about. None of those people made the suspect board for more than half an hour.</p>
```

**NEW:**
```
        <p>What the verdict does not account for is everyone else in that room. The succession was being settled in the same room, at the same hour. Morgan, who built Marcus&#x27;s narrative as the face of principled AI, was already dismantling it on a journalist&#x27;s recorder. The chemist with access to the formulation tree convicted the chemist who didn&#x27;t ship the final batch. The journalist whose career Marcus destroyed led the prosecution. Flip&#x27;s loan shark is still waiting. Jess&#x27;s paternity test is in evidence. Kai&#x27;s instructions from Marcus are still in an inbox nobody asked about. None of those people made the suspect board for more than half an hour.</p>
```

**Why:** *"In parallel with"* was the right phrase when the leak was a backroom discovery — succession-decided-elsewhere-while-the-vote-pretended-to-be-the-event. Under Reframe B, the succession was being settled IN the room, simultaneous with the vote. *"In the same room, at the same hour"* captures both axes (spatial + temporal) and lands harder.

This pairs symmetrically with Story ¶15's existing closer *"in the same hour NeurAI's offer landed"* — both clauses now share the temporal anchor "the same hour."

---

## What I checked and chose NOT to change

Listing these so the working trail is explicit:

**Story ¶3 line 1533** — Ashe's quoted statement *"Quinn made this drug, and Quinn is not here."* Direct quote from director notes. Stays verbatim. *"Quinn is not here"* refers to the morning room; consistent with both reframes.

**Story ¶10 line 1601** — Morgan-at-Blake's-station paragraph. Director skipped CONSIDER #5. Leaving the Morgan/Blake observation untouched even though Reframe B makes the dual-purpose reading (burial vs recruitment context) more salient. Reader can integrate.

**Follow the Money ¶4 line 1686** — *"Blake himself appears on his own ledger at $500,000... The house collected on its own table."* Blake's own ledger reference is in the Money section, not the Players/Story area. With Reframe B, "the house collected on its own table" gets sharper (Blake the recruiter AND the burial-market operator put a token in his own account), but the existing line stands on its own; not flagging for change.

**Story ¶15 line 1674** — *"The room cast its vote for Quinn, and in the same hour NeurAI's offer landed."* Stays. "NeurAI's offer landed" now refers to the written email; the verbal transaction (via Blake) was ongoing throughout the morning. Reader integrates.

**Closing ¶3 line 1705** — *"The system Marcus built survived him. The drug supply is still being formulated... By Monday that board will have handed Marcus's title to..."* Stays. With Reframe B, this paragraph reads even more pointedly — the system openly transacted Marcus's replacement during the morning of his investigation — but the prose still lands.

**Closing kicker line 1707** — *"The absent chemist absorbed every account that was still open. Everyone else walked out clean, and the company kept moving."* "Absent chemist" still works because Quinn was absent from the morning specifically. Stays.

**Photo 12 caption (Alex's deliberation plea)** — *"The plea that landed her on the suspect board was also a job interview."* Stays. Reads even more accurately under Reframe B — the plea WAS the job interview moment, because Blake was actively recruiting and Alex used her defense to surface that recruitment.

**Hero caption (director's new):** *"Ashe Motoko walks the group through the discoveries he made through the morning."* Stays. Director's edit replaced the previous Quinn-not-in-it framing.

---

## Apply order

Top-of-file → bottom-of-file:
1. FU-1 (meta description)
2. FU-2 (og:description)
3. FU-3 (lede ¶1 punctuation)
4. FU-4 (Story ¶1 — Quinn was gone by morning)
5. FU-5 (Story ¶6 reframe — leak as institutional confirmation)
6. FU-6 (What's Missing ¶1 — morning presence + disappearance thread)
7. FU-7 (What's Missing ¶2 — board authorized recruitment)
8. FU-8 (Closing ¶2 — same room, same hour)

All eight are independent text replacements with no inter-dependencies; the order is positional for readability, not technical.

---

## Open question for director

**FU-7 is an edit I added beyond your original list.** It addresses a ripple from Reframe B that I didn't surface in my initial scan. The fix is small (one sentence in What's Missing ¶2 reworded). Do you want me to include it in this apply, defer it, or skip it?

Once you green-light the set, I'll apply all eight in order.
