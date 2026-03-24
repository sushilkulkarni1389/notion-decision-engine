// src/scheduler/scheduler.js
//
// Runs two cron jobs:
//   1. Daily at 8am  — finds all decisions whose Review Date is today or overdue,
//                      runs an audit for each one that hasn't been audited yet.
//   2. Monthly (1st) — generates the monthly pattern report.
//
// All state lives in Notion. If the process restarts, the scheduler
// re-reads Notion on startup and catches any missed audits automatically.

import 'dotenv/config';
import cron from 'node-cron';
import { notionClient } from '../clients/notionClient.js';
import { runAudit } from '../engines/auditEngine.js';
import { logger } from '../utils/logger.js';
import { todayISO } from '../utils/dateUtils.js';

// patternEngine is imported lazily inside the cron callback so a missing
// patternEngine file doesn't crash startup before Phase 4 is built.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Query Decision Log for all entries whose Review Date is today or earlier
 * and whose Status is not yet 'Audited'.
 */
async function fetchDueDecisions() {
  const today = todayISO();
  logger.debug(`[scheduler] Checking for decisions due on or before ${today}...`);

  const response = await notionClient.queryDatabase(
    process.env.NOTION_DECISION_LOG_DB,
    {
      and: [
        {
          property: 'Review Date',
          date: { on_or_before: today },
        },
        {
          property: 'Status',
          select: { does_not_equal: 'Audited' },
        },
      ],
    },
  );

  return response.results;
}

// ---------------------------------------------------------------------------
// Audit run — called by daily cron
// ---------------------------------------------------------------------------

async function runDailyAuditCheck() {
  logger.info('[scheduler] ⏰ Daily audit check starting...');

  let decisions;
  try {
    decisions = await fetchDueDecisions();
  } catch (err) {
    logger.error(`[scheduler] Failed to query Decision Log: ${err.message}`);
    return;
  }

  if (decisions.length === 0) {
    logger.info('[scheduler] No decisions due today.');
    return;
  }

  logger.info(`[scheduler] ${decisions.length} decision(s) due for audit.`);

  // Process sequentially — avoids hammering Notion API in parallel
  for (const decision of decisions) {
    const id = decision.id;
    const title =
      decision.properties?.Decision?.title?.[0]?.plain_text ?? '(untitled)';

    logger.info(`[scheduler] → Auditing: "${title}" (${id})`);

    try {
      const auditPageId = await runAudit(id);
      if (auditPageId) {
        logger.info(`[scheduler]   ✅ Done → audit page: ${auditPageId}`);
      } else {
        logger.info(`[scheduler]   ⏭️  Skipped (no outcomes or already audited).`);
      }
    } catch (err) {
      // Log and continue — one failed audit should not stop the rest
      logger.error(`[scheduler]   ❌ Audit failed for ${id}: ${err.message}`);
    }
  }

  logger.info('[scheduler] Daily audit check complete.');
}

// ---------------------------------------------------------------------------
// Monthly pattern report — called by monthly cron
// ---------------------------------------------------------------------------

async function runMonthlyPatternReport() {
  logger.info('[scheduler] 📊 Monthly pattern report starting...');
  try {
    // Dynamic import so Phase 3 works before Phase 4 is built
    const { generateMonthlyReport } = await import('../engines/patternEngine.js');
    const reportPageId = await generateMonthlyReport();
    logger.info(`[scheduler] ✅ Monthly report created: ${reportPageId}`);
  } catch (err) {
    logger.error(`[scheduler] Monthly report failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Start both cron jobs. Called once from index.js at startup.
 *
 * Cron expressions (from .env):
 *   AUDIT_CHECK_INTERVAL = '0 8 * * *'   → daily at 8am
 *   PATTERN_REPORT_DAY   = '1'            → 1st of each month at 9am
 */
export async function initScheduler() {
  const timezone = process.env.TIMEZONE || 'Asia/Kolkata';
  const auditInterval = process.env.AUDIT_CHECK_INTERVAL || '0 8 * * *';
  const patternDay = process.env.PATTERN_REPORT_DAY || '1';
  const monthlyExpression = `0 9 ${patternDay} * *`;

  // ── Daily audit check ────────────────────────────────────────────────────
  if (!cron.validate(auditInterval)) {
    throw new Error(`Invalid AUDIT_CHECK_INTERVAL cron expression: "${auditInterval}"`);
  }

  cron.schedule(auditInterval, runDailyAuditCheck, { timezone });
  logger.info(
    `[scheduler] Daily audit check scheduled: "${auditInterval}" (${timezone})`,
  );

  // ── Monthly pattern report ───────────────────────────────────────────────
  cron.schedule(monthlyExpression, runMonthlyPatternReport, { timezone });
  logger.info(
    `[scheduler] Monthly pattern report scheduled: "${monthlyExpression}" (${timezone})`,
  );

  // ── Run once on startup to catch any missed audits ───────────────────────
  // This handles the case where the process was offline when a review date passed.
  logger.info('[scheduler] Running startup audit check for overdue decisions...');
  await runDailyAuditCheck();

  logger.info('[scheduler] Scheduler initialized. Waiting for next trigger.');
}
