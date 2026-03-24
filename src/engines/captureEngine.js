// src/engines/captureEngine.js
//
// Takes a raw, unstructured decision description (a string the user types),
// uses Claude to extract structured fields, then writes a new page to the
// Decision Log database in Notion.
//
// Entry point: captureDecision(rawText, windowLabel)

import 'dotenv/config';
import { notionClient } from '../clients/notionClient.js';
import { claudeClient } from '../clients/claudeClient.js';
import { logger } from '../utils/logger.js';
import { calculateReviewDate, todayISO } from '../utils/dateUtils.js';
import {
  notionTitle,
  notionRichText,
  notionSelect,
  notionDate,
} from '../utils/notionFormatters.js';

// ---------------------------------------------------------------------------
// Capture system prompt
// ---------------------------------------------------------------------------

const CAPTURE_SYSTEM_PROMPT = `
You are a decision-logging assistant. A user will give you a raw description of a business decision they just made or are about to make.

Your job is to extract structured fields from their description. Be concise. Do not invent details not present in the input — if something isn't mentioned, use "Not specified".

Respond ONLY with a valid JSON object. No preamble, no markdown fences, no explanation outside the JSON.

JSON schema — every field is required:
{
  "decision": "string — short title, max 80 chars, what was decided",
  "context": "string — why this decision was needed, what problem it solves",
  "alternatives_considered": "string — other options that were evaluated, or 'Not specified'",
  "key_assumptions": "string — beliefs the decision rests on that could later be proven wrong",
  "expected_outcome": "string — what success looks like, ideally measurable",
  "decision_maker": "string — who made the call, or 'Not specified'",
  "domain": "Engineering" | "Product" | "Finance" | "Ops" | "Hiring" | "Other",
  "confidence_level": "High" | "Medium" | "Low"
}
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip markdown fences and parse JSON from Claude's response.
 */
function parseCaptureJson(raw) {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Convert the structured fields from Claude into Notion page properties.
 */
function buildDecisionProperties(structured, windowLabel, reviewDate, decisionDate) {
  return {
    'Decision':               notionTitle(structured.decision),
    'Context':                notionRichText(structured.context),
    'Alternatives Considered':notionRichText(structured.alternatives_considered),
    'Key Assumptions':        notionRichText(structured.key_assumptions),
    'Expected Outcome':       notionRichText(structured.expected_outcome),
    'Decision Maker':         notionRichText(structured.decision_maker),
    'Domain':                 notionSelect(structured.domain),
    'Confidence Level':       notionSelect(structured.confidence_level),
    'Review Window':          notionSelect(windowLabel),
    'Decision Date':          notionDate(decisionDate),
    'Review Date':            notionDate(reviewDate),
    'Status':                 notionSelect('Pending'),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Capture and structure a decision, then write it to Notion.
 *
 * @param {string} rawText      — free-text description of the decision
 * @param {string} windowLabel  — '30 days' | '60 days' | '90 days' (default: '60 days')
 * @param {string} decisionDate — YYYY-MM-DD (default: today)
 * @returns {string}             — the Notion page ID of the created Decision Log entry
 */
export async function captureDecision(
  rawText,
  windowLabel = '60 days',
  decisionDate = todayISO(),
) {
  if (!rawText || rawText.trim().length === 0) {
    throw new Error('captureDecision: rawText cannot be empty.');
  }

  logger.info(`[captureEngine] Structuring decision (${rawText.length} chars)...`);

  // ── 1. Ask Claude to extract structured fields ───────────────────────────
  let structured;
  try {
    const raw = await claudeClient.analyze(CAPTURE_SYSTEM_PROMPT, rawText.trim());
    logger.debug(`[captureEngine] Raw Claude response:\n${raw}`);
    structured = parseCaptureJson(raw);
    logger.info(`[captureEngine] Extracted: "${structured.decision}" [${structured.domain}]`);
  } catch (err) {
    logger.error(`[captureEngine] Failed to parse Claude response: ${err.message}`);
    throw err;
  }

  // ── 2. Calculate review date ─────────────────────────────────────────────
  const reviewDate = calculateReviewDate(decisionDate, windowLabel);
  logger.info(`[captureEngine] Review date: ${reviewDate} (window: ${windowLabel})`);

  // ── 3. Build Notion properties ───────────────────────────────────────────
  const properties = buildDecisionProperties(
    structured,
    windowLabel,
    reviewDate,
    decisionDate,
  );

  // ── 4. Create page in Decision Log DB ────────────────────────────────────
  let pageId;
  try {
    pageId = await notionClient.createPage(
      process.env.NOTION_DECISION_LOG_DB,
      properties,
      // No body blocks needed for capture — the DB properties hold all the data
      [],
    );
    logger.info(`[captureEngine] ✅ Decision captured → Notion page: ${pageId}`);
  } catch (err) {
    logger.error(`[captureEngine] Failed to create Notion page: ${err.message}`);
    throw err;
  }

  return pageId;
}
