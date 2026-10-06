/**
 * The director's edits on angles (phase 4b, piece 3, brief 3C; spec 2026-10-06 sections 6, 7 and
 * 17; rulings R1, R2 and R9; Review focus 1 and 3).
 *
 * Each field of an angle's pitch is one edit, found by the angle's id. A thread flipped into or out
 * of an angle is one edit of its own kind, carried while the angle's list holds (or lacks) that
 * thread and restored by adding or removing that thread alone (R2). A thread the director added is
 * one edit, the thread and its place in the angle together, and stays theirs while the weave holds
 * it in their words: its place is a membership of its own, which lapses alone when a send-back moves
 * it (the final review). The pick is no edit. The director's
 * pitch lines and the threads they flipped in are their share: never held to the writer's rules,
 * never counted toward the writer's words, marked in the settled weave.
 *
 * Every weave here is in session 100326's shape with invented text (fixtures/angles-weave.js).
 */

const {
  weaveEditsBetween, standingAtMeeting, carriedEdits, settleEdits, weaveDirectorsShare, weaveMarks,
  formatEditLines, editWhere, REWEAVE_PASS, SEND_BACK_PASS
} = require('../hand-edit-diff');
const { writersShareOf, weaveFindings, PICKED_KEY, weaveForPrompt, withFactCheckMark } = require('../weave');
const { evidenceContextOf } = require('../evidence');
const { meetingResume, meetingDirectorsThreads, meetingChangePlace } = require('../meeting');
const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
const { meetingChangesOf, meetingEditIdsOf } = require('../map');
const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
const { NOTES, anglesRecord, anglesWeave } = require('./fixtures/angles-weave');

const clone = (v) => JSON.parse(JSON.stringify(v));
const pathsOf = (edits) => edits.map((edit) => edit.path);
const anglesThreads = (weave, id) => weave.angles.find((angle) => angle.id === id).threads;

/** The director's line for angle 1's story, in place of the writer's. */
const A1_STORY = 'Morgan and Vic circled each other all morning, and the room named Morgan.';

/** A thread the director adds at the meeting, in the open angle: its name and line, no evidence. */
const ADDED = { id: 't8', name: 'Jess turned in the meeting', line: 'Jess turned in the memory of Vic meeting Morgan.' };

describe("an angle's pitch is the director's edit, found by the angle's id", () => {
  test('a field rewritten is one edit at angles[#id].<field>; the pick is no edit', () => {
    const left = anglesWeave();
    left.angles[0].story = A1_STORY;
    left[PICKED_KEY] = 'a1';
    const changes = weaveEditsBetween(anglesWeave(), left);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ scope: 'angles', before: anglesWeave().angles[0].story, after: A1_STORY });
    expect(editWhere(changes[0])).toBe('angle "a1", story');
  });

  test('a pitch edit at one look stands at the next, and goes back after a pass that changed it', () => {
    const shown = anglesWeave();
    const left = clone(shown);
    left.angles[0].story = A1_STORY;
    const first = standingAtMeeting(null, shown, left);
    expect(first.edits.map((edit) => [edit.id, edit.path])).toEqual([['E1', 'angles[#a1].story']]);
    // The next look, after a pass that kept the line: the edit stands under its id.
    const second = standingAtMeeting(first, left, clone(left));
    expect(second.edits.map((edit) => [edit.id, edit.path, edit.after])).toEqual([['E1', 'angles[#a1].story', A1_STORY]]);
    // A pass that rewrote it, and wrote a line of its own, with the angles in another order.
    const pass = clone(left);
    pass.angles.reverse();
    pass.angles[2].story = 'A pass rewrote the story.';
    pass.angles[2].ends = 'A pass wrote where it ends.';
    const { output, report } = settleEdits(null, { edits: carriedEdits(second, left), before: left, after: pass, pass: 1 });
    expect(output.angles.map((angle) => angle.id)).toEqual(['a3', 'a2', 'a1']);
    expect(output.angles[2]).toMatchObject({ story: A1_STORY, ends: 'A pass wrote where it ends.' });
    expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', where: 'angle "a1", story', restored: true, director: A1_STORY })]);
  });
});

describe('a thread flipped into or out of an angle is one edit of its own kind (R2)', () => {
  test('each thread flipped is one edit, by the angle and the thread, with the thread\'s name', () => {
    const left = anglesWeave();
    left.angles[0].threads = ['t1', 't2', 't3', 't5', 't6'];
    const edits = standingAtMeeting(null, anglesWeave(), left).edits;
    expect(edits.map((edit) => [edit.id, edit.path, edit.flip])).toEqual([
      ['E1', 'angles[#a1].threads[#t6]', 'in'],
      ['E2', 'angles[#a1].threads[#t4]', 'out']
    ]);
    expect(edits.map(editWhere)).toEqual(['angle "a1", thread "t6", brought in', 'angle "a1", thread "t4", left out']);
    expect(edits.map((edit) => edit.after)).toEqual(['Memories sold while the room argued', 'The suspects the room let go']);
  });

  // Review focus 1: the director flips a thread in at one look and another at the next.
  describe('two flips at two looks', () => {
    const lookOne = () => {
      const left = anglesWeave();
      left.angles[0].threads.push('t6');
      return left;
    };
    const lookTwo = () => {
      const left = lookOne();
      left.angles[0].threads.push('t7');
      return left;
    };
    const standing = () => {
      const first = standingAtMeeting(null, anglesWeave(), lookOne());
      // A reweave kept the first flip, so its weave is the writer's last weave at the next look.
      return standingAtMeeting(first, lookOne(), lookTwo());
    };

    test('both stand as the director\'s, each under its own id', () => {
      expect(standing().edits.map((edit) => [edit.id, edit.path, edit.flip])).toEqual([
        ['E1', 'angles[#a1].threads[#t6]', 'in'],
        ['E2', 'angles[#a1].threads[#t7]', 'in']
      ]);
    });

    test('the first is still theirs: the share, the settled weave\'s marks and the map writer read both', () => {
      const weave = lookTwo();
      const edits = carriedEdits(standing(), weave);
      expect(weaveDirectorsShare(edits).flippedIn).toEqual({ 'a1.t6': 'E1', 'a1.t7': 'E2' });
      const settled = renderSettledWeave(weave, edits);
      expect(settled).toMatch(/- t6 Memories sold while the room argued: .*\[the director's change M1: brought into the story\]/);
      expect(settled).toMatch(/- t7 Marcus's stolen code: .*\[the director's change M2: brought into the story\]/);
      const state = { weave, _weaveHandEdits: standing() };
      expect(meetingDirectorsThreads(state)).toEqual([
        { id: 't6', added: false, broughtIn: true },
        { id: 't7', added: false, broughtIn: true }
      ]);
    });

    test("a pass that drops one has it put back alone, leaving the pass's own order and threads", () => {
      const before = lookTwo();
      const pass = clone(before);
      // The pass tells angle 1 in its own order, drops t4 of its own accord, and drops t6.
      pass.angles[0].threads = ['t3', 't1', 't2', 't7', 't5'];
      const { output, report } = settleEdits(null, { edits: carriedEdits(standing(), before), before, after: pass, pass: REWEAVE_PASS });
      expect(anglesThreads(output, 'a1')).toEqual(['t3', 't1', 't2', 't7', 't5', 't6']);
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', flip: 'in', restored: true, where: 'angle "a1", thread "t6", brought in' })]);
    });

    test('a flip out goes back out after a pass that put the thread back in', () => {
      const left = anglesWeave();
      left.angles[0].threads = ['t1', 't2', 't3', 't5'];
      const edits = standingAtMeeting(null, anglesWeave(), left).edits;
      const pass = clone(left);
      pass.angles[0].threads.splice(1, 0, 't4');
      const { output } = settleEdits(null, { edits, before: left, after: pass, pass: 1 });
      expect(anglesThreads(output, 'a1')).toEqual(['t1', 't2', 't3', 't5']);
    });

    // Fix round 1, finding 5: whether the angle survives a pass does not depend on the kind of edit
    // the director made on it. A flip whose angle the pass dropped puts the angle back where it sat,
    // as a pitch edit's restore does, then the thread's place.
    test('a pass that drops the angle a flip is on has the angle put back where it sat, with the flip', () => {
      [['in', (angle) => angle.threads.push('t2')], ['out', (angle) => { angle.threads = angle.threads.filter((id) => id !== 't3'); }]]
        .forEach(([flip, change]) => {
          const left = anglesWeave();
          left[PICKED_KEY] = 'a2';
          change(left.angles[1]);
          const edits = standingAtMeeting(null, anglesWeave(), left).edits;
          expect(edits.map((edit) => edit.flip)).toEqual([flip]);
          const pass = clone(left);
          pass.angles.splice(1, 1);
          const { output, report } = settleEdits(null, { edits, before: left, after: pass, pass: 1 });
          expect([flip, output.angles]).toEqual([flip, left.angles]);
          // The final review: the report says the pass took out the angle, not the flip inside it.
          expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', flip, restored: true, angleTakenOut: true })]);
        });
    });

    // 3 fix A: restoreMembership's re-insert branch. The angle names only threads the weave holds,
    // so a flip whose thread the pass took out of the weave puts the thread back where it sat.
    test('a pass that drops the flipped thread from the weave entirely has it put back where it sat, and in the angle', () => {
      const left = anglesWeave();
      left.angles[0].threads.push('t7');
      const edits = standingAtMeeting(null, anglesWeave(), left).edits;
      expect(edits.map((edit) => [edit.id, edit.path, edit.flip])).toEqual([['E1', 'angles[#a1].threads[#t7]', 'in']]);
      const pass = clone(left);
      pass.threads = pass.threads.filter((thread) => thread.id !== 't7');
      pass.angles.forEach((angle) => { angle.threads = angle.threads.filter((id) => id !== 't7'); });
      pass.threads.find((thread) => thread.id === 't2').line = 'A line the pass rewrote.';
      const { output, report } = settleEdits(null, { edits, before: left, after: pass, pass: 1 });
      expect(output.threads.map((thread) => thread.id)).toEqual(left.threads.map((thread) => thread.id));
      expect(output.threads.find((thread) => thread.id === 't7')).toEqual(left.threads.find((thread) => thread.id === 't7'));
      expect(output.threads.find((thread) => thread.id === 't2').line).toBe('A line the pass rewrote.');
      expect(anglesThreads(output, 'a1')).toEqual(['t1', 't2', 't3', 't4', 't5', 't7']);
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', flip: 'in', restored: true, where: 'angle "a1", thread "t7", brought in' })]);
    });

    // 3 fix A: withMembershipAsShown. With no round since the last look, the writer's last weave
    // still tells the thread the director flipped out at the approve, so flipping it in again is a
    // change only when read against what the meeting showed.
    test('flipped in, kept by a round, flipped out at approve, then flipped in again with no round since: the last flip is an edit', () => {
      const lookOne = anglesWeave();
      lookOne.angles[0].threads.push('t7');
      const first = standingAtMeeting(null, anglesWeave(), lookOne);
      expect(first.edits.map((edit) => [edit.id, edit.flip])).toEqual([['E1', 'in']]);
      // A reweave kept the flip: its weave is the writer's last weave from here on.
      const round = settleEdits(null, { edits: carriedEdits(first, lookOne), before: lookOne, after: clone(lookOne), pass: REWEAVE_PASS }).output;
      expect(anglesThreads(round, 'a1')).toContain('t7');
      // Look two: the director flips it out and approves.
      const lookTwo = clone(round);
      lookTwo.angles[0].threads = lookTwo.angles[0].threads.filter((id) => id !== 't7');
      const second = standingAtMeeting(first, round, lookTwo, { shown: round });
      expect(second.edits.map((edit) => [edit.id, edit.path, edit.flip])).toEqual([['E2', 'angles[#a1].threads[#t7]', 'out']]);
      // Back at the meeting with no round: the writer's last weave is still the round's, which tells t7.
      const lookThree = clone(lookTwo);
      lookThree.angles[0].threads.push('t7');
      const third = standingAtMeeting(second, round, lookThree, { shown: lookTwo });
      expect(third.edits.map((edit) => [edit.id, edit.path, edit.flip])).toEqual([['E3', 'angles[#a1].threads[#t7]', 'in']]);
      // The gate takes it as a change to fit in.
      const state = { weave: withFactCheckMark(lookTwo, { at: 'x', ready: true, fixes: 0 }), _weaveBaseline: round, _weaveHandEdits: second };
      const taken = meetingResume({ meeting: 'reweave', weave: lookThree }, state);
      expect(taken.error).toBeNull();
      expect(taken.stateUpdates._weaveHandEdits.edits.map((edit) => [edit.id, edit.flip])).toEqual([['E3', 'in']]);
    });

    test('a send-back that undoes a flip is left as it is, with its reason', () => {
      const before = lookTwo();
      const pass = clone(before);
      pass.angles[0].threads = pass.angles[0].threads.filter((id) => id !== 't6');
      const { output, report } = settleEdits(null, {
        edits: carriedEdits(standing(), before), before, after: pass, pass: SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asked to keep the money out.' }]
      });
      expect(anglesThreads(output, 'a1')).not.toContain('t6');
      expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', flip: 'in', restored: false, reason: 'The note asked to keep the money out.' })]);
    });
  });

  test("a flip of a thread under an id the writer repeated is refused, naming the thread's id", () => {
    const { directorWeaveProblems } = require('../meeting');
    const shown = anglesWeave();
    shown.threads.push({ ...clone(shown.threads[5]), name: 'A second thread under t6' });
    const left = clone(shown);
    left.angles[0].threads.push('t6');
    expect(directorWeaveProblems(left, { shown })).toMatch(/^The writer gave two threads the id "t6", so the meeting cannot tell which of them the director changed\./);
  });

  test("the edit lines name each flip by the angle and the thread's name", () => {
    const left = anglesWeave();
    left.angles[0].threads = ['t1', 't2', 't3', 't5', 't6'];
    expect(formatEditLines(standingAtMeeting(null, anglesWeave(), left).edits).split('\n')).toEqual([
      'E1 (angle "a1", thread "t6", brought in): "Memories sold while the room argued"',
      'E2 (angle "a1", thread "t4", left out): "The suspects the room let go"'
    ]);
  });

  test("the round's marks name a flip the rework made by the thread's name, as a flip", () => {
    const from = anglesWeave();
    const after = clone(from);
    after.angles[1].threads.push('t2');
    expect(weaveMarks(from, after)).toEqual([
      { path: 'angles[#a2].threads[#t2]', where: 'angle "a2", thread "t2", brought in', before: '', after: 'Vic, nearly named with Morgan', flip: 'in' }
    ]);
  });
});

describe('a thread the director added is one edit, with its place in the angle (R2)', () => {
  const withAdded = () => {
    const left = anglesWeave();
    left.threads.push(clone(ADDED));
    left.angles[0].threads.push('t8');
    return left;
  };

  test('one edit, the thread and its place, and no flip beside it', () => {
    const edits = standingAtMeeting(null, anglesWeave(), withAdded()).edits;
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ id: 'E1', path: 'threads[#t8]', after: ADDED, angle: { id: 'a1', flip: 'in' } });
    expect(formatEditLines(edits)).toBe(`E1 (thread "t8", added in angle "a1"): id "t8"; name "${ADDED.name}"; line "${ADDED.line}"`);
  });

  test('a pass that dropped it has it put back with its place, and one that only took it out of the angle has it put back in', () => {
    const before = withAdded();
    const edits = standingAtMeeting(null, anglesWeave(), before).edits;
    const gone = anglesWeave();
    const settledGone = settleEdits(null, { edits, before, after: gone, pass: 1 }).output;
    expect(settledGone.threads.map((thread) => thread.id)).toContain('t8');
    expect(anglesThreads(settledGone, 'a1')).toEqual([...anglesWeave().angles[0].threads, 't8']);
    const outOfAngle = clone(before);
    outOfAngle.angles[0].threads = outOfAngle.angles[0].threads.filter((id) => id !== 't8');
    expect(anglesThreads(settleEdits(null, { edits, before, after: outOfAngle, pass: 1 }).output, 'a1')).toContain('t8');
  });

  test('flipped out of its angle at a later look, it stays the director\'s one edit, now left out', () => {
    const first = standingAtMeeting(null, anglesWeave(), withAdded());
    const later = withAdded();
    later.angles[0].threads = later.angles[0].threads.filter((id) => id !== 't8');
    const second = standingAtMeeting(first, withAdded(), later);
    expect(second.edits.map((edit) => [edit.id, edit.path, edit.angle])).toEqual([['E1', 'threads[#t8]', { id: 'a1', flip: 'out' }]]);
    expect(weaveDirectorsShare(second.edits).addedThreads).toEqual({ t8: 'E1' });
  });

  // The final review's important finding: the thread stays the director's while the weave holds it
  // in their words, and its place in the angle is a membership of its own, as a flip is, which a
  // send-back's rework may change alone ("lead with Jess" may ask for it in another angle).
  describe("a send-back's rework that keeps the thread word for word and moves it out of its angle", () => {
    const EVIDENCE = evidenceContextOf({ evidenceBundle: anglesRecord(), directorNotes: { rawProse: NOTES } });
    const handEdits = () => standingAtMeeting(null, anglesWeave(), withAdded());
    /** The send-back's weave: t8 as the director wrote it, told by angle 2, or by no angle. */
    const sentBack = (where) => {
      const weave = withAdded();
      weave.angles[0].threads = weave.angles[0].threads.filter((id) => id !== 't8');
      if (where === 'a2') weave.angles[1].threads.push('t8');
      return weave;
    };

    ['a2', 'none'].forEach((where) => {
      describe(`told by ${where === 'a2' ? 'another angle' : 'no angle'}`, () => {
        test('the thread is still the director\'s edit, its place in angle 1 lapsed', () => {
          const carried = carriedEdits(handEdits(), sentBack(where));
          expect(carried.map((edit) => [edit.id, edit.path, edit.after])).toEqual([['E1', 'threads[#t8]', ADDED]]);
          expect(carried[0]).not.toHaveProperty('angle');
          expect(weaveDirectorsShare(carried).addedThreads).toEqual({ t8: 'E1' });
        });

        test('the checks do not hold it to the writer\'s evidence rule', () => {
          const weave = sentBack(where);
          const directorsShare = weaveDirectorsShare(carriedEdits(handEdits(), weave), weave);
          const { failures } = weaveFindings(weave, { evidence: EVIDENCE, directorWords: [NOTES], directorsShare });
          expect(failures.filter((failure) => failure.place === 'threads[#t8]')).toEqual([]);
        });

        test('an automatic pass that rewords it has its words put back, and leaves it where the send-back put it', () => {
          const before = sentBack(where);
          const pass = clone(before);
          pass.threads.find((thread) => thread.id === 't8').line = 'A line the check rework wrote.';
          const { output, report } = settleEdits(null, { edits: carriedEdits(handEdits(), before), before, after: pass, pass: 1 });
          expect(output.threads.find((thread) => thread.id === 't8')).toEqual(ADDED);
          expect(output.angles.map((angle) => angle.threads)).toEqual(before.angles.map((angle) => angle.threads));
          expect(report.changed).toEqual([expect.objectContaining({ id: 'E1', restored: true })]);
        });

        test('at the next look it stands under its id, without the lapsed place, and a flip back into angle 1 is a new edit', () => {
          const shown = sentBack(where);
          const kept = standingAtMeeting(handEdits(), shown, clone(shown), { shown });
          expect(kept.edits.map((edit) => [edit.id, edit.path, edit.angle])).toEqual([['E1', 'threads[#t8]', undefined]]);
          const flippedBack = clone(shown);
          flippedBack.angles[0].threads.push('t8');
          const next = standingAtMeeting(handEdits(), shown, flippedBack, { shown });
          expect(next.edits.map((edit) => [edit.id, edit.path, edit.flip])).toEqual([['E1', 'threads[#t8]', undefined], ['E2', 'angles[#a1].threads[#t8]', 'in']]);
        });

        test("the send-back's report reads the move as a flip of the thread out of angle 1, with the rework's reason", () => {
          const before = withAdded();
          const { report } = settleEdits(null, {
            edits: carriedEdits(handEdits(), before), before, after: sentBack(where), pass: SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asked to lead with Jess.' }]
          });
          expect(report.changed).toEqual([expect.objectContaining({
            id: 'E1', flip: 'in', where: 'angle "a1", thread "t8", brought in', director: ADDED.name, reason: 'The note asked to lead with Jess.'
          })]);
        });
      });
    });

    test('a send-back that rewords it as well makes it the writer\'s, as before', () => {
      const weave = sentBack('a2');
      weave.threads.find((thread) => thread.id === 't8').name = 'Jess and the meeting';
      expect(carriedEdits(handEdits(), weave)).toEqual([]);
    });
  });
});

describe("the director's share: their pitch lines and flips are theirs", () => {
  const left = () => {
    const weave = anglesWeave();
    weave.angles[0].story = A1_STORY;
    weave.angles[0].threads = ['t1', 't2', 't3', 't5', 't6'];
    return weave;
  };

  test('weaveDirectorsShare reads the pitch fields by angle and the flips by angle and thread, and no role', () => {
    const share = weaveDirectorsShare(standingAtMeeting(null, anglesWeave(), left()).edits);
    expect(share).toMatchObject({ angleFields: { 'a1.story': 'E1' }, flippedIn: { 'a1.t6': 'E2' }, flippedOut: { 'a1.t4': 'E3' } });
    expect(share).not.toHaveProperty('reroledThreads');
  });

  test("writersShareOf blanks the director's pitch lines and takes the threads they flipped in out of the angle", () => {
    const weave = left();
    const share = writersShareOf(weave, weaveDirectorsShare(standingAtMeeting(null, anglesWeave(), weave).edits));
    expect(share.angles[0].story).toBe('');
    expect(share.angles[0].threads).toEqual(['t1', 't2', 't3', 't5']);
    expect(share.angles[1]).toEqual(anglesWeave().angles[1]);
    expect(weave.angles[0].story).toBe(A1_STORY);
  });

  test('a pitch the director lengthened is never counted as the writer\'s', () => {
    const lengthened = anglesWeave();
    lengthened.angles[0].story = Array.from({ length: 30 }, () => 'The room argued about Morgan and Vic for an hour.').join(' ');
    const handEdits = standingAtMeeting(null, anglesWeave(), lengthened);
    const state = { weave: lengthened, _weaveHandEdits: handEdits, sessionConfig: {} };
    const directors = weaveDirectorsShare(carriedEdits(handEdits, lengthened), lengthened);
    const counted = arcTesting.meetingPageWords(state, directors);
    const writers = arcTesting.meetingPageWords({ ...state, weave: anglesWeave(), _weaveHandEdits: null }, weaveDirectorsShare([]));
    expect(counted.writer).toBeLessThanOrEqual(writers.writer);
  });

  test("a line of the pitch the director wrote is never the writer's failure: not held to story terms, and an emptied one is a concern beside it", () => {
    const weave = anglesWeave();
    weave.angles[0].ends = 'At 9:40 the room sold $40,000 of memories.';
    weave.angles[0].lands = '';
    const edits = standingAtMeeting(null, anglesWeave(), weave).edits;
    const evidence = evidenceContextOf({ evidenceBundle: anglesRecord(), directorNotes: { rawProse: NOTES } });
    const { failures, concerns } = weaveFindings(weave, { evidence, directorWords: [NOTES], directorsShare: weaveDirectorsShare(edits) });
    expect(failures).toEqual([]);
    expect(concerns).toEqual([{ type: 'angle-incomplete', editIds: ['E1'], finding: `The angle "${weave.angles[0].headline}" is missing why it lands.` }]);
    // The writer's own line, the same words, fails.
    expect(weaveFindings(weave, { evidence, directorWords: [NOTES] }).failures.map((f) => f.type)).toEqual(['angle-incomplete', 'story-terms']);
  });

  test("the settled weave marks the director's pitch line and the thread they left out", () => {
    const weave = left();
    const rendered = renderSettledWeave(weave, carriedEdits(standingAtMeeting(null, anglesWeave(), weave), weave));
    expect(rendered).toContain(`STORY: ${A1_STORY} [the director's change M1]`);
    expect(rendered).toMatch(/THREADS LEFT OUT: .*The suspects the room let go \[the director's change M3: left out of the story\]/);
  });
});

describe('the changes a later stop names are the ones the settled story shows', () => {
  test("a pitch edit on an angle the director did not send stays with the meeting: the map's sources and places leave it out", () => {
    // Look 1: a1 open, its story rewritten, a reweave kept it. Look 2: a2 picked and approved.
    const lookOne = anglesWeave();
    lookOne.angles[0].story = A1_STORY;
    const first = standingAtMeeting(null, anglesWeave(), lookOne);
    const lookTwo = clone(lookOne);
    lookTwo[PICKED_KEY] = 'a2';
    lookTwo.angles[1].ends = 'The reporter who buried a story exposed another.';
    const handEdits = standingAtMeeting(first, lookOne, lookTwo);
    expect(pathsOf(handEdits.edits)).toEqual(['angles[#a1].story', 'angles[#a2].ends']);
    const state = { weave: lookTwo, _weaveHandEdits: handEdits };
    expect(meetingEditIdsOf(state)).toEqual(['M2']);
    expect(meetingChangesOf(state)).toEqual([{ id: 'M2', place: 'where it ends up' }]);
  });

  // The final review: a thread the director added that the angle they send leaves out is no change
  // for the map to fit in. The settled weave names it among the threads left out, unmarked, and the
  // map's sources and places leave it out; the writer's thread they left out stays marked.
  test.each([
    ['added to angle 1 and left out of it at a later look', () => {
      const lookOne = anglesWeave();
      lookOne.threads.push(clone(ADDED));
      lookOne.angles[0].threads.push('t8');
      const first = standingAtMeeting(null, anglesWeave(), lookOne);
      const lookTwo = clone(lookOne);
      lookTwo.angles[0].threads = lookTwo.angles[0].threads.filter((id) => id !== 't8' && id !== 't4');
      return { weave: lookTwo, handEdits: standingAtMeeting(first, lookOne, lookTwo), flippedOut: 'M2' };
    }],
    ['added to angle 1, then angle 2 sent without it', () => {
      const left = anglesWeave();
      left.threads.push(clone(ADDED));
      left.angles[0].threads.push('t8');
      left[PICKED_KEY] = 'a2';
      left.angles[1].threads = left.angles[1].threads.filter((id) => id !== 't6');
      return { weave: left, handEdits: standingAtMeeting(null, anglesWeave(), left), flippedOut: 'M1' };
    }]
  ])('a thread the director added that the sent angle leaves out is not marked, nor offered to the map: %s', (_name, build) => {
    const { weave, handEdits, flippedOut } = build();
    const added = handEdits.edits.find((edit) => edit.path === 'threads[#t8]');
    expect(added).toBeDefined();
    const leftOut = renderSettledWeave(weave, carriedEdits(handEdits, weave)).split('\n').find((line) => line.startsWith('THREADS LEFT OUT: '));
    expect(leftOut).toContain(ADDED.name);
    expect(leftOut).not.toContain(`${ADDED.name} [`);
    expect(leftOut).toContain(`[the director's change ${flippedOut}: left out of the story]`);
    const state = { weave, _weaveHandEdits: handEdits };
    expect(meetingEditIdsOf(state)).not.toContain(`M${added.id.slice(1)}`);
    expect(meetingChangesOf(state).map((change) => change.id)).toEqual([flippedOut]);
  });

  test("each place names an angle's line and a flipped thread by their words, never an id", () => {
    const left = anglesWeave();
    left.angles[0].lands = 'Every player remembers the two of them circling.';
    left.angles[0].threads = ['t1', 't2', 't3', 't5', 't6'];
    left.threads.push(clone(ADDED));
    left.angles[0].threads.push('t8');
    const edits = standingAtMeeting(null, anglesWeave(), left).edits;
    const places = edits.map((edit) => meetingChangePlace(edit, left));
    expect(places).toEqual([
      'why it lands',
      'whether "Memories sold while the room argued" is in the story',
      'whether "The suspects the room let go" is in the story',
      `the thread you added, "${ADDED.name}"`
    ]);
    places.forEach((place) => expect(place).not.toMatch(/\b[tcqa]\d+\b/));
  });
});

describe('a pick alone, or answers alone, is nothing to fit in (Review focus 3)', () => {
  const state = () => ({ weave: withFactCheckMark(anglesWeave(), { at: 'x', ready: true, fixes: 0 }), _weaveBaseline: anglesWeave() });

  test('angle 2 picked and approved with no change records no edit', () => {
    const left = anglesWeave();
    left[PICKED_KEY] = 'a2';
    const result = meetingResume({ meeting: 'approve', weave: left }, state());
    expect(result.error).toBeNull();
    expect(result.stateUpdates._weaveHandEdits).toBeNull();
    expect(result.stateUpdates.weave[PICKED_KEY]).toBe('a2');
  });

  test('a reweave of a pick alone, or of answers alone, is refused; a pitch change or a flip is taken', () => {
    const picked = anglesWeave();
    picked[PICKED_KEY] = 'a2';
    expect(meetingResume({ meeting: 'reweave', weave: picked }, state()).error).toMatch(/carries no change to an angle or a thread and no note/);
    const answered = anglesWeave();
    answered.questions[0].answer = 'Mel kept the bar.';
    expect(meetingResume({ meeting: 'reweave', weave: answered }, state()).error).toMatch(/carries no change to an angle or a thread and no note/);
    const pitched = clone(picked);
    pitched.angles[1].story = 'Taylor sank Morgan and Morgan sank Taylor.';
    expect(meetingResume({ meeting: 'reweave', weave: pitched }, state()).error).toBeNull();
    const flipped = clone(picked);
    flipped.angles[1].threads.push('t2');
    const taken = meetingResume({ meeting: 'reweave', weave: flipped }, state());
    expect(taken.error).toBeNull();
    expect(pathsOf(taken.stateUpdates._weaveHandEdits.edits)).toEqual(['angles[#a2].threads[#t2]']);
    expect(weaveForPrompt(taken.stateUpdates.weave)[PICKED_KEY]).toBe('a2');
  });
});
