import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

export async function extractInsights(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.LLM_API_KEY });
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash';

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  });

  return response.text;
}
