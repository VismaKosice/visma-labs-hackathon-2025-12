using PensionCalculationEngine.Models;
using System.Text.Json;

namespace PensionCalculationEngine.Services.Mutations;

/// <summary>
/// Base class for mutation handlers providing common utility methods for property extraction.
/// </summary>
public abstract class BaseMutationHandler : IMutationHandler
{
    public abstract string MutationName { get; }
    
    public abstract Task<(bool HasCriticalError, SimplifiedSituation UpdatedSituation)> ValidateAndApplyAsync(
        CalculationMutation mutation,
        SimplifiedSituation currentSituation,
        List<CalculationMessage> messages);
    
    /// <summary>
    /// Helper method to extract string values from mutation properties, handling JsonElement deserialization.
    /// </summary>
    protected string GetStringValue(Dictionary<string, object> properties, string key)
    {
        var value = properties[key];
        if (value is JsonElement jsonElement)
            return jsonElement.GetString() ?? string.Empty;
        return value?.ToString() ?? string.Empty;
    }
    
    /// <summary>
    /// Helper method to extract nullable string values from mutation properties.
    /// </summary>
    protected string? GetStringValueOrNull(Dictionary<string, object> properties, string key)
    {
        if (!properties.ContainsKey(key))
            return null;
        
        var value = properties[key];
        if (value is JsonElement jsonElement)
        {
            if (jsonElement.ValueKind == JsonValueKind.Null)
                return null;
            return jsonElement.GetString();
        }
        return value?.ToString();
    }
    
    /// <summary>
    /// Helper method to extract decimal values from mutation properties.
    /// </summary>
    protected decimal GetDecimalValue(Dictionary<string, object> properties, string key)
    {
        var value = properties[key];
        if (value is JsonElement jsonElement)
        {
            if (jsonElement.ValueKind == JsonValueKind.Number)
                return jsonElement.GetDecimal();
            if (jsonElement.ValueKind == JsonValueKind.String)
                return decimal.Parse(jsonElement.GetString()!);
        }
        return Convert.ToDecimal(value);
    }
    
    /// <summary>
    /// Helper method to extract integer values from mutation properties.
    /// </summary>
    protected int GetIntValue(Dictionary<string, object> properties, string key)
    {
        var value = properties[key];
        if (value is JsonElement jsonElement)
        {
            if (jsonElement.ValueKind == JsonValueKind.Number)
                return jsonElement.GetInt32();
            if (jsonElement.ValueKind == JsonValueKind.String)
                return int.Parse(jsonElement.GetString()!);
        }
        return Convert.ToInt32(value);
    }
    
    /// <summary>
    /// Helper method to extract DateOnly values from mutation properties.
    /// </summary>
    protected DateOnly GetDateValue(Dictionary<string, object> properties, string key)
    {
        return DateOnly.Parse(GetStringValue(properties, key));
    }
    
    /// <summary>
    /// Helper method to extract nullable DateOnly values from mutation properties.
    /// </summary>
    protected DateOnly? GetDateValueOrNull(Dictionary<string, object> properties, string key)
    {
        var strValue = GetStringValueOrNull(properties, key);
        if (string.IsNullOrEmpty(strValue))
            return null;
        return DateOnly.Parse(strValue);
    }
}
