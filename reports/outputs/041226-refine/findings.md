# 041226 Fact-Check + Copy Edit Findings

## P0 — Must-fix accuracy issues

### 1. Pronoun errors (multiple) — NEED DIRECTOR CONFIRMATION
- **Ashe**: article uses `he/him/his` throughout (6+ times: "through him," "He did the reporting," "his own leads," "his hands first," "Ashe's access"). All tokens for Ashe use `they/them`. LOAD-BEARING because Ashe is the reporter-conduit framing.
- **Quinn**: article uses `he/him/himself` (4 times: "he was cornered," "he was simply unable to," "a chemist who wasn't there to defend himself," "his tormentor"). Token EZR003 uses `they/them` for Quinn.
- **Morgan**: article uses `he/his` (3 times). No evidence either way in source data.
- **Remi**: "James Whitman" in email headers suggests male legal name, but player pronouns unknown.
- **Vic**, **Mel**, **Sam**: gender-neutral in article; safe unless director specifies.

**Action**: pause for director pronoun input before revising prose.

### 2. Transaction count errors
- Lede (line 1491): "**Thirty-five memories**. Gone" → should be **37 memories** across 6 accounts (+1 tip to Nova). Also article says "in six shell accounts" but Sarah's account is NOT a shell (own-name burial) — framing needs adjustment.
- Follow the Money (line 1639): "Thirty-five extracted memories" → same fix, **37**.
- Line 1651: "Totally Legit absorbed $3,855,000 across **thirteen memories**" → **fourteen memories**.
- Line 1653: "Lifeline took in $2,205,000 across **nine memories**" → **ten memories**.

Orchestrator aggregate was buggy — raw transaction list confirms 14 + 10. Article inherited the bug.

### 3. qui004 provenance unacknowledged (missed editorial angle)
Line 1521–1527 presents the Quinn confession memory (qui004) as just "a recovered memory from later that night." But qui004 was specifically **paid $30K to the Nova account at 9:10 AM** — i.e., someone in the room paid thirty thousand dollars to put this memory *specifically in the journalist's hands*. That fact is load-bearing editorial material:
- The chemist-was-cornered narrative isn't just recovered — it was **surfaced on purpose**, by someone who wanted Nova to have it.
- Who paid? Unknown (Nova can't see who walked to Blake). But the fact that someone paid, and at $30K (the same amount Flip owed his bookie, the same as Rem002's Totally Legit burial), is worth naming.

This is the single largest missed opportunity in the draft.

### 4. Missing director quote scene (Alex/Remi/Morgan deflection)
Director recorded direct-quote exchange NOT in article:
> Alex walked up on a private conversation between Remi and Morgan. Alex: "What's going on here?" Remi/Morgan: "Don't worry about it."

This is:
- Temporal-safe (investigation-morning direct overhearing)
- Character-revealing (Alex suspicious; Remi-Morgan caught)
- Feeds the already-present theme that Morgan, Remi, Alex had overlapping agendas
- Gives player recognition — the three-way tension was a session beat

Should be worked into either "The Story" (where Morgan-Vic partnership is introduced) or "The Players" (where Morgan is profiled).

### 5. Alex's "Marcus orchestrated this as a setup" theory missing
Director: "Alex spent the later part of the investigation trying to gain traction about a theory that this was all a setup by Marcus himself to identify who his enemies were and somehow get revenge by exposing all of their dirty laundry."

This is a minority theory Alex floated at length — a piece of the deliberation process. Currently absent. Could go in Lede (as part of the "accusation cycle") or in "What's Missing" (as a roads-not-taken note).

## P1 — Framing / editorial issues

### 6. "Six shell accounts" framing conflict
Lede and Follow-the-Money: "six shell accounts" totalling $8.46M. But line 1653 correctly notes Sarah's account: "No pseudonym. No shell game." So Sarah isn't a shell account. The ledger's six accounts are: **5 shells + Sarah's own name**. Fix: "six accounts — five of them shells" or similar.

### 7. Ashe-as-sole-conduit oversimplified
Article (line 1491): "came through him [Ashe] — a fellow reporter working the warehouse from inside, forwarding exposed memory tokens as they surfaced. He did the reporting."

Director notes actually: "Ashe was a big contributor to the exposed memories and, **along with Remi and Alex**, made a big impact on the final reporting with their exposures."

The article's Ashe-as-conduit framing is a simplification; Remi and Alex also fed exposed material. Consider softening: "came through Ashe primarily, with Remi and Alex pushing additional evidence through" — keeps the Ashe spotlight but respects the full record.

### 8. Ashe's motive underexposed
Ashe's history with Marcus is load-bearing context the article skips:
- TAY002 + ZIA002 (exposed): Taylor bragged to Zia about burying Ashe's exposé as a favor to Marcus, got NeurAI launch exclusive in return. Ashe overheard.
- Taylor<>Marcus email (selected paper): Taylor to Marcus — "Ashe's exposé on your 'memory experiments' won't see daylight. Editor thinks it needs 'more substantiation.' She'll be reassigned to lifestyle by Monday."
- Nat-Ashe emails (selected paper): Ashe's unpublished exposé "Blood In The Code."

Ashe is framed in the article as a helpful insider. The fuller frame: **Ashe had been professionally destroyed by Marcus and Taylor working together, and was finishing the job Marcus killed.** One sentence in "The Players" section would ground why Ashe worked this investigation so hard.

### 9. Flip's DC-type cash observation — framing drift
Token fli003: "that DC type he's been hanging around with lately. MARCUS just casually handed over a fat wad of cash…"

Article line 1725: "Flip's recovered memory of Marcus handing cash to a figure he recognized from DC…"

"DC type" ≠ "figure he recognized from DC." Flip didn't say he recognized the person — he said "DC type" (generic classification). Morgan is a tech lobbyist who lives bicoastally (DC ↔ CA per character sheet); the natural read is that the DC type may well be Morgan, but the article shouldn't claim Flip recognized the person.

Fix: "a recovered memory where Flip watches Marcus hand cash to a 'DC type' was never traced to a name."

### 10. Paternity / Jess-Sarah overlap missed
Selected paper: **Paternity test** shows Marcus is 99.85% father of Jessicah Kane's fetus (selected = Nova has access). Paired with **identical apology cards** to both Sarah and Jess ("She means nothing to me" — each woman told the other was nothing).

The article's "Sarah and Jess Kane found each other in an unexpected alliance... the two women most damaged by his infidelities" is directionally correct but lightweight. The concrete fact — that the cards are identical and that Jess is carrying Marcus's child — is a session-defining fact about the survival calculus Sarah and Jess chose.

BUT: the paternity test is locked paper evidence — players may not have seen it during the investigation. Director approved access but this may feel like content the room didn't earn. **Flag for director judgment**: do we use the paternity angle or keep it behind the curtain?

### 11. Skyler theory absent
Whiteboard records SKYLER as a suspect theory: Marcus was stealing CyberLife's proprietary neural-adaptation tech (sky002 + tay001). The group considered this but didn't land on it. Currently zero mention in article.

This is low-priority (the room abandoned the theory), but one sentence in "What's Missing" acknowledging the roads the room didn't take would sharpen the "too-convenient accusation" framing in the closing.

## P2 — Copy edit annotations (Phase 3 tests)

### Paragraph-justification: what earns its place?

Most paragraphs earn their place. The ones that are weakest:

- **Line 1571** ("Morgan traded the money trail for anonymity..."): the "I'm not drawing a line between those two facts. I'm just telling you when they happened" is a good boundary hedge, but the paragraph is structurally flat — one idea stretched across 4 sentences. Could tighten.
- **Line 1631** ("Sam and Mel Nilsson are both Stanford Four..."): this paragraph *names* Sam and Mel as Stanford Four and flags the restraint theme, but the second half ("Meanwhile, a parallel question: multiple burial accounts bore Stanford-era names. Whether those were opened by actual Stanford Four members or by others looking to shift suspicion is something this reporter cannot determine from the transaction records alone.") is pre-emptively hedging material that appears again in Follow-the-Money. **Redundancy.**
- **Line 1713** ("The Stanford-named accounts processed $1.6 million combined…") in What's Missing: repeats facts already in Follow-the-Money (timing/batch/5+3 tokens) and adds little new. The "Meanwhile, Sarah and Jess were observed working together… The money moved in patterns. The people moved in patterns" is correlation-suggested-but-not-made, and in What's Missing we already said we can't call it. **Trim.**

### Hedge audit
- Boundary hedges — **keep all**: "this reporter cannot determine," "remains unknown," "I can't tell you what's inside it," "I don't know who operated," etc. Accuracy-load-bearing.
- Editorial hedges — **cut/tighten**:
  - Line 1571: "I'm not drawing a line between those two facts. I'm just telling you when they happened." This is a fine line — it reads as deliberate boundary-keeping but also tips into affected-journalism-voice. Keep but don't repeat the pattern elsewhere.

### Throat-clearing / transition purges
- Line 1533: "So here's the shape of the accusation:" — mild throat-clearing but it works as a rhythm reset. Keep.
- Line 1621: "Now hold that thought." — conversational, earns it.
- Line 1633: "This is where the threads converge." — borderline throat-clearing, but it does real structural work introducing the convergence thesis. Keep.

### Pacing
Article is well-paced overall. "The Story" reads fast (short evidence beats), "Follow the Money" deliberately slows to walk through ledger math, "What's Missing" opens with a deliberately spacious line ("I can tell you the shape of the silence. I can't tell you what's inside it.") that earns its place.

One monotony risk: in "The Story" every paragraph ends on an aphoristic summary. "Nobody had to coordinate. The outcome was overdetermined." / "Nobody in the room had to feel the weight of it." / "Or someone was clearing the path long before Marcus swallowed those pills." Feel similar. Vary the landings.

### Abstract → specific
- Line 1633: "five different campaigns" — specific (named in the same paragraph). ✓
- Line 1573: "the power dynamics of the old order still exerting gravity even as it collapsed" — a bit abstract. The concrete here: Jess (possibly pregnant with Marcus's child) is still asking Marcus's partner-in-ruin (Alex) for money. Either make it more specific or cut the abstraction.
- Line 1687: "two Stanford-connected participants maintained a conspicuously measured presence" — specific enough; names are right there.

## P3 — Closing evaluation

Current closing (lines 1728–1735) has three paragraphs:
1. The room named Marcus + Quinn. Convenient. "how many of them needed Marcus gone?"
2. **Five campaigns** recapped. "not conspiracy. Something worse — a system so thoroughly rigged that betrayal was the rational choice for every individual in it."
3. "They named a dead man and a cornered chemist. Then $8.46 million in memories disappeared... The truth was in that room this morning. It was just too expensive to keep."

**Bridge test**: Does the systemic claim ("a system so thoroughly rigged that betrayal was the rational choice") trace back to a specific session choice?
- Morgan trading the money trail for anonymity (mor002) ✓
- Sarah accepting the CEO role from people with their own motives ✓ (inferred)
- Five campaigns each benefiting from Marcus gone ✓

The closing does make the bridge, but the second paragraph's systemic line reads slightly generic because it *tells* the complacency thread rather than *shows* it. Possible tightening: replace "not conspiracy. Something worse — a system..." with a single named moment — e.g., "When Morgan traded Riley the money trail in exchange for keeping Morgan's name clean, that wasn't cowardice. That was market logic. That's the indictment."

Genericness test: the last paragraph's "The truth was in that room this morning. It was just too expensive to keep" is session-anchored (the room, this morning, $8.46M) — survives.

## P4 — Structural tightening opportunities

- Whats-Missing currently has 5 paragraphs (lines 1697–1725). The Stanford-accounts paragraph (1713) repeats Follow-the-Money material. Consolidate into a single "I still don't know" paragraph that enumerates the open questions without re-telling.
- Flip's DC-type memory sits at the very end of What's Missing (line 1725) as a single orphan paragraph. Could be absorbed into the closing or the "I don't know" consolidation above.

## Summary of recommended edits

| Priority | Change | Location |
|---|---|---|
| P0 | Fix pronouns (after director confirms) | Throughout |
| P0 | Fix "35"→"37", "13"→"14", "9"→"10" | Lede, Follow-the-Money |
| P0 | Reframe qui004 as paid tip to Nova | "The Story" section, Quinn confession beat |
| P0 | Add Alex/Remi/Morgan "Don't worry about it" scene with quotes | "The Story" or "The Players" |
| P0 | Mention Alex's "Marcus orchestrated everything" theory | Lede or What's Missing |
| P1 | "Six shell accounts" → "six accounts, five of them shells" | Lede, Follow-the-Money |
| P1 | Soften Ashe-sole-conduit; credit Remi + Alex for exposures | Lede para 2, Players section |
| P1 | Add one sentence on Ashe's fired-by-Marcus motive | Players section |
| P1 | Fix "recognized from DC" → "DC type" | What's Missing |
| P1 | Decide paternity/Jess-Sarah angle with director | Players section + Closing |
| P1 | Add one-line Skyler reference | What's Missing |
| P2 | Trim redundant Stanford-accounts para | What's Missing |
| P2 | Tighten monotone aphoristic endings in The Story | The Story |
| P2 | Tighten closing's systemic line with a specific named moment | Closing |
| P2 | Tighten or cut "power dynamics of the old order" abstraction | The Story (Jess/Alex reference) |
