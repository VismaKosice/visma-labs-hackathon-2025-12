/**
 * Types for test results and scoring.
 */

export interface TestResults {
  team: string;
  target: string;
  timestamp: string;
  environment: EnvironmentSnapshot;
  correctness: CorrectnessResults;
  performance: PerformanceResults;
  bonus: BonusResults;
  code_quality: CodeQualityResults;
  total: TotalScore;
}

/**
 * Snapshot of the host environment at test time.
 * Recorded so results from different runs / machines can be compared
 * and anomalies (high CPU, low memory) can be flagged.
 */
export interface EnvironmentSnapshot {
  os: string;
  arch: string;
  cpus: number;
  cpu_model: string;
  total_memory_mb: number;
  free_memory_mb: number;
  load_avg_1m: number;
  load_avg_5m: number;
  load_avg_15m: number;
  node_version: string;
}

export interface CorrectnessResults {
  total: number;
  max: number;
  scenarios: ScenarioResult[];
}

export interface ScenarioResult {
  id: string;
  name: string;
  passed: boolean;
  points: number;
  max_points: number;
  errors: string[];
  response_time_ms?: number;
}

export interface PerformanceResults {
  simple_latency: LatencyStats | null;
  complex_latency: LatencyStats | null;
  throughput: ThroughputStats | null;
  concurrency: ConcurrencyStats | null;
  relative_scores: RelativePerformanceScores | null;
}

export interface LatencyStats {
  mean_ms: number;
  median_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  sample_count: number;
}

export interface ThroughputStats {
  requests_per_second: number;
  duration_seconds: number;
  total_requests: number;
  error_count: number;
  error_rate: number;
}

export interface ConcurrencyStats {
  concurrency_level: number;
  mean_ms: number;
  p99_ms: number;
  error_count: number;
}

export interface RelativePerformanceScores {
  simple_latency_score: number;
  complex_latency_score: number;
  throughput_score: number;
  concurrency_score: number;
  total: number;
}

export interface BonusResults {
  total: number;
  max: number;
  forward_json_patch: BonusFeatureResult;
  backward_json_patch: BonusFeatureResult;
  clean_architecture: CleanArchitectureResult;
  cold_start: ColdStartResult;
  scheme_registry: BonusFeatureResult;
  project_future_benefits: BonusFeatureResult;
}

export interface BonusFeatureResult {
  passed: boolean;
  points: number;
  errors?: string[];
}

export interface CleanArchitectureResult {
  common_interface: number;
  per_mutation_implementation: number;
  generic_dispatch: number;
  extensibility: number;
  points: number;
  reasoning?: {
    common_interface?: string;
    per_mutation_implementation?: string;
    generic_dispatch?: string;
    extensibility?: string;
  };
}

export interface ColdStartResult {
  time_ms: number | null;
  points: number;
}

export interface CodeQualityResults {
  readability_and_organization: number;
  error_handling: number;
  project_structure: number;
  points: number;
  /** Whether AI review was skipped (e.g., no API key or no --code-path). */
  skipped?: boolean;
  reasoning?: {
    readability_and_organization?: string;
    error_handling?: string;
    project_structure?: string;
  };
  /** AI-generated overall summary with assessment and improvement suggestions. */
  summary?: string;
}

export interface TotalScore {
  scored: number;
  max_scoreable_by_tool: number;
  /** Points that require manual verification (e.g., AI review without API key). */
  manual_pending: number;
}

export interface LeaderboardEntry {
  rank: number;
  team: string;
  correctness: number;
  performance: number;
  bonus: number;
  code_quality: number;
  total: number;
}

/**
 * Full leaderboard JSON file structure written for the leaderboard UI.
 */
export interface LeaderboardJson {
  generated_at: string;
  max_possible: number;
  entries: LeaderboardEntry[];
  team_details: Record<string, TestResults>;
}

/**
 * A single submission record for the submissions history page.
 */
export interface SubmissionRecord {
  team: string;
  commit_sha: string;
  timestamp: string;
  total_score: number;
  correctness: number;
  performance: number;
  bonus: number;
  code_quality: number;
  correctness_passed: number;
  correctness_total: number;
  error?: string;
  details: TestResults;
}

/**
 * Full submissions history JSON file.
 */
export interface SubmissionsJson {
  updated_at: string;
  submissions: SubmissionRecord[];
}
