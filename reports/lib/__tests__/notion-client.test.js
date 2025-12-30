/**
 * NotionClient Unit Tests
 */

const path = require('path');
const { NotionClient, createNotionClient, ELEMENTS_DB_ID } = require('../notion-client');

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock fs.promises
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn(),
    access: jest.fn()
  }
}));

const fs = require('fs').promises;

describe('NotionClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid token', () => {
      const client = new NotionClient('test-token');
      expect(client.token).toBe('test-token');
      expect(client.baseUrl).toBe('https://api.notion.com/v1');
    });

    it('should throw error when token is missing', () => {
      expect(() => new NotionClient()).toThrow('NOTION_TOKEN is required');
      expect(() => new NotionClient('')).toThrow('NOTION_TOKEN is required');
      expect(() => new NotionClient(null)).toThrow('NOTION_TOKEN is required');
    });
  });

  describe('extractRichText', () => {
    let client;

    beforeEach(() => {
      client = new NotionClient('test-token');
    });

    it('should extract plain text from rich text array', () => {
      const richText = [
        { plain_text: 'Hello ' },
        { plain_text: 'World' }
      ];
      expect(client.extractRichText(richText)).toBe('Hello World');
    });

    it('should return empty string for null input', () => {
      expect(client.extractRichText(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(client.extractRichText(undefined)).toBe('');
    });

    it('should return empty string for non-array input', () => {
      expect(client.extractRichText('not an array')).toBe('');
    });

    it('should handle items without plain_text', () => {
      const richText = [
        { plain_text: 'Hello' },
        { something_else: 'ignored' },
        { plain_text: 'World' }
      ];
      expect(client.extractRichText(richText)).toBe('HelloWorld');
    });
  });

  describe('parseSFFields', () => {
    let client;

    beforeEach(() => {
      client = new NotionClient('test-token');
    });

    it('should parse all SF_ fields from description', () => {
      const descText = `The memory shows James entering the lab with a keycard.
SF_RFID: [jam001]
SF_Summary: [James enters lab]
SF_ValueRating: [4]
SF_MemoryType: [Incriminating]
SF_Group: [Lab Access]`;

      const result = client.parseSFFields(descText);

      expect(result.fullDescription).toBe('The memory shows James entering the lab with a keycard.');
      expect(result.tokenId).toBe('jam001');
      expect(result.summary).toBe('James enters lab');
      expect(result.valueRating).toBe('4');
      expect(result.memoryType).toBe('Incriminating');
      expect(result.group).toBe('Lab Access');
    });

    it('should handle missing SF_ fields', () => {
      const descText = 'Just a regular description without SF fields.';
      const result = client.parseSFFields(descText);

      expect(result.fullDescription).toBe('Just a regular description without SF fields.');
      expect(result.tokenId).toBe('');
      expect(result.summary).toBe('');
    });

    it('should handle null input', () => {
      const result = client.parseSFFields(null);
      expect(result.fullDescription).toBe('');
      expect(result.tokenId).toBe('');
    });

    it('should handle empty input', () => {
      const result = client.parseSFFields('');
      expect(result.fullDescription).toBe('');
    });

    it('should normalize tokenId to lowercase', () => {
      const descText = 'SF_RFID: [JAM001]';
      const result = client.parseSFFields(descText);
      expect(result.tokenId).toBe('jam001');
    });

    it('should handle case-insensitive field matching', () => {
      const descText = `sf_rfid: [jam001]
sf_summary: [Test]`;
      const result = client.parseSFFields(descText);
      expect(result.tokenId).toBe('jam001');
      expect(result.summary).toBe('Test');
    });
  });

  describe('request', () => {
    let client;

    beforeEach(() => {
      client = new NotionClient('test-token');
    });

    it('should make authenticated GET request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '123' })
      });

      const result = await client.request('pages/123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages/123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual({ id: '123' });
    });

    it('should make authenticated POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      });

      const body = { filter: { property: 'test' } };
      await client.request('databases/abc/query', 'POST', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/databases/abc/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body)
        })
      );
    });

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid token')
      });

      await expect(client.request('pages/123'))
        .rejects.toThrow('Notion API error: 401 Unauthorized - Invalid token');
    });
  });

  describe('fetchMemoryTokens', () => {
    let client;

    beforeEach(() => {
      client = new NotionClient('test-token');
    });

    it('should fetch and parse memory tokens', async () => {
      const mockResponse = {
        results: [
          {
            id: 'notion-id-1',
            properties: {
              'Name': { title: [{ plain_text: 'Token 1' }] },
              'Description/Text': {
                rich_text: [{
                  plain_text: 'Description\nSF_RFID: [tok001]\nSF_Summary: [Test token]'
                }]
              },
              'Basic Type': { select: { name: 'Memory Token Video' } },
              'Owner': { relation: [] }
            }
          }
        ],
        has_more: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.fetchMemoryTokens();

      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('fetchedAt');
      expect(result).toHaveProperty('totalCount');
      expect(result.tokens[0].tokenId).toBe('tok001');
      expect(result.tokens[0].name).toBe('Token 1');
    });

    it('should filter by token IDs when provided', async () => {
      const mockResponse = {
        results: [
          {
            id: 'id-1',
            properties: {
              'Name': { title: [{ plain_text: 'Token 1' }] },
              'Description/Text': { rich_text: [{ plain_text: 'SF_RFID: [tok001]' }] },
              'Basic Type': { select: { name: 'Memory Token Video' } },
              'Owner': { relation: [] }
            }
          },
          {
            id: 'id-2',
            properties: {
              'Name': { title: [{ plain_text: 'Token 2' }] },
              'Description/Text': { rich_text: [{ plain_text: 'SF_RFID: [tok002]' }] },
              'Basic Type': { select: { name: 'Memory Token Video' } },
              'Owner': { relation: [] }
            }
          }
        ],
        has_more: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.fetchMemoryTokens(['tok001']);

      expect(result.totalCount).toBe(1);
      expect(result.tokens[0].tokenId).toBe('tok001');
    });

    it('should skip items without valid token ID', async () => {
      const mockResponse = {
        results: [
          {
            id: 'id-1',
            properties: {
              'Name': { title: [{ plain_text: 'Valid Token' }] },
              'Description/Text': { rich_text: [{ plain_text: 'SF_RFID: [tok001]' }] },
              'Basic Type': { select: { name: 'Memory Token Video' } },
              'Owner': { relation: [] }
            }
          },
          {
            id: 'id-2',
            properties: {
              'Name': { title: [{ plain_text: 'Invalid Token' }] },
              'Description/Text': { rich_text: [{ plain_text: 'No SF fields here' }] },
              'Basic Type': { select: { name: 'Memory Token Video' } },
              'Owner': { relation: [] }
            }
          }
        ],
        has_more: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.fetchMemoryTokens();

      expect(result.totalCount).toBe(1);
      expect(result.tokens[0].tokenId).toBe('tok001');
    });

    it('should handle pagination', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            results: [{
              id: 'id-1',
              properties: {
                'Name': { title: [{ plain_text: 'Token 1' }] },
                'Description/Text': { rich_text: [{ plain_text: 'SF_RFID: [tok001]' }] },
                'Basic Type': { select: { name: 'Memory Token Video' } },
                'Owner': { relation: [] }
              }
            }],
            has_more: true,
            next_cursor: 'cursor123'
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            results: [{
              id: 'id-2',
              properties: {
                'Name': { title: [{ plain_text: 'Token 2' }] },
                'Description/Text': { rich_text: [{ plain_text: 'SF_RFID: [tok002]' }] },
                'Basic Type': { select: { name: 'Memory Token Video' } },
                'Owner': { relation: [] }
              }
            }],
            has_more: false
          })
        });

      const result = await client.fetchMemoryTokens();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.totalCount).toBe(2);
    });
  });

  describe('fetchPaperEvidence', () => {
    let client;

    beforeEach(() => {
      client = new NotionClient('test-token');
    });

    it('should fetch and parse paper evidence', async () => {
      const mockResponse = {
        results: [
          {
            id: 'evidence-1',
            properties: {
              'Name': { title: [{ plain_text: 'Secret Document' }] },
              'Description/Text': { rich_text: [{ plain_text: 'A secret doc' }] },
              'Basic Type': { select: { name: 'Document' } },
              'Narrative Threads': { multi_select: [{ name: 'Funding & Espionage' }] },
              'Owner': { relation: [] },
              'Container': { relation: [] },
              'Files & media': { files: [] }
            }
          }
        ],
        has_more: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.fetchPaperEvidence(false);

      expect(result).toHaveProperty('evidence');
      expect(result.evidence[0].name).toBe('Secret Document');
      expect(result.evidence[0].basicType).toBe('Document');
      expect(result.evidence[0].narrativeThreads).toContain('Funding & Espionage');
    });

    it('should include file attachments when requested', async () => {
      const mockResponse = {
        results: [
          {
            id: 'evidence-1',
            properties: {
              'Name': { title: [{ plain_text: 'Doc with file' }] },
              'Description/Text': { rich_text: [] },
              'Basic Type': { select: { name: 'Document' } },
              'Narrative Threads': { multi_select: [] },
              'Owner': { relation: [] },
              'Container': { relation: [] },
              'Files & media': {
                files: [
                  {
                    name: 'test.pdf',
                    type: 'file',
                    file: { url: 'https://notion.so/file.pdf' }
                  }
                ]
              }
            }
          }
        ],
        has_more: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await client.fetchPaperEvidence(true);

      expect(result.evidence[0].files).toBeDefined();
      expect(result.evidence[0].files[0].name).toBe('test.pdf');
      expect(result.evidence[0].files[0].url).toBe('https://notion.so/file.pdf');
    });
  });

  describe('resolveRelationNames', () => {
    let client;

    beforeEach(() => {
      client = new NotionClient('test-token');
    });

    it('should resolve relation IDs to names', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            properties: { Name: { title: [{ plain_text: 'Owner 1' }] } }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            properties: { Name: { title: [{ plain_text: 'Owner 2' }] } }
          })
        });

      const items = [
        { name: 'Item 1', ownerIds: ['id1', 'id2'] }
      ];

      const result = await client.resolveRelationNames(items, 'ownerIds', 'owners');

      expect(result[0].owners).toEqual(['Owner 1', 'Owner 2']);
      expect(result[0].ownerIds).toBeUndefined();
    });

    it('should handle failed lookups gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'));

      const items = [
        { name: 'Item 1', ownerIds: ['bad-id'] }
      ];

      const result = await client.resolveRelationNames(items, 'ownerIds', 'owners');

      expect(result[0].owners).toEqual(['Unknown']);
    });

    it('should handle empty relation arrays', async () => {
      const items = [
        { name: 'Item 1', ownerIds: [] }
      ];

      const result = await client.resolveRelationNames(items, 'ownerIds', 'owners');

      expect(result[0].owners).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('downloadFile', () => {
    let client;

    beforeEach(() => {
      client = new NotionClient('test-token');
    });

    it('should download file to local path', async () => {
      const mockBuffer = Buffer.from('file content');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer)
      });

      const result = await client.downloadFile(
        'https://notion.so/file.pdf',
        '/output/file.pdf'
      );

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith('/output/file.pdf', mockBuffer);
      expect(result).toBe('/output/file.pdf');
    });

    it('should throw error on failed download', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      await expect(client.downloadFile('https://bad.url', '/output/file.pdf'))
        .rejects.toThrow('Failed to download: 404');
    });
  });

  describe('downloadAttachments', () => {
    let client;

    beforeEach(() => {
      client = new NotionClient('test-token');
      fs.stat.mockReset();
      fs.access.mockReset();
    });

    it('should download new files', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT'));

      const mockBuffer = Buffer.from('content');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer)
      });

      const evidence = [
        {
          name: 'Doc',
          files: [{ name: 'test.pdf', url: 'https://notion.so/test.pdf' }]
        }
      ];

      const stats = await client.downloadAttachments(evidence, '/output');

      expect(stats.newFiles).toBe(1);
      expect(stats.errors).toHaveLength(0);
      // Use path.join for cross-platform compatibility
      expect(evidence[0].files[0].localPath).toBe(path.join('/output', 'test.pdf'));
    });

    it('should track replaced files with different size', async () => {
      fs.stat.mockResolvedValue({ size: 100 });

      const mockBuffer = Buffer.from('new content of different size');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer)
      });

      const evidence = [
        {
          name: 'Doc',
          files: [{ name: 'test.pdf', url: 'https://notion.so/test.pdf' }]
        }
      ];

      const stats = await client.downloadAttachments(evidence, '/output');

      expect(stats.replacedFiles).toBe(1);
    });

    it('should track cached files with same size', async () => {
      const mockBuffer = Buffer.from('same content');
      fs.stat.mockResolvedValue({ size: mockBuffer.length });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer)
      });

      const evidence = [
        {
          name: 'Doc',
          files: [{ name: 'test.pdf', url: 'https://notion.so/test.pdf' }]
        }
      ];

      const stats = await client.downloadAttachments(evidence, '/output');

      expect(stats.cachedFiles).toBe(1);
    });

    it('should use cached file when download fails', async () => {
      fs.stat.mockResolvedValue({ size: 100 });
      fs.access.mockResolvedValue(undefined);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const evidence = [
        {
          name: 'Doc',
          files: [{ name: 'test.pdf', url: 'https://notion.so/test.pdf' }]
        }
      ];

      const stats = await client.downloadAttachments(evidence, '/output');

      expect(stats.cachedFiles).toBe(1);
      expect(stats.errors).toHaveLength(0);
    });

    it('should record error when download fails and no cache exists', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT'));
      fs.access.mockRejectedValue(new Error('ENOENT'));

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const evidence = [
        {
          name: 'Doc',
          files: [{ name: 'test.pdf', url: 'https://notion.so/test.pdf' }]
        }
      ];

      const stats = await client.downloadAttachments(evidence, '/output');

      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0].file).toBe('test.pdf');
    });

    it('should sanitize filenames with spaces', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT'));

      const mockBuffer = Buffer.from('content');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer)
      });

      const evidence = [
        {
          name: 'Doc',
          files: [{ name: 'my file name.pdf', url: 'https://notion.so/test.pdf' }]
        }
      ];

      await client.downloadAttachments(evidence, '/output');

      // Use path.join for cross-platform compatibility
      expect(evidence[0].files[0].localPath).toBe(path.join('/output', 'my_file_name.pdf'));
    });

    it('should skip items without files', async () => {
      const evidence = [
        { name: 'Doc without files' },
        { name: 'Doc with empty files', files: [] }
      ];

      const stats = await client.downloadAttachments(evidence, '/output');

      expect(stats.newFiles).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('createNotionClient factory', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create client from environment variable', () => {
      process.env.NOTION_TOKEN = 'env-token';
      const client = createNotionClient();
      expect(client.token).toBe('env-token');
    });

    it('should throw when environment variable is missing', () => {
      delete process.env.NOTION_TOKEN;
      expect(() => createNotionClient()).toThrow('NOTION_TOKEN environment variable is not set');
    });
  });

  describe('module exports', () => {
    it('should export expected values', () => {
      expect(NotionClient).toBeDefined();
      expect(createNotionClient).toBeDefined();
      expect(ELEMENTS_DB_ID).toBe('18c2f33d-583f-8020-91bc-d84c7dd94306');
    });
  });
});
