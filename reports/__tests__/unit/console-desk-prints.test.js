/**
 * The desk shows what prints, field by field (phase 4, task 4.3b; spec 2026-10-02 section 6.3).
 *
 * The article stop is the article as it will print, so an editor or a label for a field the
 * page never prints misstates the page: an edit there becomes a standing edit that changes
 * nothing a reader sees. Each field below is checked against the journalist templates, the
 * page's own source: no template reads it, and Article.js neither edits it nor shows it. A
 * field the page does not print keeps its value in the bundle (the editors save only what
 * the director changed), as the byline's location and date do.
 *
 * The console has no DOM harness (reports/CLAUDE.md), so this reads the source, as
 * console-edit-gates.test.js and console-editable-pencils.test.js do.
 */
const fs = require('fs');
const path = require('path');

const REPORTS = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPORTS, rel), 'utf8');

/** The Handlebars expressions a template evaluates, its comments left out. */
const expressionsIn = (rel) => (read(rel).replace(/\{\{!--[\s\S]*?--\}\}/g, '').match(/\{\{[^}]*\}\}/g) || []).join(' ');
const reads = (rel, field) => new RegExp(`\\b${field}\\b`).test(expressionsIn(rel));

const PHOTO = 'templates/journalist/partials/content-blocks/photo.hbs';
const LAYOUT = 'templates/journalist/layouts/article.hbs';
const SIDEBAR_CARD = 'templates/journalist/partials/sidebar/evidence-card.hbs';
const TRACKER = 'templates/journalist/partials/sidebar/financial-tracker.hbs';

describe('the journalist page never prints these fields', () => {
  test('a photo\'s characters and the hero\'s', () => {
    expect(reads(PHOTO, 'characters')).toBe(false);
    expect(reads(LAYOUT, 'characters')).toBe(false);
  });

  test('a sidebar entry\'s placement, owner and layer', () => {
    ['placement', 'owner', 'layer'].forEach((field) => expect([field, reads(SIDEBAR_CARD, field)]).toEqual([field, false]));
  });

  test('a tracker row\'s category and date', () => {
    ['category', 'date'].forEach((field) => expect([field, reads(TRACKER, field)]).toEqual([field, false]));
  });

  // The sidebar card's document id is read (its data-token-id attribute), so the desk keeps
  // showing it under the card, where the fact check's findings name the card by it.
  test('a sidebar entry\'s tokenId is read, and stays on the desk', () => {
    expect(reads(SIDEBAR_CARD, 'tokenId')).toBe(true);
    expect(read('console/components/checkpoints/Article.js')).toContain('card.tokenId');
  });
});

describe('Article.js neither edits nor shows them', () => {
  const src = read('console/components/checkpoints/Article.js');

  test('no editor for a photo\'s or the hero\'s characters, a sidebar entry\'s placement or a tracker row\'s category', () => {
    ['Characters in photo', 'Hero image characters', 'Tracker row category', "'Placement'", 'local.placement', 'local.category']
      .forEach((text) => expect([text, src.includes(text)]).toEqual([text, false]));
  });

  test('no label for them on the desk', () => {
    ['block.characters', 'currentHero.characters', 'card.owner', 'card.layer', 'card.placement', 'entry.category', 'entry.date']
      .forEach((text) => expect([text, src.includes(text)]).toEqual([text, false]));
  });
});
