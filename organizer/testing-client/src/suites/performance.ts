/**
 * Performance test suite.
 * Measures single request latency, throughput, and concurrency handling.
 *
 * NFR-1 compliance:
 * - HTTP client uses connection pooling and keep-alive
 * - Latency measured with process.hrtime.bigint() (nanosecond / microsecond precision)
 * - Throughput test uses autocannon (capable of 50k+ req/s from the client side)
 */

import { Config } from '../config';
import { sendCalculationRequest } from '../helpers/http-client';
import { getSimpleScenarios, getComplexScenarios, getCorrectnessFixtures } from '../helpers/fixture-loader';
import { PerformanceResults, LatencyStats, ThroughputStats, ConcurrencyStats } from '../types/results';
import { TestFixture } from '../types/fixtures';

/** Number of sequential repetitions per scenario per round for latency tests (PRD: FR-3). */
const LATENCY_REPS_PER_ROUND = 100;

/** Number of independent latency rounds (median is taken across rounds). */
const LATENCY_ROUNDS = 3;

/** Number of rounds of concurrent bursts in the concurrency test. */
const CONCURRENCY_ROUNDS = 5;

/**
 * Run the performance test suite.
 * Only tests scenarios that passed correctness.
 */
export async function runPerformanceTests(
  config: Config,
  passedScenarioIds: Set<string>,
): Promise<PerformanceResults> {
  console.log('\n  Running performance tests...\n');

  // Warmup
  console.log(`  Warming up with ${config.warmupRequests} requests...`);
  await performWarmup(config, passedScenarioIds);

  // Simple latency -- run multiple independent rounds & take median
  const simpleScenarios = getSimpleScenarios().filter(s => passedScenarioIds.has(s.id));
  let simpleLatency: LatencyStats | null = null;
  if (simpleScenarios.length > 0) {
    const totalReps = LATENCY_REPS_PER_ROUND * LATENCY_ROUNDS;
    console.log(`  Measuring simple latency (${simpleScenarios.length} scenarios, ${LATENCY_ROUNDS} rounds × ${LATENCY_REPS_PER_ROUND} reps = ${totalReps} samples)...`);
    simpleLatency = await measureLatencyMultiRound(simpleScenarios, LATENCY_REPS_PER_ROUND, LATENCY_ROUNDS);
    printLatencyStats('    Simple', simpleLatency);
  } else {
    console.log('  Skipping simple latency (no passing simple scenarios)');
  }

  // Complex latency -- run multiple independent rounds & take median
  const complexScenarios = getComplexScenarios().filter(s => passedScenarioIds.has(s.id));
  let complexLatency: LatencyStats | null = null;
  if (complexScenarios.length > 0) {
    const totalReps = LATENCY_REPS_PER_ROUND * LATENCY_ROUNDS;
    console.log(`  Measuring complex latency (${complexScenarios.length} scenarios, ${LATENCY_ROUNDS} rounds × ${LATENCY_REPS_PER_ROUND} reps = ${totalReps} samples)...`);
    complexLatency = await measureLatencyMultiRound(complexScenarios, LATENCY_REPS_PER_ROUND, LATENCY_ROUNDS);
    printLatencyStats('    Complex', complexLatency);
  } else {
    console.log('  Skipping complex latency (no passing complex scenarios)');
  }

  // Throughput using autocannon
  const allPassing = getCorrectnessFixtures().filter(s => passedScenarioIds.has(s.id));
  let throughput: ThroughputStats | null = null;
  if (allPassing.length > 0) {
    console.log(`  Measuring throughput (${config.throughputDuration}s sustained load)...`);
    throughput = await measureThroughput(config, allPassing);
    console.log(`    ${throughput.requests_per_second.toFixed(0)} req/s (${throughput.total_requests} total, ${throughput.error_count} errors)`);
  } else {
    console.log('  Skipping throughput (no passing scenarios)');
  }

  // Concurrency -- measure baseline first, then concurrent burst
  let concurrency: ConcurrencyStats | null = null;
  if (allPassing.length > 0) {
    console.log(`  Measuring concurrency (${config.concurrencyLevel} simultaneous requests, ${CONCURRENCY_ROUNDS} rounds)...`);

    // Baseline: measure sequential single-request latency (3 rounds for stability)
    console.log('    Measuring sequential baseline...');
    const baselineStats = await measureLatencyMultiRound(allPassing.slice(0, 1), 20, 3);
    console.log(`    Baseline (sequential): mean=${baselineStats.mean_ms.toFixed(2)}ms`);

    concurrency = await measureConcurrency(config, allPassing, baselineStats.mean_ms);
    console.log(`    Under load: mean=${concurrency.mean_ms.toFixed(2)}ms  p99=${concurrency.p99_ms.toFixed(2)}ms  errors=${concurrency.error_count}`);

    if (baselineStats.mean_ms > 0) {
      const degradation = concurrency.mean_ms / baselineStats.mean_ms;
      console.log(`    Degradation factor: ${degradation.toFixed(2)}x vs sequential baseline`);
    }
  } else {
    console.log('  Skipping concurrency (no passing scenarios)');
  }

  return {
    simple_latency: simpleLatency,
    complex_latency: complexLatency,
    throughput,
    concurrency,
    relative_scores: null,
  };
}

// ============ Warmup ============

async function performWarmup(config: Config, passedScenarioIds: Set<string>): Promise<void> {
  const fixtures = getCorrectnessFixtures().filter(f => passedScenarioIds.has(f.id));
  if (fixtures.length === 0) return;

  // Rotate through passing fixtures for a realistic warmup
  for (let i = 0; i < config.warmupRequests; i++) {
    const fixture = fixtures[i % fixtures.length];
    await sendCalculationRequest(fixture.request);
  }
}

// ============ Latency ============

/**
 * Run multiple independent latency rounds.
 *
 * Each round independently measures latency (repsPerRound samples per scenario).
 * The final result uses the *median round* by mean latency, which makes the
 * measurement robust against transient system load spikes (one bad round won't
 * poison the result).
 *
 * Additionally, the spread between rounds is reported so operators can judge
 * whether the test conditions were stable.
 */
async function measureLatencyMultiRound(
  scenarios: TestFixture[],
  repsPerRound: number,
  rounds: number,
): Promise<LatencyStats> {
  const roundStats: LatencyStats[] = [];

  for (let round = 1; round <= rounds; round++) {
    const stats = await measureLatency(scenarios, repsPerRound);
    roundStats.push(stats);
    console.log(`      Round ${round}/${rounds}: mean=${stats.mean_ms.toFixed(2)}ms`);
  }

  // Sort rounds by mean latency and pick the median round
  roundStats.sort((a, b) => a.mean_ms - b.mean_ms);
  const medianIndex = Math.floor(roundStats.length / 2);
  const medianRound = roundStats[medianIndex];

  // Report spread so operators can judge stability
  const spread = roundStats[roundStats.length - 1].mean_ms - roundStats[0].mean_ms;
  const spreadPct = roundStats[0].mean_ms > 0
    ? ((spread / roundStats[0].mean_ms) * 100).toFixed(1)
    : '0.0';
  console.log(`      Cross-round spread: ${spread.toFixed(2)}ms (${spreadPct}%) — using median round`);

  return medianRound;
}

/**
 * Measure sequential single-request latency.
 * Sends each scenario `reps` times sequentially and collects response times.
 */
async function measureLatency(
  scenarios: TestFixture[],
  reps: number,
): Promise<LatencyStats> {
  const times: number[] = [];

  for (const scenario of scenarios) {
    for (let i = 0; i < reps; i++) {
      const result = await sendCalculationRequest(scenario.request);
      if (!result.error) {
        times.push(result.elapsedMs);
      }
    }
  }

  return computeLatencyStats(times);
}

// ============ Throughput ============

/**
 * Measure sustained throughput using autocannon.
 * Cycles through all passing scenario request bodies.
 */
async function measureThroughput(
  config: Config,
  scenarios: TestFixture[],
): Promise<ThroughputStats> {
  const autocannon = require('autocannon');

  // Build request objects -- autocannon cycles through these automatically
  const requests = scenarios.map(s => ({
    method: 'POST' as const,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(s.request),
  }));

  const result = await new Promise<any>((resolve, reject) => {
    autocannon({
      url: `${config.target}/calculation-requests`,
      connections: 10,
      pipelining: 10,
      duration: config.throughputDuration,
      requests,
    }, (err: Error | null, res: any) => {
      if (err) reject(err);
      else resolve(res);
    });
  });

  const totalRequests = result.requests.total;
  const errorCount = (result.errors || 0) + (result.non2xx || 0);

  return {
    requests_per_second: result.requests.average,
    duration_seconds: config.throughputDuration,
    total_requests: totalRequests,
    error_count: errorCount,
    error_rate: totalRequests > 0 ? errorCount / totalRequests : 0,
  };
}

// ============ Concurrency ============

/**
 * Measure performance under parallel load.
 *
 * Runs multiple rounds of concurrent bursts:
 * - Each round fires `concurrencyLevel` requests simultaneously via Promise.all
 * - All response times are collected across rounds
 * - Results include mean/p99 latency under load and error count
 * - A baseline comparison shows the degradation factor vs sequential latency
 */
async function measureConcurrency(
  config: Config,
  scenarios: TestFixture[],
  _baselineMeanMs: number,
): Promise<ConcurrencyStats> {
  const concurrencyLevel = config.concurrencyLevel;
  const allTimes: number[] = [];
  let totalErrors = 0;

  for (let round = 0; round < CONCURRENCY_ROUNDS; round++) {
    const times: number[] = [];
    let roundErrors = 0;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < concurrencyLevel; i++) {
      const scenario = scenarios[i % scenarios.length];
      promises.push(
        sendCalculationRequest(scenario.request).then(result => {
          if (result.error || result.status !== 200) {
            roundErrors++;
          } else {
            times.push(result.elapsedMs);
          }
        })
      );
    }

    await Promise.all(promises);

    allTimes.push(...times);
    totalErrors += roundErrors;
  }

  const stats = computeLatencyStats(allTimes);

  return {
    concurrency_level: concurrencyLevel,
    mean_ms: stats.mean_ms,
    p99_ms: stats.p99_ms,
    error_count: totalErrors,
  };
}

// ============ Stats Helpers ============

function computeLatencyStats(times: number[]): LatencyStats {
  if (times.length === 0) {
    return {
      mean_ms: 0,
      median_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      min_ms: 0,
      max_ms: 0,
      sample_count: 0,
    };
  }

  times.sort((a, b) => a - b);

  const sum = times.reduce((s, t) => s + t, 0);
  const mean = sum / times.length;

  return {
    mean_ms: mean,
    median_ms: percentile(times, 50),
    p95_ms: percentile(times, 95),
    p99_ms: percentile(times, 99),
    min_ms: times[0],
    max_ms: times[times.length - 1],
    sample_count: times.length,
  };
}

/**
 * Interpolated percentile from a sorted array.
 */
function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function printLatencyStats(label: string, stats: LatencyStats): void {
  console.log(
    `${label}: mean=${stats.mean_ms.toFixed(2)}ms  median=${stats.median_ms.toFixed(2)}ms  ` +
    `p95=${stats.p95_ms.toFixed(2)}ms  p99=${stats.p99_ms.toFixed(2)}ms  ` +
    `min=${stats.min_ms.toFixed(2)}ms  max=${stats.max_ms.toFixed(2)}ms  ` +
    `(n=${stats.sample_count})`
  );
}
