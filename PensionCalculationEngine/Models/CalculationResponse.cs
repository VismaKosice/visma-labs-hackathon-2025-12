using System.Text.Json.Serialization;

namespace PensionCalculationEngine.Models;

public class CalculationResponse
{
    [JsonPropertyName("calculation_metadata")]
    public CalculationMetadata CalculationMetadata { get; set; } = new();
    
    [JsonPropertyName("calculation_result")]
    public CalculationResult CalculationResult { get; set; } = new();
}

public class CalculationMetadata
{
    [JsonPropertyName("calculation_id")]
    public Guid CalculationId { get; set; }
    
    [JsonPropertyName("tenant_id")]
    public string TenantId { get; set; } = string.Empty;
    
    [JsonPropertyName("calculation_started_at")]
    public DateTime CalculationStartedAt { get; set; }
    
    [JsonPropertyName("calculation_completed_at")]
    public DateTime CalculationCompletedAt { get; set; }
    
    [JsonPropertyName("calculation_duration_ms")]
    public long CalculationDurationMs { get; set; }
    
    [JsonPropertyName("calculation_outcome")]
    public string CalculationOutcome { get; set; } = "SUCCESS";
}

public class CalculationResult
{
    [JsonPropertyName("messages")]
    public List<CalculationMessage> Messages { get; set; } = new();
    
    [JsonPropertyName("mutations")]
    public List<ProcessedMutation> Mutations { get; set; } = new();
    
    [JsonPropertyName("end_situation")]
    public SituationSnapshot EndSituation { get; set; } = new();
    
    [JsonPropertyName("initial_situation")]
    public InitialSituation InitialSituation { get; set; } = new();
}

public class ProcessedMutation
{
    [JsonPropertyName("mutation")]
    public CalculationMutation Mutation { get; set; } = new();
    
    [JsonPropertyName("calculation_message_indexes")]
    public List<int> CalculationMessageIndexes { get; set; } = new();
    
    [JsonPropertyName("forward_patch_to_situation_after_this_mutation")]
    public List<JsonPatchOperation>? ForwardPatchToSituationAfterThisMutation { get; set; }
    
    [JsonPropertyName("backward_patch_to_previous_situation")]
    public List<JsonPatchOperation>? BackwardPatchToPreviousSituation { get; set; }
}

public class JsonPatchOperation
{
    [JsonPropertyName("op")]
    public string Op { get; set; } = string.Empty;
    
    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;
    
    [JsonPropertyName("value")]
    public object? Value { get; set; }
    
    [JsonPropertyName("from")]
    public string? From { get; set; }
}

public class SituationSnapshot
{
    [JsonPropertyName("mutation_id")]
    public Guid MutationId { get; set; }
    
    [JsonPropertyName("mutation_index")]
    public int MutationIndex { get; set; }
    
    [JsonPropertyName("actual_at")]
    public DateOnly ActualAt { get; set; }
    
    [JsonPropertyName("situation")]
    public SimplifiedSituation Situation { get; set; } = new();
}

public class InitialSituation
{
    [JsonPropertyName("actual_at")]
    public DateOnly ActualAt { get; set; }
    
    [JsonPropertyName("situation")]
    public SimplifiedSituation Situation { get; set; } = new();
}

public class SimplifiedSituation
{
    [JsonPropertyName("dossier")]
    public Dossier? Dossier { get; set; }
}

public class Dossier
{
    [JsonPropertyName("dossier_id")]
    public Guid DossierId { get; set; }
    
    [JsonPropertyName("status")]
    public string Status { get; set; } = "ACTIVE";
    
    [JsonPropertyName("retirement_date")]
    public DateOnly? RetirementDate { get; set; }
    
    [JsonPropertyName("persons")]
    public List<Person> Persons { get; set; } = new();
    
    [JsonPropertyName("policies")]
    public List<Policy> Policies { get; set; } = new();
}

public class Person
{
    [JsonPropertyName("person_id")]
    public Guid PersonId { get; set; }
    
    [JsonPropertyName("role")]
    public string Role { get; set; } = "PARTICIPANT";
    
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
    
    [JsonPropertyName("birth_date")]
    public DateOnly BirthDate { get; set; }
}

public class Policy
{
    [JsonPropertyName("policy_id")]
    public string PolicyId { get; set; } = string.Empty;
    
    [JsonPropertyName("scheme_id")]
    public string SchemeId { get; set; } = string.Empty;
    
    [JsonPropertyName("employment_start_date")]
    public DateOnly EmploymentStartDate { get; set; }
    
    [JsonPropertyName("salary")]
    public decimal Salary { get; set; }
    
    [JsonPropertyName("part_time_factor")]
    public decimal PartTimeFactor { get; set; }
    
    [JsonPropertyName("attainable_pension")]
    public decimal? AttainablePension { get; set; }
    
    [JsonPropertyName("projections")]
    public List<Projection>? Projections { get; set; }
}

public class Projection
{
    [JsonPropertyName("date")]
    public DateOnly Date { get; set; }
    
    [JsonPropertyName("projected_pension")]
    public decimal ProjectedPension { get; set; }
}

public class CalculationMessage
{
    [JsonPropertyName("id")]
    public int Id { get; set; }
    
    [JsonPropertyName("level")]
    public string Level { get; set; } = string.Empty;
    
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;
    
    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;
}
