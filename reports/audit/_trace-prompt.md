# Per-Session Deep Trace Protocol (ALN reporting audit)

You are producing ONE deep, ingredient-grounded trace of a single "About Last Night" (ALN) game session, for an audit of the ALN report-generation system. ALN is an immersive crime-thriller game; after each session an NPC journalist "Nova" (Cassandra Nova) writes a NovaNews investigative article. We audit by working BACKWARDS from ground truth: judge whether the published article found and told **the most compelling TRUE story latent in THAT session's specific ingredients**.

The orchestrator's dispatch message gives you **YOUR SESSION** (`report-MMDDYY.html`) and the **input-doc Google Drive fileId**. Working dir = repo root `C:\Users\spide\Documents\claudecode\aboutlastnight\reports`.

## Absolute rules
- Read the INGREDIENTS BEFORE the article, and form your own view of the latent best story FIRST. **OUTPUT-ONLY JUDGMENT IS BANNED** — it is the proven failure mode of this audit.
- Judge narrative **ASSEMBLY** (did it find the real story latent in THIS material?), NOT surface prose features. Do NOT grep or scan for specific words/phrases to anchor on.
- Independence: read only the ground-truth sources named below — never pipeline code, prompts, schemas, or `data/{session}/` files.

## STEP 1 — Read the shared ground-truth references
- `audit/narrative-universe.md` — the shared, fixed Notion universe: all 81 canonical memory tokens by owner, characters with motives/relationships, the **old→new name map**, the rule that the universe is gender-neutral and **per-session director rosters set pronouns**, and data-quality flags. (Full token texts are in `audit/_tokens.txt` if you need to verify a quote verbatim.)
- `audit/fictional-timeline.md` — the canonical murder-night chronology + the four-stage meta-timeline (party night → morning-after investigation = the real game session → deliberation/vote → Nova's same-day write-up, on-site or remote).
- `audit/calibration-3-sessions.md` — the METHOD and the quality bar: three worked examples + the generalized "what makes an ALN article compelling." **Match this depth.**

## STEP 2 — Read the SESSION INPUT DOC from Drive
Load the Drive tool: ToolSearch query `select:mcp__4ea893b9-176f-40c0-a128-f0706cef40b2__read_file_content`, then `read_file_content` with your fileId. Extract the ingredients: roster + **per-session pronouns (authoritative)**; the accusation/deliberation (who the room blamed, vote split, competing theories); which tokens were **EXPOSED** (quotable) vs **BURIED** (amount/behavior only); the financial choreography (accounts, amounts, timing, any director-decoded ownership); director behavioral observations; photo descriptions; reporting mode (on-site/remote) + any guest reporter. Also note the doc's **internal session date** (to verify the corpus map). Cross-reference exposed tokens against canonical content in `narrative-universe.md`.

## STEP 3 — Form YOUR latent-story read (before the article)
Write down the most compelling TRUE story latent in these ingredients — typically the GAP between the room's verdict and what the full record (exposed memories + money choreography + director-observed behavior) actually implies. **Note:** the gap is not always "the room got it wrong" — sometimes the room convicts the genuinely-implicated and the real story is who/what escaped (e.g. an off-page buyer). Find what THIS session's ingredients actually support.

## STEP 4 — Now read the article
`outputs/report-MMDDYY.html` (prose begins ~line 1458; the head is shared CSS boilerplate to skip).

## STEP 5 — Write the trace to `audit/sessions/MMDDYY.md`
1. **Ingredients** — verdict, roster+pronouns, exposed/buried split (counts), money choreography, key director observations, reporting mode/guest reporter, internal session date.
2. **Latent best story** — your ingredient-derived read (STEP 3).
3. **What the article did** — did it find that story or just retell the verdict? How the throughline is established and threaded through each section; how first-person is calibrated to the reporting mode (and guest byline, if any); how it controls cast scale; specific moves with short quotes. Be discriminating and specific — name what works and what falls short.
4. **Fidelity & discipline checks** (grounded, cite specifics):
   - **Quote fidelity:** do quoted memories/paper-evidence match canonical Notion content (`narrative-universe.md` / `_tokens.txt`)? Distinguish three cases: (a) faithful; (b) **corpus-version drift** — early/pre-consolidation sessions were generated against an OLDER corpus state, so divergence from current canon is NOT necessarily fabrication; (c) **genuine invention** — content with no canonical analog at all. Label which.
   - **Evidence-boundary:** buried layer reported as amount/timing/behavior only, no invented owners; exposed content quotable. Violations?
   - **Pronouns:** correct per THIS session's roster? Flag mismatches AND flag pronoun *invention* where the roster omitted a pronoun (a known recurring tell).
   - **Money:** direction/ownership correct, asserted only where the input decodes it; do the totals reconcile against the input ledger?
   - **Old-name drift:** any retired names leaked (James/Victoria/Diana/Rachel/Derek/Leila/Tori/Howie/Sofia/Oliver)?
   - **Other anomalies:** stale `datetime`/`og:`/meta tags, placeholder editorial date, dateline vs datetime mismatch, broken/missing photo refs, "shell account" framing applied to what are really game-team handles, etc.
5. **Interaction-model contribution** — how this session's specific ingredient mix shaped its bespoke story; the success-pattern and/or failure-signal it adds.

## Return
A CONCISE summary (~200 words): the verdict; whether the article found the latent story; the 2–3 most important fidelity/discipline findings; the file path. Put the detail in the file, not the return message.
