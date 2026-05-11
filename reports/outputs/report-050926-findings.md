# Fact-Check Findings — `report-050926.html`

**Pass 1 of 2.** Fact-check only. Copy-edit assessment deferred to Pass 2.
**Editorial intent verified:** all checkpoint feedback fields null; user approved the first pass at every gate; the 5 `selectedArcs` (verdict / coronation / Remi-Vic confrontation / Jamie's ledger / twin apologies) match the article's emphasis. Findings below are pipeline-source-fidelity issues, not violations of user intent.

**Severity legend:** 🔴 critical (factual error, pronoun, or boundary violation) · 🟡 important (overclaim, omission of source-data thread) · ⚪ minor (precision/framing).

---

## SUMMARY

| # | Class | Count |
|---|---|---|
| 🔴 | Pronoun misgendering (Vic, Sam, Ashe, Jamie) | **15 instances** |
| 🔴 | Factual error: 12:50 AM meeting attendees | **3 instances** (body + closing + sidebar mini) |
| 🔴 | Factual error: "the widow has the second [largest account]" | 1 instance |
| 🔴 | Hero photo caption: "Eight people" / photo shows 5 | 1 instance |
| 🟡 | Anonymous accounts (Person $930K, Ie $655K, Ss $75K) entirely omitted from article + financial tracker | structural |
| 🟡 | Financial tracker: only 2 of 6 accounts listed; amounts vague; bars at 0% | structural |
| 🟡 | Director quotes missing: drug-room exchange + Remi's "expose these two" | 2 quotes |
| 🟡 | Ashe "routing her own burials" overclaim (Ashe also held his own $225K account) | 1 instance |
| 🟡 | Photo under-use (4 of 10 used) | structural |
| ⚪ | "Three operators, one beneficiary" elides that the 9:47 transaction went to anonymous Person account, not necessarily Sarah's account | 1 instance |
| ⚪ | Verdict reduction "concluded suicide" elides the actual verdict's preserved ambiguity (suicide OR accidental overdose) | 1 instance |
| ⚪ | Photo 8 caption "four people whose names appear in this morning's routing instructions" — imprecise | 1 instance |
| ⚪ | "Two engineers" for Alex + Remi — Remi is CEO of AIBioComp (technically involved but framing soft) | 1 instance |

---

## HEADER + HERO

### 🔴 H1 — Hero photo caption claims "Eight people"

**File location:** lines 1486, 1489
**Caption:** "After the verdict. Eight people, one conclusion, several quieter ones running underneath."
**Issue:** Photo 10 of 10 shows 5 people: Remi, Alex, Sam (behind Alex), Vic, Jess (per director's character-ID map). Caption claims eight.
**Fix:** Adjust caption to reflect the 5 visible. Suggestion: "Five of the eight, in the final minutes before the police. By then, the verdict had been settled and the accounts had been filled."

---

## LEDE

### ⚪ H2 — "The room concluded suicide" reduces the verdict

**File location:** line 1498
**Issue:** Verdict per `session-config.json` is "Died by his own hand (suicide or accidental overdose)." The article repeatedly says "suicide" alone. The preserved suicide/accident ambiguity is part of the verdict's function — both readings absolve everyone in the room.
**Fix:** Use the actual verdict phrase in the lede (at least once). The headline can keep "by his own hand."

---

## THE STORY section

### ⚪ S1 — "He needed Marcus to answer his phone. Marcus did not answer his phone."

**File location:** line 1504
**Issue:** sam001 token shows Marcus did answer ("MARCUS: It's all good man. You must have misheard."). The next paragraph self-corrects ("By the time Marcus answered…"). The first line reads as factually wrong in isolation, even if the rhetorical sequence works as a beat.
**Fix:** Rephrase the first paragraph to acknowledge Marcus answered with dismissal, OR remove the false beat. Minor — flag for Pass 2 copy edit.

### 🟡 S2 — Twin apologies: only Jess's card displayed; Sarah's content alluded to but not shown

**File location:** lines 1516, 1518–1526
**Issue:** The arc `arc-twin-apologies` is one of the 5 selected. The article displays only Jess's card. Sarah's card (with the identical body, only "S." vs "J." and "Look under panda" vs "Look under dog") is paraphrased but not displayed. Power of the twin-apology beat is dulled when readers can't see them side-by-side.
**Fix:** Pass 2 question — display BOTH cards as paired evidence cards (or one combined card showing the identical body with the two distinct salutations and back-clues).

### 🔴 S3 — Photo 5 caption: "Two women in two very different pieces of this story"

**File location:** lines 1533, 1537
**Issue:** Photo 5 shows Vic and Jess. **Vic = he this session (player-locked pronoun).** "Two women" misgenders Vic.
**Fix:** Suggested caption: "Vic and Jess, looking at the same recovered evidence from two very different angles."

### 🔴 S4 — vic003 paragraph: 4 pronoun errors for Vic

**File location:** line 1552
**Current:** "At 11:35 PM last night, Vic Kingsley stood on the sidewalk outside the party with **her** designer scarf pressed to Marcus's bloody nose. The recovered memory carries **her** own narration. **She** had already decided to replace him as head of NeurAI. Before the fight that put blood on the scarf. Before **her** hand was on his face."
**Fix:** her → his (×3); She → He; "Before her hand was on his face" → "Before his hand was on Marcus's face" (to disambiguate the two "his").

### ⚪ S5 — "Two engineers" for Alex and Remi

**File location:** line 1686 (The Players section)
**Issue:** Remi is CEO of AIBioComp (per the Remi <> Vic Funding Email). She has a "technical team" she works alongside. "Engineer" is loose. Alex is closer to the engineer label per the Cease & Desist (designed and coded the NeurAI codebase).
**Fix:** "two founders" or "two operators with the code on file" or "the engineer and the CEO" — Pass 2 prose choice.

### 🟡 S6 — Missing director quote: drug-room exchange

**Source:** Ashe and Sam in the drug room: "How about we randomly split these in half?" / "No, let's look at them together." (confidence: low on attribution but the exchange is in director notes verbatim.)
**Issue:** Not used anywhere in the article. This is a strong character beat about Ashe and Sam refusing to divide knowledge — temporally safe, attributed-to-pair, character-revealing.
**Fix:** Pass 2 — surface in The Players (Ashe storyline is currently thin) or as a moment that complicates the "everyone is conspiring" reading.

### 🟡 S7 — Missing director quote: Remi's "expose these two"

**Source:** Remi, 10:06 PM, before storming off to Blake: "You did me wrong so I am going to expose these two."
**Issue:** The article uses "But you don't remember that you did it" (the earlier line) but drops the more revealing 10:06 line — which is the *trigger* for the burial run.
**Fix:** Add the 10:06 quote in The Story (near the Remi-Vic argument paragraph) or in Follow the Money.

### 🟡 S8 — Ashe "routing her own burials toward an account credited to Sarah"

**File location:** line 1688 (The Players, last paragraph)
**Issue:** Two problems. (a) Pronoun: "her" for Ashe (= he this session). (b) Overclaim: Ashe ALSO held his own named account ($225K across 2 transactions). He did not route ALL his burials to Sarah; he routed at least one.
**Fix:** "Ashe Motoko introduced himself to Blake as 'an empathetic journalist' before redirecting at least one of his burials toward an account credited to Sarah." (Pronoun + overclaim both fixed.)

### 🔴 S9 — Photo 8 caption: imprecise "four people"

**File location:** lines 1605, 1609
**Caption:** "Vic, Jamie, and Sarah. Three of the four people whose names appear in this morning's routing instructions."
**Issue:** The reading is ambiguous. The actual named accounts are Jamie / Sarah / Ashe (3, not 4). If counting "names that appear in routing observations" (Sarah recipient, Ashe and Vic routers, Jamie account-holder = 4), the language works but it's muddy.
**Fix:** Suggested: "Vic, Jamie, and Sarah. Three of the names that surfaced this morning in the routing instructions, the proceeds, or both."

### 🟡 S10 — "Three operators, one beneficiary. That is choreography."

**File location:** line 1600
**Issue:** The "three operators" are: Sarah handing a token to Blake at 9:47, Ashe gifting to Sarah's account, Vic gifting to Sarah's account. But the 9:47 transaction went to the **anonymous "Person" account ($450K)**, not necessarily to Sarah's named account. The article conflates them.
**Fix:** Either (a) reframe to honor the distinction: "At 9:47, Sarah was observed handing Blake an extracted memory — the same minute the anonymous Person account took its $450,000 transaction. Separately, this morning, Ashe and Vic were each seen routing their own burials into an account credited to Sarah by name. Whether all three of those moves describe one person or two cannot be confirmed from where I sat. The pattern is choreography either way." Or (b) drop "three operators / one beneficiary" framing entirely and treat them as separate observations.

### 🔴 S11 — Jamie pronoun: "they were confident in their innocence"

**File location:** line 1648
**Current:** "Jamie told the room, more than once, that **they** were confident in **their** innocence and comfortable receiving transfers."
**Issue:** Jamie = HE this session.
**Fix:** "he was confident in his innocence."

### 🔴 S12 — 12:50 AM meeting attendees WRONG (critical factual error)

**File location:** lines 1660 (body) + 1705 (closing) + 1834 (sidebar mini)
**Current:** "At 12:50 AM, Vic, Nat Francisco, and Sam stood somewhere quiet and decided Marcus was too far gone."
**Source evidence:**
- mel004 token: "You've called an emergency meeting of the Stanford Four." (Mel called it)
- sam004 token: "MEL calls a meeting of The Stanford 4 sans MARCUS."
- nat004 token content lists "You, NAT and SAM" — but the Stanford Four refers to Marcus + Sam + Mel + Nat (per Mel ↔ Nat texts: "Stanford Four era"). The third person at the 12:50 meeting was **Mel**, not Vic.
- Vic appears nowhere in the Stanford Four cluster. Vic's own arc that night was: vic001 (8:23 PM meeting with Morgan re: Marcus problem), vic003 (11:35 PM firing Marcus on the sidewalk), vic004 (1:08 AM seeing the code comparison with Alex and Remi). Vic was not in the 12:50 Stanford Four meeting.

**Why this matters beyond mechanics:** The 12:50 meeting is the Stanford Four (minus Marcus) confronting their years of complicity with him. That's a *very specific* moral indictment — the Stanford friends who enabled him for years. The article rewrites this as "Vic, Nat, and Sam" which (a) gives Vic an additional decade of complicity he didn't have in source, and (b) lets Mel out of the room entirely. **Mel is in fact the convener of the meeting that the closing builds its entire indictment around.**

**Fix (body):** "At 12:50 AM, Mel Nilsson called an emergency meeting of the Stanford Four sans Marcus. Sam Thorne and Nat Francisco joined her. They had tried for years."

**Fix (closing):** Replace "Sam Thorne, Nat Francisco, and Vic Kingsley spent years enabling Marcus..." → "Sam Thorne, Nat Francisco, and Mel Nilsson spent years enabling Marcus..."

**Fix (sidebar mini):** "Mel, Nat, Sam decide Marcus is too far gone. 12:50 AM."

(Note: Vic's separate complicity-via-Morgan arc is real and worth keeping — but it lives in vic001/mor001, not in the 12:50 Stanford Four moment.)

---

## FOLLOW THE MONEY section

### 🔴 M1 — "The largest was in Jamie's name. The second was in Sarah's."

**File location:** line 1676 (body) + line 1707 (closing repeat) + financial tracker
**Issue:** Of the six accounts, ranked:
1. **Jamie** — $1,299,997
2. **Person** (anonymous) — $930,000
3. **Ie** (anonymous) — $655,000
4. **Sarah** — $385,003
5. **Ashe** — $225,000
6. **Ss** (anonymous) — $75,000

Sarah's named account is FOURTH, not second. The article only counts "named beneficiaries" and treats anonymous accounts as if they don't exist. But the anonymous accounts hold $1.66M — about 47% of all burials — and ignoring them flatly misrepresents the morning's economic structure.

**Fix:** Reframe — Sarah's named account is the largest of the *named-person* accounts after Jamie's; the second-largest *account overall* is anonymous and behaviorally aligned with Sarah's own 9:47 handoff to Blake.

### 🟡 M2 — Anonymous accounts (Person $930K, Ie $655K, Ss $75K) entirely omitted

**File location:** Section "Follow the Money" (lines 1673–1680) is two paragraphs and never mentions any anonymous account.
**Issue:** $1.66M unaccounted for. The Person-Sarah behavioral hypothesis (which the director has affirmed Nova can build) is never floated. Total burials of ~$3.57M never stated. The whole "Follow the Money" reads thinner than the source supports.

**Boundary-safe framing for Pass 2** (the director-approved hypothesis):

> Three accounts in the morning's ledger bore no names. The largest of them, recorded only as "Person," opened its first transaction at 9:08 PM and closed its run at 9:47 PM with a single $450,000 hand-off — the exact minute, by independent observation, that Sarah Blackwood was seen handing Blake an extracted memory. I cannot confirm who operated that account. I can describe the pattern: four transactions in thirty-nine minutes, three of them in the first eleven minutes, and a final $450,000 deposit at the exact moment Sarah Blackwood was at Blake's table. Read it as you like.
>
> Two other anonymous accounts — "Ie" and "Ss" — buried another $730,000 between them. I cannot name their operators. I can note that, between the named and the anonymous columns, $3.57 million in memories moved through Blake's table in seventy-two minutes. The widow's named account holds the smaller half of the gift.

**Fix:** Expand Follow the Money to ~3-4 paragraphs incorporating anonymous accounts and the Person-9:47-Sarah behavioral chain. This is the section that should grow back what's cut from the false closing claim.

### 🔴 M3 — Financial tracker (inline + sidebar): only 2 accounts, vague amounts, bars at 0%

**File location:** lines 1713–1738 (inline) + lines 1744–1769 (sidebar). Both versions identical.
**Issues:**
- Only Jamie and Sarah listed. Person, Ie, Ashe, Ss all missing.
- Amounts are descriptions ("Largest single concentration of the morning") instead of figures.
- All `style="width: 0%"` — bars don't render proportionally.
- "Multi-million dollar concentration across two named beneficiaries" total — undersells (only counts 2 of 6 accounts) and the "two named beneficiaries" claim ignores Ashe.

**Fix:** Rebuild tracker with all 6 accounts, real amounts, real bar widths. (Note: this is a dual-location edit per CLAUDE.md — change BOTH the inline `financial-tracker--inline` AND the sidebar `financial-tracker` blocks.)

Specifically:
- Jamie's 'Volt' Woods (named, declared comfortable): **$1,299,997** — bar 100%
- "Person" (anonymous; 9:08–9:47 PM activity matches Sarah's observed 9:47 hand-off to Blake): **$930,000** — bar 72%
- "Ie" (anonymous): **$655,000** — bar 50%
- Sarah Blackwood (named; received gifted routing from Ashe and Vic): **$385,003** — bar 30%
- Ashe Motoko (named; also seen routing one or more burials to Sarah): **$225,000** — bar 17%
- "Ss" (anonymous): **$75,000** — bar 6%
- TOTAL: **$3,569,997 across six accounts in seventy-two minutes.**

### 🔴 M4 — Closing "The widow has the second" (factual error, repeat of M1)

**File location:** line 1707
**Fix:** Replace with a phrasing that's true: "Jamie has the largest single account in this morning's ledger. The widow has the largest of the named-recipient accounts after his — fourth overall, behind two that bear no names at all."

---

## THE PLAYERS section

### 🔴 P1 — Sam pronoun: 4 errors in one paragraph

**File location:** line 1686 (paragraph 2 of The Players)
**Current:** "Sam Thorne released **his** own panicked text thread, the one where **he** threatened to walk away from Marcus and **his** 'special memory drugs.' That is not a flattering self-portrait. **He** filed it anyway."
**Issue:** Sam = SHE this session (player-locked).
**Fix:** "Sam Thorne released her own panicked text thread, the one where she threatened to walk away from Marcus and her 'special memory drugs.' That is not a flattering self-portrait. She filed it anyway."

### 🔴 P2 — Vic pronouns in The Players

**File location:** line 1686 (same paragraph)
**Current:** "Vic Kingsley released **her** own scarf-against-Marcus's-nose moment, a venture capitalist documenting the exact minute **she** decided to withdraw."
**Fix:** "Vic Kingsley released his own scarf-against-Marcus's-nose moment, a venture capitalist documenting the exact minute he decided to withdraw."

### 🔴 P3 — Ashe pronouns in The Players

**File location:** line 1688
**Current:** "Ashe Motoko introduced **herself** to Blake as 'an empathetic journalist' before quietly routing **her** own burials toward an account credited to Sarah."
**Fix:** "Ashe Motoko introduced himself to Blake as 'an empathetic journalist' before redirecting at least one of his burials into an account credited to Sarah." (Pronoun + S8 overclaim both fixed here.)

### ⚪ P4 — "Six people in that room this morning chose to put their own memories on the table. Two operated from somewhere quieter."

**File location:** line 1684
**Issue:** Count is imprecise. Of 8 roster players, 7 have at least one of their own tokens in the exposed list (Sarah is the sole player who exposed none of her own tokens; all four sar*** tokens were buried). So 7 + 1, not 6 + 2. But the article is using "put their own memories on the table" rhetorically to mean "released a self-incriminating self-narrated memory in The Story." Under that reading, Sam, Jess, Remi/Alex (paired), Vic, Jamie are explicitly cited as releasing their own — that's 5 distinct players (or 6 if we count Remi + Alex as two), and Sarah + Ashe are "somewhere quieter." The math works if you count generously.

**Fix:** Flag for Pass 2 copy-edit clarity. Either keep the rhetorical "six/two" and let the prose count for itself, or sharpen to "Seven of the eight chose to put at least one of their own memories on the table this morning. Sarah Blackwood did not."

### 🟡 P5 — Photo under-use: photos 1, 2, 3, 9 not used

**Issue:** Only photos 4, 5, 6, 7, 8, 10 are referenced. Photos 1 (Sam + old posters of parties she threw with Marcus), 2 (Alex/Sarah/Jamie post-collusion exchange), 3 (Sarah/Alex hushed conversation), 9 (Ashe foreground + Jess/Remi background negotiation) are not embedded. Photo 2 and 3 are *perfect* for the "Are you colluding?" beat the article DOES tell verbally. Photo 1 supports Sam's character. Photo 9 supports Ashe's role.

**Fix (Pass 2 placement choices, not fact-check):**
- Photo 2 or 3 → just after the "Sarah and Alex were also seen in a hush-hush conversation" paragraph (line 1600).
- Photo 1 → with Sam's drug-supplier paragraph in The Story (line 1504) or Sam's storyline in The Players (line 1686).
- Photo 9 → in Follow the Money or What's Missing, illustrating the parallel-track investigation work.

---

## WHAT'S MISSING section

### 🔴 W1 — Vic pronoun in W's Missing

**File location:** line 1696
**Current:** "I do not know how long Vic had been planning to replace Marcus before **her** scarf was on his face."
**Fix:** "his scarf was on Marcus's face." (Disambiguates the two "his" too.)

### ⚪ W2 — Section is strong as written

The "panda / dog" framing is one of the article's better moves — uses literal source text and turns the puzzle-prop into a metaphor for everything Nova couldn't see. Keep as is, only fix the W1 pronoun.

---

## CLOSING section

### 🔴 C1 — 12:50 AM meeting attendees WRONG (repeat of S12)

**File location:** line 1705
**Current:** "Sam Thorne, Nat Francisco, and Vic Kingsley spent years enabling Marcus before deciding, at 12:50 AM last night, that he was too far gone."
**Fix:** "Sam Thorne, Nat Francisco, and Mel Nilsson spent years enabling Marcus before deciding, at 12:50 AM last night, that he was too far gone." (Mel, not Vic.)

**Note for Pass 2:** Vic's *separate* complicity arc (8:23 PM meeting with Morgan about "the Marcus problem"; deciding to fire him before the punch-up; the scarf moment) is real and powerful — but it's a different track than Stanford Four enabling. If the closing wants to keep Vic, frame it correctly: "Sam, Nat, and Mel were the Stanford Four sans Marcus — three friends who had spent years enabling him. Vic Kingsley was the investor who decided to replace him before the blood was on his scarf. Different timelines, same destination."

### 🔴 C2 — Vic pronoun in closing

**File location:** line 1705
**Current:** "Vic decided to replace him before the blood was on **her** scarf."
**Fix:** "his scarf."

### 🔴 C3 — "The widow has the second" (repeat of M1/M4)

**File location:** line 1707
**Fix:** See M4.

---

## SIDEBAR EVIDENCE-CARD MINIS

### 🔴 SB1 — "12:50 AM, Out of the Room" mini carries the same Vic error

**File location:** line 1834
**Current:** "Vic, Nat, Sam decide Marcus is too far gone. 12:50 AM."
**Fix:** "Mel, Nat, Sam decide Marcus is too far gone. 12:50 AM."

### ✓ All other sidebar minis match body and are accurate.

---

## EVIDENCE CARD CONTENT INTEGRITY

All evidence cards in the body display verbatim source content. No fabrication. Quote integrity ✓.

One note: the "The Other Rose" evidence card displays Jess's card content but lists owner as "Marcus Blackwood" (the author). Sarah's Card paper-evidence record lists Sarah as owner. Either convention is defensible (author vs recipient); flag for Pass 2 consistency choice if the twin cards are reframed.

---

## ROSTER COVERAGE CHECK

All 8 roster players appear by name AND have a beat:

| Player | Coverage |
|---|---|
| Sarah | ✅ Marriage, divorce, paternity twin, 9:47 hand-off, hush-hush with Alex, CEO leak |
| Sam | ✅ 8:25 PM texts, drug supplier, panicked exposure (pronouns wrong — fix) |
| Jamie | ✅ $100/conversation, freeze-and-be-invisible, $1.3M account, performance of innocence (pronouns wrong in one line — fix) |
| Vic | ✅ 11:35 PM scarf, $30M fraud, code reveal at 1:08 AM, fired Marcus (pronouns wrong throughout — fix) |
| Jess | ✅ Pregnant, bathroom moment, twin card, "enough money for my baby," voluntary reveal |
| Ashe | ⚠️ Thin — only "empathetic journalist" + gift to Sarah. Misses Ashe's exposé being suppressed (taylor.chaser → marcus email "Done") and ash001 (Marcus calling Kai "just a vendor"). (Pronoun wrong — fix.) Pass 2: strengthen. |
| Alex | ⚠️ Thin — code reveal + private conversation with Sarah. Could weave in Alex's BizAI history with Marcus, the Cease & Desist Letter, the Alex<>Remi "take that asshole down" emails (premeditation). Pass 2: strengthen. |
| Remi | ✅ Secret room, code comparison, "you don't remember," 10:06 storm-off (missing "expose these two" quote — fix S7) |

**Two roster players (Ashe + Alex) have name appearance but underweighted storyline.** Pass 2 should expand both.

---

## THESIS / EDITORIAL INTENT CHECK

The article's thesis — "the verdict was the deal" / unanimous self-harm absolves everyone in the room — is **correct** and **matches the user's selected arcs**. The bones are right. The errors above are mostly source-fidelity (pronouns + the Mel/Vic confusion + the omitted anonymous accounts), not thesis errors.

**One thesis-adjacent gap:** the article surfaces Sarah's coronation, Jamie's ledger, Remi-Vic confrontation, twin apologies, and the verdict — but does NOT explicitly draw the line that the verdict was *the deal* that allowed the morning's choreography to land. The closing comes close ("the verdict the room reaches is the verdict the market clears") but the connection between "unanimous self-harm verdict" and "$3.57M in burials, the widow inheriting NeurAI, the bartender topping the table" is implicit rather than load-bearing. Pass 2 question: should the closing tighten this connection, or is the current implicit reading preferable to didactic narration?

---

## CRITICAL FINDINGS — DO-FIRST LIST

The fixes that absolutely must land before publication:

1. **All 15 pronoun corrections** (Vic he, Sam she, Ashe he, Jamie he in one line).
2. **12:50 AM meeting**: Vic → Mel in body, closing, and sidebar mini.
3. **Hero photo caption**: not "Eight people."
4. **Photo 5 caption**: not "Two women."
5. **"The widow has the second"**: Sarah's named account is 4th overall.
6. **Financial tracker**: list all 6 accounts with real numbers; rebuild bar widths; update both inline and sidebar versions in sync.
7. **Anonymous accounts surfaced** in Follow the Money: Person/Ie/Ss exist and hold $1.66M. The Person-Sarah behavioral hypothesis is director-approved as boundary-safe.

The rest (missing director quotes, photo under-use, Ashe/Alex storyline expansion, twin-card display, closing connective tissue) live in Pass 2.

---

**STOP. Awaiting director review before Pass 2.**

Please flag any findings you disagree with, missing facts I should know, or additional emphasis you want surfaced before I run the copy-edit pass.
