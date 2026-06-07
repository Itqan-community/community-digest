import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

export async function extractInsights(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.LLM_API_KEY });
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash';

  try {
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
  } catch (error) {
    console.error('Gemini API error:', error.message);
    throw new Error(`Gemini API error: ${error.message}`);
  }
}
