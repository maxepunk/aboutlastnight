/**
 * Image Preprocessor - Prepare images for Claude SDK analysis
 *
 * Large images (50-133MB PNGs) cause SDK timeouts due to:
 * - Base64 encoding overhead
 * - Long Read tool execution times
 *
 * This module resizes and compresses images before SDK analysis:
 * - Resize to Claude's optimal resolution (1568px max dimension)
 * - Convert PNG to JPEG for smaller file size
 * - Compress with quality setting for good balance
 *
 * Added in Commit 8.9 to fix photo analysis timeouts.
 *
 * @module image-preprocessor
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Preprocessing configuration
 */
const CONFIG = {
  // Claude's optimal image size (from docs: images > 1568px are resized anyway)
  MAX_DIMENSION: 1568,

  // File size thresholds (in bytes)
  NEEDS_PROCESSING_SIZE: 5 * 1024 * 1024,  // 5MB - process files larger than this

  // Output quality (1-100, higher = better quality, larger file)
  JPEG_QUALITY: 85,

  // Output format
  OUTPUT_FORMAT: 'jpeg'
};

/**
 * Get file size in bytes
 * @param {string} filePath - Path to file
 * @returns {number} File size in bytes, or 0 if file doesn't exist
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    console.warn(`[imagePreprocessor] Could not get file size: ${filePath}`);
    return 0;
  }
}

/**
 * Format file size for logging
 * @param {number} bytes - Size in bytes
 * @returns {string} Human-readable size (e.g., "5.2MB")
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Get or create the processed images directory
 * @param {string} originalPath - Path to original image
 * @returns {string} Path to processed directory
 */
function getProcessedDir(originalPath) {
  const dir = path.dirname(originalPath);
  const processedDir = path.join(dir, '.processed');

  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }

  return processedDir;
}

/**
 * Check if a processed version already exists and is valid
 * @param {string} processedPath - Path to processed image
 * @param {string} originalPath - Path to original image
 * @returns {boolean} True if processed version exists and is newer than original
 */
function hasValidProcessedVersion(processedPath, originalPath) {
  if (!fs.existsSync(processedPath)) return false;

  try {
    const originalStats = fs.statSync(originalPath);
    const processedStats = fs.statSync(processedPath);

    // Processed version is valid if it's newer than original
    return processedStats.mtimeMs >= originalStats.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Preprocess a single image for Claude SDK analysis
 *
 * @param {string} imagePath - Path to original image
 * @param {Object} options - Processing options
 * @param {number} [options.maxDimension] - Max width/height (default: 1568)
 * @param {number} [options.quality] - JPEG quality (default: 85)
 * @param {boolean} [options.force] - Force reprocessing even if cached
 * @returns {Promise<Object>} Result with { path, originalSize, processedSize, wasProcessed }
 */
async function preprocessImage(imagePath, options = {}) {
  const {
    maxDimension = CONFIG.MAX_DIMENSION,
    quality = CONFIG.JPEG_QUALITY,
    force = false
  } = options;

  const originalSize = getFileSize(imagePath);
  const filename = path.basename(imagePath);
  const filenameWithoutExt = path.parse(filename).name;

  // Check if processing is needed
  if (originalSize <= CONFIG.NEEDS_PROCESSING_SIZE && !force) {
    console.log(`[imagePreprocessor] ${filename}: ${formatFileSize(originalSize)} - no processing needed`);
    return {
      path: imagePath,
      originalSize,
      processedSize: originalSize,
      wasProcessed: false
    };
  }

  // Set up processed path
  const processedDir = getProcessedDir(imagePath);
  const processedFilename = `${filenameWithoutExt}.jpg`;
  const processedPath = path.join(processedDir, processedFilename);

  // Check for cached version
  if (!force && hasValidProcessedVersion(processedPath, imagePath)) {
    const processedSize = getFileSize(processedPath);
    console.log(`[imagePreprocessor] ${filename}: using cached version (${formatFileSize(processedSize)})`);
    return {
      path: processedPath,
      originalSize,
      processedSize,
      wasProcessed: true,
      cached: true
    };
  }

  // Process the image
  console.log(`[imagePreprocessor] ${filename}: processing ${formatFileSize(originalSize)}...`);

  try {
    const startTime = Date.now();

    await sharp(imagePath)
      .resize(maxDimension, maxDimension, {
        fit: 'inside',           // Maintain aspect ratio, fit within bounds
        withoutEnlargement: true // Don't upscale small images
      })
      .jpeg({
        quality,
        mozjpeg: true  // Better compression
      })
      .toFile(processedPath);

    const processedSize = getFileSize(processedPath);
    const elapsed = Date.now() - startTime;
    const reduction = ((1 - processedSize / originalSize) * 100).toFixed(1);

    console.log(`[imagePreprocessor] ${filename}: ${formatFileSize(originalSize)} -> ${formatFileSize(processedSize)} (${reduction}% reduction) in ${elapsed}ms`);

    return {
      path: processedPath,
      originalSize,
      processedSize,
      wasProcessed: true,
      processingTimeMs: elapsed,
      reduction: parseFloat(reduction)
    };

  } catch (error) {
    console.error(`[imagePreprocessor] ${filename}: processing failed - ${error.message}`);
    // Return original path on failure
    return {
      path: imagePath,
      originalSize,
      processedSize: originalSize,
      wasProcessed: false,
      error: error.message
    };
  }
}

/**
 * Preprocess multiple images in parallel with concurrency limit
 *
 * @param {string[]} imagePaths - Array of image paths
 * @param {Object} options - Processing options (same as preprocessImage)
 * @param {number} [options.concurrency] - Max parallel operations (default: 8)
 * @returns {Promise<Object[]>} Array of processing results
 */
async function preprocessImages(imagePaths, options = {}) {
  const { concurrency = 8, ...imageOptions } = options;

  console.log(`[imagePreprocessor] Processing ${imagePaths.length} images (concurrency: ${concurrency})`);
  const startTime = Date.now();

  // Simple concurrency limiter
  let running = 0;
  const queue = [];
  const results = [];

  const processWithLimit = async (imagePath, index) => {
    // Wait if at limit
    if (running >= concurrency) {
      await new Promise(resolve => queue.push(resolve));
    }
    running++;

    try {
      const result = await preprocessImage(imagePath, imageOptions);
      results[index] = result;
    } finally {
      running--;
      if (queue.length > 0) {
        const next = queue.shift();
        next();
      }
    }
  };

  // Process all images
  await Promise.all(imagePaths.map((path, index) => processWithLimit(path, index)));

  const elapsed = Date.now() - startTime;
  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalProcessed = results.reduce((sum, r) => sum + r.processedSize, 0);
  const processed = results.filter(r => r.wasProcessed).length;

  console.log(`[imagePreprocessor] Complete: ${processed}/${imagePaths.length} processed, ` +
    `${formatFileSize(totalOriginal)} -> ${formatFileSize(totalProcessed)} in ${elapsed}ms`);

  return results;
}

/**
 * Clean up processed images directory
 *
 * @param {string} photosDir - Directory containing photos
 * @returns {Promise<number>} Number of files deleted
 */
async function cleanupProcessedImages(photosDir) {
  const processedDir = path.join(photosDir, '.processed');

  if (!fs.existsSync(processedDir)) {
    return 0;
  }

  const files = fs.readdirSync(processedDir);
  for (const file of files) {
    fs.unlinkSync(path.join(processedDir, file));
  }

  fs.rmdirSync(processedDir);
  console.log(`[imagePreprocessor] Cleaned up ${files.length} processed images`);
  return files.length;
}

module.exports = {
  preprocessImage,
  preprocessImages,
  cleanupProcessedImages,
  getFileSize,
  formatFileSize,
  CONFIG
};
