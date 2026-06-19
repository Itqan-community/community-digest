import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockGenerateContent: vi.fn()
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent: hoisted.mockGenerateContent };
    }
  }
}));

vi.mock('dotenv/config', () => ({}));

import { extractInsights } from '../../llm/gemini.js';

const VALID_RESPONSE = { featured_topic: { title: 'Test' }, themes: [], open_questions: [] };

describe('gemini extractInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_MODEL', 'gemini-2.5-flash');
  });

  it('extractInsights_firstModelSucceeds_returnsDataAndModel', async () => {
    hoisted.mockGenerateContent.mockResolvedValue({ text: JSON.stringify(VALID_RESPONSE) });

    const result = await extractInsights('test prompt');

    expect(result.data).toEqual(VALID_RESPONSE);
    expect(result.model).toBe('gemini-2.5-flash');
    expect(hoisted.mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('extractInsights_firstModelFails_fallsBackToSecond', async () => {
    hoisted.mockGenerateContent
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValue({ text: JSON.stringify(VALID_RESPONSE) });

    const result = await extractInsights('test prompt');

    expect(result.model).toBe('gemini-2.0-flash');
    expect(hoisted.mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('extractInsights_allModelsFail_throwsLastError', async () => {
    hoisted.mockGenerateContent.mockRejectedValue(new Error('503 Service Unavailable'));

    await expect(extractInsights('test prompt')).rejects.toThrow();
    expect(hoisted.mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('extractInsights_invalidJson_throws', async () => {
    hoisted.mockGenerateContent.mockResolvedValue({ text: 'not valid json{{{' });

    await expect(extractInsights('test prompt')).rejects.toThrow('LLM returned invalid JSON');
  });
});
