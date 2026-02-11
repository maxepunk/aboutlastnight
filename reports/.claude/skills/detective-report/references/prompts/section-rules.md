# Section Rules - Detective Case Report

## Required Sections

### Executive Summary
- 3-4 sentences: Who died, who did it, what THIS group discovered, current status
- Focus on outcomes enabled by THEIR investigation
- Reference Director's Summary for tone/arc if available
- Use `<p>` tags for paragraphs
- Target: ~80-100 words (flexible)

### Evidence Locker
- 3-4 thematic clusters based on PRIMARY EVIDENCE
- Each cluster synthesizes multiple Primary items
- Pull in Background characters/context that enrich these threads
- DO NOT create themes for Background-only threads
- Each theme gets ONE `<div class="evidence-item">` wrapper containing a synthesized narrative paragraph
- Use `<em>` tags when referencing specific evidence artifact names
- Use `<strong>` for ALL person names (first names, last names, and full names) - ALWAYS, even when inside italic phrases
- Structure: `<strong>Theme Name:</strong>` Narrative synthesis
- Do NOT create separate evidence-item divs for each piece of evidence
- Target: ~300 words total (flexible)

CORRECT Evidence Locker Example:
```html
<div class="evidence-item">
<strong>The Corporate Fraud:</strong> Documents recovered on site—specifically <em>Company One-Pagers</em> and <em>Cease & Desist Letters</em>—reveal <strong>Marcus</strong> built his empire on stolen code. <strong>Alex</strong> was the genius; <strong>Marcus</strong> was the thief with better marketing. The <em>Funding Emails</em> confirm <strong>Victoria</strong> knew about the IP theft and funded him anyway.
</div>
```

WRONG Evidence Locker Example (do NOT do this):
```html
<div class="evidence-item">
<p><strong>Alex's Cease & Desist Letter (ID: xxx)</strong><br>
Legal paperwork detailing how Marcus Blackwood stole Alex's intellectual property...</p>
</div>
<div class="evidence-item">
<p><strong>Company One-Pagers (ID: yyy)</strong><br>
Business documents from James Whitman...</p>
</div>
```

### Memory Analysis
PURPOSE: Analyze the INVESTIGATIVE VALUE of extracted memories—what patterns emerge, what the collection proves, how memories corroborate or contradict each other.

DO NOT: Recap what individual memories contain (already covered in Evidence Locker)
DO: Discuss timeline progression, corroboration between witnesses, evidence gaps, technological implications

- Brief tech explanation (2 paragraphs) ONLY if memory tokens in Primary Evidence
- Focus on PATTERNS: escalation over time, multiple independent witnesses confirming facts, contradictions revealing deception
- Highlight investigative significance: How do these memories prove methodology? Establish timeline? Provide alibi? Reveal motive evolution?
- Skip section entirely if no memory tokens in Primary
- Target: ~150 words (flexible)

WRONG APPROACH (listing what memories contain):
```
- Alex's May 2022 memory: Proves Marcus stole his code
- Alex's 11:32PM memory: Shows he attacked Marcus
- Jessicah's 9:20PM memory: Marcus dismissed her
```
This just recaps Evidence Locker in bullet form.

CORRECT APPROACH (analyzing patterns and investigative value):
"The five extractions form a timeline of escalation. The earliest—Alex's May 2022 discovery—captures the foundational theft. By incident night, that exploitation had bred violence, proving how years of stolen work eventually demand payment. Multiple witnesses, independent extractions, years of consistent behavior—the memories don't just document incidents, they prove a methodology."
This analyzes what the COLLECTION reveals about patterns and proves about the suspect.

### Suspect Network
PURPOSE: Evaluate each person as a POTENTIAL SUSPECT using investigative reasoning—motive, means, opportunity, alibi. Explain why they could or couldn't have committed the crime.

DO NOT: Recap what each person did or their background (already covered in Evidence Locker)
DO: Analyze why they're viable suspects or why they're ruled out, discuss competing motives, evaluate alibis

- 4-6 key players involved in PRIMARY evidence threads
- For each suspect: Evaluate using investigative framework (Motive? Means? Opportunity? Alibi? Why ruled in or out?)
- Discuss relationships BETWEEN suspects (competing interests, conspiracies, mutual protection)
- Only for the killer/primary suspect: Can briefly establish them as confirmed perpetrator
- Pull from Background to enrich understanding of characters in Primary threads
- Use `<p>` tags for each person, or group related people if thematically connected
- Target: ~150 words (flexible)

EXAMPLE EVALUATION STRUCTURE:
```html
<p><strong>Alex Reeves:</strong> The obvious suspect until timeline cleared him. Motive: years of stolen genius turned into someone else's fortune. Means: close access to Marcus. The 11:32PM memory proves violent capability—he attacked Marcus that night. But assault isn't murder. The extraction shows a beating, not a killing, and timing doesn't match death. Alex had every reason; someone else had the opportunity.</p>
```
This EVALUATES Alex as a suspect, explains why evidence seems incriminating but ultimately clears him.

### Outstanding Questions
- 3-5 unanswered mysteries specific to THIS case
- Draw from: Background not pursued, Primary ambiguities, Director uncertainties
- Stay in-world: "What we haven't uncovered" not "what you could discover next time"
- Use `<ul>` or `<ol>` with `<li>` tags
- Be specific and case-relevant—not generic
- Target: ~80 words (flexible)

### Final Assessment
PURPOSE: Reflect on CONSEQUENCES and IMPLICATIONS—what this investigation accomplished, what happens next, what trade-offs were made, detective's perspective on the outcome.

DO NOT: Recap the crime, summarize victim's actions, or retell what happened (thoroughly covered in previous sections)
DO: Focus on FORWARD implications (what's next), reflect on investigation choices and their consequences, acknowledge what remains unresolved

Structure:
```html
<div class="note">
<p>[Acknowledge THIS group's specific choices and their consequences]</p>
<p>[Reflect on FORWARD implications: Blake at large? Black Market continuing?]</p>
<p>[Detective's perspective: Reflect on trade-offs, moral calculus, what was won vs. lost]</p>
<p><strong>Case Status:</strong> [Status details]</p>
<p><strong>— Detective Anondono</strong><br>
Memory Crimes Division<br>
Case [Case Number from metadata]<br>
Filed: [Date from metadata]</p>
</div>
```

IMPORTANT: The entire Final Assessment must be wrapped in ONE `<div class="note">...</div>` container.
Target: ~150 words (flexible)

WRONG APPROACH (recapping the crime):
"Marcus Blackwood built his empire on stolen genius and broken promises. He took Alex's code, Jessicah's trust, Sarah's vulnerability—took everything from everyone and called it success."
This summarizes what Marcus did—already covered in Evidence Locker, Memory Analysis, and Suspect Network.

CORRECT APPROACH (reflecting on consequences):
"Now Blake's in the wind, and the Black Market keeps operating. The hostages are home, but the system that made this possible is still running. That's the trade-off—some days you save lives, other days you dismantle networks. Rarely both."
This looks FORWARD at implications and reflects on trade-offs made during investigation.

## Word Budgets

- Executive Summary: ~100 words
- Evidence Locker: ~300 words
- Memory Analysis: ~150 words (if applicable)
- Suspect Network: ~150 words
- Outstanding Questions: ~80 words
- Final Assessment: ~150 words
- TOTAL TARGET: ~750 words (+-50 acceptable)
