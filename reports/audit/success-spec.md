# ALN NovaNews Article — Success Specification

The corpus-grounded definition of a successful ALN report, synthesized from **29 ingredient-grounded session traces** + the shared Notion universe + the canonical timeline. This is the standard the audit holds both generation paths to. **User-review gate: this spec is the foundation of Stage 2 — review it before any code-facing work.** Companion: `open-questions.md` (unverified observations held for Stage 2 — not failures), `narrative-universe.md`, `fictional-timeline.md`.

---

## 1. What the article IS (purpose — it disciplines everything else)

The article is a **game artifact**, not free-standing journalism. It is the post-show payoff delivered to the specific room of players who just lived the morning-after investigation. Its job:

- **Assemble the full exposed picture.** No single player could track everything the room surfaced. The article compiles all the *exposed* memories into one coherent account, maps the money (who buried how much, when), and marks the **shape** of what stayed buried. But **buried memory-token content is sealed — not available to the article** (only amounts/accounts/timing are); the buried half is the hole the story circles, not something it reveals. (Paper evidence is a separate track — see §2.)
- **Reflect their choices back as consequence.** Their accusation, their burials, their behavior become the story's spine. It must be unmistakably *their* session.
- **Canonize a bespoke truth.** There is no hidden "correct" killer (the group authored the verdict). The article's truth is the **gap between the room's verdict and what the full record implies** — a reading only an outside journalist (Nova) could assemble.
- **Sustain the fiction** (NovaNews / Nova) and reward investigation + word-of-mouth.

Implication: **fidelity to this specific session is non-negotiable.** A beautiful article that mis-assigns a pronoun, miscounts the burials, or quotes a buried memory's sealed content has failed at its core job, because the players will notice it isn't faithfully *theirs*.

## 2. The interaction model — bespoke story from a shared corpus (the core mechanic)

The Notion universe is **fixed**: 81 memory tokens, ~20 player characters with set motives/relationships, paper-evidence documents, and one canonical murder-night fabula (`fictional-timeline.md`). A session does not change the story — it **selects and weights a unique cut of it**. Four ingredient types drive the projection:

| Ingredient (source) | Role in the article |
|---|---|
| **Notion content** (token text, paper evidence, character sheets) | The **quotable substance**. **Memory tokens** are gated per session: *exposed* = quotable verbatim; *buried* = sealed (only amount/timing known, content unavailable). **Paper evidence** defaults to **all available** unless a specific piece is excluded that session. Character-sheet facts are context, not in-session sourcing. |
| **Session/financial data** (expose-vs-bury, accounts, amounts, timing, accusation/vote) | **What is quotable vs pattern-only**, the room's verdict, and the money choreography. The **NeurAI board (via Blake) pays players to bury** memories — the board buys silence wholesale; **exposing** forgoes that money to put a memory on the record. So *bury vs expose* is a player choice against the board's suppression pressure, and money is the densest behavioral signal. Exposed = quotable; buried = amount/timing/behavior only (content sealed). |
| **Director notes** (behavioral observations, decoded shells, "team X", who steered) | The **Layer-3 steer** — behavioral truth, emphasis, and the throughline guidance. Shapes which gap is the story. |
| **Roster + photos** | **Authoritative per-session pronouns/names**; visual anchors + captions + character ID. |
| **Session config** (director-set) | **Reporting mode** (on-site/remote), the **reporter's first name** (may vary; surname Nova fixed), any **guest reporter** — these set the voice, byline, and access. |

The pipeline's job is to fuse these into the **most compelling TRUE story the cut supports** — and the truth is almost always the **verdict-vs-record gap**. The same canonical material yields a different bespoke article every session because the cut differs.

**Reading direction — the present interprets the past.** The article is authored from the latest vantage (Nova, that evening, having seen the morning). Party-night fragments are ambiguous and siloed on their own; what assigns them meaning is **how people behaved once they could see the night** — the money that moved, the alliances and who steered the vote, and the post-game consequences ("at the time of this writing": who was named CEO, who fled, what leaked). Money is the densest signal: because the board pays players to bury, the *fact, size, timing, and direction* of burials — and who exposed vs hid — are behavioral evidence that retroactively illuminates motive and selects the throughline. The throughline (verdict-vs-record) is itself a present-interprets-past **inference**, never stated in any one token.

**Grounded inference vs factual gap.** That inference is the craft, not speculation — *if* it clears four tests: (1) every point it rests on is real (an exposed token, an available paper doc, a logged transaction, a director observation, a stated post-game development); (2) it is carried as the reporter's *reading* ("watch how the blame moved"), not asserted as record; (3) it never claims the **content** of a sealed/buried token (the shape of a burial, yes; the hidden words, no); (4) it invents no observable (behavior, quote, or amount that didn't happen). Clearing all four enriches; breaking one is a gap. Note: a burial does **not** by itself prove the burier was personally threatened — they were *paid*, and may have buried their own memory (self-protection) or another's (cash); "this threatened *that character*" needs corroboration (their own memory + a behavior or consequence). **The right Stage-2 question is never "is it stated in a token?" but "does it pass these four tests?"**

**The present interprets the past.** The article is written from the latest vantage — Nova, that evening, having watched the morning. Its motion is **present → past**: the *this-morning / tonight* layer (the money moved during the investigation, who allied and who steered the vote, the verdict itself, and the post-game consequences like a CEO appointment or a flight from the country) is the **interpretive lens** that assigns meaning and motive to the otherwise ambiguous, siloed party-night fragments and selects the throughline. A token states an *event*; the morning behavior is what tells you what it *meant*.

**Money direction (handle with care).** Burials run one way: **players bury memory tokens — to protect a secret or purely for cash — and the market (the NeurAI Board of Directors) PAYS them to make those memories disappear.** The player is on the *receiving* end; the Board is the payer. A burial therefore signals a memory was threatening enough — often to the institution — to be worth suppressing, but **the player who collected is not necessarily whom the memory threatens** (self-protection, or pure profit — ambiguous without more grounding). Never phrase a burial as a character *paying* to bury (that reverses the flow), and never assume the burying player owns the secret.

## 3. Timeline & tense discipline (three clocks)

The article sits on a four-stage frame (`fictional-timeline.md`): **party night** (fiction, ~8 PM → 1:50 AM extraction → ~4:52 AM death) → **the morning-after investigation** (the real ~3-hour game session) → **deliberation/vote** → **Nova's same-day write-up** (on-site or remote). Memory content is "last night"; the investigation is "this morning"; Nova files "tonight." Tense and Nova's vantage (present vs remote) must stay consistent with these clocks and with the session's reporting mode.

## 4. Recurring story-shapes — descriptive patterns, NOT a template to force

Across the corpus the verdict-vs-record gap tended to recur in a few flavors. These are **observations** that help you (a) see the gap is *not* always "the room got it wrong," and (b) recognize candidate readings quickly. **They are not a menu to classify a session into.** Forcing a session's ingredients into the nearest shape is exactly how you manufacture a generic report. Always start from *this* session's specific material and find the most compelling true throughline it supports — it may match one of these, blend several, or be unlike all of them, and **the bespoke reading always wins over the nearest template.**

Patterns observed (illustration, not a checklist):
- **Absent scapegoat** — the room convicts someone not in the building; the absent one absorbs guilt that could stick to anyone present. (e.g. 052326, 060526, 042426, 021626.)
- **Inheriting widow / the heir walks** — the verdict distracts while the corporate prize (NeurAI CEO/CTO) goes to an un-accused beneficiary. (e.g. 041726, 051126, 050826, 061226.)
- **No-fault / suicide-overdose** — the room rules no killer, clearing everyone and enabling the looting; the no-fault verdict was the *useful* outcome. (e.g. 030626, 040326, 041026, 061226.)
- **Verdict matches the evidence (inverse)** — the room convicts the genuinely-implicated, so the gap shifts to *who steered the verdict* or *who escaped* (e.g. the off-page buyer / the board). (e.g. 122125, 041126, 051726.)

If naming a shape would cost a more compelling, more session-specific truth, drop the shape. *(Stage-2 watch-item, framed as a hypothesis to check against the actual prompts — not assumed: whether the pipeline's guidance/examples nudge toward shape-fitting, a plausible source of generic outputs.)*

## 5. The excellence bar (rubric, grounded in the best exemplars)

Reference exemplars (grounded, ingredient-verified): **061226, 060526, 040426, 042426, 051626, 052326, 050826.** They share:

1. **Reads against the verdict** — finds what the accusation obscures, never a retelling of who was blamed.
2. **Bespoke, not transplantable** — built from this session's exact exposed memories, account shapes, and director-observed behavior; it could only be about this room.
3. **Thesis threaded, named only at the close** — re-angled through every section (accumulation → money → character → epistemics → stated), escalating, not repeated, not frontloaded; the crispest statement is the last line, and it is **session-specific** ("It distributed the winnings"), not a generic surveillance-capitalism essay.
4. **Money as behavior, never invented ownership** — reads count/timing/direction/shape for meaning; states account ownership only where the input decodes it; buried contents are "the shape of the silence"; **totals reconcile exactly** to the burial ledger.
5. **First person calibrated to access** — present ("I was in that room"), remote ("I work these from the outside now"), or shared-byline with a guest reporter (floor work attributed) — never faking presence.
6. **Faithful to the cut** — quotes only exposed content; correct per-session pronouns; correct names; clean copy and synced metadata.

## 6. What the successes consistently do — and where the corpus is unsettled

**Consistent across the approved corpus (treat as the spec):**
- **Names & roster:** uses the current consolidated cast; **pronouns come from the session roster** (the authority), and canonical gender does not override it.
- **Money as classified story material:** the **NeurAI board (via Blake) pays players to bury** — read the *shape* of that suppression (what was buried, how much the board paid out, timing, who carried it openly vs hid). Incorporate the **in-world adjustments that carry meaning** (first-burial bonus, transfers, settlements); set aside **out-of-world** GM-error corrections; keep figures internally consistent. Don't attach a *specific personal motive* to a *specific burial* without corroboration — players are paid to bury, for self-protection *or* cash. **Direction is fixed:** the market (NeurAI Board) **pays players to bury** — the player receives, and the collector isn't necessarily whom the memory threatens; never phrase it as a character paying to suppress.
- **Evidence availability (two tracks):** *memory tokens* are gated per session — exposed = quotable, buried = sealed (report amount/timing/behavior only; never the content or invented ownership). *Paper evidence* defaults to **all available** unless a specific piece is excluded that session. Director observations shape emphasis.
- **Reporter:** surname **Nova** is fixed; the **first name is a per-session director input**.
- **Voice calibrated to mode:** present / remote / shared-byline, matched to Nova's actual access.
- **Bespoke truth:** the article finds and threads the session-specific gap between the room's verdict and the full record (the four story-shapes in §4), named at the close.

**Unsettled — held as open questions in `open-questions.md` (not yet rules):** how a *silent* roster should resolve pronouns (OQ §1); per-session adjustment classification + prose↔tracker consistency (OQ §2); where per-session **paper-evidence exclusions** are captured (OQ §3 — the *default* is settled: all available); metadata/tag sync (OQ §6); and the acceptable range of remote-voice latitude (OQ §7) and closing specificity (OQ §8).

## 7. Grounded inference vs factual gap

The best articles don't recite tokens — they **interpret** them, building the throughline by connecting points across the two timelines (a night-fragment + a morning burial/behavior + a post-game consequence). That inference is the craft, not a defect. The test that separates valid enrichment from an actual gap is **not** "is it stated in a token?" (that flags all inference). It is:

1. **Grounded points only** — every element the inference rests on is real: an exposed token, an available paper doc, a logged transaction, a director observation, or a stated post-game development. A *convergence* of grounded points, not a free-floating guess.
2. **Carried as the reporter's reading** — "watch how the blame moved," "make of that what you will," "I notice who's holding the pen" — not asserted as recorded fact.
3. **Respects the sealed layer** — uses the *fact / size / timing / direction* of a burial, never the *content* of a buried token.
4. **Invents no observable** — no behavior, quote, or amount that didn't happen; money direction correct (Board pays players).

Inference clearing all four **enriches**; only a break of one is a **gap**. This is the lens Stage 2 applies — and it reframes several earlier "speculative" flags as legitimate moves rather than fabrications.

---

*Stage 2 will hold the console pipeline and the pure `journalist-report` skill to this spec, attribute each failure class to a path (or shared logic), and propose fixes. Nothing in this spec is derived from pipeline code — it is built entirely from raw inputs + Notion + final outputs.*
