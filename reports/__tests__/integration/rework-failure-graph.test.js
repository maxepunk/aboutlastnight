process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * A rework that fails keeps the version it started from (task 4.14e; the final review's
 * ruling 5): the map and the desk through the REAL compiled graph, as the story meeting's
 * rework does (arc-specialist-nodes.js reviseArcs, ruling 6 of brief 4.5).
 *
 * Each run seeds a thread past the story meeting and the photo branch
 * (`updateState(..., 'finalizePhotoAnalyses')`) and runs the real map writer, map checks,
 * stops, increments and reworks, and at the desk the real article writer, stamp, fact check
 * and judge. The director acts through the server's own functions, as the console's request
 * would: buildResumePayload turns each action into the resume and the update, and
 * getCheckpointData shows the stop. The model calls go to a scripted stand-in whose reworks
 * fail as each case asks: a stall (the SDK's idle abort, which lib/llm/retry.js reads as
 * transient) or a schema failure (permanent). No model call is made. The checkpointer is a
 * SqliteSaver on a temp file, as the server runs on.
 *
 * A Retry (the console's /resume) replays the thread from its start, and every node before
 * the map skips on its output in a real thread. These fixtures hold only the state past the
 * photo branch, so the replay is entered where the map's nodes start, as the reviewer's probe
 * (p19-rework-transient-failure.js) enters it.
 *
 * Invented text throughout: the repo is public.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { getCheckpointData, buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { PHASES } = require('../../lib/workflow/state');
const { StructuredOutputExtractionError } = require('../../lib/llm/structured-output-extractor');
const {
  articleReviewPayload, mapPayload, mapPendingSlot, mapDraftOf, mapNoteOf, pendingEditsAfterCheckpoint, noteSlotKey
} = require('../../console/checkpoint-view-logic');
const { reworkFixtureState, MAP, DOCUMENT_TEXT } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });

const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };
/** The article judge's breach: a truth issue the writer's text holds, which sends the draft to one automatic pass. */
const BREACH = {
  ready: false, structuralPassed: false, overallScore: 0.4, criteriaScores: {},
  structuralIssues: ['T5: the closing says Riley was paid at the bar; the record has Morgan handing Riley an envelope.'],
  advisoryWarnings: [], confidence: 'high'
};
const DIRECTORS_HEADLINE = 'The Ledger Kept Talking After the Room Voted';
const MAP_NOTE = 'Tighten the money section.';
const DESK_NOTE = 'Lead with the envelope at the bar.';

/** A stall: the SDK's idle abort, worded as lib/llm/client.js words it, which isTransientError retries. */
const stall = (label) => new Error(`SDK timeout after 900.0s idle 900.0s with no streamed activity (idle limit: 900s) - ${label}`);
/** A schema failure: permanent, never retried. */
const badSchema = (label) => new StructuredOutputExtractionError(`Structured output failed schema validation - ${label}`, { label });

/** The fixture's map with Riley in no beat: the map check fails on the writer's text (as map-graph.test.js has it). */
function withoutRiley() {
  const map = clone(MAP);
  map.sections[1].beats[1].players = ['Morgan'];
  map.sections[3].beats[0].players = [];
  return map;
}

/** The article writer's first draft, which the fact check passes: every roster player named, its card from the record, both kept photos placed. */
function writersDraft() {
  return {
    metadata: { sessionId: '100326', theme: 'journalist', generatedAt: '2026-10-03T10:00:00.000Z' },
    headline: { main: "The Writer's Own Headline", kicker: 'NovaNews', deck: "The writer's own deck." },
    heroImage: { filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Alex and Morgan deadlocked, and six votes named an accidental overdose.')] },
      {
        id: 'theStory', type: 'narrative', heading: 'The Story',
        content: [
          paragraph('Marcus bragged about the sale the night he died.'),
          { type: 'evidence-card', tokenId: 'ale003', headline: 'The brag', content: DOCUMENT_TEXT.ale003, owner: 'Alex Reeves', significance: 'critical' },
          { type: 'photo', filename: 'p2.jpg', caption: 'Alex leans over the ledger and points at a line.' },
          paragraph('Morgan handed Riley an envelope by the bar, and a paternity result named Sarah as the heir.')
        ]
      },
      { id: 'closing', type: 'conclusion', content: [paragraph('Riley says they only kept the books.')] }
    ]
  };
}

/**
 * A scripted SDK. The map writer answers by the map's schema (`writersMap`, the fixture's map
 * by default) and the article writer by the bundle's; the map's and the article's reworks by
 * their labels, through `mapRework` and `articleRework`, which may throw; every other call (the
 * article judge) gives `judges` in turn, then the last of them. Every call is recorded by name,
 * and its prompt at the same place in `prompts`.
 */
function scriptedSdk({ writersMap = MAP, mapRework, articleRework, judges = [CLEAN] } = {}) {
  const calls = [];
  const prompts = [];
  let judged = 0;
  const sdk = async (options) => {
    prompts.push(options.prompt || '');
    const label = options.label || '';
    const schemaId = options.jsonSchema && options.jsonSchema.$id;
    if (/^Map revision/.test(label)) {
      calls.push(label);
      return clone(mapRework(options, calls));
    }
    if (/^Article revision/.test(label)) {
      calls.push(label);
      return clone(articleRework(options, calls));
    }
    if (schemaId === 'outline') {
      calls.push('map writer');
      return clone(writersMap);
    }
    if (schemaId === 'content-bundle') {
      calls.push('article writer');
      return writersDraft();
    }
    calls.push('judge');
    const verdict = judges[Math.min(judged, judges.length - 1)];
    judged += 1;
    return clone(verdict);
  };
  sdk.calls = calls;
  sdk.prompts = prompts;
  return sdk;
}

/** How many times the calls since `from` name `who`. */
const callsOf = (sdk, from, who) => sdk.calls.slice(from).filter((call) => call === who).length;

/** The prompt of the last call named `who`. */
const promptOf = (sdk, who) => sdk.prompts[sdk.calls.lastIndexOf(who)] || '';

/** The standing notes the last call named `who` read: its <DIRECTOR_GUIDANCE>, or '' when it had none. */
function guidanceOf(sdk, who) {
  const match = /<DIRECTOR_GUIDANCE>([\s\S]*?)<\/DIRECTOR_GUIDANCE>/.exec(promptOf(sdk, who));
  return match ? match[1] : '';
}

describe('4.14e: a failed rework keeps the version it started from, at the map and the desk', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-rework-failure-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const run = (graph, thread, input) => graph.invoke(input, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });

  /** Where the thread is: the stop it is paused at and that stop's payload, or no stop. */
  async function stopOf(graph, thread) {
    const snapshot = await graph.getState(thread);
    const task = snapshot.tasks && snapshot.tasks[0];
    const interrupt = task && task.interrupts && task.interrupts[0];
    const type = interrupt ? interrupt.value.type : null;
    return { type, values: snapshot.values, data: type ? await getCheckpointData(type, snapshot.values) : null };
  }

  /** The director's action at the stop the thread is paused at, through the server's payload builder. */
  async function act(graph, thread, approvals) {
    const snapshot = await graph.getState(thread);
    const type = snapshot.tasks[0].interrupts[0].value.type;
    const { resume, stateUpdates, error } = buildResumePayload(approvals, snapshot.values, 'journalist', type, { dataDir: dir });
    expect(error).toBeNull();
    await run(graph, thread, new Command({ resume, update: stateUpdates }));
    return stopOf(graph, thread);
  }

  /** A Retry: the thread replayed from where the map's nodes start. */
  async function replay(graph, thread) {
    await graph.updateState(thread, {}, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    return stopOf(graph, thread);
  }

  /** The thread past the meeting and the photo branch, run to the map's stop (or as far as the run goes). */
  async function toMap(sdk) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = { configurable: { thread_id: 'rework-failure', sessionId: '100326', theme: 'journalist', sdkClient: sdk, dataDir: dir } };
    const { outline: _o, _mapBaseline: _b, ...state } = reworkFixtureState('journalist');
    await graph.updateState(thread, { ...state, sessionId: '100326', evaluationHistory: [] }, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    return { graph, thread };
  }

  /** The map as the director leaves it: their headline, and the paternity result struck into left out. */
  function directorsMap(shown) {
    const left = clone(shown);
    left.headline = DIRECTORS_HEADLINE;
    left.leftOut.push(left.sections[1].beats.splice(2, 1)[0]);
    return left;
  }

  /** The thread run to the desk: the map approved as the writer wrote it. */
  async function toDesk(sdk) {
    const { graph, thread } = await toMap(sdk);
    const atMap = await stopOf(graph, thread);
    expect(atMap.type).toBe(CHECKPOINT_TYPES.OUTLINE);
    const atDesk = await act(graph, thread, { outline: 'approve', map: clone(atMap.data.outline) });
    return { graph, thread, atDesk };
  }

  /** The article as the director leaves it at the desk: their headline and their line in the closing. */
  function directorsDesk(shown) {
    const desk = clone(shown);
    desk.headline.main = DIRECTORS_HEADLINE;
    desk.sections[2].content[0] = paragraph('Riley kept the books, and the books kept the envelope.');
    return desk;
  }

  describe('the map', () => {
    it("a send-back whose rework stalls on every call: the map reopens as the director left it, says the round did not run, and the writer is not called again", async () => {
      const sdk = scriptedSdk({ mapRework: (options) => { throw stall(options.label); } });
      const { graph, thread } = await toMap(sdk);
      const shown = await stopOf(graph, thread);
      expect(shown.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      const left = directorsMap(shown.data.outline);
      const before = sdk.calls.length;

      const reopened = await act(graph, thread, { outline: 'send-back', map: left, note: MAP_NOTE });

      // A stall is transient: the rework runs three times in all before the round is given up.
      expect(sdk.calls.slice(before)).toEqual(['Map revision 0', 'Map revision 0', 'Map revision 0']);
      expect(reopened.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      expect(reopened.values.outline).toEqual(left);
      expect(reopened.data.outline).toEqual(left);
      expect(reopened.data.roundDidNotRun).toEqual({ round: 'send-back', at: expect.any(String), note: MAP_NOTE });
      // The round did not run: its count goes back, and so do the slots that carried it.
      expect(reopened.data.humanRevisionCount).toBe(0);
      expect(reopened.values).toMatchObject({ _outlineFeedback: null, _previousOutline: null, currentPhase: PHASES.MAP_CHECKS });
      // The director's edits stand, for the round they send next.
      expect(reopened.values._outlineHandEdits.edits.length).toBeGreaterThan(0);

      // A replay at the reopened map (Retry, a resume) opens it again with no call.
      const calls = sdk.calls.length;
      const again = await replay(graph, thread);
      expect(again.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      expect(again.values.outline).toEqual(left);
      expect(sdk.calls.length).toBe(calls);
    });

    it('a send-back whose rework fails its schema: the map reopens as the director left it after one call, and the writer is not called again', async () => {
      const sdk = scriptedSdk({ mapRework: (options) => { throw badSchema(options.label); } });
      const { graph, thread } = await toMap(sdk);
      const shown = await stopOf(graph, thread);
      const left = directorsMap(shown.data.outline);
      const before = sdk.calls.length;

      const reopened = await act(graph, thread, { outline: 'send-back', map: left, note: MAP_NOTE });

      expect(sdk.calls.slice(before)).toEqual(['Map revision 0']);
      expect(reopened.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      expect(reopened.values.outline).toEqual(left);
      expect(reopened.data.roundDidNotRun).toEqual({ round: 'send-back', at: expect.any(String), note: MAP_NOTE });
      expect(reopened.data.humanRevisionCount).toBe(0);
    });

    it('a send-back whose rework stalls once: the stall is retried, and the round runs', async () => {
      const fixed = clone(MAP);
      fixed.deck = 'The rework tightened the money section.';
      const sdk = scriptedSdk({ mapRework: (options, calls) => {
        if (calls.filter((c) => /^Map revision/.test(c)).length === 1) throw stall(options.label);
        return fixed;
      } });
      const { graph, thread } = await toMap(sdk);
      const shown = await stopOf(graph, thread);
      const before = sdk.calls.length;

      const next = await act(graph, thread, { outline: 'send-back', map: clone(shown.data.outline), note: MAP_NOTE });

      expect(sdk.calls.slice(before)).toEqual(['Map revision 0', 'Map revision 0']);
      expect(next.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      expect(next.values.outline.deck).toBe(fixed.deck);
      expect(next.data.roundDidNotRun).toBeNull();
      expect(next.data.humanRevisionCount).toBe(1);
      expect(next.values._outlineRework).toBeNull();
    });

    it("an automatic pass whose rework fails ends the run in an error with the writer's map kept, and Retry opens the map with no call", async () => {
      const sdk = scriptedSdk({ writersMap: withoutRiley(), mapRework: (options) => { throw badSchema(options.label); } });
      const { graph, thread } = await toMap(sdk);
      const stopped = await stopOf(graph, thread);

      expect(sdk.calls).toEqual(['map writer', 'Map revision 1']);
      expect(stopped.type).toBeNull();
      expect(stopped.values.currentPhase).toBe(PHASES.ERROR);
      expect(stopped.values.outline).toEqual(withoutRiley());
      expect(stopped.values.errors[stopped.values.errors.length - 1].message).toMatch(/schema validation/);
      // The pass did not run: the trace lists no pass that never returned.
      expect(stopped.values._outlineTrace || []).toEqual([]);

      const calls = sdk.calls.length;
      const retried = await replay(graph, thread);
      expect(sdk.calls.length).toBe(calls);
      expect(retried.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      expect(retried.data.outline).toEqual(withoutRiley());
      expect(retried.data.checkFailures.length).toBeGreaterThan(0);
      expect(retried.data.trace).toEqual([]);
      expect(retried.data.roundDidNotRun).toBeNull();
    });

    it('an automatic pass whose rework stalls once is retried free, within the round\'s budget', async () => {
      const fixed = clone(MAP);
      const sdk = scriptedSdk({ writersMap: withoutRiley(), mapRework: (options, calls) => {
        if (calls.filter((c) => /^Map revision/.test(c)).length === 1) throw stall(options.label);
        return fixed;
      } });
      const { graph, thread } = await toMap(sdk);
      const stop = await stopOf(graph, thread);

      expect(sdk.calls).toEqual(['map writer', 'Map revision 1', 'Map revision 1']);
      expect(stop.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      expect(stop.values.outline).toEqual(fixed);
      expect(stop.values.outlineRevisionCount).toBe(1);
      expect(stop.data.trace).toHaveLength(1);
    });
  });

  describe('the desk', () => {
    it("a send-back whose rework stalls on every call: the desk reopens as the director left it, says the round did not run, and neither writer nor judge is called again", async () => {
      const sdk = scriptedSdk({ articleRework: (options) => { throw stall(options.label); } });
      const { graph, thread, atDesk } = await toDesk(sdk);
      expect(atDesk.type).toBe(CHECKPOINT_TYPES.ARTICLE);
      const desk = directorsDesk(atDesk.values.contentBundle);
      const before = sdk.calls.length;

      const reopened = await act(graph, thread, articleReviewPayload(desk, DESK_NOTE, 'send-back'));

      expect(sdk.calls.slice(before)).toEqual(['Article revision 0', 'Article revision 0', 'Article revision 0']);
      expect(reopened.type).toBe(CHECKPOINT_TYPES.ARTICLE);
      expect(reopened.values.contentBundle).toEqual(desk);
      expect(reopened.data.contentBundle).toEqual(desk);
      expect(reopened.data.roundDidNotRun).toEqual({ round: 'send-back', at: expect.any(String), note: DESK_NOTE });
      expect(reopened.data.humanRevisionCount).toBe(0);
      expect(reopened.values).toMatchObject({ _articleFeedback: null, _previousContentBundle: null });
      // The stop's verdict stands for the version it holds, as the meeting keeps its mark.
      expect(reopened.data.lastEvaluation).toMatchObject({ phase: 'article', ready: true });
      expect(reopened.values._articleHandEdits.edits.length).toBeGreaterThan(0);

      // A replay at the reopened desk opens it again with no call: no writer, no judge, no rework.
      const calls = sdk.calls.length;
      const again = await replay(graph, thread);
      expect(again.type).toBe(CHECKPOINT_TYPES.ARTICLE);
      expect(again.values.contentBundle).toEqual(desk);
      expect(sdk.calls.length).toBe(calls);
    });

    it('a send-back whose rework fails its schema: the desk reopens as the director left it after one call', async () => {
      const sdk = scriptedSdk({ articleRework: (options) => { throw badSchema(options.label); } });
      const { graph, thread, atDesk } = await toDesk(sdk);
      const desk = directorsDesk(atDesk.values.contentBundle);
      const before = sdk.calls.length;

      const reopened = await act(graph, thread, articleReviewPayload(desk, DESK_NOTE, 'send-back'));

      expect(sdk.calls.slice(before)).toEqual(['Article revision 0']);
      expect(reopened.type).toBe(CHECKPOINT_TYPES.ARTICLE);
      expect(reopened.values.contentBundle).toEqual(desk);
      expect(reopened.data.roundDidNotRun).toEqual({ round: 'send-back', at: expect.any(String), note: DESK_NOTE });
      expect(callsOf(sdk, before, 'judge')).toBe(0);
      expect(callsOf(sdk, before, 'article writer')).toBe(0);
    });

    it("an automatic pass whose rework fails ends the run in an error with the writer's draft kept, and Retry opens the desk with no call", async () => {
      const sdk = scriptedSdk({ judges: [BREACH], articleRework: (options) => { throw badSchema(options.label); } });
      const { graph, thread } = await toMap(sdk);
      const atMap = await stopOf(graph, thread);
      await act(graph, thread, { outline: 'approve', map: clone(atMap.data.outline) });
      const stopped = await stopOf(graph, thread);

      expect(sdk.calls).toEqual(['map writer', 'article writer', 'judge', 'Article revision 1']);
      expect(stopped.type).toBeNull();
      expect(stopped.values.currentPhase).toBe(PHASES.ERROR);
      expect(stopped.values.contentBundle.sections[2].content[0].text).toBe('Riley says they only kept the books.');
      expect(stopped.values._articleTrace || []).toEqual([]);

      const calls = sdk.calls.length;
      const retried = await replay(graph, thread);
      expect(sdk.calls.length).toBe(calls);
      expect(retried.type).toBe(CHECKPOINT_TYPES.ARTICLE);
      expect(retried.data.contentBundle).toEqual(stopped.values.contentBundle);
      // The judge's breach is the director's now, as at the cap.
      expect(retried.data.lastEvaluation).toMatchObject({ escalatedToHuman: true, structuralIssues: BREACH.structuralIssues });
      expect(retried.data.trace).toEqual([]);
      expect(retried.data.roundDidNotRun).toBeNull();
    });
  });

  // Fix round 1, finding 1 (the reviewer's probes note-after-unrun.js and
  // desk-note-after-unrun.js): the send-back filed its note as a rejection note, which every
  // later writer reads as applied by the rework at its stop. A round that did not run withdraws
  // it, and the director's next action files it again or leaves it out, as at the story meeting.
  describe('fix round 1: the note of a send-back that did not run', () => {
    it('the map: a note-only send-back that did not run lists no standing note, and Approve with the note in the box files it once, as an approval note, which the article writer reads once', async () => {
      const sdk = scriptedSdk({ mapRework: (options) => { throw badSchema(options.label); } });
      const { graph, thread } = await toMap(sdk);
      const shown = await stopOf(graph, thread);

      const reopened = await act(graph, thread, mapPayload('send-back', clone(shown.data.outline), MAP_NOTE));

      expect(reopened.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      expect(reopened.data.roundDidNotRun).toEqual({ round: 'send-back', at: expect.any(String), note: MAP_NOTE });
      expect(reopened.values.directorGateNotes).toEqual([]);
      expect(reopened.data.directorGateNotes).toEqual([]);
      // The console reopens the map with the note in its box (the slot the map's send() saved).
      const pending = { outline: mapPendingSlot(shown.data, clone(shown.data.outline)), [noteSlotKey('outline')]: MAP_NOTE };
      const kept = pendingEditsAfterCheckpoint(pending, 'outline', reopened.data);
      const box = mapNoteOf(reopened.data, kept.outline, kept[noteSlotKey('outline')]);
      expect(box).toBe(MAP_NOTE);

      const atDesk = await act(graph, thread, mapPayload('approve', mapDraftOf(reopened.data, kept.outline), box));

      expect(atDesk.type).toBe(CHECKPOINT_TYPES.ARTICLE);
      expect(atDesk.values.directorGateNotes).toEqual([
        expect.objectContaining({ gate: 'outline', kind: 'approval', round: 1, stopRound: 1, text: MAP_NOTE })
      ]);
      const guidance = guidanceOf(sdk, 'article writer');
      expect(guidance).toContain(`- [outline, approval 1] ${MAP_NOTE}`);
      expect(guidance.split(MAP_NOTE)).toHaveLength(2);
    });

    it("the map: a retry with the same words files the note once, as the rejection note of the round that runs, and the rework reads it as the director's note", async () => {
      const fixed = clone(MAP);
      fixed.deck = 'The rework tightened the money section.';
      const sdk = scriptedSdk({ mapRework: (options, calls) => {
        if (calls.filter((c) => /^Map revision/.test(c)).length === 1) throw badSchema(options.label);
        return fixed;
      } });
      const { graph, thread } = await toMap(sdk);
      const shown = await stopOf(graph, thread);
      const reopened = await act(graph, thread, mapPayload('send-back', clone(shown.data.outline), MAP_NOTE));
      expect(reopened.data.roundDidNotRun).toEqual({ round: 'send-back', at: expect.any(String), note: MAP_NOTE });

      const next = await act(graph, thread, mapPayload('send-back', clone(reopened.data.outline), MAP_NOTE));

      expect(next.type).toBe(CHECKPOINT_TYPES.OUTLINE);
      expect(next.values.outline.deck).toBe(fixed.deck);
      expect(next.data.roundDidNotRun).toBeNull();
      expect(next.data.humanRevisionCount).toBe(1);
      expect(next.values.directorGateNotes).toEqual([
        expect.objectContaining({ gate: 'outline', kind: 'rejection', round: 1, stopRound: 1, text: MAP_NOTE })
      ]);
      // The round's line reads the note that opened it (roundNoteOf).
      expect(next.data.previousFeedback).toBe(MAP_NOTE);
      expect(promptOf(sdk, 'Map revision 0')).toContain(MAP_NOTE);
      expect(guidanceOf(sdk, 'Map revision 0')).not.toContain(MAP_NOTE);
    });

    it('the desk: a send-back that did not run, then one with another note that runs: the running rework reads only the second note', async () => {
      const second = 'Cut the closing to two lines.';
      let reworks = 0;
      const sdk = scriptedSdk({ articleRework: (options) => {
        reworks += 1;
        if (reworks === 1) throw badSchema(options.label);
        return writersDraft();
      } });
      const { graph, thread, atDesk } = await toDesk(sdk);
      const reopened = await act(graph, thread, articleReviewPayload(directorsDesk(atDesk.values.contentBundle), DESK_NOTE, 'send-back'));
      expect(reopened.data.roundDidNotRun).toEqual({ round: 'send-back', at: expect.any(String), note: DESK_NOTE });
      expect(reopened.data.directorGateNotes).toEqual([]);

      const next = await act(graph, thread, articleReviewPayload(clone(reopened.values.contentBundle), second, 'send-back'));

      expect(next.type).toBe(CHECKPOINT_TYPES.ARTICLE);
      expect(next.data.humanRevisionCount).toBe(1);
      expect(next.values.directorGateNotes).toEqual([
        expect.objectContaining({ gate: 'article', kind: 'rejection', round: 1, stopRound: 1, text: second })
      ]);
      expect(promptOf(sdk, 'Article revision 0')).toContain(second);
      expect(promptOf(sdk, 'Article revision 0')).not.toContain(DESK_NOTE);
    });
  });
});
