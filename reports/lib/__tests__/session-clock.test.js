/**
 * The session clock (phase 3, brief 3.5; spec section 6, T7).
 *
 * One decision per session, from the first exposure or sale, never from a game
 * master's setup row: when the session's first event is at 5:00 PM or later, every
 * logged time shows AM in place of PM, same hour and minute; otherwise times show as
 * logged. Every logged time a prompt prints goes through it (the morning timeline and
 * the transaction links), and it orders noon and midnight correctly.
 */

const {
  parseLoggedTime,
  decideSessionClock,
  sessionClockOf,
  withSessionClock,
  printLoggedTime,
  printClockMinute,
  firstEventTime,
  sessionOrderOf,
  loggedTimeFromMinutes,
  sessionSpanOf,
  placeInSpan,
  minutesOutsideSpan,
  timeOfDayLine
} = require('../prompt-renderers/session-clock');

describe('parseLoggedTime', () => {
  it('reads the clock forms the session report uses', () => {
    expect(parseLoggedTime('07:50 PM').minutes).toBe(19 * 60 + 50);
    expect(parseLoggedTime('07:51PM').minutes).toBe(19 * 60 + 51);
    expect(parseLoggedTime('7:05 am').minutes).toBe(7 * 60 + 5);
  });

  it('puts noon at 12 and midnight at 0', () => {
    expect(parseLoggedTime('12:05 PM').minutes).toBe(12 * 60 + 5);
    expect(parseLoggedTime('12:15 AM').minutes).toBe(15);
  });

  it('returns null for text that is not a time', () => {
    expect(parseLoggedTime('')).toBeNull();
    expect(parseLoggedTime(null)).toBeNull();
    expect(parseLoggedTime('after the vote')).toBeNull();
  });
});

describe('decideSessionClock: the 5 PM rule, on the first exposure or sale', () => {
  it('a first event at 4:59 PM keeps the times as logged', () => {
    const clock = decideSessionClock(['04:59 PM', '05:30 PM', '06:10 PM']);
    expect(clock).toEqual({ decided: true, evening: false, firstTime: '04:59 PM' });
    expect(printLoggedTime('05:30 PM', clock)).toBe('05:30 PM');
  });

  it('a first event at 5:00 PM shows AM in place of PM, same hour and minute', () => {
    const clock = decideSessionClock(['05:00 PM', '06:10 PM']);
    expect(clock).toEqual({ decided: true, evening: true, firstTime: '05:00 PM' });
    expect(printLoggedTime('05:00 PM', clock)).toBe('05:00 AM');
    expect(printLoggedTime('06:10PM', clock)).toBe('06:10AM');
  });

  it('a daytime session keeps every time as logged', () => {
    const clock = decideSessionClock(['01:12 PM', '02:25 PM', '03:40 PM']);
    expect(clock.evening).toBe(false);
    ['01:12 PM', '02:25 PM', '03:40 PM'].forEach((t) => expect(printLoggedTime(t, clock)).toBe(t));
  });

  it('finds the first event of an evening session that crosses midnight', () => {
    const clock = decideSessionClock(['12:15 AM', '11:50 PM', '07:37 PM', '12:30 AM']);
    expect(clock).toEqual({ decided: true, evening: true, firstTime: '07:37 PM' });
  });

  it('is undecided when no exposure or sale carries a time, and then prints times as logged', () => {
    const clock = decideSessionClock(['', null, 'unknown']);
    expect(clock).toEqual({ decided: false, evening: false, firstTime: null });
    expect(printLoggedTime('07:50 PM', clock)).toBe('07:50 PM');
  });
});

describe('the evening clock across midnight', () => {
  const clock = decideSessionClock(['07:37 PM', '11:50 PM', '12:15 AM']);

  it('prints a time after midnight on the same morning clock, 12 hours on', () => {
    expect(printLoggedTime('11:50 PM', clock)).toBe('11:50 AM');
    expect(printLoggedTime('12:15 AM', clock)).toBe('12:15 PM');
  });

  it('orders 12:15 AM after 11:50 PM', () => {
    const start = clock.firstTime;
    expect(sessionOrderOf('12:15 AM', start)).toBeGreaterThan(sessionOrderOf('11:50 PM', start));
    expect(sessionOrderOf('11:50 PM', start)).toBeGreaterThan(sessionOrderOf('07:37 PM', start));
  });
});

describe('printLoggedTime rewrites only the meridiem of the time it read (fix batch, finding 3)', () => {
  const evening = decideSessionClock(['07:37 PM']);

  it('leaves letters before the time alone', () => {
    expect(printLoggedTime('Sam 07:50 PM', evening)).toBe('Sam 07:50 AM');
    expect(printLoggedTime('Pam at 07:50pm', evening)).toBe('Pam at 07:50am');
  });
});

describe('printClockMinute: one format for a minute on the session clock (fix batch, finding 1)', () => {
  const evening = decideSessionClock(['07:37 PM']);
  const daytime = decideSessionClock(['01:07 PM']);

  it('prints the same minute the same way however it was logged', () => {
    expect(printClockMinute('07:50 PM', evening)).toBe('07:50 AM');
    expect(printClockMinute('07:50PM', evening)).toBe('07:50 AM');
    expect(printClockMinute('7:50 pm', evening)).toBe('07:50 AM');
    expect(printClockMinute('19:50', evening)).toBe('07:50 AM');
  });

  it('keeps noon, midnight and a daytime session on the clock printLoggedTime uses', () => {
    expect(printClockMinute('12:15 AM', evening)).toBe('12:15 PM');
    expect(printClockMinute('2:25PM', daytime)).toBe('02:25 PM');
    expect(printClockMinute('12:05 PM', daytime)).toBe('12:05 PM');
    expect(printClockMinute('12:05 AM', daytime)).toBe('12:05 AM');
  });

  it('is null for text that is not a time', () => {
    expect(printClockMinute('sometime', evening)).toBeNull();
    expect(printClockMinute(null, evening)).toBeNull();
  });
});

describe('firstEventTime: where the session starts among any times (fix batch, finding 2)', () => {
  it('is the time after the longest quiet stretch, as the clock decision reads it', () => {
    expect(firstEventTime(['02:30 PM', '01:51 PM', '01:52 PM'])).toBe('01:51 PM');
    expect(firstEventTime(['12:15 AM', '11:50 PM', '07:37 PM'])).toBe('07:37 PM');
  });

  it('is null with no readable time', () => {
    expect(firstEventTime(['', null, 'after the vote'])).toBeNull();
  });
});

describe('noon in a daytime session', () => {
  it('orders 12:05 PM after 11:55 AM', () => {
    const clock = decideSessionClock(['11:40 AM', '11:55 AM', '12:05 PM']);
    expect(clock.evening).toBe(false);
    expect(sessionOrderOf('12:05 PM', clock.firstTime)).toBeGreaterThan(sessionOrderOf('11:55 AM', clock.firstTime));
  });

  it('gives no order to a time it cannot read', () => {
    const clock = decideSessionClock(['11:40 AM']);
    expect(sessionOrderOf('sometime', clock.firstTime)).toBeNull();
    expect(printLoggedTime('sometime', clock)).toBe('sometime');
  });
});

describe('sessionClockOf: one decision per session', () => {
  const bundle = { buried: { transactions: [{ shellAccount: 'Ember', amount: 100000, time: '05:10 PM' }] } };

  it('uses the decision the parse stamped on the session config', () => {
    const stamped = { decided: true, evening: false, firstTime: '04:59 PM' };
    expect(sessionClockOf({ sessionClock: stamped }, bundle)).toEqual(stamped);
  });

  it('decides from the exposures and the sales when the parse stamped none (a thread from before phase 3)', () => {
    expect(sessionClockOf({ exposures: [{ tokenId: 'ale003', time: '05:20 PM' }] }, bundle))
      .toEqual({ decided: true, evening: true, firstTime: '05:10 PM' });
    expect(sessionClockOf({ exposures: [{ tokenId: 'ale003', time: '02:25 PM' }] }, null))
      .toEqual({ decided: true, evening: false, firstTime: '02:25 PM' });
  });

  it('never reads an adjustment: a setup row before 5 PM does not decide the clock', () => {
    const sessionConfig = {
      exposures: [],
      adjustments: [{ time: '04:50 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' }]
    };
    expect(sessionClockOf(sessionConfig, bundle)).toEqual({ decided: true, evening: true, firstTime: '05:10 PM' });
  });

  it('is undecided with nothing to read', () => {
    expect(sessionClockOf(null, null)).toEqual({ decided: false, evening: false, firstTime: null });
  });
});

describe('withSessionClock: the decision handed to a printer with no bundle (fix batch, finding 8)', () => {
  const bundle = { buried: { transactions: [{ shellAccount: 'Ember', amount: 100000, time: '07:50 PM' }] } };

  it('stamps the decision the timeline makes from the bundle on a thread with no stamp and no exposures', () => {
    const config = { roster: ['Vic'] };
    const stamped = withSessionClock(config, bundle);
    expect(stamped.sessionClock).toEqual({ decided: true, evening: true, firstTime: '07:50 PM' });
    expect(sessionClockOf(stamped)).toEqual(sessionClockOf(config, bundle));
    expect(stamped.roster).toEqual(['Vic']);
    expect(config).not.toHaveProperty('sessionClock');
  });

  it('keeps the stamp the parse made', () => {
    const stamp = { decided: true, evening: false, firstTime: '04:59 PM' };
    expect(withSessionClock({ sessionClock: stamp }, bundle).sessionClock).toEqual(stamp);
  });
});

/**
 * Phases 14 and 15, brief C (ruling R3): a ledger row the parse shifts onto the game's
 * clock is written back as a logged time, in the one format the session report's own
 * rows read as: "hh:mm AM", the hour two digits. printClockMinute prints a minute on the
 * session clock through it.
 */
describe('loggedTimeFromMinutes: minutes after midnight, written back as a logged time', () => {
  it('writes the hour in two digits and the meridiem after a space, noon and midnight included', () => {
    expect(loggedTimeFromMinutes(15 * 60 + 55)).toBe('03:55 PM');
    expect(loggedTimeFromMinutes(9 * 60 + 21)).toBe('09:21 AM');
    expect(loggedTimeFromMinutes(0)).toBe('12:00 AM');
    expect(loggedTimeFromMinutes(12 * 60 + 5)).toBe('12:05 PM');
    expect(loggedTimeFromMinutes(23 * 60 + 59)).toBe('11:59 PM');
  });

  it('wraps a minute past either end of the day', () => {
    expect(loggedTimeFromMinutes(-60)).toBe('11:00 PM');
    expect(loggedTimeFromMinutes(24 * 60 + 30)).toBe('12:30 AM');
  });

  it('reads back as the same minute', () => {
    [0, 1, 719, 720, 1439].forEach((m) => expect(parseLoggedTime(loggedTimeFromMinutes(m))).toEqual({ minutes: m }));
  });
});

/**
 * Phases 14 and 15, brief E (rulings R3 and R7): the session's span, from its first sale or
 * exposure to its last in the session clock's order, which the ledger's shift and the
 * time-of-day line both read; and the time-of-day line, the session's facts on when the
 * investigation ran. An evening session (first event at 5:00 PM or later) ran in the morning
 * in the story, its times on the evening clock; an earlier one ran in the afternoon, its times
 * as logged.
 */
describe('sessionSpanOf: the session from its first sale or exposure to its last', () => {
  it('starts at the first event and measures the end from it', () => {
    const span = sessionSpanOf(['09:20 PM', '10:23 PM', '09:41 PM']);
    expect(span).toEqual({ start: 21 * 60 + 20, end: 63, firstTime: '09:20 PM', lastTime: '10:23 PM' });
  });

  it('runs past midnight as one span', () => {
    const span = sessionSpanOf(['11:30 PM', '12:40 AM']);
    expect(span).toEqual({ start: 23 * 60 + 30, end: 70, firstTime: '11:30 PM', lastTime: '12:40 AM' });
    expect(placeInSpan(15, span)).toBe(45);
  });

  it('is null when no time reads as a time', () => {
    expect(sessionSpanOf([])).toBeNull();
    expect(sessionSpanOf([null, 'soon'])).toBeNull();
  });

  it('says how far a minute of the day sits outside it, before or after', () => {
    const span = sessionSpanOf(['03:54 PM', '05:15 PM']);
    expect(minutesOutsideSpan(16 * 60, span)).toBe(0);
    expect(minutesOutsideSpan(17 * 60 + 45, span)).toBe(30);
    expect(minutesOutsideSpan(15 * 60, span)).toBe(54);
  });
});

describe('timeOfDayLine: when the investigation ran, from the session clock and the span', () => {
  const bundleOf = (...times) => ({ buried: { transactions: times.map((time) => ({ shellAccount: 'Acct', amount: 1000, time })) } });

  it('puts an evening session in the morning, on the evening clock', () => {
    const config = { exposures: [{ tokenId: 'a1', time: '09:20 PM' }] };
    expect(timeOfDayLine(config, bundleOf('09:41 PM', '10:23 PM')))
      .toBe('The investigation ran this morning, from 9:20 to 10:23 AM.');
  });

  it('puts a daytime session in the afternoon, at the hours it was played', () => {
    const config = { exposures: [{ tokenId: 'a1', time: '05:18 PM' }], sessionClock: { decided: true, evening: false, firstTime: '03:50 PM' } };
    expect(timeOfDayLine(config, bundleOf('03:50 PM', '04:22PM')))
      .toBe('The investigation ran this afternoon, from 3:50 to 5:18 PM.');
  });

  it('names both meridiems when the span crosses noon', () => {
    expect(timeOfDayLine({}, bundleOf('11:30 PM', '12:40 AM')))
      .toBe('The investigation ran this morning, from 11:30 AM to 12:40 PM.');
  });

  it('gives one time for a session with one event', () => {
    expect(timeOfDayLine({}, bundleOf('07:50 PM'))).toBe('The investigation ran this morning, at 7:50 AM.');
  });

  it('reads the sales and exposures, never an adjustment', () => {
    const config = { adjustments: [{ kind: 'bonus', time: '06:02 PM' }], exposures: [{ tokenId: 'a1', time: '07:37 PM' }] };
    expect(timeOfDayLine(config, bundleOf('07:50 PM'))).toBe('The investigation ran this morning, from 7:37 to 7:50 AM.');
  });

  it('is null for a session with no sale and no exposure', () => {
    expect(timeOfDayLine({}, { buried: { transactions: [] } })).toBeNull();
    expect(timeOfDayLine({ adjustments: [{ kind: 'bonus', time: '06:02 PM' }] }, null)).toBeNull();
    expect(timeOfDayLine(null, null)).toBeNull();
  });
});
