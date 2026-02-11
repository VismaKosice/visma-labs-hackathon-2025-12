using PensionCalculationEngine.Models;

namespace PensionCalculationEngine.Services.Mutations;

public class ApplyIndexationHandler : BaseMutationHandler
{
    public override string MutationName => "apply_indexation";
    
    public override Task<(bool HasCriticalError, SimplifiedSituation UpdatedSituation)> ValidateAndApplyAsync(
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
            return Task.FromResult((true, currentSituation));
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
            return Task.FromResult((true, currentSituation));
        }
        
        // Extract properties
        var percentage = GetDecimalValue(mutation.MutationProperties, "percentage");
        var schemeId = GetStringValueOrNull(mutation.MutationProperties, "scheme_id");
        var effectiveBefore = GetDateValueOrNull(mutation.MutationProperties, "effective_before");
        
        // Filter policies by criteria
        var matchingPolicies = currentSituation.Dossier.Policies.AsEnumerable();
        var filtersApplied = false;
        
        if (!string.IsNullOrEmpty(schemeId))
        {
            matchingPolicies = matchingPolicies.Where(p => p.SchemeId == schemeId);
            filtersApplied = true;
        }
        
        if (effectiveBefore.HasValue)
        {
            matchingPolicies = matchingPolicies.Where(p => p.EmploymentStartDate < effectiveBefore.Value);
            filtersApplied = true;
        }
        
        var matchingPoliciesList = matchingPolicies.ToList();
        
        // Check if filters were provided but no policies match
        if (filtersApplied && matchingPoliciesList.Count == 0)
        {
            messages.Add(new CalculationMessage
            {
                Level = "WARNING",
                Code = "NO_MATCHING_POLICIES",
                Message = "Filters were provided but no policies match the criteria"
            });
            // Continue processing - this is just a warning
        }
        
        // Apply indexation to matching policies
        var matchingPolicyIds = new HashSet<string>(matchingPoliciesList.Select(p => p.PolicyId));
        var updatedPolicies = new List<Policy>();
        var hasNegativeSalary = false;
        
        foreach (var policy in currentSituation.Dossier.Policies)
        {
            if (matchingPolicyIds.Contains(policy.PolicyId))
            {
                // Apply percentage: new_salary = salary * (1 + percentage)
                var newSalary = policy.Salary * (1 + percentage);
                
                // Clamp to 0 if negative
                if (newSalary < 0)
                {
                    newSalary = 0;
                    hasNegativeSalary = true;
                }
                
                updatedPolicies.Add(new Policy
                {
                    PolicyId = policy.PolicyId,
                    SchemeId = policy.SchemeId,
                    EmploymentStartDate = policy.EmploymentStartDate,
                    Salary = newSalary,
                    PartTimeFactor = policy.PartTimeFactor,
                    AttainablePension = policy.AttainablePension,
                    Projections = policy.Projections
                });
            }
            else
            {
                // Keep policy unchanged
                updatedPolicies.Add(policy);
            }
        }
        
        // Add warning if any salary was clamped
        if (hasNegativeSalary)
        {
            messages.Add(new CalculationMessage
            {
                Level = "WARNING",
                Code = "NEGATIVE_SALARY_CLAMPED",
                Message = "After applying the percentage, one or more salaries would be negative. Salary is clamped to 0."
            });
        }
        
        // Create updated dossier with modified policies
        var updatedDossier = new Dossier
        {
            DossierId = currentSituation.Dossier.DossierId,
            Status = currentSituation.Dossier.Status,
            RetirementDate = currentSituation.Dossier.RetirementDate,
            Persons = new List<Person>(currentSituation.Dossier.Persons),
            Policies = updatedPolicies
        };
        
        var updatedSituation = new SimplifiedSituation
        {
            Dossier = updatedDossier
        };
        
        return Task.FromResult((false, updatedSituation));
    }
}
