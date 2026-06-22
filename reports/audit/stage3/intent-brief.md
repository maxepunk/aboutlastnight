# Stage 3 Code Review — Intent Brief (the judging lens)

Stage 3 is a **code review** of the ALN control/delivery layer. The reviewed code's only job is to **drive a non-deterministic GenAI pipeline reliably.** Judge correctness against **pipeline intent**, not internal consistency alone: a function can be crash-free, typed, and self-consistent and still be a **bug** if it fails to guarantee what the pipeline needs. This brief is the lens. (Stages 1–2 are the source: `audit/success-spec.md`, `audit/stage2/handoff.md`.)

## The two-part test (apply per finding)
1. **Intent** — what is this code trying to make the GenAI pipeline produce or preserve?
2. **Guarantee** — does the code deterministically achieve it? If it offloads a correctness-critical guarantee to the LLM, drops data the generator needs, or degrades silently, that's a finding **even with no error/crash**.

**Prove every finding by execution** — a failing Jest test (repo has the SDK/checkpoint mocks) or a runtime probe against the live server. The code is deterministic; don't reason a verdict you can run. A reproduced finding is real; an un-run one is a hypothesis. (Project lesson, upgraded for code: *execute before asserting.*)

## Load-bearing intents (the rules that flip verdicts)
- **Fail loud — the consumer is a confident generator.** Silent degradation (empty/placeholder evidence, dropped inputs, swallowed LLM/IO/auth errors flowing onward) is the **worst** outcome: it yields a polished, plausible, WRONG article. Catch-and-continue that feeds the generator degraded input is a DEFECT, not graceful degradation. (CLAUDE.md: throw early, fail fast — no silent fallbacks.)
- **The determinism boundary** (Stage 2's master lens). Correctness-critical work belongs in code, guaranteed — not left to model discretion. Code that *should* guarantee something and doesn't (e.g., drops a field the prompt depends on) is a bug.
- **Human-in-the-loop integrity.** 10 checkpoints via `interrupt()`; resume/rollback must land exactly right. A rollback that silently fails to re-pause its checkpoint, or clears state incompletely, robs the director of control over a correctness-critical input and silently reuses stale data.
- **Session durability = product integrity.** A session is hours of director work across checkpoints. Losing it (in-memory checkpointer) or losing the outcome (unbuffered, un-replayable delivery) defeats the purpose.
- **Three-layer evidence boundary.** Buried content must stay sealed. ANY code path that leaks buried content into what reaches the generator is a severe correctness + game-integrity bug.

## Shipped features to trace END-TO-END (an omission in *unchanged* glue is still a finding)
The branch just shipped F1–F18. For each code-relevant feature, trace the full chain across **changed AND unchanged** files — a diff-bounded read misses gaps in untouched glue:
- **F1 pronouns (highest risk).** Roster stays `string[]`; pronouns travel in a parallel `rosterPronouns` map (default `they/them`; the roster is the pronoun authority, the universe is gender-neutral). Chain: `AwaitRoster.js` UI → `/approve` body → **`buildResumePayload`** → `Command({resume})` → `checkpointAwaitRoster` → `state.rosterPronouns` → `parseRawInput` → `sessionConfig.rosterPronouns` → `prompt-builder.generateRosterSection` (4 call sites). **If any link drops it, every character defaults to they/them** — verify each link, especially the unchanged `buildResumePayload`.
- **F3** pull-quote mandate dropped (`minPullQuotes:0`; crystallizations routed to inline `quote` blocks) — confirm nothing still enforces/relies on it.
- **F9** banned-pattern scoping (`token` word-boundary so "memory token" passes; `guests` un-banned) — confirm the regex + all ban sites.
- **F5** financial-adjustment classification (keep diegetic events, drop GM-correction rows; deterministic `shellAccounts` override) — confirm code vs prompt-only.
- **F13/F16** NPC-list centralization / dead `subagents.js` removal — confirm no live caller, no drift.
- (F2/F4/F6/F7/F11/F17 are prompt *text* — out of code-review scope; flagged in Stage 2.)

## Calibration — same code, opposite verdict with vs without this lens
- `buildResumePayload` forwarding `roster` but not `rosterPronouns`: context-free → "fine, forwards roster, no crash"; with F1 intent → "silently defeats a just-shipped feature." **Intent reveals the bug.**
- photo-node catch returning empty analyses and continuing: context-free → "graceful degradation, good"; knowing the downstream generator fabricates over gaps → "worst case, must fail loud." **Intent reverses the verdict.**

## Out of scope
Prompt/voice/content quality (Stage 2); article correctness vs ground truth (refinement workflow); SDK #277 internals (known upstream); detective/skill *content*.
