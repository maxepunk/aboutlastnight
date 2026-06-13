# ALN Report-Generation Pipeline — Failure-Mode Taxonomy

Review of the investigative-journalism report pipeline at `/home/user/aboutlastnight/reports`. Ground truth = the refinement working files in `reports/outputs/` (`-findings`, `-findings-copyedit`, `-editplan*`, `-refsheet`) plus the manual-fix git diff for 060626. Sessions analyzed in depth: **052326, 052926, 053026, 053126** (recent, full working-file sets), **040426, 041726, 050926** (trend anchors), plus the **060626** manual-edit diff (commit `7182220`) and the **060526** publish history.

## Data-coverage note (matters for interpretation)
- **060526** (`report-060526.html`) was committed once (`9f2d90c "Add 060526..."`) with **no findings/editplan/refsheet files and no refine commit** — it appears to have been **published without running the two-pass refinement at all**. It is a raw-pipeline artifact, not evidence the pipeline improved.
- **060626** has **no findings files** either, but DID get a manual editorial pass committed separately (`7182220 "Refine 060626... after editorial pass"`). That diff is the only ground truth for that session and captures **manual fixes that never appear in any findings file** — see §A10/§C below.
- So the apparent "fewer findings in June" is largely a **process-coverage artifact**, not a quality trend. The persistent categories below are still clearly persistent across every session that WAS fact-checked.

---

# 1–2. Taxonomy of Error Categories (frequency / severity / examples / trend)

Severity scale: CRITICAL (blocks publish; factually wrong or misgenders the accused) / HIGH / MED / LOW.

### A1. Pronoun / misgendering errors — PERSISTENT, the #1 recurring failure
**Frequency:** Every fact-checked session with they/them or cross-gender-from-name players. 040426 (5 players flagged: Vic/Morgan/Remi/Riley/Mel), 041726 (**6 instances**, table A1–A7), 050926 (**15 instances** — Vic he, Sam she, Ashe he, Jamie he), 052326 (A2 Morgan he, A3 Sam she, A4/A9 Quinn unspecified), 052926 (B2 Blake they/them rendered "the man" ×2). **Severity: CRITICAL** (it's the accused or a central witness in most cases; sidebar+lede are most-visible).
**Examples:**
- 050926: `vic003` paragraph — "Vic Kingsley stood on the sidewalk... with **her** designer scarf... **She** had already decided to replace him" — Vic = he this session, 4 errors in one paragraph (`report-050926-findings.md` S4).
- 041726: Lede "Alex Reeves. **The man** whose algorithm Marcus stole... by **his own** recorded admission" — Alex = she; lede out of sync with body (`report-041726-findings.md` A1).
- 052926: Blake (they/them) rendered "**the man** who ran the market" and "**the man** running the market" (`report-052926-findings.md` B2).
**Trend: NOT improving.** Volume dropped (15 in 050926 → ~3 in 052926) only because later sessions had fewer non-obvious-pronoun players. The *rate* of error on any non-name-inferable pronoun stays ~100%. The default failure is "infer she/her from… nothing" or "they/them → the man."

### A2. Evidence-layer (buried-content) boundary violations — PERSISTENT
The three-layer rule (`CLAUDE.md`: EXPOSED quote/describe; BURIED report amounts/accounts ONLY; never content): the pipeline routinely treats BURIED transaction data as if Nova can decode *what* was buried or *who* operated an account.
**Frequency:** 040426 (B1 Bob-account→arc mapping, B2 Unicorn→Skyler/Quinn mapping), 050926 (M1/M4 anonymous accounts erased), 052326 (B4/B5 cite `vic002` which is in the **untouched** list — content Nova never saw; B7 decodes the Blake account as "Valet's employers"), 052926 (B10 "the money did not move toward Jess" = the account-name fallacy, caught LATE in an addendum), 053026 (B3 "everyone who sold was a victim first" infers buried-content motive), 053126 (refsheet §4 "who is L?" must stay unanswered). **Severity: HIGH–CRITICAL.**
**Examples:**
- 052326 B4: "She'd already decided to replace him at NeurAI" sourced from `vic002` which "is in the **untouched** list (scanned but never turned in). Content NOT accessible to Nova."
- 052926 B10 (addendum): article "asserted the money didn't flow to Jess because no account was *named* Jess — the exact account-name fallacy the boundary rules forbid... ~73% went to KakiHBD, a pseudonym whose operator Nova cannot see." **Pass 1 missed this**; only caught after director input.
- 040426 B1/B4: article literally says "I cannot tell you whose memories went where" (B4, correct) then in the same section maps Bob/Unicorn accounts to specific arcs (B1/B2) — self-contradiction.
**Trend: improving in self-awareness, NOT in occurrence.** Later drafts (053026, 053126) get praised for "boundary discipline genuinely good," but every session still produces at least one fresh violation, and 052926's worst one slipped past Pass 1 entirely.

### A3. Paper-evidence cited as ambient/omniscient knowledge (missing document attribution) — PERSISTENT, most systematic
Skill rule: claims resting on emails/diaries/letters/character-sheets must **name the document**; the pipeline states them as narrator omniscience.
**Frequency:** 041726 (D5), 052926 (**B1, called "the single most systematic issue"**), 053026 (A5/A6/A7/A8 — four uncited paper facts), 053126 (S1/S2/S3 — Alex BizAI backstory, Ezra burglary, divorce-attorney role). **Severity: MED–HIGH** (facts are TRUE; it's a sourcing/credibility failure, not fabrication).
**Examples:**
- 052926 B1: "Mel Nilsson, Sarah's divorce attorney and one of Marcus's oldest friends... By the evidence, Mel had once been involved with Marcus" — "'By the evidence' is a vague gesture, not a citation." Must cite Patchwork-Law email + Sam↔Mel texts.
- 053126 S1: "He co-founded BizAI with Marcus, did ninety percent of the engineering" stated flatly — should attribute to the recovered cease-and-desist.
- 053026 A5: "fathered a child with Jess Kane" — the mother's NAME is knowable only from the paternity-test paper (exposed tokens say "got someone else pregnant," no name).
**Trend: NOT improving.** Flagged in identical language session after session. The fix is always "light attributive phrasing," never new facts — i.e., a pure prompt-instruction gap.

### A4. Roster-confusion / wrong-character attribution — PERSISTENT
Swapping which named character did/said/attended something.
**Frequency:** 040426 (F1 Sarah/Morgan→Vic/Morgan; F2 Sarah's-house vs warehouse conflation), 041726 (B5 Sarah placed *inside* Stanford-Four meeting she wasn't in; B6 Cass's-memory vs Kai's-memory), 050926 (**S12/C1/SB1 the 12:50 meeting: "Vic, Nat, Sam" should be "Mel, Nat, Sam"** — repeated in body+closing+sidebar). **Severity: HIGH** (rewrites the moral architecture).
**Examples:**
- 050926 S12: article says Vic attended the 12:50 Stanford-Four meeting; source (`mel004`/`sam004`) says **Mel convened it**; "the article rewrites this... gives Vic an additional decade of complicity he didn't have, and lets Mel out of the room entirely" — and the closing's whole indictment is built on that meeting.
- 040426 F1: director note "**Sarah** and Morgan had hushed conversations" became "**Vic** and Morgan" — erasing circumstantial weight against the accused.
- 053026 A4: "Skyler **funded** the prototype" — role inversion; Skyler is the builder/owner, Vic is the funder (×2 sections).
**Trend: flat.** Appears in nearly every session; the specific confusion shifts but the class persists.

### A5. Financial-number errors — RECURRING (two distinct sub-modes)
**(a) Ranking/relative-size errors:** 041726 B1 "Sarah second-largest" (actually 4th, cited twice); 050926 M1/M4 "the widow has the second" (actually 4th overall; anonymous accounts ignored). **(b) Totals that don't foot / stale orchestrator field:** 053026 A1 (13 rows sum $6.27M, label says $6.07M); 040426 (orchestrator `totalBuried` $2.59M stale, true $3.765M); 041726 E3 / 052326 A11 (orchestrator `totalBuried` conflicts with sum-of-accounts). **Severity: MED** (thesis usually survives the fix).
**Root pattern:** the orchestrator's `totalBuried` field is **systematically untrustworthy** (sale-revenue vs post-adjustment balances), and the model picks "named accounts only" when ranking, silently dropping anonymous accounts that hold 30–47% of the money (050926: $1.66M / 47% ignored).
**Trend: flat.** Same `totalBuried` discrepancy flagged across 040426/041726/052326/053026.

### A6. Temporal violations (party-night vs investigation-morning collapse) — RECURRING
Treating recovered-memory (party-night) events as if witnessed during the morning investigation, or stamping morning burials with PM party-clock times.
**Frequency:** 040426 (F3 date display Feb 21 vs Feb 22; F2 spatial-continuity fabrication), 052926 (B5 "hours before Marcus died" — unsupported interval), 053026 (**A2 burials stamped "8:55 PM"/"10:02 PM"** though memories weren't extracted until 1:50 AM; **A3 Vic-on-sidewalk (11:35 PM party memory) filed as a morning-after "consequence"**). **Severity: MED.**
**Example:** 053026 A2: "Nunya moved first, at 8:55 PM... handed $400,000... at 10:02 PM" — "Burial times are session-clock... memories weren't extracted until 1:50 AM, so they can't sell at 8:55 PM the night before."
**Trend: flat.**

### A7. REMOTE-reporter voice violations — SESSION-CONDITIONAL but severe when it fires
Only relevant when `reportingMode: remote`. When it is, the pipeline reliably has Nova narrate first-person physical presence.
**Frequency:** 052326 (B1/B2/B3 — "I was in that room," "Twelve of **us** stood around the evidence table," "I watched her work"). 052926 was remote and handled it CORRECTLY ("I was not in that room"). **Severity: CRITICAL when present** (contradicts the session's core framing).
**Trend:** too few remote sessions to trend; note that 052926 (remote, clean) followed 052326 (remote, 3 violations) — suggests the remote handling is *unstable*, not learned.

### A8. Photo-caption errors (misID, contradiction, dead/temporal-flat captions) — PERSISTENT
**Frequency:** every session. Modes: (a) **caption count mismatch** (050926 H1 "Eight people" on a 5-person photo; 050926 S9 "four people"); (b) **misgendering in caption** (050926 S3 "Two women" includes Vic=he); (c) **deceased shown as present** (041726 B2 "Sarah with Marcus" — Marcus is dead); (d) **group-membership error** (041726 B3 "Stanford Four minus one" on a photo containing a non-member); (e) **caption contradicts body** (052326 CAPT-1 "Neither knew the offer email was drafted" vs body "Alex was already negotiating"); (f) **flat/generic captions** (060626 manual diff rewrote three "Quinn reads a memory"-type captions into temporal-irony captions). **Severity: MED–HIGH** (captions + sidebar are highest-visibility).
**Trend: flat-to-worse.** The 060626 manual diff shows the *generation* default is still a flat literal caption; the irony/identity layering is entirely a human add-on.

### A9. Photo under-use (coverage) — PERSISTENT, every session
Skill rule "all session photos should be used." 052326 (4 of 12), 040426 (3 of 10 → "7 unused"), 041726 (3 of 10), 050926 (6 of 10; whiteboard unused), 052926 (**whiteboard.jpg unused — and it IS the thesis artifact**). **Severity: LOW–MED** (it's a missed-opportunity, but 052926 B4 shows the unused image is sometimes the single best evidence in the session).
**Trend: flat.**

### A10. Outright fabrication (invented facts with no source) — RARE but present
Distinct from A3 (true-but-uncited). Genuinely invented content.
**Frequency:** 053126 (F1: "Riley Torres had been working her way into Morgan's professional network to gather intel" — **no source; her sheet says environmental lawyer / Sarah's protector**). VOICE-class invented specificity: 052326 VOICE-7 "a long half hour" (duration not in source); 040426 (overlaps with A4 F2's fabricated spatial continuity). **Severity: HIGH** (053126 F1 is a clean fabrication) but **low frequency** — most "errors" are misattribution/boundary, not invention.
**Trend:** rare throughout; not increasing.

### A11. Invented / mis-rendered quotes (em-dash & verbatim handling) — RECURRING, low severity
The no-em-dash house rule collides with verbatim card content. 053126 N2: source card "SAM—take this token. Lock the—" rendered "SAM, take this token. Lock the." (cut-off lost). 060626 manual diff: **mass possessive restyle** "Marcus's"→"Marcus'" across body + every sidebar mini (a manual standardization the pipeline doesn't do). **Severity: LOW.** No evidence of fully fabricated quotes — quote *integrity* is consistently rated clean (050926 "Quote integrity ✓"; 052926 verified-correct table). The issue is punctuation/possessive style, not invention.

---

# 3. PERSISTENT categories (= prompt/architecture failures, not one-off slips)

These recur **despite the prompts/CLAUDE.md explicitly warning about them**:

1. **A1 Pronouns** — the prompts carry a roster with explicit pronouns (`rosterPronouns`), yet the model defaults to name-inference. Every session with a they/them or cross-gender player fails.
2. **A3 Paper-evidence attribution** — there is an `evidence-boundaries` prompt and an explicit skill rule; still flagged in identical wording every session ("the single most systematic issue," 052926).
3. **A2 Buried-layer boundary** — the three-layer model is documented in CLAUDE.md AND in an `evidence-boundaries.md` prompt; violations occur every session and one slipped past even Pass 1 (052926 B10).
4. **A4 Roster confusion** — three-category character model exists; mis-attribution still lands in body+closing+sidebar simultaneously (050926).
5. **A5 Financial `totalBuried`/ranking** — the discrepancy is even documented as a gotcha, yet every session re-trips it.
6. **A8/A9 Photo captions & under-use** — "use all photos" is a stated rule; under-use is universal and captions default to flat literal description (060626 diff).

A7 (REMOTE) and A10 (fabrication) are **NOT** persistent in the prompt-failure sense — A7 is session-conditional and unstable; A10 is genuinely rare.

---

# 4. Best root-cause hypothesis per persistent category

- **A1 Pronouns → missing/late context + no validation gate.** The roster with pronouns arrives via the `await-roster` incremental checkpoint (1.51), but article generation appears to rely on name-inference rather than a hard pronoun map injected at generation time. There is **no programmatic post-generation pronoun check** against `rosterPronouns` (contrast the arc-structure validator that exists for roster *coverage*). Cheapest high-value fix: a deterministic lint that flags any sentence mentioning a roster name with a pronoun ≠ their declared one. **This is the single highest-ROI gate to add.**
- **A3 Paper attribution → ambiguous rule + assembly.** The model treats character-sheet/paper facts as background world-knowledge because they ARE in its context as plain facts, with no field marking "this fact requires a document citation." Root cause: evidence is passed as content without a `requiresAttribution`/`sourceDoc` tag the prompt can key on. The rule exists in prose but nothing in the data structure forces it.
- **A2 Buried boundary → buried items shouldn't carry decodable content into context at all.** Violations cluster where the model can *see* token→account linkage or untouched-token content in its context (052326 cites `vic002` from the *untouched* list — meaning untouched/buried content is reaching the generation context when it shouldn't). Root cause: the evidence bundle leaks BURIED/untouched content (or owner↔account adjacency) into the prompt, so the model "knows" things Nova can't. Fix at the **evidence-packaging (Phase 2.4) layer**, not the prompt — strip buried content to amounts/accounts before it ever reaches generation.
- **A4 Roster confusion → ambiguous director-note references + no entity check.** Director notes use first names and the model binds them to the wrong full character (Sarah→Vic). No entity-consistency validation. Likely worsened by similar role-clusters (multiple VCs/lawyers/engineers).
- **A5 Financials → trust the wrong field + named-only ranking.** `totalBuried` is sale-revenue not balance; the spec even says "ignore it," but it's still in context and gets picked. Ranking prompt doesn't force inclusion of anonymous accounts. Fix: compute the authoritative total in code and pass ONLY that; pass all accounts ranked.
- **A8/A9 Photos → captions generated without narrative context + no coverage gate.** Captions default to literal visual description (the Haiku visual-desc) instead of being written against the article's beats; under-use has no "all photos placed" check at the outline checkpoint.

---

# 5. Copy-edit-pass patterns suggesting the article-generation STYLE prompt is failing

These recur across `-findings-copyedit.md` files → the generation prompt's voice guidance isn't landing:

- **Empty aphorisms / paraphrase-as-conclusion.** 052326 VOICE-1 "The case closed itself," VOICE-2 "Premium secrets sell at a premium," VOICE-3 "Every thread collapsed into a single observation." 053126 F3 "killed the night with him." Recurring "X. Several. The room logged them and walked past"-style fragment theater (052326 STRUCT-5).
- **Editorial hedges that undercut a committed reporter voice.** 052326 VOICE-4 "I cannot help but feel," VOICE-6 "by one read." (Note: boundary hedges like "I cannot tell you who ran that account" are CORRECT and must be kept — copy-edit passes repeatedly have to *protect* these from over-zealous cutting; 052926 & 053126 both list them under "do not touch.")
- **Throat-clearing wind-ups.** 052926 CE4 "So let me put on the record what the two of them actually did"; 060626 manual cut "Here is what I cannot give you." and "I would know. It would make mine."
- **Abstract where the article is otherwise concrete / game-economy jargon leaking in.** 052326 VOICE-8 "as the timer ran out" (game-mechanic vocab), 052926 CE3 "scoring no one when it counted" (opaque game-economy phrasing), 053026 C1 "the room's longest memory" (vague epithet).
- **Cross-section redundancy — the structural signature.** Every copy-edit pass finds the same beat narrated 2–3×: 052326 (Taylor-recorder ×3, Morgan-at-Blake ×2, "twelve" ×9, whole **Players section redundant**); 052926 CE2 (C&D twice — *introduced by Pass 1*, note); 053026 CE1–CE5 (deliberation paragraph re-tells the code reveal; Marcus/Blake role-naming twice); 053126 (CLOSING p1 "reads like a recap" — no new beat; WHAT'S MISSING tail repeats). The recurring **"The Players" section being mostly recap** (052326 STRUCT-2, 052926 CE1) and **the CLOSING restating the verdict** (053126 CLOSING-p1) suggest the *outline/section template itself* invites redundancy — a structural prompt issue, not just sentence polish.
- **Captions written flat, then humanized by hand** (060626) — style guidance for captions (carry irony/identity, not literal description) is absent from generation.

**Net:** the style failures are dominated by (1) aphoristic filler + throat-clearing the prompt's anti-patterns file is supposed to suppress, and (2) section-template-driven redundancy (Players=recap, Closing=recap). Both point at the `anti-patterns`/`narrative-structure`/`section-rules` prompts under `.claude/skills/journalist-report/references/prompts/` as the place to harden.

---

## Cited files
- Findings: `reports/outputs/report-{040426,041726,050926,052326,052926,053026,053126}-findings.md`
- Copy-edit: `reports/outputs/report-{052326,052926,053026,053126}-findings-copyedit.md`
- Refsheet (ground-truth example): `reports/outputs/report-053126-refsheet.md`
- Manual-fix ground truth (no findings file exists): git `7182220` diff of `reports/outputs/report-060626.html`
- Process-gap evidence: git `9f2d90c` (060526 published with no refinement)
- Rules of record: `reports/CLAUDE.md` (three-layer model, `totalBuried` gotcha, recency-bias prompt pattern)
