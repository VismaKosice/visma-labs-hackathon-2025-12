namespace PensionCalculationEngine.Models;

public class CreateDossierProperties
{
    public Guid DossierId { get; set; }
    public Guid PersonId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateOnly BirthDate { get; set; }
}

public class AddPolicyProperties
{
    public string SchemeId { get; set; } = string.Empty;
    public DateOnly EmploymentStartDate { get; set; }
    public decimal Salary { get; set; }
    public decimal PartTimeFactor { get; set; }
}

public class ApplyIndexationProperties
{
    public decimal Percentage { get; set; }
    public string? SchemeId { get; set; }
    public DateOnly? EffectiveBefore { get; set; }
}

public class CalculateRetirementBenefitProperties
{
    public DateOnly RetirementDate { get; set; }
}

public class ProjectFutureBenefitsProperties
{
    public DateOnly ProjectionStartDate { get; set; }
    public DateOnly ProjectionEndDate { get; set; }
    public int ProjectionIntervalMonths { get; set; }
}
