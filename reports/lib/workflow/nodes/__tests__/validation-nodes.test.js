/**
 * Validation Nodes Unit Tests
 * Commit 8.20: Tests for programmatic validation before LLM evaluation
 */

const {
  validateOutlineStructure,
  validateArticleContent,
  _testing: { matchesPattern, findPatternOccurrences, extractOutlineText, extractArticleText }
} = require('../validation-nodes');

describe('validation-nodes', () => {
  describe('helper functions', () => {
    describe('matchesPattern', () => {
      it('should match literal patterns case-sensitively by default', () => {
        expect(matchesPattern({ pattern: 'Token' }, 'This has a Token')).toBe(true);
        expect(matchesPattern({ pattern: 'Token' }, 'This has a token')).toBe(false);
      });

      it('should match case-insensitively when caseSensitive is false', () => {
        expect(matchesPattern({ pattern: 'token', caseSensitive: false }, 'This has a TOKEN')).toBe(true);
        expect(matchesPattern({ pattern: 'token', caseSensitive: false }, 'This has a Token')).toBe(true);
      });

      it('should match regex patterns', () => {
        expect(matchesPattern({ pattern: 'Act \\d', isRegex: true }, 'Act 3 happened')).toBe(true);
        expect(matchesPattern({ pattern: 'Act \\d', isRegex: true }, 'Act X happened')).toBe(false);
      });

      it('should support case-insensitive regex', () => {
        expect(matchesPattern({ pattern: 'act \\d', isRegex: true, caseSensitive: false }, 'ACT 3')).toBe(true);
      });
    });

    describe('findPatternOccurrences', () => {
      it('should return line numbers and snippets for matches', () => {
        const text = 'Line one\nLine with token here\nLine three';
        const occurrences = findPatternOccurrences({ pattern: 'token', caseSensitive: false }, text);

        expect(occurrences).toHaveLength(1);
        expect(occurrences[0].line).toBe(2);
        expect(occurrences[0].snippet).toContain('token');
      });

      it('should find multiple occurrences', () => {
        const text = 'token one\nNo match\ntoken two\nAnother token';
        const occurrences = findPatternOccurrences({ pattern: 'token' }, text);

        expect(occurrences).toHaveLength(3);
        expect(occurrences[0].line).toBe(1);
        expect(occurrences[1].line).toBe(3);
        expect(occurrences[2].line).toBe(4);
      });
    });

    describe('extractOutlineText', () => {
      it('should extract text from sections array', () => {
        const outline = {
          sections: [
            { name: 'lede', description: 'Opening text' },
            { name: 'theStory', content: 'Main content' }
          ]
        };

        const texts = extractOutlineText(outline);

        expect(texts.lede).toBe('Opening text');
        expect(texts.theStory).toBe('Main content');
      });

      it('should extract text from top-level section keys', () => {
        const outline = {
          lede: { description: 'Lede description' },
          theStory: 'Direct story content'
        };

        const texts = extractOutlineText(outline);

        expect(texts.lede).toBe('Lede description');
        expect(texts.theStory).toBe('Direct story content');
      });
    });

    describe('extractArticleText', () => {
      it('should handle string content directly', () => {
        const text = extractArticleText('Direct string content');
        expect(text).toBe('Direct string content');
      });

      it('should combine structured sections', () => {
        const bundle = {
          lede: 'Opening paragraph',
          theStory: 'Main story',
          closing: 'Final thoughts'
        };

        const text = extractArticleText(bundle);

        expect(text).toContain('Opening paragraph');
        expect(text).toContain('Main story');
        expect(text).toContain('Final thoughts');
      });

      it('should handle sections array', () => {
        const bundle = {
          sections: [
            { content: 'Section 1' },
            { paragraphs: ['Para 1', 'Para 2'] }
          ]
        };

        const text = extractArticleText(bundle);

        expect(text).toContain('Section 1');
        expect(text).toContain('Para 1');
        expect(text).toContain('Para 2');
      });
    });
  });

  describe('validateOutlineStructure', () => {
    const createValidOutline = () => ({
      lede: { description: 'Opening hook about the murder' },
      theStory: { description: 'Main narrative covering arc-1 and arc-2' },
      thePlayers: { description: 'Player involvement' },
      closing: { description: 'Final thoughts' }
    });

    const createMockState = (overrides = {}) => ({
      sessionId: 'test',
      outline: createValidOutline(),
      selectedArcs: ['arc-1', 'arc-2'],
      narrativeArcs: [
        { id: 'arc-1', title: 'The Financial Trail' },
        { id: 'arc-2', title: 'The Cover-Up' }
      ],
      evidenceBundle: {
        exposed: [{ id: 'EVD001' }],
        buried: [{ id: 'EVD002' }]
      },
      photoAnalyses: [{ filename: 'photo1.jpg' }],
      outlineRevisionCount: 0,
      ...overrides
    });

    const config = { configurable: { theme: 'journalist' } };

    it('should pass validation for valid outline', async () => {
      const state = createMockState();
      const result = await validateOutlineStructure(state, config);

      expect(result.outlineValidation.valid).toBe(true);
      expect(result.outlineValidation.structuralIssues).toBe(0);
    });

    it('should fail for missing required section', async () => {
      const state = createMockState({
        outline: {
          lede: { description: 'Opening' },
          // Missing theStory, thePlayers, closing
        }
      });

      const result = await validateOutlineStructure(state, config);

      expect(result.outlineValidation.valid).toBe(false);
      expect(result.outlineValidation.structuralIssues).toBeGreaterThan(0);
      // Note: Validation nodes only set validation result
      // Routing handles revision counter increment and phase updates
    });

    it('should report missing arc coverage', async () => {
      const state = createMockState({
        outline: {
          lede: { description: 'Opening' },
          theStory: { description: 'Story without mentioning arcs' },
          thePlayers: { description: 'Players' },
          closing: { description: 'Closing' }
        }
      });

      const result = await validateOutlineStructure(state, config);

      // Should have structural issues for missing arcs
      const arcIssues = result.outlineValidation.issues.filter(
        i => i.field === 'arcCoverage'
      );
      expect(arcIssues.length).toBeGreaterThan(0);
    });

    it('should handle empty state gracefully', async () => {
      const state = {
        sessionId: 'test',
        outline: {},
        outlineRevisionCount: 0
      };

      const result = await validateOutlineStructure(state, config);

      expect(result.outlineValidation).toBeDefined();
      expect(result.outlineValidation.issues).toBeDefined();
    });
  });

  describe('validateArticleContent', () => {
    const createValidArticle = () => ({
      lede: 'I walked into the room that night, my notes in hand. We had no idea what we would find.',
      theStory: 'The investigation led us down a dark path. I discovered evidence that connected the dots.',
      closing: 'In the end, we learned the truth. My investigation is complete.'
    });

    const createMockState = (overrides = {}) => ({
      sessionId: 'test',
      contentBundle: createValidArticle(),
      sessionConfig: {
        roster: ['Alice', 'Bob']
      },
      articleRevisionCount: 0,
      ...overrides
    });

    const config = { configurable: { theme: 'journalist' } };

    it('should pass validation for valid article', async () => {
      const state = createMockState();
      const result = await validateArticleContent(state, config);

      expect(result.articleValidation.valid).toBe(true);
      expect(result.articleValidation.structuralIssues).toBe(0);
    });

    it('should fail for banned patterns (em-dash)', async () => {
      // Use the actual em-dash character from the config
      const emDash = '\u2014';  // Unicode em-dash
      const state = createMockState({
        contentBundle: {
          lede: `I walked in ${emDash} and saw the body. my notes. we investigated.`,
          theStory: 'Further investigation continued.',
          closing: 'The case concluded.'
        }
      });

      const result = await validateArticleContent(state, config);

      expect(result.articleValidation.valid).toBe(false);
      const emDashIssue = result.articleValidation.issues.find(
        i => i.pattern === 'em-dash'
      );
      expect(emDashIssue).toBeDefined();
      expect(emDashIssue.count).toBeGreaterThan(0);
    });

    it('should fail for banned patterns (token terminology)', async () => {
      const state = createMockState({
        contentBundle: {
          lede: 'I found a memory token on the table.',
          theStory: 'My investigation revealed more tokens.',
          closing: 'We traced the token scan results.'
        }
      });

      const result = await validateArticleContent(state, config);

      expect(result.articleValidation.valid).toBe(false);
      const tokenIssue = result.articleValidation.issues.find(
        i => i.pattern === 'token-term'
      );
      expect(tokenIssue).toBeDefined();
    });

    it('should fail for missing voice markers', async () => {
      // This content has NO first-person markers (I , my , we )
      const state = createMockState({
        contentBundle: {
          lede: 'The investigation began at midnight.',
          theStory: 'Evidence was found at the scene. The detective noted the clues.',
          closing: 'The case was closed by authorities.'
        }
      });

      const result = await validateArticleContent(state, config);

      expect(result.articleValidation.valid).toBe(false);
      const voiceIssue = result.articleValidation.issues.find(
        i => i.field === 'voiceMarkers'
      );
      expect(voiceIssue).toBeDefined();
      expect(voiceIssue.type).toBe('structural');
      expect(voiceIssue.missing.length).toBeGreaterThan(0);
    });

    it('should report advisory issues for missing roster mentions', async () => {
      const state = createMockState({
        contentBundle: createValidArticle(),
        sessionConfig: { roster: ['Charlie'] }  // Not mentioned in article
      });

      const result = await validateArticleContent(state, config);

      const rosterIssue = result.articleValidation.issues.find(
        i => i.field === 'rosterCoverage'
      );
      expect(rosterIssue).toBeDefined();
      expect(rosterIssue.type).toBe('advisory');
      expect(rosterIssue.player).toBe('Charlie');
    });

    it('should fail for empty content', async () => {
      const state = createMockState({
        contentBundle: ''
      });

      const result = await validateArticleContent(state, config);

      expect(result.articleValidation.valid).toBe(false);
      // Note: Validation nodes only set validation result
      // Routing handles revision counter increment and phase updates
    });

    it('should handle missing contentBundle gracefully', async () => {
      const state = createMockState({
        contentBundle: null
      });

      const result = await validateArticleContent(state, config);

      expect(result.articleValidation).toBeDefined();
      expect(result.articleValidation.valid).toBe(false);
    });
  });

  describe('module exports', () => {
    it('should export validateOutlineStructure', () => {
      expect(typeof validateOutlineStructure).toBe('function');
    });

    it('should export validateArticleContent', () => {
      expect(typeof validateArticleContent).toBe('function');
    });

    it('should export testing utilities', () => {
      expect(typeof matchesPattern).toBe('function');
      expect(typeof findPatternOccurrences).toBe('function');
      expect(typeof extractOutlineText).toBe('function');
      expect(typeof extractArticleText).toBe('function');
    });
  });
});
