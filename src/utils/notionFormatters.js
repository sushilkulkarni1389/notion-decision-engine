// src/utils/notionFormatters.js
// Two responsibilities:
//   1. Property formatters  — build the typed property objects Notion API expects
//                             when creating or updating a page (notionTitle, notionSelect, etc.)
//   2. Block constructors   — build page body blocks (paragraphs, headings, callouts, etc.)
//
// Notion constraints:
//   - Each rich_text content string is capped at 2000 characters
//   - appendBlocks accepts max 100 blocks per call (handled by notionClient)
//   - All block objects must include `object: 'block'`

// ---------------------------------------------------------------------------
// Property formatters  (used in createPage / updatePage properties objects)
// ---------------------------------------------------------------------------

/** Title property — e.g. the main page name */
export function notionTitle(text) {
  return { title: [{ text: { content: String(text ?? '') } }] };
}

/** Rich text property — for Text fields */
export function notionRichText(text) {
  return { rich_text: [{ text: { content: String(text ?? '').slice(0, 2000) } }] };
}

/** Number property */
export function notionNumber(value) {
  return { number: value ?? null };
}

/** Select property — single option */
export function notionSelect(name) {
  if (!name) return { select: null };
  return { select: { name: String(name) } };
}

/** Date property — accepts a YYYY-MM-DD string or a Date object */
export function notionDate(value) {
  if (!value) return { date: null };
  const start = value instanceof Date ? value.toISOString().split('T')[0] : String(value);
  return { date: { start } };
}

/** Relation property — accepts a single page ID string or an array of IDs */
export function notionRelation(ids) {
  const arr = Array.isArray(ids) ? ids : [ids];
  return { relation: arr.filter(Boolean).map((id) => ({ id })) };
}

// ---------------------------------------------------------------------------
// Low-level block constructors
// ---------------------------------------------------------------------------

export function headingBlock(text, level = 2) {
  const type = `heading_${level}`;
  return {
    object: 'block',
    type,
    [type]: { rich_text: richText(text) },
  };
}

export function paragraphBlock(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(text) },
  };
}

export function calloutBlock(text, emoji = '💡') {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: richText(text),
      icon: { type: 'emoji', emoji },
    },
  };
}

export function dividerBlock() {
  return { object: 'block', type: 'divider', divider: {} };
}

export function bulletBlock(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(text) },
  };
}

export function quoteBlock(text) {
  return {
    object: 'block',
    type: 'quote',
    quote: { rich_text: richText(text) },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a string into a Notion rich_text array.
 * Notion caps each text content at 2000 chars — but richText itself only
 * handles ONE segment. Use chunkParagraphs() for long strings.
 */
function richText(text) {
  const safe = String(text ?? '').slice(0, 2000);
  return [{ type: 'text', text: { content: safe } }];
}

/**
 * Splits a long string into multiple paragraph blocks, each ≤ 2000 chars.
 * Tries to split on sentence boundaries first; falls back to hard-split.
 */
export function chunkParagraphs(text) {
  if (!text) return [paragraphBlock('')];
  const str = String(text);
  if (str.length <= 2000) return [paragraphBlock(str)];

  const chunks = [];
  let remaining = str;

  while (remaining.length > 2000) {
    // Try to split on the last sentence-ending punctuation before 2000 chars
    const slice = remaining.slice(0, 2000);
    const lastBreak = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('\n')
    );
    const cutAt = lastBreak > 1000 ? lastBreak + 1 : 2000;
    chunks.push(paragraphBlock(remaining.slice(0, cutAt).trim()));
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(paragraphBlock(remaining));
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Audit Report page body builder  (used by auditEngine.js)
// ---------------------------------------------------------------------------

/**
 * Converts a Claude audit JSON object into an array of Notion blocks
 * for the Audit Report page body.
 *
 * @param {object} audit - Parsed Claude JSON from auditPrompt
 */
export function buildAuditBlocks(audit) {
  const blocks = [];

  // ── Header ────────────────────────────────────────────────────────────────
  blocks.push(headingBlock('🔍 Decision Audit', 1));
  blocks.push(dividerBlock());

  // ── Scores at a glance ────────────────────────────────────────────────────
  blocks.push(headingBlock('Scores at a Glance', 2));
  blocks.push(bulletBlock(`Process Score: ${audit.process_score} / 10 — Was the reasoning sound?`));
  blocks.push(bulletBlock(`Outcome Score: ${audit.outcome_score} / 10 — Was the result good?`));
  blocks.push(bulletBlock(`Verdict: ${audit.verdict}`));
  blocks.push(dividerBlock());

  // ── Key Insight (callout) ─────────────────────────────────────────────────
  blocks.push(headingBlock('Key Insight', 2));
  blocks.push(calloutBlock(audit.key_insight || '—', '💡'));
  blocks.push(dividerBlock());

  // ── Assumptions ───────────────────────────────────────────────────────────
  blocks.push(headingBlock('Assumptions Review', 2));

  if (audit.failed_assumptions?.length > 0) {
    blocks.push(paragraphBlock('❌  Failed Assumptions'));
    audit.failed_assumptions.forEach(a => blocks.push(bulletBlock(a)));
  }

  if (audit.validated_assumptions?.length > 0) {
    blocks.push(paragraphBlock('✅  Validated Assumptions'));
    audit.validated_assumptions.forEach(a => blocks.push(bulletBlock(a)));
  }

  blocks.push(dividerBlock());

  // ── What went well / wrong ────────────────────────────────────────────────
  blocks.push(headingBlock('What Went Well', 2));
  blocks.push(...chunkParagraphs(audit.what_went_well));

  blocks.push(headingBlock('What Went Wrong', 2));
  blocks.push(...chunkParagraphs(audit.what_went_wrong));

  blocks.push(dividerBlock());

  // ── Recommendation ────────────────────────────────────────────────────────
  blocks.push(headingBlock('Recommendation', 2));
  blocks.push(calloutBlock(audit.recommendation || '—', '📌'));
  blocks.push(dividerBlock());

  // ── Full narrative ────────────────────────────────────────────────────────
  blocks.push(headingBlock('Full Retrospective', 2));
  blocks.push(...chunkParagraphs(audit.full_narrative));

  return blocks;
}

// ---------------------------------------------------------------------------
// Monthly Pattern Report page body builder  (used by patternEngine.js)
// ---------------------------------------------------------------------------

/**
 * Converts a Claude pattern report JSON + aggregated stats into Notion blocks.
 *
 * @param {object} report     - Parsed Claude JSON from patternPrompt
 * @param {object} aggregated - The aggregated stats object from patternEngine
 */
export function buildPatternBlocks(report, aggregated) {
  const blocks = [];

  // ── Header ────────────────────────────────────────────────────────────────
  blocks.push(headingBlock('📊 Monthly Decision Health Report', 1));
  blocks.push(dividerBlock());

  // ── Summary callout ───────────────────────────────────────────────────────
  blocks.push(calloutBlock(report.summary || '—', '📋'));
  blocks.push(dividerBlock());

  // ── Stats overview ────────────────────────────────────────────────────────
  blocks.push(headingBlock('Stats Overview', 2));
  blocks.push(bulletBlock(`Audits analyzed: ${aggregated.totalAudits}`));
  blocks.push(bulletBlock(`Avg Process Score: ${aggregated.avgProcessScore} / 10`));
  blocks.push(bulletBlock(`Avg Outcome Score: ${aggregated.avgOutcomeScore} / 10`));
  blocks.push(bulletBlock(`Process Score Trend: ${report.process_score_trend}`));
  blocks.push(bulletBlock(`Outcome Score Trend: ${report.outcome_score_trend}`));

  // Verdict distribution
  if (Object.keys(aggregated.verdictDistribution).length > 0) {
    blocks.push(paragraphBlock('Verdict breakdown:'));
    Object.entries(aggregated.verdictDistribution).forEach(([verdict, count]) => {
      blocks.push(bulletBlock(`${verdict}: ${count}`));
    });
  }

  blocks.push(dividerBlock());

  // ── Domain breakdown ──────────────────────────────────────────────────────
  if (aggregated.domainBreakdown?.length > 0) {
    blocks.push(headingBlock('Domain Breakdown', 2));
    aggregated.domainBreakdown.forEach(d => {
      blocks.push(
        bulletBlock(
          `${d.domain} — ${d.count} audit(s) | Process: ${d.avgProcessScore} | Outcome: ${d.avgOutcomeScore}`
        )
      );
    });
    blocks.push(dividerBlock());
  }

  // ── Patterns identified ───────────────────────────────────────────────────
  if (report.patterns?.length > 0) {
    blocks.push(headingBlock('Patterns Identified', 2));

    report.patterns.forEach((pattern, i) => {
      blocks.push(headingBlock(`${i + 1}. ${pattern.title}`, 3));
      blocks.push(paragraphBlock(`📎 Evidence: ${pattern.evidence}`));
      blocks.push(calloutBlock(`💬 Recommendation: ${pattern.recommendation}`, '🎯'));
    });

    blocks.push(dividerBlock());
  }

  // ── Blind spot + one thing to change ─────────────────────────────────────
  blocks.push(headingBlock('Biggest Blind Spot', 2));
  blocks.push(calloutBlock(report.biggest_blind_spot || '—', '⚠️'));

  blocks.push(headingBlock('One Thing to Change', 2));
  blocks.push(calloutBlock(report.one_thing_to_change || '—', '🔧'));
  blocks.push(dividerBlock());

  // ── Full narrative ────────────────────────────────────────────────────────
  blocks.push(headingBlock('Full Report', 2));
  blocks.push(...chunkParagraphs(report.full_narrative));

  return blocks;
}