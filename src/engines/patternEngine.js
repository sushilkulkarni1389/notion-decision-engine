// src/engines/patternEngine.js
// Runs on the 1st of each month (triggered by scheduler.js).
// Reads all audit pages from the last 90 days, aggregates stats,
// calls Claude for pattern analysis, and writes a Monthly Pattern Report
// page into the Notion Pattern Reports DB.

import { notionClient } from '../clients/notionClient.js';
import { claudeClient } from '../clients/claudeClient.js';
import { logger } from '../utils/logger.js';
import { PATTERN_SYSTEM_PROMPT, buildPatternUserPrompt } from '../prompts/patternPrompt.js';
import { buildPatternBlocks } from '../utils/notionFormatters.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Returns a YYYY-MM-DD string for `days` days ago. */
function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

/** "March 2026" */
function getCurrentPeriod() {
  return new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
}

/** Average of a number array, rounded to 1 decimal. Returns 0 for empty arrays. */
function avg(nums) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Step 1: Query audit pages from the last 90 days
// ---------------------------------------------------------------------------

async function fetchRecentAudits() {
  const since = getDateDaysAgo(90);
  logger.info(`Fetching audits since ${since}`);

  const result = await notionClient.queryDatabase(
    process.env.NOTION_AUDIT_REPORTS_DB,
    {
      and: [
        { property: 'Audit Date', date: { on_or_after: since } },
        { property: 'Audit Status', select: { equals: 'Published' } },
      ],
    },
    [{ property: 'Audit Date', direction: 'descending' }]
  );

  return result.results;
}

// ---------------------------------------------------------------------------
// Step 2: Enrich each audit with domain from linked Decision
// ---------------------------------------------------------------------------

async function enrichWithDomain(audits) {
  const enriched = [];

  for (const audit of audits) {
    await sleep(350); // Notion rate limit: 3 req/sec

    const linkedIds =
      audit.properties['Linked Decision']?.relation?.map((r) => r.id) ?? [];

    let domain = 'Unknown';
    if (linkedIds.length > 0) {
      try {
        const decisionPage = await notionClient.getPage(linkedIds[0]);
        domain = decisionPage.properties.Domain?.select?.name ?? 'Unknown';
      } catch (err) {
        logger.warn(
          `Could not fetch linked decision for audit ${audit.id}: ${err.message}`
        );
      }
    }

    enriched.push({
      id: audit.id,
      title:
        audit.properties['Audit Title']?.title?.[0]?.plain_text ?? 'Untitled',
      processScore: audit.properties['Process Score']?.number ?? null,
      outcomeScore: audit.properties['Outcome Score']?.number ?? null,
      verdict: audit.properties.Verdict?.select?.name ?? 'Unknown',
      keyInsight:
        audit.properties['Key Insight']?.rich_text?.[0]?.plain_text ?? '',
      failedAssumptions:
        audit.properties['Failed Assumptions']?.rich_text?.[0]?.plain_text ??
        '',
      recommendation:
        audit.properties.Recommendation?.rich_text?.[0]?.plain_text ?? '',
      auditDate: audit.properties['Audit Date']?.date?.start ?? '',
      domain,
    });
  }

  return enriched;
}

// ---------------------------------------------------------------------------
// Step 3: Aggregate stats across all enriched audits
// ---------------------------------------------------------------------------

function aggregateStats(enrichedAudits) {
  const processScores = enrichedAudits
    .map((a) => a.processScore)
    .filter((n) => n !== null);
  const outcomeScores = enrichedAudits
    .map((a) => a.outcomeScore)
    .filter((n) => n !== null);

  // Verdict distribution: { "Right call": 2, "Mixed": 1, ... }
  const verdictDistribution = {};
  for (const a of enrichedAudits) {
    verdictDistribution[a.verdict] =
      (verdictDistribution[a.verdict] ?? 0) + 1;
  }

  // Domain breakdown: per-domain score averages
  const domainMap = {};
  for (const a of enrichedAudits) {
    if (!domainMap[a.domain]) {
      domainMap[a.domain] = { processScores: [], outcomeScores: [], count: 0 };
    }
    domainMap[a.domain].count++;
    if (a.processScore !== null)
      domainMap[a.domain].processScores.push(a.processScore);
    if (a.outcomeScore !== null)
      domainMap[a.domain].outcomeScores.push(a.outcomeScore);
  }

  const domainBreakdown = Object.entries(domainMap).map(([domain, stats]) => ({
    domain,
    count: stats.count,
    avgProcessScore: avg(stats.processScores),
    avgOutcomeScore: avg(stats.outcomeScores),
  }));

  return {
    totalAudits: enrichedAudits.length,
    avgProcessScore: avg(processScores),
    avgOutcomeScore: avg(outcomeScores),
    verdictDistribution,
    domainBreakdown,
    period: getCurrentPeriod(),
    audits: enrichedAudits,
  };
}

// ---------------------------------------------------------------------------
// Step 4: Call Claude for pattern analysis
// ---------------------------------------------------------------------------

async function callClaudeForPatterns(aggregated) {
  const userPrompt = buildPatternUserPrompt(aggregated);

  let raw;
  try {
    raw = await claudeClient.analyze(PATTERN_SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    logger.error('Claude API call failed in patternEngine:', err.message);
    throw err;
  }

  // Strip markdown fences if Claude wraps in ```json ... ```
  const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  let report;
  try {
    report = JSON.parse(clean);
  } catch (parseErr) {
    logger.error('Failed to parse Claude pattern report JSON. Raw response:');
    logger.error(raw);
    throw new Error(`JSON parse failed: ${parseErr.message}`);
  }

  return report;
}

// ---------------------------------------------------------------------------
// Step 5: Build Notion page properties from Claude's report
// ---------------------------------------------------------------------------

function buildReportProperties(report, aggregated) {
  const title =
    report.report_title ||
    `Decision Health Report — ${aggregated.period}`;

  return {
    'Report Title': {
      title: [{ text: { content: title } }],
    },
    Period: {
      rich_text: [{ text: { content: aggregated.period } }],
    },
    'Decisions Audited': {
      number: aggregated.totalAudits,
    },
    'Avg Process Score': {
      number: aggregated.avgProcessScore,
    },
    'Avg Outcome Score': {
      number: aggregated.avgOutcomeScore,
    },
    'Top Pattern': {
      rich_text: [
        { text: { content: report.patterns?.[0]?.title ?? '' } },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Main export: generateMonthlyReport()
// ---------------------------------------------------------------------------

/**
 * Generates a Monthly Pattern Report page in Notion.
 * Called by scheduler.js on the 1st of each month, and also available
 * via CLI: `node src/index.js report`
 *
 * @returns {string|null} The created Notion page ID, or null if no audits found.
 */
export async function generateMonthlyReport() {
  logger.info('=== Starting monthly pattern report generation ===');

  // 1. Fetch recent audits
  let rawAudits;
  try {
    rawAudits = await fetchRecentAudits();
  } catch (err) {
    logger.error('Failed to fetch recent audits:', err.message);
    throw err;
  }

  logger.info(`Found ${rawAudits.length} published audit(s) in the last 90 days`);

  if (rawAudits.length === 0) {
    logger.warn('No audits found in the last 90 days — skipping monthly report');
    return null;
  }

  // 2. Enrich with domain
  logger.info('Enriching audits with domain data from linked decisions...');
  const enrichedAudits = await enrichWithDomain(rawAudits);

  // 3. Aggregate
  const aggregated = aggregateStats(enrichedAudits);
  logger.info(
    `Aggregated: avgProcess=${aggregated.avgProcessScore}, avgOutcome=${aggregated.avgOutcomeScore}`
  );
  logger.info('Verdict distribution:', aggregated.verdictDistribution);

  // 4. Call Claude
  logger.info('Calling Claude for pattern analysis...');
  const report = await callClaudeForPatterns(aggregated);
  logger.info(`Claude returned report: "${report.report_title}"`);

  // 5. Build Notion properties + page body
  const properties = buildReportProperties(report, aggregated);
  const bodyBlocks = buildPatternBlocks(report, aggregated);

  // 6. Create the page in Notion
  logger.info('Creating Monthly Pattern Report page in Notion...');
  let reportPageId;
  try {
    reportPageId = await notionClient.createPage(
      process.env.NOTION_PATTERN_REPORTS_DB,
      properties,
      bodyBlocks
    );
  } catch (err) {
    logger.error('Failed to create pattern report page in Notion:', err.message);
    throw err;
  }

  logger.info(
    `=== Monthly pattern report complete: ${reportPageId} (${aggregated.period}) ===`
  );
  return reportPageId;
}
