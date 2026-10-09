/**
 * The session clock (phase 3, brief 3.5; spec section 6 and T7).
 *
 * The investigation cannot begin before 5 AM, since Marcus died around 4 AM, and
 * sessions run in the evening as often as in the day. One decision per session: when
 * the session's first exposure or sale was logged at 5:00 PM or later, the
 * investigation ran in the morning in the story, and every logged time shows AM in
 * place of PM, same hour and minute; otherwise it ran in the afternoon, at the hours it
 * was played, and times show as logged (spec 2026-10-09 section 10). timeOfDayLine says
 * which, for every writer and judge.
 *
 * - The decision reads the evidence log's exposures and the ledger's sales, never an
 *   adjustment: the game master's setup row can fall before 5 PM in an evening
 *   session (092026's was at 6:02 PM, an hour and a half before the first exposure).
 * - "First" is the first event of the session, not the earliest time of day: the
 *   session starts after the longest quiet stretch of the 24-hour clock, so an
 *   evening session that runs past midnight starts in the evening, and 12:15 AM
 *   sorts after 11:50 PM. Past midnight the evening clock carries on into the
 *   afternoon (12:15 AM shows as 12:15 PM), so the evening clock never runs backward.
 * - The parse stamps the decision on the session config (sessionConfig.sessionClock),
 *   so every reader takes the same one. A thread parsed before phase 3 has no stamp;
 *   its clock is decided from what it holds: its exposures and the bundle's sales.
 *   A printer that has no bundle of its own (the transaction links) is handed the
 *   session config through withSessionClock, so it reads the decision the timeline
 *   reads.
 *
 * Every logged time a prompt prints goes through printLoggedTime (the investigation's
 * timeline in the record view and the transaction links), or printClockMinute for
 * the heading of a same-minute group on the timeline, and the time-of-day line prints
 * the span's ends on the same clock. The director's notes are
 * never changed; nothing here touches them.
 *
 * Pure: no I/O, no state.
 */

/** 5:00 PM, in minutes after midnight: a first event at or after it decides the evening clock. */
const EVENING_FROM_MINUTES = 17 * 60;
const MINUTES_PER_DAY = 24 * 60;

const UNDECIDED = Object.freeze({ decided: false, evening: false, firstTime: null });

const TWELVE_HOUR = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?\s*[Mm]\.?/;
const TWENTY_FOUR_HOUR = /(?:^|[^\d])(\d{1,2}):(\d{2})(?::\d{2})?(?![\d])/;

/**
 * A logged time, read.
 *
 * Reads "07:50 PM", "07:51PM", "7:05 am" and, with no meridiem, "19:50". Noon is
 * 12:xx PM and midnight 12:xx AM.
 *
 * @param {*} text
 * @returns {{minutes: number}|null} minutes after midnight, or null when it is not a time
 */
function parseLoggedTime(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const twelve = text.match(TWELVE_HOUR);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = Number(twelve[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const pm = twelve[3].toLowerCase() === 'p';
    return { minutes: ((hour % 12) + (pm ? 12 : 0)) * 60 + minute };
  }
  const twentyFour = text.match(TWENTY_FOUR_HOUR);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour > 23 || minute > 59) return null;
    return { minutes: hour * 60 + minute };
  }
  return null;
}

/** The times that read as times, each with its minutes after midnight. */
function readTimes(times) {
  return (Array.isArray(times) ? times : [])
    .map((text) => ({ text, read: parseLoggedTime(text) }))
    .filter(({ read }) => read)
    .map(({ text, read }) => ({ text: text.trim(), minutes: read.minutes }));
}

/**
 * The session's first event among these times: the one after the longest quiet
 * stretch of the 24-hour clock.
 *
 * @param {Array<{text: string, minutes: number}>} parsed - at least one
 * @returns {{text: string, minutes: number}}
 */
function firstEventOf(parsed) {
  const sorted = [...parsed].sort((a, b) => a.minutes - b.minutes);
  let first = sorted[0];
  let longestGap = -1;
  sorted.forEach((event, i) => {
    const previous = sorted[(i - 1 + sorted.length) % sorted.length];
    const gap = (event.minutes - previous.minutes + MINUTES_PER_DAY) % MINUTES_PER_DAY || (sorted.length === 1 ? MINUTES_PER_DAY : 0);
    if (gap > longestGap) {
      longestGap = gap;
      first = event;
    }
  });
  return first;
}

/**
 * The session's clock decision, from the logged times of its exposures and sales.
 *
 * @param {Array<*>} times - every exposure's and sale's logged time; never an adjustment's
 * @returns {{decided: boolean, evening: boolean, firstTime: string|null}}
 */
function decideSessionClock(times) {
  const parsed = readTimes(times);
  if (parsed.length === 0) return { ...UNDECIDED };
  const first = firstEventOf(parsed);
  return { decided: true, evening: first.minutes >= EVENING_FROM_MINUTES, firstTime: first.text };
}

/**
 * The logged time the session starts at, among any of its times: the first event by
 * the rule the clock decision reads. The morning timeline orders its events from
 * this, over every event it prints, the adjustments included, so a bonus logged a
 * minute before the first sale opens the timeline rather than closing it. The clock
 * decision itself still reads the exposures and sales alone.
 *
 * @param {Array<*>} times - logged times
 * @returns {string|null} null when none reads as a time
 */
function firstEventTime(times) {
  const parsed = readTimes(times);
  return parsed.length > 0 ? firstEventOf(parsed).text : null;
}

/** A stamped decision, when it has the shape decideSessionClock returns. */
function stampedClock(sessionConfig) {
  const stamp = sessionConfig && sessionConfig.sessionClock;
  if (!stamp || typeof stamp !== 'object' || typeof stamp.evening !== 'boolean') return null;
  return {
    decided: stamp.decided !== false,
    evening: stamp.evening,
    firstTime: typeof stamp.firstTime === 'string' ? stamp.firstTime : null
  };
}

/**
 * The session's one clock decision.
 *
 * The one the parse stamped on the session config, else one decided from the
 * session's exposures and, when given, the bundle's sales (a thread from before
 * phase 3). Adjustments are never read.
 *
 * @param {Object|null} sessionConfig
 * @param {Object|null} [evidenceBundle] - the curated bundle, for its sales
 * @returns {{decided: boolean, evening: boolean, firstTime: string|null}}
 */
function sessionClockOf(sessionConfig, evidenceBundle = null) {
  const stamped = stampedClock(sessionConfig);
  if (stamped) return stamped;
  return decideSessionClock(sessionTimesOf(sessionConfig, evidenceBundle));
}

/** The session's exposure and sale times, the times the clock decision and the span read; never an adjustment's. */
function sessionTimesOf(sessionConfig, evidenceBundle) {
  const exposures = Array.isArray(sessionConfig?.exposures) ? sessionConfig.exposures : [];
  const sales = Array.isArray(evidenceBundle?.buried?.transactions) ? evidenceBundle.buried.transactions : [];
  return [...exposures.map((e) => e && e.time), ...sales.map((t) => t && t.time)];
}

/**
 * The session's span: from its first sale or exposure to its last, in the session's order
 * (firstEventOf: a session that runs past midnight is one span). The ledger's shift lines
 * the off-clock adjustments up against it (lib/session-ledger.js, ruling R3), and the
 * time-of-day line prints its ends (ruling R7).
 *
 * @param {Array<*>} times - every sale's and exposure's logged time; never an adjustment's
 * @returns {{start: number, end: number, firstTime: string, lastTime: string}|null} `start`
 *   in minutes after midnight, `end` in minutes after the start, and the logged times at
 *   each end; null when no time reads as a time
 */
function sessionSpanOf(times) {
  const parsed = readTimes(times);
  if (parsed.length === 0) return null;
  const first = firstEventOf(parsed);
  const place = (event) => placeInSpan(event.minutes, { start: first.minutes });
  const last = parsed.reduce((latest, event) => (place(event) > place(latest) ? event : latest), first);
  return { start: first.minutes, end: place(last), firstTime: first.text, lastTime: last.text };
}

/**
 * Where a minute of the day falls in a span: minutes after its start.
 *
 * @param {number} minutes - minutes after midnight
 * @param {{start: number}} span
 * @returns {number}
 */
function placeInSpan(minutes, span) {
  return (((minutes - span.start) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * How many minutes a minute of the day sits outside a span, before it or after it; 0 inside.
 *
 * @param {number} minutes - minutes after midnight
 * @param {{start: number, end: number}} span
 * @returns {number}
 */
function minutesOutsideSpan(minutes, span) {
  const place = placeInSpan(minutes, span);
  return place <= span.end ? 0 : Math.min(place - span.end, MINUTES_PER_DAY - place);
}

/** A minute of the day on the session clock, as the time-of-day line prints it: "9:20" and its meridiem. */
function clockReading(minutes, clock) {
  const onClock = placeInSpan(clock && clock.evening ? minutes + MINUTES_PER_DAY / 2 : minutes, { start: 0 });
  const hour = Math.floor(onClock / 60);
  return {
    time: `${hour % 12 === 0 ? 12 : hour % 12}:${String(onClock % 60).padStart(2, '0')}`,
    meridiem: hour < 12 ? 'AM' : 'PM'
  };
}

/**
 * When the investigation ran: the line the session's facts give every writer and judge
 * (phases 14 and 15, brief E; spec section 10, ruling R7). An evening session ran this
 * morning in the story, on the evening clock; a daytime one this afternoon, at the hours
 * it was played. The span runs from the session's first sale or exposure to its last, on
 * the session clock, as the record's timeline prints them:
 *
 *   "The investigation ran this morning, from 9:20 to 10:23 AM."
 *   "The investigation ran this afternoon, from 3:50 to 5:18 PM."
 *
 * The meridiem prints once, unless the span crosses noon, and a session with one event
 * prints that time alone.
 *
 * @param {Object|null} sessionConfig - its exposures, and its stamped clock when it has one
 * @param {Object|null} [evidenceBundle] - the curated bundle, for its sales
 * @returns {string|null} null when the session has no sale and no exposure
 */
function timeOfDayLine(sessionConfig, evidenceBundle = null) {
  const span = sessionSpanOf(sessionTimesOf(sessionConfig, evidenceBundle));
  if (!span) return null;
  const clock = sessionClockOf(sessionConfig, evidenceBundle);
  const when = clock.evening ? 'this morning' : 'this afternoon';
  const first = clockReading(span.start, clock);
  if (span.end === 0) return `The investigation ran ${when}, at ${first.time} ${first.meridiem}.`;
  const last = clockReading(span.start + span.end, clock);
  const from = first.meridiem === last.meridiem ? first.time : `${first.time} ${first.meridiem}`;
  return `The investigation ran ${when}, from ${from} to ${last.time} ${last.meridiem}.`;
}

/**
 * The session config with its one clock decision stamped on it (sessionClock): the
 * parse's own stamp, else the decision sessionClockOf makes from the exposures and
 * the bundle's sales. A caller hands this to a printer that reads the session config
 * without the bundle (the transaction links), so a thread parsed before phase 3 with
 * no stamp and no exposures (092026's shape) prints its links on the clock its
 * timeline prints. The input is never changed.
 *
 * @param {Object|null} sessionConfig
 * @param {Object|null} [evidenceBundle] - the curated bundle, for its sales
 * @returns {Object} a copy of the session config, with `sessionClock`
 */
function withSessionClock(sessionConfig, evidenceBundle = null) {
  return { ...(sessionConfig || {}), sessionClock: sessionClockOf(sessionConfig, evidenceBundle) };
}

/** The letter of the other half of the day, in the same case. */
function swapMeridiem(letter) {
  const swapped = letter.toLowerCase() === 'p' ? 'a' : 'p';
  return letter === letter.toUpperCase() ? swapped.toUpperCase() : swapped;
}

/**
 * One logged time as a prompt prints it, on the session's clock.
 *
 * The evening clock moves the time 12 hours: PM becomes AM (same hour and minute),
 * and a time past midnight becomes PM. Otherwise, and for text that is not a time,
 * the time prints as logged.
 *
 * @param {*} text - the logged time
 * @param {Object|null} clock - a decision from decideSessionClock or sessionClockOf
 * @returns {string} '' for no time
 */
function printLoggedTime(text, clock) {
  if (text === null || text === undefined) return '';
  const logged = String(text).trim();
  if (!clock || !clock.evening || !parseLoggedTime(logged)) return logged;
  if (TWELVE_HOUR.test(logged)) {
    // Inside the time parseLoggedTime read, the meridiem is the only A or P: the
    // match opens on the hour's digits. Text around the time keeps its letters.
    return logged.replace(TWELVE_HOUR, (time) => time.replace(/[AaPp]/, swapMeridiem));
  }
  // A 24-hour time: move the hour by 12, keeping the logged hour's width.
  return logged.replace(/(\d{1,2}):(\d{2})/, (match, hour, minute) => {
    const moved = String((Number(hour) + 12) % 24);
    return `${hour.length === 2 ? moved.padStart(2, '0') : moved}:${minute}`;
  });
}

/**
 * Minutes after midnight, written back as a logged time in the session report's own
 * format: "03:55 PM", the hour two digits. A minute past either end of the day wraps.
 * The parse writes a ledger row it shifts onto the game's clock with this
 * (lib/session-ledger.js; phases 14 and 15, brief C), so every reader takes the shifted
 * time as it takes a logged one.
 *
 * @param {number} minutes
 * @returns {string}
 */
function loggedTimeFromMinutes(minutes) {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(wrapped / 60);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hour12)}:${pad(wrapped % 60)} ${hour < 12 ? 'AM' : 'PM'}`;
}

/**
 * One minute on the session clock, in one format: "07:50 AM", the hour two digits.
 *
 * printLoggedTime keeps each time's logged format, and the session report writes one
 * minute more than one way ("07:50 PM" for a sale, "07:50PM" for an adjustment). The
 * morning timeline heads each same-minute group with this, so one minute prints one
 * way. The clock is printLoggedTime's: the evening clock moves the time 12 hours.
 *
 * @param {*} text - the logged time
 * @param {Object|null} clock - a decision from decideSessionClock or sessionClockOf
 * @returns {string|null} null when the text is not a time
 */
function printClockMinute(text, clock) {
  const read = parseLoggedTime(typeof text === 'string' ? text : '');
  if (!read) return null;
  return loggedTimeFromMinutes(clock && clock.evening ? read.minutes + MINUTES_PER_DAY / 2 : read.minutes);
}

/**
 * Where a logged time falls in the session: minutes after the session's start.
 *
 * @param {*} text - the logged time
 * @param {string|null} startTime - the logged time the session starts at (firstEventTime)
 * @returns {number|null} null when the text is not a time
 */
function sessionOrderOf(text, startTime) {
  const read = parseLoggedTime(typeof text === 'string' ? text : '');
  if (!read) return null;
  const start = parseLoggedTime(typeof startTime === 'string' ? startTime : '');
  if (!start) return read.minutes;
  return (read.minutes - start.minutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

module.exports = {
  EVENING_FROM_MINUTES,
  parseLoggedTime,
  decideSessionClock,
  sessionClockOf,
  withSessionClock,
  firstEventTime,
  printLoggedTime,
  printClockMinute,
  loggedTimeFromMinutes,
  sessionOrderOf,
  // Phases 14 and 15, brief E (rulings R3 and R7): the session's span, which the ledger's
  // shift and the time-of-day line read, and the time-of-day line
  sessionSpanOf,
  placeInSpan,
  minutesOutsideSpan,
  timeOfDayLine
};
