/**
 * The pages the stops show (phase 4, briefs 4.12a and 4.12c; spec section 13), each as the lines
 * its view models render. They are the models the console's components render, so a page here is
 * the console's page:
 * - the story meeting, the map and the desk: console/checkpoint-view-logic.js meetingView, mapView
 *   and deskView, with console/article-desk-logic.js for the desk's pieces;
 * - the input review (task 4.12c): the parse the director checks there, as InputReview.js renders
 *   it through console/checkpoint-view-logic.js and console/input-review-logic.js. That is the
 *   verdict (accusationView, verdictView, votesView), the ledger (ledgerView), the exposures
 *   (exposuresView), the whiteboard (whiteboardView), and the director's notes as the enricher
 *   indexed them (quoteView, epilogueItemView). The roster and the session's settings are what
 *   the director entered, and the component renders the rest of its payload with no view model,
 *   so neither is on the page or in its count. The harness prints the session's settings, the
 *   roster, the player focus and the enricher's result beside the page (scripts/lib/stop-print.js);
 * - the character-IDs stop (task 4.12c): its cards (characterIdCards), each text cut where the
 *   card cuts it until the director opens the card. The harness prints the roster bar above them.
 * Two readers share a page:
 * - the e2e harness prints it in step mode (scripts/lib/stop-print.js);
 * - the stops log (lib/stops-log.js) records the words the director reads at each return to a
 *   stop, counted over it (wordsShown).
 *
 * A line is `{tone, text, label, folded, beside?, piece?}`:
 * - `text` is the view models' own text: a claim, a beat's material, a paragraph, a mark;
 * - `label` names the line: an id, a piece of the desk, or the page's own heading for the line
 *   ("Receipt", "Job"). A title, and a line the page shows by its name alone (a photo, a heading
 *   the page does not print, a line in the component's own fixed words), carries only a label;
 * - `tone` is what kind of line it is: title, text, note (what happened this round), alert (a
 *   check still failing, a problem the console would refuse), concern, mark, struck or hint;
 * - `folded` marks what the page folds away, as its component folds it: the standing notes, the
 *   map's left out (until a concern opens it), the trace, the desk's folds below the article, the
 *   input review's closed sections, and what a character-IDs card shows only once opened;
 * - `beside` marks a concern or a mark that sits beside the line before it;
 * - `piece` is the desk's key for the piece a line prints or sits beside (deskAnchorKey).
 *
 * The words a stop shows are lib/word-count.js's count of the text of every line the page does
 * not fold. A label is not counted: an id is a handle, and a heading is the page's wording, not
 * what the director reads at the stop.
 *
 * Which parts fold, and the headings a page words itself (PAGE_HEADINGS), are decided in each
 * stop's component; __tests__/unit/console-stop-pages.test.js holds the two together on the
 * component sources.
 *
 * Every other stop renders its payload in its component with no view model, so it has no page
 * here, and its words are not counted. A page reads the stop's output as the payload carries it,
 * since the server and the harness hold no draft of the director's.
 */
'use strict';

const View = require('../console/checkpoint-view-logic');
const Desk = require('../console/article-desk-logic');
const InputLogic = require('../console/input-review-logic');
const { wordCount } = require('./word-count');
const { CHECKPOINT_TYPES } = require('./workflow/checkpoint-helpers');

const { INPUT_REVIEW, ARC_SELECTION, CHARACTER_IDS, OUTLINE, ARTICLE } = CHECKPOINT_TYPES;

/**
 * The headings each page words itself, in its component's words (task 4.12c). A heading with a
 * count is the words before the count. Every other title on a page is a view model's (the
 * standing notes, left out, the trace, the desk's echo and folds, a map section's label) or a
 * card's photo, which the component reads as well.
 */
const PAGE_HEADINGS = Object.freeze({
  [INPUT_REVIEW]: Object.freeze({
    accusation: 'Accusation',
    ledger: 'Ledger',
    accounts: 'Accounts',
    exposures: 'Exposed Memories',
    quotes: 'Quote Bank',
    epilogue: 'Post-Investigation Developments',
    whiteboard: 'Whiteboard'
  }),
  [ARC_SELECTION]: Object.freeze({
    round: 'Since you last looked',
    changedEdits: 'Your edits a rework changed',
    verdict: 'The verdict',
    threads: 'The threads',
    connections: 'Where they touch',
    questions: 'Questions'
  }),
  [CHARACTER_IDS]: Object.freeze({}),
  [OUTLINE]: Object.freeze({
    settledStory: 'The settled story',
    round: 'Since you last looked',
    changedEdits: 'Your edits a rework changed',
    gap: 'The gap',
    top: 'The headline, the deck and the top photo',
    dropped: 'Dropped',
    tally: 'Everyone and the counts',
    weaveChanges: 'What the map changed to fit your meeting'
  }),
  [ARTICLE]: Object.freeze({
    cards: 'EVIDENCE CARDS',
    tracker: 'FINANCIAL TRACKER',
    problems: 'To fix before you approve or send back'
  })
});

/** Where a character-IDs card cuts its texts until the director opens it: the scene at 100 characters, a person at 80. */
const CARD_CUTS = Object.freeze({ visual: 100, description: 80 });

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A list as the page reads it: the list, or an empty one. */
function listOf(value) {
  return Array.isArray(value) ? value : [];
}

/** A value as the page prints it: text as it is, a number as its digits, anything else as nothing. */
function textOf(value) {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/**
 * A page under construction: its lines in the order the stop shows them. A line with no text is
 * no line, except one the page shows by its label alone (`tag`, `title`). Everything added inside
 * `folded(...)` is folded, and everything inside `inPiece(key, ...)` carries the desk's key.
 */
function pageOf(stop) {
  const lines = [];
  let folding = false;
  let piece = null;
  const push = (tone, text, label, extra) => {
    const line = { tone, text, label, folded: folding };
    if (piece !== null) line.piece = piece;
    lines.push(Object.assign(line, extra));
  };
  const add = (tone, text, label, extra) => {
    const t = textOf(text);
    if (t.trim()) push(tone, t, textOf(label), extra);
  };
  const named = (tone, label) => {
    const l = textOf(label);
    if (l.trim()) push(tone, '', l);
  };
  return {
    title: (label) => named('title', label),
    /** A line the page shows by its label alone. */
    tag: (label, tone = 'text') => named(tone, label),
    text: (text, label) => add('text', text, label),
    note: (text, label) => add('note', text, label),
    alert: (text, label) => add('alert', text, label),
    hint: (text) => add('hint', text, ''),
    struck: (text, label) => add('struck', text, label),
    /** The concerns and the marks beside the line before them. */
    beside: (concerns, marks) => {
      (concerns || []).forEach((text) => add('concern', text, '', { beside: true }));
      (marks || []).forEach((text) => add('mark', text, '', { beside: true }));
    },
    /** A mark beside the line before it, under the label the page gives it. */
    besideMark: (tone, text, label) => add(tone, text, label, { beside: true }),
    /** A line of the given kind, under a title rather than beside a line: a round's marks, the marks beside no piece. */
    toned: (tone, text, label) => add(tone, text, label),
    folded: (fn) => {
      const was = folding;
      folding = true;
      fn();
      folding = was;
    },
    /** Lines that print one piece of the desk, or sit beside it. */
    inPiece: (key, fn) => {
      const was = piece;
      piece = key;
      fn();
      piece = was;
    },
    done: () => ({ stop, lines })
  };
}

/** The standing notes, folded under a stop's note box (standingNotesView). */
function addStandingNotes(page, gateNotes) {
  const standing = View.standingNotesView(gateNotes);
  if (!standing.any) return;
  page.folded(() => {
    page.title(standing.title);
    standing.items.forEach((item) => page.text(item.text, item.label));
  });
}

/** The trace of the round's automatic passes, folded below the map and the article (traceView). */
function addTrace(page, trace, theme) {
  const view = View.traceView(trace, theme);
  if (!view.any) return;
  page.folded(() => {
    page.title(view.title);
    view.passes.forEach((pass) => {
      page.title(pass.heading);
      page.note(pass.triggerLabel);
      pass.mustFix.items.forEach((item) => page.alert(item, pass.mustFix.label));
      pass.shouldConsider.items.forEach((item) => page.text(item, pass.shouldConsider.label));
      page.note(pass.changed.text);
      page.note(pass.guidance);
    });
  });
}

// ── The input review (InputReview.js renders the same view models; task 4.12c) ──

/** A whiteboard entry as the component prints it: its text, or the entry as JSON. */
function entryText(item) {
  return typeof item === 'string' ? item : JSON.stringify(item);
}

/** The accusation, as the component heads it: who the room accused, the verdict, the charge, a split vote, the notes. */
function addAccusation(page, accusationValue) {
  const accusation = View.accusationView(accusationValue);
  const verdict = View.verdictView(accusationValue);
  const votes = View.votesView(accusationValue);
  page.title(PAGE_HEADINGS[INPUT_REVIEW].accusation);
  if (accusation.accused) page.text(accusation.accused, 'Accused');
  else if (verdict.noCulprit) page.tag('Accused: no one (the room named no culprit)');
  else if (verdict.blamesNoCharacter) page.tag('Accused: no character (the charge names who the room blamed)');
  else page.tag('Accusation: not parsed. Reject with corrections naming who the room accused and of what, or the article has no verdict to write against.', 'alert');
  page.text(verdict.label, 'Verdict');
  page.text(accusation.charge, 'Charge');
  if (votes.split) page.text(votes.line, 'Final vote (split)');
  page.text(accusation.notes);
}

/** The ledger: the clock rule and what needs the director first, the accounts and adjustments folded. */
function addLedger(page, ledgerValue) {
  const H = PAGE_HEADINGS[INPUT_REVIEW];
  const ledger = InputLogic.ledgerView(ledgerValue);
  page.title(H.ledger);
  page.text(ledger.clockLine);
  ledger.warnings.forEach((warning) => page.alert(warning));
  if (ledger.accounts.length === 0 && ledger.adjustments.length === 0) return;
  page.folded(() => {
    page.title(`${H.accounts} (${ledger.accounts.length}) and adjustments (${ledger.adjustments.length})`);
    ledger.accounts.forEach((account) => page.text(`${account.total}, ${account.sales}`, account.name));
    ledger.adjustments.forEach((line) => page.text(line));
  });
}

/** The exposures: an alarm when none were parsed or the log is empty, each exposed memory folded. */
function addExposures(page, sessionConfig) {
  const exposures = View.exposuresView(sessionConfig.exposures, sessionConfig.exposedTokenCount);
  if (exposures.noneExposed) {
    page.tag('Exposed memories: none parsed from the session report, so every memory will count as buried. Reject with corrections if the evidence log had rows.', 'alert');
  }
  if (exposures.logEmpty) {
    page.tag("Evidence log: no exposure times or turn-in names parsed, so the writers' morning timeline shows no exposures. Reject with corrections if the evidence log had rows.", 'alert');
  }
  if (exposures.count === 0) return;
  page.folded(() => {
    page.title(`${PAGE_HEADINGS[INPUT_REVIEW].exposures} (${exposures.count})`);
    exposures.rows.forEach((row) => {
      page.text([row.exposer && `exposed by ${row.exposer}`, row.time, row.owner && `owner ${row.owner}`].filter(Boolean).join(' · '), row.tokenId);
    });
  });
}

/** The quote bank, folded: each quote under its speaker, with the director's correction and its context. */
function addQuotes(page, quotes) {
  if (quotes.length === 0) return;
  page.folded(() => {
    page.title(`${PAGE_HEADINGS[INPUT_REVIEW].quotes} (${quotes.length})`);
    quotes.map(InputLogic.quoteView).forEach((quote) => {
      page.text(`"${quote.text}"`, quote.speaker + (quote.addressee ? ` → ${quote.addressee}` : ''));
      page.text(quote.correction, "The director's correction");
      page.text(quote.context, 'Context');
    });
  });
}

/** The epilogue, folded: each item's headline where a stored one has it, the director's sentence, its subjects. */
function addEpilogue(page, developments) {
  if (developments.length === 0) return;
  page.folded(() => {
    page.title(`${PAGE_HEADINGS[INPUT_REVIEW].epilogue} (${developments.length})`);
    developments.map(InputLogic.epilogueItemView).forEach((item) => {
      page.text(item.headline);
      page.text(item.detail);
      page.text(item.subjects.join(', '), 'Subjects');
      page.text(item.bearing);
    });
  });
}

/** The whiteboard, open: what the parser could not read first, then the names, regions, connections and notes. */
function addWhiteboard(page, whiteboardValue) {
  const board = View.whiteboardView(whiteboardValue);
  page.title(PAGE_HEADINGS[INPUT_REVIEW].whiteboard);
  board.ambiguities.forEach((item) => page.text(entryText(item), 'Ambiguity the parser flagged'));
  page.text(board.names.map(entryText).join(', '), 'Names on the board');
  board.regions.forEach((region) => {
    const heading = region.label ? `"${region.label}"` : 'no heading';
    page.text(`${heading}${region.location ? ` (${region.location})` : ''}: ${region.entries.map(entryText).join(', ')}`, 'Region');
  });
  board.connections.forEach((connection) => {
    const c = isPlainObject(connection) ? connection : {};
    page.text(`${textOf(c.from) || '?'} → ${textOf(c.to) || '?'}${c.label ? ` (${textOf(c.label)})` : ''}`, 'Connection drawn');
  });
  board.notes.forEach((note) => page.text(entryText(note), 'Note'));
  page.text(board.structureType, 'Structure');
  const empty = [board.ambiguities, board.names, board.regions, board.connections, board.notes].every((list) => list.length === 0);
  if (empty) {
    page.tag("No whiteboard analysis reached this checkpoint. The players' own conclusions feed the story meeting, so its weave will be written from the accusation and the director notes alone.", 'note');
  }
}

/**
 * The input review's page: the parse in the component's order (the accusation, the ledger, the
 * exposures, the quote bank and the epilogue folded, the whiteboard).
 */
function inputReviewPage(data) {
  const sessionConfig = isPlainObject(data.sessionConfig) ? data.sessionConfig : {};
  const notes = isPlainObject(data.directorNotes) ? data.directorNotes : {};
  const page = pageOf(INPUT_REVIEW);
  addAccusation(page, sessionConfig.accusation);
  addLedger(page, data.ledger);
  addExposures(page, sessionConfig);
  addQuotes(page, listOf(notes.quotes));
  addEpilogue(page, listOf(notes.postInvestigationDevelopments));
  addWhiteboard(page, notes.whiteboard);
  return page.done();
}

// ── The character-IDs stop (CharacterIds.js renders the same cards; task 4.12c) ──

/**
 * A text as a closed card shows it: whole when it fits, else cut at `max` characters with an
 * ellipsis. console/utils.js truncate's rule, which the components cannot export to the server;
 * lib/__tests__/stop-pages.test.js holds the two equal.
 */
function shownCut(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** A text a card cuts until it opens: the cut, shown, and the whole folded behind it when the cut took any. */
function addCut(page, text, max, label) {
  if (!text) return;
  const shown = shownCut(text, max);
  page.text(shown, label);
  if (shown !== text) page.folded(() => page.text(text, label));
}

/**
 * The character-IDs stop's page: one card per analysis (characterIdCards), under its photo's
 * name, as a closed card shows it. Each card shows the scene and each person, cut, and folds
 * what it shows once opened: the rest of each text, a person's markers, the suggested caption.
 * A photo the server lists as left out shows ticked.
 */
function characterIdsPage(data) {
  const analyses = isPlainObject(data.photoAnalyses) ? listOf(data.photoAnalyses.analyses) : [];
  const cards = View.characterIdCards(analyses, data.sessionPhotos, data.leftOutPhotos);
  const page = pageOf(CHARACTER_IDS);
  if (cards.length === 0) page.tag('No photo analyses available.');
  cards.forEach((card) => {
    const analysis = card.analysis;
    page.title(card.displayName);
    if (card.leftOut) page.tag('Left out', 'note');
    addCut(page, textOf(analysis.visualContent), CARD_CUTS.visual, 'AI Analysis');
    listOf(analysis.characterDescriptions).forEach((element) => {
      const person = isPlainObject(element) ? element : {};
      const role = textOf(person.role) || 'UNKNOWN';
      if (textOf(person.description)) addCut(page, textOf(person.description), CARD_CUTS.description, role);
      else page.tag(role);
      const markers = Array.isArray(person.physicalMarkers) ? String(person.physicalMarkers) : textOf(person.physicalMarkers);
      page.folded(() => page.text(markers, 'Markers'));
    });
    page.folded(() => page.text(textOf(analysis.suggestedCaption), 'Caption'));
  });
  return page.done();
}

// ── The story meeting (meetingView; ArcSelection.js renders the same view) ─────

/** What happened since the director last looked, above the meeting's page, as ArcSelection.js shows it. */
function addMeetingRound(page, view) {
  const H = PAGE_HEADINGS[ARC_SELECTION];
  const any = view.didNotRun || view.checkFailures.length > 0 || view.changedEdits.length > 0 || view.kept || view.marked
    || view.removed.length > 0 || view.otherMarks.length > 0 || view.otherConcerns.length > 0;
  if (!any) return;
  page.title(H.round);
  page.note(view.didNotRun);
  view.checkFailures.forEach((text) => page.alert(text));
  if (view.changedEdits.length > 0) {
    page.title(H.changedEdits);
    view.changedEdits.forEach((text) => page.toned('mark', text));
  }
  page.note(view.kept);
  page.note(view.marked);
  view.removed.concat(view.otherMarks).forEach((text) => page.toned('mark', text));
  view.otherConcerns.forEach((text) => page.toned('concern', text));
}

/** One of the weave's lines, under the label the meeting heads it with, and what sits beside it. */
function addWeaveLine(page, key, line) {
  page.text(line.text, View.MEETING_LINE_LABELS[key]);
  page.beside(line.concerns, line.marks);
}

const MEETING_SECTIONS = {
  verdict(page, view) {
    page.title(PAGE_HEADINGS[ARC_SELECTION].verdict);
    if (!view.verdict.parsed) {
      page.tag('The verdict was not parsed.', 'alert');
      return;
    }
    page.text(view.verdict.who);
    page.text(view.verdict.charge, 'Charge');
    page.text(view.verdict.vote, 'Final vote');
  },
  story(page, view) {
    addWeaveLine(page, 'story', view.story);
    page.note(view.thinNotes);
    addWeaveLine(page, 'question', view.question);
    addWeaveLine(page, 'headline', view.headline);
  },
  fromYourNotes(page, view) {
    addWeaveLine(page, 'fromYourNotes', view.fromYourNotes);
  },
  threads(page, view) {
    page.title(PAGE_HEADINGS[ARC_SELECTION].threads);
    view.threads.forEach((thread) => {
      page.text(`${thread.roleLabel} · ${thread.claim}`, thread.id + (thread.verdict ? " (the room's verdict)" : ''));
      if (thread.receipt) page.text(thread.receipt.label, 'Receipt');
      else page.tag(thread.added ? 'Added by you' : 'No receipt');
      if (thread.role === 'left-out') page.text(thread.reason, 'Left out because');
      page.beside(thread.concerns, thread.marks);
    });
    page.hint(view.repeatedIdHint);
  },
  connections(page, view) {
    page.title(PAGE_HEADINGS[ARC_SELECTION].connections);
    view.connections.forEach((connection) => {
      const label = connection.id + (connection.joins ? ` (${connection.joins})` : '');
      const text = `${connection.kindLabel} · ${connection.detail}`;
      if (connection.struck) page.struck(text, label);
      else page.text(text, label);
      page.beside(connection.concerns, connection.marks);
    });
    addWeaveLine(page, 'convergence', view.convergence);
  },
  strongerMainThread(page, view) {
    const stronger = view.strongerMainThread;
    page.text(stronger.claim, `${View.MEETING_LINE_LABELS.strongerMainThread} (${stronger.thread})`);
    page.text(stronger.reason);
    page.beside(stronger.concerns, stronger.marks);
  },
  questions(page, view) {
    page.title(PAGE_HEADINGS[ARC_SELECTION].questions);
    view.questions.forEach((question) => {
      page.text(`${question.about}: ${question.question}`, question.kindLabel);
      page.text(question.changes, 'Its answer changes');
      page.text(question.answer, 'Your answer');
      page.beside([], question.marks);
    });
  }
};

/**
 * The story meeting's page (spec 4.3): what happened since the director last looked, then
 * meetingView's sections in the spec's order, then the standing notes, folded.
 */
function meetingPage(data) {
  const weave = View.meetingDraftOf(data);
  if (!weave) throw new Error("The story meeting's payload holds no weave to page: every meeting holds one since task 4.11.");
  const view = View.meetingView(data, weave, '');
  const page = pageOf(ARC_SELECTION);
  addMeetingRound(page, view);
  view.order.forEach((section) => MEETING_SECTIONS[section](page, view));
  addStandingNotes(page, data.directorGateNotes);
  return page.done();
}

// ── The map (mapView; Outline.js renders the same view) ───────────────────────

/** A beat as the map shows it: its material under its id and kind, the players it shows, its card and its connection. */
function addBeat(page, beat) {
  page.text(beat.materialText, beat.id + (beat.kindLabel ? ` · ${beat.kindLabel}` : ''));
  page.text(beat.players, 'Shows');
  page.text(beat.cardText, 'Card');
  if (beat.connection) page.tag(`Connection ${beat.connection} lands here`);
  page.beside(beat.concerns, []);
}

/**
 * The map's page (spec 5.2): the settled story, what happened since the director last looked,
 * the gap note, the headline, the deck and the top photo, the sections, what was dropped, the
 * counts, left out (folded unless a concern opens it), the map's changes to the weave, then the
 * standing notes and the trace, folded.
 */
function mapPage(data, theme) {
  const H = PAGE_HEADINGS[OUTLINE];
  const map = View.mapDraftOf(data);
  if (!map) throw new Error("The map's payload holds no map to page: every map's stop holds one since task 4.11.");
  const view = View.mapView(data, map);
  const page = pageOf(OUTLINE);

  page.title(H.settledStory);
  if (view.settledStory) {
    page.text(view.settledStory.story);
    page.text(view.settledStory.question, 'The question it carries');
  }
  page.hint(view.storyHint);

  if (view.round || view.checkFailures.length > 0 || view.changedEdits.length > 0 || view.kept || view.otherConcerns.length > 0) {
    page.title(H.round);
    if (view.round) {
      page.tag(view.round.label, 'note');
      page.note(view.round.note);
    }
    view.checkFailures.forEach((text) => page.alert(text));
    if (view.changedEdits.length > 0) {
      page.title(H.changedEdits);
      view.changedEdits.forEach((text) => page.toned('mark', text));
    }
    page.note(view.kept);
    view.otherConcerns.forEach((text) => page.toned('concern', text));
  }
  page.hint(view.lockedHint);

  if (view.gapNote) {
    page.title(H.gap);
    page.text(view.gapNote.line);
    page.text(view.gapNote.players, 'It raises');
    page.beside(view.gapNote.concerns, []);
  }

  page.title(H.top);
  page.text(view.headline.text, 'Headline');
  page.beside(view.headline.concerns, []);
  page.text(view.deck.text, 'Deck');
  page.beside(view.deck.concerns, []);
  if (view.topPhoto) {
    page.tag(`Top photo ${view.topPhoto.filename}`);
    page.beside(view.topPhoto.concerns, []);
  }

  view.sections.forEach((section) => {
    page.title(section.label);
    if (section.heading) page.text(section.heading, 'Heading');
    else page.tag('Heading: none printed');
    page.text(section.job, 'Job');
    page.beside(section.concerns, []);
    section.beats.forEach((beat) => addBeat(page, beat));
    section.photos.forEach((photo) => {
      page.tag(`Photo ${photo.filename}${photo.beat ? ` beside ${photo.beat}` : ''}`);
      page.beside(photo.concerns, []);
    });
  });

  if (view.dropped.length > 0) {
    page.title(H.dropped);
    view.dropped.forEach((entry) => {
      page.text(entry.reason, entry.label);
      page.beside(entry.concerns, []);
    });
  }

  page.title(H.tally);
  if (view.tally.everyone) page.text(view.tally.everyone, 'Everyone');
  else page.tag('Everyone: no roster player is in a beat');
  page.alert(view.tally.unplaced);
  page.text(view.tally.raised);
  page.text(view.tally.cards);
  page.text(view.tally.photos);
  page.text(view.tally.length);
  page.beside(view.tally.lengthConcerns, []);

  const addLeftOut = () => {
    page.title(view.leftOut.title);
    view.leftOut.items.forEach((item) => addBeat(page, item));
  };
  if (view.leftOut.open) addLeftOut();
  else page.folded(addLeftOut);

  if (view.weaveChanges.length > 0 || view.weaveChangesConcerns.length > 0) {
    page.title(H.weaveChanges);
    view.weaveChanges.forEach((change) => page.text(change.change, change.source));
    page.beside(view.weaveChangesConcerns, []);
  }

  addStandingNotes(page, data.directorGateNotes);
  addTrace(page, data.trace, theme);
  return page.done();
}

// ── The desk (deskView; Article.js renders the same view) ──────────────────────

/** A desk mark's tone on the page: the errors of fact as alerts, a concern as a concern, the rest as marks. */
function markTone(mark) {
  if (mark.tone === 'judge' || mark.tone === 'structural') return 'alert';
  return mark.tone === 'concern' ? 'concern' : 'mark';
}

/** A piece of the desk's label: its key, and for a block its type and the file or document it names. */
function pieceLabel(piece) {
  const key = View.deskAnchorKey(piece.anchor);
  const block = piece.anchor.kind === 'block' && isPlainObject(piece.block) ? piece.block : null;
  if (!block) return key;
  const named = textOf(block.filename) || textOf(block.tokenId);
  return `${key} ${textOf(block.type)}${named ? ` ${named}` : ''}`;
}

/**
 * The writer's money tracker, as the desk shows it (Article.js): its rows while the page prints
 * it and it has any, the ledger's note while the ledger's tracker prints in its place, and
 * neither while the desk does not know (writerTrackerDisplay).
 */
function addTracker(page, data, bundle) {
  const display = Desk.writerTrackerDisplay(Desk.writerTrackerState(data.writerTrackerPrints), bundle);
  if (display === 'ledger-note') {
    page.tag('The page prints the money tracker from the ledger, which the preview shows.');
    return;
  }
  const tracker = isPlainObject(bundle.financialTracker) ? bundle.financialTracker : null;
  const entries = tracker ? listOf(tracker.entries) : [];
  if (display !== 'editor' || entries.length === 0) return;
  page.title(PAGE_HEADINGS[ARTICLE].tracker);
  entries.filter(isPlainObject).forEach((entry) => {
    page.text([textOf(entry.description), textOf(entry.amount)].filter(Boolean).join(' '));
  });
  page.text(textOf(tracker.totalExposed), 'Total Buried');
}

/** The round's record, folded below the article as RevisionDiff renders it (steeringView). */
function addRoundRecord(page, data, title) {
  page.title(title);
  page.note(textOf(data.previousFeedback), 'You sent it back with');
  const record = View.steeringView(data.handEditReport, data.directorGateNotes);
  record.changedEdits.forEach((entry) => page.toned('mark', entry.line));
  page.note(record.kept);
  record.notes.forEach((note) => page.text(note.text, note.label));
}

/**
 * The desk's page (spec 6.3): the echo of the settled story, then the article as it will print,
 * piece by piece (printedPlaces), each with the marks deskMarksAt gives it, its sidebar cards
 * under the desk's heading, the writer's money tracker as the desk shows it, the problems the
 * console would refuse before an approve or a send-back (deskProblems), and the marks beside no
 * piece. Below the article, folded: the marks the director's edits may have resolved, the fact
 * check's list, the trace and the round's record. No score is shown.
 */
function deskPage(data, theme) {
  const H = PAGE_HEADINGS[ARTICLE];
  const bundle = isPlainObject(data.contentBundle) ? data.contentBundle : null;
  if (!bundle) throw new Error("The desk's payload holds no article to page: the article stop always holds its bundle.");
  const view = View.deskView(data, bundle);
  const page = pageOf(ARTICLE);

  if (view.echo) {
    page.title(view.echo.title);
    page.text(view.echo.story, view.echo.storyLabel);
    page.text(view.echo.question, view.echo.questionLabel);
  }

  let cardsHeaded = false;
  Desk.printedPlaces(bundle).forEach((piece) => {
    if (piece.anchor.kind === 'sidebar' && !cardsHeaded) {
      page.title(`${H.cards} (${listOf(bundle.evidenceCards).length})`);
      cardsHeaded = true;
    }
    page.inPiece(View.deskAnchorKey(piece.anchor), () => {
      const label = pieceLabel(piece);
      const marks = View.deskMarksAt(view.marks, piece.anchor);
      // A block shows on the desk with no text (an empty paragraph, a photo with no caption), and
      // so does any piece a mark sits beside; a heading or a byline with no text shows nothing.
      if (!piece.texts.some((text) => textOf(text).trim()) && (piece.anchor.kind === 'block' || marks.length > 0)) page.tag(label);
      piece.texts.forEach((text) => page.text(text, label));
      marks.forEach((mark) => page.besideMark(markTone(mark), mark.text, mark.label));
    });
  });

  addTracker(page, data, bundle);

  const problems = Desk.deskProblems(bundle);
  if (problems.length > 0) {
    page.title(`${H.problems} (${problems.length})`);
    problems.forEach((problem) => page.alert(problem.message));
  }

  if (view.apart.any) {
    page.title(view.apart.title);
    view.apart.items.forEach((mark) => page.toned(markTone(mark), mark.text, mark.label));
  }

  page.folded(() => {
    if (view.folds.resolved.any) {
      page.title(view.folds.resolved.title);
      page.hint(view.folds.resolved.hint);
      view.folds.resolved.items.forEach((mark) => page.toned(markTone(mark), mark.text, [mark.label, mark.where].filter(Boolean).join(', ')));
    }
    if (view.folds.factCheck.any) {
      page.title(view.folds.factCheck.title);
      view.folds.factCheck.summary.groups.forEach((group) => {
        page.title(group.label);
        group.items.forEach((item) => (group.severity === 'structural' ? page.alert(item.text) : page.text(item.text)));
      });
    }
  });
  addTrace(page, data.trace, theme);
  page.folded(() => addRoundRecord(page, data, view.folds.rounds.title));
  return page.done();
}

/** Each stop's page, in the order a run reaches the stops (the stop types keep their names, R3). */
const PAGES = {
  [INPUT_REVIEW]: (data) => inputReviewPage(data),
  [ARC_SELECTION]: (data) => meetingPage(data),
  [CHARACTER_IDS]: (data) => characterIdsPage(data),
  [OUTLINE]: mapPage,
  [ARTICLE]: deskPage
};

/**
 * The stops that show a page, in the order a run reaches them: PAGES' keys (task 4.12d), so the
 * stops the harness prints (scripts/e2e-walkthrough.js) are the stops wordsShown counts.
 */
const PAGE_STOPS = Object.freeze(Object.keys(PAGES));

/**
 * The page a stop shows, built from its payload, or null for a stop with no page.
 *
 * @param {string} stop - the stop type
 * @param {Object} data - the stop's payload: getCheckpointData's keys merged with the interrupt's
 * @param {Object} [options]
 * @param {string} [options.theme='journalist'] - the session's theme, which words the trace's guidance (traceView)
 * @returns {{stop: string, lines: Array<Object>}|null}
 * @throws when a decision stop's payload holds nothing to page
 */
function stopPage(stop, data, { theme = 'journalist' } = {}) {
  if (!Object.prototype.hasOwnProperty.call(PAGES, stop)) return null;
  return PAGES[stop](isPlainObject(data) ? data : {}, theme);
}

/**
 * The words a stop shows: the count of the text of every line its page does not fold, or null
 * for a stop with no page.
 *
 * @param {string} stop
 * @param {Object} data - the stop's payload
 * @param {Object} [options] - stopPage's
 * @returns {number|null}
 */
function wordsShown(stop, data, options) {
  const page = stopPage(stop, data, options);
  if (!page) return null;
  return page.lines.filter((line) => !line.folded).reduce((sum, line) => sum + wordCount(line.text), 0);
}

module.exports = { PAGE_STOPS, PAGE_HEADINGS, CARD_CUTS, stopPage, wordsShown };
