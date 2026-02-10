using PensionCalculationEngine.Models;

namespace PensionCalculationEngine.Services.Mutations;

public class CreateDossierHandler : BaseMutationHandler
{
    public override string MutationName => "create_dossier";
    
    public override Task<(bool HasCriticalError, SimplifiedSituation UpdatedSituation)> ValidateAndApplyAsync(
        CalculationMutation mutation,
        SimplifiedSituation currentSituation,
        List<CalculationMessage> messages)
    {
        // Validate dossier doesn't already exist
        if (currentSituation.Dossier != null)
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "DOSSIER_ALREADY_EXISTS",
                Message = "A dossier already exists in the situation"
            });
            return Task.FromResult((true, currentSituation));
        }
        
        // Extract properties
        var dossierId = Guid.Parse(GetStringValue(mutation.MutationProperties, "dossier_id"));
        var personId = Guid.Parse(GetStringValue(mutation.MutationProperties, "person_id"));
        var name = GetStringValue(mutation.MutationProperties, "name");
        var birthDate = GetDateValue(mutation.MutationProperties, "birth_date");
        
        // Validate birth_date
        if (birthDate > DateOnly.FromDateTime(DateTime.UtcNow))
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "INVALID_BIRTH_DATE",
                Message = "birth_date is not a valid date or is in the future"
            });
            return Task.FromResult((true, currentSituation));
        }
        
        // Validate name
        if (string.IsNullOrWhiteSpace(name))
        {
            messages.Add(new CalculationMessage
            {
                Level = "CRITICAL",
                Code = "INVALID_NAME",
                Message = "name is empty or blank"
            });
            return Task.FromResult((true, currentSituation));
        }
        
        // Create dossier
        var newDossier = new Dossier
        {
            DossierId = dossierId,
            Status = "ACTIVE",
            RetirementDate = null,
            Persons = new List<Person>
            {
                new Person
                {
                    PersonId = personId,
                    Role = "PARTICIPANT",
                    Name = name,
                    BirthDate = birthDate
                }
            },
            Policies = new List<Policy>()
        };
        
        var updatedSituation = new SimplifiedSituation
        {
            Dossier = newDossier
        };
        
        return Task.FromResult((false, updatedSituation));
    }
}
