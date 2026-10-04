/**
 * scripts/render-prompts.js's markers and options (phase 4, task 4.11).
 *
 * Every render the tool writes must carry its markers: for each, a line that opens with
 * it (renderProblems, scripts/lib/prompt-sections.js), so an absence scan over a render
 * that lost its frame cannot pass for nothing. Since phase 4 each judge's markers name the
 * blocks its call reads: the story meeting's fact check the weave it judges, and the
 * article judge the settled weave and the map (brief 4.7a) beside the article. `--compare`
 * is retired: it held a phase 4 render to main's byte for byte, and every phase 4 call
 * differs from main's by design. `--sections` serves.
 *
 * The renders are built two ways: the judges in process, through scripts/lib/render-calls.js
 * (which a test holds to what the nodes send), and every file by the script itself, run on a
 * thread written to a temp database by the real checkpointer, with no model call.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { REQUIRED_MARKERS } = require('../../../scripts/render-prompts');
const { renderProblems } = require('../../../scripts/lib/prompt-sections');
const { loadCallModules, renderJudge } = require('../../../scripts/lib/render-calls');
const { createReportGraphWithCheckpointer } = require('../../../lib/workflow/graph');
const { _testing: { TRUTH_MATERIAL } } = require('../../../lib/workflow/nodes/evaluator-nodes');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../../lib/__tests__/fixtures/rework-state');

const REPO = path.join(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'render-prompts.js');
const clone = (v) => JSON.parse(JSON.stringify(v));

/** The eleven files the script writes. */
const RENDERS = [
  'outline-generation.txt', 'outline-revision.txt', 'outline-check-rework.txt',
  'article-generation.txt', 'article-revision.txt',
  'arc-generation.txt', 'arc-revision.txt', 'arc-reweave.txt', 'arc-send-back.txt',
  'judge-arc.txt', 'judge-article.txt'
];

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('4.11: the marker table follows the calls', () => {
  it('names every file the script writes, and only those', () => {
    expect(Object.keys(REQUIRED_MARKERS).sort()).toEqual([...RENDERS].sort());
  });

  it('the map and article renders carry the settled weave, the article renders the map too', () => {
    ['outline-generation.txt', 'outline-revision.txt', 'outline-check-rework.txt', 'article-generation.txt', 'article-revision.txt']
      .forEach((file) => expect(`${file}: ${REQUIRED_MARKERS[file].includes('<SETTLED_WEAVE>')}`).toBe(`${file}: true`));
    ['article-generation.txt', 'article-revision.txt']
      .forEach((file) => expect(`${file}: ${REQUIRED_MARKERS[file].includes('<STORY_MAP>')}`).toBe(`${file}: true`));
  });

  it("the story meeting's fact check is marked by the weave it judges and the record", () => {
    expect(REQUIRED_MARKERS['judge-arc.txt']).toEqual(['WEAVE:', TRUTH_MATERIAL.record]);
  });

  it('the article judge is marked by the settled weave and the map it reads (brief 4.7a), the article and the record', () => {
    expect(REQUIRED_MARKERS['judge-article.txt']).toEqual([TRUTH_MATERIAL.weave, TRUTH_MATERIAL.map.trim(), 'CONTENT BUNDLE:', TRUTH_MATERIAL.record]);
  });
});

describe("4.11: each judge's render carries its markers", () => {
  const calls = loadCallModules((p) => require(path.join(REPO, p)));
  const FILES = { arcs: 'judge-arc.txt', article: 'judge-article.txt' };

  it.each(['arcs', 'article'])('%s, on a thread holding a weave and a map', async (phase) => {
    const judge = await renderJudge(calls, reworkFixtureState('journalist'), phase);
    expect(renderProblems(FILES[phase], judge.systemPrompt, judge.userPrompt, REQUIRED_MARKERS[FILES[phase]])).toEqual([]);
  });

  it("the article judge's render without the map, or without the settled weave, fails its markers", async () => {
    const judge = await renderJudge(calls, reworkFixtureState('journalist'), 'article');
    const withoutMap = judge.userPrompt.replace(/^MAP:$/m, 'THE MAP:');
    const withoutWeave = judge.userPrompt.replace(/^<SETTLED_WEAVE>/m, 'SETTLED WEAVE');
    expect(renderProblems('judge-article.txt', judge.systemPrompt, withoutMap, REQUIRED_MARKERS['judge-article.txt']))
      .toEqual(['judge-article.txt: missing its marker "MAP:" (no line opens with it)']);
    expect(renderProblems('judge-article.txt', judge.systemPrompt, withoutWeave, REQUIRED_MARKERS['judge-article.txt']))
      .toEqual(['judge-article.txt: missing its marker "<SETTLED_WEAVE>" (no line opens with it)']);
  });
});

describe('4.11: the script renders every call, and checks every marker, from a stored thread', () => {
  let dir;
  let dbPath;

  /** Write `values` as thread `id` with the real checkpointer, as the server stores a thread. */
  async function store(id, values) {
    const saver = SqliteSaver.fromConnString(dbPath);
    const graph = createReportGraphWithCheckpointer(saver);
    await graph.updateState({ configurable: { thread_id: id } }, values, 'checkpointArticle');
    saver.db.close();
  }

  /** Run the script on thread `id`, as the integrator does; its exit code and output. */
  function render(id) {
    const out = path.join(dir, `render-${id}`);
    const run = spawnSync(process.execPath, [SCRIPT, '--session', id, '--db', dbPath, '--out', out], { encoding: 'utf8' });
    return { status: run.status, output: `${run.stdout}\n${run.stderr}`, out };
  }

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-render-markers-'));
    dbPath = path.join(dir, 'copy.sqlite');
    // A thread holding the weave and the map, and one from before phase 4: no weave, the old
    // outline, an article in its old shape. The script plants the fixed weave and map for it.
    await store('1004112', { ...reworkFixtureState('journalist'), contentBundle: clone(PREVIOUS_BUNDLE) });
    const { weave: _w, _weaveBaseline: _b, ...old } = reworkFixtureState('journalist');
    await store('1004113', {
      ...old, weave: null, outline: { lede: { hook: 'An old hook.' }, theStory: { arcs: [] }, writerQuestions: [] },
      _mapBaseline: null, _outlineHandEdits: null, contentBundle: { ...clone(PREVIOUS_BUNDLE), writerQuestions: [] }
    });
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it.each([
    ['a thread holding the weave and the map', '1004112'],
    ['a thread from before phase 4, with the fixed weave and map planted', '1004113']
  ])('%s: every file written, every marker found (exit 0)', (_name, id) => {
    const run = render(id);
    expect(run.output).not.toMatch(/FAIL/);
    expect(run.status).toBe(0);
    RENDERS.forEach((file) => {
      const text = fs.readFileSync(path.join(run.out, file), 'utf8');
      REQUIRED_MARKERS[file].forEach((marker) => {
        expect(`${file} ${marker}: ${text.split('\n').some((line) => line.startsWith(marker))}`).toBe(`${file} ${marker}: true`);
      });
    });
  }, 60000);
});

describe('4.11: --compare is retired; --sections serves', () => {
  it('--compare exits 2, naming --sections', () => {
    const run = spawnSync(process.execPath, [SCRIPT, '--compare', os.tmpdir(), os.tmpdir()], { encoding: 'utf8' });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/--compare is retired/);
    expect(run.stderr).toMatch(/--sections <dirA> <dirB>/);
  });

  it('--sections still reports two render directories, and exits 0', () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-sections-a-'));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-sections-b-'));
    fs.writeFileSync(path.join(a, 'judge-arc.txt'), '===== SYSTEM =====\nS\n\n===== USER =====\nWEAVE:\n{}\n');
    fs.writeFileSync(path.join(b, 'judge-arc.txt'), '===== SYSTEM =====\nS\n\n===== USER =====\nWEAVE:\n{"x":1}\n');
    const report = execFileSync(process.execPath, [SCRIPT, '--sections', a, b], { encoding: 'utf8' });
    expect(report).toMatch(/== judge-arc\.txt: 1 section\(s\) differ/);
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  });

  it("the script's header lists no --compare", () => {
    const header = fs.readFileSync(SCRIPT, 'utf8').split("'use strict';")[0];
    expect(header).not.toMatch(/--compare <dirA>/);
    expect(header).toMatch(/--sections <dirA> <dirB>/);
  });
});
