// scripts/seedTestData.js
// Seeds Notion with 3 realistic decisions + 1 outcome each.
// Run once to set up a full demo environment.
//
// Usage:
//   node scripts/seedTestData.js
//
// What it creates:
//   - 3 pages in Decision Log DB
//   - 3 pages in Outcome Tracker DB (each linked to its decision)
//
// After running, copy the printed decision page IDs and run:
//   node src/index.js audit <id>   (once per decision)
//   node src/index.js report

import 'dotenv/config';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Helpers — build typed Notion property objects
// ---------------------------------------------------------------------------

const title    = (t)    => ({ title:     [{ text: { content: String(t) } }] });
const richText = (t)    => ({ rich_text: [{ text: { content: String(t ?? '') } }] });
const select   = (name) => ({ select: { name } });
const date     = (d)    => ({ date: { start: d } });

/** Returns a YYYY-MM-DD string offset by `days` from today. */
function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------

const DECISIONS = [
  {
    Decision:                'Migrated from REST to GraphQL API',
    Context:                 'Frontend team was making too many over-fetching calls, causing slow page loads and excessive bandwidth usage. Product manager escalated after customers complained about dashboard load times.',
    'Alternatives Considered': 'REST with stricter endpoint contracts, tRPC for type-safe RPC, keeping REST and adding a BFF (Backend for Frontend) layer.',
    'Key Assumptions':       'GraphQL would reduce payload size by 40%. Frontend team would ramp up in 2 weeks. Migration would have zero downtime. Third-party clients could be updated in parallel.',
    'Expected Outcome':      '30% reduction in API response time within 60 days. Frontend team fully productive on GraphQL within 3 weeks.',
    'Decision Maker':        'Engineering Lead',
    Domain:                  'Engineering',
    'Review Window':         '90 days',
    'Review Date':           offsetDate(-1),   // yesterday — ready to audit
    'Decision Date':         offsetDate(-91),
    Status:                  'Outcomes Logged',
    'Confidence Level':      'High',
    Tags:                    ['API', 'Performance'],
  },
  {
    Decision:                'Hired a contractor for frontend work',
    Context:                 'Full-time hire was taking too long (3 months into search with no offer accepted). Product deadline for the customer portal feature was 6 weeks away. Internal team was fully allocated.',
    'Alternatives Considered': 'Delay the feature by one quarter, redistribute work across existing engineers (causing other project delays), hire through a staffing agency.',
    'Key Assumptions':       'Contractor would onboard in 1 week. Total cost would be $5,000. Scope was well-defined enough for a contractor to execute independently. Quality review would take 3 days at the end.',
    'Expected Outcome':      'Customer portal feature shipped within 6 weeks. Contractor produces production-ready code with minimal cleanup required.',
    'Decision Maker':        'Product Manager',
    Domain:                  'Hiring',
    'Review Window':         '60 days',
    'Review Date':           offsetDate(-1),
    'Decision Date':         offsetDate(-61),
    Status:                  'Outcomes Logged',
    'Confidence Level':      'Medium',
    Tags:                    ['Hiring', 'Contractor'],
  },
  {
    Decision:                'Chose PostgreSQL over MongoDB',
    Context:                 'Needed to pick a primary database for a new internal operations tool being built from scratch. Team had 4 weeks to make a decision before development kicked off.',
    'Alternatives Considered': 'MongoDB (document store, more flexible schema), MySQL (familiar but older tooling), SQLite (too limited for multi-user), DynamoDB (overkill for internal tool scale).',
    'Key Assumptions':       'Data model is inherently relational — entities have clear relationships. Existing team has strong SQL knowledge. Query patterns are known upfront. No need for horizontal sharding at current scale.',
    'Expected Outcome':      'Core report queries run under 100ms. Zero schema migration issues in first 90 days. Team onboards to new codebase without database friction.',
    'Decision Maker':        'Tech Lead',
    Domain:                  'Engineering',
    'Review Window':         '90 days',
    'Review Date':           offsetDate(-1),
    'Decision Date':         offsetDate(-91),
    Status:                  'Outcomes Logged',
    'Confidence Level':      'High',
    Tags:                    ['Database', 'Architecture'],
  },
];

const OUTCOMES = [
  {
    'Outcome Title':  'GraphQL migration — 90-day results',
    'Actual Result':  'Migration completed but took 5 weeks instead of the expected 2. Payload size reduced but team productivity dropped significantly during the transition period. Two frontend engineers required external training. Third-party client updates are still ongoing at review date.',
    Metric:           'API response time: down 18% (expected 30%). Dev velocity: down 25% for first 4 weeks. Training cost: $1,200 unbudgeted.',
    Sentiment:        'Worse than expected',
    'Logged By':      'Engineering Lead',
    'Logged Date':    offsetDate(0),
    'Impact Area':    'Time',
  },
  {
    'Outcome Title':  'Frontend contractor — delivery results',
    'Actual Result':  'Feature delivered in 8 weeks, 2 weeks past deadline. Onboarding took 2.5 weeks, not 1. Final cost was $7,200 due to scope expansion mid-project. Code quality was high — required minimal cleanup and passed review on first attempt.',
    Metric:           'Cost: $7,200 actual vs $5,000 expected (+44%). Timeline: 8 weeks actual vs 6 weeks expected. Code review score: 8.5/10.',
    Sentiment:        'Worse than expected',
    'Logged By':      'Product Manager',
    'Logged Date':    offsetDate(0),
    'Impact Area':    'Cost',
  },
  {
    'Outcome Title':  'PostgreSQL — 90-day performance results',
    'Actual Result':  'Database choice exceeded expectations on all fronts. Query performance was well under target, team onboarded quickly, and the relational model proved to be exactly the right fit. No schema migrations were needed in the 90-day window.',
    Metric:           'Core report queries: avg 45ms (target: under 100ms). Schema migrations: 0. Developer onboarding friction: none reported. Uptime: 100%.',
    Sentiment:        'Better than expected',
    'Logged By':      'Tech Lead',
    'Logged Date':    offsetDate(0),
    'Impact Area':    'Quality',
  },
];

// ---------------------------------------------------------------------------
// Create one Decision page
// ---------------------------------------------------------------------------

async function createDecision(data) {
  const props = {
    Decision:                  title(data.Decision),
    Context:                   richText(data.Context),
    'Alternatives Considered': richText(data['Alternatives Considered']),
    'Key Assumptions':         richText(data['Key Assumptions']),
    'Expected Outcome':        richText(data['Expected Outcome']),
    'Decision Maker':          richText(data['Decision Maker']),
    Domain:                    select(data.Domain),
    'Review Window':           select(data['Review Window']),
    'Review Date':             date(data['Review Date']),
    'Decision Date':           date(data['Decision Date']),
    Status:                    select(data.Status),
    'Confidence Level':        select(data['Confidence Level']),
  };

  // Tags is multi-select — different shape
  if (data.Tags?.length) {
    props.Tags = { multi_select: data.Tags.map((t) => ({ name: t })) };
  }

  const page = await notion.pages.create({
    parent: { database_id: process.env.NOTION_DECISION_LOG_DB },
    properties: props,
  });

  return page.id;
}

// ---------------------------------------------------------------------------
// Create one Outcome page linked to a decision
// ---------------------------------------------------------------------------

async function createOutcome(data, decisionPageId) {
  const props = {
    'Outcome Title':    title(data['Outcome Title']),
    'Actual Result':    richText(data['Actual Result']),
    Metric:             richText(data.Metric),
    Sentiment:          select(data.Sentiment),
    'Logged By':        richText(data['Logged By']),
    'Logged Date':      date(data['Logged Date']),
    'Impact Area':      select(data['Impact Area']),
    'Linked Decision':  { relation: [{ id: decisionPageId }] },
  };

  const page = await notion.pages.create({
    parent: { database_id: process.env.NOTION_OUTCOME_TRACKER_DB },
    properties: props,
  });

  return page.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  console.log('\n🌱 Seeding Notion with test data...\n');

  const results = [];

  for (let i = 0; i < DECISIONS.length; i++) {
    const decisionData = DECISIONS[i];
    const outcomeData  = OUTCOMES[i];

    console.log(`  Creating decision ${i + 1}/3: "${decisionData.Decision}"`);
    const decisionId = await createDecision(decisionData);
    console.log(`  ✅ Decision created: ${decisionId}`);

    await sleep(400); // stay under Notion rate limit

    console.log(`  Creating outcome for decision ${i + 1}/3...`);
    const outcomeId = await createOutcome(outcomeData, decisionId);
    console.log(`  ✅ Outcome created:  ${outcomeId}`);

    results.push({ decision: decisionData.Decision, decisionId, outcomeId });

    await sleep(400);
    console.log();
  }

  // ---------------------------------------------------------------------------
  // Print summary + next steps
  // ---------------------------------------------------------------------------
  console.log('─'.repeat(60));
  console.log('✅ Seeding complete!\n');
  console.log('Decision Page IDs (copy these for the next step):');
  results.forEach((r, i) => {
    console.log(`\n  ${i + 1}. ${r.decision}`);
    console.log(`     Decision ID : ${r.decisionId}`);
    console.log(`     Outcome ID  : ${r.outcomeId}`);
  });

  console.log('\n' + '─'.repeat(60));
  console.log('\n📋 Next steps — run these commands:\n');
  results.forEach((r) => {
    // Strip hyphens from ID for the CLI command (both formats work but this is cleaner)
    const cleanId = r.decisionId.replace(/-/g, '');
    console.log(`  node src/index.js audit ${cleanId}`);
  });
  console.log('\n  Then after all audits complete:');
  console.log('  node src/index.js report\n');
}

seed().catch((err) => {
  console.error('\n❌ Seeding failed:', err.message);
  if (err.code === 'validation_error') {
    console.error('\nNotion validation error — check that your database schemas');
    console.error('match the expected field names and types in PROJECT_INSTRUCTIONS.md');
  }
  process.exit(1);
});
