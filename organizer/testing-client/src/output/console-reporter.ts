/**
 * Console output formatting.
 * Displays test results in a human-readable table format.
 */

import { TestResults } from '../types/results';

/**
 * Print the full results to console.
 */
export function printResults(results: TestResults): void {
  console.log('\n=== Visma Performance Hackathon - Test Results ===');
  console.log(`Team: ${results.team}`);
  console.log(`Target: ${results.target}`);

  // --- Correctness ---
  console.log(`\n--- Correctness (${results.correctness.max} pts) ---`);
  for (const scenario of results.correctness.scenarios) {
    const status = scenario.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const points = `${scenario.points}/${scenario.max_points}`;
    console.log(`  [${status}]  ${scenario.id}  ${scenario.name.padEnd(50)} ${points}`);
    if (!scenario.passed && scenario.errors.length > 0) {
      console.log(`    \x1b[33m→ ${scenario.errors[0]}\x1b[0m`);
    }
  }
  console.log(`  Subtotal: ${results.correctness.total}/${results.correctness.max}`);

  // --- Performance ---
  console.log('\n--- Performance ---');
  if (results.performance.simple_latency) {
    const s = results.performance.simple_latency;
    console.log(`  Simple latency:   mean=${s.mean_ms.toFixed(2)}ms  median=${s.median_ms.toFixed(2)}ms  p95=${s.p95_ms.toFixed(2)}ms  p99=${s.p99_ms.toFixed(2)}ms`);
  } else {
    console.log('  Simple latency:   (not measured)');
  }

  if (results.performance.complex_latency) {
    const c = results.performance.complex_latency;
    console.log(`  Complex latency:  mean=${c.mean_ms.toFixed(2)}ms  median=${c.median_ms.toFixed(2)}ms  p95=${c.p95_ms.toFixed(2)}ms  p99=${c.p99_ms.toFixed(2)}ms`);
  } else {
    console.log('  Complex latency:  (not measured)');
  }

  if (results.performance.throughput) {
    const t = results.performance.throughput;
    console.log(`  Throughput:       ${t.requests_per_second.toFixed(0)} req/s (${t.duration_seconds}s sustained)`);
  } else {
    console.log('  Throughput:       (not measured)');
  }

  if (results.performance.concurrency) {
    const c = results.performance.concurrency;
    console.log(`  Concurrency:      mean=${c.mean_ms.toFixed(2)}ms under ${c.concurrency_level} concurrent connections`);
  } else {
    console.log('  Concurrency:      (not measured)');
  }

  if (results.performance.relative_scores) {
    const r = results.performance.relative_scores;
    console.log(`  Performance Score: ${r.total.toFixed(1)}/40 (simple=${r.simple_latency_score.toFixed(1)} complex=${r.complex_latency_score.toFixed(1)} throughput=${r.throughput_score.toFixed(1)} concurrency=${r.concurrency_score.toFixed(1)})`);
  } else {
    console.log('  (Relative scoring requires multi-team results)');
  }

  // --- Bonus ---
  console.log(`\n--- Bonus (${results.bonus.max} pts) ---`);

  const bonusItems = [
    { name: 'Forward JSON Patch', result: results.bonus.forward_json_patch, max: 7 },
    { name: 'Backward JSON Patch', result: results.bonus.backward_json_patch, max: 4 },
    { name: 'Clean Mutation Architecture (AI review)', result: { passed: results.bonus.clean_architecture.points > 0, points: results.bonus.clean_architecture.points }, max: 4 },
    { name: `Cold Start${results.bonus.cold_start.time_ms != null ? `: ${results.bonus.cold_start.time_ms.toFixed(0)}ms` : ''}`, result: { passed: results.bonus.cold_start.points > 0, points: results.bonus.cold_start.points }, max: 5 },
    { name: 'Scheme Registry Integration', result: results.bonus.scheme_registry, max: 5 },
    { name: 'project_future_benefits', result: results.bonus.project_future_benefits, max: 5 },
  ];

  for (const item of bonusItems) {
    const status = item.result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  [${status}]  ${item.name.padEnd(50)} ${item.result.points}/${item.max}`);
    if (!item.result.passed && 'errors' in item.result && (item.result as any).errors?.length > 0) {
      console.log(`    \x1b[33m→ ${(item.result as any).errors[0]}\x1b[0m`);
    }
  }
  console.log(`  Subtotal: ${results.bonus.total}/${results.bonus.max}`);

  // --- Code Quality ---
  console.log(`\n--- Code Quality (AI Review, 5 pts) ---`);
  console.log(`  Readability & Organization:  ${results.code_quality.readability_and_organization}/2`);
  console.log(`  Error Handling:              ${results.code_quality.error_handling}/1.5`);
  console.log(`  Project Structure:           ${results.code_quality.project_structure}/1.5`);
  console.log(`  Subtotal: ${results.code_quality.points}/5`);

  // --- Summary ---
  console.log('\n--- Summary ---');
  console.log(`  Correctness:  ${results.correctness.total}/${results.correctness.max}`);
  if (results.performance.relative_scores) {
    console.log(`  Performance:  ${results.performance.relative_scores.total.toFixed(1)}/40`);
  } else {
    console.log('  Performance:  (raw metrics above, relative scoring pending)');
  }
  console.log(`  Bonus:        ${results.bonus.total}/${results.bonus.max}`);
  console.log(`  Code Quality: ${results.code_quality.points}/5`);

  const perfScore = results.performance.relative_scores?.total ?? 0;
  const totalWithPerf = results.correctness.total + perfScore + results.bonus.total + results.code_quality.points;
  if (results.performance.relative_scores) {
    console.log(`  TOTAL:        ${totalWithPerf.toFixed(1)}/115`);
  } else {
    console.log(`  TOTAL:        ${results.total.scored}/115 (excluding relative performance)`);
  }
  console.log('');
}
