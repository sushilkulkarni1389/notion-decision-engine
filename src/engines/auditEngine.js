// src/engines/auditEngine.js
//
// The core of the system. Given a Decision Log page ID, this module:
//   1. Fetches the decision + all linked outcomes from Notion
//   2. Calls Claude to generate a structured audit
//   3. Writes the audit back to Notion as an Audit Report page
//   4. Updates the original decision's Status to 'Audited'

import 'dotenv/config';
import { notionClient } from '../clients/notionClient.js';
import { claudeClient } from '../clients/claudeClient.js';
import { logger } from '../utils/logger.js';
import { AUDIT_SYSTEM_PROMPT, buildAuditUserPrompt } from '../prompts/auditPrompt.js';
import {
  buildAuditBlocks,
  notionTitle,
  notionRichText,
  notionNumber,
  notionSelect,
  notionDate,
  notionRelation,
} from '../utils/notionFormatters.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// How many times to retry if Claude returns malformed JSON
const MAX_JSON_RETRIES = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse Claude's response as JSON.
 * Strips any accidental markdown fences (```json ... ```) in case they slip through.
 */
function parseAuditJson(raw) {
  // Strip markdown fences if present
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  return JSON.parse(cleaned);
}

/**
 * Build the Audit Report page properties from Claude's parsed audit JSON.
 * These go into the Notion database columns (not the page body).
 */
function buildAuditProperties(audit, decisionPageId) {
  return {
    'Audit Title':        notionTitle(audit.audit_title),
    'Linked Decision':    notionRelation(decisionPageId),
    'Process Score':      notionNumber(audit.process_score),
    'Outcome Score':      notionNumber(audit.outcome_score),
    'Verdict':            notionSelect(audit.verdict),
    'Key Insight':        notionRichText(audit.key_insight),
    'Failed Assumptions': notionRichText(
      Array.isArray(audit.failed_assumptions)
        ? audit.failed_assumptions.join(' | ')
        : audit.failed_assumptions,
    ),
    'Recommendation':     notionRichText(audit.recommendation),
    'Full Analysis':      notionRichText(audit.full_narrative),
    'Audit Date':         notionDate(new Date().toISOString().split('T')[0]),
    'Audit Status':       notionSelect('Published'),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run a full audit for one decision.
 *
 * @param {string} decisionPageId — Notion page ID from the Decision Log DB
 * @returns {string|null}          — the created Audit Report page ID, or null if skipped
 */
export async function runAudit(decisionPageId) {
  logger.info(`[auditEngine] Starting audit for decision: ${decisionPageId}`);

  // ── 1. Fetch the decision page ───────────────────────────────────────────
  let decision;
  try {
    decision = await notionClient.getPage(decisionPageId);
  } catch (err) {
    logger.error(`[auditEngine] Failed to fetch decision page ${decisionPageId}: ${err.message}`);
    throw err;
  }

  // Guard: don't re-audit a decision that's already been audited
  const currentStatus = decision.properties?.Status?.select?.name;
  if (currentStatus === 'Audited') {
    logger.warn(`[auditEngine] Decision ${decisionPageId} is already Audited — skipping.`);
    return null;
  }

  // ── 2. Fetch all linked outcomes ─────────────────────────────────────────
  let outcomesResponse;
  try {
    outcomesResponse = await notionClient.queryDatabase(
      process.env.NOTION_OUTCOME_TRACKER_DB,
      {
        property: 'Linked Decision',
        relation: { contains: decisionPageId },
      },
    );
  } catch (err) {
    logger.error(`[auditEngine] Failed to fetch outcomes for ${decisionPageId}: ${err.message}`);
    throw err;
  }

  // ── 3. Skip if no outcomes have been logged ──────────────────────────────
  if (outcomesResponse.results.length === 0) {
    logger.warn(
      `[auditEngine] No outcomes logged for ${decisionPageId} — marking as 'Audit Scheduled - No Outcomes Yet'.`,
    );
    await notionClient.updatePage(decisionPageId, {
      Status: notionSelect('Audit Scheduled'),
    });
    return null;
  }

  logger.info(
    `[auditEngine] Found ${outcomesResponse.results.length} outcome(s) for ${decisionPageId}.`,
  );

  // ── 4. Build prompt ──────────────────────────────────────────────────────
  const userPrompt = buildAuditUserPrompt(decision, outcomesResponse);

  // ── 5. Call Claude (with retry on JSON parse failure) ────────────────────
  let audit;
  let lastError;

  for (let attempt = 1; attempt <= MAX_JSON_RETRIES + 1; attempt++) {
    try {
      logger.info(`[auditEngine] Calling Claude (attempt ${attempt})...`);
      const rawResponse = await claudeClient.analyze(AUDIT_SYSTEM_PROMPT, userPrompt);
      logger.debug(`[auditEngine] Raw Claude response:\n${rawResponse}`);

      audit = parseAuditJson(rawResponse);
      logger.info(`[auditEngine] Claude returned valid JSON. Verdict: ${audit.verdict}`);
      break; // Success — exit retry loop
    } catch (err) {
      lastError = err;
      logger.warn(
        `[auditEngine] JSON parse failed on attempt ${attempt}: ${err.message}`,
      );
      if (attempt > MAX_JSON_RETRIES) {
        logger.error(
          `[auditEngine] All ${MAX_JSON_RETRIES + 1} attempts failed. Aborting audit for ${decisionPageId}.`,
        );
        throw new Error(`Claude returned unparseable JSON after ${attempt} attempts: ${lastError.message}`);
      }
    }
  }

  // ── 6. Write Audit Report page to Notion ─────────────────────────────────
  const auditProperties = buildAuditProperties(audit, decisionPageId);
  const auditBodyBlocks = buildAuditBlocks(audit);

  let auditPageId;
  try {
    auditPageId = await notionClient.createPage(
      process.env.NOTION_AUDIT_REPORTS_DB,
      auditProperties,
      auditBodyBlocks,
    );
    logger.info(`[auditEngine] Audit Report page created: ${auditPageId}`);
  } catch (err) {
    logger.error(`[auditEngine] Failed to create Audit Report page: ${err.message}`);
    throw err;
  }

  // ── 7. Update original decision status to 'Audited' ──────────────────────
  try {
    await notionClient.updatePage(decisionPageId, {
      Status: notionSelect('Audited'),
    });
    logger.info(`[auditEngine] Decision ${decisionPageId} marked as Audited.`);
  } catch (err) {
    // Non-fatal: audit page was already written, don't throw
    logger.warn(
      `[auditEngine] Audit written but failed to update decision status: ${err.message}`,
    );
  }

  logger.info(
    `[auditEngine] ✅ Audit complete. Decision: ${decisionPageId} → Audit: ${auditPageId}`,
  );

  return auditPageId;
}
