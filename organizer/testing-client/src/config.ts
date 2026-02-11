/**
 * CLI argument parsing and configuration.
 */

import { Command } from 'commander';

export interface Config {
  target: string;
  suite: 'all' | 'correctness' | 'performance' | 'bonus';
  output?: string;
  team: string;
  coldStartImage?: string;
  skipColdStart: boolean;
  codePath?: string;
  verbose: boolean;
  warmupRequests: number;
  throughputDuration: number;
  concurrencyLevel: number;
  resultsDir?: string;
  leaderboard: boolean;
}

export function parseConfig(argv?: string[]): Config {
  const program = new Command();

  program
    .name('hackathon-testing-client')
    .description('Testing client for the Visma Performance Hackathon')
    .option('--target <url>', 'Base URL of the team\'s API (e.g., http://localhost:8080)')
    .option('--suite <name>', 'Which test suite to run: all, correctness, performance, bonus', 'all')
    .option('--output <path>', 'Path to write JSON results file')
    .option('--team <name>', 'Team name (included in output)', 'unnamed')
    .option('--cold-start-image <image>', 'Docker image name for cold start and scheme registry testing')
    .option('--skip-cold-start', 'Skip cold start timing test (image is still used for scheme registry)', false)
    .option('--code-path <path>', 'Path to team\'s source code for AI code review')
    .option('--verbose', 'Show detailed output including request/response bodies for failed tests', false)
    .option('--warmup-requests <count>', 'Number of warmup requests before performance measurement', '20')
    .option('--throughput-duration <seconds>', 'Duration in seconds for throughput test', '15')
    .option('--concurrency-level <count>', 'Number of concurrent connections for concurrency test', '50')
    .option('--results-dir <path>', 'Directory with JSON result files for leaderboard scoring')
    .option('--leaderboard', 'Calculate and display multi-team leaderboard', false);

  if (argv) {
    program.parse(argv, { from: 'user' });
  } else {
    program.parse();
  }

  const opts = program.opts();

  // Validate: --target is required unless in leaderboard-only mode
  const isLeaderboardOnly = opts.leaderboard && opts.resultsDir && !opts.target;
  if (!opts.target && !isLeaderboardOnly) {
    console.error('Error: --target <url> is required (unless using --leaderboard --results-dir)');
    process.exit(1);
  }

  // Validate --suite value
  const validSuites = ['all', 'correctness', 'performance', 'bonus'];
  if (!validSuites.includes(opts.suite)) {
    console.error(`Error: --suite must be one of: ${validSuites.join(', ')}. Got: "${opts.suite}"`);
    process.exit(1);
  }

  // Validate numeric options
  const warmupRequests = parseInt(opts.warmupRequests, 10);
  const throughputDuration = parseInt(opts.throughputDuration, 10);
  const concurrencyLevel = parseInt(opts.concurrencyLevel, 10);

  if (isNaN(warmupRequests) || warmupRequests < 0) {
    console.error(`Error: --warmup-requests must be a non-negative integer. Got: "${opts.warmupRequests}"`);
    process.exit(1);
  }
  if (isNaN(throughputDuration) || throughputDuration <= 0) {
    console.error(`Error: --throughput-duration must be a positive integer. Got: "${opts.throughputDuration}"`);
    process.exit(1);
  }
  if (isNaN(concurrencyLevel) || concurrencyLevel <= 0) {
    console.error(`Error: --concurrency-level must be a positive integer. Got: "${opts.concurrencyLevel}"`);
    process.exit(1);
  }

  return {
    target: opts.target ? opts.target.replace(/\/$/, '') : '',
    suite: opts.suite as Config['suite'],
    output: opts.output,
    team: opts.team,
    coldStartImage: opts.coldStartImage,
    skipColdStart: opts.skipColdStart,
    codePath: opts.codePath,
    verbose: opts.verbose,
    warmupRequests,
    throughputDuration,
    concurrencyLevel,
    resultsDir: opts.resultsDir,
    leaderboard: opts.leaderboard,
  };
}
