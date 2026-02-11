/**
 * TypeScript types matching the OpenAPI schema for the Pension Calculation Engine API.
 */

// ============ Request Types ============

export interface CalculationRequest {
  tenant_id: string;
  calculation_instructions: CalculationInstructions;
}

export interface CalculationInstructions {
  mutations: CalculationMutation[];
}

export type CalculationMutation =
  | DossierCreationMutation
  | DossierMutation;

export interface BaseMutation {
  mutation_id: string;
  mutation_definition_name: MutationDefinitionName;
  mutation_type: MutationType;
  actual_at: string; // date string YYYY-MM-DD
  mutation_properties: Record<string, unknown>;
  dossier_id?: string;
}

export interface DossierCreationMutation {
  mutation_id: string;
  mutation_definition_name: 'create_dossier';
  mutation_type: 'DOSSIER_CREATION';
  actual_at: string;
  mutation_properties: CreateDossierProperties;
}

export interface DossierMutation {
  mutation_id: string;
  mutation_definition_name: 'add_policy' | 'apply_indexation' | 'calculate_retirement_benefit' | 'project_future_benefits';
  mutation_type: 'DOSSIER';
  actual_at: string;
  dossier_id: string;
  mutation_properties: AddPolicyProperties | ApplyIndexationProperties | CalculateRetirementBenefitProperties | ProjectFutureBenefitsProperties;
}

export type MutationDefinitionName =
  | 'create_dossier'
  | 'add_policy'
  | 'apply_indexation'
  | 'calculate_retirement_benefit'
  | 'project_future_benefits';

export type MutationType = 'DOSSIER_CREATION' | 'DOSSIER';

// ============ Mutation Property Types ============

export interface CreateDossierProperties {
  dossier_id: string;
  person_id: string;
  name: string;
  birth_date: string;
}

export interface AddPolicyProperties {
  scheme_id: string;
  employment_start_date: string;
  salary: number;
  part_time_factor: number;
}

export interface ApplyIndexationProperties {
  percentage: number;
  scheme_id?: string;
  effective_before?: string;
}

export interface CalculateRetirementBenefitProperties {
  retirement_date: string;
}

export interface ProjectFutureBenefitsProperties {
  projection_start_date: string;
  projection_end_date: string;
  projection_interval_months: number;
}

// ============ Response Types ============

export interface CalculationResponse {
  calculation_metadata: CalculationMetadata;
  calculation_result: CalculationResult;
}

export interface CalculationMetadata {
  calculation_id: string;
  tenant_id: string;
  calculation_started_at: string;
  calculation_completed_at: string;
  calculation_duration_ms: number;
  calculation_outcome: 'SUCCESS' | 'FAILURE';
}

export interface CalculationResult {
  messages: CalculationMessage[];
  mutations: ProcessedMutation[];
  end_situation: EndSituation;
  initial_situation: InitialSituation;
}

export interface CalculationMessage {
  id: number;
  level: 'CRITICAL' | 'WARNING';
  code: string;
  message: string;
}

export interface ProcessedMutation {
  mutation: CalculationMutation;
  forward_patch_to_situation_after_this_mutation?: JsonPatchOperation[];
  backward_patch_to_previous_situation?: JsonPatchOperation[];
  calculation_message_indexes?: number[];
}

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

export interface EndSituation {
  mutation_id: string;
  mutation_index: number;
  actual_at: string;
  situation: Situation;
}

export interface InitialSituation {
  actual_at: string;
  situation: Situation;
}

export interface Situation {
  dossier: Dossier | null;
}

export interface Dossier {
  dossier_id: string;
  status: 'ACTIVE' | 'RETIRED';
  retirement_date: string | null;
  persons: Person[];
  policies: Policy[];
}

export interface Person {
  person_id: string;
  role: 'PARTICIPANT';
  name: string;
  birth_date: string;
}

export interface Policy {
  policy_id: string;
  scheme_id: string;
  employment_start_date: string;
  salary: number;
  part_time_factor: number;
  attainable_pension: number | null;
  projections: Projection[] | null;
}

export interface Projection {
  date: string;
  projected_pension: number;
}

export interface ErrorResponse {
  status: number;
  message: string;
}

// ============ Message Codes ============

export const MESSAGE_CODES = {
  DOSSIER_ALREADY_EXISTS: 'DOSSIER_ALREADY_EXISTS',
  INVALID_BIRTH_DATE: 'INVALID_BIRTH_DATE',
  INVALID_NAME: 'INVALID_NAME',
  DOSSIER_NOT_FOUND: 'DOSSIER_NOT_FOUND',
  INVALID_SALARY: 'INVALID_SALARY',
  INVALID_PART_TIME_FACTOR: 'INVALID_PART_TIME_FACTOR',
  DUPLICATE_POLICY: 'DUPLICATE_POLICY',
  NO_POLICIES: 'NO_POLICIES',
  NO_MATCHING_POLICIES: 'NO_MATCHING_POLICIES',
  NEGATIVE_SALARY_CLAMPED: 'NEGATIVE_SALARY_CLAMPED',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  RETIREMENT_BEFORE_EMPLOYMENT: 'RETIREMENT_BEFORE_EMPLOYMENT',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  PROJECTION_BEFORE_EMPLOYMENT: 'PROJECTION_BEFORE_EMPLOYMENT',
} as const;
