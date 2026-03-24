// src/prompts/patternPrompt.js
// Claude prompts for the monthly pattern / health report

export const PATTERN_SYSTEM_PROMPT = `
You are a decision intelligence analyst conducting a monthly review of an organization's decision-making health.

You will receive a summary of all decisions audited in the past 90 days, including aggregate statistics and
individual audit summaries.

Identify:
1. Systematic biases (e.g., consistent overconfidence, underestimating specific cost categories)
2. Domain-specific patterns (e.g., "engineering decisions score better than finance decisions")
3. Timing patterns (e.g., "rushed decisions consistently underperform")
4. Improving or declining trends in process quality vs outcome quality

Be specific, not generic. Avoid advice like "make better decisions."
Point to concrete patterns in the data with specific numbers and examples.

Respond ONLY with valid JSON. No preamble, no markdown fences, no explanation outside the JSON.

JSON schema:
{
  "report_title": "string — e.g. 'Decision Health Report — March 2026'",
  "summary": "string — 2–3 sentences capturing the headline story of this month's data",
  "patterns": [
    {
      "title": "string — short label for the pattern",
      "evidence": "string — specific data points from the audits that prove this pattern",
      "recommendation": "string — concrete action to address this pattern"
    }
  ],
  "process_score_trend": "Improving" | "Declining" | "Stable",
  "outcome_score_trend": "Improving" | "Declining" | "Stable",
  "biggest_blind_spot": "string — the most important thing this team is consistently missing",
  "one_thing_to_change": "string — the single highest-leverage change this team could make next month",
  "full_narrative": "string — full monthly report narrative, 4–6 paragraphs, plain language"
}
`;

/**
 * Builds the user-facing prompt from aggregated audit data.
 *
 * @param {object} aggregated - Output from patternEngine's aggregation step:
 *   {
 *     totalAudits,
 *     avgProcessScore,
 *     avgOutcomeScore,
 *     verdictDistribution,   // { "Right call": 2, "Mixed": 1, ... }
 *     domainBreakdown,       // [{ domain, count, avgProcessScore, avgOutcomeScore }]
 *     period,                // "March 2026"
 *     audits: [{             // one entry per audit
 *       title, processScore, outcomeScore, verdict,
 *       keyInsight, failedAssumptions, recommendation, auditDate, domain
 *     }]
 *   }
 */
export function buildPatternUserPrompt(aggregated) {
  const {
    totalAudits,
    avgProcessScore,
    avgOutcomeScore,
    verdictDistribution,
    domainBreakdown,
    period,
    audits,
  } = aggregated;

  // --- Verdict distribution summary ---
  const verdictLines = Object.entries(verdictDistribution)
    .map(([verdict, count]) => `  ${verdict}: ${count}`)
    .join('\n');

  // --- Domain breakdown table ---
  const domainLines = domainBreakdown
    .map(
      d =>
        `  ${d.domain}: ${d.count} audit(s) | avg process ${d.avgProcessScore} | avg outcome ${d.avgOutcomeScore}`
    )
    .join('\n');

  // --- Individual audit summaries ---
  const auditLines = audits
    .map(
      (a, i) => `
Audit ${i + 1}: ${a.title}
  Date: ${a.auditDate}
  Domain: ${a.domain}
  Process Score: ${a.processScore ?? 'N/A'} / 10
  Outcome Score: ${a.outcomeScore ?? 'N/A'} / 10
  Verdict: ${a.verdict}
  Key Insight: ${a.keyInsight || '—'}
  Failed Assumptions: ${a.failedAssumptions || '—'}
  Recommendation: ${a.recommendation || '—'}`
    )
    .join('\n');

  return `
MONTHLY DECISION HEALTH REPORT — ${period}

=== AGGREGATE STATISTICS ===
Total Audits in Window: ${totalAudits}
Average Process Score:  ${avgProcessScore} / 10
Average Outcome Score:  ${avgOutcomeScore} / 10

Verdict Distribution:
${verdictLines}

Domain Breakdown:
${domainLines}

=== INDIVIDUAL AUDIT SUMMARIES ===
${auditLines}

Analyze the above data and generate the monthly pattern report.
Focus on what the numbers reveal about this team's decision-making habits — both good and bad.
Be honest. Be specific. Cite audit titles and scores when making claims.
`.trim();
}
