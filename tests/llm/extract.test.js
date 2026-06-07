import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock functions so they're available before any imports
const hoisted = vi.hoisted(() => ({
  mockExtractInsights: vi.fn()
}));

// Mock the gemini provider at module level
vi.mock('../../llm/gemini', () => ({
  extractInsights: hoisted.mockExtractInsights
}));

describe('extractDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('extracts digest with valid LLM response', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL', 'gemini-2.0-flash');

    hoisted.mockExtractInsights.mockResolvedValue(JSON.stringify({
      window_label: 'ملخص الأسبوع: 1 يونيو 2026',
      featured_topic: {
        title: 'موضوع تجريبي',
        excerpt: 'نص تجريبي',
        author_names: ['مستخدم 1', 'مستخدم 2'],
        url: 'https://community.itqan.dev/d/123'
      },
      themes: [
        { title: 'محور 1', description: 'وصف', url: 'https://community.itqan.dev/d/124', discussion_id: '124' }
      ],
      open_questions: [],
      contributors: []
    }));

    const { extractDigest } = await import('../../llm/extract.js');

    const mockPosts = [
      {
        discussion_id: '123',
        title: 'Test Discussion',
        body: 'Test body',
        author_name: 'Test User',
        url: 'https://community.itqan.dev/d/123',
        interactions: 100
      }
    ];

    const result = await extractDigest(mockPosts);

    expect(result).toHaveProperty('window_label');
    expect(result).toHaveProperty('featured_topic');
    expect(result.featured_topic).toHaveProperty('title');
    expect(result.featured_topic).toHaveProperty('excerpt');
    expect(result.featured_topic).toHaveProperty('author_names');
    expect(result.featured_topic).toHaveProperty('url');
    expect(result).toHaveProperty('themes');
    expect(result).toHaveProperty('open_questions');
    expect(result).toHaveProperty('contributors');
  });

  it('throws on invalid JSON response', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL', 'gemini-2.0-flash');

    hoisted.mockExtractInsights.mockResolvedValue('not valid json{{{');

    const { extractDigest } = await import('../../llm/extract.js');

    const mockPosts = [{
      discussion_id: '123',
      title: 'Test',
      body: 'Body',
      author_name: 'User',
      url: 'https://community.itqan.dev/d/123',
      interactions: 100
    }];

    await expect(extractDigest(mockPosts)).rejects.toThrow('LLM returned invalid JSON');
  });
});
