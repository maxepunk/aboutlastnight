# Pass 1 Findings — Fact-Check — Session 052926

> Claim-by-claim verification of `outputs/report-052926.html` against `report-052926-refsheet.md`, full token text (`tokens.json`), and all 41 paper-evidence items (`paper-evidence.json`).
> **Headline result:** the article is factually strong. It handles REMOTE reporting, the Nova/exposer boundary, and the thesis well. Most claims I initially suspected verified as TRUE against source. The genuine issues are concentrated in **paper-evidence attribution** and a few **identity/boundary** points — not fabrication.

---

## A. Verified CORRECT (do not re-flag — these survived scrutiny)

| Claim | Verdict | Source |
|---|---|---|
| Byline date "February 22, 2027" + "the morning of February 22" | **CORRECT** | Party/death = night of Feb 21, 2027 (Quinn email "party on the 21st"; Kai Install Brief dated Feb 21; Baggies: "extract…memories on Feb 21, 2027, the night of Marcus' death"). Investigation = morning of Feb 22. (May 29, 2026 = real play date, not in-world.) |
| "I rebuilt his useless code by sunrise" (ale002 card) | CORRECT | ale002: "I rebuilt his useless code from scratch by sunrise for demo day at Y Combinator." |
| "The money is yours" / "Riley's voicemail to Sarah" (ril003) | CORRECT | ril003 is literally a voicemail; "The money is yours" is a direct quote. |
| "a stranger in a lab coat" (Marcus + extracts) | CORRECT | jam002: "a stranger wearing a lab coat." |
| mar004 evidence-card text (names Sam, Sarah) | CORRECT | Matches fullDescription verbatim. |
| Mel = "Sarah's divorce attorney" + "one of Marcus's oldest friends" | CORRECT (cite needed — see B1) | Mel's emails about divorce (`mnilsson@patchworklaw.firm`): "taken on Sarah Blackwood as a client… known Marcus and Sarah for over a decade… met Marcus first." |
| "Mel had once been involved with Marcus himself" | CORRECT (cite needed — see B1) | Sam↔Mel texts: "Sleeping w M again?" / "wouldn't make that mistake twice." |
| Sam "made his drugs" / "found the paternity test slipped under the warehouse door" / "knew him long before the machine" | CORRECT (cite needed — see B1) | Sam's Diary: "the shit I'm making for him… reproduce a mysterious formula"; "an envelope slipped under the warehouse door. It had a paternity test inside"; "the man we befriended all those years back." |
| Alex C&D "demanded Marcus's removal and a neutral interim CEO" + "legal deadline a week out" | CORRECT | C&D letter: "M. Blackwood be removed as the Chief Executive Officer… instill a neutral party as the interim Chief Executive Officer"; deadline Feb 28, 2027 (party Feb 21 → 7 days). |
| "corporate-shielded his assets" (sar002 card) | CORRECT | sar002: "Marcus must have corporate-shielded everything." |
| Financial tracker (KakiHBD $3.98M / Vic $600K / Nate $480K / Alex $330K / Ky $30K / GreatQueen $0; Total $5,420,000) | CORRECT | Matches orchestrator-parsed exactly; both inline + sidebar synced; First Burial Bonus & Nova channel correctly omitted. |
| KakiHBD "$3.98M, ~73 cents of every dollar, 26-minute window" | CORRECT | 9:53–10:19 PM = 26 min; $3.98M / ~$5.42M ≈ 73%. |
| REMOTE handling ("I was not in that room… built from the public record") | CORRECT | reportingMode: remote. Investigation framed as reconstructed, not witnessed. |
| No "Nova exposed X" anywhere | CORRECT | Exposure framed as "pushed onto the shared screen" / "put on the record." |
| Jess open exposer ~9:52; Ashe "quietly" (anonymous) prolific | CORRECT | Matches director exposer-attribution guidance. |
| All roster pronouns (Ashe he, Mel he, Alex she, Remi she, Sam she, Riley she, Vic/Sarah/Jess she) | CORRECT | Match this session's rosterPronouns. |
| jes004 + sar004 dual bathroom memories, both exposed | CORRECT | Both in exposed list; content matches. |
| Drunken-fall theory attributed to Jess at the check-in | CORRECT | director-notes + whiteboard (red marker). |

---

## B. Genuine findings (fix in edit plan)

### B1 — [MEDIUM-HIGH] Paper evidence stated as ambient knowledge, not cited as documents
The boundary rule: claims resting on paper evidence (emails, diaries, character sheets, letters) must reference the document; the pipeline treats them as ambient knowledge. The facts below are TRUE but presented as omniscient narration. Each needs a document citation.

- **The Players — Mel:** "Mel Nilsson, Sarah's divorce attorney and one of Marcus's oldest friends… By the evidence, Mel had once been involved with Marcus himself." → cite **Mel's law-firm email** (divorce client + decade-long relationship) and the **Sam↔Mel texts** (past involvement). "By the evidence" is a vague gesture, not a citation.
- **What's Missing — Sam:** "She made his drugs, she found the paternity test slipped under the warehouse door, she knew him long before the machine." → cite **Sam's diary entries** (all three facts live there).
- **The Players — Remi:** "a funding rival who had watched Marcus get money her company deserved" → cite **Remi's threatening email to Marcus** / **Remi↔Vic funding email** (the $20M-to-Marcus grievance).
- **The Players — Alex:** "pressing an IP claim with a legal deadline a week out" → cite **Alex's cease-and-desist letter**. (Note: the C&D *is* named later in Closing — "Alex's cease and desist demanded…" — so add the citation at first mention or lean on the Closing reference.)

> Why it matters: this is the single most systematic issue. Nova is a reporter; sourcing documents is her credibility. Fix = light-touch attributive phrasing ("an email from Mel's own firm shows…", "Sam's diary records…"), not new facts.

### B2 — [MEDIUM] Blake misgendered as "the man" (2 instances)
Blake (Black Market operator / Valet NPC) is **they/them** this session. Two prose hits use "the man":
- The Story: "three for **the man who ran the market**." (the preliminary-vote sentence)
- Follow the Money: "She told **the man running the market** she had nothing to hide."
> Fix: use the neutral forms the article already uses elsewhere ("the operator who ran the evidence market," "the market operator"). Pure find-replace; no narrative impact.

### B3 — [MEDIUM] Alex open-exposure claim overstates what's observable
Follow the Money: "Alex spent that morning **reading her own grievances into the open record, out loud, in front of everyone**." The public-exposure channel was **anonymous** (only Jess openly claimed her batch; Ashe was anonymous-prolific). Alex's grievances (ale002/ale003) *are* on the public record (observable, director-endorsed for the frame question), but the article dramatizes Alex as personally and openly broadcasting them, which the exposer log doesn't support.
> Why it matters: this overstatement is load-bearing for the (good) "Alex = possible frame" argument; keeping it precise makes the argument stronger, not weaker. Fix: "Alex's own grievances were among the memories on the open record, and she was never seen at the market table" — anchor in observable facts (grievances public + absence from Blake's table), drop "out loud, in front of everyone."

### B4 — [MEDIUM] The whiteboard photo is unused — and it's the thesis artifact
`assets/images/052926/whiteboard.jpg` is never placed. The whiteboard literally shows "Jess: Pregnancy → Life insurance" and the voting tally (5× JESS / SARAH+JESS / 4 SAM / 3 BLAKE) — it IS the room "writing Jess a motive," the article's central tension. Strong candidate for The Story or as a second image in the deliberations beat.
- Also unused: photos **1, 2, 3, 4, 5, 9, 11**. Highest-value add beyond the whiteboard is **photo 2** (Alex reading evidence in the open) — it visually supports the Alex-frame argument in Follow the Money. (Skill guidance: all session photos should be used; at minimum add whiteboard + photo 2.)
> Note image `src` path: HTML uses `sessionphotos/052926/...` (resolves from `outputs/`). The whiteboard currently lives at `assets/images/052926/whiteboard.jpg` — must be copied to `outputs/sessionphotos/052926/whiteboard.jpg` (or the `src` pointed accordingly) before it will load.

### B5 — [LOW-MEDIUM] "hours before Marcus died" is an unsupported temporal claim
The Players: "In a bathroom, **hours before Marcus died**, the wife learned the mistress was carrying his child." The bathroom memory (jes004/sar004) is timestamped **1:36 AM**; the latest party memory (mar004 extraction chaos) is **1:50 AM**. Time of death isn't established, but it was clearly near the end of the night — "hours before" likely overstates.
> Fix: drop the interval — "In a bathroom, late that night…" or "In a bathroom, in the final hours of the party…".

### B6 — [LOW-MEDIUM] Remi's storyline is thin
Remi appears in one clause (The Players: "turned proof of his code theft into an alliance with Vic"). Accurate (rem003) and pronoun-correct ("her company"), but minimal vs. full-roster-coverage standard. **rem001** (Remi watched Marcus enter the secret room — currently unused, a 5★ token) could add texture, and the Remi↔Vic funding email shows the rivalry that makes the Vic alliance land.
> Fix: optional 1–2 sentence enrichment; low priority vs. B1–B4.

### B7 — [LOW] Death theories: overdose/self-experimentation and "capitalism" underrepresented as theories
Drunken-fall (✓) and violence+succession (✓) are represented. The whiteboard's "overdose drug poly…" theory and Ezra's "consumed by capitalism" framing (ezr004) appear as *character texture* but not as theories the room weighed. Given the thesis-driven structure this is defensible, but one line acknowledging the room also floated overdose would honor what players discussed.
> Fix: optional single clause in The Story's check-in beat.

### B8 — [LOW] "paid the most to stay unread" — soft boundary inference
What's Missing: "the people who **paid the most to stay unread** are not the ones who got named." Burial does keep content unread, so this is largely fair — but it leans toward implying the big buyers buried *their own* secrets, which Nova can't know (KakiHBD bought 12 tokens spanning many other characters; token→account contents aren't Nova-visible).
> Fix (optional): "paid the most to keep memories buried" keeps it about money + silence, not the buyer's motive.

### B9 — [LOW] Headline "Took the Company" slightly overstates
Sarah is being **approached** to become **interim** CEO (NeurAI leak) — not confirmed installed. The deck and closing soften this correctly ("moved to hand his chair," "intends to approach"). Headline latitude probably covers it; flag only for director comfort.

---

## C. Cross-section redundancy (tracked — no major offenders)
- **Jess–Sarah solidarity** LIVES in The Players (jes004 card + photo 6). Callbacks in Lede/Closing add new context. ✓ Not redundant.
- **KakiHBD concentration** LIVES in Follow the Money; recalled in What's Missing with the new "content is gone" angle. ✓ Good — advances, not repeats.
- **Succession (vic002 / NeurAI leak)** introduced in Follow the Money (Vic account) and developed in Closing. Slight overlap but each adds detail. ✓ Acceptable.
- **Accusation/vote margin** LIVES in The Story; not re-litigated elsewhere. ✓
- No beat is fully re-narrated in 3 sections. Redundancy is not a problem in this draft.

---

## D. Roster coverage audit (all 9 present)
Sarah ✓ (rich) · Jess ✓ (rich) · Vic ✓ (rich) · Ashe ✓ · Alex ✓ (rich) · Riley ✓ · Mel ✓ (needs citations, B1) · **Remi ✓ but thin (B6)** · Sam ✓ (needs citations, B1). No roster member missing; none name-only.

---

## E. Summary for the edit plan
Priority order: **B1 (paper-evidence citations)** and **B2 (Blake pronoun)** are the must-fixes. **B3 (Alex overstatement)** and **B4 (whiteboard photo)** are high-value. **B5–B9** are light polish. No fabrications, no temporal/REMOTE violations, no "Nova exposed" errors, no financial errors. This is a clean draft that mainly needs sourcing discipline and one identity fix.

---

## ADDENDUM — boundary issue caught in thesis discussion (2026-05-31)

**B10 — [HIGH / boundary] "the money did not move toward Jess Kane" overclaims (Pass 1 missed this).** The article asserted the money didn't flow to Jess because no account was *named* Jess — the exact account-name fallacy the boundary rules forbid. ~73% of the money went to KakiHBD, a pseudonym whose operator Nova cannot see; she cannot rule Jess out of it, or any anonymous account. New director input (reports of frequent Jess↔Blake interactions; exposure was not all she was doing at the burial market) makes Jess a behavior-supported, still-unprovable candidate to be behind anonymous burial money. Reframed across lede / Follow the Money / What's Missing / Closing to embrace the unknowability — the market made the money unfollowable — rather than assert Jess's exoneration. The thesis now rests on the two prongs that survive regardless: the collusion charge is contradicted by exposed evidence, and the succession consolidates around Sarah (money-trail-independent).
