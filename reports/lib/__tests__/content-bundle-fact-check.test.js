/**
 * factCheckContentBundle — the checks nobody was running
 * (BASELINE.md §4 classes 1, 2, 5, 7 + §6(b))
 *
 * Measured across the last five real sessions:
 *  - class 1, the highest-cost class in the set (15 items, 4/5 sessions):
 *    evidence cards carrying INVENTED text under real token IDs. No evaluator
 *    criterion, no code check — "invisible to the pipeline".
 *  - class 2 (27 items) roster-coverage gaps and class 7 (9 items) invalid photo
 *    references WERE flagged, as advisories, and shipped anyway.
 *  - class 6: both remote sessions were written as on-site.
 *  - §6(b): the model copied an illustrative card string out of formatting.md
 *    ("The job is yours") into a real card.
 *
 * All four are string checks. This module is pure: no LLM, no I/O.
 */

const { factCheckContentBundle } = require('../content-bundle-fact-check');

const TOKEN_TEXT =
  'You are standing by the bar when Vic leans in. The job is already decided, she says, ' +
  'and nobody in that room gets a say. You write the number down twice because your hand shakes.';

const PAPER_TEXT =
  'CEASE AND DESIST. You are hereby directed to halt all use of the PT-3B compound pending review.';

function baseArgs(overrides = {}) {
  return {
    contentBundle: { sections: [], evidenceCards: [] },
    arcEvidencePackages: [{
      arcId: 'arc-1',
      evidenceItems: [
        { id: 'vic001', type: 'memory', owner: 'Vic Kingsley', fullContent: TOKEN_TEXT },
        { id: 'paper-1', type: 'paper', fullContent: PAPER_TEXT }
      ]
    }],
    evidenceBundle: { exposed: { tokens: [], paperEvidence: [] } },
    roster: [],
    sessionPhotos: [],
    reportingMode: 'on-site',
    ...overrides
  };
}

const card = (over = {}) => ({
  tokenId: 'vic001', headline: 'The Offer', content: TOKEN_TEXT,
  owner: 'Vic Kingsley', significance: 'critical', placement: 'sidebar', ...over
});

describe('card fidelity (class 1)', () => {
  it('(a) accepts a card whose content is the source text', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: { sections: [], evidenceCards: [card()] }
    }));
    expect(result.cardFidelity).toEqual([{ tokenId: 'vic001', ok: true, reason: null }]);
    expect(result.structuralIssues).toEqual([]);
  });

  it('(a) tolerates curly quotes, case and re-wrapped whitespace', () => {
    const retyped = TOKEN_TEXT
      .replace(/'/g, '\u2019')
      .replace(/\. /g, '.\n   ')
      .toUpperCase();
    const result = factCheckContentBundle(baseArgs({
      contentBundle: { sections: [], evidenceCards: [card({ content: retyped })] }
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });

  it('(a) tolerates the prompt-mandated "id - timestamp -" prefix', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: { sections: [], evidenceCards: [card({ content: `vic001 - 21:40 - ${TOKEN_TEXT}` })] }
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });

  it('(a) tolerates quoting two non-adjacent sentences', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [],
        evidenceCards: [card({
          content: 'You are standing by the bar when Vic leans in. You write the number down twice because your hand shakes.'
        })]
      }
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });

  it('(b) rejects a paraphrase and names the tokenId', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [],
        evidenceCards: [card({
          content: 'Vic told me the job had already been handed out, with the serial numbers filed off.'
        })]
      }
    }));
    expect(result.cardFidelity[0]).toEqual({ tokenId: 'vic001', ok: false, reason: 'not verbatim' });
    expect(result.structuralIssues.join(' ')).toContain('vic001');
    expect(result.structuralIssues.join(' ')).toMatch(/not verbatim/i);
  });

  it('(c) checks an inline evidence-card block the same way', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{
          id: 'the-story', type: 'narrative',
          content: [
            { type: 'paragraph', text: 'They circled each other all morning.' },
            { type: 'evidence-card', tokenId: 'vic001', headline: 'The Offer', content: 'Something I made up entirely about the bar and the number.' }
          ]
        }],
        evidenceCards: []
      }
    }));
    expect(result.cardFidelity).toEqual([{ tokenId: 'vic001', ok: false, reason: 'not verbatim' }]);
    expect(result.structuralIssues.length).toBe(1);
  });

  it('(d) flags a tokenId that matches no token or paper item', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: { sections: [], evidenceCards: [card({ tokenId: 'nope999', content: 'anything at all here' })] }
    }));
    expect(result.cardFidelity[0]).toEqual({ tokenId: 'nope999', ok: false, reason: 'unknown source' });
    expect(result.structuralIssues.join(' ')).toMatch(/unknown source/i);
    expect(result.structuralIssues.join(' ')).toContain('nope999');
  });

  it('(e) checks a paper-evidence card against the paper item text', () => {
    const ok = factCheckContentBundle(baseArgs({
      contentBundle: { sections: [], evidenceCards: [card({ tokenId: 'paper-1', content: PAPER_TEXT })] }
    }));
    expect(ok.cardFidelity[0].ok).toBe(true);

    const bad = factCheckContentBundle(baseArgs({
      contentBundle: { sections: [], evidenceCards: [card({ tokenId: 'paper-1', content: 'A legal letter demanding they stop the drug work.' })] }
    }));
    expect(bad.cardFidelity[0].ok).toBe(false);
  });

  it('(e) reads the description/text field chain when fullContent is absent', () => {
    const result = factCheckContentBundle(baseArgs({
      arcEvidencePackages: [],
      evidenceBundle: {
        exposed: {
          tokens: [],
          paperEvidence: [{ id: 'paper-2', description: PAPER_TEXT }]
        }
      },
      contentBundle: { sections: [], evidenceCards: [card({ tokenId: 'paper-2', content: PAPER_TEXT })] }
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });

  it('never treats the source SUMMARY as quotable (that is the fabrication)', () => {
    const result = factCheckContentBundle(baseArgs({
      arcEvidencePackages: [],
      evidenceBundle: {
        exposed: { tokens: [{ id: 'vic002', summary: 'Vic offers the job before the body is cold.' }], paperEvidence: [] }
      },
      contentBundle: { sections: [], evidenceCards: [card({ tokenId: 'vic002', content: 'Vic offers the job before the body is cold.' })] }
    }));
    expect(result.cardFidelity[0].ok).toBe(false);
  });
});

describe('roster coverage (class 2)', () => {
  const bundleMentioning = (text) => ({
    sections: [{ id: 'the-players', type: 'narrative', content: [{ type: 'paragraph', text }] }],
    evidenceCards: []
  });

  it('(f) lists roster members who never appear in the prose', () => {
    const result = factCheckContentBundle(baseArgs({
      roster: ['Vic', 'Mel'],
      contentBundle: bundleMentioning('Vic never looked up from the ledger.')
    }));
    expect(result.rosterCoverage.missing).toEqual(['Mel']);
    expect(result.structuralIssues.join(' ')).toContain('Mel');
    expect(result.structuralIssues.join(' ')).toMatch(/roster coverage/i);
  });

  it('accepts roster entries as {name} objects', () => {
    const result = factCheckContentBundle(baseArgs({
      roster: [{ name: 'Vic' }, { name: 'Mel' }],
      contentBundle: bundleMentioning('Vic and Mel argued about the ledger.')
    }));
    expect(result.rosterCoverage.missing).toEqual([]);
  });

  it('counts a mention in a headline, a card or a caption', () => {
    const result = factCheckContentBundle(baseArgs({
      roster: ['Vic', 'Mel', 'Ashe'],
      contentBundle: {
        headline: { main: 'Mel Nilsson and the ledger' },
        sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text: 'Vic never looked up.' }] }],
        evidenceCards: [],
        photos: [{ filename: 'a.jpg', caption: 'Ashe waits by the door.' }]
      }
    }));
    expect(result.rosterCoverage.missing).toEqual([]);
  });

  it('matches whole words only (Mel is not covered by "Melody")', () => {
    const result = factCheckContentBundle(baseArgs({
      roster: ['Mel'],
      contentBundle: bundleMentioning('A melody played somewhere behind the bar. Melody is not a person here.')
    }));
    expect(result.rosterCoverage.missing).toEqual(['Mel']);
  });

  it('reports nothing when there is no roster to check', () => {
    const result = factCheckContentBundle(baseArgs({ roster: [] }));
    expect(result.rosterCoverage.missing).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
  });
});

describe('photo references (class 7)', () => {
  it('(g) flags a heroImage filename that is not one of this session\'s photos', () => {
    const result = factCheckContentBundle(baseArgs({
      sessionPhotos: ['/data/071126/photos/aln0711-1.jpg'],
      contentBundle: { sections: [], evidenceCards: [], heroImage: { filename: 'aln0627-3.jpg', caption: 'x' } }
    }));
    expect(result.photoReferences.invalid).toEqual(['aln0627-3.jpg']);
    expect(result.structuralIssues.join(' ')).toMatch(/invalid photo reference/i);
    expect(result.structuralIssues.join(' ')).toContain('aln0627-3.jpg');
  });

  it('(g) flags an inline photo block and a top-level photos entry', () => {
    const result = factCheckContentBundle(baseArgs({
      sessionPhotos: ['/data/071126/photos/aln0711-1.jpg'],
      contentBundle: {
        sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'photo', filename: 'ghost.jpg', caption: 'x' }] }],
        evidenceCards: [],
        photos: [{ filename: 'also-missing.png', caption: 'y' }]
      }
    }));
    expect(result.photoReferences.invalid.sort()).toEqual(['also-missing.png', 'ghost.jpg']);
  });

  it('accepts a reference that matches a session photo basename', () => {
    const result = factCheckContentBundle(baseArgs({
      sessionPhotos: ['/data/071126/photos/aln0711-1.jpg', 'C:\\data\\071126\\photos\\aln0711-2.jpg'],
      contentBundle: {
        sections: [], evidenceCards: [],
        heroImage: { filename: 'aln0711-1.jpg' },
        photos: [{ filename: 'aln0711-2.jpg', caption: 'y' }]
      }
    }));
    expect(result.photoReferences.invalid).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
  });

  it('downgrades to an advisory when state carries no session photos to check against', () => {
    const result = factCheckContentBundle(baseArgs({
      sessionPhotos: [],
      contentBundle: { sections: [], evidenceCards: [], heroImage: { filename: 'whatever.jpg' } }
    }));
    expect(result.structuralIssues).toEqual([]);
    expect(result.advisoryWarnings.join(' ')).toMatch(/could not verify/i);
  });
});

describe('reporter mode (class 6)', () => {
  const prose = (text) => ({
    sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text }] }],
    evidenceCards: []
  });

  it('(h) remote: flags a claim to have been in the room', () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote',
      contentBundle: prose('I was in the room when the vote turned.')
    }));
    expect(result.reporterMode.violations.length).toBe(1);
    expect(result.structuralIssues.join(' ')).toMatch(/reporter-mode violation/i);
  });

  it('(h) remote: flags claiming a memory as the reporter\'s own', () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote',
      contentBundle: prose('Six memories went to the market and one of them was mine.')
    }));
    expect(result.reporterMode.violations.join(' ')).toContain('one of them was mine');
    expect(result.structuralIssues.length).toBe(1);
  });

  it('(h) on-site: Nova never votes', () => {
    ['I voted with them.', 'My vote was the last one cast.', 'One of them was mine.'].forEach((text) => {
      const result = factCheckContentBundle(baseArgs({ reportingMode: 'on-site', contentBundle: prose(text) }));
      expect(result.reporterMode.violations.length).toBe(1);
      expect(result.structuralIssues.length).toBe(1);
    });
  });

  it('(h) on-site: being in the room is NOT a violation', () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'on-site',
      contentBundle: prose('I was in the room when the vote turned.')
    }));
    expect(result.reporterMode.violations).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
  });

  it('defaults to on-site when no mode is supplied', () => {
    const result = factCheckContentBundle({
      contentBundle: prose('I was in the room when the vote turned.')
    });
    expect(result.reporterMode.violations).toEqual([]);
  });
});

describe('leaked prompt examples (§6(b))', () => {
  it('(i) flags the illustrative formatting.md card strings as card content', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [], evidenceCards: [card({
          tokenId: 'vic001',
          content: "The job is yours. The CEO isn't even cold yet."
        })]
      }
    }));
    expect(result.structuralIssues.join(' ')).toMatch(/prompt example leaked/i);
    expect(result.structuralIssues.join(' ')).toContain('vic001');
  });

  it('(i) flags them in a quote block too', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'quote', text: 'The job is yours.', attribution: 'Vic' }] }],
        evidenceCards: []
      }
    }));
    expect(result.structuralIssues.join(' ')).toMatch(/prompt example leaked/i);
  });
});

describe('shape and resilience', () => {
  it('returns the documented shape for an empty bundle', () => {
    const result = factCheckContentBundle({});
    expect(result).toEqual({
      structuralIssues: [],
      advisoryWarnings: [],
      cardFidelity: [],
      rosterCoverage: { missing: [] },
      photoReferences: { invalid: [] },
      reporterMode: { violations: [] }
    });
  });

  it('does not throw on malformed sections/content', () => {
    expect(() => factCheckContentBundle({
      contentBundle: { sections: 'nope', evidenceCards: null, heroImage: 'a-string' },
      roster: [null, 42],
      sessionPhotos: [null],
      arcEvidencePackages: [null, { evidenceItems: null }]
    })).not.toThrow();
  });
});

describe('reporter-mode false positives', () => {
  const prose = (text) => baseArgs({
    reportingMode: 'remote',
    contentBundle: {
      sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text }] }],
      evidenceCards: []
    }
  });

  it('does NOT flag correct remote attribution that mentions the room', () => {
    // "the tip came from inside the room" is exactly what remote mode asks for.
    const result = factCheckContentBundle(prose(
      'The tip came from inside the room, from someone who watched the vote turn.'
    ));
    expect(result.reporterMode.violations).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
  });

  it('does NOT flag third-person prose about people in the room', () => {
    const result = factCheckContentBundle(prose(
      'They were in the room when it happened, and none of them said so afterwards.'
    ));
    expect(result.reporterMode.violations).toEqual([]);
  });
});
