/**
 * Articles written in brief F3's notation (never two photos in a row), for the photo
 * spacing tests: `[id]` opens a section, `P` is a paragraph, `PHn` is photo n (its
 * file `phn.jpg`), and `quote`, `card` and `list` are the other blocks. Every text is
 * synthetic: no test reads a session's data.
 */

/**
 * The sections a notation describes. Each block's text names its section and its
 * place there, so no two blocks compare equal.
 */
function sectionsFrom(notation) {
  const sections = [];
  for (const token of notation.trim().split(/\s+/)) {
    const opens = token.match(/^\[(.+)\]$/);
    if (opens) {
      sections.push({ id: opens[1], type: 'narrative', heading: opens[1], content: [] });
      continue;
    }
    const section = sections[sections.length - 1];
    if (!section) throw new Error(`"${token}" comes before any section`);
    section.content.push(blockFor(token, `${section.id} ${section.content.length + 1}`));
  }
  return sections;
}

function blockFor(token, place) {
  const photo = token.match(/^PH(\d+)$/);
  if (photo) return { type: 'photo', filename: `ph${photo[1]}.jpg`, caption: `Photo ${photo[1]}.` };
  switch (token) {
    case 'P': return { type: 'paragraph', text: `Paragraph ${place}.` };
    case 'quote': return { type: 'quote', text: `Quote ${place}.`, attribution: 'A player' };
    case 'card': return { type: 'evidence-card', tokenId: `doc-${place.replace(/\s+/g, '-')}`, headline: `Card ${place}`, content: `Card ${place}.` };
    case 'list': return { type: 'list', items: [`Item ${place}.`] };
    default: throw new Error(`unknown block "${token}"`);
  }
}

/** The notation of the given sections. */
function notationOf(sections) {
  return sections
    .map((section) => [`[${section.id}]`, ...section.content.map(tokenOf)].join(' '))
    .join(' ');
}

function tokenOf(block) {
  if (block.type === 'photo') return block.filename.replace(/^ph(\d+)\.jpg$/, 'PH$1');
  if (block.type === 'paragraph') return 'P';
  if (block.type === 'evidence-card') return 'card';
  return block.type;
}

/**
 * Every photo that directly follows another photo in reading order, across sections,
 * as "first > second". With a photo printed just above the first block (the
 * journalist hero), a photo that opens the article follows "hero".
 */
function adjacentPhotos(sections, { photoAboveFirstBlock = false } = {}) {
  const pairs = [];
  let previous = photoAboveFirstBlock ? 'hero' : null;
  for (const block of sections.flatMap((section) => section.content)) {
    const photo = block.type === 'photo' ? tokenOf(block) : null;
    if (photo && previous) pairs.push(`${previous} > ${photo}`);
    previous = photo;
  }
  return pairs;
}

module.exports = { sectionsFrom, notationOf, adjacentPhotos };
