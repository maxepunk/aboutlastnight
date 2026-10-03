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
 *   THE CHANGE REPORT (deskChanges) says, section by section, which blocks the director
 *   inserted, deleted, moved or edited since the stop opened. The desk's marks (task 4.10)
 *   anchor on it: a finding's section and ordinal hold only while no block at or before it
 *   in that section changed (untouchedThrough). A block the director moved within its
 *   section is the one named as moved, not the ones it passed: of the blocks that kept
 *   their order, the longest run stays, preferring edited blocks and text blocks, as the
 *   server's diff decides it (lib/hand-edit-diff.js stayingPairs), so the desk and the
 *   director's standing edits name the same block.
 *
 *   WHAT THE DESK SHOWS: the word count of the bundle as edited, the preview request for
 *   the page as it will print (server.js POST /api/session/:id/article/preview), and the
 *   script strip the preview frame applies to that page and to htmlPreview alike.
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

  /** JSON with every object's keys sorted, so two blocks compare by what they hold. */
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (isPlainObject(value)) {
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + canonical(value[key]);
      }).join(',') + '}';
    }
    return value === undefined ? 'undefined' : JSON.stringify(value);
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

  /** The bundle with the hero's caption or characters as the director edited them. */
  function setHero(bundle, fields) {
    return withFields(bundle, 'heroImage', fields);
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

  // ── the change report ─────────────────────────────────────────────────────

  /** The kinds of block that carry the article's text, which a move is least likely to be about. */
  var TEXT_BLOCK_TYPES = ['paragraph', 'quote', 'list'];

  /** What names a photo, a card or a reference in any version, a field edit apart. */
  function blockIdentity(block) {
    if (!isPlainObject(block)) return null;
    if (block.type === 'photo' && typeof block.filename === 'string') return 'photo|' + block.filename;
    if ((block.type === 'evidence-card' || block.type === 'evidence-reference') && typeof block.tokenId === 'string') {
      return block.type + '|' + block.tokenId;
    }
    return null;
  }

  /**
   * The pairs that stay in place, as indexes into `pairs` (sorted by their place in the
   * version the director made), ascending: the longest run whose order in the opened
   * version matches, preferring, among runs as long, the one that keeps edited blocks and
   * text blocks, so the photo or card the director moved is the one named. The server's
   * diff decides it by the same rule (lib/hand-edit-diff.js stayingPairs; a test holds the
   * two equal).
   *
   * @param {Array<{opened: number, weight: number}>} pairs - each pair's index in the opened version, and its weight
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

  function blocksOf(bundle) {
    var out = [];
    sectionsOf(bundle).forEach(function (section, s) {
      var key = sectionKey(section, s);
      contentOf(section).forEach(function (block, b) {
        out.push({
          key: key, section: s, block: b, canon: canonical(block),
          identity: blockIdentity(block), type: isPlainObject(block) ? block.type : null
        });
      });
    });
    return out;
  }

  /**
   * Pair each block on the desk with the block it was when the stop opened: the same block
   * in the same place; the same block anywhere, its own section first; the same photo, card
   * or reference with a field changed; the same kind of block in the same place with its
   * text changed. What pairs with nothing was inserted or deleted.
   */
  function pairBlocks(opened, current) {
    var used = [];
    var pairs = [];
    var unpaired = current.slice();
    function take(test) {
      unpaired = unpaired.filter(function (c) {
        var found = -1;
        var fallback = -1;
        for (var i = 0; i < opened.length; i += 1) {
          if (used[i] || !test(opened[i], c)) continue;
          if (opened[i].key === c.key) { found = i; break; }
          if (fallback === -1) fallback = i;
        }
        if (found === -1) found = fallback;
        if (found === -1) return true;
        used[found] = true;
        pairs.push({ opened: opened[found], current: c });
        return false;
      });
    }
    take(function (o, c) { return o.key === c.key && o.block === c.block && o.canon === c.canon; });
    take(function (o, c) { return o.canon === c.canon; });
    take(function (o, c) { return c.identity !== null && o.identity === c.identity; });
    take(function (o, c) { return o.key === c.key && o.block === c.block && o.type === c.type; });
    return {
      pairs: pairs,
      inserted: unpaired,
      deleted: opened.filter(function (_o, i) { return !used[i]; })
    };
  }

  /**
   * What the director inserted, deleted, moved or edited at the desk since the stop opened,
   * section by section, each section named by its key (its id, as the fact check's findings
   * name it). A block that moved across sections is listed in both. `unchanged` counts the
   * section's first blocks that are the same, in the same place, in both versions: a
   * finding about a block at an index below it still points at that block.
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
    var paired = pairBlocks(blocksOf(opened), blocksOf(current));

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

    // Which pairs moved: those that changed section, and within a section those outside the
    // run of blocks that kept their order.
    var bySection = {};
    paired.pairs.forEach(function (pair) {
      pair.moved = pair.opened.key !== pair.current.key;
      if (!pair.moved) (bySection[pair.current.key] = bySection[pair.current.key] || []).push(pair);
    });
    Object.keys(bySection).forEach(function (key) {
      var inSection = bySection[key].slice().sort(function (a, b) { return a.current.block - b.current.block; });
      var staying = stayingPairs(inSection.map(function (pair) {
        return {
          opened: pair.opened.block,
          weight: (pair.opened.canon !== pair.current.canon ? 2 : 0) + (TEXT_BLOCK_TYPES.indexOf(pair.current.type) !== -1 ? 1 : 0)
        };
      }));
      inSection.forEach(function (pair, i) { pair.moved = staying.indexOf(i) === -1; });
    });

    // Listed in the order the blocks stood when the stop opened; a block that changed
    // section is listed under both.
    function list(name, pair) {
      var where = {
        from: { section: pair.opened.key, block: pair.opened.block },
        to: { section: pair.current.key, block: pair.current.block }
      };
      entry(pair.opened.key)[name].push(where);
      if (pair.current.key !== pair.opened.key) entry(pair.current.key)[name].push(where);
    }
    paired.pairs.slice()
      .sort(function (a, b) { return (a.opened.section - b.opened.section) || (a.opened.block - b.opened.block); })
      .forEach(function (pair) {
        if (pair.moved) list('moved', pair);
        if (pair.opened.canon !== pair.current.canon) list('edited', pair);
      });
    paired.inserted.forEach(function (c) { entry(c.key).inserted.push(c.block); });
    paired.deleted.forEach(function (o) { entry(o.key).deleted.push(o.block); });

    var openedByKey = {};
    opened.sections.forEach(function (section, s) { openedByKey[sectionKey(section, s)] = contentOf(section); });
    current.sections.forEach(function (section, s) {
      var before = openedByKey[sectionKey(section, s)];
      var after = contentOf(section);
      if (!before) return;
      var n = 0;
      while (n < before.length && n < after.length && canonical(before[n]) === canonical(after[n])) n += 1;
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
    setSidebarCard: setSidebarCard,
    setTrackerEntry: setTrackerEntry,

    HEADLINE_LIMITS: HEADLINE_LIMITS,
    headlineProblems: headlineProblems,
    isEmptyBlock: isEmptyBlock,
    emptyBlockNote: emptyBlockNote,
    emptyBlocks: emptyBlocks,
    deskProblems: deskProblems,

    deskChanges: deskChanges,
    untouchedThrough: untouchedThrough,
    stayingPairs: stayingPairs,
    sectionKey: sectionKey,
    sectionLabel: sectionLabel,

    wordCount: wordCount,
    stripScripts: stripScripts,
    previewRequest: previewRequest
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.articleDeskLogic = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
