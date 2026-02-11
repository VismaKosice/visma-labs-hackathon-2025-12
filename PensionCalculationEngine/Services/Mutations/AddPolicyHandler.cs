using PensionCalculationEngine.Models;

namespace PensionCalculationEngine.Services.Mutations;

public class AddPolicyHandler : BaseMutationHandler
{
    public override string MutationName => "add_policy";
    
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
        
        // Extract properties
        var schemeId = GetStringValue(mutation.MutationProperties, "scheme_id");
        var employmentStartDate = GetDateValue(mutation.MutationProperties, "employment_start_date");
        var salary = GetDecimalValue(mutation.MutationProperties, "salary");
        var partTimeFactor = GetDecimalValue(mutation.MutationProperties, "part_time_factor");
        
        // Validate salary
        if (salary < 0)
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "INVALID_SALARY",
                Message = "salary < 0"
            });
            return Task.FromResult((true, currentSituation));
        }
        
        // Validate part_time_factor
        if (partTimeFactor < 0 || partTimeFactor > 1)
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "INVALID_PART_TIME_FACTOR",
                Message = "part_time_factor < 0 or > 1"
            });
            return Task.FromResult((true, currentSituation));
        }
        
        // Check for duplicate policy (same scheme_id AND same employment_start_date)
        var duplicatePolicy = currentSituation.Dossier.Policies
            .FirstOrDefault(p => p.SchemeId == schemeId && 
                                 p.EmploymentStartDate == employmentStartDate);
        
        if (duplicatePolicy != null)
        {
            messages.Add(new CalculationMessage
            {
                Level = "WARNING",
                Code = "DUPLICATE_POLICY",
                Message = "A policy with the same scheme_id AND same employment_start_date already exists"
            });
            // Continue processing - this is just a warning
        }
        
        // Generate policy_id: {dossier_id}-{sequence_number}
        // Sequence number starts at 1 and increments per policy added
        var nextSequenceNumber = currentSituation.Dossier.Policies.Count + 1;
        var policyId = $"{currentSituation.Dossier.DossierId}-{nextSequenceNumber}";
        
        // Create new policy
        var newPolicy = new Policy
        {
            PolicyId = policyId,
            SchemeId = schemeId,
            EmploymentStartDate = employmentStartDate,
            Salary = salary,
            PartTimeFactor = partTimeFactor,
            AttainablePension = null,
            Projections = null
        };
        
        // Create updated dossier with new policy
        var updatedDossier = new Dossier
        {
            DossierId = currentSituation.Dossier.DossierId,
            Status = currentSituation.Dossier.Status,
            RetirementDate = currentSituation.Dossier.RetirementDate,
            Persons = new List<Person>(currentSituation.Dossier.Persons),
            Policies = new List<Policy>(currentSituation.Dossier.Policies) { newPolicy }
        };
        
        var updatedSituation = new SimplifiedSituation
        {
            Dossier = updatedDossier
        };
        
        return Task.FromResult((false, updatedSituation));
    }
}
