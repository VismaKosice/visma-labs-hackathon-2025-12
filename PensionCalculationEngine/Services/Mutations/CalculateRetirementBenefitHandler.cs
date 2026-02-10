using PensionCalculationEngine.Models;

namespace PensionCalculationEngine.Services.Mutations;

public class CalculateRetirementBenefitHandler : BaseMutationHandler
{
    private readonly SchemeRegistryClient _schemeRegistryClient;
    
    public CalculateRetirementBenefitHandler(SchemeRegistryClient schemeRegistryClient)
    {
        _schemeRegistryClient = schemeRegistryClient;
    }
    
    public override string MutationName => "calculate_retirement_benefit";
    
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
        var retirementDate = GetDateValue(mutation.MutationProperties, "retirement_date");
        
        // Get participant's birth date
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
        
        var birthDate = participant.BirthDate;
        
        // Calculate age at retirement
        var ageAtRetirement = (retirementDate.Year - birthDate.Year) - 
                              (retirementDate.DayOfYear < birthDate.DayOfYear ? 1 : 0);
        
        // Calculate years of service per policy
        var policyCalculations = new List<(Policy Policy, double Years, decimal EffectiveSalary)>();
        var totalYears = 0.0;
        
        foreach (var policy in currentSituation.Dossier.Policies)
        {
            // Check if retirement is before employment start
            if (retirementDate < policy.EmploymentStartDate)
            {
                messages.Add(new CalculationMessage
                {
                    Level = "WARNING",
                    Code = "RETIREMENT_BEFORE_EMPLOYMENT",
                    Message = $"retirement_date is before policy's employment_start_date"
                });
                policyCalculations.Add((policy, 0.0, 0));
                continue;
            }
            
            // Calculate years of service: max(0, days_between(employment_start_date, retirement_date) / 365.25)
            var daysBetween = (retirementDate.ToDateTime(TimeOnly.MinValue) - 
                              policy.EmploymentStartDate.ToDateTime(TimeOnly.MinValue)).TotalDays;
            var years = Math.Max(0, daysBetween / 365.25);
            
            // Calculate effective salary: salary * part_time_factor
            var effectiveSalary = policy.Salary * policy.PartTimeFactor;
            
            policyCalculations.Add((policy, years, effectiveSalary));
            totalYears += years;
        }
        
        // Validate eligibility: age >= 65 OR total years >= 40
        if (ageAtRetirement < 65 && totalYears < 40)
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "NOT_ELIGIBLE",
                Message = "Participant is under 65 years old on retirement_date AND total years of service < 40"
            });
            return (true, currentSituation);
        }
        
        // Calculate weighted average salary: Σ(effective_salary_i * years_i) / Σ(years_i)
        decimal weightedAvgSalary = 0;
        if (totalYears > 0)
        {
            var weightedSum = policyCalculations.Sum(pc => (decimal)pc.Years * pc.EffectiveSalary);
            weightedAvgSalary = weightedSum / (decimal)totalYears;
        }
        
        // Fetch accrual rates from scheme registry for unique scheme IDs
        var uniqueSchemeIds = currentSituation.Dossier.Policies.Select(p => p.SchemeId).Distinct().ToList();
        var accrualRates = await _schemeRegistryClient.GetAccrualRatesAsync(uniqueSchemeIds);
        
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
        var updatedPolicies = new List<Policy>();
        foreach (var (policy, years, _) in policyCalculations)
        {
            decimal policyPension = 0;
            if (totalYears > 0)
            {
                policyPension = annualPension * (decimal)(years / totalYears);
            }
            
            updatedPolicies.Add(new Policy
            {
                PolicyId = policy.PolicyId,
                SchemeId = policy.SchemeId,
                EmploymentStartDate = policy.EmploymentStartDate,
                Salary = policy.Salary,
                PartTimeFactor = policy.PartTimeFactor,
                AttainablePension = policyPension,
                Projections = policy.Projections
            });
        }
        
        // Create updated dossier with RETIRED status
        var updatedDossier = new Dossier
        {
            DossierId = currentSituation.Dossier.DossierId,
            Status = "RETIRED",
            RetirementDate = retirementDate,
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
