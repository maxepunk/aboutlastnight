# Website Update PRD: About Last Night
## Feb 2025 Run

---

## Document Info
- **Version:** 1.0
- **Date:** January 26, 2025
- **Status:** Ready for Implementation
- **Focus:** Copy & Information Architecture (not implementation specifics)

---

## Executive Summary

Major website restructure for the Feb 26 - Apr 5, 2025 run of About Last Night. This PRD addresses conversion barriers identified in team feedback: unclear CTAs, missing plain-English explanation, buried differentiators, and information architecture that front-loaded atmosphere without orienting visitors.

**Primary Objectives:**
1. Clarify what the experience IS without sacrificing noir atmosphere
2. Make the site a shareable resource for word-of-mouth marketing
3. Communicate approachability (no acting/puzzle expertise required)
4. Highlight unique differentiators: narrative archeology, constructed truth, player agency

**Design Principle:** Gradual transition from immersive in-world voice at the top to practical out-of-world explanation lower on the page.

---

## Information Architecture Changes

### Section Ordering

**Current order:**
1. Hero
2. Case Status Bar
3. Fragmented Memories
4. What Happened Last Night
5. The Investigation Begins
6. How You'll Find the Truth
7. The Evidence You'll Uncover
8. Who Would Create This?
9. FAQ
10. Booking Widget

**New order:**
1. Hero
2. Urgency Bar (renamed)
3. What Happened Last Night (moved up)
4. Fragmented Memories (rewritten)
5. **NEW:** What exactly is 'About Last Night...'?
6. *Testimonial #1*
7. **NEW:** How to Play (replaces How You'll Find the Truth)
8. *Testimonial #2*
9. **NEW:** Why We Made This
10. Who We Are (updated)
11. FAQ (updated)
12. *Testimonial #3*
13. Booking Widget

### Sections Removed
- **The Investigation Begins** — Cut entirely ("nothing sauce")
- **The Evidence You'll Uncover** — Cut; content absorbed into How to Play

### Sections Added
- **What exactly is 'About Last Night...'?** — Plain-English explanation, approachability, differentiation
- **Why We Made This** — Indie artist voice, the "why" behind the project
- **3 Testimonials** — Strategically placed for validation at key moments

---

## Section Changes

### 1. Hero Section

**Priority:** P0

| Element | Current | Change To |
|---------|---------|-----------|
| Headline | "About Last Night..." | Keep |
| Subheadline | "An Immersive Crime Thriller" | Keep |
| Credibility line | "From Award Winning Puzzle, Game, and Immersive Theater designers" | Keep |
| Tagline | "Some memories are worth killing for." | Keep |
| Primary CTA | "Initiate Memory Recovery" | **"Join the Party"** |
| Secondary CTA | "Get Answers Now" | **"Got Questions?"** |
| Hero image | ALN-marcusisdead.jpg | **Party photo from venue** |

**Rationale:** CTAs were identified as confusing ("they take me to unexpected places"). New labels are clear about destination while maintaining inviting tone.

---

### 2. Urgency Bar (Case Status Bar)

**Priority:** P0

**Current:**
```
CASE #ALN-2025
STATUS: LIMITED ENGAGEMENT • ACCEPTING INVESTIGATORS
•  
Dec 4, 2025 - Jan 1, 2026 ($75/person) • Run Extended!
[Claim Your Identity]
```

**Change to:**
```
CASE #ALN-2025
STATUS: LIMITED ENGAGEMENT • CASE OPEN • BOOKING NOW
•  
Feb 26 - Apr 5, 2025 • $75/person
[Let's Play!]
```

**Rationale:** Updated dates for new run. "ACCEPTING INVESTIGATORS" uses deprecated terminology. "CASE OPEN • BOOKING NOW" is clearer. CTA changed per global CTA decision.

---

### 3. What Happened Last Night

**Priority:** P1

**Position:** Moved UP (now section 3, was section 4)

**Current:**
```
## What Happened Last Night

Marcus Blackwood's underground party. NeurAI's CEO playing host to Silicon Valley's shadow players. The warehouse. The music. Sarah was there. You were there.

Now he's dead, and everyone's memories are up for sale.

[Learn What You Did]
```

**Change to:**
```
## What Happened Last Night

Marcus Blackwood's underground party. 
NeurAI's CEO playing host to Silicon Valley's rising stars. 
The warehouse. The music. The deals made.

Marcus is dead.
Some friends are missing.

Your memories were taken. 
And those memories are now up for sale.
```

**Changes:**
- Moved before Fragmented Memories (context before situation)
- Staccato line breaks for noir pacing
- "shadow players" → "rising stars" (cleaner)
- Added "Some friends are missing" (raises stakes)
- Removed "Sarah was there. You were there." (too specific, less universal)
- Removed CTA (flows directly into next section)

**Rationale:** Team direction was to lead with party context ("What Happened Last Night") before dropping into present situation ("Fragmented Memories"). The show is called "About Last Night" — start with last night.

---

### 4. Fragmented Memories

**Priority:** P0

**Current:**
```
## Fragmented Memories

You remember the party. Sort of. A warehouse rave in Fremont, thrown by VC darling Marcus Blackwood.

Now you're in a room with other guests. An investigator is asking questions. Marcus is dead.

Your memories have been locked in physical objects throughout the space. But they're more than just memories now – they're commodities. Tradeable. Valuable. Dangerous.

2-hours to piece together the truth. 5-20 players caught in the same web. What cost would you bear to uncover the truth about last night?

But how did it begin? Think back to the party...
```

**Change to:**
```
## Fragmented Memories

Now you're in a room of strangers. 
You are supposed to remember. 

They bought you time before the cops show up on the scene. 
They will take you away.
You are a SUSPECT in Marcus' murder. 

An offer is made. 

Unlock and BURY those memories, and walk away with the profit. 
or
EXPOSE those secrets as evidence and secure your alibi. 

The wrinkle is: you all must get your story straight before the time is up and you must run.
```

**Changes:**
- Complete rewrite with staccato noir voice
- Introduces BURY vs EXPOSE core mechanic IN the story (not as separate explanation)
- Establishes collective goal: "get your story straight"
- Removes "An investigator is asking questions" (deprecated terminology)
- Removes "But how did it begin?" (no longer needed since What Happened now comes first)
- Removes stats line (saved for How to Play)

**Rationale:** The new copy does double duty — immersive atmosphere AND explains the core tension. Visitors understand what they'll be doing without breaking the in-world voice.

---

### 5. What exactly is 'About Last Night...'? (NEW)

**Priority:** P0

**Position:** After Fragmented Memories

```
## What exactly is 'About Last Night...'?

Think escape room meets murder mystery — but you're not solving for the "right" answer.

Every puzzle unlocks a piece of the past. Backstory. Relationships. What actually happened at that party. Call it narrative archeology. You're digging up secrets that belong to everyone in the room.

But here's the wrinkle: you don't have to share what you find.

Bury a memory for profit. Expose it as evidence. Trade it for leverage. The "truth" that emerges isn't always the objective truth — it is whatever your group decides to present when time runs out.

This isn't Mafia. There's no hidden killer to catch, no bluffing about who you are. 
You all start not really knowing who you are. And as you discover more about yourself and others, you get to negotiate what everyone will *say* happened. Think Diplomacy, not Werewolf.

You don't need to be an actor — there's no audience watching.
You don't need to be a puzzle expert — you could never touch a lock and still play a crucial role in shaping the story.

You just need to decide: what kind of story you want to walk out of here with?
```

**Rationale:** This is the pivot section — the transition from atmosphere to explanation. Addresses:
- Category clarity ("escape room meets murder mystery")
- The unique mechanic ("narrative archeology," "constructed truth")
- Differentiation from similar experiences ("Diplomacy, not Werewolf")
- Approachability (no acting, no puzzle expertise required)

---

### 6. Testimonial #1

**Priority:** P1

**Position:** After "What exactly is 'About Last Night...'?"

```
"The setup is unique and interesting, and I really like the depth of story (even if we didn't find all of it) and the way the bits of story we found weaved into our own narrative."
```

**Rationale:** Validates the differentiation claims in the section above — uniqueness, depth, constructed narrative.

---

### 7. How to Play (NEW — replaces How You'll Find the Truth + The Evidence You'll Uncover)

**Priority:** P0

```
## How to Play

2 hours. 5-20 players. 40+ puzzles. One story to get straight.

### Your Character

You'll receive a character sheet — your name, some memory fragments you still recall, maybe the name of someone you remember knowing. You don't know everything about who you are yet. Neither does anyone else.

This is your starting point. What you learn from here is up to you.

### The Game

The warehouse that hosted last night's party is full of locked secrets. Puzzles guard memory tokens and physical evidence of what happened last night.

Solve puzzles. Unlock memory tokens. Scan them to see what happened in that memory.

Then decide: expose it, bury it, or trade it.

That's the loop. But you're not alone in it. Others are unlocking memories too — about themselves, about you, about what really happened to Marcus. And the puzzles may need information only they have.

What is found, what is shared, what is hidden... all of that is the game. Along with incentives offered by NPCs. Expose your alibi to the public, and you're off the hook. Bury the right secrets, and you may become the next face of NeurAI. 

The clock is always running. By the end, your group needs to agree on a story to tell when the cops arrive.

### The Morning After

You leave, hopefully before the cops bust your unofficial investigation and take you in for questioning... But the story doesn't end.

After the game you'll receive a final personalized report — an in-world blog post from Nova News, breaking down the story based on the choices your group made. The 'official' story, so to speak, that makes it to the public about your group and characters given the choices you make during your game session. 

Story bits you may have missed during your personal journey through the game arrive in your inbox in the form of an investigative report that is bespoke for each game session.
```

**Rationale:** Replaces two vague sections with literal mechanics. Three-act structure (Character → Game → Morning After) mirrors the actual experience arc. Post-game report is now explicitly mentioned (team decision: the wow comes from HOW customized it is, not that it exists).

---

### 8. Testimonial #2

**Priority:** P1

**Position:** After "How to Play"

```
"I really enjoyed finding my memories and role playing the character."
```

**Rationale:** Validates that the mechanics described above actually deliver — memory-finding and character immersion work.

---

### 9. Why We Made This (NEW)

**Priority:** P1

**Position:** Before team bios

```
## Why We Made This

We wanted to build something that explores the boundaries of what is possible. 

We wanted to combine our favorite elements from escape rooms, immersive experiences, and tabletop gaming. And most of all, in an age when our personal information and ability to connect are getting increasingly commoditized, we wanted to create a social experience where we can all collectively explore some very-real-sh*t(tm) through the lens of fiction.  

And we wanted to make it accessible to all of our friends, without asking them to be actors, puzzle savants, or social butterflies.

This project is made by a small team of independent artists trying to create something weird and interesting while paying the performers and facilitators equitably to make it possible to run our weird game in the first place. We're two people who've spent years in escape rooms, immersive theater, and game design, using our personal resources to combine things that 'aren't supposed to go together'.

It's ambitious. It's DIY. And it is constantly evolving. 

Every run we learn something to make it better.

If that sounds like your kind of weird, let's tell a story about last night together.
```

**Rationale:** Team wanted to "hit harder" on the indie artist identity. This section establishes the "why" — not a franchise, not VC-backed, just artists making a weird thing. Also reinforces approachability and signals that the experience is evolving (setting appropriate expectations).

---

### 10. Who We Are (Updated)

**Priority:** P1

**Changes:** Add Casey Selden bio

```
## Who We Are

### Shuai Chen

MIT- and Stanford-trained Neurobiologist | Patchwork Adventures

Creator and producer of Immy and Golden Lock award winning "Order of the Golden Scribe: Initiation Tea," Chen leads the team at Patchwork Adventures to create and host over 1000 puzzle games and murder mysteries. Not only does she design puzzles, she also represented Team USA in the Escape Room World Championships. Chen's neurobiological studies inform experiences where memory, perception, and reality blur.

### Bora "Max" Koknar

Experience Designer & Creative Director | StoryPunk

Founder of StoryPunk, a creative studio specializing in immersive storytelling. He received the 2022 CALI Catalyst Award for equity-centered practice. His work includes "The Super Secret Society: A Playable Play" (SF Chronicle), and during the pandemic he produced over 450 digital events employing 200+ artists. Max previously served as Co-Artistic Director at Dragon Productions Theatre Company (2019-2021) and Associate Artistic Director at Epic Immersive (2015-2019).

### Casey Selden

Experience Designer & Performer | Palace Games, Odd Salon

Selden has guided 10,000+ guests through immersive experiences over a decade—from renegade museum tours designed for skeptics to The Racket, a Film Noir team-building game built on blackmarket deals and devious exchanges. One of Odd Salon's most frequent speakers, they have researched and performed 20+ original lectures on the oddest corners of history and science. For About Last Night..., Selden brings expertise in making strangers comfortable doing uncomfortable things together.

### Off the Couch Games

Fremont's Premier Escape Room Venue

Silicon Valley's hub for innovative gaming experiences. Partnering to bring this groundbreaking fusion of escape room mechanics and immersive theater to life in their transformed warehouse space.
```

---

### 11. Testimonial #3

**Priority:** P1

**Position:** Before booking widget

```
"My group and I were amazed by the amount of work that went into creating the room and all of its moving parts—we're still talking about it!"
```

**Rationale:** Final conversion push — validates production value and memorability right before the booking decision.

---

### 12. Booking Widget

**Priority:** P1

**Current:**
```
**NEURAI INC. - INVESTIGATION SCHEDULING TERMINAL**

Select your entry point into the investigation.

Time slots are limited • Memory corruption is irreversible • Case sessions fill rapidly
```

**Change to:**
```
**NEURAI INC. - INVESTIGATION SCHEDULING TERMINAL**

Select your entry point into the investigation.

Time slots are limited • Authorities have been ALERTED • Case sessions fill rapidly
```

**Change:** "Memory corruption is irreversible" → "Authorities have been ALERTED" (more urgency, ties to story)

**Note:** Booking widget itself must be updated to reflect Feb 26 - Apr 5, 2025 dates.

---

## FAQ Updates

### Questions Modified

**1. What exactly is this experience?**

**Current:** Full explanation paragraph

**Change to:**
```
### What exactly is this experience?

Short version: an immersive crime thriller where you play a suspect with missing memories. Solve puzzles, uncover secrets, decide what to bury or expose. [Read the full breakdown above.](#what-exactly-is-about-last-night)
```

**Rationale:** New "What exactly is..." section handles this in depth. FAQ version becomes a quick summary with link.

---

**2. How many people do I need?**

**Current:**
```
Minimum 5 players, maximum 20. Don't have a full group? You'll be paired with others – and trust us, playing with strangers adds to the tension and strategy.
```

**Change to:**
```
### How many people do I need?

Minimum 5 players, maximum 20. 

**What's the sweet spot?** The game scales well across the range, but 10-16 players tends to hit the best balance of social complexity and puzzle coverage. Smaller groups (5-8) feel more intimate and collaborative. Larger groups (16-20) get more chaotic negotiation and competing agendas.

Don't have a full group? You'll be paired with others – and trust us, playing with strangers adds to the tension and strategy.
```

**Rationale:** "What's the optimal group size?" was identified as one of the most common questions. Now answered explicitly.

---

**3. How long does it take?**

**Current:**
```
Plan for 2 hours of gameplay, with around 20 minutes of on-boarding and offboarding.
```

**Change to:**
```
### How long does it take?

Plan for 2 hours total, including orientation and gameplay.
```

**Rationale:** Previous copy was incorrect. 2 hours includes orientation.

---

**4. Too Pricy? (NOTAFLOF)**

**Current:**
```
NOTAFLOF   
If you're interested in experiencing About Last Night... but the price is too prohibitive for you right now, please send us an email at hello@patchworkadventures and we're happy to send you some promo codes to make the experience more accessible.  
We fiercely believe in paying our team well, but we also hate that puzzle games and immersive experiences are accessible only to the privileged.   
We have plenty of promo codes available, so please don't hesitate to message us if the cost is any concern.
```

**Change to:**
```
### Too Pricy?

NOTAFLOF

We set the ticket price for About Last Night... to reflect the costs of running an experience with actors in the SF Bay Area. However, we hate that puzzle games and immersive experiences are typically only accessible to the privileged. If you're interested in experiencing About Last Night... but the price is too prohibitive for you, please feel free to use one of these promo codes to make the experience accessible to you:

ALNDiscount25: 25% off tickets
ALNDiscount50: 50% off tickets
ALNDiscount75: 75% off tickets

(We make all of these discount levels available and trust our players to choose based on their level of need)
```

**Rationale:** Self-service discount codes remove friction (no email required). Trust-based model aligns with indie artist values.

---

**5. When and where?**

**Current:**
```
**This is a limited-run pop-up experience running through January 1, 2026.** *Extended by popular demand!*  
  
Off the Couch Games in Fremont, CA  
555 Mowry Avenue, Fremont, CA 94536  
December 4, 2025 - January 1, 2026  
Thursday-Sunday performances, multiple time slots  
Contact us for weekday bookings at hello@patchworkadventures.com
```

**Change to:**
```
### When and where?

This is a limited-run pop-up experience.

Off the Couch Games in Fremont, CA
555 Mowry Avenue, Fremont, CA 94536
Feb 26 - Apr 5, 2025
Thursday-Sunday performances, multiple time slots
Contact us for weekday bookings at hello@patchworkadventures.com
```

**Rationale:** Updated dates. Removed "Extended by popular demand!" (no longer applicable).

---

### Questions Unchanged

The following FAQ items remain as-is:
- Will we be paired with strangers?
- How much does it cost?
- Is this scary?
- What should I know before coming?
- Age requirements?
- Content warnings?
- How do I book?
- What about parking?
- Accessibility concerns?
- Will I get locked into a room?

---

## CTA Summary

All CTAs updated for clarity while maintaining voice:

| Location | Current | Change To |
|----------|---------|-----------|
| Hero - Primary | "Initiate Memory Recovery" | **"Join the Party"** |
| Hero - Secondary | "Get Answers Now" | **"Got Questions?"** |
| Urgency Bar | "Claim Your Identity" | **"Let's Play!"** |
| What Happened Last Night | "Learn What You Did" | **Remove** (section flows directly) |
| The Investigation Begins | "See How To Solve This" | **Section removed** |
| The Evidence You'll Uncover | "I Need To Remember" | **Section removed** |
| FAQ lead-in | "Begin Memory Recovery" | **"Join the Party"** (if retained) |

---

## Content Requirements

| Content Type | Description | Owner | Priority |
|--------------|-------------|-------|----------|
| Hero image | Party photo from venue (replace marcusisdead.jpg) | Max | P1 |
| Testimonials (3) | Already identified and placed | Complete | P1 |
| Casey Selden bio | Added to Who We Are | Complete | P1 |

---

## Out of Scope

Explicitly not covered in this PRD (left to implementation phase):
- CSS/styling details
- Animation specifications
- Responsive breakpoint behavior
- JavaScript functionality
- Backend/API requirements
- Booking widget integration
- Third-party integrations

---

## Open Questions

1. **Hero image selection** — Which party photo from venue? Owner: Max
2. **Testimonial attribution** — Include names/initials with quotes, or keep anonymous?
3. **FAQ anchor link** — Confirm `#what-exactly-is-about-last-night` works as anchor target

---

## Decision Log

| Decision | Options Considered | Choice | Rationale |
|----------|-------------------|--------|-----------|
| Primary CTA text | "Get Tickets" / "Book Now" / "Join the Party" / "Let's Play!" | "Join the Party" (hero), "Let's Play!" (urgency bar) | Clear but maintains inviting tone; "Join the Party" ties to story |
| Subhead | Keep "Immersive Crime Thriller" / Change to "Playable Crime Thriller" / Add second line | Keep as-is | Works for target audience; explanation happens in new section |
| Section order | Story first vs. Explanation first | Story first, with new explanation section after | Honors gradual atmosphere → explanation transition |
| FAQ approachability questions | Add separate FAQs / Rely on main content | Main content sufficient | "What exactly is..." section already addresses |
| Post-game report | Keep as surprise / Reveal upfront | Reveal upfront | The wow comes from customization, not existence |
| Testimonial placement | Grouped together / Sprinkled strategically | Sprinkled at 3 key moments | Validates specific claims at point of claim |

---

## Full Page Flow (Final)

```
┌─────────────────────────────────────────┐
│ HERO                                    │
│ "About Last Night..."                   │
│ An Immersive Crime Thriller             │
│ [Join the Party]  [Got Questions?]      │
├─────────────────────────────────────────┤
│ URGENCY BAR                             │
│ Feb 26 - Apr 5, 2025 • $75/person       │
│ [Let's Play!]                           │
├─────────────────────────────────────────┤
│ WHAT HAPPENED LAST NIGHT                │
│ (The party, Marcus, the setup)          │
│ ↓ flows directly                        │
├─────────────────────────────────────────┤
│ FRAGMENTED MEMORIES                     │
│ (Your situation, BURY vs EXPOSE)        │
│ ↓ flows directly                        │
├─────────────────────────────────────────┤
│ WHAT EXACTLY IS 'ABOUT LAST NIGHT'?     │
│ (Category, differentiation, approach.)  │
├─────────────────────────────────────────┤
│ ★ TESTIMONIAL #1                        │
│ "...the way the bits of story we found  │
│ weaved into our own narrative."         │
├─────────────────────────────────────────┤
│ HOW TO PLAY                             │
│ • Your Character                        │
│ • The Game                              │
│ • The Morning After                     │
├─────────────────────────────────────────┤
│ ★ TESTIMONIAL #2                        │
│ "I really enjoyed finding my memories   │
│ and role playing the character."        │
├─────────────────────────────────────────┤
│ WHY WE MADE THIS                        │
│ (Indie artist voice, the why)           │
├─────────────────────────────────────────┤
│ WHO WE ARE                              │
│ • Shuai Chen                            │
│ • Bora "Max" Koknar                     │
│ • Casey Selden                          │
│ • Off the Couch Games                   │
├─────────────────────────────────────────┤
│ FAQ                                     │
│ (Updated questions)                     │
├─────────────────────────────────────────┤
│ ★ TESTIMONIAL #3                        │
│ "...we're still talking about it!"      │
├─────────────────────────────────────────┤
│ BOOKING WIDGET                          │
│ NEURAI INC. SCHEDULING TERMINAL         │
│ [Calendar/Booking Interface]            │
└─────────────────────────────────────────┘
```

---

*PRD Complete — Ready for Implementation*
