/**
 * Durable checkpointer integration test (Phase P1 / DUR-1).
 *
 * Proves: a graph paused at interrupt() persists to disk and a FRESH
 * SqliteSaver over the same db file restores the interrupt — i.e. a
 * server restart does not evaporate a session parked mid-review.
 *
 * Uses a minimal real interrupt() graph, not the 43-node pipeline (which
 * needs Notion + the SDK). The saver behavior under test is graph-agnostic.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { StateGraph, START, END, Annotation, interrupt } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const State = Annotation.Root({
  value: Annotation({ reducer: (_, b) => b, default: () => null })
});

function buildGraph(checkpointer) {
  const builder = new StateGraph(State)
    .addNode('pause', () => {
      // interrupt() throws GraphInterrupt; the saver persists the pre-interrupt snapshot
      const answer = interrupt({ ask: 'approve?' });
      return { value: answer };
    })
    .addEdge(START, 'pause')
    .addEdge('pause', END);
  return builder.compile({ checkpointer });
}

describe('SqliteSaver durability across a simulated restart', () => {
  let dbPath;

  beforeEach(() => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aln-ckpt-')), 'checkpoints.sqlite');
  });

  it('restores a parked interrupt from disk via a brand-new saver instance', async () => {
    const thread = { configurable: { thread_id: 'sess-1' } };

    // --- process #1: run to the interrupt, then "crash" (drop the saver ref) ---
    let saver1 = SqliteSaver.fromConnString(dbPath);
    const graph1 = buildGraph(saver1);
    await graph1.invoke({ value: 'init' }, { ...thread, durability: 'sync' });
    const state1 = await graph1.getState(thread);
    expect(state1.tasks?.[0]?.interrupts?.length).toBeGreaterThan(0); // genuinely paused
    saver1.db.close(); // simulate process exit releasing the file handle

    // --- process #2: fresh saver, SAME file — must see the parked interrupt ---
    const saver2 = SqliteSaver.fromConnString(dbPath);
    const graph2 = buildGraph(saver2);
    const restored = await graph2.getState(thread);
    expect(restored.tasks?.[0]?.interrupts?.length).toBeGreaterThan(0);
    expect(restored.values.value).toBe('init'); // pre-interrupt work preserved
    saver2.db.close();
  });

  it('an in-memory MemorySaver would NOT survive (control): fresh saver sees nothing', async () => {
    const { MemorySaver } = require('@langchain/langgraph');
    const thread = { configurable: { thread_id: 'sess-2' } };
    const g1 = buildGraph(new MemorySaver());
    await g1.invoke({ value: 'init' }, { ...thread, durability: 'sync' });
    // a *new* MemorySaver (the restart) has an empty store
    const g2 = buildGraph(new MemorySaver());
    const restored = await g2.getState(thread);
    expect(restored.tasks).toEqual([]); // nothing parked -> the bug DUR-1 describes
  });
});
