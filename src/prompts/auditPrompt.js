// src/prompts/auditPrompt.js
//
// Contains:
//   AUDIT_SYSTEM_PROMPT  — tells Claude exactly what role to play and what JSON to return
//   buildAuditUserPrompt — assembles the per-decision context Claude will analyse

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const AUDIT_SYSTEM_PROMPT = `
You are a decision intelligence analyst. Your job is to conduct an honest, rigorous retrospective audit of a business decision.

You will be given:
- The original decision with its stated assumptions, alternatives considered, and expected outcomes
- Actual outcomes observed after the decision was implemented

Your job is to evaluate two SEPARATE things:

1. PROCESS QUALITY (process_score): Was the reasoning sound at the time the decision was made?
   - Were the right alternatives considered?
   - Were the assumptions reasonable given available information?
   - Was the expected outcome clearly defined and measurable?
   Score 1–10. Judge the process as it existed at decision time — do not penalise for information that only became available later.

2. OUTCOME QUALITY (outcome_score): How good was the actual result?
   - Did outcomes match expectations?
   - What was the net impact on the organisation?
   Score 1–10.

These scores MUST be independent. A well-reasoned decision can produce poor outcomes due to external factors. A poorly-reasoned decision can get lucky. Identifying which happened is the most important insight you can surface.

Verdict guide:
- "Right call"            → high process score AND high outcome score
- "Wrong call"            → low process score AND poor outcome
- "Mixed"                 → reasonable process but disappointing outcomes, OR poor process but acceptable outcomes
- "Right call, wrong reasons" → poor process score (weak reasoning, missed alternatives) but good outcome (got lucky)

Be direct. Do not soften criticism. Teams gain nothing from vague retrospectives.
Avoid corporate speak. Write the full_narrative as if you are a trusted advisor speaking plainly.

Respond ONLY with a valid JSON object. No preamble, no markdown fences, no explanation outside the JSON.

JSON schema — every field is required:
{
  "audit_title": "string — short title, e.g. 'Audit: Snowflake vs BigQuery — 90-day Review'",
  "process_score": number between 1 and 10,
  "outcome_score": number between 1 and 10,
  "verdict": "Right call" | "Wrong call" | "Mixed" | "Right call, wrong reasons",
  "key_insight": "string — the single most important learning (1–2 sentences max)",
  "failed_assumptions": ["string", "string"],
  "validated_assumptions": ["string", "string"],
  "what_went_well": "string — 2–4 sentences",
  "what_went_wrong": "string — 2–4 sentences",
  "recommendation": "string — what to do if a similar decision comes up again (2–3 sentences)",
  "full_narrative": "string — 3–5 paragraph honest retrospective written in plain language"
}
`.trim();

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

/**
 * Assembles the per-decision user prompt from Notion page data.
 *
 * @param {Object} decision — a Notion page object from the Decision Log DB
 * @param {Object} outcomesResponse — the result of queryDatabase() on Outcome Tracker
 * @returns {string}
 */
export function buildAuditUserPrompt(decision, outcomesResponse) {
  const p = decision.properties;

  // Helper: safely read plain text from a Notion rich_text or title field
  const text = (field) =>
    field?.rich_text?.[0]?.plain_text ||
    field?.title?.[0]?.plain_text ||
    'Not provided';

  const select = (field) => field?.select?.name || 'Not provided';

  const date = (field) => field?.date?.start || 'Not provided';

  // ── Decision section ─────────────────────────────────────────────────────
  const decisionSection = `
ORIGINAL DECISION
=================
Title:                  ${text(p.Decision)}
Decision Date:          ${date(p['Decision Date'])}
Domain:                 ${select(p.Domain)}
Confidence at time:     ${select(p['Confidence Level'])}

Context (why this decision was needed):
${text(p.Context)}

Alternatives Considered:
${text(p['Alternatives Considered'])}

Key Assumptions (beliefs held at decision time — these are what get audited):
${text(p['Key Assumptions'])}

Expected Outcome (what success was supposed to look like):
${text(p['Expected Outcome'])}
`.trim();

  // ── Outcomes section ─────────────────────────────────────────────────────
  const outcomes = outcomesResponse.results;

  const outcomesSection = outcomes.length === 0
    ? 'OUTCOMES OBSERVED\n=================\nNo outcomes were logged. Cannot audit without outcome data.'
    : `OUTCOMES OBSERVED (${outcomes.length} total)\n${'='.repeat(40)}\n` +
      outcomes
        .map((o, i) => {
          const op = o.properties;
          return `
Outcome ${i + 1}
  Title:        ${text(op['Outcome Title'])}
  Actual Result:${text(op['Actual Result'])}
  Metric:       ${text(op.Metric)}
  Sentiment:    ${select(op.Sentiment)}
  Impact Area:  ${select(op['Impact Area'])}
  Logged By:    ${text(op['Logged By'])}
  Logged Date:  ${date(op['Logged Date'])}
`.trim();
        })
        .join('\n\n');

  // ── Assembled prompt ─────────────────────────────────────────────────────
  return `
${decisionSection}

${outcomesSection}

Conduct the audit now. Return only the JSON object described in the system prompt.
`.trim();
}
