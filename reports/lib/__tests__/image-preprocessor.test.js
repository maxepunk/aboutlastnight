/**
 * The image preprocessor's copy is upright (brief FB; the final review's finding 2).
 *
 * preprocessPhotos writes a resized copy of each session photo into data/<id>/photos as
 * <name>.jpg, and the copy carries no metadata. When the copy is a new file (a photo from
 * a custom photos folder, or a .jpeg), the writers are given the copy, so the published
 * page prints it. A portrait phone photo is stored sideways with EXIF orientation 6:
 * resized without turning its pixels upright, its copy lost the tag that told a viewer
 * to turn it and printed on its side. Every image here is made with sharp; none comes
 * from data/.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { preprocessImage } = require('../image-preprocessor');

const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };

const roots = [];
let log;
beforeEach(() => {
  log = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  log.mockRestore();
  while (roots.length > 0) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

function tempFolder() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-image-preprocessor-'));
  roots.push(root);
  return root;
}

/**
 * A portrait photo stored sideways, as a camera turned on its side stores it: the pixels
 * are the upright view turned a quarter turn anticlockwise, so the photo's top (red) sits
 * on the left, and EXIF orientation 6 tells a viewer to turn it a quarter turn clockwise.
 */
async function writeSidewaysPortrait(file) {
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: BLUE } })
    .composite([{ input: { create: { width: 1000, height: 1000, channels: 3, background: RED } }, left: 0, top: 0 }])
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toFile(file);
}

async function pixelAt(file, x, y) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}
const isRed = (p) => p.r > 200 && p.g < 60 && p.b < 60;
const isBlue = (p) => p.b > 200 && p.r < 60 && p.g < 60;

describe('preprocessImage', () => {
  test('turns a portrait stored sideways with EXIF orientation 6 upright before it resizes it', async () => {
    const root = tempFolder();
    const original = path.join(root, 'phone', 'portrait.jpeg');
    fs.mkdirSync(path.dirname(original), { recursive: true });
    await writeSidewaysPortrait(original);
    const photosDir = path.join(root, 'data', '0926262', 'photos');

    const result = await preprocessImage(original, { outputDir: photosDir });

    expect(result.path).toBe(path.join(photosDir, 'portrait.jpg'));
    const meta = await sharp(result.path).metadata();
    expect({ size: [meta.width, meta.height], orientation: meta.orientation })
      .toEqual({ size: [784, 1568], orientation: undefined });
    expect(isRed(await pixelAt(result.path, 392, 100))).toBe(true);
    expect(isBlue(await pixelAt(result.path, 392, 1468))).toBe(true);
  });
});
