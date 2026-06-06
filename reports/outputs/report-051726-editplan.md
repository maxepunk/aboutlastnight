# Edit Plan — Session 051726 Article (Fact-Check Cycle)

Scope: factual corrections + coverage augmentation. Copy-edit pass deferred to a separate cycle after these edits land.

## Director-approved scope

- All HIGH issues: A1, A2 (×2 locations), A3, B1, B2, B3
- All MED issues: A4, A5, A6, B4
- All LOW factual issues: A7, A8, A9, A10, A12 (A11 verified by photo view — caption stands)
- Coverage augmentation: C1 (Skyler sky003), C2 (Taylor tay002 evidence card + photo 7), C3 (Photo 1 Sarah-Riley)
- A2 phrasing: "twelve-vote majority"
- B1 phrasing: passive reframe ("X's POV memories surfaced in the public record")
- B3 silence trap: full reframe with the "cannot say whether they sat on evidence or someone else found them" hedge
- B2 Morgan-Blake: drop the operator claim (no director observation to anchor it)
- Photo #8 (A11): verified — Jamie's character sheet visible on the clipboard, caption stands
- Meta author tag (H1): unchanged ("Cassandra Nova" only)
- AM-shift convention: unchanged (article already applies it consistently)

## Edit order

Article-flow order, top to bottom. Each edit lists find/replace with enough context to be unambiguous in the HTML.

---

### Edit 1 — Hero photo caption (A9)

**Section:** Header, hero photo.

**Two locations** (alt + figcaption — must match exactly).

**Current alt + figcaption:**
```
Blake addresses the gathered group at the MARCUS BLACKWOOD IS DEAD whiteboard as the investigation opens. Morgan Reed, Skyler Iyer, Nat Francisco, Flip, and Mel Nilsson in the foreground; Cass Zhang and Riley Torres in the background.
```

**Replace both with:**
```
Blake addresses the gathered group at the MARCUS BLACKWOOD IS DEAD whiteboard, mid-investigation, as theory production begins. Morgan Reed, Skyler Iyer, Nat Francisco, Flip, and Mel Nilsson in the foreground; Cass Zhang and Riley Torres in the background.
```

**Rationale:** Director-confirmed moment is "Blake's theory-production moment" — Blake forced theory production AFTER the group played close to chest for the first half. Not "as the investigation opens."

---

### Edit 2 — Lede paragraph 1 (A4 + L1 false-sequence)

**Section:** Lede, paragraph 1.

**Current:**
```
<p>Eighteen people gathered in a warehouse this morning to investigate Marcus Blackwood&#x27;s death. I watched from inside the room. Ashe Motoko was one of the eighteen. Twelve voted Zia Bishara guilty in retaliation for stolen tech. Three for Vic Kingsley. One for Morgan Reed. An alternate theory of self-harm never gained traction. Then Vic spoke, and the tie with Zia was no longer a tie.</p>
```

**Replace with:**
```
<p>Eighteen people gathered in a warehouse this morning to investigate Marcus Blackwood&#x27;s death. I watched from inside the room. Ashe Motoko was one of the eighteen. Twelve voted Zia Bishara guilty in retaliation for stolen tech. Three for Vic Kingsley. One for Morgan Reed. The room had been tied between Vic and Zia until Vic stood up and gave a speech that moved the vote.</p>
```

**Rationale:** Vic's pivot speech IS where the self-harm framing came from. The original lede sequences self-harm as a separate failed theory followed by Vic's speech, which misrepresents what happened. The body (TP4) correctly unpacks the speech's content. The lede plants the pivot; the body does the work.

---

### Edit 3 — THE STORY S1.9 "fourth theft" → "fourth pattern" (A7)

**Section:** THE STORY, Taylor-story-burial paragraph.

**Current:**
```
<p>A fourth theft made the prior three easier to overlook. Taylor Chase had handed Marcus the leverage to bury a Silicon Valley Business Journal expose on his memory experiments.
```

**Replace with:**
```
<p>A fourth pattern made the prior three easier to overlook. Taylor Chase had handed Marcus the leverage to bury a Silicon Valley Business Journal expose on his memory experiments.
```

**Rationale:** Taylor's quid-pro-quo with Marcus was story suppression, not IP theft. The first three (BizAI, Oracle Ledger, Synesthesia Engine) were genuine thefts; "pattern" captures the thematic alignment without the category error.

---

### Edit 4 — Insert tay002 evidence card after THE STORY S1.9 (C2 Taylor coverage)

**Section:** THE STORY, after the Taylor-story-burial paragraph, BEFORE Photo #9 figure.

**Current (find this paragraph block):**
```
<p>A fourth pattern made the prior three easier to overlook. Taylor Chase had handed Marcus the leverage to bury a Silicon Valley Business Journal expose on his memory experiments. The reporter who wrote it lost her job. In exchange, Taylor got the NeurAI launch exclusive. The reporter was Ashe Motoko. The email confirming the burial is on the record; the expose excerpt survives in Nat Francisco&#x27;s files. Ashe came back to Marcus&#x27;s party undercover as Kai&#x27;s plus-one. She is the second name on this article&#x27;s byline.</p>

        <figure class="article-photo article-photo--inline">
  <img
    src="sessionphotos/051726/aln0517 (9 of 14).jpg"
```

**Replace with (insert tay002 evidence card + Photo 7 between the Taylor paragraph and Photo #9):**
```
<p>A fourth pattern made the prior three easier to overlook. Taylor Chase had handed Marcus the leverage to bury a Silicon Valley Business Journal expose on his memory experiments. The reporter who wrote it lost her job. In exchange, Taylor got the NeurAI launch exclusive. The reporter was Ashe Motoko. The email confirming the burial is on the record; the expose excerpt survives in Nat Francisco&#x27;s files. Ashe came back to Marcus&#x27;s party undercover as Kai&#x27;s plus-one. She is the second name on this article&#x27;s byline.</p>

        <aside class="evidence-card evidence-card--supporting" data-token="tay002">
  <div class="evidence-card__label">9:51 PM. &#x27;The story&#x27;s not about the truth.&#x27;</div>
  <div class="evidence-card__content">
    TAYLOR: &#x27;I can&#x27;t believe that ASHE is even showing their face here. What a loser. I mean, look. They had the receipts on MARCUS. But they never understood that the story&#x27;s not about the truth. No sirree… I know you gotta keep some doors open. Don&#x27;t get me wrong. Sucks to be ASHE - grinding away at their blog or whatever, then showing up here as some loser&#x27;s plus one… It makes me appreciate my spot on the VIP list. Gotta be grateful for the small things, you know? And I did get the exclusive on NeurAI&#x27;s launch out of it.&#x27;
  </div>
  <div class="evidence-card__meta">
    <span class="evidence-card__owner">Taylor Chase</span>
  </div>
</aside>

        <figure class="article-photo article-photo--inline">
  <img
    src="sessionphotos/051726/aln0517 (7 of 14).jpg"
    alt="Vic Kingsley and Taylor Chase in tense exchange. The investor and the reporter who killed Ashe&#x27;s expose, alone in conversation."
    loading="lazy"
    class="article-photo__image"
  >
  <figcaption class="article-photo__caption">Vic Kingsley and Taylor Chase in tense exchange. The investor and the reporter who killed Ashe&#x27;s expose, alone in conversation.</figcaption>
</figure>

        <figure class="article-photo article-photo--inline">
  <img
    src="sessionphotos/051726/aln0517 (9 of 14).jpg"
```

**Rationale:** tay002 is a verbatim Taylor admission of complicity ("the story's not about the truth"). It earns its place as a documentary anchor for the Taylor-Marcus quid-pro-quo. Photo 7 (Vic-Taylor tense) extends the visual coverage of Taylor and pairs the reporter with the investor who has her own pivot to deliver later.

**Dual-location note:** A corresponding evidence-card-mini for tay002 must be added to the sidebar `<section class="sidebar-box evidence-summary">` after the existing fli003 mini. See Edit 18 below.

---

### Edit 5 — Add Skyler sky003 reference (C1 Skyler coverage)

**Section:** THE STORY, after the Cass-Synesthesia-Engine paragraph (S1.6), BEFORE the cas004 evidence card.

**Current:**
```
<p>Then Cass Zhang. At 12:38 AM the night before, Kai Andersen had matched the code Marcus insisted she install in her party rig against the demo Cass had sent him. Identical. Marcus had installed Cass&#x27;s Synesthesia Engine without paying, without signing, and intended to run it on his guests as live research subjects. A third stolen technology. A third documented victim. The whiteboard did not list Cass.</p>

        <aside class="evidence-card evidence-card--critical" data-token="cas004">
```

**Replace with:**
```
<p>Then Cass Zhang. At 12:38 AM the night before, Kai Andersen had matched the code Marcus insisted she install in her party rig against the demo Cass had sent him. Identical. Marcus had installed Cass&#x27;s Synesthesia Engine without paying, without signing, and intended to run it on his guests as live research subjects. A third stolen technology. A third documented victim. The whiteboard did not list Cass. Skyler Iyer&#x27;s recovered memory places him in the room while Cass was pitching the engine, half-attentive, noticing Marcus and Morgan in a tense standoff across the floor.</p>

        <aside class="evidence-card evidence-card--critical" data-token="cas004">
```

**Rationale:** sky003 surfaces a Skyler-POV observation that anchors his presence in a thread the article was already developing (Synesthesia Engine + Marcus-Morgan tension). Gives Skyler a named storyline. Pronoun: Skyler = he/him this session.

---

### Edit 6 — Photo #10 caption (A10)

**Section:** THE STORY, Photo #10 caption (workshop).

**Two locations** (alt + figcaption).

**Current alt + figcaption:**
```
Kai Andersen and Quinn Sterling in Marcus&#x27;s hidden workshop. This is the space where Kai&#x27;s code comparison surfaced and the Synesthesia Engine theft became visible.
```

**Replace both with:**
```
Kai Andersen and Quinn Sterling in Marcus&#x27;s hidden workshop, where the Synesthesia Engine was set up to run on his party guests.
```

**Rationale:** The kai004 code-comparison happened at the party (12:38 AM the night before), not in the workshop this morning. The workshop is the physical space of the engine installation. The caption was conflating the morning investigation photo with the party-time discovery.

---

### Edit 7 — THE STORY S1.11 "Cass overheard" Vic-Morgan quote (A5)

**Section:** THE STORY, end of Morgan-bribery paragraph.

**Current:**
```
This morning, Cass overheard Vic pull Morgan aside: &#x27;I&#x27;m really concerned about the state of our investments.&#x27;
```

**Replace with:**
```
This morning, I overheard Vic pull Morgan aside: &#x27;I&#x27;m really concerned about the state of our investments.&#x27;
```

**Rationale:** Only the Vic-Alex "kids talk" line is director-confirmed as Cass-overheard (note 1). The Vic-Morgan "concerned about investments" line was described as a private conversation between Vic and Morgan; default attribution is Cassandra (the reporter) overhearing.

---

### Edit 8 — Insert Photo #1 (Sarah-Riley early) before THE STORY S1.13 (C3)

**Section:** THE STORY, before the marriage-machinery paragraph (S1.13).

**Current (find the preceding ril003 evidence card closing and the start of S1.13):**
```
<p>The marriage machinery ran in parallel. By 11:43 PM, Riley Torres was leaving Sarah a voicemail with the full map of Marcus&#x27;s shell companies.
```

**Replace with (insert Photo #1 before the marriage-machinery paragraph):**
```
<figure class="article-photo article-photo--inline">
  <img
    src="sessionphotos/051726/aln0517 (1 of 14).jpg"
    alt="Sarah Blackwood and Riley Torres in private conversation early in the investigation, reviewing something on a screen between them. The marriage&#x27;s end was already in motion the night before."
    loading="lazy"
    class="article-photo__image"
  >
  <figcaption class="article-photo__caption">Sarah Blackwood and Riley Torres in private conversation early in the investigation. The marriage&#x27;s end was already in motion the night before.</figcaption>
</figure>

        <p>The marriage machinery ran in parallel. By 11:43 PM, Riley Torres was leaving Sarah a voicemail with the full map of Marcus&#x27;s shell companies.
```

**Rationale:** Photo 1 visualizes the Sarah-Riley relationship anchor that powers ril003 (voicemail) + Riley's "grief counsel" quote. Pronouns: Sarah = she/her, Riley = he/him this session.

---

### Edit 9 — THE STORY S1.13 Mel divorce-client timeline (A1)

**Section:** THE STORY, marriage-machinery paragraph.

**Current:**
```
By 12:50 AM, Mel had called an emergency Stanford Four meeting and was openly weighing blackmail to recover Marcus&#x27;s money for Sarah. By 2:08 AM, Mel had taken Sarah on as a divorce client. Sam Thorne had already mailed Sarah a paternity test naming Jess Kane as the mother of Marcus&#x27;s child.
```

**Replace with:**
```
By 12:50 AM, Mel had called an emergency Stanford Four meeting and was openly weighing blackmail to recover Marcus&#x27;s money for Sarah. The legal machinery had been moving for almost a day already. Mel&#x27;s email to his partners at Patchwork Law Firm, announcing he had taken Sarah on as a client effective immediately, was timestamped 2:08 AM the morning of the party. Sam Thorne had already mailed Sarah a paternity test naming Jess Kane as the mother of Marcus&#x27;s child.
```

**Rationale:** Mel's divorce email is dated Feb 21, 2027, 2:08 AM — early hours of the party day, ~18 hours before the party started. The article was placing it in the night-of-party chronology (~24 hours off). New phrasing anchors the 2:08 AM timestamp correctly. Pronoun: Mel = he/him this session ("his partners" / "he had taken Sarah on").

---

### Edit 10 — FOLLOW THE MONEY FTM1 (A12)

**Section:** FOLLOW THE MONEY, opening paragraph.

**Current:**
```
<p>While eighteen people conducted an investigation, a parallel economy ran at Blake&#x27;s window. Just over seven million dollars in extracted memories. Thirty-two transactions across fifteen named accounts.
```

**Replace with:**
```
<p>While eighteen people conducted an investigation, a parallel economy ran at Blake&#x27;s window. Approximately seven and a half million dollars in extracted memories. Thirty-two transactions across fifteen named accounts.
```

**Rationale:** Sidebar tracker total = $7,460,000. "Just over seven million" understates by ~$460K.

---

### Edit 11 — FOLLOW THE MONEY FTM4 "mention-tier values" (A8)

**Section:** FOLLOW THE MONEY, Maria-account paragraph.

**Current:**
```
At 08:38 AM the Maria account opened its first burial. Maria received two more, at 09:00 and 09:07, totaling six hundred twenty-five thousand at mention-tier values.
```

**Replace with:**
```
At 08:38 AM the Maria account opened its first burial. Maria received two more, at 09:00 and 09:07, totaling six hundred twenty-five thousand across mention-tier and party-tier values.
```

**Rationale:** Maria's three transactions are vic001 ($150K, 3 Mention), vic002 ($225K, 4 Mention), vic003 ($250K, **3 Party**). Two mention-tier, one party-tier. Total $625K is correct; tier characterization needs both labels.

---

### Edit 12 — THE PLAYERS TP1 paragraph (B1 + A3 + B4 combined)

**Section:** THE PLAYERS, opening paragraph.

**Current:**
```
<p>Some choices belong on the record. Alex approached me directly. Sam exposed four of his own memories, the highest count on the roster. Cass and Kai built the Synesthesia Engine evidence together. Remi handed Sam the laptop that contacted Zia. Ashe disclosed the prior story Taylor and Marcus had killed and turned that disclosure into the prosecutorial frame the deliberations followed. Jess Kane and Nat Francisco brought the drug protocol on record in their own voices.</p>
```

**Replace with:**
```
<p>Some choices belong on the record. Alex approached me directly. Four of Sam&#x27;s POV memories surfaced in the public record, the highest count on the roster. Cass and Kai built the Synesthesia Engine evidence together. When Remi asked Sam for a computer, Sam handed his over without thinking about what was on it; when Remi asked about hackers, Sam texted Zia from his own phone. Ashe disclosed the prior story Taylor and Marcus had killed and turned that disclosure into the prosecutorial frame the deliberations followed. Jess Kane&#x27;s and Nat Francisco&#x27;s voices anchor the drug protocol in the public record.</p>
```

**Rationale:** Three fixes in one paragraph:
- B1 (Sam exposed → passive): "Four of Sam's POV memories surfaced in the public record" — director-confirmed exposure attribution is only for Ashe + Jamie; default is anonymous.
- A3 (Remi handed laptop reversed + phone): per sam003, Sam handed Remi the laptop; Sam then texted Zia from his phone.
- B4 (Jess/Nat brought → anchor): passive reframe matching B1.

---

### Edit 13 — THE PLAYERS TP5 Photo #14 caption "unanimous Zia" (A2 #1)

**Section:** THE PLAYERS, Photo #14 caption (Vic's pivot speech photo).

**Two locations** (alt + figcaption).

**Current alt + figcaption:**
```
Vic Kingsley delivers her pivot speech during final deliberations. Kai Andersen, Mel Nilsson, Flip, and Ashe Motoko watch. The graffiti MARCUS ALWAYS WINS looms behind the woman who moved the room from a Vic-Zia tie to a unanimous Zia.
```

**Replace both with:**
```
Vic Kingsley delivers her pivot speech during final deliberations. Kai Andersen, Mel Nilsson, Flip, and Ashe Motoko watch. The graffiti MARCUS ALWAYS WINS looms behind the woman who moved the room from a Vic-Zia tie to a twelve-vote Zia majority.
```

**Rationale:** Vote was 12-3-1 with 2 abstentions, NOT unanimous. Contradicts the lede's correct tally.

---

### Edit 14 — THE PLAYERS TP6 Morgan "moved memories at Blake's window" (B2 + A6 echo)

**Section:** THE PLAYERS, second-to-last paragraph.

**Current:**
```
Morgan, who had moved memories at Blake&#x27;s window earlier, pulled Sam aside late and handed him back one of his own. People are not always what their accounts make them. Both of those things are true at the same time.
```

**Replace with:**
```
Morgan, who had taken Marcus&#x27;s bribe on the hammock the night before, pulled Sam aside late this morning and handed him back one of his own. People are not always what their accounts make them. Both of those things are true at the same time.
```

**Rationale:** Two fixes:
- B2: Drop the unsupported claim about Morgan operating at Blake's window. No director observation places Morgan there; Morgan's POV tokens are all exposed or untouched (no Morgan-POV burials).
- A6 echo: Anchor Morgan's prior-night act at the hammock (per mor003), consistent with the corrected location.

---

### Edit 15 — WHAT'S MISSING WM1 silence-trap reframe (B3)

**Section:** WHAT'S MISSING, first paragraph.

**Current:**
```
<p>Thirteen extracted memories never entered the investigation. Three of Quinn Sterling&#x27;s four. Two of Remi&#x27;s. Two of Alex&#x27;s. Zia&#x27;s own zia001, which will sit unread because Zia is not here to read it. I cannot tell you what is in any of them. I can tell you the pattern. The people most adjacent to the morning&#x27;s central threads also held the most unmoved evidence.</p>
```

**Replace with:**
```
<p>Thirteen extracted memories never entered the investigation. Three of Quinn Sterling&#x27;s four POVs are unaccounted for. Two of Remi&#x27;s. Two of Alex&#x27;s. Zia&#x27;s own zia001, which will sit unread because Zia is not here to read it. I cannot tell you what is in any of them. I can tell you the pattern: the people most adjacent to the morning&#x27;s central threads also have the most unaccounted POV memories on their side of the ledger. Whether that means they sat on evidence, or someone else found their tokens and chose not to surface them, I cannot say.</p>
```

**Rationale:** Owner ≠ operator. Untouched tokens belonging to Quinn/Remi/Alex don't mean those characters HELD the evidence — they mean nobody (including possibly those characters) deposited the tokens anywhere. The reframe (a) softens "Quinn's four" to "Quinn's four POVs" (b) describes the pattern from Nova's POV ("unaccounted POV memories on their side of the ledger") (c) adds the explicit hedge that distinguishes the two possible operator scenarios.

---

### Edit 16 — CLOSING C2 bribe location bar → hammock (A6)

**Section:** CLOSING, second paragraph.

**Current:**
```
Sarah Blackwood inherits NeurAI. Vic flies to the Caymans. Alex&#x27;s lawsuit continues unobstructed. Morgan still has the bribe money Marcus handed her at the bar. Marcus&#x27;s machinery did not die with him. It just changed hands.
```

**Replace with:**
```
Sarah Blackwood inherits NeurAI. Vic flies to the Caymans. Alex&#x27;s lawsuit continues unobstructed. Morgan still has the bribe money Marcus handed her on the hammock. Marcus&#x27;s machinery did not die with him. It just changed hands.
```

**Rationale:** Per mor003, the bribe was on the hammock, not at the bar. fli003 (Flip's POV) had Flip observing FROM the bar but the handoff itself was at the hammock. The sidebar evidence-card-mini for mor003 correctly says "On the hammock" — this fix resolves the body-sidebar inconsistency.

---

### Edit 17 — CLOSING C5 "unanimous accusation" (A2 #2)

**Section:** CLOSING, fourth paragraph.

**Current:**
```
I am saying Vic Kingsley pivoted a tie into a unanimous accusation and then left the country.
```

**Replace with:**
```
I am saying Vic Kingsley pivoted a tie into a twelve-vote majority for Zia and then left the country.
```

**Rationale:** Vote was 12-3-1 with 2 abstentions. Same fix as Edit 13.

---

### Edit 18 — Add tay002 evidence-card-mini to sidebar (dual-location parity with Edit 4)

**Section:** Sidebar `<section class="sidebar-box evidence-summary">`, AFTER the existing fli003 mini (the last existing mini).

**Current (find the fli003 mini and the closing section tag):**
```
        <div class="evidence-card-mini evidence-card--supporting" data-token-id="fli003">
          <div class="evidence-card-mini__header">
            <span class="evidence-card-mini__badge">supporting</span>
          </div>
          <div class="evidence-card-mini__headline">Flip: The Cash Handoff</div>
          <div class="evidence-card-mini__summary">From the bar at 11:29 PM, Flip watches Marcus hand Morgan a fat wad of cash like it is nothing. The same Marcus who had given Flip a hard time about money he had loaned her.</div>
        </div>
      </section>
```

**Replace with (insert tay002 mini before the closing </section>):**
```
        <div class="evidence-card-mini evidence-card--supporting" data-token-id="fli003">
          <div class="evidence-card-mini__header">
            <span class="evidence-card-mini__badge">supporting</span>
          </div>
          <div class="evidence-card-mini__headline">Flip: The Cash Handoff</div>
          <div class="evidence-card-mini__summary">From the bar at 11:29 PM, Flip watches Marcus hand Morgan a fat wad of cash like it is nothing. The same Marcus who had given Flip a hard time about money he had loaned her.</div>
        </div>
        <div class="evidence-card-mini evidence-card--supporting" data-token-id="tay002">
          <div class="evidence-card-mini__header">
            <span class="evidence-card-mini__badge">supporting</span>
          </div>
          <div class="evidence-card-mini__headline">Taylor Chase: &#x27;The story&#x27;s not about the truth&#x27;</div>
          <div class="evidence-card-mini__summary">Taylor&#x27;s drunk confession to Zia at 9:51 PM, captured in a recovered memory. The reporter who killed Ashe&#x27;s expose explains why: the doors she kept open got her the NeurAI launch exclusive.</div>
        </div>
      </section>
```

**Rationale:** Dual-location parity — Edit 4 adds the tay002 evidence card to the body; Edit 18 adds the matching sidebar mini.

---

## Dual-location parity check

Edits affecting **dual-location** components:

| Edit | Body | Sidebar | Both updated? |
|---|---|---|---|
| 4 (tay002 evidence card) | body insert | mini in sidebar (Edit 18) | ✓ |
| 7 (Cass→I overheard) | body only | n/a (not in sidebar) | n/a |
| 14 (Morgan at hammock) | body only | sidebar mor003 mini ALREADY says "On the hammock" | ✓ (sidebar already correct; body fix achieves parity) |
| 16 (bribe at hammock) | body only | same as Edit 14 — sidebar mor003 mini correct | ✓ |

**No financial-tracker amount changes** — all 15 account totals + Total Buried $7,460,000 stand. The "approximately seven and a half million" prose change in Edit 10 aligns the body description with the sidebar number.

**No new section-nav entries** — section structure unchanged.

---

## Verification checklist after edits

1. Search HTML for `"never gained traction"` — confirm zero matches.
2. Search HTML for `"unanimous"` — confirm zero matches in caption or prose (the word may legitimately survive in some context, but not in the photo #14 caption or closing).
3. Search HTML for `"Sam exposed four"` — confirm zero matches.
4. Search HTML for `"Remi handed Sam the laptop"` — confirm zero matches.
5. Search HTML for `"Cass overheard"` — confirm one match remains (Vic-Alex "kids talk" line in S1.2) and the Vic-Morgan match is removed.
6. Search HTML for `"at the bar"` near "bribe" or "Morgan" — confirm zero matches.
7. Search HTML for `"moved memories at Blake"` — confirm zero matches.
8. Search HTML for `"held the most unmoved"` — confirm zero matches.
9. Search HTML for `"fourth theft"` — confirm zero matches; `"fourth pattern"` should be present.
10. Search HTML for `"at mention-tier values"` — confirm zero matches.
11. Search HTML for `"investigation opens"` — confirm zero matches in hero caption.
12. Search HTML for `"2:08 AM"` — confirm context is correctly "the morning of the party," not the night-of chronology.
13. Search HTML for `data-token="tay002"` — confirm tay002 evidence card present.
14. Search HTML for `data-token-id="tay002"` — confirm tay002 sidebar mini present.
15. Search HTML for new photo paths (`(1 of 14).jpg`, `(7 of 14).jpg`) — confirm both inserts landed.
16. Search HTML for `"Skyler Iyer's recovered memory"` — confirm sky003 reference added.
17. Render in a browser — confirm layout intact, no broken whitespace around new figures/cards, photo paths resolve.
18. Re-read article end-to-end — only THEN proceed to Phase 3 (copy-edit cycle) on the fact-corrected prose.

---

## Edit method

Use the Edit tool for each replacement. For each edit, include enough surrounding context in `old_string` to make it unique within the file. For inserts (Edits 4, 5, 8, 18), match the surrounding paragraph block including the immediate preceding closing tag or following opening tag to anchor placement.

No `replace_all` needed for any edit (each old_string is unique with the context shown).

Order: execute edits in the listed order (top-to-bottom in the article) to minimize the chance of context shifts between edits.
