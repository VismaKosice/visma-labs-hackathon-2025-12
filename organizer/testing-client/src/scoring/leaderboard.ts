/**
 * Multi-team leaderboard scoring.
 * Calculates relative performance scores across multiple teams.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TestResults,
  RelativePerformanceScores,
  LeaderboardEntry,
} from '../types/results';

/**
 * Load all team result files from a directory.
 */
export function loadTeamResults(resultsDir: string): TestResults[] {
  const files = fs.readdirSync(resultsDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  return files.map(f => {
    const content = fs.readFileSync(path.join(resultsDir, f), 'utf-8');
    return JSON.parse(content) as TestResults;
  });
}

/**
 * Calculate relative performance scores for all teams.
 */
export function calculateRelativeScores(allResults: TestResults[]): void {
  if (allResults.length === 0) return;

  // Find best values across all teams
  const simpleLatencies = allResults
    .map(r => r.performance.simple_latency?.mean_ms)
    .filter((v): v is number => v != null && v > 0);
  const complexLatencies = allResults
    .map(r => r.performance.complex_latency?.mean_ms)
    .filter((v): v is number => v != null && v > 0);
  const throughputs = allResults
    .map(r => r.performance.throughput?.requests_per_second)
    .filter((v): v is number => v != null && v > 0);
  const concurrencyLatencies = allResults
    .map(r => r.performance.concurrency?.mean_ms)
    .filter((v): v is number => v != null && v > 0);

  const bestSimple = simpleLatencies.length > 0 ? Math.min(...simpleLatencies) : 0;
  const bestComplex = complexLatencies.length > 0 ? Math.min(...complexLatencies) : 0;
  const bestThroughput = throughputs.length > 0 ? Math.max(...throughputs) : 0;
  const bestConcurrency = concurrencyLatencies.length > 0 ? Math.min(...concurrencyLatencies) : 0;

  // Calculate relative scores for each team
  for (const result of allResults) {
    const simpleScore = result.performance.simple_latency?.mean_ms
      ? Math.min(10, 10 * (bestSimple / result.performance.simple_latency.mean_ms))
      : 0;

    const complexScore = result.performance.complex_latency?.mean_ms
      ? Math.min(10, 10 * (bestComplex / result.performance.complex_latency.mean_ms))
      : 0;

    const throughputScore = result.performance.throughput?.requests_per_second
      ? Math.min(10, 10 * (result.performance.throughput.requests_per_second / bestThroughput))
      : 0;

    const concurrencyScore = result.performance.concurrency?.mean_ms
      ? Math.min(10, 10 * (bestConcurrency / result.performance.concurrency.mean_ms))
      : 0;

    result.performance.relative_scores = {
      simple_latency_score: Math.round(simpleScore * 10) / 10,
      complex_latency_score: Math.round(complexScore * 10) / 10,
      throughput_score: Math.round(throughputScore * 10) / 10,
      concurrency_score: Math.round(concurrencyScore * 10) / 10,
      total: Math.round((simpleScore + complexScore + throughputScore + concurrencyScore) * 10) / 10,
    };

    // Recalculate total
    result.total.scored =
      result.correctness.total +
      result.performance.relative_scores.total +
      result.bonus.total +
      result.code_quality.points;
  }
}

/**
 * Generate leaderboard entries from team results.
 */
export function generateLeaderboard(allResults: TestResults[]): LeaderboardEntry[] {
  calculateRelativeScores(allResults);

  const entries: LeaderboardEntry[] = allResults.map(r => ({
    rank: 0,
    team: r.team,
    correctness: r.correctness.total,
    performance: r.performance.relative_scores?.total ?? 0,
    bonus: r.bonus.total,
    code_quality: r.code_quality.points,
    total: r.total.scored,
  }));

  // Sort by total score descending
  entries.sort((a, b) => b.total - a.total);

  // Assign ranks
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  return entries;
}

/**
 * Print leaderboard to console.
 */
export function printLeaderboard(entries: LeaderboardEntry[]): void {
  console.log('\n=== Visma Performance Hackathon - Leaderboard ===\n');
  console.log(
    'Rank  Team'.padEnd(30) +
    'Correct'.padStart(10) +
    'Perf'.padStart(10) +
    'Bonus'.padStart(10) +
    'Quality'.padStart(10) +
    'Total'.padStart(10)
  );
  console.log('─'.repeat(80));

  for (const entry of entries) {
    console.log(
      `  ${entry.rank}`.padEnd(6) +
      entry.team.padEnd(24) +
      entry.correctness.toFixed(0).padStart(10) +
      entry.performance.toFixed(1).padStart(10) +
      entry.bonus.toFixed(0).padStart(10) +
      entry.code_quality.toFixed(1).padStart(10) +
      entry.total.toFixed(1).padStart(10)
    );
  }

  console.log('');
}
