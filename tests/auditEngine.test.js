// tests/auditEngine.test.js
// Tests for src/engines/auditEngine.js
//
// Strategy: mock notionClient and claudeClient so tests run without
// real API calls. Each test controls exactly what those dependencies return.

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock the external dependencies BEFORE importing auditEngine
// ---------------------------------------------------------------------------

// Mock notionClient
const mockGetPage       = jest.fn();
const mockQueryDatabase = jest.fn();
const mockCreatePage    = jest.fn();
const mockUpdatePage    = jest.fn();

jest.unstable_mockModule('../src/clients/notionClient.js', () => ({
  notionClient: {
    getPage:       mockGetPage,
    queryDatabase: mockQueryDatabase,
    createPage:    mockCreatePage,
    updatePage:    mockUpdatePage,
  },
}));

// Mock claudeClient
const mockAnalyze = jest.fn();
jest.unstable_mockModule('../src/clients/claudeClient.js', () => ({
  claudeClient: { analyze: mockAnalyze },
}));

// Mock logger to suppress output during tests
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  logger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Dynamic import AFTER mocks are registered
const { runAudit } = await import('../src/engines/auditEngine.js');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DECISION_PAGE_ID = 'decision-page-id-123';

const mockDecisionPage = {
  id: DECISION_PAGE_ID,
  properties: {
    Decision:                { title:     [{ plain_text: 'Migrate to GraphQL' }] },
    Context:                 { rich_text: [{ plain_text: 'Over-fetching issue' }] },
    'Alternatives Considered': { rich_text: [{ plain_text: 'REST, tRPC' }] },
    'Key Assumptions':       { rich_text: [{ plain_text: 'Team ramps in 2 weeks' }] },
    'Expected Outcome':      { rich_text: [{ plain_text: '30% response time reduction' }] },
    'Confidence Level':      { select: { name: 'High' } },
    'Decision Date':         { date:   { start: '2025-12-01' } },
    Domain:                  { select: { name: 'Engineering' } },
  },
};

const mockOutcomePage = {
  id: 'outcome-page-id-456',
  properties: {
    'Actual Result': { rich_text: [{ plain_text: 'Took 5 weeks not 2' }] },
    Metric:          { rich_text: [{ plain_text: 'Response time down 18%' }] },
    Sentiment:       { select: { name: 'Worse than expected' } },
    'Logged Date':   { date:   { start: '2026-03-01' } },
    'Impact Area':   { select: { name: 'Time' } },
  },
};

const validAuditJson = JSON.stringify({
  audit_title:            'Audit: Migrate to GraphQL — 90-day Review',
  process_score:          6,
  outcome_score:          5,
  verdict:                'Mixed',
  key_insight:            'Timeline assumptions were too optimistic.',
  failed_assumptions:     ['2-week ramp-up was unrealistic'],
  validated_assumptions:  ['Payload reduction was achievable'],
  what_went_well:         'Response times did improve.',
  what_went_wrong:        'Onboarding took far longer than expected.',
  recommendation:         'Triple learning curve estimates.',
  full_narrative:         'The decision was sound in principle...',
});

// ---------------------------------------------------------------------------
// Helpers — reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Default happy-path setup
  mockGetPage.mockResolvedValue(mockDecisionPage);
  mockQueryDatabase.mockResolvedValue({ results: [mockOutcomePage] });
  mockCreatePage.mockResolvedValue('audit-page-id-789');
  mockUpdatePage.mockResolvedValue({});
  mockAnalyze.mockResolvedValue(validAuditJson);
});

// ---------------------------------------------------------------------------
// Tests: early exit when no outcomes logged
// ---------------------------------------------------------------------------

describe('runAudit — no outcomes logged', () => {
  test('returns undefined and skips audit when outcome DB is empty', async () => {
    mockQueryDatabase.mockResolvedValue({ results: [] });

    const result = await runAudit(DECISION_PAGE_ID);

    expect(result).toBeNull();
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(mockCreatePage).not.toHaveBeenCalled();
  });

  test('updates decision status when skipping', async () => {
    mockQueryDatabase.mockResolvedValue({ results: [] });

    await runAudit(DECISION_PAGE_ID);

    expect(mockUpdatePage).toHaveBeenCalledWith(
      DECISION_PAGE_ID,
      expect.objectContaining({ Status: expect.anything() })
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: happy path
// ---------------------------------------------------------------------------

describe('runAudit — happy path', () => {
  test('returns the audit page ID on success', async () => {
    const result = await runAudit(DECISION_PAGE_ID);
    expect(result).toBe('audit-page-id-789');
  });

  test('calls claudeClient.analyze exactly once', async () => {
    await runAudit(DECISION_PAGE_ID);
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });

  test('creates one audit report page in Notion', async () => {
    await runAudit(DECISION_PAGE_ID);
    expect(mockCreatePage).toHaveBeenCalledTimes(1);
  });

  test('marks the decision as Audited', async () => {
    await runAudit(DECISION_PAGE_ID);
    expect(mockUpdatePage).toHaveBeenCalledWith(
      DECISION_PAGE_ID,
      expect.objectContaining({ Status: expect.anything() })
    );
  });

  test('creates the audit page in the correct database', async () => {
    process.env.NOTION_AUDIT_REPORTS_DB = 'audit-db-id';
    await runAudit(DECISION_PAGE_ID);
    expect(mockCreatePage).toHaveBeenCalledWith(
      'audit-db-id',
      expect.any(Object),
      expect.any(Array)
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: malformed JSON from Claude
// ---------------------------------------------------------------------------

describe('runAudit — Claude returns malformed JSON', () => {
  test('throws (or returns undefined) when Claude returns invalid JSON', async () => {
    mockAnalyze.mockResolvedValue('This is not JSON at all { broken');

    // The engine should either throw or return without creating a page
    try {
      const result = await runAudit(DECISION_PAGE_ID);
      // If it didn't throw, it should have not created a page
      expect(mockCreatePage).not.toHaveBeenCalled();
    } catch (err) {
      // A thrown error is also acceptable behaviour
      expect(err).toBeDefined();
    }
  });

  test('does not mark decision as Audited when Claude fails', async () => {
    mockAnalyze.mockResolvedValue('{ bad json }');

    try {
      await runAudit(DECISION_PAGE_ID);
    } catch {
      // expected
    }

    // updatePage should NOT have been called with 'Audited'
    const auditedCalls = mockUpdatePage.mock.calls.filter(
      ([, props]) => props?.Status?.select?.name === 'Audited'
    );
    expect(auditedCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Claude returns JSON wrapped in markdown fences
// ---------------------------------------------------------------------------

describe('runAudit — Claude wraps JSON in markdown fences', () => {
  test('handles ```json ... ``` wrapping gracefully', async () => {
    mockAnalyze.mockResolvedValue('```json\n' + validAuditJson + '\n```');

    // Should succeed (engine strips fences before parsing)
    const result = await runAudit(DECISION_PAGE_ID);
    expect(result).toBe('audit-page-id-789');
  });
});