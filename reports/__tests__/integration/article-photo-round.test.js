process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * Task 4.5f: the photo rule reaches the pipeline (the integrator's ruling 1 on 4.5e's
 * findings, progress.md 2026-10-04), end to end through the REAL compiled graph.
 *
 * The director captions, at the desk, a photo the session does not hold and sends the article
 * back. The send-back's rework keeps the caption, so the fact check reads the photo as an
 * invalid reference in the writer's filename, and the automatic pass that follows renames it to
 * a photo the director kept. Code leaves the director's caption out with the photo it was on
 * (lib/hand-edit-diff.js settleEdits, given the kept photos by reviseContentBundle), so the
 * pass's fix stands, the next fact check passes, and the round ends after that one pass, with
 * the rest of its automated budget unspent. Before the wiring, code put the photo back, and the
 * round spent both automatic passes on it and ended with the invalid photo still printed
 * (4.5e's verification, scratch 4.5e/out-as-committed.json). This is that verification with
 * no monkey-patch.
 *
 * The model calls go to a scripted mock routed by call label (no live model). The
 * checkpointer is a SqliteSaver on a temp file; the production database is never opened.
 * Invented text.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { mocks } = require('../../lib/workflow/nodes');
const { getCheckpointData, buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { CHANGED_EDITS_KEY } = require('../../lib/hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });
const photo = (filename, caption) => ({ type: 'photo', filename, caption });

const WRITERS_CAPTION = 'The huddle at the bar.';
const DIRECTORS_CAPTION = 'Six people huddle at the bar, late in the evening, around Alex.';

/** The article with one photo in THE STORY: the writer's, a photo the session does not hold. */
function writersArticle(filename = 'not-ours.jpg', caption = WRITERS_CAPTION) {
  return {
    metadata: { sessionId: 'photo-round', theme: 'journalist', generatedAt: '2026-10-04T10:00:00.000Z' },
    headline: { main: 'Alex Reeves Pointed the Room at Jess Kane', kicker: 'NovaNews', deck: 'The room named Alex, five votes to four.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Alex had the scoreboard pulled up in the last minutes, and Jess said she was being framed.')] },
      {
        id: 'the-story', type: 'narrative', heading: 'The Story',
        content: [
          paragraph('Mel built the first theory around the fight and the fraud.'),
          photo(filename, caption),
          paragraph('Sarah pointed the room at the baby mama, and the vote followed.')
        ]
      },
      { id: 'closing', type: 'narrative', heading: 'Closing', content: [paragraph('Whether the verdict costs Alex anything is still open.')] }
    ]
  };
}
/** The director's version: the writer's photo with the director's caption. */
const directorsArticle = () => writersArticle('not-ours.jpg', DIRECTORS_CAPTION);
/** An automatic pass's fix: the photo renamed to one the director kept, the director's caption on it. */
const fixedArticle = () => writersArticle('a.jpg', DIRECTORS_CAPTION);

const PASSING = {
  ready: true, structuralPassed: true, overallScore: 0.92,
  criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], revisionGuidance: '', confidence: 'high'
};

/**
 * A scripted SDK: round 1's two automatic passes leave the writer's photo as it is, so the
 * article reaches the stop with it; round 2's send-back rework keeps the director's version;
 * every later pass renames the photo to a kept one. The judge passes every article.
 */
function scriptedSdk() {
  const calls = [];
  const reworks = [writersArticle(), writersArticle(), { ...directorsArticle(), [CHANGED_EDITS_KEY]: [] }];
  let rework = 0;
  const sdk = async (options) => {
    const label = options.label || '';
    if (/^Article revision/.test(label)) {
      calls.push(label);
      const out = rework < reworks.length ? reworks[rework] : fixedArticle();
      rework += 1;
      return clone(out);
    }
    if (/ARTICLE judge/.test(options.systemPrompt || '')) {
      calls.push('judge');
      return clone(PASSING);
    }
    throw new Error(`scriptedSdk: unexpected call ${label || (options.systemPrompt || '').slice(0, 60)}`);
  };
  sdk.calls = calls;
  return sdk;
}

/** Each photo block a version prints, as `section: filename "caption"`. */
const photosOf = (bundle) => (bundle && Array.isArray(bundle.sections) ? bundle.sections : [])
  .flatMap((s) => (s.content || []).filter((b) => b.type === 'photo').map((b) => `${s.id}: ${b.filename} "${b.caption}"`));

describe('4.5f: a send-back whose desk captions a photo the session does not hold, then an automatic pass that fixes the filename', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-photo-round-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it("the pass's fix stands, the director's caption leaves with the photo, and the round ends after one automatic pass", async () => {
    const sdk = scriptedSdk();
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'photo-round', sessionId: 'photo-round', theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    const run = { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' };

    await graph.updateState(thread, {
      theme: 'journalist',
      sessionId: 'photo-round',
      sessionConfig: { roster: ['Alex', 'Jess', 'Mel', 'Sarah'], reportingMode: 'on-site' },
      sessionPhotos: ['photos/a.jpg', 'photos/b.jpg'],
      contentBundle: writersArticle(),
      outlineApproved: true,
      evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
    }, 'generateContentBundle');
    await graph.invoke(null, run);
    const atStop = await graph.getState(thread);
    expect(atStop.next).toEqual(['checkpointArticle']);
    expect(photosOf(atStop.values.contentBundle)).toEqual([`the-story: not-ours.jpg "${WRITERS_CAPTION}"`]);
    const roundOne = sdk.calls.length;

    // The director captions the writer's photo at the desk and sends the article back.
    const { resume, stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Tighten the closing.', articleEdits: directorsArticle() },
      atStop.values
    );
    expect(error).toBeNull();
    expect(stateUpdates._articleHandEdits.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#the-story].content[1].caption']]);
    await graph.invoke(new Command({ resume, update: stateUpdates }), run);
    const next = await graph.getState(thread);

    // The send-back's rework, one automatic pass, the judge, the stop.
    expect(sdk.calls.slice(roundOne)).toEqual(['Article revision 0', 'Article revision 1', 'judge']);
    expect(next.next).toEqual(['checkpointArticle']);
    expect(next.values.articleRevisionCount).toBe(1);
    const last = [...next.values.evaluationHistory].reverse().find((entry) => entry && entry.phase === 'article');
    expect(last).toMatchObject({ ready: true, structuralIssues: [] });
    expect(last.escalatedToHuman).toBeFalsy();

    // The article prints the kept photo alone, and the fact check finds no invalid photo.
    expect(photosOf(next.values.contentBundle)).toEqual([`the-story: a.jpg "${DIRECTORS_CAPTION}"`]);
    expect(next.values._articleFactCheck.photoReferences.invalid).toEqual([]);

    // The report says the director's caption was on a photo the article cannot print.
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, next.values);
    expect(data.handEditReport).toEqual({
      checked: ['E1'],
      changed: [expect.objectContaining({
        id: 'E1', where: 'section "the-story", photo not-ours.jpg, caption', director: DIRECTORS_CAPTION,
        became: null, pass: 1, automatic: true, restored: false, unprintable: true
      })]
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5g, fix round 1: a section the director added whole, which code put back without a photo
// the article cannot print, stays the director's for the rest of the round and past its stop
// ═══════════════════════════════════════════════════════════════════════════
//
// The review of 4.5g, finding 1 (scratch 4.5g-review/form2-second-pass.js). The director adds a
// section whole, its paragraph and a photo the session does not hold, and sends the article back.
// The first automatic pass fixes the writer's lede and takes the photo out of print; code puts the
// section back without it, and the stop says the rest of the edit stands. Before this fix, nothing
// read the rest as the director's after that: the second pass rewrote the director's paragraph
// and code left it so, the judge read the paragraph as the writer's, and the next send-back
// dropped the edit (R11). The model calls go to a scripted mock; invented text.
describe('4.5g, fix round 1: the rest of a section the director added stands after code puts it back without its photo', () => {
  const { carriedEdits } = require('../../lib/hand-edit-diff');
  const { changedEditsToShow, changedEditLine } = require('../../console/checkpoint-view-logic');

  const LEDE_FIXED = 'Alex had the scoreboard pulled up in the last minutes.';
  const CLOSING = 'Whether the verdict costs Alex anything is still open.';
  const CLOSING_FIXED = 'The verdict stood when the room emptied.';
  const DIRECTORS_PARAGRAPH = 'Nobody in the room asked who moved the money after midnight, and the ledger says someone did.';
  const PASS_PARAGRAPH = 'The room never asked who moved the money, though the ledger hints that someone did.';
  const LEDE_ISSUE = 'T12: "Jess said she was being framed" puts words in her mouth that no document gives her. Cut the line.';
  const CLOSING_ISSUE = `T1: "${CLOSING}" claims an open question the record does not raise. Cut it.`;
  const verdict = (issue) => ({
    ready: false, structuralPassed: false, overallScore: 0.7, criteriaScores: {},
    structuralIssues: [issue], advisoryWarnings: [], revisionGuidance: '', confidence: 'high'
  });

  /** The writer's article, which prints a photo the director kept. */
  const writers = () => writersArticle('a.jpg', WRITERS_CAPTION);
  /** The director's section, added whole. */
  const added = (content) => ({ id: 'added', type: 'narrative', heading: 'What the Room Missed', content });
  const withAdded = (article, content) => {
    const out = clone(article);
    out.sections.splice(2, 0, added(content));
    return out;
  };
  /** The director's version: the section, with their paragraph and a photo the session does not hold. */
  const directors = () => withAdded(writers(), [paragraph(DIRECTORS_PARAGRAPH), photo('not-ours.jpg', DIRECTORS_CAPTION)]);
  /** Pass 1: the lede fixed, and the director's photo taken out. */
  const pass1 = () => {
    const out = withAdded(writers(), [paragraph(DIRECTORS_PARAGRAPH)]);
    out.sections[0].content[0] = paragraph(LEDE_FIXED);
    return out;
  };
  /** Pass 2: the closing fixed, and the director's paragraph rewritten. */
  const pass2 = () => {
    const out = withAdded(writers(), [paragraph(PASS_PARAGRAPH)]);
    out.sections[0].content[0] = paragraph(LEDE_FIXED);
    out.sections[3].content[0] = paragraph(CLOSING_FIXED);
    return out;
  };
  const addedSectionOf = (bundle) => bundle.sections.find((section) => section.id === 'added');

  /** Reworks by label, the judge's verdicts in order; every call's options kept. */
  function scripted() {
    const calls = [];
    const sent = [];
    const reworks = {
      'Article revision 0': { ...directors(), [CHANGED_EDITS_KEY]: [] },
      'Article revision 1': pass1(),
      'Article revision 2': pass2()
    };
    const verdicts = [PASSING, verdict(LEDE_ISSUE), verdict(CLOSING_ISSUE), PASSING];
    let judged = 0;
    const sdk = async (options) => {
      const label = options.label || '';
      sent.push(options);
      if (Object.prototype.hasOwnProperty.call(reworks, label)) {
        calls.push(label);
        return clone(reworks[label]);
      }
      if (/ARTICLE judge/.test(options.systemPrompt || '')) {
        calls.push('judge');
        judged += 1;
        return clone(verdicts[Math.min(judged - 1, verdicts.length - 1)]);
      }
      throw new Error(`scripted: unexpected call ${label || (options.systemPrompt || '').slice(0, 60)}`);
    };
    sdk.calls = calls;
    sdk.sent = sent;
    return sdk;
  }

  let dir;
  let saver;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-photo-section-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it("the second pass is held to the director's paragraph, the judge reads it as the director's, and the next send-back keeps the edit", async () => {
    const sdk = scripted();
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'photo-section', sessionId: 'photo-section', theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    const run = { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' };
    await graph.updateState(thread, {
      theme: 'journalist',
      sessionId: 'photo-section',
      sessionConfig: { roster: ['Alex', 'Jess', 'Mel', 'Sarah'], reportingMode: 'on-site' },
      sessionPhotos: ['photos/a.jpg', 'photos/b.jpg'],
      contentBundle: writers(),
      outlineApproved: true,
      evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
    }, 'generateContentBundle');
    await graph.invoke(null, run);
    const atStop = await graph.getState(thread);
    expect(atStop.next).toEqual(['checkpointArticle']);

    // The director adds the section whole and sends the article back.
    const sendBack = buildResumePayload({ article: false, articleFeedback: 'Tighten the closing.', articleEdits: directors() }, atStop.values);
    expect(sendBack.error).toBeNull();
    expect(sendBack.stateUpdates._articleHandEdits.edits.map((e) => [e.id, e.path])).toEqual([['E1', 'sections[#added]']]);
    await graph.invoke(new Command({ resume: sendBack.resume, update: sendBack.stateUpdates }), run);
    const next = await graph.getState(thread);

    // The send-back's rework, two automatic passes, the judge after each, the stop.
    expect(sdk.calls).toEqual(['judge', 'Article revision 0', 'judge', 'Article revision 1', 'judge', 'Article revision 2', 'judge']);
    expect(next.next).toEqual(['checkpointArticle']);

    // The second pass was held to the rest of the section: its <HAND_EDITS> gives the director's paragraph.
    const secondPass = sdk.sent.find((options) => options.label === 'Article revision 2').prompt;
    const handEdits = secondPass.slice(secondPass.indexOf('<HAND_EDITS>'), secondPass.indexOf('</HAND_EDITS>'));
    expect(handEdits).toContain('E1');
    expect(handEdits).toContain(DIRECTORS_PARAGRAPH);
    expect(handEdits).not.toContain('not-ours.jpg');
    // The judge after it read the paragraph as the director's.
    const lastJudge = sdk.sent[sdk.sent.length - 1].prompt;
    expect(lastJudge.slice(lastJudge.indexOf("THE DIRECTOR'S EDITS"))).toContain(DIRECTORS_PARAGRAPH);

    // Code put the director's paragraph back; the photo the article cannot print stays out.
    expect(addedSectionOf(next.values.contentBundle).content).toEqual([paragraph(DIRECTORS_PARAGRAPH)]);
    expect(photosOf(next.values.contentBundle)).toEqual([`the-story: a.jpg "${WRITERS_CAPTION}"`]);
    expect(carriedEdits(next.values._articleHandEdits, next.values.contentBundle).map((e) => e.id)).toEqual(['E1']);

    // The stop: the first pass's entry asks for a photo; the second pass's restore asks nothing.
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, next.values);
    expect(data.handEditReport.changed).toEqual([
      expect.objectContaining({ id: 'E1', pass: 1, automatic: true, restored: true, unprintable: true }),
      expect.objectContaining({ id: 'E1', pass: 2, automatic: true, restored: true })
    ]);
    expect(changedEditsToShow(data.handEditReport).map((entry) => changedEditLine(entry))).toEqual([
      'E1, section "added": automatic pass 1 took out a photo you placed here, which the article cannot print. The rest of your edit stands: place a photo the article can print here if it should have one.'
    ]);

    // The next send-back, where the director changed nothing: the edit stands without the photo.
    const again = buildResumePayload({ article: false, articleFeedback: 'Shorten the lede.' }, next.values);
    expect(again.error).toBeNull();
    expect(again.stateUpdates._articleHandEdits.edits).toEqual([
      expect.objectContaining({ id: 'E1', path: 'sections[#added]', after: added([paragraph(DIRECTORS_PARAGRAPH)]) })
    ]);
  });
});
