# Edit Plan — Session 051726 Copy-Edit (Cycle 2)

Scope: headline + deck rewrite (director-approved) + paragraph splits in FTM + targeted tightenings. The deferred fact-check items (A11 photo verify) were resolved in Cycle 1.

## Director-approved scope

- **Headline + deck rewrite** (replaces "The Verdict the Room Could Agree On" with the corporate-succession framing — director approved 2026-05-20)
- E1: Split FTM3 paragraph (Ziadidit + Morgan Reed) into two
- E2: Split FTM4 paragraph (Jamie + Maria-Vic) into two
- E6: Tighten marriage paragraph S16 (remove redundancy introduced by fact-check fix)
- E8: Drop "on their side of the ledger" from WM1

**Items I'm calling, will redirect if needed:**
- E3 (lede L3 "I want to walk you through"): KEEP. Cassandra's confident-reporter cadence; not throat-clearing.
- E4 (S1 "So I want to ask the question"): APPLY a light tightening. Removes a soft transition before the actual question.
- E7 (TP1 Remi-Sam compression): KEEP current. The two-clause structure gives Sam more visible agency, which is the "Some choices belong on the record" paragraph's whole purpose.

## Edit order

Top-to-bottom of HTML. Headline/deck go first since they update header-area locations (title, meta, og tags, h1, deck `<p>`).

---

### Edit 1 — Headline (replace_all)

**Updates 3 locations simultaneously:** `<title>` element, `<meta property="og:title">` content, and `<h1 class="nn-article__headline">`. All three contain the exact same headline string.

**Find (`replace_all: true`):**
```
The Verdict the Room Could Agree On
```

**Replace with:**
```
Marcus Blackwood&#x27;s Death Investigation Decided NeurAI&#x27;s Next CEO
```

**Rationale:** Director-approved. Replaces an atmospheric thesis-fragment with a journalism-grade declarative claim. Names two proper nouns (Marcus Blackwood, NeurAI), establishes the corporate-succession frame as the news, and tells the reader the genre (investigative business journalism) before the article body unfolds the evidence.

---

### Edit 2 — Deck (replace_all)

**Updates 3 locations simultaneously:** `<meta name="description">` content, `<meta property="og:description">` content, and `<p class="nn-article__deck">`. All three contain the exact same deck string.

**Find (`replace_all: true`):**
```
Eighteen people built a clean case against the one person who was no longer in the building. By end of day, NeurAI was naming its next CEO.
```

**Replace with:**
```
Eighteen people gathered to investigate Marcus Blackwood&#x27;s death. By the time they left, the verdict had named the one suspect who had already fled. His widow was on the path to inherit his company.
```

**Rationale:** Pairs with the new headline. Names Marcus, escalates the structural irony (verdict against the one who fled + inheritance), and ends on a concrete consequence ("widow was on the path to inherit his company") rather than a procedural restatement.

---

### Edit 3 — The Story S1 light tightening (E4)

**Section:** THE STORY, opening paragraph.

**Find:**
```
The verdict turned on the IP theft. So I want to ask the question the verdict skipped. What exactly did Marcus steal, and from whom?
```

**Replace with:**
```
The verdict turned on the IP theft. The question it skipped: what exactly did Marcus steal, and from whom?
```

**Rationale:** "So I want to ask the question the verdict skipped" is throat-clearing before the actual question. The compressed version puts the question itself one beat closer to the reader.

---

### Edit 4 — Marriage paragraph S16 tighten (E6)

**Section:** THE STORY, marriage-machinery paragraph.

**Find:**
```
By 12:50 AM, Mel had called an emergency Stanford Four meeting and was openly weighing blackmail to recover Marcus&#x27;s money for Sarah. The legal machinery had been moving for almost a day already. Mel&#x27;s email to his partners at Patchwork Law Firm, announcing he had taken Sarah on as a client effective immediately, was timestamped 2:08 AM the morning of the party.
```

**Replace with:**
```
By 12:50 AM, Mel had called an emergency Stanford Four meeting and was openly weighing blackmail to recover Marcus&#x27;s money for Sarah. Mel&#x27;s email to his partners at Patchwork Law Firm, announcing he had taken Sarah on as a client effective immediately, had been timestamped 2:08 AM the morning of the party. Almost a day before.
```

**Rationale:** The "The legal machinery had been moving for almost a day already" sentence (introduced in Cycle 1 to fix the timeline) is redundant with the next sentence (which explicitly states the timestamp). Cutting it and ending the paragraph beat with "Almost a day before." preserves the temporal-correction work while removing the throat-clearing setup.

---

### Edit 5 — FOLLOW THE MONEY split FTM3 (E1)

**Section:** FOLLOW THE MONEY, Ziadidit paragraph.

**Find:**
```
        <p>The Ziadidit account had its only transaction at 09:04 AM. Four hundred fifty thousand dollars at mention-tier value, placed in the closing minute of the burial market before Blake closed the window for deliberation. The room had not yet sat down to name suspects. The account itself had been registered at Blake&#x27;s table under that name, Ziadidit, visible to the operator who would later call the vote. Someone was not betting on which way the room would go. Someone was telling the room which way to go. And one other account uses Morgan Reed&#x27;s full character name, where every other roster-aligned account uses just a first name. The data does not distinguish whether that was Morgan, or someone else choosing her name.</p>
```

**Replace with:**
```
        <p>The Ziadidit account had its only transaction at 09:04 AM. Four hundred fifty thousand dollars at mention-tier value, placed in the closing minute of the burial market before Blake closed the window for deliberation. The room had not yet sat down to name suspects. The account itself had been registered at Blake&#x27;s table under that name, Ziadidit, visible to the operator who would later call the vote. Someone was not betting on which way the room would go. Someone was telling the room which way to go.</p>

        <p>One other account uses Morgan Reed&#x27;s full character name, where every other roster-aligned account uses just a first name. The data does not distinguish whether that was Morgan, or someone else choosing her name.</p>
```

**Rationale:** Lets the Ziadidit pre-framing observation land on its terminal beat ("telling the room which way to go") without being diluted by the secondary Morgan-Reed-account observation. The Morgan Reed account remains as a short standalone observation.

---

### Edit 6 — FOLLOW THE MONEY split FTM4 (E2)

**Section:** FOLLOW THE MONEY, Jamie + Maria-Vic paragraph.

**Find:**
```
        <p>The Jamie account is the largest haul on the ledger: one and a half million dollars across seven burials, cross-character in scope. Jamie admitted ownership openly during deliberations, citing bill-paying. The room accepted it. The seven-burial scope did not surface in the accounting. At 08:38 AM, I watched Vic Kingsley ask Blake, &#x27;I would like to disappear this evidence,&#x27; and watched Blake peel off with her into a corner I could not hear. At 08:38 AM the Maria account opened its first burial. Maria received two more, at 09:00 and 09:07, totaling six hundred twenty-five thousand across mention-tier and party-tier values. Of Vic&#x27;s four POV memories, only the one in which she and Alex discover NeurAI&#x27;s AI is worthless reached the public record. The other three are unaccounted for. I cannot tell you who walked memories to Blake. I can tell you what I watched, and I can tell you what Maria absorbed.</p>
```

**Replace with:**
```
        <p>The Jamie account is the largest haul on the ledger: one and a half million dollars across seven burials, cross-character in scope. Jamie admitted ownership openly during deliberations, citing bill-paying. The room accepted it. The seven-burial scope did not surface in the accounting.</p>

        <p>At 08:38 AM, I watched Vic Kingsley ask Blake, &#x27;I would like to disappear this evidence,&#x27; and watched Blake peel off with her into a corner I could not hear. At 08:38 AM the Maria account opened its first burial. Maria received two more, at 09:00 and 09:07, totaling six hundred twenty-five thousand across mention-tier and party-tier values. Of Vic&#x27;s four POV memories, only the one in which she and Alex discover NeurAI&#x27;s AI is worthless reached the public record. The other three are unaccounted for. I cannot tell you who walked memories to Blake. I can tell you what I watched, and I can tell you what Maria absorbed.</p>
```

**Rationale:** Separates the two big observations (Jamie account's cross-character scope vs. the Maria-Vic juxtaposition). The boundary hedge at the end ("I cannot tell you who walked memories to Blake. I can tell you what I watched, and I can tell you what Maria absorbed") clearly applies to Maria; the split makes that scope explicit. Easier to follow at ~90 words per paragraph instead of ~180.

---

### Edit 7 — WHAT'S MISSING drop "on their side of the ledger" (E8)

**Section:** WHAT'S MISSING, paragraph 1.

**Find:**
```
I can tell you the pattern: the people most adjacent to the morning&#x27;s central threads also have the most unaccounted POV memories on their side of the ledger. Whether that means they sat on evidence, or someone else found their tokens and chose not to surface them, I cannot say.
```

**Replace with:**
```
I can tell you the pattern: the people most adjacent to the morning&#x27;s central threads also have the most unaccounted POV memories. Whether that means they sat on evidence, or someone else found their tokens and chose not to surface them, I cannot say.
```

**Rationale:** "On their side of the ledger" is a mixed metaphor — the burial market has a ledger, but POV memories are owned by characters, not on the ledger as such. Removing the phrase tightens the sentence without losing meaning.

---

## Dual-location parity check

Edits affecting dual-location:

| Edit | Affected locations | Strategy |
|---|---|---|
| 1 (headline) | `<title>`, `<meta og:title>`, `<h1>` (3 places) | `replace_all` — all three contain identical headline string |
| 2 (deck) | `<meta description>`, `<meta og:description>`, `<p deck>` (3 places) | `replace_all` — all three contain identical deck string |
| 3–7 | single locations each | `replace_all: false` |

**No financial-tracker or sidebar evidence-mini changes in this cycle.** Sidebar contents stay as fact-corrected in Cycle 1.

## Verification checklist after edits

1. Search HTML for `"The Verdict the Room Could Agree On"` — confirm zero matches.
2. Search HTML for `"Marcus Blackwood&#x27;s Death Investigation Decided NeurAI&#x27;s Next CEO"` — confirm 3 matches (title, og:title, h1).
3. Search HTML for `"clean case against the one person who was no longer in the building"` — confirm zero matches (old deck).
4. Search HTML for `"Eighteen people gathered to investigate Marcus Blackwood&#x27;s death"` — confirm 3 matches (meta, og:description, deck `<p>`).
5. Search HTML for `"So I want to ask the question"` — confirm zero matches.
6. Search HTML for `"The legal machinery had been moving"` — confirm zero matches.
7. Search HTML for `"And one other account uses Morgan Reed"` — confirm zero matches (old, joined paragraph).
8. Search HTML for `"One other account uses Morgan Reed"` — confirm one match (new, split paragraph).
9. Search HTML for `"on their side of the ledger"` — confirm zero matches.
10. Open the HTML in a browser — confirm layout intact, new headline + deck render correctly, FTM section now reads as four paragraphs (FTM1 intro, Ziadidit, Morgan Reed account, Jamie, Maria-Vic).
