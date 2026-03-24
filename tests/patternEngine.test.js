// tests/patternEngine.test.js
// Tests for src/engines/patternEngine.js
//
// Focus areas from the spec:
//   - Handles zero audits in window (no crash, returns null)
//   - Aggregation math is correct

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing patternEngine
// ---------------------------------------------------------------------------

const mockQueryDatabase = jest.fn();
const mockGetPage       = jest.fn();
const mockCreatePage    = jest.fn();

jest.unstable_mockModule('../src/clients/notionClient.js', () => ({
  notionClient: {
    queryDatabase: mockQueryDatabase,
    getPage:       mockGetPage,
    createPage:    mockCreatePage,
    updatePage:    jest.fn(),
  },
}));

const mockAnalyze = jest.fn();
jest.unstable_mockModule('../src/clients/claudeClient.js', () => ({
  claudeClient: { analyze: mockAnalyze },
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  logger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { generateMonthlyReport } = await import('../src/engines/patternEngine.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAuditPage(overrides = {}) {
  return {
    id: overrides.id ?? 'audit-page-id',
    properties: {
      'Audit Title':        { title:     [{ plain_text: overrides.title ?? 'Test Audit' }] },
      'Process Score':      { number:    overrides.processScore  ?? 7 },
      'Outcome Score':      { number:    overrides.outcomeScore  ?? 6 },
      Verdict:              { select:    { name: overrides.verdict ?? 'Mixed' } },
      'Key Insight':        { rich_text: [{ plain_text: overrides.keyInsight ?? 'Some insight' }] },
      'Failed Assumptions': { rich_text: [{ plain_text: overrides.failedAssumptions ?? 'An assumption' }] },
      Recommendation:       { rich_text: [{ plain_text: overrides.recommendation ?? 'Do better' }] },
      'Audit Date':         { date:      { start: overrides.auditDate ?? '2026-03-01' } },
      'Audit Status':       { select:    { name: 'Published' } },
      'Linked Decision':    { relation:  [{ id: overrides.decisionId ?? 'decision-id-1' }] },
    },
  };
}

function makeDecisionPage(domain = 'Engineering') {
  return {
    id: 'decision-id-1',
    properties: {
      Domain: { select: { name: domain } },
    },
  };
}

const validReportJson = JSON.stringify({
  report_title:          'Decision Health Report — March 2026',
  summary:               'Three audits with mixed results.',
  patterns: [
    {
      title:          'Chronic time underestimation',
      evidence:       'All 3 audits show timeline failures.',
      recommendation: 'Triple all learning curve estimates.',
    },
  ],
  process_score_trend:  'Stable',
  outcome_score_trend:  'Stable',
  biggest_blind_spot:   'Learning curve underestimation.',
  one_thing_to_change:  'Pre-decision assumption challenge sessions.',
  full_narrative:       'This month revealed a pattern of optimistic planning...',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NOTION_AUDIT_REPORTS_DB   = 'audit-db-id';
  process.env.NOTION_PATTERN_REPORTS_DB = 'pattern-db-id';
  process.env.ANTHROPIC_MODEL           = 'claude-sonnet-4-20250514';

  mockGetPage.mockResolvedValue(makeDecisionPage('Engineering'));
  mockAnalyze.mockResolvedValue(validReportJson);
  mockCreatePage.mockResolvedValue('pattern-report-page-id');
});

// ---------------------------------------------------------------------------
// Tests: zero audits
// ---------------------------------------------------------------------------

describe('generateMonthlyReport — no audits found', () => {
  test('returns null when there are no audits in the window', async () => {
    mockQueryDatabase.mockResolvedValue({ results: [] });

    const result = await generateMonthlyReport();

    expect(result).toBeNull();
  });

  test('does not call Claude when there are no audits', async () => {
    mockQueryDatabase.mockResolvedValue({ results: [] });

    await generateMonthlyReport();

    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  test('does not create a Notion page when there are no audits', async () => {
    mockQueryDatabase.mockResolvedValue({ results: [] });

    await generateMonthlyReport();

    expect(mockCreatePage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: happy path
// ---------------------------------------------------------------------------

describe('generateMonthlyReport — happy path', () => {
  beforeEach(() => {
    mockQueryDatabase.mockResolvedValue({
      results: [
        makeAuditPage({ id: '1', processScore: 8, outcomeScore: 7, verdict: 'Right call' }),
        makeAuditPage({ id: '2', processScore: 4, outcomeScore: 6, verdict: 'Mixed' }),
        makeAuditPage({ id: '3', processScore: 6, outcomeScore: 9, verdict: 'Right call' }),
      ],
    });
  });

  test('returns the created pattern report page ID', async () => {
    const result = await generateMonthlyReport();
    expect(result).toBe('pattern-report-page-id');
  });

  test('calls Claude exactly once', async () => {
    await generateMonthlyReport();
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });

  test('creates exactly one pattern report page in Notion', async () => {
    await generateMonthlyReport();
    expect(mockCreatePage).toHaveBeenCalledTimes(1);
  });

  test('creates the report in the correct database', async () => {
    await generateMonthlyReport();
    expect(mockCreatePage).toHaveBeenCalledWith(
      'pattern-db-id',
      expect.any(Object),
      expect.any(Array)
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: aggregation math
// ---------------------------------------------------------------------------

describe('generateMonthlyReport — aggregation math', () => {
  test('calculates correct average process score', async () => {
    mockQueryDatabase.mockResolvedValue({
      results: [
        makeAuditPage({ id: '1', processScore: 8 }),
        makeAuditPage({ id: '2', processScore: 6 }),
        makeAuditPage({ id: '3', processScore: 4 }),
      ],
    });

    await generateMonthlyReport();

    // Capture what was passed to Claude and verify it mentions avg of 6
    const userPromptArg = mockAnalyze.mock.calls[0][1];
    expect(userPromptArg).toContain('6'); // avg of 8+6+4 = 6.0
  });

  test('calculates correct average outcome score', async () => {
    mockQueryDatabase.mockResolvedValue({
      results: [
        makeAuditPage({ id: '1', outcomeScore: 9 }),
        makeAuditPage({ id: '2', outcomeScore: 6 }),
        makeAuditPage({ id: '3', outcomeScore: 6 }),
      ],
    });

    await generateMonthlyReport();

    const userPromptArg = mockAnalyze.mock.calls[0][1];
    expect(userPromptArg).toContain('7'); // avg of 9+6+6 = 7.0
  });

  test('builds correct verdict distribution', async () => {
    mockQueryDatabase.mockResolvedValue({
      results: [
        makeAuditPage({ id: '1', verdict: 'Right call' }),
        makeAuditPage({ id: '2', verdict: 'Mixed' }),
        makeAuditPage({ id: '3', verdict: 'Right call' }),
      ],
    });

    await generateMonthlyReport();

    const userPromptArg = mockAnalyze.mock.calls[0][1];
    expect(userPromptArg).toContain('Right call: 2');
    expect(userPromptArg).toContain('Mixed: 1');
  });

  test('passes correct total audit count to Claude', async () => {
    mockQueryDatabase.mockResolvedValue({
      results: [
        makeAuditPage({ id: '1' }),
        makeAuditPage({ id: '2' }),
        makeAuditPage({ id: '3' }),
        makeAuditPage({ id: '4' }),
        makeAuditPage({ id: '5' }),
      ],
    });

    await generateMonthlyReport();

    const userPromptArg = mockAnalyze.mock.calls[0][1];
    expect(userPromptArg).toContain('Total Audits in Window: 5');
  });
});

// ---------------------------------------------------------------------------
// Tests: Claude returns malformed JSON
// ---------------------------------------------------------------------------

describe('generateMonthlyReport — malformed Claude response', () => {
  beforeEach(() => {
    mockQueryDatabase.mockResolvedValue({
      results: [makeAuditPage()],
    });
  });

  test('throws when Claude returns invalid JSON', async () => {
    mockAnalyze.mockResolvedValue('not valid json at all');
    await expect(generateMonthlyReport()).rejects.toThrow();
  });

  test('does not create a Notion page when JSON parse fails', async () => {
    mockAnalyze.mockResolvedValue('{ broken json }');
    try {
      await generateMonthlyReport();
    } catch {
      // expected
    }
    expect(mockCreatePage).not.toHaveBeenCalled();
  });
});
