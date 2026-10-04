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
    // Phase 4 (brief 4.6; R5): the card check's source texts come from the record alone.
    evidenceBundle: {
      exposed: {
        tokens: [{ id: 'vic001', owner: 'Vic Kingsley', fullContent: TOKEN_TEXT }],
        paperEvidence: [{ id: 'paper-1', fullContent: PAPER_TEXT }]
      }
    },
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

  // The 4b fix batch (T13: an excluded photo never appears; the integrator's ruling): one
  // rule decides a kept photo, and the evaluator passes the photos it excludes
  // (buildFactCheckArgs). An excluded photo is no usable reference, and a fix line offers
  // only the kept photos: it used to offer every session photo, so a rework could be told
  // to place one the director pulled.
  describe('a photo the director excluded', () => {
    const PHOTOS = ['/data/071126/photos/aln0711-1.jpg', '/data/071126/photos/aln0711-2.jpg', '/data/071126/photos/aln0711-3.jpg'];
    const placing = (...filenames) => ({
      sections: [{ id: 'lede', type: 'narrative', content: filenames.map((filename) => ({ type: 'photo', filename, caption: 'x' })) }],
      evidenceCards: [],
      heroImage: { filename: 'aln0711-1.jpg' }
    });

    it('is an invalid reference, and the fix line offers only the kept photos', () => {
      const result = factCheckContentBundle(baseArgs({
        sessionPhotos: PHOTOS, excludedPhotos: ['/data/071126/photos/aln0711-2.jpg'], contentBundle: placing('aln0711-2.jpg')
      }));
      expect(result.photoReferences.invalid).toEqual(['aln0711-2.jpg']);
      expect(result.structuralIssues).toEqual([
        'Invalid photo reference "aln0711-2.jpg": the director excluded this photo. Use one of [aln0711-1.jpg, aln0711-3.jpg] or remove the reference.'
      ]);
    });

    it("is left out of the photos a reference to no session photo is offered", () => {
      const result = factCheckContentBundle(baseArgs({
        sessionPhotos: PHOTOS, excludedPhotos: ['aln0711-2.jpg'], contentBundle: placing('ghost.jpg')
      }));
      expect(result.structuralIssues).toEqual([
        'Invalid photo reference "ghost.jpg": not one of this session\'s photos. Use one of [aln0711-1.jpg, aln0711-3.jpg] or remove the reference.'
      ]);
    });

    it('with every photo excluded, a fix line asks only for the reference to go', () => {
      const result = factCheckContentBundle(baseArgs({
        sessionPhotos: PHOTOS, excludedPhotos: PHOTOS, contentBundle: placing('aln0711-3.jpg')
      }));
      expect(result.photoReferences.invalid).toEqual(['aln0711-1.jpg', 'aln0711-3.jpg']);
      expect(result.structuralIssues).toEqual([
        'Invalid photo reference "aln0711-1.jpg": the director excluded this photo. Remove the reference.',
        'Invalid photo reference "aln0711-3.jpg": the director excluded this photo. Remove the reference.'
      ]);
    });
  });

  // Task 4c-fix (T13: the whiteboard is the room's working notes, and its photo stays
  // out of the article): the whiteboard photo is never a usable reference. A printed one
  // is an invalid reference whose message says what it is, and no fix line offers it.
  // The evaluator passes its filename from where the writers get it (buildFactCheckArgs,
  // whiteboardFilenameOf). It used to be offered as a photo to use.
  describe('the whiteboard photo', () => {
    const PHOTOS = ['/data/071126/photos/aln0711-1.jpg', '/data/071126/photos/aln0711-2.jpg', '/data/071126/photos/whiteboard.jpg'];
    const placing = (...filenames) => ({
      sections: [{ id: 'lede', type: 'narrative', content: filenames.map((filename) => ({ type: 'photo', filename, caption: 'x' })) }],
      evidenceCards: [],
      heroImage: { filename: 'aln0711-1.jpg' }
    });
    const WORKING_NOTES = "this is the whiteboard, the room's working notes, and its photo stays out of the article.";

    it("is an invalid reference when printed, with a message that says it is the room's working notes", () => {
      const result = factCheckContentBundle(baseArgs({
        sessionPhotos: PHOTOS, whiteboardPhoto: 'whiteboard.jpg', contentBundle: placing('aln0711-2.jpg', 'whiteboard.jpg')
      }));
      expect(result.photoReferences.invalid).toEqual(['whiteboard.jpg']);
      expect(result.structuralIssues).toEqual([
        `Invalid photo reference "whiteboard.jpg": ${WORKING_NOTES} Use one of [aln0711-1.jpg, aln0711-2.jpg] or remove the reference.`
      ]);
    });

    it('is an invalid reference as the hero too, matched by its basename from a path', () => {
      const result = factCheckContentBundle(baseArgs({
        sessionPhotos: PHOTOS,
        whiteboardPhoto: '/data/071126/photos/whiteboard.jpg',
        contentBundle: { sections: [], evidenceCards: [], heroImage: { filename: 'whiteboard.jpg' } }
      }));
      expect(result.photoReferences.invalid).toEqual(['whiteboard.jpg']);
      expect(result.structuralIssues[0]).toContain(WORKING_NOTES);
    });

    it('is offered by no fix line', () => {
      const result = factCheckContentBundle(baseArgs({
        sessionPhotos: PHOTOS, whiteboardPhoto: 'whiteboard.jpg', excludedPhotos: ['aln0711-2.jpg'], contentBundle: placing('ghost.jpg')
      }));
      expect(result.structuralIssues).toEqual([
        'Invalid photo reference "ghost.jpg": not one of this session\'s photos. Use one of [aln0711-1.jpg] or remove the reference.'
      ]);
    });

    it("is an invalid reference even when the session's photo list is empty, which leaves the other references unverified", () => {
      const result = factCheckContentBundle(baseArgs({
        sessionPhotos: [], whiteboardPhoto: 'whiteboard.jpg', contentBundle: placing('whiteboard.jpg')
      }));
      expect(result.photoReferences.invalid).toEqual(['whiteboard.jpg']);
      expect(result.structuralIssues).toEqual([`Invalid photo reference "whiteboard.jpg": ${WORKING_NOTES} Remove the reference.`]);
      expect(result.advisoryWarnings.filter((text) => /could not verify/i.test(text))).toEqual([
        "Could not verify 1 photo reference(s): this session's photo list is empty in state, so there is nothing to check the filenames against."
      ]);
    });
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
  // Brief 4.7a: `findings`, each hit with where it sits, is part of the shape.
  it('returns the documented shape for an empty bundle', () => {
    const result = factCheckContentBundle({});
    expect(result).toEqual({
      structuralIssues: [],
      advisoryWarnings: [],
      cardFidelity: [],
      rosterCoverage: { missing: [] },
      photoReferences: { invalid: [] },
      reporterMode: { violations: [] },
      findings: []
    });
  });

  it('does not throw on malformed sections/content', () => {
    expect(() => factCheckContentBundle({
      contentBundle: { sections: 'nope', evidenceCards: null, heroImage: 'a-string' },
      roster: [null, 42],
      sessionPhotos: [null],
      evidenceBundle: { exposed: { tokens: [null, { id: null }], paperEvidence: null } }
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
    evidenceBundle: { exposed: { tokens: [{ id: 'vic001', fullContent: SOURCE }] } },
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
      evidenceBundle: { exposed: { tokens: [{ id: 'vic001', fullContent: unicodeSource }] } },
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
        evidenceBundle: { exposed: { tokens: [{ id: tokenId, fullContent: source }] } },
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

// F1 (spec 2026-10-02 section 7): a structural hit located in the director's text, or
// caused by the director's cut, is the director's to weigh: an advisory under the one
// prefix and the edit's id. The same defect in the writer's text stays structural, and
// every existing message keeps its prefix.
describe('the director\'s edits are final (F1)', () => {
  const { standingAfterSendBack, carriedEdits, DIRECTOR_EDIT_PREFIX } = require('../hand-edit-diff');
  const paragraph = (text) => ({ type: 'paragraph', text });
  const NOT_VERBATIM = 'A sentence the director typed that appears nowhere in the memory itself.';

  /** The director's edits from `writers` to `directors`, as the bundle carries them. */
  const editsFor = (writers, directors) => carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
  const run = (writers, directors, extra = {}) => factCheckContentBundle(baseArgs({
    contentBundle: directors, directorEdits: editsFor(writers, directors), ...extra
  }));

  it('an inline card whose block is one of the director\'s edits is an advisory; the writer\'s is structural', () => {
    const writers = storyWith(paragraph('Vic leaned in at the bar.'));
    const directors = storyWith(paragraph('Vic leaned in at the bar.'), inlineCard({ content: NOT_VERBATIM }));
    const result = run(writers, directors);
    expect(result.structuralIssues).toEqual([]);
    expect(result.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E1: Evidence card "vic001" (in section "the-story") is not verbatim: its content does not appear in that document's text. Keep the card, and replace its content with sentences copied exactly from the document with that id in <RECORD>.`
    ]);
    expect(result.cardFidelity).toEqual([{ tokenId: 'vic001', ok: false, reason: 'not verbatim', locations: IN_STORY, directorEdit: 'E1' }]);

    const writersCard = factCheckContentBundle(baseArgs({ contentBundle: directors, directorEdits: [] }));
    expect(writersCard.structuralIssues).toEqual([expect.stringMatching(/^Evidence card "vic001" \(in section "the-story"\) is not verbatim/)]);
    expect(writersCard.cardFidelity[0]).not.toHaveProperty('directorEdit');
  });

  it('a reporter-mode phrase inside a block the director wrote is an advisory; in the writer\'s, structural', () => {
    const writers = storyWith(paragraph('The room voted at noon.'));
    const directors = storyWith(paragraph('The room voted at noon, and I voted with them.'));
    const result = run(writers, directors, { roster: [] });
    expect(result.structuralIssues).toEqual([]);
    expect(result.reporterMode.violations).toEqual([]);
    expect(result.advisoryWarnings).toEqual([expect.stringMatching(new RegExp(`^${DIRECTOR_EDIT_PREFIX}E1: Reporter-mode violation: "i voted"\\.`))]);

    const writersPhrase = run(storyWith(paragraph('x')), storyWith(paragraph('x'), paragraph('Then I voted with the room.')), {
      directorEdits: []
    });
    expect(writersPhrase.structuralIssues).toEqual([expect.stringMatching(/^Reporter-mode violation: "i voted"\./)]);
    expect(writersPhrase.reporterMode.violations).toEqual(['i voted']);
  });

  it('a photo reference in a block the director placed is an advisory; in the writer\'s, structural', () => {
    const photo = { type: 'photo', filename: 'not-ours.jpg', caption: 'The huddle' };
    const writers = storyWith(paragraph('Vic leaned in at the bar.'));
    const directors = storyWith(paragraph('Vic leaned in at the bar.'), photo);
    const result = run(writers, directors, { sessionPhotos: ['/photos/a.jpg'] });
    expect(result.structuralIssues).toEqual([]);
    expect(result.photoReferences.invalid).toEqual([]);
    expect(result.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E1: Invalid photo reference "not-ours.jpg": not one of this session's photos. Use one of [a.jpg] or remove the reference.`
    ]);

    const writersPhoto = factCheckContentBundle(baseArgs({ contentBundle: directors, sessionPhotos: ['/photos/a.jpg'], directorEdits: [] }));
    expect(writersPhoto.photoReferences.invalid).toEqual(['not-ours.jpg']);
    expect(writersPhoto.structuralIssues).toEqual([expect.stringMatching(/^Invalid photo reference "not-ours.jpg"/)]);
  });

  it('a roster player whose only mention the director cut is an advisory; a player the writer never named is structural', () => {
    const writers = storyWith(paragraph('Vic leaned in at the bar.'), paragraph('Kai said nothing all night.'));
    const directors = storyWith(paragraph('Vic leaned in at the bar.'));
    const result = run(writers, directors, { roster: ['Vic', 'Kai', 'Ashe'] });
    expect(result.rosterCoverage.missing).toEqual(['Ashe']);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Roster coverage gap: Ashe is on the session roster/)]);
    expect(result.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E1: Roster coverage gap: Kai is on the session roster, and the director's cut removed the only place the article named Kai.`
    ]);
  });

  it('with no edits every hit keeps its status and its message', () => {
    const bundle = storyWith(paragraph('Then I voted with the room.'), inlineCard({ content: NOT_VERBATIM }));
    const withNone = factCheckContentBundle(baseArgs({ contentBundle: bundle }));
    const withEmpty = factCheckContentBundle(baseArgs({ contentBundle: bundle, directorEdits: [] }));
    expect(withEmpty).toEqual(withNone);
    expect(withNone.structuralIssues).toHaveLength(2);
    expect(withNone.advisoryWarnings.filter((w) => w.startsWith(DIRECTOR_EDIT_PREFIX))).toEqual([]);
  });
});

// FA (requirements 2, 9, 10 and 12; known items 6 and 7): the fact check locates a hit in
// the field the director changed, never the whole block; a sidebar card the director
// edited is located like an inline card; the photo check and roster coverage's hero read
// the photos the page prints (lib/publish-photos.js printedPhotos); a roster gap is the
// director's only for a name the director's version no longer held when sent back.
describe('the director\'s edits, field by field, at the fact check (FA)', () => {
  const { standingAfterSendBack, carriedEdits, DIRECTOR_EDIT_PREFIX, sectionKey } = require('../hand-edit-diff');
  const { _testing: { sectionKeyOf } } = require('../content-bundle-fact-check');
  const paragraph = (text) => ({ type: 'paragraph', text });
  const photo = (filename, caption) => ({ type: 'photo', filename, caption });
  const NOT_VERBATIM = 'A sentence the director typed that appears nowhere in the memory itself.';
  const editsFor = (writers, directors, options) => carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle', options), directors);
  const run = (writers, directors, extra = {}, options) => factCheckContentBundle(baseArgs({
    contentBundle: directors, directorEdits: editsFor(writers, directors, options), ...extra
  }));

  it('a card whose headline alone the director changed is the writer\'s card: content that is not verbatim stays structural', () => {
    const writers = storyWith(inlineCard({ content: NOT_VERBATIM }));
    const directors = storyWith(inlineCard({ content: NOT_VERBATIM, headline: 'The Offer, in her words' }));
    const result = run(writers, directors);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Evidence card "vic001" \(in section "the-story"\) is not verbatim/)]);
    expect(result.cardFidelity[0]).not.toHaveProperty('directorEdit');
    expect(result.advisoryWarnings.filter((w) => w.startsWith(DIRECTOR_EDIT_PREFIX))).toEqual([]);
  });

  it('a card whose content the director wrote is a concern', () => {
    const result = run(storyWith(inlineCard()), storyWith(inlineCard({ content: NOT_VERBATIM })));
    expect(result.structuralIssues).toEqual([]);
    expect(result.advisoryWarnings).toEqual([
      expect.stringMatching(new RegExp(`^${DIRECTOR_EDIT_PREFIX}E1: Evidence card "vic001" \\(in section "the-story"\\) is not verbatim`))
    ]);
  });

  it('an unknown source on a card the director edited is a concern, inline or in the sidebar', () => {
    const inline = run(
      storyWith(inlineCard({ tokenId: 'nope999', content: 'x' })),
      storyWith(inlineCard({ tokenId: 'nope999', content: 'x', headline: 'Her offer' }))
    );
    expect(inline.structuralIssues).toEqual([]);
    expect(inline.advisoryWarnings).toEqual([
      expect.stringMatching(new RegExp(`^${DIRECTOR_EDIT_PREFIX}E1: Evidence card "nope999" \\(in section "the-story"\\) has an unknown source`))
    ]);
    const sidebar = (summary) => ({ sections: [], evidenceCards: [card({ tokenId: 'nope999', summary })] });
    const fromSidebar = run(sidebar('A threat'), sidebar('A threat to Marcus, signed by nobody.'));
    expect(fromSidebar.structuralIssues).toEqual([]);
    expect(fromSidebar.advisoryWarnings).toEqual([
      expect.stringMatching(new RegExp(`^${DIRECTOR_EDIT_PREFIX}E1: Evidence card "nope999" \\(in the sidebar\\) has an unknown source`))
    ]);
    expect(fromSidebar.cardFidelity).toEqual([expect.objectContaining({ tokenId: 'nope999', directorEdit: 'E1' })]);
  });

  it('a photo whose caption alone the director changed is the writer\'s reference; one whose filename the director set is a concern', () => {
    const captioned = run(
      storyWith(photo('not-ours.jpg', 'The huddle')),
      storyWith(photo('not-ours.jpg', 'Mel lays out the theory, and the room leans in.')),
      { sessionPhotos: ['/photos/a.jpg'] }
    );
    expect(captioned.photoReferences.invalid).toEqual(['not-ours.jpg']);
    expect(captioned.structuralIssues).toEqual([expect.stringMatching(/^Invalid photo reference "not-ours.jpg"/)]);
    // Task 4.5d: a photo pairs only with a photo of its own name, so a filename the director
    // set is a cut of the writer's photo (E1) and an addition of theirs (E2), the photo the
    // concern is about.
    const placed = run(storyWith(photo('a.jpg', 'The huddle')), storyWith(photo('not-ours.jpg', 'The huddle')), { sessionPhotos: ['/photos/a.jpg'] });
    expect(placed.photoReferences.invalid).toEqual([]);
    expect(placed.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E2: Invalid photo reference "not-ours.jpg": not one of this session's photos. Use one of [a.jpg] or remove the reference.`
    ]);
  });

  it('the photo check reads the photos the page prints: a detective hero never prints, so it is not checked', () => {
    const bundle = {
      heroImage: { filename: 'not-ours.jpg', caption: 'The huddle' },
      sections: [{ id: 'the-story', type: 'narrative', content: [paragraph('Vic leaned in.')] }],
      evidenceCards: []
    };
    const detective = factCheckContentBundle(baseArgs({ contentBundle: bundle, sessionPhotos: ['/photos/a.jpg'], theme: 'detective' }));
    expect(detective.photoReferences.invalid).toEqual([]);
    expect(detective.structuralIssues.filter((i) => i.startsWith('Invalid photo reference'))).toEqual([]);
    const journalist = factCheckContentBundle(baseArgs({ contentBundle: bundle, sessionPhotos: ['/photos/a.jpg'] }));
    expect(journalist.photoReferences.invalid).toEqual(['not-ours.jpg']);
  });

  it('roster coverage reads the hero\'s caption only when the hero prints', () => {
    const story = [{ id: 'the-story', type: 'narrative', content: [paragraph('Vic leaned in.')] }];
    const unprinted = factCheckContentBundle(baseArgs({
      contentBundle: { heroImage: { caption: 'Kai at the dictionary safe' }, sections: story, evidenceCards: [] },
      roster: ['Kai', 'Vic']
    }));
    expect(unprinted.rosterCoverage.missing).toEqual(['Kai']);
    const printed = factCheckContentBundle(baseArgs({
      contentBundle: { heroImage: { filename: 'a.jpg', caption: 'Kai at the dictionary safe' }, sections: story, evidenceCards: [] },
      roster: ['Kai', 'Vic'],
      sessionPhotos: ['/photos/a.jpg']
    }));
    expect(printed.rosterCoverage.missing).toEqual([]);
  });

  it('a roster gap is the director\'s only for a name the director\'s version no longer held when sent back', () => {
    const writers = storyWith(paragraph('Sarah kept the count.'), paragraph('Sarah left early.'), paragraph('Vic leaned in at the bar.'));
    const directors = storyWith(paragraph('Sarah left early.'), paragraph('Vic leaned in at the bar.'));
    const standing = standingAfterSendBack(null, writers, directors, 'bundle', { names: ['Sarah', 'Vic'] });
    const later = storyWith(paragraph('Vic leaned in at the bar.'));   // a rework dropped the other mention
    const result = factCheckContentBundle(baseArgs({ contentBundle: later, roster: ['Sarah', 'Vic'], directorEdits: carriedEdits(standing, later) }));
    expect(result.rosterCoverage.missing).toEqual(['Sarah']);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Roster coverage gap: Sarah is on the session roster but never named/)]);
    expect(result.advisoryWarnings.filter((w) => w.startsWith(DIRECTOR_EDIT_PREFIX))).toEqual([]);
  });

  it('a gap the director\'s cut caused, recorded at the send-back, is a concern', () => {
    const writers = storyWith(paragraph('Vic leaned in at the bar.'), paragraph('Kai said nothing all night.'));
    const directors = storyWith(paragraph('Vic leaned in at the bar.'));
    const result = run(writers, directors, { roster: ['Vic', 'Kai'] }, { names: ['Vic', 'Kai'] });
    expect(result.rosterCoverage.missing).toEqual([]);
    expect(result.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E1: Roster coverage gap: Kai is on the session roster, and the director's cut removed the only place the article named Kai.`
    ]);
  });

  it('keys a section as the director\'s edits do', () => {
    expect(typeof sectionKey).toBe('function');
    expect(sectionKeyOf).toBe(sectionKey);
  });
});

// FA fix round 1, finding 2: a move is the block's place only. A block the director moved
// without changing it is still the writer's, field by field, so a hit in it keeps its
// status: the whiteboard, a card that is not verbatim, a card with an unknown source or a
// reporter-mode phrase reaches the automatic pass as the writer's must-fix.
describe('a block the director only moved is the writer\'s at the fact check (FA, fix round 1)', () => {
  const { standingAfterSendBack, carriedEdits, DIRECTOR_EDIT_PREFIX } = require('../hand-edit-diff');
  const paragraph = (text) => ({ type: 'paragraph', text });
  const NOT_VERBATIM = 'An invented sentence that appears in no document of this session.';
  const WHITEBOARD = { type: 'photo', filename: 'whiteboard.jpg', caption: "The room's working notes" };
  /** Two sections, with `blocks` at the end of the one at `where`. */
  const twoSections = (where, blocks) => {
    const bundle = {
      sections: [
        { id: 'the-story', type: 'narrative', content: [paragraph('Vic leaned in at the bar.')] },
        { id: 'closing', type: 'narrative', content: [paragraph('Whether the verdict costs Alex anything is still open.')] }
      ],
      evidenceCards: []
    };
    bundle.sections[where].content.push(...blocks.map((block) => JSON.parse(JSON.stringify(block))));
    return bundle;
  };
  /** The fact check on the director's version, where `blocks` moved from THE STORY to the closing. */
  const movedRun = (blocks, extra = {}) => {
    const directors = twoSections(1, blocks);
    const directorEdits = carriedEdits(standingAfterSendBack(null, twoSections(0, blocks), directors, 'bundle'), directors);
    return { directorEdits, result: factCheckContentBundle(baseArgs({ contentBundle: directors, directorEdits, ...extra })) };
  };

  it('the whiteboard, a card that is not verbatim and a card with an unknown source stay structural', () => {
    const { directorEdits, result } = movedRun(
      [WHITEBOARD, inlineCard({ content: NOT_VERBATIM }), inlineCard({ tokenId: 'nope999', content: 'x' })],
      { sessionPhotos: ['/photos/a.jpg', '/photos/whiteboard.jpg'], whiteboardPhoto: 'whiteboard.jpg' }
    );
    expect(directorEdits.map((e) => [e.id, e.from])).toEqual([['E1', 'the-story'], ['E2', 'the-story'], ['E3', 'the-story']]);
    expect(result.structuralIssues).toEqual([
      expect.stringMatching(/^Evidence card "vic001" \(in section "closing"\) is not verbatim/),
      expect.stringMatching(/^Evidence card "nope999" \(in section "closing"\) has an unknown source/),
      expect.stringMatching(/^Invalid photo reference "whiteboard.jpg": this is the whiteboard/)
    ]);
    expect(result.photoReferences.invalid).toEqual(['whiteboard.jpg']);
    expect(result.cardFidelity.filter((item) => item.directorEdit)).toEqual([]);
    expect(result.advisoryWarnings.filter((w) => w.startsWith(DIRECTOR_EDIT_PREFIX))).toEqual([]);
  });

  it('a reporter-mode phrase in a paragraph the director moved stays structural', () => {
    const { result } = movedRun([paragraph('Then I voted with the room.')]);
    expect(result.reporterMode.violations).toEqual(['i voted']);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Reporter-mode violation: "i voted"\./)]);
    expect(result.advisoryWarnings.filter((w) => w.startsWith(DIRECTOR_EDIT_PREFIX))).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Brief 4.7a (phase 4; spec 6.2 and 6.3): the fact check returns each finding with its
// place, so the desk can mark it beside its paragraph (4.10); its roster check covers the
// players the map, as the director left it, places; and it counts words one way, with
// lib/word-count.js. The judge's half of the brief is in article-judge.test.js.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.7a: each finding with its place', () => {
  const { DIRECTOR_EDIT_PREFIX, standingAfterSendBack, carriedEdits } = require('../hand-edit-diff');
  const DASHED = 'Vic signed—and Mel watched the ledger.';
  const NOT_VERBATIM = 'Vic told me the job was already handed out to somebody else.';

  /** One section holding a paragraph with an em-dash, a card that is not verbatim and a photo the session never took. */
  const located = (extra = {}) => factCheckContentBundle(baseArgs({
    sessionPhotos: ['/photos/a.jpg'],
    contentBundle: {
      headline: { main: 'The Offer', deck: 'A deck—with a dash.' },
      heroImage: { filename: 'hero-not-ours.jpg', caption: 'The room at noon.' },
      sections: [{
        id: 'the-story', type: 'narrative', content: [
          { type: 'paragraph', text: 'Vic never looked up.' },
          { type: 'paragraph', text: DASHED },
          inlineCard({ content: NOT_VERBATIM }),
          { type: 'photo', filename: 'nope.jpg', caption: 'Mel at the ledger.' }
        ]
      }],
      evidenceCards: [card({ tokenId: 'nope999', headline: 'A card no document backs' })]
    },
    ...extra
  }));

  it('a paragraph: the section id and the paragraph ordinal, with an excerpt and its message', () => {
    const result = located();
    const message = result.advisoryWarnings.find((w) => w.startsWith("Em-dash in the narrator's prose:"));
    // Brief 4.10b: each finding also carries the director's line for its place (4.10c: counting
    // the em-dashes outside quoted speech, as the check does).
    expect(result.findings.filter((f) => f.kind === 'emDash' && f.place && f.place.section)).toEqual([
      { kind: 'emDash', status: 'advisory', place: { section: 'the-story', paragraph: 2 }, excerpt: DASHED, message, line: 'This paragraph has an em-dash outside quoted speech; house style uses none.' }
    ]);
  });

  it('a card: its id, with the section it sits in, or the sidebar', () => {
    const result = located();
    const notVerbatim = result.structuralIssues.find((m) => m.startsWith('Evidence card "vic001"'));
    const unknown = result.structuralIssues.find((m) => m.startsWith('Evidence card "nope999"'));
    expect(result.findings.filter((f) => f.kind === 'cardFidelity')).toEqual([
      {
        kind: 'cardFidelity', status: 'structural', place: { tokenId: 'vic001', section: 'the-story' }, excerpt: 'The Offer', message: notVerbatim,
        line: "This card's text does not match {document} word for word."
      },
      {
        kind: 'cardFidelity', status: 'structural', place: { tokenId: 'nope999', sidebar: true }, excerpt: 'A card no document backs', message: unknown,
        line: 'No memory or paper document from this session has the ID this sidebar card cites, "nope999".'
      }
    ]);
  });

  it('a photo: its filename, with the section it sits in, or the hero', () => {
    const result = located();
    const of = (filename) => result.structuralIssues.find((m) => m.startsWith(`Invalid photo reference "${filename}"`));
    expect(result.findings.filter((f) => f.kind === 'photoReferences')).toEqual([
      {
        kind: 'photoReferences', status: 'structural', place: { filename: 'hero-not-ours.jpg', hero: true }, excerpt: 'The room at noon.', message: of('hero-not-ours.jpg'),
        line: "This photo, hero-not-ours.jpg, is not one of the session's photos."
      },
      {
        kind: 'photoReferences', status: 'structural', place: { filename: 'nope.jpg', section: 'the-story' }, excerpt: 'Mel at the ledger.', message: of('nope.jpg'),
        line: "This photo, nope.jpg, is not one of the session's photos."
      }
    ]);
  });

  it('the headline, the kicker and the deck: the field', () => {
    const result = located();
    const finding = result.findings.find((f) => f.kind === 'emDash' && f.place && f.place.field);
    expect(finding).toEqual(expect.objectContaining({ place: { field: 'headline.deck' }, excerpt: 'A deck—with a dash.' }));
  });

  it('every message has a finding, and every finding carries a message from the list its status names', () => {
    const result = located({ roster: ['Vic', 'Mel', 'Kai'], reportingMode: 'remote' });
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      const list = finding.status === 'structural' ? result.structuralIssues : result.advisoryWarnings;
      expect([finding.kind, list.includes(finding.message)]).toEqual([finding.kind, true]);
    }
    for (const message of [...result.structuralIssues, ...result.advisoryWarnings]) {
      expect([message, result.findings.some((f) => f.message === message)]).toEqual([message, true]);
    }
    // A player the article never names has no place to sit beside.
    expect(result.findings.find((f) => f.kind === 'rosterCoverage')).toEqual(expect.objectContaining({ place: null, status: 'structural' }));
  });

  it('a hit in one of the director\'s edits carries the edit\'s id', () => {
    const writers = storyWith({ type: 'paragraph', text: 'Vic leaned in at the bar.' });
    const directors = storyWith({ type: 'paragraph', text: 'Vic leaned in at the bar.' }, inlineCard({ content: NOT_VERBATIM }));
    const directorEdits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    const result = factCheckContentBundle(baseArgs({ contentBundle: directors, directorEdits }));
    expect(result.findings).toEqual([{
      kind: 'cardFidelity', status: 'advisory', place: { tokenId: 'vic001', section: 'the-story' }, excerpt: 'The Offer',
      message: result.advisoryWarnings[0], line: "This card's text does not match {document} word for word.", editId: 'E1'
    }]);
    expect(result.advisoryWarnings[0].startsWith(`${DIRECTOR_EDIT_PREFIX}E1: `)).toBe(true);
  });

  // R11: a finding located in the director's text is a concern. A phrase in the writer's
  // paragraph and in one the director wrote is the writer's hit, marked at the writer's
  // paragraph alone.
  it('a structural reporter-mode hit is marked at the writer\'s pieces only, never beside the director\'s line', () => {
    const para = (text) => ({ type: 'paragraph', text });
    const writers = storyWith(para('The room voted at noon.'), para('Then I voted with the room.'));
    const directors = storyWith(para('The room voted at noon, and I voted with them.'), para('Then I voted with the room.'));
    const directorEdits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    const result = factCheckContentBundle(baseArgs({ contentBundle: directors, directorEdits }));
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Reporter-mode violation: "i voted"\./)]);
    expect(result.findings.filter((f) => f.kind === 'reporterMode')).toEqual([
      {
        kind: 'reporterMode', status: 'structural', place: { section: 'the-story', paragraph: 2 }, excerpt: 'I voted', message: result.structuralIssues[0],
        line: '"I voted" makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.'
      }
    ]);
  });

  // 4.10 anchors a mark on its excerpt once the block has changed, so an excerpt is the
  // page's own text at the finding's place, whatever folded copy the check read: the
  // narrator's prose with its quoted spans taken out, or the lowercased text the phrase
  // lists match.
  it('every excerpt is the text the page prints at the finding\'s place', () => {
    const LEAK = 'The job is yours, Vic, and nobody else gets a say.';
    const bundle = {
      headline: { main: 'The Offer' },
      sections: [{
        id: 'the-story', type: 'narrative', content: [
          { type: 'paragraph', text: 'Mel said “never”—and left the room. I wasn’t there.' },
          { type: 'paragraph', text: 'Then I voted with the room, and the “final” tier opened.' },
          { type: 'paragraph', text: 'Nova read the “ledger” twice before she left. I was not in the room.' },
          inlineCard({ content: LEAK })
        ]
      }],
      evidenceCards: []
    };
    const result = factCheckContentBundle(baseArgs({ reportingMode: 'remote', contentBundle: bundle }));
    const blocks = bundle.sections[0].content;
    const paragraphs = blocks.filter((b) => b.type === 'paragraph');
    /** The text the page prints at a place. */
    const printedAt = (place) => {
      if (place.field) return bundle.headline[place.field.split('.')[1]];
      if (place.paragraph) return paragraphs[place.paragraph - 1].text;
      if (place.tokenId) return blocks.filter((b) => b.tokenId === place.tokenId).map((b) => `${b.headline} ${b.content}`).join(' ');
      return blocks.map((b) => b.text || b.content || '').join(' ');
    };
    const excerpts = result.findings.filter((f) => f.excerpt !== null && f.place);
    expect(excerpts.map((f) => f.kind).sort()).toEqual(
      ['cardFidelity', 'emDash', 'leakedExample', 'novaPronoun', 'productionWords', 'repeatedAbsence', 'repeatedAbsence', 'reporterMode']
    );
    for (const finding of excerpts) {
      expect([finding.kind, printedAt(finding.place).includes(finding.excerpt)]).toEqual([finding.kind, true]);
    }
    const excerptOf = (kind) => excerpts.filter((f) => f.kind === kind).map((f) => f.excerpt);
    expect(excerptOf('reporterMode')).toEqual(['I voted']);
    expect(excerptOf('leakedExample')).toEqual(['The job is yours']);
    expect(excerptOf('novaPronoun')).toEqual(['Nova read the “ledger” twice before she']);
    expect(excerptOf('repeatedAbsence')).toEqual(['I wasn’t there', 'I was not in the room']);
    expect(excerptOf('emDash')[0]).toContain('said “never”—and left');
    expect(excerptOf('productionWords')[0]).toContain('the “final” tier opened');
  });

  // 4.10 marks the length on a section's heading: a finding at each section whose
  // paragraphs the count covers. The headline's and the deck's words are in the message.
  it('the length: a finding at each section the count covers, by the section\'s id', () => {
    const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        headline: { main: 'Short', deck: 'A deck of six words here.' },
        sections: [
          { id: 'the-story', type: 'narrative', content: [{ type: 'paragraph', text: words(1000) }, { type: 'paragraph', text: words(10) }] },
          { id: 'closing', type: 'narrative', content: [{ type: 'quote', text: 'Not counted.' }, { type: 'paragraph', text: words(900) }] }
        ],
        evidenceCards: []
      }
    }));
    const message = result.advisoryWarnings.find((w) => w.startsWith('Over length:'));
    expect(message).toContain('the-story 1,010, closing 900');
    // 4.10c: the line counts the article's words of prose.
    expect(result.findings.filter((f) => f.kind === 'length')).toEqual([
      { kind: 'length', status: 'advisory', place: { section: 'the-story' }, excerpt: null, message, line: "This section has 1,010 of the article's 1,917 words of prose; the article aims at about 1,500." },
      { kind: 'length', status: 'advisory', place: { section: 'closing' }, excerpt: null, message, line: "This section has 900 of the article's 1,917 words of prose; the article aims at about 1,500." }
    ]);
  });
});

describe('4.7a: the roster check covers the players the map places', () => {
  const paragraphs = (...texts) => ({ sections: [{ id: 'the-story', type: 'narrative', content: texts.map((text) => ({ type: 'paragraph', text })) }], evidenceCards: [] });

  it('a roster player the map does not place is the director\'s decision, and no finding', () => {
    const result = factCheckContentBundle(baseArgs({
      roster: ['Vic', 'Mel', 'Kai'], placedPlayers: ['Vic', 'Mel'],
      contentBundle: paragraphs('Vic and Mel argued at the bar.')
    }));
    expect(result.rosterCoverage.missing).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
    expect(result.findings.filter((f) => f.kind === 'rosterCoverage')).toEqual([]);
  });

  it('a player the map places and the article never names is a gap, with the map\'s beat as its fix', () => {
    const result = factCheckContentBundle(baseArgs({
      roster: ['Vic', 'Mel', 'Kai'], placedPlayers: ['Vic', 'Mel'],
      contentBundle: paragraphs('Vic argued at the bar.')
    }));
    expect(result.rosterCoverage.missing).toEqual(['Mel']);
    expect(result.structuralIssues).toEqual([
      'Roster coverage gap: Mel is on the session roster and placed in a beat on the map, but never named anywhere the reader can see. Write the beat the map gives each of them.'
    ]);
  });

  it('with no map, every roster player is checked, as C7 asks', () => {
    const result = factCheckContentBundle(baseArgs({ roster: ['Vic', 'Mel'], contentBundle: paragraphs('Vic argued at the bar.') }));
    expect(result.rosterCoverage.missing).toEqual(['Mel']);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Roster coverage gap: Mel is on the session roster but never named anywhere the reader can see\./)]);
  });

  it('buildFactCheckArgs gives it the players the map as the director left it places, through mapTally', () => {
    const { _testing: { buildFactCheckArgs } } = require('../workflow/nodes/evaluator-nodes');
    const { reworkFixtureState, MAP } = require('./fixtures/rework-state');
    const map = JSON.parse(JSON.stringify(MAP));
    // Riley leaves the map: off the envelope beat, and the closing's line struck to leftOut.
    map.sections[1].beats[1].players = ['Morgan'];
    const [line] = map.sections[3].beats.splice(0, 1);
    map.leftOut.push(line);
    const state = { ...reworkFixtureState('journalist'), outline: map, contentBundle: paragraphs('Alex, Morgan and Sarah argued.') };
    expect(buildFactCheckArgs(state).placedPlayers).toEqual(['Alex', 'Morgan', 'Sarah']);
    const result = factCheckContentBundle(buildFactCheckArgs(state));
    expect(result.rosterCoverage.missing).toEqual([]);
    expect(result.structuralIssues.filter((m) => m.startsWith('Roster coverage gap:'))).toEqual([]);
    // A state with no map hands it no placed players, so every roster player is checked.
    expect(buildFactCheckArgs({ ...state, outline: {} }).placedPlayers).toBeUndefined();
  });
});

// T1 (section B of the rule-text read): the director's answers at the story meeting count
// like the notes, so the fact check's director text holds them (a pronoun an answer gives is
// not invented), and the verdict guard reads them as record.
describe('4.7a: the fact check reads the director\'s answers as the director\'s words', () => {
  const { _testing: { buildFactCheckArgs } } = require('../workflow/nodes/evaluator-nodes');
  const { reworkFixtureState } = require('./fixtures/rework-state');

  it('buildFactCheckArgs puts each answer, word for word, in the director text', () => {
    const state = reworkFixtureState('journalist');
    state.weave.questions[0].answer = 'Sarah ran the bar all morning, and Blake said she was never paid.';
    const { directorText } = buildFactCheckArgs(state);
    expect(directorText).toContain('Sarah ran the bar all morning, and Blake said she was never paid.');
    expect(directorText).toContain(state.directorNotes.rawProse);
  });

  it('an unanswered question adds nothing to it', () => {
    const state = reworkFixtureState('journalist');
    expect(buildFactCheckArgs(state).directorText).not.toContain(state.weave.questions[0].question);
  });
});

describe('4.7a: one word count', () => {
  it('the length check counts words with lib/word-count.js', () => {
    jest.isolateModules(() => {
      jest.doMock('../word-count', () => ({ wordCount: () => 1000 }));
      const { factCheckContentBundle: isolated } = require('../content-bundle-fact-check');
      const result = isolated(baseArgs({ contentBundle: { headline: { main: 'Short' }, sections: [{ id: 's', type: 'narrative', content: [{ type: 'paragraph', text: 'Two words.' }] }] } }));
      expect(result.advisoryWarnings).toEqual([expect.stringMatching(/^Over length: the narrator's prose \(headline, deck and paragraphs\) runs 2,000 words/)]);
    });
    jest.dontMock('../word-count');
  });
});

// Brief 4.7c (4.7a's minor 5): a reporter-mode phrase in several of the director's pieces
// under different edits is a concern on each of them. Each finding sits at its own piece
// and carries that piece's edit, so the desk marks each of the director's lines with its
// own edit, and its message is that edit's concern.
describe("4.7c: a reporter-mode finding names its own edit", () => {
  const { standingAfterSendBack, carriedEdits, DIRECTOR_EDIT_PREFIX } = require('../hand-edit-diff');
  const para = (text) => ({ type: 'paragraph', text });

  it("a phrase in two of the director's paragraphs under two edits: each finding carries its own paragraph's editId", () => {
    const writers = storyWith(para('The room voted at noon.'), para('The count came at one.'));
    const directors = storyWith(para('The room voted at noon, and I voted with them.'), para('The count came at one, and I voted again.'));
    const directorEdits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    expect(directorEdits.map((edit) => edit.id)).toEqual(['E1', 'E2']);

    const result = factCheckContentBundle(baseArgs({ contentBundle: directors, directorEdits }));
    expect(result.structuralIssues).toEqual([]);
    expect(result.reporterMode.violations).toEqual([]);
    const findings = result.findings.filter((finding) => finding.kind === 'reporterMode');
    expect(findings.map(({ status, place, excerpt, editId }) => ({ status, place, excerpt, editId }))).toEqual([
      { status: 'advisory', place: { section: 'the-story', paragraph: 1 }, excerpt: 'I voted', editId: 'E1' },
      { status: 'advisory', place: { section: 'the-story', paragraph: 2 }, excerpt: 'I voted', editId: 'E2' }
    ]);
    // Each finding's message is its own edit's concern, filed among the advisories.
    for (const finding of findings) {
      expect(finding.message.startsWith(`${DIRECTOR_EDIT_PREFIX}${finding.editId}: Reporter-mode violation: "i voted".`)).toBe(true);
      expect(result.advisoryWarnings).toContain(finding.message);
    }
  });

  it('two pieces under one edit, a section the director added whole: one concern, a finding at each piece', () => {
    const writers = storyWith(para('The room voted at noon.'));
    const aside = { id: 'aside', type: 'narrative', content: [para('I voted early.'), para('Then I voted again.')] };
    const directors = { ...writers, sections: [...writers.sections, aside] };
    const directorEdits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    expect(directorEdits.map((edit) => [edit.id, edit.path])).toEqual([['E1', 'sections[#aside]']]);

    const result = factCheckContentBundle(baseArgs({ contentBundle: directors, directorEdits }));
    const findings = result.findings.filter((finding) => finding.kind === 'reporterMode');
    expect(findings.map(({ place, editId }) => [place, editId])).toEqual([
      [{ section: 'aside', paragraph: 1 }, 'E1'],
      [{ section: 'aside', paragraph: 2 }, 'E1']
    ]);
    expect(result.advisoryWarnings.filter((warning) => warning.includes('Reporter-mode violation'))).toEqual([findings[0].message]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Brief 4.10b: each finding carries the director's line for its place (`line`), beside the
// rework's message. The desk marks the finding with the line: what is wrong in the article
// and where, naming documents and people as the director's screens do, with no pipeline
// terms. A finding at several places has that place's part. The message, which the rework
// reads, and its prefix stay as they were. A card's document is the desk's to name: the line
// holds DOCUMENT_SLOT where the document goes.
// ═══════════════════════════════════════════════════════════════════════════
describe("4.10b: each finding carries the director's line for its place", () => {
  const { DOCUMENT_SLOT } = require('../content-bundle-fact-check');
  const { standingAfterSendBack, carriedEdits } = require('../hand-edit-diff');
  const para = (text) => ({ type: 'paragraph', text });
  const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  const NOT_VERBATIM = 'Vic told me the job was already handed out to somebody else.';
  /** Each finding of a kind as [its place, its line]. */
  const linesOf = (result, kind) => result.findings.filter((f) => f.kind === kind).map((f) => [f.place, f.line]);

  it("a card: its text against the document it cites, which the desk names; a card that cites no document, inline or in the sidebar", () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        sections: [{ id: 'the-story', type: 'narrative', content: [inlineCard({ content: NOT_VERBATIM }), inlineCard({ tokenId: 'ghost1', headline: 'Nobody', content: 'Nothing at all.' })] }],
        evidenceCards: [card({ tokenId: 'nope999', headline: 'A card no document backs' })]
      }
    }));
    expect(DOCUMENT_SLOT).toBe('{document}');
    expect(linesOf(result, 'cardFidelity')).toEqual([
      [{ tokenId: 'vic001', section: 'the-story' }, "This card's text does not match {document} word for word."],
      [{ tokenId: 'ghost1', section: 'the-story' }, 'No memory or paper document from this session has the ID this card cites, "ghost1".'],
      [{ tokenId: 'nope999', sidebar: true }, 'No memory or paper document from this session has the ID this sidebar card cites, "nope999".']
    ]);
  });

  it('an example line from the instructions: in a card, and in a quote', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(inlineCard({ tokenId: 'paper-1', content: 'The job is yours.' }), { type: 'quote', text: 'The job is yours, Vic.', attribution: 'Someone' })
    }));
    expect(linesOf(result, 'leakedExample')).toEqual([
      [{ tokenId: 'paper-1', section: 'the-story' }, 'This card holds "The job is yours", an example line from the writer\'s instructions; check that {document} says it.'],
      [{ section: 'the-story' }, 'This quote holds "The job is yours", an example line from the writer\'s instructions; check that someone in the session said it.']
    ]);
  });

  it("a photo: not the session's, one the director left out, the whiteboard, and one with no photo list to check it against", () => {
    const photo = (filename) => ({ type: 'photo', filename, caption: `The caption of ${filename}.` });
    const result = factCheckContentBundle(baseArgs({
      sessionPhotos: ['/p/kept.jpg', '/p/gone.jpg', '/p/wb.jpg'], excludedPhotos: ['/p/gone.jpg'], whiteboardPhoto: '/p/wb.jpg',
      contentBundle: storyWith(photo('nope.jpg'), photo('gone.jpg'), photo('wb.jpg'))
    }));
    // 4.10c: the photo the director left out says the article still prints it.
    expect(linesOf(result, 'photoReferences')).toEqual([
      [{ filename: 'nope.jpg', section: 'the-story' }, "This photo, nope.jpg, is not one of the session's photos."],
      [{ filename: 'gone.jpg', section: 'the-story' }, 'The article still prints this photo, gone.jpg, which you left out.'],
      [{ filename: 'wb.jpg', section: 'the-story' }, "This photo, wb.jpg, is the whiteboard: the room's working notes, which stay out of the article."]
    ]);
    const unchecked = factCheckContentBundle(baseArgs({ contentBundle: storyWith(photo('kept.jpg')) }));
    expect(linesOf(unchecked, 'photoReferences')).toEqual([
      [{ filename: 'kept.jpg', section: 'the-story' }, "The session's photo list is empty, so this photo, kept.jpg, could not be checked."]
    ]);
  });

  it("the roster: a player on the map, a player on the roster, and a player whose only mention the director's cut took out", () => {
    const article = storyWith(para('Vic argued at the bar.'));
    expect(linesOf(factCheckContentBundle(baseArgs({ roster: ['Vic', 'Mel'], placedPlayers: ['Vic', 'Mel'], contentBundle: article })), 'rosterCoverage'))
      .toEqual([[null, 'Mel is on the map but never named in the article.']]);
    expect(linesOf(factCheckContentBundle(baseArgs({ roster: ['Vic', 'Mel', 'Kai'], contentBundle: article })), 'rosterCoverage'))
      .toEqual([[null, 'Mel and Kai are on the roster but never named in the article.']]);
    const writers = storyWith(para('Vic argued at the bar.'), para('Mel and Kai watched the ledger.'));
    const directors = storyWith(para('Vic argued at the bar.'));
    const directorEdits = carriedEdits(standingAfterSendBack(null, writers, directors, 'bundle'), directors);
    const cut = factCheckContentBundle(baseArgs({ roster: ['Vic', 'Mel', 'Kai'], contentBundle: directors, directorEdits }));
    expect(cut.findings.filter((f) => f.kind === 'rosterCoverage').map((f) => [f.status, f.line]))
      .toEqual([['advisory', 'Your cut took out the only mentions of Mel and Kai in the article.']]);
  });

  it("the reporter's place: a vote, a claim to have been in the room on a remote session, and a phrase that runs across two paragraphs", () => {
    const remote = factCheckContentBundle(baseArgs({
      reportingMode: 'remote', contentBundle: storyWith(para('Then I voted with the room.'), para('I was in the room when it ended.'))
    }));
    expect(linesOf(remote, 'reporterMode')).toEqual([
      [{ section: 'the-story', paragraph: 1 }, '"I voted" makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.'],
      [{ section: 'the-story', paragraph: 2 }, '"I was in the room" puts the reporter in the room, but the reporter covered this session remotely.']
    ]);
    // 4.10c: the phrase as the article prints it, across two pieces.
    const across = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para('The vote came and I'), para('voted again.')) }));
    expect(linesOf(across, 'reporterMode')).toEqual([
      [null, '"I voted" (across two pieces) makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.']
    ]);
  });

  it('a statement that the reporter was not in the room, each with how many the article holds', () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote', contentBundle: storyWith(para('I was not in the room.'), para("I wasn't there when the vote came."))
    }));
    expect(linesOf(result, 'repeatedAbsence')).toEqual([
      [{ section: 'the-story', paragraph: 1 }, '"I was not in the room" is one of 2 places the article says the reporter was not in the room; once, early, is enough.'],
      [{ section: 'the-story', paragraph: 2 }, '"I wasn\'t there" is one of 2 places the article says the reporter was not in the room; once, early, is enough.']
    ]);
  });

  it('a pronoun: Marcus, Blake with none given, Blake with one given, and Nova', () => {
    const NPCS = [{ name: 'Marcus', pronouns: 'he/him' }, { name: 'Blake' }, { name: 'Nova' }];
    const result = factCheckContentBundle(baseArgs({
      theme: 'journalist', npcs: NPCS,
      contentBundle: storyWith(para('Marcus said they would pay.'), para('Blake counted his money.'), para('Nova said she was not sure.'))
    }));
    expect(linesOf(result, 'npcPronouns')).toEqual([
      [{ section: 'the-story', paragraph: 1 }, '"Marcus said they" gives Marcus the wrong pronoun: Marcus takes he/him.'],
      [{ section: 'the-story', paragraph: 2 }, '"Blake counted his" gives Blake a pronoun you never gave; write Blake by name.']
    ]);
    expect(linesOf(result, 'novaPronoun')).toEqual([
      [{ section: 'the-story', paragraph: 3 }, '"Nova said she" gives Nova a gendered pronoun; Nova is never given one.']
    ]);
    const given = factCheckContentBundle(baseArgs({
      theme: 'journalist', npcs: NPCS, directorText: 'Blake said she would wait.', contentBundle: storyWith(para('Blake counted his money.'))
    }));
    expect(linesOf(given, 'npcPronouns')).toEqual([
      [{ section: 'the-story', paragraph: 1 }, '"Blake counted his" gives Blake a pronoun other than the one you gave.']
    ]);
  });

  it('an em-dash and a word from behind the scenes: each piece with its own part', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        headline: { main: 'The Offer', deck: 'A deck—with a dash.' },
        sections: [{ id: 'the-story', type: 'narrative', content: [para('Vic signed—and Mel—watched.'), para('The final tier opened, and the timer ran out.')] }],
        evidenceCards: []
      }
    }));
    // 4.10c: the count is the em-dashes outside quoted speech, which the check counts.
    expect(linesOf(result, 'emDash')).toEqual([
      [{ field: 'headline.deck' }, 'The deck has an em-dash outside quoted speech; house style uses none.'],
      [{ section: 'the-story', paragraph: 1 }, 'This paragraph has 2 em-dashes outside quoted speech; house style uses none.']
    ]);
    expect(linesOf(result, 'productionWords')).toEqual([
      [{ section: 'the-story', paragraph: 2 }, 'This paragraph says "tier", a word from behind the scenes of the game.'],
      [{ section: 'the-story', paragraph: 2 }, 'This paragraph says "timer", a word from behind the scenes of the game.']
    ]);
  });

  it("the length: each section with its own words, beside the article's", () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        headline: { main: 'Short', deck: 'A deck of six words here.' },
        sections: [
          { id: 'the-story', type: 'narrative', content: [para(words(1000)), para(words(10))] },
          { id: 'closing', type: 'narrative', content: [{ type: 'quote', text: 'Not counted.' }, para(words(900))] }
        ],
        evidenceCards: []
      }
    }));
    // 4.10c: the words the length counts are the article's words of prose.
    expect(linesOf(result, 'length')).toEqual([
      [{ section: 'the-story' }, "This section has 1,010 of the article's 1,917 words of prose; the article aims at about 1,500."],
      [{ section: 'closing' }, "This section has 900 of the article's 1,917 words of prose; the article aims at about 1,500."]
    ]);
  });

  it("a head count: each statement against the roster's count, with the guest reporter", () => {
    const result = factCheckContentBundle(baseArgs({
      roster: ['Vic', 'Mel', 'Kai'], guestReporter: { name: 'Kai Lune' },
      contentBundle: storyWith(para('Vic, Mel and Kai argued. There were nine people in the room.'))
    }));
    expect(linesOf(result, 'headCount')).toEqual([
      [{ section: 'the-story', paragraph: 1 }, '"There were nine people in the room" does not match the roster: 3 players were at the investigation, the guest reporter Kai Lune among them.']
    ]);
  });

  it("the parked detective's findings carry the same lines", () => {
    const result = factCheckContentBundle(baseArgs({
      theme: 'detective', reportingMode: 'remote', npcPronouns: { Marcus: 'he/him' },
      contentBundle: storyWith(para('I voted with the room.'), para('Marcus said they would pay.'))
    }));
    expect(linesOf(result, 'reporterMode')).toEqual([
      [{ section: 'the-story', paragraph: 1 }, '"I voted" makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.']
    ]);
    expect(linesOf(result, 'npcPronouns')).toEqual([
      [null, '"Marcus said they would pay" gives Marcus the wrong pronoun: Marcus takes he/him.']
    ]);
  });

  it("every finding has a line, and no line is its message or names a pipeline term; each message is the rework's, as before", () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote', roster: ['Vic', 'Mel', 'Kai'], sessionPhotos: ['/p/a.jpg'], npcs: [{ name: 'Marcus', pronouns: 'he/him' }, { name: 'Nova' }],
      contentBundle: {
        headline: { main: 'The Offer', deck: 'A deck—with a dash.' },
        heroImage: { filename: 'hero-not-ours.jpg', caption: 'The room at noon.' },
        sections: [{
          id: 'the-story', type: 'narrative', content: [
            para('I was not in the room. Then I voted, and the final tier opened. Marcus said they would pay.'),
            para("I wasn't there. Nova said she was not sure. There were nine people in the room."),
            inlineCard({ content: NOT_VERBATIM }), inlineCard({ tokenId: 'paper-1', content: 'The job is yours.' }),
            { type: 'photo', filename: 'nope.jpg', caption: 'Mel at the ledger.' }, para(words(1800))
          ]
        }],
        evidenceCards: [card({ tokenId: 'nope999', headline: 'A card no document backs' })]
      }
    }));
    expect([...new Set(result.findings.map((f) => f.kind))].sort()).toEqual([
      'cardFidelity', 'emDash', 'headCount', 'leakedExample', 'length', 'novaPronoun', 'npcPronouns', 'photoReferences',
      'productionWords', 'repeatedAbsence', 'reporterMode', 'rosterCoverage'
    ]);
    for (const finding of result.findings) {
      expect([finding.kind, typeof finding.line === 'string' && finding.line.length > 0]).toEqual([finding.kind, true]);
      expect([finding.line, finding.line === finding.message]).toEqual([finding.line, false]);
      expect([finding.line, /<RECORD>|section "|\b[TC]\d+\b|narrator|Evidence card "|\bvic001\b/.test(finding.line)]).toEqual([finding.line, false]);
    }
    // The rework's messages keep their prefixes, so the console's groups and the rework read them as before.
    expect(result.structuralIssues.map((m) => m.split(/[:(]/)[0].trim())).toEqual([
      'Evidence card "vic001"', 'Evidence card "nope999"', 'Roster coverage gap', 'Invalid photo reference "hero-not-ours.jpg"',
      'Invalid photo reference "nope.jpg"', 'Reporter-mode violation'
    ]);
  });
});

// Task 4.5f (the integrator's ruling 3 on 4.5e's findings, 4.7d's hand-off): the vote fix line
// names who may be credited with a turn-in as the article judge's T6 clause has since 4.7d, the
// evidence log or the director's words (the notes, the corrections, the accusation and the
// answers at the story meeting), which the article reads as record (T1).
describe("4.5f: the vote fix line reads the director's words for who turned a memory in", () => {
  it("names the evidence log or the director's words", () => {
    const [message] = factCheckContentBundle(baseArgs({
      contentBundle: { headline: { main: 'h', deck: 'd' }, sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text: 'I voted with the room.' }] }], evidenceCards: [] }
    })).structuralIssues;
    expect(message.startsWith('Reporter-mode violation: "i voted".')).toBe(true);
    expect(message.endsWith("an exposure stays anonymous unless the evidence log or the director's words name who turned it in.")).toBe(true);
    expect(message).not.toContain("the director's notes");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Brief 4.10c: each line says exactly what the article prints (the integrator's ruling 2 on
// 4.10b's minors, minor 6). The director reads the line beside the article, so it names what
// the check counted in the article's own terms: a photo the director left out that the
// article still prints, the em-dashes outside quoted speech, the article's words of prose,
// and a phrase that runs across two pieces (the deck and a paragraph, or two paragraphs) as
// the article prints it. Each message, which the rework reads, stays as it was.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10c: each line says exactly what the article prints', () => {
  const para = (text) => ({ type: 'paragraph', text });
  const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  /** Each finding of a kind as [its place, its line]. */
  const linesOf = (result, kind) => result.findings.filter((f) => f.kind === kind).map((f) => [f.place, f.line]);

  it('a photo the director left out that the article still prints: the line says the article prints it', () => {
    const result = factCheckContentBundle(baseArgs({
      sessionPhotos: ['/p/kept.jpg', '/p/gone.jpg'], excludedPhotos: ['/p/gone.jpg'],
      contentBundle: storyWith(para('Vic argued at the bar.'), { type: 'photo', filename: 'gone.jpg', caption: 'Kai at the coat check.' })
    }));
    expect(linesOf(result, 'photoReferences')).toEqual([
      [{ filename: 'gone.jpg', section: 'the-story' }, 'The article still prints this photo, gone.jpg, which you left out.']
    ]);
    expect(result.structuralIssues).toEqual(['Invalid photo reference "gone.jpg": the director excluded this photo. Use one of [kept.jpg] or remove the reference.']);
  });

  it('the em-dash count is the em-dashes outside quoted speech, the ones the check counts', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(para('Vic signed—fast—and Mel said, "Wait—not yet."'))
    }));
    expect(linesOf(result, 'emDash')).toEqual([
      [{ section: 'the-story', paragraph: 1 }, 'This paragraph has 2 em-dashes outside quoted speech; house style uses none.']
    ]);
    expect(result.advisoryWarnings.filter((w) => w.startsWith('Em-dash'))).toEqual([
      'Em-dash in the narrator\'s prose: 2 em-dashes (in section "the-story", paragraph 1 twice). House style puts a comma, a colon or a full stop where an em-dash might go (C4).'
    ]);
  });

  it("the length counts the article's words of prose: by section, and with no section to sit on", () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: {
        headline: { main: 'Short' },
        sections: [
          { id: 'the-story', type: 'narrative', content: [para(words(1000)), { type: 'quote', text: words(400) }] },
          { id: 'closing', type: 'narrative', content: [para(words(900))] }
        ],
        evidenceCards: []
      }
    }));
    // The quote's 400 words are no part of the count: they are someone else's words, not prose.
    expect(linesOf(result, 'length')).toEqual([
      [{ section: 'the-story' }, "This section has 1,000 of the article's 1,901 words of prose; the article aims at about 1,500."],
      [{ section: 'closing' }, "This section has 900 of the article's 1,901 words of prose; the article aims at about 1,500."]
    ]);
    const noSection = factCheckContentBundle(baseArgs({ contentBundle: { headline: { main: words(1900) }, sections: [], evidenceCards: [] } }));
    expect(linesOf(noSection, 'length')).toEqual([[null, 'The article runs 1,900 words of prose; it aims at about 1,500.']]);
  });

  it('a phrase that runs across two pieces prints as the article prints it: from one paragraph to the next, and from the deck to a paragraph', () => {
    const LINE = ' (across two pieces) makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.';
    const paragraphs = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para('The vote came and I'), para('voted again.')) }));
    expect(paragraphs.findings.filter((f) => f.kind === 'reporterMode').map((f) => [f.place, f.excerpt, f.line])).toEqual([
      [null, 'I voted', `"I voted"${LINE}`]
    ]);
    const deck = factCheckContentBundle(baseArgs({
      contentBundle: { headline: { main: 'The Vote', deck: 'Nine players, a scoreboard, and I' }, ...storyWith(para('Voted with the room at noon.')) }
    }));
    expect(deck.findings.filter((f) => f.kind === 'reporterMode').map((f) => [f.place, f.excerpt, f.line])).toEqual([
      [null, 'I Voted', `"I Voted"${LINE}`]
    ]);
    // The rework's message reads the phrase as the check read it, as before.
    [paragraphs, deck].forEach((result) => expect(result.structuralIssues).toEqual([expect.stringMatching(/^Reporter-mode violation: "i voted"\. /)]));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Brief 4.10d: the phrases match words, not letters (the integrator's ruling 1 on 4.6e's and
// 4.10c's minors). The vote and presence phrases matched as plain substrings, in the narrator's
// whole prose and in each piece's text, so "Remi voted with the room." held "i voted", and a
// paragraph ending "…was Kai" before one opening "Voted to adjourn" held it across two pieces.
// ALN's names end in "i" often (Remi, Kai, Dani), and each false structural failure spends a paid
// automatic rework. A phrase no one piece holds is excerpted where two adjacent pieces meet in
// it, or is the check's own phrase when no two meet in it (scratch p4/4.10c-review/
// probe-across.js). Each message and its status stay as they were.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10d: the reporter-mode phrases match words, not letters', () => {
  const para = (text) => ({ type: 'paragraph', text });
  /** Each reporter-mode finding as [its place, its excerpt, its line]. */
  const reporterFindings = (result) => result.findings.filter((f) => f.kind === 'reporterMode').map((f) => [f.place, f.excerpt, f.line]);
  const VOTES = ' makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.';
  const PRESENCE = ' puts the reporter in the room, but the reporter covered this session remotely.';

  it('"Remi voted with the room.", and every other phrase whose letters a name holds: no finding', () => {
    [
      ['on-site', 'Remi voted with the room.'],
      ['on-site', 'Dani voted last, and Kai voted with the room.'],
      ['on-site', 'Jimmy voted to adjourn.'],
      ['remote', 'Remi was in the room when the count came.']
    ].forEach(([reportingMode, text]) => {
      const result = factCheckContentBundle(baseArgs({ reportingMode, contentBundle: storyWith(para(text)) }));
      expect([text, reporterFindings(result), result.structuralIssues, result.reporterMode.violations]).toEqual([text, [], [], []]);
    });
  });

  it('"Kai" ending one paragraph and "Voted to adjourn" opening the next: no finding', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(para('The last to speak was Kai'), para('Voted to adjourn, said the room.'))
    }));
    expect(reporterFindings(result)).toEqual([]);
    expect(result.structuralIssues).toEqual([]);
  });

  it("a phrase in a paragraph that also holds a name ending in \"i\": the finding quotes the phrase, not the name's letters, and keeps its message", () => {
    const result = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para('Remi voted first, and then I voted.')) }));
    expect(reporterFindings(result)).toEqual([[{ section: 'the-story', paragraph: 1 }, 'I voted', `"I voted"${VOTES}`]]);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Reporter-mode violation: "i voted"\. /)]);
    expect(result.reporterMode.violations).toEqual(['i voted']);
  });

  it('a phrase across two pieces is excerpted where they meet, past a quoted span in the first that holds its words', () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(para('Then I "finally" voted for lunch.'), para('The vote came and I'), para('voted again.'))
    }));
    expect(reporterFindings(result)).toEqual([[null, 'I voted', `"I voted" (across two pieces)${VOTES}`]]);
  });

  it("a phrase no two adjacent pieces hold is quoted as the check's own phrase", () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote', contentBundle: storyWith(para('At noon I'), para('was in'), para('the room with the others.'))
    }));
    expect(reporterFindings(result)).toEqual([[null, 'i was in the room', `"i was in the room" (across two pieces)${PRESENCE}`]]);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Reporter-mode violation \(remote\): "i was in the room"\. /)]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Brief 4.10e: a quoted line is no reporter-mode breach (the integrator's ruling 2 on the fifth
// wave's findings: 4.10d's minors 1, 4, 5 and 6). The check read the narrator's prose with its
// quoted spans left in, so a player's line the article quotes inside a paragraph, 'Kai told me,
// "I voted for Mel."', failed the article and spent a paid automatic rework, which might strip a
// correct quote. It reads the narrator's own words now, the prose with its quoted spans taken
// out, as phase 3's narrator checks do. A finding's excerpt follows that reading, in a piece or
// across two: whitespace alone between its words, never a quoted span, and never a quoted line's
// words (scratch p4/4.10d-review/probe-factcheck.js, probes A and B). "My votes" joins the
// phrases, since whole words no longer catch the plural, and the absence excerpt is read on whole
// words, as its count is (probe E). Each message, its prefix and its status stay as they were.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10e: the reporter-mode check reads the narrator\'s own words', () => {
  const para = (text) => ({ type: 'paragraph', text });
  /** Each reporter-mode finding as [its place, its excerpt, its line]. */
  const reporterFindings = (result) => result.findings.filter((f) => f.kind === 'reporterMode').map((f) => [f.place, f.excerpt, f.line]);
  const VOTES = ' makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.';

  it("a player's line quoted in a paragraph, in straight and curly quotation marks: no finding", () => {
    [
      ['on-site', storyWith(para('Kai told me, "I voted for Mel."'))],
      ['on-site', storyWith(para('Kai said: “I voted for Mel.”'))],
      ['on-site', storyWith(para('Kai said, ‘My vote was always Mel’s.’ The room moved on.'))],
      ['on-site', { headline: { main: 'The Vote', deck: 'Kai said, “I voted for Mel,” and the room agreed.' }, ...storyWith(para('The count came at noon.')) }],
      ['remote', storyWith(para('Remi told me, "I was in the room when it turned."'))]
    ].forEach(([reportingMode, contentBundle]) => {
      const result = factCheckContentBundle(baseArgs({ reportingMode, contentBundle }));
      expect([contentBundle, reporterFindings(result), result.structuralIssues, result.reporterMode.violations]).toEqual([contentBundle, [], [], []]);
    });
  });

  it("the narrator's own \"I voted\" beside a quoted one: a finding, its excerpt the narrator's words as printed", () => {
    const result = factCheckContentBundle(baseArgs({
      contentBundle: storyWith(para('Kai told me, "i VOTED for Mel," and then I voted too.'))
    }));
    expect(reporterFindings(result)).toEqual([[{ section: 'the-story', paragraph: 1 }, 'I voted', `"I voted"${VOTES}`]]);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Reporter-mode violation: "i voted"\. /)]);
    expect(result.reporterMode.violations).toEqual(['i voted']);
  });

  it('a quoted span between two words is no space: the excerpt is where the words meet with whitespace alone, in a piece or across two', () => {
    const inPiece = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para('He said I "never" voted that way, but I voted.')) }));
    expect(reporterFindings(inPiece)).toEqual([[{ section: 'the-story', paragraph: 1 }, 'I voted', `"I voted"${VOTES}`]]);
    // Probes A and B: a junction where a quoted span stands between the words comes before the
    // junction that holds the phrase.
    [
      ['Asked who broke the tie, he said I "never"', 'voted that way. The vote came and I', 'voted again.'],
      ['The last word was mine, and I', '"finally" voted. Later I', 'voted again.']
    ].forEach((texts) => {
      const result = factCheckContentBundle(baseArgs({ contentBundle: storyWith(...texts.map(para)) }));
      expect([texts, reporterFindings(result)]).toEqual([texts, [[null, 'I voted', `"I voted" (across two pieces)${VOTES}`]]]);
    });
    // A quoted word between the two words of a phrase leaves no phrase to find.
    const between = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para('Then I "finally" voted for lunch.')) }));
    expect([reporterFindings(between), between.structuralIssues]).toEqual([[], []]);
  });

  it('"my votes" is one of the phrases', () => {
    const result = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para('Both of my votes went to Mel.')) }));
    expect(reporterFindings(result)).toEqual([[{ section: 'the-story', paragraph: 1 }, 'my votes', `"my votes"${VOTES}`]]);
    expect(result.structuralIssues).toEqual([expect.stringMatching(/^Reporter-mode violation: "my votes"\. Nova reports on the room/)]);
    expect(result.reporterMode.violations).toEqual(['my votes']);
  });

  it("the absence excerpt is read on words: beside \"Kai wasn't there\" it quotes the narrator's statement", () => {
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote',
      contentBundle: storyWith(para("Kai wasn't there at noon, and I wasn't there either."), para('I was not in the room.'))
    }));
    expect(result.findings.filter((f) => f.kind === 'repeatedAbsence').map((f) => [f.place, f.excerpt, f.line])).toEqual([
      [{ section: 'the-story', paragraph: 1 }, "I wasn't there", '"I wasn\'t there" is one of 2 places the article says the reporter was not in the room; once, early, is enough.'],
      [{ section: 'the-story', paragraph: 2 }, 'I was not in the room', '"I was not in the room" is one of 2 places the article says the reporter was not in the room; once, early, is enough.']
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Brief 4.10f: one quoted-span rule, straight single quotation marks included (the integrator's
// ruling 1 on the sixth wave's findings: 4.10e's minors 1 and 2). The rule held double quotation
// marks, straight or curly, and curly single ones, while the stored drafts quote speech in straight
// single ones too ('You can have him,' 'She means nothing to me.'), so "Kai told me, 'I voted for
// Mel.'" failed the article and spent a paid automatic rework. Two readers kept their own copies of
// the rule: the excerpt's gap read a curly double span only as a matched pair, and the absence
// statements skipped double-quoted spans alone. Every reader reads the one rule now. A single
// quotation mark is told from an apostrophe by where it stands: in a word (Kai's), after a plural
// (the players' votes), before a shortened word ('90s); where the rule cannot tell, it errs toward
// not flagging (scratch p4/4.10e-review/probe-rule-limits.js; p4/rul6/quotes-probe.js). Each
// message, its prefix and its status stay as they were.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10f: one quoted-span rule, straight single quotation marks included', () => {
  const para = (text) => ({ type: 'paragraph', text });
  /** Each reporter-mode finding as [its place, its excerpt, its line]. */
  const reporterFindings = (result) => result.findings.filter((f) => f.kind === 'reporterMode').map((f) => [f.place, f.excerpt, f.line]);
  const VOTES = ' makes the reporter one of the room: the reporter never votes, joins the room\'s accusation or exposes a memory.';
  const NARRATORS_VOTE = [[{ section: 'the-story', paragraph: 1 }, 'I voted', `"I voted"${VOTES}`]];
  const absenceAdvisories = (result) => result.advisoryWarnings.filter((w) => w.startsWith('Absence stated '));
  /** Each absence finding as [its place, its excerpt]. */
  const absenceFindings = (result) => result.findings.filter((f) => f.kind === 'repeatedAbsence').map((f) => [f.place, f.excerpt]);

  it("a player's line in straight single quotation marks: no reporter-mode finding", () => {
    ["Kai told me, 'I voted for Mel.'", "'I voted for Alex,' Ashe told the group."].forEach((text) => {
      const result = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para(text)) }));
      expect([text, reporterFindings(result), result.structuralIssues, result.reporterMode.violations]).toEqual([text, [], [], []]);
    });
  });

  it("the narrator's own \"I voted\" beside possessives and contractions: a finding, its excerpt as printed", () => {
    [
      "Kai's ledger and the players' votes said one thing, but I voted for Mel.",
      // The narrator's words between two apostrophes, which a rule pairing any two marks would mask.
      "Kai's ledger said one thing, but I voted for Mel, as the players' votes didn't.",
      "It's five o'clock, and I voted for Mel; the players' count won't move."
    ].forEach((text) => {
      const result = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para(text)) }));
      expect([text, reporterFindings(result)]).toEqual([text, NARRATORS_VOTE]);
      expect([text, result.structuralIssues]).toEqual([text, [expect.stringMatching(/^Reporter-mode violation: "i voted"\. /)]]);
    });
  });

  it('a shortened word with no closing mark masks nothing', () => {
    const result = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para("Back in the '90s, I voted for change.")) }));
    expect(reporterFindings(result)).toEqual(NARRATORS_VOTE);
    expect(result.reporterMode.violations).toEqual(['i voted']);
  });

  it('a quoted span between two words is no space, in straight single quotation marks: the excerpt is where the narrator\'s words meet with whitespace alone, in a piece or across two', () => {
    const inPiece = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para("He said I 'never' voted that way, but I voted.")) }));
    expect(reporterFindings(inPiece)).toEqual(NARRATORS_VOTE);
    // A player's line ahead of the narrator's own: the excerpt is the narrator's words, not the line's.
    const lineFirst = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para("Kai said 'i VOTED for Mel,' and I 'never' voted that way, but I voted.")) }));
    expect(reporterFindings(lineFirst)).toEqual(NARRATORS_VOTE);
    // Probes A and B: a junction where a quoted span stands between the words comes before the
    // junction that holds the phrase.
    [
      ["Asked who broke the tie, he said I 'never'", 'voted that way. The vote came and I', 'voted again.'],
      ['The last word was mine, and I', "'finally' voted. Later I", 'voted again.']
    ].forEach((texts) => {
      const result = factCheckContentBundle(baseArgs({ contentBundle: storyWith(...texts.map(para)) }));
      expect([texts, reporterFindings(result)]).toEqual([texts, [[null, 'I voted', `"I voted" (across two pieces)${VOTES}`]]]);
    });
    // A quoted word between the two words of a phrase leaves no phrase to find.
    const between = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para("Then I 'finally' voted for lunch.")) }));
    expect([reporterFindings(between), between.structuralIssues]).toEqual([[], []]);
  });

  it("a phase 3 narrator check reads the same rule: an em-dash inside a straight single-quoted line is no advisory, and the narrator's own still is", () => {
    const emDashes = (result) => result.advisoryWarnings.filter((w) => w.startsWith("Em-dash in the narrator's prose:"));
    const quotedOnly = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para("Kai said, 'It was mine — all of it.' The room moved on.")) }));
    expect(emDashes(quotedOnly)).toEqual([]);
    const text = "Kai said, 'It was mine — all of it.' The ledger moved — twice.";
    const both = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para(text)) }));
    expect(emDashes(both)).toEqual([expect.stringMatching(/^Em-dash in the narrator's prose: 1 em-dash \(in section "the-story", paragraph 1\)\. /)]);
    expect(both.findings.filter((f) => f.kind === 'emDash').map((f) => [f.place, f.excerpt, f.line])).toEqual([
      [{ section: 'the-story', paragraph: 1 }, text, 'This paragraph has an em-dash outside quoted speech; house style uses none.']
    ]);
  });

  it("the absence statements read the same rule: a player's line in single quotation marks is none, and the narrator's own with a curly apostrophe is one", () => {
    ["'I wasn't there,' Kai said.", '‘I wasn’t there,’ Kai said.'].forEach((text) => {
      const result = factCheckContentBundle(baseArgs({ reportingMode: 'remote', contentBundle: storyWith(para(text), para('I was not in the room.')) }));
      expect([text, absenceAdvisories(result), absenceFindings(result)]).toEqual([text, [], []]);
    });
    const curly = factCheckContentBundle(baseArgs({ reportingMode: 'remote', contentBundle: storyWith(para('I wasn’t there.'), para('I was not in the room.')) }));
    expect(absenceAdvisories(curly)).toEqual([expect.stringMatching(/^Absence stated 2 times \(remote\): "I wasn't there", "I was not in the room"\. /)]);
    expect(absenceFindings(curly)).toEqual([
      [{ section: 'the-story', paragraph: 1 }, 'I wasn’t there'],
      [{ section: 'the-story', paragraph: 2 }, 'I was not in the room']
    ]);
  });

  it('an excerpt across a mixed pair of double quotation marks (“abc") quotes the narrator\'s words with whitespace alone between them', () => {
    // A statement whose words a quoted span separates is no statement, as a reporter-mode phrase
    // is none (4.10e): the narrator's statement is the one with whitespace alone between its words.
    const result = factCheckContentBundle(baseArgs({
      reportingMode: 'remote',
      contentBundle: storyWith(para('I was not “abc" there at noon, and I was not there at one.'), para('I was not in the room.'))
    }));
    expect(absenceAdvisories(result)).toEqual([expect.stringMatching(/^Absence stated 2 times \(remote\): "I was not there", "I was not in the room"\. /)]);
    expect(absenceFindings(result)).toEqual([
      [{ section: 'the-story', paragraph: 1 }, 'I was not there'],
      [{ section: 'the-story', paragraph: 2 }, 'I was not in the room']
    ]);
  });

  it("the excerpt's gap reads the same rule: a check that read the prose without its quoted spans finds its excerpt in print across a mixed pair or straight single quotation marks", () => {
    ['Kai said “abc" and I left — fast.', "Kai said 'abc' and I left — fast."].forEach((text) => {
      const result = factCheckContentBundle(baseArgs({ contentBundle: storyWith(para(text)) }));
      expect([text, result.findings.filter((f) => f.kind === 'emDash').map((f) => f.excerpt)]).toEqual([text, [text]]);
    });
  });
});
