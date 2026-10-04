/**
 * The content-bundle probe's evidence (round 2 item 5). The live run on 2026-09-25 on
 * session 092026 printed "Loaded: 81 tokens, 0 paper items": the probe read the paper
 * file as a bare array or `items` / `paperEvidence`, but fetchPaperEvidence writes
 * `{ evidence, fetchedAt, totalCount }`. And the probe never packaged paper documents at
 * all, so its prompt carried none of what the real article writer gets. No model call
 * here: the loaders are pure, and the prompt is built with the real PromptBuilder.
 *
 * Phase 4 (brief 4.6; R5): the arc packages went, so the probe packages nothing; its
 * record is the documents its synthetic arcs draw on (buildProbeRecord).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  tokensOf, paperEvidenceOf, loadSession, buildProbeRecord, buildProbePrompt, ITEMS_PER_ARC
} = require('../../../scripts/probe-content-bundle-channel');

// Shaped like a current session's fetched/ files (field names only; the text is
// synthetic): tokens carry tokenId + fullDescription, paper documents notionId +
// description; owners are names.
const TOKENS = [
  { notionId: 'n-tok-1', tokenId: 'tst001', name: 'TST001', fullDescription: 'TST.1 - 8:25PM - A texts B: we need to talk now.', summary: 'A texts B', owners: ['Test Owner A'] },
  { notionId: 'n-tok-2', tokenId: 'tst002', name: 'TST002', fullDescription: 'TST.2 - 9:10PM - B never signed the papers.', summary: 'B unsigned', owners: ['Test Owner B'] }
];
const PAPER = [
  { notionId: 'paper-0000-0000-0000-000000000001', name: 'Test letter (unlocked)', basicType: 'Document', description: 'A letter about a meeting at the warehouse.', owners: [] },
  { notionId: 'paper-0000-0000-0000-000000000002', name: 'Test email (locked)', basicType: 'Document', description: 'To: someone@example.com - you will regret this.', owners: ['Test Owner C'] },
  { notionId: 'paper-0000-0000-0000-000000000003', name: 'Blank page', basicType: 'Prop', description: '', owners: [] }
];

let logSpy;
beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => logSpy.mockRestore());

describe('paperEvidenceOf', () => {
  test('reads `evidence`, the shape fetchPaperEvidence writes', () => {
    expect(paperEvidenceOf({ evidence: PAPER, fetchedAt: '2026-09-20T00:00:00Z', totalCount: 3 })).toBe(PAPER);
  });

  test('keeps the older shapes working: a bare array, `items`, `paperEvidence`', () => {
    expect(paperEvidenceOf(PAPER)).toBe(PAPER);
    expect(paperEvidenceOf({ items: PAPER })).toBe(PAPER);
    expect(paperEvidenceOf({ paperEvidence: PAPER })).toBe(PAPER);
  });

  test('an empty list is a session with no paper, not an error', () => {
    expect(paperEvidenceOf({ evidence: [], totalCount: 0 })).toEqual([]);
  });

  test('a file with no evidence list throws instead of reading as 0 paper items', () => {
    expect(() => paperEvidenceOf({ documents: PAPER })).toThrow(/paper-evidence\.json holds no evidence list/);
    expect(() => paperEvidenceOf(null)).toThrow(/no evidence list/);
  });
});

describe('tokensOf', () => {
  test('reads `tokens`, and a bare array', () => {
    expect(tokensOf({ tokens: TOKENS, fetchedAt: 'x', totalCount: 2 })).toBe(TOKENS);
    expect(tokensOf(TOKENS)).toBe(TOKENS);
  });

  test('a file with no token list throws', () => {
    expect(() => tokensOf({ items: TOKENS })).toThrow(/tokens\.json holds no token list/);
  });
});

describe('loadSession', () => {
  test('loads the paper documents from a session laid out as the pipeline writes it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-session-'));
    try {
      fs.mkdirSync(path.join(dir, 'inputs'));
      fs.mkdirSync(path.join(dir, 'fetched'));
      fs.writeFileSync(path.join(dir, 'inputs', 'session-config.json'), JSON.stringify({ roster: ['Sam', 'Quinn'] }));
      fs.writeFileSync(path.join(dir, 'inputs', 'director-notes.json'), JSON.stringify({ observations: {} }));
      fs.writeFileSync(path.join(dir, 'fetched', 'tokens.json'), JSON.stringify({ tokens: TOKENS, fetchedAt: 'x', totalCount: 2 }));
      fs.writeFileSync(path.join(dir, 'fetched', 'paper-evidence.json'), JSON.stringify({ evidence: PAPER, fetchedAt: 'x', totalCount: 3 }));

      const session = loadSession(dir);
      expect(session.tokens).toHaveLength(2);
      expect(session.paperEvidence).toHaveLength(3);
      expect(session.sessionConfig.roster).toEqual(['Sam', 'Quinn']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildProbeRecord (phase 4, brief 4.6: the packages went)', () => {
  test("the record holds the paper documents and memory tokens the synthetic arcs draw on", () => {
    const { evidenceBundle, arcDocuments } = buildProbeRecord({ tokens: TOKENS, paperEvidence: PAPER });

    expect(arcDocuments.map((ids) => ids.length)).toEqual(ITEMS_PER_ARC);
    // The pool alternates paper and tokens, by their ids in the record view, and skips
    // the document with no text.
    expect(arcDocuments[0].slice(0, 4)).toEqual([PAPER[0].notionId, 'tst001', PAPER[1].notionId, 'tst002']);
    expect(arcDocuments.flat()).not.toContain(PAPER[2].notionId);
    expect(evidenceBundle.exposed.tokens).toEqual(TOKENS);
    expect(evidenceBundle.exposed.paperEvidence).toEqual([PAPER[0], PAPER[1]]);
  });

  test('a session with no text anywhere fails loudly', () => {
    expect(() => buildProbeRecord({ tokens: [], paperEvidence: [PAPER[2]] }))
      .toThrow(/no memory token or paper document with any text/);
  });
});

describe('buildProbePrompt', () => {
  test('the article prompt carries the paper documents', async () => {
    const { userPrompt, evidenceBundle } = await buildProbePrompt({
      sessionId: '092026',
      sessionConfig: { roster: ['Sam', 'Quinn'], accusation: { accused: ['Sam'] } },
      directorNotes: { observations: {} },
      tokens: TOKENS,
      paperEvidence: PAPER
    });

    expect(evidenceBundle.exposed.paperEvidence).toHaveLength(2);
    // Brief 2.1: each document once, in full, in <RECORD>.
    expect(userPrompt).toContain(
      `<document id="${PAPER[0].notionId}" kind="Document" name="Test letter (unlocked)" layer="exposed">\n${PAPER[0].description}\n</document>`);
    expect(userPrompt).toContain(
      `<document id="${PAPER[1].notionId}" kind="Document" name="Test email (locked)" owner="Test Owner C" layer="exposed">\n${PAPER[1].description}\n</document>`);
    expect(userPrompt).toContain(
      `<document id="tst001" kind="memory" name="TST001" owner="Test Owner A" layer="exposed">\n${TOKENS[0].fullDescription}\n</document>`);
    expect(userPrompt.split(PAPER[0].description).length - 1).toBe(1);
    expect(userPrompt).not.toContain('ARC EVIDENCE PACKAGES');
    // The blank page is cited by no arc, so it is not in the probe's record.
    expect(userPrompt).not.toContain(PAPER[2].notionId);
  });

  // The 4b fix batch (3.9 review minor 1): since 3.9 the article writer lists its photos
  // under PHOTOS (options.photos, from articleWriterInputs). The probe passed no photos, so
  // its prompt printed "PHOTOS: none", while its outline placed photos and its HERO IMAGE
  // named one. Its photos now come from the writer's own inputs, so its prompt is the
  // writer's. Phase 4 (brief 4.6): one photo per synthetic arc, with no package to name it.
  test("the article prompt lists the writer's photos, from articleWriterInputs: the hero, then each arc's photo once", async () => {
    const { userPrompt } = await buildProbePrompt({
      sessionId: '092026',
      sessionConfig: { roster: ['Sam', 'Quinn'], accusation: { accused: ['Sam'] } },
      directorNotes: { observations: {} },
      tokens: TOKENS,
      paperEvidence: PAPER
    });

    expect(userPrompt).not.toContain('PHOTOS: none');
    expect(userPrompt).toContain('PHOTOS (every photo the director has not excluded, without the whiteboard: the hero image, then the rest;');
    expect(userPrompt).toContain('1. [hero image] aln0509 (10 of 10).jpg: Sam, Quinn');
    ITEMS_PER_ARC.forEach((_, arcIdx) => {
      const filename = `aln0509 (${arcIdx + 1} of 10).jpg`;
      expect(userPrompt).toContain(`${arcIdx + 2}. ${filename}: Sam, Quinn`);
      expect(userPrompt.split(`${filename}: Sam, Quinn`).length - 1).toBe(1);
    });
    expect(userPrompt).not.toContain('ARC PHOTOS:');
  });
});
