import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockExtractInsights: vi.fn(),
  mockOpenAIExtractInsights: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn()
}));

vi.mock('../../llm/gemini', () => ({
  extractInsights: hoisted.mockExtractInsights
}));

vi.mock('../../llm/openai', () => ({
  extractInsights: hoisted.mockOpenAIExtractInsights
}));

vi.mock('fs', () => ({
  default: {
    existsSync: hoisted.mockExistsSync,
    readFileSync: hoisted.mockReadFileSync,
    writeFileSync: hoisted.mockWriteFileSync,
    mkdirSync: hoisted.mockMkdirSync
  }
}));

const MOCK_DIGEST = {
  window_label: 'ملخص الأسبوع: 1 يونيو 2026',
  featured_topic: {
    title: 'موضوع تجريبي',
    excerpt: 'نص تجريبي',
    author_names: ['مستخدم 1'],
    url: 'https://community.itqan.dev/d/123'
  },
  themes: [
    { title: 'محور 1', description: 'وصف', url: 'https://community.itqan.dev/d/124', discussion_id: '124' }
  ],
  open_questions: []
};

const MOCK_POSTS = [{
  discussion_id: '123',
  title: 'Test Discussion',
  body: 'Test body',
  author_name: 'Test User',
  url: 'https://community.itqan.dev/d/123',
  interactions: 100
}];

describe('extractDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    hoisted.mockExistsSync.mockReturnValue(false);
  });

  it('extractDigest_geminiProvider_returnsDigestWithMeta', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL', 'gemini-2.0-flash');

    hoisted.mockExtractInsights.mockResolvedValue({ data: MOCK_DIGEST, model: 'gemini-2.0-flash' });

    const { extractDigest } = await import('../../llm/extract.js');
    const result = await extractDigest(MOCK_POSTS);

    expect(result.digest).toHaveProperty('window_label');
    expect(result.digest).toHaveProperty('featured_topic');
    expect(result.digest.featured_topic).toHaveProperty('title');
    expect(result.model).toBe('gemini-2.0-flash');
    expect(result.cached).toBe(false);
  });

  it('extractDigest_cacheMiss_callsProviderAndWritesCache', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    hoisted.mockExistsSync.mockReturnValue(false);
    hoisted.mockExtractInsights.mockResolvedValue({ data: MOCK_DIGEST, model: 'gemini-2.0-flash' });

    const { extractDigest } = await import('../../llm/extract.js');
    const result = await extractDigest(MOCK_POSTS);

    expect(hoisted.mockExtractInsights).toHaveBeenCalledTimes(1);
    expect(hoisted.mockWriteFileSync).toHaveBeenCalledOnce();
    expect(result.cached).toBe(false);
  });

  it('extractDigest_cacheHit_skipsProviderCall', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    hoisted.mockExistsSync.mockReturnValue(true);
    hoisted.mockReadFileSync.mockReturnValue(
      JSON.stringify({ digest: MOCK_DIGEST, model: 'gemini-2.5-flash' })
    );

    const { extractDigest } = await import('../../llm/extract.js');
    const result = await extractDigest(MOCK_POSTS);

    expect(hoisted.mockExtractInsights).not.toHaveBeenCalled();
    expect(result.digest.featured_topic.title).toBe(MOCK_DIGEST.featured_topic.title);
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.cached).toBe(true);
  });

  it('extractDigest_invalidJson_throws', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    hoisted.mockExistsSync.mockReturnValue(false);
    hoisted.mockExtractInsights.mockResolvedValue({ data: 'not valid json{{{', model: 'gemini-2.0-flash' });

    const { extractDigest } = await import('../../llm/extract.js');

    await expect(extractDigest(MOCK_POSTS)).rejects.toThrow('LLM returned invalid JSON');
  });

  it('extractDigest_openaiProvider_returnsDigestWithMeta', async () => {
    vi.stubEnv('LLM_PROVIDER', 'openai');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL', 'gpt-4o-mini');
    hoisted.mockOpenAIExtractInsights.mockResolvedValue({ data: MOCK_DIGEST, model: 'gpt-4o-mini' });

    const { extractDigest } = await import('../../llm/extract.js');
    const result = await extractDigest(MOCK_POSTS);

    expect(result.digest.featured_topic.title).toBe('موضوع تجريبي');
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('extractDigest_apiFailure_throwsDescriptiveError', async () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('LLM_API_KEY', 'test-key');
    hoisted.mockExistsSync.mockReturnValue(false);
    hoisted.mockExtractInsights.mockRejectedValue(new Error('Gemini API error: Rate limit exceeded'));

    const { extractDigest } = await import('../../llm/extract.js');

    await expect(extractDigest(MOCK_POSTS)).rejects.toThrow('Gemini API error: Rate limit exceeded');
  });
});
