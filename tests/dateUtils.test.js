// tests/dateUtils.test.js
// Tests for src/utils/dateUtils.js
// Pure functions — no mocking needed.

import {
  calculateReviewDate,
  windowToDays,
  isDueToday,
  addDays,
} from '../src/utils/dateUtils.js';

// ---------------------------------------------------------------------------
// addDays  (the low-level helper — takes a number directly)
// ---------------------------------------------------------------------------

describe('addDays', () => {
  test('adds the correct number of days', () => {
    expect(addDays('2026-01-01', 30)).toBe('2026-01-31');
    expect(addDays('2026-01-01', 60)).toBe('2026-03-02');
    expect(addDays('2026-01-01', 90)).toBe('2026-04-01');
  });

  test('handles end-of-month rollover correctly', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  test('handles end-of-year rollover correctly', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });

  test('handles leap year correctly', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  test('returns a YYYY-MM-DD formatted string', () => {
    expect(addDays('2026-03-01', 30)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('handles zero days (same date)', () => {
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15');
  });
});

// ---------------------------------------------------------------------------
// calculateReviewDate  (takes a window label string, not a number)
// ---------------------------------------------------------------------------

describe('calculateReviewDate', () => {
  test('calculates correct date for "30 days" window', () => {
    expect(calculateReviewDate('2026-01-01', '30 days')).toBe('2026-01-31');
  });

  test('calculates correct date for "60 days" window', () => {
    expect(calculateReviewDate('2026-01-01', '60 days')).toBe('2026-03-02');
  });

  test('calculates correct date for "90 days" window', () => {
    expect(calculateReviewDate('2026-01-01', '90 days')).toBe('2026-04-01');
  });

  test('falls back to 60 days for unrecognised window label', () => {
    expect(calculateReviewDate('2026-01-01', 'unknown')).toBe('2026-03-02');
  });

  test('returns a YYYY-MM-DD formatted string', () => {
    expect(calculateReviewDate('2026-03-01', '30 days')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// windowToDays
// ---------------------------------------------------------------------------

describe('windowToDays', () => {
  test('maps "30 days" to 30', () => {
    expect(windowToDays('30 days')).toBe(30);
  });

  test('maps "60 days" to 60', () => {
    expect(windowToDays('60 days')).toBe(60);
  });

  test('maps "90 days" to 90', () => {
    expect(windowToDays('90 days')).toBe(90);
  });

  test('returns default of 60 for unrecognised labels', () => {
    expect(windowToDays('unknown')).toBe(60);
    expect(windowToDays('')).toBe(60);
    expect(windowToDays(null)).toBe(60);
    expect(windowToDays(undefined)).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// isDueToday
// ---------------------------------------------------------------------------

describe('isDueToday', () => {
  test('returns true for today\'s date', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(isDueToday(today)).toBe(true);
  });

  test('returns true for a past date (overdue)', () => {
    expect(isDueToday('2020-01-01')).toBe(true);
  });

  test('returns false for a future date', () => {
    expect(isDueToday('2099-12-31')).toBe(false);
  });

  test('returns true for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isDueToday(yesterday.toISOString().split('T')[0])).toBe(true);
  });

  test('returns false for tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isDueToday(tomorrow.toISOString().split('T')[0])).toBe(false);
  });
});