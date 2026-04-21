const { synthesizePlayerFocus } = require('../workflow/nodes/node-helpers');

describe('synthesizePlayerFocus — reads enriched director-notes shape', () => {
  const sessionConfig = {
    roster: ['Alex', 'Vic', 'Morgan'],
    accusation: { accused: ['Alex'], charge: 'Murder of Marcus', notes: 'Stolen code motive' }
  };

  it('exposes directorObservations with rawProse, quotes, postInvestigationDevelopments', () => {
    const directorNotes = {
      rawProse: 'Alex was seen with Sam. "we had to act" Alex said.',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      postInvestigationDevelopments: [{ headline: 'Alex detained' }],
      whiteboard: {}
    };
    const focus = synthesizePlayerFocus(sessionConfig, directorNotes);

    expect(focus.directorObservations.rawProse).toBe(directorNotes.rawProse);
    expect(focus.directorObservations.quotes).toEqual(directorNotes.quotes);
    expect(focus.directorObservations.postInvestigationDevelopments).toEqual(directorNotes.postInvestigationDevelopments);
  });

  it('does NOT expose legacy behaviorPatterns/suspiciousCorrelations/notableMoments fields', () => {
    const directorNotes = { rawProse: 'notes', whiteboard: {} };
    const focus = synthesizePlayerFocus(sessionConfig, directorNotes);
    expect(focus.directorObservations.behaviorPatterns).toBeUndefined();
    expect(focus.directorObservations.suspiciousCorrelations).toBeUndefined();
    expect(focus.directorObservations.notableMoments).toBeUndefined();
  });

  it('handles missing director notes gracefully', () => {
    const focus = synthesizePlayerFocus(sessionConfig, null);
    expect(focus.directorObservations.rawProse).toBe('');
    expect(focus.directorObservations.quotes).toEqual([]);
    expect(focus.directorObservations.postInvestigationDevelopments).toEqual([]);
  });

  it('still carries accusation and primaryInvestigation through', () => {
    const focus = synthesizePlayerFocus(sessionConfig, { rawProse: '' });
    expect(focus.accusation.accused).toEqual(['Alex']);
    expect(focus.primaryInvestigation).toBe('Murder of Marcus');
  });
});
