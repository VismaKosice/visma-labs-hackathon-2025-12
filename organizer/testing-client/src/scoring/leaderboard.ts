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
  LeaderboardJson,
  SubmissionRecord,
  SubmissionsJson,
} from '../types/results';

/**
 * Load all team result files from a directory.
 * Only loads files matching team-*.json pattern and skips internal files.
 */
export function loadTeamResults(resultsDir: string): TestResults[] {
  const files = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith('team-') && f.endsWith('.json'))
    .sort();

  const results: TestResults[] = [];

  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(resultsDir, f), 'utf-8');
      const parsed = JSON.parse(content);

      // Ensure minimal required structure exists (handle error-only results from shell scripts)
      if (!parsed.correctness) {
        parsed.correctness = { total: 0, max: 40, scenarios: [] };
      }
      if (!parsed.performance) {
        parsed.performance = {
          simple_latency: null,
          complex_latency: null,
          throughput: null,
          concurrency: null,
          relative_scores: null,
        };
      }
      if (!parsed.bonus) {
        parsed.bonus = {
          total: 0, max: 30,
          forward_json_patch: { passed: false, points: 0 },
          backward_json_patch: { passed: false, points: 0 },
          clean_architecture: { common_interface: 0, per_mutation_implementation: 0, generic_dispatch: 0, extensibility: 0, points: 0 },
          cold_start: { time_ms: null, points: 0 },
          scheme_registry: { passed: false, points: 0 },
          project_future_benefits: { passed: false, points: 0 },
        };
      }
      if (!parsed.code_quality) {
        parsed.code_quality = {
          readability_and_organization: 0,
          error_handling: 0,
          project_structure: 0,
          points: 0,
          skipped: true,
        };
      }
      if (!parsed.total) {
        parsed.total = { scored: 0, max_scoreable_by_tool: 115, manual_pending: 0 };
      }
      if (!parsed.environment) {
        parsed.environment = {
          os: 'unknown', arch: 'unknown', cpus: 0, cpu_model: 'unknown',
          total_memory_mb: 0, free_memory_mb: 0, load_avg_1m: 0, load_avg_5m: 0, load_avg_15m: 0,
          node_version: 'unknown',
        };
      }
      if (!parsed.timestamp) {
        parsed.timestamp = new Date().toISOString();
      }
      if (!parsed.target) {
        parsed.target = '';
      }

      results.push(parsed as TestResults);
    } catch (err) {
      console.warn(`Warning: Failed to parse ${f}: ${(err as Error).message}`);
    }
  }

  return results;
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

/**
 * Write leaderboard JSON to a file for consumption by the leaderboard UI.
 * Includes both the ranked entries and full per-team details.
 */
export function writeLeaderboardJson(
  entries: LeaderboardEntry[],
  allResults: TestResults[],
  resultsDir: string,
): void {
  const teamDetails: Record<string, TestResults> = {};
  for (const result of allResults) {
    teamDetails[result.team] = result;
  }

  const leaderboard: LeaderboardJson = {
    generated_at: new Date().toISOString(),
    max_possible: 115,
    entries,
    team_details: teamDetails,
  };

  const outputPath = path.join(resultsDir, 'leaderboard.json');
  const json = JSON.stringify(leaderboard, null, 2);
  fs.writeFileSync(outputPath, json + '\n');
  console.log(`Leaderboard JSON written to ${outputPath}`);
}

/**
 * Append a submission record to submissions.json.
 * Creates the file if it doesn't exist. Appends to the existing array.
 * Optionally pass a commit SHA to track which commit was tested.
 */
export function appendSubmission(
  result: TestResults,
  resultsDir: string,
  commitSha?: string,
): void {
  const submissionsPath = path.join(resultsDir, 'submissions.json');

  // Load existing submissions
  let data: SubmissionsJson;
  try {
    const existing = fs.readFileSync(submissionsPath, 'utf-8');
    data = JSON.parse(existing) as SubmissionsJson;
  } catch {
    data = { updated_at: '', submissions: [] };
  }

  const passedCount = result.correctness?.scenarios
    ? result.correctness.scenarios.filter(s => s.passed).length
    : 0;
  const totalCount = result.correctness?.scenarios
    ? result.correctness.scenarios.length
    : 0;

  const record: SubmissionRecord = {
    team: result.team,
    commit_sha: commitSha || 'unknown',
    timestamp: result.timestamp || new Date().toISOString(),
    total_score: result.total.scored,
    correctness: result.correctness?.total ?? 0,
    performance: result.performance?.relative_scores?.total ?? 0,
    bonus: result.bonus?.total ?? 0,
    code_quality: result.code_quality?.points ?? 0,
    correctness_passed: passedCount,
    correctness_total: totalCount,
    error: (result as any).error,
    details: result,
  };

  data.submissions.push(record);
  data.updated_at = new Date().toISOString();

  fs.writeFileSync(submissionsPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Submission appended to ${submissionsPath} (${data.submissions.length} total)`);
}
