/**
 * Deep comparison of situation objects with numeric tolerance.
 */

const NUMERIC_TOLERANCE = 0.01;

export interface ComparisonError {
  path: string;
  expected: unknown;
  actual: unknown;
  message: string;
}

/**
 * Deep-compare two values with numeric tolerance and return all differences.
 */
export function compareSituations(
  expected: unknown,
  actual: unknown,
  path: string = ''
): ComparisonError[] {
  const errors: ComparisonError[] = [];

  if (expected === null || expected === undefined) {
    if (actual !== null && actual !== undefined) {
      errors.push({
        path,
        expected,
        actual,
        message: `Expected ${expected}, got ${JSON.stringify(actual)}`,
      });
    }
    return errors;
  }

  if (actual === null || actual === undefined) {
    errors.push({
      path,
      expected,
      actual,
      message: `Expected ${JSON.stringify(expected)}, got ${actual}`,
    });
    return errors;
  }

  // Numeric comparison with tolerance
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Math.abs(expected - actual) > NUMERIC_TOLERANCE) {
      errors.push({
        path,
        expected,
        actual,
        message: `Numeric mismatch: expected ${expected}, got ${actual} (diff: ${Math.abs(expected - actual)}, tolerance: ${NUMERIC_TOLERANCE})`,
      });
    }
    return errors;
  }

  // String comparison (exact, case-insensitive for UUIDs)
  if (typeof expected === 'string' && typeof actual === 'string') {
    // Check if it looks like a UUID (for case-insensitive comparison)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(expected) && uuidRegex.test(actual)) {
      if (expected.toLowerCase() !== actual.toLowerCase()) {
        errors.push({
          path,
          expected,
          actual,
          message: `UUID mismatch: expected "${expected}", got "${actual}"`,
        });
      }
    } else if (expected !== actual) {
      errors.push({
        path,
        expected,
        actual,
        message: `String mismatch: expected "${expected}", got "${actual}"`,
      });
    }
    return errors;
  }

  // Boolean comparison
  if (typeof expected === 'boolean' && typeof actual === 'boolean') {
    if (expected !== actual) {
      errors.push({
        path,
        expected,
        actual,
        message: `Boolean mismatch: expected ${expected}, got ${actual}`,
      });
    }
    return errors;
  }

  // Array comparison (order matters)
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push({
        path,
        expected: 'array',
        actual: typeof actual,
        message: `Expected array, got ${typeof actual}`,
      });
      return errors;
    }

    if (expected.length !== actual.length) {
      errors.push({
        path,
        expected: expected.length,
        actual: actual.length,
        message: `Array length mismatch: expected ${expected.length}, got ${actual.length}`,
      });
    }

    const minLen = Math.min(expected.length, actual.length);
    for (let i = 0; i < minLen; i++) {
      errors.push(...compareSituations(expected[i], actual[i], `${path}[${i}]`));
    }

    return errors;
  }

  // Object comparison
  if (typeof expected === 'object' && typeof actual === 'object') {
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;

    // Check for missing keys in actual
    for (const key of Object.keys(expectedObj)) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in actualObj)) {
        errors.push({
          path: childPath,
          expected: expectedObj[key],
          actual: undefined,
          message: `Missing field "${key}"`,
        });
      } else {
        errors.push(...compareSituations(expectedObj[key], actualObj[key], childPath));
      }
    }

    return errors;
  }

  // Type mismatch
  if (typeof expected !== typeof actual) {
    errors.push({
      path,
      expected,
      actual,
      message: `Type mismatch: expected ${typeof expected}, got ${typeof actual}`,
    });
  } else if (expected !== actual) {
    errors.push({
      path,
      expected,
      actual,
      message: `Value mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    });
  }

  return errors;
}
