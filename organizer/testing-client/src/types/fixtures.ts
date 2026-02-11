/**
 * Types for test fixture files.
 */

import {
  CalculationRequest,
  CalculationMessage,
  Situation,
} from './api';

export type FixtureCategory = 'correctness' | 'bonus';

/**
 * Complexity classification for performance test categorization.
 * - 'simple': basic scenarios (few mutations, no retirement calculation)
 * - 'complex': full pipeline scenarios (multiple mutations, retirement/projections)
 */
export type FixtureComplexity = 'simple' | 'complex';

export interface TestFixture {
  id: string;
  name: string;
  description: string;
  points: number;
  category: FixtureCategory;
  /** Complexity classification for performance test categorization. */
  complexity?: FixtureComplexity;
  request: CalculationRequest;
  expected: ExpectedResult;
}

export interface ExpectedResult {
  http_status: number;
  calculation_outcome: 'SUCCESS' | 'FAILURE';
  message_count: number;
  messages: ExpectedMessage[];
  end_situation: Situation;
  /** The mutation_id of the last successfully applied mutation */
  end_situation_mutation_id: string;
  /** The index of the last successfully applied mutation */
  end_situation_mutation_index: number;
  /** The actual_at of the end_situation */
  end_situation_actual_at: string;
  mutations_processed_count: number;
}

export interface ExpectedMessage {
  level: 'CRITICAL' | 'WARNING';
  code: string;
}
