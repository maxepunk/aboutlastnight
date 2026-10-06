/**
 * The connection strike goes from the weave (phase 4b, piece 3, brief 3C; R7; spec 2026-10-06
 * sections 6 and 14). A connection shows only while both its threads are in the open angle, so
 * the director takes one out by taking a thread out, or with a note. Nothing on the server or in
 * the console writes, reads, restores or names a strike on a weave's connection; the map's
 * struck beats keep theirs (isStrike, the report's `struck`).
 */
const weaveLib = require('../weave');
const meeting = require('../meeting');
const diff = require('../hand-edit-diff');
const { buildRevisionContext } = require('../workflow/nodes/node-helpers');
const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
const ViewLogic = require('../../console/checkpoint-view-logic');
const { anglesWeave } = require('./fixtures/angles-weave');

describe('the connection strike is gone from the weave (R7)', () => {
  it('lib/weave.js keeps no strike machinery', () => {
    ['STRUCK_KEY', 'isStruck', 'liveConnections', 'withStruckConnections', 'isSameConnection', 'freshConnectionId']
      .forEach((name) => expect(weaveLib).not.toHaveProperty(name));
  });

  it('the director-side schema names no strike, and a stray struck key takes no connection out of the story', () => {
    expect(meeting.DIRECTOR_WEAVE_SCHEMA.properties.connections.items.properties).not.toHaveProperty('struck');
    const left = anglesWeave();
    left.connections[0].struck = true;
    expect(weaveLib.settledAngleOf(left).connections.map((c) => c.id)).toContain('c1');
    const changes = diff.weaveEditsBetween(anglesWeave(), left);
    expect(changes.map((c) => [c.scope, c.after])).toEqual([['connections', true]]);
    changes.forEach((c) => {
      expect(c).not.toHaveProperty('struck');
      expect(c).not.toHaveProperty('unstruck');
    });
  });

  it('the weave rework keeps no line on a struck id, and the writer output no strike filter', () => {
    expect(arcTesting).not.toHaveProperty('ARC_REWORK_STRUCK_IDS');
  });

  it('the weave edit lines and their rules say nothing of a strike or a connection brought back', () => {
    expect(diff.WEAVE_EDIT_LINES_GUIDE).not.toMatch(/struck|brought back/);
    const baseline = anglesWeave();
    const previous = anglesWeave();
    previous.threads[1].line = 'Vic met Morgan, and the room nearly named him.';
    const edits = diff.standingAtMeeting(null, baseline, previous);
    expect(edits.edits).toHaveLength(1);
    [null, 'reweave', 'send-back'].forEach((round) => {
      const { contextSection } = buildRevisionContext({
        phase: 'arcs', outputName: 'weave', revisionCount: 0, previousOutput: previous, handEdits: edits,
        meetingRound: round, humanFeedback: round ? 'A note.' : null
      });
      expect(contextSection).toContain('<HAND_EDITS>');
      expect(contextSection).not.toMatch(/struck|brought back/);
    });
  });

  it('the console keeps no strike on a weave connection', () => {
    expect(ViewLogic).not.toHaveProperty('setConnectionStruck');
    expect(ViewLogic).not.toHaveProperty('STRUCK_KEY');
    const view = ViewLogic.meetingView(
      meeting.meetingCheckpointData({ weave: anglesWeave() }, { evidenceIndex: {}, maxRevisions: 1 }), anglesWeave(), ''
    );
    expect(view.connections.length).toBeGreaterThan(0);
    view.connections.forEach((connection) => {
      expect(connection).not.toHaveProperty('struck');
      expect(connection.labels).not.toHaveProperty('strike');
    });
  });
});
