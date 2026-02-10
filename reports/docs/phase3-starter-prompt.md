## Task: Phase 3 Planning — New Frontend (Checkpoint UI)

### Context

We're executing a multi-phase cleanup and feature roadmap for the ALN Director Console. Phases 1-2 are complete on branch `cleanup/foundation-dead-code-removal` (9 commits). Phase 2 left us with a clean session REST API surface ready to drive a browser UI.

**Master roadmap:** `C:\Users\spide\.claude\plans\structured-purring-cook.md`
Read this first — it has Phase 3's high-level outline, the checkpoint data flow table, and key feature list. Phase 2 is marked complete with findings that affect Phase 3 planning.

### Required Skills

Before doing ANY work, invoke these skills:

1. `/superpowers.using-superpowers` — establish skill awareness
2. `/episodic-memory.search-conversations` — search for prior decisions about frontend architecture, checkpoint UI, SSE streaming, or Phase 3 planning
3. `/superpowers.writing-plans` — this is a planning task, not implementation
4. `/frontend-design.frontend-design` — use this for all UI/component design work; we want distinctive, production-grade design, not generic AI aesthetics

### What to Investigate

Do a deep dive into the requirements before writing any plan. Specifically:

1. **The E2E walkthrough IS the UI spec.** Read `scripts/e2e-walkthrough.js` thoroughly — every checkpoint handler shows exactly what data is displayed and what input is collected. Map each of the 10 checkpoints to a UI component concept.

2. **Server API surface.** Read the session REST endpoints in `server.js` (they were just refactored in Phase 2). Understand the request/response shapes for: `/start`, `/resume`, `/approve`, `/rollback`, `/state`, `/checkpoint`, `/progress` (SSE), and the 4 resource GET endpoints (table-driven factory).

3. **SSE progress streaming.** Read `lib/observability/progress-emitter.js` and the `/api/session/:id/progress` SSE endpoint in `server.js`. Understand what events the frontend will receive (`llm_start`, `llm_complete`, `progress`, `complete`, `error`).

4. **Existing frontend.** Read `detlogv3.html` — it's broken but shows the old detective UI approach. Understand what it tried to do so we don't repeat mistakes. Note: it's a single-file React app with no build process.

5. **Project constraints from CLAUDE.md.** The parent project (`../CLAUDE.md`) enforces zero-dependency architecture, no build tools, no frameworks. Decide whether the console frontend follows the same constraint or gets its own rules (it's a developer tool, not the public landing page).

6. **Authentication.** Read `AUTH_SETUP.md` and the auth middleware in `server.js`. The frontend needs to handle login state.

7. **Data directory structure.** Read the session data section in `reports/CLAUDE.md` — understand what files exist per session for potential "session browser" UI.

### Planning Deliverable

Write a detailed implementation plan following the same format as the Phase 2 plan. Include:

- **Architecture decision:** SPA vs multi-page, framework vs vanilla, build process decision with rationale
- **Component breakdown:** One section per checkpoint type with the data it displays and inputs it collects
- **Batched execution order** with clear dependencies (same pattern as Phase 2: Batch A→B→C with commits)
- **SSE integration design:** How progress streaming maps to UI state
- **Rollback UX:** How the user navigates back to previous checkpoints
- **Revision diff display:** How outline/article revisions show changes
- **Critical files list** with roles

Use the `frontend-design` skill when designing the visual approach and component architecture — we want a design that fits the noir/investigative theme of the project.

### Established Pattern

After the plan is approved and executed:
1. Implement batch by batch with commits
2. Run code review after implementation (`superpowers:requesting-code-review`)
3. Fix review findings
4. Use `superpowers:verification-before-completion` before claiming done
5. **Then:** re-read the master roadmap at `C:\Users\spide\.claude\plans\structured-purring-cook.md`, mark Phase 3 complete, assess Phase 4 readiness, and update the roadmap with revised scope/estimates

### Branch

Continue on `cleanup/foundation-dead-code-removal` or create a new branch — recommend in your plan.
