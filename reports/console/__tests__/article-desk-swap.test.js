/**
 * article-desk-logic: a swap at the desk is two moves (phase 4, task 4.5d; the integrator's
 * ruling 4 on run 4's follow-ups, progress.md 2026-10-03).
 *
 * The desk's naming rule (pairSectionBlocks) paired the blocks left at one index whatever
 * they named, so two photos with different filenames, or two cards with different
 * tokenIds, swapped between two sections read as the one block edited into the other: the
 * desk reported two edits, and the standing edits recorded the writer's captions as the
 * director's (scratch 4.3c-review/swap.js). A photo, a card or a reference now pairs only
 * with a block of its own name, so a swap is two moves, each keeping its own caption or
 * text, in the desk's report and the standing edits alike.
 *
 * Invented text in a real session's shape: the repo is public.
 */
const Desk = require('../article-desk-logic');
const D = require('../../lib/hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });
const photo = (filename, caption) => ({ type: 'photo', filename, caption });
const card = (tokenId, headline, content) => ({ type: 'evidence-card', tokenId, headline, content, significance: 'critical' });
const reference = (tokenId, caption) => ({ type: 'evidence-reference', tokenId, caption });

const STORY_1 = 'Mel built the first theory around the fight in the bathroom and the fake demo.';
const STORY_2 = 'By the second round the room had stopped asking who held the account.';
const MONEY_1 = 'Thirteen sales landed in one account in the last two minutes of selling.';
const THEORY = photo('theory.jpg', 'Mel lays out the theory.');
const BAR = photo('bar.jpg', 'Taylor and Sam talk at the bar, early.');
const JESS = card('jes002', 'Jess lets him go', 'You can have him. I never wanted the money anyway.');
const VIC = card('vic001', 'The replacement plan', 'He is out. You are in.');

/** An article whose THE STORY holds `story` and whose FOLLOW THE MONEY holds `money`. */
const article = (story, money) => ({
  metadata: { sessionId: '0926262', theme: 'journalist' },
  headline: { main: 'The Room Named Alex, Five Votes to Four' },
  sections: [
    { id: 'the-story', type: 'narrative', heading: 'The Story', content: story.map(clone) },
    { id: 'follow-the-money', type: 'evidence-highlight', heading: 'Follow the Money', content: money.map(clone) }
  ]
});

describe('4.5d: a swap at the desk is two moves, each keeping its own caption or text', () => {
  test('pairSectionBlocks pairs a photo, a card or a reference only with a block of its own name: never by its opening words, never by its place', () => {
    const apart = { pairs: [], removed: [0], added: [0] };
    // Two photos at one index, their captions opening alike.
    expect(Desk.pairSectionBlocks(
      [photo('x.jpg', 'Guests gather around the bar early in the evening, before the vote.')],
      [photo('y.jpg', 'Guests gather around the bar early in the evening, after the vote.')]
    )).toEqual(apart);
    // Two cards at one index, and two references.
    expect(Desk.pairSectionBlocks([JESS], [VIC])).toEqual(apart);
    expect(Desk.pairSectionBlocks([reference('jes002', 'Jess, in her own memory.')], [reference('vic001', 'Vic, in his.')])).toEqual(apart);
    // A photo with its own name, its caption rewritten, still pairs; so do two paragraphs at one index.
    expect(Desk.pairSectionBlocks([THEORY], [photo('theory.jpg', 'Six people around the whiteboard, late.')])).toEqual({ pairs: [{ bi: 0, ai: 0 }], removed: [], added: [] });
    expect(Desk.pairSectionBlocks([paragraph(STORY_1)], [paragraph(MONEY_1)])).toEqual({ pairs: [{ bi: 0, ai: 0 }], removed: [], added: [] });
  });

  test.each([
    ['photos', THEORY, BAR],
    ['cards', JESS, VIC]
  ])('two %s swapped between sections: the desk names both moved, and the standing edits record two moves, each block as it was', (_kind, P, Q) => {
    const opened = article([paragraph(STORY_1), P, paragraph(STORY_2)], [paragraph(MONEY_1), Q]);
    // The director takes P down to the money section, then Q up where P stood.
    let desk = Desk.moveBlock(opened, { section: 0, block: 1 }, { section: 1, block: 1 });
    desk = Desk.moveBlock(desk, { section: 1, block: 2 }, { section: 0, block: 1 });
    expect(desk).toEqual(article([paragraph(STORY_1), Q, paragraph(STORY_2)], [paragraph(MONEY_1), P]));

    const pMoved = { from: { section: 'the-story', block: 1 }, to: { section: 'follow-the-money', block: 1 } };
    const qMoved = { from: { section: 'follow-the-money', block: 1 }, to: { section: 'the-story', block: 1 } };
    expect(Desk.deskChanges(opened, desk)).toEqual([
      { section: 'the-story', inserted: [], deleted: [], moved: [pMoved, qMoved], edited: [], unchanged: 1 },
      { section: 'follow-the-money', inserted: [], deleted: [], moved: [pMoved, qMoved], edited: [], unchanged: 1 }
    ]);

    const { edits } = D.standingAfterSendBack(null, opened, desk, 'bundle');
    expect(edits.map((e) => [e.path, e.from, e.after])).toEqual([
      ['sections[#the-story].content[1]', 'follow-the-money', Q],
      ['sections[#follow-the-money].content[1]', 'the-story', P]
    ]);
  });
});
