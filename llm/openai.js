import OpenAI from 'openai';
import 'dotenv/config';

export async function extractInsights(prompt) {
  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined
  });

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a data extraction engine. Return only valid JSON.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 8192
  });

  return response.choices[0].message.content;
}
