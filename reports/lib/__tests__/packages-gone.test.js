/**
 * The arc packages go, whole (phase 4, brief 4.6; R5).
 *
 * The packages repeated the record in cuts per arc, with the phase 2 risk of a cut that
 * hides a document. The map writer reads the record whole, and the beats name the
 * material, so nothing builds a package any more: no node, no channel, no section in the
 * outline's or the article writer's prompt, no element in the article writer's inputs.
 * The fact check's card sources come from the record alone, and every source a package
 * could supply is still found there: a package resolved its document by the token's id or
 * tokenId, or the paper's id, notionId, pageId or name, and the record's source map
 * answers to each of them.
 *
 * Invented text: the repo is public.
 */
const { ReportStateAnnotation, getDefaultState, PHASES } = require('../workflow/state');
const { _testing: { createGraphBuilder } } = require('../workflow/graph');
const nodes = require('../workflow/nodes');
const aiNodes = require('../workflow/nodes/ai-nodes');
const { factCheckContentBundle, _testing: { buildSourceMap } } = require('../content-bundle-fact-check');
const { buildFactCheckArgs } = require('../workflow/nodes/evaluator-nodes')._testing;
const { renderWriters } = require('./fixtures/render-writers');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');

const TOKEN_TEXT = 'You hold the ledger page up to the light, and the second column is in Riley\'s hand.';
const LETTER_TEXT = 'Dear Marcus, the patents were never yours to sell, and the board will hear of it.';
const PAGE_TEXT = 'Minutes of the board meeting: the vote to remove the founder failed by one.';
const RESCUED_TEXT = 'A receipt for two plane tickets, paid in cash the morning after the party.';

/** A record whose documents answer to every id a package resolved them by. */
const EVIDENCE_BUNDLE = {
  exposed: {
    tokens: [{ id: 'tok-1', tokenId: 'rly004', fullContent: TOKEN_TEXT, content: TOKEN_TEXT }],
    paperEvidence: [
      { id: 'p-1', notionId: 'n-1', name: 'The letter', description: LETTER_TEXT },
      { id: 'p-2', pageId: 'pg-2', name: 'Board minutes', description: PAGE_TEXT },
      { notionId: 'n-3', name: 'Rescued receipt', description: RESCUED_TEXT, rescuedByHuman: true }
    ]
  }
};

/**
 * Each id a package could cite a document by, with that document's text: the token's id
 * and tokenId; each paper's id, notionId, pageId and name (ai-nodes.js
 * buildArcEvidencePackages, before it went).
 */
const PACKAGE_SOURCES = [
  ['tok-1', TOKEN_TEXT], ['rly004', TOKEN_TEXT],
  ['p-1', LETTER_TEXT], ['n-1', LETTER_TEXT], ['The letter', LETTER_TEXT],
  ['p-2', PAGE_TEXT], ['pg-2', PAGE_TEXT], ['Board minutes', PAGE_TEXT],
  ['n-3', RESCUED_TEXT], ['Rescued receipt', RESCUED_TEXT]
];

describe('4.6: the arc packages are gone (R5)', () => {
  it('the graph builds no packages: the photo branch joins the map writer directly', () => {
    const graph = createGraphBuilder().compile();
    const edges = graph.getGraph().edges.map((e) => [e.source, e.target]);
    expect(Object.keys(graph.getGraph().nodes)).not.toContain('buildArcEvidencePackages');
    expect(edges).toContainEqual(['finalizePhotoAnalyses', 'generateOutline']);
    expect(nodes.buildArcEvidencePackages).toBeUndefined();
    expect(aiNodes.buildArcEvidencePackages).toBeUndefined();
  });

  it('no channel holds packages, and no phase builds them', () => {
    expect(Object.keys(ReportStateAnnotation.spec)).not.toContain('arcEvidencePackages');
    expect(getDefaultState()).not.toHaveProperty('arcEvidencePackages');
    expect(PHASES).not.toHaveProperty('BUILD_ARC_PACKAGES');
  });

  it("the article writer's inputs carry no package element, and its prompt no package section, for either theme", async () => {
    const inputs = aiNodes.articleWriterInputs({ theme: 'journalist', outline: { headline: 'x' }, sessionPhotos: [] });
    // [settledWeave, map, shellAccounts, sessionFacts, directorNotes, narrativeTensions, options]
    // (brief 4.7b: the settled weave, then the map, in place of the outline and the hero)
    expect(inputs).toHaveLength(7);
    expect(inputs[1]).toEqual({ headline: 'x' });

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const rendered = await renderWriters((p) => require(path.join(REPO, p)));
      for (const [name, text] of Object.entries(rendered)) {
        expect(`${name}: ${text.includes('ARC EVIDENCE PACKAGES')}`).toBe(`${name}: false`);
        expect(`${name}: ${text.includes('<arc-evidence>')}`).toBe(`${name}: false`);
        expect(`${name}: ${text.includes('<evidence-context>')}`).toBe(`${name}: false`);
        expect(`${name}: ${text.includes('QUOTABLE EXCERPTS')}`).toBe(`${name}: false`);
      }
    } finally {
      jest.restoreAllMocks();
    }
  });

  it("the fact check's card sources come from the record alone: every source a package supplied is still found, with its text", () => {
    const sources = buildSourceMap(EVIDENCE_BUNDLE);
    for (const [id, text] of PACKAGE_SOURCES) {
      expect(`${id}: ${sources.get(id)}`).toBe(`${id}: ${text}`);
    }
    const result = factCheckContentBundle({
      contentBundle: {
        sections: [{
          id: 'the-story', type: 'narrative',
          content: PACKAGE_SOURCES.map(([id, text]) => ({ type: 'evidence-card', tokenId: id, headline: 'A card', content: text }))
        }]
      },
      evidenceBundle: EVIDENCE_BUNDLE,
      roster: [],
      sessionPhotos: []
    });
    expect(result.cardFidelity.map((c) => [c.tokenId, c.ok])).toEqual(PACKAGE_SOURCES.map(([id]) => [id, true]));
    expect(result.structuralIssues).toEqual([]);
  });

  it("the fact check's arguments carry no packages", () => {
    const args = buildFactCheckArgs({ ...getDefaultState(), contentBundle: { sections: [] }, evidenceBundle: EVIDENCE_BUNDLE });
    expect(args).not.toHaveProperty('arcEvidencePackages');
    expect(args.evidenceBundle).toBe(EVIDENCE_BUNDLE);
  });

  it('the content-bundle probe packages nothing', () => {
    const probe = require('../../scripts/probe-content-bundle-channel');
    expect(probe.buildProbePackages).toBeUndefined();
  });
});
