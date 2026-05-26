# Edit Plan — Session 052326 (Cycle 2: Copy-Edit)

Article (post-Cycle 1): `outputs/report-052326.html`
Findings: `outputs/report-052326-findings-copyedit.md`

**Director-resolved decisions (2026-05-26):**
1. **Cut The Players section.** Relocate Jess quote, Remi-Alex exchange, sharpened Ashe characterization into The Story.
2. **Reframe Closing para 3.** Lead with system-survives-Marcus; demote appointments to supporting detail.
3. **Add three photos** (9, 12, 5).
4. **Cut "Premium secrets sell at a premium."**
5. **Sharpen "Both of those things are true. Neither disqualifies the other"** to a tighter Ashe characterization.

---

## Apply order

Edits flow top-of-file → bottom-of-file. The Players cut comes near the end (after its unique content has been relocated into The Story above). Sidebar nav updates last.

For relocated content (Jess quote, Remi-Alex exchange, sharpened Ashe line) — these get inserted into The Story by modifying existing paragraphs to absorb them. Then The Players section is deleted as a block, by which point its unique content lives elsewhere.

Photo additions are inserted by replacing existing paragraph closers with paragraph-closer + new figure block.

---

## EDIT 1 — Lede paragraph 1 (STRUCT-7): tighten internal redundancy

**Where:** Line 1497.

**OLD:**
```
        <p>Quinn Sterling wasn&#x27;t there. The chemist the room finally settled on for Marcus Blackwood&#x27;s death never made it to his last party. Twelve people stood around the evidence table this morning, sifting through extracted memories and labeled baggies of Psychotrophin, and the name they put on the board belonged to someone who wasn&#x27;t in the building.</p>
```

**NEW:**
```
        <p>Quinn Sterling wasn&#x27;t there. The chemist the room finally settled on for Marcus Blackwood&#x27;s death never made it to his last party. Twelve people stood around the evidence table this morning, sifted through extracted memories and labeled baggies of Psychotrophin, and named him anyway.</p>
```

Lands the structural anomaly once, in three words.

---

## EDIT 2 — Lede paragraph 2 (STRUCT-1): remove leak from lede

**Where:** Line 1499.

**OLD:**
```
        <p>I wasn&#x27;t in that room. Ashe Motoko was, and he shares this byline because he did the feet-on-the-ground reporting while I worked the wires from outside. By the time the vote landed, the company Quinn allegedly killed for had already named its new co-CEOs. The verdict and the leaked offer belong to the same morning.</p>
```

**NEW:**
```
        <p>I wasn&#x27;t in that room. Ashe Motoko was, and he shares this byline because he did the feet-on-the-ground reporting while I worked the wires from outside. By the time the vote landed, Quinn Sterling was already a fugitive in his own absence. What the verdict couldn&#x27;t account for took the rest of the morning to surface.</p>
```

Leak is pulled out. The promise of "what the verdict couldn't account for" pulls the reader into The Story.

---

## EDIT 3 — Story paragraph 3 (REDUND-5, VOICE-1, VOICE-8): cut "Twelve hands"; cut "case closed itself"; translate "timer"

**Where:** Line 1533.

**OLD:**
```
        <p>As the timer ran out, the room voted. &#x27;This asshole got me fired,&#x27; Ashe told the group. &#x27;Alex was seen punching him, but none of that was reason for us to have killed him. If there&#x27;s someone to blame, I don&#x27;t know. But Quinn made this drug, and Quinn is not here. We know that.&#x27; Twelve hands. One absent chemist. Jamie &#x27;Volt&#x27; Woods added that he&#x27;d found an empty capsule at the bar that fit Ashe&#x27;s drug theory. The case closed itself.</p>
```

**NEW:**
```
        <p>In the final minutes, the room voted. &#x27;This asshole got me fired,&#x27; Ashe told the group. &#x27;Alex was seen punching him, but none of that was reason for us to have killed him. If there&#x27;s someone to blame, I don&#x27;t know. But Quinn made this drug, and Quinn is not here. We know that.&#x27; Jamie &#x27;Volt&#x27; Woods added that he&#x27;d found an empty capsule at the bar that fit Ashe&#x27;s drug theory. The room let the argument carry.</p>
```

Changes:
- "As the timer ran out" → "In the final minutes" (game-mechanic → journalism vocabulary)
- Cut "Twelve hands. One absent chemist." (redundant fragment cluster after Ashe's quote already establishes the vote)
- "The case closed itself" → "The room let the argument carry" (names the actual agency — the room chose not to push back)

---

## EDIT 4 — Story paragraph 4 (VOICE-7): replace "long half hour"

**Where:** Line 1535.

**OLD:**
```
        <p>Before Quinn&#x27;s name landed, two others did. Marcus&#x27;s theft of Alex Reeves&#x27;s NeurAI code came up first, and Alex&#x27;s name went on the board. Then Alex made an impassioned defense and named Sarah Blackwood as another candidate for Marcus&#x27;s old job. Sarah&#x27;s name went up next. A showdown between the two women split the group for a long half hour.</p>
```

**NEW:**
```
        <p>Before Quinn&#x27;s name landed, two others did. Marcus&#x27;s theft of Alex Reeves&#x27;s NeurAI code came up first, and Alex&#x27;s name went on the board. Then Alex made an impassioned defense and named Sarah Blackwood as another candidate for Marcus&#x27;s old job. Sarah&#x27;s name went up next. A showdown between the two women split the room into two camps.</p>
```

Removes fabricated quantification. "Split the room into two camps" preserves the emotional weight.

---

## EDIT 5 — Photo 6 caption fix (CAPT-1)

**Where:** Lines 1540 and 1544 (alt and figcaption).

**OLD (alt):**
```
    alt="Sarah and Alex this morning. Neither of them knew the offer email was already drafted."
```

**NEW (alt):**
```
    alt="Sarah and Alex working a piece of evidence this morning. By the deliberations, each would be named for Marcus's job."
```

**OLD (figcaption):**
```
  <figcaption class="article-photo__caption">Sarah and Alex this morning. Neither of them knew the offer email was already drafted.</figcaption>
```

**NEW (figcaption):**
```
  <figcaption class="article-photo__caption">Sarah and Alex working a piece of evidence this morning. By the deliberations, each would be named for Marcus's job.</figcaption>
```

Removes the now-contradicted "neither knew" claim.

---

## EDIT 6 — Story paragraph 6 (VOICE-4): "I cannot help but feel" hedge

**Where:** Line 1565.

**OLD:**
```
        <p>What no one at that evidence table said out loud: Alex had already been negotiating with NeurAI&#x27;s board. After the deliberations ended, an anonymous leak reached me. The email commended Alex on her negotiation skills and offered her an interim co-CEO role alongside Sarah. The succession the room was duelling over was being decided in parallel. I cannot help but feel the investigation was a front for an interview.</p>
```

**NEW:**
```
        <p>What no one at that evidence table said out loud: Alex had already been negotiating with NeurAI&#x27;s board. After the deliberations ended, an anonymous leak reached me. The email commended Alex on her negotiation skills and offered her an interim co-CEO role alongside Sarah. The succession the room was duelling over was being decided in parallel. By the email&#x27;s own framing, the investigation was a front for an interview.</p>
```

Removes the editorial hedge "cannot help but feel"; anchors the claim in the leak's own language. Sharper and reportorially grounded.

---

## EDIT 7 — Photo 12 insertion: visualize Alex's deliberation plea after the leak reveal

**Where:** Insert after line 1565 (after Story paragraph 6 closes), before line 1567 (Story para 7).

**OLD:** (the line break and start of paragraph 7)
```
        <p>What no one at that evidence table said out loud: Alex had already been negotiating with NeurAI&#x27;s board. After the deliberations ended, an anonymous leak reached me. The email commended Alex on her negotiation skills and offered her an interim co-CEO role alongside Sarah. The succession the room was duelling over was being decided in parallel. By the email&#x27;s own framing, the investigation was a front for an interview.</p>

        <p>The chemistry case the room built against Quinn opened back up the moment anyone really looked at the baggies.
```

**NEW:**
```
        <p>What no one at that evidence table said out loud: Alex had already been negotiating with NeurAI&#x27;s board. After the deliberations ended, an anonymous leak reached me. The email commended Alex on her negotiation skills and offered her an interim co-CEO role alongside Sarah. The succession the room was duelling over was being decided in parallel. By the email&#x27;s own framing, the investigation was a front for an interview.</p>

        <figure class="article-photo article-photo--inline">
  <img
    src="sessionphotos/052326/aln0523 (12 of 12).jpg"
    alt="Alex Reeves mid-deliberations, with Jamie, Kai, Mel, and Sarah looking on. The plea that landed her on the suspect board was also a job interview."
    loading="lazy"
    class="article-photo__image"
  >
  <figcaption class="article-photo__caption">Alex Reeves mid-deliberations, with Jamie, Kai, Mel, and Sarah looking on. The plea that landed her on the suspect board was also a job interview.</figcaption>
</figure>

        <p>The chemistry case the room built against Quinn opened back up the moment anyone really looked at the baggies.
```

**Note:** This `OLD` includes only the start of paragraph 7 for context. The Edit will match this exact prefix plus the continuation; the rest of paragraph 7 is untouched. The match needs to be unique by including enough of paragraph 7's opening.

(Actually for safer Edit application, this is better expressed as a TWO-step: insert photo by appending to paragraph 6 closing, with the new figure block placed before the start-of-paragraph-7 anchor. Let's express it more cleanly:)

**Cleaner OLD:** Match the closing of paragraph 6 immediately followed by the opening of paragraph 7.
```
By the email&#x27;s own framing, the investigation was a front for an interview.</p>

        <p>The chemistry case the room built against Quinn
```

**Cleaner NEW:**
```
By the email&#x27;s own framing, the investigation was a front for an interview.</p>

        <figure class="article-photo article-photo--inline">
  <img
    src="sessionphotos/052326/aln0523 (12 of 12).jpg"
    alt="Alex Reeves mid-deliberations, with Jamie, Kai, Mel, and Sarah looking on. The plea that landed her on the suspect board was also a job interview."
    loading="lazy"
    class="article-photo__image"
  >
  <figcaption class="article-photo__caption">Alex Reeves mid-deliberations, with Jamie, Kai, Mel, and Sarah looking on. The plea that landed her on the suspect board was also a job interview.</figcaption>
</figure>

        <p>The chemistry case the room built against Quinn
```

---

## EDIT 8 — Sam paragraph compression (STRUCT-3): three paragraphs → two

**Where:** Story paragraphs 7 + 8 + 9 (lines 1567 + 1569 + 1581).

**Note:** This edit interacts with EDIT 7 (which inserts photo 12 before this) and EDIT 9 (which inserts photo 9 between the two compressed Sam paragraphs). Best applied as a single replacement covering all three paragraphs + the sam002 evidence card between paragraphs 8 and 9.

**OLD:**
```
        <p>The chemistry case the room built against Quinn opened back up the moment anyone really looked at the baggies. Psychotrophin-1A through 10E. A whole formulation tree, not a single compound. Sam Thorne&#x27;s name came up as the source of the recreational supply at Marcus&#x27;s parties. She&#x27;s also in the Stanford Four. So is Mel. So was Marcus.</p>

        <p>Sam&#x27;s own recovered diary, exposed this morning, places her squarely inside Marcus&#x27;s drug supply. &quot;It&#x27;s probably the shit I&#x27;m making for him,&quot; she wrote of Marcus three days before the party. The labeled baggies tell the same story in inventory form: PT-1A through 10E, a formulation tree built off Quinn&#x27;s original synthesis. The PT-3B batch that extracted everyone&#x27;s memories last night was Sam&#x27;s reformulation. The room treated the baggies as Quinn-corroborating. They were also Sam-corroborating. Sam was in the building.</p>

        <aside class="evidence-card evidence-card--critical" data-token="sam002">
  <div class="evidence-card__label">What Marcus Said When He Was Too High to Lie</div>
  <div class="evidence-card__content">
    SAM.2 - 10:44PM - God&#x27;s favorite idiot. Jesus Christ, MARCUS is so high! And you just gave him your usual party blend. He should not be so out of his mind that told you that! The BizAI algorithm wasn&#x27;t his own work. ALEX rewrote the whole thing and MARCUS somehow still took credit. Is he feeling remorse? No. This is MARCUS we&#x27;re talking about. You bite your tongue and take another hit.
  </div>
  <div class="evidence-card__meta">
    <span class="evidence-card__owner">Sam Thorne</span>
  </div>
</aside>

        <p>Sam Thorne&#x27;s name came up during the drug discussion. The room flagged her as the recreational supplier but did not advance her to the suspect board. Her own recovered memory from 10:44 PM shows Marcus, drugged out of his mind on her usual blend, confessing the BizAI algorithm was Alex&#x27;s work. Mel Nilsson&#x27;s recovered memory walks through Sarah&#x27;s nearly empty shared bank account; her email to her law firm shows the divorce was already a retained case the morning Marcus died. The chemist in the room helped convict the chemist who wasn&#x27;t.</p>
```

**NEW:**
```
        <p>The chemistry case the room built against Quinn opened back up the moment anyone really looked at the baggies. Psychotrophin-1A through 10E. A whole formulation tree, not a single compound. Sam Thorne&#x27;s name came up as the source of the recreational supply at Marcus&#x27;s parties; her own recovered diary, exposed this morning, places her squarely inside Marcus&#x27;s drug supply. &quot;It&#x27;s probably the shit I&#x27;m making for him,&quot; she wrote of Marcus three days before the party. The PT-3B batch that extracted everyone&#x27;s memories last night was Sam&#x27;s reformulation of Quinn&#x27;s original synthesis. She&#x27;s in the Stanford Four. So is Mel. So was Marcus.</p>

        <figure class="article-photo article-photo--inline">
  <img
    src="sessionphotos/052326/aln0523 (9 of 12).jpg"
    alt="Sam Thorne, Sarah Blackwood, and Mel Nilsson in conversation this morning. Two members of the Stanford Four, and the wife Marcus was leaving."
    loading="lazy"
    class="article-photo__image"
  >
  <figcaption class="article-photo__caption">Sam Thorne, Sarah Blackwood, and Mel Nilsson in conversation this morning. Two members of the Stanford Four, and the wife Marcus was leaving.</figcaption>
</figure>

        <aside class="evidence-card evidence-card--critical" data-token="sam002">
  <div class="evidence-card__label">What Marcus Said When He Was Too High to Lie</div>
  <div class="evidence-card__content">
    SAM.2 - 10:44PM - God&#x27;s favorite idiot. Jesus Christ, MARCUS is so high! And you just gave him your usual party blend. He should not be so out of his mind that told you that! The BizAI algorithm wasn&#x27;t his own work. ALEX rewrote the whole thing and MARCUS somehow still took credit. Is he feeling remorse? No. This is MARCUS we&#x27;re talking about. You bite your tongue and take another hit.
  </div>
  <div class="evidence-card__meta">
    <span class="evidence-card__owner">Sam Thorne</span>
  </div>
</aside>

        <p>Sam was in the building. The room flagged her as the recreational supplier and did not advance her to the suspect board. Her own recovered memory from 10:44 PM shows Marcus, drugged out of his mind on her usual blend, confessing the BizAI algorithm was Alex&#x27;s work. Mel Nilsson&#x27;s recovered memory walks through Sarah&#x27;s nearly empty shared bank account; her email to her law firm shows the divorce was already a retained case the morning Marcus died. The chemist in the room helped convict the chemist who wasn&#x27;t.</p>
```

**Net changes:**
- Three paragraphs → two (~80 words removed)
- "PT-1A through 10E" duplicate removed
- "Sam Thorne's name came up" only appears once
- "Sam was in the building" becomes the OPENING of paragraph 2 (was the closer of paragraph 1) — gives the second paragraph a turn-rhythm
- **Photo 9 (Sam/Sarah/Mel) inserted between the two compressed paragraphs, before the sam002 evidence card**

---

## EDIT 9 — Story paragraph 10 (MECH-1): em-dash replacement

**Where:** Line 1583.

**OLD:**
```
        <p>While the chemistry argument ran, a different network was operating. Ashe relayed that Morgan Reed was a fixture at Blake&#x27;s station this morning — back to it between rounds, in conversation with the Valet more than with the rest of the room. When Morgan rejoined the evidence table, he added nothing to the case against Marcus&#x27;s lobbying architecture.</p>
```

**NEW:**
```
        <p>While the chemistry argument ran, a different network was operating. Ashe relayed that Morgan Reed was a fixture at Blake&#x27;s station this morning, back to it between rounds, in conversation with the Valet more than with the rest of the room. When Morgan rejoined the evidence table, he added nothing to the case against Marcus&#x27;s lobbying architecture.</p>
```

Em-dash → comma.

---

## EDIT 10 — Story paragraph 12 (MECH-2, STRUCT-6): em-dash replacement + insert Marcus-Vic quote before this paragraph

**Where:** Line 1607 paragraph + insertion above it.

**STRUCT-6** relocates the Marcus-Vic inline quote (currently in The Players, lines 1661-1664) to just before the Vic-on-sidewalk paragraph. So we both:
- Insert the relocated inline quote BEFORE this paragraph
- Fix the em-dashes within this paragraph

**OLD:**
```
        <p>Vic Kingsley was outside on the sidewalk by then, in her own recovered memory, pressing a designer scarf against Marcus&#x27;s bleeding nose. The whiteboard preserved the line the room itself wrote down: &quot;Alex is in, Marcus is out.&quot; The fight between Sarah and Alex this morning was a duel over a seat that someone — investor or otherwise — had already begun arranging to fill.</p>
```

**NEW:**
```
        <blockquote class="inline-quote">
  <p><em>"I&#x27;m worried about what Vic knows. I wish I could remember that last convo with them, but my memory is not the best."</em></p>
  <cite>Marcus Blackwood, recorded in Sam&#x27;s diary, 2/17/27</cite>
</blockquote>

        <p>Vic Kingsley was outside on the sidewalk by then, in her own recovered memory, pressing a designer scarf against Marcus&#x27;s bleeding nose. The whiteboard preserved the line the room itself wrote down: &quot;Alex is in, Marcus is out.&quot; The fight between Sarah and Alex this morning was a duel over a seat the investor had already begun arranging to fill.</p>
```

**Changes:**
- Inline quote inserted (relocated from The Players)
- Em-dashes removed; "someone — investor or otherwise —" → "the investor" (commits to Vic, who the whiteboard line and context both imply)

---

## EDIT 11 — Photo 5 insertion: Jamie/Remi/Vic with NeurAI one-pager

**Where:** Insert after the Vic-on-sidewalk paragraph (the paragraph just edited in EDIT 10), before the "other motives" paragraph that we're cutting in EDIT 12.

Best placement: right after the modified paragraph 12, before what's currently paragraph 13 (which we cut in EDIT 12).

**OLD:** (the post-Vic-paragraph + paragraph 13)
```
        <p>Vic Kingsley was outside on the sidewalk by then, in her own recovered memory, pressing a designer scarf against Marcus&#x27;s bleeding nose. The whiteboard preserved the line the room itself wrote down: &quot;Alex is in, Marcus is out.&quot; The fight between Sarah and Alex this morning was a duel over a seat the investor had already begun arranging to fill.</p>

        <p>There were other motives in that room. Several. The room logged them and walked past.</p>
```

**NEW:** (after Vic paragraph, photo 5 inserted, "other motives" paragraph cut, Remi-Alex insertion as the kicker that transitions into the photo 4 motive enumeration)

```
        <p>Vic Kingsley was outside on the sidewalk by then, in her own recovered memory, pressing a designer scarf against Marcus&#x27;s bleeding nose. The whiteboard preserved the line the room itself wrote down: &quot;Alex is in, Marcus is out.&quot; The fight between Sarah and Alex this morning was a duel over a seat the investor had already begun arranging to fill.</p>

        <figure class="article-photo article-photo--inline">
  <img
    src="sessionphotos/052326/aln0523 (5 of 12).jpg"
    alt="Jamie Woods, Remi Whitman, and Vic Kingsley with a NeurAI one-pager recovered from Vic's purse. The investor was already removing Marcus before the party began."
    loading="lazy"
    class="article-photo__image"
  >
  <figcaption class="article-photo__caption">Jamie Woods, Remi Whitman, and Vic Kingsley with a NeurAI one-pager recovered from Vic's purse. The investor was already removing Marcus before the party began.</figcaption>
</figure>

        <p>Remi Whitman and Alex Reeves shared a moment overheard in passing. &#x27;You found my memory,&#x27; Remi said. &#x27;I did,&#x27; Alex replied. What Alex did with that information is the kind of thing this morning&#x27;s verdict did not ask.</p>
```

**Combined changes in this edit:**
- **STRUCT-5:** "There were other motives in that room. Several. The room logged them and walked past." paragraph CUT entirely.
- **CAPT-2:** Photo 5 inserted with thematic caption tying Remi (visible in photo) + Vic (already-removing-Marcus narrative).
- **STRUCT-2 (Remi relocation):** Remi-Alex exchange inserted as the new transition paragraph — replaces what was the cut "other motives" transition. The Remi-Alex kicker line ("What Alex did with that information is the kind of thing this morning's verdict did not ask") naturally bridges into the photo 4 "Three motives, none of them on the board" caption + the five-threads enumeration that follows.

---

## EDIT 12 — Story paragraph 14 (STRUCT-2 Jess relocation): fold Jess's quote into the five-threads paragraph

**Where:** Line 1621.

**OLD:**
```
        <p>Flip&#x27;s signed IOU to Marcus from 2020, with a loan shark texting in real time for thirty thousand dollars, never went up. Jess Kane&#x27;s confirmed paternity test, 99.85%, naming Marcus as the father of her child, never went up. Kai Andersen&#x27;s emailed instructions from Marcus the day of the party, demanding &#x27;environmental cues&#x27; run &#x27;exactly as written,&#x27; never went up. And Ashe, who carried the prosecution all morning, was holding the heaviest motive of anyone present.</p>
```

**NEW:**
```
        <p>Flip&#x27;s signed IOU to Marcus from 2020, with a loan shark texting in real time for thirty thousand dollars, never went up. Jess Kane&#x27;s confirmed paternity test, 99.85%, naming Marcus as the father of her child, never went up — and Jess, in a moment Ashe overheard between rounds, asked Blake instead: &#x27;Should I go talk to Sarah? What do you think?&#x27; The answer stayed between them. Kai Andersen&#x27;s emailed instructions from Marcus the day of the party, demanding &#x27;environmental cues&#x27; run &#x27;exactly as written,&#x27; never went up. And Ashe, who carried the prosecution all morning, was holding the heaviest motive of anyone present.</p>
```

**Changes:**
- Jess's director-overheard quote folded into the Jess thread, immediately after the paternity-test mention.
- Wait — this introduces an em-dash. Let me revise to avoid:

**REVISED NEW:**
```
        <p>Flip&#x27;s signed IOU to Marcus from 2020, with a loan shark texting in real time for thirty thousand dollars, never went up. Jess Kane&#x27;s confirmed paternity test, 99.85%, naming Marcus as the father of her child, never went up. Jess herself, in a moment Ashe overheard between rounds, asked Blake instead: &#x27;Should I go talk to Sarah? What do you think?&#x27; The answer stayed between them. Kai Andersen&#x27;s emailed instructions from Marcus the day of the party, demanding &#x27;environmental cues&#x27; run &#x27;exactly as written,&#x27; never went up. And Ashe, who carried the prosecution all morning, was holding the heaviest motive of anyone present.</p>
```

Now no em-dash. Jess's quote lands in the Jess thread; her question to Blake about whether to confront Sarah pairs naturally with the paternity test that names Marcus as the father of HER child (not Sarah's).

---

## EDIT 13 — Story paragraph 15 (STRUCT-2 Ashe sharpened, VOICE-3): sharpen the "both things are true" line; cut "Every thread collapsed"

**Where:** Line 1641.

**OLD:**
```
        <p>His investigation of Marcus&#x27;s memory experiments was killed three weeks before the party. The journalist who arranged the burial was Taylor Chase, the same Taylor Chase whose recorder, in Morgan&#x27;s recovered memory from 12:40 AM, was rolling while Morgan spilled the dirt the night Marcus died. The same name appears on both sides of the leverage. The room cast its vote for Quinn, and in the same hour NeurAI&#x27;s offer landed. Every thread collapsed into a single observation: the verdict cleared the room of everyone in it.</p>
```

**NEW:**
```
        <p>His investigation of Marcus&#x27;s memory experiments was killed three weeks before the party. The journalist who arranged the burial was Taylor Chase, the same Taylor Chase whose recorder, in Morgan&#x27;s recovered memory from 12:40 AM, was rolling while Morgan spilled the dirt the night Marcus died. The same name appears on both sides of the leverage. Ashe carried the prosecution. Ashe carried the heaviest motive. The room cast its vote for Quinn, and in the same hour NeurAI&#x27;s offer landed. The verdict cleared the room of everyone in it.</p>
```

**Changes:**
- Inserted "Ashe carried the prosecution. Ashe carried the heaviest motive." — sharpened version of the cut Players line (per Open Question 5: sharpen). Two parallel sentences, no aphorism.
- Cut "Every thread collapsed into a single observation: " — the thesis-line ("the verdict cleared the room of everyone in it") lands directly without the throat-clearing setup.

---

## EDIT 14 — Follow the Money paragraph 2 (VOICE-2): cut "Premium secrets sell at a premium"

**Where:** Line 1649.

**OLD:**
```
        <p>The largest account, B, took in $2.73 million across seven transactions. That is by a wide margin the cleanest cover name on the ledger and the most expensive secret of the morning. Mel&#x27;s recorded memory described Sarah&#x27;s shared account with Marcus as &#x27;nearly empty.&#x27; Whoever B is, they did not have that problem. Leo posted three transactions at an average of $410,000 each, the highest per-transaction value of any large account. Premium secrets sell at a premium.</p>
```

**NEW:**
```
        <p>The largest account, B, took in $2.73 million across seven transactions. That is by a wide margin the cleanest cover name on the ledger and the most expensive secret of the morning. Mel&#x27;s recorded memory described Sarah&#x27;s shared account with Marcus as &#x27;nearly empty.&#x27; Whoever B is, they did not have that problem. Leo posted three transactions at an average of $410,000 each, the highest per-transaction value of any large account.</p>
```

Aphorism cut. The data carries.

---

## EDIT 15 — Follow the Money paragraph 4 (VOICE-6): drop "by one read"

**Where:** Line 1653.

**OLD:**
```
        <p>Blake himself appears on his own ledger at $500,000 across a single transaction. The morning&#x27;s first burial. A token owned by Sarah Blackwood, routed at 9:21 PM into an account whoever operated it chose to label after the Valet. The house, by one read, collected on its own table.</p>
```

**NEW:**
```
        <p>Blake himself appears on his own ledger at $500,000 across a single transaction. The morning&#x27;s first burial. A token owned by Sarah Blackwood, routed at 9:21 PM into an account whoever operated it chose to label after the Valet. The house collected on its own table.</p>
```

Double-hedge removed. The previous sentence already establishes boundary care.

---

## EDIT 16 — CUT The Players section entirely (STRUCT-2)

**Where:** Lines 1655-1672 (full section block).

**OLD:** (the entire Players section, from section opener to section closer)
```
      </section>
      <section class="nn-section nn-section--narrative" id="the-players">
        <h2 class="nn-section__title">The Players</h2>

        <p>Ashe Motoko carried the room. He synthesized the chemistry argument, walked the group through Quinn&#x27;s blackmail email, and held the line when Alex&#x27;s name went up on the board. He shares this byline because he earned it. He also held the strongest undisclosed grievance of anyone in the room. His investigation of Marcus&#x27;s memory experiments was killed before the party by Taylor Chase — the same Taylor Chase whose recorder, in Morgan&#x27;s recovered memory, was running while Morgan spilled the dirt the night Marcus died. Both of those things are true. Neither disqualifies the other.</p>

        <blockquote class="inline-quote">
  <p><em>"I&#x27;m worried about what Vic knows. I wish I could remember that last convo with them, but my memory is not the best."</em></p>
  <cite>Marcus Blackwood, recorded in Sam&#x27;s diary, 2/17/27</cite>
</blockquote>

        <p>Sarah Blackwood barely spoke about her own marriage this morning. Alex Reeves described the punch Sarah pulled her off of matter-of-factly, the way someone tells a story they have already told themselves enough times to flatten. Both of them ended up named for Marcus&#x27;s job during the deliberations. Alex was already negotiating with NeurAI&#x27;s board by the leaked email&#x27;s own admission — &quot;negotiation skills&quot; was the board&#x27;s phrase, not mine.</p>

        <p>Mel Nilsson&#x27;s memory walks the divorce. Sam Thorne&#x27;s exposed memory walks the BizAI confession. Both contributions surfaced in the morning&#x27;s record but neither paragraph followed Sam&#x27;s name to the suspect board. Morgan Reed was a fixture at Blake&#x27;s station, frequently in conversation with the Valet and rarely with the rest of the room. Vic Kingsley&#x27;s name didn&#x27;t reach the suspect board at all.</p>

        <p>Jess Kane made great contributions to the public record. She also asked Blake, in a moment overheard between rounds, &#x27;Should I go talk to Sarah? What do you think?&#x27; The answer to that question stayed between them. Flip stayed off the suspect board entirely despite a loan shark in his texts. Kai Andersen held his emails close. Remi Whitman and Alex shared a moment overheard in passing. &#x27;You found my memory,&#x27; Remi said. &#x27;I did,&#x27; Alex replied. What Alex did with that information is the kind of thing this morning&#x27;s verdict did not ask.</p>

      </section>
```

**NEW:**
```
      </section>
```

Entire section deleted. The Story is followed directly by Follow the Money, which is followed by What's Missing, which is followed by Closing.

(All three unique beats — sharpened Ashe characterization, Jess quote, Remi-Alex exchange — were relocated into The Story in EDITS 13, 12, and 11 respectively. The inline Marcus-Vic quote was relocated in EDIT 10.)

---

## EDIT 17 — Closing paragraph 3 reframe (STRUCT-4)

**Where:** Line 1689.

**OLD:**
```
        <p>Alex Reeves and Sarah Blackwood will run NeurAI by Monday. The technology that made Marcus&#x27;s death investigable, the same technology that made it possible to extract memories from twelve people without their consent in the first place, will now belong to the partner he stole from and the wife he was divorcing. Vic Kingsley, the investor who was already removing him, ran the board that signed the offer. The system Marcus built survived him by absorbing every grievance the room declined to name.</p>
```

**NEW:**
```
        <p>The system Marcus built survived him. The drug supply is still being formulated. The lobbying architecture is still being maintained. The investor who fired him before the room ever gathered still runs the board. By Monday that board will have handed Marcus&#x27;s title to the partner he stole from and the wife he was divorcing. The technology that made it possible to extract memories from twelve people without their consent in the first place will now belong to them. The system absorbed every grievance the room declined to name.</p>
```

**Changes:**
- Leads with the system-survives-Marcus thesis (was the closing line of the original paragraph)
- The appointments are reframed as the consequence of the system's persistence ("By Monday that board will have handed Marcus's title to...") rather than the opening image
- The technology-passes-to-them claim is preserved as a separate sentence
- The closing line of the paragraph is now "The system absorbed every grievance the room declined to name" (was the closing of the original; sharpens slightly without the "by" preposition)

---

## EDIT 18 — Sidebar nav: remove The Players link

**Where:** Lines 1913-1919.

**OLD:**
```
        <ul class="section-nav__list">
          <li><a href="#the-story" class="section-nav__link">The Story</a></li>
          <li><a href="#follow-the-money" class="section-nav__link">Follow the Money</a></li>
          <li><a href="#the-players" class="section-nav__link">The Players</a></li>
          <li><a href="#whats-missing" class="section-nav__link">What&#x27;s Missing</a></li>
          <li><a href="#closing" class="section-nav__link">Closing</a></li>
        </ul>
```

**NEW:**
```
        <ul class="section-nav__list">
          <li><a href="#the-story" class="section-nav__link">The Story</a></li>
          <li><a href="#follow-the-money" class="section-nav__link">Follow the Money</a></li>
          <li><a href="#whats-missing" class="section-nav__link">What&#x27;s Missing</a></li>
          <li><a href="#closing" class="section-nav__link">Closing</a></li>
        </ul>
```

---

## Summary table of all edits

| # | Section | Type | Description |
|---|---------|------|-------------|
| 1 | Lede ¶1 | STRUCT-7 | Tighten internal redundancy ("named him anyway") |
| 2 | Lede ¶2 | STRUCT-1 | Remove leak from lede; promise reveal in body |
| 3 | Story ¶3 | REDUND-5, VOICE-1, VOICE-8 | Cut "Twelve hands" fragment, "case closed itself"; translate "timer" |
| 4 | Story ¶4 | VOICE-7 | Replace "long half hour" with "into two camps" |
| 5 | Photo 6 | CAPT-1 | Fix contradicted caption |
| 6 | Story ¶6 | VOICE-4 | Replace "cannot help but feel" with "By the email's own framing" |
| 7 | Photo 12 INSERT | CAPT-2 | Add Alex's plea photo after leak reveal |
| 8 | Story ¶7-9 | STRUCT-3 | Compress Sam cluster 3→2 paragraphs; insert Photo 9 between |
| 9 | Story ¶10 | MECH-1 | Em-dash → comma (Morgan/Blake) |
| 10 | Story ¶12 | MECH-2, STRUCT-6 | Em-dashes → commas + insert relocated Marcus-Vic inline quote above |
| 11 | After ¶12 | STRUCT-5, STRUCT-2, CAPT-2 | Cut "other motives" transition; insert Photo 5; insert relocated Remi-Alex exchange |
| 12 | Story ¶14 | STRUCT-2 | Fold relocated Jess quote into the Jess thread |
| 13 | Story ¶15 | STRUCT-2, VOICE-3 | Insert sharpened Ashe line; cut "Every thread collapsed" |
| 14 | Money ¶2 | VOICE-2 | Cut "Premium secrets sell at a premium" |
| 15 | Money ¶4 | VOICE-6 | Drop "by one read" hedge |
| 16 | The Players | STRUCT-2 | CUT entire section |
| 17 | Closing ¶3 | STRUCT-4 | Reframe: lead with system-survives-Marcus |
| 18 | Sidebar nav | STRUCT-2 dep | Remove Players link |

**18 edits total.**

After application:
- Section count: 5 → 4 (Players removed)
- Photo count: 4 → 7 (added 5, 9, 12)
- Paragraph count: drops by ~6 net (compression + Players cut, offset by photo insertions and Jess/Remi fold-ins)
- Estimated word count: ~1,400 → ~1,100

**Verification after apply:**
- Open the HTML; confirm no broken markup
- Confirm sidebar nav anchor IDs still match the four remaining section IDs
- Confirm photo 5, 9, 12 source paths are correct (`sessionphotos/052326/aln0523 (5 of 12).jpg`, `aln0523 (9 of 12).jpg`, `aln0523 (12 of 12).jpg`)
- End-to-end reread for any unintended breakage from interacting edits (the Sam compression in EDIT 8 is the largest single change)
