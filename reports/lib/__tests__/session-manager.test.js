/**
 * SessionManager Unit Tests
 *
 * Uses real filesystem operations against temp directories for integration testing.
 */

const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const {
  SessionManager,
  createSessionManager,
  PHASE_FILE_MAP,
  CHECKPOINT_PHASES
} = require('../session-manager');

describe('SessionManager', () => {
  let testDir;
  let manager;

  beforeEach(async () => {
    // Create unique temp directory for each test
    testDir = path.join(os.tmpdir(), `session-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
    manager = new SessionManager(testDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create instance with data directory', () => {
      expect(manager.dataDir).toBe(testDir);
    });
  });

  describe('getSessionPath', () => {
    it('should return correct path for session', () => {
      const sessionPath = manager.getSessionPath('20251221');
      expect(sessionPath).toBe(path.join(testDir, '20251221'));
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'content');
      expect(await manager.exists(testFile)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      expect(await manager.exists(path.join(testDir, 'nonexistent.txt'))).toBe(false);
    });

    it('should return true for existing directory', async () => {
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir);
      expect(await manager.exists(subDir)).toBe(true);
    });
  });

  describe('listSessions', () => {
    it('should return empty array for empty directory', async () => {
      const sessions = await manager.listSessions();
      expect(sessions).toEqual([]);
    });

    it('should list sessions in YYYYMMDD format', async () => {
      await fs.mkdir(path.join(testDir, '20251221'));
      await fs.mkdir(path.join(testDir, '20251215'));
      await fs.mkdir(path.join(testDir, '20251218'));

      const sessions = await manager.listSessions();

      expect(sessions).toEqual(['20251221', '20251218', '20251215']);
    });

    it('should ignore non-date directories', async () => {
      await fs.mkdir(path.join(testDir, '20251221'));
      await fs.mkdir(path.join(testDir, 'invalid-name'));
      await fs.mkdir(path.join(testDir, '2025122'));  // Too short

      const sessions = await manager.listSessions();

      expect(sessions).toEqual(['20251221']);
    });

    it('should ignore files (not directories)', async () => {
      await fs.mkdir(path.join(testDir, '20251221'));
      await fs.writeFile(path.join(testDir, '20251220'), 'file not dir');

      const sessions = await manager.listSessions();

      expect(sessions).toEqual(['20251221']);
    });

    it('should sort by most recent first', async () => {
      await fs.mkdir(path.join(testDir, '20251201'));
      await fs.mkdir(path.join(testDir, '20251231'));
      await fs.mkdir(path.join(testDir, '20251215'));

      const sessions = await manager.listSessions();

      expect(sessions).toEqual(['20251231', '20251215', '20251201']);
    });
  });

  describe('scanFiles', () => {
    it('should return empty array for non-existing session', async () => {
      const files = await manager.scanFiles('nonexistent');
      expect(files).toEqual([]);
    });

    it('should scan all files in session directory', async () => {
      const sessionPath = path.join(testDir, '20251221');
      await fs.mkdir(path.join(sessionPath, 'inputs'), { recursive: true });
      await fs.mkdir(path.join(sessionPath, 'analysis'), { recursive: true });
      await fs.writeFile(path.join(sessionPath, 'inputs', 'config.json'), '{}');
      await fs.writeFile(path.join(sessionPath, 'analysis', 'results.json'), '{}');

      const files = await manager.scanFiles('20251221');

      expect(files).toContain('inputs/config.json');
      expect(files).toContain('analysis/results.json');
    });

    it('should handle nested directories', async () => {
      const sessionPath = path.join(testDir, '20251221');
      await fs.mkdir(path.join(sessionPath, 'assets', 'notion'), { recursive: true });
      await fs.writeFile(path.join(sessionPath, 'assets', 'notion', 'image.png'), 'img');

      const files = await manager.scanFiles('20251221');

      expect(files).toContain('assets/notion/image.png');
    });
  });

  describe('inferPhase', () => {
    it('should return 0 for empty files array', () => {
      const phase = manager.inferPhase([]);
      expect(phase).toBe('0');
    });

    it('should return correct phase based on files', () => {
      expect(manager.inferPhase(['inputs/session-config.json'])).toBe('1.1');
      expect(manager.inferPhase(['inputs/director-notes.json'])).toBe('1.2');
      expect(manager.inferPhase(['fetched/tokens.json'])).toBe('1.3');
      expect(manager.inferPhase(['analysis/evidence-bundle.json'])).toBe('1.8');
      expect(manager.inferPhase(['output/article.html'])).toBe('4');
    });

    it('should return highest phase when multiple files exist', () => {
      const files = [
        'inputs/session-config.json',
        'inputs/director-notes.json',
        'fetched/tokens.json',
        'analysis/evidence-bundle.json'
      ];
      expect(manager.inferPhase(files)).toBe('1.8');
    });

    it('should detect directory-based phases', () => {
      const files = [
        'assets/notion/image1.png',
        'assets/notion/image2.jpg'
      ];
      expect(manager.inferPhase(files)).toBe('1.5');
    });
  });

  describe('createSession', () => {
    it('should create session directory structure', async () => {
      const sessionPath = await manager.createSession('20251221');

      expect(await manager.exists(path.join(sessionPath, 'inputs'))).toBe(true);
      expect(await manager.exists(path.join(sessionPath, 'fetched'))).toBe(true);
      expect(await manager.exists(path.join(sessionPath, 'analysis'))).toBe(true);
      expect(await manager.exists(path.join(sessionPath, 'summaries'))).toBe(true);
      expect(await manager.exists(path.join(sessionPath, 'output'))).toBe(true);
      expect(await manager.exists(path.join(sessionPath, 'assets/notion'))).toBe(true);
      expect(await manager.exists(path.join(sessionPath, 'assets/photos'))).toBe(true);
      expect(await manager.exists(path.join(sessionPath, 'versions'))).toBe(true);
    });

    it('should initialize version manifest', async () => {
      await manager.createSession('20251221');

      const manifest = await manager.loadManifest('20251221');

      expect(manifest.sessionId).toBe('20251221');
      expect(manifest.currentVersion).toBe(0);
      expect(manifest.versions).toEqual([]);
      expect(manifest.createdAt).toBeDefined();
    });
  });

  describe('getSessionState', () => {
    it('should return null for non-existing session', async () => {
      const state = await manager.getSessionState('nonexistent');
      expect(state).toBeNull();
    });

    it('should return complete state for existing session', async () => {
      await manager.createSession('20251221');
      await manager.saveFile('20251221', 'inputs/session-config.json', { test: true });
      await manager.saveFile('20251221', 'fetched/tokens.json', { tokens: [] });

      const state = await manager.getSessionState('20251221');

      expect(state.sessionId).toBe('20251221');
      expect(state.phase).toBe('1.3');
      expect(state.hasSessionConfig).toBe(true);
      expect(state.hasTokens).toBe(true);
      expect(state.hasArticle).toBe(false);
      expect(state.files.inputs).toContain('inputs/session-config.json');
      expect(state.files.fetched).toContain('fetched/tokens.json');
    });

    it('should categorize files correctly', async () => {
      await manager.createSession('20251221');
      await manager.saveFile('20251221', 'inputs/config.json', {});
      await manager.saveFile('20251221', 'fetched/data.json', {});
      await manager.saveFile('20251221', 'analysis/results.json', {});
      await manager.saveFile('20251221', 'summaries/summary.json', {});
      await manager.saveFile('20251221', 'output/article.html', '<html>');

      const state = await manager.getSessionState('20251221');

      expect(state.files.inputs.length).toBe(1);
      expect(state.files.fetched.length).toBe(1);
      expect(state.files.analysis.length).toBe(1);
      expect(state.files.summaries.length).toBe(1);
      expect(state.files.output.length).toBe(1);
    });
  });

  describe('saveFile', () => {
    it('should save JSON data', async () => {
      await manager.createSession('20251221');
      const data = { key: 'value', nested: { a: 1 } };

      await manager.saveFile('20251221', 'inputs/test.json', data);

      const saved = await manager.readFile('20251221', 'inputs/test.json');
      expect(saved).toEqual(data);
    });

    it('should save string data', async () => {
      await manager.createSession('20251221');

      await manager.saveFile('20251221', 'output/article.html', '<html></html>');

      const saved = await manager.readFile('20251221', 'output/article.html', false);
      expect(saved).toBe('<html></html>');
    });

    it('should create nested directories', async () => {
      await manager.createSession('20251221');

      await manager.saveFile('20251221', 'deep/nested/path/file.json', { test: true });

      const saved = await manager.readFile('20251221', 'deep/nested/path/file.json');
      expect(saved.test).toBe(true);
    });
  });

  describe('readFile', () => {
    it('should return null for non-existing file', async () => {
      await manager.createSession('20251221');
      const result = await manager.readFile('20251221', 'nonexistent.json');
      expect(result).toBeNull();
    });

    it('should parse JSON by default', async () => {
      await manager.createSession('20251221');
      await manager.saveFile('20251221', 'test.json', { a: 1 });

      const result = await manager.readFile('20251221', 'test.json');

      expect(result).toEqual({ a: 1 });
    });

    it('should return raw string when parseJson is false', async () => {
      await manager.createSession('20251221');
      await manager.saveFile('20251221', 'test.txt', 'plain text');

      const result = await manager.readFile('20251221', 'test.txt', false);

      expect(result).toBe('plain text');
    });
  });

  describe('saveWithVersion', () => {
    it('should increment version number', async () => {
      await manager.createSession('20251221');

      const v1 = await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', { items: [] }, 'created');
      const v2 = await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', { items: [1] }, 'edited');

      expect(v1).toBe(1);
      expect(v2).toBe(2);
    });

    it('should create snapshot for checkpoint phases', async () => {
      await manager.createSession('20251221');

      await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', { items: [] }, 'created');

      const versions = path.join(testDir, '20251221', 'versions');
      const files = await fs.readdir(versions);
      const snapshots = files.filter(f => f.startsWith('v'));

      expect(snapshots.length).toBe(1);
      expect(snapshots[0]).toMatch(/^v001_1\.4_selected-paper-evidence\.json$/);
    });

    it('should NOT create snapshot for non-checkpoint phases', async () => {
      await manager.createSession('20251221');

      // Phase 1.3 is NOT a checkpoint phase
      await manager.saveWithVersion('20251221', '1.3', 'fetched/tokens.json', { tokens: [] }, 'created');

      const versions = path.join(testDir, '20251221', 'versions');
      const files = await fs.readdir(versions);
      const snapshots = files.filter(f => f.startsWith('v'));

      expect(snapshots.length).toBe(0);
    });

    it('should record changes in manifest', async () => {
      await manager.createSession('20251221');

      await manager.saveWithVersion(
        '20251221',
        '1.4',
        'inputs/selected-paper-evidence.json',
        { items: [1, 2] },
        'edited',
        { added: 2, removed: 0 }
      );

      const manifest = await manager.loadManifest('20251221');
      const entry = manifest.versions[0];

      expect(entry.action).toBe('edited');
      expect(entry.changes).toEqual({ added: 2, removed: 0 });
    });

    it('should save current file alongside snapshot', async () => {
      await manager.createSession('20251221');
      const data = { items: ['a', 'b'] };

      await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', data, 'created');

      // Current file should exist
      const current = await manager.readFile('20251221', 'inputs/selected-paper-evidence.json');
      expect(current).toEqual(data);

      // Snapshot should also exist
      const manifest = await manager.loadManifest('20251221');
      const snapshot = await manager.loadSnapshot('20251221', manifest.versions[0].snapshot);
      expect(snapshot).toEqual(data);
    });
  });

  describe('getVersionHistory', () => {
    it('should return empty array for new session', async () => {
      await manager.createSession('20251221');
      const history = await manager.getVersionHistory('20251221');
      expect(history).toEqual([]);
    });

    it('should return version entries', async () => {
      await manager.createSession('20251221');
      await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', {}, 'created');
      await manager.saveWithVersion('20251221', '2', 'analysis/arc-analysis.json', {}, 'created');

      const history = await manager.getVersionHistory('20251221');

      expect(history.length).toBe(2);
      expect(history[0].phase).toBe('1.4');
      expect(history[1].phase).toBe('2');
    });
  });

  describe('loadSnapshot', () => {
    it('should load snapshot content', async () => {
      await manager.createSession('20251221');
      const data = { evidence: ['item1', 'item2'] };
      await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', data, 'created');

      const manifest = await manager.loadManifest('20251221');
      const snapshot = await manager.loadSnapshot('20251221', manifest.versions[0].snapshot);

      expect(snapshot).toEqual(data);
    });
  });

  describe('rollback', () => {
    it('should rollback to previous version', async () => {
      await manager.createSession('20251221');

      // Create initial version
      await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', { v: 1 }, 'created');

      // Create second version
      await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', { v: 2 }, 'edited');

      // Rollback to version 1
      const newVersion = await manager.rollback('20251221', 1);

      expect(newVersion).toBe(3);

      // Current file should have v1 content
      const current = await manager.readFile('20251221', 'inputs/selected-paper-evidence.json');
      expect(current).toEqual({ v: 1 });
    });

    it('should record rollback in version history', async () => {
      await manager.createSession('20251221');
      await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', { v: 1 }, 'created');
      await manager.saveWithVersion('20251221', '1.4', 'inputs/selected-paper-evidence.json', { v: 2 }, 'edited');

      await manager.rollback('20251221', 1);

      const manifest = await manager.loadManifest('20251221');
      const lastEntry = manifest.versions[manifest.versions.length - 1];

      expect(lastEntry.action).toBe('rollback');
      expect(lastEntry.changes.rolledBackFrom).toBe(2);
      expect(lastEntry.changes.rolledBackTo).toBe(1);
    });

    it('should throw error for non-existent version', async () => {
      await manager.createSession('20251221');

      await expect(manager.rollback('20251221', 999))
        .rejects.toThrow('Version 999 not found');
    });
  });

  describe('deleteSession', () => {
    it('should delete session directory', async () => {
      await manager.createSession('20251221');
      await manager.saveFile('20251221', 'inputs/test.json', {});

      await manager.deleteSession('20251221');

      expect(await manager.exists(path.join(testDir, '20251221'))).toBe(false);
    });

    it('should handle non-existent session gracefully', async () => {
      await expect(manager.deleteSession('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('manifest operations', () => {
    it('should handle missing manifest gracefully', async () => {
      await fs.mkdir(path.join(testDir, '20251221'));

      const manifest = await manager.loadManifest('20251221');

      expect(manifest.sessionId).toBe('20251221');
      expect(manifest.currentVersion).toBe(0);
      expect(manifest.versions).toEqual([]);
    });

    it('should save and load manifest correctly', async () => {
      await manager.createSession('20251221');

      const manifest = await manager.loadManifest('20251221');
      manifest.currentVersion = 5;
      manifest.versions.push({ version: 5, phase: '2', file: 'test.json' });

      await manager.saveManifest('20251221', manifest);

      const loaded = await manager.loadManifest('20251221');
      expect(loaded.currentVersion).toBe(5);
      expect(loaded.versions.length).toBe(1);
    });
  });

  describe('createSessionManager factory', () => {
    it('should create manager with default data directory', () => {
      const manager = createSessionManager();
      expect(manager.dataDir).toContain('data');
    });

    it('should create manager with custom directory', () => {
      const manager = createSessionManager('/custom/path');
      expect(manager.dataDir).toBe('/custom/path');
    });
  });

  describe('module exports', () => {
    it('should export PHASE_FILE_MAP', () => {
      expect(PHASE_FILE_MAP).toBeDefined();
      expect(PHASE_FILE_MAP['1.1']).toBe('inputs/session-config.json');
      expect(PHASE_FILE_MAP['4']).toBe('output/article.html');
    });

    it('should export CHECKPOINT_PHASES', () => {
      expect(CHECKPOINT_PHASES).toBeDefined();
      expect(CHECKPOINT_PHASES).toContain('1.4');
      expect(CHECKPOINT_PHASES).toContain('2');
      expect(CHECKPOINT_PHASES).toContain('3');
      expect(CHECKPOINT_PHASES).not.toContain('1.3');
    });
  });
});
