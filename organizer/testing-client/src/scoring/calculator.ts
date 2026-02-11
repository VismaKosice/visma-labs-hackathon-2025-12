/**
 * Score calculation logic.
 * Combines correctness, performance, bonus, and code quality scores.
 */

import {
  TestResults,
  CorrectnessResults,
  PerformanceResults,
  BonusResults,
  CodeQualityResults,
  EnvironmentSnapshot,
  TotalScore,
} from '../types/results';

/**
 * Calculate the total score from all test results.
 */
export function calculateTotalScore(
  correctness: CorrectnessResults,
  performance: PerformanceResults,
  bonus: BonusResults,
  codeQuality: CodeQualityResults,
): TotalScore {
  let performanceTotal = 0;
  if (performance.relative_scores) {
    performanceTotal = performance.relative_scores.total;
  }

  const scored = correctness.total + performanceTotal + bonus.total + codeQuality.points;

  // manual_pending: points from categories that weren't scored
  // (e.g., AI review skipped because no API key, cold start skipped because no image)
  const aiReviewMax = 9; // code_quality (5) + clean_architecture (4)
  const aiReviewPending = codeQuality.skipped ? aiReviewMax : 0;

  return {
    scored,
    max_scoreable_by_tool: 115,
    manual_pending: aiReviewPending,
  };
}

/**
 * Build the complete test results object.
 */
export function buildTestResults(
  team: string,
  target: string,
  environment: EnvironmentSnapshot,
  correctness: CorrectnessResults,
  performance: PerformanceResults,
  bonus: BonusResults,
  codeQuality: CodeQualityResults,
): TestResults {
  return {
    team,
    target,
    timestamp: new Date().toISOString(),
    environment,
    correctness,
    performance,
    bonus,
    code_quality: codeQuality,
    total: calculateTotalScore(correctness, performance, bonus, codeQuality),
  };
}
