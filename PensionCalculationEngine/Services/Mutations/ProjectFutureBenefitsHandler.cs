using PensionCalculationEngine.Models;

namespace PensionCalculationEngine.Services.Mutations;

public class ProjectFutureBenefitsHandler : BaseMutationHandler
{
    private readonly SchemeRegistryClient _schemeRegistryClient;
    
    public ProjectFutureBenefitsHandler(SchemeRegistryClient schemeRegistryClient)
    {
        _schemeRegistryClient = schemeRegistryClient;
    }
    
    public override string MutationName => "project_future_benefits";
    
    public override async Task<(bool HasCriticalError, SimplifiedSituation UpdatedSituation)> ValidateAndApplyAsync(
        CalculationMutation mutation,
        SimplifiedSituation currentSituation,
        List<CalculationMessage> messages)
    {
        // Validate dossier exists
        if (currentSituation.Dossier == null)
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "DOSSIER_NOT_FOUND",
                Message = "No dossier in the situation"
            });
            return (true, currentSituation);
        }
        
        // Validate policies exist
        if (currentSituation.Dossier.Policies.Count == 0)
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "NO_POLICIES",
                Message = "Dossier has no policies"
            });
            return (true, currentSituation);
        }
        
        // Extract properties
        var projectionStartDate = GetDateValue(mutation.MutationProperties, "projection_start_date");
        var projectionEndDate = GetDateValue(mutation.MutationProperties, "projection_end_date");
        var projectionIntervalMonths = GetIntValue(mutation.MutationProperties, "projection_interval_months");
        
        // Validate date range
        if (projectionEndDate <= projectionStartDate)
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "INVALID_DATE_RANGE",
                Message = "projection_end_date must be after projection_start_date"
            });
            return (true, currentSituation);
        }
        
        // Check for projection before employment (WARNING)
        var earliestEmploymentStart = currentSituation.Dossier.Policies.Min(p => p.EmploymentStartDate);
        if (projectionStartDate < earliestEmploymentStart)
        {
            messages.Add(new CalculationMessage
            {
                Level = "WARNING",
                Code = "PROJECTION_BEFORE_EMPLOYMENT",
                Message = "projection_start_date is before any policy's employment_start_date"
            });
        }
        
        // Get participant's birth date (needed for age calculation, though we skip eligibility check)
        var participant = currentSituation.Dossier.Persons.FirstOrDefault(p => p.Role == "PARTICIPANT");
        if (participant == null)
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "PARTICIPANT_NOT_FOUND",
                Message = "No participant found in dossier"
            });
            return (true, currentSituation);
        }
        
        // Fetch accrual rates from scheme registry for unique scheme IDs
        var uniqueSchemeIds = currentSituation.Dossier.Policies.Select(p => p.SchemeId).Distinct().ToList();
        var accrualRates = await _schemeRegistryClient.GetAccrualRatesAsync(uniqueSchemeIds);
        
        // Generate projection dates from start to end, stepping by interval_months
        var projectionDates = new List<DateOnly>();
        var currentDate = projectionStartDate;
        while (currentDate <= projectionEndDate)
        {
            projectionDates.Add(currentDate);
            currentDate = currentDate.AddMonths(projectionIntervalMonths);
        }
        
        // For each projection date, calculate projected pension for all policies
        // We need to calculate projections per date, considering all policies together
        var projectionResults = new Dictionary<DateOnly, Dictionary<string, decimal>>();
        
        foreach (var projectionDate in projectionDates)
        {
            // Calculate years of service per policy for this projection date
            var policyCalculations = new List<(Policy Policy, double Years, decimal EffectiveSalary)>();
            var totalYears = 0.0;
            
            foreach (var policy in currentSituation.Dossier.Policies)
            {
                // Check if projection is before employment start
                if (projectionDate < policy.EmploymentStartDate)
                {
                    policyCalculations.Add((policy, 0.0, 0));
                    continue;
                }
                
                // Calculate years of service: max(0, days_between(employment_start_date, projection_date) / 365.25)
                var daysBetween = (projectionDate.ToDateTime(TimeOnly.MinValue) - 
                                  policy.EmploymentStartDate.ToDateTime(TimeOnly.MinValue)).TotalDays;
                var years = Math.Max(0, daysBetween / 365.25);
                
                // Calculate effective salary: salary * part_time_factor
                var effectiveSalary = policy.Salary * policy.PartTimeFactor;
                
                policyCalculations.Add((policy, years, effectiveSalary));
                totalYears += years;
            }
            
            // Calculate weighted average salary: Σ(effective_salary_i * years_i) / Σ(years_i)
            decimal weightedAvgSalary = 0;
            if (totalYears > 0)
            {
                var weightedSum = policyCalculations.Sum(pc => (decimal)pc.Years * pc.EffectiveSalary);
                weightedAvgSalary = weightedSum / (decimal)totalYears;
            }
            
            // Use the first scheme's accrual rate (or default if none found)
            // In practice, all schemes in a dossier typically use the same rate
            var accrualRate = accrualRates.Values.FirstOrDefault();
            if (accrualRate == 0)
            {
                accrualRate = 0.02m; // Fallback to default
            }
            
            // Calculate annual pension: weighted_avg * total_years * accrual_rate
            var annualPension = weightedAvgSalary * (decimal)totalYears * accrualRate;
            
            // Distribute pension per policy: annual_pension * (policy_years / total_years)
            var policyPensions = new Dictionary<string, decimal>();
            foreach (var (policy, years, _) in policyCalculations)
            {
                decimal policyPension = 0;
                if (totalYears > 0)
                {
                    policyPension = annualPension * (decimal)(years / totalYears);
                }
                policyPensions[policy.PolicyId] = policyPension;
            }
            
            projectionResults[projectionDate] = policyPensions;
        }
        
        // Create updated policies with projections
        var updatedPolicies = new List<Policy>();
        
        foreach (var policy in currentSituation.Dossier.Policies)
        {
            var projections = new List<Projection>();
            
            // Add projections for this policy
            foreach (var projectionDate in projectionDates)
            {
                var policyPension = projectionResults[projectionDate].GetValueOrDefault(policy.PolicyId, 0);
                projections.Add(new Projection
                {
                    Date = projectionDate,
                    ProjectedPension = policyPension
                });
            }
            
            // Create updated policy with projections
            updatedPolicies.Add(new Policy
            {
                PolicyId = policy.PolicyId,
                SchemeId = policy.SchemeId,
                EmploymentStartDate = policy.EmploymentStartDate,
                Salary = policy.Salary,
                PartTimeFactor = policy.PartTimeFactor,
                AttainablePension = policy.AttainablePension, // Keep existing attainable_pension
                Projections = projections
            });
        }
        
        // Create updated dossier with ACTIVE status (don't change status)
        var updatedDossier = new Dossier
        {
            DossierId = currentSituation.Dossier.DossierId,
            Status = currentSituation.Dossier.Status, // Keep existing status (should be ACTIVE)
            RetirementDate = currentSituation.Dossier.RetirementDate, // Keep existing retirement_date
            Persons = new List<Person>(currentSituation.Dossier.Persons),
            Policies = updatedPolicies
        };
        
        var updatedSituation = new SimplifiedSituation
        {
            Dossier = updatedDossier
        };
        
        return (false, updatedSituation);
    }
}
