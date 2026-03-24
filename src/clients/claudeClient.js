import 'dotenv/config';

import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const MAX_RETRIES = 2;

/**
 * Send a prompt to Claude and return the text response.
 * For audit and pattern prompts, Claude is instructed to return JSON only.
 * This function handles retries if JSON parsing fails downstream.
 *
 * @param {string} systemPrompt - The system-level instruction for Claude
 * @param {string} userPrompt   - The user-level content (decision + outcomes)
 * @param {number} maxTokens    - Max tokens in the response (default: 2000)
 * @returns {string} Raw text response from Claude
 */
async function analyze(systemPrompt, userPrompt, maxTokens = 2000) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug(`claudeClient.analyze: attempt ${attempt}/${MAX_RETRIES}`);

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      });

      const text = response.content[0]?.text;

      if (!text) {
        throw new Error('Claude returned an empty response');
      }

      logger.debug(`claudeClient.analyze: received ${text.length} chars from Claude`);
      return text;

    } catch (error) {
      lastError = error;
      logger.warn(`claudeClient.analyze attempt ${attempt} failed: ${error.message}`);

      // Don't retry on auth errors or invalid request errors — they won't succeed
      if (error.status === 401 || error.status === 400) {
        break;
      }

      // Wait before retrying (exponential backoff: 1s, 2s)
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  logger.error(`claudeClient.analyze failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
  throw lastError;
}

/**
 * Convenience wrapper: calls analyze() and parses the response as JSON.
 * Handles cases where Claude wraps JSON in markdown code fences (```json ... ```)
 * even when instructed not to — defensive parsing.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Object} Parsed JSON object
 */
async function analyzeJson(systemPrompt, userPrompt) {
  const raw = await analyze(systemPrompt, userPrompt);

  try {
    // Strip markdown fences if present (defensive — Claude sometimes adds them)
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    return JSON.parse(cleaned);
  } catch (parseError) {
    logger.error(`claudeClient.analyzeJson: JSON parse failed. Raw response:\n${raw}`);
    throw new Error(`Claude returned invalid JSON: ${parseError.message}`);
  }
}

export default {
  analyze,
  analyzeJson,
};
export const claudeClient = {
  analyze: async (systemPrompt, userPrompt, maxTokens = 2000) => {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    return response.content[0].text;
  },
};