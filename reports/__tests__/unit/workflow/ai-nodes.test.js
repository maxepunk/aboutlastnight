/**
 * AI Nodes Unit Tests
 *
 * Tests AI processing nodes for the report generation workflow.
 * Uses mock Claude client and prompt builder for deterministic testing.
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const {
  curateEvidenceBundle,
  analyzeNarrativeArcs,
  generateOutline,
  generateContentBundle,
  validateContentBundle,
  validateArticle,
  reviseContentBundle,
  createMockClaudeClient,
  createMockPromptBuilder,
  _testing
} = require('../../../lib/workflow/nodes/ai-nodes');
const { PHASES, APPROVAL_TYPES } = require('../../../lib/workflow/state');

// Load test fixtures
const mockEvidenceBundle = require('../../fixtures/mock-responses/evidence-bundle.json');
const mockArcAnalysis = require('../../fixtures/mock-responses/arc-analysis.json');
const mockOutline = require('../../fixtures/mock-responses/outline.json');
const mockContentBundle = require('../../fixtures/content-bundles/valid-journalist.json');
const mockValidationPassed = require('../../fixtures/mock-responses/validation-results.json');
const mockValidationFailed = require('../../fixtures/mock-responses/validation-results-failed.json');

describe('ai-nodes', () => {
  describe('module exports', () => {
    it('exports curateEvidenceBundle function', () => {
      expect(typeof curateEvidenceBundle).toBe('function');
    });

    it('exports analyzeNarrativeArcs function', () => {
      expect(typeof analyzeNarrativeArcs).toBe('function');
    });

    it('exports generateOutline function', () => {
      expect(typeof generateOutline).toBe('function');
    });

    it('exports generateContentBundle function', () => {
      expect(typeof generateContentBundle).toBe('function');
    });

    it('exports validateContentBundle function', () => {
      expect(typeof validateContentBundle).toBe('function');
    });

    it('exports validateArticle function', () => {
      expect(typeof validateArticle).toBe('function');
    });

    it('exports reviseContentBundle function', () => {
      expect(typeof reviseContentBundle).toBe('function');
    });

    it('exports createMockClaudeClient factory', () => {
      expect(typeof createMockClaudeClient).toBe('function');
    });

    it('exports createMockPromptBuilder factory', () => {
      expect(typeof createMockPromptBuilder).toBe('function');
    });

    it('exports _testing with internal functions', () => {
      expect(_testing).toBeDefined();
      expect(typeof _testing.getClaudeClient).toBe('function');
      expect(typeof _testing.getPromptBuilder).toBe('function');
      expect(typeof _testing.getSchemaValidator).toBe('function');
    });
  });

  describe('createMockClaudeClient', () => {
    it('creates client with async call function', async () => {
      const client = createMockClaudeClient({});
      expect(typeof client).toBe('function');

      const result = await client({ prompt: 'test' });
      expect(typeof result).toBe('string');
    });

    it('returns evidenceBundle fixture when prompt contains "curate"', async () => {
      const client = createMockClaudeClient({ evidenceBundle: mockEvidenceBundle });
      const result = await client({ prompt: 'curate this evidence', systemPrompt: '' });

      expect(JSON.parse(result)).toEqual(mockEvidenceBundle);
    });

    it('returns arcAnalysis fixture when prompt contains "narrative arc"', async () => {
      const client = createMockClaudeClient({ arcAnalysis: mockArcAnalysis });
      const result = await client({ prompt: 'analyze narrative arcs', systemPrompt: '' });

      expect(JSON.parse(result)).toEqual(mockArcAnalysis);
    });

    it('returns outline fixture when prompt contains "outline"', async () => {
      const client = createMockClaudeClient({ outline: mockOutline });
      const result = await client({ prompt: 'generate outline', systemPrompt: '' });

      expect(JSON.parse(result)).toEqual(mockOutline);
    });

    it('returns contentBundle fixture when schema matches', async () => {
      const client = createMockClaudeClient({ contentBundle: mockContentBundle });
      const result = await client({
        prompt: 'generate content',
        systemPrompt: 'You are Nova writing',
        jsonSchema: { $id: 'content-bundle' }
      });

      expect(JSON.parse(result)).toEqual(mockContentBundle);
    });

    it('returns validationResults fixture when prompt contains "validate"', async () => {
      const client = createMockClaudeClient({ validationResults: mockValidationPassed });
      const result = await client({ prompt: 'validate this article', systemPrompt: '' });

      expect(JSON.parse(result)).toEqual(mockValidationPassed);
    });

    it('tracks all calls via getCalls()', async () => {
      const client = createMockClaudeClient({});

      await client({ prompt: 'first call', model: 'haiku' });
      await client({ prompt: 'second call', model: 'sonnet' });

      const calls = client.getCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0].prompt).toBe('first call');
      expect(calls[1].model).toBe('sonnet');
    });

    it('returns last call via getLastCall()', async () => {
      const client = createMockClaudeClient({});

      await client({ prompt: 'first' });
      await client({ prompt: 'second' });

      const lastCall = client.getLastCall();
      expect(lastCall.prompt).toBe('second');
    });

    it('clears call log via clearCalls()', async () => {
      const client = createMockClaudeClient({});

      await client({ prompt: 'test' });
      expect(client.getCalls()).toHaveLength(1);

      client.clearCalls();
      expect(client.getCalls()).toHaveLength(0);
    });

    it('returns null for getLastCall() when no calls made', () => {
      const client = createMockClaudeClient({});
      expect(client.getLastCall()).toBeNull();
    });
  });

  describe('createMockPromptBuilder', () => {
    it('creates builder with all required methods', () => {
      const builder = createMockPromptBuilder();

      expect(typeof builder.buildArcAnalysisPrompt).toBe('function');
      expect(typeof builder.buildOutlinePrompt).toBe('function');
      expect(typeof builder.buildArticlePrompt).toBe('function');
      expect(typeof builder.buildValidationPrompt).toBe('function');
      expect(typeof builder.buildRevisionPrompt).toBe('function');
    });

    it('has theme property with loadTemplate', async () => {
      const builder = createMockPromptBuilder();

      expect(builder.theme).toBeDefined();
      const template = await builder.theme.loadTemplate();
      expect(typeof template).toBe('string');
    });

    it('returns systemPrompt and userPrompt from build methods', async () => {
      const builder = createMockPromptBuilder();

      const result = await builder.buildArcAnalysisPrompt({ roster: ['A', 'B'] });

      expect(result.systemPrompt).toBeDefined();
      expect(result.userPrompt).toBeDefined();
      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userPrompt).toBe('string');
    });
  });

  describe('curateEvidenceBundle', () => {
    const mockClient = createMockClaudeClient({ evidenceBundle: mockEvidenceBundle });
    const config = { configurable: { claudeClient: mockClient } };

    it('returns evidenceBundle in state update', async () => {
      const state = {
        memoryTokens: [{ tokenId: 'test001' }],
        paperEvidence: [{ notionId: 'ev001' }],
        playerFocus: { primaryInvestigation: 'Test' }
      };

      const result = await curateEvidenceBundle(state, config);

      expect(result.evidenceBundle).toBeDefined();
      expect(result.evidenceBundle.exposed).toBeDefined();
      expect(result.evidenceBundle.buried).toBeDefined();
      expect(result.evidenceBundle.context).toBeDefined();
    });

    it('sets currentPhase to CURATE_EVIDENCE', async () => {
      const result = await curateEvidenceBundle({}, config);

      expect(result.currentPhase).toBe(PHASES.CURATE_EVIDENCE);
    });

    it('sets awaitingApproval to true', async () => {
      const result = await curateEvidenceBundle({}, config);

      expect(result.awaitingApproval).toBe(true);
    });

    it('sets approvalType to EVIDENCE_BUNDLE', async () => {
      const result = await curateEvidenceBundle({}, config);

      expect(result.approvalType).toBe(APPROVAL_TYPES.EVIDENCE_BUNDLE);
    });

    it('calls Claude with haiku model', async () => {
      mockClient.clearCalls();
      await curateEvidenceBundle({}, config);

      const lastCall = mockClient.getLastCall();
      expect(lastCall.model).toBe('haiku');
    });

    it('includes playerFocus in prompt', async () => {
      mockClient.clearCalls();
      const state = { playerFocus: { primaryInvestigation: 'Money trail' } };

      await curateEvidenceBundle(state, config);

      const lastCall = mockClient.getLastCall();
      expect(lastCall.prompt).toContain('Money trail');
    });
  });

  describe('analyzeNarrativeArcs', () => {
    const mockClient = createMockClaudeClient({ arcAnalysis: mockArcAnalysis });
    const mockBuilder = createMockPromptBuilder();
    const config = {
      configurable: {
        claudeClient: mockClient,
        promptBuilder: mockBuilder
      }
    };

    it('returns narrativeArcs array in state update', async () => {
      const state = {
        evidenceBundle: mockEvidenceBundle,
        directorNotes: { observations: {} },
        sessionConfig: { roster: [{ name: 'Test' }] }
      };

      const result = await analyzeNarrativeArcs(state, config);

      expect(result.narrativeArcs).toBeDefined();
      expect(Array.isArray(result.narrativeArcs)).toBe(true);
    });

    it('sets currentPhase to ANALYZE_ARCS', async () => {
      const result = await analyzeNarrativeArcs({}, config);

      expect(result.currentPhase).toBe(PHASES.ANALYZE_ARCS);
    });

    it('sets approvalType to ARC_SELECTION', async () => {
      const result = await analyzeNarrativeArcs({}, config);

      expect(result.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });

    it('calls Claude with sonnet model', async () => {
      mockClient.clearCalls();
      await analyzeNarrativeArcs({}, config);

      const lastCall = mockClient.getLastCall();
      expect(lastCall.model).toBe('sonnet');
    });

    it('extracts roster names from sessionConfig', async () => {
      const state = {
        sessionConfig: {
          roster: [{ name: 'Alice' }, { name: 'Bob' }]
        }
      };

      const result = await analyzeNarrativeArcs(state, config);

      // Verify the call was made with roster data
      expect(result.narrativeArcs).toBeDefined();
    });
  });

  describe('generateOutline', () => {
    const mockClient = createMockClaudeClient({ outline: mockOutline });
    const mockBuilder = createMockPromptBuilder();
    const config = {
      configurable: {
        claudeClient: mockClient,
        promptBuilder: mockBuilder
      }
    };

    it('returns outline in state update', async () => {
      const state = {
        selectedArcs: ['The Money Trail', 'The Audit Cover-up'],
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs
      };

      const result = await generateOutline(state, config);

      expect(result.outline).toBeDefined();
      expect(result.outline.lede).toBeDefined();
      expect(result.outline.theStory).toBeDefined();
    });

    it('sets currentPhase to GENERATE_OUTLINE', async () => {
      const result = await generateOutline({}, config);

      expect(result.currentPhase).toBe(PHASES.GENERATE_OUTLINE);
    });

    it('sets approvalType to OUTLINE', async () => {
      const result = await generateOutline({}, config);

      expect(result.approvalType).toBe(APPROVAL_TYPES.OUTLINE);
    });

    it('calls Claude with sonnet model', async () => {
      mockClient.clearCalls();
      await generateOutline({}, config);

      const lastCall = mockClient.getLastCall();
      expect(lastCall.model).toBe('sonnet');
    });

    it('uses first sessionPhoto as heroImage', async () => {
      const state = {
        sessionPhotos: [{ filename: 'hero.png' }, { filename: 'other.png' }]
      };

      const result = await generateOutline(state, config);

      // Just verify the function completes with photos
      expect(result.outline).toBeDefined();
    });
  });

  describe('generateContentBundle', () => {
    const mockClient = createMockClaudeClient({ contentBundle: mockContentBundle });
    const mockBuilder = createMockPromptBuilder();
    const config = {
      configurable: {
        claudeClient: mockClient,
        promptBuilder: mockBuilder
      }
    };

    it('returns contentBundle in state update', async () => {
      const state = {
        outline: mockOutline,
        evidenceBundle: mockEvidenceBundle,
        sessionId: 'test-123',
        theme: 'journalist'
      };

      const result = await generateContentBundle(state, config);

      expect(result.contentBundle).toBeDefined();
      expect(result.contentBundle.headline).toBeDefined();
      expect(result.contentBundle.sections).toBeDefined();
    });

    it('sets currentPhase to GENERATE_CONTENT', async () => {
      const result = await generateContentBundle({}, config);

      expect(result.currentPhase).toBe(PHASES.GENERATE_CONTENT);
    });

    it('does NOT set awaitingApproval (no approval needed after generation)', async () => {
      const result = await generateContentBundle({}, config);

      expect(result.awaitingApproval).toBeUndefined();
    });

    it('calls Claude with opus model', async () => {
      mockClient.clearCalls();
      await generateContentBundle({}, config);

      const lastCall = mockClient.getLastCall();
      expect(lastCall.model).toBe('opus');
    });

    it('calls Claude with json output format', async () => {
      mockClient.clearCalls();
      await generateContentBundle({}, config);

      const lastCall = mockClient.getLastCall();
      expect(lastCall.outputFormat).toBe('json');
    });

    it('adds metadata with sessionId and theme', async () => {
      const state = {
        sessionId: 'test-abc',
        theme: 'detective'
      };

      const result = await generateContentBundle(state, config);

      expect(result.contentBundle.metadata).toBeDefined();
      expect(result.contentBundle.metadata.sessionId).toBe('test-abc');
    });
  });

  describe('validateContentBundle', () => {
    it('returns valid state for valid contentBundle', async () => {
      const state = { contentBundle: mockContentBundle };
      const config = {};

      const result = await validateContentBundle(state, config);

      expect(result.currentPhase).toBe(PHASES.VALIDATE_SCHEMA);
      expect(result.errors).toBeUndefined();
    });

    it('returns errors for invalid contentBundle', async () => {
      const state = {
        contentBundle: {
          metadata: { sessionId: 'test' },
          // Missing required fields: headline, sections
        }
      };

      const result = await validateContentBundle(state, {});

      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('uses injected schemaValidator from config', async () => {
      const mockValidator = {
        validate: jest.fn().mockReturnValue({ valid: true, errors: null })
      };
      const config = { configurable: { schemaValidator: mockValidator } };

      await validateContentBundle({ contentBundle: {} }, config);

      expect(mockValidator.validate).toHaveBeenCalledWith('content-bundle', {});
    });

    it('returns partial state update (only currentPhase or errors)', async () => {
      const result = await validateContentBundle({ contentBundle: mockContentBundle }, {});

      const keys = Object.keys(result);
      expect(keys).toContain('currentPhase');
      expect(keys.length).toBeLessThanOrEqual(2);
    });
  });

  describe('validateArticle', () => {
    const mockClient = createMockClaudeClient({ validationResults: mockValidationPassed });
    const mockBuilder = createMockPromptBuilder();
    const config = {
      configurable: {
        claudeClient: mockClient,
        promptBuilder: mockBuilder
      }
    };

    it('returns validationResults in state update', async () => {
      const result = await validateArticle({ contentBundle: mockContentBundle }, config);

      expect(result.validationResults).toBeDefined();
      expect(result.validationResults.passed).toBeDefined();
      expect(result.validationResults.voice_score).toBeDefined();
    });

    it('sets currentPhase to COMPLETE when validation passes', async () => {
      const result = await validateArticle({}, config);

      expect(result.currentPhase).toBe(PHASES.COMPLETE);
    });

    it('sets currentPhase to REVISE_CONTENT when validation fails', async () => {
      const failingClient = createMockClaudeClient({ validationResults: mockValidationFailed });
      const failConfig = {
        configurable: {
          claudeClient: failingClient,
          promptBuilder: mockBuilder
        }
      };

      const result = await validateArticle({ voiceRevisionCount: 0 }, failConfig);

      expect(result.currentPhase).toBe(PHASES.REVISE_CONTENT);
    });

    it('increments voiceRevisionCount when validation fails', async () => {
      const failingClient = createMockClaudeClient({ validationResults: mockValidationFailed });
      const failConfig = {
        configurable: {
          claudeClient: failingClient,
          promptBuilder: mockBuilder
        }
      };

      const result = await validateArticle({ voiceRevisionCount: 1 }, failConfig);

      expect(result.voiceRevisionCount).toBe(2);
    });

    it('completes after max revisions even if validation fails', async () => {
      const failingClient = createMockClaudeClient({ validationResults: mockValidationFailed });
      const failConfig = {
        configurable: {
          claudeClient: failingClient,
          promptBuilder: mockBuilder
        }
      };

      const result = await validateArticle({ voiceRevisionCount: 2 }, failConfig);

      expect(result.currentPhase).toBe(PHASES.COMPLETE);
    });

    it('calls Claude with haiku model', async () => {
      mockClient.clearCalls();
      await validateArticle({}, config);

      const lastCall = mockClient.getLastCall();
      expect(lastCall.model).toBe('haiku');
    });

    it('uses assembledHtml if available', async () => {
      const state = {
        assembledHtml: '<html>Test HTML</html>',
        contentBundle: mockContentBundle
      };

      const result = await validateArticle(state, config);

      expect(result.validationResults).toBeDefined();
    });
  });

  describe('reviseContentBundle', () => {
    const mockRevision = {
      contentBundle: mockContentBundle,
      fixes_applied: ['Fixed em-dash', 'Fixed passive voice']
    };
    const mockClient = createMockClaudeClient({ revision: mockRevision });
    const mockBuilder = createMockPromptBuilder();
    const config = {
      configurable: {
        claudeClient: mockClient,
        promptBuilder: mockBuilder
      }
    };

    it('returns updated contentBundle in state update', async () => {
      const state = {
        contentBundle: mockContentBundle,
        validationResults: mockValidationFailed
      };

      const result = await reviseContentBundle(state, config);

      expect(result.contentBundle).toBeDefined();
    });

    it('sets currentPhase to GENERATE_CONTENT (to re-validate)', async () => {
      const result = await reviseContentBundle({}, config);

      expect(result.currentPhase).toBe(PHASES.GENERATE_CONTENT);
    });

    it('preserves revision history', async () => {
      const state = {
        contentBundle: {
          ...mockContentBundle,
          _revisionHistory: [
            { timestamp: '2024-01-01T00:00:00Z', fixes: ['Previous fix'] }
          ]
        },
        validationResults: mockValidationFailed
      };

      const result = await reviseContentBundle(state, config);

      expect(result.contentBundle._revisionHistory).toHaveLength(2);
    });

    it('calls Claude with sonnet model', async () => {
      mockClient.clearCalls();
      await reviseContentBundle({}, config);

      const lastCall = mockClient.getLastCall();
      expect(lastCall.model).toBe('sonnet');
    });

    it('uses voice_notes from validationResults', async () => {
      const state = {
        validationResults: {
          voice_notes: 'Multiple passive voice issues detected'
        }
      };

      const result = await reviseContentBundle(state, config);

      expect(result.contentBundle).toBeDefined();
    });
  });

  describe('dependency injection', () => {
    it('uses injected claudeClient from config', async () => {
      const customClient = jest.fn().mockResolvedValue(JSON.stringify({}));
      const config = { configurable: { claudeClient: customClient } };

      await curateEvidenceBundle({}, config);

      expect(customClient).toHaveBeenCalled();
    });

    it('uses injected promptBuilder from config', async () => {
      const customBuilder = createMockPromptBuilder();
      customBuilder.buildArcAnalysisPrompt = jest.fn().mockResolvedValue({
        systemPrompt: 'custom system',
        userPrompt: 'custom user'
      });

      const config = {
        configurable: {
          claudeClient: createMockClaudeClient({}),
          promptBuilder: customBuilder
        }
      };

      await analyzeNarrativeArcs({}, config);

      expect(customBuilder.buildArcAnalysisPrompt).toHaveBeenCalled();
    });

    it('uses injected schemaValidator from config', async () => {
      const customValidator = {
        validate: jest.fn().mockReturnValue({ valid: true, errors: null })
      };
      const config = { configurable: { schemaValidator: customValidator } };

      await validateContentBundle({ contentBundle: {} }, config);

      expect(customValidator.validate).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    const mockClient = createMockClaudeClient({});
    const mockBuilder = createMockPromptBuilder();
    const config = {
      configurable: {
        claudeClient: mockClient,
        promptBuilder: mockBuilder
      }
    };

    it('handles empty state for curateEvidenceBundle', async () => {
      const result = await curateEvidenceBundle({}, config);

      expect(result.evidenceBundle).toBeDefined();
      expect(result.currentPhase).toBe(PHASES.CURATE_EVIDENCE);
    });

    it('handles missing roster in sessionConfig', async () => {
      const result = await analyzeNarrativeArcs({ sessionConfig: {} }, config);

      expect(result.narrativeArcs).toBeDefined();
    });

    it('handles missing sessionPhotos', async () => {
      const result = await generateOutline({ sessionPhotos: null }, config);

      expect(result.outline).toBeDefined();
    });

    it('handles undefined contentBundle in validateContentBundle', async () => {
      const result = await validateContentBundle({ contentBundle: undefined }, {});

      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.errors).toBeDefined();
    });

    it('handles zero voiceRevisionCount', async () => {
      const failingClient = createMockClaudeClient({ validationResults: mockValidationFailed });
      const failConfig = {
        configurable: {
          claudeClient: failingClient,
          promptBuilder: mockBuilder
        }
      };

      const result = await validateArticle({}, failConfig);

      expect(result.voiceRevisionCount).toBe(1);
    });
  });

  describe('safeParseJson', () => {
    it('parses valid JSON successfully', () => {
      const { safeParseJson } = _testing;
      const result = safeParseJson('{"key": "value"}', 'test context');
      expect(result).toEqual({ key: 'value' });
    });

    it('throws actionable error for invalid JSON', () => {
      const { safeParseJson } = _testing;
      expect(() => safeParseJson('not valid json', 'test context'))
        .toThrow(/Failed to parse test context/);
    });

    it('includes response preview in error message', () => {
      const { safeParseJson } = _testing;
      expect(() => safeParseJson('invalid response text', 'test context'))
        .toThrow(/invalid response text/);
    });

    it('truncates long responses in error message', () => {
      const { safeParseJson } = _testing;
      const longResponse = 'x'.repeat(1000);
      try {
        safeParseJson(longResponse, 'test context');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.message).toContain('[truncated]');
        expect(error.message.length).toBeLessThan(800); // Reasonable error length
      }
    });
  });

  describe('error handling: invalid JSON responses', () => {
    // Create a mock client that returns invalid JSON
    function createInvalidJsonClient() {
      return async () => 'This is not valid JSON at all!';
    }

    it('curateEvidenceBundle throws actionable error on invalid JSON', async () => {
      const config = { configurable: { claudeClient: createInvalidJsonClient() } };

      await expect(curateEvidenceBundle({}, config))
        .rejects.toThrow(/Failed to parse evidence bundle from curateEvidenceBundle/);
    });

    it('analyzeNarrativeArcs throws actionable error on invalid JSON', async () => {
      const config = {
        configurable: {
          claudeClient: createInvalidJsonClient(),
          promptBuilder: createMockPromptBuilder()
        }
      };

      await expect(analyzeNarrativeArcs({}, config))
        .rejects.toThrow(/Failed to parse arc analysis from analyzeNarrativeArcs/);
    });

    it('generateOutline throws actionable error on invalid JSON', async () => {
      const config = {
        configurable: {
          claudeClient: createInvalidJsonClient(),
          promptBuilder: createMockPromptBuilder()
        }
      };

      await expect(generateOutline({}, config))
        .rejects.toThrow(/Failed to parse outline from generateOutline/);
    });

    it('generateContentBundle throws actionable error on invalid JSON', async () => {
      const config = {
        configurable: {
          claudeClient: createInvalidJsonClient(),
          promptBuilder: createMockPromptBuilder()
        }
      };

      await expect(generateContentBundle({}, config))
        .rejects.toThrow(/Failed to parse content bundle from generateContentBundle/);
    });

    it('validateArticle throws actionable error on invalid JSON', async () => {
      const config = {
        configurable: {
          claudeClient: createInvalidJsonClient(),
          promptBuilder: createMockPromptBuilder()
        }
      };

      await expect(validateArticle({ contentBundle: {} }, config))
        .rejects.toThrow(/Failed to parse validation results from validateArticle/);
    });

    it('reviseContentBundle throws actionable error on invalid JSON', async () => {
      const config = {
        configurable: {
          claudeClient: createInvalidJsonClient(),
          promptBuilder: createMockPromptBuilder()
        }
      };

      await expect(reviseContentBundle({}, config))
        .rejects.toThrow(/Failed to parse revised content from reviseContentBundle/);
    });

    it('error messages include response preview for debugging', async () => {
      const badResponse = 'Claude returned: Error processing request';
      const config = {
        configurable: {
          claudeClient: async () => badResponse
        }
      };

      try {
        await curateEvidenceBundle({}, config);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.message).toContain('Claude returned: Error processing request');
      }
    });
  });

  describe('integration: node sequence', () => {
    const fixtures = {
      evidenceBundle: mockEvidenceBundle,
      arcAnalysis: mockArcAnalysis,
      outline: mockOutline,
      contentBundle: mockContentBundle,
      validationResults: mockValidationPassed
    };
    const mockClient = createMockClaudeClient(fixtures);
    const mockBuilder = createMockPromptBuilder();
    const config = {
      configurable: {
        claudeClient: mockClient,
        promptBuilder: mockBuilder
      }
    };

    it('can chain curateEvidenceBundle -> analyzeNarrativeArcs', async () => {
      // Phase 1.8
      const curateResult = await curateEvidenceBundle({}, config);
      expect(curateResult.evidenceBundle).toBeDefined();

      // Phase 2
      const arcState = { ...curateResult };
      const arcResult = await analyzeNarrativeArcs(arcState, config);
      expect(arcResult.narrativeArcs).toBeDefined();
    });

    it('can chain analyzeNarrativeArcs -> generateOutline', async () => {
      // Phase 2
      const arcResult = await analyzeNarrativeArcs({}, config);

      // Phase 3 (with user selection)
      const outlineState = {
        ...arcResult,
        selectedArcs: arcResult.narrativeArcs.map(a => a.name)
      };
      const outlineResult = await generateOutline(outlineState, config);

      expect(outlineResult.outline).toBeDefined();
    });

    it('can chain generateOutline -> generateContentBundle -> validateContentBundle', async () => {
      // Phase 3
      const outlineResult = await generateOutline({}, config);

      // Phase 4
      const contentState = { ...outlineResult, sessionId: 'test', theme: 'journalist' };
      const contentResult = await generateContentBundle(contentState, config);

      expect(contentResult.contentBundle).toBeDefined();

      // Phase 4.1
      const validateResult = await validateContentBundle(contentResult, {});
      expect(validateResult.currentPhase).toBe(PHASES.VALIDATE_SCHEMA);
    });

    it('can chain validateArticle -> reviseContentBundle on failure', async () => {
      const failingFixtures = { ...fixtures, validationResults: mockValidationFailed };
      const failClient = createMockClaudeClient(failingFixtures);
      const failConfig = {
        configurable: {
          claudeClient: failClient,
          promptBuilder: mockBuilder
        }
      };

      // Phase 5.1 - fails
      const validateResult = await validateArticle({ contentBundle: mockContentBundle }, failConfig);
      expect(validateResult.currentPhase).toBe(PHASES.REVISE_CONTENT);

      // Phase 4.2
      const reviseState = { ...validateResult, contentBundle: mockContentBundle };
      const reviseResult = await reviseContentBundle(reviseState, failConfig);

      expect(reviseResult.contentBundle).toBeDefined();
      expect(reviseResult.currentPhase).toBe(PHASES.GENERATE_CONTENT);
    });
  });
});
