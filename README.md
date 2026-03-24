# Notion Decision Intelligence Engine

An AI agent that turns Notion into a **self-auditing decision memory**.

Teams log decisions once. The system tracks outcomes, waits for a set review window, then auto-generates an honest AI retrospective — writing it back into Notion as a structured Audit page. On the 1st of each month, it aggregates all audits into a pattern report that identifies systematic biases in how your team makes decisions.

---

## How It Works

```
Decision Logged → Structured in Notion DB → Review Date Set
       ↓
Outcomes Tracked (manually in Outcome Tracker)
       ↓
Scheduler Triggers Audit on Review Date
       ↓
Agent reads Decision + Outcomes via Notion API
       ↓
Claude generates Audit (process score, outcome score, insights)
       ↓
Audit page written back to Notion
       ↓
Monthly Pattern Report aggregates all audits
```

The key insight: most Notion + AI tools only write *into* Notion. This one also reads *back across time* and learns from what happened. It closes the feedback loop that every team ignores.

---

## Features

- **Decision Capture** — describe a decision in plain text; Claude structures it into Notion automatically
- **Outcome Tracking** — log results manually as they emerge, linked to the original decision
- **AI Audit** — on the review date, Claude evaluates process quality and outcome quality *separately* (a good process can still produce bad outcomes; a bad process can get lucky)
- **Monthly Pattern Reports** — aggregates all audits to surface systematic biases, domain-specific trends, and the single highest-leverage thing to change
- **Missed audit recovery** — daily scheduler catches any audits that were due while the app was offline

---

## Tech Stack

- **Runtime** — Node.js v20+
- **Notion** — `@notionhq/client`
- **AI** — `@anthropic-ai/sdk` (Claude)
- **Scheduling** — `node-cron`
- **Logging** — `winston`

---

## Project Structure

```
notion-decision-engine/
├── src/
│   ├── index.js                  # Entry point + CLI
│   ├── clients/
│   │   ├── notionClient.js       # Notion API wrapper
│   │   └── claudeClient.js       # Anthropic SDK wrapper
│   ├── engines/
│   │   ├── captureEngine.js      # Structures raw decision text → Notion
│   │   ├── auditEngine.js        # Reads decision + outcomes, generates audit
│   │   └── patternEngine.js      # Monthly pattern aggregation + report
│   ├── scheduler/
│   │   └── scheduler.js          # Daily cron + monthly cron
│   ├── prompts/
│   │   ├── auditPrompt.js        # Claude prompt for individual audits
│   │   └── patternPrompt.js      # Claude prompt for monthly reports
│   └── utils/
│       ├── logger.js
│       ├── dateUtils.js
│       └── notionFormatters.js   # Claude JSON → Notion block format
├── scripts/
│   └── seedTestData.js           # Seeds Notion with sample data for demo
├── tests/
├── .env.example
└── package.json
```

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/notion-decision-engine.git
cd notion-decision-engine
npm install
```

### 2. Create a Notion integration

1. Go to [https://www.notion.so/profile/integrations](https://www.notion.so/profile/integrations)
2. Click **New Integration** → name it `Decision Intelligence Engine`
3. Enable capabilities: **Read content**, **Update content**, **Insert content**
4. Copy the **Internal Integration Token**

### 3. Create four Notion databases

Create these databases manually in your Notion workspace. After creating each one, connect your integration: open the database → click `...` (top right) → **Add connections** → select your integration.

#### Database 1 — Decision Log

| Property | Type |
|---|---|
| Decision | Title |
| Context | Text |
| Alternatives Considered | Text |
| Key Assumptions | Text |
| Expected Outcome | Text |
| Decision Maker | Text |
| Domain | Select (Engineering / Product / Finance / Ops / Hiring / Other) |
| Review Window | Select (30 days / 60 days / 90 days) |
| Review Date | Date |
| Decision Date | Date |
| Status | Select (Pending / Outcomes Logged / Audit Scheduled / Audited) |
| Confidence Level | Select (High / Medium / Low) |
| Tags | Multi-select |

#### Database 2 — Outcome Tracker

| Property | Type |
|---|---|
| Outcome Title | Title |
| Linked Decision | Relation → Decision Log |
| Actual Result | Text |
| Metric | Text |
| Sentiment | Select (Better than expected / As expected / Worse than expected) |
| Logged By | Text |
| Logged Date | Date |
| Impact Area | Select (Cost / Time / Quality / Team / Customer / Other) |

#### Database 3 — Audit Reports

| Property | Type |
|---|---|
| Audit Title | Title |
| Linked Decision | Relation → Decision Log |
| Process Score | Number |
| Outcome Score | Number |
| Verdict | Select (Right call / Mixed / Wrong call / Right call, wrong reasons) |
| Key Insight | Text |
| Failed Assumptions | Text |
| Recommendation | Text |
| Full Analysis | Text |
| Audit Date | Date |
| Audit Status | Select (Draft / Published) |

#### Database 4 — Monthly Pattern Reports

| Property | Type |
|---|---|
| Report Title | Title |
| Period | Text |
| Decisions Audited | Number |
| Avg Process Score | Number |
| Avg Outcome Score | Number |
| Top Pattern | Text |

### 4. Get your database IDs

For each database, open it in the browser. The URL looks like:
```
https://www.notion.so/workspace/DATABASE_ID?v=VIEW_ID
```
Copy the `DATABASE_ID` (32-character string) for each one.

### 5. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all values:

```bash
# Notion
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Database IDs
NOTION_DECISION_LOG_DB=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_OUTCOME_TRACKER_DB=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_AUDIT_REPORTS_DB=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PATTERN_REPORTS_DB=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Scheduler
AUDIT_CHECK_INTERVAL=0 8 * * *
PATTERN_REPORT_DAY=1
TIMEZONE=Asia/Kolkata

# App
LOG_LEVEL=info
NODE_ENV=development
```

---

## Usage

### Start the scheduler

Runs the daily audit check (8am) and monthly pattern report (1st of month):

```bash
node src/index.js
```

Once running, the agent operates automatically:
- **Every day at 8am** — checks Notion for decisions whose Review Date is today or overdue, runs the audit, and writes the Audit Report page back into Notion
- **1st of every month at 9am** — aggregates all recent audits and generates a Monthly Pattern Report page in Notion

You and your team only need to do two things manually: log decisions and log outcomes. Everything else is automatic.

### Capture a decision

Describe a decision in plain text — Claude structures it into Notion automatically:

```bash
node src/index.js capture "We decided to move our infrastructure to AWS from our own servers. The main reason was scaling costs — our servers were at 80% capacity and we needed to either buy more hardware or migrate. We considered Azure and GCP but the team had more AWS experience. We're assuming migration takes 6 weeks and costs under $10k. Success looks like zero downtime during migration and 20% cost reduction within 90 days."
```

### Trigger an audit manually

```bash
node src/index.js audit <decision-page-id>
```

The decision page ID is the 32-character string in the Notion page URL.

### Generate a pattern report manually

```bash
node src/index.js report
```

---

## Running in Production

For the agent to wake up automatically every day, it needs to run as a persistent background process on your machine or server. The easiest way is PM2:

```bash
# Install PM2 globally
npm install -g pm2

# Start the agent as a background process
pm2 start src/index.js --name "decision-engine"

# Save the process list so it survives reboots
pm2 save

# Set PM2 to start automatically on system boot
pm2 startup
```

Useful PM2 commands:

```bash
pm2 status                        # Check if the agent is running
pm2 logs decision-engine          # View live logs
pm2 restart decision-engine       # Restart after config changes
pm2 stop decision-engine          # Stop the agent
```

Once running with PM2, the full loop is genuinely automatic. Your team logs decisions and outcomes in Notion — the agent handles the rest, every morning at 8am, without anyone touching the terminal.

---

## Quick Demo (seed data)

To run the full loop in one command — wipes all databases, seeds 3 realistic decisions with outcomes, runs all audits, and generates the monthly pattern report:

```bash
node scripts/seedTestData.js
```

At the end it prints direct Notion links to every page it created.

---

## How Audits Work

Claude evaluates two things **independently**:

**Process Score (1–10)** — Was the decision-making process sound *at the time*?
- Were the right alternatives considered?
- Were the assumptions reasonable given available information?
- Was the expected outcome clearly defined and measurable?

**Outcome Score (1–10)** — How good was the actual result?
- Did outcomes match expectations?
- What was the net impact?

These scores are kept separate deliberately. A well-reasoned decision can produce poor outcomes due to external factors. A poorly-reasoned decision can get lucky. Identifying which happened is the most important insight the system produces.

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `NOTION_TOKEN` | Notion integration token (starts with `ntn_`) |
| `NOTION_DECISION_LOG_DB` | Decision Log database ID |
| `NOTION_OUTCOME_TRACKER_DB` | Outcome Tracker database ID |
| `NOTION_AUDIT_REPORTS_DB` | Audit Reports database ID |
| `NOTION_PATTERN_REPORTS_DB` | Monthly Pattern Reports database ID |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ANTHROPIC_MODEL` | Claude model to use (recommended: `claude-sonnet-4-20250514`) |
| `AUDIT_CHECK_INTERVAL` | Cron expression for daily audit check (default: `0 8 * * *`) |
| `PATTERN_REPORT_DAY` | Day of month to run pattern report (default: `1`) |
| `TIMEZONE` | Your local timezone (e.g. `Asia/Kolkata`, `America/New_York`) |
| `LOG_LEVEL` | Logging verbosity: `debug`, `info`, `warn`, or `error` |

---

## Known Constraints

- Notion API rate limit is 3 requests/second — the engine adds 350ms delays between bulk operations
- Each Notion rich text block has a 2000 character limit — long text is automatically chunked
- Audits are skipped if no outcomes have been logged yet — the decision is marked `Audit Scheduled - No Outcomes Yet` and will be retried on the next daily check
- The pattern report only aggregates audits with `Audit Status = Published`

---

## License

MIT
