/**
 * Photo spacing (spec 2026-10-02 section 9; briefs F3 and FB): the printed article shows
 * two photos in a row only when the photos outnumber the blocks that can separate them.
 *
 * Three photos in a row across THE PLAYERS and WHAT'S MISSING were the director's only
 * reason for sending session 0926262's article back, and that send-back set off the
 * judge pass that rewrote the director's edits. Spacing changes only what prints:
 * TemplateAssembler.buildContext calls spacePhotos before it maps the sections and
 * builds the section nav, so the publish step, the article stop's preview and
 * scripts/assemble-article.js all print the spaced order, while the stored bundle, the
 * approved bundle and the console's editors keep the writer's.
 *
 * The rule:
 * - The blocks are read in the writer's order across sections. A section heading
 *   separates nothing.
 * - Only a photo that would follow a photo moves: a photo directly after another photo,
 *   or the first block when the page prints a photo just above it (the journalist hero;
 *   printedHero in lib/theme-config.js says when). Every other photo stays where the
 *   writer put it, even while an earlier photo waits, because a reader notices a photo
 *   beside the wrong section, not the order of the photos.
 * - A photo that moves waits for the next paragraph the writer did not follow with a
 *   photo, and goes directly after it. The waiting photos are placed in their order.
 * - A photo still waiting at the end of the article goes directly after the last
 *   paragraph with no photo after it. When no paragraph is left free, it goes after the
 *   last other block with no photo after it, and when no block is left free, at the end
 *   of the article, so no photo is dropped. The waiting photos then fill the places they
 *   took in the writer's order; a photo that did not wait keeps its place.
 * - So two photos print together only when the photos outnumber the blocks that can
 *   separate them.
 * - Only photo blocks move. A placed photo belongs to the section of the block it
 *   follows.
 * - A section with no blocks does not print: one the spacing empties, and one that came
 *   with none, such as a section the director emptied at the desk (task 4.14c), so the
 *   page prints no heading over nothing and its nav no link to it.
 *
 * Pure: nothing it is given is mutated, and an article with no photo after a photo and no
 * section without blocks comes back exactly as it was, so spacing twice changes nothing.
 */

const isPhoto = (block) => Boolean(block) && block.type === 'photo';
const isParagraph = (block) => Boolean(block) && block.type === 'paragraph';
const isOtherBlock = (block) => !isPhoto(block);
const hasContent = (section) => Boolean(section) && Array.isArray(section.content);

/**
 * Space the photos of a bundle's sections.
 *
 * @param {Array} sections - The bundle's sections, in the writer's order
 * @param {Object} [options]
 * @param {boolean} [options.photoAboveFirstBlock=false] - The page prints a photo just
 *   above the first block (the journalist hero)
 * @returns {Array} New sections in the printed order, without the sections that hold no
 *   block. A value that is not an array comes back as given, and so does a section with no
 *   content array.
 */
function spacePhotos(sections, { photoAboveFirstBlock = false } = {}) {
  if (!Array.isArray(sections)) return sections;

  const read = [];      // { section, block }: every block in the writer's order
  sections.forEach((section, index) => {
    if (!hasContent(section)) return;
    for (const block of section.content) read.push({ section: index, block });
  });

  const printed = [];   // { section, block, waited }: the blocks in printed order
  const waiting = [];   // photos that would follow a photo, not yet placed
  const waited = [];    // every photo that waited, in the writer's order

  read.forEach(({ section, block }, index) => {
    if (isPhoto(block)) {
      const followsPhoto = index === 0 ? photoAboveFirstBlock : isPhoto(read[index - 1].block);
      if (followsPhoto) {
        waiting.push(block);
        waited.push(block);
      } else {
        printed.push({ section, block });
      }
      return;
    }
    printed.push({ section, block });
    // A paragraph the writer followed with a photo keeps that photo, so a waiting photo
    // goes after the next paragraph that has none.
    const photoNext = index + 1 < read.length && isPhoto(read[index + 1].block);
    if (isParagraph(block) && !photoNext && waiting.length > 0) {
      printed.push({ section, block: waiting.shift(), waited: true });
    }
  });

  const lastSection = read.length > 0 ? read[read.length - 1].section : -1;
  for (const photo of waiting) {
    let at = lastWithoutPhotoAfter(printed, isParagraph);
    if (at === -1) at = lastWithoutPhotoAfter(printed, isOtherBlock);
    if (at === -1) printed.push({ section: lastSection, block: photo, waited: true });
    else printed.splice(at + 1, 0, { section: printed[at].section, block: photo, waited: true });
  }

  // A place opened at the end can come before a place taken earlier, so the waiting
  // photos fill the places they took in the writer's order.
  let next = 0;
  for (const entry of printed) {
    if (entry.waited) entry.block = waited[next++];
  }

  const contents = sections.map(() => []);
  for (const { section, block } of printed) contents[section].push(block);
  return sections
    .map((section, index) => (hasContent(section) ? { ...section, content: contents[index] } : section))
    .filter((section, index) => !(hasContent(section) && contents[index].length === 0));
}

/**
 * The index in `printed` of the last block that passes `test` with no photo directly
 * after it, or -1.
 */
function lastWithoutPhotoAfter(printed, test) {
  for (let i = printed.length - 1; i >= 0; i -= 1) {
    const photoAfter = i + 1 < printed.length && isPhoto(printed[i + 1].block);
    if (test(printed[i].block) && !photoAfter) return i;
  }
  return -1;
}

module.exports = { spacePhotos };
