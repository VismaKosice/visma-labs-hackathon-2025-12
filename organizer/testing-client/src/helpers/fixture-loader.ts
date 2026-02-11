/**
 * Loads test fixtures from the fixtures/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestFixture } from '../types/fixtures';

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'fixtures');

/** In-memory cache to avoid re-reading fixtures on every call. */
let fixtureCache: TestFixture[] | null = null;

/**
 * Load all fixtures from the fixtures directory (cached after first call).
 */
export function loadAllFixtures(): TestFixture[] {
  if (fixtureCache) return fixtureCache;

  const files = fs.readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  fixtureCache = files.map(f => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf-8');
    return JSON.parse(content) as TestFixture;
  });

  return fixtureCache;
}

/**
 * Load fixtures by category.
 */
export function loadFixturesByCategory(category: 'correctness' | 'bonus'): TestFixture[] {
  return loadAllFixtures().filter(f => f.category === category);
}

/**
 * Load a specific fixture by ID.
 */
export function loadFixtureById(id: string): TestFixture | undefined {
  return loadAllFixtures().find(f => f.id === id);
}

/**
 * Get correctness fixtures only (C01-C10).
 */
export function getCorrectnessFixtures(): TestFixture[] {
  return loadFixturesByCategory('correctness');
}

/**
 * Get bonus fixtures only (B01+).
 */
export function getBonusFixtures(): TestFixture[] {
  return loadFixturesByCategory('bonus');
}

/**
 * Get simple scenarios for latency testing.
 * Uses the `complexity` field in fixtures. Falls back to known IDs if unset.
 */
export function getSimpleScenarios(): TestFixture[] {
  const byField = loadAllFixtures().filter(f => f.complexity === 'simple');
  if (byField.length > 0) return byField;
  // Fallback for fixtures without the complexity field
  return loadAllFixtures().filter(f => ['C01', 'C02', 'C03'].includes(f.id));
}

/**
 * Get complex scenarios for latency testing.
 * Uses the `complexity` field in fixtures. Falls back to known IDs if unset.
 */
export function getComplexScenarios(): TestFixture[] {
  const byField = loadAllFixtures().filter(f => f.complexity === 'complex');
  if (byField.length > 0) return byField;
  // Fallback for fixtures without the complexity field
  return loadAllFixtures().filter(f => ['C07', 'C08'].includes(f.id));
}
