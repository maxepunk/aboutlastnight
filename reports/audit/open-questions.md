# ALN Reporting — Open Questions & Unverified Observations

These come from analyzing the **approved, player-emailed reports** (success modes by definition) alongside their raw inputs + the Notion canon. **Nothing here is a "failure."** An approved output is the success *target*, not the thing under test. Whether any observation below is a genuine issue can only be decided by (a) verifying intent against fuller ground truth or with the director, and (b) **Stage 2**, the static-content audit, which reads the guidance, deterministic code, schema, and console UI against the Success Spec to locate divergences (now complete — see `stage2/handoff.md`). Several items rest on ground truth I did **not** fully establish (the per-session paper-evidence selection; gaps in my Notion capture) — flagged where so.

Each item: **Observation** (what was seen, where) → **To verify intent** (what would tell us whether it's intended/acceptable or worth changing in Stage 2).

## 1. Pronoun resolution when the roster is silent
**Observation.** Pronouns are set per-session by the director roster (an established project rule). When a roster omits pronouns (common in older/larger sessions), the approved articles still assign gendered pronouns; in several, the assignment differs from a gendered cue elsewhere in the same input doc (e.g. article "…she's traveling" where the doc note says "he is traveling"; an accused gendered one way in prose, another in the article).
**To verify intent.** What resolution is intended when the roster is silent — they/them default, canonical character gender, or the director's incidental prose cues? Were the apparent mismatches judged acceptable at approval, or overlooked? Until known, these are not errors — the corpus is simply inconsistent here.

## 2. How the financial layer should treat ledger adjustments
**Observation.** Article buried-totals sometimes differ from a naive sum of the scoring ledger. Per director clarification, in-world adjustments (first-burial bonus, transfers, settlements) are diegetic story material to incorporate; only out-of-world corrections (e.g. an "Aledupmistake"-type GM fix) are set aside. Treatment varies across the corpus; in a couple of cases the prose figure and the article's own financial-tracker figure differ.
**To verify intent.** Per session, which adjustments were meant as diegetic vs set-aside? Is a prose↔tracker difference deliberate framing or an artifact? (Re-evaluate each now that the diegetic/out-of-world distinction is settled — several previously-noted "miscounts" are likely correct inclusions or under-counts of diegetic money.)

## 3. Paper-evidence inclusion — RESOLVED (default rule known)
**Resolved (per director).** Paper evidence defaults to **all available** for the story, *unless* a specific piece is specified as unavailable for a specific session. So articles quoting paper-evidence documents (emails, a diary, the paternity test, a police report) that aren't in the exposed memory-*token* log are operating **as intended** — paper evidence is NOT gated by the token exposed/buried mechanic. My earlier "boundary overreach" reading of paper evidence was wrong.
**Residual open part (Stage 2).** Where/how is a per-session paper-evidence *exclusion* specified and captured, so the pipeline honors the exceptions? (Faithfulness of the specific quotes is a separate check — see §4.)

## 4. Specific quotes to faithfulness-check against the full Notion corpus
**Observation.** A few specifics didn't match what I captured: a "$163M Vic fund" (seen twice), a Mel/Patchwork-Law email, voiced dialogue on the MAR004 card, an "Ashe dated Alex" aside. My Notion token/document capture had gaps (full token texts weren't always available to the tracing pass). With paper evidence available by default (§3), most of these are *available* — the only question is **faithfulness to canon text**, not whether they belong.
**To verify intent.** Check each against the **complete** Notion token + document corpus. Several are likely faithful to canon I didn't capture; any with genuinely no source become a Stage-2 question about the generation path — not a claim about these approved reports.

## 5. Reporter first name when the input is silent
**Observation.** The reporter's first name varies by session (Cassandra/Casey/Andi/Tiresias) — **by design** (a per-session director input; "Nova" is the fixed surname).
**To verify intent.** Only open part: when the input omits a first name, is one invented or left as a clean default? (Plumbing check, low stakes.)

## 6. Metadata / hygiene artifacts
**Observation.** Stale `<time datetime>` attributes; dateline-vs-datetime differences; `og:`/`<title>` tags that don't match the visible headline (visible deck revised, social tag not). The visible editorial date "February 22, 2027" appears intentional (in-world).
**To verify intent.** Are these accepted rough edges (the social-tag mismatch is invisible on-page) or oversights worth fixing? Held as open per director steer — not assumed defects.
**Resolved (F15, Stage-2 remediation 2026-06-20).** NOT a generation defect. The current renderer (`templates/journalist/layouts/article.hbs:7-14,41-48`) syncs `og:title`/`<title>`/headline and stamps `datetime`. Verified on a current-pipeline output (`outputs/report-061226.html`): og:title, `<title>`, and `<h1>` all read "The Man Calling It an Accident Was Moving the Money", and `datetime="2027-02-22"` is the intentional in-world date. Therefore any corpus mismatch is either an era-artifact (older pre-sync renderer) or a manual post-generation HTML edit during refinement, not a pipeline bug. No generation-path code change made.

## 7. Remote-mode first person
**Observation.** Remote reports generally route everything through tips/sources and never claim floor presence; in at least one remote session the first person reads as if present in the room.
**To verify intent.** Confirm that session's actual reporting mode, and whether the presence-phrasing was a slip or acceptable latitude.

## 8. How "session-specific" a closing should be
**Observation.** Closings range from naming the bespoke session gap to landing on the broader memory-extraction/business-model theme. (I earlier mis-cast the thematic ones as weaker — that was my taste applied to approved work.)
**To verify intent.** Deliberate stylistic range, or a team preference for the bespoke close? A preference question for the Success Spec, not a defect.

## 9. Retired character names in early reports / Notion
**Observation.** Early reports use retired first names (Diana/Victoria/Derek…), generally **era-consistent** with the corpus state at the time. Notion's Timeline DB and some stray docs still carry retired names today.
**To verify intent.** Confirm early-report names are simply era-consistent (expected), and whether the live Notion Timeline-DB naming drift is known/intended.

---
**For Stage 2:** this was the checklist of intents carried into the static-content audit — the prompts, schema, deterministic code, and console UI read against the Success Spec. Adjudicated in `stage2/handoff.md` (e.g., #1 pronouns → F1, #2 ledger adjustments → F5, #3 paper-evidence coupling → F14, #6 metadata → F15).
