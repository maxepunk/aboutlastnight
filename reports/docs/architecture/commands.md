# Commands

Every command and harness option, with what each does. CLAUDE.md keeps the everyday ones.

Moved verbatim from `reports/CLAUDE.md` on 2026-10-11, when CLAUDE.md became a map. A part named in bold elsewhere in this text, such as **The map**, may now sit in another file in `docs/architecture/`; CLAUDE.md lists which file holds which part.

## Common Commands

```bash
# Development
npm start              # Start server on localhost:3001
npm run dev            # Same as npm start

# Testing
npm test               # Run all Jest tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (targets: 80% lines/functions)

# Run single test file
npx jest lib/__tests__/theme-loader.test.js

# SDK probes (LIVE model calls; the phase 2 slice 2.0 gate, see "Agent SDK version" below)
node scripts/probe-sdk-isolation.js                      # one call per alias; exit 1 on init tools other than the declared ones (+ StructuredOutput with a schema), memory, no thinking text, wrong served model
node scripts/probe-sdk-isolation.js --model opus         # one alias or a comma list
PROBE_SESSION_ID=092026 node scripts/probe-content-bundle-channel.js   # exit 1 on text_fallback (PROBE_DATA_ROOT=<dir> for a worktree)
node scripts/check-model-freshness.js                    # every MODEL_IDS entry resolves and serves as pinned

# E2E Pipeline Testing (primary testing tool). Without --resume, --approve or --rollback, --session starts the session over (POST /start with force), clearing its thread. A rollback continues the thread as --resume would (`startsSessionOver` in `scripts/lib/paused-stop.js`, the 4c fix batch).
node scripts/e2e-walkthrough.js --session 1221 --resume  # Resume existing session
node scripts/e2e-walkthrough.js --session 1225 --fresh   # Fresh start
node scripts/e2e-walkthrough.js --session 1225 --auto    # Start the session over, then auto-approve every checkpoint (add --resume to continue the thread)
node scripts/e2e-walkthrough.js --help                   # Full CLI options

# Step-by-step mode (non-interactive, for collaborative debugging). None of these starts the session over. A stop mismatch prints commands that keep the thread, and an --override run with neither --resume nor --rollback stops with a warning (`keepThreadCommands`, `openingRequest`; the final fix). A thread from before the story meeting gets the server's message and the rollback to the meeting, and the harness posts nothing else to it (`oldThreadStop`, task 4.12a).
node scripts/e2e-walkthrough.js --session 1225 --resume --step   # View the stop the thread reaches (a /resume replays from START to it); the story meeting, the map and the desk print as the console shows them (scripts/lib/stop-print.js, task 4.12a), and so do the input review and the character-IDs stop (task 4.12c); where the part of the screen changes the print breaks with a rule that names nothing, so the map's round, its headline, deck and top photo, and its counts group apart from the heading before them (task 4.12e)
node scripts/e2e-walkthrough.js --session 1225 --approve input-review --step   # Approve the stop the thread is paused at, read through GET /checkpoint with no /resume, so nothing replays; a thread paused elsewhere or not paused is left as it is, and the harness says where it is (scripts/lib/paused-stop.js)
node scripts/e2e-walkthrough.js --session 1225 --approve arc-selection --action reweave --note "..." --step   # The story meeting, the map or the desk: approve (the default), reweave (the meeting only) or send-back, with the note, through the console's own payload builders (scripts/lib/stop-payloads.js); a changed weave, map or article goes with --approve-file, which sends its file as it is and so takes no --action, --note, --angle or --leave-out (task 4.12d; --angle since brief 3E); the run reads the file only with --approve and --step, and refuses it anywhere else, saying it would never read it (task 4.12e). --action and --note anywhere else stop the run, naming each stop STOP_ACTIONS lists with what it takes (`optionsRefusal`, task 4.12c). A refused run posts nothing and exits 2 (`OPTIONS_REFUSED_EXIT_CODE`, task 4.12e), so a scripted gate run sees the refusal: a run refused for its options, and one refused at its stop (an --action the stop does not take, a send-back with no --note, a photo the stop does not show)
node scripts/e2e-walkthrough.js --session 1225 --approve arc-selection --angle 2 --step   # The story meeting: pick the angle to send on, by its number counted from 1 in the order the meeting shows them, through the console's own pickMeetingAngle and meetingPayload, with --action and --note (piece 3, brief 3E). It goes only with --approve arc-selection and --step, and never with --approve-file, which carries the pick in its weave; a number past the angles shown is refused at the stop
node scripts/e2e-walkthrough.js --session 1225 --approve character-ids --photo-descriptions descriptions.json --leave-out "p3.jpg" --step   # {"photo.jpg": "the director's description"}: the console's Approve with them (without the file its Skip). The leave-out boxes start from the photos the server lists, as the console's do, and --leave-out only ticks the photos it names: a photo the server already lists cannot be unticked, and the list goes out empty only when the server lists none (tasks 4.12c and 4.12d). With --approve, --leave-out goes only with --approve character-ids

# Remote access
start-everything.bat   # Windows: Start server + Cloudflare tunnel
cloudflared tunnel run aln-console  # Manual tunnel start

# LangSmith Studio (graph visualization + debugging)
npx @langchain/langgraph-cli dev    # Start Agent Server, opens Studio in browser
npx @langchain/langgraph-cli dev --tunnel  # With tunnel (for Safari/remote)
```
