// src/utils/dateUtils.js
//
// Pure date helpers — no external dependencies, fully unit-testable.

// ---------------------------------------------------------------------------
// Review window
// ---------------------------------------------------------------------------

const WINDOW_MAP = {
  '30 days': 30,
  '60 days': 60,
  '90 days': 90,
};

/**
 * Convert a review window label (from Notion Select) to a number of days.
 * Falls back to 60 if the label isn't recognised.
 *
 * @param {string} windowLabel — e.g. '30 days' | '60 days' | '90 days'
 * @returns {number}
 */
export function windowToDays(windowLabel) {
  return WINDOW_MAP[windowLabel] ?? 60;
}

// ---------------------------------------------------------------------------
// Date calculation
// ---------------------------------------------------------------------------

/**
 * Add `days` to a date string or Date object.
 * Returns a YYYY-MM-DD string (no time component).
 *
 * @param {string|Date} fromDate — ISO date string or Date object
 * @param {number}      days
 * @returns {string}    YYYY-MM-DD
 */
export function addDays(fromDate, days) {
  const date = new Date(fromDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Calculate the review date from the decision date + review window label.
 *
 * @param {string|Date} decisionDate  — when the decision was made
 * @param {string}      windowLabel   — '30 days' | '60 days' | '90 days'
 * @returns {string}    YYYY-MM-DD
 */
export function calculateReviewDate(decisionDate, windowLabel) {
  const days = windowToDays(windowLabel);
  return addDays(decisionDate, days);
}

// ---------------------------------------------------------------------------
// Today helpers
// ---------------------------------------------------------------------------

/**
 * Return today's date as a YYYY-MM-DD string (UTC, so it's consistent
 * regardless of the server's local timezone).
 */
export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Return true if the given review date is today or in the past
 * (i.e., the audit is due or overdue).
 *
 * @param {string} reviewDate — YYYY-MM-DD
 * @returns {boolean}
 */
export function isDueToday(reviewDate) {
  return reviewDate <= todayISO();
}

/**
 * Return true if the given review date is in the future.
 *
 * @param {string} reviewDate — YYYY-MM-DD
 * @returns {boolean}
 */
export function isFuture(reviewDate) {
  return reviewDate > todayISO();
}

/**
 * Return the number of days between two YYYY-MM-DD strings.
 * Positive = dateB is after dateA.
 *
 * @param {string} dateA
 * @param {string} dateB
 * @returns {number}
 */
export function daysBetween(dateA, dateB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(dateB) - new Date(dateA)) / msPerDay);
}
