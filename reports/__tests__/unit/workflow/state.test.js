/**
 * ReportStateAnnotation Unit Tests
 *
 * Tests state definition, reducers, constants, and helpers.
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const {
  ReportStateAnnotation,
  getDefaultState,
  PHASES,
  APPROVAL_TYPES,
  REVISION_CAPS,
  _testing
} = require('../../../lib/workflow/state');

describe('ReportStateAnnotation', () => {
  describe('module exports', () => {
    it('exports ReportStateAnnotation', () => {
      expect(ReportStateAnnotation).toBeDefined();
    });

    it('exports getDefaultState function', () => {
      expect(typeof getDefaultState).toBe('function');
    });

    it('exports PHASES constant', () => {
      expect(PHASES).toBeDefined();
      expect(typeof PHASES).toBe('object');
    });

    it('exports APPROVAL_TYPES constant', () => {
      expect(APPROVAL_TYPES).toBeDefined();
      expect(typeof APPROVAL_TYPES).toBe('object');
    });

    it('exports REVISION_CAPS constant (Commit 8.6)', () => {
      expect(REVISION_CAPS).toBeDefined();
      expect(typeof REVISION_CAPS).toBe('object');
    });

    it('exports _testing with reducer functions', () => {
      expect(_testing).toBeDefined();
      expect(typeof _testing.replaceReducer).toBe('function');
      expect(typeof _testing.appendReducer).toBe('function');
      expect(typeof _testing.mergeReducer).toBe('function');
      expect(typeof _testing.appendSingleReducer).toBe('function');
    });
  });

  describe('replaceReducer', () => {
    const { replaceReducer } = _testing;

    it('replaces old value with new value', () => {
      expect(replaceReducer('old', 'new')).toBe('new');
    });

    it('preserves old value when new is null', () => {
      expect(replaceReducer('old', null)).toBe('old');
    });

    it('preserves old value when new is undefined', () => {
      expect(replaceReducer('old', undefined)).toBe('old');
    });

    it('allows replacing with falsy values except null/undefined', () => {
      expect(replaceReducer('old', 0)).toBe(0);
      expect(replaceReducer('old', '')).toBe('');
      expect(replaceReducer('old', false)).toBe(false);
    });

    it('allows replacing null with a value', () => {
      expect(replaceReducer(null, 'new')).toBe('new');
    });

    it('handles object replacement', () => {
      const oldObj = { a: 1 };
      const newObj = { b: 2 };
      expect(replaceReducer(oldObj, newObj)).toBe(newObj);
    });

    it('handles array replacement', () => {
      const oldArr = [1, 2];
      const newArr = [3, 4];
      expect(replaceReducer(oldArr, newArr)).toBe(newArr);
    });
  });

  describe('appendReducer', () => {
    const { appendReducer } = _testing;

    it('appends new items to existing array', () => {
      expect(appendReducer([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
    });

    it('handles null old value', () => {
      expect(appendReducer(null, [1, 2])).toEqual([1, 2]);
    });

    it('handles undefined old value', () => {
      expect(appendReducer(undefined, [1, 2])).toEqual([1, 2]);
    });

    it('handles null new value', () => {
      expect(appendReducer([1, 2], null)).toEqual([1, 2]);
    });

    it('handles undefined new value', () => {
      expect(appendReducer([1, 2], undefined)).toEqual([1, 2]);
    });

    it('handles both null', () => {
      expect(appendReducer(null, null)).toEqual([]);
    });

    it('returns new array instance (immutable)', () => {
      const oldArr = [1, 2];
      const newArr = [3, 4];
      const result = appendReducer(oldArr, newArr);
      expect(result).not.toBe(oldArr);
      expect(result).not.toBe(newArr);
    });

    it('appends objects correctly', () => {
      const result = appendReducer(
        [{ id: 1, msg: 'first' }],
        [{ id: 2, msg: 'second' }]
      );
      expect(result).toEqual([
        { id: 1, msg: 'first' },
        { id: 2, msg: 'second' }
      ]);
    });
  });

  describe('mergeReducer (Commit 8.6)', () => {
    const { mergeReducer } = _testing;

    it('merges new properties into existing object', () => {
      expect(mergeReducer({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it('overwrites existing properties with new values', () => {
      expect(mergeReducer({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    it('handles null old value', () => {
      expect(mergeReducer(null, { a: 1 })).toEqual({ a: 1 });
    });

    it('handles undefined old value', () => {
      expect(mergeReducer(undefined, { a: 1 })).toEqual({ a: 1 });
    });

    it('handles null new value', () => {
      expect(mergeReducer({ a: 1 }, null)).toEqual({ a: 1 });
    });

    it('handles undefined new value', () => {
      expect(mergeReducer({ a: 1 }, undefined)).toEqual({ a: 1 });
    });

    it('handles both null', () => {
      expect(mergeReducer(null, null)).toEqual({});
    });

    it('returns new object instance (immutable)', () => {
      const oldObj = { a: 1 };
      const newObj = { b: 2 };
      const result = mergeReducer(oldObj, newObj);
      expect(result).not.toBe(oldObj);
      expect(result).not.toBe(newObj);
    });
  });

  describe('appendSingleReducer (Commit 8.6)', () => {
    const { appendSingleReducer } = _testing;

    it('appends single item to existing array', () => {
      expect(appendSingleReducer([1, 2], 3)).toEqual([1, 2, 3]);
    });

    it('handles null old value', () => {
      expect(appendSingleReducer(null, 1)).toEqual([1]);
    });

    it('handles undefined old value', () => {
      expect(appendSingleReducer(undefined, 1)).toEqual([1]);
    });

    it('returns unchanged array when new value is null', () => {
      expect(appendSingleReducer([1, 2], null)).toEqual([1, 2]);
    });

    it('returns unchanged array when new value is undefined', () => {
      expect(appendSingleReducer([1, 2], undefined)).toEqual([1, 2]);
    });

    it('handles empty array with null new value', () => {
      expect(appendSingleReducer([], null)).toEqual([]);
    });

    it('handles null old value with null new value', () => {
      expect(appendSingleReducer(null, null)).toEqual([]);
    });

    it('returns new array instance (immutable)', () => {
      const oldArr = [1, 2];
      const result = appendSingleReducer(oldArr, 3);
      expect(result).not.toBe(oldArr);
    });

    it('appends object correctly', () => {
      const result = appendSingleReducer(
        [{ phase: 'arcs', ready: true }],
        { phase: 'outline', ready: false }
      );
      expect(result).toEqual([
        { phase: 'arcs', ready: true },
        { phase: 'outline', ready: false }
      ]);
    });
  });

  describe('getDefaultState', () => {
    let defaultState;

    beforeEach(() => {
      defaultState = getDefaultState();
    });

    it('returns an object', () => {
      expect(typeof defaultState).toBe('object');
      expect(defaultState).not.toBeNull();
    });

    it('includes all 30 state fields (Commit 8.6)', () => {
      const expectedFields = [
        // Session
        'sessionId',
        'theme',
        // Input data
        'sessionConfig',
        'directorNotes',
        'playerFocus',
        // Fetched data
        'memoryTokens',
        'paperEvidence',
        'sessionPhotos',
        // Photo analysis (Commit 8.6)
        'photoAnalyses',
        'characterIdMappings',
        // Preprocessed data (Commit 8.5)
        'preprocessedEvidence',
        // Curated data
        'evidenceBundle',
        // Arc specialists (Commit 8.6)
        'specialistAnalyses',
        // Analysis results
        'narrativeArcs',
        'selectedArcs',
        '_arcAnalysisCache',
        // Evaluation (Commit 8.6)
        'evaluationHistory',
        // Generation outputs
        'outline',
        'contentBundle',
        // Supervisor (Commit 8.6)
        'supervisorNarrativeCompass',
        // Final outputs
        'assembledHtml',
        'validationResults',
        // Control flow
        'currentPhase',
        'voiceRevisionCount',  // @deprecated
        // Revision counters (Commit 8.6)
        'arcRevisionCount',
        'outlineRevisionCount',
        'articleRevisionCount',
        // Error handling
        'errors',
        // Human approval
        'awaitingApproval',
        'approvalType'
      ];

      expect(Object.keys(defaultState).sort()).toEqual(expectedFields.sort());
    });

    describe('session identification defaults', () => {
      it('sessionId defaults to null', () => {
        expect(defaultState.sessionId).toBeNull();
      });

      it('theme defaults to journalist', () => {
        expect(defaultState.theme).toBe('journalist');
      });
    });

    describe('input data defaults', () => {
      it('sessionConfig defaults to empty object', () => {
        expect(defaultState.sessionConfig).toEqual({});
      });

      it('directorNotes defaults to empty object', () => {
        expect(defaultState.directorNotes).toEqual({});
      });

      it('playerFocus defaults to empty object', () => {
        expect(defaultState.playerFocus).toEqual({});
      });
    });

    describe('fetched data defaults', () => {
      it('memoryTokens defaults to empty array', () => {
        expect(defaultState.memoryTokens).toEqual([]);
      });

      it('paperEvidence defaults to empty array', () => {
        expect(defaultState.paperEvidence).toEqual([]);
      });

      it('sessionPhotos defaults to empty array', () => {
        expect(defaultState.sessionPhotos).toEqual([]);
      });
    });

    describe('photo analysis defaults (Commit 8.6)', () => {
      it('photoAnalyses defaults to null', () => {
        expect(defaultState.photoAnalyses).toBeNull();
      });

      it('characterIdMappings defaults to null', () => {
        expect(defaultState.characterIdMappings).toBeNull();
      });
    });

    describe('specialist analysis defaults (Commit 8.6)', () => {
      it('specialistAnalyses defaults to empty object', () => {
        expect(defaultState.specialistAnalyses).toEqual({});
      });
    });

    describe('evaluation defaults (Commit 8.6)', () => {
      it('evaluationHistory defaults to empty array', () => {
        expect(defaultState.evaluationHistory).toEqual([]);
      });
    });

    describe('supervisor defaults (Commit 8.6)', () => {
      it('supervisorNarrativeCompass defaults to null', () => {
        expect(defaultState.supervisorNarrativeCompass).toBeNull();
      });
    });

    describe('revision counter defaults (Commit 8.6)', () => {
      it('arcRevisionCount defaults to 0', () => {
        expect(defaultState.arcRevisionCount).toBe(0);
      });

      it('outlineRevisionCount defaults to 0', () => {
        expect(defaultState.outlineRevisionCount).toBe(0);
      });

      it('articleRevisionCount defaults to 0', () => {
        expect(defaultState.articleRevisionCount).toBe(0);
      });
    });

    describe('curated/analysis data defaults', () => {
      it('evidenceBundle defaults to null', () => {
        expect(defaultState.evidenceBundle).toBeNull();
      });

      it('narrativeArcs defaults to empty array', () => {
        expect(defaultState.narrativeArcs).toEqual([]);
      });

      it('selectedArcs defaults to empty array', () => {
        expect(defaultState.selectedArcs).toEqual([]);
      });

      it('_arcAnalysisCache defaults to null', () => {
        expect(defaultState._arcAnalysisCache).toBeNull();
      });
    });

    describe('generation output defaults', () => {
      it('outline defaults to null', () => {
        expect(defaultState.outline).toBeNull();
      });

      it('contentBundle defaults to null', () => {
        expect(defaultState.contentBundle).toBeNull();
      });
    });

    describe('final output defaults', () => {
      it('assembledHtml defaults to null', () => {
        expect(defaultState.assembledHtml).toBeNull();
      });

      it('validationResults defaults to null', () => {
        expect(defaultState.validationResults).toBeNull();
      });
    });

    describe('control flow defaults', () => {
      it('currentPhase defaults to init', () => {
        expect(defaultState.currentPhase).toBe('init');
      });

      it('voiceRevisionCount defaults to 0', () => {
        expect(defaultState.voiceRevisionCount).toBe(0);
      });

      it('errors defaults to empty array', () => {
        expect(defaultState.errors).toEqual([]);
      });
    });

    describe('approval checkpoint defaults', () => {
      it('awaitingApproval defaults to false', () => {
        expect(defaultState.awaitingApproval).toBe(false);
      });

      it('approvalType defaults to null', () => {
        expect(defaultState.approvalType).toBeNull();
      });
    });

    it('returns a new object each call (not shared reference)', () => {
      const state1 = getDefaultState();
      const state2 = getDefaultState();
      expect(state1).not.toBe(state2);

      // Mutating one should not affect the other
      state1.sessionId = 'test';
      expect(state2.sessionId).toBeNull();
    });
  });

  describe('PHASES constant', () => {
    it('defines INIT phase', () => {
      expect(PHASES.INIT).toBe('init');
    });

    it('defines all data fetching phases (1.x)', () => {
      expect(PHASES.LOAD_DIRECTOR_NOTES).toBe('1.1');
      expect(PHASES.FETCH_TOKENS).toBe('1.2');
      expect(PHASES.FETCH_EVIDENCE).toBe('1.3');
      expect(PHASES.FETCH_PHOTOS).toBe('1.4');
      expect(PHASES.CURATE_EVIDENCE).toBe('1.8');
    });

    it('defines photo analysis phase (1.65)', () => {
      expect(PHASES.ANALYZE_PHOTOS).toBe('1.65');
    });

    it('defines analysis phases (2.x)', () => {
      expect(PHASES.ANALYZE_ARCS).toBe('2');
      expect(PHASES.ARC_SPECIALISTS).toBe('2.1');
      expect(PHASES.ARC_SYNTHESIS).toBe('2.2');
      expect(PHASES.ARC_EVALUATION).toBe('2.3');
    });

    it('defines generation phases (3-4.x)', () => {
      expect(PHASES.GENERATE_OUTLINE).toBe('3');
      expect(PHASES.OUTLINE_GENERATION).toBe('3.1');
      expect(PHASES.OUTLINE_EVALUATION).toBe('3.2');
      expect(PHASES.GENERATE_CONTENT).toBe('4');
      expect(PHASES.ARTICLE_GENERATION).toBe('4.1');
      expect(PHASES.ARTICLE_EVALUATION).toBe('4.2');
      expect(PHASES.VALIDATE_SCHEMA).toBe('4.3');
      expect(PHASES.REVISE_CONTENT).toBe('4.4');
    });

    it('defines assembly phases (5.x)', () => {
      expect(PHASES.ASSEMBLE_HTML).toBe('5');
      expect(PHASES.VALIDATE_ARTICLE).toBe('5.1');
    });

    it('defines terminal phases', () => {
      expect(PHASES.COMPLETE).toBe('complete');
      expect(PHASES.ERROR).toBe('error');
    });

    it('defines exactly 24 phases (Commit 8.6)', () => {
      expect(Object.keys(PHASES)).toHaveLength(24);
    });

    it('all phase values are strings', () => {
      Object.values(PHASES).forEach(phase => {
        expect(typeof phase).toBe('string');
      });
    });

    it('all phase values are unique', () => {
      const values = Object.values(PHASES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('APPROVAL_TYPES constant', () => {
    it('defines EVIDENCE_BUNDLE type', () => {
      expect(APPROVAL_TYPES.EVIDENCE_BUNDLE).toBe('evidence-bundle');
    });

    it('defines ARC_SELECTION type', () => {
      expect(APPROVAL_TYPES.ARC_SELECTION).toBe('arc-selection');
    });

    it('defines OUTLINE type', () => {
      expect(APPROVAL_TYPES.OUTLINE).toBe('outline');
    });

    it('defines EVIDENCE_AND_PHOTOS type (Commit 8.6)', () => {
      expect(APPROVAL_TYPES.EVIDENCE_AND_PHOTOS).toBe('evidence-and-photos');
    });

    it('defines CHARACTER_IDS type (Commit 8.6)', () => {
      expect(APPROVAL_TYPES.CHARACTER_IDS).toBe('character-ids');
    });

    it('defines ARTICLE type (Commit 8.6)', () => {
      expect(APPROVAL_TYPES.ARTICLE).toBe('article');
    });

    it('defines exactly 6 approval types (Commit 8.6)', () => {
      expect(Object.keys(APPROVAL_TYPES)).toHaveLength(6);
    });

    it('all approval type values are strings', () => {
      Object.values(APPROVAL_TYPES).forEach(type => {
        expect(typeof type).toBe('string');
      });
    });

    it('all approval type values are unique', () => {
      const values = Object.values(APPROVAL_TYPES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('REVISION_CAPS constant (Commit 8.6)', () => {
    it('defines ARCS cap as 2 (foundational - escalate early)', () => {
      expect(REVISION_CAPS.ARCS).toBe(2);
    });

    it('defines OUTLINE cap as 3 (more surface area to fix)', () => {
      expect(REVISION_CAPS.OUTLINE).toBe(3);
    });

    it('defines ARTICLE cap as 3 (most content to polish)', () => {
      expect(REVISION_CAPS.ARTICLE).toBe(3);
    });

    it('defines exactly 3 revision caps', () => {
      expect(Object.keys(REVISION_CAPS)).toHaveLength(3);
    });

    it('all revision cap values are positive integers', () => {
      Object.values(REVISION_CAPS).forEach(cap => {
        expect(typeof cap).toBe('number');
        expect(Number.isInteger(cap)).toBe(true);
        expect(cap).toBeGreaterThan(0);
      });
    });
  });

  describe('state field organization', () => {
    // These tests document the expected state structure
    // Useful for understanding the data flow

    it('session fields identify the report context', () => {
      const sessionFields = ['sessionId', 'theme'];
      const defaultState = getDefaultState();

      sessionFields.forEach(field => {
        expect(defaultState).toHaveProperty(field);
      });
    });

    it('input fields come from session directory', () => {
      const inputFields = ['sessionConfig', 'directorNotes', 'playerFocus'];
      const defaultState = getDefaultState();

      inputFields.forEach(field => {
        expect(defaultState).toHaveProperty(field);
        expect(defaultState[field]).toEqual({}); // All default to empty object
      });
    });

    it('fetched fields come from external sources', () => {
      const fetchedFields = ['memoryTokens', 'paperEvidence', 'sessionPhotos'];
      const defaultState = getDefaultState();

      fetchedFields.forEach(field => {
        expect(defaultState).toHaveProperty(field);
        expect(defaultState[field]).toEqual([]); // All default to empty array
      });
    });

    it('generation fields are produced by AI', () => {
      const generationFields = ['evidenceBundle', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', 'outline', 'contentBundle'];
      const defaultState = getDefaultState();

      generationFields.forEach(field => {
        expect(defaultState).toHaveProperty(field);
      });
    });

    it('output fields are the final deliverables', () => {
      const outputFields = ['assembledHtml', 'validationResults'];
      const defaultState = getDefaultState();

      outputFields.forEach(field => {
        expect(defaultState).toHaveProperty(field);
        expect(defaultState[field]).toBeNull(); // All default to null
      });
    });

    it('control fields manage workflow state', () => {
      const controlFields = ['currentPhase', 'voiceRevisionCount', 'errors', 'awaitingApproval', 'approvalType'];
      const defaultState = getDefaultState();

      controlFields.forEach(field => {
        expect(defaultState).toHaveProperty(field);
      });
    });
  });
});

describe('state self-test validation', () => {
  // Verify the self-test block works when running directly
  // This is a meta-test ensuring our validation tooling is functional

  it('state.js can be required without errors', () => {
    expect(() => {
      require('../../../lib/workflow/state');
    }).not.toThrow();
  });

  it('getDefaultState produces valid structure for nodes', () => {
    const state = getDefaultState();

    // Nodes expect to read these without null checks
    expect(() => {
      // This simulates what a node might do
      const tokens = state.memoryTokens.length;
      const phase = state.currentPhase;
      const hasErrors = state.errors.length > 0;
      const isWaiting = state.awaitingApproval;
    }).not.toThrow();
  });
});
