/**
 * Reference implementation of pension calculation math.
 * Used to compute expected values for test fixtures.
 */

/**
 * Calculate the number of days between two date strings (YYYY-MM-DD).
 */
export function daysBetween(d1: string, d2: string): number {
  const date1 = new Date(d1 + 'T00:00:00Z');
  const date2 = new Date(d2 + 'T00:00:00Z');
  return (date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Calculate years of service using the formula: days / 365.25
 */
export function yearsOfService(startDate: string, endDate: string): number {
  return daysBetween(startDate, endDate) / 365.25;
}

/**
 * Calculate age in years at a given date.
 */
export function ageAtDate(birthDate: string, atDate: string): number {
  return daysBetween(birthDate, atDate) / 365.25;
}

/**
 * Check retirement eligibility: age >= 65 OR total years of service >= 40
 */
export function isEligible(birthDate: string, retirementDate: string, totalYears: number): boolean {
  const age = ageAtDate(birthDate, retirementDate);
  return age >= 65 || totalYears >= 40;
}

export interface PolicyForCalc {
  policy_id: string;
  scheme_id: string;
  employment_start_date: string;
  salary: number;
  part_time_factor: number;
}

export interface RetirementResult {
  annual_pension: number;
  policy_pensions: Map<string, number>;
  total_years: number;
  weighted_avg_salary: number;
}

/**
 * Calculate retirement benefits for the given policies and retirement date.
 */
export function calculateRetirementBenefit(
  policies: PolicyForCalc[],
  retirementDate: string,
  accrualRate: number = 0.02
): RetirementResult {
  // Calculate years of service per policy (clamped to 0 if retirement is before employment)
  const policyYears = policies.map(p => ({
    policy: p,
    years: Math.max(0, yearsOfService(p.employment_start_date, retirementDate)),
    effective_salary: p.salary * p.part_time_factor,
  }));

  const totalYears = policyYears.reduce((sum, py) => sum + py.years, 0);

  // Weighted average salary
  const numerator = policyYears.reduce(
    (sum, py) => sum + py.effective_salary * py.years, 0
  );
  const weightedAvgSalary = totalYears > 0 ? numerator / totalYears : 0;

  // Annual pension
  const annualPension = weightedAvgSalary * totalYears * accrualRate;

  // Distribution per policy (proportional by years of service)
  const policyPensions = new Map<string, number>();
  for (const py of policyYears) {
    const share = totalYears > 0 ? py.years / totalYears : 0;
    policyPensions.set(py.policy.policy_id, annualPension * share);
  }

  return {
    annual_pension: annualPension,
    policy_pensions: policyPensions,
    total_years: totalYears,
    weighted_avg_salary: weightedAvgSalary,
  };
}

/**
 * Apply indexation to a salary.
 */
export function applyIndexation(salary: number, percentage: number): number {
  const newSalary = salary * (1 + percentage);
  return Math.max(0, newSalary);
}

/**
 * Add months to a date string, returning YYYY-MM-DD.
 */
export function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();

  const newDate = new Date(Date.UTC(
    year + Math.floor(month / 12),
    ((month % 12) + 12) % 12,
    day
  ));

  // Handle month overflow (e.g., Jan 31 + 1 month = Feb 28)
  if (newDate.getUTCDate() !== day) {
    newDate.setUTCDate(0); // Go to last day of previous month
  }

  return newDate.toISOString().split('T')[0];
}

/**
 * Generate projection dates from start to end (inclusive), stepping by intervalMonths.
 */
export function generateProjectionDates(
  startDate: string,
  endDate: string,
  intervalMonths: number
): string[] {
  const dates: string[] = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);
    current = addMonths(current, intervalMonths);
  }

  return dates;
}
