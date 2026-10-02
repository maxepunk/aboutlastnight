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

// An inline evidence card: the block that prints its content, and so the one the
// fidelity check reads. A sidebar entry (`card()` above) prints only its headline
// and summary (slice 2.5).
const inlineCard = (over = {}) => ({
  type: 'evidence-card', tokenId: 'vic001', headline: 'The Offer', content: TOKEN_TEXT,
  owner: 'Vic Kingsley', significance: 'critical', ...over
});

/** A bundle whose one section, "the-story", holds these blocks. */
const storyWith = (...blocks) => ({
  sections: [{ id: 'the-story', type: 'narrative', content: blocks }],
  evidenceCards: []
});

const IN_STORY = [{ placement: 'inline', section: 'the-story' }];

describe('card fidelity (class 1)', () => {
  it('(a) accepts a card whose content is the source text', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard())
    }));
    expect(result.cardFidelity).toEqual([{ tokenId: 'vic001', ok: true, reason: null, locations: IN_STORY }]);
    expect(result.structuralIssues).toEqual([]);
  });

  it('(a) tolerates curly quotes, case and re-wrapped whitespace', () => {
    const retyped = TOKEN_TEXT
      .replace(/'/g, '\u2019')
      .replace(/\. /g, '.\n   ')
      .toUpperCase();
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ content: retyped }))
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });

  it('(a) tolerates the prompt-mandated "id - timestamp -" prefix', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ content: `vic001 - 21:40 - ${TOKEN_TEXT}` }))
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });

  it('(a) tolerates quoting two non-adjacent sentences', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({
        content: 'You are standing by the bar when Vic leans in. You write the number down twice because your hand shakes.'
      }))
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });

  it('(b) rejects a paraphrase and names the tokenId', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({
        content: 'Vic told me the job had already been handed out, with the serial numbers filed off.'
      }))
    }));
    expect(result.cardFidelity[0]).toEqual({ tokenId: 'vic001', ok: false, reason: 'not verbatim', locations: IN_STORY });
    expect(result.structuralIssues.join(' ')).toContain('vic001');
    expect(result.structuralIssues.join(' ')).toMatch(/not verbatim/i);
  });

  it('(c) checks an inline evidence-card block beside the prose', () => {
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
    expect(result.cardFidelity).toEqual([{ tokenId: 'vic001', ok: false, reason: 'not verbatim', locations: IN_STORY }]);
    expect(result.structuralIssues.length).toBe(1);
  });

  it('(d) flags a tokenId that matches no token or paper item', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ tokenId: 'nope999', content: 'anything at all here' }))
    }));
    expect(result.cardFidelity[0]).toEqual({ tokenId: 'nope999', ok: false, reason: 'unknown source', locations: IN_STORY });
    expect(result.structuralIssues.join(' ')).toMatch(/unknown source/i);
    expect(result.structuralIssues.join(' ')).toContain('nope999');
  });

  it('(e) checks a paper-evidence card against the paper item text', () => {
    const ok = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ tokenId: 'paper-1', content: PAPER_TEXT }))
    }));
    expect(ok.cardFidelity[0].ok).toBe(true);

    const bad = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ tokenId: 'paper-1', content: 'A legal letter demanding they stop the drug work.' }))
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
      contentBundle: storyWith(inlineCard({ tokenId: 'paper-2', content: PAPER_TEXT }))
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });

  it('never treats the source SUMMARY as quotable (that is the fabrication)', () => {
    const result = factCheckContentBundle(baseArgs({
      arcEvidencePackages: [],
      evidenceBundle: {
        exposed: { tokens: [{ id: 'vic002', summary: 'Vic offers the job before the body is cold.' }], paperEvidence: [] }
      },
      contentBundle: storyWith(inlineCard({ tokenId: 'vic002', content: 'Vic offers the job before the body is cold.' }))
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
    // The caption is a photo BLOCK's, which prints. A top-level `photos` caption
    // never prints and no longer counts (slice 2.5; see "printed text only" below).
    const result = factCheckContentBundle(baseArgs({
      roster: ['Vic', 'Mel', 'Ashe', 'Kai'],
      contentBundle: {
        headline: { main: 'Mel Nilsson and the ledger' },
        sections: [{
          id: 'lede',
          type: 'narrative',
          content: [
            { type: 'paragraph', text: 'Vic never looked up.' },
            { type: 'photo', filename: 'a.jpg', caption: 'Ashe waits by the door.' },
            inlineCard({ headline: 'What Kai kept' })
          ]
        }],
        evidenceCards: []
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

  // Phase 3 (3.4, HY1): the top-level `photos` list never prints, so the check no
  // longer reads it; an inline photo block and the hero do print.
  it('(g) flags an inline photo block, and never reads the top-level photos list, which does not print', () => {
    const result = factCheckContentBundle(baseArgs({
      sessionPhotos: ['/data/071126/photos/aln0711-1.jpg'],
      contentBundle: {
        sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'photo', filename: 'ghost.jpg', caption: 'x' }] }],
        evidenceCards: [],
        photos: [{ filename: 'also-missing.png', caption: 'y' }]
      }
    }));
    expect(result.photoReferences.invalid).toEqual(['ghost.jpg']);
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
  // I2(b): ADVISORY, not structural. A structural issue skips the Opus evaluation
  // and spends one of three paid article revisions, and this guard fires on a
  // two-word substring match: "the job is yours" is a sentence a session could
  // legitimately produce. The placeholders that replaced the examples in the prompt
  // files cannot leak any more, so the guard is now a note to the director rather
  // than a reason to rewrite an article. See FACT_CHECK_ADVISORY_ONLY.
  it('(i) reports the illustrative formatting.md card strings as an advisory', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({
        tokenId: 'vic001',
        content: "The job is yours. The CEO isn't even cold yet."
      }))
    }));
    expect(result.advisoryWarnings.join(' ')).toMatch(/prompt example leaked/i);
    expect(result.advisoryWarnings.join(' ')).toContain('vic001');
    expect(result.structuralIssues.join(' ')).not.toMatch(/prompt example leaked/i);
  });

  it('(i) reports them in a quote block too, also as an advisory', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'quote', text: 'The job is yours.', attribution: 'Vic' }] }],
        evidenceCards: []
      }
    }));
    expect(result.advisoryWarnings.join(' ')).toMatch(/prompt example leaked/i);
    expect(result.structuralIssues).toEqual([]);
  });

  it('keeps the message prefix stable, so the console keeps grouping it', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'quote', text: 'The job is yours.' }] }],
        evidenceCards: []
      }
    }));
    expect(result.advisoryWarnings[0]).toMatch(/^Prompt example leaked into /);
  });
});

describe('advisory-only checks (I2b)', () => {
  // The two checks that are NOT calibrated on a live run yet. Both are string
  // heuristics that can fire on correct prose, and a structural verdict costs an
  // Opus revision (three per article, all payable), so until a session's worth of
  // data says otherwise they inform the director and nothing else.
  const { FACT_CHECK_ADVISORY_ONLY } = require('../content-bundle-fact-check');

  it('names exactly the uncalibrated checks', () => {
    // 'repeatedAbsence' joined in phase 2 (2.6): a phrase count with no live session behind it.
    // Phase 3 (3.4) added five code checks, each advisory until a live session shows it right.
    expect(FACT_CHECK_ADVISORY_ONLY).toEqual([
      'npcPronouns', 'leakedExample', 'repeatedAbsence', 'emDash', 'productionWords', 'novaPronoun', 'length', 'headCount'
    ]);
  });

  it('reports an NPC pronoun contradiction as an advisory, not a structural failure', () => {
    // Phase 3 (3.4): the check reads the theme's NPC entries (`npcs`), so it can also
    // scan an NPC with no declared pronoun (Blake).
    const result = factCheckContentBundle(baseArgs({
      npcs: [{ name: 'Marcus', fullName: 'Marcus Blackwood', pronouns: 'he/him' }],
      contentBundle: {
        sections: [{
          id: 'lede',
          type: 'narrative',
          content: [{ type: 'paragraph', text: 'Marcus signed their own name to the transfer.' }]
        }],
        evidenceCards: []
      }
    }));
    expect(result.advisoryWarnings.join(' ')).toMatch(/^Pronoun error: Marcus takes he\/him/);
    expect(result.structuralIssues).toEqual([]);
  });

  it('still keeps card fidelity, unknown sources, roster coverage, photos and narrator reporter mode structural', () => {
    const result = factCheckContentBundle(baseArgs({
      roster: ['Mel'],
      sessionPhotos: ['a.jpg'],
      reportingMode: 'remote',
      contentBundle: {
        sections: [{
          id: 'lede',
          type: 'narrative',
          content: [
            { type: 'paragraph', text: 'I was in the room when the vote turned.' },
            { type: 'photo', filename: 'not-ours.jpg', caption: 'x' },
            inlineCard({ tokenId: 'vic001', content: 'A sentence that appears nowhere in the source text at all.' }),
            { type: 'paragraph', text: 'Nobody asked where the second card came from.' },
            inlineCard({ tokenId: 'nope999', content: 'Whatever this is, no session item carries that id.' })
          ]
        }],
        evidenceCards: []
      }
    }));
    const joined = result.structuralIssues.join(' ');
    expect(joined).toMatch(/not verbatim/i);
    expect(joined).toMatch(/unknown source/i);
    expect(joined).toMatch(/roster coverage gap/i);
    expect(joined).toMatch(/invalid photo reference/i);
    expect(joined).toMatch(/reporter-mode violation/i);
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

describe('reporter mode reads NARRATOR text only (I2a)', () => {
  // The scan read `visibleText`, which is deliberately generous (it exists for
  // roster coverage: headline, captions, card text and pull quotes all count as
  // "the reader can see this name"). Run over reporter-mode phrases instead, that
  // generosity makes a CORRECTLY attributed player quote a structural failure —
  // "I voted for Vic" is what a player says, and the reporter quoting them is the
  // article doing its job. A structural failure skips the Opus evaluation and
  // spends one of three paid revisions instructing a reviser to break correct text.
  const withBlocks = (content, over = {}) => baseArgs({
    contentBundle: { sections: [{ id: 'lede', type: 'narrative', content }], evidenceCards: [], ...over },
    ...(over.reportingMode ? { reportingMode: over.reportingMode } : {})
  });

  it('does NOT flag a quote block in which a player says they voted', () => {
    const result = factCheckContentBundle(withBlocks([
      { type: 'quote', text: 'I voted for Vic, and I would do it again.', attribution: 'Mel Reyes' }
    ]));
    expect(result.reporterMode.violations).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
  });

  it('DOES flag the same claim in a narrator paragraph', () => {
    const result = factCheckContentBundle(withBlocks([
      { type: 'paragraph', text: 'Six memories went to the market and one of them was mine.' }
    ]));
    expect(result.reporterMode.violations).toContain('one of them was mine');
    expect(result.structuralIssues.join(' ')).toMatch(/reporter-mode violation/i);
  });

  it('DOES flag it in the headline, kicker or deck (all narrator)', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        headline: { main: 'The night I voted with them', kicker: 'k', deck: 'd' },
        sections: [],
        evidenceCards: []
      }
    }));
    expect(result.reporterMode.violations).toContain('i voted');
  });

  it('does NOT flag evidence-card content that quotes a memory in first person', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ content: 'My vote was already promised before I walked in.' }))
    }));
    expect(result.reporterMode.violations).toEqual([]);
  });

  it('does NOT flag a photo caption or a pull quote', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{ id: 's', type: 'narrative', content: [{ type: 'photo', filename: 'a.jpg', caption: 'I voted, Mel said afterwards' }] }],
        photos: [{ filename: 'a.jpg', caption: 'My vote is on that board' }],
        pullQuotes: [{ text: 'I was in the room', attribution: 'Mel' }],
        evidenceCards: []
      },
      sessionPhotos: ['a.jpg'],
      reportingMode: 'remote'
    }));
    expect(result.reporterMode.violations).toEqual([]);
  });

  it('still reads every narrator paragraph, not just the first', () => {
    const result = factCheckContentBundle(withBlocks([
      { type: 'paragraph', text: 'The vote came down in the second hour.' },
      { type: 'quote', text: 'I voted the way I had to.', attribution: 'Mel' },
      { type: 'paragraph', text: 'My vote would not have changed the arithmetic.' }
    ]));
    expect(result.reporterMode.violations).toContain('my vote');
    expect(result.reporterMode.violations).not.toContain('i voted');
  });

  it('keeps roster coverage generous: a name only in a caption still counts', () => {
    // The two scans read DIFFERENT text on purpose. Coverage must not narrow with
    // reporter mode, or an article that names someone in a caption gets sent back.
    const result = factCheckContentBundle(baseArgs({
      roster: ['Mel'],
      contentBundle: {
        sections: [{ id: 's', type: 'narrative', content: [{ type: 'photo', filename: 'a.jpg', caption: 'Mel at the whiteboard' }] }],
        evidenceCards: []
      },
      sessionPhotos: ['a.jpg']
    }));
    expect(result.rosterCoverage.missing).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
  });
});

describe('ellipsis normalisation', () => {
  // The source elides with three dots; a model retyping it commonly produces the
  // single U+2026 character. Before `normalize` folded it, the two spellings got
  // OPPOSITE verdicts on identical content.
  const SOURCE = 'You are standing by the bar when Vic leans in and says the job is already decided...';

  const verdictFor = (cardContent) => factCheckContentBundle(baseArgs({
    arcEvidencePackages: [{ arcId: 'a1', evidenceItems: [{ id: 'vic001', fullContent: SOURCE }] }],
    contentBundle: storyWith(inlineCard({ tokenId: 'vic001', content: cardContent }))
  })).cardFidelity[0];

  it('gives the same verdict whether the card elides with … or with ...', () => {
    const withDots = verdictFor(SOURCE);
    const withChar = verdictFor(SOURCE.replace('...', '…'));
    expect(withDots.ok).toBe(true);
    expect(withChar).toEqual(withDots);
  });

  it('folds the character in the other direction too', () => {
    const unicodeSource = 'You are standing by the bar when Vic leans in and says the job is already decided…';
    const result = factCheckContentBundle(baseArgs({
      arcEvidencePackages: [{ arcId: 'a1', evidenceItems: [{ id: 'vic001', fullContent: unicodeSource }] }],
      contentBundle: storyWith(inlineCard({ tokenId: 'vic001', content: SOURCE }))
    }));
    expect(result.cardFidelity[0].ok).toBe(true);
  });
});

describe('the remote reporter-mode message follows the remote mode block (phase 2, 2.6)', () => {
  // Phase 3 (3.4): exposed memories reach Nova by turn-in (spec T6, T8; plan review I6).
  // The line used to send every exposure through "the people who told you", which pushes
  // a rework to name or invent exposers.
  // Phase 3 (3.9): a rework reads this line as must-fix, so it says what mode-remote says
  // since round 7 (R13): Nova never claims to have seen or heard the room, and the event
  // is told as a scene, attributed where it matters. It no longer sends every room event
  // through an attribution.
  it('keeps its prefix and tells the rework to tell the event as a scene, attributed where it matters', () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote',
      contentBundle: {
        sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text: 'I was in the room when the vote turned.' }] }],
        evidenceCards: []
      }
    }));
    expect(result.structuralIssues).toHaveLength(1);
    const [message] = result.structuralIssues;
    // The console groups this message under reporter-mode violations by this prefix.
    expect(message.startsWith('Reporter-mode violation (remote): "i was in the room".')).toBe(true);
    expect(message).toContain('never claims to have seen or heard the room (T8)');
    expect(message).toContain('Tell the moment as a scene, with attribution where it matters: a line someone was overheard saying, a claim about a person.');
    expect(message).not.toContain("attributing the room's events to the people in it");
    expect(message).not.toContain("the room's events reached Nova from people in it");
    expect(message).not.toContain('at most once');
  });
});

describe('repeated absence statements, remote only (phase 2, 2.6)', () => {
  // 092026's remote article said it was not there in the deck ("I was not there.")
  // and again in the lede ("I was not in that room."). The remote block allows one
  // statement; the attribution shows the absence everywhere else.
  const bundle = ({ deck = 'd', paragraphs = [], blocks = [] } = {}) => ({
    headline: { main: 'The Room Chose Vic', kicker: 'k', deck },
    sections: [{
      id: 'lede',
      type: 'narrative',
      content: [...paragraphs.map(text => ({ type: 'paragraph', text })), ...blocks]
    }],
    evidenceCards: []
  });
  const run = (mode, contentBundle) => factCheckContentBundle(baseArgs({ reportingMode: mode, contentBundle }));
  const absenceAdvisories = (result) => result.advisoryWarnings.filter(w => w.startsWith('Absence stated '));

  it('flags the 092026 shape as ONE advisory, never structural', () => {
    const result = run('remote', bundle({
      deck: 'The room chose Vic. I was not there.',
      paragraphs: ['I was not in that room. Everything I know reached me from the nine who were.']
    }));
    const advisories = absenceAdvisories(result);
    expect(advisories).toHaveLength(1);
    expect(advisories[0]).toMatch(/^Absence stated 2 times \(remote\): "I was not there", "I was not in that room"\./);
    // Phase 3 (3.9): the remote mode block of round 7 (R13): said once, early, then scenes.
    expect(advisories[0]).toContain('Nova says so once, early; after that, the room\'s events are told as scenes (T8).');
    expect(advisories[0]).not.toContain("attributing the room's events to the people in it");
    expect(advisories[0]).not.toContain('at most once');
    expect(result.structuralIssues).toEqual([]);
    expect(result.reporterMode.violations).toEqual([]);
  });

  it('the detective keeps its own wording', () => {
    const result = factCheckContentBundle(baseArgs({
      theme: 'detective',
      reportingMode: 'remote',
      contentBundle: bundle({ deck: 'I was not there.', paragraphs: ['I was not in that room.'] })
    }));
    expect(absenceAdvisories(result)[0]).toBe(
      'Absence stated 2 times (remote): "I was not there", "I was not in that room". ' +
      'Say that you were not in the room at most once in the whole article, or not at all; ' +
      'everywhere else, show where each fact came from by attributing it to the people who told you.'
    );
  });

  it('allows one statement', () => {
    const result = run('remote', bundle({
      paragraphs: ['I was not in that room. This morning, I am told, Alex carried the ledger to the table.']
    }));
    expect(absenceAdvisories(result)).toEqual([]);
  });

  it('allows none: attribution alone is the form the block asks for', () => {
    const result = run('remote', bundle({
      paragraphs: ['This morning, I am told, Alex carried the ledger. The room split four to four, per those keeping count.']
    }));
    expect(absenceAdvisories(result)).toEqual([]);
  });

  it('counts contractions and repeats of the same phrase', () => {
    const result = run('remote', bundle({
      paragraphs: ["I wasn't there.", 'I was not there when the vote turned, either.']
    }));
    expect(absenceAdvisories(result)[0]).toMatch(/^Absence stated 2 times \(remote\): "I wasn't there", "I was not there"\./);
  });

  it('does not run on an on-site session', () => {
    const result = run('on-site', bundle({
      deck: 'I was not there.',
      paragraphs: ['I was not in that room.']
    }));
    expect(absenceAdvisories(result)).toEqual([]);
  });

  it('does not count a player quoted inside a narrator paragraph', () => {
    const result = run('remote', bundle({
      paragraphs: ['I was not in that room. Vic told the others, “I wasn’t in the room when it happened.”']
    }));
    expect(absenceAdvisories(result)).toEqual([]);
  });

  it('reads narrator text only: quote blocks, captions and cards do not count', () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote',
      sessionPhotos: ['a.jpg'],
      contentBundle: {
        headline: { main: 'm', kicker: 'k', deck: 'I was not there.' },
        sections: [{
          id: 'lede',
          type: 'narrative',
          content: [
            { type: 'quote', text: 'I was not in the room.', attribution: 'Mel' },
            { type: 'photo', filename: 'a.jpg', caption: 'I was not present, Mel said.' }
          ]
        }],
        evidenceCards: [card({ content: TOKEN_TEXT })]
      }
    }));
    expect(absenceAdvisories(result)).toEqual([]);
  });

  it('matches whole words only: another name ending in "i" is not the narrator', () => {
    const result = run('remote', bundle({
      paragraphs: ['Kai was not there. Remi was not in the room either.']
    }));
    expect(absenceAdvisories(result)).toEqual([]);
  });

  it('carries its own prefix, which no console group claims, so the stop shows it as an advisory', () => {
    const {
      factCheckSummary, approveLabel
    } = require('../../console/checkpoint-view-logic');
    const result = run('remote', bundle({
      deck: 'I was not there.',
      paragraphs: ['I was not in that room.']
    }));
    const summary = factCheckSummary(result);
    expect(summary.structural).toBe(0);
    expect(summary.advisory).toBe(1);
    expect(summary.groups.map(g => g.key)).toEqual(['advisory']);
    expect(summary.groups[0].items[0].text).toMatch(/^Absence stated 2 times \(remote\):/);
    expect(approveLabel(summary, false).label).toBe('Approve (1 advisory)');
  });
});

// ── Slice 2.5: checks and cards ──────────────────────────────────────────────
//
// On 092026 the check sent 8 messages for 7 documents. Six of the seven were
// sidebar entries, whose `content` never prints; two of those were correct
// excerpts failed by a quote-mark fault; one document was reported twice; and the
// fix line offered "or drop the card", which a reworker that could not see the
// documents took. These blocks pin the fix.

describe('the card check reads only printed text (slice 2.5)', () => {
  it('never checks a sidebar entry\'s content, which does not print', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [],
        evidenceCards: [card({ content: 'A paraphrase of the offer that appears nowhere in the memory at all.' })]
      }
    }));
    expect(result.structuralIssues).toEqual([]);
    expect(result.cardFidelity).toEqual([
      { tokenId: 'vic001', ok: true, reason: null, locations: [{ placement: 'sidebar', section: null }] }
    ]);
  });

  it('still flags a sidebar entry whose id names no document: it prints a headline about nothing', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: { sections: [], evidenceCards: [card({ tokenId: 'nope999', content: undefined, summary: 'x' })] }
    }));
    expect(result.cardFidelity).toEqual([
      { tokenId: 'nope999', ok: false, reason: 'unknown source', locations: [{ placement: 'sidebar', section: null }] }
    ]);
    expect(result.structuralIssues).toHaveLength(1);
    expect(result.structuralIssues[0]).toMatch(/^Evidence card "nope999" \(in the sidebar\) has an unknown source/);
  });

  it('does not scan a sidebar entry\'s content for leaked prompt examples, only an inline card\'s', () => {
    const sidebarOnly = factCheckContentBundle(baseArgs({
      contentBundle: { sections: [], evidenceCards: [card({ content: 'The job is yours.' })] }
    }));
    expect(sidebarOnly.advisoryWarnings).toEqual([]);

    const inline = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ content: 'The job is yours.' }))
    }));
    expect(inline.advisoryWarnings.join(' ')).toMatch(/^Prompt example leaked into evidence card "vic001"/);
  });
});

describe('quote-mark faults (slice 2.5, 092026 regression cases)', () => {
  const { _testing: { isVerbatim, normalize } } = require('../content-bundle-fact-check');

  // Each card is the 092026 writer's own card text, and each source the text the
  // writer was shown. Each is a correct excerpt, and each failed before this slice.
  const CASES = {
    // The split cut at `made!”`, leaving `”` at the head of the next fragment;
    // the card dropped the source's next sentence, so `” Your fist…` matched nothing.
    ale003: {
      card: 'ALEX.3 - 11:32PM - MARCUS brags about the BizAI sale. Again. “Best deal I ever made!” ' +
        'Your fist moves before your brain. His jaw. Your knuckles. Years of stolen work in every punch. ' +
        'SARAH pulls you off. Worth it. Finally worth it.',
      source: 'ALEX.3 - 11:32PM - MARCUS brags about the BizAI sale. Again. “Best deal I ever made!” ' +
        'Waits for a response from you. Your fist moves before your brain. His jaw. Your knuckles. ' +
        'Years of stolen work in every punch. SARAH pulls you off. Worth it. Finally worth it.'
    },
    // The same mechanism at `Walsh.”`.
    mor003: {
      card: 'MORGAN.3 - 11:22PM - You’re both on the hammock. You show him proof: bribes, fraudulent reports, ' +
        'shell company records, stolen IP. You say: “Go public about the insider trading and take full ' +
        'responsibility or I give all of this damning evidence to Senator Walsh.” Instead of answering, ' +
        'he reaches into his bag and hands you a generous bribe. MARCUS: “Take care of it, will you? ' +
        'Just like you always do.”',
      source: 'MORGAN.3 - 11:22PM - You’re both on the hammock. You show him proof: bribes, fraudulent reports, ' +
        'shell company records, stolen IP... You say: “Go public about the insider trading and take full ' +
        'responsibility or I give all of this damning evidence to Senator Walsh.” His face says he’s ' +
        'considering it—but there’s something else there. Instead of answering, he reaches into his bag ' +
        'and hands you a generous bribe. MARCUS: “Take care of it, will you? Just like you always do,” ' +
        'then leaves without giving you a chance to respond.'
    },
    // The card put the document's double-quoted lines in single quotes.
    '95e749b7-a55b-444f-818b-a325e2783cac': {
      card: 'Front cover: A rose with \'I fucked up. I\'m sorry.\' above. Inside: J, I\'m sorry. I love you. ' +
        'I\'m going to leave her soon. She means nothing to me. Please don\'t leave me. M. Back: \'Look under dog.\'',
      source: 'Front cover:\nA rose with "I fucked up. I\'m sorry." above\nInside:\nJ,\nI\'m sorry. I love you. ' +
        'I\'m going to leave her soon. She means nothing to me. Please don\'t leave me.\nM.\nBack:\n"Look under dog."'
    }
  };

  Object.entries(CASES).forEach(([tokenId, { card: content, source }]) => {
    it(`passes ${tokenId}, a correct excerpt, as an inline card`, () => {
      const result = factCheckContentBundle(baseArgs({
        arcEvidencePackages: [{ arcId: 'a1', evidenceItems: [{ id: tokenId, fullContent: source }] }],
        contentBundle: storyWith(inlineCard({ tokenId, content }))
      }));
      expect(result.cardFidelity).toEqual([{ tokenId, ok: true, reason: null, locations: IN_STORY }]);
      expect(result.structuralIssues).toEqual([]);
    });
  });

  it('folds single and double quotation marks, curly or straight, together', () => {
    expect(normalize('“one” "two" ‘three’ \'four\'')).toBe("'one' 'two' 'three' 'four'");
  });

  it('drops a fragment\'s own leading and trailing quotation marks before matching', () => {
    const source = 'He said “Best deal I ever made!” and waited. The room went quiet around the two of them.';
    // The card drops "and waited", so the fragment after `made!` starts with `”`.
    expect(isVerbatim('“Best deal I ever made!” The room went quiet around the two of them.', source)).toBe(true);
  });

  it('still rejects a changed word inside a quotation', () => {
    const source = 'He said “Best deal I ever made!” and waited. The room went quiet around the two of them.';
    expect(isVerbatim('“Best deal I ever lost, obviously!” The room went quiet around the two of them.', source)).toBe(false);
  });

  it('still rejects retyped punctuation that changes the text (the 092026 paternity-test card)', () => {
    const source = 'Result: DDC — DNA Certainty™ confirms the match at ninety-nine point nine percent.';
    expect(isVerbatim('Result: DDC, DNA Certainty confirms the match at ninety-nine point nine percent.', source)).toBe(false);
  });
});

describe('one report per defect (slice 2.5)', () => {
  const FABRICATED = 'Vic told me the job had already been handed out, with the serial numbers filed off.';

  it('reports a document that fails twice inline once, naming both places', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [
          { id: 'lede', type: 'narrative', content: [inlineCard({ content: FABRICATED })] },
          { id: 'the-story', type: 'narrative', content: [inlineCard({ content: FABRICATED })] }
        ],
        evidenceCards: [card()]
      }
    }));
    expect(result.structuralIssues).toHaveLength(1);
    expect(result.structuralIssues[0]).toMatch(/^Evidence card "vic001" \(in sections "lede" and "the-story"\) is not verbatim/);
    expect(result.cardFidelity.filter(c => !c.ok)).toEqual([{
      tokenId: 'vic001', ok: false, reason: 'not verbatim',
      locations: [{ placement: 'inline', section: 'lede' }, { placement: 'inline', section: 'the-story' }]
    }]);
    // The sidebar entry for the same document names a real document, so it passes.
    expect(result.cardFidelity.filter(c => c.ok)).toEqual([
      { tokenId: 'vic001', ok: true, reason: null, locations: [{ placement: 'sidebar', section: null }] }
    ]);
  });

  it('reports an unknown id used inline and in the sidebar once', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{ id: 'the-story', type: 'narrative', content: [inlineCard({ tokenId: 'nope999' }), inlineCard({ tokenId: 'nope999' })] }],
        evidenceCards: [card({ tokenId: 'nope999' })]
      }
    }));
    expect(result.structuralIssues).toHaveLength(1);
    expect(result.structuralIssues[0]).toMatch(/^Evidence card "nope999" \(in section "the-story" twice, and in the sidebar\) has an unknown source/);
    expect(result.cardFidelity).toHaveLength(1);
    expect(result.cardFidelity[0].locations).toEqual([
      { placement: 'inline', section: 'the-story' },
      { placement: 'inline', section: 'the-story' },
      { placement: 'sidebar', section: null }
    ]);
  });

  it('keeps a document\'s passing card apart from its failing one', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{ id: 'the-story', type: 'narrative', content: [inlineCard(), inlineCard({ content: FABRICATED })] }],
        evidenceCards: []
      }
    }));
    expect(result.structuralIssues).toHaveLength(1);
    expect(result.cardFidelity).toEqual([
      { tokenId: 'vic001', ok: true, reason: null, locations: IN_STORY },
      { tokenId: 'vic001', ok: false, reason: 'not verbatim', locations: IN_STORY }
    ]);
  });

  it('reports a leaked prompt example once per card id', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ content: 'The job is yours.' }), inlineCard({ content: 'The job is yours.' }))
    }));
    expect(result.advisoryWarnings.filter(w => /^Prompt example leaked into evidence card/.test(w))).toHaveLength(1);
  });

  it('keeps as many structural card messages as failing cardFidelity items', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [
          { id: 'lede', type: 'narrative', content: [inlineCard({ content: FABRICATED }), inlineCard({ tokenId: 'ghost1' })] },
          { id: 'the-story', type: 'narrative', content: [inlineCard({ content: FABRICATED })] }
        ],
        evidenceCards: [card(), card({ tokenId: 'ghost1' }), card({ tokenId: 'ghost2' })]
      }
    }));
    const cardMessages = result.structuralIssues.filter(s => s.indexOf('Evidence card "') === 0);
    expect(cardMessages).toHaveLength(3);
    expect(result.cardFidelity.filter(c => !c.ok)).toHaveLength(3);
  });

  it('names a section with no id as such', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{ type: 'narrative', content: [inlineCard({ content: FABRICATED })] }],
        evidenceCards: []
      }
    }));
    expect(result.structuralIssues[0]).toMatch(/^Evidence card "vic001" \(in a section with no id\) is not verbatim/);
    expect(result.cardFidelity[0].locations).toEqual([{ placement: 'inline', section: null }]);
  });
});

describe('fix lines (slice 2.5)', () => {
  // The one pointer wording every prompt uses (R1), from the record view itself.
  const { DOCUMENT_POINTER } = require('../prompt-renderers/record-view');

  it('the not-verbatim line points at the document in <RECORD> and never offers dropping the card', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ content: 'Vic told me the job had already been handed out, with the serial numbers filed off.' }))
    }));
    const [message] = result.structuralIssues;
    expect(message.indexOf('Evidence card "vic001"')).toBe(0);
    expect(message).toContain(DOCUMENT_POINTER);
    expect(message).toMatch(/keep the card/i);
    expect(message).not.toMatch(/drop|remove|delete|cut the card/i);
  });

  it('the unknown-source line may still offer removal: the card has no real document', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ tokenId: 'nope999' }))
    }));
    const [message] = result.structuralIssues;
    expect(message.indexOf('Evidence card "nope999"')).toBe(0);
    expect(message).toContain('<RECORD>');
    expect(message).toMatch(/drop the card/);
  });

  it('the leaked-example line keeps its prefix and points at the document in <RECORD>', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ content: 'The job is yours.' }))
    }));
    expect(result.advisoryWarnings[0]).toMatch(/^Prompt example leaked into evidence card "vic001"/);
    expect(result.advisoryWarnings[0]).toContain(DOCUMENT_POINTER);
  });
});

describe('roster coverage counts printed text only (slice 2.5)', () => {
  const { _testing: { visibleText } } = require('../content-bundle-fact-check');

  const coverage = (contentBundle, theme) => factCheckContentBundle(baseArgs({
    roster: ['Mel'],
    contentBundle: { sections: [], evidenceCards: [], ...contentBundle },
    ...(theme ? { theme } : {})
  })).rosterCoverage.missing;

  it('does not count a name only in a sidebar entry\'s content or owner', () => {
    expect(coverage({ evidenceCards: [card({ content: 'Mel kept the second ledger.', summary: 'The ledger' })] })).toEqual(['Mel']);
    expect(coverage({ evidenceCards: [card({ owner: 'Mel', summary: 'The ledger' })] })).toEqual(['Mel']);
  });

  it('does not count a name only in the top-level photos, a pull quote, or the hero\'s characters', () => {
    expect(coverage({ photos: [{ filename: 'a.jpg', caption: 'Mel at the bar', characters: ['Mel'] }] })).toEqual(['Mel']);
    expect(coverage({ pullQuotes: [{ type: 'verbatim', text: 'Mel knew', attribution: 'Mel' }] })).toEqual(['Mel']);
    expect(coverage({ heroImage: { filename: 'a.jpg', caption: 'The bar', characters: ['Mel'] } })).toEqual(['Mel']);
  });

  it('counts a sidebar entry\'s headline and summary, and the hero caption, on the journalist page', () => {
    expect(coverage({ evidenceCards: [card({ headline: 'What Mel kept' })] })).toEqual([]);
    expect(coverage({ evidenceCards: [card({ summary: 'Mel kept the second ledger' })] })).toEqual([]);
    expect(coverage({ heroImage: { filename: 'a.jpg', caption: 'Mel at the bar' } })).toEqual([]);
  });

  it('counts a section heading, a quote attribution and an inline card owner', () => {
    expect(coverage({ sections: [{ id: 's', type: 'narrative', heading: 'Mel\'s ledger', content: [] }] })).toEqual([]);
    expect(coverage({ sections: [{ id: 's', type: 'narrative', content: [{ type: 'quote', text: 'I kept it.', attribution: 'Mel' }] }] })).toEqual([]);
    expect(coverage({ sections: [{ id: 's', type: 'narrative', content: [inlineCard({ owner: 'Mel' })] }] })).toEqual([]);
  });

  it('on the detective page, the headline, the hero, the sidebar and a card owner never print', () => {
    expect(coverage({ headline: { main: 'Mel and the ledger' } }, 'detective')).toEqual(['Mel']);
    expect(coverage({ heroImage: { filename: 'a.jpg', caption: 'Mel at the bar' } }, 'detective')).toEqual(['Mel']);
    expect(coverage({ evidenceCards: [card({ headline: 'What Mel kept', summary: 'Mel' })] }, 'detective')).toEqual(['Mel']);
    expect(coverage({ sections: [{ id: 's', type: 'narrative', content: [inlineCard({ owner: 'Mel' })] }] }, 'detective')).toEqual(['Mel']);
    // What does print there still counts.
    expect(coverage({ sections: [{ id: 's', type: 'narrative', heading: 'Mel', content: [] }] }, 'detective')).toEqual([]);
    expect(coverage({ sections: [{ id: 's', type: 'narrative', content: [inlineCard({ headline: 'What Mel kept' })] }] }, 'detective')).toEqual([]);
  });

  it('reads the journalist page when no theme is given', () => {
    expect(coverage({ headline: { main: 'Mel and the ledger' } })).toEqual([]);
    expect(visibleText({ headline: { main: 'Mel' } })).toBe(visibleText({ headline: { main: 'Mel' } }, 'journalist'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3, brief 3.4: the new code checks. Each is an advisory until a live
// session shows it right, has its own message prefix, and reads the narrator's
// text (headline, kicker, deck, paragraphs) with quoted spans stripped: never a
// card, a quote block, a caption or a player's quoted line.
// ═══════════════════════════════════════════════════════════════════════════
describe('the new advisory checks (phase 3, 3.4)', () => {
  const { FACT_CHECK_ADVISORY_ONLY } = require('../content-bundle-fact-check');

  // The canon as phase 3 states it (spec T9, T15): Marcus he/him, Blake and Nova
  // with no pronoun, the Valet another name for Blake.
  const NPCS = [
    { name: 'Marcus', fullName: 'Marcus Blackwood', pronouns: 'he/him' },
    { name: 'Nova', fullName: 'Nova' },
    { name: 'Blake', fullName: 'Blake' },
    { name: 'Valet', aliasOf: 'Blake' }
  ];
  const ROSTER9 = ['Alex', 'Ashe', 'Jess', 'Kai', 'Mel', 'Remi', 'Sam', 'Sarah', 'Vic'];
  const PREFIXES = {
    emDash: "Em-dash in the narrator's prose:",
    productionWords: 'Production word in print:',
    novaPronoun: 'Gendered pronoun for Nova:',
    npcPronouns: 'Pronoun error:',
    length: 'Over length:',
    headCount: 'Head count:'
  };

  const paragraphs = (...texts) => ({
    headline: { main: 'The Room Chose Vic', kicker: 'NovaNews', deck: 'A verdict, a ledger.' },
    sections: [{ id: 'the-story', type: 'narrative', content: texts.map((text) => ({ type: 'paragraph', text })) }],
    evidenceCards: []
  });
  const withBlocks = (...blocks) => ({
    headline: { main: 'h', kicker: 'k', deck: 'd' },
    sections: [{ id: 'the-story', type: 'narrative', content: blocks }],
    evidenceCards: []
  });
  const run = (contentBundle, over = {}) => factCheckContentBundle(baseArgs({ contentBundle, theme: 'journalist', npcs: NPCS, ...over }));
  const flagged = (result, key) => result.advisoryWarnings.filter((w) => w.startsWith(PREFIXES[key]));
  const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

  it('adds each new check to the advisory-only list', () => {
    expect(FACT_CHECK_ADVISORY_ONLY).toEqual([
      'npcPronouns', 'leakedExample', 'repeatedAbsence', 'emDash', 'productionWords', 'novaPronoun', 'length', 'headCount'
    ]);
  });

  describe('em-dashes', () => {
    it('flags one in a narrator paragraph, saying where', () => {
      const result = run(paragraphs('The ledger moved — twice — before noon.'));
      const [message] = flagged(result, 'emDash');
      expect(message).toBeDefined();
      expect(message).toContain('section "the-story", paragraph 1');
      expect(message).toContain('2 em-dashes');
    });

    it('flags one in the deck', () => {
      const result = run({ ...paragraphs('Plain prose.'), headline: { main: 'h', deck: 'A verdict — and a ledger.' } });
      expect(flagged(result, 'emDash')[0]).toContain('the deck');
    });

    it('stays silent on an em-dash inside a quoted span, a card or a quote block', () => {
      const result = run(withBlocks(
        { type: 'paragraph', text: 'Vic said it plainly: “It was mine — all of it.”' },
        inlineCard({ content: 'You leave — you never come back.' }),
        { type: 'quote', text: 'Worth it — finally.', attribution: 'Marcus' }
      ));
      expect(flagged(result, 'emDash')).toEqual([]);
    });
  });

  describe('production words (T14)', () => {
    it('flags a bare token, the GM, a tier and the director in narrator prose', () => {
      const result = run(paragraphs(
        'Every token on the board told a story.',
        'The GM called time, and the director watched the tier three memories go.'
      ));
      const [message] = flagged(result, 'productionWords');
      expect(message).toMatch(/"token"/);
      expect(message).toMatch(/"GM"/);
      expect(message).toMatch(/"tier"/);
      expect(message).toMatch(/"director"/);
      expect(message).toContain('section "the-story", paragraph 2');
    });

    it('stays silent on the fiction\'s own words', () => {
      const result = run(paragraphs(
        'Six memory tokens went up on the Evidence Board, and three were buried.',
        'NeurAI\'s board of directors paid for every memory sold.'
      ));
      expect(flagged(result, 'productionWords')).toEqual([]);
    });

    it('never flags a quoted memory\'s "token", in a quoted span or a card', () => {
      const result = run(withBlocks(
        { type: 'paragraph', text: 'Alex wrote it down: “I held the token too long, and the timer ran out.”' },
        inlineCard({ content: 'You turn the token over in your hand and the GM laughs.' }),
        { type: 'quote', text: 'Tier one, tops.', attribution: 'Vic' }
      ));
      expect(flagged(result, 'productionWords')).toEqual([]);
    });
  });

  describe('Nova is never gendered (T9)', () => {
    it('flags a gendered pronoun for Nova', () => {
      const result = run(paragraphs('Nova filed her story before dawn.'));
      const [message] = flagged(result, 'novaPronoun');
      expect(message).toContain('"Nova filed her"');
      expect(message).toContain('section "the-story", paragraph 1');
    });

    it('holds whatever pronoun an NPC list declares for Nova', () => {
      const npcs = [{ name: 'Nova', fullName: 'Nova', pronouns: 'she/her' }, ...NPCS.filter((e) => e.name !== 'Nova')];
      const result = run(paragraphs('Nova filed her story before dawn.'), { npcs });
      expect(flagged(result, 'novaPronoun')).toHaveLength(1);
      // Never also reported against a declared pronoun.
      expect(flagged(result, 'npcPronouns')).toEqual([]);
    });

    it('stays silent on NovaNews, on another person in the sentence, and on a quoted line', () => {
      const result = run(paragraphs(
        'NovaNews ran his statement in full.',
        'Nova asked Mel whether her vote had moved.',
        'Mel told the room, “Nova will print what she likes.”'
      ));
      expect(flagged(result, 'novaPronoun')).toEqual([]);
    });
  });

  describe('Blake and Marcus (T9, extending the NPC check)', () => {
    it('flags a gendered pronoun for Blake that neither the notes nor the roster give', () => {
      const result = run(paragraphs('Blake said he would pay double.'));
      const [message] = flagged(result, 'npcPronouns');
      expect(message).toMatch(/^Pronoun error: Blake /);
      expect(message).toContain('"Blake said he"');
    });

    it('reads the Valet as Blake', () => {
      const result = run(paragraphs('The Valet said he would pay double.'));
      expect(flagged(result, 'npcPronouns')[0]).toMatch(/^Pronoun error: Blake /);
    });

    it('stays silent on a Blake pronoun the director\'s notes give', () => {
      const result = run(paragraphs('Blake said he would pay double.'), {
        directorText: 'Blake worked the corner by the bar all morning. Later Blake told Sam he was out of cash.'
      });
      expect(flagged(result, 'npcPronouns')).toEqual([]);
    });

    it('stays silent on a Blake pronoun the roster gives', () => {
      const result = run(paragraphs('Blake said he would pay double.'), { rosterPronouns: { Blake: 'he/him' } });
      expect(flagged(result, 'npcPronouns')).toEqual([]);
    });

    it('flags a pronoun the notes do not give, beside one they do', () => {
      const result = run(paragraphs('Blake said she would pay double.'), { directorText: 'Blake said he was leaving.' });
      expect(flagged(result, 'npcPronouns')[0]).toContain('"Blake said she"');
    });

    it('stays silent on a player\'s quoted line and on a card', () => {
      const result = run(withBlocks(
        { type: 'paragraph', text: 'Mel put it this way: “Blake told me he would pay.”' },
        inlineCard({ content: 'Blake leans in and he names a number.' })
      ));
      expect(flagged(result, 'npcPronouns')).toEqual([]);
    });

    // Fix 3.4b (review finding 3): the scans read a possessive after the name, with
    // findPronounNear's conditions, and keep the object forms (him) out. Fix 3.4c (the
    // integrator's ruling of 2026-10-01): the possessive read is "his" alone. On the 53
    // published reports a "her" after Marcus was someone else's ("Marcus buried her
    // exposé"): 5 false flags in 4 reports and no true one.
    it('reads "his" after Blake as Blake\'s, and never flags it after Marcus', () => {
      const blake = flagged(run(paragraphs('Blake counted his money.')), 'npcPronouns');
      expect(blake).toHaveLength(1);
      expect(blake[0]).toMatch(/^Pronoun error: Blake /);
      expect(blake[0]).toContain('"Blake counted his"');
      expect(flagged(run(paragraphs('Marcus signed his name to the transfer.')), 'npcPronouns')).toEqual([]);
    });

    // Fix 3.4cb: "hers" goes with "her". In "Marcus took what was hers" the word is
    // someone else's.
    it('never reads "her" or "hers" after Marcus or Blake as theirs (3.4c)', () => {
      const sentences = [
        'Marcus buried her exposé.',
        'Marcus had cleaned out her bank account.',
        'Marcus signed her name to the transfer.',
        'The Valet bought her memory.',
        'Marcus took what was hers.'
      ];
      expect(sentences.map((s) => [s, flagged(run(paragraphs(s)), 'npcPronouns')]))
        .toEqual(sentences.map((s) => [s, []]));
    });

    it('reads the "his" after a "her" as Blake\'s, and never the "her" (3.4c)', () => {
      const blake = flagged(run(paragraphs('Blake showed her his ledger.')), 'npcPronouns');
      expect(blake).toHaveLength(1);
      expect(blake[0]).toMatch(/^Pronoun error: Blake /);
      expect(blake[0]).toContain('"Blake showed her his"');
    });

    // 092626's article: "her" belongs to the reporter, the subject of the clause; Marcus
    // is the object of "about". A possessive after a name a preposition governs is not
    // read as that person's: "his" after "to Blake" is the buyer's.
    it('stays silent on 092626\'s sentence, where the possessive belongs to the clause\'s subject', () => {
      const result = run(paragraphs(
        'The last reporter who wrote about Marcus had her exposé buried.',
        'The last reporter who tried to tell the truth about Marcus had her exposé buried and lost her job over it.',
        'The last buyer who sold to Blake spent his cut by noon.'
      ));
      expect(flagged(result, 'npcPronouns')).toEqual([]);
    });

    it('never reads an object pronoun after Marcus or Blake as theirs', () => {
      const result = run(paragraphs(
        'Blake paid him well for the memory.',
        'Blake paid her well for the memory.',
        'Marcus hired her as his assistant.',
        'Marcus told her to sell.'
      ));
      expect(flagged(result, 'npcPronouns')).toEqual([]);
    });

    it('a pronoun passed over does not hide a later one in the same sentence', () => {
      const result = run(paragraphs('Blake paid her well, and then he left.'));
      expect(flagged(result, 'npcPronouns')[0]).toContain('"Blake paid her well, and then he"');
      const governed = run(paragraphs('The deal with Blake cost his buyers more than he admitted.'));
      expect(flagged(governed, 'npcPronouns')[0]).toContain('"Blake cost his buyers more than he"');
    });

    it('flags Marcus written she, and still flags Marcus written they', () => {
      const she = run(paragraphs('Marcus said she would sell the company.'));
      expect(flagged(she, 'npcPronouns')[0]).toMatch(/^Pronoun error: Marcus takes he\/him/);
      const they = run(paragraphs('Marcus signed their own name to the transfer.'));
      expect(flagged(they, 'npcPronouns')[0]).toMatch(/^Pronoun error: Marcus takes he\/him/);
      expect(flagged(run(paragraphs('Marcus said he would sell the company.')), 'npcPronouns')).toEqual([]);
    });
  });

  describe('length (C4, R4)', () => {
    it('flags the narrator\'s prose above 1,800 words, with the count and where the words are', () => {
      const result = run({ headline: { main: 'one two', deck: 'three four' }, sections: [
        { id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text: words(300) }] },
        { id: 'the-story', type: 'narrative', content: [{ type: 'paragraph', text: words(1497) }] }
      ], evidenceCards: [] });
      const [message] = flagged(result, 'length');
      expect(message).toContain('1,801 words');
      expect(message).toContain('lede 300');
      expect(message).toContain('the-story 1,497');
    });

    it('stays silent at 1,800, and never counts a card or a quote block', () => {
      const result = run({ headline: { main: 'one two', deck: 'three four' }, sections: [
        { id: 'the-story', type: 'narrative', content: [
          { type: 'paragraph', text: words(1796) },
          inlineCard({ content: words(500) }),
          { type: 'quote', text: words(200), attribution: 'Vic' }
        ] }
      ], evidenceCards: [] });
      expect(flagged(result, 'length')).toEqual([]);
    });
  });

  describe('head count (T10)', () => {
    const roster = ROSTER9;

    it('flags a statement of how many were in the room that disagrees with the roster', () => {
      const result = run(paragraphs('There were ten people in the room when the vote turned.'), { roster });
      const [message] = flagged(result, 'headCount');
      expect(message).toMatch(/ten people in the room/);
      expect(message).toContain('9 players');
    });

    it('stays silent when it agrees', () => {
      const result = run(paragraphs('Nine people were in that room, and nine stories left it.'), { roster });
      expect(flagged(result, 'headCount')).toEqual([]);
    });

    it('never reads a vote count or an account count as a head count', () => {
      const result = run(paragraphs(
        'Six votes went to an accidental overdose.',
        'Eight accounts took money before noon, and two people in the room never sold at all.'
      ), { roster });
      expect(flagged(result, 'headCount')).toEqual([]);
    });

    it('never reads a player\'s quoted line', () => {
      const result = run(paragraphs('Sam was blunt: “There were ten of us in the room, and nobody talked.”'), { roster });
      expect(flagged(result, 'headCount')).toEqual([]);
    });

    // Fix 3.4b (review finding 2): a relative clause after "the N people in the room",
    // or what only they did after "N players sat in the room", picks out part of the room.
    it('never reads a statement about part of the room as a head count', () => {
      const result = run(paragraphs(
        'The two people in the room who never sold walked out clean.',
        'Three players sat in the room and never said a word.',
        'The two players in the room that Marcus had hired kept quiet.',
        'Two people stood in that room while the rest voted.'
      ), { roster });
      expect(flagged(result, 'headCount')).toEqual([]);
    });

    it('still flags a whole-room head count in those forms', () => {
      for (const text of [
        'The eight people in the room voted.',
        'The eight people in the room that morning voted.',
        'Eight players sat in the room.',
        'Eight people stood in the warehouse; the vote was close.'
      ]) {
        const [message] = flagged(run(paragraphs(text), { roster }), 'headCount');
        expect([text, message]).toEqual([text, expect.stringContaining('9 players')]);
      }
    });

    it('counts a guest reporter on the roster once, as one of the players', () => {
      const guestReporter = { name: 'Ashe Motoko', role: 'Contributing Reporter' };
      expect(flagged(run(paragraphs('Nine people were in the room.'), { roster, guestReporter }), 'headCount')).toEqual([]);
      const [message] = flagged(run(paragraphs('Ten people were in the room.'), { roster, guestReporter }), 'headCount');
      expect(message).toContain('Ashe Motoko');
      expect(message).toContain('9 players');
    });

    it('does not count a guest reporter who plays no character on the roster', () => {
      const guestReporter = { name: 'Jordan Lee', role: 'Contributing Reporter' };
      expect(flagged(run(paragraphs('Nine people were in the room.'), { roster, guestReporter }), 'headCount')).toEqual([]);
      const [message] = flagged(run(paragraphs('Ten people were in the room.'), { roster, guestReporter }), 'headCount');
      expect(message).toContain('Jordan Lee');
    });
  });

  it('none of the new checks is structural, and each message has its own prefix', () => {
    const result = run(paragraphs(
      'There were ten people in the room — every token counted. Nova filed her story. Blake said he was done.',
      'Marcus said she would sell.'
    ), { roster: ROSTER9 });
    // One message per check, and one per character for the pronoun check (Blake, Marcus).
    const expected = { emDash: 1, productionWords: 1, novaPronoun: 1, npcPronouns: 2, length: 0, headCount: 1 };
    for (const key of Object.keys(PREFIXES)) {
      expect([key, flagged(result, key).length]).toEqual([key, expected[key]]);
      expect(result.structuralIssues.some((s) => s.startsWith(PREFIXES[key]))).toBe(false);
    }
  });

  it('the detective theme keeps today\'s checks only', () => {
    const result = factCheckContentBundle(baseArgs({
      theme: 'detective',
      npcs: NPCS,
      roster: ROSTER9,
      contentBundle: paragraphs('There were ten people in the room — every token counted. Nova filed her story. Blake said he was done.')
    }));
    for (const key of ['emDash', 'productionWords', 'novaPronoun', 'length', 'headCount']) {
      expect([key, flagged(result, key)]).toEqual([key, []]);
    }
    expect(result.advisoryWarnings.some((w) => w.startsWith('Pronoun error: Blake'))).toBe(false);
  });
});

describe('the fix lines follow the rules (phase 3, 3.4)', () => {
  const remote = (text) => factCheckContentBundle(baseArgs({
    reportingMode: 'remote',
    contentBundle: { headline: { main: 'h', deck: 'd' }, sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text }] }], evidenceCards: [] }
  }));

  it('the vote fix line never sends the rework to name the person who acted', () => {
    const [message] = remote('Six memories went to the market and one of them was mine.').structuralIssues;
    expect(message.startsWith('Reporter-mode violation: "one of them was mine".')).toBe(true);
    expect(message).not.toMatch(/whoever/i);
    expect(message).not.toMatch(/Attribute the action/);
    expect(message).toMatch(/\bT8\b/);
    expect(message).toMatch(/anonymous/);
  });

  // Phase 3 (3.9): the vote fix line states T8 as round 7 words it (R21): "accuses" means
  // joining the room's accusation.
  it('the vote fix line says what T8 says: Nova never votes, joins the room\'s accusation or exposes a memory', () => {
    const [message] = remote('I voted with the room.').structuralIssues;
    expect(message.startsWith('Reporter-mode violation: "i voted".')).toBe(true);
    expect(message).toContain("Nova reports on the room from outside its choices: Nova never votes, joins the room's accusation or exposes a memory, and is never one of the room (T8).");
    expect(message).not.toContain('accuses or exposes');
  });

  it('the remote fix line has exposures reach Nova by turn-in, never as tips', () => {
    const [message] = remote('I was in the room when the vote turned.').structuralIssues;
    expect(message.startsWith('Reporter-mode violation (remote): "i was in the room".')).toBe(true);
    expect(message).not.toMatch(/\btips?\b/i);
    expect(message).toMatch(/turned in to Nova/);
  });

  it('the detective keeps its reporter-mode wording', () => {
    const detective = (text) => factCheckContentBundle(baseArgs({
      theme: 'detective',
      reportingMode: 'remote',
      contentBundle: { headline: { main: 'h', deck: 'd' }, sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text }] }], evidenceCards: [] }
    }));
    expect(detective('I voted with the room.').structuralIssues).toContain(
      'Reporter-mode violation: "i voted". The reporter covers the room, they are not a member of it — they never vote and no exposed memory is theirs. Attribute the action to whoever took it.'
    );
    expect(detective('I was in the room when the vote turned.').structuralIssues).toContain(
      'Reporter-mode violation (remote): "i was in the room". This session was covered remotely: every exposure, observation and the verdict arrived as a tip from someone who was there. Show where each fact came from by attributing it to the people who told you, and state your absence at most once.'
    );
  });

  it('no message carries an em-dash', () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote',
      roster: ['Mel'],
      sessionPhotos: ['a.jpg'],
      npcs: [{ name: 'Marcus', fullName: 'Marcus Blackwood', pronouns: 'he/him' }, { name: 'Blake', fullName: 'Blake' }],
      contentBundle: {
        headline: { main: 'h', deck: 'I was not there.' },
        sections: [{ id: 'lede', type: 'narrative', content: [
          { type: 'paragraph', text: 'I was in the room and I voted. I was not in that room. Marcus signed their name. Blake said he was done — for good.' },
          { type: 'photo', filename: 'not-ours.jpg', caption: 'x' },
          inlineCard({ tokenId: 'vic001', content: 'A sentence that appears nowhere in the source text at all.' }),
          inlineCard({ tokenId: 'nope999', content: 'Whatever this is, no session item carries that id.' })
        ] }],
        evidenceCards: []
      }
    }));
    const messages = [...result.structuralIssues, ...result.advisoryWarnings];
    expect(messages.length).toBeGreaterThan(6);
    messages.forEach((m) => expect([m, m.includes('—')]).toEqual([m, false]));
  });
});
