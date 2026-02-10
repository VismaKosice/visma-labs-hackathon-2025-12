/**
 * Bonus test suite.
 * Tests JSON Patch, project_future_benefits, and External Scheme Registry.
 */

import * as http from 'http';
import * as net from 'net';
import axios from 'axios';
import { Config } from '../config';
import { getCorrectnessFixtures, loadFixtureById } from '../helpers/fixture-loader';
import { sendCalculationRequest, createHttpClient } from '../helpers/http-client';
import { validateResponse } from '../validation/response-validator';
import { validatePatches } from '../validation/json-patch-validator';
import { BonusResults, BonusFeatureResult } from '../types/results';
import { calculateRetirementBenefit, PolicyForCalc } from '../helpers/pension-math';

/**
 * Find a free port by binding to port 0 (OS-assigned) then closing.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not determine port')));
      }
    });
    server.on('error', reject);
  });
}

/**
 * Run the bonus test suite.
 * Cold start and AI review are handled separately in the runner.
 */
export async function runBonusTests(
  config: Config,
  passedScenarioIds: Set<string>,
): Promise<BonusResults> {
  console.log('\n  Running bonus tests...\n');

  // FR-4.1: Forward JSON Patch
  const forwardPatch = await testForwardJsonPatch(config, passedScenarioIds);
  logBonusResult('Forward JSON Patch', forwardPatch, 7);

  // FR-4.2: Backward JSON Patch
  const backwardPatch = await testBackwardJsonPatch(config, passedScenarioIds);
  logBonusResult('Backward JSON Patch', backwardPatch, 4);

  // FR-4.3: project_future_benefits
  const projections = await testProjectFutureBenefits(config);
  logBonusResult('project_future_benefits', projections, 5);

  // FR-4.4: External Scheme Registry
  const schemeRegistry = await testSchemeRegistry(config, passedScenarioIds);
  logBonusResult('Scheme Registry Integration', schemeRegistry, 5);

  const total = forwardPatch.points + backwardPatch.points + projections.points + schemeRegistry.points;

  return {
    total,
    max: 30,
    forward_json_patch: forwardPatch,
    backward_json_patch: backwardPatch,
    // Cold start and clean architecture are populated by the runner
    clean_architecture: {
      common_interface: 0,
      per_mutation_implementation: 0,
      generic_dispatch: 0,
      extensibility: 0,
      points: 0,
    },
    cold_start: {
      time_ms: null,
      points: 0,
    },
    scheme_registry: schemeRegistry,
    project_future_benefits: projections,
  };
}

function logBonusResult(name: string, result: BonusFeatureResult, maxPoints: number): void {
  const status = result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${status}]  ${name.padEnd(50)} ${result.points}/${maxPoints}`);
  if (!result.passed && result.errors?.length) {
    console.log(`    \x1b[33m→ ${result.errors[0]}\x1b[0m`);
  }
}

/**
 * FR-4.1: Validate forward JSON Patches across all passing correctness scenarios.
 */
async function testForwardJsonPatch(
  config: Config,
  passedScenarioIds: Set<string>,
): Promise<BonusFeatureResult> {
  const fixtures = getCorrectnessFixtures().filter(f => passedScenarioIds.has(f.id));
  if (fixtures.length === 0) {
    return { passed: false, points: 0, errors: ['No passing correctness scenarios to test patches against'] };
  }

  const allErrors: string[] = [];

  for (const fixture of fixtures) {
    const result = await sendCalculationRequest(fixture.request);
    if (!result.body || result.error) {
      allErrors.push(`${fixture.id}: Request failed`);
      continue;
    }

    const response = result.body;
    const mutations = response.calculation_result?.mutations;
    if (!mutations) {
      allErrors.push(`${fixture.id}: No mutations in response`);
      continue;
    }

    // Check if forward patches exist
    const hasForwardPatches = mutations.every(
      m => m.forward_patch_to_situation_after_this_mutation != null
    );

    if (!hasForwardPatches) {
      allErrors.push(`${fixture.id}: Not all mutations have forward_patch_to_situation_after_this_mutation`);
      continue;
    }

    const patchResult = validatePatches(
      response.calculation_result.initial_situation.situation,
      response.calculation_result.end_situation.situation,
      mutations,
    );

    if (!patchResult.forwardValid) {
      allErrors.push(...patchResult.forwardErrors.map(e => `${fixture.id}: ${e}`));
    }
  }

  return {
    passed: allErrors.length === 0,
    points: allErrors.length === 0 ? 7 : 0,
    errors: allErrors,
  };
}

/**
 * FR-4.2: Validate backward JSON Patches.
 */
async function testBackwardJsonPatch(
  config: Config,
  passedScenarioIds: Set<string>,
): Promise<BonusFeatureResult> {
  const fixtures = getCorrectnessFixtures().filter(f => passedScenarioIds.has(f.id));
  if (fixtures.length === 0) {
    return { passed: false, points: 0, errors: ['No passing correctness scenarios'] };
  }

  const allErrors: string[] = [];

  for (const fixture of fixtures) {
    const result = await sendCalculationRequest(fixture.request);
    if (!result.body || result.error) {
      allErrors.push(`${fixture.id}: Request failed`);
      continue;
    }

    const response = result.body;
    const mutations = response.calculation_result?.mutations;
    if (!mutations) continue;

    const patchResult = validatePatches(
      response.calculation_result.initial_situation.situation,
      response.calculation_result.end_situation.situation,
      mutations,
    );

    if (!patchResult.forwardValid) {
      allErrors.push(`${fixture.id}: Forward patches invalid (required for backward validation)`);
      continue;
    }

    if (!patchResult.backwardValid) {
      allErrors.push(...patchResult.backwardErrors.map(e => `${fixture.id}: ${e}`));
    }
  }

  return {
    passed: allErrors.length === 0,
    points: allErrors.length === 0 ? 4 : 0,
    errors: allErrors,
  };
}

/**
 * FR-4.3: Test project_future_benefits bonus mutation.
 */
async function testProjectFutureBenefits(config: Config): Promise<BonusFeatureResult> {
  const fixture = loadFixtureById('B01');
  if (!fixture) {
    return { passed: false, points: 0, errors: ['B01 fixture not found'] };
  }

  const result = await sendCalculationRequest(fixture.request);
  if (result.error) {
    return { passed: false, points: 0, errors: [`Request failed: ${result.error}`] };
  }

  if (!result.body) {
    return { passed: false, points: 0, errors: ['No response body'] };
  }

  const validation = validateResponse(fixture, result.status, result.body);
  return {
    passed: validation.passed,
    points: validation.passed ? 5 : 0,
    errors: validation.errors,
  };
}

/**
 * FR-4.4: Test External Scheme Registry Integration.
 *
 * Strategy:
 * - If --cold-start-image is provided: start a new container with SCHEME_REGISTRY_URL set,
 *   send the test request to that container, then tear it down.
 * - If --cold-start-image is NOT provided: start the mock registry and send the request
 *   to the existing target (assumes the team manually set SCHEME_REGISTRY_URL).
 *
 * Mock Scheme Registry:
 * - GET /schemes/{scheme_id} → { "scheme_id": "...", "accrual_rate": 0.025 } with ~50ms delay
 */
async function testSchemeRegistry(
  config: Config,
  passedScenarioIds: Set<string>,
): Promise<BonusFeatureResult> {
  const baseFixture = loadFixtureById('C07');
  if (!baseFixture || !passedScenarioIds.has('C07')) {
    return {
      passed: false,
      points: 0,
      errors: ['C07 (full happy path) must pass correctness first to test scheme registry'],
    };
  }

  const mockAccrualRate = 0.025;
  let requestCount = 0;

  // Start mock scheme registry
  const server = http.createServer((req, res) => {
    requestCount++;
    setTimeout(() => {
      const schemeIdMatch = req.url?.match(/\/schemes\/(.+)/);
      const schemeId = schemeIdMatch ? decodeURIComponent(schemeIdMatch[1]) : 'UNKNOWN';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ scheme_id: schemeId, accrual_rate: mockAccrualRate }));
    }, 50);
  });

  let container: any = null;
  let targetUrl = config.target;

  try {
    // Start mock on random port
    await new Promise<void>((resolve) => {
      server.listen(0, '0.0.0.0', () => resolve());
    });

    const address = server.address() as net.AddressInfo;
    if (!address) {
      return { passed: false, points: 0, errors: ['Could not start mock server'] };
    }

    const mockPort = address.port;
    console.log(`    Mock Scheme Registry started on port ${mockPort}`);

    if (config.coldStartImage) {
      // Docker mode: start a new container with the env var
      const Dockerode = require('dockerode');
      const docker = new Dockerode();
      const containerPort = await findFreePort();

      // Use host.docker.internal (macOS/Windows) or 172.17.0.1 (Linux) to reach the host
      const hostAddress = process.platform === 'linux' ? '172.17.0.1' : 'host.docker.internal';
      const registryUrl = `http://${hostAddress}:${mockPort}`;

      console.log(`    Starting container with SCHEME_REGISTRY_URL=${registryUrl}`);

      container = await docker.createContainer({
        Image: config.coldStartImage,
        Env: [`SCHEME_REGISTRY_URL=${registryUrl}`],
        ExposedPorts: { '8080/tcp': {} },
        HostConfig: {
          PortBindings: {
            '8080/tcp': [{ HostPort: String(containerPort) }],
          },
        },
      });
      await container.start();

      // Wait for container to be ready (poll up to 15s)
      targetUrl = `http://localhost:${containerPort}`;
      const ready = await waitForTarget(targetUrl, baseFixture.request, 15000);
      if (!ready) {
        return { passed: false, points: 0, errors: ['Container did not become ready within 15s'] };
      }
      console.log(`    Container ready at ${targetUrl}`);
    } else {
      // Non-Docker mode: send to existing target
      // The team must have started their engine with SCHEME_REGISTRY_URL pointing to us
      const hostAddress = 'localhost';
      const registryUrl = `http://${hostAddress}:${mockPort}`;
      console.log(`    No --cold-start-image provided. Assuming target was started with SCHEME_REGISTRY_URL=${registryUrl}`);
      console.log(`    (If not, restart your engine with this env var to pass this test)`);
    }

    // Send the C07 request to the target
    console.log(`    Sending request to ${targetUrl}...`);
    const httpClient = createHttpClient(targetUrl);
    const result = await sendCalculationRequest(baseFixture.request, httpClient);

    // Restore the original HTTP client target
    createHttpClient(config.target);

    if (result.error || !result.body) {
      return { passed: false, points: 0, errors: [`Request failed: ${result.error || 'empty response'}`] };
    }

    const endSit = result.body.calculation_result?.end_situation?.situation;
    if (!endSit?.dossier?.policies) {
      return { passed: false, points: 0, errors: ['No policies in response end_situation'] };
    }

    // Derive policy data from the C07 fixture's expected end_situation (not hardcoded)
    const expectedPolicies = baseFixture.expected.end_situation.dossier!.policies;
    const policiesForCalc: PolicyForCalc[] = expectedPolicies.map(p => ({
      policy_id: p.policy_id,
      scheme_id: p.scheme_id,
      employment_start_date: p.employment_start_date,
      salary: p.salary,
      part_time_factor: p.part_time_factor,
    }));

    // Derive retirement date from the C07 fixture's expected end_situation
    const retirementDate = baseFixture.expected.end_situation.dossier!.retirement_date!;
    const retResultRegistry = calculateRetirementBenefit(policiesForCalc, retirementDate, mockAccrualRate);
    const retResultDefault = calculateRetirementBenefit(policiesForCalc, retirementDate, 0.02);

    // Check if the engine used the registry accrual rate
    const actualPolicies = endSit.dossier.policies;
    let usedRegistryRate = true;
    const errors: string[] = [];

    for (const policy of actualPolicies) {
      const expectedRegistryPension = retResultRegistry.policy_pensions.get(policy.policy_id);
      const expectedDefaultPension = retResultDefault.policy_pensions.get(policy.policy_id);

      if (expectedRegistryPension === undefined || policy.attainable_pension === null) continue;

      if (Math.abs(policy.attainable_pension - expectedRegistryPension) < 0.01) {
        continue; // Matches registry rate
      }

      usedRegistryRate = false;
      if (expectedDefaultPension !== undefined && Math.abs(policy.attainable_pension - expectedDefaultPension) < 0.01) {
        errors.push(`Policy ${policy.policy_id}: pension ${policy.attainable_pension.toFixed(2)} matches default rate (0.02), not registry rate (0.025). Expected ~${expectedRegistryPension.toFixed(2)}`);
      } else {
        errors.push(`Policy ${policy.policy_id}: pension ${policy.attainable_pension.toFixed(2)} matches neither default (~${expectedDefaultPension?.toFixed(2)}) nor registry rate (~${expectedRegistryPension.toFixed(2)})`);
      }
    }

    if (requestCount === 0) {
      errors.push('Mock registry received 0 requests — engine did not call the registry');
      usedRegistryRate = false;
    } else {
      console.log(`    Mock registry received ${requestCount} request(s)`);
    }

    return {
      passed: usedRegistryRate && errors.length === 0,
      points: usedRegistryRate && errors.length === 0 ? 5 : 0,
      errors,
    };
  } finally {
    server.close();
    if (container) {
      try { await container.stop({ t: 1 }); } catch { /* ignore */ }
      try { await container.remove({ force: true }); } catch { /* ignore */ }
    }
  }
}

/**
 * Poll a target URL until it responds with HTTP 200, or timeout.
 */
async function waitForTarget(
  targetUrl: string,
  request: any,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await axios.post(`${targetUrl}/calculation-requests`, request, {
        timeout: 2000,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      });
      if (response.status === 200) return true;
    } catch {
      // Connection refused - keep polling
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}
