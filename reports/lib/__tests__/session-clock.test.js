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
  printLoggedTime,
  sessionOrderOf
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
    expect(sessionOrderOf('12:15 AM', clock)).toBeGreaterThan(sessionOrderOf('11:50 PM', clock));
    expect(sessionOrderOf('11:50 PM', clock)).toBeGreaterThan(sessionOrderOf('07:37 PM', clock));
  });
});

describe('noon in a daytime session', () => {
  it('orders 12:05 PM after 11:55 AM', () => {
    const clock = decideSessionClock(['11:40 AM', '11:55 AM', '12:05 PM']);
    expect(clock.evening).toBe(false);
    expect(sessionOrderOf('12:05 PM', clock)).toBeGreaterThan(sessionOrderOf('11:55 AM', clock));
  });

  it('gives no order to a time it cannot read', () => {
    const clock = decideSessionClock(['11:40 AM']);
    expect(sessionOrderOf('sometime', clock)).toBeNull();
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
