/**
 * JSON output generation.
 * Writes test results to a JSON file for leaderboard consumption.
 */

import * as fs from 'fs';
import { TestResults } from '../types/results';

/**
 * Write test results to a JSON file.
 */
export function writeJsonResults(results: TestResults, outputPath: string): void {
  const json = JSON.stringify(results, null, 2);
  fs.writeFileSync(outputPath, json + '\n');
  console.log(`Results written to ${outputPath}`);
}
