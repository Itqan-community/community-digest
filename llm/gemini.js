import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function callGemini(ai, model, prompt) {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  });

  const text = response.text;
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse LLM response as JSON:', cleaned.substring(0, 200));
    throw new Error('LLM returned invalid JSON');
  }
}

export async function extractInsights(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.LLM_API_KEY });
  const preferred = process.env.LLM_MODEL || 'gemini-2.0-flash';
  const models = [preferred, ...FALLBACK_MODELS.filter(m => m !== preferred)];

  let lastError;
  for (const model of models) {
    try {
      const data = await callGemini(ai, model, prompt);
      return { data, model };
    } catch (err) {
      console.error(`Model ${model} failed: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError;
}
