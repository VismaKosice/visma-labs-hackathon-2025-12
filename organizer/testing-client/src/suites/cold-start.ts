/**
 * Cold start test.
 * Measures time from docker run to first successful HTTP 200 response.
 */

import * as net from 'net';
import { Config } from '../config';
import { loadFixtureById } from '../helpers/fixture-loader';
import { ColdStartResult } from '../types/results';
import axios from 'axios';

const POLL_INTERVAL_MS = 50;
const MAX_WAIT_MS = 30000;

/**
 * Run the cold start test.
 * Pre-condition: --cold-start-image parameter must be provided.
 */
export async function runColdStartTest(config: Config): Promise<ColdStartResult> {
  if (!config.coldStartImage) {
    console.log('  Cold start test skipped (no --cold-start-image provided)');
    return { time_ms: null, points: 0 };
  }

  console.log(`\n  Running cold start test for image: ${config.coldStartImage}`);
  console.log('  Running 3 iterations, taking median...\n');

  const Dockerode = require('dockerode');
  const docker = new Dockerode();
  const fixture = loadFixtureById('C01');

  if (!fixture) {
    console.log('  Error: C01 fixture not found');
    return { time_ms: null, points: 0 };
  }

  // PRD: "Ensure no container from this image is running" before each attempt.
  // Stop and remove any existing containers from this image.
  await stopExistingContainers(docker, config.coldStartImage);

  const times: number[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`  Attempt ${attempt}/3...`);
    const time = await measureSingleColdStart(docker, config.coldStartImage, fixture.request);
    if (time !== null) {
      times.push(time);
      console.log(`    Cold start time: ${time.toFixed(0)}ms`);
    } else {
      console.log(`    Failed to get response within ${MAX_WAIT_MS}ms`);
    }
  }

  if (times.length === 0) {
    console.log('  All cold start attempts failed');
    return { time_ms: null, points: 0 };
  }

  // Take median
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];

  const points = scoreColdStart(median);
  console.log(`  Median cold start: ${median.toFixed(0)}ms → ${points} points`);

  return { time_ms: median, points };
}

function scoreColdStart(timeMs: number): number {
  if (timeMs < 500) return 5;
  if (timeMs < 1000) return 3;
  if (timeMs < 3000) return 1;
  return 0;
}

/**
 * Find a free port by binding to port 0 (the OS picks one) then closing.
 * This is race-free compared to random port selection.
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
 * Stop and remove any existing containers from the given image.
 * PRD FR-4.5: "Ensure no container from this image is running" before each cold start attempt.
 */
async function stopExistingContainers(docker: any, imageName: string): Promise<void> {
  try {
    const containers = await docker.listContainers({ all: true });
    for (const containerInfo of containers) {
      if (containerInfo.Image === imageName) {
        const container = docker.getContainer(containerInfo.Id);
        try {
          await container.stop({ t: 1 });
        } catch {
          // May already be stopped
        }
        try {
          await container.remove({ force: true });
        } catch {
          // Best effort
        }
        console.log(`    Stopped existing container ${containerInfo.Id.substring(0, 12)} from ${imageName}`);
      }
    }
  } catch {
    // If Docker isn't available or listing fails, proceed anyway
  }
}

async function measureSingleColdStart(
  docker: any,
  imageName: string,
  request: any,
): Promise<number | null> {
  const port = await findFreePort();

  let container: any = null;

  try {
    // Create and start container
    container = await docker.createContainer({
      Image: imageName,
      ExposedPorts: { '8080/tcp': {} },
      HostConfig: {
        PortBindings: {
          '8080/tcp': [{ HostPort: String(port) }],
        },
      },
    });

    const startTime = process.hrtime.bigint();
    await container.start();

    // Poll until we get a successful response
    const targetUrl = `http://localhost:${port}/calculation-requests`;
    let elapsed = 0;

    while (elapsed < MAX_WAIT_MS) {
      try {
        const response = await axios.post(targetUrl, request, {
          timeout: 2000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true,
        });

        if (response.status === 200) {
          const endTime = process.hrtime.bigint();
          const totalMs = Number(endTime - startTime) / 1_000_000;
          return totalMs;
        }
      } catch {
        // Connection refused or timeout - keep polling
      }

      await sleep(POLL_INTERVAL_MS);
      elapsed += POLL_INTERVAL_MS;
    }

    return null;
  } finally {
    // Cleanup: stop and remove container
    if (container) {
      try {
        await container.stop({ t: 1 });
      } catch {
        // May already be stopped
      }
      try {
        await container.remove({ force: true });
      } catch {
        // Best effort
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
