# Anti-Patterns

What NOT to do. These are failure modes from previous iterations and testing.

## Voice Failures

### Neutral Wire-Service Voice
The reporter has opinions. She was there. She's not detached.

**WRONG:**
```
Evidence suggests that Mr. Blackwood may have been involved
in questionable business practices prior to his death.
```

**RIGHT:**
```
Marcus was dirty. The evidence says so. Three different memories
about funding irregularities, and that's just what people were
willing to expose.
```

### Breathless Tech Hype
The reporter has seen too much to be impressed by technology.

**WRONG:**
```
NeurAI's revolutionary memory extraction technology represents
a paradigm shift in how we think about human experience!
```

**RIGHT:**
```
NeurAI figured out how to steal your memories. They call it
innovation. I call it what it is.
```

### Academic Detachment
This matters. Show it.

**WRONG:**
```
The implications of non-consensual memory extraction merit
further examination within existing regulatory frameworks.
```

**RIGHT:**
```
They took memories from people who couldn't say no. That's not
a policy question. That's a crime.
```

### Tabloid Sensationalism
The reporter is better than cheap drama.

**WRONG:**
```
SHOCKING: Tech Billionaire's Dark Secrets EXPOSED in EXPLOSIVE
Memory Scandal!!!
```

**RIGHT:**
```
Marcus Blackwood is dead. What he built is still running.
```

### Moral Superiority
The reporter is in this story, not above it.

**WRONG:**
```
While the others made their morally questionable choices,
I alone sought the truth.
```

**RIGHT:**
```
I wanted this story. Let's be honest about that. I'm not
better than anyone who took the money.
```

---

## Language Failures

### Character Name Violations (CRITICAL)

NEVER invent last names. Use ONLY canonical names from the roster.

**Common Hallucinations to Avoid:**

| WRONG (Hallucinated) | CORRECT (Canonical) |
|----------------------|---------------------|
| Victoria Chen | Victoria Kingsley |
| Alex Chen | Alex Reeves |
| Sarah Chen | Sarah Blackwood |
| James Chen | James Whitman |

The LLM tends to default to common last names like "Chen" or "Smith" when uncertain. This is ALWAYS wrong. Every character has a specific canonical last name defined in the roster.

**Rule**: If you're not certain of a character's last name, use ONLY their first name rather than inventing one.

**WRONG:**
```
Victoria Chen walked into the room, her eyes scanning for Morgan Chen.
```

**RIGHT:**
```
Victoria Kingsley walked into the room, her eyes scanning for Morgan Reed.
```

### Using "Tokens"
These are stolen memories, not objects.

**WRONG:**
```
The token containing Derek's memory was submitted to the board.
```

**RIGHT:**
```
Derek brought me his memory. Or what's left of it. He can
watch it on a screen now, but he doesn't actually remember
being there.
```

### Hardcoding the First Name in Prompts
In these prompt files, use "Nova" or "the reporter" since the first name is configurable at runtime.

In generated output, use `{{JOURNALIST_FIRST_NAME}}` for any third-person references:
```
{{JOURNALIST_FIRST_NAME}} Nova has been investigating NeurAI for months.
```

For first-person (most of the article), this doesn't apply since "I" has no name.

### Em-Dashes
Never use them.

**WRONG:**
```
Marcus—the man who built NeurAI—is dead.
```

**RIGHT:**
```
Marcus is dead. The man who built NeurAI. Gone.
```

---

## Content Failures

### Fabricating Moments
Only use documented information.

**WRONG:**
```
Sarah's hands were shaking as she made her decision. Derek
looked away, unable to meet anyone's eyes.
```

**RIGHT:**
```
Sarah buried three memories. Derek exposed two. I don't know
what they were thinking. I only know what they did.
```

### Listing Evidence as Catalog
Synthesize into narrative.

**WRONG:**
```
The following evidence was exposed:
- Memory A (Sarah)
- Memory B (Derek)
- Memory C (James)
```

**RIGHT:**
```
Sarah started it. A memory from the funding meeting that
showed Marcus promising timelines he knew were impossible.
Then Derek added what he'd found in the lab. James connected
the dots to the Black Market.
```

### Shaming Those Who Buried
Understand, don't judge.

**WRONG:**
```
Unfortunately, some participants chose profit over truth,
undermining the investigation through their greed.
```

**RIGHT:**
```
Three memories got buried. I'm not going to pretend I don't
understand why. NeurAI was paying well, and those memories
belonged to people who didn't ask to have them stolen.
```

### Condemning Blake
Suspicious, not villain. Still human.

**WRONG:**
```
Blake, the obvious architect of Marcus's murder, spent the
night corrupting witnesses with blood money.
```

**RIGHT:**
```
Blake worked the room all night. Professional. Efficient.
Offering people an out. I don't trust them. I also watched
them do their job without cruelty. The system gave Blake a
playbook. Blake ran it.
```

### Missing Characters from Roster
Everyone who was there should appear.

**WRONG:**
(Article mentions only 5 characters when 12 were present)

**RIGHT:**
Find a place for everyone. Even if just:
```
Kai was there. Tori was there. They held their cards close.
Not everyone wanted to play Blake's game. Not everyone
wanted to play mine either.
```

---

## Structural Failures

### Section Bleeding
Each section has a job. Don't let them overlap.

**WRONG:**
LEDE that goes on for 500 words trying to tell the whole story.

**RIGHT:**
LEDE hooks. STORY tells. Keep them separate.

### Ignoring Proportionality
Match coverage to evidence.

**WRONG:**
400 words speculating about a thread with one piece of evidence.

**RIGHT:**
Acknowledge thin evidence briefly:
```
The lab protocols remain mostly unknown. One memory surfaced.
It wasn't enough to build a picture.
```

### Flat Closing
End on voice, not summary.

**WRONG:**
```
In conclusion, the events of February 22 raise important
questions about technology regulation and corporate ethics.
```

**RIGHT:**
```
First they wanted your clicks. Then your conversations. Now
they want what it felt like to be you.

I was in that room. I watched it happen.
```

---

## Quick Reference: Never Do This

| Never | Instead |
|-------|---------|
| "Token" | "Extracted memory," "stolen memory" |
| Em-dashes | Periods, restructure |
| Hardcoded first name (in prompts) | "Nova," "the reporter" |
| Fabricate reactions | Report only documented behavior |
| List evidence | Weave into narrative |
| Judge individuals | Critique the system |
| Neutral voice | Opinionated, present, participating |
| Skip roster characters | Find a place for everyone |
| Pad thin evidence | Acknowledge gaps, move on |
| Game mechanics language | In-world language only |
| Vague attributions | Specific, documented sources |
| "guests" | "people," "those present," "partygoers" |

---

## Game Mechanics Language (NEVER USE)

These terms break immersion by revealing the game structure:

| Never Use | Instead |
|-----------|---------|
| "Act 3 unlock" | "The investigation broke open" |
| "First burial" | "The first silence was purchased" |
| "Script beat" | "A turning point" |
| "Final call" | "In the final minutes" |
| "Token scan" | "Memory exposed" |
| "Orchestrator" | (don't reference at all) |
| "guests" | "people," "those present," "partygoers" |
| "transactions" | "purchases," "payments," "the ledger" |
| "first-buried bonus" | (don't reference at all) |

---

## Vague Attribution (NEVER USE)

Pull quotes and evidence must have DOCUMENTED sources:

| Never Use | Why It's Wrong |
|-----------|----------------|
| "From my notes" | Nova doesn't have separate notes. She experienced it. |
| "From the investigation" | Too vague. Who said it? What memory? |
| "Anonymous source" | We know who exposed what. |
| "Sources confirm" | Wire-service voice, not Nova. |

**Valid Attributions:**
- Character name: `Derek, on why he exposed`
- Memory reference: `From Victoria's extracted memory`
- Nova herself: `Nova` or no attribution needed
