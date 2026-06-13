# ALN Director Console — HITL UX Review

Scope: `reports/console/**`, `reports/server.js` session/SSE flow, and the rival skill path
(`.claude/skills/journalist-report/`, `.claude/agents/journalist-*.md`, `scripts/assemble-article.js`).
Problem under investigation: operators abandon the console and run the pipeline through the Claude Code
skill, bypassing the server's checkpoints/evaluators/validation.

---

## EXECUTIVE SUMMARY

The console is actually **more capable than its reputation** — Article.js and Outline.js have rich inline
per-block editors and surgical edits already apply WITHOUT an LLM round-trip on approve (server.js:224-229 +
graph.js:662-665 route approve-with-edits straight to `validateContentBundle`→`assembleHtml`). So the headline
complaint "feedback always round-trips through a full LLM revision" is only true on the **Reject** path, not the
**Edit & Approve** path. The real adoption killers are elsewhere:

1. **Sessions are volatile.** `sharedCheckpointer = new MemorySaver()` (server.js:37) — a server restart or crash
   wipes EVERY in-flight session with no recovery. For a long, multi-checkpoint pipeline run over a Cloudflare
   tunnel, this is catastrophic and is the single strongest structural reason to flee to the skill (which persists
   intermediate JSON to disk).
2. **Refresh/disconnect during processing loses the result.** SSE is live-only with no event buffering/replay;
   the completion event is delivered via `progressEmitter.emitComplete` to whoever is currently subscribed. If the
   operator refreshes or the tunnel blips mid-LLM-call, the new SSE connection never receives the `complete` it
   missed, and the client is stuck on the spinner (app.js:124-128 only acts on a live `complete`).
3. **Long opaque waits.** Article/arc generation can run minutes under a 10-min timeout; the only feedback is a
   pulsing dot + a rolling text log + an elapsed timer that ONLY ticks during an active LLM call
   (ProgressStream.js:17-31). Between nodes the timer shows nothing and the label says "Processing...".
4. **Two separate input interrupts** (`await-roster` then `await-full-context`) force the operator to stop, type,
   wait, then stop and type again — for data they have in hand at the start.
5. **Edited Article bypasses server schema validation** (asymmetry vs Outline), so the console's quality
   advantage over the skill is partially illusory for hand-edited bundles.

The conversational-skill hypothesis is largely correct for *iteration ergonomics* but wrong about *quality*: the
skill path SKIPS the programmatic schema gate, the structural arc validation, the Opus evaluators, and the revision
caps. Its only quality check is one advisory LLM-judge subagent the operator can override. The right move is BOTH
directions: fix the console's persistence/observability/input-collation, AND port the server's hard gates into the
skill so quality is path-independent.

---

## A) PRIORITIZED HITL FRICTION POINTS

Severity: **[BLOCKS]** blocks adoption · **[MAJOR]** · **[MINOR]**

### Persistence & resilience

- **[BLOCKS] In-memory checkpointer — restart/crash destroys all sessions.**
  `server.js:37` `const sharedCheckpointer = new MemorySaver();`. CLAUDE.md even advertises "Resume behavior: State
  persists via MemorySaver" — but MemorySaver is process-memory only. There is no SqliteSaver. A `node` restart,
  a deploy, an OOM, or `start-everything.bat` re-run loses every session mid-pipeline with no disk fallback. The
  skill path writes `evidence_bundle`/`arc_analysis`/`outline` JSON to disk at each phase, so it survives. This
  alone justifies abandoning the console for any run longer than a few minutes.

- **[BLOCKS] No SSE event buffering / replay → refresh or tunnel blip during processing strands the client.**
  `server.js:735-778` streams live only; `app.js:124-161` only transitions state on a *live* `complete`/`error`.
  If the operator refreshes (or the Cloudflare tunnel drops the long-lived `text/event-stream` — common on mobile/
  cellular), the reconnect (`api.js:connectSSE`) gets a fresh `connected` but the workflow's `emitComplete` already
  fired into the void. The session is actually fine on the server, but the UI shows an eternal spinner. There is no
  "reconnect and re-fetch current checkpoint" path after a processing-time disconnect — `handleResume` in
  SessionStart only exists on the pre-session screen, not mid-run.

- **[MAJOR] Approve POST happens only after SSE connects, with a 10s hard timeout.**
  `api.js:75-99` — `approve()` races SSE `connected` against a 10s timeout and throws "SSE connection timeout after
  10s" if the tunnel is slow to establish the stream. On a phone over a tunnel this is a plausible dead-end; the
  approval never POSTs and the operator sees a connection error with no retry affordance.

### Waiting / observability

- **[MAJOR] Long opaque waits with weak progress.** `ProgressStream.js` shows a pulsing dot, a label, a rolling
  last-10 messages list, and an elapsed timer. The timer only runs while `llmActivity` is set
  (`ProgressStream.js:17-31`); between graph nodes it resets to 0s and the label falls back to "Processing..."
  (line 51-53). There is no overall pipeline ETA, no "step 7 of 10", no indication which node is running relative
  to the checkpoint stepper. For multi-minute Opus calls the operator cannot tell hung-vs-working.

- **[MINOR] LLM activity detail panel dumps raw prompt/response text** (`ProgressStream.js:77-101`,
  `safeStringify`) — useful for a dev, noise for an operator; collapsed by default, so low harm.

### Editing affordances

- **[MAJOR] Article edits skip server-side schema validation (asymmetry with Outline).**
  `server.js:204-214` validates `outlineEdits` with ajv (`outline`/`detective-outline`) and REJECTS invalid edits;
  `server.js:227-229` sets `contentBundle = articleEdits` with **no validation**. A hand-edit that drops a required
  field or malforms a block silently proceeds to `validateContentBundle` (which sanitizes empty paragraphs,
  ai-nodes.js:1280-1290, but is not the same ajv gate). The console's "we enforce structure" advantage is weaker
  than advertised exactly at the final, most-edited step.

- **[MAJOR] Reject is the ONLY path that round-trips through a full LLM revision.** Outline.js:563-570 /
  Article.js:797-803 send `*Feedback` text → `incrementArticleRevision`→`reviseContentBundle`→`evaluateArticle`
  (graph.js:667-670). So "I want to fix one word" via the Reject box costs a full Opus revision + re-eval + a
  revision-cap decrement. The inline editors are the surgical alternative, but they are **undiscoverable**: the
  Article button is labeled "JSON Editor" (Article.js:1320-1324) and the per-block pencil (`editBtn`, utils.js:110)
  is a tiny `✎` glyph with no onboarding. Operators reach for the obvious "Reject + describe the change" textarea
  because it matches their mental model — and get punished with a slow LLM loop. The capability exists; the UX
  funnels people away from it.

- **[MAJOR] Outline rich editors are lossy/locked on the highest-value fields.** ArcOutlineEditor only edits arc
  name + paragraph count and explicitly states "Evidence cards and photo placement are preserved automatically and
  not editable here" (Outline.js:185); ArcInterweaving locks callback opportunities (line 197). To touch those you
  must drop to raw "Edit & Approve" JSON (Outline.js:1056-1060, 1068-1084) — i.e. hand-edit JSON. That is precisely
  the "talk to a person instead" trigger.

- **[MINOR] Outline "Edit & Approve" is a raw 20-row JSON textarea** (Outline.js:1069-1084), not the rich editors —
  confusing because rich inline editors ALSO exist via the pencils. Two parallel edit mechanisms with overlapping
  scope.

- **[MINOR] List widgets key rows by array index** (Outline.js StringListEditor/ObjectListEditor `key: idx`) —
  removing a mid-list row drops input focus (acknowledged in CLAUDE.md). Annoying during rapid edits.

### Multi-step input collection

- **[MAJOR] `await-roster` and `await-full-context` are two separate interrupts** (graph order; AwaitRoster.js then
  AwaitFullContext.js) for data the operator has up front (roster + accusation + session report + director notes).
  The operator submits roster, waits for photo/whiteboard processing, then submits the rest. Collapsing these into a
  single front-loaded form (or collecting full context at SessionStart) would remove an entire stop-and-wait cycle.

- **[MAJOR] Checkpoint ORDER inconsistency between stepper and reality.** `utils.js:119-123` `CHECKPOINT_ORDER`
  lists `input-review, paper-evidence-selection, await-roster, character-ids, await-full-context, pre-curation, ...`
  but the actual graph + CLAUDE.md run `await-full-context` BEFORE `input-review` (input-review is "after
  await-full-context", per CLAUDE.md checkpoint table). `PipelineProgress` computes completed steps by
  `indexOf(currentCheckpoint)` in this list (PipelineProgress.js:21-27), so the stepper highlights the WRONG steps
  as done/pending and rollback targets are mislabeled. Erodes trust in the one orientation aid the UI has.

- **[MAJOR] AwaitFullContext requires all three fields non-empty** (`AwaitFullContext.js:21-23`) with single-line
  `accusation` input and 6-row textareas — no draft persistence. Navigate away / refresh and the typed director
  notes are gone (component-local `useState`, not saved to reducer `pendingEdits` like Outline/Article edits are).

### Errors / dead-ends

- **[MAJOR] Error states are thin and often terminal.** On workflow error, app.js:144-152 appends "You can edit and
  retry, or use rollback." and keeps `checkpointType`. But several real failure modes have no in-place recovery:
  empty-arcs/timeout shows only a "Roll Back to Regenerate" button (ArcSelection.js:118-138) that dispatches
  `{type:'SHOW_ROLLBACK'}` — an action the reducer does NOT handle (state.js has no SHOW_ROLLBACK case; it hits the
  `default` warn at state.js:174). So the primary recovery button on the arc-failure screen **does nothing**.
- **[MAJOR] Post-article-error recovery is a manual rollback dance.** server.js:932-944 detects "ended with error
  after article approval" and returns `recoverable:true, rollbackTo:'article'`, but the client must notice and the
  operator must drive a rollback modal with optional raw-JSON state overrides (RollbackPanel.js) — heavy for a
  non-technical director.

### Mobile / remote (Cloudflare tunnel, phone/tablet)

- **[MAJOR] Long-lived SSE over a tunnel + mobile radios = frequent silent disconnects** with no auto-resume
  (see persistence #2). This is the worst-case environment and the documented production access pattern.
- **[MINOR] Dense desktop-grade layouts** (arc-grid cards, photo cards with thumbnails + textareas, 20-row JSON
  textareas, wide financial tables) are not obviously responsive; CSS is ~1800 lines BEM with glass-panels. Likely
  cramped/awkward on a phone, though not verified by rendering. Raw JSON editing on a phone keyboard is a non-starter.

### Preview

- **[MINOR] Rendered HTML preview exists but only at the Article checkpoint and only if `assembledHtml` is present**
  (Article.js:1296-1311, iframe `sandbox="allow-same-origin"`). There is no rendered preview at Outline, and the
  Article structured preview is good but the operator can't see the *final styled article* until the very last gate.
  `srcDoc` + `allow-same-origin` (no `allow-scripts`) means template JS won't run in preview — possible visual
  mismatch vs the published report.

---

## B) SKILL-vs-CONSOLE CAPABILITY MATRIX

| Dimension | Server pipeline (console) | Skill path (`journalist-report`) |
|---|---|---|
| **Outline schema validation** | HARD: ajv on human edits (server.js:204-214) + `outline.schema.json` | NONE programmatic. `assemble-article.js` reads JSON and assembles with no ajv (scripts/assemble-article.js:38-43). |
| **ContentBundle schema validation** | `validateContentBundle` node is a hard gate to assembly (graph.js:672-676; ai-nodes.js:1280); edits NOT re-ajv'd though | NONE. Bundle goes straight to `assemble-article.js`; only the SDK's own structured-output extraction applies during generation. |
| **Quality evaluation** | Opus/Sonnet evaluators per phase (arc/outline/article) with scores + structural-issue routing (graph.js:655-659, routeArticleEvaluation) | One advisory LLM-judge subagent (`journalist-article-validator`, Sonnet) returning pass/fail + voice_score; **operator can "Proceed anyway"** (SKILL.md:1250-1307). |
| **Structural arc validation** | Programmatic `validateArcStructure` (roster coverage, accusation arc, evidence-id validity) routes failures straight to revision before Opus (CLAUDE.md 8.27) | Not enforced programmatically; relies on agent following prompt + final validator's `roster_coverage` advisory. |
| **Revision caps** | Enforced: REVISION_CAPS arcs=2/outline=3/article=3 + human caps (graph.js:103-189) | None — iterate freely in conversation (a feature for the operator, a quality risk: no forced "this is final"). |
| **Checkpoints** | 10 native `interrupt()` gates, structured forms | Fewer explicit gates: paper-evidence (HARD GATE), character-id, evidence-bundle review, arc selection, outline approval, validation. Conversational, not form-bound. |
| **Editing affordance** | Form/inline editors (rich for Article, partial for Outline) + raw JSON; edits apply surgically without LLM | Natural language: "change X to Y", "tighten the lede", point at a paragraph. Direct file edits by Claude. No schema friction. |
| **Surgical one-word fix** | Possible via inline pencil (undiscoverable); Reject box = full LLM revision | Trivial and natural ("fix that typo") — no revision-cap cost, no re-eval. |
| **Speed / latency feedback** | Background invoke + SSE; opaque multi-min waits, timer gaps | Inline streaming in Claude Code; operator sees tokens, can interject. |
| **Observability** | SSE prompt/response panel (dev-grade); LangSmith optional | Full transcript in the conversation; operator reads reasoning live. |
| **Persistence** | MemorySaver (volatile; restart = total loss) | Disk JSON per phase; resumable by re-pointing the skill at saved files. |
| **Output parity** | TemplateAssembler | SAME TemplateAssembler via assemble-article.js → "structurally identical" output (CLAUDE.md). |

**Verdict on the hypothesis.** Conversational HITL structurally wins on *iteration ergonomics* (surgical edits,
no cap penalty, live observability, no form-shape friction, disk persistence). It structurally LOSES on *enforced
quality*: it has none of the programmatic gates and downgrades the evaluators to a single overridable advisor.
So the current situation is the worst outcome — operators pick the path that is pleasant to use precisely because
it is the path with the weakest guardrails, exactly the quality regression the user reported.

For the console to *match* the skill it would need: persistent sessions, reconnect-safe SSE, collapsed input,
discoverable surgical editing everywhere, and a conversational "tell me what to change" affordance that maps NL to
targeted state patches without a full LLM revision.

---

## C) PRIORITIZED RECOMMENDATIONS

### Quick wins (small, high leverage)

1. **Swap MemorySaver → SqliteSaver** (`@langchain/langgraph-checkpoint-sqlite`). One-line-ish change at
   server.js:37 + a file path. Instantly makes sessions survive restart/crash and makes the advertised "Resume"
   actually durable. Highest ROI fix in the whole review.
2. **Make SSE reconnect-safe.** On SSE (re)connect, have the server immediately push the CURRENT checkpoint/phase
   (or `complete` if already done) by reading `getSessionState` — don't rely on the live `emitComplete` having
   landed. Add a small ring-buffer of recent events per session so a refresh replays what it missed. Add a client
   "still working… reconnecting" state and a manual "Re-check status" button mid-run that calls
   `/checkpoint` + `/state`.
3. **Fix `CHECKPOINT_ORDER`** (utils.js:119-123) to match the real graph order (`await-full-context` before
   `input-review`, etc.) so the stepper + rollback labels are correct.
4. **Fix the dead "Roll Back to Regenerate" button** (ArcSelection.js:135) — it dispatches an unhandled
   `SHOW_ROLLBACK`. Wire it to the real rollback flow (`setRollbackTarget`/RollbackPanel) or add the reducer case.
5. **Add ajv validation to `articleEdits`** in buildResumePayload (server.js:227-229), mirroring the outline path,
   so the console's structural guarantee is symmetric.
6. **Rename + surface inline editing.** Relabel Article "JSON Editor" → keep, but add a visible "Edit content" hint;
   give the per-block pencil a label/tooltip and a first-run callout. Make "Edit & Approve" the primary affordance
   over "Reject", and add helper text on the Reject box: "Use the ✎ pencils for small fixes — Reject triggers a full
   AI rewrite and uses a revision."
7. **Persist AwaitFullContext (and AwaitRoster) drafts to reducer `pendingEdits`** so a refresh/disconnect doesn't
   lose typed director notes (same pattern Outline/Article already use).
8. **Timer/`ETA` polish:** keep the elapsed timer running across node gaps and show "node X / pipeline phase" tied
   to the stepper so multi-minute waits read as progress, not hangs.

### Structural

9. **Collapse `await-roster` + `await-full-context` into one front-loaded input step** (ideally at SessionStart,
   since the director has roster + accusation + report + notes before they touch the console). Removes a full
   stop-and-wait cycle and a separate interrupt.
10. **Conversational checkpoints.** Add a "Describe the change" box at Outline/Article that maps NL → a *targeted
    state patch* applied surgically (a cheap single-purpose "edit-applier" call constrained to emit a JSON-patch
    against the existing bundle, then re-validate), instead of the current full `reviseContentBundle` Opus loop.
    This is the console answer to "talk to Claude and point at things" without surrendering the schema gate.
11. **Earlier rendered preview.** Assemble + show a styled HTML preview at the Outline gate (and live-update the
    Article preview as inline edits are made). Use `sandbox="allow-same-origin"` only if template JS is unneeded;
    otherwise render server-side to match the published report exactly.
12. **Real revision diffs.** `RevisionDiff.shallowDiff` (RevisionDiff.js:18-65) only reports per-key
    "content changed / N→M items" — useless for prose. Add a text-level (word/line) diff for the fields that
    actually change (lede hook, paragraphs, quotes) so the operator can SEE what the revision did.
13. **Embrace-the-skill direction (do this in parallel): port the server's hard gates into the skill/subagents so
    quality is path-independent.** Specifically:
    - Run ajv `outline.schema.json` / `content-bundle.schema.json` as a **blocking** script step in the skill
      before `assemble-article.js` (the schemas already exist; add a `--validate` mode or a tiny validate script).
    - Add a programmatic arc-structure check (roster coverage, accusation arc, evidence-id validity) as a script,
      not a prompt suggestion.
    - Make the `journalist-article-validator` a HARD gate in the skill (no silent "Proceed anyway" without an
      explicit, logged override), matching the server's evaluator routing intent.
    - Have `assemble-article.js` itself refuse to render a bundle that fails schema validation (fail-fast), so
      neither path can ship structurally-broken output.
    This makes the skill safe to use as the primary HITL surface, which — given how much better conversational
    iteration is here — may be the pragmatic long-term answer, with the console repositioned as the
    structured-status / preview / publish dashboard rather than the editing surface.

### Cross-cutting note
The console already solved the hard part (surgical edits that apply without an LLM round-trip on Approve). The
adoption problem is mostly **trust and survivability**: sessions that vanish on restart, spinners that never
resolve after a tunnel blip, a stepper that lies about order, and a recovery button that does nothing. Fix those
four and the "just use the skill" pressure drops sharply even before the bigger conversational-editing work.
