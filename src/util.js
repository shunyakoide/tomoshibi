/**
 * ============================================================================
 * SHARED UTILITIES (UTIL)
 * ============================================================================
 * Small pure functions shared across the app (UI, persistence, viewport input).
 * ============================================================================
 */

// Clamp a value into [lo, hi].
export const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
