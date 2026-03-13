const { articleId } = require('../template-helpers');

describe('articleId', () => {
  it('should derive ID from sessionId instead of generatedAt', () => {
    const metadata = {
      sessionId: '0306',
      generatedAt: '2026-03-13T10:30:00Z',
      theme: 'journalist'
    };
    expect(articleId(metadata)).toBe('NNA-0306-26');
  });

  it('should use DCR prefix for detective theme', () => {
    const metadata = {
      sessionId: '0306',
      generatedAt: '2026-03-13T10:30:00Z',
      theme: 'detective'
    };
    expect(articleId(metadata)).toBe('DCR-0306-26');
  });

  it('should fallback gracefully when sessionId is missing', () => {
    const metadata = {
      generatedAt: '2026-03-13T10:30:00Z',
      theme: 'journalist'
    };
    expect(articleId(metadata)).toBe('NNA-0000-00');
  });

  it('should handle missing generatedAt for year suffix', () => {
    const metadata = {
      sessionId: '0306',
      theme: 'journalist'
    };
    expect(articleId(metadata)).toBe('NNA-0306-00');
  });

  it('should handle null metadata', () => {
    expect(articleId(null)).toBe('NNA-0000-00');
  });
});
