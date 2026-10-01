/**
 * The session clock (phase 3, brief 3.5; spec section 6 and T7).
 *
 * The investigation is the morning in the fiction, and sessions run in the evening
 * as often as in the day. One decision per session puts every logged time on the
 * morning clock: when the session's first exposure or sale was logged at 5:00 PM or
 * later, every logged time shows AM in place of PM, same hour and minute; otherwise
 * times show as logged.
 *
 * - The decision reads the evidence log's exposures and the ledger's sales, never an
 *   adjustment: the game master's setup row can fall before 5 PM in an evening
 *   session (092026's was at 6:02 PM, an hour and a half before the first exposure).
 * - "First" is the first event of the session, not the earliest time of day: the
 *   session starts after the longest quiet stretch of the 24-hour clock, so an
 *   evening session that runs past midnight starts in the evening, and 12:15 AM
 *   sorts after 11:50 PM. Past midnight the evening clock carries on into the
 *   afternoon (12:15 AM shows as 12:15 PM), so the morning clock never runs backward.
 * - The parse stamps the decision on the session config (sessionConfig.sessionClock),
 *   so every reader takes the same one. A thread parsed before phase 3 has no stamp;
 *   its clock is decided from what it holds (its exposures, and the bundle's sales
 *   when the caller has the bundle).
 *
 * Every logged time a prompt prints goes through printLoggedTime: the morning
 * timeline in the record view and the transaction links. The director's notes are
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
  const parsed = (Array.isArray(times) ? times : [])
    .map((text) => ({ text, read: parseLoggedTime(text) }))
    .filter(({ read }) => read)
    .map(({ text, read }) => ({ text: text.trim(), minutes: read.minutes }));
  if (parsed.length === 0) return { ...UNDECIDED };
  const first = firstEventOf(parsed);
  return { decided: true, evening: first.minutes >= EVENING_FROM_MINUTES, firstTime: first.text };
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
  const exposures = Array.isArray(sessionConfig?.exposures) ? sessionConfig.exposures : [];
  const sales = Array.isArray(evidenceBundle?.buried?.transactions) ? evidenceBundle.buried.transactions : [];
  return decideSessionClock([
    ...exposures.map((e) => e && e.time),
    ...sales.map((t) => t && t.time)
  ]);
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
    return logged.replace(/([AaPp])(\.?\s*[Mm]\.?)/, (match, letter, rest) => swapMeridiem(letter) + rest);
  }
  // A 24-hour time: move the hour by 12, keeping the logged hour's width.
  return logged.replace(/(\d{1,2}):(\d{2})/, (match, hour, minute) => {
    const moved = String((Number(hour) + 12) % 24);
    return `${hour.length === 2 ? moved.padStart(2, '0') : moved}:${minute}`;
  });
}

/**
 * Where a logged time falls in the session: minutes after the session's first event.
 *
 * @param {*} text - the logged time
 * @param {Object|null} clock
 * @returns {number|null} null when the text is not a time
 */
function sessionOrderOf(text, clock) {
  const read = parseLoggedTime(typeof text === 'string' ? text : '');
  if (!read) return null;
  const start = clock && clock.firstTime ? parseLoggedTime(clock.firstTime) : null;
  if (!start) return read.minutes;
  return (read.minutes - start.minutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

module.exports = {
  EVENING_FROM_MINUTES,
  parseLoggedTime,
  decideSessionClock,
  sessionClockOf,
  printLoggedTime,
  sessionOrderOf
};
