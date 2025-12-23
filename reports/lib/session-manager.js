/**
 * SessionManager - File-based state management with versioning
 *
 * Derives session state from file existence in data/{sessionId}/.
 * Tracks version history for checkpoint edits.
 *
 * Directory structure:
 *   data/{sessionId}/
 *   ├── inputs/          # User-provided config
 *   ├── fetched/         # Raw Notion data
 *   ├── analysis/        # Claude-generated analysis
 *   ├── summaries/       # Checkpoint review files
 *   ├── output/          # Final article
 *   ├── assets/          # Downloaded images
 *   │   ├── notion/      # Notion document images
 *   │   └── photos/      # Session photos
 *   └── versions/        # Checkpoint version history
 *       └── manifest.json
 */

const fs = require('fs').promises;
const path = require('path');

// Phase to file mapping for state derivation
const PHASE_FILE_MAP = {
  '1.1': 'inputs/session-config.json',
  '1.2': 'inputs/director-notes.json',
  '1.3': 'fetched/tokens.json',
  '1.4': 'inputs/selected-paper-evidence.json',
  '1.5': 'assets/notion',  // Directory existence
  '1.6': 'analysis/image-analyses-combined.json',
  '1.7': 'inputs/character-ids.json',
  '1.8': 'analysis/evidence-bundle.json',
  '2': 'analysis/arc-analysis.json',
  '3': 'analysis/article-outline.json',
  '4': 'output/article.html',
  '5': 'output/validation-results.json'
};

// Checkpoint phases that support editing
const CHECKPOINT_PHASES = ['1.4', '1.7', '1.8', '2', '3'];

class SessionManager {
  /**
   * @param {string} dataDir - Path to data directory (e.g., ./data)
   */
  constructor(dataDir) {
    this.dataDir = dataDir;
  }

  /**
   * Get path to a session directory
   * @param {string} sessionId - Session ID (usually date like 20251221)
   * @returns {string} - Absolute path
   */
  getSessionPath(sessionId) {
    return path.join(this.dataDir, sessionId);
  }

  /**
   * Check if a file or directory exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   */
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all session directories
   * @returns {Promise<string[]>} - Array of session IDs
   */
  async listSessions() {
    try {
      const entries = await fs.readdir(this.dataDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .filter(name => /^\d{8}$/.test(name))  // Only YYYYMMDD format
        .sort()
        .reverse();  // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Scan files in a session directory
   * @param {string} sessionId - Session ID
   * @returns {Promise<string[]>} - Array of relative file paths
   */
  async scanFiles(sessionId) {
    const sessionPath = this.getSessionPath(sessionId);
    const files = [];

    const scan = async (dir, prefix = '') => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await scan(path.join(dir, entry.name), relativePath);
          } else {
            files.push(relativePath);
          }
        }
      } catch {
        // Directory doesn't exist
      }
    };

    await scan(sessionPath);
    return files;
  }

  /**
   * Infer current phase from existing files
   * @param {string[]} files - Array of relative file paths
   * @returns {string} - Current phase (e.g., "1.3")
   */
  inferPhase(files) {
    const fileSet = new Set(files);

    // Check phases in reverse order to find highest completed
    const phases = Object.keys(PHASE_FILE_MAP).reverse();

    for (const phase of phases) {
      const required = PHASE_FILE_MAP[phase];
      if (fileSet.has(required) || files.some(f => f.startsWith(required))) {
        return phase;
      }
    }

    return '0';  // No phase completed
  }

  /**
   * Derive session state from file existence
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} - Session state
   */
  async getSessionState(sessionId) {
    const sessionPath = this.getSessionPath(sessionId);
    const exists = await this.exists(sessionPath);

    if (!exists) {
      return null;
    }

    const files = await this.scanFiles(sessionId);
    const phase = this.inferPhase(files);
    const versions = await this.getVersionHistory(sessionId);

    // Categorize files by directory
    const categorized = {
      inputs: files.filter(f => f.startsWith('inputs/')),
      fetched: files.filter(f => f.startsWith('fetched/')),
      analysis: files.filter(f => f.startsWith('analysis/')),
      summaries: files.filter(f => f.startsWith('summaries/')),
      output: files.filter(f => f.startsWith('output/')),
      assets: files.filter(f => f.startsWith('assets/'))
    };

    // Check specific file existence for quick state queries
    const state = {
      sessionId,
      phase,
      files: categorized,
      hasSessionConfig: files.includes('inputs/session-config.json'),
      hasDirectorNotes: files.includes('inputs/director-notes.json'),
      hasTokens: files.includes('fetched/tokens.json'),
      hasPaperEvidence: files.includes('fetched/paper-evidence.json'),
      hasSelectedEvidence: files.includes('inputs/selected-paper-evidence.json'),
      hasEvidenceBundle: files.includes('analysis/evidence-bundle.json'),
      hasArcAnalysis: files.includes('analysis/arc-analysis.json'),
      hasOutline: files.includes('analysis/article-outline.json'),
      hasArticle: files.includes('output/article.html'),
      versions: versions
    };

    return state;
  }

  /**
   * Create a new session directory structure
   * @param {string} sessionId - Session ID (YYYYMMDD format)
   * @returns {Promise<string>} - Session path
   */
  async createSession(sessionId) {
    const sessionPath = this.getSessionPath(sessionId);

    // Create directory structure
    const dirs = [
      'inputs',
      'fetched',
      'analysis',
      'summaries',
      'output',
      'assets/notion',
      'assets/photos',
      'versions'
    ];

    for (const dir of dirs) {
      await fs.mkdir(path.join(sessionPath, dir), { recursive: true });
    }

    // Initialize version manifest
    await this.initializeManifest(sessionId);

    return sessionPath;
  }

  /**
   * Initialize version manifest for a session
   * @param {string} sessionId - Session ID
   */
  async initializeManifest(sessionId) {
    const manifestPath = path.join(this.getSessionPath(sessionId), 'versions', 'manifest.json');

    const manifest = {
      sessionId,
      createdAt: new Date().toISOString(),
      currentVersion: 0,
      versions: []
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Load version manifest
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} - Manifest object
   */
  async loadManifest(sessionId) {
    const manifestPath = path.join(this.getSessionPath(sessionId), 'versions', 'manifest.json');

    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      return JSON.parse(content);
    } catch {
      // Return empty manifest if not found
      return {
        sessionId,
        createdAt: new Date().toISOString(),
        currentVersion: 0,
        versions: []
      };
    }
  }

  /**
   * Save version manifest
   * @param {string} sessionId - Session ID
   * @param {Object} manifest - Manifest object
   */
  async saveManifest(sessionId, manifest) {
    const manifestPath = path.join(this.getSessionPath(sessionId), 'versions', 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Get version history for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object[]>} - Array of version entries
   */
  async getVersionHistory(sessionId) {
    const manifest = await this.loadManifest(sessionId);
    return manifest.versions || [];
  }

  /**
   * Save file with version tracking
   *
   * @param {string} sessionId - Session ID
   * @param {string} phase - Phase number (e.g., "1.4")
   * @param {string} filename - Relative file path (e.g., "inputs/session-config.json")
   * @param {Object|string} data - Data to save (object will be JSON stringified)
   * @param {string} action - Action type: "created", "edited", "rollback"
   * @param {Object} changes - Optional change summary for edits
   * @returns {Promise<number>} - New version number
   */
  async saveWithVersion(sessionId, phase, filename, data, action = 'created', changes = null) {
    const manifest = await this.loadManifest(sessionId);
    const version = manifest.currentVersion + 1;

    // Prepare data string
    const dataString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    // Only create snapshots for checkpoint phases
    if (CHECKPOINT_PHASES.includes(phase)) {
      // Create snapshot filename
      const baseName = path.basename(filename, '.json');
      const snapshotName = `v${String(version).padStart(3, '0')}_${phase}_${baseName}.json`;
      const snapshotPath = path.join(this.getSessionPath(sessionId), 'versions', snapshotName);

      // Save snapshot
      await fs.writeFile(snapshotPath, dataString);

      // Add version entry
      const entry = {
        version,
        phase,
        file: filename,
        timestamp: new Date().toISOString(),
        action,
        snapshot: snapshotName
      };

      if (changes) {
        entry.changes = changes;
      }

      manifest.versions.push(entry);
    }

    // Update current version
    manifest.currentVersion = version;
    await this.saveManifest(sessionId, manifest);

    // Save current file
    const filePath = path.join(this.getSessionPath(sessionId), filename);
    const fileDir = path.dirname(filePath);
    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, dataString);

    return version;
  }

  /**
   * Save file without version tracking (for non-checkpoint files)
   *
   * @param {string} sessionId - Session ID
   * @param {string} filename - Relative file path
   * @param {Object|string} data - Data to save
   */
  async saveFile(sessionId, filename, data) {
    const filePath = path.join(this.getSessionPath(sessionId), filename);
    const fileDir = path.dirname(filePath);
    await fs.mkdir(fileDir, { recursive: true });

    const dataString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, dataString);
  }

  /**
   * Read a file from session
   *
   * @param {string} sessionId - Session ID
   * @param {string} filename - Relative file path
   * @param {boolean} parseJson - Whether to parse as JSON
   * @returns {Promise<Object|string|null>}
   */
  async readFile(sessionId, filename, parseJson = true) {
    const filePath = path.join(this.getSessionPath(sessionId), filename);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      return parseJson ? JSON.parse(content) : content;
    } catch {
      return null;
    }
  }

  /**
   * Load a version snapshot
   *
   * @param {string} sessionId - Session ID
   * @param {string} snapshotName - Snapshot filename
   * @returns {Promise<Object>}
   */
  async loadSnapshot(sessionId, snapshotName) {
    const snapshotPath = path.join(this.getSessionPath(sessionId), 'versions', snapshotName);
    const content = await fs.readFile(snapshotPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Rollback to a previous version
   *
   * @param {string} sessionId - Session ID
   * @param {number} targetVersion - Version number to rollback to
   * @returns {Promise<number>} - New version number after rollback
   */
  async rollback(sessionId, targetVersion) {
    const manifest = await this.loadManifest(sessionId);
    const entry = manifest.versions.find(v => v.version === targetVersion);

    if (!entry) {
      throw new Error(`Version ${targetVersion} not found`);
    }

    // Load the snapshot
    const data = await this.loadSnapshot(sessionId, entry.snapshot);

    // Save as new version with rollback action
    const newVersion = await this.saveWithVersion(
      sessionId,
      entry.phase,
      entry.file,
      data,
      'rollback',
      { rolledBackFrom: manifest.currentVersion, rolledBackTo: targetVersion }
    );

    return newVersion;
  }

  /**
   * Delete a session
   *
   * @param {string} sessionId - Session ID
   */
  async deleteSession(sessionId) {
    const sessionPath = this.getSessionPath(sessionId);
    await fs.rm(sessionPath, { recursive: true, force: true });
  }
}

/**
 * Factory function for creating SessionManager with default data directory
 * @param {string} customDataDir - Optional custom data directory
 * @returns {SessionManager}
 */
function createSessionManager(customDataDir = null) {
  const dataDir = customDataDir || path.resolve(__dirname, '..', 'data');
  return new SessionManager(dataDir);
}

module.exports = {
  SessionManager,
  createSessionManager,
  PHASE_FILE_MAP,
  CHECKPOINT_PHASES
};

// Self-test when run directly
if (require.main === module) {
  (async () => {
    console.log('SessionManager Self-Test\n');

    const manager = createSessionManager();
    console.log(`Data directory: ${manager.dataDir}\n`);

    // List existing sessions
    const sessions = await manager.listSessions();
    console.log(`Found ${sessions.length} sessions:`, sessions.slice(0, 5));

    if (sessions.length > 0) {
      // Get state for first session
      const sessionId = sessions[0];
      console.log(`\nSession state for ${sessionId}:`);
      const state = await manager.getSessionState(sessionId);
      console.log(`  Phase: ${state.phase}`);
      console.log(`  Has session config: ${state.hasSessionConfig}`);
      console.log(`  Has tokens: ${state.hasTokens}`);
      console.log(`  Has evidence bundle: ${state.hasEvidenceBundle}`);
      console.log(`  Has article: ${state.hasArticle}`);
      console.log(`  Versions: ${state.versions.length}`);

      // Show file counts
      console.log(`\n  File counts:`);
      Object.entries(state.files).forEach(([dir, files]) => {
        console.log(`    ${dir}: ${files.length} files`);
      });
    }

    console.log('\nSelf-test complete.');
  })();
}
