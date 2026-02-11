/**
 * Correctness test suite.
 * Runs all correctness fixtures and validates responses.
 */

import { Config } from '../config';
import { getCorrectnessFixtures } from '../helpers/fixture-loader';
import { sendCalculationRequest } from '../helpers/http-client';
import { validateResponse } from '../validation/response-validator';
import { ScenarioResult, CorrectnessResults } from '../types/results';
import { TestFixture } from '../types/fixtures';

/**
 * Run the correctness test suite against the target.
 */
export async function runCorrectnessTests(config: Config): Promise<CorrectnessResults> {
  const fixtures = getCorrectnessFixtures();
  const results: ScenarioResult[] = [];

  console.log(`\n  Running ${fixtures.length} correctness scenarios...\n`);

  for (const fixture of fixtures) {
    const result = await runSingleScenario(fixture, config);
    results.push(result);

    const status = result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const points = `${result.points}/${result.max_points}`;
    console.log(`  [${status}]  ${fixture.id}  ${fixture.name.padEnd(50)} ${points}`);

    if (!result.passed && config.verbose) {
      for (const err of result.errors) {
        console.log(`    \x1b[33m→ ${err}\x1b[0m`);
      }
    } else if (!result.passed && result.errors.length > 0) {
      // Show first error even without verbose
      console.log(`    \x1b[33m→ ${result.errors[0]}\x1b[0m`);
    }
  }

  const total = results.reduce((sum, r) => sum + r.points, 0);
  const max = results.reduce((sum, r) => sum + r.max_points, 0);

  return {
    total,
    max,
    scenarios: results,
  };
}

async function runSingleScenario(
  fixture: TestFixture,
  config: Config,
): Promise<ScenarioResult> {
  try {
    const result = await sendCalculationRequest(fixture.request);

    if (result.error) {
      return {
        id: fixture.id,
        name: fixture.name,
        passed: false,
        points: 0,
        max_points: fixture.points,
        errors: [`Request failed: ${result.error}`],
        response_time_ms: result.elapsedMs,
      };
    }

    const validation = validateResponse(fixture, result.status, result.body, result.rawBody);

    if (config.verbose && !validation.passed) {
      console.log(`    Request: ${JSON.stringify(fixture.request, null, 2).substring(0, 200)}...`);
      console.log(`    Response status: ${result.status}`);
      console.log(`    Response: ${result.rawBody.substring(0, 500)}...`);
    }

    return {
      id: fixture.id,
      name: fixture.name,
      passed: validation.passed,
      points: validation.passed ? fixture.points : 0,
      max_points: fixture.points,
      errors: validation.errors,
      response_time_ms: result.elapsedMs,
    };
  } catch (err) {
    return {
      id: fixture.id,
      name: fixture.name,
      passed: false,
      points: 0,
      max_points: fixture.points,
      errors: [`Unexpected error: ${(err as Error).message}`],
    };
  }
}
