/**
 * Test orchestration - runs suites in order and collects results.
 */

import axios from 'axios';
import { Config } from './config';
import { createHttpClient } from './helpers/http-client';
import { loadFixtureById } from './helpers/fixture-loader';
import { captureEnvironment, warnIfUnfairConditions } from './helpers/environment';
import { runCorrectnessTests } from './suites/correctness';
import { runPerformanceTests } from './suites/performance';
import { runBonusTests } from './suites/bonus';
import { runColdStartTest } from './suites/cold-start';
import { runAICodeReview } from './suites/ai-review';
import { buildTestResults } from './scoring/calculator';
import { printResults } from './output/console-reporter';
import { writeJsonResults } from './output/json-reporter';
import { loadTeamResults, generateLeaderboard, printLeaderboard, writeLeaderboardJson, appendSubmission, calculateRelativeScores } from './scoring/leaderboard';
import {
  CorrectnessResults,
  PerformanceResults,
  BonusResults,
  CodeQualityResults,
} from './types/results';

const HEALTH_CHECK_TIMEOUT_MS = 10_000;

/**
 * Run the full test suite against the target.
 */
export async function run(config: Config): Promise<void> {
  // Leaderboard-only mode (no --target required)
  if (config.leaderboard && config.resultsDir && !config.target) {
    const allResults = loadTeamResults(config.resultsDir);
    const leaderboard = generateLeaderboard(allResults);
    printLeaderboard(leaderboard);
    writeLeaderboardJson(leaderboard, allResults, config.resultsDir);
    return;
  }

  console.log('=== Visma Performance Hackathon - Testing Client ===');
  console.log(`Target: ${config.target}`);
  console.log(`Team: ${config.team}`);
  console.log(`Suite: ${config.suite}`);

  // Capture environment snapshot for reproducibility & fairness checking
  const environment = captureEnvironment();
  console.log(`\nEnvironment: ${environment.os} | ${environment.cpus}x ${environment.cpu_model}`);
  console.log(`Memory: ${environment.free_memory_mb}MB free / ${environment.total_memory_mb}MB total | Load: ${environment.load_avg_1m}`);
  warnIfUnfairConditions(environment);

  // Initialize HTTP client for the target
  createHttpClient(config.target);

  // FR-1: Health Check (10 second timeout)
  console.log('\n--- Health Check ---');
  const healthy = await performHealthCheck(config.target);
  if (!healthy) {
    console.log('\x1b[31mTarget is unreachable. Aborting.\x1b[0m');
    process.exit(1);
  }
  console.log('\x1b[32mTarget is reachable.\x1b[0m');

  // Initialize results with defaults
  let correctness: CorrectnessResults = { total: 0, max: 40, scenarios: [] };
  let performance: PerformanceResults = {
    simple_latency: null,
    complex_latency: null,
    throughput: null,
    concurrency: null,
    relative_scores: null,
  };
  let bonus: BonusResults = {
    total: 0,
    max: 30,
    forward_json_patch: { passed: false, points: 0 },
    backward_json_patch: { passed: false, points: 0 },
    clean_architecture: {
      common_interface: 0,
      per_mutation_implementation: 0,
      generic_dispatch: 0,
      extensibility: 0,
      points: 0,
    },
    cold_start: { time_ms: null, points: 0 },
    scheme_registry: { passed: false, points: 0 },
    project_future_benefits: { passed: false, points: 0 },
  };
  let codeQuality: CodeQualityResults = {
    readability_and_organization: 0,
    error_handling: 0,
    project_structure: 0,
    points: 0,
    skipped: true,
  };

  const suite = config.suite;

  // Correctness always runs first -- performance and bonus depend on knowing
  // which correctness scenarios passed (per PRD FR-3 pre-condition).
  const needsCorrectness =
    suite === 'all' || suite === 'correctness' || suite === 'performance' || suite === 'bonus';

  if (needsCorrectness) {
    console.log('\n--- Correctness Tests ---');
    correctness = await runCorrectnessTests(config);
    console.log(`\n  Subtotal: ${correctness.total}/${correctness.max}`);
  }

  // Collect IDs of passing correctness scenarios
  const passedIds = new Set(
    correctness.scenarios.filter(s => s.passed).map(s => s.id)
  );

  if (suite === 'all' || suite === 'performance') {
    if (passedIds.size > 0) {
      console.log('\n--- Performance Tests ---');
      performance = await runPerformanceTests(config, passedIds);
    } else {
      console.log('\n--- Performance Tests ---');
      console.log('  Skipped (no passing correctness scenarios)');
    }
  }

  if (suite === 'all' || suite === 'bonus') {
    console.log('\n--- Bonus Tests ---');
    bonus = await runBonusTests(config, passedIds);

    // Cold start test (only if Docker image provided and not explicitly skipped)
    if (config.coldStartImage && !config.skipColdStart) {
      const coldStart = await runColdStartTest(config);
      bonus.cold_start = coldStart;
      bonus.total += coldStart.points;
    }

    // AI Code Review (scores both code quality and clean architecture)
    let technologyStack: string | undefined;
    if (config.codePath) {
      const aiResult = await runAICodeReview(config);
      codeQuality = aiResult.codeQuality;
      bonus.clean_architecture = aiResult.cleanArchitecture;
      bonus.total += aiResult.cleanArchitecture.points;
      technologyStack = aiResult.technologyStack;
    }
  }

  // Build and display results
  const results = buildTestResults(
    config.team,
    config.target,
    environment,
    correctness,
    performance,
    bonus,
    codeQuality,
    technologyStack,
  );

  printResults(results);

  // Write JSON output if requested
  if (config.output) {
    writeJsonResults(results, config.output);
  }

  // Calculate relative performance scores and append submission if results directory provided
  if (config.resultsDir) {
    const allResults = loadTeamResults(config.resultsDir);
    allResults.push(results);
    
    // Calculate relative scores BEFORE appending (so performance score is correct)
    calculateRelativeScores(allResults);
    
    // Now append the submission with calculated relative scores
    appendSubmission(results, config.resultsDir, config.commitSha);
    
    // Generate leaderboard
    const leaderboard = generateLeaderboard(allResults);
    printLeaderboard(leaderboard);
    writeLeaderboardJson(leaderboard, allResults, config.resultsDir);
  }
}

/**
 * FR-1: Health Check.
 * Send a minimal valid request and verify the target responds within 10 seconds.
 * Any HTTP response (even non-200) means the target is reachable.
 */
async function performHealthCheck(targetUrl: string): Promise<boolean> {
  const fixture = loadFixtureById('C01');
  if (!fixture) {
    console.log('Error: C01 fixture not found');
    return false;
  }

  const start = process.hrtime.bigint();

  try {
    const response = await axios.post(
      `${targetUrl}/calculation-requests`,
      fixture.request,
      {
        timeout: HEALTH_CHECK_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true, // Accept any status code
      },
    );

    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    console.log(`Health check response: HTTP ${response.status} (${elapsedMs.toFixed(0)}ms)`);
    return true;
  } catch (err) {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    console.log(`Health check failed after ${elapsedMs.toFixed(0)}ms: ${(err as Error).message}`);
    return false;
  }
}
