# Observability

LangSmith tracing, the SSE progress events and LangSmith Studio.

Moved verbatim from `reports/CLAUDE.md` on 2026-10-11, when CLAUDE.md became a map. A part named in bold elsewhere in this text, such as **The map**, may now sit in another file in `docs/architecture/`; CLAUDE.md lists which file holds which part.

### LangSmith Tracing

Enable observability with environment variables:
```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=aln-director-console
```

**Usage in nodes:**
```javascript
const { traceNode } = require('../../observability');
module.exports = { myNode: traceNode(myNodeImpl, 'myNode') };
```

Traces include: execution timing, state snapshots, SDK call inputs/outputs.

### SSE Progress Events

The observability layer emits rich SSE events for full LLM visibility:

| Event Type | Description |
|------------|-------------|
| `llm_start` | Emitted when SDK call begins (full prompt, system, schema) |
| `llm_complete` | Emitted when SDK call finishes (full response, elapsed time) |
| `progress` | Standard progress updates during execution |
| `complete` | Workflow finished successfully |
| `error` | Error occurred |

**Full Visibility Pattern:** No truncation of prompts or responses. SSE streams complete content for debugging and tracing.

### LangSmith Studio

Web-based IDE for visualizing and debugging the LangGraph workflow.

**Quick Start:** `npx @langchain/langgraph-cli dev` (opens browser automatically)
**With Tunnel:** `npx @langchain/langgraph-cli dev --tunnel` (for Safari/remote)

**Requirements:** LangSmith account + `LANGSMITH_API_KEY` in `.env`
**Config:** `langgraph.json` defines graph as `./lib/studio/entry.js:graph`

**Features:** Graph visualization (44 nodes), state inspection, time-travel debugging, prompt iteration
