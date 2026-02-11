/**
 * CLI entry point for the hackathon testing client.
 */

import { parseConfig } from './config';
import { run } from './runner';

async function main(): Promise<void> {
  const config = parseConfig();
  await run(config);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
