# ALN Report System — Managed Agent Redesign

**Status:** Design draft for review
**Date:** 2026-05-21
**Supersedes:** Current LangGraph + Express + React console architecture

---

## 1. Context

The current ALN report pipeline is a 43-node LangGraph workflow with 10 HITL checkpoints, served via an Express server + React console + Cloudflare tunnel. It produces investigative articles (~1500-2000 words, journalist theme) from game session data.

The pipeline works. Articles are 60-70% of final quality at first render. But the remaining 30-45% gap is consistently filled by manual director work split across two layers:

1. **Autonomous refinement layer** (`refining-aln-reports` skill, currently run by hand): 5-question fact-check (Source? Timeline? Boundary? Identity? Accuracy? Intent?) + 5-test copy-edit (paragraph justification, pacing audit, throat-clearing purge, hedge audit, abstract→specific conversion). Catches factual errors, boundary violations, copy-edit issues. Mostly mechanical once you know the rules.
2. **Manual craft layer** (only the director can do): voice tweaks, structural cuts, world-building texture additions ("her assistant tells me", NeurAI board references), aphoristic closings, cultural references (Hamilton "where it all happened"), photo caption stripping. Editorial taste decisions.

This redesign targets four goals stated by the director:

- **Decoupled async execution** — once a session is started, work runs on Anthropic infrastructure independent of any director machine. Director picks up from anywhere on any device. (Architecture supports a future enhancement where the game server itself starts the session and then powers down; that integration is out of scope for this redesign — see §11 Phase 4.)
- **Cut infrastructure burden** — Anthropic manages the agent loop, sandbox, caching, compaction, session persistence; we maintain a small trigger service + MCP server + mobile client.
- **Better HITL UX** — mobile-first chat, multi-device, per-milestone surfaces matched to actual data shapes. Catch bad assumptions earlier in the workflow (where errors get seeded, not where they surface).
- **Break the quality ceiling** — autonomous refinement layer becomes an agent phase (not manual work). Manual craft layer gets a UX optimized for it. Dreaming compounds learning across sessions.

## 2. Goals & non-goals

**Goals:**
- Reduce the director's mechanical refinement burden to ~zero
- Enable async multi-device work between session end and final ship
- Capture editorial intent + corrections as structured training signal for Dreaming
- Preserve the structural strengths of the current pipeline (3-layer evidence model, player-focus arc analysis, the refining skill's discipline)

**Non-goals:**
- Replacing or generating the editorial counter-thesis (this stays director-bounded)
- Inventing world-building texture autonomously (Dreaming may eventually learn patterns; not a goal of the initial system)
- Building cross-organization features (single director, single project)
- Replacing the game server itself

## 3. User journey

The new system runs as one long-running Managed Agent session spanning the full report cycle. Director engagement is asynchronous across phone/tablet/laptop.

```
PHASE 0 — Between sessions (background)
  Dreaming pass over recent (raw, refined, final) triples updates
  voice samples library and proposes skill/memory updates;
  director reviews + approves changes before they apply.

PHASE 1 — During game (90-120 min)
  Game backend captures transactions in real-time.
  Director takes notes via current method (not yet integrated).
  Photos accumulating on phone or designated camera.

PHASE 2 — Session end at venue (~5 min)
  Director takes whiteboard photo.
  Players leave.
  Director exports sessionReport markdown from the game server's
  existing report output (current manual step — copy/paste or
  download).
  Director opens the mobile client and taps "Start new report."
  Provides sessionId (or auto-derived from date) + pastes/uploads
  sessionReport markdown.
  Mobile client calls the trigger service which creates the
  Managed Agent session. Director proceeds to Moment A intake.
  Game server is no longer needed for the rest of the workflow.

  (Future enhancement: game server automates this step by POSTing
  sessionReport to the trigger service directly. See §11 Phase 4.
  Out of scope for this redesign.)

═══ MOMENT A — Session Intake (5-10 min, phone, at session end) ═══
  Roster (typed/paste)
  Per-player pronouns ← FIRST-CLASS field, addresses error class #1
  Accusation narrative
  reportingMode (on-site / remote)
  guestReporter (name, title, optional)
  Whiteboard photo upload + agent OCR + director verifies transcription
  Session photos stay on phone — NOT uploaded yet.

═══ ASYNC — Paper evidence selection (3-5 min, anywhere, doesn't gate) ═══
  Mobile checklist over ~50-100 Notion items.

═══ MOMENT B — Notes capture (10-30 min, anywhere) ═══
  Paste/dictate using current method (voice-to-text supported).
  Agent reads and asks targeted follow-ups via chat to fill gaps.
  Editorial thesis explicitly confirmed and locked as the article's
  north star for downstream phases.

═══ AGENT AUTONOMOUS PHASE 1 (no photos involved) ═══
  Notion fetch (tokens + paper evidence via MCP)
  Preprocess evidence (Haiku batch summarization)
  extractCharacterData (Haiku — groups, relationships, roles)
  Curate three-layer evidence bundle (Sonnet batched scoring)
  surfaceContradictions (programmatic tension detection)

═══ MOMENT C — Evidence bundle review (10-15 min, laptop preferred) ═══
  Hierarchical view grouped by narrative thread.
  Confidence-flagged items surfaced at top (agent's uncertain calls).
  Rescue toggles on excluded items.
  Spot-check 5 random items affordance.

═══ AGENT AUTONOMOUS PHASE 2 ═══
  Arc analysis (Opus, player-focus-guided single call)
  Programmatic validation
  Opus evaluation

═══ MOMENT D — Arc selection (5-10 min, phone OK) ═══
  Arc card grid with detail expansion.
  Per-arc analysisNotes verification with click-through to evidence IDs.
  Multi-select with reorder.

═══ AGENT AUTONOMOUS PHASE 3 ═══
  Outline generation (text-only, no photo references at all)
  Outline evaluation

═══ MOMENT F — Outline review (5-15 min) ═══
  Hierarchical outline tree with drag-reorder.
  Per-component annotation field.

═══ AGENT AUTONOMOUS PHASE 4 ═══
  Article generation (Opus, text-only, with placeholders only where prose
    inherently references images — none in standard journalist theme)
  Autonomous refining-aln-reports skill execution
    Phase 1: Build reference sheet from source data
    Phase 2: 5-question fact-check
    Phase 3: 5-test copy-edit
    Phases 4-7: Plan + write revised prose
  High-confidence fixes applied silently.
  Uncertain items flagged for director decision.

═══ MOMENT G — Article + photo integration (30 min - 2 hours) ═══
  Director sees:
    1. Revised text-only article
    2. "What I changed" panel (collapsible audit trail, categorized)
    3. "Uncertain — need your call" panel
    4. Free-form chat input (universal steering)
    5. Tap-to-annotate paragraphs
  Director curates session photos LOCALLY on phone (swipe include/exclude
    on 30-40 raw photos → ~14 keepers).
  Curated batch uploads to cloud.
  Agent Haiku-analyzes the curated set WITH article context.
  Director provides character IDs per kept photo, marks hero.
  Agent reads the finished article + analyzed photos and proposes
    placement spots within the article (photo editor pattern).
  Director reviews proposed placements, can swap/reject/edit per slot.
  Agent generates captions using article + photo + character IDs.

═══ SHIP (~5 min) ═══
  Final approval.
  Agent renders HTML via assembleHtml MCP tool with dual-location sync
    (financial tracker sidebar+inline, evidence card headlines
    inline+sidebar minis).
  Commits to outputs/report-{sessionId}.html + assets/images/{sessionId}/
  Triggers emailer.
  Captures Dreaming corpus: raw bundle + refined bundle + final bundle
    + chat timeline + editorial intent log.

PHASE 7 — Background learning (between sessions)
  Dreaming pass identifies patterns from new corpus.
  Phone notification for triage; laptop review for substantive changes.
  Approved updates land in skills/memory; next session benefits.
```

### What this changes vs current

- **Photo work moves entirely to Moment G.** No photo upload or Haiku analysis until after curation. Outline + article are pure text. The agent identifies placement spots in the finished article rather than planning slots in advance.
- **Pronouns are first-class at intake.** Not buried in session-config.json — surfaced as a structured field per player, addressing error class #1 directly.
- **The 4 input checkpoints collapse to 1 intake moment + 1 notes-capture moment + 1 async paper-evidence task.**
- **The refining-aln-reports skill runs autonomously** as part of agent's Phase 4 instead of being a separate human-led workflow.
- **All review moments are async and multi-device.** Director engages when convenient, on whichever device fits.

## 4. Architecture

### Components

```
┌─────────────────────────┐
│   MOBILE CLIENT         │  Director taps "Start new report" — provides
│   "Start new report"    │  sessionId + sessionReport markdown (pasted/
│   button                │  uploaded from game server's existing output)
└────────────┬────────────┘
             │ POST sessionReport + sessionId + (optional) photo manifest
             │ (Future: game server can call this same endpoint directly —
             │  see §11 Phase 4)
             ▼
┌─────────────────────────┐
│   TRIGGER SERVICE       │  New, ~100 LOC, Cloudflare Worker (durable)
│   - Creates MA session  │  Endpoint: /trigger
│   - Returns session URL │  Output: { sessionUrl, mobileLink }
└────────────┬────────────┘
             │ POST /v1/agents/.../sessions (create with skill + initial event)
             ▼
┌─────────────────────────────────────────────────────────────┐
│           MANAGED AGENT SESSION (Anthropic infra)            │
│                                                              │
│  System prompt: identity + meta-rules (~20 lines)            │
│  Skills loaded:                                              │
│    - journalist-report (workflow journey, voice, boundaries) │
│    - refining-aln-reports (autonomous refinement)            │
│  Subagents available:                                        │
│    - image-analyzer (Haiku, with article context)            │
│    - evidence-curator (Sonnet, 3-layer bundle)               │
│    - arc-analyzer (Opus, player-focus-guided)                │
│    - outline-generator (Opus, text-only)                     │
│    - article-generator (Opus)                                │
│    - refiner (runs refining-aln-reports in isolation)        │
│    - photo-integrator (NEW: late-stage placement)            │
│  MCP server: aln-tools (custom, see §5)                      │
│  Memory: per-director persistent (Dreaming-updated)          │
│  Sandbox filesystem: data/{sessionId}/* scratchpad           │
│  Tools: Read/Write/Edit/Bash/Glob/Grep + AskUserQuestion     │
└────────────┬────────────────────────────┬───────────────────┘
             │ SSE event stream            │ Custom tool calls
             ▼                             ▼
┌─────────────────────────┐    ┌─────────────────────────────┐
│   MOBILE CLIENT         │    │   ALN MCP SERVER             │
│   (PWA, React)          │    │   - notion_fetch_*           │
│   - Chat timeline       │    │   - render_article           │
│   - Focused review      │    │   - commit_to_output         │
│   - History/Dreaming    │    │   - send_emailer             │
└─────────────────────────┘    │   - dreaming_corpus_capture  │
                               └─────────────────────────────┘

┌─────────────────────────┐
│   FALLBACK CONSOLE      │  Existing console + LangGraph pipeline run
│   (parallel during      │  in parallel during build-out. Deprecated
│   migration)            │  after 3-5 successful sessions on new system.
└─────────────────────────┘
```

### Why Managed Agents (vs Agent SDK self-hosted)

| Aspect | Self-hosted (current LangGraph) | Managed Agents |
|---|---|---|
| Runs in | Our server | Anthropic infra |
| Session state | Our DB (SqliteSaver) | Anthropic event log |
| Long-running | Bounded by our server uptime | Stateful by design |
| Game server offline | Workflow stalls | Continues independently |
| Caching / compaction | Per-call timeouts and SDK#277 workarounds | Built-in |
| Cost | Our server + tunnel + Anthropic API | Anthropic API only (no server costs) |
| HITL pattern | Native `interrupt()` + checkpoint UIs | `AskUserQuestion` tool + event-based steering |

**Key trade-off**: Beta API (April 2026), no ZDR/HIPAA (irrelevant for this use case), Dreaming is research preview (requires access request).

## 5. ALN MCP server

Custom MCP server exposes ALN-specific operations the agent needs that aren't covered by built-in tools.

| Tool | Purpose | Inputs | Outputs |
|---|---|---|---|
| `notion_fetch_tokens` | Get all memory tokens for the game | (no args) | Array of token objects |
| `notion_fetch_paper_evidence` | Get all paper evidence with files | (no args) | Array of paper-evidence objects |
| `notion_download_files` | Download paper evidence images | `pageIds[]` | Local file paths |
| `score_evidence_batch` | Sonnet batched paper-evidence scoring | `items[], batchSize, concurrency` | Scored items |
| `render_article` | ContentBundle → HTML via shared TemplateAssembler with dual-location sync | `bundle, outputPath` | HTML file written |
| `commit_to_output` | Move final HTML + photos to outputs/, git commit | `sessionId, htmlPath, photosDir` | Commit SHA |
| `send_emailer` | Trigger post-show emails | `sessionId` | Email send report |
| `dreaming_corpus_capture` | Save (raw, refined, final, timeline, intent) tuple | `sessionId, artifacts` | Captured |
| `surface_contradictions` | Programmatic tension detection (preserve current capability; implementation can evolve) | `rawProse, shellAccounts, roster` | Tensions array |
| `validate_arc_structure` | Programmatic structural check before expensive evaluation | `arcs, roster` | Validation result |
| `validate_content_bundle` | Schema validation | `bundle` | Validation result |

The MCP server is a small Node service (~500-1000 LOC) bundling current pipeline utilities. Replaces the LangGraph nodes that do deterministic / programmatic work.

**Built-in tools the agent uses** (no custom implementation needed): Read, Write, Edit, Bash, Glob, Grep (for sandbox file work); WebFetch (for any URL-based image downloads if needed); AskUserQuestion (for structured HITL).

## 6. Mobile client

### Three surfaces, one PWA

**Start-new-report flow** (entry point, before any of the three surfaces). On opening the app, director sees a session list (Surface 3) with a prominent "Start new report" button. Tap it → form: sessionId (auto-derived from today's date, editable) + sessionReport markdown (paste or upload from `.md` file the director exported from game server). Submit → mobile client POSTs to trigger service → Managed Agent session created → director enters Moment A.

This is the manual-trigger flow that Phase 1 builds. A future enhancement (§11 Phase 4) will let the game server bypass this by calling the trigger service directly.

**Surface 1 — Chat timeline (default view)**
The session's working narrative. Agent reports inferences as it works ("I'm tagging ChaseT as Taylor Chase pseudonym"; "Pronouns extracted: Sarah=she/her, Alex=they/them..."); director sends free-form steering anytime; structured milestone cards appear inline ("Evidence bundle ready for review — open").

Inference messages have a `[verify]` affordance — tap to confirm or correct. Free-form chat input bottom-anchored, always available.

**Surface 2 — Focused review (specialized per milestone)**
A single surface that re-specializes based on which milestone is active. Only one is active at a time.

**Surface 3 — History / Dreaming**
Past sessions browsable as a list. Tap any → see its chat timeline, final article, and Dreaming corpus. Dreaming proposals appear here with accept/edit/reject affordances; quick-accepts on phone, substantive changes deferred to laptop.

### Per-milestone surfaces

| Moment | Data shape | Surface design |
|---|---|---|
| **A — Intake** | Form: roster + pronouns + accusation + reportingMode + guestReporter + whiteboard photo | Multi-step form. Pronouns as chip selector per player. Whiteboard upload + OCR + verify transcription side-by-side. |
| **Async — Paper evidence** | Checklist of ~50-100 Notion items | Searchable filterable checklist, grouped by basicType (Document/Prop/Set Dressing/Character Sheet). |
| **B — Notes capture** | Free-form prose (3-4K words) | Big text area + voice-to-text. Agent reads continuously, asks follow-ups in chat. Editorial thesis explicit confirmation widget at the end. |
| **C — Evidence bundle review** | 43KB hierarchical: 8 narrative threads × tokens + paper + buried accounts | Tree view collapsed by thread. Confidence-flagged items surfaced top. Rescue toggles. Spot-check 5 random. Search across all. Laptop preferred for depth. |
| **D — Arc selection** | 5-7 arcs × deep metadata | Card grid, tap for detail. Per-arc analysisNotes click-through to evidence IDs. Multi-select with reorder. |
| **F — Outline review** | Tree of ~25-35 components, text-only | Hierarchical view, drag-reorder, per-component annotate. |
| **G — Article + photo integration** | Article + audit trail + uncertain items + raw photos | Article preview (tap-to-annotate, long-tap to inline edit) + collapsed audit trail + uncertain items panel + photo curation surface (swipe local photos) + character ID surface (per kept photo) + placement review (per agent-proposed spot, accept/swap/reject) + free-form chat. Multi-page within one focused-review surface. |

### Notification model

Push notifications fire only for:
- Active `AskUserQuestion` events at milestones
- Refining skill completion (Moment G ready)
- Dreaming proposals (when scheduled run completes)

Agent's chat-timeline inferences do NOT fire notifications. Director scrolls back to catch up on demand.

### Multi-device

PWA running off a single URL works on phone, tablet, laptop. Director picks the device per moment:
- Moment A (intake), D (arc selection), G (light review) → phone
- Moment C (evidence bundle), F (outline), G (deep editing) → laptop preferred
- Moment B (notes capture) → phone if dictating, laptop if typing
- History / Dreaming → both, per item complexity

## 7. Trigger contract

### Phase 1 — Mobile client → trigger service

```http
POST https://trigger.aboutlastnightgame.com/start
Content-Type: application/json
Authorization: Bearer <director-auth-token>

{
  "sessionId": "0521",
  "sessionReport": "<full markdown — pasted/uploaded by director from
                    game server's existing report output>",
  "directorContact": {
    "pushToken": "<from mobile client>",
    "email": "director@..."
  }
}
```

Response:

```json
{
  "sessionUrl": "https://aln-reports.app/session/0521",
  "mobileLink": "https://aln-reports.app/m/0521?token=...",
  "managedAgentSessionId": "ma-abc123..."
}
```

Director auth: short-lived token issued by mobile client login flow.

### Trigger service responsibilities

- Authenticate director (token validation)
- Validate request (sessionId uniqueness + sessionReport non-empty)
- Create Managed Agent session via Anthropic API:
  - Agent ID (pre-configured "Nova" agent with system prompt + skill references)
  - Environment (Anthropic-managed sandbox)
  - Initial event containing sessionReport + sessionId + directorContact
- Return session URLs
- Send push notification "report started — open to intake"

Trigger service runs as Cloudflare Worker (durable, ~100 LOC). Stateless beyond creating the MA session. Holds the Anthropic API key (kept out of mobile client for security).

### Mobile client → MA session

Mobile client subscribes to the session's SSE event stream. Sends user events back via the Managed Agents `events` POST endpoint. All session state lives in Anthropic's event log.

### Phase 4 (future) — Game server → trigger service

The same `/start` endpoint will accept calls from the game server later. Auth pattern changes (shared secret instead of director token); request body otherwise identical. The architecture is designed to support this from day one — the implementation just doesn't build the game-server side in Phase 1.

## 8. Skills + subagents

### System prompt

```
You are Nova, an investigative journalist writing post-game reports for the
About Last Night immersive crime thriller experience.

You follow the journalist-report workflow as your playbook. After generating
a draft article, you run refining-aln-reports autonomously as your final
quality pass. Use AskUserQuestion to ask the director at structured milestones.
Treat any free-form chat messages from the director as priority steering
input — they override your current direction.

Your sandbox filesystem at data/{sessionId}/ is your scratchpad. Write
intermediate artifacts there: inputs/, fetched/, analysis/, summaries/, output/.

You have access to subagents (Agent tool) for context-isolated heavy tasks
and an aln-tools MCP server for ALN-specific operations.
```

### journalist-report skill (restructured around new journey)

Current structure (5 phases mirroring LangGraph) → new structure (Moments A-G):

```
# Journalist Report Workflow

## Overview
[Brief — director, NovaNews voice, 3-layer evidence model, theme]

## Moment A — Session Intake
[How to receive intake inputs, validate, write session-config + write whiteboard analysis]

## Moment B — Notes Capture
[How to interview director, extract structure from prose, fill enriched director-notes,
 confirm editorial thesis, build hypothesis allowances]

## Autonomous Phase 1 — Data Acquisition + Curation
[Notion fetch via MCP, preprocess, extractCharacterData, curate 3-layer bundle, surface contradictions]

## Moment C — Evidence Bundle Review
[How to present for review, handle rescue, accept director corrections]

## Autonomous Phase 2 — Arc Analysis
[Player-focus-guided arc generation, programmatic validation, evaluation]

## Moment D — Arc Selection
[Present arc cards, handle selection + reorder + edit requests]

## Autonomous Phase 3 — Outline (text-only)
[Generate outline with NO photo references; sections, paragraphs, evidence cards only]

## Moment F — Outline Review
[Present outline tree, handle drag-reorder + annotations]

## Autonomous Phase 4 — Article + Refinement
[Generate text-only article, then run refining-aln-reports skill via refiner subagent]

## Moment G — Article + Photo Integration
[Present article + audit trail + uncertain items; collect photo curation; analyze curated
 photos with article context; identify placement spots; review with director]

## Ship
[Render via MCP, commit, trigger emailer, capture Dreaming corpus]

## References
[Links to writing-principles, evidence-boundaries, anti-patterns, voice-samples, schemas]
```

### refining-aln-reports skill (preserved with adjustments for autonomous execution)

Current 8-phase structure mostly preserved. Adjustments:

- **Phase 0** (fetch editorial intent): pulls from agent's own session state (selectedArcs, _arcFeedback, _outlineFeedback, _articleFeedback, _rescuedItems, plus rosterPronouns, editorialThesis from intake)
- **Phase 8** (apply edits to HTML): N/A — the agent works on ContentBundle JSON, not HTML. HTML assembly happens via render_article MCP tool after refinement. Dual-location concerns are encoded in the assembler, not the refining skill.

### Subagents

Defined as Anthropic AgentDefinition objects (or filesystem skills in `.claude/agents/`):

| Subagent | Model | Tools | Purpose |
|---|---|---|---|
| `image-analyzer` | Haiku | Read, AskUserQuestion | Per-photo analysis WITH article context (Moment G) |
| `evidence-curator` | Sonnet | Read, Write, Bash | Three-layer bundle assembly |
| `arc-analyzer` | Opus | Read, Write | Player-focus-guided single-call analysis |
| `outline-generator` | Opus | Read, Write | Text-only outline |
| `article-generator` | Opus | Read, Write | Article generation with embedded schema (SDK#277 workaround) |
| `refiner` | Opus | Read, Write, Edit, Glob, Grep | Runs refining-aln-reports skill in isolation |
| `photo-integrator` | Sonnet | Read, Write | Reads finished article + photo analyses, proposes placement spots in article (NEW) |

Subagents inherit the parent's MCP server access. Context isolation prevents prompt bloat in the main agent.

## 9. Pipeline architecture (in Managed Agents form)

### Agent's working loop (no fixed state graph)

The agent follows the journalist-report skill as a playbook. At each Moment, the agent:

1. Performs the work described in that section of the skill
2. Writes intermediate artifacts to its sandbox (data/{sessionId}/...)
3. Either calls AskUserQuestion (typed widget) OR signals chat-timeline event (informational)
4. Listens for director's response or free-form steering
5. Proceeds to next phase

This is NOT a state graph. Moments A-G are mandatory HITL stops — the agent always pauses at each for director engagement. Between Moments, autonomous phases are flexible: the agent decides how to handle each phase based on the skill instructions, the current state of its sandbox, and the director's input. If a session has unusual structure (e.g., a moment in the director's notes that warrants extra investigation), the agent can deviate from the playbook within autonomous phases — the skill describes the default flow, not a rigid sequence. Mandatory Moments are non-negotiable.

### State as sandbox files (not in-memory graph state)

```
data/{sessionId}/
├── inputs/
│   ├── session-config.json      # Moment A output
│   ├── director-notes.json      # Moment B output (enriched)
│   ├── orchestrator-parsed.json # Parsed sessionReport
│   ├── selected-paper-evidence.json
│   ├── character-ids.json       # Moment G output (late)
│   └── whiteboard-analysis.json
├── fetched/
│   ├── tokens.json
│   └── paper-evidence.json
├── analysis/
│   ├── evidence-bundle.json
│   ├── arc-analysis.json
│   └── article-outline.json     # Text-only, no photo refs
├── summaries/                    # Checkpoint-friendly summaries
├── photos/                       # Curated photos (after Moment G upload)
├── output/
│   ├── content-bundle.json
│   ├── article.html              # Final
│   └── article-metadata.json
└── dreaming/                     # Corpus capture
    ├── 01-raw-bundle.json
    ├── 02-refined-bundle.json
    ├── 03-final-bundle.json
    ├── timeline.jsonl
    ├── intent-log.json
    └── diff-annotations.json
```

This filesystem layout is similar to the current one and survives the architecture change. The agent reads/writes via standard Read/Write/Edit/Glob tools.

### Editorial intent log (decision history)

New artifact captured per session, used by Dreaming and by the refining skill's Phase 0:

```json
{
  "sessionId": "0521",
  "editorialThesis": "<from Moment B>",
  "selectedArcs": ["arc-1", "arc-2", ...],
  "rescuedEvidence": [{tokenId: "...", reason: "..."}, ...],
  "feedbackByPhase": {
    "evidenceBundle": "<director's chat message at moment C>",
    "arcs": "<at moment D>",
    "outline": "<at moment F>",
    "article": "<at moment G — all chat messages during refinement>"
  },
  "manualEditsAfterShip": [
    /* populated post-ship if director still made edits */
  ]
}
```

### Refinement as autonomous phase

When article-generator finishes, the agent dispatches the `refiner` subagent. Refiner:

1. Reads session source data (inputs/, fetched/) — Phase 1 reference sheet
2. Reads the article draft (output/content-bundle.json)
3. Reads editorial intent log
4. Runs 5-question fact-check + 5-test copy-edit
5. Categorizes findings: high-confidence-apply / uncertain-flag
6. Applies high-confidence fixes directly to content-bundle.json
7. Writes audit trail (data/{sessionId}/refinement/audit.json — what was changed and why)
8. Writes uncertain items list (data/{sessionId}/refinement/uncertain.json — what needs director call)
9. Returns to main agent

Main agent then presents to director at Moment G: revised bundle + audit + uncertain + free-form chat + tap-to-annotate.

### Photo integration phase (NEW)

After Moment G director uploads curated photos:

1. Main agent calls `image-analyzer` subagent in parallel per kept photo, with the article + arcs + character IDs as context
2. Agent collects analyses → writes to data/{sessionId}/photos/analyses.json
3. Main agent dispatches `photo-integrator` subagent
4. Photo-integrator reads finished article + photo analyses + character IDs
5. Produces proposed placements: `[{ photoFilename, sectionId, afterParagraphId, caption, rationale }]`
6. Returns to main agent → main agent presents to director
7. Director accepts/swaps/edits/rejects per placement
8. Agent writes final placements to content-bundle.json
9. Agent renders HTML via `render_article` MCP tool with dual-location sync
10. Director gives final approval

## 10. Dreaming corpus design

### Corpus structure per session

```
data/{sessionId}/dreaming/
├── 01-raw-bundle.json          # Pipeline raw ContentBundle (pre-refinement)
├── 02-refined-bundle.json      # After refining-aln-reports
├── 03-final-bundle.json        # After director's manual craft edits
├── timeline.jsonl              # Full chat timeline + AskUserQuestion exchanges
├── intent-log.json             # Editorial intent decision history
├── diff-annotations.json       # Pre-computed: (raw→refined, refined→final) tagged by edit type
├── source-materials.json       # Symlinks/refs to inputs/ + fetched/
└── session-metadata.json       # Roster size, evidence counts, theme, duration, etc.
```

Dreaming dreams over this per-session unit. Across N sessions, identifies recurring patterns.

### What Dreaming can realistically learn

**High-confidence patterns** (3+ session recurrence):
- Caption-stripping rules (e.g., "always remove interpretive flourish from photo captions" — 5/5 sessions)
- Journalistic flourish patterns ("unable to get a comment from X" for absent characters)
- Cut patterns (throat-clearing transitions, abstract paragraph openers)
- Hedge replacement patterns ("observing alignment" → pointed-question framing)
- Roster name canonicalization

**Medium-confidence** (2-3 session recurrence):
- World-texture invention patterns (when to add "the assistant tells me"-style detail)
- Section-level structural moves

**Hard / probably-not-learnable**:
- Editorial counter-thesis (the deck and closing arc — taste-bounded)
- Cultural references (Hamilton "where it all happened")
- Specific voice rhythm of distinctive anaphora

### Memory + skill update flow

Two output surfaces:

1. **Skill file updates** (high-confidence, codifiable): Dreaming generates proposed edits to `refining-aln-reports/SKILL.md` or `journalist-report/references/prompts/anti-patterns.md` or new entries in `voice-samples/`. Director reviews PR-style diffs on laptop. Approved → committed.
2. **Anthropic-managed memory** (soft preferences): sticky context the agent remembers. Director-edited voice patterns, recent corrections, evolving style. Lighter review on phone.

### Voice samples library

Single highest-value Dreaming output. Growing library of director-approved passages tagged by section/type:

```
.claude/skills/journalist-report/references/voice-samples/
├── closing-aphorism/
│   ├── 051726-hamilton-reference.md
│   └── annotations.md
├── photo-caption-id-only/
├── lede-opening/
├── journalistic-flourish/
└── ...
```

Loaded into article-generator subagent's context at runtime. The agent has examples of director-approved prose to study before writing — much higher signal than abstract rules.

### Overfitting mitigations

- Recency-weighted dreaming (recent 5-10 sessions weighted higher)
- Minimum recurrence threshold (3+ sessions before codification)
- Periodic memory pruning (identify stale patterns)
- Per-session opt-out flag (director can mark "stylistic outlier — don't dream over this")

## 11. Migration strategy

### Phase 1 — Build (4-6 weeks estimated)
1. ALN MCP server (~500-1000 LOC Node)
2. Trigger service (Cloudflare Worker) — accepts calls from mobile client; auth designed to accept game server later
3. Skill restructure (`journalist-report` reorganized around Moments A-G; refining-aln-reports adjustments)
4. Mobile client (PWA, React, three surfaces) — includes "Start new report" flow where director provides sessionReport markdown manually

### Phase 2 — Parallel run (1-2 months)
- Current LangGraph + console keep running
- New system runs in parallel for real sessions starting from session N
- Director can choose which to use per session

### Phase 3 — Cutover
- After 3-5 successful new-system sessions, deprecate LangGraph
- Shut down Express server + Cloudflare tunnel
- Archive console code
- New system becomes sole pipeline

### Phase 4 (future, separate work) — Game server integration

Out of scope for this redesign. Documented here so the Phase 1 architecture can accommodate it without rework:

- Game server gains a "Start Report" button in its admin UI
- Button POSTs to the same `/start` trigger endpoint (auth pattern: shared secret instead of director token)
- Game server can include photo manifest (cloud URLs) if photos are already in cloud storage
- This eliminates the director's manual sessionReport paste/upload step
- Likely paired with an in-game running-notes capture surface so director's notes auto-flow into Moment B

The Phase 1 trigger service is intentionally designed to accept this future caller — Phase 4 is additive, not restructuring.

### What survives vs gets rewritten

| Component | Status |
|---|---|
| `journalist-report` skill (SKILL.md + references/) | Restructured around new journey, content largely preserved |
| `refining-aln-reports` skill | Preserved, Phase 8 adjusted for ContentBundle vs HTML |
| Reference files (writing-principles, anti-patterns, evidence-boundaries, etc.) | Preserved verbatim |
| `templates/journalist/*.hbs` Handlebars templates | Preserved verbatim |
| `lib/template-assembler.js` + helpers | Preserved (moved into MCP server) |
| Notion fetch scripts (`scripts/fetch-notion-tokens.js`, etc.) | Repurposed as MCP tools |
| `lib/director-enricher.js` | Repurposed as subagent in MCP or as skill instructions |
| Image preprocessor + prompt builder | Repurposed for image-analyzer subagent |
| Pipeline node code (`lib/workflow/nodes/*.js`) | Replaced — agent + skills + subagents drive flow |
| `lib/workflow/graph.js` LangGraph definition | Deleted |
| Express server (`server.js`) | Deleted post-migration |
| React console (`console/*.js`) | Deleted post-migration; mobile client is fresh build |
| `start-everything.bat`, Cloudflare tunnel config | Deleted post-migration |

## 12. Open risks

- **Managed Agents is beta** (April 2026 launch). API changes likely. Mitigation: trigger service abstracts the Anthropic API call; mobile client subscribes to SSE; both can adapt to API churn.
- **Dreaming is research preview.** Requires access request. Plan B: build the corpus capture anyway; manually run analysis passes during the gap.
- **Cost is less predictable** than current per-call architecture. Single long-running session with multiple subagents = many SDK calls. Mitigation: caching is Anthropic-managed in Managed Agents, should be cheaper per session in steady state; instrument and measure.
- **Photo-integrator is new functionality** with no track record. The agent identifying placement spots from a finished article might produce weak suggestions in early sessions. Mitigation: director's swap/reject affordances at Moment G + Dreaming learns placement patterns over time.
- **The chat timeline as primary surface assumes the agent reports inferences usefully.** If the agent over-reports (noise) or under-reports (errors slip through), the model degrades. Mitigation: confidence thresholding in agent's prompt + per-session metrics on intervention frequency.

## 13. Success criteria

After 5 sessions on the new system:

- **Director session-end work ≤15 minutes** (Moment A intake + photo curation start = phone work at venue)
- **Total async time to ship ≤4 hours of director engagement** (down from current ~6-8 hours of mostly-manual refinement work)
- **Manual craft edits at Moment G drop measurably** as Dreaming learns patterns (target: 15-20% by session 5, vs current 30-45%)
- **Zero "I was nowhere near my laptop and the pipeline stalled" moments** (decoupled async works)
- **Voice samples library has 20+ entries across 5+ categories** (Dreaming corpus is real)

## 14. What's deliberately out of scope

- **Game server integration / automated trigger.** Phase 1 trigger is mobile-client-initiated with director manually providing sessionReport markdown. Game server auto-trigger is a Phase 4 future enhancement (see §11) the architecture accommodates but doesn't build.
- **In-game running-notes capture.** Revisit when game server integration is built; likely paired with that work.
- Replacing the editorial counter-thesis (stays director-bounded)
- Multi-director / multi-org features
- Detective theme adaptations (same architecture works; just additional skill files)
- Auto-publishing to external channels beyond emailer

---

*End of design doc.*
