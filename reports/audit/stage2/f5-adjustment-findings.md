# F5 — Financial Adjustment Taxonomy (E1 verification findings)

Resolves the 🔎 in `handoff.md` F5. Built by reading real session scoring data (`data/*/`, `audit/sessions/*.md`). **E2 (the parser change) is DEFERRED pending director confirmation** of the diegetic-vs-GM-correction rule (see "Decision needed" below). No code was changed for F5 in the Stage-2 remediation run.

## What the data shows

**Amounts are already correct.** Final Standings / Final Totals reflect the NET after every adjustment (bonuses, transfers, negotiated premiums, GM corrections). The console's deterministic override (`template-assembler.js:376`) consumes those totals, so account balances are right today. F5 is **NOT** an amount bug.

**What's lost is the narratable EVENTS.** The parser is told to skip all adjustment rows, so these story beats never reach the article except via director notes:
- account-to-account transfers (e.g. 0612: Vic −$1,000,000 → Alex +$500K / Remi +$500K)
- who claimed the first-burial bonus (e.g. 0529: GreatQueen, first burial 09:01 PM)
- negotiated premiums with Blake (e.g. 0425: Sarah +$300,000 "negotiated for double")

**First-burial bonus = fixed $50,000** in every session in the corpus (never variable). It is its OWN timeline row (seeded to a "First Burial Bonus" holding team, then paid out), NOT baked silently into Sale rows. The skill's old `base + $50,000` formula was right on the value but wrong to recompute (D2 already fixed the skill to consume posted totals instead).

## Adjustment-row taxonomy (6 types)

| Type | Label in data | Diegetic? | Example | Session |
|------|---------------|-----------|---------|---------|
| A. First-burial-bonus **seed** | `Seed (GM_Station_1)` → "First Burial Bonus" team | No (system pool) | +$50,000 @ 07:30 PM | 0612, 0531, 0529 |
| B. First-burial-bonus **payout** | `Manual GM adjustment` | **Yes** (event) | +$50,000 → GreatQueen @ 09:02 | 0529 |
| C. Account-to-account **transfer** | `Manual GM adjustment` (paired ±) | **Yes** (event) | −$1M Vic / +$500K Alex, +$500K Remi | 0612 |
| D. **Negotiated premium** with Blake | "Negotiated Bonus"/"for double" | **Yes** (event) | +$300,000 → Sarah @ 09:44 | 0425 |
| E. Small **gift / rounding** | `Gift (GM_Station_1)` or unlabeled | Borderline | +$30,000 → Zoe | 0531 |
| F. **GM entry-error correction** | `Manual GM adjustment` (no diegetic counterpart) | **No** (out-of-world) | −$7,500,000 → Phil (10× mis-key reversal) | 0531 |

## The distinguishability problem (why E2 is director-gated)
There is **no reliable label** separating diegetic transfers (C) from out-of-world corrections (F) — both are `Manual GM adjustment`. The only distinguishers are heuristic:
1. **Magnitude** — a −$7.5M row on an account with $750K sales is obviously a mis-key, not a player move.
2. **Paired rows** — a real transfer has a matching ± counterpart across two accounts; a correction reverses a prior same-magnitude entry or stands alone.
3. **Director `financialTruth` override** — authoritative when present in director notes.

Confidence: HIGH on the taxonomy + bonus value; **MEDIUM on the C-vs-F heuristic** (only one clear Type-F example in the corpus). A wrong call here changes what money the published article narrates.

## Recommended E2 (when director confirms)
Change the Step-2 `sessionReportPrompt` (`input-nodes.js` ~462-470) from "skip all adjustment rows" to:
- **Skip for accounting AND narrative:** Type A (seed rows), Type F (GM corrections — by the heuristic above / director override).
- **Retain as narratable EVENTS (a new field, NOT summed into balances):** Type B (bonus winner), Type C (transfers: who→who, amount), Type D (negotiated premiums). Surface them to the financial summary + director-enricher so the article can narrate them.
- **Final Standings totals remain authoritative** for account balances (no change there).
- If director notes carry a `financialTruth` block, it overrides all heuristics.

## Director input (2026-06-20) — the GM NOTE is the classifier
The earlier "no reliable label" framing was wrong. Per the director: labels like "Gift", "Negotiated for double", "Seed" are GM annotations written DURING the session explaining what each adjustment was FOR. Classification reads the note, not a magnitude heuristic:
- **Diegetic (narrate):** any adjustment whose GM note gives an in-world reason — gift, negotiated premium, account-to-account transfer, first-burial-bonus payout. Type E "Gift" rows ARE diegetic events (not ignored).
- **Out-of-world (set aside):** rows the GM noted as a correction / typo / error fix (e.g. the -$7.5M Phil 10x mis-key), and pure-mechanic "Seed" rows (Type A, seeding the bonus holding pool).
- The director-notes `financialTruth` block, when present, remains the authoritative override.

**Still open (decision #1):** whether the pipeline should AUTO-SURFACE these diegetic events for the article (a `narratableAdjustments`-style field feeding the financial summary / director-enricher), or keep leaving them to director notes as today. The clarification implies the events are meaningful; confirm before E2 is built.

## E2 implementation (when greenlit)
Parse adjustment rows: KEEP the GM note + amount + account(s); classify by the note (diegetic vs correction/seed); surface diegetic events to the financial summary + director-enricher; never count them as buried tokens; Final Standings totals stay authoritative for balances; `financialTruth` overrides.
