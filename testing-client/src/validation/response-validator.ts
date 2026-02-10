/**
 * Validates calculation response against expected values from test fixtures.
 */

import { CalculationResponse } from '../types/api';
import { TestFixture } from '../types/fixtures';
import { compareSituations, ComparisonError } from './situation-comparator';

export interface ValidationResult {
  passed: boolean;
  errors: string[];
}

/**
 * Validate an HTTP response against a test fixture's expected values.
 */
export function validateResponse(
  fixture: TestFixture,
  httpStatus: number,
  body: CalculationResponse | null,
  rawBody?: string
): ValidationResult {
  const errors: string[] = [];

  // 1. HTTP status code
  if (httpStatus !== fixture.expected.http_status) {
    errors.push(`HTTP status: expected ${fixture.expected.http_status}, got ${httpStatus}`);
  }

  if (!body) {
    errors.push('Response body is null or could not be parsed as JSON');
    return { passed: false, errors };
  }

  // 2. Validate response structure (required fields)
  if (!body.calculation_metadata) {
    errors.push('Missing required field: calculation_metadata');
  }
  if (!body.calculation_result) {
    errors.push('Missing required field: calculation_result');
  }

  if (!body.calculation_metadata || !body.calculation_result) {
    return { passed: false, errors };
  }

  // 3. Validate calculation_metadata
  validateMetadata(fixture, body, errors);

  // 4. Validate messages
  validateMessages(fixture, body, errors);

  // 5. Validate initial_situation
  validateInitialSituation(fixture, body, errors);

  // 6. Validate mutations array
  validateMutationsArray(fixture, body, errors);

  // 7. Validate end_situation
  validateEndSituation(fixture, body, errors);

  return {
    passed: errors.length === 0,
    errors,
  };
}

function validateMetadata(
  fixture: TestFixture,
  body: CalculationResponse,
  errors: string[]
): void {
  const meta = body.calculation_metadata;

  // calculation_outcome
  if (meta.calculation_outcome !== fixture.expected.calculation_outcome) {
    errors.push(
      `calculation_outcome: expected "${fixture.expected.calculation_outcome}", got "${meta.calculation_outcome}"`
    );
  }

  // tenant_id echoed from request
  if (meta.tenant_id !== fixture.request.tenant_id) {
    errors.push(
      `tenant_id: expected "${fixture.request.tenant_id}", got "${meta.tenant_id}"`
    );
  }

  // calculation_id is a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(meta.calculation_id)) {
    errors.push(`calculation_id is not a valid UUID: "${meta.calculation_id}"`);
  }

  // calculation_duration_ms is a non-negative integer (per OpenAPI spec: type integer)
  if (typeof meta.calculation_duration_ms !== 'number' || meta.calculation_duration_ms < 0 || !Number.isInteger(meta.calculation_duration_ms)) {
    errors.push(`calculation_duration_ms should be a non-negative integer, got ${meta.calculation_duration_ms}`);
  }

  // Timestamps are valid ISO strings
  if (meta.calculation_started_at) {
    const startDate = new Date(meta.calculation_started_at);
    if (isNaN(startDate.getTime())) {
      errors.push(`calculation_started_at is not a valid ISO timestamp: "${meta.calculation_started_at}"`);
    }
  } else {
    errors.push('Missing required field: calculation_started_at');
  }

  if (meta.calculation_completed_at) {
    const endDate = new Date(meta.calculation_completed_at);
    if (isNaN(endDate.getTime())) {
      errors.push(`calculation_completed_at is not a valid ISO timestamp: "${meta.calculation_completed_at}"`);
    }
  } else {
    errors.push('Missing required field: calculation_completed_at');
  }

  // completed >= started
  if (meta.calculation_started_at && meta.calculation_completed_at) {
    const start = new Date(meta.calculation_started_at).getTime();
    const end = new Date(meta.calculation_completed_at).getTime();
    if (!isNaN(start) && !isNaN(end) && end < start) {
      errors.push('calculation_completed_at is before calculation_started_at');
    }
  }
}

function validateMessages(
  fixture: TestFixture,
  body: CalculationResponse,
  errors: string[]
): void {
  const messages = body.calculation_result.messages;

  if (!Array.isArray(messages)) {
    errors.push('messages is not an array');
    return;
  }

  // Check message count
  if (messages.length !== fixture.expected.message_count) {
    errors.push(
      `Message count: expected ${fixture.expected.message_count}, got ${messages.length}`
    );
  }

  // Check expected messages are present
  for (const expectedMsg of fixture.expected.messages) {
    const found = messages.find(
      m => m.level === expectedMsg.level && m.code === expectedMsg.code
    );
    if (!found) {
      errors.push(
        `Expected message not found: level="${expectedMsg.level}", code="${expectedMsg.code}"`
      );
    }
  }

  // Validate message structure
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (typeof msg.id !== 'number') {
      errors.push(`messages[${i}].id should be a number, got ${typeof msg.id}`);
    }
    if (!msg.level || !['CRITICAL', 'WARNING'].includes(msg.level)) {
      errors.push(`messages[${i}].level should be CRITICAL or WARNING, got "${msg.level}"`);
    }
    if (!msg.code || typeof msg.code !== 'string') {
      errors.push(`messages[${i}].code should be a non-empty string`);
    }
    if (!msg.message || typeof msg.message !== 'string') {
      errors.push(`messages[${i}].message should be a non-empty string`);
    }
  }
}

function validateInitialSituation(
  fixture: TestFixture,
  body: CalculationResponse,
  errors: string[]
): void {
  const initial = body.calculation_result.initial_situation;

  if (!initial) {
    errors.push('Missing initial_situation');
    return;
  }

  // situation.dossier must be null
  if (initial.situation?.dossier !== null) {
    errors.push('initial_situation.situation.dossier should be null');
  }

  // actual_at should be the first mutation's actual_at
  const firstMutationActualAt = fixture.request.calculation_instructions.mutations[0]?.actual_at;
  if (initial.actual_at !== firstMutationActualAt) {
    errors.push(
      `initial_situation.actual_at: expected "${firstMutationActualAt}", got "${initial.actual_at}"`
    );
  }
}

function validateMutationsArray(
  fixture: TestFixture,
  body: CalculationResponse,
  errors: string[]
): void {
  const mutations = body.calculation_result.mutations;

  if (!Array.isArray(mutations)) {
    errors.push('mutations is not an array');
    return;
  }

  // Check count
  if (mutations.length !== fixture.expected.mutations_processed_count) {
    errors.push(
      `Mutations processed count: expected ${fixture.expected.mutations_processed_count}, got ${mutations.length}`
    );
  }

  // Each entry's mutation should match the corresponding request mutation
  const requestMutations = fixture.request.calculation_instructions.mutations;
  const minLen = Math.min(mutations.length, fixture.expected.mutations_processed_count);

  const messageCount = body.calculation_result.messages?.length ?? 0;
  const referencedMessageIndexes = new Set<number>();

  for (let i = 0; i < minLen; i++) {
    if (!mutations[i]?.mutation) {
      errors.push(`mutations[${i}].mutation is missing`);
      continue;
    }

    const responseMutation = mutations[i].mutation;
    const requestMutation = requestMutations[i];

    if (!requestMutation) continue;

    // Validate mutation_id matches
    if (responseMutation.mutation_id?.toLowerCase() !== requestMutation.mutation_id?.toLowerCase()) {
      errors.push(
        `mutations[${i}].mutation.mutation_id: expected "${requestMutation.mutation_id}", got "${responseMutation.mutation_id}"`
      );
    }

    // Validate mutation_definition_name matches
    if (responseMutation.mutation_definition_name !== requestMutation.mutation_definition_name) {
      errors.push(
        `mutations[${i}].mutation.mutation_definition_name: expected "${requestMutation.mutation_definition_name}", got "${responseMutation.mutation_definition_name}"`
      );
    }

    // Validate calculation_message_indexes (if present)
    const msgIndexes = mutations[i].calculation_message_indexes;
    if (msgIndexes !== undefined && msgIndexes !== null) {
      if (!Array.isArray(msgIndexes)) {
        errors.push(`mutations[${i}].calculation_message_indexes should be an array`);
      } else {
        for (const idx of msgIndexes) {
          if (typeof idx !== 'number' || !Number.isInteger(idx)) {
            errors.push(`mutations[${i}].calculation_message_indexes contains non-integer value: ${idx}`);
          } else if (idx < 0 || idx >= messageCount) {
            errors.push(`mutations[${i}].calculation_message_indexes contains out-of-range index: ${idx} (messages array has ${messageCount} entries)`);
          } else {
            referencedMessageIndexes.add(idx);
          }
        }
      }
    }
  }

  // If any mutation has calculation_message_indexes, verify all messages are covered
  if (referencedMessageIndexes.size > 0 && messageCount > 0) {
    for (let i = 0; i < messageCount; i++) {
      if (!referencedMessageIndexes.has(i)) {
        errors.push(`Message at index ${i} is not referenced by any mutation's calculation_message_indexes`);
      }
    }
  }
}

function validateEndSituation(
  fixture: TestFixture,
  body: CalculationResponse,
  errors: string[]
): void {
  const endSit = body.calculation_result.end_situation;

  if (!endSit) {
    errors.push('Missing end_situation');
    return;
  }

  // Validate mutation_id
  if (endSit.mutation_id?.toLowerCase() !== fixture.expected.end_situation_mutation_id.toLowerCase()) {
    errors.push(
      `end_situation.mutation_id: expected "${fixture.expected.end_situation_mutation_id}", got "${endSit.mutation_id}"`
    );
  }

  // Validate mutation_index
  if (endSit.mutation_index !== fixture.expected.end_situation_mutation_index) {
    errors.push(
      `end_situation.mutation_index: expected ${fixture.expected.end_situation_mutation_index}, got ${endSit.mutation_index}`
    );
  }

  // Validate actual_at
  if (endSit.actual_at !== fixture.expected.end_situation_actual_at) {
    errors.push(
      `end_situation.actual_at: expected "${fixture.expected.end_situation_actual_at}", got "${endSit.actual_at}"`
    );
  }

  // Deep compare situation
  const sitErrors = compareSituations(
    fixture.expected.end_situation,
    endSit.situation,
    'end_situation.situation'
  );

  for (const err of sitErrors) {
    errors.push(`${err.path}: ${err.message}`);
  }
}
