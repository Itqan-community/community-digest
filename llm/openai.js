import OpenAI from 'openai';
import 'dotenv/config';

export async function extractInsights(prompt) {
  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined
  });

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  try {
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

    const text = response.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('Empty response from OpenAI API');
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse LLM response as JSON:', text.substring(0, 200));
      throw new Error('LLM returned invalid JSON');
    }
  } catch (error) {
    console.error('OpenAI API error:', error.message);
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}
