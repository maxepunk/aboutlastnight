/**
 * Photo spacing (spec 2026-10-02 section 9; brief F3): the printed article never shows
 * two photos in a row.
 *
 * Three photos in a row across THE PLAYERS and WHAT'S MISSING were the director's only
 * reason for sending session 0926262's article back, and that send-back set off the
 * judge pass that rewrote the director's edits. Spacing changes only what prints:
 * TemplateAssembler.buildContext calls spacePhotos before it maps the sections, so the
 * publish step, the article stop's preview and scripts/assemble-article.js all print
 * the spaced order, while the stored bundle, the approved bundle and the console's
 * editors keep the writer's.
 *
 * The rule:
 * - The blocks are read in order across sections. A section heading separates nothing.
 * - A photo never directly follows another photo. When the page prints a photo just
 *   above the first block (the journalist hero), that photo counts.
 * - A photo that would follow a photo waits. The waiting photos are placed in their
 *   order, one directly after each later paragraph.
 * - A photo still waiting at the end of the article opens a place directly after the
 *   last paragraph with no photo after it. The photos then fill their places in the
 *   writer's order, so a run at the end spreads back over the closing paragraphs and
 *   its last photo still prints last.
 * - When every paragraph already has a photo after it, a waiting photo prints at the
 *   end of the article: no photo is dropped.
 * - Only photo blocks move, and they keep their order among themselves. A placed photo
 *   belongs to the section of the paragraph it follows.
 *
 * Pure: nothing it is given is mutated, and an article with no photo after a photo
 * comes back exactly as it was, so spacing twice changes nothing.
 */

const isPhoto = (block) => Boolean(block) && block.type === 'photo';
const isParagraph = (block) => Boolean(block) && block.type === 'paragraph';

/**
 * Space the photos of a bundle's sections.
 *
 * @param {Array} sections - The bundle's sections, in the writer's order
 * @param {Object} [options]
 * @param {boolean} [options.photoAboveFirstBlock=false] - The page prints a photo just
 *   above the first block (the journalist hero)
 * @returns {Array} New sections in the printed order. A value that is not an array
 *   comes back as given, and so does a section with no content array.
 */
function spacePhotos(sections, { photoAboveFirstBlock = false } = {}) {
  if (!Array.isArray(sections)) return sections;

  const printed = [];   // { section, block }: the blocks in printed order
  const waiting = [];   // photos that would follow a photo, in the writer's order
  const photos = [];    // every photo, in the writer's order
  let afterPhoto = photoAboveFirstBlock;
  let lastSection = -1; // the section of the last block read

  sections.forEach((section, index) => {
    if (!section || !Array.isArray(section.content)) return;
    for (const block of section.content) {
      lastSection = index;
      if (isPhoto(block)) {
        photos.push(block);
        // A photo behind waiting photos waits too, so the photos keep their order.
        if (afterPhoto || waiting.length > 0) {
          waiting.push(block);
        } else {
          printed.push({ section: index, block });
          afterPhoto = true;
        }
        continue;
      }
      printed.push({ section: index, block });
      afterPhoto = false;
      if (isParagraph(block) && waiting.length > 0) {
        printed.push({ section: index, block: waiting.shift() });
        afterPhoto = true;
      }
    }
  });

  for (const photo of waiting) {
    const at = lastParagraphWithoutPhoto(printed);
    if (at === -1) printed.push({ section: lastSection, block: photo });
    else printed.splice(at + 1, 0, { section: printed[at].section, block: photo });
  }

  // The photos fill their places in the writer's order. Only a place opened at the end
  // can come before a photo already placed, so only a run at the end changes here.
  let next = 0;
  for (const entry of printed) {
    if (isPhoto(entry.block)) entry.block = photos[next++];
  }

  const contents = sections.map(() => []);
  for (const { section, block } of printed) contents[section].push(block);
  return sections.map((section, index) =>
    section && Array.isArray(section.content) ? { ...section, content: contents[index] } : section);
}

/** The index in `printed` of the last paragraph with no photo directly after it, or -1. */
function lastParagraphWithoutPhoto(printed) {
  for (let i = printed.length - 1; i >= 0; i -= 1) {
    const photoAfter = i + 1 < printed.length && isPhoto(printed[i + 1].block);
    if (isParagraph(printed[i].block) && !photoAfter) return i;
  }
  return -1;
}

module.exports = { spacePhotos };
