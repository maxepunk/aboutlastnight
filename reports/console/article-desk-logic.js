/**
 * article-desk-logic.js — PURE logic for the article stop, the director's desk (spec
 * 2026-10-02 section 6.3; phase 4, task 4.3).
 *
 * Dual-export: registers on window.Console.articleDeskLogic for the browser (Article.js
 * calls it as a thin consumer) AND exposes the same surface via module.exports under Node,
 * so it is unit-tested in node-env Jest (console/__tests__/article-desk-logic.test.js;
 * reports/CLAUDE.md: the console has no DOM harness).
 *
 * At the desk the director edits any text in place, moves, deletes or inserts any block,
 * sees the page as they have it, and Approve publishes exactly what is on the desk. This
 * module holds every decision behind that:
 *
 *   THE OPERATIONS return a new bundle and leave the one they are given as it was. A block
 *   is addressed by its section's index and its own index in that section: the schema
 *   gives a block no id (each variant is additionalProperties:false), so a move or a delete
 *   shifts the addresses after it, and the desk closes an open editor when it applies one.
 *   An address the bundle does not have throws: the desk only offers addresses it has.
 *   Only paragraphs and quotes are inserted; photos and cards come from the record.
 *
 *   THE CHECKS return a list of problems, each `{path, message, ...}`, never throwing on a
 *   malformed bundle. They run on every approve and every send-back, edited or not:
 *   - an empty block, whitespace only included. The schema refuses an empty paragraph
 *     ("") but lets a blank one (" ") through, and validateContentBundle then drops it
 *     without a word, so the page would differ from the desk;
 *   - the headline and deck limits the schema sets (HEADLINE_LIMITS, a copy of
 *     content-bundle.schema.json's that a test holds equal), counted in characters as the
 *     schema counts them, so the desk never disagrees with the server's schema gate, which
 *     stays the last word on shape.
 *
 *   THE NAMING RULE decides which blocks of a section the director moved: the blocks are
 *   paired (pairSectionBlocks), and of the pairs, the longest run that kept its order stays
 *   (stayingInSection). It is one rule for the desk's change report and the director's
 *   standing edits: lib/hand-edit-diff.js requires this module and its diff calls these same
 *   functions (task 4.3b), as server.js requires console/outline-edit-logic.js.
 *
 *   THE CHANGE REPORT (deskChanges) says, section by section, which blocks the director
 *   inserted, deleted, moved or edited since the stop opened, named by that rule. The desk's
 *   marks (task 4.10) anchor on it: a finding's section and ordinal hold only while no block
 *   at or before it in that section changed (untouchedThrough).
 *
 *   WHAT THE DESK SHOWS: the word count of the bundle as edited, the preview request for
 *   the page as it will print (server.js POST /api/session/:id/article/preview), the script
 *   strip the preview frame applies to that page and to htmlPreview alike, and why a preview
 *   failed. What prints is the page's to say: the byline line by the header partial's rule,
 *   and the writer's money tracker as the stop's payload and each preview say (task 4.3b).
 *
 * MUST NOT reference React, and must not touch `window` at module-evaluation time except
 * the guarded window.Console write.
 */
(function () {
  'use strict';

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function asString(value) {
    return typeof value === 'string' ? value : '';
  }

  function cloneBundle(bundle) {
    return JSON.parse(JSON.stringify(bundle));
  }

  function sectionsOf(bundle) {
    return isPlainObject(bundle) && Array.isArray(bundle.sections) ? bundle.sections : [];
  }

  function contentOf(section) {
    return isPlainObject(section) && Array.isArray(section.content) ? section.content : [];
  }

  /**
   * A section's key as the director's edits and the fact check's findings name it: its id,
   * else its index (lib/hand-edit-diff.js sectionKey, the one rule).
   */
  function sectionKey(section, index) {
    return isPlainObject(section) && section.id != null ? String(section.id) : 'index-' + index;
  }

  /** A section as the director reads it on the desk: its heading, else its id. */
  function sectionLabel(section, index) {
    var heading = isPlainObject(section) ? asString(section.heading).trim() : '';
    if (heading) return heading;
    return isPlainObject(section) && section.id != null ? String(section.id) : 'Section ' + (index + 1);
  }

  // ── addressing ────────────────────────────────────────────────────────────

  function requireSection(bundle, sectionIndex) {
    var sections = sectionsOf(bundle);
    if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= sections.length
      || !isPlainObject(sections[sectionIndex]) || !Array.isArray(sections[sectionIndex].content)) {
      throw new Error('The article has no section ' + sectionIndex + ' with blocks');
    }
  }

  function requireBlock(bundle, sectionIndex, blockIndex) {
    requireSection(bundle, sectionIndex);
    var content = bundle.sections[sectionIndex].content;
    if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= content.length) {
      throw new Error('Section ' + sectionIndex + ' has no block ' + blockIndex);
    }
  }

  /** A place a block can go: 0 through the section's length (its end). */
  function requirePlace(bundle, sectionIndex, blockIndex, length) {
    requireSection(bundle, sectionIndex);
    if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex > length) {
      throw new Error('Section ' + sectionIndex + ' has no place for a block at block ' + blockIndex);
    }
  }

  // ── the operations ────────────────────────────────────────────────────────

  /** The blocks the desk inserts: the director writes them; photos and cards come from the record. */
  var INSERTABLE_TYPES = ['paragraph', 'quote'];

  /** A new, empty block of an insertable type. */
  function newBlock(type) {
    if (type === 'paragraph') return { type: 'paragraph', text: '' };
    if (type === 'quote') return { type: 'quote', text: '' };
    throw new Error("The desk inserts a paragraph or a quote, not '" + String(type) + "'");
  }

  /** The bundle with a new empty paragraph or quote at sections[sectionIndex].content[blockIndex]. */
  function insertBlock(bundle, sectionIndex, blockIndex, type) {
    var block = newBlock(type);
    requireSection(bundle, sectionIndex);
    requirePlace(bundle, sectionIndex, blockIndex, bundle.sections[sectionIndex].content.length);
    var next = cloneBundle(bundle);
    next.sections[sectionIndex].content.splice(blockIndex, 0, block);
    return next;
  }

  /** The bundle without the block at that address. */
  function deleteBlock(bundle, sectionIndex, blockIndex) {
    requireBlock(bundle, sectionIndex, blockIndex);
    var next = cloneBundle(bundle);
    next.sections[sectionIndex].content.splice(blockIndex, 1);
    return next;
  }

  /**
   * The bundle with one block moved, within its section or to another.
   *
   * @param {Object} bundle
   * @param {{section: number, block: number}} from - where the block is
   * @param {{section: number, block: number}} to - where it goes: `to.block` is its index in
   *   that section once it has left its place
   */
  function moveBlock(bundle, from, to) {
    var f = from || {};
    var t = to || {};
    requireBlock(bundle, f.section, f.block);
    requireSection(bundle, t.section);
    var targetLength = bundle.sections[t.section].content.length - (t.section === f.section ? 1 : 0);
    requirePlace(bundle, t.section, t.block, targetLength);
    var next = cloneBundle(bundle);
    var moved = next.sections[f.section].content.splice(f.block, 1)[0];
    next.sections[t.section].content.splice(t.block, 0, moved);
    return next;
  }

  /** The bundle with one block moved to the end of the section the director picks. */
  function moveToSection(bundle, from, sectionIndex) {
    var f = from || {};
    requireBlock(bundle, f.section, f.block);
    requireSection(bundle, sectionIndex);
    var end = bundle.sections[sectionIndex].content.length - (sectionIndex === f.section ? 1 : 0);
    return moveBlock(bundle, f, { section: sectionIndex, block: end });
  }

  /**
   * Where one step up or down takes a block, as an address moveBlock takes: one place within
   * its section, or, from the top or the bottom of a section, the end of the section before
   * it or the start of the section after it. Null where the article ends.
   *
   * @param {'up'|'down'} direction
   * @returns {{section: number, block: number}|null}
   */
  function stepTarget(bundle, sectionIndex, blockIndex, direction) {
    requireBlock(bundle, sectionIndex, blockIndex);
    var sections = bundle.sections;
    var length = sections[sectionIndex].content.length;
    if (direction === 'up') {
      if (blockIndex > 0) return { section: sectionIndex, block: blockIndex - 1 };
      for (var s = sectionIndex - 1; s >= 0; s -= 1) {
        if (isPlainObject(sections[s]) && Array.isArray(sections[s].content)) return { section: s, block: sections[s].content.length };
      }
      return null;
    }
    if (direction === 'down') {
      if (blockIndex < length - 1) return { section: sectionIndex, block: blockIndex + 1 };
      for (var d = sectionIndex + 1; d < sections.length; d += 1) {
        if (isPlainObject(sections[d]) && Array.isArray(sections[d].content)) return { section: d, block: 0 };
      }
      return null;
    }
    throw new Error("A step is 'up' or 'down', not '" + String(direction) + "'");
  }

  /** The bundle with the block at that address replaced: the block editor's save. */
  function setBlock(bundle, sectionIndex, blockIndex, block) {
    requireBlock(bundle, sectionIndex, blockIndex);
    var next = cloneBundle(bundle);
    next.sections[sectionIndex].content[blockIndex] = JSON.parse(JSON.stringify(block));
    return next;
  }

  /** The bundle with a section's heading as the director typed it; a blank one prints none. */
  function setSectionHeading(bundle, sectionIndex, heading) {
    requireSection(bundle, sectionIndex);
    var next = cloneBundle(bundle);
    if (asString(heading).trim()) next.sections[sectionIndex].heading = heading;
    else delete next.sections[sectionIndex].heading;
    return next;
  }

  /**
   * The fields of an editor's form the director changed: each whose text differs from the
   * field's (a field the bundle lacks reads as blank). An editor saves only these, so a
   * form that shows a blank kicker never writes one the director did not type, and a
   * send-back records no edit the director did not make.
   */
  function changedFields(original, form) {
    var before = isPlainObject(original) ? original : {};
    var changed = {};
    Object.keys(isPlainObject(form) ? form : {}).forEach(function (key) {
      var was = typeof before[key] === 'string' ? before[key] : '';
      if (form[key] !== was) changed[key] = form[key];
    });
    return changed;
  }

  /** The bundle with an object field changed: the fields given replace theirs, every other field stays. */
  function withFields(bundle, key, fields) {
    var next = cloneBundle(bundle);
    next[key] = Object.assign({}, isPlainObject(next[key]) ? next[key] : {}, JSON.parse(JSON.stringify(fields || {})));
    return next;
  }

  /** The bundle with the headline's main line, kicker or deck as the director typed them. */
  function setHeadline(bundle, fields) {
    return withFields(bundle, 'headline', fields);
  }

  /**
   * The bundle with the byline fields the director edited. Every other field stays: the
   * guest reporter's credit prints beside the byline, and the old editor, which saved four
   * fields over the whole byline, lost it from the article.
   */
  function setByline(bundle, fields) {
    return withFields(bundle, 'byline', fields);
  }

  /** The bundle with the hero's fields the director edited; every other field stays. */
  function setHero(bundle, fields) {
    return withFields(bundle, 'heroImage', fields);
  }

  /**
   * The sidebar card editor's form, seeded from the card: the headline, summary and
   * significance the page prints, each as the card has it, blank where it has none, so a
   * field the director leaves alone is no change to save (changedFields; task 4.3c). A card
   * with no significance prints its badge empty, and its form shows that.
   */
  function sidebarCardForm(card) {
    var c = isPlainObject(card) ? card : {};
    return { headline: asString(c.headline), summary: asString(c.summary), significance: asString(c.significance) };
  }

  /** The bundle with one sidebar evidence entry replaced. */
  function setSidebarCard(bundle, index, card) {
    var cards = isPlainObject(bundle) && Array.isArray(bundle.evidenceCards) ? bundle.evidenceCards : [];
    if (!Number.isInteger(index) || index < 0 || index >= cards.length) throw new Error('The sidebar has no evidence entry ' + index);
    var next = cloneBundle(bundle);
    next.evidenceCards[index] = JSON.parse(JSON.stringify(card));
    return next;
  }

  /** The bundle with one row of the writer's money tracker replaced. */
  function setTrackerEntry(bundle, index, entry) {
    var tracker = isPlainObject(bundle) && isPlainObject(bundle.financialTracker) ? bundle.financialTracker : null;
    var entries = tracker && Array.isArray(tracker.entries) ? tracker.entries : [];
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) throw new Error('The money tracker has no row ' + index);
    var next = cloneBundle(bundle);
    next.financialTracker.entries[index] = JSON.parse(JSON.stringify(entry));
    return next;
  }

  // ── the checks ────────────────────────────────────────────────────────────

  /**
   * The headline limits content-bundle.schema.json sets, as the console's copy:
   * console/__tests__/article-desk-logic.test.js holds them equal to the schema's.
   */
  var HEADLINE_LIMITS = {
    main: { min: 10, max: 200 },
    kicker: { max: 100 },
    deck: { max: 300 }
  };

  /** What the director calls each headline field. */
  var HEADLINE_NAMES = { main: 'The headline', kicker: 'The kicker', deck: 'The deck' };

  /** A text's length in characters as the schema counts them: an emoji is one. */
  function characters(text) {
    return Array.from(text).length;
  }

  /**
   * The headline's problems against the schema's limits, field by field: a headline shorter
   * or longer than it allows, a kicker or a deck longer, a headline missing.
   *
   * @returns {Array<{path: string, field: string, message: string}>}
   */
  function headlineProblems(bundle) {
    if (!isPlainObject(bundle) || !isPlainObject(bundle.headline)) return [];
    var problems = [];
    ['main', 'kicker', 'deck'].forEach(function (field) {
      var value = bundle.headline[field];
      var limit = HEADLINE_LIMITS[field];
      var path = '/headline/' + field;
      if (typeof value !== 'string') {
        if (field === 'main') problems.push({ path: path, field: field, message: 'The headline is missing.' });
        return;
      }
      var n = characters(value);
      if (limit.min !== undefined && n < limit.min) {
        problems.push({ path: path, field: field, message: HEADLINE_NAMES[field] + ' has ' + n + ' characters; it needs at least ' + limit.min + '.' });
      } else if (n > limit.max) {
        problems.push({ path: path, field: field, message: HEADLINE_NAMES[field] + ' has ' + n + ' characters; the most it can have is ' + limit.max + '.' });
      }
    });
    return problems;
  }

  function blank(value) {
    return typeof value !== 'string' || value.trim() === '';
  }

  /**
   * What makes each kind of block empty, and what the desk says about it: the field whose
   * blankness leaves the block printing nothing, and the fix.
   */
  var EMPTY_BLOCKS = {
    paragraph: { empty: function (b) { return blank(b.text); }, note: 'the paragraph is empty. Write it or delete it.' },
    quote: { empty: function (b) { return blank(b.text); }, note: 'the quote is empty. Write it or delete it.' },
    list: {
      empty: function (b) { return !Array.isArray(b.items) || b.items.every(blank); },
      note: 'the list has no items. Add one or delete it.'
    },
    'evidence-card': { empty: function (b) { return blank(b.content); }, note: 'the card has no text. Delete it, or put the document\'s text back.' },
    'evidence-reference': { empty: function (b) { return blank(b.tokenId); }, note: 'the reference names no document. Delete it.' },
    photo: { empty: function (b) { return blank(b.filename); }, note: 'the photo names no file. Delete it.' }
  };

  /** Is this block empty? A block of a type the desk does not know is not: the shape check names it. */
  function isEmptyBlock(block) {
    if (!isPlainObject(block) || !Object.prototype.hasOwnProperty.call(EMPTY_BLOCKS, block.type)) return false;
    return EMPTY_BLOCKS[block.type].empty(block);
  }

  /** What the desk says beside an empty block, or '' for a block with text. */
  function emptyBlockNote(block) {
    if (!isEmptyBlock(block)) return '';
    var note = EMPTY_BLOCKS[block.type].note;
    return note.charAt(0).toUpperCase() + note.slice(1);
  }

  /**
   * Every empty block in the bundle, whitespace-only text included, each named by its
   * section and its number in the section as the director reads the desk.
   *
   * @returns {Array<{path: string, section: number, block: number, sectionKey: string, message: string}>}
   */
  function emptyBlocks(bundle) {
    var problems = [];
    sectionsOf(bundle).forEach(function (section, s) {
      contentOf(section).forEach(function (block, b) {
        if (!isEmptyBlock(block)) return;
        problems.push({
          path: '/sections/' + s + '/content/' + b,
          section: s,
          block: b,
          sectionKey: sectionKey(section, s),
          message: 'Section "' + sectionLabel(section, s) + '", block ' + (b + 1) + ': ' + EMPTY_BLOCKS[block.type].note
        });
      });
    });
    return problems;
  }

  /** Everything the desk checks before an approve or a send-back: the empty blocks, then the headline's limits. */
  function deskProblems(bundle) {
    return emptyBlocks(bundle).concat(headlineProblems(bundle));
  }

  // ── the naming rule: which blocks the director moved ──────────────────────

  /** The kinds of block that carry the article's text, which a move is least likely to be about. */
  var TEXT_BLOCK_TYPES = ['paragraph', 'quote', 'list'];

  /** A value with its keys sorted and every string trimmed. */
  function sortedTrimmed(value) {
    if (Array.isArray(value)) return value.map(sortedTrimmed);
    if (isPlainObject(value)) {
      return Object.keys(value).sort().reduce(function (out, key) {
        out[key] = sortedTrimmed(value[key]);
        return out;
      }, {});
    }
    return typeof value === 'string' ? value.trim() : value;
  }

  /** A block as canonical JSON: keys sorted, every string trimmed. */
  function trimmedCanonical(block) {
    return block === undefined ? 'undefined' : JSON.stringify(sortedTrimmed(block));
  }

  /**
   * Do two blocks hold the same? Compared as the director's edits compare values (keys
   * sorted, every string trimmed; lib/hand-edit-diff.js `same`, which a test holds equal), so
   * a block the rule names moved is one the edits record as a move.
   */
  function sameBlock(a, b) {
    return trimmedCanonical(a) === trimmedCanonical(b);
  }

  /** A block's text, for its opening words: its text, its items, its caption or its headline. */
  function blockText(block) {
    if (!isPlainObject(block)) return '';
    if (typeof block.text === 'string') return block.text;
    if (Array.isArray(block.items)) return block.items.map(String).join(' ');
    if (typeof block.caption === 'string') return block.caption;
    if (typeof block.headline === 'string') return block.headline;
    return '';
  }

  /** A block's type, or '' for one that names none. */
  function blockType(block) {
    return isPlainObject(block) && typeof block.type === 'string' ? block.type : '';
  }

  /** A block's type and its text's first 40 characters, lower case, with runs of space folded. */
  function blockKey(block) {
    return blockType(block) + '|' + blockText(block).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  /** What names a photo, a card or a reference whatever its other fields; null for a block its text names. */
  function blockIdentity(block) {
    if (!isPlainObject(block)) return null;
    if (block.type === 'photo' && typeof block.filename === 'string') return 'photo|' + block.filename;
    if ((block.type === 'evidence-card' || block.type === 'evidence-reference') && typeof block.tokenId === 'string') {
      return block.type + '|' + block.tokenId;
    }
    return null;
  }

  /** A block its text names (blockIdentity null): the only kind that pairs by its opening words or its place. */
  function namedByText(block) {
    return blockIdentity(block) === null;
  }

  /**
   * A section's blocks in two versions, paired: a block with its unchanged self; then a
   * photo, a card or a reference with itself, whatever its other fields; then a block with one
   * of its type whose text opens with the same 40 characters (blockKey), so a block inserted
   * before it does not throw it off; then, for what is left, the block in the same place when
   * it is of the same type (task 4.3c). Each block pairs once, with the first one the test
   * finds. Every pair is of one type, so a block retyped (the JSON editor's) pairs with
   * nothing: it was deleted and another inserted. A photo, a card or a reference pairs by its
   * name alone, never by its opening words or its place (task 4.5d): two photos with different
   * filenames, or two cards with different tokenIds, never pair, so a swap of two of them is
   * two moves, each keeping its own caption or text, and one renamed through the JSON editor is
   * deleted and another inserted, as a block retyped is.
   *
   * @param {Array} openedBlocks - the section in the older version
   * @param {Array} currentBlocks - the section in the newer version
   * @returns {{pairs: Array<{bi: number, ai: number}>, removed: number[], added: number[]}} each
   *   pair's index in the older version (`bi`) and in the newer (`ai`): the pairs found by what
   *   the blocks hold, by their place in the newer version, then the pairs by place; the
   *   indexes of the blocks left in each version
   */
  function pairSectionBlocks(openedBlocks, currentBlocks) {
    var opened = Array.isArray(openedBlocks) ? openedBlocks : [];
    var current = Array.isArray(currentBlocks) ? currentBlocks : [];
    var usedOpened = [];
    var usedCurrent = [];
    var byContent = [];
    var byPlace = [];
    function pairOn(keyOf) {
      var openedKeys = opened.map(keyOf);
      current.forEach(function (block, ai) {
        if (usedCurrent[ai]) return;
        var key = keyOf(block);
        if (key === null) return;
        for (var bi = 0; bi < opened.length; bi += 1) {
          if (!usedOpened[bi] && openedKeys[bi] === key) {
            usedOpened[bi] = true;
            usedCurrent[ai] = true;
            byContent.push({ bi: bi, ai: ai });
            return;
          }
        }
      });
    }
    pairOn(trimmedCanonical);
    pairOn(blockIdentity);
    pairOn(function (block) { return namedByText(block) ? blockKey(block) : null; });
    current.forEach(function (block, ai) {
      if (!usedCurrent[ai] && ai < opened.length && !usedOpened[ai] && blockType(opened[ai]) === blockType(block)
        && namedByText(opened[ai]) && namedByText(block)) {
        usedOpened[ai] = true;
        usedCurrent[ai] = true;
        byPlace.push({ bi: ai, ai: ai });
      }
    });
    byContent.sort(function (x, y) { return x.ai - y.ai; });
    return {
      pairs: byContent.concat(byPlace),
      removed: opened.map(function (_block, i) { return i; }).filter(function (i) { return !usedOpened[i]; }),
      added: current.map(function (_block, i) { return i; }).filter(function (i) { return !usedCurrent[i]; })
    };
  }

  /**
   * A pair's weight in choosing the blocks that stay: a changed block weighs most, so it
   * keeps its place and its change is an edit there (a block the director moved and changed
   * is a cut and an addition, which keeps no place); then a text block, so the photo or card
   * the director moved is named before the text it passed.
   */
  function stayWeight(openedBlock, currentBlock) {
    return (sameBlock(openedBlock, currentBlock) ? 0 : 2) +
      (isPlainObject(currentBlock) && TEXT_BLOCK_TYPES.indexOf(currentBlock.type) !== -1 ? 1 : 0);
  }

  /**
   * The pairs that stay in place, as indexes into `pairs` (sorted by their place in the newer
   * version), ascending: the longest run whose order in the older version matches, the
   * heaviest among runs as long.
   *
   * @param {Array<{opened: number, weight: number}>} pairs - each pair's index in the older version, and its weight
   * @returns {number[]}
   */
  function stayingPairs(pairs) {
    var length = [];
    var weight = [];
    var previous = [];
    var i;
    for (i = 0; i < pairs.length; i += 1) {
      length[i] = 1;
      weight[i] = pairs[i].weight;
      previous[i] = -1;
      for (var j = 0; j < i; j += 1) {
        if (pairs[j].opened >= pairs[i].opened) continue;
        var l = length[j] + 1;
        var w = weight[j] + pairs[i].weight;
        if (l > length[i] || (l === length[i] && w > weight[i])) {
          length[i] = l;
          weight[i] = w;
          previous[i] = j;
        }
      }
    }
    var best = -1;
    for (i = 0; i < pairs.length; i += 1) {
      if (best === -1 || length[i] > length[best] || (length[i] === length[best] && weight[i] > weight[best])) best = i;
    }
    var staying = [];
    for (var k = best; k !== -1; k = previous[k]) staying.unshift(k);
    return staying;
  }

  /**
   * The pairs of a section that kept their order, by their place in the newer version: the
   * longest run whose order in the older version holds, the heaviest among runs as long
   * (stayWeight). Every other pair is a block the director moved within the section: one
   * unchanged is a move, and one changed is a cut and an addition, as the standing edits
   * record them.
   *
   * @param {Array} openedBlocks - the section in the older version
   * @param {Array} currentBlocks - the section in the newer version
   * @param {Array<{bi: number, ai: number}>} pairs - pairSectionBlocks' pairs
   * @returns {Array<{bi: number, ai: number}>} the pairs (the same objects) that stay
   */
  function stayingInSection(openedBlocks, currentBlocks, pairs) {
    var opened = Array.isArray(openedBlocks) ? openedBlocks : [];
    var current = Array.isArray(currentBlocks) ? currentBlocks : [];
    var order = (Array.isArray(pairs) ? pairs : []).slice().sort(function (x, y) { return x.ai - y.ai; });
    return stayingPairs(order.map(function (pair) {
      return { opened: pair.bi, weight: stayWeight(opened[pair.bi], current[pair.ai]) };
    })).map(function (i) { return order[i]; });
  }

  // ── the change report ─────────────────────────────────────────────────────

  /**
   * What the director inserted, deleted, moved or edited at the desk since the stop opened,
   * section by section, each section named by its key (its id, as the fact check's findings
   * name it), by the naming rule, so the report and the standing edits name the same blocks:
   * - edited: a changed block in its place among the blocks that kept their order;
   * - moved: an unchanged block out of that order, or one that left one section and arrived
   *   unchanged in another, which is listed under both;
   * - deleted and inserted: a block that left or arrived with nothing to pair it, and a block
   *   the director moved and changed, deleted where it was and inserted where it went.
   * `unchanged` counts the section's first blocks that are the same, in the same place, in
   * both versions: a finding about a block at an index below it still points at that block.
   *
   * @param {Object} opened - the bundle the stop opened on (the stop's contentBundle)
   * @param {Object} current - the bundle on the desk
   * @returns {Array<{section: string, inserted: number[], deleted: number[],
   *   moved: Array<{from: {section: string, block: number}, to: {section: string, block: number}}>,
   *   edited: Array<{from: {section: string, block: number}, to: {section: string, block: number}}>,
   *   unchanged: number}>}
   */
  function deskChanges(opened, current) {
    if (!isPlainObject(opened) || !isPlainObject(current) || !Array.isArray(opened.sections) || !Array.isArray(current.sections)) return [];

    var entries = [];
    var byKey = {};
    function entry(key) {
      if (!Object.prototype.hasOwnProperty.call(byKey, key)) {
        byKey[key] = { section: key, inserted: [], deleted: [], moved: [], edited: [], unchanged: 0 };
        entries.push(byKey[key]);
      }
      return byKey[key];
    }
    current.sections.forEach(function (section, s) { entry(sectionKey(section, s)); });
    opened.sections.forEach(function (section, s) { entry(sectionKey(section, s)); });

    var openedByKey = {};
    opened.sections.forEach(function (section, s) { openedByKey[sectionKey(section, s)] = { index: s, content: contentOf(section) }; });
    var currentKeys = {};
    current.sections.forEach(function (section, s) { currentKeys[sectionKey(section, s)] = true; });

    // Each change, with where its block stood when the stop opened, for the listing order.
    var moved = [];
    var edited = [];
    // The blocks that left (`gone`) or arrived (`came`) with nothing in their own section to
    // pair them. A block moved within its section and changed arrives `within`: as in the
    // standing edits, its arrival pairs with nothing in another section.
    var gone = [];
    var came = [];
    function change(fromKey, fromBlock, toKey, toBlock, openedSection) {
      return { from: { section: fromKey, block: fromBlock }, to: { section: toKey, block: toBlock }, at: [openedSection, fromBlock] };
    }

    current.sections.forEach(function (section, s) {
      var key = sectionKey(section, s);
      var after = contentOf(section);
      var was = openedByKey[key];
      if (!was) {
        after.forEach(function (block, j) { came.push({ key: key, block: j, value: block }); });
        return;
      }
      var before = was.content;
      var paired = pairSectionBlocks(before, after);
      var staying = stayingInSection(before, after, paired.pairs);
      paired.pairs.forEach(function (pair) {
        var unchangedBlock = sameBlock(before[pair.bi], after[pair.ai]);
        if (staying.indexOf(pair) !== -1) {
          if (!unchangedBlock) edited.push(change(key, pair.bi, key, pair.ai, was.index));
        } else if (unchangedBlock) {
          moved.push(change(key, pair.bi, key, pair.ai, was.index));
        } else {
          gone.push({ key: key, section: was.index, block: pair.bi, value: before[pair.bi] });
          came.push({ key: key, block: pair.ai, value: after[pair.ai], within: true });
        }
      });
      paired.removed.forEach(function (bi) { gone.push({ key: key, section: was.index, block: bi, value: before[bi] }); });
      paired.added.forEach(function (ai) { came.push({ key: key, block: ai, value: after[ai] }); });
    });
    opened.sections.forEach(function (section, s) {
      var key = sectionKey(section, s);
      if (currentKeys[key]) return;
      contentOf(section).forEach(function (block, j) { gone.push({ key: key, section: s, block: j, value: block }); });
    });

    // A block that left one section and arrived unchanged in another moved there.
    var taken = [];
    came.forEach(function (c) {
      if (!c.within) {
        for (var i = 0; i < gone.length; i += 1) {
          if (!taken[i] && gone[i].key !== c.key && sameBlock(gone[i].value, c.value)) {
            taken[i] = true;
            moved.push(change(gone[i].key, gone[i].block, c.key, c.block, gone[i].section));
            return;
          }
        }
      }
      entry(c.key).inserted.push(c.block);
    });
    gone.forEach(function (g, i) { if (!taken[i]) entry(g.key).deleted.push(g.block); });

    // Listed in the order the blocks stood when the stop opened; a block that changed
    // section is listed under both.
    function list(name, changes) {
      changes.sort(function (x, y) { return (x.at[0] - y.at[0]) || (x.at[1] - y.at[1]); }).forEach(function (c) {
        var where = { from: c.from, to: c.to };
        entry(c.from.section)[name].push(where);
        if (c.to.section !== c.from.section) entry(c.to.section)[name].push(where);
      });
    }
    list('moved', moved);
    list('edited', edited);
    entries.forEach(function (e) {
      e.inserted.sort(function (x, y) { return x - y; });
      e.deleted.sort(function (x, y) { return x - y; });
    });

    current.sections.forEach(function (section, s) {
      var was = openedByKey[sectionKey(section, s)];
      if (!was) return;
      var after = contentOf(section);
      var n = 0;
      while (n < was.content.length && n < after.length && sameBlock(was.content[n], after[n])) n += 1;
      byKey[sectionKey(section, s)].unchanged = n;
    });
    return entries;
  }

  /**
   * Does a finding's ordinal still point at its block: no block at or before the block's
   * index in the opened version of that section was inserted, deleted, moved or edited?
   *
   * @param {Array} changes - deskChanges' report
   * @param {string} key - the section's key (its id)
   * @param {number} blockIndex - the block's index in the section when the stop opened
   */
  function untouchedThrough(changes, key, blockIndex) {
    var found = (Array.isArray(changes) ? changes : []).filter(function (e) { return e && e.section === key; })[0];
    return Boolean(found) && Number.isInteger(blockIndex) && blockIndex >= 0 && blockIndex < found.unchanged;
  }

  // ── the pieces a mark sits beside (task 4.10) ─────────────────────────────

  /**
   * The fields of each kind of block that print the article's words: the printed fields of
   * lib/hand-edit-diff.js PRINTED_BLOCK_FIELDS, less the type, the ids, the filename and a
   * list's numbering. A test holds the two equal. A block of a type the page does not know
   * prints as a paragraph.
   */
  var PRINTED_TEXT_FIELDS = {
    paragraph: ['text'],
    quote: ['text', 'attribution'],
    'evidence-reference': ['caption'],
    list: ['items'],
    photo: ['caption'],
    'evidence-card': ['headline', 'content', 'owner']
  };

  /** The words a block prints, field by field (PRINTED_TEXT_FIELDS), a list's items one each. */
  function printedTexts(block) {
    if (!isPlainObject(block)) return [];
    var fields = Object.prototype.hasOwnProperty.call(PRINTED_TEXT_FIELDS, block.type) ? PRINTED_TEXT_FIELDS[block.type] : ['text'];
    var out = [];
    fields.forEach(function (field) {
      var value = block[field];
      if (typeof value === 'string') out.push(value);
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          if (typeof item === 'string') out.push(item);
          else if (isPlainObject(item) && typeof item.text === 'string') out.push(item.text);
        });
      }
    });
    return out;
  }

  /**
   * The index of a section's nth paragraph block, counting its paragraph blocks from 1 as the
   * fact check's findings count them (lib/content-bundle-fact-check.js narratorSegments), or -1.
   */
  function paragraphBlockIndex(blocks, ordinal) {
    var list = Array.isArray(blocks) ? blocks : [];
    var n = 0;
    for (var i = 0; i < list.length; i += 1) {
      if (isPlainObject(list[i]) && list[i].type === 'paragraph') {
        n += 1;
        if (n === ordinal) return i;
      }
    }
    return -1;
  }

  /** The strings of a list of values, in order. */
  function stringsOf(values) {
    return values.filter(function (v) { return typeof v === 'string'; });
  }

  /**
   * The pieces of the desk a mark can sit beside, in reading order, each with the words it
   * prints: the headline (its main line, kicker and deck), the byline, the hero while it
   * names a photo, then each section's heading and each block the desk renders, then each
   * sidebar card. A piece's `anchor` names it as the desk renders it: {kind: 'headline'},
   * {kind: 'byline'}, {kind: 'hero'}, {kind: 'heading', section}, {kind: 'block', section,
   * block} or {kind: 'sidebar', index}, by its indexes in this bundle. A heading and a block
   * carry their section's key (sectionKey), and a block, the hero and a sidebar card the
   * value itself.
   *
   * @param {Object} bundle
   * @returns {Array<{anchor: Object, texts: string[], sectionKey?: string, block?: Object}>}
   */
  function printedPlaces(bundle) {
    var b = isPlainObject(bundle) ? bundle : {};
    var head = isPlainObject(b.headline) ? b.headline : {};
    var byline = isPlainObject(b.byline) ? b.byline : {};
    var places = [
      { anchor: { kind: 'headline' }, texts: stringsOf([head.main, head.kicker, head.deck]) },
      { anchor: { kind: 'byline' }, texts: stringsOf([byline.author, byline.title, byline.guestReporter]) }
    ];
    if (isPlainObject(b.heroImage) && asString(b.heroImage.filename)) {
      places.push({ anchor: { kind: 'hero' }, texts: stringsOf([b.heroImage.caption]), block: b.heroImage });
    }
    sectionsOf(b).forEach(function (section, s) {
      var key = sectionKey(section, s);
      places.push({ anchor: { kind: 'heading', section: s }, sectionKey: key, texts: stringsOf([isPlainObject(section) ? section.heading : null]) });
      contentOf(section).forEach(function (block, j) {
        if (!isPlainObject(block) || !block.type) return;
        places.push({ anchor: { kind: 'block', section: s, block: j }, sectionKey: key, texts: printedTexts(block), block: block });
      });
    });
    (Array.isArray(b.evidenceCards) ? b.evidenceCards : []).forEach(function (card, k) {
      if (!isPlainObject(card)) return;
      places.push({ anchor: { kind: 'sidebar', index: k }, texts: stringsOf([card.headline, card.summary]), block: card });
    });
    return places;
  }

  // ── what the desk shows ───────────────────────────────────────────────────

  /** The words of the article's paragraphs, in the bundle as edited. */
  function wordCount(bundle) {
    var count = 0;
    sectionsOf(bundle).forEach(function (section) {
      contentOf(section).forEach(function (block) {
        if (isPlainObject(block) && block.type === 'paragraph' && typeof block.text === 'string') {
          count += block.text.split(/\s+/).filter(Boolean).length;
        }
      });
    });
    return count;
  }

  /**
   * The page with every script taken out, for the preview frame (R5 F9). The frame is
   * sandboxed without `allow-scripts`, so the page's scripts would only raise "Blocked
   * script execution in 'about:srcdoc'" errors; taking them out, rather than granting
   * scripts, keeps the previewed page from reaching its own same-origin frame. The server
   * injects `<base href="/">` so the page's relative sessionphotos/ links resolve.
   */
  function stripScripts(html) {
    return String(html == null ? '' : html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<script\b[^>]*\/>/gi, '');
  }

  /**
   * The request for the page as it will print, built from the bundle on the desk: the
   * route renders it through the publishing TemplateAssembler with the session's theme,
   * photos and ledger (server.js, POST /api/session/:id/article/preview).
   *
   * @returns {{url: string, init: Object}} for fetch(url, init)
   */
  function previewRequest(sessionId, bundle) {
    return {
      url: '/api/session/' + encodeURIComponent(String(sessionId)) + '/article/preview',
      init: {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentBundle: bundle })
      }
    };
  }

  /**
   * What the preview's status line says when the preview could not be reached: why, in the
   * error's own words (a dropped connection, an expired login, a gateway page that is not
   * JSON), so one failure reads apart from another.
   */
  function previewFailure(error) {
    var message = error && typeof error.message === 'string' ? error.message.trim() : '';
    return message ? 'The preview could not be reached (' + message + ').' : 'The preview could not be reached.';
  }

  /**
   * Is a field set as the page's template reads it (Handlebars' {{#if}}): an empty string, an
   * empty list, zero, false, null and a missing field are all unset.
   */
  function setInTemplate(value) {
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }

  /**
   * The byline as the page prints it (templates/journalist/partials/header.hbs): the author;
   * then ' | ' and the title, when there is one; then ' || ' and the guest reporter's credit,
   * when there is one. Without an author the page prints none of them, and this is ''.
   */
  function bylineLine(byline) {
    var b = isPlainObject(byline) ? byline : {};
    if (!setInTemplate(b.author)) return '';
    var line = String(b.author) + (setInTemplate(b.title) ? ' | ' + b.title : '');
    return setInTemplate(b.guestReporter) ? line + ' || ' + b.guestReporter : line;
  }

  /** The byline as the desk shows it: the line the page prints, or that it prints none. */
  function bylineLabel(byline) {
    return bylineLine(byline) || 'No byline: the page prints one only with an author.';
  }

  /**
   * What the desk knows about whether the page prints the writer's money tracker: 'prints' or
   * 'does-not-print' once the stop's payload (getCheckpointData's `writerTrackerPrints`) or a
   * preview's answer has said, else 'unknown'. An answer that says nothing leaves what the desk
   * knew.
   *
   * @param {*} flag - `writerTrackerPrints`, from the payload or the preview route
   * @param {string} [previous] - what the desk knew before this answer
   * @returns {'unknown'|'prints'|'does-not-print'}
   */
  function writerTrackerState(flag, previous) {
    if (flag === true) return 'prints';
    if (flag === false) return 'does-not-print';
    return previous === 'prints' || previous === 'does-not-print' ? previous : 'unknown';
  }

  /**
   * Has the writer's money tracker a row: an entry that is an object, as the server's
   * predicate counts them (lib/template-assembler.js writerTrackerPrints; a test holds the
   * two equal)?
   */
  function hasWriterTrackerRow(bundle) {
    var tracker = isPlainObject(bundle) && isPlainObject(bundle.financialTracker) ? bundle.financialTracker : null;
    return Boolean(tracker && Array.isArray(tracker.entries) && tracker.entries.some(isPlainObject));
  }

  /**
   * What the desk shows for the writer's money tracker: its editor while the page prints it;
   * the ledger's note while it does not and has a row, since then the ledger's tracker prints
   * in its place; and neither otherwise, nor while the desk does not know, so the desk never
   * misstates what prints.
   *
   * @param {'unknown'|'prints'|'does-not-print'} state - writerTrackerState's
   * @param {Object} bundle - the bundle on the desk
   * @returns {'editor'|'ledger-note'|'none'}
   */
  function writerTrackerDisplay(state, bundle) {
    if (state === 'prints') return 'editor';
    if (state === 'does-not-print' && hasWriterTrackerRow(bundle)) return 'ledger-note';
    return 'none';
  }

  // ── public surface ────────────────────────────────────────────────────────
  var api = {
    INSERTABLE_TYPES: INSERTABLE_TYPES,
    newBlock: newBlock,
    insertBlock: insertBlock,
    deleteBlock: deleteBlock,
    moveBlock: moveBlock,
    moveToSection: moveToSection,
    stepTarget: stepTarget,
    setBlock: setBlock,
    setSectionHeading: setSectionHeading,
    changedFields: changedFields,
    setHeadline: setHeadline,
    setByline: setByline,
    setHero: setHero,
    sidebarCardForm: sidebarCardForm,
    setSidebarCard: setSidebarCard,
    setTrackerEntry: setTrackerEntry,

    HEADLINE_LIMITS: HEADLINE_LIMITS,
    headlineProblems: headlineProblems,
    isEmptyBlock: isEmptyBlock,
    emptyBlockNote: emptyBlockNote,
    emptyBlocks: emptyBlocks,
    deskProblems: deskProblems,

    pairSectionBlocks: pairSectionBlocks,
    stayingInSection: stayingInSection,
    stayingPairs: stayingPairs,
    sameBlock: sameBlock,
    blockText: blockText,
    blockKey: blockKey,
    sectionKey: sectionKey,
    deskChanges: deskChanges,
    untouchedThrough: untouchedThrough,
    sectionLabel: sectionLabel,
    // Task 4.10: the pieces of the desk the marks sit beside
    PRINTED_TEXT_FIELDS: PRINTED_TEXT_FIELDS,
    printedTexts: printedTexts,
    paragraphBlockIndex: paragraphBlockIndex,
    printedPlaces: printedPlaces,

    wordCount: wordCount,
    stripScripts: stripScripts,
    previewRequest: previewRequest,
    previewFailure: previewFailure,
    bylineLine: bylineLine,
    bylineLabel: bylineLabel,
    writerTrackerState: writerTrackerState,
    writerTrackerDisplay: writerTrackerDisplay
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.articleDeskLogic = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
