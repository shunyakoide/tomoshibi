/**
 * ============================================================================
 * SHARED UTILITIES (UTIL)
 * ============================================================================
 * Small pure functions shared on the UI side (HarigataStudio / SectionEditor).
 * ============================================================================
 */

// Clamp a value into [lo, hi].
export const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
