// src/index.js
//
// Entry point. Does two things:
//   1. Always: starts the scheduler (daily audit check + monthly pattern report)
//   2. Optionally: handles a one-shot CLI command and exits
//
// CLI usage:
//   node src/index.js                          → start scheduler (runs indefinitely)
//   node src/index.js capture "We decided to..." → capture a decision and exit
//   node src/index.js audit <page_id>          → run a single audit and exit
//   node src/index.js report                   → generate monthly pattern report and exit

import 'dotenv/config';
import { logger } from './utils/logger.js';
import { initScheduler } from './scheduler/scheduler.js';
import { captureDecision } from './engines/captureEngine.js';
import { runAudit } from './engines/auditEngine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`
Notion Decision Intelligence Engine
=====================================
Usage:
  node src/index.js                         Start the scheduler (runs forever)
  node src/index.js capture "<text>"        Capture a new decision
  node src/index.js capture "<text>" 30     Capture with 30-day review window
  node src/index.js audit <notion_page_id>  Run audit for one decision
  node src/index.js report                  Generate monthly pattern report now
`);
}

// ---------------------------------------------------------------------------
// CLI handlers
// ---------------------------------------------------------------------------

async function handleCapture(args) {
  // args[0] = the decision text
  // args[1] = optional review window in days (30 | 60 | 90), default 60
  const rawText = args[0];
  if (!rawText) {
    console.error('Error: provide decision text in quotes.\n');
    printUsage();
    process.exit(1);
  }

  // Map numeric arg to window label, or use a label directly
  const windowArg = args[1];
  let windowLabel = '60 days'; // default
  if (windowArg) {
    const dayMap = { '30': '30 days', '60': '60 days', '90': '90 days' };
    windowLabel = dayMap[windowArg] ?? windowArg; // allow "30 days" as well
  }

  logger.info(`[CLI] Capturing decision with ${windowLabel} review window...`);

  try {
    const pageId = await captureDecision(rawText, windowLabel);
    console.log(`\n✅ Decision captured successfully!`);
    console.log(`   Notion Page ID : ${pageId}`);
    console.log(`   Review Window  : ${windowLabel}`);
    console.log(`\n   Open Notion and check your Decision Log database.\n`);
  } catch (err) {
    logger.error(`[CLI] Capture failed: ${err.message}`);
    process.exit(1);
  }
}

async function handleAudit(args) {
  const pageId = args[0];
  if (!pageId) {
    console.error('Error: provide a Notion page ID.\n');
    printUsage();
    process.exit(1);
  }

  logger.info(`[CLI] Running audit for decision: ${pageId}`);

  try {
    const auditPageId = await runAudit(pageId);
    if (auditPageId) {
      console.log(`\n✅ Audit complete!`);
      console.log(`   Decision Page  : ${pageId}`);
      console.log(`   Audit Page     : ${auditPageId}`);
      console.log(`\n   Open your Audit Reports database in Notion.\n`);
    } else {
      console.log(`\n⏭️  Audit skipped.`);
      console.log(`   Reason: decision already audited, or no outcomes logged yet.\n`);
    }
  } catch (err) {
    logger.error(`[CLI] Audit failed: ${err.message}`);
    process.exit(1);
  }
}

async function handleReport() {
  logger.info('[CLI] Generating monthly pattern report...');
  try {
    const { generateMonthlyReport } = await import('./engines/patternEngine.js');
    const reportPageId = await generateMonthlyReport();
    console.log(`\n✅ Monthly report generated!`);
    console.log(`   Report Page: ${reportPageId}\n`);
  } catch (err) {
    logger.error(`[CLI] Report generation failed: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  // ── One-shot CLI commands (run + exit) ────────────────────────────────────
  if (command === 'capture') {
    await handleCapture(rest);
    process.exit(0);
  }

  if (command === 'audit') {
    await handleAudit(rest);
    process.exit(0);
  }

  if (command === 'report') {
    await handleReport();
    process.exit(0);
  }

  if (command === 'help' || command === '--help') {
    printUsage();
    process.exit(0);
  }

  // Unknown command — warn but still start the scheduler
  if (command) {
    console.warn(`Unknown command: "${command}". Starting scheduler anyway.\n`);
  }

  // ── Start the scheduler (runs indefinitely) ───────────────────────────────
  logger.info('[index] Starting Notion Decision Intelligence Engine...');

  try {
    await initScheduler();
    logger.info('[index] Engine running. Press Ctrl+C to stop.');
  } catch (err) {
    logger.error(`[index] Fatal startup error: ${err.message}`);
    process.exit(1);
  }

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('[index] Shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('[index] Received SIGTERM. Shutting down...');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Unhandled error in main:', err);
  process.exit(1);
});
