# Refinement Findings — report-040426.html

## SECTION-BY-SECTION FACT-CHECK

---

## ❌ CRITICAL FACT ERRORS (must fix)

### F1. "Sarah and Morgan" director observation attributed to wrong characters
**Article (the-players, ~line 1640):** "She [Vic] and Morgan Reed had hushed conversations all morning, the kind I have learned to read as crisis management."

**Source (director-notes.json):** "Sarah and Morgan had hushed conversations early in the investigation"

**Severity:** HIGH. The article changes the participants from **Sarah/Morgan** to **Vic/Morgan**, fundamentally altering character dynamics. This is a critical observation for the accusation against Sarah — Sarah being seen in hushed conversation with Marcus's crisis manager THIS MORNING is heavy circumstantial weight. The article erases it.

**Fix:** Restore the observation to Sarah and Morgan. Consider how it lands with the closing accusation.

---

### F2. Geographical error — "another part of the house"
**Article (the-story, ~line 1510):** "He just said okay and left… **Three minutes later in another part of the house**, Remi Whitman watched Marcus slip into a hidden room adjoining the party space."

**Source:**
- sar001 (8:59PM): Sarah at her own home with the paternity test telling Marcus to leave
- rem001 (9:02PM): Remi watches Marcus enter a secret room "adjoining the party space" — i.e., the warehouse party

**Severity:** HIGH. Sarah is at her HOME mailbox; Remi is at the WAREHOUSE PARTY. These are two different locations. Marcus cannot be in both places three minutes apart. The "another part of the house" fabricates spatial continuity.

**Additional issue:** The article frames sar001 as if 8:59PM is the moment Sarah was at the mailbox. The token timestamp is when Sarah is *recalling/processing*, not necessarily when the events happened. The actual confrontation likely happened earlier in the evening (Marcus would need to drive from Sarah's house to the warehouse).

**Fix:** Decouple the two scenes. Sarah's confrontation happens at her house (some earlier time); Remi's observation is at the warehouse. Don't claim spatial proximity.

---

### F3. Article date displays Feb 21, datetime attribute says Feb 22
**Article (header, ~line 1467-1469):**
```html
<time class="nn-article__date" datetime="2027-02-22">
  February 21, 2027
</time>
```

**Severity:** MEDIUM. The party was Feb 21 night. The investigation/article is Feb 22 morning. The displayed date contradicts the body's repeated "this morning" framing. The datetime attribute is correct (2027-02-22); the display text is wrong.

**Fix:** Change displayed text to "February 22, 2027".

---

## ❌ BOUNDARY VIOLATIONS (Nova claims things she cannot know)

### B1. Implied account-to-arc mapping (Bob)
**Article (follow-the-money, ~line 1612):** "The corporate-elimination thread, the one Alex and Remi proved at 1:08 AM with a laptop and a side-by-side, did not get to leave that room intact. **Bob made sure of part of it.**"

**Issue:** This implies Bob's account holds the corporate-elimination memories. Nova has no token-to-account mapping. She cannot know which arc was buried in which account. (Coincidentally correct — Bob does hold Alex+Remi tokens — but Nova has no source for this.)

**Fix:** Either remove the linkage entirely or rephrase as pattern speculation grounded only in number-of-payments shape. Don't tie Bob to a specific arc.

### B2. Implied account-to-arc mapping (Unicorn)
**Article (follow-the-money, ~line 1614):** "Skyler's prototype deadline and Quinn's PT-3A blackmail both depended on Marcus staying useful, and now that he is not, **the silence around those deals has a price tag. Unicorn's pace looks like cleanup.**"

**Issue:** Implies Skyler/Quinn-related memories sit in Unicorn. Nova cannot know this. The basis for the speculation is the 10:02 director observation (Ezra/Skyler/Blake/Zia shared burials), which only mentions Ezra/Skyler/Zia — Quinn is NOT in that observation. Linking Quinn to Unicorn has no source at all.

**Fix:** Reframe to acknowledge only what Nova actually saw (the 10:02 huddle). Don't decode WHICH account corresponds. Drop Quinn from the Unicorn association entirely.

### B3. "Whose memory is in the Lorenzo account?"
**Article (whats-missing, ~line 1652):** "Whose memory is in the Lorenzo account, the only single-payment mid-six-figure burial of the morning?"

**Status:** BORDERLINE. Asking the question is acceptable since Nova has no answer. But the framing suggests "I just don't have the data yet" rather than "this is structurally unknowable." Slight refinement needed.

**Fix:** Reframe as "I cannot tell you" rather than as an open mystery.

### B4. "I cannot tell you whose memories went where" (correct framing!)
**Article (follow-the-money, ~line 1618):** "I cannot tell you whose memories went where. The Black Market display does not show ownership and Blake does not show their work."

**Status:** ✓ GOOD. This is the correct boundary-respecting framing. The problem is that B1 and B2 above contradict it within the same section. The article *says* it cannot tell you, then proceeds to tell you anyway through implication.

---

## ❌ PRONOUN VIOLATIONS (unverified character pronouns)

### P1. Vic Kingsley — given she/her without source
- "Vic Kingsley stood there and used the word 'dumbfounded' in **her** own recovered memory, which is the kind of word a venture capitalist only uses when **she** has lost a lot of money in the last six seconds." (the-story)
- "Vic Kingsley stood in the middle of the laptop reveal looking, in **her** own words, dumbfounded. Then **she** went back to work. **She** and Morgan Reed…" (the-players)
- Sidebar: "Vic learns **her** flagship investment is worthless."

**Source check:** Character sheet uses neutral language ("you", "your"). vic004 token uses "you". No source for she/her.

**Action:** Ask director for Vic's player pronouns.

### P2. Morgan Reed — given she/her without source
- "Marcus reached into his bag and handed **her** a bribe instead." (the-story)
- "Morgan, for **her** part, delivered an extensive list of motives… as if **she** had been keeping the receipts in alphabetical order. Maybe **she** had." (the-players)

**Source check:** Character sheet uses "they/them" implicit. mor003 uses "you". No source for she/her.

**Action:** Ask director for Morgan's player pronouns. Likely they/them.

### P3. Remi Whitman — given she/her without source
- "what **she** had found" (the-story)
- "Remi brought the laptop." (caption)

**Source check:** rem001/rem004 use "you". Character sheet not yet read for Remi.

**Action:** Ask director for Remi's player pronouns.

### P4. Riley Torres — given she/her without source
- "Riley Torres walked up with a folder that should have been the case of **her** career."

**Source check:** mel003 uses "they/their" for Riley: "RILEY revealed **their** cards" / "**they're** giving it all to you". Character sheet uses "you/your" but consistently neutral. Riley most likely they/them based on mel003.

**Action:** Likely INCORRECT. Ask director — Riley appears to be they/them based on mel003.

### P5. Mel Nilsson — given she/her without source
- "Mel was getting handed something else." (neutral, OK)
- "Mel wrote the verdict down before **she** left the room." (the-story)
- "**She** and Morgan Reed had hushed conversations" — wait, this is Vic, not Mel. Let me re-check.
- "took **her** client's call and **her** best friend Riley's career-making case" (the-players)

**Source check:** mel001-004 use "you". Mel's email paper evidence signed "Mel" only. Character sheet not yet read.

**Action:** Ask director for Mel's player pronouns.

### Pronouns that ARE safe (gendered names + spousal narrative):
- Sarah Blackwood: she/her ✓
- Jess Kane (Jessicah): she/her ✓
- Marcus Blackwood: he/him ✓ (deceased)

### Pronouns mentioned that look correct:
- "Jamie Volt Woods made **themselves** invisible" — neutral, defensible

---

## ❌ MISSING DIRECTOR QUOTE (the only one we have)

The director observed exactly ONE direct quote from this morning's investigation:

**Sam → Flip: "Your secret is safe with me"**

This quote is NOT used anywhere in the article. It is:
- The ONLY sourced overheard quote available
- Temporally safe (witnessed during investigation)
- Character-revealing (Sam, Flip, secret-keeping dynamic)
- Connects to Flip's hidden identity as Phil Kowalski (paper evidence + character sheet)
- A perfect "show don't tell" moment for the article

**Action:** Weave this quote into the article. The Players or What's Missing section is a natural fit.

---

## ❌ WEAK / MISSING ROSTER COVERAGE

Per the skill: each roster member needs (1) name + (2) sourced storyline contribution.

### Weak coverage (named but storyline absent or trivial):

**Flip** — only "Kai Andersen and Flip held their cards tighter than most." Should mention:
- The loan from Marcus (fli001 exposed)
- Hidden identity as Phil Kowalski (fli002 + paper evidence Jamie's napkin notes + Flip's IOU paper)
- Riley flirtation (fli004 + ril004 both exposed)
- Sam's drug-mediated escape (fli004 — "the drugs help you smile… the imposter syndrome recedes")
- Sam → Flip "Your secret is safe with me" — ties to identity reveal

**Kai Andersen** — only "Kai Andersen and Flip held their cards tighter." Should mention:
- Marcus insulted Kai ("I hired you to decorate, not think") — ash001 exposed
- Discovered the Synesthesia Engine code theft with Cass — kai004 + cas004
- The install brief Marcus sent (paper evidence)

**Ezra Sullivan** — only mentioned in the surveillance line. Should mention:
- The Ashe interview about capitalism (ezr004 exposed) — "the rest of kids - CASS, QUINN, SKYLER, ZIA - they still believe change is possible. If you have to watch that die in them too, you don't know if you'll have any hope for the future left."
- Advised Quinn about Marcus (ezr003 exposed)

**Nat Francisco** — only "Nat Francisco had been telling her to intervene with Marcus for years." Should mention:
- Stanford Four membership (Sam, Mel, Nat, Marcus)
- Director-observed conversation with Blake about sweet pastries (color/character detail — director observation #8)

### Solid coverage:
Sarah, Jess, Marcus, Mel, Alex, Remi, Vic, Morgan, Riley (lightly), Quinn, Skyler, Jamie, Sam, Taylor, Ashe, Zia

---

## ❌ FACTUAL CLAIMS NEEDING VERIFICATION

### V1. Hero photo character IDs (4 of 10 captioned)
- Hero: "Mel Nilsson, Sam Thorne, Remi Whitman, and Skyler Iyer"
- (4 of 10): "Sarah Blackwood with the investigator earlier in the morning"
- (8 of 10): "Remi Whitman and Kai Andersen"
- (2 of 10): "Remi Whitman and Mel Nilsson"

**Action:** All four photo character IDs need director verification or AI photo re-analysis. Pipeline guesses are unreliable.

### V2. "Sarah and Jess walked out of that house together"
**Article (closing, ~line 1665):** "Sarah and Jess walked out of that house together."

**Source:** Director observation only says they "have disappeared" + warrant issued for both. The accusation theory was that they collaborated, but Nova does NOT independently know they walked out together. This stating-as-fact a contested theory.

**Action:** Soften to "Sarah and Jess are both gone" or similar that doesn't assert physical co-departure.

---

## ✅ CORRECT FACTS (verified, no action needed)

- Total buried $3,765,000 ✓ (sum of admin-adjusted shell account totals — orchestrator's `totalBuried` field of $2,590,000 is stale and should be ignored; the admin-adjusted per-account totals are authoritative)
- Bob $1,080,000 (4 payments), Donut $925,000 (3), Unicorn $755,000 (7), Customs $555,000 (4), Lorenzo $375,000 (1), Star $75,000 (1) ✓
- 19-player roster ✓
- Accusation: Sarah and Jess for murder in collusion ✓
- Vote was wide margin ✓
- Quinn was initially suspected (blackmail) then dismissed ✓
- 11:32 PM Alex punches Marcus, Sarah pulls him off ✓
- 11:09 PM Riley hands Mel the case ✓
- 11:22 PM Morgan/Marcus hammock confrontation, bribe ✓
- 12:32 AM Skyler ultimatum to Marcus about prototype ✓
- 12:50 AM Mel calls emergency Stanford Four meeting ✓
- 1:08 AM laptop reveal — Vic, Alex, Remi see code comparison ✓
- 1:36 AM Sarah/Jess bathroom solidarity ✓
- 1:50 AM Marcus's POV of extraction protocol ✓
- "dumbfounded" word from vic004 ✓
- Quinn's PT-3A blackmail → 10PM bar delivery ✓
- NeurAI/AiBioComp merger announcement ✓
- Alex AND Remi promoted to executive team ✓
- Jess and Sarah disappeared, warrant issued ✓
- Sam in good spirits despite raid ✓
- Taylor pulled nearly 2x Ashe's tokens ✓
- Morgan delivered extensive motive list ✓
- Jamie 10:02 observation of Ezra/Skyler/Blake/Zia shared burials ✓
- Hammock conversation Taylor/Sam (compensation) ✓
- Senator Walsh threat from Morgan (mor003 sourced) ✓
- "Take care of it, like you always do" from Marcus (mor003 sourced) ✓
- "Marcus didn't even change the comments" (rem004 sourced) ✓
- 42-minute window from 1:08 to 1:50 ✓ (math correct)

---

## NOTES FOR PHASE 3 (copy edit)

- The closing actually does the bridge-to-systemic test reasonably well ("Every person reading this is a few years away from the same volunteer form" — anchored to the specific Marcus-volunteers-to-demo-his-own-tech moment).
- The article is tight on length. Cuts should focus on the bloated middle of "The Story" where the timeline becomes a list.
- Some sentences are throat-clearing: "Hold Sarah at the kitchen table for a second and pivot to the corporate ledger" / "I keep coming back to that handoff."
- "Sarah, of all people, who by then had her own reason to let the punch land." — strong.
- "Sarah, the wife and the affair partner, finally on the same side of something." — strong.
- "They built the gun, loaded it, and walked out of the room." — strong.
