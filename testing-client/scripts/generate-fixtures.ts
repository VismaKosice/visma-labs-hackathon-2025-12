/**
 * Script to generate test fixture files with computed expected values.
 * Run with: npx ts-node scripts/generate-fixtures.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// --- Pension Math (copied here to avoid import path issues) ---

function daysBetween(d1: string, d2: string): number {
  const date1 = new Date(d1 + 'T00:00:00Z');
  const date2 = new Date(d2 + 'T00:00:00Z');
  return (date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
}

function yearsOfService(startDate: string, endDate: string): number {
  return daysBetween(startDate, endDate) / 365.25;
}

function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const newDate = new Date(Date.UTC(
    year + Math.floor(month / 12),
    ((month % 12) + 12) % 12,
    day
  ));
  if (newDate.getUTCDate() !== day) {
    newDate.setUTCDate(0);
  }
  return newDate.toISOString().split('T')[0];
}

// --- Fixture Definitions ---

interface Policy {
  policy_id: string;
  scheme_id: string;
  employment_start_date: string;
  salary: number;
  part_time_factor: number;
  attainable_pension: number | null;
  projections: { date: string; projected_pension: number }[] | null;
}

const DOSSIER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '660e8400-e29b-41d4-a716-446655440001';

function makePolicy(seq: number, scheme_id: string, start: string, salary: number, ptf: number): Policy {
  return {
    policy_id: `${DOSSIER_ID}-${seq}`,
    scheme_id,
    employment_start_date: start,
    salary,
    part_time_factor: ptf,
    attainable_pension: null,
    projections: null,
  };
}

function computeRetirement(policies: Policy[], retirementDate: string, accrualRate = 0.02) {
  const data = policies.map(p => ({
    p,
    years: Math.max(0, yearsOfService(p.employment_start_date, retirementDate)),
    eff: p.salary * p.part_time_factor,
  }));
  const totalYears = data.reduce((s, d) => s + d.years, 0);
  const numerator = data.reduce((s, d) => s + d.eff * d.years, 0);
  const annualPension = numerator * accrualRate;
  return data.map(d => ({
    policy: d.p,
    pension: annualPension * (d.years / totalYears),
    years: d.years,
  }));
}

// --- Generate Fixtures ---

function generateC01() {
  return {
    id: 'C01',
    name: 'create_dossier only',
    description: 'Single dossier creation with one participant. Validates dossier fields, person fields, status=ACTIVE, empty policies.',
    points: 4,
    category: 'correctness',
    complexity: 'simple',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'ACTIVE',
          retirement_date: null,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          ],
          policies: [],
        },
      },
      end_situation_mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      end_situation_mutation_index: 0,
      end_situation_actual_at: '2020-01-01',
      mutations_processed_count: 1,
    },
  };
}

function generateC02() {
  return {
    id: 'C02',
    name: 'create_dossier + add_policy (single)',
    description: 'One policy added. Validates policy_id format ({dossier_id}-1), all policy fields.',
    points: 4,
    category: 'correctness',
    complexity: 'simple',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2000-01-01',
              salary: 50000,
              part_time_factor: 1.0,
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'ACTIVE',
          retirement_date: null,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          ],
          policies: [
            makePolicy(1, 'SCHEME-A', '2000-01-01', 50000, 1.0),
          ],
        },
      },
      end_situation_mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      end_situation_mutation_index: 1,
      end_situation_actual_at: '2020-01-01',
      mutations_processed_count: 2,
    },
  };
}

function generateC03() {
  return {
    id: 'C03',
    name: 'create_dossier + add_policy (multiple)',
    description: '3 policies added. Validates sequential policy_id generation (-1, -2, -3).',
    points: 4,
    category: 'correctness',
    complexity: 'simple',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2000-01-01',
              salary: 50000,
              part_time_factor: 1.0,
            },
          },
          {
            mutation_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-B',
              employment_start_date: '2010-01-01',
              salary: 60000,
              part_time_factor: 0.8,
            },
          },
          {
            mutation_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-C',
              employment_start_date: '2015-07-01',
              salary: 70000,
              part_time_factor: 0.5,
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'ACTIVE',
          retirement_date: null,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          ],
          policies: [
            makePolicy(1, 'SCHEME-A', '2000-01-01', 50000, 1.0),
            makePolicy(2, 'SCHEME-B', '2010-01-01', 60000, 0.8),
            makePolicy(3, 'SCHEME-C', '2015-07-01', 70000, 0.5),
          ],
        },
      },
      end_situation_mutation_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      end_situation_mutation_index: 3,
      end_situation_actual_at: '2020-01-01',
      mutations_processed_count: 4,
    },
  };
}

function generateC04() {
  // create_dossier + 2 add_policy + apply_indexation (no filters, 3%)
  const sal1 = 50000 * 1.03; // 51500
  const sal2 = 60000 * 1.03; // 61800

  return {
    id: 'C04',
    name: 'apply_indexation (no filters)',
    description: 'Apply 3% indexation to all policies. Validates all salaries updated correctly.',
    points: 4,
    category: 'correctness',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2000-01-01',
              salary: 50000,
              part_time_factor: 1.0,
            },
          },
          {
            mutation_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-B',
              employment_start_date: '2010-01-01',
              salary: 60000,
              part_time_factor: 0.8,
            },
          },
          {
            mutation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            mutation_definition_name: 'apply_indexation',
            mutation_type: 'DOSSIER',
            actual_at: '2021-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              percentage: 0.03,
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'ACTIVE',
          retirement_date: null,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          ],
          policies: [
            makePolicy(1, 'SCHEME-A', '2000-01-01', sal1, 1.0),
            makePolicy(2, 'SCHEME-B', '2010-01-01', sal2, 0.8),
          ],
        },
      },
      end_situation_mutation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      end_situation_mutation_index: 3,
      end_situation_actual_at: '2021-01-01',
      mutations_processed_count: 4,
    },
  };
}

function generateC05() {
  // apply_indexation with scheme_id filter
  // Only SCHEME-A gets the 5% raise
  const sal1 = 50000 * 1.05; // 52500
  const sal2 = 60000; // unchanged

  return {
    id: 'C05',
    name: 'apply_indexation with scheme_id filter',
    description: 'Apply 5% indexation only to policies with scheme_id=SCHEME-A. Validate only matching policies updated.',
    points: 3,
    category: 'correctness',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2000-01-01',
              salary: 50000,
              part_time_factor: 1.0,
            },
          },
          {
            mutation_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-B',
              employment_start_date: '2010-01-01',
              salary: 60000,
              part_time_factor: 0.8,
            },
          },
          {
            mutation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            mutation_definition_name: 'apply_indexation',
            mutation_type: 'DOSSIER',
            actual_at: '2021-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              percentage: 0.05,
              scheme_id: 'SCHEME-A',
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'ACTIVE',
          retirement_date: null,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          ],
          policies: [
            makePolicy(1, 'SCHEME-A', '2000-01-01', sal1, 1.0),
            makePolicy(2, 'SCHEME-B', '2010-01-01', sal2, 0.8),
          ],
        },
      },
      end_situation_mutation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      end_situation_mutation_index: 3,
      end_situation_actual_at: '2021-01-01',
      mutations_processed_count: 4,
    },
  };
}

function generateC06() {
  // apply_indexation with effective_before filter
  // Only policies with employment_start_date before 2010-01-01 get the raise
  const sal1 = 50000 * 1.04; // 52000 (started 2000, before 2010)
  const sal2 = 60000; // unchanged (started 2015, not before 2010)

  return {
    id: 'C06',
    name: 'apply_indexation with effective_before filter',
    description: 'Apply 4% indexation only to policies with employment_start_date before 2010-01-01.',
    points: 3,
    category: 'correctness',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2000-01-01',
              salary: 50000,
              part_time_factor: 1.0,
            },
          },
          {
            mutation_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-B',
              employment_start_date: '2015-01-01',
              salary: 60000,
              part_time_factor: 0.8,
            },
          },
          {
            mutation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            mutation_definition_name: 'apply_indexation',
            mutation_type: 'DOSSIER',
            actual_at: '2021-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              percentage: 0.04,
              effective_before: '2010-01-01',
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'ACTIVE',
          retirement_date: null,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'John Doe',
              birth_date: '1960-06-15',
            },
          ],
          policies: [
            makePolicy(1, 'SCHEME-A', '2000-01-01', sal1, 1.0),
            makePolicy(2, 'SCHEME-B', '2015-01-01', sal2, 0.8),
          ],
        },
      },
      end_situation_mutation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      end_situation_mutation_index: 3,
      end_situation_actual_at: '2021-01-01',
      mutations_processed_count: 4,
    },
  };
}

function generateC07() {
  // Full happy path: create + policies + indexation + retirement
  // Person born 1955-06-15 → age ~69.5 at retirement 2025-01-01 → eligible by age (>= 65)
  const retirementDate = '2025-01-01';

  // After indexation (3%)
  const sal1 = 50000 * 1.03; // 51500
  const sal2 = 60000 * 1.03; // 61800

  const policies: Policy[] = [
    makePolicy(1, 'SCHEME-A', '2000-01-01', sal1, 1.0),
    makePolicy(2, 'SCHEME-B', '2010-01-01', sal2, 0.8),
  ];

  const result = computeRetirement(policies, retirementDate);
  policies[0].attainable_pension = result[0].pension;
  policies[1].attainable_pension = result[1].pension;

  console.log(`C07 retirement calculation:`);
  console.log(`  Policy 1 years: ${result[0].years}`);
  console.log(`  Policy 2 years: ${result[1].years}`);
  console.log(`  Policy 1 pension: ${result[0].pension}`);
  console.log(`  Policy 2 pension: ${result[1].pension}`);
  console.log(`  Total pension: ${result[0].pension + result[1].pension}`);

  return {
    id: 'C07',
    name: 'Full happy path',
    description: 'create_dossier + 2 add_policy + apply_indexation + calculate_retirement_benefit. Validates entire end_situation including attainable_pension.',
    points: 6,
    category: 'correctness',
    complexity: 'complex',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'Jane Smith',
              birth_date: '1955-06-15',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2000-01-01',
              salary: 50000,
              part_time_factor: 1.0,
            },
          },
          {
            mutation_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-B',
              employment_start_date: '2010-01-01',
              salary: 60000,
              part_time_factor: 0.8,
            },
          },
          {
            mutation_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            mutation_definition_name: 'apply_indexation',
            mutation_type: 'DOSSIER',
            actual_at: '2021-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              percentage: 0.03,
            },
          },
          {
            mutation_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            mutation_definition_name: 'calculate_retirement_benefit',
            mutation_type: 'DOSSIER',
            actual_at: '2025-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              retirement_date: retirementDate,
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'RETIRED',
          retirement_date: retirementDate,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'Jane Smith',
              birth_date: '1955-06-15',
            },
          ],
          policies,
        },
      },
      end_situation_mutation_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      end_situation_mutation_index: 4,
      end_situation_actual_at: '2025-01-01',
      mutations_processed_count: 5,
    },
  };
}

function generateC08() {
  // Multiple part-time factors + retirement
  // Person born 1958-03-20 → age ~67.3 at retirement 2025-06-01 → eligible by age
  const retirementDate = '2025-06-01';

  const policies: Policy[] = [
    makePolicy(1, 'SCHEME-A', '1990-01-01', 45000, 1.0),
    makePolicy(2, 'SCHEME-B', '2005-06-15', 55000, 0.6),
    makePolicy(3, 'SCHEME-C', '2010-09-01', 70000, 0.5),
  ];

  const result = computeRetirement(policies, retirementDate);
  policies[0].attainable_pension = result[0].pension;
  policies[1].attainable_pension = result[1].pension;
  policies[2].attainable_pension = result[2].pension;

  console.log(`C08 retirement calculation:`);
  for (let i = 0; i < result.length; i++) {
    console.log(`  Policy ${i + 1} years: ${result[i].years}, pension: ${result[i].pension}`);
  }
  console.log(`  Total pension: ${result.reduce((s, r) => s + r.pension, 0)}`);

  return {
    id: 'C08',
    name: 'Multiple part-time factors + retirement',
    description: 'Multiple policies with different part_time_factors. Validates weighted average calculation and proportional distribution.',
    points: 6,
    category: 'correctness',
    complexity: 'complex',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'Bob Johnson',
              birth_date: '1958-03-20',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '1990-01-01',
              salary: 45000,
              part_time_factor: 1.0,
            },
          },
          {
            mutation_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-B',
              employment_start_date: '2005-06-15',
              salary: 55000,
              part_time_factor: 0.6,
            },
          },
          {
            mutation_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-C',
              employment_start_date: '2010-09-01',
              salary: 70000,
              part_time_factor: 0.5,
            },
          },
          {
            mutation_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            mutation_definition_name: 'calculate_retirement_benefit',
            mutation_type: 'DOSSIER',
            actual_at: '2025-06-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              retirement_date: retirementDate,
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'RETIRED',
          retirement_date: retirementDate,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'Bob Johnson',
              birth_date: '1958-03-20',
            },
          ],
          policies,
        },
      },
      end_situation_mutation_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      end_situation_mutation_index: 4,
      end_situation_actual_at: '2025-06-01',
      mutations_processed_count: 5,
    },
  };
}

function generateC09() {
  // Error: retirement without eligibility
  // Person born 1990-01-01, retirement 2025-01-01 → age 35, too young
  // Policy started 2020-01-01, 5 years of service → too few
  // NOT_ELIGIBLE: age < 65 AND years < 40

  return {
    id: 'C09',
    name: 'Error: retirement without eligibility',
    description: 'Participant under 65 with less than 40 years of service. Validates CRITICAL NOT_ELIGIBLE, FAILURE outcome, processing halted.',
    points: 3,
    category: 'correctness',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'Young Worker',
              birth_date: '1990-01-01',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2020-01-01',
              salary: 40000,
              part_time_factor: 1.0,
            },
          },
          {
            mutation_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            mutation_definition_name: 'calculate_retirement_benefit',
            mutation_type: 'DOSSIER',
            actual_at: '2025-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              retirement_date: '2025-01-01',
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'FAILURE',
      message_count: 1,
      messages: [
        { level: 'CRITICAL', code: 'NOT_ELIGIBLE' },
      ],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'ACTIVE',
          retirement_date: null,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'Young Worker',
              birth_date: '1990-01-01',
            },
          ],
          policies: [
            makePolicy(1, 'SCHEME-A', '2020-01-01', 40000, 1.0),
          ],
        },
      },
      // CRITICAL on mutation index 2 (calculate_retirement_benefit), which fails.
      // end_situation reflects state BEFORE the failing mutation (after add_policy).
      // mutation_id and mutation_index refer to last SUCCESSFULLY applied mutation.
      end_situation_mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      end_situation_mutation_index: 1,
      end_situation_actual_at: '2020-01-01',
      mutations_processed_count: 3, // All 3 are included (up to and including the failing one)
    },
  };
}

function generateC10() {
  // Error: mutation without dossier
  // add_policy sent without prior create_dossier
  return {
    id: 'C10',
    name: 'Error: mutation without dossier',
    description: 'add_policy without prior create_dossier. Validates CRITICAL DOSSIER_NOT_FOUND, FAILURE outcome.',
    points: 3,
    category: 'correctness',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2000-01-01',
              salary: 50000,
              part_time_factor: 1.0,
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'FAILURE',
      message_count: 1,
      messages: [
        { level: 'CRITICAL', code: 'DOSSIER_NOT_FOUND' },
      ],
      end_situation: {
        dossier: null,
      },
      // First mutation fails, so mutation_id = first mutation, index = 0
      end_situation_mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      end_situation_mutation_index: 0,
      end_situation_actual_at: '2020-01-01',
      mutations_processed_count: 1,
    },
  };
}

function generateB01() {
  // project_future_benefits: yearly projections for 10 years (PRD requirement)
  const projectionStart = '2025-01-01';
  const projectionEnd = '2035-01-01';
  const intervalMonths = 12;

  // Policies
  const policies: Policy[] = [
    makePolicy(1, 'SCHEME-A', '2000-01-01', 50000, 1.0),
    makePolicy(2, 'SCHEME-B', '2010-01-01', 60000, 0.8),
  ];

  // Generate projection dates
  const dates: string[] = [];
  let current = projectionStart;
  while (current <= projectionEnd) {
    dates.push(current);
    current = addMonths(current, intervalMonths);
  }

  console.log(`B01 projection dates: ${dates.join(', ')}`);

  // For each date, compute projections per policy
  const proj1: { date: string; projected_pension: number }[] = [];
  const proj2: { date: string; projected_pension: number }[] = [];

  for (const date of dates) {
    const result = computeRetirement(policies, date);
    proj1.push({ date, projected_pension: result[0].pension });
    proj2.push({ date, projected_pension: result[1].pension });

    console.log(`  ${date}: P1=${result[0].pension.toFixed(4)}, P2=${result[1].pension.toFixed(4)}`);
  }

  const policiesWithProjections = [
    { ...policies[0], projections: proj1 },
    { ...policies[1], projections: proj2 },
  ];

  return {
    id: 'B01',
    name: 'project_future_benefits',
    description: 'Yearly projections over 10 years. Validates projections array, counts, and calculated values. Status remains ACTIVE.',
    points: 5,
    category: 'bonus',
    request: {
      tenant_id: 'test_tenant',
      calculation_instructions: {
        mutations: [
          {
            mutation_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            mutation_definition_name: 'create_dossier',
            mutation_type: 'DOSSIER_CREATION',
            actual_at: '2020-01-01',
            mutation_properties: {
              dossier_id: DOSSIER_ID,
              person_id: PERSON_ID,
              name: 'Jane Smith',
              birth_date: '1960-06-15',
            },
          },
          {
            mutation_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-A',
              employment_start_date: '2000-01-01',
              salary: 50000,
              part_time_factor: 1.0,
            },
          },
          {
            mutation_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            mutation_definition_name: 'add_policy',
            mutation_type: 'DOSSIER',
            actual_at: '2020-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              scheme_id: 'SCHEME-B',
              employment_start_date: '2010-01-01',
              salary: 60000,
              part_time_factor: 0.8,
            },
          },
          {
            mutation_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            mutation_definition_name: 'project_future_benefits',
            mutation_type: 'DOSSIER',
            actual_at: '2024-01-01',
            dossier_id: DOSSIER_ID,
            mutation_properties: {
              projection_start_date: projectionStart,
              projection_end_date: projectionEnd,
              projection_interval_months: intervalMonths,
            },
          },
        ],
      },
    },
    expected: {
      http_status: 200,
      calculation_outcome: 'SUCCESS',
      message_count: 0,
      messages: [],
      end_situation: {
        dossier: {
          dossier_id: DOSSIER_ID,
          status: 'ACTIVE',
          retirement_date: null,
          persons: [
            {
              person_id: PERSON_ID,
              role: 'PARTICIPANT',
              name: 'Jane Smith',
              birth_date: '1960-06-15',
            },
          ],
          policies: policiesWithProjections,
        },
      },
      end_situation_mutation_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      end_situation_mutation_index: 3,
      end_situation_actual_at: '2024-01-01',
      mutations_processed_count: 4,
    },
  };
}

// --- Main ---

const fixturesDir = path.join(__dirname, '..', 'fixtures');
fs.mkdirSync(fixturesDir, { recursive: true });

const generators = [
  generateC01,
  generateC02,
  generateC03,
  generateC04,
  generateC05,
  generateC06,
  generateC07,
  generateC08,
  generateC09,
  generateC10,
  generateB01,
];

const fileNames: Record<string, string> = {
  C01: 'C01-create-dossier.json',
  C02: 'C02-add-single-policy.json',
  C03: 'C03-add-multiple-policies.json',
  C04: 'C04-apply-indexation.json',
  C05: 'C05-indexation-scheme-filter.json',
  C06: 'C06-indexation-date-filter.json',
  C07: 'C07-full-happy-path.json',
  C08: 'C08-part-time-retirement.json',
  C09: 'C09-error-ineligible-retirement.json',
  C10: 'C10-error-no-dossier.json',
  B01: 'B01-project-future-benefits.json',
};

for (const gen of generators) {
  const fixture = gen();
  const fileName = fileNames[fixture.id];
  const filePath = path.join(fixturesDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Generated ${fileName}`);
}

console.log('\nAll fixtures generated successfully!');
