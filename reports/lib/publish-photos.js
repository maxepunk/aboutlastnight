/**
 * Publish Photos - the photos the published page prints, written at web size
 *
 * The published page is read by the players, often on a phone, and lives in a public
 * repository. The publish step used to copy every top-level file of data/<id>/photos
 * at full camera size: 0926262's eleven photos came to 87.8 MB, cut to 2.2 MB by hand
 * (commit 715c86e), and the copy also published files the page never prints, such as a
 * photo the director excluded or the whiteboard.
 *
 * It now publishes only the photos the page prints (printedPhotos), each under its own
 * name, because the HTML names them verbatim, spaces and brackets included. Each photo
 * is written with the settings used by hand for 0926262 (spec section 9):
 * - turned upright from its EXIF orientation first: stripping the metadata without
 *   turning the pixels would leave a portrait photo on its side;
 * - fitted to PUBLISHED_PHOTO.longEdge on its long edge, never enlarged;
 * - in sRGB, with no metadata (no EXIF, ICC profile, XMP or IPTC);
 * - a JPEG at PUBLISHED_PHOTO.jpegQuality, encoded by mozjpeg as the hand resize was
 *   (each of its eleven files is this output plus a 498-byte ICC profile); any other
 *   format re-encoded in its own format, so the name still matches the content.
 *
 * A printed photo missing from the photos folder throws, naming it and the folder,
 * before anything is written: published without it, the page would show a broken
 * image. The message sends the director to put the file back and retry the publish,
 * which resumes the run, since a rollback to the article stop would write the article
 * again. The photos folder is only read, nothing is written outside the published
 * folder, and a file already there that the page does not print is left as it is.
 *
 * @module publish-photos
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { printedHero } = require('./theme-config');

/** The web size: 1600 px on the long edge, JPEG quality 85 (spec section 9). */
const PUBLISHED_PHOTO = Object.freeze({ longEdge: 1600, jpegQuality: 85 });

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * The photos the page prints, read from the bundle: the hero when the page prints it,
 * then every photo block in the sections, in the writer's order, each filename once.
 * Whether the hero prints is printedHero's rule (lib/theme-config.js), which the
 * assembler reads too: the theme's layout prints a hero, and the hero names a file.
 * A block with no filename has nothing to publish, and neither layout prints the
 * bundle's top-level `photos` list.
 *
 * @param {Object} bundle - ContentBundle
 * @param {string} theme - 'journalist' | 'detective'
 * @returns {string[]} filenames, as the HTML names them
 * @throws {Error} for a theme with no known layout (from printedHero)
 */
function printedPhotos(bundle, theme) {
  const hero = printedHero(bundle, theme);
  const filenames = [];
  const print = (filename) => {
    if (typeof filename === 'string' && filename !== '' && !filenames.includes(filename)) {
      filenames.push(filename);
    }
  };
  if (hero) print(hero.filename);
  for (const section of asArray(bundle && bundle.sections)) {
    for (const block of asArray(section && section.content)) {
      if (block && block.type === 'photo') print(block.filename);
    }
  }
  return filenames;
}

/** `filename` resolved inside `folder`, or null when it leads outside it. */
function pathInside(folder, filename) {
  const target = path.resolve(folder, filename);
  const relative = path.relative(path.resolve(folder), target);
  const outside = relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);
  return outside ? null : target;
}

function isFile(file) {
  const stats = fs.statSync(file, { throwIfNoEntry: false });
  return Boolean(stats && stats.isFile());
}

/**
 * The photos the page prints that `folder` lacks: each printed filename (printedPhotos)
 * that is not a file inside the folder, one that leads outside it included. The article
 * stop's approve asks this before the director leaves the stop (server.js), and
 * publishPhotos refuses the same names.
 *
 * @param {Object} bundle - the ContentBundle the page is assembled from
 * @param {string} theme - the page's theme
 * @param {string} folder - data/<id>/photos
 * @returns {string[]} the filenames, in the order the page prints them
 */
function missingPrintedPhotos(bundle, theme, folder) {
  return printedPhotos(bundle, theme).filter((filename) => {
    const file = pathInside(folder, filename);
    return !file || !isFile(file);
  });
}

const quoted = (filenames) => filenames.map((filename) => `"${filename}"`).join(', ');

/**
 * One photo at web size, as bytes in its own format. The file is read with fs and the
 * bytes handed to sharp, so libvips holds no handle on the director's photo.
 *
 * @param {string} source - the photo's path in the photos folder
 * @returns {Promise<Buffer>}
 */
async function webSizePhoto(source) {
  const image = sharp(fs.readFileSync(source));
  const { format } = await image.metadata();
  image
    .autoOrient()
    .resize({
      width: PUBLISHED_PHOTO.longEdge,
      height: PUBLISHED_PHOTO.longEdge,
      fit: 'inside',
      withoutEnlargement: true
    })
    .toColourspace('srgb');
  if (format === 'jpeg') image.jpeg({ quality: PUBLISHED_PHOTO.jpegQuality, mozjpeg: true });
  else image.toFormat(format);
  return image.toBuffer();
}

/**
 * Publish the photos the page prints, from the session's photos folder into its
 * published folder, each at web size under its own name. A printed photo replaces the
 * file of its name; every other file in the published folder is left as it is.
 *
 * @param {Object} args
 * @param {Object} args.bundle - the ContentBundle the page is assembled from
 * @param {string} args.theme - the page's theme
 * @param {string} args.sourceDir - data/<id>/photos
 * @param {string} args.destDir - outputs/sessionphotos/<id>
 * @returns {Promise<string[]>} the filenames published, in the writer's order (the
 *   printed hero first), as printedPhotos lists them
 * @throws {Error} naming each printed photo that leads outside the folders or is
 *   missing from sourceDir, before anything is written; naming the photo when one
 *   cannot be read or encoded
 */
async function publishPhotos({ bundle, theme, sourceDir, destDir }) {
  const photos = printedPhotos(bundle, theme).map((filename) => ({
    filename,
    source: pathInside(sourceDir, filename),
    dest: pathInside(destDir, filename)
  }));

  const outside = photos.filter((photo) => !photo.source || !photo.dest).map((photo) => photo.filename);
  if (outside.length > 0) {
    throw new Error(
      `[publishPhotos] The page prints ${quoted(outside)}: a photo's filename must name a file inside ` +
      `${sourceDir}, and its published copy is written only inside ${destDir}.`
    );
  }
  // The director reads this on the failure card, beside Retry and Roll back. Retry
  // resumes the run and publishes the approved article; a rollback to the article stop
  // clears the article and writes it again.
  const missing = photos.filter((photo) => !isFile(photo.source)).map((photo) => photo.filename);
  if (missing.length > 0) {
    const them = missing.length === 1 ? 'it' : 'them';
    throw new Error(
      `[publishPhotos] The page prints ${quoted(missing)}, missing from ${sourceDir}: published ` +
      `without ${them}, the page would show a broken image. Put ${them} back in that folder and retry ` +
      'the publish: Retry resumes the run and publishes the approved article, while a rollback to the ' +
      'article stop would write the article again.'
    );
  }

  for (const photo of photos) {
    let bytes;
    try {
      bytes = await webSizePhoto(photo.source);
    } catch (error) {
      throw new Error(
        `[publishPhotos] Could not publish "${photo.filename}" from ${sourceDir}: ${error.message}`,
        { cause: error }
      );
    }
    fs.mkdirSync(path.dirname(photo.dest), { recursive: true });
    fs.writeFileSync(photo.dest, bytes);
  }
  return photos.map((photo) => photo.filename);
}

/**
 * The files in a session's published folder that its page does not print (the director's ruling
 * at the end of phase 4, 2026-10-04): a photo an earlier publish wrote that the director has
 * since left out or deleted, or any other file there. Publish deletes nothing (F2), and the
 * folder is public once committed, so the completion names each one for the director to remove.
 *
 * @param {string} destDir - outputs/sessionphotos/<id>
 * @param {string[]} printed - the filenames the page prints (publishPhotos' return)
 * @returns {string[]} the other files' names, sorted; none when the folder does not exist
 */
function filesNotPrinted(destDir, printed) {
  if (!fs.existsSync(destDir)) return [];
  const onPage = new Set(printed.map((name) => path.basename(name).toLowerCase()));
  return fs.readdirSync(destDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !onPage.has(entry.name.toLowerCase()))
    .map((entry) => entry.name)
    .sort();
}

module.exports = {
  PUBLISHED_PHOTO,
  printedPhotos,
  missingPrintedPhotos,
  publishPhotos,
  filesNotPrinted
};
