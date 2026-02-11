/**
 * Captures a snapshot of the host environment at test time.
 * Used to detect unfair conditions (high load, low memory) and
 * to make results from different runs / machines comparable.
 */

import * as os from 'os';
import { EnvironmentSnapshot } from '../types/results';

/**
 * Take a snapshot of the current system environment.
 */
export function captureEnvironment(): EnvironmentSnapshot {
  const cpus = os.cpus();
  const loadAvg = os.loadavg(); // [1m, 5m, 15m]
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    os: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpus: cpus.length,
    cpu_model: cpus.length > 0 ? cpus[0].model.trim() : 'unknown',
    total_memory_mb: Math.round(totalMem / (1024 * 1024)),
    free_memory_mb: Math.round(freeMem / (1024 * 1024)),
    load_avg_1m: Math.round(loadAvg[0] * 100) / 100,
    load_avg_5m: Math.round(loadAvg[1] * 100) / 100,
    load_avg_15m: Math.round(loadAvg[2] * 100) / 100,
    node_version: process.version,
  };
}

/**
 * Print a warning if the system is under heavy load,
 * which could make performance results unreliable.
 */
export function warnIfUnfairConditions(env: EnvironmentSnapshot): void {
  const loadRatio = env.load_avg_1m / env.cpus;
  if (loadRatio > 0.7) {
    console.log(
      `\x1b[33m  ⚠ High system load detected (${env.load_avg_1m.toFixed(1)} on ${env.cpus} cores, ratio ${loadRatio.toFixed(2)}).` +
      `\n    Performance results may be unreliable. Consider re-running when the system is idle.\x1b[0m`
    );
  }

  const freeRatio = env.free_memory_mb / env.total_memory_mb;
  if (freeRatio < 0.1) {
    console.log(
      `\x1b[33m  ⚠ Low free memory (${env.free_memory_mb}MB / ${env.total_memory_mb}MB).` +
      `\n    This may cause swapping and affect performance results.\x1b[0m`
    );
  }
}
