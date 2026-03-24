// scripts/seedTestData.js
// Full demo setup in one command:
//   1. Wipes all 4 Notion databases (clean slate)
//   2. Seeds 3 realistic decisions + outcomes
//   3. Runs all 3 audits automatically
//   4. Generates the monthly pattern report
//   5. Prints a summary with direct Notion links
//
// Usage:
//   node scripts/seedTestData.js

import 'dotenv/config';
import { Client } from '@notionhq/client';
import { runAudit } from '../src/engines/auditEngine.js';
import { generateMonthlyReport } from '../src/engines/patternEngine.js';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Notion property helpers
// ---------------------------------------------------------------------------

const title    = (t) => ({ title:     [{ text: { content: String(t ?? '') } }] });
const richText = (t) => ({ rich_text: [{ text: { content: String(t ?? '') } }] });
const select   = (n) => ({ select: { name: n } });
const date     = (d) => ({ date: { start: d } });

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Step 1 — Wipe all 4 databases
// ---------------------------------------------------------------------------

async function archiveAllPages(databaseId, label) {
  let archived = 0;
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of res.results) {
      await notion.pages.update({ page_id: page.id, archived: true });
      await sleep(350);
      archived++;
    }

    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`  🗑️  ${label}: ${archived} page(s) archived`);
}

async function wipeAllDatabases() {
  console.log('\n🧹 Wiping existing data from all databases...\n');
  await archiveAllPages(process.env.NOTION_PATTERN_REPORTS_DB, 'Pattern Reports');
  await archiveAllPages(process.env.NOTION_AUDIT_REPORTS_DB,   'Audit Reports  ');
  await archiveAllPages(process.env.NOTION_OUTCOME_TRACKER_DB, 'Outcome Tracker');
  await archiveAllPages(process.env.NOTION_DECISION_LOG_DB,    'Decision Log   ');
  console.log('\n  ✅ All databases are clean.\n');
}

// ---------------------------------------------------------------------------
// Step 2 — Seed data
// Three decisions across different domains designed to produce varied verdicts:
//   1. Jira → Linear    (Ops)         → Right call
//   2. No free trial    (Product)     → Wrong call
//   3. Jenkins → GH Actions (Eng)    → Mixed
// ---------------------------------------------------------------------------

const DECISIONS = [
  {
    Decision:                  'Switched from Jira to Linear for project tracking',
    Context:                   'Engineering team was spending 2+ hours per week on Jira admin overhead. Tickets were inconsistently structured, sprint planning took too long, and engineers complained the tool slowed them down more than it helped. A team survey showed 78% dissatisfaction with the current setup.',
    'Alternatives Considered': 'Keeping Jira but restricting workflows to reduce complexity, moving to Notion for project tracking, evaluating Shortcut (formerly Clubhouse).',
    'Key Assumptions':         "Team would adopt Linear within 2 weeks. Migration of historical tickets would take 3 days. Linear's opinionated structure would reduce admin overhead by 60%. Product and design would adapt quickly despite not being the primary users.",
    'Expected Outcome':        'Engineering admin overhead reduced from 2 hours/week to under 30 mins. Sprint velocity improves by 15% within 60 days due to less friction in the process.',
    'Decision Maker':          'Engineering Manager',
    Domain:                    'Ops',
    'Review Window':           '60 days',
    'Review Date':             offsetDate(-1),
    'Decision Date':           offsetDate(-61),
    Status:                    'Outcomes Logged',
    'Confidence Level':        'High',
    Tags:                      ['Tooling', 'Process'],
  },
  {
    Decision:                  'Launched paid tier without a free trial',
    Context:                   'Product was ready to monetise after 8 months of free beta. Leadership debated offering a 14-day free trial vs going straight to paid. The argument for skipping the trial was that it would attract more serious customers and reduce support load from low-intent users.',
    'Alternatives Considered': '14-day free trial, freemium model with feature limits, credit-card-required trial, delayed paywall (free for 3 months then auto-charge).',
    'Key Assumptions':         'Beta users had strong enough intent to convert without a trial. $49/month price point was low enough to reduce trial friction. Paid-only would filter out noise and improve support quality. Conversion from waitlist would be 25%.',
    'Expected Outcome':        '25% conversion of beta users to paid within 30 days. Support ticket volume stays manageable. MRR reaches $10,000 within 60 days of launch.',
    'Decision Maker':          'CEO',
    Domain:                    'Product',
    'Review Window':           '60 days',
    'Review Date':             offsetDate(-1),
    'Decision Date':           offsetDate(-61),
    Status:                    'Outcomes Logged',
    'Confidence Level':        'Medium',
    Tags:                      ['Monetisation', 'Growth'],
  },
  {
    Decision:                  'Migrated CI/CD pipeline from Jenkins to GitHub Actions',
    Context:                   'Jenkins server required constant maintenance — 3 incidents in the last quarter caused deployment delays. The DevOps engineer maintaining it left the company, leaving institutional knowledge gaps. GitHub Actions was already partially used for linting.',
    'Alternatives Considered': 'Hiring a DevOps contractor to fix and maintain Jenkins, migrating to CircleCI, migrating to GitLab CI, keeping Jenkins and writing better runbooks.',
    'Key Assumptions':         "Migration would take 2 weeks. GitHub Actions costs would be under $200/month. All existing pipelines could be replicated without major refactoring. Team would be self-sufficient on Actions within 1 month.",
    'Expected Outcome':        'Zero CI-related incidents in the 90 days post-migration. Deployment time reduced from 18 mins average to under 10 mins. No dependency on a single person to maintain the pipeline.',
    'Decision Maker':          'Tech Lead',
    Domain:                    'Engineering',
    'Review Window':           '90 days',
    'Review Date':             offsetDate(-1),
    'Decision Date':           offsetDate(-91),
    Status:                    'Outcomes Logged',
    'Confidence Level':        'High',
    Tags:                      ['DevOps', 'Infrastructure'],
  },
];

const OUTCOMES = [
  {
    'Outcome Title': 'Linear adoption — 60-day results',
    'Actual Result': 'Team adopted Linear faster than expected — fully onboarded in 10 days, not 14. Historical ticket migration was rougher than planned (took 6 days and required manual cleanup of ~200 tickets) but engineers immediately felt the difference. Sprint planning meetings dropped from 90 mins to 45 mins. Product and design adapted within 3 weeks with no major complaints.',
    Metric:          'Admin overhead: down from 2hrs/week to 20 mins/week (target: 30 mins). Sprint velocity: up 22% (target: 15%). Migration time: 6 days vs 3 expected. Tool satisfaction: 91% positive.',
    Sentiment:       'Better than expected',
    'Logged By':     'Engineering Manager',
    'Logged Date':   offsetDate(0),
    'Impact Area':   'Time',
  },
  {
    'Outcome Title': 'Paid tier launch — 60-day conversion results',
    'Actual Result': 'Conversion rate from beta to paid was 9%, far below the 25% target. Most non-converting users cited wanting to try before committing. Support quality did improve — fewer tickets, higher intent users. However, MRR reached only $3,200 vs the $10,000 target. The decision was reversed at day 45 — a 14-day trial was introduced and conversion immediately improved to 19%.',
    Metric:          'Conversion rate: 9% (target: 25%). MRR at day 60: $3,200 (target: $10,000). Support tickets: down 40%. Decision reversed at day 45 with trial added.',
    Sentiment:       'Worse than expected',
    'Logged By':     'CEO',
    'Logged Date':   offsetDate(0),
    'Impact Area':   'Customer',
  },
  {
    'Outcome Title': 'GitHub Actions migration — 90-day results',
    'Actual Result': 'Migration took 4 weeks instead of 2 — three pipelines required significant refactoring due to Jenkins-specific plugins with no direct Actions equivalent. Once live, performance exceeded expectations. Zero CI incidents in 90 days. The team is fully self-sufficient and two engineers have contributed workflow improvements without any guidance.',
    Metric:          'Migration time: 4 weeks (expected: 2). Deployment time: avg 7 mins (target: under 10 mins). CI incidents: 0 (target: 0). Monthly cost: $140 (budget: $200). Team self-sufficiency: achieved by week 6.',
    Sentiment:       'As expected',
    'Logged By':     'Tech Lead',
    'Logged Date':   offsetDate(0),
    'Impact Area':   'Quality',
  },
];

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
  if (data.Tags?.length) {
    props.Tags = { multi_select: data.Tags.map((t) => ({ name: t })) };
  }
  const page = await notion.pages.create({
    parent: { database_id: process.env.NOTION_DECISION_LOG_DB },
    properties: props,
  });
  return page.id;
}

async function createOutcome(data, decisionPageId) {
  const page = await notion.pages.create({
    parent: { database_id: process.env.NOTION_OUTCOME_TRACKER_DB },
    properties: {
      'Outcome Title':   title(data['Outcome Title']),
      'Actual Result':   richText(data['Actual Result']),
      Metric:            richText(data.Metric),
      Sentiment:         select(data.Sentiment),
      'Logged By':       richText(data['Logged By']),
      'Logged Date':     date(data['Logged Date']),
      'Impact Area':     select(data['Impact Area']),
      'Linked Decision': { relation: [{ id: decisionPageId }] },
    },
  });
  return page.id;
}

async function seedDecisions() {
  console.log('🌱 Seeding decisions and outcomes...\n');
  const results = [];

  for (let i = 0; i < DECISIONS.length; i++) {
    console.log(`  [${i + 1}/3] "${DECISIONS[i].Decision}"`);
    const decisionId = await createDecision(DECISIONS[i]);
    await sleep(400);
    await createOutcome(OUTCOMES[i], decisionId);
    await sleep(400);
    console.log(`         ✅ Created — ID: ${decisionId}`);
    results.push({ title: DECISIONS[i].Decision, decisionId });
  }

  console.log('\n  ✅ All decisions and outcomes created.\n');
  return results;
}

// ---------------------------------------------------------------------------
// Step 3 — Run all audits
// ---------------------------------------------------------------------------

async function runAllAudits(seededDecisions) {
  console.log('🔍 Running audits...\n');
  const auditResults = [];

  for (const d of seededDecisions) {
    console.log(`  Auditing: "${d.title}"`);
    const cleanId = d.decisionId.replace(/-/g, '');

    try {
      const auditPageId = await runAudit(cleanId);
      console.log(`  ✅ Audit complete → ${auditPageId}\n`);
      auditResults.push({ ...d, auditPageId });
    } catch (err) {
      console.error(`  ❌ Audit failed: ${err.message}\n`);
      auditResults.push({ ...d, auditPageId: null, error: err.message });
    }

    await sleep(500);
  }

  return auditResults;
}

// ---------------------------------------------------------------------------
// Step 4 — Generate monthly pattern report
// ---------------------------------------------------------------------------

async function runPatternReport() {
  console.log('📊 Generating monthly pattern report...\n');
  try {
    const reportPageId = await generateMonthlyReport();
    console.log(`  ✅ Pattern report created → ${reportPageId}\n`);
    return reportPageId;
  } catch (err) {
    console.error(`  ❌ Pattern report failed: ${err.message}\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 5 — Print summary with Notion links
// ---------------------------------------------------------------------------

function printSummary(auditResults, reportPageId) {
  const div = '─'.repeat(65);
  console.log(div);
  console.log('🎉 Demo setup complete!\n');
  console.log('Open these pages in Notion:\n');

  auditResults.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.title}`);
    console.log(`     Decision : https://notion.so/${r.decisionId.replace(/-/g, '')}`);
    if (r.auditPageId) {
      console.log(`     Audit    : https://notion.so/${r.auditPageId.replace(/-/g, '')}`);
    } else {
      console.log(`     Audit    : ❌ Failed — ${r.error}`);
    }
    console.log();
  });

  if (reportPageId) {
    console.log(`  📊 Monthly Report : https://notion.so/${reportPageId.replace(/-/g, '')}`);
  } else {
    console.log('  📊 Monthly Report : ❌ Failed — check logs above');
  }

  console.log('\n' + div);
}

async function pressEnterToContinue(message) {
  process.stdout.write(`\n  ${message} — press Enter to continue... `);
  await new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n\n');
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=====================================================');
  console.log('  Notion Decision Intelligence Engine — Demo Setup  ');
  console.log('=====================================================');

  await wipeAllDatabases();
  await pressEnterToContinue('✅ Databases wiped — switch to Notion to show empty databases');
  const seededDecisions = await seedDecisions();
  const auditResults    = await runAllAudits(seededDecisions);
  const reportPageId    = await runPatternReport();
  printSummary(auditResults, reportPageId);
}

main().catch((err) => {
  console.error('\n❌ Demo setup failed:', err.message);
  if (err.code === 'validation_error') {
    console.error('\nNotion validation error — check that your database schemas');
    console.error('match the expected field names and types in PROJECT_INSTRUCTIONS.md');
  }
  process.exit(1);
});