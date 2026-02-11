using PensionCalculationEngine.Models;
using PensionCalculationEngine.Services.Mutations;
using Microsoft.AspNetCore.JsonPatch;
using System.Text.Json;

namespace PensionCalculationEngine.Services;

public class CalculationEngine
{
    private readonly MutationHandlerRegistry _mutationHandlerRegistry;

    public CalculationEngine(MutationHandlerRegistry mutationHandlerRegistry)
    {
        _mutationHandlerRegistry = mutationHandlerRegistry;
    }
    public async Task<CalculationResponse> ProcessRequestAsync(CalculationRequest request)
    {
        var startTime = DateTime.UtcNow;
        var calculationId = Guid.NewGuid();
        var messages = new List<CalculationMessage>();
        var processedMutations = new List<ProcessedMutation>();
        
        var situation = new SimplifiedSituation { Dossier = null };
        var initialSituationActualAt = request.CalculationInstructions.Mutations.FirstOrDefault()?.ActualAt ?? DateOnly.FromDateTime(DateTime.UtcNow);
        
        var lastSuccessfulMutationId = request.CalculationInstructions.Mutations.FirstOrDefault()?.MutationId ?? Guid.Empty;
        var lastSuccessfulMutationIndex = 0;
        var lastSuccessfulActualAt = initialSituationActualAt;
        
        // Process mutations sequentially
        for (int i = 0; i < request.CalculationInstructions.Mutations.Count; i++)
        {
            var mutation = request.CalculationInstructions.Mutations[i];
            var mutationMessages = new List<CalculationMessage>();
            var messageStartIndex = messages.Count;
            
            // Store situation before mutation for patch generation
            var situationBefore = DeepCloneSituation(situation);
            
            try
            {
                // Validate and apply mutation
                var validationResult = await ValidateAndApplyMutationAsync(mutation, situation, mutationMessages);
                
                List<JsonPatchOperation> forwardPatch;
                List<JsonPatchOperation> backwardPatch;
                
                if (validationResult.HasCriticalError)
                {
                    // Add messages to main list
                    foreach (var msg in mutationMessages)
                    {
                        msg.Id = messages.Count;
                        messages.Add(msg);
                    }
                    
                    // Generate patches even for failed mutations (situation didn't change, so patches are empty or represent no-op)
                    forwardPatch = GenerateJsonPatch(situationBefore, situationBefore); // No change
                    backwardPatch = GenerateJsonPatch(situationBefore, situationBefore); // No change
                    
                    // Add processed mutation with message indexes and patches
                    processedMutations.Add(new ProcessedMutation
                    {
                        Mutation = mutation,
                        CalculationMessageIndexes = Enumerable.Range(messageStartIndex, mutationMessages.Count).ToList(),
                        ForwardPatchToSituationAfterThisMutation = forwardPatch,
                        BackwardPatchToPreviousSituation = backwardPatch
                    });
                    
                    // Stop processing on CRITICAL error
                    break;
                }
                
                // Update situation reference
                var situationAfter = validationResult.UpdatedSituation;
                situation = situationAfter;
                
                // Generate forward JSON patch
                forwardPatch = GenerateJsonPatch(situationBefore, situationAfter);
                
                // Generate backward JSON patch (reverse of forward)
                backwardPatch = GenerateJsonPatch(situationAfter, situationBefore);
                
                // Add messages to main list
                foreach (var msg in mutationMessages)
                {
                    msg.Id = messages.Count;
                    messages.Add(msg);
                }
                
                // Update last successful mutation info
                lastSuccessfulMutationId = mutation.MutationId;
                lastSuccessfulMutationIndex = i;
                lastSuccessfulActualAt = mutation.ActualAt;
                
                // Add processed mutation with patches
                processedMutations.Add(new ProcessedMutation
                {
                    Mutation = mutation,
                    CalculationMessageIndexes = Enumerable.Range(messageStartIndex, mutationMessages.Count).ToList(),
                    ForwardPatchToSituationAfterThisMutation = forwardPatch,
                    BackwardPatchToPreviousSituation = backwardPatch
                });
            }
            catch (Exception ex)
            {
                // Unexpected error - create CRITICAL message
                var errorMessage = new CalculationMessage
                {
                    Id = messages.Count,
                    Level = "CRITICAL",
                    Code = "UNEXPECTED_ERROR",
                    Message = $"Unexpected error processing mutation: {ex.Message}"
                };
                messages.Add(errorMessage);
                
                processedMutations.Add(new ProcessedMutation
                {
                    Mutation = mutation,
                    CalculationMessageIndexes = new List<int> { errorMessage.Id }
                });
                
                break;
            }
        }
        
        var endTime = DateTime.UtcNow;
        var durationMs = (long)(endTime - startTime).TotalMilliseconds;
        
        var hasCriticalMessages = messages.Any(m => m.Level == "CRITICAL");
        
        return new CalculationResponse
        {
            CalculationMetadata = new CalculationMetadata
            {
                CalculationId = calculationId,
                TenantId = request.TenantId,
                CalculationStartedAt = startTime,
                CalculationCompletedAt = endTime,
                CalculationDurationMs = durationMs,
                CalculationOutcome = hasCriticalMessages ? "FAILURE" : "SUCCESS"
            },
            CalculationResult = new CalculationResult
            {
                Messages = messages,
                Mutations = processedMutations,
                EndSituation = new SituationSnapshot
                {
                    MutationId = lastSuccessfulMutationId,
                    MutationIndex = lastSuccessfulMutationIndex,
                    ActualAt = lastSuccessfulActualAt,
                    Situation = situation
                },
                InitialSituation = new InitialSituation
                {
                    ActualAt = initialSituationActualAt,
                    Situation = new SimplifiedSituation { Dossier = null }
                }
            }
        };
    }
    
    private async Task<(bool HasCriticalError, SimplifiedSituation UpdatedSituation)> ValidateAndApplyMutationAsync(
        CalculationMutation mutation,
        SimplifiedSituation currentSituation,
        List<CalculationMessage> messages)
    {
        var handler = _mutationHandlerRegistry.GetHandler(mutation.MutationDefinitionName);
        if (handler == null)
        {
            throw new NotSupportedException($"Unknown mutation: {mutation.MutationDefinitionName}");
        }
        
        return await handler.ValidateAndApplyAsync(mutation, currentSituation, messages);
    }
    
    private SimplifiedSituation DeepCloneSituation(SimplifiedSituation situation)
    {
        // Serialize and deserialize to create a deep copy
        var json = JsonSerializer.Serialize(situation);
        return JsonSerializer.Deserialize<SimplifiedSituation>(json) ?? new SimplifiedSituation { Dossier = null };
    }
    
    private List<JsonPatchOperation> GenerateJsonPatch(SimplifiedSituation before, SimplifiedSituation after)
    {
        var operations = new List<JsonPatchOperation>();
        
        // Serialize both situations to JSON using the same options as API responses
        // This ensures property names match (snake_case from JsonPropertyName attributes)
        // Note: We include null values to match the API response format
        var jsonOptions = new JsonSerializerOptions
        {
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never, // Include nulls to match API
            Converters = { new JsonConverters.DateOnlyJsonConverter(), new JsonConverters.NullableDateOnlyJsonConverter() }
        };
        
        var beforeJson = JsonSerializer.Serialize(before, jsonOptions);
        var afterJson = JsonSerializer.Serialize(after, jsonOptions);
        
        // Parse to JsonElement for comparison
        var beforeElement = JsonSerializer.Deserialize<JsonElement>(beforeJson);
        var afterElement = JsonSerializer.Deserialize<JsonElement>(afterJson);
        
        // Generate patch operations by comparing the two situations
        GeneratePatchOperations(beforeElement, afterElement, "", operations);
        
        return operations;
    }
    
    private void GeneratePatchOperations(JsonElement before, JsonElement after, string path, List<JsonPatchOperation> operations)
    {
        // Handle null dossier case
        if (before.ValueKind == JsonValueKind.Null && after.ValueKind != JsonValueKind.Null)
        {
            // Adding a new object
            operations.Add(new JsonPatchOperation
            {
                Op = "add",
                Path = path,
                Value = ConvertJsonElementToObject(after)
            });
            return;
        }
        
        if (before.ValueKind != JsonValueKind.Null && after.ValueKind == JsonValueKind.Null)
        {
            // Removing an object
            operations.Add(new JsonPatchOperation
            {
                Op = "remove",
                Path = path
            });
            return;
        }
        
        if (before.ValueKind == JsonValueKind.Null && after.ValueKind == JsonValueKind.Null)
        {
            // Both null, no change
            return;
        }
        
        // Compare objects
        if (before.ValueKind == JsonValueKind.Object && after.ValueKind == JsonValueKind.Object)
        {
            var beforeProps = new HashSet<string>();
            foreach (var prop in before.EnumerateObject())
            {
                beforeProps.Add(prop.Name);
            }
            
            var afterProps = new HashSet<string>();
            foreach (var prop in after.EnumerateObject())
            {
                afterProps.Add(prop.Name);
            }
            
            // Properties removed
            foreach (var prop in beforeProps)
            {
                if (!afterProps.Contains(prop))
                {
                    var propPath = string.IsNullOrEmpty(path) ? $"/{prop}" : $"{path}/{prop}";
                    operations.Add(new JsonPatchOperation
                    {
                        Op = "remove",
                        Path = propPath
                    });
                }
            }
            
            // Properties added or modified
            foreach (var prop in afterProps)
            {
                var propPath = string.IsNullOrEmpty(path) ? $"/{prop}" : $"{path}/{prop}";
                
                if (!beforeProps.Contains(prop))
                {
                    // New property
                    operations.Add(new JsonPatchOperation
                    {
                        Op = "add",
                        Path = propPath,
                        Value = ConvertJsonElementToObject(after.GetProperty(prop))
                    });
                }
                else
                {
                    // Property exists in both, compare values
                    var beforeValue = before.GetProperty(prop);
                    var afterValue = after.GetProperty(prop);
                    
                    if (!JsonElementEquals(beforeValue, afterValue))
                    {
                        if (beforeValue.ValueKind == JsonValueKind.Object && afterValue.ValueKind == JsonValueKind.Object)
                        {
                            // Recursively compare nested objects
                            GeneratePatchOperations(beforeValue, afterValue, propPath, operations);
                        }
                        else if (beforeValue.ValueKind == JsonValueKind.Array && afterValue.ValueKind == JsonValueKind.Array)
                        {
                            // Handle arrays
                            GenerateArrayPatchOperations(beforeValue, afterValue, propPath, operations);
                        }
                        else
                        {
                            // Replace value
                            operations.Add(new JsonPatchOperation
                            {
                                Op = "replace",
                                Path = propPath,
                                Value = ConvertJsonElementToObject(afterValue)
                            });
                        }
                    }
                }
            }
        }
        else if (before.ValueKind == JsonValueKind.Array && after.ValueKind == JsonValueKind.Array)
        {
            GenerateArrayPatchOperations(before, after, path, operations);
        }
        else if (!JsonElementEquals(before, after))
        {
            // Replace value
            operations.Add(new JsonPatchOperation
            {
                Op = "replace",
                Path = path,
                Value = ConvertJsonElementToObject(after)
            });
        }
    }
    
    private void GenerateArrayPatchOperations(JsonElement before, JsonElement after, string path, List<JsonPatchOperation> operations)
    {
        var beforeArray = before.EnumerateArray().ToList();
        var afterArray = after.EnumerateArray().ToList();
        
        // Simple approach: remove all, then add all
        // This is not optimal but works correctly
        for (int i = beforeArray.Count - 1; i >= 0; i--)
        {
            operations.Add(new JsonPatchOperation
            {
                Op = "remove",
                Path = $"{path}/{i}"
            });
        }
        
        for (int i = 0; i < afterArray.Count; i++)
        {
            operations.Add(new JsonPatchOperation
            {
                Op = "add",
                Path = $"{path}/{i}",
                Value = ConvertJsonElementToObject(afterArray[i])
            });
        }
    }
    
    private object? ConvertJsonElementToObject(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.GetDecimal(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            JsonValueKind.Array => element.EnumerateArray().Select(ConvertJsonElementToObject).ToList(),
            JsonValueKind.Object => element.EnumerateObject().ToDictionary(p => p.Name, p => ConvertJsonElementToObject(p.Value)),
            _ => element.GetRawText()
        };
    }
    
    private bool JsonElementEquals(JsonElement a, JsonElement b)
    {
        if (a.ValueKind != b.ValueKind)
            return false;
        
        return a.GetRawText() == b.GetRawText();
    }
}
